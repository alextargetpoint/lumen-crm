/* Lumen CRM — движок: отправка, цепочки касаний, кампании реанимации,
   здоровье номеров, демо-симулятор ответов.
   Все отправки идут через send() — единая точка, где потом включится
   реальный WhatsApp Cloud API (wa.js). В mock-режиме сообщение просто
   пишется в переписку. */
const store = require('./store');
const ai = require('./ai');
const control = require('./control');
const llm = require('./llm');
const wa = require('./wa');
const { isSeedDemoPhone } = require('./seed');

/* Человеческая задержка ответа ИИ: не «мгновенный бот», а пауза как у живого менеджера.
   Конфигурируется settings.ai.replyDelayMinSec / replyDelayMaxSec (сек). Дефолт 3–12 мин.
   demo.accelerate (сэндбокс) → секунды. Короткий текст/вопрос — не мгновенно, но ближе к низу диапазона. */
/* окно тишины для анти-дробления: минимум сколько ждём после ПОСЛЕДНЕГО сообщения клиента, прежде чем ответить —
   чтобы поймать всю пачку сообщений (поток мысли) и ответить одним, а не на каждое. */
const BURST_SETTLE_MS = 35000;
function aiReplyDelayMs(db) {
  const a = (db.settings && db.settings.ai) || {};
  if (db.settings && db.settings.demo && db.settings.demo.accelerate) return 3000 + Math.random() * 4000;
  const lo = Math.max(10, Math.round(+a.replyDelayMinSec || 180));
  const hi = Math.max(lo + 5, Math.round(+a.replyDelayMaxSec || 720));
  return (lo + Math.random() * (hi - lo)) * 1000;
}
/* ⚠️ ФОРМАТ ВРЕМЕНИ В ПОЯСЕ ЛИДА. Сервер в UTC → toLocale* без пояса печатали UTC
   (встреча показывалась «04:00» вместо «11:00» по Пхукету). Сдвигаем на lead.tz (часы) и форматируем как UTC. */
function fmtLeadDT(ms, tz, opts) {
  return new Date((+ms || 0) + ((+tz || 0) * 3600e3)).toLocaleString('ru-RU', Object.assign({ timeZone: 'UTC' }, opts || {}));
}

const MIN = 60e3, DAY = 24 * 3600e3;

/* ---------- омниканал: выбор канала по приоритетам ---------- */
/* МОЖНО ли достучаться до лида в канале ch (автодетект по данным лида). cfg = db.settings.channels. */
function channelHas(db, lead, ch, cfg) {
  cfg = cfg || db.settings.channels || {};
  if (ch === 'wa') return (lead.channels?.wa || 'unknown') !== 'no';
  if (ch === 'email') return (lead.contacts || []).some(c => c.kind === 'email');
  if (ch === 'tg') return lead.channels?.tg === 'yes' || (lead.channels?.tg !== 'no' && !!lead.phone) || (lead.contacts || []).some(c => c.kind === 'telegram');
  if (ch === 'viber') { const vb = cfg.viber || {}; return lead.channels?.viber === 'yes' || (vb.mode === 'bsp' && !!lead.phone && lead.channels?.viber !== 'no'); }
  return false;
}
/* Доступные каналы для РУЧНОГО выбора касания: { wa:{avail,enabled,confirmed}, tg:{...}, email:{...} }.
   avail — можно достучаться; enabled — канал включён в настройках; confirmed — клиент реально в нём отвечал/подтверждён. */
function channelsFor(db, lead) {
  const cfg = db.settings.channels || { enabled: {} };
  const en = cfg.enabled || {};
  const out = {};
  for (const ch of ['wa', 'tg', 'email', 'viber']) {
    const avail = channelHas(db, lead, ch, cfg);
    const confirmed = ch === 'email' ? (lead.contacts || []).some(c => c.kind === 'email')
      : (lead.channels && lead.channels[ch] === 'yes');
    const enabled = ch === 'wa' ? (en.wa !== false) : !!en[ch];
    out[ch] = { avail, enabled, confirmed };
  }
  out[resolveChannel(db, lead)] = Object.assign(out[resolveChannel(db, lead)] || {}, { recommended: true });
  return out;
}
function resolveChannel(db, lead) {
  const cfg = db.settings.channels || { priority: ['wa'], enabled: { wa: true } };
  const pr = (cfg.priority || ['wa']).filter(ch => cfg.enabled[ch] && channelHas(db, lead, ch, cfg));
  const want = lead.activeChannel || 'wa';
  if (pr.includes(want)) return want;
  return pr[0] || 'wa';
}

function nextChannel(db, lead) {
  const cfg = db.settings.channels || {};
  const cur = lead.activeChannel || 'wa';
  const pr = (cfg.priority || ['wa']).filter(ch => cfg.enabled?.[ch]);
  const ix = pr.indexOf(cur);
  for (let k = ix + 1; k < pr.length; k++) {
    const ch = pr[k];
    const probe = { ...lead, activeChannel: ch };
    if (resolveChannel(db, probe) === ch) return ch;
  }
  return null;
}

const CH_NAMES = { wa: 'WhatsApp', tg: 'Telegram', viber: 'Viber', email: 'E-mail' };

/* Политика касаний по каналам. Мессенджеры (wa/tg) — полная цепочка касаний.
   Viber/email — фолбэк-каналы с ОДНИМ касанием: в Viber цепочка выглядит навязчиво и бьёт по consent
   (BSP платный, по согласию), а email — иной формат (деловое письмо, не чат-касание). */
const CHANNEL_TOUCH_CAP = { viber: 1, email: 1 };

/* ---------- выбор номера и отправка ---------- */
/* Серый транспорт (Baileys-воркер) внедряется из index.js, где есть tenant-контекст и waGrayApi.
   Когда у агентства есть ПОДКЛЮЧЁННЫЙ прогретый номер — исходящие уходят «серым способом» с номера
   брокера (залипание за лидом), а не Cloud API/мок. Нет подключённого — поведение как раньше (мок). */
let graySender = null;
function setGraySender(fn) { graySender = fn; }
/* Серый TELEGRAM-транспорт: холодное касание с прогретого TG-аккаунта (через tg-воркер). Внедряется из index.js. */
let tgGraySender = null;
function setTgGraySender(fn) { tgGraySender = fn; }

function pickNumber(db, lead) {
  if (lead.numberId) {
    const n = db.numbers.find(x => x.id === lead.numberId);
    if (n && n.state === 'active' && n.sentToday < n.dayLimit) return n;
  }
  const cand = db.numbers
    .filter(n => n.state === 'active' && n.sentToday < n.dayLimit && (n.geo === lead.geo || n.channel === 'cloud_api'))
    .sort((a, b) => b.quality - a.quality);
  return cand[0] || null;
}

function renderTemplate(db, tpl, lead) {
  const broker = db.brokers.find(b => b.id === lead.broker);
  return tpl.body
    .replace(/\{name\}/g, lead.name.split(' ')[0])
    .replace(/\{agency\}/g, db.settings.agency.name)
    .replace(/\{geo\}/g, db.settings.geoNames[lead.geo] || lead.geo)
    .replace(/\{broker\}/g, broker ? broker.name : 'наш эксперт')
    .replace(/\{slot\}/g, '11:00');
}

/* 🚫 Длинные/средние тире (— –) — явный «AI-tell» в переписке. Чистим в ЕДИНОЙ точке отправки,
   чтобы ни одно тире не дошло клиенту ни по одному каналу (ИИ-текст, цепочка, преанонс, шаблон).
   Ручной ввод брокера (via==='human') НЕ трогаем — человек пишет как хочет. */
function deDash(s) {
  if (!s) return s;
  return String(s)
    .replace(/^[ \t]*[—–][ \t]+/gm, '- ')                                /* маркер списка в начале строки */
    .replace(/(\d)\s*[—–]\s*(\d)/g, '$1-$2')                             /* числовой диапазон «2 — 3» → «2-3» */
    .replace(/[ \t]+[—–][ \t]+/g, ', ')                                  /* инлайн «цена — $400k» → «цена, $400k» */
    .replace(/([A-Za-zА-Яа-яЁё])[—–]([A-Za-zА-Яа-яЁё])/g, '$1, $2')      /* без пробелов между словами */
    .replace(/[—–]/g, '-');                                              /* любой оставшийся — в дефис */
}

