import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // POST /api/v1/feedback  (API key auth — public widget)
  // ---------------------------------------------------------------------------

  async submit(dto: SubmitFeedbackDto) {
    // Verify message exists and belongs to session
    const message = await this.prisma.message.findUnique({
      where: { id: dto.message_id },
      select: { id: true, sessionId: true, role: true },
    });

    if (!message) throw new NotFoundException('Message không tồn tại');
    if (message.sessionId !== dto.session_id) {
      throw new BadRequestException('message_id không thuộc session này');
    }
    if (message.role !== 'ASSISTANT') {
      throw new BadRequestException('Chỉ có thể đánh giá tin nhắn của bot');
    }

    // One feedback per message (messageId is @unique)
    const existing = await this.prisma.messageFeedback.findUnique({
      where: { messageId: dto.message_id },
    });
    if (existing) throw new ConflictException('Tin nhắn này đã được đánh giá');

    const feedback = await this.prisma.messageFeedback.create({
      data: {
        messageId: dto.message_id,
        sessionId: dto.session_id,
        rating: dto.rating,
        note: dto.note ?? null,
      },
    });

    return {
      id: feedback.id,
      messageId: feedback.messageId,
      sessionId: feedback.sessionId,
      rating: feedback.rating as 1 | -1,
      note: feedback.note,
      createdAt: feedback.createdAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // GET /cms/analytics/feedback  (JWT auth — CMS)
  // ---------------------------------------------------------------------------

  async list(rating?: number, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = rating !== undefined ? { rating } : {};

    const [rows, total] = await Promise.all([
      this.prisma.messageFeedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          message: { select: { content: true, sessionId: true } },
          session: {
            include: {
              messages: {
                where: { role: 'USER' },
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { content: true },
              },
            },
          },
        },
      }),
      this.prisma.messageFeedback.count({ where }),
    ]);

    return {
      data: rows.map((r) => ({
        id: r.id,
        messageId: r.messageId,
        sessionId: r.sessionId,
        rating: r.rating as 1 | -1,
        note: r.note,
        createdAt: r.createdAt.toISOString(),
        botAnswer: r.message?.content,
        userQuestion: r.session?.messages[0]?.content,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ---------------------------------------------------------------------------
  // GET /cms/analytics/feedback/stats  (JWT auth — CMS)
  // ---------------------------------------------------------------------------

  async stats() {
    const [total, positive] = await Promise.all([
      this.prisma.messageFeedback.count(),
      this.prisma.messageFeedback.count({ where: { rating: 1 } }),
    ]);

    const negative = total - positive;
    return {
      total,
      positive,
      negative,
      positiveRate: total > 0 ? Math.round((positive / total) * 100) : 0,
    };
  }
}
