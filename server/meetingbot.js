/* Lumen CRM — авто-запись и транскрипция онлайн-встреч (Zoom / Google Meet / Teams).
   Провайдеро-независимый адаптер (по умолчанию Recall.ai): при бронировании встречи с
   Zoom/Meet-ссылкой в звонок АВТОМАТИЧЕСКИ заходит бот-нотетейкер, пишет и расшифровывает —
   клиенту ничего включать руками не нужно. По готовности транскрипт+резюме ложатся в карточку.

   Ключ провайдера — env RECALL_API_KEY (или settings.meetingBot.key); БЕЗ ключа адаптер
   выключен (ready()=false) → бот не заказывается, счёт не капает. Cost-safe: бот только на
   реально забронированные видео-встречи (Zoom/Meet/Teams), не на каждый звонок.

   Стоимость (Recall.ai, pay-as-you-go): ~$0.7–1.5 за час встречи (запись+транскрипт). */

const store = require('./store');

/* конфиг из настроек тенанта + env (env приоритетнее — платформенный ключ) */
function cfg() {
  const s = (store.get().settings && store.get().settings.meetingBot) || {};
  return {
    enabled: s.enabled !== false,                     /* по умолчанию вкл, если есть ключ */
    provider: s.provider || 'recall',
    key: process.env.RECALL_API_KEY || s.key || '',
    region: process.env.RECALL_REGION || s.region || 'us-east-1',
    botName: s.botName || 'Lumen · запись встречи',
    transcriptProvider: s.transcriptProvider || 'meeting_captions',  /* дешевле всего; можно assembly_ai/deepgram */
  };
}
function ready() { return !!cfg().key; }
function apiBase(c) { return 'https://' + c.region + '.recall.ai/api/v1'; }

/* поддерживаемые ботом платформы (Jitsi/по умолчанию наш — НЕ шлём, Recall его не ведёт) */
function isSupportedMeetingUrl(url) {
  return /(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|webex\.com)/i.test(String(url || ''));
}

/* заказать бота на встречу (join_at — когда войти; ISO). Возвращает botId. */
async function scheduleBot(meetingUrl, joinAtMs, meta) {
  const c = cfg();
  if (!c.key) return { error: 'нет ключа meeting-бота (RECALL_API_KEY)' };
  if (!isSupportedMeetingUrl(meetingUrl)) return { error: 'ссылка не Zoom/Meet/Teams — бот не заходит' };
  const body = {
    meeting_url: meetingUrl,
    bot_name: c.botName,
    join_at: new Date(Math.max(Date.now() + 60e3, joinAtMs || Date.now())).toISOString(),
    recording_config: { transcript: { provider: { [c.transcriptProvider]: {} } } },
    metadata: { meetingId: meta.meetingId || '', leadId: meta.leadId || '', tid: meta.tid || '' },
  };
  try {
    const r = await fetch(apiBase(c) + '/bot/', {
      method: 'POST', headers: { Authorization: 'Token ' + c.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: 'recall ' + r.status + ': ' + (j.detail || (j.meeting_url && j.meeting_url[0]) || JSON.stringify(j).slice(0, 160)) };
    return { ok: true, botId: j.id || j.bot_id };
  } catch (e) { return { error: 'сеть: ' + e.message }; }
}

/* отменить бота (встреча удалена/перенесена) */
async function cancelBot(botId) {
  const c = cfg(); if (!c.key || !botId) return;
  try { await fetch(apiBase(c) + '/bot/' + botId + '/', { method: 'DELETE', headers: { Authorization: 'Token ' + c.key } }); } catch (_) {}
}

/* статус бота (для поллинга-фолбэка) */
async function botStatus(botId) {
  const c = cfg(); if (!c.key || !botId) return { error: 'no key/bot' };
  try {
    const r = await fetch(apiBase(c) + '/bot/' + botId + '/', { headers: { Authorization: 'Token ' + c.key } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: 'recall ' + r.status };
    /* последний статус из истории */
    const st = Array.isArray(j.status_changes) && j.status_changes.length ? j.status_changes[j.status_changes.length - 1].code : (j.status && j.status.code) || '';
    return { ok: true, status: st, raw: j };
  } catch (e) { return { error: e.message }; }
}

/* забрать транскрипт (плоский текст со спикерами) */
async function fetchTranscript(botId) {
  const c = cfg(); if (!c.key || !botId) return { error: 'no key/bot' };
  try {
    const r = await fetch(apiBase(c) + '/bot/' + botId + '/transcript/', { headers: { Authorization: 'Token ' + c.key } });
    const j = await r.json().catch(() => (null));
    if (!r.ok) return { error: 'recall ' + r.status };
    const segs = Array.isArray(j) ? j : (j && Array.isArray(j.transcript) ? j.transcript : []);
    if (!segs.length) return { ok: true, text: '' };
    const text = segs.map(seg => {
      const who = seg.speaker || (seg.participant && seg.participant.name) || '';
      const words = Array.isArray(seg.words) ? seg.words.map(w => w.text || w.word || '').join(' ') : (seg.text || '');
      return (who ? who + ': ' : '') + words;
    }).filter(Boolean).join('\n');
    return { ok: true, text };
  } catch (e) { return { error: e.message }; }
}

module.exports = { cfg, ready, isSupportedMeetingUrl, scheduleBot, cancelBot, botStatus, fetchTranscript };
