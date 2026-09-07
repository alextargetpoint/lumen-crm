/* Lumen CRM — ИИ-квалификатор.
   Правило продукта: факты квалификации извлекаются ТОЛЬКО из входящих
   сообщений клиента (dir === 'in'), модели/эвристике на слово не верим.
   v1 — детерминированное ядро (регэкспы + скрипты диалога), поверх него
   точка подключения LLM (settings.ai.provider === 'llm') — см. llm.js. */
const store = require('./store');

const AXES = ['purpose', 'timeline', 'budget', 'type'];

/* ---------- извлечение фактов из текста клиента ---------- */
function extractBudget(text) {
  const t = text.toLowerCase().replace(/\s+/g, ' ');
  /* ⚠️ без \b после кириллицы: в JS \w = латиница, «тыс»/«к» границу не дают */
  let m = t.match(/(?:до|около|порядка|бюджет|budget|up to|around)?\s*\$?\s*(\d{2,3})\s*(?:[кk](?![а-яёa-z])|тыс[а-яё]*|thousand)/);
  if (m) return { num: +m[1] * 1000, raw: m[0] };
  m = t.match(/(\d{1,3}(?:[ .,]\d{3})+)\s*(?:\$|€|usd|eur|aed|долл|евро)?/);
  if (m) { const n = +m[1].replace(/[ .,]/g, ''); if (n >= 20000) return { num: n, raw: m[0] }; }
  m = t.match(/(\d(?:[.,]\d)?)\s*(?:млн|million|mln|m)\b/);
  if (m) return { num: parseFloat(m[1].replace(',', '.')) * 1e6, raw: m[0] };
  return null;
}

function extractPurpose(text) {
  const t = text.toLowerCase();
  if (/инвест|доход|сдава|сдач|аренд|passive|invest|rental|yield|flip|флип/.test(t)) return 'Инвестиция / доход';
  if (/внж|виза|резидент|residen|golden/.test(t)) return 'ВНЖ / резидентство';
  if (/переезд|перееха|жить|для себя|семь|relocat|live in|зимов|перезимов/.test(t)) return 'Переезд / для себя';
  if (/отдых|отпуск|каникул|holiday|vacation/.test(t)) return 'Отдых / вторая резиденция';
  return null;
}

function extractTimeline(text) {
  const t = text.toLowerCase();
  if (/сейчас|на этой неделе|срочно|asap|this week|депозит/.test(t)) return 'Сразу';
  if (/пар[ыу] месяц|1-2 мес|месяц|month|4[0-5] дней/.test(t)) return '1–2 месяца';
  if (/квартал|3-4 мес|осен|ноябр|октябр|quarter|сезон/.test(t)) return 'Квартал / сезон';
  if (/год|через полгода|не тороп|присматр|year|no rush/.test(t)) return 'Полгода+';
  return null;
}

function extractType(text) {
  const t = text.toLowerCase();
  if (/вилл|villa/.test(t)) return 'Вилла';
  if (/студи|studio/.test(t)) return 'Студия';
  if (/таунхаус|townhouse/.test(t)) return 'Таунхаус';
  if (/пентхаус|penthouse/.test(t)) return 'Пентхаус';
  if (/(1|одн[ау]|one)[- ]?(br|спальн|bedroom|комнатн)|однушк/.test(t)) return '1BR / апартаменты';
  if (/(2|двум|two)[- ]?(br|спальн|bedroom)/.test(t)) return '2BR / апартаменты';
  if (/апарт|квартир|кондо|condo|apartment/.test(t)) return 'Апартаменты';
  return null;
}

function hasStopWord(db, text) {
  const t = text.toLowerCase();
  return (db.settings.stopWords || []).some(w => t.includes(w.toLowerCase()));
}

/* ---------- направление из слов клиента (только те, что агентство ведёт) ---------- */
const GEO_HINTS = {
  dubai: /дуба(й|е|я)|dubai|оаэ|эмират/i,
  bali: /бали|bali|индонез/i,
  phuket: /пхукет|пукет|phuket|таил?анд|thailand/i,
  spain: /испани|spain|барселон|коста\s?бланка|марбель|аликанте|валенси/i,
  oman: /оман\b|oman|маскат/i,
};
function detectGeo(text, db) {
  const geos = db.settings.agency.geos || [];
  for (const g of geos) { if (GEO_HINTS[g] && GEO_HINTS[g].test(text)) return g; }
  return null;
}

