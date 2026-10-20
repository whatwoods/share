import { createRequire } from 'module';
const require = createRequire(process.env.PW_NODE_MODULES || '/opt/node-tools/node_modules/');
const { chromium } = require('playwright');
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto(process.argv[2]);
console.log(JSON.stringify(await p.evaluate(() => ({ T: window.TOTAL, tl: window.TIMELINE }))));
await b.close();
