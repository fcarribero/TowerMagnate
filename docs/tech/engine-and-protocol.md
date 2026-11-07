# Engine API, state model and wire protocol

Version 1.2, 16 November 2026. Owner: Tech Lead. Tasks TM-5, TM-23 and TM-24.

This document fixes the contract between `packages/engine`, `packages/shared`, `apps/server` and `apps/web`. The type sketches below are the target shape. Field names may change during implementation only through a PR that updates this document too.

Placement rules and their error codes come from `docs/design/construction.md` (TM-8). Economy, routing, elevator and event details belong to their own specs; this document only defines how their data travels.

## 1. Package boundaries

`packages/shared` holds everything both sides of the socket need: plain data types for state, commands, events and messages, the unit catalog, balance constants, error codes and the zod schemas. It has no logic beyond validation and small pure helpers such as level ordering.

`packages/engine` depends on `shared`. It owns the simulation and nothing else. It never reads the clock, the network or the disk, and it never calls `Math.random`. ESLint already enforces this.

`apps/server` depends on both. It owns sessions, persistence, the runner loop and the translation from engine state to wire messages.

`apps/web` depends only on `shared`. It never imports the engine.

## 2. Engine entry point

```ts
// packages/engine
export function step(state: TowerState, commands: readonly QueuedCommand[], steps: number): StepResult;

export interface QueuedCommand {
  id: string;          // client-chosen, echoed back in the result
  command: Command;
}

export interface StepResult {
  state: TowerState;
  results: CommandResult[];   // one per queued command, same order
  events: EngineEvent[];      // in the order they happened
}

export type CommandResult =
  | { id: string; ok: true; step: number; cost: number; refund: number }
  | { id: string; ok: false; step: number; error: ErrorCode };

export function createTower(seed: number): TowerState;
export function migrateState(raw: unknown): TowerState;
export function serializeState(state: TowerState): string;
export function deserializeState(text: string): TowerState;
```

`step` is a pure function. It does not mutate its input; the returned state is a new object (structural sharing is allowed). The same state, commands and step count always give the same result.

Commands are applied in list order before any simulation runs. Each command sees the state left by the previous one. A rejected command changes nothing: the handler works on a copy, and the copy is dropped on rejection. After the commands, the engine runs `steps` simulation steps. `steps` can be 0, which the server uses to apply a command between ticks.

The server always calls `step(state, queued, 0)` between ticks, so commands run after the last completed step, including that step's ledger roll, upkeep, leases, hotel and venue payouts. That is the order in `docs/design/economy.md` section 10. The `step` in a `CommandResult` is the last completed step, the one in `state.step` when the command ran.

Commands come from the network, so the engine does not trust their shape. A command that is not an object, has an unknown `type` or has a field of the wrong type is rejected with `INVALID_COMMAND`. Each handler checks its own fields. The zod schemas in `shared` catch the same problems earlier, on the server.

One step is 10 game seconds (`SECONDS_PER_STEP`), so 8,640 steps per game day. The runner calls `step` about 9.6 times per real second with `steps = 1`. Tests and the accelerated mode call it with large step counts, for example `steps = STEPS_PER_DAY * 7` for a week.

## 3. State model

`TowerState` is plain JSON-safe data: no classes, no `Map`, no `Set`, no `undefined` values, no functions. That keeps snapshots, persistence and deep equality in tests trivial. Collections keyed by id are records; ids are strings with a type prefix (`u12`, `p3401`, `s4`).

