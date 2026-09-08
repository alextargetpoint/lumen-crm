'use strict';
/* ============================================================================
   AI DESIGN ENGINE — «Студия» (Studio AI)
   Отделяет ТВОРЧЕСКИЙ ИНТЕЛЛЕКТ от РЕНДЕРА (см. ТЗ, принцип №3).
     Креативный директор → ArtDirectionPlan (+ сжатый копирайт)
       → грамматики композиции → редактируемый СЦЕН-ГРАФ (нативные слои)
       → детерминированный рендер (/car, renderCarLayers)
       → скриншот → визуальный критик → правки сцен-графа → рендер снова.
   Рендер НЕ придумывает дизайн: он воспроизводит слои. Всё творческое — здесь.

   Провайдеры вынесены в абстракцию (Provider*), чтобы модели можно было менять.
   ============================================================================ */
const llm = require('./llm');

/* ── Провайдер-абстракция (позже можно подменить модель/вендора) ────────────── */
const Providers = {
  creativeDirector: (prompt, ms, tok) => llm.callGemini(prompt, ms || 40000, tok || 4200),
  visionInterpret: (parts, tok) => llm.callGeminiVision(parts, tok || 2600),
  visionCritic: (parts, tok) => llm.callGeminiVision(parts, tok || 1800),
  visualGen: (prompt, opts) => llm.generateImage(prompt, opts),          /* растровый визуальный таргет */
  hasVisual: () => llm.hasOpenAI(),
  hasVision: () => llm.hasGemini(),
};

/* ── Дизайн-токены: палитра + типографские роли (Cyrillic-safe) ──────────────
   Директор возвращает палитру; здесь достраиваем недостающее дефолтами.        */
const hex = (v, d) => /^#[0-9a-fA-F]{3,8}$/.test(String(v || '')) ? v : d;
function resolveTokens(plan) {
  const p = (plan && plan.palette) || {};
  const paper = hex(p.paper, '#F2ECE3'), ink = hex(p.ink, '#211E17');
  const accent = hex(p.accent, '#C3A24E');
  const T = {
    paper, ink, accent,
    mut: hex(p.mut, '#8C806C'),
    line: hex(p.line, '#D9D0C1'),
    darkBg: hex(p.darkBg, '#1B2316'),
    darkInk: hex(p.darkInk, '#F3EFE4'),
    darkMut: hex(p.darkMut, '#B7B1A0'),
    darkLine: 'rgba(255,255,255,.32)',
    darkAccent: hex(p.darkAccent, accent),
    onImg: '#FFFFFF', onImgMut: 'rgba(255,255,255,.82)', onImgLine: 'rgba(255,255,255,.66)',
    display: plan && plan.display === 'modern' ? 'modern' : 'serif',
  };
  return T;
}
/* карусель-уровень: тема (для --disp/фолбэка) + шрифт по роли дисплея (Cyrillic-safe) */
function carouselTheme(T) { return { theme: 'champagne', font: T.display === 'modern' ? 'manrope' : 'playfair' }; }

/* ── Геометрия (портрет 1080×1350). x/w в % ширины, y/h в % высоты. fs в cqw. ── */
const MX = 6.6;                                     /* левое поле, %W */
const CW = 1080, CH = 1350;                         /* канвас портрета */
/* оценка числа строк: fs в cqw(=% ширины), w в %W. Ширина кегля зависит от гарнитуры
   (сериф-дисплей шире гротеска) и letter-spacing (капс-рубрики). */
function charFactor(ff, ls, up) { const base = ff === 'disp' ? 0.585 : 0.505; return base + (ls || 0) * (up ? 1.0 : 0.85); }
function estLines(text, wPct, fsCqw, ff, ls, up) {
  const px = (fsCqw / 100) * CW;
  const cpl = Math.max(4, (wPct / 100 * CW) / (px * charFactor(ff, ls, up)));
  const words = String(text || '').split(/\s+/);
  let line = 0, lines = 1;
  for (const w of words) { const add = (line ? 1 : 0) + w.length; if (line + add > cpl) { lines++; line = w.length; } else line += add; }
  return Math.max(1, lines);
}
/* высота текст-блока в %H */
function blockH(b) { return estLines(b.text, b.w, b.fs, b.ff, b.ls, b.up) * (b.fs / 100 * CW) * (b.lh || 1.1) / CH * 100; }
/* авто-масштаб текста: уменьшаем fs, пока не влезет в maxLines (учёт гарнитуры/трекинга) */
function fitHead(text, wPct, fs, maxLines, minFs, ff, ls, up) { let f = fs; while (estLines(text, wPct, f, ff || 'disp', ls, up) > maxLines && f > (minFs || 3.4)) f -= 0.2; return +f.toFixed(2); }
/* fit рубрики (капс) в 1 строку по ширине */
function fitEyebrow(text, wPct, fs, ls) { return fitHead(text, wPct, fs, 1, 0.85, 'sans', ls, true); }
/* вертикальный поток блоков сверху вниз — НЕТ коллизий. */
function flowDown(L, startY, blocks) {
  let y = startY;
  for (const b of blocks) {
    if (!b || (b.text == null || b.text === '')) continue;
    y += b.gap || 0;
    L.push({ t: 'text', text: b.text, ff: b.ff || 'sans', fs: b.fs, lh: b.lh || 1.1, wt: b.wt, ls: b.ls, up: b.up ? 1 : 0, color: b.color, op: b.op, x: b.x != null ? b.x : MX, y: +y.toFixed(2), w: b.w, al: b.al, z: b.z || 5 });
    y += blockH(b);
  }
  return y;
}
/* суммарная высота потока (для нижнего якоря) */
function flowH(blocks) { let h = 0; for (const b of blocks) { if (!b || b.text == null || b.text === '') continue; h += (b.gap || 0) + blockH(b); } return h; }

