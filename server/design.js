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
  style:     { label: 'Стиль',            def: 'auto', opts: [['auto', 'Авто'], ['editorial', 'Editorial Luxury'], ['premiumweb', 'Premium Web'], ['architectural', 'Architectural Minimal'], ['investment', 'Investment Intelligence'], ['cinematic', 'Cinematic'], ['darkluxury', 'Dark Luxury']] },
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

/* ============================================================================
   Ф2 · Image-intelligence (эвристика, БЕЗ vision-API — $0)
   Роль изображения выводим из имени файла/URL + позиции в массиве. Focal-point
   выбираем так, чтобы кроп cover НЕ срезал архитектурный фокус. Планы/карты —
   contain (никогда не cover-cropped).
   ========================================================================== */
function classifyImage(url, i) {
  const s = String(url || '').toLowerCase().split('?')[0].split('/').pop();
  let role, focal = '50% 45%', contain = false, plan = false;
  if (/(floor\s*-?plan|floorplan|\bplan\b|layout|master\s*-?plan|masterplan|site\s*-?plan|siteplan|genplan|\bmap\b|карт|планировк|генплан|схем)/.test(s)) {
    role = /(\bmap\b|site|master|genplan|генплан|карт|схем)/.test(s) ? 'map' : 'floorplan'; contain = true; plan = true; focal = 'center';
  } else if (/(aerial|drone|bird|skyline|overview|panorama|masterview)/.test(s)) { role = 'aerial'; focal = '50% 50%'; }
  else if (/(pool|amenity|amenit|gym|spa|lobby|reception|lounge|rooftop|garden|clubhouse|sauna|jacuzzi|бассейн)/.test(s)) { role = 'amenity'; focal = '50% 52%'; }
  else if (/(ext|exterior|facade|fasad|building|tower|arch|hero|villa|house|фасад|экстер)/.test(s)) { role = 'exterior'; focal = '50% 40%'; }
  else if (/(view|balcon|terrace|vista|sea|beach|skyview|вид)/.test(s)) { role = 'view'; focal = '50% 42%'; }
  else if (/(int|interior|living|bedroom|\bbed\b|bath|kitchen|dining|room|salon|интер|гостин|спальн|кухн)/.test(s)) { role = 'interior'; focal = '50% 52%'; }
  else if (/(lifestyle|people|couple|family|detail|life|lobby)/.test(s)) { role = 'lifestyle'; focal = '50% 45%'; }
  else { role = i === 0 ? 'exterior' : 'photo'; focal = i === 0 ? '50% 40%' : '50% 48%'; }
  return { url, role, focal, contain, plan, i };
}
function classifyImages(pr) { return (pr.images || []).filter(Boolean).map((u, i) => classifyImage(u, i)); }

/* курируем набор: hero (лучший экстерьер/аэро), gallery (микс ролей без дублей), планы отдельно */
function curateImages(pr) {
  const all = classifyImages(pr);
  const plans = all.filter(x => x.plan);
  const photos = all.filter(x => !x.plan);
  const rank = { aerial: 0, exterior: 1, view: 2, amenity: 3, lifestyle: 4, interior: 5, photo: 6 };
  const hero = photos.slice().sort((a, b) => (rank[a.role] - rank[b.role]) || (a.i - b.i))[0] || null;
  const exters = photos.filter(x => x.role === 'exterior' || x.role === 'aerial' || x.role === 'view');
  const inters = photos.filter(x => x.role === 'interior');
  const amens = photos.filter(x => x.role === 'amenity' || x.role === 'lifestyle');
  const gallery = [];
  const add = (x) => { if (x && !gallery.includes(x)) gallery.push(x); };
  add(hero);
  exters.filter(x => x !== hero).slice(0, 1).forEach(add);   /* ещё один вид/экстерьер */
  inters.slice(0, 3).forEach(add);                            /* 2-3 интерьера */
  amens.slice(0, 1).forEach(add);                             /* 1 удобство/лайфстайл */
  photos.forEach(x => { if (gallery.length < 5) add(x); });   /* добить до 5 из оставшихся */
  return { all, plans, photos, hero, gallery };
}

/* фаза платежа из ярлыка/процента — для честного cash-flow timeline */
function payPhase(label, pctNum) {
  const s = String(label || '').toLowerCase();
  if (/ключ|сдач|handover|получен|заселен|заверш|complet|final|остаток|balance/.test(s)) return 'handover';
  if (/перв|взнос|бронь|booking|down|депозит|deposit|старт|start|сейчас|now|при брон|при подписан|подписан/.test(s)) return 'now';
  if (/строит|строй|construction|during|период|ежемес|monthly|рассроч|installm|график|график/.test(s)) return 'build';
  if (pctNum != null && pctNum >= 90) return 'handover';   /* 100% полной оплаты трактуем как единый платёж */
  return 'build';
}
function isMonthlyDrip(pct, label) { return /мес|month|ежемес|monthly|\/\s*м\b|per\s*month|в\s*месяц/i.test(String(pct) + ' ' + String(label)); }

/* ---- палитры направлений (muted-premium; без SaaS-фиолета/блёсток) ---- */
const PALS = {
  editorial:     { paper: '#FAF7F1', ink: '#17130C', mut: '#8A7F6C', line: '#E9E1D2', accent: '#8A5A2B', accentSoft: '#F0E7D8', band: '#14110B', onBand: '#F3ECDD', tint: '#F3EDE1' },
  premiumweb:    { paper: '#FFFFFF', ink: '#0E1116', mut: '#68707E', line: '#E7EAEF', accent: '#28407E', accentSoft: '#EBEFF7', band: '#0C1220', onBand: '#EAEEF7', tint: '#F3F5F9' },
  architectural: { paper: '#FEFEFE', ink: '#14161A', mut: '#7C818A', line: '#E7E9EC', accent: '#22252B', accentSoft: '#EEF0F2', band: '#101216', onBand: '#EEF0F3', tint: '#F4F5F6' },
  investment:    { paper: '#F8F9FB', ink: '#0C1424', mut: '#5C6578', line: '#E1E6EF', accent: '#0F5C4A', accentSoft: '#E6F0EC', band: '#0B1322', onBand: '#E7EDF6', tint: '#EEF2F7' },
  cinematic:     { paper: '#F6F4F0', ink: '#141210', mut: '#877F72', line: '#E4DED2', accent: '#A9803E', accentSoft: '#EFE6D5', band: '#0B0B0D', onBand: '#F2ECDF', tint: '#EFE9DD' },
  /* Dark Luxury — тёмная система ПО УМОЛЧАНИЮ: глубокий charcoal-navy + шампань-золото */
  darkluxury:    { paper: '#12141C', ink: '#ECEAE2', mut: '#8C90A4', line: '#262B3A', accent: '#C7A667', accentSoft: '#1C2130', band: '#0A0B12', onBand: '#ECEAE2', tint: '#191E2A' },
};
const DARK = {
  editorial:     { paper: '#14110B', ink: '#F1EADB', mut: '#A79A82', line: '#2A241A', accent: '#C8944F', accentSoft: '#241D12', band: '#0C0A06', onBand: '#F1EADB', tint: '#1B160E' },
  premiumweb:    { paper: '#0C1220', ink: '#E9EEF8', mut: '#8B94A6', line: '#1E2740', accent: '#6E8FE0', accentSoft: '#141C30', band: '#070B14', onBand: '#E9EEF8', tint: '#131B2C' },
  architectural: { paper: '#111318', ink: '#ECEEF2', mut: '#8A8F99', line: '#232732', accent: '#C7CCD4', accentSoft: '#1A1E26', band: '#0A0B0E', onBand: '#ECEEF2', tint: '#181B22' },
  investment:    { paper: '#0B1322', ink: '#E7EDF6', mut: '#8791A3', line: '#1D2740', accent: '#3BC79A', accentSoft: '#0F1C2C', band: '#060C16', onBand: '#E7EDF6', tint: '#111B2C' },
  cinematic:     { paper: '#0C0C0F', ink: '#F1ECE1', mut: '#9A9182', line: '#241F18', accent: '#C9A15B', accentSoft: '#1C160D', band: '#050506', onBand: '#F1ECE1', tint: '#161310' },
  darkluxury:    { paper: '#12141C', ink: '#ECEAE2', mut: '#8C90A4', line: '#262B3A', accent: '#C7A667', accentSoft: '#1C2130', band: '#0A0B12', onBand: '#ECEAE2', tint: '#191E2A' },
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
  darkluxury:    { disp: "'Fraunces',Georgia,serif", meta: "'Manrope',system-ui,sans-serif", opsz: 1 },
};

const STYLE_NAMES = { editorial: 'Editorial Luxury', premiumweb: 'Premium Web', architectural: 'Architectural Minimal', investment: 'Investment Intelligence', cinematic: 'Cinematic', darkluxury: 'Dark Luxury' };

/* ---------- контекст документа: что за данные у нас на руках ---------- */
function docContext(db, c, props) {
  const imgs = props.map(p => (p.images || []).filter(Boolean).length);
  const avgImg = imgs.length ? imgs.reduce((a, b) => a + b, 0) / imgs.length : 0;
  const dataScore = props.reduce((s, p) => s + ((p.units || []).length >= 2 ? 1 : 0) + (p.roi ? 1 : 0) + (p.appreciation ? 1 : 0) + ((p.paymentRows || []).length >= 2 ? 1 : 0), 0) / Math.max(1, props.length);
  const hasTimes = props.some(p => p.district && (p.district.times || []).length);
  /* сигнал «премиум/брендированное» — для Auto-выбора Dark Luxury (только из текста данных) */
  const brandedRe = /(бренд|branded|кондо\s*-?\s*отел|residenc|резиденц|signature|penthouse|пентхаус|luxury|люкс|beachfront|waterfront|private\s*resid)/i;
  const brandBag = (String(c.title || '') + ' ' + props.map(p => [p.name, p.developer, p.type, p.hookTitle, (p.district || {}).blurb, p.description].filter(Boolean).join(' ')).join(' '));
  const brandedSignal = brandedRe.test(brandBag);
  const prices = props.map(p => p.priceFrom).filter(n => n > 0);
  const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
  return { avgImg, maxImg: Math.max(0, ...imgs), dataScore, hasTimes, nProj: props.length, brandedSignal, avgPrice };
}

