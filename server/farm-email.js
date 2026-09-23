/* Lumen CRM — Ферма: email-адаптер для Telegram (Р2+).
   Telegram у новых номеров часто требует привязать e-mail и шлёт код НА ПОЧТУ (не SMS).
   Одноразовые домены Telegram блокирует → нужен СВОЙ домен с catch-all: каждый номер
   получает уникальный `num<id>@наш-домен`, письмо с кодом ловится и код читается автоматом.

   Забор письма — БЕЗ зависимостей, через inbound-вебхук (рекомендую Cloudflare Email Routing,
   бесплатно): MX домена → Email Worker → POST /api/farm/email-inbound {to,subject,text,secret}.
   Код кладётся в registry.farm.emailInbox[адрес], агент читает через /agent-email-code.
   ENV: FARM_EMAIL_DOMAIN (напр. mail.наш-домен.com), FARM_EMAIL_SECRET (общий секрет вебхука). */

const store = require('./store');
const farmSvc = require('./farm');

function domain() { return (process.env.FARM_EMAIL_DOMAIN || '').trim().toLowerCase(); }
function ready() { return !!domain(); }
function inbox() { const f = farmSvc.farm(); f.emailInbox = f.emailInbox || {}; return f.emailInbox; }

/* выделить уникальный адрес номеру */
function allocate(numberId) {
  const d = domain(); if (!d) return { error: 'FARM_EMAIL_DOMAIN не задан' };
  const local = 'num' + String(numberId).replace(/[^a-z0-9]/gi, '').toLowerCase();
  const addr = local + '@' + d;
  const n = farmSvc.findNumber(numberId);
  if (n) { n.tg = n.tg || {}; n.tg.email = addr; store.saveRegistry(); }
  return { addr };
}

/* вытащить код из письма Telegram (subject приоритетнее) */
function extractCode(subject, text) {
  const s = String(subject || ''); const t = String(text || '');
  const tries = [
    () => (s.match(/(\d{5,6})\D*is your/i) || [])[1],
    () => (s.match(/telegram code[:\s]*(\d{5,6})/i) || [])[1],
    () => (t.match(/login code[:\s]*[*_]*\s*(\d{5,6})/i) || [])[1],
    () => (t.match(/code[:\s]*[*_]*\s*(\d{5,6})/i) || [])[1],
    () => (s.match(/\b(\d{5,6})\b/) || [])[1],
    () => (t.match(/\b(\d{5,6})\b/) || [])[1],
  ];
  for (const f of tries) { const c = f(); if (c) return c; }
  return '';
}

/* приём письма от вебхука */
function ingest(to, subject, text) {
  const box = inbox();
  const addr = String(to || '').toLowerCase().trim();
  if (!addr) return { error: 'нет получателя' };
  const code = extractCode(subject, text);
  box[addr] = { code, subject: String(subject || '').slice(0, 140), at: Date.now() };
  const keys = Object.keys(box); if (keys.length > 500) delete box[keys[0]]; /* кап хранилища */
  store.saveRegistry();
  return { ok: true, addr, code };
}

/* прочитать свежий код по адресу (актуален 15 мин) */
function readCode(address) {
  const rec = inbox()[String(address || '').toLowerCase().trim()];
  if (rec && rec.code && (Date.now() - rec.at) < 15 * 60000) return { code: rec.code, subject: rec.subject };
  return { pending: true };
}

module.exports = { domain, ready, allocate, ingest, readCode, extractCode };
