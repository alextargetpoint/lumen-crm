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
const crypto = require('crypto');
const OTP_WAIT_MS = 120000;            // «2 минуты» — потолок ожидания кода
const HEALTH_EVERY_MS = 10 * 60000;    // health-пинг сессии раз в 10 мин
const EXPIRY_WARN_DAYS = 3;            // предупреждать за N дней до истечения номера

function normUrl(u) { u = String(u || '').trim().replace(/\/$/, ''); if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u; return u; }

/* ── шифрование пароля Simbye тенанта (reversible — чтобы переотправлять /login при протухании) ── */
function encKey() { return crypto.scryptSync(process.env.LUMEN_ENC_KEY || process.env.PLATFORM_ADMIN_KEY || 'lumen-simbye-v1', 'simbye-enc', 32); }
function encSecret(txt) { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv); const e = Buffer.concat([c.update(String(txt), 'utf8'), c.final()]); return 'enc$' + iv.toString('hex') + '$' + c.getAuthTag().toString('hex') + '$' + e.toString('hex'); }
function decSecret(s) { try { const [p, ivh, th, eh] = String(s).split('$'); if (p !== 'enc') return ''; const d = crypto.createDecipheriv('aes-256-gcm', encKey(), Buffer.from(ivh, 'hex')); d.setAuthTag(Buffer.from(th, 'hex')); return Buffer.concat([d.update(Buffer.from(eh, 'hex')), d.final()]).toString('utf8'); } catch (_) { return ''; } }

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
  const tid = (store && store.currentTid && store.currentTid()) || 'platform';
  try {
    const r = await fetch(c.url + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-worker-token': c.token, 'x-tenant': tid },
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
const login    = (db, store, email, password)   => api(db, store, 'POST', '/login', { email, password }, 90000);

/* ── подключение СВОЕГО Simbye тенантом (email+пароль): сохраняем шифрованно + логинимся воркером ── */
function creds(db) { const s = db.settings || (db.settings = {}); if (!s.simbye) s.simbye = {}; return s.simbye.creds || null; }
async function connect(db, store, email, password) {
  const r = await login(db, store, email, password);
  if (r && r.ok) {
    const s = db.settings || (db.settings = {}); s.simbye = s.simbye || {};
    s.simbye.creds = { email: String(email), passEnc: encSecret(password), connectedAt: Date.now() };
    try { store && store.save && store.save(); } catch (_) {}
  }
  return r;
}
/* авто-релогин при протухшей сессии — берём шифрованные креды тенанта */
async function relogin(db, store) {
  const c = creds(db); if (!c || !c.passEnc) return { ok: false, reason: 'no_creds' };
  const pw = decSecret(c.passEnc); if (!pw) return { ok: false, reason: 'decrypt_failed' };
  return login(db, store, c.email, pw);
}
function disconnect(db, store) { const s = db.settings || {}; if (s.simbye) delete s.simbye.creds; api(db, store, 'POST', '/logout').catch(() => {}); try { store && store.save && store.save(); } catch (_) {} }

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
  linking: 'Подключение', warming: 'Прогрев', active: 'Активен', stuck: 'Нужно внимание', expired: 'Истёк', parked: 'Отложен',
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

/* ── ШАБЛОН АККАУНТА агентства (persona + резервная почта + 2FA + цели + анти-бесконечная покупка) ── */
function template(db) {
  const f = farm(db);
  if (!f.template) f.template = {};
  const t = f.template;
  if (t.personaMode == null) t.personaMode = 'agency';          // agency|broker|neutral
  if (t.namePattern == null) t.namePattern = '';                 // напр. «{agency} · Отдел заботы»
  if (t.bio == null) t.bio = '';
  if (!Array.isArray(t.avatarPool)) t.avatarPool = [];           // URL-аватарки для ротации
  if (t.recoveryMode == null) t.recoveryMode = 'catchall';       // catchall|gmail-alias|manual
  if (t.recoveryDomain == null) t.recoveryDomain = '';           // для catchall: любой@домен → один ящик
  if (t.recoveryBase == null) t.recoveryBase = '';               // для gmail-alias: base@gmail.com → base+xxx@
  if (!t.twoFA) t.twoFA = { enabled: true, pinMode: 'random', pin: '' }; // WA two-step + TG 2FA
  if (!t.targets) t.targets = { wa: 5, tg: 5 };
  if (!t.budget) t.budget = { maxNumbers: 12, maxBuysPerDay: 5, maxRetries: 3 };
  if (t.autopilot == null) t.autopilot = false;                  // авто-продвижение по этапам
  return t;
}
const RETRY_MAX = (db) => (template(db).budget || {}).maxRetries || 3;

/* резервная почта под номер — уникальная (повтор одной почты ломает коды Telegram) */
function genRecoveryEmail(db, acc) {
  const t = template(db);
  const tail = String(acc.phone || '').replace(/\D/g, '').slice(-6) || Math.random().toString(36).slice(2, 8);
  if (t.recoveryMode === 'catchall' && t.recoveryDomain) return `n${tail}@${t.recoveryDomain.replace(/^@/, '')}`;
  if (t.recoveryMode === 'gmail-alias' && t.recoveryBase) { const [u, d] = t.recoveryBase.split('@'); return `${u}+n${tail}@${d || 'gmail.com'}`; }
  return '';
}
function genTwoFAPin(db) {
  const t = template(db);
  if (!t.twoFA || !t.twoFA.enabled) return '';
  if (t.twoFA.pinMode === 'fixed' && t.twoFA.pin) return String(t.twoFA.pin).replace(/\D/g, '').slice(0, 6).padStart(6, '0');
  let p = ''; for (let i = 0; i < 6; i++) p += Math.floor(Math.random() * 10); return p; // WhatsApp/TG PIN — 6 цифр
}
/* сгенерировать и ЗАКРЕПИТЬ секреты аккаунта (server-only, брокеру не отдаём) */
function ensureSecrets(db, acc) {
  acc.secrets = acc.secrets || {};
  if (acc.secrets.recoveryEmail == null) acc.secrets.recoveryEmail = genRecoveryEmail(db, acc);
  if (acc.secrets.twoFAPin == null) acc.secrets.twoFAPin = genTwoFAPin(db);
  return acc.secrets;
}
/* persona под номер из шаблона (имя/био/аватар с ротацией) */
function personaFor(db, acc, idx) {
  const t = template(db);
  const agency = (db.settings.agency && db.settings.agency.name) || 'Агентство';
  const name = (t.namePattern || '{agency}').replace(/\{agency\}/g, agency).replace(/\{n\}/g, String((idx || 0) + 1)).trim() || agency;
  const avatar = t.avatarPool.length ? t.avatarPool[(idx || 0) % t.avatarPool.length] : '';
  return { mode: t.personaMode, name, bio: t.bio || '', avatar };
}

/* ── ПРОВИЖЕН: карточка-заготовка сразу при покупке + авто-детект нового номера ── */
const PROVISION_TIMEOUT_MS = 30 * 60000; // 30 мин на оплату+появление, иначе timeout
/* создать заготовку сразу при инициации покупки (номера ещё нет — ждём оплату+появление) */
function startProvision(db, country, checkoutUrl) {
  const f = farm(db);
  const acc = { id: 'sf_' + Math.random().toString(36).slice(2, 9), phone: null, country: country || 'uk', channels: {}, createdAt: Date.now(), provision: { state: 'paying', at: Date.now(), country: country || 'uk', checkoutUrl: checkoutUrl || '' } };
  f.accounts.unshift(acc); f.updatedAt = Date.now();
  return acc;
}
/* сопоставить номера из Simbye с фермой: новый номер → в заготовку (если есть) или новая карточка */
function matchProvision(db, simbyeNumbers) {
  const f = farm(db); let filled = 0, created = 0;
  const known = new Set(f.accounts.filter(a => a.phone).map(a => a.phone));
  for (const n of (simbyeNumbers || [])) {
    if (!n.phone || known.has(n.phone)) continue;
    // старейшая незаполненная заготовка ждёт номер?
    const slot = f.accounts.filter(a => a.provision && a.provision.state === 'paying' && !a.phone).sort((a, b) => a.provision.at - b.provision.at)[0];
    const target = slot || { id: 'sf_' + Math.random().toString(36).slice(2, 9), channels: {}, createdAt: Date.now() };
    target.phone = n.phone;
    target.country = /\+44/.test(n.phone) ? 'uk' : (/\+1/.test(n.phone) ? 'usa' : (target.country || ''));
    target.orderNo = n.orderNo || target.orderNo || '';
    target.expiresAt = n.expiresAt || target.expiresAt || '';
    target.provision = { state: 'received', at: Date.now() };
    ensureSecrets(db, target);
    known.add(n.phone);
    if (slot) filled++; else { f.accounts.push(target); created++; }
  }
  if (filled || created) f.updatedAt = Date.now();
  return { filled, created };
}
/* заготовки, что не дождались номера за таймаут → timeout + сигнал */
function sweepProvision(db) {
  const f = farm(db); const now = Date.now();
  for (const a of f.accounts) {
    if (a.provision && a.provision.state === 'paying' && !a.phone && now - a.provision.at > PROVISION_TIMEOUT_MS) {
      a.provision.state = 'timeout';
      pushAlert(db, 'warn', `Покупка номера (${a.provision.country || ''}) не завершилась за 30 мин — оплатите или отмените.`, a.id + ':prov');
    }
  }
}

/* ── АНТИ-БЕСКОНЕЧНАЯ ПОКУПКА: лимит номеров + покупок в день ── */
function buyGuard(db) {
  const t = template(db); const f = farm(db);
  const b = t.budget || {};
  const total = f.accounts.length;
  if (b.maxNumbers && total >= b.maxNumbers) return { ok: false, reason: `лимит номеров (${b.maxNumbers}) достигнут` };
  const dayAgo = Date.now() - 864e5;
  f.buyLog = (f.buyLog || []).filter(x => x > dayAgo);
  if (b.maxBuysPerDay && f.buyLog.length >= b.maxBuysPerDay) return { ok: false, reason: `лимит покупок в день (${b.maxBuysPerDay}) достигнут` };
  return { ok: true };
}
function recordBuy(db) { const f = farm(db); f.buyLog = (f.buyLog || []).filter(x => x > Date.now() - 864e5); f.buyLog.push(Date.now()); }

/* ретрай застрявшего канала: bump счётчика, park после лимита (не перекупаем бесконечно) */
function bumpRetry(db, acc, ch) {
  const c = chan(acc, ch); c.retries = (c.retries || 0) + 1;
  if (c.retries >= RETRY_MAX(db)) { setState(db, acc, ch, 'parked', { error: 'исчерпаны попытки — нужен разбор вручную' }); return 'parked'; }
  return c.retries;
}

/* канал ПОДКЛЮЧИЛСЯ (linked в WA/TG-воркере) → двигаем к прогреву + закрепляем секреты. Возврат: нужно ли применить персону. */
const WARM_TO_ACTIVE_MS = 15 * 60000; // держим «прогрев» ≥15 мин связного статуса → «активен»
function onConnected(db, acc, ch) {
  const c = chan(acc, ch);
  ensureSecrets(db, acc);
  const pre = ['purchased', 'awaiting_otp', 'otp_received', 'linking', 'stuck', 'parked'];
  if (pre.includes(c.state)) { setState(db, acc, ch, 'warming', { personaPending: true }); resolveAlerts(db, a => a.ctx === acc.id + ':' + ch); return true; }
  return false;
}
function maybeActivate(db, acc, ch) {
  const c = chan(acc, ch);
  if (c.state === 'warming' && c.stateAt && Date.now() - c.stateAt > WARM_TO_ACTIVE_MS) { setState(db, acc, ch, 'active'); return true; }
  return false;
}
/* канал ОТВАЛИЛСЯ (был active/warming, стал не connected) → сигнал */
function onDisconnected(db, acc, ch) {
  const c = chan(acc, ch);
  if ((c.state === 'active' || c.state === 'warming') && !c.disconnAt) {
    c.disconnAt = Date.now();
    pushAlert(db, 'warn', `Номер ${acc.phone} (${ch === 'wa' ? 'WhatsApp' : 'Telegram'}) отвалился — переподключите (QR).`, acc.id + ':' + ch + ':off');
    return true;
  }
  if (c.state === 'active' || c.state === 'warming') return false;
  return false;
}

/* ── ВОТЧДОГ: health + застрявшие OTP + истечение. Зовётся из engine.startLoop. ── */
async function tick(db, store, deps) {
  const f = farm(db);
  const now = Date.now();
  // 1) health сессии (не чаще HEALTH_EVERY_MS)
  if (ready(db, store) && (!f.health || now - (f.health.checkedAt || 0) > HEALTH_EVERY_MS)) {
    try {
      let h = await health(db, store);
      // АВТО-РЕЛОГИН: сессия протухла, но есть сохранённые креды тенанта → воркер логинится сам
      if ((!h.ok || !h.loggedIn) && creds(db)) {
        const rl = await relogin(db, store).catch(() => ({ ok: false }));
        if (rl && rl.ok) { h = await health(db, store).catch(() => h); }
      }
      f.health = { loggedIn: !!h.loggedIn, email: h.email || '', numbers: h.numbers || 0, checkedAt: now, ok: !!h.ok };
      if (!h.ok || !h.loggedIn) {
        pushAlert(db, 'error', creds(db) ? 'Не удалось войти в Simbye по сохранённым данным — проверьте логин/пароль (возможно, сменился) в «Подключить Simbye».' : 'Simbye не подключён — подключите свой аккаунт (email+пароль) в разделе «Номера».', 'session');
        if (deps && deps.notifyOwner) deps.notifyOwner(db, '⚠️ Simbye: нет доступа к аккаунту. Ферма номеров на паузе — переподключите в CRM.');
      } else {
        resolveAlerts(db, a => a.ctx === 'session');
      }
    } catch (e) {
      f.health = { loggedIn: false, error: e.message, checkedAt: now, ok: false };
      pushAlert(db, 'error', 'Simbye-воркер недоступен: ' + e.message, 'worker');
    }
  }
  // 1.5) АВТО-ДЕТЕКТ новых номеров: если есть заготовки покупки ИЛИ автопилот (раз в 5 мин) — тянем /numbers и подставляем
  const pending = f.accounts.some(a => a.provision && a.provision.state === 'paying' && !a.phone);
  const autoDue = template(db).autopilot && now - (f.lastAutoImport || 0) > 5 * 60000;
  if (ready(db, store) && (pending || autoDue) && (!f.health || f.health.loggedIn)) {
    try {
      const r = await numbers(db, store);
      const res = matchProvision(db, r.numbers || []);
      if (res.filled || res.created) { if (deps && deps.notifyOwner) deps.notifyOwner(db, `✅ Simbye: подхвачено новых номеров — ${res.filled + res.created}. Конвейер запущен.`); }
      f.lastAutoImport = now;
    } catch (_) {}
  }
  sweepProvision(db);
  // 2) застрявшие в awaiting_otp дольше 2 минут → stuck + сигнал
  for (const acc of f.accounts) {
    if (acc.provision && acc.provision.state !== 'received') continue; // заготовки без номера пропускаем в п.2/3
    for (const ch of Object.keys(acc.channels || {})) {
      const c = acc.channels[ch];
      if (c.state === 'awaiting_otp' && c.stateAt && now - c.stateAt > OTP_WAIT_MS + 15000) {
        setState(db, acc, ch, 'stuck', { error: 'SMS-код не пришёл за 2 минуты' });
        const parked = bumpRetry(db, acc, ch) === 'parked';
        pushAlert(db, parked ? 'error' : 'warn', `Номер ${acc.phone} (${ch === 'wa' ? 'WhatsApp' : 'Telegram'}): код не пришёл за 2 мин${parked ? ' — исчерпаны попытки, отложен' : ''}.`, acc.id + ':' + ch);
        if (deps && deps.notifyOwner) deps.notifyOwner(db, `⚠️ ${acc.phone} (${ch}): OTP не пришёл${parked ? ', номер ОТЛОЖЕН (нужен разбор)' : ' за 2 мин'} — проверьте в CRM.`);
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
  login, connect, relogin, disconnect, creds, encSecret, decSecret,
  farm, accById, chan, setState, clientNotice, pushAlert, resolveAlerts,
  daysToExpiry, tick, STEPS, STEP_RU, OTP_WAIT_MS,
  template, genRecoveryEmail, genTwoFAPin, ensureSecrets, personaFor,
  buyGuard, recordBuy, bumpRetry, RETRY_MAX,
  onConnected, maybeActivate, onDisconnected, WARM_TO_ACTIVE_MS,
  startProvision, matchProvision, sweepProvision, PROVISION_TIMEOUT_MS,
};
