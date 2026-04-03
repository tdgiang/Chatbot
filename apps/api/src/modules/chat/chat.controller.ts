import { Controller, Post, Body, UseGuards, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiKeyGuard } from './guards/api-key.guard';
import { ChatService } from './chat.service';
import { CreateChatDto } from './dto/create-chat.dto';

@Controller('api/v1')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('chat')
  @UseGuards(ApiKeyGuard)
  async chat(
    @Body() dto: CreateChatDto,
    @Req() req: Request & { apiKey: { id: string; knowledgeBaseId: string } },
    @Res() res: Response,
  ) {
    const result = await this.chatService.chat(dto, req.apiKey.id, req.apiKey.knowledgeBaseId, res);
    if (!dto.stream && result) {
      res.json(result);
    }
  }
}
