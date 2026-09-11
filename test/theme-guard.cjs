#!/usr/bin/env node
/* Lumen theme-guard — статический сторож ТЕМО-БЕЗОПАСНОСТИ CSS.
   Запуск: node test/theme-guard.cjs   (без сервера/браузера, мгновенно)

   Зачем: стилей много (light/dark/mono/warm/frame/emerald/atelier). Легко написать
   тему-scoped правило, которое перекрашивает .btn (фон/цвет) и НЕЧАЯННО ловит активную
   плашку-таб (.active/.on) → текст сливается (был реальный баг: «Всё» в карточке лида —
   уголь-по-углю в Ателье, белый-по-белому в Стекле). Этот линт ловит паттерн ДО прода.

   Правило-инвариант: любое правило вида
     :root[data-theme="X"] .btn:not(...)  { background|color: ... }
   ОБЯЗАНО исключать активные состояния: :not(.active):not(.on).
   Иначе активная плашка (её фон/цвет задаёт базовый .active) будет перекрашена темой. */
const fs = require('fs');
const path = require('path');
const CSS = path.join(__dirname, '..', 'public', 'styles.css');
const src = fs.readFileSync(CSS, 'utf8');
const lines = src.split('\n');
const problems = [];

lines.forEach((ln, i) => {
  // тему-scoped селектор, трогающий .btn с :not(...), меняющий фон или цвет
  if (!/:root\[data-theme=/.test(ln)) return;
  if (!/\.btn:not\(/.test(ln)) return;
  // селектор до '{'
  const sel = ln.split('{')[0];
  const decl = ln.slice(ln.indexOf('{'));
  const touchesPaint = /(^|[^-])(background|color)\s*:/.test(decl);
  if (!touchesPaint) return;
  const guardsActive = /:not\(\.active\)/.test(sel) && /:not\(\.on\)/.test(sel);
  if (!guardsActive) problems.push({ line: i + 1, text: ln.trim().slice(0, 120) });
});

if (problems.length) {
  console.error('\x1b[31m✗ theme-guard: тему-scoped .btn-правила без :not(.active):not(.on) — активные плашки сольются:\x1b[0m');
  problems.forEach(p => console.error(`  styles.css:${p.line}  ${p.text}`));
  console.error(`\n  Почини: добавь :not(.active):not(.on) в селектор, и/или задай активной плашке явный светлый текст.`);
  process.exit(1);
}
console.log('\x1b[32m✓ theme-guard: все тему-scoped .btn-правила исключают активные плашки (' + lines.length + ' строк проверено)\x1b[0m');
