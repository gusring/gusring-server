// 에러 코드의 유일한 기준. 형식: {도메인}_{내용}
// 새 코드를 추가하면 Swagger 문서와 Nginx 응답(deploy/nas/nginx)에 쓰는지도 확인한다.

export const ERROR_CODE = {
  COMMON_INVALID_INPUT: { status: 400, message: '입력값이 올바르지 않습니다.' },
  COMMON_BAD_REQUEST: { status: 400, message: '요청 형식이 올바르지 않습니다.' },
  COMMON_NOT_FOUND: { status: 404, message: '경로가 없습니다.' },
  COMMON_PAYLOAD_TOO_LARGE: { status: 413, message: '요청이 너무 큽니다.' },
  /** Nginx 속도 제한에서 쓴다 */
  COMMON_TOO_MANY_REQUESTS: { status: 429, message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
  COMMON_INTERNAL_ERROR: { status: 500, message: '서버 오류가 발생했습니다.' },
  /** Nginx(인증서 발급 전)에서 쓴다 */
  COMMON_NOT_READY: { status: 503, message: '아직 준비 중입니다.' },

  AUTH_ADMIN_REQUIRED: { status: 401, message: '관리자 인증이 필요합니다.' },
  AUTH_ADMIN_DISABLED: { status: 503, message: '관리자 토큰이 설정되지 않았습니다.' },

  FEEDBACK_RATE_LIMITED: { status: 429, message: '잠시 후 다시 보내 주세요.' },
  FEEDBACK_NOT_FOUND: { status: 404, message: '피드백이 없습니다.' },

  STATS_INVALID_RANGE: { status: 400, message: '조회 기간이 올바르지 않습니다.' },
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCode = keyof typeof ERROR_CODE;
export const ERROR_CODES = Object.keys(ERROR_CODE) as [ErrorCode, ...ErrorCode[]];
