import type { Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import {
  crowdFrame,
  frameOf,
  layerWithArt,
  person,
  towerCrowdFrame,
} from '../testing/peopleLayerFixtures';
import { floorSprite } from './elevatorPlan';

describe('floorSprite', () => {
  it('picks the stress tint from the stress level', () => {
    const states = (['normal', 'stressed', 'veryStressed'] as const).map(
      (stress) => floorSprite(person('p1', { mode: 'wait', stress }), 0).state,
    );
    expect(states).toEqual(['stand', 'stand-pink', 'stand-red']);
  });

  it('alternates walk frames every half column', () => {
    const frames = [0, 0.5, 1, 1.5].map((x) => floorSprite(person('p1', {}), x).frame);
    expect(frames).toEqual([1, 2, 1, 2]);
  });
});

describe('PeopleLayer', () => {
  it('turns a waiting person pink while it keeps waiting', () => {
    const { layer, textures } = layerWithArt();
    layer.show(frameOf(person('p1', { mode: 'wait', stress: 'normal' })));
    layer.show(frameOf(person('p1', { mode: 'wait', stress: 'stressed' })));
    expect(layer.count).toBe(1);
    expect([
      textures['people/worker-b/idle-pink_01'],
      textures['people/worker-b/idle-pink_02'],
    ]).toContain((layer.view.children[0] as Sprite).texture);
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
    const tints = () => layer.view.children.map((child) => (child as Sprite).tint);
    expect(tints()[0]).not.toBe(tints()[1]);
    layer.markGuests(new Set());
    layer.show(frameOf(person('p1', {}), person('p2', {})));
    expect(tints()[0]).toBe(tints()[1]);
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
    expect(layer.view.children[0]?.scale.x).toBe(-1);
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
    expect([textures['people/worker-b/idle_01'], textures['people/worker-b/idle_02']]).toContain(
      shown[0]?.texture,
    );
  });

  it('gives a person who comes into view the right look and place', () => {
    const { layer, textures } = layerWithArt();
    layer.showOnly({ lowest: 50, highest: 60 });
    layer.show(frameOf(person('p1', { mode: 'wait', stress: 'stressed', x: 10 })));
    layer.showOnly({ lowest: 0, highest: 5 });
    layer.show(frameOf(person('p1', { mode: 'wait', stress: 'stressed', x: 10 })));
    const sprite = layer.view.children[0];
    expect([
      textures['people/worker-b/idle-pink_01'],
      textures['people/worker-b/idle-pink_02'],
    ]).toContain((sprite as Sprite).texture);
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
      seen.add((layer.view.children[0] as Sprite).texture);
    }
    expect(seen.size).toBe(2);
  });

  it('keeps one frame while a person walks in place', () => {
    const { layer } = layerWithArt();
    const seen = new Set<unknown>();
    for (let tick = 0; tick < 100; tick += 1) {
      layer.show(frameOf(person('p1', { mode: 'walk', x: 10 })));
      seen.add((layer.view.children[0] as Sprite).texture);
    }
    expect(seen.size).toBe(1);
  });
});
