// 구스링 관리자 화면. 같은 서버의 /api/v1/admin/* 만 부른다 (docs/api.md).
// 이용자가 쓴 글(피드백·검색어)은 textContent로만 넣는다. innerHTML 금지.
'use strict';

// 로그인은 서버가 HttpOnly 쿠키로 유지한다. 이 화면은 비밀번호·세션 값을 저장하지 않는다.
const PAGE = 20;
const LANG_NAMES = { ko: '한국어', en: 'English', zh: '中文', ja: '日本語', vi: 'Tiếng Việt' };
const STATUS_NAMES = { new: '새 글', read: '읽음', resolved: '처리함' };
const TYPE_NAMES = { general: '일반', translation: '번역', guide: '안내', bug: '오류' };

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => Number(n).toLocaleString('ko-KR');

let formNames = {};
let fbOffset = 0;

/** 요소 만들기. children은 문자열(글자로만 들어감) 또는 요소 */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

// ── 로그인 ──
/** notice: 오류가 아닌 안내(로그아웃 등)는 회색으로 */
function showLogin(message, notice = false) {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#login-error').textContent = message || '';
  $('#login-error').className = notice ? 'muted' : 'error';
  $('#password').value = '';
  ($('#username').value ? $('#password') : $('#username')).focus();
}

class AuthError extends Error {}

/** path는 /api/v1 뒤 경로. 쿠키는 같은 출처라 브라우저가 붙인다 */
function call(path, opts = {}) {
  const headers = {};
  if (opts.body) headers['Content-Type'] = 'application/json';
  return fetch(`/api/v1${path}`, { ...opts, headers, credentials: 'same-origin' });
}

async function api(path, opts = {}) {
  const res = await call(`/admin${path}`, opts);
  if (res.status === 401) throw new AuthError('로그인이 끝났습니다. 다시 로그인해 주세요.');
  if (opts.raw) {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  }
  const json = await res.json().catch(() => null);
  if (!json) throw new Error(`HTTP ${res.status}`);
  if (!json.success) throw new Error(json.message);
  return json;
}

// ── 기간 (한국 날짜) ──
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function setDays(days) {
  const to = kstToday();
  $('#to').value = to;
  $('#from').value = addDays(to, -(days - 1));
  for (const b of document.querySelectorAll('.seg button')) b.classList.toggle('on', Number(b.dataset.days) === days);
}
const rangeQuery = () => `from=${encodeURIComponent($('#from').value)}&to=${encodeURIComponent($('#to').value)}`;

const formLabel = (formNo, formKey) => {
  if (formNo !== null && formNo !== undefined) return `${formNo}. ${formNames[formNo] || '(이름 없음)'}`;
  return formKey || '(서식 없음)';
};

// ── 그리기 ──
function renderCards(s) {
  const items = [
    ['방문자', s.visitors],
    ['서식 조회', s.formViews],
    ['다운로드', s.formDownloads],
    ['작성 도우미 시작', s.fillStarts],
    ['작성 도우미 저장·인쇄', s.fillOutputs],
  ];
  $('#cards').replaceChildren(
    ...items.map(([label, value]) => el('div', { class: 'card stat' }, el('div', { class: 'label' }, label), el('div', { class: 'value' }, fmt(value)))),
  );
}

function renderLangs(rows) {
  const max = Math.max(1, ...rows.map((r) => r.visitors));
  $('#langs').replaceChildren(
    rows.length === 0
      ? el('p', { class: 'muted' }, '기록이 없습니다.')
      : el('ul', { class: 'bars' }, rows.map((r) => {
          const fill = el('span', { class: 'fill' });
          fill.style.width = `${(r.visitors / max) * 100}%`; // style 속성은 CSP가 막아서 직접 지정
          return el('li', {},
            el('span', {}, LANG_NAMES[r.lang] || r.lang),
            el('span', { class: 'track' }, fill),
            el('span', { class: 'num' }, fmt(r.visitors)));
        })),
  );
}

