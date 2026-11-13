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

/* ---------- ЦЕНТРАЛЬНЫЙ (платформенный) бот ----------
   Один бот Lumen на ВСЕ агентства: токен в env LUMEN_TG_BRIDGE_TOKEN (Railway). Когда задан — включается
   central-режим: агентства НЕ заводят свой бот, а привязка идёт по ключу агентства (/start <ключ>), роутинг —
   по глобальному индексу chatId→tid (registry.tgChatIndex). Не задан → прежняя модель «бот на агентство». */
/* токен центрального бота: env (LUMEN_TG_BRIDGE_TOKEN) ИЛИ платформенный из реестра (задаётся в CRM
   владельцем платформы — чтобы не воевать с Railway-переменными и чтобы это было проверяемо). */
function platformToken() {
  if (process.env.LUMEN_TG_BRIDGE_TOKEN) return process.env.LUMEN_TG_BRIDGE_TOKEN;
  try { const reg = store.getRegistry(); return (reg.platformBridge && reg.platformBridge.token) || ''; } catch (_) { return ''; }
}
function central() { return !!platformToken(); }
/* секрет вебхука центрального бота: из env или детерминированно из токена (стабилен между рестартами) */
function platformSecret() { const t = platformToken(); return process.env.LUMEN_TG_BRIDGE_SECRET || (t ? crypto.createHash('sha256').update('lumen-central:' + t).digest('hex').slice(0, 24) : ''); }

/* ---------- конфиг / готовность ---------- */
function cfg(db) { return db.settings.tgBridge || {}; }
/* в central-режиме исходящие идут через платформенный бот; иначе — бот агентства */
function token(db) { return platformToken() || cfg(db).botToken || (db.settings.channels && db.settings.channels.tg && db.settings.channels.tg.botToken) || ''; }
function ready(db) { return central() ? true : !!(cfg(db).enabled && token(db)); }

/* ---------- НЕСКОЛЬКО Telegram-аккаунтов у одного брокера ----------
   broker.tgChatIds — массив chatId (может быть несколько своих аккаунтов/устройств). broker.tgChatId
   держим как ПЕРВИЧНЫЙ (последний привязанный) для обратной совместимости старых чтений в index.js. */
function brokerChatIds(b) {
  if (!b) return [];
  if (Array.isArray(b.tgChatIds) && b.tgChatIds.length) return b.tgChatIds.map(String);
  return b.tgChatId ? [String(b.tgChatId)] : [];
}
function addBrokerChat(b, chatId) {
  chatId = String(chatId);
  const ids = brokerChatIds(b);
  if (!ids.includes(chatId)) ids.push(chatId);
  b.tgChatIds = ids;
  b.tgChatId = chatId;   /* первичный = последний привязанный */
}
function removeBrokerChat(b, chatId) {
  const ids = brokerChatIds(b).filter(x => x !== String(chatId));
  b.tgChatIds = ids;
  b.tgChatId = ids[0] || null;
}

/* ---------- owner-пульт в боте (инъекция из index.js) ----------
   index.js регистрирует обработчик owner-команд (напр. /qr — новый QR номера),
   чтобы tgbridge не тянул waGrayApi/воркер (избежать циклического require). */
let waQr = null;
function setWaQr(fn) { waQr = fn; }

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
  /* этот chatId не может принадлежать двум брокерам — убираем его у других */
  db.brokers.forEach(b => { if (b.id !== broker.id) removeBrokerChat(b, chatId); });
  const already = brokerChatIds(broker).includes(String(chatId));
  addBrokerChat(broker, chatId);   /* ДОБАВляем (не заменяем) — у брокера может быть несколько своих аккаунтов */
  store.save();
  return { ok: true, broker, already, count: brokerChatIds(broker).length };
}

/* какому лиду адресован ответ брокера: reply на пересланное сообщение → точный лид,
   иначе — последний «активный» лид этого брокера */
