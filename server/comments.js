/* Lumen CRM — «Комментарии под рекламой → лиды» (comment-to-lead).
   Человек пишет комментарий под рекламной публикацией (Instagram/Facebook) →
   создаётся карточка лида + тред комментария. Дальше: публичный ответ под
   комментом и/или приватный ответ в директ (Meta private_replies — 1 личное
   сообщение на коммент в течение 7 дней), который уводит лида в диалог.

   Боевой канал — Graph API (адаптер graphReply/graphPrivate/graphHide, активен
   при settings.social.{ig|fb}.token). Без токенов — mock: ответы живут в CRM,
   петля видна в демо. Единый приём — ingest(). */
const GRAPH = 'https://graph.facebook.com/v20.0';
const llm = require('./llm');
const ai = require('./ai');
const store = require('./store');

/* ---------- ИИ-классификация интента: regex-ядро (бесплатно, мгновенно) ---------- */
const INTENT_RULES = [
  ['price', /(сколько|цена|стоит|почём|почем|price|how much|\$|руб|₽|дирхам|aed)/i],
  ['payment', /(рассрочк|ипотек|mortgage|installment|платеж|первонач)/i],
  ['interest', /(интересн|интересует|хочу|нужн|подробн|расскажите|детал|interested|dm|в личк|напишите)/i],
  ['location', /(район|где|локац|адрес|location|area|метро|пляж)/i],
  ['negative', /(развод|обман|scam|фейк|врут|дорого\s*же|ужас|отстой)/i],
  ['spam', /(http|@\w+\.\w|подпишись|заработок|казино|ставк|promo code)/i],
];
function classifyIntent(text) {
  const t = String(text || '');
  for (const [intent, re] of INTENT_RULES) if (re.test(t)) return intent;
  return t.trim().endsWith('?') ? 'question' : 'other';
}
const INTENT_RU = { price: 'спрашивает цену', payment: 'про рассрочку/ипотеку', interest: 'проявил интерес', location: 'про локацию', question: 'вопрос', negative: 'негатив', spam: 'спам', other: 'комментарий' };
const INTENT_HOT = ['price', 'payment', 'interest', 'location', 'question'];

/* ---------- нормализация входящего комментария (Meta webhook ИЛИ ручной POST) ---------- */
function normalize(body) {
  /* Meta comments webhook: entry[].changes[].value{ from{id,name/username}, message, comment_id, post_id, parent_id, media{id} } */
  const v = body.value || body;
  const from = v.from || {};
  return {
    platform: body.platform || (v.media || v.instagram ? 'ig' : (v.post_id && String(v.post_id).includes('_') ? 'fb' : (body.igId ? 'ig' : 'fb'))),
    commentId: String(v.comment_id || v.id || body.commentId || ''),
    postId: String(v.post_id || v.media?.id || body.postId || ''),
    adId: body.adId || body.ad_id || v.ad_id || null,
    author: {
      extId: String(from.id || body.userId || 'anon_' + Math.random().toString(36).slice(2, 8)),
      name: from.name || from.username || body.name || 'Комментатор',
      username: from.username || body.username || '',
    },
    text: String(v.message || v.text || body.text || '').slice(0, 1000),
    at: (v.created_time ? Date.parse(v.created_time) : null) || Date.now(),
    parentId: v.parent_id || body.parentId || null,
  };
}

/* ---------- приём: коммент → тред + лид ---------- */
function ingest(db, body, matchAd) {
  db.adComments = db.adComments || [];
  const c = normalize(body);
  if (!c.text.trim()) return null;
  /* дедуп самого комментария (Meta может дублировать вебхук) */
  if (c.commentId && db.adComments.some(x => x.commentId === c.commentId)) return null;

  /* объявление по postId (у объявления может быть postId/permalink) */
  const ad = db.ads.find(a => a.postId && String(a.postId) === c.postId) || (c.adId ? db.ads.find(a => String(a.adId) === String(c.adId)) : null);

  /* лид: дедуп по соцсети-идентификатору (телефона у комментатора нет) */
  let lead = db.leads.find(l => l.social && l.social[c.platform] === c.author.extId);
  const fresh = !lead;
  if (!lead) {
    lead = {
      id: store.nextId('ld'),
      name: c.author.name, phone: '',
      geo: (ad && ad.geo) || db.settings.agency.geos[0], lang: 'ru', tz: 4,
      stage: 'new', score: 0, source: 'ad_comment', createdAt: Date.now(),
      lastMsgAt: null, lastDir: null,
      quals: { purpose: null, timeline: null, budget: null, type: null },
      ai: { enabled: false, chainStep: 0, nextTouchAt: null, silentSince: null }, /* коммент-лид не в WA-цепочке до директа */
      broker: null, summary: null, tags: ['из комментария', c.platform === 'ig' ? 'Instagram' : 'Facebook'],
      numberId: null, notes: [], contacts: [], transcripts: [],
      social: { [c.platform]: c.author.extId, username: c.author.username },
      activeChannel: c.platform,
      channels: { wa: 'unknown', tg: 'unknown', viber: 'unknown', email: 'unknown', [c.platform]: 'yes' },
      ads: ad ? { adId: ad.adId } : null,
    };
    if (c.author.username) lead.contacts.push({ kind: c.platform, value: '@' + c.author.username });
    if (ad && matchAd) matchAd(db, lead);
    db.leads.push(lead);
  }

  const intent = classifyIntent(c.text);
  const comment = {
    id: store.nextId('cm'),
    platform: c.platform, commentId: c.commentId, postId: c.postId,
    adId: ad ? ad.adId : (c.adId || null), adName: ad ? ad.name : null,
    author: c.author, text: c.text, at: c.at, parentId: c.parentId,
    intent, status: 'new', leadId: lead.id, aiHandled: false, replies: [],
  };
  db.adComments.unshift(comment);
  if (db.adComments.length > 500) db.adComments.length = 500;

  ai.pushEvent(db, { type: 'comment', leadId: lead.id, text: `${fresh ? 'Новый лид из комментария' : 'Ещё комментарий'}: ${c.author.name} под «${ad ? ad.name : 'рекламой'}» — ${INTENT_RU[intent]}` });
  return { comment, lead, fresh, hot: INTENT_HOT.includes(intent) };
}

