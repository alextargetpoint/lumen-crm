/* Почтовая инфраструктура SaaS Lumen.
   • Оформление — премиум-Ателье (инлайн-стили + таблицы = требование почтовиков), шрифты Cormorant + Manrope.
   • НЕ один шаблон на всё: форматы вёрстки — ceremony / security / billing / team / digest (тёмная обложка на
     кремовом теле) + dark (письмо целиком тёмное) + plain (без обложки, письмо-записка) + stat (крупные KPI).
   • Обложки — тёмный SaaS-арт Higgsfield (public/emailart), 2 живых GIF.
   • Каждый шаблон несёт метаданные: category / audience / essential — это backbone подписок: владелец в админке
     и брокер в аккаунте выбирают, какие письма получать (essential — транзакционно-обязательные, отписки нет).
   • Билингва RU/EN, редактируются в админке (registry.emailTemplates). Отправка — Resend. */

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* палитры: светлая (крем-Ателье) и тёмная (near-black) */
const C = { bg: '#efece5', card: '#fffdfa', ink: '#141311', ink2: '#57544e', ink3: '#8b8983', line: 'rgba(20,19,17,.10)', line2: 'rgba(20,19,17,.06)', gold: '#c9a86a', goldDeep: '#a9863f', panel: '#f5f1e9', panel2: '#faf7f0', ok: '#3f8f5b', danger: '#b4472e', btnBg: '#141311', btnInk: '#faf9f5', dark: false };
const D = { bg: '#0c0b09', card: '#151310', ink: '#f4f1ea', ink2: '#c7c1b4', ink3: '#8f8b80', line: 'rgba(255,255,255,.13)', line2: 'rgba(255,255,255,.07)', gold: '#d8bd86', goldDeep: '#c9a86a', panel: '#1d1a15', panel2: '#191611', ok: '#5cc48c', danger: '#e08a72', btnBg: '#efe7d5', btnInk: '#151310', dark: true };
const pal = (theme) => theme === 'dark' ? D : C;

const SERIF = "'Cormorant Garamond',Georgia,'Times New Roman',serif";
const SANS = "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
/* арт писем раздаёт сам CRM из public/emailart — базовый URL = домен приложения; на Railway пиним PUBLIC_BASE_URL. */
const ART = (process.env.EMAIL_ART_BASE || process.env.PUBLIC_BASE_URL || 'https://app.lumen247.com').replace(/\/$/, '') + '/emailart';
const FONTS = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Manrope:wght@400;500;600;700&display=swap";

/* ─── строительные блоки (все принимают тему T = pal('light'|'dark')) ─────── */

function emailButton(url, label, opt) {
  const o = opt || {}; const T = o.T || C;
  const bg = o.ghost ? 'transparent' : T.btnBg; const col = o.ghost ? T.ink : T.btnInk;
  const bd = o.ghost ? `border:1px solid ${T.line};` : '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 6px 0;"><tr><td style="border-radius:12px;background:${bg};${bd}">
    <a href="${esc(url)}" style="display:inline-block;color:${col};text-decoration:none;font-weight:600;font-size:15px;font-family:${SANS};padding:15px 34px;border-radius:12px;letter-spacing:.01em;">${esc(label)}${o.ghost ? '' : ' &rarr;'}</a>
  </td></tr></table>`;
}

function emailPanel(html, accent, T) {
  T = T || C; const bd = accent ? T.gold : T.line;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;"><tr><td style="background:${T.panel};border:1px solid ${bd};border-radius:14px;padding:18px 22px;font-size:14px;line-height:1.6;color:${T.ink2};font-family:${SANS};">${html}</td></tr></table>`;
}

