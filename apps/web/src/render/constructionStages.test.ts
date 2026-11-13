import { describe, expect, it } from 'vitest';
import { UNIT_BUILD_MS, buildStageAt, siteRects } from './constructionStages';

describe('buildStageAt', () => {
  it('goes from the bare site to nearly whole, each stage showing more', () => {
    const stages = [0, 0.3, 0.5, 0.8].map((share) => buildStageAt(UNIT_BUILD_MS * share));
    expect(stages.map((stage) => stage?.index)).toEqual([0, 1, 2, 3]);
    const built = stages.map((stage) => stage?.built ?? -1);
    expect(built).toEqual([...built].sort((a, b) => a - b));
    expect(built[0]).toBe(0);
  });

  it('is done after the build time', () => {
    expect(buildStageAt(UNIT_BUILD_MS)).toBeNull();
  });
});

describe('siteRects', () => {
  const box = { x: 100, y: 0, width: 72, height: 32 };

  it('draws a fence and a crane on the bare site and no scaffolding', () => {
    const rects = siteRects({ index: 0, built: 0 }, box);
    expect(rects.some((rect) => rect.color === 0xffd400)).toBe(true);
    expect(rects.some((rect) => rect.color === 0x9a9a9a)).toBe(false);
  });

  it('draws scaffolding from the second stage on, inside the box', () => {
    const rects = siteRects({ index: 2, built: 0.6 }, box);
    expect(rects.some((rect) => rect.color === 0x9a9a9a)).toBe(true);
    expect(rects.every((rect) => rect.x >= box.x && rect.x + rect.w <= box.x + box.width)).toBe(
      true,
    );
    expect(rects.every((rect) => rect.y >= box.y && rect.y + rect.h <= box.y + box.height)).toBe(
      true,
    );
  });
});
