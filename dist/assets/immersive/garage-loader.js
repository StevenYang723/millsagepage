/* Original BanG Dream! Our Notes scene data from the Otonote public archive.
 * Scene renderer: https://github.com/stonesver/otonote (MIT).
 * Game artwork/animation: © BanG Dream! Project © FROMTOKYO © bushiroad.
 */
import { createImmersiveScene } from './immersive-renderer.js';

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

export async function preloadGarage(id, { signal, onProgress = () => {} } = {}) {
  if (!GARAGE_PROFILES[id]) throw new Error('Unknown garage scene');
  if (packages.has(id)) return packages.get(id);
  const task = (async () => {
    const root = new URL(`./scene-${id}-v1/`, import.meta.url);
    const response = await fetch(new URL('scene.json', root), { signal });
    if (!response.ok) throw new Error(`Scene ${id}: ${response.status}`);
    const data = await response.json();
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
    await Promise.all(paths.map(async path => {
      const asset = await fetch(new URL(path, root), { signal });
      if (!asset.ok) throw new Error(`Scene asset ${path}: ${asset.status}`);
      blobs.set(path, await asset.blob());
      onProgress(++completed / paths.length);
    }));
    return { data, blobs };
  })();
  packages.set(id, task);
  try { return await task; } catch (error) { packages.delete(id); throw error; }
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
} = {}) {
  const scenePackage = await preloadGarage(id, { signal, onProgress });
  let viewer;
  let timer;
  let disposed = false;
  let paused = !autoplay;
  viewer = await createImmersiveScene(container, scenePackage, {
    signal,
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
