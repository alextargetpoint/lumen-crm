/* Lumen CRM — Instagram Direct (IG DM) как канал диалога.
   АДДИТИВНО к WA/TG/email: приём входящих IG DM достраивается в существующей IG-ветке WA-вебхука
   (index.js) через единый engine.inbound(... channel:'ig_dm'), а исходящий — через ветку engine.send
   (channel==='ig_dm'), которая зовёт sendDM отсюда. Токены переиспользуем из settings.social.ig
   (как в comments.js): { enabled, token, igId }. Рабочие пути WA/TG этот модуль не трогает.

   Instagram Messaging Send API: POST graph.facebook.com/v20.0/{IG_ID}/messages
     body { recipient:{ id:<IGSID> }, message:{ text } | { attachment:{type:'image',payload:{url}} } }
     auth: access_token страницы/бизнес-аккаунта (тот же, что для comments). */

const GRAPH = 'https://graph.facebook.com/v20.0';

function cfg(db) { return ((db.settings || {}).social || {}).ig || {}; }
function ready(db) { const s = cfg(db); return !!(s.enabled && s.token && s.igId); }

async function graphCall(token, path, body) {
  const r = await fetch(`${GRAPH}/${path}?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('ig ' + r.status + ': ' + ((j.error && j.error.message) || r.status));
  return j;
}

/* отправка одного исходящего IG DM лиду. Возвращает true при успехе, иначе бросает (ловится в engine.send). */
async function sendDM(db, lead, text, media) {
  const s = cfg(db);
  if (!ready(db)) throw new Error('IG-канал не подключён (settings.social.ig)');
  const igsid = lead && lead.igsid;
  if (!igsid) throw new Error('у лида нет igsid');
  let message;
  if (media && media.url) message = { attachment: { type: (media.type === 'video' ? 'video' : 'image'), payload: { url: String(media.url) } } };
  else message = { text: String(text || '') };
  await graphCall(s.token, `${s.igId}/messages`, { recipient: { id: String(igsid) }, message });
  return true;
}

module.exports = { ready, sendDM, graphCall };
