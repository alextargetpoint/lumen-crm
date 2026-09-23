/* Lumen CRM — Ферма: автономный конвейер провижна номера (Р2).
   Распределённая схема:
   - ОБЛАЧНЫЙ CRM делает то, что умеет через API: покупка eSIM-номера, чтение OTP.
   - ФАРМ-ХОСТ (Mac рядом с телефонами, lumen-cloudphone/provision.cjs) делает ADB:
     регистрирует WhatsApp+Telegram на устройстве, вводит OTP, ставит 2FA, репортит статус.

   eSIM-адаптер — провайдеро-независимый (env FARM_ESIM_API / FARM_ESIM_KEY / FARM_ESIM_PROVIDER).
   Ожидаемый контракт провайдера: POST {base}/acquire {country}->{phone,ref}; GET {base}/otp?ref=->{otp}.
   Если ключ не задан — режим MANUAL: номер/код вводит оператор (как мы делали вживую).  */

const farmSvc = require('./farm');

/* ── Yesim Virtual Numbers API ──
   База https://vn.yesim.app/apiv1/index.php , Basic Auth (user=API token, pw=token),
   все POST, тело {params:{...}}, экшен — в пути (…/index.php/purchase_number).
   ⚠️IP сервера должен быть в whitelist панели Yesim (иначе {error:"...IP not whitelisted"}).
   Эндпоинты: get_allowed_countries, get_country_areas, get_subscription_options, get_numbers,
   purchase_number, set_autorenew, stop_ar, restart_ar, get_sms, get_balance.
   Точные ключи params подтвердить на первом whitelist-запросе (сейчас IP не добавлен). */
const YESIM_BASE = 'https://vn.yesim.app/apiv1/index.php';
function yesimCfg() { return { user: process.env.FARM_YESIM_USER || '', token: process.env.FARM_YESIM_TOKEN || '' }; }
function yesimReady() { const c = yesimCfg(); return !!(c.user && c.token); }
async function yesimCall(action, params, method) {
  const c = yesimCfg();
  const auth = 'Basic ' + Buffer.from(c.user + ':' + c.token).toString('base64');
  /* экшен = query-параметр ?action=… (подтверждено вживую); params — в теле POST */
  const url = YESIM_BASE + '?action=' + encodeURIComponent(action);
  const r = await fetch(url, { method: method || 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify({ params: params || {} }) });
  return r.json().catch(() => ({ error: 'bad json from yesim' }));
}
/* сервисный вызов: баланс/проверка whitelist (в ошибке Yesim вернёт наш IP для вайтлиста) */
async function yesimBalance() { if (!yesimReady()) return { error: 'FARM_YESIM_USER/TOKEN не заданы' }; try { return await yesimCall('get_balance', {}, 'GET'); } catch (e) { return { error: e.message }; } }
async function yesimCountries() { try { return await yesimCall('get_allowed_countries', {}); } catch (e) { return { error: e.message }; } }

function esimCfg() { return { provider: yesimReady() ? 'yesim' : (process.env.FARM_ESIM_PROVIDER || 'manual'), base: (process.env.FARM_ESIM_API || '').replace(/\/$/, ''), key: process.env.FARM_ESIM_KEY || '' }; }
function esimReady() { return yesimReady() || !!(esimCfg().base && esimCfg().key); }

/* купить номер (Yesim → generic → manual) */
async function esimAcquire(country) {
  country = (country || 'gb').toLowerCase();
  if (yesimReady()) {
    try {
      /* params-ключи (country/service/subscription) подтвердим на whitelist-запросе */
      const j = await yesimCall('purchase_number', { country, service: 'telegram' });
      if (j.error) return { error: j.error };
      const num = j.number || j.msisdn || (j.data && (j.data.number || j.data.msisdn));
      const id = j.id || j.number_id || (j.data && (j.data.id || j.data.number_id));
      if (!num) return { error: 'yesim не вернул номер', raw: j };
      return { phone: String(num).startsWith('+') ? String(num) : '+' + String(num), ref: String(id || ''), provider: 'yesim' };
    } catch (e) { return { error: e.message }; }
  }
  const c = esimCfg();
  if (!c.base || !c.key) return { manual: true };
  try {
    const r = await fetch(c.base + '/acquire', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.key }, body: JSON.stringify({ country }) });
    const j = await r.json().catch(() => ({}));
    const phone = j.phone || j.number || j.msisdn;
    if (!phone) return { error: 'провайдер не вернул номер', raw: j };
    return { phone: String(phone).startsWith('+') ? String(phone) : '+' + String(phone), ref: String(j.id || j.ref || ''), provider: c.provider };
  } catch (e) { return { error: e.message }; }
}
/* прочитать OTP по ref (Yesim get_sms → generic → manual) */
async function esimOtp(ref) {
  if (!ref) return { manual: true };
  if (yesimReady()) {
    try {
      const j = await yesimCall('get_sms', { number_id: ref, id: ref });
      if (j.error) return { error: j.error };
      const arr = Array.isArray(j) ? j : (j.sms || j.messages || (j.data && (j.data.sms || j.data.messages)) || []);
      const texts = (Array.isArray(arr) ? arr : []).map(m => (m.text || m.message || m.body || m.sms || '')).join(' ');
      const code = (texts.match(/\b(\d{4,8})\b/) || [])[1];
      return code ? { code } : { pending: true };
    } catch (e) { return { error: e.message }; }
  }
  const c = esimCfg();
  if (!c.base || !c.key) return { manual: true };
  try {
    const r = await fetch(c.base + '/otp?ref=' + encodeURIComponent(ref), { headers: { Authorization: 'Bearer ' + c.key } });
    const j = await r.json().catch(() => ({}));
    const code = String(j.otp || j.code || j.sms || '').replace(/\D/g, '');
    return code ? { code } : { pending: true, raw: j };
  } catch (e) { return { error: e.message }; }
}

