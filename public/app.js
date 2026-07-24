/* ============================================================
   Lumen CRM — SPA. Разделы рендерятся в #content, данные — REST.
   ============================================================ */

/* ---------- прелоадер: двойной брендинг (логотип агентства из кэша прошлой сессии) ---------- */
(() => {
  try {
    const b = JSON.parse(localStorage.getItem('lumen_brand') || 'null');
    if (!b || !b.logo) return;
    const pc = document.querySelector('#preloader .pl-center');
    if (!pc) return;
    pc.classList.add('duo');
    const ag = document.createElement('div');
    ag.className = 'pl-ag';
    ag.innerHTML = `<img src="${b.logo}" alt="">${b.name ? `<div class="pl-agname">${b.name.replace(/[<>&]/g, '')}</div>` : ''}`;
    pc.prepend(ag);
    const row = document.createElement('div');
    row.className = 'pl-lrow';
    row.appendChild(document.querySelector('#preloader .pl-logo'));
    row.appendChild(document.querySelector('#preloader .pl-word'));
    const pow = document.createElement('div');
    pow.className = 'pl-pow';
    pow.textContent = 'работает на';
    pc.appendChild(pow);
    pc.appendChild(row);
  } catch (e) { /* кэша нет — обычный прелоадер */ }
})();

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
  building: '<path d="M3 21V5l7-3v19M10 21V8l8 2v11M3 21h18M6 8h1M6 12h1M6 16h1M14 13h1M14 17h1"/>',
  layers: '<path d="M12 2l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5M3 17l9 5 9-5"/>',
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

/* ---------- «?»-подсказки: объяснялки не занимают экран, живут в поповере ---------- */
const HINTS = {};
function hint(id, title, items) {
  HINTS[id] = { title, items };
  return `<button class="hint-q" type="button" data-hint="${id}" aria-label="Как это работает">?</button>`;
}
function closeHint() { const p = document.querySelector('.hint-pop'); if (p) p.remove(); }
document.addEventListener('click', (e) => {
  const q = e.target.closest('.hint-q');
  const open = document.querySelector('.hint-pop');
  if (open && (!q || open.dataset.for === q.dataset.hint)) { open.remove(); if (q) return; }
  else if (open) open.remove();
  if (!q) return;
  const h = HINTS[q.dataset.hint];
  if (!h) return;
  const pop = document.createElement('div');
  pop.className = 'hint-pop';
  pop.dataset.for = q.dataset.hint;
  pop.innerHTML = `<div class="hp-t">${h.title}</div>` + h.items.map(([t, d]) => `<div class="hp-row"><b>${t}</b><span>${d}</span></div>`).join('');
  document.body.appendChild(pop);
  const r = q.getBoundingClientRect();
  const w = Math.min(330, window.innerWidth - 16);
  pop.style.width = w + 'px';
  pop.style.left = Math.max(8, Math.min(r.left - 8, window.innerWidth - w - 8)) + 'px';
  pop.style.top = (r.bottom + 8) + 'px';
  requestAnimationFrame(() => {
    const pr = pop.getBoundingClientRect();
    if (pr.bottom > window.innerHeight - 8) pop.style.top = Math.max(8, r.top - pr.height - 8) + 'px';
    pop.classList.add('show');
  });
});
window.addEventListener('scroll', (e) => { if (!e.target.closest?.('.hint-pop')) closeHint(); }, true);

function plural(n, one, few, many) {
  const m = Math.abs(n) % 100, d = m % 10;
  if (m > 10 && m < 20) return many;
  if (d > 1 && d < 5) return few;
  if (d === 1) return one;
  return many;
}

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
let POP_GUARD = 0;
function openPop(wrap, btn, pop) {
  closePop();
  POP_GUARD = Date.now();
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
window.addEventListener('scroll', (e) => { if (CUR_POP && Date.now() - POP_GUARD > 350 && !e.target.closest?.('.cs-list, .dtp-pop')) closePop(); }, true);
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
  overview:  { name: 'Обзор', icon: I.grid, sub: '' },
  funnel:    { name: 'Воронка', icon: I.funnel, sub: '' },
  inbox:     { name: 'Диалоги', icon: I.chat, sub: '' },
  properties: { name: 'Объекты', icon: I.building, sub: '' },
  collections: { name: 'Подборки', icon: I.layers, sub: '' },
  qualifier: { name: 'ИИ-квалификатор', icon: I.spark, sub: '' },
  sequences: { name: 'Цепочки касаний', icon: I.chain, sub: '' },
  wake:      { name: 'Реанимация базы', icon: I.wake, sub: '' },
  meetings:  { name: 'Встречи', icon: I.cal, sub: '' },
  automations: { name: 'Автоматизации', icon: I.bolt, sub: '' },
  playbook: { name: 'Плейбук продаж', icon: I.flame, sub: '' },
  ads:       { name: 'Реклама', icon: I.target, sub: '' },
  numbers:   { name: 'Номера', icon: I.sim, sub: '' },
  templates: { name: 'Шаблоны', icon: I.doc, sub: '' },
  brokers:   { name: 'Брокеры', icon: I.users, sub: '' },
  analytics: { name: 'Аналитика', icon: I.bars, sub: '' },
  settings:  { name: 'Подключения', icon: I.gear, sub: 'Каналы, телефония, голос, ИИ, демо-режим' },
  agency:    { name: 'Профиль агентства', icon: I.building, sub: 'Бренд, логотип, подпись менеджера, пароль' },
};

const BASE_STAGES = [
  { id: 'new', name: 'Новые', icon: 'plus', sys: true },
  { id: 'touch', name: 'Первое касание', icon: 'chain', sys: true },
  { id: 'dialog', name: 'В диалоге с ИИ', icon: 'chat', sys: true },
  { id: 'qualified', name: 'Квалифицирован', icon: 'spark', sys: true },
  { id: 'handover', name: 'У брокера', icon: 'handover', sys: true },
  { id: 'viewing', name: 'Показ', icon: 'eye' },
  { id: 'deal', name: 'Сделка', icon: 'flame', sys: true },
  { id: 'sleeping', name: 'Спящие', icon: 'moon', sys: true },
  { id: 'lost', name: 'Закрыт', icon: 'x', sys: true },
];
let STAGES = BASE_STAGES.slice();
function rebuildStages() {
  const cfg = (STATE && STATE.settings.stagesCfg) || {};
  let list = BASE_STAGES.map(st => ({ ...st, name: (cfg.names || {})[st.id] || st.name }))
    .concat((cfg.custom || []).map(c => ({ id: c.id, name: (cfg.names || {})[c.id] || c.name, icon: 'doc', custom: true })));
  if (cfg.order && cfg.order.length) {
    list.sort((a, b) => {
      const ia = cfg.order.indexOf(a.id), ib = cfg.order.indexOf(b.id);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }
  STAGES = list.filter(st => !(cfg.hidden || []).includes(st.id));
  STAGES._all = list;
}
const stageName = (id) => ((STAGES._all || STAGES).find(s => s.id === id) || {}).name || id;

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
  let loginBrand = '';
  try {
    const b = JSON.parse(localStorage.getItem('lumen_brand') || 'null');
    if (b && b.logo) loginBrand = `<div style="text-align:center;margin-bottom:22px"><img src="${b.logo}" style="max-width:170px;max-height:70px;object-fit:contain;filter:drop-shadow(0 0 22px rgba(120,160,255,.4))"><div style="font-size:9.5px;letter-spacing:.22em;text-transform:uppercase;color:#7C9BFF;opacity:.75;margin-top:12px">работает на Lumen</div></div>`;
  } catch (e) {}
  const s = el(`<div id="loginScreen" style="position:fixed;inset:0;z-index:300;display:grid;place-items:center;background:#061126;overflow:hidden">
    <video autoplay muted loop playsinline src="assets/nebula-bg.mp4"
      style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.5"></video>
    <div style="position:absolute;inset:0;background:radial-gradient(closest-side,transparent 25%,rgba(6,17,38,.6))"></div>
    <div style="position:relative;width:360px;max-width:calc(100vw - 40px);padding:36px 32px;border-radius:20px;
        background:rgba(10,24,51,.5);border:1px solid rgba(134,175,255,.2);
        backdrop-filter:blur(26px);-webkit-backdrop-filter:blur(26px);
        box-shadow:0 30px 80px -20px rgba(3,8,25,.85);text-align:center;
        animation:reveal .8s var(--ease-spring) both">
      ${loginBrand}
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
  const bd = el(`<div class="modal-bd"><div class="modal glass ${wide === 'card' ? 'modal-card' : ''}" ${wide === 'card' ? 'style="width:980px"' : wide ? 'style="width:680px"' : ''}>
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
  wireAiWand(bd);
  requestAnimationFrame(() => bd.classList.add('show'));
  return bd;
}
function closeModal() { const bd = $('.modal-bd'); if (bd) { bd.classList.remove('show'); setTimeout(() => bd.remove(), 180); } }
/* Escape закрывает по слоям: подсказка → пикер → модалка (пока юзер не в поле ввода) */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (document.querySelector('.hint-pop')) { closeHint(); return; }
  if (CUR_POP) { closePop(); return; }
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) { ae.blur(); return; }
  closeModal();
});
function toast(text, sub, ok) {
  const t = el(`<div class="toast glass ${ok ? 'ok' : ''}">${ic(ok ? I.check : I.spark)}<div><div>${esc(text)}</div>${sub ? `<div class="t-sub">${esc(sub)}</div>` : ''}</div></div>`);
  $('#toasts').appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3400);
}

/* ---------- ✦ ИИ-ассистент текстовых полей ----------
   Вешается на длинные текстовые поля (селекторы ниже): кнопка ✦ →
   меню режимов → POST /api/ai/text → замена текста + «вернуть». */
const AI_WAND_SEL = [
  '#clIntro', '#tBody', '#abIntro', '#abWhy', '#abBullets',
  'textarea[data-f="description"]', 'textarea[data-f="districtBlurb"]', 'textarea[data-f="whyRentStr"]',
  'textarea[data-se="text"]', 'textarea[data-crit][data-k="downsell"]',
].join(',');
const AI_MODES = [['improve', '✦ Улучшить'], ['shorter', '— Короче'], ['longer', '+ Подробнее'], ['selling', '₊ Продажнее'], ['formal', '§ Официальнее'], ['friendly', '☺ Дружелюбнее']];
function wireAiWand(root) {
  $$(AI_WAND_SEL, root).forEach(ta => {
    if (ta.dataset.aiw) return;
    ta.dataset.aiw = '1';
    const wrap = document.createElement('div');
    wrap.className = 'aiwrap';
    ta.parentNode.insertBefore(wrap, ta);
    wrap.appendChild(ta);
    const btn = el('<button type="button" class="aiwand" title="Переписать ИИ">✦</button>');
    wrap.appendChild(btn);
    let undo = null;
    btn.addEventListener('click', () => {
      const pop = el(`<div class="pop ai-pop">${AI_MODES.map(([k, n]) => `<div class="pop-item" data-m="${k}">${n}</div>`).join('')}${undo != null ? '<div class="pop-item" data-m="undo">↩ Вернуть как было</div>' : ''}</div>`);
      pop.addEventListener('click', async (e) => {
        const it = e.target.closest('[data-m]');
        if (!it) return;
        closePop();
        if (it.dataset.m === 'undo') { ta.value = undo; undo = null; ta.dispatchEvent(new Event('input')); return; }
        const text = ta.value.trim();
        if (!text) { toast('Поле пустое — сначала напишите черновик'); return; }
        btn.classList.add('busy');
        btn.textContent = '…';
        try {
          const r = await api.post('/ai/text', { text, mode: it.dataset.m });
          undo = ta.value;
          ta.value = r.text;
          ta.dispatchEvent(new Event('input'));
        } catch (e2) { toast('ИИ не справился', e2.message); }
        btn.classList.remove('busy');
        btn.textContent = '✦';
      });
      openPop(wrap, btn, pop);
    });
  });
}

/* ---------- hero-панель раздела: вырезанный Higgsfield-объект + glow + частицы ----------
   Единый приём «органичной» графики: объект парит слева, справа — живые данные раздела.
   Интерактив: строки/чипы с data-ha подсвечивают glow объекта при наведении. */
function heroArt(img, inner, opts = {}) {
  /* v: left (дефолт) | right (объект справа) | mark (крупный полуводяной знак справа)
     hue: акцент панели — у каждого раздела свой характер */
  const o = Object.assign({ particles: 5, cls: '', v: 'left', hue: '#2563EB' }, opts);
  return `<div class="ha mb v-${o.v} ${o.cls}" style="--hue:${o.hue}">
    <div class="ha-stage">
      <div class="ha-glow"></div>
      ${Array.from({ length: o.particles }, (_, i) => `<i class="ha-p" style="--pd:${(i * 0.62).toFixed(2)}s;--px:${(i * 43) % 84 - 42}px"></i>`).join('')}
      <img class="ha-obj" src="${img}" alt="" loading="lazy">
    </div>
    <div class="ha-body">${inner}</div>
  </div>`;
}
function wireHeroArt(root) {
  $$('.ha [data-ha]', root).forEach(r => {
    const ha = r.closest('.ha');
    r.addEventListener('mouseenter', () => $('.ha-glow', ha).classList.add('lit'));
    r.addEventListener('mouseleave', () => $('.ha-glow', ha).classList.remove('lit'));
  });
}

/* ночной режим: переключатель + память выбора */
(() => {
  const apply = (on) => {
    document.documentElement.toggleAttribute('data-night', on);
    const b = document.getElementById('nightBtn');
    if (b) b.textContent = on ? '☀️' : '🌙';
  };
  const saved = localStorage.getItem('lumen_night') === '1';
  apply(saved);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#nightBtn')) return;
    const on = !document.documentElement.hasAttribute('data-night');
    localStorage.setItem('lumen_night', on ? '1' : '0');
    apply(on);
  });
})();

/* копирование ссылки страницы встречи (кнопки живут в модалках) */
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-mcopy]');
  if (b) { navigator.clipboard.writeText(location.origin + '/m/' + b.dataset.mcopy); toast('Ссылка на страницу встречи скопирована', null, true); }
});

/* ---------- глобальное состояние ---------- */
let STATE = null;
let CUR = 'overview';
const PAGE_STATE = { inboxLead: null, funnelGeo: '', wakePreview: [] };

const IS_SOLO = () => !!(STATE && STATE.settings.agency.edition === 'solo');

/* брокер-режим: админ-разделы недоступны и скрыты */
const BROKER_HIDDEN_PAGES = ['qualifier', 'sequences', 'wake', 'automations', 'ads', 'numbers', 'templates', 'brokers', 'analytics', 'settings', 'agency'];
function applyRoleUi() {
  const me = STATE && STATE.me;
  const isBroker = me && me.role === 'broker';
  const solo = IS_SOLO();
  $$('.nav-item').forEach(btn => {
    const hideB = isBroker && BROKER_HIDDEN_PAGES.includes(btn.dataset.page);
    const hideS = solo && btn.dataset.page === 'brokers';
    btn.style.display = (hideB || hideS) ? 'none' : '';
  });
  $$('.nav-label').forEach(lb => { /* прячем осиротевшие заголовки групп */
    let el2 = lb.nextElementSibling, any = false;
    while (el2 && !el2.classList.contains('nav-label')) { if (el2.style.display !== 'none') any = true; el2 = el2.nextElementSibling; }
    lb.style.display = isBroker && !any ? 'none' : '';
  });
  if (isBroker && BROKER_HIDDEN_PAGES.includes(CUR)) go('inbox');
  const foot = $('.side-foot .agency');
  if (foot && isBroker && !foot.dataset.roleBadge) { foot.dataset.roleBadge = '1'; foot.insertAdjacentHTML('beforeend', `<div style="font-size:9.5px;color:#86AFFF;margin-top:3px">брокер · ${esc(me.name || '')}</div>`); }
}

