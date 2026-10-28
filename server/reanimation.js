/* ──────────────────────────────────────────────────────────────────────────
   Lumen — ROI реанимации спящей базы (дашборд «сколько денег вернули»).
   Прямой ответ на маркетинг конкурента Soul AI («ROI ×765»): показываем на
   РЕАЛЬНЫХ данных агентства — разбуженные лиды, ответы, квалы, сделки, выручка
   и во сколько обошлась бы та же работа руками брокера.

   Чистая логика (принимает db) → юнит-тестируемо. Атрибуция: лид «реанимирован»,
   если он был получателем wake-кампании (db.campaigns[].recipients) ИЛИ по нему
   был голосовой ИИ-звонок (lead.voiceCalls). «Сделка из реанимации» = такой лид
   сейчас в стадии сделки (или есть dealAt/dealValue). Выручка = сумма dealCommission.
   ────────────────────────────────────────────────────────────────────────── */

const QUAL_STAGES = ['qualified', 'handover', 'viewing', 'deal'];

function roiStats(db, opts) {
  opts = opts || {};
  const brokerHourRate = opts.brokerHourRate != null ? +opts.brokerHourRate : 15;   /* $/час — во сколько оценить ручную работу */
  const secPerVoice = opts.secPerVoice != null ? +opts.secPerVoice : 360;           /* ~6 мин живого разговора экономит ИИ */
  const secPerTouch = opts.secPerTouch != null ? +opts.secPerTouch : 75;            /* ~1.25 мин на ручное касание в переписке */

  const leads = db.leads || [];
  const byId = Object.create(null);
  for (const l of leads) byId[l.id] = l;

  /* реанимированные = получатели кампаний ∪ лиды с голос-звонками */
  const set = new Set();
  let touches = 0, cReplied = 0, cQualified = 0, cUnsub = 0;
  for (const c of (db.campaigns || [])) {
    for (const id of (c.recipients || [])) set.add(id);
    touches += Math.max(0, +c.cursor || 0);                                          /* cursor = сколько касаний отправлено */
    const st = c.stats || {};
    cReplied += +st.replied || 0; cQualified += +st.qualified || 0; cUnsub += +st.unsubscribed || 0;
  }
  let voiceCalls = 0, voiceReached = 0;
  for (const l of leads) {
    const vc = l.voiceCalls || [];
    voiceCalls += vc.length;
    voiceReached += vc.filter(v => v && v.reached).length;
    if (vc.length || l.voiceCall) set.add(l.id);
  }

  const reanimated = [...set].map(id => byId[id]).filter(Boolean);
  const n = reanimated.length;
  const msgs = db.messages || [];
  /* ответы/квалы: берём МАКС из счётчиков кампаний и фактического состояния лидов (счётчики могут отставать) */
  const repliedLeads = reanimated.filter(l => msgs.some(m => m.leadId === l.id && m.dir === 'in')).length;
  const replied = Math.max(cReplied, repliedLeads);
  const qualifiedLeads = reanimated.filter(l => QUAL_STAGES.includes(l.stage)).length;
  const qualified = Math.max(cQualified, qualifiedLeads);
  const dealsArr = reanimated.filter(l => l.stage === 'deal' || l.dealAt || l.dealValue);
  const revenue = Math.round(dealsArr.reduce((s, l) => s + (+l.dealCommission || +l.dealValue || 0), 0));

  const hoursSaved = Math.round((voiceReached * secPerVoice + touches * secPerTouch) / 3600);
  const savedVsBroker = Math.round(hoursSaved * brokerHourRate);
  const pct = (a, b) => (b ? +(a / b * 100).toFixed(1) : 0);

  return {
    reanimated: n,
    touches, voiceCalls, voiceReached,
    replied, qualified, deals: dealsArr.length, unsubscribed: cUnsub,
    revenue, hoursSaved, savedVsBroker,
    replyRate: pct(replied, n),
    qualRate: pct(qualified, n),
    dealRate: pct(dealsArr.length, n),
    /* ROI-рамка «как у конкурента»: выручка относительно стоимости той же работы руками.
       Честно: null, если экономии ещё нет (нечего делить). */
    roiVsManual: savedVsBroker > 0 ? +(revenue / savedVsBroker).toFixed(1) : null,
    brokerHourRate,
  };
}

module.exports = { roiStats, QUAL_STAGES };
