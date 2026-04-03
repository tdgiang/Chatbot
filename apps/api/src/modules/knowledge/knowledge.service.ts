import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto';

@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  async findFirst() {
    const kb = await this.prisma.knowledgeBase.findFirst();
    if (!kb) throw new NotFoundException('No knowledge base found');
    return kb;
  }

  async update(dto: UpdateKnowledgeBaseDto) {
    const kb = await this.findFirst();
    return this.prisma.knowledgeBase.update({ where: { id: kb.id }, data: dto });
  }
}
