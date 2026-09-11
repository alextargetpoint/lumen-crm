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
  };

  // ---------- данные ----------
  const THEMES = [
    { key: 'light',   name: 'Кобальт',        desc: 'Фирменный синий, мягкие тени — базовый вид Lumen.', vid: 'skyline-cobalt',   sw: ['#2563EB', '#F4F7FB', '#111827'] },
    { key: 'emerald', name: 'Lumen Glass',    desc: 'Атмосферное стекло, premium-OS, глубина.',          vid: 'skyline-glass',    sw: ['#397BFF', '#EEF5FF', '#0A1833'] },
    { key: 'dark',    name: 'Ночь',           desc: 'Тёмный кобальт — для работы вечером и премиум-подачи.', vid: 'skyline-night', sw: ['#5B84FF', '#0A1833', '#EAF0FF'] },
    { key: 'warm',    name: 'Lumen Burgundy', desc: 'Бордо-бренд, тёплый люкс, светлый workspace.',      vid: 'skyline-burgundy', sw: ['#861C3C', '#F8FAFD', '#2A0E17'] },
    { key: 'mono',    name: 'Моно',           desc: 'Чёрно-белый минимализм, максимум контента.',        vid: 'skyline-mono',     sw: ['#171717', '#F6F6F6', '#171717'] },
    { key: 'frame',   name: 'Контур',         desc: 'Чёткие рамки без теней — строгий редакторский вид.', vid: '',                sw: ['#111827', '#FFFFFF', '#2563EB'] },
  ];
  const GEOS = [
    { k: 'dubai', l: 'Дубай' }, { k: 'abudhabi', l: 'Абу-Даби' }, { k: 'bali', l: 'Бали' },
    { k: 'phuket', l: 'Пхукет' }, { k: 'spain', l: 'Испания' }, { k: 'cyprus', l: 'Кипр' },
    { k: 'thailand', l: 'Таиланд' }, { k: 'turkey', l: 'Турция' }, { k: 'georgia', l: 'Грузия' },
    { k: 'montenegro', l: 'Черногория' }, { k: 'greece', l: 'Греция' }, { k: 'other', l: 'Другое' },
  ];
  const TONES = [
    { k: 'warm',    name: 'Тёплая и заботливая', ex: '«Понимаю, это важное решение — подскажу и ничего не буду навязывать 🙌 Рассматриваете под доход или для себя?»', tone: 'тёплая, заботливая, человечная — как хороший личный менеджер; без давления' },
    { k: 'expert',  name: 'Экспертная и уверенная', ex: '«Хороший выбор района. По этому пулу за 12 мес рост ~18% и рассрочка 0% до ключей. Уточню бюджет — подберу 3 точных варианта.»', tone: 'экспертная, уверенная, по делу; оперирует цифрами и фактами рынка' },
    { k: 'concise', name: 'Короткая и деловая', ex: '«Принял. Бюджет и цель покупки? Пришлю 3 варианта под вас в течение часа.»', tone: 'короткая, деловая, без воды; быстрые чёткие сообщения' },
  ];
  // иллюстрации к шагам-фичам
  const SHOT = (n) => '/assets/site/cap-' + n + '.png';

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
      theme: (localStorage.getItem('lumen_theme') || 'light'),
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
    const all = [
      { id: 'welcome' },
      { id: 'edition' },
      { id: 'style' },
      { id: 'brand' },
      { id: 'geos' },
      { id: 'tone' },
      { id: 'whatsapp' },
      { id: 'chains' },
      { id: 'listings' },
      !solo && { id: 'team' },
      { id: 'pricing' },
      { id: 'finish' },
    ].filter(Boolean);
    return all;
  }

  // ============================================================
  //  РЕНДЕР ШАГОВ
  // ============================================================
  function stepWelcome() {
    return {
      bg: 'welcome', pad: true,
      html: `
        <div class="ob-center">
          <div class="ob-badge">Церемония запуска</div>
          <h1 class="ob-h1">Добро пожаловать в <span class="ob-grad">Lumen</span></h1>
          <p class="ob-lead">Соберём ваше пространство под вас за несколько минут: стиль, бренд, направления, тон первой линии и подключение WhatsApp. Дальше Lumen берёт заявки на себя.</p>
          <div class="ob-pills">
            <span class="ob-pill">${IC.palette}Свой стиль</span>
            <span class="ob-pill">${IC.building}Агентство или соло</span>
            <span class="ob-pill">${IC.chat}WhatsApp из коробки</span>
            <span class="ob-pill">${IC.bolt}Запуск за 7 дней</span>
          </div>
        </div>`,
      primary: 'Начать настройку →',
      hideBack: true,
    };
  }

  function stepEdition() {
    const pick = (e) => `
      <button class="ob-choice ${S.edition === e ? 'on' : ''}" data-edition="${e}">
        <div class="ob-choice-ic">${e === 'agency' ? IC.building : IC.user}</div>
        <div class="ob-choice-t">${e === 'agency' ? 'Агентство недвижимости' : 'Соло-брокер'}</div>
        <div class="ob-choice-d">${e === 'agency'
          ? 'Команда брокеров, распределение лидов, контроль собственника, роли и доступы, антислив.'
          : 'Вы работаете сами на себя. Короткая настройка — без команды, ролей и распределения.'}</div>
        <ul class="ob-choice-l">${(e === 'agency'
          ? ['Брокеры и роли', 'Пульт контроля', 'Распределение и SLA', 'Общая база и лента']
          : ['Только ваши лиды', 'Ничего лишнего', 'Быстрый запуск', 'Весь ИИ-функционал']).map(x => `<li>${x}</li>`).join('')}</ul>
        <div class="ob-choice-check">${IC.check}</div>
      </button>`;
    return {
      title: 'Кто вы?',
      sub: 'От этого зависит, что мы настроим. Всегда можно переключить позже в «Профиль агентства».',
      html: `<div class="ob-choices">${pick('agency')}${pick('solo')}</div>`,
      primaryDisabled: !S.edition,
    };
  }

  function stepStyle() {
    // тон-фильтр под тему поверх одного скрина интерфейса (без 6 отдельных захватов)
    const FILT = { light: 'none', emerald: 'brightness(1.06) saturate(1.15)', dark: 'brightness(.82) saturate(.92)', warm: 'hue-rotate(112deg) saturate(1.15)', mono: 'grayscale(1) contrast(1.04)', frame: 'grayscale(.5) contrast(1.08)' };
    const card = (t) => `
      <button class="ob-theme ${S.theme === t.key ? 'on' : ''}" data-theme="${t.key}">
        <div class="ob-theme-inner">
          <div class="ob-theme-front">
            <div class="ob-theme-prev">
              ${t.vid ? `<video muted loop playsinline preload="none" poster="/assets/${t.vid}-poster.jpg"><source src="/assets/${t.vid}.mp4" type="video/mp4"></video>`
                      : `<div class="ob-theme-static" style="background:linear-gradient(135deg,${t.sw[1]},${t.sw[0]}22)"></div>`}
              <div class="ob-theme-swz">${t.sw.map(c => `<i style="background:${c}"></i>`).join('')}</div>
            </div>
            <div class="ob-theme-meta"><b>${t.name}</b><span>${t.desc}</span></div>
          </div>
          <div class="ob-theme-back">
            <img src="/assets/site/cap-overview.png" alt="" loading="lazy" style="filter:${FILT[t.key] || 'none'}">
            <div class="ob-theme-back-lbl">Интерфейс · ${t.name}</div>
          </div>
        </div>
        <div class="ob-choice-check">${IC.check}</div>
      </button>`;
    return {
      title: 'Выберите стиль пространства',
      sub: 'Наведите на карточку — увидите живое превью. Выбор применится сразу, поменять можно в любой момент.',
      html: `<div class="ob-themes">${THEMES.map(card).join('')}</div>
        <p class="ob-note">Это внешний вид вашего рабочего кабинета. Стиль клиентских материалов (подборки, карусели) настраивается отдельно в конструкторах — там ещё больше пресетов.</p>`,
    };
  }

  function stepBrand() {
    return {
      title: 'Ваш бренд',
      sub: 'Имя и логотип появятся в кабинете, в подборках объектов и на PDF для клиентов.',
      shot: 'collections',
      html: `
        <div class="ob-form">
          <label class="ob-field"><span>Название ${S.edition === 'solo' ? '(ваше имя / бренд)' : 'агентства'}</span>
            <input id="obName" type="text" placeholder="${S.edition === 'solo' ? 'Напр. Артур · недвижимость Дубая' : 'Напр. One Agency'}" value="${esc(S.name)}"></label>
          <div class="ob-field"><span>Логотип</span>
            <div class="ob-logo">
              <div class="ob-logo-prev" id="obLogoPrev">${S.logo ? `<img src="${esc(S.logo)}">` : '<span>Лого</span>'}</div>
              <label class="ob-logo-btn">Загрузить PNG/SVG<input id="obLogo" type="file" accept="image/*" hidden></label>
              ${S.logo ? '<button class="ob-logo-clear" id="obLogoClear">Убрать</button>' : ''}
            </div>
          </div>
          <div class="ob-field ob-manager"><span>Подпись менеджера (в подборках и документах)</span>
            <div class="ob-row3">
              <input id="obMgrName" type="text" placeholder="Имя" value="${esc(S.manager.name)}">
              <input id="obMgrPhone" type="text" placeholder="Телефон / WhatsApp" value="${esc(S.manager.phone)}">
              <input id="obMgrEmail" type="text" placeholder="E-mail" value="${esc(S.manager.email)}">
            </div>
          </div>
        </div>`,
    };
  }

  function stepGeos() {
    const chip = (g) => `<button class="ob-chip ${S.geos.includes(g.k) ? 'on' : ''}" data-geo="${g.k}">${g.l}</button>`;
    return {
      title: 'Направления и рынки',
      sub: 'По каким гео вы работаете? Под них Lumen настроит критерии квалификации, тон и подборки.',
      html: `<div class="ob-chips">${GEOS.map(chip).join('')}</div>
        <p class="ob-note">Выбрано: <b id="obGeoCount">${S.geos.length}</b>. Для каждого рынка позже можно задать порог бюджета и правила в «ИИ-квалификаторе».</p>`,
      primaryDisabled: S.geos.length === 0,
    };
  }

  function stepTone() {
    const card = (t) => `
      <button class="ob-tone ${S.tone === t.k ? 'on' : ''}" data-tone="${t.k}">
        <div class="ob-tone-name">${t.name}</div>
        <div class="ob-tone-ex">${esc(t.ex)}</div>
        <div class="ob-choice-check">${IC.check}</div>
      </button>`;
    return {
      title: 'Тон первой линии',
      sub: 'Так Lumen будет отвечать вашим клиентам в WhatsApp. Пример — как звучит каждый тон.',
      shot: 'ai',
      html: `<div class="ob-tones">${TONES.map(card).join('')}</div>
        <label class="ob-toggle"><input type="checkbox" id="obAutopilot" ${S.autopilot ? 'checked' : ''}><span class="ob-tg"></span>
          <div><b>Автопилот первой линии</b><small>Lumen сам отвечает и квалифицирует новые заявки. Можно включить позже.</small></div></label>`,
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
    const b = _billing || {};
    let trialDays = b.trialEndsAt ? Math.ceil((b.trialEndsAt - Date.now()) / 86400000) : 14;
    if (!(trialDays >= 3)) trialDays = 14; // свежий онбординг = полный триал
    const solo = S.edition === 'solo';
    const price = solo ? 99 : 200, was = solo ? 149 : 300;
    const seats = solo ? '1 рабочее место' : '5 брокеров + руководитель';
    return {
      title: 'Запуск и подписка',
      sub: `Всё настроено. Первые ${trialDays} дней — бесплатно, без карты. Дальше — фиксированная подписка, без оплаты за лида.`,
      html: `
        <div class="ob-price">
          <div class="ob-price-card">
            <div class="ob-price-beta">Бета · первым 10 агентствам</div>
            <div class="ob-price-name">${solo ? 'Соло-брокер' : 'Агентство'}</div>
            <div class="ob-price-val"><s>$${was}</s><b>$${price}</b><span>/мес</span></div>
            <div class="ob-price-seats">${seats}</div>
            <ul class="ob-price-list">
              <li>${IC.check}Запуск за 7 дней, а не за полгода</li>
              <li>${IC.check}WhatsApp, комментарии, телефония — из коробки</li>
              <li>${IC.check}Квалификация, подборки, психо-портрет</li>
              <li>${IC.check}Обновления и поддержка, без своей команды</li>
            </ul>
            <button class="ob-do ob-do-pay" data-do="pay">Активировать подписку →</button>
            <div class="ob-price-rr">${IC.check}Без карты для старта · отмена в один клик</div>
          </div>
          <div class="ob-price-side">
            <div class="ob-price-badge">${trialDays}<span>дней<br>бесплатно</span></div>
            <div class="ob-price-why"><b>Почему активировать сейчас?</b><span>Вы уже собрали пространство под себя. Одна кнопка — и Lumen берёт первую линию с этой минуты, а заявки перестают остывать по ночам.</span></div>
          </div>
        </div>`,
      primary: `Продолжить бесплатно ${trialDays} дн. →`,
      hideSkip: true,
    };
  }

  function stepFinish() {
    return {
      bg: 'success', pad: true,
      html: `
        <div class="ob-center">
          <div class="ob-done-mark">${IC.check}</div>
          <h1 class="ob-h1">Пространство собрано</h1>
          <p class="ob-lead">${S.name ? esc(S.name) + ' — ' : ''}всё готово. Lumen берёт первую линию: отвечает за секунды, квалифицирует и передаёт тёплых. Вы видите заявки, квалы и сделки в реальном времени.</p>
          <div class="ob-recap" id="obRecap"></div>
        </div>`,
      primary: 'Запустить Lumen →',
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
      case 'team': return stepGuide({ title: 'Команда и роли', sub: 'Добавьте брокеров, раздайте роли и настройте видимость лидов.', shot: 'leadcard', action: 'team', cta: 'Добавить брокеров', points: ['Роли: брокер, ассистент, маркетолог, аналитик, руководитель', 'Фильтр лидов по источнику/тегу или «только свои»', 'Пульт контроля и антислив базы', 'Мост Telegram ⇄ WhatsApp для брокеров'] });
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
    // только «моменты» получают кино-видео; на всех рабочих шагах живёт WebGL-шейдер (единый премиум-эмбиент)
    const BGV = { welcome: 'onboard-welcome', finish: 'onboard-success' };
    const bgVid = BGV[step.id] || '';
    root.querySelector('.ob-bgvid').innerHTML = bgVid
      ? `<video autoplay muted loop playsinline poster="/assets/${bgVid}-poster.jpg"><source src="/assets/${bgVid}.mp4?v=1" type="video/mp4"></video>`
      : '';
    root.classList.toggle('ob-cinematic', !!d.bg);

    const stepsDots = STEPS.map((s, i) => `<i class="${i === idx ? 'on' : ''} ${i < idx ? 'done' : ''}"></i>`).join('');
    const shot = d.shot ? `<div class="ob-shot"><div class="ob-shot-bar"><i></i><i></i><i></i></div><img src="${SHOT(d.shot)}" alt="" loading="lazy"></div>` : '';

    root.querySelector('.ob-stage').innerHTML = `
      <div class="ob-panel ${d.bg ? 'ob-panel-cine' : ''} ${shot ? 'ob-panel-split' : ''}" key="${step.id}">
        <div class="ob-body">
          ${d.title ? `<div class="ob-step-n">Шаг ${idx} из ${total - 2}</div><h2 class="ob-h2">${d.title}</h2>${d.sub ? `<p class="ob-sub">${d.sub}</p>` : ''}` : ''}
          <div class="ob-content">${d.html}</div>
        </div>
        ${shot}
      </div>`;

    // низ: прогресс + кнопки
    root.querySelector('.ob-foot').innerHTML = `
      <div class="ob-dots">${stepsDots}</div>
      <div class="ob-actions">
        ${d.hideBack ? '' : `<button class="ob-btn ob-ghost" data-act="back">Назад</button>`}
        ${d.hideSkip || d.hideBack ? '' : `<button class="ob-btn ob-ghost ob-skip" data-act="skip">Пропустить</button>`}
        <button class="ob-btn ob-primary ${d.primaryDisabled ? 'dis' : ''}" data-act="next">${d.primary || 'Далее →'}</button>
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
      if (a === 'next') { if (b.classList.contains('dis')) return; next(false); }
    });

    // per-step
    if (step.id === 'edition') {
      qq('[data-edition]').forEach(b => b.onclick = () => { S.edition = b.dataset.edition; paint(); });
    }
    if (step.id === 'style') {
      const zoom = root.querySelector('.ob-zoom'), zImg = zoom.querySelector('img'), zLbl = zoom.querySelector('.ob-zoom-lbl');
      let hideT;
      qq('[data-theme]').forEach(b => {
        const v = b.querySelector('video');
        const backImg = b.querySelector('.ob-theme-back img');
        const name = (b.querySelector('.ob-theme-meta b') || {}).textContent || '';
        b.onmouseenter = () => {
          if (v) v.play().catch(() => {});
          clearTimeout(hideT);
          if (backImg) { zImg.setAttribute('src', backImg.getAttribute('src')); zImg.style.filter = backImg.style.filter || 'none'; }
          zLbl.textContent = 'Интерфейс · ' + name;
          zoom.classList.add('on');
        };
        b.onmouseleave = () => {
          if (v && S.theme !== b.dataset.theme) v.pause();
          hideT = setTimeout(() => { root && zoom.classList.remove('on'); }, 130);
        };
        b.onclick = () => { S.theme = b.dataset.theme; try { (B().setTheme || window.setTheme)(S.theme); } catch (e) {} qq('[data-theme]').forEach(x => x.classList.toggle('on', x === b)); };
      });
    }
    if (step.id === 'brand') {
      q('#obName').oninput = e => S.name = e.target.value;
      q('#obMgrName').oninput = e => S.manager.name = e.target.value;
      q('#obMgrPhone').oninput = e => S.manager.phone = e.target.value;
      q('#obMgrEmail').oninput = e => S.manager.email = e.target.value;
      q('#obLogo').onchange = e => {
        const f = e.target.files[0]; if (!f) return;
        const rd = new FileReader(); rd.onload = () => { S.logo = rd.result; paint(); }; rd.readAsDataURL(f);
      };
      const clr = q('#obLogoClear'); if (clr) clr.onclick = () => { S.logo = ''; paint(); };
    }
    if (step.id === 'geos') {
      qq('[data-geo]').forEach(b => b.onclick = () => {
        const k = b.dataset.geo; const i = S.geos.indexOf(k);
        if (i >= 0) S.geos.splice(i, 1); else S.geos.push(k);
        b.classList.toggle('on'); q('#obGeoCount').textContent = S.geos.length;
        const nb = root.querySelector('[data-act="next"]'); if (nb) nb.classList.toggle('dis', S.geos.length === 0);
      });
    }
    if (step.id === 'tone') {
      qq('[data-tone]').forEach(b => b.onclick = () => { S.tone = b.dataset.tone; qq('[data-tone]').forEach(x => x.classList.toggle('on', x === b)); });
      q('#obAutopilot').onchange = e => S.autopilot = e.target.checked;
    }
    qq('[data-do]').forEach(btn => { btn.onclick = () => runGuide(btn.dataset.do); });
  }

  function runGuide(action) {
    // сохраняем прогресс, закрываем церемонию (не финализируя onboarded) и уводим в боевой поток
    saveProgress(false);
    close(true);
    const b = B();
    try {
      if (action === 'wa') { b.openWa ? b.openWa() : b.go && b.go('settings'); }
      else if (action === 'chains') { b.go && b.go('sequences'); }
      else if (action === 'listings') { b.go && b.go('properties'); }
      else if (action === 'team') { b.go && b.go('brokers'); }
    } catch (e) {}
  }

  function buildRecap() {
    const box = root.querySelector('#obRecap'); if (!box) return;
    const th = THEMES.find(t => t.key === S.theme);
    const rows = [
      ['Формат', S.edition === 'solo' ? 'Соло-брокер' : 'Агентство'],
      ['Стиль', th ? th.name : S.theme],
      ['Бренд', S.name || '—'],
      ['Направления', S.geos.length ? S.geos.map(k => (GEOS.find(g => g.k === k) || {}).l || k).join(', ') : '—'],
      ['Тон', (TONES.find(t => t.k === S.tone) || {}).name || '—'],
      ['Автопилот', S.autopilot ? 'Вкл' : 'Выкл'],
    ];
    box.innerHTML = rows.map(r => `<div class="ob-recap-row"><span>${r[0]}</span><b>${esc(r[1])}</b></div>`).join('');
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
    root.classList.add('ob-launch');
    setTimeout(async () => {
      close(false);
      try { const b = B(); if (b.refresh) await b.refresh(); } catch (e) {}
      try { const b = B(); if (b.go) b.go('overview'); } catch (e) {}
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
    .ob-root{position:fixed;inset:0;z-index:5000;opacity:0;transition:opacity .4s cubic-bezier(.16,1,.3,1);font-family:'Manrope',system-ui,sans-serif;color:#EAF1FF}
    .ob-root.in{opacity:1}
    .ob-root.ob-launch{opacity:0;transform:scale(1.03);transition:opacity .8s ease,transform .8s ease}
    .ob-bgvid,.ob-bgvid video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
    .ob-veil{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 0,rgba(12,22,48,.72),#040912 78%)}
    .ob-root:not(.ob-cinematic) .ob-veil{background:linear-gradient(180deg,#070d1c,#040912)}
    .ob-close{position:absolute;top:20px;right:22px;z-index:5;width:40px;height:40px;border-radius:50%;border:1px solid rgba(143,180,255,.22);background:rgba(10,18,38,.5);color:#AEBFE0;font-size:15px;cursor:pointer;backdrop-filter:blur(8px);transition:.2s}
    .ob-close:hover{background:rgba(20,32,60,.8);color:#fff}
    .ob-wrap{position:absolute;inset:0;display:flex;flex-direction:column;z-index:3}
    .ob-stage{flex:1;display:flex;align-items:center;justify-content:center;padding:40px 26px 12px;overflow:auto}
    .ob-panel{width:100%;max-width:980px;animation:obIn .6s cubic-bezier(.16,1,.3,1)}
    .ob-panel-split{max-width:1080px;display:grid;grid-template-columns:1.05fr .95fr;gap:36px;align-items:center}
    @keyframes obIn{from{opacity:0;transform:translateY(26px) scale(.985);filter:blur(6px)}to{opacity:1;transform:none;filter:none}}
    .ob-body{min-width:0}
    .ob-step-n{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#5F86D8}
    .ob-h1{font-size:clamp(34px,5vw,60px);font-weight:800;letter-spacing:-.03em;line-height:1.02;margin:6px 0 14px}
    .ob-h2{font-size:clamp(26px,3.4vw,40px);font-weight:800;letter-spacing:-.025em;margin:8px 0 10px}
    .ob-grad{background:linear-gradient(120deg,#8FB4FF,#2F6BFF);-webkit-background-clip:text;background-clip:text;color:transparent}
    .ob-lead{font-size:clamp(15px,1.5vw,18px);color:#AEBFE0;line-height:1.6;max-width:60ch}
    .ob-sub{font-size:15px;color:#9DB0D6;line-height:1.55;max-width:64ch;margin-bottom:22px}
    .ob-center{text-align:center;max-width:760px;margin:0 auto}
    .ob-badge{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#8FB4FF;border:1px solid rgba(143,180,255,.3);border-radius:999px;padding:7px 15px;margin-bottom:20px;background:rgba(20,34,64,.4)}
    .ob-pills{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:26px}
    .ob-pill{display:inline-flex;align-items:center;gap:7px;font-size:13.5px;font-weight:600;color:#CBD9F5;background:rgba(20,32,60,.55);border:1px solid rgba(143,180,255,.2);border-radius:999px;padding:9px 15px;backdrop-filter:blur(6px)}
    .ob-note{font-size:13px;color:#8296BC;margin-top:16px;line-height:1.5}
    .ob-content{margin-top:4px}
    /* choices (edition) */
    .ob-choices{display:grid;grid-template-columns:1fr 1fr;gap:18px}
    .ob-choice{position:relative;text-align:left;padding:26px;border-radius:20px;border:1.5px solid rgba(143,180,255,.18);background:rgba(14,24,46,.55);color:#EAF1FF;cursor:pointer;transition:.25s cubic-bezier(.16,1,.3,1);backdrop-filter:blur(8px)}
    .ob-choice:hover{transform:translateY(-4px);border-color:rgba(143,180,255,.4);background:rgba(20,32,60,.7)}
    .ob-choice.on{border-color:#2F6BFF;background:rgba(37,99,235,.16);box-shadow:0 20px 50px -20px rgba(37,99,235,.5)}
    .ob-choice-ic{font-size:34px;margin-bottom:12px}
    .ob-choice-t{font-size:20px;font-weight:800;letter-spacing:-.01em;margin-bottom:8px}
    .ob-choice-d{font-size:13.5px;color:#9DB0D6;line-height:1.5;margin-bottom:14px}
    .ob-choice-l{list-style:none;padding:0;margin:0;display:grid;gap:7px}
    .ob-choice-l li{font-size:13px;color:#C3D2F0;padding-left:20px;position:relative}
    .ob-choice-l li:before{content:"→";position:absolute;left:0;color:#5F86D8}
    .ob-choice-check{position:absolute;top:18px;right:18px;width:26px;height:26px;border-radius:50%;background:#2F6BFF;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;opacity:0;transform:scale(.5);transition:.25s}
    .ob-choice.on .ob-choice-check{opacity:1;transform:scale(1)}
    /* themes */
    .ob-themes{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
    .ob-theme{position:relative;text-align:left;padding:0;border-radius:18px;overflow:hidden;border:1.5px solid rgba(143,180,255,.16);background:rgba(14,24,46,.5);color:#EAF1FF;cursor:pointer;transition:.25s cubic-bezier(.16,1,.3,1)}
    .ob-theme:hover{transform:translateY(-4px);border-color:rgba(143,180,255,.4)}
    .ob-theme.on{border-color:#2F6BFF;box-shadow:0 20px 50px -20px rgba(37,99,235,.55)}
    .ob-theme-prev{position:relative;aspect-ratio:16/10;overflow:hidden;background:#0a1224}
    .ob-theme-prev video,.ob-theme-static{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
    .ob-theme-swz{position:absolute;left:10px;bottom:10px;display:flex;gap:5px;z-index:2}
    .ob-theme-swz i{width:15px;height:15px;border-radius:50%;border:1.5px solid rgba(255,255,255,.6);box-shadow:0 2px 6px rgba(0,0,0,.4)}
    .ob-theme-meta{padding:13px 15px}
    .ob-theme-meta b{display:block;font-size:15.5px;font-weight:800;letter-spacing:-.01em}
    .ob-theme-meta span{display:block;font-size:12px;color:#93A6CC;line-height:1.4;margin-top:3px}
    /* form */
    .ob-form{display:grid;gap:18px;max-width:620px}
    .ob-field{display:block}
    .ob-field>span{display:block;font-size:13px;font-weight:600;color:#9DB0D6;margin-bottom:8px}
    .ob-field input[type=text]{width:100%;padding:13px 15px;border-radius:12px;border:1.5px solid rgba(143,180,255,.2);background:rgba(10,18,38,.6);color:#EAF1FF;font-size:15px;font-family:inherit;transition:.2s}
    .ob-field input[type=text]:focus{outline:none;border-color:#2F6BFF;background:rgba(16,26,50,.8)}
    .ob-row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
    .ob-logo{display:flex;align-items:center;gap:14px}
    .ob-logo-prev{width:120px;height:64px;border-radius:12px;border:1.5px dashed rgba(143,180,255,.3);display:flex;align-items:center;justify-content:center;background:rgba(10,18,38,.5);color:#5F86D8;font-size:12px;overflow:hidden}
    .ob-logo-prev img{max-width:100%;max-height:100%;object-fit:contain}
    .ob-logo-btn{font-size:13.5px;font-weight:600;color:#CBD9F5;border:1px solid rgba(143,180,255,.3);border-radius:10px;padding:11px 15px;cursor:pointer;background:rgba(20,32,60,.5)}
    .ob-logo-btn:hover{background:rgba(30,44,74,.7)}
    .ob-logo-clear{font-size:12.5px;color:#8296BC;background:none;border:none;cursor:pointer;text-decoration:underline}
    /* chips */
    .ob-chips{display:flex;flex-wrap:wrap;gap:10px}
    .ob-chip{font-size:14.5px;font-weight:600;color:#CBD9F5;background:rgba(16,26,50,.6);border:1.5px solid rgba(143,180,255,.2);border-radius:999px;padding:11px 18px;cursor:pointer;transition:.2s}
    .ob-chip:hover{border-color:rgba(143,180,255,.45)}
    .ob-chip.on{background:#2563EB;border-color:#2F6BFF;color:#fff;box-shadow:0 10px 24px -10px rgba(37,99,235,.6)}
    /* tones */
    .ob-tones{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
    .ob-tone{position:relative;text-align:left;padding:20px;border-radius:16px;border:1.5px solid rgba(143,180,255,.18);background:rgba(14,24,46,.55);color:#EAF1FF;cursor:pointer;transition:.25s}
    .ob-tone:hover{transform:translateY(-3px);border-color:rgba(143,180,255,.4)}
    .ob-tone.on{border-color:#2F6BFF;background:rgba(37,99,235,.14)}
    .ob-tone-name{font-size:16px;font-weight:800;margin-bottom:10px}
    .ob-tone-ex{font-size:13px;color:#AEBFE0;line-height:1.5;font-style:italic}
    .ob-toggle{display:flex;align-items:center;gap:14px;margin-top:22px;cursor:pointer;padding:16px 18px;border-radius:14px;border:1px solid rgba(143,180,255,.16);background:rgba(14,24,46,.4);max-width:560px}
    .ob-toggle input{display:none}
    .ob-tg{flex:0 0 46px;width:46px;height:27px;border-radius:999px;background:rgba(90,110,150,.4);position:relative;transition:.25s}
    .ob-tg:before{content:"";position:absolute;top:3px;left:3px;width:21px;height:21px;border-radius:50%;background:#fff;transition:.25s}
    .ob-toggle input:checked+.ob-tg{background:#2563EB}
    .ob-toggle input:checked+.ob-tg:before{transform:translateX(19px)}
    .ob-toggle b{display:block;font-size:14.5px}
    .ob-toggle small{display:block;font-size:12.5px;color:#8296BC;margin-top:2px}
    /* guide */
    .ob-guide-l{list-style:none;padding:0;margin:0 0 24px;display:grid;gap:12px;max-width:600px}
    .ob-guide-l li{display:flex;gap:12px;align-items:flex-start;font-size:15px;color:#CBD9F5}
    .ob-guide-l li i{flex:0 0 22px;height:22px;border-radius:50%;background:rgba(37,99,235,.2);color:#8FB4FF;display:flex;align-items:center;justify-content:center;font-size:12px;font-style:normal;margin-top:1px}
    .ob-guide-cta{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
    .ob-do{font-size:15px;font-weight:700;color:#fff;background:linear-gradient(180deg,#2F6BFF,#1D4FD8);border:none;border-radius:12px;padding:14px 24px;cursor:pointer;box-shadow:0 16px 34px -14px rgba(37,99,235,.7);transition:.2s}
    .ob-do:hover{transform:translateY(-2px)}
    .ob-later{font-size:12.5px;color:#8296BC}
    /* shot */
    .ob-shot{border-radius:18px;overflow:hidden;border:1px solid rgba(143,180,255,.2);box-shadow:0 40px 80px -30px rgba(0,0,0,.7);background:#0a1224;animation:obFloat 7s ease-in-out infinite}
    .ob-shot-bar{display:flex;gap:6px;padding:11px 14px;background:rgba(14,24,46,.9);border-bottom:1px solid rgba(143,180,255,.12)}
    .ob-shot-bar i{width:9px;height:9px;border-radius:50%}
    .ob-shot-bar i:nth-child(1){background:#ff5f57}.ob-shot-bar i:nth-child(2){background:#febc2e}.ob-shot-bar i:nth-child(3){background:#28c840}
    .ob-shot img{width:100%;display:block}
    @keyframes obFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
    /* recap + done */
    .ob-done-mark{width:88px;height:88px;border-radius:50%;background:linear-gradient(180deg,#34d399,#059669);color:#fff;font-size:44px;display:flex;align-items:center;justify-content:center;margin:0 auto 22px;box-shadow:0 0 0 10px rgba(52,211,153,.15),0 20px 50px -16px rgba(16,185,129,.6);animation:obPop .6s cubic-bezier(.16,1,.3,1)}
    @keyframes obPop{0%{transform:scale(.3);opacity:0}60%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
    .ob-recap{display:grid;grid-template-columns:1fr 1fr;gap:10px 26px;max-width:560px;margin:28px auto 0;text-align:left}
    .ob-recap-row{display:flex;justify-content:space-between;gap:14px;padding:12px 0;border-bottom:1px solid rgba(143,180,255,.12)}
    .ob-recap-row span{font-size:13px;color:#8296BC}
    .ob-recap-row b{font-size:14px;color:#EAF1FF;font-weight:700}
    /* foot */
    .ob-foot{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:18px 30px 26px;position:relative;z-index:4}
    .ob-dots{display:flex;gap:7px}
    .ob-dots i{width:8px;height:8px;border-radius:50%;background:rgba(143,180,255,.25);transition:.3s}
    .ob-dots i.on{background:#2F6BFF;width:26px;border-radius:5px}
    .ob-dots i.done{background:#3E5FA8}
    .ob-actions{display:flex;align-items:center;gap:12px}
    .ob-btn{font-size:14.5px;font-weight:700;border-radius:12px;padding:13px 22px;cursor:pointer;border:1px solid transparent;transition:.2s;font-family:inherit}
    .ob-ghost{background:rgba(20,32,60,.5);border-color:rgba(143,180,255,.2);color:#CBD9F5}
    .ob-ghost:hover{background:rgba(30,44,74,.7);color:#fff}
    .ob-skip{opacity:.7}
    .ob-primary{background:linear-gradient(180deg,#2F6BFF,#1D4FD8);color:#fff;box-shadow:0 14px 30px -12px rgba(37,99,235,.7)}
    .ob-primary:hover{transform:translateY(-2px)}
    .ob-primary.dis{opacity:.4;pointer-events:none;box-shadow:none}
    @media(max-width:820px){
      .ob-panel-split{grid-template-columns:1fr}.ob-shot{display:none}
      .ob-choices{grid-template-columns:1fr}.ob-themes{grid-template-columns:1fr 1fr}.ob-tones{grid-template-columns:1fr}
      .ob-row3{grid-template-columns:1fr}
      .ob-stage{padding:26px 16px 8px}.ob-foot{padding:14px 16px 20px}
      .ob-actions{flex:1;justify-content:flex-end}
    }
    /* ============ PREMIUM 10× ============ */
    .ob-orbs{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1}
    .ob-orbs i{position:absolute;border-radius:50%;filter:blur(72px);opacity:.5;mix-blend-mode:screen;animation:obOrb 20s ease-in-out infinite}
    .ob-orbs i:nth-child(1){width:48vw;height:48vw;left:-14vw;top:-16vw;background:radial-gradient(circle,#2F6BFF,transparent 68%)}
    .ob-orbs i:nth-child(2){width:42vw;height:42vw;right:-14vw;top:6vw;background:radial-gradient(circle,#2F6BFF,transparent 68%);animation-delay:-7s}
    .ob-orbs i:nth-child(3){width:40vw;height:40vw;left:28vw;bottom:-20vw;background:radial-gradient(circle,#2563EB,transparent 68%);animation-delay:-13s;opacity:.32}
    @keyframes obOrb{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(6vw,-4vw) scale(1.14)}66%{transform:translate(-5vw,5vw) scale(.94)}}
    .ob-grain{position:absolute;inset:0;z-index:2;pointer-events:none;opacity:.05;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
    .ob-veil{background:radial-gradient(130% 100% at 50% -12%,rgba(24,44,92,.5),rgba(6,11,26,.84) 58%,#03060f 100%)}
    .ob-root:not(.ob-cinematic) .ob-veil{background:radial-gradient(120% 90% at 16% -4%,rgba(26,48,100,.6),transparent 52%),radial-gradient(120% 90% at 92% 16%,rgba(74,48,140,.42),transparent 52%),linear-gradient(180deg,#070e22,#03060f)}
    .ob-bgvid video{opacity:.52;transform:scale(1.04);animation:obBgZoom 22s ease-in-out infinite alternate}
    @keyframes obBgZoom{to{transform:scale(1.13)}}
    /* контентные шаги с видео-хуком: видео тоньше, вейл плотнее (формы читаемы) */
    .ob-root.ob-hasbg .ob-bgvid video{opacity:.34}
    .ob-root.ob-hasbg .ob-veil{background:radial-gradient(120% 90% at 18% -4%,rgba(24,44,92,.5),transparent 48%),radial-gradient(120% 90% at 90% 12%,rgba(74,48,140,.34),transparent 48%),linear-gradient(180deg,rgba(6,11,26,.8),rgba(3,6,15,.9))}
    .ob-close{background:rgba(10,18,38,.5);box-shadow:0 8px 24px -10px rgba(0,0,0,.6)}
    .ob-panel{filter:drop-shadow(0 44px 100px rgba(0,0,0,.55))}
    @keyframes obIn{from{opacity:0;transform:translateY(36px) scale(.968);filter:blur(11px)}to{opacity:1;transform:none;filter:none}}
    .ob-h1{font-size:clamp(40px,6.2vw,80px);letter-spacing:-.04em;text-shadow:0 6px 46px rgba(37,99,235,.28)}
    .ob-h2{font-size:clamp(30px,4vw,52px);letter-spacing:-.035em}
    .ob-grad{background:linear-gradient(110deg,#EAF1FF,#9CC0FF 42%,#5B84FF);-webkit-background-clip:text;background-clip:text;color:transparent}
    .ob-step-n{background:linear-gradient(90deg,#9CC0FF,#5B84FF);-webkit-background-clip:text;background-clip:text;color:transparent}
    .ob-badge{background:linear-gradient(90deg,rgba(37,99,235,.28),rgba(37,99,235,.22));border-color:rgba(143,180,255,.42);box-shadow:0 10px 34px -12px rgba(37,99,235,.6);color:#CFE0FF}
    .ob-pill{background:rgba(18,30,60,.5);box-shadow:0 8px 22px -12px rgba(0,0,0,.6)}
    .ob-lead{color:#B9C9EC}
    /* карточки: стеклянный градиент-бордер + свечение */
    .ob-choice,.ob-tone{border:1.5px solid transparent;background:linear-gradient(rgba(13,22,44,.72),rgba(13,22,44,.72)) padding-box,linear-gradient(135deg,rgba(143,180,255,.4),rgba(143,180,255,.05) 42%,transparent) border-box;backdrop-filter:blur(18px) saturate(140%)}
    .ob-choice:hover,.ob-tone:hover{box-shadow:0 34px 74px -26px rgba(37,99,235,.5)}
    .ob-choice.on,.ob-tone.on{background:linear-gradient(rgba(24,44,92,.8),rgba(17,29,62,.82)) padding-box,linear-gradient(135deg,#5B84FF,#2F6BFF) border-box;box-shadow:0 34px 84px -24px rgba(37,99,235,.72),0 0 70px -22px rgba(37,99,235,.6)}
    .ob-choice-ic{filter:drop-shadow(0 8px 18px rgba(37,99,235,.45))}
    .ob-choice-check{background:linear-gradient(135deg,#5B84FF,#2F6BFF);box-shadow:0 8px 20px -6px rgba(37,99,235,.7)}
    .ob-theme{border:1.5px solid transparent;background:linear-gradient(rgba(13,22,44,.6),rgba(13,22,44,.6)) padding-box,linear-gradient(135deg,rgba(143,180,255,.32),transparent 55%) border-box}
    .ob-theme.on{background:linear-gradient(rgba(24,44,92,.72),rgba(17,29,62,.74)) padding-box,linear-gradient(135deg,#5B84FF,#2F6BFF) border-box;box-shadow:0 34px 76px -24px rgba(37,99,235,.62)}
    .ob-theme-prev:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 58%,rgba(6,11,26,.55));pointer-events:none;z-index:1}
    .ob-theme-prev video{transition:transform .7s cubic-bezier(.16,1,.3,1)}
    .ob-theme:hover .ob-theme-prev video{transform:scale(1.07)}
    .ob-theme-swz i{width:16px;height:16px;box-shadow:0 2px 8px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.15)}
    .ob-chip{backdrop-filter:blur(10px)}
    .ob-chip.on{background:linear-gradient(135deg,#2F6BFF,#5B84FF);box-shadow:0 12px 30px -10px rgba(37,99,235,.7),0 0 0 1px rgba(143,180,255,.3)}
    .ob-field input[type=text]:focus{box-shadow:0 0 0 3px rgba(37,99,235,.22)}
    /* CTA: свечение + шиммер */
    .ob-primary{position:relative;overflow:hidden;background:linear-gradient(135deg,#3D7BFF,#1D4FD8);box-shadow:0 20px 44px -14px rgba(37,99,235,.85),0 0 0 1px rgba(143,180,255,.2) inset}
    .ob-primary:not(.dis):after{content:"";position:absolute;top:0;left:-60%;width:42%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.5),transparent);transform:skewX(-18deg);animation:obShine 3.6s ease-in-out infinite}
    .ob-do{position:relative;overflow:hidden;box-shadow:0 20px 40px -14px rgba(37,99,235,.8)}
    .ob-do:after{content:"";position:absolute;top:0;left:-60%;width:42%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.45),transparent);transform:skewX(-18deg);animation:obShine 3.6s ease-in-out infinite}
    @keyframes obShine{0%{left:-60%}58%,100%{left:135%}}
    .ob-dots i.on{background:linear-gradient(90deg,#5B84FF,#2F6BFF);box-shadow:0 0 14px rgba(91,132,255,.85)}
    .ob-toggle{background:linear-gradient(rgba(14,24,46,.5),rgba(14,24,46,.5)) padding-box,linear-gradient(135deg,rgba(143,180,255,.28),transparent) border-box;border:1px solid transparent;backdrop-filter:blur(12px)}
    .ob-shot{border:1px solid transparent;background:linear-gradient(#0a1224,#0a1224) padding-box,linear-gradient(135deg,rgba(143,180,255,.42),transparent 62%) border-box;box-shadow:0 54px 104px -30px rgba(0,0,0,.8),0 0 90px -34px rgba(37,99,235,.45)}
    .ob-done-mark{box-shadow:0 0 0 12px rgba(52,211,153,.12),0 0 64px -6px rgba(16,185,129,.7),0 24px 60px -18px rgba(16,185,129,.6);animation:obPop .6s cubic-bezier(.16,1,.3,1),obDoneGlow 2.8s ease-in-out .6s infinite}
    @keyframes obDoneGlow{0%,100%{box-shadow:0 0 0 12px rgba(52,211,153,.12),0 0 64px -6px rgba(16,185,129,.72),0 24px 60px -18px rgba(16,185,129,.6)}50%{box-shadow:0 0 0 20px rgba(52,211,153,.05),0 0 96px 2px rgba(16,185,129,.92),0 24px 60px -18px rgba(16,185,129,.6)}}
    .ob-recap{background:linear-gradient(rgba(14,24,46,.4),rgba(14,24,46,.4)) padding-box;border-radius:16px;padding:8px 22px}
    /* ==== шейдер-слой + генеративные переходы + z-порядок ==== */
    .ob-shader{position:absolute;inset:0;width:100%;height:100%;z-index:1;opacity:1;transition:filter .42s ease,transform .42s ease,opacity .5s ease}
    .ob-root.ob-cinematic .ob-shader{opacity:0}
    .ob-root.ob-pulse .ob-shader{filter:brightness(1.4) saturate(1.2);transform:scale(1.015)}
    .ob-orbs{z-index:2;opacity:.32}
    .ob-grain{z-index:3}
    .ob-wrap{z-index:5}.ob-foot{z-index:5}.ob-close{z-index:7}
    /* чистый переход панели (fade+blur), без дешёвых видео-вспышек */
    .ob-stage{transition:opacity .17s ease,transform .17s ease,filter .17s ease}
    .ob-stage.ob-leaving{opacity:0;transform:translateY(-14px) scale(.986);filter:blur(7px)}
    /* ==== усиленные входы: каскад детей ==== */
    .ob-panel .ob-body>*{animation:obUp .72s cubic-bezier(.16,1,.3,1) both}
    .ob-panel .ob-body>*:nth-child(1){animation-delay:.04s}
    .ob-panel .ob-body>*:nth-child(2){animation-delay:.12s}
    .ob-panel .ob-body>*:nth-child(3){animation-delay:.2s}
    .ob-panel .ob-body>*:nth-child(4){animation-delay:.28s}
    .ob-center>*{animation:obUp .72s cubic-bezier(.16,1,.3,1) both}
    .ob-center>*:nth-child(2){animation-delay:.1s}.ob-center>*:nth-child(3){animation-delay:.2s}.ob-center>*:nth-child(4){animation-delay:.3s}.ob-center>*:nth-child(5){animation-delay:.4s}
    .ob-panel .ob-shot{animation:obShotIn .95s cubic-bezier(.16,1,.3,1) both .16s}
    @keyframes obUp{from{opacity:0;transform:translateY(28px);filter:blur(8px)}to{opacity:1;transform:none;filter:none}}
    @keyframes obShotIn{from{opacity:0;transform:translateY(32px) rotateX(9deg) scale(.95);filter:blur(11px)}to{opacity:1;transform:none;filter:none}}
    .ob-choices .ob-choice,.ob-themes .ob-theme,.ob-tones .ob-tone,.ob-chips .ob-chip{animation:obCard .6s cubic-bezier(.16,1,.3,1) both}
    .ob-choice:nth-child(2),.ob-tone:nth-child(2){animation-delay:.09s}.ob-tone:nth-child(3){animation-delay:.18s}
    .ob-theme:nth-child(2){animation-delay:.05s}.ob-theme:nth-child(3){animation-delay:.1s}.ob-theme:nth-child(4){animation-delay:.15s}.ob-theme:nth-child(5){animation-delay:.2s}.ob-theme:nth-child(6){animation-delay:.25s}
    @keyframes obCard{from{opacity:0;transform:translateY(22px) scale(.95);filter:blur(6px)}to{opacity:1;transform:none;filter:none}}
    /* ==== магнитные кнопки + пульс градиента ==== */
    .ob-primary:hover{transform:translateY(-3px) scale(1.02)}
    .ob-btn:active{transform:scale(.97)}
    .ob-do:hover{transform:translateY(-3px) scale(1.02)}
    .ob-grad{background-size:220% auto;animation:obUp .8s cubic-bezier(.16,1,.3,1) both,obGrad 7s linear infinite .8s}
    @keyframes obGrad{to{background-position:220% center}}
    .ob-badge{animation:obUp .6s cubic-bezier(.16,1,.3,1) both}
    /* ==== размеры SVG-иконок (вместо эмодзи) ==== */
    .ob-choice-ic{margin-bottom:14px;color:#8FB4FF;line-height:0}
    .ob-choice-ic svg{width:40px;height:40px;filter:drop-shadow(0 8px 18px rgba(37,99,235,.45))}
    .ob-pill svg{width:15px;height:15px;flex:0 0 15px;color:#8FB4FF}
    .ob-guide-l li i svg{width:13px;height:13px}
    .ob-done-mark svg{width:46px;height:46px}
    .ob-choice-check svg{width:15px;height:15px}
    .ob-close svg{width:15px;height:15px}
    /* ==== флип-карточка стиля: ховер → скрин интерфейса, тонированный под тему ==== */
    .ob-theme{perspective:1200px;background:none!important;border:none!important;overflow:visible!important;box-shadow:none!important;padding:0}
    .ob-theme-inner{position:relative;transform-style:preserve-3d;transition:transform .8s cubic-bezier(.16,1,.3,1)}
    .ob-theme:hover .ob-theme-inner{transform:rotateY(180deg)}
    .ob-theme-front,.ob-theme-back{border-radius:18px;overflow:hidden;-webkit-backface-visibility:hidden;backface-visibility:hidden;border:1.5px solid rgba(143,180,255,.18);background:rgba(13,22,44,.62)}
    .ob-theme-back{position:absolute;inset:0;transform:rotateY(180deg);display:flex;flex-direction:column;background:#0a1224}
    .ob-theme-back img{width:100%;flex:1;min-height:0;object-fit:cover;object-position:top left}
    .ob-theme-back-lbl{padding:10px 14px;font-size:12px;font-weight:700;color:#CBD9F5;background:rgba(10,18,38,.92);border-top:1px solid rgba(143,180,255,.14);text-align:left}
    .ob-theme.on{box-shadow:0 30px 72px -24px rgba(37,99,235,.62)!important}
    .ob-theme.on .ob-theme-front,.ob-theme.on .ob-theme-back{border-color:#5B84FF;box-shadow:0 0 0 1px #5B84FF inset}
    /* фикс крестика: центрируем SVG */
    .ob-close{display:flex;align-items:center;justify-content:center}
    /* ==== шаг тарифов ==== */
    .ob-price{display:grid;grid-template-columns:1.12fr .88fr;gap:24px;align-items:stretch;max-width:900px}
    .ob-price-card{position:relative;padding:26px;border-radius:20px;border:1.5px solid transparent;background:linear-gradient(rgba(17,29,62,.82),rgba(13,22,44,.84)) padding-box,linear-gradient(135deg,#5B84FF,#2F6BFF) border-box;box-shadow:0 34px 84px -24px rgba(37,99,235,.6)}
    .ob-price-beta{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#8FB4FF;border:1px solid rgba(143,180,255,.35);border-radius:999px;padding:5px 12px;margin-bottom:14px}
    .ob-price-name{font-size:15px;font-weight:700;color:#AEBFE0}
    .ob-price-val{display:flex;align-items:baseline;gap:9px;margin:6px 0 2px}
    .ob-price-val s{font-size:22px;color:#7286AB}
    .ob-price-val b{font-size:52px;font-weight:800;letter-spacing:-.03em;color:#fff;line-height:1}
    .ob-price-val span{font-size:16px;color:#9DB0D6}
    .ob-price-seats{font-size:13px;color:#9DB0D6;margin-bottom:16px}
    .ob-price-list{list-style:none;padding:0;margin:0 0 20px;display:grid;gap:10px}
    .ob-price-list li{display:flex;gap:10px;align-items:flex-start;font-size:14px;color:#CBD9F5}
    .ob-price-list li svg{width:15px;height:15px;flex:0 0 15px;color:#7CE0B0;margin-top:2px}
    .ob-do-pay{width:100%;justify-content:center;display:flex;align-items:center}
    .ob-price-rr{display:flex;align-items:center;gap:7px;font-size:12px;color:#8296BC;margin-top:12px;justify-content:center}
    .ob-price-rr svg{width:13px;height:13px;flex:0 0 13px;color:#7CE0B0}
    .ob-price-side{display:flex;flex-direction:column;gap:16px;justify-content:center}
    .ob-price-badge{text-align:center;padding:22px;border-radius:18px;background:linear-gradient(160deg,rgba(37,99,235,.22),rgba(29,79,216,.12));border:1px solid rgba(143,180,255,.25);font-weight:800;font-size:56px;letter-spacing:-.03em;color:#fff;line-height:.9}
    .ob-price-badge span{display:block;font-size:14px;font-weight:600;color:#9DB0D6;letter-spacing:0;margin-top:8px;line-height:1.25}
    .ob-price-why{padding:18px;border-radius:16px;border:1px solid rgba(143,180,255,.16);background:rgba(14,24,46,.5)}
    .ob-price-why b{display:block;font-size:14.5px;margin-bottom:6px;color:#EAF1FF}
    .ob-price-why span{font-size:13px;color:#9DB0D6;line-height:1.5}
    /* ==== зум-превью стиля: ховер → почти на весь экран ==== */
    .ob-zoom{position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .28s ease;background:rgba(4,9,20,.55);backdrop-filter:blur(4px)}
    .ob-zoom.on{opacity:1}
    .ob-zoom-card{position:relative;width:min(80vw,1180px);aspect-ratio:16/9.6;max-height:82vh;border-radius:20px;overflow:hidden;border:1.5px solid rgba(143,180,255,.35);box-shadow:0 60px 130px -30px rgba(0,0,0,.85),0 0 100px -30px rgba(37,99,235,.5);transform:scale(.9) translateY(10px);transition:transform .4s cubic-bezier(.16,1,.3,1)}
    .ob-zoom.on .ob-zoom-card{transform:none}
    .ob-zoom-card img{width:100%;height:100%;object-fit:cover;object-position:top left;display:block}
    .ob-zoom-lbl{position:absolute;left:0;right:0;bottom:0;padding:16px 22px;font-size:15px;font-weight:700;color:#EAF1FF;background:linear-gradient(transparent,rgba(4,9,20,.85))}
    @media(max-width:820px){.ob-price{grid-template-columns:1fr}.ob-price-side{flex-direction:row}.ob-price-badge{flex:1}.ob-zoom-card{width:94vw}}
    @media(prefers-reduced-motion:reduce){.ob-orbs i,.ob-primary:after,.ob-do:after,.ob-bgvid video,.ob-done-mark{animation:none!important}}
    `;
    const s = document.createElement('style'); s.id = 'ob-style'; s.textContent = css; document.head.appendChild(s);
  }

  // ============================================================
  //  WebGL-шейдер: живая кобальт-небула, реагирует на курсор
  // ============================================================
  let _raf = 0, _mouse = { x: .5, y: .5, tx: .5, ty: .5 };
  function startShader(canvas) {
    if (!canvas) return;
    let gl; try { gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl'); } catch (e) {}
    if (!gl) return;
    const vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    const fs = [
      'precision highp float;uniform vec2 r;uniform float t;uniform vec2 m;',
      'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
      'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}',
      'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p*=2.03;a*=.5;}return v;}',
      'void main(){vec2 uv=gl_FragCoord.xy/r.xy;vec2 q=uv;q.x*=r.x/r.y;float tt=t*.028;',
      'vec2 fl=vec2(fbm(q*1.5+tt),fbm(q*1.5-tt+7.));',
      'float f=fbm(q*2.3+fl*1.35+vec2(tt*1.4,-tt));',
      'vec3 deep=vec3(.006,.018,.05),cob=vec3(.04,.13,.46),hi=vec3(.18,.30,.78);',
      'vec3 col=mix(deep,cob,smoothstep(.30,.86,f));',
      'col=mix(col,hi,smoothstep(.72,.99,f)*.38);',
      'vec2 mp=m;mp.x*=r.x/r.y;float d=distance(q,mp);col+=vec3(.09,.22,.62)*exp(-d*3.9)*.42;',
      'col*=1.-.62*smoothstep(.28,1.05,distance(uv,vec2(.5,.44)));',
      'gl_FragColor=vec4(col,1.);}'
    ].join('');
    function sh(ty, src) { const s = gl.createShader(ty); gl.shaderSource(s, src); gl.compileShader(s); return s; }
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const pl = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(pl); gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 0, 0);
    const ur = gl.getUniformLocation(prog, 'r'), ut = gl.getUniformLocation(prog, 't'), um = gl.getUniformLocation(prog, 'm');
    const start = performance.now();
    function resize() { const dpr = Math.min(devicePixelRatio || 1, 1.5); canvas.width = Math.floor(innerWidth * dpr); canvas.height = Math.floor(innerHeight * dpr); gl.viewport(0, 0, canvas.width, canvas.height); }
    resize(); canvas._resize = resize; addEventListener('resize', resize);
    (function loop() {
      _mouse.x += (_mouse.tx - _mouse.x) * .06; _mouse.y += (_mouse.ty - _mouse.y) * .06;
      gl.uniform2f(ur, canvas.width, canvas.height);
      gl.uniform1f(ut, (performance.now() - start) / 1000);
      gl.uniform2f(um, _mouse.x, _mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      _raf = requestAnimationFrame(loop);
    })();
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
    if (isOwner && !st.settings.agency.onboarded) { _autoShown = true; setTimeout(() => open({ auto: true }), 400); return true; }
    return false;
  }
  // самополлинг — на случай, если app.js вызвал maybeAuto раньше нашей загрузки
  (function pollAuto(n) { if (_autoShown || root) return; if (maybeAuto()) return; if (n > 0) setTimeout(() => pollAuto(n - 1), 350); })(16);

  // ---------- публичный API + триггеры ----------
  window.Onboard = { open, close, maybeAuto };
  addEventListener('hashchange', () => { if (location.hash === '#setup') { history.replaceState(null, '', location.pathname); open(); } });
  document.addEventListener('click', (e) => { const t = e.target.closest('[data-onboard]'); if (t) { e.preventDefault(); open(); } });
})();
