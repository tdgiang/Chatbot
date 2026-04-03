import { ChatMessage, AiOptions } from '@chatbot/shared-types';

export interface AiProvider {
  chat(messages: ChatMessage[], options?: AiOptions): Promise<string>;
  chatStream(messages: ChatMessage[], options?: AiOptions): AsyncIterable<string>;
  embed(text: string): Promise<number[]>;
}
