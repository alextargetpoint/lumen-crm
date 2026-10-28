/* ──────────────────────────────────────────────────────────────────────────
   Lumen — двусторонний синк с amoCRM (API v4). Заход к агентствам НА amo без
   миграции: Lumen ведёт ИИ-переписку/обзвон/квалификацию, статусы/сделки/поля
   зеркалятся в amo. Архитектура: ЧИСТАЯ логика + тонкий HTTP-адаптер (инъектится) →
   тестируемо моками (tools/crm-mock).

   ЗАКАЛЕНО под публичный запуск (вариации реальных CRM):
   • батч-пуш (до 50/запрос) — initial sync большой базы не ложит rate-limit;
   • дедуп по телефону перед созданием — не плодим дубли в чужом amo;
   • select/multiselect custom fields (enum_id), а не только текст — иначе 400 и поле теряется;
   • пагинация пулла — не теряем изменения за первой страницей;
   • timeout + ретрай на 429/5xx/таймаут с бэк-оффом (Retry-After уважаем);
   • update удалённой сделки (404) → сбрасываем amoId, пересоздадим;
   • overlap-окно на since — переживаем рассинхрон часов;
   • опт-аут (marketingOptOut): НЕ создаём новых в amo (чтобы не триггерить его
     автоматизации по новому лиду), существующих продолжаем обновлять.

   Конфиг (db.settings.integrations.amo):
     { subdomain, token, pipelineId, statusMap:{lumenStage: amoStatusId},
       fields:{ budget: <id> | {id,type:'select'|'multiselect',enum:{Значение: enumId}} , ... },
       pullStages, enabled, dedupeByPhone, pushBatch, timeoutMs, maxRetries }
   ────────────────────────────────────────────────────────────────────────── */

const https = require('https');
const http = require('http');

const digits = (p) => String(p || '').replace(/\D/g, '');
const qv = (q) => (q && typeof q === 'object') ? (q.value != null ? q.value : q.num) : q;   /* quals: {value}/{num}/плоское */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const clip = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) : s; };

