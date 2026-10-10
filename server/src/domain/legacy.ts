/**
 * 施工遗留攻坚：分组、风险评分、汇总（纯函数，无 IO）。
 *
 * 风险评分写成「规则表」，部署后如需调权重，只改下面几个常量即可。
 */
import type {
  BuildingCode,
  LegacyGroup,
  LegacyGroupInfo,
  LegacyItem,
  LegacySummary,
} from '../../../shared/contract';
import { buildingOrder } from '../buildings';
import { DAY_MS, toShISO } from '../lib/time';

/** 规范化后的遗留记录（legacy_items 表的业务列） */
export interface LegacyRecord {
  id: string;
  seq: number | null;
  group: LegacyGroup;
  sourceTable: string;
  unit: string;
  building: BuildingCode;
  buildingRaw: string;
  floor: string;
  type: string;
  description: string;
  reportedTs: number | null;
  status: string;
  progress: string;
}

/* ───────────── 分组 ───────────── */

export const LEGACY_GROUPS: LegacyGroupInfo[] = [
  { key: 'DECAI', label: '德才', sourceTables: ['德才维修工单'] },
  { key: 'SCG', label: '上海建工', sourceTables: ['上海建工维修工单'] },
  { key: 'QIJU', label: '七局', sourceTables: ['七局维修工单'] },
  { key: 'LEAK', label: '漏水专项', sourceTables: ['漏水清单'] },
  { key: 'DISPUTE', label: '争议待定责', sourceTables: ['有争议工单'] },
  { key: 'OTHER', label: '其他', sourceTables: [] },
];
export const LEGACY_GROUP_KEYS = LEGACY_GROUPS.map((g) => g.key);

export function groupLabel(g: LegacyGroup): string {
  return LEGACY_GROUPS.find((x) => x.key === g)?.label ?? g;
}

/**
 * 按「来源表」分组；来源表无法判定时按「责任单位」兜底；再否则 OTHER。
 */
export function legacyGroupOf(sourceTable: string, unit: string): LegacyGroup {
  const st = sourceTable.trim();
  if (st) {
    if (st.includes('德才')) return 'DECAI';
    if (st.includes('上海建工')) return 'SCG';
    if (st.includes('七局')) return 'QIJU';
    if (st.includes('漏水')) return 'LEAK';
    if (st.includes('争议')) return 'DISPUTE';
  }
  const u = unit.trim();
  if (u) {
    if (/有争议|待定责|争议/.test(u)) return 'DISPUTE';
    if (u.includes('德才')) return 'DECAI';
    if (u.includes('上海建工')) return 'SCG';
    if (u.includes('七局')) return 'QIJU';
  }
  return 'OTHER';
}

/* ───────────── 风险评分规则表 ───────────── */

export interface KeywordRule {
  tag: string;
  score: number;
  /** 命中任一关键词，或 test 返回 true 即命中 */
  keywords?: string[];
  test?: (text: string) => boolean;
}

/** 关键词规则（文本 = 问题描述 + 工单类型 + 进展与备注） */
export const KEYWORD_RULES: KeywordRule[] = [
  { tag: '高空坠物', score: 45, keywords: ['高空', '坠落', '坠物'] },
  {
    tag: '外立面玻璃',
    score: 45,
    keywords: ['玻璃破碎'],
    test: (t) => /玻璃/.test(t) && /破碎|碎裂|缺失|爆裂|脱落/.test(t),
  },
  { tag: '外立面', score: 20, keywords: ['外立面', '幕墙'] },
  { tag: '排污堵塞', score: 45, keywords: ['后厨', '下水', '排污', '堵塞', '化粪池', '污水', '返水'] },
  { tag: '用电安全', score: 35, keywords: ['漏电', '跳闸', '配电'] },
  { tag: '消防', score: 30, keywords: ['消防'] },
  { tag: '渗漏', score: 15, keywords: ['渗漏', '漏水', '渗水'] },
];
/** 关键词部分封顶，避免描述啰嗦导致虚高 */
export const KEYWORD_SCORE_CAP = 70;

/** 当前状态加分（未列出的状态 0 分） */
export const STATUS_RULES: Record<string, { score: number; tag?: string }> = {
  重复漏水: { score: 25, tag: '重复漏水' },
  计划逾期: { score: 25, tag: '计划逾期' },
  有争议: { score: 15, tag: '有争议' },
  未处理: { score: 10 },
  待处理: { score: 10 },
  跟进中: { score: 5 },
  观察中: { score: 3 },
};

/** 已完成：风险归零（保留命中标签便于追溯） */
export const CLOSED_STATUSES = ['已完成'];

export const UNASSIGNED_RULE = { score: 10, tag: '责任未定', unitPattern: /有争议|待定责/ };

/** 挂账时长加分（取命中的最高一档） */
export const AGE_RULES: { minDays: number; score: number; tag: string }[] = [
  { minDays: 180, score: 20, tag: '挂账超180天' },
  { minDays: 90, score: 10, tag: '挂账超90天' },
];

export const RISK_LEVELS = { high: 70, medium: 40 } as const;

