// ─────────────────────────────────────────────────────────────
// 서식 정의 검사 — 게시하기 전에 좌표·번역·참조 실수를 잡는다.
// 원본은 gusring-web-v2 src/forms/validate.ts (feat/admin-forms). 이 파일은 그 복사본이다 — 규칙을 고치면 양쪽을 같이 고친다.
// 바꾼 것은 이 머리 주석과 import 경로뿐 (브라우저·Node 어디서나 도는 순수 함수, import는 types만).
// ─────────────────────────────────────────────────────────────

import type { Box, FormDefinition, InputSpec, L } from './form.types.js';

export interface Problem {
  /** 문제가 있는 칸 (없으면 서식 전체) — 관리 화면에서 누르면 그 칸으로 간다 */
  fieldId?: string;
  message: string;
}

const LANGS = ['ko', 'en', 'zh', 'ja', 'vi'] as const;
/** 서버 fieldIdSchema와 같다 (이용 기록 fieldId) */
export const FIELD_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
/** 서버 formKeySchema와 같다 (주소·저장 이름·이용 기록 formKey) */
export const FORM_KEY = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** 입력값을 써 넣는 상자들 */
export function valueBoxes(input: InputSpec): Box[] {
  switch (input.kind) {
    case 'text': return input.parts.map((p) => p.box);
    case 'date': return input.box ? [input.box] : [input.boxes.y, input.boxes.m, input.boxes.d];
    case 'datetime': return Object.values(input.boxes);
    case 'choice': return input.extra ? [input.extra.box] : [];
    case 'country': return [input.box];
    case 'idnum': return input.box ? [input.box] : [input.front, input.back];
  }
}

const inside = (b: Box, pg: { width: number; height: number }) =>
  b.x >= 0 && b.y >= 0 && b.w > 0 && b.h > 0 && b.x + b.w <= pg.width && b.y + b.h <= pg.height;

/**
 * imageSize: 올려 둔 이미지의 실제 크기 (모르면 undefined → 크기 비교를 건너뜀)
 */
export function validateDefinition(
  def: FormDefinition,
  imageSize: (imageId: string) => { width: number; height: number } | undefined = () => undefined,
): Problem[] {
  const out: Problem[] = [];
  const add = (message: string, fieldId?: string) => out.push(fieldId ? { fieldId, message } : { message });
  const checkL = (what: string, l: L | undefined, fieldId?: string) => {
    if (!l) return add(`${what} 없음`, fieldId);
    for (const lang of LANGS) if (!l[lang]?.trim()) add(`${what} ${lang} 비어 있음`, fieldId);
  };

  checkL('제목', def.title);
  checkL('설명', def.desc);
  if (def.pages.length === 0) add('쪽(원본 이미지)이 없음');
  def.pages.forEach((pg, i) => {
    const real = imageSize(pg.imageId);
    if (real && (real.width !== pg.width || real.height !== pg.height)) {
      add(`${i + 1}쪽 크기 ${pg.width}×${pg.height} ↔ 실제 이미지 ${real.width}×${real.height}`);
    }
  });

  const sections = new Set<string>();
  for (const s of def.sections) {
    if (sections.has(s.id)) add(`섹션 id ${s.id} 중복`);
    sections.add(s.id);
    checkL(`섹션 ${s.id} 이름`, s.label);
  }
  if (def.fields.length === 0) add('칸이 없음');

  const ids = new Set(def.fields.map((f) => f.id));
  const seen = new Set<string>();
  let lastPage = 1;

  for (const f of def.fields) {
    const id = f.id;
    if (seen.has(id)) add('칸 id 중복', id);
    seen.add(id);
    if (!FIELD_ID.test(id)) add('칸 id는 영문자로 시작하는 영문·숫자·_·- 64자 이내', id);
    if (!sections.has(f.section)) add(`없는 섹션 ${f.section}`, id);
    if (!f.koLabel?.trim()) add('한국어 칸 이름(koLabel) 없음', id);
    checkL('라벨', f.label, id);
    checkL('안내', f.help, id);

    const page = f.page ?? 1;
    if (page < lastPage) add(`${page}쪽 칸이 ${lastPage}쪽 칸 뒤에 있음 (번호 순서)`, id);
    lastPage = Math.max(lastPage, page);
    const pg = def.pages[page - 1];
    if (!pg) {
      add(`없는 쪽 ${page}`, id);
      continue;
    }
    if (!inside(f.area, pg)) add('칸 영역이 쪽 밖으로 나감', id);
    if (valueBoxes(f.input).some((b) => !inside(b, pg))) add('값 상자가 쪽 밖으로 나감', id);
    if (f.badgeAt && (f.badgeAt.x < 0 || f.badgeAt.y < 0 || f.badgeAt.x > pg.width || f.badgeAt.y > pg.height)) add('번호 위치가 쪽 밖', id);

    const input = f.input;
    if (input.kind === 'text') {
      if (input.parts.length === 0) add('입력칸이 없음', id);
      input.parts.forEach((p) => p.label && checkL(`${p.key} 라벨`, p.label, id));
      if (new Set(input.parts.map((p) => p.key)).size !== input.parts.length) add('입력칸 key 중복', id);
    }
    if (input.kind === 'choice') {
      const values = input.options.map((o) => o.value);
      if (values.length === 0) add('선택지가 없음', id);
      if (new Set(values).size !== values.length) add('선택지 value 중복', id);
      if (input.multiple && values.some((v) => v.includes(','))) add('여러 개 고르기 선택지 value에 쉼표', id);
      for (const o of input.options) {
        checkL(`선택지 ${o.value}`, o.label, id);
        if (!o.ko?.trim()) add(`선택지 ${o.value}의 한국어(ko) 없음`, id);
        if (o.mark.x < 0 || o.mark.y < 0 || o.mark.x > pg.width || o.mark.y > pg.height) add(`선택지 ${o.value} 표시 위치가 쪽 밖`, id);
      }
      if (input.extra?.label) checkL('추가 입력칸 라벨', input.extra.label, id);
      for (const w of input.extra?.when ?? []) if (!values.includes(w)) add(`추가 입력칸 조건 ${w}가 선택지에 없음`, id);
    }
    for (const src of f.copyFrom ?? []) {
      if (!ids.has(src.field)) add(`가져오기 대상 칸 ${src.field} 없음`, id);
      checkL(`가져오기 ${src.field} 버튼`, src.label, id);
    }
  }

  for (const id of Object.keys(def.preset ?? {})) if (!ids.has(id)) add(`미리 골라 둘 값의 칸 ${id} 없음`);
  return out;
}

/** 목록 전체 검사 — key·formNo 중복과 형식 */
export function validateCatalog(items: { key: string; formNo: number }[]): Problem[] {
  const out: Problem[] = [];
  const keys = new Set<string>();
  const nos = new Map<number, string>();
  for (const { key, formNo } of items) {
    if (!FORM_KEY.test(key)) out.push({ message: `${key}: 주소 이름은 영어 소문자·숫자·- (kebab-case)` });
    if (keys.has(key)) out.push({ message: `${key}: 주소 이름 중복` });
    keys.add(key);
    if (!Number.isInteger(formNo) || formNo < 1 || formNo > 999) out.push({ message: `${key}: 서식 번호는 1~999` });
    if (nos.has(formNo)) out.push({ message: `${key}: 서식 번호 ${formNo}가 ${nos.get(formNo)}와 중복` });
    nos.set(formNo, key);
  }
  return out;
}
