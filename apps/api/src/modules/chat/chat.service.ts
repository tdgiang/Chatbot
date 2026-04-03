import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RagService } from '../rag/rag.service';
import { AiService } from '../ai/ai.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { Response } from 'express';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rag: RagService,
    private readonly ai: AiService,
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

    // Get recent history (last 6 messages = 3 pairs)
    const history = await this.prisma.message.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'desc' },
      take: 7, // 6 history + the one we just saved
    });
    const historyMessages = history
      .reverse()
      .slice(0, -1) // exclude the message we just saved
      .map((m) => ({ role: m.role as 'USER' | 'ASSISTANT', content: m.content }));

    // RAG
    const kb = await this.prisma.knowledgeBase.findUnique({ where: { id: knowledgeBaseId } });
    const chunks = await this.rag.search(dto.message, knowledgeBaseId);
    const messages = this.rag.buildPrompt(
      kb?.systemPrompt ?? '',
      chunks,
      historyMessages,
      dto.message,
    );

    const aiOptions = { temperature: kb?.temperature ?? 0.3, maxTokens: kb?.maxTokens ?? 512 };

    if (dto.stream) {
      return this.streamResponse(res, session.id, messages, aiOptions, start);
    }

    const content = await this.ai.chat(messages, aiOptions);
    const latencyMs = Date.now() - start;

    await this.prisma.message.create({
      data: { sessionId: session.id, role: 'ASSISTANT', content, latencyMs },
    });
    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastMessageAt: new Date() },
    });

    return { session_id: session.id, message: { role: 'assistant', content }, latency_ms: latencyMs };
  }

  private async streamResponse(
    res: Response,
    sessionId: string,
    messages: { role: 'USER' | 'ASSISTANT'; content: string }[],
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
    res.write(`data: ${JSON.stringify({ delta: '', done: true, session_id: sessionId })}\n\n`);
    res.end();

    await this.prisma.message.create({
      data: { sessionId, role: 'ASSISTANT', content: fullContent, latencyMs },
    });
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { lastMessageAt: new Date() },
    });
  }

  private createSession(knowledgeBaseId: string, apiKeyId: string) {
    return this.prisma.session.create({ data: { knowledgeBaseId, apiKeyId } });
  }
}
