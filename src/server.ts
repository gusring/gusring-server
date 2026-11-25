import { createApp } from './app.js';
import { env } from './config/env.js';
import { disconnectPrisma } from './config/prisma.js';

const app = createApp();

const server = app.listen(env.port, () => {
  console.info(`gusring-server listening on http://localhost:${env.port} (${env.nodeEnv})`);
  // 1단계 관리자 인증은 토큰 하나뿐이라 짧으면 맞혀 볼 수 있다 (만드는 법: deploy/nas/.env.example)
  if (env.nodeEnv === 'production' && env.adminToken && env.adminToken.length < 32) {
    console.error('경고: ADMIN_TOKEN이 32자보다 짧습니다. 길고 무작위인 값으로 바꾸세요.');
  }
});

// docker stop·배포 때 SIGTERM이 온다. 컨테이너에서 node는 PID 1이라 처리기가 없으면 신호를 무시하고
// 10초 뒤 강제 종료(SIGKILL)되며 처리 중인 요청이 끊긴다 → 새 요청을 그만 받고, 처리 중인 것을 끝낸 뒤 DB 연결을 닫는다.
const FORCE_EXIT_MS = 8000; // docker stop 기본 대기 10초보다 짧게

let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.info(`${signal} 받음: 새 요청을 받지 않고 처리 중인 요청을 마친 뒤 종료합니다`);
  setTimeout(() => {
    console.error(`${FORCE_EXIT_MS}ms 안에 끝나지 않아 강제 종료합니다`);
    process.exit(1);
  }, FORCE_EXIT_MS).unref();

  server.close(async (err) => {
    await disconnectPrisma().catch((e: unknown) => console.error(e));
    if (err) console.error(err);
    process.exit(err ? 1 : 0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
