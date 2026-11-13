import { describe, expect, it } from 'vitest';
import { drawGroups } from '../src/build.mjs';
import { colorIndex } from '../src/palette.mjs';
import { uiGroup } from '../src/groups/ui.mjs';

describe('weather icons', () => {
  const [{ sprites }] = drawGroups([uiGroup]);
  const byId = Object.fromEntries(sprites.map((sprite) => [sprite.id, sprite.canvas]));

  it('has a sun, a cloud, a rain cloud and a moon at 16 x 16 with an ink stroke', () => {
    for (const name of ['sun', 'cloud', 'rain', 'moon']) {
      const icon = byId[`ui/weather-${name}`];
      expect(icon, name).toBeDefined();
      expect([icon.width, icon.height], name).toEqual([16, 16]);
      expect(icon.pixels.includes(colorIndex('obra-ink')), name).toBe(true);
    }
  });

  it('draws the sun and the moon in yellow and the rain in blue', () => {
    expect(byId['ui/weather-sun'].pixels.includes(colorIndex('obra-yellow'))).toBe(true);
    expect(byId['ui/weather-moon'].pixels.includes(colorIndex('obra-yellow'))).toBe(true);
    expect(byId['ui/weather-rain'].pixels.includes(colorIndex('obra-blue'))).toBe(true);
  });
});
