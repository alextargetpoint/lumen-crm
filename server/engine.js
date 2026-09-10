/* Lumen CRM — движок: отправка, цепочки касаний, кампании реанимации,
   здоровье номеров, демо-симулятор ответов.
   Все отправки идут через send() — единая точка, где потом включится
   реальный WhatsApp Cloud API (wa.js). В mock-режиме сообщение просто
   пишется в переписку. */
const store = require('./store');
const ai = require('./ai');
const llm = require('./llm');
const wa = require('./wa');

const MIN = 60e3, DAY = 24 * 3600e3;

/* ---------- омниканал: выбор канала по приоритетам ---------- */
function resolveChannel(db, lead) {
  const cfg = db.settings.channels || { priority: ['wa'], enabled: { wa: true } };
  const has = (ch) => {
    if (ch === 'wa') return (lead.channels?.wa || 'unknown') !== 'no';
    if (ch === 'email') return (lead.contacts || []).some(c => c.kind === 'email');
    if (ch === 'tg') return (lead.channels?.tg === 'yes') || (lead.contacts || []).some(c => c.kind === 'telegram');
    if (ch === 'viber') return lead.channels?.viber === 'yes';
    return false;
  };
  const pr = cfg.priority.filter(ch => cfg.enabled[ch] && has(ch));
  const want = lead.activeChannel || 'wa';
  if (pr.includes(want)) return want;
  return pr[0] || 'wa';
}

function nextChannel(db, lead) {
  const cfg = db.settings.channels || {};
  const cur = lead.activeChannel || 'wa';
  const pr = (cfg.priority || ['wa']).filter(ch => cfg.enabled?.[ch]);
  const ix = pr.indexOf(cur);
  for (let k = ix + 1; k < pr.length; k++) {
    const ch = pr[k];
    const probe = { ...lead, activeChannel: ch };
    if (resolveChannel(db, probe) === ch) return ch;
  }
  return null;
}

const CH_NAMES = { wa: 'WhatsApp', tg: 'Telegram', viber: 'Viber', email: 'E-mail' };

/* ---------- выбор номера и отправка ---------- */
function pickNumber(db, lead) {
  if (lead.numberId) {
    const n = db.numbers.find(x => x.id === lead.numberId);
    if (n && n.state === 'active' && n.sentToday < n.dayLimit) return n;
  }
  const cand = db.numbers
    .filter(n => n.state === 'active' && n.sentToday < n.dayLimit && (n.geo === lead.geo || n.channel === 'cloud_api'))
    .sort((a, b) => b.quality - a.quality);
  return cand[0] || null;
}

function renderTemplate(db, tpl, lead) {
  const broker = db.brokers.find(b => b.id === lead.broker);
  return tpl.body
    .replace(/\{name\}/g, lead.name.split(' ')[0])
    .replace(/\{agency\}/g, db.settings.agency.name)
    .replace(/\{geo\}/g, db.settings.geoNames[lead.geo] || lead.geo)
    .replace(/\{broker\}/g, broker ? broker.name : 'наш эксперт')
    .replace(/\{slot\}/g, '11:00');
}

