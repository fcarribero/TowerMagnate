import { describe, expect, it } from 'vitest';
import { drawGroups } from '../src/build.mjs';
import { metrics } from '../src/metrics.mjs';
import { eventsGroup } from '../src/groups/events.mjs';

const [{ sprites }] = drawGroups([eventsGroup]);
const byId = Object.fromEntries(sprites.map(({ id, canvas }) => [id, canvas]));

function frames(prefix) {
  return Object.keys(byId)
    .filter((id) => id.startsWith(`${prefix}_`))
    .sort()
    .map((id) => byId[id]);
}

function paintedPixels(canvas) {
  return canvas.pixels.filter((index) => index !== 0).length;
}

describe('events group', () => {
  for (const prefix of ['events/wedding-bell/swing', 'events/wedding-petals/burst']) {
    describe(prefix, () => {
      const animation = frames(prefix);

      it('has 3 to 4 frames of the same size, numbered from 01', () => {
        expect(animation.length).toBeGreaterThanOrEqual(3);
        expect(animation.length).toBeLessThanOrEqual(4);
        expect(byId[`${prefix}_01`]).toBeDefined();
        for (const frame of animation) {
          expect(frame.width).toBe(animation[0].width);
          expect(frame.height).toBe(animation[0].height);
          expect(paintedPixels(frame)).toBeGreaterThan(0);
        }
      });

      it('changes from one frame to the next', () => {
        animation.slice(1).forEach((frame, index) => {
          expect([...frame.pixels]).not.toEqual([...animation[index].pixels]);
        });
      });
    });
  }

  it('draws the couple walking in two frames at the person height, plus a standing pose', () => {
    const walk = frames('events/wedding-couple/walk');
    expect(walk).toHaveLength(2);
    expect(byId['events/wedding-couple/stand']).toBeDefined();
    for (const frame of [...walk, byId['events/wedding-couple/stand']]) {
      expect(frame.height).toBe(metrics.person.frameHeight);
      expect(frame.width).toBe(16);
      expect(paintedPixels(frame)).toBeGreaterThan(40);
    }
    expect([...walk[0].pixels]).not.toEqual([...walk[1].pixels]);
  });

  it('keeps the bell hanging from the same top pixel in every frame', () => {
    const [first, ...rest] = frames('events/wedding-bell/swing');
    for (const frame of rest) {
      expect(frame.get(16, 0)).toBe(first.get(16, 0));
    }
  });
});
