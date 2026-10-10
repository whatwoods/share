/**
 * 模拟数据（无飞书凭证时使用）。生成的是「飞书原始记录」形态（{record_id, fields}），
 * 与真实数据走同一条规范化/入库链路。
 *
 * 确定性：
 *  - 日常工单按「报修日」逐日用种子随机生成（种子 = 日期），历史记录的内容/ID 不随运行日期漂移；
 *    状态由「随机处理时长」与参考时间（今天 00:00，上海）决定，因此同一天多次生成结果完全一致。
 *  - 专项摸排固定 66 条；施工遗留固定 156 条（DECAI 21 / SCG 14 / QIJU 2 / LEAK 61 / DISPUTE 58）。
 */
import { SPECIAL_CHANNEL, TICKET_TYPES, type TicketType } from '../../../shared/contract';
import type { FeishuRecord } from '../feishu/client';
import { Rng } from '../lib/rng';
import { DAY_MS, HOUR_MS, addDays, dateRange, parseShDate, shDate, shParts, shToMs, weekdayOf } from '../lib/time';

/* ───────────────────────────── 工具 ───────────────────────────── */

const CN_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九'];
const pad2 = (n: number) => String(n).padStart(2, '0');

function isoWithOffset(ms: number): string {
  const p = shParts(ms);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}:00.000+08:00`;
}
function textDateTime(ms: number): string {
  const p = shParts(ms);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** 楼栋原始写法多样化（检验归一化） */
function buildingRawOf(rng: Rng, n: number | 'PUBLIC'): string {
  if (n === 'PUBLIC') return rng.pick(['公区', '公共区域', '地下车库', '室外', '园区', '设备用房', '广场']);
  return rng.weighted<string>([
    [String(n), 70],
    [`${n}号楼`, 12],
    [`${n}#`, 6],
    [pad2(n), 4],
    [`${n}栋`, 3],
    [`${CN_NUM[n]}号楼`, 3],
    [`B${pad2(n)}`, 2],
  ]);
}

/* ───────────────────────────── 日常工单 ───────────────────────────── */

interface TypeTemplate {
  type: TicketType;
  weight: number;
  places: string[];
  issues: string[];
}