function send(db, lead, text, via, opts = {}) {
  const channel = opts.channel || resolveChannel(db, lead);
  if (channel !== 'wa') {
    /* не-WA каналы: mock-запись в переписку; боевые слоты (TG-бот/Viber/Resend) включаются токенами */
    const m0 = { id: store.nextId('m'), leadId: lead.id, dir: 'out', via, channel, text, at: Date.now(), status: 'sent', templateId: opts.templateId || null };
    if (channel === 'email' && opts.subject) m0.subject = opts.subject;
    if (opts.media && opts.media.url) m0.media = { type: opts.media.type || 'image', url: String(opts.media.url).slice(0, 500) };
    db.messages.push(m0);
    lead.lastMsgAt = m0.at;
    lead.lastDir = 'out';
    const cfg = db.settings.channels;
    (async () => {
      try {
        if (channel === 'email' && cfg.email.key && cfg.email.from) {
          const to = (lead.contacts || []).find(c => c.kind === 'email')?.value;
          if (to) {
            const r = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { Authorization: 'Bearer ' + cfg.email.key, 'Content-Type': 'application/json' },
              body: JSON.stringify({ from: cfg.email.from, to, subject: opts.subject || 'По вашей заявке', text }),
            });
            if (!r.ok) throw new Error('resend ' + r.status);
          }
        }
        if (channel === 'tg' && cfg.tg.botToken && lead.channels?.tgChatId) {
          await fetch(`https://api.telegram.org/bot${cfg.tg.botToken}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: lead.channels.tgChatId, text }),
          });
        }
        m0.status = 'delivered';
      } catch (err) {
        m0.status = 'failed';
        ai.pushEvent(db, { type: 'send_skip', leadId: lead.id, text: `${CH_NAMES[channel]} отказал (${lead.name}): ${err.message}` });
      }
      store.save();
    })();
    store.save();
    return m0;
  }
  const num = pickNumber(db, lead);
  if (!num) {
    ai.pushEvent(db, { type: 'send_skip', leadId: lead.id, text: `Пропуск отправки ${lead.name}: нет доступного номера (лимиты/карантин)` });
    return null;
  }
  lead.numberId = num.id;
  num.sentToday += 1;
  if (num.sentToday > num.dayLimit * 0.8) num.quality = Math.max(0, +(num.quality - 0.3).toFixed(1));
  const m = { id: store.nextId('m'), leadId: lead.id, dir: 'out', via, channel: 'wa', text, at: Date.now(), status: 'sent', numberId: num.id, templateId: opts.templateId || null, waId: null };
  if (opts.media && opts.media.url) m.media = { type: opts.media.type || 'image', url: String(opts.media.url).slice(0, 500) };
  db.messages.push(m);
  lead.lastMsgAt = m.at;
  lead.lastDir = 'out';
  if (lead.ai.silentSince == null) lead.ai.silentSince = m.at;
  if (wa.ready(db)) {
    const tpl = opts.templateId ? db.templates.find(t => t.id === opts.templateId) : null;
    const job = tpl && tpl.status === 'approved' ? wa.sendTemplate(db, lead, tpl, text) : wa.sendText(db, lead, text);
    job.then(res => { m.waId = res.messages?.[0]?.id || null; store.save(); })
      .catch(err => {
        m.status = 'failed';
        ai.pushEvent(db, { type: 'send_skip', leadId: lead.id, text: `Cloud API отказал (${lead.name}): ${err.message}` });
        store.save();
      });
  } else {
    setTimeout(() => { if (m.status === 'sent') m.status = 'delivered'; store.save(); }, 1500); // mock-доставка
  }
  store.save();
  return m;
}

/* ---------- автораспределение по брокерам ---------- */
function brokerOnShift(b) {
  const now = new Date();
  const day = now.getDay() === 0 ? 7 : now.getDay(); // 1..7, пн=1
  const s = b.schedule || {};
  if (s.days && !s.days.includes(day)) return false;
  const hm = now.getHours() * 60 + now.getMinutes();
  const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  const win = (s.perDay || {})[day] || s;   /* у дня может быть свой интервал */
  if (win.from && hm < toMin(win.from)) return false;
  if (win.to && hm >= toMin(win.to)) return false;
  return true;
}

function pickBroker(db, lead) {
  const mode = (db.settings.automations || {}).assignMode || 'load';
  let pool = db.brokers.filter(b => b.geo === lead.geo);
  if (!pool.length) pool = db.brokers.slice();
  if (mode === 'shift') {
    const onShift = pool.filter(brokerOnShift);
    if (onShift.length) pool = onShift; // вне смен — fallback на всех, лид не виснет
  }
  if (mode === 'roundrobin') {
    const a = db.settings.automations;
    a.rrCursor = (a.rrCursor + 1) % pool.length;
    return pool[a.rrCursor];
  }
  return pool.sort((a, b) => (a.load / a.capacity) - (b.load / b.capacity))[0];
}

/* ---------- передача брокеру ---------- */
/* предпросмотр передачи: что уйдёт клиенту и что увидит брокер (без изменения данных) */
function handoverPreview(db, lead, brokerId) {
  let broker = brokerId ? db.brokers.find(b => b.id === brokerId) : null;
  if (!broker) broker = pickBroker(db, lead);
  const tpl = db.templates.find(t => t.id === 'tpl_slot');
  const clientMsg = tpl ? renderTemplate(db, tpl, Object.assign({}, lead, { broker: broker.id })) : '';
  const auto = db.settings.automations || {};
  let preannounce = '';
  if (auto.handoverPreannounce && broker && broker.phone) {
    const first = lead.name.split(' ')[0];
    preannounce = `${first}, с вами свяжется ${broker.name}, ваш персональный эксперт по ${db.settings.geoNames[lead.geo] || lead.geo} — напишет сюда или с номера ${broker.phone}. Это тот же наш отдел, продолжите с ним.`;
  }
  return { broker: broker ? { id: broker.id, name: broker.name } : null, clientMsg, preannounce, summary: lead.summary || ai.buildSummary(db, lead) };
}

function handover(db, lead, brokerId, opts = {}) {
  let broker = brokerId ? db.brokers.find(b => b.id === brokerId) : null;
  if (!broker) broker = pickBroker(db, lead);
  lead.broker = broker.id;
  lead.stage = 'handover';
  lead.handoverAt = Date.now();   /* точка отсчёта SLA «коснись за N минут» */
  lead.slaFlag = null;
  broker.load += 1;
  if (!lead.summary) lead.summary = ai.buildSummary(db, lead);
  if (!lead.nextAction) lead.nextAction = { text: `Позвонить в течение 30 мин (передан от ИИ)`, at: Date.now() + 30 * 60e3 };
  if (module.exports.onHandover) module.exports.onHandover(db, lead);
  const tpl = db.templates.find(t => t.id === 'tpl_slot');
  const clientMsg = (opts.clientMsg && String(opts.clientMsg).trim()) ? String(opts.clientMsg).trim() : (tpl ? renderTemplate(db, tpl, lead) : '');
  if (clientMsg) send(db, lead, clientMsg, 'ai');
  /* Вариант B: брокер пишет с личного номера — тёплый преданонс с того же (центрального)
     номера, чтобы сообщение брокера не выглядело холодным незнакомым номером */
  const auto = db.settings.automations || {};
  if (auto.handoverPreannounce && broker.phone) {
    const first = lead.name.split(' ')[0];
    send(db, lead, `${first}, с вами свяжется ${broker.name}, ваш персональный эксперт по ${db.settings.geoNames[lead.geo] || lead.geo} — напишет сюда или с номера ${broker.phone}. Это тот же наш отдел, продолжите с ним.`, 'ai');
  }
  ai.pushEvent(db, { type: 'handover', leadId: lead.id, text: `${lead.name} передан брокеру: ${broker.name} (саммари готово)` });
  store.save();
  return broker;
}

/* ---------- цепочки касаний ---------- */
function dayMs(db) { return db.settings.demo.accelerate ? db.settings.demo.dayMs : DAY; }

/* ---------- тихие часы по поясу ЛИДА ----------
   Ночью не трогаем: касания цепочек, реанимация, напоминания сдвигаются на утро.
   Исключение — мгновенный первый ответ на свежую заявку (клиент сейчас онлайн). */
function quietCfg(db) {
  const q = (db.settings.automations || {}).quietHours;
  return Object.assign({ enabled: true, from: 21, to: 9 }, q || {});
}
function leadLocalHour(lead) {
  return new Date(Date.now() + (lead.tz ?? 4) * 3600e3).getUTCHours();
}
function inQuiet(db, lead) {
  const q = quietCfg(db);
  if (!q.enabled) return false;
  const h = leadLocalHour(lead);
  return q.from > q.to ? (h >= q.from || h < q.to) : (h >= q.from && h < q.to);
}
/* следующее «утро» лида (q.to:00 его времени) в UTC-timestamp */
function morningAt(db, lead) {
  const q = quietCfg(db);
  const tz = (lead.tz ?? 4) * 3600e3;
  const local = new Date(Date.now() + tz);
  const m = new Date(local);
  m.setUTCHours(q.to, 0, 0, 0);
  if (m <= local) m.setUTCDate(m.getUTCDate() + 1);
  return +m - tz + Math.floor(Math.random() * 20 * 60e3); /* джиттер 0-20 мин, чтобы не залпом */
}

function tickChains(db) {
  const nowT = Date.now();
  const actives = db.sequences.filter(s => s.active);
  if (!actives.length) return;
  for (const lead of db.leads) {
    const seq = actives.find(s => s.geo === lead.geo) || actives.find(s => !s.geo || s.geo === 'all');
    if (!seq) continue;
    if (!lead.ai.enabled) continue;
    /* цепочка — только до первого ответа клиента; ответил → живой диалог,
       и обратно в «Спящие» из диалога цепочка лида не роняет */
    if (!['new', 'touch'].includes(lead.stage)) continue;
    if (lead.lastDir === 'in') continue;
    if (db.messages.some(m => m.leadId === lead.id && m.dir === 'in')) continue;
    const step = seq.steps.filter(s => s.active)[lead.ai.chainStep];
    if (!step) {
      /* цепочка исчерпана: омниканальный второй круг → следующий канал по приоритету */
      const nx = db.settings.channels?.secondRound ? nextChannel(db, lead) : null;
      if (nx && !lead.ai.secondRound) {
        lead.activeChannel = nx;
        lead.ai.secondRound = true;
        lead.ai.chainStep = 0;
        lead.ai.nextTouchAt = nowT + 0.5 * dayMs(db);
        ai.pushEvent(db, { type: 'touch', leadId: lead.id, text: `${lead.name}: молчит в WhatsApp — переключаю каскад на ${CH_NAMES[nx]}, второй круг касаний` });
        continue;
      }
      lead.stage = 'sleeping';
      ai.pushEvent(db, { type: 'sleep', leadId: lead.id, text: `${lead.name}: каскад каналов исчерпан без ответа → «Спящие»` });
      continue;
    }
    if (lead.ai.nextTouchAt == null) {
      lead.ai.nextTouchAt = nowT + (lead.ai.chainStep === 0 ? 30e3 : step.day * dayMs(db));
      continue;
    }
    if (nowT < lead.ai.nextTouchAt) continue;
    /* тихие часы: мгновенное первое касание (шаг 0, свежая заявка <30 мин) разрешено — клиент онлайн; остальное ждёт утра */
    const freshInstant = lead.ai.chainStep === 0 && nowT - lead.createdAt < 30 * 60e3;
    if (!freshInstant && inQuiet(db, lead)) { lead.ai.nextTouchAt = morningAt(db, lead); continue; }

    let text;
    const sendOpts = {};
    if (step.channel === 'email' || (lead.activeChannel === 'email' && step.channel !== 'voice')) {
      sendOpts.channel = 'email';
      sendOpts.subject = fillVars(db, lead, step.subject || 'По вашей заявке — {agency}');
    }
    if (step.mode === 'template') {
      const tpl = db.templates.find(t => t.id === step.templateId);
      text = tpl ? renderTemplate(db, tpl, lead) : null;
    } else if (step.mode === 'text') {
      text = fillVars(db, lead, step.text);
    } else {
      text = chainAiText(db, lead, step);
    }
    if (text) {
      if (sendOpts.channel === 'email') {
        /* официальный тон для e-mail */
        text = 'Здравствуйте' + (lead.name && !/^[+\d]/.test(lead.name) ? ', ' + lead.name.split(' ')[0] : '') + '!\n\n' + text.replace(/^\{?name\}?,?\s*/i, '').replace(/😉|👌|🤝|🙏|\)\)/g, '') + '\n\nС уважением,\n' + (db.settings.agency.manager?.name || db.settings.agency.name) + '\n' + db.settings.agency.name;
      } else if (llm.humanize) {
        text = llm.humanize(text);   /* чистим AI-почерк (длинные тире и т.п.) в WhatsApp/мессенджер-касаниях */
      }
      /* ДЕРЕВО КРЕАТИВОВ: на ПЕРВОМ касании в мессенджере сначала уходит сам креатив (видео/картинка),
         на который человек среагировал, а затем — текстовое касание. */
      if (lead.ai.chainStep === 0 && sendOpts.channel !== 'email') {
        const adRec = lead.ads && lead.ads.adId ? (db.ads || []).find(a => String(a.adId) === String(lead.ads.adId)) : null;
        const media = (adRec && adRec.media && adRec.media.url) ? adRec.media
          : (lead.creativeUrl ? { type: /\.(mp4|webm|mov)(\?|$)/i.test(lead.creativeUrl) ? 'video' : 'image', url: lead.creativeUrl } : null);
        if (media) send(db, lead, '', 'chain', { media });
      }
      send(db, lead, text, 'chain', sendOpts);
      if (lead.stage === 'new') lead.stage = 'touch';
      ai.pushEvent(db, { type: 'touch', leadId: lead.id, text: `Касание ${lead.ai.chainStep + 1}/${seq.steps.length}: ${lead.name} — ${step.label}` });
    }
    lead.ai.chainStep += 1;
    const next = seq.steps.filter(s => s.active)[lead.ai.chainStep];
    /* авто-delay: базовый интервал шага + человеческий джиттер (±25%, минимум пара минут),
       чтобы касания не уходили роботизированно в одну и ту же секунду */
    const baseGap = next ? Math.max(0.1, next.day - step.day) * dayMs(db) : dayMs(db);
    const jitter = baseGap * (0.75 + (lead.id.charCodeAt(lead.id.length - 1) % 50) / 100);   /* детерминированный по лиду разброс 0.75–1.25× */
    lead.ai.nextTouchAt = nowT + Math.max(120e3, jitter);
  }
}

const MONTHS_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
function fillVars(db, lead, text) {
  const name = (lead.name || '').trim().split(/\s+/)[0];
  const isPhone = /^[+\d][\d\s()-]*$/.test(name);
  let t = String(text || '');
  if (name && !isPhone) t = t.replace(/\{name\}/g, name);
  else t = t.replace(/,\s*\{name\}/g, '').replace(/\{name\}\s*,\s*/g, '').replace(/\{name\}\s*/g, '');
  const now = new Date(Date.now() + (lead.tz || 0) * 3600e3);
  const slots = now.getUTCHours() < 16 ? 'сегодня в 18:00 или завтра в 11:00' : 'завтра в 11:00 или в 18:00';
  const adRef = lead.ads && lead.ads.matched && lead.ads.adName ? '«' + lead.ads.adName + '»' : (lead.ads && lead.ads.headline ? '«' + lead.ads.headline + '»' : 'вашу заявку');
  const adRec = lead.ads && lead.ads.adId ? (db.ads || []).find(a => String(a.adId) === String(lead.ads.adId)) : null;
  const price = adRec && adRec.priceFrom ? '$' + (+adRec.priceFrom).toLocaleString('en-US') : '';
  const COUNTRY = [['971', 'ОАЭ'], ['7', 'России'], ['380', 'Украины'], ['375', 'Беларуси'], ['998', 'Узбекистана'], ['77', 'Казахстана'], ['48', 'Польши'], ['49', 'Германии'], ['44', 'Великобритании'], ['39', 'Италии'], ['34', 'Испании'], ['420', 'Чехии'], ['41', 'Швейцарии'], ['1', 'США/Канады'], ['90', 'Турции'], ['972', 'Израиля'], ['995', 'Грузии'], ['374', 'Армении']];
  const ph = String(lead.phone || '').replace(/\D/g, '');
  const country = (COUNTRY.find(([c]) => ph.startsWith(c)) || [])[1] || '';
  t = t.replace(/\{priceLine\}/g, price ? `Вход — от ${price}. ` : '')
       .replace(/\{priceLineEn\}/g, price ? `It starts from ${price}. ` : '')
       .replace(/\{price\}/g, price || 'вашего бюджета')
       .replace(/\{countryQ\}/g, country ? `Вы же из ${country}, верно? Во сколько вам удобно?` : 'Во сколько вам удобно?')
       .replace(/\{countryQEn\}/g, country ? `You're from ${country}, right? What time works for you?` : 'What time works for you?');
  return t
    .replace(/\{ad\}/g, adRef)
    .replace(/\{geo\}/g, db.settings.geoNames[lead.geo] || lead.geo)
    .replace(/\{month\}/g, MONTHS_PREP[new Date().getMonth()])
    .replace(/\{agency\}/g, db.settings.agency.name)
    .replace(/\{slots\}/g, slots);
}

function chainAiText(db, lead, step) {
  const g = db.settings.geoNames[lead.geo] || lead.geo;
  const name = lead.name.split(' ')[0];
  const bank = {
    'Уточнение запроса': `${name}, чтобы не забрасывать вас лишним: одним словом — ${g} интересует для жизни, инвестиций или пока присматриваетесь? Соберу подборку точно под это.`,
    'Кейс по гео': `${name}, из свежего: на этой неделе наш клиент закрыл сделку в ${g} — вход на 15% ниже прайса за счёт предстарта. Такие окна появляются регулярно, могу присылать только подходящие под ваш запрос.`,
    'Голосовое': `🎙 [голосовое 0:24] ${name}, записал короткое голосовое по вашему запросу в ${g} — послушайте, там суть в двух словах.`,
    'Новый повод': `${name}, новость по ${g}: застройщики открыли рассрочки 0% на готовые лоты — это редкая конфигурация. Показать, что попадает в неё прямо сейчас?`,
    'Финальное касание': `${name}, не буду больше беспокоить частыми сообщениями. Оставлю за вами эксперта по ${g} — когда вернётесь к вопросу, просто напишите сюда, продолжим с того же места.`,
  };
  return bank[step.label] || `${name}, на связи по вашему запросу в ${g} — если удобно, продолжим подбор.`;
}

/* ---------- реанимация: скоринг и кампании ---------- */
function wakeScore(db, lead) {
  const days = lead.lastMsgAt ? (Date.now() - lead.lastMsgAt) / DAY : 999;
  const inbound = db.messages.filter(m => m.leadId === lead.id && m.dir === 'in').length;
  let s = 0;
  s += Math.max(0, 40 - Math.min(days, 40));          // свежесть: до 40
  s += Math.min(inbound * 6, 30);                      // вовлечённость: до 30
  if (lead.lastDir === 'in') s += 15;                  // последним писал клиент
  s += Math.min((lead.score || 0) / 10, 10);           // прошлая квалификация
  if ((lead.tags || []).includes('opt-out')) s = 0;
  return Math.round(s);
}

function segmentOf(score) { return score >= 55 ? 'A' : score >= 30 ? 'B' : 'C'; }

function wakePreview(db, filters = {}) {
  const list = db.leads
    .filter(l => (filters.stages || ['sleeping']).includes(l.stage))
    .filter(l => !filters.geo || l.geo === filters.geo)
    .filter(l => !filters.olderDays || (Date.now() - (l.lastMsgAt || l.createdAt)) >= filters.olderDays * DAY * (db.settings.demo.accelerate ? 0 : 1))
    .map(l => ({ id: l.id, name: l.name, geo: l.geo, phone: l.phone, lastMsgAt: l.lastMsgAt, note: l.summary, wakeScore: wakeScore(db, l) }))
    .sort((a, b) => b.wakeScore - a.wakeScore);
  list.forEach(x => x.segment = segmentOf(x.wakeScore));
  return filters.segment ? list.filter(x => x.segment === filters.segment) : list;
}

function startCampaign(db, cmp) {
  const preview = wakePreview(db, cmp.filters);
  cmp.recipients = preview.map(p => p.id);
  cmp.cursor = 0;
  cmp.state = 'running';
  cmp.nextBatchAt = Date.now() + 2000;
  cmp.log.unshift({ at: Date.now(), text: `Старт: ${cmp.recipients.length} получателей, сегменты по скорингу, пачка ${cmp.batchSize}` });
  ai.pushEvent(db, { type: 'wake', text: `Кампания «${cmp.name}» запущена: ${cmp.recipients.length} спящих` });
  store.save();
}

/* ---------- напоминания о встречах: ЦЕПОЧКА порогов (часы до встречи) ----------
   settings.automations.meetRemindChain = [24, 3, 0.5]; legacy meetingReminderHrs — фолбэк.
   Каждый порог шлётся один раз (mt.rem[i]); перенос встречи сбрасывает mt.rem. */
function tickMeetings(db) {
  const a = db.settings.automations || {};
  const chain = Array.isArray(a.meetRemindChain) && a.meetRemindChain.length ? a.meetRemindChain
    : (a.meetingReminderHrs ? [a.meetingReminderHrs] : []);
  if (!chain.length) return;
  const nowT = Date.now();
  for (const mt of db.meetings || []) {
    if (mt.status !== 'scheduled') continue;
    mt.rem = mt.rem || {};
    chain.forEach((hrs, i) => {
      if (mt.rem[i]) return;
      if (mt.at - nowT > 0 && mt.at - nowT <= hrs * 3600e3) {
        const lead = db.leads.find(l => l.id === mt.leadId);
        if (!lead) return;
        /* тихие часы: ночью не будим — кроме случая, когда встреча раньше «утра» (короткое напоминание важнее сна) */
        if (inQuiet(db, lead) && mt.at > morningAt(db, lead)) return;
        const broker = db.brokers.find(b => b.id === mt.brokerId);
        const when = new Date(mt.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        const soon = hrs <= 1;
        const pageUrl = global.LUMEN_BASE ? ` Вся информация: ${global.LUMEN_BASE}/m/${mt.id}` : (mt.link ? ' Ссылка: ' + mt.link : '');
        send(db, lead, soon
          ? `${lead.name.split(' ')[0]}, через ${Math.round(hrs * 60)} минут начинаем — ${{ call: 'созвон', video: 'видео-показ', tour: 'показ' }[mt.kind] || 'встреча'} с ${broker ? broker.name : 'экспертом'}.${pageUrl}`
          : `${lead.name.split(' ')[0]}, напоминаю: ${new Date(mt.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} в ${when} — ${{ call: 'созвон', video: 'видео-показ', tour: 'показ' }[mt.kind] || 'встреча'} с ${broker ? broker.name : 'экспертом'}.${pageUrl} Если время не подходит — напишите, перенесём.`, 'ai');
        mt.rem[i] = true;
        ai.pushEvent(db, { type: 'meeting', leadId: lead.id, text: `Напоминание (${hrs >= 1 ? 'за ' + hrs + ' ч' : 'за ' + Math.round(hrs * 60) + ' мин'}) отправлено: ${lead.name}` });
      }
    });
  }
}

/* ---------- SLA: брокер обязан коснуться лида за N минут после передачи ----------
   Просрочка → эскалация в ленту (+ мгновенный алерт, если включён); вторая просрочка
   (2×N) → «shark tank»: лид возвращается в пул и уходит следующему брокеру. */
function tickSla(db) {
  const slaMin = (db.settings.automations || {}).brokerSlaMin;
  if (!slaMin) return;
  const nowT = Date.now();
  for (const l of db.leads) {
    if (l.stage !== 'handover' || !l.broker || !l.handoverAt) continue;
    const touched = db.messages.some(m2 => m2.leadId === l.id && m2.dir === 'out' && m2.via === 'human' && m2.at > l.handoverAt);
    const mt = (db.meetings || []).some(x => x.leadId === l.id && x.createdAt > l.handoverAt);
    if (touched || mt) { l.slaFlag = null; continue; }
    const overdueMin = (nowT - l.handoverAt) / 60e3;
    const broker = db.brokers.find(b => b.id === l.broker);
    if (overdueMin > slaMin * 2 && l.slaFlag === 'warned') {
      /* shark tank: возврат в пул */
      const pool = db.brokers.filter(b => b.id !== l.broker && b.active !== false && b.geo === l.geo)
        .concat(db.brokers.filter(b => b.id !== l.broker && b.active !== false));
      const nb = pool.sort((a2, b2) => a2.load - b2.load)[0];
      if (nb) {
        if (broker) broker.load = Math.max(0, broker.load - 1);
        l.broker = nb.id; nb.load += 1; l.handoverAt = nowT; l.slaFlag = 'reassigned';
        ai.pushEvent(db, { type: 'handover', leadId: l.id, text: `⚠️ SLA ×2: ${l.name} не взят в работу — переназначен на ${nb.name}` });
      }
    } else if (overdueMin > slaMin && !l.slaFlag) {
      l.slaFlag = 'warned';
      ai.pushEvent(db, { type: 'ai_off', leadId: l.id, text: `⚠️ SLA: ${broker ? broker.name : 'брокер'} не связался с ${l.name} за ${slaMin} мин после передачи` });
    }
  }
}

function tickCampaigns(db) {
  const nowT = Date.now();
  for (const cmp of db.campaigns) {
    /* авто-старт запланированных кампаний, когда наступило время */
    if (cmp.state === 'scheduled' && cmp.startAt && nowT >= cmp.startAt) {
      cmp.log.unshift({ at: nowT, text: 'Автозапуск по расписанию' });
      startCampaign(db, cmp);
    }
    if (cmp.state !== 'running') continue;
    if (cmp.nextBatchAt && nowT < cmp.nextBatchAt) continue;
    /* окно отправки по поясу клиента проверяется пер-лидно ниже */
    const batch = cmp.recipients.slice(cmp.cursor, cmp.cursor + cmp.batchSize);
    if (!batch.length) {
      cmp.state = 'done';
      cmp.log.unshift({ at: nowT, text: `Кампания завершена: отправлено ${cmp.stats.sent}, ответили ${cmp.stats.replied}` });
      ai.pushEvent(db, { type: 'wake', text: `Кампания «${cmp.name}» завершена: ${cmp.stats.sent} отправок, ${cmp.stats.replied} ответов` });
      continue;
    }
    for (const id of batch) {
      const lead = db.leads.find(l => l.id === id);
      if (!lead || !lead.phone) { cmp.stats.skipped += 1; continue; }
      const hour = new Date(nowT + (lead.tz || 0) * 3600e3).getUTCHours();
      if (!db.settings.demo.accelerate && (hour < cmp.window[0] || hour >= cmp.window[1])) {
        cmp.recipients.push(id); // вне окна клиента — в конец очереди
        cmp.stats.skipped += 1;
        continue;
      }
      const tpl = db.templates.find(t => t.id === cmp.templateId);
      const text = tpl ? renderTemplate(db, tpl, lead) : (cmp.text || '');
      const m = send(db, lead, text, 'wake', { templateId: cmp.templateId });
      if (m) {
        cmp.stats.sent += 1;
        lead.ai.enabled = true; // ответ подхватит квалификатор
        lead.tags = [...new Set([...(lead.tags || []), 'реанимация'])];
      } else cmp.stats.skipped += 1;
    }
    cmp.cursor += cmp.batchSize;
    const [a, b] = cmp.pauseMin;
    const pause = (a + Math.random() * Math.max(0, b - a)) * (db.settings.demo.accelerate ? 1000 : 60e3);
    cmp.nextBatchAt = nowT + pause;
    cmp.log.unshift({ at: nowT, text: `Пачка ${Math.ceil(cmp.cursor / cmp.batchSize)}: ${batch.length} отправок, пауза ${Math.round(pause / (db.settings.demo.accelerate ? 1000 : 60e3))} ${db.settings.demo.accelerate ? 'сек (демо)' : 'мин'}` });
  }
}

/* ---------- демо-симулятор входящих ответов ---------- */
const PERSONA = {
  purpose: ['Рассматриваю как инвестицию, под сдачу', 'Хотим переехать семьёй, для себя', 'Интересует ВНЖ через покупку'],
  budget: ['Бюджет около 200к', 'До 150 тысяч долларов', 'Порядка 300k рассматриваю'],
  type: ['Наверное 1BR апартаменты', 'Смотрим виллу с 2 спальнями', 'Студия подойдёт для начала'],
  timeline: ['Хочу в течение пары месяцев решить', 'Не тороплюсь, до конца года', 'Готов сейчас, если вариант хороший'],
  generic: ['Да, интересно, расскажите подробнее', 'А что по ценам сейчас?', 'Пришлите варианты, посмотрю'],
};

function tickSimulator(db) {
  if (!db.settings.demo.simulateReplies) return;
  const cands = db.leads.filter(l =>
    l.lastDir === 'out' && l.ai.enabled &&
    ['touch', 'dialog', 'sleeping', 'new'].includes(l.stage) &&
    Date.now() - (l.lastMsgAt || 0) > 20e3);
  for (const lead of cands) {
    if (Math.random() > 0.18) continue; // ~1 ответ в ~30 сек на активного
    const missing = ai.AXES.filter(a => !lead.quals[a]);
    const axis = missing.length && Math.random() < 0.75 ? missing[0] : 'generic';
    const pool = PERSONA[axis] || PERSONA.generic;
    const text = pool[Math.floor(Math.random() * pool.length)];
    inbound(db, lead, text, { simulated: true });
  }
  /* демо: изредка «капает» комментарий под рекламой — витрина петли comment-to-lead */
  if (Math.random() < 0.12) {
    try { const r0 = simulateComment(db); if (r0) { const comments = require('./comments'); comments.autoReply(db, r0).catch(() => {}); } } catch (e) {}
  }
}

/* ---------- демо-генератор комментариев под рекламой ---------- */
const CMT_TEXTS = [
  'А сколько стоит?', 'Цена?', 'Почём такие?', 'Интересует, есть рассрочка?',
  'Можно подробнее в личку?', 'Какой район?', 'Реально доходность такая?',
  'Ипотека для нерезидентов есть?', 'Хочу подборку', 'Что по срокам сдачи?',
  'А документы как оформляются удалённо?', 'Первоначальный взнос какой?',
  'Красиво 😍 сколько за студию?', 'Это развод или реально?', 'Подпишись на меня взамен 🙈',
];
const CMT_NAMES = [
  ['Артём Ковалёв', 'artem.kv'], ['Дина Салимова', 'dina_s'], ['Олег Пряхин', 'opryahin'],
  ['Марго Лебедева', 'margo.leb'], ['Ислам Керимов', 'islam.k'], ['Настя Рой', 'nastya.roi'],
  ['Виктор Гаас', 'v.gaas'], ['Лейла Мамедова', 'leila.m'], ['Roman P', 'roman_p_dxb'],
];
let _cmtSeq = 1;
function simulateComment(db) {
  const comments = require('./comments');
  const ads = (db.ads || []).filter(a => a.postId);
  if (!ads.length) return null;
  const ad = ads[Math.floor(Math.random() * ads.length)];
  const [name, username] = CMT_NAMES[Math.floor(Math.random() * CMT_NAMES.length)];
  const text = CMT_TEXTS[Math.floor(Math.random() * CMT_TEXTS.length)];
  const platform = ad.geo === 'bali' ? 'ig' : (Math.random() < 0.6 ? 'ig' : 'fb');
  return comments.ingest(db, {
    platform, postId: ad.postId, adId: ad.adId,
    commentId: 'demo_c_' + (_cmtSeq++) + '_' + Date.now(),
    userId: 'demo_u_' + username, name, username, text,
  }, module.exports.matchAd);
}

/* ---------- единая обработка входящего (вебхук / симулятор / демо-кнопка) ---------- */
function inbound(db, lead, text, opts = {}) {
  const m = { id: store.nextId('m'), leadId: lead.id, dir: 'in', via: null, text, at: Date.now(), status: 'received' };
  db.messages.push(m);
  const wasWake = (lead.tags || []).includes('реанимация') && lead.stage === 'sleeping';
  if (lead.stage === 'sleeping') lead.stage = 'dialog';
  if (wasWake) {
    for (const cmp of db.campaigns) if (cmp.recipients.includes(lead.id)) cmp.stats.replied += 1;
  }
  const wasQualified = ['qualified', 'handover', 'viewing', 'deal'].includes(lead.stage);
  const { reply } = ai.onInbound(db, lead, text);
  if (!wasQualified && lead.stage === 'qualified') {
    if (module.exports.onQualified) module.exports.onQualified(db, lead);
    if ((db.settings.automations || {}).autoHandover) handover(db, lead); // авто-распределение на брокера
  }
  if (reply) {
    /* LLM: 'auto' — только реальные входящие (симуляция не жжёт токены),
       'llm' — всегда, 'core' — никогда. Ошибка/таймаут → скрипт ядра. */
    const prov = db.settings.ai.provider;
    const useLlm = llm.available() && (prov === 'llm' || (prov === 'auto' && !opts.simulated));
    setTimeout(async () => {
      const fresh = store.get();
      const l2 = fresh.leads.find(x => x.id === lead.id);
      if (!l2 || l2.lastDir !== 'in') return;
      let out = null;
      if (useLlm) {
        try { out = await llm.reply(fresh, l2); } catch (e) { console.error('[llm]', e.message); }
      }
      /* стоп-триггер: и фолбэк-ядро не должно дублировать себя по кругу */
      const dupGuard = (txt) => {
        const norm = (x) => String(x).toLowerCase().replace(/\s+/g, ' ').trim();
        return fresh.messages.filter(x => x.leadId === l2.id && x.dir === 'out').slice(-3).some(x => norm(x.text) === norm(txt));
      };
      if (!out && dupGuard(reply.text)) {
        l2.ai.enabled = false;
        l2.tags = [...new Set([...(l2.tags || []), 'нужен человек'])];
        ai.pushEvent(fresh, { type: 'ai_off', leadId: l2.id, text: `${l2.name}: ИИ зациклился (повтор реплики) — автопилот на паузе, лид ждёт менеджера` });
        store.save();
        return;
      }
      if (out) {
        let applied = 0;
        for (const [axis, v] of Object.entries(out.axes)) {
          if (!l2.quals[axis]) { l2.quals[axis] = v; applied++; }
        }
        if (applied) {
          const was = ['qualified', 'handover', 'viewing', 'deal'].includes(l2.stage);
          ai.screen(fresh, l2);
          if (l2.stage === 'qualified' && !l2.summary) {
            l2.summary = ai.buildSummary(fresh, l2);
            ai.pushEvent(fresh, { type: 'qualified', leadId: l2.id, text: `${l2.name} квалифицирован ИИ (LLM) — готов к передаче брокеру` });
          }
          if (!was && l2.stage === 'qualified' && module.exports.onQualified) module.exports.onQualified(fresh, l2);
        }
        send(fresh, l2, out.text, 'ai');
      } else {
        send(fresh, l2, reply.text, 'ai');
      }
      if (reply.kind === 'handover_offer') {
        for (const cmp of fresh.campaigns) if (cmp.recipients.includes(l2.id)) cmp.stats.qualified += 1;
      }
      store.save();
    }, 4000 + Math.random() * 5000); // человеческий тайминг ответа
  }
  store.save();
  return m;
}

/* ---------- отчёты владельцу в мессенджер ---------- */
function buildReport(db, period) {
  /* ⭐ формат агентства: лиды/расход/CPL/целевые/стоимость целевого/%квал/топ связок/динамика н-н/all-time */
  const now = Date.now();
  const span = period === 'monthly' ? 30 : period === 'weekly' ? 7 : 1;
  const dayMs = 24 * 3600e3;
  const from = now - span * dayMs, prevFrom = now - 2 * span * dayMs;
  const L = db.leads || [], ADS = db.ads || [];
  const QUAL = ['qualified', 'handover', 'viewing', 'deal'];
  const inR = (t, a, b) => t && t >= a && t < b;
  const leadsIn = (a, b) => L.filter(l => inR(l.createdAt, a, b));
  const qualsIn = (a, b) => L.filter(l => QUAL.includes(l.stage) && inR(l.createdAt, a, b));
  const nl = leadsIn(from, now), pl = leadsIn(prevFrom, from);
  const nq = qualsIn(from, now), pq = qualsIn(prevFrom, from);
  const inWork = nl.filter(l => l.stage !== 'new').length;
  const spendTotal = ADS.reduce((s, a) => s + (+a.spend || 0), 0);
  const cpl = nl.length ? Math.round(spendTotal / nl.length) : 0;
  const cpTarget = nq.length ? Math.round(spendTotal / nq.length) : 0;
  const qualRate = inWork ? Math.round(nq.length / inWork * 100) : 0;
  const cur = (db.settings.reports && db.settings.reports.currency) || db.settings.currency || '';
  const M = (n) => Math.round(n).toLocaleString('ru-RU') + (cur ? ' ' + cur : '');
  const dyn = (a, b) => { if (!b) return a ? '+∞%' : '0%'; const d = Math.round((a - b) / b * 100); return (d >= 0 ? '+' : '') + d + '%'; };
  const plu = (n) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'лид' : (a >= 2 && a <= 4 && (b < 10 || b >= 20)) ? 'лида' : 'лидов'; };
  /* связки: кампания / адсет */
  const bundles = {};
  ADS.forEach(a => { const k = (a.campaignName || '—') + ' / ' + (a.adsetName || '—'); if (!bundles[k]) bundles[k] = { leads: 0, spend: 0 }; bundles[k].spend += (+a.spend || 0); });
  nl.forEach(l => { const ad = l.ads && ADS.find(a => String(a.adId) === String(l.ads.adId)); if (ad) { const k = (ad.campaignName || '—') + ' / ' + (ad.adsetName || '—'); if (bundles[k]) bundles[k].leads++; } });
  const topB = Object.entries(bundles).filter(([, v]) => v.leads > 0).sort((a, b) => b[1].leads - a[1].leads).slice(0, 5);
  const atLeads = L.length, atCpl = atLeads ? Math.round(spendTotal / atLeads) : 0;
  const pName = { daily: 'ежедневная сводка', weekly: 'еженедельный отчёт', monthly: 'месячный отчёт' }[period];
  const lines = [
    `📊 ${db.settings.agency.name} — ${pName} по лидогенерации`, ``,
    `Лидов всего: ${nl.length}`,
    spendTotal ? `Расход: ${M(spendTotal)}  |  CPL: ${M(cpl)}` : null,
    `Целевые: ${nq.length}${nl.length ? ` (${Math.round(nq.length / nl.length * 100)}%)` : ''}`,
    spendTotal && nq.length ? `Стоимость целевого: ${M(cpTarget)}` : null,
    inWork ? `% квалификации (от взятых в работу): ${qualRate}% (${nq.length} из ${inWork})` : null,
    topB.length ? `` : null,
    topB.length ? `Топ связок (кампания / адсет):` : null,
    ...topB.map(([k, v]) => `• ${k} — ${v.leads} ${plu(v.leads)}${v.spend ? `, ${M(v.spend)}, CPL ${M(Math.round(v.spend / v.leads))}` : ''}`),
    ``,
    `Динамика к прошлому периоду:`,
    `• Лиды: ${pl.length} → ${nl.length} (${dyn(nl.length, pl.length)})`,
    `• Целевые: ${pq.length} → ${nq.length} (${dyn(nq.length, pq.length)})`,
    ``,
    spendTotal ? `За всё время: лиды ${atLeads} | расход ${M(spendTotal)} | CPL ${M(atCpl)}` : `За всё время: лиды ${atLeads}`,
    ``,
    `Открыть CRM: ${tunnelBase() || 'http://localhost:' + (process.env.PORT || 5077)}`,
  ].filter(x => x !== null);
  return lines.join('\n');
}

function tunnelBase() {
  try {
    const log = require('fs').readFileSync('/tmp/lumen-tunnel.log', 'utf8');
    const m = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
    return m ? m[m.length - 1] : null;
  } catch { return null; }
}

async function sendReport(db, text) {
  const rp = db.settings.reports || {};
  const ch = db.settings.channels || {};
  if (rp.channel === 'tg' && ch.tg?.botToken && rp.tgChatId) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${ch.tg.botToken}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: rp.tgChatId, text }),
      });
      return r.ok ? 'tg' : 'tg_error';
    } catch { return 'tg_error'; }
  }
  ai.pushEvent(db, { type: 'msg_in', text: 'Сводка готова (подключите Telegram-бот и chat_id в «Автоматизациях», чтобы получать её в мессенджер)' });
  return 'event_only';
}

