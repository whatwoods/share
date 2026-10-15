/**
 * nenghao 能耗服务适配器：所有 HTTP 调用 + 「原始响应 → contract 类型」的转换都集中在这里。
 *
 * 已确认的接口形状：/api/insight、/api/circuits、/api/solar（见下方注释）。
 * 其余接口（/api/overview、/api/buildings、/api/heatmap、/api/meta）的响应结构未知，
 * 因此采用「防御式解析」：依次尝试多种常见形状，字段名候选集中在 FIELD_CANDIDATES，
 * 部署时用 GET /api/energy/_raw?path=/api/overview&start=...&end=... 对照真实响应，只改本文件即可。
 *
 * 解析失败抛 EnergyParseError，由 service 层回退 mock 并标记 dataMode=mock。
 */
import type {
  BuildingCode,
  Circuit,
  EnergyHeatmap,
  EnergyInsight,
  SolarStatus,
} from '../../../shared/contract';
import { normalizeBuilding } from '../buildings';
import { config } from '../config';
import { shDate } from '../lib/time';

/* ───────────────────────── 可调参数 ───────────────────────── */

export const NENGHAO_TIMEOUT_MS = 15000;

/** 允许通过 /api/energy/_raw 透传的 nenghao 路径白名单 */
export const RAW_PATH_WHITELIST = [
  '/api/meta',
  '/api/overview',
  '/api/buildings',
  '/api/heatmap',
  '/api/insight',
  '/api/circuits',
  '/api/solar',
] as const;

/** nenghao 的时间参数格式："YYYY-MM-DD HH" */
export const fmtStart = (date: string) => `${date} 00`;
export const fmtEnd = (date: string) => `${date} 23`;

/**
 * 字段名候选（大小写不敏感，按顺序取第一个存在的）。
 * 部署时如发现真实字段名不在列表中，往对应数组里加即可。
 */
export const FIELD_CANDIDATES = {
  /** 外层包装：{ data: ... } / { result: ... } */
  wrapper: ['data', 'result', 'payload', 'body'],
  /** 时间序列容器 */
  seriesContainer: ['daily', 'dailyTrend', 'daily_trend', 'trend', 'days', 'series', 'dayList', 'list', 'items', 'records', 'rows'],
  /** 序列元素中的日期键 */
  date: ['date', 'day', 'dt', 'time', 'ts', 'datetime', 'x', 'label', 'name', '日期'],
  /** 序列元素中的数值键 */
  value: ['kwh', 'value', 'total', 'energy', 'y', 'sum', 'consumption', 'val', 'electricity', 'amount', '用电量', '电量'],
  /** 平行数组：日期数组 */
  dateArray: ['dates', 'days', 'x', 'xAxis', 'xaxis', 'labels', 'categories', 'times'],
  /** 平行数组：数值数组 */
  valueArray: ['values', 'kwh', 'y', 'data', 'series', 'totals', 'yAxis'],
  /** 区间总电量 */
  total: ['total', 'totalKwh', 'total_kwh', 'rangeKwh', 'range_kwh', 'sum', 'totalEnergy', 'total_energy', 'kwh', 'energy', '总电量', '总用电量'],
  /** 实时负荷（kW） */
  realtime: ['realtimeLoadKw', 'realtime_load_kw', 'realtimeLoad', 'realtime_load', 'currentLoad', 'current_load', 'loadKw', 'load_kw', 'load', 'currentPower', 'current_power', 'power', '实时负荷'],
  /** 分项容器 */
  category: ['byCategory', 'by_category', 'categories', 'category', 'byType', 'by_type', 'types', 'typeStats', '分项'],
  /** 楼栋容器 */
  buildings: ['summary', 'buildings', 'byBuilding', 'by_building', 'building', 'items', 'list', 'rows'],
  /** 名称键（楼栋/分项） */
  name: ['name', 'building', 'area', 'type', 'category', 'label', 'key', 'title', '楼栋', '分项'],
  /** 热力图 */
  heatDays: ['days', 'dates', 'x', 'xAxis', 'yAxis', 'labels'],
  heatHours: ['hours', 'hour', 'h'],
  heatValues: ['values', 'data', 'matrix', 'heatmap', 'cells', 'grid', 'series'],
  heatHourKey: ['hour', 'h', 'hr'],
  peak: ['peakHours', 'peak_hours', 'peak', 'peaks'],
  valley: ['valleyHours', 'valley_hours', 'valley', 'valleys'],
  /** 回路 */
  circuitList: ['circuits', 'items', 'list', 'nodes', 'rows'],
  circuitId: ['node_id', 'nodeId', 'id'],
  circuitKwh: ['kwh', 'value', 'energy', 'total', 'consumption'],
  /** 光伏 */
  solarToday: ['todayYield', 'today_yield', 'dailyYield', 'daily_yield', 'today'],
  solarPower: ['currentPower', 'current_power', 'power', 'realtimePower'],
  solarTotal: ['totalYield', 'total_yield', 'cumulativeYield', 'total'],
} as const;

