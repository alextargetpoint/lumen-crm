const http = require('http'); const fs = require('fs');
const DB = __dirname + '/../data/db.json'; const PORT = 5077;
function post(path, body) { return new Promise((resolve) => { const data = JSON.stringify(body); const req = http.request({ host: 'localhost', port: PORT, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(b)); }); req.write(data); req.end(); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function db() { return JSON.parse(fs.readFileSync(DB, 'utf8')); }
function leadOf(from) { return [...db().leads].reverse().find(l => l.phone.replace(/\D/g, '') === from.replace(/\D/g, '')); }
function outCount(from) { const d = db(); const l = leadOf(from); if (!l) return 0; return d.messages.filter(m => m.leadId === l.id && m.dir === 'out').length; }
function inbound(from, name, text, referral) {
  const value = { messaging_product: 'whatsapp', metadata: { phone_number_id: '1249597001567190' }, contacts: [{ profile: { name }, wa_id: from }], messages: [{ from, id: 'wamid.SIM' + Date.now() + Math.floor(Math.random() * 1e4), timestamp: String(Date.now() / 1e3 | 0), type: 'text', text: { body: text }, ...(referral ? { referral } : {}) }] };
  return post('/wa/webhook', { object: 'whatsapp_business_account', entry: [{ id: '1510978280241988', changes: [{ field: 'messages', value }] }] });
}
async function turn(from, name, text, referral) {
  const before = outCount(from);
  await inbound(from, name, text, referral);
  let waited = 0; while (outCount(from) <= before && waited < 12000) { await sleep(500); waited += 500; }
  const d = db(); const l = leadOf(from);
  const outs = d.messages.filter(m => m.leadId === l.id && m.dir === 'out');
  const ai = outs[outs.length - 1];
  console.log(`\n  КЛИЕНТ: ${text}`);
  console.log(`  ИИ:     ${ai && outCount(from) > before ? ai.text : '(промолчал — так и задумано?)'}`);
  console.log(`  → гео: ${l.geo} | стадия: ${l.stage} | оси: ${JSON.stringify(Object.fromEntries(Object.entries(l.quals).map(([k, v]) => [k, v ? v.value : null])))}`);
  if (l.tags && l.tags.length) console.log(`  → теги: ${l.tags.join(', ')}`);
  if (l.summary) console.log(`  → САММАРИ: ${l.summary}`);
}
async function scenario(title, from, name, turns, referral) {
  console.log('\n══════════════════════════════════════════'); console.log('СЦЕНАРИЙ:', title); console.log('══════════════════════════════════════════');
  for (let i = 0; i < turns.length; i++) await turn(from, name, turns[i], i === 0 ? referral : null);
}
(async () => {
  const a = process.argv[2] || 'bali';
  const stamp = Date.now().toString().slice(-5);
  if (a === 'bali') await scenario('Бали — гео из сообщения (был баг «только Дубай»)', '7911' + stamp, 'Тест Бали', ['Добрый день, хочу виллу на Бали, бюджет 400 тысяч', 'Под сдачу в аренду', 'Готов смотреть в ближайший месяц']);
  if (a === 'human') await scenario('Стоп-триггер «позовите человека»', '7922' + stamp, 'Тест Стоп', ['Хочу апартаменты в Дубае', 'Позовите живого менеджера, с ботом не хочу']);
  if (a === 'downsell') await scenario('Down-sell (бюджет ниже порога Дубая)', '7933' + stamp, 'Тест Бюджет', ['Квартира в Дубае', 'Бюджет 50 тысяч долларов, под доход']);
  console.log('\n✓ готово');
})();
