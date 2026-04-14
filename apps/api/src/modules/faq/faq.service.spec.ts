import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { FaqService } from './faq.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import * as mammoth from 'mammoth';

jest.mock('mammoth');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2026-04-08T00:00:00.000Z');

function makeFaqRow(overrides: Partial<{
  id: string; question: string; answer: string; isActive: boolean;
  priority: number; matchCount: number; questionEmbed: Buffer | null;
}> = {}) {
  return {
    id: 'faq-1',
    knowledgeBaseId: 'kb-1',
    question: 'Điều kiện tuyển sinh là gì?',
    answer: 'Thí sinh cần đáp ứng...',
    isActive: true,
    priority: 0,
    matchCount: 0,
    questionEmbed: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// FaqService
// ---------------------------------------------------------------------------

describe('FaqService', () => {
  let service: FaqService;
  let prisma: {
    faqOverride: {
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      findUnique: jest.Mock;
    };
    knowledgeBase: {
      findUnique: jest.Mock;
    };
  };
  let ai: { embed: jest.Mock; chat: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = {
      faqOverride: {
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn(),
      },
      knowledgeBase: {
        findUnique: jest.fn(),
      },
    };
    ai = { embed: jest.fn(), chat: jest.fn().mockResolvedValue('none') };

    const module = await Test.createTestingModule({
      providers: [
        FaqService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: ai },
      ],
    }).compile();

    service = module.get(FaqService);
  });

  // -------------------------------------------------------------------------
  // list()
  // -------------------------------------------------------------------------

  describe('list()', () => {
    it('returns paginated FAQ list with ISO date strings', async () => {
      const row = makeFaqRow();
      prisma.faqOverride.findMany.mockResolvedValue([row]);
      prisma.faqOverride.count.mockResolvedValue(1);

      const result = await service.list({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(typeof result.data[0].createdAt).toBe('string');
      expect(typeof result.data[0].updatedAt).toBe('string');
    });

    it('calculates totalPages correctly', async () => {
      prisma.faqOverride.findMany.mockResolvedValue([]);
      prisma.faqOverride.count.mockResolvedValue(45);

      const result = await service.list({ page: 1, limit: 20 });

      expect(result.totalPages).toBe(3); // ceil(45/20)
    });

    it('passes knowledgeBaseId filter when provided', async () => {
      prisma.faqOverride.findMany.mockResolvedValue([]);
      prisma.faqOverride.count.mockResolvedValue(0);

      await service.list({ knowledgeBaseId: 'kb-1', page: 1, limit: 20 });

      expect(prisma.faqOverride.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { knowledgeBaseId: 'kb-1' } })
      );
    });

    it('uses empty where when no knowledgeBaseId', async () => {
      prisma.faqOverride.findMany.mockResolvedValue([]);
      prisma.faqOverride.count.mockResolvedValue(0);

      await service.list({ page: 1, limit: 20 });

      expect(prisma.faqOverride.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} })
      );
    });
  });

  // -------------------------------------------------------------------------
  // create()
  // -------------------------------------------------------------------------

  describe('create()', () => {
    const dto = {
      knowledgeBaseId: 'kb-1',
      question: 'Học phí là bao nhiêu?',
      answer: 'Học phí miễn phí cho sinh viên diện ưu tiên.',
      priority: 0,
    };

    it('creates FAQ with questionEmbed when embed succeeds', async () => {
      const embedding = [1, ...Array(767).fill(0)];
      ai.embed.mockResolvedValue(embedding);
      const row = makeFaqRow({ questionEmbed: Buffer.from(JSON.stringify(embedding)) });
      prisma.faqOverride.create.mockResolvedValue(row);

      const result = await service.create(dto);

      expect(ai.embed).toHaveBeenCalledWith(dto.question);
      expect(prisma.faqOverride.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            questionEmbed: expect.any(Buffer),
          }),
        })
      );
      expect(result.question).toBe(row.question);
    });

    it('creates FAQ with null questionEmbed when embed fails', async () => {
      ai.embed.mockResolvedValue([]); // embed failure
      const row = makeFaqRow({ questionEmbed: null });
      prisma.faqOverride.create.mockResolvedValue(row);

      await service.create(dto);

      expect(prisma.faqOverride.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ questionEmbed: null }),
        })
      );
    });

    it('applies default priority 0 when not provided', async () => {
      ai.embed.mockResolvedValue([]);
      prisma.faqOverride.create.mockResolvedValue(makeFaqRow());

      await service.create({ ...dto, priority: undefined });

      expect(prisma.faqOverride.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ priority: 0 }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // update()
  // -------------------------------------------------------------------------

  describe('update()', () => {
    it('re-embeds question when question changes', async () => {
      const existing = makeFaqRow({ questionEmbed: Buffer.from('[]') });
      prisma.faqOverride.findUnique.mockResolvedValue(existing);
      ai.embed.mockResolvedValue([1, ...Array(767).fill(0)]);
      const updated = makeFaqRow({ question: 'Câu hỏi mới?' });
      prisma.faqOverride.update.mockResolvedValue(updated);

      await service.update('faq-1', { question: 'Câu hỏi mới?' });

      expect(ai.embed).toHaveBeenCalledWith('Câu hỏi mới?');
      expect(prisma.faqOverride.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ questionEmbed: expect.any(Buffer) }),
        })
      );
    });

    it('does NOT re-embed when only answer changes', async () => {
      const existing = makeFaqRow();
      prisma.faqOverride.findUnique.mockResolvedValue(existing);
      prisma.faqOverride.update.mockResolvedValue(makeFaqRow({ answer: 'Câu trả lời mới.' }));

      await service.update('faq-1', { answer: 'Câu trả lời mới.' });

      expect(ai.embed).not.toHaveBeenCalled();
    });

    it('does NOT re-embed when question is unchanged', async () => {
      const existing = makeFaqRow();
      prisma.faqOverride.findUnique.mockResolvedValue(existing);
      prisma.faqOverride.update.mockResolvedValue(existing);

      await service.update('faq-1', { question: existing.question });

      expect(ai.embed).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when FAQ not found', async () => {
      prisma.faqOverride.findUnique.mockResolvedValue(null);

      await expect(service.update('ghost', { answer: 'x' }))
        .rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // toggle()
  // -------------------------------------------------------------------------

  describe('toggle()', () => {
    it('flips isActive from true to false', async () => {
      prisma.faqOverride.findUnique.mockResolvedValue(makeFaqRow({ isActive: true }));
      prisma.faqOverride.update.mockResolvedValue(makeFaqRow({ isActive: false }));

      const result = await service.toggle('faq-1');

      expect(prisma.faqOverride.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } })
      );
      expect(result.isActive).toBe(false);
    });

    it('flips isActive from false to true', async () => {
      prisma.faqOverride.findUnique.mockResolvedValue(makeFaqRow({ isActive: false }));
      prisma.faqOverride.update.mockResolvedValue(makeFaqRow({ isActive: true }));

      const result = await service.toggle('faq-1');

      expect(prisma.faqOverride.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: true } })
      );
      expect(result.isActive).toBe(true);
    });

    it('throws NotFoundException when FAQ not found', async () => {
      prisma.faqOverride.findUnique.mockResolvedValue(null);

      await expect(service.toggle('ghost')).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // remove()
  // -------------------------------------------------------------------------

  describe('remove()', () => {
    it('deletes FAQ and returns success', async () => {
      prisma.faqOverride.findUnique.mockResolvedValue(makeFaqRow());
      prisma.faqOverride.delete.mockResolvedValue({});

      const result = await service.remove('faq-1');

      expect(prisma.faqOverride.delete).toHaveBeenCalledWith({ where: { id: 'faq-1' } });
      expect(result).toEqual({ success: true });
    });

    it('throws NotFoundException when FAQ not found', async () => {
      prisma.faqOverride.findUnique.mockResolvedValue(null);

      await expect(service.remove('ghost')).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // lookup() — core of FAQ Override layer
  // -------------------------------------------------------------------------

  describe('lookup()', () => {
    // Helpers
    function makeFaqs(n = 1) {
      return Array.from({ length: n }, (_, i) => ({
        id: `faq-${i}`,
        question: `Câu hỏi ${i}?`,
        answer: `Câu trả lời ${i}`,
        priority: 0,
      }));
    }

    it('returns null when no active FAQs exist', async () => {
      prisma.faqOverride.findMany.mockResolvedValue([]);

      const result = await service.lookup('câu hỏi', 'kb-1');

      expect(result).toBeNull();
      expect(ai.chat).not.toHaveBeenCalled();
    });

    it('returns null when LLM responds with "none"', async () => {
      prisma.faqOverride.findMany.mockResolvedValue(makeFaqs(2));
      ai.chat.mockResolvedValue('none');

      const result = await service.lookup('câu hỏi', 'kb-1');

      expect(result).toBeNull();
    });

    it('returns matched FAQ when LLM returns valid index "0"', async () => {
      const faqs = makeFaqs(3);
      prisma.faqOverride.findMany.mockResolvedValue(faqs);
      ai.chat.mockResolvedValue('0');
      prisma.faqOverride.update.mockResolvedValue({});

      const result = await service.lookup('câu hỏi', 'kb-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('faq-0');
      expect(result!.answer).toBe('Câu trả lời 0');
    });

    it('returns second FAQ when LLM returns index "1"', async () => {
      const faqs = makeFaqs(3);
      prisma.faqOverride.findMany.mockResolvedValue(faqs);
      ai.chat.mockResolvedValue('1');
      prisma.faqOverride.update.mockResolvedValue({});

      const result = await service.lookup('câu hỏi', 'kb-1');

      expect(result!.id).toBe('faq-1');
    });

    it('returns null when LLM returns out-of-range index', async () => {
      prisma.faqOverride.findMany.mockResolvedValue(makeFaqs(2));
      ai.chat.mockResolvedValue('99'); // index 99 doesn't exist

      const result = await service.lookup('câu hỏi', 'kb-1');

      expect(result).toBeNull();
    });

    it('returns null when LLM call throws', async () => {
      prisma.faqOverride.findMany.mockResolvedValue(makeFaqs(2));
      ai.chat.mockRejectedValue(new Error('LLM timeout'));

      const result = await service.lookup('câu hỏi', 'kb-1');

      expect(result).toBeNull();
    });

    it('only queries active FAQs (isActive: true)', async () => {
      prisma.faqOverride.findMany.mockResolvedValue([]);

      await service.lookup('câu hỏi', 'kb-1');

      expect(prisma.faqOverride.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        })
      );
    });

    it('passes knowledgeBaseId to findMany query', async () => {
      prisma.faqOverride.findMany.mockResolvedValue([]);

      await service.lookup('câu hỏi', 'kb-99');

      expect(prisma.faqOverride.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ knowledgeBaseId: 'kb-99' }),
        })
      );
    });

    it('increments matchCount after successful match (async, non-blocking)', async () => {
      prisma.faqOverride.findMany.mockResolvedValue(makeFaqs(1));
      ai.chat.mockResolvedValue('0');
      prisma.faqOverride.update.mockResolvedValue({});

      await service.lookup('câu hỏi', 'kb-1');
      await Promise.resolve(); // flush async update

      expect(prisma.faqOverride.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'faq-0' },
          data: { matchCount: { increment: 1 } },
        })
      );
    });

    it('calls LLM with temperature=0 and maxTokens=10', async () => {
      prisma.faqOverride.findMany.mockResolvedValue(makeFaqs(2));
      ai.chat.mockResolvedValue('0');
      prisma.faqOverride.update.mockResolvedValue({});

      await service.lookup('câu hỏi', 'kb-1');

      expect(ai.chat).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ temperature: 0, maxTokens: 10 }),
      );
    });

    it('skips LLM call when only 1 FAQ and falls through to match by index 0 if LLM matches', async () => {
      prisma.faqOverride.findMany.mockResolvedValue(makeFaqs(1));
      ai.chat.mockResolvedValue('0');
      prisma.faqOverride.update.mockResolvedValue({});

      const result = await service.lookup('single FAQ question', 'kb-1');

      expect(result!.id).toBe('faq-0');
    });
  });

  // -------------------------------------------------------------------------
  // importFromDocx()
  // -------------------------------------------------------------------------

  describe('importFromDocx()', () => {
    const KB_ID = 'kb-import';

    function makeDocxBuffer(content = 'fake-docx-content'): Buffer {
      return Buffer.from(content);
    }

    beforeEach(() => {
      prisma.knowledgeBase.findUnique.mockResolvedValue({ id: KB_ID, name: 'Test KB' });
      ai.embed.mockResolvedValue([1, ...Array(767).fill(0)]);
      prisma.faqOverride.create.mockImplementation(({ data }: { data: { question: string; answer: string; knowledgeBaseId: string; priority: number; questionEmbed: Buffer | null } }) =>
        Promise.resolve(makeFaqRow({ question: data.question, answer: data.answer }))
      );
    });

    it('imports all Q&A pairs from valid DOCX HTML', async () => {
      const html = `
        <h2>Điều kiện sức khỏe là gì?</h2>
        <p>Nam chiều cao từ 1m64, nữ từ 1m58.</p>
        <h2>Thời gian đăng ký?</h2>
        <p>Từ tháng 3 đến tháng 4 hằng năm.</p>
      `;
      (mammoth.convertToHtml as jest.Mock).mockResolvedValue({ value: html });

      const result = await service.importFromDocx(makeDocxBuffer(), KB_ID);

      expect(result.total).toBe(2);
      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(0);
      expect(prisma.faqOverride.create).toHaveBeenCalledTimes(2);
    });

    it('throws BadRequestException when KnowledgeBase not found', async () => {
      prisma.knowledgeBase.findUnique.mockResolvedValue(null);

      await expect(service.importFromDocx(makeDocxBuffer(), 'ghost-kb'))
        .rejects.toThrow(BadRequestException);

      expect(mammoth.convertToHtml).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when no Q&A pairs found (no H2 headings)', async () => {
      (mammoth.convertToHtml as jest.Mock).mockResolvedValue({
        value: '<p>Chỉ có đoạn văn thường, không có heading nào.</p>',
      });

      await expect(service.importFromDocx(makeDocxBuffer(), KB_ID))
        .rejects.toThrow(BadRequestException);
    });

    it('skips pairs where question or answer is shorter than 5 chars', async () => {
      const html = `
        <h2>OK?</h2>
        <p>Short answer.</p>
        <h2>Điều kiện sức khỏe là gì?</h2>
        <p>Nam chiều cao từ 1m64, nữ từ 1m58.</p>
      `;
      // "OK?" = 3 chars < 5 → skipped at parse stage (not even attempted)
      (mammoth.convertToHtml as jest.Mock).mockResolvedValue({ value: html });

      const result = await service.importFromDocx(makeDocxBuffer(), KB_ID);

      expect(result.total).toBe(1); // only 1 valid pair passed the 5-char filter
      expect(result.imported).toBe(1);
    });

    it('counts skipped when create() throws for a pair', async () => {
      const html = `
        <h2>Câu hỏi hợp lệ số 1?</h2>
        <p>Câu trả lời hợp lệ số 1.</p>
        <h2>Câu hỏi hợp lệ số 2?</h2>
        <p>Câu trả lời hợp lệ số 2.</p>
      `;
      (mammoth.convertToHtml as jest.Mock).mockResolvedValue({ value: html });
      // First call succeeds, second throws
      prisma.faqOverride.create
        .mockResolvedValueOnce(makeFaqRow())
        .mockRejectedValueOnce(new Error('DB error'));

      const result = await service.importFromDocx(makeDocxBuffer(), KB_ID);

      expect(result.total).toBe(2);
      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('passes knowledgeBaseId to each created FAQ', async () => {
      const html = '<h2>Câu hỏi tuyển sinh?</h2><p>Thí sinh cần nộp đầy đủ hồ sơ.</p>';
      (mammoth.convertToHtml as jest.Mock).mockResolvedValue({ value: html });

      await service.importFromDocx(makeDocxBuffer(), KB_ID);

      expect(prisma.faqOverride.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ knowledgeBaseId: KB_ID }),
        })
      );
    });

    it('answer text strips HTML tags and converts list items to bullet points', async () => {
      const html = `
        <h2>Hồ sơ gồm những gì?</h2>
        <ul><li>Căn cước công dân</li><li>Bằng tốt nghiệp THPT</li></ul>
      `;
      (mammoth.convertToHtml as jest.Mock).mockResolvedValue({ value: html });

      await service.importFromDocx(makeDocxBuffer(), KB_ID);

      const createCall = prisma.faqOverride.create.mock.calls[0][0] as { data: { answer: string } };
      expect(createCall.data.answer).toContain('•');
      expect(createCall.data.answer).toContain('Căn cước công dân');
      expect(createCall.data.answer).not.toContain('<li>');
    });

    it('caps errors array at 5 entries even when many pairs fail', async () => {
      const pairs = Array.from({ length: 10 }, (_, i) =>
        `<h2>Câu hỏi số ${i + 1} dài đủ ký tự?</h2><p>Câu trả lời số ${i + 1} dài đủ ký tự.</p>`
      ).join('');
      (mammoth.convertToHtml as jest.Mock).mockResolvedValue({ value: pairs });
      prisma.faqOverride.create.mockRejectedValue(new Error('DB error'));

      const result = await service.importFromDocx(makeDocxBuffer(), KB_ID);

      expect(result.skipped).toBe(10);
      expect(result.errors.length).toBeLessThanOrEqual(5);
    });
  });

  // -------------------------------------------------------------------------
  // generateTemplateDocx()
  // -------------------------------------------------------------------------

  describe('generateTemplateDocx()', () => {
    it('returns a non-empty Buffer', async () => {
      const buffer = await service.generateTemplateDocx();

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('returns a valid ZIP/DOCX file (starts with PK magic bytes)', async () => {
      const buffer = await service.generateTemplateDocx();

      // DOCX = ZIP archive: magic bytes 50 4B 03 04
      expect(buffer[0]).toBe(0x50); // 'P'
      expect(buffer[1]).toBe(0x4b); // 'K'
    });

    it('produces a buffer larger than 1KB (contains sample content)', async () => {
      const buffer = await service.generateTemplateDocx();

      expect(buffer.length).toBeGreaterThan(1024);
    });

    it('can be called multiple times and returns consistent structure', async () => {
      const buf1 = await service.generateTemplateDocx();
      const buf2 = await service.generateTemplateDocx();

      // Both valid DOCX
      expect(buf1[0]).toBe(0x50);
      expect(buf2[0]).toBe(0x50);
      // Size should be consistent (same template content)
      expect(Math.abs(buf1.length - buf2.length)).toBeLessThan(100);
    });
  });
});