const TYPE_TEMPLATES: TypeTemplate[] = [
  {
    type: '强电与照明',
    weight: 22,
    places: ['走廊', '电梯厅', '男卫', '女卫', '办公区', '会议室', '楼梯间', '大堂', '茶水间', '配电间', '后厨', '前台', '地库'],
    issues: [
      '筒灯不亮', '灯管闪烁', '插座无电', '开关面板松动', '配电箱跳闸', '应急照明灯不亮', '感应灯常亮', '灯带不亮',
      '插座烧焦有异味', '空开频繁跳闸', '疏散指示灯不亮', '射灯损坏', '照明回路短路',
    ],
  },
  {
    type: '给排水与洁具',
    weight: 20,
    places: ['男卫', '女卫', '无障碍卫生间', '茶水间', '后厨', '淋浴间', '母婴室', '保洁间'],
    issues: [
      '小便池感应器失灵', '坐便器冲水不止', '蹲坑脚踏板漏水', '洗手台下水堵塞', '水龙头出水小', '地漏返味', '角阀漏水',
      '感应龙头不出水', '坐便盖板损坏', '拖把池堵塞', '小便池下水慢', '热水器不出热水', '冲水阀损坏',
    ],
  },
  {
    type: '门窗五金与幕墙',
    weight: 16,
    places: ['消防通道', '会议室', '办公室', '大堂', '楼梯间', '卫生间隔断', '外立面', '玻璃门', '幕墙'],
    issues: [
      '门禁失灵', '闭门器漏油', '门把手松脱', '地弹簧损坏', '窗户无法关闭', '隔断门锁损坏', '开启扇五金脱落',
      '玻璃门下夹松动', '防火门无法闭合', '推拉窗滑轮损坏', '门吸脱落', '窗户执手断裂',
    ],
  },
  {
    type: '暖通与空调',
    weight: 12,
    places: ['会议室', '办公区', '大堂', '机房', '前台', '多功能厅', '公寓房间'],
    issues: [
      '空调不制冷', '空调冷凝水滴漏', '风口结露滴水', '空调噪音大', '新风机异响', '温控面板失灵', '风机盘管漏水',
      '空调制热效果差', '空调遥控无反应', '排风扇不转',
    ],
  },
  {
    type: '漏水专项防治',
    weight: 9,
    places: ['屋面', '窗台', '地下室顶板', '楼梯间', '吊顶', '外墙', '雨棚', '电梯井'],
    issues: ['渗水', '雨天漏水', '墙面渗漏发霉', '吊顶水渍', '窗边渗漏', '顶板滴水'],
  },
  {
    type: '家具家电',
    weight: 7,
    places: ['办公室', '会议室', '茶水间', '前台', '公寓房间', '休息区'],
    issues: [
      '办公椅损坏', '会议桌桌腿松动', '冰箱不制冷', '微波炉无法加热', '电热水壶损坏', '窗帘轨道脱落', '柜门合页脱落',
      '饮水机漏水', '沙发皮面破损', '洗衣机不脱水',
    ],
  },
  {
    type: '特种设备与专项维保',
    weight: 6,
    places: ['客梯', '货梯', '消防栓', '喷淋系统', '烟感', '扶梯', '水泵房', '发电机房', '消防控制室'],
    issues: ['困人', '门反复开关', '箱体漏水', '喷淋头渗水', '误报', '异响', '主机故障报警', '运行抖动'],
  },
  {
    type: '土建修补与其他',
    weight: 8,
    places: ['墙面', '地面', '踢脚线', '吊顶', '楼梯踏步', '外墙涂料', '停车位', '卫生间'],
    issues: ['瓷砖空鼓', '墙皮脱落', '地砖破损', '吊顶板脱落', '踏步防滑条松动', '石材开裂', '墙面裂缝', '地面起砂'],
  },
];

const CHANNELS: [string, number][] = [
  ['捷途智汇', 36],
  ['微信报修', 34],
  ['安环巡查', 12],
  ['电话报修', 11],
  ['前台登记', 7],
];

const PEOPLE = ['王建国', '李晓梅', '张伟', '刘洋', '陈静', '杨帆', '赵磊', '黄丽', '周杰', '吴敏', '徐强', '孙婷', '钱小兵', '马超', '朱琳'];
const UNITS_FOR_REMARK = ['物业工程部', '德才', '上海建工', '七局', '维保单位', '中建'];
const PLANS = ['更换配件', '现场调试', '已维修', '更换感应器', '疏通管道', '重新打胶', '待采购配件', '物业已处理', '联系厂家上门'];
const FREE_REMARKS = [
  '上海建工', '德才 已通知', '已更换配件', '需采购配件，预计三天', '七局负责', '已电话回访，用户满意', '维保已到场',
  '中建项目部处理中', '重复报修', '夜间值班处理',
];

/** 随机处理时长（小时） */
function resolutionHours(rng: Rng): number {
  const bucket = rng.weighted<[number, number]>([
    [[1, 24], 58],
    [[24, 96], 24],
    [[96, 360], 13.5],
    [[360, 1080], 1.8],
    [[1080, 2160], 0.3],
  ]);
  return rng.float(bucket[0], bucket[1]);
}

const DAILY_START = '2025-08-01';
/** 密度增长周期（天）与缩放：校准为 2026-10 前后总量约 4,736 条 */
const RAMP_DAYS = 435;
const DENSITY_SCALE = 1.18;

interface DraftTicket {
  id: string;
  ts: number;
  buildingRaw: string;
  floor: string;
  description: string;
  type: string;
  channel: string;
  remark: string;
  resolveH: number;
  uPending: number;
  isFacade: boolean;
  isoText: boolean;
}