/* ── Брендовые элементы (общие) ─────────────────────────────────────────────── */
function wordmark(L, T, ctx, corner, color) {
  const right = corner === 'tr';
  const x = right ? 66 : MX, w = 28, al = right ? 'right' : 'left';
  L.push({ t: 'text', text: ctx.wordmark.name, ff: 'disp', fs: 2.05, ls: right ? 0.16 : 0.16, color, x, y: 4.4, w, al, up: 1, wt: 500, z: 6 });
  if (ctx.wordmark.tag) L.push({ t: 'text', text: ctx.wordmark.tag, ff: 'sans', fs: 0.98, ls: 0.34, up: 1, color, op: 82, x, y: 7.0, w, al, z: 6 });
}
function pageNum(L, ctx, color, corner) {
  const right = corner !== 'tl';
  L.push({ t: 'text', text: ctx.pageNum, ff: 'sans', up: 1, fs: 1.2, ls: 0.16, color, op: 78, x: right ? 74 : MX, y: 5.0, w: 20, al: right ? 'right' : 'left', z: 6 });
}
/* нижний ряд-подпись: тонкая линейка + капс-текст + опц. круг-стрелка */
function captionRow(L, text, T, on, onl, arrow) {
  const y = 88;
  L.push({ t: 'line', color: onl, th: 1, x: MX, y: y + 1.4, w: 5.5, z: 6 });
  if (text) L.push({ t: 'text', text, ff: 'sans', up: 1, fs: 1.18, ls: 0.14, color: on, op: 88, x: MX + 7.5, y, w: 52, lh: 1.3, z: 6 });
  if (arrow) { L.push({ t: 'shape', shape: 'ring', color: on, x: 82, y: 84.5, w: 11, z: 6 }); L.push({ t: 'icon', key: 'arrow', color: on, sw: 1.5, x: 85.1, y: 88.0, w: 4.6, z: 7 }); }
}
function footerMark(L, T, ctx, color, line, extraRight) {
  const y = 91.5;
  L.push({ t: 'text', text: (ctx.wordmark.name + ' ' + (ctx.wordmark.tag || '')).trim(), ff: 'sans', up: 1, fs: 1.02, ls: 0.2, color, op: 78, x: MX, y, w: 44, z: 6 });
  L.push({ t: 'line', color: line, th: 1, x: MX + 26, y: y + 0.9, w: 12, z: 6 });
  if (extraRight) L.push({ t: 'text', text: extraRight, ff: 'sans', up: 1, fs: 0.95, ls: 0.14, color, op: 70, x: 60, y: y - 0.4, w: 34, al: 'right', lh: 1.35, z: 6 });
}
/* тёмный скрим фото (верх+низ) для читаемости светлого текста */
function photoScrims(L, opt) {
  const o = opt || {};
  L.push({ t: 'grad', gd: 'ttb', from: '#0b0f16b0', to: '#0b0f1600', x: 0, y: 0, w: 100, h: o.topH || 24, z: 1 });
  L.push({ t: 'grad', gd: 'btt', from: o.bottom || '#0b0f16f0', to: '#0b0f1600', x: 0, y: o.botY || 34, w: 100, h: 100 - (o.botY || 34), z: 1 });
}

/* ════════════════════ ГРАММАТИКИ КОМПОЗИЦИИ (не шаблоны) ════════════════════
   Каждая грамматика получает (S=слайд-план, T=токены, ctx) и возвращает
   {bg|bgc|grad, layers[]}. Реальный копирайт и реальные фото проекта.        */

/* 1. CINEMATIC_HERO — фото на весь кадр, эмоциональный крючок, низ-лефт (текст нижним якорем) */
function CINEMATIC_HERO(S, T, ctx) {
  const L = []; const on = T.onImg, onm = T.onImgMut, onl = T.onImgLine;
  if (ctx.photo) L.push({ t: 'img', url: ctx.photo, x: 0, y: 0, w: 100, h: 100, fit: 'cover', ox: S.ox != null ? S.ox : 50, oy: S.oy != null ? S.oy : 50, z: 0 });
  photoScrims(L, { botY: 28, bottom: '#0a0e14f2' });
  wordmark(L, T, ctx, 'tl', on); pageNum(L, ctx, on, 'tr');
  const hfs = fitHead(S.headline, 78, 7.4, 3, 5.2);
  const stack = [
    S.eyebrow && { text: S.eyebrow, ff: 'sans', up: 1, fs: 1.4, ls: 0.26, color: onm, w: 74, gap: 0 },
    { text: S.headline, ff: 'disp', fs: hfs, lh: 1.03, wt: 500, color: on, w: 78, gap: 1.6 },
    S.sub && { text: S.sub, ff: 'sans', fs: 1.95, lh: 1.4, color: onm, w: 52, gap: 2.2 },
  ].filter(Boolean);
  flowDown(L, 82 - flowH(stack), stack);          /* нижний якорь: заканчиваем у ~82%H, над caption-рядом */
  captionRow(L, S.caption, T, on, onl, true);
  return { layers: L };
}

/* 2. EDITORIAL_LIGHT — светлый разворот: сериф-заголовок сверху-слева, фото снизу-справа, иконный список */
function EDITORIAL_LIGHT(S, T, ctx) {
  const L = []; const ink = T.ink, mut = T.mut, acc = T.accent, line = T.line;
  pageNum(L, ctx, mut, 'tr');
  L.push({ t: 'text', text: S.eyebrow || '', ff: 'sans', up: 1, fs: 1.3, ls: 0.24, color: mut, x: MX, y: 5.6, w: 42, z: 5 });
  L.push({ t: 'line', color: line, th: 1, x: MX, y: 9.6, w: 26, z: 5 });
  const hfs = fitHead(S.headline, 44, 6.2, 4, 4.2);
  const stack = [
    { text: S.headline, ff: 'disp', fs: hfs, lh: 1.05, wt: 500, color: ink, w: 44, gap: 0 },
    S.sub && { text: S.sub, ff: 'sans', fs: 1.85, lh: 1.42, color: mut, w: 40, gap: 2.6 },
  ].filter(Boolean);
  const afterY = flowDown(L, 13.5, stack);
  /* фото — крупный правый столбец, НЕ перекрывает текст слева (текст w≤44, фото x≥50) */
  if (ctx.photo) L.push({ t: 'img', url: ctx.photo, x: 50, y: 13.5, w: 50, h: 50, fit: 'cover', ox: S.ox != null ? S.ox : 50, oy: S.oy != null ? S.oy : 50, round: 2, z: 3 });
  /* иконный список слева, ниже подзаголовка */
  const rows = (S.rows || []).slice(0, 3);
  let ry = Math.max(afterY + 4, 52);
  rows.forEach(r => {
    L.push({ t: 'icon', key: r.icon || 'award', color: acc, sw: 1.5, x: MX, y: ry, w: 5.4, z: 5 });
    L.push({ t: 'text', text: r.label || r.big || '', ff: 'sans', fs: 1.75, lh: 1.2, wt: 600, color: ink, x: MX + 8, y: ry + 0.9, w: 40, z: 5 });
    ry += 8.2;
  });
  footerMark(L, T, ctx, mut, line);
  return { bgc: T.paper, layers: L };
}

/* 3. IMAGE_CAPTION — фото-hero (интерьер), светлый текст нижним якорем, подпись снизу */
function IMAGE_CAPTION(S, T, ctx) {
  const L = []; const on = T.onImg, onm = T.onImgMut, onl = T.onImgLine;
  if (ctx.photo) L.push({ t: 'img', url: ctx.photo, x: 0, y: 0, w: 100, h: 100, fit: 'cover', ox: S.ox != null ? S.ox : 50, oy: S.oy != null ? S.oy : 50, z: 0 });
  photoScrims(L, { topH: 22, botY: 36, bottom: '#0a0e14ec' });
  wordmark(L, T, ctx, 'tr', on); pageNum(L, ctx, on, 'tl');
  const hfs = fitHead(S.headline, 74, 6.7, 3, 4.6);
  const stack = [
    S.eyebrow && { text: S.eyebrow, ff: 'sans', up: 1, fs: 1.36, ls: 0.26, color: onm, w: 60, gap: 0 },
    { text: S.headline, ff: 'disp', fs: hfs, lh: 1.04, wt: 500, color: on, w: 74, gap: 1.6 },
    S.sub && { text: S.sub, ff: 'sans', fs: 1.9, lh: 1.4, color: onm, w: 54, gap: 2.2 },
  ].filter(Boolean);
  flowDown(L, 82 - flowH(stack), stack);
  captionRow(L, S.caption, T, on, onl, true);
  return { layers: L };
}

