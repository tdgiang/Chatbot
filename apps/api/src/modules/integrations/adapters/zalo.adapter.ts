import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { IChannelAdapter, IncomingMessage } from './base.adapter';

/**
 * Payload chuẩn của Zalo OA webhook (user_send_text)
 */
interface ZaloPayload {
  app_id: string;
  user_id_by_app: string;
  event_name: string;
  message?: { text?: string; msg_id?: string };
  sender: { id: string; display_name?: string };
  recipient: { id: string };
  timestamp?: number;
  mac?: string;
}

@Injectable()
export class ZaloAdapter implements IChannelAdapter {
  /**
   * Xác thực MAC signature của Zalo OA.
   *
   * Zalo tính MAC = HMAC-SHA256(app_id + user_id_by_app, secretKey)
   * và đặt vào field `mac` trong body.
   *
   * `rawBody` dùng để trích xuất app_id + user_id_by_app thông qua `signature`
   * (signature = giá trị field `mac` đã được parse từ body JSON).
   *
   * Nếu secretKey rỗng → bỏ qua verify (môi trường dev / chưa cấu hình).
   */
  verifySignature(rawBody: Buffer, signature: string, secretKey: string): boolean {
    if (!secretKey) return true; // dev mode: chưa cấu hình secretKey

    let payload: ZaloPayload;
    try {
      payload = JSON.parse(rawBody.toString('utf-8')) as ZaloPayload;
    } catch {
      return false;
    }

    const appId = payload.app_id ?? '';
    const userId = payload.user_id_by_app ?? '';
    const expected = createHmac('sha256', secretKey)
      .update(appId + userId)
      .digest('hex');

    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  /**
   * Parse Zalo OA webhook payload.
   * Chỉ xử lý event_name = "user_send_text".
   */
  parseIncoming(payload: unknown): IncomingMessage | null {
    const body = payload as ZaloPayload;

    if (!body || body.event_name !== 'user_send_text') return null;

    const text = body.message?.text?.trim();
    if (!text) return null;

    return {
      channelUserId: body.sender.id,
      text,
    };
  }
}
