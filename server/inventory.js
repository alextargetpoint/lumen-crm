/* Lumen CRM — импорт инвентаря объектов из современных источников.
   Брокеры недвижимости (особенно Дубай/ОАЭ) держат базу новостроек не в
   листинговых порталах (Property Finder / Bayut — это вторичка/аренда), а в
   агрегаторах инвентаря застройщиков: главный — REELLY (reelly.io, 500+
   застройщиков, off-plan проекты с ценами/планами/доступностью/брошюрами).

   Инфраструктура ниже принимает объекты из ЛЮБОГО такого источника:
   1. Таблица (CSV/TSV/Excel-вставка) — колонки распознаются по заголовку;
   2. JSON-массив (фиды/экспорты API многих сервисов);
   3. Reelly API-коннектор (по ключу партнёра) с маппингом их полей.
   Всё сводится к нашей property-модели через единый маппинг синонимов. */
const store = require('./store');

/* ---------- синонимы полей: рус/англ + типовые ключи сервисов ---------- */
const FIELD_SYN = {
  name: ['name', 'project', 'title', 'building', 'название', 'проект', 'объект', 'жк'],
  developer: ['developer', 'builder', 'dev', 'застройщик', 'девелопер'],
  area: ['area', 'location', 'district', 'community', 'neighborhood', 'район', 'локация', 'комьюнити', 'адрес'],
  priceFrom: ['price_from', 'starting_price', 'min_price', 'from_price', 'startingprice', 'price', 'стартовая', 'цена', 'стоимость', 'от'],
  currency: ['currency', 'валюта', 'cur'],
  handover: ['handover', 'completion', 'delivery', 'ready_date', 'completiondate', 'сдача', 'готовность', 'срок'],
  type: ['unit_type', 'property_type', 'bedrooms', 'beds', 'type', 'тип', 'спальни', 'комнат'],
  roi: ['roi', 'yield', 'net_yield', 'доходность', 'рентабельность', 'доход'],
  market: ['status', 'market', 'sale_type', 'offering', 'стадия', 'рынок'],
  payment: ['payment_plan', 'payment', 'plan', 'рассрочка', 'план_оплаты', 'оплата'],
  description: ['description', 'about', 'overview', 'описание', 'о_проекте'],
  image: ['image', 'photo', 'cover', 'thumbnail', 'picture', 'фото', 'изображение'],
  brochure: ['brochure', 'pdf', 'presentation', 'брошюра', 'презентация'],
  appreciation: ['appreciation', 'capital_gain', 'прирост'],
};
const GEO_HINT = [['dubai', /dubai|дубай|uae|оаэ|emirat/i], ['bali', /bali|бали|indonesi/i], ['phuket', /phuket|пхукет|thail|таиланд/i], ['spain', /spain|испан|marbella|costa/i]];

function detectGeo(text, fallback) {
  const t = String(text || '');
  for (const [g, re] of GEO_HINT) if (re.test(t)) return g;
  return fallback;
}
function detectMarket(text) {
  return /ready|готов|secondary|вторич|resale/i.test(String(text || '')) ? 'secondary' : 'offplan';
}
function normKey(s) { return String(s || '').toLowerCase().replace(/[\s_\-]+/g, ''); }

/* сырой ряд (объект ключ→значение) → наша property-модель */
function mapItem(raw, defaults) {
  const keys = Object.keys(raw);
  const find = (syns) => {
    for (const syn of syns) { const k = keys.find(kk => normKey(kk) === normKey(syn) || normKey(kk).includes(normKey(syn))); if (k != null && raw[k] != null && String(raw[k]).trim() !== '') return String(raw[k]).trim(); }
    return '';
  };
  const g = {};
  for (const [field, syns] of Object.entries(FIELD_SYN)) g[field] = find(syns);
  const priceNum = parseInt(String(g.priceFrom).replace(/[^\d]/g, '')) || 0;
  const geo = detectGeo(g.area + ' ' + g.name + ' ' + g.developer, defaults.geo || 'dubai');
  const cur = (g.currency || '').toUpperCase().replace(/[^A-Z]/g, '') || (geo === 'dubai' ? 'USD' : geo === 'spain' ? 'EUR' : 'USD');
  return {
    name: g.name || 'Объект',
    developer: g.developer || '',
    area: g.area || '',
    priceFrom: priceNum,
    currency: cur === 'AED' ? 'AED' : cur === 'EUR' ? 'EUR' : 'USD',
    handover: g.handover || '',
    type: g.type ? (/^\d/.test(g.type) ? g.type + 'BR' : g.type) : '',
    roi: g.roi || '',
    appreciation: g.appreciation || '',
    market: g.market ? detectMarket(g.market) : (defaults.market || 'offplan'),
    payment: g.payment || '',
    description: g.description || '',
    geo,
    images: g.image && /^https?:\/\//.test(g.image) ? [g.image] : [],
    materials: g.brochure && /^https?:\/\//.test(g.brochure) ? [{ label: 'Брошюра', url: g.brochure }] : [],
    _src: raw._src || 'import',
  };
}

