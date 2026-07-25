const http=require('http'),fs=require('fs');const DB=__dirname+'/../data/db.json';
function post(p,b){return new Promise(r=>{const d=JSON.stringify(b);const q=http.request({host:'localhost',port:5077,path:p,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(d)}},s=>{let x='';s.on('data',c=>x+=c);s.on('end',()=>r(x))});q.write(d);q.end()})}
const sleep=m=>new Promise(r=>setTimeout(r,m));const db=()=>JSON.parse(fs.readFileSync(DB,'utf8'));
const lead=f=>[...db().leads].reverse().find(l=>l.phone.replace(/\D/g,'')===f.replace(/\D/g,''));
const outN=f=>{const l=lead(f);return l?db().messages.filter(m=>m.leadId===l.id&&m.dir==='out').length:0};
function inb(f,n,t){const v={messaging_product:'whatsapp',metadata:{phone_number_id:'1249597001567190'},contacts:[{profile:{name:n},wa_id:f}],messages:[{from:f,id:'wamid.B'+Date.now()+Math.random().toString(36).slice(2,7),timestamp:''+(Date.now()/1e3|0),type:'text',text:{body:t}}]};return post('/wa/webhook',{object:'whatsapp_business_account',entry:[{id:'1510978280241988',changes:[{field:'messages',value:v}]}]})}
async function turn(f,n,t){const b=outN(f);await inb(f,n,t);let w=0;while(outN(f)<=b&&w<11000){await sleep(500);w+=500}const l=lead(f);const o=db().messages.filter(m=>m.leadId===l.id&&m.dir==='out');const ai=o[o.length-1];return{ai:outN(f)>b?ai.text:'(молчит)',stage:l.stage,geo:l.geo,quals:Object.fromEntries(Object.entries(l.quals).map(([k,v])=>[k,v?v.value:null])),tags:l.tags,enabled:l.ai.enabled}}
async function sc(title,f,n,turns){console.log('\n### '+title);for(const t of turns){const r=await turn(f,n,t);console.log('  «'+t+'»');console.log('   → '+r.ai.slice(0,110));console.log('   [гео '+r.geo+' | '+r.stage+' | ИИ '+(r.enabled?'вкл':'ВЫКЛ')+' | '+r.tags.filter(x=>x!=='входящий').join(',')+']');}}
(async()=>{const s=Date.now().toString().slice(-4);
 await sc('Down-sell: бюджет ниже порога Дубая','71'+s,'Низкий бюджет',['Квартира в Дубае','Бюджет 50 тысяч долларов, под доход']);
 await sc('Opt-out: стоп-слово','72'+s,'Отписка',['Апартаменты в Дубае','не пишите мне больше']);
 await sc('Пхукет: гео + доходность','73'+s,'Пхукет Тест',['Хочу студию на Пхукете под доход, 120к','Куплю в течение месяца']);
 await sc('Всё в одном сообщении (не переспрашивать)','74'+s,'Всё сразу',['Инвестирую, вилла на Бали, до 500к, покупка в этом квартале']);
 await sc('Испания + ВНЖ','75'+s,'Испания Тест',['Квартира в Испании для ВНЖ','Бюджет 200 тысяч евро, в течение полугода']);
 console.log('\n✓ батарея завершена');})();
