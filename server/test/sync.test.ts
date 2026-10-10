import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDb } from '../src/db';
import type { FeishuRecord } from '../src/feishu/client';
import { generateDailyRecords } from '../src/mock/seed';
import { SyncBusyError, listSyncRuns, localDataSource, runSync, type SyncSource } from '../src/sync/runner';
import { applyRecords, countRows } from '../src/sync/store';

const daily = (id: string, desc: string): FeishuRecord => ({
  record_id: id,
  fields: { 问题描述: desc, 楼栋: '1', 楼层: '4', 工单类型: ['漏水专项防治'], 工单状态: ['已完成'], 报修渠道: ['微信报修'], 报修时间: '2025-11-01T07:37:00.000+08:00', 备注: '上海建工' },
});

test('applyRecords：新增 / 更新 / 未变 / 删除', () => {
  const db = openDb(':memory:');
  let s = applyRecords(db, 'daily', [daily('a', 'x'), daily('b', 'y')]);
  assert.deepEqual([s.inserted, s.updated, s.unchanged, s.deleted], [2, 0, 0, 0]);
  s = applyRecords(db, 'daily', [daily('a', 'x'), daily('b', 'y2'), daily('c', 'z')]);
  assert.deepEqual([s.inserted, s.updated, s.unchanged, s.deleted], [1, 1, 1, 0]);
  s = applyRecords(db, 'daily', [daily('c', 'z')]);
  assert.deepEqual([s.inserted, s.updated, s.unchanged, s.deleted], [0, 0, 1, 2]);
  assert.equal(countRows(db, 'daily'), 1);
  const row = db.prepare('SELECT building, type, status, reported_ts, raw_json FROM daily_tickets WHERE id = ?').get('c') as Record<string, unknown>;
  assert.equal(row.building, 'B01');
  assert.equal(row.type, '漏水专项防治');
  assert.equal(row.reported_ts, Date.parse('2025-11-01T07:37:00+08:00'));
  assert.ok(String(row.raw_json).includes('上海建工'));
});

test('runSync：拉取失败或 0 条时保留本地数据', async () => {
  const db = openDb(':memory:');
  const good: SyncSource = { mode: 'live', fetch: async (t) => (t === 'daily' ? [daily('a', 'x')] : [{ record_id: 'L1', fields: { 序号: 1, 来源表: ['漏水清单'] } }]) };
  const ok = await runSync(db, 'manual', good);
  assert.equal(ok.ok, true);
  assert.equal(localDataSource(db), 'live');

  const empty: SyncSource = { mode: 'live', fetch: async () => [] };
  const r1 = await runSync(db, 'schedule', empty);
  assert.equal(r1.ok, false);
  assert.equal(countRows(db, 'daily'), 1);
  assert.equal(countRows(db, 'legacy'), 1);

  const failing: SyncSource = { mode: 'live', fetch: async () => { throw new Error('boom'); } };
  const r2 = await runSync(db, 'schedule', failing);
  assert.equal(r2.ok, false);
  assert.match(r2.message, /boom/);
  assert.equal(countRows(db, 'daily'), 1);

  const runs = listSyncRuns(db);
  assert.equal(runs.length, 3);
  assert.equal(runs[0]!.trigger, 'schedule');
  assert.ok(runs.every((r) => r.finishedAt !== null));
});

test('runSync：并发互斥（第二个抛 409）', async () => {
  const db = openDb(':memory:');
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const slow: SyncSource = { mode: 'mock', fetch: async () => { await gate; return [daily('a', 'x')]; } };
  const p = runSync(db, 'manual', slow);
  await assert.rejects(runSync(db, 'manual', slow), (e: unknown) => e instanceof SyncBusyError && e.statusCode === 409);
  release();
  assert.equal((await p).ok, true);
});

test('mock 日常工单：同一天生成结果一致，专项摸排精确 66 条，约 4.7k 条', () => {
  const now = Date.parse('2026-10-10T09:00:00+08:00');
  const a = generateDailyRecords(now);
  const b = generateDailyRecords(now + 5 * 3600_000);
  assert.deepEqual(a, b);
  const special = a.filter((r) => (r.fields['报修渠道'] as string[])[0] === '专项摸排');
  assert.equal(special.length, 66);
  assert.ok(a.length > 4500 && a.length < 5000, String(a.length));
  assert.equal(new Set(a.map((r) => r.record_id)).size, a.length, 'record_id 唯一');
});

test('runSync：auto 模式下不允许 mock 覆盖本地真实数据', async () => {
  const db = openDb(':memory:');
  const live: SyncSource = { mode: 'live', fetch: async (t) => (t === 'daily' ? [daily('a', 'x')] : [{ record_id: 'L1', fields: { 序号: 1 } }]) };
  await runSync(db, 'manual', live);
  const mock: SyncSource = { mode: 'mock', fetch: async () => [daily('m1', 'mock')] };
  const r = await runSync(db, 'manual', mock);
  assert.equal(r.ok, false);
  assert.match(r.message, /DATA_MODE=mock/);
  assert.equal(countRows(db, 'daily'), 1);
  assert.ok(db.prepare("SELECT 1 FROM daily_tickets WHERE id = 'a'").get());
});
