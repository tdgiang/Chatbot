import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

const ZALO_API = 'https://openapi.zalo.me/v3.0/oa/message/cs';
/** Giới hạn ký tự / tin của Zalo OA */
const MAX_MSG_LENGTH = 2000;

@Injectable()
export class ZaloClient {
  private readonly logger = new Logger(ZaloClient.name);

  /**
   * Gửi tin nhắn customer support về Zalo OA.
   * Tự động split nếu content > 2000 ký tự.
   *
   * API ref: POST https://openapi.zalo.me/v3.0/oa/message/cs
   * Header: access_token
   */
  async sendMessage(userId: string, text: string, accessToken: string): Promise<void> {
    const parts = this.splitText(text);

    for (const part of parts) {
      await axios.post(
        ZALO_API,
        {
          recipient: { user_id: userId },
          message: { text: part },
        },
        {
          headers: { access_token: accessToken, 'Content-Type': 'application/json' },
        },
      );
    }
  }

  /** Tách text dài thành các phần ≤ MAX_MSG_LENGTH, ngắt tại dấu cách */
  private splitText(text: string): string[] {
    if (text.length <= MAX_MSG_LENGTH) return [text];

    const parts: string[] = [];
    let remaining = text;

    while (remaining.length > MAX_MSG_LENGTH) {
      let cutAt = remaining.lastIndexOf(' ', MAX_MSG_LENGTH);
      if (cutAt <= 0) cutAt = MAX_MSG_LENGTH;
      parts.push(remaining.slice(0, cutAt).trim());
      remaining = remaining.slice(cutAt).trim();
    }

    if (remaining) parts.push(remaining);
    return parts;
  }
}
