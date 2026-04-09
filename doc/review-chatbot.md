# Review Chất Lượng Chatbot — Phân Tích & Đề Xuất Cải Thiện

> Ngày: 2026-04-09  
> Phạm vi: Toàn bộ pipeline RAG từ indexing → retrieval → generation

---

## 1. Tổng Quan Pipeline Hiện Tại

```
User question
  → FAQ lookup (cosine distance, in-memory JS)
  → RAG vector search (pgvector, LIMIT 10, filter ≤ 0.4)
  → Build prompt (system + chunks + history + question)
  → LLM (Groq llama-3.1-8b-instant / Ollama llama3.1:8b)
  → Stream response
```

---

## 2. Nguyên Nhân Chất Lượng Kém

### 2.1 maxTokens = 512 — Câu trả lời bị cắt giữa chừng

**File:** `apps/api/src/modules/chat/chat.service.ts:114`  
**File:** `apps/api/src/modules/ai/providers/groq.provider.ts:23`

Default `maxTokens = 512` áp dụng cho cả Groq lẫn Ollama. Với tiếng Việt, mỗi token thường tương đương 2–3 ký tự (ít hơn tiếng Anh vì tokenizer Llama chủ yếu train trên Latin). Một câu trả lời bình thường về thủ tục hành chính dễ dàng vượt 512 tokens, dẫn đến **câu trả lời bị cắt đứt giữa câu**.

**Tác động:** Nghiêm trọng. Người dùng nhận được câu trả lời không đầy đủ mà không có dấu hiệu bị cắt.

---

### 2.2 System Prompt Quá Cứng Nhắc — Model Từ Chối Trả Lời Hợp Lý

**File:** `apps/api/src/modules/rag/rag.service.ts:62`

```typescript
const contextBlock = `...
QUY TẮC BẮT BUỘC (tuân thủ tuyệt đối):
1. CHỈ sử dụng thông tin từ TÀI LIỆU THAM KHẢO ở trên để trả lời.
2. Nếu tài liệu không có câu trả lời, phản hồi chính xác câu này: "${NO_CONTEXT_REPLY}"
3. KHÔNG được thêm, suy đoán, hoặc bổ sung bất kỳ thông tin nào ngoài tài liệu.
4. Trích dẫn hoặc diễn giải trực tiếp từ tài liệu, không paraphrase tự do.`
```

Vấn đề:
- **Rule 2**: Nếu tài liệu chứa thông tin liên quan nhưng không trả lời trực tiếp, model vẫn trả về câu cứng nhắc NO_CONTEXT_REPLY thay vì cố gắng suy luận từ context.
- **Rule 3 + 4**: Cấm model paraphrase khiến câu trả lời rập khuôn, máy móc. Khi chunks trả về ở dạng Q&A (do `CHUNK_MODE=qa`), model sẽ repeat nguyên văn cấu trúc "Câu hỏi: ... Câu trả lời: ..." vào response.
- Rule 1 conflict với Rule 4: Một số câu hỏi cần kết hợp nhiều chunks để trả lời — rule cấm suy luận khiến model không tổng hợp được.

**Tác động:** Cao. Model trả lời cứng nhắc hoặc từ chối trả lời dù tài liệu có thông tin liên quan.

---

### 2.3 SIMILARITY_THRESHOLD = 0.4 — Ngưỡng Không Nhất Quán với CHUNK_MODE=qa

**File:** `apps/api/src/modules/rag/rag.service.ts:12`

Khi `CHUNK_MODE=qa` (mặc định), các chunks được lưu ở dạng:
```
[SECTION_HEADER]
Câu hỏi: <câu hỏi do LLM tạo>
Câu trả lời: <câu trả lời>
```

Embedding của chunk này là embedding của **cặp Q&A**, không phải của nội dung thuần. Khi user hỏi câu hỏi thực tế, embedding của câu hỏi user so với embedding của cặp Q&A thường có khoảng cách cosine cao hơn so với chunk văn bản thuần. Ngưỡng 0.4 có thể loại bỏ những chunks liên quan dẫn đến `chunks.length === 0` và trả về NO_CONTEXT_REPLY.

Thêm vào đó, `RAG_FETCH_LIMIT = 10` sau đó filter còn `relevant`. Nếu tài liệu có ít chunks hoặc chất lượng embedding thấp, tất cả 10 candidates có thể bị loại.

**Tác động:** Cao. Gây ra false-negative — có context nhưng chatbot báo "không tìm thấy thông tin".

---

### 2.4 QA Chunk Format Gây Nhiễu Khi Đưa Vào Prompt

**File:** `apps/api/src/modules/documents/lib/qa-normalizer.ts:131–136`

