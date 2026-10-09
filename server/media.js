'use strict';
/* ============================================================================
   server/media.js — МОДУЛЬ ПОДГОТОВКИ И ОТБОРА ФОТОГРАФИЙ (доп-ТЗ v1.0 / ТЗ v2.0 §14)
   Самодостаточный, без внешних зависимостей, изолирован от pres, design.js и app.js.
   Детерминированное ядро: реальные размеры из байтов (не из имени файла), эффективный
   PPI под КОНКРЕТНЫЙ слот макета, пригодность (пара файл+слот), жёсткие исключения +
   взвешенное ранжирование обложки, безопасный кроп/защищённые зоны, модель данных,
   версии и снимки. Тяжёлые анализаторы (OCR, настоящий blur-CV, апскейл, генеративка)
   подключаются АДАПТЕРАМИ (seam ниже) — по умолчанию выключены (cost-safe).
   ========================================================================== */
const crypto = require('crypto');

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

/* ---------------------------------------------------------------------------
   1. РЕАЛЬНЫЕ РАЗМЕРЫ ИЗ БАЙТОВ (не имя файла, не заявленный размер).
   Возвращает {width,height,mime} или null при неразпознанном/битом изображении.
   -------------------------------------------------------------------------- */
function imageDims(buf) {
  if (!buf || buf.length < 16) return null;
  try {
    // PNG: \x89PNG\r\n\x1a\n, IHDR width/height — big-endian uint32 @16/@20
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), mime: 'image/png' };
    }
    // GIF87a / GIF89a: width/height — little-endian uint16 @6/@8
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), mime: 'image/gif' };
    }
    // BMP: 'BM', width/height int32 LE @18/@22
    if (buf[0] === 0x42 && buf[1] === 0x4d) {
      return { width: Math.abs(buf.readInt32LE(18)), height: Math.abs(buf.readInt32LE(22)), mime: 'image/bmp' };
    }
    // WebP: RIFF....WEBP
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
      const fourcc = buf.toString('ascii', 12, 16);
      if (fourcc === 'VP8 ') {                        // lossy
        const w = (buf.readUInt16LE(26) & 0x3fff), h = (buf.readUInt16LE(28) & 0x3fff);
        return { width: w, height: h, mime: 'image/webp' };
      }
      if (fourcc === 'VP8L') {                         // lossless
        const b = buf.slice(21, 25);
        const w = 1 + (((b[1] & 0x3f) << 8) | b[0]);
        const h = 1 + (((b[3] & 0x0f) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6));
        return { width: w, height: h, mime: 'image/webp' };
      }
      if (fourcc === 'VP8X') {                         // extended
        const w = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
        const h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
        return { width: w, height: h, mime: 'image/webp' };
      }
    }
    // JPEG: FF D8 ... сканируем маркеры до SOFn (C0..CF кроме C4/C8/CC)
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue; }
        let marker = buf[i + 1];
        while (marker === 0xff && i + 1 < buf.length) { i++; marker = buf[i + 1]; }  // пропуск fill-байтов
        const seg = i + 2;
        if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          const h = buf.readUInt16BE(seg + 3), w = buf.readUInt16BE(seg + 5);
          return { width: w, height: h, mime: 'image/jpeg' };
        }
        if (marker === 0xd9 || marker === 0xda) break;  // EOI/SOS — дальше не ищем
        const len = buf.readUInt16BE(seg);
        if (len < 2) break;
        i = seg + len;
      }
    }
  } catch (e) { return null; }
  return null;
}

/* ---------------------------------------------------------------------------
   2. ФИЗИЧЕСКАЯ ГЕОМЕТРИЯ ФОРМАТОВ И СЛОТОВ (ТЗ v2.0 §13).
   Экранные форматы экспортируются в PDF с явным масштабом 96px/in.
   -------------------------------------------------------------------------- */
const FORMAT_PAGE_IN = {
  portrait_a4:    { w: 8.2677, h: 11.6929 },   // 210×297 мм
  landscape_a4:   { w: 11.6929, h: 8.2677 },   // 297×210 мм
  landscape_16_9: { w: 13.3333, h: 7.5 },      // 1280×720 @96ppi
  portrait_9_16:  { w: 6.0,     h: 10.6667 },  // 576×1024 @96ppi
};
/* доля слота от страницы (ширина×высота). Расширяемо шаблонами (requiredSlots). */
const SLOT_FRACTION = {
  cover:    { w: 1.0,  h: 1.0 },    // обложка на всю страницу
  hero:     { w: 1.0,  h: 0.62 },   // главный кадр-баннер
  halfL:    { w: 0.5,  h: 0.78 },   // половина (разворот)
  halfR:    { w: 0.5,  h: 0.78 },
  quarter:  { w: 0.5,  h: 0.33 },   // ячейка бенто/галереи
  thumb:    { w: 0.25, h: 0.2 },    // миниатюра карточки
};
function slotInches(format, slot) {
  const page = FORMAT_PAGE_IN[format] || FORMAT_PAGE_IN.portrait_a4;
  const fr = SLOT_FRACTION[slot] || SLOT_FRACTION.cover;
  return { w: +(page.w * fr.w).toFixed(4), h: +(page.h * fr.h).toFixed(4) };
}

