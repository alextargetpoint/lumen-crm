/* Гейт выката: единственная команда перед пушем в прод.
   Прогоняет обязательные проверки (изоляция/авторизация + антивзлом), пишет release.json
   (его читает вкладка «Релиз» в админке) и возвращает вердикт. FAIL → пуш ЗАПРЕЩЁН.
   Запуск: node test/release-gate.mjs [note] */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

function run(cmd) {
  try { return { code: 0, out: execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { code: e.status || 1, out: (e.stdout || '') + (e.stderr || '') }; }
}

const SUITES = [
  { key: 'saasAuth', name: 'Изоляция тенантов и авторизация', cmd: 'node test/saas-auth.mjs', rx: /(\d+)\/(\d+) passed/ },
  { key: 'security', name: 'Антивзлом (стресс-атаки)', cmd: 'node test/security-stress.mjs', rx: /(\d+)\/(\d+) атак отбито/ },
];

const res = {}; let allPass = true;
for (const s of SUITES) {
  const r = run(s.cmd);
  const m = r.out.match(s.rx);
  const summary = m ? m[0] : (r.code === 0 ? 'ok' : 'FAIL');
  const passed = r.code === 0;
  if (!passed) allPass = false;
  res[s.key] = { name: s.name, passed, summary };
  console.log(`${passed ? '✓' : '✗'} ${s.name}: ${summary}`);
}

let git = '';
try { git = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim() + ' · ' + execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim(); } catch (e) {}
let appVer = '';
try { const h = execSync('grep -oE "app.js\\?v=[0-9]+" public/index.html', { encoding: 'utf8' }); appVer = (h.match(/\d+/) || [''])[0]; } catch (e) {}

const status = { at: new Date().toISOString(), git, appVersion: appVer, note: process.argv[2] || '', suites: res, passed: allPass };
writeFileSync('release.json', JSON.stringify(status, null, 2));

console.log(`\n=== ГЕЙТ ВЫКАТА: ${allPass ? 'PASS ✅ — можно пушить в прод' : 'FAIL ⛔ — ПУШ ЗАПРЕЩЁН, чините тесты'} ===`);
console.log('release.json обновлён (виден в админке → Релиз).');
process.exit(allPass ? 0 : 1);
