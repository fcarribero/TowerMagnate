import { Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import { HIGHEST_LEVEL, WORLD_WIDTH, levelToIndex, levelTop } from './levels';
import { FLOOR_HEIGHT } from './metrics';
import type { SkyPhase, SkyTime } from './timeOfDay';

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

export type WeatherKind = 'clear' | 'cloudy' | 'rain';

export interface Weather {
  kind: WeatherKind;
  raining: boolean;
  /** 0 when dry, 1 in full rain; eases between the two. */
  intensity: number;
  /** 0 with a clear sky, 1 with the usual clouds; eases between the two. */
  cover: number;
  /** Seconds until the weather changes. */
  timer: number;
}

const WEATHER_SECONDS: Record<WeatherKind, readonly [number, number]> = {
  clear: [60, 150],
  cloudy: [90, 240],
  rain: [30, 80],
};
const RAIN_FADE_SECONDS = 6;
const COVER_FADE_SECONDS = 14;
const RAIN_SPEED = 900;
const RAIN_SLANT = 0.18;

/** What follows `kind`: rain needs clouds, so it starts and ends under them. */
function nextWeather(kind: WeatherKind): WeatherKind {
  if (kind !== 'cloudy') {
    return 'cloudy';
  }
  const roll = Math.random();
  if (roll < 0.4) {
    return 'clear';
  }
  return roll < 0.75 ? 'rain' : 'cloudy';
}

function randomBetween(range: readonly [number, number]): number {
  return range[0] + Math.random() * (range[1] - range[0]);
}

const rainCache: { texture: Texture | null | undefined } = { texture: undefined };

/** A seamless tile of thin slanted streaks; null without a canvas. */
function rainTexture(): Texture | null {
  if (rainCache.texture !== undefined) {
    return rainCache.texture;
  }
  rainCache.texture = null;
  if (typeof document === 'undefined') {
    return null;
  }
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context === null) {
    return null;
  }
  let seed = 424242;
  const next = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  context.lineCap = 'round';
  for (let i = 0; i < 90; i += 1) {
    const x = next() * size;
    const y = next() * size;
    const length = 10 + next() * 16;
    context.strokeStyle = `rgba(210,225,245,${0.25 + next() * 0.45})`;
    context.lineWidth = next() < 0.2 ? 1.5 : 1;
    // Draw each streak at the wrapped offsets so the tile repeats without seams.
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        context.beginPath();
        context.moveTo(x + dx, y + dy);
        context.lineTo(x + dx - length * RAIN_SLANT, y + dy + length);
        context.stroke();
      }
    }
  }
  rainCache.texture = Texture.from(canvas);
  return rainCache.texture;
}

/** Rain falls under the clouds; with a texture it is one scrolling tile. */
function buildRain(): TilingSprite | null {
  const texture = rainTexture();
  if (texture === null) {
    return null;
  }
  const rain = new TilingSprite({
    texture,
    width: WORLD_WIDTH,
    height: SKY_HEIGHT * CLOUD_MAX_ALTITUDE,
  });
  rain.x = 0;
  rain.y = SKY_TOP + SKY_HEIGHT * (1 - CLOUD_MAX_ALTITUDE);
  rain.alpha = 0;
  rain.visible = false;
  return rain;
}

const OVERCAST_TINT = 0x8d96a8;
const OVERCAST_COLOR = 0x4a5268;
/** Highest share of the sky the grey overcast covers when it rains hard. */
const OVERCAST_ALPHA = 0.5;
const STORM_TINT = 0x6b7388;
const STORM_SPACING = 170;

function buildOvercast(): Graphics {
  const overcast = new Graphics();
  overcast.rect(0, SKY_TOP, WORLD_WIDTH, SKY_HEIGHT).fill({ color: OVERCAST_COLOR });
  overcast.alpha = 0;
  overcast.visible = false;
  return overcast;
}

/**
 * Two staggered rows of big dark clouds along the top edge of the rain, so the drops seem to
 * fall out of them instead of starting at a visible line.
 */
