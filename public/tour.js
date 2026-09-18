/* Lumen · Интерактивный тур по CRM — стиль «Ателье» (крем + serif Cormorant + золото).
   Ведёт по разделам И проводит экскурсию внутри карточки лида (открывает её и показывает, где что).
   Запуск после онбординга (один раз) или window.startLumenTour(true) / ссылка #tour для повтора. */
(function () {
  const DONE_KEY = 'lumen_tour_done';
  /* act: 'nav' переход по разделу | 'open' открыть карточку лида | 'close' закрыть карточку.
     card:true — шаг относится к экскурсии по карточке (пропускается, если открыть карточку не удалось). */
  const STEPS = [
    { act: 'nav', page: 'overview',   t: 'Обзор',              d: 'Пульс агентства: свежие лиды, конверсия и что требует внимания прямо сейчас. С этого экрана начинается день брокера.' },
    { act: 'nav', page: 'funnel',     t: 'Воронка',            d: 'Все лиды по стадиям — канбан или таблица. ИИ сам двигает карточки по мере квалификации. Кликните лида — откроется его карточка.' },
    { act: 'open', sel: '.lc-funnel', t: 'Карточка лида · стадии', d: 'Открыли карточку. Вверху — мини-воронка: текущая стадия лида. Меняется в один клик, ИИ двигает сам.', card: true },
    { act: 'hi', sel: '.lc-left',      t: 'Хронология',         d: 'Слева — вся история одной лентой: переписка по всем каналам, звонки, события и ваши комментарии.', card: true },
    { act: 'hi', sel: '.lc-ft-compose,#lcFtText', t: 'Ответ клиенту', d: 'Отсюда пишете клиенту — по нужному каналу. ✦ причешет текст, подставит переменные ({имя}, {объект}).', card: true },
    { act: 'hi', sel: '.lc-right',     t: 'ИИ-помощник и детали', d: 'Справа: ИИ-помощник (вкл/выкл автопилота), сводка по лиду, доп-контакты, встречи и «следующий шаг».', card: true },
    { act: 'hi', sel: '#lcSumBtn',     t: 'Сводка ИИ',          d: 'Одна кнопка — ИИ соберёт краткое резюме по лиду из всей переписки и звонков. Удобно перед звонком.', card: true },
    { act: 'close', page: 'inbox',     t: 'Диалоги',            d: 'Живые переписки по всем каналам в одном окне. ИИ отвечает за секунды — вы подключаетесь в нужный момент.' },
    { act: 'nav', page: 'properties',  t: 'Объекты и подборки', d: 'База объектов → брендированная подборка под клиента в один клик, с публичной страницей и трекингом просмотров.' },
    { act: 'nav', page: 'numbers',     t: 'Подключения и номера', d: 'WhatsApp, Telegram, Viber, телефония — по шагам, с подробными гайдами прямо во вкладках каждого канала.' },
    { act: 'nav', page: 'billing',     t: 'Подписка и баланс',  d: 'Тариф, места, счёт-фактуры и предоплаченный баланс расходников (крипта). Всё прозрачно.' },
    { act: 'hi', sel: '#notifBell',    t: 'Уведомления',        d: 'Колокол + письмо + Telegram: заранее предупредим о низком балансе и подтвердим каждый платёж.' },
  ];
  let idx = 0, root = null, cardOk = true;

  const css = `
  #lumenTour{position:fixed;inset:0;z-index:100000;font-family:'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  #lumenTour .lt-spot{position:fixed;border-radius:12px;box-shadow:0 0 0 9999px rgba(24,21,17,.66);border:1.5px solid #A98748;transition:left .35s cubic-bezier(.19,1,.22,1),top .35s cubic-bezier(.19,1,.22,1),width .35s cubic-bezier(.19,1,.22,1),height .35s cubic-bezier(.19,1,.22,1),opacity .3s;pointer-events:none;box-sizing:border-box}
  #lumenTour .lt-spot::after{content:'';position:absolute;inset:-1.5px;border-radius:12px;box-shadow:0 0 26px 2px rgba(201,168,106,.5);pointer-events:none}
  #lumenTour .lt-tip{position:fixed;width:308px;max-width:calc(100vw - 24px);background:#FBF9F4;border:1px solid rgba(26,24,21,.10);border-radius:15px;padding:18px 18px 16px;box-shadow:0 26px 64px -22px rgba(26,24,21,.55);pointer-events:auto;transition:left .35s cubic-bezier(.19,1,.22,1),top .35s cubic-bezier(.19,1,.22,1)}
  #lumenTour .lt-n{font-size:11px;font-weight:600;letter-spacing:.22em;color:#A98748;text-transform:uppercase;margin-bottom:8px}
  #lumenTour .lt-t{font-family:'Cormorant',Georgia,serif;font-size:25px;font-weight:600;letter-spacing:-.01em;color:#1A1815;margin-bottom:7px;line-height:1.05}
  #lumenTour .lt-d{font-size:13px;line-height:1.6;color:#6C665C;margin-bottom:16px}
  #lumenTour .lt-foot{display:flex;align-items:center;justify-content:space-between;gap:10px}
  #lumenTour .lt-skip{background:none;border:0;color:#9C958A;font-size:12.5px;cursor:pointer;padding:6px;letter-spacing:.02em}
  #lumenTour .lt-skip:hover{color:#6C665C}
  #lumenTour .lt-next{background:#1A1815;border:0;color:#F4F1EA;font-family:'Cormorant',Georgia,serif;font-size:17px;font-weight:600;letter-spacing:.01em;border-radius:10px;padding:9px 20px;cursor:pointer}
  #lumenTour .lt-next:hover{background:#000}`;

  function targetEl(s) { if (!s.sel) return document.querySelector('.nav-item[data-page="' + s.page + '"]'); for (const sel of s.sel.split(',')) { const el = document.querySelector(sel.trim()); if (el) return el; } return null; }

  function build() {
    const st = document.createElement('style'); st.id = 'lumenTourCss'; st.textContent = css; document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'lumenTour';
    root.innerHTML = '<div class="lt-spot"></div><div class="lt-tip"><div class="lt-n"></div><div class="lt-t"></div><div class="lt-d"></div><div class="lt-foot"><button type="button" class="lt-skip">Пропустить тур</button><button type="button" class="lt-next">Далее →</button></div></div>';
    document.body.appendChild(root);
    root.querySelector('.lt-skip').onclick = end;
    root.querySelector('.lt-next').onclick = advance;
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
  }

  function advance() {
    idx++;
    while (idx < STEPS.length && STEPS[idx].card && !cardOk) idx++;   /* пропустить экскурсию по карточке, если её не удалось открыть */
    if (idx >= STEPS.length) return end();
    show();
  }

  function openDemoCard() {
    try {
      if (typeof go === 'function') go('funnel');
      const LK = (typeof LEAD_LOOKUP !== 'undefined' && LEAD_LOOKUP) ? LEAD_LOOKUP : null;
      const ids = LK ? Object.keys(LK) : [];
      if (ids.length && typeof openLeadModal === 'function') {
        const lead = ids.map(k => LK[k]).find(l => l && ['handover', 'dialog', 'qualified', 'viewing', 'deal'].includes(l.stage)) || LK[ids[0]];
        if (lead) { openLeadModal(lead.id || lead); return true; }
      }
      /* фоллбэк: кликнуть карточку из DOM воронки */
      const card = document.querySelector('.lead-card[data-id]');
      if (card && typeof openLeadModal === 'function') { openLeadModal(card.dataset.id); return true; }
    } catch (e) {}
    return false;
  }

  function show() {
    const s = STEPS[idx];
    let delay = 380;
    if (s.act === 'nav' && s.page && typeof go === 'function') { try { go(s.page); } catch (e) {} }
    else if (s.act === 'open') { cardOk = openDemoCard(); delay = 700; if (!cardOk) { return advance(); } }
    else if (s.act === 'close') { try { if (typeof closeModal === 'function') closeModal(); } catch (e) {} if (s.page && typeof go === 'function') { try { go(s.page); } catch (e) {} } }
    root.querySelector('.lt-n').textContent = (idx + 1) + ' / ' + STEPS.length;
    root.querySelector('.lt-t').textContent = s.t;
    root.querySelector('.lt-d').textContent = s.d;
    root.querySelector('.lt-next').textContent = idx === STEPS.length - 1 ? 'Готово ✓' : 'Далее →';
    /* несколько повторов: раздел/карточка рендерятся асинхронно — спотлайт догоняет цель */
    place(); [delay, delay + 500, delay + 1100].forEach((t) => setTimeout(place, t));
  }

  function place() {
    if (!root) return;
    const s = STEPS[idx]; const el = targetEl(s);
    const spot = root.querySelector('.lt-spot'), tip = root.querySelector('.lt-tip');
    if (!el) { spot.style.opacity = '0'; tip.style.left = 'calc(50vw - 154px)'; tip.style.top = 'calc(50vh - 90px)'; return; }
    const r = el.getBoundingClientRect(), pad = 8;
    spot.style.opacity = '1';
    spot.style.left = (r.left - pad) + 'px'; spot.style.top = (r.top - pad) + 'px';
    spot.style.width = (r.width + pad * 2) + 'px'; spot.style.height = (r.height + pad * 2) + 'px';
    const tw = 308, th = tip.offsetHeight || 180;
    let left = r.right + 16, top = r.top;
    if (left + tw > window.innerWidth - 12) { left = r.left - tw - 16; }        /* нет места справа → слева */
    if (left < 12) { left = Math.max(12, Math.min(r.left, window.innerWidth - tw - 12)); top = r.bottom + 14; }  /* иначе снизу */
    if (top + th > window.innerHeight - 12) top = Math.max(12, window.innerHeight - th - 12);
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  }

  function end() {
    try { localStorage.setItem(DONE_KEY, '1'); } catch (e) {}
    try { if (typeof closeModal === 'function') closeModal(); } catch (e) {}   /* если тур прервали на карточке — закрыть её */
    window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true);
    if (root) { root.remove(); root = null; }
    const st = document.getElementById('lumenTourCss'); if (st) st.remove();
  }

  function start(force) {
    if (!force) { try { if (localStorage.getItem(DONE_KEY) === '1') return; } catch (e) {} }
    if (typeof STATE === 'undefined' || !STATE || !STATE.settings) return;   /* только после входа */
    idx = 0; cardOk = true; if (!root) build(); show();
  }
  window.startLumenTour = (force) => start(force);
  function hashCheck() { if (location.hash === '#tour') { history.replaceState(null, '', location.pathname); setTimeout(() => start(true), 200); } }
  addEventListener('hashchange', hashCheck);
  if (document.readyState !== 'loading') hashCheck(); else addEventListener('DOMContentLoaded', hashCheck);
})();
