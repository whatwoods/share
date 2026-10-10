/**
 * 接口集成测试：内存库 + mock 数据 + 鉴权开启。
 * 注意：config 在 import 时读取环境变量，因此先设置 env 再动态 import。
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import ExcelJS from 'exceljs';
import type { FastifyInstance } from 'fastify';

process.env.AUTH_PASSWORD = 'test-pass';
process.env.AUTH_SECRET = 'test-secret';
process.env.DATA_MODE = 'mock';
process.env.LOG_LEVEL = 'silent';

let app: FastifyInstance;
let cookie = '';

before(async () => {
  const { openDb } = await import('../src/db');
  const { buildApp } = await import('../src/app');
  const { runSync } = await import('../src/sync/runner');
  const db = openDb(':memory:');
  const run = await runSync(db, 'startup');
  assert.equal(run.ok, true);
  app = await buildApp(db, { logger: false });
});

after(async () => {
  await app?.close();
});

const get = (url: string, withCookie = true) => app.inject({ method: 'GET', url, headers: withCookie && cookie ? { cookie } : {} });

test('鉴权：未登录 401；错误密码 401；登录后可访问', async () => {
  assert.equal((await get('/api/health', false)).statusCode, 200);
  const me0 = (await get('/api/auth/me', false)).json();
  assert.deepEqual(me0, { authenticated: false, authEnabled: true });
  const r401 = await get('/api/meta', false);
  assert.equal(r401.statusCode, 401);
  assert.ok(r401.json().error);

  const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { password: 'nope' } });
  assert.equal(bad.statusCode, 401);
  const ok = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { password: 'test-pass' } });
  assert.equal(ok.statusCode, 200);
  const setCookie = String(ok.headers['set-cookie']);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Path=\//);
  assert.match(setCookie, /Max-Age=604800/);
  cookie = setCookie.split(';')[0]!;
  assert.deepEqual((await get('/api/auth/me')).json(), { authenticated: true, authEnabled: true });

  // 篡改 cookie 无效
  const forged = await app.inject({ method: 'GET', url: '/api/meta', headers: { cookie: cookie.slice(0, -3) + 'abc' } });
  assert.equal(forged.statusCode, 401);
});

test('Meta / 工单 / 看板 / 统计', async () => {
  const meta = (await get('/api/meta')).json();
  assert.equal(meta.buildings.length, 20);
  assert.equal(meta.dataMode.feishu, 'mock');
  assert.equal(meta.dataMode.energy, 'mock');
  assert.ok(meta.channels.includes('专项摸排'));

  const list = (await get('/api/tickets?pageSize=500&page=1')).json();
  assert.equal(list.pageSize, 200);
  assert.equal(list.items.length, 200);
  const sorted = list.items.map((t: { reportedAt: string }) => t.reportedAt);
  assert.deepEqual(sorted, [...sorted].sort().reverse());

  const b3 = (await get('/api/tickets?building=3%E5%8F%B7%E6%A5%BC,B04&excludeSpecial=1')).json();
  assert.ok(b3.items.every((t: { building: string; isSpecial: boolean }) => ['B03', 'B04'].includes(t.building) && !t.isSpecial));

  const one = list.items[0];
  assert.equal((await get(`/api/tickets/${one.id}`)).json().id, one.id);
  assert.equal((await get('/api/tickets/not-exist')).statusCode, 404);

  const stats = (await get('/api/tickets/stats?excludeSpecial=1')).json();
  assert.equal(stats.summary.special, 66);
  const all = (await get('/api/tickets/stats')).json();
  assert.equal(all.summary.total - stats.summary.total, 66);

  const board = (await get('/api/tickets/board')).json();
  assert.equal(board.columns.length, 3);
  assert.ok(board.overdue.red + board.overdue.yellow > 0, '应有超时单');

  const red = (await get('/api/tickets?overdue=red&pageSize=200')).json();
  assert.equal(red.total, board.overdue.red);
});

test('Legacy / 楼宇 / 能耗接口', async () => {
  const sum = (await get('/api/legacy/summary')).json();
  assert.equal(sum.total, 156);
  const dispute = (await get('/api/legacy?group=DISPUTE')).json();
  assert.equal(dispute.items.length, 58);
  const open = (await get('/api/legacy?open=1')).json();
  assert.equal(open.items.length, sum.open);

  const ov = (await get('/api/buildings/overview')).json();
  assert.equal(ov.items.length, 20);
  assert.equal(ov.items[0].energy.spark.length, 14);
  const det = (await get('/api/buildings/B01')).json();
  assert.equal(det.building.code, 'B01');
  assert.equal(det.energy.trend.length, 30);
  assert.ok(det.energy.circuits.length > 0);
  assert.equal((await get('/api/buildings/B99')).statusCode, 404);

  for (const url of ['/api/energy/overview', '/api/energy/buildings', '/api/energy/buildings/B02/trend?days=7', '/api/energy/heatmap', '/api/energy/insight', '/api/energy/circuits', '/api/energy/solar']) {
    const r = await get(url);
    assert.equal(r.statusCode, 200, url);
    assert.equal(r.headers['x-data-mode'], 'mock', url);
  }
  assert.equal((await get('/api/energy/overview?start=bad')).statusCode, 400);
  assert.equal((await get('/api/energy/_raw?path=/etc/passwd')).statusCode, 400);
  assert.equal((await get('/api/nope')).statusCode, 404);
});

test('同步接口与状态', async () => {
  const r = await app.inject({ method: 'POST', url: '/api/sync', headers: { cookie } });
  assert.equal(r.statusCode, 200);
  const run = r.json();
  assert.equal(run.ok, true);
  assert.equal(run.tables[0].unchanged, run.tables[0].fetched);
  const st = (await get('/api/sync/status')).json();
  assert.equal(st.running, false);
  assert.equal(st.history.length, 2);
});

test('导出：遗留索赔清单可被 exceljs 读回', async () => {
  const r = await get('/api/legacy/export?group=ALL');
  assert.equal(r.statusCode, 200);
  assert.match(String(r.headers['content-disposition']), /filename\*=UTF-8''%E6%B9%BE%E8%B0%B7/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(r.rawPayload as unknown as ArrayBuffer);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['汇总', '德才', '上海建工', '七局', '漏水专项', '争议待定责']);
  const ws = wb.getWorksheet('漏水专项')!;
  assert.equal(String(ws.getCell(1, 1).value), '湾谷园区 · 漏水专项 施工遗留问题索赔清单');
  assert.equal(String(ws.getCell(3, 5).value), '问题描述');
  assert.equal(ws.getCell(4, 1).value, 36);

  const one = await get('/api/legacy/export?group=DECAI&open=1');
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(one.rawPayload as unknown as ArrayBuffer);
  assert.equal(wb2.worksheets.length, 1);
  assert.equal((await get('/api/legacy/export?group=XYZ')).statusCode, 400);
});

test('导出：工单明细', async () => {
  const r = await get('/api/tickets/export?building=B01&excludeSpecial=1');
  assert.equal(r.statusCode, 200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(r.rawPayload as unknown as ArrayBuffer);
  const ws = wb.worksheets[0]!;
  assert.equal(String(ws.getCell(2, 1).value), '楼栋');
  assert.equal(String(ws.getCell(3, 1).value), '1号楼');
});

test('登出', async () => {
  const r = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
  assert.equal(r.statusCode, 200);
  assert.match(String(r.headers['set-cookie']), /wangu_session=;/);
});
