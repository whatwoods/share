import assert from 'node:assert/strict';
import { test } from 'node:test';
import { legacyGroupOf, riskLevel, scoreRisk, summarizeLegacy, toLegacyItem } from '../src/domain/legacy';
import { generateLegacyRecords } from '../src/mock/seed';
import { normalizeLegacy } from '../src/sync/normalize';

const NOW = Date.parse('2026-10-10T12:00:00+08:00');

test('Legacy 分组：来源表优先，责任单位兜底', () => {
  assert.equal(legacyGroupOf('德才维修工单', ''), 'DECAI');
  assert.equal(legacyGroupOf('上海建工维修工单', '德才'), 'SCG');
  assert.equal(legacyGroupOf('中建七局维修工单', ''), 'QIJU');
  assert.equal(legacyGroupOf('七局', ''), 'QIJU');
  assert.equal(legacyGroupOf('漏水清单', '上海建工'), 'LEAK');
  assert.equal(legacyGroupOf('有争议工单', ''), 'DISPUTE');
  assert.equal(legacyGroupOf('', '德才'), 'DECAI');
  assert.equal(legacyGroupOf('其他表', '上海建工'), 'SCG');
  assert.equal(legacyGroupOf('', '有争议/待定责'), 'DISPUTE');
  assert.equal(legacyGroupOf('', '待定责'), 'DISPUTE');
  assert.equal(legacyGroupOf('', ''), 'OTHER');
  assert.equal(legacyGroupOf('巡检表', '新安'), 'OTHER');
});

test('Mock 遗留数据：分组数量精确为 21/14/2/61/58（共 156）', () => {
  const items = generateLegacyRecords().map(normalizeLegacy);
  const count = (g: string) => items.filter((i) => i.group === g).length;
  assert.equal(items.length, 156);
  assert.equal(count('DECAI'), 21);
  assert.equal(count('SCG'), 14);
  assert.equal(count('QIJU'), 2);
  assert.equal(count('LEAK'), 61);
  assert.equal(count('DISPUTE'), 58);
  assert.equal(count('OTHER'), 0);
  // 样例记录：序号 36 / 98
  const s36 = items.find((i) => i.seq === 36)!;
  assert.equal(s36.description, '1号楼南面雨棚大厅漏水');
  assert.equal(s36.reportedTs, Date.parse('2026-07-01T09:00:00+08:00'));
  const s98 = items.find((i) => i.seq === 98)!;
  assert.equal(s98.description, '202包厢外立面玻璃破碎缺失未安装');
  assert.equal(s98.reportedTs, null);
  assert.equal(s98.unit, '有争议/待定责');
  // 确定性
  assert.deepEqual(generateLegacyRecords(), generateLegacyRecords());
});

test('风险评分：高空坠物/外立面玻璃/责任未定 → high', () => {
  const r = scoreRisk({
    description: '202包厢外立面玻璃破碎缺失未安装',
    status: '有争议',
    group: 'DISPUTE',
    unit: '有争议/待定责',
    ageDays: null,
  });
  assert.equal(r.level, 'high');
  assert.ok(r.score >= 70 && r.score <= 100);
  for (const tag of ['外立面玻璃', '有争议', '责任未定']) assert.ok(r.tags.includes(tag), tag);

  const g = scoreRisk({ description: '1号楼南立面高空大玻璃破碎', status: '未处理', group: 'SCG', unit: '上海建工', ageDays: 10 });
  assert.ok(g.tags.includes('高空坠物') && g.tags.includes('外立面玻璃'));
  assert.equal(g.level, 'high');
});

test('风险评分：排污堵塞 + 计划逾期 + 挂账时长', () => {
  const r = scoreRisk({ description: '9号楼后厨下水排污管堵塞返水', status: '计划逾期', group: 'DECAI', unit: '德才', ageDays: 200 });
  assert.ok(r.tags.includes('排污堵塞'));
  assert.ok(r.tags.includes('计划逾期'));
  assert.ok(r.tags.includes('挂账超180天'));
  assert.equal(r.level, 'high');
  const r2 = scoreRisk({ description: '9号楼后厨下水排污管堵塞返水', status: '计划逾期', group: 'DECAI', unit: '德才', ageDays: 100 });
  assert.ok(r2.tags.includes('挂账超90天'));
  assert.ok(r2.score < r.score);
});

test('风险评分：渗漏 + 重复漏水 → medium；观察中较低；已完成归零', () => {
  const leak = scoreRisk({ description: '屋面漏水', status: '重复漏水', group: 'LEAK', unit: '德才', ageDays: 30 });
  assert.equal(leak.level, 'medium');
  assert.ok(leak.tags.includes('重复漏水') && leak.tags.includes('渗漏'));
  const obs = scoreRisk({ description: '屋面漏水', status: '观察中', group: 'LEAK', unit: '德才', ageDays: 30 });
  assert.equal(obs.level, 'low');
  assert.ok(obs.score < leak.score);
  const done = scoreRisk({ description: '外立面玻璃破碎 高空坠物', status: '已完成', group: 'SCG', unit: '上海建工', ageDays: 400 });
  assert.equal(done.score, 0);
  assert.equal(done.level, 'low');
  assert.equal(riskLevel(70), 'high');
  assert.equal(riskLevel(69), 'medium');
  assert.equal(riskLevel(40), 'medium');
  assert.equal(riskLevel(39), 'low');
});

test('消防 / 用电安全 标签', () => {
  assert.ok(scoreRisk({ description: '配电箱漏电跳闸', status: '未处理', group: 'QIJU', unit: '七局', ageDays: 1 }).tags.includes('用电安全'));
  assert.ok(scoreRisk({ description: '消防栓箱门无法开启', status: '未处理', group: 'DECAI', unit: '德才', ageDays: 1 }).tags.includes('消防'));
});

test('Legacy 汇总：分组/雷达', () => {
  const items = generateLegacyRecords().map(normalizeLegacy).map((r) => toLegacyItem(r, NOW));
  const s = summarizeLegacy(items);
  assert.equal(s.total, 156);
  assert.equal(s.groups.length, 6);
  assert.deepEqual(
    s.groups.map((g) => g.total),
    [21, 14, 2, 61, 58, 0],
  );
  assert.ok(s.radar.length > 0 && s.radar.length <= 12);
  assert.ok(s.radar.every((r) => r.isOpen && r.risk.level === 'high'));
  for (let i = 1; i < s.radar.length; i++) assert.ok(s.radar[i - 1]!.risk.score >= s.radar[i]!.risk.score);
  assert.equal(s.open, items.filter((i) => i.status !== '已完成').length);
});
