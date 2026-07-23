/* Lumen CRM — LLM-слой квалификатора (Gemini Flash).
   Роль LLM: живой текст ответа + предложения по осям квалификации.
   Роль сервера: КЛАМП — предложенная ось принимается только если её
   цитата реально есть во входящих сообщениях клиента (модели не верим).
   Любая ошибка/таймаут → молчаливый откат на детерминированное ядро. */
/* Цепочка провайдеров (как Groq→Fireworks→Gemini в TargetPoint):
   Gemini Flash → OpenAI gpt-4o-mini; недоступен один — берёт следующий. */
const GEMINI_MODEL = 'gemini-2.5-flash-lite'; /* 2.0-flash снят Google 06.2026; lite — та же цена $0.10/$0.40 за 1М ток. */
const OPENAI_MODEL = 'gpt-4o-mini';
const GKEY = process.env.GEMINI_API_KEY || '';
const OKEY = process.env.OPENAI_API_KEY || '';
const MODEL = GKEY ? GEMINI_MODEL + ' → ' + OPENAI_MODEL : OPENAI_MODEL;

function available() { return !!(GKEY || OKEY); }

async function withTimeout(fn, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try { return await fn(ctl.signal); } finally { clearTimeout(timer); }
}

async function callGeminiRaw(prompt, signal, maxTokens = 500) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GKEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
    }),
  });
  if (!r.ok) throw new Error('gemini http ' + r.status);
  const j = await r.json();
  const text = j.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('gemini empty');
  return JSON.parse(text);
}

async function callOpenAiRaw(prompt, signal, maxTokens = 500) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OKEY}` },
    signal,
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }),
  });
  if (!r.ok) throw new Error('openai http ' + r.status);
  const j = await r.json();
  const text = j.choices?.[0]?.message?.content;
  if (!text) throw new Error('openai empty');
  return JSON.parse(text);
}

async function callGemini(prompt, timeoutMs = 8000, maxTokens = 500) {
  if (GKEY) {
    try { return await withTimeout((s) => callGeminiRaw(prompt, s, maxTokens), timeoutMs); }
    catch (e) { if (!OKEY) throw e; console.error('[llm] gemini недоступен (' + e.message + ') → openai'); }
  }
  if (!OKEY) throw new Error('нет ключей LLM');
  return withTimeout((s) => callOpenAiRaw(prompt, s, maxTokens), timeoutMs);
}

const playbook = require('./playbook');

function buildPrompt(db, lead, history) {
  const g = db.settings.geoNames[lead.geo] || lead.geo;
  const crit = db.settings.criteria[lead.geo] || {};
  const q = lead.quals;
  const missing = ['purpose', 'timeline', 'budget', 'type'].filter(a => !q[a]);
  const axisRu = { purpose: 'цель покупки', timeline: 'срок покупки', budget: 'бюджет', type: 'тип объекта' };
  return `Ты — первая линия квалификации агентства недвижимости «${db.settings.agency.name}» (направление: ${g}). Ты ведёшь WhatsApp-диалог с лидом по имени ${lead.name.split(' ')[0]}.

РЕГЛАМЕНТ:
- Минимальный бюджет направления: ${crit.budgetMin} ${crit.currency}. Если клиент назвал бюджет ниже — НЕ отказывай, предложи down-sell: ${crit.downsell}
- Заметки: ${crit.notes || '—'}
- Тон: живой человеческий, коротко (1-3 предложения), без канцелярита, без эмодзи, один вопрос за раз.
ЖЁСТКИЕ ЗАПРЕТЫ (нарушение = брак):
- НЕ называй конкретные цены, доходности, скидки и сроки сдачи, которых НЕТ в этом промпте или в словах клиента. Нет данных — скажи «уточню у эксперта и вернусь с точной цифрой».
- НЕ обещай («гарантирую», «точно вырастет»), не давай юридических/налоговых советов — только «этот вопрос разберёт эксперт на созвоне».
- НЕ вставляй ссылки, плейсхолдеры в скобках, названия несуществующих объектов.
- НЕ упоминай, что ты ИИ/бот/ассистент. НЕ извиняйся дважды. НЕ повторяй уже отправленное сообщение.
- Уже выяснено: ${['purpose', 'timeline', 'budget', 'type'].filter(a => q[a]).map(a => `${axisRu[a]}: ${q[a].value}`).join('; ') || 'ничего'}
- Ещё не выяснено: ${missing.map(a => axisRu[a]).join(', ') || 'всё выяснено — предложи передачу эксперту и удобное время созвона'}

