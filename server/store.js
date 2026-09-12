/* Lumen CRM — хранилище: JSON-файл с отложенной записью.
   Абстракция намеренно тонкая: db — plain-объект, save() — debounce-запись.
   При переходе на Firebase/Postgres меняется только этот модуль. */
const fs = require('fs');
const path = require('path');

/* DATA_DIR из окружения — для облака (том Railway монтируется, напр., на /data).
   Локально по умолчанию — ../data, поведение не меняется. */
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let db = null;
let saveTimer = null;

function load(seedFn) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
      console.error('[store] db.json повреждён, пересоздаю из seed:', e.message);
      db = null;
    }
  }
  if (!db) {
    db = seedFn();
    saveNow();
  }
  return db;
}

function get() {
  if (!db) throw new Error('store not loaded');
  return db;
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}

function saveNow() {
  if (!db) return;
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DB_FILE);
}

function reset(seedFn) {
  db = seedFn();
  saveNow();
  return db;
}

let idCounter = Date.now() % 1e8;
function nextId(prefix) {
  idCounter += 1;
  return prefix + '_' + idCounter.toString(36);
}

module.exports = { load, get, save, saveNow, reset, nextId, DB_FILE };
