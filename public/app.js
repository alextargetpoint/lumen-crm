/* ============================================================
   Lumen CRM — SPA. Разделы рендерятся в #content, данные — REST.
   ============================================================ */

/* ---------- helpers ---------- */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const el = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ic = (p, sw) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw || 1.7}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

const I = {
  grid: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  funnel: '<path d="M3 4h18l-7 8v6l-4 2v-8L3 4z"/>',
  chat: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3a8.5 8.5 0 0 1 8.5 8.5z"/>',
  spark: '<path d="M12 2l1.9 5.8L20 9.7l-5 3.9 1.6 6.2L12 16.4l-4.6 3.4L9 13.6 4 9.7l6.1-1.9L12 2z"/>',
  chain: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M6 8.5v7M11 6h7M11 18h7"/>',
  wake: '<path d="M12 3v2M5.6 5.6L7 7M3 12h2M19 12h2M17 7l1.4-1.4M8 17a4 4 0 1 1 8 0M4 21h16"/>',
  sim: '<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M9 18h6"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><path d="M14 2v6h6"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6.5 6.5 0 0 1 12 0M16 4.5a3.2 3.2 0 0 1 0 6.4M15.5 13.6A6.5 6.5 0 0 1 21 20"/>',
  bars: '<path d="M4 20V10M10 20V4M16 20v-7M2 20h20"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  bolt: '<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  user: '<circle cx="12" cy="8" r="3.4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  flame: '<path d="M12 2s5.5 4.6 5.5 9.5a5.5 5.5 0 0 1-11 0C6.5 8.6 8 7.5 8.5 6c.8 1.5 2 2 2 2C10.5 5.5 12 2 12 2z"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M6 4l14 8-14 8V4z"/>',
  pause: '<path d="M7 4h4v16H7zM13 4h4v16h-4z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  shield: '<path d="M12 2l8 3.5v5.2c0 5-3.4 9.6-8 11.3-4.6-1.7-8-6.3-8-11.3V5.5L12 2z"/>',
  handover: '<path d="M4 14a4 4 0 0 1 6-3.5L12 12l2-1.5a4 4 0 0 1 6 3.5M12 12v6M8 21h8"/>',
  eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  cal: '<rect x="3" y="4" width="18" height="17" rx="2.5"/><path d="M3 9.5h18M8 2v4M16 2v4"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
};

/* ---------- сворачиваемые группы (стекло-стиль, spring-раскрытие) ---------- */
function coll(title, bodyHtml, opts = {}) {
  return `<div class="coll ${opts.open === false ? '' : 'open'}">
    <button class="coll-head" type="button">
      ${opts.icon ? `<span class="ch-ic">${ic(opts.icon)}</span>` : ''}
      <span class="ch-t">${title}</span>
      ${opts.count != null ? `<span class="ch-cnt">${opts.count}</span>` : ''}
      <span class="chev">${ic(I.chev, 2)}</span>
    </button>
    <div class="coll-body"><div class="coll-inner">${bodyHtml}</div></div>
  </div>`;
}
document.addEventListener('click', (e) => {
  const h = e.target.closest('.coll-head');
  if (h) h.parentElement.classList.toggle('open');
});

/* ============================================================
   Кастомные контролы (золотое правило: никаких нативных
   дропдаунов/календарей — всё в стилистике продукта)
   ============================================================ */
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_N = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const DOW = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

/* поповеры пикеров живут в body fixed-слоем (внутри модалки их режет overflow,
   а position:fixed под transform ломается — проверено дашбордом) */
let CUR_POP = null;
function closePop() {
  if (!CUR_POP) return;
  CUR_POP.pop.classList.remove('show');
  CUR_POP.pop.remove();
  CUR_POP.wrap.classList.remove('open');
  CUR_POP = null;
}
function openPop(wrap, btn, pop) {
  closePop();
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect();
  Object.assign(pop.style, { position: 'fixed', zIndex: 400, minWidth: r.width + 'px', visibility: 'hidden' });
  pop.classList.add('show');
  const w = pop.offsetWidth, h = pop.offsetHeight;
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 12)) + 'px';
  const below = innerHeight - r.bottom;
  /* не влезает вниз — переворачиваем над кнопкой */
  pop.style.top = (below > h + 14 || r.top < h + 14 ? r.bottom + 6 : r.top - h - 6) + 'px';
  pop.style.visibility = '';
  wrap.classList.add('open');
  CUR_POP = { wrap, pop };
}
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('.cs, .dtp, .cs-list, .dtp-pop')) closePop();
});
window.addEventListener('scroll', (e) => { if (CUR_POP && !e.target.closest?.('.cs-list, .dtp-pop')) closePop(); }, true);
window.addEventListener('resize', closePop);

