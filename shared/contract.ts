/**
 * 湾谷园区运营工作台 —— 前后端共享接口约定（单一事实来源）
 *
 * - 所有接口前缀 /api，JSON 返回；除 /api/health 与 /api/auth/* 外均需登录 Cookie。
 * - 时间：后端统一以 Asia/Shanghai 解释日期；时间戳字段为 ISO 8601 字符串（带 +08:00）。
 * - 楼栋统一编码：B01 ~ B19 + PUBLIC（公区）；无法识别的记为 UNKNOWN。
 * - 错误返回：HTTP 4xx/5xx + { error: string }。
 */

/* ───────────────────────────── 基础字典 ───────────────────────────── */

export type BuildingCode =
  | 'B01' | 'B02' | 'B03' | 'B04' | 'B05' | 'B06' | 'B07' | 'B08' | 'B09' | 'B10'
  | 'B11' | 'B12' | 'B13' | 'B14' | 'B15' | 'B16' | 'B17' | 'B18' | 'B19'
  | 'PUBLIC' | 'UNKNOWN';

/** office: 1~11 号楼办公；apartment: 12~19 号楼公寓及配套研发办公；public: 公区 */
export type BuildingKind = 'office' | 'apartment' | 'public' | 'unknown';

export interface BuildingInfo {
  code: BuildingCode;
  name: string;      // "1号楼" / "公区"
  short: string;     // "1#" / "公区"
  kind: BuildingKind;
}

/** 日常维修 8 大标准工种 */
export const TICKET_TYPES = [
  '强电与照明',
  '给排水与洁具',
  '门窗五金与幕墙',
  '暖通与空调',
  '漏水专项防治',
  '家具家电',
  '特种设备与专项维保',
  '土建修补与其他',
] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export type OwnerGroup = '物业工程' | '维保单位' | '施工单位' | '供应商';

export const TICKET_TYPE_OWNER: Record<TicketType, OwnerGroup> = {
  '强电与照明': '物业工程',
  '给排水与洁具': '物业工程',
  '门窗五金与幕墙': '物业工程',
  '暖通与空调': '维保单位',
  '漏水专项防治': '施工单位',
  '家具家电': '供应商',
  '特种设备与专项维保': '维保单位',
  '土建修补与其他': '物业工程',
};

/** 飞书原始工单状态 */
export type TicketStatus = '待处理' | '跟进中' | '已完成' | '幕墙专项';
/** 看板列：幕墙专项归入「跟进中」列并打标 */
export type BoardColumn = '待处理' | '跟进中' | '已完成';

/** 超时预警：待处理 >24h 黄 / >72h 红；跟进中(含幕墙专项) >7d 黄 / >15d 红；已完成 none */
export type OverdueLevel = 'none' | 'yellow' | 'red';

export const OVERDUE_THRESHOLDS_HOURS = {
  '待处理': { yellow: 24, red: 72 },
  '跟进中': { yellow: 24 * 7, red: 24 * 15 },
} as const;

/** 专项摸排渠道：用于「排除专项摸排工单」开关 */
export const SPECIAL_CHANNEL = '专项摸排';

/* ───────────────────────────── 通用 ───────────────────────────── */

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type DataMode = 'live' | 'mock';

/* ───────────────────────────── 鉴权 ─────────────────────────────
 * POST /api/auth/login   body { password }  → 200 { ok: true } + Set-Cookie (HttpOnly, SameSite=Lax, 7 天)
 *                                          → 401 { error }
 * POST /api/auth/logout                    → { ok: true }
 * GET  /api/auth/me                        → { authenticated: boolean, authEnabled: boolean }
 * 若未配置 AUTH_PASSWORD，则 authEnabled=false，所有接口免登录（仅开发用）。
 */
export interface AuthMe { authenticated: boolean; authEnabled: boolean }

