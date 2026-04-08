import {
  Controller, Post, Get, Body, Query,
  HttpCode, UseGuards, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { ApiKeyGuard } from '../chat/guards/api-key.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// Public endpoint — authenticated by API key (same as /chat)
@Controller('api/v1/feedback')
@UseGuards(ApiKeyGuard)
export class FeedbackPublicController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @HttpCode(201)
  submit(@Body() dto: SubmitFeedbackDto) {
    return this.feedbackService.submit(dto);
  }
}

// CMS endpoints — authenticated by JWT
@Controller('cms/analytics/feedback')
@UseGuards(JwtAuthGuard)
export class FeedbackCmsController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Get('stats')
  stats() {
    return this.feedbackService.stats();
  }

  @Get()
  list(
    @Query('rating') rawRating?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    const rating = rawRating !== undefined ? parseInt(rawRating, 10) : undefined;
    return this.feedbackService.list(rating, page, limit);
  }
}
