import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { MessengerAdapter } from './adapters/messenger.adapter';
import { MessengerClient } from './clients/messenger.client';
import { MessengerController } from './webhook/messenger.controller';
import { MessengerProcessor } from './webhook/messenger.processor';
import { MESSENGER_QUEUE } from './webhook/messenger.constants';
import { ZaloAdapter } from './adapters/zalo.adapter';
import { ZaloClient } from './clients/zalo.client';
import { ZaloController } from './webhook/zalo.controller';
import { ZaloProcessor } from './webhook/zalo.processor';
import { ZALO_QUEUE } from './webhook/zalo.constants';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: MESSENGER_QUEUE }),
    BullModule.registerQueue({ name: ZALO_QUEUE }),
    ChatModule,
  ],
  controllers: [IntegrationsController, MessengerController, ZaloController],
  providers: [
    IntegrationsService,
    MessengerAdapter, MessengerClient, MessengerProcessor,
    ZaloAdapter, ZaloClient, ZaloProcessor,
  ],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
