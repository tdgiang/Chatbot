/**
 * ChatService — Phase 2 integration tests
 * Verifies the 3-layer flow: FAQ → RAG → AI (or fallback)
 */

import { Test } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RagService } from '../rag/rag.service';
import { AiService } from '../ai/ai.service';
import { FaqService } from '../faq/faq.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION = { id: 'sess-1', knowledgeBaseId: 'kb-1', apiKeyId: 'key-1' };
const KB      = { id: 'kb-1', systemPrompt: 'Bạn là trợ lý.', temperature: 0.3, maxTokens: 512 };
const MSG     = { id: 'msg-1', sessionId: 'sess-1', role: 'ASSISTANT', content: 'ok', latencyMs: 10, createdAt: new Date() };

function makeMockRes() {
  return {
    setHeader: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    json: jest.fn(),
  };
}

function makeDto(overrides: Partial<{ message: string; session_id: string; stream: boolean }> = {}) {
  return { message: 'Học phí bao nhiêu?', stream: false, ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatService — FAQ + RAG flow', () => {
  let service: ChatService;
  let prisma: {
    session: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    message: { create: jest.Mock; findMany: jest.Mock };
    knowledgeBase: { findUnique: jest.Mock };
  };
  let rag:  { search: jest.Mock; buildPrompt: jest.Mock; noContextReply: string };
  let ai:   { chat: jest.Mock; chatStream: jest.Mock };
  let faq:  { lookup: jest.Mock };

  beforeEach(async () => {
    prisma = {
      session: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(SESSION),
        update: jest.fn().mockResolvedValue(SESSION),
      },
      message: {
        create: jest.fn().mockResolvedValue(MSG),
        findMany: jest.fn().mockResolvedValue([]),
      },
      knowledgeBase: { findUnique: jest.fn().mockResolvedValue(KB) },
    };
    rag = {
      search: jest.fn().mockResolvedValue(['Chunk A']),
      buildPrompt: jest.fn().mockReturnValue([{ role: 'USER', content: 'prompt' }]),
      noContextReply: 'Xin lỗi, không tìm thấy thông tin.',
    };
    ai  = { chat: jest.fn().mockResolvedValue('AI answer'), chatStream: jest.fn() };
    faq = { lookup: jest.fn().mockResolvedValue(null) }; // default: no FAQ match

    const module = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prisma },
        { provide: RagService,    useValue: rag   },
        { provide: AiService,     useValue: ai    },
        { provide: FaqService,    useValue: faq   },
      ],
    }).compile();

    service = module.get(ChatService);
  });

  // -------------------------------------------------------------------------
  // LAYER 1: FAQ match — skip RAG & AI
  // -------------------------------------------------------------------------

  describe('LAYER 1 — FAQ match', () => {
    it('returns FAQ answer with source="faq" without calling RAG or AI', async () => {
      faq.lookup.mockResolvedValue({ id: 'faq-1', answer: 'Học phí miễn phí.' });
      const res = makeMockRes();

      const result = await service.chat(makeDto(), 'key-1', 'kb-1', res as never);

      expect(result).toMatchObject({
        source: 'faq',
        message: { role: 'assistant', content: 'Học phí miễn phí.' },
      });
      expect(rag.search).not.toHaveBeenCalled();
      expect(ai.chat).not.toHaveBeenCalled();
    });

    it('response includes message_id and session_id', async () => {
      faq.lookup.mockResolvedValue({ id: 'faq-1', answer: 'Câu trả lời FAQ.' });
      const res = makeMockRes();

      const result = await service.chat(makeDto(), 'key-1', 'kb-1', res as never);

      expect(result).toHaveProperty('message_id');
      expect(result).toHaveProperty('session_id');
    });

    it('saves FAQ answer as ASSISTANT message to DB', async () => {
      faq.lookup.mockResolvedValue({ id: 'faq-1', answer: 'FAQ answer.' });

      await service.chat(makeDto(), 'key-1', 'kb-1', makeMockRes() as never);

      // First create = USER message, second = ASSISTANT FAQ reply
      expect(prisma.message.create).toHaveBeenCalledTimes(2);
      const secondCall = prisma.message.create.mock.calls[1][0];
      expect(secondCall.data.role).toBe('ASSISTANT');
      expect(secondCall.data.content).toBe('FAQ answer.');
    });

    it('streams FAQ answer with source="faq" in done event', async () => {
      faq.lookup.mockResolvedValue({ id: 'faq-1', answer: 'FAQ stream.' });
      const res = makeMockRes();

      await service.chat(makeDto({ stream: true }), 'key-1', 'kb-1', res as never);

      expect(res.write).toHaveBeenCalledTimes(2);
      const doneEvent = JSON.parse(
        (res.write.mock.calls[1][0] as string).replace('data: ', '')
      );
      expect(doneEvent.source).toBe('faq');
      expect(doneEvent.done).toBe(true);
      expect(res.end).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // LAYER 2: RAG match — FAQ miss, AI answers
  // -------------------------------------------------------------------------

  describe('LAYER 2 — RAG + AI', () => {
    it('calls RAG and AI when FAQ returns null', async () => {
      faq.lookup.mockResolvedValue(null);
      const res = makeMockRes();

      const result = await service.chat(makeDto(), 'key-1', 'kb-1', res as never);

      expect(rag.search).toHaveBeenCalledWith('Học phí bao nhiêu?', 'kb-1');
      expect(ai.chat).toHaveBeenCalled();
      expect(result).toMatchObject({ source: 'rag', message: { content: 'AI answer' } });
    });

    it('response includes message_id and session_id', async () => {
      faq.lookup.mockResolvedValue(null);

      const result = await service.chat(makeDto(), 'key-1', 'kb-1', makeMockRes() as never);

      expect(result).toHaveProperty('message_id');
      expect(result).toHaveProperty('session_id', SESSION.id);
    });
  });

  // -------------------------------------------------------------------------
  // No context fallback — FAQ miss + no RAG chunks
  // -------------------------------------------------------------------------

  describe('Fallback — no context', () => {
    it('returns noContextReply with source="rag" when RAG finds nothing', async () => {
      faq.lookup.mockResolvedValue(null);
      rag.search.mockResolvedValue([]); // no relevant chunks

      const result = await service.chat(makeDto(), 'key-1', 'kb-1', makeMockRes() as never);

      expect(ai.chat).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        source: 'rag',
        message: { content: rag.noContextReply },
      });
    });

    it('streams noContextReply and ends connection', async () => {
      faq.lookup.mockResolvedValue(null);
      rag.search.mockResolvedValue([]);
      const res = makeMockRes();

      await service.chat(makeDto({ stream: true }), 'key-1', 'kb-1', res as never);

      expect(res.setHeader).toHaveBeenCalled();
      expect(res.end).toHaveBeenCalled();
      expect(ai.chatStream).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Session handling
  // -------------------------------------------------------------------------

  describe('Session handling', () => {
    it('creates new session when session_id not provided', async () => {
      faq.lookup.mockResolvedValue(null);

      await service.chat(makeDto(), 'key-1', 'kb-1', makeMockRes() as never);

      expect(prisma.session.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { knowledgeBaseId: 'kb-1', apiKeyId: 'key-1' } })
      );
    });

    it('reuses existing session when valid session_id provided', async () => {
      prisma.session.findUnique.mockResolvedValue(SESSION);
      faq.lookup.mockResolvedValue(null);

      await service.chat(makeDto({ session_id: 'sess-1' }), 'key-1', 'kb-1', makeMockRes() as never);

      expect(prisma.session.create).not.toHaveBeenCalled();
      expect(prisma.session.findUnique).toHaveBeenCalledWith({ where: { id: 'sess-1' } });
    });

    it('creates new session when provided session_id does not exist', async () => {
      prisma.session.findUnique.mockResolvedValue(null); // session not found
      faq.lookup.mockResolvedValue(null);

      await service.chat(makeDto({ session_id: 'missing-sess' }), 'key-1', 'kb-1', makeMockRes() as never);

      expect(prisma.session.create).toHaveBeenCalled();
    });

    it('saves user message before doing any lookup', async () => {
      faq.lookup.mockResolvedValue({ id: 'faq-1', answer: 'x' });
      const callOrder: string[] = [];
      prisma.message.create.mockImplementation(() => {
        callOrder.push('message.create');
        return Promise.resolve(MSG);
      });
      faq.lookup.mockImplementation(() => {
        callOrder.push('faq.lookup');
        return Promise.resolve({ id: 'faq-1', answer: 'x' });
      });

      await service.chat(makeDto(), 'key-1', 'kb-1', makeMockRes() as never);

      expect(callOrder[0]).toBe('message.create'); // USER msg saved first
      expect(callOrder[1]).toBe('faq.lookup');
    });
  });
});
