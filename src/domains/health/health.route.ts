import { Router } from 'express';
import { z } from '../../config/zod.js';
import { registry } from '../../config/openapi.js';
import { success } from '../../utils/common-schema.js';
import { sendSuccess } from '../../utils/response.js';

// 서버가 살아 있는지 확인 (배포 후 점검·도커 헬스체크용). 버전 없이 /health
export const healthRouter = Router();
healthRouter.get('/', (_req, res) => {
  sendSuccess(res, { message: '정상입니다.', data: { status: 'ok', uptime: Math.round(process.uptime()) } });
});

registry.registerPath({
  method: 'get', path: '/health', tags: ['Health'],
  summary: '서버 상태',
  responses: {
    200: {
      description: '정상',
      content: { 'application/json': { schema: success(z.object({ status: z.literal('ok'), uptime: z.number().openapi({ description: '켜진 뒤 초' }) })) } },
    },
  },
});
