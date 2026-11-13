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
    { at: 0.15, color: [128, 176, 226] },
    { at: 0.4, color: [58, 110, 190] },
    { at: 0.65, color: [24, 52, 120] },
    { at: 0.85, color: [6, 14, 44] },
    { at: 1, color: [0, 0, 6] },
  ],
  dusk: [
    { at: 0, color: [246, 170, 110] },
    { at: 0.12, color: [222, 124, 112] },
    { at: 0.35, color: [122, 82, 140] },
    { at: 0.6, color: [44, 40, 98] },
    { at: 0.85, color: [10, 12, 38] },
    { at: 1, color: [0, 0, 6] },
  ],
  night: [
    { at: 0, color: [52, 66, 112] },
    { at: 0.15, color: [34, 46, 90] },
    { at: 0.45, color: [18, 26, 62] },
    { at: 0.75, color: [8, 12, 34] },
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

export interface Sky {
  view: Container;
  gradient: Sprite;
  starLayer: Graphics;
  stars: Star[];
  time: SkyTime;
}

/** One sprite with the whole gradient, and the stars over it. */
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
  const view = new Container();
  view.addChild(gradient, starLayer);
  const sky: Sky = { view, gradient, starLayer, stars: makeStars(), time };
  drawStars(sky);
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
}
