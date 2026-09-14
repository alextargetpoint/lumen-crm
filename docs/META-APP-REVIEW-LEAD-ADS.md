# Прохождение Meta App Review с первого раза — Lumen (Facebook Lead Ads)

Гайд под сценарий: Lumen подключается к Facebook-страницам агентства недвижимости, получает лид-формы
в реальном времени через `leadgen`-вебхук и показывает лид в CRM с привязкой к кампании/объявлению.

> Установка Meta по `leads_retrieval`: это персональные данные клиентов → ревью строгое. Нужно доказать
> три вещи: **куда попадают лиды, кто их видит и зачем**. Остальное — как доказать без придирок.

---

## 0. Модель, которую надо понять до старта
1. **Разрешение ≠ доступ.** У каждого пермишена два уровня: **Standard Access** (только ваши тестовые
   страницы/юзеры) и **Advanced Access** (реальные клиенты). Для боевого продукта нужен Advanced —
   а он невозможен без **Business Verification** и **App Review** по каждому пермишену.
2. **App Review проверяет не код, а видео.** Ревьюер смотрит скринкаст и воспроизводит сценарий у себя.
3. **Dev-режим лиды не отдаёт.** Полный доступ к лидам — только в **Live mode**.
4. **Вебхук обязателен.** Демо на polling заваливают — нужен живой `leadgen`-вебхук в кадре.
5. **Планируйте по календарю.** Business Verification — дни; App Review — дни-недели; закладывайте буфер.

---

## 1. Разрешения: что запрашивать и как обосновать (принцип наименьших привилегий)

| Permission | Зачем в Lumen | Advanced |
|---|---|---|
| `leads_retrieval` | Чтение данных лида (имя, телефон, email, ответы формы) по `leadgen_id`. | Да |
| `pages_show_list` | Показать пользователю его Страницы для выбора при подключении. | Да |
| `pages_read_engagement` | Метаданные Страницы (название/категория) — подтвердить подключение. | Да |
| `pages_manage_metadata` | Подписка на вебхук Страницы (`subscribed_apps`, `leadgen`) — без неё вебхук не приходит. | Да |
| `business_management` | Подключение Страниц, принадлежащих Business Manager клиента. | Да |
| `ads_read` | Атрибуция: имя/ID кампании, ad set, объявления по лиду. | Да |

> НЕ берите `pages_manage_ads`/`ads_management`, если НЕ управляете рекламой — только `ads_read`.
> Лишний пермишен = лишний повод для отказа. Сверяйте актуальную версию Graph API перед сабмитом.

### Готовые тексты обоснования («Tell us how you'll use this permission»)
Пишите про конкретные поля и хранилище, от первого лица. Замените домены/названия на свои.

- **leads_retrieval:** *Lumen is a CRM for real-estate agencies. When a person submits an Instant Lead
  Form on a client's Facebook Page, our app receives a `leadgen` webhook with the `leadgen_id`, then calls
  the Graph API to retrieve the fields the agency configured: full name, phone, email, and custom
  qualifying answers (budget, location, property type). We store them in the agency's private CRM
  workspace so its agents can contact the lead. Only authenticated users of that workspace can view it.
  Leads are retained until the agency deletes them or closes the account, and are removed on
  data-deletion request. We do not sell or share lead data.*
- **pages_show_list:** *During onboarding an agency admin connects Lumen to Facebook. We use
  `pages_show_list` to display the Pages they manage so they can select which to connect for lead
  ingestion.*
- **pages_read_engagement:** *After a Page is selected we read its name and category to label the
  connected Page in the CRM and let the user confirm the correct Page. We do not read post content.*
- **pages_manage_metadata:** *We subscribe our app to the connected Page's `leadgen` webhook (POST to
  `subscribed_apps` with `subscribed_fields=leadgen`) so we receive real-time new-lead notifications. We
  do not modify other Page settings.*
- **business_management:** *Our users are agencies whose Pages/lead forms are owned by their Meta
  Business account. `business_management` lets them connect Business-owned Pages during onboarding.*
- **ads_read:** *For each lead we read the associated campaign, ad set and ad name/ID to display
  attribution (which campaign/creative produced the lead). We only read ad metadata; we do not create or
  modify ads.*

**Правило:** текст обоснования = скринкаст = реальное поведение приложения, один-в-один по смыслу.

---