function send(db, lead, text, via, opts = {}) {
  if (text && via !== 'human') text = deDash(text);
  if (via === 'human') {
    lead.unread = 0;   /* брокер ответил вручную → он видел переписку, непрочитанных нет */
    /* надзор тона: грубость менеджера в исходящем → флаг качества брокеру + тревога руководителю */
    if (text) { try { const tn = control.toneScan(text); if (tn) { const br = db.brokers.find(b => b.id === lead.broker); if (br) { br.toneFlags = (br.toneFlags || 0) + 1; br.lastToneFlag = { at: Date.now(), reason: tn.reason, leadId: lead.id }; } ai.pushEvent(db, { type: 'ai_off', leadId: lead.id, text: `⚠️ Тон: ${(db.brokers.find(b => b.id === lead.broker) || {}).name || 'брокер'} — ${tn.reason} в сообщении клиенту ${lead.name}` }); } } catch (_) {} }
  }
  const channel = opts.channel || resolveChannel(db, lead);
  /* 🛡️ ЗОЛОТОЕ ПРАВИЛО АНТИ-ДУБЛЬ (анти-бан): одно и то же содержимое (текст / видео / фото) НИКОГДА
     не уходит лиду повторно в ТОМ ЖЕ канале. Дубли = спам = мгновенный бан номера. Это защитная сетка
     поверх маршрутизации: даже при баге/повторном тике/двойном каскаде клиент не получит одно и то же дважды.
     Разрешено: то же содержимое в ДРУГОМ канале (второй круг каскада) и ручная отправка брокером (via='human'). */
  const _dupKey = (opts.media && opts.media.url) ? ('m:' + String(opts.media.url)) : (text ? ('t:' + String(text).trim().slice(0, 300)) : '');
  if (_dupKey && via !== 'human' && !opts.allowDup) {
    const since = Date.now() - 14 * 864e5;
    const keyOf = mm => (mm.media && mm.media.url) ? ('m:' + mm.media.url) : (mm.text ? ('t:' + String(mm.text).trim().slice(0, 300)) : '');
    if (db.messages.some(mm => mm.leadId === lead.id && mm.dir === 'out' && (mm.channel || 'wa') === channel && mm.at > since && keyOf(mm) === _dupKey)) {
      ai.pushEvent(db, { type: 'send_skip', leadId: lead.id, text: `Анти-дубль (${CH_NAMES[channel] || channel}, ${lead.name}): это сообщение уже отправлялось — повторно не шлём` });
      return null;
    }
  }
  if (channel !== 'wa') {
    /* не-WA каналы: mock-запись в переписку; боевые слоты (TG-бот/Viber/Resend) включаются токенами */
    const m0 = { id: store.nextId('m'), leadId: lead.id, dir: 'out', via, channel, text, at: Date.now(), status: 'sent', templateId: opts.templateId || null };
    if (channel === 'email' && opts.subject) m0.subject = opts.subject;
    if (opts.media && opts.media.url) m0.media = { type: opts.media.type || 'image', url: String(opts.media.url).slice(0, 500) };
    db.messages.push(m0);
    lead.lastMsgAt = m0.at;
    lead.lastDir = 'out';
    const cfg = db.settings.channels;
    (async () => {
      try {
        if (channel === 'email') {
          const to = (lead.contacts || []).find(c => c.kind === 'email')?.value;
          if (to) {
            /* rich-письмо через email.js + домен агентства (хук в index.js). Фолбэк — прежний plain-Resend. */
            if (module.exports.onEmailSend) {
              const r = await module.exports.onEmailSend(db, lead, { to, subject: opts.subject || 'По вашей заявке', text, media: m0.media || (opts.media && opts.media.url ? opts.media : null), campaignId: opts.campaignId || null });
              if (!r || !r.ok) throw new Error((r && r.error) || 'email send failed');
              if (r.id) { m0.emailId = r.id; store.save(); }   /* id Resend → для аналитики (вебхук)*/
            } else if (cfg.email.key && cfg.email.from) {
              const r = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + cfg.email.key, 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: cfg.email.from, to, subject: opts.subject || 'По вашей заявке', text }),
              });
              if (!r.ok) throw new Error('resend ' + r.status);
            }
          }
        }
        if (channel === 'tg') {
          if (tgGraySender) {
            /* холодное касание с прогретого TG-аккаунта (первое касание/цепочка) — как серый WA */
            await tgGraySender(db, lead, m0);
          } else if (cfg.tg.botToken && lead.channels?.tgChatId) {
            /* фолбэк: бот-мост (лид уже привязан) */
            await fetch(`https://api.telegram.org/bot${cfg.tg.botToken}/sendMessage`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: lead.channels.tgChatId, text }),
            });
          }
        }
        /* Viber — два официальных режима:
           • mode='bsp' (Infobip/др.): ХОЛОДНОЕ персональное касание по НОМЕРУ лида (Viber Business
             Messages, аналог WA Cloud API). Платно, по consent, отправитель = верифиц. бренд.
           • mode='pa' (Public Account): только тем, кто ПЕРВЫМ написал PA (viberId из вебхука). */
        if (channel === 'viber' && cfg.viber) {
          const vb = cfg.viber;
          if (vb.mode === 'bsp' && vb.apiKey && vb.sender) {
            const phone = String(lead.phone || '').replace(/\D/g, '');
            if (!phone) throw new Error('нет номера лида для Viber BSP');
            /* Infobip Viber Business Messages API v2 (провайдер по умолчанию; др. BSP — свой адаптер) */
            const base = String(vb.baseUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
            if (!base) throw new Error('не задан baseUrl BSP (Viber)');
            const rv = await fetch('https://' + base + '/viber/2/messages', {
              method: 'POST', headers: { Authorization: 'App ' + vb.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({ messages: [{ sender: vb.sender, destinations: [{ to: phone }], content: { text, type: 'TEXT' } }] }),
            });
            const jb = await rv.json().catch(() => ({}));
            if (!rv.ok) throw new Error('viber-bsp ' + rv.status + ': ' + (jb.requestError && jb.requestError.serviceException && jb.requestError.serviceException.text || rv.status));
            try { m0.viberMsgId = (jb.messages && jb.messages[0] && jb.messages[0].messageId) || null; } catch (_) {}
          } else if (vb.token && lead.channels?.viberId) {
            const rv = await fetch('https://chatapi.viber.com/pa/send_message', {
              method: 'POST', headers: { 'X-Viber-Auth-Token': vb.token, 'Content-Type': 'application/json' },
              body: JSON.stringify({ receiver: lead.channels.viberId, type: 'text', text, sender: { name: (db.settings.agency && db.settings.agency.name) || 'Lumen' } }),
            });
            const jv = await rv.json().catch(() => ({}));
            if (jv.status && jv.status !== 0) throw new Error('viber ' + (jv.status_message || jv.status));
          }
        }
        m0.status = 'delivered';
      } catch (err) {
        m0.status = 'failed';
        ai.pushEvent(db, { type: 'send_skip', leadId: lead.id, text: `${CH_NAMES[channel]} отказал (${lead.name}): ${err.message}` });
      }
      store.save();
    })();
    store.save();
    if (via === 'ai' && module.exports.onAiReply) { try { module.exports.onAiReply(db, lead, m0); } catch (_) {} }   /* в Telegram (брокеру или фаундеру для пула): «ассистент ответил клиенту» */
    return m0;
  }
  const num = pickNumber(db, lead);
  /* нет записи в db.numbers — это НЕ повод молчать, если доступен серый транспорт (Baileys-воркер):
     серые номера живут в settings.waGray.numbers и выбираются внутри graySender (pickGrayNumber),
     а не в db.numbers. Раньше пустой db.numbers у тенанта отсекал ВСЕ ручные касания/цепочки до серого
     транспорта. Жёстко пропускаем только когда нет ни номера в пуле, ни серого отправителя, ни Cloud. */
  if (!num && !graySender && !wa.ready(db)) {
    ai.pushEvent(db, { type: 'send_skip', leadId: lead.id, text: `Пропуск отправки ${lead.name}: нет доступного номера (лимиты/карантин)` });
    return null;
  }
  if (num) {
    lead.numberId = num.id;
    num.sentToday += 1;
    if (num.sentToday > num.dayLimit * 0.8) num.quality = Math.max(0, +(num.quality - 0.3).toFixed(1));
  }
  const m = { id: store.nextId('m'), leadId: lead.id, dir: 'out', via, channel: 'wa', text, at: Date.now(), status: 'sent', numberId: num ? num.id : null, templateId: opts.templateId || null, campaignId: opts.campaignId || null, waId: null };
  if (opts.media && opts.media.url) m.media = { type: opts.media.type || 'image', url: String(opts.media.url).slice(0, 500), name: (opts.media.name || '').slice(0, 120), mimetype: opts.media.mimetype || '' };
  db.messages.push(m);
  lead.lastMsgAt = m.at;
  lead.lastDir = 'out';
  if (lead.ai.silentSince == null) lead.ai.silentSince = m.at;
  /* ⛔ ЖЁСТКОЕ ПРАВИЛО: рассылки (broadcast) идут ТОЛЬКО через официальный Cloud API.
     Серые номера для массовых рассылок ЗАПРЕЩЕНЫ (мгновенный бан). Если Cloud не готов — не шлём вообще. */
    if (opts.broadcast && !wa.ready(db)) {
    m.status = 'failed';
    ai.pushEvent(db, { type: 'send_skip', leadId: lead.id, text: `Рассылка не отправлена (${lead.name}): массовые рассылки идут ТОЛЬКО через официальный Cloud API. Серые номера для рассылок запрещены (риск мгновенного бана). Подключите официальный номер в «Номера → Cloud API».` });
    store.save();
    return m;
  }
  /* МАРШРУТ КАНАЛА WA (архитектура клиента):
     • Cloud API — ТОЛЬКО массовые рассылки по спящей базе (opts.broadcast).
     • Серый номер (Baileys) — ВСЯ основная переписка: первое касание, цепочка, ИИ, ручное.
     Поэтому через Cloud идём только для broadcast; либо как фолбэк, если серого транспорта нет вообще. */
  const goCloud = wa.ready(db) && (opts.broadcast || !graySender);
  if (goCloud) {
    const tpl = opts.templateId ? db.templates.find(t => t.id === opts.templateId) : null;
    let job;
    if (opts.media && opts.media.url) {
      /* медиа: caption вшиваем где Cloud API позволяет (image/video/document);
         для audio/voice/sticker подпись догоняем отдельным текстовым сообщением */
      job = wa.sendMedia(db, lead, opts.media, text);
      if (text && !wa.mediaSupportsCaption(opts.media.type)) {
        job = job.then(res => { wa.sendText(db, lead, text).catch(() => {}); return res; });
      }
    } else {
      job = tpl && tpl.status === 'approved' ? wa.sendTemplate(db, lead, tpl, text, { phoneId: opts.phoneId }) : wa.sendText(db, lead, text);
    }
    const jp = job.then(res => { m.waId = res.messages?.[0]?.id || null; store.save(); })
      .catch(err => {
        m.status = 'failed';
        ai.pushEvent(db, { type: 'send_skip', leadId: lead.id, text: `Cloud API отказал (${lead.name}): ${err.message}` });
        store.save();
      });
    Object.defineProperty(m, '_sendP', { value: jp, enumerable: false, configurable: true });   /* awaitable: чтобы следующее сообщение (текст после видео) ушло ПОСЛЕ завершения этого */
  } else if (graySender) {
    /* серый способ: реальная отправка с прогретого номера брокера (или мок, если нет подключённого) */
    const gp = Promise.resolve(graySender(db, lead, m, opts)).catch(err => {
      m.status = 'failed';
      ai.pushEvent(db, { type: 'send_skip', leadId: lead.id, text: `Серый номер отказал (${lead.name}): ${err.message}` });
      store.save();
    });
    Object.defineProperty(m, '_sendP', { value: gp, enumerable: false, configurable: true });   /* awaitable: видео догружается → ТОЛЬКО потом текст (иначе текст обгонял видео у клиента) */
  } else {
    setTimeout(() => { if (m.status === 'sent') m.status = 'delivered'; store.save(); }, 1500); // mock-доставка
  }
  store.save();
  if (via === 'ai' && module.exports.onAiReply) { try { module.exports.onAiReply(db, lead, m); } catch (_) {} }   /* в Telegram (брокеру или фаундеру для пула): «ассистент ответил клиенту» */
  return m;
}

/* ---------- автораспределение по брокерам ---------- */
function brokerOnShift(b) {
  const now = new Date();
  const day = now.getDay() === 0 ? 7 : now.getDay(); // 1..7, пн=1
  const s = b.schedule || {};
  if (s.days && !s.days.includes(day)) return false;
  const hm = now.getHours() * 60 + now.getMinutes();
  const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  const win = (s.perDay || {})[day] || s;   /* у дня может быть свой интервал */
  if (win.from && hm < toMin(win.from)) return false;
  if (win.to && hm >= toMin(win.to)) return false;
  return true;
}

function pickBroker(db, lead) {
  const mode = (db.settings.automations || {}).assignMode || 'load';
  const avail = b => b.active !== false && !b.away;   /* дежурство: отсутствующим и отключённым новых не даём */
  let pool = db.brokers.filter(b => b.geo === lead.geo && avail(b));
  if (!pool.length) pool = db.brokers.filter(avail);
  if (!pool.length) pool = db.brokers.slice();   /* совсем некому — лид не виснет */
  if (mode === 'shift') {
    const onShift = pool.filter(brokerOnShift);
    if (onShift.length) pool = onShift; // вне смен — fallback на всех, лид не виснет
  }
  if (mode === 'roundrobin') {
    const a = db.settings.automations;
    a.rrCursor = (a.rrCursor + 1) % pool.length;
    return pool[a.rrCursor];
  }
  return pool.sort((a, b) => (a.load / a.capacity) - (b.load / b.capacity))[0];
}

/* ---------- передача брокеру ---------- */
/* предпросмотр передачи: что уйдёт клиенту и что увидит брокер (без изменения данных) */
function handoverPreview(db, lead, brokerId) {
  let broker = brokerId ? db.brokers.find(b => b.id === brokerId) : null;
  if (!broker) broker = pickBroker(db, lead);
  const tpl = db.templates.find(t => t.id === 'tpl_slot');
  const clientMsg = tpl ? renderTemplate(db, tpl, Object.assign({}, lead, { broker: broker.id })) : '';
  const auto = db.settings.automations || {};
  let preannounce = '';
  if (auto.handoverPreannounce && broker && broker.phone) {
    const first = lead.name.split(' ')[0];
    preannounce = `${first}, с вами свяжется ${broker.name}, ваш персональный эксперт по ${db.settings.geoNames[lead.geo] || lead.geo} — напишет сюда или с номера ${broker.phone}. Это тот же наш отдел, продолжите с ним.`;
  }
  return { broker: broker ? { id: broker.id, name: broker.name } : null, clientMsg, preannounce, summary: lead.summary || ai.buildSummary(db, lead) };
}

function handover(db, lead, brokerId, opts = {}) {
  let broker = brokerId ? db.brokers.find(b => b.id === brokerId) : null;
  if (!broker) broker = pickBroker(db, lead);
  if (lead.broker !== broker.id) control.recordOwner(db, lead, broker.id, 'auto', 'передача брокеру');
  lead.broker = broker.id;
  lead.stage = 'handover';
  lead.handoverAt = Date.now();   /* точка отсчёта SLA «коснись за N минут» */
  lead.slaFlag = null;
  broker.load += 1;
  if (!lead.summary) lead.summary = ai.buildSummary(db, lead);
  if (!lead.nextAction) lead.nextAction = { text: `Позвонить в течение 30 мин (передан от ИИ)`, at: Date.now() + 30 * 60e3 };
  if (module.exports.onHandover) module.exports.onHandover(db, lead);
  const tpl = db.templates.find(t => t.id === 'tpl_slot');
  const clientMsg = (opts.clientMsg && String(opts.clientMsg).trim()) ? String(opts.clientMsg).trim() : (tpl ? renderTemplate(db, tpl, lead) : '');
  if (clientMsg) send(db, lead, clientMsg, 'ai');
  /* Вариант B: брокер пишет с личного номера — тёплый преданонс с того же (центрального)
     номера, чтобы сообщение брокера не выглядело холодным незнакомым номером */
  const auto = db.settings.automations || {};
  if (auto.handoverPreannounce && broker.phone) {
    const first = lead.name.split(' ')[0];
    send(db, lead, `${first}, с вами свяжется ${broker.name}, ваш персональный эксперт по ${db.settings.geoNames[lead.geo] || lead.geo} — напишет сюда или с номера ${broker.phone}. Это тот же наш отдел, продолжите с ним.`, 'ai');
  }
  ai.pushEvent(db, { type: 'handover', leadId: lead.id, text: `${lead.name} передан брокеру: ${broker.name} (саммари готово)` });
  store.save();
  return broker;
}

/* ---------- цепочки касаний ---------- */
function dayMs(db) { return db.settings.demo.accelerate ? db.settings.demo.dayMs : DAY; }

/* ---------- тихие часы по поясу ЛИДА ----------
   Ночью не трогаем: касания цепочек, реанимация, напоминания сдвигаются на утро.
   Исключение — мгновенный первый ответ на свежую заявку (клиент сейчас онлайн). */
function quietCfg(db) {
  const q = (db.settings.automations || {}).quietHours;
  return Object.assign({ enabled: true, from: 21, to: 9 }, q || {});
}
function leadLocalHour(lead) {
  return new Date(Date.now() + (lead.tz ?? 4) * 3600e3).getUTCHours();
}
function inQuiet(db, lead) {
  const q = quietCfg(db);
  if (!q.enabled) return false;
  const h = leadLocalHour(lead);
  return q.from > q.to ? (h >= q.from || h < q.to) : (h >= q.from && h < q.to);
}
/* следующее «утро» лида (q.to:00 его времени) в UTC-timestamp */
function morningAt(db, lead) {
  const q = quietCfg(db);
  const tz = (lead.tz ?? 4) * 3600e3;
  const local = new Date(Date.now() + tz);
  const m = new Date(local);
  m.setUTCHours(q.to, 0, 0, 0);
  if (m <= local) m.setUTCDate(m.getUTCDate() + 1);
  return +m - tz + Math.floor(Math.random() * 20 * 60e3); /* джиттер 0-20 мин, чтобы не залпом */
}

