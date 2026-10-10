import type { BuildingCode } from '@shared/contract';

/** 前端兜底的楼栋显示名（权威字典来自 /api/meta） */
export function buildingName(code: BuildingCode | string): string {
  if (code === 'PUBLIC') return '公区';
  if (code === 'UNKNOWN') return '未识别';
  const m = /^B(\d{2})$/.exec(code);
  return m ? `${Number(m[1])}号楼` : code;
}

export function buildingShort(code: BuildingCode | string): string {
  if (code === 'PUBLIC') return '公区';
  if (code === 'UNKNOWN') return '—';
  const m = /^B(\d{2})$/.exec(code);
  return m ? `${Number(m[1])}#` : code;
}

export const ALL_BUILDINGS: BuildingCode[] = [
  ...Array.from({ length: 19 }, (_, i) => `B${String(i + 1).padStart(2, '0')}` as BuildingCode),
  'PUBLIC',
];
