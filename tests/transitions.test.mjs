import test from 'node:test';
import assert from 'node:assert/strict';
import { appHarness } from './app-harness.mjs';

for (const key of ['kanata', 'hotaru']) test(`${key}: download overlaps effects, scene initialization waits until the whiteout`, async () => {
  const app = await appHarness();
  await app.step();
  const homeDraws = app.portraitDraws;
  const entering = app.api.enter(key);
  await app.api.enter(key); // A second tap must not create another scene.
  for (let frame = 0; frame < 30; frame++) await app.step();
  assert.ok(app.events.some(event => event.type === 'preload' && event.key === key));
  assert.equal(app.events.filter(event => event.type === 'load').length, 0, 'no heavy initialization during feather/glass effects');
  assert.equal(app.portraitDraws, homeDraws, 'home models are frozen during the transition');
  await app.finish(entering);
  const loads = app.events.filter(event => event.type === 'load');
  assert.equal(loads.length, 1);
  assert.equal(loads[0].whiteout, 1, 'scene initializes behind the opaque overlay');
  assert.equal(loads[0].mode, 'transition');
  assert.equal(app.api.state.mode, 'garage');
  assert.equal(app.api.garages[key].viewer.paused, false);
  const returning = app.api.returnHome();
  assert.equal(app.api.garages[key].viewer.paused, true, 'garage stops rendering before the warp begins');
  await app.finish(returning);
  assert.equal(app.api.state.mode, 'home');
  assert.equal(app.api.state.busy, false);
  await app.step(40);
  assert.ok(app.portraitDraws > homeDraws, 'home animation resumes after returning');
});

test('mobile keeps one garage and releases the old viewer before constructing the other', async () => {
  const app = await appHarness();
  await app.finish(app.api.enter('kanata'));
  const kanata = app.api.garages.kanata.viewer;
  await app.finish(app.api.returnHome());
  await app.finish(app.api.enter('hotaru'));
  assert.equal(kanata.disposed, true);
  assert.deepEqual(Object.keys(app.api.garages), ['hotaru']);
  const disposal = app.events.findIndex(event => event.type === 'dispose' && event.key === 'kanata');
  const construction = app.events.findIndex(event => event.type === 'load' && event.key === 'hotaru');
  assert.ok(disposal >= 0 && disposal < construction, 'old GPU resources are released before new allocation');
  assert.equal(app.$('#scene').children.length, 1);
});

test('failed initialization removes its container, restores home, and allows retry', async () => {
  const app = await appHarness({ failLoad: true });
  await app.finish(app.api.enter('kanata'));
  assert.equal(app.api.state.mode, 'home');
  assert.equal(app.api.state.busy, false);
  assert.equal(app.$('#scene').children.length, 0);
  assert.equal(Object.keys(app.api.garages).length, 0);
  app.failLoad(false);
  await app.finish(app.api.enter('kanata'));
  assert.equal(app.api.state.mode, 'garage');
  assert.equal(app.$('#scene').children.length, 1);
});

test('user pause survives scene entry and the return transition', async () => {
  const app = await appHarness();
  app.api.state.paused = true;
  app.api.updatePause();
  await app.finish(app.api.enter('hotaru'));
  assert.equal(app.api.garages.hotaru.viewer.paused, true);
  await app.finish(app.api.returnHome());
  assert.equal(app.api.state.paused, true);
});

test('rotation during an effect repaints each frozen portrait once, then resumes freezing until return', async () => {
  const app = await appHarness();
  await app.step();
  const entering = app.api.enter('kanata');
  for (let frame = 0; frame < 25; frame++) await app.step();
  const beforeResize = app.portraitDraws;
  app.resize(844, 390);
  await app.step();
  assert.equal(app.portraitDraws, beforeResize + 2);
  assert.deepEqual(app.portraitFrames.slice(beforeResize), [{ key: 'kanata', dt: 0 }, { key: 'hotaru', dt: 0 }]);
  for (let frame = 0; frame < 30; frame++) await app.step();
  assert.equal(app.portraitDraws, beforeResize + 2, 'resize does not restart the portrait animation loops');
  await app.finish(entering);
  assert.equal(app.portraitDraws, beforeResize + 2, 'portraits remain frozen throughout scene initialization');
  await app.finish(app.api.returnHome());
  await app.step(40);
  assert.ok(app.portraitDraws > beforeResize + 2, 'portrait animation resumes after returning home');
});
