/* Почтовая инфраструктура SaaS — премиум Atelier-оформление (инлайн-стили + таблицы = требование почтовиков).
   НЕ один шаблон на всё: 5 архетипов вёрстки (ceremony / security / billing / team / digest), у каждого свой
   hero-визуал (арт Higgsfield, размещён на lumen247.com/emailart), свой строй контента (буллеты, инвойс-чек,
   аватар, бейдж-печать) и своя интонация. Шрифты — Cormorant Garamond (serif-заголовки) + Manrope (текст),
   как на лендинге. Билингва RU/EN. Шаблоны редактируются в админке (registry.emailTemplates). Отправка — Resend. */

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const C = { bg: '#efece5', card: '#fffdfa', ink: '#141311', ink2: '#57544e', ink3: '#8b8983', line: 'rgba(20,19,17,.10)', line2: 'rgba(20,19,17,.06)', gold: '#c9a86a', goldDeep: '#a9863f', panel: '#f5f1e9', panel2: '#faf7f0', ok: '#3f8f5b', danger: '#b4472e' };
const SERIF = "'Cormorant Garamond',Georgia,'Times New Roman',serif";
const SANS = "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const ART = 'https://lumen247.com/emailart';
const FONTS = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Manrope:wght@400;500;600;700&display=swap";

/* ─── строительные блоки ──────────────────────────────────────────────────── */

/* угольная CTA-кнопка (bulletproof для Outlook) */
function emailButton(url, label, opt) {
  const o = opt || {}; const bg = o.ghost ? 'transparent' : C.ink; const col = o.ghost ? C.ink : '#faf9f5';
  const bd = o.ghost ? `border:1px solid ${C.line};` : '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 6px 0;"><tr><td style="border-radius:12px;background:${bg};${bd}">
    <a href="${esc(url)}" style="display:inline-block;color:${col};text-decoration:none;font-weight:600;font-size:15px;font-family:${SANS};padding:15px 34px;border-radius:12px;letter-spacing:.01em;">${esc(label)}${o.ghost ? '' : ' &rarr;'}</a>
  </td></tr></table>`;
}

/* мягкая панель-выноска */
function emailPanel(html, accent) {
  const bd = accent ? C.gold : C.line;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;"><tr><td style="background:${C.panel};border:1px solid ${bd};border-radius:14px;padding:18px 22px;font-size:14px;line-height:1.6;color:${C.ink2};font-family:${SANS};">${html}</td></tr></table>`;
}

