// Before/after of the Graduation Day-style restyle: qa/out/overview/PAWtastic-Games-before-after.png
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const img = (d, f) => 'data:image/png;base64,' + fs.readFileSync(path.resolve('qa/out', d, f)).toString('base64');
const font = (w) => 'data:font/woff2;base64,' + fs.readFileSync(path.resolve(`src/assets/fonts/dm-sans-${w}.woff2`)).toString('base64');
const rows = [['02-home.png', 'Home'], ['03-daycare-overhead.png', 'Daycare'], ['09-visit.png', 'Visit']];
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'DM Sans';font-weight:400;src:url(${font(400)})}@font-face{font-family:'DM Sans';font-weight:700;src:url(${font(700)})}
body{margin:0;background:#FAF8F5;font-family:'DM Sans',system-ui,sans-serif;color:#312721}
.wrap{padding:44px 50px}.eyebrow{font-size:15px;letter-spacing:.14em;text-transform:uppercase;color:#70645C;margin:0}
h1{margin:2px 0 28px;font-size:40px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px 34px}
.col{text-align:center;font-size:22px;font-weight:700}.col span{display:block;font-size:16px;font-weight:400;color:#70645C}
.phone{width:320px;margin:0 auto;padding:9px;border-radius:42px;background:#312721}.phone img{display:block;width:100%;border-radius:33px}
.label{font-size:20px;font-weight:700;text-align:center;margin-top:10px}
</style></head><body><div class="wrap"><p class="eyebrow">PAWtastic Games</p><h1>Before and after: Graduation Day style</h1>
<div class="grid"><div class="col">Before<span>sky gradient, rounded fonts, navy frames</span></div><div class="col">After<span>Graduation Day: warm white, DM Sans, thin lines</span></div><div class="col">Graduation Day<span>the game it now matches</span></div>
${rows.map(([f, t], i) => `<div><div class="phone"><img src="${img('overview-before', f)}"></div><div class="label">${t}: before</div></div><div><div class="phone"><img src="${img('overview', f)}"></div><div class="label">${t}: after</div></div>${i === 0 ? `<div><div class="phone"><img src="${img('overview', '06-graduation.png')}"></div><div class="label">Graduation Day in the hub</div></div>` : '<div></div>'}`).join('')}
</div></div></body></html>`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: 'qa/out/overview/PAWtastic-Games-before-after.png', fullPage: true });
  await browser.close();
  console.log('wrote before/after');
})();
