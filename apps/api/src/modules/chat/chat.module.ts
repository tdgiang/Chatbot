import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ApiKeyGuard } from './guards/api-key.guard';
import { RagModule } from '../rag/rag.module';
import { AiModule } from '../ai/ai.module';
import { FaqModule } from '../faq/faq.module';

@Module({
  imports: [RagModule, AiModule, FaqModule],
  providers: [ChatService, ApiKeyGuard],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}
