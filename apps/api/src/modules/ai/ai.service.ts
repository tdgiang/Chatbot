import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GroqProvider } from './providers/groq.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { ChatMessage, AiOptions } from '@chatbot/shared-types';

const FALLBACK_MSG = 'Xin lỗi, hệ thống đang bận. Vui lòng thử lại sau.';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly provider: string;

  constructor(
    private readonly config: ConfigService,
    private readonly groq: GroqProvider,
    private readonly ollama: OllamaProvider,
  ) {
    this.provider = config.get<string>('AI_PROVIDER') ?? 'groq';
  }

  async chat(messages: ChatMessage[], options?: AiOptions): Promise<string> {
    try {
      return await (this.provider === 'ollama' ? this.ollama : this.groq).chat(messages, options);
    } catch (err) {
      this.logger.error('AI chat failed', err);
      return FALLBACK_MSG;
    }
  }

  async *chatStream(messages: ChatMessage[], options?: AiOptions): AsyncIterable<string> {
    try {
      const stream = this.provider === 'ollama'
        ? this.ollama.chatStream(messages, options)
        : this.groq.chatStream(messages, options);
      for await (const chunk of stream) yield chunk;
    } catch (err) {
      this.logger.error('AI stream failed', err);
      yield FALLBACK_MSG;
    }
  }

  // Embedding dùng Ollama (Groq không hỗ trợ)
  async embed(text: string): Promise<number[]> {
    try {
      return await this.ollama.embed(text);
    } catch (err) {
      this.logger.error('Embedding failed', err);
      return [];
    }
  }
}
