import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateApiKeyDto) {
    const rawKey = `sk-${randomBytes(32).toString('hex')}`;
    const hashedKey = await bcrypt.hash(rawKey, 10);

    const apiKey = await this.prisma.apiKey.create({
      data: {
        name: dto.name,
        knowledgeBaseId: dto.knowledgeBaseId,
        key: hashedKey,
        allowedOrigins: dto.allowedOrigins ?? [],
        rateLimit: dto.rateLimit ?? 100,
      },
    });

    // Return raw key only once
    return { ...apiKey, rawKey };
  }

  findAll() {
    return this.prisma.apiKey.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async revoke(id: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundException('API key not found');
    return this.prisma.apiKey.update({ where: { id }, data: { isActive: false } });
  }
}
