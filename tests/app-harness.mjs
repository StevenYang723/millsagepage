import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Execute the real interaction code with deterministic time. Canvas/WebGL are
// boundary stubs; these tests cover scheduling and resource lifetime, not pixels.
export async function appHarness({ mobile = true, failLoad = false } = {}) {
  let now = 0, nextID = 1, failing = failLoad;
  const raf = new Map(), timers = new Map(), nodes = new Map(), events = [], listeners = new Map(), portraitFrames = [];
  const context2D = new Proxy({}, { get: (target, key) => key in target ? target[key] : () => {}, set: (target, key, value) => (target[key] = value, true) });
  const makeNode = name => ({
    name, style: {}, dataset: {}, children: [], attributes: {}, open: false,
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener() {}, removeEventListener() {}, focus() {},
    append(child) { child.parent = this; this.children.push(child); },
    appendChild(child) { this.append(child); return child; },
    remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); },
    querySelector(selector) { return selector === 'canvas' ? this.canvas ?? makeNode('canvas') : null; },
    getContext() { return context2D; }, getBoundingClientRect() { return { left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844 }; },
    showModal() { this.open = true; }, close() { this.open = false; },
  });
  const $ = selector => {
    if (!nodes.has(selector)) nodes.set(selector, makeNode(selector));
    return nodes.get(selector);
  };
  const document = {
    body: makeNode('body'), documentElement: makeNode('html'), hidden: false,
    querySelector: $, createElement: makeNode,
    querySelectorAll(selector) { return selector === '.choice' ? [$ ('#choose-kanata'), $('#choose-hotaru')] : selector === '.portrait' ? [$('#kanata-panel'), $('#hotaru-panel')] : []; },
    addEventListener() {}, removeEventListener() {},
  };
  let api;
  const sandbox = {
    console: { ...console, error: error => events.push({ type: 'error', error }) },
    document, innerWidth: mobile ? 390 : 1440, innerHeight: mobile ? 844 : 900, devicePixelRatio: mobile ? 3 : 1,
    navigator: { deviceMemory: mobile ? 4 : 16, connection: { saveData: true } },
    location: { href: 'https://stevenyang723.github.io/millsagepage/', reload() {} },
    URL, AbortController, Math, performance: { now: () => now },
    matchMedia: query => ({ matches: query.includes('coarse') && mobile, addEventListener() {} }),
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    requestAnimationFrame(callback) { const id = nextID++; raf.set(id, callback); return id; },
    cancelAnimationFrame(id) { raf.delete(id); },
    setTimeout(callback, delay = 0) { const id = nextID++; timers.set(id, { callback, due: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    preloadGarage: async (key, options) => { events.push({ type: 'preload', key, time: now }); options?.onProgress?.(1); },
    loadGarage: async (element, key, options) => {
      events.push({ type: 'load', key, time: now, whiteout: Number($('#whiteout').style.opacity), mode: api.state.mode });
      if (failing) throw new Error('simulated initialization failure');
      const viewer = {
        disposed: false, paused: true,
        setPaused(value) { this.paused = value; events.push({ type: 'pause', key, value, time: now }); },
        replay() { events.push({ type: 'replay', key, time: now }); },
        dispose() { this.disposed = true; events.push({ type: 'dispose', key, time: now }); },
      };
      element.canvas = makeNode('canvas');
      viewer.options = options;
      return viewer;
    },
    prepareLive2DPlayer: async () => { throw new Error('init is intentionally not run in state tests'); },
  };
  sandbox.window = sandbox;
  const profileSource = await readFile(new URL('../dist/performance.js', import.meta.url), 'utf8');
  vm.runInNewContext(profileSource.replace(/export\s+/g, '') + '\nglobalThis.profileFunction = getPerformanceProfile;', sandbox);
  sandbox.getPerformanceProfile = sandbox.profileFunction;
  let source = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
  source = source.replace(/^import\s+.*?;\s*$/gm, '').replace(/\binit\(\);\s*$/, '');
  vm.runInNewContext(source + '\nglobalThis.api = {enter, returnHome, state, portraits, garages, mode, updatePause};', sandbox, { filename: 'app.js' });
  api = sandbox.api;
  api.mode('home');
  let portraitDraws = 0;
  for (const key of ['kanata', 'hotaru']) api.portraits[key] = { fit() {}, model: { pivot: {}, scale: { y: 1 } }, render(dt) { portraitDraws++; portraitFrames.push({ key, dt }); } };
  async function step(delta = 20) {
    now += delta;
    const callbacks = [...raf.values()]; raf.clear();
    for (const callback of callbacks) callback(now);
    for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.callback(); }
    // Drain await continuations that schedule the next animation frame.
    for (let n = 0; n < 8; n++) await Promise.resolve();
  }
  async function finish(promise, maxFrames = 500) {
    let done = false, error;
    promise.then(() => { done = true; }, reason => { done = true; error = reason; });
    for (let frame = 0; !done && frame < maxFrames; frame++) await step();
    if (!done) throw new Error('interaction did not settle within simulated 10 seconds');
    if (error) throw error;
  }
  function resize(width, height) {
    sandbox.innerWidth = width;
    sandbox.innerHeight = height;
    for (const listener of listeners.get('resize') ?? []) listener({ type: 'resize' });
  }
  return { api, document, $, events, step, finish, resize, portraitFrames, get portraitDraws() { return portraitDraws; }, failLoad(value) { failing = value; } };
}
