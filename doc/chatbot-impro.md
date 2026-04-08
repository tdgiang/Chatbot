# Kế Hoạch Cải Thiện Kiểm Soát Câu Trả Lời Chatbot
**Phương án 4 — Kết hợp FAQ Override + Chunk Control + Answer Review**

> Ngày lập: 2026-04-06  
> Trạng thái: Chờ implement

---

## 1. Tổng Quan

### Vấn Đề Hiện Tại

Hệ thống RAG hiện tại hoạt động theo luồng:

```
[User hỏi] → [Vector search chunks] → [Build prompt] → [AI trả lời]
```

Hạn chế:
- Admin **không kiểm soát được** câu trả lời cho câu hỏi phổ biến — phụ thuộc hoàn toàn vào AI
- Không thể **vô hiệu hóa** một chunk cụ thể mà không xóa hẳn
- Không có cơ chế thu thập **phản hồi thực tế** từ người dùng để cải thiện

### Giải Pháp: 3 Lớp Kiểm Soát

```
[User hỏi]
    │
    ▼
┌─────────────────────────────────────┐
│  LỚP 1: FAQ Lookup                  │  ← Kiểm soát tuyệt đối
│  So sánh semantic với FAQ đã tạo    │
└──────────────┬──────────────────────┘
               │ không match
               ▼
┌─────────────────────────────────────┐
│  LỚP 2: RAG (chỉ chunks enabled)   │  ← Kiểm soát nguồn dữ liệu
│  Vector search trên chunks active  │
└──────────────┬──────────────────────┘
               │ không có context
               ▼
         Fallback message
               │
               ▼ (sau mỗi câu trả lời)
┌─────────────────────────────────────┐
│  LỚP 3: Answer Review               │  ← Cải thiện liên tục
│  Thu thập feedback → bổ sung FAQ   │
└─────────────────────────────────────┘
```

---

## 2. Phân Tích Chi Tiết Từng Lớp

### 2.1 Lớp 1 — FAQ / Q&A Override

**Mục tiêu:** Trả về câu trả lời do admin soạn sẵn cho các câu hỏi thường gặp, không qua AI.

**Cơ chế:**
1. Admin tạo cặp `{câu hỏi mẫu → câu trả lời chính xác}` trong CMS
2. Khi user gửi tin nhắn, hệ thống embed câu hỏi → so sánh cosine distance với tất cả FAQ của knowledge base
3. Nếu distance ≤ `FAQ_THRESHOLD` (0.15) → trả về câu trả lời FAQ ngay, không gọi AI
4. Nếu không match → tiếp tục xuống RAG

**FAQ Threshold = 0.15** (chặt hơn RAG 0.365 vì cần exact-ish match)

**Schema mới:**
```prisma
model FaqOverride {
  id              String        @id @default(cuid())
  knowledgeBaseId String
  question        String        // Câu hỏi mẫu admin nhập
  answer          String        // Câu trả lời cố định
  questionEmbed   Bytes?        // Cache embedding của question (vector 768)
  isActive        Boolean       @default(true)
  priority        Int           @default(0)   // Số cao hơn ưu tiên hơn khi nhiều match
  matchCount      Int           @default(0)   // Đếm số lần được match
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  knowledgeBase   KnowledgeBase @relation(fields: [knowledgeBaseId], references: [id], onDelete: Cascade)
  @@map("faq_overrides")
}
```

> **Lý do lưu `questionEmbed`:** Tránh gọi Ollama embed mỗi lần có request. Embedding được tạo 1 lần khi tạo/sửa FAQ, cache vào DB.

**Xử lý edge case:**
- Nhiều FAQ cùng match → lấy FAQ có distance nhỏ nhất (gần nhất); nếu bằng nhau → lấy `priority` cao hơn
- FAQ bị tắt (`isActive = false`) → bỏ qua trong lookup
- Admin sửa câu hỏi → tự động re-embed và cập nhật `questionEmbed`

---

### 2.2 Lớp 2 — Chunk Enable/Disable

