import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const renderer = await readFile(new URL('../dist/assets/immersive/immersive-renderer.js', import.meta.url), 'utf8');
const start = renderer.indexOf('async function decodeGarageBackground(blob) {');
const end = renderer.indexOf('\nasync function Rb(', start);
assert.ok(start >= 0 && end > start, 'standalone decoder helper can be tested without loading WebGL');
const helper = renderer.slice(start, end);

function decoderHarness({ bitmap, width = 4096, height = 4096, imageError = false, missingContext = false } = {}) {
  const created = [], revoked = [], images = [], draws = [];
  const canvas = { width: 0, height: 0, getContext: () => missingContext ? null : { drawImage: (...args) => draws.push(args) } };
  class Image {
    constructor() { this.naturalWidth = width; this.naturalHeight = height; images.push(this); }
    set src(value) {
      this.currentSource = value;
      if (value) queueMicrotask(() => imageError ? this.onerror?.() : this.onload?.());
    }
    get src() { return this.currentSource; }
  }
  const sandbox = {
    Image,
    URL: {
      createObjectURL(blob) { created.push(blob); return 'blob:test-original-background'; },
      revokeObjectURL(url) { revoked.push(url); },
    },
    document: { createElement(tag) { assert.equal(tag, 'canvas'); return canvas; } },
  };
  if (bitmap) sandbox.createImageBitmap = bitmap;
  vm.runInNewContext(helper + '\nglobalThis.decode = decodeGarageBackground;', sandbox);
  return { decode: sandbox.decode, canvas, created, revoked, images, draws };
}

test('ImageBitmap decoder requests resized, flipped pixels suitable for the Three texture', async () => {
  const blob = new Blob(['original background']);
  const result = { width: 2048, height: 2048, close() { throw new Error('in-use bitmap must stay open'); } };
  const decoder = decoderHarness({ bitmap: async (input, options) => {
    assert.equal(input, blob);
    assert.deepEqual({ ...options }, {
      resizeWidth: 2048, resizeHeight: 2048, resizeQuality: 'high',
      imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none',
    });
    return result;
  } });
  assert.equal(await decoder.decode(blob), result);
  assert.equal(decoder.created.length, 0);
  assert.equal(decoder.images.length, 0);
});

test('a browser ignoring bitmap resize releases the large bitmap and uses the canvas fallback', async () => {
  let closed = 0;
  const decoder = decoderHarness({ bitmap: async () => ({ width: 4096, height: 4096, close() { closed++; } }) });
  assert.equal(await decoder.decode(new Blob(['background'])), decoder.canvas);
  assert.equal(closed, 1);
  assert.equal(decoder.canvas.width, 2048);
  assert.equal(decoder.canvas.height, 2048);
  assert.equal(decoder.draws.length, 1);
  assert.deepEqual(decoder.draws[0].slice(1), [0, 0, 2048, 2048]);
  assert.deepEqual(decoder.revoked, ['blob:test-original-background']);
  assert.equal(decoder.images[0].src, '');
  assert.equal(decoder.images[0].onload, null);
  assert.equal(decoder.images[0].onerror, null);
});

test('missing bitmap support preserves aspect ratio, bounds size, and never upscales the fallback', async () => {
  for (const [width, height, expectedWidth, expectedHeight] of [[4096, 2048, 2048, 1024], [1024, 512, 1024, 512]]) {
    const decoder = decoderHarness({ width, height });
    const canvas = await decoder.decode(new Blob(['background']));
    assert.equal(canvas.width, expectedWidth);
    assert.equal(canvas.height, expectedHeight);
    assert.ok(Math.max(canvas.width, canvas.height) <= 2048);
    assert.deepEqual(decoder.revoked, ['blob:test-original-background']);
  }
});

test('unsupported bitmap options fall back successfully to the image decoder', async () => {
  const decoder = decoderHarness({ bitmap: async () => { throw new TypeError('unsupported resize options'); } });
  assert.equal(await decoder.decode(new Blob(['background'])), decoder.canvas);
  assert.equal(decoder.canvas.width, 2048);
  assert.equal(decoder.revoked.length, 1);
});

test('image decode and canvas allocation failures reject and release their object URL', async () => {
  for (const options of [{ imageError: true }, { missingContext: true }]) {
    const decoder = decoderHarness(options);
    await assert.rejects(decoder.decode(new Blob(['background'])), /garage-background-(?:decode-failed|canvas-unavailable)/);
    assert.deepEqual(decoder.revoked, ['blob:test-original-background']);
    assert.equal(decoder.images[0].src, '');
    assert.equal(decoder.images[0].onload, null);
    assert.equal(decoder.images[0].onerror, null);
  }
});
