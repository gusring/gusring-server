import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { buildOpenApiDocument } from './config/openapi.js';
import { healthRouter } from './domains/health/health.route.js';
import { adminFeedbackRouter, feedbackRouter } from './domains/feedback/feedback.route.js';
import { eventRouter } from './domains/event/event.route.js';
import { adminStatsRouter } from './domains/stats/stats.route.js';
import { requireAdmin } from './middlewares/admin-auth.js';
import { errorHandler, notFound } from './middlewares/error-handler.js';
import { noStore, securityHeaders } from './middlewares/security-headers.js';

// 앱 구성만 담당한다. 서버 실행(listen)은 server.ts에서.
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(securityHeaders);
  // 앞단 프록시(Nginx) 개수만큼 X-Forwarded-For를 믿고 req.ip를 정한다
  app.set('trust proxy', env.trustProxy);
  app.use(cors({ origin: env.corsOrigins }));
  app.use(express.json({ limit: '100kb' }));

  // 버전 없는 경로: 상태 확인, API 문서
  app.use('/health', healthRouter);
  const openApiDocument = buildOpenApiDocument();
  app.get('/api-docs.json', (_req, res) => res.json(openApiDocument));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: '구스링 API' }));

  const v1 = express.Router();
  v1.use('/feedbacks', feedbackRouter);
  v1.use('/events', eventRouter);
  v1.use('/admin', noStore, requireAdmin);
  v1.use('/admin/feedbacks', adminFeedbackRouter);
  v1.use('/admin/stats', adminStatsRouter);
  app.use('/api/v1', v1);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
