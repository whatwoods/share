import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseBuildings,
  parseCircuits,
  parseHeatmap,
  parseInsight,
  parseOverview,
  parseQuantity,
  parseSeries,
  parseSolar,
} from '../src/energy/adapter';
import { mockCircuits, mockDay, mockHeatmap, mockInsight, mockOverview, mockRealtimeLoadKw } from '../src/energy/mock';

test('parseSeries：多种常见形状', () => {
  const expected = [{ date: '2026-09-01', kwh: 10 }, { date: '2026-09-02', kwh: 20 }];
  assert.deepEqual(parseSeries([{ date: '2026-09-01', kwh: 10 }, { date: '2026-09-02', kwh: 20 }]), expected);
  assert.deepEqual(parseSeries([{ day: '2026-09-01', value: '10' }, { day: '2026-09-02', value: 20 }]), expected);
  assert.deepEqual(parseSeries({ dates: ['2026-09-01', '2026-09-02'], values: [10, 20] }), expected);
  assert.deepEqual(parseSeries({ '2026-09-01': 10, '2026-09-02': 20 }), expected);
  assert.deepEqual(parseSeries({ code: 0, data: { daily: [['2026-09-01', 10], ['2026-09-02', 20]] } }), expected);
  assert.deepEqual(parseSeries({ xAxis: { data: ['2026-09-01', '2026-09-02'] }, series: [{ data: [10, 20] }] }), expected);
  // 按小时的记录合并为日
  assert.deepEqual(parseSeries([{ time: '2026-09-01 00', kwh: 4 }, { time: '2026-09-01 01', kwh: 6 }, { time: '2026-09-02 00', kwh: 20 }]), expected);
  assert.equal(parseSeries({ foo: 'bar' }), null);
});

test('parseOverview：总量 + 日序列 + 分项', () => {
  const o = parseOverview({ data: { total: '1,234 kWh', daily: [{ date: '2026-09-01', kwh: 1234 }], categories: { 照明插座: 100, '空调暖通/冷热源': 200 } } });
  assert.equal(o.total, 1234);
  assert.equal(o.daily.length, 1);
  assert.deepEqual(o.byCategory, [{ type: '照明插座', kwh: 100 }, { type: '空调暖通/冷热源', kwh: 200 }]);
  assert.throws(() => parseOverview({ hello: 'world' }));
});

test('parseBuildings：字典 / 数组 / 包一层', () => {
  assert.deepEqual(parseBuildings({ '1号楼': 100, '2号楼': 50, '公区/设备用房': 30, '公区/其他': 5, total: 185 }), { B01: 100, B02: 50, PUBLIC: 35 });
  assert.deepEqual(parseBuildings({ data: [{ name: '11号楼', kwh: 7 }] }), { B11: 7 });
  assert.deepEqual(parseBuildings({ buildings: { 十九号楼: { kwh: 9 } } }), { B19: 9 });
  assert.throws(() => parseBuildings({ foo: 1 }));
});

test('parseHeatmap：三元组 / 矩阵 / 对象数组', () => {
  const days = ['2026-09-01', '2026-09-02'];
  const tri = parseHeatmap({ days, values: [[0, 0, 1], [1, 23, 2]] }, days);
  assert.deepEqual(tri.days, days);
  assert.equal(tri.values.length, 2);
  const matrix = parseHeatmap({ data: { dates: days, matrix: [Array(24).fill(1), Array(24).fill(2)] } }, days);
  assert.equal(matrix.values.length, 48);
  const objs = parseHeatmap([{ date: '2026-09-02', hour: 3, kwh: 5 }], days);
  assert.deepEqual(objs.values, [[0, 3, 5]]);
  const profile = parseHeatmap({ values: Array(24).fill(1), peak_hours: [9, 10] }, days);
  assert.deepEqual(profile.days, ['2026-09-02']);
  assert.deepEqual(profile.peakHours, [9, 10]);
});

test('parseInsight / parseCircuits（真实样例）', () => {
  const ins = parseInsight({ date: '2026-09-03', summary: '昨日总耗<b>41,737 kWh</b>', points: ['a'], anomaly: 'low' });
  assert.deepEqual(ins, { date: '2026-09-03', summary: '昨日总耗<b>41,737 kWh</b>', points: ['a'], anomaly: 'low' });
  const cs = parseCircuits([
    { node_id: '1', name: '1#A1_低压进线总柜', substation: '1#变电所', area: '公区/其他', type: '专项用电', include: 0 },
    { node_id: '35', name: '2#A17-1_1#空调', substation: '2#变电所', area: '2号楼屋顶空调', type: '空调暖通/冷热源', include: 1 },
  ]);
  assert.equal(cs[0]!.building, 'PUBLIC');
  assert.equal(cs[0]!.include, false);
  assert.equal(cs[1]!.building, 'B02');
  assert.equal(cs[1]!.include, true);
  assert.equal(cs[1]!.kwh, null);
});

test('parseSolar：单位换算', () => {
  const s = parseSolar({ todayYield: '1230 kWh', currentPower: '185 kW', totalYield: '45.2 MWh' });
  assert.equal(s.todayYieldKwh, 1230);
  assert.equal(s.currentPowerKw, 185);
  assert.equal(s.totalYieldMwh, 45.2);
  const s2 = parseSolar({ todayYield: '1.5 MWh', currentPower: '18500 W', totalYield: '45200 kWh' });
  assert.equal(s2.todayYieldKwh, 1500);
  assert.equal(s2.currentPowerKw, 18.5);
  assert.equal(s2.totalYieldMwh, 45.2);
  assert.deepEqual(parseQuantity('1,230 kWh'), { value: 1230, unit: 'kwh' });
});

test('mock 能耗：量级与确定性', () => {
  for (const d of ['2026-01-15', '2026-04-15', '2026-07-22', '2026-10-08']) {
    const m = mockDay(d);
    assert.ok(m.total > 28000 && m.total < 52000, `${d} ${m.total}`);
    assert.equal(m.hourly.length, 24);
    assert.ok(m.hourly[10]! > m.hourly[3]!, '白天峰夜间谷');
  }
  const now = Date.parse('2026-10-10T15:00:00+08:00');
  const o = mockOverview('2026-09-10', '2026-10-09', now);
  assert.equal(o.daily.length, 30);
  assert.deepEqual(o, mockOverview('2026-09-10', '2026-10-09', now));
  const load = mockRealtimeLoadKw(now);
  assert.ok(load >= 1200 && load <= 2800);
  assert.equal(mockCircuits(now).length, 476);
  assert.equal(mockHeatmap(['2026-10-08']).values.length, 24);
  const ins = mockInsight(now);
  assert.match(ins.summary, /^昨日总耗<b>[\d,]+ kWh<\/b>，较(工作日|周末)均值(上升|下降)<b>[\d.]+%<\/b>，近30日排名第<b>\d+<\/b>位。$/);
});
