/* Lumen CRM — LLM-слой квалификатора (Gemini Flash).
   Роль LLM: живой текст ответа + предложения по осям квалификации.
   Роль сервера: КЛАМП — предложенная ось принимается только если её
   цитата реально есть во входящих сообщениях клиента (модели не верим).
   Любая ошибка/таймаут → молчаливый откат на детерминированное ядро. */
/* Цепочка провайдеров (как Groq→Fireworks→Gemini в TargetPoint):
   Gemini Flash → OpenAI gpt-4o-mini; недоступен один — берёт следующий. */
const GEMINI_MODEL = 'gemini-flash-lite-latest'; /* 2.0-flash снят Google 06.2026; lite — та же цена $0.10/$0.40 за 1М ток. */
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

/* ИИ-герои квалификатора: ползунки → конкретные инструкции промпта; авто-подбор по гео */
const HEROES = {
  maria: { name: 'Мария', role: 'тёплый подбор', tone: 'тёплая, заботливая, эмпатичная; ведёт мягко и по-человечески, без давления', axes: { soft: 95, fast: 70, expert: 75, push: 40 } },
  artur: { name: 'Артур', role: 'эксперт-аналитик', tone: 'уверенный, по делу; оперирует логикой и фактами, вызывает доверие экспертностью', axes: { soft: 55, fast: 75, expert: 95, push: 65 } },
  sofia: { name: 'София', role: 'люкс-консультант', tone: 'элегантная, премиальная, безупречный этикет; ненавязчивая, уважительная', axes: { soft: 80, fast: 60, expert: 85, push: 45 } },
  dmitry: { name: 'Дмитрий', role: 'скоростной дожим', tone: 'энергичный, динамичный; мягко создаёт срочность, быстро ведёт к следующему шагу', axes: { soft: 50, fast: 95, expert: 65, push: 90 } },
};
function axisPrompt(a) {
  if (!a) return '';
  const L = [];
  if (a.soft >= 70) L.push('очень мягко и бережно, без давления'); else if (a.soft <= 45) L.push('прямо и по делу, без лишних смягчений');
  if (a.fast >= 70) L.push('коротко и динамично, быстро подводи к следующему шагу'); else if (a.fast <= 45) L.push('спокойно и вдумчиво, не тороп клиента');
  if (a.expert >= 70) L.push('опирайся на факты и экспертизу (цифры — только реальные, из промпта или слов клиента)');
  if (a.push >= 70) L.push('уверенно подталкивай к следующему шагу, создавай лёгкое ощущение своевременности'); else if (a.push <= 40) L.push('без напора — дай клиенту вести в своём темпе');
  return L.length ? ' Манера (держи во всех ответах): ' + L.join('; ') + '.' : '';
}
function pickPersona(db, lead) {
  const ai = db.settings.ai || {};
  if (ai.personaAuto && lead && ai.personaByGeo && HEROES[ai.personaByGeo[lead.geo]]) { const id = ai.personaByGeo[lead.geo]; return Object.assign({ id }, HEROES[id]); }
  const pid = (ai.persona || {}).id;
  if (pid && HEROES[pid]) return Object.assign({ id: pid }, HEROES[pid]);
  if (ai.persona && ai.persona.name) return Object.assign({ id: pid || 'custom', axes: null }, ai.persona);
  return null;
}

/* ── ЖИВОЙ ПОЧЕРК + МЕНТАЛИТЕТ ─────────────────────────────────────────────
   Чистим типичные «следы ИИ» (длинное тире), даём модели правила живой речи и
   адаптируем тон под менталитет страны клиента (по коду телефона / языку). */