/* ---------- скрининг лида по всей переписке ---------- */
function screen(db, lead) {
  const inbound = db.messages.filter(m => m.leadId === lead.id && m.dir === 'in');
  const q = lead.quals;
  /* направление из сообщений клиента — иначе всё уедет в дефолтный Дубай */
  const geoDet = detectGeo(inbound.map(m => m.text).join(' '), db);
  if (geoDet) lead.geo = geoDet;
  for (const m of inbound) {
    if (!q.purpose) { const v = extractPurpose(m.text); if (v) q.purpose = { value: v, quote: clip(m.text) }; }
    if (!q.timeline) { const v = extractTimeline(m.text); if (v) q.timeline = { value: v, quote: clip(m.text) }; }
    if (!q.budget) { const b = extractBudget(m.text); if (b) q.budget = { value: fmtMoney(b.num, lead.geo, db), num: b.num, quote: clip(m.text) }; }
    if (!q.type) { const v = extractType(m.text); if (v) q.type = { value: v, quote: clip(m.text) }; }
  }
  /* атрибуция ИИ-героя: кто ведёт лида (для честной A/B-статистики) — фиксируем при первом ведении */
  if (!lead.personaId) {
    try {
      const p = require('./llm').pickPersona(db, lead);
      if (p && p.id) {
        lead.personaId = p.id;
        const st = (db.settings.ai.personaStats = db.settings.ai.personaStats || {});
        st[p.id] = st[p.id] || { handled: 0, qualified: 0 };
        st[p.id].handled += 1;
      }
    } catch (e) {}
  }
  const filled = AXES.filter(a => q[a]).length;
  const engagement = Math.min(inbound.length * 4, 20);
  lead.score = Math.min(100, filled * 20 + engagement);

  /* стадии двигаем только вперёд и только по фактам; ручные стадии
     (handover/viewing/deal/lost) скрининг никогда не трогает */
  if (!['new', 'touch', 'dialog', 'qualified'].includes(lead.stage)) return lead; // ручные и кастомные стадии не трогаем
  if (filled === 4) lead.stage = 'qualified';
  else if (inbound.length > 0) lead.stage = 'dialog';
  else if (lead.ai.chainStep > 0) lead.stage = 'touch';
  return lead;
}

function clip(t) { return t.length > 90 ? t.slice(0, 87) + '…' : t; }

function fmtMoney(n, geo, db) {
  const cur = (db.settings.criteria[geo] || {}).currency === 'EUR' ? '€' : '$';
  return cur + n.toLocaleString('ru-RU').replace(/,/g, ' ');
}

/* ---------- генерация следующей реплики ИИ (mock-скрипт) ---------- */
function nextQuestion(db, lead) {
  const g = db.settings.geoNames[lead.geo] || lead.geo;
  const q = lead.quals;
  const crit = db.settings.criteria[lead.geo] || {};

  if (q.budget && q.budget.num && crit.budgetMin && q.budget.num < crit.budgetMin) {
    return { text: `Понимаю по бюджету. Прямой запрос в этой вилке закрыть сложно, но есть сильная альтернатива: ${crit.downsell}. Показать 2–3 таких варианта?`, kind: 'downsell' };
  }
  if (!q.purpose)  return { text: `Подскажите, ${g} рассматриваете для жизни или как инвестицию? От этого зависит, что покажу в первую очередь.`, kind: 'ask_purpose' };
  if (!q.budget)   return { text: `Чтобы предложить точные варианты: какой бюджет закладываете на покупку?`, kind: 'ask_budget' };
  if (!q.type)     return { text: `Какой формат ближе: апартаменты в комплексе или вилла? И сколько спален смотрим?`, kind: 'ask_type' };
  if (!q.timeline) return { text: `И по срокам — когда планируете выйти на покупку? Это важно: под «сейчас» и «через полгода» рынок предлагает разное.`, kind: 'ask_timeline' };
  return { text: `Отлично, у меня всё есть для точной подборки. Передаю вас нашему эксперту по ${g} — он подготовит адресные варианты и созвонится в удобное время. Когда удобно: сегодня вечером или завтра?`, kind: 'handover_offer' };
}

