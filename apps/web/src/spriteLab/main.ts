import { Application, Container, Graphics, Sprite, TextureSource } from 'pixi.js';
import { loadSprites } from '../render/atlasLoader';
import { SPRITE_IDS, type SpriteId } from '../render/atlasManifest';
import {
  INTERIOR_SHADE_COLOR,
  INTERIOR_SPECS,
  buildInteriorRoom,
  generateInteriorLayout,
  interiorKind,
  interiorSpecOf,
  interiorTemplate,
  newInteriorSeed,
  type InteriorLayout,
  type InteriorSpec,
  type InteriorTime,
} from '../render/interior';
import './spriteLab.css';

/**
 * Sprite lab: pick a unit type and see its sprites, with no server. Open /sprite-lab.html on the
 * dev server. A unit type with a seeded interior (office, condo) shows the room a seed builds,
 * its neighbor seeds, the old fixed sprite and the prop catalog; any other type shows its fixed
 * sprites for every state and time.
 * Keys: R new seed, Left/Right previous/next seed, N day or night, 1-9 state, B layer boxes.
 * The URL keeps type, seed, template, state and time, so a view can be shared by link.
 */

const SKY = { day: 0x6f9fd8, night: 0x23305e } as const;
const PAD = 16;
const LABEL = 14;
const CANVAS_WIDTH = 1200;
const LAYER_COLORS = { wall: 0xe0875a, back: 0x3d6fb6, front: 0xd23c3c } as const;

/** Unit sprites by subject: `units/<subject>/<state>_<time>`. */
const UNIT_SPRITES = new Map<string, string[]>();
for (const id of SPRITE_IDS) {
  const [group, subject] = id.split('/');
  if (group !== 'units' || subject === undefined) continue;
  UNIT_SPRITES.set(subject, [...(UNIT_SPRITES.get(subject) ?? []), id]);
}
const UNIT_TYPES = [...new Set([...UNIT_SPRITES.keys(), ...Object.keys(INTERIOR_SPECS)])].sort(
  (a, b) => {
    const seeded =
      Number(interiorSpecOf(b) !== undefined) - Number(interiorSpecOf(a) !== undefined);
    return seeded || a.localeCompare(b);
  },
);

interface LabState {
  type: string;
  seed: number;
  template: string;
  state: string;
  time: InteriorTime;
  boxes: boolean;
  shade: Record<string, InteriorSpec['shade']>;
  shadeColor: number;
}

const params = new URLSearchParams(location.search);
const firstType = UNIT_TYPES.includes(params.get('type') ?? '')
  ? (params.get('type') as string)
  : (UNIT_TYPES[0] as string);
const lab: LabState = {
  type: firstType,
  seed: params.has('seed') ? Number(params.get('seed')) >>> 0 : newInteriorSeed(),
  template: params.get('template') ?? '',
  state: params.get('state') ?? '',
  time: params.get('time') === 'night' ? 'night' : 'day',
  boxes: false,
  shade: {},
  shadeColor: INTERIOR_SHADE_COLOR,
};

TextureSource.defaultOptions.scaleMode = 'nearest';
const registry = await loadSprites();
const app = new Application();
await app.init({
  background: 0x1c1b22,
  antialias: false,
  resolution: 1,
  roundPixels: true,
  width: CANVAS_WIDTH,
  height: 600,
});
const stageHost = document.getElementById('stage') as HTMLElement;
stageHost.appendChild(app.canvas);
const labelLayer = document.createElement('div');
labelLayer.id = 'labels';
stageHost.appendChild(labelLayer);

const world = new Container();
app.stage.addChild(world);
const labels: HTMLElement[] = [];

function label(text: string, x: number, y: number, strong = false): void {
  const span = document.createElement('span');
  span.textContent = text;
  span.style.left = `${x}px`;
  span.style.top = `${y}px`;
  if (strong) span.className = 'strong';
  labels.push(span);
}

function specOf(): InteriorSpec | undefined {
  return interiorSpecOf(lab.type);
}

/** Keeps the state and template valid for the chosen type. */
function settle(): void {
  const spec = specOf();
  const states = spec ? [...spec.states] : statesOf(lab.type);
  if (!states.includes(lab.state))
    lab.state = states.includes('occupied') ? 'occupied' : (states[0] ?? '');
  if (spec && !spec.templates.some((template) => template.id === lab.template)) {
    lab.template = spec.templates[0]?.id ?? '';
  }
  if (spec && lab.shade[lab.type] === undefined) lab.shade[lab.type] = structuredClone(spec.shade);
}

