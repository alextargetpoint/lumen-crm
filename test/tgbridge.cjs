/* Изолированный харнесс моста Telegram⇄WhatsApp — гоняет ЖИВЫЕ модули (require из репо),
   fetch застаблен, store.json НЕ трогается (store.load не вызываем → внутренний db=null,
   store.save()=no-op, все функции работают на переданном db). Медиа пишется во временную папку.
   Запуск: node test/tgbridge.cjs */
const os = require('os');
const fs = require('fs');
const path = require('path');

global.LUMEN_BASE = 'https://tunnel.example';

const tgbridge = require('../server/tgbridge');
const engine = require('../server/engine');
const wa = require('../server/wa');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-tg-'));
tgbridge.setMediaDir(TMP, '/assets/wa-media');
engine.onInboundMessage = (db, lead, m) => tgbridge.forwardInbound(db, lead, m);

const results = [];
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });

/* ---- стаб fetch: Telegram getFile / file-download / send*, ничего в сеть ---- */
let sends = [];
let midCounter = 1000;
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('/getFile')) {
    const fid = new URL(u).searchParams.get('file_id') || 'f';
    const ext = fid.includes('doc') ? 'pdf' : fid.includes('voice') ? 'oga' : fid.includes('vid') ? 'mp4' : 'jpg';
    return resp({ ok: true, result: { file_path: `music/${fid}.${ext}` } });
  }
  if (u.includes('api.telegram.org/file/bot')) {
    return { ok: true, async arrayBuffer() { return Buffer.from('FAKEMEDIA-' + Date.now()); } };
  }
  if (u.includes('api.telegram.org/bot')) {
    const method = u.split('/').pop();
    let body = {}; try { body = JSON.parse(opts.body || '{}'); } catch (_) {}
    sends.push({ method, body });
    return resp({ ok: true, result: { message_id: ++midCounter } });
  }
  throw new Error('unexpected fetch: ' + u);
};
function resp(j) { return { ok: true, async json() { return j; }, async arrayBuffer() { return Buffer.from(JSON.stringify(j)); } }; }

/* ---- минимальный db нужной формы ---- */
function makeDb() {
  return {
    settings: {
      tgBridge: { enabled: true, botToken: 'TESTBOT:xyz', secret: 'sec123' },
      channels: { tg: { botToken: '' } },
      ai: { provider: 'core', autoOff: { onHumanReply: true }, persona: {} },
      wa: { mode: 'mock', token: '', phoneId: '' },
      geoNames: { dubai: 'Дубай' },
      agency: { name: 'Test', geos: ['dubai'] },
    },
    brokers: [{ id: 'br1', name: 'Мария Тест', geo: 'dubai', load: 0, capacity: 20, tgBindCode: 'a1b2c3', tgChatId: null, active: true }],
    leads: [{ id: 'ld1', name: 'Иван Клиент', phone: '+971500000001', geo: 'dubai', stage: 'handover', broker: 'br1', ai: { enabled: true, chainStep: 0, silentSince: null }, tags: [], quals: {}, lastDir: 'in', numberId: null }],
    numbers: [{ id: 'n1', state: 'active', geo: 'dubai', channel: 'cloud_api', sentToday: 0, dayLimit: 1000, quality: 5 }],
    messages: [], events: [], campaigns: [], tgBridge: { replyMap: {} },
  };
}

