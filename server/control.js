/* ═══════════════════════════════════════════════════════════════════════
   Пульт контроля основателя — движок рисков (Фаза 1-3 блюпринта).
   Чистые функции над db: сканируют состояние и возвращают то, что требует
   внимания руководителя. Ничего не мутируют (кроме detectLeak-хука ниже,
   вызываемого явно). Тестируется изолированно харнессом.
   ═══════════════════════════════════════════════════════════════════════ */

const ACTIVE_STAGES = ['touch', 'dialog', 'qualified', 'handover', 'viewing'];
const CLOSED_STAGES = ['deal', 'lost'];

/* пороги (переопределяются db.settings.control) */
function cfg(db) {
  const c = (db.settings && db.settings.control) || {};
  return {
    vipBudget: c.vipBudget || 500000,      /* «крупный» бюджет для VIP-эскалации, $ */
    silentHours: c.silentHours || 4,        /* клиент ждёт ответа дольше — брокер «молчит» */
    stalledDays: c.stalledDays || 5,        /* лид без движения дольше — «застрял» */
    overloadPct: c.overloadPct || 1.0,      /* load/capacity выше — «перегружен» */
  };
}

/* последнее входящее и последнее человеческое исходящее по лиду */
function lastDirs(db, leadId) {
  let lastIn = 0, lastHumanOut = 0, lastAny = 0;
  for (const m of db.messages) {
    if (m.leadId !== leadId) continue;
    if (m.at > lastAny) lastAny = m.at;
    if (m.dir === 'in' && m.at > lastIn) lastIn = m.at;
    if (m.dir === 'out' && m.via === 'human' && m.at > lastHumanOut) lastHumanOut = m.at;
  }
  return { lastIn, lastHumanOut, lastAny };
}

function budgetOf(lead) {
  const b = lead.quals && lead.quals.budget;
  return (b && b.num) || 0;
}

/* ── детектор увода на личный канал (антислив) ──
   Ловит попытку увести общение мимо CRM: «мой личный ватсап», «напишите на другой
   номер», «вот мой телефон +…». Возвращает {hit, reason} или null. */
const К = 'а-яёіїєґ';   /* кириллица (RU+UA): \w в JS её не покрывает */
const LEAK_PATTERNS = [
  { re: new RegExp(`(лич[${К}]*|друг[${К}]*|прям[${К}]*)\\s+(ватсап|whatsapp|вотсап|номер|телефон|тел\\.?|контакт)`, 'i'), reason: 'упомянут личный/другой номер' },
  { re: new RegExp(`(напиш[${К}]*|пиш[${К}]*|звон[${К}]*|набер[${К}]*|скин[${К}]*)\\s+(мне\\s+)?(на|по|в)\\s+(друг[${К}]*|лич[${К}]*|эт[${К}]*\\s+номер|прям[${К}]*)`, 'i'), reason: 'просят писать на другой номер' },
  { re: new RegExp(`(мой|мій)\\s+(лич[${К}]*\\s+)?(ватсап|whatsapp|вотсап|телеграм|telegram|номер|телефон)`, 'i'), reason: 'даёт свой личный контакт' },
  { re: new RegExp(`вот\\s+(мой|мій|мои)\\s+(лич[${К}]*\\s+)?(номер|телефон|ватсап|whatsapp|вотсап)`, 'i'), reason: 'передаёт прямой контакт' },
  { re: new RegExp(`(перейд[${К}]*|перейт[${К}]*|давайт[${К}]*|перейдём)\\s+(в|на)\\s+(лич[${К}]*|друг[${К}]*|прям[${К}]*)`, 'i'), reason: 'предлагают уйти в личный канал' },
  { re: /outside|off[-\s]?platform|my\s+personal\s+(whatsapp|number|phone)/i, reason: 'move off-platform (en)' },
];
function detectLeak(text) {
  const t = String(text || '');
  if (t.length < 6) return null;
  for (const p of LEAK_PATTERNS) if (p.re.test(t)) return { hit: true, reason: p.reason };
  return null;
}

