/* ──────────────────────────────────────────────────────────────────────────
   Lumen — «Помощник брокера». Анализирует карточку/переписку/квалы, находит
   ПРОПУЩЕННЫЕ действия и предлагает быстрые исправления. Рекомендация ≠ статус:
   анализ НЕ меняет карточку, изменение — только по явному действию + серверная
   перепроверка. Scope v1: стадии 'dialog' и 'qualified' (не трогаем handover/
   viewing/deal/sleeping/lost). Канонические стадии: new/touch/dialog/qualified/
   handover/viewing/deal/sleeping/lost.

   Движок детерминированный и ЗАЗЕМЛЁННЫЙ: критерии берутся из уже извлечённых
   квалов (у каждого есть .quote — цитата клиента = источник) и реальных сообщений.
   LLM не обязателен (хук llm опционален); сервер всегда проверяет наличие источника.
   ────────────────────────────────────────────────────────────────────────── */

const RULES_VERSION = 'v1';
const DEFAULT_CRITERIA = ['interest', 'contact', 'down_payment'];   /* обязательные по умолчанию */
const CRIT_LABEL = {
  interest: 'Интерес к недвижимости', contact: 'Состоявшийся контакт', down_payment: 'Возможность первого взноса',
  budget: 'Бюджет', geo: 'География', type: 'Тип объекта', timeline: 'Срок покупки',
};
const DOWNPAY_RE = /(первоначальн|первый взнос|первонач|down\s?payment|взнос\s*\d|внести\s*\d|могу\s*внести|downpayment|первый\s*платёж)/i;

/* конфиг критериев для организации/воронки (мягкий дефолт; настраивается в settings.assistant) */
function criteriaConfig(db) {
  const c = (db.settings && db.settings.assistant && db.settings.assistant.criteria);
  const required = (Array.isArray(c) && c.length) ? c.slice() : DEFAULT_CRITERIA.slice();
  return { required };
}

function inboundMsgs(db, leadId) { return (db.messages || []).filter(m => m.leadId === leadId && m.dir === 'in'); }
function msgEvidence(m) { return { source_type: 'message', source_id: m.id || ('msg_' + m.at), quote: String(m.text || '').slice(0, 160), at: m.at || 0 }; }
function qualEvidence(key, q) { return { source_type: q.quote ? 'message' : 'field', source_id: 'qual_' + key, quote: String(q.quote || q.value || '').slice(0, 160), at: q.at || 0 }; }

/* оценить один критерий → {key,status:confirmed|missing|contradictory,evidence:[]} */
function evalCriterion(db, lead, key) {
  const q = (lead.quals || {});
  const ev = [];
  if (key === 'interest') {
    const src = q.purpose || q.type; // клиент сам сказал цель/тип → интерес подтверждён цитатой
    if (src && (src.value || src.quote)) return { key, status: 'confirmed', evidence: [qualEvidence(q.purpose ? 'purpose' : 'type', src)] };
    return { key, status: 'missing', evidence: [] };
  }
  if (key === 'contact') {
    const ins = inboundMsgs(db, lead.id);   // контакт = КЛИЕНТ ответил (не только исходящее от нас)
    if (ins.length) return { key, status: 'confirmed', evidence: [msgEvidence(ins[ins.length - 1])] };
    return { key, status: 'missing', evidence: [] };
  }
  if (key === 'down_payment') {
    const ins = inboundMsgs(db, lead.id);
    const hit = ins.find(m => DOWNPAY_RE.test(String(m.text || '')));
    if (hit) return { key, status: 'confirmed', evidence: [msgEvidence(hit)] };
    // бюджет ≠ первый взнос (ТЗ) → наличие бюджета НЕ подтверждает взнос, но отметим как основание для уточнения
    return { key, status: 'missing', evidence: [] };
  }
  // доп-критерии = по квалам/полям
  if (key === 'budget') { const b = q.budget; return (b && (b.num || b.value)) ? { key, status: 'confirmed', evidence: [qualEvidence('budget', b)] } : { key, status: 'missing', evidence: [] }; }
  if (key === 'type') { const t = q.type; return (t && t.value) ? { key, status: 'confirmed', evidence: [qualEvidence('type', t)] } : { key, status: 'missing', evidence: [] }; }
  if (key === 'timeline') { const t = q.timeline; return (t && t.value) ? { key, status: 'confirmed', evidence: [qualEvidence('timeline', t)] } : { key, status: 'missing', evidence: [] }; }
  if (key === 'geo') { return lead.geo ? { key, status: 'confirmed', evidence: [{ source_type: 'field', source_id: 'field_geo', quote: String(lead.geo), at: 0 }] } : { key, status: 'missing', evidence: [] }; }
  return { key, status: 'missing', evidence: [] };
}

/* ревизия значимых данных (для детекта устаревания и дедупа) */
function sourceRevision(db, lead) {
  const ins = inboundMsgs(db, lead.id);
  const q = lead.quals || {};
  const qsig = ['purpose', 'timeline', 'budget', 'type'].map(k => (q[k] && (q[k].value || '')) || '').join('|');
  return [lead.stage, lead.broker || '', ins.length, (ins[ins.length - 1] || {}).at || 0, qsig].join('~');
}

