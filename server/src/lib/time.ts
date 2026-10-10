/**
 * Asia/Shanghai 时间工具。上海无夏令时，固定 UTC+8，因此直接做偏移计算，
 * 不依赖服务器 TZ 与 Intl 时区数据。
 */
export const TZ_OFFSET_MS = 8 * 3600 * 1000;
export const HOUR_MS = 3600 * 1000;
export const DAY_MS = 24 * HOUR_MS;

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** 把 epoch 毫秒转为「上海墙上时间」的各分量 */
export function shParts(ms: number) {
  const d = new Date(ms + TZ_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    /** 0=周日 … 6=周六 */
    weekday: d.getUTCDay(),
  };
}

/** ISO 8601，带 +08:00，例如 2026-10-10T14:03:05+08:00 */
export function toShISO(ms: number): string {
  return `${new Date(ms + TZ_OFFSET_MS).toISOString().slice(0, 19)}+08:00`;
}

/** YYYY-MM-DD（上海日期） */
export function shDate(ms: number): string {
  return new Date(ms + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** YYYY-MM（上海月份） */
export function shMonth(ms: number): string {
  return shDate(ms).slice(0, 7);
}

/** YYYY-MM-DD HH:mm（上海时间，导出/展示用） */
export function shDateTime(ms: number): string {
  const p = shParts(ms);
  return `${shDate(ms)} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** 由上海墙上时间构造 epoch 毫秒 */
export function shToMs(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): number {
  return Date.UTC(y, mo - 1, d, h, mi, s) - TZ_OFFSET_MS;
}

const DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

export function isDateStr(s: unknown): s is string {
  return typeof s === 'string' && DATE_RE.test(s);
}

/** "YYYY-MM-DD" → 当天 00:00（上海）的 epoch 毫秒；非法返回 null */
export function parseShDate(s: string): number | null {
  const m = DATE_RE.exec(s.trim());
  if (!m) return null;
  const ms = shToMs(+m[1]!, +m[2]!, +m[3]!);
  return Number.isFinite(ms) ? ms : null;
}

/** 上海日期字符串加减天数 */
export function addDays(date: string, n: number): string {
  const ms = parseShDate(date);
  if (ms === null) throw new Error(`非法日期：${date}`);
  return shDate(ms + n * DAY_MS);
}

/** [start, end] 闭区间日期列表 */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  for (let i = 0; i < 3660 && cur <= end; i++) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** 今天（上海）YYYY-MM-DD */
export function today(now = Date.now()): string {
  return shDate(now);
}

/** 上海日期是星期几（0=周日） */
export function weekdayOf(date: string): number {
  return shParts(parseShDate(date)!).weekday;
}

/** 一年中的第几天（1 起） */
export function dayOfYear(date: string): number {
  const ms = parseShDate(date)!;
  const y = shParts(ms).year;
  return Math.floor((ms - shToMs(y, 1, 1)) / DAY_MS) + 1;
}