/* ───────────────────────────── 元数据 / 同步 ─────────────────────────────
 * GET  /api/health          → { ok: true, version }
 * GET  /api/meta            → Meta
 * POST /api/sync            → SyncRun（同步执行完成后返回；若已有同步在跑则 409 { error }）
 * GET  /api/sync/status     → SyncStatus
 */
export interface Meta {
  buildings: BuildingInfo[];               // B01..B19 + PUBLIC，按顺序
  ticketTypes: { type: TicketType; owner: OwnerGroup }[];
  ticketStatuses: TicketStatus[];
  channels: string[];                      // 数据库中实际出现的报修渠道（去重，按数量降序）
  legacyGroups: LegacyGroupInfo[];
  legacyStatuses: string[];                // 数据库中实际出现的专项状态
  thresholds: typeof OVERDUE_THRESHOLDS_HOURS;
  dataMode: { feishu: DataMode; energy: DataMode };
  lastSync: SyncRun | null;
  now: string;                             // 服务器当前时间
}

export interface SyncRun {
  id: number;
  trigger: 'manual' | 'schedule' | 'startup';
  startedAt: string;
  finishedAt: string | null;
  ok: boolean;
  message: string;                         // 人类可读摘要 / 错误信息
  tables: {
    table: 'daily' | 'legacy';
    fetched: number;
    inserted: number;
    updated: number;
    deleted: number;
    unchanged: number;
  }[];
  durationMs: number;
}

export interface SyncStatus {
  running: boolean;
  last: SyncRun | null;
  history: SyncRun[];                      // 最近 20 次
  nextScheduledAt: string | null;
}

/* ───────────────────────────── 日常维修工单 ───────────────────────────── */

export interface Ticket {
  id: string;                              // 飞书 record_id
  building: BuildingCode;
  buildingRaw: string;                     // 飞书原始「楼栋」
  floor: string;
  description: string;
  type: TicketType | string;               // 正常为 8 大类之一；未识别保留原值
  owner: OwnerGroup | null;
  status: TicketStatus | string;
  column: BoardColumn;
  channel: string;
  reportedAt: string | null;               // ISO
  ageHours: number | null;                 // 距今小时数
  overdue: OverdueLevel;
  remark: string;                          // 备注原文
  remarkParsed: {                          // 从备注中解析出的结构化信息（键值形式 "责任单位: 德才 | 报修人: X | 方案: Y | [FP:xxx]"）
    unit?: string;                         // 责任单位（也会从自由文本中识别 德才/上海建工/七局 等）
    reporter?: string;
    plan?: string;
    fingerprint?: string;
    extra?: Record<string, string>;
  };
  isSpecial: boolean;                      // channel === '专项摸排'
}

/** 通用筛选参数（query string） */
export interface TicketFilter {
  building?: BuildingCode | string;        // 可逗号分隔多个
  type?: string;                           // 可逗号分隔多个
  status?: string;                         // 可逗号分隔多个（原始状态）
  column?: BoardColumn;
  channel?: string;                        // 可逗号分隔多个
  from?: string;                           // YYYY-MM-DD（含）
  to?: string;                             // YYYY-MM-DD（含）
  q?: string;                              // 关键词：问题描述/备注/楼层 模糊匹配
  overdue?: 'red' | 'yellow' | 'any';
  excludeSpecial?: '1' | '0';
}

/*
 * GET /api/tickets?{TicketFilter}&page=1&pageSize=50&sort=reportedAt|-reportedAt|ageHours|-ageHours
 *     → Paged<Ticket>（pageSize 上限 200，默认按 -reportedAt）
 * GET /api/tickets/:id → Ticket
 * GET /api/tickets/board?{TicketFilter} → TicketBoard
 * GET /api/tickets/stats?{TicketFilter} → TicketStats
 * GET /api/tickets/export?{TicketFilter} → xlsx 文件下载（当前筛选下全部明细）
 */
