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
  /* палитра выделения текста (несколько цветов) — ключ hl-*, цвет свотча */
  const HL = [['cobalt', '#2563EB'], ['gold', '#E8B84B'], ['mint', '#34C79A'], ['rose', '#F2748F'], ['lav', '#9B8CFF'], ['sky', '#4FB6F2'], ['ink', '#0B0B0F'], ['under', 'linear-gradient(180deg,transparent 62%,#2563EB55 62%)']];
  /* узоры-фоны (превью для свотчей — нейтральный акцент) */
  const PATS = [['none', 'нет'], ['dots', 'точки'], ['grid', 'сетка'], ['diag', 'диагональ'], ['cross', 'крестики'], ['waves', 'волны'], ['rings', 'кольца'], ['carbon', 'карбон'], ['topo', 'топо']];
  const PATV = {
    dots: 'radial-gradient(#2563EB66 1.4px,transparent 1.5px);background-size:9px 9px',
    grid: 'linear-gradient(#2563EB44 1px,transparent 1px),linear-gradient(90deg,#2563EB44 1px,transparent 1px);background-size:11px 11px',
    diag: 'repeating-linear-gradient(45deg,#2563EB44 0 2px,transparent 2px 8px)',
    cross: 'radial-gradient(circle,#2563EB55 1px,transparent 1.4px),radial-gradient(circle,#2563EB55 1px,transparent 1.4px);background-size:12px 12px;background-position:0 0,6px 6px',
    waves: 'repeating-radial-gradient(circle at 0 100%,transparent 0 8px,#2563EB44 8px 9px)',
    rings: 'repeating-radial-gradient(circle at 80% 15%,#2563EB44 0 1px,transparent 1px 12px)',
    carbon: 'linear-gradient(27deg,#2563EB33 3px,transparent 3px),linear-gradient(207deg,#2563EB33 3px,transparent 3px);background-size:8px 8px',
    topo: 'repeating-radial-gradient(ellipse 60% 40% at 30% 20%,transparent 0 10px,#2563EB33 10px 12px)',
  };
  const isDark = (h) => { const x = String(h || '').replace('#', ''); const s = x.length <= 4 ? x.split('').map(c => c + c).join('') : x; const r = parseInt(s.slice(0, 2), 16), g = parseInt(s.slice(2, 4), 16), b = parseInt(s.slice(4, 6), 16); return (0.299 * r + 0.587 * g + 0.114 * b) < 145; };
  let dirty = false, pop = null, popOutside = null, sel = 0, panelOpen = true;

  const css = document.createElement('style');
  css.textContent = `
:root{--cb:#2563EB}
.cbar{position:fixed;top:0;left:0;right:0;z-index:900;background:rgba(9,18,38,.82);backdrop-filter:blur(14px);color:#fff;display:flex;gap:10px;align-items:center;padding:9px 14px;font-family:Manrope,sans-serif;font-size:13px;border-bottom:1px solid rgba(134,175,255,.14)}
.cbar b{font-family:Fraunces,serif;font-weight:600;font-size:14px;opacity:.9}
.cbar .sp{flex:1}
.cbtn{background:linear-gradient(180deg,#3B78FF,#2563EB);color:#fff;border:none;border-radius:10px;padding:9px 16px;font-weight:600;font-size:13px;cursor:pointer;font-family:Manrope,sans-serif;display:inline-flex;gap:6px;align-items:center;box-shadow:0 6px 16px -6px rgba(37,99,235,.6),inset 0 1px 0 rgba(255,255,255,.22);transition:transform .14s cubic-bezier(.4,0,.2,1),box-shadow .14s,filter .14s}
.cbtn:hover{transform:translateY(-1px);box-shadow:0 11px 24px -6px rgba(37,99,235,.72),inset 0 1px 0 rgba(255,255,255,.25);filter:brightness(1.05)}
.cbtn:active{transform:translateY(0)}
.cbtn.g{background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.18);box-shadow:none}
.cbtn.g:hover{background:rgba(255,255,255,.18);transform:translateY(-1px);box-shadow:0 6px 16px -8px rgba(0,0,0,.5);filter:none}
.cbtn:disabled{opacity:.5;transform:none;box-shadow:none;filter:none}
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
.cth-dot{width:28px;height:28px;border-radius:50%;border:2px solid transparent;cursor:pointer;background:linear-gradient(135deg,var(--d) 50%,var(--b) 50%);transition:transform .14s,box-shadow .14s}
.cth-dot:hover{transform:scale(1.12)}
.cth-dot.on{border-color:#fff;box-shadow:0 0 0 2px var(--cb),0 4px 10px -3px rgba(37,99,235,.5)}
.cseg{display:flex;background:#EEF2FA;border-radius:10px;padding:3px;gap:2px}
.cseg button{flex:1;border:none;background:none;padding:8px 6px;border-radius:7px;font-weight:600;font-size:12.5px;cursor:pointer;color:#5E6470;font-family:inherit}
.cseg button.on{background:#fff;color:var(--cb);box-shadow:0 1px 4px rgba(6,17,38,.12)}
.cbtn-row{display:flex;gap:7px;flex-wrap:wrap}
.cwbtn{flex:1;min-width:calc(50% - 4px);border:1.5px solid #E1E8F4;background:linear-gradient(180deg,#fff,#F7F9FE);border-radius:11px;padding:10px;font-weight:600;font-size:12.5px;cursor:pointer;font-family:inherit;color:#2A3346;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 1px 2px rgba(6,17,38,.05);transition:transform .15s cubic-bezier(.4,0,.2,1),border-color .15s,background .15s,box-shadow .15s,color .15s}
.cwbtn:hover{border-color:var(--cb);background:linear-gradient(180deg,#F3F7FF,#E8F0FF);color:var(--cb);transform:translateY(-1px);box-shadow:0 8px 18px -8px rgba(37,99,235,.42)}
.cwbtn:active{transform:translateY(0)}
.cwbtn.wide{min-width:100%}
.cwbtn.on{border-color:var(--cb);background:linear-gradient(180deg,#EAF1FF,#DBE7FF);color:var(--cb);box-shadow:inset 0 0 0 1px var(--cb)}
.cwbtn.dng:hover{border-color:#E0483D;background:#FDEEEC;color:#E0483D;box-shadow:0 8px 18px -8px rgba(224,72,61,.42)}
.cfontbtn{width:100%;border:1.5px solid #E1E8F4;background:#fff;border-radius:10px;padding:11px 12px;font-weight:600;font-size:13px;cursor:pointer;font-family:inherit;color:#2A3346;display:flex;align-items:center;gap:10px;text-align:left}
.cfontbtn .aa{font-size:20px}
.cfontbtn:hover{border-color:var(--cb)}
.cfmtbar{display:flex;gap:6px}
.cfmtbar button{flex:1;border:1.5px solid #E1E8F4;background:linear-gradient(180deg,#fff,#F7F9FE);border-radius:10px;padding:9px;font-size:15px;cursor:pointer;font-weight:700;color:#2A3346;transition:transform .14s,border-color .14s,background .14s}
.cfmtbar button:hover{border-color:var(--cb);background:#EEF3FF;transform:translateY(-1px)}
/* поповер выделения (цвета) + узоры */
.hlpop{display:flex;flex-direction:column;gap:9px}
.hlrow{display:flex;gap:8px;flex-wrap:wrap;max-width:214px}
.hlsw{width:30px;height:30px;border-radius:9px;border:2px solid #fff;box-shadow:0 0 0 1px #E1E8F4,0 3px 8px -3px rgba(6,17,38,.3);cursor:pointer;transition:transform .12s,box-shadow .12s}
.hlsw:hover{transform:scale(1.13);box-shadow:0 0 0 1px var(--cb),0 6px 13px -3px rgba(6,17,38,.4)}
.hloff{border:1.5px solid #E1E8F4;background:#fff;border-radius:9px;padding:9px;font-weight:600;font-size:12.5px;cursor:pointer;font-family:inherit;color:#5E6470;transition:all .14s}
.hloff:hover{border-color:#E0483D;color:#E0483D;background:#FDEEEC}
.cpats{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:8px}
.cpat{aspect-ratio:1;border:1.5px solid #E1E8F4;border-radius:10px;cursor:pointer;background-color:#F7F9FE;transition:transform .14s,border-color .14s,box-shadow .14s}
.cpat:hover{border-color:var(--cb);transform:translateY(-1px);box-shadow:0 6px 14px -6px rgba(37,99,235,.4)}
.cpat.on{border-color:var(--cb);box-shadow:inset 0 0 0 1.5px var(--cb)}
.cpat.none{display:flex;align-items:center;justify-content:center;font-size:10px;color:#9aa1b2;font-weight:700;background:#fff}
.cdrop{margin-top:8px;border:1.5px dashed #C6D2EA;border-radius:12px;background:linear-gradient(180deg,#FAFCFF,#F2F6FE);padding:18px 12px;text-align:center;cursor:pointer;transition:border-color .15s,background .15s,transform .15s}
.cdrop:hover{border-color:var(--cb);background:#EEF4FF}
.cdrop.over{border-color:var(--cb);background:#E5EEFF;transform:scale(1.01)}
.cdrop-ic{font-size:26px;line-height:1}
.cdrop-t{font-size:12.5px;color:#5E6470;margin-top:7px;line-height:1.45}
.cdrop-t b{color:var(--cb)}
.cthumb{margin-top:9px;border-radius:10px;overflow:hidden;max-height:150px}
.cthumb:empty{display:none}
.cthumb img,.cthumb video{width:100%;display:block;object-fit:cover;max-height:150px}
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
.csec{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:#8a90a0;padding:8px 2px 3px;font-weight:700}
.cpi{display:flex;gap:8px;align-items:center;justify-content:center;padding:9px 11px;border-radius:9px;cursor:pointer;font-weight:600;font-size:13px;background:#EEF3FF;color:#2563EB;margin-top:4px}
.cpi:hover{background:#e0eaff}
.celem-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin-top:8px;max-height:230px;overflow:auto}
.celem{aspect-ratio:1;border:1.5px solid #E1E8F4;border-radius:10px;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#2A3346;padding:8px}
.celem:hover{border-color:#2563EB;background:#EEF3FF;color:#2563EB}
.celem svg{width:100%;height:100%}
.celem.cimgpick{background-size:cover;background-position:center;padding:0}
.celem-frames{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin-top:8px}
.celem-fr{border:1.5px solid #E1E8F4;border-radius:10px;background:#fff;cursor:pointer;padding:12px 8px;font-weight:600;font-size:12.5px;color:#2A3346}
.celem-fr:hover{border-color:#2563EB;background:#EEF3FF;color:#2563EB}
.ctstyles{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:8px}
.ctst{display:flex;flex-direction:column;align-items:center;gap:3px;border:1.5px solid #E1E8F4;border-radius:10px;background:#0A1833;cursor:pointer;padding:10px 4px 6px;overflow:hidden}
.ctst .s-h{color:#fff;line-height:1;--blue:#4F7BFF;--disp:'Fraunces',serif}
.ctst i{font-style:normal;font-size:9.5px;color:#9fb2d6;font-weight:600}
.ctst:hover{border-color:#2563EB}
.ctst.on{border-color:#2563EB;box-shadow:0 0 0 1px #2563EB inset}
.ctpl-cats{overflow-x:auto;white-space:nowrap;flex-wrap:nowrap}
.ctpl-cats button{flex:0 0 auto}
.ctpl-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:8px}
.ctpl{aspect-ratio:4/3;border:1.5px solid #E1E8F4;border-radius:12px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;overflow:hidden;padding:8px}
.ctpl:hover{border-color:#2563EB;transform:translateY(-2px)}
.ctpl-aa{font-size:26px;line-height:1}
.ctpl i{font-style:normal;font-size:10.5px;color:#fff;opacity:.92;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,.5)}
.cctx{display:flex;flex-direction:column;min-width:180px}
.cctx button{display:block;width:100%;text-align:left;border:none;background:none;padding:9px 12px;border-radius:8px;font-size:13px;font-weight:600;color:#2A3346;cursor:pointer;font-family:inherit}
.cctx button:hover{background:#EEF3FF;color:#2563EB}
.cctx button.dng:hover{background:#FDEEEC;color:#E0483D}
`;
  document.head.appendChild(css);
  document.querySelector('.wrap').style.marginTop = '8px';

  const flash = (t, ms = 1600) => { let s = $('.cstatus'); if (!s) { s = el('<div class="cstatus"></div>'); document.body.appendChild(s); } s.textContent = t; s.style.display = 'block'; clearTimeout(flash._t); if (ms) flash._t = setTimeout(() => s.style.display = 'none', ms); };
  const closePop = () => { if (popOutside) { document.removeEventListener('click', popOutside); popOutside = null; } if (pop) { pop.remove(); pop = null; } };
  const openPop = (html, x, y) => { closePop(); pop = el(`<div class="cpop">${html}</div>`); document.body.appendChild(pop); const w = pop.offsetWidth, h = pop.offsetHeight; pop.style.left = Math.max(10, Math.min(x, innerWidth - w - 12)) + 'px'; pop.style.top = Math.max(58, Math.min(y, innerHeight - h - 12)) + 'px'; popOutside = (e) => { if (pop && !pop.contains(e.target)) closePop(); }; setTimeout(() => document.addEventListener('click', popOutside), 0); return pop; };

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
    .replace(/<mark\b[^>]*>/gi, (mm) => { const cm = mm.match(/hl-[a-z0-9]+/i); return cm ? `<mark class="${cm[0].toLowerCase()}">` : '<mark>'; })
    .replace(/<\s*(\/?)(b|strong|i|em|u|br)\b[^>]*>/gi, (mm, s, t) => `<${s}${t.toLowerCase()}>`)
    .replace(/<(?!(?:\/?(?:b|strong|i|em|u|mark|br)>)|(?:mark class="hl-[a-z0-9]+">))[^>]*>/gi, '').replace(/&nbsp;/g, ' ').trim();

  const slideEl = (i) => document.querySelector(`.slide[data-idx="${i}"]`);
  function serialize() {
    return $$('.slide').map((sl) => {
      const i = sl.dataset.idx;
      const h = sl.querySelector(`[data-ce="${i}:heading"]`); const s = sl.querySelector(`[data-ce="${i}:sub"]`); const ey = sl.querySelector(`[data-ce="${i}:eyebrow"]`);
      const layers = $$('[data-l]', sl).map(le => { try { return JSON.parse(le.getAttribute('data-l')); } catch (e) { return null; } }).filter(Boolean);
      return {
        heading: cleanHtml(h ? h.innerHTML : ''), sub: cleanHtml(s ? s.innerHTML : ''), eyebrow: (ey ? ey.innerText : '').trim(),
        bg: sl.dataset.bg || '', bgv: sl.dataset.bgv || '', bgc: sl.dataset.bgc || '', bgpat: sl.dataset.bgpat || '',
        pos: sl.dataset.pos || '', align: sl.dataset.align || 'left', size: sl.dataset.size || 'm', tstyle: (sl.dataset.tstyle && sl.dataset.tstyle !== 'plain') ? sl.dataset.tstyle : '', layers,
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
  /* быстрые действия слайда (ховер-панель + правый клик): edit/photo/dup/up/down/del/insert */
  function slideAction(act, i) {
    const arr = serialize();
    if (act === 'edit') { selectSlide(i, true); return; }
    if (act === 'del') { if (arr.length <= 1) { flash('Оставьте хотя бы 1 слайд'); return; } arr.splice(i, 1); return save(true, { slides: arr }); }
    if (act === 'dup') { arr.splice(i + 1, 0, JSON.parse(JSON.stringify(arr[i]))); return save(true, { slides: arr }); }
    if (act === 'up' && i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; return save(true, { slides: arr }); }
    if (act === 'down' && i < arr.length - 1) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; return save(true, { slides: arr }); }
    if (act === 'insert') { arr.splice(i + 1, 0, { heading: 'Новый слайд', sub: 'Текст слайда', size: 'm', align: 'left' }); return save(true, { slides: arr }); }
    if (act === 'photo') { selectSlide(i, true); setTimeout(() => { const b = $('#cBody [data-bg="photo"]'); if (b) b.click(); }, 60); return; }
  }
  document.body.addEventListener('click', (e) => {
    const sa = e.target.closest('[data-sact]');
    if (sa) { e.stopPropagation(); const sl0 = sa.closest('.slide'); if (sl0) slideAction(sa.dataset.sact, +sl0.dataset.idx); return; }
    const sl = e.target.closest('.slide'); if (!sl) return;
    if (e.target.closest('.s-lyr, .s-frame, [data-ce]')) { selectSlide(+sl.dataset.idx, false); return; }  /* слои/текст — без смены вкладки */
    selLayer(null);
    selectSlide(+sl.dataset.idx, true);
  });
  /* правый клик по слайду — быстрое меню */
  document.body.addEventListener('contextmenu', (e) => {
    const sl = e.target.closest('.slide'); if (!sl) return;
    e.preventDefault();
    const i = +sl.dataset.idx;
    const items = [['edit', '✎ Редактировать'], ['photo', '🖼 Фото-фон'], ['dup', '⧉ Дублировать'], ['insert', '＋ Слайд после'], ['up', '↑ Выше'], ['down', '↓ Ниже'], ['del', '✕ Удалить']];
    const pp = openPop(`<div class="cctx">${items.map(([a, n]) => `<button data-ctx="${a}" class="${a === 'del' ? 'dng' : ''}">${n}</button>`).join('')}</div>`, e.clientX, e.clientY);
    pp.addEventListener('click', (ev) => { const b = ev.target.closest('[data-ctx]'); if (!b) return; closePop(); slideAction(b.dataset.ctx, i); });
  });

  /* ---------- слои: выбор / перетаскивание / размер / порядок / удаление ---------- */
  function selLayer(lyr) { $$('.s-lyr.lsel,.s-frame.lsel').forEach(x => x.classList.remove('lsel')); if (lyr) lyr.classList.add('lsel'); }
  function updL(lyr, patch) { let o = {}; try { o = JSON.parse(lyr.getAttribute('data-l')) || {}; } catch (e) {} Object.assign(o, patch); lyr.setAttribute('data-l', JSON.stringify(o)); return o; }
  document.addEventListener('pointerdown', (e) => {
    const tb = e.target.closest('.lyr-tools button');
    if (tb) { e.preventDefault(); e.stopPropagation(); const lyr = tb.closest('.s-lyr,.s-frame'); if (!lyr) return;
      if (tb.hasAttribute('data-ldel')) { lyr.remove(); dirty = true; save(false); return; }
      const dir = tb.hasAttribute('data-lup') ? 1 : -1; const o = updL(lyr, {}); const nz = Math.max(0, (o.z || 0) + dir); updL(lyr, { z: nz }); lyr.style.zIndex = 10 + nz; dirty = true; save(false); return;
    }
    const rs = e.target.closest('.lyr-rs');
    if (rs) { e.preventDefault(); e.stopPropagation(); const lyr = rs.closest('.s-lyr'); const slide = lyr.closest('.slide'); const sr = slide.getBoundingClientRect(); const startW = lyr.offsetWidth, startX = e.clientX; selLayer(lyr);
      const mv = (ev) => { const w = Math.max(3, Math.min(130, (startW + (ev.clientX - startX)) / sr.width * 100)); lyr.style.width = w + '%'; updL(lyr, { w: +w.toFixed(1) }); };
      const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); dirty = true; save(false); };
      document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); return;
    }
    const lyr = e.target.closest('.s-lyr');
    if (lyr) { e.preventDefault(); e.stopPropagation(); selLayer(lyr); const slide = lyr.closest('.slide'); const sr = slide.getBoundingClientRect(); const o = updL(lyr, {}); const sxp = o.x || 0, syp = o.y || 0, sx = e.clientX, sy = e.clientY; let moved = false;
      const mv = (ev) => { const cx = Math.max(-30, Math.min(120, sxp + (ev.clientX - sx) / sr.width * 100)); const cy = Math.max(-30, Math.min(120, syp + (ev.clientY - sy) / sr.height * 100)); lyr.style.left = cx + '%'; lyr.style.top = cy + '%'; updL(lyr, { x: +cx.toFixed(1), y: +cy.toFixed(1) }); moved = true; };
      const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); if (moved) { dirty = true; save(false); } };
      document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); return;
    }
    const fr = e.target.closest('.s-frame'); if (fr) { selLayer(fr); }
  });
  /* правка текста-слоя по двойному клику */
  document.addEventListener('dblclick', (e) => { const lyr = e.target.closest('.s-lyr.lyr-text'); if (!lyr) return; e.preventDefault(); const o = updL(lyr, {}); const t = prompt('Текст элемента:', o.text || ''); if (t != null) { const sp = lyr.querySelector('.lyr-tx'); if (sp) sp.textContent = t; updL(lyr, { text: t.slice(0, 140) }); dirty = true; save(false); } });

  /* ---------- панель: вкладки ---------- */
  $$('.cpanel-tab', panel).forEach(t => t.addEventListener('click', () => { tab = t.dataset.tab; $$('.cpanel-tab').forEach(x => x.classList.toggle('on', x === t)); renderBody(); }));

  /* live-применение метаданных текста */
  function applyMeta(i, key, val) {
    const sl = slideEl(i); if (!sl) return;
    sl.dataset[key] = val;
    const pos = sl.dataset.pos || 'center', al = sl.dataset.align || 'left', sz = sl.dataset.size || 'm';
    const bgcls = (sl.dataset.bg || sl.dataset.bgv || (sl.dataset.bgc && isDark(sl.dataset.bgc))) ? ' hasbg' : '';
    const pat = (!sl.dataset.bg && !sl.dataset.bgv && !sl.dataset.bgc && sl.dataset.bgpat) ? ` pat-${sl.dataset.bgpat}` : '';
    sl.className = 'slide' + bgcls + ` pos-${pos} al-${al} sz-${sz}` + pat + ' sel';
    dirty = true;
  }
  /* live-применение фона */
  function setBg(i, kind, val) {
    const sl = slideEl(i); if (!sl) return;
    delete sl.dataset.bg; delete sl.dataset.bgv; delete sl.dataset.bgc;
    if (kind !== 'none') { delete sl.dataset.bgpat; sl.className = sl.className.replace(/\bpat-\w+/g, '').replace(/\s+/g, ' ').trim(); }
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

  /* ---------- выделение текста цветом (несколько цветов + снятие) ---------- */
  function nodeMark(n, host) { let e = n && (n.nodeType === 1 ? n : n.parentElement); while (e && e !== host) { if (e.tagName === 'MARK') return e; e = e.parentElement; } return null; }
  function marksIn(range, host) { return $$('mark', host).filter(m => { try { return range.intersectsNode(m); } catch (_) { return false; } }); }
  function unwrap(m) { const p = m.parentNode; if (!p) return; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); }
  function markSel(key, host) {
    const s2 = document.getSelection(); if (!s2 || !s2.rangeCount) return;
    const range = s2.getRangeAt(0);
    const sm = nodeMark(range.startContainer, host), em = nodeMark(range.endContainer, host);
    if (sm && sm === em) { if (key === 'off') unwrap(sm); else sm.className = 'hl-' + key; host.normalize(); dirty = true; return; }
    if (key === 'off') { marksIn(range, host).forEach(unwrap); host.normalize(); dirty = true; return; }
    marksIn(range, host).forEach(unwrap);
    const sel3 = document.getSelection(); if (!sel3.rangeCount) { dirty = true; return; }
    const r2 = sel3.getRangeAt(0);
    const mk = document.createElement('mark'); mk.className = 'hl-' + key;
    try { r2.surroundContents(mk); } catch (_) { try { const f = r2.extractContents(); mk.appendChild(f); r2.insertNode(mk); } catch (e2) { dirty = true; return; } }
    [...mk.querySelectorAll('mark')].forEach(unwrap);
    host.normalize(); dirty = true;
  }

  /* ---------- рендер тела панели ---------- */
  function renderBody() {
    const body = $('#cBody');
    if (tab === 'design') { body.innerHTML = designHtml(); wireDesign(body); return; }
    const sl = slideEl(sel);
    if (!sl) { body.innerHTML = `<div class="cslide-empty">Кликните по слайду в макете,<br>чтобы редактировать его</div>`; return; }
    body.innerHTML = slideHtml(sl); wireSlide(body, sel);
  }
  function tplTile(tpl) {
    const th = (P.themes || {})[tpl.theme] || { blue: '#2563EB', body: '#0A1833' };
    const ff = ((P.fonts || {})[tpl.font] || {}).fam || 'serif';
    return `<button class="ctpl" data-tpl='${esc(JSON.stringify(tpl))}' style="background:linear-gradient(155deg,color-mix(in srgb,${th.blue} 22%,${th.body}),${th.body})"><span class="ctpl-aa" style="font-family:${ff};color:${th.blue}">Aa</span><i>${tpl.name}</i></button>`;
  }
  function designHtml() {
    const cats = Object.keys(P.templates || {});
    return `
    <div class="cgrp"><label>Готовые шаблоны</label>
      <div class="cseg ctpl-cats" id="cTplCats">${cats.map((c, i) => `<button data-cat="${c}" class="${i === 0 ? 'on' : ''}">${c}</button>`).join('')}</div>
      <div class="ctpl-grid" id="cTplGrid">${(P.templates[cats[0]] || []).map(tplTile).join('')}</div>
      <div class="cnote">Один клик — тема, шрифт, узор и стиль текста применятся ко всем слайдам.</div>
    </div>
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
    /* готовые шаблоны: категории + применение ко всем слайдам */
    const grid = $('#cTplGrid', body);
    $('#cTplCats', body).addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; $$('#cTplCats button', body).forEach(x => x.classList.toggle('on', x === b)); grid.innerHTML = ((P.templates || {})[b.dataset.cat] || []).map(tplTile).join(''); });
    grid.addEventListener('click', (e) => { const t = e.target.closest('[data-tpl]'); if (!t) return; let tpl = {}; try { tpl = JSON.parse(t.dataset.tpl); } catch (_) { return; } const arr = serialize().map(s => Object.assign({}, s, { bgpat: tpl.bgpat || '', tstyle: tpl.tstyle || '' })); flash('Применяю шаблон…', 0); save(true, { theme: tpl.theme, font: tpl.font, slides: arr }); });
    $$('.cth-dot', body).forEach(d => d.addEventListener('click', () => save(true, { theme: d.dataset.theme })));
    $('#cFmt', body).addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) save(true, { format: b.dataset.f }); });
    $('#cAddSlide', body).addEventListener('click', (e) => {
      const cats = Object.keys(P.slideTpls || {});
      if (!cats.length) { const arr = serialize(); arr.push({ heading: 'Новый слайд', sub: 'Текст слайда', size: 'm', align: 'left' }); return save(true, { slides: arr }); }
      const th = (P.themes || {})[P.theme] || { blue: '#2563EB', body: '#0A1833' };
      const tile = (t, ci, ti) => `<button class="ctpl" data-sti="${ci}:${ti}" style="background:linear-gradient(155deg,color-mix(in srgb,${th.blue} 20%,${th.body}),${th.body})"><span class="ctpl-aa" style="font-family:var(--disp);color:${th.blue};font-size:14px">${esc((t.s.heading || 'Aa').slice(0, 14))}</span><i>${t.name}</i></button>`;
      const catHtml = (ci) => (P.slideTpls[cats[ci]] || []).map((t, ti) => tile(t, ci, ti)).join('');
      const pp = openPop(`<div class="csec" style="padding-top:2px">Готовый слайд</div><div class="cseg ctpl-cats" id="cStCats">${cats.map((c, i) => `<button data-c="${i}" class="${i === 0 ? 'on' : ''}">${c}</button>`).join('')}</div><div class="ctpl-grid" id="cStGrid">${catHtml(0)}</div><button class="cwbtn wide" id="cStBlank" style="margin-top:8px">+ Пустой слайд</button>`, e.clientX - 250, e.clientY);
      $('#cStCats', pp).addEventListener('click', (ev) => { const b = ev.target.closest('[data-c]'); if (!b) return; $$('#cStCats button', pp).forEach(x => x.classList.toggle('on', x === b)); $('#cStGrid', pp).innerHTML = catHtml(+b.dataset.c); });
      $('#cStGrid', pp).addEventListener('click', (ev) => { const b = ev.target.closest('[data-sti]'); if (!b) return; const [ci, ti] = b.dataset.sti.split(':').map(Number); const t = (P.slideTpls[cats[ci]] || [])[ti]; if (!t) return; const arr = serialize(); arr.push(Object.assign({}, t.s)); closePop(); save(true, { slides: arr }); });
      $('#cStBlank', pp).addEventListener('click', () => { const arr = serialize(); arr.push({ heading: 'Новый слайд', sub: 'Текст слайда', size: 'm', align: 'left' }); closePop(); save(true, { slides: arr }); });
    });
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
    <div class="cgrp"><label>Стиль заголовка</label><button class="cfontbtn" id="cTStyleBtn"><span class="s-h ts-${sl.dataset.tstyle || 'plain'}" style="font-size:18px;font-family:var(--disp)">Aa</span><span style="flex:1">${(P.tstyles || {})[sl.dataset.tstyle || 'plain'] || 'Обычный'}</span> ▾</button></div>
    <div class="cgrp"><label>Узор фона</label><div class="cpats" id="cPats">${PATS.map(([k, n]) => { const on = (sl.dataset.bgpat || '') === k || (!sl.dataset.bgpat && k === 'none'); return `<div class="cpat ${k === 'none' ? 'none' : ''} ${on ? 'on' : ''}" data-pat="${k}" title="${n}"${k !== 'none' ? ` style="background-image:${PATV[k]}"` : ''}>${k === 'none' ? 'нет' : ''}</div>`; }).join('')}</div><div class="cnote">Тонкий узор поверх темы. Не работает вместе с фото/видео/цветом.</div></div>
    <div class="cgrp"><label>Формат выделенного текста</label><div class="cfmtbar" id="cFmtBar">
      <button data-cmd="bold" title="Жирный"><b>Ж</b></button>
      <button data-cmd="italic" title="Курсив"><i>К</i></button>
      <button data-cmd="mark" title="Выделение цветом — выбор палитры"><mark style="padding:0 3px;border-radius:3px">A</mark></button>
      <button data-cmd="clear" title="Убрать формат и выделение">✕</button>
    </div><div class="cnote">Выделите текст в заголовке/подписи, затем нажмите. «A» — палитра цветов выделения.</div></div>
    <div class="cgrp"><label>Элементы на слайде</label>
      <div class="cbtn-row">
        <button class="cwbtn" data-add="shape">◆ Фигура</button>
        <button class="cwbtn" data-add="sticker">✦ Стикер</button>
        <button class="cwbtn" data-add="frame">▢ Рамка</button>
        <button class="cwbtn" data-add="text">T Текст</button>
        <button class="cwbtn wide" data-add="photo">🖼 Фото-слой</button>
      </div>
      <div class="cnote">Добавь элемент → тяни его на макете, угол — размер, стрелки над ним — слои вперёд/назад.</div>
    </div>
    <div class="cgrp"><label>Порядок и удаление слайда</label><div class="cbtn-row">
      <button class="cwbtn" data-mv="up">↑ Выше</button>
      <button class="cwbtn" data-mv="down">↓ Ниже</button>
      <button class="cwbtn wide dng" data-mv="del">Удалить слайд</button>
    </div></div>`;
  }
  function wireSlide(body, i) {
    $('#cPos', body).addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; applyMeta(i, 'pos', b.dataset.v); $$('#cPos button', body).forEach(x => x.classList.toggle('on', x === b)); });
    $('#cAlign', body).addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; applyMeta(i, 'align', b.dataset.v); $$('#cAlign button', body).forEach(x => x.classList.toggle('on', x === b)); });
    $('#cSize', body).addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; applyMeta(i, 'size', b.dataset.v); $$('#cSize button', body).forEach(x => x.classList.toggle('on', x === b)); });
    const tsBtn = $('#cTStyleBtn', body);
    if (tsBtn) tsBtn.addEventListener('click', (e) => {
      const sl = slideEl(i); const cur = sl.dataset.tstyle || 'plain';
      const grid = Object.entries(P.tstyles || { plain: 'Обычный' }).map(([k, n]) => `<button class="ctst ${cur === k ? 'on' : ''}" data-ts="${k}" title="${n}"><span class="s-h ts-${k}" style="font-size:18px;font-family:var(--disp)">Aa</span><i>${n}</i></button>`).join('');
      const pp = openPop(`<div class="ctstyles">${grid}</div>`, e.clientX - 250, e.clientY);
      pp.addEventListener('click', (ev) => { const b = ev.target.closest('[data-ts]'); if (!b) return; const k = b.dataset.ts; sl.dataset.tstyle = k; const h = sl.querySelector('.s-h'); if (h) h.className = 's-h' + (k !== 'plain' ? ' ts-' + k : ''); dirty = true; closePop(); save(false); renderBody(); });
    });
    $('#cFmtBar', body).addEventListener('mousedown', (e) => {
      const b = e.target.closest('[data-cmd]'); if (!b) return; e.preventDefault(); const cmd = b.dataset.cmd;
      const s2 = document.getSelection(); if (!s2 || !s2.rangeCount || !s2.toString()) { flash('Сначала выделите текст в слайде'); return; }
      const anc = s2.anchorNode && (s2.anchorNode.nodeType === 1 ? s2.anchorNode : s2.anchorNode.parentElement);
      const host = anc && anc.closest('[data-ce]');
      if (!host) { flash('Выделите текст внутри слайда'); return; }
      if (cmd === 'bold') { document.execCommand('bold'); dirty = true; }
      else if (cmd === 'italic') { document.execCommand('italic'); dirty = true; }
      else if (cmd === 'clear') { const r = s2.getRangeAt(0); marksIn(r, host).forEach(unwrap); host.normalize(); document.execCommand('removeFormat'); dirty = true; }
      else if (cmd === 'mark') {
        const rc = b.getBoundingClientRect();
        const sw = HL.map(([k, c]) => `<span class="hlsw" data-hl="${k}" title="Выделение" style="background:${c}"></span>`).join('');
        const pp = openPop(`<div class="hlpop"><div class="hlrow">${sw}</div><button class="hloff" data-hl="off">Снять выделение</button></div>`, rc.left - 96, rc.bottom + 8);
        pp.addEventListener('mousedown', (ev) => { const t = ev.target.closest('[data-hl]'); if (!t) return; ev.preventDefault(); markSel(t.dataset.hl, host); closePop(); });
      }
    });
    $$('[data-mv]', body).forEach(b => b.addEventListener('click', () => {
      const arr = serialize(); const kind = b.dataset.mv;
      if (kind === 'del') { if (arr.length <= 1) { flash('Оставьте хотя бы 1 слайд'); return; } arr.splice(i, 1); return save(true, { slides: arr }); }
      if (kind === 'up' && i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; return save(true, { slides: arr }); }
      if (kind === 'down' && i < arr.length - 1) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; return save(true, { slides: arr }); }
    }));
    /* добавление элементов-слоёв */
    const accent = ((P.themes[P.theme] || {}).blue) || '#1D34D8';
    const addLayer = (layer) => { const arr = serialize(); arr[i].layers = arr[i].layers || []; layer.z = Math.max(0, ...arr[i].layers.map(l => l.z || 0)) + 1; arr[i].layers.push(layer); save(true, { slides: arr }); };
    const shapeMini = (s) => ({ rect: '<rect x="3" y="3" width="18" height="18" rx="3"/>', circle: '<circle cx="12" cy="12" r="9"/>', ring: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="3"/>', line: '<rect x="2" y="10" width="20" height="4" rx="2"/>', triangle: '<polygon points="12,3 21,21 3,21"/>', blob: '<circle cx="12" cy="12" r="9"/>', arrow: '<path d="M4 12h13M12 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>', badge: '<rect x="3" y="3" width="18" height="18" rx="6"/>', diamond: '<polygon points="12,3 21,12 12,21 3,12"/>' }[s] || '<rect x="3" y="3" width="18" height="18"/>');
    $$('[data-add]', body).forEach(b => b.addEventListener('click', (e) => {
      const kind = b.dataset.add;
      if (kind === 'shape') {
        const pp = openPop(`<div class="celem-grid">${(P.shapes || []).map(s => `<button class="celem" data-shape="${s}" title="${s}"><svg viewBox="0 0 24 24" fill="currentColor">${shapeMini(s)}</svg></button>`).join('')}</div>`, e.clientX - 120, e.clientY);
        pp.addEventListener('click', (ev) => { const t = ev.target.closest('[data-shape]'); if (!t) return; closePop(); addLayer({ t: 'shape', shape: t.dataset.shape, color: accent, fill: true, x: 34, y: 34, w: 26, round: 10 }); });
      } else if (kind === 'sticker') {
        const pp = openPop(`<div class="celem-grid">${Object.entries(P.stickers || {}).map(([k, path]) => `<button class="celem" data-stick="${k}" title="${k}"><svg viewBox="0 0 24 24">${path}</svg></button>`).join('')}</div>`, e.clientX - 150, e.clientY);
        pp.addEventListener('click', (ev) => { const t = ev.target.closest('[data-stick]'); if (!t) return; closePop(); const sl = slideEl(i); const white = sl.classList.contains('hasbg'); addLayer({ t: 'sticker', key: t.dataset.stick, color: white ? '#FFFFFF' : accent, x: 40, y: 38, w: 16 }); });
      } else if (kind === 'frame') {
        const FN = { thin: 'Тонкая', double: 'Двойная', corners: 'Уголки', inset: 'Внутренняя', film: 'Плёнка', tape: 'Кант' };
        const pp = openPop(`<div class="celem-frames">${(P.frames || []).map(f => `<button class="celem-fr" data-frame="${f}">${FN[f] || f}</button>`).join('')}</div>`, e.clientX - 120, e.clientY);
        pp.addEventListener('click', (ev) => { const t = ev.target.closest('[data-frame]'); if (!t) return; closePop(); const sl = slideEl(i); addLayer({ t: 'frame', frame: t.dataset.frame, color: sl.classList.contains('hasbg') ? '#FFFFFF' : accent }); });
      } else if (kind === 'text') {
        addLayer({ t: 'text', text: 'Текст', color: slideEl(i).classList.contains('hasbg') ? '#FFFFFF' : '#0A1833', tsize: 24, tw: 'sans', tb: true, x: 30, y: 42, w: 40 });
      } else if (kind === 'photo') {
        const pp = openPop(`<div class="csec">Фото-слой</div>
          <div class="cpi" data-ph="file">⤴ Загрузить файл</div>
          <div class="csec">или ссылка на фото</div><input class="cinp" id="cLpUrl" placeholder="https://…"><div class="cpi" data-ph="url">Вставить по ссылке</div>
          <div class="csec">или собрать со страницы</div><input class="cinp" id="cLpPage" placeholder="ссылка на страницу проекта"><div class="cpi" data-ph="scan">🔎 Найти фото на странице</div>
          <div id="cLpGrid" class="celem-grid"></div>`, e.clientX - 200, e.clientY);
        pp.addEventListener('click', async (ev) => {
          const it = ev.target.closest('[data-ph]'); if (it) {
            const k2 = it.dataset.ph;
            if (k2 === 'file') { pickFile('image/*', async (f) => { flash('Загружаю…', 0); try { const url = await uploadAsset(f); closePop(); addLayer({ t: 'img', url, x: 22, y: 22, w: 42, round: 12 }); } catch (er) { flash('Ошибка: ' + er.message); } }); return; }
            if (k2 === 'url') { const v = $('#cLpUrl', pp).value.trim(); if (v) { closePop(); addLayer({ t: 'img', url: v, x: 22, y: 22, w: 42, round: 12 }); } return; }
            if (k2 === 'scan') { const v = $('#cLpPage', pp).value.trim(); if (!v) { flash('Вставьте ссылку на страницу'); return; } flash('Сканирую фото…', 0); try { const r = await fetch(`/api/social/scrape-images`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: v }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); flash((j.images || []).length + ' фото — кликните нужное', 2000); $('#cLpGrid', pp).innerHTML = (j.images || []).slice(0, 24).map(u => `<button class="celem cimgpick" data-imgu="${esc(u)}" style="background-image:url('${esc(u)}')"></button>`).join(''); } catch (er) { flash('Не вышло: ' + er.message); } return; }
          }
          const pk = ev.target.closest('[data-imgu]'); if (pk) { closePop(); addLayer({ t: 'img', url: pk.dataset.imgu, x: 20, y: 20, w: 44, round: 12 }); }
        });
      }
    }));
    /* фон */
    $$('[data-bg]', body).forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.bg; const extra = $('#cBgExtra', body);
      if (k === 'none') { setBg(i, 'none'); return; }
      if (k === 'color') { extra.innerHTML = `<input type="color" class="ccolor" id="cCol" value="${slideEl(i).dataset.bgc || '#0A1833'}">`; $('#cCol', extra).addEventListener('input', (e) => setBgLive(i, 'color', e.target.value)); $('#cCol', extra).addEventListener('change', (e) => setBg(i, 'color', e.target.value)); return; }
      if (k === 'photo' || k === 'video') {
        const isV = k === 'video';
        const cur = slideEl(i).dataset[isV ? 'bgv' : 'bg'] || '';
        extra.innerHTML = `<div class="cdrop" id="cDrop"><div class="cdrop-ic">${isV ? '🎬' : '🖼'}</div><div class="cdrop-t">Перетащите ${isV ? 'видео' : 'фото'} сюда<br>или <b>выберите файл</b></div></div>
          <input class="cinp" id="cUrl" placeholder="…или вставьте ссылку (URL)" value="${esc(/^https?:/.test(cur) ? cur : '')}">
          <div class="cnote">${isV ? 'MP4 / WebM · до 25 МБ · зациклится без звука. Лучше 9:16 или 1:1.' : 'JPG / PNG / WebP · до 25 МБ. Лучше вертикаль 4:5 или квадрат 1:1 — под формат карусели.'}</div>
          <div class="cthumb" id="cThumb">${cur ? (isV ? `<video src="${esc(cur)}" muted playsinline></video>` : `<img src="${esc(cur)}" alt="">`) : ''}</div>`;
        const drop = $('#cDrop', extra);
        const doUp = async (file) => {
          if (!file) return;
          const okImg = /^image\//.test(file.type), okVid = /^video\/(mp4|webm)/.test(file.type);
          if ((isV && !okVid) || (!isV && !okImg)) { flash(isV ? 'Нужен файл MP4/WebM' : 'Нужен JPG/PNG/WebP'); return; }
          if (file.size > 25e6) { flash('Файл больше 25 МБ'); return; }
          flash('Загружаю…', 0);
          try { const url = await uploadAsset(file); setBg(i, isV ? 'video' : 'photo', url); flash('Фон обновлён ✓'); } catch (err) { flash('Ошибка: ' + err.message); }
        };
        drop.addEventListener('click', () => pickFile(isV ? 'video/mp4,video/webm' : 'image/*', doUp));
        ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
        ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
        drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) doUp(f); });
        $('#cUrl', extra).addEventListener('change', (e) => { const v = e.target.value.trim(); if (v) setBg(i, isV ? 'video' : 'photo', v); });
        return;
      }
      if (k === 'ai') {
        extra.innerHTML = `<input class="cinp" id="cAiP" placeholder="напр. панорама Дубая на закате"><button class="cwbtn wide" id="cAiGo" style="margin-top:7px">✦ Нарисовать фон</button>`;
        $('#cAiGo', extra).addEventListener('click', async () => { const prompt = $('#cAiP', extra).value.trim(); if (!prompt) { flash('Опишите фон'); return; } flash('✦ ИИ рисует фон (10–20с)…', 0); try { const r = await fetch(`/api/carousels/${P.cid}/ai-bg?key=${encodeURIComponent(KEY)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setBg(i, 'photo', j.url); flash('Фон готов ✓'); } catch (err) { flash('Не вышло: ' + err.message); } });
        return;
      }
    }));
    /* узор фона */
    const pats = $('#cPats', body);
    if (pats) pats.addEventListener('click', (e) => {
      const t = e.target.closest('[data-pat]'); if (!t) return;
      const kk = t.dataset.pat; const sl = slideEl(i); if (!sl) return;
      $$('.cpat', pats).forEach(x => x.classList.toggle('on', x === t));
      sl.className = sl.className.replace(/\bpat-\w+/g, '').replace(/\s+/g, ' ').trim();
      if (kk === 'none') { delete sl.dataset.bgpat; }
      else {
        delete sl.dataset.bg; delete sl.dataset.bgv; delete sl.dataset.bgc;
        const ov = sl.querySelector('.s-bgv'), os = sl.querySelector('.s-shade'); if (ov) ov.remove(); if (os) os.remove();
        sl.style.background = ''; sl.style.backgroundImage = ''; sl.classList.remove('hasbg');
        sl.dataset.bgpat = kk; sl.classList.add('pat-' + kk);
      }
      dirty = true; save(false); renderBody();
    });
  }
  /* цвет вживую без сохранения (сохраняем на change) */
  function setBgLive(i, kind, val) { const sl = slideEl(i); if (!sl) return; if (kind === 'color') { sl.dataset.bgc = val; delete sl.dataset.bg; delete sl.dataset.bgv; const ov = sl.querySelector('.s-bgv'), os = sl.querySelector('.s-shade'); if (ov) ov.remove(); if (os) os.remove(); sl.style.backgroundImage = ''; sl.style.background = val; sl.classList.toggle('hasbg', isDark(val)); } }

  /* старт: выбрать первый слайд, показать вкладку Дизайн */
  renderBody();
  selectSlide(0, false);
})();
