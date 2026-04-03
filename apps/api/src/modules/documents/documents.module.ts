import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { DocumentsProcessor, INDEXING_QUEUE } from './documents.processor';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: INDEXING_QUEUE }),
    AiModule,
  ],
  providers: [DocumentsService, DocumentsProcessor],
  controllers: [DocumentsController],
})
export class DocumentsModule {}
