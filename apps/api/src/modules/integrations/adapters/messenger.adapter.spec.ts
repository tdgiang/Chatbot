/**
 * MessengerAdapter — unit tests
 * Kiểm tra verifySignature() và parseIncoming()
 */

import { createHmac } from 'crypto';
import { MessengerAdapter } from './messenger.adapter';

describe('MessengerAdapter', () => {
  let adapter: MessengerAdapter;

  beforeEach(() => {
    adapter = new MessengerAdapter();
  });

  // ─── verifySignature ──────────────────────────────────────────────────────

  describe('verifySignature()', () => {
    const appSecret = 'test-app-secret';
    const body = Buffer.from('{"object":"page"}');

    function makeSignature(secret: string, buf: Buffer): string {
      return `sha256=${createHmac('sha256', secret).update(buf).digest('hex')}`;
    }

    it('trả về true khi chữ ký hợp lệ', () => {
      const sig = makeSignature(appSecret, body);
      expect(adapter.verifySignature(body, sig, appSecret)).toBe(true);
    });

    it('trả về false khi chữ ký sai secret', () => {
      const sig = makeSignature('wrong-secret', body);
      expect(adapter.verifySignature(body, sig, appSecret)).toBe(false);
    });

    it('trả về false khi body bị thay đổi', () => {
      const sig = makeSignature(appSecret, body);
      const tamperedBody = Buffer.from('{"object":"page","extra":1}');
      expect(adapter.verifySignature(tamperedBody, sig, appSecret)).toBe(false);
    });

    it('trả về false khi signature thiếu prefix sha256=', () => {
      const rawHex = createHmac('sha256', appSecret).update(body).digest('hex');
      expect(adapter.verifySignature(body, rawHex, appSecret)).toBe(false);
    });

    it('trả về false khi signature rỗng', () => {
      expect(adapter.verifySignature(body, '', appSecret)).toBe(false);
    });

    it('trả về false khi signature độ dài khác nhau (timing-safe check)', () => {
      expect(adapter.verifySignature(body, 'sha256=short', appSecret)).toBe(false);
    });
  });

  // ─── parseIncoming ────────────────────────────────────────────────────────

  describe('parseIncoming()', () => {
    function makePayload(text: string, senderId = 'USER-123') {
      return {
        object: 'page',
        entry: [
          {
            id: 'PAGE-ID',
            messaging: [
              {
                sender: { id: senderId },
                recipient: { id: 'PAGE-ID' },
                timestamp: 1700000000000,
                message: { mid: 'mid-abc', text },
              },
            ],
          },
        ],
      };
    }

    it('parse đúng sender.id và text từ payload chuẩn', () => {
      const result = adapter.parseIncoming(makePayload('Xin chào'));
      expect(result).toEqual({ channelUserId: 'USER-123', text: 'Xin chào' });
    });

    it('trả về null khi object !== "page"', () => {
      const payload = { ...makePayload('hello'), object: 'instagram' };
      expect(adapter.parseIncoming(payload)).toBeNull();
    });

    it('trả về null khi message không có text (attachment/sticker)', () => {
      const payload = {
        object: 'page',
        entry: [
          {
            id: 'PAGE-ID',
            messaging: [
              {
                sender: { id: 'U1' },
                recipient: { id: 'PAGE-ID' },
                timestamp: 123,
                message: { mid: 'mid-1', attachments: [{ type: 'image' }] },
              },
            ],
          },
        ],
      };
      expect(adapter.parseIncoming(payload)).toBeNull();
    });

    it('trả về null khi entry rỗng', () => {
      expect(adapter.parseIncoming({ object: 'page', entry: [] })).toBeNull();
    });

    it('trả về null khi messaging rỗng', () => {
      const payload = { object: 'page', entry: [{ id: 'P', messaging: [] }] };
      expect(adapter.parseIncoming(payload)).toBeNull();
    });

    it('trả về null khi payload null', () => {
      expect(adapter.parseIncoming(null)).toBeNull();
    });

    it('lấy message đầu tiên khi có nhiều entry', () => {
      const payload = {
        object: 'page',
        entry: [
          {
            id: 'P1',
            messaging: [
              { sender: { id: 'U-A' }, recipient: { id: 'P' }, timestamp: 1, message: { mid: 'm1', text: 'Tin A' } },
            ],
          },
          {
            id: 'P2',
            messaging: [
              { sender: { id: 'U-B' }, recipient: { id: 'P' }, timestamp: 2, message: { mid: 'm2', text: 'Tin B' } },
            ],
          },
        ],
      };
      const result = adapter.parseIncoming(payload);
      expect(result?.channelUserId).toBe('U-A');
      expect(result?.text).toBe('Tin A');
    });
  });
});
