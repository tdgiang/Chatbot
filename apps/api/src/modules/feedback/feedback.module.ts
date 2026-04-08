import { Module } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { FeedbackPublicController, FeedbackCmsController } from './feedback.controller';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [ChatModule],          // để dùng ApiKeyGuard từ ChatModule
  providers: [FeedbackService],
  controllers: [FeedbackPublicController, FeedbackCmsController],
})
export class FeedbackModule {}
