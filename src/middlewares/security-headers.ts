import type { RequestHandler } from 'express';

// HSTS·nosniff는 Nginx가 붙인다 (deploy/nas/nginx). 여기서는 앱에서 정해야 하는 것만.

/** 모든 응답: 다른 사이트가 iframe으로 넣지 못하게, 이동할 때 주소를 넘기지 않게 */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.set({ 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
  next();
};

/** 관리자 응답: 피드백 본문에 개인정보가 있을 수 있어 브라우저·중간 캐시에 남기지 않는다 */
export const noStore: RequestHandler = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};