/* пороги PPI — СТАРТОВЫЕ продуктовые настройки, калибруются (ТЗ §14) */
const PPI = { digitalTarget: 150, digitalWarn: 120, printTarget: 300, printWarn: 200 };

/* effectivePPI считается ПОСЛЕ кропа: по используемым пикселям и физ. размеру слота */
function effectivePPI(cropWpx, cropHpx, slotWin, slotHin) {
  if (!(slotWin > 0) || !(slotHin > 0)) return 0;
  return Math.floor(Math.min(cropWpx / slotWin, cropHpx / slotHin));
}

/* ---------------------------------------------------------------------------
   3. АНАЛИЗ ИЗОБРАЖЕНИЯ (детерминированная часть — хранится по отдельности).
   meta: {sourcePx:{w,h}?, upscaled?, source, projectId, materialType?, hints?...}
   -------------------------------------------------------------------------- */
function analyzeAsset(buf, meta) {
  meta = meta || {};
  const dims = imageDims(buf);
  const bytes = buf ? buf.length : 0;
  if (!dims) {
    return { ok: false, corrupt: true, bytes, checksum: buf ? sha256(buf) : null, flags: ['corrupt'], mime: null, width: 0, height: 0 };
  }
  const mp = +(dims.width * dims.height / 1e6).toFixed(2);
  const bpp = dims.width * dims.height ? +(bytes / (dims.width * dims.height)).toFixed(3) : 0; // байт/пиксель — прокси компрессии/детализации
  /* детальность СЧИТАЕТСЯ ПО ИСХОДНЫМ пикселям: апскейл не повышает исходную детализацию (ТЗ §14, крит.4/19) */
  const sourcePx = meta.sourcePx && meta.sourcePx.w ? meta.sourcePx : { w: dims.width, h: dims.height };
  const upscaled = !!meta.upscaled || (sourcePx.w < dims.width);
  const flags = [];
  if (bpp > 0 && bpp < 0.05) flags.push('high_compression');    // ТОЛЬКО экстремальная компрессия (нормальный JPEG 0.1–0.3 bpp); не понижает статус, лишь пометка. Настоящая проверка резкости — адаптер.
  if (upscaled) flags.push('upscaled');
  if (mp < 0.5) flags.push('low_resolution');
  return {
    ok: true, corrupt: false, bytes, checksum: sha256(buf),
    width: dims.width, height: dims.height, mime: dims.mime,
    megapixels: mp, bytesPerPixel: bpp,
    sourceWidth: sourcePx.w, sourceHeight: sourcePx.h, upscaled,
    aspect: +(dims.width / dims.height).toFixed(4),
    materialType: meta.materialType || classifyMaterial(meta, dims),
    confidence: meta.materialType ? 1 : 0.5,
    flags,
    analyzerVersions: { dims: 1, heuristic: 1, ocr: null, blur: null },   // OCR/blur — адаптеры (seam)
  };
}

/* эвристическая классификация материала (seam: заменяется vision-адаптером/curatePhotos) */
function classifyMaterial(meta, dims) {
  const s = String((meta && (meta.name || meta.url || meta.sourceUrl)) || '').toLowerCase();
  if (/floor|plan|планировк|layout|чертеж/.test(s)) return 'floorplan';
  if (/logo|логотип|brand/.test(s)) return 'logo';
  if (/map|карта|location-map/.test(s)) return 'map';
  if (/render|визуализац|3d/.test(s)) return 'render';
  if (/screenshot|screen|скрин/.test(s)) return 'screenshot';
  if (/agent|broker|portrait|портрет|person|avatar/.test(s)) return 'portrait';
  if (dims && dims.width && Math.abs(dims.width / dims.height - 1) < 0.02) return 'unknown'; // квадрат — неоднозначно
  return 'photo';
}

/* ---------------------------------------------------------------------------
   4. ПРИГОДНОСТЬ = ПАРА (файл + слот). Статус + причины + жёсткие исключения.
   analysis: результат analyzeAsset; slot: {format, slot, crop?{wPx,hPx}, profile?}
   profile: 'digital'|'print' (цель PPI). ownership/adText/protected — из анализа/meta.
   -------------------------------------------------------------------------- */
