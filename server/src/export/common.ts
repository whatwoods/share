/** Excel 导出公共工具 */
import type { FastifyReply } from 'fastify';
import type ExcelJS from 'exceljs';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
  left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
  bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
  right: { style: 'thin', color: { argb: 'FFBFBFBF' } },
};

export const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

/** RFC 5987：filename*=UTF-8''…，并提供 ASCII 兜底文件名 */
export function contentDisposition(filename: string, asciiFallback?: string): string {
  const ascii = (asciiFallback ?? filename).replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function sendWorkbook(reply: FastifyReply, wb: ExcelJS.Workbook, filename: string, asciiFallback?: string) {
  const buf = await wb.xlsx.writeBuffer();
  return reply
    .header('Content-Type', XLSX_MIME)
    .header('Content-Disposition', contentDisposition(filename, asciiFallback))
    .header('Cache-Control', 'no-store')
    .send(Buffer.from(buf as ArrayBuffer));
}

/** Excel 工作表名：去非法字符，≤31 字符 */
export function sheetName(s: string): string {
  return s.replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'Sheet';
}
