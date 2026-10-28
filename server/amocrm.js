/* ──────────────────────────────────────────────────────────────────────────
   Lumen — двусторонний синк с amoCRM (API v4).
   Зачем: заход к агентствам, которые УЖЕ сидят на amoCRM, БЕЗ миграции — Lumen
   работает поверх (как Soul QB). Lumen ведёт ИИ-переписку/обзвон/квалификацию,
   а статусы/сделки/поля зеркалятся в amo, где у клиента вся отчётность.

   Архитектура: ЧИСТАЯ логика (маппинг/матчинг/оркестрация) + тонкий HTTP-адаптер
   (amoApi инъектится) → юнит-тестируемо моками, как voiceagent/Telnyx.

   Конфиг (db.settings.integrations.amo):
     { subdomain, token (long-lived), pipelineId, statusMap:{lumenStage: amoStatusId},
       fields:{budget,timeline,type,purpose,region: <amoCustomFieldId>},
       pullStages:true|false (тянуть ли стадии ИЗ amo), enabled }
   ────────────────────────────────────────────────────────────────────────── */

const https = require('https');
const http = require('http');

const digits = (p) => String(p || '').replace(/\D/g, '');
const qv = (q) => (q && typeof q === 'object') ? (q.value != null ? q.value : q.num) : q;   /* quals: {value}/{num}/плоское */

/* ───────── МАППИНГ: Lumen lead → amo lead payload (API v4) ───────── */
function leadToAmo(lead, cfg) {
  cfg = cfg || {};
  const statusMap = cfg.statusMap || {};
  const F = cfg.fields || {};
  const q = (lead && lead.quals) || {};
  const cfv = [];
  const addF = (fid, val) => { if (fid && val != null && String(val).trim() !== '') cfv.push({ field_id: +fid, values: [{ value: String(val) }] }); };
  addF(F.budget, qv(q.budget));
  addF(F.timeline, qv(q.timeline));
  addF(F.type, qv(q.type));
  addF(F.purpose, qv(q.purpose));
  addF(F.region, (lead && (lead.geoName || lead.geo)) || '');

  const payload = { name: (lead && lead.name) || ('Лид ' + (digits(lead && lead.phone).slice(-4) || (lead && lead.id) || '')) };
  const price = +((q.budget && q.budget.num) || (lead && lead.dealValue) || 0);
  if (price > 0) payload.price = Math.round(price);
  if (statusMap[lead && lead.stage] != null) { payload.status_id = +statusMap[lead.stage]; if (cfg.pipelineId) payload.pipeline_id = +cfg.pipelineId; }
  if (cfv.length) payload.custom_fields_values = cfv;
  if (lead && lead.amoId) payload.id = +lead.amoId;                                  /* есть → update, нет → create */

  const contact = (lead && lead.phone) ? {
    name: payload.name,
    custom_fields_values: [{ field_code: 'PHONE', values: [{ value: lead.phone, enum_code: 'WORK' }] }],
  } : null;
  return { lead: payload, contact, isUpdate: !!(lead && lead.amoId) };
}

/* ───────── МАППИНГ: amo lead → что подтянуть в Lumen ───────── */
function amoToLead(amoLead, cfg) {
  cfg = cfg || {};
  const stageByStatus = {};
  Object.keys(cfg.statusMap || {}).forEach(st => { stageByStatus[+cfg.statusMap[st]] = st; });
  const upd = { _amoFields: {} };
  if (amoLead.status_id != null && stageByStatus[+amoLead.status_id]) upd.stage = stageByStatus[+amoLead.status_id];
  if (amoLead.name) upd.name = amoLead.name;
  const F = cfg.fields || {};
  const byId = {};
  (amoLead.custom_fields_values || []).forEach(f => { const v = f.values && f.values[0] && f.values[0].value; if (v != null) byId[+f.field_id] = v; });
  for (const k of Object.keys(F)) if (byId[+F[k]] != null) upd._amoFields[k] = byId[+F[k]];
  return upd;
}

