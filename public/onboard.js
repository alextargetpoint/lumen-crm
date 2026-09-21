/* ============================================================
   Lumen · Онбординг-церемония (first-run setup wizard)
   Самодостаточный модуль. Пишет конфиг через /api/settings,
   ветвится agency ⇄ solo, даёт выбор стиля с живыми превью,
   ведёт к боевым визардам (WhatsApp, брокеры, база, цепочки).
   Триггеры: авто на первом запуске (из app.js), window.Onboard.open(),
   hash #setup, кнопка [data-onboard].
   ============================================================ */
(function () {
  'use strict';

  // ---------- утилиты ----------
  const B = () => (window.LUMEN || {});
  async function api(method, path, body) {
    const r = await fetch('/api' + path, {
      method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error(path + ' ' + r.status);
    const t = await r.text(); try { return JSON.parse(t); } catch (e) { return t; }
  }
  const el = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstElementChild; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- чистые SVG-иконки (премиум, консистентно, вместо эмодзи) ----------
  const _svg = (p, sw) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.7) + '" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  const IC = {
    building: _svg('<path d="M3 21h18"/><path d="M6 21V5a1 1 0 011-1h6a1 1 0 011 1v16"/><path d="M14 21V10h4a1 1 0 011 1v10"/><path d="M9 8h2M9 12h2M9 16h2"/>'),
    user: _svg('<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5a7.5 7.5 0 0115 0"/>'),
    palette: _svg('<path d="M12 3a9 9 0 000 18c1.4 0 2-1 2-2 0-.6-.3-1-.3-1.6 0-.7.6-1.4 1.4-1.4H17a4 4 0 004-4c0-4.4-4-9-9-9z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="10.5" r="1"/>'),
    chat: _svg('<path d="M21 11.5a7.5 7.5 0 01-10.9 6.7L4 20l1.8-5.1A7.5 7.5 0 1121 11.5z"/>'),
    bolt: _svg('<path d="M13 2L5 13h5l-1 9 8-11h-5l1-9z"/>'),
    spark: _svg('<path d="M12 3l1.7 5.1a2 2 0 001.2 1.2L20 11l-5.1 1.7a2 2 0 00-1.2 1.2L12 19l-1.7-5.1a2 2 0 00-1.2-1.2L4 11l5.1-1.7a2 2 0 001.2-1.2z"/>'),
    check: _svg('<path d="M20 6L9 17l-5-5"/>', 2.4),
    x: _svg('<path d="M18 6L6 18M6 6l12 12"/>', 2),
    globe: _svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/>'),
    users: _svg('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0111 0"/><path d="M16 5.2a3.2 3.2 0 010 5.6M20.5 20a5.5 5.5 0 00-4-5.3"/>'),
    grid: _svg('<rect x="3.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.4"/>'),
    shield: _svg('<path d="M12 3l7 3v5c0 4.4-3 8.2-7 10-4-1.8-7-5.6-7-10V6l7-3z"/><path d="M9.2 12l2 2 3.6-3.8"/>'),
    star: _svg('<path d="M12 3l1.9 5.7L20 9l-4.6 3.5L17 19l-5-3.4L7 19l1.6-6.5L4 9l6.1-.3z"/>'),
    phone: _svg('<path d="M6 3h3l1.6 5-2 1.2a11 11 0 005.2 5.2l1.2-2 5 1.6v3a2 2 0 01-2.2 2A16 16 0 014 5.2 2 2 0 016 3z"/>'),
    layers: _svg('<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5M3 16l9 5 9-5"/>'),
    chart: _svg('<path d="M4 20V4M4 20h16"/><path d="M8 16l3-4 3 2 4-6"/>'),
    list: _svg('<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>', 2),
    heart: _svg('<path d="M12 20s-7-4.5-9.5-9C1 8 2.5 4.5 6 4.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.5 0 5 3.5 3.5 6.5C19 15.5 12 20 12 20z"/>'),
    cap: _svg('<path d="M12 4L2 9l10 5 10-5-10-5z"/><path d="M6 11v4.5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5V11"/><path d="M22 9v5"/>'),
    doc: _svg('<path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>'),
    wallet: _svg('<path d="M3 7a2 2 0 012-2h12a2 2 0 012 2v1H5a2 2 0 00-2 2z"/><path d="M3 9h16a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><circle cx="16.5" cy="14" r="1.3"/>'),
    bell: _svg('<path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/>'),
    book: _svg('<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 19a2 2 0 012-2h13"/>'),
    eye: _svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'),
    cal: _svg('<rect x="3.5" y="4.5" width="17" height="16" rx="2"/><path d="M3.5 9h17M8 3v3M16 3v3"/>'),
    clock: _svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
    trash: _svg('<path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13"/><path d="M10 11v6M14 11v6"/>', 1.7),
    lock: _svg('<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 018 0v3.5"/>'),
    upload: _svg('<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 15v3a2 2 0 002 2h10a2 2 0 002-2v-3"/>'),
    gear: _svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2.4M12 19.1v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"/>', 1.7),
    sliders: _svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>', 1.8),
    info: _svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/>', 1.8),
    home: _svg('<path d="M4 11l8-6 8 6"/><path d="M6 10v9h12v-9"/>', 1.8),
    wa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 00-8.6 15l-1 3.7 3.8-1A10 10 0 1012 2zm0 2a8 8 0 11-4.2 14.8l-.3-.2-2.2.6.6-2.2-.2-.3A8 8 0 0112 4zm4.6 10.1c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.5 6.5 0 01-3.2-2.8c-.1-.2 0-.4.1-.5l.4-.5c.1-.1.1-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.7.7-.9 1.7-.6 2.7.5 1.7 1.7 3.2 3.4 4.2 1.6.9 2.9 1 3.8.8.7-.2 1.4-.8 1.6-1.4.1-.4.1-.7 0-.8z"/></svg>',
  };

  // ---------- данные ----------
  const THEMES = [
    { key: 'atelier', name: 'Ателье',         desc: 'Тихая роскошь — крем + serif, тёмные акценты. Стиль по умолчанию.', vid: 'skyline-mono', sw: ['#1A1815', '#F3F1EC', '#141311'] },
    { key: 'light',   name: 'Кобальт',        desc: 'Фирменный синий, мягкие тени — базовый вид Lumen.', vid: 'skyline-cobalt',   sw: ['#2563EB', '#F4F7FB', '#111827'] },
    { key: 'emerald', name: 'Lumen Glass',    desc: 'Атмосферное стекло, premium-OS, глубина.',          vid: 'skyline-glass',    sw: ['#397BFF', '#EEF5FF', '#0A1833'] },
    { key: 'dark',    name: 'Ночь',           desc: 'Тёмный кобальт — для работы вечером и премиум-подачи.', vid: 'skyline-night', sw: ['#5B84FF', '#0A1833', '#EAF0FF'] },
    { key: 'warm',    name: 'Lumen Burgundy', desc: 'Бордо-бренд, тёплый люкс, светлый workspace.',      vid: 'skyline-burgundy', sw: ['#861C3C', '#F8FAFD', '#2A0E17'] },
    { key: 'mono',    name: 'Моно',           desc: 'Чёрно-белый минимализм, максимум контента.',        vid: 'skyline-mono',     sw: ['#171717', '#F6F6F6', '#171717'] },
    { key: 'frame',   name: 'Контур',         desc: 'Чёткие рамки без теней — строгий редакторский вид.', vid: '',                sw: ['#111827', '#FFFFFF', '#2563EB'] },
  ];
  const GEOS = [
    { k: 'dubai', l: 'Дубай', r: 'Ближний Восток' }, { k: 'abudhabi', l: 'Абу-Даби', r: 'Ближний Восток' },
    { k: 'bali', l: 'Бали', r: 'Азия' }, { k: 'phuket', l: 'Пхукет', r: 'Азия' }, { k: 'thailand', l: 'Таиланд', r: 'Азия' },
    { k: 'spain', l: 'Испания', r: 'Европа и соседние рынки' }, { k: 'cyprus', l: 'Кипр', r: 'Европа и соседние рынки' },
    { k: 'turkey', l: 'Турция', r: 'Европа и соседние рынки' }, { k: 'georgia', l: 'Грузия', r: 'Европа и соседние рынки' },
    { k: 'montenegro', l: 'Черногория', r: 'Европа и соседние рынки' }, { k: 'greece', l: 'Греция', r: 'Европа и соседние рынки' },
    { k: 'other', l: 'Другое направление', r: 'Европа и соседние рынки' },
  ];
  const GEO_REGIONS = ['Ближний Восток', 'Азия', 'Европа и соседние рынки'];
  const TONE_CLIENT = 'Здравствуйте! Ищу квартиру в Дубае, пока присматриваюсь.';
  const TONES = [
    { k: 'warm',    name: 'Тёплый и заботливый', sub: 'Внимательно, дружелюбно, без давления', ic: 'heart', ex: 'Здравствуйте! Помогу разобраться и подобрать подходящие варианты. Вы рассматриваете квартиру для себя или для инвестиций? 🙌', tone: 'тёплая, заботливая, человечная — как хороший личный менеджер; без давления' },
    { k: 'expert',  name: 'Экспертный и уверенный', sub: 'По существу, с аргументами и уточняющими вопросами', ic: 'cap', ex: 'Здравствуйте! По Дубаю сейчас сильны районы с рассрочкой 0% до ключей и ростом ~18% за год. Чтобы подобрать 3 точных варианта — какой бюджет и цель: доход или для себя?', tone: 'экспертная, уверенная, по делу; оперирует цифрами и фактами рынка' },
    { k: 'concise', name: 'Короткий и деловой', sub: 'Кратко, чётко, с фокусом на следующем шаге', ic: 'doc', ex: 'Здравствуйте! Уточните бюджет и цель покупки — пришлю 3 подходящих варианта в течение часа.', tone: 'короткая, деловая, без воды; быстрые чёткие сообщения' },
  ];
  // иллюстрации к шагам-фичам
  const SHOT = (n) => '/assets/site/cap-' + n + '.png?v=atl';   /* ?v — кэш-бас после пересъёмки в теме Ателье */
  /* правая колонка: 3D-стеклянный герой (маска убирает фон PNG) + опц. инфо-карточка (как в референсах S4/S5/S8) */
  const heroSide = (h) => `<div class="ob-heroside">
    <div class="ob-hero2"><img src="/onb/heroes/${h.img}.png?v=1" alt="" draggable="false"></div>
    ${h.caption ? `<div class="ob-hcaption"><div class="ob-hcaption-b">${h.caption.big}</div>${h.caption.small ? `<div class="ob-hcaption-s">${h.caption.small}</div>` : ''}</div>` : ''}
    ${h.card ? `<div class="ob-hcard">
      ${h.card.title ? `<div class="ob-hcard-t">${h.card.title}</div>` : ''}
      ${(h.card.rows || []).map(r => `<div class="ob-hrow"><span class="ob-hrow-ic">${r[0]}</span><div class="ob-hrow-tx"><b>${r[1]}</b>${r[2] ? `<span>${r[2]}</span>` : ''}</div></div>`).join('')}
      ${h.card.note ? `<div class="ob-hcard-note">${h.card.note}</div>` : ''}
    </div>` : ''}
  </div>`;
  // золотой эмблем-мотив на шапке каждого шага (в связке с обложками писем)
  const EMBLEM = { edition: 'building', style: 'palette', brand: 'spark', geos: 'globe', team: 'users', tone: 'chat', whatsapp: 'chat', chains: 'bolt', listings: 'grid', control: 'shield', more: 'star', pricing: 'star', finish: 'check' };

  // ---------- состояние ----------
  let S = null;         // накопленный конфиг онбординга
  let STEPS = [];       // активные шаги (после ветвления)
  let idx = 0;
  let root = null, auto = false;
  let _billing = null;

  function freshState(st) {
    const a = (st && st.settings && st.settings.agency) || {};
    return {
      edition: a.edition || '',                 // '' пока не выбрано
      theme: (localStorage.getItem('lumen_theme') || 'atelier'),   /* дефолт приложения = Atelier (тихая роскошь) — первый экран нового агентства ему соответствует */
      name: a.name && a.name !== 'One Agency' ? a.name : '',
      logo: a.logo || '',
      geos: Array.isArray(a.geos) ? a.geos.slice() : [],
      manager: Object.assign({ name: '', phone: '', email: '' }, a.manager || {}),
      tone: 'warm',
      autopilot: !!(st && st.settings && st.settings.ai && st.settings.ai.autopilot),
    };
  }

  // ---------- определение шагов (data-driven + branch) ----------
  function buildSteps() {
    const solo = S.edition === 'solo';
    /* методология: сначала кто-вы → облик → бренд → рынки; затем (для агентства) команда;
       далее ИИ-первая-линия → каналы → база; для агентства ещё контроль; и запуск.
       solo — лаконичный путь без команды/цепочек/контроля. */
    /* ТОЛЬКО шаги, где можно реально что-то сделать/выбрать (правки юзера по видео):
       welcome → кто-вы → облик → бренд → рынки → тон → инфо о разделах → подписка(рабочая) → финиш.
       Экраны-гиды с мёртвыми кнопками (WhatsApp/цепочки/база/контроль/команда) убраны — знакомство с разделами
       делаем интерактивным туром уже ВНУТРИ CRM, а не пустыми шагами. */
    const all = [
      { id: 'welcome' },
      { id: 'edition' },
      { id: 'style' },
      { id: 'brand' },
      { id: 'geos' },
      !solo && { id: 'team' },
      { id: 'tone' },
      { id: 'more' },
      { id: 'pricing' },
      { id: 'finish' },
    ].filter(Boolean);
    return all;
  }

  // ============================================================
  //  РЕНДЕР ШАГОВ
  // ============================================================
  function stepWelcome() {
    const feat = (ic, t) => `<div class="ow-feat"><span class="ow-feat-ic">${ic}</span><span>${t}</span></div>`;
    const IG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none"/></svg>';
    const TG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.5 4.3 2.9 11.4c-1 .4-1 1.8.1 2.1l4.6 1.4 1.8 5.5c.3.8 1.3 1 1.9.4l2.6-2.5 4.6 3.4c.7.5 1.7.1 1.9-.7l3-14c.2-1-.8-1.9-1.9-1.2z"/></svg>';
    const WA = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2zm5.3 13.8c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.2-.7-2.7-1.1-4.4-3.9-4.6-4.1-.1-.2-1-1.4-1-2.6 0-1.2.6-1.8.9-2 .2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.3 0 .5l-.4.5c-.2.2-.3.4-.1.7.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.2.1.4.1.6-.1l.8-1c.2-.2.3-.2.6-.1l1.9.9c.3.1.5.2.5.4.1.2.1.9-.1 1.5z"/></svg>';
    return {
      bg: 'welcome', pad: true, hideBack: true, inlineCta: true,
      html: `
        <div class="ow">
          <div class="ow-l">
            <div class="ob-eyebrow">Ваше пространство · 5 минут</div>
            <h1 class="ob-h1">Добро пожаловать<br>в&nbsp;<span class="ob-grad">Lumen</span></h1>
            <p class="ow-sub">Настроим CRM под ваш бренд, команду и стиль работы. Подключим каналы — и начнём принимать заявки.</p>
            <div class="ow-feats">
              ${feat(IC.palette, 'Ваш бренд и стиль')}
              ${feat(IC.users, 'Команда и направления')}
              ${feat(IC.chat, 'Каналы и первая линия')}
            </div>
            <button class="ob-btn ob-primary ow-cta" data-act="next">Начать настройку →</button>
            <div class="ow-note">Всё можно изменить позже</div>
          </div>
          <div class="ow-r">
            <div class="ow-hero"><img src="/onb/heroes/star.png?v=1" alt="" draggable="false"></div>
            <div class="ow-gcard ow-gcard-1">
              <div class="ow-gc-h">Ваше рабочее пространство</div>
              <div class="ow-gc-sw"><i style="background:#3a352e"></i><i style="background:#c9a25a"></i><i style="background:#ead9b0"></i></div>
              <div class="ow-gc-rows">
                <div class="ow-gc-nav"><i class="ow-gc-ic">${IC.home}</i><span></span></div>
                <div class="ow-gc-nav"><i class="ow-gc-ic">${IC.list}</i><span></span></div>
                <div class="ow-gc-nav"><i class="ow-gc-ic">${IC.user}</i><span></span></div>
              </div>
            </div>
            <div class="ow-gcard ow-gcard-2">
              <div class="ow-gc-chk">${IC.check}</div>
              <div class="ow-gc-h2">Каналы подключены</div>
              <div class="ow-gc-chans"><i>${TG}</i><i>${WA}</i><i>${IG}</i></div>
            </div>
          </div>
        </div>`,
    };
  }

  function stepEdition() {
    const pick = (e) => `
      <button class="ob-choice ${S.edition === e ? 'on' : ''}" data-edition="${e}">
        <div class="ob-choice-hero"><img src="/onb/heroes/${e === 'agency' ? 'buildings.png?v=1' : 'person.png?v=2'}" alt="" draggable="false"></div>
        <div class="ob-choice-t">${e === 'agency' ? 'Агентство недвижимости' : 'Соло-брокер'}</div>
        <div class="ob-choice-d">${e === 'agency'
          ? 'Для команды брокеров и руководителя.'
          : 'Для самостоятельной работы с клиентами.'}</div>
        <div class="ob-choice-div"></div>
        <ul class="ob-choice-l">${(e === 'agency'
          ? ['Брокеры, роли и доступы', 'Распределение лидов и SLA', 'Контроль работы команды', 'Общая база и лента']
          : ['Только ваши лиды', 'Без настройки команды', 'Быстрый запуск', 'Весь ИИ-функционал']).map(x => `<li><i class="ob-li-ck">${IC.check}</i>${x}</li>`).join('')}</ul>
        <div class="ob-choice-badge"><span class="ob-choice-ring"></span><span class="ob-choice-check">${IC.check}</span><em>Выбрано</em></div>
      </button>`;
    return {
      title: 'Как вы работаете?',
      sub: 'Подстроим рабочее пространство под вас. Выбор можно изменить позже.',
      center: true,
      html: `<div class="ob-choices">${pick('agency')}${pick('solo')}</div>
        <div class="ob-choice-foot">${IC.gear}Настройки можно изменить в профиле</div>`,
      primaryDisabled: !S.edition,
    };
  }

  function stepStyle() {
    const GRID = THEMES.filter(t => t.key !== 'frame');   /* 6 тем 3×2, как на референсе (Контур доступен в профиле) */
    const sel = GRID.find(t => t.key === S.theme) || GRID[0];
    const card = (t) => `
      <button class="ob-theme2 ${S.theme === t.key ? 'on' : ''}" data-theme="${t.key}">
        <div class="ob-theme2-prev"><img src="/assets/theme-${t.key}.png?v=live" alt="" loading="lazy" onerror="this.closest('.ob-theme2-prev').style.background='linear-gradient(135deg,'+'${t.sw[1]},${t.sw[0]}'+')'"></div>
        <div class="ob-theme2-meta"><b>${t.name}</b><span class="ob-theme2-sw">${t.sw.map(c => `<i style="background:${c}"></i>`).join('')}</span></div>
        <div class="ob-choice-check">${IC.check}</div>
      </button>`;
    return {
      title: 'Выберите стиль пространства',
      sub: 'Ваш CRM — в вашем стиле. Оформление можно изменить в любой момент.',
      splitTop: true,
      rightHtml: `<div class="ob-tprev-wrap">
        <div class="ob-tprev-head"><span>Предпросмотр</span><span class="ob-tprev-pill" id="tprevName">${sel.name}</span></div>
        <div class="ob-tprev">
          <div class="ob-tprev-bar"><i></i><i></i><i></i></div>
          <div class="ob-tprev-img"><img id="tprevImg" src="/assets/theme-${sel.key}.png?v=live" alt=""></div>
          <div class="ob-tprev-cap" id="tprevDesc">${sel.desc}</div>
        </div>
      </div>`,
      html: `<div class="ob-themes2">${GRID.map(card).join('')}</div>`,
    };
  }

  function stepBrand() {
    const nm = S.name || (S.edition === 'solo' ? 'Ваш бренд' : 'One Agency');
    const ini = esc(String(nm).trim().charAt(0).toUpperCase() || 'A');
    const mg = S.manager || {};
    const cprev = `
      <div class="ob-cprev-lbl2"><span>Так увидит ваш клиент</span><span class="ob-cprev-eye">${IC.eye}Предпросмотр</span></div>
      <div class="ob-cprev2">
        <div class="ob-cprev2-top">
          <span class="ob-cprev2-brand"><span class="ob-cprev2-logo" id="cpLogo">${S.logo ? `<img src="${esc(S.logo)}">` : ini}</span><span class="ob-cprev2-nm"><b id="cpName">${esc(nm)}</b><i>Бутик недвижимости</i></span></span>
          <span class="ob-cprev2-tag">Подборка недвижимости</span>
        </div>
        <div class="ob-cprev2-hero">
          <div><div class="ob-cprev2-h">Ваш новый адрес</div><div class="ob-cprev2-sub">Больше, чем недвижимость</div></div>
          <span class="ob-cprev2-side">Люди<br>Места<br>Возможности</span>
        </div>
        <div class="ob-cprev2-photo ob-cprev2-photo1"><span class="ob-cprev2-cap"><b>Апартаменты у воды</b><i>Дубай, UAE</i></span><span class="ob-cprev2-arr">→</span></div>
        <div class="ob-cprev2-row">
          <div class="ob-cprev2-photo ob-cprev2-photo2"></div>
          <div class="ob-cprev2-mini"><b>Резиденция в центре</b><i>Дубай, UAE</i><span class="ob-cprev2-arr">→</span></div>
        </div>
        <div class="ob-cprev2-foot">
          <span class="ob-cprev2-mgr"><span class="ob-cprev2-ava">${ini}</span><span class="ob-cprev2-mgtx"><b id="cpMgr">${esc(mg.name || 'Имя менеджера')}</b><i>Ваш персональный консультант</i></span></span>
          <span class="ob-cprev2-cts"><span>${IC.phone}<b id="cpPhone">${esc(mg.phone || '+7 900 123-45-67')}</b></span><span>${IC.chat}<b id="cpEmail">${esc(mg.email || 'name@agency.com')}</b></span></span>
        </div>
      </div>
      <div class="ob-cprev2-note">Логотип, название и контакты обновляются в превью</div>`;
    return {
      title: 'Ваш бренд',
      sub: 'Добавьте название и логотип — они появятся в CRM, подборках объектов и документах для клиентов.',
      splitTop: true,
      rightHtml: cprev,
      html: `
        <div class="ob-form">
          <label class="ob-field"><span>Название ${S.edition === 'solo' ? '(ваше имя / бренд)' : 'агентства'}</span>
            <input id="obName" type="text" placeholder="${S.edition === 'solo' ? 'Напр. Артур · недвижимость Дубая' : 'Напр. One Agency'}" value="${esc(S.name)}"></label>
          <div class="ob-field"><span>Логотип</span>
            <div class="ob-logo2">
              <div class="ob-logo2-prev" id="obLogoPrev">${S.logo ? `<img src="${esc(S.logo)}">` : `<span>${ini}</span>`}</div>
              <div class="ob-logo2-div"></div>
              <label class="ob-logo2-drop">
                <span class="ob-logo2-ic">${IC.upload}</span>
                <span class="ob-logo2-tx"><b>Загрузить логотип</b><i>Перетащите файл или выберите на устройстве · PNG или SVG</i></span>
                <input id="obLogo" type="file" accept="image/*" hidden>
              </label>
              ${S.logo ? `<button class="ob-logo2-clear" id="obLogoClear" title="Убрать">${IC.x}</button>` : ''}
            </div>
          </div>
          <div class="ob-formdiv"></div>
          <div class="ob-field ob-manager"><span>Подпись менеджера</span>
            <p class="ob-field-sub">В подборках и документах для клиентов.</p>
            <label class="ob-subfield"><span>Имя</span><input id="obMgrName" type="text" placeholder="Имя менеджера" value="${esc(S.manager.name)}"></label>
            <div class="ob-row2">
              <label class="ob-subfield"><span>Телефон / WhatsApp</span><input id="obMgrPhone" type="text" placeholder="+7 900 123-45-67" value="${esc(S.manager.phone)}"></label>
              <label class="ob-subfield"><span>E-mail</span><input id="obMgrEmail" type="text" placeholder="name@agency.com" value="${esc(S.manager.email)}"></label>
            </div>
          </div>
        </div>`,
    };
  }

  function geoWord(n) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'направление';
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'направления';
    return 'направлений';
  }
  function stepGeos() {
    const chip = (g) => `<button class="ob-chip ${S.geos.includes(g.k) ? 'on' : ''}" data-geo="${g.k}" data-l="${esc(g.l)}"><span class="ob-chip-ic"><i class="ob-chip-plus">+</i><i class="ob-chip-check">${IC.check}</i></span>${g.l}</button>`;
    const groups = GEO_REGIONS.map(r => `<div class="ob-geo-group"><div class="ob-geo-h">${r}</div><div class="ob-chips">${GEOS.filter(g => g.r === r).map(chip).join('')}</div></div>`).join('');
    const tags = `<div class="ob-geo-tags" id="obGeoTags">${S.geos.map(k => { const g = GEOS.find(x => x.k === k); return `<span class="ob-geo-tag" data-geotag="${k}">${g ? g.l : k}<i>×</i></span>`; }).join('')}</div>`;
    return {
      title: 'Где вы работаете?',
      sub: 'Выберите рынки — Lumen адаптирует квалификацию лидов и подборки под ваши направления.',
      microsub: 'Можно выбрать несколько.',
      splitTop: true,
      hero: { img: 'globe', card: { title: 'Что настроит Lumen', rows: [
        [IC.sliders, 'Критерии квалификации', 'С учётом специфики выбранных рынков'],
        [IC.chat, 'Тон общения', 'Адаптированный под деловую культуру региона'],
        [IC.building, 'Подборки объектов', 'Релевантные предложения и подборки'],
      ], note: IC.info + ' Бюджеты и правила для каждого рынка можно задать позже в ИИ-квалификаторе.' } },
      html: `<div class="ob-geo-groups">${groups}</div>
        <div class="ob-geo-sum">Выбрано: <b id="obGeoCount">${S.geos.length}</b>&nbsp;<span id="obGeoWord">${geoWord(S.geos.length)}</span> ${tags}</div>`,
      primaryDisabled: S.geos.length === 0,
    };
  }

  function stepTone() {
    const sel = TONES.find(t => t.k === S.tone) || TONES[0];
    const row = (t) => `
      <button class="ob-tonerow ${S.tone === t.k ? 'on' : ''}" data-tone="${t.k}">
        <span class="ob-tonerow-ic">${IC[t.ic] || IC.chat}</span>
        <span class="ob-tonerow-tx"><b>${t.name}</b><i>${t.sub}</i></span>
        <span class="ob-tonerow-radio">${IC.check}</span>
      </button>`;
    const chat = `<div class="ob-chatprev">
        <div class="ob-chatprev-head">
          <div class="ob-chatprev-ht"><b>Пример диалога</b><i id="obTonePrevName">${sel.name}</i></div>
          <span class="ob-wa-pill">${IC.wa}WhatsApp</span>
        </div>
        <div class="ob-chat">
          <div class="ob-cb-in">
            <span class="ob-cb-who">Клиент</span>
            <div class="ob-cb ob-cb-dark"><p>${esc(TONE_CLIENT)}</p><span class="ob-cb-t">11:24</span></div>
          </div>
          <div class="ob-cb-out">
            <span class="ob-cb-who ob-cb-ai">Lumen · ИИ-ассистент</span>
            <div class="ob-cb-out-row">
              <span class="ob-cb-ava">${IC.spark}</span>
              <div class="ob-cb ob-cb-cream"><p id="obToneReply">${esc(sel.ex)}</p><span class="ob-cb-t">11:24</span></div>
            </div>
          </div>
        </div>
        <div class="ob-chat-foot">Пример ответа в выбранном тоне.</div>
      </div>`;
    return {
      title: 'Как Lumen общается с клиентами',
      sub: 'Выберите тон общения и посмотрите пример ответа в WhatsApp.',
      splitTop: true,
      ambient: 'bubbles',
      rightHtml: chat,
      html: `<div class="ob-tonerows">${TONES.map(row).join('')}</div>
        <div class="ob-autopanel">
          <div class="ob-autopanel-t">Автопилот первой линии</div>
          <label class="ob-toggle ob-toggle-bare"><input type="checkbox" id="obAutopilot" ${S.autopilot ? 'checked' : ''}><span class="ob-tg"></span><b id="obAutoLbl">${S.autopilot ? 'Включён' : 'Выключен'}</b></label>
          <p class="ob-autopanel-d">При включении Lumen сам отвечает и квалифицирует новые заявки. Можно включить позже.</p>
        </div>
        <div class="ob-note ob-note-flat">${IC.spark} Скрипты и знания агентства можно добавить позже.</div>`,
    };
  }

  function stepGuide(o) {
    // шаги-передачи в боевые визарды
    return {
      title: o.title, sub: o.sub, shot: o.shot,
      html: `
        <div class="ob-guide">
          <ul class="ob-guide-l">${o.points.map(p => `<li><i>${IC.check}</i>${p}</li>`).join('')}</ul>
          <div class="ob-guide-cta">
            <button class="ob-do" data-do="${o.action}">${o.cta}</button>
            <span class="ob-later">или настройте позже — этот шаг не блокирует запуск</span>
          </div>
        </div>`,
    };
  }

  function stepPricing() {
    const solo = S.edition === 'solo';
    const base = solo ? 80 : 200;                 // включено: solo 1 место / агентство 6 мест
    const seatsIncl = solo ? 1 : 6, seatPrice = 25;
    const seats = Math.max(seatsIncl, +S._seats || seatsIncl);
    const extra = Math.max(0, seats - seatsIncl);
    const total = base + extra * seatPrice;
    return {
      title: 'Подписка и активация',
      sub: 'Выберите количество мест и проверьте стоимость перед оплатой.',
      eyebrowSuffix: ' · Финальный шаг',
      splitTop: true,
      hero: { img: 'ring', caption: { big: 'Всё готово к следующему этапу', small: 'Остался последний шаг' }, card: { title: 'Что дальше?', rows: [
        ['1', 'Перейдите в раздел оплаты', ''],
        ['2', 'Выберите карту или криптовалюту', ''],
        ['3', 'Завершите оплату для активации', ''],
      ], note: 'Калькулятор, тарифы и баланс — в разделе «Подписка и оплата».' } },
      html: `
        <div class="ob-price ob-price-solo">
          <div class="ob-price-card">
            <div class="ob-price-beta">Бета · настройка под ключ</div>
            <div class="ob-price-name">${solo ? 'Соло-брокер' : 'Агентство'}</div>
            <div class="ob-price-val"><b id="obTotal">$${total}</b><span>/мес</span></div>
            ${solo ? `<div class="ob-price-seats">1 рабочее место</div>` : `
            <div class="ob-seats-row">
              <span>Мест для брокеров</span>
              <div class="ob-stepper"><button type="button" class="ob-sminus" data-seat="-1">−</button><b id="obSeats">${seats}</b><button type="button" class="ob-splus" data-seat="1">+</button></div>
            </div>
            <div class="ob-price-seats">${seatsIncl} мест включено · далее $${seatPrice}/место</div>`}
            <div class="ob-price-break">
              <div class="ob-pbr"><span>Базовая подписка</span><b>$${base}</b></div>
              ${solo ? '' : `<div class="ob-pbr"><span>Доп. места · <i id="obExtraN">${extra}</i></span><b id="obExtraSum">$${extra * seatPrice}</b></div>`}
              <div class="ob-pbr ob-pbr-tot"><span>Итого в месяц</span><b id="obTotal2">$${total}</b></div>
            </div>
            <ul class="ob-price-list">
              <li>${IC.check}Настройку и подключение каналов делаем за вас</li>
              <li>${IC.check}ИИ отвечает лидам за 60 секунд, квалифицирует, собирает подборки</li>
              <li>${IC.check}Обновления, интеграции и поддержка — на нас</li>
            </ul>
            <div class="ob-price-rr">${IC.check}Оплата картой или криптовалютой</div>
          </div>
        </div>`,
      primary: `Перейти к оплате →`,
      primaryDo: 'pay',
      hideSkip: true,
    };
  }

  function stepTeam() {
    S.brokers = (S.brokers && S.brokers.length) ? S.brokers : [{}];
    return {
      title: 'Ваша команда',
      sub: 'Добавьте брокеров — у каждого будет личный доступ и свои лиды.',
      pill: 'Необязательный шаг',
      splitTop: true,
      skipLabel: 'Добавить позже',
      hero: { img: 'people', card: { title: 'Личный доступ для каждого', rows: [
        [IC.lock, 'Вход по PIN', ''],
        [IC.chart, 'Только свои лиды', ''],
        [IC.user, 'Отдельный аккаунт', ''],
      ], note: 'Каждый брокер работает в своём пространстве.' } },
      html: `<div class="ob-teampanel">
          <div class="ob-teampanel-h"><b>Брокеры</b><i>Добавьте первого участника.</i></div>
          <div class="ob-team" id="obTeam"></div>
          <button type="button" class="ob-addbrk" id="obAddBrk">+ Добавить брокера</button>
          <div class="ob-teampanel-foot">${IC.clock} Команду можно добавить позже в разделе «Брокеры».</div>
        </div>`,
    };
  }

  function stepMore() {
    const caps = [
      { ic: 'phone', t: 'Телефония', d: 'Звонки в один клик, запись и ИИ-резюме разговора в карточке лида.' },
      { ic: 'list', t: 'Задачи', d: 'Задачник в Telegram: подзадачи, перенос в тап, ИИ раскладывает надиктовку.' },
      { ic: 'layers', t: 'Контент-студия', d: 'Карусели, деки и посты в соцсети — с вашим брендом, собирает ИИ.' },
      { ic: 'chart', t: 'Медиапланы', d: 'План-факт по рекламе, синк Meta и сигналы задолженностей.' },
      { ic: 'book', t: 'Академия', d: 'Приёмы продаж на реальных диалогах — подсказка брокеру в нужный момент.' },
      { ic: 'grid', t: 'Отчёты и Штаб', d: 'Сводки за день и неделю, сигналы руководителю: что просело и где.' },
      { ic: 'wallet', t: 'Баланс и оплата', d: 'Подписка картой или криптой; расходники — предоплата, списание по факту.' },
      { ic: 'bell', t: 'Уведомления', d: 'Предупредим, если баланс на исходе, и подтвердим каждый платёж.' },
    ];
    return {
      title: 'Больше возможностей в одном месте',
      sub: 'Познакомьтесь с инструментами Lumen. К ним можно вернуться после настройки.',
      wide: true,
      html: `<div class="ob-caps">${caps.map(c => `<div class="ob-cap"><div class="ob-cap-ic">${IC[c.ic]}</div><div class="ob-cap-t">${c.t}</div><div class="ob-cap-d">${c.d}</div></div>`).join('')}</div>
        <div class="ob-caps-foot">Сейчас ничего настраивать не нужно</div>`,
    };
  }

  function stepFinish() {
    const solo = S.edition === 'solo';
    const name = S.name || (solo ? 'Ваш бренд' : 'Ваше агентство');
    const initial = esc(String(name).trim().charAt(0).toUpperCase() || 'L');
    const geoChips = (S.geos || []).slice(0, 6).map(k => `<span class="ob-plate-geo">${esc((GEOS.find(g => g.k === k) || {}).l || k)}</span>`).join('');
    const logo = S.logo ? `<img src="${esc(S.logo)}" alt="">` : (S.name ? `<span class="ob-plate-mono">${initial}</span>` : `<span class="ob-plate-glyph">${IC.building}</span>`);
    /* персональная «обложка бренда» — скомпонована из их данных на анимированном золотом фоне (как hero-кавер писем) */
    const plate = `
      <div class="ob-plate">
        <div class="ob-plate-art"><i></i><i></i><i></i><span class="ob-plate-star">&#10022;</span></div>
        <div class="ob-plate-body">
          <div class="ob-plate-logo">${logo}</div>
          <div class="ob-plate-wm">&#10022;&nbsp;LUMEN</div>
          <div class="ob-plate-name">${esc(name)}</div>
          <div class="ob-plate-sub">CRM для недвижимости</div>
          ${geoChips ? `<div class="ob-plate-geos">${geoChips}</div>` : ''}
        </div>
      </div>`;
    return {
      bg: 'success', pad: true, inlineCta: true,
      html: `
        <div class="ob-center ob-finish">
          <div class="ob-done-mark">${IC.check}</div>
          <h1 class="ob-h1">Пространство собрано</h1>
          <p class="ob-fin-sub">Ваши настройки сохранены. Можно переходить к работе.</p>
          <div class="ob-fin-cols">
            ${plate}
            <div class="ob-recap" id="obRecap"></div>
          </div>
          <div class="ob-fin-note">${IC.info}${S.autopilot ? 'Автопилот включён — Lumen отвечает и квалифицирует новые заявки автоматически.' : 'Автопилот выключен — автоматические ответы пока не отправляются.'}</div>
          <button class="ob-btn ob-primary ob-fin-cta" data-act="next">Открыть Lumen →</button>
          <button class="ob-fin-change" data-act="back">Изменить настройки</button>
        </div>`,
      hideBack: true,
      hideSkip: true,
    };
  }

  function renderStepData(step) {
    switch (step.id) {
      case 'welcome': return stepWelcome();
      case 'edition': return stepEdition();
      case 'style': return stepStyle();
      case 'brand': return stepBrand();
      case 'geos': return stepGeos();
      case 'tone': return stepTone();
      case 'whatsapp': return stepGuide({ title: 'WhatsApp — сердце системы', sub: 'Главный канал. Через WhatsApp Cloud API Lumen отвечает клиентам с вашего номера.', shot: 'dialogs', action: 'wa', cta: 'Подключить WhatsApp', points: ['Ответы с вашего номера, а не с чужого', 'Первый ответ за секунды, круглосуточно', 'Шаблон первого касания под модерацию Meta', 'Мастер подключения — 7 понятных шагов'] });
      case 'chains': return stepGuide({ title: 'Цепочки касаний', sub: 'Не ответил сразу — Lumen мягко дожимает по расписанию и уважает тихие часы.', shot: 'sequences', action: 'chains', cta: 'Открыть цепочки', points: ['Готовая цепочка на 7 касаний / 18 дней', 'Переключение между каналами', 'Останавливается, как только клиент ответил', 'Реанимация «спящей» базы'] });
      case 'listings': return stepGuide({ title: 'База объектов', sub: 'Загрузите объекты — Lumen соберёт из них живые подборки под клиента.', shot: 'collections', action: 'listings', cta: 'Импортировать объекты', points: ['Импорт Reelly / CSV / Excel / JSON', 'Синк порталов (Property Finder, Bayut, DLD)', 'Подборки с вашим лого и подписью', 'Публичная страница с трекингом просмотров'] });
      case 'team': return stepTeam();
      case 'control': return stepGuide({ title: 'Контроль и защита базы', sub: 'Ваша база — ваш актив. Lumen следит, чтобы лиды не утекали, а руководитель видел всё.', shot: 'leadcard', action: 'control', cta: 'Открыть Пульт контроля', points: ['Антислив: контакты клиента скрыты от брокера до нужного момента', 'Сигналы руководителю: кто тянет с ответом, где просела конверсия', 'Журнал действий и разграничение доступа по ролям', 'Мягкий оффбординг: уходит брокер — база и переписки остаются у вас'] });
      case 'more': return stepMore();
      case 'pricing': return stepPricing();
      case 'finish': return stepFinish();
    }
  }

  // ============================================================
  //  ОТРИСОВКА КАРКАСА
  // ============================================================
  function paint() {
    const step = STEPS[idx];
    const d = renderStepData(step);
    const total = STEPS.length;
    // Видеофон: кинематографичная ЗОЛОТАЯ заставка (сгенерирована Higgsfield: частицы → ✦) на «киношных» шагах.
    const _bgv = d.bg === 'success' ? 'final' : 'intro';   /* финал — тёплый золотой фон, первый экран — кобальт (оба абстрактные, Higgsfield) */
    root.querySelector('.ob-bgvid').innerHTML = d.bg ? `<video autoplay muted loop playsinline poster="/onb/${_bgv}-poster.jpg?v=2"><source src="/onb/${_bgv}.mp4?v=2" type="video/mp4"></video>` : '';
    root.classList.toggle('ob-cinematic', !!d.bg);
    root.classList.toggle('ob-goldbg', !!d.bg);

    const _NN = total - 2;   /* число нумерованных шагов (8) */
    const stepsDots = step.id === 'welcome'
      ? '<i class="cap"></i>' + Array(6).fill('<i></i>').join('')                                  /* капсула + 6 точек = 7 */
      : step.id === 'finish'
        ? Array(_NN).fill('<i class="done"></i>').join('')                                          /* все закрыты */
        : Array.from({ length: _NN }, (_, k) => { const n = k + 1; return `<i class="${n < idx ? 'done' : n === idx ? 'on' : ''}"></i>`; }).join('');  /* прогресс цветом */
    const shot = d.shot ? `<div class="ob-shot"><div class="ob-shot-bar"><i></i><i></i><i></i></div><img src="${SHOT(d.shot)}" alt="" loading="lazy"></div>` : '';
    const hero = d.hero ? heroSide(d.hero) : '';
    const rightCol = hero || shot || (d.rightHtml ? `<div class="ob-rightcustom">${d.rightHtml}</div>` : '');

    const ambient = d.ambient ? `<div class="ob-ambient"><img src="/onb/heroes/${d.ambient}.png?v=1" alt="" draggable="false"></div>` : '';
    root.querySelector('.ob-stage').innerHTML = `
      <div class="ob-panel ${d.bg ? 'ob-panel-cine' : ''} ${rightCol ? 'ob-panel-split' : ''} ${d.splitTop ? 'ob-panel-split-top' : ''} ${d.wide ? 'ob-panel-wide' : ''} ${d.center ? 'ob-panel-center' : ''}" key="${step.id}">
        ${ambient}
        <div class="ob-body">
          ${d.title ? `<div class="ob-eyebrow">${d.eyebrow || ('Шаг ' + idx + ' из ' + (total - 2))}${d.eyebrowSuffix || ''}</div><h2 class="ob-h2">${d.title}</h2>${d.sub ? `<p class="ob-sub">${d.sub}</p>` : ''}${d.microsub ? `<p class="ob-microsub">${d.microsub}</p>` : ''}${d.pill ? `<div class="ob-pill">${d.pill}</div>` : ''}` : ''}
          <div class="ob-content">${d.html}</div>
        </div>
        ${rightCol}
      </div>`;

    // низ: прогресс + кнопки
    const _progLbl = step.id === 'welcome' ? 'Знакомство' : step.id === 'finish' ? 'Готово' : ('Шаг ' + idx + ' из ' + (total - 2));
    root.querySelector('.ob-foot').innerHTML = `
      <div class="ob-prog ${step.id === 'welcome' ? 'ob-prog-dots' : ''}"><span class="ob-prog-lbl">${_progLbl}</span><div class="ob-dots">${stepsDots}</div></div>
      <div class="ob-actions">
        ${d.hideBack ? '' : `<button class="ob-btn ob-ghost" data-act="back">Назад</button>`}
        ${d.hideSkip || d.hideBack ? '' : `<button class="ob-btn ob-ghost ob-skip" data-act="skip">${d.skipLabel || 'Пропустить'}</button>`}
        ${d.inlineCta ? '' : `<button class="ob-btn ob-primary ${d.primaryDisabled ? 'dis' : ''}" data-act="next">${d.primary || 'Далее →'}</button>`}
      </div>`;

    wireStep(step, d);
    // мягкая волна появления
    const p = root.querySelector('.ob-panel'); if (p) { p.style.animation = 'none'; void p.offsetWidth; p.style.animation = ''; }
    if (step.id === 'finish') buildRecap();
  }

  function wireStep(step, d) {
    const q = (s) => root.querySelector(s);
    const qq = (s) => Array.from(root.querySelectorAll(s));

    // навигация
    qq('[data-act]').forEach(b => b.onclick = () => {
      const a = b.dataset.act;
      if (a === 'back') return back();
      if (a === 'skip') return next(true);
      if (a === 'next') { if (b.classList.contains('dis')) return; if (step.primaryDo) return runGuide(step.primaryDo); next(false); }
    });

    // per-step
    if (step.id === 'edition') {
      qq('[data-edition]').forEach(b => b.onclick = () => { S.edition = b.dataset.edition; paint(); });
    }
    if (step.id === 'style') {
      const pImg = q('#tprevImg'), pName = q('#tprevName'), pDesc = q('#tprevDesc');
      const showPrev = (key) => { const t = THEMES.find(x => x.key === key); if (!t) return; if (pImg) pImg.src = '/assets/theme-' + key + '.png?v=live'; if (pName) pName.textContent = t.name; if (pDesc) pDesc.textContent = t.desc; };
      qq('[data-theme]').forEach(b => {
        b.onmouseenter = () => showPrev(b.dataset.theme);
        b.onmouseleave = () => showPrev(S.theme);
        b.onclick = () => { S.theme = b.dataset.theme; try { (B().setTheme || window.setTheme)(S.theme, { silent: true }); } catch (e) {} qq('[data-theme]').forEach(x => x.classList.toggle('on', x === b)); showPrev(S.theme); try { if (window.toast) window.toast('Стиль применён', (THEMES.find(t => t.key === S.theme) || {}).name || '', true); } catch (e) {} };
      });
    }
    if (step.id === 'brand') {
      const setTx = (id, v, ph) => { const el2 = q(id); if (el2) el2.textContent = v || ph; };
      q('#obName').oninput = e => { S.name = e.target.value; setTx('#cpName', e.target.value, S.edition === 'solo' ? 'Ваш бренд' : 'One Agency'); };
      q('#obMgrName').oninput = e => { S.manager.name = e.target.value; setTx('#cpMgr', e.target.value, 'Имя менеджера'); };
      q('#obMgrPhone').oninput = e => { S.manager.phone = e.target.value; setTx('#cpPhone', e.target.value, '+7 900 123-45-67'); };
      q('#obMgrEmail').oninput = e => { S.manager.email = e.target.value; setTx('#cpEmail', e.target.value, 'name@agency.com'); };
      q('#obLogo').onchange = e => {
        const f = e.target.files[0]; if (!f) return;
        const rd = new FileReader(); rd.onload = () => { S.logo = rd.result; paint(); }; rd.readAsDataURL(f);
      };
      const clr = q('#obLogoClear'); if (clr) clr.onclick = () => { S.logo = ''; paint(); };
    }
    if (step.id === 'geos') {
      const syncGeo = () => {
        q('#obGeoCount').textContent = S.geos.length;
        const gw = q('#obGeoWord'); if (gw) gw.textContent = geoWord(S.geos.length);
        qq('[data-geo]').forEach(x => x.classList.toggle('on', S.geos.includes(x.dataset.geo)));
        const tg = q('#obGeoTags'); if (tg) { tg.innerHTML = S.geos.map(k => { const g = GEOS.find(x => x.k === k); return `<span class="ob-geo-tag" data-geotag="${k}">${g ? esc(g.l) : k}<i>×</i></span>`; }).join(''); qq('[data-geotag]').forEach(t => t.onclick = () => { const i = S.geos.indexOf(t.dataset.geotag); if (i >= 0) S.geos.splice(i, 1); syncGeo(); }); }
        const nb = root.querySelector('[data-act="next"]'); if (nb) nb.classList.toggle('dis', S.geos.length === 0);
      };
      qq('[data-geo]').forEach(b => b.onclick = () => {
        const k = b.dataset.geo; const i = S.geos.indexOf(k);
        if (i >= 0) S.geos.splice(i, 1); else S.geos.push(k);
        syncGeo();
      });
      syncGeo();
    }
    if (step.id === 'tone') {
      qq('[data-tone]').forEach(b => b.onclick = () => {
        S.tone = b.dataset.tone; qq('[data-tone]').forEach(x => x.classList.toggle('on', x === b));
        const t = TONES.find(x => x.k === S.tone) || TONES[0];
        const rep = q('#obToneReply'), nm = q('#obTonePrevName');
        if (rep) { rep.textContent = t.ex; rep.parentElement.style.animation = 'none'; void rep.offsetWidth; rep.parentElement.style.animation = 'obTprevFade .45s cubic-bezier(.19,1,.22,1)'; }
        if (nm) nm.textContent = t.name;
      });
      const ap = q('#obAutopilot'); if (ap) ap.onchange = e => { S.autopilot = e.target.checked; const l = q('#obAutoLbl'); if (l) l.textContent = e.target.checked ? 'Включён' : 'Выключен'; };
    }
    if (step.id === 'team') {
      const box = q('#obTeam');
      const drawTeam = () => {
        box.innerHTML = (S.brokers || []).map((b, i) => `<div class="ob-brk" data-i="${i}">
          <div class="ob-brk-head"><span class="ob-brk-ava">${IC.user}</span><b>Брокер ${i + 1}</b><button type="button" class="ob-bk-del" data-del="${i}" title="Убрать">${IC.trash}</button></div>
          <label class="ob-brk-field"><span>Имя брокера</span><input class="ob-bk" data-k="name" placeholder="Имя и фамилия" value="${esc(b.name || '')}"></label>
          <div class="ob-brk-row2">
            <label class="ob-brk-field"><span>Телефон</span><input class="ob-bk" data-k="phone" placeholder="+…" value="${esc(b.phone || '')}"></label>
            <label class="ob-brk-field"><span>E-mail для входа</span><input class="ob-bk" data-k="email" placeholder="name@agency.com" value="${esc(b.email || '')}"></label>
          </div>
        </div>`).join('');
        box.querySelectorAll('.ob-bk').forEach(inp => inp.oninput = () => { const i = +inp.closest('[data-i]').dataset.i; S.brokers[i][inp.dataset.k] = inp.value; });
        box.querySelectorAll('[data-del]').forEach(btn => btn.onclick = () => { const i = +btn.dataset.del; if (S.brokers.length <= 1) S.brokers = [{}]; else S.brokers.splice(i, 1); drawTeam(); });
      };
      drawTeam();
      const ab = q('#obAddBrk'); if (ab) ab.onclick = () => { S.brokers.push({}); drawTeam(); };
    }
    if (step.id === 'pricing') {
      qq('[data-seat]').forEach(b => b.onclick = () => {
        if (S.edition === 'solo') return;
        const seatsIncl = 6, base = 200, seatPrice = 25;
        S._seats = Math.max(seatsIncl, (+S._seats || seatsIncl) + (+b.dataset.seat));
        const extra = Math.max(0, S._seats - seatsIncl);
        const total = base + extra * seatPrice;
        const se = q('#obSeats'); if (se) se.textContent = S._seats;
        const to = q('#obTotal'); if (to) to.textContent = '$' + total;
        const t2 = q('#obTotal2'); if (t2) t2.textContent = '$' + total;
        const en = q('#obExtraN'); if (en) en.textContent = extra;
        const es = q('#obExtraSum'); if (es) es.textContent = '$' + extra * seatPrice;
      });
    }
    qq('[data-do]').forEach(btn => { btn.onclick = () => runGuide(btn.dataset.do); });
  }

  function runGuide(action) {
    // НЕ закрываем онбординг (раньше close() выкидывал из тура) — запоминаем визард и идём дальше по шагам.
    // Отложенные визарды откроются в конце, после «Запустить Lumen».
    S.pendingGuides = S.pendingGuides || [];
    if (action && !S.pendingGuides.includes(action)) S.pendingGuides.push(action);
    saveProgress(false);
    if (action === 'pay') { finish(); return; }   /* «Перейти к оплате» — сразу завершаем онбординг и уходим в раздел «Подписка и оплата» */
    next(false);
  }

  function buildRecap() {
    const box = root.querySelector('#obRecap'); if (!box) return;
    const th = THEMES.find(t => t.key === S.theme);
    const rows = [
      ['Формат', S.edition === 'solo' ? 'Соло-брокер' : 'Агентство'],
      ['Стиль', th ? th.name : S.theme],
      ['Бренд', S.name || 'Не добавлен'],
      [S.geos.length === 1 ? 'Направление' : 'Направления', S.geos.length ? S.geos.map(k => (GEOS.find(g => g.k === k) || {}).l || k).join(', ') : '—'],
      ['Тон', (TONES.find(t => t.k === S.tone) || {}).name || '—'],
      ['Автопилот', S.autopilot ? 'Включён' : 'Выключен'],
    ];
    box.innerHTML = `<div class="ob-recap-h">Ваши настройки</div>` + rows.map(r => `<div class="ob-recap-row"><span>${r[0]}</span><b>${esc(r[1])}</b></div>`).join('');
  }

  // ============================================================
  //  НАВИГАЦИЯ + СОХРАНЕНИЕ
  // ============================================================
  function next(skip) {
    const step = STEPS[idx];
    if (step.id === 'edition' && !S.edition) return;
    if (step.id === 'finish') return finish();
    // ветвление пересобирается после выбора edition
    if (step.id === 'edition') STEPS = buildSteps();
    idx = Math.min(idx + 1, STEPS.length - 1);
    stepChange();
  }
  function back() { if (idx <= 0) return; idx = Math.max(0, idx - 1); stepChange(); }
  function stepChange() {
    const stage = root && root.querySelector('.ob-stage');
    if (!stage) { paint(); return; }
    stage.classList.add('ob-leaving');
    pulseShader();
    setTimeout(() => { if (root) { stage.classList.remove('ob-leaving'); paint(); } }, 175);
  }

  async function saveProgress(markDone) {
    const agency = {
      edition: S.edition || 'agency',
      geos: S.geos,
      manager: S.manager,
    };
    if (S.name) agency.name = S.name;
    if (S.logo) agency.logo = S.logo;
    if (markDone) agency.onboarded = true;
    const patch = { agency };
    const tone = (TONES.find(t => t.k === S.tone) || {}).tone;
    patch.ai = { autopilot: !!S.autopilot };
    if (tone) patch.ai.persona = { tone };
    try { await api('PATCH', '/settings', patch); } catch (e) { console.warn('onboard save', e); }
    try { (B().setTheme || window.setTheme)(S.theme); } catch (e) {}
  }

  async function finish() {
    const fin = root.querySelector('[data-act="next"]'); if (fin) { fin.classList.add('dis'); fin.textContent = 'Запускаем…'; }
    await saveProgress(true);
    /* заводим брокеров, добавленных в шаге «Команда» (синк с аккаунтом) */
    const brs = (S.brokers || []).filter(b => b && String(b.name || '').trim());
    for (const b of brs) { try { await api('POST', '/brokers', { name: b.name, phone: b.phone || '', email: b.email || '' }); } catch (e) {} }
    root.classList.add('ob-launch');
    setTimeout(async () => {
      close(false);
      try { const b = B(); if (b.refresh) await b.refresh(); } catch (e) {}
      try { const b = B(); if (b.go) b.go('overview'); } catch (e) {}
      /* открыть первый отложенный визард (оплата) — иначе запустить интерактивный тур по CRM */
      const g = (S.pendingGuides || [])[0];
      if (g) setTimeout(() => { try { const b = B(); ({ pay: () => b.go && b.go('billing'), wa: () => b.openWa ? b.openWa() : b.go && b.go('settings'), chains: () => b.go && b.go('sequences'), listings: () => b.go && b.go('properties'), team: () => b.go && b.go('brokers'), control: () => b.go && b.go('control') }[g] || (() => {}))(); } catch (e) {} }, 800);
      else setTimeout(() => { try { window.startLumenTour && window.startLumenTour(); } catch (e) {} }, 1300);
    }, 900);
  }

  // ============================================================
  //  ОТКРЫТИЕ / ЗАКРЫТИЕ
  // ============================================================
  function open(opts) {
    opts = opts || {};
    if (root) return;
    auto = !!opts.auto;
    injectCSS();
    const st = (B().state) || (window.STATE) || {};
    S = freshState(st);
    api('GET', '/billing').then(b => { _billing = b; }).catch(() => {});
    STEPS = buildSteps();
    idx = 0;
    root = el(`
      <div id="lumenOnboard" class="ob-root" role="dialog" aria-label="Настройка Lumen">
        <div class="ob-bgvid"></div>
        <canvas class="ob-shader"></canvas>
        <div class="ob-veil"></div>
        <div class="ob-orbs"><i></i><i></i><i></i></div>
        <div class="ob-grain"></div>
        <div class="ob-lockup"><svg viewBox="0 0 100 120" width="20" height="24" fill="none" stroke="#c9a25a" stroke-width="3" stroke-linejoin="round"><path d="M50 6 C54 41 64 53 91 60 C64 67 54 79 50 114 C46 79 36 67 9 60 C36 53 46 41 50 6 Z"/></svg><span><i>Lumen</i> CRM</span></div>
        <button class="ob-close" title="Закрыть">${IC.x}</button>
        <div class="ob-zoom"><div class="ob-zoom-card"><img alt=""><div class="ob-zoom-lbl"></div></div></div>
        <div class="ob-wrap">
          <div class="ob-stage"></div>
          <div class="ob-foot"></div>
        </div>
      </div>`);
    document.body.appendChild(root);
    document.documentElement.style.overflow = 'hidden';
    try { startShader(root.querySelector('.ob-shader')); } catch (e) {}
    root.addEventListener('pointermove', (e) => { _mouse.tx = e.clientX / innerWidth; _mouse.ty = 1 - e.clientY / innerHeight; }, { passive: true });
    root.querySelector('.ob-close').onclick = () => { saveProgress(false); close(true); };
    requestAnimationFrame(() => root.classList.add('in'));
    paint();
  }
  function close(keepScroll) {
    if (!root) return;
    stopShader();
    const r = root; root = null;
    r.classList.remove('in');
    document.documentElement.style.overflow = '';
    setTimeout(() => r.remove(), 420);
  }

  // ============================================================
  //  CSS
  // ============================================================
  function injectCSS() {
    if (document.getElementById('ob-style')) return;
    const css = `
    /* ============ Lumen · Онбординг «Ателье» (тихая роскошь, 1:1 с land.html) ============ */
    .ob-root{position:fixed;inset:0;z-index:5000;opacity:0;transition:opacity .5s cubic-bezier(.19,1,.22,1);font-family:'Manrope',system-ui,sans-serif;color:#f4f3f1;background:#060605}
    .ob-root.in{opacity:1}
    .ob-root.ob-launch{opacity:0;transform:scale(1.02);transition:opacity .8s ease,transform .8s ease}
    /* обрамлённая панель на чёрном (как в референсах) */
    .ob-root::after{content:"";position:fixed;inset:10px;border:1px solid rgba(255,255,255,.07);border-radius:22px;pointer-events:none;z-index:6}
    @media(max-width:640px){ .ob-root::after{inset:6px;border-radius:16px} }
    /* фон-«герой» как на сайте — тёмный радиал, никакого видео */
    .ob-bgvid{position:absolute;inset:0;display:block;z-index:0;overflow:hidden}
    .ob-bgvid video{width:100%;height:100%;object-fit:cover;opacity:.34;filter:grayscale(1) contrast(1.04)}
    .ob-shader{position:absolute;inset:0;z-index:2;pointer-events:none;opacity:.9;transition:opacity .5s ease}
    .ob-root.ob-cinematic .ob-shader{opacity:.4}
    .ob-root.ob-pulse .ob-shader{opacity:1}
    /* золотой эмблем-мотив на шапке шага */
    .ob-emblem{width:48px;height:48px;border-radius:50%;border:1px solid rgba(214,199,168,.32);background:radial-gradient(120% 120% at 50% 30%,rgba(214,199,168,.12),rgba(214,199,168,.03));color:#d6c7a8;display:flex;align-items:center;justify-content:center;margin-bottom:18px;box-shadow:0 0 26px -8px rgba(214,199,168,.5);animation:obEmblem 4.5s ease-in-out infinite}
    .ob-emblem svg{width:23px;height:23px}
    @keyframes obEmblem{0%,100%{box-shadow:0 0 20px -9px rgba(214,199,168,.4);transform:translateY(0)}50%{box-shadow:0 0 32px -4px rgba(214,199,168,.7);transform:translateY(-2px)}}
    .ob-veil{position:absolute;inset:0;z-index:1;background:radial-gradient(130% 100% at 50% 18%,#0d0c0b,#060605 68%,#040403)}
    .ob-root:not(.ob-cinematic) .ob-veil{background:radial-gradient(130% 100% at 50% 18%,#0d0c0b,#060605 68%,#040403)}
    .ob-root.ob-cinematic .ob-veil{background:radial-gradient(130% 100% at 50% 18%,rgba(13,12,11,.72),rgba(6,6,5,.86) 68%,rgba(4,4,3,.95))}
    /* золотая кинематографичная заставка (Higgsfield) — цветная, ярче, тёплая вуаль поверх */
    .ob-goldbg .ob-bgvid video{opacity:.6;filter:none;transform:scale(1.06)}
    .ob-root.ob-cinematic.ob-goldbg .ob-veil{background:radial-gradient(120% 100% at 50% 34%,rgba(12,10,7,.5),rgba(7,6,4,.8) 66%,rgba(4,3,2,.94))}
    /* почти невидимое тёплое зерно вместо светящихся орбов */
    .ob-orbs{position:absolute;inset:0;z-index:2;pointer-events:none;overflow:hidden;opacity:.35}
    .ob-orbs i{display:none}
    .ob-grain{position:absolute;inset:0;z-index:3;pointer-events:none;opacity:.04;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
    .ob-lockup{position:absolute;top:26px;left:30px;z-index:7;display:flex;align-items:center;gap:9px;font-size:17px;color:#f4efe7;font-family:'Cormorant',Georgia,serif}
    .ob-lockup i{font-style:italic;color:#e8c983}
    .ob-lockup span{font-weight:500;letter-spacing:.01em}
    @media(max-width:640px){.ob-lockup{top:16px;left:16px;font-size:15px}}
    .ob-close{position:absolute;top:20px;right:22px;z-index:7;width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.16);background:transparent;color:#cfcdc8;cursor:pointer;transition:.3s cubic-bezier(.19,1,.22,1);display:flex;align-items:center;justify-content:center}
    .ob-close:hover{border-color:rgba(255,255,255,.4);color:#f4f3f1}
    .ob-close svg{width:15px;height:15px}
    .ob-wrap{position:absolute;inset:0;display:flex;flex-direction:column;z-index:5}
    .ob-stage{flex:1;display:flex;align-items:safe center;justify-content:center;padding:56px 26px 32px;overflow:auto;transition:opacity .2s ease,transform .2s ease,filter .2s ease}
    .ob-stage.ob-leaving{opacity:0;transform:translateY(-12px);filter:blur(4px)}
    .ob-panel{width:100%;max-width:980px;animation:obIn .7s cubic-bezier(.19,1,.22,1)}
    .ob-panel-split{max-width:1080px;display:grid;grid-template-columns:1.05fr .95fr;gap:36px;align-items:center}
    @keyframes obIn{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
    .ob-body{min-width:0}
    .ob-step-n{font-size:11px;font-weight:500;letter-spacing:.4em;text-transform:uppercase;color:#6b6a68}
    .ob-h1{font-family:'Cormorant',Georgia,serif;font-size:clamp(42px,6vw,78px);font-weight:400;letter-spacing:-.005em;line-height:1.02;margin:8px 0 16px;color:#f4f3f1;text-wrap:balance}
    .ob-h2{font-family:'Cormorant',Georgia,serif;font-size:clamp(30px,4vw,50px);font-weight:400;letter-spacing:-.005em;line-height:1.05;margin:10px 0 12px;color:#f4f3f1}
    .ob-grad{font-style:italic;color:#d6c7a8}
    .ob-lead{font-size:clamp(15px,1.5vw,18px);color:#a7a6a3;font-weight:300;line-height:1.62;max-width:56ch}
    .ob-sub{font-size:15px;color:#a7a6a3;font-weight:300;line-height:1.6;max-width:64ch;margin-bottom:24px}
    .ob-center{text-align:center;max-width:760px;margin:0 auto}
    .ob-badge{display:inline-flex;align-items:center;gap:10px;font-size:11px;font-weight:500;letter-spacing:.4em;text-transform:uppercase;color:#6b6a68;margin-bottom:22px}
    .ob-badge::before{content:"";width:22px;height:1px;background:rgba(214,199,168,.5)}
    .ob-center .ob-badge{justify-content:center}
    .ob-pills{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:28px}
    .ob-pill{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:300;letter-spacing:.02em;color:#a7a6a3;background:transparent;border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:9px 15px;white-space:nowrap}
    .ob-pill svg{width:15px;height:15px;flex:0 0 15px;color:#d6c7a8}
    .ob-note{font-size:13px;color:#6b6a68;font-weight:300;margin-top:16px;line-height:1.55}
    .ob-note svg{width:15px;height:15px;vertical-align:-3px;margin-right:5px;flex:0 0 auto}
    .ob-content{margin-top:6px}
    /* ── eyebrow (caps, как в референсах) ── */
    .ob-eyebrow{font-size:12px;font-weight:500;letter-spacing:.22em;text-transform:uppercase;color:#8c8172;margin-bottom:20px}
    /* ── Welcome: 2 колонки (текст + 3D-герой) ── */
    .ow{display:grid;grid-template-columns:1.1fr .9fr;gap:40px;align-items:center;width:100%;max-width:1080px;margin:0 auto}
    .ow-l{min-width:0}
    .ow .ob-h1{margin:0 0 18px;font-size:clamp(34px,4.4vw,60px)}
    .ow-sub{font-size:17px;color:#9e968b;font-weight:300;line-height:1.55;max-width:46ch;margin:0 0 26px}
    .ow-feats{display:flex;flex-direction:column;gap:13px;margin-bottom:30px}
    .ow-feat{display:flex;align-items:center;gap:14px;font-size:15px;color:#e9e3d8}
    .ow-feat-ic{flex:0 0 auto;width:44px;height:44px;border-radius:12px;border:1px solid rgba(201,162,90,.28);background:rgba(201,162,90,.05);color:#c9a25a;display:grid;place-items:center}
    .ow-feat-ic svg{width:20px;height:20px}
    .ow-cta{align-self:flex-start;padding:15px 30px;font-size:15px}
    .ow-note{font-size:12.5px;color:#6e665c;margin-top:14px}
    .ow-r{position:relative;min-height:500px;display:grid;place-items:center}
    /* герой: mix-blend screen убирает тёмный фон PNG (объект «светится» на панели без коробки) */
    .ow-hero{position:relative;width:100%;max-width:520px;margin-top:-70px;animation:owFloat 7s ease-in-out infinite;z-index:1}
    /* радиальная маска растворяет прямоугольный фон PNG в панель — «коробки» нет, звезда парит */
    .ow-hero img{width:100%;height:auto;display:block;-webkit-mask-image:radial-gradient(ellipse 58% 60% at 50% 42%,#000 50%,transparent 78%);mask-image:radial-gradient(ellipse 58% 60% at 50% 42%,#000 50%,transparent 78%)}
    @keyframes owFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
    .ow-gcard{position:absolute;z-index:2;border-radius:16px;border:1px solid rgba(255,255,255,.14);background:rgba(30,27,22,.62);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:0 24px 60px -24px rgba(0,0,0,.7);padding:15px 17px;animation:owFloat 8s ease-in-out infinite}
    .ow-gcard-1{left:0;bottom:2%;width:232px;animation-delay:.4s}
    .ow-gcard-2{right:0;bottom:12%;width:210px;animation-delay:1.1s}
    .ow-gc-h,.ow-gc-h2{font-size:12.5px;color:#d7d0c4;font-weight:500;margin-bottom:11px}
    .ow-gc-sw{display:flex;gap:7px;margin-bottom:12px}
    .ow-gc-sw i{width:20px;height:20px;border-radius:50%;border:1px solid rgba(255,255,255,.2)}
    .ow-gc-rows{display:flex;flex-direction:column;gap:11px}
    .ow-gc-nav{display:flex;align-items:center;gap:11px}
    .ow-gc-ic{flex:0 0 auto;width:22px;height:22px;border-radius:7px;display:flex;align-items:center;justify-content:center;color:#b3aa98;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)}
    .ow-gc-ic svg{width:13px;height:13px}
    .ow-gc-nav span{flex:1 1 auto;height:7px;border-radius:4px;background:rgba(255,255,255,.09);display:block}
    .ow-gc-nav:nth-child(1) span{max-width:82%}.ow-gc-nav:nth-child(2) span{max-width:62%}.ow-gc-nav:nth-child(3) span{max-width:72%}
    .ow-gc-chk{width:34px;height:34px;border-radius:50%;border:1px solid rgba(201,162,90,.55);color:#c9a25a;display:grid;place-items:center;margin-bottom:10px}
    .ow-gc-chk svg{width:17px;height:17px}
    .ow-gc-chans{display:flex;gap:8px}
    .ow-gc-chans i{width:30px;height:30px;border-radius:50%;border:1px solid rgba(255,255,255,.14);color:#c9a25a;display:grid;place-items:center}
    .ow-gc-chans i svg{width:15px;height:15px}
    @media(max-width:820px){.ow{grid-template-columns:1fr;gap:18px}.ow-r{min-height:280px;order:-1}.ow-gcard{display:none}.ow-hero{max-width:230px}}
    /* ── правая колонка-герой (S4 глобус / S5 люди / S6 баблы / S8 кольцо) ── */
    .ob-heroside{display:flex;flex-direction:column;align-items:center;gap:18px;min-width:0}
    .ob-hero2{width:100%;max-width:330px}
    .ob-hero2 img{width:100%;height:auto;display:block;-webkit-mask-image:radial-gradient(ellipse 60% 62% at 50% 45%,#000 52%,transparent 80%);mask-image:radial-gradient(ellipse 60% 62% at 50% 45%,#000 52%,transparent 80%);animation:owFloat 7s ease-in-out infinite}
    .ob-hcard{width:100%;max-width:360px;border-radius:16px;border:1px solid rgba(255,255,255,.1);background:rgba(24,21,17,.5);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);padding:16px 18px}
    .ob-hcaption{text-align:center;margin-top:-6px}
    .ob-hcaption-b{font-size:13px;font-weight:500;letter-spacing:.2em;text-transform:uppercase;color:#cfc6b6;line-height:1.7}
    .ob-hcaption-s{font-size:11px;font-weight:400;letter-spacing:.22em;text-transform:uppercase;color:#8a8272;margin-top:8px}
    .ob-hcard-t{font-size:12.5px;font-weight:600;letter-spacing:.02em;color:#d7d0c4;margin-bottom:10px}
    .ob-hrow{display:flex;gap:12px;align-items:flex-start;padding:9px 0}
    .ob-hrow+.ob-hrow{border-top:1px solid rgba(255,255,255,.05)}
    .ob-hrow-ic{flex:0 0 auto;width:34px;height:34px;border-radius:10px;border:1px solid rgba(201,162,90,.28);background:rgba(201,162,90,.05);color:#c9a25a;display:grid;place-items:center}
    .ob-hrow-ic svg{width:17px;height:17px}
    .ob-hrow-tx b{display:block;font-size:13.5px;font-weight:600;color:#f4efe7}
    .ob-hrow-tx span{display:block;font-size:12px;color:#9e968b;line-height:1.45;margin-top:2px}
    .ob-hcard-note{font-size:11.5px;color:#8a8272;line-height:1.5;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.06)}
    .ob-hcard-note svg{width:14px;height:14px;vertical-align:-2px;margin-right:4px;color:#9e968b}
    /* центрированная шапка (S1/S7) */
    .ob-panel-center .ob-body,.ob-panel-center .ob-eyebrow,.ob-panel-center .ob-h2,.ob-panel-center .ob-sub{text-align:center}
    .ob-panel-center .ob-sub{margin-left:auto;margin-right:auto}
    @media(max-width:820px){.ob-hero2{max-width:220px}}
    /* S1 карточки с 3D-героем + бейдж «Выбрано» + круглые галочки */
    .ob-choice-hero{height:118px;margin:-4px 0 14px;display:grid;place-items:center}
    .ob-choice-hero img{height:150px;width:auto;max-width:100%;-webkit-mask-image:radial-gradient(ellipse 62% 66% at 50% 46%,#000 50%,transparent 82%);mask-image:radial-gradient(ellipse 62% 66% at 50% 46%,#000 50%,transparent 82%)}
    .ob-choice-l li{padding-left:0;display:flex;gap:10px;align-items:center}
    .ob-choice-l li:before{display:none}
    .ob-choice-l li .ob-li-ck{flex:0 0 auto;width:19px;height:19px;border-radius:50%;border:1px solid rgba(201,162,90,.5);display:flex;align-items:center;justify-content:center}
    .ob-choice-l li .ob-li-ck svg{width:11px;height:11px;color:#c9a25a;margin:0}
    .ob-choice-div{height:1px;background:rgba(214,199,168,.14);margin:2px 0 15px}
    .ob-choice-badge{position:absolute;top:16px;right:16px;display:flex;flex-direction:column;align-items:center;gap:5px}
    .ob-choice-ring{width:24px;height:24px;border-radius:50%;border:1px solid rgba(255,255,255,.28)}
    .ob-choice .ob-choice-check{position:static;width:24px;height:24px;border-radius:50%;background:#c9a25a;color:#141311;display:none;align-items:center;justify-content:center;opacity:1;transform:none;border:none}
    .ob-choice-badge em{font-size:10px;font-style:normal;letter-spacing:.04em;color:#c9a25a;display:none}
    .ob-choice.on .ob-choice-ring{display:none}
    .ob-choice.on .ob-choice-check{display:flex}
    .ob-choice.on .ob-choice-badge em{display:block}
    .ob-choice-foot{text-align:center;margin-top:18px;font-size:12px;color:#8a8272;display:flex;align-items:center;justify-content:center;gap:7px}
    .ob-choice-foot svg{width:14px;height:14px;color:#8a8272}
    /* S6 тон — вертикальные строки в узкой левой колонке */
    .ob-tones-rows{grid-template-columns:1fr;gap:10px}
    /* ── выбор редакции ── */
    .ob-choices{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .ob-choice{position:relative;text-align:left;padding:26px;border-radius:18px;border:1px solid rgba(214,199,168,.14);background:rgba(255,255,255,.02);color:#f4f3f1;cursor:pointer;transition:.4s cubic-bezier(.19,1,.22,1)}
    .ob-choice:hover{transform:translateY(-2px);border-color:rgba(214,199,168,.3)}
    .ob-choice.on{border-color:rgba(214,199,168,.5);background:rgba(214,199,168,.06)}
    .ob-choice-ic{margin-bottom:16px;color:#d6c7a8;line-height:0}
    .ob-choice-ic svg{width:34px;height:34px}
    .ob-choice-t{font-family:'Cormorant',Georgia,serif;font-size:24px;font-weight:500;letter-spacing:-.005em;margin-bottom:8px;color:#f4f3f1}
    .ob-choice-d{font-size:13.5px;color:#a7a6a3;font-weight:300;line-height:1.55;margin-bottom:16px}
    .ob-choice-l{list-style:none;padding:0;margin:0;display:grid;gap:8px}
    .ob-choice-l li{font-size:13px;color:#a7a6a3;font-weight:300;padding-left:20px;position:relative}
    .ob-choice-l li:before{content:"";position:absolute;left:0;top:8px;width:8px;height:1px;background:rgba(214,199,168,.6)}
    .ob-choice-check{position:absolute;top:18px;right:18px;width:24px;height:24px;border-radius:50%;border:1px solid rgba(214,199,168,.6);background:transparent;color:#d6c7a8;display:flex;align-items:center;justify-content:center;opacity:0;transform:scale(.6);transition:.3s cubic-bezier(.19,1,.22,1)}
    .ob-choice-check svg{width:14px;height:14px}
    .ob-choice.on .ob-choice-check{opacity:1;transform:scale(1)}
    /* ── темы (флип-карточка) ── */
    .ob-themes{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;align-items:stretch;grid-auto-rows:1fr}
    .ob-theme{position:relative;height:100%;text-align:left;padding:0;cursor:pointer;background:none;border:none;color:#f4f3f1;perspective:1200px;transition:transform .4s cubic-bezier(.19,1,.22,1)}
    .ob-theme:hover{transform:translateY(-2px)}
    .ob-theme-inner{position:relative;height:100%;transform-style:preserve-3d;transition:transform .8s cubic-bezier(.19,1,.22,1)}
    .ob-theme:hover .ob-theme-inner{transform:rotateY(180deg)}
    .ob-theme-front,.ob-theme-back{border-radius:16px;overflow:hidden;-webkit-backface-visibility:hidden;backface-visibility:hidden;border:1px solid rgba(214,199,168,.14);background:rgba(255,255,255,.02)}
    .ob-theme-front{height:100%;display:flex;flex-direction:column}
    .ob-theme-back{position:absolute;inset:0;height:100%;transform:rotateY(180deg);display:flex;flex-direction:column;background:#0c0b0a}
    .ob-theme-back img{width:100%;flex:1;min-height:0;object-fit:cover;object-position:top left}
    .ob-theme-back-lbl{padding:10px 14px;font-size:12px;font-weight:500;color:#a7a6a3;background:rgba(8,8,8,.9);border-top:1px solid rgba(255,255,255,.08);text-align:left}
    .ob-theme-prev{position:relative;flex:0 0 auto;aspect-ratio:16/10;overflow:hidden;background:#0c0b0a}
    .ob-theme-prev video,.ob-theme-static{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
    .ob-theme-prev video{transition:transform .8s cubic-bezier(.19,1,.22,1)}
    .ob-theme:hover .ob-theme-prev video{transform:scale(1.05)}
    .ob-theme-prev:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 58%,rgba(6,6,5,.5));pointer-events:none;z-index:1}
    .ob-theme-swz{position:absolute;left:10px;bottom:10px;display:flex;gap:5px;z-index:2}
    .ob-theme-swz i{width:15px;height:15px;border-radius:50%;border:1px solid rgba(255,255,255,.5)}
    .ob-theme-meta{flex:1 1 auto;padding:13px 15px}
    .ob-theme-meta b{display:block;font-size:15.5px;font-weight:600;letter-spacing:-.01em;color:#f4f3f1}
    .ob-theme-meta span{display:block;font-size:12px;color:#6b6a68;font-weight:300;line-height:1.45;margin-top:3px}
    .ob-theme.on .ob-theme-front,.ob-theme.on .ob-theme-back{border-color:rgba(214,199,168,.75)}
    .ob-theme.on{box-shadow:0 0 0 2px rgba(214,199,168,.6),0 16px 42px -14px rgba(214,199,168,.4)}
    .ob-theme.on .ob-choice-check{opacity:1;transform:scale(1);background:#d6c7a8;color:#141311;border-color:#d6c7a8}
    .ob-theme .ob-choice-check{position:absolute;top:14px;right:14px;z-index:3}
    /* ── S2 стиль: сетка карточек тем (real UI thumbnail) + живой preview справа ── */
    .ob-panel-split-top{align-items:start;grid-template-columns:1.5fr 1fr}
    .ob-themes2{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;align-content:start}
    .ob-theme2{position:relative;display:flex;flex-direction:column;text-align:left;padding:0;border-radius:15px;overflow:hidden;border:1px solid rgba(214,199,168,.16);background:rgba(255,255,255,.02);cursor:pointer;transition:transform .5s cubic-bezier(.19,1,.22,1),border-color .35s,box-shadow .45s;font-family:inherit}
    .ob-theme2:hover{transform:translateY(-3px);border-color:rgba(214,199,168,.42)}
    .ob-theme2-prev{position:relative;aspect-ratio:16/11;overflow:hidden;background:#0c0b0a}
    .ob-theme2-prev img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top left;transition:transform .8s cubic-bezier(.19,1,.22,1)}
    .ob-theme2:hover .ob-theme2-prev img{transform:scale(1.045)}
    .ob-theme2-prev:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 60%,rgba(6,6,5,.32));pointer-events:none}
    .ob-theme2-meta{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:12px 14px 14px}
    .ob-theme2-meta b{font-size:14.5px;font-weight:600;letter-spacing:-.01em;color:#f4f3f1}
    .ob-theme2-sw{display:inline-flex;gap:5px}
    .ob-theme2-sw i{width:14px;height:14px;border-radius:50%;border:1px solid rgba(255,255,255,.42)}
    .ob-theme2 .ob-choice-check{position:absolute;top:11px;right:11px;z-index:3;width:24px;height:24px}
    .ob-theme2.on{border-color:rgba(214,199,168,.85);box-shadow:0 0 0 2px rgba(214,199,168,.55),0 16px 40px -16px rgba(214,199,168,.42)}
    .ob-theme2.on .ob-choice-check{opacity:1;transform:scale(1);background:#d6c7a8;color:#141311;border-color:#d6c7a8}
    /* живой предпросмотр справа */
    .ob-tprev-wrap{width:100%;display:flex;flex-direction:column;gap:16px}
    .ob-tprev-head{display:flex;align-items:center;gap:12px}
    .ob-tprev-head>span:first-child{font-size:18px;font-weight:600;letter-spacing:-.01em;color:#f4f3f1}
    .ob-tprev-pill{margin-left:auto;font-size:12.5px;font-weight:600;letter-spacing:.01em;color:#e7dcc4;padding:6px 15px;border-radius:999px;border:1px solid rgba(214,199,168,.32);background:rgba(214,199,168,.08)}
    .ob-tprev{width:100%;border-radius:18px;overflow:hidden;border:1px solid rgba(214,199,168,.18);background:rgba(255,255,255,.02);box-shadow:0 30px 70px -34px rgba(0,0,0,.7)}
    .ob-tprev-bar{display:flex;align-items:center;gap:7px;padding:11px 15px;background:rgba(8,8,8,.55);border-bottom:1px solid rgba(255,255,255,.06)}
    .ob-tprev-bar>i{width:10px;height:10px;border-radius:50%;background:rgba(214,199,168,.3)}
    .ob-tprev-bar>i:first-child{background:rgba(214,199,168,.55)}
    .ob-tprev-img{position:relative;aspect-ratio:16/10;overflow:hidden;background:#0c0b0a}
    .ob-tprev-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top left;animation:obTprevFade .5s cubic-bezier(.19,1,.22,1)}
    @keyframes obTprevFade{from{opacity:0;transform:scale(1.02)}to{opacity:1;transform:none}}
    .ob-tprev-cap{padding:14px 16px 16px;font-size:12.5px;line-height:1.5;color:#8b8a87;font-weight:300}
    /* ── форма (бренд/менеджер) ── */
    .ob-form{display:grid;gap:18px;max-width:620px}
    .ob-field{display:block}
    .ob-field>span{display:block;font-size:12px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:#6b6a68;margin-bottom:9px}
    .ob-field input[type=text]{width:100%;padding:13px 15px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.02);color:#f4f3f1;font-size:15px;font-family:inherit;transition:.3s cubic-bezier(.19,1,.22,1)}
    .ob-field input[type=text]:focus{outline:none;border-color:rgba(214,199,168,.5);background:rgba(255,255,255,.03)}
    .ob-field input[type=text]::placeholder{color:#6b6a68}
    .ob-row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
    .ob-logo{display:flex;align-items:center;gap:14px}
    .ob-logo-prev{width:120px;height:64px;border-radius:12px;border:1px dashed rgba(214,199,168,.28);display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.02);color:#6b6a68;font-size:12px;overflow:hidden}
    .ob-logo-prev img{max-width:100%;max-height:100%;object-fit:contain}
    .ob-logo-btn{font-size:13px;font-weight:500;color:#cfcdc8;border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:11px 18px;cursor:pointer;background:transparent;transition:.3s cubic-bezier(.19,1,.22,1)}
    .ob-logo-btn:hover{border-color:rgba(255,255,255,.4);color:#f4f3f1}
    .ob-logo-clear{font-size:12.5px;color:#6b6a68;background:none;border:none;cursor:pointer;text-decoration:underline}
    /* ── чипы (гео) ── */
    .ob-chips{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}
    .ob-chip{display:flex;align-items:center;gap:11px;text-align:left;font-size:14px;font-weight:400;color:#cfcdc8;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.13);border-radius:13px;padding:13px 15px;cursor:pointer;transition:.3s cubic-bezier(.19,1,.22,1);font-family:inherit}
    .ob-chip:hover{border-color:rgba(214,199,168,.4);background:rgba(214,199,168,.03)}
    .ob-chip.on{background:linear-gradient(180deg,#f3ecdd,#e6dcc4);border-color:#e6dcc4;color:#1a1712;font-weight:600}
    .ob-chip-ic{flex:0 0 auto;width:26px;height:26px;border-radius:50%;border:1px solid rgba(214,199,168,.4);display:flex;align-items:center;justify-content:center;color:#8a8272;transition:.3s}
    .ob-chip-plus{font-style:normal;font-weight:400;font-size:16px;line-height:1}
    .ob-chip-check{display:none;align-items:center;justify-content:center}
    .ob-chip-check svg{width:14px;height:14px}
    .ob-chip.on .ob-chip-ic{background:#1a1712;border-color:#1a1712;color:#e6dcc4}
    .ob-chip.on .ob-chip-plus{display:none}
    .ob-chip.on .ob-chip-check{display:flex}
    .ob-microsub{font-size:13px;color:#6b6a68;font-weight:300;margin-top:6px}
    /* S4 группы рынков + теги выбранного */
    .ob-geo-groups{display:flex;flex-direction:column;gap:20px}
    .ob-geo-h{font-size:12px;font-weight:500;letter-spacing:.04em;color:#cfcdc8;padding-bottom:11px;margin-bottom:13px;border-bottom:1px solid rgba(214,199,168,.14)}
    .ob-geo-sum{margin-top:20px;font-size:13px;color:#9e968b;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
    .ob-geo-sum b{color:#f0e4c8}
    .ob-geo-tags{display:flex;flex-wrap:wrap;gap:7px}
    .ob-geo-tag{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:#f0e4c8;background:rgba(201,162,90,.14);border:1px solid rgba(201,162,90,.4);border-radius:999px;padding:5px 11px;cursor:pointer}
    .ob-geo-tag i{font-style:normal;color:#c9a25a;font-size:14px}
    .ob-geo-tag:hover{background:rgba(201,162,90,.22)}
    /* Финал: 2 колонки (обложка бренда + сводка) + ссылка «Изменить» */
    .ob-fin-sub{font-size:16px;color:#9e968b;font-weight:300;margin:6px 0 24px}
    .ob-fin-cols{display:grid;grid-template-columns:1fr 1fr;gap:18px;max-width:840px;margin:0 auto;text-align:left;align-items:stretch}
    .ob-fin-cols .ob-plate{max-width:none;margin:0}
    .ob-fin-cols .ob-recap{grid-template-columns:1fr;max-width:none;margin:0;padding:8px 22px 20px;border:1px solid rgba(255,255,255,.1);border-radius:20px;background:rgba(24,21,17,.4);align-content:start}
    .ob-recap-h{font-family:'Cormorant',Georgia,serif;font-size:24px;font-weight:600;letter-spacing:-.01em;color:#f4f3f1;padding:14px 0 6px;text-align:left}
    .ob-plate-glyph{display:flex;align-items:center;justify-content:center;color:#e6dcc6}
    .ob-plate-glyph svg{width:28px;height:28px}
    .ob-fin-note{max-width:840px;margin:18px auto 0;font-size:12.5px;color:#8a8272;display:flex;gap:8px;align-items:flex-start;justify-content:center;text-align:left}
    .ob-fin-note svg{width:15px;height:15px;flex:0 0 auto;color:#c9a25a;margin-top:1px}
    .ob-fin-cta{margin:26px auto 0;padding:15px 34px}
    .ob-fin-change{display:block;margin:14px auto 0;background:none;border:none;color:#9e968b;font-size:12.5px;text-decoration:underline;cursor:pointer;font-family:inherit}
    @media(max-width:720px){.ob-fin-cols{grid-template-columns:1fr}}
    /* S3 светлая клиентская превью-карточка «Так увидит клиент» */
    .ob-rightcustom{width:100%;display:flex;flex-direction:column;align-items:center;gap:12px}
    .ob-cprev-lbl{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#8a8272}
    .ob-cprev{width:100%;max-width:380px;background:linear-gradient(180deg,#faf7f0,#efe9dd);border-radius:18px;padding:18px;box-shadow:0 30px 70px -30px rgba(0,0,0,.65);color:#1a1712}
    .ob-cprev-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}
    .ob-cprev-brand{display:flex;align-items:center;gap:10px;min-width:0}
    .ob-cprev-logo{flex:0 0 auto;width:38px;height:38px;border-radius:9px;background:#1a1712;color:#ead9b0;display:grid;place-items:center;font-family:'Cormorant',Georgia,serif;font-size:18px;font-weight:600;overflow:hidden}
    .ob-cprev-logo img{width:100%;height:100%;object-fit:contain}
    .ob-cprev-nm{min-width:0}
    .ob-cprev-nm b{display:block;font-family:'Cormorant',Georgia,serif;font-size:16px;font-weight:600;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ob-cprev-nm i{font-style:normal;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#8a7f6a}
    .ob-cprev-pill{flex:0 0 auto;display:inline-flex;align-items:center;gap:5px;font-size:10px;color:#8a7f6a;background:rgba(0,0,0,.05);border-radius:999px;padding:4px 9px}
    .ob-cprev-pill svg{width:11px;height:11px}
    .ob-cprev-photo{height:148px;border-radius:12px;background:linear-gradient(135deg,#cbb692,#8a7a5c);display:flex;align-items:flex-end;padding:10px;margin-bottom:12px}
    .ob-cprev-photo span{font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:#fff;background:rgba(0,0,0,.28);padding:4px 8px;border-radius:6px}
    .ob-cprev-h{font-family:'Cormorant',Georgia,serif;font-size:25px;font-weight:600;margin-bottom:13px}
    .ob-cprev-foot{display:flex;align-items:center;gap:10px;padding-top:12px;border-top:1px solid rgba(0,0,0,.08)}
    .ob-cprev-ava{flex:0 0 auto;width:34px;height:34px;border-radius:50%;background:#e3d8c2;color:#5a5040;display:grid;place-items:center;font-weight:600;font-size:14px}
    .ob-cprev-mg b{display:block;font-size:13px;font-weight:600}
    .ob-cprev-mg i{font-style:normal;font-size:11px;color:#8a7f6a}
    .ob-cprev-cts{display:flex;flex-direction:column;gap:3px;margin-top:9px;font-size:11.5px;color:#6a6152}
    /* S3 бренд: drag-drop загрузчик логотипа */
    .ob-logo2{display:flex;align-items:center;gap:0;border:1.5px dashed rgba(214,199,168,.3);border-radius:14px;padding:16px 18px;background:rgba(255,255,255,.015);transition:.3s cubic-bezier(.19,1,.22,1);position:relative}
    .ob-logo2:hover{border-color:rgba(214,199,168,.5);background:rgba(214,199,168,.03)}
    .ob-logo2-prev{flex:0 0 auto;width:78px;height:64px;border-radius:11px;display:flex;align-items:center;justify-content:center;background:#141311;color:#ead9b0;font-family:'Cormorant',Georgia,serif;font-size:28px;font-weight:600;overflow:hidden}
    .ob-logo2-prev img{max-width:100%;max-height:100%;object-fit:contain}
    .ob-logo2-div{flex:0 0 auto;width:1px;align-self:stretch;background:rgba(214,199,168,.16);margin:0 18px}
    .ob-logo2-drop{flex:1 1 auto;display:flex;align-items:center;gap:14px;cursor:pointer;min-width:0}
    .ob-logo2-ic{flex:0 0 auto;width:40px;height:40px;border-radius:11px;display:flex;align-items:center;justify-content:center;color:#d6c7a8;border:1px solid rgba(214,199,168,.22);background:rgba(214,199,168,.05)}
    .ob-logo2-ic svg{width:20px;height:20px}
    .ob-logo2-tx b{display:block;font-size:14px;font-weight:600;color:#f4f3f1}
    .ob-logo2-tx i{display:block;font-style:normal;font-size:12px;color:#8b8a87;font-weight:300;margin-top:3px;line-height:1.4}
    .ob-logo2-clear{position:absolute;top:10px;right:10px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);color:#a7a6a3;cursor:pointer}
    .ob-logo2-clear svg{width:14px;height:14px}
    .ob-logo2-clear:hover{color:#ff8a8a;border-color:rgba(255,138,138,.4)}
    .ob-formdiv{height:1px;background:rgba(214,199,168,.14);margin:2px 0}
    .ob-field-sub{margin:-4px 0 14px;font-size:13px;color:#8b8a87;font-weight:300}
    .ob-subfield{display:block}
    .ob-subfield>span{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b6a68;font-weight:500;margin-bottom:8px}
    .ob-subfield+.ob-row2,.ob-subfield+.ob-subfield{margin-top:14px}
    .ob-subfield input{width:100%;padding:13px 15px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.02);color:#f4f3f1;font-size:15px;font-family:inherit;outline:none;transition:.3s}
    .ob-subfield input:focus{border-color:rgba(214,199,168,.5);background:rgba(255,255,255,.03)}
    .ob-subfield input::placeholder{color:#6b6a68}
    .ob-row2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
    /* S3 бренд: богатое клиентское превью */
    .ob-cprev-lbl2{display:flex;align-items:center;gap:12px;margin-bottom:16px}
    .ob-cprev-lbl2>span:first-child{font-family:'Cormorant',Georgia,serif;font-size:24px;font-weight:600;letter-spacing:-.01em;color:#f4f3f1}
    .ob-cprev-eye{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:#e7dcc4;padding:6px 14px;border-radius:999px;border:1px solid rgba(214,199,168,.28);background:rgba(214,199,168,.06)}
    .ob-cprev-eye svg{width:14px;height:14px}
    .ob-cprev2{width:100%;background:linear-gradient(180deg,#faf7f0,#efe9dd);border-radius:20px;padding:20px;box-shadow:0 34px 80px -34px rgba(0,0,0,.7);color:#1a1712}
    .ob-cprev2-top{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-bottom:14px;border-bottom:1px solid rgba(0,0,0,.08);margin-bottom:14px}
    .ob-cprev2-brand{display:flex;align-items:center;gap:11px;min-width:0}
    .ob-cprev2-logo{flex:0 0 auto;width:42px;height:42px;border-radius:10px;background:#1a1712;color:#ead9b0;display:grid;place-items:center;font-family:'Cormorant',Georgia,serif;font-size:20px;font-weight:600;overflow:hidden}
    .ob-cprev2-logo img{width:100%;height:100%;object-fit:contain}
    .ob-cprev2-nm b{display:block;font-family:'Cormorant',Georgia,serif;font-size:19px;font-weight:600;line-height:1.05;letter-spacing:.02em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px}
    .ob-cprev2-nm i{font-style:normal;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#8a7f6a}
    .ob-cprev2-tag{flex:0 0 auto;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#8a7f6a;text-align:right;line-height:1.4;border-left:1px solid rgba(0,0,0,.12);padding-left:12px}
    .ob-cprev2-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:14px}
    .ob-cprev2-h{font-family:'Cormorant',Georgia,serif;font-size:30px;font-weight:600;line-height:1.02}
    .ob-cprev2-sub{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#8a7f6a;margin-top:4px}
    .ob-cprev2-side{flex:0 0 auto;font-size:8.5px;letter-spacing:.14em;text-transform:uppercase;color:#8a7f6a;text-align:right;line-height:1.7}
    .ob-cprev2-photo{position:relative;border-radius:13px;overflow:hidden;background-size:cover;background-position:center}
    .ob-cprev2-photo1{height:150px;background-image:url('/assets/prop-water.png?v=1');margin-bottom:11px}
    .ob-cprev2-cap{position:absolute;left:12px;bottom:12px}
    .ob-cprev2-cap b{display:block;font-family:'Cormorant',Georgia,serif;font-size:17px;font-weight:600;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.5)}
    .ob-cprev2-cap i{font-style:normal;font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.85);text-shadow:0 1px 4px rgba(0,0,0,.5)}
    .ob-cprev2-arr{position:absolute;right:12px;bottom:12px;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.92);color:#1a1712;display:grid;place-items:center;font-size:14px}
    .ob-cprev2-row{display:grid;grid-template-columns:1.35fr 1fr;gap:11px;margin-bottom:15px}
    .ob-cprev2-photo2{height:96px;background-image:url('/assets/prop-interior.png?v=1')}
    .ob-cprev2-mini{position:relative;border-radius:13px;background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.06);padding:13px}
    .ob-cprev2-mini b{display:block;font-family:'Cormorant',Georgia,serif;font-size:17px;font-weight:600;line-height:1.05}
    .ob-cprev2-mini i{font-style:normal;font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:#8a7f6a}
    .ob-cprev2-mini .ob-cprev2-arr{background:#1a1712;color:#ead9b0;width:24px;height:24px;font-size:13px}
    .ob-cprev2-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:14px;border-top:1px solid rgba(0,0,0,.08)}
    .ob-cprev2-mgr{display:flex;align-items:center;gap:10px;min-width:0}
    .ob-cprev2-ava{flex:0 0 auto;width:34px;height:34px;border-radius:50%;background:#e3d8c2;color:#5a5040;display:grid;place-items:center;font-weight:600;font-size:14px}
    .ob-cprev2-mgtx b{display:block;font-size:13px;font-weight:600}
    .ob-cprev2-mgtx i{font-style:normal;font-size:10.5px;color:#8a7f6a}
    .ob-cprev2-cts{display:flex;flex-direction:column;gap:5px;text-align:right}
    .ob-cprev2-cts span{display:inline-flex;align-items:center;justify-content:flex-end;gap:6px;font-size:11px;color:#5a5244}
    .ob-cprev2-cts b{font-weight:500}
    .ob-cprev2-cts svg{width:12px;height:12px;color:#8a7f6a}
    .ob-cprev2-note{margin-top:14px;text-align:center;font-size:11.5px;color:#6b6a68;font-weight:300}
    /* ── тон общения ── */
    .ob-tones{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
    .ob-tone{position:relative;text-align:left;padding:22px;border-radius:16px;border:1px solid rgba(214,199,168,.14);background:rgba(255,255,255,.02);color:#f4f3f1;cursor:pointer;transition:.4s cubic-bezier(.19,1,.22,1)}
    .ob-tone:hover{transform:translateY(-2px);border-color:rgba(214,199,168,.3)}
    .ob-tone.on{border-color:rgba(214,199,168,.5);background:rgba(214,199,168,.06)}
    .ob-tone-name{font-family:'Cormorant',Georgia,serif;font-size:20px;font-weight:500;margin-bottom:10px;color:#f4f3f1}
    .ob-tone-ex{font-size:13px;color:#a7a6a3;font-weight:300;line-height:1.55;font-style:italic}
    /* ── S6 тон: полноширинные строки-опции + автопилот-панель + WhatsApp-превью ── */
    .ob-tonerows{display:flex;flex-direction:column;gap:12px}
    .ob-tonerow{position:relative;display:flex;align-items:center;gap:16px;text-align:left;padding:18px 20px;border-radius:16px;border:1px solid rgba(214,199,168,.15);background:rgba(255,255,255,.02);color:#f4f3f1;cursor:pointer;transition:transform .4s cubic-bezier(.19,1,.22,1),border-color .35s,background .35s;font-family:inherit}
    .ob-tonerow:hover{transform:translateY(-2px);border-color:rgba(214,199,168,.34)}
    .ob-tonerow.on{border-color:rgba(214,199,168,.62);background:linear-gradient(180deg,rgba(214,199,168,.09),rgba(214,199,168,.03))}
    .ob-tonerow-ic{flex:0 0 auto;width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#d6c7a8;border:1px solid rgba(214,199,168,.22);background:rgba(214,199,168,.05)}
    .ob-tonerow-ic svg{width:22px;height:22px}
    .ob-tonerow-tx{flex:1 1 auto;min-width:0}
    .ob-tonerow-tx b{display:block;font-family:'Cormorant',Georgia,serif;font-size:21px;font-weight:600;letter-spacing:-.01em;color:#f4f3f1;line-height:1.15}
    .ob-tonerow-tx i{display:block;font-style:normal;font-size:13px;color:#8b8a87;font-weight:300;margin-top:3px}
    .ob-tonerow-radio{flex:0 0 auto;width:24px;height:24px;border-radius:50%;border:1.5px solid rgba(214,199,168,.4);display:flex;align-items:center;justify-content:center;color:transparent;transition:.3s cubic-bezier(.19,1,.22,1)}
    .ob-tonerow-radio svg{width:14px;height:14px}
    .ob-tonerow.on .ob-tonerow-radio{background:#d6c7a8;border-color:#d6c7a8;color:#141311}
    .ob-tonerow.on .ob-tonerow-ic{color:#e7dcc4;border-color:rgba(214,199,168,.45);background:rgba(214,199,168,.1)}
    .ob-autopanel{margin-top:16px;padding:20px;border-radius:16px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.02)}
    .ob-autopanel-t{font-size:15px;font-weight:600;color:#f4f3f1;margin-bottom:14px}
    .ob-toggle-bare{margin:0;padding:0;border:0;background:none;max-width:none;gap:12px}
    .ob-note-flat{display:flex;align-items:center;gap:2px;margin-top:16px}
    /* WhatsApp-превью справа */
    .ob-chatprev{width:100%;display:flex;flex-direction:column}
    .ob-chatprev-head{display:flex;align-items:flex-start;gap:12px;margin-bottom:16px}
    .ob-chatprev-ht b{display:block;font-size:18px;font-weight:600;letter-spacing:-.01em;color:#f4f3f1}
    .ob-chatprev-ht i{display:block;font-style:normal;font-size:13px;color:#8b8a87;font-weight:300;margin-top:2px}
    .ob-wa-pill{margin-left:auto;display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:#e9f7ee;padding:7px 14px;border-radius:999px;background:rgba(37,168,84,.16);border:1px solid rgba(37,168,84,.4)}
    .ob-wa-pill svg{width:16px;height:16px;color:#25d366}
    .ob-chat{position:relative;border-radius:18px;padding:22px 20px;border:1px solid rgba(214,199,168,.16);background:radial-gradient(120% 120% at 80% 0,rgba(214,199,168,.05),transparent 60%),rgba(10,10,9,.6);display:flex;flex-direction:column;gap:20px;overflow:hidden}
    .ob-cb-who{display:block;font-size:11px;font-weight:600;letter-spacing:.02em;color:#8b8a87;margin-bottom:6px}
    .ob-cb-ai{color:#c9a86a}
    .ob-cb-in{max-width:82%;margin-left:6%}
    .ob-cb{position:relative;border-radius:16px;padding:12px 15px 20px;font-size:13.5px;line-height:1.5}
    .ob-cb p{margin:0;padding-right:34px}
    .ob-cb-t{position:absolute;right:12px;bottom:8px;font-size:10.5px;opacity:.55}
    .ob-cb-dark{background:rgba(255,255,255,.06);color:#e7e6e3;border:1px solid rgba(255,255,255,.05);border-top-left-radius:5px}
    .ob-cb-out{display:flex;flex-direction:column}
    .ob-cb-out-row{display:flex;align-items:flex-end;gap:10px}
    .ob-cb-ava{flex:0 0 auto;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#141311;background:linear-gradient(135deg,#e6d4a8,#c9a86a);box-shadow:0 6px 16px -6px rgba(201,168,106,.6)}
    .ob-cb-ava svg{width:19px;height:19px}
    .ob-cb-cream{background:linear-gradient(180deg,#f4ecdc,#eadfc6);color:#2a2418;border-top-left-radius:5px;max-width:88%}
    .ob-chat-foot{margin-top:14px;font-size:12px;color:#6b6a68;font-weight:300}
    /* ambient декор в углу панели */
    .ob-ambient{position:absolute;top:-40px;right:-30px;width:340px;max-width:38%;pointer-events:none;z-index:0;opacity:.9;-webkit-mask-image:radial-gradient(ellipse 70% 70% at 60% 40%,#000 45%,transparent 78%);mask-image:radial-gradient(ellipse 70% 70% at 60% 40%,#000 45%,transparent 78%);animation:obAmbient 9s ease-in-out infinite}
    .ob-ambient img{width:100%;display:block}
    @keyframes obAmbient{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(10px) rotate(-1.5deg)}}
    .ob-panel-split>.ob-body,.ob-panel-split>.ob-heroside,.ob-panel-split>.ob-rightcustom{position:relative;z-index:1}
    .ob-toggle{display:flex;align-items:center;gap:14px;margin-top:22px;cursor:pointer;padding:16px 18px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.02);max-width:560px}
    .ob-toggle input{display:none}
    .ob-tg{flex:0 0 46px;width:46px;height:27px;border-radius:999px;background:rgba(255,255,255,.14);position:relative;transition:.3s cubic-bezier(.19,1,.22,1)}
    .ob-tg:before{content:"";position:absolute;top:3px;left:3px;width:21px;height:21px;border-radius:50%;background:#f4f3f1;transition:.3s cubic-bezier(.19,1,.22,1)}
    .ob-toggle input:checked+.ob-tg{background:#c9a86a}
    .ob-toggle input:checked+.ob-tg:before{transform:translateX(19px);background:#0a0a0a}
    .ob-toggle b{display:block;font-size:14.5px;font-weight:600;color:#f4f3f1}
    .ob-toggle small{display:block;font-size:12.5px;color:#6b6a68;font-weight:300;margin-top:2px}
    /* ── гайд-шаги (WhatsApp/цепочки/база/команда) ── */
    .ob-guide-l{list-style:none;padding:0;margin:0 0 26px;display:grid;gap:12px;max-width:600px}
    .ob-guide-l li{display:flex;gap:13px;align-items:flex-start;font-size:15px;color:#a7a6a3;font-weight:300}
    .ob-guide-l li i{flex:0 0 24px;height:24px;border-radius:50%;border:1px solid rgba(214,199,168,.3);color:#d6c7a8;display:flex;align-items:center;justify-content:center;font-style:normal;margin-top:1px}
    .ob-guide-l li i svg{width:13px;height:13px}
    .ob-guide-cta{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
    .ob-do{font-size:14px;font-weight:500;letter-spacing:.04em;color:#0a0a0a;background:#f4f3f1;border:1px solid transparent;border-radius:999px;padding:15px 28px;cursor:pointer;transition:transform .4s cubic-bezier(.19,1,.22,1)}
    .ob-do:hover{transform:translateY(-2px)}
    .ob-later{font-size:12.5px;color:#6b6a68;font-weight:300}
    /* ── скрин интерфейса рядом с шагом ── */
    .ob-shot{border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.11);background:#0c0b0a}
    .ob-shot-bar{display:flex;gap:6px;padding:11px 14px;background:rgba(255,255,255,.02);border-bottom:1px solid rgba(255,255,255,.08)}
    .ob-shot-bar i{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.18)}
    .ob-shot img{width:100%;display:block}
    @keyframes obFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
    /* ── финал + рекап ── */
    .ob-done-mark{width:84px;height:84px;border-radius:50%;border:1px solid rgba(214,199,168,.5);background:rgba(214,199,168,.06);color:#d6c7a8;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;animation:obPop .7s cubic-bezier(.19,1,.22,1)}
    .ob-done-mark svg{width:40px;height:40px}
    @keyframes obPop{0%{transform:scale(.4);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
    .ob-recap{display:grid;grid-template-columns:1fr 1fr;gap:2px 26px;max-width:560px;margin:30px auto 0;text-align:left}
    .ob-recap-row{display:flex;justify-content:space-between;gap:14px;padding:13px 0;border-bottom:1px solid rgba(255,255,255,.08)}
    .ob-recap-row span{font-size:13px;color:#6b6a68;font-weight:300}
    .ob-recap-row b{font-size:14px;color:#f4f3f1;font-weight:600}
    /* ── персональная обложка бренда на финале ── */
    .ob-plate{position:relative;max-width:560px;margin:28px auto 6px;border-radius:20px;overflow:hidden;border:1px solid rgba(214,199,168,.34);background:radial-gradient(120% 130% at 82% 42%,rgba(35,28,15,.9),rgba(10,9,7,.96));box-shadow:0 30px 70px -30px rgba(0,0,0,.7),0 0 0 1px rgba(214,199,168,.06);text-align:left;animation:obPlate .9s cubic-bezier(.19,1,.22,1) both .15s}
    @keyframes obPlate{from{opacity:0;transform:translateY(26px) scale(.97)}to{opacity:1;transform:none}}
    .ob-plate-art{position:absolute;inset:0;overflow:hidden;pointer-events:none}
    .ob-plate-art i{position:absolute;top:50%;right:-4%;border:1px solid rgba(214,199,168,.16);border-radius:50%;transform:translateY(-50%);animation:obRing 9s ease-in-out infinite}
    .ob-plate-art i:nth-child(1){width:230px;height:230px;margin:-115px -115px 0 0}
    .ob-plate-art i:nth-child(2){width:340px;height:340px;margin:-170px -170px 0 0;opacity:.6;animation-delay:.6s}
    .ob-plate-art i:nth-child(3){width:460px;height:460px;margin:-230px -230px 0 0;opacity:.35;animation-delay:1.2s}
    @keyframes obRing{0%,100%{transform:translateY(-50%) scale(1)}50%{transform:translateY(-50%) scale(1.04)}}
    .ob-plate-star{position:absolute;top:50%;right:12%;transform:translateY(-50%);font-family:'Cormorant',Georgia,serif;font-size:96px;color:rgba(214,199,168,.9);text-shadow:0 0 40px rgba(214,199,168,.5);line-height:1;animation:obEmblem 5s ease-in-out infinite}
    .ob-plate-body{position:relative;z-index:1;padding:30px 32px}
    .ob-plate-logo{width:56px;height:56px;border-radius:14px;overflow:hidden;background:rgba(214,199,168,.08);border:1px solid rgba(214,199,168,.28);display:flex;align-items:center;justify-content:center;margin-bottom:18px}
    .ob-plate-logo img{max-width:82%;max-height:82%;object-fit:contain}
    .ob-plate-mono{font-family:'Cormorant',Georgia,serif;font-size:30px;font-weight:500;color:#e6dcc6}
    .ob-plate-wm{font-family:'Cormorant',Georgia,serif;font-size:13px;letter-spacing:.22em;color:rgba(214,199,168,.7);margin-bottom:6px}
    .ob-plate-name{font-family:'Cormorant',Georgia,serif;font-size:clamp(30px,4.4vw,44px);font-weight:500;letter-spacing:-.01em;line-height:1.06;color:#f6f2ea;max-width:82%}
    .ob-plate-sub{font-size:12px;letter-spacing:.04em;color:#8f8b80;margin-top:8px}
    .ob-plate-geos{display:flex;flex-wrap:wrap;gap:7px;margin-top:16px}
    .ob-plate-geo{font-size:12px;color:#d6c7a8;border:1px solid rgba(214,199,168,.28);border-radius:999px;padding:5px 12px;background:rgba(214,199,168,.05)}
    .ob-finish .ob-recap{margin-top:24px}
    /* ── витрина возможностей ── */
    .ob-panel-wide{max-width:1160px}
    .ob-caps{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
    .ob-cap{text-align:left;padding:24px 22px 22px;border-radius:18px;border:1px solid rgba(214,199,168,.14);background:rgba(255,255,255,.02);transition:.4s cubic-bezier(.19,1,.22,1);animation:obCard .6s cubic-bezier(.19,1,.22,1) both}
    .ob-cap:nth-child(2){animation-delay:.05s}.ob-cap:nth-child(3){animation-delay:.1s}.ob-cap:nth-child(4){animation-delay:.15s}.ob-cap:nth-child(5){animation-delay:.2s}.ob-cap:nth-child(6){animation-delay:.25s}.ob-cap:nth-child(7){animation-delay:.3s}.ob-cap:nth-child(8){animation-delay:.35s}
    .ob-cap:hover{transform:translateY(-3px);border-color:rgba(214,199,168,.34);background:rgba(214,199,168,.03)}
    .ob-cap-ic{width:58px;height:58px;border-radius:16px;border:1px solid rgba(214,199,168,.3);background:radial-gradient(120% 120% at 30% 20%,rgba(214,199,168,.18),rgba(214,199,168,.04));color:#e6d4a8;display:flex;align-items:center;justify-content:center;margin-bottom:18px;box-shadow:0 12px 30px -14px rgba(201,168,106,.5),inset 0 1px 0 rgba(255,255,255,.12)}
    .ob-cap:hover .ob-cap-ic{box-shadow:0 16px 36px -12px rgba(201,168,106,.75),inset 0 1px 0 rgba(255,255,255,.18)}
    .ob-cap-ic svg{width:27px;height:27px}
    .ob-cap-t{font-family:'Cormorant',Georgia,serif;font-size:21px;font-weight:600;letter-spacing:-.01em;color:#f4f3f1;margin-bottom:7px}
    .ob-cap-d{font-size:12.5px;color:#8b8a87;font-weight:300;line-height:1.5}
    .ob-caps-foot{text-align:center;margin-top:22px;font-size:13px;color:#6b6a68;font-weight:300}
    /* ── низ: прогресс + кнопки ── */
    .ob-foot{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:18px 30px 26px;position:relative;z-index:5}
    /* индикатор 1:1 с рефом: лейбл (sentence-case, серый) СЛЕВА от пипов, в одну строку */
    .ob-prog{display:flex;align-items:center;gap:16px}
    .ob-prog-lbl{font-size:11px;font-weight:400;letter-spacing:.04em;text-transform:none;color:#8a8a8a;white-space:nowrap}
    .ob-dots{display:flex;gap:6px;align-items:center}
    /* numbered: 8 одинаковых тире, прогресс ЦВЕТОМ (не длиной) */
    .ob-dots i{width:20px;height:4px;border-radius:3px;background:#3a3a3a;transition:.45s cubic-bezier(.19,1,.22,1)}
    .ob-dots i.done{background:#b89a5e}
    .ob-dots i.on{background:#f0dca6}
    /* welcome: 1 золотая капсула + серые точки */
    .ob-prog.ob-prog-dots .ob-dots i{width:6px;height:6px;border-radius:50%;background:#555}
    .ob-prog.ob-prog-dots .ob-dots i.cap{width:20px;height:5px;border-radius:4px;background:#e6c888}
    .ob-actions{display:flex;align-items:center;gap:12px}
    .ob-btn{font-size:14px;font-weight:500;letter-spacing:.04em;border-radius:999px;padding:14px 26px;cursor:pointer;border:1px solid transparent;transition:.4s cubic-bezier(.19,1,.22,1);font-family:inherit}
    .ob-ghost{background:transparent;border-color:rgba(255,255,255,.16);color:#cfcdc8}
    .ob-ghost:hover{border-color:rgba(255,255,255,.4);color:#f4f3f1}
    .ob-skip{color:#6b6a68;border-color:rgba(255,255,255,.1)}
    .ob-skip:hover{color:#a7a6a3}
    .ob-primary{background:#f3ecdd;color:#1a1712;border-color:transparent;box-shadow:0 12px 34px -14px rgba(243,236,221,.55)}
    .ob-primary:hover{transform:translateY(-2px);box-shadow:0 16px 40px -14px rgba(243,236,221,.7)}
    .ob-primary.dis{opacity:.35;pointer-events:none}
    .ob-btn:active,.ob-do:active{transform:scale(.98)}
    /* ── тариф ── */
    .ob-price{display:grid;grid-template-columns:1.12fr .88fr;gap:24px;align-items:stretch;max-width:900px}
    .ob-price-card{position:relative;padding:28px;border-radius:20px;border:1px solid rgba(214,199,168,.22);background:linear-gradient(180deg,rgba(255,255,255,.03),transparent)}
    .ob-price-beta{display:inline-block;font-size:11px;font-weight:500;letter-spacing:.24em;text-transform:uppercase;color:#6b6a68;border:1px solid rgba(214,199,168,.28);border-radius:999px;padding:6px 13px;margin-bottom:16px}
    .ob-price-name{font-family:'Cormorant',Georgia,serif;font-size:34px;font-weight:600;letter-spacing:-.01em;color:#f4f3f1;line-height:1.05;margin-top:2px}
    .ob-price-val{display:flex;align-items:baseline;gap:9px;margin:8px 0 2px}
    .ob-price-val s{font-family:'Cormorant',Georgia,serif;font-size:28px;color:#6b6a68}
    .ob-price-val b{font-family:'Cormorant',Georgia,serif;font-size:56px;font-weight:400;letter-spacing:-.01em;color:#f4f3f1;line-height:1}
    .ob-price-val span{font-size:16px;color:#6b6a68;font-weight:300}
    .ob-price-seats{font-size:13px;color:#a7a6a3;font-weight:300;margin-bottom:18px}
    .ob-price-solo{grid-template-columns:1fr;max-width:540px}
    .ob-price-beta{white-space:nowrap}
    .ob-price-break{margin:2px 0 18px;padding:13px 15px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.02);display:flex;flex-direction:column;gap:9px}
    .ob-pbr{display:flex;justify-content:space-between;align-items:baseline;font-size:13.5px;color:#a7a6a3}
    .ob-pbr b{color:#e9e3d8;font-weight:600;font-variant-numeric:tabular-nums}
    .ob-pbr i{font-style:normal;color:#e9e3d8}
    .ob-pbr-tot{padding-top:9px;border-top:1px solid rgba(255,255,255,.08);color:#f4efe7}
    .ob-pbr-tot b{font-size:16px;color:#f4efe7}
    .ob-price-list{list-style:none;padding:0;margin:0 0 22px;display:grid;gap:11px}
    .ob-price-list li{display:flex;gap:11px;align-items:flex-start;font-size:14px;color:#a7a6a3;font-weight:300;line-height:1.5}
    .ob-price-list li svg{width:15px;height:15px;flex:0 0 15px;color:#d6c7a8;margin-top:2px}
    .ob-do-pay{width:100%;justify-content:center;display:flex;align-items:center}
    .ob-price-rr{display:flex;align-items:center;gap:7px;font-size:12px;color:#6b6a68;font-weight:300;margin-top:14px;justify-content:center}
    .ob-price-rr svg{width:13px;height:13px;flex:0 0 13px;color:#d6c7a8}
    /* пилюля «Необязательный шаг» под подзаголовком */
    .ob-pill{display:inline-block;margin-top:16px;padding:7px 16px;border-radius:999px;border:1px solid rgba(214,199,168,.28);background:rgba(214,199,168,.06);color:#e7dcc4;font-size:13px;font-weight:500}
    /* S5 команда: панель «Брокеры» с карточкой брокера */
    .ob-teampanel{border-radius:20px;border:1px solid rgba(214,199,168,.16);background:rgba(255,255,255,.02);padding:24px}
    .ob-teampanel-h b{display:block;font-family:'Cormorant',Georgia,serif;font-size:26px;font-weight:600;letter-spacing:-.01em;color:#f4f3f1}
    .ob-teampanel-h i{display:block;font-style:normal;font-size:13.5px;color:#8b8a87;font-weight:300;margin-top:2px}
    .ob-team{display:flex;flex-direction:column;gap:12px;margin-top:18px}
    .ob-brk{border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(255,255,255,.015);padding:16px 16px 18px}
    .ob-brk-head{display:flex;align-items:center;gap:10px;margin-bottom:14px}
    .ob-brk-ava{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#d6c7a8;border:1px solid rgba(214,199,168,.22);background:rgba(214,199,168,.05)}
    .ob-brk-ava svg{width:17px;height:17px}
    .ob-brk-head b{flex:1 1 auto;font-size:14.5px;font-weight:600;color:#f4f3f1}
    .ob-brk-field{display:block}
    .ob-brk-field>span{display:block;font-size:12px;color:#8b8a87;font-weight:400;margin-bottom:6px}
    .ob-brk-field+.ob-brk-field,.ob-brk-field+.ob-brk-row2,.ob-brk-row2{margin-top:12px}
    .ob-brk-row2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
    .ob-brk .ob-bk{width:100%;padding:11px 13px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(255,255,255,.03);color:#f4f3f1;font-size:14px;font-family:inherit;outline:none;transition:.25s}
    .ob-brk .ob-bk:focus{border-color:#c9a86a;background:rgba(255,255,255,.05)}
    .ob-brk .ob-bk-del{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.1);border-radius:9px;background:rgba(255,255,255,.03);color:#a7a6a3;cursor:pointer;transition:.25s}
    .ob-brk .ob-bk-del svg{width:16px;height:16px}
    .ob-brk .ob-bk-del:hover{color:#ff8a8a;border-color:rgba(255,138,138,.4)}
    .ob-addbrk{display:block;margin:16px 0 0;width:100%;padding:14px;border:1px dashed rgba(201,168,106,.42);border-radius:12px;background:transparent;color:#c9a86a;font-size:14px;font-weight:600;cursor:pointer;transition:.25s}
    .ob-addbrk:hover{background:rgba(201,168,106,.07);border-color:rgba(201,168,106,.6)}
    .ob-teampanel-foot{display:flex;align-items:center;gap:8px;margin-top:16px;font-size:12.5px;color:#6b6a68;font-weight:300}
    .ob-teampanel-foot svg{width:15px;height:15px;flex:0 0 auto}
    @media (max-width:560px){ .ob-brk-row2{grid-template-columns:1fr} .ob-row2{grid-template-columns:1fr} }
    .ob-seats-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:10px 0 4px;font-size:13px;color:#a7a6a3}
    .ob-stepper{display:inline-flex;align-items:center;gap:12px}
    .ob-stepper button{width:32px;height:32px;border-radius:9px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:#f4f3f1;font-size:18px;cursor:pointer;line-height:1}
    .ob-stepper button:hover{border-color:#c9a86a;color:#c9a86a}
    .ob-stepper b{font-family:'Cormorant',Georgia,serif;font-size:22px;font-weight:400;min-width:24px;text-align:center;color:#f4f3f1}
    .ob-price-side{display:flex;flex-direction:column;gap:16px;justify-content:center}
    .ob-price-badge{text-align:center;padding:24px;border-radius:18px;background:rgba(255,255,255,.02);border:1px solid rgba(214,199,168,.18);font-family:'Cormorant',Georgia,serif;font-weight:400;font-size:56px;letter-spacing:-.01em;color:#f4f3f1;line-height:.9}
    .ob-price-badge span{display:block;font-family:'Manrope',system-ui,sans-serif;font-size:13px;font-weight:300;color:#6b6a68;letter-spacing:.04em;margin-top:10px;line-height:1.3}
    .ob-price-why{padding:20px;border-radius:16px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.015)}
    .ob-price-why b{display:block;font-size:14.5px;font-weight:600;margin-bottom:7px;color:#f4f3f1}
    .ob-price-why span{font-size:13px;color:#a7a6a3;font-weight:300;line-height:1.55}
    /* ── зум-превью стиля ── */
    .ob-zoom{position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .3s ease;background:rgba(6,6,5,.6);backdrop-filter:blur(4px)}
    .ob-zoom.on{opacity:1}
    .ob-zoom-card{position:relative;width:min(80vw,1180px);aspect-ratio:16/9.6;max-height:82vh;border-radius:18px;overflow:hidden;border:1px solid rgba(214,199,168,.28);transform:scale(.92) translateY(10px);transition:transform .4s cubic-bezier(.19,1,.22,1)}
    .ob-zoom.on .ob-zoom-card{transform:none}
    .ob-zoom-card img{width:100%;height:100%;object-fit:cover;object-position:top left;display:block}
    .ob-zoom-lbl{position:absolute;left:0;right:0;bottom:0;padding:16px 22px;font-size:15px;font-weight:500;color:#f4f3f1;background:linear-gradient(transparent,rgba(6,6,5,.85))}
    /* ── каскад появления ── */
    .ob-panel .ob-body>*{animation:obUp .7s cubic-bezier(.19,1,.22,1) both}
    .ob-panel .ob-body>*:nth-child(1){animation-delay:.04s}
    .ob-panel .ob-body>*:nth-child(2){animation-delay:.1s}
    .ob-panel .ob-body>*:nth-child(3){animation-delay:.16s}
    .ob-panel .ob-body>*:nth-child(4){animation-delay:.22s}
    .ob-center>*{animation:obUp .7s cubic-bezier(.19,1,.22,1) both}
    .ob-center>*:nth-child(2){animation-delay:.08s}.ob-center>*:nth-child(3){animation-delay:.16s}.ob-center>*:nth-child(4){animation-delay:.24s}.ob-center>*:nth-child(5){animation-delay:.32s}
    .ob-panel .ob-shot{animation:obUp .8s cubic-bezier(.19,1,.22,1) both .14s}
    @keyframes obUp{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
    .ob-choices .ob-choice,.ob-themes .ob-theme,.ob-tones .ob-tone,.ob-chips .ob-chip{animation:obCard .6s cubic-bezier(.19,1,.22,1) both}
    .ob-choice:nth-child(2),.ob-tone:nth-child(2){animation-delay:.08s}.ob-tone:nth-child(3){animation-delay:.16s}
    .ob-theme:nth-child(2){animation-delay:.05s}.ob-theme:nth-child(3){animation-delay:.1s}.ob-theme:nth-child(4){animation-delay:.15s}.ob-theme:nth-child(5){animation-delay:.2s}.ob-theme:nth-child(6){animation-delay:.25s}
    @keyframes obCard{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
    @media(max-width:820px){
      .ob-panel-split{grid-template-columns:1fr}.ob-shot{display:none}
      .ob-choices{grid-template-columns:1fr}.ob-themes{grid-template-columns:1fr 1fr}.ob-themes2{grid-template-columns:1fr 1fr}.ob-tones{grid-template-columns:1fr}.ob-caps{grid-template-columns:1fr 1fr}
      .ob-panel-split-top{grid-template-columns:1fr}
      .ob-row3{grid-template-columns:1fr}
      .ob-stage{padding:26px 16px 8px}.ob-foot{padding:14px 16px 20px}
      .ob-actions{flex:1;justify-content:flex-end}
      .ob-price{grid-template-columns:1fr}.ob-price-side{flex-direction:row}.ob-price-badge{flex:1}.ob-zoom-card{width:94vw}
    }
    @media(prefers-reduced-motion:reduce){.ob-panel,.ob-panel .ob-body>*,.ob-center>*,.ob-shot,.ob-choice,.ob-theme,.ob-tone,.ob-chip,.ob-done-mark{animation:none!important}}
    `;
    const s = document.createElement('style'); s.id = 'ob-style'; s.textContent = css; document.head.appendChild(s);
  }

  // ============================================================
  //  Золотой партикл-фон (2D canvas): дрейфующие золотые искры,
  //  тонкие концентрические кольца справа (эхо ✦) + свечение за курсором.
  //  В связке с золотыми обложками писем; надёжнее WebGL.
  // ============================================================
  let _raf = 0, _mouse = { x: .5, y: .5, tx: .5, ty: .5 };
  function startShader(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
    let W = 0, H = 0; const dpr = Math.min(devicePixelRatio || 1, 2);
    function resize() { W = innerWidth; H = innerHeight; canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    resize(); canvas._resize = resize; addEventListener('resize', resize);
    const N = Math.min(80, Math.round(W * H / 26000)); const P = [];
    for (let i = 0; i < N; i++) P.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.7 + .35, vx: (Math.random() - .5) * .10, vy: -(Math.random() * .16 + .03), a: Math.random() * .5 + .12, tw: Math.random() * 6.28, ts: Math.random() * .02 + .008 });
    const start = performance.now();
    function loop() {
      _mouse.x += (_mouse.tx - _mouse.x) * .05; _mouse.y += (_mouse.ty - _mouse.y) * .05;
      const t = (performance.now() - start) / 1000;
      ctx.clearRect(0, 0, W, H);
      /* тонкие золотые концентрические кольца — центр справа-по-центру (как эмблема писем) */
      const cx = W * 0.78, cy = H * 0.46;
      ctx.lineWidth = 1;
      for (let k = 0; k < 7; k++) { const rr = 60 + k * 78 + Math.sin(t * .5 + k) * 6; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.2832); ctx.strokeStyle = 'rgba(201,168,106,' + (0.05 - k * 0.005) + ')'; ctx.stroke(); }
      /* дрейфующие золотые искры */
      for (const p of P) {
        if (!reduce) { p.x += p.vx; p.y += p.vy; p.tw += p.ts; }
        if (p.y < -12) { p.y = H + 12; p.x = Math.random() * W; }
        if (p.x < -12) p.x = W + 12; else if (p.x > W + 12) p.x = -12;
        const tw = Math.sin(p.tw) * .5 + .5;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832);
        ctx.fillStyle = 'rgba(214,199,168,' + (p.a * tw * .85) + ')'; ctx.fill();
      }
      /* мягкое золотое свечение за курсором */
      const mx = _mouse.x * W, my = (1 - _mouse.y) * H;
      const g = ctx.createRadialGradient(mx, my, 0, mx, my, 300);
      g.addColorStop(0, 'rgba(201,168,106,.10)'); g.addColorStop(1, 'rgba(201,168,106,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      _raf = requestAnimationFrame(loop);
    }
    loop();
  }
  function stopShader() { if (_raf) cancelAnimationFrame(_raf); _raf = 0; }

  // ---------- переход между шагами: мягкая вспышка шейдера (без дешёвых видео) ----------
  function pulseShader() {
    if (!root) return;
    root.classList.add('ob-pulse');
    clearTimeout(pulseShader._t); pulseShader._t = setTimeout(() => { root && root.classList.remove('ob-pulse'); }, 420);
  }

  // ---------- авто-открытие на первом запуске (владелец + не пройдено) ----------
  let _autoShown = false;
  function maybeAuto() {
    if (_autoShown || root) return true;
    const st = (B().state) || null;
    if (!st || !st.me || !st.settings || !st.settings.agency) return false;
    const isOwner = st.me.role === 'owner' || st.me.role === 'master';
    const forced = location.hash === '#setup';   /* прямая ссылка на церемонию — открыть даже у «пройденных» */
    if (isOwner && (forced || !st.settings.agency.onboarded)) { _autoShown = true; if (forced) history.replaceState(null, '', location.pathname); setTimeout(() => open({ auto: true }), forced ? 200 : 400); return true; }
    return false;
  }
  // самополлинг — на случай, если app.js вызвал maybeAuto раньше нашей загрузки
  (function pollAuto(n) { if (_autoShown || root) return; if (maybeAuto()) return; if (n > 0) setTimeout(() => pollAuto(n - 1), 350); })(16);

  // ---------- публичный API + триггеры ----------
  window.Onboard = { open, close, maybeAuto };
  addEventListener('hashchange', () => { if (location.hash === '#setup') { history.replaceState(null, '', location.pathname); open(); } });
  document.addEventListener('click', (e) => { const t = e.target.closest('[data-onboard]'); if (t) { e.preventDefault(); open(); } });
})();
