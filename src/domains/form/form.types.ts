// 서식 정의 TS 타입 — gusring-web-v2 src/forms/types.ts(feat/admin-forms)에서 서버에 필요한 부분만 그대로 옮겼다.
// 검증은 form.schema.ts(zod)가 하고, 이 타입은 form-validate.ts(web-v2 validate.ts 복사본)가 쓴다. 바꾸면 양쪽을 같이 바꾼다.

// ─────────────────────────────────────────────────────────────
// 서식 정의 타입
// 좌표(Box, Point)는 모두 원본 서식 이미지의 픽셀 단위다.
// ─────────────────────────────────────────────────────────────

export type Lang = 'ko' | 'en' | 'zh' | 'ja' | 'vi';

/** 다국어 문자열 */
export type L = Record<Lang, string>;

export type Align = 'left' | 'center' | 'right';

/** 서식 위 사각형 영역 (값을 써 넣을 자리) */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  align?: Align;
}

export interface Point {
  x: number;
  y: number;
}

/** 텍스트 입력 한 칸 */
export interface Part {
  key: string;
  box: Box;
  label?: L;
  placeholder?: string;
  /** 한글로만 써야 하는 칸 (이름 등) */
  hangul?: boolean;
  /** 한국어로 써야 하는 칸 (주소 등) — 한글이 하나도 없으면 경고 */
  korean?: boolean;
  inputMode?: 'text' | 'tel' | 'email' | 'numeric';
  /** 있으면 셀렉트로 입력. value가 서식에 그대로 들어간다(한국어). */
  options?: { value: string; label: L }[];
}

export interface ChoiceOption {
  value: string;
  label: L;
  /** 서식에 표시되는 한국어 (요약/미리보기용) */
  ko: string;
  /** ○ 또는 ✓를 그릴 위치 */
  mark: Point;
}

export type InputSpec =
  | { kind: 'text'; parts: Part[] }
  /**
   * boxes: 서식에 「년 월 일」이 인쇄된 칸 — 숫자만 각 자리에
   * box: 「년 월 일」이 없는 빈 칸 — 「1990년 1월 1일」로 한 줄에
   */
  | { kind: 'date'; boxes: { y: Box; m: Box; d: Box }; box?: undefined }
  | { kind: 'date'; box: Box; boxes?: undefined }
  | { kind: 'datetime'; boxes: { y: Box; m: Box; d: Box; h: Box; min: Box } }
  | {
      kind: 'choice';
      /** circle: 번호에 영표(○), check: □에 ✓ */
      mark: 'circle' | 'check';
      /** 여러 개를 고를 수 있음 (값은 쉼표로 이어 저장: 'a,b') */
      multiple?: boolean;
      options: ChoiceOption[];
      /** 추가 입력칸. when이 있으면 해당 선택일 때만 보인다. */
      extra?: Part & { when?: string[] };
    }
  /**
   * allowKorea: true — 한국을 고르면 등록기준지 주소를 받는다 (등록기준지 칸)
   * allowKorea: 'name' — 한국을 고르면 「대한민국」으로 쓴다 (국적 칸)
   */
  | { kind: 'country'; box: Box; allowKorea?: boolean | 'name' }
  /**
   * front·back: 가운데 「-」이 인쇄된 칸
   * box: 「-」이 없는 칸 — 「901231-1234567」로 한 줄에
   */
  | { kind: 'idnum'; front: Box; back: Box; box?: undefined }
  | { kind: 'idnum'; box: Box; front?: undefined; back?: undefined };

/** 다른 항목 값을 복사해 오는 단축 버튼 */
export interface CopySource {
  field: string;
  label: L;
  /** 원본 key → 대상 key */
  map: Record<string, string>;
}

export interface FieldDef {
  id: string;
  section: string;
  required?: boolean;
  /** 원본 한국어 서식의 칸 이름 */
  koLabel: string;
  label: L;
  help: L;
  /** 서식 위에서 탭할 수 있는 영역 */
  area: Box;
  input: InputSpec;
  copyFrom?: CopySource[];
  /** 'margin': 번호 토글을 칸 안이 아닌 표 오른쪽 여백에 표시 */
  badge?: 'margin';
  /** 번호 토글 위치를 직접 지정 (칸이 좁아 왼쪽 위에 두면 선택지를 가릴 때) */
  badgeAt?: Point;
  /** 이 칸이 있는 쪽 (1부터, 없으면 1쪽). 좌표는 그 쪽 이미지 기준 */
  page?: number;
}

// ─────────────────────────────────────────────────────────────
// 서버에 저장하는 서식 정의 (관리 화면에서 편집, gusring-server form.draft / form_version.definition)
// 화면에서 쓰는 FormDef와 같은 칸(fields)을 쓰고, 목록 정보(설명·분류·미리 골라 둘 값)를 같이 담는다.
// ─────────────────────────────────────────────────────────────

export type CategoryKey = 'FAMILY' | 'CERT' | 'RESIDENCE' | 'ID_SEAL' | 'VEHICLE';
export const CATEGORY_KEYS: CategoryKey[] = ['FAMILY', 'CERT', 'RESIDENCE', 'ID_SEAL', 'VEHICLE'];

export interface DefinitionPage {
  /** 서버 form_image id (PNG 내용의 SHA-256) */
  imageId: string;
  width: number;
  height: number;
  marginX?: number;
}

export interface FormDefinition {
  title: L;
  desc: L;
  category: CategoryKey;
  /** 처음 열 때 미리 채워 둘 값 */
  preset?: Values;
  pages: DefinitionPage[];
  sections: { id: string; label: L }[];
  fields: FieldDef[];
}

/** 항목 하나의 입력값. key는 InputSpec 종류별로 다르다. */
export type FieldValue = Record<string, string>;
export type Values = Record<string, FieldValue>;