/* ЧИСТЫЙ АНАЛИЗ: вернуть драфт рекомендации или null. НЕ мутирует карточку. */
function analyzeLead(db, lead, opts) {
  opts = opts || {};
  if (!lead || !lead.id) return null;
  const stage = lead.stage;
  if (stage !== 'dialog' && stage !== 'qualified') return null;   // v1 scope

  const cfg = criteriaConfig(db);
  const rev = sourceRevision(db, lead);
  const base = { leadId: lead.id, sourceRevision: rev, rulesVersion: RULES_VERSION, modelVersion: opts.modelVersion || 'rule-' + RULES_VERSION };

  if (stage === 'dialog') {
    const criteria = cfg.required.map(k => evalCriterion(db, lead, k));
    const missing = criteria.filter(c => c.status === 'missing').map(c => c.key);
    const contra = criteria.filter(c => c.status === 'contradictory').map(c => c.key);
    if (!missing.length && !contra.length) {
      return Object.assign(base, {
        type: 'qualify', expectedStageId: 'qualified', expectedAssigneeId: lead.broker || null,
        summary: 'Подтверждены критерии квалификации',
        criteria, missing_fields: [], contradictions: [],
        deduplicationKey: lead.id + ':qualify',
      });
    }
    // не хватает критериев → уточнить (задача)
    return Object.assign(base, {
      type: 'clarify_information', expectedStageId: null, expectedAssigneeId: lead.broker || null,
      summary: 'Не хватает: ' + missing.map(k => (CRIT_LABEL[k] || k).toLowerCase()).join(', '),
      criteria, missing_fields: missing, contradictions: contra,
      deduplicationKey: lead.id + ':clarify:' + missing.sort().join(','),
    });
  }

  // stage === 'qualified'
  const hasBroker = !!lead.broker && lead.broker !== 'owner';
  return Object.assign(base, {
    type: 'assign_broker', expectedStageId: 'handover', expectedAssigneeId: lead.broker || null,
    summary: hasBroker ? 'Подтвердите передачу брокеру' : 'Назначьте брокера и передайте заявку',
    needsBroker: !hasBroker,
    criteria: [], missing_fields: [], contradictions: [],
    deduplicationKey: lead.id + ':assign',
  });
}

/* ───────── ХРАНЕНИЕ рекомендаций (db.assistantRecs[]) ───────── */
function store(db) { return (db.assistantRecs = db.assistantRecs || []); }
function activeStatuses() { return ['pending', 'snoozed']; }

/* пересобрать рекомендацию по лиду: upsert pending / закрыть устаревшую (stale) / уважать dismissed+snoozed */
function reconcileLead(db, lead, now) {
  now = now || Date.now();
  const recs = store(db);
  const draft = analyzeLead(db, lead);
  const existing = recs.filter(r => r.leadId === lead.id);

  // закрыть активные, которые больше не соответствуют (стадия сменилась / условие ушло)
  existing.forEach(r => {
    if (r.status !== 'pending' && r.status !== 'snoozed') return;
    if (!draft || draft.deduplicationKey !== r.deduplicationKey) { r.status = 'stale'; r.updatedAt = now; r.resolvedAt = now; }
  });
  if (!draft) return null;

  // уже есть такая же (по dedup) и dismissed → не воскрешаем, пока ревизия не изменилась существенно
  const dismissed = existing.find(r => r.deduplicationKey === draft.deduplicationKey && r.status === 'dismissed');
  if (dismissed && dismissed.sourceRevision === draft.sourceRevision) return null;

  let rec = existing.find(r => r.deduplicationKey === draft.deduplicationKey && (r.status === 'pending' || r.status === 'snoozed'));
  if (rec) {
    // обновить основания/ревизию; снятие snooze по сроку делает getQueue
    Object.assign(rec, { summary: draft.summary, criteria: draft.criteria, missing_fields: draft.missing_fields, contradictions: draft.contradictions, expectedStageId: draft.expectedStageId, expectedAssigneeId: draft.expectedAssigneeId, needsBroker: draft.needsBroker, sourceRevision: draft.sourceRevision, updatedAt: now, version: (rec.version || 1) + 1 });
    return rec;
  }
  rec = Object.assign({
    id: 'rec_' + Math.random().toString(16).slice(2, 10),
    organizationId: (db.settings && db.settings.agency && db.settings.agency.id) || 'org',
    pipelineId: 'default', status: 'pending', version: 1,
    createdAt: now, updatedAt: now, resolvedAt: null, resolvedBy: null, actionId: null, snoozedUntil: null,
  }, draft);
  recs.unshift(rec);
  return rec;
}

/* пересобрать по набору лидов (ленивый анализ при чтении очереди); вернуть сколько активных */
function reconcileMany(db, leads, now) { now = now || Date.now(); leads.forEach(l => reconcileLead(db, l, now)); }

/* активная очередь для пользователя (canSee — предикат видимости лида) */
function getQueue(db, canSee, now) {
  now = now || Date.now();
  const byId = Object.create(null); (db.leads || []).forEach(l => byId[l.id] = l);
  return store(db).filter(r => {
    if (r.status === 'snoozed' && r.snoozedUntil && r.snoozedUntil <= now) { r.status = 'pending'; r.updatedAt = now; }   // проснулся
    if (r.status !== 'pending') return false;
    const lead = byId[r.leadId]; if (!lead || !canSee(lead)) return false;
    return true;
  }).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

module.exports = {
  RULES_VERSION, DEFAULT_CRITERIA, CRIT_LABEL, criteriaConfig,
  evalCriterion, sourceRevision, analyzeLead, reconcileLead, reconcileMany, getQueue, store, activeStatuses,
};
