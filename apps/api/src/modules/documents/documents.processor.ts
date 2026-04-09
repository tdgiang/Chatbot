import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import * as fs from 'fs/promises';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { cleanText } from './lib/text-cleaner';
import { structuralSplit } from './lib/structural-splitter';
import { QaNormalizer } from './lib/qa-normalizer';

export const INDEXING_QUEUE = 'indexing';

export interface IndexingJob {
  documentId: string;
  filePath: string;
  mimeType: string;
}

interface ChunkToInsert {
  content: string;
  sourceSection: string | null;
  chunkType: string;
}

// Legacy raw chunking — kept for CHUNK_MODE=raw backward compatibility
function chunkTextRaw(text: string, chunkSize = 2000, overlap = 200): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
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
      // Step 1: Parse file
      const rawText = await parseFile(filePath, mimeType);

      // Step 2: Always clean text (remove PDF noise)
      const cleaned = cleanText(rawText);

      // Step 3: Build chunks according to CHUNK_MODE
      const chunkMode = process.env.CHUNK_MODE ?? 'qa';
      this.logger.log(`Indexing document ${documentId} with CHUNK_MODE=${chunkMode}`);

      const chunksToInsert: ChunkToInsert[] = await this.buildChunks(cleaned, chunkMode);

      if (chunksToInsert.length === 0) {
        throw new Error('No chunks produced — document may be empty or unreadable after cleaning.');
      }

      // Step 4: Embed and insert
      let inserted = 0;
      for (let i = 0; i < chunksToInsert.length; i++) {
        const { content, sourceSection, chunkType } = chunksToInsert[i];
        // nomic-embed-text requires "search_document:" prefix for document chunks
        const embedding = await this.ai.embed(`search_document: ${content}`);
        const vectorLiteral = embedding.length > 0 ? `[${embedding.join(',')}]` : null;

        if (vectorLiteral) {
          await this.prisma.$executeRaw`
            INSERT INTO chunks (
              id, "documentId", content, "chunkIndex", embedding,
              "sourceSection", "chunkType", "isEnabled", "createdAt", "updatedAt"
            ) VALUES (
              gen_random_uuid()::text,
              ${documentId},
              ${content},
              ${i},
              ${vectorLiteral}::vector,
              ${sourceSection},
              ${chunkType},
              true,
              NOW(),
              NOW()
            )
          `;
        } else {
          await this.prisma.chunk.create({
            data: {
              documentId,
              content,
              chunkIndex: i,
              sourceSection: sourceSection ?? undefined,
              chunkType,
            },
          });
        }
        inserted++;
      }

      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'DONE', chunkCount: inserted },
      });

      this.logger.log(`Indexed document ${documentId}: ${inserted} chunks (mode=${chunkMode})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to index document ${documentId}: ${message}`);
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'FAILED', errorMessage: message },
      });
    }
  }

  private async buildChunks(cleaned: string, chunkMode: string): Promise<ChunkToInsert[]> {
    if (chunkMode === 'raw') {
      const texts = chunkTextRaw(cleaned);
      return texts.map((t) => ({ content: t, sourceSection: null, chunkType: 'raw' }));
    }

    // Both 'structural' and 'qa' modes start with structural split
    const blocks = structuralSplit(cleaned);
    this.logger.log(`Structural split produced ${blocks.length} blocks`);

    if (chunkMode === 'structural') {
      return blocks
        .filter((b) => b.content.trim().length > 0)
        .map((b) => {
          const sectionLabel = [...b.breadcrumb, b.heading].filter(Boolean).join(' > ');
          const content = sectionLabel
            ? `[${sectionLabel}]\n\n${b.content}`
            : b.content;
          return { content, sourceSection: sectionLabel || null, chunkType: 'structural' };
        });
    }

    // 'qa' mode: run LLM Q&A normalization with fallback to structural
    const normalizer = new QaNormalizer(this.ai);
    const qaChunks = await normalizer.normalize(blocks);
    return qaChunks.map((q) => ({
      content: q.content,
      sourceSection: q.sourceSection || null,
      chunkType: q.chunkType,
    }));
  }
}
