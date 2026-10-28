#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   Фейковый amoCRM (API v4) для сквозной проверки синка БЕЗ реального аккаунта.
   Эмулирует эндпоинты, которые дёргает server/amocrm.js → makeApi, + РЕАЛЬНЫЕ
   капризы боевого amo, чтобы отловить косяки до публичного запуска:
     • Bearer-токен (пустой/неверный → 401)
     • select-поля отвергают сырой текст ({value}) → 400 (нужен {enum_id})
     • rate-limit 429 с Retry-After (через /__throttle)
     • пагинация (limit/page)
     • поиск по телефону (?query=)
     • удаление сделки → update → 404
     • батч create/update (массив) и единичный PATCH /leads/:id

   Ручки:
     GET  /api/v4/account
     POST /api/v4/leads       [..]   PATCH /api/v4/leads  [..]   PATCH /api/v4/leads/:id
     POST /api/v4/contacts    [..]
     GET  /api/v4/leads?limit&page&query&filter[updated_at][from]
   Сервисное (не amo): /__dump /__reset /__setstatus /__delete /__throttle /__selectfield

   Запуск:  node tools/crm-mock/amo-mock.js   (порт 4100, токен 'testtoken')
   Направить:  AMO_API_BASE=http://localhost:4100
   ────────────────────────────────────────────────────────────────────────── */
const http = require('http');

const PORT = +(process.env.PORT || 4100);
const TOKEN = process.env.AMO_MOCK_TOKEN || 'testtoken';

const leads = new Map(), contacts = new Map();
let seq = 1000;
let throttle = 0;                 // сколько следующих API-ответов отдать как 429
const selectFields = new Set();   // field_id, которые ведут себя как список (отвергают {value})
const nowSec = () => Math.floor(Date.now() / 1000);

const send = (res, code, obj, headers) => { const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json', ...(headers || {}) }); res.end(b); };
const readBody = (req) => new Promise((r) => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { r(d ? JSON.parse(d) : null); } catch (_) { r(null); } }); });

