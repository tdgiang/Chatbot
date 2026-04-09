import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, HttpCode, UseGuards,
  UseInterceptors, UploadedFile, Res,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FaqService } from './faq.service';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';
import { FaqQueryDto } from './dto/faq-query.dto';

@Controller('cms/faq')
@UseGuards(JwtAuthGuard)
export class FaqController {
  constructor(private readonly faqService: FaqService) {}

  @Get()
  list(@Query() query: FaqQueryDto) {
    return this.faqService.list(query);
  }

  /** Download file mẫu DOCX FAQ */
  @Get('template')
  async downloadTemplate(@Res() res: Response) {
    const buffer = await this.faqService.generateTemplateDocx();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="faq-template.docx"');
    res.send(buffer);
  }

  /** Import hàng loạt FAQ từ file .docx */
  @Post('import-docx')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async importDocx(
    @UploadedFile() file: Express.Multer.File,
    @Query('knowledgeBaseId') knowledgeBaseId: string,
  ) {
    if (!file) throw new BadRequestException('File là bắt buộc');
    if (!knowledgeBaseId) throw new BadRequestException('knowledgeBaseId là bắt buộc');
    return this.faqService.importFromDocx(file.buffer, knowledgeBaseId);
  }

  @Post()
  create(@Body() dto: CreateFaqDto) {
    return this.faqService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFaqDto) {
    return this.faqService.update(id, dto);
  }

  @Patch(':id/toggle')
  @HttpCode(200)
  toggle(@Param('id') id: string) {
    return this.faqService.toggle(id);
  }

  @Delete(':id')
  @HttpCode(200)
  remove(@Param('id') id: string) {
    return this.faqService.remove(id);
  }
}
