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
/** 지금 로그인한 관리자 { username, role, mustChangePassword } */
let me = null;
const ROLE_NAMES = { manager: '계정 관리자', staff: '일반 관리자' };

/** 임시 비밀번호: 헷갈리는 글자(0 O 1 l I) 없이 14자 */
function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}
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
/** 로그인 화면으로 갈 때 이전 사람의 데이터를 화면에서 지운다 (같은 컴퓨터를 다음 사람이 쓸 때 보이지 않게) */
function clearApp() {
  me = null;
  for (const id of ['#cards', '#daily', '#langs', '#forms', '#fill', '#fields', '#search-top', '#search-zero', '#feedbacks', '#audit', '#users', '#nu-msg', '#status', '#who']) {
    $(id).replaceChildren();
  }
  $('#fb-page').textContent = '';
  $('#users-card').hidden = true;
}

function showLogin(message, notice = false) {
  clearApp();
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
  'user.role': '역할 바꿈',
};
const shortId = (s) => (s.length > 20 ? `${s.slice(0, 8)}…` : s);
async function loadAudit() {
  const { data } = await api(`/audit-logs?limit=${PAGE}`);
  table('#audit', [['시각'], ['누가'], ['무엇'], ['대상']],
    data.map((x) => {
      let target = x.target ? shortId(x.target) : '';
      if (x.action === 'feedback.status' && x.detail) target += ` → ${STATUS_NAMES[x.detail.status] || x.detail.status}`;
      if (x.action === 'user.role' && x.detail) target += ` → ${ROLE_NAMES[x.detail.to] || x.detail.to}`;
      if (x.action === 'user.create' && x.detail) target += ` (${ROLE_NAMES[x.detail.role] || x.detail.role})`;
      const what = x.action === 'user.password' && x.detail && x.detail.temporary ? '비밀번호 초기화' : ACTION_NAMES[x.action] || x.action;
      return [new Date(x.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }), x.actor, what, target];
    }));
}

// ── 계정 관리 (계정 관리자만) ──
let resetTarget = null;

function userState(u) {
  if (u.disabled) return '막힘';
  if (u.lockedUntil && new Date(u.lockedUntil) > new Date()) return `잠김 (${new Date(u.lockedUntil).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })}까지)`;
  if (u.mustChangePassword) return '임시 비밀번호';
  return '사용';
}

/** 계정 하나 바꾸기. 성공하면 목록·기록을 다시 불러온다 */
async function userAction(path, method, body, done) {
  try {
    await api(`/users${path}`, { method, body: body ? JSON.stringify(body) : undefined });
    $('#nu-msg').textContent = done;
  } catch (e) {
    if (e instanceof AuthError) return showLogin(e.message);
    $('#nu-msg').textContent = `오류: ${e.message}`;
  }
  await Promise.all([loadUsers(), loadAudit()]).catch(() => null);
}

function userControls(u) {
  if (u.username === me.username) return el('span', { class: 'muted small' }, '내 계정 (오른쪽 위에서 비밀번호 바꾸기)');
  const role = el('select', { 'aria-label': `${u.username} 역할` },
    Object.entries(ROLE_NAMES).map(([v, name]) => {
      const o = el('option', { value: v }, name);
      if (v === u.role) o.selected = true;
      return o;
    }));
  role.addEventListener('change', () => {
    if (!confirm(`${u.username}을(를) ${ROLE_NAMES[role.value]}(으)로 바꿀까요?`)) { role.value = u.role; return; }
    userAction(`/${encodeURIComponent(u.username)}`, 'PATCH', { role: role.value }, `${u.username}: ${ROLE_NAMES[role.value]}(으)로 바꿨습니다.`);
  });
  const toggle = el('button', { type: 'button', class: u.disabled ? '' : 'danger' }, u.disabled ? '풀기' : '막기');
  toggle.addEventListener('click', () => {
    if (!u.disabled && !confirm(`${u.username} 계정을 막을까요? 지금 로그인도 바로 끊깁니다.`)) return;
    userAction(`/${encodeURIComponent(u.username)}`, 'PATCH', { disabled: !u.disabled }, `${u.username}: ${u.disabled ? '다시 쓸 수 있게 했습니다' : '막았습니다'}.`);
  });
  const reset = el('button', { type: 'button' }, '비밀번호 초기화');
  reset.addEventListener('click', () => openReset(u.username));
  const controls = [role, toggle, reset];
  if (u.lockedUntil && new Date(u.lockedUntil) > new Date()) {
    const unlock = el('button', { type: 'button' }, '잠금 풀기');
    unlock.addEventListener('click', () => userAction(`/${encodeURIComponent(u.username)}/unlock`, 'POST', null, `${u.username}: 잠금을 풀었습니다.`));
    controls.push(unlock);
  }
  return el('div', { class: 'user-actions' }, controls);
}