export interface TicketBoard {
  columns: {
    column: BoardColumn;
    count: number;
    red: number;
    yellow: number;
    items: Ticket[];                       // 待处理/跟进中：按 overdue(红>黄>无) 再按 ageHours 降序，最多 100；已完成：最近 50
  }[];
  overdue: { red: number; yellow: number };
}

export interface RateRow {
  total: number;
  closed: number;                          // 已完成
  open: number;                            // 非已完成
  rate: number;                            // closed/total，0~1，total=0 时为 0
}

export interface TicketStats {
  summary: RateRow & {
    red: number;
    yellow: number;
    special: number;                       // 当前筛选范围内专项摸排单数（无论是否排除都返回原始数量）
    avgOpenAgeHours: number | null;        // 未完成工单平均挂单时长
  };
  byType: (RateRow & { type: string; owner: OwnerGroup | null })[];    // 8 大类固定顺序，未识别类型追加在后
  byOwner: (RateRow & { owner: OwnerGroup })[];
  byBuilding: (RateRow & { building: BuildingCode; red: number; yellow: number })[];
  byChannel: (RateRow & { channel: string })[];
  byStatus: { status: string; count: number }[];
  byMonth: (RateRow & { month: string })[];  // YYYY-MM，按时间升序，最近 12 个月（受 from/to 约束）
  byDay: { date: string; total: number; closed: number }[]; // 最近 30 天每日新增 & 其中已完成
}

/* ───────────────────────────── 施工遗留攻坚 ───────────────────────────── */

/**
 * 分组按「来源表」：
 *  德才维修工单 → DECAI(德才)；上海建工维修工单 → SCG(上海建工)；包含「七局」→ QIJU(七局)；
 *  漏水清单 → LEAK(漏水专项)；有争议工单 → DISPUTE(争议待定责)；其它 → OTHER
 */
export type LegacyGroup = 'DECAI' | 'SCG' | 'QIJU' | 'LEAK' | 'DISPUTE' | 'OTHER';

export interface LegacyGroupInfo {
  key: LegacyGroup;
  label: string;                           // 德才 / 上海建工 / 七局 / 漏水专项 / 争议待定责 / 其他
  sourceTables: string[];
}

export interface LegacyItem {
  id: string;                              // 飞书 record_id
  seq: number | null;                      // 序号
  group: LegacyGroup;
  sourceTable: string;
  unit: string;                            // 责任单位（原值，多选以 / 连接）
  building: BuildingCode;
  buildingRaw: string;
  floor: string;
  type: string;                            // 工单类型（原值）
  description: string;
  reportedAt: string | null;
  ageDays: number | null;
  status: string;                          // 当前状态（原值）
  isOpen: boolean;                         // status !== '已完成'
  progress: string;                        // 进展与备注
  risk: {
    score: number;                         // 0~100，越高越危险
    level: 'high' | 'medium' | 'low';
    tags: string[];                        // 命中的风险标签，如「高空坠物」「外立面玻璃」「排污堵塞」「重复漏水」「计划逾期」「责任未定」
  };
}

/*
 * GET /api/legacy?group=DECAI&status=&building=&q=&open=1 → { items: LegacyItem[] }（全量 ≤ 几百条，不分页；默认按 risk.score 降序，再按 seq）
 * GET /api/legacy/summary → LegacySummary
 * GET /api/legacy/export?group=DECAI|...|ALL&open=1 → xlsx（ALL 时每个分组一个 sheet + 汇总 sheet）
 */
export interface LegacySummary {
  total: number;
  open: number;
  groups: (LegacyGroupInfo & {
    total: number;
    open: number;
    highRisk: number;
    byStatus: { status: string; count: number }[];
  })[];
  byStatus: { status: string; count: number }[];
  byBuilding: { building: BuildingCode; total: number; open: number }[];
  radar: LegacyItem[];                     // 高危隐患雷达：未完成且 risk.level = high，按 score 降序，最多 12 条
}

