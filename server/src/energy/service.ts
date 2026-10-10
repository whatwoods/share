/**
 * 能耗服务：缓存 + 实时/模拟切换 + 回退。路由层只调用这里。
 *  - DATA_MODE=mock：直接 mock
 *  - 否则调用 nenghao（3s 超时）；失败或解析不出 → 回退 mock，并记录该接口为 mock
 *  - 缓存：一般接口 60s，circuits/meta 及楼栋逐日数据 10 分钟；失败后 30s 内直接走 mock（避免反复等待超时）
 */
import type {
  BuildingCode,
  Circuit,
  DataMode,
  EnergyBuildingRow,
  EnergyHeatmap,
  EnergyInsight,
  EnergyOverview,
  SolarStatus,
} from '../../../shared/contract';
import { config } from '../config';
import { addDays, dateRange, shDate } from '../lib/time';
import { nenghao, type ParsedOverview } from './adapter';
import * as mock from './mock';

export interface Moded<T> {
  data: T;
  mode: DataMode;
}

const TTL_SHORT = 60_000;
const TTL_LONG = 10 * 60_000;
const FAIL_BACKOFF = 30_000;

/* ───────────── 缓存（含 in-flight 去重） ───────────── */

const cache = new Map<string, { exp: number; value: Promise<unknown> }>();
const failUntil = new Map<string, number>();

function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.exp > now) return hit.value as Promise<T>;
  const p = fn();
  cache.set(key, { exp: now + ttl, value: p });
  p.catch(() => cache.delete(key));
  if (cache.size > 2000) {
    for (const [k, v] of cache) if (v.exp <= now) cache.delete(k);
  }
  return p;
}

/* ───────────── 模式跟踪 ───────────── */

const outcomes = new Map<string, { ok: boolean; at: number; error?: string }>();
let logger: { warn(msg: string): void } = { warn: (m) => console.warn(m) };
export function setEnergyLogger(l: { warn(msg: string): void }) {
  logger = l;
}

function record(endpoint: string, ok: boolean, error?: string) {
  const prev = outcomes.get(endpoint);
  if (!ok && (!prev || prev.ok)) logger.warn(`[energy] ${endpoint} 回退 mock：${error}`);
  outcomes.set(endpoint, { ok, at: Date.now(), error });
}

const forcedMock = () => config.dataMode === 'mock';

async function withFallback<T>(endpoint: string, key: string, ttl: number, live: () => Promise<T>, fallback: () => T): Promise<Moded<T>> {
  if (forcedMock()) return { data: fallback(), mode: 'mock' };
  if ((failUntil.get(key) ?? 0) > Date.now()) return { data: fallback(), mode: 'mock' };
  try {
    const data = await cached(key, ttl, live);
    record(endpoint, true);
    return { data, mode: 'live' };
  } catch (err) {
    failUntil.set(key, Date.now() + FAIL_BACKOFF);
    record(endpoint, false, (err as Error).message);
    return { data: fallback(), mode: 'mock' };
  }
}

/** 能耗整体数据模式：任一接口最近 10 分钟内回退过 → mock；无记录时探测 /api/meta */
export async function energyMode(): Promise<DataMode> {
  if (forcedMock()) return 'mock';
  const recent = [...outcomes.values()].filter((o) => Date.now() - o.at < TTL_LONG);
  if (recent.some((o) => !o.ok)) return 'mock';
  if (recent.length) return 'live';
  const r = await withFallback('meta', 'meta', TTL_LONG, () => nenghao.meta(), () => null);
  return r.mode;
}

export function energyOutcomes() {
  return Object.fromEntries(outcomes);
}

/* ───────────── 日期工具 ───────────── */

/** 默认「近 N 天」：截至昨天的 N 个完整自然日 */
export function lastNDays(n: number, now = Date.now()): string[] {
  const end = addDays(shDate(now), -1);
  return dateRange(addDays(end, -(n - 1)), end);
}

/* ───────────── 接口 ───────────── */

export async function getOverview(start: string, end: string): Promise<Moded<EnergyOverview>> {
  const now = Date.now();
  const today = shDate(now);
  const yesterday = addDays(today, -1);
  return withFallback(
    'overview',
    `overview:${start}:${end}`,
    TTL_SHORT,
    async () => {
      const ovRaw = (s: string, e: string) => cached(`ov-raw:${s}:${e}`, TTL_SHORT, () => nenghao.overview(s, e));
      const totalOf = (o: ParsedOverview) => o.total ?? o.daily.reduce((a, b) => a + b.kwh, 0);
      const main = await ovRaw(start, end);
      const dayVal = (d: string) => main.daily.find((p) => p.date === d)?.kwh;
      // 区间不含今天/昨天或缺实时负荷时，补充调用（失败只置 null，不影响主数据）
      const todayP =
        dayVal(today) === undefined || main.realtimeLoadKw === null ? ovRaw(today, today).catch(() => null) : Promise.resolve(null);
      const yVal = dayVal(yesterday);
      const yP = yVal !== undefined ? Promise.resolve(yVal) : ovRaw(yesterday, yesterday).then(totalOf, () => null);
      const mP = ovRaw(`${today.slice(0, 7)}-01`, today).then(totalOf, () => null);
      const [todayOv, yesterdayKwh, monthKwh] = await Promise.all([todayP, yP, mP]);
      return {
        start,
        end,
        todayKwh: dayVal(today) ?? (todayOv ? totalOf(todayOv) : null),
        yesterdayKwh,
        realtimeLoadKw: main.realtimeLoadKw ?? todayOv?.realtimeLoadKw ?? null,
        monthKwh,
        rangeKwh: totalOf(main),
        daily: main.daily.filter((p) => p.date >= start && p.date <= end),
        byCategory: main.byCategory,
      };
    },
    () => mock.mockOverview(start, end, now),
  );
}

