/* ──────────────────────────────────────────────────────────────────────────
   Lumen — двусторонний синк с Bitrix24 (REST). Та же схема, что amoCRM: чистая
   логика + тонкий HTTP-адаптер (инъектится) → тестируемо моками (tools/crm-mock).

   Отличия Bitrix от amo (см. tools/crm-mock/EDGE-CASES.md):
   • Подключение — ВХОДЯЩИЙ ВЕБХУК-URL: https://{portal}.bitrix24.ru/rest/{uid}/{token}/
     (токен в URL, OAuth не нужен). Секрет — стрипаем из publicSettings.
   • Lumen-лид → СДЕЛКА (crm.deal), не Lead. CATEGORY_ID + STAGE_ID вида "C1:NEW".
   • Поля — UF_CRM_*. Enum (список) — items из crm.deal.fields → авто-детект типа.
   • Телефон — мультиполе контакта PHONE:[{VALUE,VALUE_TYPE}].
   • Rate-limit 2 rps (строже amo) → троттлинг-очередь (~550мс между запросами)
     + ретрай на 503/QUERY_LIMIT_EXCEEDED/таймаут.
   • Пагинация — start-offset, ответ { result, next }.

   Вся прочая закалка (дедуп по телефону, 404→пересоздание, опт-аут, overlap-окно,
   усечение имени, изоляция битого лида) — как в amocrm.js.

   Конфиг (db.settings.integrations.bitrix):
     { webhook, categoryId, stageMap:{lumenStage: 'C1:NEW'},
       fields:{budget:'UF_CRM_...'| {id,type,enum}}, currencyId,
       pullStages, enabled, dedupeByPhone }
   ────────────────────────────────────────────────────────────────────────── */

const https = require('https');
const http = require('http');

const digits = (p) => String(p || '').replace(/\D/g, '');
const qv = (q) => (q && typeof q === 'object') ? (q.value != null ? q.value : q.num) : q;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const clip = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) : s; };
const isNotFound = (e) => e && (/not\s*found|ERROR_NOT_FOUND/i.test(e.message || '') || /NOT_FOUND/i.test(e.code || ''));

/* ───────── МАППИНГ: Lumen lead → Bitrix deal fields ───────── */
function leadToBitrix(lead, cfg) {
  cfg = cfg || {};
  const stageMap = cfg.stageMap || {};
  const F = cfg.fields || {};
  const q = (lead && lead.quals) || {};
  const fields = {};
  const skipped = [];
  const addF = (fdef, val) => {
    if (fdef == null || val == null || String(val).trim() === '') return;
    if (typeof fdef === 'object') {
      const code = fdef.id || fdef.code; if (!code) return;
      if (fdef.type === 'enumeration' || fdef.type === 'select' || fdef.type === 'multiselect') {
        const map = fdef.enum || {};
        const key = Object.keys(map).find(k => k.toLowerCase() === String(val).toLowerCase().trim());
        if (key != null) fields[code] = map[key];                                       /* enum item ID */
        else skipped.push({ code, val: String(val) });
      } else fields[code] = clip(val, 250);
    } else fields[fdef] = clip(val, 250);
  };
  addF(F.budget, qv(q.budget));
  addF(F.timeline, qv(q.timeline));
  addF(F.type, qv(q.type));
  addF(F.purpose, qv(q.purpose));
  addF(F.region, (lead && (lead.geoName || lead.geo)) || '');

  const name = clip((lead && lead.name) || ('Лид ' + (digits(lead && lead.phone).slice(-4) || (lead && lead.id) || '')), 250);
  fields.TITLE = name;
  const price = +((q.budget && q.budget.num) || (lead && lead.dealValue) || 0);
  if (price > 0 && price < 1e12) { fields.OPPORTUNITY = Math.round(price); if (cfg.currencyId) fields.CURRENCY_ID = cfg.currencyId; }
  if (stageMap[lead && lead.stage]) { fields.STAGE_ID = stageMap[lead.stage]; if (cfg.categoryId != null && cfg.categoryId !== '') fields.CATEGORY_ID = +cfg.categoryId; }

  const contact = (lead && lead.phone) ? { NAME: name, PHONE: [{ VALUE: lead.phone, VALUE_TYPE: 'WORK' }] } : null;
  return { deal: fields, contact, isUpdate: !!(lead && lead.bitrixId), skipped };
}

