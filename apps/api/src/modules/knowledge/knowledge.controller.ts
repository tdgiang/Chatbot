import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { KnowledgeService } from './knowledge.service';
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto';

@Controller('cms/knowledge-base')
@UseGuards(JwtAuthGuard)
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get()
  get() {
    return this.knowledgeService.findFirst();
  }

  @Patch()
  update(@Body() dto: UpdateKnowledgeBaseDto) {
    return this.knowledgeService.update(dto);
  }
}
