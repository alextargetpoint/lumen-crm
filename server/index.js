/* Lumen CRM — HTTP-сервер: статика + JSON API + вебхук WhatsApp Cloud API.
   Zero-dependency (node:http), Node 18+. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

/* .env → process.env (без зависимостей) */
try {
  const envFile = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
} catch (e) { console.error('[env]', e.message); }

const store = require('./store');
const { seed } = require('./seed');
const ai = require('./ai');
const engine = require('./engine');

const PORT = process.env.PORT || 5077;
const PUBLIC = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

const llm = require('./llm');
const wa = require('./wa');

store.load(seed);
engine.startLoop();

/* ---------- авторизация ---------- */
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const DEFAULT_PASS = 'lumen2026';
{
  const db = store.get();
  if (!db.settings.auth) {
    db.settings.auth = { passHash: sha(DEFAULT_PASS), sessions: {} };
    store.save();
    console.log(`[auth] пароль по умолчанию: ${DEFAULT_PASS} — смените в «Подключениях»`);
  }
  if (db.settings.ai.provider === 'mock') { db.settings.ai.provider = 'auto'; store.save(); }
}

function getSession(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/lumen_sid=([a-f0-9]{32})/);
  if (!m) return null;
  return store.get().settings.auth.sessions[m[1]] ? m[1] : null;
}

function publicSettings(db) {
  const s = JSON.parse(JSON.stringify(db.settings));
  delete s.auth;
  if (s.wa.token) { s.wa.tokenSet = true; delete s.wa.token; }
  s.ai.llmAvailable = llm.available();
  s.ai.llmModel = llm.MODEL;
  return s;
}

const json = (res, code, data) => {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
};

const readBody = (req) => new Promise((resolve) => {
  let b = '';
  req.on('data', (c) => { b += c; if (b.length > 2e6) req.destroy(); });
  req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } });
});

function leadView(db, l) {
  let lastText = null;
  for (let i = db.messages.length - 1; i >= 0; i--) {
    if (db.messages[i].leadId === l.id) { lastText = db.messages[i].text; break; }
  }
  return Object.assign({}, l, {
    brokerName: (db.brokers.find(b => b.id === l.broker) || {}).name || null,
    geoName: db.settings.geoNames[l.geo] || l.geo,
    axesFilled: ai.AXES.filter(a => l.quals[a]).length,
    wakeScore: l.stage === 'sleeping' ? engine.wakeScore(db, l) : null,
    lastText,
  });
}

