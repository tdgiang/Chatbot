/**
 * ZaloClient — unit tests
 * Mock axios để kiểm tra sendMessage và split logic
 */

import { Test } from '@nestjs/testing';
import axios from 'axios';
import { ZaloClient } from './zalo.client';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const TOKEN   = 'eXlBbGciOiJSUzI1NiJ9test';
const USER_ID = 'ZALO-USER-123';
const ZALO_API = 'https://openapi.zalo.me/v3.0/oa/message/cs';

describe('ZaloClient', () => {
  let client: ZaloClient;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ZaloClient],
    }).compile();
    client = module.get(ZaloClient);
    jest.clearAllMocks();
  });

  // ─── sendMessage — tin ngắn ───────────────────────────────────────────────

  describe('sendMessage() — tin nhắn ≤ 2000 ký tự', () => {
    it('gọi Zalo API 1 lần với đúng payload và header', async () => {
      mockedAxios.post = jest.fn().mockResolvedValue({ data: { error: 0 } });
      const text = 'Xin chào! Chúng tôi có thể giúp gì cho bạn?';

      await client.sendMessage(USER_ID, text, TOKEN);

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        ZALO_API,
        { recipient: { user_id: USER_ID }, message: { text } },
        { headers: { access_token: TOKEN, 'Content-Type': 'application/json' } },
      );
    });

    it('gửi được tin nhắn vừa đúng 2000 ký tự (không split)', async () => {
      mockedAxios.post = jest.fn().mockResolvedValue({});
      const text = 'x'.repeat(2000);

      await client.sendMessage(USER_ID, text, TOKEN);

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      const body = (mockedAxios.post as jest.Mock).mock.calls[0][1] as { message: { text: string } };
      expect(body.message.text).toHaveLength(2000);
    });
  });

  // ─── sendMessage — auto split ─────────────────────────────────────────────

  describe('sendMessage() — tin nhắn > 2000 ký tự (auto-split)', () => {
    it('tách thành 2 phần khi text = 2001 ký tự, split tại dấu cách', async () => {
      mockedAxios.post = jest.fn().mockResolvedValue({});
      // 1990 ký tự + ' ' + 10 ký tự = 2001 tổng
      const text = 'a'.repeat(1990) + ' ' + 'b'.repeat(10);

      await client.sendMessage(USER_ID, text, TOKEN);

      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      const part1 = (mockedAxios.post as jest.Mock).mock.calls[0][1].message.text as string;
      const part2 = (mockedAxios.post as jest.Mock).mock.calls[1][1].message.text as string;
      expect(part1.length).toBeLessThanOrEqual(2000);
      expect(part2.length).toBeGreaterThan(0);
      expect((part1 + ' ' + part2).trim()).toBe(text.trim());
    });

    it('mỗi phần ≤ 2000 ký tự khi text rất dài (~6000 ký tự)', async () => {
      mockedAxios.post = jest.fn().mockResolvedValue({});
      const words = Array.from({ length: 600 }, (_, i) => `word${i}`);
      const text = words.join(' ');

      await client.sendMessage(USER_ID, text, TOKEN);

      for (const call of (mockedAxios.post as jest.Mock).mock.calls) {
        const part = (call[1] as { message: { text: string } }).message.text;
        expect(part.length).toBeLessThanOrEqual(2000);
      }
    });

    it('gửi theo thứ tự tuần tự', async () => {
      const callOrder: number[] = [];
      mockedAxios.post = jest.fn().mockImplementation(() => {
        callOrder.push(callOrder.length);
        return Promise.resolve({});
      });
      const text = 'a '.repeat(1500); // ~3000 ký tự

      await client.sendMessage(USER_ID, text, TOKEN);

      expect(callOrder).toEqual([0, 1]);
    });
  });
});
