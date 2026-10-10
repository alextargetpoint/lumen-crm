/* Lumen Presentation Builder — design tokens (TZ §8, §13, §14, §15 + design-tokens.json).
   Pure module. Shared by editor canvas, web view and server PDF renderer (TZ §23).
   Works in browser (window.LumenPresTokens) and Node (module.exports). */
(function (root, factory) {
  const m = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = m;
  if (typeof window !== 'undefined') window.LumenPresTokens = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MM_PX = 96 / 25.4; // CSS px per mm at 96dpi
  const mm = (v) => +(v * MM_PX).toFixed(2);

  /* ---- 8 palettes (TZ §13; contrast verified in design-tokens.json) ---- */
  const PALETTES = [
    { id: 'sky',      name: 'Небесный',  c: { background:'#EDF4FA', surface:'#DDEAF5', text:'#1E2D3D', accent:'#355F7D', onAccent:'#FFFFFF', mutedText:'#1E2D3D', border:'#DDEAF5' } },
    { id: 'burgundy', name: 'Бургунди',  c: { background:'#F8F2EF', surface:'#E9D5D9', text:'#2D2024', accent:'#6E293D', onAccent:'#FFFFFF', mutedText:'#2D2024', border:'#E9D5D9' } },
    { id: 'olive',    name: 'Оливковый', c: { background:'#F1F3EA', surface:'#DDE3CF', text:'#293021', accent:'#4D5A3A', onAccent:'#FFFFFF', mutedText:'#293021', border:'#DDE3CF' } },
    { id: 'lavender', name: 'Лаванда',   c: { background:'#F0EDF7', surface:'#E0D8EE', text:'#302A3B', accent:'#605079', onAccent:'#FFFFFF', mutedText:'#302A3B', border:'#E0D8EE' } },
    { id: 'sand',     name: 'Песочный',  c: { background:'#F6F1E8', surface:'#E8DDCB', text:'#342D25', accent:'#756047', onAccent:'#FFFFFF', mutedText:'#342D25', border:'#E8DDCB' } },
    { id: 'powder',   name: 'Пудровый',  c: { background:'#FAF0ED', surface:'#EFDAD3', text:'#3A2A28', accent:'#8A514E', onAccent:'#FFFFFF', mutedText:'#3A2A28', border:'#EFDAD3' } },
    { id: 'sage',     name: 'Шалфей',    c: { background:'#EFF5F0', surface:'#DCE8DF', text:'#23362D', accent:'#426450', onAccent:'#FFFFFF', mutedText:'#23362D', border:'#DCE8DF' } },
    { id: 'butter',   name: 'Сливочный', c: { background:'#FAF6E8', surface:'#EEE5C2', text:'#363222', accent:'#70602F', onAccent:'#FFFFFF', mutedText:'#363222', border:'#EEE5C2' } },
    /* --- 3 премиум-пресета (ТЗ пресетов 10.2026) --- */
    { id: 'gallerywhite', name: 'Gallery White',     c: { background:'#FFFFFF', surface:'#F5F5F3', text:'#151515', accent:'#3155E7', onAccent:'#FFFFFF', mutedText:'#656565', border:'#DEDEDA' } },
    { id: 'graphite',     name: 'Urban Graphite',     c: { background:'#FFFFFF', surface:'#F1F3F4', text:'#151A1E', accent:'#24282C', onAccent:'#FFFFFF', mutedText:'#59636A', border:'#CDD3D7' } },
    { id: 'terracotta',   name: 'Terracotta Atelier', c: { background:'#FBF7F2', surface:'#F3E4DA', text:'#392D28', accent:'#A6533D', onAccent:'#FFF9F2', mutedText:'#75655C', border:'#D8BCAF' } },
  ];

  /* ---- 8 font pairs (TZ §14). families must match self-hosted fonts.css ---- */
  const FONT_PAIRS = [
    { id:'editorial',    name:'Выразительный',   heading:{ family:'Cormorant Garamond', weights:[500] }, body:{ family:'Manrope',    weights:[400,600] }, character:'Выразительный премиальный' },
    { id:'boutique',     name:'Бутиковый',       heading:{ family:'Prata',             weights:[400] }, body:{ family:'Golos Text', weights:[400,500] }, character:'Бутиковый и контрастный' },
    { id:'modern',       name:'Современный',     heading:{ family:'Onest',             weights:[500,600] }, body:{ family:'Inter',    weights:[400,500] }, character:'Современный нейтральный' },
    { id:'architecture', name:'Архитектурный',   heading:{ family:'Manrope',           weights:[500,600] }, body:{ family:'Golos Text', weights:[400] }, character:'Архитектурный строгий' },
    { id:'classic',      name:'Классический',    heading:{ family:'EB Garamond',       weights:[500] }, body:{ family:'Inter',     weights:[400,500] }, character:'Спокойный редакционный' },
    { id:'soft',         name:'Мягкий',          heading:{ family:'Cormorant Garamond', weights:[500] }, body:{ family:'Onest',    weights:[400,500] }, character:'Мягкий и воздушный' },
    { id:'minimal',      name:'Минимализм',      heading:{ family:'Inter',             weights:[500,600] }, body:{ family:'Inter',    weights:[400] }, character:'Минималистичный' },
    { id:'signature',    name:'Фирменный',       heading:{ family:'Prata',             weights:[400] }, body:{ family:'Manrope',   weights:[400,600] }, character:'Выразительная обложка' },
    /* --- пары под 3 пресета (Terracotta использует editorial) --- */
    { id:'gallery',      name:'Галерейный',      heading:{ family:'Manrope',           weights:[400] }, body:{ family:'Manrope',   weights:[400,600] }, character:'Лёгкая галерейная типографика' },
    { id:'urban',        name:'Урбан',           heading:{ family:'Inter',             weights:[600] }, body:{ family:'Inter',     weights:[400,500] }, character:'Контрастный городской (узкие верхне-регистровые заголовки)' },
  ];
  // serif display families use a slightly larger scale (optical) — flagged for layout
  const SERIF_HEADINGS = new Set(['Cormorant Garamond','Prata','EB Garamond']);

  /* ---- 4 formats (TZ §8 geometry + §15 type scale) ---- */
  const FORMATS = [
    { id:'landscape_16_9', label:'16:9',             orient:'landscape', cssW:1280, cssH:720,
      widthMm:338.67, heightMm:190.50, safe:{ x:48, y:48 }, columns:12,
      type:{ heading:[42,64], body:[20,24], caption:[14,16], minBody:18 } },
    { id:'portrait_a4',    label:'A4 вертикальный',  orient:'portrait',  cssW:793.70, cssH:1122.52,
      widthMm:210, heightMm:297, safe:{ x:mm(14), y:mm(12) }, columns:6,
      type:{ heading:[32,48], body:[15,18], caption:[12,14], minBody:14 } },
    { id:'landscape_a4',   label:'A4 горизонтальный',orient:'landscape', cssW:1122.52, cssH:793.70,
      widthMm:297, heightMm:210, safe:{ x:mm(14), y:mm(12) }, columns:12,
      type:{ heading:[36,52], body:[17,20], caption:[12,14], minBody:16 } },
    { id:'portrait_9_16',  label:'9:16',             orient:'portrait',  cssW:576, cssH:1024,
      widthMm:152.40, heightMm:270.93, safe:{ x:32, y:32 }, columns:6,
      type:{ heading:[34,44], body:[22,26], caption:[18,20], minBody:22 } },
  ];

  const SPACING = [4, 8, 12, 16, 24, 32, 48];
  const RADII = [0, 8, 16];
  const LIMITS = { projectsPerCollection:20, physicalPagesPerExport:100, assetsPerSection:20, photoMaxMB:25, photoMaxMP:50 };
  const CONTRAST = { normalTextMin:4.5, largeTextMin:3 };

  // 10 section families (TZ §10–§11) + neutral custom
  const FAMILIES = ['hero','editorial','metrics','gallery','location','floorplan','payment','comparison','benefits','broker','custom'];

  /* ---- helpers ---- */
  const byId = (arr, id) => arr.find(x => x.id === id);
  const palette = (id) => byId(PALETTES, id) || PALETTES[1];       // default burgundy (matches example.json)
  const fontPair = (id) => byId(FONT_PAIRS, id) || FONT_PAIRS[0];  // default editorial
  const format = (id) => byId(FORMATS, id) || FORMATS[1];          // default portrait_a4

  /* ---- 3 премиум-пресета: бандл палитра+шрифт-пара+композиц-флаги (ТЗ пресетов §2) ---- */
  const PRESETS = [
    { id:'gallerywhite', name:'Gallery White',      paletteId:'gallerywhite', fontPairId:'gallery',   headingCase:'none',  accentUse:'minimal', darkCover:false, note:'Белая архитектурная галерея, синий точечно' },
    { id:'graphite',     name:'Urban Graphite',     paletteId:'graphite',     fontPairId:'urban',     headingCase:'upper', accentUse:'bars',    darkCover:true,  note:'Графит, контрастная узкая типографика' },
    { id:'terracotta',   name:'Terracotta Atelier', paletteId:'terracotta',   fontPairId:'editorial', headingCase:'none',  accentUse:'panels',  darkCover:false, alternating:true, italicHeads:true, note:'Терракота/молочный, редакционный курсив' },
  ];
  const preset = (id) => byId(PRESETS, id) || null;
  /* выбор пресета → тема документа (контент/ручные правки не затираются — ТЗ §2) */
  function presetTheme(id){ const p = preset(id); return p ? { presetId:p.id, paletteId:p.paletteId, fontPairId:p.fontPairId } : null; }

  // WCAG relative luminance + contrast ratio (for live contrast check, TZ §13)
  function _lin(c){ c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4); }
  function _lum(hex){ const h=hex.replace('#',''); const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16); return 0.2126*_lin(r)+0.7152*_lin(g)+0.0722*_lin(b); }
  function contrast(a, b){ const l1=_lum(a), l2=_lum(b); const hi=Math.max(l1,l2), lo=Math.min(l1,l2); return +(((hi+0.05)/(lo+0.05)).toFixed(3)); }

  // Build CSS custom-property block for a theme — the single source of truth consumed by every template.
  function themeVars(theme){
    const p = palette(theme && theme.paletteId).c;
    const fp = fontPair(theme && theme.fontPairId);
    const serif = SERIF_HEADINGS.has(fp.heading.family);
    return {
      '--bg': p.background, '--surface': p.surface, '--text': p.text,
      '--accent': p.accent, '--on-accent': p.onAccent, '--muted': p.mutedText, '--line': p.border,
      '--font-head': `'${fp.heading.family}', Georgia, serif`,
      '--font-body': `'${fp.body.family}', system-ui, sans-serif`,
      '--head-weight': String(fp.heading.weights[0]),
      '--serif-head': serif ? '1' : '0',
    };
  }
  function themeStyleStr(theme){ const v=themeVars(theme); return Object.keys(v).map(k=>k+':'+v[k]).join(';'); }

  // Scale a canvas (design-space) px length to a rendered box of width `renderW`.
  const scaleFor = (fmt, renderW) => renderW / format(fmt).cssW;

  return {
    MM_PX, mm, PALETTES, FONT_PAIRS, FORMATS, PRESETS, SPACING, RADII, LIMITS, CONTRAST, FAMILIES, SERIF_HEADINGS,
    palette, fontPair, format, preset, presetTheme, byId, contrast, themeVars, themeStyleStr, scaleFor,
  };
});