**Mục tiêu:** Admin có thể tắt từng chunk cụ thể mà không cần xóa, RAG chỉ dùng chunks đang bật.

**Cơ chế:**
- Thêm field `isEnabled: Boolean @default(true)` vào bảng `chunks`
- Vector search thêm điều kiện `AND c."isEnabled" = true`
- Admin toggle từng chunk trong CMS → có hiệu lực ngay lập tức

**Schema thay đổi:**
```prisma
model Chunk {
  // ... existing fields ...
  isEnabled  Boolean  @default(true)   // THÊM MỚI
  // embedding vector(768) — raw SQL
}
```

**Migration SQL:**
```sql
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS "isEnabled" BOOLEAN NOT NULL DEFAULT true;
```

**Tác động lên RAG query:**
```sql
-- Trước
SELECT c.content, c.embedding <=> $1::vector AS distance
FROM chunks c JOIN documents d ON c."documentId" = d.id
WHERE d."knowledgeBaseId" = $2 AND c.embedding IS NOT NULL
ORDER BY distance LIMIT 5

-- Sau
SELECT c.content, c.embedding <=> $1::vector AS distance
FROM chunks c JOIN documents d ON c."documentId" = d.id
WHERE d."knowledgeBaseId" = $2
  AND c.embedding IS NOT NULL
  AND c."isEnabled" = true            -- THÊM MỚI
ORDER BY distance LIMIT 5
```

---

### 2.3 Lớp 3 — Answer Review (Feedback Loop)

**Mục tiêu:** Thu thập đánh giá từ người dùng, admin review để phát hiện câu trả lời sai và bổ sung FAQ.

**Cơ chế:**
1. Sau mỗi response của chatbot, client có thể gửi feedback (👍/👎)
2. Feedback được lưu kèm `messageId`, `sessionId`, rating
3. Admin xem danh sách feedback trong CMS, lọc theo rating
4. Từ feedback xấu (👎), admin có thể click "Tạo FAQ từ câu hỏi này" → pre-fill form FAQ với câu hỏi gốc

**Schema mới:**
```prisma
model MessageFeedback {
  id         String   @id @default(cuid())
  messageId  String   @unique      // 1 message chỉ có 1 feedback
  sessionId  String
  rating     Int                   // 1 = tốt, -1 = xấu
  note       String?               // Ghi chú tùy chọn từ user
  createdAt  DateTime @default(now())
  message    Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)
  session    Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  @@map("message_feedback")
}
```

**Cần thêm relation vào Message:**
```prisma
model Message {
  // ... existing fields ...
  feedback MessageFeedback?   // THÊM MỚI
}
```

**Widget feedback phía client (embed chatbot):**
```
[Câu trả lời của bot]
👍  👎
```
Gọi `POST /api/v1/feedback` với `{ message_id, session_id, rating: 1|-1, note? }`

---

## 3. Kế Hoạch Database Migration

### 3.1 Thứ Tự Migration

```
Migration 1: add_chunk_is_enabled
  ALTER TABLE chunks ADD COLUMN "isEnabled" BOOLEAN NOT NULL DEFAULT true;

Migration 2: create_faq_overrides
  CREATE TABLE faq_overrides (
    id TEXT PRIMARY KEY,
    "knowledgeBaseId" TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    "questionEmbed" BYTEA,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    priority INTEGER NOT NULL DEFAULT 0,
    "matchCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
  );

Migration 3: create_message_feedback
  CREATE TABLE message_feedback (
    id TEXT PRIMARY KEY,
    "messageId" TEXT NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
    "sessionId" TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating IN (1, -1)),
    note TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
  );
```

### 3.2 Prisma Schema Changes Summary

| Model | Thay đổi |
|-------|---------|
| `Chunk` | Thêm `isEnabled Boolean @default(true)` |
| `Message` | Thêm relation `feedback MessageFeedback?` |
| `FaqOverride` | **Tạo mới** |
| `MessageFeedback` | **Tạo mới** |
| `KnowledgeBase` | Thêm relation `faqs FaqOverride[]` |
| `Session` | Thêm relation `feedbacks MessageFeedback[]` |

