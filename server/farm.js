/* Lumen CRM — Ферма номеров (WhatsApp + Telegram) как услуга.
   Глобальный ресурс TargetPoint (над всеми агентствами): реальные Android-телефоны
   держат по ~5 аккаунтов (безопасный потолок анти-бан-каскада), каждый номер = 1 место
   (WhatsApp + Telegram на ОДНОМ номере), выдаётся агентству (тенанту) в аренду.

   Данные живут в registry.farm (см. store.getRegistry()/saveRegistry) — не per-tenant,
   потому что ферма одна на платформу, а агентства только арендуют места.

   Жизненный цикл номера:
     buying → provisioning → warming → ready → assigned → (banned|idle)
   Бан = теряем КАНАЛ, не данные (переписка в CRM). failover берёт тёплый номер из пула.  */

const store = require('./store');

/* дефолты юнит-экономики (доллары/мес на номер), обсуждено с основателем */
const DEFAULTS = {
  costs: { numberRent: 6, proxy: 2, infra: 1, idleKeepWarm: 6 }, /* $/мес: аренда номера, UK-прокси, облако; простой=тёплый */
  seatPrice: 25,        /* $/мес за место (managed-тариф) */
  capexPerPhone: 130,   /* $ разово за реф. Android */
  maxPerDevice: 5,      /* безопасный потолок аккаунтов на телефон */
  phoneLifeMonths: 20,  /* срок службы телефона для амортизации */
};

function farm() {
  const reg = store.getRegistry();
  if (!reg.farm) reg.farm = {};
  const f = reg.farm;
  f.settings = Object.assign({}, DEFAULTS, f.settings || {});
  f.settings.costs = Object.assign({}, DEFAULTS.costs, (f.settings && f.settings.costs) || {});
  f.devices = f.devices || [];
  f.proxies = f.proxies || [];
  f.numbers = f.numbers || [];
  f.log = f.log || [];
  return f;
}
function persist() { store.saveRegistry(); }
function nid(pfx) { return store.nextId(pfx); }
function flog(action, extra) {
  const f = farm();
  f.log.unshift(Object.assign({ at: Date.now(), action }, extra || {}));
  if (f.log.length > 800) f.log.length = 800;
}

/* ---------- устройства ---------- */
function addDevice(d) {
  const f = farm();
  const dev = {
    id: nid('dev'), name: d.name || 'Android', model: d.model || '', serial: d.serial || '',
    location: d.location || '', status: 'active', capacity: +d.capacity || f.settings.maxPerDevice,
    createdAt: Date.now(),
  };
  f.devices.push(dev); flog('device.add', { deviceId: dev.id, name: dev.name }); persist();
  return dev;
}

/* ---------- прокси ---------- */
function addProxy(p) {
  const f = farm();
  const px = {
    id: nid('px'), label: p.label || '', host: p.host || '', country: (p.country || 'gb').toLowerCase(),
    type: p.type || 'residential', costMo: p.costMo != null ? +p.costMo : f.settings.costs.proxy,
    assignedTo: null, createdAt: Date.now(),
  };
  f.proxies.push(px); flog('proxy.add', { proxyId: px.id }); persist();
  return px;
}

/* ---------- номера ---------- */
function addNumber(n) {
  const f = farm();
  const num = {
    id: nid('num'), phone: (n.phone || '').replace(/\s+/g, ''), country: (n.country || 'gb').toLowerCase(),
    deviceId: n.deviceId || null, slot: n.slot || 'main',
    wa: { status: n.waStatus || 'none', twoFaPin: n.twoFaPin || '', recoveryEmail: n.recoveryEmail || '', companionLinked: false, health: 100 },
    tg: { status: n.tgStatus || 'none', companionLinked: false, health: 100 },
    proxyId: n.proxyId || null,
    agencyTid: null, brokerId: null, displayName: n.displayName || '',
    esim: { provider: n.esimProvider || '', ref: n.esimRef || '', rentUntil: n.rentUntil || null },
    createdAt: Date.now(), warmStartedAt: null, assignedAt: null, notes: n.notes || '',
  };
  f.numbers.push(num); flog('number.add', { numberId: num.id, phone: num.phone }); persist();
  return num;
}
function findNumber(id) { return farm().numbers.find(x => x.id === id); }

function updateNumber(id, patch) {
  const n = findNumber(id); if (!n) return null;
  /* безопасный merge вложенных wa/tg/esim */
  for (const k of Object.keys(patch || {})) {
    if (k === 'wa' || k === 'tg' || k === 'esim') Object.assign(n[k], patch[k]);
    else n[k] = patch[k];
  }
  flog('number.update', { numberId: id }); persist();
  return n;
}

