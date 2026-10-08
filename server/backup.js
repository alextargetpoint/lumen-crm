/* ── Офф-сайт бэкапы в Backblaze B2 (защита от гибели тома Railway) ──────────────
 *
 * ЗАЧЕМ: локальные снимки (store.backupAll) лежат на ТОМ ЖЕ томе, что и данные — умрёт том,
 * пропадут и данные, и снимки. Этот модуль выгружает зашифрованный снимок ВСЕХ агентств
 * (registry + tenants/<tid>/db.json = лиды, ПЕРЕПИСКИ crmChats, настройки) во ВНЕШНЕЕ
 * хранилище Backblaze B2. Умрёт том → восстановим из B2.
 *
 * ВКЛЮЧЕНИЕ (переменные окружения на сервисе CRM):
 *   BACKUP_B2_KEY_ID      — keyID приложения Backblaze
 *   BACKUP_B2_APP_KEY     — applicationKey
 *   BACKUP_B2_BUCKET_ID   — id бакета (не имя)
 *   BACKUP_B2_BUCKET      — имя бакета (для пути; по умолчанию lumen-backups)
 *   BACKUP_ENC_KEY        — 64 hex-символа (32 байта) для AES-256-GCM. Без него снимок
 *                           уйдёт БЕЗ шифрования (небезопасно для переписок — задайте!).
 *   BACKUP_HOURLY_MIN     — период почасового снимка, мин (по умолчанию 60)
 *   BACKUP_DAILY_HOURS    — период суточного снимка, ч (по умолчанию 24)
 *
 * РЕТЕНЦИЯ: задайте в бакете B2 lifecycle-правило «keep last 30 days» — B2 сам подчистит.
 * Дедов чистим и сами (best-effort) по префиксу.
 *
 * Нет creds → модуль молча выключен (безопасно деплоить).
 */
const zlib = require('zlib');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/* Директории МЕДИА на томе (те же, что в server/index.js): загруженные файлы — картинки/аватары/
   логотипы/мудборды/файлы лида/аудио звонков. Снимок БД (snapshotOnce) хранит ТОЛЬКО JSON — файлы
   надо бэкапить ОТДЕЛЬНО, иначе гибель тома = потеря всех картинок клиентов. */
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const MEDIA_DIRS = ['creatives', 'media', 'assets'].map(d => path.join(DATA_DIR, d));

const CFG = {
  keyId: process.env.BACKUP_B2_KEY_ID || '',
  appKey: process.env.BACKUP_B2_APP_KEY || '',
  bucketId: process.env.BACKUP_B2_BUCKET_ID || '',
  bucket: process.env.BACKUP_B2_BUCKET || 'lumen-backups',
  encKey: process.env.BACKUP_ENC_KEY || '',
  hourlyMin: +(process.env.BACKUP_HOURLY_MIN || 60),
  dailyHours: +(process.env.BACKUP_DAILY_HOURS || 24),
  retentionDays: +(process.env.BACKUP_RETENTION_DAYS || 30),
};
const enabled = () => !!(CFG.keyId && CFG.appKey && CFG.bucketId);

/* AES-256-GCM: [iv(12) | tag(16) | ciphertext] */
function encrypt(buf) {
  if (!CFG.encKey) return buf;
  const key = Buffer.from(CFG.encKey, 'hex');
  if (key.length !== 32) throw new Error('BACKUP_ENC_KEY должен быть 64 hex-символа (32 байта)');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}
/* восстановление (для runbook/скрипта): расшифровать выгруженный файл */
function decrypt(buf) {
  if (!CFG.encKey) return buf;
  const key = Buffer.from(CFG.encKey, 'hex');
  const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), ct = buf.subarray(28);
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