ПРИЁМЫ ПРОДАЖ (используй уместно, не цитируй дословно):
${playbook.forContext(lead, 4 - missing.length).map(p => '- ' + p.title + ': ' + p.tip).join('\n')}

ДИАЛОГ (последние сообщения):
${history}

Ответь строго JSON-объектом:
{"reply": "текст следующего сообщения клиенту на его языке",
 "axes": {"purpose|timeline|budget|type": {"value": "краткое значение", "quote": "ДОСЛОВНАЯ цитата из сообщения КЛИЕНТА, подтверждающая значение"}}}
В "axes" включай ТОЛЬКО оси, которые клиент явно подтвердил своими словами в диалоге. Если таких нет — "axes": {}.`;
}

/* Клامп: цитата обязана реально встречаться во входящих сообщениях */
function clampAxes(db, lead, axes) {
  const inboundText = db.messages
    .filter(m => m.leadId === lead.id && m.dir === 'in')
    .map(m => m.text.toLowerCase()).join('\n');
  const ok = {};
  for (const [axis, v] of Object.entries(axes || {})) {
    if (!['purpose', 'timeline', 'budget', 'type'].includes(axis)) continue;
    if (!v || !v.value || !v.quote) continue;
    const quote = String(v.quote).toLowerCase().trim();
    if (quote.length >= 4 && inboundText.includes(quote)) {
      ok[axis] = { value: String(v.value).slice(0, 80), quote: String(v.quote).slice(0, 120) };
    }
  }
  return ok;
}

/* стоп-триггеры качества: бракованный ответ LLM не уходит клиенту */
function validateReply(db, lead, text, promptContext) {
  const t = String(text || '').trim();
  if (t.length < 5) return 'пустой ответ';
  if (t.length > 650) return 'слишком длинный';
  if (/[{}\[\]]/.test(t)) return 'плейсхолдеры в тексте';
  if (/https?:\/\//i.test(t)) return 'ссылка в ответе';
  if (/языков(ая|ой) модель|искусственн\w+ интеллект\w*|как ии\b|i'?m an ai|language model|чат-?бот/i.test(t)) return 'самораскрытие ИИ';
  /* язык: клиент пишет кириллицей → ответ обязан быть кириллическим (и наоборот) */
  const lastIn = [...db.messages].reverse().find(m => m.leadId === lead.id && m.dir === 'in');
  if (lastIn) {
    const inCyr = /[а-яё]/i.test(lastIn.text);
    const outCyr = /[а-яё]/i.test(t);
    if (inCyr !== outCyr && lastIn.text.length > 6) return 'язык ответа не совпадает с языком клиента';
  }
  /* антигаллюцинация цифр: суммы/проценты в ответе должны существовать в контексте */
  const known = (promptContext || '') + ' ' + db.messages.filter(m => m.leadId === lead.id).map(m => m.text).join(' ');
  const knownNums = new Set((known.match(/\d[\d\s.,]{2,}/g) || []).map(x => x.replace(/[^\d]/g, '')));
  for (const m2 of t.matchAll(/(\d[\d\s.,]{2,})\s*(\$|€|aed|тыс|k\b|%|процент)/gi)) {
    const num = m2[1].replace(/[^\d]/g, '');
    if (num.length >= 2 && !knownNums.has(num)) return 'цифра не из контекста: ' + m2[0].trim();
  }
  /* зацикливание: дубликат недавнего исходящего */
  const lastOuts = db.messages.filter(m => m.leadId === lead.id && m.dir === 'out').slice(-3);
  const norm = (x) => x.toLowerCase().replace(/\s+/g, ' ').trim();
  if (lastOuts.some(m2 => norm(m2.text) === norm(t))) return 'дубликат предыдущего сообщения';
  return null;
}

async function reply(db, lead) {
  const history = db.messages
    .filter(m => m.leadId === lead.id)
    .slice(-12)
    .map(m => (m.dir === 'in' ? 'КЛИЕНТ: ' : 'ТЫ: ') + m.text)
    .join('\n');
  const prompt = buildPrompt(db, lead, history);
  const out = await callGemini(prompt);
  if (!out || typeof out.reply !== 'string' || !out.reply.trim()) throw new Error('llm bad shape');
  const text = out.reply.trim().slice(0, 650);
  const bad = validateReply(db, lead, text, prompt);
  if (bad) throw new Error('брак LLM: ' + bad);
  return { text, axes: clampAxes(db, lead, out.axes) };
}

/* ИИ-сводка по лиду: вся хронология → 3-5 предложений для брокера */
async function summarize(db, lead) {
  const history = db.messages
    .filter(m => m.leadId === lead.id)
    .slice(-30)
    .map(m => (m.dir === 'in' ? 'КЛИЕНТ: ' : 'МЫ: ') + m.text)
    .join('\n');
  const notes = (lead.notes || []).slice(0, 5).map(n => '· ' + n.text).join('\n');
  const calls = (lead.transcripts || []).slice(-2).map(t => `[${t.label}]: ` + t.text.slice(0, 1500)).join('\n');
  const q = lead.quals;
  const prompt = `Ты — ассистент CRM агентства недвижимости. Составь сводку по лиду для брокера (3-5 коротких предложений, по-деловому, без воды): кто клиент, что хочет (цель/бюджет/тип/срок), ключевые договорённости и возражения, каким должен быть следующий шаг.