/* ТАРГЕТИНГ ЦЕПОЧКИ: на какие лиды она распространяется.
   Модель seq.filters { geos[], sources[], channels[], contractors[], brokers:'all'|[ids] };
   пустой массив = «любой». Backward-compat: старое поле seq.geo ('all'|geoKey). */
function seqFilters(seq) {
  const f = (seq && seq.filters) || {};
  const arr = v => Array.isArray(v) ? v.filter(Boolean) : [];
  return {
    geos: Array.isArray(f.geos) ? f.geos.filter(Boolean) : (seq && seq.geo && seq.geo !== 'all' ? [seq.geo] : []),
    sources: arr(f.sources),
    channels: arr(f.channels),
    contractors: arr(f.contractors),
    brokers: (f.brokers === 'all' || Array.isArray(f.brokers)) ? f.brokers : 'all',
  };
}
function seqMatchesLead(seq, lead) {
  const f = seqFilters(seq);
  if (f.geos.length && !f.geos.includes(lead.geo)) return false;
  if (f.sources.length && !f.sources.includes(lead.source)) return false;
  if (f.channels.length && !f.channels.includes(lead.channel || lead.activeChannel || 'wa')) return false;
  if (f.contractors.length && !f.contractors.includes(lead.vendorId || lead.vendor || lead.contractor || '')) return false;   /* хук пишет vendorId — раньше фильтр по подрядчику НИКОГДА не матчил (проверял lead.vendor) */
  if (f.brokers !== 'all' && Array.isArray(f.brokers) && !f.brokers.includes(lead.broker)) return false;
  return true;
}
function seqSpecificity(seq) {
  const f = seqFilters(seq);
  return (f.geos.length ? 1 : 0) + (f.sources.length ? 1 : 0) + (f.channels.length ? 1 : 0) + (f.contractors.length ? 1 : 0) + (f.brokers !== 'all' ? 1 : 0);
}

/* ПРЕВЬЮ СЛЕДУЮЩЕГО КАСАНИЯ для диалога: какая цепочка/шаг у лида сейчас активны, когда уйдёт и что за текст.
   Повторяет выбор цепочки из tickChains (чтобы совпадало с реальной отправкой). null = активной цепочки нет. */
function nextTouchInfo(db, lead) {
  try {
    if (!lead || !lead.ai || !lead.ai.enabled || lead.marketingOptOut) return null;
    if (!['new', 'touch'].includes(lead.stage)) return null;
    if (lead.lastDir === 'in') return null;
    if ((db.messages || []).some(m => m.leadId === lead.id && m.dir === 'in')) return null;
    const actives = (db.sequences || []).filter(s => s.active);
    if (!actives.length) return null;
    const autoOn = !db.settings.ai || db.settings.ai.autoChains !== false;
    if (!autoOn && !lead.ai.forced) return null;
    const defaultSeqId = (db.settings.ai && db.settings.ai.defaultSeq) || null;
    let seq = lead.ai.forceSeq && actives.find(s => s.id === lead.ai.forceSeq);
    if (!seq) {
      const elig = actives.filter(s => (!s.ownerId || s.ownerId === lead.broker) && seqMatchesLead(s, lead));
      elig.sort((a, b) => { const pa = a.ownerId === lead.broker ? 1 : 0, pb = b.ownerId === lead.broker ? 1 : 0; if (pa !== pb) return pb - pa; const sa = seqSpecificity(a), sb = seqSpecificity(b); if (sa !== sb) return sb - sa; const da = a.id === defaultSeqId ? 1 : 0, dbb = b.id === defaultSeqId ? 1 : 0; return dbb - da; });
      seq = elig[0];
    }
    if (!seq) return null;
    const steps = (seq.steps || []).filter(s => s.active);
    const step = steps[lead.ai.chainStep || 0];
    if (!step) return null;
    const preview = step.text ? fillVars(db, lead, String(step.text)).slice(0, 240)
      : (step.creative || step.kind === 'creative') ? '📎 Креатив из рекламы + подпись'
      : 'ИИ соберёт персональный текст при отправке';
    return { seqName: seq.name || '', stepNum: (lead.ai.chainStep || 0) + 1, total: steps.length, label: step.label || '', at: lead.ai.nextTouchAt || null, channel: step.channel || lead.activeChannel || 'wa', preview };
  } catch (_) { return null; }
}
function tickChains(db) {
  const nowT = Date.now();
  const actives = db.sequences.filter(s => s.active);
  if (!actives.length) return;
  /* глобальный выключатель авто-цепочек на новые лиды (Воронка → контрол цепочек).
     Выключен → авто-касания не идут; но лиды, запущенные ВРУЧНУЮ (ai.forced), работают всегда. */
  const autoOn = !db.settings.ai || db.settings.ai.autoChains !== false;
  const defaultSeqId = (db.settings.ai && db.settings.ai.defaultSeq) || null;
  for (const lead of db.leads) {
    if (!lead.ai.enabled) continue;
    if (lead.ai.pendingTouch) continue;   /* касание ждёт одобрения брокера (режим «с одобрением») — не трогаем, пока не решит */
    const _tmode = (db.settings.automations || {}).touchMode || 'auto';
    if (_tmode === 'off' && !lead.ai.forceInstant) continue;   /* режим «выключено»: проактивных касаний нет (кроме «Отправить сейчас») */
    if (!db._demoSandbox && (lead._demo || isSeedDemoPhone(lead.phone))) continue;   // 🔒 демо-лиды/зашитые демо-номера НЕ получают авто-касаний у реальных тенантов
    if (lead.marketingOptOut) continue;                             // отписался от рассылки — касания не шлём
    if (!autoOn && !lead.ai.forced) continue;                       // авто off → только ручные
    /* какую цепочку крутить (приоритет): принудительная (ручной запуск) → ЛИЧНАЯ цепочка закреплённого
       брокера (по гео, затем «все») → дефолтная из настроек → агентская (base) по гео → агентская «все».
       Личные цепочки (ownerId) применяются ТОЛЬКО к лидам своего брокера — чужим не протекают. */
    /* приоритет: принудительная (ручной запуск) → среди подходящих по ТАРГЕТИНГУ:
       личная цепочка закреплённого брокера → более специфичная (больше фильтров) → дефолтная → агентская.
       Личные цепочки (ownerId) применяются ТОЛЬКО к лидам своего брокера. */
    let seq = lead.ai.forceSeq && actives.find(s => s.id === lead.ai.forceSeq);
    if (!seq) {
      const elig = actives.filter(s => (!s.ownerId || s.ownerId === lead.broker) && seqMatchesLead(s, lead));
      elig.sort((a, b) => {
        const pa = a.ownerId === lead.broker ? 1 : 0, pb = b.ownerId === lead.broker ? 1 : 0;
        if (pa !== pb) return pb - pa;
        const sa = seqSpecificity(a), sb = seqSpecificity(b);
        if (sa !== sb) return sb - sa;
        const da = a.id === defaultSeqId ? 1 : 0, dbb = b.id === defaultSeqId ? 1 : 0;
        return dbb - da;
      });
      seq = elig[0];
    }
    if (!seq) continue;
    /* цепочка — только до первого ответа клиента; ответил → живой диалог,
       и обратно в «Спящие» из диалога цепочка лида не роняет */
    if (!['new', 'touch'].includes(lead.stage)) continue;
    if (lead.lastDir === 'in') continue;
    if (db.messages.some(m => m.leadId === lead.id && m.dir === 'in')) continue;
    /* гибкий каскад: через N касаний без ответа в текущем канале → следующий мессенджер (settings.channels.cascadeAfterTouches; 0 = только после исчерпания цепочки) */
    const cascadeAfter = +(db.settings.channels && db.settings.channels.cascadeAfterTouches || 0);
    if (cascadeAfter > 0 && lead.ai.chainStep >= cascadeAfter) {
      const prevCh = lead.activeChannel || 'wa';
      const nx = nextChannel(db, lead);
      if (nx && nx !== prevCh) {
        lead.activeChannel = nx; lead.ai.chainStep = 0; lead.ai.nextTouchAt = nowT + 0.5 * dayMs(db);
        ai.pushEvent(db, { type: 'touch', leadId: lead.id, text: `${lead.name}: ${cascadeAfter} касаний без ответа в ${CH_NAMES[prevCh] || prevCh} — перехожу на ${CH_NAMES[nx]}` });
        continue;
      }
    }
    /* фолбэк-каналы с лимитом касаний (Viber/email): отправили cap сообщений → сразу следующий канал/сон.
       Так в Viber/email не крутится вся мессенджер-цепочка — только одно уместное касание. */
    const chCap = CHANNEL_TOUCH_CAP[lead.activeChannel];
    if (chCap && lead.ai.chainStep >= chCap) {
      const prevCh = lead.activeChannel;
      const nx = (db.settings.channels?.secondRound || cascadeAfter > 0) ? nextChannel(db, lead) : null;
      if (nx && nx !== prevCh) {
        lead.activeChannel = nx; lead.ai.chainStep = 0; lead.ai.nextTouchAt = nowT + 0.5 * dayMs(db); lead.ai.chainBaseAt = lead.ai.nextTouchAt;
        ai.pushEvent(db, { type: 'touch', leadId: lead.id, text: `${lead.name}: ${CH_NAMES[prevCh]} — одно касание отправлено, перехожу на ${CH_NAMES[nx]}` });
        continue;
      }
      lead.stage = 'sleeping';
      ai.pushEvent(db, { type: 'sleep', leadId: lead.id, text: `${lead.name}: каналы исчерпаны (${CH_NAMES[prevCh]} — одно касание) → «Спящие»` });
      continue;
    }
    const step = seq.steps.filter(s => s.active)[lead.ai.chainStep];
    if (!step) {
      /* цепочка исчерпана: омниканальный второй круг → следующий канал по приоритету */
      const nx = db.settings.channels?.secondRound ? nextChannel(db, lead) : null;
      if (nx && !lead.ai.secondRound) {
        lead.activeChannel = nx;
        lead.ai.secondRound = true;
        lead.ai.chainStep = 0;
        lead.ai.nextTouchAt = nowT + 0.5 * dayMs(db);
        lead.ai.chainBaseAt = lead.ai.nextTouchAt;   /* второй круг: кумулятивный day считаем от старта круга */
        ai.pushEvent(db, { type: 'touch', leadId: lead.id, text: `${lead.name}: молчит в WhatsApp — переключаю каскад на ${CH_NAMES[nx]}, второй круг касаний` });
        continue;
      }
      lead.stage = 'sleeping';
      ai.pushEvent(db, { type: 'sleep', leadId: lead.id, text: `${lead.name}: каскад каналов исчерпан без ответа → «Спящие»` });
      continue;
    }
    if (lead.ai.nextTouchAt == null) {
      /* тайминг: step.day — КУМУЛЯТИВНЫЙ день от старта цепочки (chainBaseAt), а не дельта от «сейчас».
         Так шаги не накапливают задержку, а шаг «сразу» (тот же day, что у предыдущего) уходит сразу за ним. */
      if (lead.ai.chainStep === 0) { lead.ai.chainBaseAt = nowT; lead.ai.nextTouchAt = nowT + 30e3; }
      else { lead.ai.nextTouchAt = (lead.ai.chainBaseAt || lead.createdAt || nowT) + (+step.day || 0) * dayMs(db); }
      continue;
    }
    if (nowT < lead.ai.nextTouchAt) continue;
    /* тихие часы: мгновенное первое касание (шаг 0, свежая заявка <30 мин) разрешено — клиент онлайн; остальное ждёт утра */
    const freshInstant = (lead.ai.chainStep === 0 && nowT - lead.createdAt < 30 * 60e3) || !!lead.ai.forceInstant;
    if (lead.ai.forceInstant) delete lead.ai.forceInstant;   /* «Отправить сейчас» из диалога — одноразовый обход тихих часов */
    if (!freshInstant && inQuiet(db, lead)) { lead.ai.nextTouchAt = morningAt(db, lead); continue; }

    let text;
    const sendOpts = {};
    if (step.channel === 'email' || (lead.activeChannel === 'email' && step.channel !== 'voice')) {
      sendOpts.channel = 'email';
      sendOpts.subject = fillVars(db, lead, step.subject || 'По вашей заявке — {agency}');
    } else if (lead.activeChannel && lead.activeChannel !== 'wa' && step.channel !== 'voice') {
      /* каскад ушёл на tg/viber — держим канал ЖЁСТКО. Иначе send() пере-резолвит канал и, если
         активный канал помечен недоступным, касание молча утекает в WhatsApp (повторный WA-контакт). */
      sendOpts.channel = lead.activeChannel;
    }
    if (step.mode === 'template') {
      const tpl = db.templates.find(t => t.id === step.templateId);
      text = tpl ? renderTemplate(db, tpl, lead) : null;
    } else if (step.mode === 'personalize') {
      /* 🤖 ИИ-ПЕРСОНАЛИЗАЦИЯ КАСАНИЯ (тот же движок, что кнопка «Персонализировать» в карточке):
         с отсылкой на объявление лида, сильные стороны проекта, критерии из лид-формы. Генерится
         асинхронно (LLM), результат кэшируется на лиде → на следующем тике уходит. E-mail — официальным тоном. */
      const isEmail = sendOpts.channel === 'email';
      const ck = isEmail ? '_ptEmail' : '_ptText';
      if (lead.ai[ck]) { text = lead.ai[ck]; if (isEmail && lead.ai._ptEmailSubj) sendOpts.subject = lead.ai._ptEmailSubj; }
      else if (llm.available && llm.available() && llm.composeFirstTouch) {
        if (!lead.ai['_g' + ck]) {
          lead.ai['_g' + ck] = true;
          const styleSamples = ((db.touchStyles && (db.touchStyles[lead.broker] || db.touchStyles.owner)) || []).map(x => x.text).filter(Boolean);
          const agencyName = (db.settings.agency && db.settings.agency.name) || 'агентство';
          (async () => {
            try {
              const out = await llm.composeFirstTouch(db, lead, '', agencyName, styleSamples, { email: isEmail, lang: seq.lang || undefined });
              /* ⚠️ пустой message (успех LLM, но пусто) — НЕ оставляем '' (иначе бесконечная регенерация, касание не уйдёт никогда): запасной текст */
              lead.ai[ck] = (out && out.message) ? out.message : fillVars(db, lead, step.text || '{name}, здравствуйте! Вы оставляли заявку по креативу выше — подобрать актуальные варианты под ваш запрос?');
              if (isEmail && out && out.subject) lead.ai._ptEmailSubj = out.subject;
            } catch (e) {
              lead.ai[ck] = fillVars(db, lead, step.text || '{name}, здравствуйте! Вы оставляли заявку по креативу выше — подобрать актуальные варианты под ваш запрос?');
              ai.pushEvent(db, { type: 'note', leadId: lead.id, text: `ИИ-персонализация ${isEmail ? 'e-mail' : 'касания'} не удалась (${lead.name}): ${e.message} — ушёл запасной текст` });
            } finally { lead.ai['_g' + ck] = false; store.save(); }
          })();
        }
        continue;   /* генерация идёт — ждём следующего тика (текст ещё не готов) */
      } else {
        text = fillVars(db, lead, step.text || '{name}, здравствуйте! Подобрать варианты по вашей заявке (креатив выше)?');   /* нет LLM — запасной шаблон */
      }
    } else if (step.mode === 'text' || step.mode === 'creative') {
      text = step.text ? fillVars(db, lead, step.text) : '';   /* для «Креатив из рекламы» текст = подпись (необязательна) */
    } else {
      text = chainAiText(db, lead, step);
    }
    /* «Креатив из рекламы» (mode='creative') / прикреплённый креатив шага — уходит как медиа+подпись.
       По умолчанию берётся креатив, ПО КОТОРОМУ ПРИШЁЛ ЛИД (его атрибуция), либо конкретный (step.creative.url). */
    let stepCreative = null;
    if (sendOpts.channel !== 'email' && (step.mode === 'creative' || (step.creative && (step.creative.url || step.creative.auto)))) {
      if (step.creative && step.creative.url) {
        stepCreative = { type: step.creative.type || (/\.(mp4|webm|mov)(\?|$)/i.test(step.creative.url) ? 'video' : 'image'), url: String(step.creative.url).slice(0, 500), name: step.creative.name || '' };
      } else {
        const adRec = lead.ads && lead.ads.adId ? (db.ads || []).find(a => String(a.adId) === String(lead.ads.adId)) : null;
        const m = (adRec && adRec.media && adRec.media.url) ? adRec.media
          : (lead.creativeUrl ? { type: /\.(mp4|webm|mov)(\?|$)/i.test(lead.creativeUrl) ? 'video' : 'image', url: lead.creativeUrl } : null);
        if (m) stepCreative = { type: m.type || (/\.(mp4|webm|mov)(\?|$)/i.test(m.url) ? 'video' : 'image'), url: String(m.url).slice(0, 500), name: (adRec && adRec.name) || '' };
      }
    }
    if (text || stepCreative) {
      if (text && sendOpts.channel === 'email') {
        /* e-mail: приветствие («Здравствуйте, Имя!») и подпись добавляет шаблон письма (renderCascadeEmail) —
           здесь только лёгкая чистка, иначе выходило ДВОЙНОЕ приветствие/подпись. */
        text = text.replace(/^\{?name\}?,?\s*/i, '').replace(/😉|👌|🤝|🙏|\)\)/g, '');
      } else if (text && llm.humanize) {
        text = llm.humanize(text);   /* чистим AI-почерк (длинные тире и т.п.) в WhatsApp/мессенджер-касаниях */
      }
      /* РЕЖИМ «С ОДОБРЕНИЕМ»: не шлём сами — кладём готовое касание на одобрение брокеру (превью в диалоге:
         Отправить / Изменить / Пропустить). «Отправить сейчас» (forceInstant) проходит мимо — это явное действие. */
      if (_tmode === 'approval' && !lead.ai.forceInstant) {
        lead.ai.pendingTouch = { text: text || '', label: step.label || '', step: lead.ai.chainStep, channel: sendOpts.channel || lead.activeChannel || 'wa', builtAt: nowT, creative: !!stepCreative };
        ai.pushEvent(db, { type: 'touch_pending', leadId: lead.id, text: `Касание ждёт одобрения: ${lead.name} — ${step.label || ''}` });
        store.save();
        continue;
      }
      /* ДЕРЕВО КРЕАТИВОВ: на ПЕРВОМ касании в мессенджере сначала уходит сам креатив (видео/картинка),
         на который человек среагировал, а затем — текстовое касание. */
      if (lead.ai.chainStep === 0 && sendOpts.channel !== 'email' && !stepCreative) {
        const adRec = lead.ads && lead.ads.adId ? (db.ads || []).find(a => String(a.adId) === String(lead.ads.adId)) : null;
        const media = (adRec && adRec.media && adRec.media.url) ? adRec.media
          : (lead.creativeUrl ? { type: /\.(mp4|webm|mov)(\?|$)/i.test(lead.creativeUrl) ? 'video' : 'image', url: lead.creativeUrl } : null);
        if (media) send(db, lead, '', 'chain', { media });
      }
      if (stepCreative) send(db, lead, text || '', 'chain', { ...sendOpts, media: stepCreative });   /* медиа+подпись одним сообщением */
      else send(db, lead, text, 'chain', sendOpts);
      if (lead.stage === 'new') lead.stage = 'touch';
      ai.pushEvent(db, { type: 'touch', leadId: lead.id, text: `Касание ${lead.ai.chainStep + 1}/${seq.steps.length}: ${lead.name} — ${step.label}${stepCreative ? ' · +креатив' : ''}` });
      /* 📧 ОДНОВРЕМЕННЫЙ E-MAIL: на ПЕРВОМ касании в мессенджере параллельно уходит персонализированное
         письмо (если включено, есть адрес и e-mail-канал активен). Так клиента касаемся сразу двумя каналами. */
      if (lead.ai.chainStep === 0 && sendOpts.channel !== 'email' && db.settings.channels && db.settings.channels.emailAlongside
          && db.settings.channels.enabled && db.settings.channels.enabled.email && !lead.ai._emailAlso && !lead.marketingOptOut
          && (lead.contacts || []).some(c => c.kind === 'email')) {
        lead.ai._emailAlso = true;
        if (llm.available && llm.available() && llm.composeFirstTouch) {
          const styleSamples = ((db.touchStyles && (db.touchStyles[lead.broker] || db.touchStyles.owner)) || []).map(x => x.text).filter(Boolean);
          const agencyName = (db.settings.agency && db.settings.agency.name) || 'агентство';
          (async () => {
            try { const out = await llm.composeFirstTouch(db, lead, '', agencyName, styleSamples, { email: true, lang: seq.lang || undefined });
              send(db, lead, (out && out.message) || '', 'chain', { channel: 'email', subject: (out && out.subject) || 'По вашей заявке' });
            } catch (e) { /* основной канал уже коснулся — молча */ }
          })();
        }
      }
    }
    lead.ai.chainStep += 1;
    const next = seq.steps.filter(s => s.active)[lead.ai.chainStep];
    /* авто-delay: базовый интервал шага + человеческий джиттер (±25%, минимум пара минут),
       чтобы касания не уходили роботизированно в одну и ту же секунду */
    const baseGap = next ? Math.max(0, next.day - step.day) * dayMs(db) : dayMs(db);   /* 0 = «сразу после предыдущего» (пол ниже — 2 мин) */
    const jitter = baseGap * (0.75 + (lead.id.charCodeAt(lead.id.length - 1) % 50) / 100);   /* детерминированный по лиду разброс 0.75–1.25× */
    lead.ai.nextTouchAt = nowT + Math.max(120e3, jitter);
  }
}

