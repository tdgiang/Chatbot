# Phân Tích & Đề Xuất Cải Thiện Chất Lượng Chunk

> Ngày: 2026-04-06

---

## 1. Phân Tích Vấn Đề Hiện Tại

### 1.1 Cơ Chế Chunking Hiện Tại

```
documents.processor.ts — hàm chunkText()

Input text
  → split('\n\n')           // tách theo đoạn văn
  → gộp đoạn đến 2000 ký tự
  → overlap 200 ký tự cuối chunk trước
  → INSERT vào DB kèm embedding
```

### 1.2 Các Vấn Đề Phát Hiện Từ Dữ Liệu Thực Tế

Kiểm tra 37 chunks từ file `HDTSCAND.pdf` (avg 2607 ký tự/chunk):

#### Vấn đề 1 — Cắt Giữa Từ / Giữa Câu (Critical)
```
Chunk #1 bắt đầu: "CAND theo\nTừng trình độ..."        ← thiếu chủ ngữ
Chunk #2 bắt đầu: "iếp nhận vào đào tạo..."            ← mất chữ "T" đầu = "Tiếp nhận"
Chunk #4 bắt đầu: "heo các tiêu chí cụ thể sau:"       ← mất chữ "T" = "Theo"
Chunk #7 bắt đầu: "có) theo quy định"                  ← fragment của câu trước
```
**Nguyên nhân:** Overlap 200 ký tự cắt vào giữa từ/câu, không tôn trọng ranh giới ngữ nghĩa.

#### Vấn đề 2 — Nhiễu PDF: Số Trang, Header, Footer (Critical)
```
Chunk #1 chứa: "BỘ CÔNG AN CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nDỰ THẢO"
Chunk #3 chứa: "\n4\n\n\n" (số trang 4 của PDF)
Chunk #4 chứa: "\n5\n\n\n" (số trang 5 của PDF)
Chunk #6 chứa: "\n7\n\n\n" (số trang 7 của PDF)
Chunk #36 kết thúc: "KT. BỘ TRƯỞNG\nTHỨ TRƯỞNG\n\nThượng tướng Lê Quốc Hùng"
```
**Nguyên nhân:** `pdf-parse` trích xuất toàn bộ text bao gồm header/footer/số trang. Không có bước làm sạch.

#### Vấn đề 3 — Mất Context Section (High)
```
Chunk #14: "u xét tuyển theo Phương thức 2, Phương thức 3..."
→ AI không biết đây là nội dung của section nào
→ Câu hỏi "Phương thức 2 là gì?" sẽ không match đúng chunk này
```
**Nguyên nhân:** Chunking thuần túy theo ký tự, không lưu metadata về section cha.

#### Vấn đề 4 — Kích Thước Cứng Nhắc, Không Theo Ngữ Nghĩa (Medium)
```
min=2066 chars, max=3250 chars, avg=2607 chars
→ 1 mục ngắn (VD: điều kiện sức khỏe ~300 ký tự) bị gộp vào chunk 2000 ký tự
→ Vector search tìm được chunk nhưng thông tin bị pha loãng với nội dung khác
```

#### Vấn đề 5 — Không Theo Chuẩn Q&A (High)
```
Chunk hiện tại:
"heo các tiêu chí cụ thể sau:\n(1) Kết quả học tập toàn khóa ở trình độ đại học.\n
(2) Bài luận thể hiện khả năng nghiên cứu khoa học..."

Chuẩn mong muốn:
[1.2.2.2 — Điều kiện xét tuyển thạc sĩ — Tiêu chí xét tuyển]
Câu hỏi: Tiêu chí xét tuyển thạc sĩ trong CAND gồm những gì?
Câu trả lời: Xét tuyển dựa trên các tiêu chí: (1) Kết quả học tập toàn khóa ở
trình độ đại học, (2) Bài luận thể hiện khả năng nghiên cứu...
```

### 1.3 Tác Động Lên Chất Lượng Chatbot

