import { Application, Container, Graphics, TextureSource } from 'pixi.js';
import { loadSprites } from '../render/atlasLoader';
import { OFFICE_CATALOG, officeKind } from '../render/officeCatalog';
import {
  OFFICE_ROOM,
  OFFICE_TEMPLATES,
  generateOfficeLayout,
  newOfficeSeed,
  officeTemplate,
  type OfficeLayout,
} from '../render/officeLayout';
import {
  DEFAULT_OFFICE_SHADE,
  OFFICE_SHADE_COLOR,
  buildOfficeView,
  type OfficeShadeTable,
  type OfficeState,
  type OfficeTime,
} from '../render/officeView';
import './officeLab.css';

/**
 * Office lab: one office built from a seed, with no server. Open /office-lab.html on the dev
 * server. Keys: R new seed, Left/Right previous/next seed, N day or night, 1/2/3 state, B boxes.
 * The URL keeps seed, template, state and time, so a layout can be shared by link.
 */

const SKY = { day: 0x6f9fd8, night: 0x23305e } as const;
const MAIN_ZOOM = 6;
const GRID_ZOOM = 2;
const GRID_COLUMNS = 6;
const GRID_ROWS = 3;
const PAD = 16;
const LAYER_COLORS = { wall: 0xe0875a, back: 0x3d6fb6, front: 0xd23c3c } as const;

interface LabState {
  seed: number;
  template: string;
  state: OfficeState;
  time: OfficeTime;
  boxes: boolean;
  shade: OfficeShadeTable;
  shadeColor: number;
}

const params = new URLSearchParams(location.search);
const lab: LabState = {
  seed: params.has('seed') ? Number(params.get('seed')) >>> 0 : newOfficeSeed(),
  template: OFFICE_TEMPLATES.some((t) => t.id === params.get('template'))
    ? (params.get('template') as string)
    : 'random',
  state:
    (['empty', 'closed', 'occupied'] as const).find((s) => s === params.get('state')) ?? 'occupied',
  time: params.get('time') === 'night' ? 'night' : 'day',
  boxes: false,
  shade: structuredClone(DEFAULT_OFFICE_SHADE),
  shadeColor: OFFICE_SHADE_COLOR,
};

TextureSource.defaultOptions.scaleMode = 'nearest';
const registry = await loadSprites();
const app = new Application();
const mainWidth = OFFICE_ROOM.width * MAIN_ZOOM;
const gridCell = OFFICE_ROOM.width * GRID_ZOOM + PAD;
const width = Math.max(mainWidth, GRID_COLUMNS * gridCell) + PAD * 2;
const gridTop = OFFICE_ROOM.height * MAIN_ZOOM + PAD * 3;
const height = gridTop + GRID_ROWS * (OFFICE_ROOM.height * GRID_ZOOM + PAD + 14) + PAD;
await app.init({
  background: 0x1c1b22,
  antialias: false,
  resolution: 1,
  roundPixels: true,
  width,
  height,
});
document.getElementById('stage')?.appendChild(app.canvas);

const world = new Container();
app.stage.addChild(world);

/** The office on its sky, with layer boxes on top when asked. */
function officeTile(layout: OfficeLayout, zoom: number, boxes: boolean): Container {
  const tile = new Container();
  tile.addChild(
    new Graphics().rect(0, 0, OFFICE_ROOM.width, OFFICE_ROOM.height).fill(SKY[lab.time]),
  );
  tile.addChild(
    buildOfficeView(registry, layout, {
      state: lab.state,
      time: lab.time,
      shade: lab.shade,
      shadeColor: lab.shadeColor,
    }),
  );
  if (boxes && lab.state !== 'empty') {
    const outline = new Graphics();
    for (const prop of layout.props) {
      const color =
        prop.layer === 1
          ? LAYER_COLORS.front
          : prop.mount === 'wall'
            ? LAYER_COLORS.wall
            : LAYER_COLORS.back;
      outline
        .rect(prop.x, prop.y, prop.width, prop.height)
        .stroke({ color, width: 1 / zoom, alignment: 1 });
    }
    tile.addChild(outline);
  }
  tile.scale.set(zoom);
  return tile;
}