const MONTHS_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
function fillVars(db, lead, text) {
  const name = (lead.name || '').trim().split(/\s+/)[0];
  const isPhone = /^[+\d][\d\s()-]*$/.test(name);
  let t = String(text || '');
  if (name && !isPhone) t = t.replace(/\{name\}/g, name);
  else t = t.replace(/,\s*\{name\}/g, '').replace(/\{name\}\s*,\s*/g, '').replace(/\{name\}\s*/g, '');
  const now = new Date(Date.now() + (lead.tz || 0) * 3600e3);
  const slots = now.getUTCHours() < 16 ? 'сегодня в 18:00 или завтра в 11:00' : 'завтра в 11:00 или в 18:00';
  const adRef = lead.ads && lead.ads.matched && lead.ads.adName ? '«' + lead.ads.adName + '»' : (lead.ads && lead.ads.headline ? '«' + lead.ads.headline + '»' : 'вашу заявку');
  const adRec = lead.ads && lead.ads.adId ? (db.ads || []).find(a => String(a.adId) === String(lead.ads.adId)) : null;
  const price = adRec && adRec.priceFrom ? '$' + (+adRec.priceFrom).toLocaleString('en-US') : '';
  const COUNTRY = [['971', 'ОАЭ'], ['7', 'России'], ['380', 'Украины'], ['375', 'Беларуси'], ['998', 'Узбекистана'], ['77', 'Казахстана'], ['48', 'Польши'], ['49', 'Германии'], ['44', 'Великобритании'], ['39', 'Италии'], ['34', 'Испании'], ['420', 'Чехии'], ['41', 'Швейцарии'], ['1', 'США/Канады'], ['90', 'Турции'], ['972', 'Израиля'], ['995', 'Грузии'], ['374', 'Армении']];
  const ph = String(lead.phone || '').replace(/\D/g, '');
  const country = (COUNTRY.find(([c]) => ph.startsWith(c)) || [])[1] || '';
  t = t.replace(/\{priceLine\}/g, price ? `Вход — от ${price}. ` : '')
       .replace(/\{priceLineEn\}/g, price ? `It starts from ${price}. ` : '')
       .replace(/\{price\}/g, price || 'вашего бюджета')
       .replace(/\{countryQ\}/g, country ? `Вы же из ${country}, верно? Во сколько вам удобно?` : 'Во сколько вам удобно?')
       .replace(/\{countryQEn\}/g, country ? `You're from ${country}, right? What time works for you?` : 'What time works for you?');
  /* персонализация под КРЕАТИВ (по которому пришёл лид) и его КРИТЕРИИ квалификации.
     quals могут быть как {budget:{value,quote}}, так и плоскими {budget:'...'} — берём .value если это объект. */
  const q = lead.quals || {};
  const qv = x => (x && typeof x === 'object') ? (x.value || '') : (x || '');
  const district = (adRec && (adRec.area || adRec.district)) || '';
  const hideNames = ((((db.settings || {}).ai || {}).training || {}).hideNames) !== false;
  const projName = (adRec && (adRec.project || adRec.projectName)) || '';
  /* {creative}/{project}: в режиме «скрывать названия» (по умолчанию) — нейтрально/по сути (район), без имени из рекламы.
     Дословное рекламное название ({adName}) не подставляем никогда — оно техническое (с именами/метками). */
  const creativeRef = (!hideNames && projName)
    ? projName
    : (district ? ('проекту в ' + district) : 'проекту, который вы смотрели');
  return t
    .replace(/\{ad\}/g, adRef)
    .replace(/\{creative\}/g, creativeRef)
    .replace(/\{project\}/g, creativeRef)
    .replace(/\{district\}/g, district || (db.settings.geoNames[lead.geo] || lead.geo))
    .replace(/\{budget\}/g, qv(q.budget) || price || 'ваш бюджет')
    .replace(/\{purpose\}/g, qv(q.purpose) || 'вашей цели')
    .replace(/\{timeline\}/g, qv(q.timeline) || 'ваш срок')
    .replace(/\{type\}/g, qv(q.type) || 'подходящий формат')
    .replace(/\{geo\}/g, db.settings.geoNames[lead.geo] || lead.geo)
    .replace(/\{month\}/g, MONTHS_PREP[new Date().getMonth()])
    .replace(/\{agency\}/g, db.settings.agency.name)
    .replace(/\{manager\}/g, (db.settings.agency.manager && db.settings.agency.manager.name) || db.settings.agency.name)
    .replace(/\{slots\}/g, slots);
}

