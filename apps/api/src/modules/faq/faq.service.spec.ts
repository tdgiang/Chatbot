import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { FaqService } from './faq.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AiService } from '../ai/ai.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2026-04-08T00:00:00.000Z');

/** Build a vector that is exactly [1, 0, 0, ...0] of given length */
function unitVec(dim = 3): number[] {
  return [1, ...Array(dim - 1).fill(0)];
}

/** Build a vector orthogonal to unitVec: [0, 1, 0, ...0] */
function orthogVec(dim = 3): number[] {
  return [0, 1, ...Array(dim - 2).fill(0)];
}

/** Cosine distance in [0,2] — mirrors faq.service.ts private impl */
function cosineDist(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 2;
  return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function embedBuf(vec: number[]): Buffer {
  return Buffer.from(JSON.stringify(vec));
}

function makeFaqRow(overrides: Partial<{
  id: string; question: string; answer: string; isActive: boolean;
  priority: number; matchCount: number; questionEmbed: Buffer | null;
}> = {}) {
  return {
    id: 'faq-1',
    knowledgeBaseId: 'kb-1',
    question: 'Điều kiện tuyển sinh là gì?',
    answer: 'Thí sinh cần đáp ứng...',
    isActive: true,
    priority: 0,
    matchCount: 0,
    questionEmbed: embedBuf(unitVec()),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Cosine distance — pure function verification
// ---------------------------------------------------------------------------

describe('cosineDist (pure util)', () => {
  it('returns 0 for identical vectors', () => {
    expect(cosineDist([1, 0, 0], [1, 0, 0])).toBeCloseTo(0);
  });

  it('returns 1 for orthogonal vectors', () => {
    expect(cosineDist([1, 0, 0], [0, 1, 0])).toBeCloseTo(1);
  });

  it('returns 2 for zero vector (max distance)', () => {
    expect(cosineDist([0, 0, 0], [1, 0, 0])).toBe(2);
  });

  it('returns value between 0 and 1 for similar vectors', () => {
    const a = [1, 0.1, 0];
    const b = [0.9, 0.2, 0];
    const dist = cosineDist(a, b);
    expect(dist).toBeGreaterThanOrEqual(0);
    expect(dist).toBeLessThanOrEqual(1);
  });

  it('is symmetric: dist(a,b) === dist(b,a)', () => {
    const a = [0.5, 0.3, 0.8];
    const b = [0.2, 0.9, 0.1];
    expect(cosineDist(a, b)).toBeCloseTo(cosineDist(b, a));
  });
});

// ---------------------------------------------------------------------------
// FaqService
// ---------------------------------------------------------------------------

describe('FaqService', () => {
  let service: FaqService;
  let prisma: {
    faqOverride: {
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let ai: { embed: jest.Mock };

  beforeEach(async () => {
    prisma = {
      faqOverride: {
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    ai = { embed: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        FaqService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: ai },
      ],
    }).compile();

    service = module.get(FaqService);
  });

  // -------------------------------------------------------------------------
  // list()
  // -------------------------------------------------------------------------

  describe('list()', () => {
    it('returns paginated FAQ list with ISO date strings', async () => {
      const row = makeFaqRow();
      prisma.faqOverride.findMany.mockResolvedValue([row]);
      prisma.faqOverride.count.mockResolvedValue(1);

      const result = await service.list({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(typeof result.data[0].createdAt).toBe('string');
      expect(typeof result.data[0].updatedAt).toBe('string');
    });

    it('calculates totalPages correctly', async () => {
      prisma.faqOverride.findMany.mockResolvedValue([]);
      prisma.faqOverride.count.mockResolvedValue(45);

      const result = await service.list({ page: 1, limit: 20 });

      expect(result.totalPages).toBe(3); // ceil(45/20)
    });

    it('passes knowledgeBaseId filter when provided', async () => {
      prisma.faqOverride.findMany.mockResolvedValue([]);
      prisma.faqOverride.count.mockResolvedValue(0);

      await service.list({ knowledgeBaseId: 'kb-1', page: 1, limit: 20 });

      expect(prisma.faqOverride.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { knowledgeBaseId: 'kb-1' } })
      );
    });

    it('uses empty where when no knowledgeBaseId', async () => {
      prisma.faqOverride.findMany.mockResolvedValue([]);
      prisma.faqOverride.count.mockResolvedValue(0);

      await service.list({ page: 1, limit: 20 });

      expect(prisma.faqOverride.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} })
      );
    });
  });

  // -------------------------------------------------------------------------
  // create()
  // -------------------------------------------------------------------------

  describe('create()', () => {
    const dto = {
      knowledgeBaseId: 'kb-1',
      question: 'Học phí là bao nhiêu?',
      answer: 'Học phí miễn phí cho sinh viên diện ưu tiên.',
      priority: 0,
    };

    it('creates FAQ with questionEmbed when embed succeeds', async () => {
      const embedding = unitVec(768);
      ai.embed.mockResolvedValue(embedding);
      const row = makeFaqRow({ questionEmbed: embedBuf(embedding) });
      prisma.faqOverride.create.mockResolvedValue(row);

      const result = await service.create(dto);

      expect(ai.embed).toHaveBeenCalledWith(dto.question);
      expect(prisma.faqOverride.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            questionEmbed: expect.any(Buffer),
          }),
        })
      );
      expect(result.question).toBe(row.question);
    });

    it('creates FAQ with null questionEmbed when embed fails', async () => {
      ai.embed.mockResolvedValue([]); // embed failure
      const row = makeFaqRow({ questionEmbed: null });
      prisma.faqOverride.create.mockResolvedValue(row);

      await service.create(dto);

      expect(prisma.faqOverride.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ questionEmbed: null }),
        })
      );
    });

    it('applies default priority 0 when not provided', async () => {
      ai.embed.mockResolvedValue([]);
      prisma.faqOverride.create.mockResolvedValue(makeFaqRow());

      await service.create({ ...dto, priority: undefined });

      expect(prisma.faqOverride.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ priority: 0 }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // update()
  // -------------------------------------------------------------------------

  describe('update()', () => {
    it('re-embeds question when question changes', async () => {
      const oldEmbed = embedBuf(unitVec());
      const existing = makeFaqRow({ questionEmbed: oldEmbed });
      prisma.faqOverride.findUnique.mockResolvedValue(existing);
      ai.embed.mockResolvedValue(unitVec(768));
      const updated = makeFaqRow({ question: 'Câu hỏi mới?' });
      prisma.faqOverride.update.mockResolvedValue(updated);

      await service.update('faq-1', { question: 'Câu hỏi mới?' });

      expect(ai.embed).toHaveBeenCalledWith('Câu hỏi mới?');
      expect(prisma.faqOverride.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ questionEmbed: expect.any(Buffer) }),
        })
      );
    });

    it('does NOT re-embed when only answer changes', async () => {
      const existing = makeFaqRow();
      prisma.faqOverride.findUnique.mockResolvedValue(existing);
      prisma.faqOverride.update.mockResolvedValue(makeFaqRow({ answer: 'Câu trả lời mới.' }));

      await service.update('faq-1', { answer: 'Câu trả lời mới.' });

      expect(ai.embed).not.toHaveBeenCalled();
    });

    it('does NOT re-embed when question is unchanged', async () => {
      const existing = makeFaqRow();
      prisma.faqOverride.findUnique.mockResolvedValue(existing);
      prisma.faqOverride.update.mockResolvedValue(existing);

      await service.update('faq-1', { question: existing.question });

      expect(ai.embed).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when FAQ not found', async () => {
      prisma.faqOverride.findUnique.mockResolvedValue(null);

      await expect(service.update('ghost', { answer: 'x' }))
        .rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // toggle()
  // -------------------------------------------------------------------------

  describe('toggle()', () => {
    it('flips isActive from true to false', async () => {
      prisma.faqOverride.findUnique.mockResolvedValue(makeFaqRow({ isActive: true }));
      prisma.faqOverride.update.mockResolvedValue(makeFaqRow({ isActive: false }));

      const result = await service.toggle('faq-1');

      expect(prisma.faqOverride.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } })
      );
      expect(result.isActive).toBe(false);
    });

    it('flips isActive from false to true', async () => {
      prisma.faqOverride.findUnique.mockResolvedValue(makeFaqRow({ isActive: false }));
      prisma.faqOverride.update.mockResolvedValue(makeFaqRow({ isActive: true }));

      const result = await service.toggle('faq-1');

      expect(prisma.faqOverride.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: true } })
      );
      expect(result.isActive).toBe(true);
    });

    it('throws NotFoundException when FAQ not found', async () => {
      prisma.faqOverride.findUnique.mockResolvedValue(null);

      await expect(service.toggle('ghost')).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // remove()
  // -------------------------------------------------------------------------

  describe('remove()', () => {
    it('deletes FAQ and returns success', async () => {
      prisma.faqOverride.findUnique.mockResolvedValue(makeFaqRow());
      prisma.faqOverride.delete.mockResolvedValue({});

      const result = await service.remove('faq-1');

      expect(prisma.faqOverride.delete).toHaveBeenCalledWith({ where: { id: 'faq-1' } });
      expect(result).toEqual({ success: true });
    });

    it('throws NotFoundException when FAQ not found', async () => {
      prisma.faqOverride.findUnique.mockResolvedValue(null);

      await expect(service.remove('ghost')).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // lookup() — core of FAQ Override layer
  // -------------------------------------------------------------------------

  describe('lookup()', () => {
    it('returns null when embed produces empty vector', async () => {
      ai.embed.mockResolvedValue([]);

      const result = await service.lookup('câu hỏi', 'kb-1');

      expect(result).toBeNull();
      expect(prisma.faqOverride.findMany).not.toHaveBeenCalled();
    });

    it('returns null when no active FAQs with embeddings exist', async () => {
      ai.embed.mockResolvedValue(unitVec());
      prisma.faqOverride.findMany.mockResolvedValue([]);

      const result = await service.lookup('câu hỏi', 'kb-1');

      expect(result).toBeNull();
    });

    it('returns matching FAQ when cosine distance ≤ 0.15 (identical vector)', async () => {
      const vec = unitVec();
      ai.embed.mockResolvedValue(vec);
      prisma.faqOverride.findMany.mockResolvedValue([
        { id: 'faq-1', answer: 'Câu trả lời', priority: 0, questionEmbed: embedBuf(vec) },
      ]);
      prisma.faqOverride.update.mockResolvedValue({}); // matchCount increment

      const result = await service.lookup('câu hỏi', 'kb-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('faq-1');
      expect(result!.answer).toBe('Câu trả lời');
    });

    it('returns null when cosine distance > 0.15 (orthogonal vector)', async () => {
      ai.embed.mockResolvedValue(unitVec()); // [1,0,0]
      prisma.faqOverride.findMany.mockResolvedValue([
        { id: 'faq-1', answer: 'x', priority: 0, questionEmbed: embedBuf(orthogVec()) }, // [0,1,0]
      ]);
      // cosineDist([1,0,0], [0,1,0]) = 1.0 > 0.15

      const result = await service.lookup('câu hỏi', 'kb-1');

      expect(result).toBeNull();
    });

    it('picks the FAQ with smaller cosine distance when multiple match', async () => {
      const queryVec = unitVec(3); // [1,0,0]
      // faq-close: same direction → distance 0
      const closeVec = [1, 0, 0];
      // faq-far: slightly off → distance ≈ 0.1
      const farVec = [0.95, 0.31, 0]; // roughly 0.1 away

      ai.embed.mockResolvedValue(queryVec);
      prisma.faqOverride.findMany.mockResolvedValue([
        { id: 'faq-far',   answer: 'Far answer',   priority: 0, questionEmbed: embedBuf(farVec) },
        { id: 'faq-close', answer: 'Close answer', priority: 0, questionEmbed: embedBuf(closeVec) },
      ]);
      prisma.faqOverride.update.mockResolvedValue({});

      const result = await service.lookup('câu hỏi', 'kb-1');

      expect(result!.id).toBe('faq-close'); // distance 0 < distance ≈ 0.1
    });

    it('breaks tie by priority when two FAQs have equal distance', async () => {
      const vec = unitVec(3);
      ai.embed.mockResolvedValue(vec);
      prisma.faqOverride.findMany.mockResolvedValue([
        { id: 'faq-low',  answer: 'Low priority',  priority: 0, questionEmbed: embedBuf(vec) },
        { id: 'faq-high', answer: 'High priority', priority: 5, questionEmbed: embedBuf(vec) },
      ]);
      prisma.faqOverride.update.mockResolvedValue({});

      const result = await service.lookup('câu hỏi', 'kb-1');

      expect(result!.id).toBe('faq-high'); // same distance → higher priority wins
    });

    it('skips FAQs without questionEmbed (query filters them server-side)', async () => {
      // The Prisma where clause filters questionEmbed: {not: null}
      // so findMany never returns null-embed FAQs — we verify the where clause
      ai.embed.mockResolvedValue(unitVec());
      prisma.faqOverride.findMany.mockResolvedValue([]); // DB already filtered them out

      await service.lookup('câu hỏi', 'kb-1');

      expect(prisma.faqOverride.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ questionEmbed: { not: null } }),
        })
      );
    });

    it('only queries active FAQs (isActive: true)', async () => {
      ai.embed.mockResolvedValue(unitVec());
      prisma.faqOverride.findMany.mockResolvedValue([]);

      await service.lookup('câu hỏi', 'kb-1');

      expect(prisma.faqOverride.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        })
      );
    });

    it('increments matchCount after successful match (async, non-blocking)', async () => {
      const vec = unitVec();
      ai.embed.mockResolvedValue(vec);
      prisma.faqOverride.findMany.mockResolvedValue([
        { id: 'faq-1', answer: 'Câu trả lời', priority: 0, questionEmbed: embedBuf(vec) },
      ]);
      prisma.faqOverride.update.mockResolvedValue({});

      await service.lookup('câu hỏi', 'kb-1');

      // Give async update a tick to fire
      await Promise.resolve();

      expect(prisma.faqOverride.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'faq-1' },
          data: { matchCount: { increment: 1 } },
        })
      );
    });
  });
});
