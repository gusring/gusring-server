// PNG 머리(IHDR)에서 크기를 읽는다. 그림을 풀어 보지는 않는다 (새 의존성 없음).
// 서명·IHDR·끝(IEND)이 맞지 않으면 null — 다른 형식이거나 중간에 잘린 파일.

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IEND = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
export const PNG_MAX_SIDE = 20000;

export function readPngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 8 + 25 + IEND.length) return null;
  if (!buf.subarray(0, 8).equals(SIGNATURE)) return null;
  // 첫 덩어리는 IHDR(길이 13): 길이 4 + 'IHDR' 4 + 너비 4 + 높이 4 …
  if (buf.readUInt32BE(8) !== 13 || buf.toString('latin1', 12, 16) !== 'IHDR') return null;
  if (!buf.subarray(buf.length - IEND.length).equals(IEND)) return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width < 1 || height < 1 || width > PNG_MAX_SIDE || height > PNG_MAX_SIDE) return null;
  return { width, height };
}