function chainAiText(db, lead, step) {
  /* если в шаге задан промпт — это персонализируемый шаблон: подставляем переменные
     ({creative}/{district}/{budget}/{timeline}/{type}/{purpose} и т.д.) под конкретного лида.
     Так конструктор собирает текст со ссылкой на креатив, по которому пришёл лид, и его критерии. */
  if (step && step.prompt && String(step.prompt).trim()) return fillVars(db, lead, step.prompt);
  const g = db.settings.geoNames[lead.geo] || lead.geo;
  const name = lead.name.split(' ')[0];
  const bank = {
    'Уточнение запроса': `${name}, чтобы не забрасывать вас лишним: одним словом — ${g} интересует для жизни, инвестиций или пока присматриваетесь? Соберу подборку точно под это.`,
    'Кейс по гео': `${name}, из свежего: на этой неделе наш клиент закрыл сделку в ${g} — вход на 15% ниже прайса за счёт предстарта. Такие окна появляются регулярно, могу присылать только подходящие под ваш запрос.`,
    'Голосовое': `🎙 [голосовое 0:24] ${name}, записал короткое голосовое по вашему запросу в ${g} — послушайте, там суть в двух словах.`,
    'Новый повод': `${name}, новость по ${g}: застройщики открыли рассрочки 0% на готовые лоты — это редкая конфигурация. Показать, что попадает в неё прямо сейчас?`,
    'Финальное касание': `${name}, не буду больше беспокоить частыми сообщениями. Оставлю за вами эксперта по ${g} — когда вернётесь к вопросу, просто напишите сюда, продолжим с того же места.`,
  };
  return bank[step.label] || `${name}, на связи по вашему запросу в ${g} — если удобно, продолжим подбор.`;
}

/* ---------- реанимация: скоринг и кампании ---------- */
function wakeScore(db, lead) {
  const days = lead.lastMsgAt ? (Date.now() - lead.lastMsgAt) / DAY : 999;
  const inbound = db.messages.filter(m => m.leadId === lead.id && m.dir === 'in').length;
  let s = 0;
  s += Math.max(0, 40 - Math.min(days, 40));          // свежесть: до 40
  s += Math.min(inbound * 6, 30);                      // вовлечённость: до 30
  if (lead.lastDir === 'in') s += 15;                  // последним писал клиент
  s += Math.min((lead.score || 0) / 10, 10);           // прошлая квалификация
  if ((lead.tags || []).includes('opt-out')) s = 0;
  return Math.round(s);
}

function segmentOf(score) { return score >= 55 ? 'A' : score >= 30 ? 'B' : 'C'; }

function wakePreview(db, filters = {}) {
  const accel = db.settings.demo.accelerate ? 0 : 1;
  const dorm = (l) => Date.now() - (l.lastMsgAt || l.createdAt);
  const QUAL = ['qualified', 'handover', 'viewing', 'deal'];
  const list = db.leads
    .filter(l => !l.marketingOptOut)                                                                    /* отписавшихся в рассылку не берём */
    .filter(l => (filters.stages || ['sleeping']).includes(l.stage))
    .filter(l => !filters.geo || l.geo === filters.geo)
    .filter(l => !filters.olderDays || dorm(l) >= filters.olderDays * DAY * accel)
    .filter(l => !filters.maxDays || dorm(l) <= filters.maxDays * DAY)                                 /* верхняя граница окна «спячки» → точечное окно */
    .filter(l => !filters.tags || !filters.tags.length || (l.tags || []).some(t => filters.tags.includes(t)))
    .filter(l => !filters.sources || !filters.sources.length || filters.sources.includes(l.source))
    .filter(l => !filters.broker || (filters.broker === 'none' ? !l.broker : l.broker === filters.broker))
    .filter(l => filters.qual == null || filters.qual === '' || (filters.qual === 'yes' ? QUAL.includes(l.stage) || (l.quals && Object.values(l.quals).some(Boolean)) : true))
    .map(l => ({ id: l.id, name: l.name, geo: l.geo, phone: l.phone, lastMsgAt: l.lastMsgAt, note: l.summary, source: l.source, tags: l.tags || [], broker: l.broker || null, wakeScore: wakeScore(db, l) }))
    .sort((a, b) => b.wakeScore - a.wakeScore);
  list.forEach(x => x.segment = segmentOf(x.wakeScore));
  return filters.segment ? list.filter(x => x.segment === filters.segment) : list;
}

function startCampaign(db, cmp) {
  const preview = wakePreview(db, cmp.filters);
  cmp.recipients = preview.map(p => p.id);
  cmp.cursor = 0;
  cmp.state = 'running';
  cmp.nextBatchAt = Date.now() + 2000;
  cmp.log.unshift({ at: Date.now(), text: `Старт: ${cmp.recipients.length} получателей, сегменты по скорингу, пачка ${cmp.batchSize}` });
  ai.pushEvent(db, { type: 'wake', text: `Кампания «${cmp.name}» запущена: ${cmp.recipients.length} спящих` });
  store.save();
}

/* ---------- напоминания о встречах: ЦЕПОЧКА порогов (часы до встречи) ----------
   settings.automations.meetRemindChain = [24, 3, 0.5]; legacy meetingReminderHrs — фолбэк.
   Каждый порог шлётся один раз (mt.rem[i]); перенос встречи сбрасывает mt.rem. */
function tickMeetings(db) {
  const a = db.settings.automations || {};
  const chain = Array.isArray(a.meetRemindChain) && a.meetRemindChain.length ? a.meetRemindChain
    : (a.meetingReminderHrs ? [a.meetingReminderHrs] : []);
  if (!chain.length) return;
  const nowT = Date.now();
  for (const mt of db.meetings || []) {
    if (mt.status !== 'scheduled') continue;
    mt.rem = mt.rem || {};
    chain.forEach((hrs, i) => {
      if (mt.rem[i]) return;
      if (mt.at - nowT > 0 && mt.at - nowT <= hrs * 3600e3) {
        const lead = db.leads.find(l => l.id === mt.leadId);
        if (!lead) return;
        /* тихие часы: ночью не будим — кроме случая, когда встреча раньше «утра» (короткое напоминание важнее сна) */
        if (inQuiet(db, lead) && mt.at > morningAt(db, lead)) return;
        const broker = db.brokers.find(b => b.id === mt.brokerId);
        const when = fmtLeadDT(mt.at, lead.tz, { hour: '2-digit', minute: '2-digit' });
        const soon = hrs <= 1;
        const _solo = ((((db.settings.ai || {}).training || {}).handoff) || 'expert') === 'self';
        const withWho = broker ? ' с ' + broker.name : (_solo ? '' : ' с экспертом');
        const pageUrl = global.LUMEN_BASE ? ` Вся информация: ${global.LUMEN_BASE}/m/${mt.id}` : (mt.link ? ' Ссылка: ' + mt.link : '');
        send(db, lead, soon
          ? `${lead.name.split(' ')[0]}, через ${Math.round(hrs * 60)} минут начинаем — ${{ call: 'созвон', video: 'видео-показ', tour: 'показ' }[mt.kind] || 'встреча'}${withWho}.${pageUrl}`
          : `${lead.name.split(' ')[0]}, напоминаю: ${fmtLeadDT(mt.at, lead.tz, { day: 'numeric', month: 'long' })} в ${when} — ${{ call: 'созвон', video: 'видео-показ', tour: 'показ' }[mt.kind] || 'встреча'}${withWho}.${pageUrl} Если время не подходит — напишите, перенесём.`, 'ai');
        mt.rem[i] = true;
        ai.pushEvent(db, { type: 'meeting', leadId: lead.id, text: `Напоминание (${hrs >= 1 ? 'за ' + hrs + ' ч' : 'за ' + Math.round(hrs * 60) + ' мин'}) отправлено: ${lead.name}` });
      }
    });
  }
}

/* ---------- SLA: брокер обязан коснуться лида за N минут после передачи ----------
   Просрочка → эскалация в ленту (+ мгновенный алерт, если включён); вторая просрочка
   (2×N) → «shark tank»: лид возвращается в пул и уходит следующему брокеру. */
function tickSla(db) {
  const slaMin = (db.settings.automations || {}).brokerSlaMin;
  if (!slaMin) return;
  const nowT = Date.now();
  for (const l of db.leads) {
    if (l.stage !== 'handover' || !l.broker || !l.handoverAt) continue;
    const touched = db.messages.some(m2 => m2.leadId === l.id && m2.dir === 'out' && m2.via === 'human' && m2.at > l.handoverAt);
    const mt = (db.meetings || []).some(x => x.leadId === l.id && x.createdAt > l.handoverAt);
    if (touched || mt) { l.slaFlag = null; continue; }
    const overdueMin = (nowT - l.handoverAt) / 60e3;
    const broker = db.brokers.find(b => b.id === l.broker);
    if (overdueMin > slaMin * 2 && l.slaFlag === 'warned') {
      /* shark tank: возврат в пул */
      const pool = db.brokers.filter(b => b.id !== l.broker && b.active !== false && b.geo === l.geo)
        .concat(db.brokers.filter(b => b.id !== l.broker && b.active !== false));
      const nb = pool.sort((a2, b2) => a2.load - b2.load)[0];
      if (nb) {
        if (broker) broker.load = Math.max(0, broker.load - 1);
        control.recordOwner(db, l, nb.id, 'auto', 'SLA ×2 — возврат в пул');
        l.broker = nb.id; nb.load += 1; l.handoverAt = nowT; l.slaFlag = 'reassigned';
        ai.pushEvent(db, { type: 'handover', leadId: l.id, text: `⚠️ SLA ×2: ${l.name} не взят в работу — переназначен на ${nb.name}` });
      }
    } else if (overdueMin > slaMin && !l.slaFlag) {
      l.slaFlag = 'warned';
      ai.pushEvent(db, { type: 'ai_off', leadId: l.id, text: `⚠️ SLA: ${broker ? broker.name : 'брокер'} не связался с ${l.name} за ${slaMin} мин после передачи` });
    }
  }
}

/* РОТАЦИЯ непрожатых заявок: лид в new/touch, клиент НЕ ответил, но получил N касаний ИЛИ провисел X часов →
   переназначаем на следующего (наименее загруженного или квалификатора), сбрасываем цепочку для свежей попытки.
   Ограничено maxRotations — потом лид уходит в «Спящие», чтобы не крутиться вечно. */
function tickRotation(db) {
  const rot = (db.settings.automations || {}).rotation;
  if (!rot || !rot.enabled) return;
  const nowT = Date.now();
  for (const l of db.leads) {
    if (!['new', 'touch'].includes(l.stage)) continue;
    if (l.marketingOptOut) continue;
    if (l.lastDir === 'in') continue;                                         // клиент ответил — не ротируем
    if (db.messages.some(m => m.leadId === l.id && m.dir === 'in')) continue;
    if (!l.broker) continue;                                                  // некого снимать (лид в общем пуле — цепочка сама работает)
    const touches = (l.ai && l.ai.chainStep) || 0;
    const since = l.rotatedAt || l.handoverAt || l.createdAt || 0;
    const ageH = (nowT - since) / 3600e3;
    const byTouch = rot.afterTouches ? touches >= rot.afterTouches : false;
    const byAge = rot.afterHours ? ageH >= rot.afterHours : false;
    if (!byTouch && !byAge) continue;
    const done = l.rotations || 0;
    if (done >= (rot.maxRotations || 2)) {                                    // исчерпали ротации → в «Спящие»
      const prev = db.brokers.find(b => b.id === l.broker); if (prev) prev.load = Math.max(0, (prev.load || 0) - 1);
      l.stage = 'sleeping'; l.slaFlag = 'rotated_out';
      ai.pushEvent(db, { type: 'ai_off', leadId: l.id, text: `🔄 Ротация исчерпана (${done}) — ${l.name} ушёл в «Спящие»` });
      continue;
    }
    /* кандидаты: квалификатор (если включено и есть) → иначе брокеры по гео → любые */
    let pool = [];
    if (rot.toQualifier) pool = db.brokers.filter(b => b.roleType === 'qualifier' && b.id !== l.broker && b.active !== false);
    if (!pool.length) pool = db.brokers.filter(b => b.id !== l.broker && b.active !== false && b.geo === l.geo);
    if (!pool.length) pool = db.brokers.filter(b => b.id !== l.broker && b.active !== false);
    const nb = pool.sort((a, b) => (a.load || 0) - (b.load || 0))[0];
    if (!nb) continue;
    const prev = db.brokers.find(b => b.id === l.broker); if (prev) prev.load = Math.max(0, (prev.load || 0) - 1);
    control.recordOwner(db, l, nb.id, 'auto', `ротация: не прожат (${byTouch ? touches + ' касаний' : Math.round(ageH) + 'ч'})`);
    l.broker = nb.id; nb.load = (nb.load || 0) + 1;
    l.rotatedAt = nowT; l.rotations = done + 1;
    l.ai = l.ai || {}; l.ai.chainStep = 0; l.ai.nextTouchAt = nowT + 30e3;    // новый начинает касания заново
    ai.pushEvent(db, { type: 'handover', leadId: l.id, text: `🔄 Ротация: ${l.name} не прожат — переназначен на ${nb.name}${nb.roleType === 'qualifier' ? ' (квалификатор)' : ''}` });
  }
}

