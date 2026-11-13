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
  /* ⭐ЗАПРОС ИЗ ВИДЖЕТА (Bot API 10.4): кнопка внутри HTML-карточки вызвала TelegramWidget.request(data)
     → апдейт update.widget_query. Выполняем действие (take/ai) и отвечаем виджету. */
  if (update && (update.widget_query || update.shared_widget_query)) {
    try { return await handleWidgetQuery(db, update.widget_query || update.shared_widget_query); }
    catch (e) { console.error('[tgbridge] widget_query', e.message); return { skip: 'widget_err' }; }
  }
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
          : `✅ Привязано: ${r.broker.name}.${r.count > 1 ? `\n(Ваших Telegram-аккаунтов подключено: ${r.count} — сообщения клиентов приходят на все.)` : ''}\nТеперь отвечайте reply на сообщения клиентов — они уйдут клиенту в WhatsApp от вашего имени.\n\n📲 Команды: /digest — сводка дня, /leads — мои лиды, /widget — пример карточки лида.`)
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

  /* ⭐/widget — та же карточка нового лида, но ЖИВЫМ HTML-ВИДЖЕТОМ (Bot API 10.4): интерактивные кнопки
     внутри сообщения (открыть переписку / копировать номер / взять в работу / ИИ вкл-выкл). Фолбэк — как /test. */
  if (/^\/(widget|виджет)\b/i.test(text)) {
    const brk0 = db.brokers.find(b => brokerChatIds(b).includes(chatId)) || null;
    const isOwner0 = !brk0 && String((db.settings || {}).ownerTgChatId || '') === chatId;
    if (!brk0 && !isOwner0) { await safeApi(db, 'sendMessage', { chat_id: chatId, text: 'Сначала привяжитесь: /start <код> (код в CRM → Подключения → Мост Telegram).' }); return { skip: 'unbound' }; }
    const sample = brk0 ? (db.leads || []).filter(l => l.broker === brk0.id).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] : (db.leads || [])[0];
    const demo = sample || { id: 'demo_' + chatId, name: 'Иван Петров (пример)', phone: '+66 81 234 5678', geo: (db.settings.agency.geos || [])[0] || '', lang: 'ru', source: 'ctwa', score: 78,
      quals: { purpose: { value: 'для себя, переезд' }, budget: { value: 'до $450k' }, type: { value: '2-спальные апартаменты' }, timeline: { value: '2–3 месяца' } },
      ads: { campaignName: 'Phuket Beachfront', adName: 'Laya Resort' }, nextAction: { text: 'Позвонить в течение 30 мин' }, ai: { enabled: true } };
    const botUser = await botUsername(db);
    const html = leadWidgetHtml(db, demo, sample ? 'new' : 'demo', botUser);
    const fb = `🧪 <b>Карточка лида</b>\n\n${leadBriefHtml(db, demo)}\n\n<i>Виджет не отобразился: бот @lumenmessengerbot пока не в вайтлисте Telegram для HTML-виджетов (фича вышла 09.11.2026, в ограниченном бете). Как только одобрят — карточка станет живым виджетом автоматически. Пока работает обычный формат.</i>`;
    await sendWidgetOrFallback(db, chatId, { html, fallbackText: fb, fallbackKb: leadOpenKb(db, demo), leadId: sample ? demo.id : undefined, force: true });
    return { widgetDemo: true };
  }

  /* ⭐/digest (сводка) — живой KPI-виджет: новых сегодня / ждут ответа / горячих / за 7 дней + спарклайн */
  if (/^\/(digest|сводка|dashboard)\b/i.test(text)) {
    const brk0 = db.brokers.find(b => brokerChatIds(b).includes(chatId)) || null;
    const isOwner0 = !brk0 && String((db.settings || {}).ownerTgChatId || '') === chatId;
    if (!brk0 && !isOwner0) { await safeApi(db, 'sendMessage', { chat_id: chatId, text: 'Сначала привяжитесь: /start <код>.' }); return { skip: 'unbound' }; }
    const scope = brk0 ? { brokerId: brk0.id } : { all: true };
    const botUser = await botUsername(db);
    const html = digestWidgetHtml(db, scope, botUser);
    const d = digestData(db, scope);
    const fb = `📊 <b>${scope.all ? 'Сводка агентства' : 'Моя сводка'} · сегодня</b>\n\n🆕 Новых сегодня: <b>${d.newToday}</b>\n⏳ Ждут ответа: <b>${d.waiting}</b>\n🔥 Горячих: <b>${d.hot}</b>\n📈 Новых за 7 дней: <b>${d.week}</b>`;
    await sendWidgetOrFallback(db, chatId, { html, fallbackText: fb });
    return { digest: true };
  }

  /* ⭐/leads (мои лиды) — виджет-инбокс: открытые лиды, тап по строке открывает чат */
  if (/^\/(leads|лиды|инбокс|inbox)\b/i.test(text)) {
    const brk0 = db.brokers.find(b => brokerChatIds(b).includes(chatId)) || null;
    const isOwner0 = !brk0 && String((db.settings || {}).ownerTgChatId || '') === chatId;
    if (!brk0 && !isOwner0) { await safeApi(db, 'sendMessage', { chat_id: chatId, text: 'Сначала привяжитесь: /start <код>.' }); return { skip: 'unbound' }; }
    const scope = brk0 ? { brokerId: brk0.id } : { all: true };
    const botUser = await botUsername(db);
    const html = leadsListWidgetHtml(db, scope, botUser);
    const open = (db.leads || []).filter(l => (scope.all || l.broker === scope.brokerId) && !['lost', 'won', 'archived', 'closed'].includes(String(l.stage || '')))
      .sort((a, b) => (b.lastActivityAt || b.createdAt || 0) - (a.lastActivityAt || a.createdAt || 0)).slice(0, 7);
    const fb = open.length ? `💬 <b>${scope.all ? 'Лиды агентства' : 'Мои лиды'}</b>\n\n${open.map((l, i) => `${i + 1}. ${_tgEsc(l.name || 'Без имени')}${l.phone ? ' · ' + _tgEsc(l.phone) : ''}${typeof l.score === 'number' ? ' · ' + l.score : ''}`).join('\n')}\n\n<i>Откройте мини-приложение (кнопка «💬 Чаты»), чтобы перейти в переписку.</i>` : 'Открытых лидов нет.';
    await sendWidgetOrFallback(db, chatId, { html, fallbackText: fb });
    return { leadsWidget: true };
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

/* ======================= TELEGRAM WIDGETS (Bot API 10.4, sendWidget) =======================
   Вместо «текст + кнопка Открыть» шлём ЖИВУЮ HTML-карточку прямо в сообщение (мини-HTML: инлайн CSS/JS,
   картинки только data:, ≤4 КБ сжатого / ≤32 КБ сырого, ТОЛЬКО приватные чаты). Интерактив — через
   window.TelegramWidget: openTelegramLink (открыть мини-апп по startapp), openLink, copyText, HapticFeedback,
   request(data) → колбэк боту (update.widget_query → answerWidgetQuery). Фича новая (11.2026) → на любой сбой
   sendWidget тихо откатываемся на классическое сообщение (sendWidgetOrFallback). Флаг: tgBridge.widgets!==false. */
function widgetsEnabled(db) { return cfg(db).widgets !== false; }

let _botUser = null, _botUserAt = 0;
async function botUsername(db) {
  if (_botUser && Date.now() - _botUserAt < 3600000) return _botUser;
  try { const t = token(db); const me = await tgApiRaw(t, 'getMe'); _botUser = (me && me.result && me.result.username) || null; _botUserAt = Date.now(); } catch (_) {}
  return _botUser;
}
/* URL «открыть мини-апп на лиде»: при известном юзернейме бота — t.me deep-link (startapp=lead_<id>,
   tgapp читает start_param), иначе прямой https на /tgapp (openLink). */
function leadOpenAction(botUser, leadId) {
  if (botUser) return { fn: 'openTelegramLink', url: 'https://t.me/' + botUser + '?startapp=lead_' + encodeURIComponent(leadId) };
  return { fn: 'openLink', url: absUrl('/tgapp?lead=' + encodeURIComponent(leadId)) };
}
/* безопасная строка-литерал для inline-JS ВНУТРИ HTML-атрибута onclick="…": JSON-кавычки (") закрыли бы
   двойные кавычки атрибута раньше времени и ломали обработчик → экранируем в HTML-сущности (браузер вернёт их
   обратно при парсинге атрибута, JS получит валидную строку). */
const _js = s => JSON.stringify(String(s == null ? '' : s)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');

/* общий каркас мини-HTML виджета: самодостаточный документ, свой фон (не зависит от темы Telegram),
   адаптив под тёмную системную тему, glue-функции TelegramWidget. body/script — содержимое карточки. */
function widgetDoc(body, script) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font:14px/1.4 -apple-system,"Segoe UI",Roboto,sans-serif;color:#0f172a;background:transparent}
.c{background:#fff;border:1px solid #e7e9f0;border-radius:16px;padding:14px;position:relative;overflow:hidden}
.c:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:linear-gradient(#6366f1,#8b5cf6)}
.hd{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.nm{font-weight:700;font-size:16px;letter-spacing:-.2px}
.badge{font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;background:#eef2ff;color:#4f46e5}
.badge.hot{background:#fef2f2;color:#dc2626}.badge.warm{background:#fff7ed;color:#ea580c}.badge.cold{background:#eff6ff;color:#2563eb}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
.chip{font-size:12px;color:#475569;background:#f4f5fb;border-radius:8px;padding:4px 8px;white-space:nowrap}
.sec{margin-top:8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#94a3b8}
.ql{margin-top:4px}.ql .r{display:flex;gap:6px;font-size:13px;padding:2px 0}.ql .r b{color:#64748b;font-weight:600;min-width:64px}
.src{margin-top:8px;font-size:12px;color:#64748b}
.na{margin-top:8px;font-size:13px;font-weight:700;color:#0f172a;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:8px 10px}
.btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.b{flex:1 1 auto;min-width:88px;border:1px solid #e2e8f0;background:#f8fafc;color:#0f172a;font-weight:600;font-size:13px;padding:9px 10px;border-radius:10px;cursor:pointer;transition:.15s}
.b:active{transform:scale(.97)}.b.prim{background:#6366f1;border-color:#6366f1;color:#fff}.b.good{background:#16a34a;border-color:#16a34a;color:#fff}
.kpis{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:6px 0}
.kpi{background:#f6f7fc;border-radius:12px;padding:10px}.kpi .n{font-size:22px;font-weight:800;letter-spacing:-.5px;color:#4f46e5}.kpi .l{font-size:11px;color:#64748b;margin-top:2px}
.lst{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.row{display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:#f8fafc;border:1px solid #eef0f6;border-radius:10px;padding:9px 10px;cursor:pointer}
.row:active{background:#eef2ff}.row .dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto}.row .t{flex:1;min-width:0}.row .t b{font-size:13px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row .t span{font-size:11px;color:#94a3b8}
canvas{display:block;width:100%;height:42px;margin-top:6px}
.toast{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);background:#0f172a;color:#fff;font-size:12px;font-weight:600;padding:7px 12px;border-radius:999px;opacity:0;pointer-events:none;transition:.2s;white-space:nowrap}
@media(prefers-color-scheme:dark){
 body{color:#e5e7eb}.c{background:#111827;border-color:#1f2937}
 .chip{background:#1f2937;color:#cbd5e1}.kpi{background:#1b2436}.na{background:#0d2a1c;border-color:#14532d;color:#d1fae5}
 .b{background:#1f2937;border-color:#334155;color:#e5e7eb}.row{background:#1b2436;border-color:#273449}.row:active{background:#24304a}
 .sec{color:#64748b}.ql .r b{color:#94a3b8}.src{color:#94a3b8}
}
</style>
${body}
<script>
var W=window.TelegramWidget||{};
function _h(s){try{W.HapticFeedback&&W.HapticFeedback.impactOccurred(s||'light')}catch(e){}}
function _open(fn,u){try{_h();if(typeof W[fn]==="function"){W[fn](u)}else if(W.openLink){W.openLink(u)}}catch(e){}}
function _copy(t){try{_h('light');W.copyText&&W.copyText(t);_toast('📋 Скопировано')}catch(e){}}
function _req(d){_h();if(!W.request){_toast('Обновите Telegram');return}W.request(d).then(function(r){_toast((r&&r.result)||'Готово')}).catch(function(){_toast('Не получилось')})}
function _toast(t){var e=document.getElementById('t');if(e){e.textContent=t;e.style.opacity=1;clearTimeout(e._x);e._x=setTimeout(function(){e.style.opacity=0},2200)}}
${script || ''}
</script>`;
}

/* HTML-содержимое карточки лида (новый лид / повторный интерес) */
function leadWidgetBody(db, lead, kind, botUser) {
  const v = x => (x && typeof x === 'object' ? x.value : x);
  const geo = (db.settings.geoNames && db.settings.geoNames[lead.geo]) || lead.geo || '';
  const lang = lead.lang ? (_TG_LANGS[String(lead.lang).slice(0, 2).toLowerCase()] || lead.lang) : '';
  const q = lead.quals || {};
  const score = typeof lead.score === 'number' ? lead.score : null;
  const warm = score == null ? null : (score >= 70 ? { c: 'hot', t: '🔥 Горячий' } : score >= 40 ? { c: 'warm', t: '🌤 Тёплый' } : { c: 'cold', t: '❄️ Холодный' });
  const ads = lead.ads || {};
  const adBits = [ads.campaignName, ads.adsetName, ads.adName].filter(Boolean);
  const src = _TG_SRC[lead.source] || lead.source || '';
  const aiOn = !!(lead.ai && lead.ai.enabled);
  const chips = [lead.phone ? '📞 ' + _tgEsc(lead.phone) : '', geo ? '🌍 ' + _tgEsc(geo) : '', lang ? '🗣 ' + _tgEsc(lang) : ''].filter(Boolean);
  const qrows = [];
  if (q.purpose) qrows.push(['Цель', v(q.purpose)]);
  if (q.budget) qrows.push(['Бюджет', v(q.budget)]);
  if (q.type) qrows.push(['Формат', v(q.type)]);
  if (q.timeline) qrows.push(['Срок', v(q.timeline)]);
  const title = kind === 'reengage' ? '🔄 Снова написал' : kind === 'demo' ? '🧪 Пример карточки' : '🆕 Новый лид';
  let h = '<div class="c">';
  h += '<div class="hd">' + (warm ? '<span class="badge ' + warm.c + '">' + warm.t + '</span>' : '') + '<span class="badge">' + title + '</span></div>';
  h += '<div class="hd"><span class="nm">' + _tgEsc(lead.name || 'Без имени') + '</span>' + (score != null ? '<span class="chip">' + score + '/100</span>' : '') + '</div>';
  if (chips.length) h += '<div class="chips">' + chips.map(c => '<span class="chip">' + c + '</span>').join('') + '</div>';
  if (qrows.length) { h += '<div class="sec">Квалификация</div><div class="ql">' + qrows.map(r => '<div class="r"><b>' + _tgEsc(r[0]) + '</b><span>' + _tgEsc(r[1]) + '</span></div>').join('') + '</div>'; }
  else h += '<div class="src"><i>Квалификация не завершена — уточните в разговоре</i></div>';
  const srcLine = [src ? '📣 ' + _tgEsc(src) : '', adBits.length ? '«' + _tgEsc(adBits.join(' · ')) + '»' : ''].filter(Boolean).join('  ·  ');
  if (srcLine) h += '<div class="src">' + srcLine + '</div>';
  if (lead.nextAction && lead.nextAction.text) h += '<div class="na">⏱ ' + _tgEsc(lead.nextAction.text) + '</div>';
  const act = leadOpenAction(botUser, lead.id);
  h += '<div class="btns">';
  h += '<button class="b prim" onclick="_open(' + _js(act.fn) + ',' + _js(act.url) + ')">💬 Переписка</button>';
  if (lead.phone) h += '<button class="b" onclick="_copy(' + _js(lead.phone) + ')">📞 Номер</button>';
  h += '<button class="b good" onclick="_req(' + _js('take:' + lead.id) + ')">✅ В работу</button>';
  h += '<button class="b" onclick="_req(' + _js('ai:' + lead.id) + ')">' + (aiOn ? '🤖 ИИ: выкл' : '▶️ ИИ: вкл') + '</button>';
  h += '</div><div class="toast" id="t"></div></div>';
  return h;
}
function leadWidgetHtml(db, lead, kind, botUser) { return widgetDoc(leadWidgetBody(db, lead, kind, botUser)); }

/* данные дайджеста: охват — лиды брокера (scope.brokerId) или всё агентство (scope.all) */
function digestData(db, scope) {
  const leads = (db.leads || []).filter(l => scope.all || l.broker === scope.brokerId);
  const msgs = db.messages || [];
  const d0 = new Date(); d0.setHours(0, 0, 0, 0); const todayStart = d0.getTime();
  const dayMs = 86400000;
  const lastNonSys = {};
  for (const m of msgs) { if (m.system) continue; const p = lastNonSys[m.leadId]; if (!p || (m.ts || m.at || 0) > (p.ts || p.at || 0)) lastNonSys[m.leadId] = m; }
  const inScope = new Set(leads.map(l => l.id));
  let newToday = 0, hot = 0, waiting = 0;
  const spark = new Array(7).fill(0);
  for (const l of leads) {
    const c = l.createdAt || 0;
    if (c >= todayStart) newToday++;
    if (typeof l.score === 'number' && l.score >= 70) hot++;
    const lm = lastNonSys[l.id];
    if (lm && lm.dir === 'in') waiting++;
    for (let i = 0; i < 7; i++) { const s = todayStart - (6 - i) * dayMs; if (c >= s && c < s + dayMs) spark[i]++; }
  }
  const week = spark.reduce((a, b) => a + b, 0);
  return { newToday, hot, waiting, week, spark, total: leads.length };
}
function digestWidgetHtml(db, scope, botUser) {
  const d = digestData(db, scope);
  const max = Math.max(1, ...d.spark);
  const bars = d.spark.map(n => Math.round((n / max) * 34)).join(',');
  const title = scope.all ? '📊 Сводка агентства' : '📊 Моя сводка';
  let h = '<div class="c">';
  h += '<div class="hd"><span class="nm">' + title + '</span><span class="chip">сегодня</span></div>';
  h += '<div class="kpis">';
  h += '<div class="kpi"><div class="n">' + d.newToday + '</div><div class="l">новых сегодня</div></div>';
  h += '<div class="kpi"><div class="n">' + d.waiting + '</div><div class="l">ждут ответа</div></div>';
  h += '<div class="kpi"><div class="n">' + d.hot + '</div><div class="l">🔥 горячих</div></div>';
  h += '<div class="kpi"><div class="n">' + d.week + '</div><div class="l">новых за 7 дней</div></div>';
  h += '</div>';
  h += '<div class="sec">Новые лиды · 7 дней</div><canvas id="sp" width="300" height="42"></canvas>';
  const openUrl = botUser ? 'https://t.me/' + botUser + '?startapp=home' : absUrl('/tgapp');
  const openFn = botUser ? 'openTelegramLink' : 'openLink';
  h += '<div class="btns"><button class="b prim" onclick="_open(' + _js(openFn) + ',' + _js(openUrl) + ')">Открыть CRM</button></div>';
  h += '<div class="toast" id="t"></div></div>';
  const script = 'var D=[' + bars + '];(function(){var c=document.getElementById("sp");if(!c)return;var x=c.getContext("2d"),W=c.width,H=c.height,n=D.length,bw=W/n*0.6,gap=W/n;x.fillStyle="#6366f1";for(var i=0;i<n;i++){var h=Math.max(2,D[i]),px=i*gap+(gap-bw)/2;x.globalAlpha=i===n-1?1:0.55;x.beginPath();var y=H-h,r=Math.min(3,bw/2);x.moveTo(px,H);x.lineTo(px,y+r);x.quadraticCurveTo(px,y,px+r,y);x.lineTo(px+bw-r,y);x.quadraticCurveTo(px+bw,y,px+bw,y+r);x.lineTo(px+bw,H);x.closePath();x.fill();}})();';
  return widgetDoc(h, script);
}

/* список открытых лидов брокера/агентства — мини-инбокс: каждая строка открывает чат лида */
function leadsListWidgetHtml(db, scope, botUser) {
  const leads = (db.leads || []).filter(l => scope.all || l.broker === scope.brokerId)
    .filter(l => !['lost', 'won', 'archived', 'closed'].includes(String(l.stage || '')))
    .sort((a, b) => (b.lastActivityAt || b.createdAt || 0) - (a.lastActivityAt || a.createdAt || 0)).slice(0, 7);
  let h = '<div class="c"><div class="hd"><span class="nm">💬 ' + (scope.all ? 'Лиды агентства' : 'Мои лиды') + '</span><span class="chip">' + leads.length + '</span></div>';
  if (!leads.length) h += '<div class="src">Открытых лидов нет.</div>';
  else {
    h += '<div class="lst">';
    for (const l of leads) {
      const sc = typeof l.score === 'number' ? l.score : null;
      const dot = sc == null ? '#94a3b8' : sc >= 70 ? '#dc2626' : sc >= 40 ? '#ea580c' : '#2563eb';
      const sub = [l.phone || '', (db.settings.geoNames && db.settings.geoNames[l.geo]) || l.geo || ''].filter(Boolean).join(' · ');
      const act = leadOpenAction(botUser, l.id);
      h += '<button class="row" onclick="_open(' + _js(act.fn) + ',' + _js(act.url) + ')"><span class="dot" style="background:' + dot + '"></span><span class="t"><b>' + _tgEsc(l.name || 'Без имени') + '</b><span>' + _tgEsc(sub) + '</span></span><span class="chip">' + (sc != null ? sc : '—') + '</span></button>';
    }
    h += '</div>';
  }
  h += '<div class="toast" id="t"></div></div>';
  return widgetDoc(h);
}

/* ВАЙТЛИСТ TELEGRAM: отправка виджетов в бете — только для одобренных ботов. Неодобрённый бот (наш случай
   @lumenmessengerbot на 13.11.2026) получает «INPUT_MEDIA_WIDGET_NOT_ALLOWED». Чтобы не делать обречённый
   sendWidget + лог на КАЖДОМ уведомлении, запоминаем блок и шлём сразу фолбэк; раз в 6ч пробуем снова —
   в день вайтлиста виджеты зажгутся сами. force:true (команда /widget) всегда пробует — для ручного теста. */
let _widgetBlockedAt = 0, _widgetBlockLogged = false;
const WIDGET_REPROBE_MS = 6 * 3600 * 1000;

/* ОТПРАВКА виджета с фолбэком: пробуем sendWidget (Bot API 10.4); на любой сбой (не в вайтлисте, старый
   клиент, не приватный чат, метод недоступен) — обычное сообщение. Возвращает {widget:true|false} или null. */
async function sendWidgetOrFallback(db, chatId, opts) {
  const { html, width, fallbackText, fallbackKb, leadId, force } = opts || {};
  const blocked = !force && _widgetBlockedAt && (Date.now() - _widgetBlockedAt < WIDGET_REPROBE_MS);
  if (html && widgetsEnabled(db) && !blocked) {
    try {
      const body = { chat_id: chatId, html };
      if (width) body.width = width;
      const sent = await api(db, 'sendWidget', body);
      if (_widgetBlockedAt) { _widgetBlockedAt = 0; _widgetBlockLogged = false; console.log('[tgwidget] sendWidget снова работает — виджеты включены для бота'); }
      if (sent && sent.result && leadId) rt(db).replyMap[`${chatId}:${sent.result.message_id}`] = { leadId, at: Date.now() };
      return { sent, widget: true };
    } catch (e) {
      if (/WIDGET_NOT_ALLOWED|not allowed/i.test(e.message || '')) {
        _widgetBlockedAt = Date.now();
        if (!_widgetBlockLogged) { _widgetBlockLogged = true; console.error('[tgwidget] бот НЕ в вайтлисте Telegram для виджетов (INPUT_MEDIA_WIDGET_NOT_ALLOWED) → шлём обычные сообщения; авто-повтор через 6ч'); }
      } else console.error('[tgwidget] sendWidget→fallback:', e.message);
    }
  }
  if (fallbackText == null) return null;
  const body = { chat_id: chatId, text: fallbackText, parse_mode: 'HTML' };
  if (fallbackKb) body.reply_markup = fallbackKb;
  try { const sent = await api(db, 'sendMessage', body); if (sent && sent.result && leadId) rt(db).replyMap[`${chatId}:${sent.result.message_id}`] = { leadId, at: Date.now() }; return { sent, widget: false }; }
  catch (e) { console.error('[tgwidget] fallback sendMessage:', e.message); return null; }
}

/* ответ на запрос виджета (update.widget_query → answerWidgetQuery). Параметр text/result пробуем оба
   (точная сигнатура метода свежая) — что-нибудь из них Telegram примет, действие уже выполнено на сервере. */
async function answerWidget(db, qid, text) {
  const t = String(text == null ? '' : text).slice(0, 1000);
  try { return await api(db, 'answerWidgetQuery', { widget_query_id: qid, text: t }); }
  catch (e) { try { return await api(db, 'answerWidgetQuery', { widget_query_id: qid, result: t }); } catch (_) { return null; } }
}

/* обработка колбэка из виджета: data вида «take:<leadId>» / «ai:<leadId>». Выполняем действие от имени
   того, кто нажал (брокер по chatIds / владелец по ownerTgChatId), затем отвечаем виджету тостом. */
async function handleWidgetQuery(db, wq) {
  const data = String((wq.query && (wq.query.data != null ? wq.query.data : wq.query)) || wq.data || '');
  const fromId = String((wq.from && wq.from.id) || '');
  const broker = db.brokers.find(b => brokerChatIds(b).includes(fromId)) || null;
  const isOwner = !broker && String((db.settings || {}).ownerTgChatId || '') === fromId;
  if (!broker && !isOwner) { await answerWidget(db, wq.id, 'Этот Telegram не привязан к CRM'); return { skip: 'unbound' }; }
  const ci = data.indexOf(':'); const kind = ci < 0 ? data : data.slice(0, ci); const leadId = ci < 0 ? '' : data.slice(ci + 1);
  const lead = db.leads.find(l => l.id === leadId);
  if (!lead) { await answerWidget(db, wq.id, 'Лид не найден'); return { skip: 'no lead' }; }
  let toast = 'Готово';
  if (kind === 'take') {
    if (broker) { lead.broker = broker.id; broker.tgActiveLeadId = lead.id; } else db.settings.ownerTgActiveLeadId = lead.id;
    if (!db.settings.ai || !db.settings.ai.autoOff || db.settings.ai.autoOff.onHumanReply !== false) {
      lead.ai = lead.ai || {}; lead.ai.enabled = false; lead.ai.pausedBy = broker ? 'broker' : 'owner';
      lead.tags = [...new Set([...(lead.tags || []), 'ведёт брокер'])];
    }
    ai.pushEvent(db, { type: 'note', leadId: lead.id, text: `${broker ? broker.name : 'Основатель'} взял лида в работу из Telegram-виджета` });
    store.save(); toast = '✅ Взято в работу — ИИ на паузе';
  } else if (kind === 'ai') {
    lead.ai = lead.ai || {}; lead.ai.enabled = !lead.ai.enabled;
    if (!lead.ai.enabled) lead.ai.pausedBy = broker ? 'broker' : 'owner';
    ai.pushEvent(db, { type: 'note', leadId: lead.id, text: `ИИ-ассистент ${lead.ai.enabled ? 'включён' : 'выключен'} из Telegram-виджета` });
    store.save(); toast = lead.ai.enabled ? '▶️ ИИ включён' : '🤖 ИИ выключен';
  } else { toast = 'Неизвестное действие'; }
  await answerWidget(db, wq.id, toast);
  return { widgetAction: kind, leadId };
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
  const botUser = await botUsername(db);                                /* для deep-link startapp в виджете */
  const html = widgetsEnabled(db) ? leadWidgetHtml(db, lead, 'new', botUser) : null;
  for (const chatId of ids) {
    /* живая карточка-виджет (Bot API 10.4) с фолбэком на классическое «бриф + кнопка» */
    await sendWidgetOrFallback(db, chatId, { html, fallbackText: txt, fallbackKb: kb, leadId: lead.id });
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
    allowed_updates: ['message', 'edited_message', 'callback_query', 'widget_query', 'shared_widget_query'],   /* callback_query — inline-кнопки; widget_query — колбэки HTML-виджетов (Bot API 10.4) */
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
  const r = await tgApiRaw(tok, 'setWebhook', { url: base + '/tg/webhook', secret_token: platformSecret(), allowed_updates: ['message', 'edited_message', 'callback_query', 'widget_query', 'shared_widget_query'], drop_pending_updates: true });
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
  /* виджеты (Bot API 10.4) — экспортируем билдеры для самопроверки/переиспользования */
  leadWidgetHtml, digestWidgetHtml, leadsListWidgetHtml, digestData, widgetsEnabled, sendWidgetOrFallback, handleWidgetQuery,
};
