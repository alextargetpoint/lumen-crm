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

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
