export const MESSENGER_QUEUE = 'messenger';

export interface MessengerJob {
  integrationId: string;
  /** Messenger Page-Scoped User ID */
  psid: string;
  /** Nội dung tin nhắn đã parse */
  text: string;
}
