#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   Сквозной тест синка Lumen↔amoCRM на ЖИВОМ коде (server/amocrm.js) против
   фейкового amo (amo-mock.js). Поднимает мок сам, гоняет реальный makeApi по
   http, проверяет весь круг — без единой регистрации в CRM.

   Запуск:  node tools/crm-mock/roundtrip.js
   ────────────────────────────────────────────────────────────────────────── */
const { spawn } = require('child_process');
const path = require('path');
const amocrm = require('../../server/amocrm');

const PORT = 4111, BASE = 'http://localhost:' + PORT, TOKEN = 'testtoken';
const mockReq = (p, method, body) => fetch(BASE + p, { method: method || 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(r => r.json());

let ok = 0, fail = 0;
const chk = (n, c, got) => { if (c) { ok++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

(async () => {
  const mock = spawn('node', [path.join(__dirname, 'amo-mock.js')], { env: { ...process.env, PORT: String(PORT), AMO_MOCK_TOKEN: TOKEN }, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 700));   // дать моку подняться
  try {
    const cfg = { apiBase: BASE, token: TOKEN, subdomain: 'mock', pipelineId: 777,
      statusMap: { qualified: 311, handover: 312, viewing: 313, deal: 315, lost: 320 },
      fields: { budget: 9001, timeline: 9002, type: 9003, purpose: 9004, region: 9005 }, pullStages: true };

    console.log('\n1) PING — связь с amo');
    const apiBad = amocrm.makeApi({ apiBase: BASE, token: 'WRONG', subdomain: 'mock' });
    let bad401 = false; try { await apiBad.ping(); } catch (e) { bad401 = /401/.test(e.message); }
    chk('неверный токен → 401 (как настоящий amo)', bad401);
    const api = amocrm.makeApi(cfg);
    const acc = await api.ping();
    chk('верный токен → /account отвечает', acc && acc.name === 'Mock Agency', acc);

    console.log('\n2) PUSH — заливаем лиды Lumen → amo');
    const db = { leads: [
      { id: 'L1', name: 'Анна', phone: '+971501112233', stage: 'qualified', updatedAt: Date.now(), quals: { budget: { value: '350k', num: 350000 }, type: { value: '2BR' } }, geoName: 'Dubai Marina' },
      { id: 'L2', name: 'Борис', phone: '+971509998877', stage: 'deal', updatedAt: Date.now(), dealValue: 500000, dealCommission: 15000 },
      { id: 'L3', name: 'Спам', phone: '', stage: 'new', updatedAt: Date.now() },               // без телефона + new → НЕ пушим
    ] };
    const r1 = await amocrm.syncAll(db, { api, cfg: { ...cfg, now: Date.now() }, pull: false });
    chk('запушено 2 (L1 квал, L2 сделка), L3 пропущен', r1.pushed === 2 && r1.pushErr === 0, r1);
    chk('L1 получил amoId', !!db.leads[0].amoId, db.leads[0].amoId);
    chk('L2 получил amoId', !!db.leads[1].amoId, db.leads[1].amoId);

    const dump1 = await mockReq('/__dump');
    const amoL1 = dump1.leads.find(l => l.id === db.leads[0].amoId);
    chk('в amo у L1 правильный status_id (qualified→311)', amoL1 && amoL1.status_id === 311, amoL1 && amoL1.status_id);
    chk('в amo у L1 проставлена воронка (pipeline 777)', amoL1 && amoL1.pipeline_id === 777, amoL1 && amoL1.pipeline_id);
    const cf = (amoL1.custom_fields_values || []).reduce((m, f) => (m[f.field_id] = f.values[0].value, m), {});
    chk('custom field бюджет (9001) залит', cf[9001] === '350k', cf);
    chk('custom field регион (9005) залит из geoName', cf[9005] === 'Dubai Marina', cf[9005]);
    const amoL2 = dump1.leads.find(l => l.id === db.leads[1].amoId);
    chk('в amo у L2 price = сумма сделки', amoL2 && amoL2.price === 500000, amoL2 && amoL2.price);
    chk('у L1 создан и привязан контакт', amoL1._embedded && amoL1._embedded.contacts && amoL1._embedded.contacts.length === 1, amoL1._embedded);

    console.log('\n3) UPDATE — меняем стадию в Lumen → пушим апдейт (не дубль)');
    db.leads[0].stage = 'handover'; db.leads[0].updatedAt = Date.now() + 1;
    const r2 = await amocrm.syncAll(db, { api, cfg: { ...cfg, now: Date.now() + 1 }, pull: false });
    chk('запушен 1 апдейт (L1), без новых создания', r2.pushed === 1, r2);
    const dump2 = await mockReq('/__dump');
    chk('amo: та же сделка L1 обновлена (handover→312), не создалась новая', dump2.leads.length === 2 && dump2.leads.find(l => l.id === db.leads[0].amoId).status_id === 312, { n: dump2.leads.length });

    console.log('\n4) PULL — «брокер поменял статус В amo» → тянем в Lumen');
    await mockReq('/__setstatus', 'POST', { id: db.leads[1].amoId, status_id: 320 });  // L2: deal → lost (в amo)
    const r3 = await amocrm.pullChanges(db, { api, cfg, since: 0 });
    chk('pull нашёл и сматчил L2 по amoId', r3.matched >= 1, r3);
    chk('стадия L2 подтянулась в Lumen (lost)', db.leads[1].stage === 'lost', db.leads[1].stage);

    console.log('\n5) ЗАЩИТА — pull НЕ затирает свои непустые квалы');
    db.leads[0].quals = { budget: { value: 'МОЁ-500k' } };                                   // свой бюджет
    await mockReq('/__setstatus', 'POST', { id: db.leads[0].amoId, status_id: 313 });         // amo шлёт что-то
    // подменим в amo custom field бюджета на чужое значение
    const dl = (await mockReq('/__dump')).leads.find(l => l.id === db.leads[0].amoId);
    await mockReq('/api/v4/leads', 'GET');
    const r4 = await amocrm.pullChanges(db, { api, cfg, since: 0 });
    chk('свой бюджет L1 НЕ затёрт данными из amo', db.leads[0].quals.budget.value === 'МОЁ-500k', db.leads[0].quals.budget);
    chk('но стадия из amo подтянулась (viewing)', db.leads[0].stage === 'viewing', db.leads[0].stage);

    console.log('\n' + ok + ' ok, ' + fail + ' fail');
  } catch (e) {
    console.log('ИСКЛЮЧЕНИЕ:', e.message, '\n', e.stack);
    fail++;
  } finally {
    mock.kill('SIGKILL');
    process.exit(fail ? 1 : 0);
  }
})();
