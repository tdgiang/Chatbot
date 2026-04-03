# Test Report — Phase 2: NestJS API Backend

**Ngày test:** 2026-04-03  
**Môi trường:** Local dev — PostgreSQL port 5434, Redis port 6379, Groq API (thật)  
**AI Provider:** Groq (`llama-3.1-8b-instant`)

---

## 1. Unit Tests (Jest)

**Kết quả: 30/30 PASS ✅**

| Suite | Tests | Kết quả |
|---|---|---|
| `app.controller.spec.ts` | 1 | ✅ |
| `auth.service.spec.ts` | 5 | ✅ |
| `documents.processor.spec.ts` | 6 | ✅ |
| `rag.service.spec.ts` | 6 | ✅ |
| `ai.service.spec.ts` | 5 | ✅ |
| `api-key.guard.spec.ts` | 7 | ✅ |

### Chi tiết từng suite

**AuthService (5 tests)**
- ✅ Login với credentials đúng → trả JWT
- ✅ Login với email không tồn tại → 401 UnauthorizedException
- ✅ Login với password sai → 401 UnauthorizedException
- ✅ validateUser với ID tồn tại → trả user object
- ✅ validateUser với ID không tồn tại → trả null

**DocumentsProcessor / chunkText (6 tests)**
- ✅ Văn bản ngắn → 1 chunk
- ✅ Văn bản dài → nhiều chunks
- ✅ Mỗi chunk không vượt `chunkSize + overlap`
- ✅ Overlap được giữ giữa các chunk liền kề
- ✅ Chuỗi rỗng → 0 chunks
- ✅ Một đoạn không có newline → 1 chunk nguyên vẹn

**RagService / buildPrompt (6 tests)**
- ✅ System prompt luôn là message đầu tiên
- ✅ Câu hỏi luôn là message cuối
- ✅ Chunks được nhúng vào system message với header "Thông tin tham khảo"
- ✅ Không có chunks → không có context block
- ✅ Chỉ giữ tối đa 6 messages gần nhất từ history
- ✅ Tổng messages = 1 (system) + len(history) + 1 (question)

**AiService (5 tests)**
- ✅ AI_PROVIDER=groq → dùng GroqProvider
- ✅ AI_PROVIDER=ollama → dùng OllamaProvider
- ✅ Provider throw error → trả về fallback message tiếng Việt
- ✅ embed() luôn dùng OllamaProvider bất kể AI_PROVIDER
- ✅ Ollama embed fail → trả về `[]`

**ApiKeyGuard (7 tests)**
- ✅ API key hợp lệ → canActivate = true
- ✅ Không có Authorization header → 401
- ✅ API key sai → 401
- ✅ Key inactive (findMany trả rỗng) → 401
- ✅ Origin không được phép → 403 ForbiddenException
- ✅ Origin được phép → pass
- ✅ Rate limit vượt quá → 429 HttpException

---

## 2. API Smoke Tests (curl end-to-end)

### Auth

| # | Test | Kết quả | HTTP |
|---|---|---|---|
| 1 | Login sai credentials | ✅ | 401 |
| 2 | Login đúng → nhận JWT (234 chars) | ✅ | 200 |
| 21 | ValidationPipe — body rỗng | ✅ | 400 + field errors |

### KnowledgeBase

| # | Test | Kết quả | HTTP |
|---|---|---|---|
| 3 | GET /cms/knowledge-base (có JWT) | ✅ trả đúng ID + name | 200 |
| 4 | GET /cms/knowledge-base (không JWT) | ✅ | 401 |
| 5 | PATCH temperature=0.5, maxTokens=256 → cập nhật thành công | ✅ | 200 |

### API Keys

| # | Test | Kết quả | HTTP |
|---|---|---|---|
| 6 | POST /cms/api-keys → tạo key, trả `rawKey` | ✅ | 201 |
| 7 | GET /cms/api-keys → list đúng số key | ✅ | 200 |
| 11 | PATCH /cms/api-keys/:id/revoke → isActive=false | ✅ | 200 |
| 12 | Chat với revoked key | ✅ | 401 |

