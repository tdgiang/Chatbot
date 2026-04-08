# Plan Triển Khai Phương Án D — Hybrid Chunk Pipeline

> Ngày: 2026-04-06  
> Dựa trên phân tích từ `doc/chukc-improve.md`  
> Mục tiêu: Thay thế pipeline chunking hiện tại bằng Clean → Structural Split → LLM Q&A → Embed

---

## 1. Tổng Quan

### 1.1 Pipeline Hiện Tại (cần thay)

```
parseFile()
  → chunkText(2000 chars, overlap 200)   ← cắt giữa câu, không có metadata
  → embed()
  → INSERT chunks
```

**Vấn đề:** nhiễu PDF (số trang, header), cắt giữa từ, không có context section, không Q&A.

### 1.2 Pipeline Mới (Phương Án D)

```
parseFile()
  → cleanText()                          ← Step 1: loại bỏ nhiễu
  → structuralSplit()                    ← Step 2: tách theo cấu trúc tài liệu
  → qaNormalize() [tùy CHUNK_MODE]       ← Step 3: chuyển sang Q&A format
  → embed() từng chunk
  → INSERT chunks (kèm sourceSection, chunkType)
```

### 1.3 Các File Liên Quan

| File | Trạng thái | Hành động |
|------|-----------|-----------|
| `apps/api/src/modules/documents/documents.processor.ts` | Tồn tại | Sửa — thay `chunkText()` |
| `apps/api/src/modules/documents/lib/text-cleaner.ts` | Chưa có | Tạo mới |
| `apps/api/src/modules/documents/lib/structural-splitter.ts` | Chưa có | Tạo mới |
| `apps/api/src/modules/documents/lib/qa-normalizer.ts` | Chưa có | Tạo mới |
| `packages/database/schema.prisma` | Tồn tại | Thêm 2 columns |
| `apps/api/src/modules/documents/chunks.service.ts` | Tồn tại | Cập nhật insert có metadata |
| `apps/cms/app/(dashboard)/documents/[documentId]/chunks/chunks-client.tsx` | Tồn tại | Thêm badge + breadcrumb |
| `.env` | Tồn tại | Thêm `CHUNK_MODE` |

---

## 2. Chi Tiết Từng Bước

---

### Step 1 — Text Cleaner

**File:** `apps/api/src/modules/documents/lib/text-cleaner.ts`

**Nhiệm vụ:** Loại bỏ nhiễu PDF/DOCX trước khi split. Không làm thay đổi nội dung thực sự.

**Patterns cần xử lý (từ phân tích thực tế HDTSCAND.pdf):**

| Pattern | Ví dụ thực tế | Regex |
|---------|--------------|-------|
| Số trang đứng độc lập | `\n4\n\n\n`, `\n5\n\n\n` | `/^\s*\d{1,3}\s*$/gm` |
| Header văn bản hành chính | `BỘ CÔNG AN\nCỘNG HÒA XÃ HỘI...` | `/^BỘ CÔNG AN[\s\S]{0,300}?(?:ĐỘC LẬP[^\n]*\n[^\n]*\n)/gm` |
| Watermark DỰ THẢO | `DỰ THẢO` đứng riêng dòng | `/^\s*DỰ THẢO\s*$/gm` |
| Chữ ký cuối tài liệu | `KT. BỘ TRƯỞNG\nTHỨ TRƯỞNG\n...` | `/KT\.\s*BỘ TRƯỞNG[\s\S]*$/m` |
| 3+ dòng trống liên tiếp | `\n\n\n\n` | `/\n{3,}/g` → `\n\n` |
| Khoảng trắng thừa | `"text  text"` | `/[ \t]+/g` → ` ` |
| Dấu gạch ngang trang | `─────────` | `/^[\-─═]+$/gm` |

**Code:**

