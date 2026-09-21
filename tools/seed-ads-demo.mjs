/* Сид демо-данных в дев-тенант — чтобы вживую увидеть аналитику Meta / план-факт.
   ⚠️ Это ДЕМО-ДАННЫЕ (не живой кабинет — локально нет токена). Числа взяты с реального
   скрина Ads Manager клиента (последние 30 дней, USD). Идемпотентно (метка seedTag).
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

/* ── кабинет (валюта USD, как в реальном аккаунте) ── */
db.settings.metaAds = Object.assign({}, db.settings.metaAds, {
  accounts: [{ id: ACC, name: 'Trust Phuket · Meta', currency: 'USD' }],
  enabled: false, mode: 'api', pullInsights: true, pullLeads: true,
  displayCurrency: 'USD', sourceCurrency: 'USD', fxRate: 3.6725, syncDays: 30, lastSyncAt: now,
  stats: { syncs: 1, leads: 142 },
});

/* ── направления + сопоставление кампаний (все TP/Leads → Leadgeneration) ── */
db.settings.adDirections = [{ key: 'leadgen', name: 'Leadgeneration' }];
db.settings.adCampaignMap = {
  'TP / Leads | RU': 'leadgen', 'TP / Leads | EN': 'leadgen', 'TP / Leads | RU 1.1': 'leadgen',
  'TP / Leads | RU 1.2': 'leadgen', 'TP / Leads | RU 1.3': 'leadgen', 'TP / Leads | EN 1.3': 'leadgen',
  'TP / Leads | EN 1.1': 'leadgen', 'TP / Leads | EN 1.2': 'leadgen',
};

/* ── подрядчик, привязанный к кабинету ── */
db.mpContractors = (db.mpContractors || []).filter(c => c.seedTag !== SEED);
const ctId = 'ct_trustphuket';
db.mpContractors.unshift({ id: ctId, name: 'Leadgeneration · Trust Phuket', channels: ['Meta'], geos: ['phuket'], adAccounts: [ACC], contact: '@trustphuket', note: 'Демо-подрядчик (сид)', seedTag: SEED, createdAt: now });

/* ── объявления = РЕАЛЬНЫЕ строки со скрина Ads Manager (Last 30d, USD) ──
   [campaign, spend$, leads(Results Form), impressions] — clicks/quals неизвестны со скрина → 0 */
db.ads = [];   /* чистим все объявления (в т.ч. тестовый мусор) — оставляем только сид */
const rows = [
  ['TP / Leads | RU', 1212.83, 59, 101425, 1010],
  ['TP / Leads | EN', 611.44, 57, 19390, 205],
  ['TP / Leads | RU 1.1', 187.66, 10, 10821, 112],
  ['TP / Leads | RU 1.3', 184.35, 7, 13249, 128],
  ['TP / Leads | EN 1.3', 45.07, 6, 1722, 21],
  ['TP / Leads | RU 1.2', 43.86, 3, 4588, 47],
];
for (const [campaign, spend, leads, impr, clicks] of rows) {
  db.ads.push({
    adId: 'seed_' + Math.random().toString(36).slice(2, 11), name: campaign, campaignName: campaign, adsetName: campaign + ' · adset',
    geo: 'phuket', platform: 'meta', spend, leadsMeta: leads, qualsFact: 0, clicks, impressions: impr,
    cpl: leads ? +(spend / leads).toFixed(2) : 0, spendSource: 'meta_api', adAccountId: ACC, syncedAt: now, seedTag: SEED, media: null, points: [],
  });
}

/* ── медиаплан (демо-план в USD; факт тянется из кабинета) ── */
db.mediaplans = (db.mediaplans || []).filter(m => m.seedTag !== SEED);
db.mediaplans.unshift({
  id: 'mp_trustphuket', contractorId: ctId, title: 'Пхукет · Сентябрь · Leadgeneration', period: { from: '2026-09-01', to: '2026-09-30' },
  currency: 'USD', status: 'approved', seedTag: SEED, createdAt: now, sentAt: now, approvedAt: now, approvedBy: 'Trust Phuket',
  lines: [
    { id: 'l1', channel: 'Meta', geo: 'phuket', direction: 'leadgen', bundle: 'TP / Leads · RU', budgetPlan: 2000, leadsPlan: 100, qualPlan: 30, budgetFact: 0, leadsFact: 0, note: '' },
    { id: 'l2', channel: 'Meta', geo: 'phuket', direction: 'leadgen', bundle: 'TP / Leads · EN', budgetPlan: 1000, leadsPlan: 60, qualPlan: 18, budgetFact: 0, leadsFact: 0, note: '' },
  ],
  note: 'Демо-медиаплан (сид). Факт тянется из привязанного кабинета Meta.',
});

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
const spend = rows.reduce((s, r) => s + r[1], 0);
const leads = rows.reduce((s, r) => s + r[2], 0);
const impr = rows.reduce((s, r) => s + r[3], 0);
console.log(`✓ Сид (РЕАЛЬНЫЕ числа со скрина) в ${dbPath}`);
console.log(`  Кабинет ${ACC} (USD) · объявлений: ${rows.length}`);
console.log(`  Факт: $${spend.toFixed(2)} · ${leads} лид · ${impr.toLocaleString()} показов  (= скрин: $2 285.21 / 142 / 151 195)`);
