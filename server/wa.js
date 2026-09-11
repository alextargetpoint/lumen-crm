/* Lumen CRM — адаптер WhatsApp Cloud API (официальный канал Meta).
   Активен, когда settings.wa.mode === 'cloud' и задан токен; иначе
   engine.send работает в mock-режиме (сообщение только в CRM).
   Отправка «в огонь»: статус проставляется по факту ответа Graph API,
   доставка/прочтение прилетают вебхуком statuses. */
const GRAPH = 'https://graph.facebook.com/v21.0';

function ready(db) {
  const wa = db.settings.wa;
  return wa.mode === 'cloud' && wa.token && wa.phoneId;
}

async function post(db, path, body) {
  const wa = db.settings.wa;
  const r = await fetch(`${GRAPH}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wa.token}` },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`cloud api ${r.status}: ${j.error?.message || 'unknown'}`);
  return j;
}

/* GET к Graph с текущим токеном (для проверок/чтения шаблонов) */
async function graphGet(db, path, params) {
  const wa = db.settings.wa;
  const usp = new URLSearchParams(Object.assign({ access_token: wa.token }, params || {}));
  const r = await fetch(`${GRAPH}/${path}?${usp.toString()}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `graph ${r.status}`);
  return j;
}

/* Живая проверка подключения: валиден ли токен, что за номер, качество,
   когда истекает токен, какие шаблоны есть в WABA и их статус модерации.
   Работает независимо от mode — можно проверить ДО включения боевого. */
async function verify(db) {
  const wa = db.settings.wa;
  if (!wa.token) return { ok: false, error: 'Токен не задан' };
  if (!wa.phoneId) return { ok: false, error: 'Phone Number ID не задан' };
  try {
    const ph = await graphGet(db, wa.phoneId, { fields: 'display_phone_number,verified_name,quality_rating,code_verification_status,platform_type' });
    const out = {
      ok: true, number: ph.display_phone_number || '', verifiedName: ph.verified_name || '',
      quality: ph.quality_rating || '', codeStatus: ph.code_verification_status || '', platform: ph.platform_type || '',
    };
    try { const dbg = await graphGet(db, 'debug_token', { input_token: wa.token }); const d = dbg.data || {}; out.tokenExpiresAt = d.expires_at || 0; out.tokenType = d.type || ''; out.appId = d.app_id || ''; } catch (e) { /* debug_token может быть недоступен под system-user — не критично */ }
    if (wa.wabaId) {
      try { const t = await graphGet(db, `${wa.wabaId}/message_templates`, { fields: 'name,status,category,language', limit: 100 }); out.templates = (t.data || []).map(x => ({ name: x.name, status: x.status, category: x.category, language: x.language })); }
      catch (e) { out.templatesError = e.message; }
    }
    return out;
  } catch (e) { return { ok: false, error: e.message }; }
}

async function listTemplates(db) {
  if (!db.settings.wa.wabaId) throw new Error('WABA ID не задан');
  const t = await graphGet(db, `${db.settings.wa.wabaId}/message_templates`, { fields: 'name,status,category,language,components', limit: 100 });
  return t.data || [];
}

/* Создать шаблон в WABA (модерация Meta ~минуты-часы). def — payload Graph. */
async function createTemplate(db, def) {
  if (!db.settings.wa.wabaId) throw new Error('WABA ID не задан');
  return post(db, `${db.settings.wa.wabaId}/message_templates`, def);
}

function toWaPhone(phone) { return phone.replace(/\D/g, ''); }

/* абсолютный URL для link-медиа: Meta должна суметь скачать файл извне.
   Относительный /assets/... префиксуем публичной базой (туннель/host, global.LUMEN_BASE). */
function absUrl(url) {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return (global.LUMEN_BASE || '') + url;
}

/* Скачать входящее медиа Cloud API: mediaId → временный url (нужен Bearer) → байты */
async function downloadMedia(db, mediaId) {
  const meta = await graphGet(db, mediaId, {}); // { url, mime_type, file_size, id }
  if (!meta.url) throw new Error('media: нет url');
  const r = await fetch(meta.url, { headers: { Authorization: `Bearer ${db.settings.wa.token}` } });
  if (!r.ok) throw new Error('media download ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  return { buf, mime: meta.mime_type || '', size: meta.file_size || buf.length };
}

/* Отправка медиа Cloud API по публичной ссылке. caption поддерживают только
   image/video/document; для audio/voice/sticker подпись уходит отдельным текстом (см. engine). */
async function sendMedia(db, lead, media, caption) {
  const type = ({ image: 'image', video: 'video', voice: 'audio', audio: 'audio', document: 'document', sticker: 'sticker' })[media.type] || 'document';
  const obj = { link: absUrl(media.url) };
  if (['image', 'video', 'document'].includes(type) && caption) obj.caption = caption;
  if (type === 'document' && media.name) obj.filename = media.name;
  return post(db, `${db.settings.wa.phoneId}/messages`, {
    messaging_product: 'whatsapp',
    to: toWaPhone(lead.phone),
    type,
    [type]: obj,
  });
}

/* можно ли положить подпись прямо в медиа-сообщение (иначе caption шлём отдельным текстом) */
function mediaSupportsCaption(mediaType) {
  const t = ({ image: 'image', video: 'video', voice: 'audio', audio: 'audio', document: 'document', sticker: 'sticker' })[mediaType] || 'document';
  return ['image', 'video', 'document'].includes(t);
}

async function sendText(db, lead, text) {
  return post(db, `${db.settings.wa.phoneId}/messages`, {
    messaging_product: 'whatsapp',
    to: toWaPhone(lead.phone),
    type: 'text',
    text: { preview_url: false, body: text },
  });
}

/* Шаблон: имя в Meta = id шаблона в Lumen без префикса tpl_, параметры —
   подставленные значения {name}/{geo}/… в порядке появления в теле. */
async function sendTemplate(db, lead, tpl, renderedText) {
  return post(db, `${db.settings.wa.phoneId}/messages`, {
    messaging_product: 'whatsapp',
    to: toWaPhone(lead.phone),
    type: 'template',
    template: {
      name: tpl.id.replace(/^tpl_/, ''),
      language: { code: tpl.lang === 'ru' ? 'ru' : 'en' },
      components: [{ type: 'body', parameters: [{ type: 'text', text: renderedText }] }],
    },
  });
}

/* Разбор statuses из вебхука: delivered/read → статус сообщения в CRM */
function applyStatuses(db, value) {
  const statuses = value?.statuses || [];
  let changed = false;
  for (const st of statuses) {
    const m = db.messages.find(x => x.waId === st.id);
    if (m && ['delivered', 'read', 'failed'].includes(st.status)) { m.status = st.status; changed = true; }
  }
  return changed;
}

module.exports = { ready, sendText, sendTemplate, sendMedia, downloadMedia, mediaSupportsCaption, applyStatuses, verify, listTemplates, createTemplate };
