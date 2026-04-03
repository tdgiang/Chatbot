import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ApiKeyGuard } from './guards/api-key.guard';
import { RagModule } from '../rag/rag.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [RagModule, AiModule],
  providers: [ChatService, ApiKeyGuard],
  controllers: [ChatController],
})
export class ChatModule {}