function resolveLead(db, broker, msg, chatId) {
  chatId = String(chatId || broker.tgChatId);   /* ответ пришёл с конкретного аккаунта — его chatId */
  const rep = msg.reply_to_message;
  if (rep) {
    const e = rt(db).replyMap[`${chatId}:${rep.message_id}`];
    if (e) { const l = db.leads.find(x => x.id === e.leadId); if (l) return l; }
  }
  if (broker && broker.tgActiveLeadId) return db.leads.find(x => x.id === broker.tgActiveLeadId) || null;
  if (!broker && db.settings.ownerTgActiveLeadId) return db.leads.find(x => x.id === db.settings.ownerTgActiveLeadId) || null;   /* основатель: последний активный лид (ответ без reply) */
  return null;
}

/* ⭐ПИКЕР НОМЕРА-ОТПРАВИТЕЛЯ в Telegram (запрос SFG 12.11): те же опции, что в веб-диалоге — общий пул / личный
   номер. Анти-бан: личный номер залочен (🔒) до первого ответа клиента. Для брокера — его закреплённый номер,
   для основателя (broker=null) — все личные номера. Два режима пула (waGray.showPoolNumbers). */
function tgSenderOptions(db, lead, broker) {
  const g = db.settings.waGray || {};
  const nums = g.numbers || [];
  const hasInbound = (db.messages || []).some(x => x.leadId === lead.id && x.dir === 'in' && !x.system);
  const pool = nums.filter(n => !n.brokerId);
  const brokerNm = (bid) => { const b = (db.brokers || []).find(x => x.id === bid); return b ? b.name : 'менеджер'; };
  const myBid = broker ? broker.id : null;
  const pers = nums.filter(n => n.brokerId && (!myBid || n.brokerId === myBid));
  const opts = [];
  if (g.showPoolNumbers && pool.length) { for (const n of pool) opts.push({ v: n.phone, label: 'Пул +' + (n.realPhone || n.phone) }); }
  else opts.push({ v: '', label: 'Общий пул' });
  for (const n of pers) opts.push({ v: n.phone, label: brokerNm(n.brokerId) + ' +' + (n.realPhone || n.phone), pers: true, locked: !hasInbound });
  return opts;
}
function tgSenderKeyboard(db, lead, broker) {
  const opts = tgSenderOptions(db, lead, broker);
  if (opts.length < 2) return undefined;   /* нечего выбирать (только пул) — кнопки не нужны */
  const cur = lead.tgSenderPhone || '';
  return { inline_keyboard: opts.map(o => [{ text: (o.v === cur ? '✅ ' : '') + (o.pers ? '👤 ' : '📣 ') + o.label + (o.locked ? ' 🔒' : ''), callback_data: 'tgfrom:' + (o.v || 'pool') + ':' + lead.id }]) };
}