function buildStorm(): Container {
  const layer = new Container();
  layer.alpha = 0;
  layer.visible = false;
  const texture = cloudTexture();
  if (texture === null) {
    return layer;
  }
  const edge = SKY_TOP + SKY_HEIGHT * (1 - CLOUD_MAX_ALTITUDE);
  const rows = [
    { y: edge + 14, scale: 2.4, offset: 0 },
    { y: edge - 18, scale: 2.9, offset: STORM_SPACING / 2 },
    { y: edge - 52, scale: 2.2, offset: STORM_SPACING / 4 },
  ];
  let seed = 90210;
  const next = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (const row of rows) {
    for (let x = -STORM_SPACING; x < WORLD_WIDTH + 2 * STORM_SPACING; x += STORM_SPACING) {
      const sprite = new Sprite(texture);
      const scale = row.scale * (0.85 + next() * 0.4);
      sprite.anchor.set(0.5, 0.8);
      sprite.scale.set(next() < 0.5 ? -scale : scale, scale);
      sprite.x = x + row.offset + (next() - 0.5) * 40;
      sprite.y = row.y + (next() - 0.5) * 10;
      sprite.tint = STORM_TINT;
      layer.addChild(sprite);
    }
  }
  return layer;
}

/** Advances the weather: clear, cloudy or rain, fading between them, with the clouds darkening in rain. */
export function updateWeather(sky: Sky, seconds: number): void {
  const weather = sky.weather;
  weather.timer -= seconds;
  if (weather.timer <= 0) {
    weather.kind = nextWeather(weather.kind);
    weather.raining = weather.kind === 'rain';
    weather.timer = randomBetween(WEATHER_SECONDS[weather.kind]);
  }
  weather.intensity = approach(
    weather.intensity,
    weather.raining ? 1 : 0,
    seconds / RAIN_FADE_SECONDS,
  );
  weather.cover = approach(
    weather.cover,
    weather.kind === 'clear' ? 0 : 1,
    seconds / COVER_FADE_SECONDS,
  );
  const rain = sky.rain;
  if (rain !== null) {
    rain.visible = weather.intensity > 0;
    rain.alpha = weather.intensity * (0.35 + 0.25 * (1 - phaseWeight(sky.phase, 'night')));
    rain.tilePosition.y += RAIN_SPEED * seconds;
    rain.tilePosition.x -= RAIN_SPEED * RAIN_SLANT * seconds;
  }
  const k = weather.intensity;
  sky.overcast.visible = k > 0;
  sky.overcast.alpha = k * OVERCAST_ALPHA;
  sky.stormLayer.visible = k > 0;
  sky.stormLayer.alpha = Math.min(1, k * 1.4);
  sky.cloudLayer.visible = weather.cover > 0;
  sky.cloudLayer.alpha = weather.cover;
  applyCelestials(sky);
  tintClouds(sky);
}

function approach(value: number, target: number, step: number): number {
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step);
}

/** How much of `time` is in the sky now, from 0 to 1. */
export function phaseWeight(phase: SkyPhase, time: SkyTime): number {
  return (phase.from === time ? 1 - phase.mix : 0) + (phase.to === time ? phase.mix : 0);
}

/** Stars and moon fade in with the night and are hidden behind the overcast. */
function applyCelestials(sky: Sky): void {
  const cover = 1 - sky.weather.intensity * 0.95;
  sky.starLayer.alpha = cover;
  sky.moon.alpha = phaseWeight(sky.phase, 'night') * cover;
  sky.moon.visible = sky.moon.alpha > 0;
}

export interface Sky {
  view: Container;
  gradient: Sprite;
  glow: Graphics;
  cloudLayer: Container;
  rain: TilingSprite | null;
  /** Dark overcast over the whole sky, and the storm bank that hides where the rain starts. */
  overcast: Graphics;
  stormLayer: Container;
  weather: Weather;
  /** Second gradient, faded in over the first while the sky changes. */
  blend: Sprite;
  phase: SkyPhase;
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
  const { from, to, mix } = sky.phase;
  const color = mixTint(GLOW[from].color, GLOW[to].color, mix);
  const alpha = GLOW[from].alpha + (GLOW[to].alpha - GLOW[from].alpha) * mix;
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
    sprite.tint = CLOUD_TINT[sky.phase.from];
    sky.cloudLayer.addChild(sprite);
  }
}

/** Pixels per second a cloud drifts at scale 1; bigger clouds drift a little slower. */
const CLOUD_SPEED = 3;

/** Moves the clouds slowly to the right, wrapping around the edges of the world. */
export function driftClouds(sky: Sky, seconds: number): void {
  const margin = 200;
  // The storm bank moves as one slab, so its row spacing is kept.
  const slab = (CLOUD_SPEED / 2) * seconds;
  for (const child of sky.stormLayer.children) {
    child.x += slab;
    if (child.x > WORLD_WIDTH + 2 * STORM_SPACING) {
      child.x -= WORLD_WIDTH + 3 * STORM_SPACING;
    }
  }
  for (const child of sky.cloudLayer.children) {
    const size = Math.abs(child.scale.x);
    child.x += (CLOUD_SPEED / size) * seconds * (0.6 + child.alpha);
    if (child.x > WORLD_WIDTH + margin) {
      child.x = -margin;
    }
  }
}

