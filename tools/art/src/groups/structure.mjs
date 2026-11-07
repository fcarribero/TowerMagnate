import { PixelCanvas } from '../canvas.mjs';
import { metrics } from '../metrics.mjs';

const looks = {
  day: { wall: 'silver', slab: ['concrete-light', 'concrete', 'concrete-dark'] },
  night: { wall: 'slate', slab: ['concrete', 'concrete-dark', 'charcoal'] },
};

function bareFloor({ wall, slab }) {
  const { tileWidth, floorHeight, slabHeight } = metrics;
  const tile = new PixelCanvas(tileWidth, floorHeight);
  tile.fillRect(0, 0, tileWidth, floorHeight - slabHeight, wall);
  slab.forEach((color, row) => {
    tile.hline(0, floorHeight - slabHeight + row, tileWidth, color);
  });
  return tile;
}

export const structureGroup = {
  name: 'structure',
  draw() {
    return Object.entries(looks).map(([time, look]) => ({
      id: `structure/floor/${time}`,
      canvas: bareFloor(look),
    }));
  },
};