/* ── главный скан: всё, что требует руководителя, по корзинам ── */
function scanRisks(db) {
  const C = cfg(db);
  const now = Date.now();
  const brokers = db.brokers || [];
  const activeBrokers = brokers.filter(b => b.active !== false);
  const brokerName = id => (brokers.find(b => b.id === id) || {}).name || null;

  const buckets = {
    unassigned: [],     /* активный лид без брокера */
    slaBreach: [],      /* нарушение SLA (флаг выставлен движком) */
    silentBroker: [],   /* клиент ждёт ответа дольше порога, ИИ выключен */
    vipStalled: [],     /* крупный бюджет без движения */
    leak: [],           /* флаг увода на личный канал */
    orphanMeetings: [], /* будущая встреча у отключённого/удалённого брокера */
    overloaded: [],     /* брокер сверх ёмкости */
    geoUncovered: [],   /* гео с лидами, но без активного брокера */
    duplicates: [],     /* один человек через разные каналы */
    dealCheck: [],      /* «сделка» без следов работы — сверить факт */
    awayWaiting: [],    /* брокер в отсутствии, а клиент ждёт */
  };

  const geoWithLead = new Set();
  const geoCovered = new Set(activeBrokers.map(b => b.geo).filter(Boolean));

  for (const l of db.leads) {
    if (CLOSED_STAGES.includes(l.stage)) continue;
    const active = ACTIVE_STAGES.includes(l.stage);
    if (active) geoWithLead.add(l.geo);

    /* ничьи */
    if (active && !l.broker) {
      buckets.unassigned.push({ id: l.id, name: l.name, geo: l.geo, stage: l.stage, budget: budgetOf(l), at: l.handoverAt || l.createdAt || 0 });
    }
    /* SLA */
    if (l.slaFlag) {
      buckets.slaBreach.push({ id: l.id, name: l.name, broker: brokerName(l.broker), flag: l.slaFlag, since: l.handoverAt || 0 });
    }
    /* молчащий брокер: клиент написал последним, ИИ выключен, ждёт дольше порога */
    if (l.broker && (!l.ai || !l.ai.enabled)) {
      const { lastIn, lastHumanOut } = lastDirs(db, l.id);
      if (lastIn && lastIn > lastHumanOut && (now - lastIn) > C.silentHours * 3600e3) {
        buckets.silentBroker.push({ id: l.id, name: l.name, broker: brokerName(l.broker), waitingH: Math.round((now - lastIn) / 3600e3) });
      }
    }
    /* VIP без движения */
    if (budgetOf(l) >= C.vipBudget && active) {
      const { lastAny } = lastDirs(db, l.id);
      const idleDays = lastAny ? (now - lastAny) / 86400e3 : 999;
      if (idleDays > C.stalledDays || !l.broker) {
        buckets.vipStalled.push({ id: l.id, name: l.name, budget: budgetOf(l), broker: brokerName(l.broker), idleDays: Math.round(idleDays) });
      }
    }
    /* флаг увода */
    if (l.leakFlag) {
      buckets.leak.push({ id: l.id, name: l.name, broker: brokerName(l.broker), reason: l.leakFlag.reason || '', at: l.leakFlag.at || 0 });
    }
  }

  /* осиротевшие встречи */
  for (const mt of db.meetings || []) {
    if (mt.status && ['done', 'cancelled', 'no_show'].includes(mt.status)) continue;
    if (!mt.at || mt.at < now) continue;
    const br = brokers.find(b => b.id === mt.brokerId);
    if (!br || br.active === false) {
      const l = db.leads.find(x => x.id === mt.leadId);
      buckets.orphanMeetings.push({ id: mt.id, leadId: mt.leadId, lead: l ? l.name : '—', at: mt.at, broker: br ? br.name : '(удалён)' });
    }
  }

  /* перегруженные брокеры */
  for (const b of activeBrokers) {
    const cap = b.capacity || 0;
    if (cap > 0 && (b.load || 0) > cap * C.overloadPct) {
      buckets.overloaded.push({ id: b.id, name: b.name, load: b.load || 0, capacity: cap });
    }
  }

  /* гео без покрытия */
  for (const g of geoWithLead) {
    if (g && !geoCovered.has(g)) {
      const nm = (db.settings.geoNames && db.settings.geoNames[g]) || g;
      buckets.geoUncovered.push({ geo: g, name: nm, leads: db.leads.filter(l => l.geo === g && ACTIVE_STAGES.includes(l.stage)).length });
    }
  }

  /* дубли и сверка сделок */
  for (const c of findDuplicates(db)) buckets.duplicates.push({ phone: c.phone, count: c.leads.length, leads: c.leads, name: c.leads.map(l => l.name).join(' · ') });
  for (const d of dealFactCheck(db)) buckets.dealCheck.push(d);

  /* брокер в отсутствии, а его клиент ждёт ответа → передать заместителю */
  const awayIds = new Set(brokers.filter(b => b.away).map(b => b.id));
  if (awayIds.size) {
    for (const l of db.leads) {
      if (CLOSED_STAGES.includes(l.stage) || !awayIds.has(l.broker)) continue;
      const { lastIn, lastHumanOut } = lastDirs(db, l.id);
      if (lastIn && lastIn > lastHumanOut) {
        const br = brokers.find(b => b.id === l.broker);
        const sub = br && br.substituteId ? brokerName(br.substituteId) : null;
        buckets.awayWaiting.push({ id: l.id, name: l.name, broker: brokerName(l.broker), substitute: sub, waitingH: Math.round((now - lastIn) / 3600e3) });
      }
    }
  }

  const total = Object.values(buckets).reduce((s, arr) => s + arr.length, 0);
  const counts = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length]));
  return { total, counts, buckets, at: now };
}