## 2. Business Verification (делать ПЕРВЫМ — бутылочное горлышко)
- Привязать приложение к **Business Manager** (App → Settings → Advanced).
- **Юрдокументы**: регистрация компании + налоговая/утилити-счёт/банк-выписка на юрлицо, **не старше 12
  мес**, с точным юрназванием и адресом. Meta часто требует подтвердить и существование, и деятельность
  (два разных документа).
- **OCR-сверка «до запятой»**: название/адрес в Business Manager = в документах = в WHOIS домена = в
  Privacy Policy. «LLC» vs «L.L.C.», лишняя запятая, сокращение города → авто-отказ. Приведите к
  единому виду заранее.
- **Domain Verification** (Business Settings → Brand Safety → Domains): DNS TXT (надёжнее), meta-тег в
  `<head>` или HTML-файл в корне. Домен из App Domains / Privacy / OAuth-редиректа должен быть верифицирован.

---

## 3. Настройки приложения ДО подачи (App Dashboard → Settings)

| Поле | Значение для Lumen |
|---|---|
| App Domains | Прод-домен (совпадает с OAuth-редиректом и верифицирован) |
| Privacy Policy URL | Публичная политика с явным описанием лид-данных (см. §6) |
| User Data Deletion | **Callback URL** (боевой POST) или Instructions URL — одно обязательно |
| Terms of Service URL | Указать (повышает доверие) |
| App Icon | 1024×1024 PNG, качественный |
| Category | Business and Pages |
| App Mode | **Live** (dev-режим лиды не отдаёт) |
| Webhooks | Объект **Page**, поле **`leadgen`** подписано, verify-challenge проходит |

**Data Deletion Callback** (рекомендуется для SaaS): Meta шлёт `signed_request` при удалении приложения
пользователем. Сервер верифицирует подпись, удаляет данные, возвращает
`{ "url": "...status page...", "confirmation_code": "..." }`. Эндпоинт должен быть живым во время ревью.

**Подписка Страницы на вебхук** (частая забытая деталь): `POST {page-id}/subscribed_apps` с page access
token и `subscribed_fields=leadgen`. На входящий вебхук отвечать **HTTP 200 сразу**, работу — асинхронно.
В вебхуке приходит только `leadgen_id` → поля тянутся вторым авторизованным вызовом Graph API.

---

## 4. App Review + скринкаст

### Пошаговые инструкции ревьюеру (Verification details, готовый текст)
> Test app: Lumen CRM. Test login below.
> 1. Open https://app.lumen247.com and log in with the test credentials provided.
> 2. Settings → Integrations → «Connect Facebook».
> 3. Click «Continue with Facebook» — Business Login dialog opens.
> 4. Grant all requested permissions (pages_show_list, pages_read_engagement, pages_manage_metadata,
>    leads_retrieval, business_management, ads_read).
> 5. A list of Pages appears (pages_show_list). Select the test Page «Lumen Test Realty».
> 6. Lumen subscribes the Page to the leadgen webhook (pages_manage_metadata) → «Connected».
> 7. In a second tab open the Meta Lead Ads Testing Tool, select the test Page + form, submit a test lead.
> 8. Return to Lumen → «Leads». Within seconds the new lead appears with name/phone/email
>    (leads_retrieval) and its campaign/ad name (ads_read).

### Требования к скринкасту (жёсткие)
- 1080p+, курсор виден всё время.
- **Начинать с «разлогинен»**, показать весь логин-флоу (не начинать залогиненным — топ-причина отказа).
- Consent-экран крупно, видны ВСЕ скоупы, пользователь их активно выдаёт.
- Каждый пермишен и запрошен, и **использован** end-to-end.
- **Живой тестовый лид прилетает через вебхук** во время демо и появляется в CRM.
- Английский UI или английские субтитры; аннотации на ключевых шагах; без озвучки.
- Тестовое окружение работает для чистого ревьюерского аккаунта.

### Shot-list (1.5–3 мин)
1. Lumen «разлогинен» → 2. логин тест-кредами → 3. Settings → Integrations → Connect Facebook →
4. «Continue with Facebook» (Business Login) → 5. **consent: все скоупы крупно**, выдать → 6. список
Страниц (pages_show_list), выбрать «Lumen Test Realty» → 7. подписка на leadgen (pages_manage_metadata),
«Connected» + название/категория (pages_read_engagement) → 8. Lead Ads Testing Tool: submit тест-лид →
9. Lumen → Leads: **лид появляется в реальном времени** — имя/телефон/email (leads_retrieval) +
кампания/объявление (ads_read) → 10. карточка лида: данные видны только внутри воркспейса.

---

