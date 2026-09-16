/* Почтовая инфраструктура SaaS Lumen — ядро оформления «наложенный хедер» (референсы Email layout).
   • Тёмная шапка с АРТОМ + wordmark/eyebrow/serif-заголовок ПОВЕРХ (email-safe: bgcolor + background-image,
     слева арта — тёмное поле под текст). Тело — крем (или целиком тёмное при theme:'dark'). Плюс форматы
     plain (без шапки, письмо-записка) и stat (крупные KPI).
   • Богатые блоки: фичи-список с иконками, чек с галочкой+суммой, карточка лида, аватар-панель, инфо-грид,
     сноска с иконкой, full-width кнопка, футер с тэглайном.
   • Каждый шаблон несёт category/audience/essential — backbone подписок (canReceive + страница подписок).
   • Билингва RU/EN, редактируется в админке (registry.emailTemplates). Отправка — Resend. */

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const C = { bg: '#efece5', card: '#fffdfa', ink: '#141311', ink2: '#57544e', ink3: '#8b8983', line: 'rgba(20,19,17,.10)', line2: 'rgba(20,19,17,.06)', gold: '#c9a86a', goldDeep: '#a9863f', panel: '#f5f1e9', panel2: '#faf7f0', ok: '#3f8f5b', danger: '#b4472e', btnBg: '#141311', btnInk: '#faf9f5', dark: false };
const D = { bg: '#0c0b09', card: '#151310', ink: '#f4f1ea', ink2: '#c7c1b4', ink3: '#8f8b80', line: 'rgba(255,255,255,.13)', line2: 'rgba(255,255,255,.07)', gold: '#d8bd86', goldDeep: '#c9a86a', panel: '#1d1a15', panel2: '#191611', ok: '#5cc48c', danger: '#e08a72', btnBg: '#efe7d5', btnInk: '#151310', dark: true };
const pal = (theme) => theme === 'dark' ? D : C;
/* цвета текста в тёмной шапке (шапка всегда тёмная, независимо от темы тела) */
const H = { bg: '#0c0b09', gold: '#d8bd86', light: '#f6f3ec', mute: '#b7b1a4', line: 'rgba(255,255,255,.16)' };

const SERIF = "'Cormorant Garamond',Georgia,'Times New Roman',serif";
const SANS = "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const ART = (process.env.EMAIL_ART_BASE || process.env.PUBLIC_BASE_URL || 'https://app.lumen247.com').replace(/\/$/, '') + '/emailart';
const FONTS = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Manrope:wght@400;500;600;700&display=swap";

/* тонкие иконки-обводки (Apple/iOS Mail рендерят inline SVG; где вырезано — остаётся аккуратная золотая ячейка) */
const ICONS = {
  bolt: 'M13 2L4 14h6l-1 8 9-12h-6z', users: 'M16 20v-1a4 4 0 00-3-3.9M8 20v-1a4 4 0 013-3.9M12 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
  moon: 'M21 12.6A8.5 8.5 0 1111.4 3 6.6 6.6 0 0021 12.6z', home: 'M4 11l8-7 8 7M6 10v9h12v-9', mail: 'M3.5 6h17v12h-17zM3.5 7l8.5 5.5L20.5 7',
  user: 'M19.5 20a7.5 7.5 0 00-15 0M12 11.5a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z', lock: 'M6 11h12v8H6zM8.5 11V8a3.5 3.5 0 017 0v3',
  doc: 'M7 3h7l4.5 4.5V21H7zM14 3v5h5', chat: 'M4.5 5h15v10h-9l-4 4z', check: 'M5 12.5l4.5 4.5L20 6.5', calendar: 'M4.5 6h15v14.5h-15zM4.5 10.5h15M8.5 3.5v4M15.5 3.5v4',
  alert: 'M12 3l9.5 17H2.5zM12 10v4.5M12 17.5h.01', clock: 'M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zM12 7.5v5l3.2 3.2', bell: 'M6.5 10a5.5 5.5 0 1111 0c0 4.5 2 5.5 2 5.5H4.5s2-1 2-5.5zM10 19.5a2 2 0 004 0',
  phone: 'M5 4h3.2l1.8 4.6-2 1.1a11.5 11.5 0 005.3 5.3l1.1-2 4.6 1.8V19a1.5 1.5 0 01-1.6 1.5A15.5 15.5 0 013.5 6.6 1.5 1.5 0 015 5z', chart: 'M4 19V5M4 19h16M8 15l3-4 3 2 4-6', gift: 'M4 11h16v9H4zM4 8h16v3H4zM12 8v12M12 8a2.5 2.5 0 10-2.5-2.5A2.5 2.5 0 0012 8a2.5 2.5 0 102.5-2.5A2.5 2.5 0 0012 8z', spark: 'M12 3l1.7 6.3L20 11l-6.3 1.7L12 19l-1.7-6.3L4 11l6.3-1.7z',
};
function svgIcon(key, color, size) { const d = ICONS[key] || ICONS.spark; size = size || 22; return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="display:block">${d.split('M').filter(Boolean).map(s => '<path d="M' + s + '"/>').join('')}</svg>`; }
/* золотая круглая ячейка-иконка */
function iconChip(key, T, size) { size = size || 44; const ic = Math.round(size * 0.5); return `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="${size}" height="${size}" align="center" valign="middle" style="width:${size}px;height:${size}px;background:${T.dark ? 'rgba(216,189,134,.10)' : 'rgba(201,168,106,.12)'};border:1px solid ${T.line};border-radius:50%;">${svgIcon(key, T.goldDeep, ic)}</td></tr></table>`; }

/* ─── строительные блоки ─────────────────────────────────────────────────── */
function emailButton(url, label, opt) {
  const o = opt || {}; const T = o.T || C; const wide = o.wide !== false;
  const bg = o.ghost ? 'transparent' : T.btnBg; const col = o.ghost ? T.ink : T.btnInk;
  const bd = o.ghost ? `border:1px solid ${T.line};` : `border:1px solid ${T.dark ? 'rgba(255,255,255,.14)' : 'rgba(201,168,106,.5)'};`;
  const inner = `<a href="${esc(url)}" style="display:block;color:${col};text-decoration:none;font-family:${SERIF};font-weight:600;font-size:19px;letter-spacing:.01em;padding:17px 30px;border-radius:14px;text-align:center;">${esc(label)}${o.ghost ? '' : ' &nbsp;&rarr;'}</a>`;
  if (wide) return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 8px 0;"><tr><td style="border-radius:14px;background:${bg};${bd}box-shadow:0 14px 30px -18px rgba(0,0,0,.5);">${inner}</td></tr></table>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 6px 0;"><tr><td style="border-radius:14px;background:${bg};${bd}"><a href="${esc(url)}" style="display:inline-block;color:${col};text-decoration:none;font-family:${SERIF};font-weight:600;font-size:18px;padding:15px 34px;border-radius:14px;">${esc(label)}${o.ghost ? '' : ' &rarr;'}</a></td></tr></table>`;
}

function emailPanel(html, accent, T) {
  T = T || C; const bd = accent ? T.gold : T.line;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;"><tr><td style="background:${T.panel};border:1px solid ${bd};border-radius:14px;padding:18px 22px;font-size:14px;line-height:1.6;color:${T.ink2};font-family:${SANS};">${html}</td></tr></table>`;
}

