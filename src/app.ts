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
import { adminFormImageRouter, adminFormRouter, formImageRouter, formRouter } from './domains/form/form.route.js';
import { requireAdmin, requireFreshPassword } from './middlewares/admin-auth.js';
import { errorHandler, notFound } from './middlewares/error-handler.js';
import { adminPageCsp, noStore, securityHeaders } from './middlewares/security-headers.js';

// 관리자 화면 파일 (src·dist 둘 다 저장소 루트 바로 아래라 같은 경로)
const ADMIN_PAGE_DIR = fileURLToPath(new URL('../public/admin', import.meta.url));
// 서식 관리 화면 (gusring-web-v2에서 빌드해 넣는 SPA)
const FORM_ADMIN_DIR = fileURLToPath(new URL('../public/admin/forms', import.meta.url));

/** 서식 정의는 100KB를 넘을 수 있어 이 경로는 전체 JSON 읽기를 건너뛰고 라우터(로그인 확인 뒤)에서 1MB로 읽는다 */
const ADMIN_FORMS_PREFIX = '/api/v1/admin/forms';
const skipsGlobalJson = (path: string) => {
  const p = path.toLowerCase();
  return p === ADMIN_FORMS_PREFIX || p.startsWith(`${ADMIN_FORMS_PREFIX}/`);
};

/** 서식 관리 화면: 있는 파일은 그대로, 확장자 없는 주소(화면 안 경로)는 index.html (SPA) */
function formAdminPage() {
  const router = express.Router();
  router.use(adminPageCsp);
  // /admin/forms → /admin/forms/ (화면 안 상대 경로가 맞도록)
  router.use((req, res, next) => {
    if (req.originalUrl.split('?')[0] === req.baseUrl) return res.redirect(301, `${req.baseUrl}/`);
    next();
  });
  router.use(express.static(FORM_ADMIN_DIR, { index: 'index.html', redirect: true }));
  router.use((req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || /\.[^/]*$/.test(req.path)) return next();
    res.sendFile('index.html', { root: FORM_ADMIN_DIR });
  });
  return router;
}

// 앱 구성만 담당한다. 서버 실행(listen)은 server.ts에서.
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(securityHeaders);
  // 앞단 프록시(Nginx) 개수만큼 X-Forwarded-For를 믿고 req.ip를 정한다
  app.set('trust proxy', env.trustProxy);
  app.use(cors({ origin: env.corsOrigins }));
  const json = express.json({ limit: '100kb' });
  app.use((req, res, next) => (skipsGlobalJson(req.path) ? next() : json(req, res, next)));

  // 버전 없는 경로: 상태 확인, API 문서
  app.use('/health', healthRouter);
  const openApiDocument = buildOpenApiDocument();
  app.get('/api-docs.json', (_req, res) => res.json(openApiDocument));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: '구스링 API' }));
  // 관리자 화면 (데이터는 토큰을 넣은 뒤 /api/v1/admin/* 로 받는다)
  app.use('/admin/forms', formAdminPage());
  app.use('/admin', adminPageCsp, express.static(ADMIN_PAGE_DIR, { index: 'index.html', redirect: true }));

  const v1 = express.Router();
  v1.use('/feedbacks', feedbackRouter);
  v1.use('/events', eventRouter);
  v1.use('/auth', authRouter);
  v1.use('/forms', formRouter);
  v1.use('/form-images', formImageRouter);
  // 임시 비밀번호로 들어온 관리자는 비밀번호를 바꾸기 전까지 /admin/* 를 못 쓴다 (/auth/password는 열려 있음)
  v1.use('/admin', noStore, requireAdmin, requireFreshPassword);
  v1.use('/admin/feedbacks', adminFeedbackRouter);
  v1.use('/admin/stats', adminStatsRouter);
  v1.use('/admin/audit-logs', adminAuditRouter);
  v1.use('/admin/users', adminUsersRouter);
  v1.use('/admin/forms', adminFormRouter);
  v1.use('/admin/form-images', adminFormImageRouter);
  app.use('/api/v1', v1);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
