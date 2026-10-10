/**
 * 能耗模拟数据（nenghao 不可达或 DATA_MODE=mock 时使用）。
 * 全部由「日期种子」决定：同一天多次调用结果一致（今日累计/实时负荷随当前小时变化）。
 *
 * 模型：
 *  - 日总耗 = 基础负荷（工作日高、周末低）+ 空调负荷（随气温偏离 20°C 增长）± 3% 噪声 → 约 35,000~48,000 kWh
 *  - 楼栋占比：1~11 号楼办公大头，12~19 号楼公寓较小，公区/设备用房可观
 *  - 24h 曲线：8~18 点白天峰，夜间谷
 */
import type {
  BuildingCode,
  Circuit,
  EnergyBuildingRow,
  EnergyHeatmap,
  EnergyInsight,
  EnergyOverview,
  SolarStatus,
} from '../../../shared/contract';
import { BUILDING_CODES, buildingInfo } from '../buildings';
import { Rng } from '../lib/rng';
import { DAY_MS, addDays, dateRange, dayOfYear, parseShDate, shDate, shParts, weekdayOf } from '../lib/time';

export const ENERGY_CATEGORIES = ['空调暖通/冷热源', '照明插座', '动力', '专项用电', '特殊负荷'] as const;
const NON_AC_SPLIT: Record<string, number> = { 照明插座: 0.38, 动力: 0.25, 专项用电: 0.22, 特殊负荷: 0.15 };

/** 峰谷时段（上海一般工商业分时电价近似） */
export const PEAK_HOURS = [8, 9, 10, 11, 12, 13, 14, 18, 19, 20];
export const VALLEY_HOURS = [22, 23, 0, 1, 2, 3, 4, 5];

const WEEKDAY_PROFILE = [
  0.78, 0.75, 0.74, 0.74, 0.75, 0.78, 0.85, 1.0, 1.22, 1.42, 1.48, 1.46, 1.32, 1.4, 1.48, 1.47, 1.42, 1.3, 1.12, 0.98,
  0.92, 0.88, 0.84, 0.8,
];
const WEEKEND_PROFILE = [
  0.82, 0.8, 0.79, 0.79, 0.8, 0.82, 0.86, 0.94, 1.05, 1.14, 1.18, 1.18, 1.14, 1.15, 1.17, 1.16, 1.12, 1.08, 1.02, 0.96,
  0.92, 0.9, 0.87, 0.84,
];

const BUILDING_WEIGHTS: Record<string, number> = {
  B01: 7.5, B02: 6.0, B03: 6.5, B04: 5.5, B05: 6.8, B06: 5.0, B07: 6.2, B08: 5.2, B09: 5.8, B10: 4.6, B11: 5.4,
  B12: 2.2, B13: 1.8, B14: 2.5, B15: 2.0, B16: 1.6, B17: 2.4, B18: 1.9, B19: 2.1,
  PUBLIC: 14,
};

const isWeekend = (date: string) => {
  const w = weekdayOf(date);
  return w === 0 || w === 6;
};

/** 日均气温（°C），上海气候近似：7 月下旬最高约 29°C，1 月最低约 5°C */
export function mockTemperature(date: string): number {
  const rng = new Rng(`temp:${date}`);
  const doy = dayOfYear(date);
  const base = 17 + 11.8 * Math.sin((2 * Math.PI * (doy - 110)) / 365);
  return Math.round((base + rng.normal(0, 1.8)) * 10) / 10;
}

interface DayModel {
  total: number;
  ac: number;
  categories: Record<string, number>;
  buildings: Record<string, number>;
  hourly: number[];
  temp: number;
}

const dayCache = new Map<string, DayModel>();

export function mockDay(date: string): DayModel {
  const hit = dayCache.get(date);
  if (hit) return hit;
  const rng = new Rng(`energy:${date}`);
  const temp = mockTemperature(date);
  const weekend = isWeekend(date);
  const baseLoad = (weekend ? 26500 : 32500) * (1 + rng.normal(0, 0.025));
  const acFactor = 0.3 + 0.062 * Math.max(0, temp - 20) + 0.05 * Math.max(0, 14 - temp);
  const ac = 14000 * acFactor * (weekend ? 0.82 : 1) * (1 + rng.normal(0, 0.04));
  const total = Math.round(baseLoad + ac);

  const categories: Record<string, number> = { '空调暖通/冷热源': Math.round(ac) };
  for (const [k, share] of Object.entries(NON_AC_SPLIT)) categories[k] = Math.round(baseLoad * share);

  // 楼栋：权重 × 小幅噪声，归一到总量
  const raw: Record<string, number> = {};
  let sumW = 0;
  for (const code of BUILDING_CODES) {
    const w = BUILDING_WEIGHTS[code]! * (1 + rng.normal(0, 0.05)) * (weekend && code <= 'B11' ? 0.85 : 1);
    raw[code] = Math.max(0.1, w);
    sumW += raw[code]!;
  }
  const buildings: Record<string, number> = {};
  for (const code of BUILDING_CODES) buildings[code] = Math.round((total * raw[code]!) / sumW);

  // 小时：曲线 × 噪声，归一到总量
  const profile = weekend ? WEEKEND_PROFILE : WEEKDAY_PROFILE;
  const hw = profile.map((p, h) => p * (1 + rng.normal(0, 0.03)) * (h >= 12 && h <= 16 ? 1 + (temp - 22) * 0.008 : 1));
  const hs = hw.reduce((a, b) => a + b, 0);
  const hourly = hw.map((w) => Math.round((total * w) / hs));

  const model = { total, ac, categories, buildings, hourly, temp };
  if (dayCache.size > 2000) dayCache.clear();
  dayCache.set(date, model);
  return model;
}

