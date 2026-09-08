'use strict';
/* Серверный скриншот БЕЗ npm-зависимостей: одноразовый снимок через chrome-headless-shell
   (кэш Playwright на диске) --screenshot. Нужен для автономного визуального QA-цикла «Студии».
   На Railway/Linux бинаря может не быть → capture() возвращает null (грациозная деградация). */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

let _bin = null, _found = false;
function findBin() {
  if (_found) return _bin;
  _found = true;
  if (process.env.CHROME_HEADLESS_SHELL && fs.existsSync(process.env.CHROME_HEADLESS_SHELL)) { _bin = process.env.CHROME_HEADLESS_SHELL; return _bin; }
  const roots = [
    path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'),
    path.join(os.homedir(), '.cache', 'ms-playwright'),
  ];
  for (const root of roots) {
    let dirs = [];
    try { dirs = fs.readdirSync(root).filter(d => /chromium_headless_shell/.test(d)); } catch (e) { continue; }
    for (const d of dirs) {
      const base = path.join(root, d);
      /* mac: chrome-headless-shell-mac-arm64/chrome-headless-shell ; linux: chrome-headless-shell-linux64/chrome-headless-shell */
      let subs = [];
      try { subs = fs.readdirSync(base).filter(s => /chrome-headless-shell/.test(s)); } catch (e) { continue; }
      for (const s of subs) {
        const p = path.join(base, s, 'chrome-headless-shell');
        if (fs.existsSync(p)) { _bin = p; return _bin; }
      }
    }
  }
  return _bin;
}
function available() { return !!findBin(); }

/* снять URL в PNG-буфер (fixed viewport). Возвращает Buffer или null. */
function capture(url, opts = {}) {
  return new Promise((resolve) => {
    const bin = findBin();
    if (!bin) return resolve(null);
    const w = opts.w || 1080, h = opts.h || 1350;
    const out = path.join(os.tmpdir(), `sg-shot-${crypto.randomBytes(5).toString('hex')}.png`);
    const args = ['--headless', '--disable-gpu', '--hide-scrollbars', '--no-sandbox', '--force-device-scale-factor=1',
      `--window-size=${w},${h}`, `--screenshot=${out}`, `--virtual-time-budget=${opts.wait || 1200}`, url];
    execFile(bin, args, { timeout: opts.timeout || 20000 }, (err) => {
      let buf = null;
      try { if (fs.existsSync(out)) { buf = fs.readFileSync(out); fs.unlinkSync(out); } } catch (e) { /* ignore */ }
      resolve(buf);
    });
  });
}

module.exports = { available, capture, findBin };