/* поставить N номеров в очередь провижна на устройство (создаёт заготовки) */
function enqueue(deviceId, count, slot) {
  const f = farmSvc.farm();
  const dev = f.devices.find(d => d.id === deviceId);
  if (!dev) return { error: 'устройство не найдено' };
  const used = f.numbers.filter(n => n.deviceId === deviceId).length;
  const room = Math.max(0, (dev.capacity || f.settings.maxPerDevice) - used);
  const n = Math.min(+count || 1, room);
  if (n <= 0) return { error: 'нет свободных слотов на устройстве' };
  const made = [];
  for (let i = 0; i < n; i++) {
    const num = farmSvc.addNumber({ phone: '', deviceId, slot: slot || 'island', waStatus: 'provisioning' });
    num.prov = { step: 'acquire', needsAgent: false, esimRef: '', lastError: '', at: Date.now() };
    made.push(num.id);
  }
  farmSvc.farm().log.unshift({ at: Date.now(), action: 'prov.enqueue', deviceId, count: n });
  require('./store').saveRegistry();
  return { ok: true, created: made, queued: n, roomLeft: room - n };
}

/* шаг «купить номер» (делает облако через eSIM API) */
async function stepAcquire(numberId) {
  const num = farmSvc.findNumber(numberId);
  if (!num) return { error: 'номер не найден' };
  num.prov = num.prov || { step: 'acquire' };
  const res = await esimAcquire(num.country);
  /* ошибка Yesim (нет whitelist/баланса) ИЛИ провайдер не задан → не блокируем конвейер: ручной режим */
  if (res.error || res.manual) { num.prov.step = 'register-wa'; num.prov.needsAgent = true; num.prov.manual = true; num.prov.lastError = res.error || ''; require('./store').saveRegistry(); return { ok: true, manual: true, warn: res.error || 'eSIM-API не активен — номер/код вводит оператор' }; }
  num.phone = res.phone; num.esim = { provider: res.provider, ref: res.ref, rentUntil: null };
  num.prov.step = 'register-wa'; num.prov.needsAgent = true; num.prov.esimRef = res.ref;
  farmSvc.farm().log.unshift({ at: Date.now(), action: 'prov.acquired', numberId, phone: res.phone });
  require('./store').saveRegistry();
  return { ok: true, phone: res.phone };
}

/* задания для фарм-хост-агента (номера, ждущие ADB-работы) */
function agentJobs() {
  const f = farmSvc.farm();
  return f.numbers
    .filter(n => n.prov && n.prov.needsAgent && n.deviceId && (n.wa.status === 'provisioning' || n.tg.status === 'provisioning' || n.prov.step === 'register-wa' || n.prov.step === 'register-tg'))
    .map(n => {
      const dev = f.devices.find(d => d.id === n.deviceId) || {};
      return { id: n.id, phone: n.phone, serial: dev.serial, slot: n.slot, step: n.prov.step, esimRef: n.prov.esimRef || (n.esim && n.esim.ref) || '', twoFaPin: n.wa.twoFaPin || '', recoveryEmail: n.wa.recoveryEmail || '' };
    });
}

/* агент репортит прогресс шага */
function agentReport(numberId, patch) {
  const num = farmSvc.findNumber(numberId);
  if (!num) return { error: 'номер не найден' };
  num.prov = num.prov || {};
  if (patch.step) num.prov.step = patch.step;
  if (patch.error != null) num.prov.lastError = patch.error;
  if (patch.wa) Object.assign(num.wa, patch.wa);
  if (patch.tg) Object.assign(num.tg, patch.tg);
  if (patch.phone) num.phone = patch.phone;
  /* агент больше не нужен только когда весь конвейер номера закрыт */
  if (patch.step === 'done') num.prov.needsAgent = false;
  farmSvc.farm().log.unshift({ at: Date.now(), action: 'prov.agent', numberId, step: num.prov.step });
  require('./store').saveRegistry();
  return { ok: true, number: num };
}

module.exports = { esimCfg, esimReady, esimAcquire, esimOtp, enqueue, stepAcquire, agentJobs, agentReport, yesimReady, yesimBalance, yesimCountries };