/* ───────── МАТЧИНГ: найти Lumen-лид по amoId, иначе по телефону (last 9) ───────── */
function matchLead(db, amoLead) {
  const leads = (db && db.leads) || [];
  if (amoLead.id != null) { const byId = leads.find(x => x.amoId != null && +x.amoId === +amoLead.id); if (byId) return byId; }
  const phones = [];
  ((amoLead._embedded && amoLead._embedded.contacts) || []).forEach(c => (c.custom_fields_values || []).forEach(f => (f.values || []).forEach(v => { if (v && v.value) phones.push(digits(v.value)); })));
  if (amoLead._phone) phones.push(digits(amoLead._phone));
  for (const ph of phones) { if (ph.length < 7) continue; const l = leads.find(x => x.phone && digits(x.phone).endsWith(ph.slice(-9))); if (l) return l; }
  return null;
}

/* ───────── ПРИМЕНИТЬ подтянутые изменения (не затираем свои непустые quals) ───────── */
function applyPulled(db, lead, upd, cfg) {
  cfg = cfg || {};
  const changed = [];
  if (upd.stage && upd.stage !== lead.stage && cfg.pullStages !== false) { lead.stage = upd.stage; changed.push('stage'); }
  if (upd.name && !lead.name) { lead.name = upd.name; changed.push('name'); }
  const q = lead.quals = lead.quals || {};
  const f = upd._amoFields || {};
  for (const k of ['budget', 'timeline', 'type', 'purpose']) {
    if (f[k] != null && String(f[k]).trim() !== '' && (!q[k] || !q[k].value)) { q[k] = { value: String(f[k]), by: 'amo', at: (cfg.now || Date.now()) }; changed.push('qual:' + k); }
  }
  return changed;
}

/* ───────── ОРКЕСТРАЦИЯ: пуш одного лида (create/update) через инъектированный amoApi ───────── */
async function pushLead(db, lead, deps) {
  deps = deps || {};
  const cfg = deps.cfg || {};
  if (!deps.api) throw new Error('нет amo API');
  const { lead: payload, contact } = leadToAmo(lead, cfg);
  /* контакт: создаём/привязываем (упрощённо — создаём контакт при первом пуше, если нет contactId) */
  let contactId = lead.amoContactId || null;
  if (contact && !contactId) { try { const c = await deps.api.createContact(contact); contactId = c && c.id; if (contactId) lead.amoContactId = contactId; } catch (e) { /* контакт не критичен */ } }
  if (contactId) payload._embedded = { contacts: [{ id: +contactId }] };

  let res;
  if (payload.id) { res = await deps.api.updateLead(payload); }
  else { res = await deps.api.createLead(payload); if (res && res.id) { lead.amoId = res.id; } }
  lead.amoSyncAt = cfg.now || Date.now();
  return { ok: true, amoId: lead.amoId, action: payload.id ? 'update' : 'create' };
}

/* ───────── ОРКЕСТРАЦИЯ: пулл изменённых лидов ИЗ amo → применить в Lumen ───────── */
async function pullChanges(db, deps) {
  deps = deps || {};
  const cfg = deps.cfg || {};
  if (!deps.api) throw new Error('нет amo API');
  const since = deps.since || cfg.lastPullAt || 0;
  const amoLeads = await deps.api.listChangedLeads(since);                            /* [{id,name,status_id,custom_fields_values,_embedded}] */
  let applied = 0, matched = 0, skipped = 0;
  for (const al of (amoLeads || [])) {
    const lead = matchLead(db, al);
    if (!lead) { skipped++; continue; }
    matched++;
    if (lead.amoId == null) lead.amoId = al.id;
    const upd = amoToLead(al, cfg);
    const ch = applyPulled(db, lead, upd, cfg);
    if (ch.length) applied++;
  }
  return { ok: true, pulled: (amoLeads || []).length, matched, applied, skipped };
}

