import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../dist/assets/immersive/garage-loader.js', import.meta.url), 'utf8');
const loaderURL = 'https://stevenyang723.github.io/millsagepage/assets/immersive/garage-loader.js';
const scene = (id, count = 8) => ({
  textures: { background: `../shared/t-3720355173770442854-${id === 40001 ? '3e8ebd341ff7' : 'f88b40e63215'}.webp` },
  atlases: {}, hide: [], nodes: Array.from({ length: count }, (_, index) => ({ spine: `s-${index}` })),
});
const response = body => ({ ok: true, status: 200, blob: async () => new Blob([body]) });
function createLoader(fetch) {
  const sandbox = {
    URL, Blob, DOMException, fetch,
    setTimeout: callback => { queueMicrotask(callback); return 1; }, clearTimeout() {},
  };
  // Keep real download/cache code; only browser module metadata is supplied by
  // the harness. An accidental renderer import fails without a VM import hook.
  vm.runInNewContext(source.replace(/\bexport\s+/g, '').replaceAll('import.meta.url', JSON.stringify(loaderURL))
    + '\nglobalThis.loader = {preloadGarage};', sandbox, { filename: 'garage-loader.js' });
  return sandbox.loader;
}

test('preload shares pending requests, limits fetch concurrency, and reports cached completion', async () => {
  const counts = new Map(); let active = 0, peak = 0;
  const loader = createLoader(async url => {
    assert.ok(new URL(url).pathname.startsWith('/millsagepage/'));
    counts.set(url, (counts.get(url) ?? 0) + 1);
    active++; peak = Math.max(peak, active);
    await delay(1);
    active--;
    return response(url.endsWith('scene.json') ? JSON.stringify(scene(40001)) : 'original resource');
  });
  const [first, second] = await Promise.all([loader.preloadGarage(40001), loader.preloadGarage(40001)]);
  assert.equal(first, second);
  assert.equal(peak, 4);
  assert.ok([...counts.values()].every(value => value === 1));
  let lastProgress = -1;
  assert.equal(await loader.preloadGarage(40001, { onProgress: value => { lastProgress = value; } }), first);
  assert.equal(lastProgress, 1);
});

test('cancelling one subscriber does not cancel another pending scene preload', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const loader = createLoader(async url => {
    await gate;
    return response(url.endsWith('scene.json') ? JSON.stringify(scene(40001)) : 'resource');
  });
  const controller = new AbortController();
  const cancelled = loader.preloadGarage(40001, { signal: controller.signal });
  const shared = loader.preloadGarage(40001);
  controller.abort();
  await assert.rejects(cancelled, error => error.name === 'AbortError');
  release();
  assert.equal((await shared).blobs.size, 9);
});

test('failed resource and scene cache entries can be retried without reloading successful assets', async () => {
  let fail = true;
  const counts = new Map();
  const loader = createLoader(async url => {
    counts.set(url, (counts.get(url) ?? 0) + 1);
    if (url.endsWith('s-0.json') && fail) return { ok: false, status: 404 };
    return response(url.endsWith('scene.json') ? JSON.stringify(scene(40001, 2)) : 'resource');
  });
  await assert.rejects(loader.preloadGarage(40001), /404/);
  fail = false;
  assert.equal((await loader.preloadGarage(40001)).blobs.size, 3);
  assert.equal([...counts].find(([url]) => url.endsWith('s-0.json'))[1], 2);
  assert.equal([...counts].find(([url]) => url.endsWith('scene.json'))[1], 1);
});

test('transient failures retry once, and progress callback errors do not break preload', async () => {
  let attempts = 0;
  const loader = createLoader(async url => {
    if (url.endsWith('scene.json')) {
      if (++attempts === 1) return { ok: false, status: 503 };
      return response(JSON.stringify(scene(40001, 0)));
    }
    return response('resource');
  });
  const loaded = await loader.preloadGarage(40001, { onProgress() { throw new Error('bad UI callback'); } });
  assert.equal(loaded.blobs.size, 1);
  assert.equal(attempts, 2);
});

test('both garages reuse their byte-identical background Blob without rewriting original packages', async () => {
  let backgrounds = 0;
  const loader = createLoader(async url => {
    if (url.endsWith('scene.json')) return response(JSON.stringify(scene(url.includes('40001') ? 40001 : 40002, 0)));
    backgrounds++;
    return response('shared original background');
  });
  const [kanata, hotaru] = await Promise.all([loader.preloadGarage(40001), loader.preloadGarage(40002)]);
  assert.equal(backgrounds, 1);
  assert.equal([...kanata.blobs.values()][0], [...hotaru.blobs.values()][0]);
  assert.notEqual(kanata.data.textures.background, hotaru.data.textures.background);
});