function suitability(analysis, slot) {
  slot = slot || {};
  const profile = slot.profile === 'print' ? 'print' : 'digital';
  const si = slotInches(slot.format || 'portrait_a4', slot.slot || 'cover');
  const reasons = [];

  /* ЖЁСТКИЕ ИСКЛЮЧЕНИЯ (ТЗ §14) — не компенсируются рейтингом */
  if (!analysis || analysis.corrupt) return mkSuit('not_for_cover', 0, ['Файл недоступен или повреждён'], true, 'corrupt', si);
  if (analysis.foreignProject || slot.projectMismatch) return mkSuit('not_for_cover', 0, ['Фото другого проекта — исключено'], true, 'foreign_project', si);
  if (analysis.adPlate || (analysis.ocr && analysis.ocr.adText)) return mkSuit('needs_review', 0, ['Рекламная надпись на фото — не для обложки'], true, 'ad_text', si);
  if (analysis.cropLosesProtected || slot.cropLosesProtected) return mkSuit('not_for_cover', 0, ['Кроп теряет защищённую область (крыша/фасад/лицо/подпись)'], true, 'crop_protected', si);

  /* эффективный PPI — по кропу (или всему кадру) и физ. размеру слота */
  const cropW = (slot.crop && slot.crop.wPx) || analysis.width;
  const cropH = (slot.crop && slot.crop.hPx) || analysis.height;
  /* детализация оценивается по ИСХОДНЫМ пикселям (апскейл не в счёт) */
  const detW = analysis.upscaled ? Math.min(cropW, analysis.sourceWidth) : cropW;
  const detH = analysis.upscaled ? Math.min(cropH, analysis.sourceHeight) : cropH;
  const ppi = effectivePPI(detW, detH, si.w, si.h);
  const target = profile === 'print' ? PPI.printTarget : PPI.digitalTarget;
  const warn = profile === 'print' ? PPI.printWarn : PPI.digitalWarn;

  let status;
  if (ppi < warn) { status = 'not_for_cover'; reasons.push(`Недостаточно детализации для этого слота (${ppi} PPI < ${warn})`); }
  else if (ppi < target) { status = 'needs_review'; reasons.push(`PPI ниже цели (${ppi} < ${target}) — приемлемо, но проверьте на крупном слоте`); }
  else { status = 'suitable'; reasons.push(`Детализация достаточна (${ppi} PPI)`); }

  /* огромный оригинал в маленький слот — не ошибка, просто уменьшить (ТЗ: «Лучше уменьшить») */
  if (status === 'suitable' && ppi > target * 2.4) reasons.push('Оригинал крупнее нужного — будет уменьшен');

  /* мягкие пометки (НЕ меняют статус — статус ведёт PPI; настоящая резкость/артефакты — адаптер) */
  if (analysis.flags && analysis.flags.includes('high_compression')) reasons.push('Экстремальная компрессия — рекомендуется проверить резкость/артефакты');
  if (analysis.upscaled && status === 'suitable') reasons.push('Изображение увеличено — исходная детализация не выросла');

  /* апскейл НЕ повышает оценку исходной детализации автоматически (крит. 4/19) */
  return mkSuit(status, ppi, reasons, false, null, si);
}
function mkSuit(status, ppi, reasons, hardExcluded, exclusionReason, slotInchesObj) {
  return { status, ppi, reasons, hardExcluded: !!hardExcluded, exclusionReason: exclusionReason || null, slotInches: slotInchesObj, validationVersion: 1 };
}

/* ---------------------------------------------------------------------------
   5. ОТБОР ОБЛОЖКИ: жёсткие исключения → взвешенный рейтинг → топ-3 с причинами.
   Веса ТЗ §14: детализация 30 / тип-страницы 20 / композиция 20 / кроп 15 /
   зона заголовка 10 / разнообразие 5 (конфигурируемы, не компенсируют исключения).
   candidates: [{assetId, analysis, pageTypeFit?0..1, titleZone?0..1, used?bool}]
   -------------------------------------------------------------------------- */
