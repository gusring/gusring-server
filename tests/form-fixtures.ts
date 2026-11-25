import { createHash, randomBytes } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';
import type { FormDefinition } from '../src/domains/form/form.schema.js';

/** 테스트용 PNG (흑백 width×height). seed가 다르면 내용(=id)도 다르다 */
export function makePng(width: number, height: number, seed = 0): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 비트 깊이
  ihdr[9] = 0; // 흑백
  const row = Buffer.alloc(width + 1);
  row[1] = seed % 256;
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
export const randomPngLike = (n: number) => Buffer.concat([makePng(10, 10).subarray(0, 33), randomBytes(n)]);

export const L = (s: string) => ({ ko: `${s} ko`, en: `${s} en`, zh: `${s} zh`, ja: `${s} ja`, vi: `${s} vi` });

/** 검사를 통과하는 서식 정의 (쪽 1장 200×300) */
export function validDefinition(imageId: string): FormDefinition {
  return {
    title: L('출생신고서'),
    desc: L('아이가 태어났을 때'),
    category: 'FAMILY',
    preset: { child: { family: '' } },
    pages: [{ imageId, width: 200, height: 300 }],
    sections: [{ id: 'child', label: L('아이') }],
    fields: [
      {
        id: 'child',
        section: 'child',
        required: true,
        koLabel: '성명',
        label: L('이름'),
        help: L('도움말'),
        area: { x: 10, y: 10, w: 100, h: 20 },
        input: { kind: 'text', parts: [{ key: 'family', box: { x: 10, y: 10, w: 50, h: 20 }, hangul: true }] },
      },
      {
        id: 'sex',
        section: 'child',
        koLabel: '성별',
        label: L('성별'),
        help: L('도움말'),
        area: { x: 10, y: 40, w: 100, h: 20 },
        input: {
          kind: 'choice',
          mark: 'circle',
          options: [
            { value: '1', label: L('남'), ko: '남', mark: { x: 20, y: 50 } },
            { value: '2', label: L('여'), ko: '여', mark: { x: 60, y: 50 } },
          ],
          extra: { key: 'note', box: { x: 120, y: 40, w: 50, h: 20 }, when: ['2'] },
        },
        copyFrom: [{ field: 'child', label: L('복사'), map: { family: 'note' } }],
      },
      {
        id: 'birth',
        section: 'child',
        koLabel: '출생일',
        label: L('출생일'),
        help: L('도움말'),
        area: { x: 10, y: 70, w: 150, h: 20 },
        input: { kind: 'date', boxes: { y: { x: 10, y: 70, w: 40, h: 20 }, m: { x: 60, y: 70, w: 20, h: 20 }, d: { x: 90, y: 70, w: 20, h: 20 } } },
      },
    ],
  };
}