/* Авто-присвоение брокера СРАЗУ при входе нового лида (опция automations.assignOnNew, по умолчанию выкл).
   Даёт брокеру видеть лида с первой секунды (владелец хотел «чтобы кто-то сразу следил»), при этом стадия
   остаётся new/touch — ИИ-цепочка продолжает работать. Без опции — поведение прежнее (лид в общем пуле до квалификации). */
function tickAssignNew(db) {
  if (!(db.settings.automations || {}).assignOnNew) return;
  for (const l of db.leads) {
    if (l.broker) continue;
    if (!['new', 'touch'].includes(l.stage)) continue;
    if (l.marketingOptOut) continue;
    const b = pickBroker(db, l);
    if (!b) continue;
    control.recordOwner(db, l, b.id, 'auto', 'авто-присвоение при входе (assignOnNew)');
    l.broker = b.id; b.load = (b.load || 0) + 1;
    ai.pushEvent(db, { type: 'handover', leadId: l.id, text: `👤 Новый лид ${l.name} сразу закреплён за ${b.name} — брокер видит его с первой секунды` });
  }
}

/* Дневной потолок рассылок: лимит из тира WABA × градация свежести номера (плавный рост).
   Meta сама режет по тирам; это наша ПОДУШКА сверху, чтобы свежий номер не спалить объёмом. */
function broadcastTierCap(db, regAt) {
  const tier = (db.settings.wa && db.settings.wa.tier) || 'TIER_250';
  const map = { TIER_50: 50, TIER_250: 250, TIER_1K: 1000, TIER_10K: 10000, TIER_100K: 100000, TIER_UNLIMITED: 1e9, UNLIMITED: 1e9 };
  let cap = map[tier] || 250;
  /* градация свежести: у нового номера дозируем объём (ramp-up), чтобы не спалить. regAt — дата регистрации
     ВЫБРАННОГО номера-отправителя (per-number), фолбэк — глобальная cloudRegisteredAt. */
  const reg = regAt || (db.settings.wa && db.settings.wa.cloudRegisteredAt);
  if (reg) { const days = (Date.now() - reg) / 864e5; if (days < 2) cap = Math.min(cap, 50); else if (days < 4) cap = Math.min(cap, 150); else if (days < 7) cap = Math.min(cap, 500); }
  return cap;
}
/* Дневной потолок EMAIL-рассылки: базовый лимит × ramp свежести домена (сырой домен дозируем). */
function emailBroadcastCap(db) {
  const e = (db.settings.channels && db.settings.channels.email) || {};
  let cap = e.dailyCap || 300;
  const reg = e.verifiedAt;
  if (reg) { const days = (Date.now() - reg) / 864e5; if (days < 2) cap = Math.min(cap, 50); else if (days < 4) cap = Math.min(cap, 150); else if (days < 7) cap = Math.min(cap, 500); }
  return cap;
}
/* дата регистрации Cloud API-номера по его phoneId (для per-number ramp) */
function senderRegAt(db, phoneId) {
  if (!phoneId) return null;
  const nums = (db.settings.telephony && db.settings.telephony.otpNumbers) || {};
  for (const k in nums) { const c = nums[k].cloud; if (c && c.phoneId === phoneId) return c.connectedAt || nums[k].at || null; }
  return null;
}

function tickCampaigns(db) {
  const nowT = Date.now();
  const bDay = new Date(nowT).toISOString().slice(0, 10);
  db.settings.wa = db.settings.wa || {};
  if (db.settings.wa.bcastDay !== bDay) { db.settings.wa.bcastDay = bDay; db.settings.wa.bcastSent = 0; db.settings.wa.bcastByNum = {}; }
  db.settings.wa.bcastByNum = db.settings.wa.bcastByNum || {};
  for (const cmp of db.campaigns) {
    /* КАНАЛ рассылки: 'wa' (Cloud API, дефолт) | 'email' (Resend) | 'viber' (BSP). Лимит/ramp + счётчик + достижимость + отправка — свои. */
    const chan = cmp.channel || 'wa';
    const fromId = cmp.senderPhoneId || db.settings.wa.phoneId;
    let cap, sentCount, bumpSent, reachable, sendOne;
    if (chan === 'email') {
      const eb = db.settings.emailBcast = db.settings.emailBcast || { day: bDay, sent: 0 };
      if (eb.day !== bDay) { eb.day = bDay; eb.sent = 0; }
      cap = emailBroadcastCap(db);
      sentCount = () => eb.sent || 0;
      bumpSent = () => { eb.sent = (eb.sent || 0) + 1; };
      reachable = (lead) => (lead.contacts || []).some(c => c.kind === 'email' && c.value) || !!lead.email;
      const subj = cmp.subject || (db.templates.find(t => t.id === cmp.templateId) || {}).name || 'По вашей заявке';
      sendOne = (lead, text) => send(db, lead, text, 'wake', { broadcast: true, campaignId: cmp.id, channel: 'email', subject: subj });
    } else if (chan === 'viber') {
      const vbr = db.settings.viberBcast = db.settings.viberBcast || { day: bDay, sent: 0 };
      if (vbr.day !== bDay) { vbr.day = bDay; vbr.sent = 0; }
      cap = ((db.settings.channels && db.settings.channels.viber && db.settings.channels.viber.dailyCap)) || 500;
      sentCount = () => vbr.sent || 0;
      bumpSent = () => { vbr.sent = (vbr.sent || 0) + 1; };
      reachable = (lead) => !!lead.phone && (lead.channels && lead.channels.viber) !== 'no';
      /* золотое правило: opt-out в тексте (Viber BSP не несёт кнопок в текст-сообщении) */
      sendOne = (lead, text) => send(db, lead, (text || '') + (text ? '\n\n' : '') + 'Ответьте «стоп», чтобы отписаться от рассылки.', 'wake', { broadcast: true, campaignId: cmp.id, channel: 'viber' });
    } else {
      cap = broadcastTierCap(db, senderRegAt(db, fromId));
      sentCount = () => db.settings.wa.bcastByNum[fromId] || 0;
      bumpSent = () => { db.settings.wa.bcastByNum[fromId] = sentCount() + 1; db.settings.wa.bcastSent = (db.settings.wa.bcastSent || 0) + 1; };
      reachable = (lead) => !!lead.phone;
      sendOne = (lead, text) => send(db, lead, text, 'wake', { templateId: cmp.templateId, broadcast: true, campaignId: cmp.id, phoneId: fromId });
    }
    /* авто-старт запланированных кампаний, когда наступило время */
    if (cmp.state === 'scheduled' && cmp.startAt && nowT >= cmp.startAt) {
      cmp.log.unshift({ at: nowT, text: 'Автозапуск по расписанию' });
      startCampaign(db, cmp);
    }
    if (cmp.state !== 'running') continue;
    if (cmp.nextBatchAt && nowT < cmp.nextBatchAt) continue;
    /* дневной лимит достигнут — ждём обновления (новый день / рост тира-домена) */
    if (sentCount() >= cap) {
      cmp.nextBatchAt = nowT + 3600e3;
      if (!cmp._capLogged) { cmp.log.unshift({ at: nowT, text: chan === 'email' ? `Дневной лимит email-рассылки достигнут (${cap}/сут, ramp домена). Продолжим завтра.` : `Дневной лимит номера-отправителя достигнут (${cap}/сут: тир WABA + свежесть). Продолжим, когда лимит обновится.` }); cmp._capLogged = true; }
      continue;
    }
    cmp._capLogged = false;
    /* окно отправки по поясу клиента проверяется пер-лидно ниже */
    const batch = cmp.recipients.slice(cmp.cursor, cmp.cursor + cmp.batchSize);
    if (!batch.length) {
      cmp.state = 'done';
      cmp.log.unshift({ at: nowT, text: `Кампания завершена: отправлено ${cmp.stats.sent}, ответили ${cmp.stats.replied}` });
      ai.pushEvent(db, { type: 'wake', text: `Кампания «${cmp.name}» завершена: ${cmp.stats.sent} отправок, ${cmp.stats.replied} ответов` });
      continue;
    }
    for (const id of batch) {
      const lead = db.leads.find(l => l.id === id);
      if (!lead || !reachable(lead)) { cmp.stats.skipped += 1; continue; }
      if (lead.marketingOptOut) { cmp.stats.skipped += 1; continue; }   /* отписался — пропускаем (золотое правило) */
      if (sentCount() >= cap) { cmp.recipients.push(id); cmp.stats.skipped += 1; continue; }   /* упёрлись в дневной лимит посреди пачки — остаток на завтра */
      const hour = new Date(nowT + (lead.tz || 0) * 3600e3).getUTCHours();
      if (!db.settings.demo.accelerate && (hour < cmp.window[0] || hour >= cmp.window[1])) {
        cmp.recipients.push(id); // вне окна клиента — в конец очереди
        cmp.stats.skipped += 1;
        continue;
      }
      const tpl = db.templates.find(t => t.id === cmp.templateId);
      const text = tpl ? renderTemplate(db, tpl, lead) : (cmp.text || '');
      const m = sendOne(lead, text);
      if (m && m.status !== 'failed') {
        cmp.stats.sent += 1;
        bumpSent();
        lead.ai.enabled = true; // ответ подхватит квалификатор
        lead.tags = [...new Set([...(lead.tags || []), 'реанимация'])];
      } else cmp.stats.skipped += 1;
    }
    cmp.cursor += cmp.batchSize;
    const [a, b] = cmp.pauseMin;
    const pause = (a + Math.random() * Math.max(0, b - a)) * (db.settings.demo.accelerate ? 1000 : 60e3);
    cmp.nextBatchAt = nowT + pause;
    cmp.log.unshift({ at: nowT, text: `Пачка ${Math.ceil(cmp.cursor / cmp.batchSize)}: ${batch.length} отправок, пауза ${Math.round(pause / (db.settings.demo.accelerate ? 1000 : 60e3))} ${db.settings.demo.accelerate ? 'сек (демо)' : 'мин'}` });
  }
}

/* ---------- демо-симулятор входящих ответов ---------- */
const PERSONA = {
  purpose: ['Рассматриваю как инвестицию, под сдачу', 'Хотим переехать семьёй, для себя', 'Интересует ВНЖ через покупку'],
  budget: ['Бюджет около 200к', 'До 150 тысяч долларов', 'Порядка 300k рассматриваю'],
  type: ['Наверное 1BR апартаменты', 'Смотрим виллу с 2 спальнями', 'Студия подойдёт для начала'],
  timeline: ['Хочу в течение пары месяцев решить', 'Не тороплюсь, до конца года', 'Готов сейчас, если вариант хороший'],
  generic: ['Да, интересно, расскажите подробнее', 'А что по ценам сейчас?', 'Пришлите варианты, посмотрю'],
};

function tickSimulator(db) {
  if (!db._demoSandbox) return;   // 🔒 защита: фабрикация ответов/комментариев ТОЛЬКО в демо-сэндбоксе, никогда у клиента (даже если settings.demo.simulateReplies как-то включат)
  if (!db.settings.demo.simulateReplies) return;
  const cands = db.leads.filter(l =>
    l.lastDir === 'out' && l.ai.enabled &&
    ['touch', 'dialog', 'sleeping', 'new'].includes(l.stage) &&
    Date.now() - (l.lastMsgAt || 0) > 20e3);
  for (const lead of cands) {
    if (Math.random() > 0.18) continue; // ~1 ответ в ~30 сек на активного
    const missing = ai.AXES.filter(a => !lead.quals[a]);
    const axis = missing.length && Math.random() < 0.75 ? missing[0] : 'generic';
    const pool = PERSONA[axis] || PERSONA.generic;
    const text = pool[Math.floor(Math.random() * pool.length)];
    inbound(db, lead, text, { simulated: true });
  }
  /* демо: изредка «капает» комментарий под рекламой — витрина петли comment-to-lead */
  if (Math.random() < 0.12) {
    try { const r0 = simulateComment(db); if (r0) { const comments = require('./comments'); comments.autoReply(db, r0).catch(() => {}); } } catch (e) {}
  }
}

/* ---------- демо-генератор комментариев под рекламой ---------- */
const CMT_TEXTS = [
  'А сколько стоит?', 'Цена?', 'Почём такие?', 'Интересует, есть рассрочка?',
  'Можно подробнее в личку?', 'Какой район?', 'Реально доходность такая?',
  'Ипотека для нерезидентов есть?', 'Хочу подборку', 'Что по срокам сдачи?',
  'А документы как оформляются удалённо?', 'Первоначальный взнос какой?',
  'Красиво 😍 сколько за студию?', 'Это развод или реально?', 'Подпишись на меня взамен 🙈',
];
const CMT_NAMES = [
  ['Артём Ковалёв', 'artem.kv'], ['Дина Салимова', 'dina_s'], ['Олег Пряхин', 'opryahin'],
  ['Марго Лебедева', 'margo.leb'], ['Ислам Керимов', 'islam.k'], ['Настя Рой', 'nastya.roi'],
  ['Виктор Гаас', 'v.gaas'], ['Лейла Мамедова', 'leila.m'], ['Roman P', 'roman_p_dxb'],
];
let _cmtSeq = 1;
function simulateComment(db) {
  const comments = require('./comments');
  const ads = (db.ads || []).filter(a => a.postId);
  if (!ads.length) return null;
  const ad = ads[Math.floor(Math.random() * ads.length)];
  const [name, username] = CMT_NAMES[Math.floor(Math.random() * CMT_NAMES.length)];
  const text = CMT_TEXTS[Math.floor(Math.random() * CMT_TEXTS.length)];
  const platform = ad.geo === 'bali' ? 'ig' : (Math.random() < 0.6 ? 'ig' : 'fb');
  return comments.ingest(db, {
    platform, postId: ad.postId, adId: ad.adId,
    commentId: 'demo_c_' + (_cmtSeq++) + '_' + Date.now(),
    userId: 'demo_u_' + username, name, username, text,
  }, module.exports.matchAd);
}