Khi QA normalization thành công, chunk lưu vào DB có format:
```
[Tên section]
Câu hỏi: Điều kiện sức khỏe...?
Câu trả lời: Thí sinh phải...
```

Khi chunk này được đưa vào prompt của chat request, LLM thấy nội dung Q&A format trong "TÀI LIỆU THAM KHẢO". Điều này khiến:
1. Model có thể trả lời bằng cách lặp lại nguyên văn "Câu hỏi / Câu trả lời" structure.
2. Embedding của cặp Q&A không tối ưu cho semantic similarity với câu hỏi user (so với embedding chỉ của content thuần).

Giải pháp đúng: Khi indexing, embed câu hỏi (để retrieval tốt), nhưng khi đưa vào prompt chỉ dùng phần câu trả lời.

**Tác động:** Trung bình. Ảnh hưởng cả retrieval accuracy lẫn generation quality.

---

### 2.5 FAQ Lookup — Embedding Không Dùng Prefix, Threshold Quá Chặt

**File:** `apps/api/src/modules/faq/faq.service.ts:10, 66`

```typescript
const FAQ_THRESHOLD = 0.15; // tighter than RAG (0.365) — need near-exact match
// ...
const embedding = await this.ai.embed(dto.question); // không có prefix search_query:
```

Vấn đề:
1. **Không có prefix `search_query:`**: `nomic-embed-text` dùng asymmetric retrieval — query cần prefix `search_query:`, document cần `search_document:`. FAQ lookup embed câu hỏi user mà không có prefix, gây mismatch embedding space.
2. **Threshold 0.15 quá chặt**: Cùng câu hỏi nhưng viết khác từ sẽ không match. Ví dụ "điều kiện sức khỏe" vs "tiêu chuẩn thể lực" — cosine distance có thể là 0.2–0.3, bị loại.
3. **Tính toán distance trong JS**: Load toàn bộ active FAQs vào memory rồi tính cosine — không scale.

**Tác động:** Trung bình. FAQ layer hoạt động kém, bỏ qua nhiều câu hỏi nên thường fall-through xuống RAG không cần thiết.

---

### 2.6 Không Có Reranking — Pure Vector Search Thiếu Chính Xác

**File:** `apps/api/src/modules/rag/rag.service.ts:32–49`

Hệ thống chỉ dùng cosine distance của vector embedding (bi-encoder). Bi-encoder tốt cho candidate retrieval nhưng thiếu chính xác trong ranking. Một cross-encoder reranker (ví dụ: `ms-marco-MiniLM`) có thể đọc cả query lẫn passage để rank chính xác hơn đáng kể.

**Tác động:** Trung bình. Top-5 chunks đưa vào prompt có thể không phải chunks liên quan nhất.

---

### 2.7 Không Có Hybrid Search (Vector + BM25)

Với câu hỏi chứa **từ khóa cụ thể** (tên văn bản pháp lý, mã số, ngày tháng), vector search thuần thường kém hơn BM25 keyword search. Ví dụ: "Thông tư 36/2024/BCA-C07" — embedding model không encode số hiệu văn bản tốt bằng full-text search.

**Tác động:** Trung bình. Ảnh hưởng đặc biệt với tài liệu hành chính Việt Nam vốn nhiều số hiệu, mã điều khoản.

---

### 2.8 Model Nhỏ + Tiếng Việt — Giới Hạn Năng Lực

`llama-3.1-8b-instant` (dev) và `llama3.1:8b` (prod) là model 8B parameters. Với câu hỏi phức tạp về pháp quy Việt Nam, model có thể:
- Hallucinate dù có instruction không được thêm thông tin ngoài tài liệu.
- Không hiểu đúng context tiếng Việt có dấu thanh.
- Không kết hợp được nhiều chunks rải rác để trả lời câu hỏi tổng hợp.

**Tác động:** Trung bình (phụ thuộc use case). Không thể fix bằng prompt engineering đơn thuần.

---

### 2.9 Không Cache Kết Quả RAG Search

Embedding query được cache (5 phút) nhưng kết quả vector search không được cache. Với cùng câu hỏi, mỗi request đều query pgvector lại từ đầu. Tuy không ảnh hưởng chất lượng nhưng tăng latency.

---

## 3. Bảng Tổng Hợp Ưu Tiên

