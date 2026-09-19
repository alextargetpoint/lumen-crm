/* Lumen CRM — биллинг подписки агентства (личный кабинет).
   Модель продукта = модель лендинга: платят за платформу, расходники
   (WhatsApp-шаблоны + токены ИИ) идут пробросом по себестоимости.
   Оплата: Stripe Checkout, если задан STRIPE_SECRET_KEY; иначе — счёт
   (проформа) на банковский перевод. Ни та, ни другая ветка не создаёт
   регулярных расходов сама по себе — Stripe берёт комиссию только с
   фактического платежа. */
const https = require('https');
const store = require('./store');

/* ---- прайс (per-month $, зеркалит landing.html) ---- */
const PRICES = {
  broker:  { name: 'Брокер',   monthly: 80,  yearly: 64,  seatsIncluded: 1, seat: 0,  seatYearly: 0,  leadCap: 400 },
  /* синхронно с публичным сайтом (land.html): $200/мес за команду 5 брокеров + руководитель, внедрение $200 разово */
  agency:  { name: 'Агентство', monthly: 200, yearly: 160, seatsIncluded: 6, seat: 25, seatYearly: 20, leadCap: null, setup: 200 },
  network: { name: 'Сеть',     custom: true },
};
const CYCLES = ['monthly', 'yearly'];
const PLANS = Object.keys(PRICES);
/* платные опции сопровождения (сверх тарифа) */
const ADDONS = {
  onboarding: { label: 'Помощь с подключением + частичная кастомизация', once: 200 },   // разово
  assist:     { label: 'Ассистирование (развёрнутый фидбек, правки)', monthly: 50 },     // ежемесячно
};

function defBilling() {
  const now = Date.now();
  return {
    plan: 'agency', cycle: 'monthly', seats: 3, status: 'trial',
    trialEndsAt: now + 14 * 86400e3,
    currentPeriodEnd: now + 14 * 86400e3,
    method: null,                 // { brand, last4, exp } — когда карта привязана
    payMode: 'invoice',           // 'stripe' | 'invoice'
    stripe: { customerId: null, subId: null },
    company: { legalName: '', vat: '', email: '', address: '' },
    invoices: [],
    usage: { periodStart: now, waTemplates: 0, aiRequests: 0 },
    addons: { interpreter: false, onboarding: false, assist: false },
    balance: 0,                   // предоплаченный баланс РАСХОДНИКОВ (USD) — пополняется криптой
    cryptoTopups: [],             // [{id, amountUsd, exactAmount, chain, address, status:'pending'|'confirmed'|'expired', txid, createdAt, confirmedAt}]
    creditedTxids: [],            // txid уже зачисленных переводов — идемпотентность (не задваивать)
  };
}
/* зачислить подтверждённый крипто-перевод на баланс расходников (идемпотентно по txid) */
function creditTopup(db, topup, txid, actualAmount) {
  const b = db.settings.billing;
  b.creditedTxids = b.creditedTxids || [];
  if (txid && b.creditedTxids.includes(txid)) return false;   // уже зачислено (идемпотентность по txid)
  // зачисляем РОВНО столько, сколько реально пришло on-chain (маркер-«хвост» не теряется);
  // если фактическая сумма не передана — фоллбэк на exactAmount, затем на базовую
  const credited = +((actualAmount != null ? actualAmount : (topup.exactAmount != null ? topup.exactAmount : topup.amountUsd)) || 0).toFixed(2);
  b.balance = +((b.balance || 0) + credited).toFixed(2);
  topup.creditedAmount = credited;
  topup.status = 'confirmed'; topup.txid = txid || topup.txid || null; topup.confirmedAt = Date.now();
  if (txid) b.creditedTxids.push(txid);
  return true;
}

/* Списание с предоплаченного баланса расходников. НИКОГДА не уходим в минус.
   Возвращает {ok, balance} — при нехватке ok:false и баланс не трогаем. Идёт журнал. */