/* ---------- ВХОДЯЩИЙ апдейт из Telegram (брокер → WhatsApp) ---------- */
async function handleUpdate(db, update) {
  /* ⭐inline-кнопка «Показать QR-код» (callback_data «qr:<phone>») — номер отвалился, клиент жмёт кнопку
     прямо в боте → подтягиваем свежий QR тем же потоком, что и /qr. Решает «QR живёт минуту, не успел». */
  if (update && update.callback_query) {
    const cq = update.callback_query;
    const cbChat = String((cq.message && cq.message.chat && cq.message.chat.id) || (cq.from && cq.from.id) || '');
    const data = String(cq.data || '');
    if (!data.startsWith('tgfrom:')) { try { await safeApi(db, 'answerCallbackQuery', { callback_query_id: cq.id, text: data.startsWith('qr:') ? 'Готовлю свежий QR…' : '' }); } catch (_) {} }
    if (data.startsWith('qr:') && waQr && cbChat) {
      /* без форс-«!»: отвалившийся номер пересоберётся (он не connected), а по рабочему номеру придёт «уже на связи»
         вместо разрушительного force-logout — безопасно для тап-панели по ВСЕМ номерам (клик по 🟢 не рвёт сессию). */
      try { await waQr(db, cbChat, '/qr ' + data.slice(3)); } catch (e) { console.error('[tgbridge] cb qr', e.message); }
    }
    /* ⭐ВЫБОР НОМЕРА-ОТПРАВИТЕЛЯ (кнопка под сообщением клиента): «tgfrom:<phone|pool>:<leadId>». */
    if (data.startsWith('tgfrom:')) {
      const _p = data.split(':'); const want = _p[1]; const leadId = _p.slice(2).join(':');
      const lead = db.leads.find(l => l.id === leadId);
      const brk = db.brokers.find(b => brokerChatIds(b).includes(cbChat)) || null;
      let toastTxt = 'Готово';
      if (!lead) toastTxt = 'Лид не найден';
      else if (want === 'pool') { lead.tgSenderPhone = ''; store.save(); toastTxt = '📣 Пишем с общего пула'; }
      else {
        const picked = ((db.settings.waGray || {}).numbers || []).find(n => n.phone === want);
        const hasIn = (db.messages || []).some(x => x.leadId === lead.id && x.dir === 'in' && !x.system);
        if (picked && picked.brokerId && !hasIn) toastTxt = '🔒 Личный номер откроется после ответа клиента';
        else { lead.tgSenderPhone = want; store.save(); toastTxt = '✅ Пишем с +' + (picked && picked.realPhone || want); }
      }
      try { await safeApi(db, 'answerCallbackQuery', { callback_query_id: cq.id, text: toastTxt }); } catch (_) {}
      if (lead) { try { await safeApi(db, 'editMessageReplyMarkup', { chat_id: cbChat, message_id: cq.message && cq.message.message_id, reply_markup: tgSenderKeyboard(db, lead, brk) }); } catch (_) {} }
    }
    return { callback: data };
  }
  const msg = (update && (update.message || update.edited_message)) || null;
  if (!msg || !msg.chat) return { skip: 'no message' };
  const chatId = String(msg.chat.id);
  const text = (msg.text || msg.caption || '').trim();

  /* привязка: /start <код> */
  if (text.startsWith('/start')) {
    const code = text.split(/\s+/)[1] || '';
    /* код основателя → привязка owner (аналитика/пульт с телефона) */
    if (code && db.settings.ownerTgCode && code.trim().toLowerCase() === String(db.settings.ownerTgCode).toLowerCase()) {
      db.settings.ownerTgChatId = chatId; store.save();
      await safeApi(db, 'sendMessage', { chat_id: chatId, text: '✅ Привязано: Основатель.\nОткройте мини-приложение — увидите аналитику агентства и пульт с телефона.' });
      return { bound: true, owner: true };
    }
    const r = bindBroker(db, chatId, code);
    await safeApi(db, 'sendMessage', {
      chat_id: chatId,
      text: r.ok
        ? (r.already
          ? `✅ Этот аккаунт уже привязан: ${r.broker.name}. Всё работает.`
          : `✅ Привязано: ${r.broker.name}.${r.count > 1 ? `\n(Ваших Telegram-аккаунтов подключено: ${r.count} — сообщения клиентов приходят на все.)` : ''}\nТеперь отвечайте reply на сообщения клиентов — они уйдут клиенту в WhatsApp от вашего имени.`)
        : '❌ Код не найден. Возьмите свой код в CRM → Подключения → Мост Telegram.',
    });
    return { bound: r.ok };
  }

  /* ⭐/test — образец уведомления о новом лиде (самопроверка формата + кнопки «Открыть переписку»).
     Если у брокера есть реальный лид — показываем ЕГО сводку и кнопка ведёт в его чат; иначе демо-пример. */
  if (/^\/(test|тест|testlead|тестлид)\b/i.test(text)) {
    const brk = db.brokers.find(b => brokerChatIds(b).includes(chatId)) || null;
    const sample = brk ? (db.leads || []).filter(l => l.broker === brk.id).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] : (db.leads || [])[0];
    const demo = sample || { id: 'demo_' + chatId, name: 'Иван Петров (пример)', phone: '+66 81 234 5678', geo: (db.settings.agency.geos || [])[0] || '', lang: 'ru', source: 'ctwa', score: 78,
      quals: { purpose: { value: 'для себя, переезд' }, budget: { value: 'до $450k' }, type: { value: '2-спальные апартаменты' }, timeline: { value: '2–3 месяца' } },
      ads: { campaignName: 'Phuket Beachfront', adName: 'Laya Resort' }, nextAction: { text: 'Позвонить в течение 30 мин' } };
    const txt = `🧪 <b>Тест — так приходит новый лид</b>\n\n${leadBriefHtml(db, demo)}\n\n<i>Кнопка ниже открывает переписку с лидом прямо в приложении.${sample ? '' : ' (это пример; у реального лида — его данные и его чат)'}</i>`;
    await safeApi(db, 'sendMessage', { chat_id: chatId, text: txt, parse_mode: 'HTML', reply_markup: leadOpenKb(db, demo) });
    return { test: true };
  }

  /* owner-пульт: команды управления номерами с телефона (напр. /qr — новый QR).
     Владелец привязан по ownerTgChatId (НЕ в db.brokers), поэтому перехватываем ДО проверки брокера,
     иначе владельцу на любую команду отвечало бы «Вы не привязаны к CRM». */
  if (waQr && text.startsWith('/') && String((db.settings || {}).ownerTgChatId || '') === chatId) {
    try { if (await waQr(db, chatId, text)) return { ownerCmd: true }; }
    catch (e) { console.error('[tgbridge] waQr', e.message); }
  }

  const broker = db.brokers.find(b => brokerChatIds(b).includes(chatId));
  /* ⭐ОСНОВАТЕЛЬ тоже отвечает лидам из бота (запрос SFG 12.11 «для всех»): раньше не-брокеру отвечало
     «вы не привязаны», и фаундер физически не мог ответить на зеркалируемые ему пул/SOLO-диалоги. */
  const isOwner = !broker && String((db.settings || {}).ownerTgChatId || '') === chatId;
  if (!broker && !isOwner) {
    await safeApi(db, 'sendMessage', { chat_id: chatId, text: 'Вы не привязаны к CRM. Отправьте /start <код> (код в CRM → Подключения → Мост Telegram).' });
    return { skip: 'unbound' };
  }

  /* брокер тоже может запросить новый QR номера прямо с телефона (/qr) — номер часто отваливается,
     ждать владельца не нужно. handleOwnerWaQr сам пускает привязанных брокеров. (у фаундера /qr перехвачен выше). */
  if (broker && waQr && /^\/(qr|rescan|пересканировать)\b/i.test(text)) {
    try { if (await waQr(db, chatId, text)) return { brokerCmd: true }; }
    catch (e) { console.error('[tgbridge] waQr broker', e.message); }
  }

  const lead = resolveLead(db, broker || null, msg, chatId);
  if (!lead) {
    await safeApi(db, 'sendMessage', { chat_id: chatId, text: '↩️ Ответьте reply на сообщение клиента, чтобы я знал, кому переслать.\n\n📱 Отвалился номер WhatsApp? Отправьте /qr — пришлю список номеров и свежий QR для пересканирования (без входа в CRM).' });
    return { skip: 'no lead' };
  }

  let media = null;
  try { media = await extractTgMedia(db, msg); }
  catch (e) {
    await safeApi(db, 'sendMessage', { chat_id: chatId, text: '⚠️ Не смог забрать вложение из Telegram: ' + e.message });
    return { skip: 'media fail' };
  }
  if (!media && !text) return { skip: 'empty' };

  /* ⭐ВЫБРАННЫЙ НОМЕР-ОТПРАВИТЕЛЬ (кнопка под сообщением). Анти-бан guard: личный номер на ХОЛОДНОМ касании
     (клиент не отвечал) → сбрасываем на пул, не жжём личный. Пусто = авто-выбор пула в pickGrayNumber. */
  let _from = lead.tgSenderPhone || '';
  if (_from) {
    const _picked = ((db.settings.waGray || {}).numbers || []).find(n => n.phone === _from);
    const _hasIn = (db.messages || []).some(x => x.leadId === lead.id && x.dir === 'in' && !x.system);
    if (_picked && _picked.brokerId && !_hasIn) _from = '';
  }
  /* уходит клиенту в WhatsApp как ручное сообщение (via='human') */
  engine.send(db, lead, text, 'human', { channel: 'wa', media: media || undefined, fromPhone: _from || undefined });

  /* человек перехватил — автопилот на паузе (правило autoOff.onHumanReply) */
  if (!db.settings.ai || !db.settings.ai.autoOff || db.settings.ai.autoOff.onHumanReply !== false) {
    lead.ai.enabled = false;
    lead.ai.pausedBy = broker ? 'broker' : 'owner';
    lead.tags = [...new Set([...(lead.tags || []), 'ведёт брокер'])];
  }
  if (broker) broker.tgActiveLeadId = lead.id; else db.settings.ownerTgActiveLeadId = lead.id;
  ai.pushEvent(db, { type: 'note', leadId: lead.id, text: `${broker ? broker.name : 'Основатель'} ответил из Telegram${media ? ` (${media.type})` : ''}` });
  store.save();
  return { sent: true, leadId: lead.id, media: media ? media.type : null };
}

