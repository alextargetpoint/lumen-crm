/* Прямое подключение рекламного кабинета Meta (Marketing API).
   В отличие от CAPI (capi.js — отправка событий В Meta) — этот модуль ТЯНЕТ данные ИЗ кабинета:
   • Insights (расход / кампании / adsets / объявления / креативы) → в db.ads (без ручного spend и CSV);
   • Lead Ads (лиды из лид-форм) → в db.leads (без Albato/интегратора).
   Работает через официальный Graph API. Токен — постоянный (System User) с правами
   ads_read + leads_retrieval. Хранится как секрет (в state не отдаётся).

   Зависимости из index.js передаются через deps (без циклических require):
     deps = { matchAd(db,lead), nextId(prefix), pushEvent(db,{type,leadId,text}), save() }  */

const GRAPH = 'https://graph.facebook.com/v21.0';

function cfg(db) { return (db.settings && db.settings.metaAds) || {}; }
function ready(db) { const c = cfg(db); return !!(c.enabled && c.token && c.adAccountId); }
/* mode: 'api' | 'integrator' | 'both' — тянем через API, если режим это разрешает */
function apiEnabled(db) { const c = cfg(db); return ready(db) && (c.mode === 'api' || c.mode === 'both' || !c.mode); }

function acctId(id) { id = String(id || '').trim(); if (!id) return ''; return id.startsWith('act_') ? id : ('act_' + id.replace(/\D/g, '')); }