```ts
export interface TowerState {
  schemaVersion: number;      // see section 4
  step: number;               // steps since Monday 1 January year 1, 00:00 UTC
  rng: RngState;              // seeded generator state, the only source of randomness
  nextId: number;             // counter for new entity ids
  money: number;              // whole dollars, may be negative, capped at 99,999,999
  stars: StarRating;          // 1 | 2 | 3 | 4 | 5 | 6, where 6 is "Torre"
  grid: GridState;
  units: Record<UnitId, Unit>;
  transports: Record<TransportId, StairOrEscalator>;
  shafts: Record<ShaftId, Shaft>;
  people: Record<PersonId, Person>;
  ledger: Ledger;             // income and expenses of this week and last week
  activeEvents: ActiveEvent[];// bomb, fire, VIP visit, pending decisions
  notices: Notice[];          // recent notices and news, bounded list
  followed: PersonId[];       // up to 20 named people the player follows
}

export interface GridState {
  levels: Partial<Record<Level, LevelRow>>; // only levels that hold something have a row
  mainLobbyHeight: LobbyHeight | null;      // 1 | 2 | 3, set by the first lobby on level 1
  skyLobbyHeights: Partial<Record<Level, LobbyHeight>>; // keyed by 15, 30, ... 90
}

export interface LevelRow {
  structure: StructureSpan[]; // sorted by x0, disjoint, touching spans of one kind merged
  occupants: OccupantSpan[];  // sorted by x0, disjoint
}

export interface StructureSpan { kind: 'floor' | 'lobby'; x0: number; x1: number }
export interface OccupantSpan { x0: number; x1: number; occupant: OccupantRef }

export type OccupantRef =
  | { kind: 'unit'; id: UnitId }
  | { kind: 'transport'; id: TransportId; part: 'footprint' | 'landing' }
  | { kind: 'shaft'; id: ShaftId }
  | { kind: 'ruins' };

export interface Unit {
  id: UnitId;
  type: UnitType;             // 'office' | 'condo' | 'fast-food' | ... from the shared catalog
  x: number;                  // bottom-left column
  level: Level;               // bottom row
  name: string | null;        // player-edited name, null shows the default
  price: PriceLevel | null;   // 'high' | 'normal' | 'low' | 'minimum'; null for unpriced units
  placedAtStep: number;
  paid: number;               // price plus automatic floor, used for the refund rule
  used: boolean;              // set on first lease, sale, check-in or visitor
  status: UnitStatus;         // per-type detail: lease, sale, hotel room, cinema film, parking link
  evaluation: Evaluation | null; // 'good' | 'fair' | 'poor'
}

export interface Shaft {
  id: ShaftId;
  type: ShaftType;            // 'standard' | 'service' | 'express'
  x: number;
  bottom: Level;
  top: Level;
  placedAtStep: number;
  cars: Car[];
  stops: Level[];             // levels where cars stop
  schedule: ElevatorSchedule; // weekday and weekend, 6 time bands each
  queues: Record<Level, { up: PersonId[]; down: PersonId[] }>;
}

export interface Car {
  index: number;              // 0..7
  homeLevel: Level;
  position: number;           // level as a float in level order, see section 3.1
  direction: 'up' | 'down' | 'idle';
  doors: 'open' | 'closed';
  riders: PersonId[];
  placedAtStep: number;
}

export interface Person {
  id: PersonId;
  kind: PersonKind;           // office worker, resident, guest, customer, ...
  name: string;               // generated, shown in the person window
  homeUnit: UnitId | null;
  stress: number;             // average game minutes per trip
  activity: Activity;         // what the person is doing and where
  trip: Trip | null;          // current leg: walking, waiting, riding, stairs
}
```

The grid stores runs of cells, not one entry per cell. A row holds spans with inclusive columns `x0..x1` in 0..374, so an empty level costs nothing and a level with 40 offices holds about 40 occupant spans. A unit taller than one level has a span on each level it covers. Overlap and lookup on a level walk that level's sorted spans, so they cost O(spans on the level), not O(375). Placement code in `packages/engine/src/grid.ts` keeps the invariants: setting structure splits and re-merges spans, and adding an occupant to a cell that is taken throws, so command handlers check `isSpanFree` first. `migrateState` checks the same invariants when it loads a snapshot, and a state saved before the grid existed loads with an empty grid.