function chargeBalance(db, amountUsd, reason) {
  const b = db.settings.billing;
  const amt = +(+amountUsd || 0).toFixed(2);
  if (!(amt > 0)) return { ok: true, balance: b.balance || 0, charged: 0 };
  if ((b.balance || 0) + 1e-9 < amt) return { ok: false, error: 'insufficient_balance', balance: b.balance || 0, need: amt };
  b.balance = +((b.balance || 0) - amt).toFixed(2);
  b.charges = b.charges || [];
  b.charges.unshift({ amount: amt, reason: reason || '', at: Date.now(), balanceAfter: b.balance });
  if (b.charges.length > 200) b.charges.length = 200;
  return { ok: true, balance: b.balance, charged: amt };
}

/* ---- расчёт стоимости выбранной конфигурации ---- */
function quote(plan, cycle, seats, addons) {
  const def = PRICES[plan] || PRICES.agency;
  if (def.custom) return { plan, custom: true, name: def.name };
  cycle = CYCLES.includes(cycle) ? cycle : 'monthly';
  seats = Math.max(def.seatsIncluded, Math.min(200, +seats || def.seatsIncluded));
  const base = cycle === 'yearly' ? def.yearly : def.monthly;
  const seatPrice = cycle === 'yearly' ? def.seatYearly : def.seat;
  const extraSeats = Math.max(0, seats - def.seatsIncluded);
  const a = addons || {};
  const assistMonthly = a.assist ? ADDONS.assist.monthly : 0;      // рекуррентно
  const onboardingOnce = a.onboarding ? ADDONS.onboarding.once : 0; // разово (в первый платёж)
  const monthlyTotal = base + extraSeats * seatPrice + assistMonthly;
  const recurringNow = cycle === 'yearly' ? monthlyTotal * 12 : monthlyTotal;
  const billedNow = +(recurringNow + onboardingOnce).toFixed(2);
  return {
    plan, name: def.name, cycle, seats, seatsIncluded: def.seatsIncluded,
    base, seatPrice, extraSeats, assistMonthly, onboardingOnce, monthlyTotal, recurringNow, billedNow,
    saveYearlyPct: cycle === 'yearly' ? Math.round((1 - def.yearly / def.monthly) * 100) : 0,
    leadCap: def.leadCap,
  };
}

/* ---- ставки расходников (проброс по себестоимости; редактируются в кабинете, дефолты ниже) ---- */
const RATE_DEFAULTS = {
  wa: 0.04,          // WhatsApp-сообщение/шаблон (усреднённо utility+marketing), $
  aiMsg: 0.002,      // проход ИИ на входящее сообщение (flash-lite), $
  telephonyMin: 0.02,// минута телефонии (DIDWW + запись), $
  sttMin: 0.006,     // минута транскрибации звонка (Whisper), $
  numWaQr: 9,        // номер WhatsApp (QR/серый): аренда=покупка, $/мес
  numTg: 9,          // номер Telegram: аренда=покупка, $/мес
  numCloud: 3,       // номер WhatsApp Cloud API (OTP, из движка Telnyx): $/мес
  numTel: 3,         // номер телефонии (Telnyx, звонки+запись): $/мес
};
function rates(db) { return { ...RATE_DEFAULTS, ...((db.settings.billing && db.settings.billing.rates) || {}) }; }
/* аренда номера: себестоимость (Telnyx ~$1) + наценка платформы $2 → агентству $3/мес (синхронно с TELNYX_MARKUP) */
const NUMBER_MARKUP = 2;
const NUMBER_PRICE_SHOWN = 1 + NUMBER_MARKUP;

