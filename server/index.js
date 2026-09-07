/* Lumen CRM — HTTP-сервер: статика + JSON API + вебхук WhatsApp Cloud API.
   Zero-dependency (node:http), Node 18+. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

/* .env → process.env (без зависимостей) */
try {
  const envFile = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
} catch (e) { console.error('[env]', e.message); }

const store = require('./store');
const { seed } = require('./seed');
const ai = require('./ai');
const engine = require('./engine');

const PORT = process.env.PORT || 5077;
const PUBLIC = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ico': 'image/x-icon' };

const llm = require('./llm');
const wa = require('./wa');
const comments = require('./comments');
const inventory = require('./inventory');
const playbook = require('./playbook');
const billing = require('./billing');
const { MARKET } = require('./marketdata');

/* Стартовые WhatsApp-шаблоны первого касания. Тело = фикс-текст + {{1}},
   где {{1}} — полностью собранное Lumen персональное сообщение (совпадает
   с одно-параметровой отправкой в wa.sendTemplate). Категория MARKETING —
   первое исходящее касание вне 24ч-окна по правилам Meta это маркетинг. */
const STARTER_TEMPLATES = [
  { name: 'lumen_first_touch', language: 'ru', category: 'MARKETING',
    components: [{ type: 'BODY', text: 'Здравствуйте! 👋 На связи агентство недвижимости.\n\n{{1}}', example: { body_text: [['Подобрали для вас несколько объектов под ваш запрос — скинуть подборку?']] } }] },
  { name: 'lumen_first_touch', language: 'en', category: 'MARKETING',
    components: [{ type: 'BODY', text: 'Hello! 👋 This is a real estate agency reaching out.\n\n{{1}}', example: { body_text: [['We\'ve prepared a few options matching your request — shall we send the selection?']] } }] },
];

store.load(seed);
engine.startLoop();

/* ---------- авторизация ---------- */
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const DEFAULT_PASS = 'lumen2026';
{
  const db = store.get();
  if (!db.settings.auth) {
    db.settings.auth = { passHash: sha(DEFAULT_PASS), sessions: {} };
    store.save();
    console.log(`[auth] пароль по умолчанию: ${DEFAULT_PASS} — смените в «Подключениях»`);
  }
  if (db.settings.ai.provider === 'mock') { db.settings.ai.provider = 'auto'; store.save(); }
  /* миграция: мост лидов + база рекламных объявлений */
  if (!db.settings.hooks) db.settings.hooks = { secret: crypto.randomBytes(10).toString('hex'), outboundUrl: '' };
  if (!db.ads) db.ads = [
    { adId: '120211478921230508', name: 'Дубай · Мортгейдж 0% · видео-тур JVC', priceFrom: 190000, adsetName: 'RU 30-55 инвесторы', campaignName: 'DXB Lead Forms Сентябрь', geo: 'dubai' },
    { adId: '120211478921230742', name: 'Дубай · Marina от $180k · карусель', priceFrom: 180000, adsetName: 'RU широкая', campaignName: 'DXB Lead Forms Сентябрь', geo: 'dubai' },
    { adId: '120209934110255019', name: 'Бали · виллы под сдачу · рилс', adsetName: 'RU номады', campaignName: 'Bali CTWA Август', geo: 'bali' },
  ];
  /* postId у объявлений — чтобы комментарии под публикацией цеплялись к объявлению */
  { const ids = { '120211478921230508': '17841400000000001', '120211478921230742': '17841400000000002', '120209934110255019': '17841400000000003' };
    for (const a of db.ads) if (!a.postId && ids[a.adId]) a.postId = ids[a.adId]; }
  if (!db.adComments) db.adComments = [];
  if (!db.settings.comments) db.settings.comments = { autoReply: false, autoHide: false };
  if (!db.settings.social) db.settings.social = { ig: { enabled: false, token: '', igId: '' }, fb: { enabled: false, token: '', pageId: '' } };
  /* источники инвентаря объектов (новостройки): Reelly — основной для брокеров ОАЭ */
  if (!db.settings.inventorySources) db.settings.inventorySources = { reelly: { enabled: false, key: '', baseUrl: '' } };
  if (!db.intakeLog) db.intakeLog = [];
  { const a1 = (db.ads || []).find(x => x.adId === '120211478921230508'); if (a1 && !a1.priceFrom) a1.priceFrom = 190000;
    const a2 = (db.ads || []).find(x => x.adId === '120211478921230742'); if (a2 && !a2.priceFrom) a2.priceFrom = 180000; }
  for (const l of db.leads) { if (!l.notes) l.notes = []; if (!l.contacts) l.contacts = []; }
  /* правила авто-отключения ИИ (перехват человеком) */
  if (!db.settings.ai.autoOff) db.settings.ai.autoOff = { onHumanReply: true, onHumanRequest: true, onEscalation: true };
  /* автоматизации агентства */
  if (!db.settings.automations) db.settings.automations = {
    assignMode: 'load',        // load | roundrobin | shift
    autoHandover: false,       // 4/4 закрыто → авто-передача брокеру
    meetingReminderHrs: 3,     // напоминание клиенту за N часов (0 = выкл)
    noShowMessage: true,       // «не пришёл» → мягкое сообщение + вернуть ИИ
    rrCursor: 0,
  };
  if (!db.settings.customFields) db.settings.customFields = [];
  if (!db.settings.stagesCfg) db.settings.stagesCfg = { order: [], names: {}, custom: [], hidden: [] };
  if (!db.settings.telephony) db.settings.telephony = { provider: 'none', key: '', secret: '', note: '' };
  if (!db.settings.voice) db.settings.voice = { provider: 'elevenlabs', key: '', voiceId: '' };
  if (!db.settings.reports) db.settings.reports = {
    channel: 'tg', tgChatId: '',
    daily: true, dailyAt: '09:00', weekly: true, monthly: true,
    instant: { hotView: true, qualified: true, aiOff: true, deal: true },
    lastDaily: 0, lastWeekly: 0, lastMonthly: 0,
  };
  if (!db.settings.channels) db.settings.channels = {
    priority: ['wa', 'tg', 'viber', 'email'],
    enabled: { wa: true, tg: false, viber: false, email: false },
    tg: { botToken: '' }, viber: { token: '' },
    email: { provider: 'resend', key: '', from: '' },
    secondRound: true, // цепочка исчерпана в канале → второй круг на следующем
  };
  for (const l of db.leads) {
    if (!l.channels) l.channels = { wa: 'unknown', tg: 'unknown', viber: 'unknown', email: (l.contacts || []).some(c => c.kind === 'email') ? 'yes' : 'unknown' };
    if (l.activeChannel === undefined) l.activeChannel = 'wa';
    if (!l.avatarUrl) l.avatarUrl = null;
  }
  for (const sq of db.sequences) if (!sq.geo) sq.geo = 'all';
  if (!db.settings.chainV4) {
    db.settings.chainV4 = true;
    const std = db.sequences.find(sq => sq.id === 'seq_default');
    if (std) {
      std.name = 'Стандартная · RU-нативная';
      std.steps = [
        { day: 0, channel: 'wa', mode: 'text', label: '1 · мгновенно, по конкретной заявке', active: true,
          text: '{name}, добрый день! Видел вашу заявку по {ad}.\n{priceLine}Есть 2–3 сильных варианта в этой вилке, пока их не разобрали по брони. Скинуть сюда коротко, без простыни?' },
        { day: 0.15, channel: 'wa', mode: 'text', label: '2 · знакомство + развилка цели (~3 ч)', active: true,
          text: 'И сразу представлюсь — {agency}. Чтобы не заваливать вас лишним: смотрите под переезд или под доход? От этого зависит, что покажу первым.' },
        { day: 1, channel: 'wa', mode: 'text', label: '3 · конкретика вместо рекламы (день 2)', active: true,
          text: '{name}, чтобы предметно: могу прислать расчёт по конкретному юниту — цена, план платежей, что реально по аренде. Не общие слова, а цифры, по которым можно решать.\nНадо?' },
        { day: 2, channel: 'wa', mode: 'text', label: '4 · подборка под запрос (день 3)', active: true,
          text: 'Могу собрать под ваш запрос подборку: 3–4 юнита по {geo}, по каждому план платежей и картинка по аренде.\nЕсли такой формат заходит — соберу сегодня и пришлю ссылкой.' },
        { day: 3, channel: 'wa', mode: 'text', label: '5 · голосом проще (день 4)', active: true,
          text: 'Слушайте, проще один раз голосом: за 10 минут покажу, что реально стоит брать в вашей вилке, и отвечу на вопросы.\n{countryQ}' },
        { day: 6, channel: 'wa', mode: 'text', label: '6 · прямой вопрос, без обид (день 7)', active: true,
          text: '{name}, не буду доставать сообщениями. Скажите прямо: тема ещё актуальна или отложили?\nЕсли отложили — тоже нормально: закреплю за вами контакт и вернусь, когда скажете.' },
      ];
    }
    const b2c = db.sequences.find(sq => sq.id === 'seq_b2c_2025');
    if (b2c && b2c.steps[1]) {
      b2c.steps[1].text = 'И сразу представлюсь — {agency}. Работаем с застройщиками напрямую, так что цены у нас те же, что в офисе продаж, а вот выбор юнитов — до открытия общих продаж.\nВы под переезд смотрите или под доход?';
    }
    const t1 = db.templates.find(t => t.id === 'tpl_first_ru');
    if (t1) t1.body = '{name}, добрый день! Видел вашу заявку по {ad}. {priceLine}Есть 2–3 сильных варианта в этой вилке — скинуть сюда коротко?';
  }
  if (!db.settings.chainV3) {
    db.settings.chainV3 = true;
    const std = db.sequences.find(sq => sq.id === 'seq_default');
    if (std) {
      std.name = 'Стандартная · нативный скрипт 2025';
      std.steps = [
        { day: 0, channel: 'wa', mode: 'text', label: '1 касание · мгновенно (+видео из рекламы)', active: true,
          text: '{name}, здравствуйте! Увидел вашу заявку по {ad} — отличный выбор. Цены по нему, скорее всего, скоро подрастут, так что тайминг сейчас удачный.\n{priceLine}Прислать вам лучшие варианты в этой вилке?' },
        { day: 0.15, channel: 'wa', mode: 'text', label: '2 касание · представление (+визитка брокера), ~3 часа', active: true,
          text: 'Кстати, я из {agency} — мы не просто выставляем объекты, а отбираем лучшие вручную. И этот — точно из таких.\nПомогу найти правильный вариант и разобраться со всеми деталями. Вы рассматриваете для переезда или как инвестицию?' },
        { day: 1, channel: 'wa', mode: 'text', label: '3 касание · ценность+срочность по проекту (день 2, + PDF-подборка)', active: true,
          text: '{name}, короткий сигнал — цены по этому проекту скоро поднимаются.\n\n💰 Потенциальная доходность — до 10% годовых\n📈 Высокий спрос на краткосрочную аренду — стабильный кэшфлоу\n🏊 Инфраструктура: бассейн, сауна, спортзал, зона йоги\n\nПрислать вам сравнение лучших вариантов этого месяца?' },
        { day: 2, channel: 'wa', mode: 'text', label: '4 касание · звонок естественно (день 3)', active: true,
          text: 'Давайте созвонимся завтра — проведу вас по лучшим предложениям и отвечу на все вопросы.\n{countryQ}' },
        { day: 3, channel: 'wa', mode: 'text', label: '5 касание · полезный крючок: каталог (день 4, + обложка каталога)', active: true,
          text: 'Только что подготовил свежую подборку топ-проектов {geo} на {month} — варианты, отобранные вручную, с лучшими планами оплаты и локациями.\nПрислать вам?' },
        { day: 6, channel: 'wa', mode: 'text', label: '6 касание · финальный чек-ин, по-человечески (день 7)', active: true,
          text: '{name}, если честно — сложно двигаться дальше, не понимая, рассматриваете ли вы ещё этот вопрос.\nЕсли будет минутка, дадите знать? Буду признателен 🙏' },
      ];
    }
    const t1 = db.templates.find(t => t.id === 'tpl_first_ru');
    if (t1) t1.body = '{name}, здравствуйте! Увидел вашу заявку по {ad} — отличный выбор. Цены по нему, скорее всего, скоро подрастут, так что тайминг сейчас удачный. {priceLine}Прислать вам лучшие варианты в этой вилке?';
    if (!db.sequences.some(sq => sq.id === 'seq_en_2025')) {
      db.sequences.push({
        id: 'seq_en_2025', name: 'EN · Native script 2025 (дословно из файла)', geo: 'all', active: false,
        steps: [
          { day: 0, channel: 'wa', mode: 'text', label: '1st Message · Personalized & Engaging', active: true,
            text: 'Hey {name}! Saw your request about {ad} in Dubai — great pick! Prices might be going up soon, so timing is key.\n{priceLineEn}Want me to send you the best options in this range?' },
          { day: 0.15, channel: 'wa', mode: 'text', label: '2nd Message · Building Trust Naturally (+broker card)', active: true,
            text: 'By the way, I\u2019m {agency} — we don\u2019t just list properties, we handpick the best. And this one definitely made the cut.\nI can help you find the right deal and sort out all the details. Are you looking to buy for relocation or as an investment?' },
          { day: 1, channel: 'wa', mode: 'text', label: '3rd Message · Follow-up with Value & Urgency (+PDF)', active: true,
            text: 'Hey {name}, just a quick heads-up — prices for this project are going up soon!\n\n💰 Potential ROI of up to 10% annually\n📈 High demand for short-term rentals — strong cash flow\n🏊 Luxury amenities: pool, sauna, gym, yoga zone & more\n\nWant me to send you a comparison of the best options this month?' },
          { day: 2, channel: 'wa', mode: 'text', label: '4th Message · Encouraging a Call Naturally', active: true,
            text: 'Let\u2019s have a quick call tomorrow — I\u2019ll walk you through the best deals and answer any questions.\n{countryQEn}' },
          { day: 3, channel: 'wa', mode: 'text', label: '5th Message · Providing a Valuable Hook (+catalog cover)', active: true,
            text: 'Just prepared a fresh selection of Dubai\u2019s top projects — handpicked options with the best payment plans and locations.\nWant me to send it over?' },
          { day: 6, channel: 'wa', mode: 'text', label: 'Last Message · Final Check-in, Compassionate', active: true,
            text: 'Hey {name},\nHonestly, it\u2019s a bit hard to move forward without knowing if this is still something you\u2019re considering. If you have a minute, could you let me know? Appreciate it! 🙏' },
        ],
      });
    }
  }
  if (!db.settings.chainV2) {
    db.settings.chainV2 = true;
    const std = db.sequences.find(sq => sq.id === 'seq_default');
    if (std) {
      std.name = 'Стандартная · усиленная (якорь на объявление)';
      std.steps = [
        { day: 0, channel: 'wa', mode: 'text', label: 'Мгновенный ответ · якорь на объявление', active: true,
          text: '{name}, здравствуйте! Видел вашу заявку по объявлению {ad} — отличный выбор 👌\nЯ из {agency}, помогу подобрать под вашу задачу.\nПодскажите: смотрите для жизни или как инвестицию?' },
        { day: 0.15, channel: 'wa', mode: 'text', label: 'Визитка + микро-да (~3 ч)', active: true,
          text: 'Кстати, мы не просто листингуем объекты — отбираем лучшие вручную, и этот прошёл отбор.\nПрислать сюда 3 сильных варианта в вашей вилке? Одним сообщением, без спама.' },
        { day: 1, channel: 'wa', mode: 'text', label: 'Ценность + urgency (день 2)', active: true,
          text: '{name}, короткий апдейт по {geo}: застройщик готовит повышение цен по очереди, тайминг сейчас важен.\n💰 доходность до 8-10% годовых · 📈 рассрочка 0%\nПрислать сравнение лучших вариантов {month}?' },
        { day: 3, channel: 'wa', mode: 'text', label: 'Кейс по гео (день 4)', active: true,
          text: '{name}, из свежего: на этой неделе наш клиент закрыл сделку в {geo} — вход на 15% ниже прайса за счёт предстарта.\nТакие окна появляются регулярно — могу присылать только подходящие под ваш запрос. Ок?' },
        { day: 6, channel: 'voice', mode: 'ai', prompt: 'Голосовое 20-30 сек: личное обращение по имени, 1 факт по запросу клиента, приглашение на короткий созвон', label: 'Голосовое (день 7)', active: true },
        { day: 9, channel: 'wa', mode: 'text', label: 'Вывод в звонок (день 10)', active: true,
          text: 'Давайте созвонимся на 10 минут — проведу по лучшим предложениям под ваш запрос и посчитаю доходность.\nУдобно {slots}?' },
        { day: 14, channel: 'wa', mode: 'text', label: 'Сострадательное прощание (день 15)', active: true,
          text: '{name}, честно: сложно двигаться дальше, не понимая, актуален ли ещё вопрос.\nЕсли найдётся минута — дайте знать, пожалуйста. В любом случае остаюсь вашим экспертом по {geo} — пишите сюда в любой момент 🙏' },
      ];
    }
    const t1 = db.templates.find(t => t.id === 'tpl_first_ru');
    if (t1) t1.body = '{name}, здравствуйте! Видел вашу заявку по объявлению {ad} — отличный выбор. Я из {agency}, помогу подобрать под вашу задачу. Смотрите для жизни или как инвестицию?';
    const tw = db.templates.find(t => t.id === 'tpl_wake_ru');
    if (tw) tw.body = '{name}, здравствуйте! Вы интересовались недвижимостью в {geo}. С тех пор рынок сдвинулся: новые запуски с рассрочкой 0% и предстарты ниже прайса. Собрать свежую подборку под ваш прежний запрос?';
  }
  if (!db.sequences.some(sq => sq.id === 'seq_b2c_2025')) {
    db.sequences.push({
      id: 'seq_b2c_2025', name: 'B2C: лид из рекламы · скрипт-прожимка 2025', geo: 'all', active: false,
      steps: [
        { day: 0, channel: 'wa', mode: 'text', label: '1 касание · якорь на объявление (мгновенно)', active: true,
          text: '{name}, здравствуйте! Видел вашу заявку по объявлению {ad} — отличный выбор 👌\nЦены по этому проекту скоро пойдут вверх, тайминг сейчас важен.\nВход от разумного бюджета — прислать лучшие варианты в этой вилке?' },
        { day: 0.15, channel: 'wa', mode: 'text', label: '2 касание · визитка + развилка цели (~3 ч)', active: true,
          text: 'Кстати, я из {agency} — мы не просто листингуем объекты, а отбираем лучшие вручную, и этот прошёл отбор.\nПомогу подобрать и закрыть все детали. Смотрите для переезда или как инвестицию?' },
        { day: 1, channel: 'wa', mode: 'text', label: '3 касание · ценность + urgency (день 2)', active: true,
          text: '{name}, короткий апдейт — цены по проекту скоро поднимут.\n💰 Потенциальная доходность до 10% годовых\n📈 Высокий спрос на краткосрочную аренду\n🏊 Инфраструктура: бассейн, сауна, спортзал\nПрислать сравнение лучших вариантов месяца?' },
        { day: 2, channel: 'wa', mode: 'text', label: '4 касание · подборка (день 3)', active: true,
          text: 'Подготовил свежую подборку топ-проектов {geo} на {month} — отобраны вручную, с лучшими планами оплаты.\nПрислать сюда ссылкой?' },
        { day: 3, channel: 'wa', mode: 'text', label: '5 касание · вывод в звонок (день 4)', active: true,
          text: 'Давайте созвонимся завтра на 10 минут — проведу по лучшим предложениям и отвечу на вопросы.\nУдобно {slots}?' },
        { day: 6, channel: 'wa', mode: 'text', label: '6 касание · сострадательное прощание (день 7)', active: true,
          text: '{name}, честно: сложно двигаться дальше, не понимая, актуален ли ещё вопрос для вас.\nЕсли найдётся минута — дайте знать, пожалуйста. Спасибо! 🙏' },
      ],
    });
  }
  if (!db.sequences.some(sq => sq.id === 'seq_fb_onb')) {
    db.sequences.push({
      id: 'seq_fb_onb', name: 'Онбординг из Facebook-лидгена · пресет TargetPoint', geo: 'all', active: false,
      steps: [
        { day: 0, channel: 'wa', mode: 'text', label: 'Первое касание (мгновенно)', active: true,
          text: 'Добрый день, {name}\nМеня зовут {agency} — вы оставляли заявку по недвижимости ({geo}).\n\nВ {month} по {geo} у нас:\n• живая база проектов с рассрочкой\n• подбор под цель: инвестиция / переезд / ВНЖ\n• полное сопровождение сделки удалённо\n\nПодскажите, рассматриваете для жизни или как инвестицию?' },
        { day: 0.15, channel: 'wa', mode: 'text', label: 'Знакомство + зум (через ~3 часа)', active: true,
          text: 'Приятно познакомиться 🤝\nПредлагаю короткий зум: за 15 минут покажу 3 проекта под ваш запрос с расчётом доходности.\nУдобно {slots}?' },
        { day: 1, channel: 'wa', mode: 'text', label: 'Дожим · тишина (24 часа)', active: true,
          text: '{name}, добрый день) Есть новости по нашему вопросу?\nМогу подобрать удобный слот под зум на эту неделю — во сколько вам комфортно?' },
        { day: 3, channel: 'wa', mode: 'text', label: 'Дожим · персональный разбор (72 часа)', active: true,
          text: '{name}, могу сделать для вас разбор: соберу подборку по вашему запросу в {geo} с планами оплаты и расчётом доходности — посмотрите за 5 минут.\nЕсли актуально — пришлю ссылкой сюда.' },
      ],
    });
  }
  if (!db.settings.portals) db.settings.portals = {
    property_finder: { name: 'Property Finder', key: '', status: 'off' },
    bayut: { name: 'Bayut / Dubizzle', key: '', status: 'off' },
    dld: { name: 'DLD (Dubai Land Department)', key: '', status: 'off' },
    property_monitor: { name: 'Property Monitor', key: '', status: 'off' },
    reidin: { name: 'REIDIN', key: '', status: 'off' },
  };
  if (!db.properties) db.properties = [
    { id: 'pr_jvc1', name: 'Binghatti Amber', area: 'JVC', developer: 'Binghatti', market: 'offplan', type: '1BR', beds: 1, priceFrom: 190000, currency: 'USD', handover: 'Q2 2027', payment: '70/30, 1%/мес', geo: 'dubai', tags: ['рассрочка', 'высокий ROI'], materials: [{ label: 'Брошюра', url: 'https://example.com/brochure.pdf' }], note: 'Флагман JVC, аренда 7-8%' },
    { id: 'pr_mar1', name: 'Marina Shores', area: 'Dubai Marina', developer: 'Emaar', market: 'offplan', type: '1-2BR', beds: 2, priceFrom: 380000, currency: 'USD', handover: 'Q4 2026', payment: '60/40', geo: 'dubai', tags: ['вид на марину'], materials: [], note: '' },
    { id: 'pr_jvc2', name: 'Studio One JVC (вторичка)', area: 'JVC', developer: '—', market: 'secondary', type: 'Studio', beds: 0, priceFrom: 145000, currency: 'USD', handover: 'готово', payment: '100% / ипотека', geo: 'dubai', tags: ['готово', 'под сдачу'], materials: [], note: 'Арендатор внутри, 7.4% net' },
    { id: 'pr_dt1', name: 'Peninsula Four', area: 'Business Bay', developer: 'Select Group', market: 'secondary', type: '1BR', beds: 1, priceFrom: 310000, currency: 'USD', handover: 'готово', payment: '100% / ипотека', geo: 'dubai', tags: ['канал', 'готово'], materials: [], note: '' },
    { id: 'pr_jvt1', name: 'Red Square Tower', area: 'JVT', developer: 'Tiger', market: 'offplan', type: 'Studio-1BR', beds: 1, priceFrom: 160000, currency: 'USD', handover: 'Q1 2027', payment: '1%/мес до сдачи', geo: 'dubai', tags: ['рассрочка'], materials: [], note: '' },
    { id: 'pr_bali1', name: 'Nuanu Ecoverse Villas', area: 'Берава', developer: 'Nuanu', market: 'offplan', type: 'Villa 2BR', beds: 2, priceFrom: 250000, currency: 'USD', handover: 'Q3 2026', payment: '50/50', geo: 'bali', tags: ['вилла', 'управление'], materials: [], note: 'Лизхолд 30 лет' },
  ];
  if (!db.collections) db.collections = [];
  if (!db.folders) db.folders = [];
  for (const pr of db.properties) { if (!pr.images) pr.images = []; if (!pr.layouts) pr.layouts = []; if (!pr.description) pr.description = ''; if (!pr.amenities) pr.amenities = []; if (!pr.units) pr.units = []; }
  if (!db.settings.agency.manager) db.settings.agency.manager = { name: 'Ваш менеджер', phone: '', email: '' };
  if (!db.settings.agency.about) db.settings.agency.about = {
    intro: 'Мы — международное агентство недвижимости. Помогаем покупать в Дубае, на Бали и в Таиланде удалённо и безопасно.',
    bullets: ['5 направлений: Дубай, Бали, Пхукет, Испания, Оман', '300+ сделок за последние 2 года', 'Аналитика по каждому запросу: 3-5 экспертов на подбор', 'Сопровождение до ключей и после: аренда, перепродажа'],
    whyUs: ['Сильная аналитика. Каждый запрос обрабатывают несколько экспертов — в подборку попадают только объекты, проходящие фильтр по доходности и застройщику.', 'Работаем во всех сегментах: первичка и вторичка, апартаменты, виллы и офисы.', 'Отдел заботы: документооборот, бронь, гарантия оплаты — на нашей стороне. После сделки помогаем со сдачей в аренду и перепродажей.'],
    freeNote: 'Услуги на первичном рынке бесплатны для вас — мы зарабатываем на комиссии застройщиков.',
    office: { city: 'Dubai', address: '', blurb: 'Работаем в будни, выходные и праздники. Будете в Дубае — приходите знакомиться лично.' },
  };
  {
    const enrich = {
      pr_jvc1: { hookTitle: 'Комплекс с инфраструктурой от бассейна до ретейла в сердце JVC', roi: 'от 7% годовых', appreciation: 'от 20% к сдаче',
        district: { name: 'JVC', blurb: 'Jumeirah Village Circle — самый арендуемый комьюнити-район Дубая: 30+ парков, школы, Circle Mall.', times: [{ min: 20, place: 'Dubai Marina' }, { min: 25, place: 'Burj Khalifa' }, { min: 28, place: 'Аэропорт DXB' }] },
        paymentRows: [{ pct: '20%', label: 'Первоначальный взнос' }, { pct: '50%', label: 'Во время строительства' }, { pct: '30%', label: 'При получении ключей' }],
        whyRent: ['Застройщик Binghatti — 40+ реализованных проектов, сдаёт с опережением сроков.', 'JVC — лидер по спросу на аренду среди экспатов: заполняемость выше 90%.', 'Быстрый доступ к Marina, Downtown и Mall of the Emirates на машине.'] },
      pr_mar1: { hookTitle: 'Видовые апартаменты у марины от Emaar', roi: 'от 6% годовых', appreciation: 'от 15% к сдаче',
        district: { name: 'Dubai Marina', blurb: 'Марина — витрина Дубая: набережная, яхт-клуб, рестораны, пляжи JBR в пешей доступности.', times: [{ min: 5, place: 'JBR Beach' }, { min: 20, place: 'Burj Khalifa' }, { min: 30, place: 'Аэропорт DXB' }] },
        paymentRows: [{ pct: '10%', label: 'Первоначальный взнос' }, { pct: '50%', label: 'Во время строительства' }, { pct: '40%', label: 'При получении ключей' }],
        whyRent: ['Emaar — госзастройщик, реализовавший Burj Khalifa: высочайшее качество и ликвидность.', 'Марина — стабильно высокий спрос на краткосрок и долгосрок круглый год.', 'Видовые линии на марину — премия к аренде 15-20%.'] },
      pr_jvc2: { hookTitle: 'Готовая студия под сдачу с арендатором внутри', roi: '7.4% net', appreciation: 'готовый актив',
        district: { name: 'JVC', blurb: 'Готовый фонд JVC — вход в рынок аренды Дубая с первого дня, без ожидания стройки.', times: [{ min: 20, place: 'Dubai Marina' }, { min: 25, place: 'Downtown' }] },
        paymentRows: [{ pct: '100%', label: 'Оплата / ипотека' }],
        whyRent: ['Арендатор уже внутри — доход с первого месяца.', 'Net-доходность 7.4% подтверждена договором аренды.', 'Вторичка JVC растёт на волне дефицита готового фонда.'] },
      pr_dt1: { hookTitle: 'Готовый 1BR на канале в Business Bay', roi: 'от 6.5%', appreciation: 'готовый актив',
        district: { name: 'Business Bay', blurb: 'Деловой центр Дубая на канале: офисы, Downtown в 10 минутах пешком.', times: [{ min: 10, place: 'Burj Khalifa' }, { min: 18, place: 'Аэропорт DXB' }] },
        paymentRows: [{ pct: '100%', label: 'Оплата / ипотека' }],
        whyRent: ['Спрос от офисных сотрудников круглый год.', 'Пешком до Downtown — премия к аренде.', 'Ликвидность вторички Business Bay — одна из лучших в городе.'] },
      pr_jvt1: { hookTitle: 'Студии и 1BR с рассрочкой 1% в месяц до сдачи', roi: 'от 7% годовых', appreciation: 'от 18% к сдаче',
        district: { name: 'JVT', blurb: 'Jumeirah Village Triangle — тихий семейный район рядом с JVC, растущая инфраструктура.', times: [{ min: 18, place: 'Dubai Marina' }, { min: 27, place: 'Downtown' }] },
        paymentRows: [{ pct: '20%', label: 'Первоначальный взнос' }, { pct: '1%/мес', label: 'До сдачи' }, { pct: 'Остаток', label: 'При ключах' }],
        whyRent: ['Рассрочка 1%/мес — минимальная нагрузка до ключей.', 'Вход от $160k — нижняя граница рынка с потенциалом роста.', 'Tiger Properties — 15 лет на рынке, 20+ сданных башен.'] },
      pr_bali1: { hookTitle: 'Виллы под сдачу в эко-комьюнити с управляющей компанией', roi: 'от 12% годовых', appreciation: 'от 25% к сдаче',
        district: { name: 'Берава', blurb: 'Берава — центр серфинг- и номад-жизни Бали: пляжные клубы, кафе, международные школы.', times: [{ min: 5, place: 'Пляж Berawa' }, { min: 15, place: 'Чангу' }, { min: 45, place: 'Аэропорт DPS' }] },
        paymentRows: [{ pct: '50%', label: 'Первоначальный взнос' }, { pct: '50%', label: 'К завершению' }],
        whyRent: ['Управляющая компания берёт сдачу на себя — пассивный доход.', 'Заполняемость вилл в Бераве 80%+ круглый год.', 'Лизхолд 30 лет с опцией продления — проговариваем сразу.'] },
    };
    const imgMap = {
      pr_jvc1: ['/assets/props/ext1.jpg', '/assets/props/int1.jpg', '/assets/props/ext3.jpg'],
      pr_mar1: ['/assets/props/ext2.jpg', '/assets/props/int2.jpg'],
      pr_jvc2: ['/assets/props/int3.jpg', '/assets/props/ext4.jpg'],
      pr_dt1: ['/assets/props/ext4.jpg', '/assets/props/int2.jpg'],
      pr_jvt1: ['/assets/props/ext3.jpg', '/assets/props/int1.jpg'],
      pr_bali1: ['/assets/props/villa1.jpg', '/assets/props/villa2.jpg'],
    };
    for (const [id2, imgs] of Object.entries(imgMap)) {
      const pr = db.properties.find(x => x.id === id2);
      if (pr && !(pr.images || []).length) pr.images = imgs;
    }
    for (const [id, ex] of Object.entries(enrich)) {
      const pr = db.properties.find(x => x.id === id);
      if (pr && !pr.hookTitle) Object.assign(pr, ex);
    }
  }
  /* обогащение демо-объекта под эталонную структуру */
  {
    const bg = db.properties.find(x => x.id === 'pr_jvc1');
    if (bg && !bg.description) {}
    if (bg && !bg.amenities.length) {
      bg.description = 'Роскошный жилой комплекс от Binghatti в сердце JVC: подземный паркинг, ретейл на первом этаже, студии и апартаменты с 1-2 спальнями, панорамные виды на скайлайн Дубая. Развитая инфраструктура района: 30+ парков, школы, Circle Mall, 25 минут до Palm Jumeirah и Burj Khalifa.';
      bg.amenities = ['Бассейн', 'Фитнес-центр', 'Лобби', 'Паркинг', 'Зоны отдыха', 'Ретейл'];
      bg.units = [
        { plan: 'Studio', area: '38 м²', floor: '5', price: 203000, view: 'community' },
        { plan: '1BR', area: '68 м²', floor: '3', price: 291600, view: 'main road' },
        { plan: '1BR', area: '72 м²', floor: '11', price: 315000, view: 'skyline' },
      ];
    }
  }
  for (const b of db.brokers) if (!b.schedule) b.schedule = { days: [1, 2, 3, 4, 5, 6], from: '09:00', to: '20:00' };
  for (const l of db.leads) { if (!l.custom) l.custom = {}; if (!l.transcripts) l.transcripts = []; }
  store.save();
}

