// 구스링 관리자 화면. 같은 서버의 /api/v1/admin/* 만 부른다 (docs/api.md).
// 이용자가 쓴 글(피드백·검색어)은 textContent로만 넣는다. innerHTML 금지.
'use strict';

const TOKEN_KEY = 'gusring_admin_token';
const PAGE = 20;
const LANG_NAMES = { ko: '한국어', en: 'English', zh: '中文', ja: '日本語', vi: 'Tiếng Việt' };
const STATUS_NAMES = { new: '새 글', read: '읽음', resolved: '처리함' };
const TYPE_NAMES = { general: '일반', translation: '번역', guide: '안내', bug: '오류' };

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => Number(n).toLocaleString('ko-KR');

let token = null;
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

// ── 토큰 ──
function readToken() {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function saveToken(t) {
  try { sessionStorage.setItem(TOKEN_KEY, t); } catch { /* 저장 못 하면 이 화면에서만 */ }
}
function logout(message) {
  token = null;
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* 무시 */ }
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#login-error').textContent = message || '';
  $('#token').value = '';
  $('#token').focus();
}

class AuthError extends Error {}

async function api(path, opts = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  if (opts.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api/v1/admin${path}`, { ...opts, headers });
  if (res.status === 401) throw new AuthError('토큰이 맞지 않습니다.');
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
    await loadFeedbacks();
  }, '상태를 바꿨습니다.'));
  const remove = el('button', { type: 'button', class: 'danger' }, '삭제');
  remove.addEventListener('click', () => {
    if (!confirm('이 피드백을 지울까요? 되돌릴 수 없습니다.')) return;
    run(async () => {
      await api(`/feedbacks/${f.id}`, { method: 'DELETE' });
      await loadFeedbacks();
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
    if (e instanceof AuthError) logout(e.message);
    else status.textContent = `오류: ${e.message}`;
  }
}

const loadAll = () => run(() => Promise.all([loadStats(), loadFeedbacks()]));

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

async function enter() {
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
  $('#logout').addEventListener('click', () => logout(''));

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    token = $('#token').value.trim();
    if (!token) return;
    saveToken(token);
    await enter();
  });

  token = readToken();
  if (token) await enter();
  else logout('');
});