async function loadState() {
  STATE = await api.get('/state');
  applyRoleUi();
  $('#agencyName').textContent = STATE.settings.agency.name;
  try { localStorage.setItem('lumen_brand', JSON.stringify({ logo: STATE.settings.agency.logo || '', name: STATE.settings.agency.name || '' })); } catch (e) {}
  $('#agencyAva').textContent = STATE.settings.agency.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  $('#demoChip').style.display = STATE.settings.demo.simulateReplies ? 'flex' : 'none';
  /* живые счётчики в меню: непрочитанные диалоги и активные лиды */
  rebuildStages();
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
    btn.addEventListener('click', () => {
      /* клик по пункту меню = верхний уровень раздела: сбрасываем «внутренние» состояния */
      if (btn.dataset.page === 'properties') PAGE_STATE.propView = null;
      if (btn.dataset.page === 'collections') PAGE_STATE.collLead = '';
      if (btn.dataset.page === 'sequences') PAGE_STATE.seqEdit = null;
      go(btn.dataset.page);
    });
  });
}
function go(page) {
  CUR = page;
  /* раздел живёт в hash: F5 возвращает туда же (replaceState — без спама в историю) */
  if (location.hash !== '#' + page) history.replaceState(null, '', '#' + page);
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  $('#pageTitle').textContent = NAV[page].name;
  $('#pageSub').textContent = NAV[page].sub;
  $('#pageEmblem').innerHTML = ic(NAV[page].icon, 1.8);
  syncTopAction();
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
/* Рендер сериализован: медленная фоновая перерисовка не может перезаписать
   раздел, на который пользователь уже перешёл (была гонка poll vs клик). */
let renderBusy = false, renderQueued = false;
async function render() {
  if (renderBusy) { renderQueued = true; return; }
  closePop(); /* перерисовка не должна оставлять поповер-сироту над мёртвым селектом */
  closeHint();
  renderBusy = true;
  try {
    do {
      renderQueued = false;
      const page = CUR;
      const fn = PAGES[page];
      if (!fn) break;
      try {
        const c0 = $('#content');
        const isWave = c0.classList.contains('anim');
        await fn(c0);
        enhanceControls(c0);
        wireAiWand(c0);
        wireHeroArt(c0);
        if (isWave) countUp(c0);
        else { /* мягкое перестроение при фильтрах/обновлениях — без грубого скачка */
          c0.classList.remove('soft');
          void c0.offsetWidth;
          c0.classList.add('soft');
          clearTimeout(render._soft);
          render._soft = setTimeout(() => c0.classList.remove('soft'), 400);
        }
      } catch (e) {
        if (e.message === 'auth') return; // гейт уже показан
        /* инвариант: раздел никогда не остаётся молча пустым */
        console.error('[render]', page, e);
        $('#content').innerHTML = `<div class="glass card" style="max-width:520px;margin:60px auto;text-align:center">
          <div style="font-size:15px;font-weight:650;color:var(--navy-900);margin-bottom:6px">Раздел не загрузился</div>
          <div class="muted" style="font-size:12.5px;margin-bottom:16px">${esc(e.message || 'ошибка сети')} — данные не потеряны, попробуйте ещё раз</div>
          <button class="btn btn-accent" onclick="render()" style="margin:0 auto">Повторить</button>
        </div>`;
      }
      window._lastRenderAt = Date.now();
      if (CUR !== page) renderQueued = true; // пока рисовали — ушли на другой раздел
    } while (renderQueued);
  } finally { renderBusy = false; }
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

/* ---------- аватар лида: реальный (WA/TG/интегратор) или инициалы ---------- */
function avaHtml(l, size) {
  const st = size ? `style="width:${size}px;height:${size}px;flex:0 0 ${size}px"` : '';
  if (l.avatarUrl) return `<div class="ava" ${st}><img src="${esc(l.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit"></div>`;
  return `<div class="ava" ${st}>${esc((l.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase())}</div>`;
}

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
  const feedIcon = (t) => ({ lead_new: I.plus, msg_in: I.chat, qualified: I.spark, handover: I.handover, deal: I.flame, wake: I.wake, touch: I.chain, optout: I.moon, sleep: I.moon, number: I.sim, qual: I.check, stage: I.arrow, send_skip: I.shield, meeting: I.cal, merge: I.copy, ai_off: I.user, call: I.phone, view: I.eye }[t] || I.bolt);
  const feedCls = (t) => ({ deal: 'ok', qualified: 'ok', handover: 'ok', optout: 'warn', send_skip: 'warn', sleep: 'warn', ai_off: 'warn' }[t] || '');

  /* спарклайн: новые лиды по дням за 14 дней */
  const spark = (() => {
    const days = Array.from({ length: 14 }, (_, i) => {
      const d0 = new Date(); d0.setHours(0, 0, 0, 0); d0.setDate(d0.getDate() - (13 - i));
      const d1 = +d0 + 864e5;
      return leads.filter(l => l.createdAt >= +d0 && l.createdAt < d1).length;
    });
    const max = Math.max(...days, 1);
    const pts = days.map((v, i) => `${(i / 13 * 100).toFixed(1)},${(30 - v / max * 26).toFixed(1)}`).join(' ');
    return `<svg class="kpi-spark" viewBox="0 0 100 32" preserveAspectRatio="none">
      <polyline points="${pts}" fill="none" stroke="url(#spg)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <defs><linearGradient id="spg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#93B4FF"/><stop offset="1" stop-color="#2563EB"/></linearGradient></defs>
    </svg>`;
  })();
  /* дельты неделя-к-неделе — только там, где есть честные данные (createdAt / события) */
  const _wk = 7 * 864e5, _now = Date.now();
  const kd = (cur, prev) => {
    if (!cur && !prev) return '';
    if (!prev) return '<span class="kd up">новое</span>';
    const p = Math.round((cur - prev) / prev * 100);
    if (Math.abs(p) < 3) return '<span class="kd flat">ровно</span>';
    if (p > 500) return `<span class="kd up">×${Math.round(cur / prev)}</span>`;
    return `<span class="kd ${p > 0 ? 'up' : 'dn'}">${p > 0 ? '+' : ''}${p}%</span>`;
  };
  const _newTs = leads.map(l => l.createdAt).filter(Boolean);
  const _qualTs = (events || []).filter(e => ['qual', 'qualified', 'handover', 'deal'].includes(e.type)).map(e => e.at);
  const _cnt = (arr, from, to) => arr.filter(t => t > from && t <= to).length;
  const kdNew = kd(_cnt(_newTs, _now - _wk, _now), _cnt(_newTs, _now - 2 * _wk, _now - _wk));
  const kdQual = kd(_cnt(_qualTs, _now - _wk, _now), _cnt(_qualTs, _now - 2 * _wk, _now - _wk));
  root.innerHTML = `
    <div class="kpis">
      <div class="kpi glass"><div class="lbl">${ic(I.plus)}Новые лиды</div><div class="val">${f.new + f.touch}${kdNew}</div><div class="delta">касание ≤ 1 мин</div>${spark}</div>
      <div class="kpi glass"><div class="lbl">${ic(I.chat)}В работе у ИИ</div><div class="val">${inDialog + f.dialog}</div><div class="delta">${f.dialog} в живом диалоге</div></div>
      <div class="kpi glass"><div class="lbl">${ic(I.spark)}Квалифицировано</div><div class="val">${f.qualified + f.handover + f.viewing + f.deal}${kdQual}</div><div class="delta">${f.deal} дошло до сделки</div></div>
      <div class="kpi glass"><div class="lbl">${ic(I.send)}Отправлено сегодня</div><div class="val">${an.wa.sentToday}</div><div class="delta">${an.wa.numbersActive} ${plural(an.wa.numbersActive, 'номер', 'номера', 'номеров')} · ${an.wa.avgQuality}%</div></div>
    </div>
    <div class="card mb f3card">
      <div class="card-title">${ic(I.funnel)}Воронка<span class="sub">${leads.length} ${plural(leads.length, 'лид', 'лида', 'лидов')}</span></div>
      ${(() => {
        const shown = STAGES.filter(s => !['lost'].includes(s.id));
        const TIER = { new: 0, touch: 0, dialog: 1, qualified: 2, handover: 2, sleeping: -1 };
        const rows = shown.map((s, i) => {
          const v = f[s.id] || 0;
          const prevV = i > 0 ? (f[shown[i - 1].id] || 0) : 0;
          const conv = i > 0 && prevV > 0 ? Math.round(v / prevV * 100) : null;
          const prevName = i > 0 ? shown[i - 1].name : null;
          const tier = TIER[s.id] != null ? TIER[s.id] : 3;
          return `<div class="f3row" data-f3go data-tier="${tier}" style="--fd:${i * 45}ms">
            <div class="f3txt">
              <div class="f3name">${s.name}</div>
              <div class="f3conv">${s.id === 'sleeping' ? 'реанимация будит волнами' : i === 0 ? 'вход воронки' : conv != null && conv <= 100 ? conv + '% из «' + prevName.toLowerCase() + '»' : ''}</div>
            </div>
            <div class="f3num">${v}</div>
          </div>`;
        });
        return `<div class="f3 v2">
          <div class="f3side left">${rows.slice(0, 4).join('')}</div>
          <div class="f3stage">
            <div class="f3glow"></div>
            ${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<i class="f3p" style="--pd:${(i * 0.42).toFixed(2)}s;--px:${(i * 37) % 120 - 60}px"></i>`).join('')}
            <div class="f3funwrap">
              <img class="f3fun" src="assets/funnel-cut.png" alt="">
              <b class="f3t" data-t3="0" style="top:3%;width:96%;height:26%"></b>
              <b class="f3t" data-t3="1" style="top:31%;width:70%;height:20%"></b>
              <b class="f3t" data-t3="2" style="top:52%;width:52%;height:17%"></b>
              <b class="f3t" data-t3="3" style="top:70%;width:38%;height:20%"></b>
            </div>
          </div>
          <div class="f3side right">${rows.slice(4).join('')}</div>
        </div>`;
      })()}
    </div>
    <div class="ov-grid">
      <div>
        <div class="glass card">
          <div class="card-title">${ic(I.bars)}Первая линия: показатели</div>
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
        <div class="card-title">${ic(I.bolt)}Живая лента</div>
        <div class="feed">
          ${events.slice(0, 8).map(e => `<div class="feed-item"><div class="feed-dot ${feedCls(e.type)}">${ic(feedIcon(e.type))}</div><div><div class="feed-text">${esc(e.text)}</div><div class="feed-time">${ago(e.at)}</div></div></div>`).join('') || '<div class="empty">Событий пока нет</div>'}
        </div>
        ${events.length > 8 ? coll(`Раньше`, events.slice(8).map(e => `<div class="feed-item"><div class="feed-dot ${feedCls(e.type)}">${ic(feedIcon(e.type))}</div><div><div class="feed-text">${esc(e.text)}</div><div class="feed-time">${ago(e.at)}</div></div></div>`).join(''), { open: false, count: events.length - 8, icon: I.clock }) : ''}
      </div>
    </div>`;
  $$('[data-f3go]', root).forEach(r => {
    r.addEventListener('click', () => go('funnel'));
    /* наведение на стадию подсвечивает соответствующий ярус стеклянной воронки */
    r.addEventListener('mouseenter', () => { const t = $(`.f3t[data-t3="${r.dataset.tier}"]`, root); if (t) t.classList.add('on'); });
    r.addEventListener('mouseleave', () => $$('.f3t.on', root).forEach(x => x.classList.remove('on')));
  });
};

/* ---------------- ВОРОНКА (канбан) ---------------- */
PAGES.funnel = async (root) => {
  const all = await api.get('/leads');
  const F = PAGE_STATE;
  const geos = STATE.settings.agency.geos;
  const q = (F.funnelQ || '').toLowerCase();
  const leads = all.filter(l =>
    (!F.funnelGeo || l.geo === F.funnelGeo) &&
    (!F.funnelSrc || l.source === F.funnelSrc) &&
    (!F.funnelBroker || l.broker === F.funnelBroker) &&
    (!q || l.name.toLowerCase().includes(q) || l.phone.includes(q)) &&
    (!F.funnelFlag ||
      (F.funnelFlag === 'overdue' && l.nextAction && l.nextAction.at && l.nextAction.at < Date.now()) ||
      (F.funnelFlag === 'human' && (l.tags || []).includes('нужен человек')) ||
      (F.funnelFlag === 'hot' && l.hint && l.hint.kind === 'act') ||
      (F.funnelFlag === 'ai' && l.ai && l.ai.enabled)));
  const srcs = [...new Set(all.map(l => l.source))];
  const view = F.funnelView || 'kanban';
  const srcName = { meta_form: 'Lead Form', ctwa: 'CTWA', site: 'Сайт', manual: 'Вручную', wa_inbound: 'Входящий WA' };

  root.innerHTML = `
    <div class="filters">
      <input id="fQ" placeholder="Имя или номер…" value="${esc(F.funnelQ || '')}" style="width:180px">
      <select id="fGeo"><option value="">Все направления</option>${geos.map(g => `<option value="${g}" ${F.funnelGeo === g ? 'selected' : ''}>${STATE.settings.geoNames[g]}</option>`).join('')}</select>
      <select id="fSrc"><option value="">Все источники</option>${srcs.map(x => `<option value="${x}" ${F.funnelSrc === x ? 'selected' : ''}>${srcName[x] || x}</option>`).join('')}</select>
      <select id="fBroker"><option value="">Все брокеры</option>${STATE.brokers.map(b => `<option value="${b.id}" ${F.funnelBroker === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
      <div class="seg-toggle">
        ${[['', 'Все'], ['hot', 'Горячие'], ['overdue', 'Просрочка'], ['human', 'Ждут менеджера'], ['ai', 'ИИ ведёт']].map(([k, n]) => `<button class="seg-btn ${(F.funnelFlag || '') === k ? 'on' : ''}" data-flag="${k}">${n}</button>`).join('')}
      </div>
      <span class="tb-spacer"></span>
      <button class="btn btn-sm" id="importBtn">${ic(I.doc)}Импорт</button>
      <button class="btn btn-sm" id="dupesBtn">${ic(I.copy)}Дубли</button>
      <span class="muted" style="font-size:12px">${leads.length} из ${all.length}</span>
      <div class="seg-toggle">
        <button class="seg-btn ${view === 'kanban' ? 'on' : ''}" data-view="kanban" title="Канбан">${ic(I.grid)}</button>
        <button class="seg-btn ${view === 'table' ? 'on' : ''}" data-view="table" title="Таблица">${ic(I.doc)}</button>
      </div>
    </div>
    ${view === 'kanban' ? `
    <div class="kanban">
      ${STAGES.map(st => {
        const items = leads.filter(l => l.stage === st.id);
        return `<div class="kb-col" data-stage="${st.id}">
          <div class="kb-head"><span class="kb-ic">${ic(I[st.icon])}</span><span class="nm">${st.name}</span><span class="ct">${items.length}</span></div>
          <div class="kb-cards">
            ${items.map(l => `<div class="lead-card glass" data-id="${l.id}" data-stage="${l.stage}">
              <div class="top"><div class="nm">${esc(l.name)}</div>${scoreRing(l.score)}</div>
              <div class="geo">${l.geoName} · ${esc(l.phone)}</div>
              <div class="axes">${['purpose', 'timeline', 'budget', 'type'].map(a => `<i class="${l.quals[a] ? 'on' : ''}"></i>`).join('')}</div>
              <div class="foot">
                ${l.ai && l.ai.enabled ? '<span class="mini-badge ai">ИИ</span>' : ''}
                ${l.brokerName ? `<span class="mini-badge ok">${esc(l.brokerName.split(' ')[0])}</span>` : ''}
                ${l.wakeScore != null ? `<span class="mini-badge warn">score ${l.wakeScore}</span>` : ''}
                ${l.nextAction && l.nextAction.at && l.nextAction.at < Date.now() ? '<span class="mini-badge warn">просрочен шаг</span>' : ''}
                ${(l.tags || []).includes('нужен человек') ? `<span class="mini-badge warn" title="нужен человек">${ic(I.user, 2)}</span>` : ''}
                <span class="tm">${ago(l.lastMsgAt || l.createdAt)}</span>
              </div>
            </div>`).join('') || '<div class="empty" style="padding:14px;font-size:11.5px">пусто</div>'}
          </div>
        </div>`;
      }).join('')}
    </div>` : `
    <div class="glass card" style="padding:8px 0">
      <table class="tbl lead-tbl"><thead><tr>
        ${[['name', 'Лид'], ['stage', 'Стадия'], ['geo', 'Гео'], ['budget', 'Бюджет'], ['axes', 'Квал'], ['broker', 'Брокер'], ['last', 'Контакт'], ['next', 'Следующий шаг']].map(([k, n]) => `<th data-sort="${k}" style="cursor:pointer">${n}${F.funnelSort === k ? ' ↓' : ''}</th>`).join('')}
      </tr></thead><tbody>
        ${leads.sort((a, b) => {
          const k = F.funnelSort;
          if (k === 'budget') return ((b.quals.budget || {}).num || 0) - ((a.quals.budget || {}).num || 0);
          if (k === 'axes') return b.axesFilled - a.axesFilled;
          if (k === 'stage') return STAGES.findIndex(x => x.id === a.stage) - STAGES.findIndex(x => x.id === b.stage);
          if (k === 'last') return (b.lastMsgAt || 0) - (a.lastMsgAt || 0);
          if (k === 'broker') return (a.brokerName || 'я').localeCompare(b.brokerName || 'я');
          if (k === 'geo') return a.geo.localeCompare(b.geo);
          if (k === 'next') return ((a.nextAction || {}).at || Infinity) - ((b.nextAction || {}).at || Infinity);
          return a.name.localeCompare(b.name);
        }).map(l => `<tr data-row="${l.id}" style="cursor:pointer">
          <td><div style="display:flex;gap:9px;align-items:center">${avaHtml(l, 28)}<div><b>${esc(l.name)}</b><div class="muted" style="font-size:10.5px">${esc(l.phone)}</div></div></div></td>
          <td><span class="badge ${['qualified', 'handover', 'deal'].includes(l.stage) ? 'ok' : l.stage === 'sleeping' ? '' : 'acc'}">${stageName(l.stage)}</span></td>
          <td>${l.geoName}</td>
          <td>${(l.quals.budget || {}).value || '—'}</td>
          <td><div class="axes" style="width:52px;margin:0">${['purpose', 'timeline', 'budget', 'type'].map(a => `<i class="${l.quals[a] ? 'on' : ''}"></i>`).join('')}</div></td>
          <td>${l.brokerName ? esc(l.brokerName.split(' ')[0]) : '—'}</td>
          <td class="muted" style="font-size:11.5px">${ago(l.lastMsgAt || l.createdAt)}</td>
          <td style="font-size:11.5px;${l.nextAction && l.nextAction.at && l.nextAction.at < Date.now() ? 'color:var(--bad);font-weight:650' : ''}">${l.nextAction ? esc(l.nextAction.text.slice(0, 34)) : '—'}</td>
        </tr>`).join('')}
      </tbody></table>
    </div>`}`;

  const setF = (k, v) => { PAGE_STATE[k] = v; render(); };
  $('#fQ').addEventListener('input', (e) => { clearTimeout(PAGE_STATE._fq); PAGE_STATE._fq = setTimeout(() => setF('funnelQ', e.target.value), 350); });
  $('#fGeo').addEventListener('change', (e) => setF('funnelGeo', e.target.value));
  $('#fSrc').addEventListener('change', (e) => setF('funnelSrc', e.target.value));
  $('#fBroker').addEventListener('change', (e) => setF('funnelBroker', e.target.value));
  $$('[data-flag]', root).forEach(b => b.addEventListener('click', () => setF('funnelFlag', b.dataset.flag)));
  $$('[data-view]', root).forEach(b => b.addEventListener('click', () => setF('funnelView', b.dataset.view)));
  $$('[data-sort]', root).forEach(h => h.addEventListener('click', () => setF('funnelSort', h.dataset.sort)));
  $$('[data-row]', root).forEach(r => r.addEventListener('click', () => openLeadModal(r.dataset.row)));
  $$('.lead-card', root).forEach(c => c.addEventListener('click', () => { if (!DRAG.moved) openLeadModal(c.dataset.id); }));
  $('#importBtn').addEventListener('click', () => modal({
    title: 'Импорт действующей базы',
    sub: 'Из Bitrix24 / amoCRM / Excel. Дубли по номеру не создаются — карточки обогащаются. Импортированные попадают в «Спящие» с выключенным ИИ (их поднимет реанимация по скорингу) — база не получит внезапную рассылку.',
    wide: true,
    body: `
      <div class="lp-sec" style="margin-top:0">Вариант 1 · CSV/Excel (универсальный: амо, Битрикс, таблица)</div>
      <div class="muted" style="font-size:11.5px;margin-bottom:6px">Экспортируйте лидов в CSV и вставьте сюда. Колонки распознаются по заголовку: имя, телефон (обязательно), email, статус, бюджет, комментарий, гео.</div>
      <textarea id="impCsv" style="min-height:120px;font-family:Menlo,monospace;font-size:11.5px" placeholder="Имя;Телефон;Email;Статус;Комментарий
Иван Петров;+79161234567;ivan@mail.ru;В работе;Интересовался студией"></textarea>
      <div class="lp-sec">Вариант 2 · Bitrix24 напрямую</div>
      <div class="muted" style="font-size:11.5px;margin-bottom:6px">Bitrix24 → Разработчикам → Другое → Входящий вебхук (право crm) → вставьте URL вида https://домен.bitrix24.ru/rest/1/код</div>
      <input id="impB24" placeholder="https://mycompany.bitrix24.ru/rest/1/abc123xyz" style="width:100%">
      <div class="lp-sec">Куда сложить</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-row"><label>Направление</label><select id="impGeo">${STATE.settings.agency.geos.map(g => `<option value="${g}">${STATE.settings.geoNames[g]}</option>`).join('')}</select></div>
        <div class="form-row"><label>Стадия</label><select id="impStage"><option value="sleeping">Спящие (рекомендуем)</option>${(STAGES._all || STAGES).filter(x => x.id !== 'sleeping').map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div>
      </div>
      <div class="muted" style="font-size:11px">amoCRM: экспорт в CSV через Списки → Экспорт (прямое API-подключение добавим при необходимости).</div>`,
    actions: [
      { label: 'Импортировать', cls: 'btn-accent', onClick: async (bd) => {
        const defaults = { geo: $('#impGeo', bd).value, stage: $('#impStage', bd).value };
        const b24 = $('#impB24', bd).value.trim();
        const csv = $('#impCsv', bd).value.trim();
        if (!b24 && !csv) { toast('Вставьте CSV или вебхук Bitrix24'); return false; }
        const r = b24
          ? await api.post('/import/bitrix', { webhookUrl: b24, defaults })
          : await api.post('/import/csv', { csv, defaults });
        if (r.error) { toast('Импорт не прошёл', r.error); return false; }
        toast(`Импортировано: ${r.created}`, `дублей обогащено: ${r.merged}${r.skipped != null ? ' · пропущено: ' + r.skipped : ''}`, true);
        render();
      } },
      { label: 'Отмена' },
    ],
  }));
  const db = $('#dupesBtn');
  if (db) db.addEventListener('click', async () => openDupesModal(await api.get('/duplicates')));
  wireKanbanDrag(root);
};

/* ---------- drag предметов на папки (объекты/подборки) ---------- */
function wireShelfDrag(root, itemSel, onDrop) {
  $$(itemSel, root).forEach(card => card.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button,a,input,select,label')) return;
    const startX = e.clientX, startY = e.clientY;
    let ghost = null;
    DRAG.moved = false;
    const onMove = (ev) => {
      if (!ghost && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 8) return;
      if (!ghost) {
        DRAG.moved = true; DRAG.active = true;
        const r = card.getBoundingClientRect();
        ghost = card.cloneNode(true);
        ghost.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${Math.min(r.width, 260)}px;z-index:400;pointer-events:none;opacity:.92;box-shadow:var(--shadow-lift);transition:transform .25s var(--ease-spring);transform:rotate(0) scale(1)`;
        document.body.appendChild(ghost);
        requestAnimationFrame(() => { ghost.style.transform = 'rotate(2.5deg) scale(.88)'; });
        card.style.opacity = '.35';
        card.style.transition = 'opacity .2s';
      }
      ghost.style.left = (ev.clientX - 60) + 'px';
      ghost.style.top = (ev.clientY - 30) + 'px';
      $$('.fold', root).forEach(f => f.classList.remove('drop'));
      $$(itemSel, root).forEach(x => x.classList.remove('stack-target'));
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const fold = under && under.closest('.fold[data-fid], .fold[data-cfid]');
      if (fold) fold.classList.add('drop');
      else { const ov = under && under.closest(itemSel); if (ov && ov !== card && card.dataset.dragprop) ov.classList.add('stack-target'); }
    };
    const onUp = async (ev) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (!ghost) return;
      ghost.remove();
      card.style.opacity = '';
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const fold = under && under.closest('.fold[data-fid], .fold[data-cfid]');
      $$('.fold', root).forEach(f => f.classList.remove('drop'));
      $$(itemSel, root).forEach(x => x.classList.remove('stack-target'));
      setTimeout(() => { DRAG.moved = false; DRAG.active = false; }, 60);
      if (fold) {
        await onDrop(card.dataset.dragprop || card.dataset.dragcoll, fold.dataset.fid || fold.dataset.cfid);
        toast('Разложено в папку', null, true);
        return;
      }
      /* наслоение объекта на объект → предложить собрать из них подборку/папку (iOS-паттерн) */
      const other = under && under.closest(itemSel);
      if (other && other !== card && card.dataset.dragprop) {
        const a = card.dataset.dragprop, b2 = other.dataset.dragprop;
        other.classList.add('stack-pop');
        setTimeout(() => other.classList.remove('stack-pop'), 500);
        modal({
          title: 'Два объекта вместе',
          sub: 'Вы наложили один объект на другой — собрать из них что-то?',
          actions: [
            { label: 'Подборку из двух', cls: 'btn-accent', onClick: async () => {
              await api.post('/collections', { title: 'Подборка · 2 объекта', propertyIds: [b2, a] });
              toast('Подборка создана', 'Открываю «Подборки»', true);
              PAGE_STATE.collLead = '';
              go('collections');
            } },
            { label: 'Папку с ними', onClick: async () => {
              const f = await api.post('/folders', { name: 'Новая папка', kind: 'prop' });
              await api.patch('/properties/' + a, { folderId: f.id });
              await api.patch('/properties/' + b2, { folderId: f.id });
              render();
            } },
            { label: 'Отмена' },
          ],
        });
      }
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }));
}

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
  /* неделя календаря: смещение хранится в PAGE_STATE.calWeek */
  const wk = PAGE_STATE.calWeek || 0;
  const mon = (() => { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day + wk * 7); d.setHours(0, 0, 0, 0); return d; })();
  const H0 = 9, H1 = 21, HPX = 44;
  const dayCols = Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
  const brF = PAGE_STATE.calBroker || '';
  const listF = brF ? list.filter(mt => mt.brokerId === brF) : list;
  const calBlocks = (d) => listF.filter(mt => { const t = new Date(mt.at); return t.toDateString() === d.toDateString(); })
    .map(mt => { const t = new Date(mt.at); const top = Math.max(0, (t.getHours() + t.getMinutes() / 60 - H0) * HPX);
      return `<div class="cal-ev st-${mt.status}" style="top:${top}px" data-mtid="${mt.id}" data-mtdrag="${mt.id}" title="${esc(mt.leadName)} · перетащите для переноса"><b>${tmm(mt.at)}</b> ${esc(mt.leadName.split(' ')[0])}<span>${esc(mt.brokerName.split(' ')[0])}</span></div>`; }).join('');
  const calHtml = `
    <div class="glass card mb">
      <div class="card-title">${ic(I.cal)}Календарь недели ${hint('meet', 'Как работают встречи', [
        ['Слот из диалога', 'ИИ довёл до квалификации → в панели лида «Назначить встречу»'],
        ['WhatsApp-подтверждение', 'Клиенту уходит время и имя эксперта тем же каналом'],
        ['Перенос словами', '«Давайте позже» — менеджер двигает слот в один клик'],
        ['Не пришёл — не потерян', 'Статус возвращает лида в работу, а не в архив'],
        ['Календарь', 'Клик по слоту — новая встреча; клик по встрече — карточка лида']])}
        <span class="sub" style="display:flex;gap:8px;align-items:center">
          <select id="calBroker" style="width:150px"><option value="">Все брокеры</option>${STATE.brokers.map(b => `<option value="${b.id}" ${brF === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
          <button class="btn btn-sm" id="calPrev">${ic(I.chev)}</button>
          <b style="color:var(--navy-900)">${mon.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} — ${dayCols[6].toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</b>
          <button class="btn btn-sm" id="calNext" style="transform:none">${ic(I.chev)}</button>
        </span></div>
      <div class="cal-grid" style="--hpx:${HPX}px">
        <div class="cal-hours">${Array.from({ length: H1 - H0 }, (_, i) => `<div>${H0 + i}:00</div>`).join('')}</div>
        ${dayCols.map(d => `<div class="cal-day ${d.toDateString() === new Date().toDateString() ? 'today' : ''}" data-day="${d.toISOString().slice(0, 10)}">
          <div class="cal-dhead">${['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'][(d.getDay() + 6) % 7]} <b>${d.getDate()}</b></div>
          <div class="cal-body" style="height:${(H1 - H0) * HPX}px">${d.toDateString() === new Date().toDateString() && new Date().getHours() >= H0 && new Date().getHours() < H1 ? `<div class="cal-now" style="top:${(new Date().getHours() + new Date().getMinutes() / 60 - H0) * HPX}px"></div>` : ''}${calBlocks(d)}
            ${Array.from({ length: H1 - H0 }, (_, i) => `<div class="cal-slot" style="top:${i * HPX}px" data-h="${H0 + i}"></div>`).join('')}</div>
        </div>`).join('')}
      </div>
    </div>`;
  const kindRu = { call: 'Созвон', video: 'Видео-показ', tour: 'Показ объекта' };
  const stBadge = { scheduled: '<span class="badge acc">назначена</span>', done: '<span class="badge ok">прошла</span>', no_show: '<span class="badge bad">не пришёл</span>', canceled: '<span class="badge">отменена</span>' };
  const byDay = {};
  for (const mt of list) {
    const d = new Date(mt.at).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
    (byDay[d] = byDay[d] || []).push(mt);
  }
  const mtWeek = listF.filter(mt => { const t = new Date(mt.at); return t >= mon && t < new Date(+mon + 7 * 864e5); });
  const mtNext = list.filter(mt => mt.at > Date.now() && mt.status === 'planned').sort((a2, b2) => a2.at - b2.at)[0];
  root.innerHTML = heroArt('assets/art/calendar.png', `
      <div class="ha-title">${ic(I.cal)}Встречи<span class="sub">показы, звонки и Zoom — подтверждения уходят в WhatsApp сами</span></div>
      ${[
        ['На этой неделе', mtWeek.length, 'в календаре ниже'],
        mtNext ? ['Ближайшая', new Date(mtNext.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ' ' + tmm(mtNext.at), esc(mtNext.leadName) + ' · ' + esc(mtNext.brokerName.split(' ')[0])] : null,
        ['Прошли · не пришёл', list.filter(mt => mt.status === 'done').length + ' · ' + list.filter(mt => mt.status === 'noshow').length, 'за всё время'],
      ].filter(Boolean).map(([k, v, sub]) => `<div class="ha-row" data-ha>
        <span class="nm2">${k}<div class="sub2">${sub}</div></span><span class="sp2"></span><span class="val2">${v}</span>
      </div>`).join('')}
    `) + calHtml + `
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
    </div>`;
  $$('[data-mt]', root).forEach(b => b.addEventListener('click', async () => {
    await api.patch('/meetings/' + b.dataset.mt, { status: b.dataset.st });
    render();
  }));
  $('#calPrev').addEventListener('click', () => { PAGE_STATE.calWeek = (PAGE_STATE.calWeek || 0) - 1; render(); });
  $('#calNext').addEventListener('click', () => { PAGE_STATE.calWeek = (PAGE_STATE.calWeek || 0) + 1; render(); });
  $('#calBroker').addEventListener('change', (e) => { PAGE_STATE.calBroker = e.target.value; render(); });
  $$('.cal-ev', root).forEach(evEl => {
    /* клик — быстрый редактор; drag — перенос на другой слот */
    let dragGhost = null, downAt = null;
    evEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      downAt = { x: e.clientX, y: e.clientY };
      const mt = list.find(x => x.id === evEl.dataset.mtid);
      const onMove = (ev2) => {
        if (!dragGhost && Math.hypot(ev2.clientX - downAt.x, ev2.clientY - downAt.y) < 7) return;
        if (!dragGhost) {
          DRAG.moved = true; DRAG.active = true;
          const r = evEl.getBoundingClientRect();
          dragGhost = evEl.cloneNode(true);
          dragGhost.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;z-index:400;pointer-events:none;opacity:.9`;
          document.body.appendChild(dragGhost);
          evEl.style.opacity = '.3';
        }
        dragGhost.style.left = (ev2.clientX - 50) + 'px';
        dragGhost.style.top = (ev2.clientY - 18) + 'px';
        $$('.cal-slot', root).forEach(x => x.classList.remove('cal-hot'));
        const under = document.elementFromPoint(ev2.clientX, ev2.clientY);
        const slot = under && under.closest('.cal-slot');
        if (slot) slot.classList.add('cal-hot');
      };
      const onUp = async (ev2) => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        $$('.cal-slot', root).forEach(x => x.classList.remove('cal-hot'));
        setTimeout(() => { DRAG.moved = false; DRAG.active = false; }, 60);
        if (!dragGhost) {
          /* клик: быстрый редактор встречи */
          modal({
            title: 'Встреча · ' + esc(mt.leadName),
            sub: `${new Date(mt.at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} · ${esc(mt.brokerName)}${mt.link ? ' · есть видео-комната' : ''}`,
            body: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div class="form-row"><label>Дата</label><input id="emDate" type="date" value="${(d2 => `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`)(new Date(mt.at))}"></div>
              <div class="form-row"><label>Время</label><input id="emTime" type="time" value="${tmm(mt.at)}"></div></div>
              <div class="form-row" style="margin-top:6px"><label>Страница встречи для клиента${mt.clientConfirmed ? ' · ✓ подтвердил' : ''}${mt.pageViews ? ' · открывал ' + mt.pageViews + ' раз' : ''}</label>
                <div style="display:flex;gap:8px;align-items:center"><code class="pill" style="flex:1;overflow-x:auto;white-space:nowrap;padding:8px 10px">${location.origin}/m/${mt.id}</code>
                <button class="btn btn-sm" data-mcopy="${mt.id}">${ic(I.copy)}</button>
                <a class="btn btn-sm" href="/m/${mt.id}" target="_blank">${ic(I.eye)}</a></div></div>`,
            actions: [
              { label: 'Перенести', cls: 'btn-accent', onClick: async (bd) => {
                const at = new Date($('#emDate', bd).value + 'T' + $('#emTime', bd).value).getTime();
                await api.patch('/meetings/' + mt.id, { at });
                render();
              } },
              { label: 'Карточка лида', onClick: () => openLeadModal(mt.leadId) },
              { label: 'Закрыть' },
            ],
          });
          dragGhost = null;
          return;
        }
        dragGhost.remove();
        evEl.style.opacity = '';
        const under = document.elementFromPoint(ev2.clientX, ev2.clientY);
        const slot = under && under.closest('.cal-slot');
        if (slot) {
          const day = slot.closest('.cal-day').dataset.day;
          const at = new Date(day + 'T' + String(slot.dataset.h).padStart(2, '0') + ':00').getTime();
          await api.patch('/meetings/' + mt.id, { at });
          toast('Встреча перенесена', new Date(at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), true);
          render();
        }
        dragGhost = null;
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  });
  $$('.cal-slot', root).forEach(slot => slot.addEventListener('click', async () => {
    const day = slot.closest('.cal-day').dataset.day;
    const leads = (await api.get('/leads')).filter(l => !['lost'].includes(l.stage));
    modal({
      title: 'Встреча · ' + new Date(day + 'T12:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) + ', ' + slot.dataset.h + ':00',
      sub: 'Клиент получит WhatsApp-подтверждение (для видео — со ссылкой на комнату)',
      body: `
        <div class="form-row"><label>Лид</label><select id="csLead">${leads.map(l => `<option value="${l.id}">${esc(l.name)} · ${l.geoName}</option>`).join('')}</select></div>
        <div class="form-row"><label>Тип</label><select id="csKind"><option value="call">Созвон</option><option value="video">Видео-показ</option><option value="tour">Показ объекта</option></select></div>
        <div class="form-row"><label>Время</label><input id="csTime" type="time" value="${String(slot.dataset.h).padStart(2, '0')}:00"></div>`,
      actions: [
        { label: 'Назначить', cls: 'btn-accent', onClick: async (bd) => {
          const at = new Date(day + 'T' + $('#csTime', bd).value).getTime();
          await api.post('/meetings', { leadId: $('#csLead', bd).value, kind: $('#csKind', bd).value, at });
          render();
        } },
        { label: 'Отмена' },
      ],
    });
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


async function openLeadModal(id) {
  const l = await api.get('/leads/' + id);
  const axName = { purpose: 'Цель', timeline: 'Срок', budget: 'Бюджет', type: 'Объект' };
  const kindRu = { call: 'Созвон', video: 'Видео-показ', tour: 'Показ' };
  const contactKinds = { telegram: 'Telegram', email: 'E-mail', instagram: 'Instagram', whatsapp: 'WhatsApp #2', other: 'Другое' };

  /* единая хронология: сообщения + события + заметки + встречи */
  const timeline = [
    ...(l.messages || []).map(m => ({ at: m.at, kind: 'msg', m })),
    ...(l.transcripts || []).map(t => ({ at: t.at, kind: 'call', t })),
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
    if (t.kind === 'call') return `<div class="tl-item" data-f="call"><div class="tl-dot meet">${ic(I.phone)}</div>
      <div class="tl-body">${coll(esc(t.t.label) + ' · транскрипт', `<div class="tl-text" style="white-space:pre-line;font-size:12.3px;padding:6px 0">${esc(t.t.text)}</div>`, { open: false, icon: I.phone })}
      <div class="tl-head"><span>${ago(t.at)} · учитывается в ИИ-сводке</span></div></div></div>`;
    if (t.kind === 'meet') return `<div class="tl-item" data-f="ev"><div class="tl-dot meet">${ic(I.cal)}</div>
      <div class="tl-body"><div class="tl-text">${kindRu[t.mt.kind] || 'Встреча'} с ${esc(t.mt.brokerName)} · ${new Date(t.mt.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${t.mt.link ? ` · <a class="link" href="${t.mt.link}" target="_blank">видео-комната</a>` : ''}</div>
      <div class="tl-head"><span>${{ scheduled: 'назначена', done: 'прошла', no_show: 'не пришёл', canceled: 'отменена' }[t.mt.status]}</span></div></div></div>`;
    return '';
  };

  const FUNNEL_STEPS = ['new', 'touch', 'dialog', 'qualified', 'handover', 'viewing', 'deal'];
  const stepIdx = FUNNEL_STEPS.indexOf(l.stage);

  /* хронология: последние записи сразу, ранние — по кнопке (карточка не тонет в ленте) */
  const TL_SHOW = 8;
  const tlHtml = timeline.length
    ? timeline.slice(0, TL_SHOW).map(tlItem).join('')
      + (timeline.length > TL_SHOW
        ? `<button class="tl-old-btn" id="tlMore">Показать ранние · ${timeline.length - TL_SHOW}</button><div class="tl-old" style="display:none">${timeline.slice(TL_SHOW).map(tlItem).join('')}</div>`
        : '')
    : '<div class="empty">Хронология пуста</div>';
  const bd = modal({
    title: l.name,
    sub: `<span class="lp-phone" id="lcPhone" title="Скопировать">${esc(l.phone)}</span> · ${l.geoName} · источник: ${l.source} · создан ${ago(l.createdAt)}`,
    wide: 'card',
    body: `
      <div class="lc-funnel">${FUNNEL_STEPS.map((st, i) => `<div class="lcf-step ${i < stepIdx ? 'done' : ''} ${i === stepIdx ? 'cur' : ''}"><i></i><span>${stageName(st)}</span></div>`).join('')}${l.stage === 'sleeping' ? '<div class="lcf-step warn cur"><i></i><span>Спит</span></div>' : ''}${l.stage === 'lost' ? '<div class="lcf-step bad cur"><i></i><span>Закрыт</span></div>' : ''}</div>
      ${l.hint ? `<div class="lc-hint ${l.hint.kind}">${ic(l.hint.kind === 'warn' ? I.shield : l.hint.kind === 'act' ? I.bolt : I.spark)}${esc(l.hint.text)}</div>` : ''}
      ${l.playTip ? `<div class="lc-hint info" style="border-style:dashed">${ic(I.flame)}<span><b>Приём:</b> ${esc(l.playTip.tip)}</span></div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        ${(l.tags || []).map(t => `<span class="badge">${esc(t)}</span>`).join('')}
      </div>
      <div class="lc-grid">
        <div class="lc-left">
          <div class="lc-note-row">
            <input id="lcNote" placeholder="Комментарий по лиду… (Enter — сохранить)">
            <button class="btn btn-accent btn-sm" id="lcNoteAdd">${ic(I.plus)}</button>
            <button class="btn btn-sm" id="lcCallBtn" title="Загрузить запись звонка/Zoom — расшифруется сама">${ic(I.mic || I.phone)}Звонок</button>
            <input type="file" id="lcCallFile" accept="audio/*,video/mp4,.m4a,.mp3,.wav,.ogg,.webm" style="display:none">
          </div>
          <div class="lc-filters">
            <button class="btn btn-sm lc-f active" data-f="all">Всё</button>
            <button class="btn btn-sm lc-f" data-f="msg">Переписка</button>
            <button class="btn btn-sm lc-f" data-f="note">Комментарии</button>
            <button class="btn btn-sm lc-f" data-f="call">Звонки</button>
            <button class="btn btn-sm lc-f" data-f="ev">События</button>
          </div>
          <div class="lc-timeline" id="lcTimeline">${tlHtml}</div>
        </div>
        <div class="lc-right">
          <div class="lc-ai ${l.ai.enabled ? 'on' : ''}">
            <div class="lc-ai-head">${ic(I.spark)}<b>ИИ-помощник</b>
              <label class="switch" title="Автопилот"><input type="checkbox" id="lcAi" ${l.ai.enabled ? 'checked' : ''}><span class="tr"></span><span class="th"></span></label></div>
            <div class="lc-ai-sub">${l.ai.enabled ? 'Ведёт диалог сам. Напишете вручную — встанет на паузу.' : (l.tags || []).includes('нужен человек') ? 'Отключился сам: клиент попросил человека.' : 'На паузе — лид на менеджере.'}</div>
            <button class="btn btn-sm" id="lcSumBtn" style="margin-top:9px">${ic(I.doc)}Сводка ИИ по лиду</button>
          </div>
          <div class="lc-3sel">
            <div><label class="lc-lbl">Стадия</label><select id="mStage">${STAGES.map(s => `<option value="${s.id}" ${l.stage === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}</select></div>
            <div><label class="lc-lbl">Направление</label><select id="mGeo">${STATE.settings.agency.geos.map(g => `<option value="${g}" ${l.geo === g ? 'selected' : ''}>${STATE.settings.geoNames[g]}</option>`).join('')}</select></div>
            <div><label class="lc-lbl">Брокер</label><select id="mBroker"><option value="">— не назначен</option>${STATE.brokers.map(b => `<option value="${b.id}" ${l.broker === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>
          </div>
          <div class="lp-sec">Следующий шаг</div>
          <div class="lc-note-row">
            <input id="lcNaText" placeholder="например: дожать по подборке" value="${esc((l.nextAction || {}).text || '')}">
            <input id="lcNaDate" type="date" value="${l.nextAction && l.nextAction.at ? (d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date(l.nextAction.at)) : ''}" style="width:150px;flex:0 0 150px">
            <button class="btn btn-sm" id="lcNaSave">${ic(I.check)}</button>
          </div>
          ${l.ads && l.ads.adId ? `<div class="lp-ad" style="margin-top:12px">${ic(I.target)}${l.ads.matched ? esc(l.ads.adName) : 'ad_id ' + esc(l.ads.adId)}</div>` : ''}
          <div class="lp-sec">Квалификация · ${l.axesFilled}/4</div>
          <div class="axg">${Object.keys(axName).map(a => { const q = l.quals[a]; return `<div class="axg-c ${q ? 'done' : ''}"><i>${axName[a]}${q ? `<span class="axg-ok">${ic(I.check)}</span>` : ''}</i><b title="${q ? esc(q.value) : ''}">${q ? esc(q.value) : '—'}</b></div>`; }).join('')}</div>
          ${l.summary ? coll(`Сводка ИИ${l.summaryAt ? ` · ${ago(l.summaryAt)}` : ''}`, `<div class="summary-box" style="margin-top:8px">${esc(l.summary)}</div>`, { open: false, icon: I.doc }) : ''}
          ${coll('Свои поля', `
            <div style="display:flex;justify-content:flex-end;margin:6px 0 2px"><button class="btn-ghost" id="cfGear" title="Настроить поля">${ic(I.gear)}Настроить</button></div>
            <div id="cfEditor" style="display:none">
              ${(STATE.settings.customFields || []).map((f, fi) => `<div class="lc-note-row" style="margin-bottom:6px"><input data-cfl="${fi}" value="${esc(f.label)}"><button class="btn-ghost" data-cfx="${fi}">${ic(I.x)}</button></div>`).join('')}
              <div class="lc-note-row"><input id="cfNewName" placeholder="Новое поле (напр. Паспорт/ВНЖ)"><select id="cfNewType" style="width:96px;flex:0 0 96px"><option value="text">Текст</option><option value="select">Выбор</option></select><button class="btn btn-sm" id="cfNewAdd">${ic(I.plus)}</button></div>
              <button class="btn btn-sm btn-accent" id="cfApply" style="margin:8px 0">Применить поля</button>
            </div>
            ${(STATE.settings.customFields || []).length ? `
            <div class="lc-3sel">${STATE.settings.customFields.map(f => `<div><label class="lc-lbl">${esc(f.label)}</label>
              ${f.type === 'select' ? `<select data-cf="${esc(f.key)}"><option value="">—</option>${(f.options || []).map(o => `<option ${((l.custom || {})[f.key] === o) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
              : `<input data-cf="${esc(f.key)}" value="${esc((l.custom || {})[f.key] || '')}" placeholder="—">`}</div>`).join('')}</div>` : '<div class="muted" style="font-size:12px;padding-bottom:4px">Полей пока нет — добавьте через «Настроить»</div>'}`,
    { open: false, icon: I.layers, count: (STATE.settings.customFields || []).length || null })}
          ${coll('Контакты', `
            <div id="lcContacts" style="margin-top:6px">${(l.contacts || []).map((c, i) => `<div class="lc-contact"><span class="badge">${contactKinds[c.kind] || c.kind}</span><span class="lc-cv">${esc(c.value)}</span><button class="btn-ghost lc-cx" data-i="${i}">${ic(I.x)}</button></div>`).join('')}</div>
            <div class="lc-note-row" style="margin:7px 0 4px">
              <select id="lcCKind" style="width:118px;flex:0 0 118px">${Object.entries(contactKinds).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
              <input id="lcCVal" placeholder="@ник / почта…">
              <button class="btn btn-sm" id="lcCAdd">${ic(I.plus)}</button>
            </div>`,
    { open: false, icon: I.phone, count: (l.contacts || []).length || null })}
          ${coll('Встречи', `<div style="margin-top:6px">${(l.meetings || []).map(mt => `<div class="lc-meet"><b>${new Date(mt.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</b> · ${kindRu[mt.kind]}${mt.link ? ` · <a class="link" href="${mt.link}" target="_blank">комната</a> <button class="btn-ghost lc-copy" data-link="${mt.link}" title="Скопировать ссылку">${ic(I.copy)}</button>` : ''}
            ${mt.status === 'scheduled' ? `<span class="lc-meet-acts"><button class="btn btn-sm" data-mtst="${mt.id}|done">Прошла</button><button class="btn btn-sm btn-danger" data-mtst="${mt.id}|no_show">Не пришёл</button></span>` : `<span class="badge" style="margin-left:6px">${{ done: 'прошла', no_show: 'не пришёл', canceled: 'отменена' }[mt.status] || mt.status}</span>`}</div>`).join('') || '<div class="muted" style="font-size:12px">Встреч нет</div>'}</div>`,
    { open: (l.meetings || []).some(mt => mt.status === 'scheduled'), icon: I.cal, count: (l.meetings || []).length || null })}
        </div>
      </div>`,
    actions: [
      { label: 'Открыть диалог', cls: 'btn-accent', onClick: () => { PAGE_STATE.inboxLead = l.id; go('inbox'); } },
      { label: 'Собрать подборку', onClick: () => { PAGE_STATE.collLead = l.id; go('collections'); } },
      { label: 'Назначить встречу', onClick: () => { openMeetingModal(l, () => openLeadModal(id)); return false; } },
      { label: 'Печать / PDF', onClick: () => { window.open('/lead/' + l.id + '/print', '_blank'); return false; } },
      { label: 'Закрыть' },
    ],
  });

  $('#lcPhone', bd).addEventListener('click', () => { navigator.clipboard.writeText(l.phone); toast('Телефон скопирован', null, true); });
  $('#mStage', bd).addEventListener('change', async (e) => { await api.patch('/leads/' + l.id, { stage: e.target.value }); if (['funnel', 'overview'].includes(CUR)) render(); });
  $('#mGeo', bd).addEventListener('change', async (e) => { await api.patch('/leads/' + l.id, { geo: e.target.value }); });
  $('#mBroker', bd).addEventListener('change', async (e) => { await api.patch('/leads/' + l.id, { broker: e.target.value || null }); });
  $('#lcAi', bd).addEventListener('change', async (e) => { await api.patch('/leads/' + l.id, { ai: { enabled: e.target.checked } }); openLeadModal(id); });
  $('#lcSumBtn', bd).addEventListener('click', async () => {
    const b = $('#lcSumBtn', bd);
    b.disabled = true; b.textContent = 'Собираю сводку…';
    await api.post(`/leads/${id}/summary`);
    openLeadModal(id);
  });
  $('#lcNaSave', bd).addEventListener('click', async () => {
    const dt = $('#lcNaDate', bd).value;
    await api.patch('/leads/' + l.id, { nextAction: { text: $('#lcNaText', bd).value, at: dt ? new Date(dt + 'T10:00').getTime() : null } });
    openLeadModal(id);
  });
  $('#cfGear', bd)?.addEventListener('click', () => { const ed = $('#cfEditor', bd); ed.style.display = ed.style.display === 'none' ? '' : 'none'; });
  $('#cfNewAdd', bd)?.addEventListener('click', () => {
    const nm = $('#cfNewName', bd).value.trim();
    if (!nm) return;
    const row = el(`<div class="lc-note-row" style="margin-bottom:6px"><input data-cfl-new value="${esc(nm)}" data-cft="${$('#cfNewType', bd).value}"><button class="btn-ghost" onclick="this.parentElement.remove()">✕</button></div>`);
    $('#cfNewAdd', bd).closest('.lc-note-row').before(row);
    $('#cfNewName', bd).value = '';
  });
  $$('#cfEditor [data-cfx]', bd).forEach(b => b.addEventListener('click', () => b.parentElement.remove()));
  $('#cfApply', bd)?.addEventListener('click', async () => {
    const fields = [];
    $$('#cfEditor [data-cfl]', bd).forEach(inp => { const f = STATE.settings.customFields[+inp.dataset.cfl]; if (f) fields.push({ ...f, label: inp.value.trim() || f.label }); });
    $$('#cfEditor [data-cfl-new]', bd).forEach(inp => {
      const label = inp.value.trim();
      if (label) fields.push({ key: 'cf_' + label.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '_').slice(0, 30), label, type: inp.dataset.cft || 'text', options: [] });
    });
    await api.patch('/settings', { customFields: fields });
    await loadState();
    openLeadModal(id);
  });
  $$('[data-cf]', bd).forEach(inp => inp.addEventListener('change', async () => {
    await api.patch('/leads/' + l.id, { custom: { [inp.dataset.cf]: inp.value } });
  }));
  $$('[data-mtst]', bd).forEach(b => b.addEventListener('click', async () => {
    const [mid, st] = b.dataset.mtst.split('|');
    await api.patch('/meetings/' + mid, { status: st });
    openLeadModal(id);
  }));
  const addNote = async () => {
    const t = $('#lcNote', bd).value.trim();
    if (!t) return;
    await api.post(`/leads/${id}/note`, { text: t });
    openLeadModal(id);
  };
  $('#lcNoteAdd', bd).addEventListener('click', addNote);
  $('#lcCallBtn', bd).addEventListener('click', () => $('#lcCallFile', bd).click());
  $('#lcCallFile', bd).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 24e6) { toast('Файл больше 24 МБ', 'Обрежьте запись перед загрузкой'); return; }
    const btn = $('#lcCallBtn', bd);
    btn.disabled = true; btn.textContent = 'Расшифровываю…';
    const label = f.name.toLowerCase().includes('zoom') ? 'Zoom' : 'Звонок';
    const r = await fetch(`/api/leads/${id}/transcribe?filename=${encodeURIComponent(f.name)}&label=${encodeURIComponent(label + ' · ' + f.name.slice(0, 30))}`, { method: 'POST', body: f });
    const j = await r.json();
    if (r.ok) { toast('Транскрипт готов', 'Добавлен в хронологию и ИИ-сводку', true); openLeadModal(id); }
    else { toast('Не расшифровалось', j.error); btn.disabled = false; btn.textContent = 'Звонок'; }
  });
  $('#lcNote', bd).addEventListener('keydown', (e) => { if (e.key === 'Enter') addNote(); });
  const saveContacts = async (contacts) => { await api.post(`/leads/${id}/contacts`, { contacts }); openLeadModal(id); };
  $('#lcCAdd', bd).addEventListener('click', () => {
    const v = $('#lcCVal', bd).value.trim();
    if (!v) return;
    saveContacts([...(l.contacts || []), { kind: $('#lcCKind', bd).value, value: v }]);
  });
  $$('.lc-cx', bd).forEach(b => b.addEventListener('click', () => saveContacts((l.contacts || []).filter((_, i) => i !== +b.dataset.i))));
  $$('.lc-copy', bd).forEach(b => b.addEventListener('click', () => { navigator.clipboard.writeText(b.dataset.link); toast('Ссылка на комнату скопирована', null, true); }));
  const tlExpand = () => { const old = $('.tl-old', bd); if (old) old.style.display = ''; $('#tlMore', bd)?.remove(); };
  $('#tlMore', bd)?.addEventListener('click', tlExpand);
  $$('.lc-f', bd).forEach(f => f.addEventListener('click', () => {
    $$('.lc-f', bd).forEach(x => x.classList.remove('active'));
    f.classList.add('active');
    if (f.dataset.f !== 'all') tlExpand();
    $$('#lcTimeline .tl-item', bd).forEach(it => { it.style.display = f.dataset.f === 'all' || it.dataset.f === f.dataset.f ? '' : 'none'; });
  }));
}

/* ---------------- ДИАЛОГИ ---------------- */
PAGES.inbox = async (root) => {
  root.innerHTML = `<div class="inbox">
    <div class="glass conv-list" id="convList"></div>
    <div class="glass chat" id="chatPane"><div class="chat-empty"><img class="ce-art" src="assets/art/chat.png" alt=""><div>Выберите диалог слева</div></div></div>
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
      ${avaHtml(l)}
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
  const chName = { wa: 'WA', tg: 'TG', viber: 'VB', email: '@' };
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
      <div class="bmeta">${m.channel && m.channel !== 'wa' ? `<span class="via-tag" style="background:rgba(255,255,255,.3)">${chName[m.channel] || m.channel}</span>` : ''}${m.dir === 'out' && m.via ? `<span class="via-tag">${viaName[m.via] || m.via}</span>` : ''}<span>${tmm(m.at)}</span>${m.dir === 'out' ? `<span>${m.status === 'read' ? '✓✓' : m.status === 'delivered' ? '✓✓' : '✓'}</span>` : ''}</div>
    </div>`;
  }).join('');
  /* «ИИ печатает» — клиент написал, автопилот готовит ответ */
  const typing = l.lastDir === 'in' && l.ai.enabled && STATE.settings.ai.autopilot
    && !['handover', 'viewing', 'deal', 'lost'].includes(l.stage)
    ? '<div class="bubble in typing"><span class="tdot"></span><span class="tdot"></span><span class="tdot"></span></div>' : '';

  const chn = l.activeChannel || 'wa';
  pane.className = 'glass chat chat--' + chn;
  const chnMeta = { wa: ['WhatsApp', '#25D366'], tg: ['Telegram', '#2AABEE'], viber: ['Viber', '#7360F2'], email: ['E-mail', '#8A90A0'] }[chn] || ['WhatsApp', '#25D366'];
  pane.innerHTML = `
    <div class="chat-head">
      ${avaHtml(l)}
      <div><div class="nm">${esc(l.name)}</div><div class="ph">${esc(l.phone)} · ${l.geoName}</div></div>
      <div class="tb-spacer"></div>
      <span class="chn-chip" style="--chn:${chnMeta[1]}"><i></i>${chnMeta[0]}</span>
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
    ? `<button class="btn btn-accent lp-primary" id="handoverBtn">${ic(I.handover)}${IS_SOLO() ? 'Взять в работу' : 'Передать брокеру'}</button>`
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
    <div class="ch-row">${[['wa', 'WhatsApp'], ['tg', 'Telegram'], ['viber', 'Viber'], ['email', 'E-mail']].map(([k, n]) => {
      const st = k === 'email' ? ((l.contacts || []).some(c => c.kind === 'email') ? 'yes' : 'unknown') : (l.channels || {})[k] || 'unknown';
      return `<span class="ch-pill ${st}" title="${n}: ${st === 'yes' ? 'есть' : st === 'no' ? 'нет' : 'не проверен'}">${n}</span>`;
    }).join('')}${l.activeChannel && l.activeChannel !== 'wa' ? `<span class="mini-badge warn">активен: ${{ tg: 'Telegram', viber: 'Viber', email: 'E-mail' }[l.activeChannel]}</span>` : ''}</div>
    ${l.ads && l.ads.adId ? `<div class="lp-ad">${ic(I.target)}${l.ads.matched ? esc(l.ads.adName) + (l.ads.campaignName ? ` <span>· ${esc(l.ads.campaignName)}</span>` : '') : `ad_id ${esc(l.ads.adId)} <span>· не в базе объявлений</span>`}</div>` : ''}
    <div style="margin:14px 0 10px">${primary}</div>
    ${l.hint ? `<div class="lc-hint ${l.hint.kind}" style="margin-bottom:10px">${ic(l.hint.kind === 'warn' ? I.shield : l.hint.kind === 'act' ? I.bolt : I.spark)}${esc(l.hint.text)}</div>` : ''}
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
    <div class="lp-sec">Управление</div>
    <div class="lp-manage">
      <div class="pd-fact"><label class="lc-lbl">Стадия</label><select id="lpStage">${STAGES.map(s2 => `<option value="${s2.id}" ${l.stage === s2.id ? 'selected' : ''}>${s2.name}</option>`).join('')}</select></div>
      ${l.nextAction && l.nextAction.text ? `<div class="lc-hint ${l.nextAction.at && l.nextAction.at < Date.now() ? 'warn' : 'info'}" style="margin-top:8px">${ic(I.clock)}${esc(l.nextAction.text)}${l.nextAction.at ? ' · ' + new Date(l.nextAction.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ' ' + tmm(l.nextAction.at) : ''}</div>` : ''}
      <div class="lc-note-row" style="margin-top:9px"><input id="lpNote" placeholder="Комментарий по лиду… (Enter)"><button class="btn btn-sm" id="lpNoteBtn">${ic(I.plus)}</button></div>
      <button class="btn btn-sm" id="lpOpenCard" style="width:100%;justify-content:center;margin-top:9px">${ic(I.user)}Полная карточка лида</button>
    </div>
    ${l.summary ? `<div class="lp-sec">Саммари для брокера</div><div class="summary-box">${esc(l.summary)}</div>` : ''}
    ${l.brokerName ? `<div class="badge ok" style="margin-top:12px">${ic(I.check)}У брокера: ${esc(l.brokerName)}</div>` : ''}`;
  enhanceControls(panel);
  $('#lpStage').addEventListener('change', async (e) => { await api.patch('/leads/' + id, { stage: e.target.value }); renderChat(id, true); refreshInbox(false); });
  const lpNote = $('#lpNote');
  const addNote = async () => { const v = lpNote.value.trim(); if (!v) return; lpNote.value = ''; await api.post(`/leads/${id}/note`, { text: v }); toast('Комментарий добавлен', null, true); };
  $('#lpNoteBtn').addEventListener('click', addNote);
  lpNote.addEventListener('keydown', (e) => { if (e.key === 'Enter') addNote(); });
  $('#lpOpenCard').addEventListener('click', () => openLeadModal(id));
  const cp = $('#copyPhone');
  if (cp) cp.addEventListener('click', () => { navigator.clipboard.writeText(l.phone); toast('Телефон скопирован', null, true); });
  $('#aiToggle').addEventListener('change', async (e) => { await api.patch('/leads/' + id, { ai: { enabled: e.target.checked } }); });
  const hb = $('#handoverBtn');
  if (hb) hb.addEventListener('click', async () => { await api.post(`/leads/${id}/handover`); toast(IS_SOLO() ? 'Лид взят в работу' : 'Лид передан брокеру', 'Саммари и слот отправлены', true); renderChat(id, true); });
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
    ${heroArt('assets/art/core.png', `
      <div class="ha-title">${ic(I.spark)}ИИ-квалификатор<span class="sub">первая линия отвечает ≤ 1 минуты · факты только из слов клиента</span></div>
      <div class="ha-chips">${['🎯 Цель', '⏱ Срок', '💰 Бюджет', '🏠 Тип'].map(a => `<span class="ha-chip" data-ha>${a}</span>`).join('')}</div>
      <div class="ha-row" style="padding-left:0;margin-top:8px" data-ha>
        <span class="nm2">Автопилот: <b>${s.ai.autopilot ? 'включён' : 'выключен'}</b> · движок: <b>${s.ai.llmAvailable ? esc((s.ai.llmModel || 'LLM').split(' ')[0]) : 'ядро (без LLM)'}</b> · стоп-слов: <b>${(s.stopWords || []).length}</b></span>
      </div>
    `, { v: 'right', hue: '#7C3AED' })}
    <div class="two-col">
      <div>
        <div class="glass card mb">
          <div class="card-title">${ic(I.spark)}Автопилот первой линии ${hint('aiflow', 'Как ИИ ведёт диалог', [
            ['Мгновенный ответ', 'Заявка из Lead Form / CTWA → первое сообщение за секунды'],
            ['Одна ось за раз', 'Короткие вопросы: цель, бюджет, тип, срок — без анкет'],
            ['Down-sell вместо отказа', 'Бюджет ниже порога — альтернатива из настроек направления'],
            ['Передача с саммари', '4 оси закрыты → брокеру выжимка с цитатами и слот созвона'],
            ['Молчун → реанимация', 'Цепочка касаний исчерпана — лид уходит в «Спящие»']])}</div>
          <div class="set-row">
            <div class="sp"><div class="sl">ИИ отвечает сам</div><div class="sd">Первый контакт ≤ 1 минуты, квалификация по 4 осям: цель · срок · бюджет · тип. Стадии двигаются только по фактам из сообщений клиента.</div></div>
            <label class="switch"><input type="checkbox" id="autopilot" ${s.ai.autopilot ? 'checked' : ''}><span class="tr"></span><span class="th"></span></label>
          </div>
          <div class="set-row">
            <div class="sp"><div class="sl">Стоп-слова (opt-out)</div><div class="sd">Любое из слов в сообщении клиента мгновенно отключает ИИ и закрывает лида</div></div>
          </div>
          <input id="stopWords" style="width:100%" value="${esc((s.stopWords || []).join(', '))}">
          <div class="lp-sec" style="margin-top:18px">Когда ИИ отключается сам</div>
          ${[['onHumanReply', 'Менеджер написал вручную', 'Перехват: ваш ответ в диалоге ставит автопилот на паузу — ИИ не влезет поверх'],
             ['onHumanRequest', 'Клиент просит человека', '«Позовите менеджера», «перезвоните» — ИИ уходит, лид помечается «нужен человек»'],
             ['onEscalation', 'Эскалация', 'Юрист, претензия, возврат денег — только живой менеджер']]
            .map(([k, t, d]) => `<div class="set-row"><div class="sp"><div class="sl">${t}</div><div class="sd">${d}</div></div>
            <label class="switch"><input type="checkbox" data-aoff="${k}" ${(s.ai.autoOff || {})[k] ? 'checked' : ''}><span class="tr"></span><span class="th"></span></label></div>`).join('')}
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
  $$('[data-aoff]', root).forEach(sw => sw.addEventListener('change', async () => {
    const autoOff = {};
    $$('[data-aoff]', root).forEach(x => autoOff[x.dataset.aoff] = x.checked);
    await api.patch('/settings', { ai: { autoOff } });
    loadState();
  }));
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
/* ---------------- ЦЕПОЧКИ: визуальный flow-конструктор ---------------- */
PAGES.sequences = async (root) => {
  const seqs = STATE.sequences;
  if (!PAGE_STATE.seqSel || !seqs.find(x => x.id === PAGE_STATE.seqSel)) PAGE_STATE.seqSel = seqs[0].id;
  const seq = seqs.find(x => x.id === PAGE_STATE.seqSel);
  const editIx = PAGE_STATE.seqEdit;
  const tpls = STATE.templates;
  const save = async (patch) => { await api.patch('/sequences/' + seq.id, patch || { steps: seq.steps }); };
  const geoName = (g) => g === 'all' ? 'Все гео' : STATE.settings.geoNames[g] || g;
  const dayLabel = (d) => d === 0 ? 'сразу' : d < 1 ? '~' + Math.round(d * 24) + ' ч' : 'день ' + d;
  const VARS = ['{name}', '{geo}', '{ad}', '{month}', '{slots}', '{agency}'];

  const stepNode = (st, i) => {
    const modeName = { text: 'Свой текст', template: 'Шаблон', ai: 'ИИ-текст' }[st.mode] || st.mode;
    const preview = st.mode === 'text' ? (st.text || '') : st.mode === 'template' ? 'Шаблон: ' + ((tpls.find(t => t.id === st.templateId) || {}).name || '—') : 'ИИ: ' + (st.prompt || 'сгенерирует по контексту');
    if (editIx === i) return `
      <div class="fl-node fl-edit" data-i="${i}">
        <div style="display:flex;gap:9px;align-items:center;margin-bottom:10px">
          <span class="lc-lbl" style="margin:0">Задержка, дней</span><input data-se="day" type="number" step="0.05" value="${st.day}" style="width:86px">
          <input data-se="label" value="${esc(st.label || '')}" placeholder="Название шага" style="flex:1">
          <select data-se="channel" style="width:130px"><option value="wa" ${!['voice', 'email'].includes(st.channel) ? 'selected' : ''}>Авто (каскад)</option><option value="voice" ${st.channel === 'voice' ? 'selected' : ''}>Голосовое</option><option value="email" ${st.channel === 'email' ? 'selected' : ''}>E-mail</option></select>
          ${st.channel === 'email' ? `<input data-se="subject" value="${esc(st.subject || '')}" placeholder="Тема письма" style="flex:1">` : ''}
        </div>
        <div style="display:flex;gap:9px;align-items:center;margin-bottom:10px">
          <select data-se="mode" style="width:130px"><option value="text" ${st.mode === 'text' ? 'selected' : ''}>Свой текст</option><option value="template" ${st.mode === 'template' ? 'selected' : ''}>Шаблон</option><option value="ai" ${st.mode === 'ai' ? 'selected' : ''}>ИИ-текст</option></select>
          <select data-se="templateId" style="flex:1;${st.mode === 'template' ? '' : 'display:none'}">${tpls.map(t => `<option value="${t.id}" ${st.templateId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
          <input data-se="prompt" value="${esc(st.prompt || '')}" placeholder="Что должен сказать ИИ" style="flex:1;${st.mode === 'ai' ? '' : 'display:none'}">
        </div>
        <div data-se-textwrap style="${st.mode === 'text' ? '' : 'display:none'}">
          <textarea data-se="text" style="width:100%;min-height:130px" placeholder="Текст сообщения…">${esc(st.text || '')}</textarea>
          <div class="fl-vars">${VARS.map(v => `<button type="button" class="fl-var" data-var="${v}">${v}</button>`).join('')}<span class="muted" style="font-size:10.5px;margin-left:4px">клик — вставить · {ad} = название объявления из атрибуции</span></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn btn-accent btn-sm" data-sesave="${i}">${ic(I.check)}Готово</button>
          <button class="btn btn-sm" data-secancel>Отмена</button>
          <span class="tb-spacer"></span>
          <button class="btn btn-danger btn-sm" data-sedel="${i}">Удалить шаг</button>
        </div>
      </div>`;
    return `
      <div class="fl-node ${st.active ? '' : 'off'}" data-i="${i}" data-drag="${i}">
        <div class="fl-day">${ic(I.clock)}${dayLabel(st.day)}</div>
        <div class="fl-body">
          <div class="fl-title">${ic(st.channel === 'voice' ? I.mic || I.phone : I.chat)}<b>${esc(st.label || 'Касание')}</b><span class="mini-badge ${st.mode === 'text' ? 'ok' : st.mode === 'ai' ? 'ai' : ''}">${modeName}</span></div>
          <div class="fl-prev">${esc(preview.slice(0, 150))}${preview.length > 150 ? '…' : ''}</div>
        </div>
        <div class="fl-side">
          <label class="switch" data-stopclick><input type="checkbox" data-step="${i}" ${st.active ? 'checked' : ''}><span class="tr"></span><span class="th"></span></label>
          <span class="fl-grip" title="Перетащить">⋮⋮</span>
        </div>
      </div>`;
  };

  const haSteps = seq.steps.filter(st => st.active);
  const haMaxDay = Math.max(...haSteps.map(st => st.day), 0);
  root.innerHTML = `
    ${heroArt('assets/art/chain.png', `
      <div class="ha-title">${ic(I.chain)}Цепочки касаний<span class="sub">${esc(seq.name.length > 44 ? seq.name.slice(0, 42) + '…' : seq.name)} · ${haSteps.length} касаний · ${haMaxDay < 1 ? 'первые сутки' : haMaxDay + ' дней'}</span></div>
      <div class="ha-steps">${haSteps.map((st, i) => `<span class="ha-step" style="--i:${i}" data-ha>${dayLabel(st.day)}</span>`).join('') || '<span class="sub2">в цепочке нет активных шагов</span>'}</div>
      <div class="sub2" style="margin-top:9px">До первого ответа клиента — дальше ведёт ИИ</div>
    `, { v: 'left', hue: '#2563EB' })}
    <div class="fl-tabs">
      ${seqs.map(sq => `<button class="fl-tab ${sq.id === seq.id ? 'active' : ''}" data-seq="${sq.id}">
        <i class="${sq.active ? 'on' : ''}"></i>${esc(sq.name.length > 34 ? sq.name.slice(0, 32) + '…' : sq.name)}<span>${geoName(sq.geo)}</span></button>`).join('')}
      <button class="btn btn-sm" id="seqNew">${ic(I.plus)}Цепочка</button>
      ${hint('chains', 'Как работают цепочки', [
        ['Одна цепочка на гео', 'Лид получает цепочку своего направления; «Все гео» — запасная'],
        ['Только до первого ответа', 'Клиент написал → живой диалог ИИ, рассылка стоит'],
        ['Переменные', '{name} · {geo} · {ad} · {month} · {slots} · {agency}'],
        ['Пресеты внизу списка', '«B2C-скрипт 2025» и «Онбординг Facebook-лидгена» — включите и правьте под себя']])}
    </div>
    <div class="two-col" style="grid-template-columns:1.5fr 1fr">
      <div>
        <div class="glass card mb" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <input id="seqName" value="${esc(seq.name)}" style="flex:1;min-width:200px;font-weight:650">
          <select id="seqGeo" style="width:140px"><option value="all" ${seq.geo === 'all' ? 'selected' : ''}>Все гео</option>${STATE.settings.agency.geos.map(g => `<option value="${g}" ${seq.geo === g ? 'selected' : ''}>${STATE.settings.geoNames[g]}</option>`).join('')}</select>
          <div style="display:flex;gap:7px;align-items:center"><span class="muted" style="font-size:12px">Активна</span>
            <label class="switch"><input type="checkbox" id="seqActive" ${seq.active ? 'checked' : ''}><span class="tr"></span><span class="th"></span></label></div>
          <button class="btn-ghost" id="seqDel" title="Удалить цепочку">${ic(I.x)}</button>
        </div>
        <div class="flow" id="flow">
          <div class="fl-node fl-trigger">
            <div class="fl-body"><div class="fl-title">${ic(I.bolt)}<b>Триггер: новый лид · ${geoName(seq.geo)}</b></div>
            <div class="fl-prev">Lead Form / CTWA / вебхук — пока клиент не ответил</div></div>
          </div>
          ${seq.steps.map((st, i) => `<div class="fl-conn"><i></i><button class="fl-add" data-addat="${i}" title="Вставить шаг">${ic(I.plus, 2.2)}</button></div>` + stepNode(st, i)).join('')}
          <div class="fl-conn"><i></i><button class="fl-add" data-addat="${seq.steps.length}">${ic(I.plus, 2.2)}</button></div>
          <div class="fl-node fl-end">
            <div class="fl-body"><div class="fl-title">${ic(I.moon)}<b>Не ответил — в «Спящие»</b></div>
            <div class="fl-prev">Дальше — скоринг реанимации. Ответил — ведёт ИИ</div></div>
          </div>
        </div>
      </div>
      <div>
        <div class="wa-phone">
          <div class="wa-note">${ic(I.eye)}Превью</div>
          <div class="wa-scrub" id="waScrub"></div>
          <div class="wa-device">
            <div class="wa-top">
              <span class="wa-back">‹</span>
              <div class="wa-ava">${esc((STATE.settings.agency.name || 'A').slice(0, 1))}</div>
              <div class="wa-peer"><b>${esc(STATE.settings.agency.name || 'Агентство')}</b><i>онлайн</i></div>
              <span class="wa-dots">⋮</span>
            </div>
            <div class="wa-body" id="waBody"></div>
          </div>
        </div>
      </div>
    </div>`;

  /* WhatsApp-эмулятор: проигрываем активные шаги как входящую переписку */
  const waSteps = seq.steps.filter(x => x.active);
  const waPreview = (st) => {
    if (st.mode === 'text') return fillVarsDemo(st.text);
    if (st.mode === 'template') { const t = tpls.find(t => t.id === st.templateId); return t ? fillVarsDemo(t.body) : st.label; }
    return '💬 ' + (st.prompt ? 'ИИ: ' + st.prompt : st.label);
  };
  function fillVarsDemo(t) {
    return String(t || '')
      .replace(/\{name\}/g, 'Алекс').replace(/\{geo\}/g, geoName(seq.geo === 'all' ? 'dubai' : seq.geo))
      .replace(/\{ad\}/g, '«Дубай · студии JVC»').replace(/\{month\}/g, 'июле')
      .replace(/\{slots\}/g, 'сегодня в 18:00 или завтра в 11:00').replace(/\{agency\}/g, STATE.settings.agency.name)
      .replace(/\{priceLine\}/g, 'Цены в этой вилке — от $145 000. ')
      .replace(/\{countryQ\}/g, 'Вы же из России? Во сколько удобно созвониться?')
      .replace(/\{countryQEn\}/g, 'You are from the UK, right? What time works for a quick call?')
      .replace(/\{[a-zA-Z]+\}/g, '…'); /* незнакомая переменная не должна торчать в превью */
  }
  /* спокойный интерактив: вся цепочка видна сразу, шкала дней сверху —
     клик по дню плавно листает телефон к сообщению и подсвечивает его */
  const dayTxt = (st) => st.day === 0 ? 'сразу' : st.day < 1 ? '~' + Math.round(st.day * 24) + ' ч' : 'день ' + st.day;
  const renderWa = () => {
    const body = $('#waBody', root);
    const scrub = $('#waScrub', root);
    if (!body) return;
    body.innerHTML = waSteps.map((st, i) => `
      <div class="wa-day" style="--wi:${i}">${st.day === 0 ? 'сразу после заявки' : st.day < 1 ? 'через ~' + Math.round(st.day * 24) + ' ч' : 'день ' + st.day}</div>
      <div class="wa-msg out calm" style="--wi:${i}" data-wamsg="${i}">
        ${st.channel === 'voice' ? '<span class="wa-voice">▶ голосовое 0:24</span>' : esc(waPreview(st)).replace(/\n/g, '<br>')}
        <span class="wa-time">${st.day === 0 ? '12:0' + (i % 10) : '11:1' + (i % 10)} ✓✓</span>
      </div>`).join('') || '<div class="wa-day">нет активных шагов</div>';
    scrub.innerHTML = waSteps.map((st, i) => `<button class="wa-sc" data-wasc="${i}">${dayTxt(st)}</button>`).join('');
    $$('[data-wasc]', scrub).forEach(b => b.addEventListener('click', () => {
      const msg = $(`[data-wamsg="${b.dataset.wasc}"]`, body);
      if (!msg) return;
      $$('.wa-sc.on', scrub).forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
      $$('.wa-msg.lit', body).forEach(x => x.classList.remove('lit'));
      msg.classList.add('lit');
      setTimeout(() => msg.classList.remove('lit'), 1600);
    }));
  };
  renderWa();

  /* табы и шапка */
  $$('.fl-tab', root).forEach(t => t.addEventListener('click', () => { PAGE_STATE.seqSel = t.dataset.seq; PAGE_STATE.seqEdit = null; render(); }));
  $('#seqNew').addEventListener('click', async () => { const nq = await api.post('/sequences', {}); await loadState(); PAGE_STATE.seqSel = nq.id; PAGE_STATE.seqEdit = 0; render(); });
  $('#seqName').addEventListener('change', (e) => save({ name: e.target.value }));
  $('#seqGeo').addEventListener('change', (e) => { seq.geo = e.target.value; save({ geo: e.target.value }).then(() => render()); });
  $('#seqActive').addEventListener('change', (e) => { seq.active = e.target.checked; save({ active: e.target.checked }); });
  $('#seqDel').addEventListener('click', () => modal({
    title: 'Удалить цепочку?', sub: seq.name,
    actions: [{ label: 'Удалить', cls: 'btn-danger', onClick: async () => { await fetch('/api/sequences/' + seq.id, { method: 'DELETE' }); await loadState(); PAGE_STATE.seqSel = null; render(); } }, { label: 'Отмена' }],
  }));

  /* шаги */
  $$('[data-step]', root).forEach(sw => sw.addEventListener('change', async () => { seq.steps[+sw.dataset.step].active = sw.checked; await save(); }));
  $$('[data-stopclick]', root).forEach(x => x.addEventListener('click', (e) => e.stopPropagation()));
  $$('.fl-node[data-drag]', root).forEach(node => node.addEventListener('click', (e) => {
    if (e.target.closest('.fl-grip') || DRAG.moved) return;
    PAGE_STATE.seqEdit = +node.dataset.i; render();
  }));
  $$('.fl-add', root).forEach(b => b.addEventListener('click', async () => {
    const at = +b.dataset.addat;
    const prev = seq.steps[at - 1];
    seq.steps.splice(at, 0, { day: prev ? +(prev.day + 1).toFixed(2) : 0, channel: 'wa', mode: 'text', text: '', label: 'Новое касание', active: true });
    PAGE_STATE.seqEdit = at;
    await save(); render();
  }));

  /* редактор шага */
  const eb = root.querySelector('.fl-edit');
  if (eb) {
    const modeSel = eb.querySelector('[data-se="mode"]');
    const syncMode = () => {
      eb.querySelector('[data-se="templateId"]').closest('.cs').style.display = modeSel.value === 'template' ? '' : 'none';
      eb.querySelector('[data-se="prompt"]').style.display = modeSel.value === 'ai' ? '' : 'none';
      eb.querySelector('[data-se-textwrap]').style.display = modeSel.value === 'text' ? '' : 'none';
    };
    modeSel.addEventListener('change', syncMode);
    const ta = eb.querySelector('[data-se="text"]');
    $$('.fl-var', eb).forEach(v => v.addEventListener('click', () => {
      const p2 = ta.selectionStart || ta.value.length;
      ta.value = ta.value.slice(0, p2) + v.dataset.var + ta.value.slice(p2);
      ta.focus();
    }));
    eb.querySelector('[data-sesave]').addEventListener('click', async (e) => {
      const i = +e.currentTarget.dataset.sesave;
      const st = seq.steps[i];
      st.day = +eb.querySelector('[data-se="day"]').value || 0;
      st.label = eb.querySelector('[data-se="label"]').value || 'Касание';
      st.channel = eb.querySelector('[data-se="channel"]').value;
      const subj = eb.querySelector('[data-se="subject"]');
      if (subj) st.subject = subj.value;
      st.mode = modeSel.value;
      st.templateId = st.mode === 'template' ? eb.querySelector('[data-se="templateId"]').value : null;
      st.prompt = eb.querySelector('[data-se="prompt"]').value;
      st.text = ta.value;
      PAGE_STATE.seqEdit = null;
      await save(); render();
    });
    eb.querySelector('[data-secancel]').addEventListener('click', () => { PAGE_STATE.seqEdit = null; render(); });
    eb.querySelector('[data-sedel]').addEventListener('click', async (e) => {
      seq.steps.splice(+e.currentTarget.dataset.sedel, 1);
      PAGE_STATE.seqEdit = null;
      await save(); render();
    });
  }

  /* drag-переупорядочивание узлов (pointer, как канбан) */
  const flow = $('#flow');
  flow.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.fl-grip');
    if (!grip) return;
    const node = grip.closest('.fl-node');
    const from = +node.dataset.drag;
    let ghost = null;
    DRAG.moved = false;
    DRAG.active = true;
    const onMove = (ev) => {
      if (!ghost) {
        DRAG.moved = true;
        const r = node.getBoundingClientRect();
        ghost = node.cloneNode(true);
        ghost.style.cssText = `position:fixed;left:${r.left}px;top:${ev.clientY - 30}px;width:${r.width}px;z-index:400;pointer-events:none;opacity:.9;box-shadow:var(--shadow-lift)`;
        document.body.appendChild(ghost);
        node.style.opacity = '.35';
      }
      ghost.style.top = (ev.clientY - 30) + 'px';
      $$('.fl-node[data-drag]', flow).forEach(n => n.classList.remove('fl-over'));
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const tgt = under && under.closest('.fl-node[data-drag]');
      if (tgt && tgt !== node) tgt.classList.add('fl-over');
    };
    const onUp = async (ev) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (ghost) ghost.remove();
      node.style.opacity = '';
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const tgt = under && under.closest('.fl-node[data-drag]');
      $$('.fl-node[data-drag]', flow).forEach(n => n.classList.remove('fl-over'));
      setTimeout(() => { DRAG.moved = false; DRAG.active = false; }, 60);
      if (!tgt || tgt === node) return;
      const to = +tgt.dataset.drag;
      const [mv] = seq.steps.splice(from, 1);
      seq.steps.splice(to, 0, mv);
      await save(); render();
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });
};

/* ---------------- ОБЪЕКТЫ: портальный формат, без попапов ---------------- */
function propCover(pr, big) {
  const img = (pr.images || [])[0];
  if (img) return `<div class="prop-cover ${big ? 'big' : ''}" style="background-image:url('${esc(img)}')"></div>`;
  const hues = { dubai: 'linear-gradient(135deg,#102B5C,#2F6BFF)', bali: 'linear-gradient(135deg,#0E3B2E,#23B383)', phuket: 'linear-gradient(135deg,#1D3A6E,#6D5BD0)', spain: 'linear-gradient(135deg,#5C2B10,#E4813D)' };
  return `<div class="prop-cover ${big ? 'big' : ''}" style="background:${hues[pr.geo] || hues.dubai}">
    <img src="logo.svg" class="pc-star"><span>${esc(pr.area || pr.name)}</span></div>`;
}

PAGES.properties = async (root) => {
  const props = await api.get('/properties');
  const st = STATE.settings;

  /* -------- детальная страница объекта (inline-редактирование) -------- */
  if (PAGE_STATE.propView) {
    const pr = props.find(x => x.id === PAGE_STATE.propView);
    if (!pr) { PAGE_STATE.propView = null; return PAGES.properties(root); }
    const MD = PAGE_STATE.marketData || (PAGE_STATE.marketData = await api.get('/marketdata'));
    const geoMD = MD[pr.geo] || MD.dubai;
    const upd = async (patch) => { await api.patch('/properties/' + pr.id, patch); Object.assign(pr, patch); };
    /* combo: справочник + «своё значение» */
    const combo = (field, options, val, ph) => `<select class="gi-sel" data-cf2="${field}">
      <option value="" disabled ${val ? '' : 'selected'}>${ph || '—'}</option>
      ${options.map(o => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}
      ${val && !options.includes(val) ? `<option selected>${esc(val)}</option>` : ''}
      <option value="__custom">✏️ Своё значение…</option>
    </select>`;
    const gi = (field, val, ph, num) => `<input class="gi" data-f="${field}" ${num ? 'type="number"' : ''} value="${esc(val ?? '')}" placeholder="${ph || '—'}">`;
    const fmt = (pr.currency === 'EUR' ? '€' : '$') + (pr.priceFrom || 0).toLocaleString('ru-RU');
    const heroImg = (pr.images || [])[0];
    const pctInt = (s2) => parseFloat(String(s2).replace(',', '.')) || 0;
    const rowsSum = (pr.paymentRows || []).reduce((s2, r2) => s2 + pctInt(r2.pct), 0);
    const amt = (pct, price) => { const v = Math.round((price || 0) * pctInt(pct) / 100); return v ? (pr.currency === 'EUR' ? '€' : '$') + v.toLocaleString('ru-RU') : '—'; };
    const tagList = [...new Set([...MD.common.tags, ...(pr.tags || [])])];
    const amenList = [...new Set([...MD.common.amenities, ...(pr.amenities || [])])];
    root.innerHTML = `
      <div class="pd2">
        <div class="pd2-hero" ${heroImg ? `style="background-image:url('${esc(heroImg)}')"` : ''}>
          <div class="pd2-shade"></div>
          <div class="pd2-in">
            <div class="pd2-top">
              <button class="btn btn-sm pd2-ghost" id="prBack">← Все объекты</button>
              <span class="pd2-save">${ic(I.check)}правки сохраняются сами</span>
              <span class="tb-spacer"></span>
              <button class="btn btn-sm btn-accent" id="pdToColl">${ic(I.layers)}В подборку</button>
              <button class="btn btn-sm pd2-ghost danger" id="pdDel">Удалить</button>
            </div>
            <div class="pd2-main">
              <div class="pd2-namebox">
                <input class="gi gi-title pd2-name" data-f="name" value="${esc(pr.name)}">
                <div class="pd-sub pd2-sub">${combo('area', geoMD.areas, pr.area, 'район')} ${combo('developer', geoMD.developers, pr.developer, 'застройщик')}</div>
              </div>
              <div class="pd2-priceside">
                <div class="pd2-price">от <input class="gi gi-price pd2-priceinp" data-f="priceFrom" type="number" value="${pr.priceFrom}"><b>${pr.currency}</b></div>
                <div class="pd2-selects">
                  <select id="pdMarket" style="width:128px"><option value="offplan" ${pr.market !== 'secondary' ? 'selected' : ''}>Первичка</option><option value="secondary" ${pr.market === 'secondary' ? 'selected' : ''}>Вторичка</option></select>
                  <select id="pdGeo" style="width:118px">${st.agency.geos.map(g => `<option value="${g}" ${pr.geo === g ? 'selected' : ''}>${st.geoNames[g]}</option>`).join('')}</select>
                </div>
              </div>
            </div>
            <div class="pd2-badges">
              ${pr.handover ? `<span class="pd2-bdg">${ic(I.cal)}сдача ${esc(pr.handover)}</span>` : ''}
              ${pr.roi ? `<span class="pd2-bdg hot">${ic(I.flame)}${esc(pr.roi)}</span>` : ''}
              ${pr.appreciation ? `<span class="pd2-bdg">${ic(I.bars)}прирост ${esc(pr.appreciation)}</span>` : ''}
              ${pr.type ? `<span class="pd2-bdg">${ic(I.building)}${esc(pr.type)}</span>` : ''}
              ${(pr.units || []).length ? `<span class="pd2-bdg">${ic(I.grid)}${pr.units.length} юнит(ов)</span>` : ''}
            </div>
          </div>
        </div>

                <div class="pd2-cols">
          <div class="pd2-mcol">
<div class="pds tint">
          <div class="pds-hd"><span class="pds-ic v">✦</span><div><b>Витрина для подборки</b><i>крючок, метрики, район и аргументы — ровно то, что увидит клиент</i></div></div>
          <div class="pds-grid hookrow">
            <div class="pd-fact"><label class="lc-lbl">Заголовок-крючок (вместо названия ЖК)</label><input class="gi big" data-f="hookTitle" value="${esc(pr.hookTitle || '')}" placeholder="Комплекс с инфраструктурой… в 20 минутах от Business Bay"></div>
            <div class="pd-fact"><label class="lc-lbl">Доходность</label><input class="gi" data-f="roi" value="${esc(pr.roi || '')}" placeholder="от 7% годовых"></div>
            <div class="pd-fact"><label class="lc-lbl">Прирост стоимости</label><input class="gi" data-f="appreciation" value="${esc(pr.appreciation || '')}" placeholder="от 25% к сдаче"></div>
          </div>
          <div class="pd-fact" style="margin-top:12px"><label class="lc-lbl">Описание проекта (для подборок и PDF)</label><textarea class="gi" data-f="description" style="min-height:90px">${esc(pr.description || '')}</textarea></div>
          <div class="pds-grid c3" style="margin-top:12px">
            <div class="pd-fact"><label class="lc-lbl">Район</label><input class="gi" data-f="districtName" value="${esc((pr.district || {}).name || '')}" placeholder="JVC"></div>
            <div class="pd-fact" style="grid-column:span 2"><label class="lc-lbl">Район: описание</label><textarea class="gi" data-f="districtBlurb" style="min-height:58px">${esc((pr.district || {}).blurb || '')}</textarea></div>
          </div>
          <div class="pds-grid c2" style="margin-top:12px">
            <div class="pd-fact"><label class="lc-lbl">Тайминги до мест (строка = «мин | место»)</label><textarea class="gi" data-f="districtTimes" style="min-height:64px" placeholder="16 | Expo City">${esc(((pr.district || {}).times || []).map(t => t.min + ' | ' + t.place).join('\n'))}</textarea></div>
            <div class="pd-fact"><label class="lc-lbl">«Рекомендуем для аренды» (аргументы по строкам)</label><textarea class="gi" data-f="whyRentStr" style="min-height:64px">${esc((pr.whyRent || []).join('\n'))}</textarea></div>
          </div>
        </div>

        <div class="pds pay">
          <div class="pds-hd"><span class="pds-ic p">${ic(I.bars)}</span><div><b>План оплаты · калькулятор</b><i>этапы редактируются прямо здесь, суммы считаются от цены</i></div>
            <span class="tb-spacer"></span>
            <select class="gi-sel" data-payplan style="min-width:230px">
              <option value="">пресеты рынка…</option>
              ${geoMD.payments.map((pp, pi) => `<option value="${pi}">${esc(pp.label)} · ${pp.rows.map(r2 => r2.pct).join(' / ')}</option>`).join('')}
            </select>
          </div>
          <div class="pay-calc">
            <label class="lc-lbl">Цена для расчёта</label>
            <div class="pay-calc-in">${pr.currency === 'EUR' ? '€' : '$'}<input id="calcPrice" type="number" value="${pr.priceFrom || ''}" placeholder="цена юнита"></div>
            <span class="pay-total ${Math.round(rowsSum) === 100 ? 'ok' : rowsSum ? 'warn' : ''}">${rowsSum ? 'этапы дают ' + Math.round(rowsSum) + '%' : 'этапов пока нет'}</span>
          </div>
          <div class="prow-list">
            ${(pr.paymentRows || []).map((r2, ix) => `<div class="prow">
              <span class="prow-n">${ix + 1}</span>
              <input class="prow-pct" data-prow-pct value="${esc(r2.pct)}" placeholder="20%">
              <input class="prow-lbl" data-prow-lbl value="${esc(r2.label)}" placeholder="Первоначальный взнос">
              <span class="prow-amt" data-pct="${esc(r2.pct)}">${amt(r2.pct, pr.priceFrom)}</span>
              <button class="btn-ghost" data-prowdel="${ix}">${ic(I.x)}</button>
            </div>`).join('') || '<div class="muted" style="font-size:12px;padding:6px 2px">Выберите пресет рынка или добавьте этапы вручную</div>'}
          </div>
          <div class="prow-bar"><i style="width:${Math.min(rowsSum, 100)}%" class="${Math.round(rowsSum) === 100 ? '' : 'warn'}"></i></div>
          <button class="btn btn-sm" id="prowAdd" style="margin-top:10px">${ic(I.plus)}Этап оплаты</button>
        </div>

        <div class="pds">
          <div class="pds-hd"><span class="pds-ic">${ic(I.grid)}</span><div><b>Юниты</b><i>попадают таблицей в подборку и PDF</i></div></div>
          <table class="tbl"><thead><tr><th>Планировка</th><th>Площадь</th><th>Этаж</th><th>Вид</th><th>Цена</th><th></th></tr></thead><tbody>
            ${(pr.units || []).map((u2, ix) => `<tr><td><b>${esc(u2.plan)}</b></td><td>${esc(u2.area)}</td><td>${esc(u2.floor)}</td><td>${esc(u2.view)}</td><td style="color:var(--accent);font-weight:700">${(u2.price || 0).toLocaleString('ru-RU')}</td><td><button class="btn-ghost" data-unitdel="${ix}">${ic(I.x)}</button></td></tr>`).join('')}
          </tbody></table>
          <div class="lc-note-row" style="margin-top:10px;flex-wrap:wrap">
            <input id="uPlan" placeholder="1BR" style="width:80px;flex:0 0 80px"><input id="uArea" placeholder="68 м²" style="width:80px;flex:0 0 80px">
            <input id="uFloor" placeholder="этаж" style="width:70px;flex:0 0 70px"><input id="uView" placeholder="вид" style="width:110px;flex:0 0 110px">
            <input id="uPrice" type="number" placeholder="цена"><button class="btn btn-sm" id="uAdd">${ic(I.plus)}</button>
          </div>
        </div>

        
          </div>
          <aside class="pd2-scol">
<div class="pds">
          <div class="pds-hd"><span class="pds-ic">${ic(I.doc)}</span><div><b>Паспорт объекта</b><i>формат, сдача, теги и удобства — фильтры и match подборок</i></div></div>
          <div class="pds-grid c3">
            <div class="pd-fact"><label class="lc-lbl">Формат</label>${combo('type', MD.common.types, pr.type, 'формат')}</div>
            <div class="pd-fact"><label class="lc-lbl">Сдача</label>${combo('handover', MD.common.handover, pr.handover, 'срок')}</div>
            <div class="pd-fact"><label class="lc-lbl">Заметка (внутренняя)</label><input class="gi" data-f="note" value="${esc(pr.note || '')}" placeholder="для команды, клиент не видит"></div>
          </div>
          <div class="pd-fact" style="margin-top:12px"><label class="lc-lbl">Теги</label>
            <div class="chips-row">${tagList.map(t => `<button type="button" class="chip-t ${(pr.tags || []).includes(t) ? 'on' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}
              <span class="chip-add"><input id="tagAddInp" placeholder="+ свой тег"><button class="chip-plus" id="tagAddBtn">${ic(I.plus)}</button></span>
            </div>
          </div>
          <div class="pd-fact" style="margin-top:10px"><label class="lc-lbl">Удобства</label>
            <div class="chips-row">${amenList.map(a => `<button type="button" class="chip-t ${(pr.amenities || []).includes(a) ? 'on' : ''}" data-amen="${esc(a)}">${esc(a)}</button>`).join('')}
              <span class="chip-add"><input id="amenAddInp" placeholder="+ своё удобство"><button class="chip-plus" id="amenAddBtn">${ic(I.plus)}</button></span>
            </div>
          </div>
        </div>

        <div class="pds grey">
          <div class="pds-hd"><span class="pds-ic m">${ic(I.eye)}</span><div><b>Медиа и материалы</b><i>фото, планировки, брошюры — уходят в подборки</i></div></div>
          <div class="pds-grid c3 media">
            <div>
              <label class="lc-lbl">Фото и интерьеры · первое — обложка</label>
              <div class="pd-imgs">${(pr.images || []).map((u, ix) => `<div class="pd-img" style="background-image:url('${esc(u)}')"><button class="pd-x" data-imgdel="${ix}">${ic(I.x)}</button></div>`).join('') || '<div class="muted" style="font-size:12px">Фото нет — вставьте ссылки</div>'}</div>
              <div class="lc-note-row" style="margin-top:10px"><input id="pdImgUrl" placeholder="https://…jpg"><button class="btn btn-sm" id="pdImgAdd">${ic(I.plus)}</button></div>
            </div>
            <div>
              <label class="lc-lbl">Планировки</label>
              ${(pr.layouts || []).map((l2, ix) => `<div class="lc-contact"><span class="badge acc">${esc(l2.label)}</span><a class="lc-cv link" href="${esc(l2.url)}" target="_blank">${esc(l2.url.slice(0, 40))}…</a><button class="btn-ghost lc-cx" data-laydel="${ix}">${ic(I.x)}</button></div>`).join('') || '<div class="muted" style="font-size:12px;margin-bottom:6px">Планировок нет</div>'}
              <div class="lc-note-row" style="margin-top:8px"><input id="pdLayLabel" placeholder="1BR тип A" style="width:110px;flex:0 0 110px"><input id="pdLayUrl" placeholder="https://…pdf"><button class="btn btn-sm" id="pdLayAdd">${ic(I.plus)}</button></div>
            </div>
            <div>
              <label class="lc-lbl">Документы и материалы</label>
              ${(pr.materials || []).map((m2, ix) => `<div class="lc-contact"><span class="badge">${esc(m2.label)}</span><a class="lc-cv link" href="${esc(m2.url)}" target="_blank">${esc(m2.url.slice(0, 40))}…</a><button class="btn-ghost lc-cx" data-matdel="${ix}">${ic(I.x)}</button></div>`).join('') || '<div class="muted" style="font-size:12px;margin-bottom:6px">Брошюры, прайсы, видео — ссылками</div>'}
              <div class="lc-note-row" style="margin-top:8px"><input id="pdMatLabel" placeholder="Брошюра" style="width:110px;flex:0 0 110px"><input id="pdMatUrl" placeholder="https://…"><button class="btn btn-sm" id="pdMatAdd">${ic(I.plus)}</button></div>
            </div>
          </div>
        </div>
          </aside>
        </div>
      </div>`;

    $('#prBack').addEventListener('click', () => { PAGE_STATE.propView = null; render(); });
    $$('.gi', root).forEach(inp => inp.addEventListener('change', async () => {
      const f = inp.dataset.f;
      if (f === 'tagsStr') await upd({ tags: inp.value.split(',').map(x => x.trim()).filter(Boolean) });
      else if (f === 'amenitiesStr') await upd({ amenities: inp.value.split(',').map(x => x.trim()).filter(Boolean) });
      else if (f === 'districtName' || f === 'districtBlurb' || f === 'districtTimes') {
        const box = inp.closest('.glass');
        const times = (box.querySelector('[data-f="districtTimes"]').value || '').split('\n').map(x => x.split('|')).filter(x => x.length === 2).map(([mn, pl]) => ({ min: parseInt(mn) || 0, place: pl.trim() }));
        await upd({ district: { name: box.querySelector('[data-f="districtName"]').value, blurb: box.querySelector('[data-f="districtBlurb"]').value, times } });
      }
      else if (f === 'paymentRowsStr') await upd({ paymentRows: inp.value.split('\n').map(x => x.split('|')).filter(x => x.length === 2).map(([p2, l2]) => ({ pct: p2.trim(), label: l2.trim() })) });
      else if (f === 'whyRentStr') await upd({ whyRent: inp.value.split('\n').map(x => x.trim()).filter(Boolean) });
      else if (f === 'priceFrom') await upd({ priceFrom: +inp.value });
      else await upd({ [f]: inp.value });
    }));
    $$('[data-cf2]', root).forEach(sel => sel.addEventListener('change', async () => {
      if (sel.value === '__custom') {
        const inp = el(`<input class="gi" style="width:100%" placeholder="своё значение">`);
        sel.closest('.cs').replaceWith(inp);
        inp.focus();
        inp.addEventListener('change', () => upd({ [sel.dataset.cf2]: inp.value }));
        return;
      }
      await upd({ [sel.dataset.cf2]: sel.value });
    }));
    const pp = root.querySelector('[data-payplan]');
    if (pp) pp.addEventListener('change', async () => {
      const plan = geoMD.payments[+pp.value];
      if (!plan) return;
      await upd({ payment: plan.label, paymentRows: plan.rows });
      render();
    });
    $$('[data-tag]', root).forEach(ch => ch.addEventListener('click', async () => {
      ch.classList.toggle('on');
      await upd({ tags: $$('[data-tag].on', root).map(x => x.dataset.tag) });
    }));
    $$('[data-amen]', root).forEach(ch => ch.addEventListener('click', async () => {
      ch.classList.toggle('on');
      await upd({ amenities: $$('[data-amen].on', root).map(x => x.dataset.amen) });
    }));
    $('#pdMarket').addEventListener('change', (e) => upd({ market: e.target.value }));
    $('#pdGeo').addEventListener('change', (e) => upd({ geo: e.target.value }));
    /* план оплаты: инлайн-редактор этапов + живой калькулятор */
    const collectRows = () => $$('.prow', root).map(row => ({ pct: $('.prow-pct', row).value.trim(), label: $('.prow-lbl', row).value.trim() })).filter(r2 => r2.pct || r2.label);
    $$('[data-prow-pct],[data-prow-lbl]', root).forEach(inp => inp.addEventListener('change', async () => { await upd({ paymentRows: collectRows() }); render(); }));
    $$('[data-prowdel]', root).forEach(b => b.addEventListener('click', async () => { await upd({ paymentRows: (pr.paymentRows || []).filter((_, ix) => ix !== +b.dataset.prowdel) }); render(); }));
    const prowAdd = $('#prowAdd');
    if (prowAdd) prowAdd.addEventListener('click', async () => { await upd({ paymentRows: [...(pr.paymentRows || []), { pct: '10%', label: 'Этап' }] }); render(); });
    const calcInp = $('#calcPrice');
    if (calcInp) calcInp.addEventListener('input', () => {
      const price = +calcInp.value || 0;
      $$('.prow-amt', root).forEach(sp => {
        const p2 = parseFloat(String(sp.dataset.pct).replace(',', '.')) || 0;
        const v = Math.round(price * p2 / 100);
        sp.textContent = v ? (pr.currency === 'EUR' ? '€' : '$') + v.toLocaleString('ru-RU') : '—';
      });
    });
    /* персональные теги и удобства */
    const chipAdder = (inpId, btnId, key) => {
      const inp = $('#' + inpId);
      if (!inp) return;
      const add = async () => { const v = inp.value.trim(); if (!v) return; await upd({ [key]: [...new Set([...(pr[key] || []), v])] }); render(); };
      $('#' + btnId).addEventListener('click', add);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    };
    chipAdder('tagAddInp', 'tagAddBtn', 'tags');
    chipAdder('amenAddInp', 'amenAddBtn', 'amenities');
    $('#pdImgAdd').addEventListener('click', async () => { const u = $('#pdImgUrl').value.trim(); if (!u) return; await upd({ images: [...(pr.images || []), u] }); render(); });
    $$('[data-imgdel]', root).forEach(b => b.addEventListener('click', async () => { await upd({ images: pr.images.filter((_, ix) => ix !== +b.dataset.imgdel) }); render(); }));
    $('#pdLayAdd').addEventListener('click', async () => { const u = $('#pdLayUrl').value.trim(); if (!u) return; await upd({ layouts: [...(pr.layouts || []), { label: $('#pdLayLabel').value || 'Планировка', url: u }] }); render(); });
    $$('[data-laydel]', root).forEach(b => b.addEventListener('click', async () => { await upd({ layouts: pr.layouts.filter((_, ix) => ix !== +b.dataset.laydel) }); render(); }));
    $('#pdMatAdd').addEventListener('click', async () => { const u = $('#pdMatUrl').value.trim(); if (!u) return; await upd({ materials: [...(pr.materials || []), { label: $('#pdMatLabel').value || 'Материал', url: u }] }); render(); });
    $$('[data-matdel]', root).forEach(b => b.addEventListener('click', async () => { await upd({ materials: pr.materials.filter((_, ix) => ix !== +b.dataset.matdel) }); render(); }));
    $('#uAdd').addEventListener('click', async () => {
      await upd({ units: [...(pr.units || []), { plan: $('#uPlan').value, area: $('#uArea').value, floor: $('#uFloor').value, view: $('#uView').value, price: +$('#uPrice').value }] });
      render();
    });
    $$('[data-unitdel]', root).forEach(b => b.addEventListener('click', async () => { await upd({ units: pr.units.filter((_, ix) => ix !== +b.dataset.unitdel) }); render(); }));
    $('#pdToColl').addEventListener('click', () => { PAGE_STATE.collPreselect = pr.id; go('collections'); });
    $('#pdDel').addEventListener('click', () => modal({
      title: 'Удалить объект?', sub: pr.name,
      actions: [{ label: 'Удалить', cls: 'btn-danger', onClick: async () => { await fetch('/api/properties/' + pr.id, { method: 'DELETE' }); PAGE_STATE.propView = null; render(); } }, { label: 'Отмена' }],
    }));
    return;
  }

  /* -------- список: богатые карточки -------- */
  const geoF = PAGE_STATE.propGeo || '';
  const marketF = PAGE_STATE.propMarket || '';
  const folders = (await api.get('/folders')).filter(f => f.kind === 'prop');
  const folderF = PAGE_STATE.propFolder || '';
  const list = props.filter(pr => (!geoF || pr.geo === geoF) && (!marketF || pr.market === marketF) && (!folderF || pr.folderId === folderF));
  const fmt = (pr) => (pr.currency === 'EUR' ? '€' : '$') + (pr.priceFrom || 0).toLocaleString('ru-RU');
  root.innerHTML = `
    ${heroArt('assets/art/tower.png', `
      <div class="ha-title">${ic(I.building || I.doc)}База объектов<span class="sub">${props.length} проектов · подборки собираются отсюда</span></div>
      <div class="ha-chips">${st.agency.geos.map(g => { const n = props.filter(p2 => p2.geo === g).length; return n ? `<span class="ha-chip" data-ha>${st.geoNames[g]} <b>${n}</b></span>` : ''; }).join('')}</div>
      ${(() => { const mp = Math.min(...props.map(p2 => p2.priceFrom || Infinity)); return isFinite(mp) ? `<div class="ha-row" style="padding-left:0;margin-top:8px" data-ha><span class="nm2">Вход в рынок от <b>$${mp.toLocaleString('ru-RU')}</b> · первичка ${props.filter(p2 => p2.market === 'offplan').length} · вторичка ${props.filter(p2 => p2.market === 'secondary').length}</span></div>` : ''; })()}
    `, { v: 'mark', hue: '#C89B4B' })}
    <div class="filters">
      <select id="prGeo"><option value="">Все направления</option>${st.agency.geos.map(g => `<option value="${g}" ${geoF === g ? 'selected' : ''}>${st.geoNames[g]}</option>`).join('')}</select>
      <select id="prMarket"><option value="">Первичка и вторичка</option><option value="offplan" ${marketF === 'offplan' ? 'selected' : ''}>Первичка</option><option value="secondary" ${marketF === 'secondary' ? 'selected' : ''}>Вторичка</option></select>
      <span class="muted" style="font-size:12px">${list.length} объектов</span>
      <button class="btn btn-accent page-primary" id="prAdd">${ic(I.plus)}Объект</button>
    </div>
    <div class="shelf">
      <div class="fold ${!folderF ? 'active' : ''}" data-fopen="">
        <img src="assets/folder.png"><div class="fold-meta"><b>Все объекты</b><i>${props.length}</i></div>
      </div>
      ${folders.map(f => `<div class="fold ${folderF === f.id ? 'active' : ''}" data-fopen="${f.id}" data-fid="${f.id}">
        <img src="assets/folder.png">
        <div class="fold-meta"><b>${esc(f.name)}</b><i>${f.count} ${plural(f.count, 'объект', 'объекта', 'объектов')}</i></div>
        <div class="fold-acts">
          <button class="btn-ghost" data-fcoll="${f.id}" title="Собрать подборку из папки">${ic(I.layers)}</button>
          <button class="btn-ghost" data-fdel="${f.id}" title="Удалить папку">${ic(I.x)}</button>
        </div>
      </div>`).join('')}
      <button class="fold fold-new" id="fNew">${ic(I.plus)}<span>Папка</span></button>
    </div>
    <div class="muted" style="font-size:11px;margin:-6px 0 12px">Карточку — на папку · клик по папке — фильтр и подборка</div>
    <div class="prop-grid">
      ${list.map(pr => `<div class="glass prop-card rich" data-pr="${pr.id}" data-dragprop="${pr.id}">
        ${propCover(pr)}
        <div class="prop-body">
          <div class="prop-top"><div><div class="prop-name">${esc(pr.name)}</div>
            <div class="muted" style="font-size:11.5px">${esc(pr.area)}${pr.developer && pr.developer !== '—' ? ' · ' + esc(pr.developer) : ''}</div></div>
            <span class="badge ${pr.market === 'offplan' ? 'acc' : 'ok'}">${pr.market === 'offplan' ? 'первичка' : 'вторичка'}</span></div>
          <div class="prop-price">от ${fmt(pr)}</div>
          <div class="prop-meta"><span>${esc(pr.type)}</span><span>${esc(pr.handover)}</span><span>${esc(pr.payment)}</span></div>
          <div class="prop-foot">
            ${(pr.tags || []).slice(0, 3).map(t => `<span class="mini-badge ai">${esc(t)}</span>`).join('')}
            <span class="tb-spacer"></span>
            <span class="muted" style="font-size:10.5px">${(pr.images || []).length ? (pr.images.length + ' фото · ') : ''}${(pr.layouts || []).length ? (pr.layouts.length + ' план. · ') : ''}${(pr.materials || []).length ? pr.materials.length + ' док.' : ''}</span>
          </div>
        </div>
      </div>`).join('') || '<div class="glass card empty">Объектов нет — добавьте первый</div>'}
    </div>
    <div style="margin-top:16px">${coll('Источники данных · рынок Дубая', `
      <div class="muted" style="font-size:11.8px;margin:8px 0 12px">Слоты под API порталов первички и вторички. Вставьте ключ — статус обновится; синк листингов включается после проверки ключа.</div>
      ${Object.entries(st.portals || {}).map(([k, pt]) => `<div class="set-row"><div class="sp"><div class="sl">${esc(pt.name)}</div><div class="sd">${pt.status === 'key_saved' ? 'ключ сохранён — готов к подключению' : 'нет ключа'}</div></div>
        <input data-portal="${k}" type="password" placeholder="${pt.status === 'key_saved' ? '•••••• сохранён' : 'API key'}" style="width:180px">
        <span class="badge ${pt.status === 'key_saved' ? 'ok' : ''}">${pt.status === 'key_saved' ? 'ключ есть' : 'выкл'}</span></div>`).join('')}
      <button class="btn btn-sm" id="portalSave" style="margin-top:8px">Сохранить ключи</button>`, { open: false, icon: I.link, count: Object.keys(st.portals || {}).length })}</div>`;
  $('#prGeo').addEventListener('change', (e) => { PAGE_STATE.propGeo = e.target.value; render(); });
  $('#prMarket').addEventListener('change', (e) => { PAGE_STATE.propMarket = e.target.value; render(); });
  $$('.prop-card', root).forEach(c => c.addEventListener('click', () => { if (!DRAG.moved) { PAGE_STATE.propView = c.dataset.pr; render(); } }));
  $$('[data-fopen]', root).forEach(f => f.addEventListener('click', (e) => {
    if (e.target.closest('[data-fcoll],[data-fdel]')) return;
    PAGE_STATE.propFolder = f.dataset.fopen; render();
  }));
  $('#fNew').addEventListener('click', () => modal({
    title: 'Новая папка объектов', body: '<div class="form-row"><label>Название</label><input id="fName" placeholder="Например: Под визу / JVC / Предстарты"></div>',
    actions: [{ label: 'Создать', cls: 'btn-accent', onClick: async (bd) => { await api.post('/folders', { name: $('#fName', bd).value, kind: 'prop' }); render(); } }, { label: 'Отмена' }],
  }));
  $$('[data-fdel]', root).forEach(b => b.addEventListener('click', async () => { await fetch('/api/folders/' + b.dataset.fdel, { method: 'DELETE' }); render(); }));
  $$('[data-fcoll]', root).forEach(b => b.addEventListener('click', async () => {
    const f = folders.find(x => x.id === b.dataset.fcoll);
    const ids = props.filter(x => x.folderId === f.id).map(x => x.id);
    if (!ids.length) { toast('Папка пуста', 'Перетащите в неё объекты'); return; }
    const c = await api.post('/collections', { title: f.name, propertyIds: ids });
    toast('Подборка собрана из папки', f.name + ' · ' + ids.length + ' ' + plural(ids.length, 'объект', 'объекта', 'объектов'), true);
    PAGE_STATE.collLead = '';
    go('collections');
  }));
  wireShelfDrag(root, '[data-dragprop]', async (itemId, folderId) => { await api.patch('/properties/' + itemId, { folderId }); render(); });
  $('#prAdd').addEventListener('click', async () => {
    const pr = await api.post('/properties', { name: 'Новый объект', geo: PAGE_STATE.propGeo || st.agency.geos[0] });
    PAGE_STATE.propView = pr.id;
    render();
  });
  $('#portalSave')?.addEventListener('click', async () => {
    const body = {};
    $$('[data-portal]', root).forEach(inp => { if (inp.value.trim()) body[inp.dataset.portal] = { key: inp.value.trim() }; });
    await api.patch('/portals', body);
    toast('Ключи сохранены', 'Синк листингов включим после проверки ключей', true);
    await loadState(); render();
  });
};

/* ---------------- ПОДБОРКИ ---------------- */
PAGES.collections = async (root) => {
  const [cols0, props, leads, allFolders] = await Promise.all([api.get('/collections'), api.get('/properties'), api.get('/leads'), api.get('/folders')]);
  const cFolders = allFolders.filter(f => f.kind === 'coll');
  const cFolderF = PAGE_STATE.collFolder || '';
  const cols = cols0.filter(c => !cFolderF || c.folderId === cFolderF);
  const active = leads.filter(l => !['lost'].includes(l.stage));
  const selLead = PAGE_STATE.collLead || '';
  let suggest = [];
  if (selLead) { try { suggest = await api.get(`/leads/${selLead}/suggest-properties`); } catch (e) {} }
  const ordered = selLead && suggest.length ? suggest : props;
  const fmt = (pr) => (pr.currency === 'EUR' ? '€' : '$') + (pr.priceFrom || 0).toLocaleString('ru-RU');
  const clViews = cols0.reduce((s2, c) => s2 + (c.views || 0), 0);
  const clHot = cols0.filter(c => c.analytics && c.analytics.maxDepth >= 75).length;
  root.innerHTML = `
    ${heroArt('assets/art/brochures.png', `
      <div class="ha-title">${ic(I.layers)}Подборки<span class="sub">персональные веб-страницы и PDF · трекинг каждого просмотра</span></div>
      ${[
        ['Собрано подборок', cols0.length, 'конструктор — слева'],
        ['Просмотров клиентами', clViews, 'по всем ссылкам'],
        ['Горячий интерес', clHot, 'изучили страницу на 75%+'],
      ].map(([k, v, sub]) => `<div class="ha-row" data-ha>
        <span class="nm2">${k}<div class="sub2">${sub}</div></span><span class="sp2"></span><span class="val2">${v}</span>
      </div>`).join('')}
    `, { v: 'left', hue: '#38A8E8' })}
    <div class="two-col">
      <div class="glass card">
        <div class="card-title">${ic(I.layers)}Конструктор подборки<span class="sub">веб-страница + PDF</span></div>
        <div class="form-row"><label>Для лида</label><select id="clLead"><option value="">— без лида (общая)</option>${active.map(l => `<option value="${l.id}" ${selLead === l.id ? 'selected' : ''}>${esc(l.name)} · ${l.geoName}</option>`).join('')}</select></div>
        <div class="form-row"><label>Название</label><input id="clTitle" value="${selLead ? 'Подборка под ваш запрос' : 'Подборка'}"></div>
        <div class="form-row"><label>Вступление (первая страница)</label><textarea id="clIntro" style="min-height:84px">${selLead ? esc(((active.find(l => l.id === selLead) || {}).name || '').split(' ')[0] + ', добрый день!\nПодготовил для вас подборку самых интересных проектов по выгодным ценам и с рассрочкой.\nЧто заинтересует — я на связи, посчитаю доходность по понравившимся.') : ''}</textarea></div>
        <div class="lp-sec">Объекты ${selLead ? '· отсортированы под запрос лида' : ''}</div>
        <div class="cl-props">
          ${ordered.map(pr => `<label class="cl-prop"><input type="checkbox" value="${pr.id}" ${pr.matchScore >= 2 || PAGE_STATE.collPreselect === pr.id ? 'checked' : ''}>
            <span class="cl-chk"></span>
            <span style="flex:1;min-width:0"><b>${esc(pr.name)}</b> <span class="muted" style="font-size:11px">${esc(pr.area)} · ${esc(pr.type)} · от ${fmt(pr)}</span></span>
            ${pr.matchScore >= 2 ? '<span class="mini-badge ok">match</span>' : ''}</label>`).join('')}
        </div>
        <button class="btn btn-accent" id="clCreate" style="margin-top:14px;width:100%;justify-content:center">${ic(I.plus)}Создать подборку</button>
      </div>
      <div>
        <div class="shelf shelf-sm">
          <div class="fold ${!cFolderF ? 'active' : ''}" data-cfopen=""><img src="assets/folder.png"><div class="fold-meta"><b>Все</b><i>${cols0.length}</i></div></div>
          ${cFolders.map(f => `<div class="fold ${cFolderF === f.id ? 'active' : ''}" data-cfopen="${f.id}" data-cfid="${f.id}">
            <img src="assets/folder.png"><div class="fold-meta"><b>${esc(f.name)}</b><i>${f.count}</i></div>
            <div class="fold-acts"><button class="btn-ghost" data-cfdel2="${f.id}">${ic(I.x)}</button></div>
          </div>`).join('')}
          <button class="fold fold-new" id="cfNew">${ic(I.plus)}<span>Папка</span></button>
        </div>
        ${cols.map(c => `<div class="glass cmp-card" data-cl="${c.id}" data-dragcoll="${c.id}">
          <div class="cmp-head"><div class="nm" data-act="ren" title="Переименовать">${esc(c.title)}<span class="nm-pen">${ic(I.edit || I.doc)}</span></div><span class="badge">${c.propertyIds.length} объект(а)</span>${c.views ? `<span class="badge acc">${ic(I.eye)}${c.views}</span>` : ''}</div>
          <div class="muted" style="font-size:11.5px;margin-top:4px">${c.leadName ? 'для: ' + esc(c.leadName) + ' · ' : ''}${ago(c.createdAt)}</div>
          ${c.analytics ? `<div class="lc-hint ${c.analytics.maxDepth >= 75 ? 'act' : 'info'}" style="margin-top:10px">${ic(I.eye)}Изучил на ${c.analytics.maxDepth}% · ${Math.max(1, Math.round((c.analytics.totalTime || 0) / 60))} мин на странице${c.analytics.deepSessions ? ' · глубоких просмотров: ' + c.analytics.deepSessions : ''}</div>` : ''}
          <div style="display:flex;gap:7px;margin-top:12px;flex-wrap:wrap">
            <a class="btn btn-sm btn-accent" href="/p/${c.id}?edit=1&key=${c.editKey}" target="_blank">${ic(I.edit || I.doc)}Конструктор</a>
            <a class="btn btn-sm" href="/p/${c.id}" target="_blank">${ic(I.eye)}Открыть</a>
            <button class="btn btn-sm" data-act="copy">${ic(I.copy)}Ссылка</button>
            <a class="btn btn-sm" href="/p/${c.id}?print=1" target="_blank">${ic(I.doc)}PDF</a>
            ${c.leadId ? `<button class="btn btn-sm btn-accent" data-act="send">${ic(I.send)}В чат лиду</button>` : ''}
            <span class="tb-spacer"></span>
            <button class="btn-ghost" data-act="del">${ic(I.x)}</button>
          </div>
        </div>`).join('') || '<div class="glass card empty">Подборок нет — соберите первую слева</div>'}
      </div>
    </div>`;
  $$('[data-cfopen]', root).forEach(f => f.addEventListener('click', (e) => {
    if (e.target.closest('[data-cfdel2]')) return;
    PAGE_STATE.collFolder = f.dataset.cfopen; render();
  }));
  $('#cfNew').addEventListener('click', () => modal({
    title: 'Новая папка подборок', body: '<div class="form-row"><label>Название</label><input id="cfName" placeholder="Например: Горячие / Инвесторы / Сентябрь"></div>',
    actions: [{ label: 'Создать', cls: 'btn-accent', onClick: async (bd) => { await api.post('/folders', { name: $('#cfName', bd).value, kind: 'coll' }); render(); } }, { label: 'Отмена' }],
  }));
  $$('[data-cfdel2]', root).forEach(b => b.addEventListener('click', async () => { await fetch('/api/folders/' + b.dataset.cfdel2, { method: 'DELETE' }); render(); }));
  wireShelfDrag(root, '[data-dragcoll]', async (itemId, folderId) => { await api.patch('/collections/' + itemId, { folderId }); render(); });
  $('#clLead').addEventListener('change', (e) => { PAGE_STATE.collLead = e.target.value; render(); });
  $('#clCreate').addEventListener('click', async () => {
    const ids = $$('.cl-prop input:checked', root).map(x => x.value);
    if (!ids.length) { toast('Отметьте хотя бы один объект'); return; }
    await api.post('/collections', { leadId: $('#clLead').value || null, title: $('#clTitle').value, intro: $('#clIntro').value, propertyIds: ids });
    render();
  });
  $$('[data-cl]', root).forEach(card => card.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const id = card.dataset.cl;
    if (act.dataset.act === 'copy') { navigator.clipboard.writeText(location.origin + '/p/' + id); toast('Ссылка скопирована', null, true); }
    if (act.dataset.act === 'send') { const r = await api.post(`/collections/${id}/send`); toast('Подборка ушла в чат', r.url, true); }
    if (act.dataset.act === 'del') { await fetch('/api/collections/' + id, { method: 'DELETE' }); render(); }
    if (act.dataset.act === 'ren' && !act.dataset.editing) {
      act.dataset.editing = '1';
      const cur = act.childNodes[0].textContent;
      act.innerHTML = '<input class="nm-edit">';
      const inp = act.querySelector('input');
      inp.value = cur;
      inp.focus(); inp.select();
      inp.addEventListener('pointerdown', ev => ev.stopPropagation()); /* не дёргать drag карточки */
      let done0 = false;
      const done = async (saveIt) => {
        if (done0) return; done0 = true;
        const v = inp.value.trim();
        if (saveIt && v && v !== cur) await api.patch('/collections/' + id, { title: v });
        render();
      };
      inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') done(true); if (ev.key === 'Escape') done(false); });
      inp.addEventListener('blur', () => done(true));
    }
  }));
};


/* ---------------- РЕАНИМАЦИЯ ---------------- */
PAGES.wake = async (root) => {
  const [preview, campaigns] = await Promise.all([api.get('/wake/preview'), api.get('/campaigns')]);
  PAGE_STATE.wakePreview = preview;
  const segs = { A: preview.filter(p => p.segment === 'A'), B: preview.filter(p => p.segment === 'B'), C: preview.filter(p => p.segment === 'C') };
  root.innerHTML = `
    ${heroArt('assets/art/moon.png', `
      <div class="ha-title">${ic(I.moon)}Спящая база<span class="sub">${preview.length} лидов ждут пробуждения · скоринг: свежесть + вовлечённость</span></div>
      ${[
        ['A', 'будить первыми', segs.A.length, 'score ≥ 55: свежие, вовлечённые, писали сами', '#FFB86B'],
        ['B', 'вторая волна', segs.B.length, 'score 30–54: были в диалоге, остыли', '#7C9BFF'],
        ['C', 'фон', segs.C.length, 'score < 30: холодные, редкими волнами', '#5E6C8F'],
      ].map(([k, nm, v, sub, col]) => `<div class="ha-row" data-ha>
        <span class="dot" style="background:${col};box-shadow:0 0 8px ${col}"></span>
        <span class="nm2"><b>Сегмент ${k}</b> · ${nm}<div class="sub2">${sub}</div></span>
        <span class="sp2"></span><span class="val2">${v}</span>
      </div>`).join('')}
    `, { v: 'mark', hue: '#5B2BD8' })}
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
        <div style="display:flex;justify-content:flex-end;margin-bottom:12px"><button class="btn btn-accent page-primary" id="newCmp">${ic(I.plus)}Новая кампания</button></div>
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

/* ---------------- АВТОМАТИЗАЦИИ ---------------- */
PAGES.automations = async (root) => {
  const s = STATE.settings;
  const a = s.automations || {};
  const swRow = (t, d, inner) => `<div class="set-row"><div class="sp"><div class="sl">${t}</div><div class="sd">${d}</div></div>${inner}</div>`;
  const sw = (key, on) => `<label class="switch"><input type="checkbox" data-auto="${key}" ${on ? 'checked' : ''}><span class="tr"></span><span class="th"></span></label>`;
  const link = (page, label) => `<button class="btn btn-sm" data-go="${page}">${label}</button>`;
  const autoOn = ['autoHandover', 'meetRemind', 'noshowReturn'].filter(k => a[k]).length + (s.ai.autopilot ? 1 : 0);
  root.innerHTML = `
    ${heroArt('assets/art/gears.png', `
      <div class="ha-title">${ic(I.bolt)}Автоматизации<span class="sub">рутина крутится сама — команда занимается клиентами</span></div>
      <div class="ha-chips">
        <span class="ha-chip" data-ha>Включено <b>${autoOn}</b></span>
        <span class="ha-chip" data-ha>${s.ai.autopilot ? '⚡ Автопилот ИИ активен' : 'Автопилот ИИ выключен'}</span>
        <span class="ha-chip" data-ha>${a.assignMode === 'load' ? 'Распределение: по загрузке' : a.assignMode === 'roundrobin' ? 'Распределение: по очереди' : 'Распределение: по сменам'}</span>
      </div>
      <div class="ha-row" style="padding-left:0;margin-top:8px" data-ha><span class="nm2">Отчёты в мессенджер: <b>${(s.reports || {}).daily || (s.reports || {}).weekly ? 'включены' : 'выключены'}</b> · мгновенные алерты: <b>${Object.values((s.reports || {}).instant || {}).filter(Boolean).length}</b></span></div>
    `, { v: 'mark', hue: '#5E7BB8' })}
    <div class="two-col">
      <div>
        <div class="glass card mb">
          <div class="card-title">${ic(I.users)}Распределение по брокерам</div>
          ${swRow('Режим распределения', 'Кому уходит квалифицированный лид нужного гео', `<select data-auto-sel="assignMode" style="width:190px">
            <option value="load" ${a.assignMode === 'load' ? 'selected' : ''}>По загрузке (меньше — берёт)</option>
            <option value="roundrobin" ${a.assignMode === 'roundrobin' ? 'selected' : ''}>По очереди</option>
            <option value="shift" ${a.assignMode === 'shift' ? 'selected' : ''}>По сменам + загрузке</option>
          </select>`, { v: 'right', hue: '#C05B8C' })}
          ${swRow('Авто-передача при квалификации', '4 оси закрыты → лид сам уходит брокеру с саммари и слотом, без ручного клика', sw('autoHandover', a.autoHandover))}
          ${swRow('Расписание смен', 'График каждого брокера настраивается в разделе «Брокеры»', link('brokers', 'К брокерам'))}
        </div>
        <div class="glass card mb">
          <div class="card-title">${ic(I.doc)}Отчёты и уведомления<span class="sub">сводки в Telegram владельцу</span></div>
          ${swRow('Ежедневная сводка', 'Лиды, квалы, встречи, горячие сигналы — каждый день в заданное время', `<select data-rep-sel="dailyAt" style="width:110px">${['08:00', '09:00', '10:00', '18:00', '20:00'].map(t => `<option ${((s.reports || {}).dailyAt || '09:00') === t ? 'selected' : ''}>${t}</option>`).join('')}</select>` + sw('rep_daily', (s.reports || {}).daily))}
          ${swRow('Еженедельная (пн) и ежемесячная (1-е)', 'Расширенные сводки по периодам', sw('rep_weekly', (s.reports || {}).weekly) + sw('rep_monthly', (s.reports || {}).monthly))}
          ${swRow('Мгновенные уведомления', 'Смотрит подборку · квалифицирован · нужен человек · сделка', sw('rep_instant', Object.values((s.reports || {}).instant || {}).some(Boolean)))}
          <div style="display:flex;gap:10px;align-items:flex-end;margin-top:8px">
            <div class="form-row" style="flex:1;margin:0"><label>Telegram chat_id владельца (бот: токен в каскаде ниже; chat_id — напишите боту и возьмите из @userinfobot)</label>
              <input id="repChat" value="${esc((s.reports || {}).tgChatId || '')}" placeholder="например 123456789"></div>
            <button class="btn btn-sm" id="repSave">Сохранить</button>
            <button class="btn btn-sm" id="repTest">${ic(I.send)}Тест-сводка</button>
          </div>
        </div>
        <div class="glass card mb">
          <div class="card-title">${ic(I.send)}Омниканальный каскад</div>
          <div class="muted" style="font-size:11.8px;margin-bottom:10px">Система сама решает, куда писать: идёт по приоритету сверху вниз, пропуская каналы, которых у клиента нет. Молчит весь круг — переключается на следующий канал и делает второй круг касаний.</div>
          <div id="chPrio">${(a2 => (s.channels?.priority || ['wa', 'tg', 'viber', 'email']).map((ch, i2) => {
            const names = { wa: 'WhatsApp', tg: 'Telegram', viber: 'Viber', email: 'E-mail (официальный тон)' };
            return `<div class="ch-prio" data-ch="${ch}">
              <b>${i2 + 1}</b><span style="flex:1">${names[ch]}</span>
              <button class="btn-ghost" data-chmv="-1">${ic(I.up || I.chev)}</button>
              <button class="btn-ghost" data-chmv="1" style="transform:rotate(180deg)">${ic(I.up || I.chev)}</button>
              <label class="switch"><input type="checkbox" data-chen="${ch}" ${s.channels?.enabled?.[ch] ? 'checked' : ''}><span class="tr"></span><span class="th"></span></label>
            </div>`;
          }).join(''))()}</div>
          ${swRow('Второй круг на следующем канале', 'Цепочка исчерпана без ответа → каскад переключает канал и повторяет касания', sw('chSecond', s.channels?.secondRound))}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
            <div class="form-row"><label>Telegram Bot Token</label><input id="chTg" type="password" placeholder="${s.channels?.tg?.keySet ? '•••••• сохранён' : 'от @BotFather'}"></div>
            <div class="form-row"><label>Resend API key (e-mail)</label><input id="chEm" type="password" placeholder="${s.channels?.email?.keySet ? '•••••• сохранён' : 're_…'}"></div>
            <div class="form-row"><label>E-mail отправителя</label><input id="chFrom" value="${esc(s.channels?.email?.from || '')}" placeholder="sales@agency.com"></div>
            <div class="form-row"><label>Viber token</label><input id="chVb" type="password" placeholder="${s.channels?.viber?.keySet ? '•••••• сохранён' : 'токен паблик-аккаунта'}"></div>
          </div>
          <button class="btn" id="chSave">Сохранить каскад</button>
        </div>
        <div class="glass card mb">
          <div class="card-title">${ic(I.cal)}Встречи</div>
          ${swRow('Цепочка напоминаний клиенту', 'Часы до встречи через запятую (0.5 = за 30 мин) — каждое уходит в WhatsApp со ссылкой на страницу встречи', `<input id="meetChain" style="width:150px" value="${esc((a.meetRemindChain || (a.meetingReminderHrs ? [a.meetingReminderHrs] : [24, 3])).join(', '))}" placeholder="24, 3, 0.5">`)}
          ${swRow('Тихие часы по поясу лида', 'Ночью касания/реанимация/напоминания сдвигаются на утро клиента; мгновенный ответ на свежую заявку — исключение (клиент онлайн). Пояс берётся из кода страны номера', `<span style="display:inline-flex;gap:6px;align-items:center;font-size:12px">с <input id="qhFrom" type="number" style="width:58px" value="${(a.quietHours || {}).from ?? 21}"> до <input id="qhTo" type="number" style="width:58px" value="${(a.quietHours || {}).to ?? 9}"> <label class="switch"><input type="checkbox" id="qhOn" ${(a.quietHours || {}).enabled !== false ? 'checked' : ''}><span class="tr"></span><span class="th"></span></label></span>`)}
          ${swRow('SLA брокера, минут', 'Не коснулся лида после передачи за N мин → эскалация в ленту; за 2×N → лид уходит следующему брокеру', `<input id="slaMin" type="number" style="width:90px" value="${a.brokerSlaMin || ''}" placeholder="30">`)}
          ${swRow('«Не пришёл» — вернуть в работу', 'Мягкое сообщение клиенту + ИИ снова ведёт диалог, лид не теряется', sw('noShowMessage', a.noShowMessage))}
        </div>
        <div class="glass card">
          <div class="card-title">${ic(I.spark)}Первая линия и ИИ</div>
          ${swRow('Мгновенный ответ + цепочка касаний', '7 касаний / 18 дней, пока клиент не ответил', link('sequences', 'Настроить'))}
          ${swRow('ИИ-квалификатор и правила отключения', 'Критерии по гео, стоп-слова, перехват человеком', link('qualifier', 'Настроить'))}
          ${swRow('Реанимация спящих', 'Скоринг + безопасные кампании пачками', link('wake', 'Настроить'))}
        </div>
      </div>
      <div>
        <div class="glass card mb">
          <div class="card-title">${ic(I.link)}Поток лидов</div>
          ${swRow('Приём из рекламы + дедупликация', 'Вебхук Albato/Make, повторные заявки не плодят дубли', link('ads', 'Настроить'))}
          ${swRow('Атрибуция к объявлениям', 'Мэтчинг ad_id на базу объявлений', link('ads', 'К базе'))}
          ${swRow('Исходящий мост', 'Квал/передача уходят POST-ом во внешнюю CRM', link('ads', 'Настроить'))}
        </div>
        <div class="glass card mb">
          <div class="card-title">${ic(I.funnel)}Конструктор воронки<span class="sub">названия, порядок, свои стадии</span></div>
          <div id="stList">${(STAGES._all || STAGES).map(st => `<div class="ch-prio" data-stid="${st.id}">
            <span class="kb-ic">${ic(I[st.icon] || I.doc)}</span>
            <input class="gi" data-stname value="${esc(st.name)}" style="flex:1">
            <button class="btn-ghost" data-stmv="-1">${ic(I.chev)}</button>
            <button class="btn-ghost" data-stmv="1" style="transform:rotate(90deg)">${ic(I.chev)}</button>
            ${st.sys ? '<span class="mini-badge" title="Системная: на ней завязаны ИИ и цепочки — можно переименовать и подвинуть, но не удалить">🔒</span>'
              : `<label class="switch" title="Показывать в канбане"><input type="checkbox" data-sthide ${(s.stagesCfg?.hidden || []).includes(st.id) ? '' : 'checked'}><span class="tr"></span><span class="th"></span></label>
                 <button class="btn-ghost" data-stdel>${ic(I.x)}</button>`}
          </div>`).join('')}</div>
          <div class="lc-note-row" style="margin-top:9px">
            <input id="stNew" placeholder="Своя стадия (например: Бронь / Договор / Ипотека)">
            <button class="btn btn-sm" id="stAdd">${ic(I.plus)}</button>
          </div>
          <button class="btn btn-accent btn-sm" id="stSave" style="margin-top:10px">Сохранить воронку</button>
        </div>
        <div class="glass card">
          <div class="card-title">${ic(I.doc)}Свои поля карточки лида</div>
          <div class="muted" style="font-size:11.8px;margin-bottom:10px">Поля агентства — видны в карточке каждого лида. Тип «выбор» — свои варианты через запятую.</div>
          <div id="cfList">${(s.customFields || []).map((f, i) => `<div class="set-row"><div class="sp"><div class="sl">${esc(f.label)}</div><div class="sd">${f.type === 'select' ? 'выбор: ' + esc((f.options || []).join(', ')) : 'текст'}</div></div><button class="btn-ghost" data-cfdel="${i}">${ic(I.x)}</button></div>`).join('') || '<div class="muted" style="font-size:12px;padding:6px 0">Полей пока нет</div>'}</div>
          <div class="lc-note-row" style="margin-top:10px">
            <input id="cfLabel" placeholder="Название поля (напр. Паспорт/ВНЖ)">
            <select id="cfType" style="width:110px;flex:0 0 110px"><option value="text">Текст</option><option value="select">Выбор</option></select>
          </div>
          <input id="cfOptions" placeholder="Варианты через запятую (для типа «выбор»)" style="width:100%;margin-top:8px;display:none">
          <button class="btn btn-accent btn-sm" id="cfAdd" style="margin-top:10px">${ic(I.plus)}Добавить поле</button>
        </div>
      </div>
    </div>`;
  $$('[data-go]', root).forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
  const saveAuto = async (patch) => { await api.patch('/settings', { automations: patch }); loadState(); };
  const repPatch = () => ({
    daily: root.querySelector('[data-auto="rep_daily"]').checked,
    weekly: root.querySelector('[data-auto="rep_weekly"]').checked,
    monthly: root.querySelector('[data-auto="rep_monthly"]').checked,
    dailyAt: root.querySelector('[data-rep-sel="dailyAt"]').value,
    tgChatId: $('#repChat').value.trim(),
    instant: (on => ({ hotView: on, qualified: on, aiOff: on, deal: on }))(root.querySelector('[data-auto="rep_instant"]').checked),
  });
  $('#repSave').addEventListener('click', async () => { await api.patch('/settings', { reports: repPatch() }); toast('Отчёты настроены', null, true); loadState(); });
  $('#repTest').addEventListener('click', async () => {
    await api.patch('/settings', { reports: repPatch() });
    const r = await api.post('/reports/test');
    modal({ title: 'Тестовая сводка', sub: r.sent === 'tg' ? 'Отправлена в Telegram' : 'Telegram не подключён — вот как она выглядит:', body: `<pre style="white-space:pre-wrap;font-size:12.5px;line-height:1.6;background:var(--bg);border-radius:10px;padding:14px">${esc(r.text)}</pre>`, wide: true });
  });
  $$('[data-chmv]', root).forEach(b => b.addEventListener('click', () => {
    const row = b.closest('.ch-prio');
    const sib = +b.dataset.chmv < 0 ? row.previousElementSibling : row.nextElementSibling;
    if (sib) (+b.dataset.chmv < 0 ? sib.before(row) : sib.after(row));
    $$('#chPrio .ch-prio b', root).forEach((x, i2) => x.textContent = i2 + 1);
  }));
  $('#chSave').addEventListener('click', async () => {
    const priority = $$('#chPrio .ch-prio', root).map(x => x.dataset.ch);
    const enabled = {};
    $$('[data-chen]', root).forEach(x => enabled[x.dataset.chen] = x.checked);
    const ch = { priority, enabled, email: { from: $('#chFrom').value.trim() } };
    if ($('#chTg').value.trim()) ch.tg = { botToken: $('#chTg').value.trim() };
    if ($('#chEm').value.trim()) ch.email.key = $('#chEm').value.trim();
    if ($('#chVb').value.trim()) ch.viber = { token: $('#chVb').value.trim() };
    const sec = root.querySelector('[data-auto="chSecond"]');
    if (sec) ch.secondRound = sec.checked;
    await api.patch('/settings', { channels: ch });
    toast('Каскад сохранён', 'Порядок и каналы применены', true);
    loadState();
  });
  $$('[data-auto]', root).forEach(sw2 => sw2.addEventListener('change', () => { if (!['chSecond', 'rep_daily', 'rep_weekly', 'rep_monthly', 'rep_instant'].includes(sw2.dataset.auto)) saveAuto({ [sw2.dataset.auto]: sw2.checked }); }));
  $$('[data-auto-sel]', root).forEach(sel => sel.addEventListener('change', () => saveAuto({ [sel.dataset.autoSel]: isNaN(+sel.value) ? sel.value : +sel.value })));
  /* Solo: команда/распределение/SLA не нужны — прячем целыми карточками */
  if (IS_SOLO()) {
    [...$$('.card-title', root)].filter(t => t.textContent.includes('Распределение по брокерам')).forEach(t => { t.closest('.glass.card').style.display = 'none'; });
    const slaRow = $('#slaMin', root);
    if (slaRow) slaRow.closest('.set-row').style.display = 'none';
  }
  const qhSave = () => saveAuto({ quietHours: { enabled: $('#qhOn').checked, from: Math.min(23, Math.max(0, +$('#qhFrom').value || 21)), to: Math.min(23, Math.max(0, +$('#qhTo').value || 9)) } });
  ['qhFrom', 'qhTo', 'qhOn'].forEach(id2 => { const el2 = $('#' + id2); if (el2) el2.addEventListener('change', qhSave); });
  const sla = $('#slaMin');
  if (sla) sla.addEventListener('change', () => saveAuto({ brokerSlaMin: +sla.value || 0 }));
  const mc = $('#meetChain');
  if (mc) mc.addEventListener('change', () => {
    const chain = mc.value.split(',').map(x => parseFloat(x.trim().replace(',', '.'))).filter(x => x > 0).slice(0, 6);
    saveAuto({ meetRemindChain: chain });
    toast('Цепочка напоминаний сохранена', chain.length ? chain.map(h => h >= 1 ? 'за ' + h + ' ч' : 'за ' + Math.round(h * 60) + ' мин').join(' · ') : 'напоминания выключены', true);
  });
  const stSaveAll = async () => {
    const rows = $$('#stList .ch-prio', root);
    const order = rows.map(x => x.dataset.stid);
    const names = {};
    rows.forEach(x => names[x.dataset.stid] = x.querySelector('[data-stname]').value.trim() || x.dataset.stid);
    const custom = rows.filter(x => !BASE_STAGES.some(b => b.id === x.dataset.stid)).map(x => ({ id: x.dataset.stid, name: names[x.dataset.stid] }));
    const hidden = rows.filter(x => { const h = x.querySelector('[data-sthide]'); return h && !h.checked; }).map(x => x.dataset.stid);
    await api.patch('/settings', { stagesCfg: { order, names, custom, hidden } });
    await loadState();
    toast('Воронка сохранена', 'Стадии применены во всех разделах', true);
    render();
  };
  $('#stSave').addEventListener('click', stSaveAll);
  $$('#stList [data-stmv]', root).forEach(b => b.addEventListener('click', () => {
    const row = b.closest('.ch-prio');
    const sib = +b.dataset.stmv < 0 ? row.previousElementSibling : row.nextElementSibling;
    if (sib) (+b.dataset.stmv < 0 ? sib.before(row) : sib.after(row));
  }));
  $$('#stList [data-stdel]', root).forEach(b => b.addEventListener('click', () => b.closest('.ch-prio').remove()));
  $('#stAdd').addEventListener('click', () => {
    const name = $('#stNew').value.trim();
    if (!name) return;
    const id = 'st_' + name.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '_').slice(0, 20);
    const row = el(`<div class="ch-prio" data-stid="${id}"><span class="kb-ic">${ic(I.doc)}</span><input class="gi" data-stname value="${esc(name)}" style="flex:1"><button class="btn-ghost" data-stmv="-1">${ic(I.chev)}</button><button class="btn-ghost" data-stmv="1" style="transform:rotate(90deg)">${ic(I.chev)}</button><label class="switch"><input type="checkbox" data-sthide checked><span class="tr"></span><span class="th"></span></label><button class="btn-ghost" data-stdel>${ic(I.x)}</button></div>`);
    $('#stList').appendChild(row);
    row.querySelector('[data-stdel]').addEventListener('click', () => row.remove());
    $$('[data-stmv]', row).forEach(b2 => b2.addEventListener('click', () => { const sib = +b2.dataset.stmv < 0 ? row.previousElementSibling : row.nextElementSibling; if (sib) (+b2.dataset.stmv < 0 ? sib.before(row) : sib.after(row)); }));
    $('#stNew').value = '';
  });
  $('#cfType').addEventListener('change', (e) => { $('#cfOptions').style.display = e.target.value === 'select' ? '' : 'none'; });
  $('#cfAdd').addEventListener('click', async () => {
    const label = $('#cfLabel').value.trim();
    if (!label) return;
    const f = { key: 'cf_' + label.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '_').slice(0, 30), label, type: $('#cfType').value, options: $('#cfOptions').value.split(',').map(x => x.trim()).filter(Boolean) };
    await api.patch('/settings', { customFields: [...(s.customFields || []), f] });
    await loadState();
    render();
  });
  $$('[data-cfdel]', root).forEach(b => b.addEventListener('click', async () => {
    await api.patch('/settings', { customFields: (s.customFields || []).filter((_, i) => i !== +b.dataset.cfdel) });
    await loadState();
    render();
  }));
};

/* ---------------- ПЛЕЙБУК ПРОДАЖ ---------------- */
PAGES.playbook = async (root) => {
  const pb = await api.get('/playbook');
  const cats = [
    ['first', 'Первое касание', I.bolt, 'Скорость, канал, якорь на объявление'],
    ['followup', 'Фоллоу-апы', I.chain, 'Дожимы, которые не бесят'],
    ['call', 'Вывод в звонок', I.phone, 'Как поднять из текста в голос'],
    ['zoom', 'Мотивация на Zoom', I.cal, 'Показ вместо «встречи», явка'],
    ['post', 'Дожим после Zoom', I.flame, 'Резюме, дефицит, ROI, тишина'],
    ['objections', 'Возражения', I.shield, '«Подумаю», «дорого», удалёнка'],
    ['qualify', 'Квалификация', I.spark, 'LPMAMA, бюджет вилкой'],
  ];
  if (!PAGE_STATE.pbCat) PAGE_STATE.pbCat = 'first';
  const cur = PAGE_STATE.pbCat;
  const items = pb.filter(x => x.cat === cur);
  root.innerHTML = `
    ${heroArt('assets/art/book.png', `
      <div class="ha-title">${ic(I.doc)}Плейбук продаж<span class="sub">${pb.length} приёмов · Дубай и США · вшит в промпт ИИ</span></div>
      <div class="ha-chips">${cats.map(([k, name]) => `<span class="ha-chip" data-ha data-pbgo="${k}" style="cursor:pointer">${name} <b>${pb.filter(x => x.cat === k).length}</b></span>`).join('')}</div>
      <div class="ha-row" style="padding-left:0;margin-top:8px" data-ha><span class="nm2">ИИ применяет эти приёмы сам — в диалогах и в подсказке «что делать дальше» в карточке лида</span></div>
    `, { v: 'right', hue: '#B87E4B' })}
    <div class="pb-layout">
      <div class="pb-nav glass">
        <div class="pb-nav-hd">Категории</div>
        ${cats.map(([k, name, icn, sub]) => `<button class="pb-cat ${k === cur ? 'active' : ''}" data-cat="${k}">
          <span class="pb-cat-ic">${ic(icn)}</span>
          <span class="pb-cat-t"><b>${name}</b><i>${sub}</i></span>
          <span class="pb-cat-n">${pb.filter(x => x.cat === k).length}</span>
        </button>`).join('')}
        <div class="pb-tipbox">${ic(I.spark)}Приёмы этой вкладки ИИ уже применяет сам в диалогах и в подсказке карточки лида.</div>
      </div>
      <div class="pb-main">
        <div class="pb-main-hd">${ic((cats.find(c => c[0] === cur) || [])[2])}<b>${(cats.find(c => c[0] === cur) || [])[1]}</b><span>${items.length} приёмов</span></div>
        ${items.map((x, i) => `<div class="pb-acc ${i === 0 ? 'open' : ''}" data-acc>
          <button class="pb-acc-hd">
            <span class="pb-num">${String(i + 1).padStart(2, '0')}</span>
            <span class="pb-acc-t">${esc(x.title)}</span>
            <span class="chev">${ic(I.chev, 2)}</span>
          </button>
          <div class="pb-acc-body"><div class="pb-acc-inner">
            <div class="pb-b">${esc(x.body)}</div>
            <div class="pb-tip">${ic(I.spark)}${esc(x.tip)}</div>
          </div></div>
        </div>`).join('')}
      </div>
    </div>`;
  $$('.pb-cat', root).forEach(b => b.addEventListener('click', () => { PAGE_STATE.pbCat = b.dataset.cat; render(); }));
  $$('[data-pbgo]', root).forEach(b => b.addEventListener('click', () => { PAGE_STATE.pbCat = b.dataset.pbgo; render(); }));
  $$('.pb-acc-hd', root).forEach(h => h.addEventListener('click', () => h.parentElement.classList.toggle('open')));
};

/* ---------------- РЕКЛАМА (мост Albato + атрибуция) ---------------- */
PAGES.ads = async (root) => {
  const d = await api.get('/ads');
  const hookUrl = `${location.origin}/hooks/lead?key=${d.hooks.secret}`;
  const adLeads = d.ads.reduce((s2, a) => s2 + a.leads, 0);
  const topAd = d.ads.slice().sort((a, b) => b.leads - a.leads)[0];
  root.innerHTML = `
    ${heroArt('assets/art/mega.png', `
      <div class="ha-title">${ic(I.target || I.bolt)}Реклама<span class="sub">атрибуция лидов до объявления</span></div>
      ${[
        ['Объявлений в базе', d.ads.length, 'связаны с лидами по ad_id'],
        ['Лидов с рекламы', adLeads, 'через мост и CTWA'],
        topAd && topAd.leads ? ['Топ-объявление', topAd.leads + ' лидов', esc(topAd.name || topAd.adId)] : null,
      ].filter(Boolean).map(([k, v, sub]) => `<div class="ha-row" data-ha>
        <span class="nm2">${k}<div class="sub2">${sub}</div></span><span class="sp2"></span><span class="val2">${v}</span>
      </div>`).join('')}
    `, { v: 'right', hue: '#E4813D' })}
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
    ${heroArt('assets/art/sim.png', `
      <div class="ha-title">${ic(I.sim)}Пул номеров<span class="sub">здоровье канала WhatsApp</span></div>
      ${[
        ['Активных номеров', st.numbers.filter(n => n.state === 'active').length, 'в ротации'],
        ['Среднее качество', Math.round(st.numbers.reduce((s2, n) => s2 + n.quality, 0) / Math.max(st.numbers.length, 1)) + '%', 'доставляемость'],
        ['Отправлено сегодня', st.numbers.reduce((s2, n) => s2 + n.sentToday, 0), 'по всем номерам'],
      ].map(([k, v, sub]) => `<div class="ha-row" data-ha>
        <span class="nm2">${k}<div class="sub2">${sub}</div></span><span class="sp2"></span><span class="val2">${v}</span>
      </div>`).join('')}
    `, { v: 'right', hue: '#23B383' })}
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
    ${heroArt('assets/art/docs.png', `
      <div class="ha-title">${ic(I.doc)}Шаблоны WhatsApp<span class="sub">инициирующие сообщения — только одобренными шаблонами Meta</span></div>
      ${[
        ['Utility · сервисные', st.templates.filter(t => t.category === 'utility').length, 'в ~4 раза дешевле marketing'],
        ['Marketing · инициация', st.templates.filter(t => t.category === 'marketing').length, 'первые касания и реанимация'],
        ['Одобрено · на модерации', st.templates.filter(t => t.status === 'approved').length + ' · ' + st.templates.filter(t => t.status === 'pending').length, 'статус Meta'],
      ].map(([k, v, sub]) => `<div class="ha-row" data-ha>
        <span class="nm2">${k}<div class="sub2">${sub}</div></span><span class="sp2"></span><span class="val2">${v}</span>
      </div>`).join('')}
    `, { v: 'left', hue: '#64748B' })}
    <div style="display:flex;justify-content:flex-end;margin-bottom:14px"><button class="btn btn-accent page-primary" id="newTpl">${ic(I.plus)}Новый шаблон</button></div>
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
  let auditLog = [];
  try { auditLog = await api.get('/audit'); } catch (e) {}
  const st = STATE.settings;
  const days = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  const editId = PAGE_STATE.brokerEdit;
  const brHot = leads.filter(l => ['handover', 'viewing'].includes(l.stage)).length;
  const brCap = STATE.brokers.reduce((s2, b) => s2 + (b.capacity || 0), 0);
  const brLoad = STATE.brokers.reduce((s2, b) => s2 + (b.load || 0), 0);
  root.innerHTML = `
  ${heroArt('assets/art/team.png', `
    <div class="ha-title">${ic(I.users)}Команда брокеров<span class="sub">квалифицированные лиды распределяются сами</span></div>
    ${[
      ['В команде', STATE.brokers.length, 'брокеров в ротации'],
      ['Загрузка', brCap ? Math.round(brLoad / brCap * 100) + '%' : '—', brLoad + ' лидов из ' + brCap + ' мест'],
      ['Горячих в работе', brHot, 'передано + показы'],
    ].map(([k, v, sub]) => `<div class="ha-row" data-ha>
      <span class="nm2">${k}<div class="sub2">${sub}</div></span><span class="sp2"></span><span class="val2">${v}</span>
    </div>`).join('')}
  `, { v: 'mark', hue: '#4F5BD5' })}
  <div class="filters"><span class="muted" style="font-size:12px">${STATE.brokers.length} в команде · распределение: ${{ load: 'по загрузке', roundrobin: 'по очереди', shift: 'по сменам' }[(st.automations || {}).assignMode] || ''} <button class="btn btn-sm" id="brAutoLink" style="margin-left:8px">Настроить</button></span>
    <button class="btn btn-accent page-primary" id="brAdd">${ic(I.plus)}Брокер</button>
    ${hint('brokers', 'Как ИИ выбирает брокера', [
      ['Режим распределения', 'По загрузке, по очереди или по сменам — в «Автоматизациях»'],
      ['Саммари вместе с лидом', '4 оси с цитатами, источник, история диалога'],
      ['Авто-задача', '«Позвонить в течение 30 минут» при передаче']])}</div>
  <div class="broker-grid">
    ${STATE.brokers.map(b => {
      const mine = leads.filter(l => l.broker === b.id);
      const hot = mine.filter(l => ['handover', 'viewing'].includes(l.stage)).length;
      const pct = Math.min(Math.round(b.load / b.capacity * 100), 100);
      if (editId === b.id) return `<div class="pds br-edit" data-bredit="${b.id}">
        <div class="pds-hd"><span class="pds-ic v">${ic(I.user)}</span><div><b>${esc(b.name)}</b><i>профиль брокера · смены и лимиты</i></div>
          <span class="tb-spacer"></span>
          <button class="btn btn-accent btn-sm" data-brsave="${b.id}">${ic(I.check)}Готово</button>
          <button class="btn btn-sm" data-brcancel>Отмена</button>
          <button class="btn-ghost" data-brdel="${b.id}" title="Удалить брокера">${ic(I.x)}</button>
        </div>
        <div class="br-edit-grid">
          <div>
            <div class="pd-fact"><label class="lc-lbl">Имя</label><input class="gi" data-be="name" value="${esc(b.name)}"></div>
            <div class="pds-grid c2" style="margin-top:10px">
              <div class="pd-fact"><label class="lc-lbl">Направление</label><select data-be="geo">${st.agency.geos.map(g => `<option value="${g}" ${b.geo === g ? 'selected' : ''}>${st.geoNames[g]}</option>`).join('')}</select></div>
              <div class="pd-fact"><label class="lc-lbl">Лимит лидов</label><input class="gi" data-be="capacity" type="number" value="${b.capacity}"></div>
            </div>
            <div class="pds-grid c2" style="margin-top:10px">
              <div class="pd-fact"><label class="lc-lbl">Личный PIN для входа (мин. 6 символов)</label><input class="gi" data-be="pin" type="password" placeholder="${b.pinHash ? '•••••• задан — ввести новый' : 'выдайте брокеру PIN'}"></div>
              <div class="pd-fact"><label class="lc-lbl">Доступ в систему</label>
                <div style="display:flex;gap:9px;align-items:center;padding-top:6px"><label class="switch"><input type="checkbox" data-be="active" ${b.active !== false ? 'checked' : ''}><span class="tr"></span><span class="th"></span></label>
                <span class="muted" style="font-size:11.5px">${b.active !== false ? 'активен · видит только своих лидов' : 'отключён · лиды переданы команде'}</span></div>
              </div>
            </div>
            <div class="pd-fact" style="margin-top:10px"><label class="lc-lbl">Языки</label>
              <div class="chips-row">${[...new Set(['ru', 'en', 'ar', 'id', 'es', 'de', 'fr', 'it', 'zh', ...b.langs])].map(lg => `<button type="button" class="chip-t lang-chip ${b.langs.includes(lg) ? 'on' : ''}" data-lg="${esc(lg)}">${esc(lg)}</button>`).join('')}
                <span class="chip-add"><input id="langAddInp" placeholder="+ язык" style="width:76px"><button class="chip-plus" id="langAddBtn">${ic(I.plus)}</button></span>
              </div></div>
          </div>
          <div>
            <label class="lc-lbl">Дни смен · у каждого дня свой интервал</label>
            <div class="chips-row" style="margin-bottom:12px">${days.map((d, i3) => `<button type="button" class="chip-t day-chip ${(b.schedule?.days || []).includes(i3 + 1) ? 'on' : ''}" data-d="${i3 + 1}">${d}</button>`).join('')}</div>
            <div id="dayTimes"></div>
            <button type="button" class="btn btn-sm" id="dtSameAll" style="margin-top:8px">${ic(I.copy)}Как в первом дне — во все</button>
          </div>
        </div>
      </div>`;
      return `<div class="glass broker-card" data-brok="${b.id}" style="cursor:pointer" title="Клик — редактировать">
        <div class="ava" style="width:44px;height:44px;flex:0 0 44px;font-size:14px">${esc(b.avatar)}</div>
        <div class="bmeta">
          <div class="nm">${esc(b.name)}</div>
          <div class="gl">${st.geoNames[b.geo]} · ${b.langs.join(' / ')} · сделок 90 дн: ${b.deals90}</div>
          <div class="load-track"><i style="width:${pct}%"></i></div>
          <div class="muted" style="font-size:11px;margin-top:5px">загрузка ${b.load}/${b.capacity} · в работе от ИИ: ${hot}</div>
          <div style="display:flex;gap:6px;align-items:center;margin-top:9px">
            <span class="badge ${isOnShift(b) ? 'ok' : ''}">${isOnShift(b) ? 'на смене' : 'не на смене'}</span>
            <span class="muted" style="font-size:10.5px">${(b.schedule?.days || []).map(d => ['', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'][d]).join(' ')} · ${(() => { const pd = b.schedule?.perDay || {}; const wins = (b.schedule?.days || []).map(d => (pd[d] ? pd[d].from + '–' + pd[d].to : (b.schedule?.from || '') + '–' + (b.schedule?.to || ''))); return [...new Set(wins)].length > 1 ? 'инд. график' : (wins[0] || ''); })()}</span>
          </div>
        </div>
      </div>`;
    }).join('')}
  </div>
  ${auditLog.length ? `<div style="margin-top:16px">${coll('Журнал доступа · безопасность базы', `<div style="font-size:12px;line-height:1.9;padding:6px 2px">${auditLog.slice(0, 40).map(a => `<div><span class="muted">${new Date(a.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span> · <b>${esc(a.who || '—')}</b> — ${esc(a.action)}${a.lead ? ' · ' + esc(a.lead) : ''}</div>`).join('')}</div>`, { open: false, count: auditLog.length, icon: I.shield })}</div>` : ''}
  `;
  $('#brAutoLink').addEventListener('click', () => go('automations'));
  $('#brAdd').addEventListener('click', async () => {
    const nb = await api.post('/brokers', { name: 'Новый брокер' });
    await loadState();
    PAGE_STATE.brokerEdit = nb.id;
    render();
  });
  $$('[data-brok]', root).forEach(c => c.addEventListener('click', () => { PAGE_STATE.brokerEdit = c.dataset.brok; render(); }));
  const eb = root.querySelector('[data-bredit]');
  if (eb) {
    /* пер-дневные интервалы: строка «день · с – до» на каждый активный день */
    const bEdit = STATE.brokers.find(x => x.id === eb.dataset.bredit) || {};
    const dayNames = ['', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
    const perDay0 = (bEdit.schedule || {}).perDay || {};
    const dtVals = {};
    for (let d2 = 1; d2 <= 7; d2++) dtVals[d2] = perDay0[d2] || { from: bEdit.schedule?.from || '09:00', to: bEdit.schedule?.to || '20:00' };
    const buildDayTimes = () => {
      const on = $$('.day-chip.on', eb).map(x => +x.dataset.d);
      $('#dayTimes', eb).innerHTML = on.map(d2 => `<div class="dt-row" data-dtday="${d2}">
        <span class="dt-d">${dayNames[d2]}</span>
        <input class="gi dt-from" type="time" value="${dtVals[d2].from}">
        <span class="dt-sep">–</span>
        <input class="gi dt-to" type="time" value="${dtVals[d2].to}">
      </div>`).join('') || '<div class="muted" style="font-size:12px">Дни не выбраны — брокер вне ротации смен</div>';
      $$('.dt-row', eb).forEach(row => {
        const d2 = +row.dataset.dtday;
        row.querySelector('.dt-from').addEventListener('change', (e) => { dtVals[d2].from = e.target.value; });
        row.querySelector('.dt-to').addEventListener('change', (e) => { dtVals[d2].to = e.target.value; });
      });
      enhanceControls($('#dayTimes', eb));   /* кастомные тайм-пикеры и на перестроенных строках */
    };
    buildDayTimes();
    $('#dtSameAll', eb).addEventListener('click', () => {
      const on = $$('.day-chip.on', eb).map(x => +x.dataset.d);
      if (!on.length) return;
      const first = dtVals[on[0]];
      on.forEach(d2 => { dtVals[d2] = { from: first.from, to: first.to }; });
      buildDayTimes();
    });
    $$('.day-chip', eb).forEach(ch => ch.addEventListener('click', () => { ch.classList.toggle('on'); buildDayTimes(); }));
    $$('.lang-chip', eb).forEach(ch => ch.addEventListener('click', () => ch.classList.toggle('on')));
    const lAdd = () => {
      const inp = eb.querySelector('#langAddInp');
      const v = inp.value.trim().toLowerCase();
      if (!v) return;
      inp.value = '';
      const chip = el(`<button type="button" class="chip-t lang-chip on" data-lg="${esc(v)}">${esc(v)}</button>`);
      chip.addEventListener('click', () => chip.classList.toggle('on'));
      eb.querySelector('#langAddInp').closest('.chips-row').insertBefore(chip, eb.querySelector('.chip-add'));
    };
    eb.querySelector('#langAddBtn').addEventListener('click', lAdd);
    eb.querySelector('#langAddInp').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); lAdd(); } });
    eb.querySelector('[data-brsave]').addEventListener('click', async () => {
      const pinVal = eb.querySelector('[data-be="pin"]').value.trim();
      await api.patch('/brokers/' + eb.dataset.bredit, {
        name: eb.querySelector('[data-be="name"]').value,
        geo: eb.querySelector('[data-be="geo"]').value,
        capacity: +eb.querySelector('[data-be="capacity"]').value,
        ...(pinVal ? { pin: pinVal } : {}),
        active: eb.querySelector('[data-be="active"]').checked,
        langs: $$('.lang-chip.on', eb).map(x => x.dataset.lg),
        schedule: (() => {
          const on = $$('.day-chip.on', eb).map(x => +x.dataset.d);
          const perDay = {};
          on.forEach(d2 => { perDay[d2] = dtVals[d2]; });
          const base = on.length ? dtVals[on[0]] : { from: '09:00', to: '20:00' };
          return { days: on, from: base.from, to: base.to, perDay };
        })(),
      });
      PAGE_STATE.brokerEdit = null;
      await loadState(); render();
    });
    eb.querySelector('[data-brcancel]').addEventListener('click', () => { PAGE_STATE.brokerEdit = null; render(); });
    eb.querySelector('[data-brdel]').addEventListener('click', async () => {
      const r = await fetch('/api/brokers/' + eb.dataset.bredit, { method: 'DELETE' });
      if (!r.ok) toast('Нельзя удалить', (await r.json()).error);
      PAGE_STATE.brokerEdit = null;
      await loadState(); render();
    });
  }
};

/* брокер на смене? (зеркало серверной логики) */
function isOnShift(b) {
  const now = new Date();
  const day = now.getDay() === 0 ? 7 : now.getDay();
  const sch = b.schedule || {};
  if (sch.days && !sch.days.includes(day)) return false;
  const hm = now.getHours() * 60 + now.getMinutes();
  const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  const win = (sch.perDay || {})[day] || sch;
  return !(win.from && hm < toMin(win.from)) && !(win.to && hm >= toMin(win.to));
}

/* ---------------- АНАЛИТИКА ---------------- */
PAGES.analytics = async (root) => {
  const an = await api.get('/analytics');
  root.innerHTML = `
    ${heroArt('assets/art/chart.png', `
      <div class="ha-title">${ic(I.bars)}Аналитика<span class="sub">человек против ИИ — живые цифры</span></div>
      ${[
        ['Первый контакт', an.compare.aiLine.firstContact, an.compare.human.firstContact],
        ['Конверсия в диалог', an.compare.aiLine.dialogConv + '%', an.compare.human.dialogConv + '%'],
        ['Лид → квалификация', an.compare.aiLine.qualConv + '%', an.compare.human.qualConv + '%'],
      ].map(([k, ai2, hum]) => `<div class="ha-row" data-ha>
        <span class="nm2">${k}</span><span class="sp2"></span>
        <span class="sub2">человек: ${hum}</span><span class="val2" style="min-width:64px;text-align:right">${ai2}</span>
      </div>`).join('')}
    `, { v: 'left', hue: '#0FA98E' })}
    <div class="glass card mb">
      <div class="card-title">${ic(I.bars)}Показатели первой линии</div>
      <div class="vs">
        <div class="vs-col"><div class="hd">Ручная обработка</div>
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

/* ---------------- ПРОФИЛЬ АГЕНТСТВА (открывается из футера сайдбара) ---------------- */
PAGES.agency = async (root) => {
  const s = STATE.settings;
  root.innerHTML = `
    <div class="two-col">
      <div>
        <div class="glass card mb">
          <div class="card-title">${ic(I.building)}Агентство<span class="sub">бренд на подборках, PDF и в системе</span></div>
          <div class="pd-fact" style="margin-bottom:14px"><label class="lc-lbl">Формат работы</label>
            <div class="chips-row">
              <button type="button" class="chip-t ${(s.agency.edition || 'agency') === 'agency' ? 'on' : ''}" data-edition="agency">🏢 Агентство · команда брокеров</button>
              <button type="button" class="chip-t ${s.agency.edition === 'solo' ? 'on' : ''}" data-edition="solo">👤 Solo · работаю один</button>
            </div>
            <div class="muted" style="font-size:11px;margin-top:6px">Solo прячет команду, распределение и SLA — все лиды ведёте вы, «передача» становится «взять в работу»</div>
          </div>
          <div style="display:flex;gap:16px;align-items:center">
            <div class="ag-logo" id="agLogoPrev">${s.agency.logo ? `<img src="${esc(s.agency.logo)}">` : `<img src="logo.svg" style="opacity:.4">`}</div>
            <div style="flex:1">
              <div class="form-row"><label>Название агентства</label><input id="agName" value="${esc(s.agency.name)}"></div>
              <div style="display:flex;gap:8px">
                <button class="btn btn-sm" id="agLogoBtn">${ic(I.plus)}Загрузить логотип</button>
                <input type="file" id="agLogoFile" accept="image/png,image/svg+xml,image/jpeg,image/webp" style="display:none">
                <button class="btn btn-accent btn-sm" id="agSave">Сохранить</button>
              </div>
              <div class="muted" style="font-size:11px;margin-top:7px">PNG/SVG до 3 МБ, лучше светлый/белый — он встаёт на синие обложки подборок и в шапку PDF</div>
            </div>
          </div>
        </div>
        <div class="glass card mb">
          <div class="card-title">${ic(I.user)}Подпись менеджера<span class="sub">обложка подборок и PDF</span></div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
            <div class="form-row"><label>Имя</label><input id="mgrName" value="${esc((s.agency.manager || {}).name || '')}"></div>
            <div class="form-row"><label>Телефон</label><input id="mgrPhone" value="${esc((s.agency.manager || {}).phone || '')}"></div>
            <div class="form-row"><label>E-mail</label><input id="mgrEmail" value="${esc((s.agency.manager || {}).email || '')}"></div>
          </div>
          <button class="btn" id="mgrSave">Сохранить подпись</button>
        </div>
      </div>
      <div>
        <div class="glass card mb">
          <div class="card-title">${ic(I.building)}Об агентстве<span class="sub">страницы «Привет» и «Почему мы» в подборках</span></div>
          <div class="form-row"><label>Кто мы (после «Меня зовут {менеджер},»)</label><textarea id="abIntro">${esc((s.agency.about || {}).intro || '')}</textarea></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="form-row"><label>Факты об агентстве (по строкам)</label><textarea id="abBullets" style="min-height:96px">${esc(((s.agency.about || {}).bullets || []).join('\n'))}</textarea></div>
            <div class="form-row"><label>«Почему мы» (по строкам)</label><textarea id="abWhy" style="min-height:96px">${esc(((s.agency.about || {}).whyUs || []).join('\n'))}</textarea></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="form-row"><label>Приписка про бесплатность</label><input id="abFree" value="${esc((s.agency.about || {}).freeNote || '')}"></div>
            <div class="form-row"><label>Офис (адрес)</label><input id="abOffice" value="${esc(((s.agency.about || {}).office || {}).address || '')}"></div>
          </div>
          <button class="btn" id="abSave">Сохранить</button>
        </div>
        <div class="glass card mb">
          <div class="card-title">${ic(I.shield)}Пароль входа</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="form-row"><label>Текущий</label><input id="pwCur" type="password"></div>
            <div class="form-row"><label>Новый (от 8 символов)</label><input id="pwNext" type="password"></div>
          </div>
          <button class="btn" id="pwSave">Сменить пароль</button>
        </div>
      </div>
    </div>`;
  $('#agLogoBtn').addEventListener('click', () => $('#agLogoFile').click());
  $('#agLogoFile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = await fetch('/api/agency/logo', { method: 'POST', headers: { 'Content-Type': f.type }, body: f });
    const j = await r.json();
    if (r.ok) { $('#agLogoPrev').innerHTML = `<img src="${j.logo}">`; toast('Логотип загружен', 'Уже на обложках подборок', true); loadState(); }
    else toast('Не загрузился', j.error);
  });
  $$('[data-edition]', root).forEach(ch => ch.addEventListener('click', async () => {
    await api.patch('/settings', { agency: { edition: ch.dataset.edition } });
    await loadState();
    toast(ch.dataset.edition === 'solo' ? 'Режим Solo включён' : 'Режим агентства включён', null, true);
    render();
  }));
  $('#agSave').addEventListener('click', async () => {
    await api.patch('/settings', { agency: { name: $('#agName').value.trim() || 'Агентство' } });
    toast('Сохранено', null, true);
    await loadState();
  });
  $('#abSave').addEventListener('click', async () => {
    await api.patch('/settings', { agency: { about: {
      intro: $('#abIntro').value,
      bullets: $('#abBullets').value.split('\n').map(x => x.trim()).filter(Boolean),
      whyUs: $('#abWhy').value.split('\n').map(x => x.trim()).filter(Boolean),
      freeNote: $('#abFree').value,
      office: Object.assign({}, (s.agency.about || {}).office, { address: $('#abOffice').value }),
    } } });
    toast('Об агентстве сохранено', 'Обновится во всех подборках', true);
    loadState();
  });
  $('#mgrSave').addEventListener('click', async () => {
    await api.patch('/settings', { agency: { manager: { name: $('#mgrName').value, phone: $('#mgrPhone').value, email: $('#mgrEmail').value } } });
    toast('Подпись сохранена', 'Появится на обложках подборок', true);
    loadState();
  });
  $('#pwSave').addEventListener('click', async () => {
    const r = await fetch('/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current: $('#pwCur').value, next: $('#pwNext').value }) });
    const j = await r.json();
    if (r.ok) { toast('Пароль изменён', 'Другие сессии разлогинены', true); $('#pwCur').value = $('#pwNext').value = ''; }
    else toast('Не получилось', j.error || 'ошибка');
  });
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
        <div class="form-row"><label>Внешняя ссылка (туннель) — для команды и вебхуков</label>
          <div style="display:flex;gap:8px;align-items:center">${s.tunnelUrl ? `<code class="pill" style="flex:1;overflow-x:auto;white-space:nowrap;padding:8px 10px">${esc(s.tunnelUrl)}</code><button class="btn btn-sm" id="tunCopy">${ic(I.copy)}</button>` : '<span class="badge warn">туннель не запущен</span>'}</div></div>
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
          <div class="card-title">${ic(I.mic || I.phone)}Голос брокера · ElevenLabs<span class="sub">голосовые касания настоящим голосом</span></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="form-row"><label>API key (xi-api-key)</label><input id="vKey" type="password" placeholder="${(s.voice || {}).keySet ? '•••••• сохранён' : 'sk_…'}"></div>
            <div class="form-row"><label>Voice ID (клонированный голос)</label><input id="vId" value="${esc((s.voice || {}).voiceId || '')}" placeholder="из My Voices"></div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn" id="vSave">Сохранить</button>
            <button class="btn btn-sm" id="vTest">${ic(I.play)}Тест голоса</button>
            <span id="vPlayer"></span>
          </div>
          ${coll('Как агентству настроить самостоятельно (5 минут)', `
            <ol style="font-size:12.3px;line-height:1.7;color:var(--ink-2);padding-left:18px;margin-top:8px">
              <li>Регистрация на <b>elevenlabs.io</b> (тариф Starter ~$5/мес достаточно для голосовых).</li>
              <li>Voices → <b>Add voice → Instant Voice Clone</b>: брокер записывает 1-2 минуты чистой речи на телефон и загружает.</li>
              <li>Скопировать <b>Voice ID</b> из карточки голоса (My Voices → ⋯ → Copy ID).</li>
              <li>Profile → <b>API Keys</b> → создать ключ, вставить оба значения сюда и нажать «Тест голоса».</li>
              <li>Готово: шаги цепочек с каналом «Голосовое» будут озвучиваться этим голосом и уходить клиенту как voice-сообщение.</li>
            </ol>
            <div class="muted" style="font-size:11.5px">Стоимость: ~$0.10-0.20 за минуту речи. Каждый брокер может иметь свой голос — при мультиброкерных голосовых добавим выбор голоса на брокера.</div>`,
            { open: false, icon: I.doc })}
        </div>
        <div class="glass card mb">
          <div class="card-title">${ic(I.phone)}Телефония<span class="sub">звонки → авто-транскрибация в карточку</span></div>
          <div class="set-row"><div class="sp"><div class="sl">Провайдер</div><div class="sd">Zadarma — дешевле всего для старта (номер ОАЭ + записи + API); Twilio/Telnyx — глобальные</div></div>
            <select id="telProv" style="width:150px">
              <option value="none" ${(s.telephony || {}).provider === 'none' ? 'selected' : ''}>Не подключена</option>
              <option value="zadarma" ${(s.telephony || {}).provider === 'zadarma' ? 'selected' : ''}>Zadarma</option>
              <option value="twilio" ${(s.telephony || {}).provider === 'twilio' ? 'selected' : ''}>Twilio</option>
              <option value="telnyx" ${(s.telephony || {}).provider === 'telnyx' ? 'selected' : ''}>Telnyx</option>
            </select></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="form-row"><label>API key</label><input id="telKey" type="password" placeholder="${(s.telephony || {}).keySet ? '•••••• сохранён' : 'ключ провайдера'}"></div>
            <div class="form-row"><label>API secret</label><input id="telSecret" type="password"></div>
          </div>
          <div class="form-row"><label>Вебхук записей звонков (вставить у провайдера)</label>
            <code class="pill" style="display:block;overflow-x:auto;white-space:nowrap;padding:8px 10px">${location.origin}/hooks/call?key=<секрет из «Рекламы»></code></div>
          <div class="muted" style="font-size:11.8px;line-height:1.55">Как работает: провайдер после звонка шлёт номер клиента и ссылку на запись → Lumen находит лида по номеру, скачивает запись, расшифровывает Whisper-ом и кладёт транскрипт в хронологию + ИИ-сводку. Ничего руками.</div>
          <button class="btn" id="telSave" style="margin-top:10px">Сохранить</button>
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
  const tc = $('#tunCopy');
  if (tc) tc.addEventListener('click', () => { navigator.clipboard.writeText(s.tunnelUrl); toast('Внешняя ссылка скопирована', null, true); });
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
  $('#vSave').addEventListener('click', async () => {
    const v = { voiceId: $('#vId').value.trim() };
    if ($('#vKey').value.trim()) v.key = $('#vKey').value.trim();
    await api.patch('/settings', { voice: v });
    toast('Голос сохранён', null, true);
    loadState();
  });
  $('#vTest').addEventListener('click', async () => {
    const b = $('#vTest');
    b.disabled = true; b.textContent = 'Генерирую…';
    const r = await fetch('/api/voice/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Добрый день! Это ' + (STATE.settings.agency.manager?.name || 'ваш эксперт') + ' из ' + STATE.settings.agency.name + '. Записал для вас короткое голосовое — тест из Lumen CRM.' }) });
    const j = await r.json();
    b.disabled = false; b.innerHTML = ic(I.play) + 'Тест голоса';
    if (r.ok) $('#vPlayer').innerHTML = `<audio controls autoplay src="${j.url}" style="height:32px;vertical-align:middle"></audio>`;
    else toast('Не сгенерировалось', j.error);
  });
  $('#telSave').addEventListener('click', async () => {
    const t = { provider: $('#telProv').value };
    if ($('#telKey').value.trim()) { t.key = $('#telKey').value.trim(); t.secret = $('#telSecret').value.trim(); }
    await api.patch('/settings', { telephony: t });
    toast('Телефония сохранена', t.provider === 'none' ? undefined : 'Вебхук записей активен', true);
    loadState();
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
function openNewLeadModal() {
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
}

/* ---------- контекстное главное действие раздела (кнопка в топбаре) ----------
   «Новый лид» уместен только там, где работают с лидами; на остальных
   разделах кнопка = главное действие раздела или прячется. */
const TOP_ACTIONS = {
  overview: { label: 'Новый лид', run: () => openNewLeadModal() },
  funnel: { label: 'Новый лид', run: () => openNewLeadModal() },
  inbox: { label: 'Новый лид', run: () => openNewLeadModal() },
  properties: { label: 'Объект', run: () => $('#prAdd')?.click() },
  wake: { label: 'Новая кампания', run: () => $('#newCmp')?.click() },
  templates: { label: 'Новый шаблон', run: () => $('#newTpl')?.click() },
  brokers: { label: 'Брокер', run: () => $('#brAdd')?.click() },
};
$('#newLeadBtn').addEventListener('click', () => { const a = TOP_ACTIONS[CUR]; if (a) a.run(); });
function syncTopAction() {
  const btn = $('#newLeadBtn');
  const a = TOP_ACTIONS[CUR];
  if (!a) { btn.style.display = 'none'; return; }
  btn.style.display = '';
  btn.innerHTML = ic(I.plus) + a.label;
}

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
    if (CUR_POP || document.querySelector('.hint-pop')) return; // открыт пикер/дропдаун/подсказка — DOM под ними не дёргаем
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return; // юзер печатает
    if (PAGES[CUR] && PAGES[CUR].refresh) await PAGES[CUR].refresh();
    else if (['overview', 'funnel'].includes(CUR) && Date.now() - (window._lastRenderAt || 0) > 5000) await render(); // не мигать поверх свежего рендера
  } catch (e) {
    if (e.message !== 'auth') setConn(false); // сервер лёг/рестартует — баннер, не молчание
  }
}, 7000);

/* ---------- старт ---------- */
document.querySelector('.side-foot .agency')?.addEventListener('click', () => go('agency'));

/* стартовый раздел — из hash (переживает F5); битый hash → обзор */
const startPage = () => (NAV[location.hash.slice(1)] ? location.hash.slice(1) : 'overview');
window.addEventListener('hashchange', () => {
  const p = location.hash.slice(1);
  if (NAV[p] && p !== CUR) go(p);
  else if (!NAV[p]) history.replaceState(null, '', '#' + CUR);
});

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
        try { await loadState(); clearInterval(retry); setConn(true); go(startPage()); } catch (_) {}
      }, 3000);
    }
    return;
  }
  go(startPage());
  /* прелоадеру — минимум 900мс жизни, чтобы вихрь успел «дохнуть» */
  setTimeout(hidePreloader, Math.max(0, 900 - (Date.now() - t0)));
})();
