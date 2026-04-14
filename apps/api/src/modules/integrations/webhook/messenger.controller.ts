import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  Res,
  HttpCode,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { MessengerAdapter } from '../adapters/messenger.adapter';
import { IntegrationsService } from '../integrations.service';
import { MESSENGER_QUEUE, MessengerJob } from './messenger.constants';

@Controller('webhooks/messenger')
export class MessengerController {
  private readonly logger = new Logger(MessengerController.name);

  constructor(
    private readonly adapter: MessengerAdapter,
    private readonly integrationsService: IntegrationsService,
    @InjectQueue(MESSENGER_QUEUE) private readonly queue: Queue<MessengerJob>,
  ) {}

  /**
   * GET /webhooks/messenger/:integrationId
   * Meta gọi lần đầu để verify webhook URL.
   * Trả về hub.challenge nếu verify_token khớp với config.
   */
  @Get(':integrationId')
  async verify(
    @Param('integrationId') integrationId: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    if (mode !== 'subscribe') {
      this.logger.warn(`Messenger verify: mode không hợp lệ "${mode}"`);
      return res.status(403).send('Forbidden');
    }

    try {
      const integration = await this.integrationsService.getWithDecryptedConfig(integrationId);
      const expectedToken = (integration.config as Record<string, string>)['verifyToken'];

      if (!expectedToken || expectedToken !== verifyToken) {
        this.logger.warn(`Messenger verify: verify_token không khớp (integration ${integrationId})`);
        return res.status(403).send('Forbidden');
      }

      return res.status(200).send(challenge);
    } catch {
      return res.status(403).send('Forbidden');
    }
  }

  /**
   * POST /webhooks/messenger/:integrationId
   * Nhận tin nhắn từ Messenger webhook.
   * 1. Verify HMAC-SHA256 signature
   * 2. Parse payload
   * 3. Enqueue BullMQ job
   * 4. Trả 200 ngay (< 5ms) — xử lý AI async trong processor
   */
  @Post(':integrationId')
  @HttpCode(200)
  async receive(
    @Param('integrationId') integrationId: string,
    @Req() req: RawBodyRequest<Request>,
    @Body() body: unknown,
  ) {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    if (!signature) {
      throw new BadRequestException('Thiếu X-Hub-Signature-256');
    }

    let integration: Awaited<ReturnType<IntegrationsService['getWithDecryptedConfig']>>;
    try {
      integration = await this.integrationsService.getWithDecryptedConfig(integrationId);
    } catch {
      // Không lộ thông tin integration không tồn tại
      throw new BadRequestException('Invalid integration');
    }

    const appSecret = (integration.config as Record<string, string>)['appSecret'] ?? '';
    // Ưu tiên rawBody (khi main.ts bật rawBody: true), fallback về re-serialize
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(body));

    if (!this.adapter.verifySignature(rawBody, signature, appSecret)) {
      this.logger.warn(`Messenger: chữ ký không hợp lệ (integration ${integrationId})`);
      throw new BadRequestException('Chữ ký không hợp lệ');
    }

    const incoming = this.adapter.parseIncoming(body);
    if (!incoming) {
      // Non-text event (sticker, attachment, echo) — bỏ qua nhưng vẫn 200
      return { ok: true };
    }

    await this.queue.add('handle', {
      integrationId,
      psid: incoming.channelUserId,
      text: incoming.text,
    });

    this.logger.debug(`Enqueued Messenger job: psid=${incoming.channelUserId}`);
    return { ok: true };
  }
}
