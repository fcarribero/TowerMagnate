import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { HIGHEST_LEVEL, WORLD_WIDTH, levelToIndex, levelTop } from './levels';
import { FLOOR_HEIGHT } from './metrics';
import type { SkyTime } from './timeOfDay';

/** Colour behind the sky, so any gap matches the time of day. */
export const SKY_BACKGROUND: Record<SkyTime, string> = {
  day: '#6f9fd8',
  dusk: '#e0875a',
  night: '#23305e',
};

type Rgb = readonly [number, number, number];
interface Stop {
  /** 0 at the ground, 1 at the top of the tower. */
  at: number;
  color: Rgb;
}

/** Sky colour by altitude: pale at the horizon, deeper higher up, black at the edge of space. */
export const SKY_STOPS: Record<SkyTime, readonly Stop[]> = {
  day: [
    { at: 0, color: [196, 224, 245] },
    { at: 0.06, color: [170, 208, 240] },
    { at: 0.2, color: [120, 176, 230] },
    { at: 0.42, color: [70, 128, 205] },
    { at: 0.65, color: [30, 68, 144] },
    { at: 0.85, color: [8, 20, 56] },
    { at: 1, color: [0, 0, 6] },
  ],
  dusk: [
    { at: 0, color: [250, 196, 130] },
    { at: 0.05, color: [240, 150, 104] },
    { at: 0.18, color: [200, 110, 118] },
    { at: 0.38, color: [114, 84, 144] },
    { at: 0.62, color: [46, 48, 108] },
    { at: 0.85, color: [10, 14, 40] },
    { at: 1, color: [0, 0, 6] },
  ],
  night: [
    { at: 0, color: [58, 72, 116] },
    { at: 0.1, color: [40, 54, 98] },
    { at: 0.3, color: [24, 34, 74] },
    { at: 0.6, color: [12, 18, 46] },
    { at: 0.85, color: [5, 8, 26] },
    { at: 1, color: [0, 0, 5] },
  ],
};

/** The colour of the sky at an altitude from 0 (ground) to 1 (top of the tower). */
export function skyColorAt(altitude: number, time: SkyTime): Rgb {
  const stops = SKY_STOPS[time];
  const clamped = Math.min(Math.max(altitude, 0), 1);
  for (let i = 1; i < stops.length; i += 1) {
    const upper = stops[i];
    const lower = stops[i - 1];
    if (upper !== undefined && lower !== undefined && clamped <= upper.at) {
      const k = (clamped - lower.at) / (upper.at - lower.at);
      return [0, 1, 2].map((c) =>
        Math.round((lower.color[c] ?? 0) + ((upper.color[c] ?? 0) - (lower.color[c] ?? 0)) * k),
      ) as unknown as Rgb;
    }
  }
  return stops[stops.length - 1]?.color ?? [0, 0, 0];
}

const GRADIENT_STEPS = 512;
const gradientCache = new Map<SkyTime, Texture>();

/** A one pixel wide vertical gradient, top of the sky first. */
function gradientTexture(time: SkyTime): Texture {
  const cached = gradientCache.get(time);
  if (cached !== undefined) {
    return cached;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = GRADIENT_STEPS;
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('A 2d canvas is needed to draw the sky.');
  }
  for (let y = 0; y < GRADIENT_STEPS; y += 1) {
    const [r, g, b] = skyColorAt(1 - y / (GRADIENT_STEPS - 1), time);
    context.fillStyle = `rgb(${r},${g},${b})`;
    context.fillRect(0, y, 1, 1);
  }
  const texture = Texture.from(canvas);
  gradientCache.set(time, texture);
  return texture;
}

/** The sky spans every above-ground level, from the top of the highest to the floor of level 1. */
export const SKY_TOP = levelTop(levelToIndex(HIGHEST_LEVEL));
export const SKY_HEIGHT = levelTop(levelToIndex(1)) + FLOOR_HEIGHT - SKY_TOP;

/** Altitude from 0 to 1 of a world y inside the sky. */
export function altitudeAtWorldY(worldY: number): number {
  return Math.min(Math.max(1 - (worldY - SKY_TOP) / SKY_HEIGHT, 0), 1);
}

