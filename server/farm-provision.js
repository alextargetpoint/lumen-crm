/* Lumen CRM — Ферма: автономный конвейер провижна номера (Р2).
   Распределённая схема:
   - ОБЛАЧНЫЙ CRM делает то, что умеет через API: покупка eSIM-номера, чтение OTP.
   - ФАРМ-ХОСТ (Mac рядом с телефонами, lumen-cloudphone/provision.cjs) делает ADB:
     регистрирует WhatsApp+Telegram на устройстве, вводит OTP, ставит 2FA, репортит статус.

   eSIM-адаптер — провайдеро-независимый (env FARM_ESIM_API / FARM_ESIM_KEY / FARM_ESIM_PROVIDER).
   Ожидаемый контракт провайдера: POST {base}/acquire {country}->{phone,ref}; GET {base}/otp?ref=->{otp}.
   Если ключ не задан — режим MANUAL: номер/код вводит оператор (как мы делали вживую).  */

const farmSvc = require('./farm');

function esimCfg() {
  return { base: (process.env.FARM_ESIM_API || '').replace(/\/$/, ''), key: process.env.FARM_ESIM_KEY || '', provider: process.env.FARM_ESIM_PROVIDER || 'esim' };
}
function esimReady() { const c = esimCfg(); return !!(c.base && c.key); }

/* купить номер у eSIM-провайдера (или manual-фолбэк) */
async function esimAcquire(country) {
  const c = esimCfg(); country = (country || 'gb').toLowerCase();
  if (!esimReady()) return { manual: true };
  try {
    const r = await fetch(c.base + '/acquire', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.key }, body: JSON.stringify({ country }) });
    const j = await r.json().catch(() => ({}));
    const phone = j.phone || j.number || j.msisdn;
    if (!phone) return { error: 'провайдер не вернул номер', raw: j };
    return { phone: String(phone).startsWith('+') ? String(phone) : '+' + String(phone), ref: String(j.id || j.ref || j.orderId || ''), provider: c.provider };
  } catch (e) { return { error: e.message }; }
}
/* прочитать OTP по ref (или manual) */
async function esimOtp(ref) {
  const c = esimCfg();
  if (!esimReady() || !ref) return { manual: true };
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
  if (res.error) { num.prov.lastError = res.error; require('./store').saveRegistry(); return { error: res.error }; }
  if (res.manual) { num.prov.step = 'register-wa'; num.prov.needsAgent = true; num.prov.manual = true; require('./store').saveRegistry(); return { ok: true, manual: true, note: 'eSIM-API не задан — введите номер вручную и запустите агента' }; }
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
  /* завершение: WA+TG готовы → нужен ли ещё агент? */
  if (patch.step === 'done' || (num.wa.status === 'ready' && (num.tg.status === 'ready' || num.tg.status === 'none'))) {
    num.prov.needsAgent = false;
  }
  farmSvc.farm().log.unshift({ at: Date.now(), action: 'prov.agent', numberId, step: num.prov.step });
  require('./store').saveRegistry();
  return { ok: true, number: num };
}

module.exports = { esimCfg, esimReady, esimAcquire, esimOtp, enqueue, stepAcquire, agentJobs, agentReport };
