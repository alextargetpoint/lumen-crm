#!/usr/bin/env node
/* Сквозной тест синка Lumen↔Bitrix24 на ЖИВОМ коде (server/bitrix.js) против
   фейкового Bitrix (bitrix-mock.js). Запуск: node tools/crm-mock/bitrix-roundtrip.js */
const { spawn } = require('child_process');
const path = require('path');
const bitrix = require('../../server/bitrix');

const PORT = 4211, TOKEN = 'bxtoken';
const WH = 'http://localhost:' + PORT + '/rest/1/' + TOKEN + '/';
const ROOT = 'http://localhost:' + PORT;
const ctl = (p, body) => fetch(ROOT + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(r => r.json());
const dump = () => fetch(ROOT + '/__dump').then(r => r.json());

let ok = 0, fail = 0;
const chk = (n, c, got) => { if (c) { ok++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };
const cfgBase = () => ({
  webhook: WH, categoryId: 1,
  stageMap: { qualified: 'C1:NEW', handover: 'C1:PREPARATION', viewing: 'C1:EXECUTING', deal: 'C1:WON', lost: 'C1:LOSE' },
  fields: { budget: 'UF_CRM_BUDGET', type: { id: 'UF_CRM_TYPE', type: 'enumeration', enum: { '2BR': 501, '3BR': 502 } }, region: 'UF_CRM_REGION' },
  pullStages: true, sinceOverlapMs: 0, minGapMs: 20,   // быстрый троттлинг для теста
});

(async () => {
  const mock = spawn('node', [path.join(__dirname, 'bitrix-mock.js')], { env: { ...process.env, PORT: String(PORT), BX_MOCK_TOKEN: TOKEN }, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 700));
  try {
    const cfg = cfgBase();
    await ctl('/__enumfield', { codes: ['UF_CRM_TYPE'] });

    console.log('\n1) PING / токен в URL');
    let bad = false; try { await bitrix.makeApi({ webhook: ROOT + '/rest/1/WRONG/', minGapMs: 10 }).ping(); } catch (e) { bad = e.code === 'INVALID_CREDENTIALS'; }
    chk('неверный токен вебхука → INVALID_CREDENTIALS', bad);
    chk('верный вебхук → profile', !!(await bitrix.makeApi(cfg).ping()).result);

    console.log('\n2) PUSH + enum UF-поле (item ID, не текст)');
    const api = bitrix.makeApi(cfg);
    const db = { leads: [
      { id: 'L1', name: 'Анна', phone: '+971501112233', stage: 'qualified', updatedAt: Date.now(), quals: { budget: { value: '350k', num: 350000 }, type: { value: '2BR' } }, geoName: 'Dubai Marina' },
      { id: 'L2', name: 'Борис', phone: '+971509998877', stage: 'deal', updatedAt: Date.now(), dealValue: 500000 },
      { id: 'L3', name: '', phone: '', stage: 'new', updatedAt: Date.now() },
    ] };
    const r1 = await bitrix.syncAll(db, { api, cfg: { ...cfg, now: Date.now() }, pull: false });
    chk('создано 2 сделки, L3 без телефона пропущен', r1.created === 2 && r1.pushErr === 0, r1);
    const d1 = await dump();
    const bL1 = d1.deals.find(d => String(d.ID) === String(db.leads[0].bitrixId));
    chk('enum UF-поле ушло как item ID (501), не текст', bL1.UF_CRM_TYPE === 501, bL1.UF_CRM_TYPE);
    chk('STAGE_ID = C1:NEW, CATEGORY_ID=1', bL1.STAGE_ID === 'C1:NEW' && +bL1.CATEGORY_ID === 1, { s: bL1.STAGE_ID, c: bL1.CATEGORY_ID });
    const bL2 = d1.deals.find(d => String(d.ID) === String(db.leads[1].bitrixId));
    chk('OPPORTUNITY L2 = 500000', +bL2.OPPORTUNITY === 500000, bL2.OPPORTUNITY);
    chk('контакт создан и привязан (CONTACT_ID)', !!bL1.CONTACT_ID && d1.contacts.some(c => c.ID === bL1.CONTACT_ID));

    console.log('\n3) ДЕДУП по телефону (findbycomm) — не плодим дубль');
    await ctl('/__reset'); await ctl('/__enumfield', { codes: ['UF_CRM_TYPE'] });
    const api2 = bitrix.makeApi(cfg);
    const preC = await api2.createContact({ NAME: 'Старый', PHONE: [{ VALUE: '+971777000111', VALUE_TYPE: 'WORK' }] });
    const preD = await api2.createDeal({ TITLE: 'Старая', CONTACT_ID: preC.id, STAGE_ID: 'C1:NEW' });
    const dbDup = { leads: [{ id: 'DUP', name: 'Новый', phone: '+971 777 000 111', stage: 'qualified', updatedAt: Date.now() }] };
    const rDup = await bitrix.syncAll(dbDup, { api: api2, cfg: { ...cfg, now: Date.now() }, pull: false });
    chk('дедуп сработал (усыновлён dealId, не создан)', rDup.deduped === 1 && rDup.created === 0 && rDup.updated === 1, rDup);
    chk('в Bitrix по-прежнему 1 сделка', (await dump()).deals.length === 1, (await dump()).deals.length);
    chk('лид получил bitrixId существующей сделки', String(dbDup.leads[0].bitrixId) === String(preD.id));

    console.log('\n4) RATE-LIMIT (QUERY_LIMIT_EXCEEDED) → ретрай');
    await ctl('/__reset'); await ctl('/__throttle', { count: 2 });
    const dbRL = { leads: [{ id: 'RL', name: 'Ретрай', phone: '+971555000222', stage: 'deal', updatedAt: Date.now(), dealValue: 100000 }] };
    const rRL = await bitrix.syncAll(dbRL, { api: bitrix.makeApi(cfg), cfg: { ...cfg, now: Date.now(), dedupeByPhone: false }, pull: false });
    chk('после QUERY_LIMIT-ретраев сделка создана', rRL.created === 1 && rRL.pushErr === 0, rRL);

    console.log('\n5) UPDATE удалённой сделки → NOT_FOUND → пересоздание');
    await ctl('/__reset');
    const dbDel = { leads: [{ id: 'DL', name: 'Удалёж', phone: '+971444000333', stage: 'qualified', updatedAt: Date.now() }] };
    await bitrix.syncAll(dbDel, { api: bitrix.makeApi(cfg), cfg: { ...cfg, now: Date.now(), dedupeByPhone: false }, pull: false });
    const oldId = dbDel.leads[0].bitrixId;
    await ctl('/__delete', { id: oldId });
    dbDel.leads[0].stage = 'deal'; dbDel.leads[0].updatedAt = Date.now() + 1;
    const rDel = await bitrix.syncAll(dbDel, { api: bitrix.makeApi(cfg), cfg: { ...cfg, now: Date.now() + 1, dedupeByPhone: false }, pull: false });
    chk('NOT_FOUND → помечен на пересоздание, bitrixId сброшен', rDel.recreated === 1 && (dbDel.leads[0].bitrixId == null || String(dbDel.leads[0].bitrixId) !== String(oldId)), { r: rDel.recreated, id: dbDel.leads[0].bitrixId });
    const rDel2 = await bitrix.syncAll(dbDel, { api: bitrix.makeApi(cfg), cfg: { ...cfg, now: Date.now() + 2, dedupeByPhone: false }, pull: false });
    chk('пересоздан в Bitrix', rDel2.created === 1 && dbDel.leads[0].bitrixId != null, rDel2);

    console.log('\n6) PULL + пагинация (start-offset) + защита квалов');
    await ctl('/__reset'); await ctl('/__enumfield', { codes: ['UF_CRM_TYPE'] });
    const apiP = bitrix.makeApi(cfg);
    const dbP = { leads: Array.from({ length: 60 }, (_, i) => ({ id: 'P' + i, name: 'P' + i, phone: '+9716' + String(20000000 + i), stage: 'qualified', updatedAt: Date.now() })) };
    await bitrix.syncAll(dbP, { api: apiP, cfg: { ...cfg, now: Date.now(), dedupeByPhone: false }, pull: false });   // 60 > PAGE(50) → 2 страницы
    await ctl('/__setstage', { id: dbP.leads[0].bitrixId, stage: 'C1:LOSE' });
    dbP.leads[0].quals = { budget: { value: 'МОЁ-500k' } };
    const rP = await bitrix.pullChanges(dbP, { api: apiP, cfg: { ...cfg, sinceOverlapMs: 0 }, since: 0 });
    chk('пулл прошёл ВСЕ страницы (60 сделок через start-offset)', rP.pulled === 60, rP);
    chk('стадия подтянулась (lost)', dbP.leads[0].stage === 'lost', dbP.leads[0].stage);
    chk('свой бюджет не затёрт', dbP.leads[0].quals.budget.value === 'МОЁ-500k');

    console.log('\n7) АВТО-ОПРЕДЕЛЕНИЕ enum-поля (замаплено «голым» кодом)');
    await ctl('/__reset'); await ctl('/__enumfield', { codes: ['UF_CRM_TYPE'] });
    const cfgPlain = { ...cfgBase(), fields: { type: 'UF_CRM_TYPE' } };   // только код, без type/enum
    const dbAuto = { leads: [{ id: 'A1', name: 'Авто', phone: '+971111000777', stage: 'qualified', updatedAt: Date.now(), quals: { type: { value: '3BR' } } }] };
    const rAuto = await bitrix.syncAll(dbAuto, { api: bitrix.makeApi(cfgPlain), cfg: { ...cfgPlain, now: Date.now(), dedupeByPhone: false }, pull: false });
    chk('создан без ошибки enum', rAuto.created === 1 && rAuto.pushErr === 0, rAuto);
    const bA = (await dump()).deals[0];
    chk('значение ушло как item ID (502=3BR) при «голом» маппинге', bA.UF_CRM_TYPE === 502, bA.UF_CRM_TYPE);

    console.log('\n8) ОПТ-АУТ — не создаём нового, существующего обновляем');
    const dbOpt = { leads: [
      { id: 'O1', name: 'Отпис-нов', phone: '+971333000444', stage: 'qualified', updatedAt: Date.now(), marketingOptOut: true },
      { id: 'O2', name: 'Отпис-стар', phone: '+971333000555', stage: 'qualified', updatedAt: Date.now(), marketingOptOut: true, bitrixId: 55555 },
    ] };
    const picked = bitrix.leadsToPush(dbOpt, cfg).map(l => l.id);
    chk('опт-аут без bitrixId НЕ в очереди, с bitrixId — в очереди', !picked.includes('O1') && picked.includes('O2'), picked);

    console.log('\n' + ok + ' ok, ' + fail + ' fail');
  } catch (e) {
    console.log('ИСКЛЮЧЕНИЕ:', e.message, '\n', (e.stack || '').split('\n').slice(0, 5).join('\n'));
    fail++;
  } finally {
    mock.kill('SIGKILL');
    process.exit(fail ? 1 : 0);
  }
})();