| Vấn đề | Ảnh hưởng |
|--------|-----------|
| Cắt giữa câu | Embedding kém chính xác → vector search sai |
| Nhiễu PDF | AI nhận context có "DỰ THẢO", "KT. BỘ TRƯỞNG" → câu trả lời lạ |
| Mất context section | Câu hỏi về section X không tìm được chunk đúng |
| Kích thước cứng | Context window bị lãng phí, thông tin pha loãng |
| Không Q&A | AI phải tự suy luận ra câu hỏi → dễ hallucinate |

---

## 2. Bốn Phương Án Đề Xuất

### Phương Án A — Cải Thiện Chunking Hiện Tại
> Làm sạch text + tách theo câu thay vì ký tự

**Thay đổi:**
- Thêm regex pipeline làm sạch: xóa số trang, header, footer
- Tách chunk theo ranh giới câu (`。`, `.`, `\n`) thay vì ký tự cứng
- Giữ logic 2000 chars nhưng không cắt giữa câu

**Ví dụ output:**
```
[Chunk nguyên bản được làm sạch]
Công thức tính điểm xét tuyển: ĐXT = H + B + ĐUT.
Trong đó: ĐXT là điểm xét tuyển, H là học bổng...
```

**Ưu:** Đơn giản, ít thay đổi code  
**Nhược:** Vẫn không có Q&A, vẫn thiếu context section  
**Thời gian:** 1 ngày

---

### Phương Án B — Structural Chunking (Theo Cấu Trúc Tài Liệu)
> Tách chunk theo tiêu đề section, giữ metadata

**Thay đổi:**
- Detect tiêu đề: `I.`, `II.`, `1.`, `1.1.`, `1.2.1.`, `- `, `+`
- Mỗi section = 1 chunk (dù ngắn/dài)
- Prepend breadcrumb: `[I > 1.2 > 1.2.1]` vào đầu chunk

**Ví dụ output:**
```
[I. QUY ĐỊNH CHUNG > 1. Tuyển sinh sau đại học > 1.2.1. Điều kiện tiến sĩ]
Người dự tuyển phải bảo đảm các điều kiện theo quy định tại Điều 7
Thông tư số 18/2021/TT-BGDĐT...
- Tính đến năm dự tuyển không quá 50 tuổi
- Có thời gian công tác từ 24 tháng trở lên
```

**Ưu:** Context rõ ràng, chunks theo ngữ nghĩa  
**Nhược:** Vẫn không phải Q&A, cần viết parser cho từng loại tài liệu  
**Thời gian:** 2-3 ngày

---

### Phương Án C — LLM Q&A Generation
> Dùng AI chuyển từng đoạn văn thành cặp Q&A

**Thay đổi:**
- Sau khi extract text, split thành sections thô
- Gọi LLM với prompt: *"Tạo 2-5 cặp câu hỏi/câu trả lời từ đoạn văn sau..."*
- Mỗi Q&A pair = 1 chunk riêng

**Ví dụ output:**
```
Câu hỏi: Điều kiện sức khỏe để tuyển sinh vào HVCSND là gì?
Câu trả lời: Thí sinh nam cần chiều cao từ 1m64 trở lên, cân nặng tối thiểu
52kg, thị lực không kính đạt 8/10 mỗi mắt. Thí sinh nữ cần chiều cao từ
1m58 trở lên, cân nặng tối thiểu 48kg, thị lực không kính đạt 8/10 mỗi mắt.
Nguồn: Thông báo tuyển sinh 2024, trang 4.
```

**Ưu:** Chất lượng cao nhất, embedding cực kỳ chính xác  
**Nhược:** Chậm (gọi LLM cho mỗi section), tốn token, cần review  
**Thời gian:** 3-4 ngày

---

### Phương Án D — Hybrid: Clean + Structural + LLM Q&A ✅ RECOMMENDED
> Kết hợp 3 bước, linh hoạt theo loại tài liệu

