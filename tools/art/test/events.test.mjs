import { describe, expect, it } from 'vitest';
import { drawGroups } from '../src/build.mjs';
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

  it('keeps the bell hanging from the same top pixel in every frame', () => {
    const [first, ...rest] = frames('events/wedding-bell/swing');
    for (const frame of rest) {
      expect(frame.get(16, 0)).toBe(first.get(16, 0));
    }
  });
});
