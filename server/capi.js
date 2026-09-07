/* Meta Conversions API (CAPI) — серверная отправка офлайн-конверсий в Meta,
   чтобы дообучать алгоритм рекламы на КАЧЕСТВЕННЫХ событиях (квал/сделка),
   а не только на лид-форме. Работает по официальному Graph API /{pixel}/events.
   PII хешируется SHA-256 (требование Meta). */
const crypto = require('crypto');
const GRAPH = 'https://graph.facebook.com/v21.0';

const sha = (s) => s ? crypto.createHash('sha256').update(String(s).trim().toLowerCase()).digest('hex') : undefined;
const shaPhone = (s) => { const d = String(s || '').replace(/[^\d]/g, ''); return d ? crypto.createHash('sha256').update(d).digest('hex') : undefined; };

/* маппинг стадии CRM → стандартное событие Meta (по умолчанию) */
const DEFAULT_STAGE_EVENTS = { qualified: 'Lead', handover: 'Schedule', viewing: 'Schedule', deal: 'Purchase' };

function cfg(db) { return (db.settings && db.settings.capi) || {}; }
function eventFor(db, stage) { const c = cfg(db); const map = c.stageEvents || DEFAULT_STAGE_EVENTS; return map[stage] || null; }
function ready(db) { const c = cfg(db); return !!(c.enabled && c.pixelId && c.token); }

/* нормализуем имя/фамилию из lead.name */
function names(lead) {
  const parts = String(lead.name || '').trim().split(/\s+/);
  return { fn: sha(parts[0] || ''), ln: parts[1] ? sha(parts.slice(1).join(' ')) : undefined };
}

function buildUserData(lead) {
  const nm = names(lead);
  const ud = {
    ph: shaPhone(lead.phone),
    fn: nm.fn, ln: nm.ln,
    external_id: sha(lead.id),                       /* стабильный ID лида (уже хешируем) */
  };
  const em = (lead.contacts || []).find(c => c.kind === 'email');
  if (em) ud.em = sha(em.value);
  const meta = lead.meta || {};
  if (meta.fbclid) ud.fbc = meta.fbc || `fb.1.${Math.floor((meta.clickAt || lead.createdAt || Date.now()))}.${meta.fbclid}`;
  if (meta.fbp) ud.fbp = meta.fbp;
  /* Meta lead_id (из Lead Ads) — сильнейший матч для событий по лид-форме */
  if (meta.leadId) ud.lead_id = meta.leadId;
  Object.keys(ud).forEach(k => ud[k] === undefined && delete ud[k]);
  return ud;
}

/* отправка одного события. eventName — стандартное (Lead/Purchase/Schedule/...) */
async function sendEvent(db, lead, eventName, opts = {}) {
  if (!ready(db) || !eventName) return { skipped: true };
  const c = cfg(db);
  const evId = `${lead.id}_${eventName}`;                 /* дедуп: одно событие на лид+тип */
  const value = opts.value != null ? opts.value : (eventName === 'Purchase' ? ((lead.quals.budget || {}).num || 0) : 0);
  const event = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'system_generated',
    event_id: evId,
    user_data: buildUserData(lead),
    custom_data: { value: value || 0, currency: (db.settings.criteria[lead.geo] || {}).currency || 'USD', lead_stage: lead.stage, geo: lead.geo },
  };
  if ((lead.meta || {}).adId) event.custom_data.ad_id = lead.meta.adId;
  const body = { data: [event] };
  if (c.testCode) body.test_event_code = c.testCode;
  try {
    const r = await fetch(`${GRAPH}/${c.pixelId}/events?access_token=${encodeURIComponent(c.token)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    const ok = r.ok && !j.error;
    /* журнал отправок для UI */
    db.settings.capi.log = db.settings.capi.log || [];
    db.settings.capi.log.unshift({ at: Date.now(), lead: lead.name, event: eventName, ok, err: j.error ? (j.error.message || 'ошибка') : null, received: j.events_received || 0 });
    if (db.settings.capi.log.length > 60) db.settings.capi.log.length = 60;
    db.settings.capi.stats = db.settings.capi.stats || { sent: 0, failed: 0 };
    db.settings.capi.stats[ok ? 'sent' : 'failed'] += 1;
    return { ok, error: j.error ? (j.error.message || '') : null };
  } catch (e) {
    db.settings.capi.log = db.settings.capi.log || [];
    db.settings.capi.log.unshift({ at: Date.now(), lead: lead.name, event: eventName, ok: false, err: e.message });
    return { ok: false, error: e.message };
  }
}

/* хук на смену стадии: если стадия целевая и CAPI включён — шлём событие (не блокируя ответ) */
function onStageChange(db, lead, newStage) {
  if (!ready(db)) return;
  const ev = eventFor(db, newStage);
  if (!ev) return;
  db.settings.capi.fired = db.settings.capi.fired || {};
  const key = lead.id + ':' + ev;
  if (db.settings.capi.fired[key]) return;               /* уже отправляли это событие для лида */
  db.settings.capi.fired[key] = Date.now();
  sendEvent(db, lead, ev).catch(() => {});
}

module.exports = { sendEvent, onStageChange, ready, eventFor, DEFAULT_STAGE_EVENTS };