```typescript
// apps/api/src/modules/documents/lib/text-cleaner.ts

export function cleanText(raw: string): string {
  return raw
    // Xóa số trang đứng độc lập (dòng chỉ chứa 1-3 chữ số + khoảng trắng)
    .replace(/^\s*\d{1,3}\s*$/gm, '')

    // Xóa header cơ quan + quốc hiệu + watermark DỰ THẢO
    // Pattern: "BỘ CÔNG AN\n...\nCỘNG HÒA...\n...\nĐỘC LẬP...\n...\nDỰ THẢO"
    .replace(/^BỘ CÔNG AN[\s\S]{0,400}?DỰ THẢO\s*\n?/gm, '')

    // Xóa watermark DỰ THẢO đứng riêng
    .replace(/^\s*DỰ THẢO\s*$/gm, '')

    // Xóa phần chữ ký cuối tài liệu
    .replace(/KT\.\s*BỘ TRƯỞNG[\s\S]*$/m, '')

    // Xóa đường kẻ phân cách
    .replace(/^[\-─═─=]{3,}\s*$/gm, '')

    // Chuẩn hóa 3+ dòng trống → 2 dòng trống
    .replace(/\n{3,}/g, '\n\n')

    // Chuẩn hóa khoảng trắng trong dòng
    .replace(/[ \t]+/g, ' ')

    // Trim từng dòng
    .split('\n').map(l => l.trim()).join('\n')

    .trim();
}
```

**Lưu ý quan trọng:**
- Regex `BỘ CÔNG AN` chỉ xóa đúng header — KHÔNG xóa nếu "Bộ Công an" xuất hiện trong câu văn thường
- Bước trim từng dòng PHẢI sau normalize whitespace để không xóa indent có nghĩa
- Function phải **pure** (không side effects) để dễ unit test

**Unit test nhanh (chạy sau khi code):**
```typescript
// Test: số trang
cleanText("Nội dung\n\n4\n\nTiếp theo") → "Nội dung\n\nTiếp theo"

// Test: watermark
cleanText("BỘ CÔNG AN\nCỘNG HÒA...\nDỰ THẢO\nNội dung") → "Nội dung"

// Test: chữ ký
cleanText("Nội dung\nKT. BỘ TRƯỞNG\nThứ trưởng Lê Quốc Hùng") → "Nội dung"
```

---

### Step 2 — Structural Splitter

**File:** `apps/api/src/modules/documents/lib/structural-splitter.ts`

**Nhiệm vụ:** Phát hiện cấu trúc phân cấp của tài liệu, tạo `TextBlock[]` mỗi block = 1 section.

**Interface:**

```typescript
export interface TextBlock {
  heading: string;           // Tiêu đề trực tiếp của section này
  breadcrumb: string[];      // Đường dẫn từ root tới section này (không gồm heading)
  content: string;           // Nội dung thô (đã cleaned) của section
  level: number;             // 0=document, 1=I/II, 2=1./2., 3=1.1., 4=1.1.1.
}
```

**Patterns tiêu đề tài liệu hành chính Việt Nam:**

```typescript
// Thứ tự priority: level cao → thấp
const HEADING_PATTERNS: Array<{ level: number; regex: RegExp }> = [
  // Level 1: Chương/Phần La Mã — "I.", "II.", "III."
  { level: 1, regex: /^((?:I{1,3}|IV|VI{0,3}|IX|XI{0,3})\.\s+.+)$/m },

  // Level 2: Điều/Mục số Ả Rập 1 chữ số — "1.", "2.", "3."
  { level: 2, regex: /^(\d{1,2}\.\s+[A-ZÀÁẢÃẠĂẮẶẲẴẶÂẤẦẨẪẬĐÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴ].+)$/m },

  // Level 3: Điều con — "1.1.", "1.2.", "2.3."
  { level: 3, regex: /^(\d{1,2}\.\d{1,2}\.\s+.+)$/m },

  // Level 4: Mục con sâu — "1.1.1.", "1.2.3."
  { level: 4, regex: /^(\d{1,2}\.\d{1,2}\.\d{1,2}\.\s+.+)$/m },
];
```

**Thuật toán split:**

