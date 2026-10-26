/* Lumen Presentation Builder — server module (TZ §2,§6,§9,§17,§20,§21,§24,§25).
   Wraps the shared pure renderer (public/pres-tokens.js + pres-templates.js) with:
   CRM adapter (property → PropertyPresentation draft), full-document HTML builder (web + print),
   preflight validation, publication snapshots, and the client-safe public projection. */
'use strict';
const crypto = require('crypto');
const TOK = require('../public/pres-tokens.js');
const T = require('../public/pres-templates.js');

const SCHEMA_VERSION = '1.0.0';
const RENDERER_VERSION = 'lumen-pres-r1';
const hex = (n) => crypto.randomBytes(n).toString('hex');
const esc = T.esc;

/* ---------- geo → locale labels + currency defaults ---------- */
const GEO = {
  dubai:  { region:'ДУБАЙ',  country:'ОАЭ',      currency:'AED' },
  sharjah:{ region:'ШАРДЖА', country:'ОАЭ',      currency:'AED' },
  bali:   { region:'БАЛИ',   country:'ИНДОНЕЗИЯ',currency:'USD' },
  phuket: { region:'ПХУКЕТ', country:'ТАИЛАНД',  currency:'THB' },
  thailand:{region:'ТАИЛАНД',country:'ТАИЛАНД',  currency:'THB' },
  spain:  { region:'ИСПАНИЯ',country:'ИСПАНИЯ',  currency:'EUR' },
  all:    { region:'',       country:'',         currency:'USD' },
};
const geoInfo = (g) => GEO[(g||'').toLowerCase()] || GEO.all;

/* ---------- brand (agency + broker) ---------- */
function brandFor(db, broker) {
  const s = (db.settings && db.settings.agency) || {};
  const logoText = (s.name || 'LUMEN').toUpperCase();
  const b = broker || {};
  const channels = {};
  if (b.phone) { channels.phone = b.phone; channels.whatsapp = String(b.phone).replace(/[^0-9]/g, ''); }
  if (b.email) channels.email = b.email;
  if (b.telegram) channels.telegram = b.telegram;
  if (s.site || b.site) channels.site = s.site || b.site;
  return {
    logoText,
    footer: `<span>${esc(logoText)}</span>`,
    broker: b.name ? {
      name: b.name, role: b.title || 'Ваш брокер по недвижимости', agency: s.name ? (s.name + ' REAL ESTATE').toUpperCase() : '',
      photo: b.photo || '', bio: b.bio || '', headline: 'Ваш эксперт', contactHeadline: 'Связаться с брокером',
      points: [], channels,
    } : null,
  };
}