/* ---- итемизированная оценка расходников за текущий период + прогноз на месяц ---- */
function usageEstimate(db) {
  const b = db.settings.billing;
  const from = (b.usage && b.usage.periodStart) || 0;
  const now = Date.now();
  const R = rates(db);
  const msgs = db.messages || [];
  const outbound = msgs.filter(m => m.dir === 'out' && (m.at || 0) >= from && m.channel !== 'email').length;
  const inbound = msgs.filter(m => m.dir === 'in' && (m.at || 0) >= from).length;
  /* минуты телефонии — из счётчика (наполняет пайплайн DIDWW) или из журнала звонков, если есть */
  const telephonyMin = Math.round((b.usage && b.usage.telephonyMin) || 0);
  /* минуты транскрибации — из разборов звонков/транскриптов за период */
  const sttMin = Math.round((b.usage && b.usage.sttMin) || (db.callReviews || []).filter(r => (r.at || 0) >= from).length * 6);
  const line = (key, label, unit, qty, rate) => ({ key, label, unit, qty, rate, cost: +(qty * rate).toFixed(2) });
  /* ── ГРУППА A: списывается с ПРЕДОПЛАЧЕННОГО баланса (крипта) — то, за что платим провайдерам МЫ ──
     ИИ-обработка, минуты телефонии+запись, транскрибация. Сообщения WhatsApp Cloud API сюда НЕ входят
     (их биллит Meta напрямую на карту клиента — см. группу B). Серый WhatsApp/Telegram не берут поштучную
     плату за сообщение — там только аренда номера (ниже). */
  const balanceItems = [
    line('ai', 'ИИ-обработка переписки', 'входящих', inbound, R.aiMsg),
    line('telephony', 'Телефония (звонки+запись)', 'минут', telephonyMin, R.telephonyMin),
    line('stt', 'Транскрибация звонков', 'минут', sttMin, R.sttMin),
  ];
  const usageTotal = +(balanceItems.reduce((s, i) => s + i.cost, 0)).toFixed(2);
  /* прогноз на 30 дней: линейная экстраполяция от накопленного за прошедшую часть периода */
  const elapsedDays = Math.max(0.5, (now - from) / 86400e3);
  const usageForecast = +(usageTotal / elapsedDays * 30).toFixed(2);
  /* аренда номеров = ПОКУПКА номера (номер даётся на 1 месяц; продление = списание с баланса ежемесячно).
     По факту: берём реально уплаченную цену за номер (n.priceUsd), фоллбэк — ставка типа (дефолт $9/мес).
     Считаем только купленные виртуальные номера (свой номер по QR не арендуется). Провайдер СКРЫТ. */
  const waQrNums  = (((db.settings.waGray  || {}).numbers) || []).filter(n => n && n.source === 'yesim');
  const tgNums    = (((db.settings.tgGray  || {}).numbers) || []).filter(Boolean);
  const cloudNums = Object.values(((db.settings.telephony || {}).otpNumbers) || db.otpNumbers || {});
  const telNums   = (((db.settings.telephony || {}).fromNumbers) || []).filter(Boolean).map(n => (typeof n === 'string' ? {} : n));
  const sumPrice = (arr, fallback) => +arr.reduce((s, n) => s + (+((n && n.priceUsd) || fallback)), 0).toFixed(2);
  const rentals = [
    { key: 'wa_qr', label: 'Номера WhatsApp (QR) · аренда=покупка', count: waQrNums.length,  rate: R.numWaQr, cost: sumPrice(waQrNums, R.numWaQr) },
    { key: 'tg',    label: 'Номера Telegram · аренда=покупка',      count: tgNums.length,    rate: R.numTg,   cost: sumPrice(tgNums, R.numTg) },
    { key: 'cloud', label: 'Номера WhatsApp Cloud API · аренда=покупка', count: cloudNums.length, rate: R.numCloud, cost: sumPrice(cloudNums, R.numCloud) },
    { key: 'tel',   label: 'Номера телефонии · аренда=покупка',     count: telNums.length,   rate: R.numTel,  cost: sumPrice(telNums, R.numTel) },
  ].filter(r => r.count > 0);
  const numbersCount = rentals.reduce((s, r) => s + r.count, 0);
  const numbersMonthly = +(rentals.reduce((s, r) => s + r.cost, 0)).toFixed(2);
  /* прогноз к списанию с БАЛАНСА за месяц = расходники (прогноз) + аренда всех номеров (флэт/мес) */
  const balanceMonthlyForecast = +(usageForecast + numbersMonthly).toFixed(2);

  /* ── ГРУППА B: WhatsApp Cloud API — сообщения биллит META напрямую на КАРТУ клиента (не наш баланс) ──
     Мы это НЕ списываем; показываем справочно + требуем подключённую карту в Meta Business. */
  const waSettings = (db.settings.channels && db.settings.channels.whatsapp) || db.settings.whatsapp || {};
  const cloudConnected = !!(waSettings.token || waSettings.phoneNumberId || (waSettings.cloud && waSettings.cloud.token));
  const cardMeta = {
    conversations: outbound,                                   // отправленные (ориентир объёма)
    estCost: +(outbound * R.wa).toFixed(2),                    // грубая справочная оценка (тарифицирует Meta)
    cardConnected: !!(waSettings.cardConnected || waSettings.billingConnected),
    cloudConnected,
    note: 'Оплачивается напрямую в Meta с карты, привязанной к вашему WhatsApp Business (WABA). На баланс расходников не влияет.',
  };
  const periodEnd = (db.settings.billing.currentPeriodEnd) || (from ? from + 30 * 86400e3 : now + 30 * 86400e3);
  return {
    /* группа A (баланс/крипта) */
    balanceItems, usageTotal, usageForecast, rentals, numbersCount, numbersMonthly,
    balanceMonthlyForecast, balance: db.settings.billing.balance || 0,
    /* группа B (карта Meta) */
    cardMeta,
    /* мета/совместимость */
    rates: R, periodStart: from, periodEnd, elapsedDays: Math.round(elapsedDays * 10) / 10,
    outbound, inbound, telephonyMin, sttMin,
    billedAtPeriodEnd: false, consumablesStatus: 'prepaid',    // теперь: предоплата с баланса, не постоплата
    numberPrice: R.numWaQr,
    /* legacy-алиасы, чтобы не сломать старый фронт до перерисовки */
    items: balanceItems, total: usageTotal, forecast: usageForecast,
    monthlyForecast: balanceMonthlyForecast,
    waCost: cardMeta.estCost, aiCost: balanceItems[0].cost,
  };
}