```typescript
export function structuralSplit(text: string): TextBlock[] {
  const lines = text.split('\n');
  const blocks: TextBlock[] = [];

  // Stack lưu hierarchy hiện tại: [{level, heading}]
  const stack: Array<{ level: number; heading: string }> = [];

  let currentHeading = '';
  let currentLevel = 0;
  let currentLines: string[] = [];

  function flushBlock() {
    const content = currentLines.join('\n').trim();
    if (!content && !currentHeading) return;
    blocks.push({
      heading: currentHeading,
      breadcrumb: stack.map(s => s.heading),
      content,
      level: currentLevel,
    });
    currentLines = [];
  }

  for (const line of lines) {
    let matched = false;

    // Check từ level cao → thấp (reverse để level 4 không match level 2)
    for (const { level, regex } of [...HEADING_PATTERNS].sort((a, b) => b.level - a.level)) {
      if (regex.test(line)) {
        // Flush block hiện tại
        flushBlock();

        // Cập nhật stack: pop các level >= level hiện tại
        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
          stack.pop();
        }

        // Push heading hiện tại vào stack (trở thành parent của level sau)
        if (currentHeading) {
          // Push heading CŨ vào stack trước khi thay thế
          stack.push({ level: currentLevel, heading: currentHeading });
          // Trim stack cho đúng hierarchy
          while (stack.length > 0 && stack[stack.length - 1].level >= level) {
            stack.pop();
          }
        }

        currentHeading = line.trim();
        currentLevel = level;
        matched = true;
        break;
      }
    }

    if (!matched) {
      currentLines.push(line);
    }
  }

  // Flush block cuối cùng
  flushBlock();

  // Lọc bỏ blocks rỗng
  return blocks.filter(b => b.content.trim().length > 20 || b.heading.length > 0);
}
```

**Fallback:** Nếu document không có heading nào (tài liệu không cấu trúc), trả về 1 TextBlock duy nhất với toàn bộ nội dung:

```typescript
if (blocks.length === 0 || (blocks.length === 1 && !blocks[0].heading)) {
  return [{
    heading: 'Nội dung tài liệu',
    breadcrumb: [],
    content: text,
    level: 0,
  }];
}
```

---

### Step 3 — Q&A Normalizer

**File:** `apps/api/src/modules/documents/lib/qa-normalizer.ts`

**Nhiệm vụ:** Gọi LLM (Ollama/Groq) để chuyển mỗi `TextBlock` thành 1-3 cặp Q&A. Có fallback về structural chunk nếu LLM fail.

**Interface output:**

```typescript
export interface QaChunk {
  content: string;      // "[SECTION]\nCâu hỏi: ...\nCâu trả lời: ..."
  sourceSection: string; // breadcrumb đầy đủ: "I > 1.2 > 1.2.1 > heading"
  chunkType: 'qa' | 'structural'; // 'structural' khi LLM fail
}
```

**System prompt cho LLM:**

```
Bạn là chuyên gia xử lý tài liệu hành chính Việt Nam.
Nhiệm vụ: Tạo các cặp câu hỏi - câu trả lời từ đoạn văn bản dưới đây.

Quy tắc:
1. Câu hỏi phải tự nhiên, như người dùng thực sự sẽ hỏi
2. Câu trả lời PHẢI dựa hoàn toàn vào nội dung cung cấp, KHÔNG thêm thông tin ngoài
3. Trích dẫn số liệu, ngày tháng, điều kiện cụ thể khi có
4. Số lượng Q&A: 1 cặp nếu nội dung đơn giản, tối đa 3 cặp nếu nội dung phức tạp
5. Output chỉ gồm các cặp Q&A, KHÔNG thêm giải thích

Format output BẮT BUỘC:
[SECTION_HEADER]
Câu hỏi: <câu hỏi>
Câu trả lời: <câu trả lời chi tiết>

---
[SECTION_HEADER]
Câu hỏi: <câu hỏi tiếp theo nếu cần>
Câu trả lời: <câu trả lời>
```

**User prompt:**

```
Section: {breadcrumb} > {heading}

Nội dung:
{content}
```

**Parsing output:**

```typescript
function parseQaOutput(raw: string, sectionLabel: string): string[] {
  // Split theo dấu "---" phân cách các Q&A pairs
  const pairs = raw.split(/^---\s*$/m).map(s => s.trim()).filter(Boolean);

  // Validate mỗi pair phải có "Câu hỏi:" và "Câu trả lời:"
  return pairs.filter(p =>
    p.includes('Câu hỏi:') && p.includes('Câu trả lời:')
  );
}
```

**Fallback logic:**

