/* ============================================================================
   Lumen — Design Operating System for property collections (Ф1)
   Не шаблоны, а ГРАММАТИКИ. 6 осей → Design DNA → AUTO Art-Director → page_plan.
   Один DNA на документ; страницы варьируют композицию, но держат единую личность.
   Полностью самодостаточный HTML (инлайн-CSS), печатается в PDF (@media print).
   Пишет ТОЛЬКО из данных db.properties / lead — ничего не выдумывает.
   Отдельный файл намеренно — не конфликтует с параллельной сессией в llm.js/index.js.
   ========================================================================== */

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/* ---- 6 осей 1-го уровня (для UI и валидации). Всё по умолчанию = auto ---- */
const AXES = {
  style:     { label: 'Стиль',            def: 'auto', opts: [['auto', 'Авто'], ['editorial', 'Editorial Luxury'], ['premiumweb', 'Premium Web'], ['architectural', 'Architectural Minimal'], ['investment', 'Investment Intelligence'], ['cinematic', 'Cinematic']] },
  artDir:    { label: 'Арт-дирекшн',      def: 'auto', opts: [['auto', 'Авто'], ['minimal', 'Минимал'], ['balanced', 'Баланс'], ['expressive', 'Выразительно'], ['artdirected', 'Арт-дирекшн']] },
  density:   { label: 'Плотность',        def: 'auto', opts: [['auto', 'Авто'], ['light', 'Лёгкая'], ['standard', 'Стандарт'], ['detailed', 'Детальная']] },
  imageDom:  { label: 'Доминанта фото',   def: 'auto', opts: [['auto', 'Авто'], ['low', 'Низкая'], ['medium', 'Средняя'], ['high', 'Высокая']] },
  dataDepth: { label: 'Глубина данных',   def: 'auto', opts: [['auto', 'Авто'], ['minimal', 'Минимум'], ['dashboard', 'Дашборд'], ['editorial', 'Editorial']] },
  brandMode: { label: 'Бренд',            def: 'auto', opts: [['auto', 'Авто'], ['brand', 'Бренд'], ['neutral', 'Нейтральный'], ['imagederived', 'От фото'], ['dark', 'Тёмный']] },
};

/* seeded RNG (mulberry32) — «Перекомпоновать» = новый seed → другой макет */
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

