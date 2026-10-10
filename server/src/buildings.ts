/**
 * 楼栋字典与归一化。
 * 统一编码：B01~B19 + PUBLIC（公区）+ UNKNOWN。
 * 1~11 号楼办公（office），12~19 号楼公寓及配套（apartment），公区（public）。
 */
import type { BuildingCode, BuildingInfo, BuildingKind } from '../../shared/contract';

export const MAX_BUILDING_NO = 19;

export function buildingKind(code: BuildingCode | string): BuildingKind {
  if (code === 'PUBLIC') return 'public';
  const m = /^B(\d{2})$/.exec(code);
  if (!m) return 'unknown';
  const n = Number(m[1]);
  if (n >= 1 && n <= 11) return 'office';
  if (n >= 12 && n <= MAX_BUILDING_NO) return 'apartment';
  return 'unknown';
}

export function buildingInfo(code: BuildingCode): BuildingInfo {
  if (code === 'PUBLIC') return { code, name: '公区', short: '公区', kind: 'public' };
  if (code === 'UNKNOWN') return { code, name: '未识别', short: '未识别', kind: 'unknown' };
  const n = Number(code.slice(1));
  return { code, name: `${n}号楼`, short: `${n}#`, kind: buildingKind(code) };
}

/** B01..B19 + PUBLIC，按顺序（Meta.buildings 使用） */
export const BUILDING_CODES: BuildingCode[] = [
  ...Array.from({ length: MAX_BUILDING_NO }, (_, i) => `B${String(i + 1).padStart(2, '0')}` as BuildingCode),
  'PUBLIC',
];
export const BUILDINGS: BuildingInfo[] = BUILDING_CODES.map(buildingInfo);

export function isBuildingCode(s: string): s is BuildingCode {
  return s === 'UNKNOWN' || (BUILDING_CODES as string[]).includes(s);
}

/** 排序权重：B01..B19, PUBLIC, UNKNOWN */
export function buildingOrder(code: string): number {
  const i = (BUILDING_CODES as string[]).indexOf(code);
  return i >= 0 ? i : 999;
}

const CN_DIGITS: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

/** 中文数字（0~99）→ 整数；无法解析返回 null */
export function cnToInt(s: string): number | null {
  if (!s) return null;
  if (s === '十') return 10;
  const tenIdx = s.indexOf('十');
  if (tenIdx >= 0) {
    const tensStr = s.slice(0, tenIdx);
    const onesStr = s.slice(tenIdx + 1);
    const tens = tensStr === '' ? 1 : CN_DIGITS[tensStr];
    const ones = onesStr === '' ? 0 : CN_DIGITS[onesStr];
    if (tens === undefined || ones === undefined || tensStr.length > 1 || onesStr.length > 1) return null;
    return tens * 10 + ones;
  }
  // 逐位：如「一九」不常见，按单个数字处理
  if (s.length === 1 && CN_DIGITS[s] !== undefined) return CN_DIGITS[s]!;
  return null;
}

/** 公区关键词（不含楼号时命中即归入 PUBLIC） */
export const PUBLIC_KEYWORDS = [
  '公区', '公共', '园区', '室外', '户外', '地库', '地下车库', '车库', '停车场', '设备用房', '设备房',
  '广场', '景观', '道路', '绿化', '围墙', '大门', '门岗', '泵房', '变电所', '配电房', '能源中心', '连廊',
];

function codeFromNumber(n: number): BuildingCode {
  if (!Number.isInteger(n) || n < 1 || n > MAX_BUILDING_NO) return 'UNKNOWN';
  return `B${String(n).padStart(2, '0')}` as BuildingCode;
}

/**
 * 楼栋归一化：
 *  "1" "01" "1号楼" "1#" "1#楼" "1栋" "1幢" "B1" "B01" "一号楼" "十一号楼" "1号楼5层" "2号楼屋顶空调" → B01/B02/…
 *  "公区" "公共区域" "园区" "室外" "地库" "设备用房" "广场" "公区/其他" → PUBLIC
 *  数字 >19 或无法识别 → UNKNOWN
 */
export function normalizeBuilding(raw: unknown): BuildingCode {
  if (raw === null || raw === undefined) return 'UNKNOWN';
  const s = String(raw).replace(/\s+/g, '').replace(/＃/g, '#');
  if (!s) return 'UNKNOWN';
  if (/^(PUBLIC|UNKNOWN)$/i.test(s)) return s.toUpperCase() as BuildingCode;

  // 1) 纯数字 / B+数字（可带后缀，如 B01、B1、b03栋）
  let m = /^[Bb]?0*(\d{1,3})(?:号楼|号|#楼|#|栋|幢|座)?$/.exec(s);
  if (m) return codeFromNumber(Number(m[1]));

  // 2) 阿拉伯数字 + 楼栋后缀（出现在任意位置，如「1号楼5层」「2号楼屋顶空调」）
  m = /(?:^|[^\dA-Za-z])0*(\d{1,3})(?:号楼|号|#楼|#|栋|幢|座)/.exec(s);
  if (m) return codeFromNumber(Number(m[1]));

  // 3) 中文数字 + 楼栋后缀（一号楼、十一号楼、十九栋）
  m = /([零〇一二两三四五六七八九十]{1,3})(?:号楼|号|栋|幢|座)/.exec(s);
  if (m) {
    const n = cnToInt(m[1]!);
    if (n !== null) return codeFromNumber(n);
  }

  // 4) B 开头 + 数字 + 其他后缀（B1-xx）
  m = /^[Bb]0*(\d{1,2})(?=\D)/.exec(s);
  if (m && !/层/.test(s)) return codeFromNumber(Number(m[1]));

  // 5) 以数字开头的其他形式（如 "1-公寓"），取开头数字
  m = /^0*(\d{1,3})(?=[^\d层楼Ff])/.exec(s);
  if (m) return codeFromNumber(Number(m[1]));

  if (PUBLIC_KEYWORDS.some((k) => s.includes(k))) return 'PUBLIC';
  return 'UNKNOWN';
}