function tickReports(db) {
  const rp = db.settings.reports;
  if (!rp) return;
  const now = new Date();
  const [hh, mm] = String(rp.dailyAt || '09:00').split(':').map(Number);
  const key = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  const fire = async (period, lastKey) => {
    if (rp[lastKey] === key) return;
    rp[lastKey] = key;
    const text = buildReport(db, period);
    await sendReport(db, text);
    ai.pushEvent(db, { type: 'msg_in', text: `Сводка ${period === 'daily' ? 'за сутки' : period === 'weekly' ? 'за неделю' : 'за месяц'} отправлена` });
  };
  if (now.getHours() === hh && now.getMinutes() >= mm && now.getMinutes() < mm + 6) {
    if (rp.daily) fire('daily', 'lastDaily');
    if (rp.weekly && now.getDay() === 1) fire('weekly', 'lastWeekly');
    if (rp.monthly && now.getDate() === 1) fire('monthly', 'lastMonthly');
  }
}

/* мгновенные уведомления о важном: обёртка pushEvent-типов */
function maybeInstantNotify(db, e) {
  const rp = db.settings.reports || {};
  const inst = rp.instant || {};
  const map = { view: 'hotView', qualified: 'qualified', ai_off: 'aiOff', deal: 'deal' };
  const k = map[e.type];
  if (k && inst[k]) sendReport(db, '🔔 ' + e.text);
}

/* ---------- основной цикл ---------- */
function startLoop() {
  setInterval(() => {
    try {
      const db = store.get();
      tickChains(db);
      tickCampaigns(db);
      tickMeetings(db);
      tickSla(db);
      tickReports(db);
      tickSimulator(db);
      store.save();
    } catch (e) { console.error('[engine]', e); }
  }, 5000);
}

module.exports = { send, handover, handoverPreview, inbound, wakePreview, wakeScore, segmentOf, startCampaign, renderTemplate, startLoop, pickBroker, brokerOnShift, buildReport, sendReport, maybeInstantNotify, simulateComment };