/* фичи-список: иконка + serif-заголовок + подпись (welcome/апдейты) */
function emailFeatureList(items, T) {
  T = T || C;
  const rows = (items || []).map((it, i) => `<tr>
    <td width="44" valign="top" style="padding:${i ? '16' : '4'}px 16px 4px 0;${i ? 'border-top:1px solid ' + T.line2 + ';' : ''}">${iconChip(it.icon || 'spark', T, 40)}</td>
    <td valign="top" style="padding:${i ? '16' : '4'}px 0 4px 0;${i ? 'border-top:1px solid ' + T.line2 + ';' : ''}">
      <div style="font-family:${SERIF};font-weight:600;font-size:19px;color:${T.ink};line-height:1.15;">${esc(it.title)}</div>
      <div style="font-family:${SANS};font-size:13px;color:${T.ink3};margin-top:3px;line-height:1.45;">${esc(it.sub)}</div>
    </td></tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;background:${T.panel2};border:1px solid ${T.line};border-radius:16px;"><tr><td style="padding:14px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr></table>`;
}

/* простые ✦-буллеты (fallback для строковых списков) */
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

/* чек: круг-галочка + крупная serif-сумма + статус, черта, строки (billing) */
function emailReceipt(opt) {
  const o = opt || {}; const T = o.T || C; const paid = o.icon !== 'alert';
  const ring = paid ? T.goldDeep : T.danger;
  const rows = (o.rows || []).map(r => `<tr>
    <td style="padding:8px 0;font-size:14px;color:${T.ink2};font-family:${SANS};">${esc(r[0])}</td>
    <td style="padding:8px 0;font-size:14px;color:${T.ink};text-align:right;font-weight:600;font-family:${SANS};">${esc(r[1])}</td></tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:${T.panel2};border:1px solid ${T.line};border-radius:16px;"><tr><td style="padding:24px 24px 18px;">
    <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>
      <td valign="middle" style="padding-right:16px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="46" height="46" align="center" valign="middle" style="width:46px;height:46px;border:1.5px solid ${ring};border-radius:50%;">${svgIcon(paid ? 'check' : 'alert', ring, 22)}</td></tr></table></td>
      <td valign="middle"><div style="font-family:${SERIF};font-size:40px;font-weight:600;color:${T.ink};line-height:1;">${esc(o.amount || '')}</div></td>
    </tr></table>
    <div align="center" style="text-align:center;font-size:10.5px;letter-spacing:.24em;text-transform:uppercase;color:${ring};font-family:${SANS};font-weight:700;margin-top:10px;">${esc(o.caption || (paid ? 'Оплачено' : 'Требует действия'))}</div>
    <div style="height:1px;background:${T.line};margin:18px 0 8px;font-size:0;line-height:0;">&nbsp;</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
  </td></tr></table>`;
}

/* карточка лида: иконка-дом + ЗАПРОС + крупный serif-запрос + 2 колонки значений + статус */
function emailLeadCard(opt, T) {
  const o = opt || {}; T = T || C;
  const cols = (o.cols || []).map((c, i) => `<td width="50%" valign="top" style="${i ? 'border-left:1px solid ' + T.line + ';padding-left:20px;' : 'padding-right:20px;'}">
    <div style="font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:${T.ink3};font-family:${SANS};font-weight:700;">${esc(c[0])}</div>
    <div style="font-family:${SERIF};font-size:24px;font-weight:600;color:${T.ink};line-height:1.1;margin-top:5px;">${esc(c[1])}</div></td>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:${T.panel2};border:1px solid ${T.line};border-radius:18px;"><tr><td style="padding:22px 24px;">
    <div align="center" style="text-align:center;">${(function () { return `<table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td align="center">${iconChip(o.icon || 'home', T, 44)}</td></tr></table>`; })()}</div>
    <div align="center" style="text-align:center;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:${T.ink3};font-family:${SANS};font-weight:700;margin-top:12px;">${esc(o.label || 'Запрос')}</div>
    <div align="center" style="text-align:center;font-family:${SERIF};font-size:27px;font-weight:600;color:${T.ink};line-height:1.15;margin-top:4px;">${esc(o.name || '')}</div>
    ${o.cols && o.cols.length ? `<div style="height:1px;background:${T.line};margin:18px 0;font-size:0;line-height:0;">&nbsp;</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cols}</tr></table>` : ''}
    ${o.status ? `<div style="height:1px;background:${T.line};margin:18px 0 14px;font-size:0;line-height:0;">&nbsp;</div><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="font-family:${SERIF};color:${T.gold};font-size:16px;padding-right:8px;">&#10022;</td><td style="font-family:${SANS};font-size:13px;color:${T.ink2};">${esc(o.status)}</td></tr></table>` : ''}
  </td></tr></table>`;
}

/* аватар-панель: слева кружок+имя+роль, справа рабочее пространство (team) */
function emailAvatar(opt, T) {
  T = T || C;
  if (typeof opt === 'string') opt = { name: opt, role: arguments[1] || '' }, T = arguments[2] || C; /* обратная совместимость */
  const o = opt || {}; const initial = esc(String(o.name || '?').trim().charAt(0).toUpperCase() || '?');
  /* Рабочее пространство — отдельной строкой ПОД именем (а не 3-й колонкой): иначе на телефоне 390px строка не влезает
     и сжимает круглый аватар в овал. Две ячейки (фикс-аватар + гибкая колонка) безопасны на любой ширине. */
  const ws = o.workspace ? `<div style="margin-top:9px;padding-top:9px;border-top:1px solid ${T.line2};font-family:${SANS};font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${T.ink3};font-weight:700;">${esc(o.workspaceLabel || 'Рабочее пространство')} &nbsp;<span style="font-family:${SERIF};font-size:16px;font-weight:600;letter-spacing:0;text-transform:none;color:${T.ink};">${esc(o.workspace)}</span></div>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;background:${T.panel};border:1px solid ${T.line};border-radius:16px;"><tr><td style="padding:16px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td valign="top" style="padding-right:14px;width:52px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="52" height="52" align="center" valign="middle" style="width:52px;height:52px;background:linear-gradient(135deg,${T.gold},${T.goldDeep});border-radius:50%;color:#fff;font-family:${SERIF};font-size:25px;font-weight:600;">${initial}</td></tr></table></td>
    <td valign="top"><div style="font-family:${SERIF};font-size:20px;font-weight:600;color:${T.ink};line-height:1.15;padding-top:2px;">${esc(o.name || '')}</div><div style="font-family:${SANS};font-size:12.5px;color:${T.ink3};margin-top:2px;">${esc(o.role || o.sub || '')}</div>${ws}</td>
  </tr></table></td></tr></table>`;
}

/* инфо-грид: 2 колонки иконка+подпись+значение (verify) */
function emailInfoGrid(cols, T) {
  T = T || C;
  const cells = (cols || []).map((c, i) => `<td width="50%" valign="top" style="${i ? 'border-left:1px solid ' + T.line + ';padding-left:22px;' : 'padding-right:22px;'}">
    <div style="margin-bottom:12px;">${iconChip(c.icon || 'spark', T, 40)}</div>
    <div style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${T.ink3};font-family:${SANS};font-weight:700;">${esc(c.label)}</div>
    <div style="font-family:${SANS};font-size:15px;font-weight:600;color:${T.ink};margin-top:4px;word-break:break-word;">${esc(c.value)}</div></td>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;background:${T.panel};border:1px solid ${T.line};border-radius:16px;"><tr><td style="padding:20px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table></td></tr></table>`;
}

/* сноска под кнопкой: иконка + приглушённый текст */
function emailFootnote(iconKey, text, T) {
  T = T || C;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 2px;"><tr>
    <td valign="middle" width="26" style="padding-right:10px;">${svgIcon(iconKey || 'spark', T.ink3, 18)}</td>
    <td valign="middle" style="font-family:${SANS};font-size:12.5px;color:${T.ink3};line-height:1.45;">${text}</td></tr></table>`;
}

/* сетка KPI (stat/reports) */
function emailStatGrid(stats, T) {
  T = T || C; const arr = (stats || []).slice(0, 3); const w = Math.floor(100 / (arr.length || 1));
  const cells = arr.map((s, i) => `<td width="${w}%" style="padding:0 ${i ? '6' : '0'}px;vertical-align:top;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${T.panel2};border:1px solid ${T.line};border-radius:14px;"><tr><td align="center" style="padding:18px 10px;">
      <div style="font-family:${SERIF};font-size:40px;font-weight:600;color:${T.ink};line-height:1;">${esc(s.n)}</div>
      <div style="font-family:${SANS};font-size:12px;color:${T.ink3};margin-top:7px;letter-spacing:.02em;">${esc(s.label)}</div>
    </td></tr></table></td>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;"><tr>${cells}</tr></table>`;
}

function emailInvoice(opt) { /* совместимость: чек-стиль */ return emailReceipt(Object.assign({ amount: (opt && opt.total) || '', caption: (opt && opt.title) || 'Счёт', rows: (opt && opt.rows) || [] }, opt)); }

/* ─── ядро: наложенный тёмный хедер ──────────────────────────────────────── */
function overlayHeader(o) {
  const H2 = o.hero.h || 250; const art = o.hero.src;
  const spacer = Math.max(28, H2 - 156);
  const side = o.headerNote ? `<td valign="bottom" align="right" style="font-family:${SANS};font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${H.mute};line-height:1.7;padding-left:16px;">${o.headerNote}</td>` : '';
  return `<tr><td background="${art}" bgcolor="${H.bg}" valign="top" style="background-color:${H.bg};background-image:url('${art}');background-position:right center;background-size:cover;background-repeat:no-repeat;padding:0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="cardpad" style="padding:30px 44px 32px 44px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="font-family:${SERIF};font-size:22px;color:${H.gold};padding-right:9px;line-height:1;">&#10022;</td>
        <td style="font-family:${SERIF};font-size:23px;letter-spacing:.22em;color:${H.light};line-height:1;">LUMEN</td>
      </tr></table>
      <div style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:${H.mute};margin-top:6px;font-family:${SANS};">${o.en ? 'Real estate AI-CRM' : 'AI-CRM для недвижимости'}</div>
      <div style="height:${spacer}px;line-height:0;font-size:0;">&nbsp;</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td valign="bottom">
          ${o.eyebrow ? `<div style="font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:${H.gold};font-weight:700;margin:0 0 10px;font-family:${SANS};">${esc(o.eyebrow)}</div>` : ''}
          <div style="font-family:${SERIF};font-weight:600;font-size:${o.titleSize || 30}px;line-height:1.12;color:${H.light};letter-spacing:-.005em;">${o.title}</div>
        </td>${side}
      </tr></table>
    </td></tr></table>
  </td></tr>`;
}

/* светлый хедер для plain (письмо-записка, без арта) */
function plainHeader(o, T) {
  return `<tr><td class="cardpad" align="center" style="padding:34px 44px 0;text-align:center;">
    <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>
      <td style="font-family:${SERIF};font-size:21px;color:${T.gold};padding-right:9px;line-height:1;">&#10022;</td>
      <td style="font-family:${SERIF};font-size:22px;letter-spacing:.22em;color:${T.ink};line-height:1;">LUMEN</td>
    </tr></table>
    <div style="font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:${T.ink3};margin-top:6px;font-family:${SANS};">${o.en ? 'Real estate AI-CRM' : 'AI-CRM для недвижимости'}</div>
    <div style="margin-top:16px;font-family:${SERIF};font-size:18px;color:${T.gold};">&#10022;</div>
  </td></tr>`;
}

/* ─── обёртка письма ─────────────────────────────────────────────────────── */
function emailWrap(title, bodyHtml, lang, opt) {
  const en = lang === 'en';
  const o = opt || {}; o.en = en; o.title = title;
  const T = o.theme === 'dark' ? D : C;
  const pre = o.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${T.card};font-size:1px;line-height:1px;">${esc(o.preheader)}${'&#847;&zwnj;&nbsp;'.repeat(24)}</div>` : '';
  const header = o.hero ? overlayHeader(o) : plainHeader(o, T);
  const showTitleInBody = !o.hero; /* при наложенном хедере заголовок уже в шапке */
  const eyebrowBody = (!o.hero && o.eyebrow) ? `<div style="font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:${T.gold};font-weight:700;margin:0 0 12px;font-family:${SANS};${o.plain ? 'text-align:center;' : ''}">${esc(o.eyebrow)}</div>` : '';
  const titleBody = (showTitleInBody) ? `${eyebrowBody}<h1 style="font-family:${SERIF};font-weight:600;font-size:${o.titleSize || 28}px;line-height:1.16;color:${T.ink};margin:0 0 16px;letter-spacing:-.005em;${o.plain ? 'text-align:center;' : ''}">${title}</h1>` : '';
  const tagline = en ? 'People · Properties · Possibilities' : 'Люди · Объекты · Возможности';
  return `<!doctype html><html lang="${en ? 'en' : 'ru'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="${FONTS}" rel="stylesheet">
<style>@import url('${FONTS}');@media (max-width:560px){.cardpad{padding-left:26px!important;padding-right:26px!important}}</style></head>
<body style="margin:0;padding:0;background:${T.bg};-webkit-font-smoothing:antialiased;">${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${T.bg};font-family:${SANS};">
 <tr><td align="center" style="padding:36px 16px;">
  <table role="presentation" width="548" cellpadding="0" cellspacing="0" style="max-width:548px;width:100%;background:${T.card};border:1px solid ${T.line};border-radius:20px;overflow:hidden;box-shadow:0 30px 60px -34px rgba(0,0,0,${T.dark ? '.6' : '.30'});">
    <tr><td style="height:3px;background:linear-gradient(90deg,${T.gold},#e8d9b6 52%,${T.gold});font-size:0;line-height:0;">&nbsp;</td></tr>
    ${header}
    <tr><td class="cardpad" style="padding:${o.hero ? '28' : '22'}px 44px 6px 44px;${o.plain ? 'text-align:center;' : ''}">
      ${titleBody}
      <div style="font-size:15px;line-height:1.7;color:${T.ink2};font-family:${SANS};text-align:${o.plain ? 'center' : 'left'};">${bodyHtml}</div>
    </td></tr>
    <tr><td class="cardpad" style="padding:14px 44px 30px 44px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${T.line};"><tr>
        <td valign="top" style="padding-top:18px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="font-family:${SERIF};font-size:18px;color:${T.gold};padding-right:7px;line-height:1;">&#10022;</td><td style="font-family:${SERIF};font-size:18px;letter-spacing:.2em;color:${T.ink};line-height:1;">LUMEN</td></tr></table>
          <div style="font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:${T.ink3};margin-top:5px;font-family:${SANS};">${tagline}</div>
        </td>
        <td valign="top" align="right" style="padding-top:18px;font-family:${SANS};font-size:11.5px;line-height:1.6;color:${T.ink3};text-align:right;">
          ${o.footerNote || (en ? 'You received this email because you use Lumen.' : 'Вы получили это письмо, потому что пользуетесь Lumen.')}
          ${o.manageNote ? `<br>${o.manageNote}` : ''}
          <div style="margin-top:9px;">
            <a href="https://lumen247.com/privacy.html" style="color:${T.ink3};text-decoration:underline;">${en ? 'Privacy' : 'Конфиденциальность'}</a>
            &nbsp;·&nbsp;<a href="https://lumen247.com/terms.html" style="color:${T.ink3};text-decoration:underline;">${en ? 'Terms' : 'Условия'}</a>
            &nbsp;·&nbsp;<a href="https://lumen247.com" style="color:${T.ink3};text-decoration:underline;">lumen247.com</a>
          </div>
        </td>
      </tr></table>
    </td></tr>
  </table>
  <div style="font-size:11px;color:${T.dark ? '#5f5c54' : '#a8a6a0'};margin-top:16px;font-family:${SANS};letter-spacing:.02em;">© 2026 Lumen · TargetPoint AY · Antwerpen</div>
 </td></tr>
</table></body></html>`;
}

/* ─── реестр писем ───────────────────────────────────────────────────────── */
const DEFAULT_TEMPLATES = {
  verifyEmail: {
    name: 'Подтверждение e-mail / Verify email', arch: 'ceremony', hero: 'hero.gif', heroH: 250, titleSize: 33,
    category: 'account', audience: 'all', essential: true,
    eyebrow_ru: 'Подтверждение e-mail', eyebrow_en: 'Confirm e-mail',
    headerNote_ru: 'больше<br>возможностей', headerNote_en: 'more<br>possibilities',
    preheader_ru: 'Подтвердите адрес — и Lumen начнёт ловить лидов', preheader_en: 'Confirm your email and Lumen starts catching leads',
    subject_ru: 'Один клик — и Lumen готов к работе', subject_en: 'One click and Lumen is ready',
    title_ru: 'Один клик — и Lumen готов к работе', title_en: 'One click and Lumen is ready',
    body_ru: '<p>Здравствуйте, {{name}}!</p><p>Подтвердите e-mail, чтобы начать работу с Lumen.</p>{{info}}{{button}}{{note}}',
    body_en: '<p>Hi {{name}},</p><p>Confirm your e-mail to start with Lumen.</p>{{info}}{{button}}{{note}}',
    note_ru: 'Если вы не создавали аккаунт — просто проигнорируйте это письмо.', note_en: 'If you didn’t create an account, just ignore this email.', noteIcon: 'lock',
  },
  welcome: {
    name: 'Приветствие / Welcome', arch: 'ceremony', hero: 'hero.gif', heroH: 250, titleSize: 32,
    category: 'account', audience: 'all', essential: true,
    eyebrow_ru: 'Добро пожаловать', eyebrow_en: 'Welcome',
    preheader_ru: 'Ваш ИИ-отдел продаж уже ловит лидов', preheader_en: 'Your AI sales desk is already capturing leads',
    subject_ru: 'Вы в Lumen, {{name}}. Теперь лиды не убегут', subject_en: 'You’re in, {{name}}. Leads don’t get away now',
    title_ru: 'Вы в Lumen, {{name}}. Теперь лиды не&nbsp;убегут.', title_en: 'You’re in, {{name}}. Leads don’t get away now.',
    body_ru: '<p>Здравствуйте, {{name}}! Ваш аккаунт <b>{{agency}}</b> готов к работе.</p>{{features}}{{button}}{{note}}',
    body_en: '<p>Hi {{name}}! Your <b>{{agency}}</b> account is ready.</p>{{features}}{{button}}{{note}}',
    features_ru: [{ icon: 'bolt', title: 'Ответ за 60 секунд', sub: 'ИИ отвечает на заявку, а не откладывает на завтра.' }, { icon: 'users', title: 'Квалификация без рутины', sub: 'Лиды квалифицированы и распределены по стадиям.' }, { icon: 'moon', title: 'Работа 24/7', sub: 'Воронка работает, пока вы отдыхаете.' }],
    features_en: [{ icon: 'bolt', title: 'Reply in 60 seconds', sub: 'AI answers the lead instead of putting it off.' }, { icon: 'users', title: 'Qualification, no busywork', sub: 'Leads are qualified and sorted by stage.' }, { icon: 'moon', title: 'Runs 24/7', sub: 'The funnel works while you rest.' }],
    note_ru: 'Нужна помощь на старте? Ответьте на это письмо — поможем настроить Lumen.', note_en: 'Need help getting started? Reply to this email — we’ll help.', noteIcon: 'chat',
  },
  trialStarted: {
    name: 'Триал начался / Trial started', arch: 'ceremony', hero: 'hero.gif', heroH: 240, titleSize: 31,
    category: 'billing', audience: 'owner', essential: true,
    eyebrow_ru: 'Ранний доступ открыт', eyebrow_en: 'Trial started',
    preheader_ru: 'Пробный период {{days}} дн. пошёл', preheader_en: 'Your {{days}}-day trial has started',
    subject_ru: 'Часы пошли: {{days}} дней Lumen — ваши', subject_en: 'The clock’s ticking: {{days}} days of Lumen',
    title_ru: 'Часы пошли: {{days}} дней Lumen — ваши', title_en: 'The clock’s ticking: {{days}} days',
    body_ru: '<p>Здравствуйте, {{name}}! Пробный период для <b>{{agency}}</b> активирован — {{days}} дней полного доступа, без карты и мелкого шрифта.</p>{{features}}{{button}}',
    body_en: '<p>Hi {{name}}, the trial for <b>{{agency}}</b> is live — {{days}} days of full access, no card, no fine print.</p>{{features}}{{button}}',
    features_ru: [{ icon: 'chat', title: 'Подключите WhatsApp', sub: 'ИИ начнёт отвечать лидам уже сегодня.' }, { icon: 'doc', title: 'Импортируйте базу', sub: 'Старые контакты тоже пойдут в дело.' }, { icon: 'users', title: 'Позовите команду', sub: 'Доступы раздаются в пару кликов.' }],
    features_en: [{ icon: 'chat', title: 'Connect WhatsApp', sub: 'AI starts replying to leads today.' }, { icon: 'doc', title: 'Import your base', sub: 'Old contacts count too.' }, { icon: 'users', title: 'Invite your team', sub: 'Access in a couple of clicks.' }],
  },
  referralReward: {
    name: 'Партнёрская награда / Referral reward', arch: 'ceremony', hero: 'hero.gif', heroH: 230, titleSize: 30,
    category: 'partner', audience: 'all', essential: false,
    eyebrow_ru: 'Партнёрская программа', eyebrow_en: 'Partner program',
    preheader_ru: 'Вам начислено вознаграждение', preheader_en: 'You earned a reward',
    subject_ru: '{{amount}} ваших — спасибо за {{agency}}', subject_en: '{{amount}} is yours — thanks for {{agency}}',
    title_ru: '{{amount}} — ваше вознаграждение', title_en: '{{amount}} — your reward',
    body_ru: '<p>Здравствуйте, {{name}}! Агентство <b>{{agency}}</b>, которое вы привели, оплатило подписку — вознаграждение начислено.</p>{{details}}{{button}}',
    body_en: '<p>Hi {{name}}, the agency <b>{{agency}}</b> you referred just paid — your reward is in.</p>{{details}}{{button}}',
  },
  passwordReset: {
    name: 'Сброс пароля / Password reset', arch: 'security', hero: 'shield.gif', heroH: 220, titleSize: 30,
    category: 'security', audience: 'all', essential: true,
    eyebrow_ru: 'Безопасность', eyebrow_en: 'Security',
    preheader_ru: 'Ссылка для нового пароля внутри', preheader_en: 'Your password reset link inside',
    subject_ru: 'Новый пароль Lumen — в один клик', subject_en: 'Your new Lumen password — one click away',
    title_ru: 'Новый пароль — в один клик', title_en: 'A new password — one click away',
    body_ru: '<p>Забыли пароль? С кем не бывает. Жмите кнопку — зададите новый за десять секунд. Ссылка скоро протухнет, так что не тяните.</p>{{button}}{{note}}',
    body_en: '<p>Forgot your password? Happens to the best. Hit the button — new one in ten seconds. The link expires soon.</p>{{button}}{{note}}',
    note_ru: 'Не вы запрашивали сброс? Просто проигнорируйте письмо — пароль останется прежним.', note_en: 'Didn’t request this? Ignore the email — your password stays as it is.', noteIcon: 'lock',
  },
  passwordChanged: {
    name: 'Пароль изменён / Password changed', arch: 'security', hero: 'shield.gif', heroH: 200, titleSize: 29,
    category: 'security', audience: 'all', essential: true,
    eyebrow_ru: 'Безопасность', eyebrow_en: 'Security',
    preheader_ru: 'Пароль вашего аккаунта Lumen обновлён', preheader_en: 'Your Lumen password was updated',
    subject_ru: 'Пароль Lumen изменён', subject_en: 'Your Lumen password was changed',
    title_ru: 'Пароль изменён', title_en: 'Password changed',
    body_ru: '<p>Здравствуйте, {{name}}! Пароль аккаунта <b>{{agency}}</b> успешно изменён — фиксируем для истории:</p>{{details}}{{note}}',
    body_en: '<p>Hi {{name}}, the password for your <b>{{agency}}</b> account was changed — logging it for the record:</p>{{details}}{{note}}',
    note_ru: 'Это были не вы? <a href="{{link}}" style="color:#141311;font-weight:600">Восстановите доступ</a> немедленно и напишите нам.', note_en: 'Wasn’t you? <a href="{{link}}" style="color:#141311;font-weight:600">Recover access</a> right away.', noteIcon: 'alert',
  },
  emailChanged: {
    name: 'E-mail изменён / Email changed', arch: 'security', hero: 'shield.gif', heroH: 200, titleSize: 29,
    category: 'security', audience: 'all', essential: true,
    eyebrow_ru: 'Безопасность', eyebrow_en: 'Security',
    preheader_ru: 'Адрес входа в Lumen обновлён', preheader_en: 'Your Lumen login email was updated',
    subject_ru: 'Адрес входа в Lumen обновлён', subject_en: 'Your Lumen login email was updated',
    title_ru: 'Адрес входа обновлён', title_en: 'Login email updated',
    body_ru: '<p>Здравствуйте, {{name}}! Адрес входа для <b>{{agency}}</b> теперь <b>{{email}}</b>. Старый больше не подойдёт.</p>{{details}}{{note}}',
    body_en: '<p>Hi {{name}}, the login email for <b>{{agency}}</b> is now <b>{{email}}</b>. The old one won’t work.</p>{{details}}{{note}}',
    note_ru: 'Это были не вы? <a href="{{link}}" style="color:#141311;font-weight:600">Срочно верните доступ</a>.', note_en: 'Wasn’t you? <a href="{{link}}" style="color:#141311;font-weight:600">Recover access now</a>.', noteIcon: 'alert',
  },
  loginAlert: {
    name: 'Вход с нового устройства / New sign-in', arch: 'security', hero: 'shield.gif', heroH: 200, titleSize: 29,
    category: 'security', audience: 'all', essential: true,
    eyebrow_ru: 'Безопасность', eyebrow_en: 'Security',
    preheader_ru: 'Замечен вход в ваш аккаунт Lumen', preheader_en: 'A new sign-in to your Lumen account',
    subject_ru: 'Новый вход в Lumen', subject_en: 'New sign-in to Lumen',
    title_ru: 'Новый вход в Lumen', title_en: 'New sign-in to Lumen',
    body_ru: '<p>Здравствуйте, {{name}}! Заметили вход в аккаунт <b>{{agency}}</b>. На всякий случай — детали:</p>{{details}}{{note}}',
    body_en: '<p>Hi {{name}}, we noticed a sign-in to your <b>{{agency}}</b> account. Just in case — the details:</p>{{details}}{{note}}',
    note_ru: 'Это вы — можно не читать. Если нет — быстро <a href="{{link}}" style="color:#141311;font-weight:600">смените пароль</a>.', note_en: 'Was you — nothing to do. If not — <a href="{{link}}" style="color:#141311;font-weight:600">change your password</a>.', noteIcon: 'lock',
  },
  invite: {
    name: 'Приглашение в команду / Team invite', arch: 'team', hero: 'nodes.gif', heroH: 235, titleSize: 31,
    category: 'team', audience: 'all', essential: true,
    eyebrow_ru: 'Приглашение в команду', eyebrow_en: 'Team invitation',
    preheader_ru: '{{inviter}} зовёт вас в Lumen', preheader_en: '{{inviter}} invites you to Lumen',
    subject_ru: '{{inviter}} зовёт вас в {{agency}} — Lumen', subject_en: '{{inviter}} invited you to {{agency}} on Lumen',
    title_ru: 'Вас приглашают в {{agency}}', title_en: 'You’re invited to {{agency}}',
    body_ru: '<p>Здравствуйте! <b>{{inviter}}</b> приглашает вас в команду <b>{{agency}}</b> на Lumen.</p>{{avatar}}<p>Lumen берёт на себя работу с лидами, чтобы вы могли сосредоточиться на сделках.</p>{{button}}{{note}}',
    body_en: '<p>Hi! <b>{{inviter}}</b> invites you to the <b>{{agency}}</b> team on Lumen.</p>{{avatar}}<p>Lumen handles the leads so you can focus on closing.</p>{{button}}{{note}}',
    note_ru: 'Создайте пароль — и присоединяйтесь к команде.', note_en: 'Set a password — and join the team.', noteIcon: 'lock',
  },
  teammateJoined: {
    name: 'Новый в команде / Teammate joined', arch: 'team', hero: 'nodes.gif', heroH: 210, titleSize: 29,
    category: 'team', audience: 'owner', essential: false,
    eyebrow_ru: 'Команда', eyebrow_en: 'Team',
    preheader_ru: 'В {{agency}} новый человек', preheader_en: 'A new member joined {{agency}}',
    subject_ru: '{{name}} теперь в команде {{agency}}', subject_en: '{{name}} joined {{agency}}',
    title_ru: '{{name}} теперь в команде', title_en: '{{name}} joined the team',
    body_ru: '<p>Здравствуйте!</p>{{avatar}}<p><b>{{name}}</b> принял приглашение и теперь в вашей команде <b>{{agency}}</b>. Роли и доступы — в разделе «Подключения → Роли и доступы».</p>{{button}}',
    body_en: '<p>Hi!</p>{{avatar}}<p><b>{{name}}</b> accepted the invite and is now on your <b>{{agency}}</b> team. Manage roles under “Connections → Roles &amp; access”.</p>{{button}}',
  },
  brokerAppInvite: {
    name: 'Брокеру — вход в мини-апп / Broker app invite', arch: 'team', hero: 'nodes.gif', heroH: 220, titleSize: 30,
    category: 'team', audience: 'broker', essential: false,
    eyebrow_ru: 'Ваш кабинет', eyebrow_en: 'Your workspace',
    preheader_ru: 'Ваш рабочий кабинет брокера готов', preheader_en: 'Your broker workspace is ready',
    subject_ru: 'Ваш кабинет в {{agency}} готов', subject_en: 'Your {{agency}} workspace is ready',
    title_ru: 'Ваш кабинет готов', title_en: 'Your workspace is ready',
    body_ru: '<p>Здравствуйте, {{name}}! Ваш кабинет брокера в <b>{{agency}}</b> готов: живые чаты, задачи, звонки и диктовка — всё в Telegram, под рукой.</p>{{button}}',
    body_en: '<p>Hi {{name}}, your broker workspace in <b>{{agency}}</b> is ready: live chats, tasks, calls and dictation — all in Telegram.</p>{{button}}',
  },
  paymentReceived: {
    name: 'Оплата получена / Payment received', arch: 'billing', hero: 'graph.gif', heroH: 230, titleSize: 31,
    category: 'billing', audience: 'owner', essential: true,
    eyebrow_ru: 'Подтверждение оплаты', eyebrow_en: 'Payment confirmed',
    preheader_ru: 'Спасибо, оплата Lumen получена', preheader_en: 'Thanks, your Lumen payment is in',
    subject_ru: 'Оплата получена — Lumen {{period}}', subject_en: 'Payment received — Lumen {{period}}',
    title_ru: 'Оплата получена.<br>{{period}}', title_en: 'Payment received.<br>{{period}}',
    body_ru: '<p>Здравствуйте, {{name}}! Спасибо — оплата подписки Lumen для <b>{{agency}}</b> успешно получена.</p>{{receipt}}{{button}}{{note}}',
    body_en: '<p>Hi {{name}}, thank you — your Lumen subscription payment for <b>{{agency}}</b> is received.</p>{{receipt}}{{button}}{{note}}',
    note_ru: 'Детали платежа — в вашем счёте.', note_en: 'Payment details are in your invoice.', noteIcon: 'doc',
  },
  paymentUpcoming: {
    name: 'Скоро списание / Payment upcoming', arch: 'billing', hero: 'graph.gif', heroH: 210, titleSize: 29,
    category: 'billing', audience: 'owner', essential: false,
    eyebrow_ru: 'Напоминание', eyebrow_en: 'Reminder',
    preheader_ru: 'Через {{days}} дн. спишем за подписку', preheader_en: 'We’ll charge in {{days}} days',
    subject_ru: 'Через {{days}} дн. продлим Lumen — всё по плану', subject_en: 'Lumen renews in {{days}} days — all set',
    title_ru: 'Продление через {{days}} дн.', title_en: 'Renewal in {{days}} days',
    body_ru: '<p>Здравствуйте, {{name}}! Через <b>{{days}} дн.</b> автоматически продлим подписку Lumen для <b>{{agency}}</b>. Делать ничего не нужно — это чтобы без сюрпризов.</p>{{receipt}}{{button}}',
    body_en: '<p>Hi {{name}}, in <b>{{days}} days</b> we’ll auto-renew Lumen for <b>{{agency}}</b>. Nothing to do — just a no-surprises heads-up.</p>{{receipt}}{{button}}',
    receiptCaption_ru: 'К списанию', receiptCaption_en: 'Upcoming', receiptIcon: 'clock',
  },
  paymentFailed: {
    name: 'Оплата не прошла / Payment failed', arch: 'billing', hero: 'graph.gif', heroH: 220, titleSize: 30,
    category: 'billing', audience: 'owner', essential: true,
    eyebrow_ru: 'Требуется действие', eyebrow_en: 'Action needed',
    preheader_ru: 'Не удалось списать оплату — обновите карту', preheader_en: 'We couldn’t charge your card — update it',
    subject_ru: 'Карта сказала «нет» — обновите её', subject_en: 'Your card said no — let’s fix it',
    title_ru: 'Карта сказала «нет»', title_en: 'Your card said no',
    body_ru: '<p>Здравствуйте, {{name}}! Не удалось списать оплату для <b>{{agency}}</b>. Чтобы ИИ-отдел продаж не останавливался — обновите платёжные данные.</p>{{receipt}}{{button}}{{note}}',
    body_en: '<p>Hi {{name}}, we couldn’t charge the subscription for <b>{{agency}}</b>. To keep your AI sales desk running — update your payment details.</p>{{receipt}}{{button}}{{note}}',
    receiptCaption_ru: 'Не прошло', receiptCaption_en: 'Declined', receiptIcon: 'alert',
    note_ru: 'Мы попробуем списать снова автоматически. Доступ сохраняется ещё несколько дней.', note_en: 'We’ll retry automatically. Access stays active for a few more days.', noteIcon: 'clock',
  },
  subscriptionRenewed: {
    name: 'Подписка продлена / Subscription renewed', arch: 'billing', hero: 'graph.gif', heroH: 220, titleSize: 30,
    category: 'billing', audience: 'owner', essential: true,
    eyebrow_ru: 'Подписка продлена', eyebrow_en: 'Subscription renewed',
    preheader_ru: 'Подписка Lumen продлена', preheader_en: 'Your Lumen subscription renewed',
    subject_ru: 'Подписка Lumen продлена — {{period}}', subject_en: 'Your Lumen subscription renewed — {{period}}',
    title_ru: 'Подписка продлена.<br>{{period}}', title_en: 'Subscription renewed.<br>{{period}}',
    body_ru: '<p>Здравствуйте, {{name}}! Подписка Lumen для <b>{{agency}}</b> продлена. Спасибо, что растёте вместе с нами.</p>{{receipt}}{{button}}{{note}}',
    body_en: '<p>Hi {{name}}, your Lumen subscription for <b>{{agency}}</b> has renewed. Thank you for growing with us.</p>{{receipt}}{{button}}{{note}}',
    note_ru: 'Детали платежа — в вашем счёте.', note_en: 'Payment details are in your invoice.', noteIcon: 'doc',
  },
  trialEnding: {
    name: 'Триал заканчивается / Trial ending', arch: 'digest', hero: 'ring.gif', heroH: 230, titleSize: 31,
    category: 'billing', audience: 'owner', essential: true,
    eyebrow_ru: 'Ранний доступ', eyebrow_en: 'Early access',
    preheader_ru: 'Осталось {{days}} дн. пробного периода', preheader_en: '{{days}} days left in your trial',
    subject_ru: 'Триал тает — осталось {{days}} дн.', subject_en: 'Trial’s melting — {{days}} days left',
    title_ru: 'Триал тает — осталось {{days}} дн.', title_en: 'Trial’s melting — {{days}} days left',
    body_ru: '<p>Здравствуйте, {{name}}! Пробный период <b>{{agency}}</b> заканчивается через <b>{{days}} дн.</b> Lumen уже наловил вам лидов и отвечал за секунды — обидно бросать на самом интересном.</p>{{button}}{{note}}',
    body_en: '<p>Hi {{name}}, your trial for <b>{{agency}}</b> ends in <b>{{days}} days</b>. Lumen has already been catching leads — a shame to stop at the best part.</p>{{button}}{{note}}',
    note_ru: 'Условия беты закреплены за первыми агентствами — позже подписка будет дороже.', note_en: 'Beta terms are locked in for the first agencies — it gets pricier later.', noteIcon: 'clock',
  },
  newLead: {
    name: 'Новый лид / New lead', arch: 'leads', hero: 'flow.gif', heroH: 220, titleSize: 32,
    category: 'leads', audience: 'broker', essential: false,
    eyebrow_ru: 'Новый лид', eyebrow_en: 'New lead',
    preheader_ru: 'ИИ уже ответил — загляните, пока горячо', preheader_en: 'AI already replied — jump in while it’s hot',
    subject_ru: 'Новый лид в вашей воронке', subject_en: 'A new lead in your funnel',
    title_ru: 'Новый лид<br>в вашей воронке', title_en: 'A new lead<br>in your funnel',
    body_ru: '<p>Здравствуйте, {{name}}! Новая заявка уже в Lumen. ИИ ответил и уточняет детали.</p>{{lead}}{{button}}{{note}}',
    body_en: '<p>Hi {{name}}, a new lead is already in Lumen. AI replied and is qualifying.</p>{{lead}}{{button}}{{note}}',
    note_ru: 'Загляните в диалог, пока интерес к покупке свежий.', note_en: 'Jump into the chat while the buying intent is fresh.', noteIcon: 'chat',
  },
  leadCold: {
    name: 'Лид остывает / Lead going cold', arch: 'leads', format: 'plain', titleSize: 27,
    category: 'leads', audience: 'broker', essential: false,
    eyebrow_ru: 'Пора дожать', eyebrow_en: 'Time to nudge',
    preheader_ru: '{{leadName}} молчит — момент подтолкнуть', preheader_en: '{{leadName}} went quiet — nudge time',
    subject_ru: '{{leadName}} остывает — один толчок и вернётся', subject_en: '{{leadName}} is cooling — one nudge brings them back',
    title_ru: '{{leadName}} остывает — один толчок и вернётся', title_en: '{{leadName}} is cooling',
    body_ru: '<p>{{leadName}} не отвечает уже <b>{{silence}}</b>. Лиды на этой стадии ещё возвращаются — но окно закрывается. Один тёплый вопрос обычно решает.</p>{{button}}',
    body_en: '<p>{{leadName}} has been quiet for <b>{{silence}}</b>. Leads at this stage still come back — but the window is closing.</p>{{button}}',
  },
  meetingScheduled: {
    name: 'Встреча назначена / Meeting scheduled', arch: 'digest', hero: 'calendar.gif', heroH: 215, titleSize: 30,
    category: 'meetings', audience: 'broker', essential: false,
    eyebrow_ru: 'Встреча назначена', eyebrow_en: 'Meeting scheduled',
    preheader_ru: '{{leadName}} — {{when}}', preheader_en: '{{leadName}} — {{when}}',
    subject_ru: 'Встреча с {{leadName}} — {{when}}', subject_en: 'Meeting with {{leadName}} — {{when}}',
    title_ru: 'Встреча с {{leadName}}', title_en: 'Meeting with {{leadName}}',
    body_ru: '<p>Здравствуйте, {{name}}! Встреча подтверждена — детали ниже. Добавьте в календарь, чтобы не потерять.</p>{{details}}{{button}}',
    body_en: '<p>Hi {{name}}, the meeting is confirmed — details below. Add it to your calendar.</p>{{details}}{{button}}',
  },
  meetingReminder: {
    name: 'Напоминание о встрече / Meeting reminder', arch: 'meetings', format: 'plain', titleSize: 27,
    category: 'meetings', audience: 'broker', essential: false,
    eyebrow_ru: 'Через час', eyebrow_en: 'In an hour',
    preheader_ru: 'Встреча с {{leadName}} скоро', preheader_en: 'Your meeting with {{leadName}} is soon',
    subject_ru: 'Через час — {{leadName}}', subject_en: 'In an hour — {{leadName}}',
    title_ru: 'Через час — {{leadName}}', title_en: 'In an hour — {{leadName}}',
    body_ru: '<p>Через <b>{{eta}}</b> — встреча с <b>{{leadName}}</b>. Быстрый разбор карточки перед звонком лишним не будет.</p>{{button}}',
    body_en: '<p>In <b>{{eta}}</b> — your meeting with <b>{{leadName}}</b>. A quick card review never hurts.</p>{{button}}',
  },
  taskAssigned: {
    name: 'Задача назначена / Task assigned', arch: 'tasks', format: 'plain', titleSize: 27,
    category: 'tasks', audience: 'broker', essential: false,
    eyebrow_ru: 'Новая задача', eyebrow_en: 'New task',
    preheader_ru: '{{taskTitle}} — до {{due}}', preheader_en: '{{taskTitle}} — due {{due}}',
    subject_ru: 'Задача: {{taskTitle}}', subject_en: 'Task: {{taskTitle}}',
    title_ru: 'Новая задача', title_en: 'New task',
    body_ru: '<p><b>{{inviter}}</b> поставил вам задачу:</p><p style="font-family:\'Cormorant Garamond\',Georgia,serif;font-size:24px;color:#141311">«{{taskTitle}}»</p><p style="color:#8b8983;font-size:13px">Срок — {{due}}. Открыть можно прямо в Telegram.</p>{{button}}',
    body_en: '<p><b>{{inviter}}</b> assigned you a task:</p><p style="font-family:\'Cormorant Garamond\',Georgia,serif;font-size:24px;color:#141311">“{{taskTitle}}”</p><p style="color:#8b8983;font-size:13px">Due {{due}}. Open it in Telegram.</p>{{button}}',
  },
  taskDue: {
    name: 'Задача к сроку / Task due', arch: 'tasks', format: 'plain', titleSize: 27,
    category: 'tasks', audience: 'broker', essential: false,
    eyebrow_ru: 'Сегодня', eyebrow_en: 'Today',
    preheader_ru: '{{taskTitle}} — срок сегодня', preheader_en: '{{taskTitle}} — due today',
    subject_ru: 'Сегодня к сроку: {{taskTitle}}', subject_en: 'Due today: {{taskTitle}}',
    title_ru: 'Сегодня к сроку', title_en: 'Due today',
    body_ru: '<p>Сегодня подходит срок:</p><p style="font-family:\'Cormorant Garamond\',Georgia,serif;font-size:24px;color:#141311">«{{taskTitle}}»</p><p style="color:#8b8983;font-size:13px">Пара минут — и с плеч. Или перенесите одним тапом.</p>{{button}}',
    body_en: '<p>Due today:</p><p style="font-family:\'Cormorant Garamond\',Georgia,serif;font-size:24px;color:#141311">“{{taskTitle}}”</p><p style="color:#8b8983;font-size:13px">A couple of minutes and it’s done. Or reschedule in one tap.</p>{{button}}',
  },
  waConnected: {
    name: 'WhatsApp подключён / WhatsApp connected', arch: 'digest', hero: 'inbox.gif', heroH: 215, titleSize: 29,
    category: 'channels', audience: 'owner', essential: false,
    eyebrow_ru: 'Канал на связи', eyebrow_en: 'Channel live',
    preheader_ru: 'Номер {{phone}} в работе', preheader_en: 'Number {{phone}} is live',
    subject_ru: 'WhatsApp {{phone}} подключён — ИИ на посту', subject_en: 'WhatsApp {{phone}} connected — AI on duty',
    title_ru: 'WhatsApp подключён', title_en: 'WhatsApp connected',
    body_ru: '<p>Здравствуйте, {{name}}! Номер <b>{{phone}}</b> подключён к <b>{{agency}}</b> и уже готов принимать лидов. Прогрев идёт по плану — резкие рассылки не нужны.</p>{{button}}',
    body_en: '<p>Hi {{name}}, number <b>{{phone}}</b> is connected to <b>{{agency}}</b> and ready to take leads. Warm-up is on schedule.</p>{{button}}',
  },
  waIssue: {
    name: 'WhatsApp отвалился / WhatsApp issue', arch: 'security', hero: 'inbox.gif', heroH: 200, titleSize: 29,
    category: 'channels', audience: 'owner', essential: false,
    eyebrow_ru: 'Требуется действие', eyebrow_en: 'Action needed',
    preheader_ru: 'Номер {{phone}} отключился', preheader_en: 'Number {{phone}} went offline',
    subject_ru: 'WhatsApp {{phone}} отвалился — быстрый ре-коннект', subject_en: 'WhatsApp {{phone}} dropped — quick reconnect',
    title_ru: 'WhatsApp {{phone}} отвалился', title_en: 'WhatsApp {{phone}} dropped',
    body_ru: '<p>Здравствуйте, {{name}}! Номер <b>{{phone}}</b> потерял связь — лиды в этот канал сейчас не идут. Обычно лечится повторным сканом QR за минуту.</p>{{button}}{{note}}',
    body_en: '<p>Hi {{name}}, number <b>{{phone}}</b> lost connection — leads aren’t reaching this channel. A quick QR re-scan usually fixes it.</p>{{button}}{{note}}',
    note_ru: 'Пока номер офлайн, ИИ по нему не отвечает. Остальные каналы работают штатно.', note_en: 'While offline, AI won’t reply there. Your other channels keep running.', noteIcon: 'alert',
  },
  missedActivity: {
    name: 'Пропущенное / Missed activity', arch: 'channels', format: 'plain', titleSize: 27,
    category: 'channels', audience: 'broker', essential: false,
    eyebrow_ru: 'Не потеряйте', eyebrow_en: 'Don’t miss it',
    preheader_ru: '{{leadName}}: {{what}}', preheader_en: '{{leadName}}: {{what}}',
    subject_ru: '{{leadName}}: {{what}}', subject_en: '{{leadName}}: {{what}}',
    title_ru: '{{leadName}}: {{what}}', title_en: '{{leadName}}: {{what}}',
    body_ru: '<p><b>{{leadName}}</b> — {{what}}. ИИ придержал разговор, но живой ответ сейчас стоит дороже всего.</p>{{button}}',
    body_en: '<p><b>{{leadName}}</b> — {{what}}. AI held the conversation, but a human reply right now is worth the most.</p>{{button}}',
  },
  dailyDigest: {
    name: 'Сводка за день / Daily digest', arch: 'reports', format: 'stat', titleSize: 28,
    category: 'reports', audience: 'all', essential: false,
    eyebrow_ru: 'Сводка за день', eyebrow_en: 'Daily digest',
    preheader_ru: 'Что случилось за сутки в {{agency}}', preheader_en: 'What happened today in {{agency}}',
    subject_ru: 'Ваш день в цифрах — {{agency}}', subject_en: 'Your day in numbers — {{agency}}',
    title_ru: 'Ваш день в цифрах', title_en: 'Your day in numbers',
    body_ru: '<p>Здравствуйте, {{name}}! Пока вы занимались делом, Lumen считал. Вот сутки {{agency}} одним взглядом:</p>{{stats}}<p>Самое горячее ждёт внутри — стадии уже расставлены.</p>{{button}}',
    body_en: '<p>Hi {{name}}, while you were busy, Lumen was counting. Here’s {{agency}}’s day at a glance:</p>{{stats}}<p>The hottest ones are waiting inside.</p>{{button}}',
    stats_ru: [{ n: '{{leads}}', label: 'новых лида' }, { n: '{{replies}}', label: 'ответов ИИ' }, { n: '{{meetings}}', label: 'встречи' }],
    stats_en: [{ n: '{{leads}}', label: 'new leads' }, { n: '{{replies}}', label: 'AI replies' }, { n: '{{meetings}}', label: 'meetings' }],
  },
  weeklyReport: {
    name: 'Итоги недели / Weekly report', arch: 'reports', theme: 'dark', format: 'stat', hero: 'graph.gif', heroH: 230, titleSize: 31,
    category: 'reports', audience: 'owner', essential: false,
    eyebrow_ru: 'Итоги недели', eyebrow_en: 'Weekly report',
    preheader_ru: 'Неделя {{agency}} в цифрах', preheader_en: 'A week of {{agency}} in numbers',
    subject_ru: 'Неделя {{agency}}: цифры, которые приятно смотреть', subject_en: 'A week of {{agency}}: numbers worth a look',
    title_ru: 'Неделя {{agency}}<br>в цифрах', title_en: 'A week of {{agency}}<br>in numbers',
    body_ru: '<p>Здравствуйте, {{name}}! Неделя закрыта — вот как отработал Lumen для <b>{{agency}}</b>:</p>{{stats}}<p>Средний ответ ИИ — {{speed}}. Детальный разбор по брокерам и стадиям — внутри.</p>{{button}}',
    body_en: '<p>Hi {{name}}, the week’s in the books — here’s how Lumen performed:</p>{{stats}}<p>Average AI reply — {{speed}}. Full breakdown inside.</p>{{button}}',
    stats_ru: [{ n: '{{leads}}', label: 'лидов' }, { n: '{{qualified}}', label: 'квалифицировано' }, { n: '{{meetings}}', label: 'встреч' }],
    stats_en: [{ n: '{{leads}}', label: 'leads' }, { n: '{{qualified}}', label: 'qualified' }, { n: '{{meetings}}', label: 'meetings' }],
  },
  founderBrief: {
    name: 'Сигналы руководителю / Founder brief', arch: 'reports', theme: 'dark', hero: 'ring.gif', heroH: 230, titleSize: 30,
    category: 'reports', audience: 'owner', essential: false,
    eyebrow_ru: 'Штаб · сигналы', eyebrow_en: 'HQ · signals',
    preheader_ru: 'То, на что стоит взглянуть лично', preheader_en: 'The things worth your personal look',
    subject_ru: 'Штаб: {{count}} сигнала, которые стоит увидеть', subject_en: 'HQ: {{count}} signals worth your eyes',
    title_ru: 'Штаб: {{count}} сигнала', title_en: 'HQ: {{count}} signals',
    body_ru: '<p>Здравствуйте, {{name}}! Пульт собрал то, что обычно тонет в рутине — короткая сводка руководителю по <b>{{agency}}</b>:</p>{{features}}{{button}}',
    body_en: '<p>Hi {{name}}, the control desk surfaced what usually drowns in routine:</p>{{features}}{{button}}',
    features_ru: [{ icon: 'alert', title: '2 крупных лида ждут', sub: 'Отвечают дольше вашей нормы — стоит вмешаться.' }, { icon: 'chart', title: 'Конверсия просела', sub: 'У одного брокера показатели ниже обычного.' }, { icon: 'bell', title: 'Кабинет на грани', sub: '1 платёж по рекламе близок к задолженности.' }],
    features_en: [{ icon: 'alert', title: '2 big leads waiting', sub: 'Replying slower than your norm — worth a look.' }, { icon: 'chart', title: 'Conversion dipped', sub: 'One broker is below their usual numbers.' }, { icon: 'bell', title: 'Ad account on edge', sub: '1 ad payment is close to going into debt.' }],
  },
  academyTip: {
    name: 'Приём недели / Academy tip', arch: 'digest', hero: 'nodes.gif', heroH: 215, titleSize: 29,
    category: 'academy', audience: 'broker', essential: false,
    eyebrow_ru: 'Академия · приём недели', eyebrow_en: 'Academy · tip of the week',
    preheader_ru: 'Короткий приём, который поднимает конверсию', preheader_en: 'A short move that lifts conversion',
    subject_ru: 'Приём недели: {{tipTitle}}', subject_en: 'Tip of the week: {{tipTitle}}',
    title_ru: 'Приём недели', title_en: 'Tip of the week',
    body_ru: '<p>Здравствуйте, {{name}}! Один приём из Академии, который реально двигает сделки:</p>{{panel}}<p>Разобрано на реальных диалогах — загляните, это две минуты.</p>{{button}}',
    body_en: '<p>Hi {{name}}, one move from the Academy that actually moves deals:</p>{{panel}}<p>Broken down on real dialogues — take a look.</p>{{button}}',
    panel_ru: '«{{tipBody}}»', panel_en: '“{{tipBody}}”',
  },
  productUpdate: {
    name: 'Что нового / Product update', arch: 'product', theme: 'dark', hero: 'hero.gif', heroH: 230, titleSize: 31,
    category: 'product', audience: 'all', essential: false,
    eyebrow_ru: 'Что нового', eyebrow_en: 'What’s new',
    preheader_ru: 'Свежие апдейты Lumen', preheader_en: 'Fresh Lumen updates',
    subject_ru: '{{subject}}', subject_en: '{{subject}}',
    title_ru: '3 обновления,<br>которые уже у вас', title_en: '3 updates,<br>already live for you',
    body_ru: '<p>Здравствуйте, {{name}}! Пара свежих штук, которые уже работают в вашем Lumen:</p>{{features}}{{button}}',
    body_en: '<p>Hi {{name}}, a couple of fresh things already live in your Lumen:</p>{{features}}{{button}}',
    features_ru: [{ icon: 'bolt', title: 'Перенос задач в один тап', sub: '«Завтра / через неделю / конкретный день».' }, { icon: 'chat', title: 'Переводчик в Zoom', sub: 'RU → EN/IT синхронно прямо на созвоне.' }, { icon: 'chart', title: 'Сводка по брокерам', sub: 'Отдельный разрез в разделе «Штаб».' }],
    features_en: [{ icon: 'bolt', title: 'One-tap task reschedule', sub: '“Tomorrow / next week / a specific day”.' }, { icon: 'chat', title: 'Zoom interpreter', sub: 'RU → EN/IT live right on the call.' }, { icon: 'chart', title: 'Per-broker summary', sub: 'A dedicated cut in the “HQ” section.' }],
  },
  winback: {
    name: 'Возврат / Win-back', arch: 'marketing', theme: 'dark', hero: 'flow.gif', heroH: 240, titleSize: 32,
    category: 'marketing', audience: 'owner', essential: false,
    eyebrow_ru: 'Скучаем', eyebrow_en: 'We miss you',
    preheader_ru: 'Ваш ИИ-отдел продаж скучает', preheader_en: 'Your AI sales desk misses you',
    subject_ru: 'Пока вас не было, лиды не ждали', subject_en: 'While you were away, leads didn’t wait',
    title_ru: 'Пока вас не было,<br>лиды не ждали', title_en: 'While you were away,<br>leads didn’t wait',
    body_ru: '<p>Здравствуйте, {{name}}! Давно не виделись. Lumen подрос: быстрее отвечает, умнее квалифицирует, аккуратнее греет. <b>{{agency}}</b> ждёт — и первая неделя снова за наш счёт.</p>{{button}}',
    body_en: '<p>Hi {{name}}, long time. Lumen has grown: faster replies, sharper qualification. <b>{{agency}}</b> is waiting — first week on us again.</p>{{button}}',
  },
  /* ── ЛИДЫ (доп.) ── */
  hotLead: {
    name: 'Горячий лид / Hot lead', arch: 'leads', hero: 'flow.gif', heroH: 220, titleSize: 31,
    category: 'leads', audience: 'broker', essential: false,
    eyebrow_ru: 'Горячий лид', eyebrow_en: 'Hot lead',
    preheader_ru: 'ИИ квалифицировал — бюджет и намерение есть', preheader_en: 'AI qualified — budget and intent are there',
    subject_ru: 'Горячий лид: {{leadName}} готов говорить', subject_en: 'Hot lead: {{leadName}} is ready to talk',
    title_ru: 'Горячий лид<br>уже квалифицирован', title_en: 'A hot lead,<br>already qualified',
    body_ru: '<p>Здравствуйте, {{name}}! ИИ прогрел и квалифицировал заявку — бюджет и намерение подтверждены. Такие не ждут.</p>{{lead}}{{button}}{{note}}',
    body_en: '<p>Hi {{name}}, AI warmed up and qualified this lead — budget and intent confirmed. These don’t wait.</p>{{lead}}{{button}}{{note}}',
    note_ru: 'Позвоните первым — на горячей стадии выигрывает скорость.', note_en: 'Call first — at the hot stage, speed wins.', noteIcon: 'phone',
  },
  leadAssigned: {
    name: 'Лид назначен вам / Lead assigned', arch: 'leads', hero: 'inbox.gif', heroH: 210, titleSize: 30,
    category: 'leads', audience: 'broker', essential: false,
    eyebrow_ru: 'Ваш новый лид', eyebrow_en: 'Assigned to you',
    preheader_ru: '{{inviter}} передал вам лида', preheader_en: '{{inviter}} handed you a lead',
    subject_ru: 'Вам назначен лид: {{leadName}}', subject_en: 'A lead was assigned to you: {{leadName}}',
    title_ru: 'Лид теперь ваш', title_en: 'This lead is yours now',
    body_ru: '<p>Здравствуйте, {{name}}! <b>{{inviter}}</b> передал вам этого лида. Вся история переписки уже в карточке.</p>{{lead}}{{button}}',
    body_en: '<p>Hi {{name}}, <b>{{inviter}}</b> handed you this lead. The full chat history is already in the card.</p>{{lead}}{{button}}',
  },
  leadWon: {
    name: 'Сделка закрыта / Deal won', arch: 'leads', hero: 'trophy.gif', heroH: 235, titleSize: 32,
    category: 'leads', audience: 'all', essential: false,
    eyebrow_ru: 'Сделка закрыта', eyebrow_en: 'Deal won',
    preheader_ru: '{{leadName}} — сделка закрыта', preheader_en: '{{leadName}} — deal closed',
    subject_ru: 'Есть сделка! {{leadName}} закрыт', subject_en: 'It’s a deal! {{leadName}} is closed',
    title_ru: 'Есть сделка.<br>{{leadName}}', title_en: 'It’s a deal.<br>{{leadName}}',
    body_ru: '<p>Поздравляем, {{name}}! Лид дошёл до сделки — это ваша работа и немного нашего ИИ, который держал темп.</p>{{lead}}{{button}}{{note}}',
    body_en: '<p>Congrats, {{name}}! The lead went all the way — your work and a bit of our AI keeping the pace.</p>{{lead}}{{button}}{{note}}',
    note_ru: 'Запишите, что сработало — Академия соберёт из этого приём для команды.', note_en: 'Note what worked — the Academy will turn it into a play for the team.', noteIcon: 'spark',
  },
  /* ── ВСТРЕЧИ (доп.) ── */
  meetingCancelled: {
    name: 'Встреча отменена / Meeting cancelled', arch: 'digest', hero: 'calendar.gif', heroH: 210, titleSize: 29,
    category: 'meetings', audience: 'broker', essential: false,
    eyebrow_ru: 'Встреча отменена', eyebrow_en: 'Meeting cancelled',
    preheader_ru: '{{leadName}} — встреча отменена', preheader_en: '{{leadName}} — meeting cancelled',
    subject_ru: 'Встреча с {{leadName}} отменена', subject_en: 'Meeting with {{leadName}} was cancelled',
    title_ru: 'Встреча отменена', title_en: 'Meeting cancelled',
    body_ru: '<p>Здравствуйте, {{name}}! Встреча с <b>{{leadName}}</b> ({{when}}) отменена. Не теряем лида — предложите новое время, пока интерес не остыл.</p>{{button}}',
    body_en: '<p>Hi {{name}}, the meeting with <b>{{leadName}}</b> ({{when}}) was cancelled. Don’t lose the lead — offer a new time while interest is warm.</p>{{button}}',
  },
  meetingSummary: {
    name: 'Итоги встречи / Meeting summary', arch: 'digest', hero: 'calendar.gif', heroH: 210, titleSize: 29,
    category: 'meetings', audience: 'broker', essential: false,
    eyebrow_ru: 'После встречи', eyebrow_en: 'After the meeting',
    preheader_ru: 'ИИ собрал итоги и следующий шаг', preheader_en: 'AI collected the summary and next step',
    subject_ru: 'Итоги встречи с {{leadName}}', subject_en: 'Summary: meeting with {{leadName}}',
    title_ru: 'Итоги встречи', title_en: 'Meeting summary',
    body_ru: '<p>Здравствуйте, {{name}}! ИИ разобрал разговор с <b>{{leadName}}</b> и подсказал следующий шаг:</p>{{panel}}{{button}}',
    body_en: '<p>Hi {{name}}, AI reviewed your call with <b>{{leadName}}</b> and suggested the next step:</p>{{panel}}{{button}}',
    panel_ru: '«{{summary}}»', panel_en: '“{{summary}}”',
  },
  /* ── КАНАЛЫ (доп.) ── */
  callRecording: {
    name: 'Запись звонка / Call recording', arch: 'digest', hero: 'phone.gif', heroH: 210, titleSize: 29,
    category: 'channels', audience: 'broker', essential: false,
    eyebrow_ru: 'Звонок обработан', eyebrow_en: 'Call processed',
    preheader_ru: 'Запись и краткое резюме готовы', preheader_en: 'Recording and quick summary are ready',
    subject_ru: 'Звонок с {{leadName}}: запись и резюме', subject_en: 'Call with {{leadName}}: recording & summary',
    title_ru: 'Звонок разобран', title_en: 'Call, broken down',
    body_ru: '<p>Здравствуйте, {{name}}! Разговор с <b>{{leadName}}</b> ({{duration}}) записан, ИИ выделил суть:</p>{{panel}}{{button}}',
    body_en: '<p>Hi {{name}}, your call with <b>{{leadName}}</b> ({{duration}}) is recorded, AI pulled out the gist:</p>{{panel}}{{button}}',
    panel_ru: '«{{summary}}»', panel_en: '“{{summary}}”',
  },
  warmupComplete: {
    name: 'Прогрев завершён / Warm-up complete', arch: 'digest', hero: 'ring.gif', heroH: 210, titleSize: 29,
    category: 'channels', audience: 'owner', essential: false,
    eyebrow_ru: 'Номер прогрет', eyebrow_en: 'Number is warm',
    preheader_ru: '{{phone}} готов к боевому трафику', preheader_en: '{{phone}} is ready for real traffic',
    subject_ru: '{{phone}} прогрет — можно давать трафик', subject_en: '{{phone}} is warm — you can send traffic',
    title_ru: 'Номер прогрет<br>и готов', title_en: 'Number is warm<br>and ready',
    body_ru: '<p>Здравствуйте, {{name}}! Прогрев номера <b>{{phone}}</b> завершён — репутация набрана, риск блокировки минимален. Можно направлять живой трафик лидов.</p>{{button}}',
    body_en: '<p>Hi {{name}}, warm-up for <b>{{phone}}</b> is complete — reputation built, block risk is minimal. You can route live lead traffic now.</p>{{button}}',
  },
  /* ── ДОКУМЕНТЫ / DOCUMENTS ── */
  proposalViewed: {
    name: 'КП открыто клиентом / Proposal viewed', arch: 'documents', hero: 'doc.gif', heroH: 215, titleSize: 30,
    category: 'documents', audience: 'broker', essential: false,
    eyebrow_ru: 'КП открыто', eyebrow_en: 'Proposal opened',
    preheader_ru: '{{leadName}} смотрит ваше предложение', preheader_en: '{{leadName}} is viewing your proposal',
    subject_ru: '{{leadName}} открыл ваше КП', subject_en: '{{leadName}} opened your proposal',
    title_ru: 'Клиент смотрит КП<br>прямо сейчас', title_en: 'Your client is viewing<br>the proposal now',
    body_ru: '<p>Здравствуйте, {{name}}! <b>{{leadName}}</b> только что открыл предложение «{{docTitle}}». Лучший момент для касания — пока документ перед глазами.</p>{{button}}{{note}}',
    body_en: '<p>Hi {{name}}, <b>{{leadName}}</b> just opened the proposal “{{docTitle}}”. Best moment to reach out — while it’s on their screen.</p>{{button}}{{note}}',
    note_ru: 'Короткое «остались вопросы?» сейчас заходит лучше всего.', note_en: 'A short “any questions?” lands best right now.', noteIcon: 'chat',
  },
  documentSigned: {
    name: 'Документ подписан / Document signed', arch: 'documents', hero: 'doc.gif', heroH: 215, titleSize: 30,
    category: 'documents', audience: 'all', essential: false,
    eyebrow_ru: 'Подписано', eyebrow_en: 'Signed',
    preheader_ru: '{{leadName}} подписал {{docTitle}}', preheader_en: '{{leadName}} signed {{docTitle}}',
    subject_ru: '{{docTitle}} подписан клиентом {{leadName}}', subject_en: '{{docTitle}} signed by {{leadName}}',
    title_ru: 'Документ подписан', title_en: 'Document signed',
    body_ru: '<p>Здравствуйте, {{name}}! <b>{{leadName}}</b> подписал «{{docTitle}}». Копия сохранена в карточке сделки.</p>{{details}}{{button}}',
    body_en: '<p>Hi {{name}}, <b>{{leadName}}</b> signed “{{docTitle}}”. A copy is saved in the deal card.</p>{{details}}{{button}}',
  },
  invoiceSent: {
    name: 'Счёт выставлен / Invoice sent', arch: 'documents', hero: 'doc.gif', heroH: 200, titleSize: 29,
    category: 'documents', audience: 'all', essential: false,
    eyebrow_ru: 'Счёт клиенту', eyebrow_en: 'Invoice to client',
    preheader_ru: 'Счёт для {{leadName}} отправлен', preheader_en: 'Invoice for {{leadName}} was sent',
    subject_ru: 'Счёт для {{leadName}} отправлен', subject_en: 'Invoice for {{leadName}} was sent',
    title_ru: 'Счёт отправлен', title_en: 'Invoice sent',
    body_ru: '<p>Здравствуйте, {{name}}! Счёт для <b>{{leadName}}</b> сформирован и отправлен. Отследить оплату можно в карточке.</p>{{receipt}}{{button}}',
    body_en: '<p>Hi {{name}}, the invoice for <b>{{leadName}}</b> is created and sent. Track payment in the card.</p>{{receipt}}{{button}}',
    receiptCaption_ru: 'К оплате', receiptCaption_en: 'Due', receiptIcon: 'doc',
  },
  /* ── ЗАДАЧИ (доп.) ── */
  taskOverdue: {
    name: 'Задача просрочена / Task overdue', arch: 'tasks', format: 'plain', titleSize: 27,
    category: 'tasks', audience: 'broker', essential: false,
    eyebrow_ru: 'Просрочено', eyebrow_en: 'Overdue',
    preheader_ru: '{{taskTitle}} — срок прошёл', preheader_en: '{{taskTitle}} — past due',
    subject_ru: 'Просрочено: {{taskTitle}}', subject_en: 'Overdue: {{taskTitle}}',
    title_ru: 'Задача просрочена', title_en: 'Task overdue',
    body_ru: '<p>Срок по задаче уже прошёл:</p><p style="font-family:\'Cormorant Garamond\',Georgia,serif;font-size:24px;color:#141311">«{{taskTitle}}»</p><p style="color:#8b8983;font-size:13px">Закройте её или перенесите на реальную дату — одним тапом.</p>{{button}}',
    body_en: '<p>This task is past its due date:</p><p style="font-family:\'Cormorant Garamond\',Georgia,serif;font-size:24px;color:#141311">“{{taskTitle}}”</p><p style="color:#8b8983;font-size:13px">Close it or reschedule to a real date — one tap.</p>{{button}}',
  },
  /* ── ОТЧЁТЫ (доп.) ── */
  monthlyReport: {
    name: 'Итоги месяца / Monthly report', arch: 'reports', theme: 'dark', format: 'stat', hero: 'graph.gif', heroH: 235, titleSize: 31,
    category: 'reports', audience: 'owner', essential: false,
    eyebrow_ru: 'Итоги месяца', eyebrow_en: 'Monthly report',
    preheader_ru: 'Месяц {{agency}} в цифрах', preheader_en: 'A month of {{agency}} in numbers',
    subject_ru: 'Месяц {{agency}}: цифры и тренд', subject_en: 'A month of {{agency}}: numbers & trend',
    title_ru: 'Месяц {{agency}}<br>в цифрах', title_en: 'A month of {{agency}}<br>in numbers',
    body_ru: '<p>Здравствуйте, {{name}}! Месяц закрыт. Как Lumen отработал для <b>{{agency}}</b>:</p>{{stats}}<p>Рост к прошлому месяцу — {{growth}}. Полный разбор с динамикой — внутри.</p>{{button}}',
    body_en: '<p>Hi {{name}}, the month is closed. Here’s how Lumen performed for <b>{{agency}}</b>:</p>{{stats}}<p>Month-over-month growth — {{growth}}. Full breakdown inside.</p>{{button}}',
    stats_ru: [{ n: '{{leads}}', label: 'лидов' }, { n: '{{deals}}', label: 'сделок' }, { n: '{{revenue}}', label: 'выручка' }],
    stats_en: [{ n: '{{leads}}', label: 'leads' }, { n: '{{deals}}', label: 'deals' }, { n: '{{revenue}}', label: 'revenue' }],
  },
  /* ── ОПЛАТА (доп.) ── */
  planLimit: {
    name: 'Лимит тарифа / Plan limit', arch: 'billing', hero: 'graph.gif', heroH: 210, titleSize: 29,
    category: 'billing', audience: 'owner', essential: false,
    eyebrow_ru: 'Пора расти', eyebrow_en: 'Time to grow',
    preheader_ru: 'Достигнут лимит тарифа', preheader_en: 'You’ve hit your plan limit',
    subject_ru: 'Вы упёрлись в лимит — это хороший знак', subject_en: 'You hit the limit — that’s a good sign',
    title_ru: 'Уперлись в лимит<br>тарифа', title_en: 'You hit your<br>plan limit',
    body_ru: '<p>Здравствуйте, {{name}}! Вы достигли лимита тарифа по <b>{{limitOf}}</b> ({{used}}/{{limit}}). Это значит, что растёте — а Lumen готов расти с вами.</p>{{button}}{{note}}',
    body_en: '<p>Hi {{name}}, you’ve reached your plan limit on <b>{{limitOf}}</b> ({{used}}/{{limit}}). That means you’re growing — and Lumen is ready to grow with you.</p>{{button}}{{note}}',
    note_ru: 'До апгрейда новые {{limitOf}} не добавляются. Обновление занимает минуту.', note_en: 'Until you upgrade, new {{limitOf}} won’t be added. Upgrading takes a minute.', noteIcon: 'alert',
  },
  /* ── БЕЗОПАСНОСТЬ (доп.) ── */
  otpCode: {
    name: 'Код подтверждения / One-time code', arch: 'security', hero: 'shield.gif', heroH: 200, titleSize: 29,
    category: 'security', audience: 'all', essential: true,
    eyebrow_ru: 'Код входа', eyebrow_en: 'Sign-in code',
    preheader_ru: 'Ваш одноразовый код Lumen', preheader_en: 'Your one-time Lumen code',
    subject_ru: 'Ваш код входа в Lumen: {{otp}}', subject_en: 'Your Lumen sign-in code: {{otp}}',
    title_ru: 'Код подтверждения', title_en: 'Your one-time code',
    body_ru: '<p>Здравствуйте, {{name}}! Введите код, чтобы подтвердить вход. Он действует несколько минут.</p>{{code}}{{note}}',
    body_en: '<p>Hi {{name}}, enter this code to confirm your sign-in. It’s valid for a few minutes.</p>{{code}}{{note}}',
    note_ru: 'Никому не сообщайте код. Мы никогда не спросим его в переписке.', note_en: 'Never share this code. We’ll never ask for it in chat.', noteIcon: 'lock',
  },
  notification: {
    name: 'Уведомление / Notification', arch: 'digest', hero: 'flow.gif', heroH: 200, titleSize: 28,
    category: 'account', audience: 'all', essential: false,
    subject_ru: 'Lumen: {{title}}', subject_en: 'Lumen: {{title}}',
    title_ru: '{{title}}', title_en: '{{title}}',
    body_ru: '<p>Здравствуйте, {{name}}!</p><p>{{message}}</p>{{button}}',
    body_en: '<p>Hi {{name}},</p><p>{{message}}</p>{{button}}',
  },
  exportReady: {
    name: 'Выгрузка готова / Export ready', arch: 'account', format: 'plain', titleSize: 27,
    category: 'account', audience: 'all', essential: false,
    eyebrow_ru: 'Готово', eyebrow_en: 'Ready',
    preheader_ru: 'Ваш файл выгрузки готов', preheader_en: 'Your export file is ready',
    subject_ru: 'Ваша выгрузка готова к скачиванию', subject_en: 'Your export is ready to download',
    title_ru: 'Выгрузка готова', title_en: 'Export ready',
    body_ru: '<p>Файл <b>{{fileName}}</b> собран и ждёт. Ссылка активна ограниченное время — сохраните файл к себе.</p>{{button}}',
    body_en: '<p>Your file <b>{{fileName}}</b> is ready. The link is active for a limited time — save it locally.</p>{{button}}',
  },
  marketing: {
    name: 'Маркетинг / Marketing', arch: 'digest', hero: 'flow.gif', heroH: 235, titleSize: 31,
    category: 'marketing', audience: 'all', essential: false,
    subject_ru: '{{subject}}', subject_en: '{{subject}}',
    title_ru: '{{subject}}', title_en: '{{subject}}',
    body_ru: '<p>Здравствуйте, {{name}}!</p><p>{{message}}</p>{{button}}<p style="color:#8b8983;font-size:12px;margin-top:18px">Не хотите получать такие письма? <a href="{{unsubscribe}}" style="color:#8b8983;text-decoration:underline">Отписаться</a>.</p>',
    body_en: '<p>Hi {{name}},</p><p>{{message}}</p>{{button}}<p style="color:#8b8983;font-size:12px;margin-top:18px">Don’t want these? <a href="{{unsubscribe}}" style="color:#8b8983;text-decoration:underline">Unsubscribe</a>.</p>',
  },
};

const EMAIL_CATEGORIES = {
  account: { ru: 'Аккаунт', en: 'Account' }, security: { ru: 'Безопасность', en: 'Security' }, billing: { ru: 'Оплата и подписка', en: 'Billing' }, leads: { ru: 'Лиды', en: 'Leads' }, meetings: { ru: 'Встречи', en: 'Meetings' }, tasks: { ru: 'Задачи', en: 'Tasks' }, team: { ru: 'Команда', en: 'Team' }, channels: { ru: 'Каналы (WhatsApp / звонки)', en: 'Channels (WhatsApp / calls)' }, documents: { ru: 'Документы (КП, договоры, счета)', en: 'Documents (proposals, contracts, invoices)' }, reports: { ru: 'Отчёты и сводки', en: 'Reports & digests' }, academy: { ru: 'Академия', en: 'Academy' }, product: { ru: 'Обновления продукта', en: 'Product updates' }, partner: { ru: 'Партнёрская программа', en: 'Partner program' }, marketing: { ru: 'Рассылки и предложения', en: 'Newsletters & offers' },
};

function getTemplates(registry) {
  registry.emailTemplates = registry.emailTemplates || {};
  const out = {}; for (const k of Object.keys(DEFAULT_TEMPLATES)) out[k] = Object.assign({}, DEFAULT_TEMPLATES[k], registry.emailTemplates[k] || {}); return out;
}
function emailMeta(key) { const t = DEFAULT_TEMPLATES[key]; if (!t) return null; return { key, name: t.name, category: t.category || 'account', audience: t.audience || 'all', essential: !!t.essential, arch: t.arch, theme: t.theme || 'light', format: t.format || t.arch }; }
function emailCatalog() { return Object.keys(DEFAULT_TEMPLATES).map(emailMeta); }
function defaultNotifyPrefs() { const p = {}; for (const c of Object.keys(EMAIL_CATEGORIES)) p[c] = true; return p; }
function canReceive(key, user, prefs) {
  const m = emailMeta(key); if (!m) return false;
  user = user || {}; const isOwner = !!user.isOwner || user.role === 'owner' || user.role === 'master';
  if (m.audience === 'owner' && !isOwner) return false;
  if (m.essential) return true;
  return (prefs || {})[m.category] !== false;
}
function interpolate(str, vars) { return String(str || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars && vars[k] != null) ? vars[k] : ''); }

function renderTemplate(registry, key, vars, lang) {
  const t = getTemplates(registry)[key] || DEFAULT_TEMPLATES.notification;
  lang = lang === 'en' ? 'en' : 'ru'; const en = lang === 'en';
  const isDark = t.theme === 'dark'; const T = isDark ? D : C;
  const v = Object.assign({}, vars);

  if (v.button == null && v.link) v.button = emailButton(v.link, v.buttonLabel || (en ? 'Open Lumen' : 'Открыть Lumen'), { ghost: !!v.buttonGhost, T, wide: v.buttonWide !== false });
  if (v.button == null) v.button = '';
  if (v.note == null) { const nraw = t['note_' + lang] || t.note_ru; v.note = nraw ? emailFootnote(t.noteIcon || 'spark', interpolate(nraw, v), T) : ''; }
  if (v.panel == null) { const p = interpolate(t['panel_' + lang] || t.panel_ru || '', v); v.panel = p ? emailPanel(esc(p), false, T) : ''; }
  if (v.features == null) { const f = t['features_' + lang] || t.features_ru; v.features = Array.isArray(f) ? emailFeatureList(f.map(x => ({ icon: x.icon, title: interpolate(x.title, v), sub: interpolate(x.sub, v) })), T) : ''; }
  if (v.bullets == null) { const b = t['bullets_' + lang] || t.bullets_ru; v.bullets = Array.isArray(b) ? emailBullets(b.map(x => interpolate(esc(x), v)), T) : ''; }
  if (v.details == null) {
    if (v.detailRows) v.details = emailDetails(v.detailRows, T);
    else if (t.arch === 'security') v.details = emailDetails([[en ? 'Time' : 'Время', v.time || new Date().toLocaleString(en ? 'en-GB' : 'ru-RU')], [en ? 'Device' : 'Устройство', v.device || (en ? 'Browser · Chrome' : 'Браузер · Chrome')], [en ? 'Location' : 'Локация', v.location || '—'], ['IP', v.ip || '—']], T);
    else if (t.category === 'meetings') v.details = emailDetails([[en ? 'Lead' : 'Лид', v.leadName || '—'], [en ? 'When' : 'Когда', v.when || '—'], [en ? 'Format' : 'Формат', v.format2 || 'Zoom']], T);
    else if (t.arch === 'documents') v.details = emailDetails([[en ? 'Document' : 'Документ', v.docTitle || '—'], [en ? 'Client' : 'Клиент', v.leadName || '—'], [en ? 'Date' : 'Дата', v.signedAt || new Date().toLocaleDateString(en ? 'en-GB' : 'ru-RU')]], T);
    else v.details = '';
  }
  if (v.code == null) v.code = v.otp ? emailCode(v.otp, T) : '';
  if (v.info == null) { v.info = (key === 'verifyEmail') ? emailInfoGrid([{ icon: 'mail', label: en ? 'Your e-mail' : 'Ваш e-mail', value: v.email || '—' }, { icon: 'user', label: en ? 'Account' : 'Аккаунт', value: v.agency || '—' }], T) : ''; }
  if (v.receipt == null || v.invoice == null) {
    const isBill = t.arch === 'billing'; const wantsReceipt = isBill || t.receiptCaption_ru || key === 'invoiceSent';
    const rows = v.invoiceRows || (isBill
      ? [[(en ? 'Plan' : 'Тариф'), v.plan || 'Lumen Pro'], [(en ? 'Period' : 'Период'), v.period || (en ? 'monthly' : 'месяц')], [(en ? 'Agency' : 'Агентство'), v.agency || '—']]
      : [[(en ? 'Document' : 'Документ'), v.docTitle || (en ? 'Invoice' : 'Счёт')], [(en ? 'Client' : 'Клиент'), v.leadName || '—']]);
    const rc = wantsReceipt ? emailReceipt({ T, amount: v.amount || '€99', caption: interpolate(t['receiptCaption_' + lang] || t.receiptCaption_ru || (en ? 'Paid' : 'Оплачено'), v), icon: t.receiptIcon || 'check', rows }) : '';
    if (v.receipt == null) v.receipt = rc; if (v.invoice == null) v.invoice = rc;
  }
  if (v.avatar == null) { v.avatar = (t.arch === 'team') ? emailAvatar({ name: v.inviter || v.name || 'Lumen', role: en ? 'invites you to the team' : 'приглашает в команду', workspaceLabel: en ? 'Workspace' : 'Рабочее пространство', workspace: v.agency || '' }, T) : ''; }
  if (v.stats == null) { const st = t['stats_' + lang] || t.stats_ru; v.stats = Array.isArray(st) ? emailStatGrid(st.map(s => ({ n: interpolate(String(s.n), v) || '0', label: interpolate(String(s.label), v) })), T) : ''; }
  if (v.lead == null) { v.lead = (t.category === 'leads' && t.arch === 'leads') ? emailLeadCard({ T, icon: 'home', label: en ? 'Request' : 'Запрос', name: v.leadRequest || v.leadName || (en ? 'New lead' : 'Новый лид'), cols: [[(en ? 'Budget' : 'Бюджет'), v.leadBudget || '—'], [(en ? 'Received' : 'Поступила'), v.leadWhen || (en ? 'just now' : 'только что')]], status: v.leadStatus || (en ? 'AI is qualifying' : 'ИИ уточняет детали') }, T) : ''; }

  const subject = interpolate(t['subject_' + lang] || t.subject_ru, v);
  const inner = interpolate(t['body_' + lang] || t.body_ru, v);
  const rawTitle = t['title_' + lang] || t.title_ru || v.title || subject;
  const title = interpolate(rawTitle, v); /* заголовок может содержать <br> — не эскейпим */
  const opt = {
    theme: isDark ? 'dark' : 'light', plain: t.format === 'plain',
    eyebrow: interpolate(t['eyebrow_' + lang] || t.eyebrow_ru || '', v) || null,
    preheader: interpolate(t['preheader_' + lang] || t.preheader_ru || '', v) || null,
    headerNote: interpolate(t['headerNote_' + lang] || t.headerNote_ru || '', v) || null,
    hero: (t.hero && t.format !== 'plain') ? { src: (t.hero.indexOf('://') > -1 ? t.hero : ART + '/' + t.hero), h: t.heroH || 230 } : null,
    titleSize: t.titleSize || null,
    manageNote: (t.essential ? null : (v.manageUrl ? `<a href="${esc(v.manageUrl)}" style="color:${T.ink3};text-decoration:underline;">${en ? 'Manage emails' : 'Настроить письма'}</a>` : null)),
  };
  return { subject, html: emailWrap(title, inner, lang, opt), meta: emailMeta(key) };
}

function platformEmailCfg(registry) { return { key: (registry.email && registry.email.key) || process.env.RESEND_API_KEY || '', from: (registry.email && registry.email.from) || process.env.RESEND_FROM || 'Lumen <onboarding@resend.dev>' }; }
async function sendViaResend(cfg, to, subject, html, attachments) {
  if (!cfg.key) return { ok: false, error: 'Resend не настроен (нет API-ключа)' };
  if (!to) return { ok: false, error: 'нет адреса получателя' };
  try {
    const payload = { from: cfg.from, to, subject, html };
    /* вложения: [{filename, content: base64}] (Resend-формат) */
    if (Array.isArray(attachments) && attachments.length) payload.attachments = attachments.map(a => ({ filename: a.filename, content: a.content }));
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!r.ok) { const t = await r.text().catch(() => ''); return { ok: false, error: 'Resend ' + r.status + (t ? ': ' + t.slice(0, 160) : '') }; }
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = {
  emailWrap, emailButton, emailPanel, emailBullets, emailFeatureList, emailCode, emailDetails, emailInvoice, emailReceipt, emailAvatar, emailInfoGrid, emailFootnote, emailStatGrid, emailLeadCard, svgIcon, iconChip,
  DEFAULT_TEMPLATES, EMAIL_CATEGORIES, getTemplates, emailMeta, emailCatalog, defaultNotifyPrefs, canReceive,
  renderTemplate, interpolate, platformEmailCfg, sendViaResend, ART, C, D, pal,
};
