import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const THEMES = ['light', 'emerald', 'dark', 'warm', 'mono', 'frame'];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1600,1000'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1.25 });
await page.goto('http://localhost:5077/#overview', { waitUntil: 'networkidle2' });

// логин
if (await page.$('#loginPass')) {
  await page.type('#loginPass', 'lumen2026');
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(b => /войти/i.test(b.textContent))?.click(); });
  await sleep(3500);
}
await sleep(2000);

for (const t of THEMES) {
  await page.evaluate(k => { window.setTheme && window.setTheme(k); }, t);
  await sleep(900);
  await page.evaluate(() => { (window.LUMEN && window.LUMEN.go) ? window.LUMEN.go('overview') : (location.hash = '#overview'); });
  await sleep(1800);
  await page.screenshot({ path: `public/assets/theme-${t}.png` });
  console.log('captured theme-' + t + '.png');
}
await browser.close();
console.log('done');
