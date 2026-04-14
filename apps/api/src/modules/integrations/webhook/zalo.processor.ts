import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ChannelType } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { IntegrationsService } from '../integrations.service';
import { ChatService } from '../../chat/chat.service';
import { ZaloClient } from '../clients/zalo.client';
import { ZALO_QUEUE, ZaloJob } from './zalo.constants';

@Processor(ZALO_QUEUE)
export class ZaloProcessor extends WorkerHost {
  private readonly logger = new Logger(ZaloProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrationsService: IntegrationsService,
    private readonly chatService: ChatService,
    private readonly zaloClient: ZaloClient,
  ) {
    super();
  }

  async process(job: Job<ZaloJob>): Promise<void> {
    const { integrationId, userId, text } = job.data;

    const integration = await this.integrationsService.getWithDecryptedConfig(integrationId);
    const config = integration.config as Record<string, string>;
    const accessToken = config['accessToken'] ?? '';

    // Tìm session gần nhất cho user này trên kênh này
    const existingSession = await this.prisma.session.findFirst({
      where: { channelIntegrationId: integrationId, externalUserId: userId },
      orderBy: { lastMessageAt: 'desc' },
    });

    try {
      const result = await this.chatService.chatInternal({
        message: text,
        sessionId: existingSession?.id,
        externalUserId: userId,
        knowledgeBaseId: integration.knowledgeBaseId,
        channelIntegrationId: integrationId,
        channel: ChannelType.ZALO,
      });

      await this.zaloClient.sendMessage(userId, result.content, accessToken);
      this.logger.debug(`Zalo reply sent: userId=${userId} source=${result.source}`);
    } catch (err) {
      this.logger.error(`Zalo chatInternal lỗi (userId=${userId}): ${err}`);
      await this.zaloClient.sendMessage(
        userId,
        'Xin lỗi, hệ thống đang bận. Vui lòng thử lại sau.',
        accessToken,
      );
    }
  }
}
