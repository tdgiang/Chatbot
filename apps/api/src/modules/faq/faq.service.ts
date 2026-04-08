import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';
import { FaqQueryDto } from './dto/faq-query.dto';

const FAQ_THRESHOLD = 0.15; // tighter than RAG (0.365) — need near-exact match

@Injectable()
export class FaqService {
  private readonly logger = new Logger(FaqService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async list(query: FaqQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = query.knowledgeBaseId ? { knowledgeBaseId: query.knowledgeBaseId } : {};

    const [rows, total] = await Promise.all([
      this.prisma.faqOverride.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
        select: {
          id: true,
          knowledgeBaseId: true,
          question: true,
          answer: true,
          isActive: true,
          priority: true,
          matchCount: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.faqOverride.count({ where }),
    ]);

    return {
      data: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(dto: CreateFaqDto) {
    const embedding = await this.ai.embed(dto.question);
    const questionEmbed = embedding.length > 0
      ? Buffer.from(JSON.stringify(embedding))
      : null;

    if (!questionEmbed) {
      this.logger.warn(`Embed failed for new FAQ question: "${dto.question.slice(0, 50)}"`);
    }

    const faq = await this.prisma.faqOverride.create({
      data: {
        knowledgeBaseId: dto.knowledgeBaseId,
        question: dto.question,
        answer: dto.answer,
        priority: dto.priority ?? 0,
        questionEmbed,
      },
    });

    return this.toDto(faq);
  }

  async update(id: string, dto: UpdateFaqDto) {
    const existing = await this.findOrThrow(id);

    let questionEmbed = existing.questionEmbed ?? null;

    // Re-embed only if question changed
    if (dto.question && dto.question !== existing.question) {
      const embedding = await this.ai.embed(dto.question);
      questionEmbed = embedding.length > 0
        ? Buffer.from(JSON.stringify(embedding))
        : null;
      if (!questionEmbed) {
        this.logger.warn(`Re-embed failed for FAQ ${id}`);
      }
    }

    const updated = await this.prisma.faqOverride.update({
      where: { id },
      data: {
        ...(dto.question !== undefined && { question: dto.question, questionEmbed }),
        ...(dto.answer !== undefined && { answer: dto.answer }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
      },
    });

    return this.toDto(updated);
  }

  async toggle(id: string) {
    const faq = await this.findOrThrow(id);
    const updated = await this.prisma.faqOverride.update({
      where: { id },
      data: { isActive: !faq.isActive },
    });
    return this.toDto(updated);
  }

  async remove(id: string) {
    await this.findOrThrow(id);
    await this.prisma.faqOverride.delete({ where: { id } });
    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Lookup — called by ChatService before RAG
  // ---------------------------------------------------------------------------

  async lookup(question: string, knowledgeBaseId: string): Promise<{ id: string; answer: string } | null> {
    const embedding = await this.ai.embed(question);
    if (embedding.length === 0) return null;

    const faqs = await this.prisma.faqOverride.findMany({
      where: { knowledgeBaseId, isActive: true, questionEmbed: { not: null } },
      select: { id: true, answer: true, priority: true, questionEmbed: true },
    });

    if (faqs.length === 0) return null;

    let best: { id: string; answer: string; distance: number; priority: number } | null = null;

    for (const faq of faqs) {
      const storedEmbed = JSON.parse(faq.questionEmbed!.toString()) as number[];
      const distance = cosineDist(embedding, storedEmbed);

      if (distance <= FAQ_THRESHOLD) {
        if (
          best === null ||
          distance < best.distance ||
          (distance === best.distance && faq.priority > best.priority)
        ) {
          best = { id: faq.id, answer: faq.answer, distance, priority: faq.priority };
        }
      }
    }

    if (!best) return null;

    // Increment matchCount asynchronously — don't block response
    this.prisma.faqOverride.update({
      where: { id: best.id },
      data: { matchCount: { increment: 1 } },
    }).catch((err: unknown) => this.logger.error(`matchCount update failed: ${String(err)}`));

    this.logger.log(`FAQ match: id=${best.id} distance=${best.distance.toFixed(4)}`);
    return { id: best.id, answer: best.answer };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async findOrThrow(id: string) {
    const faq = await this.prisma.faqOverride.findUnique({ where: { id } });
    if (!faq) throw new NotFoundException('FAQ không tồn tại');
    return faq;
  }

  private toDto(faq: {
    id: string; knowledgeBaseId: string; question: string; answer: string;
    isActive: boolean; priority: number; matchCount: number;
    createdAt: Date; updatedAt: Date;
  }) {
    return {
      ...faq,
      createdAt: faq.createdAt.toISOString(),
      updatedAt: faq.updatedAt.toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// Pure util — cosine distance in [0, 2]
// ---------------------------------------------------------------------------
function cosineDist(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 2; // max distance
  return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