/** 某天截至 now 的累计（非今天则全天） */
function dayKwhUntil(date: string, now: number): number {
  const today = shDate(now);
  const d = mockDay(date);
  if (date < today) return d.total;
  if (date > today) return 0;
  const p = shParts(now);
  let s = 0;
  for (let h = 0; h < p.hour; h++) s += d.hourly[h]!;
  s += (d.hourly[p.hour]! * p.minute) / 60;
  return Math.round(s);
}

function fracOfDay(date: string, now: number): number {
  const d = mockDay(date);
  return d.total ? dayKwhUntil(date, now) / d.total : 0;
}

export function mockRealtimeLoadKw(now: number): number {
  const date = shDate(now);
  const p = shParts(now);
  const d = mockDay(date);
  const cur = d.hourly[p.hour]!;
  const next = d.hourly[(p.hour + 1) % 24]!;
  const rng = new Rng(`load:${date}:${p.hour}:${Math.floor(p.minute / 5)}`);
  const kw = (cur + ((next - cur) * p.minute) / 60) * (1 + rng.normal(0, 0.015));
  return Math.round(Math.min(2800, Math.max(1200, kw)));
}

export function mockOverview(start: string, end: string, now: number): EnergyOverview {
  const today = shDate(now);
  const daily = dateRange(start, end)
    .filter((d) => d <= today)
    .map((date) => ({ date, kwh: dayKwhUntil(date, now) }));
  const cat: Record<string, number> = {};
  for (const { date } of daily) {
    const f = fracOfDay(date, now);
    for (const [k, v] of Object.entries(mockDay(date).categories)) cat[k] = (cat[k] ?? 0) + v * f;
  }
  const monthStart = `${today.slice(0, 7)}-01`;
  return {
    start,
    end,
    todayKwh: dayKwhUntil(today, now),
    yesterdayKwh: mockDay(addDays(today, -1)).total,
    realtimeLoadKw: mockRealtimeLoadKw(now),
    monthKwh: dateRange(monthStart, today).reduce((s, d) => s + dayKwhUntil(d, now), 0),
    rangeKwh: daily.reduce((s, d) => s + d.kwh, 0),
    daily,
    byCategory: ENERGY_CATEGORIES.map((type) => ({ type, kwh: Math.round(cat[type] ?? 0) })),
  };
}

/** 各楼栋区间电量（码 → kWh） */
export function mockBuildingTotals(start: string, end: string, now: number): Record<string, number> {
  const today = shDate(now);
  const out: Record<string, number> = {};
  for (const date of dateRange(start, end)) {
    if (date > today) break;
    const f = fracOfDay(date, now);
    for (const [code, v] of Object.entries(mockDay(date).buildings)) out[code] = (out[code] ?? 0) + v * f;
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k]!);
  return out;
}

export function toBuildingRows(totals: Partial<Record<string, number>>): EnergyBuildingRow[] {
  const sum = BUILDING_CODES.reduce((s, c) => s + (totals[c] ?? 0), 0);
  return BUILDING_CODES.map((code) => {
    const kwh = Math.round(totals[code] ?? 0);
    return { building: code, name: buildingInfo(code).name, kwh, share: sum > 0 ? kwh / sum : 0 };
  });
}

export function mockBuildingDaily(dates: string[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const d of dates) out[d] = { ...mockDay(d).buildings };
  return out;
}

export function mockHeatmap(days: string[]): EnergyHeatmap {
  const values: EnergyHeatmap['values'] = [];
  days.forEach((d, i) => mockDay(d).hourly.forEach((kwh, h) => values.push([i, h, kwh])));
  return {
    days,
    hours: Array.from({ length: 24 }, (_, h) => h),
    values,
    peakHours: PEAK_HOURS,
    valleyHours: VALLEY_HOURS,
  };
}

