/* Lumen CRM — генерация Zoom-ссылок (SaaS-модель, как Recall/Firecrawl).
   ОДИН платформенный Zoom-аккаунт (Server-to-Server OAuth app) обслуживает ВСЕ агентства:
   при брони видео-встречи ссылка создаётся через API под платформенным аккаунтом и тегается
   tid/leadId — агентству НИЧЕГО подключать не надо. Опционально агентство может подключить
   СВОЙ Zoom (settings.zoom.*) — тогда ссылки создаются под его аккаунтом (брендинг/владение).

   Ключи (платформенные, env — приоритет): ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET.
   Нет ключей → ready()=false → вызывающий код падает на бесплатный Jitsi (как было). Cost-safe:
   создание встречи в Zoom API бесплатно в рамках тарифа платформенного аккаунта.

   ⚠️ Zoom-ссылку (в отличие от Jitsi) умеет писать бот-нотетейкер Recall → именно Zoom/Meet/Teams
   даёт связку «авто-ссылка + авто-запись + авто-транскрипт». */

const store = require('./store');

/* конфиг: платформенный env (приоритет) ИЛИ per-tenant settings.zoom (если агентство подключило свой) */
function cfg() {
  let s = {};
  try { s = (store.get().settings && store.get().settings.zoom) || {}; } catch (_) {}
  return {
    accountId: process.env.ZOOM_ACCOUNT_ID || s.accountId || '',
    clientId: process.env.ZOOM_CLIENT_ID || s.clientId || '',
    clientSecret: process.env.ZOOM_CLIENT_SECRET || s.clientSecret || '',
    /* true, если ссылки создаются под аккаунтом самого агентства (а не платформенного) */
    perTenant: !process.env.ZOOM_ACCOUNT_ID && !!(s.accountId && s.clientId && s.clientSecret),
  };
}
function ready() { const c = cfg(); return !!(c.accountId && c.clientId && c.clientSecret); }

/* кэш access-token по accountId (S2S-токен живёт ~1ч; обновляем с запасом) */
const _tok = new Map();   /* accountId → { token, exp } */
async function getToken(c) {
  const hit = _tok.get(c.accountId);
  if (hit && hit.exp > Date.now() + 60e3) return hit.token;
  const basic = Buffer.from(c.clientId + ':' + c.clientSecret).toString('base64');
  const r = await fetch('https://zoom.us/oauth/token?grant_type=account_credentials&account_id=' + encodeURIComponent(c.accountId), {
    method: 'POST', headers: { Authorization: 'Basic ' + basic, 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('zoom oauth ' + r.status + ': ' + (j.reason || j.error || ''));
  _tok.set(c.accountId, { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 });
  return j.access_token;
}

/* создать запланированную Zoom-встречу. Возвращает { ok, joinUrl, meetingId, password } или { error } */
async function createMeeting({ topic, startAtMs, durationMin, tid, leadId }) {
  const c = cfg();
  if (!ready()) return { error: 'нет ключей Zoom (ZOOM_ACCOUNT_ID/CLIENT_ID/CLIENT_SECRET)' };
  try {
    const token = await getToken(c);
    const body = {
      topic: String(topic || 'Встреча').slice(0, 200),
      type: 2,                                   /* scheduled */
      start_time: new Date(Math.max(Date.now(), startAtMs || Date.now())).toISOString(),
      duration: Math.max(15, Math.min(240, durationMin || 60)),
      timezone: 'UTC',
      settings: {
        join_before_host: true,                  /* клиент/бот могут войти до хоста */
        waiting_room: false,                     /* иначе бот-нотетейкер застрянет в комнате ожидания */
        auto_recording: 'none',                  /* пишет НЕ Zoom (платно у Zoom), а бот Recall */
        approval_type: 2,
      },
      agenda: ('CRM lead ' + (leadId || '') + ' · tenant ' + (tid || '')).slice(0, 2000),
      tracking_fields: [{ field: 'tid', value: String(tid || '') }, { field: 'leadId', value: String(leadId || '') }],
    };
    const r = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.join_url) return { error: 'zoom create ' + r.status + ': ' + (j.message || '') };
    return { ok: true, joinUrl: j.join_url, meetingId: String(j.id || ''), password: j.password || '' };
  } catch (e) { return { error: String(e.message || e).slice(0, 160) }; }
}

module.exports = { ready, createMeeting, cfg, _perTenant: () => cfg().perTenant };
