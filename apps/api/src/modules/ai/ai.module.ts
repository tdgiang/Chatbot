import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { GroqProvider } from './providers/groq.provider';
import { OllamaProvider } from './providers/ollama.provider';

@Module({
  providers: [AiService, GroqProvider, OllamaProvider],
  exports: [AiService],
})
export class AiModule {}
