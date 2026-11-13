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

module.exports = { enabled, createLink, wrapLinks, handleClick, classifyDest };
