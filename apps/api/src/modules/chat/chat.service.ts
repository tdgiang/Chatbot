import { Injectable } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RagService } from '../rag/rag.service';
import { AiService } from '../ai/ai.service';
import { FaqService } from '../faq/faq.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { ChatMessage } from '@chatbot/shared-types';
import { Response } from 'express';

export interface ChatInternalParams {
  message: string;
  sessionId?: string;
  externalUserId: string;
  knowledgeBaseId: string;
  channelIntegrationId: string;
  channel: ChannelType;
}

export interface ChatInternalResult {
  session_id: string;
  message_id: string;
  content: string;
  latency_ms: number;
  source: 'faq' | 'rag';
}

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rag: RagService,
    private readonly ai: AiService,
    private readonly faq: FaqService,
  ) {}

  // ─── Public API (ApiKey flow) ────────────────────────────────────────────────

  async chat(
    dto: CreateChatDto,
    apiKeyId: string,
    knowledgeBaseId: string,
    res: Response,
  ) {
    const start = Date.now();

    const session = dto.session_id
      ? (await this.prisma.session.findUnique({ where: { id: dto.session_id } })) ??
        (await this.createApiKeySession(knowledgeBaseId, apiKeyId))
      : await this.createApiKeySession(knowledgeBaseId, apiKeyId);

    await this.prisma.message.create({
      data: { sessionId: session.id, role: 'USER', content: dto.message },
    });

    // LAYER 1: FAQ
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

    // LAYER 2: RAG
    const kb = await this.prisma.knowledgeBase.findUnique({ where: { id: knowledgeBaseId } });
    const chunks = await this.rag.search(dto.message, knowledgeBaseId);
    const history = await this.getHistory(session.id);
    const messages = this.buildMessages(kb?.systemPrompt ?? '', chunks, history, dto.message, chunks.length === 0);
    const aiOptions = { temperature: kb?.temperature ?? 0.3, maxTokens: kb?.maxTokens ?? 1024 };

    if (chunks.length === 0) {
      const content = this.rag.noContextReply;
      const latencyMs = Date.now() - start;
      const savedMsg = await this.saveAssistantMessage(session.id, content, latencyMs);

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

    if (dto.stream) {
      return this.streamResponse(res, session.id, messages, aiOptions, start);
    }

    const content = await this.ai.chat(messages, aiOptions);
    const latencyMs = Date.now() - start;
    const savedMsg = await this.saveAssistantMessage(session.id, content, latencyMs);

    return {
      session_id: session.id,
      message_id: savedMsg.id,
      message: { role: 'assistant', content },
      latency_ms: latencyMs,
      source: 'rag' as const,
    };
  }

  // ─── Channel Adapter flow (non-stream, used by Messenger/Zalo/Slack) ─────────

  async chatInternal(params: ChatInternalParams): Promise<ChatInternalResult> {
    const start = Date.now();
    const { message, sessionId, externalUserId, knowledgeBaseId, channelIntegrationId, channel } = params;

    const session = sessionId
      ? (await this.prisma.session.findUnique({ where: { id: sessionId } })) ??
        (await this.createChannelSession(knowledgeBaseId, channelIntegrationId, channel, externalUserId))
      : await this.createChannelSession(knowledgeBaseId, channelIntegrationId, channel, externalUserId);

    await this.prisma.message.create({
      data: { sessionId: session.id, role: 'USER', content: message },
    });

    // LAYER 1: FAQ
    const faqMatch = await this.faq.lookup(message, knowledgeBaseId);
    if (faqMatch) {
      const latencyMs = Date.now() - start;
      const savedMsg = await this.saveAssistantMessage(session.id, faqMatch.answer, latencyMs);
      return { session_id: session.id, message_id: savedMsg.id, content: faqMatch.answer, latency_ms: latencyMs, source: 'faq' };
    }

    // LAYER 2: RAG
    const kb = await this.prisma.knowledgeBase.findUnique({ where: { id: knowledgeBaseId } });
    const chunks = await this.rag.search(message, knowledgeBaseId);
    const history = await this.getHistory(session.id);

    if (chunks.length === 0) {
      const content = this.rag.noContextReply;
      const latencyMs = Date.now() - start;
      const savedMsg = await this.saveAssistantMessage(session.id, content, latencyMs);
      return { session_id: session.id, message_id: savedMsg.id, content, latency_ms: latencyMs, source: 'rag' };
    }

    const messages = this.buildMessages(kb?.systemPrompt ?? '', chunks, history, message, false);
    const aiOptions = { temperature: kb?.temperature ?? 0.3, maxTokens: kb?.maxTokens ?? 1024 };

    const content = await this.ai.chat(messages, aiOptions);
    const latencyMs = Date.now() - start;
    const savedMsg = await this.saveAssistantMessage(session.id, content, latencyMs);

    return { session_id: session.id, message_id: savedMsg.id, content, latency_ms: latencyMs, source: 'rag' };
  }

  // ─── Shared helpers ───────────────────────────────────────────────────────────

  private async getHistory(sessionId: string): Promise<{ role: 'USER' | 'ASSISTANT'; content: string }[]> {
    const rows = await this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: 7,
    });
    return rows
      .reverse()
      .slice(0, -1)
      .map((m) => ({ role: m.role as 'USER' | 'ASSISTANT', content: m.content }));
  }

  private buildMessages(
    systemPrompt: string,
    chunks: string[],
    history: { role: 'USER' | 'ASSISTANT'; content: string }[],
    userMessage: string,
    noContext: boolean,
  ): ChatMessage[] {
    if (noContext) return [];
    return this.rag.buildPrompt(systemPrompt, chunks, history, userMessage);
  }

  private async saveAssistantMessage(sessionId: string, content: string, latencyMs: number) {
    const msg = await this.prisma.message.create({
      data: { sessionId, role: 'ASSISTANT', content, latencyMs },
    });
    await this.prisma.session.update({ where: { id: sessionId }, data: { lastMessageAt: new Date() } });
    return msg;
  }

  private createApiKeySession(knowledgeBaseId: string, apiKeyId: string) {
    return this.prisma.session.create({ data: { knowledgeBaseId, apiKeyId } });
  }

  private createChannelSession(
    knowledgeBaseId: string,
    channelIntegrationId: string,
    channel: ChannelType,
    externalUserId: string,
  ) {
    return this.prisma.session.create({
      data: { knowledgeBaseId, channelIntegrationId, channel, externalUserId },
    });
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
    const savedMsg = await this.saveAssistantMessage(sessionId, fullContent, latencyMs);
    res.write(`data: ${JSON.stringify({ delta: '', done: true, session_id: sessionId, message_id: savedMsg.id, source: 'rag' })}\n\n`);
    res.end();
  }
}
