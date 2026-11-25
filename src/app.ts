import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { buildOpenApiDocument } from './config/openapi.js';
import { healthRouter } from './domains/health/health.route.js';
import { adminFeedbackRouter, feedbackRouter } from './domains/feedback/feedback.route.js';
import { eventRouter } from './domains/event/event.route.js';
import { adminStatsRouter } from './domains/stats/stats.route.js';
import { authRouter } from './domains/auth/auth.route.js';
import { adminAuditRouter } from './domains/audit/audit.route.js';
import { adminUsersRouter } from './domains/users/users.route.js';
import { requireAdmin, requireFreshPassword } from './middlewares/admin-auth.js';
import { errorHandler, notFound } from './middlewares/error-handler.js';
import { adminPageCsp, noStore, securityHeaders } from './middlewares/security-headers.js';

// 관리자 화면 파일 (src·dist 둘 다 저장소 루트 바로 아래라 같은 경로)
const ADMIN_PAGE_DIR = fileURLToPath(new URL('../public/admin', import.meta.url));

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
  // 관리자 화면 (데이터는 토큰을 넣은 뒤 /api/v1/admin/* 로 받는다)
  app.use('/admin', adminPageCsp, express.static(ADMIN_PAGE_DIR, { index: 'index.html', redirect: true }));

  const v1 = express.Router();
  v1.use('/feedbacks', feedbackRouter);
  v1.use('/events', eventRouter);
  v1.use('/auth', authRouter);
  // 임시 비밀번호로 들어온 관리자는 비밀번호를 바꾸기 전까지 /admin/* 를 못 쓴다 (/auth/password는 열려 있음)
  v1.use('/admin', noStore, requireAdmin, requireFreshPassword);
  v1.use('/admin/feedbacks', adminFeedbackRouter);
  v1.use('/admin/stats', adminStatsRouter);
  v1.use('/admin/audit-logs', adminAuditRouter);
  v1.use('/admin/users', adminUsersRouter);
  app.use('/api/v1', v1);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
