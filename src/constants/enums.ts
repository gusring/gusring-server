// DB enum과 같은 값. 바꾸면 prisma/schema.prisma도 같이 바꾼다.

export const LANGS = ['ko', 'en', 'zh', 'ja', 'vi'] as const;
export type Lang = (typeof LANGS)[number];

export const FEEDBACK_TYPES = ['general', 'translation', 'guide', 'bug'] as const;
export const FEEDBACK_STATUSES = ['new', 'read', 'resolved'] as const;

export const EVENT_TYPES = [
  // gusring-web (GA4와 같은 종류)
  'landing_view', 'list_view', 'form_view', 'form_download', 'language_select',
  'search', 'category_filter', 'feedback_click', 'detail_time',
  // 서식 작성 도우미
  'fill_start', 'field_open', 'fill_preview', 'fill_png_save', 'fill_print', 'fill_reset',
] as const;

/** 서식(formKey 또는 formNo)이 꼭 있어야 하는 이벤트 */
export const EVENTS_NEEDING_FORM: ReadonlySet<string> = new Set([
  'form_view', 'form_download', 'detail_time',
  'fill_start', 'field_open', 'fill_preview', 'fill_png_save', 'fill_print', 'fill_reset',
]);