/** The states a fixed-sprite unit is drawn in, from its sprite ids. */
function statesOf(type: string): string[] {
  const states = (UNIT_SPRITES.get(type) ?? []).map(
    (id) => id.split('/')[2]?.replace(/_(day|night)$/, '') ?? '',
  );
  return [...new Set(states)];
}

// Drawing

function roomTile(
  spec: InteriorSpec,
  layout: InteriorLayout,
  zoom: number,
  boxes: boolean,
  state = lab.state,
): Container {
  const tile = new Container();
  tile.addChild(new Graphics().rect(0, 0, spec.room.width, spec.room.height).fill(SKY[lab.time]));
  tile.addChild(
    buildInteriorRoom(registry, spec, layout, {
      state,
      time: lab.time,
      shade: lab.shade[spec.unitType],
      shadeColor: lab.shadeColor,
    }),
  );
  if (boxes && spec.propLook[state] !== null) {
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

function spriteTile(id: string, zoom: number, sky: boolean): Container {
  const tile = new Container();
  const texture = registry.texture(id as SpriteId);
  if (sky) {
    // A fixed unit sprite names its time; draw the sky of that time behind its glass.
    const time = id.endsWith('_night') ? 'night' : id.endsWith('_day') ? 'day' : lab.time;
    tile.addChild(new Graphics().rect(0, 0, texture.width, texture.height).fill(SKY[time]));
  }
  tile.addChild(new Sprite(texture));
  tile.scale.set(zoom);
  return tile;
}

/** Lays tiles left to right and wraps; returns the bottom of the last row. */
function flow(
  items: { tile: Container; width: number; height: number; text: string; onTap?: () => void }[],
  top: number,
): number {
  let x = PAD;
  let y = top;
  let rowHeight = 0;
  for (const item of items) {
    if (x > PAD && x + item.width > CANVAS_WIDTH - PAD) {
      x = PAD;
      y += rowHeight + PAD;
      rowHeight = 0;
    }
    label(item.text, x, y);
    item.tile.position.set(x, y + LABEL);
    if (item.onTap) {
      item.tile.eventMode = 'static';
      item.tile.cursor = 'pointer';
      item.tile.on('pointertap', item.onTap);
    }
    world.addChild(item.tile);
    x += item.width + PAD;
    rowHeight = Math.max(rowHeight, item.height + LABEL);
  }
  return y + rowHeight;
}

function renderSeeded(spec: InteriorSpec): number {
  const template = interiorTemplate(spec, lab.template);
  const layout = generateInteriorLayout(spec, lab.seed, template);
  const zoom = Math.max(2, Math.min(8, Math.floor((CANVAS_WIDTH - 2 * PAD) / spec.room.width)));
  const inGame =
    spec.fixedSeed === undefined
      ? 'each unit has its own seed'
      : `every ${spec.unitType} in the game uses seed ${spec.fixedSeed}${spec.fixedSeed === lab.seed ? ' (this one)' : ''}`;
  label(`seed ${lab.seed}  -  ${inGame}`, PAD, PAD, true);
  const main = roomTile(spec, layout, zoom, lab.boxes);
  main.position.set(PAD, PAD + LABEL);
  world.addChild(main);
  let top = PAD + LABEL + spec.room.height * zoom + PAD * 2;

  label('this seed in every state', PAD, top, true);
  top += LABEL + 4;
  const stateZoom = spec.room.width > 100 ? 2 : 3;
  top =
    flow(
      spec.states.map((state) => ({
        tile: roomTile(spec, layout, stateZoom, false, state),
        width: spec.room.width * stateZoom,
        height: spec.room.height * stateZoom,
        text: state,
        onTap: () => setLab({ state }),
      })),
      top,
    ) +
    PAD * 2;

  const fixedId = `units/${spec.unitType}/${lab.state}_${lab.time}`;
  if (registry.has(fixedId)) {
    top =
      flow(
        [
          {
            tile: spriteTile(fixedId, 2, true),
            width: spec.room.width * 2,
            height: spec.room.height * 2,
            text: `old fixed sprite: ${fixedId}`,
          },
        ],
        top,
      ) +
      PAD * 2;
  }

  label('neighbor seeds (click to open)', PAD, top, true);
  top += LABEL + 4;
  const neighbors = Array.from(
    { length: spec.room.width > 100 ? 8 : spec.room.width > 60 ? 12 : 30 },
    (_, i) => (lab.seed + i + 1) >>> 0,
  );
  top =
    flow(
      neighbors.map((seed) => ({
        tile: roomTile(spec, generateInteriorLayout(spec, seed, template), 2, false),
        width: spec.room.width * 2,
        height: spec.room.height * 2,
        text: String(seed),
        onTap: () => setLab({ seed }),
      })),
      top,
    ) +
    PAD * 2;

  label(`catalog: ${spec.catalog.length} kinds`, PAD, top, true);
  top += LABEL + 4;
  const sheet = spec.catalog.flatMap((entry) =>
    ['idle', ...(entry.looks ?? [])].map((look) => ({
      tile: spriteTile(`${spec.group}/${entry.kind}/${look}`, 3, false),
      width: Math.max(entry.width * 3, 120),
      height: entry.height * 3,
      text: `${entry.kind}${look === 'idle' ? '' : ` (${look})`}`,
    })),
  );
  top = flow(sheet, top);
  writeReadout(spec, layout);
  return top;
}

function renderFixed(): number {
  const ids = UNIT_SPRITES.get(lab.type) ?? [];
  const first = registry.texture(ids[0] as SpriteId);
  const zoom = first.width > 300 ? 1 : first.width > 150 ? 2 : 3;
  const readout = document.getElementById('readout');
  if (readout) readout.textContent = `${lab.type}: ${ids.length} fixed sprites, no seeded interior`;
  return flow(
    ids.map((id) => {
      const texture = registry.texture(id as SpriteId);
      return {
        tile: spriteTile(id, zoom, true),
        width: texture.width * zoom,
        height: texture.height * zoom,
        text: id.split('/')[2] ?? id,
      };
    }),
    PAD,
  );
}

function render(): void {
  settle();
  world.removeChildren().forEach((child) => child.destroy({ children: true }));
  labels.length = 0;
  const spec = specOf();
  const bottom = spec ? renderSeeded(spec) : renderFixed();
  app.renderer.resize(CANVAS_WIDTH, bottom + PAD);
  labelLayer.replaceChildren(...labels);
  buildControls();
  syncUrl();
}

function writeReadout(spec: InteriorSpec, layout: InteriorLayout): void {
  const readout = document.getElementById('readout');
  if (!readout) return;
  const lines = layout.props.map((prop) => {
    const entry = interiorKind(spec, prop.kind);
    const where =
      prop.layer === 1 ? 'L1 middle' : prop.mount === 'wall' ? 'L0 wall  ' : 'L0 floor ';
    const role = entry.role === 'functional' ? 'func ' : 'decor';
    const zone = spec.zones.find((area) => prop.x >= area.left && prop.x <= area.right)?.id ?? '';
    const flags = `${prop.flip ? ' flip' : ''}${prop.fixed ? ' fixed' : ''}`;
    return `${where}  ${role}  ${zone.padEnd(8)} x=${String(prop.x).padStart(3)} y=${String(prop.y).padStart(2)}  ${prop.kind}${flags}`;
  });
  const functional = layout.props.filter(
    (p) => interiorKind(spec, p.kind).role === 'functional',
  ).length;
  readout.textContent = [
    `${spec.unitType}  seed ${layout.seed}  template ${layout.template}  props ${layout.props.length} (${functional} functional)`,
    '',
    ...lines,
  ].join('\n');
}

function setLab(change: Partial<LabState>): void {
  Object.assign(lab, change);
  render();
}

function syncUrl(): void {
  const query = new URLSearchParams({ type: lab.type, state: lab.state, time: lab.time });
  if (specOf()) {
    query.set('seed', String(lab.seed));
    query.set('template', lab.template);
  }
  history.replaceState(null, '', `?${query}`);
}

// Controls

const controls = document.getElementById('controls') as HTMLElement;

function radios(name: string, values: readonly string[], checked: string, hint: string): string {
  return `<fieldset><legend>${name} ${hint}</legend>${values
    .map(
      (value) =>
        `<label class="inline"><input type="radio" name="${name}" value="${value}" ${value === checked ? 'checked' : ''}/> ${value}</label>`,
    )
    .join('')}</fieldset>`;
}

function buildControls(): void {
  const spec = specOf();
  const states = spec ? [...spec.states] : statesOf(lab.type);
  const shade = spec ? lab.shade[spec.unitType] : undefined;
  controls.innerHTML = `
    <h1>Sprite lab</h1>
    <label>Unit type <select id="type">${UNIT_TYPES.map(
      (type) =>
        `<option value="${type}" ${type === lab.type ? 'selected' : ''}>${type}${interiorSpecOf(type) ? ' (seeded)' : ''}</option>`,
    ).join('')}</select></label>
    ${
      spec
        ? `<label>Seed <input id="seed" type="number" min="0" max="4294967295" step="1" value="${lab.seed}" /></label>
    <div class="row">
      <button id="prev" title="Left">&larr;</button>
      <button id="random" title="R">New seed</button>
      <button id="next" title="Right">&rarr;</button>
    </div>
    <label>Template <select id="template">${spec.templates
      .map(
        (t) =>
          `<option value="${t.id}" ${t.id === lab.template ? 'selected' : ''}>${t.name}</option>`,
      )
      .join('')}</select></label>
    ${radios('state', states, lab.state, `(1-${states.length})`)}
    ${radios('time', ['day', 'night'], lab.time, '(N)')}
    <label class="inline"><input id="boxes" type="checkbox" ${lab.boxes ? 'checked' : ''}/> Layer boxes (B)</label>
    <p class="legend"><i style="background:#e0875a"></i>L0 wall <i style="background:#3d6fb6"></i>L0 floor <i style="background:#d23c3c"></i>L1 middle</p>
    <fieldset><legend>Shade</legend>
      ${states
        .flatMap((s) =>
          (['day', 'night'] as const).map(
            (t) =>
              `<label>${s} ${t} <output>${(shade?.[s]?.[t] ?? 0).toFixed(2)}</output><input type="range" min="0" max="0.9" step="0.05" value="${shade?.[s]?.[t] ?? 0}" data-state="${s}" data-time="${t}" /></label>`,
          ),
        )
        .join('')}
      <label>Color <input id="shadeColor" type="color" value="#${lab.shadeColor.toString(16).padStart(6, '0')}" /></label>
    </fieldset>`
        : '<p class="hint">This unit type is drawn from fixed sprites: every state and time is shown.</p>'
    }
  `;
  const on = (id: string, event: string, handler: (element: HTMLInputElement) => void) => {
    const element = document.getElementById(id) as HTMLInputElement | null;
    element?.addEventListener(event, () => handler(element));
  };
  on('type', 'change', (element) => setLab({ type: element.value, state: '', template: '' }));
  on('seed', 'change', (element) => setLab({ seed: Number(element.value) >>> 0 }));
  on('prev', 'click', () => setLab({ seed: (lab.seed - 1) >>> 0 }));
  on('next', 'click', () => setLab({ seed: (lab.seed + 1) >>> 0 }));
  on('random', 'click', () => setLab({ seed: newInteriorSeed() }));
  on('template', 'change', (element) => setLab({ template: element.value }));
  on('boxes', 'change', (element) => setLab({ boxes: element.checked }));
  on('shadeColor', 'input', (element) =>
    setLab({ shadeColor: Number.parseInt(element.value.slice(1), 16) }),
  );
  controls
    .querySelectorAll<HTMLInputElement>('input[name="state"]')
    .forEach((input) => input.addEventListener('change', () => setLab({ state: input.value })));
  controls
    .querySelectorAll<HTMLInputElement>('input[name="time"]')
    .forEach((input) =>
      input.addEventListener('change', () => setLab({ time: input.value as InteriorTime })),
    );
  controls.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach((input) =>
    input.addEventListener('input', () => {
      const table = lab.shade[lab.type];
      const row = table?.[input.dataset.state as string];
      if (row) row[input.dataset.time as InteriorTime] = Number(input.value);
      render();
    }),
  );
}

window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  const spec = specOf();
  const states = spec ? [...spec.states] : statesOf(lab.type);
  const key = event.key.toLowerCase();
  if (key === 'n') setLab({ time: lab.time === 'day' ? 'night' : 'day' });
  else if (/^[1-9]$/.test(key) && states[Number(key) - 1] !== undefined)
    setLab({ state: states[Number(key) - 1] as string });
  else if (!spec) return;
  else if (key === 'r') setLab({ seed: newInteriorSeed() });
  else if (key === 'arrowleft') setLab({ seed: (lab.seed - 1) >>> 0 });
  else if (key === 'arrowright') setLab({ seed: (lab.seed + 1) >>> 0 });
  else if (key === 'b') setLab({ boxes: !lab.boxes });
});

render();