/* ───────────────────────────── 能耗（只读代理 nenghao） ───────────────────────────── */

/*
 * GET /api/energy/overview?start=YYYY-MM-DD&end=YYYY-MM-DD（默认近 30 天）→ EnergyOverview
 * GET /api/energy/buildings?start&end（默认近 30 天）→ { start, end, items: EnergyBuildingRow[] }
 * GET /api/energy/buildings/:code/trend?days=14 → { code, items: { date, kwh }[] }
 * GET /api/energy/heatmap?days=14 → EnergyHeatmap
 * GET /api/energy/insight → EnergyInsight
 * GET /api/energy/circuits → { items: Circuit[], categories: { type: string; count: number; kwh: number | null }[] }
 * GET /api/energy/solar → SolarStatus
 * 后端对 nenghao 的响应做 60s 级缓存；nenghao 不可达时自动回退 mock，并在 Meta.dataMode.energy 标注。
 */
export interface EnergyOverview {
  start: string;
  end: string;
  todayKwh: number | null;                 // 今日截至当前
  yesterdayKwh: number | null;
  realtimeLoadKw: number | null;           // 实时负荷
  monthKwh: number | null;                 // 本月累计
  rangeKwh: number;                        // 区间总电量
  daily: { date: string; kwh: number }[];
  byCategory: { type: string; kwh: number }[]; // 分项（空调暖通/冷热源、照明插座、专项用电…），无数据时 []
}

export interface EnergyBuildingRow {
  building: BuildingCode;
  name: string;
  kwh: number;
  share: number;                           // 占比 0~1
}

export interface EnergyHeatmap {
  days: string[];                          // YYYY-MM-DD
  hours: number[];                         // 0..23
  values: [dayIndex: number, hour: number, kwh: number][];
  peakHours?: number[];                    // 峰时段（如有）
  valleyHours?: number[];                  // 谷时段（如有）
}

export interface EnergyInsight {
  date: string;
  summary: string;                         // 含 <b> 标签的 HTML 片段（前端需白名单渲染，仅允许 <b>）
  points: string[];
  anomaly: 'low' | 'normal' | 'high' | string;
}

export interface Circuit {
  nodeId: string;
  name: string;
  substation: string;
  area: string;
  type: string;                            // 分项
  include: boolean;                        // 是否计入总量
  building: BuildingCode;                  // 由 area/name 推断
  kwh: number | null;                      // 若 nenghao 提供区间电量
}

export interface SolarStatus {
  todayYieldKwh: number | null;
  currentPowerKw: number | null;
  totalYieldMwh: number | null;
  raw: { todayYield?: string; currentPower?: string; totalYield?: string };
}

/* ───────────────────────────── 楼宇全景 ───────────────────────────── */

/*
 * GET /api/buildings/overview → { items: BuildingCard[] }   （B01..B19 + PUBLIC 全部返回）
 * GET /api/buildings/:code     → BuildingDetail
 */
export interface BuildingCard extends BuildingInfo {
  energy: { kwh30d: number | null; yesterdayKwh: number | null; spark: number[] }; // spark：近 14 天日电量
  tickets: { open: number; red: number; yellow: number };
  legacy: { open: number; highRisk: number };
  health: 'good' | 'warn' | 'bad';         // 综合健康度：存在红色超时或高危遗留 → bad；存在黄色或遗留未完成 → warn
}

export interface BuildingDetail {
  building: BuildingInfo;
  energy: {
    kwh30d: number | null;
    yesterdayKwh: number | null;
    trend: { date: string; kwh: number }[];   // 近 30 天
    circuits: Circuit[];                       // 该楼回路
  };
  tickets: {
    stats: RateRow & { red: number; yellow: number };
    open: Ticket[];                            // 未完成，按超时严重度排序，最多 100
    byType: { type: string; open: number; total: number }[];
  };
  legacy: LegacyItem[];                        // 该楼全部遗留（含已完成），按风险排序
}
