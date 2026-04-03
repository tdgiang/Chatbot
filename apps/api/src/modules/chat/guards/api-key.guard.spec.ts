import { ExecutionContext, UnauthorizedException, ForbiddenException, HttpException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ApiKeyGuard } from './api-key.guard';

function makeContext(headers: Record<string, string>): ExecutionContext {
  const req = { headers, apiKey: undefined as unknown };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let prisma: { apiKey: { findMany: jest.Mock; update: jest.Mock } };
  let redis: { incr: jest.Mock; expire: jest.Mock; get: jest.Mock };
  let hashedKey: string;
  const RAW_KEY = 'sk-testkey123456789';

  beforeAll(async () => {
    hashedKey = await bcrypt.hash(RAW_KEY, 10);
  });

  beforeEach(() => {
    prisma = { apiKey: { findMany: jest.fn(), update: jest.fn().mockResolvedValue({}) } };
    redis = { incr: jest.fn().mockResolvedValue(1), expire: jest.fn(), get: jest.fn() };

    guard = new ApiKeyGuard(
      prisma as never,
      redis as never,
    );
  });

  const activeKey = () => ({
    id: 'key-1',
    key: hashedKey,
    isActive: true,
    allowedOrigins: [],
    rateLimit: 100,
    knowledgeBaseId: 'kb-1',
  });

  it('allows valid API key', async () => {
    prisma.apiKey.findMany.mockResolvedValue([activeKey()]);
    const ctx = makeContext({ authorization: `Bearer ${RAW_KEY}` });
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('throws UnauthorizedException when Authorization header is missing', async () => {
    const ctx = makeContext({});
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException for wrong key', async () => {
    prisma.apiKey.findMany.mockResolvedValue([activeKey()]);
    const ctx = makeContext({ authorization: 'Bearer sk-wrongkey' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException for inactive key', async () => {
    prisma.apiKey.findMany.mockResolvedValue([{ ...activeKey(), isActive: false }]);
    const ctx = makeContext({ authorization: `Bearer ${RAW_KEY}` });
    // findMany filters isActive:true, so returns empty
    prisma.apiKey.findMany.mockResolvedValue([]);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('throws ForbiddenException for disallowed origin', async () => {
    prisma.apiKey.findMany.mockResolvedValue([{
      ...activeKey(),
      allowedOrigins: ['https://allowed.com'],
    }]);
    const ctx = makeContext({
      authorization: `Bearer ${RAW_KEY}`,
      origin: 'https://evil.com',
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('allows request from whitelisted origin', async () => {
    prisma.apiKey.findMany.mockResolvedValue([{
      ...activeKey(),
      allowedOrigins: ['https://allowed.com'],
    }]);
    const ctx = makeContext({
      authorization: `Bearer ${RAW_KEY}`,
      origin: 'https://allowed.com',
    });
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('throws 429 when rate limit exceeded', async () => {
    prisma.apiKey.findMany.mockResolvedValue([{ ...activeKey(), rateLimit: 5 }]);
    redis.incr.mockResolvedValue(6); // already at 6, limit is 5
    const ctx = makeContext({ authorization: `Bearer ${RAW_KEY}` });
    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
    try {
      await guard.canActivate(ctx);
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(429);
    }
  });
});
