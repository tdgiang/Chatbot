import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AiService } from '../ai/ai.service';

export const INDEXING_QUEUE = 'indexing';

export interface IndexingJob {
  documentId: string;
  filePath: string;
  mimeType: string;
}

function chunkText(text: string, chunkSize = 2000, overlap = 200): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      // overlap: keep last `overlap` chars of current
      current = current.slice(-overlap) + '\n\n' + para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function parseFile(filePath: string, mimeType: string): Promise<string> {
  if (mimeType === 'text/plain') {
    return fs.readFile(filePath, 'utf-8');
  }
  if (mimeType === 'application/pdf') {
    const buffer = await fs.readFile(filePath);
    // Import from lib directly to avoid pdf-parse v1 auto-loading test file on require()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (buf: Buffer) => Promise<{ text: string }>;
    const result = await pdfParse(buffer);
    return result.text;
  }
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }
  throw new Error(`Unsupported MIME type: ${mimeType}`);
}

@Processor(INDEXING_QUEUE)
export class DocumentsProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {
    super();
  }

  async process(job: Job<IndexingJob>): Promise<void> {
    const { documentId, filePath, mimeType } = job.data;

    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: 'PROCESSING' },
    });

    try {
      const text = await parseFile(filePath, mimeType);
      const chunks = chunkText(text);

      let inserted = 0;
      for (let i = 0; i < chunks.length; i++) {
        const embedding = await this.ai.embed(chunks[i]);
        const vectorLiteral = embedding.length > 0 ? `[${embedding.join(',')}]` : null;

        if (vectorLiteral) {
          await this.prisma.$executeRaw`
            INSERT INTO chunks (id, "documentId", content, "chunkIndex", embedding, "createdAt")
            VALUES (
              gen_random_uuid()::text,
              ${documentId},
              ${chunks[i]},
              ${i},
              ${vectorLiteral}::vector,
              NOW()
            )
          `;
        } else {
          await this.prisma.chunk.create({
            data: { documentId, content: chunks[i], chunkIndex: i },
          });
        }
        inserted++;
      }

      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'DONE', chunkCount: inserted },
      });

      this.logger.log(`Indexed document ${documentId}: ${inserted} chunks`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to index document ${documentId}: ${message}`);
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'FAILED', errorMessage: message },
      });
    }
  }
}