function emailBullets(items, T) {
  T = T || C;
  const rows = (items || []).map(it => `<tr>
    <td style="vertical-align:top;padding:7px 12px 7px 0;font-family:${SERIF};color:${T.gold};font-size:17px;line-height:1.35;">&#10022;</td>
    <td style="vertical-align:top;padding:7px 0;font-size:14.5px;line-height:1.5;color:${T.ink2};font-family:${SANS};">${it}</td>
  </tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 6px;background:${T.panel2};border:1px solid ${T.line};border-radius:14px;"><tr><td style="padding:10px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr></table>`;
}

function emailCode(code, T) {
  T = T || C;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;"><tr><td align="center" style="background:${T.panel};border:1px solid ${T.line};border-radius:14px;padding:22px;">
    <div style="font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:${T.ink3};font-family:${SANS};margin-bottom:9px;">Код подтверждения</div>
    <div style="font-family:${SERIF};font-size:38px;letter-spacing:.34em;color:${T.ink};font-weight:600;padding-left:.34em;">${esc(code)}</div>
  </td></tr></table>`;
}

function emailDetails(rows, T) {
  T = T || C;
  const body = (rows || []).map((r, i) => `<tr>
    <td style="padding:9px 0;font-size:13px;color:${T.ink3};white-space:nowrap;vertical-align:top;font-family:${SANS};${i ? 'border-top:1px solid ' + T.line2 + ';' : ''}">${esc(r[0])}</td>
    <td style="padding:9px 0 9px 18px;font-size:14px;color:${T.ink};text-align:right;font-weight:600;font-family:${SANS};${i ? 'border-top:1px solid ' + T.line2 + ';' : ''}">${esc(r[1])}</td>
  </tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:${T.panel};border:1px solid ${T.line};border-radius:14px;"><tr><td style="padding:6px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table></td></tr></table>`;
}

function emailInvoice(opt) {
  const o = opt || {}; const T = o.T || C;
  const rows = (o.rows || []).map(r => `<tr>
    <td style="padding:8px 0;font-size:14px;color:${T.ink2};font-family:${SANS};">${esc(r[0])}</td>
    <td style="padding:8px 0;font-size:14px;color:${T.ink};text-align:right;font-weight:600;font-family:${SANS};">${esc(r[1])}</td>
  </tr>`).join('');
  const total = o.total ? `<tr><td colspan="2" style="padding:4px 0 0;"><div style="height:1px;background:${T.gold};opacity:.5;margin:6px 0;font-size:0;line-height:0;">&nbsp;</div></td></tr>
    <tr><td style="padding:6px 0;font-size:14px;color:${T.ink};font-family:${SANS};font-weight:600;">${esc(o.totalLabel || 'Итого')}</td>
    <td style="padding:6px 0;text-align:right;font-family:${SERIF};font-size:26px;color:${T.ink};font-weight:600;">${esc(o.total)}</td></tr>` : '';
  const head = o.title ? `<tr><td colspan="2" style="padding:2px 0 8px;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:${T.gold};font-family:${SANS};font-weight:700;border-bottom:1px solid ${T.line};">${esc(o.title)}</td></tr>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;background:${T.panel2};border:1px solid ${T.line};border-radius:14px;"><tr><td style="padding:14px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${head}${rows}${total}</table></td></tr></table>`;
}

function emailAvatar(name, sub, T) {
  T = T || C;
  const initial = esc(String(name || '?').trim().charAt(0).toUpperCase() || '?');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;background:${T.panel};border:1px solid ${T.line};border-radius:14px;"><tr><td style="padding:14px 18px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:middle;padding-right:14px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="46" height="46" align="center" valign="middle" style="width:46px;height:46px;background:linear-gradient(135deg,${T.gold},${T.goldDeep});border-radius:50%;color:#fff;font-family:${SERIF};font-size:22px;font-weight:600;">${initial}</td></tr></table></td>
    <td style="vertical-align:middle;"><div style="font-family:${SANS};font-size:15px;font-weight:700;color:${T.ink};">${esc(name || '')}</div><div style="font-family:${SANS};font-size:12.5px;color:${T.ink3};margin-top:2px;">${esc(sub || '')}</div></td>
  </tr></table></td></tr></table>`;
}

/* сетка крупных KPI (формат stat / отчёты): [{n:'3',label:'новых лида'},...] — до 3 в ряд */
function emailStatGrid(stats, T) {
  T = T || C;
  const arr = (stats || []).slice(0, 3);
  const w = Math.floor(100 / (arr.length || 1));
  const cells = arr.map((s, i) => `<td width="${w}%" style="padding:0 ${i ? '6' : '0'}px 0 ${i ? '6' : '0'}px;vertical-align:top;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${T.panel2};border:1px solid ${T.line};border-radius:14px;"><tr><td align="center" style="padding:18px 10px;">
      <div style="font-family:${SERIF};font-size:40px;font-weight:600;color:${T.ink};line-height:1;">${esc(s.n)}</div>
      <div style="font-family:${SANS};font-size:12px;color:${T.ink3};margin-top:7px;letter-spacing:.02em;">${esc(s.label)}</div>
    </td></tr></table></td>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;"><tr>${cells}</tr></table>`;
}

/* карточка лида (leads): имя + источник + статус-пилюля + бюджет */
function emailLeadCard(opt, T) {
  const o = opt || {}; T = T || C;
  const pill = o.status ? `<span style="display:inline-block;font-family:${SANS};font-size:11px;font-weight:700;color:${T.goldDeep};background:${T.dark ? 'rgba(216,189,134,.14)' : 'rgba(201,168,106,.16)'};border:1px solid ${T.line};border-radius:999px;padding:4px 11px;">${esc(o.status)}</span>` : '';
  const rows = (o.rows || []).map(r => `<tr><td style="padding:4px 0;font-size:13px;color:${T.ink3};font-family:${SANS};">${esc(r[0])}</td><td style="padding:4px 0;font-size:13.5px;color:${T.ink};text-align:right;font-weight:600;font-family:${SANS};">${esc(r[1])}</td></tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;background:${T.panel2};border:1px solid ${T.line};border-radius:16px;"><tr><td style="padding:18px 22px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle;"><div style="font-family:${SERIF};font-size:22px;font-weight:600;color:${T.ink};line-height:1.1;">${esc(o.name || 'Новый лид')}</div></td>
      <td style="vertical-align:middle;text-align:right;">${pill}</td>
    </tr></table>
    ${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;border-top:1px solid ${T.line2};padding-top:6px;">${rows}</table>` : ''}
  </td></tr></table>`;
}

/* ─── hero-визуалы ────────────────────────────────────────────────────────── */
function heroBand(src, h, T) {
  h = h || 190; T = T || C;
  return `<tr><td style="padding:0;font-size:0;line-height:0;background:${T.panel};">
    <img src="${src}" width="548" height="${h}" alt="" class="hband" style="display:block;width:100%;height:${h}px;max-height:${h}px;object-fit:cover;border:0;outline:none;">
  </td></tr>`;
}
function heroBadge(src, T) {
  T = T || C;
  return `<tr><td align="center" style="padding:30px 44px 2px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="92" height="92" align="center" valign="middle" style="width:92px;height:92px;border-radius:50%;overflow:hidden;background:${T.panel};border:1px solid ${T.line};">
      <img src="${src}" width="92" height="92" alt="" style="display:block;width:92px;height:92px;object-fit:cover;border:0;border-radius:50%;">
    </td></tr></table>
  </td></tr>`;
}

/* ─── обёртка письма ──────────────────────────────────────────────────────── */
function emailWrap(title, bodyHtml, lang, opt) {
  const en = lang === 'en';
  const o = opt || {};
  const T = o.theme === 'dark' ? D : C;
  const pre = o.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${T.card};font-size:1px;line-height:1px;">${esc(o.preheader)}${'&#847;&zwnj;&nbsp;'.repeat(24)}</div>` : '';
  const eyebrow = o.eyebrow ? `<div style="font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:${T.gold};font-weight:700;margin:0 0 12px 0;font-family:${SANS};">${esc(o.eyebrow)}</div>` : '';
  const titleAlign = o.badge ? 'text-align:center;' : '';
  const heroRow = o.hero ? heroBand(o.hero.src, o.hero.h, T) : (o.badge ? heroBadge(o.badge, T) : '');
  const titleSize = o.titleSize || 28;
  const wordmark = o.badge ? '' : `<tr><td style="padding:${o.hero ? '30' : '34'}px 44px 0 44px;${o.plain ? 'text-align:center;' : ''}">
      <table role="presentation" cellpadding="0" cellspacing="0" ${o.plain ? 'align="center"' : ''}><tr>
        <td style="font-family:${SERIF};font-size:21px;color:${T.gold};padding-right:9px;line-height:1;">&#10022;</td>
        <td style="font-family:${SERIF};font-size:22px;letter-spacing:.22em;color:${T.ink};line-height:1;">LUMEN</td>
      </tr></table>
      <div style="font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:${T.ink3};margin-top:6px;font-family:${SANS};">${en ? 'Real estate AI-CRM' : 'AI-CRM для недвижимости'}</div>
    </td></tr>`;
  const smallWordmark = o.badge ? `<tr><td align="center" style="padding:14px 44px 0;"><span style="font-family:${SERIF};font-size:16px;letter-spacing:.22em;color:${T.ink3};">&#10022;&nbsp;LUMEN</span></td></tr>` : '';
  const divider = o.plain ? `<tr><td align="center" style="padding:16px 44px 0;"><span style="font-family:${SERIF};font-size:18px;color:${T.gold};">&#10022;</span></td></tr>` : '';
  return `<!doctype html><html lang="${en ? 'en' : 'ru'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="${FONTS}" rel="stylesheet">
<style>@import url('${FONTS}');@media (max-width:560px){.cardpad{padding-left:26px!important;padding-right:26px!important}.hband{height:auto!important;max-height:none!important}}</style></head>
<body style="margin:0;padding:0;background:${T.bg};-webkit-font-smoothing:antialiased;">${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${T.bg};font-family:${SANS};">
 <tr><td align="center" style="padding:36px 16px;">
  <table role="presentation" width="548" cellpadding="0" cellspacing="0" style="max-width:548px;width:100%;background:${T.card};border:1px solid ${T.line};border-radius:20px;overflow:hidden;box-shadow:0 30px 60px -34px rgba(0,0,0,${T.dark ? '.6' : '.30'});">
    <tr><td style="height:3px;background:linear-gradient(90deg,${T.gold},#e8d9b6 52%,${T.gold});font-size:0;line-height:0;">&nbsp;</td></tr>
    ${heroRow}
    ${wordmark}${smallWordmark}${divider}
    <tr><td class="cardpad" style="padding:26px 44px 6px 44px;${titleAlign}${o.plain ? 'text-align:center;' : ''}">
      ${eyebrow}
      <h1 style="font-family:${SERIF};font-weight:600;font-size:${titleSize}px;line-height:1.18;color:${T.ink};margin:0 0 16px 0;letter-spacing:-.005em;">${title}</h1>
      <div style="font-size:15px;line-height:1.7;color:${T.ink2};font-family:${SANS};text-align:${o.plain ? 'center' : 'left'};">${bodyHtml}</div>
    </td></tr>
    <tr><td class="cardpad" style="padding:22px 44px 34px 44px;">
      <div style="border-top:1px solid ${T.line};padding-top:18px;font-size:12px;line-height:1.65;color:${T.ink3};font-family:${SANS};${o.plain ? 'text-align:center;' : ''}">
        ${o.footerNote || (en ? 'You received this email because you use Lumen.' : 'Вы получили это письмо, потому что пользуетесь Lumen.')}
        ${o.manageNote ? `<br>${o.manageNote}` : ''}
        <div style="margin-top:12px;">
          <a href="https://lumen247.com/privacy.html" style="color:${T.ink3};text-decoration:underline;">${en ? 'Privacy' : 'Конфиденциальность'}</a>
          &nbsp;·&nbsp;<a href="https://lumen247.com/terms.html" style="color:${T.ink3};text-decoration:underline;">${en ? 'Terms' : 'Условия'}</a>
          &nbsp;·&nbsp;<a href="https://lumen247.com" style="color:${T.ink3};text-decoration:underline;">lumen247.com</a>
        </div>
      </div>
    </td></tr>
  </table>
  <div style="font-size:11px;color:${T.dark ? '#5f5c54' : '#a8a6a0'};margin-top:18px;font-family:${SANS};letter-spacing:.02em;">&#10022;&nbsp; © 2026 Lumen · TargetPoint AY · Antwerpen</div>
 </td></tr>
</table></body></html>`;
}

/* ─── реестр писем ────────────────────────────────────────────────────────── */
/* поля шаблона: name, arch, theme('dark'|undefined), format('plain'|'stat'|undefined), hero|badge, heroH, titleSize,
   category, audience('owner'|'broker'|'all'), essential(bool — транзакционное, отписки нет),
   subject_ru/en, body_ru/en, eyebrow_*, preheader_*, panel_*, bullets_*, stats (для stat).
   body-токены: {{button}} {{panel}} {{details}} {{code}} {{invoice}} {{bullets}} {{avatar}} {{stats}} {{lead}}. */
const DEFAULT_TEMPLATES = {
  /* ── АККАУНТ / CEREMONY ── */
  verifyEmail: {
    name: 'Подтверждение e-mail / Verify email', arch: 'ceremony', hero: 'hero.jpg', heroH: 168,
    category: 'account', audience: 'all', essential: true,
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
    category: 'account', audience: 'all', essential: true,
    eyebrow_ru: 'Добро пожаловать', eyebrow_en: 'Welcome',
    preheader_ru: 'Ваш ИИ-отдел продаж уже ловит лидов', preheader_en: 'Your AI sales desk is already capturing leads',
    subject_ru: 'Вы в Lumen, {{name}}. Теперь лиды не убегут', subject_en: 'You’re in, {{name}}. Leads don’t get away now',
    body_ru: '<p>Здравствуйте, {{name}}!</p><p>Готово. Пока вы читаете это письмо, <b>{{agency}}</b> уже под Lumen — и это меняет расстановку сил:</p>{{bullets}}{{button}}<p style="margin-top:18px">Застряли на старте? Ответьте на письмо — мы живые люди и поможем настроить.</p>',
    body_en: '<p>Hi {{name}},</p><p>Done. While you read this, <b>{{agency}}</b> is already on Lumen — and that changes the game:</p>{{bullets}}{{button}}<p style="margin-top:18px">Stuck on setup? Reply to this email — real humans, we’ll help.</p>',
    bullets_ru: ['Заявка приходит — ИИ отвечает за 60 секунд, а не «перезвоню завтра».', 'Каждый лид квалифицирован и разложен по стадиям — без ручной рутины.', 'Ни выходных, ни ночей: воронка греется, пока вы спите.'],
    bullets_en: ['A lead comes in — AI replies in 60 seconds, not “I’ll call tomorrow”.', 'Every lead qualified and sorted by stage — no manual busywork.', 'No weekends, no nights off: the funnel stays warm while you sleep.'],
  },
  trialStarted: {
    name: 'Триал начался / Trial started', arch: 'ceremony', hero: 'hero.jpg', heroH: 168,
    category: 'billing', audience: 'owner', essential: true,
    eyebrow_ru: 'Ранний доступ открыт', eyebrow_en: 'Trial started',
    preheader_ru: 'Пробный период {{days}} дн. пошёл', preheader_en: 'Your {{days}}-day trial has started',
    subject_ru: 'Часы пошли: {{days}} дней Lumen — ваши', subject_en: 'The clock’s ticking: {{days}} days of Lumen are yours',
    body_ru: '<p>Здравствуйте, {{name}}! Пробный период для <b>{{agency}}</b> активирован — {{days}} дней полного доступа, без карты и мелкого шрифта.</p>{{bullets}}{{button}}',
    body_en: '<p>Hi {{name}}, the trial for <b>{{agency}}</b> is live — {{days}} days of full access, no card, no fine print.</p>{{bullets}}{{button}}',
    bullets_ru: ['Подключите WhatsApp — ИИ начнёт отвечать лидам сегодня.', 'Импортируйте базу — старые контакты тоже в дело.', 'Позовите команду — доступы раздаются в пару кликов.'],
    bullets_en: ['Connect WhatsApp — AI starts replying to leads today.', 'Import your base — old contacts count too.', 'Invite your team — access in a couple of clicks.'],
  },
  referralReward: {
    name: 'Партнёрская награда / Referral reward', arch: 'ceremony', hero: 'hero.jpg', heroH: 156,
    category: 'partner', audience: 'all', essential: false,
    eyebrow_ru: 'Партнёрка', eyebrow_en: 'Partner',
    preheader_ru: 'Вам начислено вознаграждение', preheader_en: 'You earned a reward',
    subject_ru: '{{amount}} ваших — спасибо за {{agency}}', subject_en: '{{amount}} is yours — thanks for {{agency}}',
    body_ru: '<p>Здравствуйте, {{name}}! Агентство <b>{{agency}}</b>, которое вы привели, оплатило подписку — а значит, вам начислено вознаграждение.</p>{{details}}{{button}}',
    body_en: '<p>Hi {{name}}, the agency <b>{{agency}}</b> you referred just paid — so your reward is in.</p>{{details}}{{button}}',
  },
  /* ── БЕЗОПАСНОСТЬ / SECURITY ── */
  passwordReset: {
    name: 'Сброс пароля / Password reset', arch: 'security', hero: 'shield.jpg', heroH: 118, titleSize: 25,
    category: 'security', audience: 'all', essential: true,
    eyebrow_ru: 'Безопасность', eyebrow_en: 'Security',
    preheader_ru: 'Ссылка для нового пароля внутри', preheader_en: 'Your password reset link inside',
    subject_ru: 'Новый пароль Lumen — в один клик', subject_en: 'Your new Lumen password — one click away',
    body_ru: '<p>Забыли пароль? С кем не бывает. Жмите кнопку — зададите новый за десять секунд. Ссылка скоро протухнет, так что не тяните.</p>{{button}}{{panel}}',
    body_en: '<p>Forgot your password? Happens to the best. Hit the button — new one in ten seconds. The link expires soon, so don’t sit on it.</p>{{button}}{{panel}}',
    panel_ru: 'Не вы запрашивали сброс? Спокойно — просто проигнорируйте письмо, пароль останется прежним.',
    panel_en: 'Didn’t request this? Relax — ignore the email, your password stays as it is.',
  },
  passwordChanged: {
    name: 'Пароль изменён / Password changed', arch: 'security', hero: 'shield.jpg', heroH: 118, titleSize: 25,
    category: 'security', audience: 'all', essential: true,
    eyebrow_ru: 'Безопасность', eyebrow_en: 'Security',
    preheader_ru: 'Пароль вашего аккаунта Lumen обновлён', preheader_en: 'Your Lumen password was updated',
    subject_ru: 'Пароль Lumen изменён', subject_en: 'Your Lumen password was changed',
    body_ru: '<p>Здравствуйте, {{name}}! Пароль аккаунта <b>{{agency}}</b> успешно изменён — фиксируем для истории:</p>{{details}}<p style="color:#8b8983;font-size:13px;margin-top:4px">Это были не вы? <a href="{{link}}" style="color:#141311;font-weight:600">Восстановите доступ</a> немедленно и напишите нам.</p>',
    body_en: '<p>Hi {{name}}, the password for your <b>{{agency}}</b> account was changed — logging it for the record:</p>{{details}}<p style="color:#8b8983;font-size:13px;margin-top:4px">Wasn’t you? <a href="{{link}}" style="color:#141311;font-weight:600">Recover access</a> right away and contact us.</p>',
  },
  emailChanged: {
    name: 'E-mail изменён / Email changed', arch: 'security', hero: 'shield.jpg', heroH: 118, titleSize: 25,
    category: 'security', audience: 'all', essential: true,
    eyebrow_ru: 'Безопасность', eyebrow_en: 'Security',
    preheader_ru: 'Адрес входа в Lumen обновлён', preheader_en: 'Your Lumen login email was updated',
    subject_ru: 'Адрес входа в Lumen обновлён', subject_en: 'Your Lumen login email was updated',
    body_ru: '<p>Здравствуйте, {{name}}! Адрес входа для <b>{{agency}}</b> теперь <b>{{email}}</b>. Старый больше не подойдёт.</p>{{details}}<p style="color:#8b8983;font-size:13px;margin-top:4px">Это были не вы? <a href="{{link}}" style="color:#141311;font-weight:600">Срочно верните доступ</a>.</p>',
    body_en: '<p>Hi {{name}}, the login email for <b>{{agency}}</b> is now <b>{{email}}</b>. The old one won’t work anymore.</p>{{details}}<p style="color:#8b8983;font-size:13px;margin-top:4px">Wasn’t you? <a href="{{link}}" style="color:#141311;font-weight:600">Recover access now</a>.</p>',
  },
  loginAlert: {
    name: 'Вход с нового устройства / New sign-in', arch: 'security', hero: 'shield.jpg', heroH: 118, titleSize: 25,
    category: 'security', audience: 'all', essential: true,
    eyebrow_ru: 'Безопасность', eyebrow_en: 'Security',
    preheader_ru: 'Замечен вход в ваш аккаунт Lumen', preheader_en: 'A new sign-in to your Lumen account',
    subject_ru: 'Новый вход в Lumen', subject_en: 'New sign-in to Lumen',
    body_ru: '<p>Здравствуйте, {{name}}! Заметили вход в аккаунт <b>{{agency}}</b>. На всякий случай — детали:</p>{{details}}<p style="color:#8b8983;font-size:13px;margin-top:4px">Это вы — отлично, дальше можно не читать. Если нет — быстро <a href="{{link}}" style="color:#141311;font-weight:600">смените пароль</a>, остальное прикроем.</p>',
    body_en: '<p>Hi {{name}}, we noticed a sign-in to your <b>{{agency}}</b> account. Just in case — the details:</p>{{details}}<p style="color:#8b8983;font-size:13px;margin-top:4px">Was you — nothing to do. If not — <a href="{{link}}" style="color:#141311;font-weight:600">change your password</a>.</p>',
  },
  /* ── КОМАНДА / TEAM ── */
  invite: {
    name: 'Приглашение в команду / Team invite', arch: 'team', hero: 'nodes.jpg', heroH: 150,
    category: 'team', audience: 'all', essential: true,
    eyebrow_ru: 'Приглашение', eyebrow_en: 'Invitation',
    preheader_ru: '{{inviter}} зовёт вас в Lumen', preheader_en: '{{inviter}} invites you to Lumen',
    subject_ru: '{{inviter}} зовёт вас в {{agency}} — Lumen', subject_en: '{{inviter}} invited you to {{agency}} on Lumen',
    body_ru: '<p>Здравствуйте!</p>{{avatar}}<p><b>{{inviter}}</b> открывает вам доступ в <b>{{agency}}</b> на Lumen. Тут ИИ ловит и греет лидов, а вам достаётся самое приятное — закрывать сделки.</p>{{button}}<p style="color:#8b8983;font-size:13px;margin-top:16px">Придумаете пароль — и сразу внутри. Дело двух минут.</p>',
    body_en: '<p>Hi!</p>{{avatar}}<p><b>{{inviter}}</b> is giving you access to <b>{{agency}}</b> on Lumen — where AI captures and nurtures leads while you close deals.</p>{{button}}<p style="color:#8b8983;font-size:13px;margin-top:16px">Set a password and you’re in. Takes two minutes.</p>',
  },
  teammateJoined: {
    name: 'Новый в команде / Teammate joined', arch: 'team', hero: 'nodes.jpg', heroH: 132,
    category: 'team', audience: 'owner', essential: false,
    eyebrow_ru: 'Команда', eyebrow_en: 'Team',
    preheader_ru: 'В {{agency}} новый человек', preheader_en: 'A new member joined {{agency}}',
    subject_ru: '{{name}} теперь в команде {{agency}}', subject_en: '{{name}} joined {{agency}}',
    body_ru: '<p>Здравствуйте!</p>{{avatar}}<p><b>{{name}}</b> принял приглашение и теперь в вашей команде <b>{{agency}}</b>. Роли и доступы можно настроить в разделе «Подключения → Роли и доступы».</p>{{button}}',
    body_en: '<p>Hi!</p>{{avatar}}<p><b>{{name}}</b> accepted the invite and is now on your <b>{{agency}}</b> team. Manage roles and access under “Connections → Roles &amp; access”.</p>{{button}}',
  },
  brokerAppInvite: {
    name: 'Брокеру — вход в мини-апп / Broker app invite', arch: 'team', hero: 'nodes.jpg', heroH: 140,
    category: 'team', audience: 'broker', essential: false,
    eyebrow_ru: 'Ваш кабинет', eyebrow_en: 'Your workspace',
    preheader_ru: 'Ваш рабочий кабинет брокера готов', preheader_en: 'Your broker workspace is ready',
    subject_ru: 'Ваш кабинет в {{agency}} готов', subject_en: 'Your {{agency}} workspace is ready',
    body_ru: '<p>Здравствуйте, {{name}}! Ваш кабинет брокера в <b>{{agency}}</b> готов: живые чаты, задачи, звонки и диктовка — всё в Telegram, под рукой.</p>{{button}}',
    body_en: '<p>Hi {{name}}, your broker workspace in <b>{{agency}}</b> is ready: live chats, tasks, calls and dictation — all in Telegram, at your fingertips.</p>{{button}}',
  },
  /* ── ОПЛАТА / BILLING ── */
  paymentReceived: {
    name: 'Оплата получена / Payment received', arch: 'billing', hero: 'graph.jpg', heroH: 124,
    category: 'billing', audience: 'owner', essential: true,
    eyebrow_ru: 'Оплата', eyebrow_en: 'Billing',
    preheader_ru: 'Спасибо, оплата Lumen получена', preheader_en: 'Thanks, your Lumen payment is in',
    subject_ru: 'Оплата получена — Lumen {{period}}', subject_en: 'Payment received — Lumen {{period}}',
    body_ru: '<p>Здравствуйте, {{name}}! Спасибо — оплата подписки Lumen для <b>{{agency}}</b> получена и скреплена печатью.</p>{{invoice}}{{button}}',
    body_en: '<p>Hi {{name}}, thank you — your Lumen subscription payment for <b>{{agency}}</b> is received and sealed.</p>{{invoice}}{{button}}',
  },
  paymentUpcoming: {
    name: 'Скоро списание / Payment upcoming', arch: 'billing', hero: 'graph.jpg', heroH: 124,
    category: 'billing', audience: 'owner', essential: false,
    eyebrow_ru: 'Напоминание', eyebrow_en: 'Reminder',
    preheader_ru: 'Через {{days}} дн. спишем за подписку', preheader_en: 'We’ll charge in {{days}} days',
    subject_ru: 'Через {{days}} дн. продлим Lumen — всё по плану', subject_en: 'Lumen renews in {{days}} days — all set',
    body_ru: '<p>Здравствуйте, {{name}}! Через <b>{{days}} дн.</b> автоматически продлим подписку Lumen для <b>{{agency}}</b>. Ничего делать не нужно — это дружеское «чтобы без сюрпризов».</p>{{invoice}}{{button}}',
    body_en: '<p>Hi {{name}}, in <b>{{days}} days</b> we’ll auto-renew Lumen for <b>{{agency}}</b>. Nothing to do — just a friendly “no surprises” heads-up.</p>{{invoice}}{{button}}',
  },
  paymentFailed: {
    name: 'Оплата не прошла / Payment failed', arch: 'billing', hero: 'graph.jpg', heroH: 124,
    category: 'billing', audience: 'owner', essential: true,
    eyebrow_ru: 'Требуется действие', eyebrow_en: 'Action needed',
    preheader_ru: 'Не удалось списать оплату — обновите карту', preheader_en: 'We couldn’t charge your card — update it',
    subject_ru: 'Карта сказала «нет» — обновите её', subject_en: 'Your card said no — let’s fix it',
    body_ru: '<p>Здравствуйте, {{name}}! Не удалось списать оплату для <b>{{agency}}</b>. Чтобы ИИ-отдел продаж не останавливался ни на секунду — обновите платёжные данные.</p>{{invoice}}{{button}}{{panel}}',
    body_en: '<p>Hi {{name}}, we couldn’t charge the subscription for <b>{{agency}}</b>. To keep your AI sales desk running non-stop — update your payment details.</p>{{invoice}}{{button}}{{panel}}',
    panel_ru: 'Мы попробуем списать снова автоматически. Доступ сохраняется ещё несколько дней — паниковать не о чем.',
    panel_en: 'We’ll retry automatically. Access stays active for a few more days — nothing to panic about.',
  },
  subscriptionRenewed: {
    name: 'Подписка продлена / Subscription renewed', arch: 'billing', hero: 'graph.jpg', heroH: 124,
    category: 'billing', audience: 'owner', essential: true,
    eyebrow_ru: 'Подписка', eyebrow_en: 'Subscription',
    preheader_ru: 'Подписка Lumen продлена', preheader_en: 'Your Lumen subscription renewed',
    subject_ru: 'Подписка Lumen продлена — {{period}}', subject_en: 'Your Lumen subscription renewed — {{period}}',
    body_ru: '<p>Здравствуйте, {{name}}! Подписка Lumen для <b>{{agency}}</b> продлена. Спасибо, что растёте вместе с нами — мы это ценим.</p>{{invoice}}{{button}}',
    body_en: '<p>Hi {{name}}, your Lumen subscription for <b>{{agency}}</b> has renewed. Thank you for growing with us — it means a lot.</p>{{invoice}}{{button}}',
  },
  trialEnding: {
    name: 'Триал заканчивается / Trial ending', arch: 'digest', hero: 'ring.jpg', heroH: 156,
    category: 'billing', audience: 'owner', essential: true,
    eyebrow_ru: 'Ранний доступ', eyebrow_en: 'Early access',
    preheader_ru: 'Осталось {{days}} дн. пробного периода', preheader_en: '{{days}} days left in your trial',
    subject_ru: 'Триал тает — осталось {{days}} дн.', subject_en: 'Trial’s melting — {{days}} days left',
    body_ru: '<p>Здравствуйте, {{name}}! Пробный период <b>{{agency}}</b> заканчивается через <b>{{days}} дн.</b> Lumen уже наловил вам лидов и отвечал за секунды — обидно бросать на самом интересном.</p>{{button}}{{panel}}',
    body_en: '<p>Hi {{name}}, your trial for <b>{{agency}}</b> ends in <b>{{days}} days</b>. Lumen has already been catching leads and replying in seconds — a shame to stop at the best part.</p>{{button}}{{panel}}',
    panel_ru: 'Условия беты закреплены за первыми агентствами — позже подписка будет дороже. Успеваете зафиксировать.',
    panel_en: 'Beta terms are locked in for the first agencies — the subscription gets pricier later.',
  },
  /* ── ЛИДЫ / LEADS (light stat/plain — намеренно НЕ тёмная обложка) ── */
  newLead: {
    name: 'Новый лид / New lead', arch: 'leads', format: 'stat', titleSize: 26,
    category: 'leads', audience: 'broker', essential: false,
    eyebrow_ru: 'Новый лид', eyebrow_en: 'New lead',
    preheader_ru: 'ИИ уже ответил — загляните, пока горячо', preheader_en: 'AI already replied — jump in while it’s hot',
    subject_ru: 'Новый лид: {{leadName}} — уже на связи', subject_en: 'New lead: {{leadName}} — already engaged',
    body_ru: '<p>Здравствуйте, {{name}}! Пока вы читаете — ИИ уже поздоровался и уточняет детали. Дальше интереснее с вами:</p>{{lead}}{{button}}',
    body_en: '<p>Hi {{name}}, while you read this — AI already said hello and is qualifying. It gets better with you in the loop:</p>{{lead}}{{button}}',
  },
  leadCold: {
    name: 'Лид остывает / Lead going cold', arch: 'leads', format: 'plain', titleSize: 26,
    category: 'leads', audience: 'broker', essential: false,
    eyebrow_ru: 'Пора дожать', eyebrow_en: 'Time to nudge',
    preheader_ru: '{{leadName}} молчит — момент подтолкнуть', preheader_en: '{{leadName}} went quiet — nudge time',
    subject_ru: '{{leadName}} остывает — один толчок и вернётся', subject_en: '{{leadName}} is cooling — one nudge brings them back',
    body_ru: '<p>{{leadName}} не отвечает уже <b>{{silence}}</b>. Лиды на этой стадии ещё возвращаются — но окно закрывается. Один тёплый вопрос обычно решает.</p>{{button}}',
    body_en: '<p>{{leadName}} has been quiet for <b>{{silence}}</b>. Leads at this stage still come back — but the window is closing. One warm question usually does it.</p>{{button}}',
  },
  /* ── ВСТРЕЧИ / MEETINGS ── */
  meetingScheduled: {
    name: 'Встреча назначена / Meeting scheduled', arch: 'digest', hero: 'calendar.jpg', heroH: 140,
    category: 'meetings', audience: 'broker', essential: false,
    eyebrow_ru: 'Встреча', eyebrow_en: 'Meeting',
    preheader_ru: '{{leadName}} — {{when}}', preheader_en: '{{leadName}} — {{when}}',
    subject_ru: 'Встреча с {{leadName}} — {{when}}', subject_en: 'Meeting with {{leadName}} — {{when}}',
    body_ru: '<p>Здравствуйте, {{name}}! Встреча подтверждена — детали ниже. Добавьте в календарь, чтобы не потерять.</p>{{details}}{{button}}',
    body_en: '<p>Hi {{name}}, the meeting is confirmed — details below. Add it to your calendar so it doesn’t slip.</p>{{details}}{{button}}',
  },
  meetingReminder: {
    name: 'Напоминание о встрече / Meeting reminder', arch: 'meetings', format: 'plain', titleSize: 26,
    category: 'meetings', audience: 'broker', essential: false,
    eyebrow_ru: 'Через час', eyebrow_en: 'In an hour',
    preheader_ru: 'Встреча с {{leadName}} скоро', preheader_en: 'Your meeting with {{leadName}} is soon',
    subject_ru: 'Через час — {{leadName}}', subject_en: 'In an hour — {{leadName}}',
    body_ru: '<p>Через <b>{{eta}}</b> — встреча с <b>{{leadName}}</b>. Быстрый разбор карточки перед звонком лишним не будет.</p>{{button}}',
    body_en: '<p>In <b>{{eta}}</b> — your meeting with <b>{{leadName}}</b>. A quick card review before the call never hurts.</p>{{button}}',
  },
  /* ── ЗАДАЧИ / TASKS (plain) ── */
  taskAssigned: {
    name: 'Задача назначена / Task assigned', arch: 'tasks', format: 'plain', titleSize: 26,
    category: 'tasks', audience: 'broker', essential: false,
    eyebrow_ru: 'Новая задача', eyebrow_en: 'New task',
    preheader_ru: '{{taskTitle}} — до {{due}}', preheader_en: '{{taskTitle}} — due {{due}}',
    subject_ru: 'Задача: {{taskTitle}}', subject_en: 'Task: {{taskTitle}}',
    body_ru: '<p><b>{{inviter}}</b> поставил вам задачу:</p><p style="font-family:\'Cormorant Garamond\',Georgia,serif;font-size:22px;color:#141311">«{{taskTitle}}»</p><p style="color:#8b8983;font-size:13px">Срок — {{due}}. Открыть можно прямо в Telegram.</p>{{button}}',
    body_en: '<p><b>{{inviter}}</b> assigned you a task:</p><p style="font-family:\'Cormorant Garamond\',Georgia,serif;font-size:22px;color:#141311">“{{taskTitle}}”</p><p style="color:#8b8983;font-size:13px">Due {{due}}. Open it right in Telegram.</p>{{button}}',
  },
  taskDue: {
    name: 'Задача к сроку / Task due', arch: 'tasks', format: 'plain', titleSize: 26,
    category: 'tasks', audience: 'broker', essential: false,
    eyebrow_ru: 'Сегодня', eyebrow_en: 'Today',
    preheader_ru: '{{taskTitle}} — срок сегодня', preheader_en: '{{taskTitle}} — due today',
    subject_ru: 'Сегодня к сроку: {{taskTitle}}', subject_en: 'Due today: {{taskTitle}}',
    body_ru: '<p>Сегодня подходит срок:</p><p style="font-family:\'Cormorant Garamond\',Georgia,serif;font-size:22px;color:#141311">«{{taskTitle}}»</p><p style="color:#8b8983;font-size:13px">Пара минут — и с плеч. Или перенесите одним тапом.</p>{{button}}',
    body_en: '<p>Due today:</p><p style="font-family:\'Cormorant Garamond\',Georgia,serif;font-size:22px;color:#141311">“{{taskTitle}}”</p><p style="color:#8b8983;font-size:13px">A couple of minutes and it’s off your plate. Or reschedule in one tap.</p>{{button}}',
  },
  /* ── КАНАЛЫ / CHANNELS ── */
  waConnected: {
    name: 'WhatsApp подключён / WhatsApp connected', arch: 'digest', hero: 'inbox.jpg', heroH: 140,
    category: 'channels', audience: 'owner', essential: false,
    eyebrow_ru: 'Канал на связи', eyebrow_en: 'Channel live',
    preheader_ru: 'Номер {{phone}} в работе', preheader_en: 'Number {{phone}} is live',
    subject_ru: 'WhatsApp {{phone}} подключён — ИИ на посту', subject_en: 'WhatsApp {{phone}} connected — AI on duty',
    body_ru: '<p>Здравствуйте, {{name}}! Номер <b>{{phone}}</b> подключён к <b>{{agency}}</b> и уже готов принимать лидов. Прогрев идёт по плану — резкие рассылки не нужны.</p>{{button}}',
    body_en: '<p>Hi {{name}}, number <b>{{phone}}</b> is connected to <b>{{agency}}</b> and ready to take leads. Warm-up is on schedule — no need to blast.</p>{{button}}',
  },
  waIssue: {
    name: 'WhatsApp отвалился / WhatsApp issue', arch: 'security', hero: 'inbox.jpg', heroH: 118, titleSize: 25,
    category: 'channels', audience: 'owner', essential: false,
    eyebrow_ru: 'Требуется действие', eyebrow_en: 'Action needed',
    preheader_ru: 'Номер {{phone}} отключился', preheader_en: 'Number {{phone}} went offline',
    subject_ru: 'WhatsApp {{phone}} отвалился — быстрый ре-коннект', subject_en: 'WhatsApp {{phone}} dropped — quick reconnect',
    body_ru: '<p>Здравствуйте, {{name}}! Номер <b>{{phone}}</b> потерял связь — лиды в этот канал сейчас не идут. Обычно лечится повторным сканом QR за минуту.</p>{{button}}{{panel}}',
    body_en: '<p>Hi {{name}}, number <b>{{phone}}</b> lost connection — leads aren’t reaching this channel right now. A quick QR re-scan usually fixes it in a minute.</p>{{button}}{{panel}}',
    panel_ru: 'Пока номер офлайн, ИИ не отвечает по нему. Остальные каналы работают штатно.',
    panel_en: 'While the number is offline, AI won’t reply there. Your other channels keep running.',
  },
  missedActivity: {
    name: 'Пропущенное / Missed activity', arch: 'channels', format: 'plain', titleSize: 26,
    category: 'channels', audience: 'broker', essential: false,
    eyebrow_ru: 'Не потеряйте', eyebrow_en: 'Don’t miss it',
    preheader_ru: '{{leadName}}: {{what}}', preheader_en: '{{leadName}}: {{what}}',
    subject_ru: '{{leadName}}: {{what}}', subject_en: '{{leadName}}: {{what}}',
    body_ru: '<p><b>{{leadName}}</b> — {{what}}. ИИ придержал разговор, но живой ответ сейчас стоит дороже всего.</p>{{button}}',
    body_en: '<p><b>{{leadName}}</b> — {{what}}. AI held the conversation, but a human reply right now is worth the most.</p>{{button}}',
  },
  /* ── ОТЧЁТЫ / REPORTS (stat + dark) ── */
  dailyDigest: {
    name: 'Сводка за день / Daily digest', arch: 'reports', format: 'stat', titleSize: 27,
    category: 'reports', audience: 'all', essential: false,
    eyebrow_ru: 'Сводка за день', eyebrow_en: 'Daily digest',
    preheader_ru: 'Что случилось за сутки в {{agency}}', preheader_en: 'What happened today in {{agency}}',
    subject_ru: 'Ваш день в цифрах — {{agency}}', subject_en: 'Your day in numbers — {{agency}}',
    body_ru: '<p>Здравствуйте, {{name}}! Пока вы занимались делом, Lumen считал. Вот сутки {{agency}} одним взглядом:</p>{{stats}}<p>Самое горячее ждёт внутри — стадии уже расставлены.</p>{{button}}',
    body_en: '<p>Hi {{name}}, while you were busy, Lumen was counting. Here’s {{agency}}’s day at a glance:</p>{{stats}}<p>The hottest ones are waiting inside — stages already sorted.</p>{{button}}',
    stats_ru: [{ n: '{{leads}}', label: 'новых лида' }, { n: '{{replies}}', label: 'ответов ИИ' }, { n: '{{meetings}}', label: 'встречи' }],
    stats_en: [{ n: '{{leads}}', label: 'new leads' }, { n: '{{replies}}', label: 'AI replies' }, { n: '{{meetings}}', label: 'meetings' }],
  },
  weeklyReport: {
    name: 'Итоги недели / Weekly report', arch: 'reports', theme: 'dark', format: 'stat', hero: 'graph.jpg', heroH: 150, titleSize: 29,
    category: 'reports', audience: 'owner', essential: false,
    eyebrow_ru: 'Итоги недели', eyebrow_en: 'Weekly report',
    preheader_ru: 'Неделя {{agency}} в цифрах', preheader_en: 'A week of {{agency}} in numbers',
    subject_ru: 'Неделя {{agency}}: цифры, которые приятно смотреть', subject_en: 'A week of {{agency}}: numbers worth a look',
    body_ru: '<p>Здравствуйте, {{name}}! Неделя закрыта — вот как отработал Lumen для <b>{{agency}}</b>:</p>{{stats}}<p>Средний ответ ИИ — {{speed}}. Детальный разбор по брокерам и стадиям — внутри.</p>{{button}}',
    body_en: '<p>Hi {{name}}, the week’s in the books — here’s how Lumen performed for <b>{{agency}}</b>:</p>{{stats}}<p>Average AI reply — {{speed}}. Full breakdown by broker and stage inside.</p>{{button}}',
    stats_ru: [{ n: '{{leads}}', label: 'лидов' }, { n: '{{qualified}}', label: 'квалифицировано' }, { n: '{{meetings}}', label: 'встреч' }],
    stats_en: [{ n: '{{leads}}', label: 'leads' }, { n: '{{qualified}}', label: 'qualified' }, { n: '{{meetings}}', label: 'meetings' }],
  },
  founderBrief: {
    name: 'Сигналы руководителю / Founder brief', arch: 'reports', theme: 'dark', hero: 'ring.jpg', heroH: 150, titleSize: 28,
    category: 'reports', audience: 'owner', essential: false,
    eyebrow_ru: 'Штаб · сигналы', eyebrow_en: 'HQ · signals',
    preheader_ru: 'То, на что стоит взглянуть лично', preheader_en: 'The things worth your personal look',
    subject_ru: 'Штаб: {{count}} сигнала, которые стоит увидеть', subject_en: 'HQ: {{count}} signals worth your eyes',
    body_ru: '<p>Здравствуйте, {{name}}! Пульт собрал то, что обычно тонет в рутине — короткая сводка руководителю по <b>{{agency}}</b>:</p>{{bullets}}{{button}}',
    body_en: '<p>Hi {{name}}, the control desk surfaced what usually drowns in routine — a short brief for <b>{{agency}}</b>:</p>{{bullets}}{{button}}',
    bullets_ru: ['2 лида с крупным бюджетом ждут ответа дольше нормы.', 'У одного брокера конверсия просела — стоит заглянуть.', 'Задолженность по кабинету: 1 платёж на грани.'],
    bullets_en: ['2 high-budget leads have waited longer than your norm.', 'One broker’s conversion dipped — worth a look.', 'Ad account debt: 1 payment on the edge.'],
  },
  /* ── АКАДЕМИЯ / ACADEMY ── */
  academyTip: {
    name: 'Приём недели / Academy tip', arch: 'digest', hero: 'nodes.jpg', heroH: 140,
    category: 'academy', audience: 'broker', essential: false,
    eyebrow_ru: 'Академия · приём недели', eyebrow_en: 'Academy · tip of the week',
    preheader_ru: 'Короткий приём, который поднимает конверсию', preheader_en: 'A short move that lifts conversion',
    subject_ru: 'Приём недели: {{tipTitle}}', subject_en: 'Tip of the week: {{tipTitle}}',
    body_ru: '<p>Здравствуйте, {{name}}! Один приём из Академии, который реально двигает сделки:</p>{{panel}}<p>Разобрано на реальных диалогах — загляните, это две минуты.</p>{{button}}',
    body_en: '<p>Hi {{name}}, one move from the Academy that actually moves deals:</p>{{panel}}<p>Broken down on real dialogues — take a look, it’s two minutes.</p>{{button}}',
    panel_ru: '«{{tipBody}}»',
    panel_en: '“{{tipBody}}”',
  },
  /* ── ПРОДУКТ / PRODUCT (dark) ── */
  productUpdate: {
    name: 'Что нового / Product update', arch: 'product', theme: 'dark', hero: 'hero.jpg', heroH: 168, titleSize: 29,
    category: 'product', audience: 'all', essential: false,
    eyebrow_ru: 'Что нового', eyebrow_en: 'What’s new',
    preheader_ru: 'Свежие апдейты Lumen', preheader_en: 'Fresh Lumen updates',
    subject_ru: '{{subject}}', subject_en: '{{subject}}',
    body_ru: '<p>Здравствуйте, {{name}}! Пара свежих штук, которые уже работают в вашем Lumen:</p>{{bullets}}{{button}}<p style="color:#8f8b80;font-size:12px;margin-top:16px">Идея, чего не хватает? Просто ответьте на письмо.</p>',
    body_en: '<p>Hi {{name}}, a couple of fresh things already live in your Lumen:</p>{{bullets}}{{button}}<p style="color:#8f8b80;font-size:12px;margin-top:16px">Got an idea for what’s missing? Just reply.</p>',
    bullets_ru: ['Перенос задач в один тап — «завтра / через неделю / конкретный день».', 'Синхронный переводчик в Zoom: RU → EN/IT прямо на созвоне.', 'Сводка по каждому брокеру в разделе «Штаб».'],
    bullets_en: ['One-tap task reschedule — “tomorrow / next week / a specific day”.', 'Live Zoom interpreter: RU → EN/IT right on the call.', 'Per-broker summary in the “HQ” section.'],
  },
  winback: {
    name: 'Возврат / Win-back', arch: 'marketing', theme: 'dark', hero: 'flow.jpg', heroH: 168, titleSize: 30,
    category: 'marketing', audience: 'owner', essential: false,
    eyebrow_ru: 'Скучаем', eyebrow_en: 'We miss you',
    preheader_ru: 'Ваш ИИ-отдел продаж скучает', preheader_en: 'Your AI sales desk misses you',
    subject_ru: 'Пока вас не было, лиды не ждали', subject_en: 'While you were away, leads didn’t wait',
    body_ru: '<p>Здравствуйте, {{name}}! Давно не виделись. За это время Lumen подрос: быстрее отвечает, умнее квалифицирует, аккуратнее греет. <b>{{agency}}</b> ждёт — и первая неделя снова за наш счёт.</p>{{button}}',
    body_en: '<p>Hi {{name}}, long time. Lumen has grown since: faster replies, sharper qualification, gentler nurture. <b>{{agency}}</b> is waiting — and the first week is on us again.</p>{{button}}',
  },
  /* ── СЛУЖЕБНЫЕ / GENERIC ── */
  notification: {
    name: 'Уведомление / Notification', arch: 'digest', hero: 'flow.jpg', heroH: 132,
    category: 'account', audience: 'all', essential: false,
    subject_ru: 'Lumen: {{title}}', subject_en: 'Lumen: {{title}}',
    body_ru: '<p>Здравствуйте, {{name}}!</p><p>{{message}}</p>{{button}}',
    body_en: '<p>Hi {{name}},</p><p>{{message}}</p>{{button}}',
  },
  exportReady: {
    name: 'Выгрузка готова / Export ready', arch: 'account', format: 'plain', titleSize: 26,
    category: 'account', audience: 'all', essential: false,
    eyebrow_ru: 'Готово', eyebrow_en: 'Ready',
    preheader_ru: 'Ваш файл выгрузки готов', preheader_en: 'Your export file is ready',
    subject_ru: 'Ваша выгрузка готова к скачиванию', subject_en: 'Your export is ready to download',
    body_ru: '<p>Файл <b>{{fileName}}</b> собран и ждёт. Ссылка активна ограниченное время — сохраните файл к себе.</p>{{button}}',
    body_en: '<p>Your file <b>{{fileName}}</b> is ready and waiting. The link is active for a limited time — save the file locally.</p>{{button}}',
  },
  marketing: {
    name: 'Маркетинг / Marketing', arch: 'digest', hero: 'flow.gif', heroH: 176, titleSize: 29,
    category: 'marketing', audience: 'all', essential: false,
    subject_ru: '{{subject}}', subject_en: '{{subject}}',
    body_ru: '<p>Здравствуйте, {{name}}!</p><p>{{message}}</p>{{button}}<p style="color:#8b8983;font-size:12px;margin-top:18px">Не хотите получать такие письма? <a href="{{unsubscribe}}" style="color:#8b8983;text-decoration:underline">Отписаться</a>.</p>',
    body_en: '<p>Hi {{name}},</p><p>{{message}}</p>{{button}}<p style="color:#8b8983;font-size:12px;margin-top:18px">Don’t want these emails? <a href="{{unsubscribe}}" style="color:#8b8983;text-decoration:underline">Unsubscribe</a>.</p>',
  },
};

/* категории для UI подписок (владелец в админке, брокер в аккаунте) */
const EMAIL_CATEGORIES = {
  account: { ru: 'Аккаунт', en: 'Account' },
  security: { ru: 'Безопасность', en: 'Security' },
  billing: { ru: 'Оплата и подписка', en: 'Billing' },
  leads: { ru: 'Лиды', en: 'Leads' },
  meetings: { ru: 'Встречи', en: 'Meetings' },
  tasks: { ru: 'Задачи', en: 'Tasks' },
  team: { ru: 'Команда', en: 'Team' },
  channels: { ru: 'Каналы (WhatsApp / звонки)', en: 'Channels (WhatsApp / calls)' },
  reports: { ru: 'Отчёты и сводки', en: 'Reports & digests' },
  academy: { ru: 'Академия', en: 'Academy' },
  product: { ru: 'Обновления продукта', en: 'Product updates' },
  partner: { ru: 'Партнёрская программа', en: 'Partner program' },
  marketing: { ru: 'Рассылки и предложения', en: 'Newsletters & offers' },
};

function getTemplates(registry) {
  registry.emailTemplates = registry.emailTemplates || {};
  const out = {};
  for (const k of Object.keys(DEFAULT_TEMPLATES)) out[k] = Object.assign({}, DEFAULT_TEMPLATES[k], registry.emailTemplates[k] || {});
  return out;
}

/* метаданные типа письма (для реестра/подписок) */
function emailMeta(key) {
  const t = DEFAULT_TEMPLATES[key]; if (!t) return null;
  return { key, name: t.name, category: t.category || 'account', audience: t.audience || 'all', essential: !!t.essential, arch: t.arch, theme: t.theme || 'light', format: t.format || t.arch };
}
/* весь каталог писем — для админки основателя */
function emailCatalog() { return Object.keys(DEFAULT_TEMPLATES).map(emailMeta); }

/* дефолтные подписки: все НЕобязательные категории включены; audience учитывается вызывающим */
function defaultNotifyPrefs() {
  const p = {}; for (const c of Object.keys(EMAIL_CATEGORIES)) p[c] = true; return p;
}

/* можно ли слать письмо key пользователю с ролью и его подписками.
   user: {isOwner, role}. prefs: {категория: bool}. essential игнорирует prefs, но НЕ игнорирует аудиторию. */
function canReceive(key, user, prefs) {
  const m = emailMeta(key); if (!m) return false;
  user = user || {}; const isOwner = !!user.isOwner || user.role === 'owner' || user.role === 'master';
  if (m.audience === 'owner' && !isOwner) return false;
  if (m.audience === 'broker' && isOwner && user.role !== 'broker') { /* владелец обычно тоже брокер — пускаем, если явно не только-владелец */ }
  if (m.essential) return true;
  const p = prefs || {}; return p[m.category] !== false;
}

function interpolate(str, vars) {
  return String(str || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars && vars[k] != null) ? vars[k] : '');
}

/* собрать письмо: {subject, html, meta}. Токены тянутся из vars, иначе — из дефолтов шаблона. */
function renderTemplate(registry, key, vars, lang) {
  const t = getTemplates(registry)[key] || DEFAULT_TEMPLATES.notification;
  lang = lang === 'en' ? 'en' : 'ru';
  const en = lang === 'en';
  const isDark = t.theme === 'dark';
  const T = isDark ? D : C;
  const v = Object.assign({}, vars);

  if (v.button == null && v.link) v.button = emailButton(v.link, v.buttonLabel || (en ? 'Open Lumen' : 'Открыть Lumen'), { ghost: !!v.buttonGhost, T });
  if (v.button == null) v.button = '';
  if (v.panel == null) { const p = interpolate(t['panel_' + lang] || t.panel_ru || '', v); v.panel = p ? emailPanel(esc(p), false, T) : ''; }
  if (v.bullets == null) { const b = t['bullets_' + lang] || t.bullets_ru; v.bullets = Array.isArray(b) ? emailBullets(b.map(x => interpolate(esc(x), v)), T) : ''; }
  if (v.details == null) {
    if (v.detailRows) v.details = emailDetails(v.detailRows, T);
    else if (t.arch === 'security') v.details = emailDetails([[en ? 'Time' : 'Время', v.time || new Date().toLocaleString(en ? 'en-GB' : 'ru-RU')], [en ? 'Device' : 'Устройство', v.device || (en ? 'Browser · Chrome' : 'Браузер · Chrome')], [en ? 'Location' : 'Локация', v.location || '—'], ['IP', v.ip || '—']], T);
    else if (t.category === 'meetings') v.details = emailDetails([[en ? 'Lead' : 'Лид', v.leadName || '—'], [en ? 'When' : 'Когда', v.when || '—'], [en ? 'Format' : 'Формат', v.format2 || (en ? 'Zoom' : 'Zoom')]], T);
    else v.details = '';
  }
  if (v.code == null) v.code = v.otp ? emailCode(v.otp, T) : '';
  if (v.invoice == null) {
    if (v.invoiceRows || t.arch === 'billing') {
      v.invoice = emailInvoice({ T, title: en ? 'Invoice' : 'Счёт', rows: v.invoiceRows || [[(en ? 'Plan' : 'Тариф'), v.plan || 'Lumen Pro'], [(en ? 'Period' : 'Период'), v.period || (en ? 'monthly' : 'месяц')], [(en ? 'Agency' : 'Агентство'), v.agency || '—']], totalLabel: en ? 'Total' : 'Итого', total: v.amount || '€99' });
    } else v.invoice = '';
  }
  if (v.avatar == null) { v.avatar = (t.arch === 'team') ? emailAvatar(v.inviter || v.name || 'Lumen', en ? 'invites you to the team' : 'приглашает в команду', T) : ''; }
  if (v.stats == null) {
    const st = t['stats_' + lang] || t.stats_ru;
    v.stats = Array.isArray(st) ? emailStatGrid(st.map(s => ({ n: interpolate(String(s.n), v) || '0', label: interpolate(String(s.label), v) })), T) : '';
  }
  if (v.lead == null) {
    v.lead = (t.category === 'leads') ? emailLeadCard({ T, name: v.leadName || (en ? 'New lead' : 'Новый лид'), status: v.leadStatus || (en ? 'engaged' : 'на связи'), rows: v.leadRows || [[(en ? 'Source' : 'Источник'), v.leadSource || 'WhatsApp'], [(en ? 'Budget' : 'Бюджет'), v.leadBudget || '—'], [(en ? 'Request' : 'Запрос'), v.leadRequest || '—']] }, T) : '';
  }

  const subject = interpolate(t['subject_' + lang] || t.subject_ru, v);
  const inner = interpolate(t['body_' + lang] || t.body_ru, v);
  const title = interpolate(v.title || subject, v);
  const opt = {
    theme: isDark ? 'dark' : 'light',
    plain: t.format === 'plain',
    eyebrow: interpolate(t['eyebrow_' + lang] || t.eyebrow_ru || '', v) || null,
    preheader: interpolate(t['preheader_' + lang] || t.preheader_ru || '', v) || null,
    hero: t.hero ? { src: (t.hero.indexOf('://') > -1 ? t.hero : ART + '/' + t.hero), h: t.heroH || 190 } : null,
    badge: t.badge ? (t.badge.indexOf('://') > -1 ? t.badge : ART + '/' + t.badge) : null,
    titleSize: t.titleSize || null,
    manageNote: (t.essential ? null : (v.manageUrl ? `<a href="${esc(v.manageUrl)}" style="color:${T.ink3};text-decoration:underline;">${en ? 'Manage email preferences' : 'Настроить, какие письма получать'}</a>` : null)),
  };
  return { subject, html: emailWrap(esc(title), inner, lang, opt), meta: emailMeta(key) };
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

module.exports = {
  emailWrap, emailButton, emailPanel, emailBullets, emailCode, emailDetails, emailInvoice, emailAvatar, emailStatGrid, emailLeadCard,
  DEFAULT_TEMPLATES, EMAIL_CATEGORIES, getTemplates, emailMeta, emailCatalog, defaultNotifyPrefs, canReceive,
  renderTemplate, interpolate, platformEmailCfg, sendViaResend, ART, C, D, pal,
};