`Ledger` holds `currentWeek` and `previousWeek`, each a `WeekTotals` record with one `{ income, expense }` entry per category of the economy spec (table 9.1, `LEDGER_CATEGORIES` in `shared`). `income` is the sum of positive entries and `expense` the sum of negative ones, so the finance window can show mixed-sign categories such as `venues` without netting them. All balance changes go through `creditMoney` and `chargeMoney` in `packages/engine/src/money.ts`: credits stop at `MONEY_CAP` and record only what was credited, charges apply in full. The `ledger-week-roll` hook runs at Monday 00:00 and must be listed before upkeep. A state saved before money existed loads with `STARTING_MONEY` and empty weeks.

Naming: `UnitType` is the catalog type, a kebab-case string such as `retail-shop`, and `UNIT_TYPES` lists them all. `UnitId` is the id of one placed unit, such as `u12`. `ShaftType` maps to its catalog unit through `SHAFT_UNIT_TYPES` in `shared` (`standard` to `standard-elevator`, and so on).

`Level` is an integer in -10..104 with no 0 (TM-8 section 1). `shared` exports `LOWEST_LEVEL`, `HIGHEST_LEVEL`, `LEVEL_COUNT` (114), `isLevel`, and `levelToIndex` and `indexToLevel`, which convert between a `Level` and its dense index (0 for -10, up to 113 for 104) for arrays and for car positions. Both throw a `RangeError` for values outside the tower. `levelAbove`, `levelBelow` and `levelLabel` step over the missing level 0 and name basements S1 to S10.

### 3.1 Level order and positions

All positions that move use the dense level index so they interpolate linearly. A car between floor 1 and S1 has a position between their indices. Never interpolate raw `Level` values, since the jump from -1 to 1 would skip a phantom level 0.

### 3.2 Money

Money is an integer number of dollars everywhere. No floats, no cents.

### 3.3 Time

The game date is derived from `step` with the calendar module (`dateOfStep(step)`), never stored. The calendar does not use `Date`. It lives in `shared`, because the client shows the date in the status panel and `apps/web` cannot import the engine.

## 4. State versioning

`schemaVersion` starts at 1 and increases with every change to the `TowerState` shape that is not purely additive with a safe default. Each bump adds one migration function in `packages/engine/src/migrations/` from version N to N+1, plus a test that loads a frozen fixture of version N.

`migrateState(raw)` reads `schemaVersion`, runs the chain up to the current version, and validates the result. The server calls it every time it loads a snapshot from PostgreSQL. A snapshot with a version higher than the engine knows, or a malformed one, is refused with `StateMigrationError`. The server keeps the tower paused, logs it, and closes the client's socket with close code 4409.

The server stores the text from `serializeState(state)`, which is the full `TowerState` as JSON with its `schemaVersion`. It loads it back with `deserializeState(text)`, which parses the text and passes it to `migrateState`. Text that is not JSON, a missing or invalid `schemaVersion`, and a version newer than the engine all throw `StateMigrationError` with a message that names the problem. A restored state runs exactly like the state that was saved, so its hash after any number of steps matches an uninterrupted run. The serialized empty tower stays under 5 KB.

Frozen saves for the migration tests live in `packages/engine/src/migrations/fixtures.ts`. A fixture is never edited after it is added.

Protocol version (`PROTOCOL_VERSION` in `shared`) is separate from `schemaVersion`. It changes when a wire message changes. Clients send it in `hello`; a mismatch closes the socket with `PROTOCOL_MISMATCH` and the client reloads.

## 5. Commands

These are every player action listed in ARCHITECTURE.md (construir, demoler, cambiar precio, configurar ascensor, responder a un evento, cambiar película, poner nombre), split into the shapes the engine needs. Follow and unfollow are view commands; they change state only to keep the followed list in the snapshot.

