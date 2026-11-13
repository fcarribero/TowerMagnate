export const UI_SCALES = [1, 2, 3] as const;
export type UiScale = (typeof UI_SCALES)[number];

export const FONT_MODES = ['fonts', 'nofonts'] as const;
export type FontMode = (typeof FONT_MODES)[number];

/** One viewport for each step: the smallest one, then two sizes that give a larger UI scale. */
const VIEWPORTS: Record<UiScale, { width: number; height: number }> = {
  1: { width: 1024, height: 640 },
  2: { width: 1920, height: 1200 },
  3: { width: 2560, height: 1600 },
};

export function viewportFor(scale: UiScale): { width: number; height: number } {
  return VIEWPORTS[scale];
}

export interface ScreenInfo {
  id: string;
  state: string;
}

export interface ManifestEntry {
  screen: string;
  state: string;
  scale: UiScale;
  fonts: FontMode;
  file: string;
}

export function fileNameFor(screen: string, scale: UiScale, fonts: FontMode): string {
  return `${screen}-${scale}-${fonts}.png`;
}

/** Every screen at every scale and font mode, in the order the files are written. */
export function expectedEntries(
  screens: readonly ScreenInfo[],
  scales: readonly UiScale[] = UI_SCALES,
  modes: readonly FontMode[] = FONT_MODES,
): ManifestEntry[] {
  return scales.flatMap((scale) =>
    modes.flatMap((fonts) =>
      screens.map(({ id, state }) => ({
        screen: id,
        state,
        scale,
        fonts,
        file: fileNameFor(id, scale, fonts),
      })),
    ),
  );
}

export function missingFiles(
  entries: readonly ManifestEntry[],
  present: Iterable<string>,
): string[] {
  const found = new Set(present);
  return entries.filter((entry) => !found.has(entry.file)).map((entry) => entry.file);
}

export class SweepError extends Error {
  constructor(
    readonly screen: string,
    reason: string,
  ) {
    super(`Screen "${screen}": ${reason}`);
  }
}
