import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ChannelType } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { IntegrationsService } from '../integrations.service';
import { ChatService } from '../../chat/chat.service';
import { MessengerClient } from '../clients/messenger.client';
import { MESSENGER_QUEUE, MessengerJob } from './messenger.constants';

@Processor(MESSENGER_QUEUE)
export class MessengerProcessor extends WorkerHost {
  private readonly logger = new Logger(MessengerProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrationsService: IntegrationsService,
    private readonly chatService: ChatService,
    private readonly messengerClient: MessengerClient,
  ) {
    super();
  }

  async process(job: Job<MessengerJob>): Promise<void> {
    const { integrationId, psid, text } = job.data;

    const integration = await this.integrationsService.getWithDecryptedConfig(integrationId);
    const config = integration.config as Record<string, string>;
    const pageAccessToken = config['pageAccessToken'] ?? '';

    // Gửi typing indicator ngay (không chờ AI)
    await this.messengerClient.sendTyping(psid, pageAccessToken);

    // Tìm session gần nhất cho user này trên kênh này (duy trì lịch sử hội thoại)
    const existingSession = await this.prisma.session.findFirst({
      where: { channelIntegrationId: integrationId, externalUserId: psid },
      orderBy: { lastMessageAt: 'desc' },
    });

    try {
      const result = await this.chatService.chatInternal({
        message: text,
        sessionId: existingSession?.id,
        externalUserId: psid,
        knowledgeBaseId: integration.knowledgeBaseId,
        channelIntegrationId: integrationId,
        channel: ChannelType.MESSENGER,
      });

      await this.messengerClient.sendMessage(psid, result.content, pageAccessToken);
      this.logger.debug(`Messenger reply sent: psid=${psid} source=${result.source}`);
    } catch (err) {
      this.logger.error(`Messenger chatInternal lỗi (psid=${psid}): ${err}`);
      await this.messengerClient.sendMessage(
        psid,
        'Xin lỗi, hệ thống đang bận. Vui lòng thử lại sau.',
        pageAccessToken,
      );
    }
  }
}