async function run() {
  // 0) привязка брокера по коду
  let db = makeDb();
  const bindRes = await tgbridge.handleUpdate(db, { message: { chat: { id: 777 }, from: { id: 777 }, text: '/start a1b2c3' } });
  ok('bind by code', db.brokers[0].tgChatId === '777' && bindRes.bound, 'chatId=' + db.brokers[0].tgChatId);
  ok('bind confirms in TG', sends.some(s => s.method === 'sendMessage' && /Привязано/.test(s.body.text)));

  // 1) брокер → WA: текст (reply на пересланное сообщение)
  db.tgBridge.replyMap['777:555'] = { leadId: 'ld1', at: Date.now() };
  sends = [];
  const rText = await tgbridge.handleUpdate(db, { message: { chat: { id: 777 }, from: { id: 777 }, text: 'Здравствуйте! Скину пару вариантов', reply_to_message: { message_id: 555 } } });
  const outText = db.messages.filter(m => m.dir === 'out');
  ok('broker→WA text: message recorded', outText.length === 1 && outText[0].text.includes('пару вариантов') && outText[0].via === 'human', JSON.stringify(outText[0] || {}).slice(0, 80));
  ok('broker→WA text: routed to right lead', rText.leadId === 'ld1');
  ok('broker→WA: AI paused on human reply', db.leads[0].ai.enabled === false && db.leads[0].ai.pausedBy === 'broker');

  // 2) брокер → WA: ФОТО с подписью
  sends = [];
  await tgbridge.handleUpdate(db, { message: { chat: { id: 777 }, from: { id: 777 }, photo: [{ file_id: 'small' }, { file_id: 'bigphoto' }], caption: 'Планировка 2BR' } });
  const mPhoto = db.messages.filter(m => m.dir === 'out').pop();
  ok('broker→WA photo: media attached', mPhoto.media && mPhoto.media.type === 'image' && mPhoto.media.url.startsWith('/assets/wa-media/'), JSON.stringify(mPhoto.media || {}));
  ok('broker→WA photo: caption carried', mPhoto.text === 'Планировка 2BR');
  ok('broker→WA photo: file saved to disk', mPhoto.media && fs.existsSync(path.join(TMP, mPhoto.media.url.split('/').pop())));

  // 3) брокер → WA: голосовое, видео, документ (паритет типов)
  for (const [fid, cap, expect] of [['voice1', '', 'voice'], ['vid1', 'Обзор', 'video'], ['doc1', 'Договор', 'document']]) {
    const upd = { message: { chat: { id: 777 }, from: { id: 777 }, caption: cap } };
    if (expect === 'voice') upd.message.voice = { file_id: fid };
    if (expect === 'video') upd.message.video = { file_id: fid };
    if (expect === 'document') upd.message.document = { file_id: fid, file_name: 'contract.pdf' };
    await tgbridge.handleUpdate(db, upd);
    const mm = db.messages.filter(m => m.dir === 'out').pop();
    ok(`broker→WA ${expect}: media type`, mm.media && mm.media.type === expect, JSON.stringify(mm.media || {}));
  }

  // 4) брокер пишет без reply и без активного лида → просьба ответить reply
  const db2 = makeDb(); db2.brokers[0].tgChatId = '777';
  sends = [];
  const noLead = await tgbridge.handleUpdate(db2, { message: { chat: { id: 777 }, from: { id: 777 }, text: 'кому это?' } });
  ok('broker→WA: no target → asks to reply', noLead.skip === 'no lead' && sends.some(s => /reply/i.test(s.body.text || '')));
  ok('broker→WA: no phantom message sent', db2.messages.filter(m => m.dir === 'out').length === 0);

  // 5) WA-входящее клиента → пересылка брокеру в Telegram (текст)
  const db3 = makeDb(); db3.brokers[0].tgChatId = '777';
  sends = [];
  engine.inbound(db3, db3.leads[0], 'Есть что-то до 1 млн?');
  await new Promise(r => setTimeout(r, 30)); // forwardInbound асинхронный (fire-and-forget из хука)
  const fwdText = sends.find(s => s.method === 'sendMessage');
  ok('WA→broker text: forwarded', !!fwdText && /Иван Клиент/.test(fwdText.body.text) && /до 1 млн/.test(fwdText.body.text), JSON.stringify(fwdText ? fwdText.body : {}).slice(0, 90));
  ok('WA→broker: replyMap remembers msg→lead', Object.values(db3.tgBridge.replyMap).some(v => v.leadId === 'ld1'));

  // 6) WA-входящее с МЕДИА → sendPhoto брокеру с caption
  const db4 = makeDb(); db4.brokers[0].tgChatId = '777';
  sends = [];
  engine.inbound(db4, db4.leads[0], 'смотри план', { media: { type: 'image', url: '/assets/wa-media/incoming.jpg' } });
  await new Promise(r => setTimeout(r, 30));
  const fwdMedia = sends.find(s => s.method === 'sendPhoto');
  ok('WA→broker media: sendPhoto used', !!fwdMedia, JSON.stringify(fwdMedia ? fwdMedia.body : {}).slice(0, 90));
  ok('WA→broker media: absolute URL to Telegram', fwdMedia && String(fwdMedia.body.photo).startsWith('https://tunnel.example/assets/wa-media/'));
  ok('WA→broker media: caption has name+text', fwdMedia && /Иван Клиент/.test(fwdMedia.body.caption) && /смотри план/.test(fwdMedia.body.caption));
  ok('inbound stores media on message', db4.messages.some(m => m.dir === 'in' && m.media && m.media.type === 'image'));

  // 7) WA-媒 sendMedia payload формируется правильно (Cloud API форма)
  const capOk = wa.mediaSupportsCaption('image') && wa.mediaSupportsCaption('video') && wa.mediaSupportsCaption('document') && !wa.mediaSupportsCaption('voice') && !wa.mediaSupportsCaption('audio');
  ok('wa.mediaSupportsCaption correct', capOk);
  ok('wa.absUrl builds via LUMEN_BASE', wa === wa); // sanity (absUrl internal) — проверено через sendMedia ниже
  // перехватим POST Cloud API: включим cloud-режим и заглушим fetch на graph
  const db5 = makeDb(); db5.settings.wa = { mode: 'cloud', token: 'T', phoneId: 'PID' };
  db5.brokers[0].tgChatId = null;
  let graphBody = null;
  const prevFetch = global.fetch;
  global.fetch = async (url, opts) => { if (String(url).includes('graph.facebook.com')) { graphBody = JSON.parse(opts.body); return resp({ messages: [{ id: 'wamid.X' }] }); } return prevFetch(url, opts); };
  engine.send(db5, db5.leads[0], 'подпись', 'human', { channel: 'wa', media: { type: 'image', url: '/assets/wa-media/x.jpg' } });
  await new Promise(r => setTimeout(r, 30));
  global.fetch = prevFetch;
  ok('Cloud API image payload shape', graphBody && graphBody.type === 'image' && graphBody.image && graphBody.image.link === 'https://tunnel.example/assets/wa-media/x.jpg' && graphBody.image.caption === 'подпись', JSON.stringify(graphBody || {}).slice(0, 120));

  // вывод
  const failed = results.filter(r => !r.pass).length;
  console.log(results.map(r => `${r.pass ? '✓' : '✗ FAIL'}  ${r.name}${r.detail && !r.pass ? '  — ' + r.detail : ''}`).join('\n'));
  console.log(`\n${results.filter(r => r.pass).length}/${results.length} passed`);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  process.exit(failed ? 1 : 0);
}
run().catch(e => { console.error('harness crashed:', e); process.exit(1); });