function render(): void {
  world.removeChildren().forEach((child) => child.destroy({ children: true }));
  const template = officeTemplate(lab.template);
  const layout = generateOfficeLayout(lab.seed, template);

  const main = officeTile(layout, MAIN_ZOOM, lab.boxes);
  main.position.set(PAD, PAD);
  world.addChild(main);

  for (let i = 0; i < GRID_COLUMNS * GRID_ROWS; i++) {
    const seed = (lab.seed + i + 1) >>> 0;
    const tile = officeTile(generateOfficeLayout(seed, template), GRID_ZOOM, false);
    const x = PAD + (i % GRID_COLUMNS) * gridCell;
    const y = gridTop + Math.floor(i / GRID_COLUMNS) * (OFFICE_ROOM.height * GRID_ZOOM + PAD + 14);
    tile.position.set(x, y + 14);
    tile.eventMode = 'static';
    tile.cursor = 'pointer';
    tile.on('pointertap', () => setLab({ seed }));
    world.addChild(tile);
    labels.push({ x, y, seed });
  }
  drawLabels();
  writeReadout(layout);
  syncControls();
  syncUrl();
}

const labels: { x: number; y: number; seed: number }[] = [];
const labelLayer = document.createElement('div');
labelLayer.id = 'labels';
document.getElementById('stage')?.appendChild(labelLayer);

function drawLabels(): void {
  labelLayer.replaceChildren(
    ...labels.map(({ x, y, seed }) => {
      const label = document.createElement('span');
      label.textContent = String(seed);
      label.style.left = `${x}px`;
      label.style.top = `${y}px`;
      return label;
    }),
  );
  labels.length = 0;
}

function writeReadout(layout: OfficeLayout): void {
  const readout = document.getElementById('readout');
  if (!readout) return;
  const lines = layout.props.map((prop) => {
    const entry = officeKind(prop.kind);
    const where =
      prop.layer === 1 ? 'L1 middle' : prop.mount === 'wall' ? 'L0 wall  ' : 'L0 floor ';
    const role = entry.role === 'functional' ? 'func ' : 'decor';
    const flags = `${prop.flip ? ' flip' : ''}${prop.fixed ? ' fixed' : ''}`;
    return `${where}  ${role}  x=${String(prop.x).padStart(2)} y=${String(prop.y).padStart(2)}  ${prop.kind}${flags}`;
  });
  const functional = layout.props.filter((p) => officeKind(p.kind).role === 'functional').length;
  readout.textContent = [
    `seed ${layout.seed}  template ${layout.template}  props ${layout.props.length} (${functional} functional)`,
    `catalog ${OFFICE_CATALOG.length} kinds`,
    '',
    ...lines,
  ].join('\n');
}

function setLab(change: Partial<LabState>): void {
  Object.assign(lab, change);
  render();
}

function syncUrl(): void {
  const query = new URLSearchParams({
    seed: String(lab.seed),
    template: lab.template,
    state: lab.state,
    time: lab.time,
  });
  history.replaceState(null, '', `?${query}`);
}

// Controls

const controls = document.getElementById('controls') as HTMLElement;
controls.innerHTML = `
  <h1>Office lab</h1>
  <label>Seed <input id="seed" type="number" min="0" max="4294967295" step="1" /></label>
  <div class="row">
    <button id="prev" title="Left">&larr;</button>
    <button id="random" title="R">New seed</button>
    <button id="next" title="Right">&rarr;</button>
  </div>
  <label>Template <select id="template">${OFFICE_TEMPLATES.map(
    (t) => `<option value="${t.id}">${t.name}</option>`,
  ).join('')}</select></label>
  <fieldset><legend>State (1/2/3)</legend>
    ${(['empty', 'closed', 'occupied'] as const)
      .map(
        (s) =>
          `<label class="inline"><input type="radio" name="state" value="${s}" /> ${s}</label>`,
      )
      .join('')}
  </fieldset>
  <fieldset><legend>Time (N)</legend>
    <label class="inline"><input type="radio" name="time" value="day" /> day</label>
    <label class="inline"><input type="radio" name="time" value="night" /> night</label>
  </fieldset>
  <label class="inline"><input id="boxes" type="checkbox" /> Layer boxes (B)</label>
  <p class="legend"><i style="background:#e0875a"></i>L0 wall <i style="background:#3d6fb6"></i>L0 floor <i style="background:#d23c3c"></i>L1 middle</p>
  <fieldset><legend>Shade</legend>
    ${(['empty', 'closed', 'occupied'] as const)
      .flatMap((s) =>
        (['day', 'night'] as const).map(
          (t) =>
            `<label>${s} ${t} <output id="o-${s}-${t}"></output><input type="range" min="0" max="0.9" step="0.05" data-state="${s}" data-time="${t}" /></label>`,
        ),
      )
      .join('')}
    <label>Color <input id="shadeColor" type="color" /></label>
  </fieldset>
  <p class="hint">Click a small office to open its seed.</p>
`;

