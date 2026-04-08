import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { ChatMessage } from '@chatbot/shared-types';

// Redis client injected via token
import { InjectRedis } from '@nestjs-modules/ioredis';
import type Redis from 'ioredis';

const EMBED_TTL = 60 * 5; // 5 minutes
const SIMILARITY_THRESHOLD = 0.365; // cosine distance — loại chunks không liên quan
const NO_CONTEXT_REPLY = 'Xin lỗi, tôi không tìm thấy thông tin liên quan đến câu hỏi của bạn trong tài liệu. Vui lòng liên hệ trực tiếp để được hỗ trợ.';

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

    const rows = await this.prisma.$queryRaw<{ content: string; distance: number }[]>`
      SELECT c.content, c.embedding <=> ${vectorLiteral}::vector AS distance
      FROM chunks c
      JOIN documents d ON c."documentId" = d.id
      WHERE d."knowledgeBaseId" = ${knowledgeBaseId}
        AND c.embedding IS NOT NULL
        AND c."isEnabled" = true
      ORDER BY distance
      LIMIT 5
    `;

    const relevant = rows.filter((r) => r.distance <= SIMILARITY_THRESHOLD);
    this.logger.log(
      `RAG search: ${rows.length} candidates, ${relevant.length} above threshold (≤${SIMILARITY_THRESHOLD}). ` +
      `Top distance: ${rows[0]?.distance?.toFixed(4) ?? 'n/a'}`,
    );

    return relevant.map((r) => r.content);
  }

  get noContextReply(): string {
    return NO_CONTEXT_REPLY;
  }

  buildPrompt(
    systemPrompt: string,
    chunks: string[],
    history: ChatMessage[],
    question: string,
  ): ChatMessage[] {
    const contextBlock = `\n\n---\nTÀI LIỆU THAM KHẢO:\n${chunks.join('\n\n')}\n---\n\nQUY TẮC BẮT BUỘC:\n- Chỉ trả lời dựa trên TÀI LIỆU THAM KHẢO ở trên.\n- Nếu câu hỏi không có trong tài liệu, trả lời: "${NO_CONTEXT_REPLY}"\n- Tuyệt đối không suy đoán hoặc thêm thông tin ngoài tài liệu.`;

    const system = `${systemPrompt}${contextBlock}`;
    const messages: ChatMessage[] = [{ role: 'SYSTEM', content: system }];

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
