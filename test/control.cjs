/* Харнесс движка «Пульт контроля» — берёт функции ИЗ ЖИВОГО server/control.js */
const control = require('../server/control.js');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('✓ ', n); } else { fail++; console.log('✗ ', n); } };
const now = Date.now();

/* ── детектор увода (антислив) ── */
ok(control.detectLeak('напишите мне на другой номер'), 'leak: «на другой номер»');
ok(control.detectLeak('вот мой личный ватсап'), 'leak: «мой личный ватсап»');
ok(control.detectLeak('давайте перейдём в личный'), 'leak: «перейдём в личный»');
ok(control.detectLeak('my personal whatsapp is'), 'leak: en personal whatsapp');
ok(!control.detectLeak('когда можем созвониться?'), 'no-leak: обычный вопрос');
ok(!control.detectLeak('хочу другой район'), 'no-leak: «другой район» не ловится');
ok(!control.detectLeak('ок'), 'no-leak: слишком короткое');

/* ── цепочка владения ── */
{
  const db = { brokers: [{ id: 'b1', name: 'Игорь' }, { id: 'b2', name: 'Анна' }] };
  const lead = {};
  control.recordOwner(db, lead, 'b1', 'auto', 'first');
  control.recordOwner(db, lead, 'b1', 'auto', 'dup');       // дубль подряд — не пишется
  control.recordOwner(db, lead, 'b2', 'owner', 'reassign');
  ok(lead.ownerHistory.length === 2, 'owner: дубль подряд схлопнут (2 записи)');
  ok(lead.ownerHistory[0].name === 'Игорь' && lead.ownerHistory[1].name === 'Анна', 'owner: имена и порядок верны');
  ok(lead.ownerHistory[1].by === 'owner', 'owner: поле by сохранено');
}

/* ── scanRisks: собираем db со всеми типами риска ── */
function mkDb() {
  return {
    settings: { control: { vipBudget: 500000, silentHours: 4, stalledDays: 5, overloadPct: 1.0 }, geoNames: { dubai: 'Дубай', bali: 'Бали' } },
    brokers: [
      { id: 'b1', name: 'Игорь', geo: 'dubai', active: true, load: 6, capacity: 5 },   // перегружен
      { id: 'b2', name: 'Анна', geo: 'dubai', active: false, load: 0 },                 // отключён
    ],
    leads: [
      { id: 'l1', name: 'Ничей', geo: 'dubai', stage: 'qualified', broker: null, quals: {}, ai: { enabled: false } },                       // unassigned
      { id: 'l2', name: 'СЛА', geo: 'dubai', stage: 'handover', broker: 'b1', slaFlag: 'warned', handoverAt: now - 3600e3, quals: {}, ai: { enabled: false } }, // slaBreach
      { id: 'l3', name: 'Молчун', geo: 'dubai', stage: 'handover', broker: 'b1', quals: {}, ai: { enabled: false } },                       // silentBroker
      { id: 'l4', name: 'ВИП', geo: 'bali', stage: 'dialog', broker: null, quals: { budget: { num: 900000 } }, ai: { enabled: true } },     // vipStalled + unassigned + geoUncovered
      { id: 'l5', name: 'Слив', geo: 'dubai', stage: 'dialog', broker: 'b1', quals: {}, ai: { enabled: true }, leakFlag: { reason: 'личный номер', at: now } }, // leak
      { id: 'l6', name: 'Закрыт', geo: 'dubai', stage: 'deal', broker: 'b1', quals: {}, ai: {} },                                            // игнор
    ],
    messages: [
      { leadId: 'l3', dir: 'in', at: now - 6 * 3600e3, text: 'Есть новости?' },   // клиент ждёт 6ч > 4ч порога
    ],
    meetings: [
      { id: 'mt1', leadId: 'l5', brokerId: 'b2', at: now + 86400e3, status: 'scheduled' },   // orphan (b2 отключён)
    ],
  };
}
{
  const db = mkDb();
  const r = control.scanRisks(db);
  ok(r.counts.unassigned === 2, `unassigned=2 (получено ${r.counts.unassigned})`);
  ok(r.counts.slaBreach === 1, `slaBreach=1 (${r.counts.slaBreach})`);
  ok(r.counts.silentBroker === 1, `silentBroker=1 (${r.counts.silentBroker})`);
  ok(r.counts.vipStalled === 1, `vipStalled=1 (${r.counts.vipStalled})`);
  ok(r.counts.leak === 1, `leak=1 (${r.counts.leak})`);
  ok(r.counts.orphanMeetings === 1, `orphanMeetings=1 (${r.counts.orphanMeetings})`);
  ok(r.counts.overloaded === 1, `overloaded=1 (${r.counts.overloaded})`);
  ok(r.counts.geoUncovered === 1, `geoUncovered=1 bali (${r.counts.geoUncovered})`);
  ok(r.total === Object.values(r.counts).reduce((s, x) => s + x, 0), 'total = сумма корзин');
  ok(r.buckets.silentBroker[0].waitingH >= 5, 'silentBroker: часы ожидания посчитаны');
}