```ts
export type Command =
  // build
  | { type: 'buildFloor'; level: Level; x0: number; x1: number }
  | { type: 'buildLobby'; level: Level; x0: number; x1: number; height: 1 | 2 | 3 }
  | { type: 'buildUnit'; unitType: UnitType; x: number; level: Level }
  | { type: 'buildTransport'; transportType: 'stairs' | 'escalator'; x: number; level: Level }
  | { type: 'buildShaft'; shaftType: 'standard' | 'service' | 'express'; x: number; bottom: Level; top: Level }
  | { type: 'addCar'; shaftId: ShaftId; homeLevel: Level }
  | { type: 'resizeShaft'; shaftId: ShaftId; bottom: Level; top: Level }
  // demolish
  | { type: 'demolish'; target: DemolishTarget }
  | { type: 'removeCar'; shaftId: ShaftId; carIndex: number }
  // operate
  | { type: 'setPrice'; unitId: UnitId; price: PriceLevel }
  | { type: 'configureShaft'; shaftId: ShaftId; stops: Level[]; carHomes: Level[]; schedule: ElevatorSchedule }
  | { type: 'answerEvent'; eventId: string; choice: string }
  | { type: 'changeFilm'; unitId: UnitId }
  | { type: 'renameUnit'; unitId: UnitId; name: string }
  | { type: 'renamePerson'; personId: PersonId; name: string }
  | { type: 'followPerson'; personId: PersonId }
  | { type: 'unfollowPerson'; personId: PersonId };

export type DemolishTarget =
  | { kind: 'unit'; id: UnitId }
  | { kind: 'transport'; id: TransportId }
  | { kind: 'shaft'; id: ShaftId }
  | { kind: 'floor'; level: Level; x0: number; x1: number }
  | { kind: 'lobby'; level: Level; x0: number; x1: number }
  | { kind: 'ruins'; level: Level; x: number };

export interface ElevatorSchedule {
  weekday: ElevatorBand[];   // exactly 6
  weekend: ElevatorBand[];   // exactly 6
}

export interface ElevatorBand {
  mode: 'normal' | 'expressUp' | 'expressDown';
  dwellSeconds: number;      // game seconds at each stop
  responseDistance: number;  // levels, default 5
}
```

`renameUnit` and `renamePerson` store `normalizeName(name)` from `shared`: whitespace runs become one space, control characters are dropped, the result is trimmed and cut to 24 characters (`MAX_NAME_LENGTH`, counted as characters, not UTF-16 units). A blank name stores `null`, which shows the default name again. Renaming costs nothing. An unknown unit or person id gives `UNKNOWN_ENTITY`. `answerEvent` choices are defined in the events spec (TM-15, `docs/design/events.md` section 3): `'pay' | 'refuse'` for the bomb and `'helicopter' | 'burn'` for fire.

Commands from the socket are first parsed with the zod schema in `shared`. A message that fails parsing never reaches the engine and gets `INVALID_COMMAND`. The engine still checks every rule of TM-8, since a schema cannot know the tower.

## 6. Error codes

`ErrorCode` is derived from the `ERROR_CODES` list in `shared`. The engine returns only these; the client maps each to a Spanish message from the UI glossary (TM-18). Codes are part of the protocol: new codes go at the end of the list, and a code is never renamed or removed. A snapshot test in `shared` fails if the list changes.

Construction and demolition codes, exactly as in TM-8 section 10: `INVALID_COMMAND`, `NEGATIVE_BALANCE`, `INSUFFICIENT_FUNDS`, `STAR_LOCKED`, `BOMB_EVENT_ACTIVE`, `LIMIT_REACHED`, `CAR_LIMIT`, `LAST_CAR`, `OUT_OF_BOUNDS`, `LEVEL_RESERVED`, `LOBBY_LEVEL_ONLY`, `LOBBY_FLOOR_NOT_ALLOWED`, `ABOVE_GROUND_ONLY`, `BASEMENT_ONLY`, `CATHEDRAL_LEVEL_ONLY`, `CATHEDRAL_POSITION`, `SUBWAY_POSITION`, `SPANS_GROUND`, `EXPRESS_STOP_NOT_ALLOWED`, `CELL_OCCUPIED`, `NOTHING_TO_BUILD`, `NO_SUPPORT`, `NO_FLOOR`, `TRANSPORT_LANDING`, `LOBBY_HEIGHT_MISMATCH`, `LOBBY_NOT_CONTIGUOUS`, `ESCALATOR_FLOOR_TYPE`, `SHAFT_TOO_TALL`, `SHAFT_TOO_CLOSE`, `RAMP_POSITION`, `PARKING_NOT_CONNECTED`, `RECYCLING_NOT_ADJACENT`, `MAIN_LOBBY_PROTECTED`, `SUPPORTS_STRUCTURE`, `SHAFT_IN_USE`, `NOTHING_TO_DEMOLISH`.

