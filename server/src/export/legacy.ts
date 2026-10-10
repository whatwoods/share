/**
 * 施工遗留索赔清单（交付例会/法务的正式对账单）。
 * 单分组：一个 sheet；ALL：首个 sheet 为各单位汇总，其后每个单位一个 sheet。
 */
import ExcelJS from 'exceljs';
import type { LegacyGroup, LegacyItem } from '../../../shared/contract';
import { buildingInfo } from '../buildings';
import { LEGACY_GROUPS, compareLegacyBySeq, groupLabel } from '../domain/legacy';
import { shDateTime } from '../lib/time';
import { THIN_BORDER, fill, sheetName } from './common';

const COLUMNS: { header: string; width: number; wrap?: boolean; center?: boolean }[] = [
  { header: '序号', width: 7, center: true },
  { header: '楼栋', width: 9, center: true },
  { header: '楼层', width: 7, center: true },
  { header: '工单类型', width: 14 },
  { header: '问题描述', width: 42, wrap: true },
  { header: '报修时间', width: 17, center: true },
  { header: '挂账天数', width: 9, center: true },
  { header: '当前状态', width: 11, center: true },
  { header: '风险等级', width: 9, center: true },
  { header: '风险标签', width: 22, wrap: true },
  { header: '进展与备注', width: 40, wrap: true },
  { header: '责任单位', width: 14, wrap: true },
  { header: '来源表', width: 15 },
];
const STATUS_COL = 8;
const RISK_COL = 9;

/** 状态列着色（底色, 字色） */
export const STATUS_COLORS: Record<string, [string, string]> = {
  已完成: ['FFE2EFDA', 'FF375623'],
  重复漏水: ['FFF8CBAD', 'FF9C0006'],
  计划逾期: ['FFF8CBAD', 'FF9C0006'],
  有争议: ['FFFCE4D6', 'FFC65911'],
  跟进中: ['FFFFF2CC', 'FF7F6000'],
  观察中: ['FFDDEBF7', 'FF1F4E78'],
  未处理: ['FFEDEDED', 'FF404040'],
};
const HIGH_RISK_ROW = 'FFFDECEC';
const RISK_TEXT = { high: '高', medium: '中', low: '低' } as const;

export interface LegacyExportMeta {
  now: number;
  openOnly: boolean;
  dataMode: 'live' | 'mock';
}

function scopeText(meta: LegacyExportMeta): string {
  return `${meta.openOnly ? '仅未完成项' : '全部状态'}；数据来源：飞书「施工遗留专项」表${meta.dataMode === 'mock' ? '（模拟数据）' : ''}`;
}

function addTitle(ws: ExcelJS.Worksheet, title: string, subtitle: string, ncol: number) {
  ws.mergeCells(1, 1, 1, ncol);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 16 };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 32;
  ws.mergeCells(2, 1, 2, ncol);
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { size: 10, color: { argb: 'FF595959' } };
  s.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  ws.getRow(2).height = 22;
}

function addHeader(ws: ExcelJS.Worksheet, headers: string[], rowNo: number) {
  const row = ws.getRow(rowNo);
  headers.forEach((h, i) => {
    const c = row.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = fill('FF305496');
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = THIN_BORDER;
  });
  row.height = 24;
}

function addFooter(ws: ExcelJS.Worksheet, startRow: number, ncol: number, totalText: string) {
  const r = ws.getRow(startRow);
  r.getCell(1).value = '合计';
  ws.mergeCells(startRow, 2, startRow, ncol);
  r.getCell(2).value = totalText;
  for (let i = 1; i <= ncol; i++) {
    const c = r.getCell(i);
    c.font = { bold: true };
    c.fill = fill('FFF2F2F2');
    c.border = THIN_BORDER;
    c.alignment = { vertical: 'middle', horizontal: i === 1 ? 'center' : 'left' };
  }
  r.height = 22;
  const signRow = startRow + 2;
  ws.mergeCells(signRow, 1, signRow, ncol);
  const s = ws.getCell(signRow, 1);
  s.value = '物业方：________________        施工方：________________        日期：________________';
  s.font = { size: 12 };
  s.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(signRow).height = 36;
}