/* 4. LOCATION_STORY — фото (пляж/локация), заголовок + ряды дистанций */
function LOCATION_STORY(S, T, ctx) {
  const L = []; const on = T.onImg, onm = T.onImgMut, onl = T.onImgLine, acc = T.darkAccent;
  if (ctx.photo) L.push({ t: 'img', url: ctx.photo, x: 0, y: 0, w: 100, h: 100, fit: 'cover', ox: S.ox != null ? S.ox : 50, oy: S.oy != null ? S.oy : 50, z: 0 });
  L.push({ t: 'grad', gd: 'btt', from: '#0a0e14f2', to: '#0a0e1433', x: 0, y: 0, w: 100, h: 100, z: 1 });
  pageNum(L, ctx, on, 'tl');   /* рубрика справа → номер слева (иначе накладываются) */
  L.push({ t: 'text', text: S.eyebrow || '', ff: 'sans', up: 1, fs: fitEyebrow(S.eyebrow || '', 46, 1.28, 0.18), ls: 0.18, color: onm, x: 48, y: 5.4, w: 46, al: 'right', z: 5 });
  const hfs = fitHead(S.headline, 60, 6.0, 3, 4.4);
  const stack = [
    { text: S.headline, ff: 'disp', fs: hfs, lh: 1.05, wt: 500, color: on, w: 60, gap: 0 },
    S.sub && { text: S.sub, ff: 'sans', fs: 1.85, lh: 1.4, color: onm, w: 48, gap: 2.4 },
  ].filter(Boolean);
  const afterY = flowDown(L, 30, stack);
  /* ряды дистанций: иконка + крупное «N мин» + подпись */
  const rows = (S.rows || []).slice(0, 4);
  let ry = Math.max(afterY + 3, 60);
  rows.forEach(r => {
    L.push({ t: 'icon', key: r.icon || 'pin', color: on, sw: 1.5, x: MX, y: ry, w: 5.0, z: 5 });
    L.push({ t: 'text', text: r.big || '', ff: 'sans', fs: 2.0, wt: 700, color: on, x: MX + 7.5, y: ry - 0.3, w: 42, z: 5 });
    L.push({ t: 'text', text: r.label || '', ff: 'sans', fs: 1.24, color: onm, x: MX + 7.5, y: ry + 2.7, w: 42, z: 5 });
    ry += 7.2;
  });
  footerMark(L, T, ctx, on, onl);
  return { layers: L };
}

/* 5. DATA_HERO — тёмный фон, гигантское число-акцент + колонки фактов + CTA */
function DATA_HERO(S, T, ctx) {
  const L = []; const on = T.darkInk, onm = T.darkMut, acc = T.darkAccent, line = T.darkLine;
  if (ctx.photo) { L.push({ t: 'img', url: ctx.photo, x: 0, y: 0, w: 100, h: 100, fit: 'cover', op: 22, filter: 'dark', z: 0 }); L.push({ t: 'grad', gd: 'ttb', from: '#0a0e14cc', to: '#0a0e1466', x: 0, y: 0, w: 100, h: 100, z: 1 }); }
  pageNum(L, ctx, onm, 'tl');   /* рубрика справа → номер слева (иначе накладываются) */
  L.push({ t: 'text', text: S.eyebrow || '', ff: 'sans', up: 1, fs: fitEyebrow(S.eyebrow || '', 46, 1.28, 0.18), ls: 0.18, color: onm, x: 48, y: 5.4, w: 46, al: 'right', z: 5 });
  const hv = (S.hero && S.hero.value) || S.headline;
  const numFs = fitHead(hv, 84, 15.5, 1, 8.5);
  const stack = [
    S.kicker && { text: S.kicker, ff: 'sans', up: 1, fs: 1.85, ls: 0.14, color: on, w: 60, gap: 0 },
    { text: hv, ff: 'disp', fs: numFs, lh: 0.92, wt: 500, color: acc, w: 84, gap: 1.4 },
    S.sub && { text: S.sub, ff: 'sans', fs: 1.95, lh: 1.4, color: on, op: 92, w: 58, gap: 2.2 },
  ].filter(Boolean);
  flowDown(L, 31, stack);
  /* колонки фактов: значение + 2-строчная подпись, разделители */
  const facts = (S.facts || []).slice(0, 3);
  if (facts.length) {
    const colW = 27, gap = 2.5, y0 = 66;
    facts.forEach((f, i) => {
      const cx = MX + i * (colW + gap);
      if (i > 0) L.push({ t: 'line', color: line, th: 1, vert: 1, h: 11, x: cx - gap / 2, y: y0, z: 5 });
      L.push({ t: 'text', text: f.v || '', ff: 'disp', fs: 4.2, wt: 500, color: acc, x: cx, y: y0, w: colW, z: 5 });
      L.push({ t: 'text', text: f.label || '', ff: 'sans', up: 1, fs: 1.12, ls: 0.08, lh: 1.35, color: onm, x: cx, y: y0 + 5.2, w: colW, z: 5 });
    });
  }
  if (S.cta) L.push({ t: 'btn', text: S.cta, style: 'outline', color: acc, tcolor: on, arrow: true, up: 1, fs: 1.65, ls: 0.12, x: MX, y: 82, z: 6 });
  footerMark(L, T, ctx, onm, line);
  return { bgc: T.darkBg, layers: L };
}

/* 6. CINEMATIC_CTA — фото-закат, тихий финал + CTA-пилюля + координаты */
function CINEMATIC_CTA(S, T, ctx) {
  const L = []; const on = T.onImg, onm = T.onImgMut, onl = T.onImgLine;
  if (ctx.photo) L.push({ t: 'img', url: ctx.photo, x: 0, y: 0, w: 100, h: 100, fit: 'cover', ox: S.ox != null ? S.ox : 50, oy: S.oy != null ? S.oy : 55, z: 0 });
  photoScrims(L, { topH: 22, botY: 30, bottom: '#0a0e14f2' });
  wordmark(L, T, ctx, 'tr', on); pageNum(L, ctx, on, 'tl');
  const hfs = fitHead(S.headline, 66, 6.6, 3, 4.6);
  const stack = [
    S.eyebrow && { text: S.eyebrow, ff: 'sans', up: 1, fs: 1.38, ls: 0.24, color: onm, w: 64, gap: 0 },
    { text: S.headline, ff: 'disp', fs: hfs, lh: 1.04, wt: 500, color: on, w: 66, gap: 1.6 },
    S.sub && { text: S.sub, ff: 'sans', fs: 1.9, lh: 1.4, color: onm, w: 56, gap: 2.2 },
  ].filter(Boolean);
  const endY = flowDown(L, 62, stack);
  if (S.cta) L.push({ t: 'btn', text: S.cta, style: 'outline', color: on, tcolor: on, arrow: true, up: 1, fs: 1.55, ls: 0.12, x: MX, y: Math.min(endY + 2.5, 83), z: 6 });
  footerMark(L, T, ctx, on, onl, S.coords || '');
  return { layers: L };
}