function tintClouds(sky: Sky): void {
  const base = mixTint(CLOUD_TINT[sky.phase.from], CLOUD_TINT[sky.phase.to], sky.phase.mix);
  const k = sky.weather.intensity;
  const tint = k === 0 ? base : mixTint(base, OVERCAST_TINT, k * 0.7);
  for (const child of sky.cloudLayer.children) {
    (child as Sprite).tint = tint;
  }
}

function mixTint(a: number, b: number, k: number): number {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const ca = (a >> shift) & 255;
    const cb = (b >> shift) & 255;
    out |= Math.round(ca + (cb - ca) * k) << shift;
  }
  return out;
}

/** One sprite with the whole gradient, with stars, moon, horizon glow and clouds over it. */
export function createSky(
  time: SkyTime = 'day',
  makeTexture: (time: SkyTime) => Texture = gradientTexture,
): Sky {
  const gradient = new Sprite(makeTexture(time));
  const blend = new Sprite(makeTexture(time));
  for (const layer of [gradient, blend]) {
    layer.x = 0;
    layer.y = SKY_TOP;
    layer.width = WORLD_WIDTH;
    layer.height = SKY_HEIGHT;
  }
  blend.alpha = 0;
  const starLayer = new Graphics();
  const glow = new Graphics();
  const moon = new Graphics();
  const cloudLayer = new Container();
  const view = new Container();
  const rain = buildRain();
  const overcast = buildOvercast();
  const stormLayer = buildStorm();
  view.addChild(gradient, blend, starLayer, moon, glow, overcast);
  if (rain !== null) {
    view.addChild(rain);
  }
  view.addChild(cloudLayer, stormLayer);
  const weather: Weather = {
    kind: 'cloudy',
    raining: false,
    intensity: 0,
    cover: 1,
    timer: randomBetween(WEATHER_SECONDS.cloudy),
  };
  const sky: Sky = {
    view,
    gradient,
    blend,
    phase: { from: time, to: time, mix: 0 },
    glow,
    cloudLayer,
    rain,
    overcast,
    stormLayer,
    weather,
    moon,
    starLayer,
    stars: makeStars(),
    time,
  };
  drawStars(sky);
  drawGlow(sky);
  drawMoon(sky);
  applyCelestials(sky);
  buildClouds(sky);
  return sky;
}

/** Stars show above a height that falls as the night comes, and grow brighter toward space. */
export function drawStars(sky: Sky): void {
  const { from, to, mix } = sky.phase;
  const floor = STAR_FLOOR[from] + (STAR_FLOOR[to] - STAR_FLOOR[from]) * mix;
  sky.starLayer.clear();
  for (const star of sky.stars) {
    if (star.altitude < floor) {
      continue;
    }
    const alpha = Math.min(1, 0.25 + ((star.altitude - floor) / (1 - floor)) * 0.75);
    sky.starLayer.rect(star.x, star.y, star.size, star.size).fill({ color: 0xffffff, alpha });
  }
}

/** The colour behind the sky for a phase, so any gap matches the sky. */
export function skyBackgroundAt(phase: SkyPhase): number {
  const hex = (time: SkyTime): number => Number.parseInt(SKY_BACKGROUND[time].slice(1), 16);
  return mixTint(hex(phase.from), hex(phase.to), phase.mix);
}

/**
 * Shows the sky between two looks: the gradient of `from`, with the gradient of `to` faded over it.
 * A sky already showing this phase is left alone.
 */
export function setSkyPhase(
  sky: Sky,
  phase: SkyPhase,
  makeTexture: (time: SkyTime) => Texture = gradientTexture,
): void {
  const { from, to, mix } = sky.phase;
  if (phase.from === from && phase.to === to && phase.mix === mix) {
    return;
  }
  if (phase.from !== from) {
    sky.gradient.texture = makeTexture(phase.from);
  }
  if (phase.to !== to) {
    sky.blend.texture = makeTexture(phase.to);
  }
  sky.phase = { ...phase };
  sky.time = phase.mix < 0.5 ? phase.from : phase.to;
  sky.blend.alpha = phase.mix;
  drawStars(sky);
  drawGlow(sky);
  applyCelestials(sky);
  tintClouds(sky);
}

/** Switches the sky to the look of `time`; a sky already showing it is left alone. */
export function setSkyTime(
  sky: Sky,
  time: SkyTime,
  makeTexture: (time: SkyTime) => Texture = gradientTexture,
): void {
  setSkyPhase(sky, { from: time, to: time, mix: 0 }, makeTexture);
}
