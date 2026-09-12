#!/usr/bin/env node
/* Lumen SaaS auth/tenancy test — самодостаточный: поднимает свой сервер на временных
   данных, гоняет всю матрицу входов/изоляции, гасит. Запуск: node test/saas-auth.mjs */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
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