/* ───────────────────────── HTTP ───────────────────────── */

export class EnergyParseError extends Error {
  constructor(what: string) {
    super(`无法解析 nenghao 响应：${what}`);
    this.name = 'EnergyParseError';
  }
}

export type QueryParams = Record<string, string | number | undefined>;

/** 拼接 URL；空格编码为 %20（而非 +），兼容不把 + 解码为空格的后端 */
function buildUrl(pathOrUrl: string, query: QueryParams = {}): string {
  const base = /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : config.energy.base + pathOrUrl;
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  if (!qs) return base;
  return `${base}${base.includes('?') ? '&' : '?'}${qs}`;
}

export async function nenghaoGet(pathOrUrl: string, query: QueryParams = {}): Promise<unknown> {
  const url = buildUrl(pathOrUrl, query);
  const res = await fetch(url, { signal: AbortSignal.timeout(NENGHAO_TIMEOUT_MS), headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`nenghao ${res.status} ${url}`);
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new EnergyParseError(`非 JSON（${url}）`);
  }
}

/** 原样透传（_raw 调试接口用） */
export async function nenghaoRaw(path: string, query: QueryParams): Promise<{ status: number; contentType: string; body: string; url: string }> {
  const url = path === '/api/solar' ? buildUrl(config.energy.solarUrl, query) : buildUrl(path, query);
  const res = await fetch(url, { signal: AbortSignal.timeout(NENGHAO_TIMEOUT_MS * 2) });
  return {
    status: res.status,
    contentType: res.headers.get('content-type') ?? 'application/json; charset=utf-8',
    body: await res.text(),
    url,
  };
}

/* ───────────────────────── 通用解析工具 ───────────────────────── */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 大小写不敏感取键 */
export function pick(o: unknown, keys: readonly string[]): unknown {
  if (!isObj(o)) return undefined;
  for (const k of keys) if (k in o) return o[k];
  const lower = new Map(Object.keys(o).map((k) => [k.toLowerCase(), k]));
  for (const k of keys) {
    const real = lower.get(k.toLowerCase());
    if (real !== undefined) return o[real];
  }
  return undefined;
}

/** 数字或带单位/千分位的字符串 → number */
export function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const m = /-?\d+(?:\.\d+)?/.exec(v.replace(/,/g, ''));
    return m ? Number(m[0]) : null;
  }
  if (isObj(v)) return num(pick(v, FIELD_CANDIDATES.value));
  return null;
}

/** 各种日期写法 → YYYY-MM-DD；失败返回 null */
export function normDate(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v > 1e11) return shDate(v);
    if (v > 1e9) return shDate(v * 1000);
    if (v >= 19000101 && v <= 21001231) return normDate(String(v));
    return null;
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/** 依次尝试 x、x.data、x.result … 直到 fn 返回非 null */
export function tryUnwrapped<T>(x: unknown, fn: (v: unknown) => T | null, depth = 3): T | null {
  const direct = fn(x);
  if (direct !== null) return direct;
  if (depth <= 0 || !isObj(x)) return null;
  for (const k of FIELD_CANDIDATES.wrapper) {
    const inner = pick(x, [k]);
    if (inner !== undefined && inner !== x) {
      const r = tryUnwrapped(inner, fn, depth - 1);
      if (r !== null) return r;
    }
  }
  return null;
}

export type Series = { date: string; kwh: number }[];

function seriesFromArray(arr: unknown[]): Series | null {
  if (!arr.length) return null;
  const out: Series = [];
  for (const el of arr) {
    let d: string | null = null;
    let v: number | null = null;
    if (Array.isArray(el) && el.length >= 2) {
      d = normDate(el[0]);
      v = num(el[1]);
    } else if (isObj(el)) {
      d = normDate(pick(el, FIELD_CANDIDATES.date));
      v = num(pick(el, FIELD_CANDIDATES.value));
    }
    if (d === null || v === null) return null;
    out.push({ date: d, kwh: v });
  }
  return out;
}

