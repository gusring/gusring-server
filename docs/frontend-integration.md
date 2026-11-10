# 프론트(gusring-web) 연결

`examples/gusring-api.ts`를 gusring-web의 `src/shared/gusring-api.ts`로 복사하고, GA4를 보내는 `src/shared/analytics.ts` 함수마다 한 줄씩 더한다.
GA4는 그대로 두고 같이 보낸다. 화면 코드(App.tsx 등)는 바꾸지 않아도 된다.

이 모듈은 서버 테스트(`tests/frontend-client.test.ts`)가 실제 서버에 붙여 확인한다.
2026-11-03에는 실제 브라우저에서도 확인했다: 다른 출처(5173 → 4100)에서 보내기, 피드백, 페이지를 떠날 때 sendBeacon.
TypeScript 4.9(gusring-web과 같은 버전, target es5)에서도 타입 검사를 통과한다.

## 1. 시작할 때 한 번

```ts
// src/index.tsx
import { configureGusringApi, startAutoFlush } from './shared/gusring-api';

// 로컬 서버에 붙일 때만. 없으면 https://api.gusring.kro.kr
if (process.env.REACT_APP_GUSRING_API) configureGusringApi({ baseUrl: process.env.REACT_APP_GUSRING_API });
startAutoFlush(); // 탭을 숨기거나 떠날 때 남은 기록을 보낸다
```

## 2. analytics.ts에 한 줄씩

| analytics.ts 함수 | 더할 줄 |
| --- | --- |
| `trackLandingView()` | `track({ type: 'landing_view' })` |
| `trackListView(lang)` | `track({ type: 'list_view', lang })` |
| `trackDetailView(p)` | `track({ type: 'form_view', lang: p.lang, formNo: p.formId, category: p.category })` |
| `trackLanguageSelect(lang)` | `track({ type: 'language_select', lang })` |
| `trackFormDownload(p)` | `track({ type: 'form_download', lang: p.lang, formNo: p.formId, category: p.category })` |
| `trackSearch(p)` | `track({ type: 'search', lang: p.lang, searchTerm: p.term, resultCount: p.resultCount })` |
| `trackCategoryFilter(category, lang)` | `track({ type: 'category_filter', lang, category })` |
| `trackFeedbackClick(lang)` | `track({ type: 'feedback_click', lang })` |
| `trackTimeOnDetail(p)` | `track({ type: 'detail_time', lang: p.lang, formNo: p.formId, durationSec: p.durationSec })` |

`lang`은 gusring-web의 언어 id(`ko` `en` `zh` `ja` `vi`)를 그대로 쓴다. 타입이 `string`이면 `lang as Lang`으로 넘긴다.
서식 제목(`formTitle`)은 보내지 않는다. 서버는 번호로 세고, 제목은 언어마다 달라서 묶이지 않는다.

작성 도우미(gusring_prototype)는 `fill_start` `field_open` `fill_preview` `fill_png_save` `fill_print` `fill_reset`에 `formKey`(예: `birth-report`)와 `field_open`의 `fieldId`를 넣는다.
칸에 적은 값은 넣을 자리가 없고, 넣으면 서버가 묶음을 통째로 거부한다.

## 3. 피드백

지금은 구글 폼 링크다. 서버로 바꾸면:

```ts
import { sendFeedback } from './shared/gusring-api';

const r = await sendFeedback({ lang, formNo, type: 'guide', message, website: honeypotValue });
if (r.ok) { /* 감사 문구 */ }
else if (r.code === 'FEEDBACK_RATE_LIMITED') { /* 잠시 후 다시 */ }
else if (r.code === 'COMMON_INVALID_INPUT') { /* 내용을 확인해 주세요 (1~2000자) */ }
else { /* NETWORK_ERROR 등: 잠시 후 다시 */ }
```

`website`는 화면에 보이지 않게 숨긴 입력칸의 값이다. 사람은 비워 두고 봇은 채운다. 채워져 있으면 서버가 저장하지 않고 성공처럼 답한다.

## 알아 둘 것

- 검색이 두 번 기록된다: gusring-web `src/App.tsx`의 검색어 useEffect와 `src/features/forms/components/ListView.tsx`의 useEffect가 둘 다 300ms 뒤 `trackSearch`를 부른다 (2026-11-03 기준). GA4에도 지금 두 번 잡히고 있어 한 곳을 지워야 한다
- 운영 서버의 CORS는 `https://gusring-guide.vercel.app`만 허용한다. 로컬 프론트(3000)는 로컬 서버(`npm run dev`, 4000)에 붙인다
- 이용 기록은 `text/plain`으로 보내서 CORS 사전 요청 없이 간다. 응답을 읽지 않으므로 실패해도 화면에 영향이 없다
- 서버가 거부할 값(체류 3600초 초과, 서식 번호 범위 밖, 빈 검색어 등)은 모듈이 보내기 전에 고치거나 그 이벤트만 버린다
- 속도 제한: 같은 IP 이벤트 분당 60(순간 40), 피드백 분당 10(순간 5) + 10분 5건
