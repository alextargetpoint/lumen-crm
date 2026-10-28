#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   Фейковый amoCRM (API v4) для сквозной проверки синка БЕЗ реального аккаунта.
   Эмулирует ровно те эндпоинты, которые дёргает server/amocrm.js → makeApi:
     GET  /api/v4/account              — ping (проверка связи)
     POST /api/v4/leads      [ {..} ]  — создать сделку      → {_embedded:{leads:[{id}]}}
     PATCH/api/v4/leads/:id   {..}     — обновить сделку
     POST /api/v4/contacts   [ {..} ]  — создать контакт     → {_embedded:{contacts:[{id}]}}
     GET  /api/v4/leads?filter...      — список изменённых    → {_embedded:{leads:[...]}}
   + сервисное (не часть amo, для теста):
     GET  /__dump                      — показать, что лежит внутри «amo»
     POST /__setstatus {id,status_id}  — «брокер поменял статус в amo» (чтобы было что тянуть pull'ом)

   Запуск:  node tools/crm-mock/amo-mock.js            (порт 4100, токен 'testtoken')
            PORT=4100 AMO_MOCK_TOKEN=secret node ...
   Дашборд/тест направить сюда:  AMO_API_BASE=http://localhost:4100
   Любой НЕ пустой и совпадающий токен ок; пустой/неверный → 401 (как настоящий amo).
   ────────────────────────────────────────────────────────────────────────── */
const http = require('http');

const PORT = +(process.env.PORT || 4100);
const TOKEN = process.env.AMO_MOCK_TOKEN || 'testtoken';

const leads = new Map();      // id → lead object (amo-форма)
const contacts = new Map();   // id → contact
let seq = 1000;               // генератор id
const nowSec = () => Math.floor(Date.now() / 1000);

const send = (res, code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(b); };
const readBody = (req) => new Promise((r) => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { r(d ? JSON.parse(d) : null); } catch (_) { r(null); } }); });

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');

  // сервисные ручки теста — без авторизации
  if (p === '/__dump') return send(res, 200, { leads: [...leads.values()], contacts: [...contacts.values()] });
  if (p === '/__setstatus' && req.method === 'POST') {
    const b = await readBody(req); const l = leads.get(+(b && b.id));
    if (!l) return send(res, 404, { error: 'нет такой сделки' });
    l.status_id = +b.status_id; l.updated_at = nowSec();
    return send(res, 200, { ok: true, lead: l });
  }
  if (p === '/__reset' && req.method === 'POST') { leads.clear(); contacts.clear(); seq = 1000; return send(res, 200, { ok: true }); }

  // всё API — под Bearer-токеном (как настоящий amo: пустой/неверный → 401)
  if (!auth || auth !== TOKEN) return send(res, 401, { title: 'Unauthorized' });

  if (p === '/api/v4/account' && req.method === 'GET') return send(res, 200, { id: 1, name: 'Mock Agency', subdomain: 'mock' });

  if (p === '/api/v4/leads' && req.method === 'POST') {
    const arr = await readBody(req) || [];
    const out = arr.map(x => { const id = ++seq; const lead = Object.assign({ id, created_at: nowSec(), updated_at: nowSec() }, x); leads.set(id, lead); return { id }; });
    return send(res, 200, { _embedded: { leads: out } });
  }
  const mPatch = p.match(/^\/api\/v4\/leads\/(\d+)$/);
  if (mPatch && req.method === 'PATCH') {
    const id = +mPatch[1]; const b = await readBody(req) || {}; const l = leads.get(id);
    if (!l) return send(res, 404, { title: 'Not found' });
    Object.assign(l, b, { id, updated_at: nowSec() });
    return send(res, 200, { id });
  }
  if (p === '/api/v4/contacts' && req.method === 'POST') {
    const arr = await readBody(req) || [];
    const out = arr.map(x => { const id = ++seq; contacts.set(id, Object.assign({ id }, x)); return { id }; });
    return send(res, 200, { _embedded: { contacts: out } });
  }
  if (p === '/api/v4/leads' && req.method === 'GET') {
    const from = +(u.searchParams.get('filter[updated_at][from]') || 0);
    const list = [...leads.values()].filter(l => !from || (l.updated_at || 0) >= from)
      .map(l => Object.assign({}, l, { _embedded: { contacts: [...contacts.values()].filter(c => (l._embedded && l._embedded.contacts || []).some(rc => rc.id === c.id)) } }));
    return send(res, 200, { _embedded: { leads: list } });
  }

  send(res, 404, { title: 'Unknown endpoint: ' + req.method + ' ' + p });
});

server.listen(PORT, () => console.log(`[amo-mock] http://localhost:${PORT} · токен: ${TOKEN} · направьте: AMO_API_BASE=http://localhost:${PORT}`));