/* ───────── МАППИНГ: Bitrix deal → что подтянуть в Lumen ───────── */
function bitrixToLead(d, cfg) {
  cfg = cfg || {};
  const stageByStage = {};
  Object.keys(cfg.stageMap || {}).forEach(st => { stageByStage[cfg.stageMap[st]] = st; });
  const upd = { _fields: {} };
  if (d.STAGE_ID != null && stageByStage[d.STAGE_ID]) upd.stage = stageByStage[d.STAGE_ID];
  if (d.TITLE) upd.name = d.TITLE;
  const F = cfg.fields || {};
  for (const k of Object.keys(F)) { const code = typeof F[k] === 'object' ? (F[k].id || F[k].code) : F[k]; if (code && d[code] != null && d[code] !== '') upd._fields[k] = d[code]; }
  return upd;
}

/* ───────── МАТЧИНГ: по bitrixId, иначе по телефону (last 9) ───────── */
function matchLead(db, d) {
  const leads = (db && db.leads) || [];
  if (d.ID != null) { const b = leads.find(x => x.bitrixId != null && String(x.bitrixId) === String(d.ID)); if (b) return b; }
  const phones = [];
  if (d._phone) phones.push(digits(d._phone));
  (d._contactPhones || []).forEach(p => phones.push(digits(p)));
  for (const ph of phones) { if (ph.length < 7) continue; const l = leads.find(x => x.phone && digits(x.phone).endsWith(ph.slice(-9))); if (l) return l; }
  return null;
}

/* ───────── ПРИМЕНИТЬ подтянутое (не затираем свои непустые quals) ───────── */
function applyPulled(db, lead, upd, cfg) {
  cfg = cfg || {};
  const changed = [];
  if (upd.stage && upd.stage !== lead.stage && cfg.pullStages !== false) { lead.stage = upd.stage; changed.push('stage'); }
  if (upd.name && !lead.name) { lead.name = upd.name; changed.push('name'); }
  const q = lead.quals = lead.quals || {};
  const f = upd._fields || {};
  for (const k of ['budget', 'timeline', 'type', 'purpose']) {
    if (f[k] != null && String(f[k]).trim() !== '' && (!q[k] || !q[k].value)) { q[k] = { value: String(f[k]), by: 'bitrix', at: (cfg.now || Date.now()) }; changed.push('qual:' + k); }
  }
  return changed;
}

/* ───────── какие лиды пушить (опт-аут без bitrixId не создаём) ───────── */
function leadsToPush(db, cfg) {
  cfg = cfg || {};
  const pushStages = cfg.pushStages || ['qualified', 'handover', 'viewing', 'deal'];
  return ((db && db.leads) || []).filter(l => {
    if (!l || !l.phone) return false;
    const eligible = (l.bitrixId != null) || pushStages.includes(l.stage);
    if (!eligible) return false;
    if (l.marketingOptOut && l.bitrixId == null) return false;
    const changedAt = l.updatedAt || l.lastMsgAt || l.dealAt || l.createdAt || 0;
    return !l.bitrixSyncAt || changedAt > l.bitrixSyncAt;
  });
}

/* ───────── авто-определение типов полей (enumeration → enum_id, не текст) ───────── */
async function resolveFieldTypes(cfg, api) {
  if (!api || !api.dealFields) return cfg;
  const plain = Object.values(cfg.fields || {}).some(v => v != null && typeof v !== 'object');
  if (!plain) return cfg;
  let meta; try { meta = await api.dealFields(); } catch (_) { return cfg; }
  const upgraded = {};
  for (const [k, v] of Object.entries(cfg.fields || {})) {
    if (v != null && typeof v === 'object') { upgraded[k] = v; continue; }
    const m = meta[v];
    if (m && (m.type === 'enumeration' || m.type === 'crm_multifield' || m.type === 'multiselect')) upgraded[k] = { id: v, type: 'enumeration', enum: m.enums || {} };
    else upgraded[k] = v;
  }
  return { ...cfg, fields: upgraded };
}

/* ───────── создание пачки (поштучно, с контактом; изоляция битого лида) ───────── */
async function createBatch(db, leads, deps) {
  const cfg = deps.cfg || {};
  const api = deps.api;
  for (const l of leads) {
    try {
      const { deal, contact } = leadToBitrix(l, cfg);
      let cId = l.bitrixContactId || null;
      if (contact && !cId && api.createContact) { try { const c = await api.createContact(contact); cId = c && c.id; if (cId) l.bitrixContactId = cId; } catch (_) {} }
      if (cId) deal.CONTACT_ID = cId;
      const r = await api.createDeal(deal);
      if (r && r.id) { l.bitrixId = r.id; l.bitrixSyncAt = cfg.now || Date.now(); delete l._bxErr; }
    } catch (e) { l._bxErr = e.message; }
  }
  return leads.filter(l => l.bitrixId).length;
}

