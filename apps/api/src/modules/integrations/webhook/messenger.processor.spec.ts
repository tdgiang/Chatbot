/**
 * MessengerProcessor — unit tests
 * Kiểm tra luồng async: find session → chatInternal → sendMessage
 */

import { Test } from '@nestjs/testing';
import { ChannelType } from '@prisma/client';
import { MessengerProcessor } from './messenger.processor';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { IntegrationsService } from '../integrations.service';
import { ChatService } from '../../chat/chat.service';
import { MessengerClient } from '../clients/messenger.client';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const INTEGRATION_ID = 'integ-001';
const PSID = 'PSID-123';

const DECRYPTED_INTEGRATION = {
  id: INTEGRATION_ID,
  knowledgeBaseId: 'kb-1',
  channel: ChannelType.MESSENGER,
  isActive: true,
  config: { pageAccessToken: 'EAAtest', appSecret: 'secret' },
};

const CHAT_RESULT = {
  session_id: 'sess-new',
  message_id: 'msg-1',
  content: 'Câu trả lời AI',
  latency_ms: 300,
  source: 'rag' as const,
};

function makeJob(overrides: Partial<{ integrationId: string; psid: string; text: string }> = {}) {
  return {
    data: {
      integrationId: INTEGRATION_ID,
      psid: PSID,
      text: 'Xin chào',
      ...overrides,
    },
  } as never;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MessengerProcessor', () => {
  let processor: MessengerProcessor;
  let prisma: { session: { findFirst: jest.Mock } };
  let integrationsService: { getWithDecryptedConfig: jest.Mock };
  let chatService: { chatInternal: jest.Mock };
  let messengerClient: { sendTyping: jest.Mock; sendMessage: jest.Mock };

  beforeEach(async () => {
    prisma = { session: { findFirst: jest.fn().mockResolvedValue(null) } };
    integrationsService = { getWithDecryptedConfig: jest.fn().mockResolvedValue(DECRYPTED_INTEGRATION) };
    chatService = { chatInternal: jest.fn().mockResolvedValue(CHAT_RESULT) };
    messengerClient = {
      sendTyping:  jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        MessengerProcessor,
        { provide: PrismaService,        useValue: prisma },
        { provide: IntegrationsService,  useValue: integrationsService },
        { provide: ChatService,          useValue: chatService },
        { provide: MessengerClient,      useValue: messengerClient },
      ],
    }).compile();

    processor = module.get(MessengerProcessor);
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  describe('Luồng bình thường', () => {
    it('gửi typing indicator trước khi chatInternal', async () => {
      const callOrder: string[] = [];
      messengerClient.sendTyping.mockImplementation(() => { callOrder.push('typing'); return Promise.resolve(); });
      chatService.chatInternal.mockImplementation(() => { callOrder.push('chat'); return Promise.resolve(CHAT_RESULT); });

      await processor.process(makeJob());

      expect(callOrder[0]).toBe('typing');
      expect(callOrder[1]).toBe('chat');
    });

    it('gọi chatInternal với đúng params', async () => {
      await processor.process(makeJob());

      expect(chatService.chatInternal).toHaveBeenCalledWith({
        message: 'Xin chào',
        sessionId: undefined,
        externalUserId: PSID,
        knowledgeBaseId: 'kb-1',
        channelIntegrationId: INTEGRATION_ID,
        channel: ChannelType.MESSENGER,
      });
    });

    it('gửi AI reply về Messenger', async () => {
      await processor.process(makeJob());

      expect(messengerClient.sendMessage).toHaveBeenCalledWith(
        PSID,
        'Câu trả lời AI',
        'EAAtest',
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

    it('tái sử dụng session cũ khi user đã chat trước đó', async () => {
      const existingSession = { id: 'sess-existing', externalUserId: PSID };
      prisma.session.findFirst.mockResolvedValue(existingSession);

      await processor.process(makeJob());

      expect(chatService.chatInternal).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'sess-existing' }),
      );
    });

    it('tìm session theo đúng integrationId và psid', async () => {
      await processor.process(makeJob());

      expect(prisma.session.findFirst).toHaveBeenCalledWith({
        where: { channelIntegrationId: INTEGRATION_ID, externalUserId: PSID },
        orderBy: { lastMessageAt: 'desc' },
      });
    });
  });

  // ─── Error handling ───────────────────────────────────────────────────────

  describe('Xử lý lỗi', () => {
    it('gửi thông báo lỗi tiếng Việt khi chatInternal throw', async () => {
      chatService.chatInternal.mockRejectedValue(new Error('AI provider down'));

      await processor.process(makeJob());

      expect(messengerClient.sendMessage).toHaveBeenCalledWith(
        PSID,
        'Xin lỗi, hệ thống đang bận. Vui lòng thử lại sau.',
        'EAAtest',
      );
    });

    it('vẫn gửi typing indicator dù chatInternal sau đó lỗi', async () => {
      chatService.chatInternal.mockRejectedValue(new Error('Timeout'));

      await processor.process(makeJob());

      expect(messengerClient.sendTyping).toHaveBeenCalled();
      expect(messengerClient.sendMessage).toHaveBeenCalledWith(
        PSID,
        expect.stringContaining('Xin lỗi'),
        'EAAtest',
      );
    });

    it('không throw ra ngoài khi chatInternal lỗi (giữ job không bị retry loop)', async () => {
      chatService.chatInternal.mockRejectedValue(new Error('Fatal'));

      await expect(processor.process(makeJob())).resolves.toBeUndefined();
    });
  });
});
