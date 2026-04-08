import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { ChunkQueryDto } from './dto/chunk-query.dto';
import { CreateChunkDto } from './dto/create-chunk.dto';
import { UpdateChunkDto } from './dto/update-chunk.dto';

@Injectable()
export class ChunksService {
  private readonly logger = new Logger(ChunksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async list(documentId: string, query: ChunkQueryDto) {
    await this.verifyDocument(documentId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      this.prisma.$queryRaw<Array<{
        id: string; documentId: string; content: string; chunkIndex: number;
        isEnabled: boolean; sourceSection: string | null; chunkType: string;
        createdAt: Date; updatedAt: Date; hasEmbedding: boolean;
      }>>`
        SELECT id, "documentId", content, "chunkIndex", "isEnabled",
               "sourceSection", "chunkType", "createdAt", "updatedAt",
               (embedding IS NOT NULL) AS "hasEmbedding"
        FROM chunks
        WHERE "documentId" = ${documentId}
        ORDER BY "chunkIndex" ASC
        LIMIT ${limit} OFFSET ${skip}
      `,
      this.prisma.chunk.count({ where: { documentId } }),
    ]);

    return {
      data: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(documentId: string, chunkId: string) {
    await this.verifyDocument(documentId);
    return this.verifyChunk(documentId, chunkId);
  }

  async create(documentId: string, dto: CreateChunkDto) {
    const doc = await this.verifyDocument(documentId);
    if (doc.status === 'PROCESSING') {
      throw new ConflictException('Tài liệu đang được xử lý. Vui lòng thử lại sau.');
    }

    const agg = await this.prisma.chunk.aggregate({
      where: { documentId },
      _max: { chunkIndex: true },
    });
    const nextIndex = (agg._max.chunkIndex ?? -1) + 1;

    const embedding = await this.ai.embed(dto.content);
    const vectorLiteral = embedding.length > 0 ? `[${embedding.join(',')}]` : null;

    let chunkId: string;
    if (vectorLiteral) {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO chunks (id, "documentId", content, "chunkIndex", "isEnabled", "chunkType", embedding, "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, ${documentId}, ${dto.content}, ${nextIndex}, true, 'manual', ${vectorLiteral}::vector, NOW(), NOW())
        RETURNING id
      `;
      chunkId = rows[0].id;
    } else {
      this.logger.warn(`Embed failed for new chunk in document ${documentId}, saving without embedding`);
      const chunk = await this.prisma.chunk.create({
        data: { documentId, content: dto.content, chunkIndex: nextIndex, chunkType: 'manual' },
      });
      chunkId = chunk.id;
    }

    await this.prisma.document.update({
      where: { id: documentId },
      data: { chunkCount: { increment: 1 } },
    });

    return this.findOne(documentId, chunkId);
  }

  async update(documentId: string, chunkId: string, dto: UpdateChunkDto) {
    const doc = await this.verifyDocument(documentId);
    if (doc.status === 'PROCESSING') {
      throw new ConflictException('Tài liệu đang được xử lý. Vui lòng thử lại sau.');
    }
    await this.verifyChunk(documentId, chunkId);

    const embedding = await this.ai.embed(dto.content);
    if (embedding.length > 0) {
      const vectorLiteral = `[${embedding.join(',')}]`;
      await this.prisma.$executeRaw`
        UPDATE chunks
        SET content = ${dto.content}, embedding = ${vectorLiteral}::vector, "updatedAt" = NOW()
        WHERE id = ${chunkId}
      `;
    } else {
      this.logger.warn(`Embed failed for chunk ${chunkId}, updating content only`);
      await this.prisma.$executeRaw`
        UPDATE chunks SET content = ${dto.content}, "updatedAt" = NOW() WHERE id = ${chunkId}
      `;
    }

    return this.findOne(documentId, chunkId);
  }

  async toggle(documentId: string, chunkId: string) {
    await this.verifyDocument(documentId);
    const chunk = await this.verifyChunk(documentId, chunkId);
    await this.prisma.$executeRaw`
      UPDATE chunks SET "isEnabled" = ${!chunk.isEnabled}, "updatedAt" = NOW() WHERE id = ${chunkId}
    `;
    return this.findOne(documentId, chunkId);
  }

  async remove(documentId: string, chunkId: string) {
    await this.verifyDocument(documentId);
    await this.verifyChunk(documentId, chunkId);
    await this.prisma.chunk.delete({ where: { id: chunkId } });
    await this.prisma.document.update({
      where: { id: documentId },
      data: { chunkCount: { decrement: 1 } },
    });
    return { success: true };
  }

  // --- helpers ---

  private async verifyDocument(documentId: string) {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Tài liệu không tồn tại');
    return doc;
  }

  private async verifyChunk(documentId: string, chunkId: string) {
    const rows = await this.prisma.$queryRaw<Array<{
      id: string; documentId: string; content: string; chunkIndex: number;
      isEnabled: boolean; sourceSection: string | null; chunkType: string;
      createdAt: Date; updatedAt: Date; hasEmbedding: boolean;
    }>>`
      SELECT id, "documentId", content, "chunkIndex", "isEnabled",
             "sourceSection", "chunkType", "createdAt", "updatedAt",
             (embedding IS NOT NULL) AS "hasEmbedding"
      FROM chunks WHERE id = ${chunkId} AND "documentId" = ${documentId}
    `;
    if (rows.length === 0) throw new NotFoundException('Chunk không tồn tại');
    const r = rows[0];
    return { ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() };
  }
}