---

## 4. API Endpoints

### 4.1 FAQ Override (JWT Auth — CMS)

| Method | Path | Mô tả |
|--------|------|--------|
| `GET` | `/cms/faq?knowledgeBaseId=X&page=1` | Danh sách FAQ (phân trang) |
| `POST` | `/cms/faq` | Tạo FAQ mới (auto embed question) |
| `PATCH` | `/cms/faq/:id` | Sửa FAQ (re-embed nếu question đổi) |
| `PATCH` | `/cms/faq/:id/toggle` | Bật/tắt FAQ |
| `DELETE` | `/cms/faq/:id` | Xóa FAQ |

**POST /cms/faq — Request:**
```json
{
  "knowledgeBaseId": "cmnij...",
  "question": "Điều kiện tuyển sinh là gì?",
  "answer": "Thí sinh cần...",
  "priority": 0
}
```

**GET /cms/faq — Response:**
```json
{
  "data": [
    {
      "id": "...",
      "question": "Điều kiện tuyển sinh là gì?",
      "answer": "Thí sinh cần...",
      "isActive": true,
      "priority": 0,
      "matchCount": 12,
      "createdAt": "2026-04-06T..."
    }
  ],
  "total": 25,
  "page": 1,
  "limit": 20,
  "totalPages": 2
}
```

### 4.2 Chunk Control (JWT Auth — CMS)

| Method | Path | Mô tả |
|--------|------|--------|
| `GET` | `/cms/documents/:docId/chunks?page=1` | Danh sách chunks |
| `GET` | `/cms/documents/:docId/chunks/:id` | Chi tiết chunk |
| `POST` | `/cms/documents/:docId/chunks` | Tạo chunk thủ công |
| `PATCH` | `/cms/documents/:docId/chunks/:id` | Sửa nội dung (re-embed) |
| `PATCH` | `/cms/documents/:docId/chunks/:id/toggle` | Bật/tắt chunk |
| `DELETE` | `/cms/documents/:docId/chunks/:id` | Xóa chunk |

### 4.3 Answer Feedback (API Key Auth — Public)

| Method | Path | Mô tả |
|--------|------|--------|
| `POST` | `/api/v1/feedback` | Gửi đánh giá cho 1 message |

**POST /api/v1/feedback — Request:**
```json
{
  "message_id": "cmnmn...",
  "session_id": "cmnmn...",
  "rating": -1,
  "note": "Câu trả lời không chính xác"
}
```

### 4.4 Feedback Analytics (JWT Auth — CMS)

| Method | Path | Mô tả |
|--------|------|--------|
| `GET` | `/cms/analytics/feedback?rating=-1&page=1` | Danh sách feedback (có filter) |
| `GET` | `/cms/analytics/feedback/stats` | Thống kê tỷ lệ tốt/xấu |

---

## 5. Luồng Xử Lý Chat (Sau Khi Cải Thiện)

```typescript
// chat.service.ts — luồng mới
async chat(dto, apiKeyId, knowledgeBaseId, res) {
  // 1. Get/create session
  const session = await getOrCreateSession(...)

  // 2. Save user message
  await saveMessage(session.id, 'USER', dto.message)

  // 3. LỚP 1: FAQ lookup
  const faqMatch = await faqService.lookup(dto.message, knowledgeBaseId)
  if (faqMatch) {
    await faqService.incrementMatchCount(faqMatch.id)
    return reply(faqMatch.answer)   // Trả về ngay, không gọi AI
  }

  // 4. LỚP 2: RAG search (chỉ chunks isEnabled = true)
  const chunks = await ragService.search(dto.message, knowledgeBaseId)

  // 5. Không có context
  if (chunks.length === 0) {
    return reply(ragService.noContextReply)
  }

  // 6. Gọi AI với context
  const messages = ragService.buildPrompt(kb.systemPrompt, chunks, history, dto.message)
  const content = await aiService.chat(messages, options)

  // 7. Lưu response (kèm messageId để client có thể gửi feedback)
  const msg = await saveMessage(session.id, 'ASSISTANT', content)
  return { session_id, message_id: msg.id, message: content }
}
```

