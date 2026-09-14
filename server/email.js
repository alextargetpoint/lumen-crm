/* Почтовая инфраструктура SaaS: Atelier-оформление (инлайн-стили — требование почтовиков),
   билингва-шаблоны (RU/EN), отправка через Resend. Шаблоны редактируются в админке основателя
   и хранятся в registry.emailTemplates. Ключевые письма: welcome / passwordReset / notification / marketing. */

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Atelier-обёртка письма: крем, serif-заголовок, угольная кнопка. Только инлайн-стили + таблицы. */
function emailWrap(title, bodyHtml, lang) {
  const en = lang === 'en';
  return `<!doctype html><html lang="${en ? 'en' : 'ru'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f1ec;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f1ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
 <tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#faf9f5;border:1px solid rgba(20,19,17,.12);border-radius:16px;overflow:hidden;">
    <tr><td style="padding:34px 40px 0 40px;">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:.18em;color:#141311;">LUMEN</div>
      <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8b8983;margin-top:4px;">${en ? 'REAL ESTATE CRM' : 'CRM ДЛЯ НЕДВИЖИМОСТИ'}</div>
    </td></tr>
    <tr><td style="padding:22px 40px 6px 40px;">
      <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:26px;line-height:1.22;color:#141311;margin:0 0 14px 0;">${title}</h1>
      <div style="font-size:15px;line-height:1.66;color:#57544e;">${bodyHtml}</div>
    </td></tr>
    <tr><td style="padding:24px 40px 32px 40px;">
      <div style="border-top:1px solid rgba(20,19,17,.1);padding-top:16px;font-size:12px;line-height:1.5;color:#8b8983;">
        ${en ? 'You received this email because you use Lumen. If this wasn’t you, please ignore it.' : 'Вы получили это письмо, потому что пользуетесь Lumen. Если это были не вы — просто проигнорируйте.'}
      </div>
    </td></tr>
  </table>
  <div style="font-size:11px;color:#a8a6a0;margin-top:16px;">© 2026 Lumen · ${en ? 'Real Estate AI-CRM' : 'AI-CRM для агентств недвижимости'}</div>
 </td></tr>
</table></body></html>`;
}

/* угольная CTA-кнопка (Atelier) */
function emailButton(url, label) {
  return `<a href="${esc(url)}" style="display:inline-block;background:#1a1815;color:#faf9f5;text-decoration:none;font-weight:600;font-size:15px;padding:13px 28px;border-radius:10px;margin:10px 0;">${esc(label)}</a>`;
}

/* дефолтные шаблоны (RU/EN). {{vars}} подставляются; {{button}} — готовая кнопка со ссылкой {{link}}. */
const DEFAULT_TEMPLATES = {
  welcome: {
    name: 'Приветствие / Welcome',
    subject_ru: 'Добро пожаловать в Lumen, {{name}}',
    subject_en: 'Welcome to Lumen, {{name}}',
    body_ru: '<p>Здравствуйте, {{name}}!</p><p>Аккаунт агентства <b>{{agency}}</b> создан. Lumen уже ловит ваших лидов, отвечает первым и держит воронку под контролем.</p><p>{{button}}</p><p>Если появятся вопросы — просто ответьте на это письмо.</p>',
    body_en: '<p>Hi {{name}},</p><p>Your agency account <b>{{agency}}</b> is ready. Lumen already captures your leads, replies first, and keeps the pipeline under control.</p><p>{{button}}</p><p>Any questions — just reply to this email.</p>',
  },
  passwordReset: {
    name: 'Сброс пароля / Password reset',
    subject_ru: 'Сброс пароля Lumen',
    subject_en: 'Reset your Lumen password',
    body_ru: '<p>Здравствуйте!</p><p>Вы запросили сброс пароля. Нажмите кнопку ниже, чтобы задать новый пароль — ссылка действует ограниченное время.</p><p>{{button}}</p><p>Если вы не запрашивали сброс — проигнорируйте это письмо, пароль останется прежним.</p>',
    body_en: '<p>Hi,</p><p>You requested a password reset. Click the button below to set a new password — the link is valid for a limited time.</p><p>{{button}}</p><p>If you didn’t request this, just ignore this email — your password stays the same.</p>',
  },
  notification: {
    name: 'Уведомление / Notification',
    subject_ru: 'Lumen: {{title}}',
    subject_en: 'Lumen: {{title}}',
    body_ru: '<p>Здравствуйте, {{name}}!</p><p>{{message}}</p><p>{{button}}</p>',
    body_en: '<p>Hi {{name}},</p><p>{{message}}</p><p>{{button}}</p>',
  },
  marketing: {
    name: 'Маркетинг / Marketing',
    subject_ru: '{{subject}}',
    subject_en: '{{subject}}',
    body_ru: '<p>Здравствуйте, {{name}}!</p><p>{{message}}</p><p>{{button}}</p><p style="color:#8b8983;font-size:12px">Не хотите получать такие письма? <a href="{{unsubscribe}}" style="color:#8b8983">Отписаться</a>.</p>',
    body_en: '<p>Hi {{name}},</p><p>{{message}}</p><p>{{button}}</p><p style="color:#8b8983;font-size:12px">Don’t want these emails? <a href="{{unsubscribe}}" style="color:#8b8983">Unsubscribe</a>.</p>',
  },
};

function getTemplates(registry) {
  registry.emailTemplates = registry.emailTemplates || {};
  const out = {};
  for (const k of Object.keys(DEFAULT_TEMPLATES)) out[k] = Object.assign({}, DEFAULT_TEMPLATES[k], registry.emailTemplates[k] || {});
  return out;
}

function interpolate(str, vars) {
  return String(str || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars && vars[k] != null) ? vars[k] : '');
}

/* собрать готовое письмо: {subject, html} на нужном языке с подстановкой vars */
function renderTemplate(registry, key, vars, lang) {
  const t = getTemplates(registry)[key] || DEFAULT_TEMPLATES.notification;
  lang = lang === 'en' ? 'en' : 'ru';
  const v = Object.assign({}, vars);
  if (v.link && !v.button) v.button = emailButton(v.link, v.buttonLabel || (lang === 'en' ? 'Open' : 'Открыть'));
  const subject = interpolate(t['subject_' + lang] || t.subject_ru, v);
  const inner = interpolate(t['body_' + lang] || t.body_ru, v);
  const title = interpolate(v.title || subject, v);
  return { subject, html: emailWrap(esc(title), inner, lang) };
}

/* платформенная конфигурация Resend: registry.email {key, from} или env */
function platformEmailCfg(registry) {
  return {
    key: (registry.email && registry.email.key) || process.env.RESEND_API_KEY || '',
    from: (registry.email && registry.email.from) || process.env.RESEND_FROM || 'Lumen <onboarding@resend.dev>',
  };
}

async function sendViaResend(cfg, to, subject, html) {
  if (!cfg.key) return { ok: false, error: 'Resend не настроен (нет API-ключа)' };
  if (!to) return { ok: false, error: 'нет адреса получателя' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: cfg.from, to, subject, html }),
    });
    if (!r.ok) { const t = await r.text().catch(() => ''); return { ok: false, error: 'Resend ' + r.status + (t ? ': ' + t.slice(0, 160) : '') }; }
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { emailWrap, emailButton, DEFAULT_TEMPLATES, getTemplates, renderTemplate, interpolate, platformEmailCfg, sendViaResend };
