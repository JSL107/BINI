import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Reusable factory: builds and configures the Nest app without binding a port.
 * Used by `apps/api/api/index.ts` (Vercel serverless entry) and by the local
 * dev/start path below (`require.main === module`).
 */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' });
  return app;
}

if (require.main === module) {
  void createApp().then((app) => app.listen(process.env.PORT ?? 3000));
}
