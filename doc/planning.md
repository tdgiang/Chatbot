# Project Execution Plan — Chatbot Platform

**Người thực hiện:** Solo  
**Ngày bắt đầu:** 2026-04-03  
**Ước tính hoàn thành Phase 1–2:** ~14 ngày làm việc  
**Testing:** Jest (unit + integration)  
**Deploy:** TBD (Phase 3–4 chưa lên kế hoạch)

---

## Assumptions & Blockers

| # | Nội dung | Trạng thái |
|---|---|---|
| A1 | Groq API key chưa có — cần đăng ký tại [console.groq.com](https://console.groq.com) (free tier) trước khi bắt Phase 2 Step 4 | ⚠️ Cần làm |
| A2 | Docker Desktop cần được cài và chạy trước Phase 0 | Kiểm tra trước khi bắt đầu |
| A3 | Ollama chạy local chỉ cần thiết cho production — dev dùng Groq | OK |
| A4 | Phase 3–4 (deploy, widget) sẽ được lên kế hoạch sau khi Phase 2 hoàn thành | Pending |

---

## Tổng quan Timeline

```
Tuần 1 (Day 1–5):   Phase 0 → Phase 1 → Phase 2 (NestJS core + AI)
Tuần 2 (Day 6–10):  Phase 2 (hoàn thiện + tests) → Phase 3 (CMS backend)
Tuần 3 (Day 11–14): Phase 4 (Next.js CMS) → Phase 5 (integration & smoke test)
```

---

## Phase 0 — Chuẩn bị môi trường
**Ước tính:** 2–3 giờ | **Phải hoàn thành trước khi viết code**

### Checklist cài đặt
- [ ] Node.js 20 LTS (`node -v` để kiểm tra)
- [ ] pnpm 8.x — `npm install -g pnpm`
- [ ] Docker Desktop (bật và chạy được `docker ps`)
- [ ] NestJS CLI — `pnpm add -g @nestjs/cli`
- [ ] Git khởi tạo repo

### Checklist tài khoản & keys
- [ ] Đăng ký [console.groq.com](https://console.groq.com) → lấy `GROQ_API_KEY`
- [ ] Tạo file `.env` từ `.env.example` và điền key

### Kiểm tra xong khi
```bash
node -v        # v20.x
pnpm -v        # 8.x
docker ps      # no error
nest --version # 10.x
```

---

## Phase 1 — Monorepo & Database
**Ước tính:** 4–6 giờ (Day 1–2)

### Step 1.1 — Khởi tạo monorepo
- [ ] Tạo `pnpm-workspace.yaml`
  ```yaml
  packages:
    - 'apps/*'
    - 'packages/*'
  ```
- [ ] Tạo `turbo.json` với pipeline `build`, `dev`, `typecheck`, `lint`
- [ ] Tạo `package.json` root với scripts: `dev`, `build`, `typecheck`, `lint`, `db:migrate`, `db:seed`, `db:studio`, `db:reset`

### Step 1.2 — Scaffold apps
- [ ] `cd apps && nest new api --package-manager pnpm` → NestJS app
- [ ] `cd apps && npx create-next-app@14 cms --typescript --tailwind --app --src-dir no` → Next.js app
- [ ] Cấu hình `tsconfig.json` `strict: true` ở cả hai app

### Step 1.3 — Packages
- [ ] Tạo `packages/database/` với `package.json`, `schema.prisma` (copy từ CLAUDE.md)
- [ ] Tạo `packages/shared-types/` với `index.ts` export các types dùng chung
- [ ] Cài `prisma` và `@prisma/client` vào `packages/database`

### Step 1.4 — Docker & Database
- [ ] Tạo `docker-compose.yml` (postgres pgvector/pg16, redis:7-alpine, ollama)
- [ ] `docker-compose up -d`
- [ ] `pnpm db:migrate` — `prisma migrate dev --name init`
- [ ] Chạy SQL pgvector:
  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding vector(768);
  CREATE INDEX ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
  ```
- [ ] `pnpm db:studio` → xác nhận schema đúng

### Step 1.5 — Seed data
- [ ] Tạo `packages/database/seed.ts` — tạo admin user `admin@chatbot.local` / `Admin@123456`
- [ ] Thêm script `db:seed` chạy seed

### Kiểm tra xong khi
- Docker containers chạy: `docker ps` thấy postgres, redis
- Prisma Studio mở được, thấy đủ các bảng
- Seed chạy thành công, user admin xuất hiện trong DB

---

## Phase 2 — NestJS API Backend
**Ước tính:** 4–5 ngày (Day 2–7)

### Step 2.1 — App infrastructure (4 giờ)
- [ ] `AppModule`: import `ConfigModule.forRoot()`, `PrismaModule`, `BullModule`
- [ ] `PrismaService` trong `shared/prisma/` — extend `PrismaClient`, implement `onModuleInit`
- [ ] `GlobalExceptionFilter` — bắt tất cả exceptions, format response chuẩn
- [ ] `LoggingInterceptor` — log method, path, status, latency

### Step 2.2 — Module Auth (4 giờ)
- [ ] `POST /cms/auth/login` — nhận email/password, trả JWT
- [ ] `JwtStrategy` (passport-jwt) — validate token, attach user vào request
- [ ] `JwtAuthGuard` — dùng cho tất cả CMS endpoints
- [ ] Hash password bằng `bcrypt` khi seed và khi tạo user

**Tests (Jest):**
- [ ] Unit test `AuthService.validateUser()` — đúng password, sai password
- [ ] Unit test JWT generation

### Step 2.3 — Module Documents + BullMQ Worker (1 ngày)
- [ ] `POST /cms/documents/upload` — nhận file (multer), validate MIME (pdf/docx/txt), lưu disk, tạo `Document(PENDING)`, push job vào queue
- [ ] `GET /cms/documents` — list với status badge
- [ ] `DELETE /cms/documents/:id` — xóa file + cascade chunks
- [ ] `GET /cms/documents/:id/status` — polling endpoint
- [ ] BullMQ worker `IndexingWorker`:
  - Parse file: PDF (`pdf-parse`), DOCX (`mammoth`), TXT (raw read)
  - Chunk: 500 tokens, overlap 50, split trên `\n\n` trước rồi `.`
  - Embed từng chunk: gọi Ollama `nomic-embed-text` (hoặc mock trong dev)
  - `INSERT INTO chunks (content, chunkIndex, embedding)` bằng raw SQL (Prisma không hỗ trợ vector type)
  - Cập nhật `Document.status = DONE`, `chunkCount`
  - Lỗi → `Document.status = FAILED`, lưu `errorMessage`

**Tests (Jest):**
- [ ] Unit test chunking function — đầu vào dài → đúng số chunks, đúng overlap
- [ ] Integration test upload flow — mock BullMQ queue, kiểm tra Document được tạo đúng status

### Step 2.4 — Module RAG — Vector Search (3 giờ)
- [ ] `RagService.search(question: string, knowledgeBaseId: string): Chunk[]`
  - Embed câu hỏi (Ollama hoặc Groq — xem note AI bên dưới)
  - Raw SQL: `SELECT content FROM chunks ORDER BY embedding <=> $1 LIMIT 5`
  - Cache embedding trong Redis TTL 5 phút (key = hash của question)
- [ ] `RagService.buildPrompt(systemPrompt, chunks, history, question): string`

**Tests (Jest):**
- [ ] Unit test `buildPrompt()` — đúng format, đúng số chunks/history

### Step 2.5 — Module Chat (4 giờ)
- [ ] `ApiKeyGuard` — extract Bearer token, hash + lookup trong DB, kiểm tra `isActive`, kiểm tra CORS origin header, kiểm tra rate limit (Redis counter TTL 1h)
- [ ] `POST /api/v1/chat`:
  - Tạo hoặc lấy `Session` từ `session_id`
  - Gọi `RagService.search()` → build prompt
  - Gọi `AiService.chat()` (streaming hoặc non-streaming)
  - Stream SSE về client
  - Lưu `Message` (USER + ASSISTANT) vào DB
- [ ] Error handling: AI down → trả về fallback message tiếng Việt

**Tests (Jest):**
- [ ] Unit test `ApiKeyGuard` — valid key, inactive key, wrong origin, rate limit exceeded
- [ ] Unit test `ChatService` — mock RagService + AiService, kiểm tra Message được lưu

### Step 2.6 — AiService (3 giờ)
Interface chung:
```typescript
interface AiProvider {
  chat(messages: ChatMessage[], options: AiOptions): Promise<string>
  chatStream(messages: ChatMessage[], options: AiOptions): AsyncIterable<string>
  embed(text: string): Promise<number[]>
}
```
- [ ] `GroqProvider` — dùng `groq-sdk`, model `llama-3.1-8b-instant`
- [ ] `OllamaProvider` — gọi `http://localhost:11434/api/chat` và `/api/embeddings`
- [ ] Switch qua `AI_PROVIDER` env var trong `AiModule`
- [ ] Fallback: nếu provider throw error → trả `"Xin lỗi, hệ thống đang bận. Vui lòng thử lại sau."`

> **Note về embedding trong dev:** Groq không có embedding API. Trong dev, dùng Ollama chỉ cho embedding (cần `ollama pull nomic-embed-text`), còn inference dùng Groq. Hoặc mock embedding khi chạy test.

**Tests (Jest):**
- [ ] Unit test `AiService` với mock providers — đúng provider được chọn theo env

### Step 2.7 — CMS Backend Modules (1 ngày)
- [ ] **Module ApiKeys**: `POST /cms/api-keys` (generate random key, hash + lưu), `GET /cms/api-keys`, `PATCH /cms/api-keys/:id/revoke`
- [ ] **Module KnowledgeBase**: `GET /cms/knowledge-base`, `PATCH /cms/knowledge-base` (system prompt, temperature, maxTokens)
- [ ] **Module Analytics**: `GET /cms/analytics/sessions` (pagination), `GET /cms/analytics/messages` (pagination, filter by sessionId)

### Kiểm tra Phase 2 xong khi
```bash
# Upload file
curl -X POST http://localhost:4000/cms/documents/upload \
  -H "Authorization: Bearer {JWT}" \
  -F "file=@test.txt" -F "knowledgeBaseId=..."

# Đợi worker xử lý, kiểm tra status DONE
curl http://localhost:4000/cms/documents/{id}/status

# Chat
curl -X POST http://localhost:4000/api/v1/chat \
  -H "Authorization: Bearer {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"message": "câu hỏi liên quan đến file vừa upload", "stream": false}'
# → response phải có context từ file
```

---

## Phase 3 — Next.js CMS Frontend
**Ước tính:** 4–5 ngày (Day 8–13)

### Step 3.1 — Setup CMS (3 giờ)
- [ ] Cài shadcn/ui: `npx shadcn-ui@latest init`
- [ ] Cài NextAuth.js: config Credentials provider, gọi `POST /cms/auth/login` lấy JWT
- [ ] `middleware.ts` — redirect về `/login` nếu chưa auth
- [ ] Dashboard layout với sidebar (links: Documents, Chatbot, API Keys, Playground, Analytics)
- [ ] Tạo `lib/api-client.ts` — wrapper fetch tự động đính kèm JWT

### Step 3.2 — Trang /documents (4 giờ)
- [ ] Bảng danh sách documents: tên file, kích thước, trạng thái (badge màu), ngày upload
- [ ] Upload zone (drag & drop hoặc button) — gọi `POST /cms/documents/upload`
- [ ] Polling status sau upload — gọi `GET /cms/documents/:id/status` mỗi 3s cho đến khi DONE/FAILED
- [ ] Nút xóa với confirm dialog

### Step 3.3 — Trang /chatbot (2 giờ)
- [ ] Form: system prompt (textarea), temperature (slider 0–1), max tokens (number input)
- [ ] Server Action hoặc fetch `PATCH /cms/knowledge-base`
- [ ] Hiển thị toast success/error

### Step 3.4 — Trang /api-keys (3 giờ)
- [ ] Bảng danh sách keys: tên, trạng thái, last used, rate limit
- [ ] Form tạo key mới: tên, allowed origins (multi-input), rate limit
- [ ] Sau khi tạo: hiện key 1 lần duy nhất với nút copy (modal)
- [ ] Nút revoke với confirm

### Step 3.5 — Trang /playground (4 giờ)
- [ ] Chat UI: bubble messages, input box, send button
- [ ] Dropdown chọn Knowledge Base
- [ ] Gọi `POST /api/v1/chat` với API key của KB đó
- [ ] Support streaming (EventSource hoặc fetch ReadableStream)
- [ ] Hiển thị latency ms

### Step 3.6 — Trang /analytics (3 giờ)
- [ ] Bảng Sessions: ID, thời gian tạo, số messages, KB
- [ ] Click vào session → mở drawer/modal xem messages
- [ ] Pagination cho cả hai bảng
- [ ] Thống kê đơn giản trên đầu trang: tổng sessions hôm nay, tổng messages

### Kiểm tra Phase 3 xong khi
- Đăng nhập được bằng admin@chatbot.local
- Upload document → thấy status DONE
- Vào Playground → chat được, response có context từ document

---

## Phase 4 — Integration & Smoke Test
**Ước tính:** 1–2 ngày (Day 13–14)

### Checklist end-to-end
- [ ] Upload PDF 10 trang → verify `chunkCount` đúng trong DB
- [ ] Hỏi câu liên quan → response trả về thông tin đúng từ PDF
- [ ] Hỏi câu không liên quan → response có disclaimer
- [ ] Test rate limit: gửi >100 requests trong 1h → nhận 429
- [ ] Test CORS: gọi từ origin không được phép → bị block
- [ ] Revoke API key → gọi lại → bị từ chối
- [ ] Kiểm tra Redis cache: gửi cùng câu hỏi 2 lần → lần 2 nhanh hơn đáng kể (không gọi embed lại)
- [ ] `pnpm typecheck` không có lỗi
- [ ] `pnpm lint` không có warning
- [ ] Tất cả Jest tests pass: `pnpm test`

---

## Dependency Map

```
Phase 0 (môi trường)
  └─► Phase 1 (monorepo + DB)
        └─► Phase 2.1 (AppModule + Prisma)
              ├─► Phase 2.2 (Auth)      ──────────────────────────┐
              ├─► Phase 2.3 (Documents + Worker)                  │
              ├─► Phase 2.4 (RAG)                                 │
              ├─► Phase 2.5 (Chat) ← cần 2.2, 2.4, 2.6           │
              ├─► Phase 2.6 (AiService) ← cần Groq key ⚠️        │
              └─► Phase 2.7 (CMS modules) ← cần 2.2              │
                    └─► Phase 3 (Next.js CMS) ◄───────────────────┘
                          └─► Phase 4 (Integration test)
```

---

## Risk Register

| Rủi ro | Khả năng | Ảnh hưởng | Xử lý |
|---|---|---|---|
| Groq API key chưa có khi bắt đầu Phase 2.5–2.6 | Cao | Trung bình | Mock AiService khi develop, đăng ký Groq song song |
| pgvector raw SQL phức tạp hơn dự kiến | Trung bình | Trung bình | Tách `RawSqlChunkRepository`, test riêng với Docker DB |
| Streaming SSE từ NestJS sang Next.js có edge case | Trung bình | Thấp | Test cả non-stream trước, thêm stream sau |
| File parsing (PDF/DOCX) gặp encoding tiếng Việt | Thấp | Trung bình | Test với file tiếng Việt thực tế ngay Step 2.3 |
| Solo → không có code review | Cao | Thấp | Chạy `pnpm typecheck` và Jest sau mỗi module |

---

## Định nghĩa "Done" Mỗi Phase

| Phase | Done khi |
|---|---|
| Phase 0 | Tất cả tools cài xong, Groq key có trong `.env` |
| Phase 1 | DB chạy, schema migrate xong, seed thành công, Prisma Studio hiển thị đúng |
| Phase 2 | E2E chat test pass (upload → chat → context đúng), tất cả Jest tests xanh |
| Phase 3 | Tất cả CMS pages hoạt động end-to-end qua browser |
| Phase 4 | Toàn bộ checklist integration pass, typecheck + lint sạch |
