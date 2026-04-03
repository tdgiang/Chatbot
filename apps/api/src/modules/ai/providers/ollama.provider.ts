import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider } from '../ai.interface';
import { ChatMessage, AiOptions } from '@chatbot/shared-types';

@Injectable()
export class OllamaProvider implements AiProvider {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly embedModel: string;
  private readonly logger = new Logger(OllamaProvider.name);

  constructor(private readonly config: ConfigService) {
    this.baseUrl = config.get<string>('OLLAMA_BASE_URL') ?? 'http://localhost:11434';
    this.model = config.get<string>('OLLAMA_MODEL') ?? 'llama3.1:8b';
    this.embedModel = config.get<string>('OLLAMA_EMBED_MODEL') ?? 'nomic-embed-text';
  }

  async chat(messages: ChatMessage[], options?: AiOptions): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map((m) => ({
          role: m.role === 'USER' ? 'user' : 'assistant',
          content: m.content,
        })),
        options: { temperature: options?.temperature ?? 0.3, num_predict: options?.maxTokens ?? 512 },
        stream: false,
      }),
    });
    const data = await res.json() as { message?: { content?: string } };
    return data.message?.content ?? '';
  }

  async *chatStream(messages: ChatMessage[], options?: AiOptions): AsyncIterable<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map((m) => ({
          role: m.role === 'USER' ? 'user' : 'assistant',
          content: m.content,
        })),
        options: { temperature: options?.temperature ?? 0.3, num_predict: options?.maxTokens ?? 512 },
        stream: true,
      }),
    });

    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const json = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
          if (json.message?.content) yield json.message.content;
        } catch { /* skip malformed */ }
      }
    }
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.embedModel, prompt: text }),
    });
    const data = await res.json() as { embedding?: number[] };
    return data.embedding ?? [];
  }
}
