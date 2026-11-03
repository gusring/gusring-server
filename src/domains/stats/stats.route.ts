import { Router } from 'express';
import { z } from '../../config/zod.js';
import { adminAuth, errors, registry } from '../../config/openapi.js';
import { validateQuery } from '../../middlewares/validate.js';
import { success } from '../../utils/common-schema.js';
import { statsController as c } from './stats.controller.js';
import { dailyData, fillData, formStatsQuery, formsData, searchData, statsQuery, summaryData } from './stats.schema.js';

// ── 관리자: /api/v1/admin/stats ──
export const adminStatsRouter = Router();
adminStatsRouter.get('/summary', validateQuery(statsQuery), c.summary);
adminStatsRouter.get('/forms', validateQuery(formStatsQuery), c.forms);
adminStatsRouter.get('/daily', validateQuery(statsQuery), c.daily);
adminStatsRouter.get('/search', validateQuery(statsQuery), c.search);
adminStatsRouter.get('/fill', validateQuery(statsQuery), c.fill);
adminStatsRouter.get('/export', validateQuery(statsQuery), c.exportCsv);

const common = {
  tags: ['Admin · Stats'],
  security: [{ [adminAuth.name]: [] }],
  description: '기간은 한국 날짜 기준, to 포함. 기본 최근 30일, 최대 366일.',
};
const statsErrors = {
  ...errors({ 400: 'COMMON_INVALID_INPUT · STATS_INVALID_RANGE', 401: 'AUTH_ADMIN_REQUIRED', 503: 'AUTH_ADMIN_DISABLED' }),
};
const json = (schema: z.ZodType) => ({ 'application/json': { schema: success(schema) } });

const paths: [string, string, z.ZodObject, z.ZodType][] = [
  ['summary', '기간 합계 (방문자·조회·다운로드·작성 단계, 언어별 방문자)', statsQuery, summaryData],
  ['forms', '서식별 조회·다운로드 (lang으로 언어 거르기)', formStatsQuery, formsData],
  ['daily', '날짜별 방문자·조회·다운로드 (빈 날은 0)', statsQuery, dailyData],
  ['search', '많이 찾은 검색어 / 결과 0건 검색어 (각 20개)', statsQuery, searchData],
  ['fill', '서식 작성 도우미 단계별 수, 안내를 많이 연 칸', statsQuery, fillData],
];
for (const [name, summary, query, data] of paths) {
  registry.registerPath({
    method: 'get', path: `/api/v1/admin/stats/${name}`, ...common, summary,
    request: { query },
    responses: { 200: { description: '통계', content: json(data) }, ...statsErrors },
  });
}

registry.registerPath({
  method: 'get', path: '/api/v1/admin/stats/export', ...common,
  summary: '서식 × 언어 표 CSV 내려받기',
  description: `${common.description} 엑셀에서 한글이 깨지지 않게 BOM을 붙인다. 공통 응답 형식으로 감싸지 않는다.`,
  request: { query: statsQuery },
  responses: {
    200: { description: 'CSV 파일', content: { 'text/csv': { schema: z.string().openapi({ example: 'form_key,form_no,lang,views,downloads\r\n,4,ja,12,3\r\n' }) } } },
    ...statsErrors,
  },
});
