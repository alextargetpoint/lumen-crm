/* Lumen CRM — адаптер WhatsApp Cloud API (официальный канал Meta).
   Активен, когда settings.wa.mode === 'cloud' и задан токен; иначе
   engine.send работает в mock-режиме (сообщение только в CRM).
   Отправка «в огонь»: статус проставляется по факту ответа Graph API,
   доставка/прочтение прилетают вебхуком statuses. */
const GRAPH = 'https://graph.facebook.com/v20.0';

function ready(db) {
  const wa = db.settings.wa;
  return wa.mode === 'cloud' && wa.token && wa.phoneId;
}

async function post(db, path, body) {
  const wa = db.settings.wa;
  const r = await fetch(`${GRAPH}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wa.token}` },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`cloud api ${r.status}: ${j.error?.message || 'unknown'}`);
  return j;
}

function toWaPhone(phone) { return phone.replace(/\D/g, ''); }

async function sendText(db, lead, text) {
  return post(db, `${db.settings.wa.phoneId}/messages`, {
    messaging_product: 'whatsapp',
    to: toWaPhone(lead.phone),
    type: 'text',
    text: { preview_url: false, body: text },
  });
}

/* Шаблон: имя в Meta = id шаблона в Lumen без префикса tpl_, параметры —
   подставленные значения {name}/{geo}/… в порядке появления в теле. */
async function sendTemplate(db, lead, tpl, renderedText) {
  return post(db, `${db.settings.wa.phoneId}/messages`, {
    messaging_product: 'whatsapp',
    to: toWaPhone(lead.phone),
    type: 'template',
    template: {
      name: tpl.id.replace(/^tpl_/, ''),
      language: { code: tpl.lang === 'ru' ? 'ru' : 'en' },
      components: [{ type: 'body', parameters: [{ type: 'text', text: renderedText }] }],
    },
  });
}

/* Разбор statuses из вебхука: delivered/read → статус сообщения в CRM */
function applyStatuses(db, value) {
  const statuses = value?.statuses || [];
  let changed = false;
  for (const st of statuses) {
    const m = db.messages.find(x => x.waId === st.id);
    if (m && ['delivered', 'read', 'failed'].includes(st.status)) { m.status = st.status; changed = true; }
  }
  return changed;
}

module.exports = { ready, sendText, sendTemplate, applyStatuses };
