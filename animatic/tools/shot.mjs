import { createRequire } from 'module';
const require = createRequire(process.env.PW_NODE_MODULES || '/opt/node-tools/node_modules/');
const { chromium } = require('playwright');
const [,, url, out, w, h] = process.argv;
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto(url); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(800);
await p.locator('#c').screenshot({ path: out });
await b.close();