async function loadUsers() {
  if (!me || me.role !== 'manager') return;
  const { data } = await api('/users');
  const fmtDate = (d) => (d ? new Date(d).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '-');
  $('#users').replaceChildren(
    el('thead', {}, el('tr', {}, ['아이디', '역할', '상태', '마지막 로그인', ''].map((h) => el('th', {}, h)))),
    el('tbody', {}, data.map((u) =>
      el('tr', {},
        el('td', {}, u.username),
        el('td', {}, ROLE_NAMES[u.role] || u.role),
        el('td', {}, userState(u)),
        el('td', {}, fmtDate(u.lastLoginAt)),
        el('td', {}, userControls(u))))),
  );
}

function openReset(username) {
  resetTarget = username;
  $('#reset-who').textContent = `대상: ${username}`;
  $('#reset-pw').value = generatePassword();
  $('#reset-error').textContent = '';
  $('#reset-dialog').showModal();
}

const loadAll = () => run(() => Promise.all([loadStats(), loadFeedbacks(), loadAudit(), loadUsers()]));

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

async function enter(info) {
  me = info;
  $('#who').textContent = `${me.username} · ${ROLE_NAMES[me.role] || me.role}`;
  $('#users-card').hidden = me.role !== 'manager';
  $('#login').hidden = true;
  $('#app').hidden = false;
  // 임시 비밀번호면 바꾸기 전에는 다른 기능이 막혀 있다 → 바꾸기 창부터
  if (me.mustChangePassword) openPassword(true);
  else await loadAll();
}

/** 로그인 직후·새로고침 때 내 정보 */
const fetchMe = () => call('/auth/me').then((r) => (r.ok ? r.json() : null)).catch(() => null);

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
  // forced: 임시 비밀번호라 바꾸기 전에는 닫을 수 없음
  window.openPassword = (forced) => {
    resetPwForm();
    $('#pw-forced').hidden = !forced;
    $('#pw-cancel').hidden = forced;
    dialog.dataset.forced = forced ? '1' : '';
    dialog.showModal();
    $('#pw-current').focus();
  };
  $('#pw-open').addEventListener('click', () => openPassword(false));
  dialog.addEventListener('cancel', (e) => { if (dialog.dataset.forced) e.preventDefault(); }); // Esc로 못 닫게
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
        const wasForced = Boolean(dialog.dataset.forced);
        dialog.dataset.forced = '';
        closePw();
        $('#status').textContent = json.message;
        if (wasForced) {
          me.mustChangePassword = false;
          await loadAll();
        } else {
          loadAudit().catch(() => null);
        }
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
      const info = json && json.success ? await fetchMe() : null;
      if (info && info.success) await enter(info.data);
      else showLogin(json ? json.message : `로그인 실패 (HTTP ${res.status})`);
    } catch {
      showLogin('서버에 연결할 수 없습니다.');
    } finally {
      submit.disabled = false;
    }
  });

  // ── 계정 추가·초기화 (계정 관리자) ──
  $('#nu-gen').addEventListener('click', () => { $('#nu-pw').value = generatePassword(); });
  $('#user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('#nu-name').value.trim().toLowerCase();
    const temporaryPassword = $('#nu-pw').value;
    const role = $('#nu-role').value;
    const submit = $('#nu-submit');
    submit.disabled = true;
    try {
      await api('/users', { method: 'POST', body: JSON.stringify({ username, role, temporaryPassword }) });
      const msg = $('#nu-msg');
      msg.replaceChildren(`${username}(${ROLE_NAMES[role]}) 계정을 만들었습니다. 임시 비밀번호 `, el('span', { class: 'temp-pw' }, temporaryPassword), ' 를 직접 전달해 주세요.');
      $('#nu-name').value = '';
      $('#nu-pw').value = '';
      await Promise.all([loadUsers(), loadAudit()]);
    } catch (err) {
      if (err instanceof AuthError) showLogin(err.message);
      else $('#nu-msg').textContent = `오류: ${err.message}`;
    } finally {
      submit.disabled = false;
    }
  });

  const resetDialog = $('#reset-dialog');
  const closeReset = () => {
    resetDialog.close();
    $('#reset-pw').value = '';
    resetTarget = null;
  };
  $('#reset-gen').addEventListener('click', () => { $('#reset-pw').value = generatePassword(); });
  $('#reset-cancel').addEventListener('click', closeReset);
  $('#reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const target = resetTarget;
    const temporaryPassword = $('#reset-pw').value;
    $('#reset-submit').disabled = true;
    try {
      await api(`/users/${encodeURIComponent(target)}/password`, { method: 'POST', body: JSON.stringify({ temporaryPassword }) });
      closeReset();
      $('#nu-msg').replaceChildren(`${target}의 비밀번호를 초기화했습니다. 임시 비밀번호 `, el('span', { class: 'temp-pw' }, temporaryPassword), ' 를 직접 전달해 주세요.');
      await Promise.all([loadUsers(), loadAudit()]);
    } catch (err) {
      if (err instanceof AuthError) { closeReset(); showLogin(err.message); }
      else $('#reset-error').textContent = err.message;
    } finally {
      $('#reset-submit').disabled = false;
    }
  });

  // 이미 로그인돼 있으면 바로 들어간다
  const info = await fetchMe();
  if (info && info.success) await enter(info.data);
  else showLogin('');
});
