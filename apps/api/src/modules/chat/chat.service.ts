import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RagService } from '../rag/rag.service';
import { AiService } from '../ai/ai.service';
import { FaqService } from '../faq/faq.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { ChatMessage } from '@chatbot/shared-types';
import { Response } from 'express';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rag: RagService,
    private readonly ai: AiService,
    private readonly faq: FaqService,
  ) {}

  async chat(
    dto: CreateChatDto,
    apiKeyId: string,
    knowledgeBaseId: string,
    res: Response,
  ) {
    const start = Date.now();

    // Get or create session
    const session = dto.session_id
      ? await this.prisma.session.findUnique({ where: { id: dto.session_id } }) ??
        await this.createSession(knowledgeBaseId, apiKeyId)
      : await this.createSession(knowledgeBaseId, apiKeyId);

    // Save user message
    await this.prisma.message.create({
      data: { sessionId: session.id, role: 'USER', content: dto.message },
    });

    // LAYER 1: FAQ lookup — return pre-authored answer immediately, skip AI
    const faqMatch = await this.faq.lookup(dto.message, knowledgeBaseId);
    if (faqMatch) {
      const latencyMs = Date.now() - start;
      const savedMsg = await this.prisma.message.create({
        data: { sessionId: session.id, role: 'ASSISTANT', content: faqMatch.answer, latencyMs },
      });
      await this.prisma.session.update({ where: { id: session.id }, data: { lastMessageAt: new Date() } });

      if (dto.stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.write(`data: ${JSON.stringify({ delta: faqMatch.answer, done: false })}\n\n`);
        res.write(`data: ${JSON.stringify({ delta: '', done: true, session_id: session.id, message_id: savedMsg.id, source: 'faq' })}\n\n`);
        res.end();
        return;
      }
      return {
        session_id: session.id,
        message_id: savedMsg.id,
        message: { role: 'assistant', content: faqMatch.answer },
        latency_ms: latencyMs,
        source: 'faq' as const,
      };
    }

    // Get recent history (last 6 messages = 3 pairs)
    const history = await this.prisma.message.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'desc' },
      take: 7,
    });
    const historyMessages = history
      .reverse()
      .slice(0, -1)
      .map((m) => ({ role: m.role as 'USER' | 'ASSISTANT', content: m.content }));

    // LAYER 2: RAG search (isEnabled=true chunks only)
    const kb = await this.prisma.knowledgeBase.findUnique({ where: { id: knowledgeBaseId } });
    const chunks = await this.rag.search(dto.message, knowledgeBaseId);

    // No relevant context
    if (chunks.length === 0) {
      const content = this.rag.noContextReply;
      const latencyMs = Date.now() - start;
      const savedMsg = await this.prisma.message.create({
        data: { sessionId: session.id, role: 'ASSISTANT', content, latencyMs },
      });
      await this.prisma.session.update({ where: { id: session.id }, data: { lastMessageAt: new Date() } });

      if (dto.stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.write(`data: ${JSON.stringify({ delta: content, done: false })}\n\n`);
        res.write(`data: ${JSON.stringify({ delta: '', done: true, session_id: session.id, message_id: savedMsg.id, source: 'rag' })}\n\n`);
        res.end();
        return;
      }
      return {
        session_id: session.id,
        message_id: savedMsg.id,
        message: { role: 'assistant', content },
        latency_ms: latencyMs,
        source: 'rag' as const,
      };
    }

    const messages = this.rag.buildPrompt(
      kb?.systemPrompt ?? '',
      chunks,
      historyMessages,
      dto.message,
    );

    const aiOptions = { temperature: kb?.temperature ?? 0.3, maxTokens: kb?.maxTokens ?? 1024 };

    if (dto.stream) {
      return this.streamResponse(res, session.id, messages, aiOptions, start);
    }

    const content = await this.ai.chat(messages, aiOptions);
    const latencyMs = Date.now() - start;

    const savedMsg = await this.prisma.message.create({
      data: { sessionId: session.id, role: 'ASSISTANT', content, latencyMs },
    });
    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastMessageAt: new Date() },
    });

    return {
      session_id: session.id,
      message_id: savedMsg.id,
      message: { role: 'assistant', content },
      latency_ms: latencyMs,
      source: 'rag' as const,
    };
  }

  private async streamResponse(
    res: Response,
    sessionId: string,
    messages: ChatMessage[],
    aiOptions: { temperature: number; maxTokens: number },
    start: number,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullContent = '';
    for await (const delta of this.ai.chatStream(messages, aiOptions)) {
      fullContent += delta;
      res.write(`data: ${JSON.stringify({ delta, done: false })}\n\n`);
    }

    const latencyMs = Date.now() - start;
    const savedMsg = await this.prisma.message.create({
      data: { sessionId, role: 'ASSISTANT', content: fullContent, latencyMs },
    });
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { lastMessageAt: new Date() },
    });

    res.write(`data: ${JSON.stringify({ delta: '', done: true, session_id: sessionId, message_id: savedMsg.id, source: 'rag' })}\n\n`);
    res.end();
  }

  private createSession(knowledgeBaseId: string, apiKeyId: string) {
    return this.prisma.session.create({ data: { knowledgeBaseId, apiKeyId } });
  }
}
