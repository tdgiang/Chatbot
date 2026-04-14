import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

const GRAPH_API = 'https://graph.facebook.com/v19.0/me/messages';
/** Giới hạn ký tự / tin của Messenger */
const MAX_MSG_LENGTH = 640;

@Injectable()
export class MessengerClient {
  private readonly logger = new Logger(MessengerClient.name);

  /** Gửi typing indicator trước khi trả lời */
  async sendTyping(psid: string, pageAccessToken: string): Promise<void> {
    try {
      await axios.post(
        GRAPH_API,
        { recipient: { id: psid }, sender_action: 'typing_on' },
        { params: { access_token: pageAccessToken } },
      );
    } catch (err) {
      // Không ảnh hưởng đến luồng chính — chỉ log cảnh báo
      this.logger.warn(`Typing indicator thất bại cho PSID ${psid}: ${err}`);
    }
  }

  /**
   * Gửi text reply về Messenger.
   * Tự động split nếu content > 640 ký tự.
   */
  async sendMessage(psid: string, text: string, pageAccessToken: string): Promise<void> {
    const parts = this.splitText(text);
    for (const part of parts) {
      await axios.post(
        GRAPH_API,
        { recipient: { id: psid }, message: { text: part } },
        { params: { access_token: pageAccessToken } },
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
