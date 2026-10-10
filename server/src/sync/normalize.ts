/**
 * 飞书原始记录 → 规范化记录（入库列）。字段名集中在这里，飞书表结构变动时只改此处。
 */
import { createHash } from 'node:crypto';
import { normalizeBuilding } from '../buildings';
import type { FeishuRecord } from '../feishu/client';
import { toDate, toNumber, toText } from '../feishu/fields';
import { legacyGroupOf, type LegacyRecord } from '../domain/legacy';
import type { TicketRecord } from '../domain/tickets';

/** 日常维修总表字段名 */
export const DAILY_FIELDS = {
  description: '问题描述',
  building: '楼栋',
  floor: '楼层',
  status: '工单状态',
  type: '工单类型',
  channel: '报修渠道',
  reportedAt: '报修时间',
  remark: '备注',
} as const;

/** 施工遗留专项表字段名 */
export const LEGACY_FIELDS = {
  seq: '序号',
  sourceTable: '来源表',
  unit: '责任单位',
  building: '楼栋',
  floor: '楼层',
  type: '工单类型',
  description: '问题描述',
  reportedAt: '报修时间',
  status: '当前状态',
  progress: '进展与备注',
} as const;

export function normalizeDaily(rec: FeishuRecord): TicketRecord {
  const f = rec.fields ?? {};
  const buildingRaw = toText(f[DAILY_FIELDS.building]);
  return {
    id: rec.record_id,
    building: normalizeBuilding(buildingRaw),
    buildingRaw,
    floor: toText(f[DAILY_FIELDS.floor]),
    description: toText(f[DAILY_FIELDS.description]),
    type: toText(f[DAILY_FIELDS.type]) || '未分类',
    status: toText(f[DAILY_FIELDS.status]) || '待处理',
    channel: toText(f[DAILY_FIELDS.channel]) || '未填写',
    reportedTs: toDate(f[DAILY_FIELDS.reportedAt]),
    remark: toText(f[DAILY_FIELDS.remark]),
  };
}

export function normalizeLegacy(rec: FeishuRecord): LegacyRecord {
  const f = rec.fields ?? {};
  const buildingRaw = toText(f[LEGACY_FIELDS.building]);
  const sourceTable = toText(f[LEGACY_FIELDS.sourceTable]);
  const unit = toText(f[LEGACY_FIELDS.unit]);
  const seq = toNumber(f[LEGACY_FIELDS.seq]);
  return {
    id: rec.record_id,
    seq: seq === null ? null : Math.trunc(seq),
    group: legacyGroupOf(sourceTable, unit),
    sourceTable,
    unit,
    building: normalizeBuilding(buildingRaw),
    buildingRaw,
    floor: toText(f[LEGACY_FIELDS.floor]),
    type: toText(f[LEGACY_FIELDS.type]),
    description: toText(f[LEGACY_FIELDS.description]),
    reportedTs: toDate(f[LEGACY_FIELDS.reportedAt]),
    status: toText(f[LEGACY_FIELDS.status]) || '未处理',
    progress: toText(f[LEGACY_FIELDS.progress]),
  };
}

/** 规范化内容 hash（键顺序固定） */
export function contentHash(obj: object): string {
  const keys = Object.keys(obj).sort();
  const canonical = JSON.stringify(keys.map((k) => [k, (obj as Record<string, unknown>)[k]]));
  return createHash('sha1').update(canonical).digest('hex');
}
