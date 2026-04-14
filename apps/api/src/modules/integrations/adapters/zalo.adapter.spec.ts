/**
 * ZaloAdapter — unit tests
 * Kiểm tra verifySignature() và parseIncoming()
 */

import { createHmac } from 'crypto';
import { ZaloAdapter } from './zalo.adapter';

describe('ZaloAdapter', () => {
  let adapter: ZaloAdapter;

  beforeEach(() => {
    adapter = new ZaloAdapter();
  });

  // ─── verifySignature ──────────────────────────────────────────────────────

  describe('verifySignature()', () => {
    const secretKey = 'zalo-secret-key';
    const appId = 'OA-12345';
    const userId = 'USER-67890';

    function makeRawBody(overrides: Partial<Record<string, unknown>> = {}): Buffer {
      return Buffer.from(JSON.stringify({
        app_id: appId,
        user_id_by_app: userId,
        event_name: 'user_send_text',
        ...overrides,
      }));
    }

    function makeMAC(aId = appId, uId = userId): string {
      return createHmac('sha256', secretKey).update(aId + uId).digest('hex');
    }

    it('trả về true khi MAC hợp lệ', () => {
      const rawBody = makeRawBody();
      const mac = makeMAC();
      expect(adapter.verifySignature(rawBody, mac, secretKey)).toBe(true);
    });

    it('trả về false khi MAC sai secretKey', () => {
      const rawBody = makeRawBody();
      const mac = makeMAC(); // dùng secretKey gốc
      expect(adapter.verifySignature(rawBody, mac, 'wrong-secret')).toBe(false);
    });

    it('trả về false khi app_id trong body bị thay đổi', () => {
      const rawBody = makeRawBody({ app_id: 'TAMPERED-OA' });
      const mac = makeMAC(); // mac tính với appId gốc
      expect(adapter.verifySignature(rawBody, mac, secretKey)).toBe(false);
    });

    it('trả về false khi user_id_by_app bị thay đổi', () => {
      const rawBody = makeRawBody({ user_id_by_app: 'TAMPERED-USER' });
      const mac = makeMAC(); // mac tính với userId gốc
      expect(adapter.verifySignature(rawBody, mac, secretKey)).toBe(false);
    });

    it('trả về false khi rawBody không phải JSON hợp lệ', () => {
      expect(adapter.verifySignature(Buffer.from('not-json'), 'anymac', secretKey)).toBe(false);
    });

    it('trả về true khi secretKey rỗng (dev mode, bỏ qua verify)', () => {
      const rawBody = makeRawBody();
      expect(adapter.verifySignature(rawBody, 'any-mac', '')).toBe(true);
    });

    it('trả về false khi signature rỗng và secretKey có giá trị', () => {
      const rawBody = makeRawBody();
      expect(adapter.verifySignature(rawBody, '', secretKey)).toBe(false);
    });
  });

  // ─── parseIncoming ────────────────────────────────────────────────────────

  describe('parseIncoming()', () => {
    function makePayload(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        app_id: 'OA-ID',
        user_id_by_app: 'USER-111',
        event_name: 'user_send_text',
        message: { text: 'Xin chào', msg_id: 'msg-abc' },
        sender: { id: 'USER-111', display_name: 'Nguyễn Văn A' },
        recipient: { id: 'OA-ID' },
        ...overrides,
      };
    }

    it('parse đúng sender.id và text từ payload chuẩn', () => {
      const result = adapter.parseIncoming(makePayload());
      expect(result).toEqual({ channelUserId: 'USER-111', text: 'Xin chào' });
    });

    it('trả về null khi event_name không phải user_send_text', () => {
      expect(adapter.parseIncoming(makePayload({ event_name: 'user_send_image' }))).toBeNull();
      expect(adapter.parseIncoming(makePayload({ event_name: 'follow' }))).toBeNull();
      expect(adapter.parseIncoming(makePayload({ event_name: 'anti_block' }))).toBeNull();
    });

    it('trả về null khi message.text rỗng hoặc chỉ whitespace', () => {
      expect(adapter.parseIncoming(makePayload({ message: { text: '' } }))).toBeNull();
      expect(adapter.parseIncoming(makePayload({ message: { text: '   ' } }))).toBeNull();
    });

    it('trả về null khi message không có field text', () => {
      expect(adapter.parseIncoming(makePayload({ message: { msg_id: 'abc' } }))).toBeNull();
    });

    it('trả về null khi payload null', () => {
      expect(adapter.parseIncoming(null)).toBeNull();
    });

    it('trả về null khi payload không có event_name', () => {
      expect(adapter.parseIncoming({ sender: { id: 'U1' }, message: { text: 'hi' } })).toBeNull();
    });

    it('trim whitespace trong text trước khi trả về', () => {
      const result = adapter.parseIncoming(makePayload({ message: { text: '  Học phí?  ' } }));
      expect(result?.text).toBe('Học phí?');
    });
  });
});
