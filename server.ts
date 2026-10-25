import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createApiApp } from './src/server/app.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createServer() {
  const app = createApiApp();

  if (!process.env.VERCEL) {
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(__dirname, 'dist');
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  return app;
}

if (!process.env.VERCEL) {
  const PORT = Number(process.env.PORT) || 3000;
  createServer().then((app) => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(
        `EPIM Arquidiócesis de Maracaibo server listening on http://0.0.0.0:${PORT}`
      );
    });
  });
}