/* КУДА зеркалить переписку лида: назначенному брокеру (свой TG) ИЛИ, если брокера нет
   (лид в общем пуле / SOLO-фаундер), — фаундеру (ownerTgChatId). Так НИ один диалог не теряется. */
function routeChat(db, lead) {
  if (lead && lead.broker) {
    const b = (db.brokers || []).find(x => x.id === lead.broker);
    const ids = brokerChatIds(b);
    if (b && ids.length) return { chatIds: ids, broker: b, toFounder: false };
    if (b && !ids.length) return null;   /* брокер назначен, но не привязал TG — его дело подключить; фаундеру не дублируем */
  }
  const owner = db.settings && db.settings.ownerTgChatId;
  if (owner) return { chatIds: [String(owner)], broker: null, toFounder: true };
  return null;
}

/* ---------- ИСХОДЯЩИЙ: клиент написал → назначенному брокеру в Telegram ---------- */
async function sendMediaToBroker(db, chatId, media, caption) {
  const [method, field] = TG_SEND[media.type] || ['sendDocument', 'document'];
  const body = { chat_id: chatId, [field]: absUrl(media.url) };
  if (caption) body.caption = caption.slice(0, 1024);
  return api(db, method, body);
}

async function forwardInbound(db, lead, m) {
  if (!ready(db) || !lead) return;
  const route = routeChat(db, lead);
  if (!route) return;                                   /* некому зеркалить (нет TG ни у брокера, ни у фаундера) */
  const { chatIds, broker, toFounder } = route;
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const first = (lead.name || '').split(' ')[0] || lead.name || 'Клиент';
  const aiOn = lead.ai && lead.ai.enabled;
  const who = toFounder ? `${esc(first)} · ${esc(lead.phone || '')}${lead.broker ? '' : ' · пул'}` : esc(first);
  const foot = aiOn ? '🤖 отвечает ассистент · reply — перехватить' : 'reply — ответить клиенту';
  for (const chatId of chatIds) {                        /* на ВСЕ привязанные аккаунты брокера */
    let sent;
    try {
      if (m.media && m.media.url) {
        const capPlain = `💬 ${first}\n${m.text || ''}\n${aiOn ? '🤖 отвечает ассистент · reply — перехватить' : 'reply — ответить'}`.trim();
        sent = await sendMediaToBroker(db, chatId, m.media, capPlain);
      } else {
        const capHtml = `💬 <b>${who}</b>\n${esc(m.text || '')}\n<i>${foot}</i>`.trim();
        /* ⭐кнопка выбора номера-отправителя под сообщением клиента (общий пул / личный) — та же логика, что в вебе */
        const _kb = tgSenderKeyboard(db, lead, broker);
        sent = await api(db, 'sendMessage', { chat_id: chatId, text: capHtml, parse_mode: 'HTML', reply_markup: _kb });
      }
    } catch (e) { console.error('[tgbridge] forwardInbound', chatId, e.message); continue; }
    const mid = sent && sent.result && sent.result.message_id;
    if (mid) { rt(db).replyMap[`${chatId}:${mid}`] = { leadId: lead.id, at: Date.now() }; }
  }
  pruneMap(db);
  if (broker) broker.tgActiveLeadId = lead.id;
  store.save();
}

