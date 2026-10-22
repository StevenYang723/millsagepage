// Keep quality choices stable across rotations so a scene never has to reload.
export function getPerformanceProfile({coarsePointer = false, width = 1280, height = 720, dpr = 1, deviceMemory = 8} = {}) {
  const mobile = width <= 700 || (coarsePointer && Math.min(width, height) < 1024) || deviceMemory <= 4;
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return Object.freeze({
    mobile,
    portraitPixelRatio: Math.min(ratio, mobile ? 1.25 : 1.5),
    effectPixelRatio: Math.min(ratio, mobile ? 1.25 : 2),
    maxPixelRatio: Math.min(ratio, mobile ? 1.25 : 2),
    portraitFrameInterval: mobile ? 1000 / 30 : 0,
    featherCount: mobile ? 44 : 110,
    glassColumns: mobile ? 5 : 10,
    glassRows: mobile ? 8 : 12,
    warpRings: mobile ? 12 : 36,
    maxCachedGarages: mobile ? 1 : 2,
  });
}
