import { createHmac } from 'node:crypto';
import { required } from '../config/env.js';

// 원래 IP는 저장하지 않는다. 서버 비밀값을 섞은 HMAC-SHA256 (64자 hex)만 남겨
// "같은 사람이 몇 번 보냈는지"만 셀 수 있게 한다.
export function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return createHmac('sha256', required('ipHashSecret')).update(ip).digest('hex');
}
