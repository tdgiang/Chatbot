import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as fs from 'fs/promises';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { INDEXING_QUEUE, IndexingJob } from './documents.processor';

const ALLOWED_MIMES = new Set([
  'text/plain',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(INDEXING_QUEUE) private readonly queue: Queue<IndexingJob>,
  ) {}

  async upload(file: Express.Multer.File, knowledgeBaseId: string) {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      throw new BadRequestException('Only PDF, DOCX, and TXT files are allowed');
    }

    const kb = await this.prisma.knowledgeBase.findUnique({ where: { id: knowledgeBaseId } });
    if (!kb) throw new NotFoundException('KnowledgeBase not found');

    const doc = await this.prisma.document.create({
      data: {
        knowledgeBaseId,
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        status: 'PENDING',
      },
    });

    await this.queue.add('index', {
      documentId: doc.id,
      filePath: file.path,
      mimeType: file.mimetype,
    });

    return doc;
  }

  async list(knowledgeBaseId?: string) {
    return this.prisma.document.findMany({
      where: knowledgeBaseId ? { knowledgeBaseId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStatus(id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    return { id: doc.id, status: doc.status, chunkCount: doc.chunkCount, errorMessage: doc.errorMessage };
  }

  async reindex(id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');

    const filePath = `${process.env.UPLOAD_DIR ?? './uploads'}/${doc.filename}`;

    // Delete old chunks
    await this.prisma.chunk.deleteMany({ where: { documentId: id } });

    // Reset status
    await this.prisma.document.update({
      where: { id },
      data: { status: 'PENDING', chunkCount: 0, errorMessage: null },
    });

    // Re-queue indexing job
    await this.queue.add('index', {
      documentId: doc.id,
      filePath,
      mimeType: doc.mimeType,
    });

    return { id: doc.id, status: 'PENDING' };
  }

  async remove(id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');

    // Delete file from disk
    try {
      await fs.unlink(`${process.env.UPLOAD_DIR ?? './uploads'}/${doc.filename}`);
    } catch { /* file may not exist */ }

    await this.prisma.document.delete({ where: { id } });
    return { success: true };
  }
}