/* уведомление: ассистент/менеджер ответил клиенту (брокеру — свой TG; пул/SOLO — фаундеру) */
async function forwardAiReply(db, lead, m) {
  if (!ready(db) || !lead || !m || !m.text) return;
  const route = routeChat(db, lead);
  if (!route) return;
  const { chatIds } = route;
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const first = (lead.name || '').split(' ')[0] || 'клиенту';
  const txt = `🤖 <b>Ассистент</b> → ${esc(first)}\n${esc(m.text)}`;
  for (const chatId of chatIds) {
    try {
      const sent = await api(db, 'sendMessage', { chat_id: chatId, text: txt, parse_mode: 'HTML' });
      if (sent && sent.result) { rt(db).replyMap[`${chatId}:${sent.result.message_id}`] = { leadId: lead.id, at: Date.now() }; }
    } catch (e) { console.error('[tgbridge] forwardAiReply', chatId, e.message); }
  }
  pruneMap(db);
}

/* ⭐СВОДКА ПО ЛИДУ для уведомления брокеру (запрос SFG 13.11): всё, что нужно знать перед первым контактом —
   контакт, гео, язык, тепло (score), оси квалификации, источник/креатив, кол-во сообщений, ИИ-резюме. */
const _tgEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const _TG_LANGS = { ru: 'Русский', en: 'Английский', de: 'Немецкий', tr: 'Турецкий', fr: 'Французский', es: 'Испанский', ar: 'Арабский', it: 'Итальянский', id: 'Индонезийский', zh: 'Китайский' };
const _TG_SRC = { meta: 'Facebook/Instagram', facebook: 'Facebook', instagram: 'Instagram', fb_leadads: 'Facebook Lead Ads', wa: 'WhatsApp', tg: 'Telegram', site: 'Сайт', website: 'Сайт', manual: 'Вручную', albato: 'Лид-форма Meta' };
function leadBriefHtml(db, lead) {
  const v = x => (x && typeof x === 'object' ? x.value : x);
  const geo = (db.settings.geoNames && db.settings.geoNames[lead.geo]) || lead.geo || '';
  const lang = lead.lang ? (_TG_LANGS[String(lead.lang).slice(0, 2).toLowerCase()] || lead.lang) : '';
  const q = lead.quals || {};
  const score = typeof lead.score === 'number' ? lead.score : null;
  const warm = score == null ? '' : (score >= 70 ? '🔥 Горячий' : score >= 40 ? '🌤 Тёплый' : '❄️ Холодный');
  const inbound = (db.messages || []).filter(m => m.leadId === lead.id && m.dir === 'in' && !m.system).length;
  const ads = lead.ads || {};
  const adBits = [ads.campaignName, ads.adsetName, ads.adName].filter(Boolean);
  const src = _TG_SRC[lead.source] || lead.source || '';
  const L = [];
  L.push(`${warm ? warm + ' · ' : ''}🤝 <b>${_tgEsc(lead.name || 'Без имени')}</b>`);
  const l2 = [lead.phone ? '📞 ' + _tgEsc(lead.phone) : '', geo ? '🌍 ' + _tgEsc(geo) : '', lang ? '🗣 ' + _tgEsc(lang) : ''].filter(Boolean).join('  ·  ');
  if (l2) L.push(l2);
  const qa = [];
  if (q.purpose) qa.push('• Цель: ' + _tgEsc(v(q.purpose)));
  if (q.budget) qa.push('• Бюджет: ' + _tgEsc(v(q.budget)));
  if (q.type) qa.push('• Формат: ' + _tgEsc(v(q.type)));
  if (q.timeline) qa.push('• Срок: ' + _tgEsc(v(q.timeline)));
  L.push(qa.length ? '\n<b>Квалификация</b>\n' + qa.join('\n') : '\n<i>Квалификация не завершена — уточните в разговоре</i>');
  const srcLine = [src ? '📣 ' + _tgEsc(src) : '', adBits.length ? '«' + _tgEsc(adBits.join(' · ')) + '»' : ''].filter(Boolean).join('  ·  ');
  if (srcLine) L.push('\n' + srcLine);
  if (inbound) L.push('💬 Сообщений от клиента: ' + inbound);
  if (lead.nextAction && lead.nextAction.text) L.push('\n⏱ <b>' + _tgEsc(lead.nextAction.text) + '</b>');
  return L.join('\n');
}
/* inline-кнопка «Открыть переписку» — web_app мини-апп с deep-link на чат лида (tgapp читает ?lead=) */
function leadOpenKb(db, lead) {
  return { inline_keyboard: [[{ text: '💬 Открыть переписку', web_app: { url: absUrl('/tgapp?lead=' + encodeURIComponent(lead.id)) } }]] };
}