/* ───────── ПУЛЛ изменённых сделок ИЗ Bitrix → Lumen (overlap-окно) ───────── */
async function pullChanges(db, deps) {
  deps = deps || {};
  const cfg = deps.cfg || {};
  if (!deps.api) throw new Error('нет Bitrix API');
  const base = deps.since != null ? deps.since : (cfg.lastPullAt || 0);
  const since = base > 0 ? Math.max(0, base - (cfg.sinceOverlapMs != null ? cfg.sinceOverlapMs : 120000)) : 0;
  const deals = await deps.api.listChangedDeals(since);
  let applied = 0, matched = 0, skipped = 0;
  for (const d of (deals || [])) {
    const lead = matchLead(db, d);
    if (!lead) { skipped++; continue; }
    matched++;
    if (lead.bitrixId == null) lead.bitrixId = d.ID;
    const upd = bitrixToLead(d, cfg);
    const ch = applyPulled(db, lead, upd, cfg);
    if (ch.length) applied++;
  }
  return { ok: true, pulled: (deals || []).length, matched, applied, skipped };
}

/* ───────── пуш ОДНОГО лида (совместимость) ───────── */
async function pushLead(db, lead, deps) {
  deps = deps || {};
  const cfg = deps.cfg || {};
  if (!deps.api) throw new Error('нет Bitrix API');
  const { deal, contact } = leadToBitrix(lead, cfg);
  let cId = lead.bitrixContactId || null;
  if (contact && !cId && deps.api.createContact) { try { const c = await deps.api.createContact(contact); cId = c && c.id; if (cId) lead.bitrixContactId = cId; } catch (_) {} }
  if (cId) deal.CONTACT_ID = cId;
  if (lead.bitrixId) await deps.api.updateDeal(lead.bitrixId, deal);
  else { const r = await deps.api.createDeal(deal); if (r && r.id) lead.bitrixId = r.id; }
  lead.bitrixSyncAt = cfg.now || Date.now();
  return { ok: true, bitrixId: lead.bitrixId, action: lead.bitrixId ? (deal.id ? 'update' : 'create') : 'create' };
}

/* ───────── ПОЛНЫЙ СИНК ───────── */
async function syncAll(db, deps) {
  deps = deps || {};
  if (!deps.api) throw new Error('нет Bitrix API');
  const cfg = await resolveFieldTypes(deps.cfg || {}, deps.api);
  deps = { ...deps, cfg };
  const all = leadsToPush(db, cfg);

  let deduped = 0;
  if (cfg.dedupeByPhone !== false && deps.api.searchByPhone) {
    for (const l of all) {
      if (l.bitrixId == null && l.phone) {
        try { const f = await deps.api.searchByPhone(l.phone); if (f) { if (f.contactId) l.bitrixContactId = f.contactId; if (f.dealId) { l.bitrixId = f.dealId; deduped++; } } } catch (_) {}
      }
    }
  }

  const creates = all.filter(l => l.bitrixId == null);
  const updates = all.filter(l => l.bitrixId != null);
  const B = Math.max(1, Math.min(50, cfg.pushBatch || 50));
  let pushed = 0, pushErr = 0, created = 0, updated = 0, recreated = 0;

  for (let i = 0; i < creates.length; i += B) {
    const chunk = creates.slice(i, i + B);
    const n = await createBatch(db, chunk, deps); created += n; pushed += n; pushErr += (chunk.length - n);
    if (deps.save) await deps.save();
  }

  for (const l of updates) {
    try {
      const { deal, contact } = leadToBitrix(l, cfg);
      if (contact && !l.bitrixContactId && deps.api.createContact) { try { const c = await deps.api.createContact(contact); if (c && c.id) l.bitrixContactId = c.id; } catch (_) {} }
      if (l.bitrixContactId) deal.CONTACT_ID = l.bitrixContactId;
      await deps.api.updateDeal(l.bitrixId, deal);
      l.bitrixSyncAt = cfg.now || Date.now(); updated++; pushed++;
    } catch (e) {
      if (isNotFound(e)) { l.bitrixId = null; delete l.bitrixContactId; delete l.bitrixSyncAt; l._bxErr = 'сделка удалена в Bitrix — пересоздадим'; recreated++; }
      else { pushErr++; l._bxErr = e.message; }
    }
    if (deps.save) await deps.save();
  }

  let pull = { pulled: 0, matched: 0, applied: 0, skipped: 0 };
  if (deps.pull !== false) { try { pull = await pullChanges(db, deps); } catch (e) { pull.error = e.message; } }
  return { ok: true, pushed, pushErr, created, updated, deduped, recreated, pull };
}

