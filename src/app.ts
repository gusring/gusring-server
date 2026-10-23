import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { healthRouter } from './routes/health.js';
import { errorHandler, notFound } from './middlewares/error-handler.js';

// 앱 구성만 담당한다. 서버 실행(listen)은 server.ts에서.
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: env.corsOrigins }));
  app.use(express.json({ limit: '100kb' }));

  app.use('/health', healthRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
