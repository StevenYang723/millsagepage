/* Original BanG Dream! Our Notes scene data from the Otonote public archive.
 * Scene renderer: https://github.com/stonesver/otonote (MIT).
 * Game artwork/animation: © BanG Dream! Project © FROMTOKYO © bushiroad.
 */
export const GARAGE_PROFILES = {
  40001: {
    id: 40001,
    camera: { fov: 19, start: [0, 0, -.25], end: [-.07508563, -.06757707, -1.35511524], target: [.2, .18000001, -5], duration: 1, ease: 9 },
    background: { node: '2182986174622085987', position: [.2540000081062317, -1.1920000314712524, -.10199999809265137], rotation: [346.639404296875, 2.784221649169922, 359.35614013671875], scale: [1, 1, 1] },
    characters: [
      { id: 18, name: '琴平凪', nodes: ['868326619055406742', '1360848168646295190', '5970541047390289558'] },
      { id: 19, name: '浜崎まほろ', nodes: ['-2092295391364694378'] },
      { id: 17, name: '伊沢なつめ', nodes: ['-3874095198253531498', '1759126748010200726', '4911315021687438998'] },
      { id: 20, name: '和泉朋花', nodes: ['-6607661049252790634'] },
      { id: 'scene-kanata', name: '沢海奏多', nodes: ['-2928270408347271530'] },
    ],
    partitions: {},
  },
  40002: {
    id: 40002,
    camera: { fov: 19, start: [0, 0, 2], end: [-.06228022, -.0560522, -.80351647], target: [.2, .18000001, -5], duration: 1, ease: 9 },
    background: { node: '2182986174622085987', position: [-.4830000102519989, -.09700000286102295, -.08699999749660492], rotation: [355.945556640625, 12.88735580444336, 357.9314270019531], scale: [1, 1, 1] },
    characters: [
      { id: 16, name: '汐見蛍', nodes: ['7189176687324822199', '8721061916726983351'] },
      { id: 18, name: '琴平凪', nodes: ['-5151838086195774793', '-4743213977540101449', '6682122740752579255'] },
      { id: 19, name: '浜崎まほろ', nodes: ['-1738620962990130505', '-1607792596276348233', '-854855776040650057'] },
      { id: 17, name: '伊沢なつめ', nodes: ['-4836386112057115977'] },
      { id: 20, name: '和泉朋花', nodes: ['-7091362065458857289', '3303579550360992439', '6293801066302339767'] },
    ],
    partitions: {},
  },
};

const packages = new Map();
const assetRequests = new Map();

// These two archive paths are byte-identical (SHA-256 checked). Share the URL
// and compressed Blob across garages while retaining the original scene JSON.
const sharedBackground = new URL('./shared/t-3720355173770442854-3e8ebd341ff7.webp', import.meta.url).href;
const duplicateBackground = new URL('./shared/t-3720355173770442854-f88b40e63215.webp', import.meta.url).href;
function canonicalURL(url) {
  return url.href === duplicateBackground ? sharedBackground : url.href;
}

function requestBlob(url) {
  const key = canonicalURL(url);
  if (!assetRequests.has(key)) {
    const task = (async () => {
      // A shared request survives a single subscriber cancelling. This keeps
      // simultaneous prefetch / entry requests from cancelling one another.
      for (let attempt = 0; ; attempt++) {
        try {
          const response = await fetch(key);
          if (!response.ok) {
            const error = new Error(`Garage asset: ${response.status} ${url.pathname}`);
            error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
            throw error;
          }
          return await response.blob();
        } catch (error) {
          if (attempt >= 1 || error.retryable === false) throw error;
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      }
    })();
    assetRequests.set(key, task);
    task.catch(() => { if (assetRequests.get(key) === task) assetRequests.delete(key); });
  }
  return assetRequests.get(key);
}

function report(listener, progress) {
  try { listener(progress); } catch { /* UI callbacks cannot break the cache. */ }
}

function subscribe(entry, {signal, onProgress = () => {}}) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const progress = value => report(onProgress, value);
    const finish = (callback, value) => {
      entry.listeners.delete(progress);
      signal?.removeEventListener('abort', abort);
      callback(value);
    };
    const abort = () => finish(reject, signal.reason ?? new DOMException('Aborted', 'AbortError'));
    entry.listeners.add(progress);
    signal?.addEventListener('abort', abort, {once: true});
    progress(entry.progress);
    entry.task.then(value => finish(resolve, value), error => finish(reject, error));
  });
}

