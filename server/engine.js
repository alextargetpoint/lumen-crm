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
  const num = pickNumber(db, lead);
  if (!num) {
    ai.pushEvent(db, { type: 'send_skip', leadId: lead.id, text: `Пропуск отправки ${lead.name}: нет доступного номера (лимиты/карантин)` });
    return null;
  }
  lead.numberId = num.id;
  num.sentToday += 1;
  if (num.sentToday > num.dayLimit * 0.8) num.quality = Math.max(0, +(num.quality - 0.3).toFixed(1));
  const m = { id: store.nextId('m'), leadId: lead.id, dir: 'out', via, text, at: Date.now(), status: 'sent', numberId: num.id, templateId: opts.templateId || null, waId: null };
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

/* ---------- передача брокеру ---------- */
function handover(db, lead, brokerId) {
  let broker = brokerId ? db.brokers.find(b => b.id === brokerId) : null;
  if (!broker) {
    broker = db.brokers
      .filter(b => b.geo === lead.geo)
      .sort((a, b) => (a.load / a.capacity) - (b.load / b.capacity))[0] || db.brokers[0];
  }
  lead.broker = broker.id;
  lead.stage = 'handover';
  broker.load += 1;
  if (!lead.summary) lead.summary = ai.buildSummary(db, lead);
  const tpl = db.templates.find(t => t.id === 'tpl_slot');
  if (tpl) send(db, lead, renderTemplate(db, tpl, lead), 'ai');
  ai.pushEvent(db, { type: 'handover', leadId: lead.id, text: `${lead.name} передан брокеру: ${broker.name} (саммари готово)` });
  store.save();
  return broker;
}

/* ---------- цепочки касаний ---------- */
function dayMs(db) { return db.settings.demo.accelerate ? db.settings.demo.dayMs : DAY; }

function tickChains(db) {
  const seq = db.sequences.find(s => s.active);
  if (!seq) return;
  const nowT = Date.now();
  for (const lead of db.leads) {
    if (!lead.ai.enabled) continue;
    /* цепочка — только до первого ответа клиента; ответил → живой диалог,
       и обратно в «Спящие» из диалога цепочка лида не роняет */
    if (!['new', 'touch'].includes(lead.stage)) continue;
    if (lead.lastDir === 'in') continue;
    if (db.messages.some(m => m.leadId === lead.id && m.dir === 'in')) continue;
    const step = seq.steps.filter(s => s.active)[lead.ai.chainStep];
    if (!step) { // цепочка исчерпана → спящий
      lead.stage = 'sleeping';
      ai.pushEvent(db, { type: 'sleep', leadId: lead.id, text: `${lead.name}: цепочка (${seq.steps.length} касаний) исчерпана без ответа → «Спящие»` });
      continue;
    }
    if (lead.ai.nextTouchAt == null) {
      lead.ai.nextTouchAt = nowT + (lead.ai.chainStep === 0 ? 30e3 : step.day * dayMs(db));
      continue;
    }
    if (nowT < lead.ai.nextTouchAt) continue;

    let text;
    if (step.mode === 'template') {
      const tpl = db.templates.find(t => t.id === step.templateId);
      text = tpl ? renderTemplate(db, tpl, lead) : null;
    } else {
      text = chainAiText(db, lead, step);
    }
    if (text) {
      send(db, lead, text, 'chain');
      if (lead.stage === 'new') lead.stage = 'touch';
      ai.pushEvent(db, { type: 'touch', leadId: lead.id, text: `Касание ${lead.ai.chainStep + 1}/${seq.steps.length}: ${lead.name} — ${step.label}` });
    }
    lead.ai.chainStep += 1;
    const next = seq.steps.filter(s => s.active)[lead.ai.chainStep];
    lead.ai.nextTouchAt = next ? nowT + Math.max(1, next.day - step.day) * dayMs(db) : nowT + dayMs(db);
  }
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
  return list;
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

function tickCampaigns(db) {
  const nowT = Date.now();
  for (const cmp of db.campaigns) {
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
  const { reply } = ai.onInbound(db, lead, text);
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
      if (out) {
        let applied = 0;
        for (const [axis, v] of Object.entries(out.axes)) {
          if (!l2.quals[axis]) { l2.quals[axis] = v; applied++; }
        }
        if (applied) {
          ai.screen(fresh, l2);
          if (l2.stage === 'qualified' && !l2.summary) {
            l2.summary = ai.buildSummary(fresh, l2);
            ai.pushEvent(fresh, { type: 'qualified', leadId: l2.id, text: `${l2.name} квалифицирован ИИ (LLM) — готов к передаче брокеру` });
          }
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

/* ---------- основной цикл ---------- */
function startLoop() {
  setInterval(() => {
    try {
      const db = store.get();
      tickChains(db);
      tickCampaigns(db);
      tickSimulator(db);
      store.save();
    } catch (e) { console.error('[engine]', e); }
  }, 5000);
}

module.exports = { send, handover, inbound, wakePreview, wakeScore, segmentOf, startCampaign, renderTemplate, startLoop };