/* ── предпросмотр оффбординга: кому уйдут лиды/встречи при отключении брокера ── */
function offboardPreview(db, brokerId, successorId) {
  const br = (db.brokers || []).find(b => b.id === brokerId);
  if (!br) return null;
  const openLeads = db.leads.filter(l => l.broker === brokerId && !CLOSED_STAGES.includes(l.stage));
  const meetings = (db.meetings || []).filter(m => m.brokerId === brokerId && (!m.status || !['done', 'cancelled', 'no_show'].includes(m.status)));
  const pool = db.brokers.filter(b => b.id !== brokerId && b.active !== false);

  /* выбор преемника: конкретный | по гео+нагрузке (auto) */
  function chooseFor(lead) {
    if (successorId && successorId !== 'auto') return pool.find(b => b.id === successorId) || null;
    const sameGeo = pool.filter(b => b.geo === lead.geo).sort((a, b) => (a.load || 0) - (b.load || 0));
    const any = pool.slice().sort((a, b) => (a.load || 0) - (b.load || 0));
    return sameGeo[0] || any[0] || null;
  }

  const plan = openLeads.map(l => { const nb = chooseFor(l); return { leadId: l.id, name: l.name, geo: l.geo, stage: l.stage, budget: budgetOf(l), toId: nb ? nb.id : null, to: nb ? nb.name : null }; });
  const byBroker = {};
  for (const p of plan) { const k = p.to || '(без брокера)'; byBroker[k] = (byBroker[k] || 0) + 1; }
  return {
    broker: { id: br.id, name: br.name, geo: br.geo },
    openLeads: openLeads.length,
    meetings: meetings.length,
    plan,
    distribution: byBroker,
    poolEmpty: pool.length === 0,
  };
}

/* ═══════════ ФАЗА 4: качество, деньги, дедуп, дежурство ═══════════ */

function normPhone(p) { const d = String(p || '').replace(/\D/g, ''); return d.length > 9 ? d.slice(-11) : d; }

/* ── дедуп: один человек через разные каналы → кластеры дублей по телефону ── */
function findDuplicates(db) {
  const by = {};
  for (const l of db.leads) {
    if (CLOSED_STAGES.includes(l.stage)) continue;
    const k = normPhone(l.phone); if (!k || k.length < 7) continue;
    (by[k] = by[k] || []).push(l);
  }
  return Object.entries(by).filter(([, arr]) => arr.length > 1).map(([phone, arr]) => ({
    phone,
    leads: arr.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).map(l => ({ id: l.id, name: l.name, source: l.source || '', stage: l.stage, broker: l.broker, createdAt: l.createdAt || 0 })),
  }));
}