function seriesFromParallel(o: Obj): Series | null {
  let dates = pick(o, FIELD_CANDIDATES.dateArray);
  let values = pick(o, FIELD_CANDIDATES.valueArray);
  if (isObj(dates)) dates = pick(dates, ['data', 'values']); // ECharts xAxis: { data: [...] }
  if (Array.isArray(values) && values.length && isObj(values[0]) && Array.isArray(pick(values[0], ['data']))) {
    values = pick(values[0], ['data']); // ECharts series: [{ data: [...] }]
  }
  if (!Array.isArray(dates) || !Array.isArray(values) || dates.length !== values.length || !dates.length) return null;
  const out: Series = [];
  for (let i = 0; i < dates.length; i++) {
    const d = normDate(dates[i]);
    const v = num(values[i]);
    if (d === null || v === null) return null;
    out.push({ date: d, kwh: v });
  }
  return out;
}

function seriesFromDict(o: Obj): Series | null {
  const keys = Object.keys(o);
  if (!keys.length || !keys.every((k) => normDate(k) !== null)) return null;
  const out: Series = [];
  for (const k of keys) {
    const v = num(o[k]);
    if (v === null) return null;
    out.push({ date: normDate(k)!, kwh: v });
  }
  return out;
}

/** 解析「日期 → 电量」序列：[{date,kwh}] / [{day,value}] / [[d,v]] / {dates,values} / {"2026-09-01":123} / 包一层 */
export function parseSeries(x: unknown): Series | null {
  const one = (v: unknown): Series | null => {
    if (Array.isArray(v)) return seriesFromArray(v);
    if (!isObj(v)) return null;
    const inner = pick(v, FIELD_CANDIDATES.seriesContainer);
    if (inner !== undefined) {
      const r = Array.isArray(inner) ? seriesFromArray(inner) : isObj(inner) ? seriesFromParallel(inner) ?? seriesFromDict(inner) : null;
      if (r) return r;
    }
    return seriesFromParallel(v) ?? seriesFromDict(v);
  };
  const s = tryUnwrapped(x, one);
  if (!s) return null;
  // 同日多条（如按小时）合并
  const m = new Map<string, number>();
  for (const p of s) m.set(p.date, (m.get(p.date) ?? 0) + p.kwh);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, kwh]) => ({ date, kwh }));
}

/** 解析「名称 → 数值」：{ "1号楼": 123 } / [{name, kwh}] / {names:[], values:[]} / 包一层 */
export function parseNamedValues(x: unknown, container: readonly string[] = []): { name: string; value: number }[] | null {
  const one = (v: unknown): { name: string; value: number }[] | null => {
    if (Array.isArray(v)) {
      if (!v.length) return null;
      const out: { name: string; value: number }[] = [];
      for (const el of v) {
        if (Array.isArray(el) && el.length >= 2 && typeof el[0] === 'string') {
          const n = num(el[1]);
          if (n === null) return null;
          out.push({ name: el[0], value: n });
        } else if (isObj(el)) {
          const name = pick(el, FIELD_CANDIDATES.name);
          const value = num(pick(el, FIELD_CANDIDATES.value));
          if (typeof name !== 'string' || value === null) return null;
          out.push({ name, value });
        } else return null;
      }
      return out;
    }
    if (!isObj(v)) return null;
    for (const c of container) {
      const inner = pick(v, [c]);
      if (inner !== undefined && inner !== v) {
        const r = one(inner);
        if (r) return r;
      }
    }
    const names = pick(v, ['names', 'labels', 'categories', 'keys', 'x', 'xAxis']);
    const values = pick(v, ['values', 'data', 'y', 'kwh']);
    if (Array.isArray(names) && Array.isArray(values) && names.length === values.length && names.length) {
      const out = names.map((n, i) => ({ name: String(n), value: num(values[i]) }));
      return out.every((o) => o.value !== null) ? (out as { name: string; value: number }[]) : null;
    }
    const entries = Object.entries(v);
    if (!entries.length) return null;
    const out: { name: string; value: number }[] = [];
    for (const [k, val] of entries) {
      const n = num(val);
      if (n === null) return null;
      out.push({ name: k, value: n });
    }
    return out;
  };
  return tryUnwrapped(x, one);
}

/* ───────────────────────── 各接口解析 ───────────────────────── */

