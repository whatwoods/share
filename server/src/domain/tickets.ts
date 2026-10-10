/**
 * 日常维修工单：纯业务规则（无 IO，便于单测）。
 *  - 备注解析、看板列、超时等级、行 → Ticket 映射
 *  - 看板 / 统计聚合
 */
import {
  OVERDUE_THRESHOLDS_HOURS,
  SPECIAL_CHANNEL,
  TICKET_TYPES,
  TICKET_TYPE_OWNER,
  type BoardColumn,
  type BuildingCode,
  type OverdueLevel,
  type OwnerGroup,
  type RateRow,
  type Ticket,
  type TicketBoard,
  type TicketStats,
  type TicketType,
} from '../../../shared/contract';
import { BUILDING_CODES, buildingOrder } from '../buildings';
import { DAY_MS, HOUR_MS, addDays, parseShDate, shDate, shMonth, toShISO } from '../lib/time';

/** 规范化后的工单记录（即 daily_tickets 表的业务列） */
export interface TicketRecord {
  id: string;
  building: BuildingCode;
  buildingRaw: string;
  floor: string;
  description: string;
  type: string;
  status: string;
  channel: string;
  reportedTs: number | null;
  remark: string;
}

/* ───────────── 工种 / 责任主体 ───────────── */

export function isStandardType(t: string): t is TicketType {
  return (TICKET_TYPES as readonly string[]).includes(t);
}

export function ownerOf(type: string): OwnerGroup | null {
  return isStandardType(type) ? TICKET_TYPE_OWNER[type] : null;
}

export const OWNER_GROUPS: OwnerGroup[] = ['物业工程', '维保单位', '施工单位', '供应商'];

/* ───────────── 看板列 / 超时 ───────────── */

/** 已完成→已完成；待处理(及空)→待处理；跟进中/幕墙专项/其它→跟进中 */
export function boardColumn(status: string): BoardColumn {
  const s = status.trim();
  if (s === '已完成') return '已完成';
  if (s === '待处理' || s === '') return '待处理';
  return '跟进中';
}

export function overdueLevel(column: BoardColumn, ageHours: number | null): OverdueLevel {
  if (column === '已完成' || ageHours === null) return 'none';
  const t = OVERDUE_THRESHOLDS_HOURS[column];
  if (ageHours > t.red) return 'red';
  if (ageHours > t.yellow) return 'yellow';
  return 'none';
}

const OVERDUE_RANK: Record<OverdueLevel, number> = { red: 2, yellow: 1, none: 0 };

/** 按超时严重度（红>黄>无）再按挂单时长降序 */
export function compareBySeverity(a: Ticket, b: Ticket): number {
  return OVERDUE_RANK[b.overdue] - OVERDUE_RANK[a.overdue] || (b.ageHours ?? -1) - (a.ageHours ?? -1);
}

/* ───────────── 备注解析 ───────────── */

/** 结构化备注的键 → 字段（可按需扩充） */
export const REMARK_KEY_MAP: Record<string, 'unit' | 'reporter' | 'plan'> = {
  责任单位: 'unit',
  责任方: 'unit',
  施工单位: 'unit',
  维修单位: 'unit',
  报修人: 'reporter',
  报修者: 'reporter',
  联系人: 'reporter',
  方案: 'plan',
  处理方案: 'plan',
  维修方案: 'plan',
};

/** 自由文本中识别的常见单位名（按优先级，先匹配者胜出） */
export const KNOWN_UNITS: { pattern: RegExp; unit: string }[] = [
  { pattern: /上海建工/, unit: '上海建工' },
  { pattern: /德才/, unit: '德才' },
  { pattern: /七局/, unit: '七局' },
  { pattern: /中建/, unit: '中建' },
  { pattern: /新安/, unit: '新安' },
  { pattern: /维保/, unit: '维保' },
];

export function detectUnit(text: string): string | undefined {
  return KNOWN_UNITS.find((u) => u.pattern.test(text))?.unit;
}