Operation codes added here:

| Code | When |
|---|---|
| `UNKNOWN_ENTITY` | A unit, shaft, person or event id does not exist |
| `PRICE_LOCKED` | Price change on a sold condo |
| `NOT_PRICED` | `setPrice` on a unit type without price levels (economy.md section 13) |
| `NOT_A_CINEMA` | `changeFilm` on another unit type |
| `EVENT_EXPIRED` | Answer arrives after the event deadline or for a resolved event |
| `INVALID_CHOICE` | Choice not offered by that event |
| `FOLLOW_LIMIT` | Following a 21st person |
| `INVALID_SCHEDULE` | `configureShaft` or `addCar`: stop outside the range, no stops, wrong number of homes, home not a stop, wrong band count, dwell or response distance out of range. A stop outside the express levels of an express shaft is `EXPRESS_STOP_NOT_ALLOWED`, checked first (elevators EL-25) |

Socket-level codes, never produced by the engine, are in `SOCKET_ERROR_CODES`: `PROTOCOL_MISMATCH`, `NOT_AUTHENTICATED`, `RATE_LIMITED`.

New specs add codes to this list through a PR that edits this document and the union.

## 7. Engine events

Events report what happened during the steps, so the server can turn them into notices, sounds and UI updates without diffing state.

```ts
export type EngineEvent =
  | { type: 'built'; step: number; what: BuiltRef; cost: number }
  | { type: 'demolished'; step: number; what: BuiltRef; refund: number }
  | { type: 'moneyChanged'; step: number; amount: number; reason: MoneyReason; unitId: UnitId | null }
  | { type: 'leaseSigned' | 'leaseRenewed' | 'leaseEnded'; step: number; unitId: UnitId }
  | { type: 'condoSold' | 'condoVacated'; step: number; unitId: UnitId }
  | { type: 'hotelCheckIn' | 'hotelCheckOut'; step: number; unitId: UnitId }
  | { type: 'roomStateChanged'; step: number; unitId: UnitId; state: 'clean' | 'dirty' | 'infested' }
  | { type: 'evaluationChanged'; step: number; unitId: UnitId; evaluation: Evaluation }
  | { type: 'starsChanged'; step: number; stars: StarRating }
  | { type: 'starBlocked'; step: number; reason: StarBlockReason }
  | { type: 'decisionOpened'; step: number; eventId: string; kind: DecisionKind; deadlineStep: number; options: string[] }
  | { type: 'decisionClosed'; step: number; eventId: string; choice: string }
  | { type: 'disaster'; step: number; kind: 'bomb' | 'fire'; cells: CellRange[] }
  | { type: 'treasureFound'; step: number; amount: number }
  | { type: 'news'; step: number; key: NewsKey; unitId: UnitId | null }
  | { type: 'weddingCompleted'; step: number }
  | { type: 'sound'; step: number; sound: SoundKey; level: Level; x: number }
  | { type: 'unitRenamed'; step: number; commandId: string; unitId: UnitId; name: string | null };
```

Events caused by a player command carry that command's id in `commandId`. A handler returns its events without `step` and `commandId`, and the pipeline adds both, so an event can always be matched to the `CommandResult` with the same id. Events from the simulation itself have no `commandId`.