function draftTicket(rng: Rng, date: string): DraftTicket {
  const day = parseShDate(date)!;
  const hour = rng.weighted<number>([
    [7, 3], [8, 9], [9, 13], [10, 13], [11, 10], [12, 5], [13, 8], [14, 11], [15, 10], [16, 9], [17, 6], [18, 3],
    [19, 2], [20, 2], [21, 1], [22, 1], [6, 1],
  ]);
  const ts = day + hour * HOUR_MS + rng.int(0, 59) * 60_000;

  const tpl = rng.weighted(TYPE_TEMPLATES.map((t) => [t, t.weight] as const));
  const bNo = rng.weighted<number | 'PUBLIC'>([
    ...Array.from({ length: 11 }, (_, i) => [i + 1, i === 0 || i === 6 || i === 8 ? 9 : 6.5] as const),
    ...Array.from({ length: 8 }, (_, i) => [i + 12, 2.6] as const),
    ['PUBLIC', 6] as const,
  ]);
  const maxFloor = bNo === 'PUBLIC' ? 1 : bNo <= 11 ? 12 : 18;
  const floorNo = rng.int(1, maxFloor);
  const floor = bNo === 'PUBLIC' ? rng.pick(['1', 'B1', '室外']) : rng.chance(0.04) ? 'B1' : String(floorNo);
  const place = rng.pick(tpl.places);
  const issue = rng.pick(tpl.issues);
  const prefixKind = rng.weighted<string>([['none', 45], ['full', 30], ['F', 10], ['floor', 15]]);
  let prefix = '';
  if (bNo !== 'PUBLIC') {
    if (prefixKind === 'full') prefix = `${bNo}号楼${floor === 'B1' ? 'B1' : `${floor}层`}`;
    else if (prefixKind === 'F') prefix = `${bNo}号楼${floor === 'B1' ? 'B1' : `${floor}F`}`;
    else if (prefixKind === 'floor' && floor !== 'B1') prefix = `${floor}楼`;
  } else {
    prefix = rng.pick(['园区', '地库', '广场', '']);
  }
  const description = `${prefix}${place}${issue}`;

  let type: string = tpl.type;
  const odd = rng.next();
  if (odd < 0.002) type = '保洁服务';
  else if (odd < 0.003) type = '其他';

  const channel = rng.weighted(CHANNELS);
  const remarkKind = rng.weighted<string>([['struct', 35], ['free', 30], ['none', 35]]);
  let remark = '';
  if (remarkKind === 'struct') {
    const parts = [`责任单位: ${rng.pick(UNITS_FOR_REMARK)}`, `报修人: ${rng.pick(PEOPLE)}`, `方案: ${rng.pick(PLANS)}`];
    if (rng.chance(0.4)) parts.push(`[FP:${rng.id(10).toLowerCase()}]`);
    remark = parts.join(' | ');
  } else if (remarkKind === 'free') {
    remark = rng.pick(FREE_REMARKS);
  }

  return {
    id: `rec${rng.id(11)}`,
    ts,
    buildingRaw: buildingRawOf(rng, bNo),
    floor,
    description,
    type,
    channel,
    remark,
    // 幕墙/外立面类处理周期明显更长（需吊篮、定制玻璃等）
    resolveH: resolutionHours(rng) * (/外立面|幕墙/.test(place) ? 3 : 1),
    uPending: rng.next(),
    isFacade: /外立面|幕墙/.test(place),
    isoText: rng.chance(0.1),
  };
}

function statusOf(d: DraftTicket, ref: number): string {
  if (d.ts + d.resolveH * HOUR_MS <= ref) return '已完成';
  if (d.isFacade && d.type === '门窗五金与幕墙') return '幕墙专项';
  const ageH = (ref - d.ts) / HOUR_MS;
  return d.uPending < (ageH < 72 ? 0.6 : 0.12) ? '待处理' : '跟进中';
}

