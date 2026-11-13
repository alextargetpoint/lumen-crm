/* Meta CTWA (Click-to-WhatsApp) — оптимизация рекламы на ЦЕЛЕВЫЕ переписки в WhatsApp.
   Отличается от пиксельного CAPI (capi.js): событие уходит в DATASET WABA через business_messaging
   с ctwa_clid (а не хешированный PII), чтобы Meta оптимизировала показы на людей, дающих КАЧЕСТВЕННУЮ
   переписку, а не просто начавших диалог.

   Цикл:
   • ЗАХВАТ (step 7): входящий WhatsApp-вебхук ловит messages[0].referral.ctwa_clid и кладёт в
     lead.ads.ctwaClid (см. index.js /wa/webhook). Приходит ОДИН раз, в первом сообщении — не прозевать.
   • СТРЕЛЬБА (step 8, этот модуль): когда ИИ-скрининг пометил переписку целевой (стадия qualified),
     шлём POST /{DATASET_ID}/events с QualifiedLead, action_source=business_messaging,
     messaging_channel=whatsapp, user_data={whatsapp_business_account_id, ctwa_clid}. Дедуп по лиду. */
const GRAPH = 'https://graph.facebook.com/v21.0';

function cfg(db) { return (db.settings && db.settings.ctwa) || {}; }
function ready(db) { const c = cfg(db); return !!(c.enabled && c.datasetId && c.wabaId && c.token); }

/* отправка одного CTWA-события в dataset WABA. Возвращает {ok|skipped, error, received}. */
async function sendEvent(db, lead, opts = {}) {
  const c = cfg(db);
  if (!ready(db)) return { skipped: 'ctwa_off' };
  const clid = lead && lead.ads && lead.ads.ctwaClid;
  if (!clid) return { skipped: 'no_ctwa_clid' };                 /* лид пришёл НЕ с CTWA — слать нечего */
  const eventName = opts.eventName || c.eventName || 'QualifiedLead';
  const event = {
    event_name: eventName,
    event_time: Math.floor((opts.at || Date.now()) / 1000),
    action_source: 'business_messaging',
    messaging_channel: 'whatsapp',
    /* ctwa_clid матчит переписку с кликом по рекламе; WABA id — к какому бизнес-аккаунту относится */
    user_data: { whatsapp_business_account_id: c.wabaId, ctwa_clid: clid },
  };
  const body = { data: [event] };
  if (c.testCode) body.test_event_code = c.testCode;             /* непусто → Test Events, иначе боевое */
  const logRow = (ok, extra = {}) => {
    db.settings.ctwa.log = db.settings.ctwa.log || [];
    db.settings.ctwa.log.unshift(Object.assign({ at: Date.now(), lead: (lead && lead.name) || '', event: eventName, ok }, extra));
    if (db.settings.ctwa.log.length > 60) db.settings.ctwa.log.length = 60;
    db.settings.ctwa.stats = db.settings.ctwa.stats || { sent: 0, failed: 0 };
    db.settings.ctwa.stats[ok ? 'sent' : 'failed'] += 1;
  };
  try {
    const r = await fetch(`${GRAPH}/${encodeURIComponent(c.datasetId)}/events?access_token=${encodeURIComponent(c.token)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    const ok = r.ok && !j.error;
    logRow(ok, { err: j.error ? (j.error.message || 'ошибка') : null, received: j.events_received || 0, test: !!c.testCode });
    return { ok, error: j.error ? (j.error.message || '') : null, received: j.events_received || 0 };
  } catch (e) {
    logRow(false, { err: e.message });
    return { ok: false, error: e.message };
  }
}

/* хук квалификации: целевая переписка → одно QualifiedLead на лида (дедуп), не блокируя ответ. */
function onQualified(db, lead) {
  if (!ready(db) || !lead) return;
  if (!(lead.ads && lead.ads.ctwaClid)) return;                  /* не CTWA-лид — тихо выходим */
  db.settings.ctwa.fired = db.settings.ctwa.fired || {};
  if (db.settings.ctwa.fired[lead.id]) return;                   /* уже стреляли по этому лиду */
  db.settings.ctwa.fired[lead.id] = Date.now();
  sendEvent(db, lead).catch(() => {});
}

module.exports = { sendEvent, onQualified, ready, cfg };
