import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pages=['/land.html','/soon.html','/privacy.html','/terms.html','/cookies.html','/waitlist.html'];
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
for(const path of pages){
  const p=await b.newPage();
  const errs=[],req404=[];
  p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push('con:'+m.text().slice(0,80))});
  p.on('requestfailed',r=>req404.push(r.url().split('/').pop()));
  p.on('response',r=>{if(r.status()>=400)req404.push(r.status()+':'+r.url().split('/').pop().slice(0,30))});
  await p.setViewport({width:1280,height:900,deviceScaleFactor:1});
  await p.goto('http://localhost:5077'+path,{waitUntil:'domcontentloaded'});
  await sleep(1800);
  const ov=await p.evaluate(()=>{const H=document.body.scrollHeight;let bad=false;for(let y=0;y<H;y+=600){window.scrollTo(0,y);if(document.documentElement.scrollWidth>innerWidth+2)bad=true;}return bad;});
  console.log(path.padEnd(16),'errs:'+errs.length, 'bad-req:'+[...new Set(req404)].filter(x=>!/founder|telegram|analytics.google|gstatic|googleapis/.test(x)).join(',')||'', 'overflowX:'+ov);
  if(errs.length)console.log('   ↳',errs.slice(0,3).join(' | '));
  await p.close();
}
await b.close();console.log('bugcheck done');
