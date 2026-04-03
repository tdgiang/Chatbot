# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

Vietnamese-language customer support chatbot platform (<500 chats/day) with:
- **RAG pipeline** — admins upload documents to build a Knowledge Base; questions are answered using vector-searched chunks
- **Public Chat API** — third-party websites embed the chatbot via API key
- **CMS Admin** — manage documents, system prompts, API keys, analytics

**Current status:** Greenfield. No code written yet. Start from Phase 1.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| CMS Frontend | Next.js (App Router) | 14.x |
| Backend API | NestJS | 10.x |
| ORM | Prisma | 5.x |
| Database | PostgreSQL + pgvector | 16.x |
| Queue | BullMQ + Redis | latest |
| AI (dev) | Groq API — `llama-3.1-8b-instant` | — |
| AI (prod) | Ollama — `llama3.1:8b` | latest |
| Embedding | `nomic-embed-text` via Ollama | — |
| Auth | NextAuth.js (CMS) + JWT + API Key (public) | — |
| Package manager | pnpm workspaces + Turborepo | 8.x |
| Language | TypeScript strict mode | 5.x |

---

## Monorepo Structure

```
chatbot-platform/
├── apps/
│   ├── cms/                    ← Next.js 14 CMS Admin
│   │   ├── app/
│   │   │   ├── (auth)/login/
│   │   │   ├── (dashboard)/
│   │   │   │   ├── documents/  ← Upload & manage documents
│   │   │   │   ├── chatbot/    ← System prompt / persona config
│   │   │   │   ├── api-keys/   ← Create / revoke API keys
│   │   │   │   ├── analytics/  ← Session & message logs
│   │   │   │   └── playground/ ← Live chatbot test
│   │   │   └── api/auth/       ← NextAuth handlers
│   │   ├── components/
│   │   ├── lib/
│   │   └── middleware.ts
│   └── api/                    ← NestJS Backend (port 4000)
│       └── src/
│           ├── modules/
│           │   ├── auth/        ← JWT strategy, JwtAuthGuard
│           │   ├── chat/        ← POST /api/v1/chat, streaming
│           │   ├── rag/         ← Vector search service
│           │   ├── documents/   ← Upload handler + BullMQ indexing worker
│           │   ├── knowledge/   ← KnowledgeBase CRUD
│           │   ├── api-keys/    ← API key management
│           │   └── analytics/   ← Session/message query
│           └── shared/
│               ├── prisma/      ← PrismaService
│               └── queues/      ← BullMQ worker definitions
├── packages/
│   ├── database/               ← Prisma schema + migrations
│   └── shared-types/           ← TypeScript types shared across apps
├── docker-compose.yml          ← postgres (pgvector/pg16), redis, ollama
├── docker-compose.prod.yml
├── .env.example
├── pnpm-workspace.yaml
└── turbo.json
```

---

## Commands

```bash
# First-time setup
pnpm install
docker-compose up -d
pnpm db:migrate               # runs prisma migrate dev
pnpm db:seed                  # creates default admin user

# Development
pnpm dev                      # CMS + API in parallel (Turborepo)
pnpm dev:api                  # API only
pnpm dev:cms                  # CMS only

# Database
pnpm db:migrate               # apply new migrations
pnpm db:studio                # Prisma Studio UI
pnpm db:reset                 # reset DB (dev only)

# Quality
pnpm typecheck                # TypeScript check across all packages
pnpm lint                     # ESLint
pnpm build                    # production build

# Ollama (run separately from docker-compose)
ollama pull llama3.1:8b
ollama pull nomic-embed-text
```

**After `prisma migrate`, run this SQL to enable pgvector:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding vector(768);
CREATE INDEX ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

---

## Environment Variables