const COVER_WEIGHTS = { detail: 30, pageType: 20, composition: 20, crop: 15, titleZone: 10, diversity: 5 };
function rankCovers(candidates, slot) {
  slot = slot || { format: 'portrait_a4', slot: 'cover', profile: 'digital' };
  const si = slotInches(slot.format, slot.slot || 'cover');
  const slotAspect = si.w / si.h;
  const out = [];
  (candidates || []).forEach(c => {
    const a = c.analysis;
    const suit = suitability(a, Object.assign({}, slot, { projectMismatch: c.projectMismatch }));
    if (suit.hardExcluded) { out.push({ assetId: c.assetId, excluded: true, reason: suit.exclusionReason, reasons: suit.reasons, score: 0 }); return; }
    // детализация: PPI относительно цели (0..1, >цели=1)
    const target = slot.profile === 'print' ? PPI.printTarget : PPI.digitalTarget;
    const detail = Math.max(0, Math.min(1, suit.ppi / target));
    // кроп/композиция: насколько аспект кадра близок к аспекту слота (меньше потерь при кропе)
    const aspA = a.aspect || 1;
    const cropFit = 1 - Math.min(1, Math.abs(aspA - slotAspect) / Math.max(slotAspect, aspA));
    const composition = (typeof c.composition === 'number') ? c.composition : cropFit;
    const pageType = (typeof c.pageTypeFit === 'number') ? c.pageTypeFit : (a.materialType === 'photo' || a.materialType === 'render' ? 1 : (a.materialType === 'floorplan' || a.materialType === 'map' || a.materialType === 'logo' ? 0 : 0.5));
    const titleZone = (typeof c.titleZone === 'number') ? c.titleZone : (aspA >= slotAspect ? 0.7 : 0.4); // шире слота → есть куда положить заголовок
    const diversity = c.used ? 0 : 1;   // уже использованный кадр — минус к разнообразию
    const score = +(
      detail * COVER_WEIGHTS.detail + pageType * COVER_WEIGHTS.pageType + composition * COVER_WEIGHTS.composition +
      cropFit * COVER_WEIGHTS.crop + titleZone * COVER_WEIGHTS.titleZone + diversity * COVER_WEIGHTS.diversity
    ).toFixed(1);
    const reasons = [];
    if (detail >= 0.9) reasons.push('Высокая детализация'); else if (detail < 0.6) reasons.push('Низкая детализация для крупного слота');
    if (cropFit > 0.85) reasons.push('Хорошо ложится в кадр слота'); else reasons.push('Потребуется заметный кроп');
    if (titleZone >= 0.7) reasons.push('Есть свободная зона под заголовок');
    if (pageType === 1) reasons.push('Подходящий тип материала'); else if (pageType === 0) reasons.push('Планировка/карта/логотип — не для обложки');
    if (c.used) reasons.push('Уже использован в документе');
    out.push({ assetId: c.assetId, excluded: false, score: +score, ppi: suit.ppi, status: suit.status, reasons });
  });
  const ranked = out.filter(x => !x.excluded).sort((a, b) => b.score - a.score);
  return { top: ranked.slice(0, 3), ranked, excluded: out.filter(x => x.excluded) };
}

/* ---------------------------------------------------------------------------
   6. МОДЕЛЬ ДАННЫХ (ТЗ §18) — фабрики, стабильные id, версии.
   -------------------------------------------------------------------------- */
function rid(p) { return (p || 'm') + '_' + crypto.randomBytes(8).toString('hex'); }
function newAsset(f) {
  f = f || {};
  return {
    id: f.id || rid('asset'), tenantId: f.tenantId || null, projectId: f.projectId || null, unitId: f.unitId || null,
    originalFileId: f.originalFileId || null, checksum: f.checksum || null,
    width: f.width || 0, height: f.height || 0, mime: f.mime || null,
    source: f.source || 'upload',            // upload | crm | developer
    materialType: f.materialType || 'unknown',
    rightsStatus: f.rightsStatus || 'unknown', // own | licensed | unknown
    importedAt: f.importedAt || null,
  };
}
function newVariant(f) {
  f = f || {};
  return {
    id: f.id || rid('var'), originalAssetId: f.originalAssetId, transformRecipe: f.transformRecipe || { kind: 'original' },
    recipeKey: f.recipeKey || null, isThumbnail: !!f.isThumbnail,
    processingModelVersion: f.processingModelVersion || null, outputFileId: f.outputFileId || null,
    outputDimensions: f.outputDimensions || null, reviewStatus: f.reviewStatus || 'approved', createdBy: f.createdBy || null, createdAt: f.createdAt || null,
  };
}
function newPlacement(f) {
  f = f || {};
  return {
    pageId: f.pageId, slotId: f.slotId, assetVariantId: f.assetVariantId || null,
    format: f.format || 'portrait_a4', crop: f.crop || null, focalPoint: f.focalPoint || { x: 0.5, y: 0.5 },
    protectedRegions: f.protectedRegions || [], lockedByUser: !!f.lockedByUser,
    suitabilityResult: f.suitabilityResult || null, validationVersion: f.validationVersion || 1,
  };
}
/* признак дубля: один checksum = одно изображение (разные размеры одного кадра — отдельная группа) */
function duplicateGroups(assets) {
  const by = {};
  (assets || []).forEach(a => { if (a.checksum) (by[a.checksum] = by[a.checksum] || []).push(a.id); });
  const groups = {}; let n = 0;
  Object.keys(by).forEach(ck => { if (by[ck].length > 1) { const g = 'dup_' + (++n); by[ck].forEach(id => groups[id] = g); } });
  return groups;
}

