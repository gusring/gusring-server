import { Router } from 'express';

export const healthRouter = Router();

// 서버가 살아 있는지 확인 (배포 후 점검용)
healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
});
