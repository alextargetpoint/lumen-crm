/* Lumen CRM — многоарендное хранилище (SaaS).
   Каждый тенант (агентство) = своя БД-файл: DATA_DIR/tenants/<tid>/db.json.
   Глобальный реестр DATA_DIR/registry.json: тенанты, e-mail→tid, сессии (sid→{tid,role,...}).

   ОБРАТНАЯ СОВМЕСТИМОСТЬ: get()/save()/saveNow()/reset()/reloadFromDisk()/DB_FILE работают
   с ТЕКУЩИМ тенантом (из AsyncLocalStorage), по умолчанию — 'primary'. Старый однопользовательский
   код продолжает работать без изменений — весь трафик идёт в primary, пока обработчик запроса
   не начнёт резолвить тенанта. Старый data/db.json при первом старте мигрируется в primary.

   При переходе на Postgres меняется только этот модуль. */
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const TENANTS_DIR = path.join(DATA_DIR, 'tenants');
const REGISTRY_FILE = path.join(DATA_DIR, 'registry.json');
const LEGACY_DB = path.join(DATA_DIR, 'db.json'); // старый однопользовательский файл
const PRIMARY = 'primary';

const als = new AsyncLocalStorage();

let registry = null;
let seedFn = null;
const tenants = new Map();      // tid -> db (plain object)
const saveTimers = {};          // tid -> timeout

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(TENANTS_DIR)) fs.mkdirSync(TENANTS_DIR, { recursive: true });
}
function tenantDbFile(tid) { return path.join(TENANTS_DIR, tid, 'db.json'); }

/* --- БЭКАПЫ на каждого арендатора + защита от катастрофического стирания --- */
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const lastLeads = {};   // tid -> число лидов при последнем сохранении (детектор подозрительного обнуления)
const KEEP_BACKUPS = 40;
const SAFETY_TAGS = /-(PRE-WIPE|manual|PRE-RESTORE|daily)-/;   /* эти копии НИКОГДА не выпиливаем прунингом */
function backupTenant(tid, tag) {
  const src = tenantDbFile(tid);
  if (!fs.existsSync(src)) return null;
  /* ЦЕЛОСТНОСТЬ: не бэкапим повреждённый исходник — иначе затрём хорошие копии мусором */
  try { const d = JSON.parse(fs.readFileSync(src, 'utf8')); if (!d || typeof d !== 'object' || !Array.isArray(d.leads)) { console.warn('[backup] пропуск ' + tid + ': исходный db без валидного leads[]'); return null; } } catch (e) { console.warn('[backup] пропуск ' + tid + ': исходный db повреждён (' + e.message + ')'); return null; }
  const dir = path.join(BACKUP_DIR, tid);
  try {
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const dst = path.join(dir, `db-${(tag || 'auto')}-${ts}.json`);
    fs.copyFileSync(src, dst);
    /* прунинг: авто-снимки — последние KEEP_BACKUPS; safety-копии (PRE-WIPE/manual/PRE-RESTORE/daily) не трогаем */
    const auto = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !SAFETY_TAGS.test(f)).sort();
    while (auto.length > KEEP_BACKUPS) { try { fs.unlinkSync(path.join(dir, auto.shift())); } catch (e) {} }
    /* daily-копии — держим последние 30 */
    const daily = fs.readdirSync(dir).filter(f => f.includes('-daily-')).sort();
    while (daily.length > 30) { try { fs.unlinkSync(path.join(dir, daily.shift())); } catch (e) {} }
    return dst;
  } catch (e) { console.error('[backup]', tid, e.message); return null; }
}
/* восстановление из последнего ВАЛИДНОГО бэкапа (при повреждении/пропаже db.json) */
function recoverFromBackup(tid) {
  const dir = path.join(BACKUP_DIR, tid);
  if (!fs.existsSync(dir)) return null;
  let files; try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse(); } catch (e) { return null; }
  for (const bf of files) {
    try { const d = JSON.parse(fs.readFileSync(path.join(dir, bf), 'utf8')); if (d && typeof d === 'object' && Array.isArray(d.leads)) { fs.copyFileSync(path.join(dir, bf), tenantDbFile(tid)); console.warn('[store] ⚠ ' + tid + ' восстановлен из бэкапа ' + bf); return d; } } catch (e) {}
  }
  return null;
}
function listBackups(tid) {
  const dir = path.join(BACKUP_DIR, tid);
  if (!fs.existsSync(dir)) return [];
  try { return fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse().map(f => { const st = fs.statSync(path.join(dir, f)); return { name: f, at: st.mtimeMs, size: st.size }; }); } catch (e) { return []; }
}
function restoreBackup(tid, name) {
  const dir = path.join(BACKUP_DIR, tid);
  const src = path.join(dir, path.basename(String(name || '')));
  if (!src.startsWith(dir) || !fs.existsSync(src)) return false;
  backupTenant(tid, 'PRE-RESTORE');              /* сначала бэкап текущего — откат отката возможен */
  fs.copyFileSync(src, tenantDbFile(tid));
  tenants.delete(tid); loadTenant(tid);
  return true;
}
function backupAll(tag) { for (const tid of Object.keys((registry && registry.tenants) || {})) backupTenant(tid, tag); }

