/**
 * 工单查询：TicketFilter（query string）→ 参数化 SQL（走索引）→ Ticket[]。
 * 依赖「现在时间」的条件（超时等级）与看板列在内存中过滤。
 */
import { SPECIAL_CHANNEL, type BoardColumn, type BuildingCode, type Ticket } from '../../../shared/contract';
import { isBuildingCode, normalizeBuilding } from '../buildings';
import { dataVersion, type Db } from '../db';
import { isDateStr } from '../lib/time';
import { dayRangeMs, finalizeTicket, toTicketBase, type TicketBase, type TicketRecord } from './tickets';

export type Query = Record<string, unknown>;

export interface ParsedTicketFilter {
  buildings: BuildingCode[];
  types: string[];
  statuses: string[];
  channels: string[];
  column: BoardColumn | null;
  from: string | null;
  to: string | null;
  q: string;
  overdue: 'red' | 'yellow' | 'any' | null;
  excludeSpecial: boolean;
}

/** 取单值（数组取第一个） */
export function qStr(q: Query, key: string): string {
  const v = q[key];
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' ? s.trim() : typeof s === 'number' ? String(s) : '';
}

/** 逗号分隔多值（也兼容重复参数 a=1&a=2） */
export function qList(q: Query, key: string): string[] {
  const v = q[key];
  const arr = Array.isArray(v) ? v : [v];
  return arr
    .flatMap((x) => (typeof x === 'string' ? x.split(/[,，]/) : []))
    .map((s) => s.trim())
    .filter(Boolean);
}