function toFeishu(d: DraftTicket, status: string): FeishuRecord {
  return {
    record_id: d.id,
    fields: {
      问题描述: d.description,
      楼栋: d.buildingRaw,
      楼层: d.floor,
      工单类型: [d.type],
      工单状态: [status],
      报修渠道: [d.channel],
      报修时间: d.isoText ? isoWithOffset(d.ts) : d.ts,
      ...(d.remark ? { 备注: d.remark } : {}),
    },
  };
}

function dayCount(rng: Rng, date: string): number {
  const startMs = parseShDate(DAILY_START)!;
  const progress = Math.min(1, (parseShDate(date)! - startMs) / DAY_MS / RAMP_DAYS);
  const wd = weekdayOf(date);
  const wf = wd === 0 || wd === 6 ? 0.55 : 1;
  const expected = (6 + 9 * progress) * wf * DENSITY_SCALE;
  return Math.max(0, Math.round(expected + rng.normal(0, 1.6)));
}

/* 专项摸排：固定 66 条，2026-09 */
const SPECIAL_COUNT = 66;
const SPECIAL_SCENES = ['西餐厅', '中餐厅', '大堂', '多功能厅', '健身房', '会议中心', '地下车库', '屋顶机房', '配电房', '员工食堂', '公寓大堂'];
const SPECIAL_ISSUES: [string, TicketType][] = [
  ['室内消防栓漏水，消防设施尚在完善中', '特种设备与专项维保'],
  ['喷淋末端试水阀渗漏', '特种设备与专项维保'],
  ['排烟风机无法联动启动', '特种设备与专项维保'],
  ['电梯底坑积水', '特种设备与专项维保'],
  ['吊顶内水管保温层破损结露滴水', '漏水专项防治'],
  ['外窗密封胶开裂，雨天渗水', '漏水专项防治'],
  ['配电箱未接地，存在漏电隐患', '强电与照明'],
  ['应急照明回路不通', '强电与照明'],
  ['隔油池满溢，排水不畅', '给排水与洁具'],
  ['卫生间排污立管接口渗漏', '给排水与洁具'],
  ['风管软连接破损漏风', '暖通与空调'],
  ['防火门闭门器缺失', '门窗五金与幕墙'],
];

function generateSpecial(ref: number): FeishuRecord[] {
  const rng = new Rng('special-survey-2026-09');
  const out: FeishuRecord[] = [];
  for (let i = 1; i <= SPECIAL_COUNT; i++) {
    const dayNo = rng.int(1, 28);
    const ts = shToMs(2026, 9, dayNo, rng.int(9, 17), rng.pick([0, 15, 30, 45]));
    const bNo = rng.chance(0.85) ? rng.int(1, 19) : ('PUBLIC' as const);
    const floor = bNo === 'PUBLIC' ? 'B1' : String(rng.int(1, 6));
    const [issue, type] = rng.pick(SPECIAL_ISSUES);
    const scene = rng.pick(SPECIAL_SCENES);
    const resolveH = rng.float(24, 24 * 26);
    const u = rng.next();
    const status = ts + resolveH * HOUR_MS <= ref ? '已完成' : u < 0.15 ? '待处理' : '跟进中';
    const unit = rng.pick(['德才', '上海建工', '七局', '物业', '维保单位']);
    const plan = rng.pick(['物业已处理', '施工方整改', '维保单位处理', '待定方案', '已报价待审批']);
    out.push({
      record_id: `rec_special_${String(i).padStart(3, '0')}`,
      fields: {
        楼栋: bNo === 'PUBLIC' ? '公区' : String(bNo),
        楼层: floor,
        问题描述: `【${floor}楼 ${scene}现场】${issue}`,
        工单类型: [type],
        工单状态: [status],
        报修渠道: [SPECIAL_CHANNEL],
        报修时间: isoWithOffset(ts),
        备注: `责任单位: ${unit} | 报修人: ${rng.pick(PEOPLE)} | 方案: ${plan} | [FP:${rng.id(10).toLowerCase()}]`,
      },
    });
  }
  return out;
}