> **Lưu ý:** Response cần bổ sung `message_id` để client dùng khi gửi feedback.

---

## 6. Thay Đổi Chat Response

Bổ sung `message_id` vào response để client có thể gửi feedback:

**Non-stream response (hiện tại → sau cải thiện):**
```json
// Trước
{ "session_id": "...", "message": { "role": "assistant", "content": "..." }, "latency_ms": 1234 }

// Sau
{ "session_id": "...", "message_id": "...", "message": { "role": "assistant", "content": "..." }, "latency_ms": 1234 }
```

**Stream response — event cuối (hiện tại → sau cải thiện):**
```
// Trước
data: { "delta": "", "done": true, "session_id": "..." }

// Sau
data: { "delta": "", "done": true, "session_id": "...", "message_id": "..." }
```

---

## 7. CMS Frontend — Pages Mới

### 7.1 Trang FAQ (`/faq`)

```
┌─────────────────────────────────────────────────────────┐
│ FAQ & Câu Trả Lời Cố Định          [+ Thêm FAQ]        │
├─────────────────────────────────────────────────────────┤
│  Câu hỏi mẫu          │ Trả lời (tóm tắt) │ Hit │ ...  │
│  Điều kiện tuyển sinh? │ Thí sinh cần...   │  12 │ ✓⠀ │
│  Học phí bao nhiêu?   │ Miễn học phí...   │   3 │ ✓⠀ │
└─────────────────────────────────────────────────────────┘
```

**Dialog Tạo/Sửa FAQ:**
```
┌──────────────────────────────────────────────┐
│ Thêm FAQ Mới                              ✕  │
├──────────────────────────────────────────────┤
│ Câu hỏi mẫu *                               │
│ [Nhập câu hỏi thường gặp...]                │
│                                              │
│ Câu trả lời *                               │
│ [Nhập câu trả lời chính xác...]             │
│                                              │
│ Độ ưu tiên (nếu nhiều câu match)            │
│ [0        ]                                  │
│                                              │
│              [Hủy]  [Lưu FAQ]               │
└──────────────────────────────────────────────┘
```

### 7.2 Trang Chunks (`/documents/[id]/chunks`)

```
┌─────────────────────────────────────────────────────────┐
│ ← Tài liệu  HDTSCAND.pdf (37 chunks)  [+ Thêm chunk]  │
├─────────────────────────────────────────────────────────┤
│  # │ Nội dung (120 ký tự...)  │ Embed │ Bật/Tắt │ ... │
│  1 │ HƯỚNG DẪN Tuyển sinh...  │  ✓   │   [●]    │ ... │
│  2 │ I. QUY ĐỊNH CHUNG...     │  ✓   │   [●]    │ ... │
│  3 │ Công thức tính điểm...   │  ✓   │   [○]    │ ... │  ← đang tắt
├─────────────────────────────────────────────────────────┤
│             [< Prev]  Trang 1/4  [Next >]               │
└─────────────────────────────────────────────────────────┘
```

### 7.3 Trang Feedback (`/analytics/feedback`)

```
┌─────────────────────────────────────────────────────────┐
│ Phản Hồi Người Dùng                                     │
│                                                         │
│  👍 Tốt: 142 (78%)    👎 Xấu: 39 (22%)   Tổng: 181    │
├─────────────────────────────────────────────────────────┤
│ [Tất cả ▼]  [Tìm kiếm nội dung...]                     │
├─────────────────────────────────────────────────────────┤
│  Câu hỏi               │ Trả lời (tóm tắt)│Rating│Tạo FAQ│
│  Học phí bao nhiêu?    │ Theo tài liệu... │  👎  │  [+]  │
│  Điều kiện tuyển sinh? │ Thí sinh cần...  │  👍  │       │
└─────────────────────────────────────────────────────────┘
```