function humanize(s) {
  if (!s) return s;
  let t = String(s);
  t = t.replace(/^[ \t]*[—–][ \t]+/gm, '- ');                          /* СНАЧАЛА маркер списка в начале строки → «- » */
  t = t.replace(/(\d)\s*[—–]\s*(\d)/g, '$1-$2');                       /* числовой диапазон «2—3» → «2-3» (дефис) */
  t = t.replace(/[ \t]+[—–][ \t]+/g, ', ');                            /* инлайн «цена — $400k» → «цена, $400k» (тире = AI-tell) */
  t = t.replace(/([A-Za-zА-Яа-яЁё])[—–]([A-Za-zА-Яа-яЁё])/g, '$1, $2');
  t = t.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+([,.!?;:])/g, '$1');  /* лишние пробелы */
  t = t.replace(/\n{3,}/g, '\n\n');                                     /* не больше пустой строки между абзацами */
  return t.trim();
}
const LIVE_STYLE = `ЖИВОЙ ПОЧЕРК (обязательно, иначе видно что писал бот):
- НЕ используй длинное тире «—»/«–». Ставь запятую, точку или начни новое предложение.
- Не строй симметричные конструкции («не только…, но и…», «это не X, это Y») — живая речь неровная.
- Абзацы делай ПО СМЫСЛУ: если мыслей несколько, раздели их пустой строкой; но не дроби каждую фразу.
- Пиши как человек в мессенджере: просто, тепло, по-разному по длине, без канцелярита и рекламных клише.`;
const MENTALITY = {
  ru: 'прямота и конкретика, но с теплом; ценят экспертизу и цифры, не терпят «впаривание» и воду; уместен лёгкий юмор',
  uk: 'тепло и по-человечески, конкретика, без официоза',
  en: 'дружелюбно, вежливо, без давления; ценят прозрачность, факты и «no pressure»',
  de: 'точность и факты, без пафоса и преувеличений; ценят структуру, гарантии, юридическую чистоту, пунктуальность',
  fr: 'вежливо и с достоинством, не спеша; сначала контакт и вкус, потом цифры; важен статус объекта',
  it: 'тепло, по-семейному, эмоционально; на старте отношения важнее цифр',
  es: 'дружелюбно и неформально, с эмоцией; доверие вперёд, без сухости',
  pt: 'тепло и неформально, отношения важны, без спешки',
  ar: 'уважительно и статусно, с почтением; важны доверие, репутация, конфиденциальность; не торопить с деньгами',
  tr: 'тепло и уважительно, ценят личный контакт и возможность поторговаться; уверенно, но без давления',
  hi: 'вежливо и подробно, ценят выгоду и торг; отношения и доверие важны',
  zh: 'по делу, с уважением к статусу и выгоде; конкретика, ROI, надёжность, без лишних эмоций',
  id: 'мягко, вежливо, дружелюбно, без давления и резкости',
  pl: 'вежливо и по делу, ценят честность и конкретику',
};
const DIAL = [['+385', 'Хорватия', 'hr'], ['+386', 'Словения', 'sl'], ['+381', 'Сербия', 'sr'], ['+380', 'Украина', 'uk'], ['+375', 'Беларусь', 'ru'], ['+7', 'Россия/Казахстан', 'ru'], ['+49', 'Германия', 'de'], ['+43', 'Австрия', 'de'], ['+41', 'Швейцария', 'de'], ['+33', 'Франция', 'fr'], ['+39', 'Италия', 'it'], ['+34', 'Испания', 'es'], ['+351', 'Португалия', 'pt'], ['+44', 'Великобритания', 'en'], ['+353', 'Ирландия', 'en'], ['+1', 'США/Канада', 'en'], ['+971', 'ОАЭ', 'ar'], ['+966', 'Саудовская Аравия', 'ar'], ['+974', 'Катар', 'ar'], ['+965', 'Кувейт', 'ar'], ['+973', 'Бахрейн', 'ar'], ['+968', 'Оман', 'ar'], ['+972', 'Израиль', 'he'], ['+90', 'Турция', 'tr'], ['+91', 'Индия', 'hi'], ['+86', 'Китай', 'zh'], ['+62', 'Индонезия', 'id'], ['+48', 'Польша', 'pl'], ['+420', 'Чехия', 'cs'], ['+994', 'Азербайджан', 'az'], ['+998', 'Узбекистан', 'uz'], ['+995', 'Грузия', 'ka']];
function dialCountry(phone) {
  const p = String(phone || '').replace(/[^\d+]/g, ''); if (!p) return null;
  let best = null; for (const d of DIAL) { if (p.startsWith(d[0]) && (!best || d[0].length > best[0].length)) best = d; }
  return best ? { country: best[1], lang: best[2] } : null;
}
function mentalityBlock(lead) {
  const dc = dialCountry(lead && lead.phone) || {};
  const key = MENTALITY[dc.lang] ? dc.lang : (MENTALITY[lead && lead.lang] ? lead.lang : 'ru');
  const anchor = MENTALITY[key] || MENTALITY.ru;
  return `МЕНТАЛИТЕТ КЛИЕНТА${dc.country ? ` (${dc.country})` : ''}: ${anchor}. Подстрой тон, темп и дистанцию под культурный код этой страны — естественно, без стереотипов и без упоминания национальности.`;
}
/* банк возражений из академии Синенко: если последнее сообщение клиента похоже на возражение — подсказать эталонный ответ */
function objectionHint(db, lead) {
  try {
    const academy = require('./academy');
    if (!academy.forObjection) return '';
    const lastIn = [...((db && db.messages) || [])].reverse().find(m => m.leadId === lead.id && m.dir === 'in');
    if (!lastIn) return '';
    const hits = academy.forObjection(lastIn.text);
    if (!hits || !hits.length) return '';
    return 'ВОЗРАЖЕНИЕ КЛИЕНТА — как отвечают лучшие (методология Синенко; адаптируй под живой тон, НЕ цитируй дословно):\n' + hits.slice(0, 2).map(c => '- «' + (c.objection || c.title) + '» → ' + (c.response || c.tip || '')).join('\n');
  } catch (_) { return ''; }
}
function buildPrompt(db, lead, history) {
  const g = db.settings.geoNames[lead.geo] || lead.geo;
  const allGeos = (db.settings.agency.geos || []).map(x => db.settings.geoNames[x] || x).join(', ');
  const crit = db.settings.criteria[lead.geo] || {};
  const q = lead.quals;
  const missing = ['purpose', 'timeline', 'budget', 'type'].filter(a => !q[a]);
  const axisRu = { purpose: 'цель покупки', timeline: 'срок покупки', budget: 'бюджет', type: 'тип объекта' };
  const persona = pickPersona(db, lead) || {};
  const pname = persona.name || '';
  const identity = pname
    ? `Тебя зовут ${pname}, ты ${persona.role || 'специалист по подбору'} агентства недвижимости «${db.settings.agency.name}». Общайся от первого лица, живым человеческим языком, как реальный сотрудник — клиент должен воспринимать тебя как живого менеджера. Если уместно представиться — представься как ${pname}.${persona.tone ? ` Твоя манера общения: ${persona.tone}.` : ''}${axisPrompt(persona.axes)}`
    : `Ты — первая линия квалификации агентства недвижимости «${db.settings.agency.name}».`;
  return `${identity} Агентство работает по направлениям: ${allGeos}. Сейчас клиент интересуется направлением «${g}» — если он назовёт другое из наших направлений, спокойно работай с ним и НЕ говори, что вы только по «${g}». Ты ведёшь WhatsApp-диалог с лидом по имени ${lead.name.split(' ')[0]}.

РЕГЛАМЕНТ:
- Минимальный бюджет направления: ${crit.budgetMin} ${crit.currency}. Если клиент назвал бюджет ниже — НЕ отказывай, предложи down-sell: ${crit.downsell}
- Заметки: ${crit.notes || '—'}
- Тон: живой человеческий, коротко (1-3 предложения), без канцелярита, без эмодзи, один вопрос за раз.
${mentalityBlock(lead)}
${LIVE_STYLE}
${objectionHint(db, lead)}
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
  const text = humanize(out.reply.trim()).slice(0, 650);
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

/* Причёсывание заметки в аккуратную структуру (стиль заметок iPhone): заголовок, буллеты,
   жирные ключевые слова, чек-боксы для действий. Возвращает лёгкий markdown, который фронт рендерит красиво. */
async function tidyNote(text, ctx) {
  const src = String(text || '').trim();
  if (!src) return '';
  const prompt = `Ты приводишь рабочую заметку в аккуратный, структурированный вид — как красивая заметка в iPhone Notes. Сохрани ВЕСЬ смысл и факты, ничего не выдумывай и не выкидывай важное. Пиши на языке исходной заметки.

Оформи в лёгком markdown:
- Если есть явная тема — первой строкой короткий заголовок «## Заголовок» (без точки). Заголовок бери СТРОГО из содержания заметки, НЕ придумывай город/имя/факты, которых в тексте нет.
- Разбей на пункты списком «- ».
- Логические группы разделяй подзаголовком «### Подзаголовок» (только если групп реально несколько).
- Ключевые слова, имена, суммы, даты, дедлайны выделяй **жирным**.
- Конкретные действия/поручения оформляй чек-боксом «- [ ] действие».
- Не добавляй воды, вступлений «вот ваша заметка», комментариев о себе. Только сам структурированный текст.
${ctx ? 'Контекст (для понимания, в ответ не включать): ' + String(ctx).slice(0, 300) + '\n' : ''}
ИСХОДНАЯ ЗАМЕТКА:
${src.slice(0, 4000)}

Ответь строго JSON: {"text":"структурированный markdown"}`;
  const out = await callGemini(prompt, 18000, 1600);
  if (!out || typeof out.text !== 'string' || !out.text.trim()) throw new Error('bad tidy');
  const r = out.text.trim().slice(0, 6000);
  if (/как (ИИ|нейросеть|модель)|вот (ваша|структ)/i.test(r)) throw new Error('брак tidy');
  return r;
}

/* HR-скрининг кандидата: по ответам формы оценивает пригодность на роль брокера, даёт саммари + вердикт + флаги */
async function screenCandidate(cand, hr) {
  const ans = Object.entries(cand.answers || {}).map(([k, v]) => `${k}: ${String(v).slice(0, 400)}`).join('\n');
  const vac = (hr && hr.vacancy) || {};
  const prompt = `Ты — HR агентства зарубежной недвижимости. Оцени кандидата на роль «${String(vac.title || 'брокер').slice(0, 80)}» по его анкете. Роль: работа с тёплыми лидами из рекламы, переписка и звонки, продажи недвижимости за рубежом.
Оцени пригодность 0-100 (опыт продаж/недвижимости, коммуникабельность по тексту, мотивация, адекватность), дай короткое саммари для рекрутёра, вердикт-ярлык и флаги-на-что-обратить-внимание (красные и зелёные).

АНКЕТА КАНДИДАТА:
${ans || '(пусто)'}

Ответь строго JSON:
{"score":0-100,
 "verdict":"1 короткая фраза: перспективный / средний / слабый / нужен звонок",
 "summary":"2-3 предложения рекрутёру: кто это и стоит ли звать на интервью",
 "green":["сильные стороны 1-3"],
 "red":["риски/пробелы 0-3"],
 "nextq":["2-3 вопроса, которые задать на интервью"]}`;
  const out = await callGemini(prompt, 16000, 1000);
  if (!out || typeof out.score === 'undefined') throw new Error('bad screen');
  const arr = (a, n) => Array.isArray(a) ? a.slice(0, n).map(x => String(x).slice(0, 200)).filter(Boolean) : [];
  return {
    score: Math.max(0, Math.min(100, parseInt(out.score) || 0)),
    verdict: String(out.verdict || '').slice(0, 60),
    summary: humanize(String(out.summary || '')).slice(0, 500),
    green: arr(out.green, 3), red: arr(out.red, 3), nextq: arr(out.nextq, 3),
    at: Date.now(),
  };
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

/* ИИ первое касание: разбор лида + готовое персональное сообщение (+ короткий анализ) */
async function composeFirstTouch(db, lead, draft, agencyName) {
  const geoName = (db.settings.geoNames || {})[lead.geo] || lead.geo || '';
  const ads = lead.ads || {};
  const adName = ads.adName || '';
  /* ДЕРЕВО КРЕАТИВОВ: по объявлению, на которое лид оставил заявку, тянем сильные стороны проекта + сам креатив (видео/картинку) */
  const adRec = ads.adId ? (db.ads || []).find(a => String(a.adId) === String(ads.adId)) : null;
  const adPoints = (adRec && Array.isArray(adRec.points) && adRec.points.length) ? adRec.points : (Array.isArray(ads.points) ? ads.points : []);
  const adMedia = (adRec && adRec.media && adRec.media.url) ? adRec.media
    : (lead.creativeUrl ? { type: /\.(mp4|webm|mov)(\?|$)/i.test(lead.creativeUrl) ? 'video' : 'image', url: lead.creativeUrl } : null);
  const LANG = { ru: 'русском', en: 'английском', es: 'испанском', ar: 'арабском', id: 'индонезийском', de: 'немецком', fr: 'французском', it: 'итальянском', tr: 'турецком', pt: 'португальском' }[lead.lang] || 'русском';
  /* полезная инфа из лид-формы/квалификации/кастомных полей — чтобы зацепить лично */
  const qualLines = [];
  const AXN = { purpose: 'цель', timeline: 'срок', budget: 'бюджет', type: 'тип объекта' };
  for (const a of Object.keys(AXN)) { const q = (lead.quals || {})[a]; if (q && q.value) qualLines.push(`${AXN[a]}: ${q.value}${q.quote ? ' («' + String(q.quote).slice(0, 120) + '»)' : ''}`); }
  const custom = lead.custom && typeof lead.custom === 'object' ? Object.entries(lead.custom).filter(([, v]) => v).map(([k, v]) => `${k}: ${String(v).slice(0, 120)}`).slice(0, 8) : [];
  const notes = (lead.notes || []).map(n => String(n.text || '').slice(0, 160)).slice(0, 3);
  const ctx = [
    `имя: ${lead.name || '—'}`,
    `направление: ${geoName}`,
    adName ? `объявление/проект, по которому оставил заявку: «${adName}»` : '',
    ads.adsetName ? `аудитория объявления: ${ads.adsetName}` : '',
    ads.campaignName ? `кампания: ${ads.campaignName}` : '',
    lead.source ? `источник: ${lead.source}` : '',
    qualLines.length ? `из лид-формы/квалификации: ${qualLines.join('; ')}` : '',
    custom.length ? `доп. поля лид-формы: ${custom.join('; ')}` : '',
    notes.length ? `заметки менеджера: ${notes.join(' | ')}` : '',
  ].filter(Boolean).join('\n');
  const prompt = `Ты — сильнейший брокер зарубежной недвижимости в агентстве «${String(agencyName || 'агентство').slice(0, 80)}». Задача — ПЕРВОЕ КАСАНИЕ клиенту в WhatsApp, которое почти гарантированно вытащит его на диалог.

СТРУКТУРА ПЕРВОГО КАСАНИЯ (человек только что оставил заявку на конкретный проект из рекламы):
1. Признай выбор: коротко и искренне подтверди, что проект/объявление, по которому он оставил заявку, — сильный выбор (без пафоса, по-человечески).
2. Дай 2-3 фразы, ПОЧЕМУ этот проект интересен${adPoints.length ? ' — опирайся на реальные сильные стороны ниже, вплети их естественно, не списком' : ' — по фишке из названия объявления/района, без выдуманных цифр'}.
3. Задай ОДИН наводящий вопрос, привязанный к проекту, на который легко ответить одним словом/«да-нет» — цель просто получить любой ответ и завязать диалог (напр. «подобрать вам лучшие варианты в этой вилке?»).
4. Используй инфу из лид-формы (цель/бюджет/срок) естественно, будто помнишь клиента, НЕ вываливай списком.
5. Тон — живой человек на ${LANG} языке: коротко (2-4 предложения), тепло, уверенно, без канцелярита, без клише и «уникальных предложений». Эмодзи — максимум один.
${adPoints.length ? 'СИЛЬНЫЕ СТОРОНЫ ПРОЕКТА (из дерева креативов, вплети 2-3 самые релевантные):\n' + adPoints.slice(0, 5).map(x => '- ' + String(x).slice(0, 160)).join('\n') : ''}
${mentalityBlock(lead)}
${LIVE_STYLE}

ДАННЫЕ ЛИДА:
${ctx}

${draft ? 'ЧЕРНОВИК МЕНЕДЖЕРА (улучши, сохрани смысл и голос):\n' + String(draft).slice(0, 800) : 'Черновика нет — напиши с нуля.'}

Верни строго JSON:
{"message":"главный вариант первого сообщения (обращение по имени, если есть; язык = ${LANG}; без плейсхолдеров в фигурных скобках)",
 "variantB":"альтернативный вариант с другим заходом (другой крючок/вопрос), тоже сильный",
 "hook":"на чём построена персонализация — 3-6 слов (напр.: «проект JVC + вопрос про рассрочку»)",
 "analysis":"1-2 предложения менеджеру: что за лид и на что давить"}`;
  const out = await callGemini(prompt, 20000, 1100);
  if (!out || typeof out.message !== 'string' || !out.message.trim()) throw new Error('bad first-touch');
  const clean = (s) => { s = humanize(String(s || '').trim()).slice(0, 900); return /\{[a-z_]+\}/i.test(s) ? '' : s; };
  const msg = clean(out.message);
  if (!msg) throw new Error('брак: плейсхолдер в тексте');
  return { message: msg, variantB: clean(out.variantB), hook: String(out.hook || '').slice(0, 80), analysis: String(out.analysis || '').slice(0, 400), media: adMedia || null };
}

/* ИИ-заполнение блока «Об агентстве» для профиля/обложек подборок */
async function composeAgencyAbout(name, geos) {
  const prompt = `Ты — маркетолог агентства недвижимости «${String(name || 'наше агентство').slice(0, 80)}». Направления работы: ${(Array.isArray(geos) ? geos.join(', ') : '') || 'зарубежная недвижимость'}.
Напиши тексты для страниц «Привет» и «Почему мы» в персональных подборках клиентам. Живой человеческий язык, без канцелярита и рекламных клише («уникальная возможность», «команда профессионалов»). Конкретика и польза для клиента.
Верни строго JSON:
{"intro":"1-2 предложения от лица менеджера: кто мы и чем полезны (идёт после «Меня зовут …»)",
 "bullets":["4-5 конкретных фактов об агентстве (опыт, объекты, сопровождение сделки, юрподдержка) — короткие строки"],
 "whyUs":["3-4 причины выбрать нас, глазами клиента — короткие строки"],
 "freeNote":"1 короткая фраза, что подбор и консультация бесплатны и ни к чему не обязывают"}`;
  const out = await callGemini(prompt, 20000, 1500);
  if (!out || typeof out.intro !== 'string') throw new Error('bad about');
  const arr = (a) => Array.isArray(a) ? a.slice(0, 6).map(x => String(x).slice(0, 200)).filter(Boolean) : [];
  return { intro: String(out.intro || '').slice(0, 600), bullets: arr(out.bullets), whyUs: arr(out.whyUs), freeNote: String(out.freeNote || '').slice(0, 200) };
}

/* ИИ-генерация картинок для конструктора подборок (OpenAI gpt-image-1).
   Возвращает Buffer PNG. Стоимость ~$0.02–0.07/шт (medium 1536×1024). */
async function generateImage(prompt, opts = {}) {
  if (!OKEY) throw new Error('нет OPENAI_API_KEY для генерации картинок');
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OKEY}` },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: String(prompt).slice(0, 3200),
      size: opts.size || '1536x1024',
      quality: opts.quality || 'medium',
      ...(opts.background ? { background: opts.background } : {}),
      ...(opts.output_format ? { output_format: opts.output_format } : {}),
      n: 1,
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('image ' + r.status + ': ' + (j.error?.message || ''));
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new Error('image empty');
  return Buffer.from(b64, 'base64');
}