export function parseRemark(remark: string): Ticket['remarkParsed'] {
  const out: Ticket['remarkParsed'] = {};
  const text = (remark ?? '').trim();
  if (!text) return out;
  const extra: Record<string, string> = {};
  let plain = text;

  const fp = /\[FP[:：]\s*([^\]\s]+)\s*\]/i.exec(text);
  if (fp) {
    out.fingerprint = fp[1];
    plain = plain.replace(fp[0], ' ');
  }

  for (const rawSeg of plain.split(/[|｜]/)) {
    const seg = rawSeg.trim();
    if (!seg) continue;
    const kv = /^([^:：]{1,16}?)\s*[:：]\s*(.*)$/.exec(seg);
    if (!kv) continue;
    const key = kv[1]!.trim();
    const value = kv[2]!.trim();
    if (!value) continue;
    const field = REMARK_KEY_MAP[key];
    if (field) {
      if (!out[field]) out[field] = value;
    } else {
      extra[key] = value;
    }
  }

  if (!out.unit) {
    const u = detectUnit(plain);
    if (u) out.unit = u;
  }
  if (Object.keys(extra).length) out.extra = extra;
  return out;
}

/* ───────────── 映射 ───────────── */

export function ageHoursOf(reportedTs: number | null, now: number): number | null {
  if (reportedTs === null) return null;
  return Math.max(0, Math.round(((now - reportedTs) / HOUR_MS) * 10) / 10);
}

/** 与「现在时间」无关的部分（可缓存）；reportedTs 用于计算挂单时长 */
export type TicketBase = Omit<Ticket, 'ageHours' | 'overdue'> & { reportedTs: number | null };

export function toTicketBase(r: TicketRecord): TicketBase {
  return {
    id: r.id,
    building: r.building,
    buildingRaw: r.buildingRaw,
    floor: r.floor,
    description: r.description,
    type: r.type,
    owner: ownerOf(r.type),
    status: r.status,
    column: boardColumn(r.status),
    channel: r.channel,
    reportedAt: r.reportedTs === null ? null : toShISO(r.reportedTs),
    remark: r.remark,
    remarkParsed: parseRemark(r.remark),
    isSpecial: r.channel === SPECIAL_CHANNEL,
    reportedTs: r.reportedTs,
  };
}

/** 补上与时间相关的 ageHours / overdue，得到对外的 Ticket */
export function finalizeTicket(b: TicketBase, now: number): Ticket {
  const { reportedTs, ...rest } = b;
  const ageHours = ageHoursOf(reportedTs, now);
  return { ...rest, ageHours, overdue: overdueLevel(b.column, ageHours) };
}

export function toTicket(r: TicketRecord, now: number): Ticket {
  return finalizeTicket(toTicketBase(r), now);
}

/* ───────────── 聚合 ───────────── */

export function rateRow(total: number, closed: number): RateRow {
  return { total, closed, open: total - closed, rate: total > 0 ? closed / total : 0 };
}

class Counter {
  total = 0;
  closed = 0;
  red = 0;
  yellow = 0;
  add(t: Ticket) {
    this.total++;
    if (t.column === '已完成') this.closed++;
    if (t.overdue === 'red') this.red++;
    else if (t.overdue === 'yellow') this.yellow++;
  }
  row(): RateRow {
    return rateRow(this.total, this.closed);
  }
}

function bump<K>(map: Map<K, Counter>, key: K, t: Ticket) {
  let c = map.get(key);
  if (!c) map.set(key, (c = new Counter()));
  c.add(t);
}

export interface StatsOptions {
  now: number;
  excludeSpecial: boolean;
  from?: string | null; // YYYY-MM-DD
  to?: string | null;
}

/**
 * 统计。tickets 为「除 excludeSpecial 外」其余筛选条件下的工单：
 * summary.special 始终为该范围内的原始专项数；其它指标在 excludeSpecial 时剔除专项单。
 */
