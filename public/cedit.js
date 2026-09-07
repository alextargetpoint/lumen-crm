/* Редактор карусели соц-помощника (поверх серверного рендера /car/:id).
   Тексты = [data-ce="idx:field"], слайды = .slide[data-idx]. Отдельный файл — обход </script>-ловушки. */
(() => {
  const P = window.CEDIT || {};
  const KEY = P.key || '';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstElementChild; };
  let dirty = false, pop = null;

  const css = document.createElement('style');
  css.textContent = `
.cbar{position:fixed;top:0;left:0;right:0;z-index:900;background:linear-gradient(100deg,#0A1833,#061126);color:#fff;display:flex;gap:9px;align-items:center;padding:11px 16px;font-family:Manrope,sans-serif;font-size:13px;flex-wrap:wrap;border-bottom:1px solid rgba(134,175,255,.16)}
.cbar b{font-family:Fraunces,serif;font-weight:600;font-size:15px}
.cbar .sp{flex:1}
.cbtn{background:#2563EB;color:#fff;border:none;border-radius:9px;padding:9px 15px;font-weight:600;font-size:13px;cursor:pointer;font-family:Manrope,sans-serif;display:inline-flex;gap:6px;align-items:center}
.cbtn.g{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18)}
.cbtn.ai{background:linear-gradient(120deg,#2563EB,#5B2BD8)}
.cbtn:disabled{opacity:.5}
.cthemes{display:inline-flex;gap:6px}
.cth-dot{width:22px;height:22px;border-radius:50%;border:2px solid transparent;cursor:pointer;background:linear-gradient(135deg,var(--d) 50%,var(--b) 50%)}
.cth-dot.on{border-color:#fff;box-shadow:0 0 0 2px #2563EB}
.cpop{position:fixed;z-index:950;background:#fff;color:#0B1220;border-radius:14px;box-shadow:0 22px 60px rgba(6,17,38,.32);border:1px solid #E7ECF3;padding:8px;min-width:230px;font-family:Manrope,sans-serif;font-size:13.5px}
.cpop .sec{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:#8a90a0;padding:8px 11px 3px;font-weight:700}
.cpop .it{display:flex;gap:9px;align-items:center;padding:9px 11px;border-radius:9px;cursor:pointer;font-weight:600}
.cpop .it:hover{background:#EEF3FF}
.cpop input{width:100%;border:1.5px solid #E1E8F4;border-radius:9px;padding:9px 11px;font-size:13px;font-family:inherit;outline:none;margin:4px 0}
.cpop input:focus{border-color:#2563EB}
.fprow{display:flex;align-items:center;gap:13px;padding:9px 11px;border-radius:10px;cursor:pointer}
.fprow:hover{background:#EEF3FF}.fprow.on{background:#F5F8FF;box-shadow:inset 0 0 0 1px #2563EB}
.fprow .aa{font-size:26px;width:36px;flex:0 0 36px;text-align:center}
.fprow .nm{flex:1;min-width:0;font-size:13px;font-weight:600;white-space:nowrap}.fprow .nm i{display:block;font-style:normal;font-size:13px;color:#5E6470;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cstatus{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:960;background:#0A1833;color:#fff;border:1px solid rgba(134,175,255,.2);border-radius:999px;padding:11px 22px;font-size:13px;font-weight:600;font-family:Manrope,sans-serif;box-shadow:0 12px 34px rgba(6,17,38,.45);display:none}
@media print{.cbar,.cstatus{display:none!important}}
`;
  document.head.appendChild(css);
  document.querySelector('.wrap').style.marginTop = '8px';

  const flash = (t, ms = 1600) => { let s = $('.cstatus'); if (!s) { s = el('<div class="cstatus"></div>'); document.body.appendChild(s); } s.textContent = t; s.style.display = 'block'; clearTimeout(flash._t); if (ms) flash._t = setTimeout(() => s.style.display = 'none', ms); };
  const closePop = () => { if (pop) { pop.remove(); pop = null; } };
  const openPop = (html, x, y) => { closePop(); pop = el(`<div class="cpop">${html}</div>`); document.body.appendChild(pop); const w = pop.offsetWidth, h = pop.offsetHeight; pop.style.left = Math.min(x, innerWidth - w - 12) + 'px'; pop.style.top = Math.min(y, innerHeight - h - 12) + 'px'; setTimeout(() => document.addEventListener('click', function h2(e) { if (pop && !pop.contains(e.target)) { closePop(); document.removeEventListener('click', h2); } }), 0); return pop; };

  /* ---- toolbar ---- */
  const bar = el(`<div class="cbar">
    <b>Карусель</b>
    <span class="cthemes">${Object.entries(P.themes || {}).map(([k, t]) => `<button class="cth-dot ${k === P.theme ? 'on' : ''}" data-theme="${k}" title="${t.name}" style="--d:${t.blue};--b:${t.body}"></button>`).join('')}</span>
    <button class="cbtn g" id="cFont"><span style="font-family:${(P.fonts[P.fontPreset] || {}).disp};font-size:15px">Aa</span> ${(P.fonts[P.fontPreset] || {}).name || 'Шрифт'} ▾</button>
    <button class="cbtn g" id="cFormat">${P.format === 'portrait' ? '4:5 вертикаль' : '1:1 квадрат'}</button>
    <span class="sp"></span>
    <button class="cbtn g" id="cAdd">+ Слайд</button>
    <button class="cbtn g" id="cPdf">Скачать PDF</button>
    <button class="cbtn" id="cSave">Сохранить</button>
  </div>`);
  document.body.appendChild(bar);
  $$('[data-ce]').forEach(e => { e.setAttribute('contenteditable', 'true'); e.addEventListener('input', () => dirty = true); });

  function serialize() {
    const slides = [];
    $$('.slide').forEach((sl) => {
      const i = sl.dataset.idx;
      const h = sl.querySelector(`[data-ce="${i}:heading"]`); const s = sl.querySelector(`[data-ce="${i}:sub"]`);
      slides.push({ heading: (h ? h.innerText : '').trim(), sub: (s ? s.innerText : '').trim(), bg: sl.dataset.bg || (sl.classList.contains('hasbg') ? (sl.style.backgroundImage.match(/url\(['"]?([^'")]+)/) || [])[1] || '' : '') });
    });
    return slides;
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
  addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });

  /* темы */
  $$('.cth-dot', bar).forEach(d => d.addEventListener('click', () => save(true, { theme: d.dataset.theme })));
  /* формат */
  $('#cFormat').addEventListener('click', () => save(true, { format: P.format === 'portrait' ? 'square' : 'portrait' }));
  /* шрифт */
  Object.values(P.fonts).forEach(f => { if (f.gf) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = `https://fonts.googleapis.com/css2?${f.gf}&display=swap`; document.head.appendChild(l); } });
  $('#cFont').addEventListener('click', (e) => {
    const tiles = Object.entries(P.fonts).map(([k, f]) => `<div class="fprow ${k === P.fontPreset ? 'on' : ''}" data-fp="${k}"><span class="aa" style="font-family:${f.disp}">Aa</span><span class="nm">${f.name}<i style="font-family:${f.disp}">Заголовок карусели</i></span></div>`).join('');
    const el2 = openPop(`<div class="sec">Шрифт</div>${tiles}`, e.clientX, e.clientY);
    el2.addEventListener('click', (e2) => { const t = e2.target.closest('[data-fp]'); if (t) { closePop(); save(true, { fontPreset: t.dataset.fp }); } });
  });
  /* добавить слайд */
  $('#cAdd').addEventListener('click', async () => { const sl = serialize(); sl.push({ heading: 'Новый слайд', sub: 'Текст слайда' }); await save(true, { slides: sl }); });
  /* PDF */
  $('#cPdf').addEventListener('click', async () => { if (dirty) await save(false); window.open(`/car/${P.cid}?print=1`, '_blank'); });

  /* инструменты слайда: bg / up / down / del */
  document.body.addEventListener('click', async (e) => {
    const op = e.target.closest('[data-sop]'); if (!op) return;
    const sl = op.closest('.slide'); const idx = +sl.dataset.idx; const arr = serialize();
    const kind = op.dataset.sop;
    if (kind === 'del') { if (arr.length <= 1) { flash('Оставьте хотя бы 1 слайд'); return; } arr.splice(idx, 1); return save(true, { slides: arr }); }
    if (kind === 'up' && idx > 0) { [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]; return save(true, { slides: arr }); }
    if (kind === 'down' && idx < arr.length - 1) { [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]]; return save(true, { slides: arr }); }
    if (kind === 'bg') {
      const el2 = openPop(`<div class="sec">Фон слайда</div>
        <div class="it" data-bg="none">Без фона (тема)</div>
        ${P.img ? `<div class="sec">✦ Сгенерировать ИИ</div><input id="cBgAi" placeholder="напр. панорама Дубая в закат"><div class="it" data-bg="ai" style="justify-content:center;font-weight:700;color:#2563EB">✦ Сгенерировать фон</div>` : ''}
        <div class="sec">или ссылка на фото</div><input id="cBgUrl" placeholder="https://…"><div class="it" data-bg="url" style="justify-content:center">Применить ссылку</div>`, e.clientX, e.clientY);
      el2.addEventListener('click', async (e2) => {
        const it = e2.target.closest('[data-bg]'); if (!it) return;
        const k = it.dataset.bg;
        if (k === 'none') { arr[idx].bg = ''; closePop(); return save(true, { slides: arr }); }
        if (k === 'url') { const v = $('#cBgUrl', el2).value.trim(); if (v) { arr[idx].bg = v; closePop(); return save(true, { slides: arr }); } }
        if (k === 'ai') {
          const prompt = $('#cBgAi', el2).value.trim(); if (!prompt) { flash('Опишите фон'); return; }
          closePop(); flash('✦ ИИ рисует фон (10–20с)…', 0);
          try { const r = await fetch(`/api/carousels/${P.cid}/ai-bg?key=${encodeURIComponent(KEY)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); arr[idx].bg = j.url; save(true, { slides: arr }); } catch (err) { flash('Не вышло: ' + err.message); }
        }
      });
    }
  });
})();
