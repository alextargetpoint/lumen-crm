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
const playbook = require('./playbook');

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
  /* миграция: мост лидов + база рекламных объявлений */
  if (!db.settings.hooks) db.settings.hooks = { secret: crypto.randomBytes(10).toString('hex'), outboundUrl: '' };
  if (!db.ads) db.ads = [
    { adId: '120211478921230508', name: 'Дубай · Мортгейдж 0% · видео-тур JVC', adsetName: 'RU 30-55 инвесторы', campaignName: 'DXB Lead Forms Сентябрь', geo: 'dubai' },
    { adId: '120211478921230742', name: 'Дубай · Marina от $180k · карусель', adsetName: 'RU широкая', campaignName: 'DXB Lead Forms Сентябрь', geo: 'dubai' },
    { adId: '120209934110255019', name: 'Бали · виллы под сдачу · рилс', adsetName: 'RU номады', campaignName: 'Bali CTWA Август', geo: 'bali' },
  ];
  if (!db.intakeLog) db.intakeLog = [];
  for (const l of db.leads) { if (!l.notes) l.notes = []; if (!l.contacts) l.contacts = []; }
  /* правила авто-отключения ИИ (перехват человеком) */
  if (!db.settings.ai.autoOff) db.settings.ai.autoOff = { onHumanReply: true, onHumanRequest: true, onEscalation: true };
  /* автоматизации агентства */
  if (!db.settings.automations) db.settings.automations = {
    assignMode: 'load',        // load | roundrobin | shift
    autoHandover: false,       // 4/4 закрыто → авто-передача брокеру
    meetingReminderHrs: 3,     // напоминание клиенту за N часов (0 = выкл)
    noShowMessage: true,       // «не пришёл» → мягкое сообщение + вернуть ИИ
    rrCursor: 0,
  };
  if (!db.settings.customFields) db.settings.customFields = [];
  if (!db.settings.portals) db.settings.portals = {
    property_finder: { name: 'Property Finder', key: '', status: 'off' },
    bayut: { name: 'Bayut / Dubizzle', key: '', status: 'off' },
    dld: { name: 'DLD (Dubai Land Department)', key: '', status: 'off' },
    property_monitor: { name: 'Property Monitor', key: '', status: 'off' },
    reidin: { name: 'REIDIN', key: '', status: 'off' },
  };
  if (!db.properties) db.properties = [
    { id: 'pr_jvc1', name: 'Binghatti Amber', area: 'JVC', developer: 'Binghatti', market: 'offplan', type: '1BR', beds: 1, priceFrom: 190000, currency: 'USD', handover: 'Q2 2027', payment: '70/30, 1%/мес', geo: 'dubai', tags: ['рассрочка', 'высокий ROI'], materials: [{ label: 'Брошюра', url: 'https://example.com/brochure.pdf' }], note: 'Флагман JVC, аренда 7-8%' },
    { id: 'pr_mar1', name: 'Marina Shores', area: 'Dubai Marina', developer: 'Emaar', market: 'offplan', type: '1-2BR', beds: 2, priceFrom: 380000, currency: 'USD', handover: 'Q4 2026', payment: '60/40', geo: 'dubai', tags: ['вид на марину'], materials: [], note: '' },
    { id: 'pr_jvc2', name: 'Studio One JVC (вторичка)', area: 'JVC', developer: '—', market: 'secondary', type: 'Studio', beds: 0, priceFrom: 145000, currency: 'USD', handover: 'готово', payment: '100% / ипотека', geo: 'dubai', tags: ['готово', 'под сдачу'], materials: [], note: 'Арендатор внутри, 7.4% net' },
    { id: 'pr_dt1', name: 'Peninsula Four', area: 'Business Bay', developer: 'Select Group', market: 'secondary', type: '1BR', beds: 1, priceFrom: 310000, currency: 'USD', handover: 'готово', payment: '100% / ипотека', geo: 'dubai', tags: ['канал', 'готово'], materials: [], note: '' },
    { id: 'pr_jvt1', name: 'Red Square Tower', area: 'JVT', developer: 'Tiger', market: 'offplan', type: 'Studio-1BR', beds: 1, priceFrom: 160000, currency: 'USD', handover: 'Q1 2027', payment: '1%/мес до сдачи', geo: 'dubai', tags: ['рассрочка'], materials: [], note: '' },
    { id: 'pr_bali1', name: 'Nuanu Ecoverse Villas', area: 'Берава', developer: 'Nuanu', market: 'offplan', type: 'Villa 2BR', beds: 2, priceFrom: 250000, currency: 'USD', handover: 'Q3 2026', payment: '50/50', geo: 'bali', tags: ['вилла', 'управление'], materials: [], note: 'Лизхолд 30 лет' },
  ];
  if (!db.collections) db.collections = [];
  for (const pr of db.properties) { if (!pr.images) pr.images = []; if (!pr.layouts) pr.layouts = []; if (!pr.description) pr.description = ''; if (!pr.amenities) pr.amenities = []; if (!pr.units) pr.units = []; }
  if (!db.settings.agency.manager) db.settings.agency.manager = { name: 'Ваш менеджер', phone: '', email: '' };
  /* обогащение демо-объекта под эталонную структуру */
  {
    const bg = db.properties.find(x => x.id === 'pr_jvc1');
    if (bg && !bg.description) {}
    if (bg && !bg.amenities.length) {
      bg.description = 'Роскошный жилой комплекс от Binghatti в сердце JVC: подземный паркинг, ретейл на первом этаже, студии и апартаменты с 1-2 спальнями, панорамные виды на скайлайн Дубая. Развитая инфраструктура района: 30+ парков, школы, Circle Mall, 25 минут до Palm Jumeirah и Burj Khalifa.';
      bg.amenities = ['Бассейн', 'Фитнес-центр', 'Лобби', 'Паркинг', 'Зоны отдыха', 'Ретейл'];
      bg.units = [
        { plan: 'Studio', area: '38 м²', floor: '5', price: 203000, view: 'community' },
        { plan: '1BR', area: '68 м²', floor: '3', price: 291600, view: 'main road' },
        { plan: '1BR', area: '72 м²', floor: '11', price: 315000, view: 'skyline' },
      ];
    }
  }
  for (const b of db.brokers) if (!b.schedule) b.schedule = { days: [1, 2, 3, 4, 5, 6], from: '09:00', to: '20:00' };
  for (const l of db.leads) { if (!l.custom) l.custom = {}; if (!l.transcripts) l.transcripts = []; }
  store.save();
}

