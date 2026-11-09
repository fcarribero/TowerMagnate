type DrawCall = (...args: never[]) => void;

const DRAW_METHODS = [
  'drawElements',
  'drawArrays',
  'drawElementsInstanced',
  'drawArraysInstanced',
] as const;

/**
 * Counts WebGL draw calls on the canvas's existing context. `getContext` returns
 * the context the renderer already made, so the renderer itself is untouched.
 */
export function countDrawCalls(canvas: HTMLCanvasElement): () => number {
  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  let calls = 0;
  if (gl === null) {
    return () => 0;
  }
  const methods = gl as unknown as Record<string, DrawCall | undefined>;
  for (const name of DRAW_METHODS) {
    const original = methods[name];
    if (original === undefined) continue;
    methods[name] = (...args: never[]) => {
      calls += 1;
      original.apply(gl, args);
    };
  }
  return () => {
    const sinceLastRead = calls;
    calls = 0;
    return sinceLastRead;
  };
}