function enhanceControls(root) {
  /* селекты → стилизованный дропдаун (нативный остаётся хранителем значения) */
  $$('select', root).forEach(sel => {
    if (sel.dataset.enh || sel.closest('.cs')) return;
    sel.dataset.enh = '1';
    const wrap = document.createElement('div');
    wrap.className = 'cs';
    if (sel.style.width) { wrap.style.width = sel.style.width; sel.style.width = ''; }
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    const btn = el(`<button type="button" class="cs-btn"><span class="cs-val"></span><span class="cs-chev">${ic(I.chev, 2)}</span></button>`);
    const list = el('<div class="cs-list"></div>');
    wrap.append(btn);
    const sync = () => { btn.querySelector('.cs-val').textContent = sel.selectedOptions[0] ? sel.selectedOptions[0].textContent.trim() : ''; };
    const build = () => {
      list.innerHTML = Array.from(sel.options).map((o, i) =>
        `<div class="cs-opt ${o.selected ? 'sel' : ''} ${o.disabled ? 'dis' : ''}" data-i="${i}">${esc(o.textContent.trim())}${o.selected ? ic(I.check) : ''}</div>`).join('');
      $$('.cs-opt', list).forEach(x => x.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const o = sel.options[+x.dataset.i];
        if (o.disabled) return;
        sel.value = o.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        sync();
        closePop();
      }));
    };
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (wrap.classList.contains('open')) closePop();
      else { build(); openPop(wrap, btn, list); }
    });
    sync();
  });

  /* дата → свой календарь */
  $$('input[type="date"]', root).forEach(inp => {
    if (inp.dataset.enh) return;
    inp.dataset.enh = '1';
    const wrap = document.createElement('div');
    wrap.className = 'dtp';
    inp.parentNode.insertBefore(wrap, inp);
    wrap.appendChild(inp);
    const btn = el(`<button type="button" class="cs-btn"><span class="cs-val"></span><span class="cs-chev">${ic(I.cal)}</span></button>`);
    const pop = el('<div class="dtp-pop"></div>');
    wrap.append(btn);
    const label = () => {
      const [y, mo, d] = (inp.value || '').split('-').map(Number);
      btn.querySelector('.cs-val').textContent = d ? `${d} ${MONTHS[mo - 1]} ${y}` : 'Выбрать дату';
    };
    let view = null;
    const build = () => {
      const cur = inp.value ? new Date(inp.value + 'T12:00') : new Date();
      if (!view) view = { y: cur.getFullYear(), m: cur.getMonth() };
      const first = new Date(view.y, view.m, 1);
      const shift = (first.getDay() + 6) % 7;
      const days = new Date(view.y, view.m + 1, 0).getDate();
      const today = new Date();
      const isSel = (d) => inp.value === `${view.y}-${String(view.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = (d) => today.getFullYear() === view.y && today.getMonth() === view.m && today.getDate() === d;
      pop.innerHTML = `
        <div class="dtp-head">
          <button type="button" class="dtp-nav" data-d="-1">${ic(I.chev, 2)}</button>
          <b>${MONTHS_N[view.m]} ${view.y}</b>
          <button type="button" class="dtp-nav" data-d="1">${ic(I.chev, 2)}</button>
        </div>
        <div class="dtp-grid">
          ${DOW.map(d => `<span class="dtp-dow">${d}</span>`).join('')}
          ${Array.from({ length: shift }, () => '<span></span>').join('')}
          ${Array.from({ length: days }, (_, i) => `<button type="button" class="dtp-day ${isSel(i + 1) ? 'sel' : ''} ${isToday(i + 1) ? 'today' : ''}" data-day="${i + 1}">${i + 1}</button>`).join('')}
        </div>`;
      $$('.dtp-nav', pop).forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); view.m += +b.dataset.d; if (view.m < 0) { view.m = 11; view.y--; } if (view.m > 11) { view.m = 0; view.y++; } build(); }));
      $$('.dtp-day', pop).forEach(b => b.addEventListener('click', () => {
        inp.value = `${view.y}-${String(view.m + 1).padStart(2, '0')}-${String(b.dataset.day).padStart(2, '0')}`;
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        label();
        closePop();
      }));
    };
    btn.addEventListener('click', () => {
      if (wrap.classList.contains('open')) closePop();
      else { view = null; build(); openPop(wrap, btn, pop); }
    });
    label();
  });

  /* время → слоты по 30 минут */
  $$('input[type="time"]', root).forEach(inp => {
    if (inp.dataset.enh) return;
    inp.dataset.enh = '1';
    const wrap = document.createElement('div');
    wrap.className = 'dtp';
    inp.parentNode.insertBefore(wrap, inp);
    wrap.appendChild(inp);
    const btn = el(`<button type="button" class="cs-btn"><span class="cs-val"></span><span class="cs-chev">${ic(I.clock)}</span></button>`);
    const pop = el('<div class="dtp-pop dtp-time"></div>');
    wrap.append(btn);
    const label = () => { btn.querySelector('.cs-val').textContent = inp.value || 'Время'; };
    const build = () => {
      const slots = [];
      for (let h = 8; h <= 21; h++) for (const mm of ['00', '30']) slots.push(`${String(h).padStart(2, '0')}:${mm}`);
      pop.innerHTML = slots.map(s => `<button type="button" class="dtp-slot ${inp.value === s ? 'sel' : ''}">${s}</button>`).join('');
      $$('.dtp-slot', pop).forEach(b => b.addEventListener('click', () => {
        inp.value = b.textContent;
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        label();
        closePop();
      }));
    };
    btn.addEventListener('click', () => {
      if (wrap.classList.contains('open')) closePop();
      else { build(); openPop(wrap, btn, pop); const sel = pop.querySelector('.sel'); if (sel) sel.scrollIntoView({ block: 'center' }); }
    });
    label();
  });
}

const NAV = {
  overview:  { name: 'Обзор', icon: I.grid, sub: 'Живая картина отдела продаж' },
  funnel:    { name: 'Воронка', icon: I.funnel, sub: 'Канбан лидов по стадиям' },
  inbox:     { name: 'Диалоги', icon: I.chat, sub: 'WhatsApp-инбокс · ИИ-первая линия' },
  qualifier: { name: 'ИИ-квалификатор', icon: I.spark, sub: 'Критерии, регламент и автопилот первой линии' },
  sequences: { name: 'Цепочки касаний', icon: I.chain, sub: '7 касаний / 18 дней для молчунов' },
  wake:      { name: 'Реанимация базы', icon: I.wake, sub: 'Скоринг спящих и безопасные кампании' },
  meetings:  { name: 'Встречи', icon: I.cal, sub: 'Слоты с экспертами · WhatsApp-подтверждения' },
  ads:       { name: 'Реклама', icon: I.target, sub: 'Мост приёма лидов (Albato) · атрибуция к объявлениям' },
  numbers:   { name: 'Номера', icon: I.sim, sub: 'Пул WhatsApp-номеров: качество, лимиты, прогрев' },
  templates: { name: 'Шаблоны', icon: I.doc, sub: 'Utility и Marketing шаблоны Cloud API' },
  brokers:   { name: 'Брокеры', icon: I.users, sub: 'Команда экспертов и загрузка' },
  analytics: { name: 'Аналитика', icon: I.bars, sub: 'Человек против ИИ · регионы · канал' },
  settings:  { name: 'Подключения', icon: I.gear, sub: 'WhatsApp Cloud API · ИИ · демо-режим' },
};

const STAGES = [
  { id: 'new', name: 'Новые', icon: 'plus' },
  { id: 'touch', name: 'Первое касание', icon: 'chain' },
  { id: 'dialog', name: 'В диалоге с ИИ', icon: 'chat' },
  { id: 'qualified', name: 'Квалифицирован', icon: 'spark' },
  { id: 'handover', name: 'У брокера', icon: 'handover' },
  { id: 'viewing', name: 'Показ', icon: 'eye' },
  { id: 'deal', name: 'Сделка', icon: 'flame' },
  { id: 'sleeping', name: 'Спящие', icon: 'moon' },
  { id: 'lost', name: 'Закрыт', icon: 'x' },
];
const stageName = (id) => (STAGES.find(s => s.id === id) || {}).name || id;

/* ---------- api ---------- */
async function apiReq(method, p, b) {
  const r = await fetch('/api' + p, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(b || {}),
  });
  if (r.status === 401) { renderLogin(); throw new Error('auth'); }
  return r.json();
}
const api = {
  get: (p) => apiReq('GET', p),
  post: (p, b) => apiReq('POST', p, b),
  patch: (p, b) => apiReq('PATCH', p, b),
};

/* ---------- экран входа (тёмный, по бренду) ---------- */
function renderLogin() {
  hidePreloader();
  if ($('#loginScreen')) return;
  const s = el(`<div id="loginScreen" style="position:fixed;inset:0;z-index:300;display:grid;place-items:center;background:#061126;overflow:hidden">
    <video autoplay muted loop playsinline src="assets/nebula-bg.mp4"
      style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.5"></video>
    <div style="position:absolute;inset:0;background:radial-gradient(closest-side,transparent 25%,rgba(6,17,38,.6))"></div>
    <div style="position:relative;width:360px;max-width:calc(100vw - 40px);padding:36px 32px;border-radius:20px;
        background:rgba(10,24,51,.5);border:1px solid rgba(134,175,255,.2);
        backdrop-filter:blur(26px);-webkit-backdrop-filter:blur(26px);
        box-shadow:0 30px 80px -20px rgba(3,8,25,.85);text-align:center;
        animation:reveal .8s var(--ease-spring) both">
      <img src="logo.svg" class="pl-logo" style="width:44px;height:53px;margin:0 auto 14px">
      <div style="font-size:19px;font-weight:650;letter-spacing:.22em;color:#fff">LUMEN</div>
      <div style="font-size:10px;letter-spacing:.16em;color:#86AFFF;margin:4px 0 26px">REAL ESTATE CRM</div>
      <input id="loginPass" type="password" placeholder="Пароль" style="width:100%;background:rgba(6,17,38,.6);
        border:1px solid rgba(134,175,255,.25);color:#fff;text-align:center;font-size:14px;padding:11px">
      <div id="loginErr" style="font-size:12px;min-height:18px;margin-top:8px;color:#f28b8b"></div>
      <button id="loginBtn" class="btn btn-accent" style="width:100%;justify-content:center;height:44px;font-size:14px">Войти</button>
    </div>
  </div>`);
  document.body.appendChild(s);
  const doLogin = async () => {
    const r = await fetch('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#loginPass').value }) });
    if (r.ok) location.reload();
    else $('#loginErr').textContent = 'Неверный пароль';
  };
  $('#loginBtn').addEventListener('click', doLogin);
  $('#loginPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  $('#loginPass').focus();
}

/* ---------- время ---------- */
function ago(ts) {
  if (!ts) return '—';
  const d = Date.now() - ts;
  if (d < 60e3) return 'только что';
  if (d < 3600e3) return Math.floor(d / 60e3) + ' мин назад';
  if (d < 86400e3) return Math.floor(d / 3600e3) + ' ч назад';
  return Math.floor(d / 86400e3) + ' дн назад';
}
function tmm(ts) { return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }

/* ---------- модалки/тосты ---------- */
function modal({ title, sub, body, actions, wide }) {
  closeModal();
  const bd = el(`<div class="modal-bd"><div class="modal glass" ${wide === 'card' ? 'style="width:980px"' : wide ? 'style="width:680px"' : ''}>
    <h3>${esc(title)}</h3>${sub ? `<div class="m-sub">${sub}</div>` : ''}
    <div class="m-body">${body || ''}</div>
    <div class="m-actions"></div>
  </div></div>`);
  const act = bd.querySelector('.m-actions');
  (actions || [{ label: 'Закрыть' }]).forEach(a => {
    const b = el(`<button class="btn ${a.cls || ''}">${esc(a.label)}</button>`);
    b.addEventListener('click', async () => { if (a.onClick) { if (await a.onClick(bd) === false) return; } closeModal(); });
    act.appendChild(b);
  });
  bd.addEventListener('mousedown', (e) => { if (e.target === bd) closeModal(); });
  document.body.appendChild(bd);
  enhanceControls(bd);
  requestAnimationFrame(() => bd.classList.add('show'));
  return bd;
}
function closeModal() { const bd = $('.modal-bd'); if (bd) { bd.classList.remove('show'); setTimeout(() => bd.remove(), 180); } }
function toast(text, sub, ok) {
  const t = el(`<div class="toast glass ${ok ? 'ok' : ''}">${ic(ok ? I.check : I.spark)}<div><div>${esc(text)}</div>${sub ? `<div class="t-sub">${esc(sub)}</div>` : ''}</div></div>`);
  $('#toasts').appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3400);
}

/* ---------- глобальное состояние ---------- */
let STATE = null;
let CUR = 'overview';
const PAGE_STATE = { inboxLead: null, funnelGeo: '', wakePreview: [] };

async function loadState() {
  STATE = await api.get('/state');
  $('#agencyName').textContent = STATE.settings.agency.name;
  $('#agencyAva').textContent = STATE.settings.agency.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  $('#demoChip').style.display = STATE.settings.demo.simulateReplies ? 'flex' : 'none';
  /* живые счётчики в меню: непрочитанные диалоги и активные лиды */
  const an = STATE.analytics || {};
  const setCnt = (page, v) => {
    const b = $$('.nav-item').find(x => x.dataset.page === page);
    if (!b) return;
    const c = b.querySelector('[data-cnt]');
    if (c) { c.textContent = v; c.style.display = v ? '' : 'none'; }
  };
  setCnt('inbox', an.unread || 0);
  setCnt('funnel', an.totalActive || 0);
}

function hidePreloader() {
  const p = $('#preloader');
  if (p && !p.classList.contains('hide')) {
    p.classList.add('hide');
    setTimeout(() => p.remove(), 700);
  }
}

/* ---------- навигация ---------- */
function initNav() {
  $$('.nav-item').forEach(btn => {
    const def = NAV[btn.dataset.page];
    btn.innerHTML = `${ic(def.icon)}${def.name}<span class="cnt" data-cnt style="display:none"></span>`;
    btn.addEventListener('click', () => go(btn.dataset.page));
  });
}
function go(page) {
  CUR = page;
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  $('#pageTitle').textContent = NAV[page].name;
  $('#pageSub').textContent = NAV[page].sub;
  $('#pageEmblem').innerHTML = ic(NAV[page].icon, 1.8);
  /* волна входа: анимации только при смене раздела, фоновые обновления без replay */
  const c = $('#content');
  c.classList.add('anim');
  clearTimeout(go._t);
  go._t = setTimeout(() => c.classList.remove('anim'), 1400);
  render();
}

/* count-up крупных цифр в волну входа */
function countUp(root) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  $$('.kpi .val, .cmp-stat .v, .seg .sg-num', root).forEach(el => {
    const raw = el.textContent.trim();
    const target = parseInt(raw.replace(/\s/g, ''), 10);
    if (!Number.isFinite(target) || String(target) !== raw || target === 0) return;
    const t0 = performance.now(), dur = 650;
    const tick = (t) => {
      const p = Math.min((t - t0) / dur, 1);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
async function render() {
  const fn = PAGES[CUR];
  if (!fn) return;
  try {
    await fn($('#content'));
    enhanceControls($('#content'));
    if ($('#content').classList.contains('anim')) countUp($('#content'));
  } catch (e) {
    if (e.message === 'auth') return; // гейт уже показан
    /* инвариант: раздел никогда не остаётся молча пустым */
    console.error('[render]', CUR, e);
    $('#content').innerHTML = `<div class="glass card" style="max-width:520px;margin:60px auto;text-align:center">
      <div style="font-size:15px;font-weight:650;color:var(--navy-900);margin-bottom:6px">Раздел не загрузился</div>
      <div class="muted" style="font-size:12.5px;margin-bottom:16px">${esc(e.message || 'ошибка сети')} — данные не потеряны, попробуйте ещё раз</div>
      <button class="btn btn-accent" onclick="render()" style="margin:0 auto">Повторить</button>
    </div>`;
  }
}

/* ---------- связь с сервером: молча не умираем ---------- */
let CONN_LOST = false;
function setConn(ok) {
  if (ok && CONN_LOST) {
    CONN_LOST = false;
    const b = $('#connBanner'); if (b) b.remove();
    toast('Связь восстановлена', null, true);
    render();
  } else if (!ok && !CONN_LOST) {
    CONN_LOST = true;
    document.body.appendChild(el(`<div id="connBanner" style="position:fixed;top:0;left:0;right:0;z-index:500;
      background:linear-gradient(90deg,#9A6700,#7a5200);color:#fff;font-size:12.5px;font-weight:550;
      text-align:center;padding:7px">Нет связи с сервером Lumen — переподключаюсь…</div>`));
  }
}

/* необработанная ошибка интерфейса — видна, а не молчит */
window.addEventListener('error', (e) => { try { toast('Ошибка интерфейса', String(e.message).slice(0, 120)); } catch (_) {} });

/* ---------- рендер осей квалификации ---------- */
const AXIS_NAMES = { purpose: 'Цель покупки', timeline: 'Срок', budget: 'Бюджет', type: 'Тип объекта' };
function axesHtml(lead) {
  return Object.keys(AXIS_NAMES).map(a => {
    const q = lead.quals[a];
    return `<div class="axis ${q ? 'done' : 'blank'}">
      <div class="ax-top"><span class="ax-name">${AXIS_NAMES[a]}</span>${q ? `<span class="badge ok" style="padding:1px 8px">${ic(I.check)}</span>` : ''}</div>
      <div class="ax-val">${q ? esc(q.value) : 'не выяснено — ИИ спросит'}</div>
      ${q && q.quote ? `<div class="ax-quote">«${esc(q.quote)}»</div>` : ''}
    </div>`;
  }).join('');
}
function scoreRing(v, size) {
  const r = 12, c = 2 * Math.PI * r;
  const col = v >= 80 ? 'var(--ok)' : v >= 40 ? 'var(--accent-2)' : 'var(--ink-3)';
  return `<div class="score-ring"><svg viewBox="0 0 30 30">
    <circle cx="15" cy="15" r="${r}" stroke="#E7ECF3" stroke-width="3" fill="none"/>
    <circle cx="15" cy="15" r="${r}" stroke="${col}" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="${c * v / 100} ${c}"/>
  </svg><span class="txt">${v}</span></div>`;
}

/* ============================================================ СТРАНИЦЫ */
const PAGES = {};

/* ---------------- ОБЗОР ---------------- */
PAGES.overview = async (root) => {
  const [an, events, leads] = await Promise.all([api.get('/analytics'), api.get('/events'), api.get('/leads')]);
  const f = an.funnel;
  const inDialog = f.dialog + f.touch;
  const feedIcon = (t) => ({ lead_new: I.plus, msg_in: I.chat, qualified: I.spark, handover: I.handover, deal: I.flame, wake: I.wake, touch: I.chain, optout: I.moon, sleep: I.moon, number: I.sim, qual: I.check, stage: I.arrow, send_skip: I.shield, meeting: I.cal, merge: I.copy }[t] || I.bolt);
  const feedCls = (t) => ({ deal: 'ok', qualified: 'ok', handover: 'ok', optout: 'warn', send_skip: 'warn', sleep: 'warn' }[t] || '');

  root.innerHTML = `
    <div class="kpis">
      <div class="kpi glass"><div class="lbl">${ic(I.plus)}Новые лиды</div><div class="val">${f.new + f.touch}</div><div class="delta">цепочка стартует ≤ 1 мин</div></div>
      <div class="kpi glass"><div class="lbl">${ic(I.chat)}В работе у ИИ</div><div class="val">${inDialog + f.dialog}</div><div class="delta">${f.dialog} в живом диалоге</div></div>
      <div class="kpi glass"><div class="lbl">${ic(I.spark)}Квалифицировано</div><div class="val">${f.qualified + f.handover + f.viewing + f.deal}</div><div class="delta">${f.deal} дошло до сделки</div></div>
      <div class="kpi glass"><div class="lbl">${ic(I.send)}Отправлено сегодня</div><div class="val">${an.wa.sentToday}</div><div class="delta">${an.wa.numbersActive} активных номеров · качество ${an.wa.avgQuality}%</div></div>
    </div>
    <div class="ov-grid">
      <div>
        <div class="glass card mb">
          <div class="card-title">${ic(I.funnel)}Воронка<span class="sub">${leads.length} лидов всего</span></div>
          ${STAGES.filter(s => !['lost'].includes(s.id)).map(s => {
            const v = f[s.id] || 0;
            const max = Math.max(...Object.values(f), 1);
            return `<div class="funnel-row"><div class="fl">${s.name}</div><div class="bar-wrap"><div class="bar" style="width:${Math.max(v / max * 100, 2)}%"></div></div><div class="fv">${v}</div></div>`;
          }).join('')}
        </div>
        <div class="glass card">
          <div class="card-title">${ic(I.bars)}Первая линия: человек против ИИ</div>
          <div class="vs">
            <div class="vs-col"><div class="hd">Ручная линия</div>
              <div class="vs-row"><span class="k">Первый контакт</span><span class="v">${an.compare.human.firstContact}</span></div>
              <div class="vs-row"><span class="k">Конверсия в диалог</span><span class="v">${an.compare.human.dialogConv}%</span></div>
              <div class="vs-row"><span class="k">Лид → квалификация</span><span class="v">${an.compare.human.qualConv}%</span></div>
              <div class="vs-row"><span class="k">Время квалификации</span><span class="v">${an.compare.human.qualTime}</span></div>
            </div>
            <div class="vs-col ai"><div class="hd">Lumen AI</div>
              <div class="vs-row"><span class="k">Первый контакт</span><span class="v">${an.compare.aiLine.firstContact}</span></div>
              <div class="vs-row"><span class="k">Конверсия в диалог</span><span class="v">${an.compare.aiLine.dialogConv}%</span></div>
              <div class="vs-row"><span class="k">Лид → квалификация</span><span class="v">${an.compare.aiLine.qualConv}%</span></div>
              <div class="vs-row"><span class="k">Время квалификации</span><span class="v">${an.compare.aiLine.qualTime}</span></div>
            </div>
          </div>
        </div>
      </div>
      <div class="glass card">
        <div class="card-title">${ic(I.bolt)}Живая лента<span class="sub">обновляется сама</span></div>
        <div class="feed">
          ${events.slice(0, 8).map(e => `<div class="feed-item"><div class="feed-dot ${feedCls(e.type)}">${ic(feedIcon(e.type))}</div><div><div class="feed-text">${esc(e.text)}</div><div class="feed-time">${ago(e.at)}</div></div></div>`).join('') || '<div class="empty">Событий пока нет</div>'}
        </div>
        ${events.length > 8 ? coll(`Раньше`, events.slice(8).map(e => `<div class="feed-item"><div class="feed-dot ${feedCls(e.type)}">${ic(feedIcon(e.type))}</div><div><div class="feed-text">${esc(e.text)}</div><div class="feed-time">${ago(e.at)}</div></div></div>`).join(''), { open: false, count: events.length - 8, icon: I.clock }) : ''}
      </div>
    </div>`;
};

/* ---------------- ВОРОНКА (канбан) ---------------- */
PAGES.funnel = async (root) => {
  const leads = await api.get('/leads' + (PAGE_STATE.funnelGeo ? '?geo=' + PAGE_STATE.funnelGeo : ''));
  const geos = STATE.settings.agency.geos;
  const dupes = await api.get('/duplicates');
  root.innerHTML = `
    <div class="filters">
      <select id="fGeo"><option value="">Все направления</option>${geos.map(g => `<option value="${g}" ${PAGE_STATE.funnelGeo === g ? 'selected' : ''}>${STATE.settings.geoNames[g]}</option>`).join('')}</select>
      <span class="muted" style="font-size:12px">${leads.length} лидов · карточки можно перетаскивать между стадиями</span>
      <span class="tb-spacer"></span>
      ${dupes.length ? `<button class="btn btn-sm" id="dupesBtn">${ic(I.copy)}Дубли: <b style="color:var(--bad)">&nbsp;${dupes.length}</b></button>` : `<span class="badge ok">${ic(I.check)}дублей нет</span>`}
    </div>
    <div class="kanban">
      ${STAGES.map(s => {
        const items = leads.filter(l => l.stage === s.id);
        return `<div class="kb-col" data-stage="${s.id}">
          <div class="kb-head"><span class="kb-ic">${ic(I[s.icon])}</span><span class="nm">${s.name}</span><span class="ct">${items.length}</span></div>
          <div class="kb-cards">
            ${items.map(l => `<div class="lead-card glass" data-id="${l.id}" data-stage="${l.stage}">
              <div class="top"><div class="nm">${esc(l.name)}</div>${scoreRing(l.score)}</div>
              <div class="geo">${l.geoName} · ${esc(l.phone)}</div>
              <div class="axes">${Object.keys(AXIS_NAMES).map(a => `<i class="${l.quals[a] ? 'on' : ''}"></i>`).join('')}</div>
              <div class="foot">
                ${l.ai && l.ai.enabled ? '<span class="mini-badge ai">ИИ ведёт</span>' : ''}
                ${l.brokerName ? `<span class="mini-badge ok">${esc(l.brokerName.split(' ')[0])}</span>` : ''}
                ${l.wakeScore != null ? `<span class="mini-badge warn">score ${l.wakeScore}</span>` : ''}
                <span class="tm">${ago(l.lastMsgAt || l.createdAt)}</span>
              </div>
            </div>`).join('') || '<div class="empty" style="padding:14px;font-size:11.5px">пусто</div>'}
          </div>
        </div>`;
      }).join('')}
    </div>`;
  $('#fGeo').addEventListener('change', (e) => { PAGE_STATE.funnelGeo = e.target.value; render(); });
  $$('.lead-card', root).forEach(c => c.addEventListener('click', () => { if (!DRAG.moved) openLeadModal(c.dataset.id); }));
  const db = $('#dupesBtn');
  if (db) db.addEventListener('click', () => openDupesModal(dupes));
  wireKanbanDrag(root);
};

/* ---------- канбан: перетаскивание на pointer-событиях (HTML5 DnD глючит) ---------- */
const DRAG = { moved: false, active: false };
function wireKanbanDrag(root) {
  const board = $('.kanban', root);
  if (!board) return;
  board.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('.lead-card');
    if (!card || e.button !== 0) return;
    const startX = e.clientX, startY = e.clientY;
    let ghost = null;
    DRAG.moved = false;
    DRAG.active = true;

    const onMove = (ev) => {
      if (!ghost && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 7) return;
      if (!ghost) {
        DRAG.moved = true;
        const r = card.getBoundingClientRect();
        ghost = card.cloneNode(true);
        ghost.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;z-index:400;pointer-events:none;opacity:.92;transform:rotate(2deg);box-shadow:var(--shadow-lift)`;
        ghost.dataset.ox = ev.clientX - r.left;
        ghost.dataset.oy = ev.clientY - r.top;
        document.body.appendChild(ghost);
        card.style.opacity = '.35';
      }
      ghost.style.left = (ev.clientX - ghost.dataset.ox) + 'px';
      ghost.style.top = (ev.clientY - ghost.dataset.oy) + 'px';
      $$('.kb-col', board).forEach(c => c.classList.remove('drop'));
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const col = under && under.closest('.kb-col');
      if (col) col.classList.add('drop');
    };
    const onUp = async (ev) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (!ghost) return;
      ghost.remove();
      card.style.opacity = '';
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const col = under && under.closest('.kb-col');
      $$('.kb-col', board).forEach(c => c.classList.remove('drop'));
      if (col && col.dataset.stage && col.dataset.stage !== card.dataset.stage) {
        await api.patch('/leads/' + card.dataset.id, { stage: col.dataset.stage });
        render();
      }
      setTimeout(() => { DRAG.moved = false; DRAG.active = false; }, 50);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });
}

/* ---------- дубли ---------- */
function openDupesModal(groups) {
  modal({
    title: 'Дубли лидов',
    sub: 'Один номер телефона — несколько карточек. При объединении переписка и оси квалификации переносятся в основную (самую раннюю) карточку.',
    wide: true,
    body: groups.map((g, gi) => `
      <div style="border:1px solid var(--stroke);border-radius:12px;padding:13px 14px;margin-bottom:11px">
        <div style="font-size:12px;color:var(--ink-3);margin-bottom:8px">${esc(g[0].phone)}</div>
        ${g.map((l, i) => `<div style="display:flex;align-items:center;gap:9px;padding:5px 0">
          <b style="font-size:13px">${esc(l.name)}</b>
          <span class="badge">${stageName(l.stage)}</span>
          <span class="muted" style="font-size:11px">${l.geoName} · создан ${ago(l.createdAt)}</span>
          ${i === 0 ? '<span class="badge ok">останется</span>' : ''}
        </div>`).join('')}
        <button class="btn btn-sm btn-accent" data-merge="${gi}" style="margin-top:8px">${ic(I.copy)}Объединить</button>
      </div>`).join(''),
    actions: [{ label: 'Закрыть' }],
  });
  $$('.modal [data-merge]').forEach(b => b.addEventListener('click', async () => {
    const g = groups[+b.dataset.merge];
    await api.post('/duplicates/merge', { keepId: g[0].id, mergeIds: g.slice(1).map(x => x.id) });
    closeModal();
    render();
  }));
}

/* ---------- встречи ---------- */
PAGES.meetings = async (root) => {
  const list = await api.get('/meetings');
  const kindRu = { call: 'Созвон', video: 'Видео-показ', tour: 'Показ объекта' };
  const stBadge = { scheduled: '<span class="badge acc">назначена</span>', done: '<span class="badge ok">прошла</span>', no_show: '<span class="badge bad">не пришёл</span>', canceled: '<span class="badge">отменена</span>' };
  const byDay = {};
  for (const mt of list) {
    const d = new Date(mt.at).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
    (byDay[d] = byDay[d] || []).push(mt);
  }
  root.innerHTML = `
    <div class="two-col">
      <div>
        ${Object.keys(byDay).length ? Object.entries(byDay).map(([day, items], di) => coll(day, items.map(mt => `<div class="glass" style="padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;gap:13px">
            <div style="font-size:15px;font-weight:700;color:var(--navy-900);min-width:48px">${tmm(mt.at)}</div>
            <div style="flex:1">
              <div style="font-size:13.5px;font-weight:650;color:var(--navy-900)">${esc(mt.leadName)} <span class="muted" style="font-weight:400">· ${kindRu[mt.kind] || mt.kind}</span></div>
              <div class="muted" style="font-size:11.5px;margin-top:2px">эксперт: ${esc(mt.brokerName)}${mt.note ? ' · ' + esc(mt.note) : ''}</div>
            </div>
            ${stBadge[mt.status] || ''}
            ${mt.status === 'scheduled' ? `<button class="btn btn-sm" data-mt="${mt.id}" data-st="done">Прошла</button>
            <button class="btn btn-sm btn-danger" data-mt="${mt.id}" data-st="no_show">Не пришёл</button>` : ''}
          </div>`).join(''), { open: di < 3, count: items.length, icon: I.cal })).join('') : '<div class="glass card empty">Встреч пока нет — назначайте из карточки лида в «Диалогах»</div>'}
      </div>
      <div class="glass card" style="align-self:start">
        <div class="card-title">${ic(I.cal)}Как работают встречи</div>
        ${[['Слот из диалога', 'ИИ довёл до квалификации → в панели лида кнопка «Назначить встречу»: слот, тип, эксперт'],
           ['WhatsApp-подтверждение', 'Клиенту сразу уходит подтверждение со временем и именем эксперта — тем же каналом, где шёл диалог'],
           ['Перенос словами', 'Клиент пишет «давайте позже» — диалог живой, менеджер двигает слот в один клик'],
           ['Не пришёл — не потерян', 'Статус «не пришёл» возвращает лида в работу первой линии, а не в архив']]
          .map(([t, d]) => `<div class="set-row"><div class="sp"><div class="sl">${t}</div><div class="sd">${d}</div></div></div>`).join('')}
      </div>
    </div>`;
  $$('[data-mt]', root).forEach(b => b.addEventListener('click', async () => {
    await api.patch('/meetings/' + b.dataset.mt, { status: b.dataset.st });
    render();
  }));
};

function openMeetingModal(lead, after) {
  const brokers = STATE.brokers.filter(b => b.geo === lead.geo).concat(STATE.brokers.filter(b => b.geo !== lead.geo));
  /* локальные компоненты, не toISOString — UTC-сдвиг даёт «вчера» ночью */
  const tomorrow = new Date(Date.now() + 24 * 3600e3);
  const defDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  modal({
    title: 'Назначить встречу',
    sub: `${esc(lead.name)} · ${lead.geoName}. Клиент получит WhatsApp-подтверждение сразу после назначения.`,
    body: `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-row"><label>Дата</label><input id="mtDate" type="date" value="${defDate}"></div>
        <div class="form-row"><label>Время</label><input id="mtTime" type="time" value="11:00"></div>
      </div>
      <div class="form-row"><label>Тип</label><select id="mtKind">
        <option value="call">Созвон</option><option value="video">Видео-показ</option><option value="tour">Показ объекта</option>
      </select></div>
      <div class="form-row"><label>Эксперт</label><select id="mtBroker">${brokers.map(b => `<option value="${b.id}">${esc(b.name)} · ${STATE.settings.geoNames[b.geo]}</option>`).join('')}</select></div>
      <div class="form-row"><label>Заметка (видна только команде)</label><input id="mtNote" placeholder="например: подготовить 3 варианта под $172k"></div>`,
    actions: [
      { label: 'Назначить и подтвердить в WA', cls: 'btn-accent', onClick: async (bd) => {
        const at = new Date($('#mtDate', bd).value + 'T' + $('#mtTime', bd).value).getTime();
        await api.post('/meetings', { leadId: lead.id, brokerId: $('#mtBroker', bd).value, kind: $('#mtKind', bd).value, at, note: $('#mtNote', bd).value });
        toast('Встреча назначена', 'Подтверждение отправлено клиенту', true);
        if (after) after();
      } },
      { label: 'Отмена' },
    ],
  });
}

/* ============================================================
   Полная карточка лида: хронология (переписка+события+заметки),
   комментарии, доп-контакты, встречи с видео-ссылкой
   ============================================================ */
async function openLeadModal(id) {
  const l = await api.get('/leads/' + id);
  const axName = { purpose: 'Цель', timeline: 'Срок', budget: 'Бюджет', type: 'Объект' };
  const kindRu = { call: 'Созвон', video: 'Видео-показ', tour: 'Показ' };
  const contactKinds = { telegram: 'Telegram', email: 'E-mail', instagram: 'Instagram', whatsapp: 'WhatsApp #2', other: 'Другое' };

  /* единая хронология: сообщения + события + заметки + встречи */
  const timeline = [
    ...(l.messages || []).map(m => ({ at: m.at, kind: 'msg', m })),
    ...(l.events || []).map(e => ({ at: e.at, kind: 'ev', e })),
    ...(l.notes || []).map(n => ({ at: n.at, kind: 'note', n })),
    ...(l.meetings || []).map(mt => ({ at: mt.createdAt, kind: 'meet', mt })),
  ].sort((a, b) => b.at - a.at);

  const tlItem = (t) => {
    if (t.kind === 'msg') return `<div class="tl-item" data-f="msg"><div class="tl-dot ${t.m.dir === 'in' ? 'in' : 'out'}">${ic(I.chat)}</div>
      <div class="tl-body"><div class="tl-head"><b>${t.m.dir === 'in' ? esc(l.name.split(' ')[0]) : ({ ai: 'Lumen AI', chain: 'Цепочка', wake: 'Реанимация', human: 'Менеджер' }[t.m.via] || 'Мы')}</b><span>${tmm(t.at)} · ${new Date(t.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span></div>
      <div class="tl-text">${esc(t.m.text)}</div></div></div>`;
    if (t.kind === 'ev') return `<div class="tl-item" data-f="ev"><div class="tl-dot ev">${ic(I.bolt)}</div>
      <div class="tl-body"><div class="tl-text muted">${esc(t.e.text)}</div><div class="tl-head"><span>${ago(t.at)}</span></div></div></div>`;
    if (t.kind === 'note') return `<div class="tl-item" data-f="note"><div class="tl-dot note">${ic(I.edit || I.doc)}</div>
      <div class="tl-body tl-note"><div class="tl-text">${esc(t.n.text)}</div><div class="tl-head"><span>комментарий · ${ago(t.at)}</span></div></div></div>`;
    if (t.kind === 'meet') return `<div class="tl-item" data-f="ev"><div class="tl-dot meet">${ic(I.cal)}</div>
      <div class="tl-body"><div class="tl-text">${kindRu[t.mt.kind] || 'Встреча'} с ${esc(t.mt.brokerName)} · ${new Date(t.mt.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${t.mt.link ? ` · <a class="link" href="${t.mt.link}" target="_blank">видео-комната</a>` : ''}</div>
      <div class="tl-head"><span>${{ scheduled: 'назначена', done: 'прошла', no_show: 'не пришёл', canceled: 'отменена' }[t.mt.status]}</span></div></div></div>`;
    return '';
  };

  const bd = modal({
    title: l.name,
    sub: `<span class="lp-phone" id="lcPhone" title="Скопировать">${esc(l.phone)}</span> · ${l.geoName} · источник: ${l.source} · создан ${ago(l.createdAt)}`,
    wide: 'card',
    body: `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        <span class="badge acc">${stageName(l.stage)}</span>
        ${l.ai.enabled ? '<span class="badge violet">ИИ ведёт диалог</span>' : ''}
        ${l.brokerName ? `<span class="badge ok">брокер: ${esc(l.brokerName)}</span>` : ''}
        ${(l.tags || []).map(t => `<span class="badge">${esc(t)}</span>`).join('')}
      </div>
      <div class="lc-grid">
        <div class="lc-left">
          <div class="lc-note-row">
            <input id="lcNote" placeholder="Комментарий по лиду… (Enter — сохранить)">
            <button class="btn btn-accent btn-sm" id="lcNoteAdd">${ic(I.plus)}</button>
          </div>
          <div class="lc-filters">
            <button class="btn btn-sm lc-f active" data-f="all">Всё</button>
            <button class="btn btn-sm lc-f" data-f="msg">Переписка</button>
            <button class="btn btn-sm lc-f" data-f="note">Комментарии</button>
            <button class="btn btn-sm lc-f" data-f="ev">События</button>
          </div>
          <div class="lc-timeline" id="lcTimeline">${timeline.map(tlItem).join('') || '<div class="empty">Хронология пуста</div>'}</div>
        </div>
        <div class="lc-right">
          <div class="lp-sec" style="margin-top:0">Стадия</div>
          <select id="mStage" style="width:100%">${STAGES.map(s => `<option value="${s.id}" ${l.stage === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}</select>
          ${l.ads && l.ads.adId ? `<div class="lp-ad" style="margin-top:12px">${ic(I.target)}${l.ads.matched ? esc(l.ads.adName) : 'ad_id ' + esc(l.ads.adId)}</div>` : ''}
          <div class="lp-sec">Квалификация · ${l.axesFilled}/4</div>
          <div class="axr-list">${Object.keys(axName).map(a => { const q = l.quals[a]; return `<div class="axr ${q ? 'done' : ''}"><span class="axr-k">${axName[a]}</span><span class="axr-v">${q ? esc(q.value) : '—'}</span>${q ? `<span class="axr-ok">${ic(I.check)}</span>` : ''}</div>`; }).join('')}</div>
          ${l.summary ? `<div class="lp-sec">Саммари</div><div class="summary-box">${esc(l.summary)}</div>` : ''}
          <div class="lp-sec">Контакты</div>
          <div id="lcContacts">${(l.contacts || []).map((c, i) => `<div class="lc-contact"><span class="badge">${contactKinds[c.kind] || c.kind}</span><span class="lc-cv">${esc(c.value)}</span><button class="btn-ghost lc-cx" data-i="${i}">${ic(I.x)}</button></div>`).join('')}</div>
          <div class="lc-note-row" style="margin-top:7px">
            <select id="lcCKind" style="width:118px;flex:0 0 118px">${Object.entries(contactKinds).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
            <input id="lcCVal" placeholder="@ник / почта…">
            <button class="btn btn-sm" id="lcCAdd">${ic(I.plus)}</button>
          </div>
          <div class="lp-sec">Встречи</div>
          ${(l.meetings || []).map(mt => `<div class="lc-meet"><b>${new Date(mt.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</b> · ${kindRu[mt.kind]}${mt.link ? ` · <a class="link" href="${mt.link}" target="_blank">комната</a> <button class="btn-ghost lc-copy" data-link="${mt.link}" title="Скопировать ссылку">${ic(I.copy)}</button>` : ''}</div>`).join('') || '<div class="muted" style="font-size:12px">Встреч нет</div>'}
        </div>
      </div>`,
    actions: [
      { label: 'Открыть диалог', cls: 'btn-accent', onClick: () => { PAGE_STATE.inboxLead = l.id; go('inbox'); } },
      { label: 'Назначить встречу', onClick: () => { openMeetingModal(l, () => openLeadModal(id)); return false; } },
      { label: 'Закрыть' },
    ],
  });

  $('#lcPhone', bd).addEventListener('click', () => { navigator.clipboard.writeText(l.phone); toast('Телефон скопирован', null, true); });
  $('#mStage', bd).addEventListener('change', async (e) => { await api.patch('/leads/' + l.id, { stage: e.target.value }); if (['funnel', 'overview'].includes(CUR)) render(); });
  const addNote = async () => {
    const t = $('#lcNote', bd).value.trim();
    if (!t) return;
    await api.post(`/leads/${id}/note`, { text: t });
    openLeadModal(id);
  };
  $('#lcNoteAdd', bd).addEventListener('click', addNote);
  $('#lcNote', bd).addEventListener('keydown', (e) => { if (e.key === 'Enter') addNote(); });
  const saveContacts = async (contacts) => { await api.post(`/leads/${id}/contacts`, { contacts }); openLeadModal(id); };
  $('#lcCAdd', bd).addEventListener('click', () => {
    const v = $('#lcCVal', bd).value.trim();
    if (!v) return;
    saveContacts([...(l.contacts || []), { kind: $('#lcCKind', bd).value, value: v }]);
  });
  $$('.lc-cx', bd).forEach(b => b.addEventListener('click', () => saveContacts((l.contacts || []).filter((_, i) => i !== +b.dataset.i))));
  $$('.lc-copy', bd).forEach(b => b.addEventListener('click', () => { navigator.clipboard.writeText(b.dataset.link); toast('Ссылка на комнату скопирована', null, true); }));
  $$('.lc-f', bd).forEach(f => f.addEventListener('click', () => {
    $$('.lc-f', bd).forEach(x => x.classList.remove('active'));
    f.classList.add('active');
    $$('#lcTimeline .tl-item', bd).forEach(it => { it.style.display = f.dataset.f === 'all' || it.dataset.f === f.dataset.f ? '' : 'none'; });
  }));
}

/* ---------------- ДИАЛОГИ ---------------- */
PAGES.inbox = async (root) => {
  root.innerHTML = `<div class="inbox">
    <div class="glass conv-list" id="convList"></div>
    <div class="glass chat" id="chatPane"><div class="chat-empty">Выберите диалог слева</div></div>
    <div class="glass lead-panel" id="leadPanel"><div class="empty">Данные лида появятся здесь</div></div>
  </div>`;
  await refreshInbox(true);
};
PAGES.inbox.refresh = () => refreshInbox(false);

async function refreshInbox(first) {
  if (CUR !== 'inbox') return;
  const leads = (await api.get('/leads')).filter(l => l.lastText || l.stage !== 'lost');
  const list = $('#convList');
  if (!list) return;
  if (!PAGE_STATE.inboxLead && leads.length) PAGE_STATE.inboxLead = leads[0].id;
  list.innerHTML = leads.map(l => `
    <div class="conv ${l.id === PAGE_STATE.inboxLead ? 'active' : ''}" data-id="${l.id}">
      <div class="ava">${esc(l.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase())}</div>
      <div class="meta"><div class="nm">${esc(l.name)}</div><div class="prev">${esc(l.lastText || 'нет сообщений')}</div></div>
      <div class="tm">${l.lastMsgAt ? tmm(l.lastMsgAt) : ''}</div>
      ${l.lastDir === 'in' ? '<div class="unread"></div>' : ''}
    </div>`).join('');
  $$('.conv', list).forEach(c => c.addEventListener('click', () => { PAGE_STATE.inboxLead = c.dataset.id; refreshInbox(true); }));
  if (PAGE_STATE.inboxLead) await renderChat(PAGE_STATE.inboxLead, first);
}

async function renderChat(id, rebuild) {
  const l = await api.get('/leads/' + id);
  const pane = $('#chatPane');
  if (!pane) return;
  const draft = $('#composerText') ? $('#composerText').value : '';
  const viaName = { ai: 'Lumen AI', chain: 'Цепочка', wake: 'Реанимация', human: 'Менеджер', template: 'Шаблон' };
  let lastDay = '';
  const lastMsg = (l.messages || []).slice(-1)[0];
  const isNewMsg = lastMsg && PAGE_STATE['lm_' + l.id] && PAGE_STATE['lm_' + l.id] !== lastMsg.id;
  if (lastMsg) PAGE_STATE['lm_' + l.id] = lastMsg.id;
  const msgs = (l.messages || []).map((m, i, arr) => {
    const day = new Date(m.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    const sep = day !== lastDay ? `<div class="day-sep">${day}</div>` : '';
    lastDay = day;
    return sep + `<div class="bubble ${m.dir}${isNewMsg && i === arr.length - 1 ? ' new' : ''}">
      ${esc(m.text)}
      <div class="bmeta">${m.dir === 'out' && m.via ? `<span class="via-tag">${viaName[m.via] || m.via}</span>` : ''}<span>${tmm(m.at)}</span>${m.dir === 'out' ? `<span>${m.status === 'read' ? '✓✓' : m.status === 'delivered' ? '✓✓' : '✓'}</span>` : ''}</div>
    </div>`;
  }).join('');
  /* «ИИ печатает» — клиент написал, автопилот готовит ответ */
  const typing = l.lastDir === 'in' && l.ai.enabled && STATE.settings.ai.autopilot
    && !['handover', 'viewing', 'deal', 'lost'].includes(l.stage)
    ? '<div class="bubble in typing"><span class="tdot"></span><span class="tdot"></span><span class="tdot"></span></div>' : '';

  pane.innerHTML = `
    <div class="chat-head">
      <div class="ava">${esc(l.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase())}</div>
      <div><div class="nm">${esc(l.name)}</div><div class="ph">${esc(l.phone)} · ${l.geoName}</div></div>
      <div class="tb-spacer"></div>
      <span class="badge ${l.ai.enabled ? 'violet' : ''}">${l.ai.enabled ? 'ИИ ведёт' : 'ИИ выключен'}</span>
      <span class="badge acc">${stageName(l.stage)}</span>
    </div>
    <div class="chat-body" id="chatBody">${(msgs + typing) || '<div class="chat-empty">Сообщений пока нет — цепочка сделает первое касание сама</div>'}</div>
    <div class="composer">
      <textarea id="composerText" placeholder="Написать от имени менеджера… (перехват у ИИ)"></textarea>
      <button class="btn btn-accent" id="sendBtn">${ic(I.send)}</button>
    </div>`;
  $('#composerText').value = draft;
  const body = $('#chatBody');
  body.scrollTop = body.scrollHeight;
  $('#sendBtn').addEventListener('click', async () => {
    const t = $('#composerText').value.trim();
    if (!t) return;
    $('#composerText').value = '';
    await api.post(`/leads/${id}/message`, { text: t });
    renderChat(id, false);
  });
  $('#composerText').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#sendBtn').click(); } // Shift+Enter — перенос строки
  });

  const panel = $('#leadPanel');
  /* карточка «для ленивых»: одно главное действие по контексту, всё остальное — в один клик */
  const primary = l.stage === 'qualified'
    ? `<button class="btn btn-accent lp-primary" id="handoverBtn">${ic(I.handover)}Передать брокеру</button>`
    : ['handover', 'viewing'].includes(l.stage)
      ? `<button class="btn btn-accent lp-primary" id="meetBtn">${ic(I.cal)}Назначить встречу</button>`
      : l.stage === 'deal'
        ? `<div class="badge ok lp-primary" style="justify-content:center">${ic(I.flame)}Сделка закрыта</div>`
        : `<div class="lp-ai-state">${ic(I.spark)}<div><b>ИИ ведёт диалог</b><span>${4 - l.axesFilled ? `осталось выяснить: ${4 - l.axesFilled} из 4` : 'готовит передачу'}</span></div></div>`;
  const axName = { purpose: 'Цель', timeline: 'Срок', budget: 'Бюджет', type: 'Объект' };
  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:11px">
      <div style="flex:1;min-width:0"><div class="lp-name">${esc(l.name)}</div>
      <div class="lp-sub" style="margin-bottom:0"><span class="lp-phone" id="copyPhone" title="Скопировать">${esc(l.phone)}</span> · ${l.geoName}</div></div>
      ${scoreRing(l.score)}
    </div>
    ${l.ads && l.ads.adId ? `<div class="lp-ad">${ic(I.target)}${l.ads.matched ? esc(l.ads.adName) + (l.ads.campaignName ? ` <span>· ${esc(l.ads.campaignName)}</span>` : '') : `ad_id ${esc(l.ads.adId)} <span>· не в базе объявлений</span>`}</div>` : ''}
    <div style="margin:14px 0 10px">${primary}</div>
    <div class="lp-quick">
      <a class="btn btn-sm" href="https://wa.me/${l.phone.replace(/\D/g, '')}" target="_blank" title="Открыть в WhatsApp">${ic(I.chat)}WA</a>
      ${!['handover', 'viewing', 'deal'].includes(l.stage) ? `<button class="btn btn-sm" id="meetBtn" title="Назначить встречу">${ic(I.cal)}</button>` : ''}
      ${l.stage === 'qualified' ? '' : !['deal'].includes(l.stage) && l.axesFilled === 4 ? `<button class="btn btn-sm" id="handoverBtn">${ic(I.handover)}</button>` : ''}
      ${STATE.settings.demo.simulateReplies ? `<button class="btn btn-sm" id="simBtn" title="Демо: ответ клиента">${ic(I.bolt)}</button>` : ''}
      <button class="btn btn-sm btn-ghost" id="reScreenBtn" title="Перечитать переписку">${ic(I.eye)}</button>
      <span class="tb-spacer"></span>
      <label class="switch" title="Автопилот ИИ"><input type="checkbox" id="aiToggle" ${l.ai.enabled ? 'checked' : ''}><span class="tr"></span><span class="th"></span></label>
    </div>
    <div class="lp-sec">Квалификация · ${l.axesFilled}/4</div>
    <div class="axr-list">
      ${Object.keys(axName).map(a => { const q = l.quals[a]; return `<div class="axr ${q ? 'done' : ''}">
        <span class="axr-k">${axName[a]}</span>
        <span class="axr-v">${q ? esc(q.value) : '—'}</span>
        ${q ? `<span class="axr-ok">${ic(I.check)}</span>` : ''}
      </div>`; }).join('')}
    </div>
    ${Object.values(l.quals).some(q => q && q.quote) ? coll('Цитаты клиента', Object.keys(axName).map(a => { const q = l.quals[a]; return q && q.quote ? `<div class="axis done" style="margin-top:8px"><div class="ax-name" style="font-size:10.5px;color:var(--ink-3);font-weight:600">${axName[a]}</div><div class="ax-quote">«${esc(q.quote)}»</div></div>` : ''; }).join(''), { open: false, icon: I.chat }) : ''}
    ${l.summary ? `<div class="lp-sec">Саммари для брокера</div><div class="summary-box">${esc(l.summary)}</div>` : ''}
    ${l.brokerName ? `<div class="badge ok" style="margin-top:12px">${ic(I.check)}У брокера: ${esc(l.brokerName)}</div>` : ''}`;
  const cp = $('#copyPhone');
  if (cp) cp.addEventListener('click', () => { navigator.clipboard.writeText(l.phone); toast('Телефон скопирован', null, true); });
  $('#aiToggle').addEventListener('change', async (e) => { await api.patch('/leads/' + id, { ai: { enabled: e.target.checked } }); });
  const hb = $('#handoverBtn');
  if (hb) hb.addEventListener('click', async () => { await api.post(`/leads/${id}/handover`); toast('Лид передан брокеру', 'Саммари и слот отправлены', true); renderChat(id, true); });
  $('#meetBtn').addEventListener('click', () => openMeetingModal(l, () => renderChat(id, true)));
  const sb = $('#simBtn');
  if (sb) sb.addEventListener('click', async () => {
    const pool = ['Рассматриваю как инвестицию, под сдачу', 'Бюджет до 200 тысяч долларов', 'Смотрим виллу с 2 спальнями', 'Готов в течение пары месяцев', 'А что по ценам сейчас?'];
    await api.post(`/leads/${id}/inbound`, { text: pool[Math.floor(Math.random() * pool.length)] });
    renderChat(id, false);
  });
  $('#reScreenBtn').addEventListener('click', async () => { await api.post(`/leads/${id}/analyze`); renderChat(id, false); });
}

/* ---------------- ИИ-КВАЛИФИКАТОР ---------------- */
PAGES.qualifier = async (root) => {
  const s = STATE.settings;
  root.innerHTML = `
    <div class="two-col">
      <div>
        <div class="glass card mb">
          <div class="card-title">${ic(I.spark)}Автопилот первой линии</div>
          <div class="set-row">
            <div class="sp"><div class="sl">ИИ отвечает сам</div><div class="sd">Первый контакт ≤ 1 минуты, квалификация по 4 осям: цель · срок · бюджет · тип. Стадии двигаются только по фактам из сообщений клиента.</div></div>
            <label class="switch"><input type="checkbox" id="autopilot" ${s.ai.autopilot ? 'checked' : ''}><span class="tr"></span><span class="th"></span></label>
          </div>
          <div class="set-row">
            <div class="sp"><div class="sl">Стоп-слова (opt-out)</div><div class="sd">Любое из слов в сообщении клиента мгновенно отключает ИИ и закрывает лида</div></div>
          </div>
          <input id="stopWords" style="width:100%" value="${esc((s.stopWords || []).join(', '))}">
        </div>
        <div class="glass card">
          <div class="card-title">${ic(I.shield)}Как ИИ ведёт диалог</div>
          ${[['1', 'Мгновенный ответ', 'Заявка из Meta Lead Form / CTWA → первое сообщение за секунды, пока лид горячий'],
             ['2', 'Одна ось за раз', 'Никаких анкет: короткие человеческие вопросы — цель, бюджет, тип, срок'],
             ['3', 'Down-sell вместо отказа', 'Бюджет ниже порога — ИИ предлагает альтернативу из настроек направления, лид не теряется'],
             ['4', 'Передача с саммари', '4 оси закрыты → брокер получает выжимку с цитатами клиента и слот созвона'],
             ['5', 'Молчун → цепочка → реанимация', 'Нет ответа — работает цепочка касаний; исчерпана — лид уходит в «Спящие» под кампании']]
            .map(([n, t, d]) => `<div class="set-row"><div class="seq-day" style="align-self:flex-start">${n}</div><div class="sp"><div class="sl">${t}</div><div class="sd">${d}</div></div></div>`).join('')}
        </div>
      </div>
      <div class="glass card">
        <div class="card-title">${ic(I.gear)}Критерии по направлениям<span class="sub">порог бюджета и down-sell</span></div>
        ${Object.keys(s.criteria).map((g, i) => {
          const c = s.criteria[g];
          return coll(`${s.geoNames[g]} <span class="badge" style="margin-left:6px">${c.currency}</span>`, `
            <div class="form-row" style="margin-top:10px"><label>Минимальный бюджет (${c.currency})</label><input data-crit="${g}" data-k="budgetMin" type="number" value="${c.budgetMin}"></div>
            <div class="form-row"><label>Down-sell при бюджете ниже порога</label><textarea data-crit="${g}" data-k="downsell">${esc(c.downsell)}</textarea></div>
            <div class="form-row"><label>Заметки регламента</label><input data-crit="${g}" data-k="notes" value="${esc(c.notes)}"></div>`,
            { open: i === 0, icon: I.gear });
        }).join('')}
        <button class="btn btn-accent" id="saveCrit" style="width:100%;justify-content:center">Сохранить критерии</button>
      </div>
    </div>`;
  $('#autopilot').addEventListener('change', async (e) => { await api.patch('/settings', { ai: { autopilot: e.target.checked } }); toast(e.target.checked ? 'Автопилот включён' : 'Автопилот выключен', null, true); loadState(); });
  $('#saveCrit').addEventListener('click', async () => {
    const criteria = {};
    $$('[data-crit]', root).forEach(inp => {
      const g = inp.dataset.crit; criteria[g] = criteria[g] || {};
      criteria[g][inp.dataset.k] = inp.type === 'number' ? +inp.value : inp.value;
    });
    const stopWords = $('#stopWords').value.split(',').map(x => x.trim()).filter(Boolean);
    await api.patch('/settings', { criteria, stopWords });
    toast('Критерии сохранены', 'ИИ будет использовать их со следующего сообщения', true);
    loadState();
  });
};

/* ---------------- ЦЕПОЧКИ ---------------- */
PAGES.sequences = async (root) => {
  const seq = STATE.sequences[0];
  const tplName = (id) => (STATE.templates.find(t => t.id === id) || {}).name || 'ИИ-текст';
  root.innerHTML = `
    <div class="two-col">
      <div class="glass card">
        <div class="card-title">${ic(I.chain)}${esc(seq.name)}<span class="sub">выкл. шаг — пропускается</span></div>
        <div class="seq">
          ${seq.steps.map((st, i) => `
            <div class="seq-step ${st.active ? '' : 'off'}">
              <span class="seq-day">день ${st.day}</span>
              <div style="flex:1"><div class="st-name">${esc(st.label)}</div>
                <div class="st-desc">${st.channel === 'voice' ? '🎙 голосовое · ' : ''}${st.mode === 'template' ? 'шаблон: ' + esc(tplName(st.templateId)) : 'ИИ-текст: ' + esc(st.prompt || '')}</div></div>
              <label class="switch"><input type="checkbox" data-step="${i}" ${st.active ? 'checked' : ''}><span class="tr"></span><span class="th"></span></label>
            </div>`).join('')}
        </div>
      </div>
      <div>
        <div class="glass card mb">
          <div class="card-title">${ic(I.shield)}Правила гигиены цепочки</div>
          ${[['Ответил — цепочка стоит', 'Как только клиент написал, работает живой диалог квалификатора, а не рассылка'],
             ['Не больше одного касания в день', 'Интервалы растут: 0 → 1 → 3 → 6 → 9 → 13 → 18'],
             ['Вариативные тексты', 'ИИ перефразирует каждое касание — никаких одинаковых сообщений на пуле номеров'],
             ['Исчерпана — в «Спящие»', 'После последнего касания лид не удаляется: его подхватит скоринг реанимации'],
             ['Стоп-слово — мгновенный выход', 'Opt-out обрывает цепочку и закрывает лида корректно']]
            .map(([t, d]) => `<div class="set-row"><div class="sp"><div class="sl">${t}</div><div class="sd">${d}</div></div></div>`).join('')}
        </div>
        <div class="glass card">
          <div class="card-title">${ic(I.clock)}Как это выглядит для молчуна</div>
          <div class="feed">
            ${seq.steps.filter(s => s.active).map((st) => `<div class="feed-item"><div class="feed-dot">${ic(st.channel === 'voice' ? I.phone : I.chat)}</div><div><div class="feed-text"><b>День ${st.day}.</b> ${esc(st.label)}</div></div></div>`).join('')}
            <div class="feed-item"><div class="feed-dot warn">${ic(I.moon)}</div><div><div class="feed-text"><b>После.</b> Лид уходит в «Спящие» — вернётся через кампании реанимации</div></div></div>
          </div>
        </div>
      </div>
    </div>`;
  $$('[data-step]', root).forEach(sw => sw.addEventListener('change', async () => {
    seq.steps[+sw.dataset.step].active = sw.checked;
    await api.patch('/sequences/' + seq.id, { steps: seq.steps });
  }));
};

/* ---------------- РЕАНИМАЦИЯ ---------------- */
PAGES.wake = async (root) => {
  const [preview, campaigns] = await Promise.all([api.get('/wake/preview'), api.get('/campaigns')]);
  PAGE_STATE.wakePreview = preview;
  const segs = { A: preview.filter(p => p.segment === 'A'), B: preview.filter(p => p.segment === 'B'), C: preview.filter(p => p.segment === 'C') };
  root.innerHTML = `
    <div class="seg-grid">
      <div class="seg a glass"><div class="sg-hd">${ic(I.flame)}Сегмент A — будить первыми</div><div class="sg-num">${segs.A.length}</div><div class="sg-sub">score ≥ 55: свежие, вовлечённые, писали сами</div></div>
      <div class="seg b glass"><div class="sg-hd">${ic(I.clock)}Сегмент B — вторая волна</div><div class="sg-num">${segs.B.length}</div><div class="sg-sub">score 30–54: были в диалоге, остыли</div></div>
      <div class="seg c glass"><div class="sg-hd">${ic(I.moon)}Сегмент C — фон</div><div class="sg-num">${segs.C.length}</div><div class="sg-sub">score &lt; 30: холодные, редкими волнами</div></div>
    </div>
    <div class="two-col">
      <div class="glass card">
        <div class="card-title">${ic(I.wake)}Скоринг спящих<span class="sub">кого разбудить сначала</span></div>
        ${(() => {
          const row = (p) => `<tr><td><b>${esc(p.name)}</b><div class="muted" style="font-size:11px">${esc(p.note || '')}</div></td><td>${STATE.settings.geoNames[p.geo] || p.geo}</td><td>${ago(p.lastMsgAt)}</td>
            <td><span class="wake-score"><span class="wake-bar"><i style="width:${p.wakeScore}%"></i></span>${p.wakeScore}</span></td></tr>`;
          const head = '<thead><tr><th>Лид</th><th>Гео</th><th>Молчит</th><th>Score</th></tr></thead>';
          if (!preview.length) return '<div class="empty">Спящих нет</div>';
          const top = preview.slice(0, 6), rest = preview.slice(6);
          return `<table class="tbl">${head}<tbody>${top.map(row).join('')}</tbody></table>
            ${rest.length ? coll('Остальные', `<table class="tbl"><tbody>${rest.map(row).join('')}</tbody></table>`, { open: false, count: rest.length, icon: I.moon }) : ''}`;
        })()}
      </div>
      <div>
        <div style="display:flex;justify-content:flex-end;margin-bottom:12px"><button class="btn btn-accent" id="newCmp">${ic(I.plus)}Новая кампания</button></div>
        <div id="cmpList">${campaigns.map(cmpCard).join('') || '<div class="glass card empty">Кампаний ещё нет</div>'}</div>
      </div>
    </div>`;
  $('#newCmp').addEventListener('click', newCampaignModal);
  wireCampaigns(root);
};
PAGES.wake.refresh = async () => {
  const list = $('#cmpList');
  if (!list) return;
  const campaigns = await api.get('/campaigns');
  list.innerHTML = campaigns.map(cmpCard).join('') || '<div class="glass card empty">Кампаний ещё нет</div>';
  wireCampaigns(list);
};

function cmpCard(c) {
  const stateBadge = { draft: '<span class="badge">черновик</span>', running: '<span class="badge ok"><i></i>идёт</span>', paused: '<span class="badge warn">пауза</span>', done: '<span class="badge">завершена</span>' }[c.state];
  const total = c.recipients.length || 0;
  const done = Math.min(c.cursor, total);
  return `<div class="glass cmp-card" data-cmp="${c.id}">
    <div class="cmp-head"><div class="nm">${esc(c.name)}</div>${stateBadge}</div>
    <div class="muted" style="font-size:11.5px;margin-top:4px">пачка ${c.batchSize} · пауза ${c.pauseMin[0]}–${c.pauseMin[1]} ${STATE.settings.demo.accelerate ? 'сек (демо)' : 'мин'} · окно ${c.window[0]}:00–${c.window[1]}:00 по поясу клиента</div>
    <div class="cmp-stats">
      <div class="cmp-stat"><div class="v">${c.stats.sent}</div><div class="k">отправлено</div></div>
      <div class="cmp-stat"><div class="v">${c.stats.replied}</div><div class="k">ответили</div></div>
      <div class="cmp-stat"><div class="v">${c.stats.qualified}</div><div class="k">до квалификации</div></div>
      <div class="cmp-stat"><div class="v">${c.stats.skipped}</div><div class="k">пропуски</div></div>
    </div>
    ${total ? `<div class="progress"><i style="width:${total ? done / total * 100 : 0}%"></i></div><div class="muted" style="font-size:11px;margin-top:5px">${done} из ${total}</div>` : ''}
    <div style="display:flex;gap:8px;margin-top:12px">
      ${c.state === 'draft' ? `<button class="btn btn-accent btn-sm" data-act="start">${ic(I.play)}Запустить</button>` : ''}
      ${c.state === 'running' ? `<button class="btn btn-sm" data-act="pause">${ic(I.pause)}Пауза</button>` : ''}
      ${c.state === 'paused' ? `<button class="btn btn-accent btn-sm" data-act="resume">${ic(I.play)}Продолжить</button>` : ''}
      ${['running', 'paused'].includes(c.state) ? `<button class="btn btn-danger btn-sm" data-act="stop">Остановить</button>` : ''}
    </div>
    ${c.log.length ? `<div style="margin-top:12px">${coll('Журнал кампании', `<div class="cmp-log" style="border-top:none;padding-top:4px">${c.log.slice(0, 30).map(x => `${tmm(x.at)} — ${esc(x.text)}`).join('<br>')}</div>`, { open: false, count: c.log.length, icon: I.doc })}</div>` : ''}
  </div>`;
}
function wireCampaigns(root) {
  $$('[data-cmp] [data-act]', root).forEach(b => b.addEventListener('click', async () => {
    const id = b.closest('[data-cmp]').dataset.cmp;
    await api.post(`/campaigns/${id}/${b.dataset.act}`);
    PAGES.wake.refresh();
  }));
}
function newCampaignModal() {
  const s = STATE.settings;
  const marketingTpls = STATE.templates.filter(t => t.category === 'marketing');
  modal({
    title: 'Новая кампания реанимации',
    sub: 'Рассылка идёт по скорингу: сначала сегмент A, безопасными пачками, в окне по поясу клиента',
    body: `
      <div class="form-row"><label>Название</label><input id="cName" value="Пробуждение базы"></div>
      <div class="form-row"><label>Направление</label><select id="cGeo"><option value="">Все</option>${s.agency.geos.map(g => `<option value="${g}">${s.geoNames[g]}</option>`).join('')}</select></div>
      <div class="form-row"><label>Шаблон (Marketing, прошёл модерацию)</label><select id="cTpl">${marketingTpls.map(t => `<option value="${t.id}" ${t.status !== 'approved' ? 'disabled' : ''}>${esc(t.name)}${t.status !== 'approved' ? ' · на модерации' : ''}</option>`).join('')}</select></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div class="form-row"><label>Пачка</label><input id="cBatch" type="number" value="3" min="1" max="10"></div>
        <div class="form-row"><label>Пауза от</label><input id="cP1" type="number" value="20"></div>
        <div class="form-row"><label>Пауза до</label><input id="cP2" type="number" value="60"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-row"><label>Окно с (час клиента)</label><input id="cW1" type="number" value="10" min="0" max="23"></div>
        <div class="form-row"><label>Окно до</label><input id="cW2" type="number" value="20" min="1" max="24"></div>
      </div>`,
    actions: [
      { label: 'Создать', cls: 'btn-accent', onClick: async (bd) => {
        await api.post('/campaigns', {
          name: $('#cName', bd).value, templateId: $('#cTpl', bd).value,
          filters: { stages: ['sleeping'], geo: $('#cGeo', bd).value || null },
          batchSize: +$('#cBatch', bd).value, pauseMin: [+$('#cP1', bd).value, +$('#cP2', bd).value],
          window: [+$('#cW1', bd).value, +$('#cW2', bd).value],
        });
        PAGES.wake.refresh();
      } },
      { label: 'Отмена' },
    ],
  });
}

/* ---------------- РЕКЛАМА (мост Albato + атрибуция) ---------------- */
PAGES.ads = async (root) => {
  const d = await api.get('/ads');
  const hookUrl = `${location.origin}/hooks/lead?key=${d.hooks.secret}`;
  root.innerHTML = `
    <div class="two-col">
      <div>
        <div class="glass card mb">
          <div class="card-title">${ic(I.link)}Мост приёма лидов<span class="sub">Albato / Make / любой интегратор</span></div>
          <div class="form-row"><label>Webhook приёма (Meta Lead Form → интегратор → сюда, POST JSON)</label>
            <div style="display:flex;gap:8px;align-items:center"><code class="pill" style="flex:1;overflow-x:auto;white-space:nowrap;padding:8px 10px">${hookUrl}</code>
            <button class="btn btn-sm" id="copyHook">${ic(I.copy)}</button></div></div>
          <div class="muted" style="font-size:11.8px;line-height:1.6;margin:4px 0 12px">
            Поля (гибкий маппинг): <b>name</b>, <b>phone</b> (обязательно), geo, source, <b>ad_id</b>, adset_id, campaign_id, form_name.
            Дубли по телефону не создаются — карточка обогащается. Лид с ad_id мэтчится на базу объявлений автоматически.
          </div>
          <div class="form-row"><label>Исходящий мост: квал/передача → POST на URL (в Albato → любая CRM клиента)</label>
            <input id="outUrl" placeholder="https://h.albato.ru/wh/…" value="${esc(d.hooks.outboundUrl || '')}"></div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-accent btn-sm" id="saveOut">Сохранить</button>
            <button class="btn btn-sm" id="rotateKey">Сменить секрет</button>
          </div>
        </div>
        <div class="glass card">
          <div class="card-title">${ic(I.doc)}Загрузка объявлений таблицей</div>
          <div class="muted" style="font-size:11.8px;margin-bottom:8px">Вставь строки из таблицы (CSV / из Excel). Колонки: <code class="pill">ad_id</code> <code class="pill">name</code> <code class="pill">adset</code> <code class="pill">campaign</code> <code class="pill">geo</code> — порядок любой, определяется по заголовку.</div>
          <textarea id="adsCsv" style="min-height:110px;font-family:Menlo,monospace;font-size:11.5px" placeholder="ad_id,name,adset,campaign,geo
120211478921230508,Дубай · видео-тур JVC,RU 30-55,DXB Sept,dubai"></textarea>
          <button class="btn btn-accent" id="importAds" style="margin-top:10px">Импортировать и смэтчить</button>
        </div>
      </div>
      <div>
        <div class="glass card mb">
          <div class="card-title">${ic(I.target)}Объявления · лиды · квалы<span class="sub">${d.ads.length} в базе</span></div>
          <table class="tbl"><thead><tr><th>Объявление</th><th>Лиды</th><th>Квалы</th><th>Сделки</th></tr></thead><tbody>
            ${d.ads.map(a => `<tr>
              <td><b>${esc(a.name)}</b><div class="muted" style="font-size:10.5px">${esc(a.campaignName || '')}${a.adsetName ? ' · ' + esc(a.adsetName) : ''} · <code class="pill" style="font-size:9.5px">${esc(a.adId)}</code></div></td>
              <td><b>${a.leads}</b></td>
              <td>${a.qualified}${a.leads ? ` <span class="muted" style="font-size:10px">(${Math.round(a.qualified / a.leads * 100)}%)</span>` : ''}</td>
              <td>${a.deals}</td>
            </tr>`).join('') || '<tr><td colspan="4" class="empty">Объявлений нет — загрузите таблицей слева</td></tr>'}
          </tbody></table>
          ${d.unmatched.length ? coll('Лиды с неизвестным ad_id', d.unmatched.map(x => `<div class="set-row"><div class="sp"><div class="sl" style="font-size:12.5px">${esc(x.name)}</div><div class="sd">ad_id: ${esc(x.adId)} — добавьте объявление в базу, мэтчинг пройдёт сам</div></div></div>`).join(''), { open: false, count: d.unmatched.length, icon: I.x }) : ''}
        </div>
        ${coll('Журнал приёма', d.intakeLog.map(e => `<div class="set-row"><div class="sp"><div class="sl" style="font-size:12.5px">${esc(e.name)} · ${esc(e.phone)}</div><div class="sd">${tmm(e.at)} · ${e.result === 'created' ? 'создан' : 'повторная заявка'}${e.adId ? ' · ad ' + esc(e.adId) : ''}</div></div></div>`).join('') || '<div class="empty" style="padding:14px">Приёмов ещё не было</div>', { open: true, count: d.intakeLog.length, icon: I.bolt })}
      </div>
    </div>`;
  $('#copyHook').addEventListener('click', () => { navigator.clipboard.writeText(hookUrl); toast('Ссылка скопирована', 'Вставь её в Albato как Webhook-действие', true); });
  $('#saveOut').addEventListener('click', async () => { await api.patch('/hooks', { outboundUrl: $('#outUrl').value }); toast('Исходящий мост сохранён', null, true); });
  $('#rotateKey').addEventListener('click', async () => { await api.patch('/hooks', { rotateSecret: true }); toast('Секрет обновлён', 'Обнови ссылку в Albato', true); render(); });
  $('#importAds').addEventListener('click', async () => {
    const r = await api.post('/ads/import', { csv: $('#adsCsv').value });
    toast(`Импорт: +${r.added}, обновлено ${r.updated}`, `Домэтчено лидов: ${r.rematched}`, true);
    render();
  });
};

/* ---------------- НОМЕРА ---------------- */
PAGES.numbers = async (root) => {
  const st = await api.get('/state');
  STATE.numbers = st.numbers;
  const ring = (q) => {
    const r = 19, c = 2 * Math.PI * r;
    const col = q >= 80 ? 'var(--ok)' : q >= 55 ? 'var(--warn)' : 'var(--bad)';
    return `<div class="q-ring"><svg viewBox="0 0 46 46">
      <circle cx="23" cy="23" r="${r}" stroke="#E7ECF3" stroke-width="4" fill="none"/>
      <circle cx="23" cy="23" r="${r}" stroke="${col}" stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray="${c * q / 100} ${c}"/>
    </svg><span class="txt">${q}</span></div>`;
  };
  const stBadge = { active: '<span class="badge ok"><i></i>активен</span>', warming: '<span class="badge warn"><i></i>прогрев</span>', quarantine: '<span class="badge bad"><i></i>карантин</span>' };
  root.innerHTML = `
    <div class="glass card mb">
      <div class="card-title">${ic(I.shield)}Гигиена канала</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px">
        ${[['Inbound-first', 'Первым в идеале пишет клиент: CTWA-реклама и Lead Form дают согласие на диалог'],
           ['Прогрев 2–3 недели', 'Новый номер: 10–20 контактов/день, рост ~20% в неделю до рабочего лимита'],
           ['Холодная инициация — только Cloud API', 'Массовые первые касания идут шаблонами через официальный канал, не с тёплых номеров'],
           ['Просадка качества → карантин', 'Доставляемость падает — номер отдыхает, трафик уходит на резерв']]
          .map(([t, d]) => `<div><div style="font-size:12.5px;font-weight:650;margin-bottom:4px">${t}</div><div class="muted" style="font-size:11.5px;line-height:1.5">${d}</div></div>`).join('')}
      </div>
    </div>
    <div class="num-grid">
      ${st.numbers.map(n => `<div class="glass num-card" data-num="${n.id}">
        <div class="num-head">
          <div><div class="ph">${esc(n.phone)}</div><div class="lb">${esc(n.label)} ${n.channel === 'cloud_api' ? '· <b style="color:var(--accent-2)">официальный Cloud API</b>' : '· web-протокол'}</div></div>
          ${ring(Math.round(n.quality))}
        </div>
        <div style="margin:10px 0 4px">${stBadge[n.state]}${n.state === 'warming' ? ` <span class="muted" style="font-size:11px">день ${n.warmupDay}</span>` : ''}</div>
        <div class="num-meta">
          <div class="m"><div class="v">${n.sentToday}</div><div class="k">сегодня</div></div>
          <div class="m"><div class="v">${n.dayLimit || '—'}</div><div class="k">лимит/сутки</div></div>
          <div class="m"><div class="v">${n.tier}</div><div class="k">тир Meta</div></div>
        </div>
        <div class="progress" style="margin-top:2px"><i style="width:${n.dayLimit ? Math.min(n.sentToday / n.dayLimit * 100, 100) : 0}%"></i></div>
        <div class="num-actions" style="margin-top:13px">
          ${n.state !== 'quarantine' ? `<button class="btn btn-danger btn-sm" data-act="quarantine">В карантин</button>` : `<button class="btn btn-sm" data-act="warming">На прогрев</button><button class="btn btn-sm btn-accent" data-act="active">Активировать</button>`}
        </div>
      </div>`).join('')}
    </div>`;
  $$('[data-num] [data-act]', root).forEach(b => b.addEventListener('click', async () => {
    await api.patch('/numbers/' + b.closest('[data-num]').dataset.num, { state: b.dataset.act });
    render();
  }));
};

/* ---------------- ШАБЛОНЫ ---------------- */
PAGES.templates = async (root) => {
  const st = await api.get('/state');
  STATE.templates = st.templates;
  const stBadge = { approved: '<span class="badge ok">approved</span>', pending: '<span class="badge warn">на модерации Meta</span>', rejected: '<span class="badge bad">отклонён</span>' };
  root.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:14px"><button class="btn btn-accent" id="newTpl">${ic(I.plus)}Новый шаблон</button></div>
    <div class="two-col">
      <div><div class="nav-label" style="padding-left:2px">Utility — сервисные (дешевле, быстрее модерация)</div>
        ${st.templates.filter(t => t.category === 'utility').map(t => tplCard(t, stBadge)).join('')}</div>
      <div><div class="nav-label" style="padding-left:2px">Marketing — инициация и реанимация</div>
        ${st.templates.filter(t => t.category === 'marketing').map(t => tplCard(t, stBadge)).join('')}</div>
    </div>`;
  $('#newTpl').addEventListener('click', () => modal({
    title: 'Новый шаблон',
    sub: 'Уйдёт на модерацию Meta (обычно минуты—часы). Переменные: {name}, {geo}, {agency}, {broker}',
    body: `
      <div class="form-row"><label>Название</label><input id="tName"></div>
      <div class="form-row"><label>Категория</label><select id="tCat"><option value="utility">Utility</option><option value="marketing">Marketing</option></select></div>
      <div class="form-row"><label>Текст</label><textarea id="tBody" style="min-height:110px"></textarea></div>`,
    actions: [
      { label: 'Отправить на модерацию', cls: 'btn-accent', onClick: async (bd) => {
        await api.post('/templates', { name: $('#tName', bd).value, category: $('#tCat', bd).value, body: $('#tBody', bd).value });
        render();
      } },
      { label: 'Отмена' },
    ],
  }));
};
function tplCard(t, stBadge) {
  return `<div class="glass tpl-card">
    <div class="tpl-head"><div class="nm">${esc(t.name)}</div><span class="badge">${t.lang.toUpperCase()}</span>${stBadge[t.status]}</div>
    <div class="tpl-body">${esc(t.body)}</div>
  </div>`;
}

/* ---------------- БРОКЕРЫ ---------------- */
PAGES.brokers = async (root) => {
  const leads = await api.get('/leads');
  root.innerHTML = `<div class="broker-grid">
    ${STATE.brokers.map(b => {
      const mine = leads.filter(l => l.broker === b.id);
      const hot = mine.filter(l => ['handover', 'viewing'].includes(l.stage)).length;
      const pct = Math.round(b.load / b.capacity * 100);
      return `<div class="glass broker-card">
        <div class="ava" style="width:44px;height:44px;flex:0 0 44px;font-size:14px">${esc(b.avatar)}</div>
        <div class="bmeta">
          <div class="nm">${esc(b.name)}</div>
          <div class="gl">${STATE.settings.geoNames[b.geo]} · ${b.langs.join(' / ')} · сделок за 90 дн: ${b.deals90}</div>
          <div class="load-track"><i style="width:${pct}%"></i></div>
          <div class="muted" style="font-size:11px;margin-top:5px">загрузка ${b.load}/${b.capacity} · сейчас в работе от ИИ: ${hot}</div>
        </div>
      </div>`;
    }).join('')}
  </div>
  <div class="glass card" style="margin-top:16px">
    <div class="card-title">${ic(I.handover)}Как ИИ выбирает брокера</div>
    <div class="muted" style="font-size:12.8px;line-height:1.6">Передача идёт брокеру нужного гео с минимальной относительной загрузкой. Вместе с лидом брокер получает саммари: 4 оси квалификации с цитатами клиента, источник, историю диалога. Клиенту в тот же момент уходит сообщение-мост с именем эксперта и слотом созвона — без «повисания» между линиями.</div>
  </div>`;
};

/* ---------------- АНАЛИТИКА ---------------- */
PAGES.analytics = async (root) => {
  const an = await api.get('/analytics');
  root.innerHTML = `
    <div class="glass card mb">
      <div class="card-title">${ic(I.bars)}Человек против ИИ — метрики, которые двигают выручку</div>
      <div class="vs">
        <div class="vs-col"><div class="hd">Ручная первая линия</div>
          <div class="vs-row"><span class="k">Скорость первого контакта</span><span class="v">${an.compare.human.firstContact}</span></div>
          <div class="vs-row"><span class="k">Конверсия в диалог</span><span class="v">${an.compare.human.dialogConv}%</span></div>
          <div class="vs-row"><span class="k">Лид → квалификация</span><span class="v">${an.compare.human.qualConv}%</span></div>
          <div class="vs-row"><span class="k">Время на квалификацию</span><span class="v">${an.compare.human.qualTime}</span></div>
        </div>
        <div class="vs-col ai"><div class="hd">Lumen AI · первая линия</div>
          <div class="vs-row"><span class="k">Скорость первого контакта</span><span class="v">${an.compare.aiLine.firstContact}</span></div>
          <div class="vs-row"><span class="k">Конверсия в диалог</span><span class="v">${an.compare.aiLine.dialogConv}%</span></div>
          <div class="vs-row"><span class="k">Лид → квалификация</span><span class="v">${an.compare.aiLine.qualConv}%</span></div>
          <div class="vs-row"><span class="k">Время на квалификацию</span><span class="v">${an.compare.aiLine.qualTime}</span></div>
        </div>
      </div>
    </div>
    <div class="two-col">
      <div class="glass card">
        <div class="card-title">${ic(I.funnel)}Конверсия в квалификацию по направлениям</div>
        <div class="geo-bars">
          ${Object.values(an.geoStats).map(g => `<div class="geo-bar">
            <div class="g-top"><b>${g.name}</b><span>${g.qualified} из ${g.total} · <b>${g.conv}%</b></span></div>
            <div class="g-track"><div class="g-fill" style="width:${g.conv}%"></div></div>
          </div>`).join('')}
        </div>
      </div>
      <div class="glass card">
        <div class="card-title">${ic(I.sim)}Канал WhatsApp</div>
        <div class="kpis" style="grid-template-columns:1fr 1fr;margin-bottom:0">
          <div class="kpi" style="border:1px solid var(--stroke-soft);border-radius:var(--r-md)"><div class="lbl">Отправлено сегодня</div><div class="val">${an.wa.sentToday}</div></div>
          <div class="kpi" style="border:1px solid var(--stroke-soft);border-radius:var(--r-md)"><div class="lbl">Средн. качество номеров</div><div class="val">${an.wa.avgQuality}%</div></div>
        </div>
        <div class="muted" style="font-size:12px;line-height:1.6;margin-top:12px">Воронка: ${Object.entries(an.funnel).filter(([k]) => !['lost'].includes(k)).map(([k, v]) => `${stageName(k)} — <b>${v}</b>`).join(' · ')}</div>
      </div>
    </div>`;
};

/* ---------------- ПОДКЛЮЧЕНИЯ ---------------- */
PAGES.settings = async (root) => {
  const s = STATE.settings;
  root.innerHTML = `
    <div class="two-col">
      <div class="glass card">
        <div class="card-title">${ic(I.chat)}WhatsApp Cloud API<span class="sub">официальный канал Meta</span></div>
        <div class="set-row">
          <div class="sp"><div class="sl">Режим</div><div class="sd">${s.wa.mode === 'mock' ? 'Демо: сообщения пишутся только в CRM' : 'Боевой: отправка через Cloud API'}</div></div>
          <span class="badge ${s.wa.mode === 'mock' ? 'warn' : 'ok'}">${s.wa.mode === 'mock' ? 'демо' : 'подключён'}</span>
        </div>
        <div class="form-row" style="margin-top:12px"><label>Phone Number ID</label><input id="waPhoneId" value="${esc(s.wa.phoneId)}" placeholder="из Meta Business → WhatsApp → API Setup"></div>
        <div class="form-row"><label>WABA ID</label><input id="waWabaId" value="${esc(s.wa.wabaId)}" placeholder="WhatsApp Business Account ID"></div>
        <div class="form-row"><label>Постоянный токен</label><input id="waToken" type="password" placeholder="${s.wa.tokenSet ? '•••••• сохранён' : 'System User token'}"></div>
        <div class="form-row"><label>Webhook для входящих</label><div><code class="pill">${location.origin}/wa/webhook</code> <span class="muted" style="font-size:11px">verify token: <code class="pill">${esc(s.wa.webhookVerifyToken)}</code></span></div></div>
        <button class="btn btn-accent" id="saveWa" style="width:100%;justify-content:center;margin-top:6px">Сохранить подключение</button>
      </div>
      <div>
        <div class="glass card mb">
          <div class="card-title">${ic(I.spark)}Движок ИИ</div>
          <div class="set-row">
            <div class="sp"><div class="sl">LLM (${s.ai.llmModel || 'Gemini'})</div><div class="sd">${s.ai.llmAvailable ? 'Ключ найден — живые ответы включены. Оси квалификации всё равно клампятся цитатами клиента.' : 'Ключ не задан (GEMINI_API_KEY в .env) — работает детерминированное ядро.'}</div></div>
            <span class="badge ${s.ai.llmAvailable ? 'ok' : 'warn'}">${s.ai.llmAvailable ? 'подключён' : 'нет ключа'}</span>
          </div>
          <div class="set-row">
            <div class="sp"><div class="sl">Режим ответов</div><div class="sd">«Экономный» — LLM только для реальных клиентов, демо-симуляция ходит на бесплатном ядре и не жжёт токены</div></div>
            <select id="aiProv" style="width:170px">
              <option value="auto" ${s.ai.provider === 'auto' ? 'selected' : ''}>Экономный (авто)</option>
              <option value="llm" ${s.ai.provider === 'llm' ? 'selected' : ''}>Всегда LLM</option>
              <option value="core" ${s.ai.provider === 'core' ? 'selected' : ''}>Только ядро</option>
            </select>
          </div>
        </div>
        <div class="glass card mb">
          <div class="card-title">${ic(I.shield)}Пароль входа</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="form-row"><label>Текущий</label><input id="pwCur" type="password"></div>
            <div class="form-row"><label>Новый (от 8 символов)</label><input id="pwNext" type="password"></div>
          </div>
          <button class="btn" id="pwSave">Сменить пароль</button>
        </div>
        <div class="glass card">
          <div class="card-title">${ic(I.eye)}Демо-режим</div>
          <div class="set-row">
            <div class="sp"><div class="sl">Ускорение времени</div><div class="sd">1 «день» цепочки = ${Math.round(s.demo.dayMs / 1000)} секунд — касания видно вживую</div></div>
            <label class="switch"><input type="checkbox" id="dAcc" ${s.demo.accelerate ? 'checked' : ''}><span class="tr"></span><span class="th"></span></label>
          </div>
          <div class="set-row">
            <div class="sp"><div class="sl">Симуляция ответов клиентов</div><div class="sd">Виртуальные клиенты отвечают на касания — видно всю петлю квалификации</div></div>
            <label class="switch"><input type="checkbox" id="dSim" ${s.demo.simulateReplies ? 'checked' : ''}><span class="tr"></span><span class="th"></span></label>
          </div>
          <div class="set-row">
            <div class="sp"><div class="sl">Сбросить демо-данные</div><div class="sd">Вернуть базу к исходному состоянию витрины</div></div>
            <button class="btn btn-danger btn-sm" id="dReset">Сбросить</button>
          </div>
        </div>
      </div>
    </div>`;
  $('#saveWa').addEventListener('click', async () => {
    const token = $('#waToken').value.trim();
    const phoneId = $('#waPhoneId').value.trim();
    await api.patch('/settings', { wa: {
      phoneId, wabaId: $('#waWabaId').value.trim(),
      ...(token ? { token } : {}),
      mode: (token || s.wa.tokenSet) && phoneId ? 'cloud' : 'mock',
    } });
    toast('Подключение сохранено', token && phoneId ? 'Боевой режим: отправка через Cloud API' : 'Демо-режим (нет токена или Phone ID)', true);
    await loadState();
    render();
  });
  $('#aiProv').addEventListener('change', async (e) => { await api.patch('/settings', { ai: { provider: e.target.value } }); loadState(); });
  $('#pwSave').addEventListener('click', async () => {
    const r = await fetch('/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current: $('#pwCur').value, next: $('#pwNext').value }) });
    const j = await r.json();
    if (r.ok) { toast('Пароль изменён', 'Другие сессии разлогинены', true); $('#pwCur').value = $('#pwNext').value = ''; }
    else toast('Не получилось', j.error || 'ошибка');
  });
  $('#dAcc').addEventListener('change', async (e) => { await api.patch('/settings', { demo: { accelerate: e.target.checked } }); loadState(); });
  $('#dSim').addEventListener('change', async (e) => { await api.patch('/settings', { demo: { simulateReplies: e.target.checked } }); loadState(); });
  $('#dReset').addEventListener('click', () => modal({
    title: 'Сбросить демо-данные?',
    sub: 'Все текущие лиды и кампании заменятся исходной витриной',
    actions: [
      { label: 'Сбросить', cls: 'btn-danger', onClick: async () => { await api.post('/demo/reset'); toast('Демо-данные сброшены', null, true); await loadState(); render(); } },
      { label: 'Отмена' },
    ],
  }));
};

/* ---------- новый лид ---------- */
$('#newLeadBtn').addEventListener('click', () => {
  const s = STATE.settings;
  modal({
    title: 'Новый лид',
    sub: 'Цепочка сделает первое касание автоматически через несколько секунд',
    body: `
      <div class="form-row"><label>Имя</label><input id="nlName" placeholder="Имя Фамилия"></div>
      <div class="form-row"><label>Телефон (WhatsApp)</label><input id="nlPhone" placeholder="+971 …"></div>
      <div class="form-row"><label>Направление</label><select id="nlGeo">${s.agency.geos.map(g => `<option value="${g}">${s.geoNames[g]}</option>`).join('')}</select></div>
      <div class="form-row"><label>Источник</label><select id="nlSrc"><option value="meta_form">Meta Lead Form</option><option value="ctwa">Click-to-WhatsApp</option><option value="site">Сайт</option><option value="manual">Вручную</option></select></div>`,
    actions: [
      { label: 'Создать', cls: 'btn-accent', onClick: async (bd) => {
        const name = $('#nlName', bd).value.trim();
        if (!name) { toast('Укажите имя'); return false; }
        await api.post('/leads', { name, phone: $('#nlPhone', bd).value.trim(), geo: $('#nlGeo', bd).value, source: $('#nlSrc', bd).value });
        render();
      } },
      { label: 'Отмена' },
    ],
  });
});

/* ---------- глобальный поиск ---------- */
(() => {
  const inp = $('#gsInput'), box = $('#gsResults');
  if (!inp) return;
  let t = null, sel = -1, items = [];
  const close = () => { box.classList.remove('show'); sel = -1; };
  const open = (leads) => {
    items = leads;
    if (!leads.length) { box.innerHTML = '<div class="gs-item"><span class="gp">Ничего не найдено</span></div>'; box.classList.add('show'); return; }
    box.innerHTML = leads.map((l, i) => `<div class="gs-item" data-i="${i}" data-id="${l.id}">
      <div class="ava" style="width:28px;height:28px;flex:0 0 28px;font-size:10px">${esc(l.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase())}</div>
      <div><div class="gn">${esc(l.name)}</div><div class="gp">${esc(l.phone)} · ${l.geoName}</div></div>
      <span class="badge">${stageName(l.stage)}</span>
    </div>`).join('');
    box.classList.add('show');
    $$('.gs-item', box).forEach(x => x.addEventListener('mousedown', (e) => { e.preventDefault(); pick(x.dataset.id); }));
  };
  const pick = (id) => { close(); inp.value = ''; inp.blur(); PAGE_STATE.inboxLead = id; go('inbox'); };
  inp.addEventListener('input', () => {
    clearTimeout(t);
    const q = inp.value.trim();
    if (q.length < 2) { close(); return; }
    t = setTimeout(async () => open((await api.get('/leads?q=' + encodeURIComponent(q))).slice(0, 8)), 220);
  });
  inp.addEventListener('keydown', (e) => {
    const els = $$('.gs-item[data-id]', box);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = e.key === 'ArrowDown' ? Math.min(sel + 1, els.length - 1) : Math.max(sel - 1, 0);
      els.forEach((x, i) => x.classList.toggle('sel', i === sel));
    } else if (e.key === 'Enter' && els[sel >= 0 ? sel : 0]) pick(els[sel >= 0 ? sel : 0].dataset.id);
    else if (e.key === 'Escape') { close(); inp.blur(); }
  });
  inp.addEventListener('blur', () => setTimeout(close, 150));
  /* ⌘K / Ctrl+K — фокус в поиск */
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inp.focus(); inp.select(); }
  });
})();

/* ---------- цикл обновления ---------- */
setInterval(async () => {
  try {
    await loadState();
    setConn(true);
    if (DRAG.active) return; // не перерисовываем канбан посреди перетаскивания
    if ($('.modal-bd')) return; // и под открытой модалкой тоже
    if (PAGES[CUR] && PAGES[CUR].refresh) await PAGES[CUR].refresh();
    else if (['overview', 'funnel'].includes(CUR)) await render();
  } catch (e) {
    if (e.message !== 'auth') setConn(false); // сервер лёг/рестартует — баннер, не молчание
  }
}, 7000);

/* ---------- старт ---------- */
(async () => {
  initNav();
  const t0 = Date.now();
  try {
    await loadState();
  } catch (e) {
    if (e.message !== 'auth') {
      /* сервер недоступен на старте → не пустой каркас, а внятный экран */
      hidePreloader();
      setConn(false);
      const retry = setInterval(async () => {
        try { await loadState(); clearInterval(retry); setConn(true); go('overview'); } catch (_) {}
      }, 3000);
    }
    return;
  }
  go('overview');
  /* прелоадеру — минимум 900мс жизни, чтобы вихрь успел «дохнуть» */
  setTimeout(hidePreloader, Math.max(0, 900 - (Date.now() - t0)));
})();
