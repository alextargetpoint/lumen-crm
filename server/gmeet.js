/* Lumen CRM — генерация Google Meet-ссылок (SaaS, per-tenant OAuth) — зеркало zoom.js.
   КАЖДОЕ агентство подключает СВОЙ Google: owner жмёт «Подключить Google Meet» → OAuth-согласие →
   per-tenant токены (settings.gmeet) → встречи создаются как события Google Calendar с Meet-ссылкой под
   аккаунтом агентства. Платформа регистрирует ОДНО OAuth-приложение (GOOGLE_OAUTH_CLIENT_ID/SECRET +
   PUBLIC_BASE_URL/auth/gmeet/callback). Нет подключения → ready(db)=false → вызывающий падает на Jitsi. */

const store = require('./store');
const crypto = require('crypto');

function appCreds() {
  return {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
    redirectUri: (process.env.PUBLIC_BASE_URL || process.env.LUMEN_BASE || '').replace(/\/+$/, '') + '/auth/gmeet/callback',
  };
}
function appConfigured() { const a = appCreds(); return !!(a.clientId && a.clientSecret && /^https:\/\//.test(a.redirectUri)); }
function conn(db) { return (db && db.settings && db.settings.gmeet) || {}; }
function connH(holder) { return (holder && holder.gmeet) || {}; }
function holderConnected(holder) { const c = connH(holder); return !!(c.connected && c.refreshToken); }
function holderFor(db, broker) { return (broker && holderConnected(broker)) ? broker : (db && db.settings); }
function ready(db, broker) { const d = db || store.get(); return holderConnected(broker) || holderConnected(d && d.settings); }
function status(dbOrHolder) {
  const holder = (dbOrHolder && dbOrHolder.settings) ? dbOrHolder.settings : dbOrHolder;
  const c = connH(holder);
  return { connected: !!(c.connected && c.refreshToken), email: c.email || '', connectedAt: c.connectedAt || 0, appReady: appConfigured() };
}

const SCOPE = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email';
const _states = new Map();
function startAuth(tid, brokerId) {
  const a = appCreds();
  const nonce = crypto.randomBytes(16).toString('hex');
  _states.set(nonce, { tid, brokerId: brokerId || null, at: Date.now() });
  for (const [k, v] of _states) if (Date.now() - v.at > 10 * 60e3) _states.delete(k);
  const p = new URLSearchParams({ client_id: a.clientId, redirect_uri: a.redirectUri, response_type: 'code',
    scope: SCOPE, access_type: 'offline', prompt: 'consent', state: nonce });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString();
}
function consumeState(nonce) { const v = _states.get(nonce); if (!v) return null; _states.delete(nonce); return (Date.now() - v.at > 10 * 60e3) ? null : { tid: v.tid, brokerId: v.brokerId || null }; }

async function _tokenReq(params) {
  const a = appCreds();
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(Object.assign({ client_id: a.clientId, client_secret: a.clientSecret }, params)).toString(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('google token ' + r.status + ': ' + (j.error_description || j.error || ''));
  return j;
}
async function exchangeCode(db, code, holder) {
  holder = holder || db.settings;
  const a = appCreds();
  const j = await _tokenReq({ grant_type: 'authorization_code', code, redirect_uri: a.redirectUri });
  const g = holder.gmeet = holder.gmeet || {};
  g.accessToken = j.access_token; if (j.refresh_token) g.refreshToken = j.refresh_token;
  g.expiresAt = Date.now() + (j.expires_in || 3600) * 1000; g.connected = true; g.connectedAt = Date.now();
  try { const me = await apiGet(db, 'https://www.googleapis.com/oauth2/v2/userinfo', holder); g.email = (me && me.email) || g.email || ''; } catch (_) {}
  store.save(); return { ok: true, email: g.email };
}
async function accessToken(db, holder) {
  holder = holder || db.settings;
  const g = connH(holder);
  if (!g.refreshToken) throw new Error('Google Meet не подключён');
  if (g.accessToken && g.expiresAt > Date.now() + 60e3) return g.accessToken;
  const j = await _tokenReq({ grant_type: 'refresh_token', refresh_token: g.refreshToken });
  const gg = holder.gmeet; gg.accessToken = j.access_token; if (j.refresh_token) gg.refreshToken = j.refresh_token;
  gg.expiresAt = Date.now() + (j.expires_in || 3600) * 1000; store.save();
  return j.access_token;
}
async function apiGet(db, url, holder) {
  const t = await accessToken(db, holder);
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + t } });
  return r.json().catch(() => ({}));
}
function disconnect(dbOrHolder) { const holder = (dbOrHolder && dbOrHolder.settings) ? dbOrHolder.settings : dbOrHolder; if (holder) holder.gmeet = { connected: false }; store.save(); }

/* создать событие Google Calendar с Meet-ссылкой. Возвращает { ok, joinUrl, eventId } */
async function createMeeting(db, { topic, startAtMs, durationMin, tid, leadId, broker }) {
  const holder = holderFor(db, broker);   /* свой Google брокера → иначе агентство */
  if (!holderConnected(holder)) return { error: 'Google Meet не подключён' };
  try {
    const t = await accessToken(db, holder);
    const start = new Date(Math.max(Date.now(), startAtMs || Date.now()));
    const end = new Date(start.getTime() + Math.max(15, Math.min(240, durationMin || 60)) * 60e3);
    const body = {
      summary: String(topic || 'Встреча').slice(0, 200),
      description: 'CRM lead ' + (leadId || '') + ' · tenant ' + (tid || ''),
      start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() },
      conferenceData: { createRequest: { requestId: crypto.randomBytes(8).toString('hex'), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
    };
    const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', {
      method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    const link = j.hangoutLink || (j.conferenceData && j.conferenceData.entryPoints && (j.conferenceData.entryPoints.find(e => e.entryPointType === 'video') || {}).uri);
    if (!r.ok || !link) return { error: 'gcal ' + r.status + ': ' + (j.error && j.error.message || '') };
    return { ok: true, joinUrl: link, eventId: j.id || '' };
  } catch (e) { return { error: String(e.message || e).slice(0, 160) }; }
}

module.exports = { ready, status, createMeeting, appConfigured, startAuth, consumeState, exchangeCode, disconnect };