/* мэтчинг лида на объявление по ad_id из вебхука */
function matchAd(db, lead) {
  if (!lead.ads || !lead.ads.adId) return;
  const ad = db.ads.find(a => String(a.adId) === String(lead.ads.adId));
  if (ad) {
    lead.ads.adName = ad.name;
    lead.ads.adsetName = ad.adsetName;
    lead.ads.campaignName = ad.campaignName;
    lead.ads.matched = true;
    if (ad.geo && !lead.geoLocked) lead.geo = ad.geo;
  } else lead.ads.matched = false;
}

/* исходящий мост: квал/передача → POST наружу (Albato примет и разнесёт дальше) */
function notifyOutbound(db, lead, event) {
  const url = db.settings.hooks.outboundUrl;
  if (!url) return;
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event, at: Date.now(),
      lead: { id: lead.id, name: lead.name, phone: lead.phone, geo: lead.geo, stage: lead.stage, score: lead.score, quals: lead.quals, summary: lead.summary, ads: lead.ads || null, source: lead.source },
    }),
  }).catch(e => console.error('[outbound]', e.message));
}
engine.onQualified = (db, lead) => notifyOutbound(db, lead, 'lead.qualified');
engine.onHandover = (db, lead) => notifyOutbound(db, lead, 'lead.handover');

function getSession(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/lumen_sid=([a-f0-9]{32})/);
  if (!m) return null;
  return store.get().settings.auth.sessions[m[1]] ? m[1] : null;
}

function tunnelUrl() {
  try {
    const log = fs.readFileSync('/tmp/lumen-tunnel.log', 'utf8');
    const m2 = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
    return m2 ? m2[m2.length - 1] : null;
  } catch { return null; }
}

