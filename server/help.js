/* ============================================================================
   Lumen · публичный справочник (help center). Server-render из общего источника
   (../public/guides-data.js). Каждая статья — отдельный чистый URL с OG-мета,
   чтобы ссылка красиво разворачивалась в любом чате. Без авторизации.
   Роуты (в server/index.js): /help, /help/c/:cat, /help/:slug.
   ============================================================================ */
const { GUIDES, CATEGORIES } = require('../public/guides-data.js');
let RICH = {}; try { RICH = require('../public/guides-rich.js') || {}; } catch (e) { RICH = {}; }  // rich иллюстрированные гайды (мокапы+скриншоты)

const OG_IMAGE = '/assets/site/niche-dubai-poster.jpg';   // брендовый ландшафт для превью ссылок

const ICONS = {
  chat: '<path d="M21 11.5a7.5 7.5 0 01-10.9 6.7L4 20l1.8-5.1A7.5 7.5 0 1121 11.5z"/>',
  cal: '<rect x="3.5" y="4.5" width="17" height="16" rx="2"/><path d="M3.5 9h17M8 3v3M16 3v3"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5a7.5 7.5 0 0115 0"/>',
  chain: '<path d="M9 15l6-6M10.5 6.5l1.8-1.8a4 4 0 015.6 5.6l-2 2M13.5 17.5l-1.8 1.8a4 4 0 01-5.6-5.6l2-2"/>',
  doc: '<path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16l3-4 3 2 4-6"/>',
  phone: '<path d="M6 3h3l1.6 5-2 1.2a11 11 0 005.2 5.2l1.2-2 5 1.6v3a2 2 0 01-2.2 2A16 16 0 014 5.2 2 2 0 016 3z"/>',
  spark: '<path d="M12 3l1.7 5.1a2 2 0 001.2 1.2L20 11l-5.1 1.7a2 2 0 00-1.2 1.2L12 19l-1.7-5.1a2 2 0 00-1.2-1.2L4 11l5.1-1.7a2 2 0 001.2-1.2z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  book: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 19a2 2 0 012-2h13"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
};
const ic = (k, sw = 1.7) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ICONS.doc}</svg>`;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const strip = (s) => String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const catOf = (slug) => CATEGORIES.find(c => c.guides.includes(slug));

function head(opts) {
  const base = (opts.base || '').replace(/\/$/, '');
  const url = base + opts.path;
  const img = /^https?:/.test(OG_IMAGE) ? OG_IMAGE : base + OG_IMAGE;
  const title = esc(opts.title);
  const desc = esc(opts.desc || 'Пошаговые инструкции по функциям Lumen — AI-CRM для недвижимости.');
  return `<!doctype html><html lang="ru"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" type="image/svg+xml" href="/logo.svg">