/* 7. AMENITIES_GRID — сетка удобств (иконка + название + описание), 2 колонки. Светлая или тёмная. */
function AMENITIES_GRID(S, T, ctx) {
  const dark = S.tone === 'dark';
  const L = []; const ink = dark ? T.darkInk : T.ink, mut = dark ? T.darkMut : T.mut, acc = dark ? T.darkAccent : T.accent, line = dark ? T.darkLine : T.line;
  pageNum(L, ctx, mut, 'tr');
  L.push({ t: 'text', text: S.eyebrow || 'ИНФРАСТРУКТУРА', ff: 'sans', up: 1, fs: 1.3, ls: 0.24, color: mut, x: MX, y: 5.6, w: 44, z: 5 });
  L.push({ t: 'line', color: line, th: 1, x: MX, y: 9.6, w: 26, z: 5 });
  const hfs = fitHead(S.headline || 'Всё для жизни рядом', 62, 5.6, 3, 4.0);
  const afterY = flowDown(L, 13.5, [{ text: S.headline || 'Всё для жизни рядом', ff: 'disp', fs: hfs, lh: 1.05, wt: 500, color: ink, w: 62, gap: 0 }]);
  const rows = (S.rows && S.rows.length ? S.rows : (S.facts || [])).slice(0, 6);
  const cols = 2, colW = 44, gx = 4, startY = Math.max(afterY + 5, 36), rowH = (92 - startY) / Math.ceil(rows.length / cols);
  rows.forEach((r, i) => {
    const cx = MX + (i % cols) * (colW + gx), cy = startY + Math.floor(i / cols) * rowH;
    L.push({ t: 'icon', key: r.icon || 'award', color: acc, sw: 1.5, x: cx, y: cy, w: 5.4, z: 5 });
    L.push({ t: 'text', text: r.label || r.big || r.v || '', ff: 'sans', fs: 1.7, lh: 1.15, wt: 600, color: ink, x: cx, y: cy + 6.5, w: colW - 2, z: 5 });
    if (r.big && r.label) L.push({ t: 'text', text: r.big, ff: 'sans', fs: 1.3, lh: 1.3, color: mut, x: cx, y: cy + 10.2, w: colW - 2, z: 5 });
  });
  footerMark(L, T, ctx, mut, line);
  return { bgc: dark ? T.darkBg : T.paper, layers: L };
}

/* 8. GALLERY_TRIPTYCH — «типы объектов»: ряд из 3-4 фото с подписями (как редакторская витрина). */
function GALLERY_TRIPTYCH(S, T, ctx) {
  const L = []; const ink = T.ink, mut = T.mut, acc = T.accent, line = T.line;
  pageNum(L, ctx, mut, 'tr');
  L.push({ t: 'text', text: S.eyebrow || '', ff: 'sans', up: 1, fs: 1.3, ls: 0.24, color: mut, x: MX, y: 5.6, w: 44, z: 5 });
  const hfs = fitHead(S.headline || 'Форматы резиденций', 80, 5.4, 2, 4.0);
  L.push({ t: 'text', text: S.headline || 'Форматы резиденций', ff: 'disp', fs: hfs, lh: 1.04, wt: 500, color: ink, x: MX, y: 10, w: 80, z: 5 });
  const gal = (ctx.gallery && ctx.gallery.length ? ctx.gallery : (ctx.photo ? [ctx.photo] : [])).slice(0, 4);
  const labels = (S.rows || S.facts || []).map(r => r.label || r.v || r.big || '');
  const n = Math.max(1, gal.length), gap = 2.5, totalW = 88, cardW = (totalW - gap * (n - 1)) / n, y0 = 30, cardH = 44;
  gal.forEach((url, i) => {
    const cx = MX + i * (cardW + gap);
    L.push({ t: 'img', url, x: cx, y: y0, w: cardW, h: cardH, fit: 'cover', round: 3, z: 3 });
    if (labels[i]) L.push({ t: 'text', text: labels[i], ff: 'sans', up: 1, fs: 1.15, ls: 0.08, wt: 600, color: ink, x: cx, y: y0 + cardH + 2, w: cardW + 2, z: 4 });
  });
  if (S.sub) L.push({ t: 'text', text: S.sub, ff: 'sans', fs: 1.85, lh: 1.4, color: mut, x: MX, y: 84, w: 62, z: 5 });
  footerMark(L, T, ctx, mut, line);
  return { bgc: T.paper, layers: L };
}

/* 9. TYPOGRAPHIC_STATEMENT — тихий типографский разворот без фото (пауза в ритме). */
function TYPOGRAPHIC_STATEMENT(S, T, ctx) {
  const dark = S.tone === 'dark';
  const L = []; const ink = dark ? T.darkInk : T.ink, mut = dark ? T.darkMut : T.mut, acc = dark ? T.darkAccent : T.accent, line = dark ? T.darkLine : T.line;
  pageNum(L, ctx, mut, 'tr');
  L.push({ t: 'line', color: acc, th: 2, x: MX, y: 26, w: 8, z: 5 });
  if (S.eyebrow) L.push({ t: 'text', text: S.eyebrow, ff: 'sans', up: 1, fs: 1.3, ls: 0.24, color: mut, x: MX, y: 30, w: 60, z: 5 });
  const hfs = fitHead(S.headline || '', 82, 8.4, 4, 4.6);
  const stack = [
    { text: S.headline || '', ff: 'disp', fs: hfs, lh: 1.03, wt: 500, color: ink, w: 82, gap: S.eyebrow ? 3 : 0 },
    S.sub && { text: S.sub, ff: 'sans', fs: 1.95, lh: 1.45, color: mut, w: 58, gap: 3 },
  ].filter(Boolean);
  flowDown(L, S.eyebrow ? 34 : 34, stack);
  footerMark(L, T, ctx, mut, line);
  return { bgc: dark ? T.darkBg : T.paper, layers: L };
}