function publicSettings(db) {
  const s = JSON.parse(JSON.stringify(db.settings));
  delete s.auth;
  if (s.wa.token) { s.wa.tokenSet = true; delete s.wa.token; }
  s.ai.llmAvailable = llm.available();
  s.ai.llmModel = llm.MODEL;
  s.tunnelUrl = tunnelUrl();
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

/* подсказка «что делать дальше» — считается по фактам карточки */
function leadHint(db, l, axesFilled) {
  const now = Date.now();
  if (l.nextAction && l.nextAction.at && l.nextAction.at < now) return { kind: 'warn', text: `Просрочен следующий шаг: ${l.nextAction.text}` };
  if ((l.tags || []).includes('нужен человек')) return { kind: 'warn', text: 'ИИ отключился: клиент ждёт живого менеджера — ответьте вручную' };
  const noShow = (db.meetings || []).find(mt => mt.leadId === l.id && mt.status === 'no_show');
  if (noShow && !['deal', 'lost'].includes(l.stage)) return { kind: 'warn', text: 'Не пришёл на встречу — предложите новый слот, лид ещё тёплый' };
  const hotView = (db.collections || []).find(c => c.leadId === l.id && c.lastViewAt && now - c.lastViewAt < 24 * 3600e3);
  if (hotView && !['deal', 'lost'].includes(l.stage)) return { kind: 'act', text: `Смотрел подборку «${hotView.title}» ${Math.round((now - hotView.lastViewAt) / 60e3)} мин назад — идеальный момент для звонка` };
  if (l.stage === 'qualified') return { kind: 'act', text: 'Все 4 оси закрыты — передайте брокеру, пока лид горячий' };
  if (['handover', 'viewing'].includes(l.stage) && !(db.meetings || []).some(mt => mt.leadId === l.id && mt.status === 'scheduled')) return { kind: 'act', text: 'Встреча не назначена — предложите слот' };
  if (l.stage === 'dialog' && axesFilled < 4) return { kind: 'info', text: `ИИ выясняет оси: осталось ${4 - axesFilled} из 4` };
  if (['new', 'touch'].includes(l.stage) && l.ai.nextTouchAt) return { kind: 'info', text: `Молчит — цепочка коснётся ${new Date(l.ai.nextTouchAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` };
  if (l.stage === 'sleeping') return { kind: 'info', text: `Спит · скоринг реанимации ${engine.wakeScore(db, l)} — кандидат в кампанию` };
  return null;
}

function leadView(db, l) {
  let lastText = null;
  for (let i = db.messages.length - 1; i >= 0; i--) {
    if (db.messages[i].leadId === l.id) { lastText = db.messages[i].text; break; }
  }
  const axesFilled = ai.AXES.filter(a => l.quals[a]).length;
  return Object.assign({}, l, {
    brokerName: (db.brokers.find(b => b.id === l.broker) || {}).name || null,
    geoName: db.settings.geoNames[l.geo] || l.geo,
    axesFilled,
    wakeScore: l.stage === 'sleeping' ? engine.wakeScore(db, l) : null,
    lastText,
    hint: leadHint(db, l, axesFilled),
    playTip: (playbook.forContext(l, axesFilled)[0] || null),
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
    unread: leads.filter(l => l.lastDir === 'in' && l.stage !== 'lost').length,
    totalActive: leads.filter(l => !['lost'].includes(l.stage)).length,
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
            lead = { id: store.nextId('ld'), name: changes.contacts?.[0]?.profile?.name || phone, phone, geo: db.settings.agency.geos[0], lang: 'ru', tz: 4, stage: 'new', score: 0, source: 'wa_inbound', createdAt: Date.now(), lastMsgAt: null, lastDir: null, quals: { purpose: null, timeline: null, budget: null, type: null }, ai: { enabled: true, chainStep: 0, nextTouchAt: null, silentSince: null }, broker: null, summary: null, tags: ['входящий'], numberId: null, ads: null };
            /* CTWA: реферал несёт id объявления — атрибуция из коробки */
            const ref = wam.referral;
            if (ref && (ref.source_id || ref.ctwa_clid)) {
              lead.source = 'ctwa';
              lead.ads = { adId: ref.source_id || null, ctwaClid: ref.ctwa_clid || null, headline: ref.headline || null };
              matchAd(db, lead);
            }
            db.leads.push(lead);
            ai.pushEvent(db, { type: 'lead_new', leadId: lead.id, text: `Входящий WhatsApp: ${lead.name}${lead.ads && lead.ads.matched ? ' · ' + lead.ads.adName : ''}` });
          }
          engine.inbound(db, lead, wam.text.body);
        }
      } catch (e) { console.error('[webhook]', e); }
      json(res, 200, { ok: true }); return;
    }

    /* ---------------- мост приёма лидов (Albato / Make / любой интегратор) ---------------- */
    if (p === '/hooks/lead' && req.method === 'POST') {
      if (u.searchParams.get('key') !== db.settings.hooks.secret) return json(res, 403, { error: 'bad key' });
      const b = await readBody(req);
      /* гибкий маппинг полей — интеграторы шлют по-разному */
      const pick = (...keys) => { for (const k of keys) { if (b[k] != null && String(b[k]).trim()) return String(b[k]).trim(); } return null; };
      const name = pick('name', 'full_name', 'fullName', 'first_name', 'имя') || 'Без имени';
      const phone = pick('phone', 'phone_number', 'phoneNumber', 'tel', 'телефон');
      if (!phone) return json(res, 400, { error: 'phone required' });
      const adId = pick('ad_id', 'adId', 'ad', 'utm_content');
      const entry = { at: Date.now(), name, phone, adId, raw: Object.keys(b).slice(0, 20) };

      const norm = (ph) => ph.replace(/\D/g, '').replace(/^8(\d{10})$/, '7$1');
      let lead = db.leads.find(l => norm(l.phone) === norm(phone));
      if (lead) {
        entry.result = 'repeat';
        lead.tags = [...new Set([...(lead.tags || []), 'повторная заявка'])];
        if (adId && !(lead.ads && lead.ads.adId)) { lead.ads = { adId, adsetId: pick('adset_id'), campaignId: pick('campaign_id') }; matchAd(db, lead); }
        ai.pushEvent(db, { type: 'lead_new', leadId: lead.id, text: `Повторная заявка: ${lead.name} — дубль не создан, карточка обогащена` });
      } else {
        lead = {
          id: store.nextId('ld'), name, phone,
          geo: pick('geo', 'direction') || db.settings.agency.geos[0],
          lang: pick('lang', 'language') || 'ru', tz: 4, stage: 'new', score: 0,
          source: pick('source', 'src') || 'meta_form',
          createdAt: Date.now(), lastMsgAt: null, lastDir: null,
          quals: { purpose: null, timeline: null, budget: null, type: null },
          ai: { enabled: true, chainStep: 0, nextTouchAt: Date.now() + 15e3, silentSince: null },
          broker: null, summary: null, tags: ['интегратор'], numberId: null,
          ads: adId ? { adId, adsetId: pick('adset_id', 'adsetId'), campaignId: pick('campaign_id', 'campaignId'), formName: pick('form_name', 'form') } : null,
        };
        matchAd(db, lead);
        db.leads.push(lead);
        entry.result = 'created';
        entry.leadId = lead.id;
        const adTxt = lead.ads && lead.ads.matched ? ` · объявление: ${lead.ads.adName}` : (adId ? ' · объявление не в базе' : '');
        ai.pushEvent(db, { type: 'lead_new', leadId: lead.id, text: `Лид из интегратора: ${lead.name} · ${db.settings.geoNames[lead.geo] || lead.geo}${adTxt}` });
      }
      db.intakeLog.unshift(entry);
      if (db.intakeLog.length > 200) db.intakeLog.length = 200;
      store.save();
      return json(res, 200, { ok: true, leadId: lead.id, result: entry.result, adMatched: !!(lead.ads && lead.ads.matched) });
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
        return json(res, 200, Object.assign(leadView(db, lead), {
          messages: msgs,
          events: db.events.filter(e => e.leadId === lead.id).slice(0, 60),
          meetings: (db.meetings || []).filter(mt => mt.leadId === lead.id).map(mt => Object.assign({}, mt, { brokerName: (db.brokers.find(x => x.id === mt.brokerId) || {}).name || '—' })),
        }));
      }
      if (req.method === 'PATCH') {
        const b = await readBody(req);
        if (b.stage) lead.stage = b.stage;
        if (b.broker !== undefined) lead.broker = b.broker || null;
        if (b.geo) lead.geo = b.geo;
        if (b.ai) {
          if (b.ai.enabled === true) lead.tags = (lead.tags || []).filter(t => t !== 'нужен человек');
          Object.assign(lead.ai, b.ai);
        }
        if (b.name) lead.name = b.name;
        if (b.custom) { lead.custom = lead.custom || {}; Object.assign(lead.custom, b.custom); }
        if (b.nextAction !== undefined) lead.nextAction = b.nextAction && b.nextAction.text ? { text: String(b.nextAction.text).slice(0, 200), at: +b.nextAction.at || null } : null;
        store.save();
        return json(res, 200, leadView(db, lead));
      }
    }

    /* транскрибация звонка: raw-аудио в теле (до 24МБ), ?label=&filename= */
    if ((m = p.match(/^\/api\/leads\/([^/]+)\/transcribe$/)) && req.method === 'POST') {
      const lead = db.leads.find(l => l.id === m[1]);
      if (!lead) return json(res, 404, { error: 'not found' });
      const chunks = [];
      let size = 0, over = false;
      await new Promise((resolve) => {
        req.on('data', (c) => { size += c.length; if (size > 24e6) { over = true; req.destroy(); resolve(); } else chunks.push(c); });
        req.on('end', resolve);
        req.on('close', resolve);
      });
      if (over) return json(res, 400, { error: 'файл больше 24 МБ — обрежьте запись' });
      if (!size) return json(res, 400, { error: 'пустой файл' });
      try {
        const text = await llm.transcribe(Buffer.concat(chunks), u.searchParams.get('filename') || 'call.m4a');
        const t = { id: store.nextId('tr'), at: Date.now(), label: (u.searchParams.get('label') || 'Звонок').slice(0, 60), text: text.slice(0, 20000) };
        lead.transcripts = lead.transcripts || [];
        lead.transcripts.push(t);
        ai.pushEvent(db, { type: 'call', leadId: lead.id, text: `Транскрипт добавлен: ${lead.name} · ${t.label} (${Math.round(text.length / 1000)}k символов)` });
        store.save();
        return json(res, 200, t);
      } catch (e) {
        return json(res, 500, { error: e.message });
      }
    }

    if ((m = p.match(/^\/api\/leads\/([^/]+)\/summary$/)) && req.method === 'POST') {
      const lead = db.leads.find(l => l.id === m[1]);
      if (!lead) return json(res, 404, { error: 'not found' });
      let text = null;
      if (llm.available()) { try { text = await llm.summarize(db, lead); } catch (e) { console.error('[summary]', e.message); } }
      lead.summary = text || ai.buildSummary(db, lead);
      lead.summaryAt = Date.now();
      store.save();
      return json(res, 200, { summary: lead.summary, summaryAt: lead.summaryAt, viaLlm: !!text });
    }

    if ((m = p.match(/^\/api\/leads\/([^/]+)\/(note|contacts)$/)) && req.method === 'POST') {
      const lead = db.leads.find(l => l.id === m[1]);
      if (!lead) return json(res, 404, { error: 'not found' });
      const b = await readBody(req);
      if (m[2] === 'note') {
        const text = String(b.text || '').trim();
        if (text) {
          lead.notes = lead.notes || [];
          lead.notes.unshift({ id: store.nextId('nt'), at: Date.now(), text: text.slice(0, 2000) });
        }
      }
      if (m[2] === 'contacts') lead.contacts = (b.contacts || []).slice(0, 20).map(c => ({ kind: String(c.kind || 'other').slice(0, 20), value: String(c.value || '').slice(0, 200) })).filter(c => c.value);
      store.save();
      return json(res, 200, { notes: lead.notes, contacts: lead.contacts });
    }

    if ((m = p.match(/^\/api\/leads\/([^/]+)\/(message|inbound|handover|analyze)$/)) && req.method === 'POST') {
      const lead = db.leads.find(l => l.id === m[1]);
      if (!lead) return json(res, 404, { error: 'not found' });
      const b = await readBody(req);
      if (m[2] === 'message') {
        engine.send(db, lead, b.text || '', 'human');
        /* менеджер подхватил — ИИ на паузу (правило autoOff.onHumanReply) */
        if (db.settings.ai.autoOff.onHumanReply && lead.ai.enabled) {
          lead.ai.enabled = false;
          ai.pushEvent(db, { type: 'ai_off', leadId: lead.id, text: `${lead.name}: менеджер подхватил диалог — автопилот на паузе` });
        }
      }
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

    if (p === '/api/brokers' && req.method === 'POST') {
      const b = await readBody(req);
      const name = String(b.name || '').trim() || 'Новый брокер';
      const br = {
        id: store.nextId('br'), name, geo: b.geo || db.settings.agency.geos[0],
        langs: (b.langs || ['ru']).slice(0, 6), load: 0, capacity: +b.capacity || 20, deals90: 0,
        avatar: name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase(),
        schedule: { days: [1, 2, 3, 4, 5, 6], from: '09:00', to: '20:00' },
      };
      db.brokers.push(br); store.save();
      return json(res, 200, br);
    }
    if ((m = p.match(/^\/api\/brokers\/([^/]+)$/)) && req.method === 'DELETE') {
      if (db.brokers.length <= 1) return json(res, 400, { error: 'нельзя удалить последнего брокера' });
      for (const l of db.leads) if (l.broker === m[1]) l.broker = null;
      for (const mt of db.meetings || []) if (mt.brokerId === m[1]) mt.brokerId = db.brokers.find(x => x.id !== m[1]).id;
      db.brokers = db.brokers.filter(x => x.id !== m[1]);
      store.save();
      return json(res, 200, { ok: true });
    }
    if ((m = p.match(/^\/api\/brokers\/([^/]+)$/)) && req.method === 'PATCH') {
      const br = db.brokers.find(x => x.id === m[1]);
      if (!br) return json(res, 404, { error: 'not found' });
      const b = await readBody(req);
      if (b.name) { br.name = String(b.name).slice(0, 60); br.avatar = br.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase(); }
      if (b.geo) br.geo = b.geo;
      if (b.langs) br.langs = b.langs.slice(0, 6);
      if (b.schedule) br.schedule = { days: (b.schedule.days || []).map(Number).filter(d => d >= 1 && d <= 7), from: String(b.schedule.from || '09:00'), to: String(b.schedule.to || '20:00') };
      if (b.capacity != null) br.capacity = +b.capacity;
      store.save();
      return json(res, 200, br);
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
      for (const k of ['agency', 'wa', 'ai', 'demo', 'automations']) if (b[k]) Object.assign(db.settings[k], b[k]);
      if (b.customFields) db.settings.customFields = b.customFields.slice(0, 20).map(f => ({ key: String(f.key || '').slice(0, 40), label: String(f.label || '').slice(0, 60), type: f.type === 'select' ? 'select' : 'text', options: (f.options || []).slice(0, 20).map(String) })).filter(f => f.key && f.label);
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
        /* видео-встреча: своя комната из коробки (Jitsi, работает в браузере без аккаунтов);
           Zoom API подключается сюда же при наличии кредов */
        link: b.link || (b.kind === 'video' ? `https://meet.jit.si/Lumen-${crypto.randomBytes(4).toString('hex')}-${lead.id.slice(-4)}` : null),
      };
      db.meetings = db.meetings || [];
      db.meetings.push(mt);
      if (b.confirm !== false) {
        const kindRu = { call: 'созвон', video: 'видео-показ', tour: 'показ объекта' }[mt.kind] || 'встреча';
        const when = new Date(mt.at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
        engine.send(db, lead, `${lead.name.split(' ')[0]}, подтверждаю: ${kindRu} с ${broker.name} — ${when}.${mt.link ? ` Ссылка на видеовстречу: ${mt.link}` : ''} Если время перестанет подходить, просто напишите сюда, перенесём.`, 'ai');
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
      if (b.at) { mt.at = +b.at; mt.reminded = false; }
      if (b.status === 'no_show' && db.settings.automations.noShowMessage) {
        const lead = db.leads.find(l => l.id === mt.leadId);
        if (lead && !['deal', 'lost'].includes(lead.stage)) {
          lead.ai.enabled = true;
          engine.send(db, lead, `${lead.name.split(' ')[0]}, не получилось созвониться — ничего страшного. Предложить пару новых слотов или удобнее написать сюда, когда будете готовы?`, 'ai');
          ai.pushEvent(db, { type: 'meeting', leadId: lead.id, text: `${lead.name}: не пришёл на встречу — ИИ мягко возвращает в диалог` });
        }
      }
      store.save();
      return json(res, 200, mt);
    }

    /* ---------------- реклама: база объявлений + мэтчинг ---------------- */
    if (p === '/api/ads' && req.method === 'GET') {
      const stats = db.ads.map(ad => {
        const mine = db.leads.filter(l => l.ads && String(l.ads.adId) === String(ad.adId));
        return Object.assign({}, ad, {
          leads: mine.length,
          qualified: mine.filter(l => ['qualified', 'handover', 'viewing', 'deal'].includes(l.stage)).length,
          deals: mine.filter(l => l.stage === 'deal').length,
        });
      });
      const unmatched = db.leads.filter(l => l.ads && l.ads.adId && !l.ads.matched)
        .map(l => ({ leadId: l.id, name: l.name, adId: l.ads.adId }));
      return json(res, 200, { ads: stats, unmatched, intakeLog: db.intakeLog.slice(0, 30), hooks: { secret: db.settings.hooks.secret, outboundUrl: db.settings.hooks.outboundUrl } });
    }
    if (p === '/api/ads/import' && req.method === 'POST') {
      const b = await readBody(req);
      /* принимаем rows: [{adId,name,adsetName,campaignName,geo}] ИЛИ csv-текст */
      let rows = b.rows || [];
      if (!rows.length && b.csv) {
        const lines = b.csv.split('\n').map(x => x.trim()).filter(Boolean);
        const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
        const head = lines[0].toLowerCase().split(sep).map(h => h.trim());
        const col = (names) => head.findIndex(h => names.some(n => h.includes(n)));
        const ci = { adId: col(['ad_id', 'adid', 'id объявления', 'ад id']), name: col(['name', 'объявлени', 'ad name']), adset: col(['adset', 'группа']), camp: col(['campaign', 'кампани']), geo: col(['geo', 'гео', 'направлени']) };
        for (const line of lines.slice(1)) {
          const c = line.split(sep).map(x => x.trim().replace(/^"|"$/g, ''));
          if (ci.adId < 0 || !c[ci.adId]) continue;
          rows.push({ adId: c[ci.adId], name: ci.name >= 0 ? c[ci.name] : '', adsetName: ci.adset >= 0 ? c[ci.adset] : '', campaignName: ci.camp >= 0 ? c[ci.camp] : '', geo: ci.geo >= 0 ? (c[ci.geo] || '').toLowerCase() : '' });
        }
      }
      let added = 0, updated = 0;
      for (const r of rows) {
        if (!r.adId) continue;
        const ex = db.ads.find(a => String(a.adId) === String(r.adId));
        if (ex) { Object.assign(ex, { name: r.name || ex.name, adsetName: r.adsetName || ex.adsetName, campaignName: r.campaignName || ex.campaignName, geo: r.geo || ex.geo }); updated++; }
        else { db.ads.push({ adId: String(r.adId), name: r.name || 'Объявление ' + r.adId, adsetName: r.adsetName || '', campaignName: r.campaignName || '', geo: r.geo || '' }); added++; }
      }
      /* ре-мэтчинг всех лидов с атрибуцией */
      let rematched = 0;
      for (const l of db.leads) {
        if (l.ads && l.ads.adId) { const was = l.ads.matched; matchAd(db, l); if (!was && l.ads.matched) rematched++; }
      }
      ai.pushEvent(db, { type: 'merge', text: `База объявлений: +${added} новых, ${updated} обновлено, домэтчено лидов: ${rematched}` });
      store.save();
      return json(res, 200, { added, updated, rematched, total: db.ads.length });
    }
    if ((m = p.match(/^\/api\/ads\/([^/]+)$/)) && req.method === 'DELETE') {
      db.ads = db.ads.filter(a => String(a.adId) !== m[1]);
      store.save();
      return json(res, 200, { ok: true });
    }
    if (p === '/api/hooks' && req.method === 'PATCH') {
      const b = await readBody(req);
      if (b.outboundUrl !== undefined) db.settings.hooks.outboundUrl = String(b.outboundUrl).trim();
      if (b.rotateSecret) db.settings.hooks.secret = crypto.randomBytes(10).toString('hex');
      store.save();
      return json(res, 200, { secret: db.settings.hooks.secret, outboundUrl: db.settings.hooks.outboundUrl });
    }

    /* ---------------- объекты (библиотека) ---------------- */
    if (p === '/api/properties' && req.method === 'GET') return json(res, 200, db.properties);
    if (p === '/api/properties' && req.method === 'POST') {
      const b = await readBody(req);
      const pr = { id: store.nextId('pr'), name: b.name || 'Объект', area: b.area || '', developer: b.developer || '', market: b.market === 'secondary' ? 'secondary' : 'offplan', type: b.type || '', beds: +b.beds || 0, priceFrom: +b.priceFrom || 0, currency: b.currency || 'USD', handover: b.handover || '', payment: b.payment || '', geo: b.geo || 'dubai', tags: b.tags || [], materials: [], note: b.note || '' };
      db.properties.push(pr); store.save();
      return json(res, 200, pr);
    }
    if ((m = p.match(/^\/api\/properties\/([^/]+)$/))) {
      const pr = db.properties.find(x => x.id === m[1]);
      if (!pr) return json(res, 404, { error: 'not found' });
      if (req.method === 'PATCH') {
        const b = await readBody(req);
        for (const k of ['name', 'area', 'developer', 'market', 'type', 'handover', 'payment', 'geo', 'note', 'currency']) if (b[k] !== undefined) pr[k] = b[k];
        for (const k of ['beds', 'priceFrom']) if (b[k] !== undefined) pr[k] = +b[k];
        if (b.tags) pr.tags = b.tags;
        if (b.materials) pr.materials = b.materials.slice(0, 20).map(x => ({ label: String(x.label || '').slice(0, 60), url: String(x.url || '').slice(0, 500) })).filter(x => x.url);
        if (b.images) pr.images = b.images.slice(0, 20).map(String);
        if (b.description !== undefined) pr.description = String(b.description).slice(0, 3000);
        if (b.amenities) pr.amenities = b.amenities.slice(0, 30).map(x => String(x).slice(0, 40));
        if (b.units) pr.units = b.units.slice(0, 40).map(u => ({ plan: String(u.plan || '').slice(0, 30), area: String(u.area || '').slice(0, 20), floor: String(u.floor || '').slice(0, 15), price: +u.price || 0, view: String(u.view || '').slice(0, 40) }));
        if (b.layouts) pr.layouts = b.layouts.slice(0, 20).map(x => ({ label: String(x.label || '').slice(0, 60), url: String(x.url || '').slice(0, 500) })).filter(x => x.url);
        store.save();
        return json(res, 200, pr);
      }
      if (req.method === 'DELETE') { db.properties = db.properties.filter(x => x.id !== pr.id); store.save(); return json(res, 200, { ok: true }); }
    }
    /* подсказка объектов под лида: гео + бюджет ±30% + тип */
    if ((m = p.match(/^\/api\/leads\/([^/]+)\/suggest-properties$/)) && req.method === 'GET') {
      const lead = db.leads.find(l => l.id === m[1]);
      if (!lead) return json(res, 404, { error: 'not found' });
      const budget = (lead.quals.budget || {}).num || null;
      const typeStr = ((lead.quals.type || {}).value || '').toLowerCase();
      const list = db.properties
        .filter(pr => pr.geo === lead.geo)
        .map(pr => {
          let score = 0;
          if (budget && pr.priceFrom) { const r = pr.priceFrom / budget; if (r >= 0.7 && r <= 1.3) score += 2; else if (r < 0.7) score += 1; }
          if (typeStr && (typeStr.includes('вилл') ? /villa|вилл/i.test(pr.type + pr.name) : typeStr.includes('студи') ? /studio/i.test(pr.type) : /br/i.test(pr.type))) score += 1;
          return { pr, score };
        })
        .sort((a, b) => b.score - a.score)
        .map(x => Object.assign({ matchScore: x.score }, x.pr));
      return json(res, 200, list);
    }

    /* ---------------- подборки ---------------- */
    if (p === '/api/collections' && req.method === 'GET') {
      return json(res, 200, db.collections.map(c => Object.assign({}, c, { leadName: (db.leads.find(l => l.id === c.leadId) || {}).name || null })));
    }
    if (p === '/api/collections' && req.method === 'POST') {
      const b = await readBody(req);
      const c = { id: crypto.randomBytes(5).toString('hex'), leadId: b.leadId || null, title: b.title || 'Подборка', intro: String(b.intro || '').slice(0, 1500), propertyIds: (b.propertyIds || []).slice(0, 30), createdAt: Date.now(), views: 0 };
      db.collections.unshift(c); store.save();
      return json(res, 200, c);
    }
    if ((m = p.match(/^\/api\/collections\/([^/]+)\/send$/)) && req.method === 'POST') {
      const c = db.collections.find(x => x.id === m[1]);
      if (!c || !c.leadId) return json(res, 400, { error: 'нет лида' });
      const lead = db.leads.find(l => l.id === c.leadId);
      const url = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/p/${c.id}`;
      engine.send(db, lead, `${lead.name.split(' ')[0]}, собрал для вас подборку под ваш запрос — посмотрите: ${url} Внутри ${c.propertyIds.length} вариант(а) с ценами и условиями. Что откликается — обсудим.`, 'human');
      ai.pushEvent(db, { type: 'msg_in', leadId: lead.id, text: `Подборка «${c.title}» отправлена в чат: ${lead.name}` });
      store.save();
      return json(res, 200, { ok: true, url });
    }
    if ((m = p.match(/^\/api\/collections\/([^/]+)$/)) && req.method === 'DELETE') {
      db.collections = db.collections.filter(x => x.id !== m[1]); store.save();
      return json(res, 200, { ok: true });
    }
    if (p === '/api/portals' && req.method === 'PATCH') {
      const b = await readBody(req);
      for (const [k, v] of Object.entries(b)) if (db.settings.portals[k] && typeof v === 'object') { if (v.key !== undefined) { db.settings.portals[k].key = String(v.key); db.settings.portals[k].status = v.key ? 'key_saved' : 'off'; } }
      store.save();
      return json(res, 200, db.settings.portals);
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

    if (p === '/api/playbook' && req.method === 'GET') return json(res, 200, playbook.PLAYBOOK);
    if (p === '/api/events' && req.method === 'GET') return json(res, 200, db.events.slice(0, 60));
    if (p === '/api/analytics' && req.method === 'GET') return json(res, 200, analytics(db));
    if (p === '/api/demo/reset' && req.method === 'POST') { store.reset(seed); return json(res, 200, { ok: true }); }

    if ((m = p.match(/^\/p\/([a-f0-9]+)$/)) && req.method === 'GET') {
      const c = db.collections.find(x => x.id === m[1]);
      if (!c) { res.writeHead(404); res.end('not found'); return; }
      c.views = (c.views || 0) + 1;
      if (c.leadId && (!c.lastViewAt || Date.now() - c.lastViewAt > 10 * 60e3)) {
        const vl = db.leads.find(l => l.id === c.leadId);
        if (vl) ai.pushEvent(db, { type: 'view', leadId: vl.id, text: `${vl.name} открыл подборку «${c.title}» — лучший момент для звонка` });
      }
      c.lastViewAt = Date.now();
      store.save();
      const props = c.propertyIds.map(id => db.properties.find(x => x.id === id)).filter(Boolean);
      const lead = db.leads.find(l => l.id === c.leadId);
      const mgr = db.settings.agency.manager || {};
      const fmt = (n, cur) => (cur === 'EUR' ? '€' : '$') + (n || 0).toLocaleString('ru-RU');
      const isPrint = u.searchParams.get('print') === '1';
      const cover = (pr2) => (pr2.images || [])[0]
        ? `<div class="phero" style="background-image:url('${pr2.images[0]}')"></div>`
        : `<div class="phero grad"><span>${pr2.area || pr2.name}</span></div>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${c.title} — ${db.settings.agency.name}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,sans-serif;background:#F4F7FB;color:#111827}
.page{max-width:900px;margin:0 auto;background:#fff}
.cover{min-height:520px;background:radial-gradient(700px 400px at 85% -10%,rgba(47,107,255,.45),transparent 60%),linear-gradient(155deg,#102B5C,#061126 80%);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:60px 24px}
.cover .logo{width:44px;height:53px;margin-bottom:18px}.cover h1{font-size:34px;letter-spacing:-.5px;font-weight:800}.cover .for{color:#86AFFF;font-size:15px;margin-top:10px}
.mgr{margin-top:44px;display:flex;gap:14px;align-items:center;background:rgba(255,255,255,.07);border:1px solid rgba(134,175,255,.25);border-radius:16px;padding:14px 22px;backdrop-filter:blur(10px)}
.mgr .ava{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#2F6BFF,#102B5C);display:grid;place-items:center;font-weight:700;font-size:16px}
.mgr .nm{font-weight:700;font-size:15px}.mgr .ct{font-size:12.5px;color:#9FB5E8;margin-top:2px}
.intro{padding:34px 40px;font-size:15px;line-height:1.65;color:#3D4A63;border-bottom:1px solid #E7ECF3;white-space:pre-line}
.pobj{padding:0 0 34px;border-bottom:1px solid #E7ECF3;page-break-after:always}
.phero{height:300px;background-size:cover;background-position:center}
.phero.grad{background:linear-gradient(135deg,#102B5C,#2F6BFF);display:grid;place-items:center}.phero.grad span{color:rgba(255,255,255,.85);font-size:30px;font-weight:800}
.pbody{padding:26px 40px 0}
.ptitle{display:flex;justify-content:space-between;align-items:baseline;gap:16px;flex-wrap:wrap}
.ptitle h2{font-size:24px;color:#0A1833;font-weight:800}.pprice{font-size:22px;font-weight:800;color:#2563EB;white-space:nowrap}
.pmeta{color:#667085;font-size:13px;margin-top:4px}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0 0}
.chip{background:#EEF2F7;border-radius:10px;padding:8px 13px;font-size:12px}.chip b{display:block;font-size:13px;color:#0A1833}.chip span{color:#667085;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
.pdesc{margin-top:16px;font-size:13.5px;line-height:1.65;color:#3D4A63}
.sec{margin-top:20px}.sec h3{font-size:12px;text-transform:uppercase;letter-spacing:.09em;color:#667085;margin-bottom:9px}
.am{display:flex;gap:7px;flex-wrap:wrap}.am span{background:#DCE8FF;color:#102B5C;font-weight:600;font-size:12px;border-radius:14px;padding:5px 12px}
.gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.gallery div{aspect-ratio:4/3;border-radius:10px;background-size:cover;background-position:center}
table.units{width:100%;border-collapse:collapse;font-size:13px}
.units th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:#102B5C;padding:7px 9px;border-bottom:2px solid #DCE3ED}
.units td{padding:8px 9px;border-bottom:1px solid #E7ECF3}.units .pr{font-weight:700;color:#2563EB}
.mats a{display:inline-block;margin:0 14px 6px 0;color:#2563EB;font-size:13px}
.final{padding:44px 40px;text-align:center}
.cta{display:inline-block;background:#2563EB;color:#fff;text-decoration:none;font-weight:700;border-radius:12px;padding:15px 34px;margin-top:16px}
.foot{text-align:center;color:#667085;font-size:12px;padding:18px}
@media print{body{background:#fff}.cover,.phero.grad{-webkit-print-color-adjust:exact;print-color-adjust:exact}.cta{display:none}.pobj{border:none}}
@media(max-width:640px){.pbody,.intro,.final{padding-left:18px;padding-right:18px}.gallery{grid-template-columns:1fr 1fr}}
</style></head><body><div class="page">
<div class="cover">
  <svg class="logo" viewBox="0 0 100 120"><defs><linearGradient id="g" x1="20%" y1="8%" x2="80%" y2="95%"><stop offset="0%" stop-color="#B4CFFF"/><stop offset="45%" stop-color="#4E82FF"/><stop offset="100%" stop-color="#1D4FD8"/></linearGradient></defs><path fill="url(#g)" d="M50 0 C54.5 37 66 52 93 60 C66 68 54.5 83 50 120 C45.5 83 34 68 7 60 C34 52 45.5 37 50 0 Z"/></svg>
  <div style="font-size:13px;letter-spacing:.24em;color:#86AFFF;margin-bottom:10px">${db.settings.agency.name.toUpperCase()}</div>
  <h1>${c.title}</h1>
  <div class="for">${lead ? 'персонально для ' + lead.name.split(' ')[0] + ' · ' : ''}${new Date(c.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })} · ${props.length} проект(а)</div>
  <div class="mgr"><div class="ava">${(mgr.name || 'M').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}</div>
    <div style="text-align:left"><div class="nm">${mgr.name || ''}</div><div class="ct">${[mgr.phone, mgr.email].filter(Boolean).join(' · ')}</div></div></div>
</div>
${c.intro ? `<div class="intro">${c.intro}</div>` : ''}
${props.map((pr2, idx) => `<div class="pobj">
  ${cover(pr2)}
  <div class="pbody">
    <div class="ptitle"><div><h2>${idx + 1}. ${pr2.name}</h2><div class="pmeta">${pr2.area}${pr2.developer && pr2.developer !== '—' ? ' · ' + pr2.developer : ''} · ${pr2.market === 'offplan' ? 'первичка' : 'вторичка'}</div></div>
    <div class="pprice">от ${fmt(pr2.priceFrom, pr2.currency)}</div></div>
    <div class="chips">
      <div class="chip"><span>формат</span><b>${pr2.type || '—'}</b></div>
      <div class="chip"><span>сдача</span><b>${pr2.handover || '—'}</b></div>
      <div class="chip"><span>план оплаты</span><b>${pr2.payment || '—'}</b></div>
      ${pr2.tags.slice(0, 2).map(t => `<div class="chip"><span>особенность</span><b>${t}</b></div>`).join('')}
    </div>
    ${pr2.description ? `<div class="pdesc">${pr2.description}</div>` : pr2.note ? `<div class="pdesc">${pr2.note}</div>` : ''}
    ${(pr2.amenities || []).length ? `<div class="sec"><h3>Удобства</h3><div class="am">${pr2.amenities.map(a => `<span>${a}</span>`).join('')}</div></div>` : ''}
    ${(pr2.images || []).length > 1 ? `<div class="sec"><h3>Галерея</h3><div class="gallery">${pr2.images.slice(1, 7).map(u2 => `<div style="background-image:url('${u2}')"></div>`).join('')}</div></div>` : ''}
    ${(pr2.units || []).length ? `<div class="sec"><h3>Доступные юниты</h3><table class="units"><tr><th>Планировка</th><th>Площадь</th><th>Этаж</th><th>Вид</th><th>Цена</th></tr>
      ${pr2.units.map(u2 => `<tr><td><b>${u2.plan}</b></td><td>${u2.area}</td><td>${u2.floor}</td><td>${u2.view}</td><td class="pr">${fmt(u2.price, pr2.currency)}</td></tr>`).join('')}</table></div>` : ''}
    ${((pr2.layouts || []).length || (pr2.materials || []).length) ? `<div class="sec"><h3>Планировки и материалы</h3><div class="mats">
      ${(pr2.layouts || []).map(l2 => `<a href="${l2.url}" target="_blank">📐 ${l2.label}</a>`).join('')}
      ${(pr2.materials || []).map(mt2 => `<a href="${mt2.url}" target="_blank">${mt2.label} →</a>`).join('')}</div></div>` : ''}
    ${pr2.note && pr2.description ? `<div class="pdesc" style="font-size:12.5px;color:#667085;margin-top:12px">${pr2.note}</div>` : ''}
  </div>
</div>`).join('')}
<div class="final">
  <div style="font-size:19px;font-weight:800;color:#0A1833">Что откликается — обсудим</div>
  <div style="color:#667085;font-size:13.5px;margin-top:8px">Посчитаю доходность по понравившимся вариантам и забронирую юнит.<br>${[mgr.name, mgr.phone].filter(Boolean).join(' · ')}</div>
  <a class="cta" href="https://wa.me/${(mgr.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent('Здравствуйте! Смотрю подборку «' + c.title + '»')}">Обсудить в WhatsApp</a>
</div>
<div class="foot">${db.settings.agency.name} · собрано в Lumen CRM</div>
</div>${isPrint ? '<script>window.print()</script>' : ''}</body></html>`);
      return;
    }

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

/* curl/интеграторы с Expect: 100-continue — отвечаем и продолжаем как обычный запрос */
server.on('checkContinue', (req, res) => { res.writeContinue(); server.emit('request', req, res); });

server.listen(PORT, () => console.log(`Lumen CRM → http://localhost:${PORT}`));