/* передача лида брокеру → СВОДНЫЙ бриф в его Telegram + кнопка «Открыть переписку» */
async function forwardHandover(db, lead) {
  if (!ready(db) || !lead || !lead.broker) return;
  if (lead._tgBriefAt && Date.now() - lead._tgBriefAt < 90000) return;   /* анти-дубль: не слать сводку повторно в пределах 90с (вход + квалификация рядом) */
  lead._tgBriefAt = Date.now();
  const broker = db.brokers.find(b => b.id === lead.broker);
  const ids = brokerChatIds(broker);
  if (!broker || !ids.length) return;
  const txt = `${leadBriefHtml(db, lead)}\n\n<i>Жмите «Открыть переписку» или ответьте reply на сообщение клиента — уйдёт ему в WhatsApp от вашего имени.</i>`;
  const kb = leadOpenKb(db, lead);
  for (const chatId of ids) {
    try { const sent = await api(db, 'sendMessage', { chat_id: chatId, text: txt, parse_mode: 'HTML', reply_markup: kb }); if (sent.result) { rt(db).replyMap[`${chatId}:${sent.result.message_id}`] = { leadId: lead.id, at: Date.now() }; } }
    catch (e) { console.error('[tgbridge] forwardHandover', chatId, e.message); }
  }
  pruneMap(db);
  broker.tgActiveLeadId = lead.id;
  store.save();
}

