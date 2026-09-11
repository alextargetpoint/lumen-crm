/* Lumen CRM — двусторонний мост Telegram ⇄ WhatsApp.
   Брокер отвечает клиенту прямо из личного Telegram (не открывая CRM), а сообщение
   уходит клиенту в WhatsApp с центрального номера. И наоборот: входящие клиента
   (текст + фото/видео/файлы/голосовые) пересылаются назначенному брокеру в Telegram.

   Идея: номер централизован (труба живёт в CRM/агенте), персона сохраняется,
   всё логируется, но брокер мобилен — работает с телефона в привычном мессенджере.

   Паритет медиа: image / video / audio / voice / document / sticker в обе стороны.

   Привязка брокера: брокер пишет боту `/start <код>` (код из «Подключения → Мост Telegram»)
   → его Telegram-chat_id закрепляется за брокером. Дальше он отвечает reply на сообщение
   клиента (или пишет — уходит «активному» лиду), и текст/медиа летит в WhatsApp. */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const store = require('./store');
const ai = require('./ai');
const engine = require('./engine');

/* каталог медиа моста — тот же, что для входящих WA (см. index.js saveWaMedia) */
let MEDIA_DIR = path.join(__dirname, '..', 'public', 'assets', 'wa-media');
let MEDIA_URL_BASE = '/assets/wa-media';
function setMediaDir(dir, urlBase) { MEDIA_DIR = dir; if (urlBase) MEDIA_URL_BASE = urlBase; }

/* ---------- конфиг / готовность ---------- */
function cfg(db) { return db.settings.tgBridge || {}; }
function token(db) { return cfg(db).botToken || (db.settings.channels && db.settings.channels.tg && db.settings.channels.tg.botToken) || ''; }
function ready(db) { return !!(cfg(db).enabled && token(db)); }

function rt(db) {
  if (!db.tgBridge) db.tgBridge = {};
  if (!db.tgBridge.replyMap) db.tgBridge.replyMap = {};
  if (!db.tgBridge.topicMap) db.tgBridge.topicMap = {};   /* `${groupChatId}:${threadId}` → leadId (режим топиков) */
  return db.tgBridge;
}
function hashStr(s) { let h = 0; for (let i = 0; i < String(s).length; i++) { h = (h * 31 + String(s).charCodeAt(i)) | 0; } return h; }
function pruneMap(db) {
  const map = rt(db).replyMap;
  const keys = Object.keys(map);
  if (keys.length <= 900) return;
  keys.sort((a, b) => (map[a].at || 0) - (map[b].at || 0));
  for (const k of keys.slice(0, keys.length - 700)) delete map[k];
}

function absUrl(url) {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return (global.LUMEN_BASE || '') + url;
}