```typescript
async function normalizeBlock(block: TextBlock, ai: AiService): Promise<QaChunk[]> {
  const sectionLabel = [...block.breadcrumb, block.heading]
    .filter(Boolean)
    .join(' > ');

  // Bỏ qua sections quá ngắn (< 50 chars) — thường là sub-heading trống
  if (block.content.trim().length < 50) {
    return [];
  }

  try {
    const response = await ai.chat([
      { role: 'SYSTEM', content: SYSTEM_PROMPT },
      { role: 'USER', content: buildUserPrompt(block) },
    ]);

    const qaTexts = parseQaOutput(response, sectionLabel);

    if (qaTexts.length > 0) {
      return qaTexts.map(text => ({
        content: text,
        sourceSection: sectionLabel,
        chunkType: 'qa' as const,
      }));
    }
  } catch (err) {
    // LLM call failed — fallback
  }

  // Fallback: dùng structural chunk (breadcrumb + content thô)
  return [{
    content: sectionLabel ? `[${sectionLabel}]\n\n${block.content}` : block.content,
    sourceSection: sectionLabel,
    chunkType: 'structural' as const,
  }];
}
```

**Giới hạn kích thước input cho LLM:**

```typescript
const MAX_CONTENT_FOR_LLM = 3000; // chars

// Nếu block quá dài, chia nhỏ trước khi gọi LLM
function splitLongBlock(block: TextBlock): TextBlock[] {
  if (block.content.length <= MAX_CONTENT_FOR_LLM) return [block];

  const sentences = block.content.split(/(?<=[.!?])\s+/);
  const parts: TextBlock[] = [];
  let chunk = '';
  let partIndex = 0;

  for (const sentence of sentences) {
    if ((chunk + ' ' + sentence).length > MAX_CONTENT_FOR_LLM && chunk.length > 0) {
      parts.push({
        ...block,
        heading: `${block.heading} (phần ${++partIndex})`,
        content: chunk.trim(),
      });
      chunk = sentence;
    } else {
      chunk = chunk ? chunk + ' ' + sentence : sentence;
    }
  }
  if (chunk.trim()) {
    parts.push({
      ...block,
      heading: parts.length > 0 ? `${block.heading} (phần ${++partIndex})` : block.heading,
      content: chunk.trim(),
    });
  }
  return parts;
}
```

---

### Step 4 — Schema Migration

**Thêm columns vào bảng `chunks`:**

```sql
-- Chạy trực tiếp qua psql hoặc Prisma $executeRaw (như đã làm với isEnabled)
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS "sourceSection" TEXT;
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS "chunkType" TEXT NOT NULL DEFAULT 'raw';
```

**Cập nhật Prisma schema `packages/database/schema.prisma`:**

```prisma
model Chunk {
  id            String   @id @default(cuid())
  documentId    String
  content       String
  chunkIndex    Int
  isEnabled     Boolean  @default(true)
  sourceSection String?  // Breadcrumb: "I > 1.2 > 1.2.1 > heading"
  chunkType     String   @default("raw")  // 'raw' | 'qa' | 'structural' | 'manual'
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  document      Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  @@map("chunks")
}
```

**Giá trị `chunkType`:**

| Giá trị | Ý nghĩa |
|---------|---------|
| `raw` | Chunking cũ (2000 chars, overlap) |
| `structural` | Tách theo cấu trúc tài liệu, không Q&A |
| `qa` | Đã qua LLM normalization thành Q&A |
| `manual` | Admin tạo/sửa thủ công qua CMS |

---

### Step 5 — Cập Nhật documents.processor.ts

**File:** `apps/api/src/modules/documents/documents.processor.ts`

**Thay đổi chính:**

1. Import các lib mới
2. Đọc `CHUNK_MODE` từ env
3. Thay `chunkText()` bằng pipeline mới
4. UPDATE câu INSERT để gồm `sourceSection`, `chunkType`

**Luồng mới trong `process()` method:**