/* ═══════════════ КАРТА ЖЕЛАНИЙ — мастер-стиль стикеров (единая арт-дирекшн) ═══════════════
   Меняется только объект; арт-дирекшн, паста-бордер, тени, грейдинг, типографика — постоянны.
   Слой 1: structureVisionSticker() — ИИ определяет ТОЧНУЮ модель + арт-директорское решение о тексте.
   Слой 2: masterStickerPrompt() — собирает мастер-промпт с подставленным объектом и типографикой. */
const MB_TEXT_MODES = { auto: 'Авто', none: 'Без текста', handwritten: 'От руки', editorial: 'Издательский', goal: 'Цель', mixed: 'Смешанный' };

async function structureVisionSticker(input, forcedMode = 'auto') {
  const raw = String(input || '').slice(0, 300).trim();
  const modeLine = (forcedMode && forcedMode !== 'auto')
    ? `Пользователь ПРИНУДИТЕЛЬНО выбрал режим текста: "${forcedMode}" (none=без текста, handwritten=надпись от руки, editorial=чистый издательский лейбл, goal=числовая цель, mixed=от руки + лейбл). Следуй ему.`
    : 'Режим текста выбери сам как арт-директор, исходя из смысла объекта (auto).';
  const prompt = `Ты арт-директор премиальной vision board (карта желаний, стиль 2026 luxury editorial).
Пользователь ввёл объект мечты одним словом/фразой: "${raw}".

СНАЧАЛА определи ТОЧНО, что это, для фотореалистичного стикера. Если это бренд/модель без уточнения — ЗАФИКСИРУЙ конкретное актуальное поколение + ракурс (напр. "G-Wagon" → "Mercedes-AMG G 63, current generation, front three-quarter view"; "Rolex GMT Sprite" → "Rolex GMT-Master II 126720VTNR Sprite, three-quarter product view").

ЗАТЕМ прими арт-директорское решение о тексте. ${modeLine}
Определи символический смысл объекта на доске (Wealth/Freedom/Status/Travel/Health/Career/Real Estate/Experience/Discipline/Growth/Lifestyle) и подбери короткий копирайт СВЯЗАННЫЙ с этим смыслом — НЕ клише (запрещено: SUCCESS, BE RICH, HUSTLE, DREAM BIG, MILLIONAIRE MINDSET, BOSS LIFE). Для Rolex → "OWN YOUR TIME", джет → "THE WORLD, CLOSER", вилла → "A LIFE WELL BUILT". Числа/валюты/даты/номера моделей из ввода НЕ меняй. Если во вводе есть измеримая цель ("100k AED/мес") — режим goal, крупное чистое число.

Верни СТРОГО JSON:
{"object":"бренд+тип","model":"конкретная модель/референс/поколение или пусто","characteristics":["3-6 узнаваемых визуальных деталей: материалы, цвет, ракурс three-quarter, силуэт"],"category":"Luxury|Achievement|Wealth|Freedom|Travel|Real Estate|Lifestyle|Style|Health|Career","meaning":"1-3 слова символики","textMode":"none|handwritten|editorial|goal|mixed","primary":"ОДНА эмоц. фраза 1-5 слов (или пусто если none)","secondary":"фактический лейбл-название объекта 1-4 слова (или пусто)","micro":"крошечный editorial микро-копирайт напр. TARGET / 2027, DXB → WORLD (или пусто)","layout":"1-2 фразы: где объект и где какой текст","material":"чем набран текст: handwritten on background | small warm-white torn-paper label | masking tape | clean uppercase sans below"}`;
  const out = await callGemini(prompt, 15000, 650);
  if (!out || !out.object) return null;
  const s = k => String(out[k] || '').slice(0, 140);
  return {
    object: s('object'), model: s('model'),
    characteristics: Array.isArray(out.characteristics) ? out.characteristics.slice(0, 6).map(x => String(x).slice(0, 90)) : [],
    category: s('category'), meaning: s('meaning'),
    textMode: MB_TEXT_MODES[out.textMode] ? out.textMode : (forcedMode !== 'auto' ? forcedMode : 'handwritten'),
    primary: s('primary'), secondary: s('secondary'), micro: s('micro'), layout: s('layout'), material: s('material'),
  };
}

function masterStickerPrompt(st, fallback, bakeText) {
  const obj = st ? `${st.object}${st.model ? ', ' + st.model : ''}` : String(fallback || '').slice(0, 200);
  const chars = st && st.characteristics.length ? `\nVISUAL CHARACTERISTICS: ${st.characteristics.join(', ')}.` : '';
  /* по умолчанию текст НЕ запекаем в картинку (spec #13): надписи рендерит фронт отдельным слоем —
     так они всегда без опечаток, не обрезаются кадром и стилизуются точно. Картинка = чистый объект. */
  let typo = '\nTEXT: absolutely no text, letters, numbers, captions, labels or watermarks anywhere in the image — a purely visual object sticker. Keep any incidental print on the object\'s own surface (dials, plates) clean and legible or softly out of focus, never garbled.';
  if (bakeText && st && st.textMode && st.textMode !== 'none') {
    const bits = [];
    if (st.primary) bits.push(`PRIMARY message "${st.primary}"`);
    if (st.secondary) bits.push(`SECONDARY factual label "${st.secondary}"`);
    if (st.micro) bits.push(`tiny MICRO-copy "${st.micro}"`);
    const modeDesc = {
      handwritten: 'real black marker / ink handwriting by a creative director — natural, slightly imperfect, confident, editorial, masculine/unisex, varying baseline, realistic pen pressure; NOT childish, comic, graffiti or wedding calligraphy. Small hand-drawn marks (→ ↗ underline circle) allowed, naturally drawn.',
      editorial: 'clean modern Swiss / neo-grotesk uppercase editorial typography — geometric, neutral, premium, strong kerning, generous spacing, highly legible (do NOT reproduce a copyrighted commercial font, use its visual characteristics).',
      goal: 'the number LARGE, clean and visually powerful (never alter the figure/currency/date), with a small clean uppercase label beneath and an optional tiny handwritten annotation.',
      mixed: 'handwritten primary phrase + a clean small uppercase sans-serif factual label; optionally on a small warm-white torn-paper label with realistic imperfect edges and soft shadow.',
    }[st.textMode] || 'clean editorial typography';
    typo = `\nTYPOGRAPHY (${st.textMode}): ${bits.join(', ')}. Style: ${modeDesc}\nPLACEMENT: ${st.layout || 'below / beside the object, integrated into the collage'}. MATERIAL: ${st.material || 'directly on background'}.\nHIERARCHY — STRICT: the OBJECT is the hero and by far the largest element. Keep ALL typography small and clearly secondary: the primary phrase must be no taller than ~1/9 of the sticker height and its total width must NOT exceed the object's width; secondary label smaller still; micro-copy tiny. Text must never dominate, never span edge-to-edge, never be a giant headline. Set text in one calm block below (or neatly beside) the object with breathing room.\nCRITICAL: all visible text MUST be spelled exactly and correctly — never invent letters, distort words, create pseudo-English, repeat words, or alter model names / numbers / currencies. Any incidental small print ON the object's own surface (dials, labels) must stay clean and legible or softly out of focus — never render it as garbled fake lettering.`;
  }
  return `Create ONE standalone premium vision-board sticker featuring: ${obj}.${chars}
If a specific brand/product/model is given, preserve its recognizable real-world design, proportions, materials, silhouette and signature details so it is immediately recognizable as the requested model.
VISUAL DIRECTION: sophisticated 2026 luxury lifestyle / success vision board — contemporary luxury editorial collage, premium fashion-magazine moodboard, modern Pinterest/Are.na creative-director board, subtle analog scrapbook character; aspirational but tasteful, expensive without looking flashy; realistic object photography mixed with handmade collage; clean, masculine, sophisticated modern-2026 language (NOT an old motivational poster).
OBJECT RENDERING: render the object as a highly realistic premium product photograph — realistic materials, reflections, physically believable soft studio lighting, crisp details, natural proportions, subtle depth, slightly warm neutral color grading, high-end editorial finish. Do NOT make it a cartoon, emoji, flat vector icon, childish illustration, exaggerated 3D icon, plastic toy or clipart — the object stays photorealistic.
STICKER CUTOUT: isolate the object completely; physical die-cut sticker look — irregular but elegant contour following the object, ~8–16px white/off-white paper border, subtle paper thickness, extremely soft contact shadow underneath, slight elevation, realistic cut-paper edge, no heavy or black outline, no excessive glow. It should feel like a premium photo physically cut out and stuck to a designer's board.
COLLAGE CHARACTER: subtle imperfections — slightly imperfect paper contour, tiny 1–4° rotation, very light paper + photographic grain, warm editorial grading. Keep minimal and sophisticated.${typo}
PALETTE: warm whites #F7F5F0 / #FAF9F6, ivory, black, charcoal, natural metallic silver, subtle champagne/beige, plus the object's natural colors. Avoid oversaturation and overly yellow vintage paper.
LIGHTING: soft diffused studio, realistic directional highlights, gentle shadows, neutral-to-warm white balance.
COMPOSITION — CRITICAL SUBJECT SAFETY: ONE independent sticker; center the subject; it occupies roughly 68–80% of the frame with a clear transparent safety margin (~8–12%) on ALL FOUR sides — never fill the frame, never let the subject or its die-cut border touch or bleed off any edge. The COMPLETE subject must be fully visible and NEVER accidentally cropped: for people keep the whole head, hair, face, hands and feet inside the frame with ~12–16% empty space above the head; for a watch keep the entire case and bracelet; for a car keep all wheels, roof and hood; for a bag keep the handles; for a plane keep nose, wings and tail; for a building keep the key architecture. If unsure, zoom OUT — leave more margin rather than clip. The full silhouette is visible with comfortable padding; works at small and medium sizes on a larger board.
BACKGROUND: output on a FULLY TRANSPARENT background (alpha channel) — the object is a die-cut sticker isolated with NOTHING behind it: no warm-white fill, no khaki, no room, scenery, table or environment. Only the object, its thin white paper die-cut border, and a soft contact shadow remain; everything else is transparent so it drops cleanly onto any board.
CONSISTENCY: part of an ongoing collection — same photographic realism, paper treatment, border thickness, shadow softness, warm grading, typography philosophy, collage aesthetic and scale, as if one art director made every sticker in one photoshoot for one luxury vision board.
DO NOT USE: cartoon/emoji/glossy app-icon aesthetics, childish 3D, excessive gradients, neon glow, thick black outlines, generic Canva templates, old motivational-poster design, random decorative elements, excessive text, multiple objects (unless requested), busy backgrounds, fake luxury logos, distorted brand marks.
OUTPUT: one isolated premium vision-board sticker, high resolution, sharp, full object visible, warm-white clean background, realistic die-cut paper border, soft natural shadow, modern luxury editorial collage aesthetic.`;
}

