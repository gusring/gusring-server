// 관리자 로그인 규칙 (docs/api.md "관리자 로그인")

export const SESSION_COOKIE = 'gusring_admin';
/** 쿠키는 API에만 붙는다 (화면 파일 /admin 요청에는 안 붙음) */
export const SESSION_COOKIE_PATH = '/api/v1';
/** 이만큼 아무것도 안 하면 로그아웃 */
export const SESSION_IDLE_MS = 2 * 60 * 60 * 1000;
/** 계속 써도 로그인부터 이 시간이 지나면 다시 로그인 */
export const SESSION_MAX_MS = 12 * 60 * 60 * 1000;
/** 마지막 사용 시각은 이 간격보다 자주 고쳐 쓰지 않는다 (요청마다 DB 쓰기 방지) */
export const SESSION_TOUCH_MS = 5 * 60 * 1000;

export const LOCK_AFTER = 5;
export const LOCK_MS = 15 * 60 * 1000;
