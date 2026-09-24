/* Lumen CRM — Ферма: движок прогрева номеров (Р3).
   Новый номер нельзя сразу отдавать в аренду — WhatsApp/Telegram банят «холодные» аккаунты
   при первой же активности. Прогрев = плавная имитация живого юзера 10-14 дней:
   номера пула пишут друг другу и seed-аккаунтам, вступают в группы, принимают входящие,
   исходящие наращиваются по расписанию. По завершении → статус ready (готов к выдаче).

   Здесь — РАСПИСАНИЕ и СОСТОЯНИЕ (детерминированно, тестируемо). Реальная отправка —
   хук executeActions() к WA/TG-воркерам (пока логируется; подключим воркеры в след. релизе). */

const farmSvc = require('./farm');
const store = require('./store');
const DAY = 864e5;

/* дефолтный план: 14 дней, плавный рост исходящих; правится в settings.warmup */
function plan() {
  const f = farmSvc.farm();
  const w = (f.settings.warmup = f.settings.warmup || {});
  w.days = w.days || 14;
  w.rampOut = w.rampOut || [1, 2, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 22, 26]; /* исходящих/день по дням */
  w.joinGroupsBy = w.joinGroupsBy || 3;   /* к какому дню вступить в группы */
  return w;
}

/* поставить номер на прогрев */
function enroll(numberId) {
  const n = farmSvc.findNumber(numberId);
  if (!n) return { error: 'номер не найден' };
  if (n.wa.status !== 'ready' && n.wa.status !== 'provisioning' && n.wa.status !== 'warming') return { error: 'номер не в состоянии для прогрева (нужен свежезарег.)' };
  n.warm = { enrolledAt: Date.now(), day: 1, done: false, actionsDone: 0, log: [] };
  n.wa.status = 'warming';
  if (n.tg.status === 'ready') n.tg.status = 'warming';
  farmSvc.farm().log.unshift({ at: Date.now(), action: 'warm.enroll', numberId });
  store.saveRegistry();
  return { ok: true, number: n };
}

/* текущий день прогрева по времени */
function dayOf(n) { if (!n.warm || !n.warm.enrolledAt) return 0; return Math.floor((Date.now() - n.warm.enrolledAt) / DAY) + 1; }
function targetToday(n) { const w = plan(); const d = Math.min(dayOf(n), w.days); return w.rampOut[d - 1] || 0; }

/* фразы прогрева — короткие, живые, разнообразные (номера пула переписываются между собой) */
const WARM_PHRASES = [
  'Привет! Как дела?', 'Добрый день 🙂', 'Спасибо большое!', 'Хорошо, договорились', 'Понял, спасибо',
  'Доброе утро', 'Как погода у вас?', 'Отлично, до связи', 'Принял', 'Согласен', 'Ок, супер',
  'Рад слышать', 'Всё в силе?', 'Да, конечно', 'Хорошего дня!', 'Спасибо, взаимно',
];
/* реальный отправитель: (fromPhone, toPhone, text) => Promise. Ставится из index.js (через WA-воркер). */
let warmSender = null;
function setWarmSender(fn) { warmSender = fn; }

/* отправка дневной нормы: warming-номер пишет `count` сообщений пирами пула через воркер.
   Fire-and-forget (не блокируем тик). Если отправитель не задан / номер не залинкован — молча 0. */
function executeActions(n, count) {
  const f = farmSvc.farm();
  const peers = f.numbers.filter(x => x.id !== n.id && x.phone && ['warming', 'ready', 'assigned'].includes(x.wa.status));
  if (!warmSender || !n.phone || !peers.length) return { sent: 0, simulated: true };
  const base = (n.warm && n.warm.actionsDone) || 0;
  let fired = 0;
  for (let i = 0; i < count; i++) {
    const peer = peers[(base + i) % peers.length];
    const text = WARM_PHRASES[(base + i) % WARM_PHRASES.length];
    try { const r = warmSender(n.phone, peer.phone, text); if (r && r.catch) r.catch(() => {}); fired++; }
    catch (e) { break; }   /* воркер недоступен — прекращаем на сегодня */
  }
  return { sent: fired, simulated: !warmSender };
}

/* тик прогрева: продвинуть все warming-номера, выполнить дневную норму, завершить готовые */
function tick() {
  const f = farmSvc.farm();
  const out = { advanced: 0, graduated: 0, acted: 0 };
  const w = plan();
  for (const n of f.numbers) {
    if (n.wa.status !== 'warming' || !n.warm) continue;
    const d = dayOf(n);
    /* выполнить дневную норму исходящих (идемпотентно по дню) */
    if (n.warm.day !== d) { n.warm.day = d; }
    const need = targetToday(n);
    if (need > 0 && (n.warm.lastActedDay !== d)) {
      const r = executeActions(n, need);
      n.warm.actionsDone += r.sent || 0; n.warm.lastActedDay = d;
      n.warm.log.unshift({ at: Date.now(), day: d, sent: r.sent });
      if (n.warm.log.length > 40) n.warm.log.length = 40;
      out.acted += r.sent || 0;
    }
    out.advanced++;
    /* выпуск: прогрет план целиком → ready */
    if (d > w.days) {
      n.warm.done = true; n.wa.status = 'ready';
      if (n.tg.status === 'warming') n.tg.status = 'ready';
      farmSvc.farm().log.unshift({ at: Date.now(), action: 'warm.graduate', numberId: n.id });
      out.graduated++;
    }
  }
  if (out.advanced || out.graduated) store.saveRegistry();
  return out;
}

/* сводка прогрева для UI */
function summary() {
  const f = farmSvc.farm(); const w = plan();
  const warming = f.numbers.filter(n => n.wa.status === 'warming' && n.warm);
  return {
    plan: { days: w.days },
    warming: warming.map(n => ({ id: n.id, phone: n.phone, day: Math.min(dayOf(n), w.days), of: w.days, target: targetToday(n), done: n.warm.actionsDone })),
    count: warming.length,
  };
}

module.exports = { plan, enroll, tick, summary, dayOf, targetToday, setWarmSender };
