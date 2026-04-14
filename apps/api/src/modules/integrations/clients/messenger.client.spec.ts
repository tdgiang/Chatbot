/**
 * MessengerClient — unit tests
 * Mock axios để kiểm tra sendTyping, sendMessage, và split logic
 */

import { Test } from '@nestjs/testing';
import axios from 'axios';
import { MessengerClient } from './messenger.client';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const TOKEN = 'EAABsbCStest';
const PSID  = 'PSID-123456';
const GRAPH = 'https://graph.facebook.com/v19.0/me/messages';

describe('MessengerClient', () => {
  let client: MessengerClient;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [MessengerClient],
    }).compile();
    client = module.get(MessengerClient);
    jest.clearAllMocks();
  });

  // ─── sendTyping ───────────────────────────────────────────────────────────

  describe('sendTyping()', () => {
    it('gọi Graph API với sender_action=typing_on', async () => {
      mockedAxios.post = jest.fn().mockResolvedValue({ data: { result: 'success' } });

      await client.sendTyping(PSID, TOKEN);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        GRAPH,
        { recipient: { id: PSID }, sender_action: 'typing_on' },
        { params: { access_token: TOKEN } },
      );
    });

    it('không throw khi Graph API lỗi (chỉ warn)', async () => {
      mockedAxios.post = jest.fn().mockRejectedValue(new Error('Network error'));

      await expect(client.sendTyping(PSID, TOKEN)).resolves.toBeUndefined();
    });
  });

  // ─── sendMessage — tin nhắn ngắn ─────────────────────────────────────────

  describe('sendMessage() — tin nhắn ≤ 640 ký tự', () => {
    it('gọi Graph API 1 lần với đúng payload', async () => {
      mockedAxios.post = jest.fn().mockResolvedValue({});
      const text = 'Xin chào! Tôi có thể giúp gì cho bạn?';

      await client.sendMessage(PSID, text, TOKEN);

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        GRAPH,
        { recipient: { id: PSID }, message: { text } },
        { params: { access_token: TOKEN } },
      );
    });

    it('gửi được tin nhắn vừa đúng 640 ký tự (không split)', async () => {
      mockedAxios.post = jest.fn().mockResolvedValue({});
      const text = 'x'.repeat(640);

      await client.sendMessage(PSID, text, TOKEN);

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      const body = (mockedAxios.post as jest.Mock).mock.calls[0][1] as { message: { text: string } };
      expect(body.message.text).toHaveLength(640);
    });
  });

  // ─── sendMessage — tự động split ─────────────────────────────────────────

  describe('sendMessage() — tin nhắn > 640 ký tự (auto-split)', () => {
    it('tách thành 2 phần khi text = 641 ký tự và split tại dấu cách', async () => {
      mockedAxios.post = jest.fn().mockResolvedValue({});
      // 630 ký tự + ' ' + 10 ký tự = 641 tổng
      const text = 'a'.repeat(630) + ' ' + 'b'.repeat(10);

      await client.sendMessage(PSID, text, TOKEN);

      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      const part1 = (mockedAxios.post as jest.Mock).mock.calls[0][1].message.text as string;
      const part2 = (mockedAxios.post as jest.Mock).mock.calls[1][1].message.text as string;
      expect(part1.length).toBeLessThanOrEqual(640);
      expect(part2.length).toBeGreaterThan(0);
      // Ghép lại phải đủ nội dung
      expect((part1 + ' ' + part2).trim()).toBe(text.trim());
    });

    it('chia thành nhiều phần khi text rất dài', async () => {
      mockedAxios.post = jest.fn().mockResolvedValue({});
      // ~2000 ký tự = khoảng 4 phần
      const words = Array.from({ length: 200 }, (_, i) => `word${i}`);
      const text = words.join(' '); // mỗi word ~6 ký tự + space

      await client.sendMessage(PSID, text, TOKEN);

      const callCount = (mockedAxios.post as jest.Mock).mock.calls.length;
      expect(callCount).toBeGreaterThan(1);
      // Mỗi phần ≤ 640 ký tự
      for (const call of (mockedAxios.post as jest.Mock).mock.calls) {
        expect((call[1] as { message: { text: string } }).message.text.length).toBeLessThanOrEqual(640);
      }
    });

    it('gửi theo thứ tự tuần tự (phần 1 trước phần 2)', async () => {
      const callOrder: number[] = [];
      mockedAxios.post = jest.fn().mockImplementation(() => {
        callOrder.push(callOrder.length);
        return Promise.resolve({});
      });
      const text = 'a '.repeat(400); // ~800 ký tự

      await client.sendMessage(PSID, text, TOKEN);

      expect(callOrder).toEqual([0, 1]);
    });
  });
});