export interface ParsedOverview {
  total: number | null;
  daily: Series;
  realtimeLoadKw: number | null;
  byCategory: { type: string; kwh: number }[];
}

/** GET /api/overview?start=YYYY-MM-DD HH&end=YYYY-MM-DD HH */
export function parseOverview(raw: unknown): ParsedOverview {
  const daily = parseSeries(raw) ?? [];
  const scalar = (keys: readonly string[]) =>
    tryUnwrapped(raw, (v) => {
      const x = pick(v, keys);
      return typeof x === 'number' || typeof x === 'string' ? num(x) : null;
    });
  const total = scalar(FIELD_CANDIDATES.total);
  const realtimeLoadKw = scalar(FIELD_CANDIDATES.realtime);
  const catRaw = tryUnwrapped(raw, (v) => {
    const c = pick(v, FIELD_CANDIDATES.category);
    return c === undefined ? null : c;
  });
  const byCategory = (catRaw !== null ? parseNamedValues(catRaw) ?? [] : []).map((c) => ({ type: c.name, kwh: c.value }));
  if (!daily.length && total === null) throw new EnergyParseError('/api/overview 中既无日序列也无总电量');
  return { total, daily, realtimeLoadKw, byCategory };
}

/** GET /api/buildings?start&end → 楼栋码 → kWh（同码累加；无法识别的名称忽略） */
export function parseBuildings(raw: unknown): Partial<Record<BuildingCode, number>> {
  const list = parseNamedValues(raw, FIELD_CANDIDATES.buildings);
  if (!list) throw new EnergyParseError('/api/buildings');
  const out: Partial<Record<BuildingCode, number>> = {};
  let recognized = 0;
  for (const { name, value } of list) {
    const code = normalizeBuilding(name);
    if (code === 'UNKNOWN') continue;
    recognized++;
    out[code] = (out[code] ?? 0) + value;
  }
  if (!recognized) throw new EnergyParseError('/api/buildings 中未识别出任何楼栋');
  return out;
}

