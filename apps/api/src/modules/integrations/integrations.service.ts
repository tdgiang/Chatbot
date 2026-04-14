import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { encryptConfig, decryptConfig } from '../../shared/crypto.util';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';
import { ChannelType } from '@prisma/client';

@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateIntegrationDto) {
    const existing = await this.prisma.channelIntegration.findUnique({
      where: { knowledgeBaseId_channel: { knowledgeBaseId: dto.knowledgeBaseId, channel: dto.channel } },
    });
    if (existing) {
      throw new ConflictException(`Kênh ${dto.channel} đã được cấu hình cho Knowledge Base này`);
    }

    const configEncrypted = encryptConfig(dto.config);
    const integration = await this.prisma.channelIntegration.create({
      data: {
        channel: dto.channel,
        name: dto.name,
        knowledgeBaseId: dto.knowledgeBaseId,
        configEncrypted,
        webhookSecret: dto.webhookSecret,
      },
    });

    return this.safeView(integration);
  }

  async findAll() {
    const rows = await this.prisma.channelIntegration.findMany({
      orderBy: { createdAt: 'desc' },
      include: { knowledgeBase: { select: { name: true } } },
    });
    return rows.map((r) => this.safeView(r));
  }

  async findOne(id: string) {
    const row = await this.prisma.channelIntegration.findUnique({
      where: { id },
      include: { knowledgeBase: { select: { name: true } } },
    });
    if (!row) throw new NotFoundException('Integration không tồn tại');
    return this.safeView(row);
  }

  async update(id: string, dto: UpdateIntegrationDto) {
    const existing = await this.prisma.channelIntegration.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Integration không tồn tại');

    const configEncrypted = dto.config
      ? encryptConfig(dto.config)
      : existing.configEncrypted;

    const updated = await this.prisma.channelIntegration.update({
      where: { id },
      data: {
        name: dto.name ?? existing.name,
        configEncrypted,
        webhookSecret: dto.webhookSecret ?? existing.webhookSecret,
        isActive: dto.isActive ?? existing.isActive,
      },
    });

    return this.safeView(updated);
  }

  async remove(id: string) {
    const existing = await this.prisma.channelIntegration.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Integration không tồn tại');
    await this.prisma.channelIntegration.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Dùng nội bộ bởi webhook adapters — trả về config đã giải mã
   */
  async getWithDecryptedConfig(id: string) {
    const row = await this.prisma.channelIntegration.findUnique({ where: { id } });
    if (!row || !row.isActive) throw new NotFoundException('Integration không tồn tại hoặc đã bị tắt');
    const config = decryptConfig<Record<string, string>>(row.configEncrypted);
    return { ...row, config };
  }

  /**
   * Lấy integration theo channel + knowledgeBaseId (dùng khi biết trước kênh)
   */
  async findByChannel(knowledgeBaseId: string, channel: ChannelType) {
    const row = await this.prisma.channelIntegration.findUnique({
      where: { knowledgeBaseId_channel: { knowledgeBaseId, channel } },
    });
    if (!row || !row.isActive) return null;
    const config = decryptConfig<Record<string, string>>(row.configEncrypted);
    return { ...row, config };
  }

  /** Loại bỏ configEncrypted — không bao giờ trả raw config về CMS API */
  private safeView(row: { configEncrypted?: string; [key: string]: unknown }) {
    const { configEncrypted: _, ...safe } = row;
    return safe;
  }
}
