import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { RedisModule } from '@nestjs-modules/ioredis';
import { PrismaModule } from './shared/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { AiModule } from './modules/ai/ai.module';
import { RagModule } from './modules/rag/rag.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ChatModule } from './modules/chat/chat.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    RedisModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'single',
        url: config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
      }),
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: new URL(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379').hostname,
          port: parseInt(
            new URL(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379').port || '6379',
          ),
        },
      }),
    }),

    PrismaModule,
    AuthModule,
    AiModule,
    RagModule,
    DocumentsModule,
    ChatModule,
    ApiKeysModule,
    KnowledgeModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
