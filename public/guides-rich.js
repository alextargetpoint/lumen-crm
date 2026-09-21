/* ============================================================================
   Lumen · rich иллюстрированные гайды (телефон-мокапы + реальные скриншоты).
   Изоморфно: window.LUMEN_RICH (браузер) / module.exports (Node → публичный /help).
   Извлечено из app.js (единый источник); app.js теперь тонкие обёртки.
   ============================================================================ */
(function () {
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

function waQrGuideRich() {
  /* мокап экрана телефона: список строк меню (hl — подсвеченная) */
  const phone = (title, rows, foot) => `<div class="wag-phone">
    <div class="wag-ph-bar"><span>9:41</span><span class="wag-ph-sig">▪▪▪ ▪ ▮</span></div>
    <div class="wag-ph-hd"><span class="wag-ph-back">‹</span>${title}</div>
    <div class="wag-ph-body">${rows.map(r => `<div class="wag-mrow ${r.hl ? 'hl' : ''}">
      <span class="wag-mic">${r.ic || ''}</span>
      <span class="wag-mtx"><b>${r.t}</b>${r.d ? `<i>${r.d}</i>` : ''}</span>
      ${r.hl ? '<span class="wag-mgo">→</span>' : ''}
    </div>`).join('')}</div>
    ${foot ? `<div class="wag-ph-foot">${foot}</div>` : ''}
  </div>`;
  /* мокап окна эмулятора / менеджера инстансов */
  const win = (title, bodyHtml) => `<div class="wag-win">
    <div class="wag-win-bar"><span class="wag-win-dots"><i></i><i></i><i></i></span>${title}</div>
    <div class="wag-win-body">${bodyHtml}</div>
  </div>`;
  const call = (kind, title, html) => `<div class="wag-call ${kind}"><div class="wag-call-t">${title}</div><div class="wag-call-b">${html}</div></div>`;
  const secH = (n, t, sub) => `<div class="wag-h"><span class="wag-hn">${n}</span><div><div class="wag-ht">${t}</div>${sub ? `<div class="wag-hs">${sub}</div>` : ''}</div></div>`;

  /* ── три экрана пути «свой номер по QR» ── */
  const pathQR = `<div class="wag-shots">
    ${phone('Настройки', [
      { ic: '👤', t: 'Аккаунт', d: 'приватность, безопасность' },
      { ic: '🔗', t: 'Связанные устройства', d: 'WhatsApp Web / компьютер', hl: true },
      { ic: '💬', t: 'Чаты', d: 'тема, обои, история' },
      { ic: '🔔', t: 'Уведомления' },
    ])}
    ${phone('Связанные устройства', [
      { ic: '➕', t: 'Привязка устройства', d: 'откроется сканер QR', hl: true },
      { ic: '💻', t: 'Устройств пока нет', d: 'здесь появятся сессии' },
    ], 'Сессия живёт ~14 дней без телефона — заходите с телефона хотя бы раз в 2 недели.')}
    ${phone('Сканер', [
      { ic: '🎯', t: 'Наведите камеру на QR', d: 'QR-код показан в Lumen', hl: true },
    ], 'Готово — номер «на связи», переписка идёт через Lumen.')}
  </div>
  <div class="wag-cap">Путь в приложении: <b>WhatsApp → ⋮ / Настройки → Связанные устройства → Привязка устройства</b> → навести на QR из Lumen.</div>`;

  /* ── таблица эмуляторов ── */
  const emus = [
    ['BlueStacks 5', 'Windows / macOS', 'Самый популярный, лёгкий старт. Multi-Instance Manager из коробки, поддержка виртуальной камеры (подать QR картинкой).', 'Multi-Instance Manager (Ctrl+Shift+8)'],
    ['LDPlayer 9', 'Windows', 'Быстрый, «Мультиплеер» + синхронизатор действий на все окна. Хорош, когда номеров много.', 'LD Multi-Player → «Новый» / «Клонировать»'],
    ['NoxPlayer', 'Windows / macOS', 'Стабильный, есть Multi-Drive для клонов. Встроенная эмуляция GPS/гео.', 'Multi-Drive → Add / Clone'],
    ['MEmu Play', 'Windows', 'Лёгкий по ресурсам, простой Multiple Instance Manager.', 'Multiple Instance Manager → New / Clone'],
    ['Genymotion', 'Windows / macOS / Linux', 'Профессиональный (для разработчиков), тонкая настройка версии Android, IMEI, гео. Платный для бизнеса.', 'Каждый «virtual device» = отдельный инстанс'],
  ];
  const emuTable = `<div class="wag-emutbl">
    <div class="wag-etr wag-eth"><span>Эмулятор</span><span>ОС</span><span>Чем хорош</span><span>Клонирование</span></div>
    ${emus.map(e => `<div class="wag-etr"><span data-l="Эмулятор"><b>${e[0]}</b></span><span data-l="ОС">${e[1]}</span><span data-l="Чем хорош">${e[2]}</span><span data-l="Клонирование">${e[3]}</span></div>`).join('')}
  </div>`;

  /* ── мокап менеджера инстансов ── */
  const cloneWin = win('BlueStacks · Multi-Instance Manager', `
    <div class="wag-inst"><span class="wag-idot on"></span><b>Broker 1</b><i>WhatsApp · +34 6•• •• •• 01</i><span class="wag-ibadge">запущен</span></div>
    <div class="wag-inst"><span class="wag-idot on"></span><b>Broker 2</b><i>WhatsApp · +34 6•• •• •• 02</i><span class="wag-ibadge">запущен</span></div>
    <div class="wag-inst"><span class="wag-idot"></span><b>Broker 3</b><i>WhatsApp · +971 5•• •• •• 03</i><span class="wag-ibadge off">остановлен</span></div>
    <div class="wag-inst wag-iaction"><span class="wag-iplus">＋</span>Новый инстанс&nbsp;&nbsp;·&nbsp;&nbsp;⧉ Клонировать выбранный</div>`);

  const faq = [
    ['QR не сканируется в эмуляторе — где взять камеру?', 'Сохраните QR из Lumen как картинку (правый клик → «Сохранить изображение»). В эмуляторе при сканировании выберите «виртуальная камера» и подгрузите файл: BlueStacks — Настройки → Камера → выбрать изображение; LDPlayer/Nox — включить виртуальную камеру и указать картинку. Либо откройте QR на втором экране/телефоне и наведите реальную веб-камеру.'],
    ['Пишет «Устройство отключилось»', 'Linked-сессия живёт ~14 дней без основного WhatsApp. Телефон или эмулятор, где номер зарегистрирован как основной, должен периодически (раз в 1–2 недели) выходить онлайн. Держите инстанс запущенным или заходите вручную.'],
    ['Код (OTP) не пришёл в ленту', 'Проверьте вкладку «Активация / коды» на карточке номера. Если пусто 2–3 минуты — запросите код повторно в WhatsApp, попробуйте «Позвонить» вместо SMS. Виртуальные номера некоторых стран капризны — при повторных неудачах смените страну номера.'],
    ['Номер сразу забанили / «нет на связи»', 'Свежий номер нельзя грузить объёмом. Сначала прогрев 2–3 недели (тумблер выше, ≥2 номера), затем ≤5 новых лидов/день. Массовые первые касания — только Cloud API. Забаненный номер уходит в карантин, трафик — на резерв.'],
    ['Один эмулятор — два WhatsApp?', 'В одном инстансе можно держать обычный WhatsApp + WhatsApp Business (два номера). Больше — только через отдельные инстансы (клоны). Для чистоты и антибана: 1 инстанс = 1 рабочий номер.'],
    ['Нужен ли отдельный IP/прокси на номер?', 'Желательно для новых виртуальных: 10 номеров с одного домашнего IP = маркер фермы. Ставьте на инстанс резидентный прокси страны номера, согласованный часовой пояс и язык интерфейса. Свой личный номер по QR в прокси не нуждается.'],
  ];

  const body = `<div class="wag">
    <div class="wag-lead">Два способа подключить WhatsApp к Lumen. Выберите по ситуации — оба ведут к одному: переписка с лидами идёт из CRM, а сообщения физически уходят с реального WhatsApp-аккаунта.</div>

    <div class="wag-paths">
      <div class="wag-path">
        <div class="wag-ptag">Путь A · быстрый</div>
        <div class="wag-pt">Свой номер по QR</div>
        <div class="wag-pd">Как WhatsApp Web. Ничего не покупаете, телефон уже с вами. 2 минуты.</div>
        <div class="wag-pmeta">Бесплатно · нужен телефон с этим WhatsApp</div>
      </div>
      <div class="wag-path">
        <div class="wag-ptag alt">Путь B · на телефоне</div>
        <div class="wag-pt">Несколько номеров на одном Android</div>
        <div class="wag-pd">До 4 рабочих номеров на одном телефоне без сторонних приложений, дальше — через клонирование WhatsApp.</div>
        <div class="wag-pmeta">Нужен Android-телефон · номера свои или виртуальные</div>
      </div>
      <div class="wag-path">
        <div class="wag-ptag alt">Путь C · на ПК</div>
        <div class="wag-pt">Виртуальный номер + эмулятор</div>
        <div class="wag-pd">Рабочие номера в Android-эмуляторе на компьютере — личный телефон свободен, десятки инстансов.</div>
        <div class="wag-pmeta">≈ $9/мес аренда номера · нужен эмулятор на ПК</div>
      </div>
    </div>

    <div class="wag-sec">
      ${secH('A', 'Свой номер по QR — как WhatsApp Web', 'Самый быстрый путь. Подходит, если рабочая переписка идёт с вашего личного номера.')}
      <ol class="wag-ol">
        <li>В CRM нажмите <b>«Подключить свой (QR)»</b> — откроется QR-код.</li>
        <li>На телефоне: <b>WhatsApp → ⋮ (Меню) / Настройки → Связанные устройства → Привязка устройства</b>.</li>
        <li>Наведите камеру телефона на QR-код в Lumen. Через пару секунд номер станет <b>«на связи»</b>.</li>
      </ol>
      ${pathQR}
      ${call('tip', 'Совет', 'Один WhatsApp-аккаунт живёт на одном устройстве. Нужно несколько рабочих номеров на одном телефоне — путь B. Не хотите занимать телефон вовсе — путь C (эмулятор на ПК).')}
    </div>

    <div class="wag-sec">
      ${secH('B', 'Сколько номеров помещается на один Android', 'Развилка по количеству. До 4 номеров — штатными приложениями, после 4-го — через клонирование WhatsApp.')}
      <p class="wag-p">В каждом официальном приложении WhatsApp можно держать <b>два аккаунта</b>. Приложений два — обычный WhatsApp и WhatsApp Business — значит <b>до 4 номеров на одном телефоне без сторонних приложений</b>. Пятый и дальше — только через клонирование.</p>
      <div class="wag-ladder">
        <div class="wag-lstep"><div class="wag-lnum">1–2</div><div class="wag-lbody"><b>Один WhatsApp</b><span>Обычный WhatsApp: <b>Настройки → нажать на своё имя вверху / стрелку → «Добавить аккаунт»</b>. Два номера в одном приложении.</span></div></div>
        <div class="wag-lstep"><div class="wag-lnum">3–4</div><div class="wag-lbody"><b>+ WhatsApp Business</b><span>Поставьте ещё и WhatsApp Business — в нём тоже <b>2 аккаунта</b>. Итого 2 + 2 = <b>4 номера</b> на одном телефоне, всё официально, без риска.</span></div></div>
        <div class="wag-lstep alt"><div class="wag-lnum">5+</div><div class="wag-lbody"><b>Клонирование WhatsApp</b><span>Для 5-го и дальше нужен клон приложения — отдельная копия WhatsApp со своим номером.</span></div></div>
      </div>
      ${call('info', 'Чем клонировать WhatsApp (5-й номер и дальше)', '<b>Встроенное клонирование телефона</b> (бесплатно, надёжнее всего): Samsung — Настройки → «Дополнительные функции → <b>Dual Messenger</b>»; Xiaomi/Redmi — «Приложения → <b>Клонирование приложений</b>»; OnePlus/Oppo/Realme — «<b>Parallel Apps / Клонирование приложений</b>»; Huawei — «<b>Приложение-двойник</b>». Если встроенного нет — сторонние: <b>Island</b>, <b>App Cloner</b>, <b>Parallel Space</b>, <b>Dual Space</b>. ⚠️ Каждый клон = ещё один WhatsApp: держите <b>1 клон = 1 номер</b> и не набивайте телефон десятками — для объёма надёжнее эмулятор на ПК (путь C).')}
      ${call('warn', 'Ограничение', 'Клоны и мультиаккаунт съедают память и батарею телефона; при 6–8 номерах телефон начинает тормозить и WhatsApp-и вылетают. Нужно много номеров под команду брокеров — переходите на эмулятор с инстансами (путь C).')}
    </div>

    <div class="wag-sec">
      ${secH('C', 'Виртуальный номер + Android-эмулятор (на ПК)', 'Рабочие номера под брокеров без личного телефона. WhatsApp регистрируем в эмуляторе Android на компьютере — десятки изолированных инстансов.')}
      <div class="wag-sub">Шаг 1. Купите виртуальный номер</div>
      <p class="wag-p">В CRM: <b>«Купить номер»</b> → выберите страну → оплата спишется с баланса расходников (аренда ≈ $9/мес). Номер сразу начинает ловить SMS-коды (OTP) прямо в ленту CRM — вкладка <b>«Активация / коды»</b> на карточке номера.</p>

      <div class="wag-sub">Шаг 2. Установите WhatsApp через Android-эмулятор</div>
      <p class="wag-p">WhatsApp «живёт» на одном устройстве. Чтобы не держать рабочий номер на личном телефоне, ставим WhatsApp в <b>эмуляторе Android на ПК</b> — это виртуальный телефон в окне. Он принимает OTP и становится «основным» устройством номера, а Lumen цепляется к нему по QR как связанное устройство.</p>
      ${emuTable}
      ${call('info', 'Что выбрать', '<b>BlueStacks 5</b> — если делаете это впервые (проще всего, есть виртуальная камера для QR). <b>LDPlayer 9</b> — если номеров много и нужна лёгкая работа с десятком окон.')}

      <div class="wag-sub">Шаг 3. Клонирование: несколько номеров = несколько инстансов</div>
      <p class="wag-p">Каждый рабочий номер = <b>отдельный инстанс</b> (клон) эмулятора со своим WhatsApp. Один инстанс на один номер — так аккаунты не пересекаются и меньше риск бана.</p>
      ${cloneWin}
      <div class="wag-clones">
        <div class="wag-clone"><b>BlueStacks 5</b><span>Откройте <span class="wag-kbd">Ctrl</span>+<span class="wag-kbd">Shift</span>+<span class="wag-kbd">8</span> (Multi-Instance Manager) → <b>«Новый инстанс»</b> (Fresh, напр. Android 11/Pie) или <b>«Клонировать»</b> готовый. Каждое окно — отдельный телефон с отдельным WhatsApp.</span></div>
        <div class="wag-clone"><b>LDPlayer 9</b><span>Иконка <b>«LD Multi-Player»</b> на рабочем столе → <b>«Новый эмулятор»</b> или <b>«Клонировать»</b>. Есть синхронизатор — но для WhatsApp работайте в каждом окне отдельно.</span></div>
        <div class="wag-clone"><b>NoxPlayer</b><span><b>Multi-Drive</b> (в меню инструментов) → <b>«Add emulator»</b> / <b>«Clone»</b>. Встроенная эмуляция GPS помогает совместить гео с номером.</span></div>
        <div class="wag-clone"><b>MEmu Play</b><span><b>Multiple Instance Manager</b> → <b>«New»</b> / <b>«Clone»</b>. Лёгкий по ресурсам — тянет несколько окон на среднем ПК.</span></div>
      </div>
      ${call('warn', 'Изоляция и антибан для клонов', '<b>1 инстанс = 1 номер.</b> Для новых виртуальных номеров: на каждый инстанс — <b>резидентный прокси страны номера</b>, согласованный <b>часовой пояс и язык</b> интерфейса. 10 номеров с одного домашнего IP = маркер фермы аккаунтов → бан. Личный номер по пути A прокси не требует.')}

      <div class="wag-sub">Шаг 4. Зарегистрируйте WhatsApp на номер</div>
      <p class="wag-p">В инстансе эмулятора установите WhatsApp (Play Market или APK), введите купленный номер. Код подтверждения придёт <b>в ленту OTP в CRM</b> («Активация / коды») — введите его в WhatsApp внутри эмулятора. Аккаунт готов.</p>

      <div class="wag-sub">Шаг 5. Подключите номер к Lumen по QR</div>
      <p class="wag-p">В CRM нажмите <b>«Подключить свой (QR)»</b> → введите этот номер → появится QR. В WhatsApp эмулятора: <b>Настройки → Связанные устройства → Привязка устройства</b> → отсканируйте QR.</p>
      ${call('tip', 'Как навести «камеру» эмулятора на QR', 'В эмуляторе нет реальной камеры. Сохраните QR из Lumen картинкой и подайте её как <b>виртуальную камеру</b>: BlueStacks — Настройки → Камера → выбрать изображение; LDPlayer/Nox — включить виртуальную камеру и указать файл. Либо откройте QR на телефоне/втором мониторе и наведите веб-камеру.')}
    </div>

    <div class="wag-sec">
      ${secH('D', 'Профиль номера', 'Оформите аккаунт до начала переписки — так он выглядит живым.')}
      <p class="wag-p">Кнопка <b>«Профиль»</b> на карточке номера: имя (≤25 симв.), описание/статус, аватар. Всё синхронизируется в реальный WhatsApp-аккаунт. Полный профиль <b>до</b> первого трафика снижает риск бана.</p>
    </div>

    <div class="wag-sec">
      ${secH('E', 'Прогрев (обязательно для новых номеров)', 'Свежий номер нельзя сразу грузить объёмом — это главный маркер бота.')}
      <p class="wag-p">Включите тумблер <b>прогрева</b> выше (нужно <b>≥2 подключённых номера</b>). Они начинают аккуратно переписываться между собой с задержками, как живые люди, поднимая доверие 2–3 недели.</p>
      <div class="wag-ramp">
        <div class="wag-rc"><b>Дни 1–3</b><span>~3–5 контактов/день</span></div>
        <div class="wag-rc"><b>Неделя 1–2</b><span>+~20% в неделю</span></div>
        <div class="wag-rc"><b>После прогрева</b><span>рабочий лимит ≤5 новых лидов/день</span></div>
      </div>
      ${call('danger', 'Резкий объём = бан', 'Не начинайте с рассылок и десятков первых сообщений на новом номере. Рост должен быть плавным.')}
    </div>

    <div class="wag-sec">
      ${secH('F', 'Правила безопасности', 'Соблюдайте — иначе номера отлетают в бан.')}
      <ul class="wag-rules">
        <li><b>1 брокер = 1 личный номер.</b> Больше номеров = больше новых лидов в день без риска.</li>
        <li><b>≤5 новых лидов/день на номер.</b> Действующие диалоги — без лимита.</li>
        <li><b>Массовые рассылки с личных номеров запрещены.</b> Холодные первые касания — только через <b>Cloud API</b> (официальный канал, шаблоны).</li>
        <li><b>Inbound-first:</b> в идеале первым пишет клиент (реклама CTWA / Lead Form дают согласие на диалог).</li>
      </ul>
    </div>

    <div class="wag-sec">
      ${secH('?', 'Частые проблемы', 'Быстрые ответы на то, что чаще всего идёт не так.')}
      <div class="wag-faq">${faq.map(f => `<details class="wag-fq"><summary>${f[0]}</summary><div class="wag-fa">${f[1]}</div></details>`).join('')}</div>
    </div>
  </div>`;

  return body;
}

/* ── Полная иллюстрированная инструкция «Telegram по QR» ──────────────────────
   Реальные скриншоты регистрации (assets/tg-guide/*.png) + мокапы экранов,
   разбор ВАРИАТИВНОГО «забора» Telegram (email-код / ~$0.99 / SMS, зависит от
   страны и репутации номера), 2FA-пароль, прогрев, FAQ. Заменяет короткий гид tg. */
function tgQrGuideRich() {
  const TGBLUE = '#2AABEE';
  const phone = (title, rows, foot) => `<div class="wag-phone">
    <div class="wag-ph-bar"><span>9:41</span><span class="wag-ph-sig">▪▪▪ ▪ ▮</span></div>
    <div class="wag-ph-hd" style="background:${TGBLUE}"><span class="wag-ph-back">‹</span>${title}</div>
    <div class="wag-ph-body">${rows.map(r => `<div class="wag-mrow ${r.hl ? 'hl' : ''}">
      <span class="wag-mic">${r.ic || ''}</span>
      <span class="wag-mtx"><b>${r.t}</b>${r.d ? `<i>${r.d}</i>` : ''}</span>
      ${r.hl ? '<span class="wag-mgo">→</span>' : ''}
    </div>`).join('')}</div>
    ${foot ? `<div class="wag-ph-foot">${foot}</div>` : ''}
  </div>`;
  const call = (kind, title, html) => `<div class="wag-call ${kind}"><div class="wag-call-t">${title}</div><div class="wag-call-b">${html}</div></div>`;
  const secH = (n, t, sub) => `<div class="wag-h"><span class="wag-hn" style="background:${TGBLUE}">${n}</span><div><div class="wag-ht">${t}</div>${sub ? `<div class="wag-hs">${sub}</div>` : ''}</div></div>`;

  /* реальные скриншоты забора */
  const shots = [
    ['01-add-email', 'Add Email — впиши e-mail', 'Telegram просит почту, куда придёт код'],
    ['02-email-code', 'Код с почты', 'Введи код из письма (не из SMS)'],
    ['03-sms-fee', '~$0.99 — анти-спам', 'Появляется НЕ всегда (неделя Premium)'],
    ['04-enter-code', 'SMS-код на номер', 'Код возьми в ленте OTP в CRM'],
  ];
  const realShots = `<div class="wag-realshots">${shots.map(s => `<figure class="wag-fig">
    <img src="assets/tg-guide/${s[0]}.png?v=1" loading="lazy" alt="${esc(s[1])}">
    <figcaption><b>${s[1]}</b><span>${s[2]}</span></figcaption>
  </figure>`).join('')}</div>`;

  /* путь подключения по QR */
  const pathQR = `<div class="wag-shots">
    ${phone('Настройки', [
      { ic: '👤', t: 'Мой профиль', d: 'имя, username, фото' },
      { ic: '💻', t: 'Устройства', d: 'активные сессии и подключения', hl: true },
      { ic: '🔒', t: 'Конфиденциальность', d: 'в т.ч. облачный пароль (2FA)' },
    ])}
    ${phone('Устройства', [
      { ic: '➕', t: 'Подключить устройство', d: 'откроется сканер QR', hl: true },
      { ic: '📱', t: 'Этот телефон', d: 'основная сессия' },
    ], 'Linked-сессия живёт, пока сам не выйдешь. Телефон держать онлайн НЕ нужно (в отличие от WhatsApp).')}
    ${phone('Сканер', [
      { ic: '🎯', t: 'Наведите на QR-код', d: 'QR показан в Lumen', hl: true },
    ], 'Если на аккаунте включён облачный пароль — Lumen попросит ввести его.')}
  </div>
  <div class="wag-cap">Путь: <b>Telegram → Настройки → Устройства → Подключить устройство</b> → навести на QR из Lumen. SMS при подключении не нужен.</div>`;

  const faq = [
    ['Код не приходит совсем (особенно на номер США)', 'US-номера Telegram почти не обслуживает: подключение говорит «код отправлен», а SMS не доходит. Берите <b>не-US</b> страну (Украина, Британия, Нидерланды, Польша, Германия, Канада) — там забор мягче. Это самая частая причина «не приходит код».'],
    ['Вместо SMS пришёл код на e-mail', 'Это нормальный новый путь Telegram для части номеров. Введите код из <b>письма</b>, а не из SMS. Дальше может быть ещё и SMS-шаг — код для него берите в ленте OTP в CRM.'],
    ['Telegram требует оплату ~$0.99', 'Это One-time SMS Fee (неделя Premium) как анти-спам. Появляется <b>не всегда</b> — зависит от номера и страны. Если показал — оплатите картой и продолжите; если не показал — сразу перейдёте к вводу кода.'],
    ['Один e-mail на два номера — код не пришёл', 'Повтор одной почты на разные номера Telegram режет (анти-абьюз). На <b>каждый номер — уникальный e-mail</b>. Не обязательно покупать ящики: заведите <b>catch-all домен</b> (любой адрес @вашдомен → один ящик) или Gmail-алиасы (<i>имя+1@gmail.com</i>, <i>имя+2@…</i>). Этот e-mail станет почтой аккаунта для будущих кодов — держите к нему доступ.'],
    ['При сканировании QR просит пароль', 'На аккаунте включена двухэтапная аутентификация (облачный пароль Telegram). Введите этот пароль в Lumen — подключение завершится. Забыли — сбросьте 2FA в Telegram на телефоне.'],
    ['Аккаунт «разлогинился» / слетел', 'Свежий номер с резким объёмом Telegram может выкинуть как подозрительный. Лечение: прогрев 2–3 недели перед работой, резидентный прокси страны номера, полный профиль (имя+фото+био) ещё до первого трафика, никаких рассылок.'],
    ['Нужно ли держать телефон онлайн?', 'Нет. В отличие от WhatsApp, Telegram-сессия Lumen живёт самостоятельно, пока вы сами её не завершите. После создания аккаунта и скана QR телефон/эмулятор можно выключить.'],
  ];

  const body = `<div class="wag">
    <div class="wag-lead">Telegram изначально многоустройственный — Lumen цепляется к аккаунту по QR как ещё одно устройство (как WhatsApp Web). Главная возня — <b>разовая регистрация номера</b>: у Telegram есть анти-спам «забор», и он у всех разный. Ниже — как пройти его без сюрпризов.</div>

    <div class="wag-paths">
      <div class="wag-path">
        <div class="wag-ptag" style="color:${TGBLUE}">Путь A · быстрый</div>
        <div class="wag-pt">Свой аккаунт по QR</div>
        <div class="wag-pd">У вас уже есть Telegram на этот номер. Просто сканируете QR — 1 минута.</div>
        <div class="wag-pmeta">Бесплатно · забор проходить не нужно</div>
      </div>
      <div class="wag-path">
        <div class="wag-ptag alt">Путь B · рабочий номер</div>
        <div class="wag-pt">Виртуальный номер + регистрация</div>
        <div class="wag-pd">Отдельный рабочий номер под брокера. Один раз проходите забор Telegram на телефоне/эмуляторе, потом цепляете по QR.</div>
        <div class="wag-pmeta">≈ $9/мес аренда номера · нужен телефон/эмулятор на этап регистрации</div>
      </div>
    </div>

    <div class="wag-sec">
      ${secH('A', 'Свой аккаунт по QR', 'Если рабочий Telegram уже на вашем номере — это всё, что нужно.')}
      <ol class="wag-ol">
        <li>В CRM: вкладка «Telegram» → <b>«Подключить свой номер»</b> → введите номер → появится QR.</li>
        <li>В Telegram: <b>Настройки → Устройства → Подключить устройство</b>.</li>
        <li>Наведите камеру на QR в Lumen. Если включён облачный пароль (2FA) — введите его. Готово.</li>
      </ol>
      ${pathQR}
    </div>

    <div class="wag-sec">
      ${secH('B', 'Регистрация нового номера — «забор» Telegram', 'Самый важный раздел. Набор шагов зависит от страны и репутации номера — разберём все ветки.')}
      <p class="wag-p">Купите виртуальный номер в CRM (<b>«Купить номер для Telegram»</b>, оплата с баланса). Затем на телефоне (лучше Android) или в эмуляторе заведите Telegram на этот номер. Что попросит Telegram — <b>зависит от страны + репутации номера + оператора</b>, поэтому вариантов несколько:</p>
      <div class="wag-branches">
        <div class="wag-branch"><div class="wag-bn">1</div><div class="wag-bb"><b>Повезло: сразу SMS</b><span>Telegram шлёт код прямо в SMS на номер → код прилетает в ленту OTP в CRM → вводите → готово.</span></div></div>
        <div class="wag-branch"><div class="wag-bn">2</div><div class="wag-bb"><b>Часто у виртуальных: код на e-mail</b><span>Экран <b>Add Email</b> → код приходит <b>на почту</b> (а не в SMS). Вводите код из письма. ⚠️ На каждый номер — уникальный e-mail.</span></div></div>
        <div class="wag-branch"><div class="wag-bn">3</div><div class="wag-bb"><b>Иногда: разовая плата ~$0.99</b><span>Экран <b>One-time SMS Fee</b> (неделя Premium, анти-спам). Появляется не всегда. Оплатите картой → затем код.</span></div></div>
        <div class="wag-branch alt"><div class="wag-bn">↯</div><div class="wag-bb"><b>Комбинация</b><span>Часто это связка: <b>e-mail → (иногда $0.99) → SMS</b>. Порядок один и тот же, просто часть шагов может отсутствовать.</span></div></div>
      </div>
      <div class="wag-sub">Как это выглядит на экранах</div>
      ${realShots}
      <div class="wag-cap">Экраны Telegram могут отличаться по стране/устройству — логика та же: <b>e-mail → (оплата) → SMS</b>.</div>
      ${call('danger', 'Не берите номер США', 'US-номера Telegram почти не обслуживает — код «отправлен», но SMS не доходит. Берите <b>не-US</b>: Украина, Британия, Нидерланды, Польша, Германия, Канада — там забор мягче.')}
      ${call('warn', 'Уникальный e-mail на каждый номер', 'Повтор одной почты на разные номера = код не придёт (анти-абьюз). Решение без покупки ящиков: <b>catch-all домен</b> (любой адрес @вашдомен → один ящик) или <b>Gmail-алиасы</b> (имя+1@gmail.com, имя+2@…). Держите доступ к этой почте — на неё будут приходить будущие коды входа.')}
    </div>

    <div class="wag-sec">
      ${secH('C', 'Подключение по QR + облачный пароль (2FA)', 'После регистрации аккаунт цепляется к Lumen как связанное устройство.')}
      <p class="wag-p">В CRM: <b>«Подключить свой номер»</b> → введите номер → QR. В Telegram, где создан аккаунт: <b>Настройки → Устройства → Подключить устройство</b> → наведите на QR.</p>
      ${call('info', 'Если попросит пароль', 'Когда на аккаунте включена двухэтапная аутентификация (облачный пароль), Lumen после скана QR попросит ввести его — это нормально. Введите пароль, и подключение завершится.')}
    </div>

    <div class="wag-sec">
      ${secH('D', 'Сколько аккаунтов на одном устройстве', 'У Telegram с этим проще, чем у WhatsApp.')}
      <p class="wag-p">Telegram штатно держит <b>несколько аккаунтов в одном приложении</b>: Настройки → стрелка у имени → <b>«Добавить аккаунт»</b>. Обычно до 3, с Telegram Premium — до 4. Дальше — клонирование приложения (Samsung Dual Messenger, Xiaomi «Клонирование приложений» и т.п.) или отдельные <b>инстансы эмулятора</b> — те же BlueStacks / LDPlayer / NoxPlayer, что и для WhatsApp (см. инструкцию WhatsApp по QR → раздел про эмуляторы и клонирование).</p>
      ${call('tip', 'Важное отличие от WhatsApp', 'Устройство/эмулятор нужен только на <b>этап регистрации</b>. После скана QR linked-сессия Lumen живёт сама — телефон можно выключить. Держать ферму устройств онлайн, как для WhatsApp, не нужно.')}
    </div>

    <div class="wag-sec">
      ${secH('E', 'Профиль аккаунта', 'Оформите до первого трафика — живой профиль снижает риск блокировки.')}
      <p class="wag-p">Кнопка <b>«Профиль»</b> на карточке номера: имя, фамилия, <b>username</b>, био (≤70 симв.), аватар. Всё синхронизируется в реальный Telegram-аккаунт.</p>
    </div>

    <div class="wag-sec">
      ${secH('F', 'Прогрев (обязательно для новых)', 'Свежий аккаунт нельзя сразу грузить объёмом — резкий скачок = маркер бота.')}
      <p class="wag-p">Включите прогрев (нужно <b>≥2 подключённых номера</b>) — они аккуратно переписываются между собой с задержками и вариативными текстами.</p>
      <div class="wag-ramp">
        <div class="wag-rc"><b>День 0</b><span>≈3 сообщения</span></div>
        <div class="wag-rc"><b>+ каждый день</b><span>+~2 к лимиту</span></div>
        <div class="wag-rc"><b>~2 недели</b><span>потолок ≈20/день</span></div>
      </div>
      ${call('info', 'Best-practice против бана', 'Консистентная гео/сессия + резидентный прокси страны номера, полный профиль ещё до трафика, вариативные тексты. Новый аккаунт в основном <b>принимает</b> (низкий cap на отправку) — это нормально.')}
    </div>

    <div class="wag-sec">
      ${secH('G', 'Правила безопасности', 'Коротко — чтобы аккаунты жили.')}
      <ul class="wag-rules">
        <li><b>Не-US номер</b> — US почти не регистрируется.</li>
        <li><b>Уникальный e-mail на каждый номер</b> и доступ к нему (будущие коды входа).</li>
        <li><b>Прогрев 2–3 недели</b> перед работой, полный профиль до трафика.</li>
        <li><b>Рассылки с серых аккаунтов — нет.</b> Массовые касания — официальными средствами.</li>
      </ul>
    </div>

    <div class="wag-sec">
      ${secH('?', 'Частые проблемы', 'Всё, что чаще всего идёт не так при регистрации Telegram.')}
      <div class="wag-faq">${faq.map(f => `<details class="wag-fq"><summary>${f[0]}</summary><div class="wag-fa">${f[1]}</div></details>`).join('')}</div>
    </div>
  </div>`;

  return body;
}

/* ── Полная иллюстрированная инструкция «Телефония» ───────────────────────────
   Два формата: (A) покупка номера в нашем магазине (внутри церемонии) и
   (B) подключение своей телефонии (Telnyx/Twilio/Zadarma) — с мокапами формы,
   вебхука, портала провайдера и разбором частых проблем. Заменяет короткий tel. */
function telGuideRich() {
  const ACC = 'var(--accent)';
  const call = (kind, title, html) => `<div class="wag-call ${kind}"><div class="wag-call-t">${title}</div><div class="wag-call-b">${html}</div></div>`;
  const secH = (n, t, sub) => `<div class="wag-h"><span class="wag-hn">${n}</span><div><div class="wag-ht">${t}</div>${sub ? `<div class="wag-hs">${sub}</div>` : ''}</div></div>`;
  const win = (title, bodyHtml) => `<div class="wag-win"><div class="wag-win-bar"><span class="wag-win-dots"><i></i><i></i><i></i></span>${title}</div><div class="wag-win-body">${bodyHtml}</div></div>`;
  const field = (label, val, ph) => `<div class="wag-field"><span class="wag-flabel">${label}</span><span class="wag-finput ${val ? '' : 'ph'}">${val || ph || ''}</span></div>`;

  /* мокап: магазин покупки номера */
  const shopWin = win('Номера · Телефония · Купить номер', `
    <div class="wag-field"><span class="wag-flabel">Страна</span><span class="wag-finput">🇦🇪 ОАЭ (+971) ▾</span></div>
    <div class="wag-shoplist">
      <div class="wag-shoprow"><b>+971 5X XXX 01</b><i>Local · запись, звонки</i><span class="wag-buybtn">Купить</span></div>
      <div class="wag-shoprow"><b>+971 5X XXX 02</b><i>Local · запись, звонки</i><span class="wag-buybtn">Купить</span></div>
      <div class="wag-shoprow"><b>+971 5X XXX 03</b><i>Local · запись, звонки</i><span class="wag-buybtn">Купить</span></div>
    </div>
    <div class="wag-shopnote">Оплата ≈ $9/мес спишется с баланса расходников. Номер сразу в авто-подборе.</div>`);

  /* мокап: настройки своей телефонии */
  const settingsWin = win('Настройки · Телефония', `
    ${field('Провайдер', 'Telnyx ▾')}
    <div class="wag-field2">
      ${field('API key', '', 'KEY01ABC… (Telnyx V2)')}
      ${field('Connection / App ID', '', 'Call Control App ID')}
    </div>
    <div class="wag-field2">
      ${field('Номер «От» (дефолт)', '', '+971 5X…')}
      ${field('Гео-пул (авто-подбор)', '+39…, +971…, +66…', '')}
    </div>
    <div class="wag-winbtns"><span class="wag-buybtn">Сохранить</span><span class="wag-ghostbtn">✦ Проверить</span></div>`);

  /* мокап: вебхук */
  const webhookWin = win('Вебхук для провайдера', `
    <div class="wag-copy"><code>https://ваш-lumen.app/api/telephony/webhook/telnyx</code><span class="wag-copychip">⧉ Копировать</span></div>
    <div class="wag-shopnote">Вставьте этот адрес в Telnyx → Voice App (Call Control App) → <b>Webhook URL</b>. Без него не придут статусы звонка и запись.</div>`);

  const faq = [
    ['Звоню — тишина ~20 секунд и не соединяет', 'Чаще всего в кабинете провайдера не включена страна назначения. Telnyx: <b>Outbound Voice Profile</b> → добавьте страны, куда звоните (и страну номера «От»). Без этого звонок молча не проходит.'],
    ['Не приходит запись и статусы звонка', 'Не настроен вебхук. Скопируйте Webhook URL из карточки и вставьте в <b>Telnyx → Voice App → Webhook URL</b> (у Twilio — в настройках номера/приложения). Запись и транскрипт кладутся в карточку только через вебхук.'],
    ['Где взять ключи Telnyx', 'portal.telnyx.com → <b>API Keys</b> — создайте ключ <b>V2</b> (начинается с KEY…). Затем <b>Call Control → Applications</b> — создайте приложение и возьмите его <b>App ID</b> (это и есть Connection / App ID). Секрет для Telnyx не нужен.'],
    ['Где взять данные Twilio', 'console.twilio.com → Account Info: <b>Account SID</b> (AC…) и Auth Token / API key. Вебхук указывается в настройках номера или TwiML App.'],
    ['Какого провайдера выбрать', '<b>Zadarma</b> — дешевле всего для старта (номер ОАЭ + записи + API). <b>Telnyx / Twilio</b> — глобальные, удобны когда звоните в разные страны. Начать проще с Zadarma.'],
    ['Клиент видит иностранный номер', 'Добавьте номер страны клиента в <b>гео-пул</b>. При звонке подставится номер, совпадающий по коду страны (лид +39 → звонок с итальянского номера, local presence → выше отклик). Нет совпадения — берётся «От» по умолчанию.'],
    ['Сколько номеров нужно команде', 'Ориентир ~<b>1 активный номер на 3 брокеров</b> (несколько линий = параллельные разговоры). Больше не нужно — дороже и хуже для репутации. В настройках есть кнопка «Купить по рекомендации».'],
  ];

  const body = `<div class="wag">
    <div class="wag-lead">Телефония — это звонок клиенту <b>в один клик из карточки лида</b>: разговор записывается, ИИ делает резюме и кладёт его в карточку. Клиенту показываем номер его страны (local presence → выше отклик). Подключить можно двумя способами.</div>

    <div class="wag-paths">
      <div class="wag-path">
        <div class="wag-ptag">Способ 1 · проще</div>
        <div class="wag-pt">Купить номер в нашем магазине</div>
        <div class="wag-pd">Всё уже настроено. Выбираете страну — номер сразу готов к звонкам. Ничего не подключаете.</div>
        <div class="wag-pmeta">≈ $9/мес аренда · минуты с баланса</div>
      </div>
      <div class="wag-path">
        <div class="wag-ptag alt">Способ 2 · своё</div>
        <div class="wag-pt">Подключить свою телефонию</div>
        <div class="wag-pd">Уже есть Telnyx / Twilio / Zadarma — вводите ключи, вебхук, и звоните через свой аккаунт провайдера.</div>
        <div class="wag-pmeta">Тариф провайдера напрямую · нужен API-ключ</div>
      </div>
    </div>

    <div class="wag-sec">
      ${secH('1', 'Купить номер в магазине', 'Самый быстрый путь — ничего настраивать не нужно.')}
      <ol class="wag-ol">
        <li>Раздел <b>«Номера» → вкладка «Телефония» → «Купить номер»</b>.</li>
        <li>Выберите <b>страну и тип</b> (Local — местный номер) → нажмите «Купить». Оплата ≈ $9/мес спишется с баланса расходников.</li>
        <li>Номер сразу встаёт в <b>авто-подбор</b>: клиенту звоним с номера его страны автоматически.</li>
        <li>Звоните <b>из карточки лида</b> в один клик — запись + транскрипт + ИИ-резюме попадают в карточку.</li>
      </ol>
      ${shopWin}
      ${call('tip', 'Совет по количеству', 'Ориентир — примерно 1 номер на 3 брокеров: несколько линий дают параллельные разговоры. Больше обычно не нужно.')}
    </div>

    <div class="wag-sec">
      ${secH('2', 'Подключить свою телефонию', 'Если у вас уже есть аккаунт провайдера. Нужны ключ, App ID и вебхук.')}
      <div class="wag-sub">Шаг 1. Выберите провайдера и введите ключи</div>
      <p class="wag-p">Настройки → <b>Телефония</b> → выберите провайдера: <b>Zadarma</b> (дешевле для ОАЭ), <b>Twilio</b> или <b>Telnyx</b> (глобальные).</p>
      ${settingsWin}
      <div class="wag-clones">
        <div class="wag-clone"><b>Telnyx</b><span>API key <b>V2</b> (KEY…) из portal.telnyx.com → API Keys. <b>Connection / App ID</b> = App ID из Call Control → Applications. Секрет не нужен.</span></div>
        <div class="wag-clone"><b>Twilio</b><span>API key + <b>Account SID</b> (AC…) из console.twilio.com → Account Info.</span></div>
        <div class="wag-clone"><b>Zadarma</b><span>API key + API secret из личного кабинета Zadarma → Настройки → API.</span></div>
        <div class="wag-clone"><b>Номер «От» + гео-пул</b><span>Укажите дефолтный номер и пул (по одному в строке) — система подставит номер страны клиента.</span></div>
      </div>

      <div class="wag-sub">Шаг 2. Пропишите вебхук</div>
      <p class="wag-p">Скопируйте адрес вебхука из карточки и вставьте его в кабинете провайдера — без этого не придут статусы звонка и запись.</p>
      ${webhookWin}

      <div class="wag-sub">Шаг 3. Включите страны и проверьте</div>
      <p class="wag-p">В кабинете провайдера включите направления, куда будете звонить, затем нажмите <b>«Проверить»</b> — придёт тестовый звонок. Прошёл — сохраняйте. Тут же можно купить номера у провайдера (есть кнопка «Купить по рекомендации»).</p>
      ${call('danger', 'Главная причина «звоню — тишина»', 'В Telnyx <b>Outbound Voice Profile</b> должны быть включены страны назначения и страна номера «От». Если направление выключено — звонок молча не проходит ~20 секунд. Это ловушка №1 при своей телефонии.')}
    </div>

    <div class="wag-sec">
      ${secH('$', 'Тарификация', 'Что и как считается.')}
      <p class="wag-p">Минуты разговора + запись + транскрибация считаются по факту. В магазине — списываются с баланса расходников (аренда номера ≈ $9/мес). При своей телефонии минуты платятся провайдеру напрямую (≈ $0.10–0.20 за минуту речи), а Lumen считает только ИИ-резюме/транскрибацию.</p>
    </div>

    <div class="wag-sec">
      ${secH('?', 'Частые проблемы', 'Быстрые ответы по подключению и звонкам.')}
      <div class="wag-faq">${faq.map(f => `<details class="wag-fq"><summary>${f[0]}</summary><div class="wag-fa">${f[1]}</div></details>`).join('')}</div>
    </div>
  </div>`;

  return body;
}

/* ── Подробный гайд «Приём лидов через интегратор (Albato)»: Meta Lead Form →
   Albato ловит лид → шлёт на вебхук Lumen → карточка в CRM. Со «скриншот-мокапами». ── */
function albatoGuide(hookUrl) {
  const call = (kind, title, html) => `<div class="wag-call ${kind}"><div class="wag-call-t">${title}</div><div class="wag-call-b">${html}</div></div>`;
  const secH = (n, t, sub) => `<div class="wag-h"><span class="wag-hn">${n}</span><div><div class="wag-ht">${t}</div>${sub ? `<div class="wag-hs">${sub}</div>` : ''}</div></div>`;
  const brw = (crumb, rowsHtml) => `<div class="wag-win"><div class="wag-win-bar wag-brw"><span class="wag-win-dots"><i></i><i></i><i></i></span><span class="wag-crumb">${crumb}</span></div><div class="wag-win-body">${rowsHtml}</div></div>`;
  const mf = (label, val, hl, btn) => `<div class="wag-mf ${hl ? 'hl' : ''}"><span class="wag-mflabel">${label}</span><span class="wag-mfval">${val}</span>${btn ? `<span class="wag-copychip">${btn}</span>` : ''}</div>`;
  const shortUrl = (hookUrl || 'https://ваш-lumen.app/hooks/lead?key=•••').replace(/(key=)[^&]+/, '$1••••••');

  const flow = `<div class="wag-flow">
    <div class="wag-fstep"><span class="wag-fic">📢</span><b>Meta Lead Form</b><span>клиент оставил заявку</span></div>
    <span class="wag-farr">→</span>
    <div class="wag-fstep"><span class="wag-fic">🔗</span><b>Albato</b><span>поймал новый лид</span></div>
    <span class="wag-farr">→</span>
    <div class="wag-fstep"><span class="wag-fic">📥</span><b>Lumen</b><span>карточка лида в CRM</span></div>
  </div>`;

  const metaFormWin = brw('Meta Ads › Мгновенная форма (Instant Form)', `
    ${mf('Цель кампании', 'Лид-формы (Instant Forms)', true)}
    ${mf('Страница', 'Страница вашего агентства', false)}
    ${mf('Поля формы', 'Имя · Телефон · E-mail', true)}
    <div class="wag-shopnote">Телефон в форме обязателен — по нему Lumen заводит карточку и не плодит дубли.</div>`);

  const trigWin = brw('Albato › Связка › Шаг 1 · Триггер', `
    ${mf('Приложение', 'Facebook Lead Ads', true)}
    ${mf('Событие', 'Новый лид (New Lead)', true)}
    ${mf('Аккаунт', 'подключить Facebook (вход)', false)}
    ${mf('Страница', 'Страница агентства', false)}
    ${mf('Форма', 'ваша лид-форма', false)}`);

  const actWin = brw('Albato › Связка › Шаг 2 · Действие', `
    ${mf('Приложение', 'Webhook (HTTP-запрос)', true)}
    ${mf('Метод', 'POST', false)}
    ${mf('URL', shortUrl, true, '⧉ из Lumen')}
    ${mf('Формат тела', 'JSON', false)}
    <div class="wag-maplbl">Сопоставление полей (JSON ← поле формы):</div>
    ${mf('name', '← Полное имя', false)}
    ${mf('phone', '← Телефон · ОБЯЗАТЕЛЬНО', true)}
    ${mf('email', '← E-mail', false)}
    ${mf('ad_id', '← ID объявления', false)}
    ${mf('adset_id / campaign_id / form_name', '← соответствующие поля', false)}`);

  const faq = [
    ['Лид не пришёл в CRM', 'Проверьте: связка в Albato <b>включена</b>; в действии метод <b>POST</b> и правильный URL из Lumen; в маппинге заполнен <b>phone</b> (без него лид отклоняется). Отправьте тест-лид из Albato и смотрите «Журнал приёма» ниже.'],
    ['Поля в форме называются иначе', 'Не страшно — Lumen понимает синонимы: name/full_name/first_name, phone/phone_number, email/e-mail. Главное — чтобы значение телефона попало в поле <b>phone</b>.'],
    ['Можно ли без Albato — Make или Zapier?', 'Да, принцип тот же: триггер «Facebook Lead Ads → New Lead» → действие <b>Webhook / HTTP POST</b> на этот же URL Lumen с теми же полями.'],
    ['Что даёт ad_id', 'Если передать <b>ad_id</b>, лид автоматически привяжется к объявлению — и в «Дереве креативов»/«Эффективности» будет видно, какой креатив принёс заявку.'],
    ['Безопасность ссылки', 'URL содержит секретный ключ — не публикуйте его. При утечке нажмите <b>«Сменить секрет»</b> и обновите адрес в Albato.'],
  ];

  return `<div class="wag" style="gap:16px">
    <div class="wag-lead">Приём лидов из Meta <b>без программирования</b> — через интегратор. Берём Albato (так же работают Make/Zapier). Схема простая:</div>
    ${flow}

    <div class="wag-sec" style="border-top:none;padding-top:0">
      ${secH('1', 'Meta: кампания с лид-формой', 'Нужна цель «Лид-формы» и сама форма на вашей Странице.')}
      <p class="wag-p">В Ads Manager запустите кампанию с целью <b>«Лид-формы» (Instant Forms)</b> на Странице агентства. В форме — поля <b>Имя</b>, <b>Телефон</b> (обязательно), <b>E-mail</b>.</p>
      ${metaFormWin}
    </div>

    <div class="wag-sec">
      ${secH('2', 'Albato: триггер «Новый лид»', 'Albato будет ловить каждую новую заявку из формы.')}
      <p class="wag-p">Зарегистрируйтесь на Albato → создайте <b>связку (Bundle)</b>. Первый шаг (триггер): приложение <b>Facebook Lead Ads</b>, событие <b>«Новый лид»</b>. Подключите аккаунт Facebook, выберите <b>Страницу</b> и <b>Форму</b>.</p>
      ${trigWin}
    </div>

    <div class="wag-sec">
      ${secH('3', 'Скопируйте вебхук Lumen', 'Это адрес, куда Albato будет слать лиды.')}
      <p class="wag-p">В карточке ниже нажмите кнопку копирования у поля <b>«Webhook приёма»</b>. Адрес содержит секретный ключ — не публикуйте его.</p>
      ${mf('Webhook приёма (Lumen)', shortUrl, true, '⧉ кнопка ниже')}
    </div>

    <div class="wag-sec">
      ${secH('4', 'Albato: действие «Webhook (POST)»', 'Второй шаг связки — отправка лида в Lumen.')}
      <p class="wag-p">Добавьте действие <b>Webhook / HTTP-запрос</b>: метод <b>POST</b>, URL — вебхук Lumen, тело <b>JSON</b>. Сопоставьте поля формы с полями Lumen.</p>
      ${actWin}
      ${call('info', 'Какие поля принимает Lumen', '<b>name</b>, <b>phone</b> (обязательно), <b>email</b>, <b>geo</b>, <b>source</b>, <b>ad_id</b>, <b>adset_id</b>, <b>campaign_id</b>, <b>form_name</b>. Маппинг гибкий — понимает синонимы (full_name, phone_number, e-mail…).')}
    </div>

    <div class="wag-sec">
      ${secH('5', 'Включите и протестируйте', 'Проверка за минуту.')}
      <ol class="wag-ol">
        <li>Включите связку в Albato.</li>
        <li>Отправьте <b>тест-лид</b> (в Albato есть тестовая отправка, либо заполните форму сами).</li>
        <li>Проверьте <b>«Журнал приёма»</b> ниже и карточку нового лида в разделе «Лиды».</li>
      </ol>
      ${call('tip', 'Правила, чтобы не было сюрпризов', '• <b>phone обязателен</b> — без него лид не создаётся.<br>• <b>Дубли по телефону не плодятся</b> — повторная заявка обогащает существующую карточку.<br>• <b>ad_id</b> → авто-привязка к объявлению (аналитика по креативам).<br>• Обратный мост (по желанию): квал/сделка из Lumen → POST на ваш URL (в поле «Исходящий мост» ниже) → Albato разнесёт в любую CRM клиента.')}
    </div>

    <div class="wag-sec">
      ${secH('?', 'Частые вопросы', '')}
      <div class="wag-faq">${faq.map(f => `<details class="wag-fq"><summary>${f[0]}</summary><div class="wag-fa">${f[1]}</div></details>`).join('')}</div>
    </div>
  </div>`;
}

/* ── Полная иллюстрированная инструкция «WhatsApp Cloud API» ──────────────────
   Два пути (Embedded Signup / ручной мастер), мокапы экранов Meta (API Setup,
   System User токен, App Secret, Configuration-вебхук), карта в Meta, шаблоны и
   лимиты, тест, FAQ. Заменяет короткий chGuideCard для канала cloud. */
function cloudGuideRich() {
  const call = (kind, title, html) => `<div class="wag-call ${kind}"><div class="wag-call-t">${title}</div><div class="wag-call-b">${html}</div></div>`;
  const secH = (n, t, sub) => `<div class="wag-h"><span class="wag-hn">${n}</span><div><div class="wag-ht">${t}</div>${sub ? `<div class="wag-hs">${sub}</div>` : ''}</div></div>`;
  /* мокап окна браузера с «хлебными крошками» Meta */
  const brw = (crumb, rowsHtml) => `<div class="wag-win"><div class="wag-win-bar wag-brw"><span class="wag-win-dots"><i></i><i></i><i></i></span><span class="wag-crumb">${crumb}</span></div><div class="wag-win-body">${rowsHtml}</div></div>`;
  /* строка «поле Meta со значением» (hl — подсветить как «скопируй это») */
  const mf = (label, val, hl, btn) => `<div class="wag-mf ${hl ? 'hl' : ''}"><span class="wag-mflabel">${label}</span><span class="wag-mfval">${val}</span>${btn ? `<span class="wag-copychip">${btn}</span>` : ''}</div>`;

  const esWin = brw('facebook.com › Подключение WhatsApp Business', `
    <div class="wag-es"><span class="wag-esn">1</span><span>Вход через ваш Facebook</span></div>
    <div class="wag-es"><span class="wag-esn">2</span><span>Выбор бизнес-портфолио (или создать новое)</span></div>
    <div class="wag-es"><span class="wag-esn">3</span><span>Выбор / добавление номера WhatsApp</span></div>
    <div class="wag-es"><span class="wag-esn">4</span><span>Привязка карты для оплаты сообщений</span></div>
    <div class="wag-mf hl"><span class="wag-mflabel">Готово</span><span class="wag-mfval">реквизиты подставятся в Lumen автоматически</span></div>`);

  const apiSetupWin = brw('business.facebook.com › WhatsApp › API Setup', `
    ${mf('Phone number ID', '1239824009222121', true, '⧉')}
    ${mf('WhatsApp Business Account ID (WABA)', '1419979086730572', true, '⧉')}
    ${mf('Temporary access token', 'EAAG… (живёт 24 ч — нужен постоянный, шаг ниже)', false)}`);

  const tokenWin = brw('Business Settings › System Users › Generate token', `
    ${mf('Token expiration', 'Never — бессрочный', true)}
    ${mf('Assets', 'приложение + WABA · Full control', false)}
    ${mf('Permissions', 'whatsapp_business_messaging · whatsapp_business_management', true)}
    <div class="wag-winbtns"><span class="wag-buybtn">Generate token</span></div>`);

  const secretWin = brw('App Dashboard › App settings › Basic', `
    ${mf('App Secret', '•••••••••••••••• ', true, 'Show')}
    <div class="wag-shopnote">Нужен, чтобы Lumen проверял подпись входящих вебхуков (без него входящие отклоняются, 401).</div>`);

  const webhookWin = brw('App › WhatsApp › Configuration › Webhook', `
    <div class="wag-copy"><code>https://ваш-lumen.app/wa/webhook</code><span class="wag-copychip">⧉ Callback URL</span></div>
    <div class="wag-copy"><code>lumen-verify</code><span class="wag-copychip">⧉ Verify token</span></div>
    ${mf('Webhook fields → messages', 'Subscribe ✓', true)}
    <div class="wag-shopnote">«Verify and save» → у поля <b>messages</b> нажмите <b>Subscribe</b>. Без этого номер только <b>шлёт</b> — не принимает ответы клиентов и статусы доставки.</div>`);

  const faq = [
    ['Ошибка «Account does not exist in Cloud API»', 'Номер не зарегистрирован в Cloud API. Пройдите регистрацию номера (кнопка «Активация / коды» на карточке) — она создаёт аккаунт номера и задаёт PIN. Отдельно PIN в Meta ставить не нужно.'],
    ['Не приходят ответы клиентов и статусы доставки', 'Не настроен вебхук или номер не подписан на поле <b>messages</b>. Meta → App → WhatsApp → Configuration → вставьте Callback URL + Verify token → «Verify and save» → Subscribe на messages. Ещё нужен <b>App Secret</b> — иначе входящие отклоняются (401).'],
    ['Токен «протух» через сутки', 'Вы вставили <b>временный</b> токен из API Setup (живёт 24 ч). Нужен <b>постоянный</b> токен System User: Business Settings → System Users → Generate token → expiration <b>Never</b>, права whatsapp_business_messaging + management.'],
    ['Тест-номер не шлёт клиенту', 'Бесплатный тест-номер (+1 555…) отправляет только на номера из allow-list. Для клиентов купите <b>боевой</b> номер (кнопка «Купить Cloud API номер»), либо на время теста добавьте свой номер: API Setup → To → Manage phone number list.'],
    ['Сообщение не доставляется, если клиент писал давно', 'Вне 24-часового окна диалога Meta разрешает написать первым только <b>одобренным шаблоном</b> (HSM). Создайте шаблон в WhatsApp Manager → Message Templates и дождитесь аппрува.'],
    ['Кто и как платит за сообщения', 'Cloud API тарифицирует <b>Meta напрямую с карты</b>, привязанной к вашему WhatsApp Business (не с баланса Lumen). Подключите карту в Meta Business Manager → Billing / Payment settings.'],
    ['Чем Cloud API отличается от WhatsApp по QR', 'Cloud API — официальный канал: можно делать <b>массовые холодные</b> первые касания шаблонами, номер так не банится. QR-номера (серые) — только тёплые диалоги с согласившимися; рассылки с них запрещены. Идеально: холодный вход — Cloud API, дальше диалог — с личного номера.'],
  ];

  const body = `<div class="wag">
    <div class="wag-lead">WhatsApp Cloud API — <b>официальный</b> канал Meta. Единственный, с которого можно делать <b>массовые «холодные» первые касания</b> (шаблонами) без риска бана. Взамен требует разовой настройки в Meta (реквизиты + вебхук) и тарифицируется Meta напрямую с вашей карты.</div>

    <div class="wag-paths">
      <div class="wag-path">
        <div class="wag-ptag">Путь A · авто</div>
        <div class="wag-pt">Подключить WhatsApp Business</div>
        <div class="wag-pd">Embedded Signup: вход через Facebook, Meta сама создаёт связку и возвращает реквизиты. Быстрее всего.</div>
        <div class="wag-pmeta">Нужен доступ к Facebook Business · карта в Meta</div>
      </div>
      <div class="wag-path">
        <div class="wag-ptag alt">Путь B · вручную</div>
        <div class="wag-pt">Мастер подключения (шаг за шагом)</div>
        <div class="wag-pd">Купить/свой номер → вписать Phone Number ID, WABA ID, постоянный токен, App Secret → вебхук. Полный контроль.</div>
        <div class="wag-pmeta">≈ реквизиты из Meta · 10–15 минут</div>
      </div>
    </div>

    <div class="wag-sec">
      ${secH('A', 'Быстрый путь — Embedded Signup', 'Meta проведёт через вход и сама подставит реквизиты.')}
      <ol class="wag-ol">
        <li>В CRM (вкладка «Cloud API») нажмите <b>«Подключить WhatsApp Business»</b>.</li>
        <li>Войдите через Facebook → выберите/создайте бизнес-портфолио и номер WhatsApp.</li>
        <li>Привяжите карту для оплаты. Реквизиты (Phone Number ID, WABA, токен) подставятся автоматически.</li>
      </ol>
      ${esWin}
      ${call('tip', 'Когда выбрать', 'Embedded Signup — если у вас есть доступ к Facebook Business и вы хотите минимум ручной работы. Нет доступа / нужен полный контроль — путь B ниже.')}
    </div>

    <div class="wag-sec">
      ${secH('B', 'Ручной путь — мастер подключения', 'Полный контроль. В CRM это «Мастер подключения — шаг за шагом», ниже — что и где взять.')}

      <div class="wag-sub">Шаг 1. Реальный номер</div>
      <p class="wag-p">Нужен настоящий номер: бесплатный тест-номер (+1 555…) шлёт только на разрешённые номера. Купите виртуальный SMS-номер (<b>«Купить Cloud API номер»</b>) — код придёт в ленту OTP в CRM, зарегистрируйте номер в WhatsApp Business.</p>

      <div class="wag-sub">Шаг 2. Phone Number ID и WABA ID</div>
      <p class="wag-p">Meta → ваше приложение → <b>WhatsApp → API Setup</b>. Скопируйте два идентификатора и вставьте в мастере/карточке.</p>
      ${apiSetupWin}

      <div class="wag-sub">Шаг 3. Постоянный токен (System User)</div>
      <p class="wag-p">Business Settings → <b>System Users</b> → выберите/создайте юзера → <b>Add assets</b> (приложение + WABA, Full control) → <b>Generate token</b>.</p>
      ${tokenWin}
      ${call('warn', 'Токен показывается один раз', 'Meta покажет токен только при генерации — вставьте сразу. Обязательно expiration <b>Never</b> и права whatsapp_business_messaging + management, иначе отправка отвалится.')}

      <div class="wag-sub">Шаг 4. App Secret</div>
      <p class="wag-p">Meta App → <b>Settings → Basic</b> → поле <b>App Secret</b> → Show. Им Lumen проверяет подпись входящих вебхуков.</p>
      ${secretWin}

      <div class="wag-sub">Шаг 5. Вебхук — входящие, статусы, «Отписаться»</div>
      <p class="wag-p">Meta App → <b>WhatsApp → Configuration</b>: вставьте Callback URL + Verify token, «Verify and save», затем у поля <b>messages</b> нажмите <b>Subscribe</b>.</p>
      ${webhookWin}
      ${call('danger', 'Без вебхука канал «однобокий»', 'Без него номер только отправляет — не видит ответы клиентов, статусы доставки (нужны для аналитики рассылок) и клики «Отписаться». Настраивается один раз.')}

      <div class="wag-sub">Шаг 6. Проверка и боевой режим</div>
      <p class="wag-p">Нажмите <b>«Проверить подключение»</b> — Lumen спросит Meta, живо ли оно. Для тест-номера добавьте свой номер в allow-list (API Setup → To → Manage phone number list). Затем включите <b>боевой режим</b>.</p>
    </div>

    <div class="wag-sec">
      ${secH('$', 'Оплата — карта в Meta', 'Важно: платите не нам, а Meta напрямую.')}
      <p class="wag-p">Сообщения Cloud API тарифицирует <b>Meta</b> с карты, привязанной к вашему WhatsApp Business (не с баланса Lumen). Подключите карту: <b>Meta Business Manager → Billing / Payment settings</b>. Тариф зависит от страны и типа разговора (маркетинговый/сервисный/служебный).</p>
    </div>

    <div class="wag-sec">
      ${secH('C', 'Шаблоны и лимиты отправки', 'Как устроены холодные касания и рост лимита.')}
      <ul class="wag-rules">
        <li><b>Холодное первое касание — только одобренный шаблон (HSM).</b> Создайте в WhatsApp Manager → Message Templates и дождитесь аппрува Meta.</li>
        <li><b>Лимит растёт с качеством.</b> Новый номер стартует с ограниченного тира (напр. 250 → 1000 → 10k/день) и поднимается при хорошем рейтинге.</li>
        <li><b>Качество номера</b> (зелёный/жёлтый/красный) видно в WhatsApp Manager — следите, чтобы не срезали лимит.</li>
        <li><b>В 24-часовом окне</b> (клиент написал сам) можно отвечать свободным текстом; вне окна — только шаблоном.</li>
      </ul>
    </div>

    <div class="wag-sec">
      ${secH('✓', 'Тест и запуск', 'Финальная проверка.')}
      <p class="wag-p">Отправьте тестовый шаблон. Дошёл — канал готов к массовым «белым» касаниям. Дальше диалог удобно продолжать с личного номера (WhatsApp по QR), а холодный вход держать на Cloud API.</p>
    </div>

    <div class="wag-sec">
      ${secH('?', 'Частые проблемы', 'Всё, что чаще всего идёт не так при подключении Cloud API.')}
      <div class="wag-faq">${faq.map(f => `<details class="wag-fq"><summary>${f[0]}</summary><div class="wag-fa">${f[1]}</div></details>`).join('')}</div>
    </div>
  </div>`;

  return body;
}

function viberRich(){
  var steps=[
    ['Аккаунт Infobip','Зарегистрируйтесь на infobip.com (или войдите). Это BSP — официальный посредник Viber Business.'],
    ['API-ключ','Infobip → Developers → API Keys → Create. Скопируйте ключ и Base URL (вида xxxxx.api.infobip.com).'],
    ['Верификация отправителя','Infobip → Channels → Viber → запросите Viber Business sender (имя вашего бренда). Нужна бизнес-верификация (обычно 1–3 дня).'],
    ['Вебхук входящих','В настройках Viber-канала Infobip укажите Inbound webhook на адрес из Настроек Lumen — тогда ответы клиентов попадут в карточку лида.'],
    ['Заполнить поля','Внесите провайдера, API-ключ, Base URL и верифицированное имя-отправитель в Настройках Lumen → Viber и сохраните.'],
  ];
  var shots={1:'/assets/infobip/step-1-ru.png',2:'/assets/infobip/step-2-ru.png',3:'/assets/infobip/step-3-ru.png'};
  return '<div class="wag">'
    +'<div class="wag-lead">Viber подключается через BSP (официального посредника) — по умолчанию Infobip. У агентства один Viber-отправитель (имя бренда), а входящие ответы маршрутизируются в карточку нужного брокера.</div>'
    +'<div class="wag-sec"><div class="wag-h"><span class="wag-hn">✦</span><div><div class="wag-ht">Как это работает</div><div class="wag-hs">Один отправитель — много брокеров</div></div></div>'
    +'<p class="wag-p">У агентства <b>один Viber-sender</b> (напр. «TargetPoint»). Все исходящие Viber-касания идут от этого имени — отдельный номер на каждого брокера не нужен. <b>Входящие ответы</b> клиента прилетают на вебхук Lumen → мы находим лида по номеру и маршрутизируем в карточку его брокера. <b>Персонализация</b> — в тексте (имя брокера, подпись), а не в отправителе.</p></div>'
    +'<div class="wag-sec"><div class="wag-h"><span class="wag-hn">→</span><div><div class="wag-ht">Подключение — по шагам</div></div></div>'
    +'<div class="viber-steps">'+steps.map(function(s,i){return '<div class="viber-step"><div class="vs-num">'+(i+1)+'</div><div class="vs-body"><div class="vs-t">'+s[0]+'</div><div class="vs-d">'+s[1]+'</div>'+(shots[i+1]?'<div class="vs-shot"><img src="'+shots[i+1]+'?v=2" alt="Шаг '+(i+1)+'" loading="lazy" onclick="window.lumenZoom&&lumenZoom(this)"></div>':'')+'</div></div>';}).join('')+'</div></div>'
    +'</div>';
}

  var RICH = { wanumbers: waQrGuideRich, tgchannel: tgQrGuideRich, telephony: telGuideRich, wacloud: cloudGuideRich, albato: albatoGuide, viber: viberRich };
  if (typeof module !== 'undefined' && module.exports) module.exports = RICH;
  if (typeof window !== 'undefined') window.LUMEN_RICH = RICH;
})();