/* 10. PAYMENT_TIMELINE — план оплаты как горизонтальный таймлайн (этап: % + подпись). */
function PAYMENT_TIMELINE(S, T, ctx) {
  const dark = S.tone !== 'light';
  const L = []; const ink = dark ? T.darkInk : T.ink, mut = dark ? T.darkMut : T.mut, acc = dark ? T.darkAccent : T.accent, line = dark ? T.darkLine : T.line;
  if (dark && ctx.photo) { L.push({ t: 'img', url: ctx.photo, x: 0, y: 0, w: 100, h: 100, fit: 'cover', op: 18, filter: 'dark', z: 0 }); }
  pageNum(L, ctx, mut, 'tr');
  L.push({ t: 'text', text: S.eyebrow || 'ПЛАН ОПЛАТЫ', ff: 'sans', up: 1, fs: 1.3, ls: 0.24, color: mut, x: MX, y: 5.6, w: 44, z: 5 });
  const hfs = fitHead(S.headline || 'Гибкая рассрочка', 70, 5.6, 2, 4.0);
  L.push({ t: 'text', text: S.headline || 'Гибкая рассрочка', ff: 'disp', fs: hfs, lh: 1.05, wt: 500, color: ink, x: MX, y: 11, w: 70, z: 5 });
  if (S.sub) L.push({ t: 'text', text: S.sub, ff: 'sans', fs: 1.85, lh: 1.4, color: mut, x: MX, y: 26, w: 58, z: 5 });
  const stages = (S.facts && S.facts.length ? S.facts : (S.rows || [])).slice(0, 4);
  const n = Math.max(1, stages.length), y0 = 52, span = 88, step = span / n;
  L.push({ t: 'line', color: line, th: 1, x: MX + 1, y: y0 + 1.6, w: span - step + 2, z: 4 });   /* соединительная линия */
  stages.forEach((s, i) => {
    const cx = MX + i * step;
    L.push({ t: 'shape', shape: 'circle', color: acc, fill: true, x: cx, y: y0, w: 2.4, z: 5 });
    L.push({ t: 'text', text: s.v || s.big || '', ff: 'disp', fs: 4.0, wt: 500, color: acc, x: cx, y: y0 + 5, w: step - 2, z: 5 });
    L.push({ t: 'text', text: s.label || '', ff: 'sans', up: 1, fs: 1.1, ls: 0.06, lh: 1.35, color: mut, x: cx, y: y0 + 11, w: step - 1, z: 5 });
  });
  if (S.cta) L.push({ t: 'btn', text: S.cta, style: 'outline', color: acc, tcolor: ink, arrow: true, up: 1, fs: 1.55, ls: 0.12, x: MX, y: 80, z: 6 });
  footerMark(L, T, ctx, mut, line);
  return { bgc: dark ? T.darkBg : T.paper, layers: L };
}

/* 11. FLOORPLAN_SHOWCASE — планировка на светлом фоне + характеристики. */
function FLOORPLAN_SHOWCASE(S, T, ctx) {
  const L = []; const ink = T.ink, mut = T.mut, acc = T.accent, line = T.line;
  pageNum(L, ctx, mut, 'tr');
  L.push({ t: 'text', text: S.eyebrow || 'ПЛАНИРОВКИ', ff: 'sans', up: 1, fs: 1.3, ls: 0.24, color: mut, x: MX, y: 5.6, w: 44, z: 5 });
  const hfs = fitHead(S.headline || 'Продуманные планировки', 60, 5.2, 2, 3.8);
  L.push({ t: 'text', text: S.headline || 'Продуманные планировки', ff: 'disp', fs: hfs, lh: 1.05, wt: 500, color: ink, x: MX, y: 10.5, w: 60, z: 5 });
  if (ctx.photo) L.push({ t: 'img', url: ctx.photo, x: 12, y: 26, w: 76, h: 46, fit: 'contain', z: 3 });
  const facts = (S.facts || S.rows || []).slice(0, 3);
  if (facts.length) {
    const colW = 27, gap = 2.5, y0 = 78;
    facts.forEach((f, i) => {
      const cx = MX + i * (colW + gap);
      if (i > 0) L.push({ t: 'line', color: line, th: 1, vert: 1, h: 9, x: cx - gap / 2, y: y0, z: 5 });
      L.push({ t: 'text', text: f.v || f.big || '', ff: 'disp', fs: 3.4, wt: 500, color: acc, x: cx, y: y0, w: colW, z: 5 });
      L.push({ t: 'text', text: f.label || '', ff: 'sans', up: 1, fs: 1.05, ls: 0.06, lh: 1.3, color: mut, x: cx, y: y0 + 4.6, w: colW, z: 5 });
    });
  }
  footerMark(L, T, ctx, mut, line);
  return { bgc: T.paper, layers: L };
}

const GRAMMARS = { CINEMATIC_HERO, EDITORIAL_LIGHT, IMAGE_CAPTION, LOCATION_STORY, DATA_HERO, CINEMATIC_CTA, AMENITIES_GRID, GALLERY_TRIPTYCH, TYPOGRAPHIC_STATEMENT, PAYMENT_TIMELINE, FLOORPLAN_SHOWCASE };
const GRAMMAR_KEYS = Object.keys(GRAMMARS);

/* ── Подбор реального фото проекта под роль слайда (Phase 16) ────────────────── */
const PHOTO_HINT_ROLE = {
  exterior: ['render_ext', 'lifestyle'], architecture: ['render_ext', 'lifestyle'],
  interior: ['interior', 'amenity'], pool: ['amenity', 'lifestyle', 'render_ext'],
  beach: ['lifestyle', 'map', 'render_ext'], location: ['lifestyle', 'map'],
  sunset: ['lifestyle', 'render_ext'], amenity: ['amenity', 'interior'], floorplan: ['floorplan'],
};
function pickPhoto(hint, photos, used) {
  if (!photos || !photos.length) return null;
  const prefs = PHOTO_HINT_ROLE[hint] || ['render_ext', 'lifestyle', 'interior'];
  for (const role of prefs) { const p = photos.find(x => x.role === role && !used.has(x.url)); if (p) { used.add(p.url); return p.url; } }
  const any = photos.find(x => !used.has(x.url) && x.role !== 'floorplan' && x.role !== 'logo'); if (any) { used.add(any.url); return any.url; }
  return photos[0] ? photos[0].url : null;
}
/* строгий подбор по роли: url ТОЛЬКО если такой кадр реально есть (иначе null) */
function pickByRole(role, photos, used) {
  if (!photos) return null;
  const p = photos.find(x => x.role === role && !used.has(x.url)); if (p) { used.add(p.url); return p.url; }
  return null;
}
/* пул из k фото для галереи (без повторов, если хватает) */
function pickGallery(photos, used, k) {
  const out = [];
  for (let i = 0; i < k; i++) { const u = pickPhoto('exterior', photos, used); if (u && !out.includes(u)) out.push(u); else if (!u) break; }
  return out;
}

