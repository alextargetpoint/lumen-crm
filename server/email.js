/* Почтовая инфраструктура SaaS: премиум Atelier-оформление (инлайн-стили + таблицы — требование почтовиков),
   билингва-шаблоны (RU/EN), отправка через Resend. Шаблоны редактируются в админке основателя и хранятся
   в registry.emailTemplates. Полная цепочка транзакционных писем: подтверждение e-mail, приветствие, сброс/
   смена пароля, приглашение в команду, вход с нового устройства, оплата/подписка, уведомления, маркетинг. */

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const C = { bg: '#f3f1ec', card: '#fffdfa', ink: '#141311', ink2: '#57544e', ink3: '#8b8983', line: 'rgba(20,19,17,.1)', line2: 'rgba(20,19,17,.06)', gold: '#c9a86a', panel: '#f4f1ea' };
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/* Премиум Atelier-обёртка: крем, золотая звезда-эмблема, тонкий акцент, serif-заголовок, футер со ссылками. */
function emailWrap(title, bodyHtml, lang, opt) {
  const en = lang === 'en';
  const o = opt || {};
  const pre = o.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.card};font-size:1px;line-height:1px;">${esc(o.preheader)}</div>` : '';
  const eyebrow = o.eyebrow ? `<div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:${C.gold};font-weight:700;margin:0 0 10px 0;font-family:${SANS};">${esc(o.eyebrow)}</div>` : '';
  return `<!doctype html><html lang="${en ? 'en' : 'ru'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${C.bg};">${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};font-family:${SANS};">
 <tr><td align="center" style="padding:34px 16px;">
  <table role="presentation" width="540" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;background:${C.card};border:1px solid ${C.line};border-radius:18px;overflow:hidden;box-shadow:0 24px 48px -32px rgba(20,19,17,.28);">
    <tr><td style="height:3px;background:linear-gradient(90deg,${C.gold},#e6d6b4 55%,${C.gold});font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td style="padding:32px 44px 0 44px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="font-family:${SERIF};font-size:20px;color:${C.gold};padding-right:9px;line-height:1;">&#10022;</td>
        <td style="font-family:${SERIF};font-size:21px;letter-spacing:.2em;color:${C.ink};line-height:1;">LUMEN</td>
      </tr></table>
      <div style="font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:${C.ink3};margin-top:5px;">${en ? 'Real estate AI-CRM' : 'AI-CRM для недвижимости'}</div>
    </td></tr>
    <tr><td style="padding:26px 44px 4px 44px;">
      ${eyebrow}
      <h1 style="font-family:${SERIF};font-weight:500;font-size:27px;line-height:1.22;color:${C.ink};margin:0 0 16px 0;letter-spacing:-.01em;">${title}</h1>
      <div style="font-size:15px;line-height:1.68;color:${C.ink2};">${bodyHtml}</div>
    </td></tr>
    <tr><td style="padding:26px 44px 32px 44px;">
      <div style="border-top:1px solid ${C.line};padding-top:16px;font-size:12px;line-height:1.6;color:${C.ink3};">
        ${en ? 'You received this email because you use Lumen. If this wasn’t you, please ignore it.' : 'Вы получили это письмо, потому что пользуетесь Lumen. Если это были не вы — просто проигнорируйте.'}
        <div style="margin-top:10px;">
          <a href="https://lumen247.com/privacy.html" style="color:${C.ink3};text-decoration:underline;">${en ? 'Privacy' : 'Конфиденциальность'}</a>
          &nbsp;·&nbsp;<a href="https://lumen247.com/terms.html" style="color:${C.ink3};text-decoration:underline;">${en ? 'Terms' : 'Условия'}</a>
          &nbsp;·&nbsp;<a href="https://lumen247.com" style="color:${C.ink3};text-decoration:underline;">lumen247.com</a>
        </div>
      </div>
    </td></tr>
  </table>
  <div style="font-size:11px;color:#a8a6a0;margin-top:16px;font-family:${SANS};">© 2026 Lumen · TargetPoint AY</div>
 </td></tr>
</table></body></html>`;
}

/* угольная CTA-кнопка (bulletproof: обёрнута в таблицу для Outlook) */
function emailButton(url, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 6px 0;"><tr><td style="border-radius:11px;background:${C.ink};">
    <a href="${esc(url)}" style="display:inline-block;color:#faf9f5;text-decoration:none;font-weight:600;font-size:15px;font-family:${SANS};padding:14px 32px;border-radius:11px;">${esc(label)} &rarr;</a>
  </td></tr></table>`;
}

/* панель-выноска (важный блок на крем-фоне) */
function emailPanel(html, accent) {
  const bd = accent ? C.gold : C.line;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;"><tr><td style="background:${C.panel};border:1px solid ${bd};border-radius:12px;padding:16px 20px;font-size:14px;line-height:1.6;color:${C.ink2};">${html}</td></tr></table>`;
}