function svg(tag, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function renderDaily(days) {
  const W = 800, H = 220, L = 36, B = 22, T = 8;
  const max = Math.max(1, ...days.map((d) => Math.max(d.visitors, d.views)));
  const step = (W - L) / Math.max(1, days.length);
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': '날짜별 방문자와 서식 조회' });
  root.append(svg('line', { class: 'axis', x1: L, x2: W, y1: H - B, y2: H - B }));
  for (const v of [0, Math.round(max / 2), max]) {
    const t = svg('text', { class: 'tick', x: L - 6, y: y(v) + 3, 'text-anchor': 'end' });
    t.textContent = fmt(v);
    root.append(t);
  }
  days.forEach((d, i) => {
    const x = L + i * step;
    const bar = svg('rect', { class: 'bar', x: x + step * 0.15, width: Math.max(1, step * 0.7), y: y(d.visitors), height: H - B - y(d.visitors) });
    const tip = svg('title');
    tip.textContent = `${d.day} 방문자 ${fmt(d.visitors)} · 조회 ${fmt(d.views)} · 다운로드 ${fmt(d.downloads)}`;
    bar.append(tip);
    root.append(bar);
  });
  const every = Math.ceil(days.length / 8);
  days.forEach((d, i) => {
    if (i % every !== 0) return;
    const t = svg('text', { class: 'tick', x: L + i * step + step / 2, y: H - 6, 'text-anchor': 'middle' });
    t.textContent = d.day.slice(5);
    root.append(t);
  });
  root.append(svg('polyline', { class: 'line', points: days.map((d, i) => `${L + i * step + step / 2},${y(d.views)}`).join(' ') }));
  $('#daily').replaceChildren(root);
}

function terms(target, rows) {
  $(target).replaceChildren(
    ...(rows.length === 0
      ? [el('li', { class: 'empty' }, '없음')]
      : rows.map((r) => el('li', {}, el('span', {}, r.term ?? r.label), el('span', { class: 'num' }, fmt(r.count))))),
  );
}

function table(target, head, rows) {
  $(target).replaceChildren(
    el('thead', {}, el('tr', {}, head.map(([h, n]) => el('th', n ? { class: 'n' } : {}, h)))),
    el('tbody', {}, rows.length === 0
      ? el('tr', {}, el('td', { colspan: head.length, class: 'muted' }, '기록이 없습니다.'))
      : rows.map((cells) => el('tr', {}, cells.map((c, i) => el('td', { class: head[i][1] ? 'n' : i === 0 ? 'name' : '' }, c))))),
  );
}

function renderForms(items) {
  table('#forms', [['서식'], ['조회', 1], ['다운로드', 1], ['다운로드율', 1]],
    items.map((x) => [formLabel(x.formNo, x.formKey), fmt(x.views), fmt(x.downloads), x.views ? `${Math.round((x.downloads / x.views) * 100)}%` : '-']));
}

function renderFill(data) {
  table('#fill', [['서식'], ['시작', 1], ['미리보기', 1], ['저장·인쇄', 1], ['초기화', 1]],
    data.forms.map((x) => [formLabel(x.formNo, x.formKey), fmt(x.starts), fmt(x.previews), fmt(x.outputs), fmt(x.resets)]));
  terms('#fields', data.topFields.map((f) => ({ label: `${f.formKey || ''} · ${f.fieldId}`, count: f.opens })));
}

// ── 피드백 ──
async function loadFeedbacks() {
  const status = $('#fb-status').value;
  const q = new URLSearchParams({ offset: String(fbOffset), limit: String(PAGE) });
  if (status) q.set('status', status);
  const { data, page } = await api(`/feedbacks?${q}`);
  $('#feedbacks').replaceChildren(
    ...(data.length === 0 ? [el('li', { class: 'muted' }, '피드백이 없습니다.')] : data.map(feedbackItem)),
  );
  const pages = Math.max(1, Math.ceil(page.total / PAGE));
  $('#fb-page').textContent = `${Math.floor(page.offset / PAGE) + 1} / ${pages} (전체 ${fmt(page.total)})`;
  $('#fb-prev').disabled = page.offset === 0;
  $('#fb-next').disabled = page.offset + PAGE >= page.total;
}

function feedbackItem(f) {
  const select = el('select', { 'aria-label': '처리 상태' },
    Object.entries(STATUS_NAMES).map(([v, name]) => {
      const o = el('option', { value: v }, name);
      if (v === f.status) o.selected = true;
      return o;
    }));
  select.addEventListener('change', () => run(async () => {
    await api(`/feedbacks/${f.id}`, { method: 'PATCH', body: JSON.stringify({ status: select.value }) });
    await Promise.all([loadFeedbacks(), loadAudit()]);
  }, '상태를 바꿨습니다.'));
  const remove = el('button', { type: 'button', class: 'danger' }, '삭제');
  remove.addEventListener('click', () => {
    if (!confirm('이 피드백을 지울까요? 되돌릴 수 없습니다.')) return;
    run(async () => {
      await api(`/feedbacks/${f.id}`, { method: 'DELETE' });
      await Promise.all([loadFeedbacks(), loadAudit()]);
    }, '피드백을 삭제했습니다.');
  });
  const where = f.formNo !== null || f.formKey ? formLabel(f.formNo, f.formKey) : null;
  return el('li', {},
    el('div', { class: 'fb-meta' },
      el('span', { class: `badge ${f.status}` }, STATUS_NAMES[f.status] || f.status),
      el('span', {}, TYPE_NAMES[f.type] || f.type),
      el('span', {}, LANG_NAMES[f.lang] || f.lang),
      where && el('span', {}, where),
      f.fieldId && el('span', {}, `칸 ${f.fieldId}`),
      el('time', { datetime: f.createdAt }, new Date(f.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }))),
    el('p', { class: 'fb-msg' }, f.message),
    el('div', { class: 'fb-actions' }, select, remove));
}