/* ---------- Telegram Bot API ---------- */
async function api(db, method, body) {
  const t = token(db);
  if (!t) throw new Error('нет botToken моста');
  const r = await fetch(`https://api.telegram.org/bot${t}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`telegram ${method}: ${j.description || r.status}`);
  return j;
}

/* getFile → скачать байты файла Telegram */
async function downloadTgFile(db, fileId) {
  const t = token(db);
  const gf = await (await fetch(`https://api.telegram.org/bot${t}/getFile?file_id=${encodeURIComponent(fileId)}`)).json();
  const fp = gf.result && gf.result.file_path;
  if (!fp) throw new Error('getFile: нет file_path');
  const r = await fetch(`https://api.telegram.org/file/bot${t}/${fp}`);
  if (!r.ok) throw new Error('file download ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  const ext = (String(fp).split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  return { buf, ext };
}

function saveMedia(buf, ext) {
  if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const name = crypto.randomBytes(6).toString('hex') + '.' + (ext || 'bin');
  fs.writeFileSync(path.join(MEDIA_DIR, name), buf);
  return { url: MEDIA_URL_BASE + '/' + name };
}

/* ---------- маппинг типов ---------- */
/* тип медиа Telegram → тип медиа Lumen/WhatsApp */
function tgFieldToMedia(msg) {
  if (msg.photo && msg.photo.length) return { field: 'photo', fileId: msg.photo[msg.photo.length - 1].file_id, type: 'image' };
  if (msg.video) return { field: 'video', fileId: msg.video.file_id, type: 'video', name: msg.video.file_name };
  if (msg.video_note) return { field: 'video_note', fileId: msg.video_note.file_id, type: 'video' };
  if (msg.animation) return { field: 'animation', fileId: msg.animation.file_id, type: 'video' };
  if (msg.voice) return { field: 'voice', fileId: msg.voice.file_id, type: 'voice' };
  if (msg.audio) return { field: 'audio', fileId: msg.audio.file_id, type: 'audio', name: msg.audio.file_name };
  if (msg.document) return { field: 'document', fileId: msg.document.file_id, type: 'document', name: msg.document.file_name };
  if (msg.sticker) return { field: 'sticker', fileId: msg.sticker.file_id, type: 'image' };
  return null;
}

/* тип медиа Lumen → метод Bot API для отправки брокеру */
const TG_SEND = {
  image: ['sendPhoto', 'photo'], video: ['sendVideo', 'video'], audio: ['sendAudio', 'audio'],
  voice: ['sendVoice', 'voice'], document: ['sendDocument', 'document'], sticker: ['sendPhoto', 'photo'],
};

/* извлечь медиа из апдейта Telegram → скачать → сохранить → {type,url,name} */
async function extractTgMedia(db, msg) {
  const info = tgFieldToMedia(msg);
  if (!info) return null;
  const { buf, ext } = await downloadTgFile(db, info.fileId);
  const saved = saveMedia(buf, ext);
  return { type: info.type, url: saved.url, name: (info.name || '').slice(0, 120) };
}

/* ---------- привязка брокера ---------- */
function bindBroker(db, chatId, code) {
  const c = String(code || '').trim().toLowerCase();
  if (!c) return { ok: false };
  const broker = db.brokers.find(b => String(b.tgBindCode || '').toLowerCase() === c);
  if (!broker) return { ok: false };
  db.brokers.forEach(b => { if (b.tgChatId === chatId && b.id !== broker.id) b.tgChatId = null; });
  broker.tgChatId = chatId;
  store.save();
  return { ok: true, broker };
}

/* какому лиду адресован ответ брокера: reply на пересланное сообщение → точный лид,
   иначе — последний «активный» лид этого брокера */
function resolveLead(db, broker, msg) {
  const chatId = broker.tgChatId;
  const rep = msg.reply_to_message;
  if (rep) {
    const e = rt(db).replyMap[`${chatId}:${rep.message_id}`];
    if (e) { const l = db.leads.find(x => x.id === e.leadId); if (l) return l; }
  }
  if (broker.tgActiveLeadId) return db.leads.find(x => x.id === broker.tgActiveLeadId) || null;
  return null;
}

/* ---------- ВХОДЯЩИЙ апдейт из Telegram (брокер → WhatsApp) ---------- */
async function handleUpdate(db, update) {
  const msg = (update && (update.message || update.edited_message)) || null;
  if (!msg || !msg.chat) return { skip: 'no message' };
  const chatId = String(msg.chat.id);
  const text = (msg.text || msg.caption || '').trim();

  /* привязка: /start <код> */
  if (text.startsWith('/start')) {
    const code = text.split(/\s+/)[1] || '';
    const r = bindBroker(db, chatId, code);
    await safeApi(db, 'sendMessage', {
      chat_id: chatId,
      text: r.ok
        ? `✅ Привязано: ${r.broker.name}.\nТеперь отвечайте reply на сообщения клиентов — они уйдут клиенту в WhatsApp от вашего имени.`
        : '❌ Код не найден. Возьмите свой код в CRM → Подключения → Мост Telegram.',
    });
    return { bound: r.ok };
  }

  const broker = db.brokers.find(b => b.tgChatId === chatId);
  if (!broker) {
    await safeApi(db, 'sendMessage', { chat_id: chatId, text: 'Вы не привязаны к CRM. Отправьте /start <код> (код в CRM → Подключения → Мост Telegram).' });
    return { skip: 'unbound' };
  }

  const lead = resolveLead(db, broker, msg);
  if (!lead) {
    await safeApi(db, 'sendMessage', { chat_id: chatId, text: '↩️ Ответьте reply на сообщение клиента, чтобы я знал, кому переслать.' });
    return { skip: 'no lead' };
  }

  let media = null;
  try { media = await extractTgMedia(db, msg); }
  catch (e) {
    await safeApi(db, 'sendMessage', { chat_id: chatId, text: '⚠️ Не смог забрать вложение из Telegram: ' + e.message });
    return { skip: 'media fail' };
  }
  if (!media && !text) return { skip: 'empty' };

  /* уходит клиенту в WhatsApp как ручное сообщение брокера (via='human') */
  engine.send(db, lead, text, 'human', { channel: 'wa', media: media || undefined });

  /* человек перехватил — автопилот на паузе (правило autoOff.onHumanReply) */
  if (!db.settings.ai || !db.settings.ai.autoOff || db.settings.ai.autoOff.onHumanReply !== false) {
    lead.ai.enabled = false;
    lead.ai.pausedBy = 'broker';
    lead.tags = [...new Set([...(lead.tags || []), 'ведёт брокер'])];
  }
  broker.tgActiveLeadId = lead.id;
  ai.pushEvent(db, { type: 'note', leadId: lead.id, text: `${broker.name} ответил из Telegram${media ? ` (${media.type})` : ''}` });
  store.save();
  return { sent: true, leadId: lead.id, media: media ? media.type : null };
}

/* ---------- ИСХОДЯЩИЙ: клиент написал → назначенному брокеру в Telegram ---------- */
async function sendMediaToBroker(db, chatId, media, caption) {
  const [method, field] = TG_SEND[media.type] || ['sendDocument', 'document'];
  const body = { chat_id: chatId, [field]: absUrl(media.url) };
  if (caption) body.caption = caption.slice(0, 1024);
  return api(db, method, body);
}

async function forwardInbound(db, lead, m) {
  if (!ready(db) || !lead || !lead.broker) return;
  const broker = db.brokers.find(b => b.id === lead.broker);
  if (!broker || !broker.tgChatId) return;
  const geo = (db.settings.geoNames && db.settings.geoNames[lead.geo]) || lead.geo || '';
  const head = `👤 ${lead.name}${geo ? ` · ${geo}` : ''}`;
  const caption = `${head}\n${m.text || ''}`.trim();
  let sent;
  try {
    if (m.media && m.media.url) sent = await sendMediaToBroker(db, broker.tgChatId, m.media, caption);
    else sent = await api(db, 'sendMessage', { chat_id: broker.tgChatId, text: caption });
  } catch (e) { console.error('[tgbridge] forwardInbound', e.message); return; }
  const mid = sent && sent.result && sent.result.message_id;
  if (mid) { rt(db).replyMap[`${broker.tgChatId}:${mid}`] = { leadId: lead.id, at: Date.now() }; pruneMap(db); }
  broker.tgActiveLeadId = lead.id;
  store.save();
}

/* передача лида брокеру → короткий бриф в его Telegram */
async function forwardHandover(db, lead) {
  if (!ready(db) || !lead || !lead.broker) return;
  const broker = db.brokers.find(b => b.id === lead.broker);
  if (!broker || !broker.tgChatId) return;
  const txt = `🤝 Новый лид вам: ${lead.name}\n\n${lead.summary || ''}\n\nОтвечайте reply на сообщения этого клиента — уйдёт клиенту в WhatsApp от вашего имени.`.trim();
  try { const sent = await api(db, 'sendMessage', { chat_id: broker.tgChatId, text: txt }); if (sent.result) { rt(db).replyMap[`${broker.tgChatId}:${sent.result.message_id}`] = { leadId: lead.id, at: Date.now() }; pruneMap(db); } }
  catch (e) { console.error('[tgbridge] forwardHandover', e.message); return; }
  broker.tgActiveLeadId = lead.id;
  store.save();
}

async function safeApi(db, method, body) { try { return await api(db, method, body); } catch (e) { console.error('[tgbridge]', method, e.message); return null; } }

/* поставить вебхук у Telegram на наш /tg/webhook с секрет-токеном */
async function setupWebhook(db, baseUrl) {
  const url = baseUrl.replace(/\/$/, '') + '/tg/webhook';
  return api(db, 'setWebhook', {
    url,
    secret_token: cfg(db).secret,
    allowed_updates: ['message', 'edited_message'],
    drop_pending_updates: true,
  });
}

/* кнопка-меню бота, открывающая мессенджер-мини-апп (Telegram Web App) */
async function setMenuButton(db, baseUrl) {
  const url = baseUrl.replace(/\/$/, '') + '/tgapp';
  return api(db, 'setChatMenuButton', { menu_button: { type: 'web_app', text: '💬 Чаты', web_app: { url } } });
}

/* прямое уведомление в чат Telegram (для алертов делегату контроля) */
async function notify(db, chatId, text) {
  if (!chatId || !token(db)) return;
  try { await api(db, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' }); } catch (e) { console.error('[tg-notify]', e.message); }
}

module.exports = {
  ready, cfg, token, handleUpdate, forwardInbound, forwardHandover, bindBroker,
  setupWebhook, setMenuButton, setMediaDir, saveMedia, extractTgMedia, resolveLead, absUrl, notify,
};