/* крупный код подтверждения (letter-spaced) */
function emailCode(code) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;"><tr><td align="center" style="background:${C.panel};border:1px solid ${C.line};border-radius:12px;padding:20px;">
    <div style="font-family:${SERIF};font-size:34px;letter-spacing:.32em;color:${C.ink};font-weight:500;">${esc(code)}</div>
  </td></tr></table>`;
}

/* таблица «поле — значение» (для входа с устройства, оплаты и т.п.) */
function emailDetails(rows) {
  const body = (rows || []).map(r => `<tr>
    <td style="padding:7px 0;font-size:13px;color:${C.ink3};white-space:nowrap;vertical-align:top;">${esc(r[0])}</td>
    <td style="padding:7px 0 7px 18px;font-size:14px;color:${C.ink};text-align:right;font-weight:600;">${esc(r[1])}</td>
  </tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0;background:${C.panel};border:1px solid ${C.line};border-radius:12px;"><tr><td style="padding:8px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table></td></tr></table>`;
}

/* дефолтные шаблоны (RU/EN). {{vars}} подставляются; {{button}} — готовая кнопка со ссылкой {{link}}.
   opt-поля: eyebrow_ru/eyebrow_en (надзаголовок), preheader_ru/preheader_en (превью в инбоксе). */
const DEFAULT_TEMPLATES = {
  verifyEmail: {
    name: 'Подтверждение e-mail / Verify email',
    eyebrow_ru: 'Подтверждение', eyebrow_en: 'Confirm',
    preheader_ru: 'Подтвердите адрес, чтобы активировать аккаунт Lumen', preheader_en: 'Confirm your email to activate Lumen',
    subject_ru: 'Один клик — и Lumen начнёт ловить лидов', subject_en: 'One click and Lumen starts catching leads',
    body_ru: '<p>Здравствуйте, {{name}}!</p><p>Остался один клик. Подтвердите <b>{{email}}</b> — и аккаунт <b>{{agency}}</b> оживёт: ИИ начнёт отвечать вашим лидам за 60 секунд, пока конкуренты ещё думают.</p><p>{{button}}</p><p style="color:#8b8983;font-size:13px">Ссылка живёт недолго. Не вы создавали аккаунт? Тогда письмо можно смело удалить.</p>',
    body_en: '<p>Hi {{name}},</p><p>One click left. Confirm <b>{{email}}</b> and your <b>{{agency}}</b> account comes alive — AI starts replying to your leads in 60 seconds while competitors are still thinking.</p><p>{{button}}</p><p style="color:#8b8983;font-size:13px">The link is short-lived. Didn’t create an account? Just delete this.</p>',
  },
  welcome: {
    name: 'Приветствие / Welcome',
    eyebrow_ru: 'Добро пожаловать', eyebrow_en: 'Welcome',
    preheader_ru: 'Ваш ИИ-отдел продаж уже ловит лидов', preheader_en: 'Your AI sales desk is already capturing leads',
    subject_ru: 'Вы в Lumen, {{name}}. Теперь лиды не убегут', subject_en: 'You’re in, {{name}}. Leads don’t get away now',
    body_ru: '<p>Здравствуйте, {{name}}!</p><p>Готово. Пока вы читаете это письмо, <b>{{agency}}</b> уже под Lumen: заявка приходит — ИИ отвечает за 60 секунд, квалифицирует и не даёт лиду остыть. Ни «перезвоню завтра», ни выходных.</p>{{panel}}<p>{{button}}</p><p>Застряли на старте? Ответьте на письмо — мы живые люди, поможем.</p>',
    body_en: '<p>Hi {{name}},</p><p>Done. While you read this, <b>{{agency}}</b> is already on Lumen: a lead comes in, AI replies in 60 seconds, qualifies, and won’t let them cool off. No “I’ll call tomorrow,” no weekends off.</p>{{panel}}<p>{{button}}</p><p>Stuck on setup? Reply to this email — real humans, we’ll help.</p>',
  },
  passwordReset: {
    name: 'Сброс пароля / Password reset',
    eyebrow_ru: 'Безопасность', eyebrow_en: 'Security',
    preheader_ru: 'Ссылка для нового пароля внутри', preheader_en: 'Your password reset link inside',
    subject_ru: 'Новый пароль Lumen — в один клик', subject_en: 'Your new Lumen password — one click away',
    body_ru: '<p>Здравствуйте!</p><p>Забыли пароль? С кем не бывает. Жмите кнопку — зададите новый за 10 секунд. Ссылка скоро протухнет, так что не тяните.</p><p>{{button}}</p><p style="color:#8b8983;font-size:13px">Не вы запрашивали? Спокойно — просто игнор, пароль остаётся прежним.</p>',
    body_en: '<p>Hi,</p><p>Forgot your password? Happens to the best. Hit the button — new one in 10 seconds. The link expires soon, so don’t sit on it.</p><p>{{button}}</p><p style="color:#8b8983;font-size:13px">Didn’t request it? Relax — ignore this, your password stays put.</p>',
  },
  passwordChanged: {
    name: 'Пароль изменён / Password changed',
    eyebrow_ru: 'Безопасность', eyebrow_en: 'Security',
    preheader_ru: 'Пароль вашего аккаунта Lumen обновлён', preheader_en: 'Your Lumen password was updated',
    subject_ru: 'Пароль Lumen изменён', subject_en: 'Your Lumen password was changed',
    body_ru: '<p>Здравствуйте, {{name}}!</p><p>Пароль вашего аккаунта <b>{{agency}}</b> был успешно изменён.</p>{{details}}<p style="color:#8b8983;font-size:13px">Это были не вы? Немедленно <a href="{{link}}" style="color:#141311;">восстановите доступ</a> и свяжитесь с нами.</p>',
    body_en: '<p>Hi {{name}},</p><p>The password for your <b>{{agency}}</b> account was changed successfully.</p>{{details}}<p style="color:#8b8983;font-size:13px">Wasn’t you? <a href="{{link}}" style="color:#141311;">Recover access</a> right away and contact us.</p>',
  },
  invite: {
    name: 'Приглашение в команду / Team invite',
    eyebrow_ru: 'Приглашение', eyebrow_en: 'Invitation',
    preheader_ru: '{{inviter}} зовёт вас в Lumen', preheader_en: '{{inviter}} invites you to Lumen',
    subject_ru: '{{inviter}} приглашает вас в {{agency}} — Lumen', subject_en: '{{inviter}} invited you to {{agency}} on Lumen',
    body_ru: '<p>Здравствуйте!</p><p><b>{{inviter}}</b> открывает вам доступ в <b>{{agency}}</b> на Lumen. Тут ИИ ловит и греет лидов, а вам достаётся самое приятное — закрывать сделки.</p><p>{{button}}</p><p style="color:#8b8983;font-size:13px">Придумаете пароль — и сразу внутри. Дело двух минут.</p>',
    body_en: '<p>Hi,</p><p><b>{{inviter}}</b> invites you to join <b>{{agency}}</b> on Lumen — where AI captures and nurtures leads while you close deals.</p><p>{{button}}</p><p style="color:#8b8983;font-size:13px">Accept the invite — set a password and you’re in.</p>',
  },
  teammateJoined: {
    name: 'Новый в команде / Teammate joined',
    eyebrow_ru: 'Команда', eyebrow_en: 'Team',
    subject_ru: '{{name}} присоединился к {{agency}}', subject_en: '{{name}} joined {{agency}}',
    body_ru: '<p>Здравствуйте!</p><p><b>{{name}}</b> принял приглашение и теперь в вашей команде <b>{{agency}}</b>. Роли и доступы можно настроить в разделе «Подключения → Роли и доступы».</p><p>{{button}}</p>',
    body_en: '<p>Hi,</p><p><b>{{name}}</b> accepted the invite and is now on your <b>{{agency}}</b> team. Manage roles and access under “Connections → Roles &amp; access”.</p><p>{{button}}</p>',
  },
  loginAlert: {
    name: 'Вход с нового устройства / New sign-in',
    eyebrow_ru: 'Безопасность', eyebrow_en: 'Security',
    preheader_ru: 'Замечен вход в ваш аккаунт Lumen', preheader_en: 'A new sign-in to your Lumen account',
    subject_ru: 'Новый вход в Lumen', subject_en: 'New sign-in to Lumen',
    body_ru: '<p>Здравствуйте, {{name}}!</p><p>Замечен вход в аккаунт <b>{{agency}}</b>. На всякий случай — детали ниже.</p>{{details}}<p style="color:#8b8983;font-size:13px">Это вы — отлично, дальше можно не читать. Если нет — быстро <a href="{{link}}" style="color:#141311;">смените пароль</a>, остальное прикроем.</p>',
    body_en: '<p>Hi {{name}},</p><p>We noticed a sign-in to your <b>{{agency}}</b> account.</p>{{details}}<p style="color:#8b8983;font-size:13px">Was you — nothing to do. If not — <a href="{{link}}" style="color:#141311;">change your password</a>.</p>',
  },
  paymentReceived: {
    name: 'Оплата получена / Payment received',
    eyebrow_ru: 'Оплата', eyebrow_en: 'Billing',
    preheader_ru: 'Спасибо, оплата Lumen получена', preheader_en: 'Thanks, your Lumen payment is in',
    subject_ru: 'Оплата получена — Lumen {{period}}', subject_en: 'Payment received — Lumen {{period}}',
    body_ru: '<p>Здравствуйте, {{name}}!</p><p>Спасибо! Оплата подписки Lumen для <b>{{agency}}</b> получена.</p>{{details}}<p>{{button}}</p>',
    body_en: '<p>Hi {{name}},</p><p>Thank you! Your Lumen subscription payment for <b>{{agency}}</b> is received.</p>{{details}}<p>{{button}}</p>',
  },
  paymentFailed: {
    name: 'Оплата не прошла / Payment failed',
    eyebrow_ru: 'Требуется действие', eyebrow_en: 'Action needed',
    preheader_ru: 'Не удалось списать оплату — обновите карту', preheader_en: 'We couldn’t charge your card — update it',
    subject_ru: 'Карта сказала «нет» — обновите её', subject_en: 'Your card said no — let’s fix it',
    body_ru: '<p>Здравствуйте, {{name}}!</p><p>Не удалось списать оплату подписки для <b>{{agency}}</b>. Чтобы не прерывать работу ИИ-отдела продаж, обновите платёжные данные.</p>{{details}}<p>{{button}}</p><p style="color:#8b8983;font-size:13px">Мы попробуем снова автоматически. Доступ сохраняется ещё несколько дней.</p>',
    body_en: '<p>Hi {{name}},</p><p>We couldn’t charge your subscription for <b>{{agency}}</b>. To keep your AI sales desk running, please update your payment details.</p>{{details}}<p>{{button}}</p><p style="color:#8b8983;font-size:13px">We’ll retry automatically. Access stays active for a few more days.</p>',
  },
  trialEnding: {
    name: 'Триал заканчивается / Trial ending',
    eyebrow_ru: 'Ранний доступ', eyebrow_en: 'Trial',
    preheader_ru: 'Осталось {{days}} дн. пробного периода', preheader_en: '{{days}} days left in your trial',
    subject_ru: 'Триал тает — осталось {{days}} дн.', subject_en: 'Trial’s melting — {{days}} days left',
    body_ru: '<p>Здравствуйте, {{name}}!</p><p>Пробный период <b>{{agency}}</b> заканчивается через <b>{{days}} дн.</b> Lumen уже наловил вам лидов и отвечал за секунды — обидно бросать на самом интересном.</p><p>{{button}}</p><p style="color:#8b8983;font-size:13px">Условия беты держим для первых агентств — потом будет дороже.</p>',
    body_en: '<p>Hi {{name}},</p><p>Your trial for <b>{{agency}}</b> ends in <b>{{days}} days</b>. Lumen has already been working for you — keep the momentum.</p><p>{{button}}</p><p style="color:#8b8983;font-size:13px">Beta terms are locked in for early agencies.</p>',
  },
  subscriptionRenewed: {
    name: 'Подписка продлена / Subscription renewed',
    eyebrow_ru: 'Подписка', eyebrow_en: 'Subscription',
    subject_ru: 'Подписка Lumen продлена — {{period}}', subject_en: 'Your Lumen subscription renewed — {{period}}',
    body_ru: '<p>Здравствуйте, {{name}}!</p><p>Подписка Lumen для <b>{{agency}}</b> продлена. Спасибо, что растёте вместе с нами.</p>{{details}}<p>{{button}}</p>',
    body_en: '<p>Hi {{name}},</p><p>Your Lumen subscription for <b>{{agency}}</b> has renewed. Thank you for growing with us.</p>{{details}}<p>{{button}}</p>',
  },
  notification: {
    name: 'Уведомление / Notification',
    subject_ru: 'Lumen: {{title}}', subject_en: 'Lumen: {{title}}',
    body_ru: '<p>Здравствуйте, {{name}}!</p><p>{{message}}</p><p>{{button}}</p>',
    body_en: '<p>Hi {{name}},</p><p>{{message}}</p><p>{{button}}</p>',
  },
  marketing: {
    name: 'Маркетинг / Marketing',
    subject_ru: '{{subject}}', subject_en: '{{subject}}',
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
  if (v.link && !v.button) v.button = emailButton(v.link, v.buttonLabel || (lang === 'en' ? 'Open Lumen' : 'Открыть Lumen'));
  const subject = interpolate(t['subject_' + lang] || t.subject_ru, v);
  const inner = interpolate(t['body_' + lang] || t.body_ru, v);
  const title = interpolate(v.title || subject, v);
  const opt = {
    eyebrow: interpolate(t['eyebrow_' + lang] || t.eyebrow_ru || '', v) || null,
    preheader: interpolate(t['preheader_' + lang] || t.preheader_ru || '', v) || null,
  };
  return { subject, html: emailWrap(esc(title), inner, lang, opt) };
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

module.exports = { emailWrap, emailButton, emailPanel, emailCode, emailDetails, DEFAULT_TEMPLATES, getTemplates, renderTemplate, interpolate, platformEmailCfg, sendViaResend };
