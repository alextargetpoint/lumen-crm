#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   Сквозной тест синка Lumen↔amoCRM на ЖИВОМ коде (server/amocrm.js) против
   фейкового amo (amo-mock.js), с имитацией РЕАЛЬНЫХ капризов боевого amo.
   Запуск:  node tools/crm-mock/roundtrip.js
   ────────────────────────────────────────────────────────────────────────── */
const { spawn } = require('child_process');
const path = require('path');
const amocrm = require('../../server/amocrm');

const PORT = 4112, BASE = 'http://localhost:' + PORT, TOKEN = 'testtoken';
const ctl = (p, body) => fetch(BASE + p, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }).then(r => r.json());

let ok = 0, fail = 0;
const chk = (n, c, got) => { if (c) { ok++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };
const cfgBase = () => ({
  apiBase: BASE, token: TOKEN, subdomain: 'mock', pipelineId: 777,
  statusMap: { qualified: 311, handover: 312, viewing: 313, deal: 315, lost: 320 },
  fields: { budget: 9001, timeline: 9002, type: { id: 9003, type: 'select', enum: { '2BR': 501, '3BR': 502 } }, purpose: 9004, region: 9005 },
  pullStages: true, sinceOverlapMs: 0,
});

(async () => {
  const mock = spawn('node', [path.join(__dirname, 'amo-mock.js')], { env: { ...process.env, PORT: String(PORT), AMO_MOCK_TOKEN: TOKEN }, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 700));
  try {
    const cfg = cfgBase();
    const api = amocrm.makeApi(cfg);
    await ctl('/__selectfield', { ids: [9003] });   // поле «тип» ведёт себя как список (как в реальном amo)

    console.log('\n1) PING / авторизация');
    let bad = false; try { await amocrm.makeApi({ apiBase: BASE, token: 'WRONG', subdomain: 'mock' }).ping(); } catch (e) { bad = e.status === 401; }
    chk('неверный токен → 401', bad);
    chk('верный токен → /account', (await api.ping()).name === 'Mock Agency');

    console.log('\n2) PUSH базовый + select-поле (enum, НЕ сырой текст)');
    const db = { leads: [
      { id: 'L1', name: 'Анна', phone: '+971501112233', stage: 'qualified', updatedAt: Date.now(), quals: { budget: { value: '350k', num: 350000 }, type: { value: '2BR' } }, geoName: 'Dubai Marina' },
      { id: 'L2', name: 'Борис', phone: '+971509998877', stage: 'deal', updatedAt: Date.now(), dealValue: 500000 },
      { id: 'L3', name: '', phone: '', stage: 'new', updatedAt: Date.now() },
    ] };
    const r1 = await amocrm.syncAll(db, { api, cfg: { ...cfg, now: Date.now() }, pull: false });
    chk('создано 2 (L1,L2), L3 без телефона пропущен', r1.created === 2 && r1.pushErr === 0, r1);
    const d1 = await ctl('/__dump');
    const aL1 = d1.leads.find(l => l.id === db.leads[0].amoId);
    chk('select-поле «тип» ушло как enum_id (501), а не текст → amo НЕ отверг', (aL1.custom_fields_values || []).some(f => f.field_id === 9003 && f.values[0].enum_id === 501), aL1.custom_fields_values);
    chk('текстовые поля (бюджет 9001) как value', (aL1.custom_fields_values || []).some(f => f.field_id === 9001 && f.values[0].value === '350k'));
    chk('pipeline проставлен', aL1.pipeline_id === 777);
    chk('контакт создан и привязан', aL1._embedded.contacts.length === 1);

    console.log('\n3) SELECT без соответствия enum → пропуск (не 400, поле просто не уходит)');
    const db3 = { leads: [{ id: 'X', name: 'Икс', phone: '+971500000001', stage: 'qualified', updatedAt: Date.now(), quals: { type: { value: 'Пентхаус' } } }] };  // нет в enum
    const r3 = await amocrm.syncAll(db3, { api, cfg: { ...cfg, now: Date.now() }, pull: false });
    chk('лид создан, без 400', r3.created === 1 && r3.pushErr === 0, r3);
    const aX = (await ctl('/__dump')).leads.find(l => l.id === db3.leads[0].amoId);
    chk('несопоставленное select-значение НЕ улетело', !(aX.custom_fields_values || []).some(f => f.field_id === 9003), aX.custom_fields_values);

    console.log('\n4) ДЕДУП по телефону — не плодим дубль существующего в amo');
    await ctl('/__reset', {}); await ctl('/__selectfield', { ids: [9003] });
    // заранее кладём «уже существующую» сделку в amo с тем же телефоном (создаём контакт + лид напрямую)
    const api2 = amocrm.makeApi(cfg);
    const preC = await api2.createContacts([{ name: 'Старый', custom_fields_values: [{ field_code: 'PHONE', values: [{ value: '+971777000111' }] }] }]);
    const preL = await api2.createLeads([{ name: 'Старая сделка', _embedded: { contacts: [{ id: preC[0].id }] } }]);
    const dbDup = { leads: [{ id: 'DUP', name: 'Новый', phone: '+971 777 000 111', stage: 'qualified', updatedAt: Date.now() }] };  // тот же номер, иной формат
    const rDup = await amocrm.syncAll(dbDup, { api: api2, cfg: { ...cfg, now: Date.now() }, pull: false });
    chk('дедуп сработал (усыновлён, не создан новый)', rDup.deduped === 1 && rDup.created === 0 && rDup.updated === 1, rDup);
    chk('в amo по-прежнему 1 сделка с этим номером', (await ctl('/__dump')).leads.length === 1, (await ctl('/__dump')).leads.length);
    chk('лид получил amoId существующей сделки', dbDup.leads[0].amoId === preL[0].id);

    console.log('\n5) БАТЧ — 120 лидов уходят пачками ≤50');
    await ctl('/__reset', {});
    const many = { leads: Array.from({ length: 120 }, (_, i) => ({ id: 'B' + i, name: 'Лид ' + i, phone: '+9715' + String(10000000 + i), stage: 'qualified', updatedAt: Date.now() })) };
    const rMany = await amocrm.syncAll(many, { api: amocrm.makeApi(cfg), cfg: { ...cfg, now: Date.now(), pushBatch: 50, dedupeByPhone: false }, pull: false });
    chk('создано 120', rMany.created === 120 && rMany.pushErr === 0, { created: rMany.created, err: rMany.pushErr });
    chk('в amo ровно 120', (await ctl('/__dump')).leads.length === 120);

    console.log('\n6) RATE-LIMIT 429 → ретрай с бэк-оффом (не теряем пуш)');
    await ctl('/__reset', {}); await ctl('/__throttle', { count: 2 });   // первые 2 вызова → 429
    const dbRL = { leads: [{ id: 'RL', name: 'Ретрай', phone: '+971555000222', stage: 'deal', updatedAt: Date.now(), dealValue: 100000 }] };
    const rRL = await amocrm.syncAll(dbRL, { api: amocrm.makeApi(cfg), cfg: { ...cfg, now: Date.now(), dedupeByPhone: false }, pull: false });
    chk('после 429-ретраев лид всё равно создан', rRL.created === 1 && rRL.pushErr === 0, rRL);

    console.log('\n7) UPDATE удалённой в amo сделки → 404 → сброс amoId → пересоздание');
    await ctl('/__reset', {});
    const dbDel = { leads: [{ id: 'DL', name: 'Удалёж', phone: '+971444000333', stage: 'qualified', updatedAt: Date.now() }] };
    await amocrm.syncAll(dbDel, { api: amocrm.makeApi(cfg), cfg: { ...cfg, now: Date.now(), dedupeByPhone: false }, pull: false });
    const oldAmoId = dbDel.leads[0].amoId;
    await ctl('/__delete', { id: oldAmoId });                         // брокер удалил сделку в amo
    dbDel.leads[0].stage = 'deal'; dbDel.leads[0].updatedAt = Date.now() + 1;
    const rDel = await amocrm.syncAll(dbDel, { api: amocrm.makeApi(cfg), cfg: { ...cfg, now: Date.now() + 1, dedupeByPhone: false }, pull: false });
    chk('404 распознан → помечен на пересоздание', rDel.recreated === 1, rDel);
    chk('amoId сброшен (при следующем синке создастся заново)', dbDel.leads[0].amoId == null || dbDel.leads[0].amoId !== oldAmoId, dbDel.leads[0].amoId);
    const rDel2 = await amocrm.syncAll(dbDel, { api: amocrm.makeApi(cfg), cfg: { ...cfg, now: Date.now() + 2, dedupeByPhone: false }, pull: false });
    chk('пересоздан в amo', rDel2.created === 1 && dbDel.leads[0].amoId != null, rDel2);

    console.log('\n8) ОПТ-АУТ — не создаём нового в amo, но существующего обновляем');
    await ctl('/__reset', {});
    const dbOpt = { leads: [
      { id: 'O1', name: 'Отписался-новый', phone: '+971333000444', stage: 'qualified', updatedAt: Date.now(), marketingOptOut: true },               // без amoId → не создавать
      { id: 'O2', name: 'Отписался-старый', phone: '+971333000555', stage: 'qualified', updatedAt: Date.now(), marketingOptOut: true, amoId: 88888 },  // уже в amo → обновить
    ] };
    // создадим в моке сделку 88888 вручную, чтобы update прошёл
    const apiO = amocrm.makeApi(cfg); await apiO.createLeads([{ name: 'ghost' }]);  // bump seq
    const picked = amocrm.leadsToPush(dbOpt, cfg).map(l => l.id);
    chk('опт-аут без amoId НЕ в очереди на пуш', !picked.includes('O1') && picked.includes('O2'), picked);

    console.log('\n9) PULL + пагинация + защита квалов');
    await ctl('/__reset', {}); await ctl('/__selectfield', { ids: [9003] });
    const apiP = amocrm.makeApi({ ...cfg, pageLimit: 5 });            // маленький лимит → заставим пагинацию
    const dbP = { leads: Array.from({ length: 12 }, (_, i) => ({ id: 'P' + i, name: 'P' + i, phone: '+9716' + String(20000000 + i), stage: 'qualified', updatedAt: Date.now() })) };
    await amocrm.syncAll(dbP, { api: apiP, cfg: { ...cfg, now: Date.now(), dedupeByPhone: false }, pull: false });
    // брокер в amo двигает первый лид в lost
    await ctl('/__setstatus', { id: dbP.leads[0].amoId, status_id: 320 });
    dbP.leads[0].quals = { budget: { value: 'МОЁ-500k' } };
    const rP = await amocrm.pullChanges(dbP, { api: apiP, cfg: { ...cfg, sinceOverlapMs: 0 }, since: 0 });
    chk('пулл прошёл ВСЕ страницы (12 лидов, лимит 5)', rP.pulled === 12, rP);
    chk('стадия подтянулась (lost)', dbP.leads[0].stage === 'lost', dbP.leads[0].stage);
    chk('свой бюджет не затёрт', dbP.leads[0].quals.budget.value === 'МОЁ-500k');

    console.log('\n10) Длинное имя (>250) усечено');
    await ctl('/__reset', {});
    const longName = 'Ж'.repeat(400);
    const dbN = { leads: [{ id: 'N', name: longName, phone: '+971222000666', stage: 'qualified', updatedAt: Date.now() }] };
    await amocrm.syncAll(dbN, { api: amocrm.makeApi(cfg), cfg: { ...cfg, now: Date.now(), dedupeByPhone: false }, pull: false });
    const aN = (await ctl('/__dump')).leads[0];
    chk('имя усечено до 250', aN.name.length === 250, aN.name.length);

    console.log('\n11) АВТО-ОПРЕДЕЛЕНИЕ select-поля — замаплено «голым» id, модуль сам узнаёт у amo тип');
    await ctl('/__reset', {}); await ctl('/__selectfield', { ids: [9003] });   // в amo 9003 — список
    const cfgPlain = { ...cfgBase(), fields: { type: 9003 } };                   // пользователь указал ТОЛЬКО id, без type/enum
    const dbAuto = { leads: [{ id: 'A1', name: 'Авто', phone: '+971111000777', stage: 'qualified', updatedAt: Date.now(), quals: { type: { value: '3BR' } } }] };
    const rAuto = await amocrm.syncAll(dbAuto, { api: amocrm.makeApi(cfgPlain), cfg: { ...cfgPlain, now: Date.now(), dedupeByPhone: false }, pull: false });
    chk('создан без 400 (голый id select-поля не убил пуш)', rAuto.created === 1 && rAuto.pushErr === 0, rAuto);
    const aA = (await ctl('/__dump')).leads[0];
    chk('значение ушло как enum_id (502=3BR), хотя маппинг был «голым»', (aA.custom_fields_values || []).some(f => f.field_id === 9003 && f.values[0].enum_id === 502), aA.custom_fields_values);

    console.log('\n12) ИЗОЛЯЦИЯ битого лида в батче — один плохой не валит остальных');
    await ctl('/__reset', {}); await ctl('/__selectfield', { ids: [9003] });
    // один лид с невалидным select, отправленным как ТЕКСТ (симулируем кривой конфиг: type замаплен как текстовый id 9003, но это select)
    const cfgBad = { ...cfgBase(), fields: { type: { id: 9003, type: 'text' } } };  // намеренно НЕ select → уйдёт как {value} → amo 400 на этом лиде
    const dbMix = { leads: [
      { id: 'G1', name: 'Хороший1', phone: '+9719000001', stage: 'qualified', updatedAt: Date.now() },
      { id: 'BAD', name: 'Битый', phone: '+9719000002', stage: 'qualified', updatedAt: Date.now(), quals: { type: { value: 'что-то' } } },
      { id: 'G2', name: 'Хороший2', phone: '+9719000003', stage: 'qualified', updatedAt: Date.now() },
    ] };
    const rMix = await amocrm.syncAll(dbMix, { api: amocrm.makeApi(cfgBad), cfg: { ...cfgBad, now: Date.now(), dedupeByPhone: false, _fieldMeta: false }, pull: false });
    chk('2 хороших создано, 1 битый в ошибку (не завалил батч)', rMix.created === 2 && rMix.pushErr === 1, rMix);
    chk('G1 и G2 получили amoId', !!dbMix.leads[0].amoId && !!dbMix.leads[2].amoId);
    chk('BAD помечен _amoErr', !dbMix.leads[1].amoId && !!dbMix.leads[1]._amoErr, dbMix.leads[1]._amoErr);

    console.log('\n' + ok + ' ok, ' + fail + ' fail');
  } catch (e) {
    console.log('ИСКЛЮЧЕНИЕ:', e.message, '\n', (e.stack || '').split('\n').slice(0, 5).join('\n'));
    fail++;
  } finally {
    mock.kill('SIGKILL');
    process.exit(fail ? 1 : 0);
  }
})();