export function computeTicketStats(all: Ticket[], opts: StatsOptions): TicketStats {
  const special = all.reduce((n, t) => n + (t.isSpecial ? 1 : 0), 0);
  const tickets = opts.excludeSpecial ? all.filter((t) => !t.isSpecial) : all;

  const sum = new Counter();
  const byType = new Map<string, Counter>();
  const byOwner = new Map<OwnerGroup, Counter>();
  const byBuilding = new Map<string, Counter>();
  const byChannel = new Map<string, Counter>();
  const byStatus = new Map<string, number>();
  const byMonth = new Map<string, Counter>();
  const byDay = new Map<string, Counter>();
  let openAgeSum = 0;
  let openAgeN = 0;

  for (const t of tickets) {
    sum.add(t);
    bump(byType, t.type, t);
    if (t.owner) bump(byOwner, t.owner, t);
    bump(byBuilding, t.building, t);
    bump(byChannel, t.channel, t);
    byStatus.set(t.status, (byStatus.get(t.status) ?? 0) + 1);
    if (t.reportedAt) {
      bump(byMonth, t.reportedAt.slice(0, 7), t);
      bump(byDay, t.reportedAt.slice(0, 10), t);
    }
    if (t.column !== '已完成' && t.ageHours !== null) {
      openAgeSum += t.ageHours;
      openAgeN++;
    }
  }

  // 8 大类固定顺序 + 未识别类型（按数量降序）追加
  const typeRows: TicketStats['byType'] = TICKET_TYPES.map((type) => ({
    type,
    owner: TICKET_TYPE_OWNER[type],
    ...(byType.get(type)?.row() ?? rateRow(0, 0)),
  }));
  [...byType.entries()]
    .filter(([type]) => !isStandardType(type))
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([type, c]) => typeRows.push({ type, owner: null, ...c.row() }));

  const buildingKeys = new Set<string>(BUILDING_CODES);
  for (const k of byBuilding.keys()) buildingKeys.add(k);
  const buildingRows = [...buildingKeys]
    .filter((k) => (BUILDING_CODES as string[]).includes(k) || (byBuilding.get(k)?.total ?? 0) > 0)
    .sort((a, b) => buildingOrder(a) - buildingOrder(b))
    .map((k) => {
      const c = byBuilding.get(k) ?? new Counter();
      return { building: k as BuildingCode, ...c.row(), red: c.red, yellow: c.yellow };
    });

  // 月份：最近 12 个月（受 from/to 约束），补零
  const nowDate = shDate(opts.now);
  const endDate = opts.to && opts.to < nowDate ? opts.to : nowDate;
  const endMonth = endDate.slice(0, 7);
  const months: string[] = [];
  {
    let [y, m] = endMonth.split('-').map(Number) as [number, number];
    for (let i = 0; i < 12; i++) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      if (opts.from && key < opts.from.slice(0, 7)) break;
      months.unshift(key);
      if (--m === 0) {
        m = 12;
        y--;
      }
    }
  }

  // 日：最近 30 天（截至 min(to, 今天)）
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) days.push(addDays(endDate, -i));

  return {
    summary: {
      ...sum.row(),
      red: sum.red,
      yellow: sum.yellow,
      special,
      avgOpenAgeHours: openAgeN ? Math.round((openAgeSum / openAgeN) * 10) / 10 : null,
    },
    byType: typeRows,
    byOwner: OWNER_GROUPS.map((owner) => ({ owner, ...(byOwner.get(owner)?.row() ?? rateRow(0, 0)) })),
    byBuilding: buildingRows,
    byChannel: [...byChannel.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([channel, c]) => ({ channel, ...c.row() })),
    byStatus: [...byStatus.entries()].sort((a, b) => b[1] - a[1]).map(([status, count]) => ({ status, count })),
    byMonth: months.map((month) => ({ month, ...(byMonth.get(month)?.row() ?? rateRow(0, 0)) })),
    byDay: days.map((date) => {
      const c = byDay.get(date);
      return { date, total: c?.total ?? 0, closed: c?.closed ?? 0 };
    }),
  };
}

const BOARD_COLUMNS: BoardColumn[] = ['待处理', '跟进中', '已完成'];

export function buildBoard(tickets: Ticket[]): TicketBoard {
  const groups = new Map<BoardColumn, Ticket[]>(BOARD_COLUMNS.map((c) => [c, []]));
  for (const t of tickets) groups.get(t.column)!.push(t);
  let red = 0;
  let yellow = 0;
  const columns = BOARD_COLUMNS.map((column) => {
    const list = groups.get(column)!;
    const r = list.filter((t) => t.overdue === 'red').length;
    const y = list.filter((t) => t.overdue === 'yellow').length;
    red += r;
    yellow += y;
    const items =
      column === '已完成'
        ? [...list].sort((a, b) => (b.reportedAt ?? '').localeCompare(a.reportedAt ?? '')).slice(0, 50)
        : [...list].sort(compareBySeverity).slice(0, 100);
    return { column, count: list.length, red: r, yellow: y, items };
  });
  return { columns, overdue: { red, yellow } };
}

/** 月份工具（导出/调试用） */
export function monthOf(ts: number | null): string | null {
  return ts === null ? null : shMonth(ts);
}

/** YYYY-MM-DD → [startMs, endMsExclusive) */
export function dayRangeMs(from?: string | null, to?: string | null): { fromTs: number | null; toTs: number | null } {
  const f = from ? parseShDate(from) : null;
  const t = to ? parseShDate(to) : null;
  return { fromTs: f, toTs: t === null ? null : t + DAY_MS };
}
