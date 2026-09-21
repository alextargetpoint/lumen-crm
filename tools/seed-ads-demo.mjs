/* Сид демо-данных «Trust Phuket» в дев-тенант — чтобы вживую увидеть аналитику Meta / план-факт.
   Числа подогнаны под реальный скрин клиента (dh = AED). Идемпотентно (метка seedTag).
   Запуск: node tools/seed-ads-demo.mjs   (сервер :5080 должен быть ОСТАНОВЛЕН). */
import fs from 'fs';
import os from 'os';
import path from 'path';

const DATA = process.env.DATA_DIR || path.join(os.homedir(), '.lumen-dev-data');
const reg = JSON.parse(fs.readFileSync(path.join(DATA, 'registry.json'), 'utf8'));
const tid = reg.byEmail['dev@lumen.local'] || reg.byEmail['demo@lumen247.com'];
if (!tid) { console.error('нет дев-тенанта в реестре'); process.exit(1); }
const dbPath = path.join(DATA, 'tenants', tid, 'db.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const SEED = 'trust-phuket-demo';
const ACC = 'act_1000000001';
const now = Date.now();

/* ── кабинет ── */
db.settings.metaAds = Object.assign({}, db.settings.metaAds, {
  accounts: [{ id: ACC, name: 'Trust Phuket · Meta', currency: 'AED' }],
  enabled: false, mode: 'api', pullInsights: true, pullLeads: true,
  displayCurrency: 'AED', fxRate: 3.6725, lastSyncAt: now,
  stats: { syncs: 1, leads: 1114 },
});

/* ── направления + сопоставление кампаний ── */
db.settings.adDirections = [{ key: 'leadgen', name: 'Leadgeneration' }];
db.settings.adCampaignMap = {
  'TP / Leads | EN': 'leadgen', 'TP / Leads | RU': 'leadgen', 'TP / Leads | RU 1.1': 'leadgen',
  'TP / Leads | RU 1.2': 'leadgen', 'TP / Leads | RU 1.3': 'leadgen', 'TP / Leads | EN 1.3': 'leadgen',
};

/* ── подрядчик, привязанный к кабинету ── */
db.mpContractors = (db.mpContractors || []).filter(c => c.seedTag !== SEED);
const ctId = 'ct_trustphuket';
db.mpContractors.unshift({ id: ctId, name: 'Leadgeneration · Trust Phuket', channels: ['Meta'], geos: ['phuket'], adAccounts: [ACC], contact: '@trustphuket', note: 'Демо-подрядчик (сид)', seedTag: SEED, createdAt: now });

/* ── объявления (факт из «кабинета»): mapped=Leadgeneration, unmapped=Прочее ── */
db.ads = (db.ads || []).filter(a => a.seedTag !== SEED);
const mk = (campaignName, adsetName, name, spend, leadsMeta, qualsFact, clicks, impr) => ({
  adId: 'seed_' + Math.random().toString(36).slice(2, 11), name, campaignName, adsetName, geo: 'phuket',
  platform: 'meta', spend, leadsMeta, qualsFact, clicks, impressions: impr, cpl: leadsMeta ? +(spend / leadsMeta).toFixed(2) : 0,
  spendSource: 'meta_api', adAccountId: ACC, syncedAt: now, seedTag: SEED, media: null, points: [],
});
/* Leadgeneration: сумма spend 34339, leads 1014, quals 299 (7 строк) */
const leadgen = [
  ['TP / Leads | EN', 'Video | worldwide | logic time - 1', 'Evgenia Laya Resort', 6800, 214, 66, 2180, 78000],
  ['TP / Leads | EN', 'Video | Euro area | logic time - 3', 'Evgenia Above Element', 5200, 150, 44, 1670, 61000],
  ['TP / Leads | RU', 'Video | worldwide | type + messenger - 1', 'Evgenia Laya Resort sub', 5900, 176, 51, 1890, 66000],
  ['TP / Leads | RU', 'Video | Baltic + Europe | type + messenger', 'Evgenia 4bdr villa', 4300, 132, 38, 1420, 49000],
  ['TP / Leads | RU 1.1', 'Video | EUR + UAE | type + messenger', 'Evgenia Above Element sub', 4600, 138, 41, 1510, 52000],
  ['TP / Leads | RU 1.3', 'Video | worldwide | type + messenger', 'Evgenia Laya Resort', 3800, 118, 33, 1240, 43000],
  ['TP / Leads | EN 1.3', 'Video | worldwide + GCC | logic time', 'Evgenia 4bdr villa', 3739, 86, 26, 1090, 38000],
];
/* Прочее (вне плана): 3442, 100, 23 */
const other = [
  ['Leads - DE 3.1', 'DE broad', 'DE creative A', 1900, 55, 13, 640, 21000],
  ['Mashriq - Leads ES - 1.1', 'ES broad', 'ES creative A', 1542, 45, 10, 520, 17000],
];
for (const r of [...leadgen, ...other]) db.ads.push(mk(...r));

/* ── медиаплан подрядчика (план на сентябрь) ── план 40025 / 661 лид / 240 квал ── */
db.mediaplans = (db.mediaplans || []).filter(m => m.seedTag !== SEED);
db.mediaplans.unshift({
  id: 'mp_trustphuket', contractorId: ctId, title: 'Пхукет · Сентябрь · Leadgeneration', period: { from: '2026-09-01', to: '2026-09-30' },
  currency: 'AED', status: 'approved', seedTag: SEED, createdAt: now, sentAt: now, approvedAt: now, approvedBy: 'Trust Phuket',
  lines: [
    { id: 'l1', channel: 'Meta', geo: 'phuket', direction: 'leadgen', bundle: 'Video · worldwide', budgetPlan: 12000, leadsPlan: 200, qualPlan: 72, budgetFact: 0, leadsFact: 0, note: '' },
    { id: 'l2', channel: 'Meta', geo: 'phuket', direction: 'leadgen', bundle: 'Video · Euro area', budgetPlan: 9000, leadsPlan: 150, qualPlan: 54, budgetFact: 0, leadsFact: 0, note: '' },
    { id: 'l3', channel: 'Meta', geo: 'phuket', direction: 'leadgen', bundle: 'Video · type+messenger', budgetPlan: 10025, leadsPlan: 171, qualPlan: 62, budgetFact: 0, leadsFact: 0, note: '' },
    { id: 'l4', channel: 'Meta', geo: 'phuket', direction: 'leadgen', bundle: 'Video · GCC', budgetPlan: 9000, leadsPlan: 140, qualPlan: 52, budgetFact: 0, leadsFact: 0, note: '' },
  ],
  note: 'Демо-медиаплан (сид). Факт тянется из привязанного кабинета Meta.',
});

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
const spend = [...leadgen, ...other].reduce((s, r) => s + r[3], 0);
const leads = [...leadgen, ...other].reduce((s, r) => s + r[4], 0);
const quals = [...leadgen, ...other].reduce((s, r) => s + r[5], 0);
console.log(`✓ Сид записан в ${dbPath}`);
console.log(`  Кабинет ${ACC} (AED) · подрядчик Leadgeneration · медиаплан 40025 dh / 661 лид / 240 квал`);
console.log(`  Объявлений: ${db.ads.filter(a => a.seedTag === SEED).length} · Факт: ${spend} dh · ${leads} лид · ${quals} квал`);