/* ───────────── 回路（476 个） ───────────── */

interface MockCircuitDef {
  nodeId: string;
  name: string;
  substation: string;
  area: string;
  type: string;
  include: boolean;
  building: BuildingCode;
  weight: number;
}

const CIRCUIT_LABELS: Record<string, string[]> = {
  '空调暖通/冷热源': ['空调', '冷水机组', '新风机组', '冷却塔', '热泵', '风机盘管'],
  照明插座: ['照明', '插座', '公共照明', '应急照明', '办公照明'],
  动力: ['电梯', '水泵', '排风机', '生活水泵', '扶梯'],
  专项用电: ['厨房专用', '数据机房', '充电桩', '弱电机房', '展厅'],
  特殊负荷: ['UPS', '夜景照明', '消防设备', '安防监控'],
};
const CIRCUIT_TYPE_WEIGHTS: [string, number][] = [
  ['空调暖通/冷热源', 30],
  ['照明插座', 30],
  ['动力', 18],
  ['专项用电', 12],
  ['特殊负荷', 10],
];

let circuitDefs: MockCircuitDef[] | null = null;

/** 476 个确定性回路：10 个变电所 × 2 进线总柜 + 各楼栋分路 */
export function mockCircuitDefs(): MockCircuitDef[] {
  if (circuitDefs) return circuitDefs;
  const rng = new Rng('circuits-v1');
  const defs: MockCircuitDef[] = [];
  let id = 1;
  const subOf = (code: BuildingCode) => (code === 'PUBLIC' ? 1 : Math.ceil(Number(code.slice(1)) / 2));
  for (let s = 1; s <= 10; s++) {
    for (let k = 1; k <= 2; k++) {
      defs.push({
        nodeId: String(id++),
        name: `${s}#A${k}_低压进线总柜`,
        substation: `${s}#变电所`,
        area: '公区/其他',
        type: '专项用电',
        include: false,
        building: 'PUBLIC',
        weight: 0,
      });
    }
  }
  const perBuilding = (code: BuildingCode) => (code === 'PUBLIC' ? 58 : Number(code.slice(1)) <= 11 ? 26 : 14);
  for (const code of BUILDING_CODES) {
    const n = Number(code.slice(1));
    const sub = subOf(code);
    const count = perBuilding(code);
    for (let i = 0; i < count; i++) {
      const type = rng.weighted(CIRCUIT_TYPE_WEIGHTS);
      const label = rng.pick(CIRCUIT_LABELS[type]!);
      const panel = rng.int(3, 28);
      const branch = rng.int(1, 6);
      const area =
        code === 'PUBLIC'
          ? rng.pick(['公区/设备用房', '公区/其他', '公区/景观照明', '公区/地库'])
          : type === '空调暖通/冷热源'
            ? `${n}号楼屋顶空调`
            : type === '照明插座'
              ? `${n}号楼照明插座`
              : type === '动力'
                ? `${n}号楼动力`
                : `${n}号楼专项`;
      defs.push({
        nodeId: String(id++),
        name: `${sub}#A${panel}-${branch}_${rng.int(1, 4)}#${label}`,
        substation: `${sub}#变电所`,
        area,
        type,
        include: true,
        building: code,
        weight: rng.float(0.3, 1.7),
      });
    }
  }
  circuitDefs = defs;
  return defs;
}

/** 回路列表，kwh 为近 30 天电量（按 楼栋总量 × 分项占比 × 回路权重 拆分） */
export function mockCircuits(now: number): Circuit[] {
  const today = shDate(now);
  const start = addDays(today, -30);
  const end = addDays(today, -1);
  const totals = mockBuildingTotals(start, end, now);
  const ov = mockOverview(start, end, now);
  const catSum = ov.byCategory.reduce((a, b) => a + b.kwh, 0) || 1;
  const catShare = new Map(ov.byCategory.map((c) => [c.type, c.kwh / catSum]));
  const defs = mockCircuitDefs();
  const key = (d: MockCircuitDef) => `${d.building}|${d.type}`;
  const weightSum = new Map<string, number>();
  const typeShareSum = new Map<string, number>();
  for (const d of defs) {
    if (!d.include) continue;
    if (!weightSum.has(key(d))) typeShareSum.set(d.building, (typeShareSum.get(d.building) ?? 0) + (catShare.get(d.type) ?? 0));
    weightSum.set(key(d), (weightSum.get(key(d)) ?? 0) + d.weight);
  }
  return defs.map((d) => {
    let kwh: number | null = null;
    if (d.include) {
      const share = (catShare.get(d.type) ?? 0) / (typeShareSum.get(d.building) || 1);
      kwh = Math.round(((totals[d.building] ?? 0) * share * d.weight) / (weightSum.get(key(d)) || 1));
    }
    return {
      nodeId: d.nodeId,
      name: d.name,
      substation: d.substation,
      area: d.area,
      type: d.type,
      include: d.include,
      building: d.building,
      kwh,
    };
  });
}

