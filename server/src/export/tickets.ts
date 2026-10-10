/** 工单明细导出（当前筛选下全部） */
import ExcelJS from 'exceljs';
import type { Ticket } from '../../../shared/contract';
import { buildingInfo } from '../buildings';
import { shDateTime } from '../lib/time';
import { THIN_BORDER, fill } from './common';

const COLS: { header: string; width: number; wrap?: boolean; value: (t: Ticket) => string | number }[] = [
  { header: '楼栋', width: 9, value: (t) => (t.building === 'UNKNOWN' ? t.buildingRaw : buildingInfo(t.building).name) },
  { header: '楼层', width: 7, value: (t) => t.floor },
  { header: '问题描述', width: 44, wrap: true, value: (t) => t.description },
  { header: '工种', width: 16, value: (t) => t.type },
  { header: '责任主体', width: 10, value: (t) => t.owner ?? '' },
  { header: '状态', width: 10, value: (t) => t.status },
  { header: '超时等级', width: 9, value: (t) => ({ red: '红色', yellow: '黄色', none: '' })[t.overdue] },
  { header: '报修渠道', width: 11, value: (t) => t.channel },
  { header: '报修时间', width: 17, value: (t) => (t.reportedAt ? shDateTime(Date.parse(t.reportedAt)) : '') },
  { header: '挂单时长', width: 12, value: (t) => formatAge(t) },
  { header: '备注', width: 40, wrap: true, value: (t) => t.remark },
];

function formatAge(t: Ticket): string {
  if (t.ageHours === null) return '';
  if (t.ageHours < 24) return `${Math.round(t.ageHours)} 小时`;
  const d = Math.floor(t.ageHours / 24);
  const h = Math.round(t.ageHours - d * 24);
  return h ? `${d} 天 ${h} 小时` : `${d} 天`;
}

export function buildTicketsWorkbook(tickets: Ticket[], now: number, filterDesc: string): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = '湾谷园区综合运营工作台';
  wb.created = new Date(now);
  const ws = wb.addWorksheet('工单明细', { views: [{ state: 'frozen', ySplit: 2 }] });
  ws.columns = COLS.map((c) => ({ width: c.width }));
  ws.mergeCells(1, 1, 1, COLS.length);
  const title = ws.getCell(1, 1);
  title.value = `湾谷园区 · 日常维修工单明细（导出时间 ${shDateTime(now)}，共 ${tickets.length} 条${filterDesc ? `；筛选：${filterDesc}` : ''}）`;
  title.font = { bold: true, size: 12 };
  ws.getRow(1).height = 24;

  const header = ws.getRow(2);
  COLS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = fill('FF305496');
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = THIN_BORDER;
  });

  tickets.forEach((t, idx) => {
    const row = ws.getRow(3 + idx);
    row.values = COLS.map((c) => c.value(t));
    COLS.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.border = THIN_BORDER;
      cell.alignment = { vertical: 'middle', wrapText: !!c.wrap };
    });
    if (t.overdue !== 'none') {
      row.getCell(7).fill = fill(t.overdue === 'red' ? 'FFF8CBAD' : 'FFFFF2CC');
      row.getCell(7).font = { bold: true, color: { argb: t.overdue === 'red' ? 'FF9C0006' : 'FF7F6000' } };
    }
  });
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2 + tickets.length, column: COLS.length } };
  return wb;
}