export async function preloadGarage(id, { signal, onProgress = () => {} } = {}) {
  signal?.throwIfAborted();
  if (!GARAGE_PROFILES[id]) throw new Error('Unknown garage scene');
  id = Number(id);
  if (packages.has(id)) return subscribe(packages.get(id), {signal, onProgress});
  const entry = {listeners: new Set(), progress: 0, task: null};
  const update = value => {
    entry.progress = value;
    for (const listener of entry.listeners) listener(value);
  };
  entry.task = (async () => {
    const root = new URL(`./scene-${id}-v1/`, import.meta.url);
    const data = JSON.parse(await (await requestBlob(new URL('scene.json', root))).text());
    if (Number(id) === 40002) {
      // This export inherits the Kanata prefab's active flags, but the Hotaru
      // scene hides its three combined meshes and uses individual room meshes.
      // Restore those original meshes using this scene's own visibility mask.
      const hidden = new Set(data.hide);
      for (const node of data.nodes) {
        if (node.mesh && !node.spine) node.active = !hidden.has(node.gameObjectId);
      }
    }
    const paths = [...new Set([
      ...Object.values(data.textures),
      ...Object.values(data.atlases).map(atlas => atlas.file),
      ...data.nodes.filter(node => node.spine).map(node => `${node.spine}.${node.spineFormat === 'binary' ? 'skel' : 'json'}`),
    ])];
    const blobs = new Map();
    let completed = 0;
    // Bound download concurrency; a second entry reuses the same pending task.
    const queue = paths.slice();
    await Promise.all(Array.from({length: Math.min(4, paths.length)}, async () => {
      while (queue.length) {
        const path = queue.shift();
        blobs.set(path, await requestBlob(new URL(path, root)));
        update(++completed / paths.length);
      }
    }));
    update(1);
    return { data, blobs };
  })();
  packages.set(id, entry);
  entry.task.catch(() => { if (packages.get(id) === entry) packages.delete(id); });
  return subscribe(entry, {signal, onProgress});
}

/** container must have a nonzero CSS width and height (recommended 16:9). */
export async function loadOriginalGarage(container, id, {
  signal,
  onCharacter = () => {},
  onError = () => {},
  onProgress = () => {},
  onTime = () => {},
  autoplay = true,
  loop = true,
  pauseBetweenLoops = 1800,
  mobile = false,
  maxPixelRatio = mobile ? 1.25 : 2,
} = {}) {
  const scenePackage = await preloadGarage(id, { signal, onProgress });
  signal?.throwIfAborted();
  // Defer parsing the renderer and uploading textures until the caller has
  // finished its transition and hidden the portrait renderers.
  const { createImmersiveScene } = await import('./immersive-renderer.js?v=mobile1');
  signal?.throwIfAborted();
  let viewer;
  let timer;
  let disposed = false;
  let paused = !autoplay;
  viewer = await createImmersiveScene(container, scenePackage, {
    signal,
    mobile,
    maxPixelRatio,
    profile: GARAGE_PROFILES[id],
    onCharacter,
    onError,
    onTime(time, status) {
      onTime(time, status);
      if (!disposed && !paused && loop && !status.playing && !timer) {
        timer = setTimeout(() => {
          timer = null;
          if (!disposed && !paused) viewer.replay();
        }, pauseBetweenLoops);
      }
    },
  });
  const dispose = viewer.dispose.bind(viewer);
  const setPaused = viewer.setPaused.bind(viewer);
  viewer.setPaused = value => {
    paused = Boolean(value);
    if (paused) { clearTimeout(timer); timer = null; }
    setPaused(paused);
    if (!paused && loop && viewer.finished) viewer.replay();
  };
  viewer.dispose = () => { disposed = true; clearTimeout(timer); dispose(); };
  if (autoplay) viewer.replay();
  return viewer;
}
