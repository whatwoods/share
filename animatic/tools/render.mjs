import { createRequire } from 'module';
const require = createRequire(process.env.PW_NODE_MODULES || '/opt/node-tools/node_modules/');
const { chromium } = require('playwright');
const [,, url, outDir, mode, ...rest] = process.argv;
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.addInitScript(() => { window.__render = true; });
await p.goto(url); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1500);
const fs = await import('fs'); fs.mkdirSync(outDir, { recursive: true });
let times = mode === 'stills' ? rest.map(Number) : [];
if (mode === 'video') { const fps = +rest[0], dur = +rest[1]; for (let i = 0; i < fps * dur; i++) times.push(i / fps); }
let i = 0;
for (const t of times) {
  await p.evaluate(t => window.seek(t), t);
  const name = mode === 'stills' ? `t${String(t).padStart(5,'0')}.png` : `f${String(i).padStart(5,'0')}.jpg`;
  await p.screenshot({ path: `${outDir}/${name}`, ...(mode==='video'?{type:'jpeg',quality:85}:{}) });
  i++;
}
await b.close();