Nút **[+]** trên dòng feedback xấu → navigate đến trang FAQ với form pre-filled câu hỏi gốc.

### 7.4 Cập Nhật Sidebar

Thêm mục `/faq` vào navigation sidebar:

```typescript
// sidebar.tsx
const navItems = [
  { href: '/documents',          label: 'Tài liệu',    icon: FileText },
  { href: '/faq',                label: 'FAQ',          icon: MessageSquare },  // MỚI
  { href: '/chatbot',            label: 'Chatbot',      icon: Bot },
  { href: '/api-keys',           label: 'API Keys',     icon: Key },
  { href: '/playground',         label: 'Playground',   icon: Play },
  { href: '/analytics',          label: 'Analytics',    icon: BarChart },
]
```

---

## 8. Shared Types Cần Bổ Sung

```typescript
// packages/shared-types/index.ts

// --- FAQ Override ---
export interface FaqDto {
  id: string
  knowledgeBaseId: string
  question: string
  answer: string
  isActive: boolean
  priority: number
  matchCount: number
  createdAt: string
  updatedAt: string
}

export interface CreateFaqRequest {
  knowledgeBaseId: string
  question: string        // min 5, max 500
  answer: string          // min 5, max 5000
  priority?: number       // default 0
}

export interface UpdateFaqRequest {
  question?: string
  answer?: string
  priority?: number
}

// --- Chunk Control ---
export interface ChunkDto {
  id: string
  documentId: string
  content: string
  chunkIndex: number
  hasEmbedding: boolean
  isEnabled: boolean
  createdAt: string
}

export interface ChunkListResponse {
  data: ChunkDto[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface CreateChunkRequest {
  content: string         // min 10, max 10000
}

export interface UpdateChunkRequest {
  content: string         // min 10, max 10000
}

// --- Feedback ---
export interface SubmitFeedbackRequest {
  message_id: string
  session_id: string
  rating: 1 | -1
  note?: string
}

export interface FeedbackDto {
  id: string
  messageId: string
  sessionId: string
  rating: 1 | -1
  note?: string
  createdAt: string
  // Joined fields
  userQuestion?: string   // Nội dung tin nhắn USER liền trước
  botAnswer?: string      // Nội dung message được đánh giá
}

export interface FeedbackStatsDto {
  total: number
  positive: number
  negative: number
  positiveRate: number    // 0-100 (%)
}

// --- Chat Response (cập nhật) ---
export interface ChatResponse {
  session_id: string
  message_id: string      // MỚI — để client gửi feedback
  message: { role: 'assistant'; content: string }
  latency_ms: number
  source: 'faq' | 'rag'  // MỚI — để debug, biết câu trả lời từ đâu
}
```

---

## 9. Thứ Tự Implement

### Giai Đoạn 1 — Chunk Control (2-3 ngày)
> Đơn giản nhất, ít rủi ro nhất, có thể độc lập

```
Bước 1.1  prisma schema — thêm isEnabled vào Chunk
Bước 1.2  migration SQL — ALTER TABLE chunks ADD COLUMN "isEnabled"
Bước 1.3  shared-types — thêm ChunkDto, ChunkListResponse, CreateChunkRequest, UpdateChunkRequest
Bước 1.4  chunks.service.ts — CRUD + toggle (kèm re-embed khi update content)
Bước 1.5  chunks.controller.ts — 6 endpoints
Bước 1.6  documents.module.ts — register chunks controller/service
Bước 1.7  rag.service.ts — thêm AND "isEnabled" = true vào search query
Bước 1.8  CMS: /documents/[id]/chunks page.tsx + chunks-client.tsx
Bước 1.9  CMS: documents-client.tsx — cột Chunks → link
```

### Giai Đoạn 2 — FAQ Override (3-4 ngày)
> Giá trị kiểm soát cao nhất