/* ── offboardPreview ── */
{
  const db = mkDb();
  db.leads.forEach(l => { if (['l2', 'l3', 'l5'].includes(l.id)) l.broker = 'b1'; });
  const prev = control.offboardPreview(db, 'b1', 'auto');
  ok(prev && prev.openLeads === 3, `offboard: 3 открытых лида у b1 (${prev && prev.openLeads})`);
  ok(prev.plan.every(p => p.toId === null || p.toId !== 'b1'), 'offboard: никого не оставили на b1');
  const prevEmpty = control.offboardPreview(db, 'b1', 'auto');
  ok(prevEmpty.poolEmpty === true || prevEmpty.poolEmpty === false, 'offboard: poolEmpty вычислен');
}

/* ── ФАЗА 4 ── */
/* дедуп */
{
  const db = { brokers: [{ id: 'b1', name: 'И' }], leads: [
    { id: 'l1', name: 'Иван', phone: '+971 50 111 22 33', stage: 'dialog', source: 'ig', quals: {} },
    { id: 'l2', name: 'Иван К', phone: '971501112233', stage: 'new', source: 'wa', quals: {} },
    { id: 'l3', name: 'Пётр', phone: '+79990001122', stage: 'dialog', quals: {} },
    { id: 'l4', name: 'Закрыт', phone: '+971501112233', stage: 'lost', quals: {} },
  ], messages: [], meetings: [] };
  const dups = control.findDuplicates(db);
  ok(dups.length === 1, `dedup: 1 кластер (${dups.length})`);
  ok(dups[0].leads.length === 2, 'dedup: закрытый лид не считается дублем');
  ok(dups[0].leads[0].id === 'l1', 'dedup: старейший первым');
}
/* сверка сделок */
{
  const db = { brokers: [{ id: 'b1', name: 'И' }], leads: [
    { id: 'd1', name: 'Пустая сделка', stage: 'deal', broker: 'b1', quals: {} },
    { id: 'd2', name: 'Живая сделка', stage: 'deal', broker: 'b1', quals: {} },
  ], messages: [{ leadId: 'd2', dir: 'out', via: 'human' }], meetings: [] };
  const fc = control.dealFactCheck(db);
  ok(fc.length === 1 && fc[0].id === 'd1', 'dealCheck: ловит сделку без следов работы');
}
/* атрибуция комиссии */
{
  const oh = [{ brokerId: 'b1', name: 'Игорь' }, { brokerId: 'b2', name: 'Анна' }, { brokerId: 'b1', name: 'Игорь' }];
  ok(control.commissionSplit(oh, 'first')[0].name === 'Игорь' && control.commissionSplit(oh, 'first')[0].pct === 100, 'commission: first-touch = Игорь 100%');
  ok(control.commissionSplit(oh, 'last')[0].name === 'Игорь' && control.commissionSplit(oh, 'last').length === 1, 'commission: last-touch = Игорь 100%');
  const sp = control.commissionSplit(oh, 'split');
  ok(sp.length === 2 && sp.reduce((s, x) => s + x.pct, 0) === 100, 'commission: split уникальных = 100% в сумме');
}
/* надзор тона */
ok(control.toneScan('ты идиот что ли'), 'tone: оскорбление');
ok(control.toneScan('отвали уже'), 'tone: грубость');
ok(control.toneScan('ЭТО ВАШИ ПРОБЛЕМЫ РАЗБИРАЙТЕСЬ САМИ'), 'tone: крик/пренебрежение');
ok(!control.toneScan('Добрый день! Подобрал для вас три варианта.'), 'tone: нормальное сообщение чисто');
ok(!control.toneScan('ОК'), 'tone: короткий капс не ложно-срабатывает');

