import { describe, expect, it } from 'vitest';
import { validateDefinition } from '../src/domains/form/form-validate.js';
import { formDefinition, type FormDefinition } from '../src/domains/form/form.schema.js';
import { L, validDefinition } from './form-fixtures.js';

// 순수 함수라 DB 없이 돈다. 규칙의 원본은 gusring-web-v2 scripts/check-forms.mjs
const IMG = 'a'.repeat(64);
const sizes = new Map([[IMG, { width: 200, height: 300 }]]);
const paths = (def: FormDefinition) => validateDefinition(def, sizes).map((p) => p.path);
const base = () => structuredClone(validDefinition(IMG));

describe('validateDefinition', () => {
  it('테스트용 정의는 모양 검사·내용 검사 모두 통과', () => {
    expect(formDefinition.safeParse(base()).success).toBe(true);
    expect(validateDefinition(base(), sizes)).toEqual([]);
  });

  it('5개 국어 중 빈 것: 제목·설명·섹션·label·help·선택지·copyFrom 버튼·입력칸 라벨', () => {
    const d = base();
    d.title.vi = '';
    d.desc.zh = '  ';
    d.sections[0]!.label.ja = '';
    d.fields[0]!.label.en = '';
    d.fields[0]!.help.ko = '';
    const choice = d.fields[1]!.input;
    if (choice.kind !== 'choice') throw new Error();
    choice.options[0]!.label.vi = '';
    choice.options[1]!.ko = '';
    d.fields[1]!.copyFrom![0]!.label.en = '';
    const text = d.fields[0]!.input;
    if (text.kind !== 'text') throw new Error();
    text.parts[0]!.label = { ...L('성'), zh: '' };
    expect(paths(d)).toEqual([
      'title.vi', 'desc.zh', 'sections[0].label.ja', 'fields[0].label.en', 'fields[0].help.ko',
      'fields[0].input.parts[0].label.zh', 'fields[1].input.options[0].label.vi', 'fields[1].input.options[1].ko',
      'fields[1].copyFrom[0].label.en',
    ]);
  });

  it('칸 id 중복·형식, 없는 섹션, koLabel 없음', () => {
    const d = base();
    d.fields[1]!.id = 'child';
    d.fields[2]!.id = 'has space';
    d.fields[2]!.section = 'nope';
    d.fields[2]!.koLabel = '';
    expect(paths(d)).toEqual(expect.arrayContaining(['fields[1].id', 'fields[2].id', 'fields[2].section', 'fields[2].koLabel']));
  });

  it('쪽: 없음·크기 다름·이미지 없음, 칸의 쪽 순서·없는 쪽', () => {
    expect(paths({ ...base(), pages: [] })).toContain('pages');
    expect(paths({ ...base(), pages: [{ imageId: IMG, width: 100, height: 300 }] })).toContain('pages[0]');
    expect(paths({ ...base(), pages: [{ imageId: 'b'.repeat(64), width: 200, height: 300 }] })).toContain('pages[0].imageId');

    const d = base();
    d.pages.push({ imageId: IMG, width: 200, height: 300 });
    d.fields[0]!.page = 2;
    d.fields[2]!.page = 3;
    expect(paths(d)).toEqual(['fields[1].page', 'fields[2].page']);
  });

  it('area·값 상자·선택 표시가 쪽 밖, 0 크기 상자', () => {
    const d = base();
    d.fields[0]!.area = { x: 150, y: 0, w: 51, h: 10 };
    const t = d.fields[0]!.input;
    if (t.kind !== 'text') throw new Error();
    t.parts[0]!.box.w = 0;
    const c = d.fields[1]!.input;
    if (c.kind !== 'choice') throw new Error();
    c.options[0]!.mark = { x: 201, y: 10 };
    c.extra!.box.y = 290;
    const dt = d.fields[2]!.input;
    if (dt.kind !== 'date' || !dt.boxes) throw new Error();
    dt.boxes.m.x = -1;
    expect(paths(d)).toEqual([
      'fields[0].area', 'fields[0].input.parts[0].box', 'fields[1].input.extra.box',
      'fields[1].input.options[0].mark', 'fields[2].input.boxes.m',
    ]);
  });

  it('선택지 value 중복·여러 개 고르기에 쉼표·extra.when, copyFrom·preset이 없는 칸, 입력칸 key 중복', () => {
    const d = base();
    const c = d.fields[1]!.input;
    if (c.kind !== 'choice') throw new Error();
    c.multiple = true;
    c.options[1]!.value = '1';
    c.options.push({ value: 'a,b', label: L('x'), ko: 'x', mark: { x: 1, y: 1 } });
    c.extra!.when = ['9'];
    d.fields[1]!.copyFrom![0]!.field = 'ghost';
    d.preset = { ghost: {} };
    const t = d.fields[0]!.input;
    if (t.kind !== 'text') throw new Error();
    t.parts.push({ ...t.parts[0]! });
    expect(validateDefinition(d, sizes).map((p) => p.message)).toEqual([
      '칸 child: 입력칸 key 중복',
      '칸 sex: 선택지 value 중복',
      '칸 sex: 여러 개 고르기 선택지 value에 쉼표',
      '칸 sex: extra.when의 9가 선택지에 없음',
      '칸 sex: copyFrom ghost 칸 없음',
      'preset의 ghost 칸 없음',
    ]);
  });
});

describe('formDefinition (모양)', () => {
  it('date·idnum은 둘 중 한 가지 형태만', () => {
    const d = base();
    const box = { x: 1, y: 1, w: 1, h: 1 };
    d.fields[2]!.input = { kind: 'date', box, boxes: { y: box, m: box, d: box } } as never;
    expect(formDefinition.safeParse(d).success).toBe(false);
    d.fields[2]!.input = { kind: 'idnum', front: box } as never;
    expect(formDefinition.safeParse(d).success).toBe(false);
    d.fields[2]!.input = { kind: 'idnum', front: box, back: box };
    expect(formDefinition.safeParse(d).success).toBe(true);
    d.fields[2]!.input = { kind: 'country', box, allowKorea: 'name' };
    expect(formDefinition.safeParse(d).success).toBe(true);
  });
});