## 5. Тестовые доступы
1. Рабочий логин Lumen (email+пароль) с готовым воркспейсом — в Verification details; проверить вход с
   чистого профиля; 2FA/капча не должны мешать ревьюеру.
2. **Test User** приложения (Dashboard → Roles → Test Users) — на его тестовой Странице пермишены
   работают даже в Standard Access.
3. Тестовая Страница «Lumen Test Realty» + Instant Lead Form (name/phone/email + бюджет/локация),
   желательно с атрибуцией (тест-кампания → `ads_read` покажет источник).
4. **Lead Ads Testing Tool** (`https://developers.facebook.com/tools/lead-ads-testing`) генерит тест-лид
   без бюджета. Нюанс: один тест-лид на форму за раз — **удаляйте предыдущий** перед повтором.

---

## 6. Privacy & Legal (реально читают)
Privacy Policy ОБЯЗАНА явно содержать:
1. **Какие данные**: лид-формы FB — имя, телефон, email, ответы; метаданные Страницы; атрибуция рекламы.
2. **Цель**: дать агентству его лиды в CRM для связи с клиентами + аналитика рекламы; без перепродажи.
3. **Retention** конкретно: «храним до удаления агентством/закрытия аккаунта; на запрос — стираем за N
   дней». Упомянуть, что Facebook отдаёт лид ограниченное время (~90 дней).
4. **Третьи стороны/субпроцессоры**: хостинг/БД; данные не продаются.
5. **Права**: доступ, исправление, удаление, экспорт — и как воспользоваться.
6. **Удаление данных**: как запросить + ссылка на Data Deletion (совпадает с настройкой в Dashboard).
7. **Оператор данных**: юрназвание/адрес = как в Business Verification.

**GDPR/UAE:** лиды из ЕС → GDPR (правовое основание, права субъектов, **DPA** между Lumen-процессором и
агентством-контроллером). ОАЭ → **PDPL** (+ DIFC/ADGM при необходимости), законность трансграничной
передачи. Явно позиционировать Lumen как **data processor** от имени агентства (контроллера) — корректная
и «безопасная» для ревью модель. Соблюдать Meta Platform Terms по использованию данных платформы.

---

## 7. Топ причин отказа → превентив
- Видео без живого лида → снять реальный тест-лид, прилетающий в CRM.
- Демо на polling без вебхука → показать подписку на leadgen и приход вебхука в реальном времени.
- Видео начинается залогиненным / нет consent → снимать с «разлогинен», показать весь OAuth.
- Generic-обоснование → тексты §1 с полями/хранилищем/доступом.
- Privacy без лид-данных/retention → §6.
- Business Verification не завершён → делать первым, данные к единому виду.
- Страница в демо не связана с заявленным бизнесом → тестовая Страница под тем же Business.
- Тест-креды не работают / 2FA → проверить с чистого профиля, снять 2FA для теста.
- Лишние `*_manage_ads` → только `ads_read`.
- Не тот язык без субтитров → английский UI или англ. субтитры.
- Data Deletion callback не отвечает → поднять живой эндпоинт до подачи.

---

## 8. Финальный чек-лист
**Бизнес/домен:** Business Manager привязан · Business Verification Verified · юрданные совпадают везде ·
домен верифицирован.
**Настройки:** App Domains · Privacy URL живой · Data Deletion callback отвечает · App Icon 1024² ·
Category Business and Pages · Webhooks Page/`leadgen` verify-challenge · тест-Страница подписана ·
**Live mode** · актуальная Graph API.
**Пермишены:** ровно 6 нужных, без лишних, у каждого конкретное обоснование + Advanced Access.
**Скринкаст:** 1080p+, курсор · с «разлогинен» · consent со всеми скоупами · каждый пермишен использован ·
живой тест-лид через вебхук в CRM · англ. UI/субтитры · совпадает с текстом заявки.
**Доступ:** креды в Verification details проверены с чистого профиля · 2FA не мешает · инструкция
воспроизведения · тест-Страница+форма готовы (старый тест-лид удалён).
**Легал:** Privacy (данные/цель/retention/третьи/права/удаление/оператор) · GDPR/UAE + DPA · Meta Platform
Terms.

---

### Источники
Meta Lead Ads (Marketing API) · App Review Screen Recordings · App Review Introduction · Data Deletion
Callback · LeadSync leads_retrieval guide · Singh Amandeep (leads_retrieval / screencast 2026 / data
deletion) · Wati Business Verification docs · Meta Business Verification 2025.
