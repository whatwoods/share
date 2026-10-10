/**
 * 同步落库：事务内 upsert（按规范化内容 hash 判断 inserted/updated/unchanged）+ 删除本次未出现的记录。
 */
import type { SyncRun } from '../../../shared/contract';
import { bumpDataVersion, transaction, type Db } from '../db';
import type { FeishuRecord } from '../feishu/client';
import { contentHash, normalizeDaily, normalizeLegacy } from './normalize';

export type TableStat = SyncRun['tables'][number];
export type SyncTable = TableStat['table'];

interface TableSpec {
  name: 'daily_tickets' | 'legacy_items';
  columns: string[];
  toRow: (rec: FeishuRecord) => Record<string, string | number | null>;
}

const SPECS: Record<SyncTable, TableSpec> = {
  daily: {
    name: 'daily_tickets',
    columns: ['building', 'building_raw', 'floor', 'description', 'type', 'status', 'channel', 'reported_ts', 'remark'],
    toRow: (rec) => {
      const r = normalizeDaily(rec);
      return {
        building: r.building,
        building_raw: r.buildingRaw,
        floor: r.floor,
        description: r.description,
        type: r.type,
        status: r.status,
        channel: r.channel,
        reported_ts: r.reportedTs,
        remark: r.remark,
      };
    },
  },
  legacy: {
    name: 'legacy_items',
    columns: [
      'seq', 'grp', 'source_table', 'unit', 'building', 'building_raw', 'floor', 'type', 'description',
      'reported_ts', 'status', 'progress',
    ],
    toRow: (rec) => {
      const r = normalizeLegacy(rec);
      return {
        seq: r.seq,
        grp: r.group,
        source_table: r.sourceTable,
        unit: r.unit,
        building: r.building,
        building_raw: r.buildingRaw,
        floor: r.floor,
        type: r.type,
        description: r.description,
        reported_ts: r.reportedTs,
        status: r.status,
        progress: r.progress,
      };
    },
  },
};

export function countRows(db: Db, table: SyncTable): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${SPECS[table].name}`).get() as { n: number };
  return Number(row.n);
}

/**
 * 应用一次全量拉取结果。调用方需保证 records 非空（0 条时不应调用，以保护本地缓存）。
 */
export function applyRecords(db: Db, table: SyncTable, records: FeishuRecord[], now = Date.now()): TableStat {
  const spec = SPECS[table];
  const stat: TableStat = { table, fetched: records.length, inserted: 0, updated: 0, deleted: 0, unchanged: 0 };

  // 同 record_id 去重（以最后一条为准）
  const byId = new Map<string, FeishuRecord>();
  for (const r of records) if (r.record_id) byId.set(r.record_id, r);

  const cols = spec.columns;
  const insert = db.prepare(
    `INSERT INTO ${spec.name} (id, ${cols.join(', ')}, hash, raw_json, synced_at)
     VALUES (?, ${cols.map(() => '?').join(', ')}, ?, ?, ?)`,
  );
  const update = db.prepare(
    `UPDATE ${spec.name} SET ${cols.map((c) => `${c} = ?`).join(', ')}, hash = ?, raw_json = ?, synced_at = ? WHERE id = ?`,
  );
  const del = db.prepare(`DELETE FROM ${spec.name} WHERE id = ?`);

  transaction(db, () => {
    const existing = new Map<string, string>();
    for (const r of db.prepare(`SELECT id, hash FROM ${spec.name}`).all() as unknown as { id: string; hash: string }[]) {
      existing.set(r.id, r.hash);
    }
    for (const [id, rec] of byId) {
      const row = spec.toRow(rec);
      const hash = contentHash(row);
      const values = cols.map((c) => row[c] ?? null);
      const raw = JSON.stringify(rec.fields ?? {});
      const old = existing.get(id);
      if (old === undefined) {
        insert.run(id, ...values, hash, raw, now);
        stat.inserted++;
      } else if (old !== hash) {
        update.run(...values, hash, raw, now, id);
        stat.updated++;
      } else {
        stat.unchanged++;
      }
    }
    for (const id of existing.keys()) {
      if (!byId.has(id)) {
        del.run(id);
        stat.deleted++;
      }
    }
  });
  if (stat.inserted || stat.updated || stat.deleted) bumpDataVersion();
  return stat;
}
