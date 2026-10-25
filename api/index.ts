import type { Request, Response } from 'express';
import { createApiApp } from '../src/server/app.js';

const app = createApiApp();

export default async function handler(req: Request, res: Response): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    res.on('finish', resolve);
    res.on('close', resolve);
    res.on('error', reject);
    app(req, res);
  });
}