let _auth = null, _authAt = 0;
async function b2Auth() {
  if (_auth && Date.now() - _authAt < 6 * 3600e3) return _auth; // токен живёт ~24ч, обновляем каждые 6ч
  const r = await fetch('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', {
    headers: { Authorization: 'Basic ' + Buffer.from(CFG.keyId + ':' + CFG.appKey).toString('base64') },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error('b2_authorize ' + r.status + ' ' + (await r.text()).slice(0, 120));
  const j = await r.json();
  _auth = { token: j.authorizationToken, apiUrl: j.apiInfo.storageApi.apiUrl, downloadUrl: j.apiInfo.storageApi.downloadUrl };
  _authAt = Date.now();
  return _auth;
}
/* скачать файл обратно из B2 (для сквозной проверки/восстановления) */
async function b2Download(name) {
  const a = await b2Auth();
  const url = a.downloadUrl + '/file/' + CFG.bucket + '/' + name.split('/').map(encodeURIComponent).join('/');
  const r = await fetch(url, { headers: { Authorization: a.token }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error('b2_download ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}
async function b2Upload(name, buf) {
  const a = await b2Auth();
  const u = await fetch(a.apiUrl + '/b2api/v3/b2_get_upload_url', {
    method: 'POST', headers: { Authorization: a.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucketId: CFG.bucketId }), signal: AbortSignal.timeout(20000),
  });
  if (!u.ok) throw new Error('b2_get_upload_url ' + u.status);
  const uj = await u.json();
  const sha1 = crypto.createHash('sha1').update(buf).digest('hex');
  const up = await fetch(uj.uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: uj.authorizationToken,
      'X-Bz-File-Name': encodeURIComponent(name),
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(buf.length),
      'X-Bz-Content-Sha1': sha1,
    },
    body: buf, signal: AbortSignal.timeout(120000),
  });
  if (!up.ok) throw new Error('b2_upload ' + up.status + ' ' + (await up.text()).slice(0, 120));
  return true;
}
/* best-effort чистка старше retentionDays (B2 lifecycle надёжнее — задайте в бакете) */
async function b2Cleanup(prefix) {
  try {
    const a = await b2Auth();
    const r = await fetch(a.apiUrl + '/b2api/v3/b2_list_file_names', {
      method: 'POST', headers: { Authorization: a.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucketId: CFG.bucketId, prefix, maxFileCount: 10000 }), signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return;
    const j = await r.json();
    const cutoff = Date.now() - CFG.retentionDays * 864e5;
    for (const f of (j.files || [])) {
      if (f.uploadTimestamp && f.uploadTimestamp < cutoff) {
        await fetch(a.apiUrl + '/b2api/v3/b2_delete_file_version', {
          method: 'POST', headers: { Authorization: a.token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: f.fileName, fileId: f.fileId }), signal: AbortSignal.timeout(20000),
        }).catch(() => {});
      }
    }
  } catch (_) {}
}

/* собрать снимок ВСЕХ агентств в один зашифрованный gzip и выгрузить в B2 */
let _running = false;
async function snapshotOnce(store, label) {
  if (!enabled() || _running) return { ok: false, skipped: true };
  _running = true;
  try {
    const bundle = { v: 1, at: Date.now(), label, registry: null, tenants: {} };
    try { bundle.registry = store.getRegistry(); } catch (_) {}
    let n = 0;
    for (const tid of store.listTenants()) {
      try { bundle.tenants[tid] = store.runInTenant(tid, () => store.get()); n++; } catch (_) {}
    }
    const gz = zlib.gzipSync(Buffer.from(JSON.stringify(bundle)));
    const enc = CFG.encKey;
    const payload = enc ? encrypt(gz) : gz;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `lumen/${label}/${ts}.bundle.json.gz${enc ? '.enc' : ''}`;
    await b2Upload(name, payload);
    console.log(`[b2backup] ${label}: ${n} агентств → B2 ${name} (${(payload.length / 1024).toFixed(0)}KB${enc ? ', шифр' : ', ⚠БЕЗ шифра'})`);
    b2Cleanup(`lumen/${label}/`); // не ждём
    return { ok: true, tenants: n, name };
  } catch (e) {
    console.warn('[b2backup] ошибка снимка:', e.message);
    return { ok: false, error: e.message };
  } finally { _running = false; }
}

/* ── ИНКРЕМЕНТАЛЬНАЯ ВЫГРУЗКА МЕДИА-ФАЙЛОВ В B2 ──────────────────────────────────────────
   snapshotOnce хранит только БД-JSON. Файлы (логотипы/фото/аватары/мудборды/файлы лида/аудио)
   бэкапим отдельно. Инкрементально: берём список уже лежащих в B2 (префикс media/), заливаем ТОЛЬКО
   новые → файл уходит один раз, egress/запись минимальны. Чувствительные (leadfiles/wa-media) шифруем. */
let _mediaRunning = false;
async function listB2Names(prefix) {
  const a = await b2Auth(); const have = new Set(); let startName = undefined;
  do {
    const r = await fetch(a.apiUrl + '/b2api/v3/b2_list_file_names', {
      method: 'POST', headers: { Authorization: a.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucketId: CFG.bucketId, prefix, maxFileCount: 10000, startFileName: startName }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) break;
    const j = await r.json();
    for (const f of (j.files || [])) have.add(f.fileName);
    startName = j.nextFileName || undefined;
  } while (startName);
  return have;
}
async function syncMedia() {
  if (!enabled() || _mediaRunning) return { ok: false, skipped: true };
  _mediaRunning = true;
  try {
    const have = await listB2Names('media/');
    let uploaded = 0, skipped = 0, bytes = 0, failed = 0;
    const toSend = [];
    for (const dir of MEDIA_DIRS) {
      const sub = path.basename(dir);
      (function walk(d, rel) {
        let names; try { names = fs.readdirSync(d); } catch (_) { return; }
        for (const n of names) {
          const fp = path.join(d, n); let s; try { s = fs.statSync(fp); } catch (_) { continue; }
          if (s.isDirectory()) { walk(fp, rel + n + '/'); continue; }
          const sensitive = /(^|\/)(leadfiles|wa-media)\//.test(sub + '/' + rel);
          const name = 'media/' + sub + '/' + rel + n + (sensitive && CFG.encKey ? '.enc' : '');
          if (have.has(name)) { skipped++; continue; }
          if (s.size > 300 * 1024 * 1024) { skipped++; continue; }   // >300МБ — пропускаем (страховка)
          toSend.push({ fp, name, sensitive, size: s.size });
        }
      })(dir, '');
    }
    for (const it of toSend) {
      try {
        let buf = fs.readFileSync(it.fp);
        if (it.sensitive && CFG.encKey) buf = encrypt(buf);
        await b2Upload(it.name, buf);
        uploaded++; bytes += it.size;
      } catch (e) { failed++; }
    }
    if (uploaded || failed) console.log(`[b2backup] медиа: +${uploaded} новых (${(bytes / 1048576).toFixed(1)}МБ), пропущено ${skipped}, ошибок ${failed}`);
    return { ok: true, uploaded, skipped, failed, bytes };
  } catch (e) {
    console.warn('[b2backup] медиа-синк ошибка:', e.message);
    return { ok: false, error: e.message };
  } finally { _mediaRunning = false; }
}

/* СКВОЗНАЯ ПРОВЕРКА: снять снимок → выгрузить → скачать обратно → расшифровать → распаковать →
   распарсить → сверить число агентств. Доказывает, что бэкап реально пригоден к восстановлению. */
async function runAndVerify(store) {
  if (!enabled()) return { ok: false, error: 'B2 не настроен (нет BACKUP_B2_KEY_ID/APP_KEY/BUCKET_ID)' };
  const snap = await snapshotOnce(store, 'manual');
  if (!snap.ok) return { ok: false, error: 'снимок не удался: ' + (snap.error || '?') };
  try {
    const raw = await b2Download(snap.name);
    const gz = CFG.encKey ? decrypt(raw) : raw;
    const json = zlib.gunzipSync(gz).toString();
    const bundle = JSON.parse(json);
    const tenantsBack = Object.keys(bundle.tenants || {}).length;
    return {
      ok: true, name: snap.name, uploadedTenants: snap.tenants, verifiedTenants: tenantsBack,
      encrypted: !!CFG.encKey, sizeKB: +(raw.length / 1024).toFixed(1),
      match: tenantsBack === snap.tenants,
      sampleTids: Object.keys(bundle.tenants || {}).slice(0, 5),
    };
  } catch (e) { return { ok: false, error: 'выгрузка есть, но обратное чтение упало: ' + e.message, name: snap.name }; }
}

function start(store) {
  if (!enabled()) { console.log('[b2backup] выключен — задайте BACKUP_B2_KEY_ID/APP_KEY/BUCKET_ID (+BACKUP_ENC_KEY) на сервисе CRM'); return; }
  if (!CFG.encKey) console.warn('[b2backup] ⚠ BACKUP_ENC_KEY не задан — снимки уйдут БЕЗ шифрования. Задайте 64-hex ключ!');
  console.log(`[b2backup] включён → B2 bucket=${CFG.bucket}, почасово=${CFG.hourlyMin}м, сутки=${CFG.dailyHours}ч, ретенция=${CFG.retentionDays}д`);
  setTimeout(() => snapshotOnce(store, 'hourly'), 15000); // стартовый (через 15с после подъёма)
  setInterval(() => snapshotOnce(store, 'hourly'), CFG.hourlyMin * 60e3);
  setInterval(() => snapshotOnce(store, 'daily'), CFG.dailyHours * 3600e3);
  /* МЕДИА-ФАЙЛЫ (картинки/аватары/логотипы/аудио) — инкрементально, отдельно от БД. Раз в сутки + стартовый
     прогон через 60с. Инкрементально → в обычный день почти нулевой трафик (заливаются только новые файлы). */
  setTimeout(() => syncMedia(), 60000);
  setInterval(() => syncMedia(), CFG.dailyHours * 3600e3);
}

module.exports = { start, snapshotOnce, syncMedia, runAndVerify, decrypt, enabled, CFG, b2Upload, b2Download };
