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

/* ИИ первое касание: разбор лида + готовое персональное сообщение (+ короткий анализ) */
async function composeFirstTouch(db, lead, draft, agencyName) {
  const geoName = (db.settings.geoNames || {})[lead.geo] || lead.geo || '';
  const adName = lead.ads && lead.ads.matched ? lead.ads.adName : '';
  const prompt = `Ты — сильный брокер зарубежной недвижимости в агентстве «${String(agencyName || 'агентство').slice(0, 80)}». Нужно первое касание клиенту в WhatsApp.
Пиши как живой русскоязычный человек: коротко (2-4 предложения), тепло, по делу, без клише и канцелярита, без длинных простыней. Заверши мягким вопросом, который двигает диалог (цель/бюджет/сроки).
ДАННЫЕ ЛИДА: имя ${lead.name || '—'}, направление ${geoName}, источник ${lead.source || '—'}${adName ? ', пришёл с объявления «' + adName + '»' : ''}.
${draft ? 'ЧЕРНОВИК МЕНЕДЖЕРА (улучши его, сохранив смысл):\n' + String(draft).slice(0, 800) : 'Черновика нет — напиши с нуля.'}
Верни строго JSON:
{"message":"текст первого сообщения клиенту (обращение по имени, если оно есть; без плейсхолдеров в фигурных скобках)",
 "analysis":"1-2 предложения для менеджера: что за лид и на что давить в касании"}`;
  const out = await callGemini(prompt, 18000, 900);
  if (!out || typeof out.message !== 'string' || !out.message.trim()) throw new Error('bad first-touch');
  const msg = out.message.trim().slice(0, 900);
  if (/\{[a-z_]+\}/i.test(msg)) throw new Error('брак: плейсхолдер в тексте');
  return { message: msg, analysis: String(out.analysis || '').slice(0, 400) };
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
      n: 1,
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('image ' + r.status + ': ' + (j.error?.message || ''));
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new Error('image empty');
  return Buffer.from(b64, 'base64');
}

/* ИИ-генератор карусели для соцсетей (недвижимость): заголовок + слайды */
const CAROUSEL_TEMPLATES = {
  project: { name: 'Новый проект', brief: 'обзор нового жилого проекта/ЖК: крючок, локация, планировки/цены, инфраструктура, доходность, призыв' },
  reasons: { name: '3–5 причин инвестировать', brief: 'причины инвестировать в направление/объект: сильные аргументы по одному на слайд, финальный призыв' },
  review: { name: 'Отзыв клиента / кейс', brief: 'история клиента: запрос → что подобрали → результат (доход/переезд), по-человечески, финальный призыв' },
  digest: { name: 'Подборка недели', brief: '3–4 объекта недели: по объекту на слайд (крючок + цена + фишка), финальный призыв' },
  tips: { name: 'Гид покупателя', brief: 'полезные советы по покупке недвижимости за рубежом: по одному совету на слайд, экспертно, финальный призыв' },
};
async function composeCarousel(topic, templateKey, count, agencyName, geo) {
  const t = CAROUSEL_TEMPLATES[templateKey] || CAROUSEL_TEMPLATES.project;
  const n = Math.max(4, Math.min(10, +count || 6));
  const prompt = `Ты — SMM-копирайтер агентства недвижимости «${String(agencyName || 'агентство').slice(0, 80)}». Сделай текст для карусели в Instagram/Threads на ${n} слайдов.
Формат: ${t.name} — ${t.brief}.
${topic ? 'Тема/вводные: ' + String(topic).slice(0, 400) + '\n' : ''}${geo ? 'Направление: ' + geo + '\n' : ''}
Правила: живой человеческий язык, без клише и канцелярита, коротко (заголовок ≤ 40 символов, подпись ≤ 120). Первый слайд — сильный крючок. Последний — призыв к действию (написать в директ/оставить заявку). Цифры не выдумывай, если их нет во вводных — используй обтекаемо.
Верни строго JSON:
{"title":"название карусели (для внутреннего списка)",
 "slides":[{"heading":"заголовок слайда","sub":"подпись 1-2 строки"}]}  // ровно ${n} слайдов`;
  const out = await callGemini(prompt, 25000, 2000);
  if (!out || !Array.isArray(out.slides) || !out.slides.length) throw new Error('bad carousel');
  return {
    title: String(out.title || t.name).slice(0, 120),
    slides: out.slides.slice(0, 10).map(s => ({ heading: String(s.heading || '').slice(0, 90), sub: String(s.sub || '').slice(0, 240) })),
  };
}

module.exports = { available, reply, summarize, transcribe, validateReply, rewrite, composeCollection, composeAgencyAbout, composeFirstTouch, composeCarousel, CAROUSEL_TEMPLATES, generateImage, pickPersona, HEROES, hasImage: () => !!OKEY, MODEL };
