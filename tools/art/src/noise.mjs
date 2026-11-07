// Repeatable "random" value in [0, 1) for a pixel, so scattered details like
// stones, stars and lit windows land in the same place on every build.
export function pixelNoise(x, y, seed = 0) {
  let hash = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed + 1, 1442695041);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}
