import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { IChannelAdapter, IncomingMessage } from './base.adapter';

interface MessengerEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: { mid: string; text?: string };
}

interface MessengerPayload {
  object: string;
  entry: Array<{
    id: string;
    messaging: MessengerEvent[];
  }>;
}

@Injectable()
export class MessengerAdapter implements IChannelAdapter {
  /**
   * Xác thực X-Hub-Signature-256: sha256=<hex>
   * so sánh HMAC-SHA256(rawBody, appSecret)
   */
  verifySignature(rawBody: Buffer, signature: string, appSecret: string): boolean {
    const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  /**
   * Lấy text message đầu tiên từ webhook payload của Messenger.
   * Bỏ qua attachment, sticker, echo.
   */
  parseIncoming(payload: unknown): IncomingMessage | null {
    const body = payload as MessengerPayload;
    if (body?.object !== 'page') return null;

    for (const entry of body.entry ?? []) {
      for (const event of entry.messaging ?? []) {
        const text = event.message?.text;
        if (text) {
          return { channelUserId: event.sender.id, text };
        }
      }
    }
    return null;
  }
}