/* ---------- саммари для брокера ---------- */
function buildSummary(db, lead) {
  const q = lead.quals;
  const g = db.settings.geoNames[lead.geo] || lead.geo;
  const parts = [];
  if (q.purpose) parts.push(`Цель: ${q.purpose.value}`);
  if (q.budget) parts.push(`бюджет ${q.budget.value}`);
  if (q.type) parts.push(`формат: ${q.type.value}`);
  if (q.timeline) parts.push(`срок: ${q.timeline.value}`);
  const inbound = db.messages.filter(m => m.leadId === lead.id && m.dir === 'in').length;
  return `${g}. ${parts.join(', ') || 'квалификация не завершена'}. Сообщений от клиента: ${inbound}. Источник: ${lead.source}.`;
}

/* ---------- авто-отключение ИИ: клиенту нужен человек ---------- */
const RE_HUMAN = /менеджер|оператор|живо(й|го) человек|с человеком|соедини|позовите|перезвон|позвоните мне/i;
const RE_ESCALATION = /юрист|адвокат|жалоб|претензи|верн(и|ите|уть) деньги|расторж|обман|мошен/i;

function autoOffCheck(db, lead, text) {
  const rules = db.settings.ai.autoOff || {};
  if (!lead.ai.enabled) return null;
  if (rules.onHumanRequest && RE_HUMAN.test(text)) return 'клиент попросил человека';
  if (rules.onEscalation && RE_ESCALATION.test(text)) return 'эскалация (юр./претензия)';
  return null;
}

/* ---------- обработка входящего сообщения ---------- */
function onInbound(db, lead, text) {
  const offReason = autoOffCheck(db, lead, text);
  if (offReason) {
    lead.ai.enabled = false;
    lead.tags = [...new Set([...(lead.tags || []), 'нужен человек'])];
    lead.lastMsgAt = Date.now();
    lead.lastDir = 'in';
    screen(db, lead);
    pushEvent(db, { type: 'ai_off', leadId: lead.id, text: `${lead.name}: ИИ отключился сам — ${offReason}. Лид ждёт менеджера` });
    return { reply: null };
  }
  if (hasStopWord(db, text)) {
    lead.ai.enabled = false;
    lead.stage = 'lost';
    lead.tags = [...new Set([...(lead.tags || []), 'opt-out'])];
    pushEvent(db, { type: 'optout', leadId: lead.id, text: `${lead.name}: стоп-слово — ИИ отключён, лид закрыт (opt-out)` });
    return { reply: null };
  }
  lead.lastMsgAt = Date.now();
  lead.lastDir = 'in';
  lead.ai.silentSince = null;
  const before = AXES.filter(a => lead.quals[a]).length;
  screen(db, lead);
  const after = AXES.filter(a => lead.quals[a]).length;
  if (after > before) {
    pushEvent(db, { type: 'qual', leadId: lead.id, text: `${lead.name}: закрыто осей квалификации ${after} из 4` });
  }
  if (lead.stage === 'qualified' && !lead.summary) {
    lead.summary = buildSummary(db, lead);
    pushEvent(db, { type: 'qualified', leadId: lead.id, text: `${lead.name} квалифицирован ИИ — готов к передаче брокеру` });
  }
  let reply = null;
  if (lead.ai.enabled && db.settings.ai.autopilot && !['handover', 'viewing', 'deal', 'lost'].includes(lead.stage)) {
    reply = nextQuestion(db, lead);
  }
  return { reply };
}

function pushEvent(db, e) {
  const ev = Object.assign({ at: Date.now() }, e);
  db.events.unshift(ev);
  if (db.events.length > 300) db.events.length = 300;
  /* прокачка + честная A/B: квал атрибутируется герою, который реально вёл этого лида */
  if (e.type === 'qualified') {
    const lead = db.leads.find(l => l.id === e.leadId);
    const pid = (lead && lead.personaId) || ((db.settings.ai || {}).persona || {}).id;
    if (pid) {
      db.settings.ai.heroXP = db.settings.ai.heroXP || {}; db.settings.ai.heroXP[pid] = (db.settings.ai.heroXP[pid] || 0) + 1;
      const st = (db.settings.ai.personaStats = db.settings.ai.personaStats || {});
      st[pid] = st[pid] || { handled: 0, qualified: 0 };
      st[pid].qualified += 1;
    }
  }
  try { require('./engine').maybeInstantNotify(db, ev); } catch (_) {}
}

module.exports = { screen, onInbound, nextQuestion, buildSummary, pushEvent, AXES, extractBudget };