// ── 불러오기 ──
async function loadStats() {
  const q = rangeQuery();
  const lang = $('#forms-lang').value;
  const [summary, daily, forms, search, fill] = await Promise.all([
    api(`/stats/summary?${q}`),
    api(`/stats/daily?${q}`),
    api(`/stats/forms?${q}${lang ? `&lang=${lang}` : ''}`),
    api(`/stats/search?${q}`),
    api(`/stats/fill?${q}`),
  ]);
  renderCards(summary.data);
  renderLangs(summary.data.visitorsByLang);
  renderDaily(daily.data.days);
  renderForms(forms.data.items);
  terms('#search-top', search.data.top);
  terms('#search-zero', search.data.zeroResult);
  renderFill(fill.data);
}

async function run(fn, done) {
  const status = $('#status');
  status.textContent = '불러오는 중…';
  try {
    await fn();
    status.textContent = done || `${$('#from').value} ~ ${$('#to').value} (한국 시간)`;
  } catch (e) {
    if (e instanceof AuthError) showLogin(e.message);
    else status.textContent = `오류: ${e.message}`;
  }
}

// ── 관리 기록 ──
const ACTION_NAMES = {
  login: '로그인', login_failed: '로그인 실패', logout: '로그아웃', password_failed: '비밀번호 확인 실패',
  'feedback.status': '피드백 상태 변경', 'feedback.delete': '피드백 삭제',
  'user.create': '계정 만듦', 'user.password': '비밀번호 바꿈', 'user.disable': '계정 막음', 'user.enable': '계정 풂', 'user.unlock': '잠금 풂',
};
const shortId = (s) => (s.length > 20 ? `${s.slice(0, 8)}…` : s);
async function loadAudit() {
  const { data } = await api(`/audit-logs?limit=${PAGE}`);
  table('#audit', [['시각'], ['누가'], ['무엇'], ['대상']],
    data.map((x) => {
      let target = x.target ? shortId(x.target) : '';
      if (x.action === 'feedback.status' && x.detail) target += ` → ${STATUS_NAMES[x.detail.status] || x.detail.status}`;
      return [new Date(x.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }), x.actor, ACTION_NAMES[x.action] || x.action, target];
    }));
}

const loadAll = () => run(() => Promise.all([loadStats(), loadFeedbacks(), loadAudit()]));