export async function getBuildingTotals(start: string, end: string): Promise<Moded<Partial<Record<BuildingCode, number>>>> {
  const now = Date.now();
  return withFallback(
    'buildings',
    `buildings:${start}:${end}`,
    start === end && end < shDate(now) ? TTL_LONG : TTL_SHORT,
    () => nenghao.buildings(start, end),
    () => mock.mockBuildingTotals(start, end, now) as Partial<Record<BuildingCode, number>>,
  );
}

export async function getBuildings(start: string, end: string): Promise<Moded<{ start: string; end: string; items: EnergyBuildingRow[] }>> {
  const r = await getBuildingTotals(start, end);
  return { mode: r.mode, data: { start, end, items: mock.toBuildingRows(r.data) } };
}

/** 各楼栋逐日电量矩阵：date → code → kWh（nenghao 无逐日楼栋接口时，逐日调用 /api/buildings，并发 6） */
export async function getBuildingDaily(days: string[]): Promise<Moded<Record<string, Partial<Record<BuildingCode, number>>>>> {
  if (forcedMock()) return { data: mock.mockBuildingDaily(days), mode: 'mock' };
  const results: Record<string, Partial<Record<BuildingCode, number>>> = {};
  let failed = false;
  const queue = [...days];
  const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
    while (queue.length && !failed) {
      const d = queue.shift()!;
      const key = `buildings-day:${d}`;
      if ((failUntil.get(key) ?? 0) > Date.now()) {
        failed = true;
        break;
      }
      try {
        results[d] = await cached(key, TTL_LONG, () => nenghao.buildings(d, d));
      } catch (err) {
        failUntil.set(key, Date.now() + FAIL_BACKOFF);
        record('buildings-daily', false, (err as Error).message);
        failed = true;
      }
    }
  });
  await Promise.all(workers);
  if (failed) return { data: mock.mockBuildingDaily(days), mode: 'mock' };
  record('buildings-daily', true);
  return { data: results, mode: 'live' };
}

export async function getBuildingTrend(code: BuildingCode, n: number): Promise<Moded<{ code: BuildingCode; items: { date: string; kwh: number }[] }>> {
  const days = lastNDays(n);
  const r = await getBuildingDaily(days);
  return { mode: r.mode, data: { code, items: days.map((date) => ({ date, kwh: Math.round(r.data[date]?.[code] ?? 0) })) } };
}

export async function getHeatmap(n: number): Promise<Moded<EnergyHeatmap>> {
  const days = lastNDays(n);
  return withFallback('heatmap', `heatmap:${n}:${days[0]}`, TTL_SHORT, () => nenghao.heatmap(days), () => mock.mockHeatmap(days));
}

export async function getInsight(): Promise<Moded<EnergyInsight>> {
  const now = Date.now();
  return withFallback(
    'insight',
    'insight',
    TTL_SHORT,
    async () => {
      const r = await nenghao.insight();
      return { ...r, date: r.date || addDays(shDate(now), -1) };
    },
    () => mock.mockInsight(now),
  );
}

export async function getCircuits(): Promise<Moded<{ items: Circuit[]; categories: { type: string; count: number; kwh: number | null }[] }>> {
  const now = Date.now();
  const r = await withFallback('circuits', 'circuits', TTL_LONG, () => nenghao.circuits(), () => mock.mockCircuits(now));
  const cats = new Map<string, { count: number; kwh: number | null }>();
  for (const c of r.data) {
    const t = c.type || '未分类';
    const e = cats.get(t) ?? { count: 0, kwh: null };
    e.count++;
    if (c.kwh !== null && c.include) e.kwh = (e.kwh ?? 0) + c.kwh;
    cats.set(t, e);
  }
  return {
    mode: r.mode,
    data: {
      items: r.data,
      categories: [...cats.entries()].sort((a, b) => b[1].count - a[1].count).map(([type, v]) => ({ type, ...v })),
    },
  };
}

export async function getSolar(): Promise<Moded<SolarStatus>> {
  const now = Date.now();
  return withFallback('solar', 'solar', TTL_SHORT, () => nenghao.solar(), () => mock.mockSolar(now));
}

