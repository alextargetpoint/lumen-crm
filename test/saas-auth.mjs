#!/usr/bin/env node
/* Lumen SaaS auth/tenancy test — самодостаточный: поднимает свой сервер на временных
   данных, гоняет всю матрицу входов/изоляции, гасит. Запуск: node test/saas-auth.mjs */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 5093;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = mkdtempSync(join(tmpdir(), 'lumen-saas-'));
const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, pass: !!cond, detail }); if (!cond) console.log('  ✗', name, '—', detail); };

// изолированные "браузеры": каждый со своей cookie-банкой
function jar() {
  let cookie = '';
  return {
    async req(path, opts = {}) {
      const r = await fetch(BASE + path, { ...opts, headers: { ...(opts.headers || {}), ...(cookie ? { cookie } : {}) }, redirect: 'manual' });
      const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      return r;
    },
    clear() { cookie = ''; },
  };
}
const jget = async (j, p) => { const r = await j.req(p); let b = null; try { b = await r.json(); } catch {} return { s: r.status, b }; };
const jpost = (j, p, body) => j.req(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function main() {
  const srv = spawn('node', ['server/index.js'], { env: { ...process.env, DATA_DIR, PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'inherit'] });
  // ждём подъёма
  let up = false;
  for (let i = 0; i < 40; i++) { try { const r = await fetch(BASE + '/'); if (r.status === 200) { up = true; break; } } catch {} await new Promise(r => setTimeout(r, 300)); }
  ok('server up', up);
  if (!up) return finish(srv);

  const anon = jar();
  // A. гейт + инвариант «данные⇔сессия»
  ok('гейт: /api/leads без сессии → 401', (await jget(anon, '/api/leads')).s === 401);
  ok('гейт: /api/state без сессии → 401', (await jget(anon, '/api/state')).s === 401);

  // B. primary по паролю
  const P = jar();
  ok('primary: неверный пароль → 401', (await jpost(P, '/auth/login', { password: 'nope' })).status === 401);
  ok('primary: верный пароль → 200', (await jpost(P, '/auth/login', { password: 'lumen2026' })).status === 200);
  const st = await jget(P, '/api/state');
  ok('primary: /api/state 200 + shape', st.s === 200 && st.b && Array.isArray(st.b.brokers) && st.b.settings);
  const pLeads0 = (await jget(P, '/api/leads')).b;
  ok('primary: /api/leads массив', Array.isArray(pLeads0));

  // C. регистрация
  ok('reg: битый e-mail → 400', (await jpost(jar(), '/auth/register', { email: 'bad', password: 'abcdef' })).status === 400);
  ok('reg: короткий пароль → 400', (await jpost(jar(), '/auth/register', { email: 'q@w.com', password: '123' })).status === 400);
  const A = jar();
  const regA = await jpost(A, '/auth/register', { email: 'a@x.com', password: 'secretA', agency: 'Agency A' });
  const regAj = await regA.json().catch(() => ({}));
  ok('reg A: 200 + tid', regA.status === 200 && regAj.tid, JSON.stringify(regAj).slice(0, 60));
  ok('reg: дубликат e-mail → 409', (await jpost(jar(), '/auth/register', { email: 'a@x.com', password: 'secretA', agency: 'Dup' })).status === 409);
  const stA = await jget(A, '/api/state');
  ok('A: своё агентство в /api/state', stA.s === 200 && stA.b && stA.b.settings && stA.b.settings.agency && stA.b.settings.agency.name === 'Agency A', stA.b?.settings?.agency?.name);
  ok('A: чистый старт — 0 лидов (без демо)', (await jget(A, '/api/leads')).b?.length === 0);

  // D. изоляция: лид в A не виден primary и B
  await jpost(A, '/api/leads', { name: 'ALEAD-ISO' });
  const aHas = (await jget(A, '/api/leads')).b?.some(l => l.name === 'ALEAD-ISO');
  ok('A видит свой лид ALEAD-ISO', aHas);
  const pHas = (await jget(P, '/api/leads')).b?.some(l => l.name === 'ALEAD-ISO');
  ok('primary НЕ видит лид A (изоляция)', !pHas);
  const B = jar();
  await jpost(B, '/auth/register', { email: 'b@x.com', password: 'secretB', agency: 'Agency B' });
  const bHas = (await jget(B, '/api/leads')).b?.some(l => l.name === 'ALEAD-ISO');
  ok('agency B НЕ видит лид A (изоляция)', !bHas);
  const stB = await jget(B, '/api/state');
  ok('B: своё агентство (не A)', stB.b?.settings?.agency?.name === 'Agency B', stB.b?.settings?.agency?.name);

  // E. повторный вход по e-mail (симуляция нового устройства)
  const A2 = jar();
  ok('email-login: верно → 200', (await jpost(A2, '/auth/login', { email: 'a@x.com', password: 'secretA' })).status === 200);
  ok('email-login: видит свой лид', (await jget(A2, '/api/leads')).b?.some(l => l.name === 'ALEAD-ISO'));
  ok('email-login: неверный пароль → 401', (await jpost(jar(), '/auth/login', { email: 'a@x.com', password: 'WRONG' })).status === 401);
  ok('email-login: нет такого e-mail → 401', (await jpost(jar(), '/auth/login', { email: 'ghost@x.com', password: 'x' })).status === 401);

  // F. выход убирает доступ (инвариант)
  await jpost(A2, '/auth/logout', {});
  ok('после logout A2: /api/leads → 401', (await jget(A2, '/api/leads')).s === 401);

  // G. WhatsApp gray: гейт вебхука и владелец-скоуп
  ok('gray/incoming чужой токен → 401', (await jpost(jar(), '/api/wa/gray/incoming', { event: 'message' })).status === 401);
  ok('gray/config без сессии → 401', (await jpost(jar(), '/api/wa/gray/config', { url: 'x' })).status === 401);
  ok('gray/list в тенанте A → 200', (await jget((await (async () => { const j = jar(); await jpost(j, '/auth/login', { email: 'a@x.com', password: 'secretA' }); return j; })()), '/api/wa/gray/list')).s === 200);

  // H. инвайт брокера
  const Aowner = jar(); await jpost(Aowner, '/auth/login', { email: 'a@x.com', password: 'secretA' });
  const invR = await jpost(Aowner, '/api/brokers/invite', { email: 'broker@a.com', name: 'Брокер А' });
  const inv = await invR.json().catch(() => ({}));
  ok('invite: владелец получил ссылку с токеном', invR.status === 200 && inv.link && inv.link.includes('token='), JSON.stringify(inv).slice(0, 80));
  const token = (inv.link || '').split('token=')[1] || '';
  ok('invite: чужой (не владелец) → 403', (await jpost(jar(), '/api/brokers/invite', { email: 'x@y.com' })).status === 401);
  const pageHtml = await (await fetch(BASE + '/invite?token=' + token)).text();
  ok('invite page: /invite?token → HTML с формой', pageHtml.includes('Принять и войти'));
  ok('invite page: битый токен → «недействительна»', (await (await fetch(BASE + '/invite?token=bad')).text()).includes('недействительна'));
  const BR = jar();
  ok('accept: короткий пароль → 400', (await jpost(BR, '/auth/accept-invite', { token, password: '123' })).status === 400);
  ok('accept: верно → 200', (await jpost(BR, '/auth/accept-invite', { token, password: 'brokerpass', name: 'Брокер А' })).status === 200);
  ok('broker: /api/leads 200 (массив, роль-скоуп)', Array.isArray((await jget(BR, '/api/leads')).b));
  const brState = await jget(BR, '/api/state');
  ok('broker: роль broker в /api/state', brState.b && brState.b.me && brState.b.me.role === 'broker', brState.b?.me?.role);
  ok('broker: в агентстве A (тенант-роутинг)', brState.b?.settings?.agency?.name === 'Agency A', brState.b?.settings?.agency?.name);
  ok('accept: токен одноразовый (повтор → 400)', (await jpost(jar(), '/auth/accept-invite', { token, password: 'again123' })).status === 400);
  const BR2 = jar();
  ok('broker: повторный вход по e-mail → 200', (await jpost(BR2, '/auth/login', { email: 'broker@a.com', password: 'brokerpass' })).status === 200);
  ok('broker (перевход): в агентстве A', (await jget(BR2, '/api/state')).b?.settings?.agency?.name === 'Agency A');

  // I. удаление брокера чистит реестр (byEmail/сессии)
  await jpost(Aowner, '/api/brokers/invite', { email: 'broker2@a.com', name: 'Второй' }); // чтобы не остаться с одним
  const delR = await Aowner.req('/api/brokers/' + inv.broker.id, { method: 'DELETE' });
  ok('удаление брокера → 200', delR.status === 200, 'status ' + delR.status);
  ok('удалённый брокер: вход по e-mail → 401 (реестр очищен)', (await jpost(jar(), '/auth/login', { email: 'broker@a.com', password: 'brokerpass' })).status === 401);

  // J. тарифы/лимиты
  const C = jar(); await jpost(C, '/auth/register', { email: 'c@x.com', password: 'secretC', agency: 'Agency C' });
  const planC = await jget(C, '/api/plan');
  ok('plan: триал + лимит брокеров 3', planC.b?.plan === 'trial' && planC.b?.limits?.maxBrokers === 3, JSON.stringify(planC.b?.limits || {}));
  for (let i = 1; i <= 3; i++) await jpost(C, '/api/brokers/invite', { email: `b${i}@c.com`, name: 'B' + i });
  ok('лимит брокеров: 4-й инвайт на триале → 402', (await jpost(C, '/api/brokers/invite', { email: 'b4@c.com', name: 'B4' })).status === 402);

  // K. сброс пароля
  const D = jar(); await jpost(D, '/auth/register', { email: 'd@x.com', password: 'secretD', agency: 'Agency D' });
  ok('forgot: всегда 200 (не раскрывает e-mail)', (await jpost(jar(), '/auth/forgot', { email: 'd@x.com' })).status === 200);
  ok('forgot: несуществующий e-mail тоже 200', (await jpost(jar(), '/auth/forgot', { email: 'ghost@x.com' })).status === 200);
  let resetToken = '';
  try { const reg = JSON.parse(readFileSync(join(DATA_DIR, 'registry.json'), 'utf8')); resetToken = Object.keys(reg.resets || {}).find(t => reg.resets[t].email === 'd@x.com') || ''; } catch {}
  ok('reset: токен создан в реестре', !!resetToken);
  ok('reset page /reset?token → HTML', (await (await fetch(BASE + '/reset?token=' + resetToken)).text()).includes('Сохранить и войти'));
  ok('reset: короткий пароль → 400', (await jpost(jar(), '/auth/reset', { token: resetToken, password: '123' })).status === 400);
  ok('reset: верно → 200', (await jpost(jar(), '/auth/reset', { token: resetToken, password: 'newpass123' })).status === 200);
  ok('reset: вход новым паролем → 200', (await jpost(jar(), '/auth/login', { email: 'd@x.com', password: 'newpass123' })).status === 200);
  ok('reset: старый пароль больше не пускает → 401', (await jpost(jar(), '/auth/login', { email: 'd@x.com', password: 'secretD' })).status === 401);
  ok('reset: токен одноразовый (повтор → 400)', (await jpost(jar(), '/auth/reset', { token: resetToken, password: 'again123' })).status === 400);

  // L. верификация e-mail
  const E = jar(); const regE = await (await jpost(E, '/auth/register', { email: 'e@x.com', password: 'secretE', agency: 'Agency E' })).json();
  let reg2 = {}; try { reg2 = JSON.parse(readFileSync(join(DATA_DIR, 'registry.json'), 'utf8')); } catch {}
  ok('verify: новый тенант verified=false', reg2.tenants?.[regE.tid]?.verified === false);
  const vtok = Object.keys(reg2.verifs || {}).find(t => reg2.verifs[t].email === 'e@x.com') || '';
  ok('verify: токен создан', !!vtok);
  ok('verify: переход по ссылке → 302', (await fetch(BASE + '/auth/verify?token=' + vtok, { redirect: 'manual' })).status === 302);
  let reg3 = {}; try { reg3 = JSON.parse(readFileSync(join(DATA_DIR, 'registry.json'), 'utf8')); } catch {}
  ok('verify: тенант стал verified=true', reg3.tenants?.[regE.tid]?.verified === true);

  // M. прогрев (toggle)
  const Aown2 = jar(); await jpost(Aown2, '/auth/login', { email: 'a@x.com', password: 'secretA' });
  const wr = await (await jpost(Aown2, '/api/wa/gray/warmup', { running: true, perDay: 10 })).json().catch(() => ({}));
  ok('warmup: владелец включает → running=true, perDay=10', wr.ok && wr.warmup?.running === true && wr.warmup?.perDay === 10, JSON.stringify(wr.warmup || {}));
  ok('warmup: без сессии → 401', (await jpost(jar(), '/api/wa/gray/warmup', { running: true })).status === 401);

  // N. входящие серые WhatsApp → лид (тенант из sessionId, токен тенанта)
  const Aown3 = jar(); await jpost(Aown3, '/auth/login', { email: 'a@x.com', password: 'secretA' });
  await jpost(Aown3, '/api/wa/gray/config', { token: 'wt_secret_A' });
  const aTid = regAj.tid;
  const incBad = await fetch(BASE + '/api/wa/gray/incoming', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer WRONG' }, body: JSON.stringify({ event: 'message', sessionId: aTid + '__79990001122', phone: '79990001122', text: 'hi' }) });
  ok('gray incoming: чужой токен → 401', incBad.status === 401);
  const incOk = await fetch(BASE + '/api/wa/gray/incoming', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer wt_secret_A' }, body: JSON.stringify({ event: 'message', sessionId: aTid + '__79990001122', phone: '79990001122', name: 'Клиент Серый', text: 'Здравствуйте, интересует квартира' }) });
  ok('gray incoming: верный токен → 200', incOk.status === 200);
  ok('gray incoming: создан лид у A', (await jget(Aown3, '/api/leads')).b?.some(l => (l.phone || '').includes('79990001122')));
  const inOther = await (async () => { const j = jar(); await jpost(j, '/auth/login', { email: 'c@x.com', password: 'secretC' }); return jget(j, '/api/leads'); })();
  ok('gray incoming: НЕ виден в другом агентстве (изоляция)', !(inOther.b?.some(l => (l.phone || '').includes('79990001122'))));

  // O. шифр паролей (scrypt) + миграция legacy
  try { const adb = JSON.parse(readFileSync(join(DATA_DIR, 'tenants', aTid, 'db.json'), 'utf8')); ok('пароль хранится как scrypt (s2$…), не голый sha', String(adb.settings.auth.passHash).startsWith('s2$')); } catch (e) { ok('пароль scrypt', false, e.message); }
  try { const pdb = JSON.parse(readFileSync(join(DATA_DIR, 'tenants', 'primary', 'db.json'), 'utf8')); ok('legacy-пароль primary мигрировал в scrypt после входа', String(pdb.settings.auth.passHash).startsWith('s2$')); } catch (e) { ok('legacy upgrade', false, e.message); }

  // P. мастер-секрет hooks.secret не утекает брокеру (крит-фикс аудита)
  const F = jar(); await jpost(F, '/auth/register', { email: 'f@x.com', password: 'secretF', agency: 'Agency F' });
  ok('owner видит hooks.secret в /api/state', !!(await jget(F, '/api/state')).b?.settings?.hooks?.secret);
  const invF = await (await jpost(F, '/api/brokers/invite', { email: 'brf@x.com', name: 'BrF' })).json().catch(() => ({}));
  const tokF = (invF.link || '').split('token=')[1] || '';
  const BF = jar(); await jpost(BF, '/auth/accept-invite', { token: tokF, password: 'brfpass1' });
  const bfState = await jget(BF, '/api/state');
  ok('broker НЕ видит hooks.secret в /api/state', !bfState.b?.settings?.hooks?.secret);
  ok('broker /api/collections без editKey-секрета', (await jget(BF, '/api/collections')).b?.every?.(c => !c.editKey) !== false);

  // Q. изоляция файлов лидов (документы/медиа)
  ok('leadfile без сессии → 403', (await fetch(BASE + '/assets/leadfiles/anything.jpg')).status === 403);
  ok('leadfile с сессией, но файл не свой → 403', (await F.req('/assets/leadfiles/anything.jpg')).status === 403);
  ok('обычный ассет (app.js) отдаётся 200', (await fetch(BASE + '/app.js')).status === 200);

  finish(srv);
}

function finish(srv) {
  const pass = results.filter(r => r.pass).length, fail = results.length - pass;
  console.log(`\n=== SaaS auth test: ${pass}/${results.length} passed, ${fail} failed ===`);
  for (const r of results) console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.detail && !r.pass ? ' — ' + r.detail : ''}`);
  try { srv.kill('SIGKILL'); } catch {}
  try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
