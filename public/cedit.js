/* Редактор карусели соц-помощника (поверх серверного рендера /car/:id).
   Дизайн: тонкая верхняя полоса + боковая панель. Клик по слайду выбирает его → панель показывает его настройки.
   Тексты = [data-ce="idx:field"], слайды = .slide[data-idx]. Отдельный файл — обход </script>-ловушки. */
(() => {
  const P = window.CEDIT || {};
  const KEY = P.key || '';
  /* растровые паки стикеров (нарезанные из шитов) + смысловой индекс для авто-подстановки */
  let STK_PACKS = null; const STK_LABEL = {}, STK_KW = {};
  fetch('/assets/stickers/index.json', { cache: 'no-cache' }).then(r => r.json()).then(j => { STK_PACKS = j.packs || []; STK_PACKS.forEach(p => p.items.forEach(it => { STK_LABEL[it.key] = it.label; STK_KW[it.key] = it.kw || []; })); }).catch(() => { STK_PACKS = []; });
  const BULLET_DIRS = ['bullets-modern', 'bullets-lux', 'bullets-ios', 'bullets-flat', 'bullets'];
  /* авто-подбор иконки-буллета по тексту ВСЕХ тезисов (единый маркер) */
  function autoBulletKey(points) {
    const txt = (points || []).join(' ').toLowerCase().replace(/ё/g, 'е');
    if (!txt || !STK_PACKS) return '';
    let best = '', bestScore = 0;
    (STK_PACKS || []).filter(p => BULLET_DIRS.includes(p.dir)).forEach(p => p.items.forEach(it => {
      let sc = 0; (it.kw || []).forEach(k => { if (k && txt.includes(String(k).toLowerCase().replace(/ё/g, 'е'))) sc++; });
      if (sc > bestScore) { bestScore = sc; best = it.key; }
    }));
    return best;
  }
  /* ⭐ ПО-СТРОЧНЫЙ авто-подбор: на КАЖДУЮ строку — свой уместный маркер по её смыслу (без повторов, где можно) */
  function autoBulletMarks(points) {
    if (!STK_PACKS || !(points || []).length) return null;
    const pool = [];
    (STK_PACKS || []).filter(p => BULLET_DIRS.includes(p.dir)).forEach(p => p.items.forEach(it => { if (String(it.label || '').match(/^\d+$/)) return; pool.push(it); }));   /* без чисто-числовых */
    const used = new Set();
    const NEUTRAL = ['check', 'dot', 'diamond', 'ring', 'star', 'arrow'];
    return points.map((pt, i) => {
      const t = String(pt || '').toLowerCase().replace(/ё/g, 'е').replace(/<[^>]*>/g, '');
      let best = null, bestSc = 0;
      for (const it of pool) {
        if (used.has(it.key)) continue;
        let sc = 0; (it.kw || []).forEach(k => { const w = String(k).toLowerCase().replace(/ё/g, 'е'); if (w.length >= 3 && t.includes(w)) sc += 2; });
        if (sc > bestSc) { bestSc = sc; best = it; }
      }
      if (best && bestSc >= 2) { used.add(best.key); return 'img:' + best.key; }
      return NEUTRAL[i % NEUTRAL.length];   /* ничего по смыслу — аккуратный нейтральный маркер (варьируется) */
    });
  }
  /* ⭐ нумерация 1·2·3: серия число-иконок из пака (label = «1».«2»…) или встроенный 'num' */
  function numberMarks(points) {
    if (!(points || []).length) return null;
    let series = null;
    for (const p of (STK_PACKS || []).filter(x => BULLET_DIRS.includes(x.dir))) {
      const nums = {}; p.items.forEach(it => { const m = String(it.label || '').match(/^(\d+)$/); if (m) nums[+m[1]] = it.key; });
      if (nums[1] && nums[2] && nums[3]) { series = nums; break; }   /* пак с последовательными числами */
    }
    return points.map((_, i) => (series && series[i + 1]) ? 'img:' + series[i + 1] : 'num');
  }
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstElementChild; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const FMT = { square: '1:1', portrait: '4:5', story: '9:16' };
  const CAT = { serif: 'С засечками', sans: 'Гротеск', display: 'Акцидентные', hand: 'Рукописные' };
  /* комбо-пары заголовок+тело (bodyKey '' = Manrope). Ключи существуют в FONT_LIB. */
  const FONT_COMBOS = [['fraunces', '', 'Мягкий люкс'], ['playfair', 'inter', 'Глянец'], ['bricolage', '', 'Дизайн-студия'], ['instrument', '', 'Минимал'], ['spacegro', 'inter', 'Модерн'], ['cormorant', 'montser', 'Высокая мода'], ['unbounded', '', 'Смелый'], ['oswald', 'robotocond', 'Спорт'], ['ptserif', '', 'Редакция'], ['manrope', '', 'Чистый гротеск']];
  /* ⭐ КАТАЛОГ ПРЕСЕТОВ СТИЛЯ (один клик = тема+пара шрифтов+стиль заголовка+подложка+маркер+счётчик+футер).
     Единый источник — применяется ко ВСЕЙ карусели через существующий PATCH. group для вкладок. */
  const CAR_PRESETS = [
    // Люкс
    { k: 'soft', g: 'Люкс', name: 'Мягкий люкс', theme: 'champagne', font: 'fraunces', body: '', tstyle: 'plain', card: '', pmark: 'index', counter: 'frac', footer: 'plain' },
    { k: 'gloss', g: 'Люкс', name: 'Глянец', theme: 'klein', font: 'playfair', body: 'inter', tstyle: 'plain', card: '', pmark: 'line', counter: 'num', footer: 'serif' },
    { k: 'couture', g: 'Люкс', name: 'Высокая мода', theme: 'bordeaux', font: 'cormorant', body: 'montser', tstyle: 'italic', card: '', pmark: 'line', counter: 'roman', footer: 'serif' },
    { k: 'gold', g: 'Люкс', name: 'Золото', theme: 'goldlux', font: 'cormorant', body: 'montser', tstyle: 'gold', card: 'glass', pmark: 'diamond', counter: 'roman', footer: 'serif' },
    { k: 'pearl', g: 'Люкс', name: 'Жемчуг', theme: 'mocha', font: 'fraunces', body: '', tstyle: 'plain', card: 'glass', pmark: 'dot', counter: 'frac', footer: 'line' },
    // Тёмные
    { k: 'noir', g: 'Тёмные', name: 'Нуар', theme: 'noir', font: 'playfair', body: 'inter', tstyle: 'plain', card: '', pmark: 'line', counter: 'roman', footer: 'serif' },
    { k: 'netflix', g: 'Тёмные', name: 'Кино', theme: 'netflix', font: 'oswald', body: 'robotocond', tstyle: 'block', card: 'solid', pmark: 'arrow', counter: 'num', footer: 'pill' },
    { k: 'matrix', g: 'Тёмные', name: 'Матрица', theme: 'matrix', font: 'spacegro', body: 'firacode', tstyle: 'glow', card: '', pmark: 'chip', counter: 'num', footer: 'line' },
    { k: 'batman', g: 'Тёмные', name: 'Тёмный рыцарь', theme: 'batman', font: 'oswald', body: 'robotocond', tstyle: 'caps', card: 'solid', pmark: 'arrow', counter: 'num', footer: 'pill' },
    { k: 'midnight', g: 'Тёмные', name: 'Полночь', theme: 'midnight', font: 'instrument', body: 'inter', tstyle: 'glass', card: 'glass', pmark: 'line', counter: 'roman', footer: 'line' },
    // Модерн
    { k: 'glass', g: 'Модерн', name: 'Стекло', theme: 'slate', font: 'bricolage', body: '', tstyle: 'glass', card: 'glass', pmark: 'chip', counter: 'dot', footer: 'pill' },
    { k: 'modern', g: 'Модерн', name: 'Модерн', theme: 'slate', font: 'spacegro', body: 'inter', tstyle: 'plain', card: '', pmark: 'line', counter: 'num', footer: 'plain' },
    { k: 'studio', g: 'Модерн', name: 'Дизайн-студия', theme: 'royal', font: 'bricolage', body: 'manrope', tstyle: 'pill', card: 'glass', pmark: 'dot', counter: 'dot', footer: 'pill' },
    { k: 'minimal', g: 'Модерн', name: 'Минимал', theme: 'klein', font: 'instrument', body: 'manrope', tstyle: 'plain', card: '', pmark: 'dash', counter: 'off', footer: 'plain' },
    // Живые
    { k: 'eco', g: 'Живые', name: 'Природа', theme: 'sage', font: 'fraunces', body: 'manrope', tstyle: 'plain', card: 'glass', pmark: 'check', counter: 'frac', footer: 'line' },
    { k: 'terra', g: 'Живые', name: 'Терракота', theme: 'terracotta', font: 'playfair', body: 'manrope', tstyle: 'plain', card: '', pmark: 'index', counter: 'num', footer: 'plain' },
    { k: 'bold', g: 'Живые', name: 'Смелый', theme: 'klein', font: 'unbounded', body: 'manrope', tstyle: 'huge', card: '', pmark: 'chip', counter: 'num', footer: 'pill' },
    { k: 'emerald', g: 'Живые', name: 'Изумруд', theme: 'emerald', font: 'playfair', body: 'inter', tstyle: 'plain', card: 'glass', pmark: 'diamond', counter: 'frac', footer: 'serif' },
  ];
  /* палитра выделения текста (несколько цветов) — ключ hl-*, цвет свотча */
  const HL = [['cobalt', '#2563EB'], ['gold', '#E8B84B'], ['mint', '#34C79A'], ['rose', '#F2748F'], ['lav', '#9B8CFF'], ['sky', '#4FB6F2'], ['ink', '#0B0B0F'], ['under', 'linear-gradient(180deg,transparent 62%,#2563EB55 62%)'], ['mark', 'linear-gradient(102deg,#2563EB55,#2563EB88)', 'border-radius:5px 10px 6px 9px'], ['markg', 'linear-gradient(102deg,#E8B84B66,#E8B84Baa)', 'border-radius:6px 9px 5px 10px'], ['ring', 'transparent', 'box-shadow:inset 0 0 0 2px #2563EB;border-radius:50%']];
  /* узоры-фоны (превью для свотчей — нейтральный акцент) */
  const PATS = [['none', 'нет'], ['dots', 'точки'], ['grid', 'сетка'], ['diag', 'диагональ'], ['cross', 'крестики'], ['waves', 'волны'], ['rings', 'кольца'], ['carbon', 'карбон'], ['topo', 'топо']];
  const PATV = {
    dots: 'radial-gradient(#2563EB66 1.4px,transparent 1.5px);background-size:9px 9px',
    grid: 'linear-gradient(#2563EB44 1px,transparent 1px),linear-gradient(90deg,#2563EB44 1px,transparent 1px);background-size:11px 11px',
    diag: 'repeating-linear-gradient(45deg,#2563EB44 0 2px,transparent 2px 8px)',
    cross: 'radial-gradient(circle,#2563EB55 1px,transparent 1.4px),radial-gradient(circle,#2563EB55 1px,transparent 1.4px);background-size:12px 12px;background-position:0 0,6px 6px',
    waves: 'repeating-radial-gradient(circle at 0 100%,transparent 0 8px,#2563EB44 8px 9px)',
    rings: 'repeating-radial-gradient(circle at 80% 15%,#2563EB44 0 1px,transparent 1px 12px)',
    carbon: 'linear-gradient(27deg,#2563EB33 3px,transparent 3px),linear-gradient(207deg,#2563EB33 3px,transparent 3px);background-size:8px 8px',
    topo: 'repeating-radial-gradient(ellipse 60% 40% at 30% 20%,transparent 0 10px,#2563EB33 10px 12px)',
  };
  /* градиент-фоны (мягкая альтернатива узорам, тонируются акцентом темы на рендере) */
  const GRADS = [['none', 'нет'], ['glow', 'сияние'], ['sheen', 'отблеск'], ['aurora', 'аврора'], ['dusk', 'сумерки'], ['spot', 'софит'], ['halo', 'ореол'], ['mesh', 'меш'], ['veil', 'вуаль'], ['depth', 'глубина'], ['ember', 'жар']];
  const GRADV = {
    glow: 'radial-gradient(120% 85% at 18% 12%,#2563EB44,#fff 68%)',
    sheen: 'linear-gradient(125deg,#2563EB3a,#fff 55%,#2563EB1a)',
    aurora: 'radial-gradient(90% 70% at 85% 8%,#2563EB4d,transparent 60%),linear-gradient(160deg,#2563EB22,#fff)',
    dusk: 'linear-gradient(180deg,#fff,#2563EB4d)',
    spot: 'radial-gradient(80% 55% at 50% 0%,#2563EB47,#fff 62%)',
    halo: 'radial-gradient(70% 60% at 100% 0%,#2563EB55,transparent 55%),radial-gradient(62% 55% at 0% 100%,#2563EB2e,transparent 60%),#fff',
    mesh: 'radial-gradient(52% 46% at 14% 18%,#2563EB52,transparent 60%),radial-gradient(46% 46% at 86% 24%,#2563EB33,transparent 62%),radial-gradient(64% 58% at 60% 104%,#2563EB42,transparent 60%),#fff',
    veil: 'linear-gradient(135deg,#2563EB33,#fff 44%,#2563EB42)',
    depth: 'linear-gradient(180deg,#2563EB17,#2563EB5c)',
    ember: 'radial-gradient(92% 62% at 50% 122%,#2563EB5c,#fff 72%)',
  };
  const isDark = (h) => { const x = String(h || '').replace('#', ''); const s = x.length <= 4 ? x.split('').map(c => c + c).join('') : x; const r = parseInt(s.slice(0, 2), 16), g = parseInt(s.slice(2, 4), 16), b = parseInt(s.slice(4, 6), 16); return (0.299 * r + 0.587 * g + 0.114 * b) < 145; };
  let dirty = false, pop = null, popOutside = null, sel = 0, panelOpen = true;
  /* углы подачи карусели (ключи совпадают с CAROUSEL_ANGLES на сервере) */
  const CAR_ANGLES = [['auto', 'Универсальный', 'сбалансированно'], ['urgency', 'Срочность', 'войти первым, старт'], ['discount', 'Спецусловия', 'цена, рассрочка'], ['luxury', 'Люкс', 'эстетика, фото, планировки'], ['investment', 'Инвестиции', 'доход, ROI'], ['lifestyle', 'Образ жизни', 'район, атмосфера']];
  /* подкатегории фигур и стикеров (ключи существуют в P.shapes / P.stickers) */
  const SHAPE_CATS = { 'Базовые': ['rect', 'circle', 'ring', 'line'], 'Акценты': ['triangle', 'diamond', 'badge', 'blob', 'arrow'] };
  const STICK_CATS = { 'Акценты': ['sparkle', 'star', 'star4', 'sun', 'bolt', 'fire', 'crown', 'diamond'], 'Метки': ['pin', 'tag', 'target', 'ring', 'plus', 'arrowc', 'check'], 'Декор': ['quote', 'wave', 'dots', 'circles', 'underline', 'ribbon', 'heart'] };

  const css = document.createElement('style');
  css.textContent = `
:root{--cb:#2563EB}
.cbar{position:fixed;top:0;left:0;right:0;z-index:900;background:rgba(9,18,38,.82);backdrop-filter:blur(14px);color:#fff;display:flex;gap:10px;align-items:center;padding:9px 14px;font-family:Manrope,sans-serif;font-size:13px;border-bottom:1px solid rgba(134,175,255,.14)}
.cbar b{font-family:'Manrope',sans-serif;font-weight:700;font-size:13.5px;letter-spacing:-.01em;opacity:.96;max-width:min(46vw,420px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cbar .ctag{font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#8FB0FF;background:rgba(122,158,255,.14);border:1px solid rgba(122,158,255,.22);padding:3px 8px;border-radius:999px;flex:0 0 auto}
.cbar .sp{flex:1}
.cundo{display:inline-flex;gap:2px;background:rgba(122,158,255,.10);border:1px solid rgba(122,158,255,.20);border-radius:11px;padding:2px;margin-right:2px}
.cundo-b{padding:6px 9px!important;display:inline-flex;align-items:center;justify-content:center}
.cundo-b svg{width:17px;height:17px;display:block}
.cundo-b.off{opacity:.32;pointer-events:none}
.cbtn{background:linear-gradient(180deg,#3B78FF,#2563EB);color:#fff;border:none;border-radius:10px;padding:9px 16px;font-weight:600;font-size:13px;cursor:pointer;font-family:Manrope,sans-serif;display:inline-flex;gap:6px;align-items:center;box-shadow:0 6px 16px -6px rgba(37,99,235,.6),inset 0 1px 0 rgba(255,255,255,.22);transition:transform .14s cubic-bezier(.4,0,.2,1),box-shadow .14s,filter .14s}
.cbtn:hover{transform:translateY(-1px);box-shadow:0 11px 24px -6px rgba(37,99,235,.72),inset 0 1px 0 rgba(255,255,255,.25);filter:brightness(1.05)}
/* ⭐ яркая заметная кнопка «Добавить слайд из библиотеки» */
.cadd{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;border:none;border-radius:13px;padding:14px 16px;font-family:Manrope,sans-serif;font-weight:800;font-size:14px;letter-spacing:-.01em;color:#fff;cursor:pointer;background:linear-gradient(135deg,#3B78FF,#2563EB 55%,#7C3AED);box-shadow:0 10px 26px -8px rgba(37,99,235,.7),inset 0 1px 0 rgba(255,255,255,.28);transition:transform .14s,box-shadow .14s,filter .14s}
.cadd:hover{transform:translateY(-2px);box-shadow:0 16px 34px -8px rgba(37,99,235,.8),inset 0 1px 0 rgba(255,255,255,.3);filter:brightness(1.06)}
.cadd svg{width:18px;height:18px;display:block}
.cbtn:active{transform:translateY(0)}
.cbtn.g{background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.18);box-shadow:none}
.cbtn.g:hover{background:rgba(255,255,255,.18);transform:translateY(-1px);box-shadow:0 6px 16px -8px rgba(0,0,0,.5);filter:none}
.cbtn:disabled{opacity:.5;transform:none;box-shadow:none;filter:none}
/* боковая панель */
.cpanel{position:fixed;top:52px;right:0;bottom:0;width:308px;z-index:880;background:#fff;border-left:1px solid #E7ECF3;box-shadow:-14px 0 40px rgba(6,17,38,.10);display:flex;flex-direction:column;font-family:Manrope,sans-serif;transition:transform .22s cubic-bezier(.4,0,.2,1)}
.cpanel.closed{transform:translateX(308px)}
.cpanel-tabs{display:flex;padding:10px 12px 0;gap:4px;border-bottom:1px solid #EEF1F6}
.cpanel-tab{flex:1;border:none;background:none;padding:9px;font-weight:700;font-size:13px;color:#8a90a0;cursor:pointer;border-bottom:2px solid transparent;font-family:inherit}
.cpanel-tab.on{color:var(--cb);border-bottom-color:var(--cb)}
.cpanel-body{flex:1;overflow-y:auto;overflow-x:hidden;padding:14px 14px 40px}
.cgrp{margin-bottom:16px}
.cgrp>label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#8a90a0;font-weight:700;margin-bottom:8px}
.cthemes{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}
.cthemes.clamped .cth.xtra{display:none}
.clink{background:none;border:none;color:var(--cb);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;float:right;text-transform:none;letter-spacing:0;padding:0}
.clink:hover{text-decoration:underline}
.cgrp-hl{animation:cgrpHl 1.5s ease}
@keyframes cgrpHl{0%,100%{box-shadow:none;background:transparent}18%,55%{box-shadow:0 0 0 2px color-mix(in srgb,var(--cb) 35%,transparent);background:color-mix(in srgb,var(--cb) 8%,transparent);border-radius:12px}}
.cth{position:relative;aspect-ratio:1;border-radius:11px;border:1.5px solid #E7ECF3;cursor:pointer;overflow:hidden;background:linear-gradient(150deg,color-mix(in srgb,var(--d) 30%,var(--b)),var(--b));transition:transform .14s,box-shadow .14s,border-color .14s;padding:0}
.cth:before{content:'';position:absolute;left:8px;bottom:8px;width:15px;height:15px;border-radius:50%;background:var(--d);box-shadow:0 1px 4px rgba(0,0,0,.35),inset 0 0 0 1.5px rgba(255,255,255,.3)}
.cth:hover{transform:translateY(-2px);box-shadow:0 8px 18px -8px rgba(6,17,38,.4);border-color:#CBD6EA}
.cth.on{border-color:var(--cb);box-shadow:0 0 0 1.5px var(--cb)}
.cth.on:after{content:'';position:absolute;top:6px;right:6px;width:15px;height:15px;border-radius:50%;background:var(--cb);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6L9 17l-5-5'/%3E%3C/svg%3E");background-size:11px;background-position:center;background-repeat:no-repeat;box-shadow:0 2px 6px rgba(6,17,38,.4)}
.cseg{display:flex;background:#EEF2FA;border-radius:10px;padding:3px;gap:2px}
.cseg button{flex:1;border:none;background:none;padding:8px 6px;border-radius:7px;font-weight:600;font-size:12.5px;cursor:pointer;color:#5E6470;font-family:inherit}
.cseg button.on{background:#fff;color:var(--cb);box-shadow:0 1px 4px rgba(6,17,38,.12)}
.cbtn-row{display:flex;gap:7px;flex-wrap:wrap}
.cwbtn{flex:1;min-width:calc(50% - 4px);border:1.5px solid #E1E8F4;background:linear-gradient(180deg,#fff,#F7F9FE);border-radius:11px;padding:10px;font-weight:600;font-size:12.5px;cursor:pointer;font-family:inherit;color:#2A3346;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 1px 2px rgba(6,17,38,.05);transition:transform .15s cubic-bezier(.4,0,.2,1),border-color .15s,background .15s,box-shadow .15s,color .15s}
.cwbtn:hover{border-color:var(--cb);background:linear-gradient(180deg,#F3F7FF,#E8F0FF);color:var(--cb);transform:translateY(-1px);box-shadow:0 8px 18px -8px rgba(37,99,235,.42)}
.cwbtn:active{transform:translateY(0)}
.cwbtn.wide{min-width:100%}
.cwbtn.on{border-color:var(--cb);background:linear-gradient(180deg,#EAF1FF,#DBE7FF);color:var(--cb);box-shadow:inset 0 0 0 1px var(--cb)}
.cwbtn.dng:hover{border-color:#E0483D;background:#FDEEEC;color:#E0483D;box-shadow:0 8px 18px -8px rgba(224,72,61,.42)}
.cfontbtn{width:100%;border:1.5px solid #E1E8F4;background:#fff;border-radius:10px;padding:11px 12px;font-weight:600;font-size:13px;cursor:pointer;font-family:inherit;color:#2A3346;display:flex;align-items:center;gap:10px;text-align:left}
.cfontbtn .aa{font-size:20px}
.cfontbtn:hover{border-color:var(--cb)}
.cfontcombos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
.cfcombo{display:flex;align-items:center;gap:9px;border:1.5px solid #E1E8F4;background:linear-gradient(180deg,#fff,#F7F9FE);border-radius:11px;padding:9px 10px;cursor:pointer;font-family:inherit;text-align:left;transition:border-color .14s,transform .14s,box-shadow .14s}
.cfcombo:hover{border-color:var(--cb);transform:translateY(-1px);box-shadow:0 8px 18px -8px rgba(37,99,235,.4)}
.cfcombo.on{border-color:var(--cb);box-shadow:inset 0 0 0 1px var(--cb);background:linear-gradient(180deg,#EAF1FF,#DBE7FF)}
.cfcombo .cfc-aa{font-size:24px;line-height:1;flex:0 0 auto;color:#1B2740}
.cfcombo .cfc-t{display:flex;flex-direction:column;min-width:0}
.cfcombo .cfc-t b{font-size:12.5px;font-weight:700;color:#2A3346;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cfcombo .cfc-t i{font-style:normal;font-size:10px;color:#9aa1b2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* каталог пресетов стиля */
.cpreset-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:8px}
.cpreset{border:1.5px solid #E7ECF3;border-radius:13px;cursor:pointer;overflow:hidden;padding:0;background:#fff;transition:border-color .14s,transform .14s,box-shadow .14s;display:flex;flex-direction:column;min-width:0}
.cpreset:hover{border-color:var(--cb);transform:translateY(-2px);box-shadow:0 12px 24px -12px rgba(37,99,235,.5)}
.cpreset.on{border-color:var(--cb);box-shadow:inset 0 0 0 1.5px var(--cb)}
.cpreset-cv{position:relative;aspect-ratio:4/5;display:flex;flex-direction:column;justify-content:flex-end;gap:4px;padding:11px 11px 12px;overflow:hidden}
.cpreset-cv .pv-eye{font-size:7.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.92}
.cpreset-cv .pv-h{font-size:15px;font-weight:600;line-height:1.06;letter-spacing:-.01em}
.cpreset-cv .pv-badge{position:absolute;top:9px;right:9px;font-size:7px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:2px 6px;border-radius:99px;background:rgba(255,255,255,.22);color:#fff;backdrop-filter:blur(4px)}
.cpreset i{font-style:normal;font-size:11px;font-weight:600;color:#2A3346;padding:7px 9px;border-top:1px solid #EEF1F6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:#fff}
/* фото-раскладки */
.cpl-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:8px}
.cpl{border:1.5px solid #E1E8F4;border-radius:11px;cursor:pointer;padding:6px;background:#fff;transition:border-color .14s,transform .14s,box-shadow .14s;display:flex;flex-direction:column;gap:5px;min-width:0}
.cpl:hover{border-color:var(--cb);transform:translateY(-2px);box-shadow:0 10px 20px -10px rgba(37,99,235,.45)}
.cpl-cv{position:relative;aspect-ratio:4/5;border-radius:7px;overflow:hidden;background:#EDF1F8}
.cpl-cv b{position:absolute;background:linear-gradient(135deg,#A9BEE0,#CBD9EF);box-shadow:inset 0 0 0 1px rgba(255,255,255,.7)}
.cpl i{font-style:normal;font-size:10px;font-weight:600;color:#5E6470;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* библиотека раскладок слайда (Gamma-стиль) */
.clay-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:8px}
.clay{border:1.5px solid #E1E8F4;border-radius:12px;cursor:pointer;padding:7px;background:#fff;transition:border-color .14s,transform .14s,box-shadow .14s;display:flex;flex-direction:column;gap:6px;min-width:0;font-family:inherit}
.clay:hover{border-color:var(--cb);transform:translateY(-2px);box-shadow:0 10px 20px -10px rgba(37,99,235,.45)}
.clay.on{border-color:var(--cb);box-shadow:inset 0 0 0 1.5px var(--cb)}
.clay-cv{position:relative;aspect-ratio:1.5/1;border-radius:8px;overflow:hidden;background:#F3F6FC;border:1px solid #E7ECF5;display:flex}
.clay i{font-style:normal;font-size:11px;font-weight:650;color:#3A4353;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* мини-макеты раскладок: заголовок=акцент, текст=серые строки, фото=градиент с иконкой */
.clm{position:relative;width:100%;height:100%;display:flex;flex-direction:column;justify-content:flex-end}
.clm.pad{padding:9px 10px;gap:5px}
.clm.ctr{justify-content:center;align-items:center;text-align:center}
.lm-hd{display:block;height:5px;border-radius:2px;background:var(--cb)}
.lm-l{display:block;height:3px;border-radius:2px;background:#AEB9CC}
.lm-gap{height:2px}
.lm-b{display:flex;align-items:center;gap:5px}
.lm-b em{width:5px;height:5px;border-radius:50%;background:var(--cb);flex:none}
.lm-card{display:block;height:12px;border-radius:5px;background:#fff;border:1px solid #D4DEEC;box-shadow:0 1px 2px rgba(20,40,80,.05)}
.lm-grid{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:1fr;gap:5px;width:100%;height:100%}
.lm-grid u{background:#fff;border:1px solid #D4DEEC;border-radius:5px}
.lm-bh{display:block;height:9px;border-radius:3px;background:var(--cb);margin:0 auto}
.lm-num{font-size:30px;font-weight:800;color:var(--cb);line-height:.8;letter-spacing:-.03em}
/* фото-раскладки */
.lm-ph{position:absolute;inset:0;background:linear-gradient(135deg,#8FA9D6,#B9CCEA);display:grid;place-items:center;color:rgba(255,255,255,.72)}
.lm-ph svg{width:22px;height:22px}
.lm-scrim{position:absolute;inset:0;background:linear-gradient(180deg,transparent 40%,rgba(10,16,30,.68))}
.clm.phfill{padding:0}
.lm-cap{position:relative;z-index:2;margin-top:auto;padding:9px 10px;display:flex;flex-direction:column;gap:4px;width:100%}
.lm-cap.ctr{margin:auto;align-items:center}
.lm-cap .lm-hd{background:#fff}.lm-cap .lm-l{background:rgba(255,255,255,.8)}
.clm.split{padding:0;gap:0}
.clm.split .lm-ph{position:relative;flex:1;inset:auto}
.lm-panel{background:#fff;padding:7px 9px 8px;display:flex;flex-direction:column;gap:4px;border-top:2px solid var(--cb)}
.lm-block{position:relative;z-index:2;margin-top:auto;background:#141a26;padding:8px 10px 9px;display:flex;flex-direction:column;gap:4px}
.lm-block .lm-hd{background:#fff}.lm-block .lm-l{background:rgba(255,255,255,.55)}
.clay-hero{margin-top:10px;border-top:1px dashed #E1E8F4;padding-top:9px}
.clay-hero>label{font-size:11px;font-weight:700;color:#5E6470}
.clay-hero-row{display:flex;gap:7px}
.cnote-inline{font-size:9.5px;font-weight:700;color:var(--cb);background:#EEF3FF;padding:1px 7px;border-radius:99px;margin-left:6px;text-transform:none;letter-spacing:0}
/* панель объектов/слоёв слайда */
.clayers{display:flex;flex-direction:column;gap:5px;margin-top:8px;max-height:240px;overflow:auto}
.clayer{display:flex;align-items:center;gap:9px;padding:7px 9px;border:1.5px solid #E1E8F4;border-radius:10px;background:#fff;cursor:pointer;transition:border-color .12s,background .12s}
.clayer:hover{border-color:var(--cb);background:#F5F8FF}
.clayer.lsel-row{border-color:var(--cb);box-shadow:inset 0 0 0 1.5px var(--cb)}
.clayer-ic{width:26px;height:26px;flex:none;border-radius:7px;display:grid;place-items:center;color:var(--cb);background:#EEF3FF}
.clayer-ic svg{width:15px;height:15px}
.clayer-t{flex:1;min-width:0;font-size:12.5px;font-weight:600;color:#2A3346;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.clayer-acts{display:flex;gap:2px;flex:none;opacity:.45;transition:opacity .12s}
.clayer:hover .clayer-acts{opacity:1}
.clayer-acts button{width:22px;height:22px;border:none;background:#EEF1F6;border-radius:6px;cursor:pointer;font-size:12px;color:#5E6470;line-height:1;font-family:inherit;transition:background .12s,color .12s}
.clayer-acts button:hover{background:var(--cb);color:#fff}
.cfmtbar{display:flex;gap:6px}
.cfmtbar button{flex:1;border:1.5px solid #E1E8F4;background:linear-gradient(180deg,#fff,#F7F9FE);border-radius:10px;padding:9px;font-size:15px;cursor:pointer;font-weight:700;color:#2A3346;transition:transform .14s,border-color .14s,background .14s}
.cfmtbar button:hover{border-color:var(--cb);background:#EEF3FF;transform:translateY(-1px)}
/* поповер выделения (цвета) + узоры */
.hlpop{display:flex;flex-direction:column;gap:9px}
.hlrow{display:flex;gap:8px;flex-wrap:wrap;max-width:214px}
.hlsw{width:32px;height:32px;border-radius:10px;border:2px solid #fff;box-shadow:0 0 0 1px #E7ECF3,0 4px 10px -3px rgba(6,17,38,.28);cursor:pointer;transition:transform .13s cubic-bezier(.34,1.4,.5,1),box-shadow .13s}
.hlsw:hover{transform:scale(1.13);box-shadow:0 0 0 1px var(--cb),0 6px 13px -3px rgba(6,17,38,.4)}
.hloff{border:1.5px solid #E1E8F4;background:#fff;border-radius:9px;padding:9px;font-weight:600;font-size:12.5px;cursor:pointer;font-family:inherit;color:#5E6470;transition:all .14s}
.hloff:hover{border-color:#E0483D;color:#E0483D;background:#FDEEEC}
.cpats{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:8px}
.cpat{aspect-ratio:1;border:1.5px solid #E1E8F4;border-radius:10px;cursor:pointer;background-color:#F7F9FE;transition:transform .14s,border-color .14s,box-shadow .14s}
.cpat:hover{border-color:var(--cb);transform:translateY(-1px);box-shadow:0 6px 14px -6px rgba(37,99,235,.4)}
.cpat.on{border-color:var(--cb);box-shadow:inset 0 0 0 1.5px var(--cb)}
.cpat.none{display:flex;align-items:center;justify-content:center;font-size:10px;color:#9aa1b2;font-weight:700;background:#fff}
.cdrop{margin-top:8px;border:1.5px dashed #C6D2EA;border-radius:12px;background:linear-gradient(180deg,#FAFCFF,#F2F6FE);padding:18px 12px;text-align:center;cursor:pointer;transition:border-color .15s,background .15s,transform .15s}
.cdrop:hover{border-color:var(--cb);background:#EEF4FF}
.cdrop.over{border-color:var(--cb);background:#E5EEFF;transform:scale(1.01)}
.cdrop-ic{font-size:26px;line-height:1}
.cdrop-t{font-size:12.5px;color:#5E6470;margin-top:7px;line-height:1.45}
.cdrop-t b{color:var(--cb)}
.cthumb{margin-top:9px;border-radius:10px;overflow:hidden;max-height:150px}
.cthumb:empty{display:none}
.cthumb img,.cthumb video{width:100%;display:block;object-fit:cover;max-height:150px}
.swrow{display:flex;align-items:center;gap:10px;font-weight:600;font-size:12.5px;color:#2A3346}
.sw{position:relative;width:40px;height:23px;border-radius:999px;background:#D2DAEA;cursor:pointer;transition:.15s;flex:0 0 40px}
.sw.on{background:var(--cb)}.sw:after{content:'';position:absolute;top:3px;left:3px;width:17px;height:17px;border-radius:50%;background:#fff;transition:.15s}.sw.on:after{left:20px}
.cinp{width:100%;border:1.5px solid #E1E8F4;border-radius:9px;padding:9px 11px;font-size:13px;font-family:inherit;outline:none;margin-top:7px}
.cinp:focus{border-color:var(--cb)}
.ccolor{width:100%;height:40px;border:1.5px solid #E1E8F4;border-radius:9px;cursor:pointer;padding:3px;background:#fff}
.cnote{font-size:11.5px;color:#9aa1b2;margin-top:6px;line-height:1.5}
.cslide-empty{color:#9aa1b2;font-size:13px;text-align:center;padding:30px 10px;line-height:1.6}
/* поповер (шрифты) */
.cpop{position:fixed;z-index:950;background:linear-gradient(180deg,#fff,#FAFBFE);color:#0B1220;border-radius:18px;box-shadow:0 28px 72px -22px rgba(6,17,38,.44),0 4px 14px -6px rgba(6,17,38,.12),inset 0 1px 0 rgba(255,255,255,.9);border:1px solid rgba(220,228,240,.9);padding:12px;width:296px;max-width:calc(100vw - 24px);max-height:72vh;overflow:auto;font-family:Manrope,sans-serif;font-size:13.5px;transform-origin:top center;animation:cpopIn .18s cubic-bezier(.34,1.4,.5,1) both}
@keyframes cpopIn{from{opacity:0;transform:translateY(6px) scale(.97)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.cpop{animation:none}}
.cpop .srch{width:100%;border:1.5px solid #E1E8F4;border-radius:9px;padding:9px 11px;font-size:13px;font-family:inherit;outline:none;margin-bottom:6px}
.cpop .srch:focus{border-color:var(--cb)}
.cpop .cseg{margin-bottom:6px}
.fprow{display:flex;align-items:center;gap:13px;padding:8px 11px;border-radius:10px;cursor:pointer}
.fprow:hover{background:#EEF3FF}.fprow.on{background:#F5F8FF;box-shadow:inset 0 0 0 1px var(--cb)}
.fprow .aa{font-size:22px;width:36px;flex:0 0 36px;text-align:center;line-height:1}
.fprow .nm{flex:1;min-width:0;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cstatus{position:fixed;bottom:18px;left:calc(50% - 154px);transform:translateX(-50%);z-index:960;background:#0A1833;color:#fff;border:1px solid rgba(134,175,255,.2);border-radius:999px;padding:10px 20px;font-size:13px;font-weight:600;font-family:Manrope,sans-serif;box-shadow:0 12px 34px rgba(6,17,38,.45);display:none}
body.cpanel-on{padding-right:308px!important}
@media print{.cbar,.cpanel,.cstatus{display:none!important}body{padding-right:0!important}}
@media(max-width:820px){.cpanel{width:86vw}.cpanel.closed{transform:translateX(90vw)}body.cpanel-on{padding-right:0!important}}
.csec{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:#8a90a0;padding:8px 2px 3px;font-weight:700}
.cpi{display:flex;gap:8px;align-items:center;justify-content:center;padding:9px 11px;border-radius:9px;cursor:pointer;font-weight:600;font-size:13px;background:#EEF3FF;color:#2563EB;margin-top:4px}
.cpi:hover{background:#e0eaff}
.cpop.cpop-el{width:340px;max-width:calc(100vw - 20px)}
/* ⭐ по-строчные маркеры */
.cpop.cpop-pml{width:390px;max-width:calc(100vw - 20px)}
.cpml-list{display:flex;flex-direction:column;gap:7px;margin-top:8px;max-height:360px;overflow:auto}
.cpml-row{display:flex;align-items:center;gap:9px;padding:7px 8px;border:1.5px solid #E7ECF3;border-radius:11px;background:#fff}
.cpml-cur{flex:0 0 22px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:15px;color:var(--cb);font-weight:800}
.cpml-tx{flex:1;font-size:12px;color:#2A3346;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cpml-opts{display:flex;gap:3px;flex:0 0 auto}
.cpml-opts button{width:26px;height:26px;border:1px solid #E1E8F4;background:#F7F9FE;border-radius:7px;cursor:pointer;font-size:13px;color:#2A3346;display:flex;align-items:center;justify-content:center;padding:0}
.cpml-opts button:hover{border-color:var(--cb);background:#EEF3FF}
.celem-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:7px;margin-top:8px;max-height:320px;overflow:auto}
.celem{aspect-ratio:1;border:1.5px solid #E1E8F4;border-radius:10px;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#2A3346;padding:8px}
.celem:hover{border-color:#2563EB;background:#EEF3FF;color:#2563EB}
.celem svg{width:100%;height:100%}
.celem.cimgpick{background-size:cover;background-position:center;padding:0}
.celem{touch-action:none}
.celem-ghost{position:fixed;z-index:985;width:52px;height:52px;transform:translate(-50%,-50%);pointer-events:none;color:var(--cb);display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 8px 18px rgba(6,17,38,.45));opacity:.95}
.celem-ghost svg{width:100%;height:100%}
.slide.drop-hi{outline:3px solid var(--blue,#2563EB);outline-offset:-3px;box-shadow:0 0 0 6px color-mix(in srgb,var(--blue,#2563EB) 22%,transparent)!important}
.celem-hint{font-size:11px;color:#9aa1b2;margin-top:7px;line-height:1.45;display:flex;align-items:center;gap:6px}
.celem-hint svg{width:13px;height:13px;flex:0 0 13px}
.celem-frames{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}
.celem-fr{display:flex;flex-direction:column;gap:6px;align-items:center;border:1.5px solid #E1E8F4;border-radius:12px;background:#fff;cursor:pointer;padding:7px;font-weight:600;font-size:11px;color:#2A3346;transition:border-color .12s,transform .12s}
.celem-fr:hover{border-color:#2563EB;transform:translateY(-2px)}
.cfrpv{position:relative;width:100%;aspect-ratio:5/4;border-radius:8px;overflow:hidden;background:linear-gradient(150deg,#22345C,#0A1833)}
.cfrpv>span{position:absolute;inset:0}
.ctstyles{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:8px}
.ctst{display:flex;flex-direction:column;align-items:center;gap:3px;border:1.5px solid #E1E8F4;border-radius:10px;background:#0A1833;cursor:pointer;padding:10px 4px 6px;overflow:hidden}
.ctst .s-h{color:#fff;line-height:1;--blue:#4F7BFF;--disp:'Fraunces',serif}
.ctst i{font-style:normal;font-size:9.5px;color:#9fb2d6;font-weight:600}
.ctst:hover{border-color:#2563EB}
.ctst.on{border-color:#2563EB;box-shadow:0 0 0 1px #2563EB inset}
.ctpl-cats{overflow-x:auto;white-space:nowrap;flex-wrap:nowrap}
.ctpl-cats button{flex:0 0 auto}
.ctpl-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:9px;margin-top:8px}
.ctpl{border:1.5px solid #E7ECF3;border-radius:13px;cursor:pointer;display:flex;flex-direction:column;overflow:hidden;padding:0;background:#fff;transition:border-color .14s,transform .14s,box-shadow .14s}
.ctpl:hover{border-color:#2563EB;transform:translateY(-2px);box-shadow:0 10px 22px -10px rgba(37,99,235,.45)}
.ctpl-cv{position:relative;aspect-ratio:4/5;display:flex;flex-direction:column;justify-content:flex-end;gap:5px;padding:12px 12px 13px;overflow:hidden}
.ctpl-cv .cv-eye{font-size:8px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;opacity:.92}
.ctpl-cv .cv-h{font-size:15px;font-weight:600;line-height:1.05;color:#fff;letter-spacing:-.01em}
.ctpl-cv .cv-brand{position:absolute;left:12px;top:11px;font-size:7.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;opacity:.55;color:#fff}
.ctpl i{font-style:normal;font-size:11px;color:#2A3346;font-weight:600;padding:7px 10px;border-top:1px solid #EEF1F6;background:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* ⭐ мини-превью структуры шаблона слайда (не просто заголовок — показывает раскладку) */
.ctpl-cv .cv-sub{font-size:8px;line-height:1.32;opacity:.7;margin-top:3px;max-width:97%;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ctpl-cv .cv-rows{display:flex;flex-direction:column;gap:3.5px;margin-top:6px;width:100%}
.ctpl-cv .cv-row{display:flex;align-items:center;gap:5px}
.ctpl-cv .cv-dot{width:5px;height:5px;border-radius:50%;flex:0 0 auto}
.ctpl-cv .cv-pct{font-family:var(--disp);font-size:11px;font-weight:700;letter-spacing:-.02em;flex:0 0 auto;min-width:20px}
.ctpl-cv .cv-ln{height:2px;border-radius:2px;flex:1}
.ctpl-cv .cv-bul{display:flex;align-items:center;gap:5px;font-size:7.5px;opacity:.85;line-height:1.5}
.ctpl-cv .cv-bd{width:4px;height:4px;border-radius:50%;flex:0 0 auto}
.ctpl-cv .cv-tiles{display:flex;gap:5px;margin-top:6px;width:100%}
.ctpl-cv .cv-tile{flex:1;border-radius:5px;padding:5px 2px;text-align:center;font-family:var(--disp);font-size:11px;font-weight:700;line-height:1}
.ctpl-cv .cv-big{font-family:var(--disp);font-weight:700;font-size:25px;line-height:.98;letter-spacing:-.03em}
.cpop.cpop-ctx{background:linear-gradient(180deg,rgba(19,28,50,.96),rgba(11,18,34,.97));border:1px solid rgba(134,175,255,.22);box-shadow:0 28px 70px -18px rgba(4,9,22,.7),inset 0 1px 0 rgba(255,255,255,.08);padding:7px;width:auto;min-width:214px;backdrop-filter:blur(22px) saturate(1.2);-webkit-backdrop-filter:blur(22px) saturate(1.2);border-radius:16px}
.cctx{display:flex;flex-direction:column;gap:2px}
.cctx button{display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:none;background:none;padding:10px 13px;border-radius:11px;font-size:13px;font-weight:600;color:#E4ECFF;cursor:pointer;font-family:'Manrope',sans-serif;transition:background .14s,color .14s,transform .1s}
.cctx button:active{transform:scale(.98)}
.cctx button svg{width:16px;height:16px;flex:0 0 16px;opacity:.92}
.cctx button:hover{background:linear-gradient(180deg,rgba(59,120,255,.95),rgba(37,99,235,.95));color:#fff;box-shadow:0 6px 16px -8px rgba(37,99,235,.7)}
.cctx button.dng{color:#FF9E93}
.cctx button.dng:hover{background:#E0483D;color:#fff}
.cctx-sep{height:1px;background:rgba(134,175,255,.16);margin:4px 6px}
.celem-add-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:8px}
.celem-add{display:flex;flex-direction:column;align-items:center;gap:6px;border:1.5px solid #E1E8F4;border-radius:12px;background:#fff;cursor:pointer;padding:11px 4px 8px;font-size:11px;font-weight:600;color:#5E6470;font-family:inherit;transition:border-color .12s,color .12s,transform .12s}
.celem-add:hover{border-color:#2563EB;color:#2563EB;transform:translateY(-2px)}
.celem-add-ic{width:34px;height:34px;border-radius:10px;background:#EEF3FF;display:flex;align-items:center;justify-content:center;color:#2563EB}
.celem-add-ic svg{width:19px;height:19px}
.caibtn{background:linear-gradient(120deg,#2563EB,#5B2BD8)!important;color:#fff!important;border:none!important;box-shadow:0 8px 22px -8px rgba(91,43,216,.6)}
.caibtn:hover{filter:brightness(1.06)}
.ctcolors{display:flex;flex-wrap:wrap;gap:7px}
.ctc{width:28px;height:28px;border-radius:8px;border:1.5px solid #E1E8F4;background:var(--tc,#fff);cursor:pointer;font-size:11px;font-weight:800;color:#5E6470;display:flex;align-items:center;justify-content:center;transition:transform .12s,box-shadow .12s}
.ctc:hover{transform:scale(1.1)}
.ctc.on{box-shadow:0 0 0 2px var(--cb),0 0 0 4px #fff inset}
.cangles{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px}
.cang{display:flex;flex-direction:column;gap:1px;align-items:flex-start;text-align:left;border:1.5px solid #E1E8F4;background:#fff;border-radius:10px;padding:8px 10px;cursor:pointer;font-family:inherit;transition:border-color .12s,background .12s,transform .12s}
.cang b{font-size:12px;font-weight:700;color:#2A3346}
.cang i{font-style:normal;font-size:10px;color:#9aa1b2;font-weight:600;line-height:1.25}
.cang:hover{border-color:var(--cb);transform:translateY(-1px)}
.cang.on{border-color:var(--cb);background:#EEF3FF;box-shadow:inset 0 0 0 1px var(--cb)}
.cang.on b{color:var(--cb)}
/* ⭐ контекстный плавающий тулбар: свои кнопки для текста / слоя (фото, стикер) */
.cqt{position:fixed;z-index:945;display:none;align-items:center;gap:2px;background:rgba(11,20,38,.95);backdrop-filter:blur(18px);border:1px solid rgba(134,175,255,.22);border-radius:12px;padding:4px;box-shadow:0 18px 50px -14px rgba(6,12,28,.72);font-family:Manrope,sans-serif}
.cqt.on{display:inline-flex}
.cqt button{min-width:30px;height:30px;padding:0 8px;border:none;border-radius:8px;background:transparent;color:#DCE6FF;font-size:13.5px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;transition:background .12s,color .12s;font-family:inherit;line-height:1}
.cqt button:hover{background:rgba(37,99,235,.92);color:#fff}
.cqt button.dng:hover{background:#E0483D}
.cqt button svg{width:16px;height:16px;display:block}
.cqt-sep{width:1px;height:18px;background:rgba(134,175,255,.22);margin:0 3px;flex:0 0 1px}
.cqt-sw{width:15px;height:15px;border-radius:4px;display:inline-block}
`;
  document.head.appendChild(css);
  document.querySelector('.wrap').style.marginTop = '8px';

  const flash = (t, ms = 1600) => { let s = $('.cstatus'); if (!s) { s = el('<div class="cstatus"></div>'); document.body.appendChild(s); } s.textContent = t; s.style.display = 'block'; clearTimeout(flash._t); if (ms) flash._t = setTimeout(() => s.style.display = 'none', ms); };
  const closePop = () => { if (popOutside) { document.removeEventListener('click', popOutside); popOutside = null; } if (pop) { pop.remove(); pop = null; } };
  const openPop = (html, x, y) => { closePop(); pop = el(`<div class="cpop">${html}</div>`); pop._t = Date.now(); document.body.appendChild(pop); const w = pop.offsetWidth, h = pop.offsetHeight; pop.style.left = Math.max(10, Math.min(x, innerWidth - w - 12)) + 'px'; pop.style.top = Math.max(58, Math.min(y, innerHeight - h - 12)) + 'px'; popOutside = (e) => { if (!pop) return; if (Date.now() - pop._t < 280) return; /* игнор трейлинг-клика открывающего жеста (иначе попап «испаряется») */ if (!pop.contains(e.target)) closePop(); }; setTimeout(() => document.addEventListener('click', popOutside), 0); return pop; };

  /* ---------- верхняя полоса ---------- */
  const bar = el(`<div class="cbar">
    <button class="cbtn g" id="cExit" title="Сохранить и выйти в CRM">← Готово</button>
    <span class="ctag">Карусель</span>
    <b>${esc(P.title || 'Без названия')}</b>
    <span class="sp"></span>
    <div class="cundo"><button class="cbtn g cundo-b" id="cUndo" title="Отменить (⌘Z)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg></button><button class="cbtn g cundo-b" id="cRedo" title="Вернуть (⌘⇧Z)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/></svg></button></div>
    <button class="cbtn g" id="cDl" title="Скачать (PDF / картинки)">Скачать</button>
    <button class="cbtn" id="cSave">Сохранить</button>
    <button class="cbtn g" id="cToggle" title="Свернуть панель">⇥</button>
  </div>`);
  document.body.appendChild(bar);

  /* ---------- боковая панель ---------- */
  const curFont = P.fonts[P.font] || Object.values(P.fonts)[0] || { name: 'Шрифт', fam: 'serif' };
  const panel = el(`<div class="cpanel">
    <div class="cpanel-tabs">
      <button class="cpanel-tab on" data-tab="design">Дизайн</button>
      <button class="cpanel-tab" data-tab="slide">Слайд</button>
    </div>
    <div class="cpanel-body" id="cBody"></div>
  </div>`);
  document.body.appendChild(panel);
  document.body.classList.add('cpanel-on');
  let tab = 'design';
  /* ⭐ сохраняем активную вкладку и выбранный слайд между перерисовками/reload —
     чинит «клик по настройке сбрасывает на Дизайн и на 1-й слайд». */
  const UIKEY = 'cedit-ui:' + (P.cid || '');
  const persistUI = () => { try { sessionStorage.setItem(UIKEY, JSON.stringify({ tab, sel })); } catch (_) {} };
  try { const st = JSON.parse(sessionStorage.getItem(UIKEY) || '{}'); if (st.tab === 'slide' || st.tab === 'design') tab = st.tab; if (Number.isInteger(st.sel) && st.sel >= 0) sel = st.sel; } catch (_) {}

  [...$$('[data-ce]'), ...$$('[data-pt]')].forEach(e => { e.setAttribute('contenteditable', 'true'); e.addEventListener('input', () => dirty = true); e.addEventListener('focus', () => { const sl = e.closest('.slide'); if (sl) selectSlide(+sl.dataset.idx, false); showTextQbar(e); jumpToPart(e); }); e.addEventListener('mouseup', () => { if (qbar && qbar._mode === 'text' && qbar._t === e) posQbar(selRect(e)); }); });

  /* очистка вставки — только текст */
  document.addEventListener('paste', (e) => { const t = e.target.closest && e.target.closest('[data-ce],[data-pt]'); if (!t) return; e.preventDefault(); const txt = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, txt); });

  const cleanHtml = (h) => String(h || '').replace(/<div>/gi, '<br>').replace(/<\/div>/gi, '')
    .replace(/<mark\b[^>]*>/gi, (mm) => { const cm = mm.match(/hl-[a-z0-9]+/i); return cm ? `<mark class="${cm[0].toLowerCase()}">` : '<mark>'; })
    .replace(/<\s*(\/?)(b|strong|i|em|u|br)\b[^>]*>/gi, (mm, s, t) => `<${s}${t.toLowerCase()}>`)
    .replace(/<(?!(?:\/?(?:b|strong|i|em|u|mark|br)>)|(?:mark class="hl-[a-z0-9]+">))[^>]*>/gi, '').replace(/&nbsp;/g, ' ').trim();

  const slideEl = (i) => document.querySelector(`.slide[data-idx="${i}"]`);
  function serialize() {
    return $$('.slide').map((sl) => {
      const i = sl.dataset.idx;
      const h = sl.querySelector(`[data-ce="${i}:heading"]`); const s = sl.querySelector(`[data-ce="${i}:sub"]`); const ey = sl.querySelector(`[data-ce="${i}:eyebrow"]`);
      const layers = $$('[data-l]', sl).map(le => { try { return JSON.parse(le.getAttribute('data-l')); } catch (e) { return null; } }).filter(Boolean);
      let rich = {}; if (sl.dataset.rich) { try { rich = JSON.parse(sl.dataset.rich); } catch (e) {} }   /* rich-режим (цифры/план) — items не редактируются в DOM */
      /* ⭐ тезисы-буллеты РЕДАКТИРУЕМЫ: читаем текст из DOM ([data-pt]), иначе — из rich */
      const ptEls = $$('[data-pt]', sl);
      const points = ptEls.length ? ptEls.map(e => cleanHtml(e.innerHTML).slice(0, 200).replace(/<[^>]*$/, '')).filter(Boolean) : (rich.points || []);   /* режем по HTML (не по видимому тексту) → 200 запас + отсечь незакрытый хвост тега, чтобы не рвать <mark>/<b> */
      return {
        heading: cleanHtml(h ? h.innerHTML : ''), sub: cleanHtml(s ? s.innerHTML : ''), eyebrow: (ey ? ey.innerText : '').trim(),
        bg: sl.dataset.bg || '', bgv: sl.dataset.bgv || '', bgc: sl.dataset.bgc || '', bgpat: sl.dataset.bgpat || '', grad: sl.dataset.grad || '', tcolor: sl.dataset.tcolor || '',
        pos: sl.dataset.pos || '', align: sl.dataset.align || 'left', size: sl.dataset.size || 'm', tstyle: (sl.dataset.tstyle && sl.dataset.tstyle !== 'plain') ? sl.dataset.tstyle : '', card: sl.dataset.card || '', layers,
        mode: rich.mode || '', items: rich.items || [], points: points, pmark: rich.pmark || 'index', pmarks: (Array.isArray(rich.pmarks) && rich.pmarks.length) ? rich.pmarks.slice(0, points.length) : null, layout: rich.layout || '', hero: rich.hero || null,
        noNum: !!sl.dataset.nonum, noBrand: !!sl.dataset.nobrand,
        free: sl.dataset.free === '1', tx: +sl.dataset.tx || 0, ty: +sl.dataset.ty || 0, tscale: +sl.dataset.tscale || 1,
        bodyScale: +sl.dataset.bscale || 1,
      };
    });
  }
  /* live-перерисовка макета БЕЗ перезагрузки страницы (никакого мигания):
     тянем свежий серверный рендер, подменяем только .wrap, заново вешаем per-node обработчики.
     Делегированные слушатели (click/contextmenu/pointerdown на document/body) переживают подмену. */
  async function liveRefresh() {
    try {
      const r = await fetch(`/car/${P.cid}?edit=1&key=${encodeURIComponent(KEY)}`, { headers: { 'X-Requested-With': 'fetch' } });
      const html = await r.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const fresh = doc.querySelector('.wrap'), cur = document.querySelector('.wrap');
      if (!fresh || !cur) { location.reload(); return; }
      const sy = window.scrollY;
      cur.style.transition = 'opacity .16s ease'; cur.style.opacity = '0';
      await new Promise(res => setTimeout(res, 120));
      cur.innerHTML = fresh.innerHTML;
      rewireLive();
      requestAnimationFrame(() => { window.scrollTo({ top: sy }); cur.style.opacity = '1'; });
    } catch (e) { location.reload(); }
  }
  function rewireLive() {
    [...$$('[data-ce]'), ...$$('[data-pt]')].forEach(e => { e.setAttribute('contenteditable', 'true'); e.addEventListener('input', () => dirty = true); e.addEventListener('focus', () => { const sl = e.closest('.slide'); if (sl) selectSlide(+sl.dataset.idx, false); showTextQbar(e); jumpToPart(e); }); e.addEventListener('mouseup', () => { if (qbar && qbar._mode === 'text' && qbar._t === e) posQbar(selRect(e)); }); });
    const n = $$('.slide').length; if (sel >= n) sel = Math.max(0, n - 1);
    $$('.slide').forEach(s => s.classList.toggle('sel', +s.dataset.idx === sel));
    renderBody();
    mountFree();
  }
  async function save(reload, extra) {
    flash('Сохраняю…', 0);
    const body = Object.assign({ slides: serialize(), title: P.title }, extra || {});
    const r = await fetch(`/api/carousels/${P.cid}?key=${encodeURIComponent(KEY)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { flash('Ошибка сохранения'); return false; }
    dirty = false;
    if (body.slides) recordHist(body.slides);   /* точка истории для undo/redo */
    if (reload === 'hard') { persistUI(); location.reload(); }
    else if (reload) { await liveRefresh(); flash('Сохранено ✓'); }
    else flash('Сохранено ✓');
    return true;
  }
  /* ── История (undo/redo) на снимках слайдов ── */
  let HIST = [], HPOS = -1, histLock = false;
  function recordHist(slides) { if (histLock) return; try { const s = JSON.stringify(slides); if (HIST[HPOS] === s) return; HIST = HIST.slice(0, HPOS + 1); HIST.push(s); if (HIST.length > 40) { HIST.shift(); } HPOS = HIST.length - 1; } catch (e) {} if (typeof syncUndoBtns === 'function') syncUndoBtns(); }
  async function histApply(slides) { histLock = true; flash('…', 0); try { const r = await fetch(`/api/carousels/${P.cid}?key=${encodeURIComponent(KEY)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slides, title: P.title }) }); if (r.ok) await liveRefresh(); } catch (e) {} finally { histLock = false; } }
  function undo() { if (HPOS > 0) { HPOS--; histApply(JSON.parse(HIST[HPOS])); flash('Отменено ↶', 900); } else flash('Нечего отменять', 900); if (typeof syncUndoBtns === 'function') syncUndoBtns(); }
  function redo() { if (HPOS < HIST.length - 1) { HPOS++; histApply(JSON.parse(HIST[HPOS])); flash('Возвращено ↷', 900); } else flash('Нечего вернуть', 900); if (typeof syncUndoBtns === 'function') syncUndoBtns(); }
  document.addEventListener('keydown', (e) => { const mod = e.metaKey || e.ctrlKey; if (!mod) return; const k = (e.key || '').toLowerCase(); if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); } });
  try { recordHist(serialize()); } catch (e) {}   /* исходное состояние */
  $('#cSave').addEventListener('click', () => save(false));
  $('#cDl').addEventListener('click', async () => { if (dirty) await save(false); window.open(`/car/${P.cid}?print=1`, '_blank'); });
  $('#cExit').addEventListener('click', async () => { if (dirty) await save(false); try { window.close(); } catch (e) {} setTimeout(() => { if (!window.closed) location.href = '/#social'; }, 250); });
  $('#cToggle').addEventListener('click', () => { panelOpen = !panelOpen; panel.classList.toggle('closed', !panelOpen); document.body.classList.toggle('cpanel-on', panelOpen); });
  $('#cUndo').addEventListener('click', () => undo());
  $('#cRedo').addEventListener('click', () => redo());
  function syncUndoBtns() { const u = $('#cUndo'), r = $('#cRedo'); if (u) u.classList.toggle('off', HPOS <= 0); if (r) r.classList.toggle('off', HPOS >= HIST.length - 1); }
  addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });

  /* подгружаем шрифты библиотеки для превью */
  Object.values(P.fonts).forEach(f => { if (f.gf) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = `https://fonts.googleapis.com/css2?${f.gf}&display=swap`; document.head.appendChild(l); } });

  /* ---------- выбор слайда ---------- */
  function selectSlide(i, switchTab = true) {
    sel = i;
    $$('.slide').forEach(s => s.classList.toggle('sel', +s.dataset.idx === i));
    if (switchTab) { tab = 'slide'; $$('.cpanel-tab').forEach(t => t.classList.toggle('on', t.dataset.tab === 'slide')); }
    if (tab === 'slide') renderBody();
    mountFree();
    persistUI();
  }
  /* быстрые действия слайда (ховер-панель + правый клик): edit/photo/dup/up/down/del/insert */
  function slideAction(act, i) {
    const arr = serialize();
    if (act === 'edit') { selectSlide(i, true); return; }
    if (act === 'del') { if (arr.length <= 1) { flash('Оставьте хотя бы 1 слайд'); return; } arr.splice(i, 1); return save(true, { slides: arr }); }
    if (act === 'dup') { arr.splice(i + 1, 0, JSON.parse(JSON.stringify(arr[i]))); return save(true, { slides: arr }); }
    if (act === 'up' && i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; sel = i - 1; persistUI(); return save(true, { slides: arr }); }   /* выбор едет вместе со слайдом */
    if (act === 'down' && i < arr.length - 1) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; sel = i + 1; persistUI(); return save(true, { slides: arr }); }
    if (act === 'insert') { arr.splice(i + 1, 0, { heading: 'Новый слайд', sub: 'Текст слайда', size: 'm', align: 'left' }); return save(true, { slides: arr }); }
    if (act === 'photo') { selectSlide(i, true); setTimeout(() => { const b = $('#cBody [data-bg="photo"]'); if (b) b.click(); }, 60); return; }
    if (act === 'recompose') {   /* Студия: другая композиция слайда (цикл грамматик на сцен-графе) */
      flash('Другая композиция…', 0);
      (async () => {
        try { const r = await fetch(`/api/studio/regen-slide?key=${encodeURIComponent(KEY)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cid: P.cid, idx: i }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); flash('Композиция: ' + j.grammar, 1500); await liveRefresh(); try { recordHist(serialize()); } catch (e2) {} } catch (e) { flash('Не вышло: ' + e.message); }
      })();
      return;
    }
  }
  document.body.addEventListener('click', (e) => {
    const sa = e.target.closest('[data-sact]');
    if (sa) { e.stopPropagation(); const sl0 = sa.closest('.cslot, .slide'); if (sl0) slideAction(sa.dataset.sact, +sl0.dataset.idx); return; }
    const sl = e.target.closest('.slide'); if (!sl) return;
    if (e.target.closest('.s-lyr, .s-frame, [data-ce]')) { selectSlide(+sl.dataset.idx, false); return; }  /* слои/текст — без смены вкладки */
    selLayer(null);
    selectSlide(+sl.dataset.idx, true);
  });
  /* правый клик по слайду — быстрое меню */
  document.body.addEventListener('contextmenu', (e) => {
    const sl = e.target.closest('.slide'); if (!sl) return;
    e.preventDefault();
    const i = +sl.dataset.idx;
    const CIC = {
      edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
      photo: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.6"/><path d="M21 16l-5-5-9 9"/>',
      dup: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
      insert: '<path d="M12 5v14M5 12h14"/>',
      up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
      down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
      del: '<path d="M6 6l12 12M18 6L6 18"/>',
    };
    const csvg = a => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${CIC[a]}</svg>`;
    const items = [['edit', 'Редактировать'], ['photo', 'Фото-фон'], ['dup', 'Дублировать'], ['insert', 'Слайд после'], ['up', 'Выше'], ['down', 'Ниже'], ['del', 'Удалить']];
    const pp = openPop(`<div class="cctx">${items.map(([a, n]) => `${a === 'del' ? '<div class="cctx-sep"></div>' : ''}<button data-ctx="${a}" class="${a === 'del' ? 'dng' : ''}">${csvg(a)}<span>${n}</span></button>`).join('')}</div>`, e.clientX, e.clientY);
    pp.classList.add('cpop-ctx');
    { const w = pp.offsetWidth, h = pp.offsetHeight; pp.style.left = Math.max(10, Math.min(e.clientX, innerWidth - w - 12)) + 'px'; pp.style.top = Math.max(58, Math.min(e.clientY, innerHeight - h - 12)) + 'px'; }
    pp.addEventListener('click', (ev) => { const b = ev.target.closest('[data-ctx]'); if (!b) return; closePop(); slideAction(b.dataset.ctx, i); });
  });

  /* ---------- слои: выбор / перетаскивание / размер / порядок / удаление ---------- */
  function selLayer(lyr) { $$('.s-lyr.lsel,.s-frame.lsel').forEach(x => x.classList.remove('lsel')); if (lyr) { lyr.classList.add('lsel'); showLayerQbar(lyr); } else hideQbar(); }
  /* монтируем ручки перетаскивания/масштаба на текст-блок выбранного «свободного» слайда */
  function mountFree() {
    $$('.s-in.s-inedit').forEach(x => { x.classList.remove('s-inedit'); x.querySelectorAll('.s-inmv,.s-inrs').forEach(h => h.remove()); });
    const sl = slideEl(sel); if (!sl || sl.dataset.free !== '1') return;
    const sin = sl.querySelector('.s-in'); if (!sin) return;
    sin.classList.add('s-inedit');
    if (!sin.querySelector('.s-inmv')) sin.insertAdjacentHTML('beforeend', '<div class="s-inmv" title="Двигать"></div><div class="s-inrs" title="Размер"></div>');
  }
  document.addEventListener('pointerdown', (e) => {
    const mv = e.target.closest('.s-inmv'), rs = e.target.closest('.s-inrs');
    if (!mv && !rs) return;
    e.preventDefault(); e.stopPropagation();
    const sin = (mv || rs).closest('.s-in'), slide = sin.closest('.slide'), sr = slide.getBoundingClientRect();
    if (mv) {
      const sx = e.clientX, sy = e.clientY, _tx = parseFloat(slide.dataset.tx), _ty = parseFloat(slide.dataset.ty), ox = isNaN(_tx) ? 10 : _tx, oy = isNaN(_ty) ? 16 : _ty;
      const move = (ev) => { const nx = Math.max(-5, Math.min(90, ox + (ev.clientX - sx) / sr.width * 100)); const ny = Math.max(-5, Math.min(92, oy + (ev.clientY - sy) / sr.height * 100)); slide.dataset.tx = nx.toFixed(1); slide.dataset.ty = ny.toFixed(1); sin.style.left = nx + '%'; sin.style.top = ny + '%'; };
      const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); dirty = true; save(false); };
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
    } else {
      const sx = e.clientX, os = +slide.dataset.tscale || 1, w0 = sin.offsetWidth || 220;
      const move = (ev) => { const ns = Math.max(0.5, Math.min(1.9, os + (ev.clientX - sx) / w0)); slide.dataset.tscale = ns.toFixed(2); sin.style.setProperty('--tsc', ns.toFixed(2)); };
      const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); dirty = true; save(false); };
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
    }
  });
  function updL(lyr, patch) { let o = {}; try { o = JSON.parse(lyr.getAttribute('data-l')) || {}; } catch (e) {} Object.assign(o, patch); lyr.setAttribute('data-l', JSON.stringify(o)); return o; }
  document.addEventListener('pointerdown', (e) => {
    const tb = e.target.closest('.lyr-tools button');
    if (tb) { e.preventDefault(); e.stopPropagation(); const lyr = tb.closest('.s-lyr,.s-frame'); if (!lyr) return;
      if (tb.hasAttribute('data-ldel')) { lyr.remove(); selLayer(null); dirty = true; save(false); return; }
      /* «Вперёд» = НА САМЫЙ ВЕРХ, «Назад» = В САМЫЙ НИЗ (видимо с одного клика, а не ±1) */
      const slide = lyr.closest('.slide'); const sibs = $$('.s-lyr,.s-frame', slide);
      const zOf = (x) => { try { return JSON.parse(x.getAttribute('data-l') || '{}').z || 0; } catch (_) { return 0; } };
      if (tb.hasAttribute('data-lup')) {
        const nz = Math.max(0, ...sibs.filter(x => x !== lyr).map(zOf)) + 1;
        updL(lyr, { z: nz }); lyr.style.zIndex = 10 + nz;
      } else {
        sibs.forEach(x => { if (x !== lyr) { const nz = zOf(x) + 1; updL(x, { z: nz }); x.style.zIndex = 10 + nz; } });
        updL(lyr, { z: 0 }); lyr.style.zIndex = 10;
      }
      selLayer(lyr); dirty = true; save(false); return;
    }
    const rs = e.target.closest('.lyr-rs');
    if (rs) { e.preventDefault(); e.stopPropagation(); const lyr = rs.closest('.s-lyr'); const slide = lyr.closest('.slide'); const sr = slide.getBoundingClientRect(); const startW = lyr.offsetWidth, startX = e.clientX; selLayer(lyr);
      const o0 = updL(lyr, {}); const w0 = +o0.w || (startW / sr.width * 100); const h0 = +o0.h || 0;
      /* ⭐ фото/картинки с заданной высотой тянутся ПРОПОРЦИОНАЛЬНО (w и h одним коэффициентом) — не искажаются.
         Shift — свободно (только ширина). Остальные слои — как раньше, по ширине. */
      const propLock = (lyr.classList.contains('lyr-img') && h0 > 0);
      const mv = (ev) => {
        const w = Math.max(3, Math.min(160, (startW + (ev.clientX - startX)) / sr.width * 100));
        lyr.style.width = w + '%'; const patch = { w: +w.toFixed(1) };
        if (propLock && !ev.shiftKey) { const nh = Math.max(3, Math.min(160, h0 * (w / w0))); lyr.style.height = nh + '%'; patch.h = +nh.toFixed(1); }
        updL(lyr, patch);
      };
      const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); dirty = true; save(false); };
      document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); return;
    }
    const lyr = e.target.closest('.s-lyr');
    if (lyr) { e.preventDefault(); e.stopPropagation(); selLayer(lyr); const slide = lyr.closest('.slide'); const sr = slide.getBoundingClientRect();
      /* ⭐ клик по ФОТО → сразу открыть раздел «Фото-раскладка» (не по стикеру) */
      if (lyr.classList.contains('lyr-img') && !lyr.classList.contains('is-sticker')) openPhotoLayoutPanel(+slide.dataset.idx);
      const o = updL(lyr, {}); const sxp = o.x || 0, syp = o.y || 0, sx = e.clientX, sy = e.clientY; let moved = false;
      const mv = (ev) => { const cx = Math.max(-30, Math.min(120, sxp + (ev.clientX - sx) / sr.width * 100)); const cy = Math.max(-30, Math.min(120, syp + (ev.clientY - sy) / sr.height * 100)); lyr.style.left = cx + '%'; lyr.style.top = cy + '%'; updL(lyr, { x: +cx.toFixed(1), y: +cy.toFixed(1) }); moved = true; };
      const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); if (moved) { dirty = true; save(false); } if (qbar && qbar._mode === 'layer' && qbar._t === lyr) posQbar(lyr.getBoundingClientRect()); };
      document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); return;
    }
    const fr = e.target.closest('.s-frame'); if (fr) { selLayer(fr); }
  });
  /* правка текста-слоя по двойному клику */
  document.addEventListener('dblclick', (e) => { const lyr = e.target.closest('.s-lyr.lyr-text'); if (!lyr) return; e.preventDefault(); const o = updL(lyr, {}); const t = prompt('Текст элемента:', o.text || ''); if (t != null) { const sp = lyr.querySelector('.lyr-tx'); if (sp) sp.textContent = t; updL(lyr, { text: t.slice(0, 140) }); dirty = true; save(false); } });

  /* ---------- панель: вкладки ---------- */
  $$('.cpanel-tab', panel).forEach(t => t.addEventListener('click', () => { tab = t.dataset.tab; $$('.cpanel-tab').forEach(x => x.classList.toggle('on', x === t)); renderBody(); persistUI(); }));

  /* live-применение метаданных текста */
  function applyMeta(i, key, val) {
    const sl = slideEl(i); if (!sl) return;
    sl.dataset[key] = val;
    const pos = sl.dataset.pos || 'center', al = sl.dataset.align || 'left', sz = sl.dataset.size || 'm';
    const hasPlBg = !!sl.querySelector('.s-lyr.lyr-img.is-plbg');   /* фото-подложка тоже даёт скрим+белый текст */
    const bgcls = (sl.dataset.bg || sl.dataset.bgv || (sl.dataset.bgc && isDark(sl.dataset.bgc)) || hasPlBg) ? ' hasbg' : '';
    const pat = (!sl.dataset.bg && !sl.dataset.bgv && !sl.dataset.bgc && sl.dataset.bgpat) ? ` pat-${sl.dataset.bgpat}` : '';
    /* сохраняем раскладку/градиент/подложку при смене позиции/размера (иначе live-превью их терял) */
    let r = {}; try { r = JSON.parse(sl.dataset.rich || '{}'); } catch (_) {}
    const lay = r.layout ? ` lay-${r.layout}` : '';
    const grad = (!sl.dataset.bg && !sl.dataset.bgv && !sl.dataset.bgc && !sl.dataset.bgpat && sl.dataset.grad) ? ` grad-${sl.dataset.grad}` : '';
    const card = (sl.dataset.card === 'glass' || sl.dataset.card === 'solid') ? ` card-${sl.dataset.card}` : '';
    sl.className = 'slide' + bgcls + ` pos-${pos} al-${al} sz-${sz}` + pat + grad + lay + card + ' sel';
    dirty = true;
  }
  /* live-применение фона */
  function setBg(i, kind, val) {
    const sl = slideEl(i); if (!sl) return;
    delete sl.dataset.bg; delete sl.dataset.bgv; delete sl.dataset.bgc;
    if (kind !== 'none') { delete sl.dataset.bgpat; sl.className = sl.className.replace(/\bpat-\w+/g, '').replace(/\s+/g, ' ').trim(); }
    sl.style.background = ''; sl.style.backgroundImage = '';
    const ov = sl.querySelector('.s-bgv'), os = sl.querySelector('.s-shade'); if (ov) ov.remove(); if (os) os.remove();
    sl.classList.remove('hasbg');
    if (kind === 'photo') { sl.dataset.bg = val; sl.style.backgroundImage = `linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.62)),url('${val}')`; sl.classList.add('hasbg'); }
    else if (kind === 'video') { sl.dataset.bgv = val; sl.insertBefore(el('<div class="s-shade"></div>'), sl.firstChild); sl.insertBefore(el(`<video class="s-bgv" autoplay muted loop playsinline src="${esc(val)}"></video>`), sl.firstChild); sl.classList.add('hasbg'); }
    else if (kind === 'color') { sl.dataset.bgc = val; sl.style.background = val; if (isDark(val)) sl.classList.add('hasbg'); }
    if (sl.querySelector('.s-lyr.lyr-img.is-plbg')) sl.classList.add('hasbg');   /* фото-подложка тоже требует скрим+белый текст (иначе заголовок нечитаем) */
    dirty = true; save(false); renderBody();
  }
  async function uploadAsset(file) {
    const r = await fetch(`/api/carousels/${P.cid}/asset?key=${encodeURIComponent(KEY)}&filename=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'ошибка загрузки'); return j.url;
  }
  function pickFile(accept, cb) { const inp = el(`<input type="file" accept="${accept}" style="display:none">`); document.body.appendChild(inp); inp.addEventListener('change', () => { if (inp.files[0]) cb(inp.files[0]); inp.remove(); }); inp.click(); }

  /* ---------- выделение текста цветом (несколько цветов + снятие) ---------- */
  function nodeMark(n, host) { let e = n && (n.nodeType === 1 ? n : n.parentElement); while (e && e !== host) { if (e.tagName === 'MARK') return e; e = e.parentElement; } return null; }
  function marksIn(range, host) { return $$('mark', host).filter(m => { try { return range.intersectsNode(m); } catch (_) { return false; } }); }
  function unwrap(m) { const p = m.parentNode; if (!p) return; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); }
  function markSel(key, host) {
    const s2 = document.getSelection(); if (!s2 || !s2.rangeCount) return;
    const range = s2.getRangeAt(0);
    const sm = nodeMark(range.startContainer, host), em = nodeMark(range.endContainer, host);
    if (sm && sm === em) { if (key === 'off') unwrap(sm); else sm.className = 'hl-' + key; host.normalize(); dirty = true; return; }
    if (key === 'off') { marksIn(range, host).forEach(unwrap); host.normalize(); dirty = true; return; }
    marksIn(range, host).forEach(unwrap);
    const sel3 = document.getSelection(); if (!sel3.rangeCount) { dirty = true; return; }
    const r2 = sel3.getRangeAt(0);
    const mk = document.createElement('mark'); mk.className = 'hl-' + key;
    try { r2.surroundContents(mk); } catch (_) { try { const f = r2.extractContents(); mk.appendChild(f); r2.insertNode(mk); } catch (e2) { dirty = true; return; } }
    [...mk.querySelectorAll('mark')].forEach(unwrap);
    host.normalize(); dirty = true;
  }

  /* ---------- ⭐ контекстный плавающий тулбар (умные быстрые кнопки под объект) ---------- */
  let qbar = null;
  const ensureQbar = () => { if (!qbar) { qbar = el('<div class="cqt"></div>'); document.body.appendChild(qbar); qbar.addEventListener('mousedown', onQbar); qbar.addEventListener('pointerdown', e => e.stopPropagation()); } return qbar; };
  const hideQbar = () => { if (qbar) { qbar.classList.remove('on'); qbar._mode = null; qbar._t = null; } };
  function selRect(field) { const s = document.getSelection(); if (s && s.rangeCount && !s.isCollapsed) { const rs = s.getRangeAt(0).getClientRects(); if (rs && rs[0] && (rs[0].width + rs[0].height) > 0) return rs[0]; } return field.getBoundingClientRect(); }
  function posQbar(rect) { const q = qbar; q.classList.add('on'); const qw = q.offsetWidth, qh = q.offsetHeight; let x = rect.left + rect.width / 2; x = Math.max(qw / 2 + 8, Math.min(x, innerWidth - qw / 2 - 8)); let top = rect.top - qh - 10; if (top < 62) { top = rect.bottom + 10; } q.style.left = x + 'px'; q.style.top = top + 'px'; q.style.transform = 'translateX(-50%)'; }
  function showTextQbar(field) {
    if (!field || !field.dataset || (!field.dataset.ce && field.dataset.pt == null)) return;
    const isHead = /:heading$/.test(field.dataset.ce || '');
    const q = ensureQbar(); q._mode = 'text'; q._t = field;
    q.innerHTML = `<button data-q="bold" title="Жирный"><b>Ж</b></button><button data-q="italic" title="Курсив"><i style="font-family:Georgia,serif">К</i></button><button data-q="mark" title="Выделить цветом / маркер"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4l5 5-9.5 9.5H5v-5.5z"/><path d="M12.5 6.5l5 5"/><path d="M4 21h16"/></svg></button><span class="cqt-sep"></span>` +
      `<button data-q="sdown" title="${isHead ? 'Меньше заголовок' : 'Меньше текст'}">A<small>−</small></button><button data-q="sup" title="${isHead ? 'Больше заголовок' : 'Больше текст'}">A<small>+</small></button>` +
      (isHead ? `<button data-q="style" title="Стиль заголовка">Стиль&nbsp;▾</button><button data-q="color" title="Цвет заголовка"><span class="cqt-sw" style="background:conic-gradient(#ef4444,#f59e0b,#eab308,#22c55e,#3b82f6,#8b5cf6,#ef4444)"></span></button>` : '') +
      `<span class="cqt-sep"></span><button data-q="clear" title="Убрать формат и выделение">✕</button>`;
    requestAnimationFrame(() => posQbar(selRect(field)));
  }
  function showLayerQbar(lyr) {
    if (!lyr) return;
    let o = {}; try { o = JSON.parse(lyr.getAttribute('data-l') || '{}'); } catch (_) {}
    const isImg = o.t === 'img' || lyr.classList.contains('lyr-img');
    const q = ensureQbar(); q._mode = 'layer'; q._t = lyr;
    q.innerHTML = `<button data-q="lfront" title="На передний план"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg></button><button data-q="lback" title="На задний план"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg></button><span class="cqt-sep"></span><button data-q="ldup" title="Дублировать"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></button>` + (isImg ? `<button data-q="lrepl" title="Заменить фото"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg></button>` : '') + `<span class="cqt-sep"></span><button data-q="lrot" title="Повернуть 15°"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v5h-5"/></svg></button>` + (isImg ? `<button data-q="lround" title="Скругление углов"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 12V8a4 4 0 0 1 4-4h4"/></svg></button><button data-q="lfilter" title="Фильтр фото"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/></svg></button>` : '') + `<span class="cqt-sep"></span><button data-q="ldel" class="dng" title="Удалить"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
    requestAnimationFrame(() => posQbar(lyr.getBoundingClientRect()));
  }
  /* z-порядок слоя: на самый верх / самый низ (как .lyr-tools) */
  function layerZ(lyr, toFront) {
    const slide = lyr.closest('.slide'); const sibs = $$('.s-lyr,.s-frame', slide);
    const zOf = (x) => { try { return JSON.parse(x.getAttribute('data-l') || '{}').z || 0; } catch (_) { return 0; } };
    if (toFront) { const nz = Math.max(0, ...sibs.filter(x => x !== lyr).map(zOf)) + 1; updL(lyr, { z: nz }); lyr.style.zIndex = 10 + nz; }
    else { sibs.forEach(x => { if (x !== lyr) { const nz = zOf(x) + 1; updL(x, { z: nz }); x.style.zIndex = 10 + nz; } }); updL(lyr, { z: 0 }); lyr.style.zIndex = 10; }
    dirty = true; save(false);
  }
  function onQbar(e) {
    const b = e.target.closest('[data-q]'); if (!b) return; e.preventDefault();
    const q = qbar, t = q._t, a = b.dataset.q;
    if (q._mode === 'text') {
      const field = t; const host = field;
      /* нет выделения → выделяем весь текст поля (кнопки работают с одного клика) */
      const ensureSel = () => { const s = document.getSelection(); field.focus(); if (!s) return false; if (s.isCollapsed || !s.toString()) { const r = document.createRange(); r.selectNodeContents(field); s.removeAllRanges(); s.addRange(r); } return !!document.getSelection().toString(); };
      if (a === 'bold') { if (!ensureSel()) return; document.execCommand('bold'); dirty = true; save(false); }
      else if (a === 'italic') { if (!ensureSel()) return; document.execCommand('italic'); dirty = true; save(false); }
      else if (a === 'clear') { ensureSel(); const s2 = document.getSelection(); if (s2 && s2.rangeCount) { marksIn(s2.getRangeAt(0), host).forEach(unwrap); host.normalize(); } document.execCommand('removeFormat'); dirty = true; save(false); }
      else if (a === 'mark') {
        if (!ensureSel()) return; const rc = b.getBoundingClientRect();
        const sw = HL.map(([k, c, ex]) => `<span class="hlsw" data-hl="${k}" style="background:${c};${ex || ''}"></span>`).join('');
        const pp = openPop(`<div class="hlpop"><div class="hlrow">${sw}</div><button class="hloff" data-hl="off">Снять выделение</button></div>`, rc.left - 96, rc.bottom + 8);
        pp.addEventListener('mousedown', (ev) => { const x = ev.target.closest('[data-hl]'); if (!x) return; ev.preventDefault(); markSel(x.dataset.hl, host); save(false); /* НЕ закрываем — можно применять к разным выделениям без переоткрытия */ });
        return;   /* иначе падение в closePop() ниже мгновенно закрывало палитру (3-я кнопка «не работала») */
      }
      else if (a === 'sdown' || a === 'sup') {
        const i = +field.closest('.slide').dataset.idx; const sl = slideEl(i);
        if (/:heading$/.test(field.dataset.ce || '')) {   /* заголовок → размер слайда S/M/L */
          const order = ['s', 'm', 'l']; const cur = sl.dataset.size || 'm'; let ni = order.indexOf(cur) + (a === 'sup' ? 1 : -1); ni = Math.max(0, Math.min(2, ni));
          applyMeta(i, 'size', order[ni]); save(false); if (tab === 'slide') renderBody();
        } else {   /* подпись/тезис → масштаб основного текста (bodyScale) */
          let bs = +sl.dataset.bscale || 1; bs = Math.max(0.7, Math.min(1.5, Math.round((bs + (a === 'sup' ? 0.1 : -0.1)) * 100) / 100)); sl.dataset.bscale = bs; sl.style.setProperty('--bscale', bs); dirty = true; save(false); flash('Текст ×' + bs, 800);
        }
        requestAnimationFrame(() => { field.focus(); posQbar(field.getBoundingClientRect()); });
      }
      else if (a === 'style') {
        const i = +field.closest('.slide').dataset.idx; const sl = slideEl(i); const rc = b.getBoundingClientRect();
        const grid = Object.entries(P.tstyles || { plain: 'Обычный' }).map(([k, n]) => `<button class="ctst ${(sl.dataset.tstyle || 'plain') === k ? 'on' : ''}" data-ts="${k}"><span class="s-h ts-${k}" style="font-size:17px;font-family:var(--disp)">Aa</span><i>${n}</i></button>`).join('');
        const pp = openPop(`<div class="ctstyles">${grid}</div>`, rc.left - 120, rc.bottom + 8);
        pp.addEventListener('mousedown', (ev) => { const x = ev.target.closest('[data-ts]'); if (!x) return; ev.preventDefault(); const k = x.dataset.ts; sl.dataset.tstyle = k; const h = sl.querySelector('.s-h'); if (h) h.className = 's-h' + (k !== 'plain' ? ' ts-' + k : ''); dirty = true; closePop(); save(false); if (tab === 'slide') renderBody(); });
        return;
      }
      else if (a === 'color') {
        const i = +field.closest('.slide').dataset.idx; const sl = slideEl(i); const rc = b.getBoundingClientRect();
        const sws = `<span class="hlsw" data-tc="" title="Авто" style="background:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#5E6470">A</span>` + Object.entries(P.tcolors || {}).map(([k, v]) => `<span class="hlsw" data-tc="${k}" style="background:${v}"></span>`).join('');
        const pp = openPop(`<div class="hlpop"><div class="hlrow">${sws}</div></div>`, rc.left - 96, rc.bottom + 8);
        pp.addEventListener('mousedown', (ev) => { const x = ev.target.closest('[data-tc]'); if (!x) return; ev.preventDefault(); const key = x.dataset.tc; if (key) sl.dataset.tcolor = key; else delete sl.dataset.tcolor; const col = key ? (P.tcolors || {})[key] : ''; const h = sl.querySelector('.s-h'), sub = sl.querySelector('.s-s'); if (h) h.style.color = col || ''; if (sub) { sub.style.color = col || ''; sub.style.opacity = col ? '.9' : ''; } dirty = true; closePop(); save(false); });
        return;
      }
      closePop && closePop();
    } else if (q._mode === 'layer') {
      const lyr = t; if (!lyr || !document.body.contains(lyr)) { hideQbar(); return; }
      if (a === 'lfront') layerZ(lyr, true);
      else if (a === 'lback') layerZ(lyr, false);
      else if (a === 'ldel') { lyr.remove(); selLayer(null); hideQbar(); dirty = true; save(false); }
      else if (a === 'ldup') { const i = +lyr.closest('.slide').dataset.idx; let o = {}; try { o = JSON.parse(lyr.getAttribute('data-l') || '{}'); } catch (_) {} const arr = serialize(); if (arr[i]) { arr[i].layers = arr[i].layers || []; const cp = Object.assign({}, o, { x: (o.x || 20) + 5, y: (o.y || 20) + 5 }); cp.z = Math.max(0, ...arr[i].layers.map(l => l.z || 0)) + 1; arr[i].layers.push(cp); save(true, { slides: arr }); hideQbar(); } }
      else if (a === 'lrepl') { pickFile('image/*', async (f) => { flash('Загружаю…', 0); try { const url = await uploadAsset(f); updL(lyr, { url }); const im = lyr.querySelector('img'); if (im) im.src = url; dirty = true; save(false); flash('Фото заменено ✓'); } catch (er) { flash('Ошибка: ' + er.message); } }); }
      else if (a === 'lrot') { let o = {}; try { o = JSON.parse(lyr.getAttribute('data-l') || '{}'); } catch (_) {} const nr = ((+o.rot || 0) + 15) % 360; updL(lyr, { rot: nr }); lyr.style.transform = `rotate(${nr}deg)`; dirty = true; save(false); posQbar(lyr.getBoundingClientRect()); }
      else if (a === 'lround') { let o = {}; try { o = JSON.parse(lyr.getAttribute('data-l') || '{}'); } catch (_) {} const R = [0, 10, 22, 40, 999]; const nr = R[(R.indexOf(+o.round || 0) + 1) % R.length] || 0; updL(lyr, { round: nr }); const im = lyr.querySelector('img'); if (im) im.style.borderRadius = nr + 'px'; dirty = true; save(false); }
      else if (a === 'lfilter') { const FILT = { grayscale: 'grayscale(1)', warm: 'sepia(.22) saturate(1.12) brightness(1.02)', dark: 'brightness(.72)', contrast: 'contrast(1.08) saturate(1.06)' }; const KEYS = ['', 'grayscale', 'warm', 'dark', 'contrast']; let o = {}; try { o = JSON.parse(lyr.getAttribute('data-l') || '{}'); } catch (_) {} const nf = KEYS[(KEYS.indexOf(o.filter || '') + 1) % KEYS.length]; updL(lyr, { filter: nf }); const im = lyr.querySelector('img'); if (im) im.style.filter = FILT[nf] || ''; dirty = true; save(false); flash('Фильтр: ' + (nf || 'нет'), 900); }
    }
  }
  /* НЕ прячем тулбар при скролле (фокус на поле сам скроллит страницу → тулбар мигал и пропадал
     навсегда). Вместо этого переанкориваемся к цели. Прячем только по Esc или клику мимо. */
  function repositionQbar() { if (!qbar || !qbar.classList.contains('on') || !qbar._t) return; const t = qbar._t; if (!document.body.contains(t)) { hideQbar(); return; } posQbar(qbar._mode === 'text' ? selRect(t) : t.getBoundingClientRect()); }
  let _rqT = null;
  addEventListener('scroll', () => { if (_rqT) return; _rqT = requestAnimationFrame(() => { _rqT = null; repositionQbar(); }); }, true);
  addEventListener('resize', repositionQbar);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideQbar(); });
  document.addEventListener('mousedown', (e) => { if (!qbar || !qbar.classList.contains('on')) return; if (e.target.closest('.cqt,.cpop,[data-ce],.s-lyr,.s-frame,.slide')) return; hideQbar(); });

  /* ---------- рендер тела панели ---------- */
  /* ⭐ клик по части слайда → правая панель прыгает к её настройке (буллеты→маркер, заголовок→стиль…) */
  function jumpToPart(field) {
    if (!field || !field.dataset) return;
    let target = null;
    if (field.dataset.pt != null) target = '#cPmark';                 /* тезис → маркер буллетов */
    else if (/:heading$/.test(field.dataset.ce || '')) target = '#cTStyleBtn';  /* заголовок → стиль */
    else if (/:sub$/.test(field.dataset.ce || '')) target = '#cCard';           /* подпись → подложка */
    else if (/:eyebrow$/.test(field.dataset.ce || '')) target = '#cPos';
    if (!target) return;
    if (tab !== 'slide') { tab = 'slide'; $$('.cpanel-tab').forEach(t => t.classList.toggle('on', t.dataset.tab === 'slide')); renderBody(); persistUI(); }
    requestAnimationFrame(() => { const body = $('#cBody'); const el2 = target && $(target, body); if (el2) { const grp = el2.closest('.cgrp') || el2; grp.scrollIntoView({ behavior: 'smooth', block: 'center' }); grp.classList.remove('cgrp-hl'); void grp.offsetWidth; grp.classList.add('cgrp-hl'); setTimeout(() => grp.classList.remove('cgrp-hl'), 1500); } });
  }
  function renderBody() {
    const body = $('#cBody');
    if (tab === 'design') { body.innerHTML = designHtml(); wireDesign(body); return; }
    const sl = slideEl(sel);
    if (!sl) { body.innerHTML = `<div class="cslide-empty">Кликните по слайду в макете,<br>чтобы редактировать его</div>`; return; }
    body.innerHTML = slideHtml(sl); wireSlide(body, sel);
  }
  const PRESET_GROUPS = [...new Set(CAR_PRESETS.map(p => p.g))];
  const TS_BADGE = { glass: 'Стекло', pill: 'Пилюля', block: 'Плашка', gold: 'Золото', glow: 'Свечение', huge: 'Крупно', caps: 'Капс', italic: 'Курсив' };
  function presetTile(p) {
    const th = (P.themes || {})[p.theme] || { blue: '#2563EB', body: '#0A1833' };
    const ff = ((P.fonts || {})[p.font] || {}).fam || 'serif';
    const dark = isDark(th.body); const txt = dark ? '#fff' : '#132446';
    const bg = `linear-gradient(155deg,color-mix(in srgb,${th.blue} 26%,${th.body}),${th.body})`;
    const on = (P.theme === p.theme && P.font === p.font && (P.bodyFont || '') === (p.body || '')) ? ' on' : '';
    const badge = TS_BADGE[p.tstyle] || (p.card === 'glass' ? 'Стекло' : '');
    return `<button class="cpreset${on}" data-preset="${p.k}"><div class="cpreset-cv" style="background:${bg}">${badge ? `<span class="pv-badge">${badge}</span>` : ''}<span class="pv-eye" style="color:${dark ? th.blue : th.blue}">Старт продаж</span><span class="pv-h" style="font-family:${ff};color:${txt}">Новый проект у моря</span></div><i>${esc(p.name)}</i></button>`;
  }
  /* ⭐ ФОТО-РАСКЛАДКИ (Real Estate): композиции для 1–4 фото. box=[x,y,w,h,round,rot] в % слайда.
     Применяются как img-слои (object-fit:cover) — движок слоёв уже это рендерит. */
  const PHOTO_LAYOUTS = [
    // 1 фото
    { k: 'f1-full', n: 1, name: 'Во весь слайд', boxes: [[0, 0, 100, 100, 0, 0]] },
    { k: 'f1-frame', n: 1, name: 'В рамке', boxes: [[7, 7, 86, 86, 10, 0]] },
    { k: 'f1-card', n: 1, name: 'Открытка', boxes: [[11, 13, 78, 74, 14, -3]] },
    { k: 'f1-band', n: 1, name: 'Верхняя лента', boxes: [[0, 0, 100, 58, 0, 0]] },
    // 2 фото
    { k: 'f2-vsplit', n: 2, name: 'Пополам ↔', boxes: [[0, 0, 50, 100, 0, 0], [50, 0, 50, 100, 0, 0]] },
    { k: 'f2-hsplit', n: 2, name: 'Пополам ↕', boxes: [[0, 0, 100, 50, 0, 0], [0, 50, 100, 50, 0, 0]] },
    { k: 'f2-bigsmall', n: 2, name: 'Большое + узкое', boxes: [[0, 0, 64, 100, 0, 0], [64, 0, 36, 100, 0, 0]] },
    { k: 'f2-overlap', n: 2, name: 'Внахлёст', boxes: [[3, 9, 60, 72, 14, -4], [42, 26, 54, 66, 14, 4]] },
    { k: 'f2-gap', n: 2, name: 'С отступом', boxes: [[3, 3, 46, 94, 12, 0], [51, 3, 46, 94, 12, 0]] },
    // 3 фото
    { k: 'f3-cols', n: 3, name: '3 колонки', boxes: [[0, 0, 33.4, 100, 0, 0], [33.3, 0, 33.4, 100, 0, 0], [66.6, 0, 33.4, 100, 0, 0]] },
    { k: 'f3-hero2', n: 3, name: 'Герой + пара', boxes: [[0, 0, 100, 60, 0, 0], [0, 60, 50, 40, 0, 0], [50, 60, 50, 40, 0, 0]] },
    { k: 'f3-1big2', n: 3, name: 'Большое + 2', boxes: [[0, 0, 62, 100, 0, 0], [62, 0, 38, 50, 0, 0], [62, 50, 38, 50, 0, 0]] },
    { k: 'f3-tilt', n: 3, name: 'Коллаж-веер', boxes: [[2, 6, 46, 60, 12, -5], [30, 30, 44, 58, 12, 3], [56, 8, 42, 56, 12, 6]] },
    // 4 фото
    { k: 'f4-grid', n: 4, name: 'Сетка 2×2', boxes: [[0, 0, 50, 50, 0, 0], [50, 0, 50, 50, 0, 0], [0, 50, 50, 50, 0, 0], [50, 50, 50, 50, 0, 0]] },
    { k: 'f4-gap', n: 4, name: 'Сетка с отступом', boxes: [[3, 3, 45.5, 45.5, 10, 0], [51.5, 3, 45.5, 45.5, 10, 0], [3, 51.5, 45.5, 45.5, 10, 0], [51.5, 51.5, 45.5, 45.5, 10, 0]] },
    { k: 'f4-hero3', n: 4, name: 'Герой + 3 ленты', boxes: [[0, 0, 100, 55, 0, 0], [0, 55, 33.4, 45, 0, 0], [33.3, 55, 33.4, 45, 0, 0], [66.6, 55, 33.4, 45, 0, 0]] },
    /* ⭐ ×2 вариаций: больше стильных схем под 1/2/3/4 фото */
    // 1 фото — доп.
    { k: 'f1-portrait', n: 1, name: 'Портрет', boxes: [[20, 4, 60, 92, 12, 0]] },
    { k: 'f1-wideband', n: 1, name: 'Широкая полоса', boxes: [[0, 20, 100, 60, 0, 0]] },
    { k: 'f1-circle', n: 1, name: 'Круг', boxes: [[20, 8, 60, 60, 999, 0]] },
    { k: 'f1-tilt', n: 1, name: 'С наклоном', boxes: [[12, 12, 76, 72, 14, -4]] },
    // 2 фото — доп.
    { k: 'f2-stack', n: 2, name: 'Стопка', boxes: [[8, 6, 66, 58, 14, -4], [30, 34, 64, 58, 14, 4]] },
    { k: 'f2-pip', n: 2, name: 'Кадр в кадре', boxes: [[0, 0, 100, 100, 8, 0], [58, 58, 38, 38, 10, 0]] },
    { k: 'f2-tallpair', n: 2, name: 'Две вертикали', boxes: [[2, 4, 47, 92, 12, 0], [51, 4, 47, 92, 12, 0]] },
    { k: 'f2-diag', n: 2, name: 'По диагонали', boxes: [[4, 4, 54, 54, 12, -3], [42, 42, 54, 54, 12, 3]] },
    { k: 'f2-topbottom', n: 2, name: 'Верх + низ (отступ)', boxes: [[6, 3, 88, 46, 12, 0], [6, 51, 88, 46, 12, 0]] },
    // 3 фото — доп.
    { k: 'f3-strip', n: 3, name: 'Плёнка (полоса)', boxes: [[0, 30, 33.4, 40, 6, 0], [33.3, 30, 33.4, 40, 6, 0], [66.6, 30, 33.4, 40, 6, 0]] },
    { k: 'f3-stagger', n: 3, name: 'Лесенка', boxes: [[2, 2, 44, 52, 12, 0], [30, 26, 44, 52, 12, 0], [56, 48, 42, 50, 12, 0]] },
    { k: 'f3-Lshape', n: 3, name: 'Г-образно', boxes: [[0, 0, 64, 62, 10, 0], [66, 0, 34, 62, 10, 0], [0, 64, 100, 36, 10, 0]] },
    { k: 'f3-bigleft', n: 3, name: 'Крупное слева', boxes: [[0, 0, 56, 100, 0, 0], [58, 0, 42, 49, 0, 0], [58, 51, 42, 49, 0, 0]] },
    // 4 фото — доп.
    { k: 'f4-strip', n: 4, name: 'Лента из 4', boxes: [[0, 34, 25, 32, 6, 0], [25, 34, 25, 32, 6, 0], [50, 34, 25, 32, 6, 0], [75, 34, 25, 32, 6, 0]] },
    { k: 'f4-pinwheel', n: 4, name: 'Вертушка', boxes: [[4, 4, 46, 46, 12, -4], [50, 6, 46, 46, 12, 4], [4, 50, 46, 46, 12, 4], [50, 50, 46, 46, 12, -4]] },
    { k: 'f4-bighero', n: 4, name: 'Большое + 3 сбоку', boxes: [[0, 0, 66, 100, 0, 0], [68, 0, 32, 32.4, 0, 0], [68, 33.8, 32, 32.4, 0, 0], [68, 67.6, 32, 32.4, 0, 0]] },
  ];
  /* ═══ Библиотека раскладок слайда (Gamma-стиль): одна структура контента → разные способы подачи.
     Меняет ТОЛЬКО s.layout (грамматику рендера lay-*) — применяется ВРУЧНУЮ по кнопке, НЕ при генерации. ═══ */
  const LAYOUTS = [
    { k: '',          name: 'Классика',      hint: 'Заголовок сверху + тезисы списком', mini: 't3' },
    { k: 'editorial', name: 'Редакторская',  hint: 'Тезисы — светлые карточки с акцентной линией', mini: 'cards' },
    { k: 'mosaic',    name: 'Мозаика',       hint: 'Тезисы плиткой 2×2 — плотная структура', mini: 'grid' },
    { k: 'typo',      name: 'Типографика',   hint: 'Крупный заголовок во весь слайд, без списка', mini: 'big' },
    { k: 'data',      name: 'Крупное число', hint: 'Цифра-герой доминирует + подпись', mini: 'num' },
    { k: 'immersive', name: 'Погружение',    hint: 'Фото затемнено, короткая фраза по центру', mini: 'imm' },
    { k: 'cinematic', name: 'Кинематограф',  hint: 'Фото на весь слайд, текст внизу', mini: 'cine' },
    { k: 'split',     name: 'Сплит',         hint: 'Фото сверху, светлая панель с текстом снизу', mini: 'split' },
    { k: 'panel',     name: 'Постер-блок',   hint: 'Фото + резкий тёмный блок с контентом', mini: 'panel' },
  ];
  function layMini(m) {
    const tx = (w, o) => `<b class="lm-l" style="width:${w}%${o != null ? ';opacity:' + o : ''}"></b>`;
    const hd = (w) => `<b class="lm-hd" style="width:${w}%"></b>`;
    const bul = (w) => `<span class="lm-b"><em></em><b class="lm-l" style="width:${w}%"></b></span>`;
    const ph = `<span class="lm-ph"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="7.5" cy="8" r="2"/><path d="M2.5 19l6-6.5 3.5 3 4.5-5.5L21.5 19z"/></svg></span>`;
    switch (m) {
      case 't3':    return `<div class="clm pad">${hd(66)}<span class="lm-gap"></span>${bul(58)}${bul(48)}${bul(38)}</div>`;
      case 'cards': return `<div class="clm pad">${hd(56)}<span class="lm-card"></span><span class="lm-card"></span></div>`;
      case 'grid':  return `<div class="clm pad"><span class="lm-grid"><u></u><u></u><u></u><u></u></span></div>`;
      case 'big':   return `<div class="clm pad ctr"><b class="lm-bh" style="width:92%"></b><b class="lm-bh" style="width:64%"></b>${tx(46, .55)}</div>`;
      case 'num':   return `<div class="clm pad ctr"><b class="lm-num">%</b>${tx(46, .55)}</div>`;
      case 'imm':   return `<div class="clm phfill">${ph}<span class="lm-scrim"></span><span class="lm-cap ctr">${hd(64)}</span></div>`;
      case 'cine':  return `<div class="clm phfill">${ph}<span class="lm-scrim"></span><span class="lm-cap">${hd(58)}${tx(40, .8)}</span></div>`;
      case 'split': return `<div class="clm split">${ph}<span class="lm-panel">${hd(60)}${tx(42, .6)}</span></div>`;
      case 'panel': return `<div class="clm phfill">${ph}<span class="lm-block">${hd(52)}${tx(40, .6)}</span></div>`;
      default: return '';
    }
  }
  function layTile(l, cur) {
    return `<button class="clay ${l.k === cur ? 'on' : ''}" data-lay="${l.k}" title="${esc(l.hint)}"><div class="clay-cv">${layMini(l.mini)}</div><i>${esc(l.name)}</i></button>`;
  }
  /* вытащить осмысленное «крупное число» из контента слайда для раскладки data */
  function deriveHero(s) {
    const strip = (x) => String(x || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
    const parts = [s.heading, ...(s.points || []), ...((s.items || []).map(it => (it.v || '') + ' ' + (it.k || it.label || '')))].map(strip);
    for (const p of parts) {
      const m = p.match(/(\$\s?\d[\d.,]*\s?(?:млн|M|k|K|млрд|B)?|\d[\d.,]*\s?(?:%|м²|m²|лет|года?|год)|20\d\d|[×x]\s?\d+)/);
      if (m) { const v = m[1].replace(/\s+/g, ''); if (v.length <= 12) { const k = p.replace(m[1], ' ').replace(/[·—–-]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ').slice(0, 28); return { v, k }; } }
    }
    return null;
  }
  function setLayout(i, k) {
    const sl = slideEl(i); if (!sl) return;
    let r = {}; try { r = JSON.parse(sl.dataset.rich || '{}'); } catch (_) {}
    r.layout = k;
    if (k === 'data' && !(r.hero && (r.hero.v || r.hero.k))) { const arr = serialize(); const h = deriveHero(arr[i] || {}); if (h) r.hero = h; }
    sl.dataset.rich = JSON.stringify(r);
    sl.className = sl.className.replace(/\blay-\w+/g, '').replace(/\s+/g, ' ').trim();
    if (k) sl.classList.add('lay-' + k);
    dirty = true;
    save(true, { slides: serialize() });
    flash(k ? 'Раскладка: ' + (LAYOUTS.find(l => l.k === k) || {}).name + ' ✓' : 'Классическая раскладка ✓', 1400);
  }
  function pickFiles(accept, cb) { const inp = el(`<input type="file" accept="${accept}" multiple style="display:none">`); document.body.appendChild(inp); inp.addEventListener('change', () => { if (inp.files && inp.files.length) cb([...inp.files]); inp.remove(); }); inp.click(); }
  function plTile(l) {
    const cells = l.boxes.map(b => `<b style="left:${b[0]}%;top:${b[1]}%;width:${b[2]}%;height:${b[3]}%;border-radius:${Math.min(b[4] || 0, 6)}px;transform:rotate(${b[5] || 0}deg)"></b>`).join('');
    return `<button class="cpl" data-pl="${l.k}"><div class="cpl-cv">${cells}</div><i>${esc(l.name)}</i></button>`;
  }
  /* фото уже на слайде: фон + img-слои (не стикеры) */
  function slidePhotos(i) { const arr = serialize(); const s = arr[i]; if (!s) return []; const u = []; if (s.bg) u.push(s.bg); (s.layers || []).forEach(l => { if (l.t === 'img' && !l.sticker && !l.avatar && l.url) u.push(l.url); }); return u; }   /* аватар НЕ фото раскладки */
  /* разложить данные url'ы по боксам раскладки (цикл, если url меньше боксов) */
  function applyPhotoLayoutTo(i, L, urls) {
    const arr = serialize(); const sl = arr[i]; if (!sl || !urls.length) return;
    sl.bg = ''; sl.bgv = '';
    sl.layers = (sl.layers || []).filter(l => !(l.t === 'img' && !l.sticker && !l.avatar));   /* стикеры И аватары оставляем */
    let z = Math.max(0, ...sl.layers.map(l => l.z || 0));
    /* ⭐ АДАПТИВНО: фото кладём в СВОБОДНУЮ от текста зону (текст сверху → фото снизу, и наоборот),
       фото остаются ПЕРЕДНИМ слоем (их видно, можно двигать/тянуть). Полноэкранная раскладка
       (f1-full / верхняя лента) — единственная, что ложится ПОДЛОЖКОЙ под текст (pl:1). */
    const fullBleed = (L.k === 'f1-full' || L.k === 'f1-band');
    const pos = sl.pos || (i === 0 ? 'bottom' : 'center');
    const zone = fullBleed ? { x: 0, y: 0, w: 100, h: 100 }
      : pos === 'top' ? { x: 4, y: 48, w: 92, h: 50 }
        : pos === 'bottom' ? { x: 4, y: 2, w: 92, h: 48 }
          : { x: 4, y: 2, w: 92, h: 43 };   /* center → верхняя часть, центр-текст ниже */
    L.boxes.forEach((bx, bi) => {
      const url = urls[bi % urls.length]; z++;
      const layer = { t: 'img', url, fit: 'cover', rot: bx[5] || 0, round: fullBleed ? (bx[4] || 0) : Math.max(bx[4] || 0, 12), z,
        x: +(zone.x + bx[0] * zone.w / 100).toFixed(1), y: +(zone.y + bx[1] * zone.h / 100).toFixed(1),
        w: +(bx[2] * zone.w / 100).toFixed(1), h: +(bx[3] * zone.h / 100).toFixed(1) };
      if (fullBleed) layer.pl = 1;   /* только полноэкранный — подложка под текст */
      sl.layers.push(layer);
    });
    save(true, { slides: arr }); flash(urls.length < L.n ? `Разложено ${urls.length} из ${L.n} — добавь фото для остальных` : 'Раскладка применена ✓', 1600);
  }
  /* ⭐ открыть слайд на вкладке «Слайд» и подсветить/прокрутить к разделу «Фото-раскладка» */
  function openPhotoLayoutPanel(idx) {
    selectSlide(idx, true);
    requestAnimationFrame(() => { const sec = ($('#cPlDet') || {}).closest ? $('#cPlDet').closest('.cgrp') : null; if (sec) { sec.scrollIntoView({ block: 'center', behavior: 'smooth' }); sec.style.animation = 'cgrpHl 1.15s ease'; setTimeout(() => { sec.style.animation = ''; }, 1250); } });
  }
  /* лучшая курируемая раскладка под N фото (1→в рамке, 2→большое+узкое, 3→герой+пара, 4→сетка с отступом) */
  function bestLayoutFor(n) {
    n = Math.max(1, Math.min(4, n));
    const cands = PHOTO_LAYOUTS.filter(l => l.n === n);
    const best = { 1: 'f1-frame', 2: 'f2-bigsmall', 3: 'f3-hero2', 4: 'f4-gap' }[n];
    return cands.find(l => l.k === best) || cands[0];
  }
  /* применить раскладку: на ДЕЙСТВУЮЩИЕ фото если есть, иначе — подгрузить.
     ⭐ НИКОГДА не теряем фото: если на слайде БОЛЬШЕ фото, чем боксов в выбранной раскладке,
        авто-повышаем до раскладки под реальное число (иначе лишние фото затирались). */
  function applyPhotoLayout(i, L) {
    const have = slidePhotos(i);
    if (have.length) {
      let LL = L;
      if (have.length > L.n) { LL = bestLayoutFor(have.length); flash(`На слайде ${have.length} фото — разложил все (раскладка на ${LL.n}), ничего не потеряно`, 1900); }
      applyPhotoLayoutTo(i, LL, have); return;
    }
    pickFiles('image/*', async (files) => {
      if (!files.length) return; flash('Загружаю фото…', 0);
      try { const urls = []; for (const f of files.slice(0, Math.max(L.n, 1))) urls.push(await uploadAsset(f)); const LL = urls.length > L.n ? bestLayoutFor(urls.length) : L; applyPhotoLayoutTo(i, LL, urls); } catch (er) { flash('Ошибка: ' + er.message); }
    });
  }
  /* ⭐ стиль оформления фото-раскладки (стекло/полароид/скотч/скрепка/тень) — на все передние фото слайда */
  function applyPhotoStyle(i, style) {
    const arr = serialize(); const s = arr[i]; if (!s) return;
    const photos = (s.layers || []).filter(l => l.t === 'img' && !l.sticker && !l.avatar && !l.pl);
    if (!photos.length) { flash('Нет фото-раскладки на слайде (полноэкранное фото не оформляется)', 1800); return; }
    photos.forEach(l => { if (style === 'none') delete l.pstyle; else l.pstyle = style; });
    save(true, { slides: arr });
    flash(style === 'none' ? 'Оформление снято ✓' : 'Стиль фото применён ✓', 1300);
  }
  /* ✨ авто: понять число фото на слайде и применить подходящую композицию */
  function autoPhotoLayout(i) {
    const have = slidePhotos(i);
    if (!have.length) { flash('На слайде нет фото — подгрузи или выбери раскладку'); return; }
    const n = Math.min(have.length, 4);
    applyPhotoLayoutTo(i, bestLayoutFor(n), have);
    flash('Авто-раскладка на ' + n + ' фото ✓', 1400);
  }
  function tplTile(tpl) {
    const th = (P.themes || {})[tpl.theme] || { blue: '#2563EB', body: '#0A1833' };
    const ff = ((P.fonts || {})[tpl.font] || {}).fam || 'serif';
    const dark = isDark(th.body);
    const txt = dark ? '#fff' : '#132446';
    const bg = `linear-gradient(155deg,color-mix(in srgb,${th.blue} 26%,${th.body}),${th.body})`;
    /* превью — мини-обложка с реальным примером текста в шрифте/теме шаблона (не просто «Aa») */
    return `<button class="ctpl" data-tpl='${esc(JSON.stringify(tpl))}'>
      <div class="ctpl-cv" style="background:${bg}">
        <span class="cv-brand" style="color:${txt}">Агентство</span>
        <span class="cv-eye" style="color:${th.blue}">СТАРТ ПРОДАЖ</span>
        <span class="cv-h" style="font-family:${ff};color:${txt}">Новый проект у моря</span>
      </div>
      <i>${esc(tpl.name)}</i>
    </button>`;
  }
  function designHtml() {
    const cats = Object.keys(P.templates || {});
    return `
    ${P.llm ? `<div class="cgrp"><button class="cwbtn wide caibtn" id="cAiCompose"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:16px;height:16px"><path d="M12 3l1.9 5.2L19 10l-5.1 1.8L12 17l-1.9-5.2L5 10l5.1-1.8z"/></svg> Оформить с ИИ по ссылке</button><div class="cnote">Вставьте ссылку на объект — ИИ вытянет инфо и фото, разложит по слайдам и соберёт слайд-галерею.</div></div>
    <div class="cgrp"><label>ИИ-выделение главного</label><div class="cbtn-row"><button class="cwbtn" id="cHl1">Один цвет</button><button class="cwbtn" id="cHl2">Два цвета</button></div><select class="cinp" id="cHlStyle" style="margin-top:6px"><option value="marker">Стиль: маркер (графика)</option><option value="solid">Стиль: заливка</option><option value="ring">Стиль: обводка</option></select><div class="cnote">ИИ подсветит ключевые слова во всех заголовках. Маркер — как подсветка хайлайтером.</div></div>` : ''}
    <div class="cgrp"><label>Пресеты стиля — один клик</label>
      <div class="cseg ctpl-cats" id="cPresetCats">${PRESET_GROUPS.map((g, i) => `<button data-pg="${i}" class="${i === 0 ? 'on' : ''}">${g}</button>`).join('')}</div>
      <div class="cpreset-grid" id="cPresetGrid">${CAR_PRESETS.filter(p => p.g === PRESET_GROUPS[0]).map(presetTile).join('')}</div>
      <div class="cnote">Тема + пара шрифтов + стиль заголовка + подложка + маркер + счётчик + футер — сразу на всю карусель.</div>
    </div>
    <div class="cgrp"><label>Цветовая тема <button class="clink" id="cThemesMore" type="button">все ▾</button></label><div class="cthemes clamped" id="cThemes">${Object.entries(P.themes || {}).map(([k, t], ti) => `<button class="cth ${k === P.theme ? 'on' : ''}${ti >= 8 ? ' xtra' : ''}" data-theme="${k}" title="${t.name}" style="--d:${t.blue};--b:${t.body}"></button>`).join('')}</div></div>
    <div class="cgrp"><label>Пары шрифтов (заголовок + текст)</label><div class="cfontcombos" id="cCombos">${FONT_COMBOS.map(([hf2, bf2, nm]) => { const H = (P.fonts[hf2] || {}), B = (P.fonts[bf2] || {}); const on = P.font === hf2 && (P.bodyFont || '') === (bf2 || ''); return `<button class="cfcombo ${on ? 'on' : ''}" data-hf="${hf2}" data-bf="${bf2}"><span class="cfc-aa" style="font-family:${H.fam || 'serif'}">Ag</span><span class="cfc-t"><b style="font-family:${H.fam || 'serif'}">${esc(nm)}</b><i style="font-family:${B.fam || 'sans-serif'}">${esc((H.name || '') + ' + ' + (B.name || 'Manrope'))}</i></span></button>`; }).join('')}</div></div>
    <div class="cgrp"><label>Шрифт заголовков</label><button class="cfontbtn" id="cFontBtn"><span class="aa" style="font-family:${curFont.fam}">Aa</span> <span style="flex:1">${curFont.name}</span> ▾</button></div>
    <div class="cgrp"><label>Шрифт основного текста</label><button class="cfontbtn" id="cBodyFontBtn"><span class="aa" style="font-family:${(P.fonts[P.bodyFont] || {}).fam || "'Manrope',sans-serif"}">Aa</span> <span style="flex:1">${(P.fonts[P.bodyFont] || {}).name || 'Manrope (по умолч.)'}</span> ▾</button></div>
    <div class="cgrp"><label>Формат</label><div class="cseg" id="cFmt">${['square', 'portrait', 'story'].map(f => `<button data-f="${f}" class="${P.format === f ? 'on' : ''}">${FMT[f]}</button>`).join('')}</div></div>
    <div class="cgrp"><label>Счётчик слайдов</label><div class="cseg" id="cCounter">${[['frac', '1/6'], ['num', '01'], ['dot', '•••'], ['roman', 'I'], ['off', 'Выкл']].map(([v, n]) => `<button data-cn="${v}" class="${(P.counter || 'frac') === v ? 'on' : ''}">${n}</button>`).join('')}</div><div class="cnote">Как нумеруются слайды. «Выкл» — убрать счётчик со всех.</div></div>
    <div class="cgrp"><label>Футер слайдов</label>
      <div class="swrow"><span class="sw ${(P.footer || {}).hide ? '' : 'on'}" id="cFtShow"></span> Показывать футер на слайдах</div>
      <div class="cseg" id="cFtStyle" style="margin-top:8px">${[['plain', 'Обычный'], ['pill', 'Пилюля'], ['line', 'Линия'], ['serif', 'Сериф']].map(([v, n]) => `<button data-fs="${v}" class="${((P.footer || {}).style || 'plain') === v ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="swrow" style="margin-top:8px"><span class="sw ${(P.footer || {}).on ? 'on' : ''}" id="cFtSw"></span> Свой текст вместо агентства</div>
      <input class="cinp" id="cFtTxt" placeholder="@ваш_аккаунт · сайт.ru" value="${esc((P.footer || {}).text || '')}">
    </div>
    <div class="cgrp"><button class="cadd" id="cAddSlide"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/></svg> Добавить слайд из библиотеки</button><div class="cnote">Готовые форматы: обложки, цифры, план оплаты, списки, цитаты, фото, CTA — с превью структуры.</div></div>
    <div class="cnote">Тема, шрифт, формат и футер применяются ко всей карусели.</div>`;
  }
  function wireDesign(body) {
    /* ИИ-выделение главных слов на всех слайдах */
    const runHl = async (colors) => {
      const style = ($('#cHlStyle', body) || {}).value || 'marker';
      flash('✦ ИИ подсвечивает главное…', 0);
      try { const r = await fetch(`/api/carousels/${P.cid}/ai-highlight?key=${encodeURIComponent(KEY)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ colors, style }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); flash(`Выделено на ${j.applied} слайдах ✓`, 1500); liveRefresh(); } catch (err) { flash('Не вышло: ' + err.message); }
    };
    { const h1 = $('#cHl1', body), h2 = $('#cHl2', body); if (h1) h1.addEventListener('click', () => runHl(1)); if (h2) h2.addEventListener('click', () => runHl(2)); }
    /* Пересобрать: меняем только незалоченное */
    $$('[data-regen]', body).forEach(btn => btn.addEventListener('click', async () => {
      const change = btn.dataset.regen; const locks = {}; $$('[data-lock]', body).forEach(cb => { if (cb.checked) locks[cb.dataset.lock] = true; });
      flash('✦ Пересобираю…', 0);
      try { const r = await fetch(`/api/carousels/${P.cid}/regenerate?key=${encodeURIComponent(KEY)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ change, locks }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); flash('Пересобрано: ' + ((j.changed || []).join(', ') || 'без изменений'), 2000); liveRefresh(); } catch (e) { flash('Не вышло: ' + e.message); }
    }));
    /* ИИ-оформление по ссылке: инфо+фото → слайды + галерея */
    const aiBtn = $('#cAiCompose', body);
    if (aiBtn) aiBtn.addEventListener('click', (e) => {
      let angle = 'auto', count = 0;
      const CNTS = [['0', 'Авто'], ['5', '5'], ['6', '6'], ['7', '7'], ['8', '8']];
      const pp = openPop(`<div class="csec">Оформить с ИИ</div>
        <input class="cinp" id="cAiUrl" placeholder="ссылка на объект/ЖК (URL)" style="margin-top:2px">
        <input class="cinp" id="cAiTopic" placeholder="или тема/вводные текстом">
        <div class="csec" style="margin-top:9px">Сколько слайдов</div>
        <div class="cseg" id="cAiCnt">${CNTS.map(([v, n], i) => `<button data-cnt="${v}" class="${i === 0 ? 'on' : ''}">${n}</button>`).join('')}</div>
        <div class="csec" style="margin-top:9px">Угол подачи</div>
        <div class="cangles" id="cAngles">${CAR_ANGLES.map(([k, n, d], i) => `<button data-ang="${k}" class="cang${i === 0 ? ' on' : ''}" title="${d}"><b>${n}</b><i>${d}</i></button>`).join('')}</div>
        <button class="cwbtn wide" id="cAiGo2" style="margin-top:9px">✦ Собрать карусель</button>
        <div class="cnote">ИИ уместит всю инфо в заданное число слайдов, разложит их разными композициями и подберёт фото по смыслу. Проверьте цифры после.</div>`, e.clientX - 262, e.clientY);
      pp.querySelectorAll('.cang').forEach(bn => bn.addEventListener('click', () => { angle = bn.dataset.ang; pp.querySelectorAll('.cang').forEach(x => x.classList.toggle('on', x === bn)); }));
      $('#cAiCnt', pp).addEventListener('click', (ev) => { const b = ev.target.closest('[data-cnt]'); if (!b) return; count = +b.dataset.cnt; pp.querySelectorAll('#cAiCnt button').forEach(x => x.classList.toggle('on', x === b)); });
      $('#cAiGo2', pp).addEventListener('click', async () => {
        const url = $('#cAiUrl', pp).value.trim(), topic = $('#cAiTopic', pp).value.trim();
        if (!url && !topic) { flash('Вставьте ссылку или тему'); return; }
        closePop(); flash('✦ ИИ собирает карусель (10–25с)…', 0);
        try { const r = await fetch(`/api/carousels/${P.cid}/ai-compose?key=${encodeURIComponent(KEY)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, topic, angle, count }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); flash(`Готово · слайдов ${j.count}${j.images ? ', фото ' + j.images : ''}`, 1500); setTimeout(() => liveRefresh(), 350); } catch (err) { flash('Не вышло: ' + err.message); }
      });
    });
    /* готовые шаблоны: категории + применение ко всем слайдам */
    /* ⭐ каталог пресетов стиля: категории + применение ко всей карусели одним кликом */
    { const pc = $('#cPresetCats', body), pg = $('#cPresetGrid', body);
      if (pc && pg) {
        pc.addEventListener('click', (e) => { const b = e.target.closest('[data-pg]'); if (!b) return; $$('#cPresetCats button', body).forEach(x => x.classList.toggle('on', x === b)); pg.innerHTML = CAR_PRESETS.filter(p => p.g === PRESET_GROUPS[+b.dataset.pg]).map(presetTile).join(''); });
        pg.addEventListener('click', (e) => { const b = e.target.closest('[data-preset]'); if (!b) return; const p = CAR_PRESETS.find(x => x.k === b.dataset.preset); if (!p) return; flash('Применяю пресет «' + p.name + '»…', 0); const arr = serialize().map(s => Object.assign({}, s, { tstyle: p.tstyle || '', card: p.card || '', pmark: (s.points && s.points.length) ? p.pmark : (s.pmark || 'index'), bgpat: '' })); save('hard', { theme: p.theme, font: p.font, bodyFont: p.body || '', counter: p.counter, footer: Object.assign({}, P.footer || {}, { style: p.footer }), slides: arr }); });
      } }
    /* тема: сворачиваемый грид (показываем 8, «все» разворачивает) */
    { const tm = $('#cThemesMore', body), tg = $('#cThemes', body); if (tm && tg) tm.addEventListener('click', () => { const cl = tg.classList.toggle('clamped'); tm.textContent = cl ? 'все ▾' : 'свернуть ▴'; }); }
    $$('.cth', body).forEach(d => d.addEventListener('click', () => save('hard', { theme: d.dataset.theme })));
    $('#cFmt', body).addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) save('hard', { format: b.dataset.f }); });
    /* ⭐ мини-превью шаблона слайда: вертикальное позиционирование как на реальном слайде */
    function stMiniPos(s) {
      const j = s.pos === 'top' ? 'flex-start' : s.pos === 'center' ? 'center' : 'flex-end';
      const ai = s.align === 'center' ? 'center' : 'flex-start';
      const ta = s.align === 'center' ? 'center' : 'left';
      return `justify-content:${j};align-items:${ai};text-align:${ta}`;
    }
    /* ⭐ мини-превью структуры (payplan/цифра/список/цитата/plain) — чтобы шаблоны НЕ были одинаковыми */
    function stMini(s, th, txt) {
      const acc = th.blue, ts = s.tstyle || 'plain', sz = s.size || 'm';
      const eye = s.eyebrow ? `<span class="cv-eye" style="color:${acc}">${esc(String(s.eyebrow).slice(0, 16))}</span>` : '';
      const hbase = sz === 'l' ? 16 : sz === 's' ? 12 : 13;
      const hfs = (ts === 'huge' || ts === 'gradient') ? 21 : hbase;
      let hstyle = `font-family:var(--disp);color:${txt};font-size:${hfs}px`;
      if (ts === 'gold') hstyle = `font-family:var(--disp);color:#E8B84B;font-size:${hfs}px`;
      else if (ts === 'outline') hstyle = `font-family:var(--disp);font-size:${hfs}px;color:transparent;-webkit-text-stroke:.7px ${txt}`;
      else if (ts === 'gradient') hstyle = `font-family:var(--disp);font-size:${hfs}px;background:linear-gradient(120deg,${acc},#7C3AED);-webkit-background-clip:text;background-clip:text;color:transparent`;
      const head = (s.heading || 'Слайд').slice(0, 30);
      const hHtml = ts === 'block'
        ? `<span class="cv-h" style="font-family:var(--disp);font-size:${hfs}px;background:${acc};color:#fff;padding:1px 5px;border-radius:3px;display:inline-block">${esc(head)}</span>`
        : `<span class="cv-h" style="${hstyle}">${esc(head)}</span>`;
      let body = '';
      if (s.mode === 'payplan' && (s.items || []).length) {
        body = `<div class="cv-rows">${s.items.slice(0, 3).map(it => `<div class="cv-row"><span class="cv-dot" style="background:${acc}"></span><span class="cv-pct" style="color:${acc}">${esc(it.v || (it.pct + '%'))}</span><span class="cv-ln" style="background:${acc};opacity:.4"></span></div>`).join('')}</div>`;
      } else if ((s.mode === 'stats' || s.mode === 'gauges') && (s.items || []).length) {
        body = `<div class="cv-tiles">${s.items.slice(0, 3).map(it => `<span class="cv-tile" style="background:color-mix(in srgb,${acc} 22%,transparent);color:${txt}">${esc((it.v || it.k || '').toString().slice(0, 4))}</span>`).join('')}</div>`;
      } else if (s.mode === 'steps' && (s.items || []).length) {
        body = `<div class="cv-rows">${s.items.slice(0, 3).map((it, n) => `<div class="cv-bul"><span class="cv-bd" style="background:${acc}"></span><span style="color:${txt}">${esc((it.text || it.k || '').slice(0, 22))}</span></div>`).join('')}</div>`;
      } else if (/\n|—|✓|•/.test(s.sub || '')) {
        const lines = String(s.sub).split(/\n|(?=—)|(?=✓)/).map(x => x.replace(/^[—✓•\s]+/, '').trim()).filter(Boolean).slice(0, 3);
        body = `<div class="cv-rows">${lines.map(l => `<div class="cv-bul"><span class="cv-bd" style="background:${acc}"></span><span style="color:${txt};opacity:.85">${esc(l.slice(0, 22))}</span></div>`).join('')}</div>`;
      } else if (s.sub) {
        body = `<span class="cv-sub" style="color:${txt}">${esc(String(s.sub).slice(0, 46))}</span>`;
      }
      return eye + hHtml + body;
    }
    $('#cAddSlide', body).addEventListener('click', (e) => {
      const cats = Object.keys(P.slideTpls || {});
      if (!cats.length) { const arr = serialize(); arr.push({ heading: 'Новый слайд', sub: 'Текст слайда', size: 'm', align: 'left' }); return save(true, { slides: arr }); }
      const th = (P.themes || {})[P.theme] || { blue: '#2563EB', body: '#0A1833' };
      const dark = isDark(th.body), txt = dark ? '#fff' : '#132446';
      const tile = (t, ci, ti) => `<button class="ctpl" data-sti="${ci}:${ti}" title="${esc(t.name)}"><div class="ctpl-cv" style="background:linear-gradient(155deg,color-mix(in srgb,${th.blue} 24%,${th.body}),${th.body});${stMiniPos(t.s)}">${stMini(t.s, th, txt)}</div><i>${esc(t.name)}</i></button>`;
      const catHtml = (ci) => (P.slideTpls[cats[ci]] || []).map((t, ti) => tile(t, ci, ti)).join('');
      const pp = openPop(`<div class="csec" style="padding-top:2px">Готовый слайд</div><div class="cseg ctpl-cats" id="cStCats">${cats.map((c, i) => `<button data-c="${i}" class="${i === 0 ? 'on' : ''}">${c}</button>`).join('')}</div><div class="ctpl-grid" id="cStGrid">${catHtml(0)}</div><button class="cwbtn wide" id="cStBlank" style="margin-top:8px">+ Пустой слайд</button>`, e.clientX - 250, e.clientY);
      $('#cStCats', pp).addEventListener('click', (ev) => { const b = ev.target.closest('[data-c]'); if (!b) return; $$('#cStCats button', pp).forEach(x => x.classList.toggle('on', x === b)); $('#cStGrid', pp).innerHTML = catHtml(+b.dataset.c); });
      $('#cStGrid', pp).addEventListener('click', (ev) => { const b = ev.target.closest('[data-sti]'); if (!b) return; const [ci, ti] = b.dataset.sti.split(':').map(Number); const t = (P.slideTpls[cats[ci]] || [])[ti]; if (!t) return; const arr = serialize(); arr.push(Object.assign({}, t.s)); closePop(); save(true, { slides: arr }); });
      $('#cStBlank', pp).addEventListener('click', () => { const arr = serialize(); arr.push({ heading: 'Новый слайд', sub: 'Текст слайда', size: 'm', align: 'left' }); closePop(); save(true, { slides: arr }); });
    });
    let ftOn = (P.footer || {}).on, ftHide = !!(P.footer || {}).hide, ftStyle = (P.footer || {}).style || 'plain';
    const persistFooter = () => { const f = { on: ftOn, text: $('#cFtTxt', body).value.trim(), style: ftStyle, hide: ftHide }; P.footer = f; save(true, { footer: f }); };   /* ⭐ обновляем локальный P.footer — иначе liveRefresh откатит панель к старому */
    $('#cFtSw', body).addEventListener('click', () => { ftOn = !ftOn; $('#cFtSw', body).classList.toggle('on', ftOn); persistFooter(); });
    $('#cFtShow', body).addEventListener('click', () => { ftHide = !ftHide; $('#cFtShow', body).classList.toggle('on', !ftHide); persistFooter(); });
    $('#cFtStyle', body).addEventListener('click', (e) => { const b = e.target.closest('[data-fs]'); if (!b) return; ftStyle = b.dataset.fs; $$('#cFtStyle button', body).forEach(x => x.classList.toggle('on', x === b)); persistFooter(); });
    $('#cFtTxt', body).addEventListener('change', persistFooter);
    $('#cCounter', body).addEventListener('click', (e) => { const b = e.target.closest('[data-cn]'); if (!b) return; $$('#cCounter button', body).forEach(x => x.classList.toggle('on', x === b)); P.counter = b.dataset.cn; save(true, { counter: b.dataset.cn }); });
    /* шрифт-поповер */
    $('#cFontBtn', body).addEventListener('click', (e) => {
      const rows = (filter, cat) => Object.entries(P.fonts).filter(([k, f]) => (!cat || f.cat === cat) && (!filter || f.name.toLowerCase().includes(filter))).map(([k, f]) => `<div class="fprow ${k === P.font ? 'on' : ''}" data-fp="${k}"><span class="aa" style="font-family:${f.fam}">Aa</span><span class="nm" style="font-family:${f.fam}">${f.name}</span></div>`).join('') || '<div style="padding:10px;color:#9aa1b2">Ничего не найдено</div>';
      const cats = ['', 'serif', 'sans', 'display', 'hand'];
      const pp = openPop(`<input class="srch" id="cFq" placeholder="Поиск шрифта…"><div class="cseg" id="cFcat">${cats.map((c, i) => `<button data-cat="${c}" class="${i === 0 ? 'on' : ''}">${c ? CAT[c] : 'Все'}</button>`).join('')}</div><div id="cFlist">${rows('', '')}</div>`, e.clientX - 250, e.clientY);
      let curCat = ''; const q = $('#cFq', pp), list = $('#cFlist', pp);
      q.addEventListener('input', () => list.innerHTML = rows(q.value.trim().toLowerCase(), curCat));
      $('#cFcat', pp).addEventListener('click', (ev) => { const b2 = ev.target.closest('[data-cat]'); if (!b2) return; curCat = b2.dataset.cat; $$('#cFcat button', pp).forEach(x => x.classList.toggle('on', x === b2)); list.innerHTML = rows(q.value.trim().toLowerCase(), curCat); });
      pp.addEventListener('click', (e2) => { const t = e2.target.closest('[data-fp]'); if (t) { closePop(); save('hard', { font: t.dataset.fp }); } });
      setTimeout(() => q.focus(), 30);
    });
    /* комбо-пары заголовок+тело — один клик применяет оба */
    { const cb = $('#cCombos', body); if (cb) cb.addEventListener('click', (e) => { const b = e.target.closest('[data-hf]'); if (!b) return; save('hard', { font: b.dataset.hf, bodyFont: b.dataset.bf || '' }); }); }
    /* шрифт основного текста (тела) — отдельный пикер с опцией «по умолчанию» */
    { const bfb = $('#cBodyFontBtn', body); if (bfb) bfb.addEventListener('click', (e) => {
      const rows = (filter, cat) => `<div class="fprow ${!P.bodyFont ? 'on' : ''}" data-bfp=""><span class="aa" style="font-family:'Manrope',sans-serif">Aa</span><span class="nm">Manrope (по умолчанию)</span></div>` + Object.entries(P.fonts).filter(([k, f]) => (!cat || f.cat === cat) && (!filter || f.name.toLowerCase().includes(filter))).map(([k, f]) => `<div class="fprow ${k === P.bodyFont ? 'on' : ''}" data-bfp="${k}"><span class="aa" style="font-family:${f.fam}">Aa</span><span class="nm" style="font-family:${f.fam}">${f.name}</span></div>`).join('');
      const cats = ['', 'serif', 'sans', 'display', 'hand'];
      const pp = openPop(`<input class="srch" id="cBq" placeholder="Поиск шрифта тела…"><div class="cseg" id="cBcat">${cats.map((c, i) => `<button data-cat="${c}" class="${i === 0 ? 'on' : ''}">${c ? CAT[c] : 'Все'}</button>`).join('')}</div><div id="cBlist">${rows('', '')}</div>`, e.clientX - 250, e.clientY);
      let curCat = ''; const q = $('#cBq', pp), list = $('#cBlist', pp);
      q.addEventListener('input', () => list.innerHTML = rows(q.value.trim().toLowerCase(), curCat));
      $('#cBcat', pp).addEventListener('click', (ev) => { const b2 = ev.target.closest('[data-cat]'); if (!b2) return; curCat = b2.dataset.cat; $$('#cBcat button', pp).forEach(x => x.classList.toggle('on', x === b2)); list.innerHTML = rows(q.value.trim().toLowerCase(), curCat); });
      pp.addEventListener('click', (e2) => { const t = e2.target.closest('[data-bfp]'); if (t) { closePop(); save('hard', { bodyFont: t.dataset.bfp }); } });
      setTimeout(() => q.focus(), 30);
    }); }
  }
  function slideHtml(sl) {
    const pos = sl.dataset.pos || 'center', al = sl.dataset.align || 'left', sz = sl.dataset.size || 'm';
    const bgKind = sl.dataset.bgv ? 'Видео' : sl.dataset.bg ? 'Фото' : sl.dataset.bgc ? 'Цвет' : 'Тема';
    /* ⭐ авто-детект числа фото на слайде (фон + img-слои, без стикеров) → раскладки/тоггл сразу под реальность */
    const nPhotos = slidePhotos(sel).length;
    const detN = Math.max(1, Math.min(4, nPhotos || 1));
    return `
    <div class="cgrp"><label>Слайд ${sel + 1} · фон: ${bgKind}</label>
      <div class="cbtn-row">
        <button class="cwbtn" data-bg="none">Тема</button>
        <button class="cwbtn" data-bg="color">Цвет</button>
        <button class="cwbtn" data-bg="photo">Фото</button>
        <button class="cwbtn" data-bg="video">Видео</button>
        ${P.img ? '<button class="cwbtn wide" data-bg="ai">✦ Сгенерировать фон ИИ</button>' : ''}
      </div>
      <div id="cBgExtra"></div>
    </div>
    <div class="cgrp"><label>Фото-раскладка <button class="clink" id="cPlAuto" type="button">✨ Авто по фото</button></label>
      <div class="cnote" id="cPlDet">${nPhotos ? `Обнаружено <b>${nPhotos}</b> фото на слайде — показаны раскладки для ${detN}. «Авто» разложит их сразу, не перекрывая текст.` : 'На слайде нет фото. Выбери раскладку — попросит подгрузить.'}</div>
      <div class="cseg" id="cPlN">${[1, 2, 3, 4].map((n) => `<button data-pln="${n}" class="${n === detN ? 'on' : ''}">${n} фото</button>`).join('')}</div>
      <div class="cpl-grid" id="cPlGrid">${PHOTO_LAYOUTS.filter(l => l.n === detN).map(plTile).join('')}</div>
      <div class="cnote">Фото раскладываются <b>рядом с текстом</b> (в свободной зоне — не перекрывают заголовок) и остаются <b>подвижными</b>: тяни за центр, размер — за угол (пропорция сохраняется). «Во весь слайд» — единственная кладёт фон под текст. «Авто» сам поймёт число фото.</div>
      <label style="margin-top:10px">Стиль фото</label>
      <div class="cbtn-row" id="cPhStyle" style="flex-wrap:wrap">
        <button class="cwbtn" data-ps="none">Обычное</button>
        <button class="cwbtn" data-ps="glass">Стекло</button>
        <button class="cwbtn" data-ps="polaroid">Полароид</button>
        <button class="cwbtn" data-ps="shadow">Тень</button>
        <button class="cwbtn" data-ps="tape">Скотч</button>
        <button class="cwbtn" data-ps="clip">Скрепка</button>
      </div>
      <div class="cnote">Оформление фото-раскладки: стеклянная рамка, полароид, скотч или скрепка — как на мудборде. Не применяется к «Во весь слайд».</div>
    </div>
    ${(() => { let r = {}; try { r = JSON.parse(sl.dataset.rich || '{}'); } catch (e) {} const cur = r.layout || ''; const h = r.hero || {}; return `<div class="cgrp"><label>Раскладка слайда <span class="cnote-inline">библиотека структур</span></label>
      <div class="clay-grid" id="cLayGrid">${LAYOUTS.map(l => layTile(l, cur)).join('')}</div>
      <div class="cnote">Один и тот же контент — <b>разные способы подачи</b>. «Крупное число», «Типографика», «Погружение» убирают лишнее и делают акцент; «Мозаика»/«Редакторская» структурируют тезисы; «Сплит»/«Постер»/«Кинематограф» — под фото. Ничего не теряется — переключай свободно.</div>
      ${cur === 'data' ? `<div class="clay-hero"><label>Число-герой</label><div class="clay-hero-row"><input id="cHeroV" class="cinp" placeholder="45%" value="${esc(h.v || '')}" maxlength="12"><input id="cHeroK" class="cinp" placeholder="подпись — напр. доходность" value="${esc(h.k || '')}" maxlength="40"></div><div class="cnote">Крупная цифра + короткая подпись. Тяни из смысла слайда.</div></div>` : ''}
    </div>`; })()}
    <div class="cgrp"><label>Размещение текста</label><div class="swrow"><span class="sw ${sl.dataset.free === '1' ? 'on' : ''}" id="cFree"></span> Свободно двигать и масштабировать</div><div class="cnote">Вкл → тяни блок за уголок ✥, размер — за нижний угол. Выкл — вернётся в сетку (Позиция/Выравнивание).</div></div>
    <div class="cgrp"><label>Позиция текста</label><div class="cseg" id="cPos">${[['top', 'Верх'], ['center', 'Центр'], ['bottom', 'Низ']].map(([v, n]) => `<button data-v="${v}" class="${pos === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    <div class="cgrp"><label>Выравнивание</label><div class="cseg" id="cAlign">${[['left', 'Слева'], ['center', 'По центру']].map(([v, n]) => `<button data-v="${v}" class="${al === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    <div class="cgrp"><label>Размер заголовка</label><div class="cseg" id="cSize">${[['s', 'S'], ['m', 'M'], ['l', 'L']].map(([v, n]) => `<button data-v="${v}" class="${sz === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    ${(() => { let r = {}; try { r = JSON.parse(sl.dataset.rich || '{}'); } catch (e) {} const NUM = ['payplan', 'stats', 'steps', 'bars', 'gauges']; if (!(r.mode && NUM.includes(r.mode) && (r.items || []).length)) return ''; const FMT = [['payplan', 'Таймлайн'], ['stats', 'Числа'], ['steps', 'Шаги'], ['bars', 'Столбцы'], ['gauges', 'Кольца']]; return `<div class="cgrp"><label>Формат блока <span style="color:var(--cb);font-weight:700">· ${(r.items || []).length} пункта</span></label><div class="cseg" id="cBlockFmt" style="flex-wrap:wrap">${FMT.map(([v, n]) => `<button data-bf="${v}" class="${r.mode === v ? 'on' : ''}" style="flex:0 0 auto">${n}</button>`).join('')}</div><div class="cnote">Одни данные — разные виды подачи. Переключай, пока не ляжет красиво.</div></div>`; })()}
    ${(() => { let r = {}; try { r = JSON.parse(sl.dataset.rich || '{}'); } catch (e) {} if (!(r.points && r.points.length)) return ''; const pm = r.pmark || 'index'; const marksOn = Array.isArray(r.pmarks) && r.pmarks.length; const OPT = [['index', '01'], ['dot', '•'], ['dash', '—'], ['check', '✓'], ['arrow', '→'], ['num', '1.']]; const isImg = /^img:/.test(pm); return `<div class="cgrp"><label>Маркер списка ${marksOn ? '<span style="color:var(--cb);font-weight:700">· авто по смыслу</span>' : ''}</label><div class="cseg cpmark" id="cPmark">${OPT.map(([v, g]) => `<button data-pm="${v}" class="${!marksOn && pm === v ? 'on' : ''}">${g}</button>`).join('')}</div><div class="cbtn-row" style="margin-top:8px"><button class="cwbtn ${marksOn ? 'on' : ''}" id="cPmAuto">✦ Авто по смыслу</button><button class="cwbtn ${isImg && !marksOn ? 'on' : ''}" id="cPmImg">${isImg && !marksOn ? `<img src="/assets/stickers/${pm.slice(4)}.png" style="width:16px;height:16px;object-fit:contain">` : '🖼'} Иконка</button></div><div class="cnote">Один маркер на все пункты. «Авто по смыслу» подберёт разные значки под каждый пункт; «Иконка» — картинка-буллет.</div></div>`; })()}
    <div class="cgrp"><label>Стиль заголовка</label><button class="cfontbtn" id="cTStyleBtn"><span class="s-h ts-${sl.dataset.tstyle || 'plain'}" style="font-size:18px;font-family:var(--disp)">Aa</span><span style="flex:1">${(P.tstyles || {})[sl.dataset.tstyle || 'plain'] || 'Обычный'}</span> ▾</button></div>
    <div class="cgrp"><label>Подложка текста</label><div class="cseg" id="cCard">${[['', 'Нет'], ['glass', 'Стекло'], ['solid', 'Плашка']].map(([v, n]) => `<button data-card="${v}" class="${(sl.dataset.card || '') === v ? 'on' : ''}">${n}</button>`).join('')}</div><div class="cnote">Матовое стекло или плотная плашка под всем текстом — читается на любом фото.</div></div>
    <div class="cgrp"><label>Служебное на этом слайде</label>
      <div class="swrow"><span class="sw ${sl.dataset.nonum ? '' : 'on'}" id="cNoNum"></span> Показывать счётчик</div>
      <div class="swrow" style="margin-top:7px"><span class="sw ${sl.dataset.nobrand ? '' : 'on'}" id="cNoBrand"></span> Показывать футер</div>
      <div class="cnote">Выключи, чтобы убрать номер/футер именно с этого слайда (напр. обложка).</div></div>
    <div class="cgrp"><label>Цвет текста</label><div class="ctcolors" id="cTColor"><button class="ctc ${!sl.dataset.tcolor ? 'on' : ''}" data-tc="" title="Авто">A</button>${Object.entries(P.tcolors || {}).map(([k, v]) => `<button class="ctc ${sl.dataset.tcolor === k ? 'on' : ''}" data-tc="${k}" title="${k}" style="--tc:${v}"></button>`).join('')}</div><div class="cnote">«A» — авто (по фону). Пресет перекрывает цвет заголовка и подписи.</div></div>
    <div class="cgrp"><label>Узор фона</label><div class="cpats" id="cPats">${PATS.map(([k, n]) => { const on = (sl.dataset.bgpat || '') === k || (!sl.dataset.bgpat && k === 'none'); return `<div class="cpat ${k === 'none' ? 'none' : ''} ${on ? 'on' : ''}" data-pat="${k}" title="${n}"${k !== 'none' ? ` style="background-image:${PATV[k]}"` : ''}>${k === 'none' ? 'нет' : ''}</div>`; }).join('')}</div><div class="cnote">Тонкий узор поверх темы. Не работает вместе с фото/видео/цветом.</div></div>
    <div class="cgrp"><label>Градиент-фон</label><div class="cpats cgrads" id="cGrads">${GRADS.map(([k, n]) => { const on = (sl.dataset.grad || '') === k || (!sl.dataset.grad && k === 'none'); return `<div class="cpat ${k === 'none' ? 'none' : ''} ${on ? 'on' : ''}" data-grad="${k}" title="${n}"${k !== 'none' ? ` style="background:${GRADV[k]}"` : ''}>${k === 'none' ? 'нет' : ''}</div>`; }).join('')}</div><div class="cnote">Мягкий градиент в тон темы — премиальнее узора. Взаимоисключается с узором/фото/видео/цветом.</div></div>
    <div class="cgrp"><label>Формат выделенного текста</label><div class="cfmtbar" id="cFmtBar">
      <button data-cmd="bold" title="Жирный"><b>Ж</b></button>
      <button data-cmd="italic" title="Курсив"><i>К</i></button>
      <button data-cmd="mark" title="Выделение цветом — выбор палитры"><mark style="padding:0 3px;border-radius:3px">A</mark></button>
      <button data-cmd="clear" title="Убрать формат и выделение">✕</button>
    </div><div class="cnote">Выделите текст в заголовке/подписи, затем нажмите. «A» — палитра цветов выделения.</div></div>
    <div class="cgrp"><label>Элементы на слайде</label>
      <div class="celem-add-grid">
        <button class="celem-add" data-add="shape"><span class="celem-add-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="8" cy="8" r="4.5"/><rect x="12" y="12" width="8" height="8" rx="1.5"/></svg></span>Фигура</button>
        <button class="celem-add" data-add="sticker"><span class="celem-add-ic"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.7 5.9L20 9.6l-6.3 1.7L12 17l-1.7-5.7L4 9.6l6.3-1.7z"/></svg></span>Стикер</button>
        <button class="celem-add" data-add="frame"><span class="celem-add-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3.5" y="3.5" width="17" height="17" rx="2"/><rect x="7.5" y="7.5" width="9" height="9" rx="1"/></svg></span>Рамка</button>
        <button class="celem-add" data-add="text"><span class="celem-add-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M5 6h14M12 6v13M9 19h6"/></svg></span>Текст</button>
        <button class="celem-add" data-add="photo"><span class="celem-add-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.6"/><path d="M21 16l-5-5-9 9"/></svg></span>Фото</button>
        <button class="celem-add" data-add="avatar"><span class="celem-add-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0114 0"/></svg></span>Аватар</button>
      </div>
      <div class="cnote">Добавь элемент → тяни его на макете, угол — размер, стрелки над ним — слои вперёд/назад.</div>
    </div>
    ${(() => {
      const arr = serialize(); const ls = ((arr[sel] || {}).layers) || [];
      if (!ls.length) return '';
      const meta = (l) => {
        if (l.t === 'img' && l.avatar) return ['Аватар', 'M12 8.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM5 20a7 7 0 0114 0'];
        if (l.t === 'img' && (l.sticker || /stickers/.test(l.url || ''))) return ['Стикер', 'M12 2l1.7 5.9L20 9.6l-6.3 1.7L12 17l-1.7-5.7L4 9.6l6.3-1.7z'];
        if (l.t === 'img') return ['Фото', 'M3 4.5h18v15H3zM8.5 9.5a1 1 0 100 .01M21 15l-5-5-9 9'];
        if (l.t === 'sticker') return ['Стикер', 'M12 2l1.7 5.9L20 9.6l-6.3 1.7L12 17l-1.7-5.7L4 9.6l6.3-1.7z'];
        if (l.t === 'frame') return ['Рамка', 'M3.5 3.5h17v17h-17zM7.5 7.5h9v9h-9z'];
        if (l.t === 'text') return [((l.text || 'Текст').replace(/<[^>]+>/g, '').slice(0, 22)) || 'Текст', 'M5 6h14M12 6v13M9 19h6'];
        if (l.t === 'shape') return ['Фигура', 'M8 8a4.5 4.5 0 100 .01M12 12h8v8h-8z'];
        if (l.t === 'btn') return [((l.text || 'Кнопка').slice(0, 18)) || 'Кнопка', 'M4 9h16v6H4z'];
        if (l.t === 'icon') return ['Иконка', 'M12 3l2.5 6H21l-5 4 2 7-6-4-6 4 2-7-5-4h6.5z'];
        if (l.t === 'line') return ['Линия', 'M4 12h16'];
        if (l.t === 'grad') return ['Градиент', 'M3 4.5h18v15H3z'];
        return [l.t || 'Объект', 'M4 4h16v16H4z'];
      };
      const rows = ls.map((l, k) => ({ l, k })).sort((a, b) => (b.l.z || 0) - (a.l.z || 0));
      return `<div class="cgrp"><label>Объекты на слайде <span class="cnote-inline">${ls.length}</span></label>
        <div class="clayers" id="cLayers">${rows.map(({ l, k }) => { const [name, d] = meta(l); return `<div class="clayer" data-lk="${k}"><span class="clayer-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg></span><span class="clayer-t">${esc(name)}</span><span class="clayer-acts"><button data-lact="up" title="Выше">↑</button><button data-lact="down" title="Ниже">↓</button><button data-lact="del" title="Удалить">✕</button></span></div>`; }).join('')}</div>
        <div class="cnote">Клик по объекту — выделить его на макете (даже если он под другими слоями). Стрелки — слой выше/ниже, ✕ — удалить.</div></div>`;
    })()}
    <div class="cgrp"><label>Порядок и удаление слайда</label><div class="cbtn-row">
      <button class="cwbtn" data-mv="up">↑ Выше</button>
      <button class="cwbtn" data-mv="down">↓ Ниже</button>
      <button class="cwbtn wide dng" data-mv="del">Удалить слайд</button>
    </div></div>`;
  }
  function wireSlide(body, i) {
    $('#cPos', body).addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; applyMeta(i, 'pos', b.dataset.v); $$('#cPos button', body).forEach(x => x.classList.toggle('on', x === b)); save(false); });
    $('#cAlign', body).addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; applyMeta(i, 'align', b.dataset.v); $$('#cAlign button', body).forEach(x => x.classList.toggle('on', x === b)); save(false); });
    $('#cSize', body).addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; applyMeta(i, 'size', b.dataset.v); $$('#cSize button', body).forEach(x => x.classList.toggle('on', x === b)); save(false); });
    /* ОДИН маркер на все строки → чистим по-строчные pmarks */
    const setPmark = (val) => { const sl = slideEl(i); let r = {}; try { r = JSON.parse(sl.dataset.rich || '{}'); } catch (_) {} r.pmark = val; delete r.pmarks; sl.dataset.rich = JSON.stringify(r); dirty = true; save(true, { slides: serialize() }); };
    /* РАЗНЫЕ маркеры по строкам */
    const setPmarks = (arr) => { const sl = slideEl(i); let r = {}; try { r = JSON.parse(sl.dataset.rich || '{}'); } catch (_) {} r.pmarks = arr; sl.dataset.rich = JSON.stringify(r); dirty = true; save(true, { slides: serialize() }); };
    { const pmEl = $('#cPmark', body); if (pmEl) pmEl.addEventListener('click', (e) => { const b = e.target.closest('[data-pm]'); if (!b) return; $$('#cPmark button', body).forEach(x => x.classList.toggle('on', x === b)); setPmark(b.dataset.pm); }); }
    /* ⭐ конфигуратор формата блока данных: одни items — разные виды (payplan/stats/steps/bars/gauges) */
    { const bf = $('#cBlockFmt', body); if (bf) bf.addEventListener('click', (e) => { const b = e.target.closest('[data-bf]'); if (!b) return; const sl = slideEl(i); let r = {}; try { r = JSON.parse(sl.dataset.rich || '{}'); } catch (_) {} r.mode = b.dataset.bf; if (['bars', 'gauges'].includes(r.mode)) r.items = (r.items || []).map(it => Object.assign({}, it, { pct: it.pct != null ? it.pct : Math.max(0, Math.min(100, parseFloat(String(it.v || '').replace(/[^\d.]/g, '')) || 0)) })); sl.dataset.rich = JSON.stringify(r); $$('#cBlockFmt button', body).forEach(x => x.classList.toggle('on', x === b)); dirty = true; save(true, { slides: serialize() }); }); }
    /* ⭐ библиотека раскладок слайда (Gamma-стиль): смена грамматики подачи */
    { const lg = $('#cLayGrid', body); if (lg) lg.addEventListener('click', (e) => { const b = e.target.closest('[data-lay]'); if (!b) return; setLayout(i, b.dataset.lay); }); }
    /* ⭐ панель объектов/слоёв: выделить любой слой (даже под другими), z-порядок, удаление */
    { const lw = $('#cLayers', body); if (lw) lw.addEventListener('click', (e) => {
      const row = e.target.closest('.clayer'); if (!row) return; const k = +row.dataset.lk;
      const act = e.target.closest('[data-lact]');
      if (act) {
        e.stopPropagation();
        const arr = serialize(); const s = arr[i]; if (!s || !s.layers || !s.layers[k]) return;
        const zs = s.layers.map(l => l.z || 0);
        if (act.dataset.lact === 'up') s.layers[k].z = Math.max(...zs) + 1;
        else if (act.dataset.lact === 'down') s.layers[k].z = Math.min(...zs) - 1;
        else if (act.dataset.lact === 'del') s.layers.splice(k, 1);
        save(true, { slides: arr }); return;
      }
      const slide = slideEl(i); const le = slide && slide.querySelector('[data-lyr="' + k + '"]');
      if (le) { le.scrollIntoView({ block: 'nearest' }); selLayer(le); flash('Объект выделен ✓', 900); }
    }); }
    /* инлайн-редактор числа-героя для раскладки data */
    { const hv = $('#cHeroV', body), hk = $('#cHeroK', body); if (hv || hk) { const upd = (persist) => { const sl = slideEl(i); let r = {}; try { r = JSON.parse(sl.dataset.rich || '{}'); } catch (_) {} r.hero = { v: (hv ? hv.value : '').trim(), k: (hk ? hk.value : '').trim() }; sl.dataset.rich = JSON.stringify(r); dirty = true; if (persist) save(true, { slides: serialize() }); }; [hv, hk].forEach(inp => { if (!inp) return; inp.addEventListener('input', () => upd(false)); inp.addEventListener('change', () => upd(true)); }); } }
    /* иконка-буллет: попап с паками «Буллеты» */
    { const im = $('#cPmImg', body); if (im) im.addEventListener('click', (e) => {
      const packs = (STK_PACKS || []).filter(p => BULLET_DIRS.includes(p.dir));
      if (!packs.length) { flash('Иконки-буллеты ещё грузятся…'); return; }
      const keys = packs.map(p => p.title);
      const grid = (ci) => (packs[ci].items || []).map(it => `<button class="celem" data-bk="${esc(it.key)}" title="${esc(it.label || '')}"><img src="/assets/stickers/${it.key}.png" style="width:100%;height:100%;object-fit:contain"></button>`).join('');
      const pp = openPop(`<div class="csec" style="padding-top:2px">Иконка-буллет</div><div class="cseg ctpl-cats" id="cBkCats">${keys.map((c, ci) => `<button data-c="${ci}" class="${ci === 0 ? 'on' : ''}">${esc(c)}</button>`).join('')}</div><div class="celem-grid" id="cBkGrid">${grid(0)}</div>`, e.clientX - 260, e.clientY);
      pp.classList.add('cpop-el');
      $('#cBkCats', pp).addEventListener('click', (ev) => { const b = ev.target.closest('[data-c]'); if (!b) return; $$('#cBkCats button', pp).forEach(x => x.classList.toggle('on', x === b)); $('#cBkGrid', pp).innerHTML = grid(+b.dataset.c); });
      pp.addEventListener('click', (ev) => { const b = ev.target.closest('[data-bk]'); if (!b) return; closePop(); setPmark('img:' + b.dataset.bk); flash('Маркер-иконка применён ✓'); });
    }); }
    { const au = $('#cPmAuto', body); if (au) au.addEventListener('click', () => { const pts = (serialize()[i] || {}).points || []; const marks = autoBulletMarks(pts); if (!marks) { flash('Нет тезисов'); return; } setPmarks(marks); flash('Разные маркеры по смыслу ✓', 1300); }); }   /* берём ЖИВЫЕ тезисы (не устаревший rich) */
    { const nb = $('#cPmNum', body); if (nb) nb.addEventListener('click', () => { const pts = (serialize()[i] || {}).points || []; if (!pts.length) { flash('Нет тезисов'); return; } setPmarks(numberMarks(pts)); flash('Нумерация 1·2·3 ✓', 1300); }); }
    /* ⭐ ручные ПО-СТРОЧНЫЕ маркеры: попап со списком тезисов, у каждого свой пикер (глифы + иконка-буллет) */
    { const lb = $('#cPmLines', body); if (lb) lb.addEventListener('click', (e) => {
      let r = {}; try { r = JSON.parse(slideEl(i).dataset.rich || '{}'); } catch (_) {}
      const pts = (serialize()[i] || {}).points || []; if (!pts.length) { flash('Нет тезисов'); return; }
      const GL = [['dot', '•'], ['check', '✓'], ['ring', '◦'], ['dash', '—'], ['arrow', '→'], ['diamond', '◆'], ['star', '★'], ['plus', '+'], ['num', '№']];
      let cur = (Array.isArray(r.pmarks) && r.pmarks.length) ? r.pmarks.slice(0, pts.length) : pts.map(() => r.pmark || 'dot');
      while (cur.length < pts.length) cur.push('dot');
      const imgThumb = (m) => /^img:/.test(m) ? `<img src="/assets/stickers/${m.slice(4)}.png" style="width:16px;height:16px;object-fit:contain">` : (GL.find(g => g[0] === m) || ['', m])[1];
      const rowHtml = (pt, k) => `<div class="cpml-row" data-row="${k}"><span class="cpml-cur">${imgThumb(cur[k])}</span><span class="cpml-tx">${esc(String(pt).replace(/<[^>]*>/g, '').slice(0, 40))}</span><span class="cpml-opts">${GL.map(([v, g]) => `<button data-lm="${v}" title="${v}">${g}</button>`).join('')}<button data-lmimg="1" title="Иконка">🖼</button></span></div>`;
      const pp = openPop(`<div class="csec" style="padding-top:2px">Маркер каждой строки</div><div class="cpml-list">${pts.map((pt, k) => rowHtml(pt, k)).join('')}</div>`, e.clientX - 300, e.clientY);
      pp.classList.add('cpop-pml');
      const commit = () => setPmarks(cur.slice(0, pts.length));
      pp.addEventListener('click', (ev) => {
        const row = ev.target.closest('.cpml-row'); if (!row) return; const k = +row.dataset.row;
        const g = ev.target.closest('[data-lm]'); const im = ev.target.closest('[data-lmimg]');
        if (g) { cur[k] = g.dataset.lm; row.querySelector('.cpml-cur').innerHTML = imgThumb(cur[k]); commit(); return; }
        if (im) {
          const packs = (STK_PACKS || []).filter(p => BULLET_DIRS.includes(p.dir));
          const keys = packs.map(p => p.title);
          const grid = (ci) => (packs[ci].items || []).map(it => `<button class="celem" data-lbk="${esc(it.key)}" title="${esc(it.label || '')}"><img src="/assets/stickers/${it.key}.png" style="width:100%;height:100%;object-fit:contain"></button>`).join('');
          const pp2 = openPop(`<div class="csec" style="padding-top:2px">Иконка для строки ${k + 1}</div><div class="cseg ctpl-cats" id="cLbkCats">${keys.map((c, ci) => `<button data-c="${ci}" class="${ci === 0 ? 'on' : ''}">${esc(c)}</button>`).join('')}</div><div class="celem-grid" id="cLbkGrid">${grid(0)}</div>`, ev.clientX - 260, ev.clientY);
          pp2.classList.add('cpop-el');
          $('#cLbkCats', pp2).addEventListener('click', (e2) => { const b = e2.target.closest('[data-c]'); if (!b) return; $$('#cLbkCats button', pp2).forEach(x => x.classList.toggle('on', x === b)); $('#cLbkGrid', pp2).innerHTML = grid(+b.dataset.c); });
          pp2.addEventListener('click', (e2) => { const b = e2.target.closest('[data-lbk]'); if (!b) return; cur[k] = 'img:' + b.dataset.lbk; closePop(pp2); row.querySelector('.cpml-cur').innerHTML = imgThumb(cur[k]); commit(); });
        }
      });
    }); }
    const tcBox = $('#cTColor', body);
    if (tcBox) tcBox.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tc]'); if (!b) return;
      const sl = slideEl(i); const key = b.dataset.tc;
      if (key) sl.dataset.tcolor = key; else delete sl.dataset.tcolor;
      const col = key ? (P.tcolors || {})[key] : '';
      const h = sl.querySelector('.s-h'), sub = sl.querySelector('.s-s');
      if (h) h.style.color = col || ''; if (sub) { sub.style.color = col || ''; sub.style.opacity = col ? '.9' : ''; }
      $$('#cTColor .ctc', body).forEach(x => x.classList.toggle('on', x === b));
      dirty = true; save(false);
    });
    const tsBtn = $('#cTStyleBtn', body);
    if (tsBtn) tsBtn.addEventListener('click', (e) => {
      const sl = slideEl(i); const cur = sl.dataset.tstyle || 'plain';
      const grid = Object.entries(P.tstyles || { plain: 'Обычный' }).map(([k, n]) => `<button class="ctst ${cur === k ? 'on' : ''}" data-ts="${k}" title="${n}"><span class="s-h ts-${k}" style="font-size:18px;font-family:var(--disp)">Aa</span><i>${n}</i></button>`).join('');
      const pp = openPop(`<div class="ctstyles">${grid}</div>`, e.clientX - 250, e.clientY);
      pp.addEventListener('click', (ev) => { const b = ev.target.closest('[data-ts]'); if (!b) return; const k = b.dataset.ts; sl.dataset.tstyle = k; const h = sl.querySelector('.s-h'); if (h) h.className = 's-h' + (k !== 'plain' ? ' ts-' + k : ''); dirty = true; closePop(); save(false); renderBody(); });
    });
    /* подложка текст-блока: стекло / плашка / нет */
    const cardBox = $('#cCard', body);
    if (cardBox) cardBox.addEventListener('click', (e) => {
      const b = e.target.closest('[data-card]'); if (!b) return;
      const sl = slideEl(i); if (!sl) return;
      const v = b.dataset.card;
      if (v) sl.dataset.card = v; else delete sl.dataset.card;
      sl.classList.remove('card-glass', 'card-solid');
      if (v) sl.classList.add('card-' + v);
      $$('#cCard button', body).forEach(x => x.classList.toggle('on', x === b));
      dirty = true; save(false);
    });
    /* послайдный тоггл счётчика/футера */
    const toggleSvc = (btnId, dataKey) => { const bt = $('#' + btnId, body); if (!bt) return; bt.addEventListener('click', () => { const sl = slideEl(i); const hidden = !!sl.dataset[dataKey]; if (hidden) delete sl.dataset[dataKey]; else sl.dataset[dataKey] = '1'; bt.classList.toggle('on', hidden); dirty = true; save(true, { slides: serialize() }); }); };
    toggleSvc('cNoNum', 'nonum'); toggleSvc('cNoBrand', 'nobrand');
    /* фото-раскладка: вкладки по числу фото + применение */
    { const pn = $('#cPlN', body), pgr = $('#cPlGrid', body);
      if (pn && pgr) {
        pn.addEventListener('click', (e) => { const b = e.target.closest('[data-pln]'); if (!b) return; $$('#cPlN button', body).forEach(x => x.classList.toggle('on', x === b)); pgr.innerHTML = PHOTO_LAYOUTS.filter(l => l.n === +b.dataset.pln).map(plTile).join(''); });
        pgr.addEventListener('click', (e) => { const b = e.target.closest('[data-pl]'); if (!b) return; const L = PHOTO_LAYOUTS.find(x => x.k === b.dataset.pl); if (L) applyPhotoLayout(i, L); });
      }
      const pa = $('#cPlAuto', body); if (pa) pa.addEventListener('click', () => autoPhotoLayout(i)); }
    { const ps = $('#cPhStyle', body); if (ps) ps.addEventListener('click', (e) => { const b = e.target.closest('[data-ps]'); if (!b) return; $$('#cPhStyle button', body).forEach(x => x.classList.toggle('on', x === b)); applyPhotoStyle(i, b.dataset.ps); }); }
    /* свободное размещение текст-блока (двигать/масштабировать) */
    { const fr = $('#cFree', body); if (fr) fr.addEventListener('click', () => { const sl = slideEl(i); const on = sl.dataset.free !== '1'; if (on) { sl.dataset.free = '1'; if (!sl.dataset.tx) sl.dataset.tx = '10'; if (!sl.dataset.ty) sl.dataset.ty = '16'; if (!sl.dataset.tscale) sl.dataset.tscale = '1'; } else { delete sl.dataset.free; } fr.classList.toggle('on', on); dirty = true; save(true, { slides: serialize() }); }); }
    $('#cFmtBar', body).addEventListener('mousedown', (e) => {
      const b = e.target.closest('[data-cmd]'); if (!b) return; e.preventDefault(); const cmd = b.dataset.cmd;
      const s2 = document.getSelection(); if (!s2 || !s2.rangeCount || !s2.toString()) { flash('Сначала выделите текст в слайде'); return; }
      const anc = s2.anchorNode && (s2.anchorNode.nodeType === 1 ? s2.anchorNode : s2.anchorNode.parentElement);
      const host = anc && anc.closest('[data-ce],[data-pt]');
      if (!host) { flash('Выделите текст внутри слайда'); return; }
      if (cmd === 'bold') { document.execCommand('bold'); dirty = true; save(false); }
      else if (cmd === 'italic') { document.execCommand('italic'); dirty = true; save(false); }
      else if (cmd === 'clear') { const r = s2.getRangeAt(0); marksIn(r, host).forEach(unwrap); host.normalize(); document.execCommand('removeFormat'); dirty = true; save(false); }
      else if (cmd === 'mark') {
        const rc = b.getBoundingClientRect();
        const sw = HL.map(([k, c, ex]) => `<span class="hlsw" data-hl="${k}" title="Выделение" style="background:${c};${ex || ''}"></span>`).join('');
        const pp = openPop(`<div class="hlpop"><div class="hlrow">${sw}</div><button class="hloff" data-hl="off">Снять выделение</button></div>`, rc.left - 96, rc.bottom + 8);
        pp.addEventListener('mousedown', (ev) => { const t = ev.target.closest('[data-hl]'); if (!t) return; ev.preventDefault(); markSel(t.dataset.hl, host); closePop(); });
      }
    });
    $$('[data-mv]', body).forEach(b => b.addEventListener('click', () => {
      const arr = serialize(); const kind = b.dataset.mv;
      if (kind === 'del') { if (arr.length <= 1) { flash('Оставьте хотя бы 1 слайд'); return; } arr.splice(i, 1); sel = Math.max(0, i - 1); persistUI(); return save(true, { slides: arr }); }
      if (kind === 'up' && i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; sel = i - 1; persistUI(); return save(true, { slides: arr }); }
      if (kind === 'down' && i < arr.length - 1) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; sel = i + 1; persistUI(); return save(true, { slides: arr }); }
    }));
    /* добавление элементов-слоёв */
    const accent = ((P.themes[P.theme] || {}).blue) || '#1D34D8';
    const addLayerAt = (layer, slideIdx) => {
      /* ⭐ цель = слайд, который пользователь СЕЙЧАС видит по центру экрана (а не «выбранный» ранее) —
         фикс: стикер/элемент прилетал на 1-2 слайд, когда листаешь на 5-й */
      let ti = slideIdx;
      if (ti == null) {
        const cy = innerHeight / 2; let best = sel, bd = Infinity;
        $$('.slide').forEach(s => { const r = s.getBoundingClientRect(); const c = r.top + r.height / 2; const d = Math.abs(c - cy); if (d < bd) { bd = d; best = +s.dataset.idx; } });
        ti = best;
      }
      const arr = serialize(); if (!arr[ti]) return;
      arr[ti].layers = arr[ti].layers || [];
      layer.z = Math.max(0, ...arr[ti].layers.map(l => l.z || 0)) + 1;
      arr[ti].layers.push(layer);
      if (ti !== sel) { sel = ti; try { persistUI(); } catch (_) {} }
      save(true, { slides: arr });
      flash('Добавлено на слайд ' + (ti + 1) + ' ✓', 1300);
    };
    const addLayer = (layer) => addLayerAt(layer, null);
    const shapeMini = (s) => ({ rect: '<rect x="3" y="3" width="18" height="18" rx="3"/>', circle: '<circle cx="12" cy="12" r="9"/>', ring: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="3"/>', line: '<rect x="2" y="10" width="20" height="4" rx="2"/>', triangle: '<polygon points="12,3 21,21 3,21"/>', blob: '<circle cx="12" cy="12" r="9"/>', arrow: '<path d="M4 12h13M12 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>', badge: '<rect x="3" y="3" width="18" height="18" rx="6"/>', diamond: '<polygon points="12,3 21,12 12,21 3,12"/>' }[s] || '<rect x="3" y="3" width="18" height="18"/>');
    /* Пикер с подкатегориями + перетаскивание на слайд.
       cats: {Категория:[ключи]}; tileInner(k)→SVG; make(k, drop|null)→слой. Клик = по центру; перетаскивание = в точку дропа. */
    function elemPicker(title, cats, tileSvg, make, x, y) {
      const keys = Object.keys(cats);
      const gridHtml = (ci) => (cats[keys[ci]] || []).map(k => `<button class="celem" data-elk="${esc(k)}" title="${esc(k)}">${tileSvg(k)}</button>`).join('');
      const pp = openPop(`<div class="csec" style="padding-top:2px">${title}</div>
        <div class="cseg ctpl-cats" id="cElCats">${keys.map((c, ci) => `<button data-c="${ci}" class="${ci === 0 ? 'on' : ''}">${c}</button>`).join('')}</div>
        <div class="celem-grid" id="cElGrid">${gridHtml(0)}</div>
        <div class="celem-hint"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5v14"/></svg>Клик — по центру. Или перетащи прямо на нужный слайд.</div>`, x, y);
      pp.classList.add('cpop-el');
      $('#cElCats', pp).addEventListener('click', (ev) => { const b = ev.target.closest('[data-c]'); if (!b) return; $$('#cElCats button', pp).forEach(z => z.classList.toggle('on', z === b)); $('#cElGrid', pp).innerHTML = gridHtml(+b.dataset.c); });
      /* перетаскивание тайла на макет (pointer-события; HTML5-DnD в проекте не используем) */
      pp.addEventListener('pointerdown', (ev) => {
        const tile = ev.target.closest('[data-elk]'); if (!tile) return;
        ev.preventDefault();
        const k = tile.dataset.elk, sx = ev.clientX, sy = ev.clientY; let moved = false, ghost = null;
        const clearHi = () => $$('.slide.drop-hi').forEach(s => s.classList.remove('drop-hi'));
        const mv = (e2) => {
          if (!moved && Math.hypot(e2.clientX - sx, e2.clientY - sy) < 7) return;
          moved = true;
          if (!ghost) { ghost = el(`<div class="celem-ghost">${(tile.querySelector('svg') || tile.querySelector('img')).outerHTML}</div>`); document.body.appendChild(ghost); pp.style.pointerEvents = 'none'; document.body.style.cursor = 'grabbing'; }
          ghost.style.left = e2.clientX + 'px'; ghost.style.top = e2.clientY + 'px';
          ghost.style.display = 'none'; const under = document.elementFromPoint(e2.clientX, e2.clientY); ghost.style.display = '';
          clearHi(); const sl = under && under.closest('.slide'); if (sl) sl.classList.add('drop-hi');
        };
        const up = (e2) => {
          document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
          document.body.style.cursor = ''; pp.style.pointerEvents = ''; clearHi();
          if (ghost) ghost.remove();
          if (!moved) { closePop(); addLayer(make(k, null)); return; }
          ghost && (ghost.style.display = 'none');
          const under = document.elementFromPoint(e2.clientX, e2.clientY);
          const sl = under && under.closest('.slide');
          if (!sl) return; /* мимо слайда — отмена */
          const idx = +sl.dataset.idx, rr = sl.getBoundingClientRect();
          const px = (e2.clientX - rr.left) / rr.width * 100, py = (e2.clientY - rr.top) / rr.height * 100;
          closePop(); addLayerAt(make(k, { x: px, y: py, slideIdx: idx }), idx);
        };
        document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
      });
      return pp;
    }
    $$('[data-add]', body).forEach(b => b.addEventListener('click', (e) => {
      const kind = b.dataset.add;
      const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));
      if (kind === 'shape') {
        elemPicker('Фигуры', SHAPE_CATS,
          (k) => `<svg viewBox="0 0 24 24" fill="currentColor">${shapeMini(k)}</svg>`,
          (k, drop) => ({ t: 'shape', shape: k, color: accent, fill: true, w: 26, round: 10, x: drop ? +clamp(drop.x - 13, -20, 110).toFixed(1) : 34, y: drop ? +clamp(drop.y - 13, -20, 110).toFixed(1) : 34 }),
          e.clientX - 130, e.clientY);
      } else if (kind === 'sticker') {
        /* SVG-подкатегории + сгенерированные растровые паки (Telegram-style, прозрачный PNG).
           Ключи паков — «dir/name», рендерятся <img> и вставляются как img-слой. */
        const IMG_PACKS = {};
        (STK_PACKS || []).forEach(p => { if (p.items && p.items.length) IMG_PACKS[p.title] = p.items.map(it => it.key); });   /* нарезанные паки — ПЕРВЫМИ */
        Object.assign(IMG_PACKS, {
          'Недвижимость': ['realestate/house', 'realestate/building', 'realestate/key', 'realestate/pin', 'realestate/plan'],
          'Стекло': ['realestate-glass/house', 'realestate-glass/building', 'realestate-glass/key', 'realestate-glass/pin', 'realestate-glass/roi'],
          'AUS': ['aus/app', 'aus/camera', 'aus/chat', 'aus/star', 'aus/check'],
        });
        const NUMS = { 'Цифры': [] };   /* нумерация: залитые 1..9 + контурные 1..9 */
        for (let n = 1; n <= 9; n++) NUMS['Цифры'].push('num' + n);
        for (let n = 1; n <= 9; n++) NUMS['Цифры'].push('numo' + n);
        const cats = Object.assign({}, IMG_PACKS, NUMS, STICK_CATS);   /* трендовые паки + цифры — ПЕРВЫМИ */
        elemPicker('Стикеры и нумерация', cats,
          (k) => k.includes('/') ? `<img src="/assets/stickers/${k}.png" alt="" title="${esc(STK_LABEL[k] || '')}" style="width:100%;height:100%;object-fit:contain">` : `<svg viewBox="0 0 24 24" style="color:${/^num\d/.test(k) ? accent : 'inherit'}">${(P.stickers || {})[k] || ''}</svg>`,
          (k, drop) => {
            if (k.includes('/')) return { t: 'img', url: `/assets/stickers/${k}.png`, w: 24, round: 0, x: drop ? +clamp(drop.x - 12, -20, 110).toFixed(1) : 38, y: drop ? +clamp(drop.y - 12, -20, 110).toFixed(1) : 36 };
            const isNum = /^num\d/.test(k);   /* залитые цифры — всегда акцент (белая цифра читается на любом фоне) */
            const white = slideEl(drop ? drop.slideIdx : i).classList.contains('hasbg');
            const color = isNum ? accent : (white ? '#FFFFFF' : accent);
            return { t: 'sticker', key: k, color, w: isNum ? 11 : 16, x: drop ? +clamp(drop.x - 6, -20, 110).toFixed(1) : 40, y: drop ? +clamp(drop.y - 6, -20, 110).toFixed(1) : 38 };
          },
          e.clientX - 170, e.clientY);
      } else if (kind === 'frame') {
        const FN = { thin: 'Тонкая', double: 'Двойная', corners: 'Уголки', inset: 'Внутренняя', film: 'Плёнка', tape: 'Кант' };
        const pp = openPop(`<div class="csec" style="padding-top:2px">Рамки</div><div class="celem-frames">${(P.frames || []).map(f => `<button class="celem-fr" data-frame="${f}"><span class="cfrpv"><span class="frame-${f}" style="--fc:#fff"></span></span><i style="font-style:normal">${FN[f] || f}</i></button>`).join('')}</div>`, e.clientX - 150, e.clientY);
        pp.addEventListener('click', (ev) => { const t = ev.target.closest('[data-frame]'); if (!t) return; closePop(); const sl = slideEl(i); addLayer({ t: 'frame', frame: t.dataset.frame, color: sl.classList.contains('hasbg') ? '#FFFFFF' : accent }); });
      } else if (kind === 'text') {
        addLayer({ t: 'text', text: 'Текст', color: slideEl(i).classList.contains('hasbg') ? '#FFFFFF' : '#0A1833', tsize: 24, tw: 'sans', tb: true, x: 30, y: 42, w: 40 });
      } else if (kind === 'photo') {
        const pp = openPop(`<div class="csec">Фото-слой</div>
          <div class="cpi" data-ph="file">⤴ Загрузить файл</div>
          <div class="csec">или ссылка на фото</div><input class="cinp" id="cLpUrl" placeholder="https://…"><div class="cpi" data-ph="url">Вставить по ссылке</div>
          <div class="csec">или собрать со страницы</div><input class="cinp" id="cLpPage" placeholder="ссылка на страницу проекта"><div class="cpi" data-ph="scan">🔎 Найти фото на странице</div>
          <div id="cLpGrid" class="celem-grid"></div>`, e.clientX - 200, e.clientY);
        pp.addEventListener('click', async (ev) => {
          const it = ev.target.closest('[data-ph]'); if (it) {
            const k2 = it.dataset.ph;
            if (k2 === 'file') { pickFile('image/*', async (f) => { flash('Загружаю…', 0); try { const url = await uploadAsset(f); closePop(); addLayer({ t: 'img', url, x: 22, y: 22, w: 42, round: 12 }); } catch (er) { flash('Ошибка: ' + er.message); } }); return; }
            if (k2 === 'url') { const v = $('#cLpUrl', pp).value.trim(); if (v) { closePop(); addLayer({ t: 'img', url: v, x: 22, y: 22, w: 42, round: 12 }); } return; }
            if (k2 === 'scan') { const v = $('#cLpPage', pp).value.trim(); if (!v) { flash('Вставьте ссылку на страницу'); return; } flash('Сканирую фото…', 0); try { const r = await fetch(`/api/social/scrape-images`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: v }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); flash((j.images || []).length + ' фото — кликните нужное', 2000); $('#cLpGrid', pp).innerHTML = (j.images || []).slice(0, 24).map(u => `<button class="celem cimgpick" data-imgu="${esc(u)}" style="background-image:url('${esc(u)}')"></button>`).join(''); } catch (er) { flash('Не вышло: ' + er.message); } return; }
          }
          const pk = ev.target.closest('[data-imgu]'); if (pk) { closePop(); addLayer({ t: 'img', url: pk.dataset.imgu, x: 20, y: 20, w: 44, round: 12 }); }
        });
      } else if (kind === 'avatar') {
        /* круглый аватар брокера — по умолчанию в углу; фото из файла или по ссылке */
        const AV = { x: 8, y: 64, w: 22 };   /* левый низ (удобно для первого/последнего слайда) */
        const pp = openPop(`<div class="csec">Аватар брокера</div>
          <div class="cpi" data-av="file">⤴ Загрузить фото</div>
          <div class="csec">или ссылка на фото</div><input class="cinp" id="cAvUrl" placeholder="https://…"><div class="cpi" data-av="url">Вставить по ссылке</div>
          <div class="cnote">Круглый аватар с белым кантом. Тяни его на макете, угол — размер. Хорошо на первом/последнем слайде.</div>`, e.clientX - 200, e.clientY);
        pp.addEventListener('click', async (ev) => {
          const it = ev.target.closest('[data-av]'); if (!it) return;
          if (it.dataset.av === 'file') { pickFile('image/*', async (f) => { flash('Загружаю…', 0); try { const url = await uploadAsset(f); closePop(); addLayer(Object.assign({ t: 'img', url, avatar: true }, AV)); } catch (er) { flash('Ошибка: ' + er.message); } }); }
          else { const v = $('#cAvUrl', pp).value.trim(); if (v) { closePop(); addLayer(Object.assign({ t: 'img', url: v, avatar: true }, AV)); } }
        });
      }
    }));
    /* фон */
    $$('[data-bg]', body).forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.bg; const extra = $('#cBgExtra', body);
      if (k === 'none') { setBg(i, 'none'); return; }
      if (k === 'color') { extra.innerHTML = `<input type="color" class="ccolor" id="cCol" value="${slideEl(i).dataset.bgc || '#0A1833'}">`; $('#cCol', extra).addEventListener('input', (e) => setBgLive(i, 'color', e.target.value)); $('#cCol', extra).addEventListener('change', (e) => setBg(i, 'color', e.target.value)); return; }
      if (k === 'photo' || k === 'video') {
        const isV = k === 'video';
        const cur = slideEl(i).dataset[isV ? 'bgv' : 'bg'] || '';
        extra.innerHTML = `<div class="cdrop" id="cDrop"><div class="cdrop-ic">${isV ? '🎬' : '🖼'}</div><div class="cdrop-t">Перетащите ${isV ? 'видео' : 'фото'} сюда<br>или <b>выберите файл</b></div></div>
          <input class="cinp" id="cUrl" placeholder="…или вставьте ссылку (URL)" value="${esc(/^https?:/.test(cur) ? cur : '')}">
          <div class="cnote">${isV ? 'MP4 / WebM · до 25 МБ · зациклится без звука. Лучше 9:16 или 1:1.' : 'JPG / PNG / WebP · до 25 МБ. Лучше вертикаль 4:5 или квадрат 1:1 — под формат карусели.'}</div>
          <div class="cthumb" id="cThumb">${cur ? (isV ? `<video src="${esc(cur)}" muted playsinline></video>` : `<img src="${esc(cur)}" alt="">`) : ''}</div>`;
        const drop = $('#cDrop', extra);
        const doUp = async (file) => {
          if (!file) return;
          const okImg = /^image\//.test(file.type), okVid = /^video\/(mp4|webm)/.test(file.type);
          if ((isV && !okVid) || (!isV && !okImg)) { flash(isV ? 'Нужен файл MP4/WebM' : 'Нужен JPG/PNG/WebP'); return; }
          if (file.size > 25e6) { flash('Файл больше 25 МБ'); return; }
          flash('Загружаю…', 0);
          try { const url = await uploadAsset(file); setBg(i, isV ? 'video' : 'photo', url); flash('Фон обновлён ✓'); } catch (err) { flash('Ошибка: ' + err.message); }
        };
        drop.addEventListener('click', () => pickFile(isV ? 'video/mp4,video/webm' : 'image/*', doUp));
        ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
        ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
        drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) doUp(f); });
        $('#cUrl', extra).addEventListener('change', (e) => { const v = e.target.value.trim(); if (v) setBg(i, isV ? 'video' : 'photo', v); });
        return;
      }
      if (k === 'ai') {
        extra.innerHTML = `<input class="cinp" id="cAiP" placeholder="напр. панорама Дубая на закате"><button class="cwbtn wide" id="cAiGo" style="margin-top:7px">✦ Нарисовать фон</button>`;
        $('#cAiGo', extra).addEventListener('click', async () => { const prompt = $('#cAiP', extra).value.trim(); if (!prompt) { flash('Опишите фон'); return; } flash('✦ ИИ рисует фон (10–20с)…', 0); try { const r = await fetch(`/api/carousels/${P.cid}/ai-bg?key=${encodeURIComponent(KEY)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setBg(i, 'photo', j.url); flash('Фон готов ✓'); } catch (err) { flash('Не вышло: ' + err.message); } });
        return;
      }
    }));
    /* узор фона */
    const pats = $('#cPats', body);
    if (pats) pats.addEventListener('click', (e) => {
      const t = e.target.closest('[data-pat]'); if (!t) return;
      const kk = t.dataset.pat; const sl = slideEl(i); if (!sl) return;
      $$('.cpat', pats).forEach(x => x.classList.toggle('on', x === t));
      sl.className = sl.className.replace(/\b(pat|grad)-\w+/g, '').replace(/\s+/g, ' ').trim();
      delete sl.dataset.grad;   /* узор и градиент взаимоисключаются */
      if (kk === 'none') { delete sl.dataset.bgpat; }
      else {
        delete sl.dataset.bg; delete sl.dataset.bgv; delete sl.dataset.bgc;
        const ov = sl.querySelector('.s-bgv'), os = sl.querySelector('.s-shade'); if (ov) ov.remove(); if (os) os.remove();
        sl.style.background = ''; sl.style.backgroundImage = ''; sl.classList.remove('hasbg');
        sl.dataset.bgpat = kk; sl.classList.add('pat-' + kk);
      }
      dirty = true; save(false); renderBody();
    });
    const grads = $('#cGrads', body);
    if (grads) grads.addEventListener('click', (e) => {
      const t = e.target.closest('[data-grad]'); if (!t) return;
      const kk = t.dataset.grad; const sl = slideEl(i); if (!sl) return;
      $$('.cpat', grads).forEach(x => x.classList.toggle('on', x === t));
      sl.className = sl.className.replace(/\b(pat|grad)-\w+/g, '').replace(/\s+/g, ' ').trim();
      delete sl.dataset.bgpat;   /* градиент и узор взаимоисключаются */
      if (kk === 'none') { delete sl.dataset.grad; }
      else {
        delete sl.dataset.bg; delete sl.dataset.bgv; delete sl.dataset.bgc;
        const ov = sl.querySelector('.s-bgv'), os = sl.querySelector('.s-shade'); if (ov) ov.remove(); if (os) os.remove();
        sl.style.background = ''; sl.style.backgroundImage = ''; sl.classList.remove('hasbg');
        sl.dataset.grad = kk; sl.classList.add('grad-' + kk);
      }
      dirty = true; save(false); renderBody();
    });
  }
  /* цвет вживую без сохранения (сохраняем на change) */
  function setBgLive(i, kind, val) { const sl = slideEl(i); if (!sl) return; if (kind === 'color') { sl.dataset.bgc = val; delete sl.dataset.bg; delete sl.dataset.bgv; const ov = sl.querySelector('.s-bgv'), os = sl.querySelector('.s-shade'); if (ov) ov.remove(); if (os) os.remove(); sl.style.backgroundImage = ''; sl.style.background = val; sl.classList.toggle('hasbg', isDark(val)); } }

  /* старт: восстановить вкладку+выбранный слайд (или Дизайн/первый по умолчанию) */
  { const n = $$('.slide').length; if (sel >= n) sel = Math.max(0, n - 1); }
  $$('.cpanel-tab').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
  selectSlide(sel, false);
  renderBody();
})();