/** Lowest altitude at which stars can be seen, by time of day. */
export const STAR_FLOOR: Record<SkyTime, number> = { day: 0.72, dusk: 0.5, night: 0.2 };

export interface Star {
  x: number;
  y: number;
  altitude: number;
  /** Side in pixels. */
  size: number;
}

const STAR_COUNT = 700;

/** A repeatable scatter of stars over the upper sky. */
export function makeStars(count = STAR_COUNT): Star[] {
  let seed = 20240607;
  const next = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const stars: Star[] = [];
  for (let i = 0; i < count; i += 1) {
    const altitude = 0.2 + next() * 0.8;
    const x = Math.floor(next() * WORLD_WIDTH);
    const y = Math.floor(SKY_TOP + (1 - altitude) * SKY_HEIGHT);
    stars.push({ x, y, altitude, size: next() < 0.12 ? 2 : 1 });
  }
  return stars;
}

export interface Cloud {
  x: number;
  y: number;
  altitude: number;
  scale: number;
  alpha: number;
  flip: boolean;
}

/** Cloud tint by time of day. */
export const CLOUD_TINT: Record<SkyTime, number> = {
  day: 0xffffff,
  dusk: 0xffb88a,
  night: 0x5a678f,
};

const CLOUD_COUNT = 46;
const CLOUD_MAX_ALTITUDE = 0.55;

/** A repeatable scatter of clouds, thicker near the ground and gone before space. */
export function makeClouds(count = CLOUD_COUNT): Cloud[] {
  let seed = 7771337;
  const next = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const clouds: Cloud[] = [];
  for (let i = 0; i < count; i += 1) {
    const altitude = Math.pow(next(), 1.6) * CLOUD_MAX_ALTITUDE;
    const fade = 1 - altitude / CLOUD_MAX_ALTITUDE;
    clouds.push({
      x: Math.floor(next() * WORLD_WIDTH),
      y: Math.floor(SKY_TOP + (1 - altitude) * SKY_HEIGHT),
      altitude,
      scale: 0.7 + next() * 1.6,
      alpha: 0.35 + fade * 0.5 * (0.6 + next() * 0.4),
      flip: next() < 0.5,
    });
  }
  return clouds;
}

const cloudCache: { texture: Texture | null | undefined } = { texture: undefined };

