import type { Ticket } from '@shared/contract';
import { buildingName } from './buildings';
import { fmtAge, ymd } from './format';

/** 生成可直接粘贴到微信 / 飞书群的催办文本 */
export function remindText(group: string, tickets: Ticket[]): string {
  const lines = tickets.map((t, i) => {
    const where = `${buildingName(t.building)}${t.floor ? ` ${t.floor}F` : ''}`;
    const unit = t.remarkParsed.unit ? `，责任方：${t.remarkParsed.unit}` : '';
    return `${i + 1}. ${where} ${t.description}（${t.status}，已挂 ${fmtAge(t.ageHours)}${unit}）`;
  });
  return [`【湾谷园区 · 超时工单催办】${group} 共 ${tickets.length} 单（${ymd(0)}）`, ...lines, '请尽快处理并在群内回复进展，谢谢！'].join('\n');
}

/** 工单归属的「催办对象」：优先备注中的责任单位，其次工种归属 */
const ALIAS: Record<string, string> = { 物业: '物业工程', 维保: '维保单位', 施工方: '施工单位' };

export function remindGroup(t: Ticket): string {
  const g = t.remarkParsed.unit || t.owner || '未指定';
  return ALIAS[g] ?? g;
}