`MoneyReason` uses the ledger category ids of economy.md section 9.1: `rent`, `hotel`, `condoSales`, `venues`, `events`, `construction`, `upkeep`, `condoBuybacks`, `films`. The finance window and `FinanceSummary` use the same ids, so nothing needs mapping. A demolition refund is a positive `construction` entry. Ransom, helicopter and treasure amounts go under `events`.

`news` carries a key, not text. The client looks up the Spanish text. `sound` events let the client play construction, cash register, alarms and bells at the right place; the elevator sound is driven by car state on the client.

## 8. Wire protocol

### 8.1 Transport and envelope

One WebSocket per open tower tab, at `/ws`, authenticated by the session cookie during the HTTP upgrade. Account actions (register, login, logout, account, create or reset tower) stay on the REST API.

Every message in both directions is JSON with one envelope, validated with zod in `shared`:

```ts
export interface Envelope<T extends string, P> {
  v: number;    // PROTOCOL_VERSION
  t: T;         // message type
  p: P;         // payload
}
```

The server validates every client message with `ClientMessageSchema.safeParse`. When a `command` envelope parses but its `Command` fails the schema, and the `id` can still be read, the server answers `commandResult` `{ id, ok: false, error: 'INVALID_COMMAND' }` so the client's pending preview resolves. Any other message that fails is answered with an `error` message and dropped; the socket stays open. The client validates server messages in development builds only, to keep the hot path cheap.

Order and limits:

- Messages before `hello` are dropped. A socket that sends no `hello` within 5 s is closed.
- Close codes: 4401 not authenticated, 4409 protocol mismatch or a snapshot the engine refused, 4429 rate limited.
- At most 20 commands per second per socket and 16 KB per message. `viewport` is limited to 4 per second.
- The upgrade checks `Origin` against the configured web origin. SameSite=Lax alone does not protect against sibling subdomains.

### 8.2 Client to server

```ts
export type ClientMessage =
  | Envelope<'hello', { protocol: number }>
  | Envelope<'command', QueuedCommand>
  | Envelope<'viewport', Viewport>
  | Envelope<'inspect', { target: InspectTarget | null }>
  | Envelope<'ping', { clientTime: number }>;

export interface Viewport {
  levelFrom: Level;
  levelTo: Level;
  xFrom: number;
  xTo: number;
}

export type InspectTarget =
  | { kind: 'unit'; id: UnitId }
  | { kind: 'person'; id: PersonId }
  | { kind: 'shaft'; id: ShaftId }
  | { kind: 'finances' };
```

`viewport` tells the server which part of the tower the client draws, with a margin the client chooses. The server sends people only inside it. The client sends a new one when the camera moves by more than a few levels, at most 4 per second.

`inspect` opens one detail stream for the window the player has open. `null` closes it.

### 8.3 Server to client

```ts
export type ServerMessage =
  | Envelope<'snapshot', Snapshot>
  | Envelope<'delta', Delta>
  | Envelope<'commandResult', CommandResult>
  | Envelope<'events', { events: ClientEvent[] }>
  | Envelope<'inspect', InspectData>
  | Envelope<'error', { code: ErrorCode; message: string }>
  | Envelope<'pong', { clientTime: number; serverStep: number }>;
```

### 8.4 Snapshot

Sent once after `hello`, and again whenever the server decides a delta would be bigger than a snapshot (for example after a bomb). It has everything the client needs to draw the tower and its panels, but not the full engine state: no RNG, no queues of person ids, no private routing data.

