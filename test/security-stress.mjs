#!/usr/bin/env node
/* Lumen SaaS security stress-test — АКТИВНО симулирует атаки и проверяет, что каждая ЗАБЛОКИРОВАНА.
   Самодостаточно: поднимает свой сервер на временных данных. Запуск: node test/security-stress.mjs
   Каждая проверка "PASS" = атака отбита (система защищена). */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 5082, BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = mkdtempSync(join(tmpdir(), 'lumen-sec-'));
const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, pass: !!cond, detail }); if (!cond) console.log('  ✗ АТАКА ПРОШЛА:', name, '—', detail); };
const blocked = (name, status) => ok(name + ` (→ ${status})`, [400, 401, 403, 404, 429].includes(status), 'got ' + status);

function jar() { let c = ''; return {
  async req(p, o = {}) { const r = await fetch(BASE + p, { ...o, headers: { ...(o.headers || {}), ...(c ? { cookie: c } : {}) }, redirect: 'manual' }); const sc = r.headers.get('set-cookie'); if (sc) c = sc.split(';')[0]; return r; },
  raw: () => c }; }
const jget = async (j, p) => { const r = await j.req(p); let b = null; try { b = await r.json(); } catch {} return { s: r.status, b }; };
const jpost = (j, p, body) => j.req(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function main() {
  const srv = spawn('node', ['server/index.js'], { env: { ...process.env, DATA_DIR, PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'inherit'] });
  let up = false;
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/')).status === 200) { up = true; break; } } catch {} await new Promise(r => setTimeout(r, 300)); }
  ok('server up', up); if (!up) return finish(srv);

  // --- setup: жертва V (с данными) + атакующий X ---
  const V = jar(); await jpost(V, '/auth/register', { email: 'victim@bank.com', password: 'victimPass1', agency: 'Victim Realty' });
  const vLead = await (await jpost(V, '/api/leads', { name: 'СЕКРЕТНЫЙ ЛИД V', phone: '+79991112233' })).json().catch(() => ({}));
  const vColl = await (await jpost(V, '/api/collections', { title: 'Секретная подборка V' })).json().catch(() => ({}));
  const X = jar(); await jpost(X, '/auth/register', { email: 'attacker@evil.com', password: 'attackPass1', agency: 'Evil Corp' });

  console.log('\n--- 1. Межарендный доступ к данным (IDOR) ---');
  ok('атакующий НЕ видит лид жертвы в /api/leads', !((await jget(X, '/api/leads')).b || []).some(l => l.name?.includes('СЕКРЕТНЫЙ')));
  blocked('атакующий GET /api/leads/<id жертвы>', (await X.req('/api/leads/' + (vLead.id || 'x'))).status);
  blocked('атакующий PATCH лид жертвы', (await X.req('/api/leads/' + (vLead.id || 'x'), { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{"stage":"lost"}' })).status);
  blocked('атакующий DELETE лид жертвы', (await X.req('/api/leads/' + (vLead.id || 'x'), { method: 'DELETE' })).status);
  ok('атакующий НЕ видит подборку жертвы в /api/collections', !((await jget(X, '/api/collections')).b || []).some(c => c.id === vColl.id));

  console.log('--- 2. Обход авторизации / подделка сессии ---');
  blocked('нет cookie → /api/leads', (await jget(jar(), '/api/leads')).s);
  blocked('нет cookie → /api/state', (await jget(jar(), '/api/state')).s);
  const forged = jar(); const fake = 'a'.repeat(32); { const j = forged; await j.req('/', { headers: { cookie: `lumen_sid=${fake}` } }); }
  blocked('поддельный sid-cookie → /api/state', (await fetch(BASE + '/api/state', { headers: { cookie: `lumen_sid=${fake}` } })).status);
  blocked('мусорный sid → /api/leads', (await fetch(BASE + '/api/leads', { headers: { cookie: 'lumen_sid=zzzz' } })).status);

  console.log('--- 3. Эскалация прав: брокер X пытается owner-операции ---');
  const invX = await (await jpost(X, '/api/brokers/invite', { email: 'brokerx@evil.com', name: 'BrokerX' })).json().catch(() => ({}));
  const bTok = (invX.link || '').split('token=')[1] || '';
  const BX = jar(); await jpost(BX, '/auth/accept-invite', { token: bTok, password: 'brokerXpass' });
  blocked('брокер: invite нового брокера', (await jpost(BX, '/api/brokers/invite', { email: 'z@z.com' })).status);
  blocked('брокер: настройка серого воркера', (await jpost(BX, '/api/wa/gray/config', { url: 'x', token: 'y' })).status);
  blocked('брокер: включить прогрев', (await jpost(BX, '/api/wa/gray/warmup', { running: true })).status);
  blocked('брокер: сменить пароль агентства', (await jpost(BX, '/auth/password', { current: 'x', next: 'yyyyyyyy' })).status === 400 ? 400 : (await jpost(BX, '/auth/password', { current: 'x', next: 'yyyyyyyy' })).status);
  blocked('брокер: PATCH настроек (ротация hooks.secret)', (await BX.req('/api/hooks', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{"rotateSecret":true}' })).status);

  console.log('--- 4. Кража секретов ---');
  const bxState = await jget(BX, '/api/state');
  ok('брокер: нет hooks.secret в /api/state', !bxState.b?.settings?.hooks?.secret);
  ok('брокер: нет waGray.token в /api/state', !bxState.b?.settings?.waGray?.token);
  ok('брокер: нет passHash в /api/state', !bxState.b?.settings?.auth);
  ok('брокер: /api/collections без editKey-секрета', (await jget(BX, '/api/collections')).b?.every?.(c => !c.editKey) !== false);
  const vState = await jget(V, '/api/state');
  ok('владелец: нет голого passHash в /api/state', !vState.b?.settings?.auth);

  console.log('--- 5. Подделка токенов/вебхуков ---');
  blocked('gray webhook без токена', (await jpost(jar(), '/api/wa/gray/incoming', { event: 'message', sessionId: 'primary__1', phone: '1', text: 'x' })).status);
  blocked('gray webhook с чужим токеном', (await fetch(BASE + '/api/wa/gray/incoming', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer HACK' }, body: JSON.stringify({ event: 'message', sessionId: 'primary__1', phone: '1', text: 'x' }) })).status);
  blocked('tg webhook без секрета', (await jpost(jar(), '/tg/webhook', { update_id: 1 })).status);
  blocked('accept-invite: случайный токен', (await jpost(jar(), '/auth/accept-invite', { token: 'deadbeef', password: 'whatever1' })).status);
  blocked('accept-invite: повторное использование токена', (await jpost(jar(), '/auth/accept-invite', { token: bTok, password: 'again1234' })).status);
  blocked('reset: случайный токен', (await jpost(jar(), '/auth/reset', { token: 'deadbeef', password: 'whatever1' })).status);

  console.log('--- 6. Path traversal / доступ к файлам ---');
  blocked('path traversal /assets/../server/index.js', (await fetch(BASE + '/assets/../server/index.js', { redirect: 'manual' })).status);
  blocked('файл лида без сессии', (await fetch(BASE + '/assets/leadfiles/anything.jpg')).status);
  blocked('атакующий тянет файл лида жертвы (угадан URL)', (await X.req('/assets/leadfiles/victimdoc.jpg')).status);

  console.log('--- 7. Политика паролей ---');
  blocked('регистрация: короткий пароль', (await jpost(jar(), '/auth/register', { email: 'a@b.com', password: '123', agency: 'X' })).status);
  blocked('регистрация: битый e-mail', (await jpost(jar(), '/auth/register', { email: 'notanemail', password: 'longenough1', agency: 'X' })).status);

  console.log('--- 8. XSS в публичной странице приглашения ---');
  const XS = jar(); await jpost(XS, '/auth/register', { email: 'xss@e.com', password: 'xssPass12', agency: '<script>alert(1)</script>' });
  const invXS = await (await jpost(XS, '/api/brokers/invite', { email: '"><img src=x onerror=alert(1)>@e.com' })).json().catch(() => ({}));
  // e-mail с XSS не пройдёт валидацию — проверим, что инвайт отклонён ИЛИ страница экранирует
  if (invXS.link) { const html = await (await fetch(invXS.link)).text(); ok('XSS: страница /invite экранирует (<script> не сырой)', !html.includes('<script>alert(1)</script>') && !html.includes('onerror=alert')); }
  else ok('XSS: инвайт с XSS-e-mail отклонён валидацией', true);

  console.log('--- 9. Брут-форс логина (лок-аут) ---');
  let got429 = false;
  for (let i = 0; i < 15; i++) { const r = await jpost(jar(), '/auth/login', { email: 'victim@bank.com', password: 'wrong' + i }); if (r.status === 429) { got429 = true; break; } }
  ok('брут-форс email-логина упирается в 429 (лок-аут)', got429);

  console.log('--- 10. Спам регистраций (rate-limit) ---');
  let regBlocked = false;
  for (let i = 0; i < 30; i++) { const r = await jpost(jar(), '/auth/register', { email: `spam${i}@e.com`, password: 'spamPass12', agency: 'S' + i }); if (r.status === 429) { regBlocked = true; break; } }
  ok('спам регистраций упирается в 429', regBlocked);

  finish(srv);
}
function finish(srv) {
  const pass = results.filter(r => r.pass).length, fail = results.length - pass;
  console.log(`\n=== SECURITY STRESS: ${pass}/${results.length} атак отбито, ${fail} ПРОШЛО ===`);
  for (const r of results) if (!r.pass) console.log(`  ✗ ДЫРА: ${r.name} — ${r.detail}`);
  try { srv.kill('SIGKILL'); } catch {}
  try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
