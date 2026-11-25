import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// 관리자 비밀번호 해시. Node 내장 scrypt (새 패키지 없음).
// 저장 형식: scrypt$N$r$p$salt(base64url)$hash(base64url) — 값을 바꿔도 예전 해시를 그대로 확인할 수 있다.
// N=2^15는 한 번에 32MB를 쓴다. 앱 메모리 한도 256MB, 로그인은 Nginx에서 분당 10번으로 막는다.

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LEN = 32;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

function derive(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LEN, { ...opts, maxmem: 128 * opts.N! * opts.r! * 2 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await derive(password, Buffer.from(salt, 'base64url'), { N: Number(n), r: Number(r), p: Number(p) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** 없는 아이디일 때도 같은 시간이 걸리게 비교할 가짜 해시 (처음 쓸 때 한 번 만든다) */
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(16).toString('hex')));
