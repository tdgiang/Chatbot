// Shared types used by both apps/api and apps/cms

export type MessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM';
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

// Chunk management
export interface ChunkDto {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  hasEmbedding: boolean;
  isEnabled: boolean;
  sourceSection: string | null;
  chunkType: string; // 'raw' | 'structural' | 'qa' | 'manual'
  createdAt: string;
  updatedAt: string;
}

export interface ChunkListResponse {
  data: ChunkDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateChunkRequest {
  content: string;
}

export interface UpdateChunkRequest {
  content: string;
}

// --- FAQ Override ---
export interface FaqDto {
  id: string;
  knowledgeBaseId: string;
  question: string;
  answer: string;
  isActive: boolean;
  priority: number;
  matchCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FaqListResponse {
  data: FaqDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateFaqRequest {
  knowledgeBaseId: string;
  question: string;
  answer: string;
  priority?: number;
}

export interface UpdateFaqRequest {
  question?: string;
  answer?: string;
  priority?: number;
}

// --- Chat Response (updated with source + message_id) ---
export interface ChatResponseV2 {
  session_id: string;
  message_id: string;
  message: { role: 'assistant'; content: string };
  latency_ms: number;
  source: 'faq' | 'rag';
}

// --- Answer Feedback ---
export interface SubmitFeedbackRequest {
  message_id: string;
  session_id: string;
  rating: 1 | -1;
  note?: string;
}

export interface FeedbackDto {
  id: string;
  messageId: string;
  sessionId: string;
  rating: 1 | -1;
  note?: string | null;
  createdAt: string;
  userQuestion?: string;
  botAnswer?: string;
}

export interface FeedbackListResponse {
  data: FeedbackDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface FeedbackStatsDto {
  total: number;
  positive: number;
  negative: number;
  positiveRate: number;
}