/* ---------------------------------------------------------------------------
   7. БЕЗОПАСНЫЙ КРОП: не режем защищённые зоны (крыша/фасад/лицо/подписи планировок).
   protected: [{x,y,w,h}] в долях 0..1. Возвращает допустим ли кроп + предложение.
   -------------------------------------------------------------------------- */
function cropKeepsProtected(crop, protectedRegions) {
  if (!protectedRegions || !protectedRegions.length) return true;
  const cx = crop.x || 0, cy = crop.y || 0, cw = crop.w || 1, ch = crop.h || 1;
  return protectedRegions.every(r => (r.x >= cx && r.y >= cy && (r.x + r.w) <= (cx + cw) && (r.y + r.h) <= (cy + ch)));
}

/* безопасный авто-профиль улучшения (границы ТЗ §14): без генеративных изменений сцены */
const SAFE_ENHANCE = { exposure: true, whiteBalance: true, denoise: 'mild', compressionFix: true, sharpen: 'limited',
  forbidden: ['architecture', 'floors', 'windows', 'views', 'sea', 'pool', 'furniture', 'landscape', 'remove_construction', 'outpaint'] };

/* ---------------------------------------------------------------------------
   8. ПАЙПЛАЙН ОБЛОЖКИ: analyze → жёсткие исключения → рейтинг → топ-3,
   с честным фолбэком «нет пригодного фото» (крит.21): типографика / маленькое
   фото / другой ракурс / загрузить — НЕ пустой плейсхолдер и НЕ чужой проект.
   -------------------------------------------------------------------------- */
function selectCover(candidates, slot) {
  const r = rankCovers(candidates, slot);
  if (r.top.length && r.top[0].status === 'suitable') {
    return { mode: 'photo', pick: r.top[0], alternatives: r.top.slice(1), excluded: r.excluded, ranked: r.ranked };
  }
  /* нет пригодного фото → предлагаем варианты (не подставляем случайное/пустое) */
  return {
    mode: 'no_suitable_photo',
    pick: null, bestEffort: r.ranked[0] || null,
    suggestions: ['upload_original', 'pick_other_frame', 'cover_without_photo'],   // действия UI (доп-ТЗ §9)
    coverCompositions: ['typographic', 'small_photo'],                              // слабый исходник → типографика/маленькое фото
    alternatives: r.ranked.slice(0, 3), excluded: r.excluded,
  };
}

/* ---------------------------------------------------------------------------
   9. ПЕРЕСЧЁТ КРОПА ПОД ФОРМАТ (крит.5/14/18): фокус сохраняется, защищённые
   зоны не режутся; при невозможности — предлагаем другой макет, не ломаем.
   Ручные кропы хранятся ОТДЕЛЬНО по формату (layoutsByFormat) — не перетираются.
   -------------------------------------------------------------------------- */
function cropForAspect(targetAspect, imgW, imgH, focal, protectedRegions) {
  const imgAspect = imgW / imgH;
  let cw, ch;
  if (targetAspect >= imgAspect) { cw = 1; ch = +(imgAspect / targetAspect).toFixed(4); }
  else { ch = 1; cw = +(targetAspect / imgAspect).toFixed(4); }
  const f = focal || { x: 0.5, y: 0.5 };
  let cx = Math.max(0, Math.min(1 - cw, f.x - cw / 2));
  let cy = Math.max(0, Math.min(1 - ch, f.y - ch / 2));
  const crop = { x: +cx.toFixed(4), y: +cy.toFixed(4), w: cw, h: ch };
  return { crop, keepsProtected: cropKeepsProtected(crop, protectedRegions || []) };
}
function recomputeCropForFormat(imgW, imgH, toFormat, slot, focal, protectedRegions, savedCropsByFormat) {
  /* если под этот формат уже есть ручной кроп — не трогаем (крит.18) */
  if (savedCropsByFormat && savedCropsByFormat[toFormat] && savedCropsByFormat[toFormat].manual) {
    return { crop: savedCropsByFormat[toFormat].crop, manual: true, needsAlt: false };
  }
  const si = slotInches(toFormat, slot || 'cover');
  const aspect = si.w / si.h;
  const { crop, keepsProtected } = cropForAspect(aspect, imgW, imgH, focal, protectedRegions);
  return keepsProtected
    ? { crop, aspect: +aspect.toFixed(4), manual: false, needsAlt: false }
    : { crop, aspect: +aspect.toFixed(4), manual: false, needsAlt: true, reason: 'crop_loses_protected', suggest: 'alternative_layout' };
}

