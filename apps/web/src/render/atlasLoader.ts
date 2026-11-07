import { Assets, type Spritesheet, type Texture } from 'pixi.js';
import { ATLAS_NAMES } from './atlasManifest';
import { SpriteRegistry, createPlaceholderTexture } from './spriteRegistry';

export { ATLAS_NAMES, type AtlasName } from './atlasManifest';

export interface LoadedSheet {
  textures: Record<string, Texture>;
}

export type SheetLoader = (url: string) => Promise<LoadedSheet>;

export function atlasUrl(name: string, baseUrl = import.meta.env.BASE_URL): string {
  return `${baseUrl}atlases/${name}.json`;
}

function loadWithPixi(url: string): Promise<LoadedSheet> {
  return Assets.load<Spritesheet>(url);
}

/** Loads every atlas that `pnpm art:build` wrote to `assets/atlases`, in parallel, and resolves only when all of them are registered. */
export async function loadSprites(
  load: SheetLoader = loadWithPixi,
  registry = new SpriteRegistry(createPlaceholderTexture()),
): Promise<SpriteRegistry> {
  const sheets = await Promise.all(ATLAS_NAMES.map((name) => load(atlasUrl(name))));
  for (const sheet of sheets) {
    registry.addSheet(sheet.textures);
  }
  return registry;
}