/* ---------- единая обработка входящего (вебхук / симулятор / демо-кнопка) ---------- */
function inbound(db, lead, text, opts = {}) {
  const m = { id: store.nextId('m'), leadId: lead.id, dir: 'in', via: null, text, at: Date.now(), status: 'received' };
  if (opts.media && opts.media.url) m.media = { type: opts.media.type || 'image', url: String(opts.media.url).slice(0, 500), name: (opts.media.name || '').slice(0, 120) };
  /* ⚠️ КАНАЛ ВХОДЯЩЕГО: тегируем сообщение и делаем его каналом ДИАЛОГА (activeChannel). Клиент написал в
     Telegram → переписка переключается на Telegram (и в UI плашка, и для ответов ИИ/менеджера), а не висит
     на WhatsApp. Раньше входящие шли без канала → интерфейс всегда показывал WhatsApp. */
  if (opts.channel && ['wa', 'tg', 'viber', 'email'].includes(opts.channel)) { m.channel = opts.channel; lead.activeChannel = opts.channel; }
  db.messages.push(m);
  /* ЗОЛОТОЕ ПРАВИЛО: ответ «стоп/отписаться/stop/unsubscribe» → отписка от рассылок (любой канал) */
  if (/^\s*(стоп|stop|отпис|unsub|не пиш|не писать)/i.test(String(text || '')) && !lead.marketingOptOut) {
    optOut(db, lead);   /* единый путь отписки: снимает с рассылок, чистит recipients, +1 к отпискам кампаний, шлёт подтверждение */
    ai.pushEvent(db, { type: 'optout', leadId: lead.id, text: `${lead.name}: отписался от рассылок («${String(text).trim().slice(0, 20)}»)` });
  }
  lead.unread = (lead.unread || 0) + 1;   /* счётчик непрочитанных для брокера (сбрасывается при открытии карточки / ответе человека) */
  lead.lastInboundAt = m.at;
  /* ИИ-автоподхват пояса: клиент явно назвал своё текущее время («у меня сейчас 14:30» / «по моему времени 9:00») →
     пересчитываем lead.tz. Консервативно (нужен HH:MM с двоеточием + маркер «у меня/сейчас/по моему»), иначе не трогаем. */
  try {
    const _tm = String(text || '').match(/(?:у меня|сейчас|по мо[её]му времени)\D{0,8}(\d{1,2})[:.](\d{2})/i);
    if (_tm) { const h = +_tm[1], mn = +_tm[2]; if (h <= 23 && mn <= 59) { const u = new Date(); let d = Math.round(((h * 60 + mn) - (u.getUTCHours() * 60 + u.getUTCMinutes())) / 60); if (d > 14) d -= 24; if (d < -12) d += 24; if (Math.abs((lead.tz || 0) - d) >= 1) { lead.tz = d; lead.tzManual = true; ai.pushEvent(db, { type: 'note', leadId: lead.id, text: `${lead.name}: назвал своё время (${_tm[1]}:${_tm[2]}) → пояс обновлён на UTC${d >= 0 ? '+' : ''}${d}` }); } } }
  } catch (_) {}
  /* ⭐STICKY-БРОКЕР + умное перераспределение: лид ВСЕГДА возвращается к своему брокеру-владельцу
     (переживает спящую базу и рассылку Cloud API). Если владелец недоступен (уволен/оффбординг/away
     нет в списке) — переназначаем активному по pickBroker (гео/загрузка), чтобы лид не завис. Делаем
     ДО уведомления ниже, чтобы алерт ушёл правильному брокеру. Новым лидам (broker=null) брокера даёт
     квалификация/handover — их тут не трогаем. */
  if (lead.broker) {
    const owner = db.brokers.find(b => b.id === lead.broker);
    if (!owner || owner.active === false) {
      const cand = pickBroker(db, lead);
      if (cand && cand.id !== lead.broker) {
        control.recordOwner(db, lead, cand.id, 'auto', owner ? `владелец «${owner.name}» недоступен — переназначен на входящем` : 'владелец удалён — переназначен на входящем');
        lead.broker = cand.id; cand.load = (cand.load || 0) + 1;
        ai.pushEvent(db, { type: 'reassign', leadId: lead.id, text: `Лид ${lead.name} ответил, но брокер-владелец недоступен → передан ${cand.name}` });
      }
    }
  }
  /* пересылка входящего клиента назначенному брокеру в Telegram (мост) — если подключён */
  if (module.exports.onInboundMessage) { try { const r = module.exports.onInboundMessage(db, lead, m); if (r && r.catch) r.catch(() => {}); } catch (_) {} }
  const wasWake = (lead.tags || []).includes('реанимация') && lead.stage === 'sleeping';
  if (lead.stage === 'sleeping') lead.stage = 'dialog';
  if (wasWake) {
    for (const cmp of db.campaigns) if (cmp.recipients.includes(lead.id)) cmp.stats.replied += 1;
  }
  const wasQualified = ['qualified', 'handover', 'viewing', 'deal'].includes(lead.stage);
  const { reply } = ai.onInbound(db, lead, text);
  if (!wasQualified && lead.stage === 'qualified') {
    if (module.exports.onQualified) module.exports.onQualified(db, lead);
    if ((db.settings.automations || {}).autoHandover) handover(db, lead); // авто-распределение на брокера
  }
  if (reply) {
    /* ⚠️ НЕ «запекаем» задержку в setTimeout (тогда смена настройки времени на лету не применялась к уже
       запланированному ответу). Ставим СРОК ответа replyDueAt = now + delay; его проверяет tickReplies (каждые 5с).
       Меняешь время в настройках → rescheduleDueReplies пересчитывает срок от момента входящего → ускоряется.
       Бонус: переживает рестарт сервера (setTimeout терялся — ответ немел навсегда). */
    lead.ai = lead.ai || {};
    lead.ai.pendingReply = { text: reply.text, kind: reply.kind };
    lead.ai.replyInboundAt = Date.now();
    lead.ai.replySimulated = !!opts.simulated;
    /* ⚠️ АНТИ-ДРОБЛЕНИЕ: клиент часто шлёт мысль пачкой (3-7 сообщений подряд). Не отвечаем на каждое —
       ждём «окно тишины» (≥BURST_SETTLE): каждое новое входящее сдвигает срок, ответ уходит, только когда
       клиент замолчал. llm.reply на срабатывании читает ВСЮ историю → отвечает на всю пачку одним сообщением. */
    lead.ai.replyDueAt = Date.now() + Math.max(aiReplyDelayMs(db), BURST_SETTLE_MS);
  }
  store.save();
  return m;
}

/* ПОДХВАТ ИИ при включении: клиент ответил, пока ИИ был на паузе (ручное первое касание ставит его на паузу).
   Включили ИИ → он отвечает на УЖЕ пришедшее последнее входящее (не вставляя новое сообщение). */
function aiRespondNow(db, lead) {
  if (!lead || lead.lastDir !== 'in') return false;
  const lastIn = [...(db.messages || [])].reverse().find(x => x.leadId === lead.id && x.dir === 'in');
  if (!lastIn) return false;
  lead.ai = lead.ai || {};
  if (lead.ai._replying && Date.now() - lead.ai._replying < 60000) return false;
  /* как и обычный входящий — ставим СРОК ответа (а не setTimeout), чтобы смена времени его двигала и он пережил рестарт */
  let reply = null; try { reply = (ai.onInbound(db, lead, lastIn.text) || {}).reply; } catch (_) {}
  lead.ai.pendingReply = reply ? { text: reply.text, kind: reply.kind } : { text: '', kind: '' };
  lead.ai.replyInboundAt = Date.now();
  lead.ai.replySimulated = false;
  lead.ai.replyDueAt = Date.now() + Math.max(aiReplyDelayMs(db), BURST_SETTLE_MS);
  store.save();
  return true;
}

/* ОТПРАВКА ОТЛОЖЕННОГО ОТВЕТА ИИ: вызывается tickReplies, когда настал replyDueAt. Пробует LLM, иначе —
   сохранённый черновик ядра (pendingReply). Общая точка для обычного входящего и подхвата при включении ИИ. */
function fireReply(db, lead) {
  const l2 = lead; l2.ai = l2.ai || {};
  if (l2.ai._replying && (Date.now() - l2.ai._replying) < 60000) return;
  l2.ai._replying = Date.now();
  const pending = l2.ai.pendingReply || null;
  const prov = (db.settings.ai || {}).provider;
  const useLlm = llm.available() && (prov === 'llm' || (prov === 'auto' && !l2.ai.replySimulated));
  (async () => {
    try {
      let out = null;
      if (useLlm) { try { out = await llm.reply(db, l2); } catch (e) { console.error('[llm]', e.message); } }
      const dupGuard = (txt) => { const norm = (x) => String(x).toLowerCase().replace(/\s+/g, ' ').trim(); return db.messages.filter(x => x.leadId === l2.id && x.dir === 'out').slice(-3).some(x => norm(x.text) === norm(txt)); };
      if (!out && (!pending || !pending.text)) { return; }                      /* нечего слать (подхват без LLM и без черновика) */
      if (!out && dupGuard(pending.text)) {
        l2.ai.enabled = false;
        l2.tags = [...new Set([...(l2.tags || []), 'нужен человек'])];
        ai.pushEvent(db, { type: 'ai_off', leadId: l2.id, text: `${l2.name}: ИИ зациклился (повтор реплики) — автопилот на паузе, лид ждёт менеджера` });
        return;
      }
      if (out) {
        let applied = 0;
        for (const [axis, v] of Object.entries(out.axes || {})) { if (!l2.quals[axis]) { l2.quals[axis] = v; applied++; } }
        if (applied) {
          const was = ['qualified', 'handover', 'viewing', 'deal'].includes(l2.stage);
          ai.screen(db, l2);
          if (l2.stage === 'qualified' && !l2.summary) { l2.summary = ai.buildSummary(db, l2); ai.pushEvent(db, { type: 'qualified', leadId: l2.id, text: `${l2.name} квалифицирован ИИ (LLM) — готов к передаче брокеру` }); }
          if (!was && l2.stage === 'qualified') { if (module.exports.onQualified) module.exports.onQualified(db, l2); if ((db.settings.automations || {}).autoHandover) handover(db, l2); }
        }
        send(db, l2, out.text, 'ai');
      } else {
        send(db, l2, pending.text, 'ai');
      }
      if (pending && pending.kind === 'handover_offer') { for (const cmp of db.campaigns) if (cmp.recipients.includes(l2.id)) cmp.stats.qualified += 1; }
    } catch (e) { console.error('[ai-reply]', e && e.message); }
    finally { try { delete l2.ai._replying; delete l2.ai.pendingReply; delete l2.ai.replyDueAt; delete l2.ai.replyInboundAt; delete l2.ai.replySimulated; } catch (_) {} store.save(); }
  })();
}

/* ТИКЕР ОТЛОЖЕННЫХ ОТВЕТОВ (в startLoop, каждые 5с): шлёт ответы, у которых настал срок replyDueAt. */
function tickReplies(db) {
  const now = Date.now();
  for (const lead of (db.leads || [])) {
    const a = lead.ai; if (!a) continue;
    if (a.replyDueAt) {
      if (now < a.replyDueAt) continue;
      delete a.replyDueAt;
      if (!a.enabled || lead.lastDir !== 'in' || ['handover', 'viewing', 'deal', 'lost'].includes(lead.stage)) { delete a.pendingReply; continue; }
      if (a._replying && now - a._replying < 60000) continue;
      try { fireReply(db, lead); } catch (e) { console.error('[tickReplies]', e && e.message); }
      continue;
    }
    /* 🛟 СТРАХОВКА: ИИ включён, последнее сообщение — входящее клиента, но ответ НЕ запланирован (срок потерян рестартом
       до фикса / сбой планирования). Клиент висит без ответа. До-планируем ответ, чтобы ИИ не замолкал молча. */
    if (!a.enabled || lead.lastDir !== 'in' || ['handover', 'viewing', 'deal', 'lost'].includes(lead.stage)) continue;
    if (a._replying && now - a._replying < 60000) continue;
    const msgs = (db.messages || []).filter(m => m.leadId === lead.id);
    const lastMsg = msgs.length ? msgs.reduce((p, c) => ((c.at || 0) >= (p.at || 0) ? c : p)) : null;
    if (!lastMsg || lastMsg.dir !== 'in') continue;                       /* уже ответили (последнее — исходящее) */
    if (now - (lastMsg.at || 0) < 60000) continue;                        /* свежий входящий получит срок сам — не вмешиваемся */
    let reply = null; try { reply = (ai.onInbound(db, lead, lastMsg.text) || {}).reply; } catch (_) {}
    a.pendingReply = reply ? { text: reply.text, kind: reply.kind } : { text: '', kind: '' };
    a.replyInboundAt = lastMsg.at || now;
    a.replySimulated = false;
    a.replyDueAt = now + 3000;                                            /* ответит на следующем тике */
    ai.pushEvent(db, { type: 'note', leadId: lead.id, text: `${lead.name}: ответ ИИ не был запланирован (возможно, потерян при рестарте) — восстановлено, отвечаю` });
    store.save();
  }
}

