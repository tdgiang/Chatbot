import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { AiProvider } from '../ai.interface';
import { ChatMessage, AiOptions } from '@chatbot/shared-types';

@Injectable()
export class GroqProvider implements AiProvider {
  private readonly client: Groq;
  private readonly model: string;
  private readonly logger = new Logger(GroqProvider.name);

  constructor(private readonly config: ConfigService) {
    this.client = new Groq({ apiKey: config.get<string>('GROQ_API_KEY') ?? 'missing-key' });
    this.model = config.get<string>('GROQ_MODEL') ?? 'llama-3.1-8b-instant';
  }

  async chat(messages: ChatMessage[], options?: AiOptions): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role === 'USER' ? 'user' : m.role === 'SYSTEM' ? 'system' : 'assistant',
        content: m.content,
      })),
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 512,
    });
    return completion.choices[0]?.message?.content ?? '';
  }

  async *chatStream(messages: ChatMessage[], options?: AiOptions): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role === 'USER' ? 'user' : m.role === 'SYSTEM' ? 'system' : 'assistant',
        content: m.content,
      })),
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 512,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  // Groq không có embedding API — throw để AiService fallback sang Ollama
  async embed(_text: string): Promise<number[]> {
    throw new Error('Groq does not support embeddings. Use OllamaProvider for embed().');
  }
}