/* новые корзины в scanRisks */
{
  const db = mkDb();
  db.leads.push({ id: 'dup1', name: 'Дубль', geo: 'dubai', stage: 'dialog', broker: 'b1', phone: '+971509999999', quals: {}, ai: {} });
  db.leads.push({ id: 'dup2', name: 'Дубль2', geo: 'dubai', stage: 'new', broker: 'b1', phone: '971509999999', quals: {}, ai: {} });
  db.leads.push({ id: 'dl1', name: 'Пустая сделка', geo: 'dubai', stage: 'deal', broker: 'b1', phone: '+971502223344', quals: {}, ai: {} });
  const r = control.scanRisks(db);
  ok(r.counts.duplicates >= 1, `scan: duplicates корзина (${r.counts.duplicates})`);
  ok(r.counts.dealCheck === 2, `scan: dealCheck корзина (${r.counts.dealCheck}) — l6+dl1`);
}
/* дежурство: pickBroker учитывает away через scanRisks.awayWaiting */
{
  const db = mkDb();
  db.brokers[0].away = true; db.brokers[0].substituteId = null;
  db.leads.push({ id: 'aw1', name: 'Ждёт', geo: 'dubai', stage: 'handover', broker: 'b1', quals: {}, ai: { enabled: false } });
  db.messages.push({ leadId: 'aw1', dir: 'in', at: Date.now() - 3600e3, text: 'Ау?' });
  const r = control.scanRisks(db);
  ok(r.counts.awayWaiting === 2, `scan: awayWaiting корзина (${r.counts.awayWaiting}) — l3(Молчун)+aw1`);
}

/* риск-срез воронки */
{
  const db = {
    settings: { control: {}, geoNames: { dubai: 'Дубай', bali: 'Бали' } },
    brokers: [{ id: 'b1', name: 'Сильный' }, { id: 'b2', name: 'Слабый' }],
    leads: [
      /* b1: 3 сделки, 1 потеря → win 75% */
      { id: 'a1', broker: 'b1', geo: 'dubai', source: 'ig', stage: 'deal', quals: {} },
      { id: 'a2', broker: 'b1', geo: 'dubai', source: 'ig', stage: 'deal', quals: {} },
      { id: 'a3', broker: 'b1', geo: 'dubai', source: 'ig', stage: 'deal', quals: {} },
      { id: 'a4', broker: 'b1', geo: 'dubai', source: 'ig', stage: 'lost', quals: {} },
      /* b2: 0 сделок, 4 потери → win 0% (утечка) */
      { id: 'c1', broker: 'b2', geo: 'bali', source: 'wa', stage: 'lost', quals: {} },
      { id: 'c2', broker: 'b2', geo: 'bali', source: 'wa', stage: 'lost', quals: {} },
      { id: 'c3', broker: 'b2', geo: 'bali', source: 'wa', stage: 'lost', quals: {} },
      { id: 'c4', broker: 'b2', geo: 'bali', source: 'wa', stage: 'dialog', quals: {} },
    ],
    messages: [], meetings: [],
  };
  const fa = control.funnelAnalysis(db);
  ok(fa.overallWin === 43, `funnel: общий винрейт 3/7=43% (${fa.overallWin})`);
  const b2 = fa.byBroker.find(x => x.key === 'b2');
  ok(b2.winRate === 0 && b2.resolved === 3, 'funnel: слабый брокер win 0% из 3 решённых');
  ok(fa.leaks.some(l => l.kind === 'Брокер' && l.name === 'Слабый'), 'funnel: слабый брокер помечен утечкой');
  ok(fa.stageDist.deal.count === 3 && fa.stageDist.lost.count === 4, 'funnel: распределение по стадиям верно');
  ok(fa.byGeo.find(x => x.key === 'bali').winRate === 0, 'funnel: срез по гео (Бали 0%)');
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