/* СМЕНА ВРЕМЕНИ ОТВЕТА НА ЛЕТУ: пересчитать срок у всех ожидающих ответа лидов от момента их входящего по
   НОВОЙ задержке. Сократил 5-15→1-2 мин — висящий ответ тут же ускоряется (не позже чем через ~2с, если срок уже прошёл). */
function rescheduleDueReplies(db) {
  const now = Date.now(); let n = 0;
  for (const lead of (db.leads || [])) {
    const a = lead.ai; if (!a || !a.replyDueAt || !a.replyInboundAt) continue;
    a.replyDueAt = Math.max(now + 2000, a.replyInboundAt + aiReplyDelayMs(db));
    n++;
  }
  if (n) store.save();
  return n;
}

/* ---------- отписка от рассылки (кнопка «Отписаться» в шаблоне) ----------
   Тихий opt-out вместо жалобы: снимаем маркетинг, чистим из кампаний, стопаем
   авто-цепочки, подтверждаем в 24ч-окне (клиент только что нажал → окно открыто). */
function optOut(db, lead) {
  if (lead.marketingOptOut) return false;
  lead.marketingOptOut = true;
  lead.optOutAt = Date.now();
  lead.tags = [...new Set([...(lead.tags || []), 'отписался'])];
  for (const cmp of db.campaigns || []) { if ((cmp.recipients || []).includes(lead.id)) { cmp.stats = cmp.stats || {}; cmp.stats.unsubscribed = (cmp.stats.unsubscribed || 0) + 1; } cmp.recipients = (cmp.recipients || []).filter(id => id !== lead.id); }   /* честный счётчик отписок в аналитику (лид удаляется из recipients — сканом его уже не поймать) */
  if (lead.ai) lead.ai.enabled = false;
  ai.pushEvent(db, { type: 'note', leadId: lead.id, text: `${lead.name} отписался от рассылки — маркетинг остановлен` });
  const txt = (lead.lang === 'en')
    ? 'Done — you won’t receive promotional messages from us anymore. You can still reach us here anytime.'
    : 'Готово — рассылку вам больше присылать не будем. Написать нам сюда можно в любой момент.';
  try { send(db, lead, txt, 'system'); } catch (_) {}
  store.save();
  return true;
}

/* ---------- отчёты владельцу в мессенджер ---------- */
function buildReport(db, period) {
  /* ⭐ формат агентства: лиды/расход/CPL/целевые/стоимость целевого/%квал/топ связок/динамика н-н/all-time */
  const now = Date.now();
  const span = period === 'monthly' ? 30 : period === 'weekly' ? 7 : 1;
  const dayMs = 24 * 3600e3;
  const from = now - span * dayMs, prevFrom = now - 2 * span * dayMs;
  const L = db.leads || [], ADS = db.ads || [];
  const QUAL = ['qualified', 'handover', 'viewing', 'deal'];
  const inR = (t, a, b) => t && t >= a && t < b;
  const leadsIn = (a, b) => L.filter(l => inR(l.createdAt, a, b));
  const qualsIn = (a, b) => L.filter(l => QUAL.includes(l.stage) && inR(l.createdAt, a, b));
  const nl = leadsIn(from, now), pl = leadsIn(prevFrom, from);
  const nq = qualsIn(from, now), pq = qualsIn(prevFrom, from);
  const inWork = nl.filter(l => l.stage !== 'new').length;
  const spendTotal = ADS.reduce((s, a) => s + (+a.spend || 0), 0);
  const cpl = nl.length ? Math.round(spendTotal / nl.length) : 0;
  const cpTarget = nq.length ? Math.round(spendTotal / nq.length) : 0;
  const qualRate = inWork ? Math.round(nq.length / inWork * 100) : 0;
  const cur = (db.settings.reports && db.settings.reports.currency) || db.settings.currency || '';
  const M = (n) => Math.round(n).toLocaleString('ru-RU') + (cur ? ' ' + cur : '');
  const dyn = (a, b) => { if (!b) return a ? '+∞%' : '0%'; const d = Math.round((a - b) / b * 100); return (d >= 0 ? '+' : '') + d + '%'; };
  const plu = (n) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'лид' : (a >= 2 && a <= 4 && (b < 10 || b >= 20)) ? 'лида' : 'лидов'; };
  /* связки: кампания / адсет */
  const bundles = {};
  ADS.forEach(a => { const k = (a.campaignName || '—') + ' / ' + (a.adsetName || '—'); if (!bundles[k]) bundles[k] = { leads: 0, spend: 0 }; bundles[k].spend += (+a.spend || 0); });
  nl.forEach(l => { const ad = l.ads && ADS.find(a => String(a.adId) === String(l.ads.adId)); if (ad) { const k = (ad.campaignName || '—') + ' / ' + (ad.adsetName || '—'); if (bundles[k]) bundles[k].leads++; } });
  const topB = Object.entries(bundles).filter(([, v]) => v.leads > 0).sort((a, b) => b[1].leads - a[1].leads).slice(0, 5);
  const atLeads = L.length, atCpl = atLeads ? Math.round(spendTotal / atLeads) : 0;
  const pName = { daily: 'ежедневная сводка', weekly: 'еженедельный отчёт', monthly: 'месячный отчёт' }[period];
  const lines = [
    `📊 ${db.settings.agency.name} — ${pName} по лидогенерации`, ``,
    `Лидов всего: ${nl.length}`,
    spendTotal ? `Расход: ${M(spendTotal)}  |  CPL: ${M(cpl)}` : null,
    `Целевые: ${nq.length}${nl.length ? ` (${Math.round(nq.length / nl.length * 100)}%)` : ''}`,
    spendTotal && nq.length ? `Стоимость целевого: ${M(cpTarget)}` : null,
    inWork ? `% квалификации (от взятых в работу): ${qualRate}% (${nq.length} из ${inWork})` : null,
    topB.length ? `` : null,
    topB.length ? `Топ связок (кампания / адсет):` : null,
    ...topB.map(([k, v]) => `• ${k} — ${v.leads} ${plu(v.leads)}${v.spend ? `, ${M(v.spend)}, CPL ${M(Math.round(v.spend / v.leads))}` : ''}`),
    ``,
    `Динамика к прошлому периоду:`,
    `• Лиды: ${pl.length} → ${nl.length} (${dyn(nl.length, pl.length)})`,
    `• Целевые: ${pq.length} → ${nq.length} (${dyn(nq.length, pq.length)})`,
    ``,
    spendTotal ? `За всё время: лиды ${atLeads} | расход ${M(spendTotal)} | CPL ${M(atCpl)}` : `За всё время: лиды ${atLeads}`,
    ``,
    `Открыть CRM: ${tunnelBase() || 'http://localhost:' + (process.env.PORT || 5077)}`,
  ].filter(x => x !== null);
  return lines.join('\n');
}

function tunnelBase() {
  try {
    const log = require('fs').readFileSync('/tmp/lumen-tunnel.log', 'utf8');
    const m = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
    return m ? m[m.length - 1] : null;
  } catch { return null; }
}

async function sendReport(db, text) {
  const rp = db.settings.reports || {};
  const ch = db.settings.channels || {};
  if (rp.channel === 'tg' && ch.tg?.botToken && rp.tgChatId) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${ch.tg.botToken}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: rp.tgChatId, text }),
      });
      return r.ok ? 'tg' : 'tg_error';
    } catch { return 'tg_error'; }
  }
  ai.pushEvent(db, { type: 'msg_in', text: 'Сводка готова (подключите Telegram-бот и chat_id в «Автоматизациях», чтобы получать её в мессенджер)' });
  return 'event_only';
}

function tickReports(db) {
  const rp = db.settings.reports;
  if (!rp) return;
  const now = new Date();
  const [hh, mm] = String(rp.dailyAt || '09:00').split(':').map(Number);
  const key = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  const fire = async (period, lastKey) => {
    if (rp[lastKey] === key) return;
    rp[lastKey] = key;
    const text = buildReport(db, period);
    await sendReport(db, text);
    ai.pushEvent(db, { type: 'msg_in', text: `Сводка ${period === 'daily' ? 'за сутки' : period === 'weekly' ? 'за неделю' : 'за месяц'} отправлена` });
  };
  if (now.getHours() === hh && now.getMinutes() >= mm && now.getMinutes() < mm + 6) {
    if (rp.daily) fire('daily', 'lastDaily');
    if (rp.weekly && now.getDay() === 1) fire('weekly', 'lastWeekly');
    if (rp.monthly && now.getDate() === 1) fire('monthly', 'lastMonthly');
  }
}

/* мгновенные уведомления о важном: обёртка pushEvent-типов */
function maybeInstantNotify(db, e) {
  const rp = db.settings.reports || {};
  const inst = rp.instant || {};
  const map = { view: 'hotView', qualified: 'qualified', ai_off: 'aiOff', deal: 'deal' };
  const k = map[e.type];
  if (k && inst[k]) sendReport(db, '🔔 ' + e.text);
}

/* проактивный алерт руководителю по тихим рискам (троттлинг внутри controlAlert) */
function tickControl(db) {
  try {
    const r = control.controlAlert(db);
    if (r && r.fire && r.text) {
      ai.pushEvent(db, { type: 'ai_off', text: r.text });
      if (module.exports.onControlAlert) { try { module.exports.onControlAlert(db, r); } catch (_) {} }
    }
  } catch (e) { console.error('[control]', e.message); }
}

/* отложенные действия по пожеланию клиента: сообщение отправляем сами; звонок — уведомляем брокера */
function tickScheduled(db) {
  const now = Date.now();
  for (const lead of (db.leads || [])) {
    if (!Array.isArray(lead.scheduled) || !lead.scheduled.length) continue;
    for (const it of lead.scheduled) {
      if (it.status !== 'pending') continue;
      if (it.kind === 'message' && it.at <= now) {
        try { send(db, lead, it.text, 'chain', { channel: it.channel || 'wa' }); it.status = 'sent'; it.sentAt = now; ai.pushEvent(db, { type: 'lead_new', leadId: lead.id, text: `Отложенное сообщение отправлено: ${lead.name}` }); }
        catch (e) { it.status = 'error'; it.error = String(e.message || e).slice(0, 120); }
      } else if (it.kind === 'call' && !it.notified && (it.remindAt || it.at) <= now) {
        it.notified = true;
        const atStr = new Date(it.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        try { sendReport(db, `📞 Не забудьте позвонить: ${lead.name} (${lead.phone || ''}) — ${atStr}${it.note ? ', просил ' + it.note : ''}`); } catch (_) {}
        ai.pushEvent(db, { type: 'lead_new', leadId: lead.id, text: `⏰ Пора звонить ${lead.name}${it.note ? ' (просил ' + it.note + ')' : ''}` });
      }
    }
    /* чистим отработавшие старше суток, чтобы не копить */
    lead.scheduled = lead.scheduled.filter(it => it.status === 'pending' || (now - (it.sentAt || it.at)) < 86400000);
  }
}

/* ---------- основной цикл ---------- */
function startLoop() {
  setInterval(() => {
    let tids;
    try { tids = store.listTenants(); } catch (_) { tids = [store.PRIMARY]; }
    for (const tid of tids) {
      try {
        store.runInTenant(tid, () => {
          const db = store.get();
          /* per-tick изоляция: сломанный подмодуль (битые данные одного тенанта) не должен
             голодить остальные тики этого же тенанта и не должен терять store.save() */
          for (const [nm, fn] of [['replies', tickReplies], ['chains', tickChains], ['campaigns', tickCampaigns], ['meetings', tickMeetings], ['sla', tickSla], ['assignNew', tickAssignNew], ['rotation', tickRotation], ['reports', tickReports], ['simulator', tickSimulator], ['control', tickControl], ['scheduled', tickScheduled]]) {
            try { fn(db); } catch (e) { console.error('[engine]', tid, nm, e); }
          }
          store.save();
        });
      } catch (e) { console.error('[engine]', tid, e); }
    }
  }, 5000);
}

module.exports = { send, handover, handoverPreview, inbound, aiRespondNow, rescheduleDueReplies, channelsFor, resolveChannel, wakePreview, wakeScore, segmentOf, startCampaign, renderTemplate, startLoop, pickBroker, brokerOnShift, buildReport, sendReport, maybeInstantNotify, simulateComment, optOut, setGraySender, setTgGraySender, seqFilters, seqMatchesLead, seqSpecificity, fmtLeadDT, nextTouchInfo };
