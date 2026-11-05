// 관리자 계정 관리 (NAS에서):
//   docker compose exec app node dist/cli/admin-user.js list
//   docker compose exec app node dist/cli/admin-user.js create <아이디>    # 비밀번호를 두 번 묻는다 (화면에 안 보임)
//   docker compose exec app node dist/cli/admin-user.js passwd <아이디>
//   docker compose exec app node dist/cli/admin-user.js disable|enable|unlock <아이디>
// 비밀번호는 명령줄 인자로 받지 않는다 (셸 기록·프로세스 목록에 남기 때문).
import { disconnectPrisma } from '../config/prisma.js';
import { adminUserService as users } from '../domains/auth/admin-user.service.js';

const USAGE = `사용: admin-user.js <list | create <아이디> | passwd <아이디> | disable <아이디> | enable <아이디> | unlock <아이디>>`;

/** 터미널이면 화면에 보이지 않게 입력받는다. 파이프로 들어오면 첫 줄을 쓴다 */
function readPassword(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return new Promise((resolve) => {
      let buf = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (c) => (buf += c));
      stdin.on('end', () => resolve(buf.split(/\r?\n/)[0] ?? ''));
    });
  }
  process.stdout.write(question);
  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (err: Error | null) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
      if (err) reject(err);
      else resolve(value);
    };
    // 한 번에 여러 줄이 들어오면(붙여넣기) 엔터 뒤 글자는 다음 질문 몫으로 남긴다
    const consume = (): boolean => {
      while (pendingInput.length > 0) {
        const ch = pendingInput[0]!;
        pendingInput = pendingInput.slice(1);
        if (ch === '\r' || ch === '\n') {
          if (pendingInput[0] === '\n' && ch === '\r') pendingInput = pendingInput.slice(1);
          finish(null);
          return true;
        }
        if (ch === '\u0003') {
          finish(new Error('취소했습니다.'));
          return true;
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
      return false;
    };
    const onData = (chunk: string) => {
      pendingInput += chunk;
      consume();
    };
    stdin.on('data', onData);
    if (!consume()) stdin.resume();
  });
}
let pendingInput = '';

async function newPassword(): Promise<string> {
  const first = await readPassword('새 비밀번호 (10자 이상): ');
  if (!process.stdin.isTTY) return first;
  const second = await readPassword('한 번 더: ');
  if (first !== second) throw new Error('두 비밀번호가 다릅니다.');
  return first;
}

async function main(argv: string[]) {
  const [cmd, username] = argv;
  switch (cmd) {
    case 'list': {
      const rows = await users.list();
      if (rows.length === 0) console.info('계정이 없습니다. create로 만드세요.');
      for (const u of rows) {
        const state = u.disabled ? '막힘' : u.lockedUntil && u.lockedUntil > new Date() ? '잠김' : '사용';
        const last = u.lastLoginAt ? u.lastLoginAt.toISOString() : '로그인 기록 없음';
        console.info(`${u.username}\t${state}\t로그인 중 ${u._count.sessions}\t마지막 ${last}`);
      }
      return;
    }
    case 'create':
    case 'passwd':
    case 'disable':
    case 'enable':
    case 'unlock':
      if (!username) throw new Error(USAGE);
      break;
    default:
      throw new Error(USAGE);
  }
  const name = username.trim().toLowerCase();
  if (cmd === 'create') await users.create(name, await newPassword());
  else if (cmd === 'passwd') await users.setPassword(name, await newPassword());
  else if (cmd === 'disable') await users.disable(name);
  else if (cmd === 'enable') await users.enable(name);
  else await users.unlock(name);
  const done = { create: '만들었습니다', passwd: '비밀번호를 바꾸고 로그인을 모두 끊었습니다', disable: '막고 로그인을 끊었습니다', enable: '다시 쓸 수 있게 했습니다', unlock: '잠금을 풀었습니다' };
  console.info(`${name}: ${done[cmd]}.`);
}

main(process.argv.slice(2))
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
