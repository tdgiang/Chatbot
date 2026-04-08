import { Logger } from '@nestjs/common';
import { AiService } from '../../ai/ai.service';
import { TextBlock } from './structural-splitter';

export interface QaChunk {
  content: string;
  sourceSection: string;
  chunkType: 'qa' | 'structural';
}

const MAX_CONTENT_FOR_LLM = 3000;
const MIN_CONTENT_LENGTH = 50;

const SYSTEM_PROMPT = `Bạn là chuyên gia xử lý tài liệu hành chính Việt Nam.
Nhiệm vụ: Tạo các cặp câu hỏi - câu trả lời từ đoạn văn bản được cung cấp.

Quy tắc bắt buộc:
1. Câu hỏi phải tự nhiên, như người dùng thực sự sẽ hỏi
2. Câu trả lời PHẢI dựa hoàn toàn vào nội dung được cung cấp, KHÔNG thêm thông tin ngoài
3. Trích dẫn đầy đủ số liệu, ngày tháng, điều kiện cụ thể khi có
4. Số lượng Q&A: 1 cặp nếu nội dung đơn giản, tối đa 3 cặp nếu nội dung phức tạp
5. Chỉ output các cặp Q&A theo format, KHÔNG thêm bất kỳ giải thích nào khác

Format output BẮT BUỘC (mỗi cặp cách nhau bằng dòng "---"):
[SECTION_HEADER]
Câu hỏi: <câu hỏi>
Câu trả lời: <câu trả lời chi tiết>

---
[SECTION_HEADER]
Câu hỏi: <câu hỏi tiếp theo>
Câu trả lời: <câu trả lời>`;

function buildUserPrompt(block: TextBlock, sectionLabel: string): string {
  return `Section: ${sectionLabel}

Nội dung:
${block.content}`;
}

function parseQaOutput(raw: string): string[] {
  const pairs = raw
    .split(/^---\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);

  return pairs.filter(
    (p) => p.includes('Câu hỏi:') && p.includes('Câu trả lời:'),
  );
}

// Split overly long blocks into smaller pieces for the LLM
function splitLongBlock(block: TextBlock): TextBlock[] {
  if (block.content.length <= MAX_CONTENT_FOR_LLM) return [block];

  const paragraphs = block.content.split(/\n\n+/);
  const parts: TextBlock[] = [];
  let chunk = '';
  let partIndex = 0;

  for (const para of paragraphs) {
    if (chunk.length + para.length > MAX_CONTENT_FOR_LLM && chunk.length > 0) {
      parts.push({
        ...block,
        heading: parts.length > 0 ? `${block.heading} (phần ${++partIndex})` : block.heading,
        content: chunk.trim(),
      });
      chunk = para;
    } else {
      chunk = chunk ? `${chunk}\n\n${para}` : para;
    }
  }
  if (chunk.trim()) {
    parts.push({
      ...block,
      heading:
        parts.length > 0
          ? `${block.heading} (phần ${++partIndex})`
          : block.heading,
      content: chunk.trim(),
    });
  }
  return parts;
}

export class QaNormalizer {
  private readonly logger = new Logger(QaNormalizer.name);

  constructor(private readonly ai: AiService) {}

  async normalize(blocks: TextBlock[]): Promise<QaChunk[]> {
    const result: QaChunk[] = [];

    for (const rawBlock of blocks) {
      const subBlocks = splitLongBlock(rawBlock);
      for (const block of subBlocks) {
        const chunks = await this.normalizeBlock(block);
        result.push(...chunks);
      }
    }

    return result;
  }

  private async normalizeBlock(block: TextBlock): Promise<QaChunk[]> {
    const sectionLabel = [...block.breadcrumb, block.heading]
      .filter(Boolean)
      .join(' > ');

    // Skip blocks that are too short to be meaningful
    if (block.content.trim().length < MIN_CONTENT_LENGTH) {
      if (block.heading) {
        // heading-only block — skip, will be part of next block's breadcrumb
        return [];
      }
      return [];
    }

    try {
      const response = await this.ai.chat([
        { role: 'SYSTEM', content: SYSTEM_PROMPT },
        { role: 'USER', content: buildUserPrompt(block, sectionLabel || 'Nội dung') },
      ]);

      // Check if LLM returned fallback message (AI unavailable)
      if (response.includes('Xin lỗi, hệ thống đang bận')) {
        throw new Error('AI unavailable');
      }

      const qaTexts = parseQaOutput(response);

      if (qaTexts.length > 0) {
        return qaTexts.map((text) => ({
          content: text,
          sourceSection: sectionLabel,
          chunkType: 'qa' as const,
        }));
      }
    } catch (err) {
      this.logger.warn(
        `QA normalization failed for section "${sectionLabel}": ${err instanceof Error ? err.message : String(err)}. Falling back to structural chunk.`,
      );
    }

    // Fallback: structural chunk with breadcrumb prefix
    const content = sectionLabel
      ? `[${sectionLabel}]\n\n${block.content}`
      : block.content;

    return [
      {
        content,
        sourceSection: sectionLabel,
        chunkType: 'structural' as const,
      },
    ];
  }
}