/* ---- полный вид кабинета для фронта ---- */
function view(db) {
  const b = db.settings.billing;
  const q = quote(b.plan, b.cycle, b.seats, b.addons);
  const { invoiceReceipts, creditedTxids, ...pub } = b;   /* не отдаём фронту тяжёлые/внутренние поля (base64 квитанций, txid-журнал) */
  return {
    ...pub,
    quote: q,
    prices: PRICES,
    usageLive: usageEstimate(db),
    stripeReady: !!process.env.STRIPE_SECRET_KEY,
    daysLeft: b.currentPeriodEnd ? Math.max(0, Math.ceil((b.currentPeriodEnd - Date.now()) / 86400e3)) : null,
  };
}

/* ---- сменить план/цикл/места ---- */
function setPlan(db, { plan, cycle, seats, addons }) {
  const b = db.settings.billing;
  if (plan && PLANS.includes(plan)) b.plan = plan;
  if (cycle && CYCLES.includes(cycle)) b.cycle = cycle;
  if (seats != null) b.seats = Math.max(1, Math.min(200, +seats || 1));
  if (addons && typeof addons === 'object') {
    b.addons = b.addons || {};
    if ('onboarding' in addons) b.addons.onboarding = !!addons.onboarding;
    if ('assist' in addons) b.addons.assist = !!addons.assist;
    if ('interpreter' in addons) b.addons.interpreter = !!addons.interpreter;
  }
  store.save();
  return view(db);
}