```typescript
// 1. Parse file (giữ nguyên)
const rawText = await parseFile(filePath, mimeType);

// 2. Clean text (luôn chạy)
const cleanedText = cleanText(rawText);

// 3. Tùy CHUNK_MODE
const chunkMode = process.env.CHUNK_MODE ?? 'qa';

let chunksToInsert: Array<{
  content: string;
  sourceSection: string | null;
  chunkType: string;
}> = [];

if (chunkMode === 'raw') {
  // Behavior cũ — backward compatible
  const texts = chunkText(cleanedText);
  chunksToInsert = texts.map(t => ({
    content: t,
    sourceSection: null,
    chunkType: 'raw',
  }));

} else if (chunkMode === 'structural') {
  const blocks = structuralSplit(cleanedText);
  chunksToInsert = blocks.map(b => ({
    content: b.breadcrumb.length > 0
      ? `[${[...b.breadcrumb, b.heading].join(' > ')}]\n\n${b.content}`
      : b.content,
    sourceSection: [...b.breadcrumb, b.heading].filter(Boolean).join(' > '),
    chunkType: 'structural',
  }));

} else {
  // 'qa' mode (default)
  const blocks = structuralSplit(cleanedText);
  const normalizer = new QaNormalizer(this.ai);
  const qaChunks = await normalizer.normalize(blocks);
  chunksToInsert = qaChunks.map(q => ({
    content: q.content,
    sourceSection: q.sourceSection,
    chunkType: q.chunkType,
  }));
}

// 4. Embed và INSERT (cập nhật thêm sourceSection, chunkType)
let inserted = 0;
for (let i = 0; i < chunksToInsert.length; i++) {
  const { content, sourceSection, chunkType } = chunksToInsert[i];
  const embedding = await this.ai.embed(content);
  const vectorLiteral = embedding.length > 0 ? `[${embedding.join(',')}]` : null;

  if (vectorLiteral) {
    await this.prisma.$executeRaw`
      INSERT INTO chunks (id, "documentId", content, "chunkIndex", embedding,
                         "sourceSection", "chunkType", "isEnabled", "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid()::text,
        ${documentId},
        ${content},
        ${i},
        ${vectorLiteral}::vector,
        ${sourceSection},
        ${chunkType},
        true,
        NOW(),
        NOW()
      )
    `;
  } else {
    await this.prisma.chunk.create({
      data: {
        documentId,
        content,
        chunkIndex: i,
        sourceSection: sourceSection ?? undefined,
        chunkType,
      },
    });
  }
  inserted++;
}
```

---

### Step 6 — Cập Nhật chunks.service.ts

**File:** `apps/api/src/modules/documents/chunks.service.ts`

**Cập nhật `list()` để trả về `sourceSection` và `chunkType`:**

```typescript
// Trong câu query $queryRaw của list()
SELECT
  id, "documentId", content, "chunkIndex",
  "isEnabled", "sourceSection", "chunkType",
  "createdAt", "updatedAt",
  (embedding IS NOT NULL) as "hasEmbedding"
FROM chunks
WHERE "documentId" = ${documentId}
ORDER BY "chunkIndex" ASC
LIMIT ${limit} OFFSET ${offset}
```

**Cập nhật `create()` — khi admin tạo chunk thủ công qua CMS:**

```typescript
// chunkType = 'manual' cho chunks được tạo qua UI
await this.prisma.$executeRaw`
  INSERT INTO chunks (..., "chunkType", "sourceSection", ...)
  VALUES (..., 'manual', ${null}, ...)
`;
```

**Cập nhật `update()` — giữ nguyên chunkType, chỉ cập nhật content và re-embed:**

```typescript
// Nếu admin sửa chunk qa/structural → KHÔNG đổi chunkType
// Nếu admin tạo mới → chunkType = 'manual'
```

**Cập nhật shared-types `ChunkDto`:**

```typescript
// packages/shared-types/index.ts
export interface ChunkDto {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  hasEmbedding: boolean;
  isEnabled: boolean;
  sourceSection: string | null;  // THÊM
  chunkType: string;             // THÊM: 'raw'|'structural'|'qa'|'manual'
  createdAt: string;
  updatedAt: string;
}
```

---

### Step 7 — Cập Nhật CMS chunks-client.tsx

**File:** `apps/cms/app/(dashboard)/documents/[documentId]/chunks/chunks-client.tsx`

**Thêm 2 thành phần UI:**

