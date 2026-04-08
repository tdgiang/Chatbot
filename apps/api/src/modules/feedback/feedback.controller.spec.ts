import { Test } from '@nestjs/testing';
import { FeedbackPublicController, FeedbackCmsController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { ApiKeyGuard } from '../chat/guards/api-key.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const MOCK_FEEDBACK = {
  id: 'fb-1', messageId: 'msg-1', sessionId: 'sess-1',
  rating: 1 as const, note: null, createdAt: '2026-04-08T00:00:00.000Z',
};

const MOCK_STATS = { total: 10, positive: 8, negative: 2, positiveRate: 80 };

describe('FeedbackPublicController', () => {
  let controller: FeedbackPublicController;
  let service: { submit: jest.Mock };

  beforeEach(async () => {
    service = { submit: jest.fn().mockResolvedValue(MOCK_FEEDBACK) };

    const module = await Test.createTestingModule({
      controllers: [FeedbackPublicController],
      providers: [{ provide: FeedbackService, useValue: service }],
    })
      .overrideGuard(ApiKeyGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get(FeedbackPublicController);
  });

  it('delegates submit to FeedbackService', async () => {
    const dto = { message_id: 'msg-1', session_id: 'sess-1', rating: 1 as const };
    const result = await controller.submit(dto as never);

    expect(service.submit).toHaveBeenCalledWith(dto);
    expect(result).toEqual(MOCK_FEEDBACK);
  });

  it('forwards note to service when provided', async () => {
    const dto = { message_id: 'msg-1', session_id: 'sess-1', rating: -1 as const, note: 'Bad answer' };
    await controller.submit(dto as never);

    expect(service.submit).toHaveBeenCalledWith(dto);
  });
});

describe('FeedbackCmsController', () => {
  let controller: FeedbackCmsController;
  let service: { list: jest.Mock; stats: jest.Mock };

  const MOCK_LIST = {
    data: [MOCK_FEEDBACK], total: 1, page: 1, limit: 20, totalPages: 1,
  };

  beforeEach(async () => {
    service = {
      list: jest.fn().mockResolvedValue(MOCK_LIST),
      stats: jest.fn().mockResolvedValue(MOCK_STATS),
    };

    const module = await Test.createTestingModule({
      controllers: [FeedbackCmsController],
      providers: [{ provide: FeedbackService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get(FeedbackCmsController);
  });

  describe('stats()', () => {
    it('delegates to FeedbackService.stats()', async () => {
      const result = await controller.stats();

      expect(service.stats).toHaveBeenCalled();
      expect(result).toEqual(MOCK_STATS);
    });
  });

  describe('list()', () => {
    it('calls service.list with undefined rating when query param absent', async () => {
      await controller.list(undefined, 1, 20);

      expect(service.list).toHaveBeenCalledWith(undefined, 1, 20);
    });

    it('parses rating=1 string to integer 1', async () => {
      await controller.list('1', 1, 20);

      expect(service.list).toHaveBeenCalledWith(1, 1, 20);
    });

    it('parses rating=-1 string to integer -1', async () => {
      await controller.list('-1', 1, 20);

      expect(service.list).toHaveBeenCalledWith(-1, 1, 20);
    });

    it('forwards page and limit to service', async () => {
      await controller.list(undefined, 3, 10);

      expect(service.list).toHaveBeenCalledWith(undefined, 3, 10);
    });

    it('returns list response from service', async () => {
      const result = await controller.list(undefined, 1, 20);

      expect(result).toEqual(MOCK_LIST);
    });
  });
});