/* привязать прокси к номеру (эксклюзивно) */
function attachProxy(numberId, proxyId) {
  const f = farm(); const n = findNumber(numberId); if (!n) return null;
  f.proxies.forEach(px => { if (px.assignedTo === numberId) px.assignedTo = null; }); /* снять старый */
  if (proxyId) { const px = f.proxies.find(x => x.id === proxyId); if (px) px.assignedTo = numberId; }
  n.proxyId = proxyId || null; flog('number.proxy', { numberId, proxyId }); persist();
  return n;
}

/* выдать номер агентству (место) */
function assign(numberId, agencyTid, brokerId, displayName) {
  const n = findNumber(numberId); if (!n) return { error: 'номер не найден' };
  if (n.agencyTid) return { error: 'номер уже выдан агентству' };
  n.agencyTid = agencyTid || null; n.brokerId = brokerId || null;
  if (displayName) n.displayName = displayName;
  n.assignedAt = Date.now();
  if (n.wa.status === 'ready' || n.wa.status === 'warming') n.wa.status = 'assigned';
  if (n.tg.status === 'ready' || n.tg.status === 'warming') n.tg.status = 'assigned';
  flog('number.assign', { numberId, agencyTid, brokerId }); persist();
  return { ok: true, number: n };
}

/* отозвать (агентство ушло) → в тёплый пул */
function revoke(numberId) {
  const n = findNumber(numberId); if (!n) return { error: 'номер не найден' };
  const was = { agencyTid: n.agencyTid, brokerId: n.brokerId };
  n.agencyTid = null; n.brokerId = null; n.assignedAt = null; n.displayName = '';
  if (n.wa.status === 'assigned') n.wa.status = 'ready';
  if (n.tg.status === 'assigned') n.tg.status = 'ready';
  flog('number.revoke', { numberId, was }); persist();
  return { ok: true, number: n };
}

/* failover: номер забанен → берём тёплый ready из пула и переносим на него привязку клиента */
function failover(bannedId) {
  const f = farm(); const bad = findNumber(bannedId); if (!bad) return { error: 'номер не найден' };
  const spare = f.numbers.find(x => x.id !== bannedId && !x.agencyTid && x.wa.status === 'ready');
  /* пометить забаненный */
  bad.wa.status = 'banned'; bad.wa.health = 0;
  const carry = { agencyTid: bad.agencyTid, brokerId: bad.brokerId, displayName: bad.displayName };
  bad.agencyTid = null; bad.brokerId = null; bad.assignedAt = null;
  if (!spare) { flog('number.failover.nopool', { bannedId }); persist(); return { ok: true, replaced: null, warn: 'нет тёплого номера в пуле — клиент без канала!' }; }
  spare.agencyTid = carry.agencyTid; spare.brokerId = carry.brokerId; spare.displayName = carry.displayName;
  spare.assignedAt = Date.now(); spare.wa.status = 'assigned';
  if (spare.tg.status === 'ready') spare.tg.status = 'assigned';
  flog('number.failover', { bannedId, replacedBy: spare.id, agencyTid: carry.agencyTid }); persist();
  return { ok: true, replaced: spare };
}

/* освободить слот на телефоне (вайп) — номер снят с устройства, уходит в пул/на выброс */
function wipeSlot(numberId, release) {
  const f = farm(); const n = findNumber(numberId); if (!n) return { error: 'номер не найден' };
  f.proxies.forEach(px => { if (px.assignedTo === numberId) px.assignedTo = null; });
  n.deviceId = null; n.slot = 'main'; n.proxyId = null;
  n.wa = { status: 'none', twoFaPin: '', recoveryEmail: '', companionLinked: false, health: 100 };
  n.tg = { status: 'none', companionLinked: false, health: 100 };
  n.agencyTid = null; n.brokerId = null; n.assignedAt = null; n.displayName = '';
  if (release) { const i = f.numbers.findIndex(x => x.id === numberId); if (i >= 0) f.numbers.splice(i, 1); }
  flog(release ? 'number.release' : 'number.wipe', { numberId }); persist();
  return { ok: true };
}

function removeDevice(id) {
  const f = farm();
  if (f.numbers.some(n => n.deviceId === id)) return { error: 'на устройстве есть номера — сначала освободите слоты' };
  const i = f.devices.findIndex(d => d.id === id); if (i >= 0) f.devices.splice(i, 1);
  flog('device.remove', { deviceId: id }); persist();
  return { ok: true };
}
function removeProxy(id) {
  const f = farm(); const px = f.proxies.find(x => x.id === id);
  if (px && px.assignedTo) return { error: 'прокси привязан к номеру' };
  const i = f.proxies.findIndex(x => x.id === id); if (i >= 0) f.proxies.splice(i, 1);
  flog('proxy.remove', { proxyId: id }); persist();
  return { ok: true };
}

