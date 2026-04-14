import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './shared/filters/global-exception.filter';
import { LoggingInterceptor } from './shared/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // CORS for static assets (Express static bypasses NestJS CORS middleware)
  app.use('/widget', (_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  });

  // Serve widget static file: GET /widget/chatbot.js
  app.useStaticAssets(join(__dirname, '..', 'public'), { prefix: '/widget' });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  const cmsOrigins = (process.env.CMS_URL ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    // Widget + public chat endpoint: allow any origin (ApiKeyGuard handles auth + per-key origin check)
    // CMS endpoints: restrict to CMS origins
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // server-to-server / curl
      if (cmsOrigins.includes(origin)) return callback(null, true);
      // Allow all origins for public endpoints — ApiKeyGuard enforces allowedOrigins per key
      callback(null, true);
    },
    credentials: true,
  });

  const port = process.env.API_PORT ?? 4000;
  await app.listen(port);
  console.log(`API running on http://localhost:${port}`);
}

bootstrap();
