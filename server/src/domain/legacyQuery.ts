/** 施工遗留：数据库读取 + 筛选（全量 ≤ 几百条，内存过滤即可） */
import type { BuildingCode, LegacyGroup, LegacyItem } from '../../../shared/contract';
import { isBuildingCode, normalizeBuilding } from '../buildings';
import type { Db } from '../db';
import { compareLegacy, toLegacyItem, type LegacyRecord } from './legacy';
import { qList, qStr, type Query } from './ticketQuery';

interface LegacyRowDb {
  id: string;
  seq: number | null;
  grp: string;
  source_table: string;
  unit: string;
  building: string;
  building_raw: string;
  floor: string;
  type: string;
  description: string;
  reported_ts: number | null;
  status: string;
  progress: string;
}

export function loadLegacyItems(db: Db, now: number): LegacyItem[] {
  const rows = db
    .prepare(
      `SELECT id, seq, grp, source_table, unit, building, building_raw, floor, type, description, reported_ts, status, progress
       FROM legacy_items`,
    )
    .all() as unknown as LegacyRowDb[];
  return rows
    .map((r) => {
      const rec: LegacyRecord = {
        id: r.id,
        seq: r.seq === null ? null : Number(r.seq),
        group: r.grp as LegacyGroup,
        sourceTable: r.source_table,
        unit: r.unit,
        building: r.building as BuildingCode,
        buildingRaw: r.building_raw,
        floor: r.floor,
        type: r.type,
        description: r.description,
        reportedTs: r.reported_ts === null ? null : Number(r.reported_ts),
        status: r.status,
        progress: r.progress,
      };
      return toLegacyItem(rec, now);
    })
    .sort(compareLegacy);
}

export interface LegacyFilter {
  groups: string[];
  statuses: string[];
  buildings: string[];
  q: string;
  openOnly: boolean;
}

export function parseLegacyFilter(q: Query): LegacyFilter {
  return {
    groups: qList(q, 'group')
      .map((g) => g.toUpperCase())
      .filter((g) => g !== 'ALL'),
    statuses: qList(q, 'status'),
    buildings: qList(q, 'building').map((b) => (isBuildingCode(b.toUpperCase()) ? b.toUpperCase() : normalizeBuilding(b))),
    q: qStr(q, 'q'),
    openOnly: qStr(q, 'open') === '1',
  };
}

export function filterLegacy(items: LegacyItem[], f: LegacyFilter): LegacyItem[] {
  const kw = f.q.toLowerCase();
  return items.filter(
    (i) =>
      (!f.groups.length || f.groups.includes(i.group)) &&
      (!f.statuses.length || f.statuses.includes(i.status)) &&
      (!f.buildings.length || f.buildings.includes(i.building)) &&
      (!f.openOnly || i.isOpen) &&
      (!kw ||
        [i.description, i.progress, i.unit, i.floor, i.buildingRaw, i.type, i.sourceTable, i.status]
          .join(' ')
          .toLowerCase()
          .includes(kw)),
  );
}

export function distinctLegacyStatuses(db: Db): string[] {
  const rows = db
    .prepare("SELECT status, COUNT(*) AS n FROM legacy_items WHERE status <> '' GROUP BY status ORDER BY n DESC")
    .all() as unknown as { status: string }[];
  return rows.map((r) => r.status);
}
