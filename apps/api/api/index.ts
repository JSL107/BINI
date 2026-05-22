import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../src/main';

// Cache the boot across warm invocations of the same serverless instance.
let cached: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!cached) {
    const app = await createApp();
    await app.init();
    cached = app.getHttpAdapter().getInstance();
  }
  cached!(req, res);
}