```
Bước 2.1  prisma schema — model FaqOverride
Bước 2.2  migration SQL — CREATE TABLE faq_overrides
Bước 2.3  shared-types — thêm FaqDto, CreateFaqRequest, UpdateFaqRequest
Bước 2.4  faq.service.ts — CRUD + lookup (embed + cosine compare)
Bước 2.5  faq.controller.ts — 5 endpoints
Bước 2.6  faq.module.ts — module mới, export FaqService
Bước 2.7  app.module.ts — import FaqModule
Bước 2.8  chat.service.ts — inject FaqService, thêm lookup trước RAG
Bước 2.9  chat response — bổ sung source: 'faq' | 'rag'
Bước 2.10 CMS: /faq page.tsx + faq-client.tsx
Bước 2.11 sidebar.tsx — thêm mục FAQ
```

### Giai Đoạn 3 — Answer Review (3-4 ngày)
> Thu thập dữ liệu thực tế

```
Bước 3.1  prisma schema — model MessageFeedback + relation Message.feedback
Bước 3.2  migration SQL — CREATE TABLE message_feedback
Bước 3.3  shared-types — cập nhật ChatResponse (message_id), thêm FeedbackDto, SubmitFeedbackRequest
Bước 3.4  feedback.service.ts — submit + list + stats
Bước 3.5  feedback.controller.ts — POST /api/v1/feedback (API key auth) + GET /cms/analytics/feedback (JWT)
Bước 3.6  feedback.module.ts
Bước 3.7  app.module.ts — import FeedbackModule
Bước 3.8  chat.service.ts — trả về message_id trong response + SSE done event
Bước 3.9  chat controller/dto — cập nhật response type
Bước 3.10 CMS: /analytics/feedback page.tsx + feedback-client.tsx
Bước 3.11 Playground — bổ sung nút 👍/👎 sau mỗi response
```

---

## 10. Files Cần Tạo/Sửa — Tổng Hợp

```
# GIAI ĐOẠN 1: Chunk Control
packages/shared-types/index.ts                              [SỬA]
packages/database/schema.prisma                             [SỬA]
apps/api/src/modules/documents/chunks.service.ts            [TẠO MỚI]
apps/api/src/modules/documents/chunks.controller.ts         [TẠO MỚI]
apps/api/src/modules/documents/dto/chunk-query.dto.ts       [TẠO MỚI]
apps/api/src/modules/documents/dto/create-chunk.dto.ts      [TẠO MỚI]
apps/api/src/modules/documents/dto/update-chunk.dto.ts      [TẠO MỚI]
apps/api/src/modules/documents/documents.module.ts          [SỬA]
apps/api/src/modules/rag/rag.service.ts                     [SỬA — thêm isEnabled filter]
apps/cms/app/(dashboard)/documents/[documentId]/chunks/page.tsx         [TẠO MỚI]
apps/cms/app/(dashboard)/documents/[documentId]/chunks/chunks-client.tsx [TẠO MỚI]
apps/cms/app/(dashboard)/documents/documents-client.tsx     [SỬA]

# GIAI ĐOẠN 2: FAQ Override
packages/shared-types/index.ts                              [SỬA]
packages/database/schema.prisma                             [SỬA]
apps/api/src/modules/faq/faq.service.ts                     [TẠO MỚI]
apps/api/src/modules/faq/faq.controller.ts                  [TẠO MỚI]
apps/api/src/modules/faq/faq.module.ts                      [TẠO MỚI]
apps/api/src/modules/faq/dto/create-faq.dto.ts              [TẠO MỚI]
apps/api/src/modules/faq/dto/update-faq.dto.ts              [TẠO MỚI]
apps/api/src/modules/faq/dto/faq-query.dto.ts               [TẠO MỚI]
apps/api/src/modules/chat/chat.service.ts                   [SỬA — inject FAQ, thêm lookup]
apps/api/src/app.module.ts                                  [SỬA — import FaqModule]
apps/cms/app/(dashboard)/faq/page.tsx                       [TẠO MỚI]
apps/cms/app/(dashboard)/faq/faq-client.tsx                 [TẠO MỚI]
apps/cms/components/sidebar.tsx                             [SỬA — thêm FAQ nav item]

# GIAI ĐOẠN 3: Answer Review
packages/shared-types/index.ts                              [SỬA]
packages/database/schema.prisma                             [SỬA]
apps/api/src/modules/feedback/feedback.service.ts           [TẠO MỚI]
apps/api/src/modules/feedback/feedback.controller.ts        [TẠO MỚI]
apps/api/src/modules/feedback/feedback.module.ts            [TẠO MỚI]
apps/api/src/modules/feedback/dto/submit-feedback.dto.ts    [TẠO MỚI]
apps/api/src/modules/chat/chat.service.ts                   [SỬA — trả về message_id]
apps/api/src/modules/chat/chat.controller.ts                [SỬA — cập nhật response type]
apps/api/src/modules/chat/dto/create-chat.dto.ts            [SỬA — response type]
apps/api/src/app.module.ts                                  [SỬA — import FeedbackModule]
apps/cms/app/(dashboard)/analytics/feedback/page.tsx        [TẠO MỚI]
apps/cms/app/(dashboard)/analytics/feedback/feedback-client.tsx [TẠO MỚI]
apps/cms/app/(dashboard)/playground/page.tsx                [SỬA — thêm nút feedback]
```