/**
 * 生成日常维修总表的全部模拟记录（2025-08-01 至昨天 + 66 条专项摸排）。
 * @param nowMs 当前时间；只取其上海日期，因此同一天内结果一致
 */
export function generateDailyRecords(nowMs: number): FeishuRecord[] {
  const todayStr = shDate(nowMs);
  const ref = parseShDate(todayStr)!;
  const end = addDays(todayStr, -1);
  const out: FeishuRecord[] = [];
  const seen = new Set<string>();
  for (const date of dateRange(DAILY_START, end)) {
    const rng = new Rng(`daily:${date}`);
    const n = dayCount(rng, date);
    for (let i = 0; i < n; i++) {
      const d = draftTicket(rng, date);
      while (seen.has(d.id)) d.id += 'x';
      seen.add(d.id);
      out.push(toFeishu(d, statusOf(d, ref)));
    }
  }
  out.push(...generateSpecial(ref).filter((r) => (r.fields['报修时间'] as string) < isoWithOffset(ref)));
  return out;
}

/* ───────────────────────────── 施工遗留 156 条 ───────────────────────────── */

interface LegacyFeatured {
  building: string;
  floor: string;
  type: string;
  description: string;
  date: string; // "YYYY-MM-DD HH:mm" 或 ""
  status: string;
  progress: string;
  unit?: string;
}

interface LegacySpec {
  source: string;
  count: number;
  seqStart: number;
  units: string[];
  statuses: [string, number][];
  /** [问题描述片段（部位+现象）, 工单类型] */
  templates: [string, string][];
  emptyDateRate: number;
  featured: LegacyFeatured[];
}

const PROGRESS_BY_STATUS: Record<string, string[]> = {
  重复漏水: ['注浆后仍有渗漏，需重新打胶', '雨后复查仍渗水，已通知施工方二次处理', '第三次返修，建议整体重做防水层'],
  计划逾期: ['原定 9 月底前完成，至今未进场', '施工方承诺两周内整改，已逾期', '整改计划已过期，已发催办函'],
  有争议: ['施工方认为属使用不当，物业不认可', '工程院核价中，责任主体待明确', '新安已报价，等待甲方确认责任方', '设计与施工互相推诿，待甲方协调'],
  观察中: ['已处理，观察两场雨', '已更换，观察一周', '已封堵，持续观察'],
  已完成: ['已整改完成并验收', '复查无渗漏，已销项', '已更换并通过联合验收'],
  跟进中: ['已进场，材料到货后施工', '施工方已出整改方案', '已搭设脚手架，正在处理'],
  未处理: ['已发函，施工方未回复', '待施工方排期', '已拍照取证，待移交施工方'],
};

const cross = (places: string[], issues: string[], type: string): [string, string][] =>
  places.flatMap((p) => issues.map((i) => [`${p}${i}`, type] as [string, string]));