```ts
export interface Snapshot {
  step: number;
  money: number;
  stars: StarRating;
  population: number;
  grid: { levels: Record<Level, { structure: string }>; mainLobbyHeight: 1 | 2 | 3 | null };
  units: UnitView[];
  transports: TransportView[];
  shafts: ShaftView[];
  cars: CarView[];
  people: PersonView[];       // inside the viewport only
  followed: FollowedView[];   // the up to 20 followed people, wherever they are
  activeEvents: EventView[];  // open decisions with deadlines, bomb and fire state
  notices: NoticeView[];
  overlays: OverlayData;      // evaluation, price level and hotel room state per unit
  finances: FinanceSummary;   // this week and last week
}

export interface UnitView {
  id: UnitId;
  type: UnitType;
  x: number;
  level: Level;
  name: string | null;
  price: PriceLevel | null;
  occupied: boolean;
  variant: 'empty' | 'occupied' | 'dirty' | 'infested' | 'disconnected' | 'burnt';
}
```

A unit is `burnt` from the fire until it is repaired, which can be long after the fire event has ended, so the variant comes from unit state and not from `activeEvents`.

The day and night sprite variant is derived on the client from `step`.

### 8.5 Delta

The runner advances each tower at about 9.6 steps per real second. The server sends one delta every 200 ms of real time (5 per second), covering whatever steps ran since the last one. Deltas are not sent for steps where nothing visible changed, except that a heartbeat delta goes out at least once per second. The heartbeat carries `step`, `cars` and `people` like any other delta, so the client has one code path.

```ts
export interface Delta {
  step: number;               // engine step this delta describes
  money?: number;
  stars?: StarRating;
  population?: number;
  structure?: { level: Level; structure: string }[]; // whole changed rows
  unitsUpserted?: UnitView[];
  unitsRemoved?: UnitId[];
  transportsUpserted?: TransportView[];
  transportsRemoved?: TransportId[];
  shaftsUpserted?: ShaftView[];
  shaftsRemoved?: ShaftId[];
  cars: CarView[];            // every car of the tower, every delta
  people: PersonView[];       // every person in the viewport, every delta
  peopleGone?: PersonId[];    // left the viewport or the tower since the last delta
  followed?: FollowedView[];
  activeEvents?: EventView[]; // full list when it changes
  overlays?: Partial<OverlayData>;
  finances?: FinanceSummary;  // when the ledger changed
}
```

Optional fields are present only when they changed. `cars` and `people` are always complete for their scope, so a lost or late frame never leaves stale positions behind. At most 24 shafts × 8 cars = 192 cars, which is small. People are bounded by the viewport.

### 8.6 Interpolation fields

The client renders one delta behind real time (about 200 ms) and interpolates linearly between the two latest deltas by `step`. For that, every moving thing carries its position at `delta.step` and a stable id.

```ts
export interface CarView {
  shaftId: ShaftId;
  index: number;
  position: number;           // dense level index as a float, see 3.1
  direction: 'up' | 'down' | 'idle';
  doors: 'open' | 'closed';
  load: number;               // riders, 0..21 or 0..42
}

export interface PersonView {
  id: PersonId;
  kind: PersonKind;
  x: number;                  // column as a float, the sprite's left edge
  level: Level;               // the level the person is drawn on
  facing: 'left' | 'right';
  mode: 'walk' | 'wait' | 'ride' | 'stairs' | 'inside';
  carRef: { shaftId: ShaftId; index: number } | null; // set while riding
  stress: 'normal' | 'stressed' | 'veryStressed';
}
```

Rules for the client:

- A car's `position` interpolates linearly between deltas. If a car is new, or the two buffered deltas are more than 6 steps apart, it snaps. The gap is counted in steps because deltas are skipped when nothing changes.
- A walking person's `x` interpolates linearly when `level` is the same in both deltas. When `level` changes, the person snaps to the new level.
- A riding person is drawn inside the car named by `carRef`, at the car's interpolated position. The person's own `x` and `level` are ignored while riding.
- `wait` and `inside` people do not move. `inside` people are not drawn; they are sent so counts and inspection stay correct.

### 8.7 Command flow

1. The client sends `command` with a fresh `id`.
2. The server queues it for the tower. Before the next tick, the runner calls `step(state, queued, 0)` and then continues ticking. Commands are therefore applied in arrival order, within at most one tick (about 104 ms).
3. The server sends `commandResult` with the same `id`. If the command was accepted, the change also appears in the next delta.