/* ---- выставить счёт (проформа) на текущую конфигурацию ---- */
function issueInvoice(db, { method } = {}) {
  const b = db.settings.billing;
  const q = quote(b.plan, b.cycle, b.seats, b.addons);
  if (q.custom) return { error: 'Тариф «Сеть» — по договору, счёт формирует менеджер' };
  const now = Date.now();
  const isStripe = method === 'stripe';
  /* SEC(#3): НИКОГДА не помечаем 'paid' по клиентскому полю. Stripe → 'pending' до
     верифицированного вебхука (markInvoicePaid). Ручной/банк → 'issued' (владелец подтверждает оффлайн). */
  /* позиции счёта (для PDF счёт-фактуры) — фиксируем на момент выставления */
  const mult = q.cycle === 'yearly' ? 12 : 1;
  const per = q.cycle === 'yearly' ? '/год' : '/мес';
  /* строки должны в сумме давать billedNow (setup — разовый, в billedNow не входит → в счёт этого периода не кладём) */
  const lines = [{ desc: `Подписка «${q.name}» · платформа${q.cycle === 'yearly' ? ' (годовая)' : ''}`, qty: 1, unit: +(q.base * mult).toFixed(2), amount: +(q.base * mult).toFixed(2) }];
  if (q.extraSeats) lines.push({ desc: `Доп. места брокеров × ${q.extraSeats}`, qty: q.extraSeats, unit: +(q.seatPrice * mult).toFixed(2), amount: +(q.extraSeats * q.seatPrice * mult).toFixed(2) });
  if (q.assistMonthly) lines.push({ desc: `Ассистирование${q.cycle === 'yearly' ? ' (12 мес)' : ''}`, qty: mult, unit: q.assistMonthly, amount: +(q.assistMonthly * mult).toFixed(2) });
  if (q.onboardingOnce) lines.push({ desc: 'Помощь с подключением + частичная кастомизация (разово)', qty: 1, unit: q.onboardingOnce, amount: q.onboardingOnce });
  const inv = {
    id: 'INV-' + String(now).slice(-8),
    at: now,
    plan: q.plan, planName: q.name, cycle: q.cycle, seats: q.seats,
    amount: q.billedNow, currency: 'USD', lines,
    company: Object.assign({}, b.company || {}),   /* снимок реквизитов на момент счёта */
    period: q.cycle === 'yearly' ? '12 мес' : '1 мес',
    status: isStripe ? 'pending' : 'issued',
    method: method || b.payMode,
  };
  b.invoices.unshift(inv);
  if (b.invoices.length > 60) b.invoices.length = 60;
  if (q.onboardingOnce && b.addons) b.addons.onboarding = false;   /* разовая опция уже в счёте — не биллим повторно */
  /* активируем подписку ТОЛЬКО для ручного/банк-пути (владелец подтверждает своей же оплатой).
     Для Stripe активация происходит в markInvoicePaid() из верифицированного вебхука. */
  if (!isStripe) {
    b.status = 'active';
    b.currentPeriodEnd = now + (q.cycle === 'yearly' ? 365 : 30) * 86400e3;
    b.usage = { periodStart: now, waTemplates: 0, aiRequests: 0 };
  }
  store.save();
  return { invoice: inv, view: view(db) };
}

/* SEC(#3): отметить счёт оплаченным — вызывается ТОЛЬКО из верифицированного Stripe-вебхука */
function markInvoicePaid(db, invId) {
  const b = db.settings.billing;
  const inv = (b.invoices || []).find(i => i.id === invId);   /* SEC: только точное совпадение — без фолбэка на первый счёт */
  if (!inv) return { error: 'invoice not found' };
  if (inv.status === 'paid') return { invoice: inv, view: view(db) };
  inv.status = 'paid';
  const now = Date.now();
  b.status = 'active';
  b.currentPeriodEnd = now + (inv.cycle === 'yearly' ? 365 : 30) * 86400e3;
  b.usage = { periodStart: now, waTemplates: 0, aiRequests: 0 };
  if (b.addons) b.addons.onboarding = false;   /* разовая опция оплачена — снимаем */
  store.save();
  return { invoice: inv, view: view(db) };
}