| # | Vấn đề | Tác động | Khó sửa | Ưu tiên |
|---|---|---|---|---|
| 2.1 | maxTokens = 512 quá thấp | Câu trả lời bị cắt | Dễ | **Ngay lập tức** |
| 2.2 | System prompt quá cứng nhắc | Model từ chối/cứng nhắc | Dễ | **Ngay lập tức** |
| 2.3 | Threshold 0.4 + QA chunks gây false-negative | Trả "không tìm thấy" sai | Trung bình | **Cao** |
| 2.4 | QA chunk format gây nhiễu prompt | Câu trả lời máy móc | Trung bình | **Cao** |
| 2.5 | FAQ embed thiếu prefix + threshold quá chặt | FAQ layer hoạt động kém | Dễ | **Cao** |
| 2.6 | Không có reranking | Retrieval kém chính xác | Trung bình | Trung bình |
| 2.7 | Không có hybrid search | Miss keyword queries | Khó | Thấp |
| 2.8 | Model nhỏ | Giới hạn năng lực | Khó | Tùy ngân sách |
| 2.9 | Không cache RAG results | Chỉ ảnh hưởng latency | Dễ | Thấp |

---

## 4. Đề Xuất Cải Thiện Cụ Thể

### Fix 1: Tăng maxTokens (5 phút)

**File:** `apps/api/src/modules/knowledge/dto/update-knowledge-base.dto.ts` & schema

```typescript
// Thay đổi default trong schema Prisma
maxTokens Int @default(1024)  // tăng từ 512 → 1024

// Và thêm validation trong DTO
@Max(4096)
maxTokens?: number;
```

Admin có thể set per KnowledgeBase. Đề xuất default: **1024** (tiếng Việt cần nhiều hơn tiếng Anh).

---

### Fix 2: Cải Thiện System Prompt (30 phút)

**File:** `apps/api/src/modules/rag/rag.service.ts:56–73`

Thay thế rules cứng nhắc bằng hướng dẫn linh hoạt hơn:

```typescript
const contextBlock = `

---
TÀI LIỆU THAM KHẢO:
${chunks.join('\n\n---\n')}
---

Hướng dẫn trả lời:
- Ưu tiên sử dụng thông tin từ TÀI LIỆU THAM KHẢO ở trên.
- Tổng hợp và diễn đạt lại bằng ngôn ngữ tự nhiên, dễ hiểu — không cần trích dẫn nguyên văn.
- Nếu tài liệu có thông tin liên quan nhưng không đủ để trả lời đầy đủ, hãy trả lời những gì có và ghi chú phần còn thiếu.
- Nếu tài liệu hoàn toàn không có thông tin liên quan, hãy thông báo lịch sự và đề nghị người dùng liên hệ trực tiếp.
- Trả lời bằng tiếng Việt, ngắn gọn và chính xác.`;
```

---

### Fix 3: Tách Embed Key và Content Trong QA Chunks (1–2 giờ)

**File:** `apps/api/src/modules/documents/documents.processor.ts:101–105`

Hiện tại embed toàn bộ Q&A text. Thay đổi: chỉ embed **câu hỏi** (retrieval key), nhưng lưu **câu trả lời** vào content (để đưa vào prompt).

```typescript
// Trong buildChunks khi chunkType === 'qa':
// Tách question và answer từ QA chunk text
// Embed: "search_document: " + question
// Content lưu DB: answer (hoặc full Q&A nhưng khi retrieval chỉ trả answer)

// Thêm cột embedKey vào chunks table:
// embedKey String? // text được dùng để tạo embedding (câu hỏi)
// content String   // text đưa vào prompt (câu trả lời)
```

Hoặc đơn giản hơn — khi đưa QA chunk vào prompt, strip phần "Câu hỏi:..." và chỉ giữ "Câu trả lời:...":

```typescript
// Trong rag.service.ts buildPrompt():
const cleanedChunks = chunks.map((c) => {
  // Strip Q&A format, chỉ giữ câu trả lời
  const match = /Câu trả lời:\s*([\s\S]+)$/m.exec(c);
  return match ? match[1].trim() : c;
});
```

---

### Fix 4: Sửa FAQ Embed Prefix + Nới Lỏng Threshold (30 phút)

**File:** `apps/api/src/modules/faq/faq.service.ts:66, 270`

```typescript
// Khi tạo FAQ — thêm prefix cho document embedding
const embedding = await this.ai.embed(`search_document: ${dto.question}`);

// Khi lookup — thêm prefix cho query embedding  
const embedding = await this.ai.embed(`search_query: ${question}`);

// Nới lỏng threshold từ 0.15 → 0.25
const FAQ_THRESHOLD = 0.25;
```

---

### Fix 5: Điều Chỉnh RAG Threshold Linh Hoạt (1 giờ)

**File:** `apps/api/src/modules/rag/rag.service.ts:12`

Thay vì threshold cứng, dùng **top-k guaranteed** + threshold:

