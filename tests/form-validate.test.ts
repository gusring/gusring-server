import { describe, expect, it } from 'vitest';
import { validateDefinition, type Problem } from '../src/domains/form/form-validate.js';
import { formDefinition, type FormDefinition } from '../src/domains/form/form.schema.js';
import { L, validDefinition } from './form-fixtures.js';

// 순수 함수라 DB 없이 돈다. 원본은 gusring-web-v2 src/forms/validate.ts — 여기서는 복사본이 서버에서도 같은 결과를 내는지 본다
const IMG = 'a'.repeat(64);
const size = (id: string) => (id === IMG ? { width: 200, height: 300 } : undefined);
const check = (def: FormDefinition): Problem[] => validateDefinition(def, size);
const base = () => structuredClone(validDefinition(IMG));

describe('validateDefinition', () => {
  it('테스트용 정의는 모양 검사·내용 검사 모두 통과', () => {
    expect(formDefinition.safeParse(base()).success).toBe(true);
    expect(check(base())).toEqual([]);
  });

  it('5개 국어 중 빈 것은 칸 id와 함께 (서식 전체 문제는 fieldId 없음)', () => {
    const d = base();
    d.title.vi = '';
    d.sections[0]!.label.ja = '';
    d.fields[0]!.label.en = '';
    const choice = d.fields[1]!.input;
    if (choice.kind !== 'choice') throw new Error();
    choice.options[1]!.ko = '';
    d.fields[1]!.copyFrom![0]!.label.en = '';
    expect(check(d)).toEqual([
      { message: '제목 vi 비어 있음' },
      { message: '섹션 child 이름 ja 비어 있음' },
      { fieldId: 'child', message: '라벨 en 비어 있음' },
      { fieldId: 'sex', message: '선택지 2의 한국어(ko) 없음' },
      { fieldId: 'sex', message: '가져오기 child 버튼 en 비어 있음' },
    ]);
  });

  it('칸 id 중복·형식, 없는 섹션, 쪽 크기 다름, 좌표가 쪽 밖, 참조가 없는 칸', () => {
    const d = base();
    d.pages[0]!.width = 201;
    d.fields[1]!.id = 'child';
    d.fields[2]!.id = 'has space';
    d.fields[2]!.section = 'nope';
    d.fields[0]!.area = { x: 150, y: 0, w: 100, h: 10 };
    d.preset = { ghost: {} };
    const messages = check(d).map((p) => p.message);
    expect(messages).toEqual(expect.arrayContaining([
      '1쪽 크기 201×300 ↔ 실제 이미지 200×300',
      '칸 id 중복',
      '칸 id는 영문자로 시작하는 영문·숫자·_·- 64자 이내',
      '없는 섹션 nope',
      '칸 영역이 쪽 밖으로 나감',
      '미리 골라 둘 값의 칸 ghost 없음',
    ]));
  });

  it('비어 있는 초안(쪽·칸 없음)은 공개 불가', () => {
    const d = base();
    d.pages = [];
    d.fields = [];
    expect(check(d).map((p) => p.message)).toEqual(expect.arrayContaining(['쪽(원본 이미지)이 없음', '칸이 없음']));
  });
});

describe('formDefinition (모양)', () => {
  it('date·idnum은 둘 중 한 가지 형태만, 빈 선택지·입력칸 목록은 초안으로 저장 가능', () => {
    const d = base();
    const box = { x: 1, y: 1, w: 1, h: 1 };
    d.fields[2]!.input = { kind: 'date', box, boxes: { y: box, m: box, d: box } } as never;
    expect(formDefinition.safeParse(d).success).toBe(false);
    d.fields[2]!.input = { kind: 'idnum', front: box } as never;
    expect(formDefinition.safeParse(d).success).toBe(false);
    d.fields[2]!.input = { kind: 'idnum', front: box, back: box };
    expect(formDefinition.safeParse(d).success).toBe(true);
    d.fields[2]!.input = { kind: 'choice', mark: 'check', options: [] };
    expect(formDefinition.safeParse(d).success).toBe(true);
    d.fields[2]!.input = { kind: 'text', parts: [] };
    expect(formDefinition.safeParse(d).success).toBe(true);
  });

  it('모르는 칸(최상위 id 포함)은 거부', () => {
    expect(formDefinition.safeParse({ ...base(), id: 'birth-report' }).success).toBe(false);
    expect(formDefinition.safeParse({ ...base(), title: { ...L('x'), fr: 'x' } }).success).toBe(false);
  });
});