async function safeApi(db, method, body) { try { return await api(db, method, body); } catch (e) { console.error('[tgbridge]', method, e.message); return null; } }

/* отправить картинку из data:URL (напр. QR-код) в чат: декодируем base64 → сохраняем в media → sendPhoto по URL.
   Telegram сам скачает картинку по публичному /assets/... (как и исходящие медиа брокеру). */
async function sendDataUrlPhoto(db, chatId, dataUrl, caption) {
  const m = /^data:(image\/[a-z0-9.+-]+)?;base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!m) throw new Error('не data:URL');
  const buf = Buffer.from(m[2], 'base64');
  const mime = m[1] || 'image/png';
  const ext = (mime.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png';
  const t = token(db);
  if (!t) throw new Error('нет botToken моста');
  /* ⭐ЗАГРУЖАЕМ QR ФАЙЛОМ (multipart/InputFile), а НЕ ссылкой. Раньше слали photo:absUrl(/media/..) и
     Telegram пытался САМ СКАЧАТЬ наш media-URL — на проде это падало «failed to get HTTP URL content»
     (media-хост Telegram'у недоступен/относительный путь), и QR по кнопке не доходил до клиента.
     Загрузка байтами не зависит от доступности media-хоста — работает всегда. */
  try {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    if (caption) form.append('caption', String(caption).slice(0, 1024));
    form.append('photo', new Blob([buf], { type: mime }), 'qr.' + ext);
    const r = await fetch(`https://api.telegram.org/bot${t}/sendPhoto`, { method: 'POST', body: form });
    const j = await r.json().catch(() => ({}));
    if (j && j.ok) return j;
    throw new Error(`telegram sendPhoto (upload): ${(j && j.description) || r.status}`);
  } catch (e) {
    /* запасной путь — прежняя отправка по публичному URL (вдруг media-хост доступен) */
    const saved = saveMedia(buf, ext);
    const body = { chat_id: chatId, photo: absUrl(saved.url) };
    if (caption) body.caption = String(caption).slice(0, 1024);
    return api(db, 'sendPhoto', body);
  }
}

