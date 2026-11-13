/* Lumen CRM — Движок атрибуции (Фаза 2 переноса Mochi): трекинговые DM-ссылки.
   АДДИТИВНО и ГЕЙТОВАНО: весь движок включается только settings.attribution.enabled=true. Пока выключен —
   wrapLinks возвращает текст КАК ЕСТЬ (отправка не меняется), публичный редирект просто не создаётся.
   Fail-safe: любая ошибка в wrapLinks → возвращаем исходный текст, отправка клиенту не рвётся.

   Сущности в БД тенанта (заводятся в ensureTenantDefaults index.js):
     db.trackedLinks [{ id, slug, dest, leadId, brokerId, propertyId, collectionId, presToken, source, createdAt, clicks, lastClickAt }]
     db.linkClicks   [{ id, slug, leadId, brokerId, ua, ip, ref, at }]
   Короткая ссылка на каждого лида своя (per leadId+dest), как в Mochi: видно КТО кликнул и КОГДА,
   с привязкой к брокеру и объекту/подборке. */

const crypto = require('crypto');

function enabled(db) { return !!(((db || {}).settings || {}).attribution || {}).enabled; }
function base() { return (global.LUMEN_BASE || '').replace(/\/$/, ''); }

function store() { return require('./store'); }
function newSlug(db) {
  const links = db.trackedLinks || (db.trackedLinks = []);
  for (let i = 0; i < 6; i++) {
    const s = crypto.randomBytes(5).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 7);
    if (s.length >= 6 && !links.some(l => l.slug === s)) return s;
  }
  return 'l' + Date.now().toString(36);
}

/* распознаём, на ЧТО ведёт наша публичная ссылка (для привязки к объекту/подборке) */
function classifyDest(dest) {
  const out = {};
  try {
    const path = String(dest).replace(/^https?:\/\/[^/]+/, '');
    let m;
    if ((m = path.match(/\/pv\/([a-zA-Z0-9_-]+)/))) out.presToken = m[1];
    else if ((m = path.match(/\/(?:c|p)\/([a-zA-Z0-9_-]+)/))) out.collectionId = m[1];
  } catch (_) {}
  return out;
}

/* создать (или переиспользовать) трекинговую ссылку на лида. Возвращает { slug, url } или null. */
function createLink(db, dest, ctx = {}) {
  if (!dest) return null;
  const links = db.trackedLinks || (db.trackedLinks = []);
  const leadId = ctx.leadId || null;
  /* дедуп: тот же лид + тот же dest → та же ссылка (стабильный per-lead slug) */
  let rec = links.find(l => l.leadId === leadId && l.dest === dest);
  if (!rec) {
    const cls = classifyDest(dest);
    rec = {
      id: store().nextId('tl'), slug: newSlug(db), dest: String(dest).slice(0, 1000),
      leadId, brokerId: ctx.brokerId || null,
      propertyId: ctx.propertyId || null, collectionId: cls.collectionId || ctx.collectionId || null,
      presToken: cls.presToken || null, source: ctx.source || 'dm',
      createdAt: Date.now(), clicks: 0, lastClickAt: null,
    };
    links.push(rec);
  }
  return { slug: rec.slug, url: base() + '/l/' + rec.slug };
}

/* ПЕРЕХВАТ исходящих ссылок в тексте сообщения. Заменяет НАШИ публичные ссылки (/pv /c /p /m) на /l/:slug.
   Gated + fail-safe: выключено или нет leadId или ошибка → текст без изменений. Чужие/внешние ссылки не трогаем. */
function wrapLinks(db, text, ctx = {}) {
  try {
    if (!enabled(db) || !text || !ctx.leadId) return text;
    const b = base(); if (!b) return text;
    const esc = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(esc + '\\/(pv|c|p|m)\\/[a-zA-Z0-9_-]+', 'g');
    return String(text).replace(re, (url) => {
      const made = createLink(db, url, ctx);
      return made ? made.url : url;
    });
  } catch (_) { return text; }
}

/* клик по /l/:slug → записать клик, вернуть dest для 302. null если slug не найден. */
function handleClick(db, slug, meta = {}) {
  const rec = (db.trackedLinks || []).find(l => l.slug === slug);
  if (!rec) return null;
  rec.clicks = (rec.clicks || 0) + 1; rec.lastClickAt = Date.now();
  (db.linkClicks || (db.linkClicks = [])).push({
    id: store().nextId('clk'), slug, leadId: rec.leadId, brokerId: rec.brokerId,
    ua: String(meta.ua || '').slice(0, 200), ip: String(meta.ip || '').slice(0, 60),
    ref: String(meta.ref || '').slice(0, 300), at: Date.now(),
  });
  /* сигнал на лиде: последний клик (горячесть) — аддитивно, не ломает существующие поля */
  if (rec.leadId) { const lead = (db.leads || []).find(l => l.id === rec.leadId); if (lead) { lead._attr = lead._attr || {}; lead._attr.lastClickAt = Date.now(); lead._attr.lastClickDest = rec.dest; } }
  try { store().save(); } catch (_) {}
  return rec.dest;
}

/* прозрачный 1×1 GIF для пиксель-бикона */
const PX_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