/* список «козырей» с золотыми звёздами-маркерами (ceremony) */
function emailBullets(items) {
  const rows = (items || []).map(it => `<tr>
    <td style="vertical-align:top;padding:7px 12px 7px 0;font-family:${SERIF};color:${C.gold};font-size:17px;line-height:1.35;">&#10022;</td>
    <td style="vertical-align:top;padding:7px 0;font-size:14.5px;line-height:1.5;color:${C.ink2};font-family:${SANS};">${it}</td>
  </tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 6px;background:${C.panel2};border:1px solid ${C.line};border-radius:14px;"><tr><td style="padding:10px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr></table>`;
}

/* крупный код подтверждения */
function emailCode(code) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;"><tr><td align="center" style="background:${C.panel};border:1px solid ${C.line};border-radius:14px;padding:22px;">
    <div style="font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:${C.ink3};font-family:${SANS};margin-bottom:9px;">Код подтверждения</div>
    <div style="font-family:${SERIF};font-size:38px;letter-spacing:.34em;color:${C.ink};font-weight:600;padding-left:.34em;">${esc(code)}</div>
  </td></tr></table>`;
}

/* таблица «поле — значение» (security / billing meta) */
function emailDetails(rows) {
  const body = (rows || []).map((r, i) => `<tr>
    <td style="padding:9px 0;font-size:13px;color:${C.ink3};white-space:nowrap;vertical-align:top;font-family:${SANS};${i ? 'border-top:1px solid ' + C.line2 + ';' : ''}">${esc(r[0])}</td>
    <td style="padding:9px 0 9px 18px;font-size:14px;color:${C.ink};text-align:right;font-weight:600;font-family:${SANS};${i ? 'border-top:1px solid ' + C.line2 + ';' : ''}">${esc(r[1])}</td>
  </tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:${C.panel};border:1px solid ${C.line};border-radius:14px;"><tr><td style="padding:6px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table></td></tr></table>`;
}

/* инвойс-чек: строки + золотая черта + жирный итог (billing) */
function emailInvoice(opt) {
  const o = opt || {}; const rows = (o.rows || []).map(r => `<tr>
    <td style="padding:8px 0;font-size:14px;color:${C.ink2};font-family:${SANS};">${esc(r[0])}</td>
    <td style="padding:8px 0;font-size:14px;color:${C.ink};text-align:right;font-weight:600;font-family:${SANS};">${esc(r[1])}</td>
  </tr>`).join('');
  const total = o.total ? `<tr><td colspan="2" style="padding:4px 0 0;"><div style="height:1px;background:${C.gold};opacity:.5;margin:6px 0;font-size:0;line-height:0;">&nbsp;</div></td></tr>
    <tr><td style="padding:6px 0;font-size:14px;color:${C.ink};font-family:${SANS};font-weight:600;">${esc(o.totalLabel || 'Итого')}</td>
    <td style="padding:6px 0;text-align:right;font-family:${SERIF};font-size:26px;color:${C.ink};font-weight:600;">${esc(o.total)}</td></tr>` : '';
  const head = o.title ? `<tr><td colspan="2" style="padding:2px 0 8px;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:${C.gold};font-family:${SANS};font-weight:700;border-bottom:1px solid ${C.line};">${esc(o.title)}</td></tr>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;background:${C.panel2};border:1px solid ${C.line};border-radius:14px;"><tr><td style="padding:14px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${head}${rows}${total}</table></td></tr></table>`;
}

/* аватар-чип: золотой кружок с инициалом + имя/подпись (team) */
function emailAvatar(name, sub) {
  const initial = esc(String(name || '?').trim().charAt(0).toUpperCase() || '?');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;background:${C.panel};border:1px solid ${C.line};border-radius:14px;"><tr><td style="padding:14px 18px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:middle;padding-right:14px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="46" height="46" align="center" valign="middle" style="width:46px;height:46px;background:linear-gradient(135deg,${C.gold},${C.goldDeep});border-radius:50%;color:#fff;font-family:${SERIF};font-size:22px;font-weight:600;">${initial}</td></tr></table></td>
    <td style="vertical-align:middle;"><div style="font-family:${SANS};font-size:15px;font-weight:700;color:${C.ink};">${esc(name || '')}</div><div style="font-family:${SANS};font-size:12.5px;color:${C.ink3};margin-top:2px;">${esc(sub || '')}</div></td>
  </tr></table></td></tr></table>`;
}

/* ─── hero-визуалы ────────────────────────────────────────────────────────── */
/* полоса-баннер во всю ширину карточки (ceremony / billing / team / digest) */
function heroBand(src, h) {
  h = h || 190;
  return `<tr><td style="padding:0;font-size:0;line-height:0;background:${C.panel};">
    <img src="${src}" width="540" height="${h}" alt="" style="display:block;width:100%;height:${h}px;max-height:${h}px;object-fit:cover;border:0;outline:none;">
  </td></tr>`;
}
/* компактный круглый бейдж по центру на креме (security) */
function heroBadge(src) {
  return `<tr><td align="center" style="padding:30px 44px 2px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="92" height="92" align="center" valign="middle" style="width:92px;height:92px;border-radius:50%;overflow:hidden;background:${C.panel};border:1px solid ${C.line};">
      <img src="${src}" width="92" height="92" alt="" style="display:block;width:92px;height:92px;object-fit:cover;border:0;border-radius:50%;">
    </td></tr></table>
  </td></tr>`;
}

