/* Lumen CRM — LLM-слой квалификатора (Gemini Flash).
   Роль LLM: живой текст ответа + предложения по осям квалификации.
   Роль сервера: КЛАМП — предложенная ось принимается только если её
   цитата реально есть во входящих сообщениях клиента (модели не верим).
   Любая ошибка/таймаут → молчаливый откат на детерминированное ядро. */
/* Цепочка провайдеров (как Groq→Fireworks→Gemini в TargetPoint):
   Gemini Flash → OpenAI gpt-4o-mini; недоступен один — берёт следующий. */
const GEMINI_MODEL = 'gemini-2.0-flash';
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

async function callGeminiRaw(prompt, signal) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GKEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 500, responseMimeType: 'application/json' },
    }),
  });
  if (!r.ok) throw new Error('gemini http ' + r.status);
  const j = await r.json();
  const text = j.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('gemini empty');
  return JSON.parse(text);
}

async function callOpenAiRaw(prompt, signal) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OKEY}` },
    signal,
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    }),
  });
  if (!r.ok) throw new Error('openai http ' + r.status);
  const j = await r.json();
  const text = j.choices?.[0]?.message?.content;
  if (!text) throw new Error('openai empty');
  return JSON.parse(text);
}

async function callGemini(prompt, timeoutMs = 8000) {
  if (GKEY) {
    try { return await withTimeout((s) => callGeminiRaw(prompt, s), timeoutMs); }
    catch (e) { if (!OKEY) throw e; console.error('[llm] gemini недоступен (' + e.message + ') → openai'); }
  }
  if (!OKEY) throw new Error('нет ключей LLM');
  return withTimeout((s) => callOpenAiRaw(prompt, s), timeoutMs);
}

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
- Уже выяснено: ${['purpose', 'timeline', 'budget', 'type'].filter(a => q[a]).map(a => `${axisRu[a]}: ${q[a].value}`).join('; ') || 'ничего'}
- Ещё не выяснено: ${missing.map(a => axisRu[a]).join(', ') || 'всё выяснено — предложи передачу эксперту и удобное время созвона'}

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

async function reply(db, lead) {
  const history = db.messages
    .filter(m => m.leadId === lead.id)
    .slice(-12)
    .map(m => (m.dir === 'in' ? 'КЛИЕНТ: ' : 'ТЫ: ') + m.text)
    .join('\n');
  const out = await callGemini(buildPrompt(db, lead, history));
  if (!out || typeof out.reply !== 'string' || !out.reply.trim()) throw new Error('llm bad shape');
  return { text: out.reply.trim().slice(0, 600), axes: clampAxes(db, lead, out.axes) };
}

/* ИИ-сводка по лиду: вся хронология → 3-5 предложений для брокера */
async function summarize(db, lead) {
  const history = db.messages
    .filter(m => m.leadId === lead.id)
    .slice(-30)
    .map(m => (m.dir === 'in' ? 'КЛИЕНТ: ' : 'МЫ: ') + m.text)
    .join('\n');
  const notes = (lead.notes || []).slice(0, 5).map(n => '· ' + n.text).join('\n');
  const q = lead.quals;
  const prompt = `Ты — ассистент CRM агентства недвижимости. Составь сводку по лиду для брокера (3-5 коротких предложений, по-деловому, без воды): кто клиент, что хочет (цель/бюджет/тип/срок), ключевые договорённости и возражения, каким должен быть следующий шаг.

Данные: имя ${lead.name}, направление ${db.settings.geoNames[lead.geo] || lead.geo}, стадия ${lead.stage}.
Оси: ${['purpose', 'timeline', 'budget', 'type'].map(a => q[a] ? q[a].value : '—').join(' / ')}
Комментарии команды:\n${notes || '—'}
ПЕРЕПИСКА:\n${history || '—'}

Ответь строго JSON: {"summary": "текст сводки"}`;
  const out = await callGemini(prompt, 10000);
  if (!out || typeof out.summary !== 'string' || !out.summary.trim()) throw new Error('bad summary');
  return out.summary.trim().slice(0, 900);
}

module.exports = { available, reply, summarize, MODEL };
