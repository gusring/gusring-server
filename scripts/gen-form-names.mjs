// gusring-web의 서식 번호 → 한국어 이름 표를 관리자 화면용으로 뽑는다.
// 사용: node scripts/gen-form-names.mjs ../gusring-web/src/features/forms/data/forms.ts
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(process.argv[2], 'utf8');
const names = {};
for (const m of src.matchAll(/\bid:\s*(\d+),[\s\S]*?title:\s*\{\s*ko:\s*'([^']+)'/g)) names[m[1]] = m[2];
const count = Object.keys(names).length;
if (count === 0) throw new Error('서식을 하나도 찾지 못했습니다');
writeFileSync(new URL('../public/admin/form-names.json', import.meta.url), JSON.stringify(names, null, 1) + '\n');
console.log(`${count}개 서식`);