/* ---------------------------------------------------------------------------
   10. ПРЕД-ЭКСПОРТНАЯ МЕДИА-ПРОВЕРКА (ТЗ §17, крит.22/23): блокирующие отдельно
   от рекомендаций. PDF берёт полноразмерную производную, НЕ UI-миниатюру.
   items: [{slotId, required, variant?, analysis?, suitability?, isCover?}]
   -------------------------------------------------------------------------- */
function exportMediaCheck(items) {
  const blocking = [], recommendations = [];
  (items || []).forEach(it => {
    const where = it.slotId || 'slot';
    const v = it.variant;
    if (it.required && !v) { blocking.push({ slotId: where, code: 'missing_resource', msg: 'Отсутствует обязательный ресурс' }); return; }
    if (v) {
      if (v.unavailable || (it.analysis && it.analysis.corrupt)) blocking.push({ slotId: where, code: 'unavailable', msg: 'Изображение недоступно или повреждено' });
      if (v.isThumbnail) blocking.push({ slotId: where, code: 'thumbnail_in_pdf', msg: 'В PDF подставлена UI-миниатюра вместо полноразмерной производной' });
      const rec = v.transformRecipe || {};
      if (rec.generative && v.reviewStatus !== 'approved') blocking.push({ slotId: where, code: 'unverified_generative', msg: 'Непроверенная генеративная производная' });
      if (it.projectMismatch) blocking.push({ slotId: where, code: 'project_mismatch', msg: 'Несоответствие проекта' });
    }
    if (it.suitability) {
      if (it.isCover && it.suitability.status === 'not_for_cover') blocking.push({ slotId: where, code: 'unsuitable_cover', msg: 'Фото не подходит для обложки (' + it.suitability.ppi + ' PPI)' });
      else if (it.suitability.status === 'needs_review') recommendations.push({ slotId: where, code: 'low_quality', msg: 'Качество фото стоит проверить' });
    }
  });
  return { ok: blocking.length === 0, blocking, recommendations };
}

/* ---------------------------------------------------------------------------
   11. ПРОИЗВОДНЫЕ: дедуп по рецепту (крит.11 — повтор рецепта без новой платной
   операции), от ОРИГИНАЛА (крит.8/20 — не перетираем исходник).
   -------------------------------------------------------------------------- */
function recipeKey(originalAssetId, recipe) {
  return sha256(String(originalAssetId) + '|' + JSON.stringify(recipe || {}) + '|v' + ((recipe && recipe.version) || 1));
}
function findOrPlanVariant(variants, originalAssetId, recipe) {
  const key = recipeKey(originalAssetId, recipe);
  const existing = (variants || []).find(v => v.recipeKey === key);
  if (existing) return { reused: true, recipeKey: key, variant: existing };
  return { reused: false, recipeKey: key, plan: newVariant({ originalAssetId, transformRecipe: recipe, recipeKey: key }) };
}
function buildEnhanceRecipe(kind, params) {
  if (kind === 'generative') return Object.assign({ kind: 'generative', generative: true, reviewRequired: true, version: 1 }, params || {});
  if (kind === 'upscale') return Object.assign({ kind: 'upscale', generative: false, reviewRequired: true, version: 1 }, params || {});
  return Object.assign({ kind: 'safe', ops: SAFE_ENHANCE, generative: false, reviewRequired: false, version: 1 }, params || {});
}

/* ============================================================================
   12. АВТО-АДАПТАЦИЯ ЛОГОТИПА (отдельное доп-ТЗ, 9.10.2026).
   Логотип анализируется ОДИН раз → профиль агентства → движок сам подбирает
   размещение под каждую обложку/фон/формат. Брокер видит готовый результат;
   ручные настройки — только для исключений. Безопасный фолбэк + объяснение,
   если идеального решения нет. Круглый не делаем квадратным, квадрат не режем в круг.
   ========================================================================== */
