const FONTS_TO_LOAD = [
  "400 16px 'Archivo Black'",
  "500 16px 'Space Grotesk'",
  "700 16px 'Space Grotesk'",
  "600 16px 'IBM Plex Mono'",
];

export const FONT_WAIT_LIMIT_MS = 3000;

/** Resolves when the self-hosted fonts are loaded, or after a limit so a slow network cannot block the game. */
export async function fontsReady(
  fonts: Pick<FontFaceSet, 'load'> | undefined = document.fonts,
  limitMs = FONT_WAIT_LIMIT_MS,
): Promise<void> {
  if (fonts === undefined) {
    return;
  }
  const loaded = Promise.all(FONTS_TO_LOAD.map((font) => fonts.load(font))).catch(() => []);
  const limit = new Promise((resolve) => setTimeout(resolve, limitMs));
  await Promise.race([loaded, limit]);
}
