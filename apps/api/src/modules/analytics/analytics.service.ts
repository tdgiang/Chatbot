import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSessions(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.session.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { messages: true } }, knowledgeBase: { select: { name: true } } },
      }),
      this.prisma.session.count(),
    ]);
    return { data, total, page, limit };
  }

  async getMessages(sessionId?: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const where = sessionId ? { sessionId } : {};
    const [data, total] = await Promise.all([
      this.prisma.message.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.message.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async getStats() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalSessions, totalMessages, sessionsToday] = await Promise.all([
      this.prisma.session.count(),
      this.prisma.message.count(),
      this.prisma.session.count({ where: { createdAt: { gte: todayStart } } }),
    ]);

    return { totalSessions, totalMessages, sessionsToday };
  }
}