function analytics(db) {
  const leads = db.leads;
  const by = (st) => leads.filter(l => l.stage === st).length;
  const contacted = leads.filter(l => db.messages.some(m => m.leadId === l.id && m.dir === 'out'));
  const replied = contacted.filter(l => db.messages.some(m => m.leadId === l.id && m.dir === 'in'));
  const qualifiedPlus = replied.filter(l => ['qualified', 'handover', 'viewing', 'deal'].includes(l.stage));
  const geoStats = {};
  for (const g of db.settings.agency.geos) {
    const gl = leads.filter(l => l.geo === g);
    const gq = gl.filter(l => ['qualified', 'handover', 'viewing', 'deal'].includes(l.stage));
    geoStats[g] = { name: db.settings.geoNames[g], total: gl.length, qualified: gq.length, conv: gl.length ? Math.round(gq.length / gl.length * 100) : 0 };
  }
  return {
    funnel: { new: by('new'), touch: by('touch'), dialog: by('dialog'), qualified: by('qualified'), handover: by('handover'), viewing: by('viewing'), deal: by('deal'), sleeping: by('sleeping'), lost: by('lost') },
    compare: {
      human: { firstContact: '47 мин', dialogConv: 40, qualConv: 30, qualTime: '2–3 дня' },
      aiLine: {
        firstContact: '≈1 мин',
        dialogConv: contacted.length ? Math.round(replied.length / contacted.length * 100) : 0,
        qualConv: replied.length ? Math.round(qualifiedPlus.length / replied.length * 100) : 0,
        qualTime: '≤3 часа',
      },
    },
    geoStats,
    wa: {
      sentToday: db.numbers.reduce((s, n) => s + n.sentToday, 0),
      numbersActive: db.numbers.filter(n => n.state === 'active').length,
      avgQuality: Math.round(db.numbers.reduce((s, n) => s + n.quality, 0) / db.numbers.length),
    },
  };
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  const db = store.get();

  try {
    /* ---------------- WhatsApp Cloud API webhook ---------------- */
    if (p === '/wa/webhook' && req.method === 'GET') {
      if (u.searchParams.get('hub.verify_token') === db.settings.wa.webhookVerifyToken) {
        res.writeHead(200); res.end(u.searchParams.get('hub.challenge') || ''); return;
      }
      res.writeHead(403); res.end(); return;
    }
    if (p === '/wa/webhook' && req.method === 'POST') {
      const body = await readBody(req);
      try {
        const changes = body.entry?.[0]?.changes?.[0]?.value;
        if (wa.applyStatuses(db, changes)) store.save();
        const wam = changes?.messages?.[0];
        if (wam && wam.type === 'text') {
          const phone = '+' + wam.from.replace(/\D/g, '');
          let lead = db.leads.find(l => l.phone.replace(/\D/g, '') === wam.from.replace(/\D/g, ''));
          if (!lead) {
            lead = { id: store.nextId('ld'), name: changes.contacts?.[0]?.profile?.name || phone, phone, geo: db.settings.agency.geos[0], lang: 'ru', tz: 4, stage: 'new', score: 0, source: 'wa_inbound', createdAt: Date.now(), lastMsgAt: null, lastDir: null, quals: { purpose: null, timeline: null, budget: null, type: null }, ai: { enabled: true, chainStep: 0, nextTouchAt: null, silentSince: null }, broker: null, summary: null, tags: ['входящий'], numberId: null };
            db.leads.push(lead);
            ai.pushEvent(db, { type: 'lead_new', leadId: lead.id, text: `Входящий WhatsApp: ${lead.name}` });
          }
          engine.inbound(db, lead, wam.text.body);
        }
      } catch (e) { console.error('[webhook]', e); }
      json(res, 200, { ok: true }); return;
    }

    /* ---------------- auth ---------------- */
    if (p === '/auth/login' && req.method === 'POST') {
      const b = await readBody(req);
      if (sha(String(b.password || '')) !== db.settings.auth.passHash) {
        await new Promise(r => setTimeout(r, 600)); // тормоз перебору
        return json(res, 401, { error: 'wrong password' });
      }
      const sid = crypto.randomBytes(16).toString('hex');
      db.settings.auth.sessions[sid] = { at: Date.now() };
      const keys = Object.keys(db.settings.auth.sessions);
      if (keys.length > 20) delete db.settings.auth.sessions[keys[0]];
      store.save();
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `lumen_sid=${sid}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`,
      });
      res.end(JSON.stringify({ ok: true })); return;
    }
    if (p === '/auth/logout' && req.method === 'POST') {
      const sid = getSession(req);
      if (sid) { delete db.settings.auth.sessions[sid]; store.save(); }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'lumen_sid=; Path=/; Max-Age=0' });
      res.end(JSON.stringify({ ok: true })); return;
    }
    if (p === '/auth/password' && req.method === 'POST') {
      if (!getSession(req)) return json(res, 401, { error: 'auth' });
      const b = await readBody(req);
      if (sha(String(b.current || '')) !== db.settings.auth.passHash) return json(res, 400, { error: 'текущий пароль неверен' });
      if (String(b.next || '').length < 8) return json(res, 400, { error: 'новый пароль короче 8 символов' });
      db.settings.auth.passHash = sha(String(b.next));
      db.settings.auth.sessions = { [getSession(req)]: { at: Date.now() } }; // остальные сессии — в сброс
      store.save();
      return json(res, 200, { ok: true });
    }

    /* ---------------- API (всё под сессией) ---------------- */
    if (p.startsWith('/api/') && !getSession(req)) return json(res, 401, { error: 'auth required' });

    if (p === '/api/state' && req.method === 'GET') {
      json(res, 200, {
        settings: publicSettings(db), brokers: db.brokers, numbers: db.numbers,
        templates: db.templates, sequences: db.sequences,
        events: db.events.slice(0, 40), analytics: analytics(db),
      }); return;
    }

    if (p === '/api/leads' && req.method === 'GET') {
      let list = db.leads.map(l => leadView(db, l));
      const stage = u.searchParams.get('stage'), geo = u.searchParams.get('geo'), q = (u.searchParams.get('q') || '').toLowerCase();
      if (stage) list = list.filter(l => l.stage === stage);
      if (geo) list = list.filter(l => l.geo === geo);
      if (q) list = list.filter(l => l.name.toLowerCase().includes(q) || l.phone.includes(q));
      list.sort((a, b) => (b.lastMsgAt || b.createdAt) - (a.lastMsgAt || a.createdAt));
      json(res, 200, list); return;
    }

    if (p === '/api/leads' && req.method === 'POST') {
      const b = await readBody(req);
      const lead = {
        id: store.nextId('ld'), name: b.name || 'Без имени', phone: b.phone || '', geo: b.geo || db.settings.agency.geos[0],
        lang: b.lang || 'ru', tz: b.tz ?? 4, stage: 'new', score: 0, source: b.source || 'manual',
        createdAt: Date.now(), lastMsgAt: null, lastDir: null,
        quals: { purpose: null, timeline: null, budget: null, type: null },
        ai: { enabled: true, chainStep: 0, nextTouchAt: Date.now() + 15e3, silentSince: null },
        broker: null, summary: null, tags: [], numberId: null,
      };
      db.leads.push(lead);
      ai.pushEvent(db, { type: 'lead_new', leadId: lead.id, text: `Новый лид: ${lead.name} · ${db.settings.geoNames[lead.geo]}` });
      store.save();
      json(res, 200, leadView(db, lead)); return;
    }

    let m;
    if ((m = p.match(/^\/api\/leads\/([^/]+)$/))) {
      const lead = db.leads.find(l => l.id === m[1]);
      if (!lead) return json(res, 404, { error: 'not found' });
      if (req.method === 'GET') {
        const msgs = db.messages.filter(x => x.leadId === lead.id).sort((a, b) => a.at - b.at);
        return json(res, 200, Object.assign(leadView(db, lead), { messages: msgs }));
      }
      if (req.method === 'PATCH') {
        const b = await readBody(req);
        if (b.stage) lead.stage = b.stage;
        if (b.broker !== undefined) lead.broker = b.broker;
        if (b.ai) Object.assign(lead.ai, b.ai);
        if (b.name) lead.name = b.name;
        store.save();
        return json(res, 200, leadView(db, lead));
      }
    }

    if ((m = p.match(/^\/api\/leads\/([^/]+)\/(message|inbound|handover|analyze)$/)) && req.method === 'POST') {
      const lead = db.leads.find(l => l.id === m[1]);
      if (!lead) return json(res, 404, { error: 'not found' });
      const b = await readBody(req);
      if (m[2] === 'message') { engine.send(db, lead, b.text || '', 'human'); lead.ai.enabled = b.keepAi !== false ? lead.ai.enabled : false; }
      if (m[2] === 'inbound') engine.inbound(db, lead, b.text || '', { simulated: true });
      if (m[2] === 'handover') engine.handover(db, lead, b.brokerId);
      if (m[2] === 'analyze') { ai.screen(db, lead); if (lead.stage === 'qualified') lead.summary = ai.buildSummary(db, lead); }
      store.save();
      const msgs = db.messages.filter(x => x.leadId === lead.id).sort((a, b) => a.at - b.at);
      return json(res, 200, Object.assign(leadView(db, lead), { messages: msgs }));
    }

    if (p === '/api/wake/preview' && req.method === 'GET') {
      const filters = { geo: u.searchParams.get('geo') || null, stages: (u.searchParams.get('stages') || 'sleeping').split(','), olderDays: +(u.searchParams.get('olderDays') || 0) };
      return json(res, 200, engine.wakePreview(db, filters));
    }

    if (p === '/api/campaigns' && req.method === 'GET') return json(res, 200, db.campaigns);
    if (p === '/api/campaigns' && req.method === 'POST') {
      const b = await readBody(req);
      const cmp = {
        id: store.nextId('cmp'), name: b.name || 'Кампания', state: 'draft',
        filters: b.filters || { stages: ['sleeping'] }, batchSize: b.batchSize || 3,
        pauseMin: b.pauseMin || [20, 60], window: b.window || [10, 20],
        templateId: b.templateId || 'tpl_wake_ru', text: b.text || '',
        stats: { sent: 0, delivered: 0, replied: 0, qualified: 0, skipped: 0 },
        recipients: [], cursor: 0, log: [], createdAt: Date.now(), nextBatchAt: null,
      };
      db.campaigns.unshift(cmp); store.save();
      return json(res, 200, cmp);
    }
    if ((m = p.match(/^\/api\/campaigns\/([^/]+)\/(start|pause|resume|stop)$/)) && req.method === 'POST') {
      const cmp = db.campaigns.find(c => c.id === m[1]);
      if (!cmp) return json(res, 404, { error: 'not found' });
      if (m[2] === 'start') engine.startCampaign(db, cmp);
      if (m[2] === 'pause') { cmp.state = 'paused'; cmp.log.unshift({ at: Date.now(), text: 'Пауза' }); }
      if (m[2] === 'resume') { cmp.state = 'running'; cmp.nextBatchAt = Date.now() + 2000; cmp.log.unshift({ at: Date.now(), text: 'Продолжение' }); }
      if (m[2] === 'stop') { cmp.state = 'done'; cmp.log.unshift({ at: Date.now(), text: 'Остановлена вручную' }); }
      store.save();
      return json(res, 200, cmp);
    }

    if ((m = p.match(/^\/api\/numbers\/([^/]+)$/)) && req.method === 'PATCH') {
      const num = db.numbers.find(n => n.id === m[1]);
      if (!num) return json(res, 404, { error: 'not found' });
      const b = await readBody(req);
      if (b.state) {
        num.state = b.state;
        if (b.state === 'warming') num.warmupDay = 1;
        ai.pushEvent(db, { type: 'number', text: `Номер ${num.phone}: ${b.state === 'quarantine' ? 'в карантин' : b.state === 'active' ? 'активирован' : 'на прогрев'}` });
      }
      if (b.dayLimit != null) num.dayLimit = +b.dayLimit;
      store.save();
      return json(res, 200, num);
    }

    if ((m = p.match(/^\/api\/sequences\/([^/]+)$/)) && req.method === 'PATCH') {
      const seq = db.sequences.find(s => s.id === m[1]);
      if (!seq) return json(res, 404, { error: 'not found' });
      const b = await readBody(req);
      if (b.steps) seq.steps = b.steps;
      if (b.active != null) seq.active = b.active;
      store.save();
      return json(res, 200, seq);
    }

    if (p === '/api/templates' && req.method === 'POST') {
      const b = await readBody(req);
      const tpl = { id: store.nextId('tpl'), name: b.name || 'Шаблон', category: b.category || 'utility', lang: b.lang || 'ru', status: 'pending', body: b.body || '' };
      db.templates.push(tpl); store.save();
      return json(res, 200, tpl);
    }
    if ((m = p.match(/^\/api\/templates\/([^/]+)$/)) && req.method === 'PATCH') {
      const tpl = db.templates.find(t => t.id === m[1]);
      if (!tpl) return json(res, 404, { error: 'not found' });
      Object.assign(tpl, await readBody(req)); store.save();
      return json(res, 200, tpl);
    }

    if (p === '/api/settings' && req.method === 'PATCH') {
      const b = await readBody(req);
      for (const k of ['agency', 'wa', 'ai', 'demo']) if (b[k]) Object.assign(db.settings[k], b[k]);
      if (b.wa && b.wa.tokenSet === false) delete db.settings.wa.token; // явное отключение
      if (b.criteria) for (const g of Object.keys(b.criteria)) Object.assign(db.settings.criteria[g] = db.settings.criteria[g] || {}, b.criteria[g]);
      if (b.stopWords) db.settings.stopWords = b.stopWords;
      store.save();
      return json(res, 200, publicSettings(db));
    }

    /* ---------------- встречи ---------------- */
    if (p === '/api/meetings' && req.method === 'GET') {
      const list = (db.meetings || []).map(mt => Object.assign({}, mt, {
        leadName: (db.leads.find(l => l.id === mt.leadId) || {}).name || '—',
        brokerName: (db.brokers.find(x => x.id === mt.brokerId) || {}).name || '—',
      })).sort((a, b2) => a.at - b2.at);
      return json(res, 200, list);
    }
    if (p === '/api/meetings' && req.method === 'POST') {
      const b = await readBody(req);
      const lead = db.leads.find(l => l.id === b.leadId);
      if (!lead) return json(res, 400, { error: 'lead not found' });
      const broker = db.brokers.find(x => x.id === (b.brokerId || lead.broker)) || db.brokers.find(x => x.geo === lead.geo) || db.brokers[0];
      const mt = {
        id: store.nextId('mt'), leadId: lead.id, brokerId: broker.id,
        at: +b.at || Date.now() + 24 * 3600e3, kind: b.kind || 'call',
        note: b.note || '', status: 'scheduled', createdAt: Date.now(),
      };
      db.meetings = db.meetings || [];
      db.meetings.push(mt);
      if (b.confirm !== false) {
        const kindRu = { call: 'созвон', video: 'видео-показ', tour: 'показ объекта' }[mt.kind] || 'встреча';
        const when = new Date(mt.at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
        engine.send(db, lead, `${lead.name.split(' ')[0]}, подтверждаю: ${kindRu} с ${broker.name} — ${when}. Если время перестанет подходить, просто напишите сюда, перенесём.`, 'ai');
      }
      ai.pushEvent(db, { type: 'meeting', leadId: lead.id, text: `Встреча: ${lead.name} + ${broker.name} · ${new Date(mt.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` });
      store.save();
      return json(res, 200, mt);
    }
    if ((m = p.match(/^\/api\/meetings\/([^/]+)$/)) && req.method === 'PATCH') {
      const mt = (db.meetings || []).find(x => x.id === m[1]);
      if (!mt) return json(res, 404, { error: 'not found' });
      const b = await readBody(req);
      if (b.status) mt.status = b.status;
      if (b.at) mt.at = +b.at;
      store.save();
      return json(res, 200, mt);
    }

    /* ---------------- дубли ---------------- */
    if (p === '/api/duplicates' && req.method === 'GET') {
      const norm = (ph) => (ph || '').replace(/\D/g, '').replace(/^8(\d{10})$/, '7$1');
      const byPhone = {};
      for (const l of db.leads) {
        const k = norm(l.phone);
        if (!k) continue;
        (byPhone[k] = byPhone[k] || []).push(l);
      }
      const groups = Object.values(byPhone).filter(g => g.length > 1)
        .map(g => g.sort((a, b2) => a.createdAt - b2.createdAt).map(l => leadView(db, l)));
      return json(res, 200, groups);
    }
    if (p === '/api/duplicates/merge' && req.method === 'POST') {
      const b = await readBody(req); // {keepId, mergeIds:[]}
      const keep = db.leads.find(l => l.id === b.keepId);
      if (!keep) return json(res, 400, { error: 'keep not found' });
      let moved = 0;
      for (const id of b.mergeIds || []) {
        const dup = db.leads.find(l => l.id === id);
        if (!dup || dup.id === keep.id) continue;
        for (const msg of db.messages) if (msg.leadId === dup.id) { msg.leadId = keep.id; moved++; }
        for (const a of ai.AXES) if (!keep.quals[a] && dup.quals[a]) keep.quals[a] = dup.quals[a];
        keep.tags = [...new Set([...(keep.tags || []), ...(dup.tags || []), 'объединён'])];
        if ((dup.lastMsgAt || 0) > (keep.lastMsgAt || 0)) { keep.lastMsgAt = dup.lastMsgAt; keep.lastDir = dup.lastDir; }
        db.leads = db.leads.filter(l => l.id !== dup.id);
      }
      ai.screen(db, keep);
      ai.pushEvent(db, { type: 'merge', leadId: keep.id, text: `Дубли объединены в «${keep.name}» (перенесено сообщений: ${moved})` });
      store.save();
      return json(res, 200, leadView(db, keep));
    }

    if (p === '/api/events' && req.method === 'GET') return json(res, 200, db.events.slice(0, 60));
    if (p === '/api/analytics' && req.method === 'GET') return json(res, 200, analytics(db));
    if (p === '/api/demo/reset' && req.method === 'POST') { store.reset(seed); return json(res, 200, { ok: true }); }

    if (p.startsWith('/api/')) return json(res, 404, { error: 'unknown endpoint' });

    /* ---------------- статика ---------------- */
    let file = p === '/' ? '/index.html' : p;
    file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
    const full = path.join(PUBLIC, file);
    if (!full.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
    fs.readFile(full, (err, buf) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
      res.end(buf);
    });
  } catch (e) {
    console.error('[server]', e);
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => console.log(`Lumen CRM → http://localhost:${PORT}`));