/* есть ли альфа-канал (прозрачность-способность) — из байтов формата */
function imageHasAlpha(buf, dims) {
  if (!dims) return false;
  try {
    if (dims.mime === 'image/png') { const ct = buf[25]; return ct === 4 || ct === 6; }  // 4=gray+a, 6=rgba
    if (dims.mime === 'image/webp') {
      const fourcc = buf.toString('ascii', 12, 16);
      if (fourcc === 'VP8X') return !!(buf[20] & 0x10);
      if (fourcc === 'VP8L') return !!(buf[24] & 0x10);
      return false;  // VP8 (lossy простой) — без альфы
    }
  } catch (e) { }
  return false;  // jpeg/gif/bmp — без альфы
}

/* ПРОФИЛЬ ЛОГОТИПА (строится 1 раз на загрузке; детерминированная часть + seam для vision/ручного).
   meta переопределяет субъективные поля (bgUniform/bgDark/markLuminance/hasFineText/trimmedBounds) —
   их задаёт vision-адаптер или оператор; без них движок идёт по безопасным умолчаниям. */
function analyzeLogo(buf, meta) {
  meta = meta || {};
  const dims = imageDims(buf);
  if (!dims) return { ok: false, corrupt: true, flags: ['corrupt'], confidence: 0 };
  const hasAlpha = imageHasAlpha(buf, dims);
  const ar = dims.width / dims.height;
  const orientation = ar >= 1.4 ? 'horizontal' : ar <= 0.72 ? 'vertical' : 'square';
  const bgMode = meta.bgMode || (hasAlpha ? 'transparent' : 'opaque');   // прозрачный фон → можно на фото
  const minSide = Math.min(dims.width, dims.height);
  const flags = [];
  if (minSide < 120) flags.push('low_resolution');
  const lowQ = minSide < 80 || !!meta.lowQuality;
  if (lowQ) flags.push('low_quality');
  if (meta.hasFineText) flags.push('fine_text');
  /* uniformity/dark известны ТОЛЬКО если их дал vision/оператор — иначе «не уверены» (safe) */
  const bgUniform = meta.bgUniform === undefined ? null : !!meta.bgUniform;
  const bgDark = meta.bgDark === undefined ? null : !!meta.bgDark;
  const confident = (bgUniform !== null || bgMode === 'transparent') && !lowQ;
  return {
    ok: true, corrupt: false, width: dims.width, height: dims.height, mime: dims.mime,
    orientation, aspect: +ar.toFixed(3), hasAlpha, bgMode, bgUniform, bgDark,
    markLuminance: meta.markLuminance != null ? meta.markLuminance : (bgMode === 'transparent' ? 0.9 : null),
    hasFineText: !!meta.hasFineText,
    trimmedBounds: meta.trimmedBounds || null,          // {x,y,w,h} видимого знака в долях (vision/ручное)
    dpiOkForPdf: minSide >= 200,
    flags,
    confidence: confident ? 0.9 : (lowQ ? 0.3 : 0.55),  // можно ли применить решение автоматически
  };
}

/* МИНИМАЛЬНЫЙ РАЗМЕР по видимому знаку + мелкой подписи (не делать слишком маленьким) */
const LOGO_MIN_PT = { withFineText: 120, normal: 72 };   // целевая высота логотипа на странице, px@96 (старт, калибруется)
/* ДОПУСТИМЫЕ АВТО-ОПЕРАЦИИ (границы доп-ТЗ п.5) */
const LOGO_AUTO = {
  can: ['compensate_empty_margins', 'scale_proportional', 'pick_approved_light_dark', 'move_within_allowed_zones', 'template_backing'],
  cannot: ['redraw', 'remove_caption', 'change_brand_colors', 'crop_elements', 'drop_any_white_bg'],
};

/* ВЫБОР РАЗМЕЩЕНИЯ: профиль × контекст слота → стратегия + причины + фолбэк.
   ctx: { onPhoto:bool (слот — фотообложка), calmArea:{available,bright 0..1}?, allowBand:bool,
          pageDark:bool, locked?:{strategy,zone} } */