/* ───────────── AI 诊断 ───────────── */

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const pct = (n: number) => `${Math.abs(n).toFixed(1)}%`;

export function mockInsight(now: number): EnergyInsight {
  const yesterday = addDays(shDate(now), -1);
  const y = mockDay(yesterday);
  const weekend = isWeekend(yesterday);
  const window = dateRange(addDays(yesterday, -29), yesterday);
  const peers = window.filter((d) => d !== yesterday && isWeekend(d) === weekend);
  const mean = (f: (d: DayModel) => number) => peers.reduce((s, d) => s + f(mockDay(d)), 0) / Math.max(1, peers.length);
  const totalMean = mean((d) => d.total);
  const delta = ((y.total - totalMean) / totalMean) * 100;
  const rank = window.map((d) => mockDay(d).total).sort((a, b) => b - a).indexOf(y.total) + 1;
  const acDelta = ((y.ac - mean((d) => d.ac)) / mean((d) => d.ac)) * 100;
  const label = weekend ? '周末均值' : '工作日均值';
  const dir = (n: number) => (n >= 0 ? '升' : '降');

  const bDeltas = BUILDING_CODES.map((code) => {
    const m = mean((d) => d.buildings[code]!);
    return { code, d: ((y.buildings[code]! - m) / m) * 100 };
  })
    .filter((b) => Math.sign(b.d) === Math.sign(delta) || delta === 0)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 3);
  const bName = (c: BuildingCode) => (c === 'PUBLIC' ? '公区/设备用房' : buildingInfo(c).name);

  const rng = new Rng(`insight:${yesterday}`);
  const circuits = mockCircuitDefs().filter((c) => c.include && c.type === '空调暖通/冷热源');
  const c = rng.pick(circuits);
  const inc = rng.int(300, 1500);

  const points = [
    `昨日气温<b>${y.temp.toFixed(1)}°C</b>，空调暖通/冷热源较${label}${dir(acDelta)}<b>${pct(acDelta)}</b>，${Math.abs(acDelta) > Math.abs(delta) ? '为主因' : '影响有限'}。`,
  ];
  if (bDeltas.length) {
    points.push(
      `${bDeltas.map((b) => bName(b.code)).join('、')}较均值分别${dir(delta)}${bDeltas.map((b) => `<b>${pct(b.d)}</b>`).join('、')}。`,
    );
  }
  points.push(`显著增量回路为${c.name}，+<b>${fmt(inc)} kWh</b>；${rng.chance(0.7) ? '无显著下降回路' : `显著下降回路为${rng.pick(circuits).name}`}。`);

  return {
    date: yesterday,
    summary: `昨日总耗<b>${fmt(y.total)} kWh</b>，较${label}${delta >= 0 ? '上升' : '下降'}<b>${pct(delta)}</b>，近30日排名第<b>${rank}</b>位。`,
    points,
    anomaly: delta <= -15 ? 'low' : delta >= 15 ? 'high' : 'normal',
  };
}

/* ───────────── 光伏 ───────────── */

const SOLAR_CAPACITY_KW = 320;

function solarPowerAt(date: string, hourFloat: number): number {
  if (hourFloat <= 6 || hourFloat >= 18.5) return 0;
  const cloud = 0.45 + new Rng(`solar:${date}`).next() * 0.55;
  const x = Math.sin((Math.PI * (hourFloat - 6)) / 12.5);
  return SOLAR_CAPACITY_KW * Math.pow(Math.max(0, x), 1.3) * cloud;
}

export function mockSolar(now: number): SolarStatus {
  const date = shDate(now);
  const p = shParts(now);
  const hf = p.hour + p.minute / 60;
  let yieldKwh = 0;
  for (let t = 0; t < hf; t += 1 / 6) yieldKwh += solarPowerAt(date, t) / 6;
  const power = solarPowerAt(date, hf);
  const daysSince = Math.floor((parseShDate(date)! - parseShDate('2026-09-01')!) / DAY_MS);
  const totalMwh = Math.max(1, 45.2 + daysSince * 1.15 + yieldKwh / 1000);
  return {
    todayYieldKwh: Math.round(yieldKwh),
    currentPowerKw: Math.round(power),
    totalYieldMwh: Math.round(totalMwh * 10) / 10,
    raw: {
      todayYield: `${Math.round(yieldKwh)} kWh`,
      currentPower: `${Math.round(power)} kW`,
      totalYield: `${totalMwh.toFixed(1)} MWh`,
    },
  };
}
