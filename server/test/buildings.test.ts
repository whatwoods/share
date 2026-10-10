import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILDINGS, buildingKind, cnToInt, normalizeBuilding } from '../src/buildings';

test('楼栋归一化：数字/后缀/中文/B 编码', () => {
  const cases: [string, string][] = [
    ['1', 'B01'], ['01', 'B01'], ['1号楼', 'B01'], ['1#', 'B01'], ['1#楼', 'B01'], ['1 号楼', 'B01'],
    ['一号楼', 'B01'], ['十一号楼', 'B11'], ['十九号楼', 'B19'], ['十号楼', 'B10'], ['二十号楼', 'UNKNOWN'],
    ['B1', 'B01'], ['B01', 'B01'], ['b12', 'B12'], ['1栋', 'B01'], ['12幢', 'B12'],
    ['1号楼5层', 'B01'], ['19', 'B19'], ['20', 'UNKNOWN'], ['0', 'UNKNOWN'], ['99号楼', 'UNKNOWN'],
    ['2号楼屋顶空调', 'B02'], ['11号楼照明插座', 'B11'],
  ];
  for (const [raw, code] of cases) assert.equal(normalizeBuilding(raw), code, raw);
});

test('楼栋归一化：公区关键词', () => {
  for (const raw of ['公区', '公共区域', '园区', '室外', '地库', '地下车库', '设备用房', '广场', '公区/设备用房', '公区/其他']) {
    assert.equal(normalizeBuilding(raw), 'PUBLIC', raw);
  }
});

test('楼栋归一化：无法识别', () => {
  for (const raw of ['', '  ', '不知道', null, undefined, 'abc']) assert.equal(normalizeBuilding(raw), 'UNKNOWN', String(raw));
});

test('楼栋类型与字典', () => {
  assert.equal(buildingKind('B01'), 'office');
  assert.equal(buildingKind('B11'), 'office');
  assert.equal(buildingKind('B12'), 'apartment');
  assert.equal(buildingKind('B19'), 'apartment');
  assert.equal(buildingKind('PUBLIC'), 'public');
  assert.equal(buildingKind('UNKNOWN'), 'unknown');
  assert.equal(BUILDINGS.length, 20);
  assert.deepEqual(BUILDINGS[0], { code: 'B01', name: '1号楼', short: '1#', kind: 'office' });
  assert.deepEqual(BUILDINGS[19], { code: 'PUBLIC', name: '公区', short: '公区', kind: 'public' });
  assert.equal(cnToInt('十五'), 15);
  assert.equal(cnToInt('二十一'), 21);
});
