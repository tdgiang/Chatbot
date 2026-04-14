/**
 * ZaloController — unit tests
 * Kiểm tra POST /webhooks/zalo/:integrationId
 */

import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { ZaloController } from './zalo.controller';
import { ZaloAdapter } from '../adapters/zalo.adapter';
import { IntegrationsService } from '../integrations.service';
import { ZALO_QUEUE } from './zalo.constants';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(rawBody?: Buffer) {
  return { rawBody: rawBody ?? Buffer.from('{}') };
}

const INTEGRATION_ID = 'integ-zalo-001';

const DECRYPTED_INTEGRATION = {
  id: INTEGRATION_ID,
  knowledgeBaseId: 'kb-1',
  channel: 'ZALO' as const,
  isActive: true,
  config: {
    oaId: 'OA-123',
    accessToken: 'eXlBbGtest',
    secretKey: 'zalo-secret',
  },
};

const VALID_BODY = {
  app_id: 'OA-123',
  user_id_by_app: 'ZALO-USER-1',
  event_name: 'user_send_text',
  message: { text: 'Xin chào', msg_id: 'msg-1' },
  sender: { id: 'ZALO-USER-1', display_name: 'User Test' },
  recipient: { id: 'OA-123' },
  mac: 'valid-mac-hex',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ZaloController', () => {
  let controller: ZaloController;
  let adapter: { verifySignature: jest.Mock; parseIncoming: jest.Mock };
  let integrationsService: { getWithDecryptedConfig: jest.Mock };
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    adapter = {
      verifySignature: jest.fn().mockReturnValue(true),
      parseIncoming:   jest.fn().mockReturnValue({ channelUserId: 'ZALO-USER-1', text: 'Xin chào' }),
    };
    integrationsService = {
      getWithDecryptedConfig: jest.fn().mockResolvedValue(DECRYPTED_INTEGRATION),
    };
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    const module = await Test.createTestingModule({
      controllers: [ZaloController],
      providers: [
        { provide: ZaloAdapter,          useValue: adapter },
        { provide: IntegrationsService,  useValue: integrationsService },
        { provide: getQueueToken(ZALO_QUEUE), useValue: queue },
      ],
    }).compile();

    controller = module.get(ZaloController);
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  describe('Happy path', () => {
    it('trả về { ok: true } và enqueue job khi hợp lệ', async () => {
      const result = await controller.receive(INTEGRATION_ID, makeReq() as never, VALID_BODY);
      expect(result).toEqual({ ok: true });
      expect(queue.add).toHaveBeenCalledWith('handle', {
        integrationId: INTEGRATION_ID,
        userId: 'ZALO-USER-1',
        text: 'Xin chào',
      });
    });

    it('enqueue đúng userId và text từ adapter', async () => {
      adapter.parseIncoming.mockReturnValue({ channelUserId: 'Z-999', text: 'Học phí?' });

      await controller.receive(INTEGRATION_ID, makeReq() as never, VALID_BODY);

      const jobData = queue.add.mock.calls[0][1];
      expect(jobData.userId).toBe('Z-999');
      expect(jobData.text).toBe('Học phí?');
    });

    it('gọi verifySignature với đúng rawBody, mac và secretKey', async () => {
      const rawBody = Buffer.from(JSON.stringify(VALID_BODY));
      const req = makeReq(rawBody);

      await controller.receive(INTEGRATION_ID, req as never, VALID_BODY);

      expect(adapter.verifySignature).toHaveBeenCalledWith(
        rawBody,
        VALID_BODY.mac,
        DECRYPTED_INTEGRATION.config.secretKey,
      );
    });

    it('fallback JSON.stringify(body) khi không có rawBody', async () => {
      const req = {}; // không có rawBody

      await controller.receive(INTEGRATION_ID, req as never, VALID_BODY);

      const rawBodyUsed = adapter.verifySignature.mock.calls[0][0] as Buffer;
      expect(rawBodyUsed.toString()).toBe(JSON.stringify(VALID_BODY));
    });
  });

  // ─── MAC validation ───────────────────────────────────────────────────────

  describe('MAC validation', () => {
    it('throw BadRequestException khi verifySignature trả false', async () => {
      adapter.verifySignature.mockReturnValue(false);
      await expect(controller.receive(INTEGRATION_ID, makeReq() as never, VALID_BODY))
        .rejects.toThrow(BadRequestException);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('throw BadRequestException khi integration không tồn tại', async () => {
      integrationsService.getWithDecryptedConfig.mockRejectedValue(new Error('Not found'));
      await expect(controller.receive(INTEGRATION_ID, makeReq() as never, VALID_BODY))
        .rejects.toThrow(BadRequestException);
    });

    it('dùng empty string làm signature khi body không có field mac', async () => {
      const bodyWithoutMac = { ...VALID_BODY, mac: undefined };

      await controller.receive(INTEGRATION_ID, makeReq() as never, bodyWithoutMac);

      expect(adapter.verifySignature).toHaveBeenCalledWith(
        expect.any(Buffer),
        '',  // empty signature
        DECRYPTED_INTEGRATION.config.secretKey,
      );
    });
  });

  // ─── Non-text events ──────────────────────────────────────────────────────

  describe('Non-text events', () => {
    it('trả về { ok: true } mà không enqueue khi parseIncoming trả null', async () => {
      adapter.parseIncoming.mockReturnValue(null);

      const result = await controller.receive(INTEGRATION_ID, makeReq() as never, VALID_BODY);

      expect(result).toEqual({ ok: true });
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('không enqueue khi event là follow (không phải user_send_text)', async () => {
      adapter.parseIncoming.mockReturnValue(null);
      const followBody = { ...VALID_BODY, event_name: 'follow' };

      const result = await controller.receive(INTEGRATION_ID, makeReq() as never, followBody);

      expect(result).toEqual({ ok: true });
      expect(queue.add).not.toHaveBeenCalled();
    });
  });
});
