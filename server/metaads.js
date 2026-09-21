/* Прямое подключение рекламного кабинета Meta (Marketing API).
   В отличие от CAPI (capi.js — отправка событий В Meta) — этот модуль ТЯНЕТ данные ИЗ кабинета:
   • Insights (расход / кампании / adsets / объявления / креативы) → в db.ads (без ручного spend и CSV);
   • Lead Ads (лиды из лид-форм) → в db.leads (без Albato/интегратора).
   Работает через официальный Graph API. Токен — постоянный (System User) или Page access token.
   Права (по докам Meta 2025): Insights → ads_read; Lead Ads → ads_management + leads_retrieval +
   pages_show_list + pages_read_engagement + pages_manage_ads (+ pages_manage_metadata для вебхуков).
   Выпустивший токен должен иметь на Странице задачу ADVERTISE, Страница назначена System User.
   Хранится как секрет (в state не отдаётся).

   Зависимости из index.js передаются через deps (без циклических require):
     deps = { matchAd(db,lead), nextId(prefix), pushEvent(db,{type,leadId,text}), save() }  */

const GRAPH = 'https://graph.facebook.com/v21.0';

function cfg(db) { return (db.settings && db.settings.metaAds) || {}; }
function acctId(id) { id = String(id || '').trim(); if (!id) return ''; return id.startsWith('act_') ? id : ('act_' + id.replace(/\D/g, '')); }
/* список подключённых кабинетов: новый формат accounts:[{id,name,currency}] + легаси adAccountId */
function accountsOf(db) {
  const c = cfg(db);
  const list = Array.isArray(c.accounts) ? c.accounts.map(a => ({ id: acctId(a.id || a), name: (a && a.name) || '', currency: (a && a.currency) || '' })).filter(a => a.id) : [];
  if (!list.length && c.adAccountId) list.push({ id: acctId(c.adAccountId), name: '', currency: c.currency || '' });
  /* дедуп по id */
  const seen = new Set(); return list.filter(a => (seen.has(a.id) ? false : (seen.add(a.id), true)));
}
function ready(db) { const c = cfg(db); return !!(c.enabled && c.token && accountsOf(db).length); }
/* mode: 'api' | 'integrator' | 'both' — тянем через API, если режим это разрешает */
function apiEnabled(db) { const c = cfg(db); return ready(db) && (c.mode === 'api' || c.mode === 'both' || !c.mode); }

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

/* Insights: расход/показы/клики + названия кампании/адсета на уровне объявления → апсертим db.ads.
   acct — конкретный кабинет (act_…); при мультикабинете sync() вызывает по каждому. */