/* проверка кастом-полей: сырой {value} в select-поле → как настоящий amo, 400 */
const badSelect = (cfv) => (cfv || []).some(f => selectFields.has(+f.field_id) && (f.values || []).some(v => v && v.value != null && v.enum_id == null));
const applyLead = (l, patch) => { Object.assign(l, patch, { id: l.id, updated_at: nowSec() }); return l; };

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');

  /* ── сервисные ручки теста (без авторизации) ── */
  if (p === '/__dump') return send(res, 200, { leads: [...leads.values()], contacts: [...contacts.values()] });
  if (p === '/__reset' && req.method === 'POST') { leads.clear(); contacts.clear(); seq = 1000; throttle = 0; selectFields.clear(); return send(res, 200, { ok: true }); }
  if (p === '/__setstatus' && req.method === 'POST') { const b = await readBody(req); const l = leads.get(+(b && b.id)); if (!l) return send(res, 404, { error: 'нет' }); l.status_id = +b.status_id; l.updated_at = nowSec(); return send(res, 200, { ok: true }); }
  if (p === '/__delete' && req.method === 'POST') { const b = await readBody(req); const ok = leads.delete(+(b && b.id)); return send(res, 200, { ok }); }
  if (p === '/__throttle' && req.method === 'POST') { const b = await readBody(req); throttle = +(b && b.count) || 0; return send(res, 200, { ok: true, throttle }); }
  if (p === '/__selectfield' && req.method === 'POST') { const b = await readBody(req); (b && b.ids || []).forEach(id => selectFields.add(+id)); return send(res, 200, { ok: true, select: [...selectFields] }); }

  /* ── rate-limit: следующие N вызовов → 429 с Retry-After ── */
  if (throttle > 0 && p.startsWith('/api/')) { throttle--; return send(res, 429, { title: 'Too Many Requests' }, { 'Retry-After': '1' }); }

  /* ── авторизация (как настоящий amo) ── */
  if (!auth || auth !== TOKEN) return send(res, 401, { title: 'Unauthorized' });

  if (p === '/api/v4/account' && req.method === 'GET') return send(res, 200, { id: 1, name: 'Mock Agency', subdomain: 'mock' });

  if (p === '/api/v4/leads/custom_fields' && req.method === 'GET') {        // метаданные полей: select → с enums, остальные → text
    const fields = [9001, 9002, 9004, 9005].map(id => ({ id, type: 'text', enums: null }))
      .concat([...selectFields].map(id => ({ id, type: 'select', enums: [{ id: 501, value: '2BR' }, { id: 502, value: '3BR' }] })));
    return send(res, 200, { _embedded: { custom_fields: fields } });
  }

  if (p === '/api/v4/contacts' && req.method === 'POST') {
    const arr = await readBody(req) || [];
    const out = arr.map(x => { const id = ++seq; contacts.set(id, Object.assign({ id }, x)); return { id }; });
    return send(res, 200, { _embedded: { contacts: out } });
  }

  if (p === '/api/v4/leads' && req.method === 'POST') {
    const arr = await readBody(req) || [];
    for (const x of arr) if (badSelect(x.custom_fields_values)) return send(res, 400, { title: 'Field value is not allowed (select expects enum_id)' });
    const out = arr.map(x => { const id = ++seq; const lead = Object.assign({ id, created_at: nowSec(), updated_at: nowSec() }, x); leads.set(id, lead); return { id }; });
    return send(res, 200, { _embedded: { leads: out } });
  }

  const mPatch = p.match(/^\/api\/v4\/leads\/(\d+)$/);
  if (mPatch && req.method === 'PATCH') {
    const id = +mPatch[1]; const b = await readBody(req) || {}; const l = leads.get(id);
    if (!l) return send(res, 404, { title: 'Not found' });
    if (badSelect(b.custom_fields_values)) return send(res, 400, { title: 'Field value is not allowed' });
    applyLead(l, b); return send(res, 200, { id });
  }
  if (p === '/api/v4/leads' && req.method === 'PATCH') {               // батч-update (массив)
    const arr = await readBody(req) || [];
    for (const x of arr) if (badSelect(x.custom_fields_values)) return send(res, 400, { title: 'Field value is not allowed' });
    const out = []; for (const x of arr) { const l = leads.get(+x.id); if (l) { applyLead(l, x); out.push({ id: l.id }); } }
    return send(res, 200, { _embedded: { leads: out } });
  }

  if (p === '/api/v4/leads' && req.method === 'GET') {
    const query = u.searchParams.get('query');
    const from = +(u.searchParams.get('filter[updated_at][from]') || 0);
    const limit = +(u.searchParams.get('limit') || 250);
    const page = +(u.searchParams.get('page') || 1);
    const withContacts = (l) => Object.assign({}, l, { _embedded: { contacts: [...contacts.values()].filter(c => (l._embedded && l._embedded.contacts || []).some(rc => rc.id === c.id)) } });
    let list = [...leads.values()].map(withContacts);
    if (query) {
      const qd = String(query).replace(/\D/g, '');
      list = list.filter(l => (l._embedded.contacts || []).some(c => (c.custom_fields_values || []).some(f => (f.values || []).some(v => v && v.value && String(v.value).replace(/\D/g, '').endsWith(qd)))));
    }
    if (from) list = list.filter(l => (l.updated_at || 0) >= from);
    const pageItems = list.slice((page - 1) * limit, page * limit);
    if (!pageItems.length) return send(res, 204, {});                 // amo отдаёт 204 на пустоту
    return send(res, 200, { _embedded: { leads: pageItems }, _page: page });
  }

  send(res, 404, { title: 'Unknown: ' + req.method + ' ' + p });
});

server.listen(PORT, () => console.log(`[amo-mock] http://localhost:${PORT} · токен: ${TOKEN}`));