/* ---- подтверждение КРИПТО-оплаты ПОДПИСКИ (не расходников): активирует подписку и пишет оплаченный счёт.
   Идемпотентно по txid. Деньги НЕ идут в баланс расходников — это отдельная оплата подписки. ---- */
function confirmSubscriptionCrypto(db, topup, txid, actualAmount) {
  const b = db.settings.billing;
  b.creditedTxids = b.creditedTxids || [];
  if (txid && b.creditedTxids.includes(txid)) return false;   // уже обработано
  const paid = +((actualAmount != null ? actualAmount : (topup.exactAmount != null ? topup.exactAmount : topup.amountUsd)) || 0).toFixed(2);
  const q = quote(b.plan, b.cycle, b.seats, b.addons);
  const now = Date.now();
  const chain = (topup.chain || '').toUpperCase();
  const mult = q.cycle === 'yearly' ? 12 : 1;
  /* итемизируем: платформа + доп.места + ассистирование + разовое подключение — чтобы клиент видел, за что заплатил */
  const lines = [{ desc: `Подписка «${q.name}»${q.cycle === 'yearly' ? ' (год)' : ''} · платформа`, qty: 1, unit: +(q.base * mult).toFixed(2), amount: +(q.base * mult).toFixed(2) }];
  if (q.extraSeats) lines.push({ desc: `Доп. места брокеров × ${q.extraSeats}`, qty: q.extraSeats, unit: +(q.seatPrice * mult).toFixed(2), amount: +(q.extraSeats * q.seatPrice * mult).toFixed(2) });
  if (q.assistMonthly) lines.push({ desc: `Ассистирование${q.cycle === 'yearly' ? ' (12 мес)' : ''}`, qty: mult, unit: q.assistMonthly, amount: +(q.assistMonthly * mult).toFixed(2) });
  if (q.onboardingOnce) lines.push({ desc: 'Помощь с подключением + частичная кастомизация (разово)', qty: 1, unit: q.onboardingOnce, amount: q.onboardingOnce });
  const inv = {
    id: 'RCP-' + String(now).slice(-8), at: now,   /* RCP = квитанция (крипта), не счёт-фактура */
    plan: q.plan, planName: q.name, cycle: q.cycle, seats: q.seats,
    amount: paid, currency: 'USD', lines,
    company: {},                                    /* крипта — БЕЗ юр. реквизитов: это квитанция, не счёт-фактура */
    period: q.cycle === 'yearly' ? '12 мес' : '1 мес',
    status: 'paid', method: 'crypto', receipt: true, paidAt: now, txid: txid || null,
  };
  b.invoices = b.invoices || []; b.invoices.unshift(inv); if (b.invoices.length > 60) b.invoices.length = 60;
  b.status = 'active';
  b.currentPeriodEnd = now + (q.cycle === 'yearly' ? 365 : 30) * 86400e3;
  b.usage = { periodStart: now, waTemplates: 0, aiRequests: 0 };
  b.lastPaidVia = 'crypto';
  /* фиксируем оплаченное разовое сопровождение как ВИДИМУЮ услугу (не просто гасим тумблер) */
  if (b.addons && b.addons.onboarding) {
    b.services = b.services || [];
    b.services.unshift({ key: 'onboarding', label: 'Помощь с подключением + частичная кастомизация', amount: ADDONS.onboarding.once, at: now, status: 'active', via: 'crypto' });
    b.addons.onboarding = false;   /* разовая опция оплачена — снимаем тумблер, чтобы не биллить повторно */
  }
  topup.creditedAmount = paid; topup.status = 'confirmed'; topup.txid = txid || topup.txid || null; topup.confirmedAt = now; topup.appliedTo = 'subscription';
  if (txid) b.creditedTxids.push(txid);
  return true;
}

