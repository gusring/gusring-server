// 서식 정의 내용 검사 (공개 전에 돌린다).
// 원본은 gusring-web-v2 scripts/check-forms.mjs (앞으로 src/forms/validate.ts로 옮긴다). 규칙을 바꾸면 양쪽을 같이 바꾼다.
// 원본과 다른 점: 이미지는 파일 대신 DB(form_image) 크기와 비교, 쪽·칸이 하나도 없으면 문제로 본다,
// 목록 key·formNo 중복은 DB unique가 막는다.
// 모양 검사(zod formDefinition)를 통과한 값만 넣는다. DB 없이 도는 순수 함수다.

import { LANGS } from '../../constants/enums.js';
import { fieldIdSchema } from '../../utils/common-schema.js';
import type { FieldDef, FormDefinition, InputSpec } from './form.schema.js';

export interface Problem {
  /** 정의 안의 위치 (예: fields[3].label.en) — 관리자 화면이 해당 칸을 표시할 때 쓴다 */
  path: string;
  message: string;
}

export type ImageSizes = ReadonlyMap<string, { width: number; height: number }>;

type Box = { x: number; y: number; w: number; h: number };
type L = Record<(typeof LANGS)[number], string>;

const inside = (b: Box, pg: { width: number; height: number }) =>
  b.x >= 0 && b.y >= 0 && b.w > 0 && b.h > 0 && b.x + b.w <= pg.width && b.y + b.h <= pg.height;

/** 입력값을 써 넣는 상자들 (경로와 함께) */
function valueBoxes(input: InputSpec): [string, Box][] {
  switch (input.kind) {
    case 'text':
      return input.parts.map((p, i) => [`input.parts[${i}].box`, p.box]);
    case 'date':
      return input.box ? [['input.box', input.box]] : Object.entries(input.boxes ?? {}).map(([k, b]) => [`input.boxes.${k}`, b]);
    case 'datetime':
      return Object.entries(input.boxes).map(([k, b]) => [`input.boxes.${k}`, b]);
    case 'choice':
      return input.extra ? [['input.extra.box', input.extra.box]] : [];
    case 'country':
      return [['input.box', input.box]];
    case 'idnum':
      return input.box ? [['input.box', input.box]] : [['input.front', input.front!], ['input.back', input.back!]];
  }
}

export function validateDefinition(def: FormDefinition, imageSizes: ImageSizes): Problem[] {
  const problems: Problem[] = [];
  const problem = (path: string, message: string) => problems.push({ path, message });

  /** 5개 국어가 모두 비어 있지 않은지 */
  const checkL = (path: string, what: string, l: L | undefined) => {
    if (!l) return problem(path, `${what} 없음`);
    for (const lang of LANGS) if (!l[lang]?.trim()) problem(`${path}.${lang}`, `${what} ${lang} 비어 있음`);
  };

  checkL('title', '제목', def.title);
  checkL('desc', '설명', def.desc);

  if (def.pages.length === 0) problem('pages', '쪽이 없음 (이미지를 한 장 이상 올려 주세요)');
  def.pages.forEach((pg, i) => {
    const size = imageSizes.get(pg.imageId);
    if (!size) problem(`pages[${i}].imageId`, `${i + 1}쪽 이미지 없음 (${pg.imageId})`);
    else if (size.width !== pg.width || size.height !== pg.height) {
      problem(`pages[${i}]`, `${i + 1}쪽 크기 ${pg.width}×${pg.height} ↔ 실제 이미지 ${size.width}×${size.height}`);
    }
  });

  const sections = new Set(def.sections.map((s) => s.id));
  def.sections.forEach((s, i) => checkL(`sections[${i}].label`, `섹션 ${s.id} 이름`, s.label));

  if (def.fields.length === 0) problem('fields', '칸이 없음');
  const ids = new Set(def.fields.map((f) => f.id));
  const seen = new Set<string>();
  let lastPage = 1;

  def.fields.forEach((f: FieldDef, i) => {
    const at = `fields[${i}]`;
    const name = `칸 ${f.id}`;
    if (seen.has(f.id)) problem(`${at}.id`, `${name}: id 중복`);
    seen.add(f.id);
    if (!fieldIdSchema.safeParse(f.id).success) problem(`${at}.id`, `${name}: id는 영문으로 시작하는 1~64자 (영문·숫자·_·-)`);
    if (!sections.has(f.section)) problem(`${at}.section`, `${name}: 없는 섹션 ${f.section}`);
    if (!f.koLabel?.trim()) problem(`${at}.koLabel`, `${name}: koLabel 없음`);
    checkL(`${at}.label`, `${name} label`, f.label);
    checkL(`${at}.help`, `${name} help`, f.help);

    const page = f.page ?? 1;
    if (page < lastPage) problem(`${at}.page`, `${name}: ${page}쪽 칸이 ${lastPage}쪽 칸 뒤에 있음 (번호 순서)`);
    lastPage = page;
    const pg = def.pages[page - 1];
    if (!pg) {
      problem(`${at}.page`, `${name}: 없는 쪽 ${page}`);
      return;
    }
    if (!inside(f.area, pg)) problem(`${at}.area`, `${name}: area가 쪽 밖으로 나감`);
    for (const [path, b] of valueBoxes(f.input)) if (!inside(b, pg)) problem(`${at}.${path}`, `${name}: 값 상자가 쪽 밖으로 나감`);

    const input = f.input;
    if (input.kind === 'text') {
      input.parts.forEach((p, j) => p.label && checkL(`${at}.input.parts[${j}].label`, `${name} ${p.key} 라벨`, p.label));
      if (new Set(input.parts.map((p) => p.key)).size !== input.parts.length) problem(`${at}.input.parts`, `${name}: 입력칸 key 중복`);
    }
    if (input.kind === 'choice') {
      const values = input.options.map((o) => o.value);
      if (new Set(values).size !== values.length) problem(`${at}.input.options`, `${name}: 선택지 value 중복`);
      if (input.multiple && values.some((v) => v.includes(','))) problem(`${at}.input.options`, `${name}: 여러 개 고르기 선택지 value에 쉼표`);
      input.options.forEach((o, j) => {
        const op = `${at}.input.options[${j}]`;
        checkL(`${op}.label`, `${name} 선택지 ${o.value}`, o.label);
        if (!o.ko?.trim()) problem(`${op}.ko`, `${name}: 선택지 ${o.value} ko 없음`);
        if (o.mark.x < 0 || o.mark.y < 0 || o.mark.x > pg.width || o.mark.y > pg.height) {
          problem(`${op}.mark`, `${name}: 선택지 ${o.value} 표시 위치가 쪽 밖`);
        }
      });
      for (const w of input.extra?.when ?? []) if (!values.includes(w)) problem(`${at}.input.extra.when`, `${name}: extra.when의 ${w}가 선택지에 없음`);
    }
    (f.copyFrom ?? []).forEach((src, j) => {
      if (!ids.has(src.field)) problem(`${at}.copyFrom[${j}].field`, `${name}: copyFrom ${src.field} 칸 없음`);
      checkL(`${at}.copyFrom[${j}].label`, `${name} copyFrom ${src.field} 버튼`, src.label);
    });
  });

  for (const id of Object.keys(def.preset ?? {})) if (!ids.has(id)) problem(`preset.${id}`, `preset의 ${id} 칸 없음`);

  return problems;
}