The client shows build previews locally but never treats them as built until the delta arrives. A rejected command shows the message for its code.

The server saves a snapshot once per tick when that tick accepted at least one command. That meets the ARCHITECTURE.md rule of saving after each command and keeps the write count bounded when a player drags a long floor.

### 8.8 Events to the client

`ClientEvent` is the subset of `EngineEvent` the client needs: `decisionOpened`, `decisionClosed`, `starsChanged`, `starBlocked`, `disaster`, `treasureFound`, `news`, `weddingCompleted`, `sound`, plus `moneyChanged` items for the cash register sound and floating amounts. Events are sent in an `events` message right after the delta that covers their step.

### 8.9 Inspection data

While an `inspect` target is set, the server sends `inspect` once per second and right after any change to that target.

| Window (GDD Interfaz) | Data |
|---|---|
| Unit | name, type, occupancy, evaluation, price level, lease or sale state with next payment step, hotel stay end, cinema film age |
| Person | name, kind, current destination, stress value and color, home unit |
| Elevator | shaft type and range, stops, cars with home levels, full weekday and weekend schedule |
| Finances | balance, this week and last week income and expenses by `MoneyReason` |

### 8.10 Coverage of the GDD interface

| GDD Interfaz item | Where it comes from |
|---|---|
| Tower cut, scroll, zoom | snapshot grid, units, transports, shafts; deltas |
| Toolbar by category | shared catalog, star unlocks from `stars` |
| Status panel: day, date, time, money, population, stars | `step` (calendar in `shared`), `money`, `population`, `stars` |
| Tower map | snapshot and delta `structure` and units, no people |
| Finances window | `finances`, `inspect` finances |
| Unit inspection and rename, change film | `inspect` unit; `renameUnit`, `setPrice`, `changeFilm` |
| Person inspection, follow up to 20 | `inspect` person, `followed`; `followPerson`, `renamePerson` |
| Elevator window | `inspect` shaft; `configureShaft`, `addCar`, `removeCar`, `resizeShaft` |
| Overlays: evaluation, prices, hotel state | `overlays` |
| Notices and news, decision windows | `notices`, `events`, `activeEvents`; `answerEvent` |
| Sound effects | `sound` events and car state |

### 8.11 Schemas

The zod schemas for every message, command and view are in `packages/shared/src/protocol`, and the TypeScript types are inferred from them. Where this section names a type without fields (`TransportView`, `ShaftView`, `FollowedView`, `EventView`, `NoticeView`, `OverlayData`, `FinanceSummary`, `InspectData`, `ClientEvent`), the schema is the reference. Entity ids on the wire carry their prefix: `u` units, `t` stairs and escalators, `s` shafts, `p` people, `e` events. `ErrorCode` includes the socket codes; `CommandResult` only carries `EngineErrorCode`, which leaves them out.

## 9. Performance budgets

- One `step` call with `steps = 1` on a tower of 15,000 people stays under 5 ms on the CI machine. Engine scenario tests that run a game week stay under 10 s.
- A delta for a full-screen viewport stays under 50 KB of JSON. If it grows past that, we switch `people` to packed arrays before considering a binary format.
- Snapshot size is not budgeted, but it is gzip-compressed with permessage-deflate. Messages under 1 KB skip compression.

## 10. What goes where

| Item | Package |
|---|---|
| `TowerState`, `Command`, `EngineEvent`, `ErrorCode`, `Level` helpers, `normalizeName`, calendar, catalog | `packages/shared` |
| zod schemas for `ClientMessage`, `ServerMessage`, `Command` | `packages/shared` |
| `step`, `createTower`, `migrateState`, `serializeState`, `deserializeState`, command handlers | `packages/engine` |
| View builders (state to `Snapshot`, `Delta`, `InspectData`), runner, viewport filter | `apps/server` |
| Interpolation buffer, message handling, error messages in Spanish | `apps/web` |