/* бикон, встроенный в публичную страницу подборки/презентации: пишем просмотр с привязкой к объекту,
   брокеру (из самой презентации по токену) и лиду (из slug трекинговой ссылки, по которой пришли, параметр lc).
   Троттл 60с на пару (токен, лид), чтобы повторные хиты страницы не плодили события. Возвращает PX_GIF. */
function handlePixel(db, q = {}, meta = {}) {
  try {
    if (!enabled(db)) return PX_GIF;
    const tok = String(q.t || '').slice(0, 64);
    const lc = String(q.lc || '').slice(0, 32);
    if (!tok) return PX_GIF;
    let brokerId = null, projectIds = [], presToken = null, collectionId = null;
    const pres = (db.presentations || []).find(x => x.publicToken === tok);
    if (pres) { presToken = tok; brokerId = pres.brokerId || null; projectIds = pres.projectIds || (pres.projectId ? [pres.projectId] : []); }
    else { const col = (db.collections || []).find(x => x.id === tok); if (col) { collectionId = tok; brokerId = col.brokerId || null; projectIds = col.propertyIds || []; } }
    const leadId = lc ? ((db.trackedLinks || []).find(l => l.slug === lc) || {}).leadId || null : null;
    const evs = db.pixelEvents || (db.pixelEvents = []);
    const now = Date.now();
    const recent = evs.find(e => e.t === tok && e.leadId === leadId && (now - e.at) < 60000);
    if (!recent) {
      evs.push({ id: store().nextId('px'), kind: 'view', t: tok, presToken, collectionId, leadId, brokerId, projectIds, ua: String(meta.ua || '').slice(0, 200), ip: String(meta.ip || '').slice(0, 60), at: now });
      if (leadId) { const lead = (db.leads || []).find(l => l.id === leadId); if (lead) { lead._attr = lead._attr || {}; lead._attr.lastViewAt = now; } }
      try { store().save(); } catch (_) {}
    }
  } catch (_) {}
  return PX_GIF;
}

/* HTML-бикон для вставки в публичную страницу (append к ответу /pv, /c). Пусто если атрибуция выключена. */
function pixelTag(db, tok, leadSlug) {
  if (!enabled(db) || !tok) return '';
  const lc = leadSlug ? ('?lc=' + encodeURIComponent(leadSlug)) : '';
  return `<img src="${base()}/px/${encodeURIComponent(tok)}.gif${lc}" alt="" width="1" height="1" style="position:absolute;left:-9999px" referrerpolicy="no-referrer">`;
}

/* агрегат для дашборда «Ссылки и атрибуция»: по брокерам и по объектам. Диапазон from..to (ms) опционально. */
function summary(db, opts = {}) {
  const from = opts.from || 0, to = opts.to || Date.now();
  const inR = at => at >= from && at <= to;
  const links = (db.trackedLinks || []);
  const clicks = (db.linkClicks || []).filter(c => inR(c.at));
  const views = (db.pixelEvents || []).filter(v => inR(v.at));
  const leadsById = {}; (db.leads || []).forEach(l => leadsById[l.id] = l);
  const brokerName = id => { const b = (db.brokers || []).find(x => x.id === id); return b ? b.name : (id || 'Без брокера'); };
  const propName = id => { const p = (db.properties || []).find(x => x.id === id); return p ? (p.name || p.title || id) : id; };
  const byBroker = {}, byObject = {};
  const bump = (map, key, field) => { (map[key] = map[key] || { clicks: 0, views: 0, deals: 0, revenue: 0 })[field]++; };
  clicks.forEach(c => { if (c.brokerId) bump(byBroker, c.brokerId, 'clicks'); });
  views.forEach(v => { if (v.brokerId) bump(byBroker, v.brokerId, 'views'); (v.projectIds || []).forEach(pid => bump(byObject, pid, 'views')); });
  clicks.forEach(c => { const l = links.find(x => x.slug === c.slug); const pid = l && l.propertyId; if (pid) bump(byObject, pid, 'clicks'); });
  /* сделки/выручка по брокеру из лидов (канал-агностично, как в аналитике рекламы) */
  (db.leads || []).forEach(l => { if (l.stage === 'deal' && l.broker && inR(l.dealAt || l.lastMsgAt || 0)) { const r = byBroker[l.broker] = byBroker[l.broker] || { clicks: 0, views: 0, deals: 0, revenue: 0 }; r.deals++; r.revenue += (+l.dealCommission || +l.dealValue || 0); } });
  return {
    totals: { links: links.length, clicks: clicks.length, views: views.length },
    byBroker: Object.entries(byBroker).map(([id, v]) => Object.assign({ brokerId: id, broker: brokerName(id) }, v)).sort((a, b) => b.clicks - a.clicks),
    byObject: Object.entries(byObject).map(([id, v]) => Object.assign({ propertyId: id, name: propName(id) }, v)).sort((a, b) => (b.clicks + b.views) - (a.clicks + a.views)),
    recentClicks: clicks.slice(-50).reverse().map(c => ({ at: c.at, lead: (leadsById[c.leadId] || {}).name || c.leadId, broker: brokerName(c.brokerId) })),
  };
}

module.exports = { enabled, createLink, wrapLinks, handleClick, classifyDest, handlePixel, pixelTag, summary, PX_GIF };