function placeLogo(profile, ctx) {
  ctx = ctx || {};
  const reasons = [];
  if (!profile || profile.corrupt) return mkPlace('neutral_field', ['Логотип недоступен'], true, null, profile);

  /* закреплён пользователем — не двигаем молча; при смене формата проверяем и сообщаем о конфликте */
  if (ctx.locked) {
    const fits = logoFitsZone(profile, ctx, ctx.locked.strategy);
    return Object.assign(mkPlace(ctx.locked.strategy, ['Закреплено пользователем'], false, ctx.locked.zone, profile), { locked: true, conflict: !fits });
  }

  const transparent = profile.bgMode === 'transparent';
  const horiz = profile.orientation === 'horizontal';
  const vert = profile.orientation === 'vertical';
  const square = profile.orientation === 'square';

  /* низкое качество / неоднозначный исходник → безопасное размещение + предложить лучший файл */
  if ((profile.flags || []).includes('low_quality') || profile.confidence < 0.4) {
    reasons.push('Низкое качество или неоднозначный исходник — безопасное размещение, загрузите лучший файл');
    return mkPlace('brand_band', reasons, true, null, profile, { suggestBetterFile: true });
  }

  if (transparent) {
    if (ctx.onPhoto) {
      const calm = ctx.calmArea && ctx.calmArea.available;
      const logoLum = profile.markLuminance == null ? 0.9 : profile.markLuminance;
      const areaBright = ctx.calmArea ? ctx.calmArea.bright : 0.6;
      /* контраст проверяем под ВСЕЙ зоной знака, не по одной точке (светлое небо с облаками ≠ годится) */
      const contrastOk = Math.abs(logoLum - areaBright) >= 0.35;
      if (calm && contrastOk) {
        reasons.push('Прозрачный знак на спокойном участке с достаточным контрастом');
        return mkPlace(square ? 'compact_badge' : 'on_photo', reasons, false, null, profile);
      }
      reasons.push(calm ? 'Контраста на спокойном участке недостаточно → фирменная полоса' : 'Нет спокойного участка под знак → фирменная полоса');
      return mkPlace('brand_band', reasons, true, null, profile);   // фолбэк: вариант обложки с полосой
    }
    reasons.push(vert ? 'Вертикальный знак → боковая панель' : 'Прозрачный знак в верхней зоне');
    return mkPlace(vert ? 'side_panel' : 'on_photo', reasons, false, null, profile);
  }

  /* непрозрачный фон */
  if (profile.bgUniform === true) {
    if (profile.bgDark === true) { reasons.push('Однородный тёмный фон → фирменная полоса того же цвета'); return mkPlace('brand_band', reasons, false, null, profile); }
    reasons.push('Белый/светлый однородный фон → белое поле композиции'); return mkPlace('white_field', reasons, false, null, profile);
  }
  /* фон не однороден ИЛИ не уверены (готовая эмблема/сложный фон) → сохранить целиком на нейтральном поле */
  reasons.push('Сложный фон или готовая эмблема / нет уверенности → отдельное нейтральное поле (исходник целиком)');
  return mkPlace(vert ? 'side_panel' : 'neutral_field', reasons, false, null, profile);
}
function mkPlace(strategy, reasons, fallbackUsed, zone, profile, extra) {
  const fine = profile && profile.hasFineText;
  return Object.assign({
    strategy, zone: zone || defaultZone(strategy), reasons, fallbackUsed: !!fallbackUsed,
    minHeightPx: fine ? LOGO_MIN_PT.withFineText : LOGO_MIN_PT.normal,
    safePaddingPct: 0.04, keepProportions: true, backing: strategy === 'brand_band' || strategy === 'side_panel' || strategy === 'neutral_field',
  }, extra || {});
}
function defaultZone(strategy) {
  return strategy === 'brand_band' ? 'top_band' : strategy === 'side_panel' ? 'left_panel' :
    strategy === 'white_field' ? 'top_left_field' : strategy === 'neutral_field' ? 'top_left_field' :
    strategy === 'compact_badge' ? 'top_left_badge' : 'top_left';
}
/* помещается ли логотип в зону стратегии при данном контексте (для проверки закреплённого при смене формата) */
function logoFitsZone(profile, ctx, strategy) {
  if (strategy === 'on_photo' || strategy === 'compact_badge') {
    if (profile.bgMode !== 'transparent') return false;        // непрозрачный на фото не ложится
    const calm = ctx.calmArea && ctx.calmArea.available;
    const logoLum = profile.markLuminance == null ? 0.9 : profile.markLuminance;
    const areaBright = ctx.calmArea ? ctx.calmArea.bright : 0.6;
    return !!calm && Math.abs(logoLum - areaBright) >= 0.35;
  }
  return true;  // полоса/панель/поле — всегда помещаются (у них своя подложка)
}

module.exports = {
  sha256, imageDims, imageHasAlpha, FORMAT_PAGE_IN, SLOT_FRACTION, slotInches, PPI, effectivePPI,
  analyzeAsset, classifyMaterial, suitability, rankCovers, COVER_WEIGHTS,
  newAsset, newVariant, newPlacement, duplicateGroups, cropKeepsProtected, SAFE_ENHANCE,
  analyzeLogo, placeLogo, logoFitsZone, LOGO_AUTO, LOGO_MIN_PT,
  selectCover, cropForAspect, recomputeCropForFormat, exportMediaCheck,
  recipeKey, findOrPlanVariant, buildEnhanceRecipe,
};
