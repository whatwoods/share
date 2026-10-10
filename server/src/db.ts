/**
 * SQLite（node:sqlite DatabaseSync）建表 / 迁移 / 连接。
 * 表：
 *  - daily_tickets  日常维修总表（规范化列 + 原始 fields JSON）
 *  - legacy_items   施工遗留专项表
 *  - sync_runs      同步记录
 *  - kv             杂项键值（如各表最后一次成功同步的数据来源 live/mock）
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

const MIGRATIONS: string[] = [
  // v1
  `
  CREATE TABLE IF NOT EXISTS daily_tickets (
    id            TEXT PRIMARY KEY,
    building      TEXT NOT NULL,
    building_raw  TEXT NOT NULL DEFAULT '',
    floor         TEXT NOT NULL DEFAULT '',
    description   TEXT NOT NULL DEFAULT '',
    type          TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT '',
    channel       TEXT NOT NULL DEFAULT '',
    reported_ts   INTEGER,
    remark        TEXT NOT NULL DEFAULT '',
    hash          TEXT NOT NULL,
    raw_json      TEXT NOT NULL DEFAULT '{}',
    synced_at     INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_daily_building ON daily_tickets(building);
  CREATE INDEX IF NOT EXISTS idx_daily_status   ON daily_tickets(status);
  CREATE INDEX IF NOT EXISTS idx_daily_type     ON daily_tickets(type);
  CREATE INDEX IF NOT EXISTS idx_daily_reported ON daily_tickets(reported_ts);
  CREATE INDEX IF NOT EXISTS idx_daily_channel  ON daily_tickets(channel);

  CREATE TABLE IF NOT EXISTS legacy_items (
    id            TEXT PRIMARY KEY,
    seq           INTEGER,
    grp           TEXT NOT NULL,
    source_table  TEXT NOT NULL DEFAULT '',
    unit          TEXT NOT NULL DEFAULT '',
    building      TEXT NOT NULL,
    building_raw  TEXT NOT NULL DEFAULT '',
    floor         TEXT NOT NULL DEFAULT '',
    type          TEXT NOT NULL DEFAULT '',
    description   TEXT NOT NULL DEFAULT '',
    reported_ts   INTEGER,
    status        TEXT NOT NULL DEFAULT '',
    progress      TEXT NOT NULL DEFAULT '',
    hash          TEXT NOT NULL,
    raw_json      TEXT NOT NULL DEFAULT '{}',
    synced_at     INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_legacy_grp      ON legacy_items(grp);
  CREATE INDEX IF NOT EXISTS idx_legacy_building ON legacy_items(building);
  CREATE INDEX IF NOT EXISTS idx_legacy_status   ON legacy_items(status);

  CREATE TABLE IF NOT EXISTS sync_runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    trigger      TEXT NOT NULL,
    mode         TEXT NOT NULL DEFAULT 'live',
    started_at   INTEGER NOT NULL,
    finished_at  INTEGER,
    ok           INTEGER NOT NULL DEFAULT 0,
    message      TEXT NOT NULL DEFAULT '',
    tables_json  TEXT NOT NULL DEFAULT '[]',
    duration_ms  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

export function migrate(db: Db): void {
  const current = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version) || 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

/** 打开数据库（path=':memory:' 用于测试） */
export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  migrate(db);
  return db;
}

let singleton: Db | null = null;

/** 应用级单例：DATA_DIR/wangu.db */
export function getDb(dataDir?: string): Db {
  if (singleton) return singleton;
  if (!dataDir) throw new Error('数据库尚未初始化');
  mkdirSync(dataDir, { recursive: true });
  singleton = openDb(join(dataDir, 'wangu.db'));
  return singleton;
}

export function closeDb(): void {
  singleton?.close();
  singleton = null;
}

/** 同步事务：fn 抛错则回滚 */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  }
}

/* ───────────── 数据版本（供内存缓存失效判断） ───────────── */

let localWrites = 0;
/** 本连接写入业务数据后调用 */
export function bumpDataVersion(): void {
  localWrites++;
}
/** 本连接写入计数 + SQLite data_version（其他连接/进程提交时变化，如 npm run sync） */
export function dataVersion(db: Db): string {
  const row = db.prepare('PRAGMA data_version').get() as { data_version: number };
  return `${localWrites}:${row.data_version}`;
}

export function kvGet(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function kvSet(db: Db, key: string, value: string): void {
  db.prepare('INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