/* поставить вебхук у Telegram на наш /tg/webhook с секрет-токеном */
async function setupWebhook(db, baseUrl) {
  /* ⚠️ В CENTRAL-режиме у всех агентств ОДИН бот (token(db) === platformToken()). Ставить его вебхук
     ПЕР-ТЕНАНТНЫМ секретом нельзя — это затрёт platformSecret, и апдейты посыплются в пер-тенантную
     ветку → «❌ Код не найден» у ВСЕХ. Поэтому любой «перепривязать» в central-режиме ставит
     ЦЕНТРАЛЬНЫЙ вебхук (platformSecret). (Был реальный баг на Trust Phuket.) */
  if (central()) return setupPlatformWebhook(baseUrl);
  const url = baseUrl.replace(/\/$/, '') + '/tg/webhook';
  return api(db, 'setWebhook', {
    url,
    secret_token: cfg(db).secret,
    allowed_updates: ['message', 'edited_message', 'callback_query'],   /* callback_query — для inline-кнопок (напр. «Показать QR-код») */
    drop_pending_updates: true,
  });
}

/* ЦЕНТРАЛЬНЫЙ бот: один вебхук на всю платформу (ставится ОДИН раз при старте, если задан env-токен) */
async function tgApiRaw(tok, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${tok}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  return r.json().catch(() => ({}));
}
async function setupPlatformWebhook(baseUrl) {
  const tok = platformToken();
  if (!tok) return { ok: false, error: 'нет токена центрального бота' };
  const base = baseUrl.replace(/\/$/, '');
  const r = await tgApiRaw(tok, 'setWebhook', { url: base + '/tg/webhook', secret_token: platformSecret(), allowed_updates: ['message', 'edited_message', 'callback_query'], drop_pending_updates: true });
  /* сохраняем мини-апп: кнопка-меню бота открывает мессенджер брокера (/tgapp) — иначе при переносе
     существующего бота (напр. Lumen Messenger) в мост пропала бы его кнопка «Чаты» */
  try { await tgApiRaw(tok, 'setChatMenuButton', { menu_button: { type: 'web_app', text: '💬 Чаты', web_app: { url: base + '/tgapp' } } }); } catch (_) {}
  let me = null; try { me = await tgApiRaw(tok, 'getMe'); } catch (_) {}
  return { ok: !!r.ok, result: r, username: me && me.result && me.result.username || null };
}
async function platformBotUsername() {
  const tok = platformToken(); if (!tok) return null;
  try { const me = await tgApiRaw(tok, 'getMe'); return me && me.result && me.result.username || null; } catch (_) { return null; }
}
/* getWebhookInfo центрального бота (для диагностики: url, last_error, pending) — токен не раскрываем */
async function webhookInfo() {
  const tok = platformToken(); if (!tok) return { error: 'нет токена центрального бота' };
  const r = await tgApiRaw(tok, 'getWebhookInfo');
  return (r && r.result) || r;
}

/* кнопка-меню бота, открывающая мессенджер-мини-апп (Telegram Web App) */
async function setMenuButton(db, baseUrl) {
  const url = baseUrl.replace(/\/$/, '') + '/tgapp';
  return api(db, 'setChatMenuButton', { menu_button: { type: 'web_app', text: '💬 Чаты', web_app: { url } } });
}

/* прямое уведомление в чат Telegram (для алертов делегату контроля) */
async function notify(db, chatId, text, replyMarkup) {
  if (!chatId || !token(db)) return;
  const body = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (replyMarkup) body.reply_markup = replyMarkup;   /* inline-кнопки (напр. «Показать QR-код») */
  try { await api(db, 'sendMessage', body); } catch (e) { console.error('[tg-notify]', e.message); }
}
/* быстрый конструктор inline-клавиатуры «Показать QR-код» для номера */
function qrButton(phone) { return { inline_keyboard: [[{ text: '📷 Показать QR-код', callback_data: 'qr:' + String(phone).replace(/[^0-9]/g, '').slice(0, 20) }]] }; }

module.exports = {
  ready, cfg, token, handleUpdate, forwardInbound, forwardAiReply, forwardHandover, bindBroker,
  setupWebhook, setMenuButton, setMediaDir, saveMedia, extractTgMedia, resolveLead, absUrl, notify,
  central, platformSecret, setupPlatformWebhook, platformBotUsername, webhookInfo,
  brokerChatIds, addBrokerChat, removeBrokerChat,
  setWaQr, sendDataUrlPhoto, qrButton,
};