/* ---- разбор чисел из полей вроде «от 7% годовых», «$145 000», «Q2 2027» ---- */
const numOf = (s) => { const m = String(s == null ? '' : s).replace(',', '.').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
function handoverKey(h) { const s = String(h || ''); if (/готов|ready/i.test(s)) return 0; const q = s.match(/Q(\d)\s*'?\s*(\d{2,4})/i); if (q) { const y = q[2].length === 2 ? 2000 + (+q[2]) : +q[2]; return (y - 2000) * 4 + (+q[1]); } const y = s.match(/(20\d\d)/); return y ? (y[1] - 2000) * 4 : 99; }

/* ---- палитры направлений (muted-premium; без SaaS-фиолета/блёсток) ---- */
const PALS = {
  editorial:     { paper: '#FAF7F1', ink: '#17130C', mut: '#8A7F6C', line: '#E9E1D2', accent: '#8A5A2B', accentSoft: '#F0E7D8', band: '#14110B', onBand: '#F3ECDD', tint: '#F3EDE1' },
  premiumweb:    { paper: '#FFFFFF', ink: '#0E1116', mut: '#68707E', line: '#E7EAEF', accent: '#28407E', accentSoft: '#EBEFF7', band: '#0C1220', onBand: '#EAEEF7', tint: '#F3F5F9' },
  architectural: { paper: '#FEFEFE', ink: '#14161A', mut: '#7C818A', line: '#E7E9EC', accent: '#22252B', accentSoft: '#EEF0F2', band: '#101216', onBand: '#EEF0F3', tint: '#F4F5F6' },
  investment:    { paper: '#F8F9FB', ink: '#0C1424', mut: '#5C6578', line: '#E1E6EF', accent: '#0F5C4A', accentSoft: '#E6F0EC', band: '#0B1322', onBand: '#E7EDF6', tint: '#EEF2F7' },
  cinematic:     { paper: '#F6F4F0', ink: '#141210', mut: '#877F72', line: '#E4DED2', accent: '#A9803E', accentSoft: '#EFE6D5', band: '#0B0B0D', onBand: '#F2ECDF', tint: '#EFE9DD' },
};
const DARK = {
  editorial:     { paper: '#14110B', ink: '#F1EADB', mut: '#A79A82', line: '#2A241A', accent: '#C8944F', accentSoft: '#241D12', band: '#0C0A06', onBand: '#F1EADB', tint: '#1B160E' },
  premiumweb:    { paper: '#0C1220', ink: '#E9EEF8', mut: '#8B94A6', line: '#1E2740', accent: '#6E8FE0', accentSoft: '#141C30', band: '#070B14', onBand: '#E9EEF8', tint: '#131B2C' },
  architectural: { paper: '#111318', ink: '#ECEEF2', mut: '#8A8F99', line: '#232732', accent: '#C7CCD4', accentSoft: '#1A1E26', band: '#0A0B0E', onBand: '#ECEEF2', tint: '#181B22' },
  investment:    { paper: '#0B1322', ink: '#E7EDF6', mut: '#8791A3', line: '#1D2740', accent: '#3BC79A', accentSoft: '#0F1C2C', band: '#060C16', onBand: '#E7EDF6', tint: '#111B2C' },
  cinematic:     { paper: '#0C0C0F', ink: '#F1ECE1', mut: '#9A9182', line: '#241F18', accent: '#C9A15B', accentSoft: '#1C160D', band: '#050506', onBand: '#F1ECE1', tint: '#161310' },
};

/* геолокационный оттенок для brandMode=imagederived (грубая аппроксимация без пикселей) */
const GEO_HUE = { dubai: '#2F6BFF', bali: '#23B383', phuket: '#6D5BD0', spain: '#E4813D', oman: '#B0532E' };

/* шрифты направлений: дисплей-serif/grotesk + метаданные-grotesk (tabular nums везде) */
const FONTS = {
  editorial:     { disp: "'Fraunces',Georgia,serif", meta: "'Manrope',system-ui,sans-serif", opsz: 1 },
  premiumweb:    { disp: "'Space Grotesk',system-ui,sans-serif", meta: "'Inter',system-ui,sans-serif", opsz: 0 },
  architectural: { disp: "'Space Grotesk',system-ui,sans-serif", meta: "'Inter',system-ui,sans-serif", opsz: 0 },
  investment:    { disp: "'Fraunces',Georgia,serif", meta: "'Inter',system-ui,sans-serif", opsz: 1 },
  cinematic:     { disp: "'Fraunces',Georgia,serif", meta: "'Manrope',system-ui,sans-serif", opsz: 1 },
};

const STYLE_NAMES = { editorial: 'Editorial Luxury', premiumweb: 'Premium Web', architectural: 'Architectural Minimal', investment: 'Investment Intelligence', cinematic: 'Cinematic' };

/* ---------- контекст документа: что за данные у нас на руках ---------- */
function docContext(db, c, props) {
  const imgs = props.map(p => (p.images || []).filter(Boolean).length);
  const avgImg = imgs.length ? imgs.reduce((a, b) => a + b, 0) / imgs.length : 0;
  const dataScore = props.reduce((s, p) => s + ((p.units || []).length >= 2 ? 1 : 0) + (p.roi ? 1 : 0) + (p.appreciation ? 1 : 0) + ((p.paymentRows || []).length >= 2 ? 1 : 0), 0) / Math.max(1, props.length);
  const hasTimes = props.some(p => p.district && (p.district.times || []).length);
  return { avgImg, maxImg: Math.max(0, ...imgs), dataScore, hasTimes, nProj: props.length };
}

/* ---------- разрешение осей (auto → конкретика по контексту) ---------- */
function resolveAxes(ax, ctx, r) {
  const a = Object.assign({}, ax);
  if (!a.style || a.style === 'auto') {
    if (ctx.dataScore >= 2.2 && ctx.avgImg < 3) a.style = 'investment';
    else if (ctx.avgImg >= 4) a.style = 'cinematic';
    else a.style = 'editorial';
  }
  if (!PALS[a.style]) a.style = 'editorial';
  if (!a.artDir || a.artDir === 'auto') a.artDir = ctx.avgImg >= 3 ? 'expressive' : 'balanced';
  if (!a.density || a.density === 'auto') a.density = ctx.dataScore >= 2 ? 'detailed' : 'standard';
  if (!a.imageDom || a.imageDom === 'auto') a.imageDom = ctx.avgImg >= 4 ? 'high' : ctx.avgImg <= 1.2 ? 'low' : 'medium';
  if (!a.dataDepth || a.dataDepth === 'auto') a.dataDepth = ctx.dataScore >= 2 ? 'dashboard' : a.style === 'editorial' || a.style === 'cinematic' ? 'editorial' : 'dashboard';
  if (!a.brandMode || a.brandMode === 'auto') a.brandMode = 'brand';
  return a;
}

/* ---------- Design DNA: единая система документа ---------- */
function deriveDNA(db, c, props, ax0, seed) {
  const ctx = docContext(db, c, props);
  const r = rng(seed);
  const ax = resolveAxes(ax0 || {}, ctx, r);
  const dark = ax.brandMode === 'dark' || (PALS[ax.style] && ax.brandMode === 'brand' && false);
  const pal = Object.assign({}, (dark ? DARK : PALS)[ax.style]);
  if (ax.brandMode === 'imagederived') { const g = GEO_HUE[(props[0] || {}).geo] || pal.accent; pal.accent = g; }
  if (ax.brandMode === 'neutral') { pal.accent = dark ? '#C9CCD2' : '#2A2D33'; }
  const f = FONTS[ax.style];
  const densPad = ax.density === 'light' ? [92, 74] : ax.density === 'detailed' ? [70, 60] : 80;
  const scale = ax.density === 'light'
    ? { disp: 78, h1: 46, h2: 30, kick: 12, body: 17, metric: 34 }
    : ax.density === 'detailed'
      ? { disp: 62, h1: 38, h2: 25, kick: 11, body: 15.5, metric: 28 }
      : { disp: 70, h1: 42, h2: 27, kick: 11.5, body: 16, metric: 31 };
  return {
    ax, ctx, dark, pal, fonts: f, scale,
    pad: Array.isArray(densPad) ? densPad : [densPad, Math.round(densPad * 0.78)],
    radius: ax.style === 'architectural' ? 0 : ax.style === 'premiumweb' ? 10 : 4,
    intensity: ax.artDir,          /* minimal | balanced | expressive | artdirected */
    imageDom: ax.imageDom,         /* low | medium | high */
    dataDepth: ax.dataDepth,       /* minimal | dashboard | editorial */
    density: ax.density,
    styleName: STYLE_NAMES[ax.style],
    seed,
  };
}

/* ---------- копирайт по объекту (только из данных — компоновка, не выдумка) ---------- */
function projCopy(c, pid, pr) {
  const ov = ((c.custom || {}).props || {})[pid] || {};
  let block = null;
  if (Array.isArray(c.blocks)) { const b = c.blocks.find(x => x.t === 'proj' && x.data && x.data.pid === pid); if (b) block = b.data; }
  const hook = (block && block.hookTitle) || ov.hookTitle || pr.hookTitle || pr.name;
  const why = (block && block.whyRent) || ov.whyRent || pr.whyRent || [];
  const blurb = (block && block.blurb) || (pr.district || {}).blurb || pr.description || '';
  return { hook, why: (why || []).filter(Boolean), blurb };
}

/* ---------- AUTO Art-Director → page_plan ----------
   Роли: COVER · CLIENT_CRITERIA? · PROJECT_OVERVIEW×N · COMPARISON? · RECOMMENDATION · CLOSING
   Композиция объекта выбирается по доступным ассетам/данным; не повторяется >2× подряд. */
function artDirect(db, c, props, dna, lead, seed) {
  const r = rng(seed ^ 0x9E3779B9);
  const plan = [];
  const coverV = pick(r, dna.intensity === 'minimal' ? ['type', 'plate'] : ['plate', 'editorial', 'band']);
  plan.push({ role: 'COVER', v: coverV });

  const q = (lead && lead.quals) || {};
  const hasCriteria = lead && (q.budget || q.purpose || q.timeline || q.type || lead.geo);
  if (hasCriteria) plan.push({ role: 'CLIENT_CRITERIA', v: dna.ax.style === 'investment' ? 'ledger' : 'brief' });

  const used = [];
  props.forEach((pr, i) => {
    const imgs = (pr.images || []).filter(Boolean);
    const rich = (pr.units || []).length >= 3 || ((pr.roi ? 1 : 0) + (pr.appreciation ? 1 : 0) + ((pr.paymentRows || []).length >= 2 ? 1 : 0) >= 2);
    let v;
    if (imgs.length >= 5 && dna.imageDom !== 'low') v = 'galleryCurated';
    else if (imgs.length <= 1) v = 'singleHero';
    else if (rich && dna.dataDepth !== 'minimal') v = 'metricEditorial';
    else v = 'bento';
    /* анти-повтор: не 3-й раз подряд одна композиция */
    const alts = ['metricEditorial', 'bento', 'singleHero', 'galleryCurated'].filter(x => x !== v && !(x === 'galleryCurated' && imgs.length < 3) && !(x === 'singleHero' && imgs.length > 2 && dna.imageDom === 'high'));
    if (used.length >= 2 && used[used.length - 1] === v && used[used.length - 2] === v) v = pick(r, alts.length ? alts : [v]);
    used.push(v);
    plan.push({ role: 'PROJECT_OVERVIEW', v, pid: pr.id, idx: i });
  });

  if (props.length >= 2) {
    const shareMetrics = props.filter(p => p.roi || p.priceFrom).length >= 2;
    const cmpV = dna.dataDepth === 'editorial' ? 'cards' : shareMetrics ? pick(r, ['matrix', 'scoreboard']) : 'cards';
    plan.push({ role: 'COMPARISON', v: cmpV });
  }
  const recV = dna.ax.style === 'investment' ? 'thesis' : dna.ax.style === 'editorial' || dna.ax.style === 'cinematic' ? 'editorNote' : pick(r, ['editorNote', 'marginNote', 'thesis']);
  plan.push({ role: 'RECOMMENDATION', v: recV });
  plan.push({ role: 'CLOSING', v: dna.dark ? 'band' : pick(r, ['band', 'plate']) });
  return plan;
}

/* ================= РЕНДЕР ================= */
function renderDesignDoc(db, c, opts) {
  opts = opts || {};
  const S = db.settings || {};
  const AG = (S.agency && S.agency.name) || 'Lumen';
  const mgr = (S.agency && S.agency.manager) || {};
  const about = (S.agency && S.agency.about) || {};
  const logo = S.agency && S.agency.logo;
  const geoNames = S.geoNames || {};
  const prById = (pid) => db.properties.find(x => x.id === pid);
  const props = (c.propertyIds || []).map(prById).filter(Boolean);
  const lead = c.leadId ? db.leads.find(l => l.id === c.leadId) : null;

  const seed = (opts.seed != null ? (+opts.seed >>> 0) : ((c.design && c.design.seed) || hashStr(c.id))) >>> 0;
  const dna = deriveDNA(db, c, props, (c.design || {}), seed);
  const plan = artDirect(db, c, props, dna, lead, seed);
  const P = dna.pal;
  const cur = (p) => p && p.currency === 'EUR' ? '€' : '$';
  const money = (n, p) => cur(p) + Number(n || 0).toLocaleString('ru-RU');
  const abs = (u) => u && /^assets\//.test(u) ? '/' + u : u;
  const isPrint = !!opts.print;

  /* ---- атомы UI ---- */
  const kicker = (t) => `<div class="kick">${esc(t)}</div>`;
  const num2 = (n) => String(n).padStart(2, '0');
  const initials = (nm) => (nm || AG).split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const wordmark = () => logo ? `<img class="wm-img" src="${esc(logo)}" alt="${esc(AG)}">` : `<span class="wm-tx">${esc(AG)}</span>`;

  /* метрика-рельса (модули варьируются, не один KPI-блок ×N) */
  function metricRail(pr, variant) {
    const items = [];
    items.push({ k: 'Цена', v: 'от ' + money(pr.priceFrom, pr), sub: pr.type || '' });
    items.push({ k: 'Сдача', v: esc(pr.handover || '—'), sub: pr.market === 'offplan' ? 'off-plan' : 'готовый' });
    if (pr.roi && dna.dataDepth !== 'minimal') items.push({ k: 'Доходность', v: esc(pr.roi), sub: 'данные застройщика', src: 1 });
    if (pr.appreciation && dna.dataDepth === 'dashboard') items.push({ k: 'Прирост', v: esc(pr.appreciation), sub: 'к сдаче', src: 1 });
    if (variant === 'stack') return `<div class="mrail stack">${items.map(m => `<div class="mr"><span class="mr-k">${m.k}</span><b class="mr-v">${m.v}</b>${m.sub ? `<span class="mr-s ${m.src ? 'src' : ''}">${m.sub}</span>` : ''}</div>`).join('')}</div>`;
    if (variant === 'big') return `<div class="mrail big">${items.map((m, i) => `<div class="mr ${i === 0 ? 'lead' : ''}"><b class="mr-v">${m.v}</b><span class="mr-k">${m.k}</span></div>`).join('')}</div>`;
    return `<div class="mrail row">${items.map(m => `<div class="mr"><span class="mr-k">${m.k}</span><b class="mr-v">${m.v}</b>${m.sub ? `<span class="mr-s ${m.src ? 'src' : ''}">${m.sub}</span>` : ''}</div>`).join('')}</div>`;
  }

  /* план оплаты → визуальный milestone-трек (не 3 числа) */
  function payTrack(pr) {
    const rows = (pr.paymentRows || []).filter(r => r && r.pct);
    if (rows.length < 2) return '';
    const label = pr.market === 'offplan' ? 'Рассрочка' : 'Оплата';
    return `<div class="pay">${kicker(label)}
      <div class="pt-track"><div class="pt-line"></div>${rows.map((r, i) => `<div class="pt-node" style="--i:${i}"><span class="pt-dot"></span><b class="pt-pct">${esc(r.pct)}</b><span class="pt-lb">${esc(r.label || '')}</span></div>`).join('')}</div></div>`;
  }

  /* локация → drive-time чипы (без авто-эмодзи). skipBlurb — когда текст уже показан как lede */
  function driveTimes(pr, skipBlurb) {
    const d = pr.district || {};
    const times = (d.times || []).filter(t => t && t.place);
    if (!d.name) return '';
    return `<div class="loc">${kicker('Локация · ' + esc(d.name))}
      ${d.blurb && !skipBlurb ? `<p class="loc-b">${esc(d.blurb)}</p>` : ''}
      ${times.length ? `<div class="dt">${times.map(t => `<div class="dt-r"><b class="dt-min">${esc(t.min)}<i>мин</i></b><span class="dt-line"></span><span class="dt-pl">${esc(t.place)}</span></div>`).join('')}</div>` : ''}</div>`;
  }

  function amenList(pr) {
    if (dna.density === 'light' || dna.dataDepth === 'minimal') return '';
    const a = (pr.amenities || []).filter(Boolean).slice(0, 8);
    if (!a.length) return '';
    return `<div class="amen">${kicker('В комплексе')}<div class="amen-w">${a.map(x => `<span class="amen-c">${esc(x)}</span>`).join('')}</div></div>`;
  }

  function unitsTable(pr) {
    if (dna.dataDepth !== 'dashboard' || dna.density === 'light') return '';
    const u = (pr.units || []).filter(Boolean);
    if (!u.length) return '';
    return `<div class="units">${kicker('Доступные юниты')}
      <table><thead><tr><th>Планировка</th><th>Площадь</th><th>Этаж</th><th>Вид</th><th class="r">Цена</th></tr></thead>
      <tbody>${u.map(x => `<tr><td><b>${esc(x.plan)}</b></td><td>${esc(x.area)}</td><td>${esc(x.floor)}</td><td>${esc(x.view)}</td><td class="r num">${money(x.price, pr)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function imgCell(url, cls, label) {
    if (url) return `<div class="ph ${cls || ''}" style="background-image:url('${esc(abs(url))}')"></div>`;
    return `<div class="ph grad ${cls || ''}"><span>${esc(label || '')}</span></div>`;
  }

  /* ---------- грамматики страниц ---------- */
  let pageNo = 0;
  const foot = (extra) => `<div class="pg-foot"><span class="pf-wm">${esc(AG)}</span><span class="pf-no">${num2(++pageNo)}</span>${extra ? `<span class="pf-x">${extra}</span>` : ''}</div>`;

  const G = {
    COVER(pg) {
      const title = c.title || 'Персональная подборка';
      const hero = props.map(p => (p.images || [])[0]).find(Boolean);
      const minP = Math.min(...props.map(p => p.priceFrom || Infinity));
      const badge = isFinite(minP) ? 'от ' + money(minP, props.find(p => p.priceFrom === minP)) : '';
      const geo = geoNames[(props[0] || {}).geo] || '';
      const meta = `<div class="cv-meta"><span>${esc(dna.ctx.nProj)} ${plural(dna.ctx.nProj)}</span>${geo ? `<span class="dot"></span><span>${esc(geo)}</span>` : ''}${badge ? `<span class="dot"></span><span>${esc(badge)}</span>` : ''}</div>`;
      const forWho = lead ? `<div class="cv-for">Подготовлено для<b>${esc(lead.name || '')}</b></div>` : '';
      if (pg.v === 'band') {
        return `<section class="page cover cv-band ${hero ? 'has' : ''}" ${hero ? `style="background-image:linear-gradient(180deg,rgba(0,0,0,.25),rgba(0,0,0,.72)),url('${esc(abs(hero))}')"` : ''}>
          <header class="cv-top">${wordmark()}<span class="cv-tag">${esc(dna.styleName)}</span></header>
          <div class="cv-mid"><div class="cv-kick">${esc(geo || 'Недвижимость')} · подборка</div><h1 class="cv-h">${esc(title)}</h1>${forWho}</div>
          <footer class="cv-bot">${meta}</footer></section>`;
      }
      if (pg.v === 'type') {
        return `<section class="page cover cv-type"><header class="cv-top">${wordmark()}<span class="cv-tag">${esc(dna.styleName)}</span></header>
          <div class="cv-mid"><div class="cv-kick">${esc(geo || 'Недвижимость')} · персональная подборка</div><h1 class="cv-h xl">${esc(title)}</h1>${forWho}${meta}</div>
          <footer class="cv-bot line"><span>${esc(mgr.name || AG)}</span><span>${new Date(c.createdAt || Date.now()).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</span></footer></section>`;
      }
      if (pg.v === 'editorial') {
        return `<section class="page cover cv-edi"><header class="cv-top">${wordmark()}<span class="cv-tag">${esc(dna.styleName)}</span></header>
          <div class="cv-split"><div class="cv-l"><div class="cv-kick">${esc(geo || 'Недвижимость')}</div><h1 class="cv-h">${esc(title)}</h1>${c.intro ? `<p class="cv-lede">${esc(String(c.intro).split('\n')[0])}</p>` : ''}${forWho}${meta}</div>
          <div class="cv-r">${imgCell(hero, 'cover-img', geo)}</div></div>
          <footer class="cv-bot"></footer></section>`;
      }
      /* plate — фото + плавающая идентити-плашка */
      return `<section class="page cover cv-plate"><div class="cv-photo">${imgCell(hero, 'cover-img', geo)}</div>
        <div class="cv-plate-in"><header class="cv-top">${wordmark()}<span class="cv-tag">${esc(dna.styleName)}</span></header>
          <div class="cv-kick">${esc(geo || 'Недвижимость')} · подборка</div><h1 class="cv-h">${esc(title)}</h1>${forWho}${meta}</div></section>`;
    },

    CLIENT_CRITERIA(pg) {
      const q = (lead.quals) || {};
      const geo = geoNames[lead.geo] || lead.geo;
      const rows = [];
      if (lead.geo) rows.push(['Направление', geo, null]);
      const AX = { purpose: 'Цель', budget: 'Бюджет', timeline: 'Срок', type: 'Формат' };
      for (const k of ['purpose', 'budget', 'timeline', 'type']) { const v = q[k]; if (v && v.value) rows.push([AX[k], v.value, v.quote || null]); }
      const intro = (c.intro || '').trim();
      const body = pg.v === 'ledger'
        ? `<div class="cc-ledger">${rows.map(([k, v, quote]) => `<div class="cc-lr"><span class="cc-k">${esc(k)}</span><b class="cc-v">${esc(v)}</b>${quote ? `<span class="cc-q">«${esc(quote)}»</span>` : ''}</div>`).join('')}</div>`
        : `<div class="cc-brief">${rows.map(([k, v, quote], i) => `<div class="cc-item"><span class="cc-no">${num2(i + 1)}</span><div><span class="cc-k">${esc(k)}</span><b class="cc-v">${esc(v)}</b>${quote ? `<p class="cc-q">«${esc(quote)}»</p>` : ''}</div></div>`).join('')}</div>`;
      return `<section class="page pg">${kicker('Запрос клиента')}
        <h2 class="h2">Что вы искали</h2>
        ${intro ? `<p class="lede">${esc(intro)}</p>` : ''}
        ${body}
        <p class="cc-note">Параметры — со слов клиента. Подборка собрана строго под них.</p>
        ${foot('критерии')}</section>`;
    },

    PROJECT_OVERVIEW(pg) {
      const pr = prById(pg.pid); if (!pr) return '';
      const co = projCopy(c, pg.pid, pr);
      const imgs = (pr.images || []).filter(Boolean);
      const head = `<div class="po-head">${kicker('Проект №' + num2(pg.idx + 1) + (pr.developer ? ' · ' + esc(pr.developer) : ''))}<h2 class="po-h">${esc(co.hook)}</h2>${pr.name !== co.hook ? `<div class="po-sub">${esc(pr.name)}${pr.area ? ' · ' + esc(pr.area) : ''}</div>` : (pr.area ? `<div class="po-sub">${esc(pr.area)}</div>` : '')}</div>`;
      const why = co.why.length ? `<div class="rec-inline">${kicker(pr.market === 'offplan' ? 'Почему стоит рассмотреть' : 'Почему этот объект')}<ol class="why">${co.why.slice(0, 3).map(w => `<li>${esc(w)}</li>`).join('')}</ol></div>` : '';

      if (pg.v === 'singleHero') {
        return `<section class="page po po-single ${dna.imageDom === 'high' ? 'domhi' : ''}">
          <div class="po-hero">${imgCell(imgs[0], 'hero', pr.area || pr.name)}<div class="po-ident"><span class="po-id-k">${esc(geoNames[pr.geo] || '')}</span><b class="po-id-v">${esc(pr.name)}</b></div></div>
          ${head}
          ${co.blurb ? `<p class="lede drop">${esc(co.blurb)}</p>` : ''}
          ${metricRail(pr, 'row')}
          ${driveTimes(pr, true)}${payTrack(pr)}${why}
          ${foot(esc(pr.name))}</section>`;
      }
      if (pg.v === 'galleryCurated') {
        const g = imgs.slice(0, 5);
        return `<section class="page po po-gal">
          ${head}
          <div class="gal5">${imgCell(g[0], 'g-main', pr.area)}${g.slice(1, 5).map((u, i) => imgCell(u, 'g-s', pr.area)).join('')}</div>
          <div class="po-cols"><div class="po-c1">${co.blurb ? `<p class="lede">${esc(co.blurb)}</p>` : ''}${driveTimes(pr, true)}${amenList(pr)}</div>
            <div class="po-c2">${metricRail(pr, 'stack')}${payTrack(pr)}</div></div>
          ${why}${unitsTable(pr)}
          ${foot(esc(pr.name))}</section>`;
      }
      if (pg.v === 'bento') {
        return `<section class="page po po-bento">
          ${head}
          <div class="bento">
            <div class="bt bt-img">${imgCell(imgs[0], '', pr.area)}</div>
            <div class="bt bt-m">${metricRail(pr, 'big')}</div>
            ${imgs[1] ? `<div class="bt bt-img2">${imgCell(imgs[1], '', pr.area)}</div>` : ''}
            <div class="bt bt-loc">${driveTimes(pr) || (co.blurb ? `<p class="lede">${esc(co.blurb)}</p>` : '')}</div>
          </div>
          ${payTrack(pr)}${why}${unitsTable(pr)}
          ${foot(esc(pr.name))}</section>`;
      }
      /* metricEditorial — редакторский сплит: текст + рельса метрик, план оплаты трек */
      return `<section class="page po po-me">
        ${head}
        <div class="me-split">
          <div class="me-l">${co.blurb ? `<p class="lede drop">${esc(co.blurb)}</p>` : ''}${driveTimes(pr, true)}${amenList(pr)}</div>
          <aside class="me-r">${imgCell(imgs[0], 'me-img', pr.area)}${metricRail(pr, 'stack')}</aside>
        </div>
        ${payTrack(pr)}${why}${unitsTable(pr)}
        ${foot(esc(pr.name))}</section>`;
    },

    COMPARISON(pg) {
      const rows = [
        { k: 'Цена входа', get: p => p.priceFrom, fmt: p => 'от ' + money(p.priceFrom, p), best: 'min', num: p => p.priceFrom },
        { k: 'Сдача', fmt: p => esc(p.handover || '—'), best: 'min', num: p => handoverKey(p.handover) },
        { k: 'Доходность', fmt: p => p.roi ? esc(p.roi) : '—', best: 'max', num: p => numOf(p.roi) },
        { k: 'Прирост к сдаче', fmt: p => p.appreciation ? esc(p.appreciation) : '—', best: 'max', num: p => numOf(p.appreciation) },
        { k: 'Формат', fmt: p => esc(p.type || '—'), best: null },
      ];
      const bestIdx = (row) => {
        if (!row.best) return -1;
        let bi = -1, bv = null;
        props.forEach((p, i) => { const n = row.num ? row.num(p) : null; if (n == null || isNaN(n)) return; if (bv == null || (row.best === 'min' ? n < bv : n > bv)) { bv = n; bi = i; } });
        return bi;
      };
      if (pg.v === 'cards' || props.length > 3) {
        return `<section class="page pg cmp">${kicker('Сравнение')}<h2 class="h2">${esc(dna.ctx.nProj)} ${plural(dna.ctx.nProj)} рядом</h2>
          <div class="cmp-cards">${props.map((p, i) => `<div class="cmpc"><div class="cmpc-h"><b>${esc(p.name)}</b><span>${esc(p.area || '')}</span></div>
            ${rows.map(r => { const bi = bestIdx(r); return `<div class="cmpc-r ${bi === i ? 'best' : ''}"><span class="ck">${esc(r.k)}</span><b class="cv num">${r.fmt(p)}</b>${bi === i ? '<i class="bi">лучшее</i>' : ''}</div>`; }).join('')}</div>`).join('')}</div>
          <p class="cc-note">«Лучшее» — по фактическим цифрам объектов (мин. цена, макс. доходность/прирост, ранняя сдача), не оценка.</p>
          ${foot('сравнение')}</section>`;
      }
      const heads = props.map(p => `<th><b>${esc(p.name)}</b><span>${esc(p.area || '')}</span></th>`).join('');
      return `<section class="page pg cmp">${kicker('Сравнение')}<h2 class="h2">${props.length} ${plural(props.length)} по параметрам</h2>
        <div class="cmp-wrap"><table class="cmp-matrix"><thead><tr><th></th>${heads}</tr></thead><tbody>
        ${rows.map(r => { const bi = bestIdx(r); return `<tr><td class="rk">${esc(r.k)}</td>${props.map((p, i) => `<td class="num ${bi === i ? 'best' : ''}">${r.fmt(p)}${bi === i ? '<i class="bi">✓</i>' : ''}</td>`).join('')}</tr>`; }).join('')}
        </tbody></table></div>
        <p class="cc-note">Подсветка — лучшее значение в строке по фактическим данным (не рейтинг).</p>
        ${foot('сравнение')}</section>`;
    },

    RECOMMENDATION(pg) {
      /* тезисы из РЕАЛЬНЫХ цифр — суперлативы, честно посчитанные */
      const byMin = (f) => props.slice().filter(p => f(p) != null && !isNaN(f(p))).sort((a, b) => f(a) - f(b))[0];
      const byMax = (f) => props.slice().filter(p => f(p) != null && !isNaN(f(p))).sort((a, b) => f(b) - f(a))[0];
      const cheapest = byMin(p => p.priceFrom);
      const topRoi = byMax(p => numOf(p.roi));
      const topAppr = byMax(p => numOf(p.appreciation));
      const early = byMin(p => handoverKey(p.handover));
      const pts = [];
      if (cheapest) pts.push([`Порог входа`, `${esc(cheapest.name)} — самый доступный старт, ${money(cheapest.priceFrom, cheapest)}.`]);
      if (topRoi && topRoi !== cheapest) pts.push([`Доходность`, `${esc(topRoi.name)} — заявленная доходность ${esc(topRoi.roi)}.`]);
      else if (topRoi) pts.push([`Доходность`, `У ${esc(topRoi.name)} — ${esc(topRoi.roi)}.`]);
      if (topAppr) pts.push([`Горизонт роста`, `${esc(topAppr.name)} — прирост ${esc(topAppr.appreciation)}.`]);
      if (early && /готов|ready|Q[1-4]/i.test(String(early.handover))) pts.push([`Сроки`, `${esc(early.name)} — ближайшая ${/готов|ready/i.test(String(early.handover)) ? 'готовность' : 'сдача'} (${esc(early.handover)}).`]);
      const sign = `<div class="rc-sign"><div class="rc-ava">${esc(initials(mgr.name))}</div><div><b>${esc(mgr.name || AG)}</b><span>${esc(mgr.title || 'ваш менеджер')}</span></div></div>`;
      const geo = geoNames[(props[0] || {}).geo] || '';

      if (pg.v === 'thesis') {
        return `<section class="page pg rec rec-thesis">${kicker('Инвест-резюме')}<h2 class="h2">Как я вижу выбор</h2>
          <div class="th-grid">${pts.map(([k, v], i) => `<div class="th"><span class="th-no">${num2(i + 1)}</span><span class="th-k">${esc(k)}</span><p class="th-v">${v}</p></div>`).join('')}</div>
          ${sign}${foot('резюме')}</section>`;
      }
      if (pg.v === 'marginNote') {
        return `<section class="page pg rec rec-margin"><div class="mn-l">${kicker('От эксперта')}<h2 class="h2 sm">Короткая рекомендация</h2>${sign}</div>
          <div class="mn-r">${pts.map(([k, v]) => `<p class="mn-p"><b>${esc(k)}.</b> ${v}</p>`).join('')}${lead ? `<p class="mn-cta">Скажите, что откликается — посчитаю доходность и условия точечно.</p>` : ''}</div>
          ${foot('рекомендация')}</section>`;
      }
      /* editorNote — подписанная заметка редактора/менеджера */
      const opener = lead ? `${(lead.name || '').split(' ')[0] || ''}, вот что важно из этой подборки${geo ? ' по ' + esc(geo) : ''}.` : `Коротко — что важно из этой подборки.`;
      return `<section class="page pg rec rec-note">
        <div class="rn-mark">“</div>
        <div class="rn-body">${kicker('Заметка менеджера')}
          <p class="rn-open">${esc(opener)}</p>
          <div class="rn-pts">${pts.map(([k, v]) => `<p><b>${esc(k)}.</b> ${v}</p>`).join('')}</div>
          ${lead ? `<p class="rn-close">Готов созвониться и пройтись по любому из них — с расчётом под ваш бюджет.</p>` : ''}
        </div>
        ${sign}${foot('рекомендация')}</section>`;
    },

    CLOSING(pg) {
      const phone = (mgr.phone || '').replace(/\D/g, '');
      const wa = phone ? `https://wa.me/${phone}?text=${encodeURIComponent('Здравствуйте! По подборке «' + (c.title || '') + '» — интересует проект №')}` : '';
      const bullets = (about.whyUs || about.bullets || []).slice(0, 3);
      const inner = `<div class="cl-brand">${wordmark()}</div>
        <h2 class="cl-h">Напишите номер проекта — вышлю детали и расчёт</h2>
        ${bullets.length ? `<ul class="cl-why">${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
        <div class="cl-contact">${mgr.name ? `<div class="cl-mgr"><div class="cl-ava">${esc(initials(mgr.name))}</div><div><b>${esc(mgr.name)}</b>${mgr.title ? `<span>${esc(mgr.title)}</span>` : ''}${mgr.phone ? `<span>${esc(mgr.phone)}</span>` : ''}</div></div>` : ''}
        ${wa ? `<a class="cl-btn" href="${esc(wa)}">Написать в WhatsApp</a>` : ''}</div>`;
      if (pg.v === 'plate') return `<section class="page cover cl-plate"><div class="cl-in">${inner}</div></section>`;
      return `<section class="page cover cl-band">${inner}</section>`;
    },
  };

  const body = plan.map(pg => (G[pg.role] ? G[pg.role](pg) : '')).join('\n');

  /* ---- инлайн CSS: DNA через custom properties + классы стиля ---- */
  const F = dna.fonts;
  const sc = dna.scale;
  const css = `
:root{
  --paper:${P.paper};--ink:${P.ink};--mut:${P.mut};--line:${P.line};--accent:${P.accent};--accent-soft:${P.accentSoft};--band:${P.band};--on-band:${P.onBand};--tint:${P.tint};
  --disp:${F.disp};--meta:${F.meta};--radius:${dna.radius}px;
  --pad-y:${dna.pad[0]}px;--pad-x:${dna.pad[1]}px;
  --s-disp:${sc.disp}px;--s-h1:${sc.h1}px;--s-h2:${sc.h2}px;--s-kick:${sc.kick}px;--s-body:${sc.body}px;--s-metric:${sc.metric}px;
}
*{margin:0;padding:0;box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{background:${dna.dark ? P.band : '#E7E4DC'};font-family:var(--meta);color:var(--ink);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;font-feature-settings:"tnum" 1,"cv01" 1;line-height:1.5}
.doc{max-width:860px;margin:0 auto;padding:34px 18px 60px}
@media(max-width:640px){.doc{padding:0}}
.num,.mr-v,.pt-pct,.dt-min,.cv,.cmpc-r .cv,.cmp-matrix td{font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}
.page{position:relative;background:var(--paper);color:var(--ink);min-height:1180px;padding:var(--pad-y) var(--pad-x);margin:0 0 26px;box-shadow:0 24px 70px -30px rgba(10,10,20,${dna.dark ? '.9' : '.35'});overflow:hidden;border-radius:2px}
@media(max-width:640px){.page{min-height:auto;padding:54px 26px;margin:0 0 12px;box-shadow:none}}
.page.cover,.page.po-single{padding:0}
/* текстовые страницы (.pg) сами по себе короче A4 — не растягиваем в пустую половину: страница по контенту, футер в потоке снизу */
.page.pg{min-height:auto;display:flex;flex-direction:column;padding-bottom:calc(var(--pad-y) * .7)}
.page.pg > .pg-foot{position:static;left:auto;right:auto;bottom:auto;margin-top:52px}
/* типографика */
.kick{font-family:var(--meta);font-size:var(--s-kick);font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin-bottom:14px}
.h2{font-family:var(--disp);font-size:var(--s-h2);line-height:1.08;font-weight:600;letter-spacing:-.01em;${F.opsz ? 'font-optical-sizing:auto;' : ''}margin-bottom:16px}
.h2.sm{font-size:calc(var(--s-h2)*.8)}
.lede{font-size:var(--s-body);line-height:1.62;color:var(--ink);max-width:60ch;margin-bottom:22px}
.lede.drop::first-letter{font-family:var(--disp);font-size:3.1em;line-height:.82;float:left;margin:6px 12px 0 0;color:var(--accent);font-weight:600}
p{font-size:var(--s-body);line-height:1.6}
.pg-foot{position:absolute;left:var(--pad-x);right:var(--pad-x);bottom:calc(var(--pad-y) * .5);display:flex;align-items:center;gap:12px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);border-top:1px solid var(--line);padding-top:12px}
.pf-wm{font-weight:700;color:var(--ink)}.pf-no{margin-left:auto;font-variant-numeric:tabular-nums}.pf-x{color:var(--mut);letter-spacing:.1em}
@media(max-width:640px){.pg-foot{position:static;margin-top:34px}}
/* ---- COVER ---- */
.cover{display:flex;flex-direction:column;min-height:1180px}
@media(max-width:640px){.cover{min-height:auto}}
.cv-top{display:flex;align-items:center;justify-content:space-between;padding:var(--pad-y) var(--pad-x) 0}
.wm-tx{font-family:var(--disp);font-size:23px;font-weight:600;letter-spacing:-.01em}.wm-img{height:34px;max-width:180px;object-fit:contain}
.cv-tag{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--mut);border:1px solid var(--line);padding:6px 11px;border-radius:100px}
.cv-kick{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:22px}
.cv-h{font-family:var(--disp);font-size:var(--s-disp);line-height:1.02;font-weight:600;letter-spacing:-.02em;${F.opsz ? 'font-optical-sizing:auto;' : ''}max-width:15ch}
.cv-h.xl{font-size:calc(var(--s-disp)*1.28)}
.cv-for{margin-top:30px;font-size:13px;letter-spacing:.04em;color:var(--mut);display:flex;flex-direction:column;gap:3px}.cv-for b{font-family:var(--disp);font-size:24px;color:var(--ink);font-weight:600;letter-spacing:-.01em}
.cv-meta{display:flex;align-items:center;gap:14px;font-size:13px;color:var(--mut);letter-spacing:.02em;margin-top:26px;flex-wrap:wrap}
.cv-meta .dot{width:4px;height:4px;border-radius:50%;background:var(--mut);opacity:.6}
.cv-mid{flex:1;display:flex;flex-direction:column;justify-content:center;padding:0 var(--pad-x)}
.cv-bot{padding:0 var(--pad-x) var(--pad-y);display:flex;justify-content:space-between;font-size:12px;color:var(--mut);letter-spacing:.08em;text-transform:uppercase}
.cv-bot.line{border-top:1px solid var(--line);padding-top:20px;margin:0 var(--pad-x);width:auto}
/* band cover */
.cv-band{color:#fff;background:var(--band) center/cover no-repeat}.cv-band .cv-tag{color:rgba(255,255,255,.7);border-color:rgba(255,255,255,.28)}.cv-band .wm-tx,.cv-band .cv-for b{color:#fff}.cv-band .cv-kick{color:#fff}.cv-band .cv-meta,.cv-band .cv-for{color:rgba(255,255,255,.82)}.cv-band .cv-meta .dot{background:#fff}
/* plate cover */
.cv-plate{position:relative;padding:0}.cv-photo{position:absolute;inset:0}.cv-photo .ph{width:100%;height:100%}
.cv-plate-in{position:relative;margin:auto var(--pad-x) var(--pad-x);align-self:flex-end;background:var(--paper);padding:46px 44px;max-width:76%;border-radius:var(--radius);box-shadow:0 30px 80px -30px rgba(0,0,0,.5)}
.cv-plate-in .cv-top{padding:0 0 26px}
@media(max-width:640px){.cv-plate-in{max-width:none;margin:auto 18px 18px}}
/* editorial cover */
.cv-edi .cv-split{flex:1;display:grid;grid-template-columns:1fr .82fr;gap:0}
.cv-edi .cv-l{padding:0 46px 0 var(--pad-x);display:flex;flex-direction:column;justify-content:center}
.cv-edi .cv-lede{font-size:16px;color:var(--mut);margin-top:22px;max-width:34ch;line-height:1.6}
.cv-edi .cv-r{position:relative}.cv-edi .cover-img{position:absolute;inset:0}
@media(max-width:640px){.cv-edi .cv-split{grid-template-columns:1fr}.cv-edi .cv-r{min-height:340px}.cv-edi .cv-l{padding:0 26px 34px}}
/* ---- images ---- */
.ph{background:var(--tint) center/cover no-repeat;position:relative}
.ph.grad{background:linear-gradient(135deg,var(--band),color-mix(in srgb,var(--accent) 55%,var(--band)));display:flex;align-items:center;justify-content:center}
.ph.grad span{color:rgba(255,255,255,.72);font-family:var(--disp);font-size:22px;letter-spacing:.02em}
/* ---- metric rail ---- */
.mrail{margin:8px 0 26px}
.mrail.row{display:flex;flex-wrap:wrap;gap:0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.mrail.row .mr{flex:1;min-width:130px;padding:18px 22px 18px 0;border-right:1px solid var(--line)}
.mrail.row .mr:last-child{border-right:0}
.mrail.stack{display:flex;flex-direction:column;gap:0;border:1px solid var(--line);border-radius:var(--radius)}
.mrail.stack .mr{display:flex;align-items:baseline;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line)}.mrail.stack .mr:last-child{border-bottom:0}
.mrail.stack .mr-k{flex:0 0 88px;font-size:11px}.mrail.stack .mr-v{margin-left:auto}.mrail.stack .mr-s{flex-basis:100%;order:3}
.mrail.big{display:flex;gap:34px;flex-wrap:wrap;margin-bottom:30px}
.mrail.big .mr{display:flex;flex-direction:column-reverse;gap:6px}.mrail.big .mr.lead .mr-v{font-size:calc(var(--s-metric)*1.15);color:var(--accent)}
.mr-k{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);font-weight:700;display:block}
.mr-v{font-family:var(--disp);font-size:var(--s-metric);font-weight:600;letter-spacing:-.01em;line-height:1;display:block;margin-top:8px}
.mrail.stack .mr-v{margin-top:0}
.mr-s{font-size:11px;color:var(--mut);margin-top:6px;display:block}.mr-s.src{font-style:italic;opacity:.85}
/* ---- pay track ---- */
.pay{margin:14px 0 28px}
.pt-track{position:relative;display:flex;justify-content:space-between;padding-top:8px}
.pt-line{position:absolute;left:6px;right:6px;top:13px;height:2px;background:var(--line)}
.pt-node{position:relative;display:flex;flex-direction:column;align-items:flex-start;flex:1;padding-right:14px}
.pt-node:last-child{flex:0 0 auto;padding-right:0}
.pt-dot{width:12px;height:12px;border-radius:50%;background:var(--paper);border:2.5px solid var(--accent);position:relative;z-index:1}
.pt-pct{font-family:var(--disp);font-size:26px;font-weight:600;margin-top:12px;letter-spacing:-.01em}
.pt-lb{font-size:11.5px;color:var(--mut);margin-top:3px;max-width:15ch;line-height:1.3}
/* ---- location / drive times ---- */
.loc{margin:8px 0 26px}
.loc-b{font-size:14.5px;color:var(--mut);line-height:1.55;max-width:56ch;margin-bottom:14px}
.dt{display:flex;flex-direction:column;gap:0}
.dt-r{display:flex;align-items:center;gap:16px;padding:11px 0;border-bottom:1px solid var(--line)}.dt-r:last-child{border-bottom:0}
.dt-min{font-family:var(--disp);font-size:22px;font-weight:600;flex:0 0 auto;min-width:66px}.dt-min i{font-style:normal;font-size:12px;color:var(--mut);font-family:var(--meta);margin-left:3px;font-weight:500}
.dt-line{flex:1;height:1px;background:repeating-linear-gradient(90deg,var(--line) 0 5px,transparent 5px 10px)}
.dt-pl{font-size:14px;color:var(--ink);flex:0 0 auto}
/* ---- amenities ---- */
.amen{margin:6px 0 22px}.amen-w{display:flex;flex-wrap:wrap;gap:8px}
.amen-c{font-size:12.5px;color:var(--ink);border:1px solid var(--line);padding:7px 13px;border-radius:100px;background:var(--tint)}
/* ---- units ---- */
.units{margin:14px 0 24px}
.units table{width:100%;border-collapse:collapse;font-size:13.5px}
.units th{text-align:left;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut);font-weight:700;padding:0 12px 10px;border-bottom:1px solid var(--ink)}
.units td{padding:12px;border-bottom:1px solid var(--line)}.units .r{text-align:right}.units td.num{font-family:var(--disp);font-weight:600}
/* ---- why (inline recommendation, not a green box) ---- */
.rec-inline{margin:10px 0 22px;border-left:2px solid var(--accent);padding-left:22px}
.why{list-style:none;counter-reset:w}.why li{counter-increment:w;position:relative;padding:9px 0 9px 34px;font-size:14.5px;line-height:1.5;border-bottom:1px solid var(--line)}.why li:last-child{border-bottom:0}
.why li::before{content:counter(w,decimal-leading-zero);position:absolute;left:0;top:9px;font-family:var(--disp);font-size:13px;color:var(--accent);font-weight:600}
/* ---- PROJECT single ---- */
.po{padding:var(--pad-y) var(--pad-x)}
.po-single{padding:0}.po-single .po-hero{position:relative;height:520px}.po-single .po-hero .hero{position:absolute;inset:0}
.po-single.domhi .po-hero{height:640px}
.po-ident{position:absolute;left:0;bottom:0;background:var(--paper);padding:20px 30px;border-top-right-radius:var(--radius);max-width:70%}
.po-ident .po-id-k{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:700;display:block}
.po-ident .po-id-v{font-family:var(--disp);font-size:26px;font-weight:600;letter-spacing:-.01em;margin-top:5px;display:block}
.po-single .po-head,.po-single .lede,.po-single .mrail,.po-single .loc,.po-single .pay,.po-single .rec-inline{margin-left:var(--pad-x);margin-right:var(--pad-x)}
.po-single .po-head{margin-top:44px}.po-single .pg-foot{left:var(--pad-x);right:var(--pad-x)}
.po-head{margin-bottom:26px}
.po-h{font-family:var(--disp);font-size:var(--s-h1);line-height:1.06;font-weight:600;letter-spacing:-.015em;${F.opsz ? 'font-optical-sizing:auto;' : ''}margin-top:8px;max-width:20ch}
.po-sub{font-size:13px;letter-spacing:.06em;color:var(--mut);margin-top:12px;text-transform:uppercase}
/* ---- PROJECT metricEditorial ---- */
.me-split{display:grid;grid-template-columns:1.1fr .9fr;gap:38px;align-items:start;margin-bottom:8px}
.me-r .me-img{height:250px;border-radius:var(--radius);margin-bottom:20px}
@media(max-width:640px){.me-split{grid-template-columns:1fr;gap:24px}}
/* ---- PROJECT gallery ---- */
.gal5{display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:200px 150px;gap:8px;margin-bottom:26px}
.gal5 .g-main{grid-column:1/3;grid-row:1/3;border-radius:var(--radius)}.gal5 .g-s{border-radius:var(--radius)}
.po-cols{display:grid;grid-template-columns:1.15fr .85fr;gap:36px;align-items:start}
@media(max-width:640px){.gal5{grid-template-columns:repeat(2,1fr);grid-template-rows:180px 120px 120px}.gal5 .g-main{grid-column:1/3}.po-cols{grid-template-columns:1fr;gap:22px}}
/* ---- PROJECT bento ---- */
.bento{display:grid;grid-template-columns:1.4fr 1fr;grid-template-rows:230px 200px;gap:10px;margin-bottom:26px}
.bento .bt{border-radius:var(--radius);overflow:hidden}
.bento .bt-img{grid-row:1/2}.bento .bt-m{grid-row:1/2;background:var(--tint);padding:26px;display:flex;align-items:center}
.bento .bt-img2{grid-row:2/3}.bento .bt-loc{grid-row:2/3;background:var(--tint);padding:24px;overflow:auto}
.bento .bt-img .ph,.bento .bt-img2 .ph{width:100%;height:100%}.bento .bt-m .mrail{margin:0}
@media(max-width:640px){.bento{grid-template-columns:1fr;grid-template-rows:none}.bento .bt-img,.bento .bt-img2{height:200px}}
/* ---- CLIENT CRITERIA ---- */
.cc-brief{display:grid;grid-template-columns:1fr 1fr;gap:2px 40px;margin:8px 0 20px}
.cc-item{display:flex;gap:16px;padding:20px 0;border-bottom:1px solid var(--line)}
.cc-no{font-family:var(--disp);font-size:15px;color:var(--accent);font-weight:600;flex:0 0 auto;padding-top:3px}
.cc-item .cc-k{font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:var(--mut);font-weight:700;display:block}
.cc-item .cc-v{font-family:var(--disp);font-size:23px;font-weight:600;letter-spacing:-.01em;display:block;margin-top:5px}
.cc-item .cc-q{font-size:13px;color:var(--mut);font-style:italic;margin-top:8px;line-height:1.5}
.cc-ledger{border-top:1px solid var(--ink);margin:8px 0 20px}
.cc-lr{display:grid;grid-template-columns:150px 1fr;gap:20px;align-items:baseline;padding:18px 0;border-bottom:1px solid var(--line)}
.cc-lr .cc-k{font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:var(--mut);font-weight:700}
.cc-lr .cc-v{font-family:var(--disp);font-size:22px;font-weight:600;letter-spacing:-.01em}
.cc-lr .cc-q{grid-column:2;font-size:13px;color:var(--mut);font-style:italic;margin-top:-8px}
.cc-note{font-size:11.5px;color:var(--mut);font-style:italic;margin-top:14px;letter-spacing:.01em}
@media(max-width:640px){.cc-brief{grid-template-columns:1fr}}
/* ---- COMPARISON ---- */
.cmp-wrap{overflow-x:auto}
.cmp-matrix{width:100%;border-collapse:collapse}
.cmp-matrix th{text-align:left;padding:0 16px 16px;vertical-align:bottom;border-bottom:2px solid var(--ink)}
.cmp-matrix th b{font-family:var(--disp);font-size:17px;font-weight:600;display:block;letter-spacing:-.01em}.cmp-matrix th span{font-size:11px;color:var(--mut);letter-spacing:.04em}
.cmp-matrix .rk{font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut);font-weight:700;white-space:nowrap;width:1%}
.cmp-matrix td{padding:16px;border-bottom:1px solid var(--line);font-family:var(--disp);font-size:17px;font-weight:500;position:relative}
.cmp-matrix td.best{color:var(--accent);font-weight:600}
.cmp-matrix td.best .bi{position:absolute;top:8px;right:8px;font-size:11px;color:var(--accent);font-style:normal}
.cmp-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin:6px 0 16px}
.cmpc{border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
.cmpc-h{background:var(--tint);padding:16px 18px;border-bottom:1px solid var(--line)}.cmpc-h b{font-family:var(--disp);font-size:17px;font-weight:600;display:block;letter-spacing:-.01em}.cmpc-h span{font-size:11px;color:var(--mut)}
.cmpc-r{display:flex;align-items:center;gap:10px;padding:11px 18px;border-bottom:1px solid var(--line);position:relative}.cmpc-r:last-child{border-bottom:0}
.cmpc-r .ck{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);font-weight:700}
.cmpc-r .cv{margin-left:auto;font-family:var(--disp);font-size:15px;font-weight:600;text-align:right}
.cmpc-r.best{background:var(--accent-soft)}.cmpc-r.best .cv{color:var(--accent)}
.cmpc-r .bi{position:absolute;left:18px;bottom:2px;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);font-style:normal}
/* ---- RECOMMENDATION ---- */
.rec-note{padding-top:calc(var(--pad-y) + 10px)}
.rn-mark{font-family:var(--disp);font-size:150px;line-height:.5;color:var(--accent);opacity:.18;position:absolute;top:70px;left:calc(var(--pad-x) - 6px)}
.rn-body{position:relative;max-width:62ch;margin-top:60px}
.rn-open{font-family:var(--disp);font-size:27px;line-height:1.28;font-weight:500;letter-spacing:-.01em;margin-bottom:26px}
.rn-pts p{font-size:15.5px;line-height:1.62;margin-bottom:14px;color:var(--ink)}.rn-pts b,.mn-p b,.rn-close b{color:var(--accent)}
.rn-close{font-size:15px;color:var(--mut);margin-top:22px;line-height:1.6}
.rc-sign,.cl-mgr{display:flex;align-items:center;gap:14px;margin-top:40px}
.rc-ava,.cl-ava{width:52px;height:52px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-family:var(--disp);font-weight:600;font-size:18px;flex:0 0 auto}
.rc-sign b,.cl-mgr b{display:block;font-size:15px}.rc-sign span,.cl-mgr span{display:block;font-size:12.5px;color:var(--mut)}
.rec-thesis .th-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 40px;margin:6px 0 10px}
.th{padding:22px 0;border-bottom:1px solid var(--line)}
.th-no{font-family:var(--disp);font-size:14px;color:var(--accent);font-weight:600}
.th-k{font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:var(--mut);font-weight:700;display:block;margin:8px 0 6px}
.th-v{font-size:15px;line-height:1.55}
.rec-margin{display:grid;grid-template-columns:.85fr 1.15fr;gap:44px;align-items:start}
.mn-p{font-size:15.5px;line-height:1.62;margin-bottom:16px}.mn-cta{font-size:15px;color:var(--mut);margin-top:20px;line-height:1.6}
@media(max-width:640px){.rec-thesis .th-grid,.rec-margin{grid-template-columns:1fr;gap:0 0}.rec-margin{gap:26px}}
/* ---- CLOSING ---- */
.cl-band{background:var(--band);color:var(--on-band);align-items:flex-start;justify-content:center;padding:var(--pad-y) var(--pad-x)}
.cl-band .wm-tx{color:#fff}.cl-band .cl-mgr b{color:#fff}
.cl-plate{align-items:center;justify-content:center}
.cl-in{background:var(--band);color:var(--on-band);border-radius:var(--radius);padding:64px 56px;max-width:82%;margin:auto}
.cl-in .wm-tx{color:#fff}.cl-in .cl-mgr b{color:#fff}
.cl-brand{margin-bottom:34px}
.cl-h{font-family:var(--disp);font-size:calc(var(--s-h1)*.94);line-height:1.12;font-weight:600;letter-spacing:-.015em;max-width:20ch;color:inherit}
.cl-why{list-style:none;margin:30px 0;max-width:52ch}.cl-why li{padding:12px 0 12px 26px;border-bottom:1px solid rgba(255,255,255,.14);font-size:14.5px;line-height:1.5;position:relative;color:rgba(255,255,255,.9)}
.cl-why li::before{content:"";position:absolute;left:0;top:19px;width:12px;height:1px;background:var(--accent)}
.cl-contact{display:flex;align-items:center;gap:28px;flex-wrap:wrap;margin-top:36px}
.cl-mgr span{color:rgba(255,255,255,.68)}
.cl-btn{display:inline-flex;align-items:center;background:var(--accent);color:#fff;padding:15px 28px;border-radius:100px;font-weight:700;font-size:14px;text-decoration:none;letter-spacing:.01em}
@media(max-width:640px){.cl-in{max-width:none;padding:44px 30px}}
/* ---- print ---- */
@media print{
  body{background:#fff}
  .doc{max-width:none;padding:0}
  .page{box-shadow:none;margin:0;min-height:auto;page-break-after:always;break-after:page}
  .page:last-child{page-break-after:auto}
  @page{size:A4;margin:0}
}
.recompose-bar{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);display:flex;gap:8px;background:rgba(12,14,22,.9);backdrop-filter:blur(14px);padding:8px 10px 8px 16px;border-radius:100px;box-shadow:0 18px 50px -18px rgba(0,0,0,.6);z-index:50;align-items:center}
.recompose-bar span{color:#fff;font-size:12.5px;letter-spacing:.02em;font-family:${F.meta}}
.recompose-bar b{color:#fff;font-weight:600}
.recompose-bar button{border:0;background:#fff;color:#111;font:inherit;font-size:12.5px;font-weight:600;padding:9px 16px;border-radius:100px;cursor:pointer}
.recompose-bar a{color:rgba(255,255,255,.65);font-size:12.5px;text-decoration:none;padding:0 6px}
@media print{.recompose-bar{display:none}}
`;

  const canEdit = opts.canEdit;
  const bar = (canEdit && !isPrint) ? `<div class="recompose-bar"><span><b>${esc(dna.styleName)}</b> · ${dna.ax.density} · фото ${dna.ax.imageDom}</span><button id="recompose">Другой вариант</button><a href="/p/${c.id}?design=1&print=1" target="_blank">Печать / PDF</a></div>
<script>(function(){var b=document.getElementById('recompose');if(!b)return;b.onclick=function(){b.textContent='…';fetch('/api/collections/${c.id}/recompose?key=${esc(opts.key || '')}',{method:'POST'}).then(function(r){return r.json()}).then(function(){location.reload()}).catch(function(){location.reload()})}})();</script>` : '';

  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(c.title || 'Подборка')} — ${esc(AG)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Manrope:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${css}</style></head>
<body class="style-${dna.ax.style} dom-${dna.ax.imageDom} dens-${dna.ax.density} int-${dna.ax.artDir}${dna.dark ? ' dark' : ''}">
<div class="doc">${body}</div>${bar}
</body></html>`;
}

function plural(n) { n = +n; return n % 10 === 1 && n % 100 !== 11 ? 'проект' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'проекта' : 'проектов'; }

module.exports = { renderDesignDoc, deriveDNA, artDirect, AXES };
