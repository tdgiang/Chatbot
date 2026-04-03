import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { ChatMessage } from '@chatbot/shared-types';

// Redis client injected via token
import { InjectRedis } from '@nestjs-modules/ioredis';
import type Redis from 'ioredis';

const EMBED_TTL = 60 * 5; // 5 minutes

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async search(question: string, knowledgeBaseId: string): Promise<string[]> {
    const embedding = await this.getEmbedding(question);
    if (embedding.length === 0) return [];

    const vectorLiteral = `[${embedding.join(',')}]`;

    // Raw SQL: join chunks → documents → filter by knowledgeBaseId, order by cosine distance
    const rows = await this.prisma.$queryRaw<{ content: string }[]>`
      SELECT c.content
      FROM chunks c
      JOIN documents d ON c."documentId" = d.id
      WHERE d."knowledgeBaseId" = ${knowledgeBaseId}
        AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> ${vectorLiteral}::vector
      LIMIT 5
    `;

    return rows.map((r) => r.content);
  }

  buildPrompt(
    systemPrompt: string,
    chunks: string[],
    history: ChatMessage[],
    question: string,
  ): ChatMessage[] {
    const contextBlock = chunks.length > 0
      ? `\n---\nThông tin tham khảo:\n${chunks.join('\n\n')}\n---`
      : '';

    const system = `${systemPrompt}${contextBlock}`;
    const messages: ChatMessage[] = [{ role: 'USER', content: system }];

    // Last 3 history messages
    const recentHistory = history.slice(-6); // 3 pairs (USER+ASSISTANT)
    messages.push(...recentHistory);
    messages.push({ role: 'USER', content: question });

    return messages;
  }

  private async getEmbedding(text: string): Promise<number[]> {
    const key = `embed:${createHash('sha256').update(text).digest('hex')}`;
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached) as number[];

    const embedding = await this.ai.embed(text);
    if (embedding.length > 0) {
      await this.redis.set(key, JSON.stringify(embedding), 'EX', EMBED_TTL);
    }
    return embedding;
  }
}
