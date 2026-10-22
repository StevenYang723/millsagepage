import {loadOriginalGarage, preloadGarage as preloadOriginalGarage} from './assets/immersive/garage-loader.js?v=mobile1';

function sceneId(key) {
  if (key !== 'kanata' && key !== 'hotaru') throw new Error('Unknown garage character');
  return key === 'kanata' ? 40001 : 40002;
}

// Download only: importing this facade does not load Three.js or create WebGL.
export function preloadGarage(key, options = {}) {
  return preloadOriginalGarage(sceneId(key), options);
}

export function loadGarage(container, key, {onCharacter = () => {}, ...options} = {}) {
  return loadOriginalGarage(container, sceneId(key), {
    ...options,
    onCharacter: id => onCharacter(id === 16 ? 'hotaru' : id),
    autoplay: false,
    loop: true,
  });
}