---

## 11. Edge Cases & Rủi Ro

### Giai Đoạn 1 — Chunk Control

| # | Tình huống | Xử lý |
|---|-----------|--------|
| C1 | Tắt tất cả chunks của 1 document | Cho phép — RAG trả fallback message |
| C2 | Reindex document → chunks cũ bị xóa, chunks mới mặc định `isEnabled = true` | Hành vi đúng — reindex tạo lại hoàn toàn |
| C3 | Document đang PROCESSING, admin toggle chunk | Throw `ConflictException` |
| C4 | `embed()` thất bại khi tạo/sửa chunk | Lưu chunk với `hasEmbedding = false`, chunk sẽ không được search (embedding IS NOT NULL filter) |

### Giai Đoạn 2 — FAQ Override

| # | Tình huống | Xử lý |
|---|-----------|--------|
| F1 | Nhiều FAQ cùng match dưới threshold | Lấy distance nhỏ nhất; bằng nhau → priority cao hơn |
| F2 | FAQ embed thất bại khi tạo | Lưu FAQ với `questionEmbed = null`, bỏ qua trong lookup (không match được) |
| F3 | Lookup chậm khi có nhiều FAQ | FAQ per KB thường < 100 → in-memory compare nhanh; nếu > 500 → chuyển sang pgvector search |
| F4 | Admin sửa câu hỏi FAQ | Re-embed `question` và cập nhật `questionEmbed` tự động |
| F5 | KB bị xóa | `onDelete: Cascade` xóa hết FAQ |

### Giai Đoạn 3 — Answer Review

| # | Tình huống | Xử lý |
|---|-----------|--------|
| R1 | User gửi feedback cho message không thuộc session của họ | Verify `message.sessionId === body.session_id` trước khi lưu |
| R2 | Gửi feedback 2 lần cho cùng 1 message | `messageId @unique` → throw `ConflictException` |
| R3 | FAQ answer cũng nhận feedback xấu | Ghi nhận bình thường — admin review và sửa FAQ text |

---

## 12. Metrics Đo Lường Hiệu Quả

Sau khi implement, theo dõi:

| Metric | Đo bằng cách | Mục tiêu |
|--------|-------------|---------|
| FAQ hit rate | `matchCount` tổng / tổng requests | > 30% (câu hỏi phổ biến được FAQ handle) |
| Positive feedback rate | `COUNT(rating=1) / COUNT(*)` | > 80% |
| Fallback rate | Log khi `chunks.length === 0` | < 10% |
| Chunks disabled | `COUNT(isEnabled=false) / COUNT(*)` | Theo dõi, không có target |

---

*Tài liệu này được tạo ngày 2026-04-06. Cập nhật khi có thay đổi thiết kế.*
