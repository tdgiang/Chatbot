import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

@Controller('cms/analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('stats')
  getStats() {
    return this.analyticsService.getStats();
  }

  @Get('sessions')
  getSessions(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.analyticsService.getSessions(+page, +limit);
  }

  @Get('messages')
  getMessages(
    @Query('sessionId') sessionId?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.analyticsService.getMessages(sessionId, +page, +limit);
  }
}