/* ───────── МАППИНГ: Lumen lead → amo lead payload (API v4) ───────── */
function leadToAmo(lead, cfg) {
  cfg = cfg || {};
  const statusMap = cfg.statusMap || {};
  const F = cfg.fields || {};
  const q = (lead && lead.quals) || {};
  const cfv = [];
  const skipped = [];
  /* fdef: число/строка → текстовое поле; {id,type:'select'|'multiselect',enum:{знач:enumId}} → список */
  const addF = (fdef, val) => {
    if (fdef == null || val == null || String(val).trim() === '') return;
    if (typeof fdef === 'object') {
      const id = +fdef.id; if (!id) return;
      if (fdef.type === 'select' || fdef.type === 'multiselect') {
        const map = fdef.enum || {};
        const key = Object.keys(map).find(k => k.toLowerCase() === String(val).toLowerCase().trim());
        if (key != null) cfv.push({ field_id: id, values: [{ enum_id: +map[key] }] });
        else skipped.push({ id, val: String(val) });                                   /* нет соответствия enum → пропуск (иначе amo 400) */
      } else cfv.push({ field_id: id, values: [{ value: clip(val, 250) }] });
    } else cfv.push({ field_id: +fdef, values: [{ value: clip(val, 250) }] });
  };
  addF(F.budget, qv(q.budget));
  addF(F.timeline, qv(q.timeline));
  addF(F.type, qv(q.type));
  addF(F.purpose, qv(q.purpose));
  addF(F.region, (lead && (lead.geoName || lead.geo)) || '');

  const name = clip((lead && lead.name) || ('Лид ' + (digits(lead && lead.phone).slice(-4) || (lead && lead.id) || '')), 250);
  const payload = { name };
  const price = +((q.budget && q.budget.num) || (lead && lead.dealValue) || 0);
  if (price > 0 && price < 1e12) payload.price = Math.round(price);
  if (statusMap[lead && lead.stage] != null) { payload.status_id = +statusMap[lead.stage]; if (cfg.pipelineId) payload.pipeline_id = +cfg.pipelineId; }
  if (cfv.length) payload.custom_fields_values = cfv;
  if (lead && lead.amoId) payload.id = +lead.amoId;                                     /* есть → update, нет → create */

  const contact = (lead && lead.phone) ? {
    name,
    custom_fields_values: [{ field_code: 'PHONE', values: [{ value: lead.phone, enum_code: 'WORK' }] }],
  } : null;
  return { lead: payload, contact, isUpdate: !!(lead && lead.amoId), skipped };
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
  (amoLead.custom_fields_values || []).forEach(f => { const v = f.values && f.values[0] && (f.values[0].value != null ? f.values[0].value : f.values[0].enum_id); if (v != null) byId[+f.field_id] = v; });
  for (const k of Object.keys(F)) { const fid = typeof F[k] === 'object' ? +F[k].id : +F[k]; if (byId[fid] != null) upd._amoFields[k] = byId[fid]; }
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

/* ───────── какие лиды пушить: синхронизированные (amoId) ИЛИ достигшие pushStages,
   изменённые после последнего пуша. Без телефона — не пушим. Опт-аут — не СОЗДАём
   новых (не триггерим автоматизации amo), но существующих обновляем. ───────── */
function leadsToPush(db, cfg) {
  cfg = cfg || {};
  const pushStages = cfg.pushStages || ['qualified', 'handover', 'viewing', 'deal'];
  return ((db && db.leads) || []).filter(l => {
    if (!l || !l.phone) return false;
    const eligible = (l.amoId != null) || pushStages.includes(l.stage);
    if (!eligible) return false;
    if (l.marketingOptOut && l.amoId == null) return false;                            /* опт-аут без amoId → не создаём */
    const changedAt = l.updatedAt || l.lastMsgAt || l.dealAt || l.createdAt || 0;
    return !l.amoSyncAt || changedAt > l.amoSyncAt;                                     /* изменился после последнего пуша */
  });
}

/* ───────── пуш ОДНОГО лида (совместимость/единичный путь) ───────── */
async function pushLead(db, lead, deps) {
  deps = deps || {};
  const cfg = deps.cfg || {};
  if (!deps.api) throw new Error('нет amo API');
  const { lead: payload, contact } = leadToAmo(lead, cfg);
  let contactId = lead.amoContactId || null;
  if (contact && !contactId && deps.api.createContact) { try { const c = await deps.api.createContact(contact); contactId = c && c.id; if (contactId) lead.amoContactId = contactId; } catch (e) { /* контакт не критичен */ } }
  if (contactId) payload._embedded = { contacts: [{ id: +contactId }] };
  if (payload.id) { await deps.api.updateLead(payload); }
  else { const res = await deps.api.createLead(payload); if (res && res.id) lead.amoId = res.id; }
  lead.amoSyncAt = cfg.now || Date.now();
  return { ok: true, amoId: lead.amoId, action: payload.id ? 'update' : 'create' };
}

/* ───────── авто-определение типов полей из amo (чтобы select-поле, замапленное
   «голым» id, уехало как enum_id, а не текст → не ловим 400 и не теряем поле) ───────── */
async function resolveFieldTypes(cfg, api) {
  if (!api || !api.leadFields) return cfg;
  const plain = Object.values(cfg.fields || {}).some(v => v != null && typeof v !== 'object');
  if (!plain) return cfg;                                                     /* всё уже типизировано */
  let meta;
  try { meta = await api.leadFields(); } catch (_) { return cfg; }            /* нет метаданных → работаем как есть */
  const upgraded = {};
  for (const [k, v] of Object.entries(cfg.fields || {})) {
    if (v != null && typeof v === 'object') { upgraded[k] = v; continue; }
    const m = meta[+v];
    if (m && (m.type === 'select' || m.type === 'multiselect')) upgraded[k] = { id: +v, type: m.type, enum: m.enums || {} };
    else upgraded[k] = v;
  }
  return { ...cfg, fields: upgraded };
}

/* ───────── батч-создание (с контактами); при ошибке батча — изоляция по одному,
   чтобы один «плохой» лид не завалил остальные 49 ───────── */
async function createBatch(db, leads, deps) {
  const cfg = deps.cfg || {};
  const api = deps.api;
  const needC = leads.filter(l => l.phone && !l.amoContactId);
  if (needC.length) {
    const payloads = needC.map(l => leadToAmo(l, cfg).contact).filter(Boolean);
    try {
      if (api.createContacts) { const cs = await api.createContacts(payloads); needC.forEach((l, i) => { if (cs[i] && cs[i].id) l.amoContactId = cs[i].id; }); }
      else if (api.createContact) { for (let i = 0; i < needC.length; i++) { try { const c = await api.createContact(payloads[i]); if (c && c.id) needC[i].amoContactId = c.id; } catch (_) {} } }
    } catch (_) { /* контакты не критичны — лид создадим и без привязки */ }
  }
  const payloads = leads.map(l => { const { lead: p } = leadToAmo(l, cfg); if (l.amoContactId) p._embedded = { contacts: [{ id: +l.amoContactId }] }; return p; });
  const assign = (i, r) => { if (r && r.id) { leads[i].amoId = r.id; leads[i].amoSyncAt = cfg.now || Date.now(); delete leads[i]._amoErr; } };
  try {
    let created = [];
    if (api.createLeads) created = await api.createLeads(payloads);
    else for (const p of payloads) { const r = await api.createLead(p); created.push(r || {}); }
    created.forEach((r, i) => assign(i, r));
  } catch (e) {
    for (let i = 0; i < payloads.length; i++) {                              /* батч упал → поштучно, изолируя битый лид */
      try { const r = api.createLeads ? (await api.createLeads([payloads[i]]))[0] : await api.createLead(payloads[i]); assign(i, r); }
      catch (e2) { leads[i]._amoErr = e2.message; }
    }
  }
  return leads.filter(l => l.amoId).length;
}

/* ───────── ПУЛЛ изменённых лидов ИЗ amo → применить в Lumen (с overlap-окном) ───────── */
async function pullChanges(db, deps) {
  deps = deps || {};
  const cfg = deps.cfg || {};
  if (!deps.api) throw new Error('нет amo API');
  const base = deps.since != null ? deps.since : (cfg.lastPullAt || 0);
  const since = base > 0 ? Math.max(0, base - (cfg.sinceOverlapMs != null ? cfg.sinceOverlapMs : 120000)) : 0;   /* overlap против рассинхрона часов */
  const amoLeads = await deps.api.listChangedLeads(since);
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

/* ───────── ПОЛНЫЙ СИНК: дедуп → батч-создание → апдейты (404-safe) → пулл ───────── */
async function syncAll(db, deps) {
  deps = deps || {};
  if (!deps.api) throw new Error('нет amo API');
  const cfg = await resolveFieldTypes(deps.cfg || {}, deps.api);                        /* select-поля → enum ДО маппинга */
  deps = { ...deps, cfg };
  const all = leadsToPush(db, cfg);

  /* ДЕДУП: для кандидатов на создание ищем в amo по телефону — усыновляем, не плодим дубль */
  let deduped = 0;
  if (cfg.dedupeByPhone !== false && deps.api.searchLeadByPhone) {
    for (const l of all) {
      if (l.amoId == null && l.phone) {
        try { const f = await deps.api.searchLeadByPhone(l.phone); if (f && f.id) { l.amoId = f.id; if (f.amoContactId) l.amoContactId = f.amoContactId; deduped++; } } catch (_) {}
      }
    }
  }

  const creates = all.filter(l => l.amoId == null);
  const updates = all.filter(l => l.amoId != null);
  const B = Math.max(1, Math.min(50, cfg.pushBatch || 50));
  let pushed = 0, pushErr = 0, created = 0, updated = 0, recreated = 0;

  /* СОЗДАНИЕ — батчами (initial sync большой базы) */
  for (let i = 0; i < creates.length; i += B) {
    const chunk = creates.slice(i, i + B);
    try { const n = await createBatch(db, chunk, deps); created += n; pushed += n; pushErr += (chunk.length - n); if (deps.save) await deps.save(); }   /* createBatch изолирует битых внутри → недосозданные = ошибки */
    catch (e) { pushErr += chunk.length; chunk.forEach(l => l._amoErr = e.message); }
  }

  /* АПДЕЙТЫ — поштучно, чтобы ловить 404 (сделку удалили в amo) индивидуально */
  for (const l of updates) {
    try {
      const { lead: p, contact } = leadToAmo(l, cfg);
      if (contact && !l.amoContactId && deps.api.createContact) { try { const c = await deps.api.createContact(contact); if (c && c.id) l.amoContactId = c.id; } catch (_) {} }
      if (l.amoContactId) p._embedded = { contacts: [{ id: +l.amoContactId }] };
      await deps.api.updateLead(p);
      l.amoSyncAt = cfg.now || Date.now(); updated++; pushed++;
    } catch (e) {
      if (e && e.status === 404) { l.amoId = null; delete l.amoContactId; delete l.amoSyncAt; l._amoErr = 'сделка удалена в amo — пересоздадим'; recreated++; }   /* пересоздастся в следующий цикл */
      else { pushErr++; l._amoErr = e.message; }
    }
    if (deps.save) await deps.save();
  }

  let pull = { pulled: 0, matched: 0, applied: 0, skipped: 0 };
  if (deps.pull !== false) { try { pull = await pullChanges(db, deps); } catch (e) { pull.error = e.message; } }
  return { ok: true, pushed, pushErr, created, updated, deduped, recreated, pull };
}

/* ───────── ТОНКИЙ HTTP-АДАПТЕР amoCRM API v4 (timeout + ретрай + батч + пагинация) ───────── */
function makeApi(cfg) {
  cfg = cfg || {};
  const override = cfg.apiBase || process.env.AMO_API_BASE || '';
  const host0 = (cfg.subdomain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const base = host0.includes('.') ? host0 : (host0 + '.amocrm.ru');
  let mod = https, opts = { host: base, port: 443 };
  if (override) { const u = new URL(override); mod = u.protocol === 'http:' ? http : https; opts = { host: u.hostname, port: u.port || (mod === http ? 80 : 443) }; }
  const timeoutMs = cfg.timeoutMs || 20000;
  const maxRetries = cfg.maxRetries != null ? cfg.maxRetries : 3;

  const once = (method, path, body) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = mod.request({ ...opts, path, method, headers: { Authorization: 'Bearer ' + (cfg.token || ''), 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } }, (resp) => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => {
        let j = {}; try { j = d ? JSON.parse(d) : {}; } catch (_) {}
        if (resp.statusCode >= 300) { const e = new Error('amo ' + resp.statusCode + ': ' + (j && j.title ? j.title : String(d).slice(0, 120))); e.status = resp.statusCode; e.retryAfter = +resp.headers['retry-after'] || 0; return reject(e); }
        resolve(j);
      });
    });
    r.on('error', (err) => { err.status = err.status || 0; reject(err); });
    r.setTimeout(timeoutMs, () => { const e = new Error('amo timeout ' + timeoutMs + 'ms'); e.status = 0; r.destroy(e); });
    if (data) r.write(data); r.end();
  });

  const req = async (method, path, body) => {
    let attempt = 0;
    for (;;) {
      try { return await once(method, path, body); }
      catch (e) {
        const retriable = e.status === 429 || (e.status >= 500 && e.status < 600) || e.status === 0;   /* 0 = timeout/сеть */
        if (!retriable || attempt >= maxRetries) throw e;
        const backoff = Math.min(8000, 300 * Math.pow(2, attempt));
        await sleep((e.retryAfter ? e.retryAfter * 1000 : backoff) + attempt * 50);
        attempt++;
      }
    }
  };

  return {
    ping: async () => req('GET', '/api/v4/account'),
    createLead: async (p) => { const j = await req('POST', '/api/v4/leads', [p]); return (j._embedded && j._embedded.leads && j._embedded.leads[0]) || null; },
    createLeads: async (arr) => { if (!arr || !arr.length) return []; const j = await req('POST', '/api/v4/leads', arr); return (j._embedded && j._embedded.leads) || []; },
    updateLead: async (p) => { const id = p.id; const body = Object.assign({}, p); delete body.id; return req('PATCH', '/api/v4/leads/' + id, body); },
    createContact: async (c) => { const j = await req('POST', '/api/v4/contacts', [c]); return (j._embedded && j._embedded.contacts && j._embedded.contacts[0]) || null; },
    createContacts: async (arr) => { if (!arr || !arr.length) return []; const j = await req('POST', '/api/v4/contacts', arr); return (j._embedded && j._embedded.contacts) || []; },
    searchLeadByPhone: async (phone) => {
      const ph = digits(phone).slice(-9); if (ph.length < 7) return null;
      const j = await req('GET', '/api/v4/leads?with=contacts&limit=10&query=' + encodeURIComponent(ph));
      const leads = (j._embedded && j._embedded.leads) || [];
      if (!leads.length) return null;
      const l = leads[0];
      const cId = (l._embedded && l._embedded.contacts && l._embedded.contacts[0] && l._embedded.contacts[0].id) || null;
      return { id: l.id, amoContactId: cId };
    },
    leadFields: async () => {                                                            /* метаданные custom fields → {id:{type,enums:{значениеLower:enumId}}} */
      const limit = 250; let page = 1; const out = {};
      for (;;) {
        const j = await req('GET', '/api/v4/leads/custom_fields?limit=' + limit + '&page=' + page);
        const fs = (j._embedded && j._embedded.custom_fields) || [];
        for (const f of fs) { const enums = {}; (f.enums || []).forEach(e => { if (e && e.value != null && e.id != null) enums[String(e.value).toLowerCase()] = +e.id; }); out[+f.id] = { type: f.type, enums }; }
        if (fs.length < limit || page >= 20) break;
        page++;
      }
      return out;
    },
    listChangedLeads: async (since) => {
      const limit = cfg.pageLimit || 250; const maxPages = cfg.maxPages || 50;
      let page = 1, out = [];
      for (;;) {
        const q = '?with=contacts&limit=' + limit + '&page=' + page + (since ? ('&filter[updated_at][from]=' + Math.floor(since / 1000)) : '');
        const j = await req('GET', '/api/v4/leads' + q);
        const got = (j._embedded && j._embedded.leads) || [];
        out = out.concat(got);
        if (got.length < limit || page >= maxPages) break;
        page++;
      }
      return out;
    },
  };
}

module.exports = { leadToAmo, amoToLead, matchLead, applyPulled, pushLead, createBatch, resolveFieldTypes, pullChanges, leadsToPush, syncAll, makeApi, digits };
