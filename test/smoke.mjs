#!/usr/bin/env node
/* Lumen smoke-test — быстрый регресс-сторож ключевых инвариантов.
   Запуск: node test/smoke.mjs  (сервер должен работать на :5077)
   Ловит поломки от параллельных правок: мёртвые эндпоинты, битые шейпы,
   не-рендерящийся арт-документ, «undefined/NaN» в выводе, отсутствие ассетов. */
const BASE = process.env.LUMEN_BASE || 'http://localhost:5077';
const PW = process.env.LUMEN_PW || 'lumen2026';
let cookie = '';
const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, pass: !!cond, detail }); };

async function req(path, opts = {}) {
  const r = await fetch(BASE + path, { ...opts, headers: { ...(opts.headers || {}), ...(cookie ? { cookie } : {}) }, redirect: 'manual' });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  return r;
}
const isArr = x => Array.isArray(x);

async function run() {
  // 1) server up
  try { const r = await req('/'); ok('server up (200)', r.status === 200); }
  catch (e) { ok('server up (200)', false, e.message); console.log(fmt()); process.exit(1); }

  // 2) login
  const lr = await req('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: PW }) });
  const lj = await lr.json().catch(() => ({}));
  ok('login works', lr.status === 200 && (lj.ok || lj.role), JSON.stringify(lj).slice(0, 60));

  // 3) core data endpoints return sane shapes
  const checks = [
    ['/api/state', j => j && isArr(j.brokers) && j.settings && j.me],
    ['/api/leads', j => isArr(j)],
    ['/api/collections', j => isArr(j)],
    ['/api/campaigns', j => isArr(j)],
    ['/api/moodboard', j => j && isArr(j.items)],
  ];
  for (const [path, shape] of checks) {
    try { const r = await req(path); const j = await r.json(); ok(`GET ${path} shape`, r.status === 200 && shape(j), 'status ' + r.status); }
    catch (e) { ok(`GET ${path} shape`, false, e.message); }
  }

  // 4) static app assets serve
  for (const a of ['/app.js', '/styles.css', '/index.html']) {
    const r = await req(a); ok(`asset ${a}`, r.status === 200);
  }

  // 5) art-document (подборки design engine) renders for the first collection
  try {
    const cr = await req('/api/collections'); const cols = await cr.json();
    if (isArr(cols) && cols.length) {
      const id = cols[0].id;
      for (const q of ['?design=1', '?design=1&print=1', '?design=1&style=darkluxury', '?design=1&seed=7']) {
        const r = await fetch(`${BASE}/p/${id}${q}`); const html = await r.text();
        const clean = r.status === 200 && html.length > 5000 && !/\bundefined\b|\bNaN\b|\[object Object\]|Cannot read|is not defined/.test(html);
        ok(`art-doc /p/:id${q}`, clean, `status ${r.status}, ${html.length}b`);
      }
    } else ok('art-doc render', true, 'no collections to test (skipped)');
  } catch (e) { ok('art-doc render', false, e.message); }

  // 6) moodboard image refs are not dangling (broken sticker 404s)
  try {
    const r = await req('/api/moodboard'); const j = await r.json();
    let dangling = 0;
    for (const it of (j.items || [])) {
      if (it.url && it.url.startsWith('/assets/')) {
        const ar = await fetch(BASE + it.url, { method: 'HEAD' });
        if (ar.status === 404) dangling++;
      }
    }
    ok('moodboard no dangling images', dangling === 0, dangling + ' broken refs');
  } catch (e) { ok('moodboard no dangling images', false, e.message); }

  console.log(fmt());
  const failed = results.filter(r => !r.pass).length;
  process.exit(failed ? 1 : 0);
}
function fmt() {
  return results.map(r => `${r.pass ? '✓' : '✗ FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`).join('\n')
    + `\n\n${results.filter(r => r.pass).length}/${results.length} passed`;
}
run().catch(e => { console.error('smoke crashed:', e); process.exit(1); });