function setupPrint(ws: ExcelJS.Worksheet, headerRow: number) {
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `${headerRow}:${headerRow}`,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
  };
  ws.headerFooter = { oddFooter: '第 &P 页 / 共 &N 页' };
}

function countText(items: LegacyItem[]): string {
  const open = items.filter((i) => i.isOpen);
  const high = open.filter((i) => i.risk.level === 'high').length;
  const medium = open.filter((i) => i.risk.level === 'medium').length;
  return `共 ${items.length} 项，未完成 ${open.length} 项（其中高危 ${high} 项、中危 ${medium} 项），已完成 ${items.length - open.length} 项`;
}

function addItemsSheet(wb: ExcelJS.Workbook, name: string, unitLabel: string, items: LegacyItem[], meta: LegacyExportMeta) {
  const ws = wb.addWorksheet(sheetName(name), { views: [{ state: 'frozen', ySplit: 3, xSplit: 0 }] });
  const ncol = COLUMNS.length;
  ws.columns = COLUMNS.map((c) => ({ width: c.width }));
  const open = items.filter((i) => i.isOpen).length;
  addTitle(
    ws,
    `湾谷园区 · ${unitLabel} 施工遗留问题索赔清单`,
    `导出时间：${shDateTime(meta.now)} ／ 统计口径：${scopeText(meta)} ／ 共 ${items.length} 项（未完成 ${open} 项）`,
    ncol,
  );
  addHeader(ws, COLUMNS.map((c) => c.header), 3);

  const sorted = [...items].sort(compareLegacyBySeq);
  sorted.forEach((it, idx) => {
    const rowNo = 4 + idx;
    const b = it.building === 'UNKNOWN' ? it.buildingRaw || '—' : buildingInfo(it.building).name;
    const row = ws.getRow(rowNo);
    row.values = [
      it.seq ?? '',
      b,
      it.floor,
      it.type,
      it.description,
      it.reportedAt ? shDateTime(Date.parse(it.reportedAt)) : '',
      it.ageDays ?? '',
      it.status,
      RISK_TEXT[it.risk.level],
      it.risk.tags.join('、'),
      it.progress,
      it.unit,
      it.sourceTable,
    ];
    const highRisk = it.isOpen && it.risk.level === 'high';
    COLUMNS.forEach((col, i) => {
      const c = row.getCell(i + 1);
      c.border = THIN_BORDER;
      c.alignment = { vertical: 'middle', horizontal: col.center ? 'center' : 'left', wrapText: !!col.wrap };
      if (highRisk) c.fill = fill(HIGH_RISK_ROW);
    });
    const sc = STATUS_COLORS[it.status];
    if (sc) {
      const c = row.getCell(STATUS_COL);
      c.fill = fill(sc[0]);
      c.font = { color: { argb: sc[1] }, bold: it.status !== '已完成' };
    }
    if (it.isOpen && it.risk.level !== 'low') {
      row.getCell(RISK_COL).font = { bold: true, color: { argb: it.risk.level === 'high' ? 'FFC00000' : 'FFC65911' } };
    }
  });
  const lastRow = 3 + sorted.length;
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: Math.max(3, lastRow), column: ncol } };
  addFooter(ws, lastRow + 1, ncol, countText(items));
  setupPrint(ws, 3);
}

const SUMMARY_COLS: { header: string; width: number }[] = [
  { header: '责任单位', width: 16 },
  { header: '来源表', width: 22 },
  { header: '总数', width: 9 },
  { header: '未完成', width: 9 },
  { header: '已完成', width: 9 },
  { header: '高危(未完成)', width: 12 },
  { header: '中危(未完成)', width: 12 },
  { header: '重复漏水', width: 10 },
  { header: '计划逾期', width: 10 },
  { header: '有争议', width: 9 },
  { header: '闭环率', width: 9 },
];