/* ИИ-генератор карусели для соцсетей (недвижимость): заголовок + слайды */
const CAROUSEL_TEMPLATES = {
  project: { name: 'Новый проект', brief: 'обзор нового жилого проекта/ЖК: крючок, локация, планировки/цены, инфраструктура, доходность, призыв' },
  reasons: { name: '3–5 причин инвестировать', brief: 'причины инвестировать в направление/объект: сильные аргументы по одному на слайд, финальный призыв' },
  review: { name: 'Отзыв клиента / кейс', brief: 'история клиента: запрос → что подобрали → результат (доход/переезд), по-человечески, финальный призыв' },
  digest: { name: 'Подборка недели', brief: '3–4 объекта недели: по объекту на слайд (крючок + цена + фишка), финальный призыв' },
  tips: { name: 'Гид покупателя', brief: 'полезные советы по покупке недвижимости за рубежом: по одному совету на слайд, экспертно, финальный призыв' },
  launch: { name: 'Новый запуск / старт продаж', brief: 'анонс старта продаж/лонча объекта: сильный крючок про запуск, что за объект, ключевые условия входа (цена «от», рассрочка, доходность), почему сейчас/дедлайн оффера, финальный призыв с кодовым словом' },
};
/* «Углы» подачи карусели: одна и та же тема, разная стратегия убеждения.
   photo — сколько визуала тянуть (high=фото-first галерея, low=текст-first). */
const CAROUSEL_ANGLES = {
  auto:       { name: 'Универсальный',       photo: 'medium', hint: '' },
  urgency:    { name: 'Срочность · войти первым', photo: 'medium', hint: 'УГОЛ ПОДАЧИ: ограниченное предложение и «войти первым». Дефицит, старт продаж, лучшие лоты и цены разбирают первыми, спецусловия только на старте — но БЕЗ фальшивого давления и выдуманных дедлайнов. Тон энергичный, собранный. Рубрики в духе «СТАРТ», «ПЕРВЫМ», «ОСТАЛОСЬ». Последний слайд — призыв не откладывать.' },
  discount:   { name: 'Спецусловия · цена',  photo: 'medium', hint: 'УГОЛ ПОДАЧИ: выгода и условия входа — рассрочка, спецусловия на старте, цена входа, механика «лучшей цены»/аукциона. Конкретные числа используй ТОЛЬКО если они есть во вводных, иначе — «специальные условия на старте», без выдумок. Рубрики «ЦЕНА», «РАССРОЧКА», «ВЫГОДА».' },
  luxury:     { name: 'Люкс · эстетика',     photo: 'high',   hint: 'УГОЛ ПОДАЧИ: эстетика и статус. Минимум текста, максимум образа — архитектура, виды, свет, материалы, планировки, атмосфера. Заголовки короткие и «дорогие», подписи-намёки, без восклицаний и клише. Рубрики «ВИД», «АРХИТЕКТУРА», «ПРОСТРАНСТВО». Оставь смысловое место под фото-галерею и планировки.' },
  investment: { name: 'Инвестиции · доход',  photo: 'low',    hint: 'УГОЛ ПОДАЧИ: инвестиция. Доходность, рост капитализации, арендный поток, рассрочка как рычаг, ликвидность и выход. Рационально и по делу, языком инвестора. Числа НЕ выдумывай. Рубрики «ДОХОД», «ROI», «АКТИВ».' },
  lifestyle:  { name: 'Образ жизни',         photo: 'high',   hint: 'УГОЛ ПОДАЧИ: образ жизни. Район и инфраструктура, море/город, ритм дня, для кого этот дом и как в нём живётся. Тепло, образно, по-человечески. Рубрики «ЖИЗНЬ», «РАЙОН», «РЯДОМ».' },
};

async function composeCarousel(topic, templateKey, count, agencyName, geo, angleKey, opts = {}) {
  const t = CAROUSEL_TEMPLATES[templateKey] || CAROUSEL_TEMPLATES.project;
  const a = CAROUSEL_ANGLES[angleKey] || CAROUSEL_ANGLES.auto;
  const n = Math.max(4, Math.min(10, +count || 6));
  const density = ['brief', 'medium', 'rich'].includes(opts.density) ? opts.density : 'medium';
  const ptsRange = density === 'brief' ? '0' : density === 'rich' ? '4-5' : '3-4';
  const toneHint = { expert: 'Тон: экспертный, по делу, языком консультанта-аналитика.', warm: 'Тон: тёплый, человечный, доверительный.', bold: 'Тон: смелый, дерзкий, короткие ударные фразы.' }[opts.tone] || '';
  const prompt = `Ты — SMM-копирайтер агентства недвижимости «${String(agencyName || 'агентство').slice(0, 80)}». Сделай текст для карусели в Instagram/Threads на ${n} слайдов.
Формат: ${t.name} — ${t.brief}.
${topic ? 'Тема/вводные: ' + String(topic).slice(0, 400) + '\n' : ''}${geo ? 'Направление: ' + geo + '\n' : ''}${a.hint ? a.hint + '\n' : ''}${toneHint ? toneHint + '\n' : ''}
КОПИРАЙТИНГ — работай по проверенным формулам продаж, а не «общими словами»:
• Драматургия колоды: Крючок → Проблема/желание аудитории → Объект как решение → Доказательства (цифры, факты, локация) → Условия входа/выгода → Оффер/почему сейчас → Призыв. Каждый слайд двигает к заявке.
• Крючок (1-й слайд) — по одной из формул: разрыв шаблона / конкретное число / вопрос-боль / «большинство ошибается» / инсайд «что скрывают». НЕ «Новый проект», а зацепка, от которой хочется листать.
• PAS/AIDA: сначала задень боль или желание, потом покажи, как объект её закрывает — конкретикой, не эпитетами. Каждый тезис = выгода для клиента («доход в валюте», «сдал — живёшь у моря»), а не свойство ради свойства.
• Финал — один чёткий следующий шаг + кодовое слово в директ. Без «звоните нам».
• ЗАПРЕЩЕНЫ шаблонные ИИ-фразы-вода: «место силы», «искусство жить», «эстетика тишины/пространства», «новая жизнь», «ваш следующий шаг», «привилегии пяти звёзд», «территория счастья», «дом вашей мечты». Вместо них — КОНКРЕТИКА проекта: «300 М ДО ПЛЯЖА», «1BR ОТ $185K», «СДАЧА 2027», «0% РАССРОЧКА 3 ГОДА», «ДОХОДНОСТЬ 8%». Специфика = премиум; абстракция = дёшево.
Правила: живой человеческий язык, без клише и канцелярита. eyebrow — 1-2 слова (рубрика КАПСОМ, напр. «ЗАПУСК», «ЦИФРЫ», «ДОХОД»); заголовок — 2-4 слова (≤ 32 символов, НЕ переносить на 3 строки); подпись — 1-2 коротких предложения (≤ 120 символов). Цифры не выдумывай — если их нет во вводных, говори обтекаемо.
ПЛОТНОСТЬ: слайды НЕ должны быть пустыми — на информационных слайдах должно быть ЧТО ЧИТАТЬ (заголовок + подпись 1-2 предложения + тезисы).${ptsRange === '0' ? ' Режим «кратко»: НЕ давай points, только сильные заголовок+подпись.' : ` На КАЖДОМ СРЕДНЕМ (не первом и не последнем) слайде дай насыщенную "sub" (1-2 предложения по делу) И "points" — ${ptsRange} тезиса-буллета по 4-8 слов каждый (≤ 64 символа): конкретика, польза, факты, цифры, «что внутри». Первый слайд (крючок) и последний (призыв с кодовым словом в директ) — БЕЗ points, только заголовок+подпись. Тезисы разные на разных слайдах, не повторяй.`}
Верни строго JSON:
{"title":"название карусели (для внутреннего списка)",
 "slides":[{"eyebrow":"РУБРИКА","heading":"короткий заголовок","sub":"подпись 1-2 предложения","points":["тезис","тезис"]}]}  // ровно ${n} слайдов; points только у средних слайдов`;
  const out = await callGemini(prompt, 25000, 2600);
  if (!out || !Array.isArray(out.slides) || !out.slides.length) throw new Error('bad carousel');
  const slides = out.slides.slice(0, 10);
  return {
    title: String(out.title || t.name).slice(0, 120),
    photoBias: a.photo,
    /* единая editorial-раскладка: текст прижат к низу на ВСЕХ слайдах (ровно, не «косо»),
       крупнее на обложке и финале; рубрика-eyebrow даёт структуру; points — плотность нарратива */
    slides: slides.map((s, i, arr) => ({
      eyebrow: String(s.eyebrow || '').replace(/<[^>]*>/g, '').slice(0, 22),
      heading: String(s.heading || '').slice(0, 90),
      sub: String(s.sub || '').slice(0, 200),
      points: (density !== 'brief' && i > 0 && i < arr.length - 1 && Array.isArray(s.points)) ? s.points.map(p => String(p).replace(/<[^>]*>/g, '').slice(0, 80)).filter(Boolean).slice(0, density === 'rich' ? 5 : 4) : [],
      pos: 'bottom', align: 'left', size: i === 0 ? 'l' : 'm',
    })),
  };
}