const LEGACY_SPECS: LegacySpec[] = [
  {
    source: '德才维修工单',
    count: 21,
    seqStart: 1,
    units: ['德才'],
    statuses: [['已完成', 30], ['跟进中', 25], ['未处理', 15], ['计划逾期', 18], ['观察中', 12]],
    templates: [
      ['卫生间地面空鼓', '土建/装修'],
      ['楼梯间防火门变形无法闭合', '门窗'],
      ['走廊吊顶板脱落', '土建/装修'],
      ['卫生间给水管接头渗水', '给排水'],
      ['配电间配电箱接线松动发热', '强电'],
      ['车库消防喷淋管锈蚀渗水', '消防'],
      ['卫生间地漏倒坡积水', '给排水'],
      ['楼梯栏杆松动', '土建/装修'],
      ['后厨排水沟堵塞', '给排水'],
      ['包厢墙面开裂', '土建/装修'],
      ['设备平台防腐层脱落', '土建/装修'],
    ],
    emptyDateRate: 0.05,
    featured: [
      { building: '9', floor: '1', type: '给排水', description: '9号楼后厨下水排污管堵塞返水', date: '2026-05-12 10:30', status: '计划逾期', progress: '原定 9 月底前更换排污管，未按期实施；后厨每周返水 2~3 次' },
      { building: '3', floor: '1', type: '强电', description: '3号楼1层配电间漏电保护器频繁跳闸', date: '2026-08-03 14:00', status: '跟进中', progress: '德才已排查回路，待更换电缆' },
    ],
  },
  {
    source: '上海建工维修工单',
    count: 14,
    seqStart: 22,
    units: ['上海建工'],
    statuses: [['已完成', 30], ['跟进中', 30], ['未处理', 15], ['计划逾期', 15], ['观察中', 10]],
    templates: [
      ['幕墙打胶开裂', '幕墙/外立面'],
      ['外窗密封条脱落', '门窗'],
      ['大堂地面石材松动', '土建/装修'],
      ['外立面装饰条松动', '幕墙/外立面'],
      ['雨棚排水不畅', '给排水'],
      ['外墙涂料大面积脱落', '土建/装修'],
      ['屋面设备基础开裂', '土建/装修'],
    ],
    emptyDateRate: 0.05,
    featured: [
      { building: '1', floor: '5', type: '幕墙/外立面', description: '1号楼南立面高空大玻璃破碎', date: '2026-04-18 08:40', status: '跟进中', progress: '已拉警戒线，玻璃定制周期约 30 天，待吊篮施工' },
    ],
  },
  {
    source: '漏水清单',
    count: 61,
    seqStart: 36,
    units: ['上海建工', '德才', '七局'],
    statuses: [['重复漏水', 20], ['观察中', 25], ['已完成', 25], ['跟进中', 15], ['计划逾期', 8], ['未处理', 7]],
    templates: cross(
      ['地下室顶板', '屋面', '外墙', '窗台', '雨棚', '楼梯间', '卫生间沉箱', '电梯井道', '地库坡道', '女儿墙', '幕墙接缝'],
      ['渗漏', '漏水', '雨天渗水', '墙面渗水发霉', '吊顶水渍', '滴水'],
      '漏水专项',
    ),
    emptyDateRate: 0.05,
    featured: [
      { building: '1', floor: '1', type: '漏水专项', description: '1号楼南面雨棚大厅漏水', date: '2026-07-01 09:00', status: '重复漏水', progress: '注浆后仍有渗漏，需外立面重新打胶', unit: '上海建工' },
      { building: '地下车库', floor: 'B1', type: '漏水专项', description: '地下室顶板渗漏，车位上方持续滴水', date: '2025-12-08 09:30', status: '计划逾期', progress: '计划 8 月完成顶板注浆，未实施', unit: '七局' },
      { building: '8', floor: '屋面', type: '漏水专项', description: '8号楼屋面防水重复漏水', date: '2026-03-21 16:00', status: '重复漏水', progress: '第三次返修，建议整体重做防水层', unit: '德才' },
    ],
  },
  {
    source: '有争议工单',
    count: 58,
    seqStart: 97,
    units: ['有争议/待定责'],
    statuses: [['有争议', 60], ['跟进中', 14], ['未处理', 11], ['已完成', 10], ['计划逾期', 5]],
    templates: [
      ['外立面装饰条脱落', '争议/工程缺陷'],
      ['幕墙玻璃自爆', '争议/工程缺陷'],
      ['包厢吊顶开裂', '争议/工程缺陷'],
      ['大堂石材松动', '争议/工程缺陷'],
      ['后厨隔油池溢流', '争议/工程缺陷'],
      ['电缆桥架积水', '争议/工程缺陷'],
      ['地下室墙面渗水', '争议/工程缺陷'],
      ['设备平台基础开裂', '争议/工程缺陷'],
      ['排烟风机无法启动', '争议/工程缺陷'],
      ['门禁系统未完成联调', '争议/工程缺陷'],
      ['雨棚玻璃破碎', '争议/工程缺陷'],
      ['屋面排水沟积水', '争议/工程缺陷'],
      ['地坪开裂起砂', '争议/工程缺陷'],
      ['卫生间隔断板变形', '争议/工程缺陷'],
    ],
    emptyDateRate: 0.25,
    featured: [
      { building: '6', floor: '3', type: '争议/工程缺陷', description: '6号楼外立面幕墙开启扇脱落，存在高空坠物风险', date: '2026-06-02 11:00', status: '有争议', progress: '施工方认为属使用不当，物业不认可' },
      { building: '1', floor: '2', type: '争议/工程缺陷', description: '202包厢外立面玻璃破碎缺失未安装', date: '', status: '有争议', progress: '新安已报价，工程院核价中，责任主体待明确' },
    ],
  },
  {
    source: '七局维修工单',
    count: 2,
    seqStart: 155,
    units: ['七局'],
    statuses: [['跟进中', 1]],
    templates: [],
    emptyDateRate: 0,
    featured: [
      { building: '15', floor: '1', type: '强电', description: '15号楼配电间漏电跳闸', date: '2026-08-20 10:00', status: '跟进中', progress: '七局已排查，疑似电缆绝缘破损' },
      { building: '17', floor: 'B1', type: '给排水', description: '17号楼地库排水沟堵塞返水', date: '2026-06-15 15:30', status: '观察中', progress: '已疏通，观察雨季排水情况' },
    ],
  },
];