```
Bước 1: CLEAN
  PDF/DOCX text → loại bỏ nhiễu (số trang, header, watermark)
                → chuẩn hóa khoảng trắng, dấu câu

Bước 2: STRUCTURAL SPLIT  
  Text sạch → phát hiện section headers (regex + heuristics)
            → tạo cây cấu trúc: Part > Chapter > Section > Item
            → mỗi node = 1 text block kèm breadcrumb

Bước 3: Q&A NORMALIZATION (LLM)
  Mỗi text block → gọi Ollama/Groq:
  "Từ nội dung này, tạo các cặp Q&A ngắn gọn bằng tiếng Việt.
   Format: [SECTION HEADER]\nCâu hỏi: ...\nCâu trả lời: ..."
  
Bước 4: EMBED & STORE
  Mỗi Q&A pair → embed → insert chunks với metadata
```

**Ví dụ output (đúng format yêu cầu):**
```
[II. ĐIỀU KIỆN SỨC KHOẺ — HVCSND]

Câu hỏi: Điều kiện sức khỏe tuyển sinh vào HVCSND là gì?
Câu trả lời:
Thí sinh nam: chiều cao từ 1m64 trở lên, cân nặng tối thiểu 52kg,
thị lực không kính đạt 8/10 mỗi mắt.

Thí sinh nữ: chiều cao từ 1m58 trở lên, cân nặng tối thiểu 48kg,
thị lực không kính đạt 8/10 mỗi mắt.

Không có dị tật bẩm sinh ảnh hưởng đến công tác.

Nguồn: Thông báo tuyển sinh 2024, trang 4.
```

**Ưu:** Chất lượng cao, có thể bật/tắt từng bước  
**Nhược:** Phức tạp hơn, thời gian indexing lâu hơn  
**Thời gian:** 4-5 ngày

---

## 3. Chi Tiết Phương Án D (Hybrid)

### 3.1 Bước 1: Text Cleaning Pipeline

```typescript
// documents.processor.ts — hàm cleanText() mới

function cleanText(raw: string): string {
  return raw
    // Xóa số trang đứng độc lập (dòng chỉ có 1-3 chữ số)
    .replace(/^\s*\d{1,3}\s*$/gm, '')
    // Xóa header/footer lặp lại của PDF (BỘ CÔNG AN, CỘNG HÒA...)
    .replace(/BỘ CÔNG AN[\s\S]{0,200}?DỰ THẢO\n?/gm, '')
    // Xóa watermark "DỰ THẢO" đứng riêng
    .replace(/^\s*DỰ THẢO\s*$/gm, '')
    // Xóa dòng chữ ký cuối tài liệu
    .replace(/KT\. BỘ TRƯỞNG[\s\S]*$/m, '')
    // Chuẩn hóa nhiều dòng trống liên tiếp → tối đa 2
    .replace(/\n{3,}/g, '\n\n')
    // Chuẩn hóa khoảng trắng
    .replace(/[ \t]+/g, ' ')
    .trim();
}
```

### 3.2 Bước 2: Structural Split

Phát hiện tiêu đề theo pattern tài liệu hành chính Việt Nam:

```typescript
// Các pattern tiêu đề cần detect
const HEADING_PATTERNS = [
  /^[IVX]+\.\s+[A-ZÀÁẢÃẠĂẮẶẲẴẶ]/m,      // I. II. III. (La Mã)
  /^\d+\.\s+[A-ZÀÁẢÃẠĂẮẶẲẴẶ]/m,          // 1. 2. 3.
  /^\d+\.\d+\.\s+/m,                       // 1.1. 1.2.
  /^\d+\.\d+\.\d+\.\s+/m,                  // 1.2.1.
];

interface TextBlock {
  breadcrumb: string[];   // ["I. QUY ĐỊNH CHUNG", "1. Tuyển sinh sau đại học"]
  heading: string;        // "1.2.1. Tuyển sinh đào tạo trình độ tiến sĩ"
  content: string;        // nội dung thô của section này
  pageRef?: string;       // số trang gần nhất (từ metadata PDF nếu có)
}

function structuralSplit(text: string): TextBlock[] {
  // Tách theo tiêu đề, giữ breadcrumb
  // ...
}
```

