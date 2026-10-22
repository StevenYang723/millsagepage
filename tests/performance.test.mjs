import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../dist/performance.js', import.meta.url), 'utf8');
const { getPerformanceProfile } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('phone render buffers are bounded on a high DPR display in both orientations', () => {
  const portrait = getPerformanceProfile({ coarsePointer: true, width: 390, height: 844, dpr: 3 });
  const landscape = getPerformanceProfile({ coarsePointer: true, width: 844, height: 390, dpr: 3 });
  assert.deepEqual(landscape, portrait);
  assert.equal(portrait.mobile, true);
  for (const ratio of [portrait.portraitPixelRatio, portrait.effectPixelRatio, portrait.maxPixelRatio]) {
    assert.ok(ratio <= 1.25 && ratio > 0);
    assert.ok(ratio ** 2 < 3 ** 2 / 4, 'render buffer pixel count is less than one quarter of raw DPR 3');
  }
  assert.equal(portrait.maxCachedGarages, 1);
});

test('low memory devices choose bounded rendering; desktop retains its higher quality', () => {
  const limited = getPerformanceProfile({ deviceMemory: 4, width: 1920, height: 1080, dpr: 2 });
  const desktop = getPerformanceProfile({ deviceMemory: 16, width: 1920, height: 1080, dpr: 2 });
  assert.equal(limited.mobile, true);
  assert.equal(desktop.mobile, false);
  assert.equal(desktop.maxCachedGarages, 2);
  assert.ok(limited.maxPixelRatio < desktop.maxPixelRatio);
  assert.ok(limited.featherCount < desktop.featherCount);
  assert.ok(limited.glassRows * limited.glassColumns < desktop.glassRows * desktop.glassColumns);
  assert.ok(limited.warpRings < desktop.warpRings);
});

test('invalid device pixel ratios cannot produce empty or infinite render buffers', () => {
  for (const dpr of [0, -1, NaN, Infinity]) {
    const profile = getPerformanceProfile({ dpr });
    assert.equal(profile.portraitPixelRatio, 1);
    assert.equal(profile.effectPixelRatio, 1);
    assert.equal(profile.maxPixelRatio, 1);
  }
});

test('narrow browsers use the mobile budget even without pointer capability reporting', () => {
  const profile = getPerformanceProfile({ width: 390, height: 844, coarsePointer: false, dpr: 3 });
  assert.equal(profile.mobile, true);
  assert.equal(profile.maxCachedGarages, 1);
});
