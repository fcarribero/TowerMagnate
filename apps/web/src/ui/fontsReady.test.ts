import { describe, expect, it, vi } from 'vitest';
import { fontsReady } from './fontsReady';

describe('fontsReady', () => {
  it('waits for the four font faces', async () => {
    const load = vi.fn().mockResolvedValue([]);
    await fontsReady({ load }, 1000);
    expect(load.mock.calls.map(([font]) => font)).toEqual([
      "400 16px 'Archivo Black'",
      "500 16px 'Space Grotesk'",
      "700 16px 'Space Grotesk'",
      "600 16px 'IBM Plex Mono'",
    ]);
  });

  it('stops waiting at the limit when a font never arrives', async () => {
    const load = vi.fn().mockReturnValue(new Promise(() => undefined));
    await expect(fontsReady({ load }, 10)).resolves.toBeUndefined();
  });

  it('carries on when a font fails to load', async () => {
    const load = vi.fn().mockRejectedValue(new Error('network'));
    await expect(fontsReady({ load }, 1000)).resolves.toBeUndefined();
  });
});
