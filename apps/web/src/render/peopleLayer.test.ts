import type { Container, Sprite, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import {
  crowdFrame,
  frameOf,
  layerWithArt,
  person,
  towerCrowdFrame,
} from '../testing/peopleLayerFixtures';
import type { UnitType } from '@tower-magnate/shared';
import type { DrawnFrame } from '../model/interpolation';
import { floorSprite } from './elevatorPlan';
import { personLook } from './personLook';

/** The trousers or skirt layer of a person: the first layer after the hidden followed marker. */
function pantsOf(person: unknown): Sprite {
  return (person as Container).children[1] as Sprite;
}

/** The two idle textures of the root layer (the trousers or skirt) of a worker with this id. */
function idleTextures(textures: Record<string, Texture>, id: string): Texture[] {
  const subject = personLook(id, 'officeWorker').subjects.pants;
  return [textures[`${subject}/idle_01`] as Texture, textures[`${subject}/idle_02`] as Texture];
}

describe('floorSprite', () => {
  it('keeps the same sprite whatever the stress level', () => {
    const poses = (['normal', 'stressed', 'veryStressed'] as const).map((stress) =>
      floorSprite(person('p1', { mode: 'wait', stress }), 0),
    );
    expect(poses.map((pose) => pose.state)).toEqual(['stand', 'stand', 'stand']);
    expect(new Set(poses.map((pose) => pose.look)).size).toBe(1);
  });

  it('alternates walk frames every half column', () => {
    const frames = [0, 0.5, 1, 1.5].map((x) => floorSprite(person('p1', {}), x).frame);
    expect(frames).toEqual([1, 2, 1, 2]);
  });
});

describe('PeopleLayer', () => {
  it('does not tint a waiting person when its stress changes', () => {
    const { layer, textures } = layerWithArt();
    layer.show(frameOf(person('p1', { mode: 'wait', stress: 'normal' })));
    layer.show(frameOf(person('p1', { mode: 'wait', stress: 'stressed' })));
    expect(layer.count).toBe(1);
    expect(idleTextures(textures, 'p1')).toContain(pantsOf(layer.view.children[0]).texture);
  });

  it('shows the lamp marker only over followed people', () => {
    const { layer } = layerWithArt();
    layer.markFollowed(new Set(['p1']));
    layer.show(frameOf(person('p1', {}), person('p2', {})));
    const [first, second] = layer.view.children as Sprite[];
    expect(first?.children[0]?.visible).toBe(true);
    expect(second?.children[0]?.visible).toBe(false);
    layer.markFollowed(new Set());
    layer.show(frameOf(person('p1', {}), person('p2', {})));
    expect(first?.children[0]?.visible).toBe(false);
  });

  it('tints wedding guests and clears the tint when the wedding is over', () => {
    const { layer } = layerWithArt();
    layer.markGuests(new Set(['p1']));
    layer.show(frameOf(person('p1', {}), person('p2', {})));
    const fixedTints = () =>
      layer.view.children.map(
        (child) => (child.children[child.children.length - 1] as Sprite).tint,
      );
    expect(fixedTints()[0]).not.toBe(fixedTints()[1]);
    layer.markGuests(new Set());
    layer.show(frameOf(person('p1', {}), person('p2', {})));
    expect(fixedTints()[0]).toBe(fixedTints()[1]);
  });

  it('removes people missing from the frame', () => {
    const { layer } = layerWithArt();
    layer.show(frameOf(person('p1', {}), person('p2', {})));
    layer.show(frameOf(person('p2', {})));
    expect(layer.count).toBe(1);
  });

  it('leaves riders to the elevator layer', () => {
    const { layer } = layerWithArt();
    layer.show(frameOf(person('p1', { mode: 'ride' })));
    expect(layer.count).toBe(0);
  });

  it('gives no sprite to people off screen and draws them when the range reaches them', () => {
    const { layer } = layerWithArt();
    layer.showOnly({ lowest: 50, highest: 60 });
    layer.show(frameOf(person('p1', {})));
    expect(layer.spriteCount).toBe(0);
    layer.showOnly({ lowest: 0, highest: 5 });
    layer.show(frameOf(person('p1', {})));
    expect(layer.view.children[0]?.visible).toBe(true);
  });

  it('frees the sprites of people the camera leaves for the people it reaches', () => {
    const { layer } = layerWithArt();
    layer.showOnly({ lowest: 0, highest: 33 });
    layer.show(towerCrowdFrame(3000, 0, 100));
    layer.showOnly({ lowest: 34, highest: 66 });
    expect(layer.count).toBe(0);
    expect(layer.spareCount).toBe(1020);
    layer.show(towerCrowdFrame(3000, 0, 100));
    expect(layer.count).toBe(990);
    expect(layer.spriteCount).toBe(1020);
  });

  it('mirrors a person facing left', () => {
    const { layer } = layerWithArt();
    layer.show(frameOf(person('p1', { facing: 'left' })));
    const look = personLook('p1', 'officeWorker');
    expect(layer.view.children[0]?.scale.x).toBe(-look.scaleX);
    expect(layer.view.children[0]?.scale.y).toBe(look.scaleY);
  });

  it('keeps one sprite per person across frames of 2,000 people', () => {
    const { layer } = layerWithArt();
    layer.showOnly({ lowest: 0, highest: 99 });
    layer.show(crowdFrame(2000, 0));
    layer.show(crowdFrame(2000, 0.25));
    expect(layer.count).toBe(2000);
    expect(layer.view.children).toHaveLength(2000);
  });

  it('reuses the sprites of people who left for the people who arrive', () => {
    const { layer } = layerWithArt();
    layer.show(frameOf(person('p1', {}), person('p2', {})));
    layer.show(frameOf(person('p2', {})));
    expect(layer.spareCount).toBe(1);
    expect(layer.view.children.filter((sprite) => sprite.visible)).toHaveLength(1);
    layer.show(frameOf(person('p2', {}), person('p3', {})));
    expect(layer.spareCount).toBe(0);
    expect(layer.view.children).toHaveLength(2);
    expect(layer.view.children.every((sprite) => sprite.visible)).toBe(true);
  });

  it('gives a reused sprite the look of its new person', () => {
    const { layer, textures } = layerWithArt();
    layer.show(frameOf(person('p1', { mode: 'wait', stress: 'veryStressed' })));
    layer.show(frameOf(person('p2', { mode: 'wait', stress: 'veryStressed' })));
    layer.show(frameOf(person('p5', { mode: 'wait', stress: 'normal' })));
    expect(layer.view.children).toHaveLength(2);
    const shown = layer.view.children.filter((sprite) => sprite.visible) as Sprite[];
    expect(shown).toHaveLength(1);
    expect(idleTextures(textures, 'p5')).toContain(pantsOf(shown[0]).texture);
  });

  it('gives a person who comes into view the right look and place', () => {
    const { layer, textures } = layerWithArt();
    layer.showOnly({ lowest: 50, highest: 60 });
    layer.show(frameOf(person('p1', { mode: 'wait', stress: 'stressed', x: 10 })));
    layer.showOnly({ lowest: 0, highest: 5 });
    layer.show(frameOf(person('p1', { mode: 'wait', stress: 'stressed', x: 10 })));
    const sprite = layer.view.children[0];
    expect(idleTextures(textures, 'p1')).toContain(pantsOf(sprite).texture);
    expect(sprite?.x).toBeGreaterThan(80);
  });

  it('keeps the sprite count at the peak crowd while people come and go', () => {
    const { layer } = layerWithArt();
    layer.showOnly({ lowest: 0, highest: 99 });
    for (let frame = 0; frame < 10; frame++) {
      layer.show(towerCrowdFrame(3000, frame, 100, (index) => (index + frame) % 10 === 0));
    }
    expect(layer.count).toBe(2700);
    expect(layer.view.children.length).toBeLessThanOrEqual(3000);
  });

  it('shows only the people on the floors in view', () => {
    const { layer } = layerWithArt();
    layer.showOnly({ lowest: 0, highest: 33 });
    layer.show(towerCrowdFrame(3000, 0, 100));
    expect(layer.count).toBe(1020);
    expect(layer.spriteCount).toBe(1020);
  });
});

describe('PeopleLayer idle animation', () => {
  it('alternates the two idle frames of a person who stands', () => {
    const { layer } = layerWithArt();
    const seen = new Set<unknown>();
    for (let tick = 0; tick < 100; tick += 1) {
      layer.show(frameOf(person('p1', { mode: 'wait', stress: 'normal' })));
      seen.add(pantsOf(layer.view.children[0]).texture);
    }
    expect(seen.size).toBe(2);
  });

  it('keeps one frame while a person walks in place', () => {
    const { layer } = layerWithArt();
    const seen = new Set<unknown>();
    for (let tick = 0; tick < 100; tick += 1) {
      layer.show(frameOf(person('p1', { mode: 'walk', x: 10 })));
      seen.add(pantsOf(layer.view.children[0]).texture);
    }
    expect(seen.size).toBe(1);
  });
});

describe('PeopleLayer on a flight', () => {
  const riding = (progress: number, walked = 0): DrawnFrame => ({
    cars: new Map(),
    people: [
      {
        person: person('p1', { mode: 'walk', level: 4, x: 10 }),
        x: 10,
        position: 12,
        flight: { level: 4, x: 10, up: true, progress, walked },
      },
    ],
  });
  const texturesSeen = (kind: string, progresses: number[], walked = 0): Set<unknown> => {
    const { layer } = layerWithArt();
    layer.setTransports([{ type: kind as UnitType, x: 10, level: 4 }]);
    const seen = new Set<unknown>();
    for (const progress of progresses) {
      layer.show(riding(progress, walked));
      seen.add(pantsOf(layer.view.children[0]).texture);
    }
    return seen;
  };
  const along = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

  it('keeps the feet still on an escalator, landings included', () => {
    const { layer, textures } = layerWithArt();
    layer.setTransports([{ type: 'escalator', x: 10, level: 4 }]);
    for (const progress of [0, 0.1, 0.3, 0.5, 0.9, 1]) {
      layer.show(riding(progress));
      const walking = [
        textures['people/pants-trousers/walk_01'],
        textures['people/pants-skirt/walk_02'],
      ];
      expect(walking).not.toContain(pantsOf(layer.view.children[0]).texture);
      const texture = pantsOf(layer.view.children[0]).texture;
      expect(
        [...Object.entries(textures)].some(([id, one]) => one === texture && id.includes('walk')),
      ).toBe(false);
    }
  });

  it('keeps animating the feet on stairs', () => {
    expect(texturesSeen('stairs', along).size).toBe(2);
  });

  it('walks again after stepping off an escalator', () => {
    const { layer, textures } = layerWithArt();
    layer.setTransports([{ type: 'escalator', x: 10, level: 4 }]);
    layer.show(riding(1, 0.5));
    const texture = pantsOf(layer.view.children[0]).texture;
    expect(
      [...Object.entries(textures)].some(([id, one]) => one === texture && id.includes('walk')),
    ).toBe(true);
  });
});

describe('PeopleLayer people inside units', () => {
  const office = { type: 'office' as const, x: 20, level: 1 };

  it('draws a person inside a unit, within the unit', () => {
    const { layer } = layerWithArt();
    layer.setUnits([office]);
    layer.show({
      ...frameOf(),
      inside: [person('p1', { mode: 'inside', x: 22, level: 1 })],
    });
    expect(layer.count).toBe(1);
    const sprite = layer.view.children[0] as Sprite;
    expect(sprite.visible).toBe(true);
  });

  it('skips a person inside when no unit holds them', () => {
    const { layer } = layerWithArt();
    layer.setUnits([office]);
    layer.show({ ...frameOf(), inside: [person('p1', { mode: 'inside', x: 90, level: 1 })] });
    expect(layer.count).toBe(0);
  });

  it('moves them over time', () => {
    let now = 0;
    const { layer } = layerWithArt(() => now);
    layer.setUnits([office]);
    const xs = new Set<number>();
    for (now = 0; now < 30_000; now += 500) {
      layer.show({ ...frameOf(), inside: [person('p1', { mode: 'inside', x: 22, level: 1 })] });
      xs.add((layer.view.children[0] as Sprite).x);
    }
    expect(xs.size).toBeGreaterThan(3);
  });
});

describe('PeopleLayer look', () => {
  it('draws five layers per person, colored and stretched from the id', () => {
    const { layer } = layerWithArt();
    layer.show(frameOf(person('p1', {})));
    const root = layer.view.children[0] as Container;
    const look = personLook('p1', 'officeWorker');
    expect(root.children).toHaveLength(6);
    // The container is never tinted: a tint on it would be multiplied into every layer.
    expect(root.tint).toBe(0xffffff);
    const [, pants, shirt, skin, hair] = root.children as Sprite[];
    expect([pants?.tint, shirt?.tint, skin?.tint, hair?.tint]).toEqual([
      look.pants,
      look.shirt,
      look.skin,
      look.hair,
    ]);
  });

  it('keeps the feet on the floor line whatever the height', () => {
    const { layer } = layerWithArt();
    const ids = Array.from({ length: 40 }, (_, index) => `p${index}`);
    layer.show(frameOf(...ids.map((id) => person(id, { mode: 'wait' }))));
    const feet = new Set(layer.view.children.map((child) => child.y));
    expect(feet.size).toBe(1);
    const heights = new Set(layer.view.children.map((child) => child.scale.y));
    expect(heights.size).toBeGreaterThan(2);
  });

  it('gives the same look to a person in the same id after a reuse', () => {
    const { layer } = layerWithArt();
    layer.show(frameOf(person('p1', {})));
    const first = pantsOf(layer.view.children[0]).tint;
    layer.show(frameOf());
    layer.show(frameOf(person('p1', {})));
    expect(pantsOf(layer.view.children[0]).tint).toBe(first);
  });
});
