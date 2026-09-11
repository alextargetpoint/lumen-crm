import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const now=1789000000000;
const CHATS=[
  {id:'l1',name:'Мария · Дубай Marina',phone:'+971 50 123 4567',geo:'Дубай',lastText:'Да, 2BR до $650k, можно у воды',lastMsgAt:now-4*60000,unread:2,needsMe:true,lastDir:'in'},
  {id:'l2',name:'Артём Соколов',phone:'+34 600 22 11 00',geo:'Испания',lastText:'Отправил подборку — гляньте 🙌',lastMsgAt:now-40*60000,unread:0,needsMe:false,lastDir:'out'},
  {id:'l3',name:'Ольга · Пхукет',phone:'+66 80 555 1212',geo:'Пхукет',lastText:'А рассрочка есть?',lastMsgAt:now-3*3600000,unread:1,needsMe:true,lastDir:'in'},
  {id:'l4',name:'Дмитрий Кузнецов',phone:'+971 55 900 3344',geo:'Дубай',lastText:'Спасибо, подумаю до пятницы',lastMsgAt:now-26*3600000,unread:0,needsMe:false,lastDir:'in'},
  {id:'l5',name:'Sarah Nguyen',phone:'+65 8123 4567',geo:'Бали',lastText:'Perfect, lets schedule a call',lastMsgAt:now-52*3600000,unread:0,needsMe:false,lastDir:'in'}
];
const CONV={id:'l1',name:'Мария · Дубай Marina',phone:'+971 50 123 4567',stage:'qualified',aiOn:true,typing:false,messages:[
  {at:now-40*60000,dir:'in',text:'Здравствуйте! Смотрю Dubai Marina, 2 спальни',status:'read'},
  {at:now-38*60000,dir:'out',text:'Мария, добрый день! Отличный выбор 🙌 Подскажите бюджет и когда планируете покупку?',status:'read'},
  {at:now-22*60000,dir:'in',text:'До 650 тысяч, ближайшие пару месяцев',status:'read'},
  {at:now-20*60000,dir:'out',text:'Поняла. Важна близость к воде и вид? И для себя или под аренду?',status:'read'},
  {at:now-6*60000,dir:'in',text:'Для себя, обязательно у воды',status:'read'},
  {at:now-4*60000,dir:'in',text:'Да, 2BR до $650k, можно у воды',status:'read'}
]};
const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-dev-shm-usage','--hide-scrollbars']});
const page=await browser.newPage();
await page.setViewport({width:400,height:860,deviceScaleFactor:2.5,isMobile:true,hasTouch:true});
await page.evaluateOnNewDocument((chats,conv)=>{
  const noop=function(){return this};
  window.Telegram={WebApp:{initData:'mock=1',initDataUnsafe:{user:{id:1,first_name:'Брокер'}},version:'7.0',colorScheme:'dark',themeParams:{bg_color:'#0e1621',text_color:'#ffffff',hint_color:'#7d8b99',button_color:'#3390ec',secondary_bg_color:'#131c26'},viewportHeight:860,viewportStableHeight:860,isExpanded:true,ready:noop,expand:noop,close:noop,enableClosingConfirmation:noop,disableVerticalSwipes:noop,setHeaderColor:noop,setBackgroundColor:noop,onEvent:noop,offEvent:noop,sendData:noop,openLink:noop,showPopup:noop,showAlert:noop,HapticFeedback:{impactOccurred:noop,notificationOccurred:noop,selectionChanged:noop},BackButton:{show:noop,hide:noop,onClick:noop,offClick:noop},MainButton:{show:noop,hide:noop,setText:noop,onClick:noop,offClick:noop,setParams:noop,enable:noop,disable:noop}}};
  try{localStorage.setItem('lumen_tgprefs_x',JSON.stringify({theme:'dark'}))}catch(e){}
  const real=window.fetch.bind(window);
  const J=o=>Promise.resolve(new Response(JSON.stringify(o),{status:200,headers:{'Content-Type':'application/json'}}));
  window.fetch=(u,opt)=>{const url=typeof u==='string'?u:(u&&u.url)||'';
    if(url.includes('/tgapp/api/chats'))return J(chats);
    const m=url.match(/\/tgapp\/api\/chat\/([^/?]+)$/);
    if(m)return J(Object.assign({},conv,{id:m[1]}));
    if(url.includes('/tgapp/api/'))return J({ok:true});
    return real(u,opt);};
},CHATS,CONV);
page.on('pageerror',e=>console.log('PAGEERR:',e.message));page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE:',m.text())});
await page.goto('http://localhost:5077/tgapp.html',{waitUntil:'networkidle2'});
await sleep(800);
await page.evaluate(()=>{try{if(typeof loadChats==='function')loadChats()}catch(e){}});
await sleep(1600);
await page.screenshot({path:'public/assets/site/cap-tg.png'});
const diag=await page.evaluate(()=>({init:(window.Telegram&&window.Telegram.WebApp&&window.Telegram.WebApp.initData)||'EMPTY',rows:document.querySelectorAll('.row').length,chats:(window.CHATS||[]).length}));console.log('DIAG',JSON.stringify(diag));const rows=diag.rows;
console.log('rows rendered:',rows);
await page.evaluate(()=>{const r=document.querySelector('.row');if(r)r.click();});
await sleep(2000);
await page.screenshot({path:'public/assets/site/cap-tg-chat.png'});
console.log('done');
await browser.close();
