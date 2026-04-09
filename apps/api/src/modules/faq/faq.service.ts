import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType, BorderStyle, TableRow, TableCell, Table, WidthType } from 'docx';
import * as mammoth from 'mammoth';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';
import { FaqQueryDto } from './dto/faq-query.dto';

// nomic-embed-text (no prefix) KHÔNG phân biệt các câu hỏi cùng domain dù khác topic:
//   - exact match: 0.0000
//   - wrong FAQ cùng trường (Học Phí vs Sứ mạng): 0.0116 — quá gần!
// Threshold 0.01: chỉ match near-exact query, còn lại đi RAG (tốt hơn false match)
const FAQ_THRESHOLD = 0.01;

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
    // nomic-embed-text no-prefix mode: exact match ≈ 0, wrong-topic ≈ 0.086
    // Không dùng prefix để giữ gap đủ lớn cho threshold 0.07
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
  // Import từ DOCX
  // ---------------------------------------------------------------------------

  /**
   * Parse DOCX FAQ template và tạo hàng loạt FAQ entries.
   * Quy ước: Heading 2 = câu hỏi, đoạn thường bên dưới = câu trả lời.
   */
  async importFromDocx(buffer: Buffer, knowledgeBaseId: string) {
    const kb = await this.prisma.knowledgeBase.findUnique({ where: { id: knowledgeBaseId } });
    if (!kb) throw new BadRequestException('KnowledgeBase không tồn tại');

    const { value: html } = await mammoth.convertToHtml({ buffer });
    const pairs = parseDocxHtml(html);

    if (pairs.length === 0) {
      throw new BadRequestException(
        'Không tìm thấy cặp Q&A nào. Kiểm tra định dạng: câu hỏi phải dùng style "Heading 2" trong Word.',
      );
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const { question, answer } of pairs) {
      try {
        await this.create({ knowledgeBaseId, question, answer });
        imported++;
      } catch (err) {
        skipped++;
        errors.push(`"${question.slice(0, 40)}...": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    this.logger.log(`FAQ import (docx): ${imported} imported, ${skipped} skipped from ${pairs.length} pairs`);
    return { imported, skipped, total: pairs.length, errors: errors.slice(0, 5) };
  }

  /** Tạo file .docx mẫu để người dùng tải về và nhập dữ liệu */
  async generateTemplateDocx(): Promise<Buffer> {
    const faqSamples = [
      {
        question: 'Điều kiện sức khỏe để tham gia tuyển sinh vào các trường CAND là gì?',
        answer: [
          'Thí sinh phải đạt tiêu chuẩn sức khỏe loại 1 hoặc loại 2 theo quy định của Bộ Công an. Cụ thể:',
          'Nam: Chiều cao từ 1m64 trở lên, cân nặng từ 53kg trở lên.',
          'Nữ: Chiều cao từ 1m58 trở lên, cân nặng từ 48kg trở lên.',
          'Không mắc các bệnh mãn tính, bệnh lây nhiễm, thị lực đạt yêu cầu.',
          'Thí sinh sẽ được kiểm tra sức khỏe tại cơ sở y tế được Bộ Công an chỉ định trong quá trình sơ tuyển.',
        ],
      },
      {
        question: 'Hồ sơ tuyển sinh vào trường CAND gồm những giấy tờ gì?',
        answer: [
          'Hồ sơ tuyển sinh bao gồm các giấy tờ sau:',
          '1. Đơn xin dự tuyển (theo mẫu của Bộ Công an).',
          '2. Phiếu đăng ký tuyển sinh (in từ phần mềm tuyển sinh).',
          '3. Bản sao có chứng thực: Căn cước công dân, Bằng tốt nghiệp THPT, Học bạ THPT.',
          '4. Giấy khai sinh (bản sao có chứng thực).',
          '5. Lý lịch tự khai (có xác nhận của địa phương).',
          '6. Giấy khám sức khỏe (do cơ sở y tế được chỉ định cấp).',
        ],
      },
      {
        question: 'Thời gian đăng ký sơ tuyển trực tuyến là khi nào?',
        answer: [
          'Thí sinh đăng ký sơ tuyển trực tuyến trên Cổng thông tin tuyển sinh của Bộ Công an từ tháng 3 đến tháng 4 hằng năm.',
          'Sau khi đăng ký online, thí sinh nộp hồ sơ giấy tại Công an tỉnh/thành phố nơi đăng ký hộ khẩu thường trú.',
        ],
      },
      {
        question: 'Học viện CSND đào tạo những ngành nào?',
        answer: [
          'Học viện Cảnh sát nhân dân đào tạo các ngành chính:',
          '- An ninh điều tra (mã ngành: 8310301)',
          '- Cảnh sát kinh tế (mã ngành: 8310302)',
          '- Cảnh sát hình sự (mã ngành: 8310303)',
          '- Cảnh sát phòng cháy chữa cháy (mã ngành: 8310304)',
          '- Luật (mã ngành: 7380101) — hệ dân sự',
        ],
      },
    ];

    const children: Paragraph[] = [
      // Title
      new Paragraph({
        text: 'FAQ Template — Chatbot Hỗ Trợ Tuyển Sinh',
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({ text: '' }),

      // Instructions table
      new Paragraph({
        children: [
          new TextRun({ text: 'HƯỚNG DẪN SỬ DỤNG FILE MẪU', bold: true }),
        ],
      }),
      new Paragraph({
        children: [new TextRun({ text: '• Câu hỏi: dùng style "Heading 2" (Ctrl+Alt+2 trong Word).' })],
      }),
      new Paragraph({
        children: [new TextRun({ text: '• Câu trả lời: viết bên dưới, dùng đoạn văn thông thường (Normal).' })],
      }),
      new Paragraph({
        children: [new TextRun({ text: '• Tối đa 500 ký tự cho câu hỏi, 5000 ký tự cho câu trả lời.' })],
      }),
      new Paragraph({
        children: [new TextRun({ text: '• Xóa các câu hỏi mẫu và thay bằng nội dung thực tế của bạn.' })],
      }),
      new Paragraph({ text: '' }),
      new Paragraph({
        children: [new TextRun({ text: '─────────────────────────────────────────', color: 'AAAAAA' })],
      }),
      new Paragraph({ text: '' }),
    ];

    // Add FAQ samples
    for (const faq of faqSamples) {
      children.push(
        new Paragraph({ text: faq.question, heading: HeadingLevel.HEADING_2 }),
      );
      for (const line of faq.answer) {
        children.push(new Paragraph({ children: [new TextRun({ text: line })] }));
      }
      children.push(new Paragraph({ text: '' }));
    }

    const doc = new Document({ sections: [{ children }] });
    return Buffer.from(await Packer.toBuffer(doc));
  }

  // ---------------------------------------------------------------------------
  // Lookup — called by ChatService before RAG
  // ---------------------------------------------------------------------------

  async lookup(question: string, knowledgeBaseId: string): Promise<{ id: string; answer: string } | null> {
    // no-prefix symmetric embedding: exact match ≈ 0, wrong-topic ≈ 0.086, threshold 0.07
    const embedding = await this.ai.embed(question);
    if (embedding.length === 0) return null;

    const faqs = await this.prisma.faqOverride.findMany({
      where: { knowledgeBaseId, isActive: true, questionEmbed: { not: null } },
      select: { id: true, answer: true, priority: true, questionEmbed: true },
    });

    if (faqs.length === 0) return null;

    let best: { id: string; answer: string; distance: number; priority: number } | null = null;

    for (const faq of faqs) {
      const storedEmbed = JSON.parse(Buffer.from(faq.questionEmbed!).toString()) as number[];
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
// Parse mammoth HTML output → array of { question, answer }
// Convention: <h2> = question, subsequent <p>/<ul>/<ol> = answer
// ---------------------------------------------------------------------------
function parseDocxHtml(html: string): Array<{ question: string; answer: string }> {
  const pairs: Array<{ question: string; answer: string }> = [];

  // Split by <h2> tags
  const segments = html.split(/<h2>/i);
  for (const segment of segments.slice(1)) {
    const h2End = segment.indexOf('</h2>');
    if (h2End === -1) continue;

    const question = stripHtmlTags(segment.slice(0, h2End)).trim();
    const rest = segment.slice(h2End + 5); // after </h2>

    // Collect all text until next heading (h1/h2/h3)
    const nextHeading = rest.search(/<h[123]/i);
    const answerHtml = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
    const answer = htmlToPlainText(answerHtml).trim();

    if (question.length >= 5 && answer.length >= 5) {
      pairs.push({ question, answer });
    }
  }

  return pairs;
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
