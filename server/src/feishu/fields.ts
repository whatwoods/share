/**
 * 飞书多维表格字段值的健壮转换。
 * 飞书返回值形态多样：string、number、毫秒时间戳、string[]（多选）、{text,type}[]（富文本）、
 * {text,link}（超链接）、{name}/{en_name}（人员）、{type,value:[...]}（公式/查找引用）等。
 */
import { shToMs } from '../lib/time';

function isRichTextSegment(v: unknown): v is { text: unknown; type?: unknown } {
  return typeof v === 'object' && v !== null && 'text' in v && ('type' in v || 'mentionType' in v);
}

/** 任意字段值 → 字符串（数组用 "/" 连接；富文本片段直接拼接；空值返回 ""） */
export function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every(isRichTextSegment)) {
      return value.map((seg) => (typeof seg.text === 'string' ? seg.text : toText(seg.text))).join('').trim();
    }
    return value
      .map((v) => toText(v))
      .filter((s) => s !== '')
      .join('/');
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    for (const key of ['text', 'name', 'en_name', 'value', 'full_address', 'address', 'link', 'url', 'id']) {
      if (key in o) {
        const t = toText(o[key]);
        if (t) return t;
      }
    }
    return '';
  }
  return String(value).trim();
}

const DATE_TEXT_RE =
  /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:[ T]+(\d{1,2})(?:[:时](\d{1,2})(?:[:分](\d{1,2})(?:\.\d+)?)?秒?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

/**
 * 任意字段值 → epoch 毫秒（无法识别/空 → null）
 *  - number：毫秒时间戳（< 1e11 视为秒）
 *  - "2025-11-01T07:37:00.000+08:00"：按自带时区
 *  - "2026-07-06 08:51" / "2026/07/06" / "2026年7月6日"：无时区，按 +08:00 解释
 *  - 纯数字字符串：视为时间戳
 */
export function toDate(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    return value < 1e11 ? value * 1000 : value;
  }
  if (Array.isArray(value)) return value.length ? toDate(value[0]) : null;
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if ('value' in o) return toDate(o.value);
    if ('text' in o) return toDate(o.text);
    return null;
  }
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{9,13}$/.test(s)) return toDate(Number(s));
  const m = DATE_TEXT_RE.exec(s);
  if (m) {
    const [, y, mo, d, h, mi, sec, tz] = m;
    if (tz) {
      const off = tz.toUpperCase() === 'Z' ? 'Z' : tz.length === 5 ? `${tz.slice(0, 3)}:${tz.slice(3)}` : tz;
      const iso = `${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}T${(h ?? '0').padStart(2, '0')}:${(mi ?? '0').padStart(2, '0')}:${(sec ?? '0').padStart(2, '0')}${off}`;
      const t = Date.parse(iso);
      return Number.isFinite(t) ? t : null;
    }
    const t = shToMs(+y!, +mo!, +d!, +(h ?? 0), +(mi ?? 0), +(sec ?? 0));
    return Number.isFinite(t) ? t : null;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/** 字段值 → 数字（无法识别 → null） */
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = toText(value).replace(/,/g, '');
  if (!s) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