/** A soft, flat-bottomed cloud built from overlapping blurred puffs; null without a canvas. */
function cloudTexture(): Texture | null {
  if (cloudCache.texture !== undefined) {
    return cloudCache.texture;
  }
  cloudCache.texture = null;
  if (typeof document === 'undefined') {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 110;
  const context = canvas.getContext('2d');
  if (context === null) {
    return null;
  }
  const puffs: ReadonlyArray<readonly [number, number, number]> = [
    [70, 74, 38],
    [112, 60, 46],
    [160, 50, 52],
    [208, 60, 46],
    [250, 74, 36],
    [135, 78, 40],
    [190, 80, 40],
  ];
  for (const [x, y, r] of puffs) {
    const g = context.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = g;
    context.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Flatten and soften the underside like a real cumulus.
  const base = context.createLinearGradient(0, 70, 0, 110);
  base.addColorStop(0, 'rgba(0,0,0,0)');
  base.addColorStop(1, 'rgba(0,0,0,1)');
  context.globalCompositeOperation = 'destination-out';
  context.fillStyle = base;
  context.fillRect(0, 70, 320, 40);
  cloudCache.texture = Texture.from(canvas);
  return cloudCache.texture;
}

export interface Sky {
  view: Container;
  gradient: Sprite;
  glow: Graphics;
  cloudLayer: Container;
  moon: Graphics;
  starLayer: Graphics;
  stars: Star[];
  time: SkyTime;
}

/** Horizon glow colour and strength by time of day. */
const GLOW: Record<SkyTime, { color: number; alpha: number }> = {
  day: { color: 0xfff1d0, alpha: 0.28 },
  dusk: { color: 0xffa860, alpha: 0.5 },
  night: { color: 0x6a7cc0, alpha: 0.14 },
};

function drawGlow(sky: Sky): void {
  const { color, alpha } = GLOW[sky.time];
  const bands = 24;
  const height = SKY_HEIGHT * 0.16;
  sky.glow.clear();
  for (let i = 0; i < bands; i += 1) {
    const k = i / bands;
    const top = SKY_TOP + SKY_HEIGHT - height * (1 - k);
    sky.glow.rect(0, top, WORLD_WIDTH, height / bands + 1).fill({ color, alpha: alpha * k * k });
  }
}

function drawMoon(sky: Sky): void {
  sky.moon.clear();
  sky.moon.visible = sky.time === 'night';
  const x = WORLD_WIDTH * 0.74;
  const y = SKY_TOP + SKY_HEIGHT * 0.42;
  for (let i = 6; i >= 1; i -= 1) {
    sky.moon.circle(x, y, 22 + i * 14).fill({ color: 0xbcc8f0, alpha: 0.025 });
  }
  sky.moon.circle(x, y, 22).fill({ color: 0xeef1ff });
  sky.moon.circle(x - 6, y - 5, 4).fill({ color: 0xc9cfe6, alpha: 0.8 });
  sky.moon.circle(x + 7, y + 6, 5).fill({ color: 0xc9cfe6, alpha: 0.7 });
  sky.moon.circle(x + 2, y - 10, 2.5).fill({ color: 0xc9cfe6, alpha: 0.7 });
}

function buildClouds(sky: Sky): void {
  const texture = cloudTexture();
  sky.cloudLayer.removeChildren();
  if (texture === null) {
    return;
  }
  for (const cloud of makeClouds()) {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, 0.8);
    sprite.scale.set(cloud.flip ? -cloud.scale : cloud.scale, cloud.scale);
    sprite.x = cloud.x;
    sprite.y = cloud.y;
    sprite.alpha = cloud.alpha;
    sprite.tint = CLOUD_TINT[sky.time];
    sky.cloudLayer.addChild(sprite);
  }
}

function tintClouds(sky: Sky): void {
  for (const child of sky.cloudLayer.children) {
    (child as Sprite).tint = CLOUD_TINT[sky.time];
  }
}

/** One sprite with the whole gradient, with stars, moon, horizon glow and clouds over it. */
export function createSky(
  time: SkyTime = 'day',
  makeTexture: (time: SkyTime) => Texture = gradientTexture,
): Sky {
  const gradient = new Sprite(makeTexture(time));
  gradient.x = 0;
  gradient.y = SKY_TOP;
  gradient.width = WORLD_WIDTH;
  gradient.height = SKY_HEIGHT;
  const starLayer = new Graphics();
  const glow = new Graphics();
  const moon = new Graphics();
  const cloudLayer = new Container();
  const view = new Container();
  view.addChild(gradient, starLayer, moon, glow, cloudLayer);
  const sky: Sky = { view, gradient, glow, cloudLayer, moon, starLayer, stars: makeStars(), time };
  drawStars(sky);
  drawGlow(sky);
  drawMoon(sky);
  buildClouds(sky);
  return sky;
}

/** Stars show above a time-of-day height and grow brighter toward space. */
export function drawStars(sky: Sky): void {
  const floor = STAR_FLOOR[sky.time];
  sky.starLayer.clear();
  for (const star of sky.stars) {
    if (star.altitude < floor) {
      continue;
    }
    const alpha = Math.min(1, 0.25 + ((star.altitude - floor) / (1 - floor)) * 0.75);
    sky.starLayer.rect(star.x, star.y, star.size, star.size).fill({ color: 0xffffff, alpha });
  }
}

/** Switches the sky to the gradient and stars of `time`; a sky already showing it is left alone. */
export function setSkyTime(
  sky: Sky,
  time: SkyTime,
  makeTexture: (time: SkyTime) => Texture = gradientTexture,
): void {
  if (sky.time === time) {
    return;
  }
  sky.time = time;
  sky.gradient.texture = makeTexture(time);
  drawStars(sky);
  drawGlow(sky);
  drawMoon(sky);
  tintClouds(sky);
}
