/**
 * RAG search behaviour — Phase 3 regression tests
 *
 * Covers: hybrid search path, threshold filter, MIN_CHUNKS_GUARANTEED,
 * LLM reranking fallback, Redis result cache, and embed cache.
 */

import { Test } from '@nestjs/testing';
import { RagService } from './rag.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AiService } from '../ai/ai.service';

const MOCK_EMBEDDING = Array(768).fill(0.1);

// Helper: build a mock redis that separates result-cache keys (rag:) from embed-cache keys (embed:)
function makeRedis(
  resultCache: string | null = null,
  embedCache: string | null = null,
): { get: jest.Mock; set: jest.Mock } {
  return {
    get: jest.fn().mockImplementation((key: string) => {
      if (key.startsWith('rag:')) return Promise.resolve(resultCache);
      if (key.startsWith('embed:')) return Promise.resolve(embedCache);
      return Promise.resolve(null);
    }),
    set: jest.fn(),
  };
}

async function makeService(
  prisma: { $queryRaw: jest.Mock },
  ai: { embed: jest.Mock; chat: jest.Mock },
  redis: { get: jest.Mock; set: jest.Mock },
): Promise<RagService> {
  const module = await Test.createTestingModule({
    providers: [
      RagService,
      { provide: PrismaService, useValue: prisma },
      { provide: AiService, useValue: ai },
      { provide: 'default_IORedisModuleConnectionToken', useValue: redis },
    ],
  }).compile();
  return module.get(RagService);
}

describe('RagService — search()', () => {
  let prisma: { $queryRaw: jest.Mock };
  let ai: { embed: jest.Mock; chat: jest.Mock };

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn() };
    ai = {
      embed: jest.fn().mockResolvedValue(MOCK_EMBEDDING),
      // rerank returns '' → empty indices → falls back to original order (transparent)
      chat: jest.fn().mockResolvedValue(''),
    };
  });

  // ---------------------------------------------------------------------------
  // Basic retrieval
  // ---------------------------------------------------------------------------

  it('returns empty array when embed produces no vector', async () => {
    ai.embed.mockResolvedValue([]);
    const service = await makeService(prisma, ai, makeRedis());
    const result = await service.search('test question', 'kb-1');
    expect(result).toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns empty array when DB returns no rows', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    const service = await makeService(prisma, ai, makeRedis());
    const result = await service.search('anything', 'kb-1');
    expect(result).toEqual([]);
  });

  it('returns relevant chunks in original order when reranking falls back', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { content: 'Chunk A', vec_distance: 0.1 },
      { content: 'Chunk B', vec_distance: 0.2 },
    ]);
    const service = await makeService(prisma, ai, makeRedis());
    const result = await service.search('câu hỏi tuyển sinh', 'kb-1');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['Chunk A', 'Chunk B']);
  });

  // ---------------------------------------------------------------------------
  // Threshold + MIN_CHUNKS_GUARANTEED
  // ---------------------------------------------------------------------------

  it('filters out chunks above similarity threshold (0.55)', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { content: 'Relevant', vec_distance: 0.3 },
      { content: 'Borderline', vec_distance: 0.55 }, // exactly at threshold → included
      { content: 'Too far', vec_distance: 0.56 },
      { content: 'Way off', vec_distance: 0.9 },
    ]);
    const service = await makeService(prisma, ai, makeRedis());
    const result = await service.search('câu hỏi', 'kb-1');
    // Relevant + Borderline pass threshold (2 < MIN_CHUNKS_GUARANTEED=3)
    // → 1 extra chunk added: 'Too far'
    expect(result).toContain('Relevant');
    expect(result).toContain('Borderline');
    expect(result).toContain('Too far');
    expect(result).not.toContain('Way off'); // only 3 guaranteed
  });

  it('guarantees minimum 3 chunks even when all exceed threshold', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { content: 'Chunk A', vec_distance: 0.6 },
      { content: 'Chunk B', vec_distance: 0.7 },
      { content: 'Chunk C', vec_distance: 0.8 },
    ]);
    const service = await makeService(prisma, ai, makeRedis());
    const result = await service.search('unrelated question', 'kb-1');
    // All 3 exceed threshold, but MIN_CHUNKS_GUARANTEED ensures all are returned
    expect(result).toHaveLength(3);
  });

  it('returns empty when DB has no rows (no enabled chunks)', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    const service = await makeService(prisma, ai, makeRedis());
    const result = await service.search('anything', 'kb-1');
    expect(result).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // LLM Reranking
  // ---------------------------------------------------------------------------

  it('reorders chunks according to LLM ranking response', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { content: 'Chunk 0', vec_distance: 0.2 },
      { content: 'Chunk 1', vec_distance: 0.1 },
      { content: 'Chunk 2', vec_distance: 0.3 },
    ]);
    // LLM says: Chunk 2 is most relevant, then 0, then 1
    ai.chat.mockResolvedValue('2,0,1');
    const service = await makeService(prisma, ai, makeRedis());
    const result = await service.search('câu hỏi', 'kb-1');
    expect(result).toEqual(['Chunk 2', 'Chunk 0', 'Chunk 1']);
  });

  it('falls back to original order when reranking returns unparseable response', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { content: 'First', vec_distance: 0.1 },
      { content: 'Second', vec_distance: 0.2 },
      { content: 'Third', vec_distance: 0.3 },
    ]);
    ai.chat.mockResolvedValue('không biết xếp'); // no valid indices
    const service = await makeService(prisma, ai, makeRedis());
    const result = await service.search('câu hỏi', 'kb-1');
    expect(result).toEqual(['First', 'Second', 'Third']);
  });

  it('falls back to original order when reranking throws', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { content: 'Alpha', vec_distance: 0.1 },
      { content: 'Beta', vec_distance: 0.2 },
      { content: 'Gamma', vec_distance: 0.3 },
    ]);
    ai.chat.mockRejectedValue(new Error('AI unavailable'));
    const service = await makeService(prisma, ai, makeRedis());
    const result = await service.search('câu hỏi', 'kb-1');
    expect(result).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  // ---------------------------------------------------------------------------
  // Redis caching
  // ---------------------------------------------------------------------------

  it('returns result from RAG result cache without hitting DB or embed', async () => {
    const cachedContents = JSON.stringify(['Cached chunk 1', 'Cached chunk 2']);
    const service = await makeService(prisma, ai, makeRedis(cachedContents));
    const result = await service.search('same question', 'kb-1');
    expect(result).toEqual(['Cached chunk 1', 'Cached chunk 2']);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(ai.embed).not.toHaveBeenCalled();
  });

  it('uses embed cache to skip re-embedding but still queries DB', async () => {
    const embedCache = JSON.stringify(MOCK_EMBEDDING);
    prisma.$queryRaw.mockResolvedValue([
      { content: 'DB chunk', vec_distance: 0.2 },
    ]);
    const service = await makeService(prisma, ai, makeRedis(null, embedCache));
    await service.search('cached embed question', 'kb-1');
    expect(ai.embed).not.toHaveBeenCalled(); // served from embed cache
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('caches embedding in Redis after first call', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    const redis = makeRedis();
    const service = await makeService(prisma, ai, redis);
    await service.search('new question', 'kb-1');
    const setCalls = (redis.set as jest.Mock).mock.calls;
    const embedCall = setCalls.find(([key]: [string]) => key.startsWith('embed:'));
    expect(embedCall).toBeDefined();
    expect(embedCall[2]).toBe('EX');
    expect(embedCall[3]).toBe(300); // 5-minute TTL
  });

  it('caches RAG results in Redis after successful search', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { content: 'Result chunk', vec_distance: 0.2 },
    ]);
    const redis = makeRedis();
    const service = await makeService(prisma, ai, redis);
    await service.search('question', 'kb-1');
    const setCalls = (redis.set as jest.Mock).mock.calls;
    const ragCall = setCalls.find(([key]: [string]) => key.startsWith('rag:'));
    expect(ragCall).toBeDefined();
    expect(ragCall[2]).toBe('EX');
    expect(ragCall[3]).toBe(120); // 2-minute TTL
  });

  // ---------------------------------------------------------------------------
  // Misc
  // ---------------------------------------------------------------------------

  it('exposes noContextReply string', async () => {
    const service = await makeService(prisma, ai, makeRedis());
    expect(typeof service.noContextReply).toBe('string');
    expect(service.noContextReply.length).toBeGreaterThan(0);
  });
});

