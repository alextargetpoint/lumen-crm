/* Lumen CRM — генерация Zoom-ссылок (SaaS, per-tenant OAuth).
   КАЖДОЕ агентство подключает СВОЙ Zoom: owner жмёт «Подключить Zoom» → OAuth-согласие Zoom →
   мы храним per-tenant токены (settings.zoom) → встречи создаются под аккаунтом САМОГО агентства
   (его хост, его брендинг, его лимиты). Платформа лишь регистрирует ОДНО OAuth-приложение
   (ZOOM_OAUTH_CLIENT_ID/SECRET — «наше приложение существует в Zoom»), согласие — у каждого своё.

   Необязательный фолбэк: платформенный Server-to-Server аккаунт (ZOOM_ACCOUNT_ID/CLIENT_ID/
   CLIENT_SECRET[/ZOOM_USER_ID]) — если агентство свой Zoom не подключило. Нет ни того, ни другого
   → ready(db)=false → вызывающий код падает на бесплатный Jitsi. Cost-safe.

   ⚠️ Zoom-ссылку (не Jitsi) умеет писать бот-нотетейкер Recall → именно Zoom даёт связку
   «авто-ссылка + авто-запись + авто-транскрипт». */

const store = require('./store');

/* ---------- Платформенное OAuth-приложение (общее — идентифицирует НАШЕ приложение в Zoom) ---------- */
function appCreds() {
  return {
    clientId: process.env.ZOOM_OAUTH_CLIENT_ID || '',
    clientSecret: process.env.ZOOM_OAUTH_CLIENT_SECRET || '',
    redirectUri: (process.env.PUBLIC_BASE_URL || process.env.LUMEN_BASE || '').replace(/\/+$/, '') + '/auth/zoom/callback',
  };
}
function appConfigured() { const a = appCreds(); return !!(a.clientId && a.clientSecret && /^https:\/\//.test(a.redirectUri)); }

/* ---------- Платформенный S2S (необязательный фолбэк) ---------- */
function s2sCreds() {
  return {
    accountId: process.env.ZOOM_ACCOUNT_ID || '',
    clientId: process.env.ZOOM_CLIENT_ID || '',
    clientSecret: process.env.ZOOM_CLIENT_SECRET || '',
    userId: process.env.ZOOM_USER_ID || 'me',
  };
}
function s2sConfigured() { const c = s2sCreds(); return !!(c.accountId && c.clientId && c.clientSecret); }

/* ---------- Состояние подключения тенанта ---------- */
function conn(db) { return (db && db.settings && db.settings.zoom) || {}; }
/* готов ли вообще создавать Zoom-ссылки для этого тенанта: подключён свой ИЛИ есть платформенный S2S */
function ready(db) { const c = conn(db || store.get()); return !!(c.connected && c.refreshToken) || s2sConfigured(); }
/* публичный статус для UI */
function status(db) {
  const c = conn(db);
  return { connected: !!(c.connected && c.refreshToken), email: c.email || '', connectedAt: c.connectedAt || 0, appReady: appConfigured(), platformFallback: s2sConfigured() };
}

/* ---------- OAuth: старт (owner жмёт «Подключить») ---------- */
const _states = new Map();   /* nonce → { tid, at } (CSRF + маршрут callback→tid), TTL 10 мин */
function startAuth(tid) {
  const a = appCreds();
  const nonce = require('crypto').randomBytes(16).toString('hex');
  _states.set(nonce, { tid, at: Date.now() });
  for (const [k, v] of _states) if (Date.now() - v.at > 10 * 60e3) _states.delete(k);   /* чистка протухших */
  const p = new URLSearchParams({ response_type: 'code', client_id: a.clientId, redirect_uri: a.redirectUri, state: nonce });
  return 'https://zoom.us/oauth/authorize?' + p.toString();
}
function consumeState(nonce) {
  const v = _states.get(nonce); if (!v) return null; _states.delete(nonce);
  if (Date.now() - v.at > 10 * 60e3) return null;
  return v.tid;
}

async function _tokenReq(params) {
  const a = appCreds();
  const basic = Buffer.from(a.clientId + ':' + a.clientSecret).toString('base64');
  const r = await fetch('https://zoom.us/oauth/token', {
    method: 'POST', headers: { Authorization: 'Basic ' + basic, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('zoom token ' + r.status + ': ' + (j.reason || j.error || ''));
  return j;
}

/* обмен code→токены на callback. Пишет в db.settings.zoom (вызывать внутри runInTenant). */
async function exchangeCode(db, code) {
  const a = appCreds();
  const j = await _tokenReq({ grant_type: 'authorization_code', code, redirect_uri: a.redirectUri });
  const z = db.settings.zoom = db.settings.zoom || {};
  z.accessToken = j.access_token; z.refreshToken = j.refresh_token;
  z.expiresAt = Date.now() + (j.expires_in || 3600) * 1000;
  z.connected = true; z.connectedAt = Date.now();
  /* узнаём, чей аккаунт подключили (email хоста) */
  try { const me = await apiGet(db, '/users/me'); z.email = (me && (me.email || (me.id && me.id))) || z.email || ''; z.zoomUserId = (me && me.id) || z.zoomUserId || ''; } catch (_) {}
  store.save();
  return { ok: true, email: z.email };
}

/* действующий access-token тенанта (рефрешим при протухании; Zoom РОТИРУЕТ refresh — сохраняем новый) */
async function accessToken(db) {
  const z = conn(db);
  if (!z.refreshToken) throw new Error('zoom не подключён для этого агентства');
  if (z.accessToken && z.expiresAt > Date.now() + 60e3) return z.accessToken;
  const j = await _tokenReq({ grant_type: 'refresh_token', refresh_token: z.refreshToken });
  const zz = db.settings.zoom;
  zz.accessToken = j.access_token;
  if (j.refresh_token) zz.refreshToken = j.refresh_token;   /* ротация */
  zz.expiresAt = Date.now() + (j.expires_in || 3600) * 1000;
  store.save();
  return j.access_token;
}

async function apiGet(db, path) {
  const token = await accessToken(db);
  const r = await fetch('https://api.zoom.us/v2' + path, { headers: { Authorization: 'Bearer ' + token } });
  return r.json().catch(() => ({}));
}

function disconnect(db) {
  if (db.settings) db.settings.zoom = { connected: false };
  store.save();
}

/* ---------- S2S-токен (фолбэк) ---------- */
const _s2sTok = new Map();
async function s2sToken(c) {
  const hit = _s2sTok.get(c.accountId);
  if (hit && hit.exp > Date.now() + 60e3) return hit.token;
  const basic = Buffer.from(c.clientId + ':' + c.clientSecret).toString('base64');
  const r = await fetch('https://zoom.us/oauth/token?grant_type=account_credentials&account_id=' + encodeURIComponent(c.accountId), {
    method: 'POST', headers: { Authorization: 'Basic ' + basic, 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('zoom s2s ' + r.status + ': ' + (j.reason || j.error || ''));
  _s2sTok.set(c.accountId, { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 });
  return j.access_token;
}

/* ---------- Создать встречу: сначала аккаунт агентства, иначе платформенный S2S ---------- */
async function createMeeting(db, { topic, startAtMs, durationMin, tid, leadId }) {
  const body = {
    topic: String(topic || 'Встреча').slice(0, 200),
    type: 2,
    start_time: new Date(Math.max(Date.now(), startAtMs || Date.now())).toISOString(),
    duration: Math.max(15, Math.min(240, durationMin || 60)),
    timezone: 'UTC',
    settings: { join_before_host: true, waiting_room: false, auto_recording: 'cloud', approval_type: 2 },   /* Zoom пишет сам в облако → транскрипт заберём вебхуком, без платного бота */
    agenda: ('CRM lead ' + (leadId || '') + ' · tenant ' + (tid || '')).slice(0, 2000),
    tracking_fields: [{ field: 'tid', value: String(tid || '') }, { field: 'leadId', value: String(leadId || '') }],
  };
  try {
    let token, host;
    const c = conn(db);
    if (c.connected && c.refreshToken) { token = await accessToken(db); host = 'me'; }   /* аккаунт агентства (user OAuth → me = авторизовавший) */
    else if (s2sConfigured()) { const sc = s2sCreds(); token = await s2sToken(sc); host = sc.userId; }   /* платформенный фолбэк */
    else return { error: 'Zoom не подключён (ни аккаунт агентства, ни платформенный)' };
    const r = await fetch('https://api.zoom.us/v2/users/' + encodeURIComponent(host) + '/meetings', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.join_url) return { error: 'zoom create ' + r.status + ': ' + (j.message || '') };
    return { ok: true, joinUrl: j.join_url, meetingId: String(j.id || ''), password: j.password || '' };
  } catch (e) { return { error: String(e.message || e).slice(0, 160) }; }
}

/* ---------- Zoom-native запись: вебхук + забор транскрипта (ДЁШЕВЫЙ путь, без бота Recall) ---------- */
const crypto = require('crypto');
function webhookSecret() { return process.env.ZOOM_WEBHOOK_SECRET_TOKEN || ''; }
/* ответ на endpoint.url_validation (Zoom требует вернуть HMAC от plainToken) */
function urlValidation(plainToken) {
  const enc = crypto.createHmac('sha256', webhookSecret()).update(String(plainToken || '')).digest('hex');
  return { plainToken: String(plainToken || ''), encryptedToken: enc };
}
/* проверка подписи события: x-zm-signature = 'v0=' + HMAC('v0:{ts}:{rawBody}') */
function verifyWebhook(ts, rawBody, sig) {
  const sec = webhookSecret(); if (!sec) return true;   /* секрет не задан → не ломаем (эндпоинт и так matched по tracking_fields) */
  try {
    const msg = 'v0:' + ts + ':' + rawBody;
    const expected = 'v0=' + crypto.createHmac('sha256', sec).update(msg).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(String(sig || '')), Buffer.from(expected));
  } catch (_) { return false; }
}

/* токен под текущий тенант: свой OAuth ИЛИ платформенный S2S */
async function anyToken(db) {
  const c = conn(db);
  if (c.connected && c.refreshToken) return await accessToken(db);
  if (s2sConfigured()) return await s2sToken(s2sCreds());
  throw new Error('нет токена Zoom');
}
/* VTT → чистый текст (убираем WEBVTT, индексы, таймкоды, дубли подряд) */
function parseVtt(vtt) {
  const out = []; let last = '';
  for (let line of String(vtt || '').split(/\r?\n/)) {
    line = line.trim();
    if (!line || line === 'WEBVTT' || /^\d+$/.test(line) || line.includes('-->') || /^NOTE\b/.test(line)) continue;
    if (line !== last) { out.push(line); last = line; }
  }
  return out.join('\n');
}
/* забрать готовую расшифровку встречи. Возвращает { text } (готовый транскрипт Zoom, БЕСПЛАТНО),
   либо { audioUrl, token } (если транскрипта нет — index прогонит свой дешёвый STT), либо { error }. */
async function getRecording(db, meetingId) {
  try {
    const token = await anyToken(db);
    const r = await fetch('https://api.zoom.us/v2/meetings/' + encodeURIComponent(meetingId) + '/recordings', { headers: { Authorization: 'Bearer ' + token } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: 'zoom rec ' + r.status + ': ' + (j.message || '') };
    const files = j.recording_files || [];
    const vtt = files.find(f => f.file_type === 'TRANSCRIPT' || f.recording_type === 'audio_transcript');
    if (vtt && vtt.download_url) {
      const tr = await fetch(vtt.download_url + (vtt.download_url.includes('?') ? '&' : '?') + 'access_token=' + token);
      if (tr.ok) { const text = parseVtt(await tr.text()); if (text) return { text }; }
    }
    const audio = files.find(f => f.file_type === 'M4A') || files.find(f => f.file_type === 'MP4');
    if (audio && audio.download_url) return { audioUrl: audio.download_url + (audio.download_url.includes('?') ? '&' : '?') + 'access_token=' + token, token };
    return { error: 'нет файлов записи' };
  } catch (e) { return { error: String(e.message || e).slice(0, 160) }; }
}

module.exports = { ready, status, createMeeting, appConfigured, s2sConfigured, startAuth, consumeState, exchangeCode, disconnect, webhookSecret, urlValidation, verifyWebhook, getRecording };