/* ─── обёртка письма (chrome под каждый архетип) ──────────────────────────── */
function emailWrap(title, bodyHtml, lang, opt) {
  const en = lang === 'en';
  const o = opt || {};
  const pre = o.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.card};font-size:1px;line-height:1px;">${esc(o.preheader)}${'&#847;&zwnj;&nbsp;'.repeat(24)}</div>` : '';
  const eyebrow = o.eyebrow ? `<div style="font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:${C.gold};font-weight:700;margin:0 0 12px 0;font-family:${SANS};">${esc(o.eyebrow)}</div>` : '';
  const centered = o.badge ? 'center' : 'left';
  const titleAlign = o.badge ? 'text-align:center;' : '';
  const heroRow = o.hero ? heroBand(o.hero.src, o.hero.h) : (o.badge ? heroBadge(o.badge) : '');
  const titleSize = o.titleSize || 28;
  const wordmark = o.badge ? '' : `<tr><td style="padding:30px 44px 0 44px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="font-family:${SERIF};font-size:21px;color:${C.gold};padding-right:9px;line-height:1;">&#10022;</td>
        <td style="font-family:${SERIF};font-size:22px;letter-spacing:.22em;color:${C.ink};line-height:1;">LUMEN</td>
      </tr></table>
      <div style="font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:${C.ink3};margin-top:6px;font-family:${SANS};">${en ? 'Real estate AI-CRM' : 'AI-CRM для недвижимости'}</div>
    </td></tr>`;
  const smallWordmark = o.badge ? `<tr><td align="center" style="padding:14px 44px 0;"><span style="font-family:${SERIF};font-size:16px;letter-spacing:.22em;color:${C.ink3};">&#10022;&nbsp;LUMEN</span></td></tr>` : '';
  return `<!doctype html><html lang="${en ? 'en' : 'ru'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="${FONTS}" rel="stylesheet">
<style>@import url('${FONTS}');@media (max-width:560px){.cardpad{padding-left:26px!important;padding-right:26px!important}.hband{height:auto!important;max-height:none!important}}</style></head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-font-smoothing:antialiased;">${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};font-family:${SANS};">
 <tr><td align="center" style="padding:36px 16px;">
  <table role="presentation" width="548" cellpadding="0" cellspacing="0" style="max-width:548px;width:100%;background:${C.card};border:1px solid ${C.line};border-radius:20px;overflow:hidden;box-shadow:0 30px 60px -34px rgba(20,19,17,.30);">
    <tr><td style="height:3px;background:linear-gradient(90deg,${C.gold},#e8d9b6 52%,${C.gold});font-size:0;line-height:0;">&nbsp;</td></tr>
    ${heroRow}
    ${wordmark}${smallWordmark}
    <tr><td class="cardpad" style="padding:26px 44px 6px 44px;${titleAlign}">
      ${eyebrow}
      <h1 style="font-family:${SERIF};font-weight:600;font-size:${titleSize}px;line-height:1.18;color:${C.ink};margin:0 0 16px 0;letter-spacing:-.005em;">${title}</h1>
      <div style="font-size:15px;line-height:1.7;color:${C.ink2};font-family:${SANS};text-align:left;">${bodyHtml}</div>
    </td></tr>
    <tr><td class="cardpad" style="padding:22px 44px 34px 44px;">
      <div style="border-top:1px solid ${C.line};padding-top:18px;font-size:12px;line-height:1.65;color:${C.ink3};font-family:${SANS};">
        ${o.footerNote || (en ? 'You received this email because you use Lumen. Not you? Just ignore it.' : 'Вы получили это письмо, потому что пользуетесь Lumen. Не вы — просто проигнорируйте.')}
        <div style="margin-top:12px;">
          <a href="https://lumen247.com/privacy.html" style="color:${C.ink3};text-decoration:underline;">${en ? 'Privacy' : 'Конфиденциальность'}</a>
          &nbsp;·&nbsp;<a href="https://lumen247.com/terms.html" style="color:${C.ink3};text-decoration:underline;">${en ? 'Terms' : 'Условия'}</a>
          &nbsp;·&nbsp;<a href="https://lumen247.com" style="color:${C.ink3};text-decoration:underline;">lumen247.com</a>
        </div>
      </div>
    </td></tr>
  </table>
  <div style="font-size:11px;color:#a8a6a0;margin-top:18px;font-family:${SANS};letter-spacing:.02em;">&#10022;&nbsp; © 2026 Lumen · TargetPoint AY · Antwerpen</div>
 </td></tr>
</table></body></html>`;
}

