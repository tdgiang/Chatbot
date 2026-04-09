import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { ChatMessage } from '@chatbot/shared-types';

// Redis client injected via token
import { InjectRedis } from '@nestjs-modules/ioredis';
import type Redis from 'ioredis';

const EMBED_TTL = 60 * 5; // 5 minutes
const RAG_RESULT_TTL = 60 * 2; // 2 minutes — cache vector search results
const SIMILARITY_THRESHOLD = 0.55; // cosine distance threshold for relevance
const RAG_FETCH_LIMIT = 10; // fetch top-10 candidates before reranking
const MIN_CHUNKS_GUARANTEED = 3; // always pass at least N chunks to LLM if available
const RERANK_TOP_K = 5; // how many chunks to keep after reranking
const NO_CONTEXT_REPLY = 'Xin lỗi, tôi không tìm thấy thông tin liên quan đến câu hỏi của bạn trong tài liệu. Vui lòng liên hệ trực tiếp để được hỗ trợ.';

type SearchRow = { content: string; vec_distance: number };

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async search(question: string, knowledgeBaseId: string): Promise<string[]> {
    // Check RAG result cache first
    const resultKey = `rag:${knowledgeBaseId}:${createHash('sha256').update(question).digest('hex')}`;
    const cachedResult = await this.redis.get(resultKey);
    if (cachedResult) {
      this.logger.log(`RAG cache hit`);
      return JSON.parse(cachedResult) as string[];
    }

    const embedding = await this.getEmbedding(question);
    if (embedding.length === 0) return [];

    const vectorLiteral = `[${embedding.join(',')}]`;

    // Try hybrid search (vector + trigram), fallback to pure vector if pg_trgm unavailable
    let rows: SearchRow[];
    try {
      rows = await this.hybridSearch(vectorLiteral, question, knowledgeBaseId);
      this.logger.log(`Hybrid search (vector + trgm) returned ${rows.length} candidates`);
    } catch (err) {
      this.logger.warn(`Hybrid search failed, falling back to pure vector: ${err instanceof Error ? err.message : String(err)}`);
      rows = await this.vectorSearch(vectorLiteral, knowledgeBaseId);
    }

    // Filter by similarity threshold
    let relevant = rows.filter((r) => r.vec_distance <= SIMILARITY_THRESHOLD);

    // Guarantee minimum chunks — nếu filter quá chặt, lấy thêm từ candidates
    if (relevant.length < MIN_CHUNKS_GUARANTEED && rows.length > relevant.length) {
      const extra = rows
        .filter((r) => r.vec_distance > SIMILARITY_THRESHOLD)
        .slice(0, MIN_CHUNKS_GUARANTEED - relevant.length);
      relevant = [...relevant, ...extra];
    }

    this.logger.log(
      `RAG: ${rows.length} candidates → ${relevant.length} after threshold (≤${SIMILARITY_THRESHOLD}). ` +
      `Top vec_distance: ${rows[0]?.vec_distance?.toFixed(4) ?? 'n/a'}`,
    );

    if (relevant.length === 0) return [];

    // LLM reranking — reorder by true relevance, keep top-K
    const reranked = await this.rerank(question, relevant);
    const contents = reranked.slice(0, RERANK_TOP_K).map((r) => r.content);

    await this.redis.set(resultKey, JSON.stringify(contents), 'EX', RAG_RESULT_TTL);
    return contents;
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
    // Strip QA chunk format — chỉ giữ phần câu trả lời để đưa vào context
    const cleanedChunks = chunks.map((c) => {
      const match = /Câu trả lời:\s*([\s\S]+)$/m.exec(c);
      return match ? match[1].trim() : c;
    });

    const contextBlock = `

---
TÀI LIỆU THAM KHẢO:
${cleanedChunks.join('\n\n---\n')}
---

Hướng dẫn trả lời:
- Ưu tiên sử dụng thông tin từ TÀI LIỆU THAM KHẢO ở trên.
- Tổng hợp và diễn đạt lại bằng ngôn ngữ tự nhiên, dễ hiểu — không cần trích dẫn nguyên văn.
- Nếu tài liệu có thông tin liên quan nhưng không đủ để trả lời đầy đủ, hãy trả lời những gì có và ghi chú phần còn thiếu.
- Nếu tài liệu hoàn toàn không có thông tin liên quan, hãy thông báo lịch sự và đề nghị người dùng liên hệ trực tiếp.
- Trả lời bằng tiếng Việt, ngắn gọn và chính xác.`;

    const system = `${systemPrompt}${contextBlock}`;
    const messages: ChatMessage[] = [{ role: 'SYSTEM', content: system }];

    // Last 3 history messages
    const recentHistory = history.slice(-6); // 3 pairs (USER+ASSISTANT)
    messages.push(...recentHistory);
    messages.push({ role: 'USER', content: question });

    return messages;
  }

  // ---------------------------------------------------------------------------
  // Private — search strategies
  // ---------------------------------------------------------------------------

  /** Hybrid search: combines pgvector cosine distance (70%) + pg_trgm trigram similarity (30%).
   *  Sorted by combined_score so keyword-heavy queries (e.g. document codes) rank better. */
  private async hybridSearch(
    vectorLiteral: string,
    question: string,
    knowledgeBaseId: string,
  ): Promise<SearchRow[]> {
    return this.prisma.$queryRaw<SearchRow[]>`
      SELECT c.content,
             c.embedding <=> ${vectorLiteral}::vector AS vec_distance,
             (0.7 * (c.embedding <=> ${vectorLiteral}::vector) +
              0.3 * (1.0 - similarity(c.content, ${question}))) AS combined_score
      FROM chunks c
      JOIN documents d ON c."documentId" = d.id
      WHERE d."knowledgeBaseId" = ${knowledgeBaseId}
        AND c.embedding IS NOT NULL
        AND c."isEnabled" = true
      ORDER BY combined_score
      LIMIT ${RAG_FETCH_LIMIT}
    `;
  }

  /** Pure vector search fallback — used when pg_trgm extension is unavailable. */
  private async vectorSearch(
    vectorLiteral: string,
    knowledgeBaseId: string,
  ): Promise<SearchRow[]> {
    return this.prisma.$queryRaw<SearchRow[]>`
      SELECT c.content, c.embedding <=> ${vectorLiteral}::vector AS vec_distance
      FROM chunks c
      JOIN documents d ON c."documentId" = d.id
      WHERE d."knowledgeBaseId" = ${knowledgeBaseId}
        AND c.embedding IS NOT NULL
        AND c."isEnabled" = true
      ORDER BY vec_distance
      LIMIT ${RAG_FETCH_LIMIT}
    `;
  }

  // ---------------------------------------------------------------------------
  // Private — LLM reranking
  // ---------------------------------------------------------------------------

  /** Zero-shot LLM reranker — asks the LLM to rank candidate chunks by relevance.
   *  Uses temperature=0 and maxTokens=60 for fast, deterministic output.
   *  Falls back to original order on any error or parse failure. */
  private async rerank(question: string, candidates: SearchRow[]): Promise<SearchRow[]> {
    if (candidates.length <= 2) return candidates;

    const numbered = candidates
      .map((c, i) => `[${i}] ${c.content.slice(0, 350)}`)
      .join('\n\n');

    try {
      const response = await this.ai.chat(
        [
          {
            role: 'SYSTEM',
            content:
              'Bạn là hệ thống xếp hạng tài liệu. Chỉ trả về danh sách số index cách nhau bởi dấu phẩy, không thêm bất kỳ nội dung nào khác. Ví dụ: 2,0,4,1,3',
          },
          {
            role: 'USER',
            content: `Câu hỏi: "${question}"\n\nXếp hạng các đoạn văn dưới đây theo mức độ liên quan đến câu hỏi, từ liên quan nhất đến ít nhất:\n\n${numbered}`,
          },
        ],
        { temperature: 0, maxTokens: 60 },
      );

      const indices = response
        .replace(/[^0-9,\s]/g, '')
        .split(/[,\s]+/)
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n >= 0 && n < candidates.length);

      if (indices.length === 0) return candidates;

      const seen = new Set<number>();
      const reranked: SearchRow[] = [];
      for (const i of indices) {
        if (!seen.has(i)) { seen.add(i); reranked.push(candidates[i]); }
      }
      // Append any candidates the LLM didn't mention
      candidates.forEach((c, i) => { if (!seen.has(i)) reranked.push(c); });

      this.logger.log(`Reranked ${candidates.length} chunks → order: [${indices.join(',')}]`);
      return reranked;
    } catch (err) {
      this.logger.warn(`Reranking failed, using original order: ${err instanceof Error ? err.message : String(err)}`);
      return candidates;
    }
  }

  // ---------------------------------------------------------------------------
  // Private — embedding with cache
  // ---------------------------------------------------------------------------

  private async getEmbedding(text: string): Promise<number[]> {
    // nomic-embed-text uses asymmetric retrieval: queries need "search_query:" prefix
    const queryText = `search_query: ${text}`;
    const key = `embed:${createHash('sha256').update(queryText).digest('hex')}`;
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached) as number[];

    const embedding = await this.ai.embed(queryText);
    if (embedding.length > 0) {
      await this.redis.set(key, JSON.stringify(embedding), 'EX', EMBED_TTL);
    }
    return embedding;
  }
}
