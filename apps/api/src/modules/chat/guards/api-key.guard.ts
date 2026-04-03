import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Request } from 'express';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import type Redis from 'ioredis';
import { InjectRedis } from '@nestjs-modules/ioredis';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { apiKey?: { id: string; knowledgeBaseId: string } }>();

    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedException('Missing API key');

    const rawKey = authHeader.slice(7);

    // Find matching active key by comparing hashes
    const keys = await this.prisma.apiKey.findMany({ where: { isActive: true } });
    let matched = null;
    for (const k of keys) {
      if (await bcrypt.compare(rawKey, k.key)) { matched = k; break; }
    }
    if (!matched) throw new UnauthorizedException('Invalid API key');

    // CORS origin check
    const origin = req.headers['origin'];
    if (matched.allowedOrigins.length > 0 && origin) {
      if (!matched.allowedOrigins.includes(origin)) {
        throw new ForbiddenException('Origin not allowed');
      }
    }

    // Rate limit: rateLimit req/hour per key
    const rlKey = `rl:${matched.id}`;
    const count = await this.redis.incr(rlKey);
    if (count === 1) await this.redis.expire(rlKey, 3600);
    if (count > matched.rateLimit) {
      throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    // Update lastUsedAt (fire and forget)
    this.prisma.apiKey.update({ where: { id: matched.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

    req.apiKey = { id: matched.id, knowledgeBaseId: matched.knowledgeBaseId };
    return true;
  }
}