/* ИИ психо-профиль лида: тип покупателя из переписки + подход + отработка возражений + готовые ответы.
   Основано на систематике продаж недвижимости (психотипы покупателей, DISC, отработка возражений, SPIN). */

/* ═══ Классификация фото по роли (Gemini Vision) — для авто-конструктора слайдов ═══
   Понимает, ЧТО на кадре: рендер экстерьера / интерьер / планировка / карта-локация / аменити /
   лайфстайл / логотип. Один мультимодальный вызов на весь набор. Нет ключа/ошибка → всё 'other'. */
const PHOTO_ROLES = ['render_ext', 'interior', 'floorplan', 'map', 'amenity', 'lifestyle', 'logo', 'other'];
async function callGeminiVision(parts, maxTokens = 700) {
  return withTimeout(async (signal) => {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GKEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens, responseMimeType: 'application/json' } }),
    });
    if (!r.ok) throw new Error('gemini vision http ' + r.status);
    const j = await r.json();
    const text = j.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('gemini vision empty');
    return JSON.parse(text);
  }, 22000);
}
async function classifyPhotos(urls) {
  const list = (urls || []).filter(u => /^https?:\/\//.test(String(u))).slice(0, 12);
  if (!GKEY || !list.length) return list.map(() => 'other');
  /* тянем байты каждого изображения (кап 4МБ, только растр) */
  const imgs = [];
  for (const u of list) {
    try {
      const res = await withTimeout((s) => fetch(u, { signal: s }), 7000);
      const ct = (res.headers.get('content-type') || '').split(';')[0];
      if (!/^image\/(jpeg|png|webp|gif)$/.test(ct)) { imgs.push(null); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 900 || buf.length > 4 * 1024 * 1024) { imgs.push(null); continue; }
      imgs.push({ mime: ct, data: buf.toString('base64') });
    } catch (e) { imgs.push(null); }
  }
  const avail = []; imgs.forEach((im, i) => { if (im) avail.push({ i, im }); });
  if (!avail.length) return list.map(() => 'other');
  const parts = [{ text: `Ты классифицируешь маркетинговые изображения объекта недвижимости. Для КАЖДОГО изображения по порядку определи роль строго из списка: ${PHOTO_ROLES.join(', ')}.
Определения: render_ext — ЧИСТЫЙ рендер/фото здания или комплекса снаружи (без наложенных логотипов/текста); interior — интерьер квартиры/номера/комнаты; floorplan — архитектурный план этажа/планировка (чертёж с комнатами, размерами); map — карта локации/район/геопозиция; amenity — удобства (бассейн, лобби, спортзал, спа, ресепшн); lifestyle — люди, пляж, city-vibe, атмосфера; logo — логотип, коллаж из логотипов брендов, прайс-лист, баннер с крупным текстом, инфографика, водяной знак, скриншот — ВСЁ, где заметны логотипы/крупный текст поверх (даже если под ними пейзаж); other — мусор/нерелевантное/сильно обрезанное.
ВАЖНО: если на кадре видно несколько логотипов брендов или крупные надписи поверх фото — это 'logo', НЕ render_ext (такое не пойдёт на обложку).
Верни строго JSON: {"roles":[...]} — РОВНО ${avail.length} значений в ТОМ ЖЕ порядке, что изображения.` }];
  avail.forEach(a => parts.push({ inline_data: { mime_type: a.im.mime, data: a.im.data } }));
  let roles = [];
  try { const out = await callGeminiVision(parts, 800); roles = Array.isArray(out.roles) ? out.roles : []; }
  catch (e) { console.error('[llm] classifyPhotos: ' + e.message); return list.map(() => 'other'); }
  const res = list.map(() => 'other');
  avail.forEach((a, j) => { const rr = String(roles[j] || 'other'); res[a.i] = PHOTO_ROLES.includes(rr) ? rr : 'other'; });
  return res;
}

/* ИИ-выделение: для каждого заголовка выбрать 1-2 САМЫХ важных слова и обернуть их **…**.
   Сервер потом превратит **…** в цветной <mark>. Одним махом на все слайды. */
async function highlightHeadings(headings) {
  const list = (headings || []).map((h, i) => `${i}: ${String(h || '').replace(/<[^>]*>/g, '').slice(0, 120)}`).join('\n');
  if (!list.trim()) return [];
  const prompt = `Ты — арт-директор соцсетей. Ниже заголовки слайдов карусели по недвижимости. Для КАЖДОГО выдели самое важное — 1, максимум 2 ключевых слова/короткую фразу — обернув их в **двойные звёздочки**. Это акцент для взгляда: цифры, выгода, суть. НЕ выделяй всё подряд, НЕ выделяй служебные слова, НЕ меняй сам текст (только расставь **). Если в заголовке нечего выделять — верни его без изменений.
ЗАГОЛОВКИ:
${list}
Верни строго JSON: {"items":[{"i":0,"marked":"текст с **акцентом**"}, ...]} — по одному на каждый индекс.`;
  const out = await callGemini(prompt, 20000, 1200);
  const items = Array.isArray(out && out.items) ? out.items : [];
  const byI = {};
  items.forEach(it => { if (it && typeof it.i === 'number') byI[it.i] = String(it.marked || '').slice(0, 200); });
  return headings.map((h, i) => byI[i] || String(h || ''));
}

async function composeLeadPsych(db, lead, history) {
  const q = lead.quals || {};
  const geoName = (db.settings.geoNames || {})[lead.geo] || lead.geo || '';
  const prompt = `Ты — старший тренер по продажам элитной недвижимости и переговорщик. Разбери лида по переписке и дай брокеру рабочую «шпаргалку подхода».
Опирайся на систематику: психотипы покупателей недвижимости (аналитик-инвестор — рационал, цифры/ROI; эмоциональный/семейный — образ жизни, безопасность; статусный/VIP — престиж, эксклюзив; осторожный-скептик — гарантии, контроль, соц-доказательство; решительный — скорость, конкретика), модель DISC, отработка возражений, SPIN.
ВАЖНО: выводы делай ТОЛЬКО из реальных слов клиента в переписке и осей квалификации. Где данных мало — так и скажи («мало сигналов»), НЕ выдумывай факты и цифры.

ЛИД: ${lead.name || '—'}, направление ${geoName}, источник ${lead.source || '—'}.
ОСИ: цель=${(q.purpose || {}).value || '—'}, срок=${(q.timeline || {}).value || '—'}, бюджет=${(q.budget || {}).value || '—'}, тип=${(q.type || {}).value || '—'}.
ПЕРЕПИСКА (последние сообщения):
${history || '(переписки пока мало)'}

Верни строго JSON:
{"type":"краткое имя психотипа (2-4 слова)",
 "confidence":"высокая|средняя|низкая — насколько уверенно по имеющимся сигналам",
 "axes":{"Рациональность":0-100,"Эмоциональность":0-100,"Скорость решения":0-100,"Осторожность":0-100},
 "summary":"1-2 предложения: что за клиент и что им движет",
 "press":["2-4 точки, на что делать акцент в разговоре именно с этим типом"],
 "avoid":["2-3 чего избегать, что оттолкнёт этот тип"],
 "objections":[{"q":"вероятное возражение","a":"как отработать коротко"}],
 "replies":["1-2 готовых сообщения в чат под этот психотип и текущий момент диалога (живым языком, без клише, без выдуманных цифр)"]}`;
  const out = await callGemini(prompt, 30000, 2200);
  if (!out || !out.type) throw new Error('bad psych');
  const arr = (a, n) => Array.isArray(a) ? a.slice(0, n).map(x => String(x).slice(0, 300)).filter(Boolean) : [];
  const clampAx = (o) => { const r = {}; for (const k of ['Рациональность', 'Эмоциональность', 'Скорость решения', 'Осторожность']) r[k] = Math.max(0, Math.min(100, parseInt((o || {})[k]) || 0)); return r; };
  return {
    type: String(out.type).slice(0, 60),
    confidence: String(out.confidence || 'средняя').slice(0, 20),
    axes: clampAx(out.axes),
    summary: String(out.summary || '').slice(0, 500),
    press: arr(out.press, 4),
    avoid: arr(out.avoid, 3),
    objections: Array.isArray(out.objections) ? out.objections.slice(0, 4).map(o => ({ q: String((o || {}).q || '').slice(0, 200), a: String((o || {}).a || '').slice(0, 400) })).filter(o => o.q) : [],
    replies: arr(out.replies, 2),
    at: Date.now(),
  };
}

/* ═══════════════════ ДВИЖКИ ДЛЯ СОЦСЕТЕЙ (Reels/контент для брокеров) ═══════════════════
   Референс — проверенный контент-бот TargetPoint: сильный хук → многоуровневая структура
   с конкретной пользой по пунктам → призыв через кодовое слово. Стиль ниже вшит как якорь тона. */

const SHOOT_FORMATS = {
  talking:  { name: 'Говорящая голова', brief: 'спикер говорит прямо в камеру, крупный план, динамичная нарезка с подрезками пауз; текст под запись от первого лица, живой разговорный ритм' },
  dialogue: { name: 'Диалог 50/50',     brief: 'два человека / вопрос-ответ, экран поделён или склейки реплик; распиши реплики по ролям A (ведущий/скептик) и B (эксперт)' },
  vlog:     { name: 'Влог / на объекте', brief: 'съёмка в движении на объекте или локации, живые перебивки b-roll, закадровый голос; распиши что снимаем в кадре + закадровый текст' },
};

/* якорь тона: как звучит сильный риэлторский Reels (данные-факты-конкретика, без воды, кодовое слово в CTA) */
const REELS_TONE_ANCHOR = `Пример тона (НЕ копировать дословно, только регистр и подача):
«Лид за 500 ₽ принёс нам больше сделок, чем 10 по 50. И нет, я не оговорился. Большинство агентств гонятся за дешёвыми лидами — это ловушка. Дешёвый лид просто кликнул. Дорогой — хочет купить. Вот что мы проверили на 50+ кампаниях в Meta: [пункт 1 с конкретной цифрой], [пункт 2], [пункт 3]. Если хотите разбор вашей рекламы — напишите слово «аудит» в комментарии.»
Признаки: цепляющее контр-интуитивное утверждение в первой строке, короткие рубленые фразы, конкретная польза по пунктам, живой человеческий голос без канцелярита и клише, финал — призыв написать кодовое слово в комментарии/директ.`;

/* ═══ БИБЛИОТЕКА ВИРУСНЫХ ФОРМУЛ REELS ═══
   Проверенные структуры short-form (не шаблоны, а драматургические каркасы с психо-механикой удержания).
   Каждая: psych — на каком психологическом паттерне держится; hook — тип первых 3с; beats — каркас;
   use — под какую задачу; example — риэлторский пример. ИИ ВЫБИРАЕТ формулу под тему и СТРОГО ведёт по её каркасу. */
const REELS_FORMULAS = {
  pas:        { name: 'PAS · Боль → Нажать → Решение', psych: 'избегание потери (loss aversion) + агитация боли', hook: 'назови конкретную боль/страх зрителя в лоб', beats: 'Хук=боль → усиль последствия (что теряешь, если не решить) → покажи решение как облегчение → CTA', use: 'прогрев, заявки', ex: '«Покупаешь квартиру в Дубае? Вот как тебя разведут на 20%…»' },
  contrarian: { name: 'Контр-интуиция · Слом ожидания', psych: 'pattern interrupt + разрыв шаблона (дофамин от новизны)', hook: 'смелое утверждение против общепринятого', beats: 'Хук=«всё, что ты знаешь про X — неправда» → почему все ошибаются → правда с доказательством → CTA', use: 'охват, авторитет', ex: '«Вторичка выгоднее новостройки. И вот почему все инвесторы молчат об этом.»' },
  openloop:   { name: 'Открытая петля · Тизер до конца', psych: 'эффект Зейгарник (незакрытый гештальт держит до конца)', hook: 'пообещай payoff, но не отдавай сразу', beats: 'Хук=обещание раскрыть в конце → выдавай ценность частями, дразня финалом → раскрой обещанное в самом конце → CTA', use: 'удержание/досмотры', ex: '«В конце покажу район Дубая, где аренда отбивает квартиру за 6 лет. Но сначала…»' },
  mythbust:   { name: 'Разрушение мифа', psych: 'авторитет + эффект удивления, коррекция убеждения', hook: 'озвучь распространённый миф', beats: 'Хук=миф «многие думают, что…» → почему это ложь → что на самом деле (факт) → вывод → CTA', use: 'доверие, экспертность', ex: '«Миф: рассрочка от застройщика — это выгодно. Правда жёстче.»' },
  listicle:   { name: 'Список · N ошибок/секретов', psych: 'тяга к завершению + чёткая структура = высокий досмотр', hook: 'обещай конкретное число пунктов', beats: 'Хук=«3 ошибки, которые стоят покупателю $50k» → пункт 1 (быстро, с примером) → пункт 2 → пункт 3 (самый сильный последним) → CTA', use: 'сохранения, польза', ex: '«5 фраз брокера, после которых беги из сделки.»' },
  insider:    { name: 'Инсайд · «Они это скрывают»', psych: 'принадлежность к «своим» + любопытство + недоверие к системе', hook: 'намекни на скрытую от зрителя правду', beats: 'Хук=«застройщики не хотят, чтобы ты это знал» → раскрой механику изнутри → как этим воспользоваться → CTA', use: 'охват, вовлечение', ex: '«Как риелторы в Дубае накручивают цену на 15% — изнутри.»' },
  casereveal: { name: 'Кейс · Конкретная цифра', psych: 'эффект конкретики (числа = доверие) + социальное доказательство', hook: 'начни с яркого результата/числа', beats: 'Хук=«клиент вложил $180k — получает $2k/мес» → как это устроено по шагам → почему повторяемо → CTA', use: 'заявки, доверие', ex: '«Как студия в JVC приносит 9% годовых в долларах.»' },
  bab:        { name: 'BAB · Было → Стало → Мост', psych: 'визуализация трансформации + желание (desire)', hook: 'покажи «до» болезненно узнаваемо', beats: 'Хук=было (боль/статус-кво) → стало (желаемый результат) → мост (как перейти = твой продукт) → CTA', use: 'прогрев, продажа', ex: '«Снимал за $2k/мес → купил и платит столько же в ипотеку за своё.»' },
  fomo:       { name: 'FOMO · Уходящее окно', psych: 'дефицит + срочность + страх упустить', hook: 'обозначь закрывающуюся возможность', beats: 'Хук=«окно закрывается» → почему сейчас (конкретная причина, не выдуманная) → что теряешь, промедлив → CTA срочно', use: 'заявки, спрос', ex: '«Старт продаж закрывается — цены на этом этапе больше не вернутся.»' },
  storypov:   { name: 'История / POV · Идентификация', psych: 'нарративный перенос + отзеркаливание (я — это про меня)', hook: '«POV: ты только что…» или личная сцена', beats: 'Хук=узнаваемая сцена от 2-го лица → конфликт/ошибка героя → инсайт/разворот → урок зрителю → CTA', use: 'охват, эмоция', ex: '«POV: тебе одобрили ипотеку в Дубае, а ты думал, это нереально.»' },
  question:   { name: 'Вопрос-крючок', psych: 'любопытство (curiosity gap) + вовлечение через ответ', hook: 'провокационный вопрос про зрителя', beats: 'Хук=острый вопрос → почему это важно/неочевидно → ответ с пользой → CTA', use: 'охват, комменты', ex: '«Почему все инвесторы сейчас перекладываются из Дубая в Абу-Даби?»' },
};
function _reelsFormulaRef() {
  return 'ФОРМУЛЫ (выбери под тему ЛУЧШУЮ и веди строго по её каркасу; для разных сценариев — РАЗНЫЕ формулы):\n' +
    Object.entries(REELS_FORMULAS).map(([k, f]) => `• [${k}] ${f.name} — психология: ${f.psych}. Хук: ${f.hook}. Каркас: ${f.beats}. Уместно: ${f.use}.`).join('\n');
}

/* ═══ БИБЛИОТЕКА ФОРМУЛ ХУКОВ (первые 1-3 секунды — решают ВСЁ) ═══
   Проверенные каркасы захода. Каждый хук в сценарии строится по СВОЕЙ формуле. tpl — шаблон-подстановка. */
const HOOK_FORMULAS = {
  curiosity:   { name: 'Разрыв любопытства', tpl: 'Никто не говорит тебе про [X] — а это меняет всё', why: 'открытая петля, мозг требует закрыть' },
  callout:     { name: 'Прямой отсев аудитории', tpl: 'Если ты [аудитория/ситуация] — тебе нужно это увидеть', why: 'самоидентификация: «это про меня»' },
  mistake:     { name: 'Дорогая ошибка', tpl: 'Эта ошибка стоит [аудитории] [цена/потеря]', why: 'негатив-байас + страх потери сильнее выгоды' },
  contra:      { name: 'Контр-утверждение', tpl: '[Общепринятое] — неправда. И вот почему', why: 'разрыв шаблона → дофамин' },
  number:      { name: 'Конкретное число/результат', tpl: '[N] [вещей], которые [резкий результат]', why: 'специфичность = доверие + анонс объёма' },
  secret:      { name: 'Инсайдерский секрет', tpl: '[Эксперты/застройщики] не хотят, чтобы ты знал это', why: '«свой круг» + недоверие к системе' },
  question:    { name: 'Провокационный вопрос', tpl: 'Почему [неожиданный факт про зрителя/рынок]?', why: 'вопрос запускает внутренний поиск ответа' },
  pov:         { name: 'POV / сцена', tpl: 'POV: ты только что [узнаваемая ситуация]', why: 'мгновенная идентификация и погружение' },
  stopdoing:   { name: 'Стоп-команда', tpl: 'Хватит [делать X], если хочешь [результат]', why: 'императив + обещание выгоды' },
  bignews:     { name: 'Срочная новость', tpl: 'Только что [изменение/событие] — что делать', why: 'новизна + FOMO' },
  itell:       { name: 'Я проверил за тебя', tpl: 'Я [сделал X], чтобы тебе не пришлось', why: 'экономия усилий + доверие к опыту' },
  sign:        { name: 'Это твой знак', tpl: 'Это твой знак [сделать действие] в [гео]', why: 'подталкивание к решению, которое уже зреет' },
  truth:       { name: 'Голая правда', tpl: 'Вся правда о [тема], которую скрывают', why: 'обещание разоблачения' },
  youwrong:    { name: 'Ты делаешь это не так', tpl: 'Ты [делаешь X] неправильно — вот как надо', why: 'лёгкая провокация + любопытство исправиться' },
};
function _hookFormulaRef() {
  return 'ФОРМУЛЫ ХУКОВ (каждый из 3 хуков — по РАЗНОЙ формуле; хук цепляет за 1-3 сек):\n' +
    Object.entries(HOOK_FORMULAS).map(([k, h]) => `• [${k}] ${h.name}: «${h.tpl}» — ${h.why}`).join('\n');
}

function _reelScriptShape(n) {
  return `Верни СТРОГО JSON:
{"title":"общее название пачки (по теме, для списка)",
 "scripts":[{
   "format":"человекочитаемое имя формата съёмки",
   "format_key":"talking|dialogue|vlog",
   "formula_key":"ключ выбранной формулы (pas|contrarian|openloop|mythbust|listicle|insider|casereveal|bab|fomo|storypov|question)",
   "formula_name":"название формулы человекочитаемо",
   "psych":"1 строка: на каком психологическом паттерне держится этот сценарий и почему цепляет",
   "duration_sec":30,
   "goal_fit":"1 строка: под какую цель/этап воронки этот ролик (охват/прогрев/заявки)",
   "hooks":["хук 1","хук 2","хук 3"],
   "hook_formulas":["ключ формулы хука 1","ключ формулы хука 2","ключ формулы хука 3"],
   "hook_note":"1 короткая заметка почему эти хуки цепляют именно тут",
   "beats":[{"t":"0-3с","role":"кадр/роль (для диалога — A или B)","say":"что говорим дословно","onscreen":"что на экране / подпись"}],
   "full_script":"цельный текст под запись — можно читать с телефона, живым языком, абзацами",
   "codeword":"кодовое слово для CTA (1 слово)","leadmagnet":"что человек получит за него (напр. разбор/подборка/чек-лист)",
   "cta":"финальный призыв 1-2 предложения с кодовым словом",
   "caption":"подпись под рилс для ленты (с 1-2 эмодзи максимум, без хэштег-спама)",
   "broll":["3-6 идей что доснять для видеоряда"],
   "why_works":"1-2 предложения почему этот ролик залетит"
 }]}  // ровно ${n} сценариев`;
}

/* Генератор сценариев Reels. opts: {topic, geo, agencyName, formats:[keys], mode:'idea'|'rewrite', sourceText} */
async function composeScripts(opts = {}) {
  const agencyName = String(opts.agencyName || 'агентство недвижимости').slice(0, 80);
  const geo = opts.geo ? String(opts.geo).slice(0, 60) : '';
  const fmtKeys = (Array.isArray(opts.formats) ? opts.formats : []).filter(k => SHOOT_FORMATS[k]).slice(0, 3);
  const formats = fmtKeys.length ? fmtKeys : ['talking'];
  const n = formats.length;
  const fmtLines = formats.map((k, i) => `${i + 1}) ${SHOOT_FORMATS[k].name} [${k}] — ${SHOOT_FORMATS[k].brief}`).join('\n');
  const isRewrite = opts.mode === 'rewrite' && opts.sourceText;
  const topic = String(opts.topic || '').slice(0, 1200);
  const src = String(opts.sourceText || '').slice(0, 4000);

  const task = isRewrite
    ? `ЗАДАЧА: переписать чужой рилс под НАШУ нишу (недвижимость) и другой угол — так, чтобы НЕ было дублирования оригинала (другой пример, другие формулировки, свой заход), но сохранить рабочую драматургию.
ИСХОДНЫЙ РИЛС (транскрипт/описание/ссылка-контекст):
"""${src}"""
${topic ? 'Наш угол/своя мысль, которую вплести: ' + topic + '\n' : ''}`
    : `ЗАДАЧА: собрать сценарии рилс по идее брокера.
Идея/тема/вводные: ${topic || '(идея не задана — предложи сильную тему по нише недвижимости)'}\n`;

  const forcedF = REELS_FORMULAS[opts.formula] ? opts.formula : '';
  const prompt = `Ты — сценарист вирусных Reels для агентства недвижимости «${agencyName}». Пишешь как топовый short-form копирайтер и продавец, а не как нейросеть. Твоя задача — не «шаблон», а рабочая драматургия по ПРОВЕРЕННЫМ психологическим формулам, которые реально останавливают пролистывание и заставляют досмотреть и написать.
${geo ? 'Направление/гео: ' + geo + '\n' : ''}${task}
Сделай ${n} ${n === 1 ? 'сценарий' : 'сценария'} — по одному под КАЖДЫЙ выбранный формат съёмки:
${fmtLines}

${_reelsFormulaRef()}
${forcedF ? `\nОБЯЗАТЕЛЬНО используй формулу [${forcedF}] для всех сценариев (разные заходы внутри неё).\n` : '\nДля КАЖДОГО сценария выбери СВОЮ, наиболее подходящую формулу под тему и формат — не повторяй одну и ту же на всех.\n'}
${_hookFormulaRef()}
Для каждого сценария дай РОВНО 3 хука, КАЖДЫЙ построй по РАЗНОЙ формуле хука из списка выше, и укажи ключ формулы каждого хука. Хук — не пересказ темы, а живая цепляющая фраза, которую реально скажут в первые секунды.
ПСИХО-МЕХАНИКА УДЕРЖАНИЯ (обязательно в каждом сценарии):
- Первые 3 секунды = хук строго по выбранной формуле, ломающий пролистывание. НИКАКОГО медленного вступления, лого, «привет, друзья», «в этом видео расскажу».
- Открытая петля: в хуке намекни на payoff, отдай его только в конце — держит досмотр (эффект Зейгарник).
- Конкретика вместо общих слов: числа, сроки, названия районов = доверие (эффект специфичности). НО НЕ выдумывай цифры/кейсы, которых нет во вводных — если их нет, говори обтекаемо («в разы», «заметно») или предложи брокеру подставить свою.
- Один разрыв шаблона/новизна в хуке (дофаминовый триггер).
- Идентификация: обращайся на «ты», будто ролик лично про зрителя.
- CTA = микро-действие с низким трением: написать ОДНО кодовое слово в комментарий (двигает алгоритм + уводит в директ).

${REELS_TONE_ANCHOR}

Короткие рубленые фразы, живой русский язык, без канцелярита и клише.
${_reelScriptShape(n)}`;

  const out = await callGemini(prompt, 55000, 6000);
  if (!out || !Array.isArray(out.scripts) || !out.scripts.length) throw new Error('bad scripts');
  const arr = (a, n2) => Array.isArray(a) ? a.slice(0, n2).map(x => String(x).slice(0, 300)).filter(Boolean) : [];
  return {
    title: String(out.title || (isRewrite ? 'Рерайт рилса' : 'Сценарии Reels')).slice(0, 120),
    scripts: out.scripts.slice(0, 3).map(s => ({
      format: String(s.format || '').slice(0, 60),
      format_key: SHOOT_FORMATS[s.format_key] ? s.format_key : (formats[0]),
      formula_key: REELS_FORMULAS[s.formula_key] ? s.formula_key : '',
      formula_name: String(s.formula_name || (REELS_FORMULAS[s.formula_key] ? REELS_FORMULAS[s.formula_key].name : '')).slice(0, 80),
      psych: String(s.psych || '').slice(0, 220),
      hook_formulas: (Array.isArray(s.hook_formulas) ? s.hook_formulas : []).slice(0, 3).map(k => (HOOK_FORMULAS[k] ? HOOK_FORMULAS[k].name : '')),
      duration_sec: Math.max(10, Math.min(90, parseInt(s.duration_sec) || 30)),
      goal_fit: String(s.goal_fit || '').slice(0, 200),
      hooks: arr(s.hooks, 3),
      hook_note: String(s.hook_note || '').slice(0, 260),
      beats: Array.isArray(s.beats) ? s.beats.slice(0, 12).map(b => ({
        t: String((b || {}).t || '').slice(0, 24), role: String((b || {}).role || '').slice(0, 60),
        say: String((b || {}).say || '').slice(0, 500), onscreen: String((b || {}).onscreen || '').slice(0, 200),
      })).filter(b => b.say || b.role) : [],
      full_script: String(s.full_script || '').slice(0, 3000),
      codeword: String(s.codeword || '').slice(0, 40),
      leadmagnet: String(s.leadmagnet || '').slice(0, 160),
      cta: String(s.cta || '').slice(0, 400),
      caption: String(s.caption || '').slice(0, 700),
      broll: arr(s.broll, 6),
      why_works: String(s.why_works || '').slice(0, 400),
    })),
  };
}

/* Хантинг идей: банк идей под нишу (съёмки/форматы/рубрики). opts:{geo, agencyName, angle, count} */
async function huntIdeas(opts = {}) {
  const agencyName = String(opts.agencyName || 'агентство недвижимости').slice(0, 80);
  const geo = opts.geo ? String(opts.geo).slice(0, 60) : '';
  const n = Math.max(4, Math.min(12, +opts.count || 8));
  const ANGLES = {
    all: 'разные углы: разрушение мифов, кейсы, разбор ошибок, закулисье работы брокера, тренды рынка, гайды покупателю, боли аудитории',
    myths: 'разрушение мифов и заблуждений о покупке/инвестициях в недвижимость',
    cases: 'кейсы и истории клиентов (доход, переезд, удачная сделка)',
    mistakes: 'типичные ошибки покупателей и инвесторов',
    behind: 'закулисье работы брокера/агентства, «как это на самом деле»',
    trends: 'тренды и новости рынка недвижимости направления',
    guide: 'полезные гайды и лайфхаки для покупателя',
    shoot: 'идеи именно под съёмку: динамичные форматы на объекте, до/после, обзоры, рум-туры',
  };
  const angle = ANGLES[opts.angle] || ANGLES.all;
  const context = String(opts.context || '').slice(0, 800).trim();
  const prompt = `Ты — контент-стратег агентства недвижимости «${agencyName}». Наханть ${n} свежих идей для Reels/постов, которые реально заходят у брокеров.
${geo ? 'Направление/гео: ' + geo + '\n' : ''}Фокус идей: ${angle}.
${context ? `КОНТЕКСТ ОТ ПОЛЬЗОВАТЕЛЯ (главный ориентир): «${context}».\nСначала мысленно вырази этот контекст 5-8 ключевыми словами/темами (аудитория, продукт, гео, боли, форматы) и хантий идеи ИМЕННО вокруг них — это приоритетнее общего фокуса.\n` : ''}
Правила: каждая идея — самостоятельная, конкретная (не «расскажите про район», а с чётким углом и крючком); разнообразие форматов Instagram/TikTok (Reels, рум-тур, remix тренда, коллаб, до/после, карусель, тренд-аудио); без банальщины; ориентир на прогрев и заявки.
ВАЖНО про референс: НЕ выдумывай конкретные ссылки, ники и аккаунты — их не существует в твоих данных. Вместо этого дай "ref_what" (какой ПРИЁМ/ФОРМАТ/ФИШКА лежит в основе — то, что брокер увидит у топов) и "ref_query" — короткий ПОИСКОВЫЙ ЗАПРОС (2-5 слов, на языке аудитории/на англ. если гео англоязычное), по которому реально найдутся живые примеры в ленте.
Верни СТРОГО JSON:
{"ideas":[{
  "title":"суть идеи одной фразой (крючок)",
  "angle":"тип: миф|кейс|ошибка|закулисье|тренд|гайд|съёмка",
  "hook":"вариант первой фразы ролика",
  "why":"почему зайдёт / чью боль закрывает (1 строка)",
  "format":"под какой формат снимать (говорящая голова / диалог / влог на объекте)",
  "effort":"низкий|средний|высокий — сложность съёмки",
  "ref_what":"приём/фишка-референс, который используют топ-аккаунты (1 строка)",
  "ref_query":"поисковый запрос для живых примеров (2-5 слов)",
  "platform":"reels|tiktok|shorts — где искать примеры"
}]}  // ровно ${n} идей, отсортируй сильные первыми`;
  const out = await callGemini(prompt, 45000, 4200);
  if (!out || !Array.isArray(out.ideas) || !out.ideas.length) throw new Error('bad ideas');
  const PLAT = new Set(['reels', 'tiktok', 'shorts']);
  return {
    ideas: out.ideas.slice(0, 12).map(i => ({
      title: String((i || {}).title || '').slice(0, 200),
      angle: String((i || {}).angle || '').slice(0, 40),
      hook: String((i || {}).hook || '').slice(0, 300),
      why: String((i || {}).why || '').slice(0, 300),
      format: String((i || {}).format || '').slice(0, 80),
      effort: String((i || {}).effort || '').slice(0, 20),
      refWhat: String((i || {}).ref_what || '').slice(0, 160),
      refQuery: String((i || {}).ref_query || '').slice(0, 80),
      platform: PLAT.has((i || {}).platform) ? i.platform : 'reels',
    })).filter(i => i.title),
  };
}

/* Быстрый пост/сторис/тред в нужном стиле. opts:{topic, geo, agencyName, kind:'post'|'story'|'thread', style} */
async function composePost(opts = {}) {
  const agencyName = String(opts.agencyName || 'агентство недвижимости').slice(0, 80);
  const geo = opts.geo ? String(opts.geo).slice(0, 60) : '';
  const topic = String(opts.topic || '').slice(0, 1000);
  const STYLES = {
    expert: 'экспертный, по делу, с цифрами и аргументами, вызывает доверие',
    warm: 'тёплый, человеческий, эмпатичный, будто пишет близкий консультант',
    lux: 'премиальный, элегантный, сдержанный люкс, без пафоса',
    bold: 'провокационный, цепляющий, с контр-интуитивными утверждениями',
    friendly: 'дружелюбный, лёгкий, разговорный, с юмором в меру',
  };
  const style = STYLES[opts.style] || STYLES.expert;
  const kind = ['post', 'story', 'thread'].includes(opts.kind) ? opts.kind : 'post';
  const KIND_BRIEF = {
    post: 'пост в ленту Instagram: сильный первый абзац-крючок, тело с пользой, финальный CTA; + первый комментарий (продолжение/ссылка)',
    story: 'серия из 4-6 сторис: каждая — короткий экран (1-2 строки текста на экран) + подсказка что показать; последняя со стикером-действием',
    thread: 'тред в Threads: 4-7 коротких постов подряд, первый — хук, каждый развивает мысль, последний — CTA',
  };
  const prompt = `Ты — SMM-копирайтер агентства недвижимости «${agencyName}». Напиши ${KIND_BRIEF[kind]}.
${geo ? 'Направление/гео: ' + geo + '\n' : ''}Тема/вводные: ${topic || '(тема не задана — выбери сильную по нише)'}
Тон: ${style}. Живой человеческий язык, без клише и канцелярита. Цифры не выдумывай, если их нет во вводных.
Верни СТРОГО JSON:
{"title":"короткое название для списка",
 "body":"основной текст (для сторис/треда — с разделителем '\\n---\\n' между экранами/постами)",
 "openers":["2 альтернативных первых строки/крючка"],
 "hashtags":["5-8 уместных хэштегов без решётки"],
 "cta":"призыв к действию 1 строка",
 "first_comment":"текст первого комментария (для post; иначе пусто)"}`;
  const out = await callGemini(prompt, 40000, 3000);
  if (!out || !out.body) throw new Error('bad post');
  const arr = (a, n2) => Array.isArray(a) ? a.slice(0, n2).map(x => String(x).slice(0, 200)).filter(Boolean) : [];
  return {
    kind,
    title: String(out.title || 'Пост').slice(0, 120),
    body: String(out.body || '').slice(0, 4000),
    openers: arr(out.openers, 2),
    hashtags: arr(out.hashtags, 8).map(h => h.replace(/^#+/, '')),
    cta: String(out.cta || '').slice(0, 300),
    first_comment: String(out.first_comment || '').slice(0, 600),
  };
}

/* Умный поиск данных о лонче/проекте: из текста страницы (по ссылке) или по названию.
   opts: {sourceText, query}. Если есть sourceText — извлекаем ТОЛЬКО факты из текста (без выдумки). */
async function extractLaunch(opts = {}) {
  const src = String(opts.sourceText || '').slice(0, 8000);
  const query = String(opts.query || '').slice(0, 200);
  const grounded = !!src;
  const prompt = `Ты — аналитик по недвижимости. Собери карточку фактов о проекте/лонче для карусели брокера.
${grounded
    ? 'ИСТОЧНИК (текст страницы) — извлекай факты ТОЛЬКО отсюда, ничего не додумывай. Чего нет — оставляй пустым.\n"""' + src + '"""'
    : 'Проект по названию: "' + query + '". Дай оценку по общеизвестным данным, но честно проставь confidence и note — брокер обязан перепроверить цифры.'}
ЯЗЫК: все значения верни НА РУССКОМ — если источник на другом языке, переведи по смыслу коротко и по-человечески (названия ЖК/брендов и валюту/цифры оставляй как есть). Никакого английского в highlights/units/payment.
Верни строго JSON:
{"name":"название проекта/ЖК","location":"район, город, страна (по-русски)","priceFrom":"стартовая цена (как есть, с валютой)","payment":"условия рассрочки/оплаты (по-русски)","roi":"доходность/ROI если есть","handover":"срок сдачи","units":"типы юнитов по-русски (студии/1-3 спальни…)","highlights":["до 5 ключевых фишек одной строкой ПО-РУССКИ, коротко (≤6 слов)"],"confidence":"высокая|средняя|низкая","note":"1 строка: что проверить/чего не хватает"}`;
  const out = await callGemini(prompt, 30000, 1500);
  if (!out) throw new Error('bad launch');
  const S = (v, n) => String(v == null ? '' : v).replace(/<[^>]*>/g, '').slice(0, n);
  return {
    name: S(out.name, 160), location: S(out.location, 160), priceFrom: S(out.priceFrom, 120),
    payment: S(out.payment, 200), roi: S(out.roi, 120), handover: S(out.handover, 120), units: S(out.units, 160),
    highlights: Array.isArray(out.highlights) ? out.highlights.slice(0, 5).map(x => S(x, 160)).filter(Boolean) : [],
    confidence: ['высокая', 'средняя', 'низкая'].includes(out.confidence) ? out.confidence : (grounded ? 'средняя' : 'низкая'),
    note: S(out.note, 240),
    grounded,
  };
}

/* Разбор надиктованной/написанной задачи в структуру с умным дедлайном (естественный язык → дата/время). */
async function parseTask(text, todayStr, dow) {
  const prompt = `Сегодня ${todayStr}${dow ? ' (' + dow + ')' : ''}. Преврати фразу брокера недвижимости в задачу и извлеки срок из естественной речи («завтра», «в пятницу к 15:00», «через 3 дня», «до конца недели», «послезавтра утром»).
Фраза: "${String(text || '').slice(0, 500)}"
Правила: title — чистая суть задачи без слов о сроке; если срок не назван — date/time пустые; priority p1 если «срочно/важно/горит/сегодня», иначе p3.
Верни СТРОГО JSON:
{"title":"суть задачи","priority":"p1|p2|p3|p4","date":"YYYY-MM-DD или пусто","time":"HH:MM или пусто","scheduled":"YYYY-MM-DD день плана или пусто"}`;
  const out = await callGemini(prompt, 15000, 400);
  if (!out || !out.title) throw new Error('bad task');
  const dre = /^\d{4}-\d{2}-\d{2}$/, tre = /^\d{1,2}:\d{2}$/;
  return {
    title: String(out.title).replace(/<[^>]*>/g, '').slice(0, 300),
    priority: ['p1', 'p2', 'p3', 'p4'].includes(out.priority) ? out.priority : 'p3',
    date: dre.test(String(out.date || '')) ? out.date : '',
    time: tre.test(String(out.time || '')) ? out.time : '',
    scheduled: dre.test(String(out.scheduled || '')) ? out.scheduled : '',
  };
}

/* ═══ ОЦЕНКА ЗВОНКА по методологии Ольги Синенко ═══
   Разбирает транскрипт звонка/Zoom брокера, ставит балл по рубрике (открытие, квалификация,
   возражения, ценность/срочность, следующий шаг, тон/ошибки), даёт конкретный фидбэк
   и эталонные скрипты «как надо». Опирается на academy.methodologyRef() (дистиллят методологии). */
const academy = require('./academy');
async function reviewCall(transcript, ctx = {}) {
  const ref = academy.methodologyRef();
  const t = String(transcript || '').slice(0, 14000);
  const rubricKeys = academy.RUBRIC.map(r => `"${r.key}"`).join(', ');
  const prompt = `Ты — старший тренер по продажам недвижимости (в стиле разборов звонков Ольги Синенко). Разбери РЕАЛЬНЫЙ звонок/Zoom брокера с клиентом и оцени его СТРОГО по методологии ниже. Будь конкретным и честным, как коуч на разборе: хвали за дело, а ошибки называй прямо и показывай, как надо.

=== МЕТОДОЛОГИЯ (эталон) ===
${ref}

=== ТРАНСКРИПТ ЗВОНКА ===
${t || '(пусто)'}

${ctx.geo ? 'Направление: ' + ctx.geo + '\n' : ''}${ctx.lead ? 'Клиент: ' + ctx.lead + '\n' : ''}
Оцени по 6 измерениям (0-100 каждое): ${rubricKeys}. overall — взвешенный итог (0-100).
Для КАЖДОГО измерения дай короткий комментарий: что сделал хорошо/плохо в ЭТОМ звонке (со ссылкой на реплики).
mistakes — 2-5 конкретных ошибок с полем better (как надо было сказать, по возможности с точной фразой-скриптом на английском).
missedQuestions — важные вопросы квалификации, которые брокер НЕ задал (из эталонных, дословно).
nextScripts — 2-4 готовых фразы/скрипта (на языке звонка), которые исправят ключевые ошибки.
strengths — 1-3 сильные стороны звонка.
Если транскрипт пустой/не про продажу — верни overall:0 и объясни в verdict.

Верни СТРОГО JSON:
{"overall":0-100,"verdict":"1-2 предложения общего вердикта",
 "scores":{${academy.RUBRIC.map(r => `"${r.key}":0-100`).join(',')}},
 "dims":[{"key":"opening","label":"${academy.RUBRIC[0].label}","score":0-100,"comment":"что в этом звонке"}],
 "strengths":["..."],
 "mistakes":[{"what":"ошибка","better":"как надо (со скриптом)"}],
 "missedQuestions":["вопрос дословно"],
 "nextScripts":["готовая фраза"]}`;
  const out = await callGemini(prompt, 45000, 3000);
  if (!out || typeof out.overall === 'undefined') throw new Error('bad review');
  const clampN = (v) => Math.max(0, Math.min(100, parseInt(v) || 0));
  const arr = (a, n) => Array.isArray(a) ? a.slice(0, n).map(x => String(x).slice(0, 400)).filter(Boolean) : [];
  const scores = {};
  academy.RUBRIC.forEach(r => { scores[r.key] = clampN((out.scores || {})[r.key]); });
  const dims = academy.RUBRIC.map(r => {
    const d = (Array.isArray(out.dims) ? out.dims : []).find(x => x && x.key === r.key) || {};
    return { key: r.key, label: r.label, score: (typeof d.score !== 'undefined') ? clampN(d.score) : scores[r.key], comment: String(d.comment || '').slice(0, 500) };
  });
  return {
    overall: clampN(out.overall),
    verdict: String(out.verdict || '').slice(0, 600),
    scores, dims,
    strengths: arr(out.strengths, 3),
    mistakes: (Array.isArray(out.mistakes) ? out.mistakes.slice(0, 6) : []).map(m => ({ what: String((m || {}).what || '').slice(0, 300), better: String((m || {}).better || '').slice(0, 500) })).filter(m => m.what),
    missedQuestions: arr(out.missedQuestions, 8),
    nextScripts: arr(out.nextScripts, 5),
    at: Date.now(),
  };
}

module.exports = { available, reply, summarize, transcribe, validateReply, rewrite, tidyNote, humanize, mentalityBlock, screenCandidate, composeCollection, composeAgencyAbout, composeFirstTouch, composeCarousel, classifyPhotos, highlightHeadings, composeLeadPsych, composeScripts, huntIdeas, composePost, extractLaunch, parseTask, reviewCall, CAROUSEL_TEMPLATES, CAROUSEL_ANGLES, SHOOT_FORMATS, REELS_FORMULAS, generateImage, structureVisionSticker, masterStickerPrompt, MB_TEXT_MODES, pickPersona, HEROES, hasImage: () => !!OKEY, MODEL,
  /* низкоуровневые вызовы для AI Design Engine (studio.js): текстовый и мультимодальный Gemini */
  callGemini, callGeminiVision, hasGemini: () => !!GKEY, hasOpenAI: () => !!OKEY };
