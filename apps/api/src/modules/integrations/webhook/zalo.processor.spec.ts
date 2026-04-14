/**
 * ZaloProcessor — unit tests
 * Kiểm tra luồng async: find session → chatInternal → sendMessage
 */

import { Test } from '@nestjs/testing';
import { ChannelType } from '@prisma/client';
import { ZaloProcessor } from './zalo.processor';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { IntegrationsService } from '../integrations.service';
import { ChatService } from '../../chat/chat.service';
import { ZaloClient } from '../clients/zalo.client';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const INTEGRATION_ID = 'integ-zalo-001';
const USER_ID = 'ZALO-USER-123';

const DECRYPTED_INTEGRATION = {
  id: INTEGRATION_ID,
  knowledgeBaseId: 'kb-1',
  channel: ChannelType.ZALO,
  isActive: true,
  config: { oaId: 'OA-1', accessToken: 'eXlBbGtest', secretKey: 'secret' },
};

const CHAT_RESULT = {
  session_id: 'sess-zalo',
  message_id: 'msg-zalo-1',
  content: 'Câu trả lời AI từ Zalo',
  latency_ms: 250,
  source: 'rag' as const,
};

function makeJob(overrides: Partial<{ integrationId: string; userId: string; text: string }> = {}) {
  return {
    data: {
      integrationId: INTEGRATION_ID,
      userId: USER_ID,
      text: 'Xin chào',
      ...overrides,
    },
  } as never;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ZaloProcessor', () => {
  let processor: ZaloProcessor;
  let prisma: { session: { findFirst: jest.Mock } };
  let integrationsService: { getWithDecryptedConfig: jest.Mock };
  let chatService: { chatInternal: jest.Mock };
  let zaloClient: { sendMessage: jest.Mock };

  beforeEach(async () => {
    prisma = { session: { findFirst: jest.fn().mockResolvedValue(null) } };
    integrationsService = { getWithDecryptedConfig: jest.fn().mockResolvedValue(DECRYPTED_INTEGRATION) };
    chatService = { chatInternal: jest.fn().mockResolvedValue(CHAT_RESULT) };
    zaloClient = { sendMessage: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        ZaloProcessor,
        { provide: PrismaService,        useValue: prisma },
        { provide: IntegrationsService,  useValue: integrationsService },
        { provide: ChatService,          useValue: chatService },
        { provide: ZaloClient,           useValue: zaloClient },
      ],
    }).compile();

    processor = module.get(ZaloProcessor);
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  describe('Luồng bình thường', () => {
    it('gọi chatInternal với đúng params bao gồm channel=ZALO', async () => {
      await processor.process(makeJob());

      expect(chatService.chatInternal).toHaveBeenCalledWith({
        message: 'Xin chào',
        sessionId: undefined,
        externalUserId: USER_ID,
        knowledgeBaseId: 'kb-1',
        channelIntegrationId: INTEGRATION_ID,
        channel: ChannelType.ZALO,
      });
    });

    it('gửi AI reply về Zalo với đúng userId và accessToken', async () => {
      await processor.process(makeJob());

      expect(zaloClient.sendMessage).toHaveBeenCalledWith(
        USER_ID,
        'Câu trả lời AI từ Zalo',
        'eXlBbGtest',
      );
    });
  });

  // ─── Session handling ─────────────────────────────────────────────────────

  describe('Session handling', () => {
    it('truyền sessionId=undefined khi không có session cũ', async () => {
      prisma.session.findFirst.mockResolvedValue(null);

      await processor.process(makeJob());

      expect(chatService.chatInternal).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: undefined }),
      );
    });

    it('tái sử dụng session cũ khi tìm thấy', async () => {
      prisma.session.findFirst.mockResolvedValue({ id: 'sess-old', externalUserId: USER_ID });

      await processor.process(makeJob());

      expect(chatService.chatInternal).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'sess-old' }),
      );
    });

    it('tìm session theo đúng channelIntegrationId và userId', async () => {
      await processor.process(makeJob());

      expect(prisma.session.findFirst).toHaveBeenCalledWith({
        where: { channelIntegrationId: INTEGRATION_ID, externalUserId: USER_ID },
        orderBy: { lastMessageAt: 'desc' },
      });
    });
  });

  // ─── Error handling ───────────────────────────────────────────────────────

  describe('Xử lý lỗi', () => {
    it('gửi thông báo lỗi tiếng Việt khi chatInternal throw', async () => {
      chatService.chatInternal.mockRejectedValue(new Error('AI timeout'));

      await processor.process(makeJob());

      expect(zaloClient.sendMessage).toHaveBeenCalledWith(
        USER_ID,
        'Xin lỗi, hệ thống đang bận. Vui lòng thử lại sau.',
        'eXlBbGtest',
      );
    });

    it('không throw ra ngoài khi chatInternal lỗi', async () => {
      chatService.chatInternal.mockRejectedValue(new Error('Fatal error'));

      await expect(processor.process(makeJob())).resolves.toBeUndefined();
    });

    it('dùng đúng accessToken từ config khi gửi tin lỗi', async () => {
      chatService.chatInternal.mockRejectedValue(new Error('Error'));

      await processor.process(makeJob());

      const [, , token] = zaloClient.sendMessage.mock.calls[0] as [string, string, string];
      expect(token).toBe('eXlBbGtest');
    });
  });
});