/* ════════════════════ КРЕАТИВНЫЙ ДИРЕКТОР (ArtDirectionPlan + копирайт) ══════ */
async function artDirectionPlan(project, opts = {}) {
  const grammarsDoc = [
    'CINEMATIC_HERO — фото на весь кадр, эмоциональный крючок (обычно обложка). tone:dark. поля: eyebrow, headline(2-4 слова/строки), sub, caption(капс, факт).',
    'EDITORIAL_LIGHT — светлый разворот на бумаге: сериф-заголовок слева, боковое фото справа, 3 иконных пункта. tone:light. поля: eyebrow, headline, sub, rows[{icon,label}].',
    'IMAGE_CAPTION — фото-hero (интерьер), светлый заголовок + подпись снизу. tone:dark. поля: eyebrow, headline, sub, caption.',
    'LOCATION_STORY — фото локации/пляжа, заголовок + 3-4 ряда дистанций. tone:dark. поля: eyebrow, headline, sub, rows[{icon,big(«3 мин»),label(«до пляжа»)}].',
    'DATA_HERO — тёмный фон, ГИГАНТСКОЕ число-акцент (цена/ROI) + 3 колонки фактов + CTA. tone:dark. поля: eyebrow, kicker(«1BR ОТ»), hero{value(«$185K»)}, sub, facts[{v,label}], cta.',
    'CINEMATIC_CTA — фото-закат, тихий финал + CTA-пилюля + координаты. tone:dark. поля: eyebrow, headline, sub, cta, coords(«7.9763° N 98.3047° E»).',
    'AMENITIES_GRID — сетка удобств: заголовок + 4-6 иконных плиток (иконка+название+короткое описание). tone:light|dark. поля: eyebrow, headline, rows[{icon,label(название),big(описание)}].',
    'GALLERY_TRIPTYCH — витрина «форматы/типы»: заголовок + ряд из 3 фото с капс-подписями. tone:light. поля: eyebrow, headline, sub, rows[{label}] (подписи под фото). Нужны ≥2 фото.',
    'TYPOGRAPHIC_STATEMENT — тихий типографский разворот БЕЗ фото (пауза-цитата в ритме). tone:light|dark. поля: eyebrow, headline(крупная мысль), sub.',
    'PAYMENT_TIMELINE — план оплаты как таймлайн: заголовок + 2-4 этапа (% + подпись) на линии. tone:dark|light. поля: eyebrow, headline, sub, facts[{v(«20%»),label(«при брони»)}], cta.',
    'FLOORPLAN_SHOWCASE — планировка на светлом фоне + характеристики. tone:light. поля: eyebrow, headline, facts[{v,label(«спальни»/«м²»)}]. Нужен кадр-план (role floorplan), иначе не выбирай.',
  ].join('\n');
  const iconKeys = 'pin, plane, beach, restaurant, view, window, leaf, terrace, ruler, pool, gym, spa, marina, golf, park, garden, security, concierge, key, clock, shield, doc, award, handshake, metro, shop, school';
  const roleList = (project.photoRoles || []).length ? project.photoRoles.join(', ') : 'render_ext, interior, lifestyle';
  const n = Math.max(4, Math.min(8, +opts.count || 6));
  const DIRECTIONS = {
    editorial: 'НАПРАВЛЕНИЕ A — «Редакторский люкс»: эмоция и образ жизни, крупные атмосферные фото, тёплая палитра, выразительный сериф-дисплей, больше CINEMATIC/IMAGE-грамматик. display:serif.',
    minimal: 'НАПРАВЛЕНИЕ B — «Архитектурный минимал»: максимум воздуха и геометрии, светлая/холодная палитра, много EDITORIAL_LIGHT и TYPO, сдержанная типографика, минимум украшений, крупные поля. display:modern или serif.',
    investment: 'НАПРАВЛЕНИЕ C — «Инвестиционный интеллект»: данные и цифры (ROI, цена, план оплаты), графит/сталь холодная палитра, чаще DATA_HERO и LOCATION_STORY, деловой тон, акцент НЕ золото.',
  };
  const dirHint = opts.direction && DIRECTIONS[opts.direction] ? '\n★ ' + DIRECTIONS[opts.direction] + ' Держи это направление во ВСЕЙ колоде (палитра, сетка грамматик, тон копирайта), но оставайся премиум-тиром.\n' : '';
  const prompt = `Ты — АРТ-ДИРЕКТОР премиального дизайн-бюро (архитектурно-гостиничная эстетика, tier как у сильной студии недвижимости; НЕ Canva). Спроектируй Instagram-карусель (${n} слайдов, портрет 4:5) для проекта недвижимости.

ПРОЕКТ:
Название: ${String(project.name || '').slice(0, 120)}
Локация: ${String(project.geo || '').slice(0, 120)}
Бренд-вордмарк: ${String(project.wordmark && project.wordmark.name || project.name || '').slice(0, 40)} / ${String(project.wordmark && project.wordmark.tag || '').slice(0, 40)}
Факты/вводные: ${String(project.brief || '').slice(0, 1400)}
Доступные роли фото проекта: ${roleList}
${dirHint}
ПРИНЦИПЫ ПРЕМИУМА (строго):
- Сдержанность, точность, иерархия, воздух, специфика. НЕ «гигантский шрифт», НЕ всё тёмное, НЕ золото всюду, НЕ клише.
- ЗАПРЕЩЁННЫЙ копирайт (общие ИИ-фразы): «место силы», «искусство жить», «эстетика тишины», «ваш путь к новой жизни», «привилегии пяти звёзд», «оазис спокойствия».
- Копирайт СЖАТЫЙ, конкретный, фактический. Примеры хорошего: «300 М ДО ПЛЯЖА», «1BR ОТ $185K», «HANDOVER 2027», «0% РАССРОЧКА», «SEA-VIEW TERRACES». Числа НЕ выдумывай — бери из вводных, иначе не используй.
- Ритм колоды: чередуй энергию и свет/тьму (не 6 одинаковых, не всё тёмное). Обложка — CINEMATIC_HERO. Финал — CINEMATIC_CTA. Один DATA_HERO (цена/доходность). Минимум 1-2 СВЕТЛЫХ слайда (EDITORIAL_LIGHT / AMENITIES_GRID light / TYPOGRAPHIC_STATEMENT / GALLERY_TRIPTYCH). Используй РАЗНЫЕ грамматики — НЕ повторяй одну дважды подряд и не лепи 3× IMAGE_CAPTION. Подбирай grammar под СМЫСЛ: удобства→AMENITIES_GRID, план оплаты→PAYMENT_TIMELINE, форматы/типы→GALLERY_TRIPTYCH, философия/пауза→TYPOGRAPHIC_STATEMENT, локация→LOCATION_STORY, цена/ROI→DATA_HERO.
- Заголовки — 2-4 слова или 2-3 короткие строки. Подписи — 1 предложение.
- eyebrow (рубрика) — КОРОТКО: 1-2 слова, до 18 символов (напр. «ЛОКАЦИЯ», «ИНВЕСТИЦИИ», «АРХИТЕКТУРА»). НЕ длинные фразы.

ПАЛИТРА — КРИТИЧНО: выбери палитру под ХАРАКТЕР ИМЕННО этого проекта. НЕ по умолчанию тёпло-бежевый+золото. Палитра ОБЯЗАНА заметно отличаться между разными проектами (тропики ≠ мегаполис ≠ горы). Ориентиры-направления (выбери подходящее или создай своё, но БЕЗ кислотности):
  • тропики/побережье → тёплый песок/слоновая кость + приглушённый лес/океан + мягкое золото;
  • город/деловой район/инвестиции → холодные графит/сталь/уголь + прохладный ecru + сдержанная латунь ИЛИ стальной-синий акцент (НЕ золото);
  • горы/природа → камень/шифер/мох, минеральные нейтрали;
  • брендовый люкс → глубокий charcoal/чернила + один благородный акцент.
Верни hex: paper (светлый фон разворота), ink (тёмный текст на бумаге), mut (приглушённый текст), accent (ОДИН акцент — число/детали), line (тонкая линейка), darkBg (тёмный фон data/cta), darkInk, darkMut. Насыщенность приглушённая, премиум, БЕЗ кислотности — но характер РАЗНЫЙ.

ГРАММАТИКИ КОМПОЗИЦИИ (выбери grammar на слайд по смыслу контента):
${grammarsDoc}

ИКОНКИ (тонкая линия, ключи для rows.icon): ${iconKeys}

Верни СТРОГО JSON:
{
 "concept":"1 фраза о характере колоды",
 "display":"serif|modern",
 "palette":{"paper":"#..","ink":"#..","mut":"#..","accent":"#..","line":"#..","darkBg":"#..","darkInk":"#..","darkMut":"#.."},
 "wordmark":{"name":"...","tag":"..."},
 "slides":[
   {"role":"hook|architecture|interior|location|investment|cta|amenities","grammar":"<КЛЮЧ>","tone":"light|dark","photo":"exterior|interior|beach|pool|architecture|sunset|amenity|none",
    "eyebrow":"КАПС РУБРИКА","headline":"...","sub":"...","caption":"КАПС ФАКТ (для hero/cta)","kicker":"...","hero":{"value":"$185K"},"cta":"...","coords":"...",
    "rows":[{"icon":"<ключ>","big":"3 мин","label":"до пляжа"}],
    "facts":[{"v":"8–12%","label":"ГОДОВАЯ ДОХОДНОСТЬ"}]}
 ]
}
Заполняй только релевантные поля под выбранную grammar. Ровно ${n} слайдов.`;
  const out = await Providers.creativeDirector(prompt, 45000, 4600);
  if (!out || !Array.isArray(out.slides) || !out.slides.length) throw new Error('director: пустой план');
  return out;
}

