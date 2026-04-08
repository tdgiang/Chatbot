import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2026-04-08T00:00:00.000Z');

const ASSISTANT_MSG = {
  id: 'msg-1',
  sessionId: 'sess-1',
  role: 'ASSISTANT' as const,
};

const USER_MSG = {
  id: 'msg-user',
  sessionId: 'sess-1',
  role: 'USER' as const,
};

const FEEDBACK_ROW = {
  id: 'fb-1',
  messageId: 'msg-1',
  sessionId: 'sess-1',
  rating: 1,
  note: null,
  createdAt: NOW,
};

function makeFindManyRow(overrides: {
  rating?: number; note?: string | null;
  botAnswer?: string; userQuestion?: string;
} = {}) {
  return {
    id: 'fb-1',
    messageId: 'msg-1',
    sessionId: 'sess-1',
    rating: overrides.rating ?? 1,
    note: overrides.note ?? null,
    createdAt: NOW,
    message: { content: overrides.botAnswer ?? 'Bot answer.', sessionId: 'sess-1' },
    session: {
      messages: overrides.userQuestion !== undefined
        ? [{ content: overrides.userQuestion }]
        : [{ content: 'User question?' }],
    },
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('FeedbackService', () => {
  let service: FeedbackService;
  let prisma: {
    message: { findUnique: jest.Mock };
    messageFeedback: {
      findUnique: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      message: { findUnique: jest.fn() },
      messageFeedback: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        FeedbackService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(FeedbackService);
  });

  // -------------------------------------------------------------------------
  // submit()
  // -------------------------------------------------------------------------

  describe('submit()', () => {
    const validDto = {
      message_id: 'msg-1',
      session_id: 'sess-1',
      rating: 1 as const,
    };

    beforeEach(() => {
      prisma.message.findUnique.mockResolvedValue(ASSISTANT_MSG);
      prisma.messageFeedback.findUnique.mockResolvedValue(null); // no existing feedback
      prisma.messageFeedback.create.mockResolvedValue(FEEDBACK_ROW);
    });

    it('creates and returns feedback for positive rating (1)', async () => {
      const result = await service.submit(validDto);

      expect(prisma.messageFeedback.create).toHaveBeenCalledWith({
        data: { messageId: 'msg-1', sessionId: 'sess-1', rating: 1, note: null },
      });
      expect(result.rating).toBe(1);
      expect(result.id).toBe('fb-1');
      expect(result.messageId).toBe('msg-1');
      expect(result.sessionId).toBe('sess-1');
    });

    it('creates and returns feedback for negative rating (-1)', async () => {
      prisma.messageFeedback.create.mockResolvedValue({ ...FEEDBACK_ROW, rating: -1 });

      const result = await service.submit({ ...validDto, rating: -1 });

      expect(prisma.messageFeedback.create).toHaveBeenCalledWith({
        data: { messageId: 'msg-1', sessionId: 'sess-1', rating: -1, note: null },
      });
      expect(result.rating).toBe(-1);
    });

    it('stores note when provided', async () => {
      const note = 'Câu trả lời không chính xác';
      prisma.messageFeedback.create.mockResolvedValue({ ...FEEDBACK_ROW, note });

      const result = await service.submit({ ...validDto, note });

      expect(prisma.messageFeedback.create).toHaveBeenCalledWith({
        data: { messageId: 'msg-1', sessionId: 'sess-1', rating: 1, note },
      });
      expect(result.note).toBe(note);
    });

    it('stores null note when note not provided', async () => {
      await service.submit(validDto);

      expect(prisma.messageFeedback.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ note: null }) })
      );
    });

    it('returns ISO string for createdAt', async () => {
      const result = await service.submit(validDto);
      expect(typeof result.createdAt).toBe('string');
      expect(result.createdAt).toBe(NOW.toISOString());
    });

    // --- Error cases ---

    it('throws NotFoundException when message does not exist', async () => {
      prisma.message.findUnique.mockResolvedValue(null);

      await expect(service.submit(validDto)).rejects.toThrow(NotFoundException);
      expect(prisma.messageFeedback.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when message belongs to a different session', async () => {
      prisma.message.findUnique.mockResolvedValue({
        ...ASSISTANT_MSG,
        sessionId: 'other-sess', // ← mismatch
      });

      await expect(service.submit(validDto)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when trying to rate a USER message', async () => {
      prisma.message.findUnique.mockResolvedValue(USER_MSG);

      await expect(service.submit(validDto)).rejects.toThrow(BadRequestException);
      expect(prisma.messageFeedback.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when message already has feedback', async () => {
      prisma.messageFeedback.findUnique.mockResolvedValue(FEEDBACK_ROW); // existing!

      await expect(service.submit(validDto)).rejects.toThrow(ConflictException);
      expect(prisma.messageFeedback.create).not.toHaveBeenCalled();
    });

    it('verifies ownership before checking duplicates (correct error priority)', async () => {
      // If message belongs to wrong session AND already has feedback,
      // session mismatch should be caught first
      prisma.message.findUnique.mockResolvedValue({ ...ASSISTANT_MSG, sessionId: 'other' });
      prisma.messageFeedback.findUnique.mockResolvedValue(FEEDBACK_ROW);

      await expect(service.submit(validDto)).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------------
  // list()
  // -------------------------------------------------------------------------

  describe('list()', () => {
    it('returns paginated list with correct shape', async () => {
      prisma.messageFeedback.findMany.mockResolvedValue([makeFindManyRow()]);
      prisma.messageFeedback.count.mockResolvedValue(1);

      const result = await service.list(undefined, 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('calculates totalPages correctly for large datasets', async () => {
      prisma.messageFeedback.findMany.mockResolvedValue([]);
      prisma.messageFeedback.count.mockResolvedValue(55);

      const result = await service.list(undefined, 1, 20);

      expect(result.totalPages).toBe(3); // ceil(55/20)
    });

    it('includes botAnswer from related message', async () => {
      prisma.messageFeedback.findMany.mockResolvedValue([
        makeFindManyRow({ botAnswer: 'Câu trả lời của bot.' }),
      ]);
      prisma.messageFeedback.count.mockResolvedValue(1);

      const result = await service.list();

      expect(result.data[0].botAnswer).toBe('Câu trả lời của bot.');
    });

    it('includes userQuestion from most recent USER message in session', async () => {
      prisma.messageFeedback.findMany.mockResolvedValue([
        makeFindManyRow({ userQuestion: 'Học phí là bao nhiêu?' }),
      ]);
      prisma.messageFeedback.count.mockResolvedValue(1);

      const result = await service.list();

      expect(result.data[0].userQuestion).toBe('Học phí là bao nhiêu?');
    });

    it('returns undefined userQuestion when session has no USER messages', async () => {
      const row = makeFindManyRow();
      row.session.messages = []; // no USER messages
      prisma.messageFeedback.findMany.mockResolvedValue([row]);
      prisma.messageFeedback.count.mockResolvedValue(1);

      const result = await service.list();

      expect(result.data[0].userQuestion).toBeUndefined();
    });

    it('passes rating filter to Prisma when provided', async () => {
      prisma.messageFeedback.findMany.mockResolvedValue([]);
      prisma.messageFeedback.count.mockResolvedValue(0);

      await service.list(1, 1, 20);

      expect(prisma.messageFeedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { rating: 1 } })
      );
      expect(prisma.messageFeedback.count).toHaveBeenCalledWith({ where: { rating: 1 } });
    });

    it('passes rating=-1 filter correctly', async () => {
      prisma.messageFeedback.findMany.mockResolvedValue([]);
      prisma.messageFeedback.count.mockResolvedValue(0);

      await service.list(-1, 1, 20);

      expect(prisma.messageFeedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { rating: -1 } })
      );
    });

    it('uses empty where clause when rating is undefined', async () => {
      prisma.messageFeedback.findMany.mockResolvedValue([]);
      prisma.messageFeedback.count.mockResolvedValue(0);

      await service.list(undefined, 1, 20);

      expect(prisma.messageFeedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} })
      );
    });

    it('applies correct skip for page 2', async () => {
      prisma.messageFeedback.findMany.mockResolvedValue([]);
      prisma.messageFeedback.count.mockResolvedValue(0);

      await service.list(undefined, 2, 20);

      expect(prisma.messageFeedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 20 })
      );
    });

    it('orders results by createdAt desc', async () => {
      prisma.messageFeedback.findMany.mockResolvedValue([]);
      prisma.messageFeedback.count.mockResolvedValue(0);

      await service.list();

      expect(prisma.messageFeedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } })
      );
    });

    it('converts createdAt to ISO string', async () => {
      prisma.messageFeedback.findMany.mockResolvedValue([makeFindManyRow()]);
      prisma.messageFeedback.count.mockResolvedValue(1);

      const result = await service.list();

      expect(result.data[0].createdAt).toBe(NOW.toISOString());
    });
  });

  // -------------------------------------------------------------------------
  // stats()
  // -------------------------------------------------------------------------

  describe('stats()', () => {
    it('returns correct stats with mixed ratings', async () => {
      prisma.messageFeedback.count
        .mockResolvedValueOnce(10)  // total
        .mockResolvedValueOnce(8);  // positive

      const result = await service.stats();

      expect(result.total).toBe(10);
      expect(result.positive).toBe(8);
      expect(result.negative).toBe(2);
      expect(result.positiveRate).toBe(80);
    });

    it('returns positiveRate=0 when no feedback exists (no division by zero)', async () => {
      prisma.messageFeedback.count
        .mockResolvedValueOnce(0)  // total
        .mockResolvedValueOnce(0); // positive

      const result = await service.stats();

      expect(result.total).toBe(0);
      expect(result.positive).toBe(0);
      expect(result.negative).toBe(0);
      expect(result.positiveRate).toBe(0);
    });

    it('returns positiveRate=100 when all feedback is positive', async () => {
      prisma.messageFeedback.count
        .mockResolvedValueOnce(5)  // total
        .mockResolvedValueOnce(5); // positive

      const result = await service.stats();

      expect(result.positiveRate).toBe(100);
      expect(result.negative).toBe(0);
    });

    it('returns positiveRate=0 when all feedback is negative', async () => {
      prisma.messageFeedback.count
        .mockResolvedValueOnce(5)  // total
        .mockResolvedValueOnce(0); // positive

      const result = await service.stats();

      expect(result.positiveRate).toBe(0);
      expect(result.negative).toBe(5);
    });

    it('rounds positiveRate to nearest integer', async () => {
      // 7/10 = 70% exact
      prisma.messageFeedback.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(7);

      const result = await service.stats();
      expect(result.positiveRate).toBe(70);
    });

    it('rounds up when positiveRate has fractional part ≥ 0.5', async () => {
      // 2/3 = 66.67% → rounds to 67
      prisma.messageFeedback.count
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(2);

      const result = await service.stats();
      expect(result.positiveRate).toBe(67);
    });

    it('queries total count without filter and positive count with rating=1', async () => {
      prisma.messageFeedback.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(6);

      await service.stats();

      // First call: no where clause (total)
      expect(prisma.messageFeedback.count.mock.calls[0]).toEqual([]);
      // Second call: rating: 1
      expect(prisma.messageFeedback.count.mock.calls[1]).toEqual([{ where: { rating: 1 } }]);
    });
  });
});