### 3.3 Bước 3: LLM Q&A Normalization

```typescript
const QA_PROMPT = (block: TextBlock) => `
Bạn là chuyên gia xử lý tài liệu hành chính Việt Nam.
Dưới đây là một đoạn văn bản từ tài liệu tuyển sinh.

Section: ${block.breadcrumb.join(' > ')}
Nội dung:
${block.content}

Nhiệm vụ: Tạo các cặp câu hỏi - câu trả lời ngắn gọn, chính xác từ nội dung trên.
Mỗi cặp Q&A phải:
1. Bắt đầu bằng "[${block.heading}]" 
2. Câu hỏi: tự nhiên, như thí sinh thực sự sẽ hỏi
3. Câu trả lời: đầy đủ, trích dẫn số liệu cụ thể từ tài liệu
4. KHÔNG thêm thông tin ngoài tài liệu

Format output (1-3 cặp tùy độ phức tạp):
[SECTION]
Câu hỏi: ...
Câu trả lời: ...

---
[SECTION]
Câu hỏi: ...
Câu trả lời: ...
`;
```

### 3.4 Bước 4: Chunk Schema Mở Rộng

Thêm metadata vào bảng `chunks`:

```sql
-- Migration mới
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS "sourceSection" TEXT;
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS "chunkType" TEXT DEFAULT 'raw';
-- chunkType: 'raw' | 'qa' | 'manual'
```

```prisma
model Chunk {
  // ... existing fields ...
  isEnabled     Boolean  @default(true)
  sourceSection String?  // "[I > 1.2 > 1.2.1]" breadcrumb
  chunkType     String   @default("raw") // 'raw' | 'qa' | 'manual'
}
```

---

## 4. So Sánh Output Trước / Sau

### Trước (Chunk hiện tại #4)
```
heo các tiêu chí cụ thể sau:
(1) Kết quả học tập toàn khóa ở trình độ đại học.
(2) Bài luận thể hiện khả năng nghiên cứu khoa học của người dự tuyển về một
chủ đề, lĩnh vực trong công tác Công an.

5


- Công thức tính điểm xét tuyển: ĐXT = H + B + ĐUT.
Trong đó:
+ ĐXT là điểm xét tuyển, đ...
```
❌ Bắt đầu bằng fragment "heo"  
❌ Có số trang "5" lơ lửng  
❌ Mix 2 nội dung không liên quan (tiêu chí xét tuyển + công thức điểm)  
❌ Không biết section nào

### Sau (Phương án D output)
```
[I. QUY ĐỊNH CHUNG > 1. Tuyển sinh sau đại học > 1.2.2. Thạc sĩ > Tiêu chí xét tuyển]

Câu hỏi: Tiêu chí xét tuyển thạc sĩ trong trường CAND dựa trên những gì?
Câu trả lời: Xét tuyển thạc sĩ trong các trường CAND dựa trên các tiêu chí:
(1) Kết quả học tập toàn khóa ở trình độ đại học
(2) Bài luận thể hiện khả năng nghiên cứu khoa học về một chủ đề, lĩnh vực
    trong công tác Công an

---

[I. QUY ĐỊNH CHUNG > 1. Tuyển sinh sau đại học > Công thức điểm xét tuyển]

Câu hỏi: Công thức tính điểm xét tuyển thạc sĩ CAND là gì?
Câu trả lời: Công thức: ĐXT = H + B + ĐUT
Trong đó:
- ĐXT: điểm xét tuyển (làm tròn 2 chữ số thập phân)
- H: điểm trung bình học tập toàn khóa đại học
- B: điểm bài luận
- ĐUT: điểm ưu tiên
```
✅ Câu hoàn chỉnh  
✅ Không có nhiễu  
✅ Có context section rõ ràng  
✅ Dạng Q&A → embedding chính xác hơn  
✅ AI dễ trả lời hơn khi nhận context này

---