/** 施工遗留 156 条（与运行日期无关，完全固定） */
export function generateLegacyRecords(): FeishuRecord[] {
  const rng = new Rng('legacy-items-v1');
  const out: FeishuRecord[] = [];
  const minTs = shToMs(2025, 9, 1);
  const maxTs = shToMs(2026, 9, 25);
  for (const spec of LEGACY_SPECS) {
    for (let i = 0; i < spec.count; i++) {
      const seq = spec.seqStart + i;
      // 典型硬骨头放在最前面（LEAK 序号 36 / DISPUTE 序号 98 与真实样例一致）
      let f: LegacyFeatured | undefined;
      if (spec.source === '有争议工单') f = i === 1 ? spec.featured[1] : i === 5 ? spec.featured[0] : undefined;
      else f = spec.featured[i];

      const unit = f?.unit ?? rng.pick(spec.units);
      let item: LegacyFeatured;
      if (f) {
        item = f;
      } else {
        const bNo = rng.int(1, 19);
        const floor = rng.chance(0.1) ? 'B1' : String(rng.int(1, bNo <= 11 ? 12 : 18));
        const [frag, type] = rng.pick(spec.templates);
        const status = rng.weighted(spec.statuses);
        const ts = minTs + Math.floor(rng.next() * (maxTs - minTs));
        item = {
          building: rng.chance(0.85) ? String(bNo) : `${bNo}号楼`,
          floor,
          type,
          description: `${bNo}号楼${floor === 'B1' ? 'B1' : `${floor}层`}${frag}`,
          date: rng.chance(spec.emptyDateRate) ? '' : textDateTime(Math.floor(ts / 60_000 / 30) * 30 * 60_000),
          status,
          progress: rng.pick(PROGRESS_BY_STATUS[status] ?? ['跟进中']),
        };
      }
      out.push({
        record_id: `recLg${rng.id(9)}${String(seq).padStart(3, '0')}`,
        fields: {
          序号: seq,
          来源表: [spec.source],
          责任单位: [unit],
          楼栋: item.building,
          楼层: item.floor,
          工单类型: [item.type],
          问题描述: item.description,
          报修时间: item.date,
          当前状态: [item.status],
          进展与备注: [item.progress],
        },
      });
    }
  }
  return out;
}
