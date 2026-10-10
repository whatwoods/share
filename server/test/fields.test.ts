import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toDate, toNumber, toText } from '../src/feishu/fields';

test('toText：各种飞书字段形态', () => {
  assert.equal(toText('  abc '), 'abc');
  assert.equal(toText(36), '36');
  assert.equal(toText(null), '');
  assert.equal(toText(['已完成']), '已完成');
  assert.equal(toText(['德才', '上海建工']), '德才/上海建工');
  assert.equal(toText([{ text: '注浆后', type: 'text' }, { text: '仍渗漏', type: 'text' }]), '注浆后仍渗漏');
  assert.equal(toText({ text: '链接', link: 'https://x' }), '链接');
  assert.equal(toText([{ name: '张三', id: 'ou_1' }, { name: '李四' }]), '张三/李四');
  assert.equal(toText({ en_name: 'Tom' }), 'Tom');
  assert.equal(toText({ type: 1, value: [{ text: '公式', type: 'text' }] }), '公式');
  assert.equal(toText([]), '');
});

test('toDate：时间戳 / ISO / 无时区文本（按 +08:00）', () => {
  const iso = Date.parse('2025-11-01T07:37:00+08:00');
  assert.equal(toDate('2025-11-01T07:37:00.000+08:00'), iso);
  assert.equal(toDate(iso), iso);
  assert.equal(toDate(String(iso)), iso);
  assert.equal(toDate(iso / 1000), iso);
  assert.equal(toDate('2026-07-06 08:51'), Date.parse('2026-07-06T08:51:00+08:00'));
  assert.equal(toDate('2026/07/06'), Date.parse('2026-07-06T00:00:00+08:00'));
  assert.equal(toDate('2026-09-10 08'), Date.parse('2026-09-10T08:00:00+08:00'));
  assert.equal(toDate('2026年7月6日'), Date.parse('2026-07-06T00:00:00+08:00'));
  assert.equal(toDate('2026-07-06T00:51:00Z'), Date.parse('2026-07-06T00:51:00Z'));
  assert.equal(toDate(''), null);
  assert.equal(toDate(null), null);
  assert.equal(toDate('无'), null);
});

test('toNumber', () => {
  assert.equal(toNumber(36), 36);
  assert.equal(toNumber('1,234.5'), 1234.5);
  assert.equal(toNumber(''), null);
});
