import { describe, expect, it } from 'vitest';
import { populationProgress, starsView } from './starsModel';

describe('starsView', () => {
  it('points 1 star at the 2 star requirement and 300 population', () => {
    expect(starsView(1).next).toMatchObject({
      rank: 2,
      requirement: 'stars.req.2',
      targetPopulation: 300,
    });
  });

  it('points 3 stars at the 4 star requirement and 5,000 population', () => {
    expect(starsView(3).next).toMatchObject({
      rank: 4,
      requirement: 'stars.req.4',
      targetPopulation: 5000,
    });
  });

  it('points 5 stars at the Torre requirement', () => {
    expect(starsView(5).next).toMatchObject({
      titleLabel: 'window.stars.nextTower',
      requirement: 'stars.req.tower',
      targetPopulation: 15000,
    });
  });

  it('has no next step at Torre', () => {
    const view = starsView(6);
    expect(view.currentLabel).toBe('window.stars.currentTower');
    expect(view.next).toBeNull();
  });
});

describe('populationProgress', () => {
  it('is the share of the target, kept between 0 and 1', () => {
    expect(populationProgress(120, 300)).toBeCloseTo(0.4);
    expect(populationProgress(900, 300)).toBe(1);
    expect(populationProgress(-5, 300)).toBe(0);
  });
});
