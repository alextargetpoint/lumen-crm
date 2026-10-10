/* Lumen Presentation Builder — deterministic template registry (TZ §9–§12, §16–§19).
   Pure. One package consumed by editor canvas, web view and server PDF renderer (TZ §23).
   renderPage(section, ctx) -> { pages: [html,...] }  — a logical section may yield >1 physical page.
   Browser: window.LumenPresTemplates · Node: module.exports */
(function (root, factory) {
  const T = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./pres-tokens.js')
    : (root.LumenPresTokens);
  const m = factory(T);
  if (typeof module !== 'undefined' && module.exports) module.exports = m;
  if (typeof window !== 'undefined') window.LumenPresTemplates = m;
})(typeof self !== 'undefined' ? self : this, function (TOK) {
  'use strict';

  /* ---------------- escaping & text ---------------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const nl2br = (s) => esc(s).replace(/\n/g, '<br>');
  const NB = ' '; // non-breaking space
  const caps = (s) => esc(s); // eyebrow rendered caps via CSS letter-spacing

  /* ---------------- value formatters (TZ §15, §17) ---------------- */
  const CUR = { USD:'$', EUR:'€', THB:'฿', RUB:'₽', AED:'AED', GBP:'£' };
  function groupNum(n) {
    // thin non-breaking grouping
    const s = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NB);
    return s;
  }
  function money(amount, currency) {
    const sym = CUR[currency] || currency || '';
    const whole = Math.round(Number(amount) || 0);
    const num = groupNum(whole);
    // symbol + nbsp + number, kept together (TZ §15: price & currency do not wrap)
    const pre = ['$','€','£','฿'].includes(sym);
    return pre ? `${sym}${NB}${num}` : `${num}${NB}${sym}`;
  }
  function fmtPrice(price) {
    if (!price || price.kind === 'on_request') return 'по запросу';
    const c = price.currency || 'USD';
    if (price.kind === 'range' && price.to != null) return `${money(price.amount, c)}${NB}–${NB}${money(price.to, c)}`;
    const body = money(price.amount, c);
    return price.kind === 'from' ? `от${NB}${body}` : body;
  }
  function fmtArea(a) {
    if (a == null || a === '') return '';
    if (typeof a === 'object') {
      const u = a.unit === 'ft2' ? 'ft²' : 'м²';
      if (a.to != null && a.from != null) return `${a.from}–${a.to}${NB}${u}`;
      return `${a.value != null ? a.value : (a.from != null ? a.from : '')}${NB}${u}`;
    }
    return `${a}${NB}м²`;
  }
  function fmtCompletion(c) {
    if (!c) return '';
    if (typeof c === 'string') return c;
    if (c.date) return c.date;
    if (c.quarter && c.year) return `Q${c.quarter} ${c.year}`;
    if (c.year) return String(c.year);
    return '';
  }

  /* ---------------- thin-line icon set (stroke=currentColor, 1.4, 24x24) ---------------- */
  const IP = { fill:'none', stroke:'currentColor', 'stroke-width':'1.4', 'stroke-linecap':'round', 'stroke-linejoin':'round' };
  const svg = (d, extra) => `<svg viewBox="0 0 24 24" ${Object.entries(IP).map(([k,v])=>`${k}="${v}"`).join(' ')} aria-hidden="true">${d}${extra||''}</svg>`;
  const ICONS = {
    beach:  svg('<path d="M3 20h18"/><path d="M12 20V9"/><path d="M12 9c-4 0-7 2-8 4 3 .5 6 0 8-1"/><path d="M12 9c4 0 7 2 8 4-3 .5-6 0-8-1"/>'),
    palm:   svg('<path d="M12 21V9"/><path d="M12 9c-3-3-7-2-9 0 3-1 6 0 9 2"/><path d="M12 9c3-3 7-2 9 0-3-1-6 0-9 2"/><circle cx="12" cy="8" r="1.2"/>'),
    pool:   svg('<path d="M3 15c1.5 1 3 1 4.5 0S10.5 14 12 15s3 1 4.5 0S19.5 14 21 15"/><path d="M3 19c1.5 1 3 1 4.5 0S10.5 18 12 19s3 1 4.5 0S19.5 18 21 19"/><path d="M8 13V6a2 2 0 0 1 4 0"/>'),
    shield: svg('<path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>'),
    gym:    svg('<path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"/>'),
    leaf:   svg('<path d="M5 19c6 2 14-2 14-12 0 0-9-3-13 4-2 3.5-1 8-1 8z"/><path d="M5 19c3-5 7-7 11-8"/>'),
    bed:    svg('<path d="M3 17v-5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5"/><path d="M3 17h18M3 13h14M21 17v-3"/>'),
    area:   svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
    calendar: svg('<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9h16M8 3v4M16 3v4"/>'),
    tag:    svg('<path d="M3 11l8-8h8v8l-8 8z"/><circle cx="15" cy="9" r="1.3"/>'),
    pin:    svg('<path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/>'),
    home:   svg('<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/>'),
    chat:   svg('<path d="M4 5h16v10H9l-5 4z"/>'),
    doc:    svg('<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h6M10 16h6"/>'),
    whatsapp: svg('<path d="M12 4a8 8 0 0 0-7 12l-1 4 4-1a8 8 0 1 0 4-15z"/><path d="M9 9c0 4 2 6 6 6 1 0 1-1 1-2l-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2c-1 0-1.5 0-1.5 1.5z"/>'),
    telegram: svg('<path d="M21 5L3 12l5 2 2 5 3-4 5 3z"/><path d="M8 14l9-6"/>'),
    mail:   svg('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M4 7l8 6 8-6"/>'),
    phone:  svg('<path d="M5 4h3l2 5-2 1a9 9 0 0 0 4 4l1-2 5 2v3a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
    globe:  svg('<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2.5 2.5 13 0 16M12 4c-2.5 2.5-2.5 13 0 16"/>'),
    check:  svg('<path d="M4 12l5 5L20 6"/>'),
    arrow:  svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    sun:    svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>'),
  };
  const icon = (name) => ICONS[name] || ICONS.home;
  // guess an icon from a metric label (editorial defaults; brokers can override later)
  function guessIcon(label) {
    const s = (label || '').toLowerCase();
    if (/пляж|beach|море|sea/.test(s)) return 'beach';
    if (/бассейн|pool/.test(s)) return 'pool';
    if (/охран|secur|сервис|24/.test(s)) return 'shield';
    if (/фитнес|gym|wellness|спорт/.test(s)) return 'gym';
    if (/спальн|bed|комнат/.test(s)) return 'bed';
    if (/площад|area|м²|m2|кв/.test(s)) return 'area';
    if (/сдач|completion|готов|год|20\d\d/.test(s)) return 'calendar';
    if (/цена|price|стоим|\$|от /.test(s)) return 'tag';
    if (/природ|зелен|сад|leaf|эко/.test(s)) return 'leaf';
    if (/локац|район|location|близ/.test(s)) return 'pin';
    if (/застройщ|developer|надёжн|надежн/.test(s)) return 'shield';
    return 'home';
  }

  /* ---------------- content resolution (source/override; TZ §6) ---------------- */
  function getPath(obj, path) {
    if (!obj || !path) return undefined;
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
  function bindVal(binding, source) {
    if (!binding) return undefined;
    if (binding.mode === 'override') return binding.value;          // explicit (incl. explicit empty = hidden)
    if (binding.mode === 'source') {
      const v = getPath(source, binding.sourcePath);
      return v !== undefined ? v : binding.cachedValue;             // cached shown in draft, resolved server-side at publish
    }
    return binding.cachedValue !== undefined ? binding.cachedValue : binding.value;
  }
  function content(section, source) {
    const b = section.contentBindings || {};
    const out = {};
    for (const k of Object.keys(b)) out[k] = bindVal(b[k], source);
    return out;
  }

  /* ---------------- asset resolution ---------------- */
  function assetUrl(ref, assets) {
    if (!ref) return '';
    const a = (assets || {})[ref.assetId] || {};
    return a.url || ref.url || '';
  }
  function bgStyle(ref, assets, fmtId) {
    const url = assetUrl(ref, assets);
    if (!url) return 'background:var(--surface)';
    const fp = ref && ref.focalPoint ? `${Math.round(ref.focalPoint.x*100)}% ${Math.round(ref.focalPoint.y*100)}%` : '50% 50%';
    const fit = (ref && ref.fit) || 'cover';
    return `background-image:url('${esc(url)}');background-size:${fit==='contain'?'contain':'cover'};background-position:${fp};background-repeat:no-repeat`;
  }
  function imgTag(ref, assets, cls, alt) {
    const url = assetUrl(ref, assets);
    if (!url) return `<div class="lp-ph ${cls||''}" role="img" aria-label="${esc(alt||'изображение')}"></div>`;
    const fp = ref && ref.focalPoint ? `${Math.round(ref.focalPoint.x*100)}% ${Math.round(ref.focalPoint.y*100)}%` : '50% 50%';
    const fit = (ref && ref.fit) === 'contain' ? 'contain' : 'cover';
    return `<img class="${cls||''}" src="${esc(url)}" alt="${esc(alt||'')}" style="object-fit:${fit};object-position:${fp}" loading="lazy">`;
  }

  /* ---------------- page shell ---------------- */
  function pageShell(fmt, theme, inner, opts) {
    opts = opts || {};
    const cls = `lp-page lp-${fmt.id} lp-${fmt.orient}` + (theme && theme.presetId ? ` lp-preset-${theme.presetId}` : '') + (opts.cls ? ' ' + opts.cls : '');
    const style = `width:${fmt.cssW}px;height:${fmt.cssH}px;${TOK.themeStyleStr(theme)}`;
    const footer = opts.footer === false ? '' :
      `<div class="lp-foot">${opts.footerHtml || ''}</div>`;
    return `<section class="${cls}" style="${style}" data-fmt="${fmt.id}">${inner}${footer}</section>`;
  }
  const eyebrow = (parts) => {
    const arr = (Array.isArray(parts) ? parts : [parts]).filter(Boolean);
    if (!arr.length) return '';
    return `<div class="lp-eyebrow">${arr.map(p=>`<span>${esc(p)}</span>`).join('<i>·</i>')}</div>`;
  };
  const metricCell = (m) => `
    <div class="lp-metric">
      <span class="lp-metric-ic">${icon(m.icon || guessIcon(m.label))}</span>
      <div class="lp-metric-tx"><b>${esc(m.value)}</b><span>${esc(m.label||'')}</span></div>
    </div>`;

  /* ===================================================================
     FAMILY RENDERERS — each returns an array of physical-page inner HTML
     ctx = { c (resolved content), assets, fmt, theme, section, source, brand }
     =================================================================== */
  const F = {};

  // ---- HERO (cover) ----
  F.hero = (ctx) => {
    const { c, fmt } = ctx;
    const brand = ctx.brand || {};
    const img = (ctx.section.assetRefs || [])[0];
    const metrics = Array.isArray(c.metrics) ? c.metrics.slice(0, 4) : [];
    const loc = eyebrow(c.locationLabel || (brand.country ? [brand.region, brand.country] : null) || c.region);
    const price = c.price ? `<div class="lp-hero-price">${fmtPrice(c.price)}</div>` : '';
    const title = `<h1 class="lp-h1">${nl2br(c.title || 'Название проекта')}</h1>`;
    const sub = c.subtitle ? `<p class="lp-hero-sub">${nl2br(c.subtitle)}</p>` : '';
    const mgrid = metrics.length ? `<div class="lp-hero-metrics">${metrics.map(metricCell).join('')}</div>` : '';
    const brandMark = brand.logoText ? `<div class="lp-brandmark">${esc(brand.logoText)}</div>` : '';

    const presetId = ctx.theme && ctx.theme.presetId;
    /* Gallery White — обложка-галерея: логотип+крупное название сверху, фото в прямоугольнике снизу, белые поля (ТЗ §3) */
    if (presetId === 'gallerywhite' && fmt.orient === 'portrait') {
      return [`<div class="lp-safe lp-hero-gw">
        <div class="lp-hero-gw-head">${brandMark}${loc}${title}${sub}</div>
        <div class="lp-hero-gw-photo" style="${bgStyle(img, ctx.assets, fmt.id)}"></div>
      </div>`];
    }
    /* Urban Graphite — большое фото + графитовая полоса снизу с названием и логотипом (ТЗ §4) */
    if (presetId === 'graphite' && fmt.orient === 'portrait') {
      return [`
        <div class="lp-bleed" style="${bgStyle(img, ctx.assets, fmt.id)}"></div>
        <div class="lp-hero-ug">
          ${brandMark}${loc}${title}${sub}
          ${metrics.length ? `<div class="lp-hero-ug-metrics">${metrics.slice(0, 3).map(metricCell).join('')}</div>` : ''}
        </div>`];
    }
    /* Terracotta Atelier — split-обложка: цветная текстовая панель ~42% + фото ~58% (ТЗ §5) */
    if (presetId === 'terracotta' && fmt.orient === 'portrait') {
      return [`
        <div class="lp-hero-split">
          <div class="lp-hero-split-txt">
            ${brandMark}${loc}${title}${sub}
            ${metrics.length ? `<div class="lp-hero-split-metrics">${metrics.slice(0, 3).map(metricCell).join('')}</div>` : ''}
            ${price}
          </div>
          <div class="lp-hero-split-photo" style="${bgStyle(img, ctx.assets, fmt.id)}"></div>
        </div>`];
    }

    if (fmt.orient === 'landscape') {
      // photo full-bleed, title block on a soft panel to the left (TZ §10 hero horizontal)
      return [`
        <div class="lp-bleed" style="${bgStyle(img, ctx.assets, fmt.id)}"><div class="lp-scrim-l"></div></div>
        <div class="lp-safe lp-hero-land">
          <div class="lp-hero-panel">
            ${brandMark}${loc}
            ${title}${sub}
            ${metrics.length ? `<div class="lp-hero-metrics inline">${metrics.map(metricCell).join('')}</div>` : ''}
            ${price}
          </div>
        </div>`];
    }
    // portrait: title on top over photo (TZ §10 hero vertical: heading top, tall photo)
    return [`
      <div class="lp-bleed" style="${bgStyle(img, ctx.assets, fmt.id)}"><div class="lp-scrim-t"></div></div>
      <div class="lp-safe lp-hero-port">
        <div class="lp-hero-top">${brandMark}${loc}${title}${sub}</div>
        ${mgrid ? `<div class="lp-hero-foot">${mgrid}${price}</div>` : (price?`<div class="lp-hero-foot">${price}</div>`:'')}
      </div>`];
  };

  // ---- EDITORIAL (text + photo) ----
  F.editorial = (ctx) => {
    const { c, fmt } = ctx;
    const img = (ctx.section.assetRefs || [])[0];
    const head = `<h2 class="lp-h2">${nl2br(c.title || 'О проекте')}</h2>`;
    const body = `<div class="lp-body">${nl2br(c.body || c.summary || '')}</div>`;
    const metrics = Array.isArray(c.metrics) ? c.metrics.slice(0,4) : [];
    const mg = metrics.length ? `<div class="lp-grid2">${metrics.map(metricCell).join('')}</div>` : '';
    if (fmt.orient === 'landscape') {
      return [`<div class="lp-safe lp-edit-land">
        <div class="lp-edit-text">${eyebrow(c.eyebrow)}${head}${body}${mg}</div>
        <div class="lp-edit-photo">${imgTag(img, ctx.assets, 'lp-cover', c.title)}</div>
      </div>`];
    }
    return [`<div class="lp-safe lp-edit-port">
      ${eyebrow(c.eyebrow)}${head}
      <div class="lp-edit-photo">${imgTag(img, ctx.assets, 'lp-cover', c.title)}</div>
      ${body}${mg}
    </div>`];
  };

  // ---- METRICS ----
  F.metrics = (ctx) => {
    const { c, fmt } = ctx;
    const img = (ctx.section.assetRefs || [])[0];
    const max = fmt.orient === 'portrait' ? 4 : 6;
    const metrics = (Array.isArray(c.metrics) ? c.metrics : []).slice(0, max);
    const grid = `<div class="lp-metrics-grid cols${Math.min(metrics.length,2)}">${metrics.map(m=>`
      <div class="lp-metric-lg"><span class="lp-metric-ic">${icon(m.icon||guessIcon(m.label))}</span><b>${esc(m.value)}</b><span>${esc(m.label||'')}</span></div>`).join('')}</div>`;
    if (fmt.orient === 'landscape') {
      return [`<div class="lp-safe lp-metrics-land">
        <div class="lp-metrics-photo">${imgTag(img, ctx.assets,'lp-cover',c.title)}</div>
        <div class="lp-metrics-side">${eyebrow(c.eyebrow)}<h2 class="lp-h2">${nl2br(c.title||'В цифрах')}</h2>${grid}</div>
      </div>`];
    }
    return [`<div class="lp-safe lp-metrics-port">
      <div class="lp-metrics-photo">${imgTag(img, ctx.assets,'lp-cover',c.title)}</div>
      ${eyebrow(c.eyebrow)}<h2 class="lp-h2">${nl2br(c.title||'В цифрах')}</h2>${grid}
    </div>`];
  };

  // ---- GALLERY ----
  F.gallery = (ctx) => {
    const { c, fmt } = ctx;
    const refs = (ctx.section.assetRefs || []);
    const perPage = fmt.orient === 'portrait' ? (fmt.id==='portrait_9_16'?3:3) : 4;
    const pages = [];
    for (let i = 0; i < Math.max(refs.length,1); i += perPage) {
      const slice = refs.slice(i, i + perPage);
      const cont = i > 0;
      const head = i === 0 ? `${eyebrow(c.eyebrow)}<h2 class="lp-h2">${nl2br(c.title||'Галерея')}</h2>` : `<div class="lp-cont-mark">${esc(c.title||'Галерея')} · продолжение</div>`;
      const big = slice[0], rest = slice.slice(1);
      const grid = `<div class="lp-gal lp-gal-${slice.length}">
        <div class="lp-gal-big">${imgTag(big, ctx.assets,'lp-cover',c.title)}</div>
        ${rest.map(r=>`<div class="lp-gal-sm">${imgTag(r, ctx.assets,'lp-cover',c.title)}</div>`).join('')}
      </div>`;
      pages.push(`<div class="lp-safe lp-gal-wrap">${head}${grid}</div>`);
    }
    return pages;
  };

  // ---- LOCATION ----
  F.location = (ctx) => {
    const { c, fmt } = ctx;
    const mapRef = (ctx.section.assetRefs || []).find(r=>r.role==='map') || (ctx.section.assetRefs||[])[0];
    const places = Array.isArray(c.nearbyPlaces) ? c.nearbyPlaces : [];
    const list = `<ul class="lp-places">${places.map(p=>`<li><span class="lp-metric-ic">${icon('pin')}</span><b>${esc(p.name)}</b><em>${esc(p.distance||'')}</em></li>`).join('')}</ul>`;
    const mapBox = `<div class="lp-map">${imgTag(mapRef, ctx.assets,'lp-cover',c.title||'Карта района')}</div>`;
    const head = `${eyebrow(c.eyebrow)}<h2 class="lp-h2">${nl2br(c.title||'Локация')}</h2>`;
    if (fmt.orient === 'landscape') {
      return [`<div class="lp-safe lp-loc-land"><div class="lp-loc-map">${mapBox}</div><div class="lp-loc-list">${head}${list}</div></div>`];
    }
    return [`<div class="lp-safe lp-loc-port">${head}${mapBox}${list}</div>`];
  };

  // ---- FLOORPLAN ----
  F.floorplan = (ctx) => {
    const { c, fmt } = ctx;
    const planRef = (ctx.section.assetRefs || [])[0];
    const params = Array.isArray(c.params) ? c.params : [];
    const plan = `<div class="lp-plan">${imgTag(Object.assign({}, planRef, {fit:'contain'}), ctx.assets,'lp-contain',c.title||'Планировка')}</div>`;
    const side = `<div class="lp-plan-params">${eyebrow(c.eyebrow)}<h2 class="lp-h2">${nl2br(c.title||'Планировка')}</h2>
      <dl>${params.map(p=>`<div><dt>${esc(p.label)}</dt><dd>${esc(p.value)}</dd></div>`).join('')}</dl></div>`;
    if (fmt.orient === 'landscape') return [`<div class="lp-safe lp-plan-land">${plan}${side}</div>`];
    return [`<div class="lp-safe lp-plan-port">${side}${plan}</div>`];
  };

  // ---- PAYMENT ----
  F.payment = (ctx) => {
    const { c, fmt } = ctx;
    const plan = c.plan || {};
    const stages = computePaymentStages(plan);
    const total = plan.basePrice ? fmtPrice({ kind:'exact', amount: plan.basePrice.amount, currency: plan.basePrice.currency }) : '';
    const partial = plan.kind === 'partial';
    const head = `${eyebrow(c.eyebrow)}<h2 class="lp-h2">${nl2br(c.title||'План оплаты')}</h2>${c.subtitle?`<p class="lp-sub">${nl2br(c.subtitle)}</p>`:''}`;
    const perPage = fmt.orient === 'portrait' ? 4 : 8;
    const pages = [];
    for (let i=0; i<stages.length; i+=perPage) {
      const slice = stages.slice(i, i+perPage);
      const cont = i>0;
      const rows = slice.map((s,idx)=>`
        <div class="lp-pay-row">
          <span class="lp-pay-n">${i+idx+1}</span>
          <div class="lp-pay-main"><b>${esc(s.name)}</b>${s.note?`<span>${esc(s.note)}</span>`:''}</div>
          <div class="lp-pay-val">${s.percent!=null?`<b>${esc(s.percent)}%</b>`:''}${s.amount!=null?`<em>${money(s.amount, s.currency||(plan.basePrice&&plan.basePrice.currency))}</em>`:''}</div>
        </div>`).join('');
      const totalRow = (!cont && (i+perPage>=stages.length) && total) ? `
        <div class="lp-pay-total"><span>${partial?'Итого по графику':'Общая стоимость'}${partial?'':' <i>(пример расчёта)</i>'}</span><b>${total}</b></div>` : '';
      pages.push(`<div class="lp-safe lp-pay-wrap">${cont?`<div class="lp-cont-mark">${esc(c.title||'План оплаты')} · продолжение</div>`:head}<div class="lp-pay-list">${rows}</div>${totalRow}</div>`);
    }
    return pages.length ? pages : [`<div class="lp-safe lp-pay-wrap">${head}<div class="lp-empty">Добавьте этапы оплаты</div></div>`];
  };

  // ---- COMPARISON (collection-level) ----
  F.comparison = (ctx) => {
    const { c, fmt } = ctx;
    const cols = Array.isArray(c.projects) ? c.projects.slice(0,3) : [];
    const rows = Array.isArray(c.rows) ? c.rows.slice(0,8) : [];
    const head = `${eyebrow(c.eyebrow)}<h2 class="lp-h2">${nl2br(c.title||'Сравнение проектов')}</h2>`;
    const cell = (v) => esc(v==null||v===''?'Не указано':v);
    const table = (projs) => `<table class="lp-cmp"><thead><tr><th></th>${projs.map(p=>`<th>${esc(p.name)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r=>`<tr><td class="lp-cmp-k">${esc(r.label)}</td>${projs.map(p=>`<td>${cell(p.values&&p.values[r.key])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    if (fmt.orient === 'portrait' && cols.length === 3) {
      // split 3 projects into two sequential tables with repeated headers (TZ §11)
      return [
        `<div class="lp-safe lp-cmp-wrap">${head}${table(cols.slice(0,2))}</div>`,
        `<div class="lp-safe lp-cmp-wrap"><div class="lp-cont-mark">${esc(c.title||'Сравнение')} · продолжение</div>${table(cols.slice(2))}</div>`,
      ];
    }
    return [`<div class="lp-safe lp-cmp-wrap">${head}${table(cols)}</div>`];
  };

  // ---- BENEFITS ----
  F.benefits = (ctx) => {
    const { c, fmt } = ctx;
    const img = (ctx.section.assetRefs || [])[0];
    const items = (Array.isArray(c.items) ? c.items : []).slice(0,5);
    const list = `<ol class="lp-benefits">${items.map((it,i)=>`<li><span class="lp-ben-n">${it.icon?icon(it.icon):String(i+1)}</span><div><b>${esc(it.title)}</b>${it.desc?`<p>${esc(it.desc)}</p>`:''}</div></li>`).join('')}</ol>`;
    const head = `${eyebrow(c.eyebrow)}<h2 class="lp-h2">${nl2br(c.title||'Преимущества')}</h2>`;
    const photo = `<div class="lp-ben-photo">${imgTag(img, ctx.assets,'lp-cover',c.title)}</div>`;
    if (fmt.orient === 'landscape') return [`<div class="lp-safe lp-ben-land"><div class="lp-ben-text">${head}${list}</div>${photo}</div>`];
    return [`<div class="lp-safe lp-ben-port">${head}${photo}${list}</div>`];
  };

  // ---- BROKER (intro + contacts) ----
  F.broker = (ctx) => {
    const p = ctx.c.profile || ctx.brand.broker || {};
    const fmt = ctx.fmt;
    const which = ctx.section.variant || (ctx.section.pageType) || 'both';
    const introPage = () => {
      const img = p.photo ? imgTag({ url:p.photo, fit:'cover' }, ctx.assets, 'lp-cover', p.name) : '';
      const points = (p.points||[]).slice(0,3).map(pt=>`<li><span class="lp-metric-ic">${icon(pt.icon||'home')}</span><div><b>${esc(pt.title)}</b>${pt.desc?`<span>${esc(pt.desc)}</span>`:''}</div></li>`).join('');
      const brandMark = (ctx.brand.logoText)?`<div class="lp-brandmark center">${esc(ctx.brand.logoText)}</div>`:'';
      const txt = `<div class="lp-broker-intro-tx">${brandMark}${eyebrow(p.agency)}<h2 class="lp-h2">${nl2br(p.headline||'Ваш эксперт')}</h2>
        ${p.bio?`<p class="lp-body">${nl2br(p.bio)}</p>`:''}
        <div class="lp-broker-name"><b>${esc(p.name||'')}</b><span>${esc(p.role||'')}</span></div>
        ${points?`<ul class="lp-broker-points">${points}</ul>`:''}</div>`;
      if (fmt.orient==='landscape') return `<div class="lp-safe lp-broker-land">${txt}<div class="lp-broker-photo">${img||`<div class="lp-ph"></div>`}</div></div>`;
      return `<div class="lp-safe lp-broker-port">${img?`<div class="lp-broker-photo">${img}</div>`:''}${txt}</div>`;
    };
    const contactsPage = () => {
      const ch = p.channels || {};
      const btn = (k, label, href) => ch[k] ? `<a class="lp-ch lp-ch-${k}" href="${esc(href)}"><span class="lp-metric-ic">${icon(k==='whatsapp'?'whatsapp':k==='telegram'?'telegram':k==='site'?'globe':k)}</span>${esc(label)}</a>` : '';
      const phone = ch.phone?`<div class="lp-contact-line"><span class="lp-metric-ic">${icon('phone')}</span><a href="tel:${esc(ch.phone.replace(/[^0-9+]/g,''))}">${esc(ch.phone)}</a></div>`:'';
      const email = ch.email?`<div class="lp-contact-line"><span class="lp-metric-ic">${icon('mail')}</span><a href="mailto:${esc(ch.email)}">${esc(ch.email)}</a></div>`:'';
      const qr = p.qr ? `<div class="lp-qr"><img src="${esc(p.qr)}" alt="QR" width="128" height="128"></div>` : `<div class="lp-qr lp-qr-ph"><span>${esc(ctx.opts&&ctx.opts.published?'':'QR после публикации')}</span></div>`;
      const buttons = `<div class="lp-ch-wrap">
        ${btn('whatsapp','WhatsApp', ch.whatsapp?('https://wa.me/'+String(ch.whatsapp).replace(/[^0-9]/g,'')):'')}
        ${btn('telegram','Telegram', ch.telegram?('https://t.me/'+String(ch.telegram).replace(/^@/,'')):'')}
        ${btn('site','Сайт', ch.site||'')}
      </div>`;
      const head = `<h2 class="lp-h2">${nl2br(p.contactHeadline||'Связаться с брокером')}</h2>`;
      const left = `<div class="lp-contact-info">${eyebrow(p.agency)}${head}<div class="lp-broker-name"><b>${esc(p.name||'')}</b><span>${esc(p.role||'')}</span></div>${phone}${email}${buttons}</div>`;
      return `<div class="lp-safe lp-contact-${fmt.orient}">${left}<div class="lp-contact-qr">${qr}</div></div>`;
    };
    if (which === 'broker_intro') return [introPage()];
    if (which === 'broker_contacts') return [contactsPage()];
    return [introPage(), contactsPage()];
  };

  // ---- CUSTOM (neutral, from allowed blocks) ----
  F.custom = (ctx) => {
    const { c } = ctx;
    const blocks = Array.isArray(c.blocks) ? c.blocks : [];
    const html = blocks.map(b=>{
      if (b.type==='heading') return `<h2 class="lp-h2">${nl2br(b.text)}</h2>`;
      if (b.type==='paragraph') return `<div class="lp-body">${nl2br(b.text)}</div>`;
      if (b.type==='list') return `<ul class="lp-list">${(b.items||[]).map(i=>`<li>${esc(i)}</li>`).join('')}</ul>`;
      return '';
    }).join('');
    return [`<div class="lp-safe lp-custom">${c.eyebrow?eyebrow(c.eyebrow):''}${html||'<div class="lp-empty">Пустая страница</div>'}</div>`];
  };

  /* ---------------- payment math (TZ §17, decimal-safe) ---------------- */
  function computePaymentStages(plan) {
    const stages = Array.isArray(plan.stages) ? plan.stages.map(s=>Object.assign({}, s)) : [];
    const base = plan.basePrice ? Math.round(Number(plan.basePrice.amount)||0) : null;
    const anyPercent = stages.some(s=>s.percent!=null && s.amountMode!=='manual');
    if (base != null) {
      let acc = 0, lastCalcIdx = -1;
      stages.forEach((s,i)=>{ if (s.percent!=null && s.amountMode!=='manual') lastCalcIdx = i; });
      stages.forEach((s,i)=>{
        if (s.amountMode === 'manual' && s.amount!=null) { acc += Math.round(Number(s.amount)||0); return; }
        if (s.percent!=null) {
          let amt = Math.round(base * Number(s.percent) / 100);
          s.amount = amt; acc += amt;
        }
      });
      // rounding remainder to last calculated stage so total == base (TZ §17)
      if (lastCalcIdx>=0 && anyPercent) {
        const diff = base - acc;
        if (diff) stages[lastCalcIdx].amount += diff;
      }
    }
    return stages;
  }
  // validation: percentages sum to 100 (±0.01pp); returns {ok, sum, issues[]}
  function validatePayment(plan) {
    const issues = [];
    const stages = Array.isArray(plan && plan.stages) ? plan.stages : [];
    const pct = stages.filter(s=>s.percent!=null);
    if (plan && plan.kind !== 'partial' && pct.length) {
      const sum = pct.reduce((a,s)=>a+Number(s.percent||0),0);
      if (Math.abs(sum-100) > 0.01) issues.push({ code:'INVALID_PAYMENT_TOTAL', message:`Сумма процентов ${sum}% ≠ 100%`, severity:'blocking' });
    }
    return { ok: !issues.length, issues };
  }

  /* ---------------- public API ---------------- */
  // render ONE logical section to its physical page(s)
  // ---- COMPARISON (мульти-объект, TZ v3 §11) ----
  F.comparison = (ctx) => {
    const { c, fmt } = ctx;
    const crit = Array.isArray(c.criteria) ? c.criteria : [];
    const objs = Array.isArray(c.objects) ? c.objects : [];
    const per = fmt.orient === 'portrait' ? 3 : 4;        // §11: 2–3 объекта на страницу, критерии повторяются
    const chunks = [];
    for (let i = 0; i < objs.length; i += per) chunks.push(objs.slice(i, i + per));
    if (!chunks.length) chunks.push([]);
    const bd = 'border-bottom:1px solid rgba(128,128,128,.28)';
    return chunks.map((grp, pi) => {
      const head = `<tr><th style="text-align:left;padding:9px 12px;${bd};width:28%"></th>${grp.map(o => `<th style="text-align:left;padding:9px 12px;${bd};font-weight:600">${esc(o.name)}</th>`).join('')}</tr>`;
      const rows = crit.map(cr => `<tr><td style="padding:9px 12px;${bd};font-weight:600;opacity:.72">${esc(cr.label)}</td>${grp.map(o => {
        const v = o.values ? o.values[cr.key] : null;
        return `<td style="padding:9px 12px;${bd}">${v == null || v === '' ? '<span style="opacity:.45">Не указано</span>' : esc(v)}</td>`;
      }).join('')}</tr>`).join('');
      return `<div class="lp-safe lp-cmp">
        ${eyebrow(c.eyebrow || 'Сравнение')}
        <h2 class="lp-h2">${nl2br(c.title || 'Сравнение объектов')}${chunks.length > 1 ? ` <span style="opacity:.5;font-size:.6em;font-weight:500">${pi + 1}/${chunks.length}</span>` : ''}</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:14px"><thead>${head}</thead><tbody>${rows}</tbody></table>
      </div>`;
    });
  };

  // ---- RECOMMENDATION (подписанная рекомендация брокера, TZ v3 §11) ----
  F.recommendation = (ctx) => {
    const { c } = ctx;
    const body = nl2br(c.body || c.summary || '');
    const author = c.author ? `<div style="margin-top:20px;font-weight:600;opacity:.8">— ${esc(c.author)}</div>` : '';
    return [`<div class="lp-safe lp-rec">
      ${eyebrow(c.eyebrow || 'Рекомендация')}
      <h2 class="lp-h2">${nl2br(c.title || 'Рекомендация брокера')}</h2>
      <div class="lp-body" style="max-width:62ch">${body || '<span style="opacity:.4">Здесь брокер добавит персональную рекомендацию.</span>'}</div>${author}
    </div>`];
  };

  function renderSection(section, ctx0) {
    const fmt = TOK.format(ctx0.format || (ctx0.fmt && ctx0.fmt.id));
    const theme = ctx0.theme || {};
    const source = ctx0.source || {};
    const ctx = {
      section, fmt, theme, source,
      assets: ctx0.assets || {},
      brand: ctx0.brand || {},
      opts: ctx0.opts || {},
      c: content(section, source),
    };
    const fn = F[section.family] || F.custom;
    let inners;
    try { inners = fn(ctx); } catch (e) { inners = [`<div class="lp-safe lp-empty">Ошибка макета: ${esc(e.message)}</div>`]; }
    const footHtml = ctx.brand.footer || (ctx.brand.logoText ? `<span>${esc(ctx.brand.logoText)}</span>` : '');
    return inners.map((inner, i) => pageShell(fmt, theme, inner, {
      cls: `lp-fam-${section.family}` + (ctx0.altTint ? ' lp-alt-tint' : '') + (i>0?' lp-continuation':''),
      footer: section.family==='hero' ? false : (ctx.brand.footer!==undefined||ctx.brand.logoText?true:false),
      footerHtml: footHtml,
    }));
  }

  // render whole document (ordered enabled sections) → flat list of pages
  function renderDocument(doc, ctx0) {
    const sections = (doc.orderedSections || []).filter(s=>s.enabled!==false);
    const preset = (doc.theme && doc.theme.presetId) || (ctx0.theme && ctx0.theme.presetId);
    const out = [];
    let cidx = 0;   /* индекс контентных страниц — для чередования Terracotta */
    sections.forEach(s=>{
      const isContent = ['hero','broker','comparison','recommendation'].indexOf(s.family) < 0;
      const altTint = preset === 'terracotta' && isContent && ((cidx++) % 2 === 1);
      renderSection(s, Object.assign({}, ctx0, { theme: doc.theme || ctx0.theme, altTint })).forEach(html=>out.push({ sectionId:s.id, family:s.family, html }));
    });
    return out;
  }

  return {
    esc, nl2br, money, fmtPrice, fmtArea, fmtCompletion, icon, guessIcon,
    content, bindVal, assetUrl, computePaymentStages, validatePayment,
    renderSection, renderDocument, FAMILY_FN: F,
  };
});