#### 7.1 Badge chunkType

```typescript
const chunkTypeBadge = (type: string) => {
  const map = {
    qa: { label: 'Q&A', className: 'bg-green-100 text-green-700 border-green-200' },
    structural: { label: 'Cấu trúc', className: 'bg-blue-100 text-blue-700 border-blue-200' },
    manual: { label: 'Thủ công', className: 'bg-purple-100 text-purple-700 border-purple-200' },
    raw: { label: 'Thô', className: 'bg-gray-100 text-gray-600 border-gray-200' },
  };
  const config = map[type as keyof typeof map] ?? map.raw;
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${config.className}`}>
      {config.label}
    </span>
  );
};
```

#### 7.2 Hiển thị sourceSection breadcrumb

```tsx
// Trong table row, dưới content:
{chunk.sourceSection && (
  <p className="text-xs text-gray-400 mt-1 font-mono truncate max-w-xs" title={chunk.sourceSection}>
    {chunk.sourceSection}
  </p>
)}
```

#### 7.3 Cập nhật cột Nội dung trong table

```tsx
<td className="px-4 py-3">
  <div className="flex items-center gap-2 mb-1">
    {chunkTypeBadge(chunk.chunkType)}
  </div>
  <p className="text-gray-800 line-clamp-2 leading-relaxed">
    {chunk.content}
  </p>
  {chunk.sourceSection && (
    <p className="text-xs text-blue-400 mt-1 truncate max-w-sm" title={chunk.sourceSection}>
      ↳ {chunk.sourceSection}
    </p>
  )}
  <p className="text-xs text-gray-400 mt-0.5">
    {chunk.content.length} ký tự
  </p>
</td>
```

---

### Step 8 — Environment Variables

**File:** `.env`

```bash
# Thêm vào .env hiện có

# Chunk processing mode
# raw        = behavior cũ (chunkText 2000 chars), dùng để backward compat
# structural = tách theo cấu trúc tài liệu, không gọi LLM
# qa         = full hybrid: clean + structural + LLM Q&A (mặc định)
CHUNK_MODE="qa"

# Giới hạn số sections tối đa mỗi tài liệu (bảo vệ khỏi timeout)
QA_MAX_SECTIONS=200
```

---

## 3. Thứ Tự Thực Hiện

```
[Step 1] text-cleaner.ts              ← Độc lập, không breaking change
    ↓
[Step 4] SQL migration                ← Chạy ALTER TABLE trước
    ↓
[Step 2] structural-splitter.ts       ← Độc lập với LLM
    ↓
[Step 3] qa-normalizer.ts             ← Phụ thuộc Step 2
    ↓
[Step 5] documents.processor.ts       ← Phụ thuộc Step 1, 2, 3
    ↓
[Step 6] chunks.service.ts            ← Phụ thuộc Step 4 (schema)
    ↓
[Step 7] chunks-client.tsx            ← UI, phụ thuộc Step 6
    ↓
[Step 8] .env                         ← Cuối cùng khi sẵn sàng test
```

---

## 4. Test Plan

### Test Step 1 (Text Cleaner) — Chạy ngay sau khi code

```bash
# Quick manual test: upload lại HDTSCAND.pdf với CHUNK_MODE=structural
# Kiểm tra chunks không còn chứa:
# - Số trang đứng độc lập ("4", "5", "6"...)
# - "BỘ CÔNG AN CỘNG HÒA..."
# - "DỰ THẢO"
# - "KT. BỘ TRƯỞNG..."
```

### Test Step 2 (Structural Splitter) — Unit test

```typescript
// Input mẫu từ HDTSCAND.pdf (đã cleaned)
const sampleText = `
I. QUY ĐỊNH CHUNG

1. Tuyển sinh sau đại học

1.1. Đào tạo trình độ thạc sĩ

Người dự tuyển phải đáp ứng các điều kiện sau:
- Có bằng tốt nghiệp đại học loại khá trở lên

1.2. Đào tạo trình độ tiến sĩ

Người dự tuyển phải có bằng thạc sĩ hoặc tương đương.
`;

