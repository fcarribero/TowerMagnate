import { describe, expect, it } from 'vitest';
import { buildStageFor, siteRects } from './constructionStages';

describe('buildStageFor', () => {
  it('goes from the bare site to nearly whole, each stage showing more', () => {
    const stages = [0, 5, 20, 50, 90].map((percent) => buildStageFor(percent));
    expect(stages[0]).toEqual({ index: 0, built: 0 });
    const built = stages.map((stage) => stage?.built ?? -1);
    expect(built).toEqual([...built].sort((a, b) => a - b));
    expect(new Set(stages.map((stage) => stage?.index)).size).toBe(stages.length - 1);
    expect(built[4]).toBeLessThan(1);
  });

  it('keeps the same stage between two close percents, so it is drawn once', () => {
    expect(buildStageFor(40)?.index).toBe(buildStageFor(41)?.index);
  });

  it('is done at 100 percent', () => {
    expect(buildStageFor(100)).toBeNull();
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
