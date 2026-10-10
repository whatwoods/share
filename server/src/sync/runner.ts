/**
 * 同步执行器：拉取（飞书 / mock）→ 落库 → 写 sync_runs。
 * - 全局互斥：同一时刻只允许一个同步（POST /api/sync 运行中返回 409）
 * - 拉取失败或返回 0 条：不动本地表（保护本地缓存）
 */
import type { SyncRun } from '../../../shared/contract';
import { config, feishuMode } from '../config';
import { kvGet, kvSet, type Db } from '../db';
import { FeishuClient, type FeishuRecord } from '../feishu/client';
import { toShISO } from '../lib/time';
import { generateDailyRecords, generateLegacyRecords } from '../mock/seed';
import { applyRecords, type SyncTable, type TableStat } from './store';

export type SyncTrigger = SyncRun['trigger'];

export interface SyncSource {
  mode: 'live' | 'mock';
  fetch(table: SyncTable): Promise<FeishuRecord[]>;
}

export class SyncBusyError extends Error {
  readonly statusCode = 409;
  constructor() {
    super('已有同步任务正在执行，请稍后再试');
  }
}

const TABLE_LABEL: Record<SyncTable, string> = { daily: '日常工单', legacy: '施工遗留' };

let feishuClient: FeishuClient | null = null;

/** 按 DATA_MODE / 凭证决定数据源 */
export function defaultSource(now = () => Date.now()): SyncSource {
  if (feishuMode() === 'mock') {
    return {
      mode: 'mock',
      fetch: async (table) => (table === 'daily' ? generateDailyRecords(now()) : generateLegacyRecords()),
    };
  }
  feishuClient ??= new FeishuClient();
  const client = feishuClient;
  return {
    mode: 'live',
    fetch: (table) =>
      client.listAllRecords(
        config.feishu.baseToken,
        table === 'daily' ? config.feishu.tableDaily : config.feishu.tableLegacy,
      ),
  };
}

let running = false;
export function isSyncRunning(): boolean {
  return running;
}

/** 当前本地数据的实际来源（任一表来自 mock 即视为 mock）；从未同步过返回 null */
export function localDataSource(db: Db): 'live' | 'mock' | null {
  const a = kvGet(db, 'source:daily');
  const b = kvGet(db, 'source:legacy');
  if (!a && !b) return null;
  return a === 'mock' || b === 'mock' ? 'mock' : 'live';
}

interface SyncRunRow {
  id: number;
  trigger: string;
  started_at: number;
  finished_at: number | null;
  ok: number;
  message: string;
  tables_json: string;
  duration_ms: number;
}


function rowToRun(r: SyncRunRow): SyncRun {
  let tables: SyncRun['tables'] = [];
  try {
    tables = JSON.parse(r.tables_json) as SyncRun['tables'];
  } catch {
    tables = [];
  }
  return {
    id: Number(r.id),
    trigger: r.trigger as SyncTrigger,
    startedAt: toShISO(Number(r.started_at)),
    finishedAt: r.finished_at === null ? null : toShISO(Number(r.finished_at)),
    ok: Number(r.ok) === 1,
    message: r.message,
    tables,
    durationMs: Number(r.duration_ms),
  };
}

export function listSyncRuns(db: Db, limit = 20): SyncRun[] {
  const rows = db
    .prepare('SELECT * FROM sync_runs ORDER BY id DESC LIMIT ?')
    .all(limit) as unknown as SyncRunRow[];
  return rows.map(rowToRun);
}

/** 最近一次「已结束」的同步 */
export function lastSyncRun(db: Db): SyncRun | null {
  const row = db
    .prepare('SELECT * FROM sync_runs WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1')
    .get() as unknown as SyncRunRow | undefined;
  return row ? rowToRun(row) : null;
}

export async function runSync(
  db: Db,
  trigger: SyncTrigger,
  source: SyncSource = defaultSource(),
  log: (msg: string) => void = () => {},
): Promise<SyncRun> {
  if (running) throw new SyncBusyError();
  // 保护：auto 模式下若本地已是飞书真实数据，凭证缺失时不得用模拟数据覆盖（显式 DATA_MODE=mock 才允许）
  const guardBlocked = source.mode === 'mock' && config.dataMode !== 'mock' && localDataSource(db) === 'live';
  running = true;
  const startedAt = Date.now();
  const runId = Number(
    db
      .prepare('INSERT INTO sync_runs (trigger, mode, started_at, ok, message) VALUES (?, ?, ?, 0, ?)')
      .run(trigger, source.mode, startedAt, '同步中…').lastInsertRowid,
  );

  const tables: TableStat[] = [];
  const parts: string[] = [];
  let ok = true;
  try {
    if (guardBlocked) {
      ok = false;
      parts.push('本地已有飞书真实数据，但当前飞书凭证未配置（将使用模拟数据），已跳过以免覆盖；如确需切换请设置 DATA_MODE=mock');
    }
    for (const table of guardBlocked ? [] : (['daily', 'legacy'] as const)) {
      const label = TABLE_LABEL[table];
      try {
        const records = await source.fetch(table);
        if (records.length === 0) {
          ok = false;
          parts.push(`${label}：拉取到 0 条记录，已保留本地数据`);
          tables.push({ table, fetched: 0, inserted: 0, updated: 0, deleted: 0, unchanged: 0 });
          continue;
        }
        const stat = applyRecords(db, table, records);
        kvSet(db, `source:${table}`, source.mode);
        tables.push(stat);
        parts.push(
          `${label} ${stat.fetched} 条（新增 ${stat.inserted} / 更新 ${stat.updated} / 删除 ${stat.deleted} / 未变 ${stat.unchanged}）`,
        );
      } catch (err) {
        ok = false;
        const msg = (err as Error).message || String(err);
        parts.push(`${label}：同步失败（${msg}），已保留本地数据`);
        tables.push({ table, fetched: 0, inserted: 0, updated: 0, deleted: 0, unchanged: 0 });
      }
    }
  } finally {
    running = false;
  }

  const finishedAt = Date.now();
  const modeLabel = source.mode === 'mock' ? '模拟数据' : '飞书';
  const message = `${ok ? '同步完成' : '同步未完全成功'}（${modeLabel}）：${parts.join('；')}`;
  db.prepare(
    'UPDATE sync_runs SET finished_at = ?, ok = ?, message = ?, tables_json = ?, duration_ms = ? WHERE id = ?',
  ).run(finishedAt, ok ? 1 : 0, message, JSON.stringify(tables), finishedAt - startedAt, runId);
  // 只保留最近 500 条同步记录
  db.prepare('DELETE FROM sync_runs WHERE id <= ?').run(runId - 500);
  log(message);

  return {
    id: runId,
    trigger,
    startedAt: toShISO(startedAt),
    finishedAt: toShISO(finishedAt),
    ok,
    message,
    tables,
    durationMs: finishedAt - startedAt,
  };
}

/** 进程意外退出导致的「同步中」残留记录，启动时标记为失败 */
export function cleanupStaleRuns(db: Db): void {
  db.prepare(
    "UPDATE sync_runs SET finished_at = started_at, ok = 0, message = '同步被中断（进程退出）' WHERE finished_at IS NULL",
  ).run();
}