function addSummarySheet(wb: ExcelJS.Workbook, groups: { key: LegacyGroup; items: LegacyItem[] }[], all: LegacyItem[], meta: LegacyExportMeta) {
  const ws = wb.addWorksheet('汇总', { views: [{ state: 'frozen', ySplit: 3, xSplit: 0 }] });
  const ncol = SUMMARY_COLS.length;
  ws.columns = SUMMARY_COLS.map((c) => ({ width: c.width }));
  addTitle(
    ws,
    '湾谷园区 · 全部单位 施工遗留问题索赔清单（汇总）',
    `导出时间：${shDateTime(meta.now)} ／ 统计口径：${scopeText(meta)} ／ 共 ${all.length} 项（未完成 ${all.filter((i) => i.isOpen).length} 项）`,
    ncol,
  );
  addHeader(ws, SUMMARY_COLS.map((c) => c.header), 3);
  const stat = (items: LegacyItem[]) => {
    const open = items.filter((i) => i.isOpen);
    const st = (s: string) => items.filter((i) => i.status === s).length;
    return [
      items.length,
      open.length,
      items.length - open.length,
      open.filter((i) => i.risk.level === 'high').length,
      open.filter((i) => i.risk.level === 'medium').length,
      st('重复漏水'),
      st('计划逾期'),
      st('有争议'),
      items.length ? (items.length - open.length) / items.length : 0,
    ];
  };
  groups.forEach((g, idx) => {
    const info = LEGACY_GROUPS.find((x) => x.key === g.key)!;
    const sources = [...new Set(g.items.map((i) => i.sourceTable).filter(Boolean))];
    const row = ws.getRow(4 + idx);
    row.values = [info.label, (sources.length ? sources : info.sourceTables).join('、'), ...stat(g.items)];
    for (let i = 1; i <= ncol; i++) {
      const c = row.getCell(i);
      c.border = THIN_BORDER;
      c.alignment = { vertical: 'middle', horizontal: i <= 2 ? 'left' : 'center' };
    }
    row.getCell(ncol).numFmt = '0.0%';
    if ((row.getCell(6).value as number) > 0) row.getCell(6).font = { bold: true, color: { argb: 'FFC00000' } };
  });
  const totalRowNo = 4 + groups.length;
  const tr = ws.getRow(totalRowNo);
  tr.values = ['合计', '', ...stat(all)];
  for (let i = 1; i <= ncol; i++) {
    const c = tr.getCell(i);
    c.font = { bold: true };
    c.fill = fill('FFF2F2F2');
    c.border = THIN_BORDER;
    c.alignment = { vertical: 'middle', horizontal: i <= 2 ? 'left' : 'center' };
  }
  tr.getCell(ncol).numFmt = '0.0%';
  const signRow = totalRowNo + 2;
  ws.mergeCells(signRow, 1, signRow, ncol);
  const s = ws.getCell(signRow, 1);
  s.value = '物业方：________________        施工方：________________        日期：________________';
  s.font = { size: 12 };
  ws.getRow(signRow).height = 36;
  setupPrint(ws, 3);
}

/** 生成工作簿；group = 'ALL' 时含汇总 sheet */
export function buildLegacyWorkbook(items: LegacyItem[], group: LegacyGroup | 'ALL', meta: LegacyExportMeta): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = '湾谷园区综合运营工作台';
  wb.created = new Date(meta.now);
  const list = meta.openOnly ? items.filter((i) => i.isOpen) : items;
  if (group === 'ALL') {
    const groups = LEGACY_GROUPS.map((g) => ({ key: g.key, items: list.filter((i) => i.group === g.key) })).filter(
      (g) => g.items.length > 0 || g.key !== 'OTHER',
    );
    addSummarySheet(wb, groups, list, meta);
    for (const g of groups) if (g.items.length) addItemsSheet(wb, groupLabel(g.key), groupLabel(g.key), g.items, meta);
  } else {
    addItemsSheet(wb, groupLabel(group), groupLabel(group), list.filter((i) => i.group === group), meta);
  }
  return wb;
}

export function legacyExportFilename(group: LegacyGroup | 'ALL', now: number): string {
  const unit = group === 'ALL' ? '全部单位' : groupLabel(group);
  return `湾谷园区_施工遗留索赔清单_${unit}_${shDateTime(now).slice(0, 10).replace(/-/g, '')}.xlsx`;
}
