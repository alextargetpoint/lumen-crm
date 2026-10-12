/* Lumen Presentation Builder — editor front-end (ref 01/02/03).
   Renders the live canvas with the shared pure modules (window.LumenPresTemplates) so edits are
   instant and byte-identical to the server PDF/web output (TZ §20,§23). */
(function () {
  'use strict';
  var TOK = window.LumenPresTokens, T = window.LumenPresTemplates;
  var ID = window.__PRES_ID;
  var S = { pres: null, source: {}, assets: {}, brand: {}, broker: null, brokers: [],
    fmt: 'portrait_a4', pageIdx: 0, tab: 'content', zoom: 'fit', chk: null,
    undo: [], redo: [], save: 'saved', _saveT: null, _chkT: null, _mountedCanvasW: 0 };
  var root = document.getElementById('presedit');

  /* ---------- api ---------- */
  function api(method, path, body) {
    return fetch('/api/presentations' + path, { method: method, headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, json: j }; }); });
  }
  var esc = T.esc;
  var FAM_LABEL = { hero: 'Обложка', editorial: 'О проекте', metrics: 'Показатели', gallery: 'Галерея',
    location: 'Локация', floorplan: 'Планировка', payment: 'План оплаты', comparison: 'Сравнение',
    benefits: 'Преимущества', broker: 'Визитка брокера', custom: 'Произвольная' };
  /* библиотека блоков (макет «Добавить блок») — key уникален, f = family движка */
  var BLOCK_TYPES = [
    { key: 'editorial', f: 'editorial', label: 'Текст', ic: 'text' },
    { key: 'photo', f: 'gallery', label: 'Фото', ic: 'image' },
    { key: 'gallery', f: 'gallery', label: 'Галерея', ic: 'image' },
    { key: 'metrics', f: 'metrics', label: 'Характеристики', ic: 'grid' },
    { key: 'floorplan', f: 'floorplan', label: 'Планировка', ic: 'crop' },
    { key: 'payment', f: 'payment', label: 'Условия оплаты', ic: 'doc' },
    { key: 'location', f: 'location', label: 'Расположение', ic: 'pin' },
    { key: 'broker', f: 'broker', label: 'Контакты', ic: 'phone' },
  ];

  /* ---------- boot ---------- */
  api('GET', '/' + ID + '?full=1').then(function (r) {
    if (r.status !== 200) { root.innerHTML = '<div class="pe-loading">Не удалось загрузить презентацию</div>'; return; }
    S.pres = r.json.pres; S.source = r.json.source || {}; S.assets = r.json.assets || {};
    S.brand = r.json.brand || {}; S.broker = r.json.broker || null; S.brokers = r.json.brokers || [];
    S.projects = r.json.projects || []; S.isColl = S.pres.kind === 'collection';
    S.fmt = S.pres.defaultFormat || 'portrait_a4';
    document.body.className = 'pe-app-body';
    render(); revalidate();
    window.addEventListener('resize', fitCanvas);
    window.addEventListener('keydown', onKey);
  });

  /* ---------- doc helpers ---------- */
  function sections() { return S.pres.orderedSections || []; }
  function enabledSections() { return sections().filter(function (s) { return s.enabled !== false; }); }
  function curSection() { return sections()[S.pageIdx]; }
  function ctx(fmt) { return { format: fmt || S.fmt, theme: S.pres.theme, source: S.source, assets: S.assets, brand: brandWithBroker() }; }
  function brandWithBroker() {
    var b = Object.assign({}, S.brand);
    if (b.broker) b.broker = Object.assign({}, b.broker, { points: b.broker.points && b.broker.points.length ? b.broker.points : defaultPoints() });
    return b;
  }
  function defaultPoints() { return [{ icon: 'home', title: 'Подбор объектов', desc: 'под ваш запрос' }, { icon: 'chat', title: 'Консультации', desc: 'на вашем языке' }, { icon: 'doc', title: 'Сопровождение сделки', desc: 'до передачи ключей' }]; }
  // resolve a content value for editing (override value, else cached/source)
  function cval(sec, key) { var b = (sec.contentBindings || {})[key]; if (!b) return undefined; if (b.mode === 'override') return b.value; if (b.sourcePath !== undefined) { var v = getPath(S.source, b.sourcePath); return v !== undefined ? v : b.cachedValue; } return b.value !== undefined ? b.value : b.cachedValue; }
  function isSource(sec, key) { var b = (sec.contentBindings || {})[key]; return b && b.mode === 'source'; }
  function getPath(o, p) { return p.split('.').reduce(function (a, k) { return a == null ? undefined : a[k]; }, o); }
  function setOverride(sec, key, value) { sec.contentBindings = sec.contentBindings || {}; sec.contentBindings[key] = { mode: 'override', value: value }; }

  /* ---------- mutation + autosave + undo ---------- */
  function snapshotState() { return JSON.stringify({ o: S.pres.orderedSections, t: S.pres.theme, f: S.pres.defaultFormat, a: S.pres.brokerAppendix }); }
  function pushUndo() { S.undo.push(snapshotState()); if (S.undo.length > 50) S.undo.shift(); S.redo = []; }
  function restore(str) { var o = JSON.parse(str); S.pres.orderedSections = o.o; S.pres.theme = o.t; S.pres.defaultFormat = o.f; S.pres.brokerAppendix = o.a; }
  function mutate(fn, opts) { pushUndo(); fn(); scheduleSave(); if (!opts || opts.render !== false) render(); revalidate(); }
  function doUndo() { if (!S.undo.length) return; S.redo.push(snapshotState()); restore(S.undo.pop()); scheduleSave(); render(); revalidate(); }
  function doRedo() { if (!S.redo.length) return; S.undo.push(snapshotState()); restore(S.redo.pop()); scheduleSave(); render(); revalidate(); }
  function onKey(e) { if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); } }

  function scheduleSave() { setSave('saving'); clearTimeout(S._saveT); S._saveT = setTimeout(save, 800); }
  function save() {
    var changes = { theme: S.pres.theme, defaultFormat: S.pres.defaultFormat, orderedSections: S.pres.orderedSections, brokerAppendix: S.pres.brokerAppendix, brokerId: S.pres.brokerId };
    api('PATCH', '/' + ID, { expectedRevision: S.pres.draftRevision, changes: changes }).then(function (r) {
      if (r.status === 200) { S.pres.draftRevision = r.json.revision; setSave('saved'); }
      else if (r.status === 409) { setSave('err'); S.pres.draftRevision = r.json.currentRevision; /* retry once with new rev */ setTimeout(save, 400); }
      else setSave('err');
    }).catch(function () { setSave('err'); });
  }
  function setSave(st) { S.save = st; var el = document.querySelector('.pe-save'); if (el) { el.className = 'pe-save' + (st === 'saving' ? ' saving' : st === 'err' ? ' err' : ''); el.querySelector('.tx').textContent = st === 'saving' ? 'Сохраняем…' : st === 'err' ? 'Не сохранено' : 'Черновик сохранён'; } }

  function revalidate() { clearTimeout(S._chkT); S._chkT = setTimeout(function () {
    api('POST', '/' + ID + '/validate', { format: S.fmt }).then(function (r) { if (r.status === 200) { S.chk = r.json; paintReadiness(); paintNavErrors(); updatePageCount(); } });
  }, 500); }

  /* ================= RENDER ================= */
  function render() {
    root.className = '';
    root.innerHTML =
      '<div class="pe-app">' +
        topbar() +
        '<div class="pe-body">' + navigator_() + canvasCol() + inspector() + '</div>' +
      '</div>';
    wire();
    mountCanvas(); mountNavMinis();
  }

  function topbar() {
    var coll = S.isColl;
    var name = esc(S.pres.title || (S.source && S.source.name) || 'Презентация');
    var crumb = coll ? 'Подборки клиентов' : 'Презентации объектов';
    return '<div class="pe-top">' +
      '<a class="pe-back" href="/presentations" title="К каталогу">' + ic('back') + '</a>' +
      '<div class="pe-crumbs"><span class="c0">База</span><i>/</i><span class="c0">' + crumb + '</span><i>/</i><b>' + name + '</b></div>' +
      '<div class="pe-top-sp"></div>' +
      '<button class="pe-iconbtn" data-act="undo" title="Отменить">' + ic('undo') + '</button>' +
      '<button class="pe-iconbtn" data-act="redo" title="Повторить">' + ic('redo') + '</button>' +
      '<button class="pe-iconbtn" data-act="history" title="История версий">' + ic('clock') + '</button>' +
      '<div class="pe-save"><span class="dot"></span><span class="tx">Черновик сохранён</span></div>' +
      '<button class="pe-btn pe-btn-ghost" data-act="preview">' + ic('eye') + 'Предпросмотр</button>' +
      '<button class="pe-btn pe-btn-primary" data-act="export">PDF / ссылка ' + ic('chev') + '</button>' +
    '</div>';
  }

  function thumbRow(s, i) {
    var title = sectionTitle(s);
    var err = S.chk && S.chk.issues && S.chk.issues.some(function (x) { return x.sectionId === s.id && x.severity === 'blocking'; });
    return '<div class="pe-thumb' + (i === S.pageIdx ? ' sel' : '') + (s.enabled === false ? ' off' : '') + (err ? ' err' : '') + (overflowInfo(s) ? ' ov' : '') + '" data-pg="' + i + '">' +
      '<div class="pe-thumb-hd"><span class="pe-thumb-n">' + pad(i + 1) + '</span>' +
        '<span class="pe-thumb-t">' + esc(title) + '</span>' +
        '<span class="pe-thumb-mini" data-act="pgmenu" data-pg="' + i + '">' + ic('dots') + '</span></div>' +
      '<div class="pe-thumb-prev" data-mini="' + i + '"></div>' +
    '</div>';
  }
  function collectionGroups() {
    var secs = sections(); var groups = []; var objMap = {};
    secs.forEach(function (s, i) {
      var m = String(s.id || '').match(/^o(\d+)_/);
      if (m) { var k = +m[1]; if (!objMap[k]) { objMap[k] = { type: 'object', k: k, label: (S.projects[k] && S.projects[k].name) || ('Объект ' + (k + 1)), idx: [] }; groups.push(objMap[k]); } objMap[k].idx.push(i); }
      else if (s.family === 'comparison') groups.push({ type: 'comparison', label: 'Сравнение', idx: [i] });
      else if (s.family === 'broker') { var bg = null; groups.forEach(function (g) { if (g.type === 'broker') bg = g; }); if (!bg) { bg = { type: 'broker', label: 'Контакты брокера', idx: [] }; groups.push(bg); } bg.idx.push(i); }
      else { var ig = null; groups.forEach(function (g) { if (g.type === 'intro') ig = g; }); if (!ig) { ig = { type: 'intro', label: 'Вступление', idx: [] }; groups.push(ig); } ig.idx.push(i); }
    });
    return groups;
  }
  function grpIcon(t) { return '<span class="pe-grp-ic">' + ic(t === 'comparison' ? 'grid' : t === 'broker' ? 'phone' : 'text') + '</span>'; }
  function navCollection() {
    var groups = collectionGroups();
    var html = groups.map(function (g) {
      if (g.type === 'object') {
        var open = S.openGroups && S.openGroups[g.k];
        var hasSel = g.idx.indexOf(S.pageIdx) >= 0;
        var sub = open ? '<div class="pe-grp-pages">' + g.idx.map(function (i) {
          return '<div class="pe-pgrow' + (i === S.pageIdx ? ' sel' : '') + (overflowInfo(sections()[i]) ? ' ov' : '') + '" data-pg="' + i + '"><span class="pe-pgrow-n">' + pad(i + 1) + '</span><span class="pe-pgrow-t">' + esc(sectionTitle(sections()[i])) + '</span></div>';
        }).join('') + '</div>' : '';
        return '<div class="pe-grp' + (open ? ' open' : '') + (hasSel ? ' act' : '') + '">' +
          '<div class="pe-grp-hd" data-act="grptoggle" data-gk="' + g.k + '"><span class="pe-grp-car">' + ic('chev') + '</span><b>' + esc(g.label) + '</b><span class="pe-grp-n">' + g.idx.length + '</span><span class="pe-grp-menu" data-act="objmenu" data-gk="' + g.k + '">' + ic('dots') + '</span></div>' + sub + '</div>';
      }
      var i0 = g.idx[0];
      return '<div class="pe-grp-single' + (i0 === S.pageIdx ? ' sel' : '') + '" data-pg="' + i0 + '">' + grpIcon(g.type) + '<b>' + esc(g.label) + '</b></div>';
    }).join('');
    var hasBroker = false; groups.forEach(function (g) { if (g.type === 'broker') hasBroker = true; });
    if (S.pres.brokerAppendix && S.pres.brokerAppendix.enabled && !hasBroker) {
      html += '<div class="pe-grp-single ghost">' + grpIcon('broker') + '<b>Контакты брокера</b><span class="pe-grp-n">в конце</span></div>';
    }
    return html;
  }
  function navigator_() {
    var items = S.isColl ? navCollection() : sections().map(thumbRow).join('');
    var hd = '<div class="pe-nav-hd"><span>' + (S.isColl ? 'Состав подборки' : 'Страницы') + '</span>' +
      '<button class="pe-nav-add" data-act="' + (S.isColl ? 'addobj' : 'addpage') + '" title="' + (S.isColl ? 'Добавить объекты' : 'Добавить страницу') + '">' + ic('plus') + '</button></div>';
    return '<div class="pe-nav">' + hd + '<div class="pe-nav-list">' + items + '</div></div>';
  }
  function sectionTitle(s) { var t = cval(s, 'title'); if (s.family === 'broker') t = s.pageType === 'broker_contacts' ? 'Контакты брокера' : 'О брокере'; return (typeof t === 'string' && t) ? t.replace(/\n/g, ' ') : FAM_LABEL[s.family] || 'Страница'; }

  function canvasCol() {
    return '<div class="pe-canvaswrap">' +
      '<div class="pe-fmtbar"><div class="pe-fmt-seg">' +
        TOK.FORMATS.map(function (f) { return '<button data-fmt="' + f.id + '"' + (f.id === S.fmt ? ' class="on"' : '') + '>' + esc(f.label) + '</button>'; }).join('') +
      '</div></div>' +
      '<div class="pe-canvas" id="peCanvas">' +
        (overflowInfo(curSection()) ? '<div class="pe-ov-banner" data-act="ovopen">' + ic('warn') + '<span>Текст не помещается</span><b>Решить</b></div>' : '') +
        '<div class="pe-stage" id="peStage"></div>' +
        '<button class="pe-canvas-add" data-act="addpage">' + ic('plus') + 'Добавить блок</button>' +
        '<div class="pe-zoom"><button data-act="zoomout">−</button><span id="peZoomL">Fit</span><button data-act="zoomin">+</button><button data-act="zoomfit" style="width:auto;font-size:13px">Fit</button></div>' +
        '<div class="pe-pagecount" id="pePageCount"></div>' +
      '</div></div>';
  }

  function inspector() {
    if (S.ovMode) return '<div class="pe-insp pe-insp-add">' + overflowPanel() + '</div>';
    if (S.addMode) return '<div class="pe-insp pe-insp-add">' + addBlockPanel() + '</div>';
    return '<div class="pe-insp">' +
      '<div class="pe-insp-tabs">' +
        ['content|Содержание', 'composition|Композиция', 'style|Стиль'].map(function (t) { var p = t.split('|'); return '<button data-tab="' + p[0] + '"' + (S.tab === p[0] ? ' class="on"' : '') + '>' + p[1] + '</button>'; }).join('') +
      '</div><div class="pe-insp-body" id="peInsp">' + inspBody() + '</div></div>';
  }
  function inspBody() { return S.tab === 'content' ? contentTab() : S.tab === 'composition' ? compositionTab() : styleTab(); }

  /* ---------- «Добавить блок» — библиотека блоков (макет) ---------- */
  function addBlockPanel() {
    var q = (S.addQ || '').toLowerCase();
    var list = BLOCK_TYPES.filter(function (b) { return !q || b.label.toLowerCase().indexOf(q) >= 0; });
    var pickKey = S.addPickKey || (list[0] && list[0].key) || 'editorial';
    var grid = list.map(function (b) {
      return '<button class="pe-bl' + (b.key === pickKey ? ' on' : '') + '" data-act="blpick" data-blkey="' + b.key + '">' + ic(b.ic) + '<span>' + esc(b.label) + '</span></button>';
    }).join('');
    var sel = BLOCK_TYPES.filter(function (b) { return b.key === pickKey; })[0] || BLOCK_TYPES[0];
    return '<div class="pe-add-hd"><b>Добавить блок</b><button class="pe-x" data-act="addclose" title="Закрыть">' + ic('x') + '</button></div>' +
      '<div class="pe-add-search">' + ic('search') + '<input id="peBlSearch" placeholder="Поиск блоков…" value="' + esc(S.addQ || '') + '"></div>' +
      '<div class="pe-bl-grid">' + grid + '</div>' +
      '<div class="pe-bl-prevhd"><b>' + esc(sel.label) + '</b><span>Данные из карточки</span></div>' +
      '<div class="pe-bl-prev">' + blockPreview(sel.f) + '</div>' +
      '<button class="pe-btn pe-btn-primary pe-bl-insert" data-act="blinsert" data-blfam="' + sel.f + '">Вставить на страницу</button>';
  }
  function blockPreview(fam) {
    var s = S.source || {};
    if (fam === 'metrics') {
      var cells = [];
      if (s.beds != null) cells.push(['' + s.beds, 'спальни']);
      var ar = (s.units || []).map(function (u) { return +u.area; }).filter(Boolean);
      if (ar.length) cells.push([Math.min.apply(null, ar) + ' м²', 'площадь']);
      if (s.handover) cells.push(['' + s.handover, 'сдача']);
      if (!cells.length) return '<div class="pe-bl-empty">Нет показателей в карточке</div>';
      return '<div class="pe-bl-cells">' + cells.slice(0, 3).map(function (c) { return '<div><b>' + esc(c[0]) + '</b><span>' + esc(c[1]) + '</span></div>'; }).join('') + '</div>';
    }
    if (fam === 'gallery' || fam === 'floorplan') {
      var imgs = (s.images || []).slice(0, 3);
      if (!imgs.length) return '<div class="pe-bl-empty">Нет фотографий — добавьте в карточке</div>';
      return '<div class="pe-bl-thumbs">' + imgs.map(function (u) { return '<div style="background-image:url(\'' + esc(absU(u)) + '\')"></div>'; }).join('') + '</div>';
    }
    if (fam === 'location') { var d = s.district || {}; return d.name ? '<div class="pe-bl-cells"><div><b>' + esc(d.name) + '</b><span>район</span></div><div><b>' + ((d.times || []).length) + '</b><span>мест рядом</span></div></div>' : '<div class="pe-bl-empty">Нет локации в карточке</div>'; }
    if (fam === 'payment') { var n = (s.paymentRows || []).length; return n ? '<div class="pe-bl-cells"><div><b>' + n + '</b><span>этапов оплаты</span></div></div>' : '<div class="pe-bl-empty">Нет плана оплаты</div>'; }
    if (fam === 'editorial') { return s.description ? '<div class="pe-bl-text">' + esc(String(s.description).slice(0, 120)) + '…</div>' : '<div class="pe-bl-empty">Нет описания в карточке</div>'; }
    if (fam === 'broker') { return '<div class="pe-bl-cells"><div><b>' + esc(((S.broker || {}).name) || 'Брокер') + '</b><span>контакты</span></div></div>'; }
    return '<div class="pe-bl-empty">Блок с текущими данными объекта</div>';
  }
  function insertBlock(fam) {
    mutate(function () {
      var ns = { id: 's' + Math.random().toString(16).slice(2, 8), family: fam, enabled: true, assetRefs: [], contentBindings: { title: { mode: 'override', value: FAM_LABEL[fam] || 'Блок' } } };
      var at = Math.min(sections().length, S.pageIdx + 1);
      sections().splice(at, 0, ns); S.pageIdx = at;
    });
    S.addMode = false; render();
  }

  /* ---------- переполнение «Текст не помещается» (макет) ---------- */
  function overflowInfo(s) {
    if (!s || (s.family !== 'editorial' && s.family !== 'custom')) return null;
    var body = cval(s, 'body'); if (typeof body !== 'string' || !body.trim()) return null;
    var budget = S.fmt === 'portrait_a4' ? 640 : S.fmt === 'landscape_16_9' ? 440 : S.fmt === 'portrait_9_16' ? 400 : 540;
    if (body.length <= budget) return null;
    var paras = body.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean);
    if (paras.length < 2) return null;    // один абзац не переносим — это задача сокращения/макета
    var acc = 0, fit = 0;
    for (var i = 0; i < paras.length; i++) { acc += paras[i].length + 2; if (acc <= budget || fit === 0) fit++; else break; }
    var over = paras.length - fit;
    if (over <= 0) return null;
    return { paras: paras, fit: fit, over: over, budget: budget };
  }
  function overflowPanel() {
    var info = overflowInfo(curSection()); if (!info) { return '<div class="pe-add-hd"><b>Всё помещается</b><button class="pe-x" data-act="ovclose">' + ic('x') + '</button></div><div class="pe-ov-sub">Текст укладывается на странице.</div>'; }
    var opt = S.ovOpt || 'continue';
    var opts = [
      ['continue', 'Продолжить на новой странице', 'Текст будет перенесён на следующую страницу с таким же оформлением.', true],
      ['layout', 'Выбрать другой макет', 'Подобрать композицию с бо́льшим местом для текста.', false],
      ['shorten', 'Предложить сокращение', 'Создать более короткий вариант текста с сохранением смысла.', false],
    ];
    var rows = opts.map(function (o) {
      return '<button class="pe-ov-opt' + (o[0] === opt ? ' on' : '') + '" data-act="ovopt" data-ovopt="' + o[0] + '">' +
        '<span class="pe-ov-radio"></span><span class="pe-ov-tx"><b>' + esc(o[1]) + (o[3] ? '<em>Рекомендуется</em>' : '') + '</b><span>' + esc(o[2]) + '</span></span></button>';
    }).join('');
    return '<div class="pe-add-hd"><b>Текст не помещается</b><button class="pe-x" data-act="ovclose">' + ic('x') + '</button></div>' +
      '<div class="pe-ov-sub">На странице закончилось место для текста. Нужно перенести ' + info.over + ' ' + plural(info.over, 'абзац', 'абзаца', 'абзацев') + '.</div>' +
      '<div class="pe-ov-opts">' + rows + '</div>' +
      '<div class="pe-ov-prev"><div class="pe-ov-pg">Стр. ' + (S.pageIdx + 1) + '<span>сейчас</span></div><i>→</i><div class="pe-ov-pg">Стр. ' + (S.pageIdx + 1) + '<span>после</span></div><div class="pe-ov-pg new">Стр. ' + (S.pageIdx + 2) + '<span>новая</span></div></div>' +
      '<div class="pe-ov-foot"><button class="pe-btn pe-btn-primary" data-act="ovapply" data-ovopt="' + opt + '">Перенести текст</button><button class="pe-btn pe-btn-ghost" data-act="ovclose">Отмена</button></div>' +
      '<div class="pe-ov-note">' + ic('check') + 'Текст будет сохранён полностью</div>';
  }
  function plural(n, a, b, c) { n = Math.abs(n) % 100; var n1 = n % 10; if (n > 10 && n < 20) return c; if (n1 > 1 && n1 < 5) return b; if (n1 === 1) return a; return c; }
  function applyOverflow(opt) {
    var s = curSection(); var info = overflowInfo(s);
    if (!info) { S.ovMode = false; render(); return; }
    if (opt === 'layout') { toast('Подбор макета с бо́льшим текстовым полем — в разработке'); S.ovMode = false; render(); return; }
    if (opt === 'shorten') { toast('AI-сокращение — отдельная операция с подтверждением «До / После»'); S.ovMode = false; render(); return; }
    mutate(function () {
      var keep = info.paras.slice(0, info.fit).join('\n\n');
      var rest = info.paras.slice(info.fit).join('\n\n');
      setOverride(s, 'body', keep);
      var ns = { id: 's' + Math.random().toString(16).slice(2, 8), family: 'editorial', enabled: true, assetRefs: [], contentBindings: { title: { mode: 'override', value: (cval(s, 'title') || 'О проекте') + ' · продолжение' }, body: { mode: 'override', value: rest } } };
      sections().splice(S.pageIdx + 1, 0, ns);
    });
    S.ovMode = false; render();
  }

  /* ---------- CONTENT TAB (per-family field editors) ---------- */
  function contentTab() {
    var s = curSection(); if (!s) return '';
    var h = '<div class="pe-sec-label">' + esc(FAM_LABEL[s.family] || s.family) + '</div>';
    h += FIELDS[s.family] ? FIELDS[s.family](s) : '<p class="hint">Нет настраиваемых полей.</p>';
    h += readinessCard();
    return h;
  }
  function fld(label, inner, srcSec, srcKey) {
    var src = (srcSec && isSource(srcSec, srcKey)) ? '<div class="pe-src"><span class="chip">' + ic('db') + 'Из CRM</span><button class="pe-mini-del" data-act="detach" data-key="' + srcKey + '" title="Отвязать и редактировать">✎</button></div>' : '';
    return '<div class="pe-field"><label>' + esc(label) + '</label>' + inner + src + '</div>';
  }
  function inp(key, val, ph) { return '<input class="pe-input" data-f="' + key + '" value="' + esc(val == null ? '' : val) + '" placeholder="' + esc(ph || '') + '">'; }
  function txt(key, val, ph) { return '<textarea class="pe-textarea" data-f="' + key + '" placeholder="' + esc(ph || '') + '">' + esc(val == null ? '' : val) + '</textarea>'; }

  var FIELDS = {
    hero: function (s) {
      var h = fld('Заголовок', inp('title', cval(s, 'title'), 'Название проекта'), s, 'title');
      h += fld('Подзаголовок', txt('subtitle', cval(s, 'subtitle'), 'Короткий слоган'), s, 'subtitle');
      h += priceField(s);
      h += metricsField(s, 'metrics', 'Показатели (до 4)');
      h += photoField(s, 0, 'Фотография обложки');
      return h;
    },
    editorial: function (s) {
      var h = fld('Надзаголовок', inp('eyebrow', joinArr(cval(s, 'eyebrow')), 'Кондоминиум · Пхукет'), s, 'eyebrow');
      h += fld('Заголовок', inp('title', cval(s, 'title'), 'О проекте'), s, 'title');
      h += fld('Текст', txt('body', cval(s, 'body'), 'Описание проекта'), s, 'body');
      h += metricsField(s, 'metrics', 'Показатели (до 4)');
      h += photoField(s, 0, 'Фотография');
      return h;
    },
    metrics: function (s) {
      var h = fld('Надзаголовок', inp('eyebrow', joinArr(cval(s, 'eyebrow'))), s, 'eyebrow');
      h += fld('Заголовок', inp('title', cval(s, 'title')), s, 'title');
      h += metricsField(s, 'metrics', 'Показатели (2–6)');
      h += photoField(s, 0, 'Фотография');
      return h;
    },
    gallery: function (s) {
      var h = fld('Надзаголовок', inp('eyebrow', joinArr(cval(s, 'eyebrow')))) ;
      h += fld('Заголовок', inp('title', cval(s, 'title')));
      h += galleryPicker(s);
      return h;
    },
    location: function (s) {
      var h = fld('Надзаголовок', inp('eyebrow', joinArr(cval(s, 'eyebrow'))));
      h += fld('Заголовок', inp('title', cval(s, 'title')), s, 'title');
      h += placesField(s);
      h += photoField(s, 0, 'Карта / фото района');
      return h;
    },
    floorplan: function (s) {
      var h = fld('Надзаголовок', inp('eyebrow', joinArr(cval(s, 'eyebrow'))));
      h += fld('Заголовок', inp('title', cval(s, 'title')), s, 'title');
      h += paramsField(s);
      h += photoField(s, 0, 'План');
      return h;
    },
    payment: function (s) {
      var plan = cval(s, 'plan') || { stages: [] };
      var h = fld('Надзаголовок', inp('eyebrow', joinArr(cval(s, 'eyebrow'))));
      h += fld('Заголовок', inp('title', cval(s, 'title')), s, 'title');
      h += fld('Подзаголовок', txt('subtitle', cval(s, 'subtitle')));
      h += '<div class="pe-row">' +
        '<div class="pe-field"><label>Базовая цена</label><input class="pe-input" data-pay="base" value="' + esc(plan.basePrice ? plan.basePrice.amount : '') + '" placeholder="200000"></div>' +
        '<div class="pe-field"><label>Валюта</label>' + curSelect('payc', plan.basePrice ? plan.basePrice.currency : 'USD') + '</div></div>';
      h += stagesField(s, plan);
      return h;
    },
    benefits: function (s) {
      var h = fld('Надзаголовок', inp('eyebrow', joinArr(cval(s, 'eyebrow'))));
      h += fld('Заголовок', inp('title', cval(s, 'title')), s, 'title');
      h += itemsField(s);
      h += photoField(s, 0, 'Фотография');
      return h;
    },
    broker: function (s) {
      return '<p class="hint">Страницы брокера берутся из раздела «Визитка брокера» и добавляются в конец документа.</p>' +
        '<div class="pe-switchrow"><span style="font-size:13px">Добавлять визитку брокера</span><button class="pe-toggle' + ((S.pres.brokerAppendix && S.pres.brokerAppendix.enabled) ? ' on' : '') + '" data-act="toggleBroker"></button></div>' +
        (S.brokers.length ? '<div class="pe-field"><label>Брокер</label><select class="pe-select" data-act="pickBroker">' + S.brokers.map(function (b) { return '<option value="' + b.id + '"' + (b.id === S.pres.brokerId ? ' selected' : '') + '>' + esc(b.name) + '</option>'; }).join('') + '</select></div>' : '');
    },
    comparison: function (s) { return '<p class="hint">Сравнение настраивается на уровне подборки.</p>'; },
    custom: function (s) { return fld('Заголовок', inp('title', cval(s, 'title'))); },
  };

  function priceField(s) {
    var p = cval(s, 'price') || { kind: 'from', amount: '', currency: 'USD' };
    return '<div class="pe-field"><label>Цена</label>' +
      '<div class="pe-row"><select class="pe-select" data-price="kind">' +
        [['from', 'от'], ['exact', 'точная'], ['range', 'диапазон'], ['on_request', 'по запросу']].map(function (o) { return '<option value="' + o[0] + '"' + (p.kind === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
      '</select>' + curSelect('price-cur', p.currency) + '</div>' +
      (p.kind === 'on_request' ? '' : '<input class="pe-input" style="margin-top:8px" data-price="amount" value="' + esc(p.amount || '') + '" placeholder="180000">') +
      (isSource(s, 'price') ? '<div class="pe-src"><span class="chip">' + ic('db') + 'Из CRM</span></div>' : '') +
    '</div>';
  }
  function curSelect(dataAttr, cur) { return '<select class="pe-select" data-' + dataAttr.replace(/[^a-z-]/g, '') + '="1" data-cursel="' + dataAttr + '">' + ['USD', 'EUR', 'THB', 'AED', 'RUB', 'GBP'].map(function (c) { return '<option' + (c === cur ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select>'; }

  function metricsField(s, key, label) {
    var arr = cval(s, key) || [];
    var rows = arr.map(function (m, i) { return '<div class="pe-metric-row" data-mi="' + i + '"><input class="v" data-mf="value" value="' + esc(m.value || '') + '" placeholder="800 м"><input data-mf="label" value="' + esc(m.label || '') + '" placeholder="подпись"><button class="pe-mini-del" data-act="delMetric" data-mi="' + i + '">×</button></div>'; }).join('');
    return '<div class="pe-field"><label>' + esc(label) + '</label><div class="pe-metriclist" data-metrics="' + key + '">' + rows + '</div><button class="pe-addrow" data-act="addMetric" data-key="' + key + '">+ Добавить показатель</button></div>';
  }
  function placesField(s) {
    var arr = cval(s, 'nearbyPlaces') || [];
    var rows = arr.map(function (m, i) { return '<div class="pe-metric-row" data-mi="' + i + '"><input data-pf="name" value="' + esc(m.name || '') + '" placeholder="Пляж"><input class="v" data-pf="distance" value="' + esc(m.distance || '') + '" placeholder="800 м"><button class="pe-mini-del" data-act="delPlace" data-mi="' + i + '">×</button></div>'; }).join('');
    return '<div class="pe-field"><label>Что рядом</label><div class="pe-metriclist" data-places="1">' + rows + '</div><button class="pe-addrow" data-act="addPlace">+ Добавить место</button></div>';
  }
  function paramsField(s) {
    var arr = cval(s, 'params') || [];
    var rows = arr.map(function (m, i) { return '<div class="pe-metric-row" data-mi="' + i + '"><input data-qf="label" value="' + esc(m.label || '') + '" placeholder="Площадь"><input class="v" data-qf="value" value="' + esc(m.value || '') + '" placeholder="84 м²"><button class="pe-mini-del" data-act="delParam" data-mi="' + i + '">×</button></div>'; }).join('');
    return '<div class="pe-field"><label>Параметры</label><div class="pe-metriclist" data-params="1">' + rows + '</div><button class="pe-addrow" data-act="addParam">+ Добавить параметр</button></div>';
  }
  function itemsField(s) {
    var arr = cval(s, 'items') || [];
    var rows = arr.map(function (m, i) { return '<div class="pe-metric-row" data-mi="' + i + '" style="flex-direction:column;align-items:stretch;gap:6px"><input data-if="title" value="' + esc(m.title || '') + '" placeholder="Заголовок"><div style="display:flex;gap:6px"><input data-if="desc" value="' + esc(m.desc || '') + '" placeholder="Описание"><button class="pe-mini-del" data-act="delItem" data-mi="' + i + '">×</button></div></div>'; }).join('');
    return '<div class="pe-field"><label>Преимущества (2–5)</label><div class="pe-metriclist" data-items="1">' + rows + '</div><button class="pe-addrow" data-act="addItem">+ Добавить</button></div>';
  }
  function stagesField(s, plan) {
    var arr = plan.stages || [];
    var rows = arr.map(function (m, i) { return '<div class="pe-metric-row" data-mi="' + i + '" style="flex-direction:column;align-items:stretch;gap:6px">' +
      '<input data-sf="name" value="' + esc(m.name || '') + '" placeholder="Бронирование">' +
      '<div style="display:flex;gap:6px;align-items:center"><input class="v" data-sf="percent" value="' + esc(m.percent || '') + '" placeholder="10" style="flex:0 0 60px"><span style="color:var(--pe-mut)">%</span><input data-sf="note" value="' + esc(m.note || '') + '" placeholder="комментарий"><button class="pe-mini-del" data-act="delStage" data-mi="' + i + '">×</button></div></div>'; }).join('');
    var sum = arr.reduce(function (a, x) { return a + (+x.percent || 0); }, 0);
    return '<div class="pe-field"><label>Этапы оплаты · сумма ' + sum + '%</label><div class="pe-paylist" data-stages="1">' + rows + '</div><button class="pe-addrow" data-act="addStage">+ Добавить этап</button></div>';
  }

  function photoField(s, idx, label) {
    var ref = (s.assetRefs || [])[idx];
    var url = ref ? ((S.assets[ref.assetId] || {}).url || ref.url) : '';
    return '<div class="pe-field"><label>' + esc(label) + '</label>' +
      '<div class="pe-photo-prev" data-act="focal" data-idx="' + idx + '">' + (url ? '<img src="' + esc(url) + '">' : '') + '</div>' +
      '<div class="pe-row"><button class="pe-btn" style="width:100%;justify-content:center;height:36px;font-size:13px" data-act="replacePhoto" data-idx="' + idx + '">' + ic('image') + 'Заменить</button>' +
      '<button class="pe-btn" style="width:100%;justify-content:center;height:36px;font-size:13px" data-act="cropFmt" data-idx="' + idx + '"' + (url ? '' : ' disabled') + '>' + ic('crop') + 'Кадрировать</button></div></div>';
  }
  function galleryPicker(s) {
    var imgs = (S.source.images || []);
    var chosen = (s.assetRefs || []).map(function (r) { return r.assetId; });
    return '<div class="pe-field"><label>Фотографии</label><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">' +
      imgs.map(function (u, i) { var id = 'img' + i; var on = chosen.indexOf(id) >= 0; return '<div data-act="galtoggle" data-gid="' + id + '" style="aspect-ratio:1;border-radius:7px;overflow:hidden;cursor:pointer;outline:' + (on ? '2px solid var(--pe-sel)' : '1px solid var(--pe-line)') + ';outline-offset:-1px;position:relative"><img src="' + esc(absU(u)) + '" style="width:100%;height:100%;object-fit:cover">' + (on ? '<span style="position:absolute;top:3px;right:3px;background:var(--pe-sel);color:#fff;border-radius:50%;width:16px;height:16px;font-size:11px;display:flex;align-items:center;justify-content:center">✓</span>' : '') + '</div>'; }).join('') +
      '</div><div class="hint">Выбрано: ' + chosen.length + '</div></div>';
  }
  function absU(u) { return (u && /^assets\//.test(u)) ? '/' + u : u; }

  function readinessCard() {
    if (!S.chk) return '';
    var st = S.chk.steps || { done: 0, total: 5, next: '' };
    return '<div class="pe-ready" id="peReady"><div class="pe-ready-hd"><b><span class="pe-ready-ring"></span>Следующий шаг</b><span>' + st.done + ' из ' + st.total + ' шагов</span></div><p>' + esc(st.next) + '</p>' +
      '<div style="font-size:12px;color:' + (S.chk.ok ? '#2e7d32' : '#c62828') + '">' + (S.chk.ok ? '● Нет ошибок' : '● ' + (S.chk.issues.filter(function (i) { return i.severity === 'blocking'; }).length) + ' ошибк(и)') + ' · ' + S.chk.pageCount + ' стр.</div></div>';
  }

  /* ---------- COMPOSITION TAB ---------- */
  function compositionTab() {
    var s = curSection(); if (!s) return '';
    var compatible = ['hero', 'editorial', 'metrics', 'gallery', 'location', 'floorplan', 'payment', 'benefits'];
    var h = '<div class="pe-sec-label">Макет страницы</div><p class="hint" style="margin-bottom:12px">Переключение сохраняет содержание. Несопоставимые блоки остаются в черновике.</p>';
    h += '<div class="pe-variants">' + compatible.map(function (f) {
      return '<div class="pe-var' + (f === s.family ? ' on' : '') + '" data-act="setFamily" data-fam="' + f + '"><div class="pe-var-prev" data-varmini="' + f + '"></div><div class="pe-var-nm">' + esc(FAM_LABEL[f]) + '</div></div>';
    }).join('') + '</div>';
    if (s.family === 'editorial' || s.family === 'metrics' || s.family === 'benefits') {
      h += '<div class="pe-hd">Параметры</div><div class="pe-switchrow"><span style="font-size:13px">Зеркально (фото / текст)</span><button class="pe-toggle' + (s.styleOverrides && s.styleOverrides.mirror ? ' on' : '') + '" data-act="mirror"></button></div>';
    }
    return h;
  }

  /* ---------- STYLE TAB ---------- */
  function styleTab() {
    var pal = TOK.palette(S.pres.theme.paletteId), fp = TOK.fontPair(S.pres.theme.fontPairId);
    return '<div class="pe-sec-label">Стиль документа</div>' +
      '<div class="pe-field"><label>Палитра</label><div class="pe-swatch-row"><div class="pe-swatch" style="background:' + pal.c.accent + '"></div><div class="pe-swatch-tx"><b>' + esc(pal.name) + '</b><span>' + pal.c.accent + '</span></div></div></div>' +
      '<div class="pe-field"><label>Шрифты</label><div style="font-size:13px">' + esc(fp.heading.family) + ' + ' + esc(fp.body.family) + '</div></div>' +
      '<button class="pe-btn pe-btn-primary" style="width:100%;justify-content:center" data-act="openStyle">' + ic('palette') + 'Открыть «Стиль презентации»</button>' +
      '<p class="hint" style="margin-top:12px">Стиль применяется ко всем страницам и визитке.</p>';
  }

  /* ================= WIRING ================= */
  function wire() {
    root.querySelectorAll('[data-act]').forEach(function (el) {
      var act = el.getAttribute('data-act');
      el.addEventListener(actEvent(act), function (e) { handle(act, el, e); });
    });
    // page select (плоские миниатюры + строки групп подборки)
    root.querySelectorAll('.pe-nav-list [data-pg]').forEach(function (el) { if (el.getAttribute('data-act')) return; el.addEventListener('click', function (e) { if (e.target.closest('[data-act]')) return; var v = el.getAttribute('data-pg'); if (v === '') return; S.pageIdx = +v; render(); }); });
    // format tabs
    root.querySelectorAll('[data-fmt]').forEach(function (el) { el.addEventListener('click', function () { S.fmt = el.getAttribute('data-fmt'); S.pres.defaultFormat = S.fmt; scheduleSave(); render(); revalidate(); }); });
    // inspector tabs
    root.querySelectorAll('[data-tab]').forEach(function (el) { el.addEventListener('click', function () { S.tab = el.getAttribute('data-tab'); var ib = document.getElementById('peInsp'); ib.innerHTML = inspBody(); wireInsp(); mountVarMinis(); }); });
    if (S.addMode) wireAddPanel(); else wireInsp();
  }
  function wireAddPanel() {
    var s = document.getElementById('peBlSearch'); if (!s) return;
    s.addEventListener('input', function () {
      var v = s.value.toLowerCase();
      document.querySelectorAll('.pe-bl').forEach(function (b) { b.style.display = b.textContent.toLowerCase().indexOf(v) >= 0 ? '' : 'none'; });
    });
  }
  function actEvent(a) { return 'click'; }

  // inspector field inputs (live)
  function wireInsp() {
    var ib = document.getElementById('peInsp'); if (!ib) return;
    ib.querySelectorAll('[data-f]').forEach(function (el) { el.addEventListener('input', function () { onFieldInput(el.getAttribute('data-f'), el.value); }); });
    ib.querySelectorAll('[data-price]').forEach(function (el) { el.addEventListener('input', onPrice); el.addEventListener('change', onPrice); });
    ib.querySelectorAll('[data-mf]').forEach(function (el) { el.addEventListener('input', function () { onListInput('metrics', el); }); });
    ib.querySelectorAll('[data-pf]').forEach(function (el) { el.addEventListener('input', function () { onListInput('places', el); }); });
    ib.querySelectorAll('[data-qf]').forEach(function (el) { el.addEventListener('input', function () { onListInput('params', el); }); });
    ib.querySelectorAll('[data-if]').forEach(function (el) { el.addEventListener('input', function () { onListInput('items', el); }); });
    ib.querySelectorAll('[data-sf]').forEach(function (el) { el.addEventListener('input', function () { onListInput('stages', el); }); });
    ib.querySelectorAll('[data-pay]').forEach(function (el) { el.addEventListener('input', onPayBase); });
    ib.querySelectorAll('[data-cursel]').forEach(function (el) { el.addEventListener('change', onCur); });
    ib.querySelectorAll('[data-act]').forEach(function (el) { var a = el.getAttribute('data-act'); el.addEventListener('click', function (e) { handle(a, el, e); }); });
  }

  function onFieldInput(key, val) {
    var s = curSection();
    if (key === 'eyebrow') setOverride(s, key, splitArr(val));
    else setOverride(s, key, val);
    liveCanvas(); scheduleSave(); paintNavTitle(); clearTimeout(S._chkT2); S._chkT2 = setTimeout(revalidate, 600);
  }
  function onPrice(e) {
    var s = curSection(); var p = cval(s, 'price') || { kind: 'from', currency: 'USD' };
    var el = e.target, k = el.getAttribute('data-price');
    if (el.getAttribute('data-cursel')) { p.currency = el.value; } else p[k] = el.value;
    setOverride(s, 'price', Object.assign({}, p));
    if (k === 'kind') { document.getElementById('peInsp').innerHTML = inspBody(); wireInsp(); }
    liveCanvas(); scheduleSave();
  }
  function onCur(e) { // currency selects that aren't price
    var el = e.target; var ds = el.getAttribute('data-cursel'); var s = curSection();
    if (ds === 'price-cur') { var p = cval(s, 'price') || {}; p.currency = el.value; setOverride(s, 'price', Object.assign({}, p)); }
    else if (ds === 'payc') { var pl = cval(s, 'plan') || {}; pl.basePrice = pl.basePrice || {}; pl.basePrice.currency = el.value; setOverride(s, 'plan', Object.assign({}, pl)); }
    liveCanvas(); scheduleSave();
  }
  function onPayBase(e) { var s = curSection(); var pl = cval(s, 'plan') || { stages: [] }; pl.basePrice = pl.basePrice || { currency: 'USD' }; pl.basePrice.amount = e.target.value; setOverride(s, 'plan', Object.assign({}, pl)); liveCanvas(); scheduleSave(); }
  function onListInput(kind, el) {
    var s = curSection(); var row = el.closest('[data-mi]'); var i = +row.getAttribute('data-mi');
    if (kind === 'metrics') { var arr = (cval(s, 'metrics') || []).slice(); arr[i] = Object.assign({}, arr[i], defineProp(el.getAttribute('data-mf'), el.value)); setOverride(s, 'metrics', arr); }
    if (kind === 'places') { var a2 = (cval(s, 'nearbyPlaces') || []).slice(); a2[i] = Object.assign({}, a2[i], defineProp(el.getAttribute('data-pf'), el.value)); setOverride(s, 'nearbyPlaces', a2); }
    if (kind === 'params') { var a3 = (cval(s, 'params') || []).slice(); a3[i] = Object.assign({}, a3[i], defineProp(el.getAttribute('data-qf'), el.value)); setOverride(s, 'params', a3); }
    if (kind === 'items') { var a4 = (cval(s, 'items') || []).slice(); a4[i] = Object.assign({}, a4[i], defineProp(el.getAttribute('data-if'), el.value)); setOverride(s, 'items', a4); }
    if (kind === 'stages') { var pl = cval(s, 'plan') || { stages: [] }; pl.stages = (pl.stages || []).slice(); pl.stages[i] = Object.assign({}, pl.stages[i], defineProp(el.getAttribute('data-sf'), el.value)); setOverride(s, 'plan', Object.assign({}, pl)); if (el.getAttribute('data-sf') === 'percent') { updateStageSum(); } }
    liveCanvas(); scheduleSave(); clearTimeout(S._chkT2); S._chkT2 = setTimeout(revalidate, 600);
  }
  function defineProp(k, v) { var o = {}; o[k] = v; return o; }
  function updateStageSum() { var s = curSection(); var pl = cval(s, 'plan') || { stages: [] }; var sum = (pl.stages || []).reduce(function (a, x) { return a + (+x.percent || 0); }, 0); var lab = document.querySelector('[data-stages]'); if (lab) { var l = lab.previousElementSibling ? null : null; var f = document.querySelector('.pe-field label'); } var hdr = document.querySelector('[data-stages]').closest('.pe-field').querySelector('label'); if (hdr) hdr.textContent = 'Этапы оплаты · сумма ' + sum + '%'; }

  /* ---------- «История версий» (макет) ---------- */
  function hTime(ts) {
    var d = new Date(ts), now = new Date();
    var hhmm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    var sameDay = d.toDateString() === now.toDateString();
    var yest = new Date(now); yest.setDate(now.getDate() - 1);
    if (sameDay) return 'Сегодня, ' + hhmm;
    if (d.toDateString() === yest.toDateString()) return 'Вчера, ' + hhmm;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ', ' + hhmm;
  }
  function objCards(objs) {
    if (!objs || !objs.length) return '<div class="pe-bl-empty">Нет объектов</div>';
    return objs.map(function (o) {
      var cur = o.currency === 'EUR' ? '€' : o.currency === 'THB' ? '฿' : '$';
      return '<div class="hv-obj"><div class="hv-obj-nm">' + esc(o.name) + '</div><div class="hv-obj-m">' + (o.priceFrom ? 'от ' + cur + ' ' + (o.priceFrom).toLocaleString('ru-RU') : '') + '</div></div>';
    }).join('');
  }
  function openHistory() {
    api('GET', '/' + ID + '/history').then(function (r) {
      if (r.status !== 200) { toast('Не удалось', (r.json && r.json.error) || ''); return; }
      historyModal(r.json);
    });
  }
  function historyModal(data) {
    var versions = data.versions || [];
    var sel = 0;   // индекс выбранной версии (0 = самая свежая)
    var ov = document.createElement('div'); ov.className = 'pu-overlay';
    function listHtml() {
      var cur = '<div class="hv-item hv-cur' + (sel === -1 ? ' on' : '') + '" data-hsel="-1"><div class="hv-dot"></div><div class="hv-it-b"><b>Текущий черновик</b><span>' + (data.current.objects.length) + ' ' + plural(data.current.objects.length, 'объект', 'объекта', 'объектов') + '</span></div></div>';
      var items = versions.map(function (v, i) {
        return '<div class="hv-item' + (i === sel ? ' on' : '') + '" data-hsel="' + i + '"><div class="hv-dot"></div><div class="hv-it-b"><b>' + esc(hTime(v.at)) + (v.by ? ' · ' + esc(v.by) : '') + '</b><span>' + esc(v.label || v.type) + '</span></div></div>';
      }).join('');
      return cur + items;
    }
    function paint() {
      var v = versions[sel];
      var selObjs = v ? v.objects : data.current.objects;
      var selTitle = v ? hTime(v.at) + (v.by ? ' · ' + v.by : '') : 'Текущий черновик';
      var diff = v ? v.diff : [];
      ov.querySelector('.hv-list').innerHTML = listHtml();
      ov.querySelectorAll('[data-hsel]').forEach(function (el) { el.addEventListener('click', function () { sel = +el.getAttribute('data-hsel'); paint(); }); });
      ov.querySelector('.hv-selhd').textContent = selObjs === data.current.objects && sel !== -1 ? 'Версия' : 'Выбранная версия';
      ov.querySelector('.hv-seltt').textContent = selTitle;
      ov.querySelector('.hv-selobjs').innerHTML = objCards(selObjs);
      ov.querySelector('.hv-curobjs').innerHTML = objCards(data.current.objects);
      ov.querySelector('.hv-diff').innerHTML = diff.length ? diff.map(function (d) { return '<div class="hv-chg">' + ic(d.icon || 'db') + '<div><b>' + esc(d.title) + '</b><span>' + esc(d.sub || '') + '</span></div></div>'; }).join('') : '<div class="pe-bl-empty">Это текущая версия</div>';
      var rbtn = ov.querySelector('.hv-restore'); rbtn.style.display = (v ? '' : 'none');
      rbtn.setAttribute('data-vid', v ? v.id : '');
    }
    ov.innerHTML = '<div class="pu-box hv-box"><div class="pu-hd"><h2>История версий</h2><button class="pe-x" data-puclose>' + ic('x') + '</button></div>' +
      '<div class="hv-grid">' +
        '<div class="hv-col hv-listcol"><div class="hv-list"></div></div>' +
        '<div class="hv-col"><div class="hv-colhd hv-selhd">Выбранная версия</div><div class="hv-seltt"></div><div class="hv-selobjs"></div></div>' +
        '<div class="hv-col"><div class="hv-colhd">Текущий черновик</div><div class="hv-seltt">' + esc(data.current.title || '') + '</div><div class="hv-curobjs"></div></div>' +
        '<div class="hv-col hv-diffcol"><div class="hv-colhd">Что изменилось</div><div class="hv-diff"></div><button class="pe-btn pe-btn-primary hv-restore" style="width:100%;justify-content:center;margin-top:16px">Восстановить в черновик</button></div>' +
      '</div></div>';
    document.body.appendChild(ov);
    function close() { ov.remove(); }
    ov.querySelectorAll('[data-puclose]').forEach(function (b) { b.addEventListener('click', close); });
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('.hv-restore').addEventListener('click', function () {
      var vid = this.getAttribute('data-vid'); if (!vid) return;
      api('POST', '/' + ID + '/restore', { versionId: vid }).then(function (r) { close(); if (r.status === 200) { toast('Восстановлено', 'Новый черновик из версии', true); reloadPres(); } else toast('Не удалось'); });
    });
    paint();
  }

  /* ---------- action handlers ---------- */
  function handle(act, el, e) {
    var s = curSection();
    switch (act) {
      case 'undo': doUndo(); break;
      case 'redo': doRedo(); break;
      case 'preview': window.open('/pres/' + ID + '/print?format=' + S.fmt, '_blank'); break;
      case 'export': openExport(); break;
      case 'openStyle': openStyle(); break;
      case 'zoomin': setZoom(curZoom() + 0.1); break;
      case 'zoomout': setZoom(curZoom() - 0.1); break;
      case 'zoomfit': S.zoom = 'fit'; fitCanvas(); document.getElementById('peZoomL').textContent = 'Fit'; break;
      case 'addpage': S.addMode = true; S.addPickKey = S.addPickKey || 'editorial'; S.addQ = ''; render(); break;
      case 'addclose': S.addMode = false; render(); break;
      case 'grptoggle': S.openGroups = S.openGroups || {}; var gk = +el.getAttribute('data-gk'); S.openGroups[gk] = !S.openGroups[gk]; render(); break;
      case 'objmenu': objMenu(el, +el.getAttribute('data-gk')); break;
      case 'addobj': toast('Добавить объекты', 'Поиск и выбор объектов — экран в разработке'); break;
      case 'history': openHistory(); break;
      case 'ovopen': S.ovMode = true; S.addMode = false; S.ovOpt = 'continue'; render(); break;
      case 'ovclose': S.ovMode = false; render(); break;
      case 'ovopt': S.ovOpt = el.getAttribute('data-ovopt'); render(); break;
      case 'ovapply': applyOverflow(el.getAttribute('data-ovopt') || S.ovOpt || 'continue'); break;
      case 'blpick': S.addPickKey = el.getAttribute('data-blkey'); render(); break;
      case 'blinsert': insertBlock(el.getAttribute('data-blfam')); break;
      case 'pgmenu': pageMenu(el, +el.getAttribute('data-pg')); break;
      case 'addMetric': mutate(function () { var k = el.getAttribute('data-key'); var arr = (cval(s, k) || []).slice(); arr.push({ value: '', label: '' }); setOverride(s, k, arr); }); break;
      case 'delMetric': mutate(function () { var arr = (cval(s, 'metrics') || []).slice(); arr.splice(+el.getAttribute('data-mi'), 1); setOverride(s, 'metrics', arr); }); break;
      case 'addPlace': mutate(function () { var arr = (cval(s, 'nearbyPlaces') || []).slice(); arr.push({ name: '', distance: '' }); setOverride(s, 'nearbyPlaces', arr); }); break;
      case 'delPlace': mutate(function () { var arr = (cval(s, 'nearbyPlaces') || []).slice(); arr.splice(+el.getAttribute('data-mi'), 1); setOverride(s, 'nearbyPlaces', arr); }); break;
      case 'addParam': mutate(function () { var arr = (cval(s, 'params') || []).slice(); arr.push({ label: '', value: '' }); setOverride(s, 'params', arr); }); break;
      case 'delParam': mutate(function () { var arr = (cval(s, 'params') || []).slice(); arr.splice(+el.getAttribute('data-mi'), 1); setOverride(s, 'params', arr); }); break;
      case 'addItem': mutate(function () { var arr = (cval(s, 'items') || []).slice(); arr.push({ title: '', desc: '' }); setOverride(s, 'items', arr); }); break;
      case 'delItem': mutate(function () { var arr = (cval(s, 'items') || []).slice(); arr.splice(+el.getAttribute('data-mi'), 1); setOverride(s, 'items', arr); }); break;
      case 'addStage': mutate(function () { var pl = cval(s, 'plan') || { stages: [] }; pl.stages = (pl.stages || []).concat({ name: '', percent: '' }); setOverride(s, 'plan', Object.assign({}, pl)); }); break;
      case 'delStage': mutate(function () { var pl = cval(s, 'plan') || { stages: [] }; pl.stages = (pl.stages || []).slice(); pl.stages.splice(+el.getAttribute('data-mi'), 1); setOverride(s, 'plan', Object.assign({}, pl)); }); break;
      case 'replacePhoto': replacePhoto(s, +el.getAttribute('data-idx')); break;
      case 'cropFmt': openCropFormat(s, +el.getAttribute('data-idx')); break;
      case 'focal': setFocal(s, +el.getAttribute('data-idx'), e); break;
      case 'focalHint': toast('Кликните по фото, чтобы задать точку фокуса'); break;
      case 'galtoggle': galToggle(s, el.getAttribute('data-gid')); break;
      case 'setFamily': mutate(function () { s.family = el.getAttribute('data-fam'); }); break;
      case 'mirror': mutate(function () { s.styleOverrides = s.styleOverrides || {}; s.styleOverrides.mirror = !s.styleOverrides.mirror; }); break;
      case 'detach': mutate(function () { setOverride(s, el.getAttribute('data-key'), cval(s, el.getAttribute('data-key'))); }); break;
      case 'toggleBroker': mutate(function () { S.pres.brokerAppendix = S.pres.brokerAppendix || {}; S.pres.brokerAppendix.enabled = !S.pres.brokerAppendix.enabled; }); break;
      case 'pickBroker': S.pres.brokerId = el.value; S.pres.brokerAppendix = S.pres.brokerAppendix || {}; S.pres.brokerAppendix.enabled = true; scheduleSave(); break;
    }
  }

  function replacePhoto(s, idx) {
    var imgs = (S.source.images || []).map(function (u, i) { return { id: 'img' + i, url: absU(u) }; });
    (S.source.layouts || []).forEach(function (l, i) { imgs.push({ id: 'plan' + i, url: absU(l.url) }); });
    overlayPick('Выберите фотографию', imgs, function (pick) {
      mutate(function () { s.assetRefs = s.assetRefs || []; s.assetRefs[idx] = Object.assign({}, s.assetRefs[idx], { assetId: pick.id, fit: s.family === 'floorplan' ? 'contain' : 'cover' }); });
    });
  }
  function setFocal(s, idx, e) {
    var ref = (s.assetRefs || [])[idx]; if (!ref) return;
    var box = e.currentTarget.getBoundingClientRect();
    var x = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width));
    var y = Math.max(0, Math.min(1, (e.clientY - box.top) / box.height));
    mutate(function () { ref.focalPoint = { x: +x.toFixed(2), y: +y.toFixed(2) }; }, { render: false });
    liveCanvas();
  }
  function galToggle(s, gid) {
    mutate(function () {
      s.assetRefs = s.assetRefs || [];
      var i = s.assetRefs.findIndex(function (r) { return r.assetId === gid; });
      if (i >= 0) s.assetRefs.splice(i, 1); else if (s.assetRefs.length < 20) s.assetRefs.push({ assetId: gid });
    });
  }

  /* ---------- canvas mount ---------- */
  function mountCanvas() {
    var stage = document.getElementById('peStage'); if (!stage) return;
    var s = curSection(); if (!s) { stage.innerHTML = ''; return; }
    var pages;
    try { pages = T.renderSection(withMirror(s), ctx()); } catch (e) { pages = ['<div class="lp-safe lp-empty">Ошибка макета</div>']; }
    var f = TOK.format(S.fmt);
    stage.innerHTML = pages.map(function (html) { return '<div style="margin-bottom:18px">' + wrapPage(html, f) + '</div>'; }).join('');
    // actually wrapPage returns full .lp-page; set stage sizing on outer
    stage.innerHTML = pages.map(function (html) { return html; }).join('');
    fitCanvas();
  }
  function wrapPage(html, f) { return html; }
  function withMirror(s) { if (s.styleOverrides && s.styleOverrides.mirror) { /* mirror handled via class later; pass through */ } return s; }
  function liveCanvas() { mountCanvas(); }

  function curZoom() { var f = TOK.format(S.fmt); var stage = document.getElementById('peStage'); if (!stage) return 1; var m = stage.style.transform.match(/scale\(([\d.]+)\)/); return m ? +m[1] : 1; }
  function setZoom(z) { z = Math.max(0.25, Math.min(2, z)); S.zoom = z; var stage = document.getElementById('peStage'); if (stage) { stage.style.transform = 'scale(' + z + ')'; } var zl = document.getElementById('peZoomL'); if (zl) zl.textContent = Math.round(z * 100) + '%'; }
  function fitCanvas() {
    var stage = document.getElementById('peStage'), canvas = document.getElementById('peCanvas'); if (!stage || !canvas) return;
    var f = TOK.format(S.fmt);
    var pageEl = stage.querySelector('.lp-page'); if (!pageEl) return;
    if (S.zoom === 'fit') {
      var availW = canvas.clientWidth - 80, availH = canvas.clientHeight - 90;
      var s = Math.min(availW / f.cssW, availH / f.cssH, 1.2);
      stage.style.transform = 'scale(' + s + ')';
      var zl = document.getElementById('peZoomL'); if (zl) zl.textContent = 'Fit';
    } else setZoom(S.zoom);
  }

  // navigator mini previews
  function mountNavMinis() {
    document.querySelectorAll('[data-mini]').forEach(function (box) {
      var i = +box.getAttribute('data-mini'); var s = sections()[i]; if (!s) return;
      var f = TOK.format(S.fmt);
      var html; try { html = T.renderSection(s, ctx())[0] || ''; } catch (e) { html = ''; }
      var w = box.clientWidth || 180; var sc = w / f.cssW;
      box.innerHTML = '<div class="pe-mini-stage" style="width:' + f.cssW + 'px;height:' + f.cssH + 'px;transform:scale(' + sc + ')">' + html + '</div>';
    });
  }
  function mountVarMinis() {
    document.querySelectorAll('[data-varmini]').forEach(function (box) {
      var fam = box.getAttribute('data-varmini'); var s = curSection(); if (!s) return;
      var tmp = Object.assign({}, s, { family: fam }); var f = TOK.format(S.fmt);
      var html; try { html = T.renderSection(tmp, ctx())[0] || ''; } catch (e) { html = ''; }
      var w = box.clientWidth || 100; var sc = w / f.cssW;
      box.innerHTML = '<div style="position:absolute;top:0;left:0;transform-origin:top left;width:' + f.cssW + 'px;height:' + f.cssH + 'px;transform:scale(' + sc + ')">' + html + '</div>';
    });
  }

  function paintNavTitle() { var el = document.querySelector('.pe-thumb[data-pg="' + S.pageIdx + '"] .pe-thumb-t'); if (el) el.textContent = sectionTitle(curSection()); mountNavMinis(); }
  function paintNavErrors() { sections().forEach(function (s, i) { var el = document.querySelector('.pe-thumb[data-pg="' + i + '"]'); if (!el) return; var err = S.chk && S.chk.issues.some(function (x) { return x.sectionId === s.id && x.severity === 'blocking'; }); el.classList.toggle('err', !!err); }); }
  function paintReadiness() { var el = document.getElementById('peReady'); if (el && S.tab === 'content') { var tmp = document.createElement('div'); tmp.innerHTML = readinessCard(); if (tmp.firstChild) el.replaceWith(tmp.firstChild); } }
  function updatePageCount() { var el = document.getElementById('pePageCount'); if (el && S.chk) el.textContent = S.chk.pageCount + ' физических страниц'; }

  /* ---------- menus ---------- */
  function pageMenu(anchor, i) {
    var s = sections()[i];
    menu(anchor, [
      { t: 'Дублировать', ic: 'copy', fn: function () { mutate(function () { var c = JSON.parse(JSON.stringify(s)); c.id = 's' + Math.random().toString(16).slice(2, 8); sections().splice(i + 1, 0, c); }); } },
      { t: s.enabled === false ? 'Показать' : 'Скрыть', ic: 'eye', fn: function () { mutate(function () { s.enabled = s.enabled === false; }); } },
      { t: 'Вверх', ic: 'up', fn: function () { if (i > 0) mutate(function () { sections().splice(i - 1, 0, sections().splice(i, 1)[0]); S.pageIdx = i - 1; }); } },
      { t: 'Вниз', ic: 'down', fn: function () { if (i < sections().length - 1) mutate(function () { sections().splice(i + 1, 0, sections().splice(i, 1)[0]); S.pageIdx = i + 1; }); } },
      { sep: 1 },
      { t: 'Удалить', ic: 'trash', danger: 1, fn: function () { mutate(function () { sections().splice(i, 1); S.pageIdx = Math.max(0, S.pageIdx - (i <= S.pageIdx ? 1 : 0)); }); } },
    ]);
  }
  function objMenu(anchor, k) {
    menu(anchor, [
      { t: 'Проверить обновления', ic: 'db', fn: function () { openObjectUpdates(k); } },
      { t: 'Заменить объект', ic: 'image', fn: function () { openReplaceObject(k); } },
      { t: 'Настроить страницы', ic: 'dots', fn: function () { S.openGroups = S.openGroups || {}; S.openGroups[k] = true; render(); } },
      { t: 'Исключить из подборки', ic: 'trash', fn: function () { mutate(function () { collectionGroups().forEach(function (g) { if (g.type === 'object' && g.k === k) g.idx.forEach(function (i) { sections()[i].enabled = false; }); }); }); } },
    ]);
  }
  /* ---------- «Кадрирование под формат» (макет §6) ---------- */
  var FMT_ASPECT = { portrait_a4: 210 / 297, landscape_a4: 297 / 210, landscape_16_9: 1280 / 720, portrait_9_16: 576 / 1024 };
  var FMT_LABEL2 = { portrait_a4: 'A4 вертикальный', landscape_a4: 'A4 горизонтальный', landscape_16_9: '16:9 горизонтальный', portrait_9_16: '9:16 вертикальный' };
  var FMT_EX = { portrait_a4: '210 × 297 мм', landscape_a4: '297 × 210 мм', landscape_16_9: '1920 × 1080', portrait_9_16: '1080 × 1920' };
  function openCropFormat(s, idx) {
    var ref = (s.assetRefs || [])[idx]; if (!ref) { toast('Нет фото'); return; }
    var url = (S.assets[ref.assetId] || {}).url || ref.url; if (!url) { toast('Нет фото'); return; }
    var img = new Image();
    img.onload = function () { cropFmtModal(s, idx, ref, url, img.naturalWidth || 1600, img.naturalHeight || 1067); };
    img.onerror = function () { cropFmtModal(s, idx, ref, url, 1600, 1067); };
    img.src = url;
  }
  function cropFmtModal(s, idx, ref, url, iw, ih) {
    var mode = ref.fit === 'contain' ? 'fit' : 'fill';
    var imgA = iw / ih;
    var ov = document.createElement('div'); ov.className = 'pu-overlay';
    function suggestFit(fmtA) { return fmtA < 0.9 && imgA > 1.25; }
    function fmtPrev(fmt) {
      var a = FMT_ASPECT[fmt]; var fit = mode === 'fit';
      var portrait = a < 1;
      return '<div class="cf-fmt"><div class="cf-fmt-hd">' + esc(FMT_LABEL2[fmt]) + (suggestFit(a) && !fit ? '<span class="cf-warn-dot"></span>' : '') + '</div>' +
        '<div class="cf-fmt-frame' + (portrait ? ' port' : ' land') + '"><div class="cf-fmt-img" style="background-image:url(\'' + esc(url) + '\');background-size:' + (fit ? 'contain' : 'cover') + '"></div></div>' +
        '<div class="cf-fmt-ex">' + esc(FMT_EX[fmt]) + '</div></div>';
    }
    function warnBox() {
      var curA = FMT_ASPECT[S.fmt] || 0.707;
      if (mode === 'fill' && suggestFit(curA)) return '<div class="cf-warn">' + ic('warn') + '<div><b>Для вертикальной обложки лучше макет с полями.</b><span>Так объект выглядит гармоничнее и сохраняются пропорции.</span></div></div>';
      return '';
    }
    function paint() {
      ov.querySelector('.cf-main-img').style.backgroundSize = (mode === 'fit' ? 'contain' : 'cover');
      ov.querySelectorAll('[data-cfmode]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-cfmode') === mode); });
      ov.querySelector('.cf-prevs').innerHTML = fmtPrev('portrait_a4') + fmtPrev('landscape_16_9');
      ov.querySelector('.cf-warnbox').innerHTML = warnBox();
    }
    var modes = [['fill', 'Заполнить область', 'Приоритет на крупный план, часть фото может быть обрезана'], ['fit', 'Сохранить объект целиком', 'На фото останется весь объект, без обрезки важных элементов']];
    ov.innerHTML = '<div class="pu-box cf-box"><div class="pu-hd"><h2>Кадрирование под формат</h2><button class="pe-x" data-puclose>' + ic('x') + '</button></div>' +
      '<div class="cf-grid"><div class="cf-left">' +
        '<div class="cf-main"><div class="cf-main-img" style="background-image:url(\'' + esc(url) + '\')"></div><div class="cf-cropframe"></div></div>' +
        '<div class="cf-src">Исходное фото · ' + iw + ' × ' + ih + '</div>' +
        '<div class="cf-modes">' + modes.map(function (m) { return '<button class="cf-mode" data-cfmode="' + m[0] + '"><span class="cf-radio"></span><span class="cf-mode-tx"><b>' + esc(m[1]) + '</b><span>' + esc(m[2]) + '</span></span></button>'; }).join('') + '</div>' +
      '</div><div class="cf-right"><div class="cf-prevs"></div><div class="cf-warnbox"></div>' +
        '<div class="cf-acts"><button class="pe-btn pe-btn-primary" data-cfapply>Применить кадрирование</button><button class="pe-btn pe-btn-ghost" data-puclose>Выбрать другой макет</button></div>' +
      '</div></div></div>';
    document.body.appendChild(ov);
    function close() { ov.remove(); }
    ov.querySelectorAll('[data-puclose]').forEach(function (b) { b.addEventListener('click', close); });
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelectorAll('[data-cfmode]').forEach(function (b) { b.addEventListener('click', function () { mode = b.getAttribute('data-cfmode'); paint(); }); });
    ov.querySelector('[data-cfapply]').addEventListener('click', function () {
      mutate(function () { ref.fit = mode === 'fit' ? 'contain' : 'cover'; ref.cropsByFormat = ref.cropsByFormat || {}; ref.cropsByFormat[S.fmt] = { mode: mode }; });
      close(); toast('Кадрирование применено', null, true);
    });
    paint();
  }

  /* ---------- «Заменить объект» — пикер объекта (макет §8) ---------- */
  function openReplaceObject(k) {
    api('GET', '/objects').then(function (r) {
      if (r.status !== 200) { toast('Не удалось', (r.json && r.json.error) || ''); return; }
      var all = r.json.items || [];
      var inColl = S.pres.projectIds || [];
      var curPid = inColl[k];
      var cur = all.filter(function (x) { return x.id === curPid; })[0] || { name: (S.projects[k] && S.projects[k].name) || 'Объект' };
      var grp = collectionGroups().filter(function (g) { return g.type === 'object' && g.k === k; })[0];
      var pages = grp ? grp.idx.length : 0;
      var avail = all.filter(function (x) { return inColl.indexOf(x.id) < 0; });
      replaceModal(k, curPid, cur, pages, avail);
    });
  }
  function replaceModal(k, curPid, cur, pages, avail) {
    var selId = null, q = '';
    var ov = document.createElement('div'); ov.className = 'pu-overlay';
    function money(o) { var c = o.currency === 'EUR' ? '€' : o.currency === 'THB' ? '฿' : '$'; return o.priceFrom ? 'от ' + c + ' ' + (o.priceFrom).toLocaleString('ru-RU') : ''; }
    function list() {
      var items = avail.filter(function (x) { return !q || (x.name + ' ' + x.geoName).toLowerCase().indexOf(q) >= 0; });
      if (!items.length) return '<div class="pe-bl-empty">Ничего не найдено</div>';
      return items.map(function (o) {
        return '<button class="ro-item' + (o.id === selId ? ' on' : '') + '" data-roid="' + esc(o.id) + '">' +
          '<div class="ro-thumb" style="' + (o.image ? 'background-image:url(\'' + esc(absU(o.image)) + '\')' : '') + '"></div>' +
          '<div class="ro-b"><b>' + esc(o.name) + '</b><span>' + esc([o.geoName, o.type].filter(Boolean).join(' · ')) + ' · ' + esc(money(o)) + '</span><span class="ro-ph">' + o.photos + ' фото' + '</span></div></button>';
      }).join('');
    }
    function warn() {
      if (!selId) return '<div class="ro-warn muted">Выберите новый объект — он займёт место текущего.</div>';
      var n = avail.filter(function (x) { return x.id === selId; })[0] || {};
      return '<div class="ro-warn"><div class="ro-sw">' + esc(cur.name) + ' <i>' + ic('swap') + '</i> ' + esc(n.name) + '</div>' +
        '<ul><li>Будет заменено страниц объекта: <b>' + pages + '</b></li>' +
        '<li>Локальные правки текста и фото этого объекта <b>не переносятся</b></li>' +
        '<li>Данные и фотографии нового объекта загрузятся заново</li>' +
        '<li>Сравнение обновит колонку этого объекта</li></ul></div>';
    }
    function paint() { ov.querySelector('.ro-list').innerHTML = list(); ov.querySelector('.ro-side').innerHTML = warn() + '<div class="ro-acts"><button class="pe-btn pe-btn-primary ro-apply"' + (selId ? '' : ' disabled') + '>Заменить объект</button><button class="pe-btn pe-btn-ghost" data-puclose>Отмена</button></div>'; wireBody(); }
    function wireBody() {
      ov.querySelectorAll('[data-roid]').forEach(function (b) { b.addEventListener('click', function () { selId = b.getAttribute('data-roid'); paint(); }); });
      ov.querySelectorAll('[data-puclose]').forEach(function (b) { b.addEventListener('click', close); });
      var ap = ov.querySelector('.ro-apply'); if (ap && selId) ap.addEventListener('click', function () {
        api('POST', '/' + ID + '/replace-object', { oldProjectId: curPid, newProjectId: selId }).then(function (r) { close(); if (r.status === 200) { toast('Объект заменён', null, true); reloadPres(); } else toast('Не удалось', (r.json && r.json.error) || ''); });
      });
    }
    function close() { ov.remove(); }
    ov.innerHTML = '<div class="pu-box ro-box"><div class="pu-hd"><h2>Заменить объект</h2><button class="pe-x" data-puclose>' + ic('x') + '</button></div>' +
      '<div class="ro-cur">Сейчас: <b>' + esc(cur.name) + '</b> · ' + pages + ' ' + plural(pages, 'страница', 'страницы', 'страниц') + '</div>' +
      '<div class="ro-grid"><div class="ro-pick"><div class="pe-add-search">' + ic('search') + '<input id="roSearch" placeholder="Поиск объекта…"></div><div class="ro-list"></div></div>' +
      '<div class="ro-side"></div></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('#roSearch').addEventListener('input', function () { q = this.value.toLowerCase(); ov.querySelector('.ro-list').innerHTML = list(); wireBody(); });
    paint();
  }

  /* ---------- «Обновить данные объекта» — diff подборки ↔ карточка (макет) ---------- */
  function puFmt(v) { if (v == null || v === '') return 'Нет данных'; if (typeof v === 'number') return v.toLocaleString('ru-RU'); var s = String(v); return s.length > 72 ? s.slice(0, 72) + '…' : s; }
  function reloadPres() { api('GET', '/' + ID + '?full=1').then(function (r) { if (r.status === 200) { S.pres = r.json.pres; S.source = r.json.source || {}; S.assets = r.json.assets || {}; S.projects = r.json.projects || S.projects; render(); revalidate(); } }); }
  function openObjectUpdates(k) {
    api('POST', '/' + ID + '/object-updates', { index: k }).then(function (r) {
      if (r.status !== 200) { toast('Не удалось', (r.json && r.json.error) || ''); return; }
      var data = r.json;
      if (!data.diffs || !data.diffs.length) { toast('Обновлений нет', 'Данные подборки совпадают с карточкой', true); return; }
      updatesModal(k, data);
    });
  }
  function updatesModal(k, data) {
    var rows = data.diffs.map(function (d) {
      var def = d.edited ? 'keep' : 'update';
      return '<div class="pu-row"><div class="pu-field">' + esc(d.field) + '</div>' +
        '<div class="pu-doc">' + esc(puFmt(d.inDoc)) + (d.edited ? '<span class="pu-tag">изменено вручную</span>' : '') + '</div>' +
        '<div class="pu-card">' + esc(puFmt(d.inCard)) + '</div>' +
        '<div class="pu-dec"><select data-pukey="' + esc(d.key) + '">' +
          '<option value="update"' + (def === 'update' ? ' selected' : '') + '>Обновить</option>' +
          '<option value="keep"' + (def === 'keep' ? ' selected' : '') + '>' + (d.edited ? 'Сохранить мой текст' : 'Оставить') + '</option></select></div></div>';
    }).join('');
    var ov = document.createElement('div'); ov.className = 'pu-overlay';
    ov.innerHTML = '<div class="pu-box"><div class="pu-hd"><h2>Обновить данные объекта</h2><button class="pe-x" data-puclose>' + ic('x') + '</button></div>' +
      '<div class="pu-obj"><b>' + esc(data.object) + '</b> · выберите изменения</div>' +
      '<div class="pu-table"><div class="pu-row pu-head"><div>Поле</div><div>В подборке</div><div>В карточке</div><div>Решение</div></div>' + rows + '</div>' +
      '<div class="pu-foot"><div class="pu-note"><b class="pu-count"></b><span>Опубликованная версия не изменится</span></div>' +
      '<div class="pu-acts"><button class="pe-btn pe-btn-primary" data-puapply>Применить к черновику</button><button class="pe-btn pe-btn-ghost" data-puclose>Отмена</button></div></div></div>';
    document.body.appendChild(ov);
    function count() { var n = 0; ov.querySelectorAll('[data-pukey]').forEach(function (s) { if (s.value === 'update') n++; }); ov.querySelector('.pu-count').textContent = 'Будут обновлены ' + n + ' ' + plural(n, 'поле', 'поля', 'полей'); }
    function close() { ov.remove(); }
    ov.querySelectorAll('[data-pukey]').forEach(function (s) { s.addEventListener('change', count); }); count();
    ov.querySelectorAll('[data-puclose]').forEach(function (b) { b.addEventListener('click', close); });
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('[data-puapply]').addEventListener('click', function () {
      var fields = []; ov.querySelectorAll('[data-pukey]').forEach(function (s) { if (s.value === 'update') fields.push(s.getAttribute('data-pukey')); });
      if (!fields.length) { close(); return; }
      api('POST', '/' + ID + '/apply-updates', { index: k, fields: fields }).then(function (r) { close(); if (r.status === 200) { toast('Обновлено', 'Применено к черновику', true); reloadPres(); } else toast('Не удалось'); });
    });
  }
  function addPageMenu(anchor) {
    var fams = ['editorial', 'metrics', 'gallery', 'location', 'floorplan', 'payment', 'benefits', 'custom'];
    menu(anchor, fams.map(function (f) { return { t: FAM_LABEL[f], ic: 'plus', fn: function () { mutate(function () { var ns = { id: 's' + Math.random().toString(16).slice(2, 8), family: f, enabled: true, assetRefs: [], contentBindings: { title: { mode: 'override', value: FAM_LABEL[f] } } }; var insAt = sections().length; sections().splice(insAt, 0, ns); S.pageIdx = insAt; }); } }; }));
  }
  function menu(anchor, items) {
    closeMenu(); var r = anchor.getBoundingClientRect();
    var m = document.createElement('div'); m.className = 'pe-menu'; m.id = 'peMenu';
    m.innerHTML = items.map(function (it, i) { return it.sep ? '<hr>' : '<button data-i="' + i + '"' + (it.danger ? ' class="danger"' : '') + '>' + ic(it.ic) + esc(it.t) + '</button>'; }).join('');
    document.body.appendChild(m); m.style.top = (r.bottom + 4) + 'px'; m.style.left = Math.min(r.left, window.innerWidth - 200) + 'px';
    m.querySelectorAll('button[data-i]').forEach(function (b) { b.addEventListener('click', function () { var it = items[+b.getAttribute('data-i')]; closeMenu(); it.fn(); }); });
    setTimeout(function () { document.addEventListener('click', closeMenu, { once: true }); }, 0);
  }
  function closeMenu() { var m = document.getElementById('peMenu'); if (m) m.remove(); }

  /* ---------- overlays: pick / style / export ---------- */
  function overlayPick(title, imgs, cb) {
    var ov = document.createElement('div'); ov.className = 'pe-overlay'; ov.style.alignItems = 'center'; ov.style.justifyContent = 'center';
    ov.innerHTML = '<div style="background:#fff;border-radius:16px;max-width:620px;width:90%;max-height:80vh;overflow:auto;padding:24px"><h3 style="margin:0 0 16px;font-size:16px">' + esc(title) + '</h3><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">' + imgs.map(function (im, i) { return '<div data-pi="' + i + '" style="aspect-ratio:1;border-radius:8px;overflow:hidden;cursor:pointer;border:1px solid var(--pe-line)"><img src="' + esc(im.url) + '" style="width:100%;height:100%;object-fit:cover"></div>'; }).join('') + '</div><div style="text-align:right;margin-top:16px"><button class="pe-btn" data-close>Закрыть</button></div></div>';
    document.body.appendChild(ov);
    ov.querySelectorAll('[data-pi]').forEach(function (el) { el.addEventListener('click', function () { cb(imgs[+el.getAttribute('data-pi')]); ov.remove(); }); });
    ov.querySelector('[data-close]').addEventListener('click', function () { ov.remove(); });
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
  }

  function openStyle() {
    var sel = { paletteId: S.pres.theme.paletteId, fontPairId: S.pres.theme.fontPairId };
    var ov = document.createElement('div'); ov.className = 'pe-overlay'; ov.id = 'peStyleOv';
    function body() {
      var pal = TOK.palette(sel.paletteId);
      return '<div class="pe-ov-top"><button class="pe-iconbtn" data-x>' + ic('x') + '</button><div class="t">Стиль презентации</div><div class="pe-top-sp" style="flex:1"></div><button class="pe-btn" data-x>Отмена</button><button class="pe-btn pe-btn-primary" data-apply>Применить стиль</button></div>' +
        '<div class="pe-ov-body">' +
          '<div class="pe-ov-left">' +
            '<div class="pe-styletabs"><button class="on">Палитры</button><button disabled>Шрифты</button><button disabled>Бренд</button></div>' +
            '<div class="pe-hd">Цвета презентации</div>' +
            swatchRow('Фон', pal.c.background) + swatchRow('Текст', pal.c.text) + swatchRow('Акцент', pal.c.accent) + swatchRow('Поверхность', pal.c.surface) +
            '<div class="pe-switchrow" style="margin-top:14px"><div><b style="font-size:13px">Применить ко всей презентации</b><div class="hint">Цвета и шрифты — ко всем страницам</div></div><button class="pe-toggle on"></button></div>' +
            contrastBox(pal) +
          '</div>' +
          '<div class="pe-ov-mid"><div id="peStylePrev"></div></div>' +
          '<div class="pe-ov-right">' +
            '<div class="pe-hd">Готовые палитры</div><div class="pe-palgrid">' + TOK.PALETTES.map(palCard).join('') + '</div>' +
            '<div class="pe-hd">Комбинации шрифтов</div><div class="pe-fontgrid">' + TOK.FONT_PAIRS.map(fontCard).join('') + '</div>' +
          '</div>' +
        '</div>';
    }
    function palCard(p) { return '<div class="pe-palcard' + (p.id === sel.paletteId ? ' on' : '') + '" data-pal="' + p.id + '"><div class="sw" style="background:' + p.c.surface + '"></div><div class="nm">' + esc(p.name) + '</div><div class="dots"><i style="background:' + p.c.background + '"></i><i style="background:' + p.c.surface + '"></i><i style="background:' + p.c.accent + '"></i><i style="background:' + p.c.text + '"></i></div><div class="ck">' + ic('check') + '</div></div>'; }
    function fontCard(fp) { return '<div class="pe-fontcard' + (fp.id === sel.fontPairId ? ' on' : '') + '" data-fp="' + fp.id + '"><div class="big" style="font-family:\'' + fp.heading.family + '\'">Ваш<br>новый дом</div><div class="sm" style="font-family:\'' + fp.body.family + '\'">Современные решения для жизни</div><div class="nm">' + esc(fp.heading.family) + ' + ' + esc(fp.body.family) + '</div><div class="ck">' + ic('check') + '</div></div>'; }
    function swatchRow(n, hex) { return '<div class="pe-swatch-row"><div class="pe-swatch" style="background:' + hex + '"></div><div class="pe-swatch-tx"><b>' + n + '</b><span>' + hex.toUpperCase() + '</span></div></div>'; }
    function contrastBox(pal) { var cr = TOK.contrast(pal.c.text, pal.c.background); var ok = cr >= 4.5; return '<div class="pe-contrast' + (ok ? '' : ' bad') + '"><div class="ic">' + ic(ok ? 'check' : 'x') + '</div><div><b>' + (ok ? 'Контраст пройден' : 'Низкий контраст') + '</b><p>Текст ' + cr.toFixed(1) + ':1 — ' + (ok ? 'соответствует WCAG' : 'ниже нормы 4.5:1') + '</p></div></div>'; }
    function paintPrev() { var prev = document.getElementById('peStylePrev'); if (!prev) return; var f = TOK.format('portrait_a4'); var hero = sections().find(function (s) { return s.family === 'hero'; }) || sections()[0]; var html = T.renderSection(hero, { format: 'portrait_a4', theme: sel, source: S.source, assets: S.assets, brand: brandWithBroker() })[0] || ''; var sc = 0.42; prev.className = 'lp-shadow'; prev.style.cssText = 'width:' + (f.cssW * sc) + 'px;height:' + (f.cssH * sc) + 'px'; prev.innerHTML = '<div style="transform:scale(' + sc + ');transform-origin:top left">' + html + '</div>'; }
    function rewire() {
      ov.querySelectorAll('[data-x]').forEach(function (b) { b.onclick = function () { ov.remove(); }; });
      ov.querySelector('[data-apply]').onclick = function () { mutate(function () { S.pres.theme.paletteId = sel.paletteId; S.pres.theme.fontPairId = sel.fontPairId; }); ov.remove(); };
      ov.querySelectorAll('[data-pal]').forEach(function (c) { c.onclick = function () { sel.paletteId = c.getAttribute('data-pal'); refresh(); }; });
      ov.querySelectorAll('[data-fp]').forEach(function (c) { c.onclick = function () { sel.fontPairId = c.getAttribute('data-fp'); refresh(); }; });
    }
    function refresh() { ov.innerHTML = body(); rewire(); paintPrev(); }
    ov.innerHTML = body(); document.body.appendChild(ov); rewire(); paintPrev();
  }

  function openExport() {
    var fmt = S.fmt, quality = 'standard', method = 'pdf', published = null;
    var ov = document.createElement('div'); ov.className = 'pe-overlay'; ov.id = 'peExportOv';
    function body() {
      var chk = S.chk || { issues: [], pageCount: 0, ok: true };
      var checks = buildChecks(chk);
      return '<div class="pe-ov-top"><button class="pe-iconbtn" data-x>' + ic('x') + '</button><div class="t">Подготовка к экспорту</div><div class="pe-top-sp" style="flex:1"></div></div>' +
        '<div class="pe-ov-body"><div class="pe-ov-mid"><div class="pe-exprev" id="peExPrev"></div></div>' +
        '<div class="pe-ov-right">' +
          '<div class="pe-hd">Выбранный формат</div><select class="pe-select" data-exfmt>' + TOK.FORMATS.map(function (f) { return '<option value="' + f.id + '"' + (f.id === fmt ? ' selected' : '') + '>' + esc(f.label) + '</option>'; }).join('') + '</select>' +
          '<div class="pe-hd">Проверка содержимого</div>' + checks +
          '<div class="pe-hd">Способ экспорта</div>' +
            '<div class="pe-radio' + (method === 'pdf' ? ' on' : '') + '" data-method="pdf"><div class="r"></div><div><b>PDF</b><span>Готовый файл для скачивания</span></div></div>' +
            '<div class="pe-radio' + (method === 'link' ? ' on' : '') + '" data-method="link"><div class="r"></div><div><b>Веб-ссылка</b><span>Ссылка для быстрого просмотра</span></div></div>' +
          '<div class="pe-hd">Качество изображений</div><div class="pe-qual"><button class="' + (quality === 'standard' ? 'on' : '') + '" data-q="standard"><b>Стандарт</b><span>оптимальный размер</span></button><button class="' + (quality === 'high' ? 'on' : '') + '" data-q="high"><b>Высокое</b><span>макс. качество</span></button></div>' +
          (method === 'pdf' ?
            '<button class="pe-btn pe-btn-primary" style="width:100%;justify-content:center" data-dl>' + ic('download') + 'Скачать PDF</button>' :
            '<button class="pe-btn pe-btn-primary" style="width:100%;justify-content:center" data-link>' + ic('link') + 'Создать ссылку</button>') +
          (published ? '<div class="pe-linkbox"><input readonly value="' + esc(published) + '"><button class="pe-btn" data-copy>Копировать</button></div>' : '') +
          '<div class="pe-note">' + ic('phone') + '<div>Ссылка адаптируется под экран клиента — компьютер, планшет и смартфон.</div></div>' +
        '</div></div>';
    }
    function buildChecks(chk) {
      var out = '';
      out += checkRow('ok', 'Шрифты загружены');
      var overflow = chk.issues.some(function (i) { return i.code === 'TEXT_OVERFLOW'; });
      out += checkRow(overflow ? 'bad' : 'ok', overflow ? 'Текст не помещается' : 'Текст помещается');
      var contacts = !!(S.pres.brokerAppendix && S.pres.brokerAppendix.enabled);
      out += checkRow(contacts ? 'ok' : 'warn', contacts ? 'Контакты добавлены' : 'Визитка брокера выключена');
      var miss = chk.issues.filter(function (i) { return i.code === 'MISSING_ASSET'; }).length;
      if (miss) out += checkRow('bad', miss + ' изображение недоступно', 'Исправить');
      var pay = chk.issues.some(function (i) { return i.code === 'INVALID_PAYMENT_TOTAL'; });
      if (pay) out += checkRow('bad', 'Сумма процентов ≠ 100%', 'Исправить');
      return out;
    }
    function checkRow(kind, label, action) { return '<div class="pe-check ' + kind + '"><div class="ic">' + ic(kind === 'ok' ? 'check' : kind === 'warn' ? 'warn' : 'x') + '</div><b>' + esc(label) + '</b>' + (action ? '<a href="#" data-fix>' + esc(action) + '</a>' : '') + '</div>'; }
    function paintPrev() {
      var box = document.getElementById('peExPrev'); if (!box) return;
      var hero = sections().find(function (s) { return s.family === 'hero'; }) || sections()[0];
      var pair = fmt === 'portrait_a4' ? ['landscape_16_9', 'portrait_a4'] : [fmt, 'portrait_a4'];
      box.innerHTML = pair.map(function (ff) { var f = TOK.format(ff); var sc = ff === 'portrait_a4' ? 0.30 : 0.34; var html = T.renderSection(hero, { format: ff, theme: S.pres.theme, source: S.source, assets: S.assets, brand: brandWithBroker() })[0] || ''; return '<div class="col"><span>' + esc(f.label) + '</span><div class="lp-shadow" style="width:' + (f.cssW * sc) + 'px;height:' + (f.cssH * sc) + 'px"><div style="transform:scale(' + sc + ');transform-origin:top left">' + html + '</div></div></div>'; }).join('');
    }
    function rewire() {
      ov.querySelectorAll('[data-x]').forEach(function (b) { b.onclick = function () { ov.remove(); }; });
      var fs = ov.querySelector('[data-exfmt]'); if (fs) fs.onchange = function () { fmt = fs.value; paintPrev(); };
      ov.querySelectorAll('[data-method]').forEach(function (m) { m.onclick = function () { method = m.getAttribute('data-method'); refresh(); }; });
      ov.querySelectorAll('[data-q]').forEach(function (q) { q.onclick = function () { quality = q.getAttribute('data-q'); refresh(); }; });
      var dl = ov.querySelector('[data-dl]'); if (dl) dl.onclick = function () { window.open('/pres/' + ID + '/print?format=' + fmt + '&q=' + quality, '_blank'); };
      var lk = ov.querySelector('[data-link]'); if (lk) lk.onclick = function () { lk.textContent = 'Публикуем…'; api('POST', '/' + ID + '/publish', { format: fmt }).then(function (r) { if (r.status === 200) { published = r.json.url; refresh(); } else { toast(r.json && r.json.error === 'PREFLIGHT_FAILED' ? 'Исправьте ошибки перед публикацией' : 'Ошибка публикации'); refresh(); } }); };
      var cp = ov.querySelector('[data-copy]'); if (cp) cp.onclick = function () { navigator.clipboard && navigator.clipboard.writeText(published); cp.textContent = 'Скопировано'; };
    }
    function refresh() { ov.innerHTML = body(); rewire(); paintPrev(); }
    ov.innerHTML = body(); document.body.appendChild(ov); rewire(); paintPrev();
  }

  /* ---------- misc ---------- */
  function joinArr(v) { return Array.isArray(v) ? v.join(' · ') : (v || ''); }
  function splitArr(v) { return String(v).split(/\s*·\s*|\s*,\s*/).filter(Boolean); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function toast(msg) { var t = document.createElement('div'); t.textContent = msg; t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#201c17;color:#fff;padding:12px 20px;border-radius:10px;font-size:13px;z-index:100'; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600); }

  function ic(n) {
    var P = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
    var D = {
      undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 0 10h-1"/>',
      redo: '<path d="M15 7l5 5-5 5"/><path d="M20 12H9a5 5 0 0 0 0 10h1"/>',
      eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
      download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 21h16"/>',
      plus: '<path d="M12 5v14M5 12h14"/>', dots: '<circle cx="12" cy="6" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="18" r="1"/>',
      db: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
      image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5L5 20"/>',
      crop: '<path d="M6 2v16h16M2 6h16v16"/>', palette: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="9" r="1"/><circle cx="12" cy="7" r="1"/><circle cx="16" cy="9" r="1"/>',
      copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V4h12"/>', up: '<path d="M12 19V5M5 12l7-7 7 7"/>', down: '<path d="M12 5v14M5 12l7 7 7-7"/>',
      trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>', check: '<path d="M4 12l5 5L20 6"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
      warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>', link: '<path d="M9 15l6-6M8 11l-2 2a3 3 0 0 0 4 4l2-2M16 13l2-2a3 3 0 0 0-4-4l-2 2"/>',
      phone: '<path d="M5 4h3l2 5-2 1a9 9 0 0 0 4 4l1-2 5 2v3a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
      back: '<path d="M15 6l-6 6 6 6"/>', chev: '<path d="M6 9l6 6 6-6"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>',
      text: '<path d="M4 6h16M4 12h16M4 18h10"/>', grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
      pin: '<path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2"/>', doc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
    };
    return '<svg viewBox="0 0 24 24" ' + P + ' style="width:1em;height:1em">' + (D[n] || '') + '</svg>';
  }
})();