const blocks = structuralSplit(sampleText);
// Expected:
// blocks[0]: heading="I. QUY ĐỊNH CHUNG", breadcrumb=[], level=1
// blocks[1]: heading="1. Tuyển sinh sau đại học", breadcrumb=["I. QUY ĐỊNH CHUNG"], level=2
// blocks[2]: heading="1.1. Đào tạo trình độ thạc sĩ", breadcrumb=["I. QUY ĐỊNH CHUNG", "1. Tuyển sinh..."], level=3
// blocks[3]: heading="1.2. Đào tạo trình độ tiến sĩ", ...
```

### Test Step 3 (Q&A Normalizer) — Integration test

```bash
# 1. Upload file TXT nhỏ (5-10 sections) với CHUNK_MODE=qa
# 2. Kiểm tra chunks trong DB: SELECT content, "chunkType", "sourceSection" FROM chunks LIMIT 20;
# 3. Verify: content chứa "Câu hỏi:" và "Câu trả lời:"
# 4. Verify: chunkType = 'qa'
# 5. Verify: sourceSection không null

# Test fallback:
# Tắt Ollama, upload file → chunks phải có chunkType = 'structural' (không fail)
```

### Test Full Pipeline — End-to-End

```bash
# 1. Set CHUNK_MODE=qa trong .env
# 2. Upload lại HDTSCAND.pdf (reindex qua CMS)
# 3. Kiểm tra qua Playground:
#    - "Điều kiện sức khỏe tuyển sinh HVCSND là gì?" → phải trả lời đúng
#    - "Công thức tính điểm xét tuyển thạc sĩ?" → phải có công thức ĐXT = H + B + ĐUT
#    - "Thủ đô nước Pháp là gì?" → phải từ chối (distance > threshold 0.365)
# 4. Vào CMS → Documents → HDTSCAND.pdf → Chunks
#    - Kiểm tra badge Q&A/Cấu trúc hiển thị đúng
#    - Kiểm tra breadcrumb sourceSection hiển thị
```

---

## 5. Rủi Ro & Giảm Thiểu

| Rủi ro | Khả năng | Giảm thiểu |
|--------|---------|------------|
| LLM tạo Q&A hallucinate | Trung bình | System prompt chặt + fallback về `structural` |
| Regex miss heading của tài liệu lạ | Thấp | Fallback: 1 block = toàn bộ document |
| Indexing chậm hơn (gọi LLM từng section) | Cao | BullMQ async — không ảnh hưởng UX |
| LLM timeout/crash | Thấp-Trung bình | try/catch, fallback không throw |
| `QA_MAX_SECTIONS=200` không đủ với PDF lớn | Thấp | Config có thể tăng theo nhu cầu |
| Regex `BỘ CÔNG AN` false positive | Thấp | Pattern require ≥300 chars tới DỰ THẢO |
| Rollback khó sau khi reindex | Trung bình | Backup DB trước; giữ `CHUNK_MODE=raw` option |

---

## 6. Backward Compatibility

- `CHUNK_MODE=raw` → giữ nguyên behavior cũ của `chunkText()`, không phá vỡ gì
- Tài liệu đã index với `chunkType='raw'` → vẫn hoạt động bình thường
- RAG search (`rag.service.ts`) không cần sửa — chỉ tìm theo embedding và `isEnabled`
- `chunks.service.ts` — `sourceSection` và `chunkType` là optional trong create/update

---

## 7. Files Cần Tạo Mới (Summary)

```
apps/api/src/modules/documents/lib/
├── text-cleaner.ts          ← Step 1
├── structural-splitter.ts   ← Step 2
└── qa-normalizer.ts         ← Step 3
```

---

## 8. Files Cần Sửa (Summary)

```
apps/api/src/modules/documents/documents.processor.ts   ← Step 5
apps/api/src/modules/documents/chunks.service.ts        ← Step 6
apps/cms/app/(dashboard)/documents/[documentId]/chunks/chunks-client.tsx  ← Step 7
packages/database/schema.prisma                          ← Step 4 (prisma)
packages/shared-types/index.ts                          ← Step 6 (ChunkDto)
.env                                                     ← Step 8
```

---

*Plan được tạo ngày 2026-04-06 dựa trên phân tích codebase thực tế và dữ liệu 37 chunks từ HDTSCAND.pdf.*
