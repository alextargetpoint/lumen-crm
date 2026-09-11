import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-dev-shm-usage','--window-size=1520,980','--hide-scrollbars']});
const page=await browser.newPage();
await page.setViewport({width:1500,height:950,deviceScaleFactor:1.6});
await page.goto('http://localhost:5077/#overview',{waitUntil:'networkidle2'});
if(await page.$('#loginPass')){await page.type('#loginPass','lumen2026');await page.evaluate(()=>{[...document.querySelectorAll('button')].find(b=>/войти/i.test(b.textContent))?.click();});await sleep(3800);}
await sleep(1500);
// новая айдентика = тема mono
await page.evaluate(()=>{window.setTheme&&window.setTheme('mono');});
await sleep(1000);
async function shot(view, path, extra){
  await page.evaluate(v=>{(window.LUMEN&&window.LUMEN.go)?window.LUMEN.go(v):(location.hash='#'+v);}, view);
  await sleep(2000);
  if(extra){try{await extra();}catch(e){console.log('extra err',view,e.message);}await sleep(1400);}
  await page.screenshot({path});
  console.log('shot',view,'→',path);
}
await shot('overview','public/assets/theme-mono.png');
await page.screenshot({path:'public/assets/site/cap-overview.png'});
await shot('funnel','public/assets/site/cap-funnel.png');
// карточка лида: открыть первый диалог в inbox
await shot('inbox','public/assets/site/cap-leadcard.png', async()=>{
  await page.evaluate(()=>{const el=document.querySelector('[data-lead-id],.chat-item,.conv-item,.lead-row,.inbox-item,li[data-id]');if(el)el.click();});
});
await page.screenshot({path:'public/assets/site/cap-dialogs.png'});
await shot('collections','public/assets/site/cap-collections.png');
await shot('adsAnalytics','public/assets/site/cap-analytics.png');
// Telegram мини-апп
try{
  await page.goto('http://localhost:5077/tgapp.html',{waitUntil:'networkidle2'});
  await sleep(2500);
  await page.screenshot({path:'public/assets/site/cap-tg.png'});
  const txt=await page.evaluate(()=>document.body.innerText.slice(0,120));
  console.log('tgapp text:',JSON.stringify(txt));
}catch(e){console.log('tgapp err',e.message);}
await browser.close();console.log('done');