/* мэтчинг лида на объявление по ad_id из вебхука */
function matchAd(db, lead) {
  if (!lead.ads || !lead.ads.adId) return;
  const ad = db.ads.find(a => String(a.adId) === String(lead.ads.adId));
  if (ad) {
    lead.ads.adName = ad.name;
    lead.ads.adsetName = ad.adsetName;
    lead.ads.campaignName = ad.campaignName;
    lead.ads.matched = true;
    if (ad.geo && !lead.geoLocked) lead.geo = ad.geo;
  } else lead.ads.matched = false;
}

/* исходящий мост: квал/передача → POST наружу (Albato примет и разнесёт дальше) */
function notifyOutbound(db, lead, event) {
  const url = db.settings.hooks.outboundUrl;
  if (!url) return;
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event, at: Date.now(),
      lead: { id: lead.id, name: lead.name, phone: lead.phone, geo: lead.geo, stage: lead.stage, score: lead.score, quals: lead.quals, summary: lead.summary, ads: lead.ads || null, source: lead.source },
    }),
  }).catch(e => console.error('[outbound]', e.message));
}
engine.onQualified = (db, lead) => notifyOutbound(db, lead, 'lead.qualified');
engine.onHandover = (db, lead) => notifyOutbound(db, lead, 'lead.handover');
engine.matchAd = matchAd; /* демо-генератор комментариев цепляет объявление к лиду */

function getSession(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/lumen_sid=([a-f0-9]{32})/);
  if (!m) return null;
  return store.get().settings.auth.sessions[m[1]] ? m[1] : null;
}
/* роль сессии: owner (пароль агентства) | broker (личный PIN) */
function sessionRole(req) {
  const sid = getSession(req);
  if (!sid) return null;
  const s = store.get().settings.auth.sessions[sid];
  return { sid, role: s.role || 'owner', brokerId: s.brokerId || null };
}
/* аудит-лог: кто что сделал (анти-увод базы + прозрачность) */
function audit(db, req, action, extra) {
  const s = sessionRole(req);
  const who = s && s.role === 'broker' ? ((db.brokers.find(b => b.id === s.brokerId) || {}).name || s.brokerId) : 'владелец';
  db.audit = db.audit || [];
  db.audit.unshift(Object.assign({ at: Date.now(), who, role: s ? s.role : '—', action }, extra || {}));
  if (db.audit.length > 500) db.audit.length = 500;
  store.save();
}
/* маскировка телефона для чужих лидов у роли broker */
const maskPhone = (ph) => String(ph || '').replace(/^(\+?\d{2,4})\d+(\d{2})$/, '$1•••••$2');

function tunnelUrl() {
  try {
    const log = fs.readFileSync('/tmp/lumen-tunnel.log', 'utf8');
    const m2 = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
    return m2 ? m2[m2.length - 1] : null;
  } catch { return null; }
}

function publicSettings(db) {
  const s = JSON.parse(JSON.stringify(db.settings));
  delete s.auth;
  delete s.billing; // отдаётся отдельным computed-роутом /api/billing (с расчётом/расходниками)
  if (s.wa.token) { s.wa.tokenSet = true; delete s.wa.token; }
  if (s.telephony && s.telephony.key) { s.telephony.keySet = true; delete s.telephony.key; delete s.telephony.secret; }
  if (s.voice && s.voice.key) { s.voice.keySet = true; delete s.voice.key; }
  if (s.channels) {
    for (const k of ['tg', 'viber', 'email']) {
      const c = s.channels[k];
      if (c && (c.botToken || c.token || c.key)) { c.keySet = true; delete c.botToken; delete c.token; delete c.key; }
    }
  }
  if (s.social) { for (const k of ['ig', 'fb']) { const c = s.social[k]; if (c && c.token) { c.tokenSet = true; delete c.token; } } }
  if (s.inventorySources && s.inventorySources.reelly && s.inventorySources.reelly.key) { s.inventorySources.reelly.keySet = true; delete s.inventorySources.reelly.key; }
  s.ai.llmAvailable = llm.available();
  s.ai.llmModel = llm.MODEL;
  s.tunnelUrl = tunnelUrl();
  return s;
}

const json = (res, code, data) => {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
};

const readBody = (req) => new Promise((resolve) => {
  let b = '';
  req.on('data', (c) => { b += c; if (b.length > 2e6) req.destroy(); });
  req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } });
});

/* подсказка «что делать дальше» — считается по фактам карточки */
function leadHint(db, l, axesFilled) {
  const now = Date.now();
  /* живой просмотр подборки — самый горячий сигнал, выше всего */
  const hotView0 = (db.collections || []).find(c => c.leadId === l.id && c.lastViewAt && now - c.lastViewAt < 24 * 3600e3);
  if (hotView0 && !['deal', 'lost'].includes(l.stage)) return { kind: 'act', text: `Смотрел подборку «${hotView0.title}» ${Math.round((now - hotView0.lastViewAt) / 60e3)} мин назад — идеальный момент для звонка` };
  if (l.nextAction && l.nextAction.at && l.nextAction.at < now) return { kind: 'warn', text: `Просрочен следующий шаг: ${l.nextAction.text}` };
  if ((l.tags || []).includes('нужен человек')) return { kind: 'warn', text: 'ИИ отключился: клиент ждёт живого менеджера — ответьте вручную' };
  const noShow = (db.meetings || []).find(mt => mt.leadId === l.id && mt.status === 'no_show');
  if (noShow && !['deal', 'lost'].includes(l.stage)) return { kind: 'warn', text: 'Не пришёл на встречу — предложите новый слот, лид ещё тёплый' };
  if (l.stage === 'qualified') return { kind: 'act', text: 'Все 4 оси закрыты — передайте брокеру, пока лид горячий' };
  if (['handover', 'viewing'].includes(l.stage) && !(db.meetings || []).some(mt => mt.leadId === l.id && mt.status === 'scheduled')) return { kind: 'act', text: 'Встреча не назначена — предложите слот' };
  if (l.stage === 'dialog' && axesFilled < 4) return { kind: 'info', text: `ИИ выясняет оси: осталось ${4 - axesFilled} из 4` };
  if (['new', 'touch'].includes(l.stage) && l.ai.nextTouchAt) return { kind: 'info', text: `Молчит — цепочка коснётся ${new Date(l.ai.nextTouchAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` };
  if (l.stage === 'sleeping') return { kind: 'info', text: `Спит · скоринг реанимации ${engine.wakeScore(db, l)} — кандидат в кампанию` };
  return null;
}

function leadView(db, l) {
  let lastText = null;
  for (let i = db.messages.length - 1; i >= 0; i--) {
    if (db.messages[i].leadId === l.id) { lastText = db.messages[i].text; break; }
  }
  const axesFilled = ai.AXES.filter(a => l.quals[a]).length;
  return Object.assign({}, l, {
    brokerName: (db.brokers.find(b => b.id === l.broker) || {}).name || null,
    geoName: db.settings.geoNames[l.geo] || l.geo,
    axesFilled,
    wakeScore: l.stage === 'sleeping' ? engine.wakeScore(db, l) : null,
    lastText,
    hint: leadHint(db, l, axesFilled),
    playTip: (playbook.forContext(l, axesFilled)[0] || null),
  });
}

function analytics(db) {
  const leads = db.leads;
  const by = (st) => leads.filter(l => l.stage === st).length;
  const contacted = leads.filter(l => db.messages.some(m => m.leadId === l.id && m.dir === 'out'));
  const replied = contacted.filter(l => db.messages.some(m => m.leadId === l.id && m.dir === 'in'));
  const qualifiedPlus = replied.filter(l => ['qualified', 'handover', 'viewing', 'deal'].includes(l.stage));
  const geoStats = {};
  for (const g of db.settings.agency.geos) {
    const gl = leads.filter(l => l.geo === g);
    const gq = gl.filter(l => ['qualified', 'handover', 'viewing', 'deal'].includes(l.stage));
    geoStats[g] = { name: db.settings.geoNames[g], total: gl.length, qualified: gq.length, conv: gl.length ? Math.round(gq.length / gl.length * 100) : 0 };
  }
  return {
    unread: leads.filter(l => l.lastDir === 'in' && l.stage !== 'lost').length,
    totalActive: leads.filter(l => !['lost'].includes(l.stage)).length,
    funnel: { new: by('new'), touch: by('touch'), dialog: by('dialog'), qualified: by('qualified'), handover: by('handover'), viewing: by('viewing'), deal: by('deal'), sleeping: by('sleeping'), lost: by('lost') },
    compare: {
      human: { firstContact: '47 мин', dialogConv: 40, qualConv: 30, qualTime: '2–3 дня' },
      aiLine: {
        firstContact: '≈1 мин',
        dialogConv: contacted.length ? Math.round(replied.length / contacted.length * 100) : 0,
        qualConv: replied.length ? Math.round(qualifiedPlus.length / replied.length * 100) : 0,
        qualTime: '≤3 часа',
      },
    },
    geoStats,
    wa: {
      sentToday: db.numbers.reduce((s, n) => s + n.sentToday, 0),
      numbersActive: db.numbers.filter(n => n.state === 'active').length,
      avgQuality: Math.round(db.numbers.reduce((s, n) => s + n.quality, 0) / db.numbers.length),
    },
  };
}

/* ================= ПОДБОРКИ: блочная модель =================
   c.blocks = [{id, t, v, hidden, data}] — источник правды композиции страницы.
   Старые подборки (без blocks) синтезируются из legacy c.custom на лету. */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const PB_TYPES = {
  cover: { name: 'Обложка', variants: ['blue', 'photo', 'light', 'split'], std: true },
  hello: { name: 'Привет + об агентстве', variants: ['std'], std: true },
  sep: { name: 'Разделитель', variants: ['blue', 'photo', 'light'], std: true },
  proj: { name: 'Объект', variants: ['full', 'compact', 'gallery'], std: true },
  cta: { name: 'Призыв (CTA)', variants: ['blue', 'card', 'photo'], std: true },
  why: { name: 'Почему мы + офис', variants: ['std'], std: true },
  final: { name: 'Финальная страница', variants: ['blue'], std: true },
  text: { name: 'Текст', variants: ['plain', 'panel', 'blue'] },
  image: { name: 'Картинка', variants: ['full', 'inset'] },
  gallery: { name: 'Галерея', variants: ['grid', 'rows', 'masonry'] },
  video: { name: 'Видео', variants: ['std'] },
  quote: { name: 'Отзыв / цитата', variants: ['card', 'blue', 'big'] },
  stats: { name: 'Цифры', variants: ['row', 'cards', 'blue'] },
  faq: { name: 'Вопрос-ответ', variants: ['std'] },
  steps: { name: 'Как мы работаем', variants: ['std', 'row'] },
  benefits: { name: 'Преимущества', variants: ['grid', 'list', 'blue'] },
  compare: { name: 'Сравнение', variants: ['table', 'cards'] },
  timeline: { name: 'Таймлайн', variants: ['vertical', 'horizontal'] },
  pricecards: { name: 'Пакеты · тарифы', variants: ['cards', 'minimal'] },
  bignum: { name: 'Крупная цифра', variants: ['plain', 'blue'] },
  checklist: { name: 'Чек-лист', variants: ['single', 'cols'] },
  textimg: { name: 'Текст + фото', variants: ['imgright', 'imgleft'] },
  team: { name: 'Команда', variants: ['cards', 'strip'] },
  amenities: { name: 'Инфраструктура', variants: ['grid', 'compact'] },
  hero: { name: 'Фото-хиро', variants: ['dark', 'light'] },
  guarantee: { name: 'Гарантии · доверие', variants: ['row', 'blue'] },
};

/* темы публичной подборки: полная смена палитры страницы */
const PAGE_THEMES = {
  klein: { name: 'Klein', blue: '#1D34D8', ink: '#0B0B0F', mut: '#5E6470', bg: '#F5F5F3', body: '#DDDEE2', paper: '#ffffff', line: 'var(--line)' },
  royal: { name: 'Royal', blue: '#5B2BD8', ink: '#12081F', mut: '#6E6480', bg: '#F6F3FB', body: '#DEDAE8', paper: '#ffffff', line: '#E6E0F0' },
  emerald: { name: 'Emerald', blue: '#0E7A5F', ink: '#07211A', mut: '#5E7068', bg: '#F1F6F3', body: '#D7E2DC', paper: '#ffffff', line: '#DCE6E0' },
  champagne: { name: 'Champagne', blue: '#A8791F', ink: '#241F14', mut: '#7A6F58', bg: '#F8F4EB', body: '#E7DFCE', paper: '#FFFDF8', line: '#E8E0CE' },
  noir: { name: 'Noir', blue: '#C9A96A', ink: '#EDEDF0', mut: '#9A9AA5', bg: '#191922', body: '#0B0B12', paper: '#14141D', line: '#2A2A38', dark: true },
};

function pbDefaults(t) {
  switch (t) {
    case 'text': return { title: 'Заголовок', body: 'Текст блока — кликните, чтобы отредактировать.' };
    case 'image': return { img: '', caption: '' };
    case 'gallery': return { imgs: ['', '', ''] };
    case 'video': return { url: '', caption: '' };
    case 'quote': return { text: 'Отзыв клиента — пара предложений о работе с нами.', author: 'Имя клиента', role: 'купил апартаменты в Дубае' };
    case 'stats': return { items: [{ k: 'лет на рынке', v: '7' }, { k: 'сделок закрыто', v: '340+' }, { k: 'доходность клиентов', v: '8–11%' }] };
    case 'faq': return { items: [{ q: 'Какой первый шаг?', a: 'Короткий созвон: уточняем задачу и бюджет, дальше присылаем расчёт.' }, { q: 'Есть ли комиссия?', a: 'Для покупателя наши услуги бесплатны — комиссию платит застройщик.' }] };
    case 'steps': return { items: [{ title: 'Созвон 10 минут', text: 'Уточняем цель, бюджет и сроки.' }, { title: 'Подборка и расчёт', text: 'Присылаем варианты с цифрами доходности.' }, { title: 'Показ и сделка', text: 'Онлайн или лично — сопровождаем до ключей.' }] };
    case 'benefits': return { title: 'Что вы получаете', items: [{ icon: '🔑', title: 'Доступ до старта продаж', text: 'Юниты по ценам застройщика — раньше рынка.' }, { icon: '📊', title: 'Честные цифры', text: 'Расчёт доходности по каждому варианту, не «на глаз».' }, { icon: '🛡', title: 'Сопровождение', text: 'Договор, платежи, регистрация — берём на себя.' }] };
    case 'compare': return { title: 'Сравним варианты', headA: 'Вариант A', headB: 'Вариант B', items: [{ k: 'Цена входа', a: 'от $145 000', b: 'от $190 000' }, { k: 'Сдача', a: 'Q4 2026', b: 'готов' }, { k: 'Доходность', a: '8–9%', b: '6–7%' }] };
    case 'timeline': return { title: 'Как пройдёт покупка', items: [{ when: 'Неделя 1', title: 'Выбор юнита', text: 'Показ, расчёт, бронирование.' }, { when: 'Неделя 2', title: 'Договор и взнос', text: 'SPA с застройщиком, первый платёж.' }, { when: 'Далее', title: 'Рассрочка до ключей', text: 'Платежи по плану, мы сопровождаем.' }] };
    case 'pricecards': return { title: 'Форматы работы', items: [{ name: 'Подбор', price: 'Бесплатно', text: 'Комиссию платит застройщик.\nПодборка + показы + сделка.' }, { name: 'Под ключ', price: 'По запросу', text: 'Плюс: мебель, аренда, управление.\nПассивный доход без забот.' }] };
    case 'bignum': return { v: '8–11%', k: 'годовых в долларах приносят квартиры под аренду у наших клиентов' };
    case 'checklist': return { title: 'Проверим за вас', bullets: ['Репутация застройщика и история сдач', 'Юридическая чистота юнита', 'Реальная аренда в районе, а не обещанная', 'Скрытые платежи и сервисные сборы'] };
    case 'textimg': return { title: 'Заголовок раздела', body: 'Пара абзацев текста рядом с фотографией — район, концепция проекта или история клиента.', img: '' };
    case 'team': return { title: 'Кто будет с вами на связи', items: [{ name: 'Ваш менеджер', role: 'подбор и переговоры' }, { name: 'Юрист', role: 'договор и проверка' }, { name: 'После сделки', role: 'аренда и управление' }] };
    case 'amenities': return { title: 'Инфраструктура комплекса', items: [{ icon: '🏊', label: 'Бассейн-инфинити' }, { icon: '🏋️', label: 'Фитнес 24/7' }, { icon: '🏖️', label: 'Пляж в 5 минутах' }, { icon: '🛎️', label: 'Консьерж-сервис' }, { icon: '🅿️', label: 'Подземный паркинг' }, { icon: '🌳', label: 'Ландшафтный парк' }] };
    case 'hero': return { img: '', heading: 'Место, где хочется остаться', sub: 'Локация, вид и стиль жизни — одним кадром.' };
    case 'guarantee': return { title: 'Ваша сделка под защитой', items: [{ icon: '🛡', title: 'Юридическая проверка', text: 'Каждый объект — на чистоту и репутацию застройщика.' }, { icon: '📄', title: 'Официальный договор', text: 'SPA напрямую с застройщиком, все условия прозрачны.' }, { icon: '🤝', title: 'Сопровождение до ключей', text: 'Платежи, регистрация и передача — берём на себя.' }] };
    default: return {};
  }
}

/* blocks подборки: из сохранённых или синтез из legacy custom */
function collBlocks(c) {
  if (Array.isArray(c.blocks) && c.blocks.length) return c.blocks;
  const cust = c.custom || {};
  const hid = cust.hidden || [];
  let ids = (c.propertyIds || []).slice();
  if (cust.order && cust.order.length) ids = cust.order.filter((x) => ids.includes(x)).concat(ids.filter((x) => !cust.order.includes(x)));
  const b = [];
  b.push({ id: 'b_cover', t: 'cover', v: 'blue', data: {} });
  b.push({ id: 'b_hello', t: 'hello', v: 'std', hidden: hid.includes('hello'), data: {} });
  b.push({ id: 'b_sep', t: 'sep', v: 'blue', hidden: hid.includes('sep'), data: {} });
  for (const pid of ids) {
    const ov = (cust.props || {})[pid] || {};
    b.push({ id: 'b_p_' + pid, t: 'proj', v: 'full', data: { pid, hookTitle: ov.hookTitle || '', blurb: ov.blurb || '', whyRent: ov.whyRent || null } });
  }
  b.push({ id: 'b_cta', t: 'cta', v: 'blue', hidden: hid.includes('cta'), data: {} });
  b.push({ id: 'b_why', t: 'why', v: 'std', hidden: hid.includes('why'), data: {} });
  b.push({ id: 'b_final', t: 'final', v: 'blue', hidden: hid.includes('final'), data: {} });
  return b;
}

/* санитайз blocks при сохранении из редактора */
function sanitizeBlocks(raw) {
  if (!Array.isArray(raw)) return null;
  const okUrl = (s) => /^(assets\/|\/assets\/|https?:\/\/)/.test(s);
  const str = (s, n) => String(s == null ? '' : s).slice(0, n);
  const out = [];
  for (const b of raw.slice(0, 60)) {
    if (!b || !PB_TYPES[b.t]) continue;
    const meta = PB_TYPES[b.t];
    const nb = {
      id: /^[\w-]{1,40}$/.test(String(b.id)) ? String(b.id) : 'b_' + crypto.randomBytes(4).toString('hex'),
      t: b.t,
      v: meta.variants.includes(b.v) ? b.v : meta.variants[0],
      hidden: !!b.hidden,
      data: {},
    };
    const d = b.data || {};
    const put = (k, n) => { if (d[k] != null && String(d[k]).trim() !== '') nb.data[k] = str(d[k], n); };
    const putImg = (k) => { const v2 = str(d[k], 500).trim(); if (v2 && okUrl(v2)) nb.data[k] = v2; };
    const putList = (k, map) => { if (Array.isArray(d[k])) nb.data[k] = d[k].slice(0, 20).map(map).filter(Boolean); };
    put('title', 300); put('sub', 500); put('body', 4000); put('caption', 400);
    put('heading', 300); put('text', 2000); put('author', 120); put('role', 200);
    put('intro', 2000); put('badge', 120); put('btn', 80); put('freeNote', 400);
    put('hookTitle', 200); put('blurb', 800); put('officeText', 800);
    put('lede', 200); put('aboutHeading', 200); put('recTitle', 200); put('brandName', 120); put('note', 400);
    putImg('img'); putImg('photo');
    if (b.t === 'video') { const v2 = str(d.url, 500).trim(); if (v2 && /^(assets\/|\/assets\/|https?:\/\/)/.test(v2)) nb.data.url = v2; }
    if (b.t === 'proj') { nb.data.pid = str(d.pid, 30); putList('imgs', (x) => { const s2 = str(x, 500).trim(); return s2 && okUrl(s2) ? s2 : null; }); putList('whyRent', (x) => str(x, 300).trim() || null); }
    if (b.t === 'gallery') putList('imgs', (x) => { const s2 = str(x, 500).trim(); return s2 && okUrl(s2) ? s2 : null; });
    if (b.t === 'stats') putList('items', (x) => x && (x.k || x.v) ? { k: str(x.k, 120), v: str(x.v, 60) } : null);
    if (b.t === 'faq') putList('items', (x) => x && (x.q || x.a) ? { q: str(x.q, 300), a: str(x.a, 1000) } : null);
    if (b.t === 'steps' || b.t === 'benefits') putList('items', (x) => x && (x.title || x.text) ? { icon: str(x.icon, 8), title: str(x.title, 200), text: str(x.text, 600) } : null);
    if (b.t === 'compare') { put('headA', 120); put('headB', 120); putList('items', (x) => x && (x.k || x.a || x.b) ? { k: str(x.k, 160), a: str(x.a, 200), b: str(x.b, 200) } : null); }
    if (b.t === 'timeline') putList('items', (x) => x && (x.when || x.title) ? { when: str(x.when, 80), title: str(x.title, 200), text: str(x.text, 500) } : null);
    if (b.t === 'pricecards') putList('items', (x) => x && (x.name || x.price) ? { name: str(x.name, 120), price: str(x.price, 80), text: str(x.text, 600) } : null);
    if (b.t === 'team') putList('items', (x) => x && (x.name || x.role) ? { name: str(x.name, 120), role: str(x.role, 200) } : null);
    if (b.t === 'amenities') putList('items', (x) => x && (x.icon || x.label) ? { icon: str(x.icon, 8), label: str(x.label, 120) } : null);
    if (b.t === 'guarantee') putList('items', (x) => x && (x.icon || x.title || x.text) ? { icon: str(x.icon, 8), title: str(x.title, 200), text: str(x.text, 600) } : null);
    if (b.t === 'hero') { put('heading', 200); put('sub', 400); }
    if (b.t === 'bignum') { put('v', 60); put('k', 300); }
    if (b.t === 'hello' || b.t === 'why' || b.t === 'checklist') putList('bullets', (x) => str(x, 400).trim() || null);
    if (b.t === 'cta') { const h = str(d.href, 500).trim(); if (h && /^(https?:\/\/|mailto:|tel:)/.test(h)) nb.data.href = h; }
    out.push(nb);
  }
  return out.length ? out : null;
}


