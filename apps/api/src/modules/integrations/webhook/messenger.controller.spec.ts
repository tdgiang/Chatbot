/**
 * MessengerController — unit tests
 * Kiểm tra GET verify webhook và POST nhận tin nhắn
 */

import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { MessengerController } from './messenger.controller';
import { MessengerAdapter } from '../adapters/messenger.adapter';
import { IntegrationsService } from '../integrations.service';
import { MESSENGER_QUEUE } from './messenger.constants';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    send:   jest.fn().mockReturnThis(),
    json:   jest.fn().mockReturnThis(),
  };
}

function makeReq(overrides: Partial<{
  headers: Record<string, string>;
  rawBody: Buffer;
}> = {}) {
  return {
    headers: { 'x-hub-signature-256': 'sha256=valid' },
    rawBody: Buffer.from('{}'),
    ...overrides,
  };
}

const INTEGRATION_ID = 'integ-001';
const DECRYPTED_INTEGRATION = {
  id: INTEGRATION_ID,
  knowledgeBaseId: 'kb-1',
  channel: 'MESSENGER' as const,
  isActive: true,
  config: {
    pageId: '123',
    pageAccessToken: 'EAAtest',
    appSecret: 'secret123',
    verifyToken: 'my-verify-token',
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MessengerController', () => {
  let controller: MessengerController;
  let adapter: { verifySignature: jest.Mock; parseIncoming: jest.Mock };
  let integrationsService: { getWithDecryptedConfig: jest.Mock };
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    adapter = {
      verifySignature: jest.fn().mockReturnValue(true),
      parseIncoming:   jest.fn().mockReturnValue({ channelUserId: 'PSID-1', text: 'Xin chào' }),
    };
    integrationsService = {
      getWithDecryptedConfig: jest.fn().mockResolvedValue(DECRYPTED_INTEGRATION),
    };
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    const module = await Test.createTestingModule({
      controllers: [MessengerController],
      providers: [
        { provide: MessengerAdapter,     useValue: adapter },
        { provide: IntegrationsService,  useValue: integrationsService },
        { provide: getQueueToken(MESSENGER_QUEUE), useValue: queue },
      ],
    }).compile();

    controller = module.get(MessengerController);
  });

  // ─── GET verify ──────────────────────────────────────────────────────────

  describe('GET verify()', () => {
    it('trả về challenge khi mode=subscribe và verify_token khớp', async () => {
      const res = makeMockRes();
      await controller.verify(INTEGRATION_ID, 'subscribe', 'my-verify-token', 'CHALLENGE-XYZ', res as never);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith('CHALLENGE-XYZ');
    });

    it('trả về 403 khi mode không phải subscribe', async () => {
      const res = makeMockRes();
      await controller.verify(INTEGRATION_ID, 'unsubscribe', 'my-verify-token', 'C', res as never);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('trả về 403 khi verify_token sai', async () => {
      const res = makeMockRes();
      await controller.verify(INTEGRATION_ID, 'subscribe', 'wrong-token', 'C', res as never);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('trả về 403 khi integration không tồn tại', async () => {
      integrationsService.getWithDecryptedConfig.mockRejectedValue(new Error('Not found'));
      const res = makeMockRes();
      await controller.verify(INTEGRATION_ID, 'subscribe', 'my-verify-token', 'C', res as never);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  // ─── POST receive — happy path ────────────────────────────────────────────

  describe('POST receive() — happy path', () => {
    it('trả về { ok: true } và enqueue job khi tất cả hợp lệ', async () => {
      const req = makeReq();
      const result = await controller.receive(INTEGRATION_ID, req as never, { object: 'page', entry: [] });
      expect(result).toEqual({ ok: true });
      expect(queue.add).toHaveBeenCalledWith('handle', {
        integrationId: INTEGRATION_ID,
        psid: 'PSID-1',
        text: 'Xin chào',
      });
    });

    it('enqueue đúng integrationId, psid, text từ adapter', async () => {
      adapter.parseIncoming.mockReturnValue({ channelUserId: 'PSID-999', text: 'Học phí bao nhiêu?' });
      const req = makeReq();

      await controller.receive(INTEGRATION_ID, req as never, {});

      const jobData = queue.add.mock.calls[0][1];
      expect(jobData.integrationId).toBe(INTEGRATION_ID);
      expect(jobData.psid).toBe('PSID-999');
      expect(jobData.text).toBe('Học phí bao nhiêu?');
    });
  });

  // ─── POST receive — xác thực chữ ký ─────────────────────────────────────

  describe('POST receive() — signature validation', () => {
    it('throw BadRequestException khi thiếu X-Hub-Signature-256 header', async () => {
      const req = makeReq({ headers: {} });
      await expect(controller.receive(INTEGRATION_ID, req as never, {}))
        .rejects.toThrow(BadRequestException);
    });

    it('throw BadRequestException khi chữ ký sai', async () => {
      adapter.verifySignature.mockReturnValue(false);
      const req = makeReq();
      await expect(controller.receive(INTEGRATION_ID, req as never, {}))
        .rejects.toThrow(BadRequestException);
    });

    it('throw BadRequestException khi integration không tồn tại', async () => {
      integrationsService.getWithDecryptedConfig.mockRejectedValue(new Error('Not found'));
      const req = makeReq();
      await expect(controller.receive(INTEGRATION_ID, req as never, {}))
        .rejects.toThrow(BadRequestException);
    });

    it('gọi verifySignature với rawBody từ request', async () => {
      const rawBody = Buffer.from('{"object":"page"}');
      const req = makeReq({ rawBody });

      await controller.receive(INTEGRATION_ID, req as never, {});

      expect(adapter.verifySignature).toHaveBeenCalledWith(
        rawBody,
        'sha256=valid',
        DECRYPTED_INTEGRATION.config.appSecret,
      );
    });

    it('fallback về JSON.stringify(body) khi thiếu rawBody', async () => {
      const body = { object: 'page', entry: [] };
      const req = { headers: { 'x-hub-signature-256': 'sha256=valid' } }; // không có rawBody

      await controller.receive(INTEGRATION_ID, req as never, body);

      const rawBodyUsed = adapter.verifySignature.mock.calls[0][0] as Buffer;
      expect(rawBodyUsed.toString()).toBe(JSON.stringify(body));
    });
  });

  // ─── POST receive — non-text events ──────────────────────────────────────

  describe('POST receive() — non-text events', () => {
    it('trả về { ok: true } mà không enqueue khi parseIncoming trả null (attachment)', async () => {
      adapter.parseIncoming.mockReturnValue(null);
      const req = makeReq();

      const result = await controller.receive(INTEGRATION_ID, req as never, {});

      expect(result).toEqual({ ok: true });
      expect(queue.add).not.toHaveBeenCalled();
    });
  });
});