/* ── Сборка колоды: план + фото → сцен-граф слайды ──────────────────────────── */
function composeDeck(project, plan, photos) {
  const T = resolveTokens(plan);
  const used = new Set();
  const total = plan.slides.length;
  const wm = { name: (plan.wordmark && plan.wordmark.name) || project.name || 'RESIDENCES', tag: (plan.wordmark && plan.wordmark.tag) || '' };
  const NOPHOTO = new Set(['TYPOGRAPHIC_STATEMENT', 'AMENITIES_GRID']);   /* нативные, фон = цвет */
  const FAINT = new Set(['DATA_HERO', 'PAYMENT_TIMELINE']);               /* фото опционально, приглушённым фоном */
  const slides = plan.slides.map((S, i) => {
    let gk = GRAMMARS[S.grammar] ? S.grammar : (i === 0 ? 'CINEMATIC_HERO' : i === total - 1 ? 'CINEMATIC_CTA' : 'IMAGE_CAPTION');
    let photo = null, gallery = null;
    if (gk === 'GALLERY_TRIPTYCH') { gallery = pickGallery(photos, used, 3); photo = gallery[0] || null; }
    else if (gk === 'FLOORPLAN_SHOWCASE') { photo = pickByRole('floorplan', photos, used); }   /* только настоящий план; иначе без картинки */
    else if (NOPHOTO.has(gk)) { photo = null; }
    else if (FAINT.has(gk)) { photo = (S.photo && S.photo !== 'none') ? pickPhoto(S.photo, photos, used) : pickPhoto('amenity', photos, used); }
    else { photo = (S.photo !== 'none') ? pickPhoto(S.photo || 'exterior', photos, used) : null; }
    const ctx = { photo, gallery, pageNum: `${String(i + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, total, wordmark: wm };
    const g = GRAMMARS[gk](S, T, ctx);
    return {
      sg: 1, grammar: gk, role: S.role || '',
      bg: g.bg || '', bgc: g.bgc || '', grad: g.grad || '',
      heading: S.headline || '', sub: S.sub || '', eyebrow: S.eyebrow || '',   /* сохраняем текст для поиска/кириллица-детекта */
      layers: g.layers,
    };
  });
  const ct = carouselTheme(T);
  return { title: project.name || 'Карусель', theme: ct.theme, font: ct.font, format: 'portrait', tokens: T, plan, slides };
}

/* ════════════════════ ВИЗУАЛЬНЫЙ КРИТИК (senior CD) ═════════════════════════
   Вход: скриншот рендера (base64) + референс-tier (base64) + сцен-граф слайда.
   Выход: {scores, verdict, notes, ops[]} — структурные правки сцен-графа.       */
/* критик правит ТОЛЬКО геометрию/стиль — НЕ копирайт (текст — работа директора; иначе vision галлюцинирует «05/06»). */
const OP_KEYS = new Set(['x', 'y', 'w', 'h', 'fs', 'lh', 'ls', 'wt', 'op', 'ox', 'oy', 'color', 'from', 'to', 'th']);
async function critique(renderB64, refB64, slide, ctx = {}) {
  const layersDoc = (slide.layers || []).map((l, i) => {
    const t = l.text ? ` "${String(l.text).slice(0, 40)}"` : (l.url ? ' [img]' : (l.key ? ` [${l.key}]` : ''));
    return `#${i} ${l.t}${t} @x${l.x} y${l.y}${l.w != null ? ' w' + l.w : ''}${l.fs ? ' fs' + l.fs : ''}`;
  }).join('\n');
  const parts = [{ text: `Ты — СТРОГИЙ senior creative director премиального бюро недвижимости. Оцени ВТОРОЕ изображение (наш редактируемый рендер) на соответствие ПЕРВОМУ (референс-tier эталон качества). Сравнивай ТИР дизайна (не пиксели): арт-дирекшн, типографика, композиция, работа с фото, иерархия, воздух, читаемость, премиальность.

СЛОИ нашего слайда (индексы для правок; координаты x/w в % ширины, y/h в % высоты, fs в cqw=% ширины):
${layersDoc}

Найди КОНКРЕТНЫЕ дефекты и верни СТРУКТУРНЫЕ правки к слоям по индексу. Разрешённые ключи правок (ТОЛЬКО геометрия/стиль): x,y,w,h,fs,lh,ls,wt,op,ox,oy,color. Значения — АБСОЛЮТНЫЕ (новое значение, не дельта). НЕ меняй текст/копирайт и номера слайдов (это не твоя работа). Правь только то, что реально улучшит: коллизии/наложения, слишком крупные/мелкие заголовки, нехватку воздуха, слабый контраст, кривой кроп фото (ox/oy), позиции элементов.

Верни СТРОГО JSON:
{"scores":{"artDirection":0-10,"typography":0-10,"composition":0-10,"hierarchy":0-10,"readability":0-10,"premium":0-10,"tierMatch":0-10},"verdict":"pass|revise","notes":["кратко дефект"],"ops":[{"i":<индекс слоя>,"k":"<ключ>","to":<значение>}]}
Максимум 10 правок, только самые важные. Если слайд уже на уровне эталона — ops:[] и verdict:"pass".` }];
  parts.push({ inline_data: { mime_type: 'image/png', data: refB64 } });
  parts.push({ inline_data: { mime_type: 'image/png', data: renderB64 } });
  const out = await Providers.visionCritic(parts, 1900);
  const ops = Array.isArray(out && out.ops) ? out.ops.filter(o => o && Number.isInteger(o.i) && (OP_KEYS.has(o.k) || o.op === 'delete')).slice(0, 12) : [];
  return { scores: (out && out.scores) || {}, verdict: (out && out.verdict) || 'revise', notes: (out && out.notes) || [], ops };
}
/* применить правки критика к сцен-графу (абсолютные значения) */
function applyOps(slide, ops) {
  const L = slide.layers || [];
  let n = 0;
  (ops || []).forEach(o => {
    if (!o || !Number.isInteger(o.i) || !L[o.i]) return;
    if (o.op === 'delete') { L[o.i]._del = 1; n++; return; }
    const k = o.k === 'align' ? 'al' : o.k;
    if (!OP_KEYS.has(k)) return;
    if (['color', 'from', 'to', 'text', 'al'].includes(k)) L[o.i][k] = o.to;
    else { const v = +o.to; if (!isNaN(v)) L[o.i][k] = v; }
    n++;
  });
  slide.layers = L.filter(l => !l._del);
  return n;
}

/* ════════════════════ MODE 2 — ВИЗУАЛЬНЫЙ ТАРГЕТ + ИНТЕРПРЕТАТОР ════════════ */
async function visualTarget(brief, opts = {}) {
  const prompt = `Design ONE premium real-estate Instagram carousel slide, portrait 4:5, tier of a top architecture/hospitality design studio (NOT Canva, no generic AI luxury).
Slide role: ${brief.role || 'hook'}. Content intent: ${String(brief.intent || brief.headline || '').slice(0, 300)}.
Art direction: restrained warm-neutral / muted jewel palette, sophisticated editorial typography (elegant serif display + clean grotesk), generous negative space, refined photography of ${brief.photo || 'coastal modern residence'}, subtle micro-details, cinematic light. One accent color only. Strong hierarchy. Premium restraint — no huge fonts, no gold everywhere, no glassmorphism.
Composition: ${brief.composition || 'full-bleed photograph with a lower-left editorial text stack, small brand wordmark top corner, page number, thin rule detail'}.
Output: a finished, beautiful design concept image. Text may be lorem/placeholder (it will be reconstructed natively). No watermark.`;
  return Providers.visualGen(prompt, { size: '1024x1536', quality: opts.quality || 'high' });
}
async function interpret(imageB64, content, fonts, canvas) {
  /* ⚠️ LLM ненадёжны в СЫРЫХ координатах фото → просим ENUM региона фото; сам img-слой строим кодом.
     Текстовые координаты Gemini даёт разумно — их берём. */
  const parts = [{ text: `Ты — DESIGN INTERPRETER. На изображении — премиальный дизайн-таргет слайда (creative ground truth). Реконструируй ЛОГИКУ дизайна как редактируемый сцен-граф из нативных слоёв (НЕ пиксельная сегментация). Заголовок→text(ff:disp сериф), подпись/рубрика→text(ff:sans), тонкая линия→line, число→text(ff:disp), иконка→icon, CTA-пилюля→btn.

Канвас ${canvas.w}×${canvas.h} (портрет). Координаты: x/w в % ширины, y/h в % высоты (0-100), верх-лево = 0,0. fs в cqw (% ширины): заголовок ~5.5-8.5, подпись ~1.8-2.2, рубрика ~1.3, гигантское число ~14-16.
РЕАЛЬНЫЙ КОНТЕНТ (ставь его ВМЕСТО текста с картинки — там могут быть опечатки): eyebrow="${content.eyebrow || ''}", headline="${content.headline || ''}", sub="${content.sub || ''}"${content.cta ? ', cta="' + content.cta + '"' : ''}.
Шрифты: ff='disp' (сериф-дисплей, кириллица ОК) — заголовки/числа; ff='sans' (гротеск) — рубрики/подписи/CTA.
Цвета из палитры изображения (hex). ВАЖНО про контраст: если фото занимает область под текстом (тёмное) — текст СВЕТЛЫЙ (#FFFFFF/светлый); на светлой бумаге — тёмный.

ФОТО не описывай координатами. Вместо этого верни:
"photo": {"region":"full|top|bottom|left|right|none","focus":{"ox":0-100,"oy":0-100}}
  full = фото на весь кадр; top/bottom = фото в верхней/нижней ~половине (рамкой); left/right = боковая колонка; none = фото нет (только цвет/типографика).

Верни СТРОГО JSON: {"bg":{"type":"image|color","color":"#.."},"photo":{"region":"...","focus":{"ox":50,"oy":50}},"textOnPhoto":true|false,"layers":[{"t":"text|line|icon|btn","text":"...","ff":"disp|sans","fs":7,"lh":1.05,"ls":0,"wt":500,"up":false,"al":"left","color":"#..","x":6,"y":50,"w":76,"key":"arrow","style":"outline","arrow":true}]}
НЕ включай t:"img" в layers.` }];
  parts.push({ inline_data: { mime_type: 'image/png', data: imageB64 } });
  const out = await Providers.visionInterpret(parts, 2600);
  return out;
}
/* Сборка редактируемого слайда из интерпретации: строим img по региону (детерминированно) + скрим + слои. */
const PHOTO_REGIONS = {
  full: { x: 0, y: 0, w: 100, h: 100, z: 0 },
  top: { x: 5, y: 8, w: 90, h: 48, z: 0 },
  bottom: { x: 5, y: 46, w: 90, h: 48, z: 0 },
  left: { x: 0, y: 0, w: 52, h: 100, z: 0 },
  right: { x: 50, y: 8, w: 50, h: 62, z: 0 },
};
function assembleInterpreted(out, matchUrl, brief) {
  const layers = [];
  const region = out && out.photo && PHOTO_REGIONS[out.photo.region] ? out.photo.region : (out && out.photo && out.photo.region === 'none' ? 'none' : 'full');
  const focus = (out && out.photo && out.photo.focus) || {};
  const full = region === 'full';
  if (region !== 'none' && matchUrl) {
    const g = PHOTO_REGIONS[region];
    layers.push({ t: 'img', url: matchUrl, x: g.x, y: g.y, w: g.w, h: g.h, fit: 'cover', ox: focus.ox != null ? focus.ox : 50, oy: focus.oy != null ? focus.oy : 50, z: 0 });
    /* скрим только если текст лежит НА фото (full или textOnPhoto) */
    if (full && out.textOnPhoto !== false) {
      layers.push({ t: 'grad', gd: 'ttb', from: '#0a0e14a6', to: '#0a0e1400', x: 0, y: 0, w: 100, h: 24, z: 1 });
      layers.push({ t: 'grad', gd: 'btt', from: '#0a0e14f0', to: '#0a0e1400', x: 0, y: 34, w: 100, h: 66, z: 1 });
    }
  }
  /* текстовые/векторные слои интерпретатора поверх (z ≥ 5), фильтруем img (их не берём) */
  (Array.isArray(out && out.layers) ? out.layers : []).forEach((l, i) => {
    if (!l || l.t === 'img') return;
    const o = Object.assign({}, l); o.z = (o.z != null && o.z >= 5) ? o.z : 5 + i;
    layers.push(o);
  });
  const bgc = out && out.bg && out.bg.type === 'color' ? out.bg.color : (region === 'full' ? '' : (out && out.bg && out.bg.color) || '#EFEAE2');
  return { bgc, layers };
}

module.exports = {
  Providers, resolveTokens, carouselTheme, artDirectionPlan, composeDeck, GRAMMARS, GRAMMAR_KEYS,
  critique, applyOps, visualTarget, interpret, assembleInterpreted, pickPhoto,
};
