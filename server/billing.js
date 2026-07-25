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
  broker:  { name: 'Брокер',   monthly: 49,  yearly: 39,  seatsIncluded: 1, seat: 0,  seatYearly: 0,  leadCap: 400 },
  agency:  { name: 'Агентство', monthly: 249, yearly: 199, seatsIncluded: 3, seat: 25, seatYearly: 20, leadCap: null },
  network: { name: 'Сеть',     custom: true },
};
const CYCLES = ['monthly', 'yearly'];
const PLANS = Object.keys(PRICES);

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
    addons: { interpreter: false },
  };
}

/* ---- расчёт стоимости выбранной конфигурации ---- */
function quote(plan, cycle, seats) {
  const def = PRICES[plan] || PRICES.agency;
  if (def.custom) return { plan, custom: true, name: def.name };
  cycle = CYCLES.includes(cycle) ? cycle : 'monthly';
  seats = Math.max(def.seatsIncluded, Math.min(200, +seats || def.seatsIncluded));
  const base = cycle === 'yearly' ? def.yearly : def.monthly;
  const seatPrice = cycle === 'yearly' ? def.seatYearly : def.seat;
  const extraSeats = Math.max(0, seats - def.seatsIncluded);
  const monthlyTotal = base + extraSeats * seatPrice;
  const billedNow = cycle === 'yearly' ? monthlyTotal * 12 : monthlyTotal;
  return {
    plan, name: def.name, cycle, seats, seatsIncluded: def.seatsIncluded,
    base, seatPrice, extraSeats, monthlyTotal, billedNow,
    saveYearlyPct: cycle === 'yearly' ? Math.round((1 - def.yearly / def.monthly) * 100) : 0,
    leadCap: def.leadCap,
  };
}

/* ---- оценка расходников за текущий период (проброс, по себестоимости) ---- */
function usageEstimate(db) {
  const b = db.settings.billing;
  const from = (b.usage && b.usage.periodStart) || 0;
  const msgs = db.messages || [];
  const outbound = msgs.filter(m => m.dir === 'out' && (m.at || 0) >= from).length;
  const inbound = msgs.filter(m => m.dir === 'in' && (m.at || 0) >= from).length;
  /* WhatsApp: utility-шаблон ≈ $0.03, marketing/реанимация ≈ $0.05 (усредняем $0.04);
     ИИ: один проход квалификатора ≈ $0.002 на входящее сообщение (flash-lite). */
  const waCost = +(outbound * 0.04).toFixed(2);
  const aiCost = +(inbound * 0.002).toFixed(2);
  return { outbound, inbound, waCost, aiCost, total: +(waCost + aiCost).toFixed(2) };
}

/* ---- полный вид кабинета для фронта ---- */
function view(db) {
  const b = db.settings.billing;
  const q = quote(b.plan, b.cycle, b.seats);
  return {
    ...b,
    quote: q,
    prices: PRICES,
    usageLive: usageEstimate(db),
    stripeReady: !!process.env.STRIPE_SECRET_KEY,
    daysLeft: b.currentPeriodEnd ? Math.max(0, Math.ceil((b.currentPeriodEnd - Date.now()) / 86400e3)) : null,
  };
}

/* ---- сменить план/цикл/места ---- */
function setPlan(db, { plan, cycle, seats }) {
  const b = db.settings.billing;
  if (plan && PLANS.includes(plan)) b.plan = plan;
  if (cycle && CYCLES.includes(cycle)) b.cycle = cycle;
  if (seats != null) b.seats = Math.max(1, Math.min(200, +seats || 1));
  store.save();
  return view(db);
}

/* ---- выставить счёт (проформа) на текущую конфигурацию ---- */
function issueInvoice(db, { method } = {}) {
  const b = db.settings.billing;
  const q = quote(b.plan, b.cycle, b.seats);
  if (q.custom) return { error: 'Тариф «Сеть» — по договору, счёт формирует менеджер' };
  const now = Date.now();
  const inv = {
    id: 'INV-' + String(now).slice(-8),
    at: now,
    plan: q.plan, planName: q.name, cycle: q.cycle, seats: q.seats,
    amount: q.billedNow, currency: 'USD',
    period: q.cycle === 'yearly' ? '12 мес' : '1 мес',
    status: method === 'stripe' ? 'paid' : 'issued', // stripe-путь помечает оплату вебхук; здесь — упрощённо
    method: method || b.payMode,
  };
  b.invoices.unshift(inv);
  if (b.invoices.length > 60) b.invoices.length = 60;
  /* продлеваем период и активируем подписку */
  b.status = 'active';
  b.currentPeriodEnd = now + (q.cycle === 'yearly' ? 365 : 30) * 86400e3;
  b.usage = { periodStart: now, waTemplates: 0, aiRequests: 0 };
  store.save();
  return { invoice: inv, view: view(db) };
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

module.exports = { PRICES, defBilling, quote, view, setPlan, issueInvoice, setMethod, stripeCheckout, usageEstimate };
