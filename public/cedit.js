/* Редактор карусели соц-помощника (поверх серверного рендера /car/:id).
   Дизайн: тонкая верхняя полоса + боковая панель. Клик по слайду выбирает его → панель показывает его настройки.
   Тексты = [data-ce="idx:field"], слайды = .slide[data-idx]. Отдельный файл — обход </script>-ловушки. */
(() => {
  const P = window.CEDIT || {};
  const KEY = P.key || '';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstElementChild; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const FMT = { square: '1:1', portrait: '4:5', story: '9:16' };
  const CAT = { serif: 'С засечками', sans: 'Гротеск', display: 'Акцидентные', hand: 'Рукописные' };
  const isDark = (h) => { const x = String(h || '').replace('#', ''); const s = x.length <= 4 ? x.split('').map(c => c + c).join('') : x; const r = parseInt(s.slice(0, 2), 16), g = parseInt(s.slice(2, 4), 16), b = parseInt(s.slice(4, 6), 16); return (0.299 * r + 0.587 * g + 0.114 * b) < 145; };
  let dirty = false, pop = null, sel = 0, panelOpen = true;

  const css = document.createElement('style');
  css.textContent = `
:root{--cb:#2563EB}
.cbar{position:fixed;top:0;left:0;right:0;z-index:900;background:rgba(9,18,38,.82);backdrop-filter:blur(14px);color:#fff;display:flex;gap:10px;align-items:center;padding:9px 14px;font-family:Manrope,sans-serif;font-size:13px;border-bottom:1px solid rgba(134,175,255,.14)}
.cbar b{font-family:Fraunces,serif;font-weight:600;font-size:14px;opacity:.9}
.cbar .sp{flex:1}
.cbtn{background:var(--cb);color:#fff;border:none;border-radius:9px;padding:8px 14px;font-weight:600;font-size:13px;cursor:pointer;font-family:Manrope,sans-serif;display:inline-flex;gap:6px;align-items:center}
.cbtn.g{background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.16)}
.cbtn.g:hover{background:rgba(255,255,255,.16)}
.cbtn:disabled{opacity:.5}
/* боковая панель */
.cpanel{position:fixed;top:52px;right:0;bottom:0;width:308px;z-index:880;background:#fff;border-left:1px solid #E7ECF3;box-shadow:-14px 0 40px rgba(6,17,38,.10);display:flex;flex-direction:column;font-family:Manrope,sans-serif;transition:transform .22s cubic-bezier(.4,0,.2,1)}
.cpanel.closed{transform:translateX(308px)}
.cpanel-tabs{display:flex;padding:10px 12px 0;gap:4px;border-bottom:1px solid #EEF1F6}
.cpanel-tab{flex:1;border:none;background:none;padding:9px;font-weight:700;font-size:13px;color:#8a90a0;cursor:pointer;border-bottom:2px solid transparent;font-family:inherit}
.cpanel-tab.on{color:var(--cb);border-bottom-color:var(--cb)}
.cpanel-body{flex:1;overflow-y:auto;padding:14px 14px 40px}
.cgrp{margin-bottom:16px}
.cgrp>label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#8a90a0;font-weight:700;margin-bottom:8px}
.cdots{display:flex;flex-wrap:wrap;gap:7px}
.cth-dot{width:26px;height:26px;border-radius:50%;border:2px solid transparent;cursor:pointer;background:linear-gradient(135deg,var(--d) 50%,var(--b) 50%)}
.cth-dot.on{border-color:#fff;box-shadow:0 0 0 2px var(--cb)}
.cseg{display:flex;background:#EEF2FA;border-radius:10px;padding:3px;gap:2px}
.cseg button{flex:1;border:none;background:none;padding:8px 6px;border-radius:7px;font-weight:600;font-size:12.5px;cursor:pointer;color:#5E6470;font-family:inherit}
.cseg button.on{background:#fff;color:var(--cb);box-shadow:0 1px 4px rgba(6,17,38,.12)}
.cbtn-row{display:flex;gap:7px;flex-wrap:wrap}
.cwbtn{flex:1;min-width:calc(50% - 4px);border:1.5px solid #E1E8F4;background:#fff;border-radius:10px;padding:10px;font-weight:600;font-size:12.5px;cursor:pointer;font-family:inherit;color:#2A3346;display:flex;align-items:center;justify-content:center;gap:6px}
.cwbtn:hover{border-color:var(--cb);background:#EEF3FF;color:var(--cb)}
.cwbtn.wide{min-width:100%}
.cwbtn.dng:hover{border-color:#E0483D;background:#FDEEEC;color:#E0483D}
.cfontbtn{width:100%;border:1.5px solid #E1E8F4;background:#fff;border-radius:10px;padding:11px 12px;font-weight:600;font-size:13px;cursor:pointer;font-family:inherit;color:#2A3346;display:flex;align-items:center;gap:10px;text-align:left}
.cfontbtn .aa{font-size:20px}
.cfontbtn:hover{border-color:var(--cb)}
.cfmtbar{display:flex;gap:6px}
.cfmtbar button{flex:1;border:1.5px solid #E1E8F4;background:#fff;border-radius:9px;padding:9px;font-size:15px;cursor:pointer;font-weight:700;color:#2A3346}
.cfmtbar button:hover{border-color:var(--cb);background:#EEF3FF}
.swrow{display:flex;align-items:center;gap:10px;font-weight:600;font-size:12.5px;color:#2A3346}
.sw{position:relative;width:40px;height:23px;border-radius:999px;background:#D2DAEA;cursor:pointer;transition:.15s;flex:0 0 40px}
.sw.on{background:var(--cb)}.sw:after{content:'';position:absolute;top:3px;left:3px;width:17px;height:17px;border-radius:50%;background:#fff;transition:.15s}.sw.on:after{left:20px}
.cinp{width:100%;border:1.5px solid #E1E8F4;border-radius:9px;padding:9px 11px;font-size:13px;font-family:inherit;outline:none;margin-top:7px}
.cinp:focus{border-color:var(--cb)}
.ccolor{width:100%;height:40px;border:1.5px solid #E1E8F4;border-radius:9px;cursor:pointer;padding:3px;background:#fff}
.cnote{font-size:11.5px;color:#9aa1b2;margin-top:6px;line-height:1.5}
.cslide-empty{color:#9aa1b2;font-size:13px;text-align:center;padding:30px 10px;line-height:1.6}
/* поповер (шрифты) */
.cpop{position:fixed;z-index:950;background:#fff;color:#0B1220;border-radius:14px;box-shadow:0 22px 60px rgba(6,17,38,.32);border:1px solid #E7ECF3;padding:8px;min-width:250px;max-height:70vh;overflow:auto;font-family:Manrope,sans-serif;font-size:13.5px}
.cpop .srch{width:100%;border:1.5px solid #E1E8F4;border-radius:9px;padding:9px 11px;font-size:13px;font-family:inherit;outline:none;margin-bottom:6px}
.cpop .srch:focus{border-color:var(--cb)}
.cpop .cseg{margin-bottom:6px}
.fprow{display:flex;align-items:center;gap:13px;padding:8px 11px;border-radius:10px;cursor:pointer}
.fprow:hover{background:#EEF3FF}.fprow.on{background:#F5F8FF;box-shadow:inset 0 0 0 1px var(--cb)}
.fprow .aa{font-size:22px;width:36px;flex:0 0 36px;text-align:center;line-height:1}
.fprow .nm{flex:1;min-width:0;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cstatus{position:fixed;bottom:18px;left:calc(50% - 154px);transform:translateX(-50%);z-index:960;background:#0A1833;color:#fff;border:1px solid rgba(134,175,255,.2);border-radius:999px;padding:10px 20px;font-size:13px;font-weight:600;font-family:Manrope,sans-serif;box-shadow:0 12px 34px rgba(6,17,38,.45);display:none}
body.cpanel-on{padding-right:308px!important}
@media print{.cbar,.cpanel,.cstatus{display:none!important}body{padding-right:0!important}}
@media(max-width:820px){.cpanel{width:86vw}.cpanel.closed{transform:translateX(90vw)}body.cpanel-on{padding-right:0!important}}
`;
  document.head.appendChild(css);
  document.querySelector('.wrap').style.marginTop = '8px';

  const flash = (t, ms = 1600) => { let s = $('.cstatus'); if (!s) { s = el('<div class="cstatus"></div>'); document.body.appendChild(s); } s.textContent = t; s.style.display = 'block'; clearTimeout(flash._t); if (ms) flash._t = setTimeout(() => s.style.display = 'none', ms); };
  const closePop = () => { if (pop) { pop.remove(); pop = null; } };
  const openPop = (html, x, y) => { closePop(); pop = el(`<div class="cpop">${html}</div>`); document.body.appendChild(pop); const w = pop.offsetWidth, h = pop.offsetHeight; pop.style.left = Math.max(10, Math.min(x, innerWidth - w - 12)) + 'px'; pop.style.top = Math.max(58, Math.min(y, innerHeight - h - 12)) + 'px'; setTimeout(() => document.addEventListener('click', function h2(e) { if (pop && !pop.contains(e.target)) { closePop(); document.removeEventListener('click', h2); } }), 0); return pop; };

  /* ---------- верхняя полоса ---------- */
  const bar = el(`<div class="cbar">
    <button class="cbtn g" id="cExit" title="Сохранить и выйти в CRM">← Готово</button>
    <b>Карусель</b>
    <span class="sp"></span>
    <button class="cbtn g" id="cDl" title="Скачать (PDF / картинки)">Скачать</button>
    <button class="cbtn" id="cSave">Сохранить</button>
    <button class="cbtn g" id="cToggle" title="Свернуть панель">⇥</button>
  </div>`);
  document.body.appendChild(bar);

  /* ---------- боковая панель ---------- */
  const curFont = P.fonts[P.font] || Object.values(P.fonts)[0] || { name: 'Шрифт', fam: 'serif' };
  const panel = el(`<div class="cpanel">
    <div class="cpanel-tabs">
      <button class="cpanel-tab on" data-tab="design">Дизайн</button>
      <button class="cpanel-tab" data-tab="slide">Слайд</button>
    </div>
    <div class="cpanel-body" id="cBody"></div>
  </div>`);
  document.body.appendChild(panel);
  document.body.classList.add('cpanel-on');
  let tab = 'design';

  $$('[data-ce]').forEach(e => { e.setAttribute('contenteditable', 'true'); e.addEventListener('input', () => dirty = true); e.addEventListener('focus', () => { const sl = e.closest('.slide'); if (sl) selectSlide(+sl.dataset.idx, false); }); });

  /* очистка вставки — только текст */
  document.addEventListener('paste', (e) => { const t = e.target.closest && e.target.closest('[data-ce]'); if (!t) return; e.preventDefault(); const txt = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, txt); });

  const cleanHtml = (h) => String(h || '').replace(/<div>/gi, '<br>').replace(/<\/div>/gi, '')
    .replace(/<\s*(\/?)(b|strong|i|em|u|mark|br)\b[^>]*>/gi, (mm, s, t) => `<${s}${t.toLowerCase()}>`)
    .replace(/<(?!\/?(?:b|strong|i|em|u|mark|br)>)[^>]*>/gi, '').replace(/&nbsp;/g, ' ').trim();

  const slideEl = (i) => document.querySelector(`.slide[data-idx="${i}"]`);
  function serialize() {
    return $$('.slide').map((sl) => {
      const i = sl.dataset.idx;
      const h = sl.querySelector(`[data-ce="${i}:heading"]`); const s = sl.querySelector(`[data-ce="${i}:sub"]`); const ey = sl.querySelector(`[data-ce="${i}:eyebrow"]`);
      return {
        heading: cleanHtml(h ? h.innerHTML : ''), sub: cleanHtml(s ? s.innerHTML : ''), eyebrow: (ey ? ey.innerText : '').trim(),
        bg: sl.dataset.bg || '', bgv: sl.dataset.bgv || '', bgc: sl.dataset.bgc || '',
        pos: sl.dataset.pos || '', align: sl.dataset.align || 'left', size: sl.dataset.size || 'm',
      };
    });
  }
  async function save(reload, extra) {
    flash('Сохраняю…', 0);
    const body = Object.assign({ slides: serialize(), title: P.title }, extra || {});
    const r = await fetch(`/api/carousels/${P.cid}?key=${encodeURIComponent(KEY)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { flash('Ошибка сохранения'); return false; }
    dirty = false;
    if (reload) location.reload(); else flash('Сохранено ✓');
    return true;
  }
  $('#cSave').addEventListener('click', () => save(false));
  $('#cDl').addEventListener('click', async () => { if (dirty) await save(false); window.open(`/car/${P.cid}?print=1`, '_blank'); });
  $('#cExit').addEventListener('click', async () => { if (dirty) await save(false); try { window.close(); } catch (e) {} setTimeout(() => { if (!window.closed) location.href = '/#social'; }, 250); });
  $('#cToggle').addEventListener('click', () => { panelOpen = !panelOpen; panel.classList.toggle('closed', !panelOpen); document.body.classList.toggle('cpanel-on', panelOpen); });
  addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });

  /* подгружаем шрифты библиотеки для превью */
  Object.values(P.fonts).forEach(f => { if (f.gf) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = `https://fonts.googleapis.com/css2?${f.gf}&display=swap`; document.head.appendChild(l); } });

  /* ---------- выбор слайда ---------- */
  function selectSlide(i, switchTab = true) {
    sel = i;
    $$('.slide').forEach(s => s.classList.toggle('sel', +s.dataset.idx === i));
    if (switchTab) { tab = 'slide'; $$('.cpanel-tab').forEach(t => t.classList.toggle('on', t.dataset.tab === 'slide')); }
    if (tab === 'slide') renderBody();
  }
  document.body.addEventListener('click', (e) => {
    const sl = e.target.closest('.slide'); if (!sl) return;
    if (e.target.closest('[data-ce]')) { selectSlide(+sl.dataset.idx, false); return; }  /* правка текста — без переключения вкладки */
    selectSlide(+sl.dataset.idx, true);
  });

  /* ---------- панель: вкладки ---------- */
  $$('.cpanel-tab', panel).forEach(t => t.addEventListener('click', () => { tab = t.dataset.tab; $$('.cpanel-tab').forEach(x => x.classList.toggle('on', x === t)); renderBody(); }));

  /* live-применение метаданных текста */
  function applyMeta(i, key, val) {
    const sl = slideEl(i); if (!sl) return;
    sl.dataset[key] = val;
    const pos = sl.dataset.pos || 'center', al = sl.dataset.align || 'left', sz = sl.dataset.size || 'm';
    const bgcls = (sl.dataset.bg || sl.dataset.bgv || (sl.dataset.bgc && isDark(sl.dataset.bgc))) ? ' hasbg' : '';
    sl.className = 'slide' + bgcls + ` pos-${pos} al-${al} sz-${sz} sel`;
    dirty = true;
  }
  /* live-применение фона */
  function setBg(i, kind, val) {
    const sl = slideEl(i); if (!sl) return;
    delete sl.dataset.bg; delete sl.dataset.bgv; delete sl.dataset.bgc;
    sl.style.background = ''; sl.style.backgroundImage = '';
    const ov = sl.querySelector('.s-bgv'), os = sl.querySelector('.s-shade'); if (ov) ov.remove(); if (os) os.remove();
    sl.classList.remove('hasbg');
    if (kind === 'photo') { sl.dataset.bg = val; sl.style.backgroundImage = `linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.62)),url('${val}')`; sl.classList.add('hasbg'); }
    else if (kind === 'video') { sl.dataset.bgv = val; sl.insertBefore(el('<div class="s-shade"></div>'), sl.firstChild); sl.insertBefore(el(`<video class="s-bgv" autoplay muted loop playsinline src="${esc(val)}"></video>`), sl.firstChild); sl.classList.add('hasbg'); }
    else if (kind === 'color') { sl.dataset.bgc = val; sl.style.background = val; if (isDark(val)) sl.classList.add('hasbg'); }
    dirty = true; save(false); renderBody();
  }
  async function uploadAsset(file) {
    const r = await fetch(`/api/carousels/${P.cid}/asset?key=${encodeURIComponent(KEY)}&filename=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'ошибка загрузки'); return j.url;
  }
  function pickFile(accept, cb) { const inp = el(`<input type="file" accept="${accept}" style="display:none">`); document.body.appendChild(inp); inp.addEventListener('change', () => { if (inp.files[0]) cb(inp.files[0]); inp.remove(); }); inp.click(); }

  /* ---------- рендер тела панели ---------- */
  function renderBody() {
    const body = $('#cBody');
    if (tab === 'design') { body.innerHTML = designHtml(); wireDesign(body); return; }
    const sl = slideEl(sel);
    if (!sl) { body.innerHTML = `<div class="cslide-empty">Кликните по слайду в макете,<br>чтобы редактировать его</div>`; return; }
    body.innerHTML = slideHtml(sl); wireSlide(body, sel);
  }
  function designHtml() {
    return `
    <div class="cgrp"><label>Цветовая тема</label><div class="cdots">${Object.entries(P.themes || {}).map(([k, t]) => `<button class="cth-dot ${k === P.theme ? 'on' : ''}" data-theme="${k}" title="${t.name}" style="--d:${t.blue};--b:${t.body}"></button>`).join('')}</div></div>
    <div class="cgrp"><label>Шрифт заголовков</label><button class="cfontbtn" id="cFontBtn"><span class="aa" style="font-family:${curFont.fam}">Aa</span> <span style="flex:1">${curFont.name}</span> ▾</button></div>
    <div class="cgrp"><label>Формат</label><div class="cseg" id="cFmt">${['square', 'portrait', 'story'].map(f => `<button data-f="${f}" class="${P.format === f ? 'on' : ''}">${FMT[f]}</button>`).join('')}</div></div>
    <div class="cgrp"><label>Футер слайдов</label>
      <div class="swrow"><span class="sw ${(P.footer || {}).on ? 'on' : ''}" id="cFtSw"></span> Свой футер вместо агентства</div>
      <input class="cinp" id="cFtTxt" placeholder="@ваш_аккаунт · сайт.ru" value="${esc((P.footer || {}).text || '')}">
    </div>
    <div class="cgrp"><button class="cwbtn wide" id="cAddSlide">+ Добавить слайд</button></div>
    <div class="cnote">Тема, шрифт, формат и футер применяются ко всей карусели.</div>`;
  }
  function wireDesign(body) {
    $$('.cth-dot', body).forEach(d => d.addEventListener('click', () => save(true, { theme: d.dataset.theme })));
    $('#cFmt', body).addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) save(true, { format: b.dataset.f }); });
    $('#cAddSlide', body).addEventListener('click', async () => { const arr = serialize(); arr.push({ heading: 'Новый слайд', sub: 'Текст слайда', size: 'm', align: 'left' }); await save(true, { slides: arr }); });
    let ftOn = (P.footer || {}).on;
    $('#cFtSw', body).addEventListener('click', () => { ftOn = !ftOn; $('#cFtSw', body).classList.toggle('on', ftOn); dirty = true; });
    const persistFooter = () => save(true, { footer: { on: ftOn, text: $('#cFtTxt', body).value.trim() } });
    $('#cFtTxt', body).addEventListener('change', persistFooter);
    $('#cFtSw', body).addEventListener('dblclick', persistFooter);
    /* шрифт-поповер */
    $('#cFontBtn', body).addEventListener('click', (e) => {
      const rows = (filter, cat) => Object.entries(P.fonts).filter(([k, f]) => (!cat || f.cat === cat) && (!filter || f.name.toLowerCase().includes(filter))).map(([k, f]) => `<div class="fprow ${k === P.font ? 'on' : ''}" data-fp="${k}"><span class="aa" style="font-family:${f.fam}">Aa</span><span class="nm" style="font-family:${f.fam}">${f.name}</span></div>`).join('') || '<div style="padding:10px;color:#9aa1b2">Ничего не найдено</div>';
      const cats = ['', 'serif', 'sans', 'display', 'hand'];
      const pp = openPop(`<input class="srch" id="cFq" placeholder="Поиск шрифта…"><div class="cseg" id="cFcat">${cats.map((c, i) => `<button data-cat="${c}" class="${i === 0 ? 'on' : ''}">${c ? CAT[c] : 'Все'}</button>`).join('')}</div><div id="cFlist">${rows('', '')}</div>`, e.clientX - 250, e.clientY);
      let curCat = ''; const q = $('#cFq', pp), list = $('#cFlist', pp);
      q.addEventListener('input', () => list.innerHTML = rows(q.value.trim().toLowerCase(), curCat));
      $('#cFcat', pp).addEventListener('click', (ev) => { const b2 = ev.target.closest('[data-cat]'); if (!b2) return; curCat = b2.dataset.cat; $$('#cFcat button', pp).forEach(x => x.classList.toggle('on', x === b2)); list.innerHTML = rows(q.value.trim().toLowerCase(), curCat); });
      pp.addEventListener('click', (e2) => { const t = e2.target.closest('[data-fp]'); if (t) { closePop(); save(true, { font: t.dataset.fp }); } });
      setTimeout(() => q.focus(), 30);
    });
  }
  function slideHtml(sl) {
    const pos = sl.dataset.pos || 'center', al = sl.dataset.align || 'left', sz = sl.dataset.size || 'm';
    const bgKind = sl.dataset.bgv ? 'Видео' : sl.dataset.bg ? 'Фото' : sl.dataset.bgc ? 'Цвет' : 'Тема';
    return `
    <div class="cgrp"><label>Слайд ${sel + 1} · фон: ${bgKind}</label>
      <div class="cbtn-row">
        <button class="cwbtn" data-bg="none">Тема</button>
        <button class="cwbtn" data-bg="color">Цвет</button>
        <button class="cwbtn" data-bg="photo">Фото</button>
        <button class="cwbtn" data-bg="video">Видео</button>
        ${P.img ? '<button class="cwbtn wide" data-bg="ai">✦ Сгенерировать фон ИИ</button>' : ''}
      </div>
      <div id="cBgExtra"></div>
    </div>
    <div class="cgrp"><label>Позиция текста</label><div class="cseg" id="cPos">${[['top', 'Верх'], ['center', 'Центр'], ['bottom', 'Низ']].map(([v, n]) => `<button data-v="${v}" class="${pos === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    <div class="cgrp"><label>Выравнивание</label><div class="cseg" id="cAlign">${[['left', 'Слева'], ['center', 'По центру']].map(([v, n]) => `<button data-v="${v}" class="${al === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    <div class="cgrp"><label>Размер заголовка</label><div class="cseg" id="cSize">${[['s', 'S'], ['m', 'M'], ['l', 'L']].map(([v, n]) => `<button data-v="${v}" class="${sz === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    <div class="cgrp"><label>Формат выделенного текста</label><div class="cfmtbar" id="cFmtBar">
      <button data-cmd="bold" title="Жирный"><b>Ж</b></button>
      <button data-cmd="italic" title="Курсив"><i>К</i></button>
      <button data-cmd="mark" title="Выделение цветом"><mark style="padding:0 3px;border-radius:3px">A</mark></button>
      <button data-cmd="clear" title="Убрать формат">✕</button>
    </div><div class="cnote">Выделите текст в заголовке/подписи, затем нажмите.</div></div>
    <div class="cgrp"><label>Порядок и удаление</label><div class="cbtn-row">
      <button class="cwbtn" data-mv="up">↑ Выше</button>
      <button class="cwbtn" data-mv="down">↓ Ниже</button>
      <button class="cwbtn wide dng" data-mv="del">Удалить слайд</button>
    </div></div>`;
  }
  function wireSlide(body, i) {
    $('#cPos', body).addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; applyMeta(i, 'pos', b.dataset.v); $$('#cPos button', body).forEach(x => x.classList.toggle('on', x === b)); });
    $('#cAlign', body).addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; applyMeta(i, 'align', b.dataset.v); $$('#cAlign button', body).forEach(x => x.classList.toggle('on', x === b)); });
    $('#cSize', body).addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; applyMeta(i, 'size', b.dataset.v); $$('#cSize button', body).forEach(x => x.classList.toggle('on', x === b)); });
    $('#cFmtBar', body).addEventListener('mousedown', (e) => {
      const b = e.target.closest('[data-cmd]'); if (!b) return; e.preventDefault(); const cmd = b.dataset.cmd;
      const s2 = document.getSelection(); if (!s2 || !s2.rangeCount || !s2.toString()) { flash('Сначала выделите текст в слайде'); return; }
      const anc = s2.anchorNode && (s2.anchorNode.nodeType === 1 ? s2.anchorNode : s2.anchorNode.parentElement);
      if (!anc || !anc.closest('[data-ce]')) { flash('Выделите текст внутри слайда'); return; }
      if (cmd === 'bold') document.execCommand('bold'); else if (cmd === 'italic') document.execCommand('italic'); else if (cmd === 'clear') document.execCommand('removeFormat');
      else if (cmd === 'mark') { const t = s2.toString(); document.execCommand('insertHTML', false, '<mark>' + t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) + '</mark>'); }
      dirty = true;
    });
    $$('[data-mv]', body).forEach(b => b.addEventListener('click', () => {
      const arr = serialize(); const kind = b.dataset.mv;
      if (kind === 'del') { if (arr.length <= 1) { flash('Оставьте хотя бы 1 слайд'); return; } arr.splice(i, 1); return save(true, { slides: arr }); }
      if (kind === 'up' && i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; return save(true, { slides: arr }); }
      if (kind === 'down' && i < arr.length - 1) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; return save(true, { slides: arr }); }
    }));
    /* фон */
    $$('[data-bg]', body).forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.bg; const extra = $('#cBgExtra', body);
      if (k === 'none') { setBg(i, 'none'); return; }
      if (k === 'color') { extra.innerHTML = `<input type="color" class="ccolor" id="cCol" value="${slideEl(i).dataset.bgc || '#0A1833'}">`; $('#cCol', extra).addEventListener('input', (e) => setBgLive(i, 'color', e.target.value)); $('#cCol', extra).addEventListener('change', (e) => setBg(i, 'color', e.target.value)); return; }
      if (k === 'photo' || k === 'video') {
        const isV = k === 'video';
        extra.innerHTML = `<div class="cbtn-row" style="margin-top:8px"><button class="cwbtn" id="cUp">${isV ? 'Загрузить видео' : 'Загрузить фото'}</button></div><input class="cinp" id="cUrl" placeholder="или вставьте ссылку…"><div class="cnote">${isV ? 'MP4/WebM до 25 МБ. Видео зациклится, звук выключен.' : 'JPG/PNG/WebP до 25 МБ.'}</div>`;
        $('#cUp', extra).addEventListener('click', () => pickFile(isV ? 'video/mp4,video/webm' : 'image/*', async (file) => { flash('Загружаю…', 0); try { const url = await uploadAsset(file); setBg(i, isV ? 'video' : 'photo', url); flash('Фон обновлён ✓'); } catch (err) { flash('Ошибка: ' + err.message); } }));
        $('#cUrl', extra).addEventListener('change', (e) => { const v = e.target.value.trim(); if (v) setBg(i, isV ? 'video' : 'photo', v); });
        return;
      }
      if (k === 'ai') {
        extra.innerHTML = `<input class="cinp" id="cAiP" placeholder="напр. панорама Дубая на закате"><button class="cwbtn wide" id="cAiGo" style="margin-top:7px">✦ Нарисовать фон</button>`;
        $('#cAiGo', extra).addEventListener('click', async () => { const prompt = $('#cAiP', extra).value.trim(); if (!prompt) { flash('Опишите фон'); return; } flash('✦ ИИ рисует фон (10–20с)…', 0); try { const r = await fetch(`/api/carousels/${P.cid}/ai-bg?key=${encodeURIComponent(KEY)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setBg(i, 'photo', j.url); flash('Фон готов ✓'); } catch (err) { flash('Не вышло: ' + err.message); } });
        return;
      }
    }));
  }
  /* цвет вживую без сохранения (сохраняем на change) */
  function setBgLive(i, kind, val) { const sl = slideEl(i); if (!sl) return; if (kind === 'color') { sl.dataset.bgc = val; delete sl.dataset.bg; delete sl.dataset.bgv; const ov = sl.querySelector('.s-bgv'), os = sl.querySelector('.s-shade'); if (ov) ov.remove(); if (os) os.remove(); sl.style.backgroundImage = ''; sl.style.background = val; sl.classList.toggle('hasbg', isDark(val)); } }

  /* старт: выбрать первый слайд, показать вкладку Дизайн */
  renderBody();
  selectSlide(0, false);
})();