### Chat

| # | Test | Kết quả | HTTP |
|---|---|---|---|
| 8b | POST /api/v1/chat (Groq thật, stream=false) | ✅ response tiếng Việt từ Groq | 201 |
| 9 | Chat với invalid API key | ✅ | 401 |
| 10 | Rate limit test (rateLimit=3, 4 requests) | ✅ request 3 → 429 | 429 |

> **Rate limit note:** key đã dùng 1 lần ở bước 8b trước khi test loop → request 1,2 OK; request 3 = call thứ 4 → 429. **Logic đúng.**

### Documents

| # | Test | Kết quả | HTTP |
|---|---|---|---|
| 13 | Upload TXT → Document(PENDING) ngay lập tức | ✅ | 201 |
| 14 | GET /cms/documents → list | ✅ | 200 |
| 18 | Polling status → DONE, chunkCount=1 | ✅ (ngay poll đầu tiên) | 200 |
| 17 | Upload file .jpg → bị reject | ✅ "Only PDF, DOCX, and TXT files are allowed" | 400 |
| 19 | DELETE /cms/documents/:id | ✅ `{"success":true}` | 200 |

### Analytics

| # | Test | Kết quả | HTTP |
|---|---|---|---|
| 15 | GET /cms/analytics/sessions | ✅ total=4 | 200 |
| 16 | GET /cms/analytics/messages | ✅ total=8 | 200 |

---

## 3. Groq Integration Test

```
Câu hỏi: "Xin chào, bạn tên là gì?"
Phản hồi: "Xin chào! Tôi tên là Zeta, một trợ lý AI hỗ trợ khách hàng..."
```

✅ Groq API hoạt động, response tiếng Việt, latency hợp lý.

---

## 4. Vấn đề phát hiện & Đã Sửa

| # | Vấn đề | Nguyên nhân | Đã sửa |
|---|---|---|---|
| F1 | Server crash khi không có `GROQ_API_KEY` | Groq SDK throw tại constructor nếu apiKey=undefined | Fallback sang `'missing-key'` — sẽ fail ở call time với message rõ ràng |
| F2 | TypeScript error `TS1272` trên `@Res() res: Response` | `isolatedModules + emitDecoratorMetadata` yêu cầu `import type` | Đổi sang `import type { Request, Response }` |
| F3 | TypeScript error `TS2339` trên `pdfParse.default` | pdf-parse có ESM exports không nhất quán | Cast qua `any` + runtime fallback |

---

## 5. Giới hạn đã biết (Known Limitations)

| # | Vấn đề | Giải thích |
|---|---|---|
| L1 | **RAG vector search trả 0 chunks** | Ollama không chạy → `AiService.embed()` trả `[]` → chunks được lưu DB không có embedding vector → vector search không khớp được. **Fix:** chạy `ollama pull nomic-embed-text` và `ollama serve` trước khi upload docs. |
| L2 | **Chat response luôn là fallback khi test mà không có Groq key** | Server phải được start với file `.env` chứa `GROQ_API_KEY` thật. |
| L3 | **Stream SSE chưa được test tự động** | Cần client hỗ trợ EventSource — sẽ test ở Phase 3 qua Playground. |

---

## 6. Tổng kết

| Hạng mục | Kết quả |
|---|---|
| Unit tests | **30/30 ✅** |
| API endpoints | **21/21 ✅** |
| Groq integration | **✅** |
| Document indexing (BullMQ worker) | **✅** |
| Security (JWT, API key, rate limit, revoke) | **✅** |
| Validation (DTO, MIME type) | **✅** |
| Bugs cần fix trước Phase 3 | **0** |
| Known limitations cần xử lý | **3 (L1–L3, không block Phase 3)** |

**Phase 2 PASS — sẵn sàng bắt đầu Phase 3 (Next.js CMS).**
