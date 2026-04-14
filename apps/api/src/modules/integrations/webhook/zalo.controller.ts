import {
  Controller,
  Post,
  Param,
  Body,
  Req,
  HttpCode,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ZaloAdapter } from '../adapters/zalo.adapter';
import { IntegrationsService } from '../integrations.service';
import { ZALO_QUEUE, ZaloJob } from './zalo.constants';

@Controller('webhooks/zalo')
export class ZaloController {
  private readonly logger = new Logger(ZaloController.name);

  constructor(
    private readonly adapter: ZaloAdapter,
    private readonly integrationsService: IntegrationsService,
    @InjectQueue(ZALO_QUEUE) private readonly queue: Queue<ZaloJob>,
  ) {}

  /**
   * POST /webhooks/zalo/:integrationId
   * Nhận webhook từ Zalo OA.
   *
   * Zalo không có GET verify — chỉ dùng POST.
   * Xác thực qua MAC = HMAC-SHA256(app_id + user_id_by_app, secretKey)
   * có trong body.mac.
   *
   * 1. Verify MAC signature
   * 2. Parse payload (chỉ xử lý user_send_text)
   * 3. Enqueue BullMQ job
   * 4. Trả 200 ngay (< 5ms)
   */
  @Post(':integrationId')
  @HttpCode(200)
  async receive(
    @Param('integrationId') integrationId: string,
    @Req() req: RawBodyRequest<Request>,
    @Body() body: unknown,
  ) {
    let integration: Awaited<ReturnType<IntegrationsService['getWithDecryptedConfig']>>;
    try {
      integration = await this.integrationsService.getWithDecryptedConfig(integrationId);
    } catch {
      throw new BadRequestException('Invalid integration');
    }

    const config = integration.config as Record<string, string>;
    const secretKey = config['secretKey'] ?? '';

    // Ưu tiên rawBody (khi main.ts bật rawBody: true), fallback về re-serialize
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(body));

    // mac từ body (Zalo đặt MAC vào field body.mac)
    const mac = (body as Record<string, unknown>)?.['mac'] as string | undefined;
    const signature = mac ?? '';

    if (!this.adapter.verifySignature(rawBody, signature, secretKey)) {
      this.logger.warn(`Zalo: MAC không hợp lệ (integration ${integrationId})`);
      throw new BadRequestException('MAC không hợp lệ');
    }

    const incoming = this.adapter.parseIncoming(body);
    if (!incoming) {
      // Sự kiện không phải text (sticker, image, follow, v.v.) — vẫn 200
      return { ok: true };
    }

    await this.queue.add('handle', {
      integrationId,
      userId: incoming.channelUserId,
      text: incoming.text,
    });

    this.logger.debug(`Enqueued Zalo job: userId=${incoming.channelUserId}`);
    return { ok: true };
  }
}
