import type { BuildingCard } from '@shared/contract';
import { ymd } from './format';

export interface EnergyAnomaly {
  code: string;
  name: string;
  yesterday: number;
  baseline: number;
  /** (昨日 - 基线) / 基线 */
  dev: number;
  spark: number[];
  flagged: boolean;
}

/** 偏差超过 ±15% 视为异常 */
export const ANOMALY_THRESHOLD = 0.15;

const isWeekend = (d: string) => [0, 6].includes(new Date(`${d}T00:00:00+08:00`).getDay());

/**
 * 楼栋能耗异常：昨日电量 vs 前 13 天中「同类日」（工作日 / 周末）均值。
 * spark 为近 14 天日电量，最后一个值是昨日。
 */
export function energyAnomalies(cards: BuildingCard[]): EnergyAnomaly[] {
  const out: EnergyAnomaly[] = [];
  for (const c of cards) {
    const s = c.energy.spark;
    if (s.length < 8) continue;
    const n = s.length;
    const dates = s.map((_, i) => ymd(-(n - i)));
    const y = s[n - 1];
    const yWe = isWeekend(dates[n - 1]);
    const same = s.slice(0, -1).filter((_, i) => isWeekend(dates[i]) === yWe && s[i] > 0);
    if (!same.length) continue;
    const base = same.reduce((a, b) => a + b, 0) / same.length;
    if (base < 50) continue;
    const dev = (y - base) / base;
    out.push({ code: c.code, name: c.name, yesterday: y, baseline: base, dev, spark: s, flagged: Math.abs(dev) >= ANOMALY_THRESHOLD });
  }
  return out.sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev));
}