```bash
DATABASE_URL="postgresql://postgres:password@localhost:5432/chatbot_db"
REDIS_URL="redis://localhost:6379"

# CMS Auth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-min-32-chars"

# AI — dev uses Groq, prod uses Ollama
AI_PROVIDER="groq"            # or "ollama"
GROQ_API_KEY="gsk_..."
GROQ_MODEL="llama-3.1-8b-instant"
# OLLAMA_BASE_URL="http://localhost:11434"
# OLLAMA_MODEL="llama3.1:8b"
# OLLAMA_EMBED_MODEL="nomic-embed-text"

# API
JWT_SECRET="your-jwt-secret"
API_PORT=4000
CMS_URL="http://localhost:3000"

# File Storage
UPLOAD_DIR="./uploads"
MAX_FILE_SIZE_MB=10
```

---

## Database Schema

```prisma
// packages/database/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  role      Role     @default(EDITOR)
  password  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@map("users")
}

enum Role { ADMIN EDITOR }

model KnowledgeBase {
  id           String     @id @default(cuid())
  name         String
  description  String?
  systemPrompt String     @default("Bạn là trợ lý AI hỗ trợ khách hàng. Trả lời bằng tiếng Việt, ngắn gọn và chính xác.")
  temperature  Float      @default(0.3)
  maxTokens    Int        @default(512)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  documents    Document[]
  apiKeys      ApiKey[]
  sessions     Session[]
  @@map("knowledge_bases")
}

model Document {
  id              String         @id @default(cuid())
  knowledgeBaseId String
  filename        String
  originalName    String
  mimeType        String
  fileSize        Int
  status          DocumentStatus @default(PENDING)
  errorMessage    String?
  chunkCount      Int            @default(0)
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  knowledgeBase   KnowledgeBase  @relation(fields: [knowledgeBaseId], references: [id], onDelete: Cascade)
  chunks          Chunk[]
  @@map("documents")
}

enum DocumentStatus { PENDING PROCESSING DONE FAILED }

model Chunk {
  id         String   @id @default(cuid())
  documentId String
  content    String
  chunkIndex Int
  // embedding column added via raw SQL: vector(768)
  createdAt  DateTime @default(now())
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  @@map("chunks")
}

model ApiKey {
  id              String        @id @default(cuid())
  knowledgeBaseId String
  name            String
  key             String        @unique   // store bcrypt hash
  isActive        Boolean       @default(true)
  allowedOrigins  String[]      @default([])
  rateLimit       Int           @default(100)  // requests/hour
  lastUsedAt      DateTime?
  createdAt       DateTime      @default(now())
  knowledgeBase   KnowledgeBase @relation(fields: [knowledgeBaseId], references: [id])
  sessions        Session[]
  @@map("api_keys")
}

model Session {
  id              String        @id @default(cuid())
  knowledgeBaseId String
  apiKeyId        String?
  externalUserId  String?
  createdAt       DateTime      @default(now())
  lastMessageAt   DateTime      @default(now())
  knowledgeBase   KnowledgeBase @relation(fields: [knowledgeBaseId], references: [id])
  apiKey          ApiKey?       @relation(fields: [apiKeyId], references: [id])
  messages        Message[]
  @@map("sessions")
}

model Message {
  id         String      @id @default(cuid())
  sessionId  String
  role       MessageRole
  content    String
  tokensUsed Int         @default(0)
  latencyMs  Int         @default(0)
  createdAt  DateTime    @default(now())
  session    Session     @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  @@map("messages")
}

enum MessageRole { USER ASSISTANT }
```

---

## API Contracts

### Public Chat API

```
POST /api/v1/chat
Authorization: Bearer {API_KEY}

Body: { "session_id"?: string, "message": string, "stream": boolean }

Non-stream response:
{ "session_id": string, "message": { "role": "assistant", "content": string }, "latency_ms": number }

Stream response (text/event-stream):
data: {"delta": "Xin ", "done": false}
data: {"delta": "", "done": true, "session_id": "..."}
```

### CMS Internal API (JWT-authenticated)