/* ───────── ТОНКИЙ HTTP-АДАПТЕР Bitrix24 REST (троттлинг 2rps + ретрай + пагинация) ───────── */
function makeApi(cfg) {
  cfg = cfg || {};
  const url = String(cfg.webhook || '').replace(/\/+$/, '') + '/';
  let u; try { u = new URL(url); } catch (_) { u = null; }
  const mod = u && u.protocol === 'http:' ? http : https;
  const host = u ? u.hostname : '';
  const port = u ? (u.port || (mod === http ? 80 : 443)) : 443;
  const basePath = u ? u.pathname : '/';
  const timeoutMs = cfg.timeoutMs || 20000;
  const maxRetries = cfg.maxRetries != null ? cfg.maxRetries : 4;
  const minGapMs = cfg.minGapMs != null ? cfg.minGapMs : 550;               /* ~2 rps лимит Bitrix */

  const once = (method, params) => new Promise((resolve, reject) => {
    if (!u) return reject(Object.assign(new Error('bitrix: кривой webhook URL'), { status: 0 }));
    const data = JSON.stringify(params || {});
    const r = mod.request({ host, port, path: basePath + method + '.json', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (resp) => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => {
        let j = {}; try { j = d ? JSON.parse(d) : {}; } catch (_) {}
        if (resp.statusCode >= 300 || j.error) { const e = new Error('bitrix ' + (j.error || resp.statusCode) + ': ' + (j.error_description || String(d).slice(0, 120))); e.status = resp.statusCode; e.code = j.error; return reject(e); }
        resolve(j);
      });
    });
    r.on('error', (e) => { e.status = e.status || 0; reject(e); });
    r.setTimeout(timeoutMs, () => { const e = new Error('bitrix timeout ' + timeoutMs + 'ms'); e.status = 0; r.destroy(e); });
    r.write(data); r.end();
  });

  /* очередь-троттлинг: запросы серилизуются с паузой minGapMs → не превышаем 2rps */
  let chain = Promise.resolve();
  const spaced = (fn) => { const run = chain.then(fn, fn); chain = run.then(() => sleep(minGapMs), () => sleep(minGapMs)); return run; };
  const req = async (method, params) => {
    let attempt = 0;
    for (;;) {
      try { return await spaced(() => once(method, params)); }
      catch (e) {
        const retriable = e.status === 503 || e.status === 429 || (e.status >= 500 && e.status < 600) || e.status === 0 || e.code === 'QUERY_LIMIT_EXCEEDED';
        if (!retriable || attempt >= maxRetries) throw e;
        await sleep(Math.min(8000, 400 * Math.pow(2, attempt)));
        attempt++;
      }
    }
  };

  return {
    ping: async () => req('profile', {}),
    createDeal: async (fields) => { const j = await req('crm.deal.add', { fields }); return j.result ? { id: j.result } : null; },
    updateDeal: async (id, fields) => req('crm.deal.update', { id, fields }),
    getDeal: async (id) => { const j = await req('crm.deal.get', { id }); return j.result || null; },
    createContact: async (fields) => { const j = await req('crm.contact.add', { fields }); return j.result ? { id: j.result } : null; },
    searchByPhone: async (phone) => {
      const ph = digits(phone); if (ph.length < 7) return null;
      const j = await req('crm.duplicate.findbycomm', { type: 'PHONE', values: [phone], entity_type: 'CONTACT' });
      const cId = (j.result && j.result.CONTACT && j.result.CONTACT[0]) || null;
      if (!cId) return null;
      const dl = await req('crm.deal.list', { filter: { CONTACT_ID: cId }, select: ['ID'], start: 0 });
      const dId = (dl.result && dl.result[0] && dl.result[0].ID) || null;
      return { contactId: cId, dealId: dId };
    },
    dealFields: async () => {
      const j = await req('crm.deal.fields', {});
      const out = {}; const r = j.result || {};
      for (const code of Object.keys(r)) { const f = r[code]; const enums = {}; (f.items || []).forEach(e => { if (e && e.VALUE != null && e.ID != null) enums[String(e.VALUE).toLowerCase()] = e.ID; }); out[code] = { type: f.type, enums }; }
      return out;
    },
    listChangedDeals: async (since) => {
      const filter = {}; if (since) filter['>DATE_MODIFY'] = new Date(since).toISOString();
      const maxPages = cfg.maxPages || 50;
      let start = 0, out = [];
      for (let page = 0; page < maxPages; page++) {
        const j = await req('crm.deal.list', { filter, select: ['*', 'UF_*'], order: { DATE_MODIFY: 'ASC' }, start });
        const got = j.result || [];
        out = out.concat(got);
        if (j.next == null) break;
        start = j.next;
      }
      return out;
    },
  };
}

module.exports = { leadToBitrix, bitrixToLead, matchLead, applyPulled, pushLead, createBatch, resolveFieldTypes, pullChanges, leadsToPush, syncAll, makeApi, digits };
