import type { Request, Response } from 'express';
import { createServer } from '../server.ts';

let cachedApp: Awaited<ReturnType<typeof createServer>> | null = null;

export default async function handler(req: Request, res: Response) {
  if (!cachedApp) {
    cachedApp = await createServer();
  }
  return cachedApp(req, res);
}
