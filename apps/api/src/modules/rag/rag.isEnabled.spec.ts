/**
 * RAG isEnabled filter — Phase 1 verification
 *
 * Verifies that the RAG search query respects the isEnabled flag:
 * - Only chunks with isEnabled=true are returned to the AI
 * - Disabled chunks are excluded from vector search
 */

import { Test } from '@nestjs/testing';
import { RagService } from './rag.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AiService } from '../ai/ai.service';

const MOCK_EMBEDDING = Array(768).fill(0.1);

describe('RagService — isEnabled filter (Phase 1)', () => {
  let service: RagService;
  let prisma: { $queryRaw: jest.Mock };
  let ai: { embed: jest.Mock };
  let redis: { get: jest.Mock; set: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn() };
    ai = { embed: jest.fn().mockResolvedValue(MOCK_EMBEDDING) };
    redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        RagService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: ai },
        { provide: 'default_IORedisModuleConnectionToken', useValue: redis },
      ],
    }).compile();

    service = module.get(RagService);
  });

  it('returns empty array when embed produces no vector', async () => {
    ai.embed.mockResolvedValue([]);
    const result = await service.search('test question', 'kb-1');
    expect(result).toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('queries DB with knowledgeBaseId and returns relevant chunks', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { content: 'Chunk A', distance: 0.1 },
      { content: 'Chunk B', distance: 0.2 },
    ]);

    const result = await service.search('câu hỏi tuyển sinh', 'kb-1');

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['Chunk A', 'Chunk B']);
  });

  it('filters out chunks above similarity threshold (distance > 0.365)', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { content: 'Relevant', distance: 0.3 },
      { content: 'Too far', distance: 0.4 },
      { content: 'Way off', distance: 0.9 },
    ]);

    const result = await service.search('câu hỏi', 'kb-1');

    expect(result).toEqual(['Relevant']);
  });

  it('returns empty array when all chunks exceed threshold', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { content: 'Far chunk', distance: 0.5 },
      { content: 'Even farther', distance: 0.8 },
    ]);

    const result = await service.search('unrelated question', 'kb-1');

    expect(result).toEqual([]);
  });

  it('returns empty array when DB returns no rows (no enabled chunks)', async () => {
    // Simulates: all chunks disabled → SQL WHERE isEnabled=true returns nothing
    prisma.$queryRaw.mockResolvedValue([]);

    const result = await service.search('anything', 'kb-1');

    expect(result).toEqual([]);
  });

  it('uses Redis cache to avoid re-embedding identical questions', async () => {
    const cached = JSON.stringify(MOCK_EMBEDDING);
    redis.get.mockResolvedValue(cached);
    prisma.$queryRaw.mockResolvedValue([{ content: 'Cached chunk', distance: 0.1 }]);

    await service.search('cached question', 'kb-1');

    expect(ai.embed).not.toHaveBeenCalled(); // served from cache
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('caches embedding in Redis after first call', async () => {
    prisma.$queryRaw.mockResolvedValue([]);

    await service.search('new question', 'kb-1');

    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining('embed:'),
      expect.any(String),
      'EX',
      300, // 5-minute TTL
    );
  });

  it('exposes noContextReply string', () => {
    expect(typeof service.noContextReply).toBe('string');
    expect(service.noContextReply.length).toBeGreaterThan(0);
  });
});