## 5. Kế Hoạch Implement

### Bước 1: Text Cleaner (0.5 ngày)
**File sửa:** `apps/api/src/modules/documents/documents.processor.ts`
- Thêm hàm `cleanText(raw: string): string`
- Áp dụng trước khi chunking
- Test với file PDF hiện có

### Bước 2: Structural Splitter (1 ngày)
**File tạo mới:** `apps/api/src/modules/documents/lib/structural-splitter.ts`
- Class `StructuralSplitter` nhận cleaned text, trả về `TextBlock[]`
- Support pattern tiêu đề hành chính VN
- Unit test với text mẫu

### Bước 3: Q&A Normalizer (1.5 ngày)
**File tạo mới:** `apps/api/src/modules/documents/lib/qa-normalizer.ts`
- Class `QaNormalizer` nhận `TextBlock[]`, gọi AI, trả về `QaChunk[]`
- Có fallback: nếu AI fail → dùng structural chunk thuần (không Q&A)
- Config: bật/tắt qua env `CHUNK_MODE=qa|structural|raw`

### Bước 4: Schema & Migration (0.5 ngày)
- Thêm `sourceSection` và `chunkType` vào Prisma schema
- SQL migration
- Update `documents.processor.ts` để insert kèm metadata

### Bước 5: Cập Nhật Processor (0.5 ngày)
**File sửa:** `apps/api/src/modules/documents/documents.processor.ts`
- Thay `chunkText()` cũ bằng pipeline mới: `clean → split → normalize → embed → insert`
- Giữ backward compatible: `CHUNK_MODE=raw` = behavior cũ

### Bước 6: Cập Nhật CMS Chunks View (0.5 ngày)
**File sửa:** `apps/cms/app/(dashboard)/documents/[documentId]/chunks/chunks-client.tsx`
- Hiển thị `sourceSection` breadcrumb trên mỗi chunk
- Badge `chunkType`: Q&A / Raw / Manual
- Filter theo chunkType

### Bước 7: Reindex Tài Liệu Hiện Có (0 ngày code, cần thực hiện thủ công)
- Sau khi deploy, reindex lại toàn bộ tài liệu đã có
- Thực hiện qua CMS: Tài liệu → Reindex

---

## 6. Cấu Hình & Environment Variables Mới

```bash
# .env — thêm mới
CHUNK_MODE="qa"              # raw | structural | qa (default: qa)
QA_CHUNK_MODEL="ollama"      # ollama | groq — model dùng để tạo Q&A
QA_MAX_SECTIONS_PER_DOC=200  # giới hạn sections để tránh timeout
```

---

## 7. Trade-offs & Rủi Ro

| Rủi ro | Khả năng | Giảm thiểu |
|--------|---------|------------|
| LLM tạo Q&A sai/hallucinate | Trung bình | System prompt chặt + fallback về raw chunk |
| Indexing chậm hơn (gọi LLM từng section) | Cao | BullMQ xử lý async, không ảnh hưởng UX |
| Parser miss tiêu đề lạ | Thấp | Fallback: treat entire section as 1 chunk |
| Token cost tăng (dùng Groq) | Trung bình | Có thể dùng Ollama local = free |
| Reindex tài liệu cũ tốn thời gian | Cao | Chạy background, không block |

---

## 8. Ưu Tiên Triển Khai

**Phase 1 (Ngay):** Bước 1 — Text Cleaner  
→ Không breaking change, cải thiện ngay chất lượng chunk hiện tại  
→ Loại bỏ nhiễu số trang, header, footer  

**Phase 2 (Sau Phase 1):** Bước 2+3+4+5 — Full hybrid pipeline  
→ Triển khai sau khi test Phase 1 ổn định  

**Phase 3:** Bước 6 — CMS UI cập nhật  
→ Hiển thị metadata chunk để admin kiểm soát tốt hơn

---

*Tài liệu này được tạo ngày 2026-04-06 dựa trên phân tích 37 chunks thực tế từ file HDTSCAND.pdf.*
