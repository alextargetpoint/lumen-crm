/* server/simbye.js — интеграция скрейпера Simbye в CRM (движок фермы номеров).
 *
 * Simbye API нет → отдельный воркер lumen-simbye-worker (headless Playwright + платформенная сессия)
 * детектит номера и забирает OTP. Здесь — КЛИЕНТ воркера + СОСТОЯНИЕ фермы + ВОТЧДОГ (сигналы).
 *
 * Философия «умной системы» (запрос владельца 22.09.2026):
 *   покупает → регистрирует (обычный WhatsApp, НЕ Business) → авто-OTP из Simbye → линкует (QR) →
 *   греет → активен. Если OTP не пришёл за 2 мин / сессия протухла / номер истекает — СИГНАЛ в админку
 *   владельцу И статус клиенту «обратитесь в поддержку», а не молчаливая поломка.
 *
 * Конфиг воркера (платформенный, как wa/tg): env LUMEN_SIMBYE_WORKER_URL + LUMEN_SIMBYE_WORKER_TOKEN,
 * либо registry.platformSimbyeWorker {url,token}, либо db.settings.simbye {url,token}.
 */
const OTP_WAIT_MS = 120000;            // «2 минуты» — потолок ожидания кода
const HEALTH_EVERY_MS = 10 * 60000;    // health-пинг сессии раз в 10 мин
const EXPIRY_WARN_DAYS = 3;            // предупреждать за N дней до истечения номера

function normUrl(u) { u = String(u || '').trim().replace(/\/$/, ''); if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u; return u; }

function workerCfg(db, store) {
  let reg = {}; try { reg = (store && store.getRegistry && store.getRegistry()) || {}; } catch (_) {}
  const s = (db && db.settings && db.settings.simbye) || {};
  const url = normUrl(process.env.LUMEN_SIMBYE_WORKER_URL || (reg.platformSimbyeWorker && reg.platformSimbyeWorker.url) || s.url || '');
  const token = process.env.LUMEN_SIMBYE_WORKER_TOKEN || (reg.platformSimbyeWorker && reg.platformSimbyeWorker.token) || s.token || '';
  return { url, token };
}
function ready(db, store) { const c = workerCfg(db, store); return !!(c.url && c.token); }

async function api(db, store, method, path, body, timeoutMs) {
  const c = workerCfg(db, store);
  if (!c.url) throw new Error('Simbye-воркер не настроен (LUMEN_SIMBYE_WORKER_URL)');
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs || 150000);
  try {
    const r = await fetch(c.url + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-worker-token': c.token },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch (_) { j = { ok: false, error: t.slice(0, 200) }; }
    if (!r.ok && j && j.ok === undefined) j.ok = false;
    return j;
  } finally { clearTimeout(to); }
}

/* ── тонкие обёртки над воркером ── */
const health   = (db, store)                    => api(db, store, 'GET', '/health', null, 60000);
const numbers  = (db, store)                    => api(db, store, 'GET', '/numbers', null, 60000);
const getOtp   = (db, store, phone, service, timeoutMs, baselineKeys) =>
  api(db, store, 'POST', '/otp', { phone, service, timeoutMs: Math.min(timeoutMs || OTP_WAIT_MS, 5 * 60000), baselineKeys }, (timeoutMs || OTP_WAIT_MS) + 20000);
const buy      = (db, store, country, calls)    => api(db, store, 'POST', '/buy', { country, calls }, 90000);
const renew    = (db, store, phone, orderNo)    => api(db, store, 'POST', '/renew', { phone, orderNo }, 60000);
const setSession = (db, store, state)           => api(db, store, 'POST', '/session', state, 90000);

/* ── состояние фермы (per-tenant) ── */
function farm(db) {
  const s = db.settings || (db.settings = {});
  if (!s.simbyeFarm) s.simbyeFarm = { accounts: [], health: null, alerts: [], updatedAt: 0 };
  const f = s.simbyeFarm;
  if (!Array.isArray(f.accounts)) f.accounts = [];
  if (!Array.isArray(f.alerts)) f.alerts = [];
  return f;
}

/* этапы процесса — единый словарь для UI-цепочки */
const STEPS = ['purchased', 'awaiting_otp', 'otp_received', 'linking', 'warming', 'active'];
const STEP_RU = {
  purchased: 'Куплен', awaiting_otp: 'Ждём код', otp_received: 'Код получен',
  linking: 'Подключение', warming: 'Прогрев', active: 'Активен', stuck: 'Нужно внимание', expired: 'Истёк',
};

function accById(db, id) { return farm(db).accounts.find(a => a.id === id); }
function chan(acc, ch) { acc.channels = acc.channels || {}; if (!acc.channels[ch]) acc.channels[ch] = { state: 'purchased', stateAt: Date.now() }; return acc.channels[ch]; }

function setState(db, acc, ch, state, extra) {
  const c = chan(acc, ch);
  c.state = state; c.stateAt = Date.now();
  if (extra) Object.assign(c, extra);
  if (state === 'stuck') { c.stuckAt = Date.now(); }
  else { c.stuckAt = 0; c.error = ''; }
  farm(db).updatedAt = Date.now();
}

