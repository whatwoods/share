import type { BuildingCode } from '@shared/contract';

/**
 * 园区平面示意布局（百分比坐标，非实际比例）。
 * 部署后如需贴合真实总平面，只需调整这里的 x / y / w / h。
 */
export interface Slot {
  code: BuildingCode;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ZONES = [
  { label: '研发办公区 · 1~11 号楼', x: 2, y: 4, w: 61, h: 92 },
  { label: '公寓及配套 · 12~19 号楼', x: 66, y: 4, w: 32, h: 92 },
];

export const SLOTS: Slot[] = [
  // 办公区北排 1~6
  { code: 'B01', x: 4, y: 14, w: 8.5, h: 22 },
  { code: 'B02', x: 13.7, y: 14, w: 8.5, h: 22 },
  { code: 'B03', x: 23.4, y: 14, w: 8.5, h: 22 },
  { code: 'B04', x: 33.1, y: 14, w: 8.5, h: 22 },
  { code: 'B05', x: 42.8, y: 14, w: 8.5, h: 22 },
  { code: 'B06', x: 52.5, y: 14, w: 8.5, h: 22 },
  // 中轴公区
  { code: 'PUBLIC', x: 4, y: 42, w: 57, h: 13 },
  // 办公区南排 7~11
  { code: 'B07', x: 4, y: 61, w: 10.2, h: 25 },
  { code: 'B08', x: 15.7, y: 61, w: 10.2, h: 25 },
  { code: 'B09', x: 27.4, y: 61, w: 10.2, h: 25 },
  { code: 'B10', x: 39.1, y: 61, w: 10.2, h: 25 },
  { code: 'B11', x: 50.8, y: 61, w: 10.2, h: 25 },
  // 公寓区 12~19（两列四排）
  { code: 'B12', x: 68, y: 14, w: 13.5, h: 16 },
  { code: 'B13', x: 83, y: 14, w: 13.5, h: 16 },
  { code: 'B14', x: 68, y: 33, w: 13.5, h: 16 },
  { code: 'B15', x: 83, y: 33, w: 13.5, h: 16 },
  { code: 'B16', x: 68, y: 52, w: 13.5, h: 16 },
  { code: 'B17', x: 83, y: 52, w: 13.5, h: 16 },
  { code: 'B18', x: 68, y: 71, w: 13.5, h: 16 },
  { code: 'B19', x: 83, y: 71, w: 13.5, h: 16 },
];