/* ---------- Graph-адаптеры (боевой Meta); в mock — no-op, ответ живёт в CRM ---------- */
function social(db, platform) { return (db.settings.social || {})[platform] || {}; }
function ready(db, platform) { const s = social(db, platform); return !!(s.token && s.enabled); }
async function graphCall(token, path, body) {
  const r = await fetch(`${GRAPH}/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`graph ${r.status}: ${j.error?.message || 'unknown'}`);
  return j;
}
async function sendReply(db, comment, kind, text) {
  const s = social(db, comment.platform);
  if (ready(db, comment.platform) && comment.commentId) {
    if (kind === 'public') await graphCall(s.token, `${comment.commentId}/comments`, { message: text });
    else await graphCall(s.token, `${comment.commentId}/private_replies`, { message: text });
  }
  comment.replies.push({ at: Date.now(), dir: 'out', kind, text, live: ready(db, comment.platform) });
  if (comment.status === 'new') comment.status = 'replied';
  return comment;
}
async function hide(db, comment, isHidden) {
  const s = social(db, comment.platform);
  if (ready(db, comment.platform) && comment.commentId) {
    try { await graphCall(s.token, comment.commentId, { is_hidden: !!isHidden }); } catch (e) { /* mock/ошибка — скрываем локально */ }
  }
  comment.status = isHidden ? 'hidden' : 'new';
  return comment;
}

/* ---------- ИИ авто-ответ (cost-safe: включается тумблером) ----------
   Горячий интент → короткий публичный ответ («ответил в личку 👇») + приватный
   ответ с оффером, который уводит в директ. Ошибка/нет ключей → ядро-скрипты. */
async function autoReply(db, res) {
  const { comment, lead, hot } = res;
  if (!hot || comment.aiHandled) return;
  if (!(db.settings.comments && db.settings.comments.autoReply)) return;
  const ag = db.settings.agency.name;
  const priceLine = comment.adName && /от \$?(\d[\d\s]*)/.exec(comment.adName || '');
  let pub = 'Отправили детали вам в личные сообщения 👌';
  let priv = `Здравствуйте! Спасибо за интерес к нашему предложению. Пришлю подборку с ценами и планами оплаты — подскажите, рассматриваете под переезд или под доход? — ${ag}`;
  if (llm.available()) {
    try {
      const out = await llm.rewrite(priv, 'friendly', `Комментарий клиента под рекламой недвижимости: "${comment.text}". Ответ в директ, коротко, по-человечески, зови продолжить диалог.`);
      if (out && out.trim()) priv = out.trim().slice(0, 500);
    } catch (e) { /* ядро */ }
  }
  await sendReply(db, comment, 'public', pub);
  await sendReply(db, comment, 'private', priv);
  comment.aiHandled = true;
  /* приватный ответ = старт диалога: сообщение в ленту лида, лид оживает */
  db.messages.push({ id: store.nextId('m'), leadId: lead.id, dir: 'out', via: 'ai', channel: comment.platform, text: priv, at: Date.now(), status: 'sent' });
  lead.lastMsgAt = Date.now(); lead.lastDir = 'out'; lead.ai.enabled = true;
  ai.pushEvent(db, { type: 'msg_in', leadId: lead.id, text: `ИИ ответил на комментарий ${lead.name} и увёл в директ` });
}

module.exports = { ingest, sendReply, hide, autoReply, classifyIntent, INTENT_RU, INTENT_HOT, ready };