/* ── сверка факта сделки: стадия «deal», но нет ни переписки менеджера, ни встречи, ни документа ── */
function dealFactCheck(db) {
  const out = [];
  for (const l of db.leads) {
    if (l.stage !== 'deal') continue;
    const humanMsg = db.messages.some(m => m.leadId === l.id && m.dir === 'out' && m.via === 'human');
    const meeting = (db.meetings || []).some(m => m.leadId === l.id);
    const docs = (l.attachments || l.files || []).length > 0;
    if (!humanMsg && !meeting && !docs) out.push({ id: l.id, name: l.name, broker: (db.brokers.find(b => b.id === l.broker) || {}).name || null, budget: budgetOf(l) });
  }
  return out;
}

/* ── атрибуция комиссии из цепочки владения. rule: 'first'|'last'|'split' ── */
function commissionSplit(ownerHistory, rule) {
  const owners = (ownerHistory || []).filter(o => o.brokerId).map(o => ({ id: o.brokerId, name: o.name }));
  if (!owners.length) return [];
  if (rule === 'first') return [{ id: owners[0].id, name: owners[0].name, pct: 100 }];
  if (rule === 'split') {
    const uniq = []; const seen = new Set();
    for (const o of owners) if (!seen.has(o.id)) { seen.add(o.id); uniq.push(o); }
    const pct = Math.round(100 / uniq.length);
    return uniq.map((o, i) => ({ id: o.id, name: o.name, pct: i === uniq.length - 1 ? 100 - pct * (uniq.length - 1) : pct }));
  }
  const last = owners[owners.length - 1];   /* по умолчанию last-touch */
  return [{ id: last.id, name: last.name, pct: 100 }];
}

/* ── надзор тона: грубость/токсичность/угроза в исходящем менеджера (эвристика, без LLM) ── */
const TONE_PATTERNS = [
  { re: new RegExp(`(идиот|дурак|тупой|тупиц|придур|кретин|дебил|болван|уебан|мудак|сволоч|скотин)[${К}]*`, 'i'), reason: 'оскорбление' },
  { re: new RegExp(`(отвали|отстань|заткни|достал[${К}]*|надоел[${К}]*|не мешай|отвяжись)`, 'i'), reason: 'грубость' },
  { re: /\b(fuck|shit|idiot|stupid|moron)\b/i, reason: 'brute (en)' },
  { re: new RegExp(`(сам[${К}]* виноват|это ваши проблем[${К}]*|мне (всё равно|плевать|наплевать))`, 'i'), reason: 'пренебрежение' },
];
function toneScan(text) {
  const t = String(text || ''); if (t.length < 3) return null;
  for (const p of TONE_PATTERNS) if (p.re.test(t)) return { flag: true, reason: p.reason };
  /* капслок-крик: длинная фраза заглавными */
  const letters = t.replace(/[^A-Za-zА-Яа-яЁё]/g, '');
  if (letters.length > 12 && letters === letters.toUpperCase() && /[А-ЯA-Z]{8,}/.test(t)) return { flag: true, reason: 'крик капслоком' };
  return null;
}

/* ── цепочка владения: неизменяемый лог передач лида (для атрибуции комиссий) ── */
function recordOwner(db, lead, brokerId, by, reason) {
  if (!lead) return;
  lead.ownerHistory = lead.ownerHistory || [];
  const last = lead.ownerHistory[lead.ownerHistory.length - 1];
  if (last && last.brokerId === (brokerId || null)) return;   /* без дублей подряд */
  const name = brokerId ? ((db.brokers.find(b => b.id === brokerId) || {}).name || brokerId) : null;
  lead.ownerHistory.push({ brokerId: brokerId || null, name, at: Date.now(), by: by || 'system', reason: reason || '' });
  if (lead.ownerHistory.length > 40) lead.ownerHistory.splice(0, lead.ownerHistory.length - 40);
}

module.exports = { scanRisks, detectLeak, offboardPreview, recordOwner, findDuplicates, dealFactCheck, commissionSplit, toneScan, normPhone, ACTIVE_STAGES, CLOSED_STAGES, cfg };