function setSettings(patch) {
  const f = farm();
  if (patch.costs) f.settings.costs = Object.assign({}, f.settings.costs, patch.costs);
  for (const k of ['seatPrice', 'capexPerPhone', 'maxPerDevice', 'phoneLifeMonths']) if (patch[k] != null) f.settings[k] = +patch[k];
  flog('settings', {}); persist();
  return f.settings;
}

/* ---------- экономика ---------- */
function economics() {
  const f = farm();
  const c = f.settings.costs, seat = f.settings.seatPrice;
  const nums = f.numbers;
  const isActive = n => !!n.agencyTid;
  const isWarming = n => !isActive(n) && (n.wa.status === 'warming' || n.tg.status === 'warming' || n.wa.status === 'provisioning');
  const isReadyIdle = n => !isActive(n) && (n.wa.status === 'ready' || n.tg.status === 'ready');
  const isBanned = n => n.wa.status === 'banned' || n.tg.status === 'banned';

  const active = nums.filter(isActive).length;
  const idle = nums.filter(isReadyIdle).length;
  const warming = nums.filter(isWarming).length;
  const banned = nums.filter(isBanned).length;

  const capacity = f.devices.reduce((s, d) => s + (d.capacity || f.settings.maxPerDevice), 0);
  const perActive = c.numberRent + c.proxy + c.infra;
  const cogsActive = active * perActive;
  const cogsIdle = (idle + warming) * c.idleKeepWarm;      /* простаивающие/греющиеся держим тёплыми */
  const cogs = cogsActive + cogsIdle;
  const revenue = active * seat;
  const gross = revenue - cogs;

  const capex = f.devices.length * f.settings.capexPerPhone;
  const amortMo = f.settings.phoneLifeMonths > 0 ? capex / f.settings.phoneLifeMonths : 0;
  const net = gross - amortMo;
  const paybackMonths = gross > 0 ? +(capex / gross).toFixed(1) : null;
  const occupancy = capacity > 0 ? +((active / capacity) * 100).toFixed(0) : 0;

  /* точка безубыточности по активным номерам: contrib*a >= idleCost*(cap-a) + amort */
  const contrib = seat - perActive;
  const breakevenActive = contrib + c.idleKeepWarm > 0
    ? Math.ceil((c.idleKeepWarm * capacity + amortMo) / (contrib + c.idleKeepWarm)) : 0;

  return {
    counts: { total: nums.length, active, idle, warming, banned, devices: f.devices.length, capacity, free: Math.max(0, capacity - nums.filter(n => n.deviceId).length) },
    money: { seat, perActiveCogs: perActive, revenue, cogs, cogsActive, cogsIdle, gross, capex, amortMo: +amortMo.toFixed(1), net: +net.toFixed(1), paybackMonths, occupancy, breakevenActive, contribPerActive: contrib },
  };
}

/* ---------- сид реальными данными (то, что уже сделали вживую) ---------- */
function seedReal() {
  const f = farm();
  if (f.numbers.length || f.devices.length) return { skipped: true, reason: 'ферма уже не пустая' };
  const dev = addDevice({ name: 'Honor X5c Plus (пилот)', model: 'Honor X5c Plus', serial: '192.168.1.67:38377', location: 'Италия (домашний Wi-Fi)', capacity: 5 });
  addNumber({ phone: '+447520637167', deviceId: dev.id, slot: 'island', waStatus: 'ready', displayName: 'Alex', notes: 'Зареган вживую 23.09.2026, SMS→код 833457, чистый номер' });
  addNumber({ phone: '+447915374648', deviceId: dev.id, slot: 'island', waStatus: 'ready', displayName: 'Alex', notes: 'Первый успешный, чистый' });
  addNumber({ phone: '+447915374651', waStatus: 'banned', notes: 'Recycled (уже на другом телефоне)' });
  addNumber({ phone: '+447451259896', waStatus: 'none', notes: 'Кулдаун (сожжён с облака)' });
  addNumber({ phone: '+447441484497', waStatus: 'none', notes: 'Кулдаун' });
  addNumber({ phone: '+447441485489', waStatus: 'none', notes: 'Couldn\'t send SMS (провайдер не доставляет)' });
  flog('seed.real', {}); persist();
  return { ok: true, device: dev.id, numbers: f.numbers.length };
}

module.exports = {
  farm, economics, seedReal,
  addDevice, removeDevice,
  addProxy, removeProxy, attachProxy,
  addNumber, findNumber, updateNumber,
  assign, revoke, failover, wipeSlot,
  setSettings,
};
