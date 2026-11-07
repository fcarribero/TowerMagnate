import { Container, Graphics } from 'pixi.js';
import { FLOOR_HEIGHT, SLAB_HEIGHT, TILE_WIDTH } from './metrics';

const COLORS = {
  ink: 0x141218,
  concreteDark: 0x6b5f55,
  concrete: 0x948576,
  concreteLight: 0xbfb19c,
  soil: 0x5a3a26,
  glass: 0x8fb8c8,
};

const LOBBY_WIDTH_TILES = 24;
const GROUND_WIDTH_TILES = 375;

export function createPlaceholderScene(): Container {
  const scene = new Container();
  scene.addChild(drawSoil(), drawLobby());
  return scene;
}

function drawSoil(): Graphics {
  const width = GROUND_WIDTH_TILES * TILE_WIDTH;
  return new Graphics().rect(0, 0, width, FLOOR_HEIGHT * 2).fill(COLORS.soil);
}

function drawLobby(): Graphics {
  const width = LOBBY_WIDTH_TILES * TILE_WIDTH;
  const top = -FLOOR_HEIGHT;
  const slabTop = -SLAB_HEIGHT;
  const lobby = new Graphics();

  lobby.rect(0, top, width, FLOOR_HEIGHT).fill(COLORS.ink);
  lobby.rect(1, top + 1, width - 2, FLOOR_HEIGHT - 2).fill(COLORS.concreteLight);
  for (let tile = 1; tile < LOBBY_WIDTH_TILES - 1; tile += 3) {
    lobby.rect(tile * TILE_WIDTH, top + 6, TILE_WIDTH * 2, 16).fill(COLORS.glass);
  }
  lobby.rect(1, slabTop, width - 2, 1).fill(COLORS.concreteLight);
  lobby.rect(1, slabTop + 1, width - 2, 1).fill(COLORS.concrete);
  lobby.rect(1, slabTop + 2, width - 2, 1).fill(COLORS.concreteDark);
  return lobby;
}