/* ---------- assets map: resolve assetRefs → urls for a property ---------- */
function assetsForProperty(pr) {
  const m = {};
  (pr.images || []).forEach((u, i) => { m['img' + i] = { url: absUrl(u) }; });
  (pr.layouts || []).forEach((l, i) => { m['plan' + i] = { url: absUrl(l.url), label: l.label }; });
  if (pr.district && pr.district.mapUrl) m['map'] = { url: absUrl(pr.district.mapUrl) };
  return m;
}
const absUrl = (u) => (u && /^assets\//.test(u)) ? '/' + u : (u || '');
/* карта ассетов документа: подборка несёт свою мердж-карту (неймспейс o{k}_), объект — по projectId */
function assetsFor(db, pres) {
  if (pres && pres.collectionAssets) return pres.collectionAssets;
  const pr = (db.properties || []).find(p => p.id === (pres && pres.projectId)) || {};
  return assetsForProperty(pr);
}

/* ---------- content-binding helpers ---------- */
const ov = (v) => ({ mode: 'override', value: v });
const srcBind = (path, cached) => ({ mode: 'source', sourcePath: path, sourceRevision: 'crm', cachedValue: cached });

/* ---------- ADAPTER: property record → PropertyPresentation draft (TZ §3,§6) ---------- */
function draftFromProperty(db, pr, broker, opts) {
  opts = opts || {};
  const gi = geoInfo(pr.geo);
  const currency = pr.currency || gi.currency;
  const imgs = (pr.images || []);
  const units = (pr.units || []);
  const areas = units.map(u => +u.area).filter(Boolean);
  const areaRange = areas.length ? { from: Math.min(...areas), to: Math.max(...areas), unit: 'm2' } : null;

  const sections = [];
  const sid = () => 's' + hex(3);

  // hero (always) — cover photo or brand fill
  sections.push({
    id: sid(), family: 'hero', enabled: true,
    assetRefs: imgs[0] ? [{ assetId: 'img0', role: 'hero', fit: 'cover', focalPoint: { x: .5, y: .5 } }] : [],
    contentBindings: {
      title: srcBind('name', pr.name),
      subtitle: pr.hookTitle ? ov(pr.hookTitle) : ov(''),
      locationLabel: ov([gi.region, gi.country].filter(Boolean)),
      price: pr.priceFrom ? ov({ kind: 'from', amount: pr.priceFrom, currency }) : undefined,
      metrics: ov(heroMetrics(pr, areaRange)),
    },
  });

  // editorial (description) — suggestion if empty
  sections.push({
    id: sid(), family: 'editorial', enabled: !!(pr.description && pr.description.trim()),
    assetRefs: imgs[1] ? [{ assetId: 'img1', fit: 'cover' }] : (imgs[0] ? [{ assetId: 'img0', fit: 'cover' }] : []),
    contentBindings: {
      eyebrow: ov([pr.type || 'Проект', gi.region].filter(Boolean)),
      title: ov('О проекте'),
      body: srcBind('description', pr.description || ''),
      metrics: ov(keyMetrics(pr, areaRange, currency)),
    },
  });

  // gallery — if ≥2 photos
  if (imgs.length >= 2) sections.push({
    id: sid(), family: 'gallery', enabled: true,
    assetRefs: imgs.slice(0, TOK.LIMITS.assetsPerSection).map((_, i) => ({ assetId: 'img' + i })),
    contentBindings: { eyebrow: ov('Галерея'), title: ov('Интерьеры и территория') },
  });

  // location — if district with places
  /* ⚠️ «0 мин» не выводим: 0/пусто = время не определено → скрываем (показывали «0 мин» рядом с «350 м»). */
  const places = (pr.district && Array.isArray(pr.district.times)) ? pr.district.times.map(t => ({ name: t.place, distance: (t.min != null && +t.min > 0) ? (t.min + ' мин') : '' })) : [];
  sections.push({
    id: sid(), family: 'location', enabled: places.length > 0,
    assetRefs: (pr.district && pr.district.mapUrl) ? [{ assetId: 'map', role: 'map' }] : (imgs[2] ? [{ assetId: 'img2', role: 'map' }] : []),
    contentBindings: {
      eyebrow: ov('Локация'),
      title: ov(pr.district && pr.district.name ? pr.district.name : (gi.region ? gi.region : 'Локация')),
      nearbyPlaces: ov(places),
    },
  });

  // floorplan — if a layout/plan exists
  const plan0 = (pr.layouts || [])[0];
  if (plan0) sections.push({
    id: sid(), family: 'floorplan', enabled: true,
    assetRefs: [{ assetId: 'plan0', fit: 'contain' }],
    contentBindings: {
      eyebrow: ov('Планировка'), title: ov(plan0.label || 'Планировка'),
      params: ov(planParams(units[0], pr)),
    },
  });

  // payment — from paymentRows
  const rows = Array.isArray(pr.paymentRows) ? pr.paymentRows.filter(r => r && r.pct != null) : [];
  if (rows.length) sections.push({
    id: sid(), family: 'payment', enabled: true,
    contentBindings: {
      eyebrow: ov('Условия'), title: ov('План оплаты'),
      plan: ov({
        kind: 'full',
        basePrice: pr.priceFrom ? { amount: pr.priceFrom, currency } : null,
        stages: rows.map(r => ({ name: r.label || '', percent: String(r.pct), amountMode: 'calculated' })),
      }),
    },
  });

  // benefits — whyRent or amenities
  const benefits = benefitItems(pr);
  if (benefits.length) sections.push({
    id: sid(), family: 'benefits', enabled: true,
    assetRefs: imgs[3] ? [{ assetId: 'img3', fit: 'cover' }] : (imgs[1] ? [{ assetId: 'img1', fit: 'cover' }] : []),
    contentBindings: { eyebrow: ov('Почему этот проект'), title: ov('Преимущества'), items: ov(benefits) },
  });

  return {
    id: 'pres_' + hex(5), schemaVersion: SCHEMA_VERSION, tenantId: store_currentTid(),
    brokerId: broker ? broker.id : null, projectId: pr.id, unitId: null,
    locale: 'ru-RU', draftRevision: 1, sourceRevision: 'crm',
    theme: (opts.presetId && TOK.presetTheme(opts.presetId)) || { paletteId: defaultPalette(pr.geo), fontPairId: 'editorial' },
    defaultFormat: 'portrait_a4', status: 'draft',
    orderedSections: sections,
    brokerAppendix: { enabled: !!(broker && broker.name), profileId: broker ? broker.id : null, pageTypes: ['broker_intro', 'broker_contacts'] },
    updatedAt: Date.now(), updatedBy: null,
  };
}
/* сравнение объектов по критериям (ТЗ v3 §11): единицы/валюта явно, «Не указано» вместо 0/выдумки */
function buildComparison(db, props) {
  const criteria = [
    { key: 'location', label: 'Локация' }, { key: 'type', label: 'Тип' },
    { key: 'price', label: 'Цена от' }, { key: 'area', label: 'Площадь' },
    { key: 'beds', label: 'Спальни' }, { key: 'handover', label: 'Срок сдачи' },
  ];
  const objects = (props || []).map(pr => {
    const gi = geoInfo(pr.geo);
    const currency = pr.currency || gi.currency;
    const areas = (pr.units || []).map(u => +u.area).filter(Boolean);
    const areaRange = areas.length ? { from: Math.min(...areas), to: Math.max(...areas), unit: 'm2' } : null;
    return {
      name: pr.name || 'Объект',
      values: {
        location: (pr.district && pr.district.name) || gi.region || null,
        type: pr.type || null,
        price: pr.priceFrom ? T.fmtPrice({ kind: 'from', amount: pr.priceFrom, currency }) : null,
        area: areaRange ? T.fmtArea(areaRange) : null,
        beds: pr.beds != null ? bedsLabel(pr.beds) : null,
        handover: pr.handover || null,
      },
    };
  });
  return { criteria, objects };
}

/* ---------- ADAPTER: несколько объектов → мульти-объектная подборка (ТЗ v3 §9,§10) ----------
   Переиспользует draftFromProperty для каждого объекта; ассеты неймспейсятся o{k}_ и
   собираются в collectionAssets (одна мердж-карта). Структура §10: Вступление → Объект₁..ₙ →
   [Сравнение/Рекомендация — позже] → ОДНА пара страниц брокера в конце (brokerAppendix).
   Рендер/снимок/проекция/валидация работают без изменений через assetsFor(). */
function ruPlural(n, one, few, many) { const a = Math.abs(n) % 100, b = a % 10; if (a > 10 && a < 20) return many; if (b > 1 && b < 5) return few; if (b === 1) return one; return many; }
/* «Соединяющие» подборки: делают переход от презентации ОДНОГО объекта к клиентской
   подборке логичным — клиент сперва видит карту всех объектов (оглавление), а на обложке
   каждого объекта стоит пометка его позиции «k из N». */
function collContentsItem(pr, k) {
  const gi = geoInfo(pr.geo); const cur = pr.currency || gi.currency;
  return {
    name: pr.name || ('Объект ' + (k + 1)),
    place: [gi.region, gi.country].filter(Boolean).join(' · '),
    price: (pr.priceFrom != null && pr.priceFrom !== '') ? { kind: 'from', amount: pr.priceFrom, currency: cur } : null,
  };
}
// пометка «Объект k из N» в eyebrow (locationLabel) обложки объекта внутри подборки
function tagObjectHeroSeq(objSections, pr, k, n) {
  const hero = (objSections || []).filter(s => s.family === 'hero')[0]; if (!hero) return;
  const gi = geoInfo(pr.geo);
  hero.contentBindings = hero.contentBindings || {};
  hero.contentBindings.locationLabel = ov(['Объект ' + (k + 1) + ' из ' + n].concat([gi.region, gi.country].filter(Boolean)));
}
function draftCollection(db, properties, broker, opts) {
  opts = opts || {};
  const props = (properties || []).filter(Boolean);
  const sections = []; const assets = {};
  const sid = () => 's' + hex(3);
  const first = props[0] || {};
  const gi0 = geoInfo(first.geo);
  // Вступление / обложка подборки (персонализируется первой страницей — ТЗ §9 шаг2)
  const introImg = (first.images || [])[0];
  if (introImg) assets['intro_hero'] = { url: absUrl(introImg) };
  sections.push({
    id: sid(), family: 'hero', enabled: true,
    assetRefs: introImg ? [{ assetId: 'intro_hero', role: 'hero', fit: 'cover', focalPoint: { x: .5, y: .5 } }] : [],
    contentBindings: {
      title: ov(opts.title || 'Подборка объектов'),
      subtitle: opts.greeting ? ov(opts.greeting) : ov(''),
      locationLabel: ov(opts.clientName ? ['Подготовлено для ' + opts.clientName] : [gi0.region, gi0.country].filter(Boolean)),
      metrics: ov([{ value: String(props.length), label: ruPlural(props.length, 'объект', 'объекта', 'объектов'), icon: 'home' }]),
    },
  });
  const N = props.length;
  // Оглавление («соединяющая» страница): карта всех объектов перед подробными страницами (при ≥2)
  if (N >= 2) {
    sections.push({
      id: sid(), family: 'contents', enabled: true,
      contentBindings: {
        eyebrow: ov(['Подборка']),
        title: ov('В этой подборке'),
        subtitle: ov('Мы подобрали ' + N + ' ' + ruPlural(N, 'объект', 'объекта', 'объектов') + (opts.clientName ? ' под ваш запрос' : '') + '. Ниже — коротко о каждом, далее — подробные страницы' + (opts.comparison !== false ? ' и сравнение' : '') + '.'),
        items: ov(props.map((pr, k) => collContentsItem(pr, k))),
      },
    });
  }
  // Объекты: секции каждого объекта с неймспейсом ассетов (без его собственного брокер-финала)
  props.forEach((pr, k) => {
    const d = draftFromProperty(db, pr, null);
    if (N >= 2) tagObjectHeroSeq(d.orderedSections, pr, k, N);
    const amap = assetsForProperty(pr);
    const ns = 'o' + k + '_';
    Object.keys(amap).forEach(key => { assets[ns + key] = amap[key]; });
    (d.orderedSections || []).filter(s => s.family !== 'broker').forEach(s => {
      sections.push(Object.assign({}, s, {
        id: ns + s.id,
        assetRefs: (s.assetRefs || []).map(r => Object.assign({}, r, { assetId: ns + r.assetId })),
      }));
    });
  });
  // Сравнение (явно, при ≥2 объектах — §10/§11)
  if (opts.comparison && props.length >= 2) {
    const cmp = buildComparison(db, props);
    sections.push({
      id: sid(), family: 'comparison', enabled: true,
      contentBindings: { eyebrow: ov('Сравнение'), title: ov('Сравнение объектов'), criteria: ov(cmp.criteria), objects: ov(cmp.objects) },
    });
  }
  // Рекомендация брокера (подписанная, §11) — опционально
  if (opts.recommendation) {
    sections.push({
      id: sid(), family: 'recommendation', enabled: true,
      contentBindings: { eyebrow: ov('Рекомендация'), title: ov('Рекомендация брокера'), body: ov(opts.recommendationText || ''), author: ov(opts.recommendationAuthor || (broker && broker.name) || '') },
    });
  }
  const presetTh = opts.presetId ? TOK.presetTheme(opts.presetId) : null;
  return {
    id: 'pres_' + hex(5), kind: 'collection', schemaVersion: SCHEMA_VERSION, tenantId: store_currentTid(),
    brokerId: broker ? broker.id : null, clientId: opts.clientId || null,
    projectId: null, projectIds: props.map(p => p.id), title: opts.title || 'Подборка объектов',
    locale: 'ru-RU', draftRevision: 1, sourceRevision: 'crm',
    theme: presetTh || { paletteId: opts.paletteId || defaultPalette(first.geo), fontPairId: 'editorial' },
    defaultFormat: opts.format || 'portrait_a4', status: 'draft',
    orderedSections: sections, collectionAssets: assets,
    brokerAppendix: { enabled: !!(broker && broker.name), profileId: broker ? broker.id : null, pageTypes: ['broker_intro', 'broker_contacts'] },
    updatedAt: Date.now(), updatedBy: null,
  };
}
/* Замена объекта в подборке (ТЗ v3 §8): новый объект занимает МЕСТО старого, его страницы/
   ассеты пересобираются заново; локальные тексты старого объекта НЕ переносятся. Остальные
   объекты и их правки не трогаются. Контакты брокера (финал) не затрагиваются. */
function replaceObjectInCollection(db, coll, oldPid, newPid) {
  if (!coll || coll.kind !== 'collection') return { error: 'not a collection' };
  const idx = (coll.projectIds || []).indexOf(oldPid);
  if (idx < 0) return { error: 'object not in collection' };
  if ((coll.projectIds || []).includes(newPid)) return { error: 'object already in collection' };
  const newPr = (db.properties || []).find(x => x.id === newPid);
  if (!newPr) return { error: 'new property not found' };
  const ns = 'o' + idx + '_';
  coll.orderedSections = coll.orderedSections || [];
  coll.collectionAssets = coll.collectionAssets || {};
  const insertAt = coll.orderedSections.findIndex(s => String(s.id || '').startsWith(ns));
  coll.orderedSections = coll.orderedSections.filter(s => !String(s.id || '').startsWith(ns));
  Object.keys(coll.collectionAssets).forEach(k => { if (k.startsWith(ns)) delete coll.collectionAssets[k]; });
  const amap = assetsForProperty(newPr);
  Object.keys(amap).forEach(key => { coll.collectionAssets[ns + key] = amap[key]; });
  const d = draftFromProperty(db, newPr, null);
  const N = (coll.projectIds || []).length;
  if (N >= 2) tagObjectHeroSeq(d.orderedSections, newPr, idx, N);
  const newSecs = (d.orderedSections || []).filter(s => s.family !== 'broker').map(s => Object.assign({}, s, {
    id: ns + s.id, assetRefs: (s.assetRefs || []).map(r => Object.assign({}, r, { assetId: ns + r.assetId })),
  }));
  const at = insertAt < 0 ? coll.orderedSections.length : insertAt;
  coll.orderedSections.splice(at, 0, ...newSecs);
  // синхронизируем «соединяющее» оглавление: пункт заменённого объекта
  const toc = coll.orderedSections.filter(s => s.family === 'contents')[0];
  if (toc && toc.contentBindings && toc.contentBindings.items) {
    const arr = (toc.contentBindings.items.value || []).slice();
    if (arr[idx]) { arr[idx] = collContentsItem(newPr, idx); toc.contentBindings.items = ov(arr); }
  }
  coll.projectIds[idx] = newPid;
  coll.draftRevision = (coll.draftRevision || 1) + 1;
  coll.updatedAt = Date.now();
  return { ok: true, replaced: { from: oldPid, to: newPid, index: idx, pages: newSecs.length } };
}
/* Diff объекта в подборке против живой карточки (ТЗ v3 §14, экран «Обновить данные объекта»).
   «В подборке» = значение в документе (override если правлено, иначе cached из источника);
   «В карточке» = живое поле. Возвращает поля с расхождением + было ли правлено вручную. */
function objSectionsOf(coll, k) { return (coll.orderedSections || []).filter(function (s) { return String(s.id || '').indexOf('o' + k + '_') === 0; }); }
function readBinding(sec, key) {
  var b = (sec && sec.contentBindings || {})[key]; if (!b) return null;
  var docV = b.mode === 'override' ? b.value : (b.cachedValue !== undefined ? b.cachedValue : b.value);
  return { docV: docV, edited: b.mode === 'override' };
}
function objectUpdates(db, coll, k) {
  if (!coll || coll.kind !== 'collection') return { error: 'not a collection' };
  var pid = (coll.projectIds || [])[k];
  var pr = (db.properties || []).find(function (x) { return x.id === pid; }) || {};
  var secs = objSectionsOf(coll, k);
  var diffs = [];
  var ed = secs.filter(function (s) { return s.family === 'editorial'; })[0];
  var d = ed && readBinding(ed, 'body');
  if (d && String(d.docV || '') !== String(pr.description || '')) diffs.push({ field: 'Описание', key: 'description', inDoc: d.docV || '—', inCard: pr.description || '—', edited: d.edited });
  var hero = secs.filter(function (s) { return s.family === 'hero'; })[0];
  var p = hero && readBinding(hero, 'price');
  if (p) { var amt = (p.docV && p.docV.amount != null) ? p.docV.amount : null; if (String(amt) !== String(pr.priceFrom == null ? '' : pr.priceFrom)) diffs.push({ field: 'Цена от', key: 'price', inDoc: amt, inCard: pr.priceFrom, edited: p.edited, currency: (p.docV && p.docV.currency) || pr.currency }); }
  // срок сдачи — ищем метрику с подписью про сдачу
  var metSec = secs.filter(function (s) { return readBinding(s, 'metrics'); })[0];
  if (metSec) { var mb = readBinding(metSec, 'metrics'); var arr = (mb && mb.docV) || []; var hv = arr.filter(function (m) { return /сдач/i.test(m.label || ''); })[0]; var docH = hv ? hv.value : ''; if (String(docH || '') !== String(pr.handover || '') && (docH || pr.handover)) diffs.push({ field: 'Срок сдачи', key: 'handover', inDoc: docH || 'Нет данных', inCard: pr.handover || 'Нет данных', edited: false }); }
  return { object: pr.name || 'Объект', projectId: pid, index: k, diffs: diffs };
}
function applyObjectUpdates(db, coll, k, fields) {
  var pid = (coll.projectIds || [])[k];
  var pr = (db.properties || []).find(function (x) { return x.id === pid; }) || {};
  var secs = objSectionsOf(coll, k);
  var want = {}; (fields || []).forEach(function (f) { want[f] = true; });
  var applied = 0;
  if (want.description) { var ed = secs.filter(function (s) { return s.family === 'editorial'; })[0]; if (ed) { ed.contentBindings = ed.contentBindings || {}; ed.contentBindings.body = { mode: 'source', sourcePath: 'description', sourceRevision: 'crm', cachedValue: pr.description || '' }; applied++; } }
  if (want.price) { var hero = secs.filter(function (s) { return s.family === 'hero'; })[0]; if (hero) { hero.contentBindings = hero.contentBindings || {}; hero.contentBindings.price = { mode: 'override', value: { kind: 'from', amount: pr.priceFrom, currency: pr.currency || 'USD' } }; applied++; } }
  if (want.handover) { var metSec = secs.filter(function (s) { return readBinding(s, 'metrics'); })[0]; if (metSec) { var mb = readBinding(metSec, 'metrics'); var arr = ((mb && mb.docV) || []).slice(); var found = false; arr = arr.map(function (m) { if (/сдач/i.test(m.label || '')) { found = true; return Object.assign({}, m, { value: String(pr.handover || '') }); } return m; }); if (!found && pr.handover) arr.push({ value: String(pr.handover), label: 'сдача', icon: 'calendar' }); metSec.contentBindings.metrics = { mode: 'override', value: arr }; applied++; } }
  if (applied) { coll.draftRevision = (coll.draftRevision || 1) + 1; coll.updatedAt = Date.now(); }
  return { ok: true, applied: applied };
}
/* История версий (ТЗ v3 §6, экран «История версий»). Версия пишется на КЛЮЧЕВЫХ действиях
   (публикация/замена/обновления/пресет/восстановление), не на каждом автосейве. */
function snapOf(coll) {
  return { orderedSections: JSON.parse(JSON.stringify(coll.orderedSections || [])), theme: JSON.parse(JSON.stringify(coll.theme || {})), title: coll.title || '', projectIds: (coll.projectIds || []).slice() };
}
function pushHistory(coll, type, by, label) {
  coll.history = coll.history || [];
  coll.history.push({ id: 'v' + hex(5), at: Date.now(), by: by || '', type: type, label: label || '', snap: snapOf(coll) });
  if (coll.history.length > 40) coll.history = coll.history.slice(-40);
}
function snapObjectNames(db, snap) {
  return (snap.projectIds || []).map(function (pid) { var p = (db.properties || []).find(function (x) { return x.id === pid; }); return { id: pid, name: (p && p.name) || 'Объект', priceFrom: p && p.priceFrom, currency: p && p.currency, geo: p && p.geo }; });
}
function historyDiff(db, a, b) {   /* a = старая версия, b = текущая */
  var nm = function (pid) { var p = (db.properties || []).find(function (x) { return x.id === pid; }); return (p && p.name) || pid; };
  var fromN = (a.projectIds || []).length, toN = (b.projectIds || []).length, out = [];
  out.push({ icon: 'grid', title: 'Объектов: ' + fromN + ' → ' + toN, sub: fromN === toN ? 'Количество объектов не изменилось' : 'Состав изменился' });
  var repl = [], n = Math.max(fromN, toN);
  for (var i = 0; i < n; i++) { var pa = (a.projectIds || [])[i], pb = (b.projectIds || [])[i]; if (pa && pb && pa !== pb) repl.push([pa, pb]); }
  if (repl.length) out.push({ icon: 'image', title: 'Заменён ' + repl.length + ' ' + (repl.length === 1 ? 'объект' : 'объекта'), sub: repl.map(function (r) { return nm(r[0]) + ' → ' + nm(r[1]); }).join(', ') });
  if ((a.title || '') !== (b.title || '')) out.push({ icon: 'text', title: 'Изменено название подборки', sub: (a.title || '—') + ' → ' + (b.title || '—') });
  var introA = JSON.stringify((a.orderedSections || []).filter(function (s) { return !/^o\d+_/.test(s.id || ''); }).slice(0, 1));
  var introB = JSON.stringify((b.orderedSections || []).filter(function (s) { return !/^o\d+_/.test(s.id || ''); }).slice(0, 1));
  if (introA !== introB) out.push({ icon: 'text', title: 'Изменено вступление', sub: 'Обновлён текст или акценты в описании подборки' });
  if (out.length === 1 && fromN === toN) out.push({ icon: 'db', title: 'Правки содержания', sub: 'Тексты, фото или оформление страниц' });
  return out;
}
function historyList(db, coll) {
  var cur = snapOf(coll);
  var versions = (coll.history || []).slice().reverse().map(function (h) {
    return { id: h.id, at: h.at, by: h.by, type: h.type, label: h.label, objects: snapObjectNames(db, h.snap), diff: historyDiff(db, h.snap, cur) };
  });
  return { current: { title: cur.title, objects: snapObjectNames(db, cur) }, versions: versions };
}
function restoreVersion(coll, versionId) {
  var h = (coll.history || []).filter(function (x) { return x.id === versionId; })[0];
  if (!h) return { error: 'version not found' };
  pushHistory(coll, 'restore', coll._by || '', 'Восстановлено из версии');   /* фиксируем текущее перед откатом */
  coll.orderedSections = JSON.parse(JSON.stringify(h.snap.orderedSections || []));
  coll.theme = JSON.parse(JSON.stringify(h.snap.theme || {}));
  coll.title = h.snap.title || coll.title;
  coll.projectIds = (h.snap.projectIds || []).slice();
  coll.draftRevision = (coll.draftRevision || 1) + 1; coll.updatedAt = Date.now();
  return { ok: true, restored: versionId };
}
let _tidGetter = () => 'primary';
function store_currentTid() { try { return _tidGetter(); } catch { return 'primary'; } }
function setTidGetter(fn) { _tidGetter = fn; }

function defaultPalette(geo) {
  const g = (geo || '').toLowerCase();
  if (g === 'dubai' || g === 'sharjah') return 'sand';
  if (g === 'bali' || g === 'phuket' || g === 'thailand') return 'sage';
  return 'burgundy';
}
function heroMetrics(pr, areaRange) {
  const out = [];
  if (pr.beds != null) out.push(bedsMetric(pr.beds, 'спальни'));
  if (areaRange) out.push({ value: T.fmtArea(areaRange), label: 'площадь', icon: 'area' });
  if (pr.handover) out.push({ value: String(pr.handover), label: 'сдача', icon: 'calendar' });
  if (pr.developer) out.push({ value: pr.developer, label: 'застройщик', icon: 'shield' });
  return out.slice(0, 4);
}
function keyMetrics(pr, areaRange, currency) {
  const out = [];
  if (pr.priceFrom) out.push({ value: T.fmtPrice({ kind: 'from', amount: pr.priceFrom, currency }), label: 'стоимость', icon: 'tag' });
  if (areaRange) out.push({ value: T.fmtArea(areaRange), label: 'площадь', icon: 'area' });
  if (pr.beds != null) out.push(bedsMetric(pr.beds, 'варианты планировок'));
  if (pr.handover) out.push({ value: String(pr.handover), label: 'планируемая сдача', icon: 'calendar' });
  return out.slice(0, 4);
}
function isStudio(b) { return b === 0 || /студ|studio/i.test(String(b)); }
function bedsLabel(b) { if (b === 0) return 'студия'; if (typeof b === 'string') return b; return b + (b >= 5 ? '+' : '') + ' спал.'; }
/* ТЗ §5: студия — это ТИП, а не количество спален. Не писать «студия / спальни». */
function bedsMetric(beds, label, icon) {
  if (isStudio(beds)) return { value: 'Студия', label: 'тип', icon: icon || 'bed' };
  return { value: bedsLabel(beds), label: label, icon: icon || 'bed' };
}
function planParams(unit, pr) {
  const p = [];
  if (unit) { if (unit.area) p.push({ label: 'Площадь', value: unit.area + ' м²' }); if (unit.floor) p.push({ label: 'Этаж', value: unit.floor }); if (unit.view) p.push({ label: 'Вид', value: unit.view }); }
  if (pr.beds != null && !p.find(x => /спал|тип/i.test(x.label))) p.push(isStudio(pr.beds) ? { label: 'Тип', value: 'Студия' } : { label: 'Спальни', value: bedsLabel(pr.beds) });
  return p;
}
function benefitItems(pr) {
  if (Array.isArray(pr.whyRent) && pr.whyRent.length) return pr.whyRent.slice(0, 5).map(w => typeof w === 'string' ? { title: w } : { title: w.title || w.label || '', desc: w.desc || '' });
  if (Array.isArray(pr.amenities) && pr.amenities.length) return pr.amenities.slice(0, 5).map(a => ({ title: typeof a === 'string' ? a : (a.name || '') }));
  return [];
}

/* ---------- render context + pages ---------- */
function ctxFor(db, pres, broker, format) {
  const pr = (db.properties || []).find(p => p.id === pres.projectId) || {};
  const brand = brandFor(db, broker);
  // merge adapter broker points (static map) if broker appendix enabled
  if (brand.broker) brand.broker.points = brokerPoints(broker);
  return {
    format: format || pres.defaultFormat, theme: pres.theme,
    assets: assetsFor(db, pres), brand, source: pr, opts: {},
  };
}
function brokerPoints(b) {
  const pts = (b && Array.isArray(b.cardPoints)) ? b.cardPoints : null;
  if (pts && pts.length) return pts.slice(0, 3);
  return [
    { icon: 'home', title: 'Подбор объектов', desc: 'под ваш запрос' },
    { icon: 'chat', title: 'Консультации', desc: 'на вашем языке' },
    { icon: 'doc', title: 'Сопровождение сделки', desc: 'до передачи ключей' },
  ];
}
function renderPages(db, pres, broker, format) {
  const ctx = ctxFor(db, pres, broker, format);
  // broker appendix sections appended at the very end (TZ §18,§19) if enabled and not already present
  const doc = withBrokerAppendix(pres);
  return T.renderDocument(doc, ctx);
}
function withBrokerAppendix(pres) {
  const has = (pres.orderedSections || []).some(s => s.family === 'broker');
  if (!pres.brokerAppendix || !pres.brokerAppendix.enabled || has) return pres;
  const extra = (pres.brokerAppendix.pageTypes || ['broker_intro', 'broker_contacts']).map(pt => ({
    id: 'b_' + pt, family: 'broker', enabled: true, pageType: pt, contentBindings: {},
  }));
  return Object.assign({}, pres, { orderedSections: (pres.orderedSections || []).concat(extra) });
}

/* ---------- full-document HTML (web + print) (TZ §20,§23) ---------- */
function pageCssSize(fmt) {
  const f = TOK.format(fmt);
  return `${f.widthMm}mm ${f.heightMm}mm`;
}
function documentHTML(db, pres, broker, opts) {
  opts = opts || {};
  const format = opts.format || pres.defaultFormat;
  const f = TOK.format(format);
  const pages = renderPages(db, pres, broker, format);
  const title = titleOf(db, pres);
  const stageCss = `
    html,body{margin:0;background:#edeae4;}
    .lp-doc{display:flex;flex-direction:column;align-items:center;gap:22px;padding:22px 10px;}
    .lp-stage{width:100%;max-width:${f.cssW}px;}
    .lp-fit{transform-origin:top left;}
    @media print{
      html,body{background:#fff;} .lp-doc{gap:0;padding:0;}
      .lp-stage{max-width:none;width:auto;} .lp-fit{transform:none !important;width:${f.cssW}px;height:${f.cssH}px;}
      @page{size:${pageCssSize(format)};margin:0;}
    }`;
  const scaleScript = `(function(){
    function fit(){var W=document.querySelector('.lp-doc').clientWidth-20;var cw=${f.cssW},ch=${f.cssH};
      document.querySelectorAll('.lp-stage').forEach(function(st){var s=Math.min(1,(Math.min(W,${f.cssW}))/cw);
        var fit=st.firstElementChild; fit.style.transform='scale('+s+')'; st.style.height=(ch*s)+'px';});}
    window.addEventListener('resize',fit); window.addEventListener('load',fit); document.fonts&&document.fonts.ready.then(fit); fit();
  })();`;
  const body = pages.map(p => `<div class="lp-stage"><div class="lp-fit">${p.html}</div></div>`).join('');
  return `<!doctype html><html lang="${(pres.locale || 'ru').slice(0, 2)}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
${opts.noindex !== false ? '<meta name="robots" content="noindex,nofollow">' : ''}
<link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2032%2032'%3E%3Crect%20width='32'%20height='32'%20rx='7'%20fill='%231a1712'/%3E%3Cpath%20d='M16%204.4L18.7%2013.3L27.6%2016L18.7%2018.7L16%2027.6L13.3%2018.7L4.4%2016L13.3%2013.3Z'%20fill='%23ffffff'/%3E%3C/svg%3E"><link rel="stylesheet" href="/pres-styles.css">
<style>${stageCss}</style>
</head><body><div class="lp-doc">${body}</div><script>${scaleScript}</script></body></html>`;
}
function titleOf(db, pres) {
  if (pres && pres.kind === 'collection') return pres.title || 'Подборка объектов';
  const pr = (db.properties || []).find(p => p.id === pres.projectId);
  return (pr && pr.name) || 'Презентация';
}

/* ---------- preflight validation (TZ §24) ---------- */
function validate(db, pres, format) {
  const issues = [];
  const pr = (db.properties || []).find(p => p.id === pres.projectId) || {};
  const assets = assetsFor(db, pres);
  const enabled = (pres.orderedSections || []).filter(s => s.enabled !== false);
  if (!enabled.length) issues.push({ code: 'EMPTY_DOC', severity: 'blocking', message: 'Нет ни одной включённой страницы', suggestedAction: 'Выберите структуру' });

  enabled.forEach(sec => {
    const c = T.content(sec, pr);
    // missing enabled photo (TZ §24 blocking)
    (sec.assetRefs || []).forEach(ref => {
      const url = (assets[ref.assetId] || {}).url || ref.url;
      if (ref.assetId && !url) issues.push({ code: 'MISSING_ASSET', severity: 'blocking', sectionId: sec.id, message: 'Отсутствует включённое изображение', suggestedAction: 'Заменить или исключить блок' });
    });
    // hero/editorial require a title
    if ((sec.family === 'hero') && !c.title) issues.push({ code: 'TEXT_OVERFLOW', severity: 'blocking', sectionId: sec.id, message: 'Не заполнен заголовок обложки', suggestedAction: 'Перейти к полю' });
    // payment math (TZ §17)
    if (sec.family === 'payment' && c.plan) {
      const v = T.validatePayment(c.plan);
      v.issues.forEach(i => issues.push(Object.assign({ sectionId: sec.id, suggestedAction: 'Исправить проценты' }, i)));
    }
    // date conflict: quarter vs explicit date (TZ §6 Title Olive example)
    if (c.completion && typeof c.completion === 'object' && c.completion.quarter && c.completion.date) {
      issues.push({ code: 'SOURCE_CONFLICT', severity: 'blocking', sectionId: sec.id, message: 'Противоречивый срок сдачи (квартал и дата)', suggestedAction: 'Исправить или скрыть поле' });
    }
  });

  // theme contrast (TZ §13)
  const pal = TOK.palette(pres.theme && pres.theme.paletteId).c;
  if (TOK.contrast(pal.text, pal.background) < TOK.CONTRAST.normalTextMin)
    issues.push({ code: 'LOW_CONTRAST', severity: 'blocking', message: 'Недостаточный контраст текста и фона', suggestedAction: 'Выбрать другую палитру' });

  const pageCount = renderPages(db, pres, brokerOf(db, pres), format || pres.defaultFormat).length;
  return {
    issues,
    pageCount,
    ok: !issues.some(i => i.severity === 'blocking'),
    steps: readinessSteps(db, pres, issues),
  };
}
function brokerOf(db, pres) { return (db.brokers || []).find(b => b.id === pres.brokerId) || null; }

// readiness helper "N из 5 шагов" (TZ §5)
function readinessSteps(db, pres, issues) {
  const pr = (db.properties || []).find(p => p.id === pres.projectId) || {};
  const s1 = !!(pr.name); // данные
  const s2 = (pres.orderedSections || []).some(s => s.enabled !== false); // страницы
  const s3 = !issues.some(i => i.code === 'MISSING_ASSET' || i.code === 'LOW_IMAGE_DPI'); // материалы
  const s4 = !issues.some(i => i.code === 'TEXT_OVERFLOW' || i.code === 'FONT_MISSING' || i.code === 'LOW_CONTRAST'); // оформление
  const s5 = !!(pres.brokerAppendix && pres.brokerAppendix.enabled) && !issues.some(i => i.severity === 'blocking'); // выпуск
  const done = [s1, s2, s3, s4, s5].filter(Boolean).length;
  const next = !s1 ? 'Заполните основные данные' : !s2 ? 'Выберите структуру страниц' : !s3 ? 'Замените недоступные изображения' : !s4 ? 'Исправьте оформление' : !s5 ? 'Заполните визитку и проверьте выпуск' : 'Готово к выпуску';
  return { done, total: 5, next };
}

/* ---------- publication snapshot (TZ §21) ---------- */
function makeSnapshot(db, pres, format) {
  const broker = brokerOf(db, pres);
  const fmt = format || pres.defaultFormat;
  const doc = withBrokerAppendix(pres);
  const pr = (db.properties || []).find(p => p.id === pres.projectId) || {};
  const amap = assetsFor(db, pres);
  // resolve bindings to concrete values (freeze)
  const resolvedSections = (doc.orderedSections || []).filter(s => s.enabled !== false).map(s => ({
    id: s.id, family: s.family, pageType: s.pageType || null,
    content: T.content(s, pr), assetRefs: (s.assetRefs || []).map(r => Object.assign({}, r, { url: (amap[r.assetId] || {}).url || r.url })),
  }));
  const snap = {
    id: 'snap_' + hex(6), presentationId: pres.id, revision: pres.draftRevision,
    schemaVersion: SCHEMA_VERSION, rendererVersion: RENDERER_VERSION,
    format: fmt, locale: pres.locale, theme: pres.theme,
    themeTokens: TOK.themeVars(pres.theme),
    resolvedSections,
    broker: broker ? brandFor(db, broker).broker : null,
    brand: { logoText: brandFor(db, broker).logoText },
    createdAt: Date.now(),
  };
  snap.contentHash = crypto.createHash('sha256').update(JSON.stringify({ s: resolvedSections, t: snap.theme, f: fmt })).digest('hex').slice(0, 16);
  return snap;
}
// render a frozen snapshot (independent of current CRM) → full HTML doc
function documentFromSnapshot(snap, opts) {
  opts = opts || {};
  const f = TOK.format(snap.format);
  const assets = {}; const pr = {};
  const doc = { theme: snap.theme, defaultFormat: snap.format, locale: snap.locale, orderedSections: snap.resolvedSections.map(s => {
    const refs = (s.assetRefs || []); refs.forEach(r => { if (r.assetId && r.url) assets[r.assetId] = { url: r.url }; });
    // rebuild contentBindings as overrides from frozen content
    const cb = {}; Object.keys(s.content || {}).forEach(k => { cb[k] = { mode: 'override', value: s.content[k] }; });
    return { id: s.id, family: s.family, pageType: s.pageType, enabled: true, assetRefs: refs, contentBindings: cb };
  }) };
  const brand = { logoText: (snap.brand && snap.brand.logoText) || 'LUMEN', footer: `<span>${esc((snap.brand && snap.brand.logoText) || 'LUMEN')}</span>`, broker: snap.broker };
  const pages = T.renderDocument(doc, { format: snap.format, assets, brand, opts: { published: true } });
  const stageCss = `html,body{margin:0;background:#edeae4}.lp-doc{display:flex;flex-direction:column;align-items:center;gap:22px;padding:22px 10px}.lp-stage{width:100%;max-width:${f.cssW}px}.lp-fit{transform-origin:top left}
    @media print{html,body{background:#fff}.lp-doc{gap:0;padding:0}.lp-stage{max-width:none}.lp-fit{transform:none!important;width:${f.cssW}px;height:${f.cssH}px}@page{size:${pageCssSize(snap.format)};margin:0}}`;
  const scaleScript = `(function(){function fit(){var W=document.querySelector('.lp-doc').clientWidth-20;document.querySelectorAll('.lp-stage').forEach(function(st){var s=Math.min(1,Math.min(W,${f.cssW})/${f.cssW});st.firstElementChild.style.transform='scale('+s+')';st.style.height=(${f.cssH}*s)+'px';});}window.addEventListener('resize',fit);window.addEventListener('load',fit);document.fonts&&document.fonts.ready.then(fit);fit();})();`;
  const body = pages.map(p => `<div class="lp-stage"><div class="lp-fit">${p.html}</div></div>`).join('');
  return `<!doctype html><html lang="${(snap.locale||'ru').slice(0,2)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.title||'Презентация')}</title><meta name="robots" content="noindex,nofollow"><link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2032%2032'%3E%3Crect%20width='32'%20height='32'%20rx='7'%20fill='%231a1712'/%3E%3Cpath%20d='M16%204.4L18.7%2013.3L27.6%2016L18.7%2018.7L16%2027.6L13.3%2018.7L4.4%2016L13.3%2013.3Z'%20fill='%23ffffff'/%3E%3C/svg%3E"><link rel="stylesheet" href="/pres-styles.css"><style>${stageCss}</style></head><body><div class="lp-doc">${body}</div><script>${scaleScript}</script></body></html>`;
}

/* ---------- public projection (TZ §2 — strip private fields) ---------- */
function publicProjection(snap) {
  return {
    id: snap.id, format: snap.format, locale: snap.locale, theme: snap.theme,
    sections: (snap.resolvedSections || []).map(s => ({ family: s.family, pageType: s.pageType, content: s.content, assetRefs: (s.assetRefs || []).map(r => ({ url: r.url, fit: r.fit, focalPoint: r.focalPoint, role: r.role })) })),
    broker: snap.broker ? { name: snap.broker.name, role: snap.broker.role, agency: snap.broker.agency, photo: snap.broker.photo, bio: snap.broker.bio, headline: snap.broker.headline, contactHeadline: snap.broker.contactHeadline, points: snap.broker.points, channels: snap.broker.channels, qr: snap.broker.qr } : null,
    brand: snap.brand, createdAt: snap.createdAt,
  };
}

module.exports = {
  SCHEMA_VERSION, RENDERER_VERSION, TOK, T,
  draftFromProperty, draftCollection, replaceObjectInCollection, objectUpdates, applyObjectUpdates, pushHistory, historyList, restoreVersion, brandFor, assetsForProperty, assetsFor, renderPages, withBrokerAppendix,
  documentHTML, documentFromSnapshot, validate, makeSnapshot, publicProjection,
  setTidGetter, geoInfo, defaultPalette, titleOf, ctxFor,
};
