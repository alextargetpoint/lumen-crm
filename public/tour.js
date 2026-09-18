/* Lumen · Интерактивный тур по CRM — подсветка разделов + стилизованные подсказки.
   Запускается после онбординга (один раз) и по window.startLumenTour(true) для повтора. */
(function () {
  const DONE_KEY = 'lumen_tour_done';
  const STEPS = [
    { page: 'overview',   t: 'Обзор',                 d: 'Пульс агентства: свежие лиды, конверсия и что требует внимания прямо сейчас.' },
    { page: 'funnel',     t: 'Воронка',               d: 'Все лиды по стадиям — канбан или таблица. ИИ сам двигает карточки по мере квалификации.' },
    { page: 'inbox',      t: 'Диалоги',               d: 'Живые переписки по всем каналам. ИИ отвечает за секунды — вы подключаетесь в нужный момент.' },
    { page: 'properties', t: 'Объекты и подборки',    d: 'База объектов → брендированная подборка под клиента в один клик, с публичной страницей и трекингом.' },
    { page: 'numbers',    t: 'Подключения и номера',  d: 'WhatsApp, Telegram, Viber, телефония — по шагам, с подробными гайдами прямо во вкладках.' },
    { page: 'billing',    t: 'Подписка и баланс',     d: 'Тариф, места, счёт-фактуры и предоплаченный баланс расходников (крипта). Всё прозрачно.' },
    { sel: '#notifBell',  t: 'Уведомления',           d: 'Колокол + письмо + Telegram: заранее предупредим о низком балансе и подтвердим каждый платёж.' },
  ];
  let idx = 0, root = null;

  const css = `
  #lumenTour{position:fixed;inset:0;z-index:100000;font-family:'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  #lumenTour .lt-spot{position:fixed;border-radius:12px;box-shadow:0 0 0 9999px rgba(6,10,18,.80);border:2px solid #4C7DFF;transition:left .35s cubic-bezier(.19,1,.22,1),top .35s cubic-bezier(.19,1,.22,1),width .35s cubic-bezier(.19,1,.22,1),height .35s cubic-bezier(.19,1,.22,1),opacity .3s;pointer-events:none;box-sizing:border-box}
  #lumenTour .lt-spot::after{content:'';position:absolute;inset:-2px;border-radius:12px;box-shadow:0 0 26px 3px rgba(76,125,255,.55);pointer-events:none}
  #lumenTour .lt-tip{position:fixed;width:300px;max-width:calc(100vw - 24px);background:linear-gradient(180deg,#0e1526,#111a30);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:16px;box-shadow:0 24px 60px -20px rgba(0,0,0,.6);pointer-events:auto;transition:left .35s cubic-bezier(.19,1,.22,1),top .35s cubic-bezier(.19,1,.22,1)}
  #lumenTour .lt-n{font-size:11px;font-weight:700;letter-spacing:.06em;color:#7f8bb0;text-transform:uppercase;margin-bottom:6px}
  #lumenTour .lt-t{font-size:16px;font-weight:800;color:#f4f3f1;margin-bottom:6px}
  #lumenTour .lt-d{font-size:13px;line-height:1.55;color:#aeb6ca;margin-bottom:14px}
  #lumenTour .lt-foot{display:flex;align-items:center;justify-content:space-between;gap:10px}
  #lumenTour .lt-skip{background:none;border:0;color:#7f8bb0;font-size:12.5px;cursor:pointer;padding:6px}
  #lumenTour .lt-skip:hover{color:#aeb6ca}
  #lumenTour .lt-next{background:linear-gradient(180deg,#4C7DFF,#2563EB);border:0;color:#fff;font-size:13.5px;font-weight:700;border-radius:10px;padding:10px 16px;cursor:pointer}
  #lumenTour .lt-next:hover{filter:brightness(1.06)}`;

  function targetEl(s) { return document.querySelector(s.sel || ('.nav-item[data-page="' + s.page + '"]')); }

  function build() {
    const st = document.createElement('style'); st.id = 'lumenTourCss'; st.textContent = css; document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'lumenTour';
    root.innerHTML = '<div class="lt-spot"></div><div class="lt-tip"><div class="lt-n"></div><div class="lt-t"></div><div class="lt-d"></div><div class="lt-foot"><button type="button" class="lt-skip">Пропустить тур</button><button type="button" class="lt-next">Далее →</button></div></div>';
    document.body.appendChild(root);
    root.querySelector('.lt-skip').onclick = end;
    root.querySelector('.lt-next').onclick = () => { idx++; if (idx >= STEPS.length) return end(); show(); };
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
  }

  function show() {
    const s = STEPS[idx];
    if (s.page && typeof go === 'function') { try { go(s.page); } catch (e) {} }
    root.querySelector('.lt-n').textContent = (idx + 1) + ' / ' + STEPS.length;
    root.querySelector('.lt-t').textContent = s.t;
    root.querySelector('.lt-d').textContent = s.d;
    root.querySelector('.lt-next').textContent = idx === STEPS.length - 1 ? 'Готово ✓' : 'Далее →';
    place(); setTimeout(place, 380);   /* повтор после смены раздела (лениво рендерится) */
  }

  function place() {
    if (!root) return;
    const s = STEPS[idx]; const el = targetEl(s);
    const spot = root.querySelector('.lt-spot'), tip = root.querySelector('.lt-tip');
    if (!el) { spot.style.opacity = '0'; tip.style.left = 'calc(50vw - 150px)'; tip.style.top = 'calc(50vh - 80px)'; return; }
    const r = el.getBoundingClientRect(), pad = 8;
    spot.style.opacity = '1';
    spot.style.left = (r.left - pad) + 'px'; spot.style.top = (r.top - pad) + 'px';
    spot.style.width = (r.width + pad * 2) + 'px'; spot.style.height = (r.height + pad * 2) + 'px';
    const tw = 300, th = tip.offsetHeight || 170;
    let left = r.right + 16, top = r.top;
    if (left + tw > window.innerWidth - 12) { left = Math.max(12, Math.min(r.left, window.innerWidth - tw - 12)); top = r.bottom + 14; }
    if (top + th > window.innerHeight - 12) top = Math.max(12, window.innerHeight - th - 12);
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  }

  function end() {
    try { localStorage.setItem(DONE_KEY, '1'); } catch (e) {}
    window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true);
    if (root) { root.remove(); root = null; }
    const st = document.getElementById('lumenTourCss'); if (st) st.remove();
  }

  function start(force) {
    if (!force) { try { if (localStorage.getItem(DONE_KEY) === '1') return; } catch (e) {} }
    if (typeof STATE === 'undefined' || !STATE || !STATE.settings) return;   /* только после входа */
    idx = 0; if (!root) build(); show();
  }
  window.startLumenTour = (force) => start(force);
  /* повтор тура по ссылке #tour (для показа клиенту / повторного знакомства) */
  function hashCheck() { if (location.hash === '#tour') { history.replaceState(null, '', location.pathname); setTimeout(() => start(true), 200); } }
  addEventListener('hashchange', hashCheck);
  if (document.readyState !== 'loading') hashCheck(); else addEventListener('DOMContentLoaded', hashCheck);
})();

