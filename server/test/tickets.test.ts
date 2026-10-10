import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Ticket } from '../../shared/contract';
import {
  boardColumn,
  buildBoard,
  computeTicketStats,
  overdueLevel,
  parseRemark,
  toTicket,
  type TicketRecord,
} from '../src/domain/tickets';

const HOUR = 3600_000;
const NOW = Date.parse('2026-10-10T12:00:00+08:00');

function rec(p: Partial<TicketRecord>): TicketRecord {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    building: 'B01',
    buildingRaw: '1',
    floor: '1',
    description: '测试',
    type: '强电与照明',
    status: '已完成',
    channel: '微信报修',
    reportedTs: NOW - 10 * HOUR,
    remark: '',
    ...p,
  };
}

test('备注解析：结构化键值 + 指纹', () => {
  const r = parseRemark('责任单位: 德才 | 报修人: 钱小兵 | 方案: 物业已处理 | [FP:6d5377ef52]');
  assert.deepEqual(r, { unit: '德才', reporter: '钱小兵', plan: '物业已处理', fingerprint: '6d5377ef52' });
});

test('备注解析：全角冒号、未知键进 extra', () => {
  const r = parseRemark('责任单位：上海建工｜楼管：王五 | 方案：更换');
  assert.equal(r.unit, '上海建工');
  assert.equal(r.plan, '更换');
  assert.deepEqual(r.extra, { 楼管: '王五' });
});

test('备注解析：自由文本识别单位', () => {
  assert.deepEqual(parseRemark('上海建工'), { unit: '上海建工' });
  assert.equal(parseRemark('德才 已通知').unit, '德才');
  assert.equal(parseRemark('中建七局负责').unit, '七局');
  assert.equal(parseRemark('维保已到场').unit, '维保');
  assert.deepEqual(parseRemark('已电话回访'), {});
  assert.deepEqual(parseRemark(''), {});
});

test('看板列映射', () => {
  assert.equal(boardColumn('已完成'), '已完成');
  assert.equal(boardColumn('待处理'), '待处理');
  assert.equal(boardColumn('跟进中'), '跟进中');
  assert.equal(boardColumn('幕墙专项'), '跟进中');
  assert.equal(boardColumn('其它'), '跟进中');
});

test('超时等级：待处理 24h/72h，跟进中 7d/15d', () => {
  assert.equal(overdueLevel('待处理', 23), 'none');
  assert.equal(overdueLevel('待处理', 25), 'yellow');
  assert.equal(overdueLevel('待处理', 73), 'red');
  assert.equal(overdueLevel('跟进中', 24 * 7 - 1), 'none');
  assert.equal(overdueLevel('跟进中', 24 * 7 + 1), 'yellow');
  assert.equal(overdueLevel('跟进中', 24 * 15 + 1), 'red');
  assert.equal(overdueLevel('已完成', 9999), 'none');
  assert.equal(overdueLevel('待处理', null), 'none');
  // 幕墙专项按跟进中阈值
  const t = toTicket(rec({ status: '幕墙专项', reportedTs: NOW - 24 * 10 * HOUR }), NOW);
  assert.equal(t.column, '跟进中');
  assert.equal(t.overdue, 'yellow');
  assert.equal(t.ageHours, 240);
  assert.equal(t.reportedAt, '2026-09-30T12:00:00+08:00');
  // 报修时间为空 → none
  assert.equal(toTicket(rec({ status: '待处理', reportedTs: null }), NOW).overdue, 'none');
});

test('工种：8 大类给出责任主体，未知类型保留原值且 owner=null', () => {
  assert.equal(toTicket(rec({ type: '暖通与空调' }), NOW).owner, '维保单位');
  const t = toTicket(rec({ type: '保洁服务' }), NOW);
  assert.equal(t.type, '保洁服务');
  assert.equal(t.owner, null);
});

function sample(): Ticket[] {
  return [
    rec({ status: '已完成' }),
    rec({ status: '已完成', channel: '专项摸排' }),
    rec({ status: '待处理', reportedTs: NOW - 80 * HOUR }), // red
    rec({ status: '待处理', reportedTs: NOW - 30 * HOUR, channel: '专项摸排' }), // yellow, special
    rec({ status: '跟进中', reportedTs: NOW - 200 * HOUR, type: '暖通与空调', building: 'B12' }), // yellow
    rec({ status: '已完成', type: '其他' }),
  ].map((r) => toTicket(r, NOW));
}

test('闭环率统计 + excludeSpecial', () => {
  const all = computeTicketStats(sample(), { now: NOW, excludeSpecial: false });
  assert.equal(all.summary.total, 6);
  assert.equal(all.summary.closed, 3);
  assert.equal(all.summary.open, 3);
  assert.equal(all.summary.rate, 0.5);
  assert.equal(all.summary.red, 1);
  assert.equal(all.summary.yellow, 2);
  assert.equal(all.summary.special, 2);

  const ex = computeTicketStats(sample(), { now: NOW, excludeSpecial: true });
  assert.equal(ex.summary.total, 4);
  assert.equal(ex.summary.closed, 2);
  assert.equal(ex.summary.rate, 0.5);
  assert.equal(ex.summary.yellow, 1);
  assert.equal(ex.summary.special, 2, 'special 始终返回原始专项数');
  assert.equal(ex.byChannel.find((c) => c.channel === '专项摸排'), undefined);

  // byType：8 大类固定顺序，未知类型追加
  assert.equal(ex.byType.length, 9);
  assert.equal(ex.byType[0]!.type, '强电与照明');
  assert.equal(ex.byType[8]!.type, '其他');
  assert.equal(ex.byType[8]!.owner, null);
  const hvac = ex.byType.find((t) => t.type === '暖通与空调')!;
  assert.deepEqual([hvac.total, hvac.closed, hvac.open, hvac.rate], [1, 0, 1, 0]);
  // byOwner 固定 4 组
  assert.deepEqual(ex.byOwner.map((o) => o.owner), ['物业工程', '维保单位', '施工单位', '供应商']);
  // byBuilding：20 个标准楼栋
  assert.equal(ex.byBuilding.length, 20);
  assert.equal(ex.byBuilding.find((b) => b.building === 'B12')!.yellow, 1);
  // 月/日序列
  assert.equal(ex.byMonth.length, 12);
  assert.equal(ex.byMonth[11]!.month, '2026-10');
  assert.equal(ex.byDay.length, 30);
  assert.equal(ex.byDay[29]!.date, '2026-10-10');
  assert.ok(ex.summary.avgOpenAgeHours !== null);
});

test('统计：空集 rate=0；from 约束月份', () => {
  const s = computeTicketStats([], { now: NOW, excludeSpecial: false, from: '2026-08-15' });
  assert.equal(s.summary.rate, 0);
  assert.equal(s.summary.avgOpenAgeHours, null);
  assert.deepEqual(s.byMonth.map((m) => m.month), ['2026-08', '2026-09', '2026-10']);
});

test('看板：按超时严重度排序', () => {
  const b = buildBoard(sample());
  assert.deepEqual(b.columns.map((c) => c.column), ['待处理', '跟进中', '已完成']);
  assert.equal(b.columns[0]!.items[0]!.overdue, 'red');
  assert.deepEqual(b.overdue, { red: 1, yellow: 2 });
  assert.equal(b.columns[2]!.count, 3);
});