function loadRegistry() {
  if (fs.existsSync(REGISTRY_FILE)) {
    try { registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8')); } catch (e) { console.error('[store] registry повреждён:', e.message); registry = null; }
  }
  if (!registry) registry = { tenants: {}, byEmail: {}, sessions: {} };
  registry.tenants = registry.tenants || {};
  registry.byEmail = registry.byEmail || {};
  registry.sessions = registry.sessions || {};
  registry.invites = registry.invites || {};   // token -> {tid, brokerId, email, at}
  registry.resets = registry.resets || {};      // token -> {tid, email, at}  (сброс пароля)
  registry.verifs = registry.verifs || {};      // token -> {tid, email, at}  (верификация e-mail)
  registry.adminSessions = registry.adminSessions || {};   // sid -> {at}  (сессии супер-админа платформы)
  registry.adminAudit = registry.adminAudit || [];         // журнал действий супер-админа
  if (!registry.adminKey) registry.adminKey = require('crypto').randomBytes(20).toString('hex'); // фолбэк-ключ, если нет env PLATFORM_ADMIN_KEY
  return registry;
}
function saveRegistry() {
  const tmp = REGISTRY_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(registry, null, 1));
  fs.renameSync(tmp, REGISTRY_FILE);
}
function getRegistry() { return registry; }

/* --- контекст текущего тенанта --- */
function currentTid() { const s = als.getStore(); return (s && s.tid) || PRIMARY; }
function runInTenant(tid, fn) { return als.run({ tid: tid || PRIMARY }, fn); }
function enterTenant(tid) { als.enterWith({ tid: tid || PRIMARY }); }  // задать контекст на остаток текущего async-стека (для обработчика запроса)

/* --- загрузка/создание тенантов --- */
function loadTenant(tid) {
  if (tenants.has(tid)) return tenants.get(tid);
  let db = null;
  const f = tenantDbFile(tid);
  if (fs.existsSync(f)) {
    try { db = JSON.parse(fs.readFileSync(f, 'utf8')); if (!db || typeof db !== 'object') db = null; } catch (e) { console.error('[store] db тенанта', tid, 'ПОВРЕЖДЁН:', e.message); db = null; }
  }
  if (!db && registry && registry.tenants && registry.tenants[tid]) {
    /* известный тенант, а файл битый/пропал → НЕ сидируем поверх (это была бы потеря данных),
       а восстанавливаем из последнего валидного бэкапа */
    db = recoverFromBackup(tid);
  }
  if (!db) { db = seedFn(); tenants.set(tid, db); saveTenantNow(tid); }
  else tenants.set(tid, db);
  lastLeads[tid] = (tenants.get(tid).leads || []).length;   /* базовая точка для детектора обнуления */
  return db;
}

function createTenant(tid, meta) {
  if (registry.tenants[tid]) return registry.tenants[tid];
  registry.tenants[tid] = Object.assign({ createdAt: Date.now() }, meta || {});
  saveRegistry();
  loadTenant(tid);              // создаст файл из seed, если нет
  return registry.tenants[tid];
}
function listTenants() { return Object.keys(registry.tenants); }

/* --- API (совместимо со старым) --- */
function load(seedFunction) {
  seedFn = seedFunction;
  ensureDirs();
  loadRegistry();
  /* МИГРАЦИЯ: старый data/db.json → tenants/primary/db.json (одноразово) */
  if (fs.existsSync(LEGACY_DB) && !fs.existsSync(tenantDbFile(PRIMARY))) {
    fs.mkdirSync(path.join(TENANTS_DIR, PRIMARY), { recursive: true });
    fs.copyFileSync(LEGACY_DB, tenantDbFile(PRIMARY));
    console.log('[store] мигрировал legacy db.json → tenants/primary/db.json');
  }
  if (!registry.tenants[PRIMARY]) { registry.tenants[PRIMARY] = { name: 'Primary', createdAt: Date.now() }; saveRegistry(); }
  return loadTenant(PRIMARY);   // вернуть primary как раньше (контекста ещё нет)
}

function get() {
  const tid = currentTid();
  if (!tenants.has(tid)) loadTenant(tid);
  return tenants.get(tid);
}

function save() {
  const tid = currentTid();
  clearTimeout(saveTimers[tid]);
  saveTimers[tid] = setTimeout(() => saveTenantNow(tid), 400);
}

function saveTenantNow(tid) {
  const db = tenants.get(tid);
  if (!db) return;
  const f = tenantDbFile(tid);
  /* SEC: защита от катастрофического стирания — если было >5 лидов, а стало 0 или менее 20%,
     сначала снимаем PRE-WIPE бэкап (данные не потеряются при баге/ошибке нового обновления). */
  const newN = (db.leads || []).length;
  const prev = lastLeads[tid];
  if (prev != null && prev > 5 && (newN === 0 || newN < prev * 0.2)) { backupTenant(tid, 'PRE-WIPE'); console.warn(`[store] ⚠ подозрительное сокращение лидов ${tid}: ${prev}→${newN} — сделан PRE-WIPE бэкап`); }
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, f);
  lastLeads[tid] = newN;
}
function saveNow() { saveTenantNow(currentTid()); }

function reset(seedFunction) {
  const tid = currentTid();
  const db = (seedFunction || seedFn)();
  tenants.set(tid, db);
  saveTenantNow(tid);
  return db;
}

function reloadFromDisk() {
  const tid = currentTid();
  const f = tenantDbFile(tid);
  if (fs.existsSync(f)) tenants.set(tid, JSON.parse(fs.readFileSync(f, 'utf8')));
  return tenants.get(tid);
}

let idCounter = Date.now() % 1e8;
function nextId(prefix) { idCounter += 1; return prefix + '_' + idCounter.toString(36); }

module.exports = {
  load, get, save, saveNow, reset, reloadFromDisk, nextId,
  // многоарендность:
  runInTenant, enterTenant, currentTid, PRIMARY,
  getRegistry, saveRegistry, createTenant, listTenants, loadTenant,
  // бэкапы:
  backupTenant, listBackups, restoreBackup, backupAll,
};
Object.defineProperty(module.exports, 'DB_FILE', { get() { return tenantDbFile(currentTid()); }, enumerable: true });
