/* ─────────────────────────────────────────────────────────────────────────────
   chatshot.js — PNG-скриншот переписки в стиле WhatsApp (для анти-«мошенник» при
   переводе лида на новый номер). Чистый WASM-растеризатор (@resvg/resvg-wasm) —
   без native-компиляции, build-safe. Всё best-effort: любая ошибка → вызывающий
   шлёт только текстовый рекап (картинка опциональна, НЕ ломает перевод).
   ───────────────────────────────────────────────────────────────────────────── */
const fs = require('fs');

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* перенос текста по словам под ширину пузыря (приблизительно по символам) */
function wrap(text, maxChars) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ');
  const lines = []; let cur = '';
  for (const w of words) {
    if (!cur) { cur = w; }
    else if ((cur + ' ' + w).length <= maxChars) { cur += ' ' + w; }
    else { lines.push(cur); cur = w; }
    while (cur.length > maxChars) { lines.push(cur.slice(0, maxChars)); cur = cur.slice(maxChars); }  // слишком длинное слово
  }
  if (cur) lines.push(cur);
  return lines.length ? lines.slice(0, 8) : [''];   // пузырь не выше 8 строк
}

/* SVG переписки: последние N сообщений, входящие слева (белые), исходящие справа (зелёные) */
function renderChatSVG(db, lead, opts = {}) {
  const n = opts.count || 6;
  const msgs = ((db.messages || []).filter(m => m && m.leadId === lead.id && m.text && !m.system)).slice(-n);
  const W = 760, padX = 24, gap = 12, bubbleMaxW = Math.round(W * 0.74), fs18 = 19, lh = 26, bpadX = 18, bpadY = 13;
  const charW = fs18 * 0.58, maxChars = Math.max(10, Math.floor((bubbleMaxW - 2 * bpadX) / charW));   /* запас, чтобы текст не упирался в край пузыря */
  let y = 22; const parts = [];
  for (const m of msgs) {
    const inc = m.dir === 'in';
    const lines = wrap(m.text, maxChars);
    const longest = Math.max(1, ...lines.map(l => l.length));
    const textW = Math.min(bubbleMaxW, Math.round(longest * charW) + 2 * bpadX);
    const bh = lines.length * lh + 2 * bpadY + 16;   // +строка времени
    const bx = inc ? padX : (W - padX - textW);
    const fill = inc ? '#ffffff' : '#DCF8C6';
    let time = '';
    try { time = m.at ? new Date(m.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''; } catch (_) {}
    const txt = lines.map((l, i) => `<text x="${bx + bpadX}" y="${y + bpadY + fs18 + i * lh}" font-family="DejaVu Sans" font-size="${fs18}" fill="#111b21">${esc(l)}</text>`).join('');
    parts.push(`<g><rect x="${bx}" y="${y}" rx="14" width="${textW}" height="${bh}" fill="${fill}"/>${txt}<text x="${bx + textW - bpadX}" y="${y + bh - 9}" text-anchor="end" font-family="DejaVu Sans" font-size="13" fill="#667781">${esc(time)}</text></g>`);
    y += bh + gap;
  }
  const H = Math.max(140, y + 12);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#ECE5DD"/>${parts.join('')}</svg>`;
}

let _wasm = null;   /* initWasm можно звать ТОЛЬКО раз на процесс — мемоизируем */
function ensureWasm() {
  if (_wasm) return _wasm;
  _wasm = (async () => {
    const { initWasm } = require('@resvg/resvg-wasm');
    const wasmPath = require.resolve('@resvg/resvg-wasm/index_bg.wasm');
    await initWasm(fs.readFileSync(wasmPath));
    return true;
  })().catch(e => { _wasm = null; throw e; });
  return _wasm;
}

let _fonts = null;   /* шрифты с кириллицей — resvg-wasm НЕ видит системных, подаём буферами явно */
function fontBuffers() {
  if (_fonts) return _fonts;
  const dir = require('path').join(__dirname, 'assets', 'fonts');
  const bufs = [];
  for (const f of ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf']) { try { bufs.push(fs.readFileSync(require('path').join(dir, f))); } catch (_) {} }
  _fonts = bufs; return bufs;
}

/* PNG-буфер скриншота переписки; бросает при проблеме — вызывающий ловит и шлёт без картинки */
async function chatPng(db, lead, opts = {}) {
  await ensureWasm();
  const { Resvg } = require('@resvg/resvg-wasm');
  const svg = renderChatSVG(db, lead, opts);
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: opts.width || 820 }, background: '#ECE5DD',
    font: { fontBuffers: fontBuffers(), defaultFontFamily: 'DejaVu Sans', loadSystemFonts: false },
  }).render().asPng();
  if (!png || png.length < 100) throw new Error('empty png');
  return Buffer.from(png);
}

module.exports = { renderChatSVG, chatPng };