const seedInput = document.getElementById('seed') as HTMLInputElement;
const templateSelect = document.getElementById('template') as HTMLSelectElement;
const boxesInput = document.getElementById('boxes') as HTMLInputElement;
const shadeColorInput = document.getElementById('shadeColor') as HTMLInputElement;

seedInput.addEventListener('change', () => setLab({ seed: Number(seedInput.value) >>> 0 }));
document
  .getElementById('prev')
  ?.addEventListener('click', () => setLab({ seed: (lab.seed - 1) >>> 0 }));
document
  .getElementById('next')
  ?.addEventListener('click', () => setLab({ seed: (lab.seed + 1) >>> 0 }));
document
  .getElementById('random')
  ?.addEventListener('click', () => setLab({ seed: newOfficeSeed() }));
templateSelect.addEventListener('change', () => setLab({ template: templateSelect.value }));
boxesInput.addEventListener('change', () => setLab({ boxes: boxesInput.checked }));
shadeColorInput.addEventListener('input', () =>
  setLab({ shadeColor: Number.parseInt(shadeColorInput.value.slice(1), 16) }),
);
controls
  .querySelectorAll<HTMLInputElement>('input[name="state"]')
  .forEach((input) =>
    input.addEventListener('change', () => setLab({ state: input.value as OfficeState })),
  );
controls
  .querySelectorAll<HTMLInputElement>('input[name="time"]')
  .forEach((input) =>
    input.addEventListener('change', () => setLab({ time: input.value as OfficeTime })),
  );
controls.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach((input) =>
  input.addEventListener('input', () => {
    const state = input.dataset.state as OfficeState;
    const time = input.dataset.time as OfficeTime;
    lab.shade[state][time] = Number(input.value);
    render();
  }),
);

function syncControls(): void {
  seedInput.value = String(lab.seed);
  templateSelect.value = lab.template;
  boxesInput.checked = lab.boxes;
  shadeColorInput.value = `#${lab.shadeColor.toString(16).padStart(6, '0')}`;
  controls.querySelectorAll<HTMLInputElement>('input[name="state"]').forEach((input) => {
    input.checked = input.value === lab.state;
  });
  controls.querySelectorAll<HTMLInputElement>('input[name="time"]').forEach((input) => {
    input.checked = input.value === lab.time;
  });
  controls.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach((input) => {
    const state = input.dataset.state as OfficeState;
    const time = input.dataset.time as OfficeTime;
    input.value = String(lab.shade[state][time]);
    const output = document.getElementById(`o-${state}-${time}`);
    if (output) output.textContent = lab.shade[state][time].toFixed(2);
  });
}

window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  const states: OfficeState[] = ['empty', 'closed', 'occupied'];
  switch (event.key.toLowerCase()) {
    case 'r':
      setLab({ seed: newOfficeSeed() });
      break;
    case 'arrowleft':
      setLab({ seed: (lab.seed - 1) >>> 0 });
      break;
    case 'arrowright':
      setLab({ seed: (lab.seed + 1) >>> 0 });
      break;
    case 'n':
      setLab({ time: lab.time === 'day' ? 'night' : 'day' });
      break;
    case 'b':
      setLab({ boxes: !lab.boxes });
      break;
    case '1':
    case '2':
    case '3':
      setLab({ state: states[Number(event.key) - 1] as OfficeState });
      break;
  }
});

render();