export function riskLevel(score: number): LegacyItem['risk']['level'] {
  if (score >= RISK_LEVELS.high) return 'high';
  if (score >= RISK_LEVELS.medium) return 'medium';
  return 'low';
}

export function scoreRisk(input: {
  description: string;
  type?: string;
  progress?: string;
  status: string;
  group: LegacyGroup;
  unit: string;
  ageDays: number | null;
}): LegacyItem['risk'] {
  const text = `${input.description} ${input.type ?? ''} ${input.progress ?? ''}`;
  const tags: string[] = [];
  let kw = 0;
  for (const rule of KEYWORD_RULES) {
    const hit = (rule.keywords?.some((k) => text.includes(k)) ?? false) || (rule.test?.(text) ?? false);
    if (hit) {
      kw += rule.score;
      tags.push(rule.tag);
    }
  }
  let score = Math.min(kw, KEYWORD_SCORE_CAP);

  const st = STATUS_RULES[input.status.trim()];
  if (st) {
    score += st.score;
    if (st.tag && !tags.includes(st.tag)) tags.push(st.tag);
  }
  if (input.group === 'DISPUTE' || UNASSIGNED_RULE.unitPattern.test(input.unit)) {
    score += UNASSIGNED_RULE.score;
    tags.push(UNASSIGNED_RULE.tag);
  }
  const isClosed = CLOSED_STATUSES.includes(input.status.trim());
  if (input.ageDays !== null && !isClosed) {
    const age = AGE_RULES.find((r) => input.ageDays! > r.minDays);
    if (age) {
      score += age.score;
      tags.push(age.tag);
    }
  }
  score = isClosed ? 0 : Math.max(0, Math.min(100, Math.round(score)));
  return { score, level: riskLevel(score), tags };
}

/* ───────────── 映射 / 排序 ───────────── */

export function toLegacyItem(r: LegacyRecord, now: number): LegacyItem {
  const ageDays = r.reportedTs === null ? null : Math.max(0, Math.floor((now - r.reportedTs) / DAY_MS));
  return {
    id: r.id,
    seq: r.seq,
    group: r.group,
    sourceTable: r.sourceTable,
    unit: r.unit,
    building: r.building,
    buildingRaw: r.buildingRaw,
    floor: r.floor,
    type: r.type,
    description: r.description,
    reportedAt: r.reportedTs === null ? null : toShISO(r.reportedTs),
    ageDays,
    status: r.status,
    isOpen: r.status.trim() !== '已完成',
    progress: r.progress,
    risk: scoreRisk({
      description: r.description,
      type: r.type,
      progress: r.progress,
      status: r.status,
      group: r.group,
      unit: r.unit,
      ageDays,
    }),
  };
}

/** 默认排序：风险分降序，再按序号升序 */
export function compareLegacy(a: LegacyItem, b: LegacyItem): number {
  return b.risk.score - a.risk.score || (a.seq ?? 1e9) - (b.seq ?? 1e9) || a.id.localeCompare(b.id);
}

export function compareLegacyBySeq(a: LegacyItem, b: LegacyItem): number {
  return (a.seq ?? 1e9) - (b.seq ?? 1e9) || a.id.localeCompare(b.id);
}

/* ───────────── 汇总 ───────────── */

function countBy<T>(list: T[], key: (t: T) => string): { status: string; count: number }[] {
  const m = new Map<string, number>();
  for (const t of list) m.set(key(t), (m.get(key(t)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([status, count]) => ({ status, count }));
}

/** 分组信息：默认来源表 ∪ 数据中实际出现的来源表 */
export function groupInfos(items: { group: LegacyGroup; sourceTable: string }[]): LegacyGroupInfo[] {
  return LEGACY_GROUPS.map((g) => {
    const actual = new Set(g.sourceTables);
    for (const it of items) if (it.group === g.key && it.sourceTable) actual.add(it.sourceTable);
    return { ...g, sourceTables: [...actual] };
  });
}

export function summarizeLegacy(items: LegacyItem[]): LegacySummary {
  const infos = groupInfos(items);
  const byBuilding = new Map<BuildingCode, { total: number; open: number }>();
  for (const it of items) {
    const b = byBuilding.get(it.building) ?? { total: 0, open: 0 };
    b.total++;
    if (it.isOpen) b.open++;
    byBuilding.set(it.building, b);
  }
  return {
    total: items.length,
    open: items.filter((i) => i.isOpen).length,
    groups: infos.map((g) => {
      const list = items.filter((i) => i.group === g.key);
      return {
        ...g,
        total: list.length,
        open: list.filter((i) => i.isOpen).length,
        highRisk: list.filter((i) => i.isOpen && i.risk.level === 'high').length,
        byStatus: countBy(list, (i) => i.status),
      };
    }),
    byStatus: countBy(items, (i) => i.status),
    byBuilding: [...byBuilding.entries()]
      .sort((a, b) => buildingOrder(a[0]) - buildingOrder(b[0]))
      .map(([building, v]) => ({ building, ...v })),
    radar: items
      .filter((i) => i.isOpen && i.risk.level === 'high')
      .sort(compareLegacy)
      .slice(0, 12),
  };
}
