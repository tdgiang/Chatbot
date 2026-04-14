export interface IncomingMessage {
  /** User ID trên platform (PSID, sender.id, v.v.) */
  channelUserId: string;
  /** Nội dung tin nhắn đã chuẩn hóa */
  text: string;
  /** Gợi ý session — thread_ts (Slack) hoặc bỏ trống để dùng channelUserId */
  sessionHint?: string;
}

export interface IChannelAdapter {
  /** Xác thực chữ ký từ platform */
  verifySignature(rawBody: Buffer, signature: string, secret: string): boolean;
  /** Parse webhook payload thành IncomingMessage chuẩn, trả null nếu không phải text message */
  parseIncoming(payload: unknown): IncomingMessage | null;
}