Данные: имя ${lead.name}, направление ${db.settings.geoNames[lead.geo] || lead.geo}, стадия ${lead.stage}.
Оси: ${['purpose', 'timeline', 'budget', 'type'].map(a => q[a] ? q[a].value : '—').join(' / ')}
Комментарии команды:\n${notes || '—'}
ТРАНСКРИПТЫ ЗВОНКОВ/ZOOM:\n${calls || '—'}
ПЕРЕПИСКА:\n${history || '—'}

Ответь строго JSON: {"summary": "текст сводки"}`;
  const out = await callGemini(prompt, 10000);
  if (!out || typeof out.summary !== 'string' || !out.summary.trim()) throw new Error('bad summary');
  return out.summary.trim().slice(0, 900);
}

/* транскрибация звонка/Zoom: OpenAI Whisper ($0.006/мин) */
async function transcribe(buf, filename) {
  if (!OKEY) throw new Error('нет OPENAI_API_KEY для Whisper');
  const fd = new FormData();
  fd.append('file', new Blob([buf]), filename || 'call.m4a');
  fd.append('model', 'whisper-1');
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OKEY}` },
    body: fd,
  });
  const j = await r.json();
  if (!r.ok) throw new Error('whisper ' + r.status + ': ' + (j.error?.message || ''));
  return (j.text || '').trim();
}