async function syncInsights(db, deps, { acct, days } = {}) {
  const c = cfg(db); const token = c.token; const id = acct ? acctId(acct) : (accountsOf(db)[0] || {}).id;
  const res = { updated: 0, added: 0, capped: false };
  if (!id) return res;
  const win = Math.max(1, days || 14);
  const until = new Date(); const since = new Date(until.getTime() - win * 864e5);
  const ymd = (d) => d.toISOString().slice(0, 10);
  /* time_increment:1 → строка на объявление НА КАЖДЫЙ ДЕНЬ: даёт посуточную динамику (спарклайн, факт/дн) */
  const ins = await graphPaged(`${id}/insights`, token, {
    level: 'ad', time_range: JSON.stringify({ since: ymd(since), until: ymd(until) }), time_increment: '1', limit: '400',
    fields: 'ad_id,ad_name,adset_name,campaign_name,spend,impressions,clicks,actions',
  }, 10);
  res.capped = ins.capped;
  db.ads = db.ads || [];
  const leadsOf = (acts) => (Array.isArray(acts) ? acts : []).filter(a => /lead/i.test(a.action_type || '')).reduce((s, a) => s + (parseInt(a.value, 10) || 0), 0);
  /* собираем по объявлению: тотал + дневной ряд */
  const agg = {};   /* adId → {name, adset, camp, spend, impr, clicks, leads, daily:{date:{spend,leads,clicks,impr}}} */
  for (const row of ins.data) {
    if (!row.ad_id) continue;
    const k = String(row.ad_id);
    const A = agg[k] = agg[k] || { name: row.ad_name, adset: row.adset_name, camp: row.campaign_name, spend: 0, impr: 0, clicks: 0, leads: 0, daily: {} };
    const sp = parseFloat(row.spend) || 0, im = parseInt(row.impressions, 10) || 0, cl = parseInt(row.clicks, 10) || 0, ld = leadsOf(row.actions);
    A.spend += sp; A.impr += im; A.clicks += cl; A.leads += ld;
    const d = row.date_start || row.date_stop; if (d) { const x = A.daily[d] = A.daily[d] || { spend: 0, leads: 0, clicks: 0, impr: 0 }; x.spend += sp; x.leads += ld; x.clicks += cl; x.impr += im; }
  }
  for (const k of Object.keys(agg)) {
    const A = agg[k];
    let ad = db.ads.find(a => String(a.adId) === k);
    if (!ad) { ad = { adId: k }; db.ads.push(ad); res.added++; } else res.updated++;
    if (A.name) ad.name = ad.name && ad.name !== ad.adId ? ad.name : A.name;
    if (!ad.name) ad.name = A.name || ad.adId;
    ad.adsetName = A.adset || ad.adsetName;
    ad.campaignName = A.camp || ad.campaignName;
    ad.spend = Math.round(A.spend); ad.impressions = A.impr; ad.clicks = A.clicks; ad.leadsMeta = A.leads;
    ad.daily = Object.entries(A.daily).sort((a, b) => a[0] < b[0] ? -1 : 1).map(([d, v]) => ({ d, spend: Math.round(v.spend), leads: v.leads, clicks: v.clicks, impr: v.impr })).slice(-30);
    ad.spendSource = 'meta_api'; ad.adAccountId = id; ad.syncedAt = Date.now();
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

/* убрать демо-«шаблоны» (хардкод-сид), которые никогда не синкались (после реального синка) */
function dropSeedDemo(db) {
  const SEED_DEMO = ['120211478921230508', '120211478921230742', '120209934110255019'];
  db.ads = (db.ads || []).filter(a => !(SEED_DEMO.includes(String(a.adId)) && !a.syncedAt));
}

/* Раздать креатив/тезисы всем объявлениям с ОДИНАКОВЫМ именем (заполняем пустые из непустого одноимённого).
   Так один загруженный креатив автоматически подхватывается на все повторяющиеся названия по всем связкам. */
function dedupeByName(db) {
  const byName = {};
  for (const a of (db.ads || [])) { const n = String(a.name || '').trim().toLowerCase(); if (!n) continue; (byName[n] = byName[n] || []).push(a); }
  for (const n in byName) {
    const grp = byName[n];
    const withMedia = grp.find(a => a.media && a.media.url);
    const withPoints = grp.find(a => a.points && a.points.length);
    for (const a of grp) {
      if (withMedia && !(a.media && a.media.url)) a.media = withMedia.media;
      if (withPoints && !(a.points && a.points.length)) a.points = withPoints.points.slice();
    }
  }
}

/* Lead Ads: тянем лиды из лид-форм через edge объявления /{ad_id}/leads.
   Дедуп по meta.leadId. Жёсткие потолки на число объявлений/лидов (cost + rate-safe). */
async function syncLeads(db, deps, { maxAds = 40, maxLeadsPerAd = 50, acct } = {}) {
  const c = cfg(db); const token = c.token; const id = acct ? acctId(acct) : (accountsOf(db)[0] || {}).id;
  const res = { created: 0, repeat: 0, scannedAds: 0, capped: false, error: null };
  if (!id) return res;
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

/* оркестратор: по КАЖДОМУ подключённому кабинету тянем insights+leads, потом чистим сид и дедупим. */
async function sync(db, deps, opts = {}) {
  if (!opts.force && !apiEnabled(db)) return { skipped: true };   /* force = ручной запуск кнопкой (в обход тумблера/режима) */
  const accts = accountsOf(db);
  { const c = db.settings.metaAds || {}; if (!c.token || !accts.length) return { skipped: true, error: 'нет токена или рекламных кабинетов' }; }
  const c = db.settings.metaAds;
  const started = Date.now();
  const out = { at: started, insights: { updated: 0, added: 0, capped: false }, leads: { created: 0, repeat: 0, scannedAds: 0, capped: false }, accounts: accts.length };
  try {
    const win = opts.backfill ? (c.syncDays || 60) : Math.min(c.syncDays || 60, 14);   /* обычный синк — хвост, backfill — всё окно */
    for (const a of accts) {
      if (c.pullInsights !== false) { const r = await syncInsights(db, deps, { acct: a.id, days: win }); out.insights.updated += r.updated; out.insights.added += r.added; out.insights.capped = out.insights.capped || r.capped; }
      if (c.pullLeads !== false) { const r = await syncLeads(db, deps, { acct: a.id }); out.leads.created += r.created; out.leads.repeat += r.repeat; out.leads.scannedAds += r.scannedAds; out.leads.capped = out.leads.capped || r.capped; if (r.error) out.leads.error = r.error; }
    }
    if (out.insights.added + out.insights.updated > 0) dropSeedDemo(db);
    dedupeByName(db);
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

module.exports = { ready, apiEnabled, verify, sync, syncInsights, syncLeads, acctId, cfg, dedupeByName };