/* ---------- разрешение осей (auto → конкретика по контексту) ---------- */
function resolveAxes(ax, ctx, r) {
  const a = Object.assign({}, ax);
  if (!a.style || a.style === 'auto') {
    if (ctx.dataScore >= 2.2 && ctx.avgImg < 3) a.style = 'investment';
    else if (ctx.brandedSignal && ctx.avgImg >= 3 && (ctx.avgPrice >= 300000 || ctx.dataScore < 1.6)) a.style = 'darkluxury'; /* высокобюджетные брендированные резиденции */
    else if (ctx.avgImg >= 4) a.style = 'cinematic';
    else a.style = 'editorial';
  }
  if (!PALS[a.style]) a.style = 'editorial';
  /* Cinematic — жанр «фото главенствует»: крупная доминанта + выразительность */
  if (a.style === 'cinematic') {
    if (!a.imageDom || a.imageDom === 'auto') a.imageDom = 'high';
    if (!a.artDir || a.artDir === 'auto') a.artDir = 'expressive';
  }
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
  const dark = ax.brandMode === 'dark' || ax.style === 'darkluxury';
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

/* ============================================================================
   Ф3 · Variation-engine + Quality-Control + Regenerate/Lock (детерминированно, $0)
   ─ Профиль проекта (сколько фото/данных) → допустимые грамматики (imageFit/dataFit).
   ─ QC-скоры 0..1 (hierarchy/balance/density/repetition/imageFit/dataFit) → авто-ремонт
     свапом грамматики (≤3 итер), если страница проваливает порог.
   ─ История макетов: не 3× подряд одна композиция; соседние проекты по-разному;
     на смене seed — другой микс архетипов, а на reseed — другая обложка (в endpoint).
   ========================================================================== */
const round2 = (n) => Math.round(n * 100) / 100;
const pickSeed = (arr, seed) => arr[Math.floor(rng(seed >>> 0)() * arr.length) % arr.length];

/* сколько модулей-метрик реально выведет metricRail (зеркало логики рендера) */
function metricCount(pr, dna) {
  let n = 0;
  if (pr.priceFrom) n++;
  if (pr.handover) n++;
  if (pr.roi && dna.dataDepth !== 'minimal') n++;
  if (pr.appreciation && dna.dataDepth === 'dashboard') n++;
  return n;
}

/* профиль контента проекта — вход для fit/density/hierarchy */
function projProfile(db, c, pr, dna) {
  const cur = curateImages(pr);
  const co = projCopy(c, pr.id, pr);
  const payRows = (pr.paymentRows || []).filter(r => r && (r.pct || r.label)).length;
  const rich = (pr.units || []).length >= 3 || ((pr.roi ? 1 : 0) + (pr.appreciation ? 1 : 0) + (payRows >= 2 ? 1 : 0) >= 2);
  return {
    cur, heroOk: !!cur.hero, nPhotos: cur.photos.length, nGallery: cur.gallery.length, nPlans: cur.plans.length,
    metrics: metricCount(pr, dna), payRows, nUnits: (pr.units || []).length,
    nTimes: ((pr.district || {}).times || []).filter(t => t && t.place).length,
    hasLoc: !!(pr.district && pr.district.name), nAmen: (pr.amenities || []).filter(Boolean).length,
    hasBlurb: !!(co.blurb && String(co.blurb).trim()), nWhy: (co.why || []).length, rich,
  };
}

const ALL_GRAMMARS = ['singleHero', 'galleryCurated', 'bento', 'metricEditorial', 'sidebarRail', 'figureGround', 'dataLed'];

/* грамматики, проходящие жёсткие гейты (хватает ли фото/данных) */
function validGrammars(prof, dna) {
  const out = [];
  if (prof.heroOk) { out.push('singleHero'); out.push('bento'); }
  if (prof.nGallery >= 3 && dna.imageDom !== 'low') out.push('galleryCurated');
  if (prof.heroOk && (prof.rich || prof.metrics >= 2 || prof.payRows >= 2) && dna.dataDepth !== 'minimal') out.push('metricEditorial');
  /* новые композиции (Ф1+) — каждая со своим гейтом доступности контента */
  if (prof.heroOk && (prof.metrics >= 2 || prof.payRows >= 2 || prof.rich || prof.hasBlurb)) out.push('sidebarRail');
  if (prof.heroOk) out.push('figureGround');
  if ((prof.rich || prof.metrics >= 2 || prof.payRows >= 2) && dna.dataDepth !== 'minimal') out.push('dataLed');
  return out.length ? out : ['singleHero'];
}

/* fit-скоры грамматики под профиль (0..1) */
function grammarFit(g, prof, dna) {
  let imageFit, dataFit, hierarchy = 1, balance = 1;
  if (g === 'galleryCurated') {
    imageFit = prof.nGallery >= 5 ? 1 : prof.nGallery === 4 ? 0.85 : prof.nGallery >= 3 ? 0.7 : 0.3;
    dataFit = 0.85; hierarchy = prof.nGallery >= 2 ? 1 : 0.6;
    balance = (prof.hasBlurb || prof.hasLoc) && (prof.metrics || prof.payRows) ? 1 : 0.7;
  } else if (g === 'singleHero') {
    imageFit = prof.heroOk ? (prof.nPhotos >= 4 ? 0.7 : 1) : 0.2;
    dataFit = 0.8; hierarchy = prof.heroOk ? 1 : 0.4;
    balance = (prof.metrics || prof.hasLoc || prof.payRows || prof.hasBlurb) ? 1 : 0.5;
  } else if (g === 'bento') {
    imageFit = prof.nPhotos >= 2 ? 1 : prof.nPhotos === 1 ? 0.6 : 0.2;
    dataFit = prof.metrics >= 2 ? 1 : 0.6; hierarchy = (prof.heroOk || prof.metrics >= 2) ? 1 : 0.5;
    balance = (prof.hasLoc || prof.hasBlurb) ? 1 : 0.55;
  } else if (g === 'sidebarRail') {
    /* фото-доминанта справа + вертикальная рельса метрик/цены слева */
    imageFit = prof.heroOk ? 1 : 0.3;
    dataFit = (prof.metrics >= 2 || prof.payRows >= 2 || prof.rich) ? 1 : 0.55;
    hierarchy = prof.heroOk ? 1 : 0.5;
    balance = ((prof.hasBlurb || prof.hasLoc) && (prof.metrics || prof.payRows)) ? 1 : 0.65;
  } else if (g === 'figureGround') {
    /* одна доминантная фотография + плавающая карточка-идентити в углу */
    imageFit = prof.heroOk ? 1 : 0.2;
    dataFit = (prof.metrics >= 1 || prof.hasBlurb) ? 0.75 : 0.5;
    hierarchy = prof.heroOk ? 1 : 0.4;
    balance = (prof.hasBlurb || prof.metrics || prof.hasLoc) ? 1 : 0.55;
  } else if (g === 'dataLed') {
    /* цифры/оплата/доходность главенствуют, фото — поддержка (для data-rich, image-poor) */
    imageFit = prof.heroOk ? 0.8 : 0.6;
    dataFit = (prof.rich || prof.metrics >= 2 || prof.payRows >= 2) ? 1 : 0.3;
    hierarchy = (prof.metrics >= 2 || prof.payRows >= 2) ? 1 : 0.55;
    balance = (prof.hasBlurb || prof.hasLoc || prof.nUnits) ? 1 : 0.5;
  } else { /* metricEditorial */
    imageFit = prof.heroOk ? 0.9 : 0.4;
    dataFit = (prof.rich || prof.metrics >= 2 || prof.payRows >= 2) ? 1 : 0.25;
    hierarchy = (prof.metrics >= 2 || prof.hasBlurb) ? 1 : 0.6;
    balance = (prof.hasBlurb || prof.hasLoc || prof.nAmen) ? 1 : 0.45;
  }
  return { imageFit, dataFit, hierarchy, balance };
}

/* density: контентная «начинка» проекта против ёмкости грамматики (пусто ↔ переполнено) */
function grammarDensity(g, prof, dna) {
  const R = Math.min(prof.nGallery, 5) + prof.metrics + (prof.payRows >= 2 ? 2 : prof.payRows)
    + (dna.dataDepth === 'dashboard' ? Math.min(prof.nUnits, 4) : 0) + prof.nTimes
    + (prof.nAmen > 0 ? 1 : 0) + (prof.hasBlurb ? 1 : 0) + Math.min(prof.nWhy, 3);
  const cap = g === 'galleryCurated' ? 11 : g === 'dataLed' ? 9 : g === 'metricEditorial' ? 8 : g === 'sidebarRail' ? 8 : g === 'figureGround' ? 6 : 7;
  let density = 1;
  if (R < cap * 0.40) density = Math.max(0.2, R / (cap * 0.40));            /* слишком пусто */
  else if (R > cap * 1.75) density = Math.max(0.35, 1 - (R - cap * 1.75) / cap); /* переполнено */
  return { density, R, cap };
}

/* комбинированный fit для взвешенного выбора и ремонта */
function grammarCombined(g, prof, dna) {
  const f = grammarFit(g, prof, dna), d = grammarDensity(g, prof, dna);
  return (f.imageFit * 1.3 + f.dataFit + f.hierarchy + f.balance + d.density) / 5.3;
}

/* штраф за повтор относительно ранее выбранных грамматик */
function repFor(v, used) {
  const n = used.length;
  if (n >= 2 && used[n - 1] === v && used[n - 2] === v) return 0.3;
  if (n >= 1 && used[n - 1] === v) return 0.7;
  if (n >= 2 && used[n - 2] === v) return 0.85;
  return 1;
}

/* QC-скоры страницы проекта (0..1) + min/avg */
function qcScore(g, prof, dna, repetition) {
  const f = grammarFit(g, prof, dna), d = grammarDensity(g, prof, dna);
  const s = {
    hierarchy: round2(f.hierarchy), balance: round2(f.balance), density: round2(d.density),
    repetition: round2(repetition), imageFit: round2(f.imageFit), dataFit: round2(f.dataFit),
  };
  const vals = [s.hierarchy, s.balance, s.density, s.repetition, s.imageFit, s.dataFit];
  s.min = round2(Math.min(...vals));
  s.avg = round2(vals.reduce((a, b) => a + b, 0) / vals.length);
  return s;
}

/* лучшая альтернативная грамматика (для авто-ремонта): fit + анти-повтор */
function bestAlt(cur, used, prof, dna) {
  const valid = validGrammars(prof, dna).filter(g => g !== cur);
  if (!valid.length) return null;
  return valid.map(g => ({ g, s: grammarCombined(g, prof, dna) * 0.7 + repFor(g, used) * 0.3 }))
    .sort((a, b) => b.s - a.s)[0].g;
}

/* сид-взвешенный выбор грамматики: по fit, но с реальной вариацией от seed */
function pickProjGrammar(prof, dna, gseed) {
  const valid = validGrammars(prof, dna);
  if (valid.length === 1) return valid[0];
  const weights = valid.map(g => Math.pow(Math.max(0.05, grammarCombined(g, prof, dna)), 3));
  const tot = weights.reduce((a, b) => a + b, 0);
  const r = rng(gseed >>> 0);
  let x = r() * tot;
  for (let i = 0; i < valid.length; i++) { x -= weights[i]; if (x <= 0) return valid[i]; }
  return valid[valid.length - 1];
}

/* анти-повтор: 3× подряд запрещено (жёстко), соседние по-разному (мягко) */
function enforceVariation(v, used, prof, dna, seed) {
  const n = used.length;
  const valid = validGrammars(prof, dna).filter(g => g !== v);
  if (n >= 2 && used[n - 1] === v && used[n - 2] === v) {              /* жёстко: не 3× подряд */
    if (valid.length) return bestAlt(v, used, prof, dna) || pickSeed(valid, seed ^ 0x51ED);
  } else if (n >= 1 && used[n - 1] === v && valid.length) {            /* мягко: соседние различать */
    const alt = bestAlt(v, used, prof, dna);
    if (alt && grammarCombined(alt, prof, dna) >= 0.55) return alt;
  }
  return v;
}

const QC_MIN = 0.5, QC_AVG = 0.6;   /* пороги провала страницы */

/* выбор + вариация + авто-ремонт грамматики одного проекта */
function decideGrammar(pr, prof, dna, used, seed, pseed, lock) {
  /* Lock: держим зафиксированную грамматику, ремонт не трогает */
  if (lock && ALL_GRAMMARS.includes(lock)) {
    return { v: lock, qc: qcScore(lock, prof, dna, repFor(lock, used)), locked: true, repaired: 0 };
  }
  const gseed = (seed ^ hashStr(pr.id) ^ Math.imul(pseed >>> 0, 0x85EBCA6B)) >>> 0;
  let v = pickProjGrammar(prof, dna, gseed);
  v = enforceVariation(v, used, prof, dna, gseed);
  let qc = qcScore(v, prof, dna, repFor(v, used));
  let repaired = 0;
  while ((qc.min < QC_MIN || qc.avg < QC_AVG) && repaired < 3) {       /* авто-ремонт свапом */
    const alt = bestAlt(v, used, prof, dna);
    if (!alt || alt === v) break;
    const altQc = qcScore(alt, prof, dna, repFor(alt, used));
    if (altQc.avg <= qc.avg && altQc.min <= qc.min) break;             /* не лучше — стоп */
    v = alt; qc = altQc; repaired++;
  }
  return { v, qc, locked: false, repaired };
}

/* лёгкий QC для не-проектных страниц (для лога/дебага, без ремонта) */
function qcFlat(o) {
  const vals = ['hierarchy', 'balance', 'density', 'repetition', 'imageFit', 'dataFit'].map(k => round2(o[k] != null ? o[k] : 0.9));
  return { hierarchy: vals[0], balance: vals[1], density: vals[2], repetition: vals[3], imageFit: vals[4], dataFit: vals[5], min: round2(Math.min(...vals)), avg: round2(vals.reduce((a, b) => a + b, 0) / 6) };
}

/* сигнатура плана — для «genuinely different» на reseed */
function planSig(plan) { return plan.map(pg => (pg.role[0] + pg.role.slice(-1)) + ':' + pg.v).join('|'); }

/* ---------- AUTO Art-Director → page_plan ----------
   Роли: COVER · CLIENT_CRITERIA? · PROJECT_OVERVIEW×N · COMPARISON? · RECOMMENDATION · CLOSING
   Композиция объекта выбирается по доступным ассетам/данным; не повторяется >2× подряд;
   locks/pseed из c.design учитываются (Ф3). */
function artDirect(db, c, props, dna, lead, seed) {
  const r = rng(seed ^ 0x9E3779B9);
  const d = c.design || {};
  const locks = d.locks || {};
  const pseeds = d.pseed || {};
  const plan = [];

  /* COVER — если нет ни одного hero-фото, обложка с фото невозможна → 'type' */
  const heroExists = props.some(p => curateImages(p).hero);
  /* пул обложек: indexCard (содержание) не требует фото; splitVertical/band/plate/editorial требуют hero */
  let coverPool = dna.intensity === 'minimal' ? ['type', 'plate', 'indexCard'] : ['plate', 'editorial', 'band', 'splitVertical', 'indexCard'];
  if (props.length < 2) coverPool = coverPool.filter(v => v !== 'indexCard');   /* «содержание» осмысленно от 2 проектов */
  let coverV = pick(r, coverPool);
  if (!heroExists && ['band', 'plate', 'editorial', 'splitVertical'].includes(coverV)) coverV = 'type';
  plan.push({ role: 'COVER', v: coverV, qc: qcFlat({ imageFit: (heroExists || coverV === 'type' || coverV === 'indexCard') ? 1 : 0.4, density: 0.9, balance: 0.95 }) });

  const q = (lead && lead.quals) || {};
  const hasCriteria = lead && (q.budget || q.purpose || q.timeline || q.type || lead.geo);
  if (hasCriteria) plan.push({ role: 'CLIENT_CRITERIA', v: dna.ax.style === 'investment' ? 'ledger' : 'brief', qc: qcFlat({ imageFit: 0.9, dataFit: 0.9 }) });

  /* Ф4 · разделители-открывашки между проектами дают ритм. Нужен hero; в лёгких/минимальных
     макетах убираем ради плотности. Первый проект получает открывашку только если его hero
     отличается от обложки (иначе — типографический вариант), чтобы не дублировать кадр. */
  const coverHero = (() => { const hp = props.find(p => curateImages(p).hero); return hp ? (curateImages(hp).hero || {}).url : null; })();
  const wantOpeners = dna.intensity !== 'minimal' && dna.density !== 'light' && props.length >= 1;
  const openerUsed = [];
  const chooseOpener = (pr, idx, heroUrl) => {
    const oseed = (seed ^ hashStr('op|' + pr.id) ^ Math.imul(idx + 1, 0x27D4EB2F)) >>> 0;
    const rr = rng(oseed);
    let pool;
    if (dna.ax.style === 'cinematic' || dna.imageDom === 'high') pool = ['fullbleed', 'fullbleed', 'split', 'plate'];
    else if (dna.ax.style === 'investment' || dna.imageDom === 'low') pool = ['split', 'type', 'plate'];
    else pool = ['fullbleed', 'split', 'type', 'plate'];
    if (!heroUrl) pool = ['type'];
    if (idx === 0 && heroUrl && heroUrl === coverHero) pool = ['type', 'split']; /* не повторять кадр обложки */
    let v = pick(rr, pool);
    const n = openerUsed.length;                                   /* анти-повтор: не 3× подряд один вид */
    if (n >= 2 && openerUsed[n - 1] === v && openerUsed[n - 2] === v) { const alt = pool.filter(x => x !== v); if (alt.length) v = pick(rng(oseed ^ 0x9E37), alt); }
    return v;
  };

  const used = [];
  props.forEach((pr, i) => {
    const prof = projProfile(db, c, pr, dna);
    if (wantOpeners && prof.heroOk) {
      const heroUrl = (prof.cur.hero || {}).url || null;
      const ov = chooseOpener(pr, i, heroUrl);
      openerUsed.push(ov);
      plan.push({ role: 'PROJECT_OPENER', v: ov, pid: pr.id, idx: i, qc: qcFlat({ imageFit: heroUrl && ov !== 'type' ? 1 : 0.8, density: 0.85, balance: 0.9 }) });
    }
    const dec = decideGrammar(pr, prof, dna, used, seed, pseeds[pr.id] || 0, locks[pr.id]);
    used.push(dec.v);
    plan.push({ role: 'PROJECT_OVERVIEW', v: dec.v, pid: pr.id, idx: i, locked: dec.locked, repaired: dec.repaired, qc: dec.qc });
  });

  if (props.length >= 2) {
    const shareMetrics = props.filter(p => p.roi || p.priceFrom).length >= 2;
    const priceable = props.filter(p => p.priceFrom > 0).length >= 2;
    let cmpPool;
    if (dna.dataDepth === 'editorial') cmpPool = ['cards', 'ranked'];
    else if (shareMetrics) cmpPool = ['matrix', 'scoreboard', 'ranked'];
    else cmpPool = ['cards', 'ranked'];
    if (priceable && props.length <= 4) cmpPool.push('barsRow');   /* горизонтальные мини-полосы — не слишком широко */
    const cmpV = pick(r, cmpPool);
    plan.push({ role: 'COMPARISON', v: cmpV, qc: qcFlat({ dataFit: shareMetrics ? 1 : 0.7, density: 0.9 }) });
  }
  let recPool;
  if (dna.ax.style === 'investment') recPool = ['thesis', 'pickCard', 'sidebarNote'];
  else if (dna.ax.style === 'editorial' || dna.ax.style === 'cinematic' || dna.ax.style === 'darkluxury') recPool = ['editorNote', 'sidebarNote', 'pickCard'];
  else recPool = ['editorNote', 'marginNote', 'thesis', 'sidebarNote', 'pickCard'];
  if (props.length < 2) recPool = recPool.filter(v => v !== 'pickCard');   /* «мой выбор» осмысленен от 2 проектов */
  const recV = pick(r, recPool);
  plan.push({ role: 'RECOMMENDATION', v: recV, qc: qcFlat({ density: 0.85 }) });

  /* Ф4 · завершающая дуга: процесс → агент → агентство → тихая задняя обложка.
     Каждую страницу выкидываем, если под неё нет честных данных (никаких выдуманных цифр). */
  const S = db.settings || {};
  const agency = S.agency || {};
  const about = agency.about || {};
  const mgr = agency.manager || {};
  const broker = lead && lead.broker ? (db.brokers || []).find(b => b.id === lead.broker) : null;
  const mgrReal = mgr.name && !/^ваш менеджер$/i.test(String(mgr.name).trim()) && (mgr.phone || mgr.email);
  const agent = broker || (mgrReal ? { name: mgr.name, title: mgr.title || '', phone: mgr.phone, email: mgr.email, bio: '' } : null);

  plan.push({ role: 'NEXT_STEPS', v: dna.dataDepth === 'editorial' ? 'stack' : pick(r, ['row', 'stack']), qc: qcFlat({ density: 0.85, balance: 0.95 }) });
  if (agent) plan.push({ role: 'AGENT_PROFILE', v: agent.photo ? (dna.ax.style === 'investment' ? 'split' : 'editorial') : 'minimal', qc: qcFlat({ imageFit: agent.photo ? 1 : 0.85, density: 0.8, balance: 0.9 }) });
  const proofBullets = (about.bullets || []).filter(Boolean);
  const proofStatement = about.intro || (about.whyUs || [])[0] || '';
  const hasProof = proofBullets.length || (about.whyUs || []).length || proofStatement;
  if (hasProof) plan.push({ role: 'AGENCY_PROOF', v: proofBullets.filter(b => /^\s*\d/.test(b)).length >= 2 ? 'stats' : 'statement', qc: qcFlat({ dataFit: 0.85, density: 0.85 }) });
  plan.push({ role: 'BACK_COVER', v: dna.dark ? 'band' : pick(r, ['plate', 'band']), qc: qcFlat({ density: 0.9, balance: 0.95 }) });
  return plan;
}

/* ---------- Ф3 · Regenerate / Lock одного блока (проекта) ---------- */
function blockOp(db, c, proj, action) {
  c.design = c.design || {};
  const d = c.design;
  d.locks = d.locks || {};
  d.pseed = d.pseed || {};
  const props = (c.propertyIds || []).map(pid => db.properties.find(x => x.id === pid)).filter(Boolean);
  if (!props.some(p => p.id === proj)) return { error: 'no such project in collection' };
  const lead = c.leadId ? (db.leads || []).find(l => l.id === c.leadId) : null;
  const seed = (d.seed || hashStr(c.id)) >>> 0;
  const grammarOf = () => {
    const dna = deriveDNA(db, c, props, d, seed);
    const plan = artDirect(db, c, props, dna, lead, seed);
    const pg = plan.find(x => x.role === 'PROJECT_OVERVIEW' && x.pid === proj);
    return pg ? pg.v : null;
  };
  if (action === 'lock') {
    d.locks[proj] = grammarOf() || 'bento';
    return { ok: true, action: 'lock', proj, grammar: d.locks[proj] };
  }
  if (action === 'unlock') {
    delete d.locks[proj];
    return { ok: true, action: 'unlock', proj };
  }
  if (action === 'regen') {
    delete d.locks[proj];                         /* реген подразумевает свободу менять */
    const before = grammarOf();
    let after = before, changed = false;
    for (let k = 1; k <= 40; k++) {               /* ищем pseed, дающий другую итоговую грамматику */
      d.pseed[proj] = Math.imul(hashStr(c.id + '|' + proj + '|' + k + '|' + Date.now()), 2654435761) >>> 0;
      const g = grammarOf();
      if (g && g !== before) { after = g; changed = true; break; }
    }
    if (!changed) d.pseed[proj] = Math.imul((Date.now() >>> 0) ^ hashStr(proj), 2654435761) >>> 0;
    return { ok: true, action: 'regen', proj, before, after, changed };
  }
  return { error: 'bad action' };
}

/* ================= РЕНДЕР ================= */
function renderDesignDoc(db, c, opts) {
  opts = opts || {};
  const S = db.settings || {};
  const agency = S.agency || {};
  const AG = (S.agency && S.agency.name) || 'Lumen';
  const mgr = (S.agency && S.agency.manager) || {};
  const about = (S.agency && S.agency.about) || {};
  const logo = S.agency && S.agency.logo;
  const geoNames = S.geoNames || {};
  const prById = (pid) => db.properties.find(x => x.id === pid);
  const props = (c.propertyIds || []).map(prById).filter(Boolean);
  const lead = c.leadId ? db.leads.find(l => l.id === c.leadId) : null;
  /* Ф4 · агент, подготовивший подборку: назначенный брокер лида → иначе реальный менеджер агентства.
     Плейсхолдер «Ваш менеджер» с пустыми контактами агентом НЕ считаем. */
  const broker = lead && lead.broker ? (db.brokers || []).find(b => b.id === lead.broker) : null;
  const mgrReal = mgr.name && !/^ваш менеджер$/i.test(String(mgr.name).trim()) && (mgr.phone || mgr.email);
  const agent = broker || (mgrReal ? { name: mgr.name, title: mgr.title || '', phone: mgr.phone, email: mgr.email, bio: '', geo: '', langs: [] } : null);
  /* «подписант» для рекомендаций/CTA: агент, иначе слабый менеджер (совместимость) */
  const signer = agent || { name: mgr.name || AG, title: mgr.title || 'ваш менеджер', phone: mgr.phone || '', email: mgr.email || '' };

  const seed = (opts.seed != null ? (+opts.seed >>> 0) : ((c.design && c.design.seed) || hashStr(c.id))) >>> 0;
  /* превью-оверрайды осей из query (?style=…&brand=…) — НЕ пишутся в базу, только рендер */
  const axIn = Object.assign({}, c.design || {});
  if (opts.style && AXES.style.opts.some(o => o[0] === opts.style)) axIn.style = opts.style;
  if (opts.brand && AXES.brandMode.opts.some(o => o[0] === opts.brand)) axIn.brandMode = opts.brand;
  const dna = deriveDNA(db, c, props, axIn, seed);
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
    /* Ф2 · метрика-библиотека: НИ ОДНОЙ пустой плашки — поле без данных не выводим */
    const items = [];
    if (pr.priceFrom) items.push({ k: 'Цена', v: 'от ' + money(pr.priceFrom, pr), sub: pr.type || '' });
    if (pr.handover) items.push({ k: 'Сдача', v: esc(pr.handover), sub: pr.market === 'offplan' ? 'off-plan' : 'готовый' });
    if (pr.roi && dna.dataDepth !== 'minimal') items.push({ k: 'Доходность', v: esc(pr.roi), sub: 'данные застройщика', src: 1 });
    if (pr.appreciation && dna.dataDepth === 'dashboard') items.push({ k: 'Прирост', v: esc(pr.appreciation), sub: 'к сдаче', src: 1 });
    if (!items.length) return '';
    if (variant === 'stack') return `<div class="mrail stack">${items.map(m => `<div class="mr"><span class="mr-k">${m.k}</span><b class="mr-v">${m.v}</b>${m.sub ? `<span class="mr-s ${m.src ? 'src' : ''}">${m.sub}</span>` : ''}</div>`).join('')}</div>`;
    if (variant === 'big') return `<div class="mrail big">${items.map((m, i) => `<div class="mr ${i === 0 ? 'lead' : ''}"><b class="mr-v">${m.v}</b><span class="mr-k">${m.k}</span></div>`).join('')}</div>`;
    return `<div class="mrail row">${items.map(m => `<div class="mr"><span class="mr-k">${m.k}</span><b class="mr-v">${m.v}</b>${m.sub ? `<span class="mr-s ${m.src ? 'src' : ''}">${m.sub}</span>` : ''}</div>`).join('')}</div>`;
  }

  /* Ф2 · план оплаты → РЕАЛЬНЫЙ cash-flow: фаза (старт/стройка/ключи) + % + ярлык,
     накопительная полоса пропорций и tick-паттерн для ежемесячной рассрочки. Не 3 числа. */
  const PHLB = { now: 'Старт', build: 'Строительство', handover: 'Ключи' };
  /* векторная полоса структуры платежей — <rect> с CSS-fill (чёткая в печати, масштабируемая) */
  function svgBar(rows, total) {
    const W = 1000, H = 18; let x = 0; const parts = [];
    rows.forEach((r, i) => {
      const w = (r.pctNum || 0) / total * W; if (w <= 0) return;
      const gap = i < rows.length - 1 ? 2.5 : 0;                 /* тонкий зазор между фазами */
      parts.push(`<rect class="pt-svgseg ph-${r.phase}" x="${x.toFixed(2)}" y="0" width="${Math.max(0, w - gap).toFixed(2)}" height="${H}" shape-rendering="crispEdges"><title>${esc(r.pct)} · ${esc(r.label)}</title></rect>`);
      if (r.drip) parts.push(`<rect x="${x.toFixed(2)}" y="0" width="${Math.max(0, w - gap).toFixed(2)}" height="${H}" fill="url(#ptDrip)"></rect>`);
      x += w;
    });
    return `<svg class="pt-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="структура платежей по фазам"><defs><pattern id="ptDrip" width="12" height="${H}" patternUnits="userSpaceOnUse"><rect width="3.5" height="${H}" fill="rgba(255,255,255,.5)"></rect></pattern></defs>${parts.join('')}</svg>`;
  }
  function payTrack(pr) {
    const raw = (pr.paymentRows || []).filter(r => r && (r.pct || r.label));
    if (!raw.length) return '';
    const label = pr.market === 'offplan' ? 'План рассрочки' : 'Оплата';
    const rows = raw.map(r => { const pctNum = numOf(r.pct); return { pct: r.pct || '', pctNum, label: r.label || '', phase: payPhase(r.label, pctNum), drip: isMonthlyDrip(r.pct, r.label) }; });
    /* единый платёж (готовый / ипотека) — честная компактная плашка, не пустота */
    if (rows.length < 2) {
      const r = rows[0];
      return `<div class="pay pay-one">${kicker(label)}<div class="po-one"><b class="po-one-p">${esc(r.pct || '100%')}</b><span class="po-one-l">${esc(r.label || 'Полная оплата')}</span></div></div>`;
    }
    const total = rows.reduce((s, r) => s + (r.pctNum || 0), 0) || 100;
    /* Ф4 · накопительная полоса cash-flow как ВЕКТОРНЫЙ SVG (в PDF печатается чётко, не растр) */
    const bar = svgBar(rows, total);
    const phasesShown = [...new Set(rows.map(r => r.phase))];
    const legend = `<div class="pt-leg">${phasesShown.map(ph => `<span class="pt-lg"><i class="ph-${ph}"></i>${PHLB[ph]}</span>`).join('')}</div>`;
    return `<div class="pay">${kicker(label)}
      <div class="pt-track"><div class="pt-line"></div>${rows.map((r, i) => `<div class="pt-node ph-${r.phase}${r.drip ? ' drip' : ''}" style="--i:${i}"><span class="pt-dot"></span><b class="pt-pct">${esc(r.pct)}</b><span class="pt-lb">${esc(r.label)}</span><span class="pt-ph">${PHLB[r.phase]}</span></div>`).join('')}</div>
      ${bar}${legend}</div>`;
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

  /* Ф2 · focal-aware изображение. img — классифицированный объект {url,focal,contain,role}
     или голый URL (фолбэк). Планы/карты → contain (не срезаем), фото → object-position по focal. */
  function imgEl(img, cls, label) {
    const o = (img && typeof img === 'object') ? img : { url: img, focal: '50% 45%', contain: false, role: '' };
    if (!o.url) return `<div class="ph grad ${cls || ''}"><span>${esc(label || '')}</span></div>`;
    if (o.contain) return `<div class="ph plan ${cls || ''}" data-role="${esc(o.role || '')}" style="background-image:url('${esc(abs(o.url))}');background-size:contain;background-repeat:no-repeat;background-position:center;background-color:var(--tint)"></div>`;
    return `<div class="ph ${cls || ''}" data-role="${esc(o.role || '')}" style="background-image:url('${esc(abs(o.url))}');background-position:${esc(o.focal || '50% 45%')}"></div>`;
  }
  const imgCell = imgEl;   /* совместимость с прежними вызовами (голый URL допустим) */

  /* Ф2 · выделенный модуль планировок/карт — contained, с подписью; НИКОГДА не в фото-галерее */
  function floorPlan(plans) {
    const ps = (plans || []).slice(0, 3);
    if (!ps.length) return '';
    const cap = (pl) => pl.role === 'map' ? 'Расположение / генплан' : 'Планировка';
    return `<div class="fplan">${kicker(ps.length > 1 ? 'Планировки и генплан' : (ps[0].role === 'map' ? 'Расположение' : 'Планировка'))}
      <div class="fp-grid fp-${ps.length}">${ps.map(pl => `<figure class="fp-cell">${imgEl(pl, 'fp-img')}<figcaption class="fp-cap">${esc(cap(pl))}</figcaption></figure>`).join('')}</div>
      <p class="fp-note">Планировки и генплан — материалы застройщика, размеры ориентировочные.</p></div>`;
  }

  /* ---------- грамматики страниц ---------- */
  let pageNo = 0;
  const foot = (extra) => `<div class="pg-foot"><span class="pf-wm">${esc(AG)}</span><span class="pf-no">${num2(++pageNo)}</span>${extra ? `<span class="pf-x">${extra}</span>` : ''}</div>`;
  /* Ф3 · пер-проектные контролы 🔒/↻ — ТОЛЬКО при edit-key и не в печати/шаре без ключа */
  const projCtl = (pg) => {
    if (!opts.canEdit || isPrint) return '';
    const locked = pg.locked;
    return `<div class="blk-ctl" data-proj="${esc(pg.pid)}">`
      + `<button class="bc-btn${locked ? ' on' : ''}" data-bact="${locked ? 'unlock' : 'lock'}" title="${locked ? 'Снять фиксацию макета проекта' : 'Зафиксировать макет проекта'}">${locked ? '🔒' : '🔓'}</button>`
      + `<button class="bc-btn" data-bact="regen" title="Другой макет этого проекта">↻</button></div>`;
  };

  const G = {
    COVER(pg) {
      const title = c.title || 'Персональная подборка';
      /* Ф2 · обложка тоже берёт КУРИРОВАННЫЙ hero (лучший экстерьер/аэро) с его focal-point */
      const heroProp = props.find(p => curateImages(p).hero);
      const hero = heroProp ? curateImages(heroProp).hero : null;
      const minP = Math.min(...props.map(p => p.priceFrom || Infinity));
      const badge = isFinite(minP) ? 'от ' + money(minP, props.find(p => p.priceFrom === minP)) : '';
      const geo = geoNames[(props[0] || {}).geo] || '';
      const meta = `<div class="cv-meta"><span>${esc(dna.ctx.nProj)} ${plural(dna.ctx.nProj)}</span>${geo ? `<span class="dot"></span><span>${esc(geo)}</span>` : ''}${badge ? `<span class="dot"></span><span>${esc(badge)}</span>` : ''}</div>`;
      const forWho = lead ? `<div class="cv-for">Подготовлено для<b>${esc(lead.name || '')}</b></div>` : '';
      if (pg.v === 'band') {
        return `<section class="page cover cv-band ${hero ? 'has' : ''}" ${hero ? `style="background-image:linear-gradient(180deg,rgba(0,0,0,.25),rgba(0,0,0,.72)),url('${esc(abs(hero.url))}');background-position:${esc(hero.focal || 'center')}"` : ''}>
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
      if (pg.v === 'splitVertical') {
        const dt = new Date(c.createdAt || Date.now()).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
        return `<section class="page cover cv-sv"><div class="sv-photo">${imgCell(hero, 'cover-img', geo)}</div>
          <div class="sv-panel"><header class="cv-top">${wordmark()}<span class="cv-tag">${esc(dna.styleName)}</span></header>
          <div class="sv-mid"><div class="cv-kick">${esc(geo || 'Недвижимость')} · подборка</div><h1 class="cv-h">${esc(title)}</h1>${forWho}${meta}</div>
          <footer class="sv-bot"><span>${esc(mgr.name || AG)}</span><span>${dt}</span></footer></div></section>`;
      }
      if (pg.v === 'indexCard') {
        /* редакторская обложка-«содержание»: перечень проектов подборки */
        const dt = new Date(c.createdAt || Date.now()).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
        const items = props.map((p, i) => {
          const g = geoNames[p.geo] || '';
          const mt = [g, p.area].filter(Boolean).map(esc).join(' · ');
          const pr2 = p.priceFrom ? 'от ' + money(p.priceFrom, p) : '';
          return `<li class="ix-r"><span class="ix-no">${num2(i + 1)}</span><div class="ix-tx"><b class="ix-nm">${esc(p.name)}</b>${mt ? `<span class="ix-mt">${mt}</span>` : ''}</div>${pr2 ? `<span class="ix-pr">${esc(pr2)}</span>` : ''}</li>`;
        }).join('');
        return `<section class="page cover cv-index"><header class="cv-top">${wordmark()}<span class="cv-tag">${esc(dna.styleName)}</span></header>
          <div class="ix-head"><div class="cv-kick">${esc(geo || 'Недвижимость')} · содержание</div><h1 class="cv-h">${esc(title)}</h1>${forWho}</div>
          <ol class="ix-list">${items}</ol>
          <footer class="cv-bot line"><span>${esc(mgr.name || AG)}</span><span>${dt}</span></footer></section>`;
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
      /* Ф2 · курируем изображения: hero = лучший экстерьер/аэро, gallery = микс ролей, планы отдельно */
      const cur = curateImages(pr);
      const photos = cur.photos;
      const hero = cur.hero;
      const second = photos.find(x => x !== hero) || null;
      const fp = floorPlan(cur.plans);
      const head = `<div class="po-head">${kicker('Проект №' + num2(pg.idx + 1) + (pr.developer ? ' · ' + esc(pr.developer) : ''))}<h2 class="po-h">${esc(co.hook)}</h2>${pr.name !== co.hook ? `<div class="po-sub">${esc(pr.name)}${pr.area ? ' · ' + esc(pr.area) : ''}</div>` : (pr.area ? `<div class="po-sub">${esc(pr.area)}</div>` : '')}</div>`;
      const why = co.why.length ? `<div class="rec-inline">${kicker(pr.market === 'offplan' ? 'Почему стоит рассмотреть' : 'Почему этот объект')}<ol class="why">${co.why.slice(0, 3).map(w => `<li>${esc(w)}</li>`).join('')}</ol></div>` : '';

      const ctl = projCtl(pg);
      if (pg.v === 'singleHero') {
        return `<section class="page po po-single ${dna.imageDom === 'high' ? 'domhi' : ''}">${ctl}
          <div class="po-hero">${imgEl(hero, 'hero', pr.area || pr.name)}<div class="po-ident"><span class="po-id-k">${esc(geoNames[pr.geo] || '')}</span><b class="po-id-v">${esc(pr.name)}</b></div></div>
          ${head}
          ${co.blurb ? `<p class="lede drop">${esc(co.blurb)}</p>` : ''}
          ${metricRail(pr, 'row')}
          ${driveTimes(pr, true)}${payTrack(pr)}${fp}${why}
          ${foot(esc(pr.name))}</section>`;
      }
      if (pg.v === 'galleryCurated') {
        const g = cur.gallery;
        const n = Math.min(g.length, 5);
        const gridCls = n >= 5 ? 'gal5' : n === 4 ? 'gal4' : 'gal3';
        return `<section class="page po po-gal">${ctl}
          ${head}
          <div class="${gridCls}">${g.slice(0, 5).map((im, i) => imgEl(im, i === 0 ? 'g-main' : 'g-s', pr.area)).join('')}</div>
          <div class="po-cols"><div class="po-c1">${co.blurb ? `<p class="lede">${esc(co.blurb)}</p>` : ''}${driveTimes(pr, true)}${amenList(pr)}</div>
            <div class="po-c2">${metricRail(pr, 'stack')}${payTrack(pr)}</div></div>
          ${fp}${why}${unitsTable(pr)}
          ${foot(esc(pr.name))}</section>`;
      }
      if (pg.v === 'bento') {
        return `<section class="page po po-bento">${ctl}
          ${head}
          <div class="bento">
            <div class="bt bt-img">${imgEl(hero, '', pr.area)}</div>
            <div class="bt bt-m">${metricRail(pr, 'big')}</div>
            ${second ? `<div class="bt bt-img2">${imgEl(second, '', pr.area)}</div>` : ''}
            <div class="bt bt-loc">${driveTimes(pr) || (co.blurb ? `<p class="lede">${esc(co.blurb)}</p>` : '')}</div>
          </div>
          ${payTrack(pr)}${fp}${why}${unitsTable(pr)}
          ${foot(esc(pr.name))}</section>`;
      }
      if (pg.v === 'sidebarRail') {
        /* Ф1+ · вертикальная рельса метрик/цены слева + доминантное фото и редакторский текст справа */
        return `<section class="page po po-rail">${ctl}
          ${head}
          <div class="rail-split">
            <aside class="rail-side">${metricRail(pr, 'stack')}${amenList(pr)}</aside>
            <div class="rail-main">${imgEl(hero, 'rail-img', pr.area || pr.name)}${co.blurb ? `<p class="lede">${esc(co.blurb)}</p>` : ''}${driveTimes(pr, true)}</div>
          </div>
          ${payTrack(pr)}${fp}${why}${unitsTable(pr)}
          ${foot(esc(pr.name))}</section>`;
      }
      if (pg.v === 'figureGround') {
        /* Ф1+ · одна доминантная фотография + плавающая карточка-идентити в углу + полоса фактов */
        const sub = pr.name !== co.hook ? `<div class="fg-sub">${esc(pr.name)}${pr.area ? ' · ' + esc(pr.area) : ''}</div>` : (pr.area ? `<div class="fg-sub">${esc(pr.area)}</div>` : '');
        return `<section class="page po po-fg">${ctl}
          <div class="fg-stage">
            ${imgEl(hero, 'fg-img', pr.area || pr.name)}
            <div class="fg-card">${kicker('Проект №' + num2(pg.idx + 1) + (pr.developer ? ' · ' + esc(pr.developer) : ''))}<h2 class="fg-h">${esc(co.hook)}</h2>${sub}${co.blurb ? `<p class="fg-blurb">${esc(co.blurb)}</p>` : ''}</div>
          </div>
          ${metricRail(pr, 'row')}
          ${driveTimes(pr, true)}${payTrack(pr)}${fp}${why}${unitsTable(pr)}
          ${foot(esc(pr.name))}</section>`;
      }
      if (pg.v === 'dataLed') {
        /* Ф1+ · цифры/оплата главенствуют, фото — небольшая поддержка (data-rich, image-poor) */
        return `<section class="page po po-data">${ctl}
          ${head}
          <div class="dl-top">
            <div class="dl-metrics">${metricRail(pr, 'big')}</div>
            ${hero ? `<figure class="dl-thumb">${imgEl(hero, 'dl-img', pr.area || pr.name)}</figure>` : ''}
          </div>
          ${co.blurb ? `<p class="lede">${esc(co.blurb)}</p>` : ''}
          ${payTrack(pr)}${unitsTable(pr)}
          <div class="dl-cols"><div class="dl-c">${driveTimes(pr, true)}</div><div class="dl-c">${amenList(pr)}${why}</div></div>
          ${fp}
          ${foot(esc(pr.name))}</section>`;
      }
      /* metricEditorial — редакторский сплит: текст + рельса метрик, план оплаты трек */
      return `<section class="page po po-me">${ctl}
        ${head}
        <div class="me-split">
          <div class="me-l">${co.blurb ? `<p class="lede drop">${esc(co.blurb)}</p>` : ''}${driveTimes(pr, true)}${amenList(pr)}</div>
          <aside class="me-r">${imgEl(hero, 'me-img', pr.area)}${metricRail(pr, 'stack')}</aside>
        </div>
        ${payTrack(pr)}${fp}${why}${unitsTable(pr)}
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
      if (pg.v === 'ranked') {
        /* Ф1+ · редакторский ранжир: кто лидирует по каждому фактическому критерию (не рейтинг) */
        const dims = rows.filter(r => r.best && bestIdx(r) >= 0);
        if (dims.length) {
          return `<section class="page pg cmp cmp-ranked">${kicker('Сравнение')}<h2 class="h2">Кто лидирует по каждому критерию</h2>
            <div class="rk-list">${dims.map((r, i) => { const bi = bestIdx(r); const p = props[bi]; return `<div class="rk-row"><span class="rk-no">${num2(i + 1)}</span><div class="rk-dim"><span class="rk-k">${esc(r.k)}</span><b class="rk-nm">${esc(p.name)}</b></div><b class="rk-v num">${r.fmt(p)}</b></div>`; }).join('')}</div>
            <p class="cc-note">«Лидирует» — по фактическим цифрам объектов (мин. цена, ранняя сдача, макс. доходность/прирост), не наша оценка.</p>
            ${foot('сравнение')}</section>`;
        }
      }
      if (pg.v === 'barsRow') {
        /* Ф1+ · горизонтальные мини-полосы по каждой числовой метрике; длина = факт. величина */
        const dims = [
          { k: 'Цена входа', get: p => p.priceFrom, fmt: p => 'от ' + money(p.priceFrom, p), better: 'low' },
          { k: 'Доходность', get: p => numOf(p.roi), fmt: p => p.roi ? esc(p.roi) : '—', better: 'high' },
          { k: 'Прирост к сдаче', get: p => numOf(p.appreciation), fmt: p => p.appreciation ? esc(p.appreciation) : '—', better: 'high' },
        ].filter(d => props.filter(p => { const n = d.get(p); return n != null && !isNaN(n) && n > 0; }).length >= 2);
        if (dims.length) {
          const groups = dims.map(d => {
            const nums = props.map(p => d.get(p)).filter(n => n != null && !isNaN(n) && n > 0);
            const mx = Math.max(...nums), mn = Math.min(...nums);
            return `<div class="br-group"><div class="br-k">${esc(d.k)}</div>${props.map(p => {
              const n = d.get(p); const has = n != null && !isNaN(n) && n > 0;
              const w = has && mx > 0 ? Math.max(7, Math.round((n / mx) * 100)) : 0;
              const best = has && (d.better === 'low' ? n === mn : n === mx);
              return `<div class="br-row${best ? ' best' : ''}"><span class="br-nm">${esc(p.name)}</span><span class="br-track"><i style="width:${w}%"></i></span><b class="br-v num">${d.fmt(p)}</b><i class="br-bi">${best ? 'лучшее' : ''}</i></div>`;
            }).join('')}</div>`;
          }).join('');
          return `<section class="page pg cmp cmp-bars">${kicker('Сравнение')}<h2 class="h2">Соотношение по цифрам</h2>
            ${groups}
            <p class="cc-note">Длина полос — относительно максимума в строке по фактическим цифрам объектов; подсветка — лучшее значение (мин. цена / макс. доходность), не рейтинг.</p>
            ${foot('сравнение')}</section>`;
        }
      }
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
      const sAva = signer.photo ? `<div class="rc-ava rc-ava-ph" style="background-image:url('${esc(abs(signer.photo))}')"></div>` : `<div class="rc-ava">${esc(initials(signer.name))}</div>`;
      const sign = `<div class="rc-sign">${sAva}<div><b>${esc(signer.name || AG)}</b><span>${esc(signer.title || 'ваш менеджер')}</span></div></div>`;
      const geo = geoNames[(props[0] || {}).geo] || '';
      const opener = lead ? `${(lead.name || '').split(' ')[0] || ''}, вот что важно из этой подборки${geo ? ' по ' + esc(geo) : ''}.` : `Коротко — что важно из этой подборки.`;

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
      if (pg.v === 'sidebarNote') {
        /* Ф1+ · заметка на полях: закреплённый сайдбар с подписью + аннотированные пункты */
        return `<section class="page pg rec rec-sidenote">
          <aside class="sn-side">${kicker('Заметка менеджера')}${sign}${lead ? `<p class="sn-cta">Скажите, что откликается — посчитаю доходность и условия точечно.</p>` : ''}</aside>
          <div class="sn-main"><p class="sn-open">${esc(opener)}</p>
            <div class="sn-pts">${pts.map(([k, v]) => `<div class="sn-p"><span class="sn-k">${esc(k)}</span><p>${v}</p></div>`).join('')}</div></div>
          ${foot('рекомендация')}</section>`;
      }
      if (pg.v === 'pickCard') {
        /* Ф1+ · «с чего начать» — объект, лидирующий по нескольким ФАКТИЧЕСКИМ критериям (с оговоркой) */
        const wins = {};
        const bump = (p, reason) => { if (!p) return; (wins[p.id] = wins[p.id] || { p, reasons: [] }).reasons.push(reason); };
        if (cheapest) bump(cheapest, `самый доступный вход — ${money(cheapest.priceFrom, cheapest)}`);
        if (topRoi) bump(topRoi, `высшая заявленная доходность — ${esc(topRoi.roi)}`);
        if (topAppr) bump(topAppr, `наибольший заявленный прирост — ${esc(topAppr.appreciation)}`);
        if (early && /готов|ready/i.test(String(early.handover))) bump(early, `уже готов к заселению`);
        else if (early && /Q[1-4]/i.test(String(early.handover))) bump(early, `ближайшая сдача — ${esc(early.handover)}`);
        const ranked = Object.values(wins).sort((a, b) => b.reasons.length - a.reasons.length);
        const top = ranked[0];
        if (top && top.reasons.length) {
          const rest = ranked.slice(1).filter(x => x.reasons.length);
          return `<section class="page pg rec rec-pick">${kicker('С чего бы я начал')}<h2 class="h2">Если брать по цифрам</h2>
            <p class="lede">Один объект лидирует сразу по нескольким фактическим параметрам подборки. Это не «единственно верный» выбор — финал зависит от ваших приоритетов, но начать разговор я бы предложил с него.</p>
            <div class="pk-card"><div class="pk-h"><b class="pk-nm">${esc(top.p.name)}</b>${top.p.area ? `<span class="pk-mt">${esc(top.p.area)}</span>` : ''}${top.p.priceFrom ? `<span class="pk-pr">от ${money(top.p.priceFrom, top.p)}</span>` : ''}</div>
              <ul class="pk-why">${top.reasons.map(rr => `<li>${rr}</li>`).join('')}</ul></div>
            ${rest.length ? `<p class="pk-rest">Также стоит посмотреть: ${rest.map(x => `<b>${esc(x.p.name)}</b> (${x.reasons[0]})`).join('; ')}.</p>` : ''}
            ${sign}${foot('рекомендация')}</section>`;
        }
        /* нет честного лидера — падаем в editorNote */
      }
      /* editorNote — подписанная заметка редактора/менеджера */
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

    /* Ф4 · РАЗДЕЛИТЕЛЬ/ОТКРЫВАШКА проекта — крупный номер + имя, переиспользует hero проекта.
       fullbleed (кадр на всю страницу) · split (номер+имя слева, кадр справа) · type (типографика). */
    PROJECT_OPENER(pg) {
      const pr = prById(pg.pid); if (!pr) return '';
      const cur = curateImages(pr); const hero = cur.hero;
      const co = projCopy(c, pg.pid, pr);
      const no = num2(pg.idx + 1);
      const geo = geoNames[pr.geo] || '';
      const kick = 'Проект ' + no + ' из ' + num2(props.length);
      const meta = [geo, pr.area].filter(Boolean).map(esc).join(' · ');
      if (pg.v === 'fullbleed' && hero) {
        return `<section class="page opener op-full" style="background-image:linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,.20) 42%,rgba(0,0,0,.66)),url('${esc(abs(hero.url))}');background-position:${esc(hero.focal || 'center')}">
          <div class="op-top">${wordmark()}<span class="op-tag">${esc(kick)}</span></div>
          <div class="op-mid"><div class="op-no">${no}</div><h2 class="op-h">${esc(pr.name)}</h2>${meta ? `<div class="op-meta">${meta}</div>` : ''}</div>
          <div class="op-bot">${co.hook && co.hook !== pr.name ? `<p class="op-lede">${esc(co.hook)}</p>` : (pr.priceFrom ? `<p class="op-lede">от ${money(pr.priceFrom, pr)}</p>` : '')}</div>
        </section>`;
      }
      if (pg.v === 'split' && hero) {
        return `<section class="page opener op-split">
          <div class="op-l"><span class="op-tag dark">${esc(kick)}</span><div class="op-no big">${no}</div><h2 class="op-h">${esc(pr.name)}</h2>${meta ? `<div class="op-meta">${meta}</div>` : ''}${pr.priceFrom ? `<div class="op-price">от ${money(pr.priceFrom, pr)}</div>` : ''}</div>
          <div class="op-r">${imgEl(hero, 'op-img', pr.area)}</div>
        </section>`;
      }
      if (pg.v === 'plate' && hero) {
        /* Ф1+ · открывашка-плашка: кадр на всю страницу + плотная карточка-идентити снизу */
        return `<section class="page opener op-plate" style="background-image:linear-gradient(180deg,rgba(0,0,0,.30),rgba(0,0,0,.14) 46%,rgba(0,0,0,.34)),url('${esc(abs(hero.url))}');background-position:${esc(hero.focal || 'center')}">
          <div class="op-top">${wordmark()}<span class="op-tag">${esc(kick)}</span></div>
          <div class="op-plate-card"><div class="op-no">${no}</div><h2 class="op-h">${esc(pr.name)}</h2>${meta ? `<div class="op-meta">${meta}</div>` : ''}${co.hook && co.hook !== pr.name ? `<p class="op-plate-lede">${esc(co.hook)}</p>` : ''}${pr.priceFrom ? `<div class="op-price">от ${money(pr.priceFrom, pr)}</div>` : ''}</div>
        </section>`;
      }
      return `<section class="page opener op-type">
        <div class="op-ty-top">${wordmark()}<span class="op-tag dark">${esc(kick)}</span></div>
        <div class="op-ty-mid"><div class="op-no huge">${no}</div><div class="op-ty-tx"><h2 class="op-h xl">${esc(pr.name)}</h2>${meta ? `<div class="op-meta">${meta}</div>` : ''}${co.hook && co.hook !== pr.name ? `<p class="op-lede">${esc(co.hook)}</p>` : ''}</div></div>
        <div class="op-ty-bot">${pr.priceFrom ? `<span>от ${money(pr.priceFrom, pr)}</span>` : ''}${pr.priceFrom && pr.handover ? '<span class="dot"></span>' : ''}${pr.handover ? `<span>${esc(pr.handover)}</span>` : ''}</div>
      </section>`;
    },

    /* Ф4 · ДАЛЬНЕЙШИЕ ШАГИ — честный обобщённый процесс (без выдуманной конкретики) + контакт агента. */
    NEXT_STEPS(pg) {
      const steps = [
        ['Подобрали', 'Собрали объекты строго под ваш запрос — с проверкой застройщика и цифр.'],
        ['Обсудим', 'Созвонимся, разберём доходность и условия оплаты, ответим на все вопросы.'],
        ['Бронирование', 'Резерв выбранного юнита и проверка документов по сделке.'],
        ['Сделка', 'Оплата по графику и сопровождение до получения ключей.'],
      ];
      const phone = (signer.phone || '').replace(/\D/g, '');
      const wa = phone ? `https://wa.me/${phone}?text=${encodeURIComponent('Здравствуйте! По подборке «' + (c.title || '') + '» — хочу обсудить проект №')}` : '';
      const who = signer.name ? `<div class="ns-who">${signer.photo ? `<span class="ns-ava" style="background-image:url('${esc(abs(signer.photo))}')"></span>` : `<span class="ns-ava txt">${esc(initials(signer.name))}</span>`}<div><b>${esc(signer.name)}</b>${signer.title ? `<span>${esc(signer.title)}</span>` : ''}${signer.phone ? `<span>${esc(signer.phone)}</span>` : ''}</div></div>` : '';
      const cta = (who || wa) ? `<div class="ns-cta">${who}${wa ? `<a class="ns-btn" href="${esc(wa)}">Написать в WhatsApp</a>` : ''}</div>` : '';
      const list = pg.v === 'row'
        ? `<div class="ns-row">${steps.map(([k, v], i) => `<div class="ns-step"><span class="ns-no">${num2(i + 1)}</span><b class="ns-k">${esc(k)}</b><p class="ns-v">${esc(v)}</p></div>`).join('')}</div>`
        : `<div class="ns-stack">${steps.map(([k, v], i) => `<div class="ns-sr"><span class="ns-no">${num2(i + 1)}</span><div><b class="ns-k">${esc(k)}</b><p class="ns-v">${esc(v)}</p></div></div>`).join('')}</div>`;
      return `<section class="page pg ns">${kicker('Как мы работаем')}<h2 class="h2">Дальнейшие шаги</h2>
        <p class="lede">Прозрачный процесс — от подбора до ключей, без спешки и давления.</p>
        ${list}${cta}${foot('процесс')}</section>`;
    },

    /* Ф4 · АГЕНТ — только реальные поля брокера/менеджера (портрет если есть; иначе инициалы).
       editorial/split (с портретом) · minimal (без портрета) — не «портрет+простыня+буллеты». */
    AGENT_PROFILE(pg) {
      if (!agent) return '';
      const geo = agent.geo ? (geoNames[agent.geo] || agent.geo) : '';
      const LANG = { ru: 'русский', en: 'английский', ar: 'арабский', id: 'индонезийский', th: 'тайский', es: 'испанский', de: 'немецкий', fr: 'французский' };
      const langs = (agent.langs || []).map(l => LANG[l] || l).filter(Boolean);
      const deals = (typeof agent.deals90 === 'number' && agent.deals90 > 0) ? agent.deals90 : null;
      const portrait = agent.photo ? `<div class="ag-ph" style="background-image:url('${esc(abs(agent.photo))}')"></div>` : `<div class="ag-ph ag-ph-txt">${esc(initials(agent.name))}</div>`;
      const facts = [];
      if (geo) facts.push(['Рынок', geo]);
      if (langs.length) facts.push(['Языки', langs.join(', ')]);
      if (deals) facts.push(['Сделок за 90 дней', String(deals)]);
      const factsHtml = facts.length ? `<div class="ag-facts">${facts.map(([k, v]) => `<div class="ag-f"><span class="ag-fk">${esc(k)}</span><b class="ag-fv">${esc(v)}</b></div>`).join('')}</div>` : '';
      const note = agent.bio ? `<p class="ag-note">${esc(agent.bio)}</p>` : '';
      const contact = []; if (agent.phone) contact.push(esc(agent.phone)); if (agent.email) contact.push(esc(agent.email));
      const contactHtml = contact.length ? `<div class="ag-contact">${contact.join('<span class="dot"></span>')}</div>` : '';
      const nameBlock = `<div class="ag-name"><h2 class="ag-h">${esc(agent.name)}</h2>${agent.title ? `<div class="ag-role">${esc(agent.title)}</div>` : ''}</div>`;
      if (pg.v === 'split') {
        return `<section class="page pg ag ag-split">${kicker('Ваш эксперт по подборке')}
          <div class="ag-sp"><div class="ag-sp-l">${portrait}${contactHtml}</div>
          <div class="ag-sp-r">${nameBlock}${note}${factsHtml}</div></div>
          ${foot('эксперт')}</section>`;
      }
      if (pg.v === 'editorial') {
        return `<section class="page pg ag ag-edi">${kicker('Ваш эксперт по подборке')}
          <div class="ag-edi-top">${portrait}<div class="ag-edi-id">${nameBlock}${factsHtml}</div></div>
          ${note}${contactHtml}
          ${foot('эксперт')}</section>`;
      }
      return `<section class="page pg ag ag-min">${kicker('Ваш эксперт по подборке')}
        <div class="ag-min-head">${portrait}${nameBlock}</div>
        ${note}${factsHtml}${contactHtml}
        ${foot('эксперт')}</section>`;
    },

    /* Ф4 · АГЕНТСТВО — только реальные факты из settings.agency.about (цифры = слова агентства).
       stats (плитки из числовых буллетов) · statement (сдержанное заявление + столпы). */
    AGENCY_PROOF(pg) {
      const bullets = (about.bullets || []).filter(Boolean);
      const whyUs = (about.whyUs || []).filter(Boolean);
      const intro = about.intro || '';
      const freeNote = about.freeNote || '';
      const office = about.office || {};
      const geoSet = [];
      (agency.geos || []).forEach(g => { const n = geoNames[g] || g; if (n && !geoSet.includes(n)) geoSet.push(n); });
      (db.brokers || []).forEach(b => { if (b.geo) { const n = geoNames[b.geo] || b.geo; if (n && !geoSet.includes(n)) geoSet.push(n); } });
      const markets = geoSet.length ? `<div class="pf-markets">${kicker('Направления')}<div class="pf-mk">${geoSet.map(g => `<span class="pf-mc">${esc(g)}</span>`).join('')}</div></div>` : '';
      if (pg.v === 'stats') {
        const tiles = [], statements = [];
        bullets.forEach(b => { const m = String(b).match(/^\s*([\d][\d\s.,+%]*)\s*(.*)$/); if (m) { let lbl = m[2].replace(/^[—–:\s]+/, '').split(/[:.]/)[0].trim(); tiles.push([m[1].trim().replace(/\s+/g, ' '), lbl]); } else statements.push(b); });
        return `<section class="page pg pf pf-stats">${kicker('Об агентстве')}<h2 class="h2">${esc(AG)}</h2>
          ${intro ? `<p class="lede">${esc(intro)}</p>` : ''}
          ${tiles.length ? `<div class="pf-grid">${tiles.map(([n, l]) => `<div class="pf-t"><b class="pf-n">${esc(n)}</b>${l ? `<span class="pf-l">${esc(l)}</span>` : ''}</div>`).join('')}</div>` : ''}
          ${markets}
          ${statements.length ? `<ul class="pf-list">${statements.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
          ${freeNote ? `<p class="pf-free">${esc(freeNote)}</p>` : ''}
          <p class="cc-note">Цифры и факты приведены со слов агентства.</p>
          ${foot('агентство')}</section>`;
      }
      return `<section class="page pg pf pf-statement">${kicker('Об агентстве')}<h2 class="h2">${esc(AG)}</h2>
        ${intro ? `<p class="pf-intro">${esc(intro)}</p>` : ''}
        ${whyUs.length ? `<div class="pf-pillars">${whyUs.slice(0, 3).map((w, i) => `<div class="pf-pil"><span class="pf-pno">${num2(i + 1)}</span><p>${esc(w)}</p></div>`).join('')}</div>` : ''}
        ${markets}
        ${office.blurb ? `<p class="pf-office">${esc(office.blurb)}</p>` : ''}
        ${freeNote ? `<p class="pf-free">${esc(freeNote)}</p>` : ''}
        <p class="cc-note">Факты приведены со слов агентства.</p>
        ${foot('агентство')}</section>`;
    },

    /* Ф4 · ЗАДНЯЯ ОБЛОЖКА — тихое закрытие: знак агентства + контакт + строка конфиденциальности. */
    BACK_COVER(pg) {
      const contact = []; if (signer.phone) contact.push(esc(signer.phone)); if (signer.email) contact.push(esc(signer.email));
      const office = about.office || {};
      const inner = `<div class="bk-brand">${wordmark()}</div>
        <div class="bk-mid"><p class="bk-line">Спасибо, что уделили время подборке.</p>
        ${signer.name ? `<div class="bk-who">${esc(signer.name)}${signer.title ? ' · ' + esc(signer.title) : ''}</div>` : ''}
        ${contact.length ? `<div class="bk-contact">${contact.join(' · ')}</div>` : ''}
        ${(office.city || office.address) ? `<div class="bk-office">${[office.address, office.city].filter(Boolean).map(esc).join(', ')}</div>` : ''}</div>
        <div class="bk-foot"><span class="bk-conf">Материал подготовлен персонально. Цены и условия — со слов застройщиков, могут меняться; не является публичной офертой. Просьба не распространять.</span></div>`;
      if (pg.v === 'plate') return `<section class="page cover bk bk-plate"><div class="bk-in">${inner}</div></section>`;
      return `<section class="page cover bk bk-band">${inner}</section>`;
    },
  };

  /* Ф3 · рендер + скрытый QC-лог (HTML-коммент + data-qc — только для дебага, не виден клиенту) */
  const body = plan.map(pg => {
    let html = G[pg.role] ? G[pg.role](pg) : '';
    if (!html) return '';
    const qc = pg.qc;
    if (qc) {
      const cm = `<!-- qc ${pg.role}${pg.pid ? ' ' + pg.pid : ''}${pg.locked ? ' LOCKED' : ''}${pg.repaired ? ' repaired=' + pg.repaired : ''} h=${qc.hierarchy} b=${qc.balance} d=${qc.density} rep=${qc.repetition} img=${qc.imageFit} data=${qc.dataFit} min=${qc.min} avg=${qc.avg} -->\n`;
      const attr = `data-qc="min:${qc.min} avg:${qc.avg} h:${qc.hierarchy} b:${qc.balance} d:${qc.density} rep:${qc.repetition} img:${qc.imageFit} data:${qc.dataFit}${pg.locked ? ' locked' : ''}${pg.repaired ? ' repaired:' + pg.repaired : ''}"`;
      html = cm + html.replace(/<section /, `<section ${attr} `);
    }
    return html;
  }).join('\n');

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
/* Ф2 · фазы платежа (старт/стройка/ключи) + накопительная полоса cash-flow */
.pt-ph{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:700;margin-top:6px}
.pt-node.ph-build .pt-dot{border-color:color-mix(in srgb,var(--accent) 48%,var(--mut))}
.pt-node.ph-build .pt-ph{color:color-mix(in srgb,var(--accent) 55%,var(--mut))}
.pt-node.ph-handover .pt-dot{background:var(--accent);border-color:var(--accent)}
.pt-node.drip .pt-dot{background:repeating-linear-gradient(45deg,var(--accent) 0 2px,var(--paper) 2px 4px)}
.pt-bar{display:flex;height:10px;border-radius:100px;overflow:hidden;margin:18px 0 10px;background:var(--tint)}
.pt-seg{height:100%;display:block;position:relative}
.pt-seg.ph-now{background:var(--accent)}
.pt-seg.ph-build{background:color-mix(in srgb,var(--accent) 42%,var(--tint))}
.pt-seg.ph-handover{background:color-mix(in srgb,var(--ink) 78%,var(--accent))}
.pt-seg+.pt-seg{box-shadow:-1px 0 0 var(--paper)}
.pt-seg.drip{background-image:repeating-linear-gradient(90deg,rgba(255,255,255,.55) 0 2px,transparent 2px 7px)}
.pt-leg{display:flex;gap:18px;flex-wrap:wrap;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);font-weight:700}
.pt-lg{display:inline-flex;align-items:center;gap:7px}
.pt-lg i{width:11px;height:11px;border-radius:3px;display:inline-block}
.pt-lg i.ph-now{background:var(--accent)}.pt-lg i.ph-build{background:color-mix(in srgb,var(--accent) 42%,var(--tint))}.pt-lg i.ph-handover{background:color-mix(in srgb,var(--ink) 78%,var(--accent))}
/* единый платёж (готовый/ипотека) — компактная плашка вместо пустоты */
.pay-one .po-one{display:flex;align-items:baseline;gap:16px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:16px 0}
.po-one-p{font-family:var(--disp);font-size:var(--s-metric);font-weight:600;letter-spacing:-.01em;color:var(--accent)}
.po-one-l{font-size:14px;color:var(--ink)}
/* Ф2 · floor-plan / генплан — contained, не cover-cropped, с подписью */
.fplan{margin:16px 0 26px}
.fp-grid{display:grid;gap:12px}
.fp-grid.fp-1{grid-template-columns:1fr}
.fp-grid.fp-2{grid-template-columns:1fr 1fr}
.fp-grid.fp-3{grid-template-columns:repeat(3,1fr)}
.fp-cell{border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;background:var(--tint)}
.fp-img{height:300px}
.fp-grid.fp-2 .fp-img,.fp-grid.fp-3 .fp-img{height:230px}
.fp-cap{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut);font-weight:700;padding:10px 14px;border-top:1px solid var(--line);background:var(--paper)}
.fp-note{font-size:11.5px;color:var(--mut);font-style:italic;margin-top:12px}
@media(max-width:640px){.fp-grid.fp-2,.fp-grid.fp-3{grid-template-columns:1fr}.fp-img{height:240px}}
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
/* Ф2 · адаптив под курируемый набор (3 / 4 фото) — hero всегда крупнее */
.gal3{display:grid;grid-template-columns:1.35fr 1fr;grid-template-rows:150px 150px;gap:8px;margin-bottom:26px}
.gal3 .g-main{grid-column:1;grid-row:1/3;border-radius:var(--radius)}.gal3 .g-s{grid-column:2;border-radius:var(--radius)}
.gal4{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:210px 140px;gap:8px;margin-bottom:26px}
.gal4 .g-main{grid-column:1/4;grid-row:1;border-radius:var(--radius)}.gal4 .g-s{border-radius:var(--radius)}
.po-cols{display:grid;grid-template-columns:1.15fr .85fr;gap:36px;align-items:start}
@media(max-width:640px){.gal5{grid-template-columns:repeat(2,1fr);grid-template-rows:180px 120px 120px}.gal5 .g-main{grid-column:1/3}.gal3{grid-template-columns:1fr 1fr;grid-template-rows:160px 120px}.gal3 .g-main{grid-column:1/3;grid-row:1}.gal4{grid-template-columns:repeat(2,1fr);grid-template-rows:170px 120px}.gal4 .g-main{grid-column:1/3}.po-cols{grid-template-columns:1fr;gap:22px}}
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
/* ---- Ф4 · SVG cash-flow bar (векторная, чёткая в печати) ---- */
.pt-svg{width:100%;height:11px;display:block;border-radius:100px;overflow:hidden;background:var(--tint);margin:18px 0 10px}
.pt-svgseg.ph-now{fill:var(--accent)}
.pt-svgseg.ph-build{fill:color-mix(in srgb,var(--accent) 42%,var(--tint))}
.pt-svgseg.ph-handover{fill:color-mix(in srgb,var(--ink) 78%,var(--accent))}
/* ---- Ф4 · PROJECT_OPENER (разделители-ритм) ---- */
.opener{position:relative;min-height:1180px;display:flex;flex-direction:column;color:var(--ink);overflow:hidden;background:var(--paper)}
.op-tag{font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;font-weight:700}
.op-tag.dark{color:var(--accent)}
.op-no{font-family:var(--disp);font-size:26px;font-weight:600;color:var(--accent);letter-spacing:.02em}
.op-meta{margin-top:14px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.op-full{color:#fff;background:var(--band) center/cover no-repeat;padding:var(--pad-y) var(--pad-x)}
.op-full .op-top{display:flex;justify-content:space-between;align-items:center}
.op-full .wm-tx{color:#fff}.op-full .op-tag{color:rgba(255,255,255,.82)}
.op-full .op-mid{margin-top:auto}
.op-full .op-mid,.op-full .op-bot,.op-full .op-top{text-shadow:0 2px 26px rgba(0,0,0,.42)}
.op-full .op-no{color:#F1D9A6}
.op-full .op-h{font-family:var(--disp);font-size:calc(var(--s-disp)*.98);line-height:1.02;font-weight:600;letter-spacing:-.02em;max-width:16ch;margin-top:8px}
.op-full .op-meta{color:rgba(255,255,255,.86)}
.op-full .op-bot{margin-top:26px}
.op-lede{font-size:17px;color:rgba(255,255,255,.9);max-width:46ch;line-height:1.5}
.op-split{display:grid;grid-template-columns:1fr 1fr;min-height:1180px}
.op-split .op-l{padding:var(--pad-y) 44px var(--pad-y) var(--pad-x);display:flex;flex-direction:column;justify-content:center;background:var(--paper)}
.op-split .op-no.big{font-size:64px;line-height:1;margin:14px 0 12px}
.op-split .op-h{font-family:var(--disp);font-size:var(--s-h1);line-height:1.04;font-weight:600;letter-spacing:-.015em;max-width:14ch}
.op-price{font-family:var(--disp);font-size:24px;font-weight:600;color:var(--accent);margin-top:22px}
.op-split .op-r{position:relative}.op-split .op-img{position:absolute;inset:0}
.op-type{padding:var(--pad-y) var(--pad-x);justify-content:space-between}
.op-ty-top{display:flex;justify-content:space-between;align-items:center}
.op-ty-mid{display:flex;gap:36px;align-items:flex-start;margin:auto 0}
.op-no.huge{font-size:150px;line-height:.8;color:var(--accent);flex:0 0 auto}
.op-h.xl{font-family:var(--disp);font-size:calc(var(--s-disp)*1.02);line-height:1;font-weight:600;letter-spacing:-.02em;max-width:16ch}
.op-ty-tx .op-lede{color:var(--mut);margin-top:18px;max-width:48ch}
.op-ty-bot{display:flex;align-items:center;gap:14px;font-size:13px;color:var(--mut);letter-spacing:.06em;text-transform:uppercase;border-top:1px solid var(--line);padding-top:20px}
.op-ty-bot .dot{width:4px;height:4px;border-radius:50%;background:var(--mut);opacity:.6}
@media(max-width:640px){.opener,.op-split{min-height:auto}.op-split{grid-template-columns:1fr}.op-split .op-r{min-height:300px}.op-no.huge{font-size:92px}.op-ty-mid{gap:18px}.op-h.xl{font-size:calc(var(--s-disp)*.9)}}
/* ---- Ф4 · NEXT_STEPS ---- */
.ns-row{display:grid;grid-template-columns:repeat(4,1fr);gap:22px;margin:10px 0 26px}
.ns-step{border-top:2px solid var(--accent);padding-top:16px}
.ns-no{font-family:var(--disp);font-size:15px;color:var(--accent);font-weight:600}
.ns-k{display:block;font-family:var(--disp);font-size:19px;font-weight:600;letter-spacing:-.01em;margin:8px 0}
.ns-v{font-size:13.5px;line-height:1.5;color:var(--mut)}
.ns-stack{margin:10px 0 26px;border-top:1px solid var(--line)}
.ns-sr{display:flex;gap:20px;padding:20px 0;border-bottom:1px solid var(--line);align-items:baseline}
.ns-sr .ns-no{flex:0 0 auto;font-size:16px}.ns-sr .ns-k{margin:0 0 5px;font-size:20px}
.ns-cta{display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap;background:var(--tint);border-radius:var(--radius);padding:22px 26px;margin-top:8px}
.ns-who{display:flex;align-items:center;gap:14px}
.ns-ava{width:50px;height:50px;border-radius:50%;background:var(--accent) center/cover no-repeat;flex:0 0 auto;display:flex;align-items:center;justify-content:center;color:#fff;font-family:var(--disp);font-weight:600;font-size:17px}
.ns-who b{display:block;font-size:15px}.ns-who span{display:block;font-size:12.5px;color:var(--mut)}
.ns-btn{display:inline-flex;align-items:center;background:var(--accent);color:#fff;padding:14px 26px;border-radius:100px;font-weight:700;font-size:14px;text-decoration:none}
@media(max-width:640px){.ns-row{grid-template-columns:1fr 1fr}}
/* ---- Ф4 · AGENT_PROFILE ---- */
.ag-ph{width:120px;height:120px;border-radius:50%;background:var(--tint) center/cover no-repeat;flex:0 0 auto}
.ag-ph-txt{display:flex;align-items:center;justify-content:center;background:var(--accent);color:#fff;font-family:var(--disp);font-weight:600;font-size:40px}
.ag-h{font-family:var(--disp);font-size:var(--s-h2);font-weight:600;letter-spacing:-.01em;line-height:1.1}
.ag-role{font-size:12px;letter-spacing:.05em;color:var(--accent);font-weight:700;margin-top:8px;text-transform:uppercase}
.ag-note{font-size:16px;line-height:1.62;color:var(--ink);max-width:60ch;margin:22px 0}
.ag-facts{display:flex;flex-wrap:wrap;gap:0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin:8px 0 18px}
.ag-f{padding:14px 28px 14px 0;border-right:1px solid var(--line)}.ag-f:last-child{border-right:0}
.ag-fk{font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--mut);font-weight:700;display:block}
.ag-fv{font-family:var(--disp);font-size:20px;font-weight:600;margin-top:6px;display:block}
.ag-contact{display:flex;align-items:center;gap:12px;font-size:14px;color:var(--mut);margin-top:8px;flex-wrap:wrap}
.ag-contact .dot{width:4px;height:4px;border-radius:50%;background:var(--mut);opacity:.6;display:inline-block}
.ag-min-head{display:flex;align-items:center;gap:24px;margin:8px 0 4px}
.ag-min-head .ag-ph{width:92px;height:92px}.ag-min-head .ag-ph-txt{font-size:32px}
.ag-edi-top{display:flex;gap:30px;align-items:center;margin:8px 0 4px}.ag-edi-id{flex:1}
.ag-sp{display:grid;grid-template-columns:.72fr 1.28fr;gap:40px;align-items:start;margin-top:8px}
.ag-sp-l{display:flex;flex-direction:column;gap:18px}
.ag-sp-l .ag-ph{width:100%;height:auto;aspect-ratio:1;border-radius:var(--radius)}
.ag-sp-l .ag-contact{flex-direction:column;align-items:flex-start;gap:6px}.ag-sp-l .ag-contact .dot{display:none}
@media(max-width:640px){.ag-sp{grid-template-columns:1fr}.ag-min-head,.ag-edi-top{flex-direction:column;align-items:flex-start}}
/* ---- Ф4 · AGENCY_PROOF ---- */
.pf-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;margin:16px 0 22px}
.pf-t{background:var(--paper);padding:26px 22px}
.pf-n{font-family:var(--disp);font-size:44px;font-weight:600;color:var(--accent);letter-spacing:-.02em;line-height:1;display:block}
.pf-l{font-size:12.5px;color:var(--mut);margin-top:10px;display:block;line-height:1.35}
.pf-intro{font-family:var(--disp);font-size:27px;line-height:1.3;font-weight:500;letter-spacing:-.01em;max-width:28ch;margin:6px 0 28px}
.pf-pillars{display:flex;flex-direction:column;border-top:1px solid var(--line);margin-bottom:22px}
.pf-pil{display:flex;gap:22px;padding:20px 0;border-bottom:1px solid var(--line)}
.pf-pno{font-family:var(--disp);font-size:15px;color:var(--accent);font-weight:600;flex:0 0 auto;padding-top:2px}
.pf-pil p{font-size:15px;line-height:1.58}
.pf-markets{margin:18px 0}.pf-mk{display:flex;flex-wrap:wrap;gap:8px}
.pf-mc{font-size:13px;border:1px solid var(--line);padding:8px 15px;border-radius:100px;background:var(--tint)}
.pf-list{list-style:none;margin:12px 0 18px}
.pf-list li{padding:11px 0 11px 22px;border-bottom:1px solid var(--line);font-size:14.5px;line-height:1.5;position:relative}
.pf-list li:last-child{border-bottom:0}
.pf-list li::before{content:"";position:absolute;left:0;top:19px;width:12px;height:1px;background:var(--accent)}
.pf-office,.pf-free{font-size:13.5px;color:var(--mut);line-height:1.55;margin-top:14px}.pf-free{font-style:italic}
/* ---- Ф4 · BACK_COVER ---- */
.bk-band{background:var(--band);color:var(--on-band);padding:var(--pad-y) var(--pad-x);display:flex;flex-direction:column;min-height:1180px}
.bk-plate{align-items:center;justify-content:center}
.bk-in{background:var(--band);color:var(--on-band);border-radius:var(--radius);padding:64px 56px;max-width:80%;margin:auto;display:flex;flex-direction:column;min-height:64%}
.bk .wm-tx{color:#fff}
.bk-brand{margin-bottom:auto}
.bk-mid{margin:auto 0}
.bk-line{font-family:var(--disp);font-size:30px;font-weight:500;letter-spacing:-.01em;line-height:1.3;color:var(--on-band);max-width:20ch}
.bk-who{font-size:15px;color:var(--on-band);margin-top:26px;font-weight:600}
.bk-contact{font-size:14px;color:rgba(255,255,255,.72);margin-top:8px;letter-spacing:.02em}
.bk-office{font-size:13px;color:rgba(255,255,255,.58);margin-top:6px}
.bk-foot{margin-top:auto;padding-top:44px}
.bk-conf{font-size:11px;color:rgba(255,255,255,.5);line-height:1.5;letter-spacing:.02em;max-width:60ch;display:block}
@media(max-width:640px){.bk-band,.bk-plate{min-height:auto}.bk-in{max-width:none;padding:44px 30px}}
/* ---- Ф4 · направления-акценты ---- */
.style-cinematic .po-single .po-hero{height:660px}
.style-cinematic .cv-h,.style-cinematic .op-full .op-h{letter-spacing:-.026em}
.style-cinematic .op-full .op-h{font-size:calc(var(--s-disp)*1.08)}
.style-darkluxury .kick,.style-darkluxury .op-tag.dark{letter-spacing:.24em}
.style-darkluxury .cv-h,.style-darkluxury .po-h,.style-darkluxury .h2,.style-darkluxury .bk-line{font-weight:500}
/* ==== Ф1+ · новые грамматики ==== */
/* PROJECT_OVERVIEW · sidebarRail — вертикальная рельса метрик/цены слева + фото и текст справа */
.po-rail .rail-split{display:grid;grid-template-columns:.34fr .66fr;gap:34px;align-items:start;margin-bottom:6px}
.po-rail .rail-side{border-left:2px solid var(--accent);padding-left:24px}
.po-rail .rail-side .mrail{margin:0 0 18px}
/* вертикальная рельса: метка над крупным значением — числа не переносятся в узкой колонке */
.po-rail .rail-side .mrail.stack .mr{flex-direction:column;align-items:flex-start;gap:5px}
.po-rail .rail-side .mrail.stack .mr-k{flex:0 0 auto}
.po-rail .rail-side .mrail.stack .mr-v{margin-left:0;font-size:calc(var(--s-metric)*.86);line-height:1.02}
.po-rail .rail-side .mrail.stack .mr-s{order:3}
.po-rail .rail-side .amen{margin:0}
.po-rail .rail-img{height:360px;border-radius:var(--radius);margin-bottom:22px}
.po-rail .rail-main .lede{margin-bottom:20px}
@media(max-width:640px){.po-rail .rail-split{grid-template-columns:1fr;gap:22px}.po-rail .rail-side{border-left:0;padding-left:0}.po-rail .rail-img{height:240px}}
/* PROJECT_OVERVIEW · figureGround — доминантное фото + плавающая карточка-идентити в углу */
.po-fg .fg-stage{position:relative;height:560px;border-radius:var(--radius);overflow:hidden;margin-bottom:26px}
.po-fg .fg-img{position:absolute;inset:0}
.po-fg .fg-card{position:absolute;left:0;bottom:0;background:var(--paper);color:var(--ink);padding:30px 36px 32px;max-width:66%;border-top-right-radius:calc(var(--radius) + 8px);box-shadow:0 -8px 60px -18px rgba(0,0,0,.55)}
.po-fg .fg-h{font-family:var(--disp);font-size:var(--s-h1);line-height:1.04;font-weight:600;letter-spacing:-.015em;margin-top:4px;max-width:16ch}
.po-fg .fg-sub{font-size:13px;letter-spacing:.06em;color:var(--mut);margin-top:10px;text-transform:uppercase}
.po-fg .fg-blurb{font-size:14px;line-height:1.55;color:var(--mut);margin-top:14px;max-width:46ch}
@media(max-width:640px){.po-fg .fg-stage{height:auto;overflow:visible}.po-fg .fg-img{position:relative;height:260px;border-radius:var(--radius)}.po-fg .fg-card{position:relative;max-width:none;box-shadow:none;padding:22px 4px 4px}}
/* PROJECT_OVERVIEW · dataLed — цифры/оплата главенствуют, фото — небольшая поддержка */
.po-data .dl-top{display:grid;grid-template-columns:1.5fr .5fr;gap:34px;align-items:center;margin-bottom:8px}
.po-data .dl-metrics .mrail.big{margin:0;gap:30px 46px}
.po-data .dl-metrics .mr-v{font-size:calc(var(--s-metric)*1.2)}
.po-data .dl-metrics .mr.lead .mr-v{font-size:calc(var(--s-metric)*1.5)}
.po-data .dl-thumb{margin:0}
.po-data .dl-img{height:210px;border-radius:var(--radius)}
.po-data .dl-cols{display:grid;grid-template-columns:1fr 1fr;gap:36px;align-items:start;margin-top:6px}
.po-data .dl-cols .dl-c > *:first-child{margin-top:0}
@media(max-width:640px){.po-data .dl-top{grid-template-columns:1fr}.po-data .dl-cols{grid-template-columns:1fr;gap:20px}}
/* COVER · splitVertical — половина фото / половина типографической панели */
.cv-sv{display:grid;grid-template-columns:1fr 1fr;min-height:1180px;padding:0}
.cv-sv .sv-photo{position:relative}.cv-sv .sv-photo .cover-img{position:absolute;inset:0}
.cv-sv .sv-panel{background:var(--tint);display:flex;flex-direction:column;padding:var(--pad-y) var(--pad-x)}
.cv-sv .sv-panel .cv-top{padding:0}
.cv-sv .sv-mid{flex:1;display:flex;flex-direction:column;justify-content:center}
.cv-sv .cv-h{font-size:calc(var(--s-disp)*.78);max-width:12ch}   /* панель уже половины листа — крупный дисплей меньше переносится */
.cv-sv .sv-bot{display:flex;justify-content:space-between;font-size:12px;color:var(--mut);letter-spacing:.08em;text-transform:uppercase;border-top:1px solid var(--line);padding-top:18px}
@media(max-width:640px){.cv-sv{grid-template-columns:1fr;min-height:auto}.cv-sv .sv-photo{min-height:320px}}
/* COVER · indexCard — редакторская обложка-«содержание» с перечнем проектов */
.cv-index{padding:var(--pad-y) var(--pad-x)}
.cv-index .cv-top{padding:0}
.cv-index .ix-head{margin-top:42px}.cv-index .cv-h{margin-top:0}
.cv-index .ix-list{list-style:none;margin:36px 0 auto;border-top:1px solid var(--line)}
.cv-index .ix-r{display:flex;align-items:baseline;gap:20px;padding:20px 0;border-bottom:1px solid var(--line)}
.cv-index .ix-no{font-family:var(--disp);font-size:16px;color:var(--accent);font-weight:600;flex:0 0 34px;font-variant-numeric:tabular-nums}
.cv-index .ix-tx{flex:1}
.cv-index .ix-nm{font-family:var(--disp);font-size:22px;font-weight:600;letter-spacing:-.01em;display:block}
.cv-index .ix-mt{font-size:12px;color:var(--mut);letter-spacing:.06em;margin-top:5px;display:block;text-transform:uppercase}
.cv-index .ix-pr{font-family:var(--disp);font-size:17px;font-weight:600;color:var(--accent);flex:0 0 auto}
@media(max-width:640px){.cv-index .ix-nm{font-size:19px}}
/* PROJECT_OPENER · plate — кадр на всю страницу + плотная карточка-идентити снизу */
.op-plate{color:#fff;background:var(--band) center/cover no-repeat;padding:var(--pad-y) var(--pad-x);justify-content:flex-start}
.op-plate .op-top{display:flex;justify-content:space-between;align-items:center;text-shadow:0 2px 20px rgba(0,0,0,.4)}
.op-plate .wm-tx{color:#fff}.op-plate .op-top .op-tag{color:rgba(255,255,255,.85)}
.op-plate .op-plate-card{margin-top:auto;background:var(--paper);color:var(--ink);border-radius:var(--radius);padding:34px 40px;max-width:66%;box-shadow:0 30px 90px -30px rgba(0,0,0,.65)}
.op-plate .op-plate-card .op-no{color:var(--accent)}
.op-plate .op-plate-card .op-h{font-family:var(--disp);font-size:var(--s-h1);line-height:1.04;font-weight:600;letter-spacing:-.015em;margin-top:8px;max-width:15ch}
.op-plate .op-plate-lede{font-size:15px;color:var(--mut);margin-top:14px;line-height:1.5;max-width:44ch}
.op-plate .op-price{font-family:var(--disp);font-size:23px;font-weight:600;color:var(--accent);margin-top:18px}
@media(max-width:640px){.op-plate .op-plate-card{max-width:none;padding:26px 24px}}
/* COMPARISON · ranked — редакторский ранжир лидеров по критериям */
.cmp-ranked .rk-list{border-top:1px solid var(--ink);margin:8px 0 16px}
.rk-row{display:flex;align-items:baseline;gap:22px;padding:20px 0;border-bottom:1px solid var(--line)}
.rk-no{font-family:var(--disp);font-size:15px;color:var(--accent);font-weight:600;flex:0 0 30px}
.rk-dim{flex:1;display:flex;flex-direction:column;gap:6px}
.rk-k{font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:var(--mut);font-weight:700}
.rk-nm{font-family:var(--disp);font-size:21px;font-weight:600;letter-spacing:-.01em}
.rk-v{font-family:var(--disp);font-size:20px;font-weight:600;color:var(--accent);flex:0 0 auto}
/* COMPARISON · barsRow — горизонтальные мини-полосы по метрикам (факт. величины) */
.cmp-bars .br-group{margin:10px 0 22px}
.br-k{font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:var(--mut);font-weight:700;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--line)}
.br-row{display:flex;align-items:center;gap:14px;padding:7px 0}
.br-nm{flex:0 0 26%;font-size:13.5px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.br-track{flex:1;height:10px;background:var(--tint);border-radius:100px;overflow:hidden}
.br-track i{display:block;height:100%;background:color-mix(in srgb,var(--accent) 38%,var(--tint));border-radius:100px}
.br-row.best .br-track i{background:var(--accent)}
.br-v{flex:0 0 auto;font-family:var(--disp);font-size:14px;font-weight:600;min-width:96px;text-align:right}
.br-row.best .br-v{color:var(--accent)}
.br-bi{flex:0 0 52px;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);font-style:normal;text-align:right}
/* RECOMMENDATION · sidebarNote — заметка на полях: сайдбар с подписью + аннотированные пункты */
.rec-sidenote{display:grid;grid-template-columns:.42fr .58fr;gap:44px;align-items:start}
.rec-sidenote .sn-side{border-right:1px solid var(--line);padding-right:34px}
.rec-sidenote .sn-side .rc-sign{margin-top:22px}
.rec-sidenote .sn-cta{font-size:14px;color:var(--mut);line-height:1.6;margin-top:24px}
.rec-sidenote .sn-open{font-family:var(--disp);font-size:25px;line-height:1.3;font-weight:500;letter-spacing:-.01em;margin-bottom:24px}
.rec-sidenote .sn-pts{border-top:1px solid var(--line)}
.rec-sidenote .sn-p{padding:18px 0;border-bottom:1px solid var(--line)}
.rec-sidenote .sn-k{font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:var(--accent);font-weight:700;display:block;margin-bottom:7px}
.rec-sidenote .sn-p p{font-size:15px;line-height:1.6}
@media(max-width:640px){.rec-sidenote{grid-template-columns:1fr;gap:24px}.rec-sidenote .sn-side{border-right:0;border-bottom:1px solid var(--line);padding:0 0 22px}}
/* RECOMMENDATION · pickCard — «с чего начать»: карточка-лидер по фактам (не зелёный бокс) */
.rec-pick .pk-card{border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:var(--radius);padding:26px 32px;margin:6px 0 18px;background:var(--tint)}
.rec-pick .pk-h{display:flex;align-items:baseline;gap:16px;flex-wrap:wrap;padding-bottom:16px;border-bottom:1px solid var(--line);margin-bottom:14px}
.rec-pick .pk-nm{font-family:var(--disp);font-size:26px;font-weight:600;letter-spacing:-.01em}
.rec-pick .pk-mt{font-size:12px;color:var(--mut);letter-spacing:.06em;text-transform:uppercase}
.rec-pick .pk-pr{font-family:var(--disp);font-size:19px;font-weight:600;color:var(--accent);margin-left:auto}
.rec-pick .pk-why{list-style:none;margin:0}
.rec-pick .pk-why li{padding:9px 0 9px 24px;font-size:15px;line-height:1.5;position:relative}
.rec-pick .pk-why li::before{content:"";position:absolute;left:0;top:14px;width:12px;height:1px;background:var(--accent)}
.rec-pick .pk-rest{font-size:14px;color:var(--mut);line-height:1.6;margin-top:8px}.rec-pick .pk-rest b{color:var(--ink);font-weight:600}
/* ---- print ---- */
@media print{
  body{background:#fff}
  .doc{max-width:none;padding:0}
  .page{box-shadow:none;margin:0;min-height:auto;page-break-after:always;break-after:page}
  .page:last-child{page-break-after:auto}
  /* полностраничные (full-bleed) роли заполняют A4 целиком; текстовые — по контенту */
  .cover,.opener,.op-split,.cv-sv,.bk-band,.bk-plate{min-height:0;height:100vh}
  .bk-plate{display:flex}
  /* атомарные блоки не рвём между границами A4 */
  .mrail,.pt-track,.pt-svg,.pay,.pay-one,.fplan,.fp-cell,.cmpc,.units tr,.th,.cc-item,.cc-lr,.dt-r,.pf-t,.pf-pil,.ns-step,.ns-sr,.ns-cta,.ag-facts,.ag-min-head,.rc-sign,.rec-inline,.why li,.rk-row,.br-group,.sn-p,.pk-card,.fg-stage,.rail-side,.dl-thumb,.ix-r{break-inside:avoid;page-break-inside:avoid}
  .h2,.po-h,.cv-h,.op-h,.ag-h,.pf-intro{break-after:avoid;page-break-after:avoid}
  /* Ф4 · плотность проектных страниц ТОЛЬКО для печати: «1.4-страничный» проект укладываем в один полный A4,
     чтобы не оставлять полупустой хвост следующего листа. Экран (?design=1 без print) не меняется. */
  .po{padding-top:36px;padding-bottom:28px}
  /* при плотной укладке абсолютный футер наезжал на контент — переводим футер проектных страниц В ПОТОК
     (как у текстовых .pg-страниц): он сам резервирует место, наезд физически невозможен */
  .po .pg-foot{position:static;left:auto;right:auto;bottom:auto;margin-top:14px;padding-top:9px}
  .page.po-single .pg-foot{margin-left:var(--pad-x);margin-right:var(--pad-x)}
  .po-single .po-hero{height:276px}
  .po-single.domhi .po-hero{height:330px}
  .po-single .po-head{margin-top:20px}
  .po-head{margin-bottom:14px}.po-h{margin-top:6px}
  .me-split{gap:24px;margin-bottom:4px}
  .me-r .me-img{height:150px;margin-bottom:12px}
  /* metricEditorial: правый столбец (фото+рельса метрик) — доминанта высоты; ужимаем ровно чтобы влезть в один A4 */
  .po-me .me-r .me-img{height:106px;margin-bottom:10px}
  .po-me .mrail.stack .mr{padding:6px 14px}
  /* Ф1+ · новые проектные грамматики: ужимаем крупные фото под один A4 */
  .po-fg .fg-stage{height:300px;margin-bottom:16px}
  .po-fg .fg-card{padding:20px 26px}
  .po-rail .rail-img{height:210px;margin-bottom:14px}
  .po-rail .rail-split{gap:26px}
  .po-data .dl-img{height:150px}
  .po-data .dl-top{gap:26px;margin-bottom:4px}
  .po-data .dl-cols{gap:26px}
  .lede{margin-bottom:12px;line-height:1.5}
  /* планы/генплан: ниже для печати; у gallery-страницы (её план уезжает на 2-й полный лист) оставляем крупнее */
  .fp-img{height:200px}
  .fp-grid.fp-2 .fp-img,.fp-grid.fp-3 .fp-img{height:160px}
  .po-gal .fp-img{height:270px}
  .po-gal .fp-grid.fp-2 .fp-img,.po-gal .fp-grid.fp-3 .fp-img{height:210px}
  /* трим крупных вертикальных отступов и рядов блоков (печать) */
  .mrail{margin:6px 0 14px}
  .mrail.row .mr{padding:14px 20px 14px 0}
  .mrail.stack .mr{padding:10px 15px}
  .pay{margin:8px 0 12px}
  .pt-track{padding-top:4px}.pt-pct{font-size:22px;margin-top:8px}.pt-bar{margin:12px 0 8px}
  .pay-one .po-one{padding:12px 0}
  .fplan{margin:10px 0 14px}
  .loc{margin:4px 0 12px}.loc-b{margin-bottom:10px}.dt-r{padding:7px 0}
  .units{margin:8px 0 12px}.units td{padding:9px 12px}
  .rec-inline{margin:8px 0 12px;padding-left:18px}
  .why li{padding:6px 0 6px 32px}
  .amen{margin:4px 0 10px}.amen-c{padding:5px 12px}
  @page{size:A4;margin:0}
}
.recompose-bar{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);display:flex;gap:8px;background:rgba(12,14,22,.9);backdrop-filter:blur(14px);padding:8px 10px 8px 16px;border-radius:100px;box-shadow:0 18px 50px -18px rgba(0,0,0,.6);z-index:50;align-items:center}
.recompose-bar span{color:#fff;font-size:12.5px;letter-spacing:.02em;font-family:${F.meta}}
.recompose-bar b{color:#fff;font-weight:600}
.recompose-bar button{border:0;background:#fff;color:#111;font:inherit;font-size:12.5px;font-weight:600;padding:9px 16px;border-radius:100px;cursor:pointer}
.recompose-bar a{color:rgba(255,255,255,.65);font-size:12.5px;text-decoration:none;padding:0 6px}
@media print{.recompose-bar{display:none}}
/* Ф3 · пер-проектные контролы (только edit-режим) */
.blk-ctl{position:absolute;top:14px;right:14px;z-index:41;display:flex;gap:7px}
.bc-btn{width:36px;height:36px;border-radius:50%;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-size:15px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 22px -10px rgba(0,0,0,.5);opacity:.42;transition:opacity .15s,transform .12s}
.bc-btn:hover{transform:translateY(-1px)}
.page:hover .bc-btn{opacity:1}
.bc-btn.on{background:var(--accent);color:#fff;border-color:var(--accent);opacity:1}
@media print{.blk-ctl{display:none!important}}
`;

  const canEdit = opts.canEdit;
  const bar = (canEdit && !isPrint) ? `<div class="recompose-bar"><span><b>${esc(dna.styleName)}</b> · ${dna.ax.density} · фото ${dna.ax.imageDom}</span><button id="recompose">Другой вариант</button><a href="/p/${c.id}?design=1&print=1" target="_blank">Печать / PDF</a></div>
<script>(function(){var k='${esc(opts.key || '')}';var b=document.getElementById('recompose');if(b)b.onclick=function(){b.textContent='…';fetch('/api/collections/${c.id}/recompose?key='+k,{method:'POST'}).then(function(r){return r.json()}).then(function(){location.reload()}).catch(function(){location.reload()})};
document.addEventListener('click',function(ev){var t=ev.target.closest('[data-bact]');if(!t)return;var w=t.closest('[data-proj]');if(!w)return;var proj=w.getAttribute('data-proj'),act=t.getAttribute('data-bact');t.textContent='…';fetch('/api/collections/${c.id}/block?key='+k,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({proj:proj,action:act})}).then(function(r){return r.json()}).then(function(){location.reload()}).catch(function(){location.reload()})});})();</script>` : '';

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

module.exports = { renderDesignDoc, deriveDNA, artDirect, blockOp, planSig, hashStr, AXES };