/* ─── шаблоны: у каждого архетип, hero-визуал и структура ─────────────────── */
/* поля: subject_ru/en, body_ru/en, eyebrow_*, preheader_*, hero (файл в /emailart) | badge (security),
   heroH (высота полосы), titleSize. body поддерживает токены {{button}} {{panel}} {{details}} {{code}}
   {{invoice}} {{bullets}} {{avatar}} — renderTemplate подставит либо переданное в vars, либо дефолт. */
const DEFAULT_TEMPLATES = {
  /* ── CEREMONY ── */
  verifyEmail: {
    name: 'Подтверждение e-mail / Verify email', arch: 'ceremony', hero: 'hero.jpg', heroH: 168,
    eyebrow_ru: 'Один клик до старта', eyebrow_en: 'One click to launch',
    preheader_ru: 'Подтвердите адрес — и Lumen начнёт ловить лидов', preheader_en: 'Confirm your email and Lumen starts catching leads',
    subject_ru: 'Один клик — и Lumen начнёт ловить лидов', subject_en: 'One click and Lumen starts catching leads',
    body_ru: '<p>Здравствуйте, {{name}}!</p><p>Остался один клик. Подтвердите <b>{{email}}</b> — и аккаунт <b>{{agency}}</b> оживёт: ИИ начнёт отвечать вашим лидам за 60 секунд, пока конкуренты ещё думают.</p>{{button}}{{panel}}',
    body_en: '<p>Hi {{name}},</p><p>One click left. Confirm <b>{{email}}</b> and your <b>{{agency}}</b> account comes alive — AI starts replying to your leads in 60 seconds while competitors are still thinking.</p>{{button}}{{panel}}',
    panel_ru: 'Ссылка живёт недолго. Не вы создавали аккаунт? Тогда письмо можно смело удалить — ничего не произойдёт.',
    panel_en: 'The link is short-lived. Didn’t create an account? Just delete this — nothing happens.',
  },
  welcome: {
    name: 'Приветствие / Welcome', arch: 'ceremony', hero: 'hero.gif', heroH: 196, titleSize: 30,
    eyebrow_ru: 'Добро пожаловать', eyebrow_en: 'Welcome',
    preheader_ru: 'Ваш ИИ-отдел продаж уже ловит лидов', preheader_en: 'Your AI sales desk is already capturing leads',
    subject_ru: 'Вы в Lumen, {{name}}. Теперь лиды не убегут', subject_en: 'You’re in, {{name}}. Leads don’t get away now',
    body_ru: '<p>Здравствуйте, {{name}}!</p><p>Готово. Пока вы читаете это письмо, <b>{{agency}}</b> уже под Lumen — и это меняет расстановку сил:</p>{{bullets}}{{button}}<p style="margin-top:18px">Застряли на старте? Ответьте на письмо — мы живые люди и поможем настроить.</p>',
    body_en: '<p>Hi {{name}},</p><p>Done. While you read this, <b>{{agency}}</b> is already on Lumen — and that changes the game:</p>{{bullets}}{{button}}<p style="margin-top:18px">Stuck on setup? Reply to this email — real humans, we’ll help.</p>',
    bullets_ru: ['Заявка приходит — ИИ отвечает за 60 секунд, а не «перезвоню завтра».', 'Каждый лид квалифицирован и разложен по стадиям — без ручной рутины.', 'Ни выходных, ни ночей: воронка греется, пока вы спите.'],
    bullets_en: ['A lead comes in — AI replies in 60 seconds, not “I’ll call tomorrow”.', 'Every lead qualified and sorted by stage — no manual busywork.', 'No weekends, no nights off: the funnel stays warm while you sleep.'],
  },
  /* ── SECURITY ── */
  passwordReset: {
    name: 'Сброс пароля / Password reset', arch: 'security', badge: 'key.jpg', titleSize: 25,
    eyebrow_ru: 'Безопасность', eyebrow_en: 'Security',
    preheader_ru: 'Ссылка для нового пароля внутри', preheader_en: 'Your password reset link inside',
    subject_ru: 'Новый пароль Lumen — в один клик', subject_en: 'Your new Lumen password — one click away',
    body_ru: '<p>Забыли пароль? С кем не бывает. Жмите кнопку — зададите новый за десять секунд. Ссылка скоро протухнет, так что не тяните.</p>{{button}}{{panel}}',
    body_en: '<p>Forgot your password? Happens to the best. Hit the button — new one in ten seconds. The link expires soon, so don’t sit on it.</p>{{button}}{{panel}}',
    panel_ru: 'Не вы запрашивали сброс? Спокойно — просто проигнорируйте письмо, пароль останется прежним.',
    panel_en: 'Didn’t request this? Relax — ignore the email, your password stays as it is.',
  },
  passwordChanged: {
    name: 'Пароль изменён / Password changed', arch: 'security', badge: 'key.jpg', titleSize: 25,
    eyebrow_ru: 'Безопасность', eyebrow_en: 'Security',
    preheader_ru: 'Пароль вашего аккаунта Lumen обновлён', preheader_en: 'Your Lumen password was updated',
    subject_ru: 'Пароль Lumen изменён', subject_en: 'Your Lumen password was changed',
    body_ru: '<p>Здравствуйте, {{name}}! Пароль аккаунта <b>{{agency}}</b> успешно изменён — фиксируем для истории:</p>{{details}}<p style="color:#8b8983;font-size:13px;margin-top:4px">Это были не вы? <a href="{{link}}" style="color:#141311;font-weight:600">Восстановите доступ</a> немедленно и напишите нам.</p>',
    body_en: '<p>Hi {{name}}, the password for your <b>{{agency}}</b> account was changed — logging it for the record:</p>{{details}}<p style="color:#8b8983;font-size:13px;margin-top:4px">Wasn’t you? <a href="{{link}}" style="color:#141311;font-weight:600">Recover access</a> right away and contact us.</p>',
  },
  loginAlert: {
    name: 'Вход с нового устройства / New sign-in', arch: 'security', badge: 'key.jpg', titleSize: 25,
    eyebrow_ru: 'Безопасность', eyebrow_en: 'Security',
    preheader_ru: 'Замечен вход в ваш аккаунт Lumen', preheader_en: 'A new sign-in to your Lumen account',
    subject_ru: 'Новый вход в Lumen', subject_en: 'New sign-in to Lumen',
    body_ru: '<p>Здравствуйте, {{name}}! Заметили вход в аккаунт <b>{{agency}}</b>. На всякий случай — детали:</p>{{details}}<p style="color:#8b8983;font-size:13px;margin-top:4px">Это вы — отлично, дальше можно не читать. Если нет — быстро <a href="{{link}}" style="color:#141311;font-weight:600">смените пароль</a>, остальное прикроем.</p>',
    body_en: '<p>Hi {{name}}, we noticed a sign-in to your <b>{{agency}}</b> account. Just in case — the details:</p>{{details}}<p style="color:#8b8983;font-size:13px;margin-top:4px">Was you — nothing to do. If not — <a href="{{link}}" style="color:#141311;font-weight:600">change your password</a>.</p>',
  },
  /* ── TEAM ── */
  invite: {
    name: 'Приглашение в команду / Team invite', arch: 'team', hero: 'rings.jpg', heroH: 150,
    eyebrow_ru: 'Приглашение', eyebrow_en: 'Invitation',
    preheader_ru: '{{inviter}} зовёт вас в Lumen', preheader_en: '{{inviter}} invites you to Lumen',
    subject_ru: '{{inviter}} зовёт вас в {{agency}} — Lumen', subject_en: '{{inviter}} invited you to {{agency}} on Lumen',
    body_ru: '<p>Здравствуйте!</p>{{avatar}}<p><b>{{inviter}}</b> открывает вам доступ в <b>{{agency}}</b> на Lumen. Тут ИИ ловит и греет лидов, а вам достаётся самое приятное — закрывать сделки.</p>{{button}}<p style="color:#8b8983;font-size:13px;margin-top:16px">Придумаете пароль — и сразу внутри. Дело двух минут.</p>',
    body_en: '<p>Hi!</p>{{avatar}}<p><b>{{inviter}}</b> is giving you access to <b>{{agency}}</b> on Lumen — where AI captures and nurtures leads while you close deals.</p>{{button}}<p style="color:#8b8983;font-size:13px;margin-top:16px">Set a password and you’re in. Takes two minutes.</p>',
  },
  teammateJoined: {
    name: 'Новый в команде / Teammate joined', arch: 'team', hero: 'rings.jpg', heroH: 132,
    eyebrow_ru: 'Команда', eyebrow_en: 'Team',
    preheader_ru: 'В {{agency}} новый человек', preheader_en: 'A new member joined {{agency}}',
    subject_ru: '{{name}} теперь в команде {{agency}}', subject_en: '{{name}} joined {{agency}}',
    body_ru: '<p>Здравствуйте!</p>{{avatar}}<p><b>{{name}}</b> принял приглашение и теперь в вашей команде <b>{{agency}}</b>. Роли и доступы можно настроить в разделе «Подключения → Роли и доступы».</p>{{button}}',
    body_en: '<p>Hi!</p>{{avatar}}<p><b>{{name}}</b> accepted the invite and is now on your <b>{{agency}}</b> team. Manage roles and access under “Connections → Roles &amp; access”.</p>{{button}}',
  },
  /* ── BILLING ── */
  paymentReceived: {
    name: 'Оплата получена / Payment received', arch: 'billing', hero: 'seal.jpg', heroH: 132,
    eyebrow_ru: 'Оплата', eyebrow_en: 'Billing',
    preheader_ru: 'Спасибо, оплата Lumen получена', preheader_en: 'Thanks, your Lumen payment is in',
    subject_ru: 'Оплата получена — Lumen {{period}}', subject_en: 'Payment received — Lumen {{period}}',
    body_ru: '<p>Здравствуйте, {{name}}! Спасибо — оплата подписки Lumen для <b>{{agency}}</b> получена и скреплена печатью.</p>{{invoice}}{{button}}',
    body_en: '<p>Hi {{name}}, thank you — your Lumen subscription payment for <b>{{agency}}</b> is received and sealed.</p>{{invoice}}{{button}}',
  },
  paymentFailed: {
    name: 'Оплата не прошла / Payment failed', arch: 'billing', hero: 'coin.jpg', heroH: 132,
    eyebrow_ru: 'Требуется действие', eyebrow_en: 'Action needed',
    preheader_ru: 'Не удалось списать оплату — обновите карту', preheader_en: 'We couldn’t charge your card — update it',
    subject_ru: 'Карта сказала «нет» — обновите её', subject_en: 'Your card said no — let’s fix it',
    body_ru: '<p>Здравствуйте, {{name}}! Не удалось списать оплату для <b>{{agency}}</b>. Чтобы ИИ-отдел продаж не останавливался ни на секунду — обновите платёжные данные.</p>{{invoice}}{{button}}{{panel}}',
    body_en: '<p>Hi {{name}}, we couldn’t charge the subscription for <b>{{agency}}</b>. To keep your AI sales desk running non-stop — update your payment details.</p>{{invoice}}{{button}}{{panel}}',
    panel_ru: 'Мы попробуем списать снова автоматически. Доступ сохраняется ещё несколько дней — паниковать не о чем.',
    panel_en: 'We’ll retry automatically. Access stays active for a few more days — nothing to panic about.',
  },
  subscriptionRenewed: {
    name: 'Подписка продлена / Subscription renewed', arch: 'billing', hero: 'seal.jpg', heroH: 132,
    eyebrow_ru: 'Подписка', eyebrow_en: 'Subscription',
    preheader_ru: 'Подписка Lumen продлена', preheader_en: 'Your Lumen subscription renewed',
    subject_ru: 'Подписка Lumen продлена — {{period}}', subject_en: 'Your Lumen subscription renewed — {{period}}',
    body_ru: '<p>Здравствуйте, {{name}}! Подписка Lumen для <b>{{agency}}</b> продлена. Спасибо, что растёте вместе с нами — мы это ценим.</p>{{invoice}}{{button}}',
    body_en: '<p>Hi {{name}}, your Lumen subscription for <b>{{agency}}</b> has renewed. Thank you for growing with us — it means a lot.</p>{{invoice}}{{button}}',
  },
  /* ── DIGEST ── */
  trialEnding: {
    name: 'Триал заканчивается / Trial ending', arch: 'digest', hero: 'hourglass.jpg', heroH: 168,
    eyebrow_ru: 'Ранний доступ', eyebrow_en: 'Early access',
    preheader_ru: 'Осталось {{days}} дн. пробного периода', preheader_en: '{{days}} days left in your trial',
    subject_ru: 'Триал тает — осталось {{days}} дн.', subject_en: 'Trial’s melting — {{days}} days left',
    body_ru: '<p>Здравствуйте, {{name}}! Пробный период <b>{{agency}}</b> заканчивается через <b>{{days}} дн.</b> Lumen уже наловил вам лидов и отвечал за секунды — обидно бросать на самом интересном.</p>{{button}}{{panel}}',
    body_en: '<p>Hi {{name}}, your trial for <b>{{agency}}</b> ends in <b>{{days}} days</b>. Lumen has already been catching leads and replying in seconds — a shame to stop at the best part.</p>{{button}}{{panel}}',
    panel_ru: 'Условия беты закреплены за первыми агентствами — позже подписка будет дороже. Успеваете зафиксировать.',
    panel_en: 'Beta terms are locked in for the first agencies — the subscription gets pricier later. You can still lock yours.',
  },
  notification: {
    name: 'Уведомление / Notification', arch: 'digest', hero: 'arcs.jpg', heroH: 140,
    subject_ru: 'Lumen: {{title}}', subject_en: 'Lumen: {{title}}',
    body_ru: '<p>Здравствуйте, {{name}}!</p><p>{{message}}</p>{{button}}',
    body_en: '<p>Hi {{name}},</p><p>{{message}}</p>{{button}}',
  },
  marketing: {
    name: 'Маркетинг / Marketing', arch: 'digest', hero: 'arcs.gif', heroH: 180, titleSize: 29,
    subject_ru: '{{subject}}', subject_en: '{{subject}}',
    body_ru: '<p>Здравствуйте, {{name}}!</p><p>{{message}}</p>{{button}}<p style="color:#8b8983;font-size:12px;margin-top:18px">Не хотите получать такие письма? <a href="{{unsubscribe}}" style="color:#8b8983;text-decoration:underline">Отписаться</a>.</p>',
    body_en: '<p>Hi {{name}},</p><p>{{message}}</p>{{button}}<p style="color:#8b8983;font-size:12px;margin-top:18px">Don’t want these emails? <a href="{{unsubscribe}}" style="color:#8b8983;text-decoration:underline">Unsubscribe</a>.</p>',
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

/* собрать готовое письмо: {subject, html}. Токены {{...}} тянутся из vars, иначе — из дефолтов шаблона. */
function renderTemplate(registry, key, vars, lang) {
  const t = getTemplates(registry)[key] || DEFAULT_TEMPLATES.notification;
  lang = lang === 'en' ? 'en' : 'ru';
  const en = lang === 'en';
  const v = Object.assign({}, vars);

  /* авто-компоненты (если caller не передал явно) */
  if (v.button == null && v.link) v.button = emailButton(v.link, v.buttonLabel || (en ? 'Open Lumen' : 'Открыть Lumen'), { ghost: !!v.buttonGhost });
  if (v.button == null) v.button = '';
  if (v.panel == null) { const p = t['panel_' + lang] || t.panel_ru; v.panel = p ? emailPanel(esc(p)) : ''; }
  if (v.bullets == null) { const b = t['bullets_' + lang] || t.bullets_ru; v.bullets = Array.isArray(b) ? emailBullets(b.map(esc)) : ''; }
  if (v.details == null) {
    if (v.detailRows) v.details = emailDetails(v.detailRows);
    else if (t.arch === 'security') v.details = emailDetails([[en ? 'Time' : 'Время', v.time || new Date().toLocaleString(en ? 'en-GB' : 'ru-RU')], [en ? 'Device' : 'Устройство', v.device || (en ? 'Browser · Chrome' : 'Браузер · Chrome')], [en ? 'Location' : 'Локация', v.location || '—'], ['IP', v.ip || '—']]);
    else v.details = '';
  }
  if (v.code == null) v.code = v.otp ? emailCode(v.otp) : '';
  if (v.invoice == null) {
    if (v.invoiceRows || t.arch === 'billing') {
      v.invoice = emailInvoice({
        title: en ? 'Invoice' : 'Счёт',
        rows: v.invoiceRows || [[(en ? 'Plan' : 'Тариф'), v.plan || 'Lumen Pro'], [(en ? 'Period' : 'Период'), v.period || (en ? 'monthly' : 'месяц')], [(en ? 'Agency' : 'Агентство'), v.agency || '—']],
        totalLabel: en ? 'Total' : 'Итого', total: v.amount || '€99',
      });
    } else v.invoice = '';
  }
  if (v.avatar == null) { v.avatar = (t.arch === 'team') ? emailAvatar(v.inviter || v.name || 'Lumen', en ? 'invites you to the team' : 'приглашает в команду') : ''; }

  const subject = interpolate(t['subject_' + lang] || t.subject_ru, v);
  const inner = interpolate(t['body_' + lang] || t.body_ru, v);
  const title = interpolate(v.title || subject, v);
  const opt = {
    eyebrow: interpolate(t['eyebrow_' + lang] || t.eyebrow_ru || '', v) || null,
    preheader: interpolate(t['preheader_' + lang] || t.preheader_ru || '', v) || null,
    hero: t.hero ? { src: (t.hero.indexOf('://') > -1 ? t.hero : ART + '/' + t.hero), h: t.heroH || 190 } : null,
    badge: t.badge ? (t.badge.indexOf('://') > -1 ? t.badge : ART + '/' + t.badge) : null,
    titleSize: t.titleSize || null,
  };
  return { subject, html: emailWrap(esc(title), inner, lang, opt) };
}

/* платформенная конфигурация Resend */
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

module.exports = { emailWrap, emailButton, emailPanel, emailBullets, emailCode, emailDetails, emailInvoice, emailAvatar, DEFAULT_TEMPLATES, getTemplates, renderTemplate, interpolate, platformEmailCfg, sendViaResend, ART, C };
