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
};

const NAV = {
  overview:  { name: 'Обзор', icon: I.grid, sub: 'Живая картина отдела продаж' },
  funnel:    { name: 'Воронка', icon: I.funnel, sub: 'Канбан лидов по стадиям' },
  inbox:     { name: 'Диалоги', icon: I.chat, sub: 'WhatsApp-инбокс · ИИ-первая линия' },
  qualifier: { name: 'ИИ-квалификатор', icon: I.spark, sub: 'Критерии, регламент и автопилот первой линии' },
  sequences: { name: 'Цепочки касаний', icon: I.chain, sub: '7 касаний / 18 дней для молчунов' },
  wake:      { name: 'Реанимация базы', icon: I.wake, sub: 'Скоринг спящих и безопасные кампании' },
  meetings:  { name: 'Встречи', icon: I.cal, sub: 'Слоты с экспертами · WhatsApp-подтверждения' },
  numbers:   { name: 'Номера', icon: I.sim, sub: 'Пул WhatsApp-номеров: качество, лимиты, прогрев' },
  templates: { name: 'Шаблоны', icon: I.doc, sub: 'Utility и Marketing шаблоны Cloud API' },
  brokers:   { name: 'Брокеры', icon: I.users, sub: 'Команда экспертов и загрузка' },
  analytics: { name: 'Аналитика', icon: I.bars, sub: 'Человек против ИИ · регионы · канал' },
  settings:  { name: 'Подключения', icon: I.gear, sub: 'WhatsApp Cloud API · ИИ · демо-режим' },
};

const STAGES = [
  { id: 'new', name: 'Новые', color: 'var(--accent-2)' },
  { id: 'touch', name: 'Первое касание', color: 'var(--accent-2)' },
  { id: 'dialog', name: 'В диалоге с ИИ', color: 'var(--violet)' },
  { id: 'qualified', name: 'Квалифицирован', color: 'var(--ok)' },
  { id: 'handover', name: 'У брокера', color: 'var(--ok)' },
  { id: 'viewing', name: 'Показ', color: 'var(--warn)' },
  { id: 'deal', name: 'Сделка', color: 'var(--ok)' },
  { id: 'sleeping', name: 'Спящие', color: 'var(--ink-3)' },
  { id: 'lost', name: 'Закрыт', color: 'var(--ink-3)' },
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
  if ($('#loginScreen')) return;
  const s = el(`<div id="loginScreen" style="position:fixed;inset:0;z-index:300;display:grid;place-items:center;
      background:radial-gradient(900px 600px at 80% -10%,rgba(47,107,255,.25),transparent 60%),
                 radial-gradient(700px 500px at 10% 110%,rgba(16,43,92,.5),transparent 55%),
                 linear-gradient(160deg,#0A1833,#061126 70%)">
    <div style="width:360px;max-width:calc(100vw - 40px);padding:36px 32px;border-radius:20px;
        background:rgba(255,255,255,.06);border:1px solid rgba(134,175,255,.18);
        backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
        box-shadow:0 30px 80px -20px rgba(3,8,25,.8);text-align:center">
      <img src="logo.svg" style="width:44px;height:53px;margin:0 auto 14px;filter:drop-shadow(0 4px 14px rgba(78,130,255,.5))">
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
  const bd = el(`<div class="modal-bd"><div class="modal glass" ${wide ? 'style="width:640px"' : ''}>
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
  render();
}
async function render() {
  const fn = PAGES[CUR];
  if (fn) await fn($('#content'));
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
          ${events.map(e => `<div class="feed-item"><div class="feed-dot ${feedCls(e.type)}">${ic(feedIcon(e.type))}</div><div><div class="feed-text">${esc(e.text)}</div><div class="feed-time">${ago(e.at)}</div></div></div>`).join('') || '<div class="empty">Событий пока нет</div>'}
        </div>
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
          <div class="kb-head"><span class="nm">${s.name}</span><span class="ct">${items.length}</span></div>
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
        toast('Стадия обновлена', stageName(col.dataset.stage), true);
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
    toast('Дубли объединены', 'Переписка перенесена в основную карточку', true);
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
        ${Object.keys(byDay).length ? Object.entries(byDay).map(([day, items]) => `
          <div class="nav-label" style="padding-left:2px">${day}</div>
          ${items.map(mt => `<div class="glass" style="padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;gap:13px">
            <div style="font-size:15px;font-weight:700;color:var(--navy-900);min-width:48px">${tmm(mt.at)}</div>
            <div style="flex:1">
              <div style="font-size:13.5px;font-weight:650;color:var(--navy-900)">${esc(mt.leadName)} <span class="muted" style="font-weight:400">· ${kindRu[mt.kind] || mt.kind}</span></div>
              <div class="muted" style="font-size:11.5px;margin-top:2px">эксперт: ${esc(mt.brokerName)}${mt.note ? ' · ' + esc(mt.note) : ''}</div>
            </div>
            ${stBadge[mt.status] || ''}
            ${mt.status === 'scheduled' ? `<button class="btn btn-sm" data-mt="${mt.id}" data-st="done">Прошла</button>
            <button class="btn btn-sm btn-danger" data-mt="${mt.id}" data-st="no_show">Не пришёл</button>` : ''}
          </div>`).join('')}`).join('') : '<div class="glass card empty">Встреч пока нет — назначайте из карточки лида в «Диалогах»</div>'}
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
    toast('Статус встречи обновлён', null, true);
    PAGES.meetings(root);
  }));
};