export function qInt(q: Query, key: string, def: number, min: number, max: number): number {
  const n = Number.parseInt(qStr(q, key), 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export function parseTicketFilter(q: Query): ParsedTicketFilter {
  const columnRaw = qStr(q, 'column');
  const overdueRaw = qStr(q, 'overdue');
  const from = qStr(q, 'from');
  const to = qStr(q, 'to');
  return {
    buildings: [
      ...new Set(
        qList(q, 'building').map((b) => {
          const up = b.toUpperCase();
          return isBuildingCode(up) ? up : normalizeBuilding(b);
        }),
      ),
    ],
    types: qList(q, 'type'),
    statuses: qList(q, 'status'),
    channels: qList(q, 'channel'),
    column: (['待处理', '跟进中', '已完成'] as const).find((c) => c === columnRaw) ?? null,
    from: isDateStr(from) ? from : null,
    to: isDateStr(to) ? to : null,
    q: qStr(q, 'q').slice(0, 100),
    overdue: (['red', 'yellow', 'any'] as const).find((c) => c === overdueRaw) ?? null,
    excludeSpecial: qStr(q, 'excludeSpecial') === '1',
  };
}

interface DailyRowDb {
  id: string;
  building: string;
  building_raw: string;
  floor: string;
  description: string;
  type: string;
  status: string;
  channel: string;
  reported_ts: number | null;
  remark: string;
}

export function rowToRecord(r: DailyRowDb): TicketRecord {
  return {
    id: r.id,
    building: r.building as BuildingCode,
    buildingRaw: r.building_raw,
    floor: r.floor,
    description: r.description,
    type: r.type,
    status: r.status,
    channel: r.channel,
    reportedTs: r.reported_ts === null ? null : Number(r.reported_ts),
    remark: r.remark,
  };
}

const COLS = 'id, building, building_raw, floor, description, type, status, channel, reported_ts, remark';

/**
 * 内存缓存：工单中与时间无关的部分（备注解析、ISO 时间等）按数据版本缓存，
 * 同步写入或其他进程（npm run sync）提交后自动失效。SQL 仍负责筛选（走索引），只取 id。
 */
const baseCache = new WeakMap<Db, { version: string; byId: Map<string, TicketBase> }>();

function ticketBases(db: Db): Map<string, TicketBase> {
  const version = dataVersion(db);
  const hit = baseCache.get(db);
  if (hit && hit.version === version) return hit.byId;
  const rows = db.prepare(`SELECT ${COLS} FROM daily_tickets`).all() as unknown as DailyRowDb[];
  const byId = new Map<string, TicketBase>();
  for (const r of rows) byId.set(r.id, toTicketBase(rowToRecord(r)));
  baseCache.set(db, { version, byId });
  return byId;
}

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function inClause(col: string, values: string[], params: (string | number)[]): string {
  params.push(...values);
  return `${col} IN (${values.map(() => '?').join(',')})`;
}

/**
 * 查询工单。
 * @param opts.ignoreExcludeSpecial 统计时需要原始专项数，先不在 SQL 中排除
 */
export function queryTickets(
  db: Db,
  f: ParsedTicketFilter,
  now: number,
  opts: { ignoreExcludeSpecial?: boolean } = {},
): Ticket[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (f.buildings.length) where.push(inClause('building', f.buildings, params));
  if (f.types.length) where.push(inClause('type', f.types, params));
  if (f.statuses.length) where.push(inClause('status', f.statuses, params));
  if (f.channels.length) where.push(inClause('channel', f.channels, params));
  if (f.excludeSpecial && !opts.ignoreExcludeSpecial) {
    where.push('channel <> ?');
    params.push(SPECIAL_CHANNEL);
  }
  if (f.column === '已完成') {
    where.push("status = '已完成'");
  } else if (f.column === '待处理') {
    where.push("status IN ('待处理', '')");
  } else if (f.column === '跟进中') {
    where.push("status NOT IN ('已完成', '待处理', '')");
  }
  const { fromTs, toTs } = dayRangeMs(f.from, f.to);
  if (fromTs !== null) {
    where.push('reported_ts >= ?');
    params.push(fromTs);
  }
  if (toTs !== null) {
    where.push('reported_ts < ?');
    params.push(toTs);
  }
  if (f.q) {
    const like = `%${escapeLike(f.q)}%`;
    where.push("(description LIKE ? ESCAPE '\\' OR remark LIKE ? ESCAPE '\\' OR floor LIKE ? ESCAPE '\\' OR building_raw LIKE ? ESCAPE '\\')");
    params.push(like, like, like, like);
  }
  const sql = `SELECT id FROM daily_tickets${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY reported_ts DESC`;
  const ids = db.prepare(sql).all(...params) as unknown as { id: string }[];
  const bases = ticketBases(db);
  let tickets: Ticket[] = [];
  for (const { id } of ids) {
    const b = bases.get(id);
    if (b) tickets.push(finalizeTicket(b, now));
  }
  if (f.overdue === 'red') tickets = tickets.filter((t) => t.overdue === 'red');
  else if (f.overdue === 'yellow') tickets = tickets.filter((t) => t.overdue === 'yellow');
  else if (f.overdue === 'any') tickets = tickets.filter((t) => t.overdue !== 'none');
  return tickets;
}

export function getTicketById(db: Db, id: string, now: number): Ticket | null {
  const b = ticketBases(db).get(id);
  return b ? finalizeTicket(b, now) : null;
}

export type TicketSort = 'reportedAt' | '-reportedAt' | 'ageHours' | '-ageHours';

export function sortTickets(list: Ticket[], sort: string): Ticket[] {
  const s = (['reportedAt', '-reportedAt', 'ageHours', '-ageHours'] as const).find((x) => x === sort) ?? '-reportedAt';
  const desc = s.startsWith('-');
  const key = s.replace('-', '') as 'reportedAt' | 'ageHours';
  const val = (t: Ticket): number | null =>
    key === 'ageHours' ? t.ageHours : t.reportedAt === null ? null : Date.parse(t.reportedAt);
  return [...list].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1; // 空值始终排后
    if (vb === null) return -1;
    return desc ? vb - va : va - vb;
  });
}

/** 数据库中实际出现的渠道（按数量降序） */
export function distinctChannels(db: Db): string[] {
  const rows = db
    .prepare("SELECT channel, COUNT(*) AS n FROM daily_tickets WHERE channel <> '' GROUP BY channel ORDER BY n DESC")
    .all() as unknown as { channel: string }[];
  return rows.map((r) => r.channel);
}