/* ───────── какие лиды пушить: уже синхронизированные (amoId) ИЛИ достигшие pushStages,
   изменённые после последнего пуша (amoSyncAt). Отписавшихся/без телефона не пушим. ───────── */
function leadsToPush(db, cfg) {
  cfg = cfg || {};
  const pushStages = cfg.pushStages || ['qualified', 'handover', 'viewing', 'deal'];
  return ((db && db.leads) || []).filter(l => {
    if (!l || !l.phone) return false;
    const eligible = (l.amoId != null) || pushStages.includes(l.stage);
    if (!eligible) return false;
    const changedAt = l.updatedAt || l.lastMsgAt || l.dealAt || l.createdAt || 0;
    return !l.amoSyncAt || changedAt > l.amoSyncAt;                                   /* изменился после последнего пуша */
  });
}

/* ───────── ПОЛНЫЙ СИНК: пуш подходящих лидов + пулл изменений из amo ───────── */
async function syncAll(db, deps) {
  deps = deps || {};
  const cfg = deps.cfg || {};
  const toPush = leadsToPush(db, cfg).slice(0, cfg.pushLimit || 50);
  let pushed = 0, pushErr = 0;
  for (const lead of toPush) { try { await pushLead(db, lead, deps); pushed++; } catch (e) { pushErr++; lead._amoErr = e.message; } }
  let pull = { pulled: 0, matched: 0, applied: 0, skipped: 0 };
  if (deps.pull !== false) { try { pull = await pullChanges(db, deps); } catch (e) { pull.error = e.message; } }
  return { ok: true, pushed, pushErr, pull };
}

/* ───────── ТОНКИЙ HTTP-АДАПТЕР amoCRM API v4 (не тестируется моками — живой amo) ───────── */
function makeApi(cfg) {
  cfg = cfg || {};
  /* Переопределение базы для ЛОКАЛЬНОГО мок-сервера (tools/crm-mock): cfg.apiBase или env AMO_API_BASE
     вида http://localhost:4100. Прод без override ходит на {subdomain}.amocrm.ru по https. */
  const override = cfg.apiBase || process.env.AMO_API_BASE || '';
  const host0 = (cfg.subdomain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const base = host0.includes('.') ? host0 : (host0 + '.amocrm.ru');
  let mod = https, opts = { host: base, port: 443 };
  if (override) { const u = new URL(override); mod = u.protocol === 'http:' ? http : https; opts = { host: u.hostname, port: u.port || (mod === http ? 80 : 443) }; }
  const req = (method, path, body) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = mod.request({ ...opts, path, method, headers: { Authorization: 'Bearer ' + (cfg.token || ''), 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } }, (resp) => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => {
        let j = {}; try { j = d ? JSON.parse(d) : {}; } catch (_) {}
        if (resp.statusCode >= 300) return reject(new Error('amo ' + resp.statusCode + ': ' + (j && j.title ? j.title : d.slice(0, 120))));
        resolve(j);
      });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
  return {
    createLead: async (p) => { const j = await req('POST', '/api/v4/leads', [p]); return (j._embedded && j._embedded.leads && j._embedded.leads[0]) || null; },
    updateLead: async (p) => { const id = p.id; const body = Object.assign({}, p); delete body.id; return req('PATCH', '/api/v4/leads/' + id, body); },
    createContact: async (c) => { const j = await req('POST', '/api/v4/contacts', [c]); return (j._embedded && j._embedded.contacts && j._embedded.contacts[0]) || null; },
    listChangedLeads: async (since) => { const q = since ? ('?filter[updated_at][from]=' + Math.floor(since / 1000) + '&with=contacts&limit=100') : '?with=contacts&limit=100'; const j = await req('GET', '/api/v4/leads' + q); return (j._embedded && j._embedded.leads) || []; },
    ping: async () => req('GET', '/api/v4/account'),
  };
}

module.exports = { leadToAmo, amoToLead, matchLead, applyPulled, pushLead, pullChanges, leadsToPush, syncAll, makeApi, digits };