function openMeetingModal(lead, after) {
  const brokers = STATE.brokers.filter(b => b.geo === lead.geo).concat(STATE.brokers.filter(b => b.geo !== lead.geo));
  const tomorrow = new Date(Date.now() + 24 * 3600e3);
  const defDate = tomorrow.toISOString().slice(0, 10);
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
  modal({
    title: l.name,
    sub: `${l.geoName} · ${esc(l.phone)} · источник: ${l.source} · создан ${ago(l.createdAt)}`,
    wide: true,
    body: `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        <span class="badge acc">${stageName(l.stage)}</span>
        ${l.ai.enabled ? '<span class="badge violet">ИИ ведёт диалог</span>' : '<span class="badge">ИИ выключен</span>'}
        ${l.brokerName ? `<span class="badge ok">брокер: ${esc(l.brokerName)}</span>` : ''}
        ${(l.tags || []).map(t => `<span class="badge">${esc(t)}</span>`).join('')}
      </div>
      ${axesHtml(l)}
      ${l.summary ? `<div class="lp-sec">Саммари для брокера</div><div class="summary-box">${esc(l.summary)}</div>` : ''}
      <div class="lp-sec">Сменить стадию</div>
      <select id="mStage" style="width:100%">${STAGES.map(s => `<option value="${s.id}" ${l.stage === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}</select>`,
    actions: [
      { label: 'Открыть диалог', cls: 'btn-accent', onClick: () => { PAGE_STATE.inboxLead = l.id; go('inbox'); } },
      { label: 'Сохранить стадию', onClick: async (bd) => { await api.patch('/leads/' + l.id, { stage: $('#mStage', bd).value }); toast('Стадия обновлена', null, true); render(); } },
      { label: 'Закрыть' },
    ],
  });
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
  const msgs = (l.messages || []).map(m => {
    const day = new Date(m.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    const sep = day !== lastDay ? `<div class="day-sep">${day}</div>` : '';
    lastDay = day;
    return sep + `<div class="bubble ${m.dir}">
      ${esc(m.text)}
      <div class="bmeta">${m.dir === 'out' && m.via ? `<span class="via-tag">${viaName[m.via] || m.via}</span>` : ''}<span>${tmm(m.at)}</span>${m.dir === 'out' ? `<span>${m.status === 'read' ? '✓✓' : m.status === 'delivered' ? '✓✓' : '✓'}</span>` : ''}</div>
    </div>`;
  }).join('');

  pane.innerHTML = `
    <div class="chat-head">
      <div class="ava">${esc(l.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase())}</div>
      <div><div class="nm">${esc(l.name)}</div><div class="ph">${esc(l.phone)} · ${l.geoName}</div></div>
      <div class="tb-spacer"></div>
      <span class="badge ${l.ai.enabled ? 'violet' : ''}">${l.ai.enabled ? 'ИИ ведёт' : 'ИИ выключен'}</span>
      <span class="badge acc">${stageName(l.stage)}</span>
    </div>
    <div class="chat-body" id="chatBody">${msgs || '<div class="chat-empty">Сообщений пока нет — цепочка сделает первое касание сама</div>'}</div>
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
  $('#composerText').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('#sendBtn').click(); });

  const panel = $('#leadPanel');
  panel.innerHTML = `
    <div class="lp-name">${esc(l.name)}</div>
    <div class="lp-sub">${l.geoName} · score ${l.score} · ${stageName(l.stage)}</div>
    <div class="set-row" style="padding:8px 0">
      <div class="sp"><div class="sl" style="font-size:12.5px">Автопилот ИИ</div><div class="sd">первая линия отвечает сама</div></div>
      <label class="switch"><input type="checkbox" id="aiToggle" ${l.ai.enabled ? 'checked' : ''}><span class="tr"></span><span class="th"></span></label>
    </div>
    <div class="lp-sec">Квалификация · ${l.axesFilled}/4</div>
    ${axesHtml(l)}
    ${l.summary ? `<div class="lp-sec">Саммари для брокера</div><div class="summary-box">${esc(l.summary)}</div>` : ''}
    <div class="lp-actions">
      ${!['handover', 'viewing', 'deal'].includes(l.stage) ? `<button class="btn btn-accent" id="handoverBtn">${ic(I.handover)}Передать брокеру</button>` : `<div class="badge ok" style="justify-content:center">${ic(I.check)}У брокера: ${esc(l.brokerName || '')}</div>`}
      <button class="btn" id="meetBtn">${ic(I.cal)}Назначить встречу</button>
      ${STATE.settings.demo.simulateReplies ? `<button class="btn" id="simBtn">${ic(I.chat)}Демо: ответ клиента</button>` : ''}
      <button class="btn btn-ghost" id="reScreenBtn">Перечитать переписку (скрининг)</button>
    </div>`;
  $('#aiToggle').addEventListener('change', async (e) => { await api.patch('/leads/' + id, { ai: { enabled: e.target.checked } }); toast(e.target.checked ? 'ИИ снова ведёт диалог' : 'ИИ на паузе — лид на менеджере', null, true); });
  const hb = $('#handoverBtn');
  if (hb) hb.addEventListener('click', async () => { await api.post(`/leads/${id}/handover`); toast('Лид передан брокеру', 'Саммари и слот отправлены', true); renderChat(id, true); });
  $('#meetBtn').addEventListener('click', () => openMeetingModal(l, () => renderChat(id, true)));
  const sb = $('#simBtn');
  if (sb) sb.addEventListener('click', async () => {
    const pool = ['Рассматриваю как инвестицию, под сдачу', 'Бюджет до 200 тысяч долларов', 'Смотрим виллу с 2 спальнями', 'Готов в течение пары месяцев', 'А что по ценам сейчас?'];
    await api.post(`/leads/${id}/inbound`, { text: pool[Math.floor(Math.random() * pool.length)] });
    renderChat(id, false);
  });
  $('#reScreenBtn').addEventListener('click', async () => { await api.post(`/leads/${id}/analyze`); toast('Скрининг перечитал переписку', null, true); renderChat(id, false); });
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
        ${Object.keys(s.criteria).map(g => {
          const c = s.criteria[g];
          return `<div style="margin-bottom:18px">
            <div style="display:flex;align-items:center;gap:9px;margin-bottom:8px"><b style="font-size:13.5px">${s.geoNames[g]}</b><span class="badge">${c.currency}</span></div>
            <div class="form-row"><label>Минимальный бюджет (${c.currency})</label><input data-crit="${g}" data-k="budgetMin" type="number" value="${c.budgetMin}"></div>
            <div class="form-row"><label>Down-sell при бюджете ниже порога</label><textarea data-crit="${g}" data-k="downsell">${esc(c.downsell)}</textarea></div>
            <div class="form-row"><label>Заметки регламента</label><input data-crit="${g}" data-k="notes" value="${esc(c.notes)}"></div>
          </div>`;
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
    toast('Цепочка обновлена', null, true);
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
        <table class="tbl"><thead><tr><th>Лид</th><th>Гео</th><th>Молчит</th><th>Score</th></tr></thead><tbody>
          ${preview.map(p => `<tr><td><b>${esc(p.name)}</b><div class="muted" style="font-size:11px">${esc(p.note || '')}</div></td><td>${STATE.settings.geoNames[p.geo] || p.geo}</td><td>${ago(p.lastMsgAt)}</td>
            <td><span class="wake-score"><span class="wake-bar"><i style="width:${p.wakeScore}%"></i></span>${p.wakeScore}</span></td></tr>`).join('') || '<tr><td colspan="4" class="empty">Спящих нет</td></tr>'}
        </tbody></table>
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
    ${c.log.length ? `<div class="cmp-log" style="margin-top:12px">${c.log.slice(0, 5).map(x => `${tmm(x.at)} — ${esc(x.text)}`).join('<br>')}</div>` : ''}
  </div>`;
}
function wireCampaigns(root) {
  $$('[data-cmp] [data-act]', root).forEach(b => b.addEventListener('click', async () => {
    const id = b.closest('[data-cmp]').dataset.cmp;
    await api.post(`/campaigns/${id}/${b.dataset.act}`);
    toast({ start: 'Кампания запущена', pause: 'Пауза', resume: 'Продолжаем', stop: 'Остановлена' }[b.dataset.act], null, true);
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
        toast('Кампания создана', 'Запустите её, когда будете готовы', true);
        PAGES.wake.refresh();
      } },
      { label: 'Отмена' },
    ],
  });
}

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
    toast('Статус номера обновлён', null, true);
    PAGES.numbers(root);
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
        toast('Шаблон отправлен на модерацию', null, true);
        PAGES.templates(root);
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
  $('#aiProv').addEventListener('change', async (e) => { await api.patch('/settings', { ai: { provider: e.target.value } }); toast('Режим ИИ обновлён', null, true); loadState(); });
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
        toast('Лид создан', 'Первое касание уйдёт автоматически', true);
        render();
      } },
      { label: 'Отмена' },
    ],
  });
});

/* ---------- цикл обновления ---------- */
setInterval(async () => {
  try {
    await loadState();
    if (DRAG.active) return; // не перерисовываем канбан посреди перетаскивания
    if (PAGES[CUR] && PAGES[CUR].refresh) await PAGES[CUR].refresh();
    else if (['overview', 'funnel'].includes(CUR) && !$('.modal-bd')) await render();
  } catch (e) { /* сервер перезапускается — тихо ждём */ }
}, 7000);

/* ---------- старт ---------- */
(async () => {
  initNav();
  await loadState();
  go('overview');
})();
