import { Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { HIGHEST_LEVEL, levelToIndex, levelTop } from './levels';
import { FLOOR_HEIGHT } from './metrics';
import {
  SKY_HEIGHT,
  SKY_TOP,
  STAR_FLOOR,
  altitudeAtWorldY,
  createSky,
  makeStars,
  setSkyTime,
  skyColorAt,
} from './skyRows';

function brightness(color: readonly [number, number, number]): number {
  return color[0] + color[1] + color[2];
}

describe('skyColorAt', () => {
  it('gets darker with altitude until it is almost black in space', () => {
    for (const time of ['day', 'dusk', 'night'] as const) {
      let previous = Infinity;
      for (let altitude = 0; altitude <= 1; altitude += 0.05) {
        const value = brightness(skyColorAt(altitude, time));
        expect(value).toBeLessThanOrEqual(previous);
        previous = value;
      }
      expect(brightness(skyColorAt(1, time))).toBeLessThan(20);
    }
  });

  it('is pale at the day horizon and darker at night', () => {
    expect(brightness(skyColorAt(0, 'day'))).toBeGreaterThan(brightness(skyColorAt(0, 'night')));
    expect(skyColorAt(0, 'day')).toEqual([196, 224, 245]);
  });

  it('clamps outside 0 to 1', () => {
    expect(skyColorAt(-1, 'day')).toEqual(skyColorAt(0, 'day'));
    expect(skyColorAt(2, 'day')).toEqual(skyColorAt(1, 'day'));
  });
});

describe('sky geometry', () => {
  it('covers the levels above the ground', () => {
    expect(SKY_TOP).toBe(levelTop(levelToIndex(HIGHEST_LEVEL)));
    expect(SKY_TOP + SKY_HEIGHT).toBe(levelTop(levelToIndex(1)) + FLOOR_HEIGHT);
    expect(altitudeAtWorldY(SKY_TOP + SKY_HEIGHT)).toBe(0);
    expect(altitudeAtWorldY(SKY_TOP)).toBe(1);
  });
});

describe('stars', () => {
  it('are the same every time and stay in the sky', () => {
    const stars = makeStars();
    expect(makeStars()).toEqual(stars);
    expect(stars.every((star) => star.altitude >= 0.2 && star.altitude <= 1)).toBe(true);
  });
});

describe('sky', () => {
  const texture = new Texture();
  const make = () => texture;

  it('stretches one gradient over the whole sky', () => {
    const sky = createSky('day', make);
    expect(sky.gradient.y).toBe(SKY_TOP);
    expect(sky.gradient.height).toBe(SKY_HEIGHT);
  });

  it('keeps the other time of day when it is set again', () => {
    const sky = createSky('day', make);
    const other = new Texture();
    setSkyTime(sky, 'day', () => other);
    expect(sky.gradient.texture).toBe(texture);
    setSkyTime(sky, 'night', () => other);
    expect(sky.time).toBe('night');
    expect(sky.gradient.texture).toBe(other);
  });

  it('shows stars lower down at night than by day', () => {
    expect(STAR_FLOOR.night).toBeLessThan(STAR_FLOOR.day);
  });
});