async function graphGet(path, token, params = {}) {
  const qs = new URLSearchParams(Object.assign({ access_token: token }, params)).toString();
  const r = await fetch(`${GRAPH}/${path}?${qs}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) { const e = new Error((j.error && j.error.message) || ('HTTP ' + r.status)); e.meta = j.error || {}; throw e; }
  return j;
}

/* следуем пагинации paging.next, но с жёстким потолком страниц (cost-safe, без «тихого» обрыва) */
async function graphPaged(path, token, params, maxPages = 5) {
  let out = [], next = null, pages = 0, capped = false;
  let j = await graphGet(path, token, params);
  out = out.concat(j.data || []);
  next = j.paging && j.paging.next;
  while (next && pages < maxPages - 1) {
    pages++;
    const r = await fetch(next); const jj = await r.json().catch(() => ({}));
    if (!r.ok || jj.error) break;
    out = out.concat(jj.data || []);
    next = jj.paging && jj.paging.next;
  }
  if (next) capped = true;   /* остались ещё страницы — сообщим наверх, не молчим */
  return { data: out, capped };
}

/* проверка подключения: имя кабинета, статус, валюта */
async function verify(conf) {
  const token = String((conf && conf.token) || '').trim();
  const id = acctId(conf && conf.adAccountId);
  if (!token || !id) return { ok: false, error: 'нужны access token и Ad account ID' };
  try {
    const j = await graphGet(id, token, { fields: 'name,account_status,currency,amount_spent,business_name' });
    return { ok: true, name: j.name, currency: j.currency, status: j.account_status === 1 ? 'active' : ('status ' + j.account_status), business: j.business_name || '' };
  } catch (e) { return { ok: false, error: e.message }; }
}

/* Insights: расход/показы/клики + названия кампании/адсета на уровне объявления → апсертим db.ads */
async function syncInsights(db, deps, { datePreset = 'last_30d' } = {}) {
  const c = cfg(db); const token = c.token; const id = acctId(c.adAccountId);
  const res = { updated: 0, added: 0, capped: false };
  const ins = await graphPaged(`${id}/insights`, token, {
    level: 'ad', date_preset: c.datePreset || datePreset, limit: '200',
    fields: 'ad_id,ad_name,adset_name,campaign_name,spend,impressions,clicks',
  }, 5);
  res.capped = ins.capped;
  db.ads = db.ads || [];
  for (const row of ins.data) {
    if (!row.ad_id) continue;
    let ad = db.ads.find(a => String(a.adId) === String(row.ad_id));
    if (!ad) { ad = { adId: String(row.ad_id) }; db.ads.push(ad); res.added++; } else res.updated++;
    if (row.ad_name) ad.name = ad.name && ad.name !== ad.adId ? ad.name : row.ad_name;   /* не затираем ручное имя, если оно уже осмысленное */
    if (!ad.name) ad.name = row.ad_name || ad.adId;
    ad.adsetName = row.adset_name || ad.adsetName;
    ad.campaignName = row.campaign_name || ad.campaignName;
    ad.spend = Math.round((parseFloat(row.spend) || 0));
    ad.impressions = parseInt(row.impressions, 10) || 0;
    ad.clicks = parseInt(row.clicks, 10) || 0;
    ad.spendSource = 'meta_api';
    ad.syncedAt = Date.now();
  }
  /* креативы (превью) — одним запросом; заполняем media только если у объявления его ещё нет */
  try {
    const ads = await graphPaged(`${id}/ads`, token, { fields: 'id,creative{thumbnail_url,image_url}', limit: '200' }, 3);
    for (const a of ads.data) {
      const ad = db.ads.find(x => String(x.adId) === String(a.id));
      if (ad && !(ad.media && ad.media.url) && a.creative) {
        const url = a.creative.image_url || a.creative.thumbnail_url;
        if (url) ad.media = { url, type: 'image' };
      }
    }
  } catch (e) { /* креативы — не критично */ }
  return res;
}

/* Lead Ads: тянем лиды из лид-форм через edge объявления /{ad_id}/leads.
   Дедуп по meta.leadId. Жёсткие потолки на число объявлений/лидов (cost + rate-safe). */
async function syncLeads(db, deps, { maxAds = 40, maxLeadsPerAd = 50 } = {}) {
  const c = cfg(db); const token = c.token; const id = acctId(c.adAccountId);
  const res = { created: 0, repeat: 0, scannedAds: 0, capped: false, error: null };
  const norm = (ph) => String(ph || '').replace(/\D/g, '').replace(/^8(\d{10})$/, '7$1');
  const seen = new Set((db.leads || []).map(l => (l.meta && l.meta.leadId) ? String(l.meta.leadId) : null).filter(Boolean));

  /* берём активные/недавние объявления кабинета */
  let ads;
  try { ads = await graphPaged(`${id}/ads`, token, { fields: 'id,name', limit: String(maxAds), effective_status: '["ACTIVE","PAUSED"]' }, 2); }
  catch (e) { res.error = e.message; return res; }
  if (ads.data.length > maxAds) { ads.data = ads.data.slice(0, maxAds); res.capped = true; }
  if (ads.capped) res.capped = true;

  for (const ad of ads.data) {
    res.scannedAds++;
    let leads;
    try { leads = await graphGet(`${ad.id}/leads`, token, { fields: 'id,created_time,field_data,form_id,campaign_id,adset_id', limit: String(maxLeadsPerAd) }); }
    catch (e) { continue; }   /* нет прав leadgen на это объявление / нет формы — пропускаем */
    for (const L of (leads.data || [])) {
      if (seen.has(String(L.id))) continue;
      seen.add(String(L.id));
      const f = {}; for (const kv of (L.field_data || [])) f[(kv.name || '').toLowerCase()] = (kv.values || [])[0];
      const phone = f.phone_number || f.phone || f['телефон'];
      if (!phone) continue;
      const name = f.full_name || [f.first_name, f.last_name].filter(Boolean).join(' ') || f.name || 'Без имени';
      const email = f.email || f['e-mail'];
      const existing = (db.leads || []).find(l => norm(l.phone) === norm(phone));
      if (existing) {
        res.repeat++;
        existing.tags = [...new Set([...(existing.tags || []), 'повторная заявка'])];
        existing.meta = Object.assign(existing.meta || {}, { leadId: String(L.id), adId: String(ad.id) });
        if (!(existing.ads && existing.ads.adId)) { existing.ads = { adId: String(ad.id), adsetId: L.adset_id, campaignId: L.campaign_id }; deps.matchAd(db, existing); }
        continue;
      }
      const lead = {
        id: deps.nextId('ld'), name, phone,
        geo: (db.settings.agency.geos || ['dubai'])[0], lang: 'ru', stage: 'new', score: 0,
        source: 'meta_api', createdAt: L.created_time ? Date.parse(L.created_time) : Date.now(),
        lastMsgAt: null, lastDir: null,
        quals: { purpose: null, timeline: null, budget: null, type: null },
        ai: { enabled: true, chainStep: 0, nextTouchAt: Date.now() + 15e3, silentSince: null },
        broker: null, summary: null, tags: ['Meta API'], numberId: null,
        meta: { leadId: String(L.id), adId: String(ad.id), clickAt: Date.now() },
        avatarUrl: null, activeChannel: 'wa',
        channels: { wa: 'unknown', tg: 'unknown', viber: 'unknown', email: email ? 'yes' : 'unknown' },
        contacts: email ? [{ kind: 'email', value: email }] : [], notes: [], custom: {}, transcripts: [],
        ads: { adId: String(ad.id), adsetId: L.adset_id, campaignId: L.campaign_id, formName: L.form_id ? ('form ' + L.form_id) : null },
      };
      deps.matchAd(db, lead);
      db.leads.push(lead);
      res.created++;
      try { deps.pushEvent(db, { type: 'lead_new', leadId: lead.id, text: `Лид из кабинета Meta (API): ${lead.name} · ${db.settings.geoNames[lead.geo] || lead.geo}` }); } catch (_) {}
      db.intakeLog = db.intakeLog || [];
      db.intakeLog.unshift({ at: Date.now(), name: lead.name, phone: lead.phone, adId: String(ad.id), result: 'created', src: 'meta_api' });
    }
  }
  if (db.intakeLog && db.intakeLog.length > 200) db.intakeLog.length = 200;
  return res;
}

/* оркестратор: тянем что настроено, пишем журнал/статистику/время */
async function sync(db, deps, opts = {}) {
  if (!apiEnabled(db)) return { skipped: true };
  const c = db.settings.metaAds;
  const started = Date.now();
  const out = { at: started };
  try {
    if (c.pullInsights !== false) { const r = await syncInsights(db, deps); out.insights = r; }
    if (c.pullLeads !== false) { const r = await syncLeads(db, deps); out.leads = r; }
    out.ok = true;
  } catch (e) { out.ok = false; out.error = e.message; }
  out.ms = Date.now() - started;
  c.lastSyncAt = started;
  c.log = c.log || [];
  c.log.unshift({
    at: started, ok: out.ok, error: out.error || null,
    ins: out.insights ? (out.insights.updated + out.insights.added) : 0,
    newLeads: out.leads ? out.leads.created : 0,
    capped: !!((out.insights && out.insights.capped) || (out.leads && out.leads.capped)),
  });
  if (c.log.length > 40) c.log.length = 40;
  c.stats = c.stats || { syncs: 0, leads: 0 };
  c.stats.syncs += 1;
  c.stats.leads += (out.leads ? out.leads.created : 0);
  try { deps.save && deps.save(); } catch (_) {}
  return out;
}

module.exports = { ready, apiEnabled, verify, sync, syncInsights, syncLeads, acctId, cfg };