<meta property="og:type" content="article"><meta property="og:site_name" content="Lumen · Справочник">
<meta property="og:title" content="${title}"><meta property="og:description" content="${desc}">
<meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${desc}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,500;0,600;1,500;1,600&family=Manrope:wght@300;400;500;600;700&display=swap" rel="stylesheet">
${opts.rich ? '<link rel="stylesheet" href="/guides.css?v=1">' : ''}
<style>${CSS}</style>
</head><body>`;
}

const CSS = `
:root{--bg:#080807;--bg2:#0f0e0c;--panel:rgba(255,255,255,.02);--line:rgba(214,199,168,.14);--line2:rgba(255,255,255,.08);--gold:#d6c7a8;--gold2:#c9a25a;--ink:#f4f3f1;--mut:#8b8a87;--mut2:#6b6a68}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--ink);font-family:'Manrope',system-ui,-apple-system,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.wrap{max-width:1120px;margin:0 auto;padding:0 24px}
.topbar{position:sticky;top:0;z-index:20;background:rgba(8,8,7,.82);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.topbar-in{display:flex;align-items:center;gap:16px;height:64px}
.brand{display:flex;align-items:center;gap:10px;font-family:'Cormorant',Georgia,serif;font-size:22px;font-weight:600}
.brand svg{width:22px;height:22px;color:var(--gold)}
.brand b{font-weight:600}.brand span{color:var(--mut);font-family:'Manrope';font-size:12px;font-weight:500;letter-spacing:.22em;text-transform:uppercase}
.tb-spacer{flex:1}
.tb-cta{display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:#141311;background:linear-gradient(180deg,#f3ecdd,#e6dcc4);padding:9px 18px;border-radius:999px;transition:transform .3s cubic-bezier(.19,1,.22,1),box-shadow .3s}
.tb-cta:hover{transform:translateY(-1px);box-shadow:0 12px 30px -12px rgba(214,199,168,.5)}
.tb-cta svg{width:15px;height:15px}
/* hero */
.hero{padding:72px 0 40px;text-align:center;position:relative;overflow:hidden}
.hero:before{content:"";position:absolute;top:-30%;left:50%;transform:translateX(-50%);width:900px;height:520px;background:radial-gradient(ellipse at center,rgba(214,199,168,.10),transparent 65%);pointer-events:none}
.eyebrow{font-size:12px;font-weight:500;letter-spacing:.24em;text-transform:uppercase;color:var(--mut);margin-bottom:16px;display:inline-flex;align-items:center;gap:8px}
.eyebrow svg{width:15px;height:15px;color:var(--gold)}
h1.title{font-family:'Cormorant',Georgia,serif;font-size:clamp(40px,6vw,64px);font-weight:600;letter-spacing:-.01em;line-height:1.02;text-wrap:balance}
.lead{max-width:560px;margin:16px auto 0;color:var(--mut);font-weight:300;font-size:17px}
/* search */
.search{max-width:560px;margin:30px auto 0;position:relative}
.search svg{position:absolute;left:18px;top:50%;transform:translateY(-50%);width:18px;height:18px;color:var(--mut)}
.search input{width:100%;padding:15px 18px 15px 48px;border-radius:14px;border:1px solid var(--line);background:var(--panel);color:var(--ink);font-size:15px;font-family:inherit;outline:none;transition:.3s}
.search input:focus{border-color:rgba(214,199,168,.5);background:rgba(255,255,255,.03)}
.search input::placeholder{color:var(--mut2)}
/* categories */
.cats{padding:20px 0 90px}
.cat{margin-top:52px}
.cat-h{display:flex;align-items:center;gap:14px;margin-bottom:20px}
.cat-ic{flex:0 0 auto;width:46px;height:46px;border-radius:13px;display:flex;align-items:center;justify-content:center;color:#e6d4a8;border:1px solid rgba(214,199,168,.3);background:radial-gradient(120% 120% at 30% 20%,rgba(214,199,168,.16),rgba(214,199,168,.04));box-shadow:0 10px 26px -14px rgba(201,168,106,.5),inset 0 1px 0 rgba(255,255,255,.12)}
.cat-ic svg{width:23px;height:23px}
.cat-h b{display:block;font-family:'Cormorant',Georgia,serif;font-size:27px;font-weight:600;letter-spacing:-.01em}
.cat-h i{display:block;font-style:normal;font-size:14px;color:var(--mut);font-weight:300;margin-top:2px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
.card{display:flex;align-items:flex-start;gap:14px;padding:20px 22px;border-radius:16px;border:1px solid var(--line);background:var(--panel);transition:transform .4s cubic-bezier(.19,1,.22,1),border-color .35s,background .35s}
.card:hover{transform:translateY(-3px);border-color:rgba(214,199,168,.42);background:rgba(214,199,168,.03)}
.card-ic{flex:0 0 auto;width:40px;height:40px;border-radius:11px;display:flex;align-items:center;justify-content:center;color:var(--gold);border:1px solid rgba(214,199,168,.22);background:rgba(214,199,168,.05)}
.card-ic svg{width:20px;height:20px}
.card-tx{flex:1;min-width:0}
.card-tx b{display:block;font-size:16px;font-weight:600;color:var(--ink);letter-spacing:-.01em}
.card-tx i{display:block;font-style:normal;font-size:13.5px;color:var(--mut);font-weight:300;line-height:1.5;margin-top:4px}
.card-go{flex:0 0 auto;color:var(--mut2);align-self:center;transition:transform .3s,color .3s}
.card-go svg{width:18px;height:18px}
.card:hover .card-go{color:var(--gold);transform:translateX(3px)}
.empty{text-align:center;color:var(--mut);padding:60px 0;font-weight:300;display:none}
/* article */
.crumb{display:flex;align-items:center;gap:9px;flex-wrap:wrap;font-size:13px;color:var(--mut);padding:34px 0 0}
.crumb a:hover{color:var(--gold)}
.crumb .sep{opacity:.5}
.crumb .cur{color:var(--ink)}
.art{padding:22px 0 90px;display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:56px;align-items:start}
.art-main{min-width:0}
.art-head{display:flex;align-items:flex-start;gap:16px;padding-bottom:26px;border-bottom:1px solid var(--line);margin-bottom:30px}
.art-ic{flex:0 0 auto;width:56px;height:56px;border-radius:15px;display:flex;align-items:center;justify-content:center;color:#e6d4a8;border:1px solid rgba(214,199,168,.3);background:radial-gradient(120% 120% at 30% 20%,rgba(214,199,168,.16),rgba(214,199,168,.04));box-shadow:0 12px 30px -14px rgba(201,168,106,.5),inset 0 1px 0 rgba(255,255,255,.12)}
.art-ic svg{width:27px;height:27px}
.art-head h1{font-family:'Cormorant',Georgia,serif;font-size:clamp(30px,4.4vw,42px);font-weight:600;letter-spacing:-.01em;line-height:1.05}
.art-head p{color:var(--mut);font-weight:300;font-size:15px;margin-top:6px}
.intro{font-size:17px;line-height:1.7;color:#d9d7d2;font-weight:300;margin-bottom:14px}
.intro b{color:var(--ink);font-weight:600}
.sec{margin-top:38px}
.sec-h{font-size:13px;font-weight:600;letter-spacing:.04em;color:var(--gold);text-transform:none;padding-bottom:12px;margin-bottom:18px;border-bottom:1px solid var(--line)}
.step{display:flex;gap:16px;padding:14px 0}
.step+.step{border-top:1px solid var(--line2)}
.step-n{flex:0 0 auto;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:var(--gold);border:1px solid rgba(214,199,168,.35);background:rgba(214,199,168,.06)}
.step-tx b{display:block;font-size:15.5px;font-weight:600;color:var(--ink);margin-bottom:3px}
.step-tx span{display:block;font-size:14.5px;color:var(--mut);font-weight:300;line-height:1.6}
.step-tx b,.step-tx span{overflow-wrap:anywhere}
.step-tx code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.88em;background:rgba(214,199,168,.1);border:1px solid var(--line);border-radius:6px;padding:1px 6px;color:#e7dcc4}
.step-tx b code{font-weight:500}
.art-img{margin-top:30px;border-radius:16px;overflow:hidden;border:1px solid var(--line)}
.art-img img{width:100%;display:block;cursor:zoom-in}
/* мокапы/rich-контент */
.art-mock{margin:22px 0;display:flex;justify-content:center;flex-wrap:wrap;gap:16px}
.gd-rich{margin-top:14px}
.gd-rich img{cursor:zoom-in}
/* лайтбокс для скриншотов/мокапов */
.lb{position:fixed;inset:0;z-index:200;display:none;align-items:center;justify-content:center;padding:32px;background:rgba(6,6,5,.86);cursor:zoom-out}
.lb.on{display:flex}
.lb img{max-width:96vw;max-height:92vh;border-radius:14px;box-shadow:0 40px 90px -30px rgba(0,0,0,.8)}
.outro{margin-top:38px;display:flex;gap:12px;align-items:flex-start;padding:20px 22px;border-radius:16px;border:1px solid rgba(214,199,168,.22);background:rgba(214,199,168,.04);font-size:14.5px;line-height:1.65;color:#cfc6b6;font-weight:300}
.outro b{color:var(--ink);font-weight:600}
.outro svg{flex:0 0 auto;width:18px;height:18px;color:var(--gold);margin-top:2px}
/* aside */
.aside{position:sticky;top:88px}
.aside-box{border:1px solid var(--line);border-radius:16px;background:var(--panel);padding:18px 20px}
.aside-box+.aside-box{margin-top:16px}
.aside-t{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--mut2);margin-bottom:12px}
.share-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:11px;border-radius:11px;border:1px solid rgba(214,199,168,.35);background:rgba(214,199,168,.06);color:var(--gold);font-size:14px;font-weight:600;font-family:inherit;cursor:pointer;transition:.25s}
.share-btn:hover{background:rgba(214,199,168,.12)}
.share-btn svg{width:15px;height:15px}
.rel a{display:flex;align-items:center;gap:10px;padding:9px 0;font-size:14px;color:var(--mut);transition:.25s;border-top:1px solid var(--line2)}
.rel a:first-child{border-top:0}
.rel a:hover{color:var(--ink)}
.rel a.on{color:var(--gold);font-weight:600}
.rel a svg{width:14px;height:14px;flex:0 0 auto;opacity:.6}
/* cta band */
.band{margin-top:20px;border-top:1px solid var(--line)}
.band-in{text-align:center;padding:64px 0}
.band-in h2{font-family:'Cormorant',Georgia,serif;font-size:clamp(28px,4vw,40px);font-weight:600;letter-spacing:-.01em}
.band-in p{color:var(--mut);font-weight:300;margin:12px auto 26px;max-width:460px}
.foot{border-top:1px solid var(--line);color:var(--mut2);font-size:13px;font-weight:300}
.foot-in{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:28px 0}
.foot-in .tb-spacer{flex:1}
.foot a:hover{color:var(--gold)}
@media(max-width:860px){.art{grid-template-columns:1fr;gap:34px}.aside{position:static}.brand span{display:none}}
@media(max-width:520px){.hero{padding:48px 0 30px}.grid{grid-template-columns:1fr}}
`;

function topbar(base) {
  return `<header class="topbar"><div class="wrap topbar-in">
    <a class="brand" href="/help"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">${ICONS.spark}</svg><b>Lumen</b><span>Справочник</span></a>
    <div class="tb-spacer"></div>
    <a class="tb-cta" href="/">Открыть Lumen ${ic('arrow', 2)}</a>
  </div></header>`;
}
function foot() {
  return `<footer class="foot"><div class="wrap foot-in">
    <span>© Lumen · AI-CRM для недвижимости</span><div class="tb-spacer"></div>
    <a href="/help">Справочник</a><a href="/privacy">Конфиденциальность</a><a href="/">Войти</a>
  </div></footer>`;
}
function cardHTML(slug) {
  const g = GUIDES[slug]; if (!g) return '';
  return `<a class="card" href="/help/${slug}" data-search="${esc((strip(g.title) + ' ' + strip(g.tagline) + ' ' + strip(g.intro)).toLowerCase())}">
    <span class="card-ic">${ic(g.icon || 'doc')}</span>
    <span class="card-tx"><b>${esc(g.title)}</b><i>${esc(g.tagline || '')}</i></span>
    <span class="card-go">${ic('arrow', 2)}</span>
  </a>`;
}

function renderLanding(base) {
  const cats = CATEGORIES.map(c => `<section class="cat" data-cat="${c.key}">
    <div class="cat-h"><span class="cat-ic">${ic(c.icon || 'doc')}</span><div><b>${esc(c.title)}</b><i>${esc(c.desc || '')}</i></div></div>
    <div class="grid">${c.guides.map(cardHTML).join('')}</div>
  </section>`).join('');
  const total = CATEGORIES.reduce((n, c) => n + c.guides.length, 0);
  const body = `${topbar(base)}
  <section class="hero"><div class="wrap">
    <div class="eyebrow">${ic('book')} База знаний</div>
    <h1 class="title">Справочник Lumen</h1>
    <p class="lead">${total} пошаговых инструкций по функциям CRM — подключение каналов, работа с лидами, документы и автоматизация.</p>
    <div class="search">${ic('search')}<input id="q" type="search" placeholder="Поиск по инструкциям…" autocomplete="off"></div>
  </div></section>
  <div class="wrap cats" id="cats">${cats}<div class="empty" id="empty">Ничего не нашлось. Попробуйте другой запрос.</div></div>
  ${foot()}
  <script>
    var q=document.getElementById('q'),cards=[].slice.call(document.querySelectorAll('.card')),cats=[].slice.call(document.querySelectorAll('.cat')),empty=document.getElementById('empty');
    q.addEventListener('input',function(){var v=q.value.trim().toLowerCase();var any=false;
      cards.forEach(function(c){var hit=!v||c.getAttribute('data-search').indexOf(v)>-1;c.style.display=hit?'':'none';if(hit)any=true;});
      cats.forEach(function(s){var vis=[].slice.call(s.querySelectorAll('.card')).some(function(c){return c.style.display!=='none';});s.style.display=vis?'':'none';});
      empty.style.display=any?'none':'block';
    });
  </script>`;
  return head({ base, path: '/help', title: 'Справочник Lumen — инструкции по CRM', desc: 'База знаний Lumen: пошаговые инструкции по подключению каналов, работе с лидами, документам и автоматизации.' }) + body + '</body></html>';
}

function renderCategory(catKey, base) {
  const c = CATEGORIES.find(x => x.key === catKey);
  if (!c) return null;
  const body = `${topbar(base)}
  <div class="wrap"><div class="crumb"><a href="/help">Справочник</a><span class="sep">/</span><span class="cur">${esc(c.title)}</span></div></div>
  <section class="hero" style="padding:34px 0 26px"><div class="wrap">
    <div class="eyebrow">${ic(c.icon || 'doc')} Категория</div>
    <h1 class="title" style="font-size:clamp(34px,5vw,52px)">${esc(c.title)}</h1>
    <p class="lead">${esc(c.desc || '')}</p>
  </div></section>
  <div class="wrap cats"><div class="grid">${c.guides.map(cardHTML).join('')}</div></div>
  ${foot()}`;
  return head({ base, path: '/help/c/' + catKey, title: c.title + ' — Справочник Lumen', desc: c.desc }) + body + '</body></html>';
}

function renderArticle(slug, base) {
  const g = GUIDES[slug]; if (!g) return null;
  const cat = catOf(slug);
  const richFn = RICH[slug];
  const richHtml = typeof richFn === 'function' ? (function () { try { return richFn(); } catch (e) { return ''; } })() : '';
  const stepHTML = (s, i) => `<div class="step"><span class="step-n">${i + 1}</span><div class="step-tx"><b>${s[0]}</b><span>${s[1]}</span></div></div>`;
  const secHTML = (sec) => `<div class="sec"><div class="sec-h">${esc(sec.badge || '')}</div>${(sec.steps || []).map(stepHTML).join('')}${sec.shot ? `<div class="art-mock">${sec.shot}</div>` : ''}</div>`;
  const rel = cat ? cat.guides.map(k => `<a href="/help/${k}" class="${k === slug ? 'on' : ''}">${ic('arrow', 2)}${esc(GUIDES[k].title)}</a>`).join('') : '';
  /* rich-гайд (мокапы+скриншоты) рендерим целиком; иначе — структурные шаги + диаграмма/мокапы из данных */
  const main = richHtml
    ? `<div class="intro">${g.intro || ''}</div><div class="gd-rich">${richHtml}</div>`
    : `<div class="intro">${g.intro || ''}</div>
       ${g.diagram ? `<div class="art-mock art-diagram">${g.diagram}</div>` : ''}
       ${(g.sections || []).map(secHTML).join('')}
       ${g.img ? `<div class="art-img"><img src="${esc(g.img)}" alt="" onerror="this.parentNode.style.display='none'"></div>` : ''}
       ${g.outro ? `<div class="outro">${ic('spark')}<span>${g.outro}</span></div>` : ''}`;
  const body = `${topbar(base)}
  <div class="wrap"><div class="crumb">
    <a href="/help">Справочник</a><span class="sep">/</span>
    ${cat ? `<a href="/help/c/${cat.key}">${esc(cat.title)}</a><span class="sep">/</span>` : ''}
    <span class="cur">${esc(g.title)}</span>
  </div></div>
  <div class="wrap art">
    <article class="art-main">
      <div class="art-head"><span class="art-ic">${ic(g.icon || 'doc')}</span><div><h1>${esc(g.title)}</h1><p>${esc(g.tagline || '')}</p></div></div>
      ${main}
    </article>
    <aside class="aside">
      <div class="aside-box"><div class="aside-t">Поделиться</div>
        <button class="share-btn" id="share">${ic('copy')}<span id="shareLbl">Скопировать ссылку</span></button>
      </div>
      ${rel ? `<div class="aside-box"><div class="aside-t">${cat ? esc(cat.title) : 'Ещё статьи'}</div><div class="rel">${rel}</div></div>` : ''}
    </aside>
  </div>
  <div class="band"><div class="wrap band-in">
    <h2>Готовы применить?</h2><p>Откройте Lumen и настройте функцию за пару минут — или вернитесь к другим инструкциям.</p>
    <a class="tb-cta" href="/">Открыть Lumen ${ic('arrow', 2)}</a>
  </div></div>
  ${foot()}
  <div class="lb" id="lb"><img id="lbimg" alt=""></div>
  <script>
    var b=document.getElementById('share'),l=document.getElementById('shareLbl');
    b.addEventListener('click',function(){var u=location.href;function ok(){l.textContent='Ссылка скопирована ✓';setTimeout(function(){l.textContent='Скопировать ссылку';},1800);}
      if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(u).then(ok,function(){prompt('Скопируйте ссылку:',u);});}else{prompt('Скопируйте ссылку:',u);}});
    var lb=document.getElementById('lb'),lbi=document.getElementById('lbimg');
    window.lumenZoom=function(img){lbi.src=img.currentSrc||img.src;lb.classList.add('on');};
    document.addEventListener('click',function(e){var im=e.target.closest&&e.target.closest('.gd-rich img, .art-mock img, .art-img img');if(im&&!lb.contains(im)){lumenZoom(im);}});
    lb.addEventListener('click',function(){lb.classList.remove('on');});
  </script>`;
  const desc = strip(g.intro).slice(0, 180) || g.tagline;
  return head({ base, rich: !!(richHtml || g.diagram || (g.sections || []).some(s => s.shot)), path: '/help/' + slug, title: g.title + ' — Справочник Lumen', desc }) + body + '</body></html>';
}

module.exports = { renderLanding, renderArticle, renderCategory, GUIDES, CATEGORIES };