describe('RagService.buildPrompt', () => {
  let service: RagService;

  beforeEach(async () => {
    const prisma = { $queryRaw: jest.fn() };
    const ai = { embed: jest.fn(), chat: jest.fn() };
    const redis = makeRedis();
    service = await makeService(prisma, ai, redis);
  });

  it('system message contains systemPrompt and context block', () => {
    const msgs = service.buildPrompt('Bạn là trợ lý.', ['Chunk 1'], [], 'Q?');
    expect(msgs[0].role).toBe('SYSTEM');
    expect(msgs[0].content).toContain('Bạn là trợ lý.');
    expect(msgs[0].content).toContain('TÀI LIỆU THAM KHẢO');
    expect(msgs[0].content).toContain('Chunk 1');
  });

  it('strips QA chunk format — only passes answer part to prompt', () => {
    const qaChunk = '[Section A]\n\nCâu hỏi: Điều kiện là gì?\nCâu trả lời: Phải đạt 18 tuổi.';
    const msgs = service.buildPrompt('System', [qaChunk], [], 'Q?');
    expect(msgs[0].content).toContain('Phải đạt 18 tuổi.');
    expect(msgs[0].content).not.toContain('Câu hỏi: Điều kiện là gì?');
  });

  it('passes non-QA chunks through unchanged', () => {
    const rawChunk = 'Đây là nội dung văn bản thông thường.';
    const msgs = service.buildPrompt('System', [rawChunk], [], 'Q?');
    expect(msgs[0].content).toContain(rawChunk);
  });

  it('appends question as last USER message', () => {
    const msgs = service.buildPrompt('System', [], [], 'Câu hỏi của tôi?');
    expect(msgs[msgs.length - 1].role).toBe('USER');
    expect(msgs[msgs.length - 1].content).toBe('Câu hỏi của tôi?');
  });

  it('keeps only last 6 history messages (3 pairs)', () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? 'USER' : 'ASSISTANT') as 'USER' | 'ASSISTANT',
      content: `msg-${i}`,
    }));
    const msgs = service.buildPrompt('System', [], history, 'Q?');
    // system(1) + history(6) + question(1) = 8
    expect(msgs).toHaveLength(8);
  });
});
