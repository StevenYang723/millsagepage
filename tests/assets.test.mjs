import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dist = new URL('../dist/', import.meta.url);
const baseline = JSON.parse(await readFile(new URL('./original-assets.json', import.meta.url), 'utf8'));
const json = async url => JSON.parse(await readFile(url, 'utf8'));
async function walk(dir) {
  const results = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    if (entry.isDirectory()) results.push(...await walk(url)); else results.push(url);
  }
  return results;
}

test('all 242 original game assets remain byte-for-byte unchanged', async () => {
  assert.equal(baseline.files.length, 242);
  for (const entry of baseline.files) {
    const bytes = await readFile(new URL(entry.path, dist));
    assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, entry.path);
  }
});

test('both Live2D manifests and garage scene references resolve locally', async () => {
  for (const key of ['kanata', 'hotaru']) {
    const root = new URL(`assets/${key}/`, dist);
    const manifest = await json(new URL('manifest.json', root));
    const model = await json(new URL(manifest.model, root));
    for (const asset of manifest.resources) {
      const bytes = await readFile(new URL(asset.file, root));
      assert.equal(bytes.length, asset.bytes, asset.file);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, asset.file);
    }
    const references = model.FileReferences;
    const modelPaths = [references.Moc, references.Physics, ...references.Textures,
      ...references.Expressions.map(item => item.File),
      ...Object.values(references.Motions).flat().map(item => item.File)];
    for (const path of modelPaths) assert.ok((await stat(new URL(path, root))).size > 0, path);
  }
  for (const id of [40001, 40002]) {
    const root = new URL(`assets/immersive/scene-${id}-v1/`, dist);
    const scene = await json(new URL('scene.json', root));
    const paths = new Set([...Object.values(scene.textures), ...Object.values(scene.atlases).map(a => a.file),
      ...scene.nodes.filter(n => n.spine).map(n => n.spine + (n.spineFormat === 'binary' ? '.skel' : '.json'))]);
    for (const path of paths) assert.ok((await stat(new URL(path, root))).size > 0, path);
    // Original garage animation entry points must still exist in the skeleton data.
    const animations = new Set();
    for (const path of paths) if (path.endsWith('.json')) {
      for (const animation of Object.keys((await json(new URL(path, root))).animations ?? {})) animations.add(animation);
    }
    assert.ok(animations.has('home_start'), `scene ${id} keeps home_start`);
  }
});

test('module and page resources work under the GitHub Pages repository prefix', async () => {
  const publicRoot = new URL('https://stevenyang723.github.io/millsagepage/');
  const resolveAsset = async (specifier, moduleURL) => {
    if (!specifier.startsWith('.')) return;
    const local = new URL(specifier, moduleURL);
    assert.ok(fileURLToPath(local).startsWith(fileURLToPath(dist)), `resource inside dist: ${specifier}`);
    assert.ok((await stat(local)).isFile(), `${moduleURL.pathname}: ${specifier}`);
    const relativeModule = moduleURL.href.slice(dist.href.length);
    const deployed = new URL(specifier, new URL(relativeModule, publicRoot));
    assert.ok(deployed.pathname.startsWith('/millsagepage/'), deployed.href);
  };
  for (const url of await walk(dist)) {
    if (!url.pathname.endsWith('.js')) continue;
    const source = await readFile(url, 'utf8');
    for (const match of source.matchAll(/(?:from\s*|import\s*(?:\(\s*)?)["'](\.[^"']+)["']/g)) {
      await resolveAsset(match[1], url);
    }
  }
  const index = await readFile(new URL('index.html', dist), 'utf8');
  for (const match of index.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const path = match[1];
    if (/^(?:https?:|#|data:)/.test(path)) continue;
    const deployed = new URL(path, publicRoot);
    assert.ok(deployed.pathname.startsWith('/millsagepage/'), deployed.href);
    assert.ok((await stat(new URL(path, dist))).isFile(), path);
  }
});
