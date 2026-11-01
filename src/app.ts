import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { healthRouter } from './routes/health.js';
import { feedbackRouter } from './routes/feedback.js';
import { eventsRouter } from './routes/events.js';
import { adminFeedbackRouter } from './routes/admin-feedback.js';
import { adminStatsRouter } from './routes/admin-stats.js';
import { requireAdmin } from './middlewares/admin-auth.js';
import { errorHandler, notFound } from './middlewares/error-handler.js';

// 앱 구성만 담당한다. 서버 실행(listen)은 server.ts에서.
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // 앞단 프록시(Vercel 등) 개수만큼 X-Forwarded-For를 믿고 req.ip를 정한다
  app.set('trust proxy', env.trustProxy);
  app.use(cors({ origin: env.corsOrigins }));
  app.use(express.json({ limit: '100kb' }));

  app.use('/health', healthRouter);
  app.use('/feedback', feedbackRouter);
  app.use('/events', eventsRouter);
  app.use('/admin', requireAdmin);
  app.use('/admin/feedback', adminFeedbackRouter);
  app.use('/admin/stats', adminStatsRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