```typescript
const RAG_FETCH_LIMIT = 10;
const SIMILARITY_THRESHOLD = 0.5; // nới lỏng hơn
const MIN_CHUNKS_GUARANTEED = 3;  // luôn lấy ít nhất 3 chunks nếu có

// Trong search():
const relevant = rows.filter((r) => r.distance <= SIMILARITY_THRESHOLD);
// Nếu không đủ MIN_CHUNKS_GUARANTEED, lấy thêm từ candidates (ngay cả khi distance cao hơn)
if (relevant.length < MIN_CHUNKS_GUARANTEED && rows.length > 0) {
  const additional = rows
    .filter((r) => r.distance > SIMILARITY_THRESHOLD)
    .slice(0, MIN_CHUNKS_GUARANTEED - relevant.length);
  relevant.push(...additional);
}
```

Kết hợp với Fix 2 (prompt linh hoạt hơn) để model tự đánh giá relevance thay vì dựa hoàn toàn vào threshold.

---

### Fix 6: Thêm Cross-Encoder Reranking (2–4 giờ)

Sau khi vector search lấy top-10 candidates, dùng một LLM call nhỏ để rerank:

```typescript
// Sau vector search trong rag.service.ts
async rerank(question: string, candidates: string[]): Promise<string[]> {
  if (candidates.length <= 3) return candidates;
  
  const prompt = `Xếp hạng các đoạn văn sau theo mức độ liên quan đến câu hỏi.
Câu hỏi: "${question}"
Chỉ trả về thứ tự index, cách nhau bởi dấu phẩy. Ví dụ: 2,0,4,1,3

${candidates.map((c, i) => `[${i}] ${c.slice(0, 200)}`).join('\n\n')}`;

  // Gọi LLM để lấy ranked order, parse kết quả
  // Fallback về order gốc nếu parse thất bại
}
```

Đây là zero-shot reranking dùng chính LLM đang có, không cần model mới.

---

### Fix 7: Cache Kết Quả RAG Search (1 giờ)

**File:** `apps/api/src/modules/rag/rag.service.ts`

```typescript
const RAG_RESULT_TTL = 60 * 2; // 2 phút

async search(question: string, knowledgeBaseId: string): Promise<string[]> {
  const cacheKey = `rag:${knowledgeBaseId}:${createHash('sha256').update(question).digest('hex')}`;
  const cached = await this.redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as string[];

  // ... existing vector search logic ...
  
  if (relevant.length > 0) {
    await this.redis.set(cacheKey, JSON.stringify(relevant.map(r => r.content)), 'EX', RAG_RESULT_TTL);
  }
  return relevant.map(r => r.content);
}
```

---

## 5. Kế Hoạch Triển Khai

### Giai đoạn 1 — Quick Wins (1 ngày, không breaking changes)
1. ✅ Fix 1: Tăng default maxTokens từ 512 → 1024
2. ✅ Fix 2: Refactor system prompt bỏ rules cứng nhắc  
3. ✅ Fix 4: Sửa FAQ embed prefix + nới threshold → 0.25
4. ✅ Fix 7: Cache RAG search results

### Giai đoạn 2 — Cải Thiện Chunking & Retrieval (2–3 ngày)
5. Fix 3: Strip QA prefix khi đưa chunks vào prompt (không cần re-index)
6. Fix 5: Điều chỉnh RAG threshold + guaranteed minimum chunks

### Giai đoạn 3 — Nâng Cấp Retrieval (1 tuần)
7. Fix 6: Thêm LLM reranking
8. Xem xét hybrid search (pgvector + pg_trgm full-text) nếu tài liệu nhiều keyword cụ thể
9. Nâng cấp model nếu ngân sách cho phép (llama-3.3-70b hoặc Groq mixtral)

---

## 6. Metrics Đo Lường Cải Thiện

Sau khi triển khai, theo dõi các chỉ số:

| Metric | Cách đo | Mục tiêu |
|---|---|---|
| `no_context_rate` | % responses từ NO_CONTEXT_REPLY / total | Giảm < 10% |
| `faq_hit_rate` | % FAQ match / total chat requests | Tăng > 20% (nếu FAQ được populate) |
| `avg_chunk_distance` | Log từ RAG search | Giảm trung bình < 0.3 |
| `avg_response_length` | Avg content length của ASSISTANT messages | Tăng, không có cắt giữa câu |
| `latency_p95` | 95th percentile latency_ms từ messages table | < 3000ms |

Có thể query từ analytics endpoint hiện có (`/cms/analytics/messages`).

---

## 7. Kết Luận

Vấn đề lớn nhất hiện tại **không phải** là model hay embedding — mà là:

1. **maxTokens quá thấp** → câu trả lời bị cắt.
2. **System prompt cứng nhắc** → model từ chối trả lời dù có context.
3. **QA chunk format** được embed nguyên cả Q&A → retrieval kém chính xác.

Ba fixes đầu (Giai đoạn 1) ước tính cải thiện chất lượng **30–50%** mà không cần re-index dữ liệu hay thay đổi infrastructure.