/* клиентское сообщение при поломке — что показать в агентстве */
function clientNotice(acc, ch) {
  const c = (acc.channels || {})[ch] || {};
  if (c.state === 'stuck') return { level: 'error', text: 'Возникла техническая заминка с этим номером. Мы уже разбираемся — если срочно, напишите в поддержку.' };
  if (c.state === 'awaiting_otp') return { level: 'info', text: 'Ждём SMS-код подтверждения (обычно до 2 минут)…' };
  return null;
}

function pushAlert(db, level, msg, ctx) {
  const f = farm(db);
  const key = level + '|' + msg + '|' + (ctx || '');
  const existing = f.alerts.find(a => !a.resolved && (a.level + '|' + a.msg + '|' + (a.ctx || '')) === key);
  if (existing) { existing.at = Date.now(); existing.count = (existing.count || 1) + 1; return existing; }
  const a = { id: 'al_' + Math.random().toString(36).slice(2, 9), level, msg, ctx: ctx || '', at: Date.now(), resolved: false, count: 1 };
  f.alerts.unshift(a); f.alerts = f.alerts.slice(0, 50);
  return a;
}
function resolveAlerts(db, predicate) { farm(db).alerts.forEach(a => { if (!a.resolved && predicate(a)) a.resolved = true; }); }

/* дней до истечения из "YYYY-MM-DD" (локально, без toISOString-сдвигов) */
function daysToExpiry(expiresAt) {
  if (!expiresAt) return null;
  const m = String(expiresAt).match(/(\d{4})-(\d{2})-(\d{2})/); if (!m) return null;
  const exp = new Date(+m[1], +m[2] - 1, +m[3]); const now = new Date();
  return Math.round((exp - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
}

/* ── ВОТЧДОГ: health + застрявшие OTP + истечение. Зовётся из engine.startLoop. ── */
async function tick(db, store, deps) {
  const f = farm(db);
  const now = Date.now();
  // 1) health сессии (не чаще HEALTH_EVERY_MS)
  if (ready(db, store) && (!f.health || now - (f.health.checkedAt || 0) > HEALTH_EVERY_MS)) {
    try {
      const h = await health(db, store);
      f.health = { loggedIn: !!h.loggedIn, email: h.email || '', numbers: h.numbers || 0, checkedAt: now, ok: !!h.ok };
      if (!h.ok || !h.loggedIn) {
        pushAlert(db, 'error', 'Сессия Simbye недействительна — залогиньтесь заново и загрузите сессию (Настройки → Номера → Simbye).', 'session');
        if (deps && deps.notifyOwner) deps.notifyOwner(db, '⚠️ Simbye: сессия протухла. Ферма номеров на паузе — обновите сессию в CRM.');
      } else {
        resolveAlerts(db, a => a.ctx === 'session');
      }
    } catch (e) {
      f.health = { loggedIn: false, error: e.message, checkedAt: now, ok: false };
      pushAlert(db, 'error', 'Simbye-воркер недоступен: ' + e.message, 'worker');
    }
  }
  // 2) застрявшие в awaiting_otp дольше 2 минут → stuck + сигнал
  for (const acc of f.accounts) {
    for (const ch of Object.keys(acc.channels || {})) {
      const c = acc.channels[ch];
      if (c.state === 'awaiting_otp' && c.stateAt && now - c.stateAt > OTP_WAIT_MS + 15000) {
        setState(db, acc, ch, 'stuck', { error: 'SMS-код не пришёл за 2 минуты' });
        pushAlert(db, 'warn', `Номер ${acc.phone} (${ch === 'wa' ? 'WhatsApp' : 'Telegram'}): код не пришёл за 2 мин.`, acc.id + ':' + ch);
        if (deps && deps.notifyOwner) deps.notifyOwner(db, `⚠️ ${acc.phone} (${ch}): OTP не пришёл за 2 мин — проверьте номер/сессию в CRM.`);
      }
    }
  }
  // 3) истечение номеров
  for (const acc of f.accounts) {
    const d = daysToExpiry(acc.expiresAt);
    if (d != null && d <= EXPIRY_WARN_DAYS && d >= 0) {
      pushAlert(db, 'warn', `Номер ${acc.phone} истекает через ${d} дн. — продлите, чтобы не потерять аккаунты.`, acc.id + ':expiry');
    } else if (d != null && d > EXPIRY_WARN_DAYS) {
      resolveAlerts(db, a => a.ctx === acc.id + ':expiry');
    }
  }
  try { if (store && store.save) store.save(); } catch (_) {}
}

module.exports = {
  ready, workerCfg, health, numbers, getOtp, buy, renew, setSession,
  farm, accById, chan, setState, clientNotice, pushAlert, resolveAlerts,
  daysToExpiry, tick, STEPS, STEP_RU, OTP_WAIT_MS,
};