/** GET /api/heatmap → EnergyHeatmap；fallbackDays 用于响应中没有日期轴的情况 */
export function parseHeatmap(raw: unknown, fallbackDays: string[]): EnergyHeatmap {
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const hoursList = (v: unknown) =>
    Array.isArray(v) ? v.map((h) => num(h)).filter((h): h is number => h !== null && h >= 0 && h < 24) : undefined;

  const one = (v: unknown): EnergyHeatmap | null => {
    const peakHours = hoursList(pick(v, FIELD_CANDIDATES.peak));
    const valleyHours = hoursList(pick(v, FIELD_CANDIDATES.valley));
    const extra = { ...(peakHours ? { peakHours } : {}), ...(valleyHours ? { valleyHours } : {}) };

    // 形状 A：[{date, hour, kwh}]
    const arr = Array.isArray(v) ? v : pick(v, FIELD_CANDIDATES.heatValues);
    if (Array.isArray(arr) && arr.length && isObj(arr[0]) && pick(arr[0], FIELD_CANDIDATES.heatHourKey) !== undefined) {
      const days = new Set<string>();
      const cells: { d: string; h: number; v: number }[] = [];
      for (const el of arr) {
        const d = normDate(pick(el, FIELD_CANDIDATES.date)) ?? fallbackDays[fallbackDays.length - 1]!;
        const h = num(pick(el, FIELD_CANDIDATES.heatHourKey));
        const val = num(pick(el, FIELD_CANDIDATES.value));
        if (h === null || val === null) return null;
        days.add(d);
        cells.push({ d, h, v: val });
      }
      const dayList = [...days].sort();
      return { days: dayList, hours, values: cells.map((c) => [dayList.indexOf(c.d), c.h, c.v]), ...extra };
    }
    if (!isObj(v) && !Array.isArray(v)) return null;

    const daysRaw = isObj(v) ? pick(v, FIELD_CANDIDATES.heatDays) : undefined;
    const dayAxis = Array.isArray(daysRaw) ? daysRaw.map((d) => normDate(d)) : null;
    const vals = Array.isArray(v) ? v : pick(v, FIELD_CANDIDATES.heatValues);
    if (!Array.isArray(vals) || !vals.length) {
      // 形状 D：{ "2026-09-01": [24 个数] }
      if (isObj(v)) {
        const entries = Object.entries(v).filter(([k]) => normDate(k) !== null);
        if (entries.length && entries.every(([, a]) => Array.isArray(a) && a.length === 24)) {
          const dayList = entries.map(([k]) => normDate(k)!).sort();
          const values: EnergyHeatmap['values'] = [];
          for (const [k, a] of entries) {
            const di = dayList.indexOf(normDate(k)!);
            (a as unknown[]).forEach((x, h) => values.push([di, h, num(x) ?? 0]));
          }
          return { days: dayList, hours, values, ...extra };
        }
      }
      return null;
    }
    // 形状 B：三元组 [[dayIndex, hour, value]]（ECharts 热力图标准格式）
    if (Array.isArray(vals[0]) && (vals[0] as unknown[]).length === 3 && !Array.isArray((vals[0] as unknown[])[0])) {
      const triples = vals as unknown[][];
      const firstIsDate = normDate(triples[0]![0]) !== null && typeof triples[0]![0] === 'string';
      const days = dayAxis && dayAxis.every(Boolean) ? (dayAxis as string[]) : firstIsDate ? [...new Set(triples.map((t) => normDate(t[0])!))].sort() : null;
      const out: EnergyHeatmap['values'] = [];
      let maxDi = 0;
      for (const t of triples) {
        // 兼容 [hour, dayIndex, v] 与 [dayIndex, hour, v]：若第一个值 > 天数而第二个 < 天数，视为交换
        let di = firstIsDate ? days!.indexOf(normDate(t[0])!) : num(t[0]);
        let h = num(t[1]);
        const val = num(t[2]);
        if (di === null || h === null || val === null) return null;
        if (days && di >= days.length && h < days.length) [di, h] = [h, di];
        maxDi = Math.max(maxDi, di);
        out.push([di, h, val]);
      }
      const dayList = days ?? fallbackDays.slice(-(maxDi + 1));
      return { days: dayList, hours, values: out, ...extra };
    }
    // 形状 C：矩阵 values[day][hour]
    if (Array.isArray(vals[0])) {
      const rows = vals as unknown[][];
      if (!rows.every((r) => Array.isArray(r) && r.length === 24)) return null;
      const dayList = dayAxis && dayAxis.length === rows.length && dayAxis.every(Boolean) ? (dayAxis as string[]) : fallbackDays.slice(-rows.length);
      const values: EnergyHeatmap['values'] = [];
      rows.forEach((r, di) => r.forEach((x, h) => values.push([di, h, num(x) ?? 0])));
      return { days: dayList, hours, values, ...extra };
    }
    // 形状 E：仅 24 个数（典型日曲线）
    if (vals.length === 24 && vals.every((x) => num(x) !== null)) {
      const day = fallbackDays[fallbackDays.length - 1]!;
      return { days: [day], hours, values: vals.map((x, h) => [0, h, num(x)!] as [number, number, number]), ...extra };
    }
    return null;
  };
  const r = tryUnwrapped(raw, one);
  if (!r) throw new EnergyParseError('/api/heatmap');
  return r;
}

/**
 * GET /api/insight（已确认形状）：
 * {"date":"2026-09-03","summary":"昨日总耗<b>41,737 kWh</b>…","points":["…"],"anomaly":"low"}
 */
export function parseInsight(raw: unknown): EnergyInsight {
  const r = tryUnwrapped(raw, (v) => (isObj(v) && typeof pick(v, ['summary']) === 'string' ? v : null));
  if (!r) throw new EnergyParseError('/api/insight');
  const points = pick(r, ['points', 'items', 'details']);
  return {
    date: normDate(pick(r, ['date', 'day'])) ?? '',
    summary: String(pick(r, ['summary'])),
    points: Array.isArray(points) ? points.map((p) => String(p)) : [],
    anomaly: typeof pick(r, ['anomaly', 'level']) === 'string' ? String(pick(r, ['anomaly', 'level'])) : 'normal',
  };
}

/**
 * GET /api/circuits（已确认形状，476 个）：
 * [{"node_id":"35","name":"2#A17-1_1#空调","substation":"2#变电所","area":"2号楼屋顶空调","type":"空调暖通/冷热源","include":1}]
 */
