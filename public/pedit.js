/* Lumen CRM — конструктор подборки v2 (браузерный редактор публичной страницы).
   Работает поверх серверного рендера: тексты = [data-be], картинки = [data-bimg],
   видео = [data-bvideo], списки = [data-plist], блоки = [data-bid].
   Структурные операции (добавить/вид/удалить) сохраняют всё и перезагружают
   страницу (рендер всегда серверный, единый с PDF). Тексты/картинки — по «Сохранить». */
(() => {
  const P = window.PEDIT || {};
  const KEY = P.key;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ---------- CSS редактора ---------- */
  const css = document.createElement('style');
  css.textContent = `
[data-be]{outline:1.5px dashed rgba(29,52,216,.45);outline-offset:3px;min-height:1em;min-width:24px;display:inline-block;cursor:text;border-radius:2px}
[data-be]:focus{outline:2px solid rgba(29,52,216,.8);background:rgba(29,52,216,.04)}
.blue [data-be],.cphoto [data-be],.sphoto [data-be]{outline-color:rgba(255,255,255,.55)}
.blue [data-be]:focus,.cphoto [data-be]:focus{outline-color:#fff;background:rgba(255,255,255,.08)}
div[data-be],h1[data-be],h2[data-be],p[data-be],li[data-be]{display:block}
.book{margin-top:56px;margin-bottom:120px}
[data-bhid="1"]{opacity:.35}
.imghot{display:flex!important;position:absolute;top:10px;right:10px;z-index:6;background:#0B0B0F;color:#fff;border-radius:8px;padding:6px 10px;font-size:13px;cursor:pointer;align-items:center;gap:5px;box-shadow:0 4px 14px rgba(0,0,0,.3);user-select:none}
.imghot:hover{background:#1D34D8}
.imghot.vhot{top:auto;bottom:14px;right:14px}
.edbar{position:fixed;top:0;left:0;right:0;z-index:900;background:#0B0B0F;color:#fff;display:flex;gap:8px;align-items:center;padding:10px 14px;font-size:13px;flex-wrap:wrap;font-family:Inter,sans-serif}
.edbar b{font-weight:800}
.edbar .hint{opacity:.55;font-size:11.5px}
.edbar .sp{flex:1}
.pethemes{display:inline-flex;gap:6px;align-items:center;margin-left:10px}
.peth-dot{width:22px;height:22px;border-radius:50%;border:2px solid transparent;cursor:pointer;background:linear-gradient(135deg,var(--td) 50%,var(--tb) 50%);transition:transform .15s}
.peth-dot:hover{transform:scale(1.15)}
.peth-dot.on{border-color:#fff;box-shadow:0 0 0 2px #1D34D8}
.edbtn{background:#1D34D8;color:#fff;border:none;border-radius:8px;padding:9px 16px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;display:inline-flex;gap:6px;align-items:center}
.edbtn.g{background:#2b2f3a}
.edbtn.ai{background:linear-gradient(120deg,#1D34D8,#5B2BD8)}
.edbtn:disabled{opacity:.5;cursor:default}
.btool{position:absolute;top:10px;left:10px;z-index:7;display:flex;gap:4px;background:#0B0B0F;border-radius:10px;padding:4px;opacity:0;transition:opacity .15s;box-shadow:0 6px 20px rgba(0,0,0,.35)}
section[data-bid]:hover .btool{opacity:1}
.btool button{width:30px;height:30px;border-radius:7px;border:none;background:transparent;color:#fff;cursor:pointer;font-size:14px;display:grid;place-items:center;font-family:inherit}
.btool button:hover{background:#1D34D8}
.btool .bname{color:#8a90a0;font-size:11px;align-self:center;padding:0 7px;font-weight:700;white-space:nowrap}
.pepop{position:fixed;z-index:950;background:#fff;color:#0B0B0F;border-radius:14px;box-shadow:0 18px 60px rgba(10,16,40,.35);padding:8px;min-width:230px;font-family:Inter,sans-serif;font-size:13.5px}
.pepop .pi{display:flex;gap:9px;align-items:center;padding:9px 11px;border-radius:9px;cursor:pointer;font-weight:600}
.pepop .pi:hover{background:#EFF2FB}
.pepop .pi i{font-style:normal;width:20px;text-align:center}
.pepop .psec{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8a90a0;padding:8px 11px 3px;font-weight:700}
.pepop input[type=text]{width:100%;border:1.5px solid #dfe3ee;border-radius:8px;padding:8px 10px;font-size:13px;font-family:inherit;outline:none;margin:4px 0}
.pepop input[type=text]:focus{border-color:#1D34D8}
.pepop .prow{display:flex;gap:6px;padding:4px 6px}
.plibrow{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:4px 6px}
.pgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:4px;max-width:420px}
.pi.ptile{flex-direction:column;gap:6px;text-align:center;padding:12px 6px;border:1px solid #EDF0F7;border-radius:11px}
.pi.ptile i{font-size:21px;width:auto}
.pi.ptile span{font-size:10.5px;line-height:1.25;font-weight:650;color:#3D4A63}
.pi.ptile:hover{border-color:#1D34D8;background:#F3F6FF}
section[data-bid].sec-drag{outline:3px dashed rgba(29,52,216,.6);outline-offset:-3px;opacity:.75}
.plib{aspect-ratio:4/3;border-radius:7px;background-size:cover;background-position:center;cursor:pointer;border:2px solid transparent}
.plib:hover{border-color:#1D34D8}
.aifab{position:fixed;z-index:940;background:linear-gradient(120deg,#1D34D8,#5B2BD8);color:#fff;border:none;border-radius:999px;padding:7px 13px;font-size:12.5px;font-weight:800;cursor:pointer;box-shadow:0 8px 24px rgba(29,52,216,.4);font-family:Inter,sans-serif;display:none}
.plistadd{display:block;margin-top:10px;background:transparent;border:1.5px dashed rgba(29,52,216,.5);color:#1D34D8;border-radius:9px;padding:7px 14px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit}
.blue .plistadd,.rec .plistadd{border-color:rgba(255,255,255,.6);color:#fff}
.pestatus{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:960;background:#0B0B0F;color:#fff;border-radius:999px;padding:10px 22px;font-size:13px;font-weight:700;font-family:Inter,sans-serif;display:none;box-shadow:0 10px 30px rgba(0,0,0,.4)}
@media print{.edbar,.btool,.imghot,.plistadd,.aifab,.pestatus{display:none!important}}
`;
  document.head.appendChild(css);

  /* ---------- фирменный лоадер ----------
     Оверлей отрендерен СЕРВЕРОМ первым элементом body (виден с первого кадра,
     белой вспышки между страницами нет); инлайн-скрипт там же гасит его, если
     перезагрузка не наша или флаг протух (>15с). Здесь: показ перед reload +
     плавное снятие с МИНИМАЛЬНЫМ временем показа (не мигает на быстрых загрузках). */
  const peShow = () => {
    const o = document.querySelector('#peload');
    if (o) { o.style.display = 'grid'; o.classList.remove('out'); }
  };
  const reloadWithLoader = () => { sessionStorage.setItem('pe_loading', String(Date.now())); peShow(); setTimeout(() => location.reload(), 60); };
  (() => {
    const t0 = +sessionStorage.getItem('pe_loading') || 0;
    sessionStorage.removeItem('pe_loading');
    const o = document.querySelector('#peload');
    if (!o) return;
    if (!t0) { o.style.display = 'none'; return; }
    const MIN_SHOW = 750;                       /* короче — воспринимается как мигание */
    const hide = () => {
      const wait = Math.max(0, MIN_SHOW - (Date.now() - t0));
      setTimeout(() => {
        try { sessionStorage.setItem('pe_diag', JSON.stringify({ shownMs: Date.now() - t0, waited: wait })); } catch (e) {}
        o.classList.add('out'); setTimeout(() => { o.style.display = 'none'; }, 420);
      }, wait);
    };
    if (document.readyState === 'complete') hide();
    else addEventListener('load', hide);
    setTimeout(() => { o.classList.add('out'); setTimeout(() => o.style.display = 'none', 420); }, 6000); /* страховка от застревания */
  })();

  /* ---------- состояние ---------- */
  let dirty = false;
  const status = document.createElement('div');
  status.className = 'pestatus';
  document.body.appendChild(status);
  const flash = (t, ms) => { status.textContent = t; status.style.display = 'block'; clearTimeout(flash._t); if (ms !== 0) flash._t = setTimeout(() => status.style.display = 'none', ms || 2200); };

  /* ---------- верхняя панель ---------- */
  const bar = document.createElement('div');
  bar.className = 'edbar';
  bar.innerHTML = `<b>Конструктор подборки</b>
    <span class="hint">клик по тексту — правка · правый клик — меню блока и пунктов</span>
    <span class="pethemes">${Object.entries(P.themes || {}).map(([k, t]) => `<button class="peth-dot ${k === P.theme ? 'on' : ''}" data-theme="${k}" title="${t.name}" style="--td:${t.blue};--tb:${t.body}"></button>`).join('')}</span>
    <span class="sp"></span>
    <button class="edbtn g" id="peUndo" title="Отменить (⌘Z)" ${P.undo ? '' : 'disabled'}>↩</button>
    <button class="edbtn g" id="peRedo" title="Повторить (⇧⌘Z)" ${P.redo ? '' : 'disabled'}>↪</button>
    <button class="edbtn g" id="peVers">Версии${(P.versions || []).length ? ' · ' + P.versions.length : ''}</button>
    ${P.llm ? '<button class="edbtn ai" id="peCompose">✦ Собрать тексты ИИ</button>' : ''}
    <button class="edbtn g" id="peView">Просмотр</button>
    <button class="edbtn" id="peSave">Сохранить</button>`;
  document.body.appendChild(bar);
  $$('.peth-dot', bar).forEach((d) => d.addEventListener('click', async () => {
    flash('Применяю тему…', 0);
    const r = await fetch(`/p/${P.cid}/blocks?key=${encodeURIComponent(KEY)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks: serialize(), theme: d.dataset.theme }),
    });
    if (r.ok) { sessionStorage.setItem('pe_scroll', String(scrollY)); reloadWithLoader(); }
    else flash('Ошибка темы');
  }));

  /* ---------- попап-хелпер ---------- */
  let pop = null;
  const closePop = () => { if (pop) { pop.remove(); pop = null; } };
  const openPop = (html, x, y) => {
    closePop();
    pop = document.createElement('div');
    pop.className = 'pepop';
    pop.innerHTML = html;
    document.body.appendChild(pop);
    const r = pop.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
    pop.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
    return pop;
  };
  addEventListener('pointerdown', (e) => { if (pop && !pop.contains(e.target)) closePop(); }, true);
  addEventListener('scroll', closePop, { passive: true });

  /* ---------- contenteditable ---------- */
  $$('[data-be]').forEach((el) => {
    el.contentEditable = 'plaintext-only';
    el.addEventListener('input', () => { dirty = true; });
  });

  /* ---------- сериализация DOM → blocks ---------- */
  function serialize() {
    const blocks = [];
    $$('section[data-bid]').forEach((sec) => {
      const b = { id: sec.dataset.bid, t: sec.dataset.bt, v: sec.dataset.bv, hidden: sec.dataset.bhid === '1', data: {} };
      if (sec.dataset.pid) b.data.pid = sec.dataset.pid;
      /* тексты */
      $$('[data-be]', sec).forEach((el) => {
        const parts = el.dataset.be.split(':');           /* bid:field[:idx[:sub]] */
        const field = parts[1];
        const val = el.innerText.replace(/ /g, ' ').trim();
        if (parts.length === 2) { b.data[field] = val; return; }
        const idx = +parts[2];
        if (parts.length === 3) { (b.data[field] = b.data[field] || [])[idx] = val; return; }
        const sub = parts[3];
        const arr = b.data[field] = b.data[field] || [];
        (arr[idx] = arr[idx] || {})[sub] = val;
      });
      /* картинки */
      $$('[data-bimg]', sec).forEach((el) => {
        const parts = el.dataset.bimg.split(':');
        const field = parts[1];
        const val = (el.dataset.bival || '').trim();
        if (parts.length === 2) { if (val) b.data[field] = val; else delete b.data[field]; return; }
        (b.data[field] = b.data[field] || [])[+parts[2]] = val;
      });
      /* видео */
      if (b.t === 'video') b.data.url = sec.dataset.vurl || '';
      /* своя ссылка CTA-кнопки (пусто = дефолтный WhatsApp менеджера) */
      const cbtn = sec.querySelector('.ctabtn');
      if (cbtn && (cbtn.dataset.chref || '').trim()) b.data.href = cbtn.dataset.chref.trim();
      /* чистка списков: пустые текстовые пункты и объекты-пустышки выпадают */
      for (const k of ['bullets', 'whyRent']) if (Array.isArray(b.data[k])) b.data[k] = b.data[k].filter((x) => x && String(x).trim());
      if (Array.isArray(b.data.items)) b.data.items = b.data.items.filter((x) => x && Object.values(x).some((v) => String(v || '').trim()));
      if (Array.isArray(b.data.imgs) && b.t === 'gallery') b.data.imgs = b.data.imgs.filter((x) => x);
      blocks.push(b);
    });
    return blocks;
  }

  async function save(reload) {
    flash('Сохраняю…', 0);
    const r = await fetch(`/p/${P.cid}/blocks?key=${encodeURIComponent(KEY)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks: serialize() }),
    });
    if (!r.ok) { const j = await r.json().catch(() => ({})); flash('Ошибка: ' + (j.error || r.status)); return false; }
    dirty = false;
    if (reload) { reloadWithLoader(); return true; }
    flash('Сохранено ✓');
    return true;
  }
  $('#peSave').addEventListener('click', () => save(false));
  $('#peView').addEventListener('click', async () => { if (!dirty || await save(false)) location.href = `/p/${P.cid}`; });
  addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });

  /* ---------- undo / redo (серверная история: переживает перезагрузки) ---------- */
  async function histStep(op) {
    /* несохранённые правки сначала фиксируем — тогда одна отмена возвращает как было */
    if (dirty && op === 'undo') { if (!await save(false)) return; }
    flash(op === 'undo' ? 'Отменяю…' : 'Повторяю…', 0);
    const r = await fetch(`/p/${P.cid}/${op}?key=${encodeURIComponent(KEY)}`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { flash(j.error || 'Ошибка'); return; }
    dirty = false;
    sessionStorage.setItem('pe_scroll', String(scrollY));
    reloadWithLoader();
  }
  $('#peUndo').addEventListener('click', () => histStep('undo'));
  $('#peRedo').addEventListener('click', () => histStep('redo'));
  addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const inText = document.activeElement && (document.activeElement.isContentEditable || /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName));
    if (e.key.toLowerCase() === 's') { e.preventDefault(); save(false); return; }
    if (e.key.toLowerCase() === 'z' && !inText) { e.preventDefault(); histStep(e.shiftKey ? 'redo' : 'undo'); }
  });

  /* ---------- именованные версии ---------- */
  $('#peVers').addEventListener('click', (e) => {
    const vs = P.versions || [];
    const list = vs.length
      ? vs.slice().reverse().map((v) => `<div class="pi" data-vap="${v.id}"><i>⎘</i><span style="flex:1">${v.name}<br><small style="opacity:.55;font-weight:500">${new Date(v.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></span><i data-vdel="${v.id}" title="Удалить версию" style="opacity:.45">✕</i></div>`).join('')
      : '<div class="psec" style="padding-bottom:8px">Сохранённых версий нет</div>';
    const el = openPop(`<div class="psec">Версии подборки</div>${list}
      <div class="psec">Сохранить текущую как</div>
      <input type="text" id="peVName" placeholder="например: вариант для Дубая">
      <div class="prow"><button class="edbtn" id="peVSave" style="flex:1">Сохранить версию</button></div>`, e.clientX, Math.min(e.clientY + 10, innerHeight - 200));
    $('#peVSave', el).addEventListener('click', async () => {
      const name = $('#peVName', el).value.trim();
      closePop();
      flash('Сохраняю версию…', 0);
      if (dirty) await save(false);
      const r = await fetch(`/p/${P.cid}/version?key=${encodeURIComponent(KEY)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'save', name }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { P.versions = j.versions; $('#peVers').textContent = 'Версии · ' + j.versions.length; flash('Версия сохранена ✓'); }
      else flash(j.error || 'Ошибка');
    });
    el.addEventListener('click', async (e2) => {
      const del = e2.target.closest('[data-vdel]');
      if (del) {
        e2.stopPropagation();
        const r = await fetch(`/p/${P.cid}/version?key=${encodeURIComponent(KEY)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'del', vid: del.dataset.vdel }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok) { P.versions = j.versions; closePop(); flash('Версия удалена'); }
        return;
      }
      const ap = e2.target.closest('[data-vap]');
      if (!ap) return;
      closePop();
      flash('Открываю версию…', 0);
      const r = await fetch(`/p/${P.cid}/version?key=${encodeURIComponent(KEY)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'apply', vid: ap.dataset.vap }) });
      if (r.ok) { sessionStorage.setItem('pe_scroll', String(scrollY)); reloadWithLoader(); }
      else flash('Ошибка применения');
    });
  });

  const composeBtn = $('#peCompose');
  if (composeBtn) composeBtn.addEventListener('click', async () => {
    composeBtn.disabled = true;
    flash('✦ ИИ собирает тексты под лида…', 0);
    await save(false);
    const r = await fetch(`/p/${P.cid}/compose?key=${encodeURIComponent(KEY)}`, { method: 'POST' });
    if (r.ok) reloadWithLoader();
    else { const j = await r.json().catch(() => ({})); flash(j.error || 'ИИ не справился'); composeBtn.disabled = false; }
  });

  /* ---------- тулбар блока ---------- */
  const TYPE = (t) => (P.types || {})[t] || { name: t, variants: [] };
  $$('section[data-bid]').forEach((sec) => {
    const t = TYPE(sec.dataset.bt);
    const tool = document.createElement('div');
    tool.className = 'btool';
    tool.innerHTML = `<button class="bgrip" title="Перетащить блок" style="cursor:grab">⠿</button><span class="bname">${t.name}</span>
      <button data-op="up" title="Выше">↑</button>
      <button data-op="down" title="Ниже">↓</button>
      ${t.variants.length > 1 ? '<button data-op="variant" title="Сменить вид">◧</button>' : ''}
      <button data-op="hide" title="Скрыть/показать">${sec.dataset.bhid === '1' ? '🙈' : '👁'}</button>
      <button data-op="add" title="Добавить блок ниже">+</button>
      <button data-op="del" title="Удалить блок">✕</button>`;
    sec.appendChild(tool);
    tool.addEventListener('click', async (e) => {
      const op = (e.target.closest('[data-op]') || {}).dataset && e.target.closest('[data-op]').dataset.op;
      if (!op) return;
      if (op === 'up' || op === 'down') {
        const list = $$('section[data-bid]');
        const i = list.indexOf(sec);
        const other = list[i + (op === 'up' ? -1 : 1)];
        if (!other) return;
        if (op === 'up') other.before(sec); else other.after(sec);
        renumber(); dirty = true;
      }
      if (op === 'hide') {
        sec.dataset.bhid = sec.dataset.bhid === '1' ? '' : '1';
        tool.querySelector('[data-op="hide"]').textContent = sec.dataset.bhid === '1' ? '🙈' : '👁';
        dirty = true;
      }
      if (op === 'variant') {
        const vs = t.variants;
        sec.dataset.bv = vs[(vs.indexOf(sec.dataset.bv) + 1) % vs.length];
        await save(true);                              /* вид рендерит сервер */
      }
      if (op === 'del') {
        if ($$('section[data-bid]').length <= 1) return;
        sec.remove(); renumber(); dirty = true; flash('Блок удалён — не забудьте сохранить');
      }
      if (op === 'add') openPalette(sec, e.clientX, e.clientY);
    });
    /* умный drag: тянешь за ⠿ — секция едет по странице, соседи расступаются */
    tool.querySelector('.bgrip').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const startY = e.clientY;
      let moving = false;
      const onMove = (e2) => {
        if (!moving && Math.abs(e2.clientY - startY) < 8) return;
        if (!moving) { moving = true; sec.classList.add('sec-drag'); document.body.style.userSelect = 'none'; }
        const under = document.elementFromPoint(innerWidth / 2, e2.clientY);
        const tgt = under && under.closest('section[data-bid]');
        if (tgt && tgt !== sec) {
          const r = tgt.getBoundingClientRect();
          if (e2.clientY < r.top + r.height / 2) tgt.before(sec); else tgt.after(sec);
        }
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.body.style.userSelect = '';
        if (moving) { sec.classList.remove('sec-drag'); renumber(); if (typeof buildRail === 'function') buildRail(); dirty = true; flash('Порядок изменён — не забудьте сохранить'); }
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  });

  function renumber() {
    $$('section[data-bt="proj"]').forEach((s, i) => { const k = $('.kicker', s); if (k) k.textContent = 'Проект №' + (i + 1); });
  }

  /* ---------- палитра блоков ---------- */
  const PALETTE = ['proj', 'hero', 'amenities', 'guarantee', 'textimg', 'text', 'image', 'gallery', 'video', 'quote', 'stats', 'bignum', 'benefits', 'checklist', 'compare', 'timeline', 'steps', 'pricecards', 'team', 'faq', 'sep', 'cta'];
  const PICONS = { text: '📄', textimg: '🗞', image: '🖼', gallery: '🎞', video: '🎬', quote: '❝', stats: '📊', bignum: '№', benefits: '💎', checklist: '✅', compare: '⚖️', timeline: '🗓', steps: '🧭', pricecards: '💳', team: '👥', faq: '❔', sep: '▬', cta: '📣', proj: '🏙', cover: '🏷', hello: '👋', why: '⭐', final: '✦', amenities: '🏊', hero: '🌅', guarantee: '🛡' };
  function openPalette(afterSec, x, y) {
    const items = PALETTE.filter((t) => P.types[t]).map((t) => `<div class="pi ptile" data-add="${t}"><i>${PICONS[t] || '▢'}</i><span>${TYPE(t).name}</span></div>`).join('');
    const el = openPop(`<div class="psec">Добавить блок</div><div class="pgrid">${items}</div>`, x, y);
    el.addEventListener('click', async (e) => {
      const pi = e.target.closest('[data-add]');
      if (!pi) return;
      const t = pi.dataset.add;
      if (t === 'proj') {
        const props = P.props || [];
        if (!props.length) { flash('В подборке нет объектов'); return; }
        el.innerHTML = `<div class="psec">Какой объект?</div>` + props.map((p2) => `<div class="pi" data-prj="${p2.id}"><i>🏙</i>${p2.name}</div>`).join('');
        el.addEventListener('click', async (e2) => {
          const pj = e2.target.closest('[data-prj]');
          if (pj) await addBlock(afterSec, 'proj', { pid: pj.dataset.prj });
        });
        return;
      }
      await addBlock(afterSec, t, null);
    });
  }
  async function addBlock(afterSec, t, data) {
    closePop();
    const blocks = serialize();
    const i = blocks.findIndex((b) => b.id === afterSec.dataset.bid);
    const nb = { id: 'b_' + Math.random().toString(36).slice(2, 10), t, v: TYPE(t).variants[0], hidden: false, data: data || {} };
    blocks.splice(i + 1, 0, nb);
    flash('Добавляю блок…', 0);
    const r = await fetch(`/p/${P.cid}/blocks?key=${encodeURIComponent(KEY)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blocks }),
    });
    if (r.ok) { sessionStorage.setItem('pe_scroll', String(scrollY)); reloadWithLoader(); }
    else flash('Ошибка добавления');
  }
  const sc = sessionStorage.getItem('pe_scroll');
  if (sc) { sessionStorage.removeItem('pe_scroll'); requestAnimationFrame(() => scrollTo(0, +sc)); }

  /* ---------- «+ пункт» в списках ---------- */
  const LIST_DEFAULTS = {
    bullets: 'Новый пункт: кликните и напишите текст',
    whyRent: 'Новый аргумент',
    imgs: '',
    items: (bt) => bt === 'stats' ? { k: 'показатель', v: '000' } : bt === 'faq' ? { q: 'Новый вопрос', a: 'Ответ на него' } : { title: 'Шаг', text: 'Описание шага' },
  };
  $$('[data-plist]').forEach((listEl) => {
    const [bid, field] = listEl.dataset.plist.split(':');
    const sec = listEl.closest('section[data-bid]');
    const btn = document.createElement('button');
    btn.className = 'plistadd';
    btn.textContent = field === 'imgs' ? '+ ячейка' : '+ пункт';
    listEl.after(btn);
    btn.addEventListener('click', async () => {
      const blocks = serialize();
      const b = blocks.find((x) => x.id === bid);
      if (!b) return;
      const def = LIST_DEFAULTS[field];
      const val = typeof def === 'function' ? def(sec.dataset.bt) : def;
      (b.data[field] = b.data[field] || []).push(val);
      flash('Добавляю пункт…', 0);
      const r = await fetch(`/p/${P.cid}/blocks?key=${encodeURIComponent(KEY)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blocks }),
      });
      if (r.ok) { sessionStorage.setItem('pe_scroll', String(scrollY)); reloadWithLoader(); }
    });
  });

  /* ---------- картинки ---------- */
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*,video/mp4,video/webm';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  let filePickCb = null;
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    fileInput.value = '';
    if (!f || !filePickCb) return;
    if (f.size > 25e6) { flash('Файл больше 25 МБ'); return; }
    flash('Загружаю файл…', 0);
    const r = await fetch(`/p/${P.cid}/asset?key=${encodeURIComponent(KEY)}&filename=${encodeURIComponent(f.name)}`, { method: 'POST', body: f });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.url) { filePickCb(j.url); flash('Загружено ✓'); }
    else flash(j.error || 'Ошибка загрузки');
    filePickCb = null;
  });

  function applyImg(hot, url) {
    hot.dataset.bival = url || '';
    const holder = hot.parentElement;
    if (url) { holder.style.backgroundImage = `url('${url}')`; const ph = holder.querySelector('.phold'); if (ph) ph.remove(); }
    else holder.style.backgroundImage = '';
    dirty = true;
  }
  document.body.addEventListener('click', (e) => {
    const hot = e.target.closest('[data-bimg]');
    if (!hot) return;
    e.preventDefault(); e.stopPropagation();
    const cur = hot.dataset.bival || '';
    const lib = (P.lib || []).map((u) => `<div class="plib" data-lib="${u}" style="background-image:url('${u}')"></div>`).join('');
    const el = openPop(`<div class="psec">Картинка</div>
      <div class="pi" data-img="file"><i>⤴</i>Загрузить файл</div>
      ${P.llm ? `<div class="psec">✦ Сгенерировать ИИ</div>
      <textarea id="peAiPrompt" rows="2" placeholder="Опишите картинку: напр. «светлая гостиная виллы на Бали с видом на джунгли, закат»"></textarea>
      <div class="prow"><button class="edbtn ai" id="peAiGo" style="flex:1">✦ Сгенерировать картинку</button></div>` : ''}
      ${lib ? `<div class="psec">Библиотека</div><div class="plibrow">${lib}</div>` : ''}
      <div class="psec">или ссылка</div>
      <input type="text" id="peImgUrl" placeholder="https://…" value="${cur.replace(/"/g, '&quot;')}">
      <div class="prow"><button class="edbtn" id="peImgOk" style="flex:1">Применить</button>${cur ? '<button class="edbtn g" id="peImgRm">Убрать</button>' : ''}</div>`, e.clientX, e.clientY);
    $$('.plib', el).forEach((th) => th.addEventListener('click', () => { applyImg(hot, th.dataset.lib); closePop(); }));
    $('.pi[data-img="file"]', el).addEventListener('click', () => { filePickCb = (u) => applyImg(hot, u); fileInput.click(); closePop(); });
    $('#peImgOk', el).addEventListener('click', () => { applyImg(hot, $('#peImgUrl', el).value.trim()); closePop(); });
    const aiGo = $('#peAiGo', el);
    if (aiGo) aiGo.addEventListener('click', async () => {
      const prompt = $('#peAiPrompt', el).value.trim();
      if (!prompt) { flash('Опишите картинку'); return; }
      const holder = hot; closePop();
      flash('✦ ИИ рисует картинку (10–20 сек)…', 0);
      try {
        const r = await fetch(`/p/${P.cid}/ai-image?key=${encodeURIComponent(KEY)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || r.status);
        applyImg(holder, j.url);
        if (P.lib && !P.lib.includes(j.url)) P.lib.unshift(j.url);
        flash('Готово — картинка вставлена и добавлена в библиотеку');
        await save(true);
      } catch (e2) { flash('Не вышло: ' + e2.message); }
    });
    const rm = $('#peImgRm', el);
    if (rm) rm.addEventListener('click', () => { applyImg(hot, ''); closePop(); });
  }, true);

  /* ---------- видео ---------- */
  document.body.addEventListener('click', (e) => {
    const hot = e.target.closest('[data-bvideo]');
    if (!hot) return;
    e.preventDefault(); e.stopPropagation();
    const sec = hot.closest('section[data-bid]');
    const cur = sec.dataset.vurl || '';
    const el = openPop(`<div class="psec">Видео</div>
      <div class="pi" data-v="file"><i>⤴</i>Загрузить MP4/WebM</div>
      <div class="psec">или ссылка YouTube / Vimeo / mp4</div>
      <input type="text" id="peVUrl" placeholder="https://youtube.com/watch?v=…" value="${cur.replace(/"/g, '&quot;')}">
      <div class="prow"><button class="edbtn" id="peVOk" style="flex:1">Применить</button>${cur ? '<button class="edbtn g" id="peVRm">Убрать</button>' : ''}</div>`, e.clientX, e.clientY);
    const applyV = async (url) => { sec.dataset.vurl = url; closePop(); await save(true); };
    $('.pi[data-v="file"]', el).addEventListener('click', () => { filePickCb = applyV; fileInput.click(); closePop(); });
    $('#peVOk', el).addEventListener('click', () => applyV($('#peVUrl', el).value.trim()));
    const rm = $('#peVRm', el);
    if (rm) rm.addEventListener('click', () => applyV(''));
  }, true);

  /* ---------- ИИ-переписывание текстов ---------- */
  if (P.llm) {
    const fab = document.createElement('button');
    fab.className = 'aifab';
    fab.textContent = '✦ ИИ';
    document.body.appendChild(fab);
    let target = null;
    let undo = null;
    const showFab = (el) => {
      target = el;
      const r = el.getBoundingClientRect();
      fab.style.display = 'block';
      fab.style.left = Math.min(r.right - 30, innerWidth - 90) + 'px';
      fab.style.top = Math.max(60, r.top - 36) + 'px';
    };
    document.body.addEventListener('focusin', (e) => { const el = e.target.closest('[data-be]'); if (el) showFab(el); });
    document.body.addEventListener('click', (e) => { const el = e.target.closest('[data-be]'); if (el) showFab(el); });
    document.body.addEventListener('focusout', () => { setTimeout(() => { if (!pop && document.activeElement !== fab) fab.style.display = 'none'; }, 250); });
    const MODES = [['improve', '✦ Улучшить'], ['shorter', '— Короче'], ['longer', '+ Подробнее'], ['selling', '₊ Продажнее'], ['formal', '§ Официальнее'], ['friendly', '☺ Дружелюбнее']];
    fab.addEventListener('click', (e) => {
      if (!target) return;
      const el = openPop(`<div class="psec">Переписать ИИ</div>` +
        MODES.map(([k, n]) => `<div class="pi" data-ai="${k}">${n}</div>`).join('') +
        (undo && undo.el === target ? '<div class="pi" data-ai="undo"><i>↩</i>Вернуть как было</div>' : ''), e.clientX, e.clientY - 10);
      el.addEventListener('click', async (e2) => {
        const pi = e2.target.closest('[data-ai]');
        if (!pi) return;
        const mode = pi.dataset.ai;
        const t2 = target;
        if (mode === 'undo') { t2.innerText = undo.text; undo = null; dirty = true; closePop(); return; }
        const orig = t2.innerText.trim();
        if (!orig) { flash('Пустой текст'); return; }
        closePop();
        flash('✦ ИИ переписывает…', 0);
        try {
          const r = await fetch(`/api/ai/text?key=${encodeURIComponent(KEY)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: orig, mode, ctx: document.title }),
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || r.status);
          undo = { el: t2, text: orig };
          t2.innerText = j.text;
          dirty = true;
          flash('Готово — ✦ ИИ может вернуть как было');
        } catch (err) { flash(String(err.message || err)); }
      });
    });
  }

  /* ---------- сохранение композиции с возвратом на место ---------- */
  async function postBlocks(blocks) {
    const r = await fetch(`/p/${P.cid}/blocks?key=${encodeURIComponent(KEY)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blocks }),
    });
    if (r.ok) { sessionStorage.setItem('pe_scroll', String(scrollY)); reloadWithLoader(); return true; }
    flash('Ошибка сохранения');
    return false;
  }

  /* ---------- контекстное меню: правый клик по блоку / пункту / кнопке ---------- */
  document.body.addEventListener('contextmenu', (e) => {
    const sec = e.target.closest('section[data-bid]');
    if (!sec) return;
    e.preventDefault();
    const beEl = e.target.closest('[data-be]');
    const parts = beEl ? beEl.dataset.be.split(':') : null;
    const LIST_FIELDS = ['bullets', 'whyRent', 'items'];
    const li = parts && parts.length >= 3 && LIST_FIELDS.includes(parts[1]) ? { field: parts[1], idx: +parts[2] } : null;
    const isCta = sec.dataset.bt === 'cta';
    const t = TYPE(sec.dataset.bt);
    let html = '';
    if (li) html += `<div class="psec">Пункт списка</div>
      <div class="pi" data-cm="li-above"><i>↟</i>Добавить выше</div>
      <div class="pi" data-cm="li-below"><i>↡</i>Добавить ниже</div>
      <div class="pi" data-cm="li-del" style="color:#C62828"><i>✕</i>Удалить пункт</div>`;
    if (isCta) html += `<div class="psec">Кнопка</div><div class="pi" data-cm="href"><i>🔗</i>Ссылка кнопки…</div>`;
    html += `<div class="psec">Блок · ${t.name}</div>
      <div class="pi" data-cm="up"><i>↑</i>Переместить выше</div>
      <div class="pi" data-cm="down"><i>↓</i>Переместить ниже</div>
      ${t.variants.length > 1 ? '<div class="pi" data-cm="variant"><i>◧</i>Сменить вид</div>' : ''}
      <div class="pi" data-cm="hide"><i>${sec.dataset.bhid === '1' ? '👁' : '🙈'}</i>${sec.dataset.bhid === '1' ? 'Показать блок' : 'Скрыть блок'}</div>
      <div class="pi" data-cm="dup"><i>⎘</i>Дублировать блок</div>
      <div class="pi" data-cm="add"><i>＋</i>Добавить блок ниже</div>
      <div class="pi" data-cm="del" style="color:#C62828"><i>✕</i>Удалить блок</div>`;
    const el = openPop(html, e.clientX, e.clientY);
    el.addEventListener('click', async (e2) => {
      const cm = e2.target.closest('[data-cm]');
      if (!cm) return;
      const op = cm.dataset.cm;
      /* --- пункты списков --- */
      if (op.startsWith('li-')) {
        closePop();
        const blocks = serialize();
        const b = blocks.find((x) => x.id === sec.dataset.bid);
        if (!b) return;
        const arr = b.data[li.field] = b.data[li.field] || [];
        if (op === 'li-del') arr.splice(li.idx, 1);
        else {
          const def = LIST_DEFAULTS[li.field];
          const val = typeof def === 'function' ? def(sec.dataset.bt) : def;
          arr.splice(op === 'li-above' ? li.idx : li.idx + 1, 0, val);
        }
        flash(op === 'li-del' ? 'Удаляю пункт…' : 'Добавляю пункт…', 0);
        await postBlocks(blocks);
        return;
      }
      /* --- ссылка CTA-кнопки --- */
      if (op === 'href') {
        const btn = sec.querySelector('.ctabtn');
        const cur = (btn && btn.dataset.chref) || '';
        const el2 = openPop(`<div class="psec">Ссылка кнопки</div>
          <input type="text" id="peHref" placeholder="https://… (пусто = WhatsApp менеджера)" value="${cur.replace(/"/g, '&quot;')}">
          <div class="prow"><button class="edbtn" id="peHrefOk" style="flex:1">Применить</button>${cur ? '<button class="edbtn g" id="peHrefRm">Сбросить</button>' : ''}</div>`, e.clientX, e.clientY);
        $('#peHrefOk', el2).addEventListener('click', () => {
          const v = $('#peHref', el2).value.trim();
          if (v && !/^(https?:\/\/|mailto:|tel:)/.test(v)) { flash('Ссылка должна начинаться с https:// (или mailto:, tel:)'); return; }
          if (btn) { btn.dataset.chref = v; if (v) btn.href = v; }
          dirty = true; closePop(); flash(v ? 'Ссылка кнопки заменена — сохраните' : 'Вернул WhatsApp менеджера — сохраните');
        });
        const rm = $('#peHrefRm', el2);
        if (rm) rm.addEventListener('click', () => { if (btn) btn.dataset.chref = ''; dirty = true; closePop(); flash('Вернул WhatsApp менеджера — сохраните'); });
        return;
      }
      /* --- операции блока (та же логика, что в тулбаре) --- */
      if (op === 'up' || op === 'down') {
        const list = $$('section[data-bid]');
        const i = list.indexOf(sec);
        const other = list[i + (op === 'up' ? -1 : 1)];
        if (other) { if (op === 'up') other.before(sec); else other.after(sec); renumber(); buildRail(); dirty = true; }
        closePop(); return;
      }
      if (op === 'hide') {
        sec.dataset.bhid = sec.dataset.bhid === '1' ? '' : '1';
        const tb = sec.querySelector('.btool [data-op="hide"]');
        if (tb) tb.textContent = sec.dataset.bhid === '1' ? '🙈' : '👁';
        dirty = true; closePop(); return;
      }
      if (op === 'variant') { sec.dataset.bv = t.variants[(t.variants.indexOf(sec.dataset.bv) + 1) % t.variants.length]; closePop(); await save(true); return; }
      if (op === 'dup') {
        closePop();
        const blocks = serialize();
        const i = blocks.findIndex((x) => x.id === sec.dataset.bid);
        if (i < 0) return;
        const clone = JSON.parse(JSON.stringify(blocks[i]));
        clone.id = 'b_' + Math.random().toString(36).slice(2, 10);
        blocks.splice(i + 1, 0, clone);
        flash('Дублирую блок…', 0);
        await postBlocks(blocks);
        return;
      }
      if (op === 'del') {
        if ($$('section[data-bid]').length <= 1) return;
        sec.remove(); renumber(); buildRail(); dirty = true; closePop(); flash('Блок удалён — не забудьте сохранить');
        return;
      }
      if (op === 'add') { closePop(); openPalette(sec, e.clientX, e.clientY); }
    });
  });

  /* ---------- мини-навигатор страниц: визуальный ряд + drag-порядок ---------- */
  const rail = document.createElement('div');
  rail.className = 'perail';
  document.body.appendChild(rail);
  function buildRail() {
    rail.innerHTML = '<div class="perail-hd">Страницы</div>' + $$('section[data-bid]').map((sec, i) => {
      const t = sec.dataset.bt;
      return `<div class="peth ${sec.dataset.bhid === '1' ? 'hid' : ''}" data-peth="${sec.dataset.bid}">
        <span class="peth-n">${i + 1}</span><span class="peth-i">${PICONS[t] || '▢'}</span>
        <span class="peth-t">${TYPE(t).name}</span>
        <span class="peth-grip">⠿</span>
      </div>`;
    }).join('');
    $$('.peth', rail).forEach((th) => {
      let ghost = null, downY = 0, moved = false;
      th.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('.peth-grip')) return;
        e.preventDefault();
        downY = e.clientY;
        const onMove = (e2) => {
          if (!ghost && Math.abs(e2.clientY - downY) < 5) return;
          if (!ghost) { ghost = true; th.classList.add('drag'); }
          moved = true;
          const over = document.elementFromPoint(e2.clientX, e2.clientY);
          const tgt = over && over.closest('.peth');
          if (tgt && tgt !== th) {
            const list = $$('.peth', rail);
            if (list.indexOf(tgt) < list.indexOf(th)) tgt.before(th); else tgt.after(th);
          }
        };
        const onUp = () => {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          th.classList.remove('drag');
          if (moved) {
            /* применяем порядок рельсы к реальным секциям */
            const order = $$('.peth', rail).map((x) => x.dataset.peth);
            const secs = {};
            $$('section[data-bid]').forEach((s2) => { secs[s2.dataset.bid] = s2; });
            const anchor = document.querySelector('.book .foot') || null;
            order.forEach((bid) => { const s2 = secs[bid]; if (s2) (anchor ? anchor.before(s2) : document.querySelector('.book').appendChild(s2)); });
            renumber(); buildRail(); dirty = true; flash('Порядок изменён — не забудьте сохранить');
          }
          moved = false; ghost = null;
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
      th.addEventListener('click', (e) => {
        if (e.target.closest('.peth-grip')) return;
        const sec = document.querySelector(`section[data-bid="${th.dataset.peth}"]`);
        if (sec) { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); sec.classList.add('peflash'); setTimeout(() => sec.classList.remove('peflash'), 1200); }
      });
    });
  }
  buildRail();
  const railCss = document.createElement('style');
  railCss.textContent = `
.perail{position:fixed;right:14px;top:70px;bottom:20px;width:158px;z-index:890;background:rgba(11,11,15,.92);backdrop-filter:blur(8px);border-radius:14px;padding:10px 8px;overflow-y:auto;font-family:Inter,sans-serif;scrollbar-width:thin}
.perail-hd{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:#8a90a0;padding:2px 8px 8px;font-weight:700}
.peth{display:flex;gap:7px;align-items:center;padding:8px 8px;border-radius:9px;cursor:pointer;color:#D5DBEA;font-size:11px;font-weight:650;transition:background .15s}
.peth:hover{background:rgba(29,52,216,.35)}
.peth.hid{opacity:.4}
.peth.drag{background:#1D34D8}
.peth-n{color:#5E6470;font-size:9.5px;width:14px;flex:0 0 14px}
.peth-i{width:16px;flex:0 0 16px;text-align:center}
.peth-t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.peth-grip{color:#5E6470;cursor:grab;touch-action:none}
.peth-grip:active{cursor:grabbing}
section.peflash{outline:3px solid rgba(29,52,216,.55);outline-offset:-3px}
@media(max-width:1080px){.perail{display:none}}
body{padding-right:190px}
.book{margin:0 auto}
@media(max-width:1080px){body{padding-right:0}}`;
  document.head.appendChild(railCss);

  renumber();
})();