/* дедуп по имени+застройщику; существующий — дополняем пустые поля, не затираем */
function upsert(db, mapped) {
  const key = (p) => (String(p.name).toLowerCase().trim() + '|' + String(p.developer || '').toLowerCase().trim());
  const ex = db.properties.find(p => key(p) === key(mapped));
  if (ex) {
    for (const f of ['developer', 'area', 'handover', 'type', 'roi', 'appreciation', 'payment', 'description']) if (!ex[f] && mapped[f]) ex[f] = mapped[f];
    if (!ex.priceFrom && mapped.priceFrom) ex.priceFrom = mapped.priceFrom;
    if ((!ex.images || !ex.images.length) && mapped.images.length) ex.images = mapped.images;
    if ((!ex.materials || !ex.materials.length) && mapped.materials.length) ex.materials = mapped.materials;
    return 'merged';
  }
  db.properties.push(Object.assign({
    id: store.nextId('pr'), tags: [], amenities: [], units: [], layouts: [], beds: '',
    hookTitle: '', district: {}, paymentRows: [], whyRent: [], note: mapped._src === 'reelly' ? 'из Reelly' : 'импорт', folderId: null,
  }, mapped));
  delete db.properties[db.properties.length - 1]._src;
  return 'created';
}

/* ---------- таблица CSV/TSV ---------- */
function importTable(db, csv, defaults) {
  const lines = String(csv || '').split('\n').map(x => x.replace(/\r$/, '')).filter(x => x.trim());
  if (lines.length < 2) return { error: 'нужен заголовок и хотя бы одна строка' };
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const head = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));
  let created = 0, merged = 0, skipped = 0;
  for (const line of lines.slice(1)) {
    const cells = line.split(sep).map(x => x.trim().replace(/^"|"$/g, ''));
    const raw = {};
    head.forEach((h, i) => { raw[h] = cells[i] || ''; });
    const mapped = mapItem(raw, defaults);
    if (!mapped.name || mapped.name === 'Объект') { skipped++; continue; }
    upsert(db, mapped) === 'created' ? created++ : merged++;
  }
  return { created, merged, skipped };
}

/* ---------- JSON-массив ---------- */
function importJson(db, arr, defaults) {
  if (!Array.isArray(arr)) { if (arr && Array.isArray(arr.items)) arr = arr.items; else if (arr && Array.isArray(arr.data)) arr = arr.data; else return { error: 'ожидался массив объектов (или {items:[…]}/{data:[…]})' }; }
  let created = 0, merged = 0, skipped = 0;
  for (const it of arr.slice(0, 2000)) {
    if (!it || typeof it !== 'object') { skipped++; continue; }
    const mapped = mapItem(it, defaults);
    if (!mapped.name || mapped.name === 'Объект') { skipped++; continue; }
    upsert(db, mapped) === 'created' ? created++ : merged++;
  }
  return { created, merged, skipped };
}

/* ---------- Reelly-коннектор ---------- */
function reellyCfg(db) { return (db.settings.inventorySources || {}).reelly || {}; }
/* демо-инвентарь (без ключа) — показывает, как ляжет реальный импорт из Reelly */
const REELLY_DEMO = [
  { name: 'Sobha Hartland II · Waves', developer: 'Sobha Realty', area: 'MBR City', min_price: 640000, currency: 'USD', completion: 'Q4 2027', unit_type: '1', roi: '7.5%', payment_plan: '60/40', status: 'off-plan' },
  { name: 'Emaar Address Residences', developer: 'Emaar', area: 'Downtown Dubai', min_price: 980000, currency: 'USD', completion: 'Q2 2028', unit_type: '2', roi: '6.8%', payment_plan: '80/20', status: 'off-plan' },
  { name: 'Danube Bayz 101', developer: 'Danube', area: 'Business Bay', min_price: 320000, currency: 'USD', completion: 'Q1 2027', unit_type: 'studio', roi: '8.2%', payment_plan: '1% monthly', status: 'off-plan' },
  { name: 'Binghatti Skyrise', developer: 'Binghatti', area: 'Business Bay', min_price: 275000, currency: 'USD', completion: 'Q3 2026', unit_type: '1', roi: '8.5%', payment_plan: '70/30', status: 'off-plan' },
];
async function importReelly(db, defaults) {
  const cfg = reellyCfg(db);
  let items = REELLY_DEMO;
  let live = false;
  if (cfg.key && cfg.enabled) {
    /* боевой вызов Reelly API (endpoint партнёра; baseUrl конфигурируемый) */
    try {
      const base = cfg.baseUrl || 'https://api.reelly.io/v1';
      const r = await fetch(`${base}/projects?limit=200`, { headers: { Authorization: `Bearer ${cfg.key}`, Accept: 'application/json' } });
      if (!r.ok) throw new Error('reelly ' + r.status);
      const j = await r.json();
      items = Array.isArray(j) ? j : (j.items || j.data || j.projects || []);
      live = true;
    } catch (e) { return { error: 'Reelly API: ' + e.message + ' — проверьте ключ/endpoint' }; }
  }
  const res = importJson(db, items.map(x => Object.assign({ _src: 'reelly' }, x)), Object.assign({ market: 'offplan', geo: 'dubai' }, defaults));
  res.live = live;
  res.demo = !live;
  return res;
}

module.exports = { importTable, importJson, importReelly, mapItem };