async function downloadCsv() {
  await run(async () => {
    const res = await api(`/stats/export?${rangeQuery()}`, { raw: true });
    const url = URL.createObjectURL(await res.blob());
    const a = el('a', { href: url, download: `gusring-stats-${$('#from').value}_${$('#to').value}.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, 'CSV를 받았습니다.');
}

async function enter(username) {
  $('#who').textContent = username;
  $('#login').hidden = true;
  $('#app').hidden = false;
  await loadAll();
}

// ── 시작 ──
document.addEventListener('DOMContentLoaded', async () => {
  for (const [code, name] of Object.entries(LANG_NAMES)) $('#forms-lang').append(el('option', { value: code }, name));
  try {
    formNames = await (await fetch('form-names.json')).json();
  } catch { /* 이름 없이 번호만 */ }

  setDays(30);
  for (const b of document.querySelectorAll('.seg button')) b.addEventListener('click', () => { setDays(Number(b.dataset.days)); loadAll(); });
  $('#apply').addEventListener('click', () => {
    for (const b of document.querySelectorAll('.seg button')) b.classList.remove('on');
    loadAll();
  });
  $('#forms-lang').addEventListener('change', () => run(loadStats));
  $('#fb-status').addEventListener('change', () => { fbOffset = 0; run(loadFeedbacks); });
  $('#fb-prev').addEventListener('click', () => { fbOffset = Math.max(0, fbOffset - PAGE); run(loadFeedbacks); });
  $('#fb-next').addEventListener('click', () => { fbOffset += PAGE; run(loadFeedbacks); });
  $('#csv').addEventListener('click', downloadCsv);
  // ── 비밀번호 바꾸기 ──
  const dialog = $('#pw-dialog');
  const resetPwForm = () => {
    for (const id of ['#pw-current', '#pw-new', '#pw-confirm']) $(id).value = '';
    $('#pw-error').textContent = '';
  };
  $('#pw-open').addEventListener('click', () => {
    resetPwForm();
    dialog.showModal();
    $('#pw-current').focus();
  });
  // 닫을 때 입력한 비밀번호를 지운다. close 이벤트가 안 오는 브라우저가 있어 직접 지우고, Esc로 닫는 경우만 이벤트에 맡긴다
  const closePw = () => {
    dialog.close();
    resetPwForm();
  };
  $('#pw-cancel').addEventListener('click', closePw);
  dialog.addEventListener('close', resetPwForm);
  $('#pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const current = $('#pw-current').value;
    const next = $('#pw-new').value;
    if (next !== $('#pw-confirm').value) {
      $('#pw-error').textContent = '새 비밀번호 두 개가 다릅니다.';
      return;
    }
    const submit = $('#pw-submit');
    submit.disabled = true;
    try {
      const res = await call('/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      const json = await res.json().catch(() => null);
      if (json && json.success) {
        closePw();
        $('#status').textContent = json.message;
        loadAudit().catch(() => null);
      } else if (res.status === 401) {
        closePw();
        showLogin('로그인이 끝났습니다. 다시 로그인해 주세요.');
      } else {
        $('#pw-error').textContent = json ? json.message : `바꾸지 못했습니다 (HTTP ${res.status})`;
        if (json && json.error.code === 'AUTH_LOGIN_LOCKED') {
          closePw();
          showLogin(json.message);
        } else {
          loadAudit().catch(() => null);
        }
      }
    } catch {
      $('#pw-error').textContent = '서버에 연결할 수 없습니다.';
    } finally {
      submit.disabled = false;
    }
  });

  $('#logout').addEventListener('click', async () => {
    await call('/auth/logout', { method: 'POST' }).catch(() => null);
    showLogin('로그아웃했습니다.', true);
  });

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit = $('#login-submit');
    submit.disabled = true;
    try {
      const res = await call('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: $('#username').value, password: $('#password').value }),
      });
      const json = await res.json().catch(() => null);
      $('#password').value = '';
      if (json && json.success) await enter(json.data.username);
      else showLogin(json ? json.message : `로그인 실패 (HTTP ${res.status})`);
    } catch {
      showLogin('서버에 연결할 수 없습니다.');
    } finally {
      submit.disabled = false;
    }
  });

  // 이미 로그인돼 있으면 바로 들어간다
  const me = await call('/auth/me').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (me && me.success) await enter(me.data.username);
  else showLogin('');
});