/* ИИ-переписывание произвольного текста (кнопки «✦» в конструкторе и в приложении) */
const REWRITE_MODES = {
  improve: 'Улучши текст: живой человеческий язык, без канцелярита и рекламных клише, сохрани смысл и длину примерно как была.',
  shorter: 'Сократи текст в 1.5-2 раза, оставь только суть. Без потери ключевых фактов и цифр.',
  longer: 'Разверни текст подробнее (примерно в 1.5 раза длиннее), добавь конкретики, но НЕ выдумывай факты и цифры, которых нет в исходнике.',
  selling: 'Перепиши продающе, но без агрессии и клише («уникальная возможность», «не упустите»). Тон уверенного брокера: конкретика, выгода, лёгкий призыв.',
  formal: 'Перепиши официально-деловым тоном (для документа/письма). Без эмодзи и разговорных оборотов.',
  friendly: 'Перепиши тёплым дружеским тоном, как пишет живой человек в мессенджере. Коротко, без пафоса.',
};
async function rewrite(text, mode, ctx) {
  const task = REWRITE_MODES[mode] || REWRITE_MODES.improve;
  const prompt = `Ты — редактор текстов агентства недвижимости. ${task}
Пиши на том же языке, что и исходный текст. НЕ добавляй кавычки вокруг результата, НЕ комментируй.
${ctx ? 'Контекст (для понимания, в ответ не включать): ' + String(ctx).slice(0, 600) + '\n' : ''}
ИСХОДНЫЙ ТЕКСТ:
${String(text).slice(0, 3000)}

Ответь строго JSON: {"text": "переписанный текст"}`;
  const out = await callGemini(prompt, 15000, 1200);
  if (!out || typeof out.text !== 'string' || !out.text.trim()) throw new Error('bad rewrite');
  const res = out.text.trim().slice(0, 4000);
  if (/\{[a-z_]+\}|как (ИИ|нейросеть|модель)/i.test(res)) throw new Error('брак rewrite');
  return res;
}

/* ИИ-сборка текстов подборки: интро + крючки/аргументы по каждому объекту из контекста лида */
async function composeCollection(db, c, props, lead) {
  const q = lead ? lead.quals : null;
  const history = lead ? db.messages.filter(m => m.leadId === lead.id).slice(-14).map(m => (m.dir === 'in' ? 'КЛИЕНТ: ' : 'МЫ: ') + m.text).join('\n') : '';
  const propLines = props.map((p, i) => `${i + 1}. id=${p.id} «${p.name}» — ${p.area || ''}, тип ${p.type || '—'}, от ${p.priceFrom || '?'} ${p.currency || 'USD'}, сдача ${p.handover || '—'}${p.roi ? ', доходность ' + p.roi : ''}${p.description ? '. ' + String(p.description).slice(0, 200) : ''}`).join('\n');
  const prompt = `Ты — опытный брокер элитной недвижимости. Собери тексты для персональной веб-подборки объектов.
Пиши как живой русскоязычный брокер: конкретно, тепло, без рекламных клише и канцелярита. Цифры бери ТОЛЬКО из данных ниже, ничего не выдумывай.

КЛИЕНТ: ${lead ? `${lead.name}, направление ${db.settings.geoNames[lead.geo] || lead.geo || '—'}. Оси: цель=${q.purpose?.value || '—'}, срок=${q.timeline?.value || '—'}, бюджет=${q.budget?.value || '—'}, тип=${q.type?.value || '—'}` : 'общая подборка, клиент не указан'}
${history ? 'ПЕРЕПИСКА (важно: учти пожелания):\n' + history : ''}
ОБЪЕКТЫ:
${propLines}

Верни строго JSON:
{"title":"заголовок обложки до 60 символов, персональный, без слова 'подборка' дважды",
 "intro":"вступление 2-4 предложения от первого лица (я подобрал / посмотрите), обращение по имени если есть",
 "props":[{"id":"id объекта","hook":"продающий заголовок-крючок до 80 символов (выгода, не название ЖК)","why":["аргумент 1 почему подходит именно этому клиенту","аргумент 2","аргумент 3"]}]}`;
  const out = await callGemini(prompt, 30000, 3000);
  if (!out || !Array.isArray(out.props)) throw new Error('bad compose');
  return {
    title: String(out.title || '').slice(0, 90),
    intro: String(out.intro || '').slice(0, 1200),
    props: out.props.filter(x => x && x.id).map(x => ({
      id: String(x.id),
      hook: String(x.hook || '').slice(0, 140),
      why: Array.isArray(x.why) ? x.why.slice(0, 4).map(w => String(w).slice(0, 260)) : [],
    })),
  };
}

module.exports = { available, reply, summarize, transcribe, validateReply, rewrite, composeCollection, MODEL };
