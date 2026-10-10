/** 数字与时间格式化（中文习惯） */
const nf0 = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });

export const fmtInt = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? '—' : nf0.format(n));

/** 1.2 万 / 3,456 */
export function fmtCompact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e8) return `${nf1.format(n / 1e8)} 亿`;
  if (a >= 1e4) return `${(n / 1e4).toFixed(a >= 1e6 ? 0 : 2)} 万`;
  return nf0.format(n);
}

/** 拆成数值 + 单位，用于 KPI 卡 */
export function splitCompact(n: number | null | undefined, unit = ''): { value: string; unit: string } {
  if (n == null || Number.isNaN(n)) return { value: '—', unit };
  const a = Math.abs(n);
  if (a >= 1e8) return { value: nf1.format(n / 1e8), unit: `亿${unit}` };
  if (a >= 1e5) return { value: (n / 1e4).toFixed(a >= 1e6 ? 0 : 1), unit: `万${unit}` };
  return { value: nf0.format(n), unit };
}

export const fmtPct = (r: number | null | undefined, digits = 1) =>
  r == null || Number.isNaN(r) ? '—' : `${(r * 100).toFixed(digits)}%`;

/** 挂单时长：3.2 小时 / 5 天 */
export function fmtAge(hours: number | null | undefined): string {
  if (hours == null) return '—';
  if (hours < 1) return '不足 1 小时';
  if (hours < 48) return `${Math.round(hours)} 小时`;
  const d = hours / 24;
  if (d < 60) return `${Math.round(d)} 天`;
  return `${(d / 30).toFixed(1)} 个月`;
}

export function fmtDays(days: number | null | undefined): string {
  if (days == null) return '—';
  return fmtAge(days * 24);
}

function parts(iso: string) {
  const d = new Date(iso);
  // 统一按北京时间展示
  const f = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? '';
  return { y: g('year'), m: g('month'), d: g('day'), h: g('hour'), mi: g('minute') };
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const p = parts(iso);
  return `${p.y}-${p.m}-${p.d} ${p.h}:${p.mi}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const p = parts(iso);
  return `${p.y}-${p.m}-${p.d}`;
}

/** 相对时间：刚刚 / 5 分钟前 / 今天 08:12 / 10-09 06:15 */
export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return '从未';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  const p = parts(iso);
  const today = parts(new Date().toISOString());
  if (p.y === today.y && p.m === today.m && p.d === today.d) return `今天 ${p.h}:${p.mi}`;
  return `${p.m}-${p.d} ${p.h}:${p.mi}`;
}

/** 'YYYY-MM-DD'（北京时间）偏移 n 天 */
export function ymd(offsetDays = 0, base = new Date()): string {
  const d = new Date(base.getTime() + offsetDays * 86400_000);
  const p = parts(d.toISOString());
  return `${p.y}-${p.m}-${p.d}`;
}

export const shortDate = (s: string) => (s.length >= 10 ? s.slice(5, 10) : s);

/** 仅允许 <b> 的安全 HTML（AI 洞察文案） */
export function safeBoldHtml(s: string): string {
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return esc.replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>');
}
