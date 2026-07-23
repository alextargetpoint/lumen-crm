/* Lumen CRM — демо-данные. Реалистичный срез агентства недвижимости:
   лиды по гео (Дубай/Бали/Пхукет/Испания), переписки WhatsApp на разных
   стадиях квалификации, брокеры, пул номеров, цепочки касаний, шаблоны. */
const { nextId } = require('./store');

const now = Date.now();
const MIN = 60e3, HOUR = 3600e3, DAY = 24 * HOUR;

function msg(leadId, dir, via, text, at, status) {
  return { id: nextId('m'), leadId, dir, via, text, at, status: status || (dir === 'out' ? 'read' : 'received') };
}

function seed() {
  const brokers = [
    { id: 'br_amir',  name: 'Амир Хусейн',   geo: 'dubai',  langs: ['ru', 'en', 'ar'], load: 14, capacity: 25, deals90: 6, avatar: 'АХ' },
    { id: 'br_dasha', name: 'Дарья Соколова', geo: 'dubai',  langs: ['ru', 'en'],       load: 21, capacity: 25, deals90: 4, avatar: 'ДС' },
    { id: 'br_ketut', name: 'Кетут Арта',     geo: 'bali',   langs: ['en', 'id'],       load: 9,  capacity: 20, deals90: 3, avatar: 'КА' },
    { id: 'br_lena',  name: 'Елена Мороз',    geo: 'phuket', langs: ['ru', 'en'],       load: 12, capacity: 22, deals90: 5, avatar: 'ЕМ' },
  ];

  const numbers = [
    { id: 'num_ae1', phone: '+971 58 512 04 71', geo: 'dubai',  channel: 'cloud_api', label: 'Дубай · Cloud API',  quality: 96, tier: '1K/сутки',  sentToday: 118, dayLimit: 1000, state: 'active',     warmupDay: null },
    { id: 'num_ae2', phone: '+971 52 337 88 12', geo: 'dubai',  channel: 'web',       label: 'Дубай · тёплый',     quality: 91, tier: '—',         sentToday: 34,  dayLimit: 120,  state: 'active',     warmupDay: null },
    { id: 'num_id1', phone: '+62 813 3902 4415', geo: 'bali',   channel: 'web',       label: 'Бали · тёплый',      quality: 88, tier: '—',         sentToday: 27,  dayLimit: 100,  state: 'active',     warmupDay: null },
    { id: 'num_th1', phone: '+66 92 481 70 03',  geo: 'phuket', channel: 'web',       label: 'Пхукет · тёплый',    quality: 73, tier: '—',         sentToday: 41,  dayLimit: 80,   state: 'active',     warmupDay: null },
    { id: 'num_es1', phone: '+34 641 20 88 46',  geo: 'spain',  channel: 'web',       label: 'Испания · прогрев',  quality: 64, tier: '—',         sentToday: 8,   dayLimit: 20,   state: 'warming',    warmupDay: 9 },
    { id: 'num_th2', phone: '+66 61 118 55 29',  geo: 'phuket', channel: 'web',       label: 'Пхукет · резерв',    quality: 38, tier: '—',         sentToday: 0,   dayLimit: 0,    state: 'quarantine', warmupDay: null },
  ];

  const templates = [
    { id: 'tpl_first_ru',  name: 'Первое касание · RU', category: 'utility',   lang: 'ru', status: 'approved',
      body: 'Здравствуйте, {name}! Это {agency}. Вы оставили заявку по недвижимости в {geo} — я помогу подобрать варианты. Подскажите, рассматриваете для жизни или как инвестицию?' },
    { id: 'tpl_first_en',  name: 'First touch · EN', category: 'utility',   lang: 'en', status: 'approved',
      body: 'Hi {name}! This is {agency}. You enquired about property in {geo} — happy to help. Are you looking to live in or to invest?' },
    { id: 'tpl_push_soft', name: 'Мягкий дожим · день 3', category: 'utility', lang: 'ru', status: 'approved',
      body: '{name}, добрый день! Подготовил для вас 3 варианта под ваш запрос в {geo}. Удобно, если пришлю сюда коротким сообщением?' },
    { id: 'tpl_wake_ru',   name: 'Пробуждение базы · RU', category: 'marketing', lang: 'ru', status: 'approved',
      body: '{name}, здравствуйте! Вы интересовались недвижимостью в {geo}. С тех пор вышли новые проекты с рассрочкой 0% — рынок заметно сдвинулся. Актуально посмотреть свежую подборку?' },
    { id: 'tpl_wake_en',   name: 'Wake-up · EN', category: 'marketing', lang: 'en', status: 'pending',
      body: 'Hi {name}! You were considering property in {geo} a while ago. New launches with 0% payment plans just dropped — want a fresh shortlist?' },
    { id: 'tpl_slot',      name: 'Слот со специалистом', category: 'utility', lang: 'ru', status: 'approved',
      body: '{name}, передаю вас нашему эксперту по {geo} — {broker}. Удобно созвониться завтра в {slot}? Если нет — предложу другое время.' },
  ];

  const sequences = [
    {
      id: 'seq_default', name: 'Стандартная · 7 касаний / 18 дней', geo: 'all', active: true,
      steps: [
        { day: 0,  channel: 'wa', mode: 'template', templateId: 'tpl_first_ru', label: 'Мгновенный ответ на заявку', active: true },
        { day: 1,  channel: 'wa', mode: 'ai', prompt: 'Короткий вопрос по одной незакрытой оси квалификации', label: 'Уточнение запроса', active: true },
        { day: 3,  channel: 'wa', mode: 'template', templateId: 'tpl_push_soft', label: 'Ценность: подборка', active: true },
        { day: 6,  channel: 'wa', mode: 'ai', prompt: 'Социальное доказательство: свежая сделка/кейс по гео клиента', label: 'Кейс по гео', active: true },
        { day: 9,  channel: 'voice', mode: 'ai', prompt: 'Голосовое 20-30 сек: личное обращение, приглашение на созвон', label: 'Голосовое', active: true },
        { day: 13, channel: 'wa', mode: 'ai', prompt: 'Смена угла: рассрочка/новый запуск/изменение цен', label: 'Новый повод', active: true },
        { day: 18, channel: 'wa', mode: 'ai', prompt: 'Финальное касание: мягкое закрытие, дверь остаётся открытой', label: 'Финальное касание', active: true },
      ],
    },
  ];

  const L = [];
  const M = [];
  const lead = (o) => { const l = Object.assign({
    id: nextId('ld'), createdAt: now - 2 * DAY, lastMsgAt: null, lastDir: null,
    stage: 'new', score: 0, source: 'meta_form', lang: 'ru', tz: 4,
    quals: { purpose: null, timeline: null, budget: null, type: null },
    ai: { enabled: true, chainStep: 0, nextTouchAt: null, silentSince: null },
    broker: null, summary: null, tags: [], numberId: null,
  }, o); L.push(l); return l; };

  /* ---- Горячий: квалифицирован ИИ, передан брокеру (демо-витрина) ---- */
  const l1 = lead({
    name: 'Ярослав Кузилек', phone: '+420 777 402 118', geo: 'dubai', lang: 'ru', tz: 1,
    stage: 'handover', score: 92, source: 'meta_form', broker: 'br_amir', numberId: 'num_ae1',
    createdAt: now - 6 * DAY, lastMsgAt: now - 3 * HOUR, lastDir: 'in',
    quals: {
      purpose:  { value: 'Инвестиция с арендным доходом', quote: 'интересует доход от аренды, сам жить не планирую' },
      timeline: { value: '1–2 месяца', quote: 'готов выйти на сделку в течение пары месяцев' },
      budget:   { value: '$172 000', quote: 'бюджет до 172 тысяч долларов' },
      type:     { value: '1BR / брендированный кондо-отель', quote: 'смотрю на 1-спальные в брендированных комплексах' },
    },
    summary: 'Инвестор из Праги. Цель — арендный доход, бюджет $172k, срок 1–2 мес. Интересуют брендированные кондо-отели, 1BR. Готов к созвону, предпочитает вечер по CET. Рассрочка интересна как опция, но не критична.',
    tags: ['горячий', 'инвестор'],
  });
  M.push(
    msg(l1.id, 'out', 'chain', 'Здравствуйте, Ярослав! Это One Agency. Вы оставили заявку по недвижимости в Дубае — я помогу подобрать варианты. Рассматриваете для жизни или как инвестицию?', now - 6 * DAY + 1 * MIN),
    msg(l1.id, 'in', null, 'Добрый день. Скорее инвестиция, интересует доход от аренды, сам жить не планирую', now - 6 * DAY + 40 * MIN),
    msg(l1.id, 'out', 'ai', 'Отличная цель — Дубай сейчас даёт 6–9% годовых в аренде. Чтобы предложить точные варианты: какой бюджет закладываете?', now - 6 * DAY + 42 * MIN),
    msg(l1.id, 'in', null, 'Бюджет до 172 тысяч долларов', now - 6 * DAY + 2 * HOUR),
    msg(l1.id, 'out', 'ai', 'Принял. В этом бюджете сильные варианты — 1BR в брендированных кондо-отелях (Bang Tao концепции, управление отелем, доход делится по пулу). Такой формат интересен или смотрим классические апартаменты?', now - 6 * DAY + 2 * HOUR + 3 * MIN),
    msg(l1.id, 'in', null, 'Смотрю на 1-спальные в брендированных комплексах. Какой план оплаты?', now - 5 * DAY),
    msg(l1.id, 'out', 'ai', 'План: 30% в течение 60 дней, далее 0% рассрочка до Q4 2027. Скидка агентства 5%, до +5% за 100% предоплату. По срокам — когда планируете выйти на сделку?', now - 5 * DAY + 6 * MIN),
    msg(l1.id, 'in', null, 'Готов выйти на сделку в течение пары месяцев. Давайте конкретику', now - 4 * DAY),
    msg(l1.id, 'out', 'ai', 'Ярослав, передаю вас нашему эксперту по Дубаю — Амиру. Он подготовит 3 адресных варианта под $172k с расчётом доходности. Удобно созвониться завтра до 19:00 CET?', now - 4 * DAY + 4 * MIN),
    msg(l1.id, 'in', null, 'Да, давайте завтра — вечером удобно. Жду варианты', now - 3 * HOUR),
  );

  /* ---- В активном ИИ-диалоге, 3 из 4 осей ---- */
  const l2 = lead({
    name: 'Мария Власова', phone: '+7 921 384 51 20', geo: 'bali', lang: 'ru', tz: 8,
    stage: 'dialog', score: 68, source: 'ctwa', numberId: 'num_id1',
    createdAt: now - 2 * DAY, lastMsgAt: now - 25 * MIN, lastDir: 'in',
    quals: {
      purpose:  { value: 'Переезд + удалённая работа', quote: 'хотим перезимовать, а дальше как пойдёт' },
      timeline: { value: '3–4 месяца', quote: 'к ноябрю хотим уже быть на месте' },
      budget:   null,
      type:     { value: 'Вилла, 2 спальни', quote: 'вилла с двумя спальнями и бассейном' },
    },
    tags: ['ctwa'],
  });
  M.push(
    msg(l2.id, 'in', null, 'Здравствуйте! Видела вашу рекламу про виллы на Бали, расскажите подробнее', now - 2 * DAY),
    msg(l2.id, 'out', 'ai', 'Мария, здравствуйте! Расскажу всё по делу. Подскажите для начала: рассматриваете Бали для жизни или как инвестицию под аренду?', now - 2 * DAY + 90e3),
    msg(l2.id, 'in', null, 'Хотим перезимовать, а дальше как пойдёт. Работаем удалённо', now - 2 * DAY + 20 * MIN),
    msg(l2.id, 'out', 'ai', 'Отлично, значит смотрим районы с быстрым интернетом и инфраструктурой — Чангу, Умалас, Берава. Какой формат ближе: вилла или апартаменты в комплексе?', now - 2 * DAY + 24 * MIN),
    msg(l2.id, 'in', null, 'Вилла с двумя спальнями и бассейном', now - 1 * DAY),
    msg(l2.id, 'out', 'ai', 'Есть сильные варианты в Бераве и Умаласе. По срокам когда планируете заезд?', now - 1 * DAY + 5 * MIN),
    msg(l2.id, 'in', null, 'К ноябрю хотим уже быть на месте', now - 25 * MIN),
  );

  /* ---- Молчун: цепочка касаний работает ---- */
  const l3 = lead({
    name: 'Denis Grinberg', phone: '+49 176 5521 8830', geo: 'dubai', lang: 'ru', tz: 2,
    stage: 'touch', score: 20, source: 'meta_form', numberId: 'num_ae1',
    createdAt: now - 4 * DAY, lastMsgAt: now - 4 * DAY + 3 * HOUR, lastDir: 'out',
    ai: { enabled: true, chainStep: 2, nextTouchAt: now + 26 * HOUR, silentSince: now - 4 * DAY + 1 * HOUR },
    tags: ['молчун'],
  });
  M.push(
    msg(l3.id, 'out', 'chain', 'Здравствуйте, Denis! Это One Agency. Вы оставили заявку по недвижимости в Дубае — я помогу подобрать варианты. Рассматриваете для жизни или как инвестицию?', now - 4 * DAY + 2 * MIN, 'read'),
    msg(l3.id, 'out', 'chain', 'Denis, добрый день! Чтобы не забрасывать вас лишним: одним словом — интересует Дубай для жизни, инвестиций или пока просто присматриваетесь? От этого соберу подборку.', now - 3 * DAY, 'delivered'),
    msg(l3.id, 'out', 'chain', 'Подготовил 3 варианта под стартовый запрос: от студии за $210k с рассрочкой до 1BR у Marina. Прислать сюда коротко?', now - 4 * DAY + 3 * HOUR + 2 * DAY, 'delivered'),
  );

  /* ---- Новый: только что упал из Lead Form ---- */
  const l4 = lead({
    name: 'Игорь Матвеев', phone: '+7 903 122 84 67', geo: 'dubai', lang: 'ru', tz: 3,
    stage: 'new', score: 0, source: 'meta_form', numberId: null,
    createdAt: now - 4 * MIN, lastMsgAt: null,
    ai: { enabled: true, chainStep: 0, nextTouchAt: now + 1 * MIN, silentSince: null },
    tags: ['новый'],
  });

  /* ---- Квалифицирован, назначен показ ---- */
  const l5 = lead({
    name: 'Anna Keller', phone: '+41 79 331 42 07', geo: 'phuket', lang: 'en', tz: 7,
    stage: 'viewing', score: 88, source: 'site', broker: 'br_lena', numberId: 'num_th1',
    createdAt: now - 12 * DAY, lastMsgAt: now - 1 * DAY, lastDir: 'in',
    quals: {
      purpose:  { value: 'Инвестиция + отдых (flip-friendly)', quote: 'mix of holidays and investment' },
      timeline: { value: 'До конца квартала', quote: 'this quarter ideally' },
      budget:   { value: '€300 000', quote: 'around 300k euro' },
      type:     { value: 'Апартаменты у моря, 1-2BR', quote: 'sea view condo, 1 or 2 bedrooms' },
    },
    summary: 'Инвестор из Цюриха, вторичная цель — отдых. Бюджет €300k, апартаменты у моря (Банг Тао / Лаян). Показ по видео назначен, далее прилёт в октябре.',
    tags: ['показ'],
  });
  M.push(
    msg(l5.id, 'in', null, 'Could we do a video viewing this week? Thursday works best', now - 1 * DAY),
  );

  /* ---- Сделка (депозит) — витрина «7 дней до депозита» ---- */
  const l6 = lead({
    name: 'Тимур Ахмедов', phone: '+998 90 123 55 41', geo: 'dubai', lang: 'ru', tz: 5,
    stage: 'deal', score: 100, source: 'meta_form', broker: 'br_amir', numberId: 'num_ae1',
    createdAt: now - 9 * DAY, lastMsgAt: now - 2 * DAY, lastDir: 'in',
    quals: {
      purpose:  { value: 'Инвестиция', quote: 'чисто под сдачу' },
      timeline: { value: 'Сразу', quote: 'готов внести депозит на этой неделе' },
      budget:   { value: '$240 000', quote: 'до 240' },
      type:     { value: '1BR, JVC', quote: 'однушка в JVC устроит' },
    },
    summary: 'Сделка: депозит внесён на 7-й день от заявки. 1BR в JVC, $238k, рассрочка 60/40.',
    tags: ['сделка', '7 дней'],
  });

  /* ---- Спящие (для реанимации) ---- */
  const sleepers = [
    ['Олег Рябцев',      '+7 916 220 41 87',  'dubai',  'ru', 3,  95, 'Смотрел студии до $150k, пропал после подборки'],
    ['Светлана Гусева',  '+7 925 813 60 22',  'dubai',  'ru', 3,  120, 'Спрашивала про ВНЖ через недвижимость'],
    ['Pavel Novak',      '+420 605 118 327',  'spain',  'en', 1,  75, 'Интересовался Коста-Бланкой, бюджет €200k'],
    ['Ирина Волкова',    '+7 911 402 77 19',  'bali',   'ru', 8,  60, 'Вилла под сдачу, ушла думать про управляющую компанию'],
    ['Marco Rossi',      '+39 340 221 8804',  'dubai',  'en', 1,  180, 'Флиппинг на офф-плане, замолчал после смены цен'],
    ['Гульнара Сафина',  '+7 917 883 12 45',  'phuket', 'ru', 5,  45, 'Апартаменты у моря до $180k, попросила не беспокоить месяц'],
    ['Andrey Bondar',    '+380 67 511 90 33', 'dubai',  'ru', 2,  210, 'Оставил заявку, ни разу не ответил'],
    ['Лия Карапетян',    '+374 91 40 22 87',  'dubai',  'ru', 4,  30, 'Сравнивала Дубай и Абу-Даби, взяла паузу'],
  ];
  sleepers.forEach(([name, phone, geo, lang, tz, daysAgo, note], i) => {
    lead({
      name, phone, geo, lang, tz,
      stage: 'sleeping', score: 10 + (i * 7) % 40, source: i % 3 === 0 ? 'site' : 'meta_form',
      createdAt: now - daysAgo * DAY, lastMsgAt: now - (daysAgo - 2) * DAY, lastDir: i === 6 ? 'out' : 'in',
      ai: { enabled: false, chainStep: 7, nextTouchAt: null, silentSince: now - (daysAgo - 2) * DAY },
      summary: note, tags: ['спящий'],
    });
  });

  /* ---- Потерянный ---- */
  lead({
    name: 'Виктор Стрелков', phone: '+7 926 771 30 58', geo: 'dubai', lang: 'ru', tz: 3,
    stage: 'lost', score: 5, source: 'meta_form',
    createdAt: now - 20 * DAY, lastMsgAt: now - 18 * DAY, lastDir: 'in',
    summary: 'Бюджет $40k — вне рынка. Даунсейл не подошёл, закрыт корректно.', tags: [],
  });

  const events = [
    { at: now - 4 * MIN, type: 'lead_new', leadId: l4.id, text: 'Новый лид из Meta Lead Form: Игорь Матвеев · Дубай' },
    { at: now - 25 * MIN, type: 'msg_in', leadId: l2.id, text: 'Мария Власова ответила — закрыта ось «срок» (3 из 4)' },
    { at: now - 3 * HOUR, type: 'msg_in', leadId: l1.id, text: 'Ярослав Кузилек подтвердил созвон с Амиром' },
    { at: now - 1 * DAY, type: 'stage', leadId: l5.id, text: 'Anna Keller → стадия «Показ» (видео-показ, четверг)' },
    { at: now - 2 * DAY, type: 'deal', leadId: l6.id, text: 'Депозит: Тимур Ахмедов · 1BR JVC · $238k — 7 дней от заявки' },
  ];

  return {
    settings: {
      agency: { name: 'One Agency', geos: ['dubai', 'bali', 'phuket', 'spain'] },
      wa: { mode: 'mock', phoneId: '', wabaId: '', tokenSet: false, webhookVerifyToken: 'lumen-verify' },
      ai: { provider: 'mock', autopilot: true, model: '' },
      demo: { accelerate: true, dayMs: 90e3, simulateReplies: true },
      criteria: {
        dubai:  { budgetMin: 130000, currency: 'USD', purposes: ['Инвестиция', 'Переезд', 'ВНЖ'], downsell: 'Ниже $130k — офф-план студии JVC/Dubai South, рассрочка 1%/мес', notes: 'Вторичка-first при бюджете от $250k' },
        bali:   { budgetMin: 120000, currency: 'USD', purposes: ['Аренда/доход', 'Зимовка', 'Переезд'], downsell: 'Ниже $120k — апартаменты в комплексах Убуд/Букит', notes: 'Лизхолд до 30 лет — проговаривать сразу' },
        phuket: { budgetMin: 100000, currency: 'USD', purposes: ['Инвестиция', 'Отдых+доход'], downsell: 'Ниже $100k — студии Наи Харн / Раваи', notes: 'Гарантированная доходность 5-7% в управляемых' },
        spain:  { budgetMin: 150000, currency: 'EUR', purposes: ['ВНЖ', 'Переезд', 'Инвестиция'], downsell: 'Ниже €150k — Торревьеха/Аликанте вторичка', notes: 'Золотая виза отменена — не обещать' },
      },
      stopWords: ['не пишите', 'отпишите', 'удалите номер', 'stop', 'unsubscribe'],
      geoNames: { dubai: 'Дубай', bali: 'Бали', phuket: 'Пхукет', spain: 'Испания' },
    },
    brokers, numbers, templates, sequences,
    leads: L, messages: M, events,
    campaigns: [
      {
        id: 'cmp_demo', name: 'Спящие Дубай · сентябрьские запуски', state: 'draft',
        filters: { geo: 'dubai', olderDays: 30, stages: ['sleeping'] },
        batchSize: 3, pauseMin: [20, 60], window: [10, 20], templateId: 'tpl_wake_ru',
        stats: { sent: 0, delivered: 0, replied: 0, qualified: 0, skipped: 0 },
        recipients: [], cursor: 0, log: [], createdAt: now - 1 * HOUR, nextBatchAt: null,
      },
    ],
    counters: { aiFirstContactSec: 58, humanFirstContactMin: 47 },
  };
}

module.exports = { seed };
