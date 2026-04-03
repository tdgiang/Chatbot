import { Module } from '@nestjs/common';
import { RagService } from './rag.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
