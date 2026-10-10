import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLockedOut, recordFailure } from '../src/auth';

test('登录节流：只统计失败，10 次后锁定，窗口过后解锁', () => {
  const ip = '10.0.0.99';
  const t0 = 1_000_000;
  for (let i = 0; i < 9; i++) recordFailure(ip, t0);
  assert.equal(isLockedOut(ip, t0), false);
  recordFailure(ip, t0);
  assert.equal(isLockedOut(ip, t0), true);
  assert.equal(isLockedOut(ip, t0 + 61_000), false);
});