/* ---- привязать способ оплаты (демо/ручной ввод карты — храним только маску) ---- */
function setMethod(db, { brand, last4, exp, payMode, company }) {
  const b = db.settings.billing;
  if (payMode === 'invoice' || payMode === 'stripe') b.payMode = payMode;
  if (last4) b.method = { brand: String(brand || 'card').slice(0, 20), last4: String(last4).replace(/\D/g, '').slice(-4), exp: String(exp || '').slice(0, 7) };
  if (company) b.company = Object.assign(b.company || {}, {
    legalName: String(company.legalName || '').slice(0, 160),
    vat: String(company.vat || '').slice(0, 40),
    email: String(company.email || '').slice(0, 120),
    address: String(company.address || '').slice(0, 240),
  });
  store.save();
  return view(db);
}

/* ---- Stripe Checkout (subscription) через сырой HTTPS, без npm-зависимости ----
   Работает только при заданном STRIPE_SECRET_KEY. price_data позволяет не
   заводить Price-объекты заранее. Возвращает {url} на страницу оплаты Stripe. */
function stripeForm(obj, prefix, out) {
  out = out || {};
  for (const k of Object.keys(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    const v = obj[k];
    if (v && typeof v === 'object') stripeForm(v, key, out);
    else if (v != null) out[key] = String(v);
  }
  return out;
}
function stripePost(path, form) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(form).toString();
    const req = https.request({
      host: 'api.stripe.com', path, method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (r) => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { const j = JSON.parse(d); r.statusCode < 300 ? resolve(j) : reject(new Error(j.error?.message || 'stripe ' + r.statusCode)); } catch (e) { reject(e); } });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}
async function stripeCheckout(db, baseUrl) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe не настроен: задайте STRIPE_SECRET_KEY');
  const b = db.settings.billing;
  const q = quote(b.plan, b.cycle, b.seats);
  if (q.custom) throw new Error('Тариф «Сеть» оформляется по договору');
  const interval = q.cycle === 'yearly' ? 'year' : 'month';
  const unit = q.cycle === 'yearly' ? q.billedNow : q.monthlyTotal; // year: годовая сумма разом
  const form = stripeForm({
    mode: 'subscription',
    success_url: baseUrl + '/#billing?paid=1',
    cancel_url: baseUrl + '/#billing',
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(unit * 100),
        recurring: { interval },
        product_data: { name: `Lumen · ${q.name} (${q.cycle === 'yearly' ? 'год' : 'месяц'}, мест: ${q.seats})` },
      },
    }],
    metadata: { plan: q.plan, cycle: q.cycle, seats: q.seats },
    ...(b.company && b.company.email ? { customer_email: b.company.email } : {}),
  });
  const sess = await stripePost('/v1/checkout/sessions', form);
  b.payMode = 'stripe';
  b.stripe.checkoutId = sess.id;
  store.save();
  return { url: sess.url };
}

/* ---- редактировать ставки расходников (кабинет) ---- */
function setRates(db, patch) {
  const b = db.settings.billing;
  b.rates = { ...RATE_DEFAULTS, ...(b.rates || {}) };
  for (const k of Object.keys(RATE_DEFAULTS)) { if (patch && patch[k] != null && !isNaN(+patch[k])) b.rates[k] = Math.max(0, +patch[k]); }
  store.save();
  return view(db);
}
/* ---- инкремент фактического потребления (телефония/STT) — зовёт пайплайн звонков ---- */
function addUsage(db, { telephonyMin = 0, sttMin = 0 } = {}) {
  const b = db.settings.billing;
  b.usage = b.usage || { periodStart: Date.now() };
  b.usage.telephonyMin = (b.usage.telephonyMin || 0) + Math.max(0, +telephonyMin || 0);
  b.usage.sttMin = (b.usage.sttMin || 0) + Math.max(0, +sttMin || 0);
  store.save();
}
module.exports = { PRICES, ADDONS, defBilling, quote, view, setPlan, issueInvoice, markInvoicePaid, setMethod, stripeCheckout, usageEstimate, setRates, addUsage, creditTopup, chargeBalance, confirmSubscriptionCrypto };
