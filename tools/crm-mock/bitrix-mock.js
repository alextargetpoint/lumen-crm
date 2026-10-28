#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   Фейковый Bitrix24 REST для сквозной проверки синка БЕЗ реального портала.
   Эмулирует вебхук-API /rest/{uid}/{token}/{method}.json + боевые капризы:
     • токен в URL (неверный → INVALID_CREDENTIALS)
     • rate-limit (через /__throttle → QUERY_LIMIT_EXCEEDED, HTTP 503)
     • enum-поле (UF) отвергает НЕ-числовое значение → ERROR
     • пагинация start-offset (result + next)
     • crm.duplicate.findbycomm (дедуп по телефону)
     • crm.deal.delete → update удалённой → ERROR_NOT_FOUND_ENTITY

   Методы: profile, crm.deal.add/update/get/list/delete, crm.contact.add,
           crm.deal.fields, crm.duplicate.findbycomm
   Сервис: /__dump /__reset /__setstage /__delete /__throttle /__enumfield

   Запуск:  node tools/crm-mock/bitrix-mock.js   (порт 4200, токен 'bxtoken')
   Вебхук:  http://localhost:4200/rest/1/bxtoken/
   ────────────────────────────────────────────────────────────────────────── */
const http = require('http');

const PORT = +(process.env.PORT || 4200);
const TOKEN = process.env.BX_MOCK_TOKEN || 'bxtoken';
const PAGE = 50;

const deals = new Map(), contacts = new Map();
let seq = 1000, throttle = 0;
const enumFields = new Set();        // UF-коды, ведущие себя как список (отвергают нечисловое)
const enumItems = { 501: '2BR', 502: '3BR' };
const nowIso = () => new Date().toISOString();

const send = (res, code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(b); };
const readBody = (req) => new Promise((r) => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { r(d ? JSON.parse(d) : {}); } catch (_) { r({}); } }); });
const err = (res, code, name, desc) => send(res, code, { error: name, error_description: desc || name });
const badEnum = (fields) => Object.keys(fields || {}).some(k => enumFields.has(k) && fields[k] != null && !(fields[k] in enumItems));

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;

  /* ── сервис ── */
  if (p === '/__dump') return send(res, 200, { deals: [...deals.values()], contacts: [...contacts.values()] });
  if (p === '/__reset') { deals.clear(); contacts.clear(); seq = 1000; throttle = 0; enumFields.clear(); return send(res, 200, { ok: true }); }
  if (p === '/__setstage') { const b = await readBody(req); const d = deals.get(+b.id); if (!d) return send(res, 404, { ok: false }); d.STAGE_ID = b.stage; d.DATE_MODIFY = nowIso(); return send(res, 200, { ok: true }); }
  if (p === '/__delete') { const b = await readBody(req); return send(res, 200, { ok: deals.delete(+b.id) }); }
  if (p === '/__throttle') { const b = await readBody(req); throttle = +b.count || 0; return send(res, 200, { ok: true, throttle }); }
  if (p === '/__enumfield') { const b = await readBody(req); (b.codes || []).forEach(c => enumFields.add(c)); return send(res, 200, { ok: true, enums: [...enumFields] }); }

  /* ── разбор вебхук-пути /rest/{uid}/{token}/{method}.json ── */
  const m = p.match(/^\/rest\/(\d+)\/([^/]+)\/(.+)\.json$/);
  if (!m) return err(res, 404, 'NOT_FOUND', 'bad path');
  const token = m[2], method = m[3];
  if (token !== TOKEN) return err(res, 401, 'INVALID_CREDENTIALS', 'invalid webhook token');

  /* rate-limit */
  if (throttle > 0) { throttle--; return send(res, 503, { error: 'QUERY_LIMIT_EXCEEDED', error_description: 'Too many requests' }); }

  const b = await readBody(req);

  if (method === 'profile') return send(res, 200, { result: { ID: 1, NAME: 'Mock', ADMIN: true } });

  if (method === 'crm.contact.add') { const id = ++seq; contacts.set(id, Object.assign({ ID: id }, b.fields)); return send(res, 200, { result: id }); }

  if (method === 'crm.deal.add') {
    if (badEnum(b.fields)) return err(res, 400, 'ERROR', 'Invalid enumeration value for UF field');
    const id = ++seq; deals.set(id, Object.assign({ ID: id, DATE_CREATE: nowIso(), DATE_MODIFY: nowIso() }, b.fields));
    return send(res, 200, { result: id });
  }
  if (method === 'crm.deal.update') {
    const d = deals.get(+b.id); if (!d) return err(res, 400, 'ERROR_NOT_FOUND_ENTITY', 'Deal not found');
    if (badEnum(b.fields)) return err(res, 400, 'ERROR', 'Invalid enumeration value');
    Object.assign(d, b.fields, { ID: d.ID, DATE_MODIFY: nowIso() });
    return send(res, 200, { result: true });
  }
  if (method === 'crm.deal.get') { const d = deals.get(+b.id); return d ? send(res, 200, { result: d }) : err(res, 400, 'ERROR_NOT_FOUND_ENTITY', 'not found'); }
  if (method === 'crm.deal.delete') { return send(res, 200, { result: deals.delete(+b.id) }); }

  if (method === 'crm.deal.list') {
    const f = b.filter || {};
    let list = [...deals.values()];
    if (f.CONTACT_ID != null) list = list.filter(d => String(d.CONTACT_ID) === String(f.CONTACT_ID));
    if (f['>DATE_MODIFY']) list = list.filter(d => new Date(d.DATE_MODIFY) >= new Date(f['>DATE_MODIFY']));
    list.sort((a, c) => new Date(a.DATE_MODIFY) - new Date(c.DATE_MODIFY));
    const start = +b.start || 0;
    const pageItems = list.slice(start, start + PAGE);
    const out = { result: pageItems };
    if (start + PAGE < list.length) out.next = start + PAGE;
    return send(res, 200, out);
  }

  if (method === 'crm.duplicate.findbycomm') {
    const vals = (b.values || []).map(v => String(v).replace(/\D/g, ''));
    const found = [...contacts.values()].filter(c => (c.PHONE || []).some(ph => vals.some(v => String(ph.VALUE).replace(/\D/g, '').endsWith(v.slice(-9))))).map(c => c.ID);
    return send(res, 200, { result: { CONTACT: found } });
  }

  if (method === 'crm.deal.fields') {
    const result = { TITLE: { type: 'string' }, OPPORTUNITY: { type: 'double' } };
    [...enumFields].forEach(code => { result[code] = { type: 'enumeration', items: Object.entries(enumItems).map(([ID, VALUE]) => ({ ID: +ID, VALUE })) }; });
    return send(res, 200, { result });
  }

  err(res, 400, 'ERROR_METHOD_NOT_FOUND', 'unknown method: ' + method);
});

server.listen(PORT, () => console.log(`[bitrix-mock] http://localhost:${PORT}/rest/1/${TOKEN}/`));