export function parseCircuits(raw: unknown): Circuit[] {
  const list = tryUnwrapped(raw, (v) => {
    if (Array.isArray(v)) return v;
    const inner = pick(v, FIELD_CANDIDATES.circuitList);
    return Array.isArray(inner) ? inner : null;
  });
  if (!list || !list.length) throw new EnergyParseError('/api/circuits');
  return list.filter(isObj).map((c) => {
    const name = String(pick(c, ['name']) ?? '');
    const area = String(pick(c, ['area']) ?? '');
    let building = normalizeBuilding(area);
    if (building === 'UNKNOWN' && /号楼|栋/.test(name)) building = normalizeBuilding(name);
    const inc = pick(c, ['include', 'included', 'is_include']);
    const kwhRaw = pick(c, FIELD_CANDIDATES.circuitKwh);
    return {
      nodeId: String(pick(c, FIELD_CANDIDATES.circuitId) ?? ''),
      name,
      substation: String(pick(c, ['substation', 'station']) ?? ''),
      area,
      type: String(pick(c, ['type', 'category']) ?? ''),
      include: inc === true || inc === 1 || inc === '1' || inc === 'true',
      building,
      kwh: kwhRaw === undefined ? null : num(kwhRaw),
    };
  });
}

/** "1230 kWh" / "45.2 MWh" / "185 kW" / 数字 → { value, unit } */
export function parseQuantity(v: unknown): { value: number; unit: string } | null {
  if (typeof v === 'number') return Number.isFinite(v) ? { value: v, unit: '' } : null;
  if (typeof v !== 'string') return null;
  const m = /(-?\d+(?:\.\d+)?)\s*([a-zA-Z]*)/.exec(v.replace(/,/g, ''));
  return m ? { value: Number(m[1]), unit: m[2]!.toLowerCase() } : null;
}

const ENERGY_TO_KWH: Record<string, number> = { wh: 1e-3, kwh: 1, mwh: 1e3, gwh: 1e6, '': 1 };
const POWER_TO_KW: Record<string, number> = { w: 1e-3, kw: 1, mw: 1e3, '': 1 };

/** 能量 → 指定单位（默认单位 defUnit 用于无单位数值） */
function energyIn(q: { value: number; unit: string } | null, target: 'kwh' | 'mwh', defUnit: string): number | null {
  if (!q) return null;
  const f = ENERGY_TO_KWH[q.unit || defUnit];
  if (f === undefined) return null;
  const kwh = q.value * f;
  return Math.round((target === 'kwh' ? kwh : kwh / 1000) * 1000) / 1000;
}

/** GET /api/solar（已确认形状）：{ todayYield: "1230 kWh", currentPower: "185 kW", totalYield: "45.2 MWh" } */
export function parseSolar(raw: unknown): SolarStatus {
  const r = tryUnwrapped(raw, (v) =>
    isObj(v) && (pick(v, FIELD_CANDIDATES.solarToday) !== undefined || pick(v, FIELD_CANDIDATES.solarPower) !== undefined) ? v : null,
  );
  if (!r) throw new EnergyParseError('/api/solar');
  const today = pick(r, FIELD_CANDIDATES.solarToday);
  const power = pick(r, FIELD_CANDIDATES.solarPower);
  const total = pick(r, FIELD_CANDIDATES.solarTotal);
  const pq = parseQuantity(power);
  const pf = pq ? POWER_TO_KW[pq.unit || 'kw'] : undefined;
  const str = (v: unknown) => (v === undefined || v === null ? undefined : String(v));
  return {
    todayYieldKwh: energyIn(parseQuantity(today), 'kwh', 'kwh'),
    currentPowerKw: pq && pf !== undefined ? Math.round(pq.value * pf * 1000) / 1000 : null,
    totalYieldMwh: energyIn(parseQuantity(total), 'mwh', 'mwh'),
    raw: { todayYield: str(today), currentPower: str(power), totalYield: str(total) },
  };
}

/* ───────────────────────── 调用封装 ───────────────────────── */

export const nenghao = {
  meta: () => nenghaoGet('/api/meta'),
  overview: async (start: string, end: string) =>
    parseOverview(await nenghaoGet('/api/overview', { start: fmtStart(start), end: fmtEnd(end) })),
  buildings: async (start: string, end: string) =>
    parseBuildings(await nenghaoGet('/api/buildings', { start: fmtStart(start), end: fmtEnd(end) })),
  heatmap: async (days: string[]) =>
    parseHeatmap(
      await nenghaoGet('/api/heatmap', { start: fmtStart(days[0]!), end: fmtEnd(days[days.length - 1]!) }),
      days,
    ),
  insight: async () => parseInsight(await nenghaoGet('/api/insight')),
  circuits: async () => parseCircuits(await nenghaoGet('/api/circuits')),
  solar: async () => parseSolar(await nenghaoGet(config.energy.solarUrl)),
};