/* часовой пояс по коду страны телефона (грубо, для тихих часов достаточно) */
const PHONE_TZ = [['7', 3], ['971', 4], ['966', 3], ['968', 4], ['974', 3], ['62', 8], ['66', 7], ['34', 2], ['39', 2], ['49', 2], ['33', 2], ['44', 1], ['48', 2], ['380', 3], ['375', 3], ['998', 5], ['996', 6], ['992', 5], ['994', 4], ['995', 4], ['374', 4], ['90', 3], ['972', 3], ['20', 3], ['1', -5], ['86', 8], ['91', 5.5], ['81', 9]];
function tzFromPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  let best = null;
  for (const [code, tz] of PHONE_TZ) if (d.startsWith(code) && (!best || code.length > best[0].length)) best = [code, tz];
  return best ? best[1] : 4;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  const db = store.get();
  /* базовый URL для ссылок в сообщениях (страницы встреч/подборок) — engine берёт из global */
  if (req.headers.host && !p.startsWith('/wa/')) global.LUMEN_BASE = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;

  try {
    /* ---------------- WhatsApp Cloud API webhook ---------------- */
    if (p === '/wa/webhook' && req.method === 'GET') {
      if (u.searchParams.get('hub.verify_token') === db.settings.wa.webhookVerifyToken) {
        res.writeHead(200); res.end(u.searchParams.get('hub.challenge') || ''); return;
      }
      res.writeHead(403); res.end(); return;
    }
    if (p === '/wa/webhook' && req.method === 'POST') {
      const body = await readBody(req);
      try {
        const field = body.entry?.[0]?.changes?.[0]?.field;
        const changes = body.entry?.[0]?.changes?.[0]?.value;
        /* комментарии под публикацией/рекламой (IG field 'comments', FB 'feed' item 'comment') */
        if (field === 'comments' || (field === 'feed' && changes?.item === 'comment' && changes?.verb === 'add')) {
          const r0 = comments.ingest(db, { value: changes, platform: field === 'comments' ? 'ig' : 'fb' }, matchAd);
          if (r0) { try { await comments.autoReply(db, r0); } catch (e) { console.error('[cmt-auto]', e.message); } store.save(); }
          json(res, 200, { ok: true }); return;
        }
        if (wa.applyStatuses(db, changes)) store.save();
        const wam = changes?.messages?.[0];
        if (wam && wam.type === 'text') {
          const phone = '+' + wam.from.replace(/\D/g, '');
          let lead = db.leads.find(l => l.phone.replace(/\D/g, '') === wam.from.replace(/\D/g, ''));
          if (!lead) {
            lead = { id: store.nextId('ld'), name: changes.contacts?.[0]?.profile?.name || phone, phone, geo: db.settings.agency.geos[0], lang: 'ru', tz: tzFromPhone(phone), stage: 'new', score: 0, source: 'wa_inbound', createdAt: Date.now(), lastMsgAt: null, lastDir: null, quals: { purpose: null, timeline: null, budget: null, type: null }, ai: { enabled: true, chainStep: 0, nextTouchAt: null, silentSince: null }, broker: null, summary: null, tags: ['входящий'], numberId: null, ads: null };
            /* CTWA: реферал несёт id объявления — атрибуция из коробки */
            const ref = wam.referral;
            if (ref && (ref.source_id || ref.ctwa_clid)) {
              lead.source = 'ctwa';
              lead.ads = { adId: ref.source_id || null, ctwaClid: ref.ctwa_clid || null, headline: ref.headline || null };
              matchAd(db, lead);
            }
            db.leads.push(lead);
            ai.pushEvent(db, { type: 'lead_new', leadId: lead.id, text: `Входящий WhatsApp: ${lead.name}${lead.ads && lead.ads.matched ? ' · ' + lead.ads.adName : ''}` });
          }
          engine.inbound(db, lead, wam.text.body);
        }
      } catch (e) { console.error('[webhook]', e); }
      json(res, 200, { ok: true }); return;
    }

    /* ---------------- мост приёма лидов (Albato / Make / любой интегратор) ---------------- */
    if (p === '/hooks/lead' && req.method === 'POST') {
      if (u.searchParams.get('key') !== db.settings.hooks.secret) return json(res, 403, { error: 'bad key' });
      const b = await readBody(req);
      /* гибкий маппинг полей — интеграторы шлют по-разному */
      const pick = (...keys) => { for (const k of keys) { if (b[k] != null && String(b[k]).trim()) return String(b[k]).trim(); } return null; };
      const name = pick('name', 'full_name', 'fullName', 'first_name', 'имя') || 'Без имени';
      const phone = pick('phone', 'phone_number', 'phoneNumber', 'tel', 'телефон');
      if (!phone) return json(res, 400, { error: 'phone required' });
      const adId = pick('ad_id', 'adId', 'ad', 'utm_content');
      const email = pick('email', 'e-mail', 'почта');
      const avatarUrl = pick('avatar_url', 'avatar', 'profile_pic');
      const entry = { at: Date.now(), name, phone, adId, raw: Object.keys(b).slice(0, 20) };

      const norm = (ph) => ph.replace(/\D/g, '').replace(/^8(\d{10})$/, '7$1');
      let lead = db.leads.find(l => norm(l.phone) === norm(phone));
      if (lead) {
        entry.result = 'repeat';
        lead.tags = [...new Set([...(lead.tags || []), 'повторная заявка'])];
        if (adId && !(lead.ads && lead.ads.adId)) { lead.ads = { adId, adsetId: pick('adset_id'), campaignId: pick('campaign_id') }; matchAd(db, lead); }
        ai.pushEvent(db, { type: 'lead_new', leadId: lead.id, text: `Повторная заявка: ${lead.name} — дубль не создан, карточка обогащена` });
      } else {
        lead = {
          id: store.nextId('ld'), name, phone,
          geo: pick('geo', 'direction') || db.settings.agency.geos[0],
          lang: pick('lang', 'language') || 'ru', tz: tzFromPhone(phone), stage: 'new', score: 0,
          source: pick('source', 'src') || 'meta_form',
          createdAt: Date.now(), lastMsgAt: null, lastDir: null,
          quals: { purpose: null, timeline: null, budget: null, type: null },
          ai: { enabled: true, chainStep: 0, nextTouchAt: Date.now() + 15e3, silentSince: null },
          broker: null, summary: null, tags: ['интегратор'], numberId: null,
          avatarUrl: avatarUrl || null, activeChannel: 'wa',
          channels: { wa: 'unknown', tg: 'unknown', viber: 'unknown', email: email ? 'yes' : 'unknown' },
          contacts: email ? [{ kind: 'email', value: email }] : [], notes: [], custom: {}, transcripts: [],
          ads: adId ? { adId, adsetId: pick('adset_id', 'adsetId'), campaignId: pick('campaign_id', 'campaignId'), formName: pick('form_name', 'form') } : null,
        };
        matchAd(db, lead);
        db.leads.push(lead);
        entry.result = 'created';
        entry.leadId = lead.id;
        const adTxt = lead.ads && lead.ads.matched ? ` · объявление: ${lead.ads.adName}` : (adId ? ' · объявление не в базе' : '');
        ai.pushEvent(db, { type: 'lead_new', leadId: lead.id, text: `Лид из интегратора: ${lead.name} · ${db.settings.geoNames[lead.geo] || lead.geo}${adTxt}` });
      }
      db.intakeLog.unshift(entry);
      if (db.intakeLog.length > 200) db.intakeLog.length = 200;
      store.save();
      return json(res, 200, { ok: true, leadId: lead.id, result: entry.result, adMatched: !!(lead.ads && lead.ads.matched) });
    }

    /* ---------------- мост приёма КОММЕНТАРИЕВ под рекламой (интегратор/тест) ---------------- */
    if (p === '/hooks/comment' && req.method === 'POST') {
      if (u.searchParams.get('key') !== db.settings.hooks.secret) return json(res, 403, { error: 'bad key' });
      const b = await readBody(req);
      const r0 = comments.ingest(db, b, matchAd);
      if (!r0) return json(res, 200, { ok: true, skipped: 'дубль/пусто' });
      try { await comments.autoReply(db, r0); } catch (e) { console.error('[cmt-auto]', e.message); }
      store.save();
      return json(res, 200, { ok: true, commentId: r0.comment.id, leadId: r0.lead ? r0.lead.id : null, fresh: r0.fresh, intent: r0.comment.intent, junk: !!r0.junk, moderated: !!r0.comment.moderated });
    }

    /* ---------------- логотип агентства ---------------- */
    if (p === '/api/agency/logo' && req.method === 'POST') {
      if (!getSession(req)) return json(res, 401, { error: 'auth' });
      const chunks = [];
      let size = 0;
      await new Promise((resolve) => {
        req.on('data', (c) => { size += c.length; if (size > 3e6) req.destroy(); else chunks.push(c); });
        req.on('end', resolve); req.on('close', resolve);
      });
      if (!size || size > 3e6) return json(res, 400, { error: 'файл до 3 МБ (PNG/SVG/JPG)' });
      const ct = req.headers['content-type'] || '';
      const ext = ct.includes('svg') ? 'svg' : ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
      const fname = 'agency-logo.' + ext;
      fs.writeFileSync(path.join(PUBLIC, 'assets', fname), Buffer.concat(chunks));
      db.settings.agency.logo = '/assets/' + fname + '?v=' + Date.now();
      store.save();
      return json(res, 200, { logo: db.settings.agency.logo });
    }

    /* ---------------- отчёты: тестовая сводка ---------------- */
    if (p === '/api/reports/test' && req.method === 'POST') {
      if (!getSession(req)) return json(res, 401, { error: 'auth' });
      const text = engine.buildReport(db, 'daily');
      const sent = await engine.sendReport(db, text);
      return json(res, 200, { text, sent });
    }

    /* ---------------- голос ElevenLabs: тест генерации ---------------- */
    if (p === '/api/voice/test' && req.method === 'POST') {
      if (!getSession(req)) return json(res, 401, { error: 'auth' });
      const v = db.settings.voice || {};
      if (!v.key || !v.voiceId) return json(res, 400, { error: 'нужны API-ключ и Voice ID' });
      const b = await readBody(req);
      try {
        const r2 = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${v.voiceId}?output_format=mp3_44100_128`, {
          method: 'POST',
          headers: { 'xi-api-key': v.key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: String(b.text || 'Добрый день! Это тест голосового сообщения из Lumen CRM.').slice(0, 600), model_id: 'eleven_multilingual_v2' }),
        });
        if (!r2.ok) throw new Error('elevenlabs ' + r2.status + ': ' + (await r2.text()).slice(0, 140));
        const buf = Buffer.from(await r2.arrayBuffer());
        fs.mkdirSync(path.join(PUBLIC, 'assets', 'voice'), { recursive: true });
        const fname = 'voice/tts-' + Date.now() + '.mp3';
        fs.writeFileSync(path.join(PUBLIC, 'assets', fname), buf);
        return json(res, 200, { url: '/assets/' + fname });
      } catch (e) { return json(res, 500, { error: e.message }); }
    }

    /* ---------------- телефония: вебхук записей звонков ----------------
       Zadarma/Twilio/Telnyx после звонка шлют сюда JSON с номером клиента и
       ссылкой на запись. Мы находим лида по номеру, скачиваем запись и
       расшифровываем Whisper-ом — транскрипт сам ложится в карточку. */
    if (p === '/hooks/call' && req.method === 'POST') {
      if (u.searchParams.get('key') !== db.settings.hooks.secret) return json(res, 403, { error: 'bad key' });
      const b = await readBody(req);
      const phone = String(b.phone || b.caller_id || b.to || b.destination || '').replace(/\D/g, '');
      const rec = b.record_url || b.recording_url || b.call_record_link || b.url;
      if (!phone || !rec) return json(res, 400, { error: 'нужны phone и record_url' });
      const lead = db.leads.find(l => l.phone.replace(/\D/g, '').endsWith(phone.slice(-9)));
      if (!lead) return json(res, 200, { ok: true, matched: false });
      (async () => {
        try {
          const r2 = await fetch(rec);
          if (!r2.ok) throw new Error('запись недоступна: ' + r2.status);
          const buf = Buffer.from(await r2.arrayBuffer());
          if (buf.length > 24e6) throw new Error('запись больше 24МБ');
          const extM = String(rec).split('?')[0].match(/\.(flac|m4a|mp3|mp4|mpeg|mpga|oga|ogg|wav|webm)$/i);
          const text = await llm.transcribe(buf, 'call.' + (extM ? extM[1].toLowerCase() : 'mp3'));
          const t = { id: store.nextId('tr'), at: Date.now(), label: 'Звонок · телефония' + (b.duration ? ' · ' + b.duration + 'с' : ''), text: text.slice(0, 20000) };
          lead.transcripts = lead.transcripts || [];
          lead.transcripts.push(t);
          ai.pushEvent(db, { type: 'call', leadId: lead.id, text: `Звонок расшифрован автоматически: ${lead.name} (${Math.round(text.length / 1000)}k символов)` });
          store.save();
        } catch (e) { console.error('[call-hook]', e.message); }
      })();
      return json(res, 200, { ok: true, matched: true, leadId: lead.id });
    }

    /* ---------------- auth ---------------- */
    if (p === '/auth/login' && req.method === 'POST') {
      const b = await readBody(req);
      let sess = null;
      if (sha(String(b.password || '')) === db.settings.auth.passHash) sess = { at: Date.now(), role: 'owner' };
      else {
        /* личный PIN брокера → роль broker (урезанный доступ) */
        const br = db.brokers.find(x => x.pinHash && x.pinHash === sha(String(b.password || '')) && x.active !== false);
        if (br) sess = { at: Date.now(), role: 'broker', brokerId: br.id };
      }
      if (!sess) {
        await new Promise(r => setTimeout(r, 600)); // тормоз перебору
        return json(res, 401, { error: 'wrong password' });
      }
      const sid = crypto.randomBytes(16).toString('hex');
      db.settings.auth.sessions[sid] = sess;
      if (sess.role === 'broker') { const brName = (db.brokers.find(x => x.id === sess.brokerId) || {}).name; db.audit = db.audit || []; db.audit.unshift({ at: Date.now(), who: brName, role: 'broker', action: 'вход в систему' }); }
      const keys = Object.keys(db.settings.auth.sessions);
      if (keys.length > 20) delete db.settings.auth.sessions[keys[0]];
      store.save();
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `lumen_sid=${sid}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`,
      });
      res.end(JSON.stringify({ ok: true })); return;
    }
    if (p === '/auth/logout' && req.method === 'POST') {
      const sid = getSession(req);
      if (sid) { delete db.settings.auth.sessions[sid]; store.save(); }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'lumen_sid=; Path=/; Max-Age=0' });
      res.end(JSON.stringify({ ok: true })); return;
    }
    if (p === '/auth/password' && req.method === 'POST') {
      if (!getSession(req)) return json(res, 401, { error: 'auth' });
      const b = await readBody(req);
      if (sha(String(b.current || '')) !== db.settings.auth.passHash) return json(res, 400, { error: 'текущий пароль неверен' });
      if (String(b.next || '').length < 8) return json(res, 400, { error: 'новый пароль короче 8 символов' });
      db.settings.auth.passHash = sha(String(b.next));
      db.settings.auth.sessions = { [getSession(req)]: { at: Date.now() } }; // остальные сессии — в сброс
      store.save();
      return json(res, 200, { ok: true });
    }

    /* ---------------- API (всё под сессией) ---------------- */
    /* ИИ-переписывание текста: доступно из приложения (сессия) и из конструктора (key) */
    if (p === '/api/ai/text' && req.method === 'POST') {
      if (!getSession(req) && u.searchParams.get('key') !== db.settings.hooks.secret) return json(res, 401, { error: 'auth required' });
      if (!llm.available()) return json(res, 400, { error: 'нет ключей LLM' });
      const b = await readBody(req);
      if (!b.text || !String(b.text).trim()) return json(res, 400, { error: 'пустой текст' });
      try {
        const text = await llm.rewrite(String(b.text), String(b.mode || 'improve'), b.ctx ? String(b.ctx) : '');
        return json(res, 200, { text });
      } catch (e) { return json(res, 500, { error: 'ИИ не справился: ' + e.message }); }
    }

    /* ИИ-заполнение «Об агентстве» (из профиля агентства) */
    if (p === '/api/ai/agency-about' && req.method === 'POST') {
      if (!getSession(req)) return json(res, 401, { error: 'auth required' });
      if (!llm.available()) return json(res, 400, { error: 'нет ключей LLM' });
      try {
        const out = await llm.composeAgencyAbout(db.settings.agency.name, db.settings.agency.geos);
        return json(res, 200, out);
      } catch (e) { return json(res, 500, { error: 'ИИ не справился: ' + e.message }); }
    }

    if (p.startsWith('/api/') && !getSession(req)) return json(res, 401, { error: 'auth required' });

    /* роль broker: только работа с лидами — админ-поверхности закрыты (анти-увод базы) */
    const ROLE = sessionRole(req);
    const IS_BROKER = ROLE && ROLE.role === 'broker';
    if (IS_BROKER && /^\/api\/(settings|brokers|numbers|templates|sequences|campaigns|wake|ads|agency|reports|audit|import|demo|voice|comments|wa)/.test(p) && req.method !== 'GET') return json(res, 403, { error: 'недоступно для брокера' });
    if (IS_BROKER && /^\/api\/(numbers|templates|ads|audit|campaigns|wake|comments|wa)/.test(p)) return json(res, 403, { error: 'недоступно для брокера' });
    /* видимость лида для брокера: только свои */
    const canSeeLead = (l) => !IS_BROKER || l.broker === ROLE.brokerId;
    const brokerPub = (b) => { const c2 = Object.assign({}, b); delete c2.pinHash; return c2; };

    /* ---------------- биллинг подписки (личный кабинет, только владелец) ---------------- */
    if (p.startsWith('/api/billing')) {
      if (IS_BROKER) return json(res, 403, { error: 'недоступно для брокера' });
      if (!db.settings.billing) db.settings.billing = billing.defBilling();
      if (p === '/api/billing' && req.method === 'GET') return json(res, 200, billing.view(db));
      if (p === '/api/billing/plan' && req.method === 'POST') { const b = await readBody(req); return json(res, 200, billing.setPlan(db, b)); }
      if (p === '/api/billing/method' && req.method === 'POST') { const b = await readBody(req); return json(res, 200, billing.setMethod(db, b)); }
      if (p === '/api/billing/invoice' && req.method === 'POST') { const b = await readBody(req); const r = billing.issueInvoice(db, b); return json(res, r.error ? 400 : 200, r); }
      if (p === '/api/billing/checkout' && req.method === 'POST') {
        try { const r = await billing.stripeCheckout(db, global.LUMEN_BASE || ''); return json(res, 200, r); }
        catch (e) { return json(res, 400, { error: e.message }); }
      }
      return json(res, 404, { error: 'not found' });
    }

    if (p === '/api/state' && req.method === 'GET') {
      json(res, 200, {
        settings: publicSettings(db), brokers: db.brokers.map(brokerPub), numbers: IS_BROKER ? [] : db.numbers,
        templates: db.templates, sequences: db.sequences,
        events: IS_BROKER ? db.events.filter(e => !e.leadId || canSeeLead(db.leads.find(l => l.id === e.leadId) || {})).slice(0, 40) : db.events.slice(0, 40),
        analytics: analytics(db),
        me: ROLE ? { role: ROLE.role, brokerId: ROLE.brokerId, name: IS_BROKER ? (db.brokers.find(b => b.id === ROLE.brokerId) || {}).name : null } : null,
      }); return;
    }
    /* журнал доступа (только владелец) */
    if (p === '/api/audit' && req.method === 'GET') {
      return json(res, 200, (db.audit || []).slice(0, 200));
    }

    /* ---------------- КОММЕНТАРИИ под рекламой ---------------- */
    let mm;
    if (p === '/api/comments' && req.method === 'GET') {
      const st = u.searchParams.get('status');
      let list = (db.adComments || []);
      if (st) list = list.filter(c => c.status === st);
      const withLead = list.slice(0, 120).map(c => Object.assign({}, c, { leadName: (db.leads.find(l => l.id === c.leadId) || {}).name || null, live: comments.ready(db, c.platform), priv: comments.privateState(c), hasPublic: (c.replies || []).some(r => r.kind === 'public') }));
      return json(res, 200, { comments: withLead, counts: { new: (db.adComments || []).filter(c => c.status === 'new').length, all: (db.adComments || []).length }, autoReply: !!(db.settings.comments || {}).autoReply, autoHide: !!(db.settings.comments || {}).autoHide, connected: { ig: comments.ready(db, 'ig'), fb: comments.ready(db, 'fb') } });
    }
    if ((mm = p.match(/^\/api\/comments\/([^/]+)\/reply$/)) && req.method === 'POST') {
      const c = (db.adComments || []).find(x => x.id === mm[1]);
      if (!c) return json(res, 404, { error: 'not found' });
      const b = await readBody(req);
      const kind = b.kind === 'private' ? 'private' : 'public';
      if (!String(b.text || '').trim()) return json(res, 400, { error: 'пустой ответ' });
      try {
        await comments.sendReply(db, c, kind, String(b.text).slice(0, 1000));
        /* приватный ответ = старт диалога: заводим сообщение лиду и оживляем ИИ */
        if (kind === 'private') {
          const lead = db.leads.find(l => l.id === c.leadId);
          if (lead) {
            db.messages.push({ id: store.nextId('m'), leadId: lead.id, dir: 'out', via: 'human', channel: c.platform, text: String(b.text).slice(0, 1000), at: Date.now(), status: 'sent' });
            lead.lastMsgAt = Date.now(); lead.lastDir = 'out'; lead.ai.enabled = true;
            ai.pushEvent(db, { type: 'msg_in', leadId: lead.id, text: `Ответ в директ ${lead.name} — комментатор уведён в диалог` });
          }
        }
        store.save();
        return json(res, 200, { ok: true, comment: c });
      } catch (e) { return json(res, 500, { error: e.message }); }
    }
    if ((mm = p.match(/^\/api\/comments\/([^/]+)\/hide$/)) && req.method === 'POST') {
      const c = (db.adComments || []).find(x => x.id === mm[1]);
      if (!c) return json(res, 404, { error: 'not found' });
      const b = await readBody(req);
      try { await comments.hide(db, c, b.hidden !== false); store.save(); return json(res, 200, { ok: true, comment: c }); }
      catch (e) { return json(res, 500, { error: e.message }); }
    }
    /* демо: сгенерировать входящий комментарий (кнопка в UI) */
    if (p === '/api/comments/simulate' && req.method === 'POST') {
      const r0 = engine.simulateComment(db);
      if (r0) { try { await comments.autoReply(db, r0); } catch (e) {} store.save(); }
      return json(res, 200, { ok: !!r0, comment: r0 ? r0.comment : null });
    }

    if (p === '/api/leads' && req.method === 'GET') {
      let list = (IS_BROKER ? db.leads.filter(canSeeLead) : db.leads).map(l => leadView(db, l));
      const stage = u.searchParams.get('stage'), geo = u.searchParams.get('geo'), q = (u.searchParams.get('q') || '').toLowerCase();
      if (stage) list = list.filter(l => l.stage === stage);
      if (geo) list = list.filter(l => l.geo === geo);
      if (q) list = list.filter(l => l.name.toLowerCase().includes(q) || l.phone.includes(q));
      list.sort((a, b) => (b.lastMsgAt || b.createdAt) - (a.lastMsgAt || a.createdAt));
      json(res, 200, list); return;
    }

    if (p === '/api/leads' && req.method === 'POST') {
      const b = await readBody(req);
      const lead = {
        id: store.nextId('ld'), name: b.name || 'Без имени', phone: b.phone || '', geo: b.geo || db.settings.agency.geos[0],
        lang: b.lang || 'ru', tz: b.tz ?? tzFromPhone(b.phone), stage: 'new', score: 0, source: b.source || 'manual',
        createdAt: Date.now(), lastMsgAt: null, lastDir: null,
        quals: { purpose: null, timeline: null, budget: null, type: null },
        ai: { enabled: true, chainStep: 0, nextTouchAt: Date.now() + 15e3, silentSince: null },
        broker: null, summary: null, tags: [], numberId: null,
      };
      db.leads.push(lead);
      ai.pushEvent(db, { type: 'lead_new', leadId: lead.id, text: `Новый лид: ${lead.name} · ${db.settings.geoNames[lead.geo]}` });
      store.save();
      json(res, 200, leadView(db, lead)); return;
    }

    let m;
    /* массовые операции над лидами (выделение на канбане) */
    if (p === '/api/leads/bulk' && req.method === 'POST') {
      const b = await readBody(req);
      const ids = Array.isArray(b.ids) ? b.ids.slice(0, 500) : [];
      const action = String(b.action || '');
      let targets = ids.map(id => db.leads.find(l => l.id === id)).filter(Boolean);
      if (IS_BROKER) targets = targets.filter(canSeeLead); /* брокер — только свои */
      if (!targets.length) return json(res, 400, { error: 'нет доступных лидов' });
      if (IS_BROKER && ['delete', 'broker'].includes(action)) return json(res, 403, { error: 'недоступно для брокера' });
      let done = 0;
      for (const l of targets) {
        if (action === 'stage' && b.value) { l.stage = String(b.value); done++; }
        else if (action === 'archive') { l.stage = 'lost'; l.ai.enabled = false; done++; }
        else if (action === 'broker' && b.value) { const br = db.brokers.find(x => x.id === b.value); if (br) { if (l.broker && l.broker !== br.id) { const old = db.brokers.find(x => x.id === l.broker); if (old) old.load = Math.max(0, old.load - 1); } l.broker = br.id; br.load = (br.load || 0) + 1; if (l.stage === 'qualified') l.stage = 'handover'; if (!l.handoverAt) l.handoverAt = Date.now(); done++; } }
        else if (action === 'tag' && b.value) { l.tags = [...new Set([...(l.tags || []), String(b.value).slice(0, 40)])]; done++; }
        else if (action === 'untag' && b.value) { l.tags = (l.tags || []).filter(t => t !== b.value); done++; }
        else if (action === 'ai') { l.ai.enabled = !!b.value; if (b.value) l.tags = (l.tags || []).filter(t => t !== 'нужен человек'); done++; }
        else if (action === 'delete') { db.messages = db.messages.filter(mm2 => mm2.leadId !== l.id); db.leads = db.leads.filter(x => x.id !== l.id); done++; }
      }
      if (IS_BROKER) audit(db, req, `массовое действие «${action}» над ${done} лид(ами)`);
      const labels = { stage: 'перемещено', archive: 'в архив', broker: 'передано', tag: 'помечено', untag: 'снят тег', ai: b.value ? 'ИИ включён' : 'ИИ выключен', delete: 'удалено' };
      ai.pushEvent(db, { type: 'stage', text: `Массовое действие: ${labels[action] || action} — ${done} лид(ов)` });
      store.save();
      return json(res, 200, { ok: true, done });
    }

    if ((m = p.match(/^\/api\/leads\/([^/]+)/))) {
      const lead0 = db.leads.find(l => l.id === m[1]);
      if (lead0 && !canSeeLead(lead0)) { audit(db, req, 'попытка доступа к чужому лиду', { leadId: lead0.id }); return json(res, 403, { error: 'чужой лид' }); }
    }
    if ((m = p.match(/^\/api\/leads\/([^/]+)$/))) {
      const lead = db.leads.find(l => l.id === m[1]);
      if (!lead) return json(res, 404, { error: 'not found' });
      if (req.method === 'GET') {
        if (IS_BROKER) audit(db, req, 'открыл карточку лида', { leadId: lead.id, lead: lead.name });
        const msgs = db.messages.filter(x => x.leadId === lead.id).sort((a, b) => a.at - b.at);
        return json(res, 200, Object.assign(leadView(db, lead), {
          messages: msgs,
          events: db.events.filter(e => e.leadId === lead.id).slice(0, 60),
          meetings: (db.meetings || []).filter(mt => mt.leadId === lead.id).map(mt => Object.assign({}, mt, { brokerName: (db.brokers.find(x => x.id === mt.brokerId) || {}).name || '—' })),
        }));
      }
      if (req.method === 'PATCH') {
        const b = await readBody(req);
        if (b.stage) lead.stage = b.stage;
        if (b.broker !== undefined) lead.broker = b.broker || null;
        if (b.geo) lead.geo = b.geo;
        if (b.ai) {
          if (b.ai.enabled === true) lead.tags = (lead.tags || []).filter(t => t !== 'нужен человек');
          Object.assign(lead.ai, b.ai);
        }
        if (b.name) lead.name = b.name;
        if (b.custom) { lead.custom = lead.custom || {}; Object.assign(lead.custom, b.custom); }
        if (b.channels) Object.assign(lead.channels = lead.channels || {}, b.channels);
        if (b.avatarUrl !== undefined) lead.avatarUrl = b.avatarUrl || null;
        if (b.nextAction !== undefined) lead.nextAction = b.nextAction && b.nextAction.text ? { text: String(b.nextAction.text).slice(0, 200), at: +b.nextAction.at || null } : null;
        store.save();
        return json(res, 200, leadView(db, lead));
      }
    }

    /* транскрибация звонка: raw-аудио в теле (до 24МБ), ?label=&filename= */
    if ((m = p.match(/^\/api\/leads\/([^/]+)\/transcribe$/)) && req.method === 'POST') {
      const lead = db.leads.find(l => l.id === m[1]);
      if (!lead) return json(res, 404, { error: 'not found' });
      const chunks = [];
      let size = 0, over = false;
      await new Promise((resolve) => {
        req.on('data', (c) => { size += c.length; if (size > 24e6) { over = true; req.destroy(); resolve(); } else chunks.push(c); });
        req.on('end', resolve);
        req.on('close', resolve);
      });
      if (over) return json(res, 400, { error: 'файл больше 24 МБ — обрежьте запись' });
      if (!size) return json(res, 400, { error: 'пустой файл' });
      try {
        const text = await llm.transcribe(Buffer.concat(chunks), u.searchParams.get('filename') || 'call.m4a');
        const t = { id: store.nextId('tr'), at: Date.now(), label: (u.searchParams.get('label') || 'Звонок').slice(0, 60), text: text.slice(0, 20000) };
        lead.transcripts = lead.transcripts || [];
        lead.transcripts.push(t);
        ai.pushEvent(db, { type: 'call', leadId: lead.id, text: `Транскрипт добавлен: ${lead.name} · ${t.label} (${Math.round(text.length / 1000)}k символов)` });
        store.save();
        return json(res, 200, t);
      } catch (e) {
        return json(res, 500, { error: e.message });
      }
    }

    if ((m = p.match(/^\/api\/leads\/([^/]+)\/summary$/)) && req.method === 'POST') {
      const lead = db.leads.find(l => l.id === m[1]);
      if (!lead) return json(res, 404, { error: 'not found' });
      let text = null;
      if (llm.available()) { try { text = await llm.summarize(db, lead); } catch (e) { console.error('[summary]', e.message); } }
      lead.summary = text || ai.buildSummary(db, lead);
      lead.summaryAt = Date.now();
      store.save();
      return json(res, 200, { summary: lead.summary, summaryAt: lead.summaryAt, viaLlm: !!text });
    }

    if ((m = p.match(/^\/api\/leads\/([^/]+)\/(note|contacts)$/)) && req.method === 'POST') {
      const lead = db.leads.find(l => l.id === m[1]);
      if (!lead) return json(res, 404, { error: 'not found' });
      const b = await readBody(req);
      if (m[2] === 'note') {
        const text = String(b.text || '').trim();
        if (text) {
          lead.notes = lead.notes || [];
          lead.notes.unshift({ id: store.nextId('nt'), at: Date.now(), text: text.slice(0, 2000) });
        }
      }
      if (m[2] === 'contacts') lead.contacts = (b.contacts || []).slice(0, 20).map(c => ({ kind: String(c.kind || 'other').slice(0, 20), value: String(c.value || '').slice(0, 200) })).filter(c => c.value);
      store.save();
      return json(res, 200, { notes: lead.notes, contacts: lead.contacts });
    }

    if ((m = p.match(/^\/api\/leads\/([^/]+)\/(message|inbound|handover|analyze)$/)) && req.method === 'POST') {
      const lead = db.leads.find(l => l.id === m[1]);
      if (!lead) return json(res, 404, { error: 'not found' });
      const b = await readBody(req);
      if (m[2] === 'message') {
        engine.send(db, lead, b.text || '', 'human');
        /* менеджер подхватил — ИИ на паузу (правило autoOff.onHumanReply) */
        if (db.settings.ai.autoOff.onHumanReply && lead.ai.enabled) {
          lead.ai.enabled = false;
          ai.pushEvent(db, { type: 'ai_off', leadId: lead.id, text: `${lead.name}: менеджер подхватил диалог — автопилот на паузе` });
        }
      }
      if (m[2] === 'inbound') engine.inbound(db, lead, b.text || '', { simulated: true });
      if (m[2] === 'handover') engine.handover(db, lead, b.brokerId);
      if (m[2] === 'analyze') { ai.screen(db, lead); if (lead.stage === 'qualified') lead.summary = ai.buildSummary(db, lead); }
      store.save();
      const msgs = db.messages.filter(x => x.leadId === lead.id).sort((a, b) => a.at - b.at);
      return json(res, 200, Object.assign(leadView(db, lead), { messages: msgs }));
    }

    /* ИИ первое касание: разбор лида + готовое персональное сообщение */
    if ((m = p.match(/^\/api\/leads\/([^/]+)\/first-touch$/)) && req.method === 'POST') {
      const lead = db.leads.find(l => l.id === m[1]);
      if (!lead) return json(res, 404, { error: 'not found' });
      if (!llm.available()) return json(res, 400, { error: 'нет ключей LLM' });
      const b = await readBody(req);
      try {
        const out = await llm.composeFirstTouch(db, lead, b.draft ? String(b.draft) : '', db.settings.agency.name);
        return json(res, 200, out);
      } catch (e) { return json(res, 500, { error: 'ИИ не справился: ' + e.message }); }
    }
    /* загрузка креатива объявления к лиду (для первого касания) */
    if ((m = p.match(/^\/api\/leads\/([^/]+)\/creative$/)) && req.method === 'POST') {
      const lead = db.leads.find(l => l.id === m[1]);
      if (!lead) return json(res, 404, { error: 'not found' });
      const extM = String(u.searchParams.get('filename') || '').match(/\.(jpe?g|png|webp|gif)$/i);
      if (!extM) return json(res, 400, { error: 'формат: jpg/png/webp/gif' });
      const chunks = []; let size = 0;
      await new Promise((resolve) => { req.on('data', (ch) => { size += ch.length; if (size > 12e6) req.destroy(); else chunks.push(ch); }); req.on('end', resolve); req.on('close', resolve); });
      if (!size || size > 12e6) return json(res, 400, { error: 'файл до 12 МБ' });
      fs.mkdirSync(path.join(PUBLIC, 'assets', 'creatives'), { recursive: true });
      const fname = `creatives/${lead.id}-${crypto.randomBytes(3).toString('hex')}.${extM[1].toLowerCase()}`;
      fs.writeFileSync(path.join(PUBLIC, 'assets', fname), Buffer.concat(chunks));
      lead.creativeUrl = '/assets/' + fname;
      store.save();
      return json(res, 200, { url: lead.creativeUrl });
    }

    if (p === '/api/wake/preview' && req.method === 'GET') {
      const filters = { geo: u.searchParams.get('geo') || null, stages: (u.searchParams.get('stages') || 'sleeping').split(','), olderDays: +(u.searchParams.get('olderDays') || 0) };
      return json(res, 200, engine.wakePreview(db, filters));
    }

    if (p === '/api/campaigns' && req.method === 'GET') return json(res, 200, db.campaigns);
    if (p === '/api/campaigns' && req.method === 'POST') {
      const b = await readBody(req);
      const cmp = {
        id: store.nextId('cmp'), name: b.name || 'Кампания', state: 'draft',
        filters: b.filters || { stages: ['sleeping'] }, batchSize: b.batchSize || 3,
        pauseMin: b.pauseMin || [20, 60], window: b.window || [10, 20],
        templateId: b.templateId || 'tpl_wake_ru', text: b.text || '',
        stats: { sent: 0, delivered: 0, replied: 0, qualified: 0, skipped: 0 },
        recipients: [], cursor: 0, log: [], createdAt: Date.now(), nextBatchAt: null,
      };
      db.campaigns.unshift(cmp); store.save();
      return json(res, 200, cmp);
    }
    if ((m = p.match(/^\/api\/campaigns\/([^/]+)\/(start|pause|resume|stop)$/)) && req.method === 'POST') {
      const cmp = db.campaigns.find(c => c.id === m[1]);
      if (!cmp) return json(res, 404, { error: 'not found' });
      if (m[2] === 'start') engine.startCampaign(db, cmp);
      if (m[2] === 'pause') { cmp.state = 'paused'; cmp.log.unshift({ at: Date.now(), text: 'Пауза' }); }
      if (m[2] === 'resume') { cmp.state = 'running'; cmp.nextBatchAt = Date.now() + 2000; cmp.log.unshift({ at: Date.now(), text: 'Продолжение' }); }
      if (m[2] === 'stop') { cmp.state = 'done'; cmp.log.unshift({ at: Date.now(), text: 'Остановлена вручную' }); }
      store.save();
      return json(res, 200, cmp);
    }

    if (p === '/api/brokers' && req.method === 'POST') {
      const b = await readBody(req);
      const name = String(b.name || '').trim() || 'Новый брокер';
      const br = {
        id: store.nextId('br'), name, geo: b.geo || db.settings.agency.geos[0],
        langs: (b.langs || ['ru']).slice(0, 6), load: 0, capacity: +b.capacity || 20, deals90: 0,
        avatar: name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase(),
        schedule: { days: [1, 2, 3, 4, 5, 6], from: '09:00', to: '20:00' },
      };
      db.brokers.push(br); store.save();
      return json(res, 200, br);
    }
    /* фото брокера: raw body ≤3МБ → assets/brokers/<id>.<ext>; DELETE — убрать */
    if ((m = p.match(/^\/api\/brokers\/([^/]+)\/photo$/)) && req.method === 'POST') {
      if (!getSession(req)) return json(res, 401, { error: 'auth' });
      const br = db.brokers.find(x => x.id === m[1]);
      if (!br) return json(res, 404, { error: 'not found' });
      const chunks = [];
      let size = 0;
      await new Promise((resolve) => {
        req.on('data', (c) => { size += c.length; if (size > 3e6) req.destroy(); else chunks.push(c); });
        req.on('end', resolve); req.on('close', resolve);
      });
      if (!size || size > 3e6) return json(res, 400, { error: 'файл до 3 МБ (JPG/PNG/WebP)' });
      const ct = req.headers['content-type'] || '';
      const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
      const dir = path.join(PUBLIC, 'assets', 'brokers');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, br.id + '.' + ext), Buffer.concat(chunks));
      br.photo = '/assets/brokers/' + br.id + '.' + ext + '?v=' + Date.now();
      store.save();
      return json(res, 200, { ok: true, photo: br.photo });
    }
    if ((m = p.match(/^\/api\/brokers\/([^/]+)\/photo$/)) && req.method === 'DELETE') {
      if (!getSession(req)) return json(res, 401, { error: 'auth' });
      const br = db.brokers.find(x => x.id === m[1]);
      if (!br) return json(res, 404, { error: 'not found' });
      br.photo = null;
      store.save();
      return json(res, 200, { ok: true });
    }
    if ((m = p.match(/^\/api\/brokers\/([^/]+)$/)) && req.method === 'DELETE') {
      if (db.brokers.length <= 1) return json(res, 400, { error: 'нельзя удалить последнего брокера' });
      for (const l of db.leads) if (l.broker === m[1]) l.broker = null;
      for (const mt of db.meetings || []) if (mt.brokerId === m[1]) mt.brokerId = db.brokers.find(x => x.id !== m[1]).id;
      db.brokers = db.brokers.filter(x => x.id !== m[1]);
      store.save();
      return json(res, 200, { ok: true });
    }
    if ((m = p.match(/^\/api\/brokers\/([^/]+)$/)) && req.method === 'PATCH') {
      const br = db.brokers.find(x => x.id === m[1]);
      if (!br) return json(res, 404, { error: 'not found' });
      const b = await readBody(req);
      if (b.name) { br.name = String(b.name).slice(0, 60); br.avatar = br.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase(); }
      if (b.geo) br.geo = b.geo;
      if (b.langs) br.langs = b.langs.slice(0, 6);
      if (b.schedule) {
        br.schedule = { days: (b.schedule.days || []).map(Number).filter(d => d >= 1 && d <= 7), from: String(b.schedule.from || '09:00'), to: String(b.schedule.to || '20:00') };
        /* пер-дневные интервалы: perDay[день 1..7] = {from,to} */
        if (b.schedule.perDay && typeof b.schedule.perDay === 'object') {
          br.schedule.perDay = {};
          for (const [d, t] of Object.entries(b.schedule.perDay)) {
            const dn = +d;
            if (dn >= 1 && dn <= 7 && t && /^\d{1,2}:\d{2}$/.test(String(t.from || '')) && /^\d{1,2}:\d{2}$/.test(String(t.to || ''))) br.schedule.perDay[dn] = { from: String(t.from), to: String(t.to) };
          }
        }
      }
      if (b.capacity != null) br.capacity = +b.capacity;
      /* поля публичной визитки брокера (/b/:id) */
      if (b.phone != null) br.phone = String(b.phone).slice(0, 40);
      if (b.email != null) br.email = String(b.email).slice(0, 80);
      if (b.title != null) br.title = String(b.title).slice(0, 80);
      if (b.bio != null) br.bio = String(b.bio).slice(0, 600);
      /* личный PIN для входа (роль broker); минимум 6 символов, уникальность против пароля владельца */
      if (b.pin) {
        const ph = sha(String(b.pin));
        if (String(b.pin).length < 6) return json(res, 400, { error: 'PIN короче 6 символов' });
        if (ph === db.settings.auth.passHash || db.brokers.some(x => x.id !== br.id && x.pinHash === ph)) return json(res, 400, { error: 'такой PIN уже занят' });
        br.pinHash = ph;
        audit(db, req, 'задан PIN брокеру', { broker: br.name });
      }
      /* kill-switch: отключение доступа + переназначение лидов + сброс сессий брокера */
      if (b.active === false && br.active !== false) {
        br.active = false;
        for (const [sid2, s2] of Object.entries(db.settings.auth.sessions)) if (s2.brokerId === br.id) delete db.settings.auth.sessions[sid2];
        const mine = db.leads.filter(l => l.broker === br.id && !['deal', 'lost'].includes(l.stage));
        const pool = db.brokers.filter(x => x.id !== br.id && x.active !== false);
        mine.forEach(l => { const nb = pool.sort((a2, b2) => a2.load - b2.load)[0]; l.broker = nb ? nb.id : null; if (nb) nb.load += 1; });
        br.load = 0;
        audit(db, req, `доступ отключён, ${mine.length} лидов переназначено`, { broker: br.name });
        ai.pushEvent(db, { type: 'ai_off', text: `Брокер ${br.name} отключён — ${mine.length} лидов переданы команде` });
      }
      if (b.active === true) { br.active = true; audit(db, req, 'доступ включён', { broker: br.name }); }
      store.save();
      return json(res, 200, br);
    }

    if ((m = p.match(/^\/api\/numbers\/([^/]+)$/)) && req.method === 'PATCH') {
      const num = db.numbers.find(n => n.id === m[1]);
      if (!num) return json(res, 404, { error: 'not found' });
      const b = await readBody(req);
      if (b.state) {
        num.state = b.state;
        if (b.state === 'warming') num.warmupDay = 1;
        ai.pushEvent(db, { type: 'number', text: `Номер ${num.phone}: ${b.state === 'quarantine' ? 'в карантин' : b.state === 'active' ? 'активирован' : 'на прогрев'}` });
      }
      if (b.dayLimit != null) num.dayLimit = +b.dayLimit;
      store.save();
      return json(res, 200, num);
    }

    if (p === '/api/sequences' && req.method === 'POST') {
      const b = await readBody(req);
      const seq = { id: store.nextId('seq'), name: String(b.name || 'Новая цепочка').slice(0, 80), geo: b.geo || 'all', active: false, steps: b.steps || [{ day: 0, channel: 'wa', mode: 'text', text: 'Здравствуйте, {name}! Это {agency} — вы оставляли заявку по {geo}. Подскажите, рассматриваете для жизни или как инвестицию?', label: 'Первое касание', active: true }] };
      db.sequences.push(seq); store.save();
      return json(res, 200, seq);
    }
    if ((m = p.match(/^\/api\/sequences\/([^/]+)$/)) && req.method === 'DELETE') {
      if (db.sequences.length <= 1) return json(res, 400, { error: 'нельзя удалить последнюю цепочку' });
      db.sequences = db.sequences.filter(s => s.id !== m[1]); store.save();
      return json(res, 200, { ok: true });
    }
    if ((m = p.match(/^\/api\/sequences\/([^/]+)$/)) && req.method === 'PATCH') {
      const seq = db.sequences.find(s => s.id === m[1]);
      if (!seq) return json(res, 404, { error: 'not found' });
      const b = await readBody(req);
      if (b.steps) seq.steps = b.steps.slice(0, 30);
      if (b.active != null) seq.active = b.active;
      if (b.name) seq.name = String(b.name).slice(0, 80);
      if (b.geo) seq.geo = b.geo;
      store.save();
      return json(res, 200, seq);
    }

    if (p === '/api/templates' && req.method === 'POST') {
      const b = await readBody(req);
      const tpl = { id: store.nextId('tpl'), name: b.name || 'Шаблон', category: b.category || 'utility', lang: b.lang || 'ru', status: 'pending', body: b.body || '' };
      db.templates.push(tpl); store.save();
      return json(res, 200, tpl);
    }
    if ((m = p.match(/^\/api\/templates\/([^/]+)$/)) && req.method === 'PATCH') {
      const tpl = db.templates.find(t => t.id === m[1]);
      if (!tpl) return json(res, 404, { error: 'not found' });
      Object.assign(tpl, await readBody(req)); store.save();
      return json(res, 200, tpl);
    }

    if (p === '/api/settings' && req.method === 'PATCH') {
      const b = await readBody(req);
      if (b.agency && b.agency.about) { Object.assign(db.settings.agency.about, b.agency.about); delete b.agency.about; }
      if (b.channels) {
        const ch = db.settings.channels;
        if (b.channels.priority) ch.priority = b.channels.priority.filter(x => ['wa', 'tg', 'viber', 'email'].includes(x));
        if (b.channels.enabled) Object.assign(ch.enabled, b.channels.enabled);
        for (const k2 of ['tg', 'viber', 'email']) if (b.channels[k2]) Object.assign(ch[k2], b.channels[k2]);
        if (b.channels.secondRound != null) ch.secondRound = b.channels.secondRound;
        delete b.channels;
      }
      if (b.reports) { const rp = db.settings.reports; if (b.reports.instant) { Object.assign(rp.instant, b.reports.instant); delete b.reports.instant; } Object.assign(rp, b.reports); delete b.reports; }
      for (const k of ['agency', 'wa', 'ai', 'demo', 'automations', 'telephony', 'voice', 'comments']) if (b[k]) Object.assign(db.settings[k], b[k]);
      if (b.social) { for (const k of ['ig', 'fb']) if (b.social[k]) { const c = db.settings.social[k]; if (b.social[k].token) c.token = String(b.social[k].token); if (b.social[k].enabled != null) c.enabled = !!b.social[k].enabled; if (b.social[k].igId != null) c.igId = String(b.social[k].igId); if (b.social[k].pageId != null) c.pageId = String(b.social[k].pageId); } }
      if (b.inventorySources && b.inventorySources.reelly) { const c = db.settings.inventorySources.reelly; const r = b.inventorySources.reelly; if (r.key) c.key = String(r.key); if (r.enabled != null) c.enabled = !!r.enabled; if (r.baseUrl != null) c.baseUrl = String(r.baseUrl); }
      if (b.stagesCfg) {
        const sc = db.settings.stagesCfg;
        if (b.stagesCfg.order) sc.order = b.stagesCfg.order.slice(0, 30).map(String);
        if (b.stagesCfg.names) sc.names = Object.fromEntries(Object.entries(b.stagesCfg.names).slice(0, 30).map(([k, v]) => [k, String(v).slice(0, 40)]));
        if (b.stagesCfg.custom) sc.custom = b.stagesCfg.custom.slice(0, 15).map(x => ({ id: String(x.id).slice(0, 30), name: String(x.name).slice(0, 40) }));
        if (b.stagesCfg.hidden) sc.hidden = b.stagesCfg.hidden.slice(0, 20).map(String);
      }
      if (b.customFields) db.settings.customFields = b.customFields.slice(0, 20).map(f => ({ key: String(f.key || '').slice(0, 40), label: String(f.label || '').slice(0, 60), type: f.type === 'select' ? 'select' : 'text', options: (f.options || []).slice(0, 20).map(String) })).filter(f => f.key && f.label);
      if (b.wa && b.wa.tokenSet === false) delete db.settings.wa.token; // явное отключение
      if (b.criteria) for (const g of Object.keys(b.criteria)) Object.assign(db.settings.criteria[g] = db.settings.criteria[g] || {}, b.criteria[g]);
      if (b.stopWords) db.settings.stopWords = b.stopWords;
      store.save();
      return json(res, 200, publicSettings(db));
    }

    /* ---------------- WhatsApp Cloud: живая проверка / шаблоны ---------------- */
    /* Проверка подключения по сохранённым реквизитам. Сохраняет отпечаток
       (номер/качество/срок токена) в settings.wa — UI показывает «зелёный». */
    if (p === '/api/wa/verify' && req.method === 'POST') {
      const r = await wa.verify(db);
      const w = db.settings.wa;
      if (r.ok) {
        w.verifiedAt = Date.now(); w.number = r.number || ''; w.quality = r.quality || '';
        w.tokenExpiresAt = r.tokenExpiresAt || 0; w.verifiedName = r.verifiedName || '';
      } else { w.verifiedAt = 0; }
      store.save();
      return json(res, 200, r);
    }
    /* Синк списка шаблонов из WABA (имя/статус модерации/категория/язык) */
    if (p === '/api/wa/templates' && req.method === 'GET') {
      try { const t = await wa.listTemplates(db); return json(res, 200, { ok: true, templates: t.map(x => ({ name: x.name, status: x.status, category: x.category, language: x.language })) }); }
      catch (e) { return json(res, 200, { ok: false, error: e.message }); }
    }
    /* Создать стартовый набор шаблонов первого касания (ru+en) в WABA */
    if (p === '/api/wa/templates/create' && req.method === 'POST') {
      const results = [];
      for (const def of STARTER_TEMPLATES) {
        try { const r = await wa.createTemplate(db, def); results.push({ name: def.name, lang: def.language, ok: true, id: r.id || null, status: r.status || 'PENDING' }); }
        catch (e) { results.push({ name: def.name, lang: def.language, ok: false, error: e.message }); }
      }
      audit(db, req, 'создал стартовые WhatsApp-шаблоны');
      return json(res, 200, { results });
    }

    /* ---------------- встречи ---------------- */
    if (p === '/api/meetings' && req.method === 'GET') {
      const list = (db.meetings || []).map(mt => Object.assign({}, mt, {
        leadName: (db.leads.find(l => l.id === mt.leadId) || {}).name || '—',
        brokerName: (db.brokers.find(x => x.id === mt.brokerId) || {}).name || '—',
      })).sort((a, b2) => a.at - b2.at);
      return json(res, 200, list);
    }
    if (p === '/api/meetings' && req.method === 'POST') {
      const b = await readBody(req);
      const lead = db.leads.find(l => l.id === b.leadId);
      if (!lead) return json(res, 400, { error: 'lead not found' });
      const broker = db.brokers.find(x => x.id === (b.brokerId || lead.broker)) || db.brokers.find(x => x.geo === lead.geo) || db.brokers[0];
      const mt = {
        id: store.nextId('mt'), leadId: lead.id, brokerId: broker.id,
        at: +b.at || Date.now() + 24 * 3600e3, kind: b.kind || 'call',
        note: b.note || '', status: 'scheduled', createdAt: Date.now(),
        /* видео-встреча: своя комната из коробки (Jitsi, работает в браузере без аккаунтов);
           Zoom API подключается сюда же при наличии кредов */
        link: b.link || (b.kind === 'video' ? `https://meet.jit.si/Lumen-${crypto.randomBytes(4).toString('hex')}-${lead.id.slice(-4)}` : null),
      };
      db.meetings = db.meetings || [];
      db.meetings.push(mt);
      if (b.confirm !== false) {
        const kindRu = { call: 'созвон', video: 'видео-показ', tour: 'показ объекта' }[mt.kind] || 'встреча';
        const when = new Date(mt.at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
        const base = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
        engine.send(db, lead, `${lead.name.split(' ')[0]}, подтверждаю: ${kindRu} с ${broker.name} — ${when}. Вся информация, напоминание и кнопка подключения: ${base}/m/${mt.id} Если время перестанет подходить, просто напишите сюда, перенесём.`, 'ai');
      }
      ai.pushEvent(db, { type: 'meeting', leadId: lead.id, text: `Встреча: ${lead.name} + ${broker.name} · ${new Date(mt.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` });
      store.save();
      return json(res, 200, mt);
    }
    if ((m = p.match(/^\/api\/meetings\/([^/]+)$/)) && req.method === 'PATCH') {
      const mt = (db.meetings || []).find(x => x.id === m[1]);
      if (!mt) return json(res, 404, { error: 'not found' });
      const b = await readBody(req);
      if (b.status) mt.status = b.status;
      if (b.at) { mt.at = +b.at; mt.reminded = false; mt.rem = {}; }
      if (b.status === 'no_show' && db.settings.automations.noShowMessage) {
        const lead = db.leads.find(l => l.id === mt.leadId);
        if (lead && !['deal', 'lost'].includes(lead.stage)) {
          lead.ai.enabled = true;
          engine.send(db, lead, `${lead.name.split(' ')[0]}, не получилось созвониться — ничего страшного. Предложить пару новых слотов или удобнее написать сюда, когда будете готовы?`, 'ai');
          ai.pushEvent(db, { type: 'meeting', leadId: lead.id, text: `${lead.name}: не пришёл на встречу — ИИ мягко возвращает в диалог` });
        }
      }
      store.save();
      return json(res, 200, mt);
    }

    /* ---------------- реклама: база объявлений + мэтчинг ---------------- */
    if (p === '/api/ads' && req.method === 'GET') {
      const QUAL = ['qualified', 'handover', 'viewing', 'deal'];
      const hasIn = (lid) => db.messages.some(x => x.leadId === lid && x.dir === 'in');
      const rate = (a, b) => b ? Math.round(a / b * 100) : 0;
      const stats = db.ads.map(ad => {
        const mine = db.leads.filter(l => l.ads && String(l.ads.adId) === String(ad.adId));
        const leads = mine.length;
        const dialogs = mine.filter(l => hasIn(l.id) || ['dialog', ...QUAL].includes(l.stage)).length;
        const qualified = mine.filter(l => QUAL.includes(l.stage)).length;
        const deals = mine.filter(l => l.stage === 'deal').length;
        const spend = +ad.spend || 0;
        return Object.assign({}, ad, {
          leads, dialogs, qualified, deals, spend,
          cpl: leads ? Math.round(spend / leads) : 0,
          cpa: deals ? Math.round(spend / deals) : 0,
          qualRate: rate(qualified, leads),
          dealRate: rate(deals, leads),
        });
      });
      const sum = (k) => stats.reduce((a, x) => a + (x[k] || 0), 0);
      const tLeads = sum('leads'), tQual = sum('qualified'), tDeals = sum('deals'), tSpend = sum('spend'), tDialogs = sum('dialogs');
      const totals = { ads: stats.length, leads: tLeads, dialogs: tDialogs, qualified: tQual, deals: tDeals, spend: tSpend,
        cpl: tLeads ? Math.round(tSpend / tLeads) : 0, cpa: tDeals ? Math.round(tSpend / tDeals) : 0,
        qualRate: rate(tQual, tLeads), dialogRate: rate(tDialogs, tLeads), dealRate: rate(tDeals, tLeads) };
      const geo = {};
      for (const ad of stats) { const g = ad.geo || '—'; geo[g] = geo[g] || { name: db.settings.geoNames[g] || g, leads: 0, qualified: 0, deals: 0, spend: 0 }; geo[g].leads += ad.leads; geo[g].qualified += ad.qualified; geo[g].deals += ad.deals; geo[g].spend += ad.spend; }
      const unmatched = db.leads.filter(l => l.ads && l.ads.adId && !l.ads.matched)
        .map(l => ({ leadId: l.id, name: l.name, adId: l.ads.adId }));
      return json(res, 200, { ads: stats, totals, geo, unmatched, intakeLog: db.intakeLog.slice(0, 30), hooks: { secret: db.settings.hooks.secret, outboundUrl: db.settings.hooks.outboundUrl } });
    }
    /* правка расхода по объявлению (для CPL/CPA) */
    if ((m = p.match(/^\/api\/ads\/([^/]+)\/spend$/)) && req.method === 'POST') {
      const b = await readBody(req);
      const ad = db.ads.find(a => String(a.adId) === String(m[1]));
      if (!ad) return json(res, 404, { error: 'not found' });
      ad.spend = Math.max(0, +b.spend || 0);
      store.save();
      return json(res, 200, { ok: true, spend: ad.spend });
    }
    if (p === '/api/ads/import' && req.method === 'POST') {
      const b = await readBody(req);
      /* принимаем rows: [{adId,name,adsetName,campaignName,geo}] ИЛИ csv-текст */
      let rows = b.rows || [];
      if (!rows.length && b.csv) {
        const lines = b.csv.split('\n').map(x => x.trim()).filter(Boolean);
        const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
        const head = lines[0].toLowerCase().split(sep).map(h => h.trim());
        const col = (names) => head.findIndex(h => names.some(n => h.includes(n)));
        const ci = { adId: col(['ad_id', 'adid', 'id объявления', 'ад id']), name: col(['name', 'объявлени', 'ad name']), adset: col(['adset', 'группа']), camp: col(['campaign', 'кампани']), geo: col(['geo', 'гео', 'направлени']) };
        for (const line of lines.slice(1)) {
          const c = line.split(sep).map(x => x.trim().replace(/^"|"$/g, ''));
          if (ci.adId < 0 || !c[ci.adId]) continue;
          const cip = col(['price', 'цена', 'от']);
          rows.push({ adId: c[ci.adId], name: ci.name >= 0 ? c[ci.name] : '', adsetName: ci.adset >= 0 ? c[ci.adset] : '', campaignName: ci.camp >= 0 ? c[ci.camp] : '', geo: ci.geo >= 0 ? (c[ci.geo] || '').toLowerCase() : '', priceFrom: cip >= 0 ? +String(c[cip]).replace(/\D/g, '') || 0 : 0 });
        }
      }
      let added = 0, updated = 0;
      for (const r of rows) {
        if (!r.adId) continue;
        const ex = db.ads.find(a => String(a.adId) === String(r.adId));
        if (ex) { Object.assign(ex, { name: r.name || ex.name, adsetName: r.adsetName || ex.adsetName, campaignName: r.campaignName || ex.campaignName, geo: r.geo || ex.geo }); updated++; }
        else { db.ads.push({ adId: String(r.adId), name: r.name || 'Объявление ' + r.adId, adsetName: r.adsetName || '', campaignName: r.campaignName || '', geo: r.geo || '', priceFrom: r.priceFrom || 0 }); added++; }
      }
      /* ре-мэтчинг всех лидов с атрибуцией */
      let rematched = 0;
      for (const l of db.leads) {
        if (l.ads && l.ads.adId) { const was = l.ads.matched; matchAd(db, l); if (!was && l.ads.matched) rematched++; }
      }
      ai.pushEvent(db, { type: 'merge', text: `База объявлений: +${added} новых, ${updated} обновлено, домэтчено лидов: ${rematched}` });
      store.save();
      return json(res, 200, { added, updated, rematched, total: db.ads.length });
    }
    if ((m = p.match(/^\/api\/ads\/([^/]+)$/)) && req.method === 'DELETE') {
      db.ads = db.ads.filter(a => String(a.adId) !== m[1]);
      store.save();
      return json(res, 200, { ok: true });
    }
    if (p === '/api/hooks' && req.method === 'PATCH') {
      const b = await readBody(req);
      if (b.outboundUrl !== undefined) db.settings.hooks.outboundUrl = String(b.outboundUrl).trim();
      if (b.rotateSecret) db.settings.hooks.secret = crypto.randomBytes(10).toString('hex');
      store.save();
      return json(res, 200, { secret: db.settings.hooks.secret, outboundUrl: db.settings.hooks.outboundUrl });
    }

    /* ---------------- объекты (библиотека) ---------------- */
    if (p === '/api/properties' && req.method === 'GET') return json(res, 200, db.properties);
    /* ---------------- ИМПОРТ ИНВЕНТАРЯ ОБЪЕКТОВ ---------------- */
    if (p === '/api/properties/import' && req.method === 'POST') {
      const b = await readBody(req);
      const defaults = b.defaults || {};
      let r;
      if (b.source === 'reelly') r = await inventory.importReelly(db, defaults);
      else if (b.json != null) { let arr; try { arr = typeof b.json === 'string' ? JSON.parse(b.json) : b.json; } catch (e) { return json(res, 400, { error: 'битый JSON: ' + e.message }); } r = inventory.importJson(db, arr, defaults); }
      else if (b.csv != null) r = inventory.importTable(db, b.csv, defaults);
      else return json(res, 400, { error: 'нужен csv, json или source:reelly' });
      if (r.error) return json(res, 400, r);
      store.save();
      return json(res, 200, r);
    }
    if (p === '/api/properties/bulk' && req.method === 'POST') {
      const b = await readBody(req);
      const ids = Array.isArray(b.ids) ? b.ids : [];
      const targets = db.properties.filter(x => ids.includes(x.id));
      let done = 0;
      for (const pr of targets) {
        if (b.action === 'folder') { pr.folderId = b.value || null; done++; }
        else if (b.action === 'tag' && b.value) { pr.tags = [...new Set([...(pr.tags || []), String(b.value).slice(0, 40)])]; done++; }
        else if (b.action === 'geo' && b.value) { pr.geo = String(b.value); done++; }
        else if (b.action === 'market' && b.value) { pr.market = b.value === 'secondary' ? 'secondary' : 'offplan'; done++; }
        else if (b.action === 'delete') { done++; }
      }
      if (b.action === 'delete') db.properties = db.properties.filter(x => !ids.includes(x.id));
      store.save();
      return json(res, 200, { ok: true, done });
    }
    if (p === '/api/properties' && req.method === 'POST') {
      const b = await readBody(req);
      const pr = { id: store.nextId('pr'), name: b.name || 'Объект', area: b.area || '', developer: b.developer || '', market: b.market === 'secondary' ? 'secondary' : 'offplan', type: b.type || '', beds: +b.beds || 0, priceFrom: +b.priceFrom || 0, currency: b.currency || 'USD', handover: b.handover || '', payment: b.payment || '', geo: b.geo || 'dubai', tags: b.tags || [], materials: [], note: b.note || '' };
      db.properties.push(pr); store.save();
      return json(res, 200, pr);
    }
    if ((m = p.match(/^\/api\/properties\/([^/]+)$/))) {
      const pr = db.properties.find(x => x.id === m[1]);
      if (!pr) return json(res, 404, { error: 'not found' });
      if (req.method === 'PATCH') {
        const b = await readBody(req);
        for (const k of ['name', 'area', 'developer', 'market', 'type', 'handover', 'payment', 'geo', 'note', 'currency']) if (b[k] !== undefined) pr[k] = b[k];
        for (const k of ['beds', 'priceFrom']) if (b[k] !== undefined) pr[k] = +b[k];
        if (b.tags) pr.tags = b.tags;
        if (b.materials) pr.materials = b.materials.slice(0, 20).map(x => ({ label: String(x.label || '').slice(0, 60), url: String(x.url || '').slice(0, 500) })).filter(x => x.url);
        if (b.images) pr.images = b.images.slice(0, 20).map(String);
        if (b.description !== undefined) pr.description = String(b.description).slice(0, 3000);
        if (b.amenities) pr.amenities = b.amenities.slice(0, 30).map(x => String(x).slice(0, 40));
        if (b.units) pr.units = b.units.slice(0, 40).map(u => ({ plan: String(u.plan || '').slice(0, 30), area: String(u.area || '').slice(0, 20), floor: String(u.floor || '').slice(0, 15), price: +u.price || 0, view: String(u.view || '').slice(0, 40) }));
        if (b.hookTitle !== undefined) pr.hookTitle = String(b.hookTitle).slice(0, 160);
        if (b.roi !== undefined) pr.roi = String(b.roi).slice(0, 40);
        if (b.appreciation !== undefined) pr.appreciation = String(b.appreciation).slice(0, 40);
        if (b.district) pr.district = { name: String(b.district.name || '').slice(0, 60), blurb: String(b.district.blurb || '').slice(0, 500), times: (b.district.times || []).slice(0, 5).map(t => ({ min: +t.min || 0, place: String(t.place || '').slice(0, 60) })) };
        if (b.paymentRows) pr.paymentRows = (b.paymentRows || []).slice(0, 4).map(r2 => ({ pct: String(r2.pct || '').slice(0, 8), label: String(r2.label || '').slice(0, 60) }));
        if (b.whyRent) pr.whyRent = (b.whyRent || []).slice(0, 4).map(x => String(x).slice(0, 300));
        if (b.folderId !== undefined) pr.folderId = b.folderId || null;
        if (b.layouts) pr.layouts = b.layouts.slice(0, 20).map(x => ({ label: String(x.label || '').slice(0, 60), url: String(x.url || '').slice(0, 500) })).filter(x => x.url);
        store.save();
        return json(res, 200, pr);
      }
      if (req.method === 'DELETE') { db.properties = db.properties.filter(x => x.id !== pr.id); store.save(); return json(res, 200, { ok: true }); }
    }
    /* подсказка объектов под лида: гео + бюджет ±30% + тип */
    if ((m = p.match(/^\/api\/leads\/([^/]+)\/suggest-properties$/)) && req.method === 'GET') {
      const lead = db.leads.find(l => l.id === m[1]);
      if (!lead) return json(res, 404, { error: 'not found' });
      const budget = (lead.quals.budget || {}).num || null;
      const typeStr = ((lead.quals.type || {}).value || '').toLowerCase();
      const list = db.properties
        .filter(pr => pr.geo === lead.geo)
        .map(pr => {
          let score = 0;
          if (budget && pr.priceFrom) { const r = pr.priceFrom / budget; if (r >= 0.7 && r <= 1.3) score += 2; else if (r < 0.7) score += 1; }
          if (typeStr && (typeStr.includes('вилл') ? /villa|вилл/i.test(pr.type + pr.name) : typeStr.includes('студи') ? /studio/i.test(pr.type) : /br/i.test(pr.type))) score += 1;
          return { pr, score };
        })
        .sort((a, b) => b.score - a.score)
        .map(x => Object.assign({ matchScore: x.score }, x.pr));
      return json(res, 200, list);
    }

    /* ---------------- папки (объекты и подборки) ---------------- */
    if (p === '/api/folders' && req.method === 'GET') {
      return json(res, 200, db.folders.map(f => Object.assign({}, f, {
        count: f.kind === 'prop' ? db.properties.filter(x => x.folderId === f.id).length : db.collections.filter(x => x.folderId === f.id).length,
      })));
    }
    if (p === '/api/folders' && req.method === 'POST') {
      const b = await readBody(req);
      const f = { id: store.nextId('fd'), name: String(b.name || 'Папка').slice(0, 60), kind: b.kind === 'coll' ? 'coll' : 'prop' };
      db.folders.push(f); store.save();
      return json(res, 200, f);
    }
    if ((m = p.match(/^\/api\/folders\/([^/]+)$/)) && req.method === 'PATCH') {
      const f = db.folders.find(x => x.id === m[1]);
      if (!f) return json(res, 404, { error: 'not found' });
      const b = await readBody(req);
      if (b.name) f.name = String(b.name).slice(0, 60);
      store.save();
      return json(res, 200, f);
    }
    if ((m = p.match(/^\/api\/folders\/([^/]+)$/)) && req.method === 'DELETE') {
      for (const x of db.properties) if (x.folderId === m[1]) x.folderId = null;
      for (const x of db.collections) if (x.folderId === m[1]) x.folderId = null;
      db.folders = db.folders.filter(x => x.id !== m[1]);
      store.save();
      return json(res, 200, { ok: true });
    }
    if ((m = p.match(/^\/api\/collections\/([^/]+)$/)) && req.method === 'PATCH') {
      const c = db.collections.find(x => x.id === m[1]);
      if (!c) return json(res, 404, { error: 'not found' });
      const b = await readBody(req);
      if (b.folderId !== undefined) c.folderId = b.folderId || null;
      if (b.title) c.title = String(b.title).slice(0, 200);
      store.save();
      return json(res, 200, c);
    }

    /* ---------------- подборки ---------------- */
    if (p === '/api/collections' && req.method === 'GET') {
      return json(res, 200, db.collections.map(c => Object.assign({}, c, { leadName: (db.leads.find(l => l.id === c.leadId) || {}).name || null, editKey: db.settings.hooks.secret })));
    }
    if (p === '/api/collections/bulk' && req.method === 'POST') {
      const b = await readBody(req);
      const ids = Array.isArray(b.ids) ? b.ids : [];
      let done = 0;
      if (b.action === 'folder') { for (const c of db.collections) if (ids.includes(c.id)) { c.folderId = b.value || null; done++; } }
      else if (b.action === 'delete') { const before = db.collections.length; db.collections = db.collections.filter(c => !ids.includes(c.id)); done = before - db.collections.length; }
      store.save();
      return json(res, 200, { ok: true, done });
    }
    if (p === '/api/collections' && req.method === 'POST') {
      const b = await readBody(req);
      const c = { id: crypto.randomBytes(5).toString('hex'), leadId: b.leadId || null, title: b.title || 'Подборка', intro: String(b.intro || '').slice(0, 1500), propertyIds: (b.propertyIds || []).slice(0, 30), createdAt: Date.now(), views: 0 };
      db.collections.unshift(c); store.save();
      return json(res, 200, c);
    }
    if ((m = p.match(/^\/api\/collections\/([^/]+)\/send$/)) && req.method === 'POST') {
      const c = db.collections.find(x => x.id === m[1]);
      if (!c || !c.leadId) return json(res, 400, { error: 'нет лида' });
      const lead = db.leads.find(l => l.id === c.leadId);
      const url = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/p/${c.id}`;
      engine.send(db, lead, `${lead.name.split(' ')[0]}, собрал для вас подборку под ваш запрос — посмотрите: ${url} Внутри ${c.propertyIds.length} вариант(а) с ценами и условиями. Что откликается — обсудим.`, 'human');
      ai.pushEvent(db, { type: 'msg_in', leadId: lead.id, text: `Подборка «${c.title}» отправлена в чат: ${lead.name}` });
      store.save();
      return json(res, 200, { ok: true, url });
    }
    /* конструктор v2: сохранение блочной композиции */
    if ((m = p.match(/^\/p\/([a-f0-9]+)\/blocks$/)) && req.method === 'POST') {
      if (u.searchParams.get('key') !== db.settings.hooks.secret) return json(res, 403, { error: 'bad key' });
      const c = db.collections.find(x => x.id === m[1]);
      if (!c) return json(res, 404, { error: 'not found' });
      const b = await readBody(req);
      const blocks = sanitizeBlocks(b.blocks);
      if (!blocks) return json(res, 400, { error: 'bad blocks' });
      /* история для undo/redo: прошлое состояние в стек, redo-ветка сгорает */
      c.histBack = c.histBack || [];
      c.histBack.push({ at: Date.now(), blocks: c.blocks || [], theme: c.theme || null });
      if (c.histBack.length > 40) c.histBack.shift();
      c.histFwd = [];
      c.blocks = blocks;
      if (b.theme && PAGE_THEMES[b.theme]) c.theme = b.theme;
      const cover = blocks.find(x => x.t === 'cover');
      if (cover && cover.data.title) c.title = cover.data.title.slice(0, 200);
      store.save();
      return json(res, 200, { ok: true, count: blocks.length, undo: c.histBack.length, redo: 0 });
    }
    /* конструктор v2: undo / redo поверх серверной истории */
    if ((m = p.match(/^\/p\/([a-f0-9]+)\/(undo|redo)$/)) && req.method === 'POST') {
      if (u.searchParams.get('key') !== db.settings.hooks.secret) return json(res, 403, { error: 'bad key' });
      const c = db.collections.find(x => x.id === m[1]);
      if (!c) return json(res, 404, { error: 'not found' });
      c.histBack = c.histBack || []; c.histFwd = c.histFwd || [];
      const [from, to] = m[2] === 'undo' ? [c.histBack, c.histFwd] : [c.histFwd, c.histBack];
      if (!from.length) return json(res, 400, { error: m[2] === 'undo' ? 'нечего отменять' : 'нечего повторять' });
      to.push({ at: Date.now(), blocks: c.blocks || [], theme: c.theme || null });
      if (to.length > 40) to.shift();
      const s2 = from.pop();
      c.blocks = s2.blocks;
      if (s2.theme) c.theme = s2.theme;
      store.save();
      return json(res, 200, { ok: true, undo: c.histBack.length, redo: c.histFwd.length });
    }
    /* конструктор v2: именованные версии */
    if ((m = p.match(/^\/p\/([a-f0-9]+)\/version$/)) && req.method === 'POST') {
      if (u.searchParams.get('key') !== db.settings.hooks.secret) return json(res, 403, { error: 'bad key' });
      const c = db.collections.find(x => x.id === m[1]);
      if (!c) return json(res, 404, { error: 'not found' });
      const b = await readBody(req);
      c.versions = c.versions || [];
      if (b.op === 'save') {
        const name = String(b.name || '').trim().slice(0, 60) || ('Версия ' + (c.versions.length + 1));
        c.versions.push({ id: store.nextId('cv'), name, at: Date.now(), blocks: c.blocks || [], theme: c.theme || null });
        if (c.versions.length > 20) c.versions.shift();
      } else if (b.op === 'apply') {
        const v2 = c.versions.find(x => x.id === b.vid);
        if (!v2) return json(res, 404, { error: 'версия не найдена' });
        c.histBack = c.histBack || [];
        c.histBack.push({ at: Date.now(), blocks: c.blocks || [], theme: c.theme || null });
        if (c.histBack.length > 40) c.histBack.shift();
        c.histFwd = [];
        c.blocks = v2.blocks;
        if (v2.theme) c.theme = v2.theme;
      } else if (b.op === 'del') {
        c.versions = c.versions.filter(x => x.id !== b.vid);
      } else return json(res, 400, { error: 'bad op' });
      store.save();
      return json(res, 200, { ok: true, versions: c.versions.map(v3 => ({ id: v3.id, name: v3.name, at: v3.at })) });
    }
    /* конструктор v2: загрузка картинки/видео (raw body, до 25МБ) */
    if ((m = p.match(/^\/p\/([a-f0-9]+)\/asset$/)) && req.method === 'POST') {
      if (u.searchParams.get('key') !== db.settings.hooks.secret) return json(res, 403, { error: 'bad key' });
      const c = db.collections.find(x => x.id === m[1]);
      if (!c) return json(res, 404, { error: 'not found' });
      const extM = String(u.searchParams.get('filename') || '').match(/\.(jpe?g|png|webp|gif|mp4|webm)$/i);
      if (!extM) return json(res, 400, { error: 'формат: jpg/png/webp/gif/mp4/webm' });
      const chunks = [];
      let size = 0;
      await new Promise((resolve) => {
        req.on('data', (ch) => { size += ch.length; if (size > 25e6) req.destroy(); else chunks.push(ch); });
        req.on('end', resolve); req.on('close', resolve);
      });
      if (!size || size > 25e6) return json(res, 400, { error: 'файл до 25 МБ' });
      fs.mkdirSync(path.join(PUBLIC, 'assets', 'coll'), { recursive: true });
      const fname = `coll/${c.id}-${crypto.randomBytes(4).toString('hex')}.${extM[1].toLowerCase()}`;
      fs.writeFileSync(path.join(PUBLIC, 'assets', fname), Buffer.concat(chunks));
      return json(res, 200, { url: '/assets/' + fname });
    }
    /* конструктор v2: ИИ-генерация картинки (OpenAI gpt-image-1) → сохраняем в общую библиотеку */
    if ((m = p.match(/^\/p\/([a-f0-9]+)\/ai-image$/)) && req.method === 'POST') {
      if (u.searchParams.get('key') !== db.settings.hooks.secret) return json(res, 403, { error: 'bad key' });
      if (!llm.hasImage()) return json(res, 400, { error: 'нет OPENAI_API_KEY для генерации картинок' });
      const b = await readBody(req);
      const pr = String(b.prompt || '').trim();
      if (!pr) return json(res, 400, { error: 'опишите картинку' });
      /* обогащаем промпт под стиль подборки недвижимости, если пользователь дал только короткое описание */
      const style = b.raw ? '' : ', premium real-estate photography, cinematic natural light, elegant, high-end, photoreal, no text, no watermark, no logo';
      try {
        const buf = await llm.generateImage(pr + style, { size: b.size || '1536x1024', quality: b.quality || 'medium' });
        fs.mkdirSync(path.join(PUBLIC, 'assets', 'lib'), { recursive: true });
        const fname = `lib/ai-${crypto.randomBytes(5).toString('hex')}.png`;
        fs.writeFileSync(path.join(PUBLIC, 'assets', fname), buf);
        return json(res, 200, { url: '/assets/' + fname });
      } catch (e) { return json(res, 500, { error: 'ИИ-картинка не удалась: ' + e.message }); }
    }
    /* конструктор v2: ИИ-сборка текстов подборки из контекста лида */
    if ((m = p.match(/^\/p\/([a-f0-9]+)\/compose$/)) && req.method === 'POST') {
      if (u.searchParams.get('key') !== db.settings.hooks.secret) return json(res, 403, { error: 'bad key' });
      const c = db.collections.find(x => x.id === m[1]);
      if (!c) return json(res, 404, { error: 'not found' });
      if (!llm.available()) return json(res, 400, { error: 'нет ключей LLM' });
      const props = (c.propertyIds || []).map(id => db.properties.find(x => x.id === id)).filter(Boolean);
      const lead = db.leads.find(l => l.id === c.leadId) || null;
      try {
        const out = await llm.composeCollection(db, c, props, lead);
        const blocks = collBlocks(c).map(b => JSON.parse(JSON.stringify(b)));
        let projI = 0;
        for (const b of blocks) {
          if (b.t === 'cover' && out.title) b.data.title = out.title;
          if (b.t === 'hello' && out.intro) b.data.intro = out.intro;
          if (b.t === 'proj') {
            /* модель может вернуть id не дословно — фолбэк по порядку объектов */
            const pp = out.props.find(x => x.id === b.data.pid) || out.props[projI];
            projI += 1;
            if (pp) { if (pp.hook) b.data.hookTitle = pp.hook; if (pp.why && pp.why.length) b.data.whyRent = pp.why; }
          }
        }
        c.blocks = sanitizeBlocks(blocks) || c.blocks;
        if (out.title) c.title = out.title.slice(0, 200);
        store.save();
        return json(res, 200, { ok: true });
      } catch (e) {
        console.error('[compose]', e.message);
        return json(res, 500, { error: 'ИИ не собрал тексты: ' + e.message });
      }
    }
    /* конструктор: сохранение правок (ключ = hooks.secret) */
    if ((m = p.match(/^\/p\/([a-f0-9]+)\/custom$/)) && req.method === 'POST') {
      if (u.searchParams.get('key') !== db.settings.hooks.secret) return json(res, 403, { error: 'bad key' });
      const c = db.collections.find(x => x.id === m[1]);
      if (!c) return json(res, 404, { error: 'not found' });
      const b = await readBody(req);
      c.custom = {
        hidden: (b.hidden || []).slice(0, 10).map(String),
        order: (b.order || []).slice(0, 30).map(String),
        title: b.title ? String(b.title).slice(0, 200) : null,
        intro: b.intro != null ? String(b.intro).slice(0, 2000) : null,
        props: {},
      };
      for (const [pid, ov] of Object.entries(b.props || {})) {
        c.custom.props[pid] = {};
        if (ov.hookTitle) c.custom.props[pid].hookTitle = String(ov.hookTitle).slice(0, 200);
        if (ov.blurb) c.custom.props[pid].blurb = String(ov.blurb).slice(0, 600);
        if (ov.whyRent) c.custom.props[pid].whyRent = ov.whyRent.slice(0, 4).map(x => String(x).slice(0, 300));
      }
      store.save();
      return json(res, 200, { ok: true });
    }
    /* трекинг глубины просмотра (sendBeacon, без авторизации) */
    if ((m = p.match(/^\/p\/([a-f0-9]+)\/track$/)) && req.method === 'POST') {
      const c = db.collections.find(x => x.id === m[1]);
      if (!c) return json(res, 200, { ok: true });
      const b = await readBody(req);
      const a = c.analytics = c.analytics || { maxDepth: 0, totalTime: 0, deepSessions: 0, lastAt: null };
      const depth = Math.min(100, Math.max(0, +b.depth || 0));
      const dt = Math.min(60, Math.max(0, +b.dt || 0));
      a.totalTime += dt;
      a.lastAt = Date.now();
      if (depth > a.maxDepth) a.maxDepth = depth;
      if (b.deep && !a['s_' + b.sid]) {
        a['s_' + b.sid] = 1;
        a.deepSessions += 1;
        if (c.leadId) {
          const vl = db.leads.find(l => l.id === c.leadId);
          if (vl) ai.pushEvent(db, { type: 'view', leadId: vl.id, text: `${vl.name} изучил подборку «${c.title}» на ${depth}% (${Math.round(a.totalTime / 60)} мин) — горячий интерес` });
        }
      }
      store.save();
      return json(res, 200, { ok: true });
    }
    if ((m = p.match(/^\/api\/collections\/([^/]+)$/)) && req.method === 'DELETE') {
      db.collections = db.collections.filter(x => x.id !== m[1]); store.save();
      return json(res, 200, { ok: true });
    }
    if (p === '/api/portals' && req.method === 'PATCH') {
      const b = await readBody(req);
      for (const [k, v] of Object.entries(b)) if (db.settings.portals[k] && typeof v === 'object') { if (v.key !== undefined) { db.settings.portals[k].key = String(v.key); db.settings.portals[k].status = v.key ? 'key_saved' : 'off'; } }
      store.save();
      return json(res, 200, db.settings.portals);
    }

    /* ---------------- импорт базы (CSV из Bitrix/amo + Bitrix24 API) ---------------- */
    if (p === '/api/import/csv' && req.method === 'POST') {
      const b = await readBody(req);
      const lines = String(b.csv || '').split('\n').map(x => x.trim()).filter(Boolean);
      if (lines.length < 2) return json(res, 400, { error: 'нужен заголовок и хотя бы одна строка' });
      const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
      const head = lines[0].toLowerCase().split(sep).map(h => h.trim().replace(/^"|"$/g, ''));
      const col = (names) => head.findIndex(h => names.some(n => h.includes(n)));
      const ci = {
        name: col(['name', 'имя', 'фио', 'контакт', 'title', 'название']),
        phone: col(['phone', 'телефон', 'тел', 'mobile', 'моб']),
        email: col(['mail', 'почта']),
        stage: col(['stage', 'status', 'стади', 'статус', 'этап']),
        note: col(['comment', 'коммент', 'примечан', 'note', 'описан']),
        budget: col(['budget', 'бюджет', 'opportunity', 'сумма']),
        geo: col(['geo', 'гео', 'направлен', 'город', 'регион']),
      };
      if (ci.phone < 0) return json(res, 400, { error: 'не найдена колонка телефона (phone/телефон)' });
      const norm = (ph) => String(ph || '').replace(/\D/g, '').replace(/^8(\d{10})$/, '7$1');
      const defaults = b.defaults || {};
      let created = 0, merged = 0, skipped = 0;
      for (const line of lines.slice(1)) {
        const c = line.split(sep).map(x => x.trim().replace(/^"|"$/g, ''));
        const phone = c[ci.phone];
        if (!phone || norm(phone).length < 8) { skipped++; continue; }
        const ex = db.leads.find(l => norm(l.phone) === norm(phone));
        const noteTxt = ci.note >= 0 && c[ci.note] ? c[ci.note].slice(0, 1500) : '';
        const email = ci.email >= 0 ? c[ci.email] : '';
        if (ex) {
          merged++;
          if (noteTxt) { ex.notes = ex.notes || []; ex.notes.unshift({ id: store.nextId('nt'), at: Date.now(), text: '[импорт] ' + noteTxt }); }
          if (email && !(ex.contacts || []).some(x => x.kind === 'email')) (ex.contacts = ex.contacts || []).push({ kind: 'email', value: email });
          continue;
        }
        const lead = {
          id: store.nextId('ld'), name: (ci.name >= 0 && c[ci.name]) || phone, phone,
          geo: (ci.geo >= 0 && (c[ci.geo] || '').toLowerCase().match(/dubai|дубай/) ? 'dubai' : null) || defaults.geo || db.settings.agency.geos[0],
          lang: 'ru', tz: 4, stage: defaults.stage || 'sleeping', score: 0, source: 'import',
          createdAt: Date.now(), lastMsgAt: null, lastDir: null,
          quals: { purpose: null, timeline: null, budget: null, type: null },
          ai: { enabled: !!defaults.aiOn, chainStep: 99, nextTouchAt: null, silentSince: null },
          broker: null, summary: noteTxt || null, tags: ['импорт'], numberId: null,
          contacts: email ? [{ kind: 'email', value: email }] : [], notes: [], custom: {}, transcripts: [],
          channels: { wa: 'unknown', tg: 'unknown', viber: 'unknown', email: email ? 'yes' : 'unknown' }, activeChannel: 'wa', avatarUrl: null,
        };
        if (ci.budget >= 0 && c[ci.budget]) {
          const n = +String(c[ci.budget]).replace(/\D/g, '');
          if (n > 1000) lead.quals.budget = { value: '$' + n.toLocaleString('ru-RU'), num: n, quote: 'из импорта' };
        }
        if (ci.stage >= 0 && c[ci.stage]) lead.tags.push('было: ' + c[ci.stage].slice(0, 30));
        db.leads.push(lead);
        created++;
      }
      ai.pushEvent(db, { type: 'merge', text: `Импорт базы: +${created} лидов, обогащено дублей: ${merged}, пропущено: ${skipped}` });
      store.save();
      return json(res, 200, { created, merged, skipped });
    }
    if (p === '/api/import/bitrix' && req.method === 'POST') {
      const b = await readBody(req);
      const url = String(b.webhookUrl || '').replace(/\/$/, '');
      if (!/^https:\/\/.+\/rest\/\d+\/\w+$/.test(url)) return json(res, 400, { error: 'формат: https://домен.bitrix24.ru/rest/1/КОД' });
      let start = 0, created = 0, merged = 0, total = 0;
      const norm = (ph) => String(ph || '').replace(/\D/g, '').replace(/^8(\d{10})$/, '7$1');
      try {
        for (let page = 0; page < 40; page++) {
          const r2 = await fetch(`${url}/crm.lead.list.json?start=${start}&select[]=TITLE&select[]=NAME&select[]=LAST_NAME&select[]=PHONE&select[]=EMAIL&select[]=STATUS_ID&select[]=COMMENTS&select[]=OPPORTUNITY`);
          const j = await r2.json();
          if (j.error) throw new Error(j.error_description || j.error);
          const rows = j.result || [];
          for (const row of rows) {
            total++;
            const phone = ((row.PHONE || [])[0] || {}).VALUE;
            if (!phone) continue;
            if (db.leads.find(l => norm(l.phone) === norm(phone))) { merged++; continue; }
            const email = ((row.EMAIL || [])[0] || {}).VALUE;
            db.leads.push({
              id: store.nextId('ld'), name: [row.NAME, row.LAST_NAME].filter(Boolean).join(' ') || row.TITLE || phone, phone,
              geo: (b.defaults || {}).geo || db.settings.agency.geos[0], lang: 'ru', tz: 4,
              stage: (b.defaults || {}).stage || 'sleeping', score: 0, source: 'bitrix24',
              createdAt: Date.now(), lastMsgAt: null, lastDir: null,
              quals: { purpose: null, timeline: null, budget: +row.OPPORTUNITY > 1000 ? { value: '$' + (+row.OPPORTUNITY).toLocaleString('ru-RU'), num: +row.OPPORTUNITY, quote: 'из Bitrix24' } : null, type: null, timeline: null, purpose: null },
              ai: { enabled: false, chainStep: 99, nextTouchAt: null, silentSince: null },
              broker: null, summary: (row.COMMENTS || '').replace(/<[^>]+>/g, '').slice(0, 1000) || null,
              tags: ['импорт', 'bitrix24', row.STATUS_ID ? 'было: ' + row.STATUS_ID : ''].filter(Boolean), numberId: null,
              contacts: email ? [{ kind: 'email', value: email }] : [], notes: [], custom: {}, transcripts: [],
              channels: { wa: 'unknown', tg: 'unknown', viber: 'unknown', email: email ? 'yes' : 'unknown' }, activeChannel: 'wa', avatarUrl: null,
            });
            created++;
          }
          if (j.next == null) break;
          start = j.next;
        }
      } catch (e) { return json(res, 500, { error: 'Bitrix24: ' + e.message, created, merged }); }
      ai.pushEvent(db, { type: 'merge', text: `Импорт из Bitrix24: +${created} из ${total}, дублей: ${merged}` });
      store.save();
      return json(res, 200, { created, merged, total });
    }

    /* ---------------- дубли ---------------- */
    if (p === '/api/duplicates' && req.method === 'GET') {
      const norm = (ph) => (ph || '').replace(/\D/g, '').replace(/^8(\d{10})$/, '7$1');
      const byPhone = {};
      for (const l of db.leads) {
        const k = norm(l.phone);
        if (!k) continue;
        (byPhone[k] = byPhone[k] || []).push(l);
      }
      const groups = Object.values(byPhone).filter(g => g.length > 1)
        .map(g => g.sort((a, b2) => a.createdAt - b2.createdAt).map(l => leadView(db, l)));
      return json(res, 200, groups);
    }
    if (p === '/api/duplicates/merge' && req.method === 'POST') {
      const b = await readBody(req); // {keepId, mergeIds:[]}
      const keep = db.leads.find(l => l.id === b.keepId);
      if (!keep) return json(res, 400, { error: 'keep not found' });
      let moved = 0;
      for (const id of b.mergeIds || []) {
        const dup = db.leads.find(l => l.id === id);
        if (!dup || dup.id === keep.id) continue;
        for (const msg of db.messages) if (msg.leadId === dup.id) { msg.leadId = keep.id; moved++; }
        for (const a of ai.AXES) if (!keep.quals[a] && dup.quals[a]) keep.quals[a] = dup.quals[a];
        keep.tags = [...new Set([...(keep.tags || []), ...(dup.tags || []), 'объединён'])];
        if ((dup.lastMsgAt || 0) > (keep.lastMsgAt || 0)) { keep.lastMsgAt = dup.lastMsgAt; keep.lastDir = dup.lastDir; }
        db.leads = db.leads.filter(l => l.id !== dup.id);
      }
      ai.screen(db, keep);
      ai.pushEvent(db, { type: 'merge', leadId: keep.id, text: `Дубли объединены в «${keep.name}» (перенесено сообщений: ${moved})` });
      store.save();
      return json(res, 200, leadView(db, keep));
    }

    if (p === '/api/marketdata' && req.method === 'GET') return json(res, 200, MARKET);
    if (p === '/api/playbook' && req.method === 'GET') return json(res, 200, playbook.PLAYBOOK);
    if (p === '/api/events' && req.method === 'GET') return json(res, 200, db.events.slice(0, 60));
    if (p === '/api/analytics' && req.method === 'GET') return json(res, 200, analytics(db));
    if (p === '/api/demo/reset' && req.method === 'POST') { store.reset(seed); return json(res, 200, { ok: true }); }

    /* ================= печатное расписание встреч недели: /meetings/print?w=N ================= */
    if (p === '/meetings/print' && req.method === 'GET') {
      if (!getSession(req)) { res.writeHead(302, { Location: '/' }); res.end(); return; }
      const w = +(u.searchParams.get('w') || 0);
      const now = new Date();
      const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + w * 7);
      const end = new Date(+mon + 7 * 864e5);
      const AG = db.settings.agency;
      const KIND = { call: 'Созвон', video: 'Видео-показ', tour: 'Показ объекта' };
      const ST = { scheduled: 'назначена', done: 'прошла', no_show: 'не пришёл', canceled: 'отменена' };
      const list = (db.meetings || []).filter(mt => mt.at >= +mon && mt.at < +end).sort((a, b2) => a.at - b2.at);
      const byDay = {};
      for (const mt of list) {
        const d = new Date(mt.at).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
        (byDay[d] = byDay[d] || []).push(mt);
      }
      const fmtT = t => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(`<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Встречи недели — ${esc(AG.name || '')}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter Tight',-apple-system,sans-serif;color:#1A2233;background:#F4F7FB;font-size:13.5px;line-height:1.5}
.page{max-width:760px;margin:26px auto;background:#fff;border-radius:14px;padding:40px 44px;box-shadow:0 10px 40px rgba(16,43,92,.08)}
.hd{display:flex;align-items:center;gap:12px;padding-bottom:16px;border-bottom:2px solid #102B5C}
.hd img{height:30px}.hd b{font-size:16px;color:#102B5C}
.hd .r{margin-left:auto;text-align:right;font-size:11px;color:#66738F}
h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#102B5C;margin:22px 0 8px}
.mt{display:flex;gap:14px;padding:9px 0;border-bottom:1px solid #E3E9F4;page-break-inside:avoid}
.mt .t{flex:0 0 46px;font-weight:800;color:#102B5C}
.mt .k{flex:0 0 110px;color:#66738F;font-size:12px;padding-top:1px}
.mt b{font-weight:650}
.mt .who{color:#66738F;font-size:12px}
.mt .st{margin-left:auto;font-size:11px;font-weight:700;padding:2px 10px;border-radius:9px;background:#EEF2F9;color:#3D4A63;align-self:center}
.mt .st.done{background:#E4F5EC;color:#0E7A52}.mt .st.no_show{background:#FBE9E7;color:#B3261E}
.empty{color:#66738F;padding:20px 0}
.toolbar{position:fixed;top:14px;right:14px}
.toolbar button{background:#2563EB;color:#fff;border:none;border-radius:10px;padding:10px 18px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}
@media print{body{background:#fff}.page{box-shadow:none;margin:0;padding:8mm 10mm;max-width:none;border-radius:0}.toolbar{display:none}}
</style></head><body>
<div class="toolbar"><button onclick="window.print()">Печать / PDF</button></div>
<div class="page">
  <div class="hd">${AG.logo ? `<img src="${esc(AG.logo)}">` : ''}<b>${esc(AG.name || 'Агентство')}</b>
    <span class="r">Встречи недели<br>${mon.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} — ${new Date(+end - 864e5).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span></div>
  ${Object.keys(byDay).length ? Object.entries(byDay).map(([day, items]) => `<h2>${esc(day)}</h2>` + items.map(mt => {
    const lead = db.leads.find(l => l.id === mt.leadId) || {};
    const br = db.brokers.find(b2 => b2.id === mt.brokerId) || {};
    return `<div class="mt"><span class="t">${fmtT(mt.at)}</span><span class="k">${KIND[mt.kind] || 'Встреча'}</span>
      <span><b>${esc(lead.name || '—')}</b> <span class="who">${esc(lead.phone || '')} · эксперт: ${esc(br.name || '—')}</span></span>
      <span class="st ${mt.status}">${ST[mt.status] || mt.status}</span></div>`;
  }).join('')).join('') : '<div class="empty">На этой неделе встреч нет</div>'}
</div></body></html>`);
      return;
    }

    /* ================= печатная карточка лида (экспорт/PDF): /lead/:id/print ================= */
    if ((m = p.match(/^\/lead\/(ld_[\w]+)\/print$/)) && req.method === 'GET') {
      if (!getSession(req)) { res.writeHead(302, { Location: '/' }); res.end(); return; }
      const lead = db.leads.find(l => l.id === m[1]);
      if (!lead) { res.writeHead(404); res.end('lead not found'); return; }
      const AG = db.settings.agency;
      const namesCfg = (db.settings.stagesCfg && db.settings.stagesCfg.names) || {};
      const STAGE_RU = Object.assign({ new: 'Новый', touch: 'Первое касание', dialog: 'В диалоге с ИИ', qualified: 'Квалифицирован', handover: 'У брокера', viewing: 'Показ / Zoom', deal: 'Сделка', sleeping: 'Спящий', lost: 'Потерян' }, namesCfg);
      const broker = db.brokers.find(b => b.id === lead.broker);
      const AXN = { purpose: 'Цель', timeline: 'Срок', budget: 'Бюджет', type: 'Тип объекта' };
      const dt = (t) => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      /* хронология: сообщения + комментарии + встречи в одну ленту */
      const feed = [];
      for (const msg of db.messages) if (msg.leadId === lead.id) feed.push({ at: msg.at, kind: msg.dir === 'in' ? 'in' : (msg.via === 'ai' ? 'ai' : 'out'), text: msg.text });
      for (const n of lead.notes || []) feed.push({ at: n.at, kind: 'note', text: n.text, who: n.who });
      for (const mt of db.meetings || []) if (mt.leadId === lead.id) feed.push({ at: mt.at, kind: 'meet', text: ({ call: 'Созвон', video: 'Видео-показ', tour: 'Показ объекта' }[mt.kind] || 'Встреча') + ' · ' + ({ scheduled: 'назначена', done: 'прошла', no_show: 'не пришёл', canceled: 'отменена' }[mt.status] || mt.status) });
      feed.sort((a, b2) => a.at - b2.at);
      const KIND_RU = { in: 'Клиент', ai: 'Lumen AI', out: 'Менеджер', note: 'Комментарий', meet: 'Встреча' };
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(`<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Карточка лида — ${esc(lead.name)}</title>
<style>
:root{--navy:#102B5C;--ink:#1A2233;--mut:#66738F;--line:#E3E9F4;--blue:#2563EB}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter Tight',-apple-system,'Segoe UI',sans-serif;color:var(--ink);background:#F4F7FB;font-size:13.5px;line-height:1.55}
.page{max-width:800px;margin:26px auto;background:#fff;border-radius:14px;padding:44px 48px;box-shadow:0 10px 40px rgba(16,43,92,.08)}
.hd{display:flex;align-items:center;gap:14px;padding-bottom:20px;border-bottom:2px solid var(--navy)}
.hd img{height:34px}
.hd .ag{font-weight:800;font-size:17px;color:var(--navy);letter-spacing:.04em}
.hd .doc{margin-left:auto;text-align:right;font-size:11px;color:var(--mut)}
h1{font-size:24px;margin:24px 0 2px;color:var(--navy)}
.sub{color:var(--mut);font-size:13px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 26px;margin:20px 0 6px}
.kv{display:flex;justify-content:space-between;gap:14px;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px}
.kv i{font-style:normal;color:var(--mut)}
.kv b{text-align:right}
h2{font-size:13px;letter-spacing:.09em;text-transform:uppercase;color:var(--navy);margin:26px 0 10px}
.ax{border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin-bottom:8px}
.ax b{font-size:13px}
.ax .q{color:var(--mut);font-size:12px;margin-top:2px;font-style:italic}
.sum{background:#EFF4FE;border:1px solid #D5E2FA;border-radius:10px;padding:13px 16px;font-size:13px}
.fi{display:flex;gap:12px;padding:7px 0;border-bottom:1px solid var(--line);font-size:12.5px;page-break-inside:avoid}
.fi .t{flex:0 0 92px;color:var(--mut);font-size:11px;padding-top:2px}
.fi .w{flex:0 0 86px;font-weight:700;font-size:11px;padding-top:2px}
.fi.in .w{color:#0E7A52}.fi.ai .w{color:var(--blue)}.fi.note .w{color:#8A5A00}.fi.meet .w{color:#7B3FBF}
.tags{margin-top:8px}.tag{display:inline-block;background:#EEF2F9;border-radius:8px;padding:2px 10px;font-size:11px;color:#3D4A63;margin:0 6px 6px 0}
.ft{margin-top:28px;padding-top:14px;border-top:1px solid var(--line);display:flex;justify-content:space-between;color:var(--mut);font-size:11px}
.toolbar{position:fixed;top:14px;right:14px;display:flex;gap:8px}
.toolbar button{background:var(--blue);color:#fff;border:none;border-radius:10px;padding:10px 18px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;box-shadow:0 6px 20px rgba(37,99,235,.35)}
.toolbar .g{background:#fff;color:var(--ink);border:1px solid var(--line)}
@media print{body{background:#fff}.page{box-shadow:none;margin:0;border-radius:0;padding:10mm 12mm;max-width:none}.toolbar{display:none}}
</style></head><body>
<div class="toolbar"><button class="g" onclick="history.back()">← Назад</button><button onclick="window.print()">Печать / PDF</button></div>
<div class="page">
  <div class="hd">${AG.logo ? `<img src="${esc(AG.logo)}" alt="">` : ''}<span class="ag">${esc(AG.name || 'Агентство')}</span>
    <span class="doc">Карточка лида<br>${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
  <h1>${esc(lead.name)}</h1>
  <div class="sub">${esc(lead.phone || '')}${lead.geo ? ' · ' + esc((db.settings.geoNames || {})[lead.geo] || lead.geo) : ''} · ${esc(STAGE_RU[lead.stage] || lead.stage)} · скоринг ${lead.score || 0}</div>
  <div class="grid">
    <div class="kv"><i>Источник</i><b>${esc(lead.source || '—')}</b></div>
    <div class="kv"><i>Создан</i><b>${dt(lead.createdAt)}</b></div>
    <div class="kv"><i>Брокер</i><b>${esc(broker ? broker.name : '—')}</b></div>
    <div class="kv"><i>Объявление</i><b>${esc(lead.ads && (lead.ads.adName || lead.ads.adId) || '—')}</b></div>
    ${(lead.contacts || []).map(ct => `<div class="kv"><i>${esc(ct.kind)}</i><b>${esc(ct.value)}</b></div>`).join('')}
  </div>
  <h2>Квалификация</h2>
  ${Object.keys(AXN).map(a => { const q = lead.quals[a]; return `<div class="ax"><b>${AXN[a]}: ${q ? esc(q.value) : '—'}</b>${q && q.quote ? `<div class="q">«${esc(q.quote)}»</div>` : ''}</div>`; }).join('')}
  ${lead.summary ? `<h2>Саммари для брокера</h2><div class="sum">${esc(lead.summary)}</div>` : ''}
  ${(lead.tags || []).length ? `<div class="tags">${lead.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
  <h2>Хронология · ${feed.length}</h2>
  ${feed.map(f2 => `<div class="fi ${f2.kind}"><span class="t">${dt(f2.at)}</span><span class="w">${KIND_RU[f2.kind]}</span><span>${esc(String(f2.text || '').slice(0, 600))}</span></div>`).join('') || '<div class="sub">Событий нет</div>'}
  <div class="ft"><span>Сформировано в Lumen AI CRM</span><span>${esc(lead.id)}</span></div>
</div>
</body></html>`);
      return;
    }

    /* ================= публичная визитка брокера: /b/:id ================= */
    if ((m = p.match(/^\/b\/(br_[\w]+)$/)) && req.method === 'GET') {
      const br = db.brokers.find(x => x.id === m[1]);
      if (!br) { res.writeHead(404); res.end('not found'); return; }
      const AG = db.settings.agency.name;
      const logo = db.settings.agency.logo;
      const LN = { ru: 'Русский', en: 'Английский', ar: 'Арабский', id: 'Индонезийский', es: 'Испанский', de: 'Немецкий', fr: 'Французский', it: 'Итальянский', zh: 'Китайский', pt: 'Португальский', tr: 'Турецкий', fa: 'Персидский' };
      const geoName = db.settings.geoNames[br.geo] || br.geo || '';
      const title = br.title || ('Эксперт по недвижимости' + (geoName ? ' · ' + geoName : ''));
      const waDigits = (br.phone || '').replace(/\D/g, '');
      const initials = br.avatar || (br.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
      const brandTop = logo ? `<img src="${esc(logo)}" style="max-height:40px;max-width:150px;object-fit:contain">` : `<span style="font-family:Fraunces,serif;font-size:20px;font-weight:600">${esc(AG)}</span>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(`<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(br.name)} — ${esc(AG)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Manrope,sans-serif;min-height:100vh;background:#061126;color:#fff;display:grid;place-items:center;padding:20px;position:relative;overflow-x:hidden;-webkit-font-smoothing:antialiased}
body::before{content:'';position:fixed;inset:0;background:radial-gradient(600px 420px at 18% 8%,rgba(37,99,235,.28),transparent 60%),radial-gradient(700px 520px at 88% 92%,rgba(91,43,216,.22),transparent 60%)}
.card{position:relative;max-width:430px;width:100%;background:rgba(10,24,51,.72);backdrop-filter:blur(16px);border:1px solid rgba(122,158,255,.2);border-radius:24px;padding:30px 28px 26px;box-shadow:0 30px 80px rgba(0,0,0,.5)}
.top{display:flex;justify-content:center;margin-bottom:22px}
.ava{width:104px;height:104px;border-radius:50%;margin:0 auto 16px;display:grid;place-items:center;font-size:34px;font-weight:700;background:linear-gradient(150deg,#2563EB,#5B2BD8);border:2px solid rgba(134,175,255,.35);overflow:hidden;box-shadow:0 12px 34px -10px rgba(37,99,235,.6)}
.ava img{width:100%;height:100%;object-fit:cover}
.nm{font-family:Fraunces,serif;font-size:27px;font-weight:600;text-align:center;letter-spacing:-.01em}
.ttl{text-align:center;font-size:13px;color:#9DB8FF;margin-top:6px;letter-spacing:.02em}
.tags{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;margin:16px 0 6px}
.tag{font-size:11.5px;font-weight:600;color:#CFE0FF;background:rgba(134,175,255,.13);border:1px solid rgba(134,175,255,.2);padding:5px 11px;border-radius:20px}
.bio{font-size:13.5px;line-height:1.6;color:#B9C7E8;text-align:center;margin:16px 4px 4px}
.btns{margin-top:22px;display:flex;flex-direction:column;gap:10px}
.btn{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;border:none;border-radius:13px;padding:15px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;text-decoration:none;color:#fff}
.b-wa{background:linear-gradient(120deg,#22A45B,#12855F)}
.b-call{background:linear-gradient(120deg,#2563EB,#5B2BD8)}
.b-ghost{background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.15);color:#CFE0FF}
.foot{margin-top:22px;text-align:center;font-size:11px;color:#5E6E96}
.hd{display:flex;justify-content:center;margin-bottom:20px}
</style></head><body>
<div class="card">
  <div class="hd">${brandTop}</div>
  <div class="ava">${br.photo ? `<img src="${esc(br.photo)}" alt="">` : esc(initials)}</div>
  <div class="nm">${esc(br.name)}</div>
  <div class="ttl">${esc(title)}</div>
  <div class="tags">${geoName ? `<span class="tag">📍 ${esc(geoName)}</span>` : ''}${(br.langs || []).map(l => `<span class="tag">${esc(LN[l] || l)}</span>`).join('')}</div>
  ${br.bio ? `<div class="bio">${esc(br.bio)}</div>` : ''}
  <div class="btns">
    ${waDigits ? `<a class="btn b-wa" href="https://wa.me/${waDigits}" target="_blank">Написать в WhatsApp</a>` : ''}
    ${br.phone ? `<a class="btn b-call" href="tel:${esc(br.phone.replace(/[^\d+]/g, ''))}">Позвонить</a>` : ''}
    ${br.email ? `<a class="btn b-ghost" href="mailto:${esc(br.email)}">${esc(br.email)}</a>` : ''}
  </div>
  <div class="foot">${esc(AG)}</div>
</div></body></html>`);
      return;
    }

    /* ================= страница встречи для клиента: /m/:id ================= */
    if ((m = p.match(/^\/m\/(mt_[\w]+)$/)) && req.method === 'GET') {
      const mt = (db.meetings || []).find(x => x.id === m[1]);
      if (!mt) { res.writeHead(404); res.end('not found'); return; }
      const lead = db.leads.find(l => l.id === mt.leadId) || {};
      const broker = db.brokers.find(b => b.id === mt.brokerId) || {};
      const AG = db.settings.agency.name;
      const logo = db.settings.agency.logo;
      mt.pageViews = (mt.pageViews || 0) + 1;
      if (mt.pageViews === 1 && lead.id) ai.pushEvent(db, { type: 'view', leadId: lead.id, text: `${lead.name} открыл страницу встречи — помнит и готовится` });
      store.save();
      const kindRu = { call: 'Созвон', video: 'Видео-показ', tour: 'Показ объекта' }[mt.kind] || 'Встреча';
      const dt = new Date(mt.at);
      const when = dt.toLocaleString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
      const gcalDate = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      const gcal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(kindRu + ' · ' + AG)}&dates=${gcalDate(mt.at)}/${gcalDate(mt.at + 3600e3)}&details=${encodeURIComponent((broker.name ? 'Эксперт: ' + broker.name + '. ' : '') + (mt.link ? 'Видеовстреча: ' + mt.link : ''))}`;
      const star2 = logo ? `<img src="${esc(logo)}" style="max-width:170px;max-height:64px;object-fit:contain">` : '<svg viewBox="0 0 100 120" style="width:34px;height:41px"><path fill="#fff" d="M50 0 C54.5 37 66 52 93 60 C66 68 54.5 83 50 120 C45.5 83 34 68 7 60 C34 52 45.5 37 50 0 Z"/></svg>';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${kindRu} · ${esc(AG)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Inter,sans-serif;min-height:100vh;background:#061126;color:#fff;display:grid;place-items:center;padding:20px;position:relative;overflow-x:hidden}
body::before{content:'';position:fixed;inset:0;background:radial-gradient(600px 400px at 20% 10%,rgba(37,99,235,.25),transparent 60%),radial-gradient(700px 500px at 85% 90%,rgba(91,43,216,.2),transparent 60%)}
.card{position:relative;max-width:440px;width:100%;background:rgba(10,24,51,.75);backdrop-filter:blur(14px);border:1px solid rgba(122,158,255,.2);border-radius:22px;padding:34px 30px;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.5)}
.brand{display:flex;justify-content:center;align-items:center;gap:10px;margin-bottom:26px;font-weight:700;letter-spacing:.06em}
.kind{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#9DB8FF;margin-bottom:10px}
h1{font-size:25px;font-weight:800;line-height:1.25}
.when{margin-top:16px;font-size:17px;font-weight:700;color:#CFE0FF;text-transform:capitalize}
.cd{display:flex;gap:10px;justify-content:center;margin:22px 0}
.cd div{background:rgba(255,255,255,.07);border:1px solid rgba(122,158,255,.2);border-radius:12px;padding:10px 0;width:74px}
.cd b{font-size:22px;font-weight:800;display:block}
.cd span{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#8FA3C8}
.who{font-size:13.5px;color:#B9C7E8;margin-bottom:22px}
.note{font-size:13px;color:#8FA3C8;margin-bottom:18px;white-space:pre-line}
.btn{display:block;width:100%;border:none;border-radius:12px;padding:15px;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit;margin-top:10px;text-decoration:none;color:#fff}
.b-video{background:linear-gradient(120deg,#2563EB,#5B2BD8)}
.b-ok{background:rgba(35,179,131,.18);border:1.5px solid rgba(35,179,131,.5);color:#7BE8C3}
.b-ok.done{background:rgba(35,179,131,.35);pointer-events:none}
.b-ghost{background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.15);color:#CFE0FF;font-weight:650}
.cal-row{display:flex;gap:10px;margin-top:14px}
.cal-row a{flex:1;font-size:12.5px;padding:12px}
.foot{margin-top:22px;font-size:11px;color:#5E6E96}
@media(max-width:420px){.cd div{width:64px}}
</style></head><body>
<div class="card">
  <div class="brand">${star2}${logo ? '' : esc(AG)}</div>
  <div class="kind">${kindRu}</div>
  <h1>${esc(lead.name ? lead.name.split(' ')[0] + ', ждём вас' : 'Ждём вас')}</h1>
  <div class="when">${esc(when)}</div>
  <div class="cd" id="cd"><div><b id="cdD">–</b><span>дней</span></div><div><b id="cdH">–</b><span>часов</span></div><div><b id="cdM">–</b><span>минут</span></div></div>
  <div class="who">${broker.name ? 'Ваш эксперт — <b>' + esc(broker.name) + '</b>' : ''}${mt.note ? `<div class="note" style="margin-top:10px">${esc(mt.note)}</div>` : ''}</div>
  ${mt.link ? `<a class="btn b-video" href="${esc(mt.link)}" target="_blank">▶ Подключиться к видеовстрече</a>` : ''}
  <button class="btn b-ok ${mt.clientConfirmed ? 'done' : ''}" id="okBtn">${mt.clientConfirmed ? '✓ Вы подтвердили участие' : 'Подтвердить участие'}</button>
  <button class="btn b-ghost" id="moveBtn">Попросить перенос</button>
  <div class="cal-row">
    <a class="btn b-ghost" href="${gcal}" target="_blank">+ Google Календарь</a>
    <a class="btn b-ghost" href="/m/${mt.id}/ics">+ iPhone / Outlook</a>
  </div>
  <div class="foot">${esc(AG)}${broker.phone ? ' · ' + esc(broker.phone) : ''}</div>
</div>
<script>
const AT=${mt.at};
const tick=()=>{const d=Math.max(0,AT-Date.now());document.getElementById('cdD').textContent=Math.floor(d/864e5);document.getElementById('cdH').textContent=Math.floor(d%864e5/36e5);document.getElementById('cdM').textContent=Math.floor(d%36e5/6e4);};
tick();setInterval(tick,15000);
document.getElementById('okBtn').addEventListener('click',async(e)=>{await fetch('/m/${mt.id}/confirm',{method:'POST'});e.target.textContent='✓ Вы подтвердили участие';e.target.classList.add('done');});
document.getElementById('moveBtn').addEventListener('click',async(e)=>{await fetch('/m/${mt.id}/reschedule',{method:'POST'});e.target.textContent='Передали менеджеру — свяжемся с вами';e.target.disabled=true;});
</${'script'}></body></html>`);
      return;
    }
    if ((m = p.match(/^\/m\/(mt_[\w]+)\/confirm$/)) && req.method === 'POST') {
      const mt = (db.meetings || []).find(x => x.id === m[1]);
      if (mt && !mt.clientConfirmed) {
        mt.clientConfirmed = true;
        const lead = db.leads.find(l => l.id === mt.leadId);
        if (lead) ai.pushEvent(db, { type: 'meeting', leadId: lead.id, text: `${lead.name} подтвердил встречу со страницы — придёт` });
        store.save();
      }
      return json(res, 200, { ok: true });
    }
    if ((m = p.match(/^\/m\/(mt_[\w]+)\/reschedule$/)) && req.method === 'POST') {
      const mt = (db.meetings || []).find(x => x.id === m[1]);
      if (mt) {
        const lead = db.leads.find(l => l.id === mt.leadId);
        if (lead) {
          lead.tags = [...new Set([...(lead.tags || []), 'нужен человек'])];
          ai.pushEvent(db, { type: 'meeting', leadId: lead.id, text: `⚠️ ${lead.name} просит перенести встречу — свяжитесь и предложите слоты` });
        }
        store.save();
      }
      return json(res, 200, { ok: true });
    }
    if ((m = p.match(/^\/m\/(mt_[\w]+)\/ics$/)) && req.method === 'GET') {
      const mt = (db.meetings || []).find(x => x.id === m[1]);
      if (!mt) { res.writeHead(404); res.end(); return; }
      const broker = db.brokers.find(b => b.id === mt.brokerId) || {};
      const kindRu = { call: 'Созвон', video: 'Видео-показ', tour: 'Показ объекта' }[mt.kind] || 'Встреча';
      const fmtT = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="meeting.ics"' });
      res.end(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lumen CRM//RU', 'BEGIN:VEVENT',
        `UID:${mt.id}@lumen`, `DTSTAMP:${fmtT(Date.now())}`, `DTSTART:${fmtT(mt.at)}`, `DTEND:${fmtT(mt.at + 3600e3)}`,
        `SUMMARY:${kindRu} · ${db.settings.agency.name}`,
        `DESCRIPTION:${(broker.name ? 'Эксперт: ' + broker.name + '. ' : '') + (mt.link ? 'Видео: ' + mt.link : '')}`,
        mt.link ? `URL:${mt.link}` : '', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n'));
      return;
    }

    if ((m = p.match(/^\/p\/([a-f0-9]+)$/)) && req.method === 'GET') {
      const c = db.collections.find(x => x.id === m[1]);
      if (!c) { res.writeHead(404); res.end('not found'); return; }
      c.views = (c.views || 0) + 1;
      if (c.leadId && (!c.lastViewAt || Date.now() - c.lastViewAt > 10 * 60e3)) {
        const vl = db.leads.find(l => l.id === c.leadId);
        if (vl) ai.pushEvent(db, { type: 'view', leadId: vl.id, text: `${vl.name} открыл подборку «${c.title}» — лучший момент для звонка` });
      }
      c.lastViewAt = Date.now();
      store.save();
      const isEdit = u.searchParams.get('edit') === '1' && u.searchParams.get('key') === db.settings.hooks.secret;
      const isPrint = u.searchParams.get('print') === '1';
      const cust = c.custom || {};
      const blocks = collBlocks(c);
      const lead = db.leads.find(l => l.id === c.leadId);
      const mgr = db.settings.agency.manager || {};
      const about = db.settings.agency.about || {};
      const AG = db.settings.agency.name;
      const prById = (pid) => db.properties.find(x => x.id === pid);
      const projBlocks = blocks.filter(b => b.t === 'proj' && prById(b.data.pid));
      const fmt = (n, cur) => (cur === 'EUR' ? '€' : '$') + (n || 0).toLocaleString('ru-RU');
      const minPrice = Math.min(...projBlocks.map(b => prById(b.data.pid).priceFrom || Infinity));
      const heroImg = projBlocks.map(b => ((prById(b.data.pid) || {}).images || [])[0]).find(Boolean) || '';
      const plural = (n) => n % 10 === 1 && n % 100 !== 11 ? 'проект' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'проекта' : 'проектов';
      const nProj = projBlocks.length + ' ' + plural(projBlocks.length);
      const hasBlocks = Array.isArray(c.blocks) && c.blocks.length > 0;
      const cTitle = hasBlocks ? c.title : (cust.title || c.title);   /* legacy custom — только до первого сохранения блоков */
      const cIntro = hasBlocks ? c.intro : (cust.intro != null ? cust.intro : c.intro);
      const theme = PAGE_THEMES[c.theme] || PAGE_THEMES.klein;
      const star = db.settings.agency.logo
        ? `<img class="star" src="${esc(db.settings.agency.logo)}" style="width:auto;max-width:150px;height:44px;object-fit:contain">`
        : '<svg class="star" viewBox="0 0 100 120"><path fill="#fff" d="M50 0 C54.5 37 66 52 93 60 C66 68 54.5 83 50 120 C45.5 83 34 68 7 60 C34 52 45.5 37 50 0 Z"/></svg>';

      /* --- edit-хелперы: text=data-be, img=data-bimg, list-item append=pedit --- */
      const be = (bid, f, idx) => isEdit ? ` data-be="${bid}:${f}${idx != null ? ':' + idx : ''}"` : '';
      const abs = (u2) => u2 && /^assets\//.test(u2) ? '/' + u2 : u2;   /* страница живёт на /p/… — пути только абсолютные */
      const bg = (url) => url ? `style="background-image:url('${esc(abs(url))}')"` : '';
      const bimg = (bid, f, idx, url) => isEdit ? ` data-bimg="${bid}:${f}${idx != null ? ':' + idx : ''}" data-bival="${esc(url || '')}"` : '';
      const ytId = (url) => { const mm = String(url || '').match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,20})/); return mm ? mm[1] : null; };
      const vimeoId = (url) => { const mm = String(url || '').match(/vimeo\.com\/(\d{6,12})/); return mm ? mm[1] : null; };

      let pageNo = 0;
      const R = {
        cover(b) {
          const d = b.data;
          const title = d.title || cTitle;
          const img = d.img || heroImg;
          const badge = d.badge || (isFinite(minPrice) ? 'от ' + fmt(minPrice, (prById((projBlocks[0] || { data: {} }).data.pid) || {}).currency) : '');
          const inner = `
  <div class="brand">${star}<span${be(b.id, 'brandName')}>${esc(d.brandName || AG)}</span></div>
  <h1${be(b.id, 'title')}>${esc(title)}</h1>
  ${d.sub || isEdit ? `<p class="csub"${be(b.id, 'sub')}>${esc(d.sub || '')}</p>` : ''}
  ${badge || isEdit ? `<div class="badge"${be(b.id, 'badge')}>${esc(badge)}</div>` : ''}`;
          if (b.v === 'split') return `<section class="cover csplit"><div class="cs-l blue">${inner}</div><div class="cs-r" ${bg(img)}>${isEdit ? `<div class="imghot" ${bimg(b.id, 'img', null, img)}>🖼 Заменить</div>` : ''}</div></section>`;
          if (b.v === 'photo') return `<section class="cover cphoto" ${bg(img)}><div class="cshade"></div><div class="cin">${inner}<div class="csp"></div></div>${isEdit ? `<div class="imghot" ${bimg(b.id, 'img', null, img)}>🖼 Заменить</div>` : ''}</section>`;
          if (b.v === 'light') return `<section class="cover clight">${inner.replace('class="brand"', 'class="brand dark"')}${img ? `<div class="coverimg" ${bg(img)}>${isEdit ? `<div class="imghot" ${bimg(b.id, 'img', null, img)}>🖼 Заменить</div>` : ''}</div>` : ''}</section>`;
          return `<section class="cover blue">${inner}${img ? `<div class="coverimg" ${bg(img)}>${isEdit ? `<div class="imghot" ${bimg(b.id, 'img', null, img)}>🖼 Заменить</div>` : ''}</div>` : `<div class="coverimg grad"><span>${esc(nProj)}</span></div>`}</section>`;
        },
        hello(b) {
          const d = b.data;
          const defText = `${mgr.name ? '' : AG + ' — '}${about.intro || 'мы подбираем недвижимость под задачу клиента.'}${lead ? ` Эта подборка собрана персонально для вас${lead.name ? ', ' + lead.name.split(' ')[0] : ''}.` : ''}`;
          const bullets = d.bullets || about.bullets || [];
          const intro = d.intro != null ? d.intro : (cIntro || '');
          return `<section class="pg">
  <h2 class="hi"${be(b.id, 'heading')}>${esc(d.heading || 'Привет!')}</h2>
  <div class="hello">
    <p><b${be(b.id, 'lede')}>${esc(d.lede || (mgr.name ? 'Меня зовут ' + mgr.name + ',' : ''))}</b> <span${be(b.id, 'text')}>${esc(d.text || defText)}</span></p>
    <div class="mgrph" ${d.photo ? bg(d.photo) : ''}>${d.photo ? '' : esc((mgr.name || AG).split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase())}${isEdit ? `<div class="imghot" ${bimg(b.id, 'photo', null, d.photo)}>🖼 Заменить</div>` : ''}</div>
  </div>
  <h2 class="hi h2sm"${be(b.id, 'aboutHeading')}>${esc(d.aboutHeading || 'Об агентстве')}</h2>
  <div class="arrows" data-plist="${b.id}:bullets">${bullets.map((b2, bi) => `<div><i>↳</i><span${be(b.id, 'bullets', bi)}>${esc(b2).replace(/^([^:—]+[:—])/, '<b>$1</b>')}</span></div>`).join('')}</div>
  ${intro || isEdit ? `<div class="intro"${be(b.id, 'intro')}>${esc(intro)}</div>` : ''}
  <div class="pnum">${String(++pageNo + 1).padStart(2, '0')}</div>
</section>`;
        },
        sep(b) {
          const d = b.data;
          const img = d.img || heroImg;
          const cls = b.v === 'light' ? 'sep slight' : b.v === 'photo' ? 'sep sphoto' : 'sep blue';
          return `<section class="${cls}" ${b.v === 'photo' ? bg(img) : ''}>${b.v === 'photo' ? '<div class="cshade"></div>' : ''}
  ${b.v !== 'photo' ? `<div class="sepimg" ${bg(img)}>${isEdit ? `<div class="imghot" ${bimg(b.id, 'img', null, img)}>🖼 Заменить</div>` : ''}</div>` : (isEdit ? `<div class="imghot" ${bimg(b.id, 'img', null, img)}>🖼 Заменить</div>` : '')}
  <h2 class="sin"${be(b.id, 'heading')}>${esc(d.heading || nProj + ' под ваш запрос')}</h2>
</section>`;
        },
        proj(b, projIdx) {
          const pr0 = prById(b.data.pid);
          if (!pr0) return '';
          const d = b.data;
          const hook = d.hookTitle || pr0.hookTitle || pr0.name;
          const blurb = d.blurb || (pr0.district || {}).blurb || '';
          const whyRent = d.whyRent || pr0.whyRent || [];
          const imgs = (d.imgs && d.imgs.length ? d.imgs : (pr0.images || [])).filter(Boolean);
          const imHot = (i2) => isEdit ? `<div class="imghot" ${bimg(b.id, 'imgs', i2, imgs[i2])}>🖼 Заменить</div>` : '';
          const shots = b.v === 'gallery'
            ? `<div class="shots wide">${(imgs.length ? imgs : ['']).slice(0, 4).map((u2, i2) => u2 ? `<div class="shot g" ${bg(u2)}>${imHot(i2)}</div>` : `<div class="shot g grad"><span>${esc(pr0.area || pr0.name)}</span>${imHot(i2)}</div>`).join('')}</div>`
            : `<div class="shots ${imgs.length > 1 ? '' : 'single'}">
    ${imgs[0] ? `<div class="shot main" ${bg(imgs[0])}>${imHot(0)}</div>` : `<div class="shot main grad"><span>${esc(pr0.area || pr0.name)}</span>${imHot(0)}</div>`}
    ${imgs.slice(1, 3).map((u2, i2) => `<div class="shot" ${bg(u2)}>${imHot(i2 + 1)}</div>`).join('')}
  </div>`;
          const metrics = `<div class="metrics">
    <div class="mt"><span>Стоимость</span><b>от ${fmt(pr0.priceFrom, pr0.currency)}</b></div>
    <div class="mt"><span>Дата сдачи</span><b>${esc(pr0.handover || '—')}</b></div>
    ${pr0.roi ? `<div class="mt"><span>Доходность</span><b>${esc(pr0.roi)}</b></div>` : ''}
    ${pr0.appreciation ? `<div class="mt"><span>Прирост стоимости</span><b>${esc(pr0.appreciation)}</b></div>` : ''}
  </div>`;
          const district = pr0.district && pr0.district.name ? `<div class="district">
    <div class="dmap">${star.replace('class="star"', 'class="dpin"')}</div>
    <div class="dtext"><b>${esc(pr0.district.name)}</b> — <span${be(b.id, 'blurb')}>${esc(blurb)}</span>
      <div class="dtimes">${(pr0.district.times || []).map(t2 => `<div><i>${esc(t2.min)} мин</i> 🚘 ${esc(t2.place)}</div>`).join('')}</div>
    </div>
  </div>` : '';
          const pay = (pr0.paymentRows || []).length ? `<h3 class="ph3">${pr0.market === 'offplan' ? 'Рассрочка' : 'Оплата'}</h3>
  <div class="payrow">${pr0.paymentRows.map(r2 => `<div class="pay"><b>${esc(r2.pct)}</b><span>${esc(r2.label)}</span></div>`).join('')}</div>` : '';
          const rec = (whyRent.length || isEdit) ? `<div class="rec"><div class="rec-t"${be(b.id, 'recTitle')}>${esc(d.recTitle || 'Рекомендуем для сдачи в аренду:')}</div><ol data-plist="${b.id}:whyRent">${whyRent.map((w2, wi) => `<li${be(b.id, 'whyRent', wi)}>${esc(w2)}</li>`).join('')}</ol></div>` : '';
          const units = (pr0.units || []).length ? `<h3 class="ph3">Доступные юниты</h3><div class="uwrap"><table class="units"><tr><th>Планировка</th><th>Площадь</th><th>Этаж</th><th>Вид</th><th>Цена</th></tr>
    ${pr0.units.map(u2 => `<tr><td><b>${esc(u2.plan)}</b></td><td>${esc(u2.area)}</td><td>${esc(u2.floor)}</td><td>${esc(u2.view)}</td><td class="pr">${fmt(u2.price, pr0.currency)}</td></tr>`).join('')}</table></div>` : '';
          const mats = ((pr0.layouts || []).length || (pr0.materials || []).length) ? `<div class="mats">${(pr0.layouts || []).map(l2 => `<a href="${esc(l2.url)}" target="_blank">📐 ${esc(l2.label)}</a>`).join('')}${(pr0.materials || []).map(mt2 => `<a href="${esc(mt2.url)}" target="_blank">${esc(mt2.label)} →</a>`).join('')}</div>` : '';
          const body = b.v === 'compact'
            ? metrics + shots + district
            : b.v === 'gallery'
              ? shots + metrics + district + rec
              : metrics + shots + district + pay + rec + units + mats;
          return `<section class="pg" data-pid="${esc(b.data.pid)}">
  <div class="kicker">Проект №${projIdx + 1}</div>
  <h2 class="ph2"${be(b.id, 'hookTitle')}>${esc(hook)}</h2>
  ${body}
  <div class="pnum">${String(++pageNo + 1).padStart(2, '0')}</div>
</section>`;
        },
        text(b) {
          const d = b.data;
          const inner = `${d.title || isEdit ? `<h2 class="ph2"${be(b.id, 'title')}>${esc(d.title || '')}</h2>` : ''}<div class="tbody"${be(b.id, 'body')}>${esc(d.body || '')}</div>`;
          if (b.v === 'blue') return `<section class="pg blue tblk">${inner}<div class="pnum">${String(++pageNo + 1).padStart(2, '0')}</div></section>`;
          if (b.v === 'panel') return `<section class="pg"><div class="tpanel">${inner}</div><div class="pnum">${String(++pageNo + 1).padStart(2, '0')}</div></section>`;
          return `<section class="pg">${inner}<div class="pnum">${String(++pageNo + 1).padStart(2, '0')}</div></section>`;
        },
        image(b) {
          const d = b.data;
          const im = `<div class="bigimg ${b.v === 'inset' ? 'inset' : ''}" ${bg(d.img)}>${d.img ? '' : '<span class="phold">Картинка — кликните 🖼, чтобы добавить</span>'}${isEdit ? `<div class="imghot" ${bimg(b.id, 'img', null, d.img)}>🖼 Заменить</div>` : ''}</div>`;
          return `<section class="pg imgpg">${im}${d.caption || isEdit ? `<div class="cap"${be(b.id, 'caption')}>${esc(d.caption || '')}</div>` : ''}</section>`;
        },
        gallery(b) {
          const imgs = (b.data.imgs || []).slice(0, 12);
          const cells = (imgs.length ? imgs : ['', '', '']).map((u2, i2) => `<div class="gcell" ${bg(u2)}>${u2 ? '' : '<span class="phold">🖼</span>'}${isEdit ? `<div class="imghot" ${bimg(b.id, 'imgs', i2, u2)}>🖼 Заменить</div>` : ''}</div>`).join('');
          return `<section class="pg"><div class="ggrid ${b.v === 'rows' ? 'rows' : b.v === 'masonry' ? 'masonry' : ''}" data-plist="${b.id}:imgs">${cells}</div></section>`;
        },
        video(b) {
          const d = b.data;
          const yid = ytId(d.url);
          const vid = vimeoId(d.url);
          let media;
          if (yid) media = `<iframe class="vframe" src="https://www.youtube.com/embed/${yid}" allowfullscreen frameborder="0"></iframe>`;
          else if (vid) media = `<iframe class="vframe" src="https://player.vimeo.com/video/${vid}" allowfullscreen frameborder="0"></iframe>`;
          else if (d.url) media = `<video class="vframe" controls preload="metadata" src="${esc(abs(d.url))}"></video>`;
          else media = `<div class="vframe vhold"><span class="phold">Видео — вставьте ссылку YouTube/Vimeo или загрузите MP4</span></div>`;
          return `<section class="pg vidpg" data-vurl="${esc(d.url || '')}">${media}${isEdit ? `<div class="imghot vhot" data-bvideo="${b.id}">🎬 ${d.url ? 'заменить' : 'добавить'} видео</div>` : ''}${d.caption || isEdit ? `<div class="cap"${be(b.id, 'caption')}>${esc(d.caption || '')}</div>` : ''}</section>`;
        },
        quote(b) {
          const d = b.data;
          const inner = `<div class="qmark">“</div><div class="qtext"${be(b.id, 'text')}>${esc(d.text || '')}</div><div class="qwho"><b${be(b.id, 'author')}>${esc(d.author || '')}</b><span${be(b.id, 'role')}>${esc(d.role || '')}</span></div>`;
          if (b.v === 'blue') return `<section class="pg blue qblk">${inner}</section>`;
          if (b.v === 'big') return `<section class="pg qbig">${inner}</section>`;
          return `<section class="pg"><div class="qcard">${inner}</div></section>`;
        },
        stats(b) {
          const items = b.data.items || [];
          const cells = items.map((it, i2) => `<div class="stat"><b${be(b.id, 'items', i2 + ':v')}>${esc(it.v)}</b><span${be(b.id, 'items', i2 + ':k')}>${esc(it.k)}</span></div>`).join('');
          if (b.v === 'blue') return `<section class="pg blue"><div class="stats row" data-plist="${b.id}:items">${cells}</div></section>`;
          if (b.v === 'cards') return `<section class="pg"><div class="stats cards" data-plist="${b.id}:items">${cells}</div></section>`;
          return `<section class="pg"><div class="stats row light" data-plist="${b.id}:items">${cells}</div></section>`;
        },
        faq(b) {
          const items = b.data.items || [];
          return `<section class="pg">
  <h2 class="ph2"${be(b.id, 'title')}>${esc(b.data.title || 'Частые вопросы')}</h2>
  <div class="faq" data-plist="${b.id}:items">${items.map((it, i2) => `<div class="fq"><div class="fq-q"${be(b.id, 'items', i2 + ':q')}>${esc(it.q)}</div><div class="fq-a"${be(b.id, 'items', i2 + ':a')}>${esc(it.a)}</div></div>`).join('')}</div>
  <div class="pnum">${String(++pageNo + 1).padStart(2, '0')}</div>
</section>`;
        },
        steps(b) {
          const items = b.data.items || [];
          return `<section class="pg">
  <h2 class="ph2"${be(b.id, 'title')}>${esc(b.data.title || 'Как мы работаем')}</h2>
  <div class="steps ${b.v === 'row' ? 'rowv' : ''}" data-plist="${b.id}:items">${items.map((it, i2) => `<div class="step"><i>${i2 + 1}</i><b${be(b.id, 'items', i2 + ':title')}>${esc(it.title)}</b><span${be(b.id, 'items', i2 + ':text')}>${esc(it.text)}</span></div>`).join('')}</div>
  <div class="pnum">${String(++pageNo + 1).padStart(2, '0')}</div>
</section>`;
        },
        benefits(b) {
          const items = b.data.items || [];
          const cell = (it, i2) => `<div class="bft"><span class="bft-i"${be(b.id, 'items', i2 + ':icon')}>${esc(it.icon || '✦')}</span><b${be(b.id, 'items', i2 + ':title')}>${esc(it.title)}</b><span class="bft-t"${be(b.id, 'items', i2 + ':text')}>${esc(it.text)}</span></div>`;
          const inner = `<h2 class="ph2"${be(b.id, 'title')}>${esc(b.data.title || 'Что вы получаете')}</h2>
  <div class="bfts ${b.v === 'list' ? 'list' : ''}" data-plist="${b.id}:items">${items.map(cell).join('')}</div>`;
          return `<section class="pg ${b.v === 'blue' ? 'blue' : ''}">${inner}<div class="pnum">${String(++pageNo + 1).padStart(2, '0')}</div></section>`;
        },
        compare(b) {
          const d = b.data;
          const items = d.items || [];
          if (b.v === 'cards') return `<section class="pg">
  <h2 class="ph2"${be(b.id, 'title')}>${esc(d.title || 'Сравним варианты')}</h2>
  <div class="cmp2" data-plist="${b.id}:items">
    ${['a', 'b'].map((side) => `<div class="cmp2-c ${side === 'a' ? 'acc' : ''}"><div class="cmp2-h"${be(b.id, side === 'a' ? 'headA' : 'headB')}>${esc(side === 'a' ? (d.headA || 'Вариант A') : (d.headB || 'Вариант B'))}</div>
      ${items.map((it, i2) => `<div class="cmp2-r"><span${be(b.id, 'items', i2 + ':k')}>${esc(it.k)}</span><b${be(b.id, 'items', i2 + ':' + side)}>${esc(it[side])}</b></div>`).join('')}</div>`).join('')}
  </div>
  <div class="pnum">${String(++pageNo + 1).padStart(2, '0')}</div>
</section>`;
          return `<section class="pg">
  <h2 class="ph2"${be(b.id, 'title')}>${esc(d.title || 'Сравним варианты')}</h2>
  <div class="uwrap"><table class="units cmpt" data-plist="${b.id}:items"><tr><th></th><th${be(b.id, 'headA')}>${esc(d.headA || 'Вариант A')}</th><th${be(b.id, 'headB')}>${esc(d.headB || 'Вариант B')}</th></tr>
    ${items.map((it, i2) => `<tr><td class="cmpk"${be(b.id, 'items', i2 + ':k')}>${esc(it.k)}</td><td${be(b.id, 'items', i2 + ':a')}>${esc(it.a)}</td><td${be(b.id, 'items', i2 + ':b')}>${esc(it.b)}</td></tr>`).join('')}</table></div>
  <div class="pnum">${String(++pageNo + 1).padStart(2, '0')}</div>
</section>`;
        },
        timeline(b) {
          const items = b.data.items || [];
          return `<section class="pg">
  <h2 class="ph2"${be(b.id, 'title')}>${esc(b.data.title || 'Как пройдёт покупка')}</h2>
  <div class="tl ${b.v === 'horizontal' ? 'hz' : ''}" data-plist="${b.id}:items">
    ${items.map((it, i2) => `<div class="tl-i"><span class="tl-dot"></span><i class="tl-when"${be(b.id, 'items', i2 + ':when')}>${esc(it.when)}</i><b${be(b.id, 'items', i2 + ':title')}>${esc(it.title)}</b><span class="tl-t"${be(b.id, 'items', i2 + ':text')}>${esc(it.text)}</span></div>`).join('')}
  </div>
  <div class="pnum">${String(++pageNo + 1).padStart(2, '0')}</div>
</section>`;
        },
        pricecards(b) {
          const items = b.data.items || [];
          return `<section class="pg">
  <h2 class="ph2"${be(b.id, 'title')}>${esc(b.data.title || 'Форматы работы')}</h2>
  <div class="pcards ${b.v === 'minimal' ? 'min' : ''}" data-plist="${b.id}:items">
    ${items.map((it, i2) => `<div class="pcard ${i2 === 0 ? 'acc' : ''}"><b${be(b.id, 'items', i2 + ':name')}>${esc(it.name)}</b><div class="pc-price"${be(b.id, 'items', i2 + ':price')}>${esc(it.price)}</div><div class="pc-t"${be(b.id, 'items', i2 + ':text')}>${esc(it.text)}</div></div>`).join('')}
  </div>
  <div class="pnum">${String(++pageNo + 1).padStart(2, '0')}</div>
</section>`;
        },
        bignum(b) {
          const d = b.data;
          return `<section class="pg bignum ${b.v === 'blue' ? 'blue' : ''}">
  <div class="bn-v"${be(b.id, 'v')}>${esc(d.v || '')}</div>
  <div class="bn-k"${be(b.id, 'k')}>${esc(d.k || '')}</div>
</section>`;
        },
        checklist(b) {
          const items = b.data.bullets || [];
          return `<section class="pg">
  <h2 class="ph2"${be(b.id, 'title')}>${esc(b.data.title || 'Чек-лист')}</h2>
  <div class="ckl ${b.v === 'cols' ? 'cols' : ''}" data-plist="${b.id}:bullets">
    ${items.map((it, i2) => `<div class="ck"><span class="ck-m">✓</span><span${be(b.id, 'bullets', i2)}>${esc(it)}</span></div>`).join('')}
  </div>
  <div class="pnum">${String(++pageNo + 1).padStart(2, '0')}</div>
</section>`;
        },
        textimg(b) {
          const d = b.data;
          return `<section class="pg">
  <div class="tximg ${b.v === 'imgleft' ? 'flip' : ''}">
    <div class="tx-side">${d.title || isEdit ? `<h2 class="ph2"${be(b.id, 'title')}>${esc(d.title || '')}</h2>` : ''}<div class="tbody"${be(b.id, 'body')}>${esc(d.body || '')}</div></div>
    <div class="tx-img" ${bg(d.img)}>${d.img ? '' : '<span class="phold">🖼</span>'}${isEdit ? `<div class="imghot" ${bimg(b.id, 'img', null, d.img)}>🖼 Заменить</div>` : ''}</div>
  </div>
  <div class="pnum">${String(++pageNo + 1).padStart(2, '0')}</div>
</section>`;
        },
        team(b) {
          const items = b.data.items || [];
          return `<section class="pg">
  <h2 class="ph2"${be(b.id, 'title')}>${esc(b.data.title || 'Команда')}</h2>
  <div class="tmm ${b.v === 'strip' ? 'strip' : ''}" data-plist="${b.id}:items">
    ${items.map((it, i2) => `<div class="tm"><span class="tm-a">${esc((it.name || '·').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase())}</span><b${be(b.id, 'items', i2 + ':name')}>${esc(it.name)}</b><span class="tm-r"${be(b.id, 'items', i2 + ':role')}>${esc(it.role)}</span></div>`).join('')}
  </div>
  <div class="pnum">${String(++pageNo + 1).padStart(2, '0')}</div>
</section>`;
        },
        amenities(b) {
          const items = b.data.items || [];
          return `<section class="pg">
  <h2 class="ph2"${be(b.id, 'title')}>${esc(b.data.title || 'Инфраструктура')}</h2>
  <div class="amn ${b.v === 'compact' ? 'cmp' : ''}" data-plist="${b.id}:items">
    ${items.map((it, i2) => `<div class="amn-i"><span class="amn-ic">${esc(it.icon || '•')}</span><span class="amn-l"${be(b.id, 'items', i2 + ':label')}>${esc(it.label || '')}</span></div>`).join('')}
  </div>
  <div class="pnum">${String(++pageNo + 1).padStart(2, '0')}</div>
</section>`;
        },
        hero(b) {
          const d = b.data;
          const bg = d.img ? `background-image:linear-gradient(180deg,rgba(6,12,40,.15),rgba(6,12,40,.72)),url('${esc(abs(d.img))}')` : '';
          return `<section class="pg heroblk ${b.v === 'light' ? 'lt' : ''} ${d.img ? 'has' : ''}" style="${bg}">
    ${isEdit ? `<div class="imghot" data-bimg="${b.id}:img" data-bival="${esc(d.img || '')}">🖼 ${d.img ? 'заменить фон' : 'фоновое фото'}</div>` : ''}
    <div class="hero-in">
      <h2 class="hero-h"${be(b.id, 'heading')}>${esc(d.heading || '')}</h2>
      <p class="hero-s"${be(b.id, 'sub')}>${esc(d.sub || '')}</p>
    </div>
</section>`;
        },
        guarantee(b) {
          const items = b.data.items || [];
          return `<section class="pg ${b.v === 'blue' ? 'blue' : ''}">
  <h2 class="ph2"${be(b.id, 'title')}>${esc(b.data.title || 'Ваша сделка под защитой')}</h2>
  <div class="grt" data-plist="${b.id}:items">
    ${items.map((it, i2) => `<div class="grt-i"><span class="grt-ic">${esc(it.icon || '✓')}</span><b${be(b.id, 'items', i2 + ':title')}>${esc(it.title || '')}</b><span class="grt-t"${be(b.id, 'items', i2 + ':text')}>${esc(it.text || '')}</span></div>`).join('')}
  </div>
  <div class="pnum">${String(++pageNo + 1).padStart(2, '0')}</div>
</section>`;
        },
        cta(b) {
          const d = b.data;
          const waHref = d.href || `https://wa.me/${(mgr.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent('Здравствуйте! По подборке «' + c.title + '» интересует проект №')}`;
          const inner = `<h2${be(b.id, 'title')}>${esc(d.title || 'Напишите номер проекта в чат,')}</h2>
  <p${be(b.id, 'sub')}>${esc(d.sub || 'чтобы получить подробности, планировки и расчёт доходности по нему')}</p>
  <a class="ctabtn" href="${esc(waHref)}"${isEdit ? ` data-chref="${esc(d.href || '')}"` : ''}><span${be(b.id, 'btn')}>${esc(d.btn || 'Написать в WhatsApp')}</span></a>`;
          if (b.v === 'card') return `<section class="pg"><div class="ctacard">${inner}</div></section>`;
          if (b.v === 'photo') return `<section class="cta ctaphoto" ${bg(d.img || heroImg)}><div class="cshade"></div><div class="cta-in">${inner}</div>${isEdit ? `<div class="imghot" ${bimg(b.id, 'img', null, d.img || heroImg)}>🖼 Заменить</div>` : ''}</section>`;
          return `<section class="cta">${inner}</section>`;
        },
        why(b) {
          const d = b.data;
          const bullets = d.bullets || about.whyUs || [];
          return `<section class="pg">
  <h2 class="hi h2md"${be(b.id, 'heading')}>${esc(d.heading || 'Почему клиенты выбирают именно нас')}</h2>
  <div class="arrows" data-plist="${b.id}:bullets">${bullets.map((b2, bi) => `<div><i>↳</i><span${be(b.id, 'bullets', bi)}>${esc(b2).replace(/^([^.]+\.)/, '<b>$1</b>')}</span></div>`).join('')}</div>
  ${(d.freeNote || about.freeNote || isEdit) ? `<p class="freenote"${be(b.id, 'freeNote')}>${esc(d.freeNote || about.freeNote || '')}</p>` : ''}
  ${(about.office && about.office.blurb) || d.officeText ? `<h2 class="hi h2sm2">Наш офис${about.office && about.office.city ? ' · ' + esc(about.office.city) : ''}</h2>
  <p class="officetxt"${be(b.id, 'officeText')}>${esc(d.officeText || ((about.office.address ? about.office.address + '. ' : '') + about.office.blurb))}</p>` : ''}
  <div class="pnum">${String(++pageNo + 1).padStart(2, '0')}</div>
</section>`;
        },
        final(b) {
          return `<section class="final blue"><div class="brand">${star}<span${be(b.id, 'brandName')}>${esc(b.data.brandName || AG)}</span></div>${b.data.note || isEdit ? `<p class="fnote"${be(b.id, 'note')}>${esc(b.data.note || '')}</p>` : ''}</section>`;
        },
      };

      let projIdx = 0;
      const bodyHtml = blocks.map((b0) => {
        if (b0.hidden && !isEdit) return '';
        if (!R[b0.t]) return '';
        const b = Object.assign({}, b0, { data: Object.assign({}, pbDefaults(b0.t), b0.data) });
        const html = R[b.t](b, b.t === 'proj' ? projIdx : undefined);
        if (b.t === 'proj' && prById(b.data.pid)) projIdx += 1;
        if (!html) return '';
        return html.replace('<section ', `<section data-bid="${b.id}" data-bt="${b.t}" data-bv="${b.v}" ${b.hidden ? 'data-bhid="1"' : ''} `);
      }).join('\n');

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(cTitle)} — ${esc(AG)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&display=swap" rel="stylesheet">
<style>
:root{--blue:${theme.blue};--ink:${theme.ink};--mut:${theme.mut};--bg:${theme.bg};--paper:${theme.paper};--line:${theme.line};--disp:'Fraunces',Georgia,serif}
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Manrope',-apple-system,'Segoe UI',sans-serif;background:${theme.body};color:var(--ink);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
h1,h2,h3,p,li,td,span,div{overflow-wrap:break-word;word-break:normal}
.book{max-width:680px;margin:0 auto;background:var(--paper);box-shadow:0 0 60px rgba(0,0,0,${'${theme.dark ? ".45" : ".15"}'})}
section{page-break-after:always;position:relative}
.pg{padding:44px 38px 56px;position:relative}
.blue{background:var(--blue);color:#fff}
.star{width:38px;height:46px;flex:0 0 auto}.dpin{width:20px;height:24px}
.cover{min-height:92vh;display:flex;flex-direction:column;padding:44px 38px}
.brand{font-size:22px;font-weight:700;letter-spacing:.02em;display:flex;gap:10px;align-items:center;min-width:0;flex-wrap:wrap}
.cover h1{font-size:42px;line-height:1.08;font-weight:800;letter-spacing:-.5px;margin-top:40px}
.csub{margin-top:14px;font-size:16px;line-height:1.5;opacity:.85;max-width:520px}
.badge{display:inline-block;border:1.5px solid rgba(255,255,255,.85);border-radius:8px;padding:10px 18px;font-size:19px;font-weight:700;margin-top:26px;width:fit-content;max-width:100%}
.coverimg{flex:1;min-height:340px;border-radius:6px;background-size:cover;background-position:center;margin-top:36px;position:relative}
.coverimg.grad{background:linear-gradient(160deg,color-mix(in srgb,var(--blue) 78%,#fff),color-mix(in srgb,var(--blue) 62%,#000));display:grid;place-items:center}.coverimg.grad span{font-size:34px;font-weight:800;color:rgba(255,255,255,.85)}
.cover.cphoto{background-size:cover;background-position:center;justify-content:flex-end}
.cshade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(6,12,40,.25),rgba(6,12,40,.78))}
.cover.cphoto .cin{position:relative;color:#fff}
.cover.cphoto .csp{height:30px}
.cover.clight{background:#fff;color:var(--ink)}
.cover.clight .badge{border-color:var(--blue);color:var(--blue)}
.brand.dark .star path{fill:var(--blue)}
.kicker{font-size:13px;color:var(--mut);margin-bottom:10px}
h2.hi{font-size:34px;font-weight:800;letter-spacing:-.4px}
.h2sm{font-size:26px!important;margin-top:36px}
.h2sm2{font-size:24px!important;margin-top:34px}
.h2md{font-size:28px!important}
.ph2{font-size:25px;font-weight:800;line-height:1.2;letter-spacing:-.3px;margin-bottom:20px}
.ph3{font-size:19px;font-weight:800;margin:26px 0 0;padding-bottom:10px;border-bottom:1px solid var(--line)}
.hello{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:24px;margin-top:26px}
.hello p{font-size:15.5px;line-height:1.6;min-width:0}.hello b{font-weight:700}
.mgrph{aspect-ratio:3/4;border-radius:6px;background:linear-gradient(160deg,color-mix(in srgb,var(--blue) 78%,#fff),color-mix(in srgb,var(--blue) 62%,#000)) center/cover;display:grid;place-items:center;color:#fff;font-size:34px;font-weight:800;position:relative}
.arrows{margin-top:30px}.arrows div{display:flex;gap:14px;font-size:15px;line-height:1.55;padding:10px 0}
.arrows i{color:var(--blue);font-style:normal;font-weight:800;flex:0 0 18px}
.arrows span{min-width:0;flex:1}
.arrows b{font-weight:700}
.intro{font-size:16px;line-height:1.7;white-space:pre-line;margin-top:26px;color:color-mix(in srgb,var(--ink) 88%,var(--mut))}
.metrics{display:flex;gap:0;background:var(--bg);border-radius:6px;padding:18px 0;margin-bottom:16px;flex-wrap:wrap;row-gap:14px}
.mt{flex:1;min-width:130px;padding:0 20px}.mt span{font-size:12.5px;color:var(--mut);display:block;margin-bottom:5px}.mt b{font-size:19px;font-weight:800}
.shots{display:grid;grid-template-columns:1.75fr 1fr;gap:8px}
.shots.single{grid-template-columns:1fr}
.shots.wide{grid-template-columns:1fr 1fr}
.shot{border-radius:4px;background-size:cover;background-position:center;min-height:130px;position:relative}
.shot.main{grid-row:span 2;min-height:280px}
.shot.g{min-height:210px}
.shot.grad{background:linear-gradient(160deg,color-mix(in srgb,var(--blue) 78%,#fff),color-mix(in srgb,var(--blue) 62%,#000));display:grid;place-items:center}.shot.grad span{color:rgba(255,255,255,.85);font-size:26px;font-weight:800;padding:0 12px;text-align:center}
.district{display:grid;grid-template-columns:150px minmax(0,1fr);gap:18px;margin-top:18px;align-items:start}
.dmap{background:#EFEFED;border-radius:6px;height:120px;display:grid;place-items:center}
.dmap svg path{fill:var(--blue)}
.dtext{font-size:14px;line-height:1.55;min-width:0}.dtext b{font-weight:700}
.dtimes{margin-top:9px}.dtimes div{font-size:13.5px;padding:2px 0}.dtimes i{font-style:normal;font-weight:700;display:inline-block;min-width:56px}
.payrow{display:flex;margin-top:14px;flex-wrap:wrap;row-gap:12px}
.pay{flex:1;min-width:120px;padding:6px 18px 0;border-left:1px solid var(--line)}.pay:first-child{border-left:none;padding-left:0}
.pay b{font-size:24px;font-weight:800;display:block}.pay span{font-size:13px;color:var(--mut)}
.rec{background:var(--blue);color:#fff;border-radius:6px;padding:22px 24px;margin-top:22px}
.rec-t{font-size:18px;font-weight:800;margin-bottom:12px}
.rec ol{padding-left:20px}.rec li{font-size:14px;line-height:1.55;margin-bottom:8px}
.uwrap{overflow-x:auto;margin-top:12px}
table.units{width:100%;border-collapse:collapse;font-size:13.5px;min-width:430px}
.units th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);padding:8px 9px;border-bottom:2px solid var(--line)}
.units td{padding:9px;border-bottom:1px solid var(--line)}.units .pr{font-weight:800;color:var(--blue);white-space:nowrap}
.mats{margin-top:16px}.mats a{display:inline-block;margin-right:16px;color:var(--blue);font-size:14px;font-weight:600;text-decoration:none;overflow-wrap:anywhere}
.pnum{position:absolute;bottom:20px;right:26px;font-size:13px;color:var(--mut)}
.sep{min-height:70vh;display:flex;flex-direction:column;padding:44px 38px}
.sep.sphoto{background-size:cover;background-position:center;justify-content:flex-end;color:#fff}
.sep.sphoto .sin{position:relative}
.sep.slight{background:#fff;color:var(--ink)}
.sepimg{flex:1;min-height:300px;border-radius:6px;background-size:cover;background-position:center;background-image:linear-gradient(160deg,color-mix(in srgb,var(--blue) 78%,#fff),color-mix(in srgb,var(--blue) 62%,#000));position:relative}
.sep h2{font-size:34px;font-weight:800;margin-top:34px}
.cta{text-align:center;padding:70px 38px}
.cta h2,.ctacard h2{font-size:30px;font-weight:800;line-height:1.2}.cta p,.ctacard p{color:var(--mut);margin-top:12px;font-size:15px}
.ctacard{border:1.5px solid var(--line);border-radius:14px;padding:46px 34px;text-align:center}
.ctabtn{display:inline-block;background:var(--blue);color:#fff;text-decoration:none;font-weight:800;font-size:16px;border-radius:10px;padding:16px 36px;margin-top:26px;max-width:100%}
.final{min-height:60vh;display:grid;place-items:center;text-align:center}
.final .brand{font-size:34px;justify-content:center}
.fnote{margin-top:14px;font-size:14px;opacity:.8}
.foot{font-size:12px;color:var(--mut);text-align:center;padding:14px}
.tbody{font-size:16px;line-height:1.7;white-space:pre-line;color:color-mix(in srgb,var(--ink) 88%,var(--mut))}
.tblk .tbody{color:rgba(255,255,255,.92)}
.tpanel{background:var(--bg);border-radius:10px;padding:28px 26px}
.imgpg{padding-bottom:44px}
.bigimg{min-height:380px;border-radius:8px;background:linear-gradient(160deg,#E8EAF2,#D5D9E8) center/cover;position:relative}
.bigimg.inset{margin:0 40px}
.cap{font-size:13px;color:var(--mut);margin-top:10px;text-align:center}
.phold{position:absolute;inset:0;display:grid;place-items:center;color:#8A90A0;font-size:14px;font-weight:600;padding:20px;text-align:center}
.ggrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ggrid.rows{grid-template-columns:1fr}
.gcell{min-height:220px;border-radius:8px;background:linear-gradient(160deg,#E8EAF2,#D5D9E8) center/cover;position:relative}
.vidpg{padding-bottom:44px}
.vframe{width:100%;aspect-ratio:16/9;border-radius:8px;display:block;background:#0B0B0F}
.vhold{background:linear-gradient(160deg,#E8EAF2,#D5D9E8);position:relative}
.qcard{background:var(--paper);border:1.5px solid var(--line);border-radius:14px;padding:38px 34px}
.qmark{font-size:64px;line-height:.6;color:var(--blue);font-weight:800;margin-bottom:18px}
.qblk .qmark{color:#fff}
.qtext{font-size:19px;line-height:1.55;font-weight:600}
.qwho{margin-top:20px;font-size:14px}.qwho b{display:block}.qwho span{color:var(--mut)}
.qblk .qwho span{color:rgba(255,255,255,.75)}
.stats{display:flex;gap:14px;flex-wrap:wrap}
.stats.row{align-items:stretch}
.stat{flex:1;min-width:130px}
.stats.row .stat{padding:8px 0 8px 18px;border-left:3px solid var(--blue)}
.stats.row.light .stat{border-color:var(--blue)}
.blue .stats.row .stat{border-color:rgba(255,255,255,.7)}
.stats.cards .stat{background:var(--bg);border-radius:10px;padding:22px 20px}
.stat b{font-size:30px;font-weight:800;display:block;letter-spacing:-.5px}
.stat span{font-size:13px;color:var(--mut);display:block;margin-top:4px}
.blue .stat span{color:rgba(255,255,255,.75)}
.faq{margin-top:6px}
.fq{padding:16px 0;border-bottom:1px solid var(--line)}
.fq-q{font-weight:800;font-size:15.5px}
.fq-a{font-size:14.5px;line-height:1.6;color:#2A2E3A;margin-top:6px}
.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-top:8px}
.step{background:var(--bg);border-radius:10px;padding:20px 18px;position:relative}
.step i{font-style:normal;display:inline-grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--blue);color:#fff;font-weight:800;font-size:13px;margin-bottom:12px}
.step b{display:block;font-size:15px}
.step span{display:block;font-size:13.5px;line-height:1.5;color:var(--mut);margin-top:5px}
.freenote{font-weight:700;margin-top:22px;font-size:15px}
.officetxt{margin-top:12px;font-size:15px;line-height:1.6}
.cover.csplit{flex-direction:row;padding:0;min-height:92vh;background:var(--blue)}
.cs-l{flex:1.25;padding:52px 44px;display:flex;flex-direction:column;color:#fff}
.cs-l .brand{margin-bottom:auto}
.cs-l h1{font-size:44px;line-height:1.06;margin-top:26px;letter-spacing:-1px}
.cs-l .csub{margin-top:18px;font-size:15.5px;line-height:1.6;opacity:.82;max-width:400px}
.cs-l .badge{margin-top:30px;background:rgba(255,255,255,.12);border-color:transparent;backdrop-filter:blur(4px)}
.cs-r{flex:1;background-size:cover;background-position:center;position:relative;margin:14px 14px 14px 0;border-radius:14px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}
.cs-r::after{content:'';position:absolute;inset:0;background:linear-gradient(200deg,transparent 55%,color-mix(in srgb,var(--blue) 55%,transparent))}
.cta.ctaphoto{position:relative;background-size:cover;background-position:center;color:#fff}
.cta.ctaphoto .cta-in{position:relative}
.cta.ctaphoto p{color:rgba(255,255,255,.85)}
.qbig{text-align:center;padding:80px 38px}
.qbig .qmark{margin:0 auto 20px}
.qbig .qtext{font-size:26px;line-height:1.45;font-weight:700;letter-spacing:-.3px}
.qbig .qwho{margin-top:24px}
.ggrid.masonry{columns:3;column-gap:10px;display:block}
.ggrid.masonry .gcell{margin-bottom:10px;break-inside:avoid;min-height:150px}
.steps.rowv{grid-template-columns:repeat(auto-fit,minmax(120px,1fr))}
.bfts{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-top:8px}
.bfts.list{grid-template-columns:1fr}
.bft{background:var(--bg);border-radius:12px;padding:20px 18px}
.blue .bft{background:rgba(255,255,255,.1)}
.bfts.list .bft{display:flex;gap:14px;align-items:center;padding:14px 18px}
.bft-i{font-size:22px;display:block;margin-bottom:10px}
.bfts.list .bft-i{margin:0}
.bft b{display:block;font-size:15px}
.bft-t{display:block;font-size:13.5px;line-height:1.5;color:var(--mut);margin-top:4px}
.blue .bft-t{color:rgba(255,255,255,.75)}
.cmp2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.cmp2-c{border:1.5px solid var(--line);border-radius:12px;padding:18px}
.cmp2-c.acc{border-color:var(--blue);box-shadow:0 8px 24px rgba(29,52,216,.1)}
.cmp2-h{font-weight:800;font-size:15px;margin-bottom:12px}
.cmp2-r{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:7px 0;border-top:1px solid var(--line)}
.cmp2-r b{font-weight:750}
.cmpt .cmpk{color:var(--mut)}
.tl{position:relative;margin-top:10px;padding-left:24px}
.tl::before{content:'';position:absolute;left:7px;top:6px;bottom:6px;width:2px;background:var(--line)}
.tl-i{position:relative;padding:0 0 22px}
.tl-dot{position:absolute;left:-24px;top:4px;width:12px;height:12px;border-radius:50%;background:var(--blue);box-shadow:0 0 0 3px #E6EBFF}
.tl-when{display:block;font-style:normal;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--blue)}
.tl-i b{display:block;font-size:15.5px;margin-top:3px}
.tl-t{display:block;font-size:13.5px;color:var(--mut);line-height:1.5;margin-top:3px}
.tl.hz{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px;padding-left:0}
.tl.hz::before{display:none}
.tl.hz .tl-dot{position:static;display:inline-block;margin-bottom:8px}
.tl.hz .tl-i{padding:0}
.pcards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin-top:8px}
.pcard{border:1.5px solid var(--line);border-radius:14px;padding:24px 22px}
.pcard.acc{border-color:var(--blue);background:linear-gradient(170deg,#F6F8FF,#fff)}
.pcard b{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut)}
.pc-price{font-size:26px;font-weight:800;letter-spacing:-.5px;margin:8px 0 12px}
.pcard.acc .pc-price{color:var(--blue)}
.pc-t{font-size:13.5px;line-height:1.55;color:#2A2E3A;white-space:pre-line}
.pcards.min .pcard{border:none;border-left:3px solid var(--blue);border-radius:4px;padding:6px 0 6px 18px}
.bignum{text-align:center;padding:70px 38px}
.bn-v{font-size:64px;font-weight:800;letter-spacing:-2px;color:var(--blue)}
.blue .bn-v,.bignum.blue .bn-v{color:#fff}
.bn-k{font-size:15.5px;line-height:1.55;color:var(--mut);max-width:420px;margin:14px auto 0}
.bignum.blue .bn-k{color:rgba(255,255,255,.8)}
.ckl{margin-top:6px}
.ckl.cols{display:grid;grid-template-columns:1fr 1fr;gap:0 22px}
.ck{display:flex;gap:12px;align-items:flex-start;padding:9px 0;font-size:14.5px;line-height:1.5}
.ck-m{flex:0 0 22px;height:22px;border-radius:50%;background:#E4F7EC;color:#148A4E;font-weight:800;font-size:12px;display:grid;place-items:center;margin-top:1px}
.tximg{display:grid;grid-template-columns:1.2fr 1fr;gap:20px;align-items:stretch}
.tximg.flip .tx-side{order:2}
.tximg.flip .tx-img{order:1}
.tx-img{border-radius:10px;background:linear-gradient(160deg,#E8EAF2,#D5D9E8) center/cover;min-height:260px;position:relative}
.tmm{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-top:8px}
.tm{background:var(--bg);border-radius:12px;padding:20px 18px;text-align:center}
.tm-a{width:52px;height:52px;border-radius:50%;background:linear-gradient(140deg,#3F5BE8,#0E1B8C);color:#fff;font-weight:800;display:grid;place-items:center;margin:0 auto 12px;font-size:16px}
.tm b{display:block;font-size:14.5px}
.tm-r{display:block;font-size:12.5px;color:var(--mut);margin-top:3px}
.tmm.strip{grid-template-columns:1fr}
.tmm.strip .tm{display:flex;gap:14px;align-items:center;text-align:left;padding:12px 16px}
.tmm.strip .tm-a{margin:0;width:42px;height:42px;font-size:13px}
.imghot{display:none}
/* моушн просмотра: секции проявляются, прогресс чтения, плавающий WhatsApp */
body.motion section[data-bid]{opacity:0;transform:translateY(16px);transition:opacity .65s ease,transform .65s cubic-bezier(.16,1,.3,1)}
body.motion section[data-bid].vis{opacity:1;transform:none}
#readbar{position:fixed;top:0;left:0;height:3px;background:linear-gradient(90deg,var(--blue),color-mix(in srgb,var(--blue) 55%,#fff));width:0;z-index:90;transition:width .15s linear}
#wafab{position:fixed;right:18px;bottom:18px;z-index:95;width:56px;height:56px;border-radius:50%;background:#25D366;display:grid;place-items:center;box-shadow:0 10px 30px rgba(37,211,102,.45);animation:wafp 3s ease-in-out infinite;text-decoration:none}
#wafab svg{width:28px;height:28px;fill:#fff}
@keyframes wafp{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@media(prefers-reduced-motion:reduce){body.motion section[data-bid]{opacity:1;transform:none;transition:none}#wafab{animation:none}}
@media print{body.motion section[data-bid]{opacity:1!important;transform:none!important}#readbar,#wafab{display:none!important}}
@media(max-width:560px){.cover.csplit{flex-direction:column}.cs-r{min-height:220px}.cmp2{grid-template-columns:1fr}.ckl.cols{grid-template-columns:1fr}.tximg{grid-template-columns:1fr}.ggrid.masonry{columns:2}.bn-v{font-size:44px}}
@media print{body{background:#fff}.book{box-shadow:none;max-width:none}.blue,.rec,.shot.grad,.coverimg.grad,.mgrph,.sepimg,.dmap,.step i,.cshade{-webkit-print-color-adjust:exact;print-color-adjust:exact}.ctabtn{display:none}.uwrap{overflow:visible}}
@media(max-width:560px){.pg,.cover,.sep{padding:30px 20px}.cover h1{font-size:31px}.hello{grid-template-columns:1fr}.metrics{flex-direction:column;gap:12px}.mt b{white-space:normal}.payrow{flex-direction:column;gap:10px}.pay{border-left:none;padding:0}.bigimg.inset{margin:0}.stats{flex-direction:column}table.units{font-size:12px;min-width:340px}.units th,.units td{padding:6px 7px}.uwrap{margin-left:-4px;margin-right:-4px;padding:0 4px;border-radius:10px}.ph3{font-size:16px}}
${isEdit ? `#peload{position:fixed;inset:0;z-index:2000;background:radial-gradient(700px 500px at 50% 42%,#102B5C,#061126 72%);display:grid;place-items:center;opacity:1;transition:opacity .38s ease}
#peload.out{opacity:0;pointer-events:none}
#peload .plx{display:grid;place-items:center;gap:14px}
#peload svg{width:46px;height:56px;animation:pebr 1.5s ease-in-out infinite;filter:drop-shadow(0 0 22px rgba(120,160,255,.7))}
#peload b{color:#fff;font-weight:650;letter-spacing:.3em;font-size:15px}
#peload i{color:#7C9BFF;font-size:11px;font-style:normal;letter-spacing:.08em}
@keyframes pebr{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}` : ''}
/* премиум-типографика: сериф Fraunces на крупных заголовках, мягче вес, дорогой ритм */
.cover h1,h2.hi,.ph2,.sep h2,.cta h2,.ctacard h2,.cs-l h1,.coverimg.grad span,.mgrph,.bn-v{font-family:var(--disp);font-optical-sizing:auto;font-weight:600;letter-spacing:-.015em}
.ph3,.brand{font-family:var(--disp);font-optical-sizing:auto;font-weight:600}
h2:not(.hi){font-family:var(--disp)}
.brand{letter-spacing:.01em}
.pg{padding:52px 44px 60px}
.ph3{padding-bottom:12px}
.intro,.hello p{font-size:15.5px;line-height:1.72}
/* блок: инфраструктура */
.amn{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-top:24px}
.amn.cmp{grid-template-columns:repeat(3,1fr);gap:12px}
.amn-i{display:flex;align-items:center;gap:13px;padding:15px 16px;background:var(--bg);border-radius:14px;border:1px solid var(--line)}
.amn.cmp .amn-i{flex-direction:column;text-align:center;gap:8px;padding:18px 12px}
.amn-ic{font-size:24px;line-height:1;width:46px;height:46px;flex:0 0 46px;display:grid;place-items:center;background:color-mix(in srgb,var(--blue) 12%,var(--paper));border-radius:12px}
.amn.cmp .amn-ic{width:52px;height:52px;flex:0 0 52px}
.amn-l{font-size:14px;font-weight:600;color:var(--ink);min-width:0}
/* блок: фото-хиро */
.heroblk{min-height:64vh;display:flex;align-items:flex-end;padding:0;background-size:cover;background-position:center;color:#fff}
.heroblk:not(.has){background:linear-gradient(155deg,color-mix(in srgb,var(--blue) 80%,#fff),color-mix(in srgb,var(--blue) 55%,#000))}
.heroblk.lt:not(.has){background:var(--bg);color:var(--ink)}
.hero-in{padding:48px 44px}
.hero-h{font-family:var(--disp);font-optical-sizing:auto;font-weight:600;font-size:40px;line-height:1.08;letter-spacing:-.02em}
.hero-s{margin-top:14px;font-size:17px;line-height:1.5;max-width:520px;opacity:.92}
/* блок: гарантии */
.grt{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:24px}
.blue .grt-i{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18)}
.grt-i{padding:20px 18px;background:var(--bg);border-radius:16px;border:1px solid var(--line)}
.grt-ic{font-size:26px;line-height:1;display:block;margin-bottom:12px}
.grt-i b{font-size:15.5px;font-weight:700;display:block;margin-bottom:6px}
.grt-t{font-size:13px;line-height:1.55;color:var(--mut)}
.blue .grt-t{color:rgba(255,255,255,.8)}
@media(max-width:560px){.amn,.amn.cmp,.grt{grid-template-columns:1fr}.hero-h{font-size:28px}.hero-in{padding:32px 24px}.heroblk{min-height:52vh}}
@media(max-width:560px){.pg{padding:32px 22px 40px}}
</style></head><body>${isEdit ? `<div id="peload"><div class="plx"><svg viewBox="0 0 100 120"><path fill="#fff" d="M50 0 C54.5 37 66 52 93 60 C66 68 54.5 83 50 120 C45.5 83 34 68 7 60 C34 52 45.5 37 50 0 Z"/></svg><b>LUMEN</b><i>собираем страницу…</i></div></div><script>(function(){try{var t=+sessionStorage.getItem('pe_loading')||0;if(!t||Date.now()-t>15000){document.getElementById('peload').style.display='none';sessionStorage.removeItem('pe_loading');}}catch(e){}})()</${'script'}>` : ''}<div class="book">
${bodyHtml}
<div class="foot">${esc(AG)} · собрано в Lumen CRM · ${new Date(c.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
</div>
${isPrint ? '<script>window.print()</script>' : isEdit ? '' : `<script>
(() => {
  const sid = Math.random().toString(36).slice(2, 10);
  let maxD = 0, lastSent = 0, deepSent = false, lastBeat = Date.now();
  const depth = () => Math.min(100, Math.round((scrollY + innerHeight) / document.body.scrollHeight * 100));
  addEventListener('scroll', () => { maxD = Math.max(maxD, depth()); }, { passive: true });
  const send = () => {
    const now = Date.now();
    const dt = Math.round((now - lastBeat) / 1000);
    lastBeat = now;
    maxD = Math.max(maxD, depth());
    const deep = maxD >= 75 && !deepSent;
    if (deep) deepSent = true;
    if (dt < 1 && !deep && maxD <= lastSent) return;
    lastSent = maxD;
    navigator.sendBeacon('/p/${c.id}/track', JSON.stringify({ sid, depth: maxD, dt, deep }));
  };
  setInterval(send, 5000);
  addEventListener('pagehide', send);
  /* моушн: секции проявляются при скролле */
  document.body.classList.add('motion');
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('vis'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('section[data-bid]').forEach((s2) => io.observe(s2));
  /* прогресс чтения */
  const rb = document.createElement('div');
  rb.id = 'readbar';
  document.body.appendChild(rb);
  addEventListener('scroll', () => { rb.style.width = Math.min(100, (scrollY + innerHeight) / document.body.scrollHeight * 100) + '%'; }, { passive: true });
  ${(mgr.phone || '').replace(/\D/g, '') ? `
  /* плавающий WhatsApp */
  const fab = document.createElement('a');
  fab.id = 'wafab';
  fab.href = 'https://wa.me/${(mgr.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent('Здравствуйте! Смотрю подборку «' + c.title + '» — есть вопрос.')}';
  fab.target = '_blank';
  fab.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.7 14.2c-.2.7-1.3 1.3-1.9 1.4-.5.1-1.1.2-3.4-.7-2.8-1.2-4.6-4-4.8-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 .9-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.4.6c-.1.2-.3.4-.1.7.2.3.8 1.4 1.8 2.2 1.3 1.1 2.3 1.5 2.7 1.6.3.1.5.1.7-.1l.8-1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.6.4.1.1.1.6-.2 1.4z"/></svg>';
  document.body.appendChild(fab);` : ''}
})();
</script>`}
${isEdit ? `<script>window.PEDIT=${JSON.stringify({
        cid: c.id,
        key: u.searchParams.get('key'),
        llm: llm.available(),
        theme: c.theme || 'klein',
        themes: Object.fromEntries(Object.entries(PAGE_THEMES).map(([k, v]) => [k, { name: v.name, blue: v.blue, body: v.body }])),
        types: Object.fromEntries(Object.entries(PB_TYPES).map(([k, v]) => [k, { name: v.name, variants: v.variants, std: !!v.std }])),
        props: (c.propertyIds || []).map(pid => { const pr = prById(pid); return pr ? { id: pr.id, name: pr.name } : null; }).filter(Boolean),
        lib: (() => { try { return fs.readdirSync(path.join(PUBLIC, 'assets', 'lib')).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).map(f => '/assets/lib/' + f); } catch (e) { return []; } })(),
        undo: (c.histBack || []).length,
        redo: (c.histFwd || []).length,
        versions: (c.versions || []).map(v2 => ({ id: v2.id, name: v2.name, at: v2.at })),
      }).replace(/</g, '\\u003c')}</script><script src="/pedit.js?v=21"></script>` : ''}
</body></html>`);
      return;
    }

    if (p.startsWith('/api/')) return json(res, 404, { error: 'unknown endpoint' });

    /* ---------------- статика ---------------- */
    let file = p === '/' ? '/index.html' : p === '/landing' ? '/landing.html' : p;
    file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
    const full = path.join(PUBLIC, file);
    if (!full.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
    fs.readFile(full, (err, buf) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      const ext = path.extname(full);
      /* код всегда свежий (иначе браузер держит старый app.js), медиа кэшируются */
      const cache = ['.js', '.css', '.html'].includes(ext) ? 'no-cache' : 'public, max-age=86400';
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache });
      res.end(buf);
    });
  } catch (e) {
    console.error('[server]', e);
    json(res, 500, { error: e.message });
  }
});

/* curl/интеграторы с Expect: 100-continue — отвечаем и продолжаем как обычный запрос */
server.on('checkContinue', (req, res) => { res.writeContinue(); server.emit('request', req, res); });

server.listen(PORT, () => console.log(`Lumen CRM → http://localhost:${PORT}`));
