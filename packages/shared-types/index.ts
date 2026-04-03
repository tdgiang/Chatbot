// Shared types used by both apps/api and apps/cms

export type MessageRole = 'USER' | 'ASSISTANT';
export type DocumentStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
export type Role = 'ADMIN' | 'EDITOR';

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

export interface ChatRequest {
  session_id?: string;
  message: string;
  stream?: boolean;
}

export interface ChatResponse {
  session_id: string;
  message: {
    role: 'assistant';
    content: string;
  };
  latency_ms: number;
}

export interface ChatStreamChunk {
  delta: string;
  done: boolean;
  session_id?: string;
}

export interface AiOptions {
  temperature?: number;
  maxTokens?: number;
}