| Method | Path | Description |
|---|---|---|
| POST | `/cms/documents/upload` | Upload document |
| GET | `/cms/documents` | List documents |
| DELETE | `/cms/documents/:id` | Delete document + chunks |
| GET | `/cms/documents/:id/status` | Indexing status |
| POST | `/cms/api-keys` | Create API key |
| PATCH | `/cms/api-keys/:id/revoke` | Revoke API key |
| GET | `/cms/analytics/sessions` | List sessions |
| GET | `/cms/analytics/messages` | Message logs |
| GET/PATCH | `/cms/knowledge-base` | Get/update KB config |

---

## RAG Pipeline

### Indexing (document upload)
```
Upload → save to disk → Document(PENDING) → BullMQ "indexing" queue
Worker: parse (PDF/DOCX/TXT) → chunk (500 tokens, overlap 50) → embed (nomic-embed-text) → INSERT chunks → Document(DONE)
```

### Chat request
```
Validate API key → get knowledgeBaseId → create/get Session
→ embed question → vector search (cosine <=> , LIMIT 5 chunks)
→ build prompt: [system prompt] + [5 chunks] + [3 message history] + [user question]
→ stream Groq/Ollama → stream to client → save Message to DB
```

**Chunking:** 500 tokens, 50-token overlap, split on `\n\n` then `.`  
**Context window limit:** 5 chunks + 3 history messages

---

## Coding Conventions

### NestJS (API)
- One module per feature: `module`, `controller`, `service`, `dto/`
- `class-validator` + `class-transformer` on all DTOs
- `ApiKeyGuard` on public endpoints; `JwtAuthGuard` on CMS endpoints
- `LoggingInterceptor` on all requests; `GlobalExceptionFilter` for centralized error handling
- No business logic in controllers

### Next.js (CMS)
- Server Components by default; Client Components only for interactivity
- Fetch data in Server Components (no `useEffect` for data fetching)
- Server Actions for form submissions
- Tailwind CSS + shadcn/ui; zustand for global state if needed

### TypeScript
- `strict: true` everywhere; no `any` (use `unknown` + type narrowing)
- Shared types live in `packages/shared-types` and are imported by both apps
- Use `const enum` for enums

---

## Security Rules

- **API keys:** hash with `bcrypt` before storing; compare hash on validation
- **CORS:** only allow origins registered in `ApiKey.allowedOrigins`
- **File uploads:** accept only `.pdf`, `.docx`, `.txt`; validate MIME type server-side
- **Rate limiting:** 100 req/hour per API key (default, configurable)

## Error Handling Rules

- AI provider down → return `"Xin lỗi, hệ thống đang bận. Vui lòng thử lại sau."`
- No relevant context found → still answer but append a disclaimer
- Document processing failure → set `status: FAILED` and store `errorMessage`
- Cache question embeddings in Redis (TTL 5 min) when the same question is repeated

---

## Implementation Phases

### Phase 1 — Backend Foundation
1. Init pnpm workspace + turbo.json; scaffold `apps/api` (NestJS), `apps/cms` (Next.js), `packages/database`, `packages/shared-types`
2. Copy Prisma schema above → `docker-compose up -d` → `prisma migrate dev --name init` → run pgvector SQL
3. `AppModule` with PrismaService, BullMQ, ConfigModule
4. Module `Auth` (JWT), Module `Chat` (POST /api/v1/chat + ApiKeyGuard), Module `RAG` (vector search), Module `Documents` (upload + BullMQ worker)
5. `AiService` with a common interface; implement Groq provider (`groq-sdk`) and Ollama provider; switch via `AI_PROVIDER` env var
6. E2E smoke test: upload TXT → verify chunks in DB → call `/api/v1/chat` → verify context-grounded response

### Phase 2 — CMS
1. NestJS: Module `ApiKeys`, Module `KnowledgeBase`, Module `Analytics` (paginated)
2. Next.js CMS: sidebar layout, `/login` (NextAuth credentials), `/documents`, `/chatbot`, `/api-keys`, `/playground`, `/analytics`

### Phase 3–4 — Public widget + Deploy (TBD after Phase 2)

---

## Seed Data

Default admin — `admin@chatbot.local` / `Admin@123456` (change immediately after first login).  
Seed script: `packages/database/seed.ts`
