export const ZALO_QUEUE = 'zalo';

export interface ZaloJob {
  integrationId: string;
  /** Zalo user_id_by_app (định danh user theo OA) */
  userId: string;
  /** Nội dung tin nhắn đã parse */
  text: string;
}
