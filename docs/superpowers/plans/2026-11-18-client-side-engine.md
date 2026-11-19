# Client-side engine implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the tower simulation in a browser Web Worker and turn the server into account plus save storage.

**Architecture:** The runner and the view builders in `apps/server/src/tower-socket` move to a new pure package, `packages/host`. A Worker in `apps/web` runs a `LocalSession` from that package and speaks the existing JSON protocol to the page over `postMessage`. The page swaps `GameSocket` for `WorkerSocket` behind one interface. The server gets `POST /api/tower/play` and `PUT /api/tower/state` with a single-session play token, and loses the runner and WebSocket gateway.

**Tech stack:** TypeScript, pnpm workspaces, Vitest, Fastify 5, PostgreSQL via `pg`, Vite 7 workers, Preact, `CompressionStream`, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-18-client-side-engine-design.md`

## Global constraints

- Commit straight to `develop`. No `Co-Authored-By` line in commit messages.
- After each commit that touches code, restart the stack: `pnpm stack up -d --build`.
- Code, file names and commits in English. Game UI text in Spanish, through `t(...)` keys in `apps/web/src/ui/spanishStrings.ts`.
- Comments short, only where code does not explain itself. Prefer long clear code over compact code.
- `packages/host` imports nothing from Node, the DOM, the network or the database. Allowed: `@tower-magnate/engine`, `@tower-magnate/engine/testing` (debug scenarios only), `@tower-magnate/shared`, `zod`.
- Timers and intervals keep today's values: runner tick 100 ms, delta broadcast 200 ms, inspection check 250 ms, inspection resend 1000 ms.
- Save timing: autosave every 30,000 ms; 5,000 ms after the last state change from a command or debug change; right away on `visibilitychange` to hidden. Retry delays 5,000, 15,000, 30,000, then 60,000 ms repeating. Save-failing flag after 120,000 ms without a successful save.
- Save size caps on the server: 4 MB compressed body, 32 MB uncompressed.
- Every step of `pnpm lint`, `pnpm typecheck` and `pnpm test` passes at the end of every task.

## Review focus

1. A tab left open after another tab takes over must never write a save. Covered by the server test "a save with an old token answers 409 and writes nothing" (Task 6) and the scheduler test "stale stops every timer and never saves again" (Task 7).
2. A command saved right before a takeover lands, and one after does not. The token check and the write run in one transaction (Task 6, "token check and write are atomic").
3. Reset from the same tab must not show the takeover modal. Covered by the App test "restart stops the worker before resetting" (Task 9).
4. An old cached client loading a newer save must not run it. Covered by the worker test "a state with a newer schemaVersion reports outdated and does not start" (Task 8).
5. Infinite money on must not save the capped money. Covered by the LocalSession test "saved state carries the real money with infinite money on" (Task 5).

---

### Task 1: Create `packages/host` and move the pure view builders

**Files:**
- Create: `packages/host/package.json` (name `@tower-magnate/host`, `"type": "module"`, `exports: { ".": "./src/index.ts" }`, deps `@tower-magnate/engine`, `@tower-magnate/shared`, `zod` at the version `shared` uses), `packages/host/tsconfig.json` (copy of engine's, references `../engine` and `../shared`), `packages/host/vitest.config.ts` (name `@tower-magnate/host`), `packages/host/src/index.ts`
- Move with `git mv`, tests included: `apps/server/src/tower-socket/{snapshot,snapshot.test,snapshot.flight.test,delta,delta.test,same-data,same-data.test,notice-params,client-events,client-events.test,heat-view,heat-view.test,inspect,inspect.test,inspect-lobby.test,testPeople}.ts` to `packages/host/src/views/`
- Move: `apps/server/src/bench/person-view.ts` to `packages/host/src/bench/person-view.ts`
- Modify: root `tsconfig.json` (add reference `packages/host`), `apps/server/package.json` (dep `@tower-magnate/host`), `apps/server/tsconfig.json` (reference), root `package.json` script `bench:person-view` to `tsx packages/host/src/bench/person-view.ts`, every server import of the moved files

**Interfaces:**
- Produces from `@tower-magnate/host`: `buildSnapshot`, `diffSnapshots`, `needsFreshSnapshot`, `toClientEvents`, `buildHeatData`, `inspectUnit`, `inspectPerson`, `inspectShaft`, `inspectLobby`, `noticeParamTexts`, `modeOfPhase`, `standsStill`, `stressLevel`, with the signatures they have today.

- [ ] **Step 1:** Create the package files and run `pnpm install`.
- [ ] **Step 2:** `git mv` the files, re-export the listed names from `src/index.ts`, fix imports in the moved files and in `apps/server/src`.
- [ ] **Step 3:** Run `pnpm --filter @tower-magnate/host exec vitest run`. Expected: every moved test passes.
- [ ] **Step 4:** Run `pnpm lint && pnpm typecheck && pnpm test`. Expected: all pass, test count unchanged from before the move.
- [ ] **Step 5:** Commit `Move the snapshot, delta and inspect builders into a host package`, then restart the stack.

### Task 2: Move the runner and debug changes into `host`

**Files:**
- Move: `apps/server/src/runner/{tower-runner,tower-runner.test,real-time,real-time.test}.ts` to `packages/host/src/runner/`; `apps/server/src/debug/{changes,changes.test,messages,messages.test}.ts` to `packages/host/src/debug/`
- Create: `packages/host/src/runner/tower-store.ts` with only the `TowerStore` interface. `createTowerStore` (pg) stays in `apps/server/src/runner/tower-store.ts` and imports the interface from host.
- Modify: `packages/host/src/runner/tower-runner.ts` (add one method), `packages/host/src/index.ts`, server imports

**Interfaces:**
- Produces: `TowerRunner`, `TowerStore`, `TowerChange`, `AdvanceTower`, `UnknownTowerError`, `TICK_INTERVAL_MS`, `SNAPSHOT_INTERVAL_MS`, `stepsForElapsed`, `REAL_MS_PER_GAME_DAY`, debug `fastForward`, `forceEvent`, `loadScenario`, `setClock`, `setMoney`, `DebugRefusal`, `DebugMessageSchema`, `DebugMessage`, `debugTypeOf`, `MAX_FAST_FORWARD_STEPS`.
- New: `TowerRunner.savedStateOf(towerId: string): Promise<TowerState | undefined>`. Runs through `inOrder`, applies pending commands and catches up the clock like `saveRunning`, then returns the state with the real money when infinite money is on (what private `savedState()` returns). It does not call the store.
- `TowerId` becomes `string` in host (the server's `TowerId` alias in `snapshots.ts` is already `string`).

- [ ] **Step 1:** Write test `savedStateOf returns the real money while infinite money is on` in `tower-runner.test.ts`: load a tower with money 5,000, `setInfiniteMoney(id, true)`, expect `stateOf(id).money` to be `MONEY_CAP` and `(await savedStateOf(id)).money` to be 5,000. Second test `savedStateOf does not call the store save`.
- [ ] **Step 2:** Run it. Expected: FAIL, `savedStateOf` is not a function.
- [ ] **Step 3:** `git mv` the files, add `savedStateOf`, fix imports.
- [ ] **Step 4:** Run `pnpm lint && pnpm typecheck && pnpm test`. Expected: all pass.
- [ ] **Step 5:** Commit `Move the tower runner and debug changes into the host package`, restart the stack.

### Task 3: Move the broadcaster, inspections, handlers and debug frames behind a port

**Files:**
- Create: `packages/host/src/port.ts`
- Move: `apps/server/src/tower-socket/{delta-broadcaster,delta-broadcaster.test,inspections,inspections.test,viewports,disconnected-units,disconnected-units.test,handlers}.ts` to `packages/host/src/session/`; `apps/server/src/debug/handler.ts` to `packages/host/src/debug/handler.ts`
- Move: `apps/server/src/testing/fake-socket.ts` to `packages/host/src/testing/fake-socket.ts`, without `EventEmitter` and `Buffer` (it only needs `send`, `close`, `sent`, `closeCode`). Server tests that need `ping`, `terminate` and events keep a server-side subclass.
- Modify: `apps/server/src/gateway/message-router.ts`, `apps/server/src/gateway/socket.ts`, `apps/server/src/app.ts`, server imports

**Interfaces:**
- Produces in `port.ts`:

```ts
export interface HostSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}
export interface SocketSet {
  socketsForTower(towerId: string): Iterable<HostSocket>;
  allSockets(): Iterable<HostSocket>;
}
export interface SocketIdentity { userId: string; towerId: string; }
export interface MessageContext { socket: HostSocket; identity: SocketIdentity; join: () => void; }
export type MessageHandler<T extends ClientMessageType> =
  (message: Envelope<ClientMessage, T>, context: MessageContext) => void | Promise<void>;
export type MessageHandlers = { [T in ClientMessageType]?: MessageHandler<T> } & {
  invalidCommand?: (id: string, context: MessageContext) => void;
};
export interface DebugFrames {
  typeOf(rawData: unknown): string | null;
  handle(rawData: unknown, context: MessageContext): Promise<void>;
}
export const CLOSE_CODES = { noHello: 4400, notAuthenticated: 4401, protocolMismatch: 4409, rateLimited: 4429 } as const;
export function sendMessage(socket: HostSocket, message: ServerMessage): void;
export function sendError(socket: HostSocket, code: ServerErrorCode, message: string): void;
```

- `DeltaBroadcaster.tick(sockets: SocketSet)`, `DeltaBroadcaster.start(sockets: SocketSet, intervalMs?)`, `Inspections.tick(sockets: SocketSet)`, `Inspections.start(sockets: SocketSet, intervalMs?)`. Per-socket maps become `WeakMap<HostSocket, ...>`. Everything else keeps its current signature. `towerSocketHandlers` and `createDebugFrames` are exported from host.
- The server's `GatewaySocket` and `ConnectionRegistry` satisfy `HostSocket` and `SocketSet` structurally; the gateway imports the types above from host instead of defining its own.

- [ ] **Step 1:** Create `port.ts`, `git mv` the files, switch them to the port types, fix imports.
- [ ] **Step 2:** Run `pnpm --filter @tower-magnate/host exec vitest run`. Expected: moved tests pass with the slimmed `FakeSocket`.
- [ ] **Step 3:** Run `pnpm lint && pnpm typecheck && pnpm test`. Expected: all pass, including `tower-socket.test.ts`, `debug-socket.test.ts` and `gateway.test.ts` on the server.
- [ ] **Step 4:** Run `pnpm stack up -d --build`, open http://localhost:4102, log in and build one floor. Expected: the game plays as before.
- [ ] **Step 5:** Commit `Put the tower socket logic behind a port in the host package`, restart the stack.

### Task 4: Message routing in `host`

The server's `readClientFrame`, `rejectInvalidCommand` and `routeMessage` in `apps/server/src/gateway/message-router.ts` parse a raw frame with `ClientMessageSchema`, answer `INVALID_COMMAND` for a bad command, and pass debug frames to `DebugFrames`. The Worker needs the same thing without the gateway.

**Files:**
- Move: `readClientFrame`, `rejectInvalidCommand`, `routeMessage`, `ClientFrame` and `MAX_MESSAGE_BYTES` from `apps/server/src/gateway/message-router.ts` to `packages/host/src/session/route.ts`, typed on `HostSocket` and `MessageContext`. The server re-exports or imports them.
- Test: `packages/host/src/session/route.test.ts`

**Interfaces:**
- Produces: `routeMessage(rawData: unknown, context: MessageContext, handlers: MessageHandlers, debugFrames?: DebugFrames): Promise<void>` with today's behavior (check today's exact signature in the server file and keep it).

- [ ] **Step 1:** Write tests in `route.test.ts`: `a hello frame reaches the hello handler`; `a command with a bad payload answers a commandResult with INVALID_COMMAND`; `a debug frame goes to the debug frames`; `text that is not JSON answers an error frame`. Use host `FakeSocket`.
- [ ] **Step 2:** Run them. Expected: FAIL, module not found.
- [ ] **Step 3:** Move the functions.
- [ ] **Step 4:** Run `pnpm lint && pnpm typecheck && pnpm test`. Expected: all pass.
- [ ] **Step 5:** Commit `Move client frame routing into the host package`, restart the stack.

### Task 5: `LocalSession`, one tower in one place

**Files:**
- Create: `packages/host/src/session/local-session.ts`, `packages/host/src/session/local-session.test.ts`

**Interfaces:**
- Consumes: `TowerRunner`, `DeltaBroadcaster`, `Inspections`, `Viewports`, `towerSocketHandlers`, `createDebugFrames`, `routeMessage` (Tasks 2 to 4).
- Produces:

```ts
export const LOCAL_TOWER_ID = 'local';
export interface LocalSessionOptions {
  state: TowerState;
  /** Debug and developer messages are answered only when true. */
  debug: boolean;
  /** Each server message, as the JSON text the WebSocket carried. */
  send: (data: string) => void;
  /** Called whenever the runner would have saved: after an accepted command and after a debug change. */
  onChange: () => void;
  now?: () => number;
}
export class LocalSession {
  constructor(options: LocalSessionOptions);
  /** Loads the state into the runner and starts the 100, 200 and 250 ms timers. */
  start(): Promise<void>;
  /** Routes one client frame. Frames that arrive before start() resolves wait for it. */
  receive(data: string): Promise<void>;
  /** The state to save: caught up to now, with the real money when infinite money is on. */
  savedState(): Promise<TowerState>;
  /** Stops every timer. Nothing is sent afterwards. */
  stop(): void;
}
```

The runner gets a `TowerStore` whose `load` returns `options.state` and whose `save` calls `onChange`. The session does not start the runner's 30 s autosave; the Worker's scheduler owns timing. `savedState()` returns `runner.savedStateOf(LOCAL_TOWER_ID)`. It must not go through `runner.save`, which would call `onChange` and schedule another save in a loop. The single socket is a `HostSocket` whose `send` is `options.send`; the `SocketSet` returns that one socket. Identity is `{ userId: 'local', towerId: LOCAL_TOWER_ID }`; `join` does nothing. `createDebugFrames` gets `enabled: options.debug` and `isDeveloper: async () => options.debug`.

- [ ] **Step 1:** Write tests with fake timers (`vi.useFakeTimers()`, `now` from `Date.now`):
  - `hello answers a snapshot of the given state`: send a hello frame, expect one sent message with `t: 'snapshot'` and `p.step` equal to the start step.
  - `the clock advances with real time`: after hello, advance timers 10,000 ms, expect a `delta` or `snapshot` with a later step.
  - `a build command answers its commandResult and calls onChange`.
  - `debug frames are refused when debug is false`: a `debug.fastForward` frame answers an error with code `NOT_ALLOWED`.
  - `saved state carries the real money with infinite money on`: debug true, send `debug.setInfiniteMoney` enabled, expect `(await savedState()).money` to equal the start money.
  - `stop sends nothing more`: after `stop()`, advancing timers 5,000 ms adds no sent messages.
  - `savedState does not call onChange`.
- [ ] **Step 2:** Run them. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `LocalSession` and export it and `LOCAL_TOWER_ID` from `src/index.ts`.
- [ ] **Step 4:** Run `pnpm --filter @tower-magnate/host exec vitest run`. Expected: PASS.
- [ ] **Step 5:** Commit `Add a local session that runs one tower without a server`, restart the stack.

### Task 6: Play and save endpoints on the server

**Files:**
- Create: `apps/server/migrations/0003_play_token_and_gzip_snapshots.sql`, `apps/server/src/towers/play.ts`, `apps/server/src/towers/play.test.ts`
- Modify: `apps/server/src/snapshots.ts`, `apps/server/src/towers/routes.ts`, `apps/server/src/towers/repository.ts` (`resetTowerOf` also sets `play_token = null`), `packages/shared/src/account.ts`, `apps/server/src/snapshots.test.ts`

**Interfaces:**
- Migration:

```sql
alter table towers add column play_token text;
alter table tower_snapshots add column state_gz bytea;
alter table tower_snapshots alter column state drop not null;
```

- `packages/shared/src/account.ts` adds:

```ts
export const PLAY_TOKEN_HEADER = 'x-play-token';
export const TOWER_PLAY_PATH = '/api/tower/play';
export const TOWER_STATE_PATH = '/api/tower/state';
export interface PlayResponse { token: string; state: unknown; }
```

- `snapshots.ts`: `SnapshotRepository.save` stays for the old runner until Task 11. Add `saveCompressedSnapshot(client: pg.PoolClient, towerId: TowerId, step: number, gzipped: Buffer): Promise<void>` (upsert into `state_gz`, set `state` to null, prune to `SNAPSHOTS_KEPT`, on the caller's client so it joins the caller's transaction). `loadLatest` reads `state_gz` when not null (`gunzipSync`, then `deserializeState`) and falls back to `state::text`.
- `play.ts`:

```ts
export async function startPlay(pool: pg.Pool, userId: number): Promise<PlayResponse | null>;
export type SaveOutcome = 'saved' | 'stale' | 'noTower';
export async function savePlayedState(pool: pg.Pool, userId: number, token: string, gzipped: Buffer): Promise<SaveOutcome>;
export class InvalidSaveError extends Error {}  // bad gzip, too large, or deserializeState throws
export const MAX_SAVE_BYTES = 4 * 1024 * 1024;
export const MAX_STATE_BYTES = 32 * 1024 * 1024;
```

`startPlay` makes a token with `randomBytes(32).toString('base64url')`, writes it to `towers.play_token`, and returns the latest snapshot state or `createTower(seed)` when there is none. `savePlayedState` first validates outside the transaction (`gunzipSync(gzipped, { maxOutputLength: MAX_STATE_BYTES })`, then `deserializeState`, throwing `InvalidSaveError`), then in one transaction runs `select id, play_token from towers where user_id = $1 for update`, compares the token, and calls `saveCompressedSnapshot` with the step of the parsed state.
- Routes: `POST /api/tower/play` answers 200 `PlayResponse`, 401 not logged in, 404 no tower. `PUT /api/tower/state` registers a content type parser for `application/octet-stream` with `bodyLimit: MAX_SAVE_BYTES` returning a `Buffer`; answers 204 saved, 400 `InvalidSaveError`, 401, 404 `noTower`, 409 `stale`, 413 over the body limit. Error bodies use the existing `AuthErrorBody` shape with Spanish messages.

- [ ] **Step 1:** Write tests in `play.test.ts` against the shared test Postgres (`apps/server/src/testing/shared-postgres.ts`, `towers.ts` helpers):
  - `play returns a fresh tower from the seed when never saved`: `state.step` is 0.
  - `play returns the latest saved state`.
  - `a save with the current token is stored and loads back`: save a state at step 500 gzipped, play again, expect step 500.
  - `a save with an old token answers 409 and writes nothing`: play twice, save with the first token, expect `stale`, latest snapshot unchanged.
  - `token check and write are atomic`: start a save with token A and, while it waits on the row lock (hold `for update` on the row in a separate client), call `startPlay`; expect the save to be either stored before the new token or `stale`, never stored after.
  - `reset clears the token`: after `resetTowerOf`, a save with the old token is `stale`.
  - `invalid gzip, oversize and unparsable states throw InvalidSaveError`.
  - `old jsonb snapshots still load`: insert a row with `state` jsonb and null `state_gz`, `startPlay` returns it.
  - Route tests: 401 without session, 409 body for a stale token, 204 on success, 413 over 4 MB.
- [ ] **Step 2:** Run `pnpm --filter @tower-magnate/server exec vitest run src/towers/play.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3:** Write the migration, `play.ts`, the snapshot changes and the routes.
- [ ] **Step 4:** Run `pnpm lint && pnpm typecheck && pnpm test`. Expected: all pass.
- [ ] **Step 5:** Commit `Add play and save endpoints with a single active play token`, restart the stack. The old runner still runs; nothing calls the new endpoints yet.

### Task 7: Save scheduler, codec and uploader for the Worker

**Files:**
- Create: `apps/web/src/worker/saveCodec.ts`, `apps/web/src/worker/saveCodec.test.ts`, `apps/web/src/worker/saveScheduler.ts`, `apps/web/src/worker/saveScheduler.test.ts`, `apps/web/src/worker/stateUploader.ts`, `apps/web/src/worker/stateUploader.test.ts`

**Interfaces:**
- `saveCodec.ts`: `gzipText(text: string): Promise<Uint8Array>` with `CompressionStream('gzip')`. Its test starts with `// @vitest-environment node` and checks the bytes `gunzipSync` back to the input.
- `stateUploader.ts`: `export type UploadOutcome = 'saved' | 'failed' | 'stale'; export function uploadState(body: Uint8Array, token: string, fetchImpl?: typeof fetch): Promise<UploadOutcome>`. `PUT` to `TOWER_STATE_PATH`, headers `Content-Type: application/octet-stream` and `PLAY_TOKEN_HEADER: token`, `credentials: 'same-origin'`. 204 is `saved`, 409 is `stale`, any other status or a thrown fetch is `failed`.
- `saveScheduler.ts`:

```ts
export const AUTOSAVE_INTERVAL_MS = 30_000;
export const CHANGE_SAVE_DELAY_MS = 5_000;
export const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000] as const; // the last one repeats
export const SAVE_FAILING_AFTER_MS = 120_000;
export interface SaveSchedulerOptions {
  save: () => Promise<UploadOutcome>;
  onFailingChange: (failing: boolean) => void;
  onStale: () => void;
  now?: () => number;
}
export class SaveScheduler {
  constructor(options: SaveSchedulerOptions);
  start(): void;          // arms the 30 s autosave
  changed(): void;        // (re)arms a save 5 s from now
  saveNow(): void;        // saves at once, or right after the save in flight
  stop(): void;
}
```

Rules: one save in flight at a time; a request during a save runs once after it. A successful save resets the retry index, re-arms autosave and, when failing was on, calls `onFailingChange(false)`. A failed save schedules a retry by `RETRY_DELAYS_MS` and, once `now - lastSuccess >= SAVE_FAILING_AFTER_MS` (with `lastSuccess` starting at `start()`), calls `onFailingChange(true)` once. `stale` stops every timer, calls `onStale` once and ignores later calls.

- [ ] **Step 1:** Write scheduler tests with fake timers and a scripted `save` mock:
  - `autosaves every 30 s`
  - `changed saves once 5 s after the last change`: three `changed()` 1 s apart give one save at 7 s.
  - `saveNow during a save runs one more save after it`
  - `retries at 5, 15, 30 then every 60 s`
  - `reports failing after two minutes without a save and clears it on success`
  - `stale stops every timer and never saves again`
  - uploader tests for 204, 409, 500 and a thrown fetch; codec round trip.
- [ ] **Step 2:** Run `pnpm --filter @tower-magnate/web exec vitest run src/worker`. Expected: FAIL, modules not found.
- [ ] **Step 3:** Implement the three modules.
- [ ] **Step 4:** Run it again. Expected: PASS. Then `pnpm lint && pnpm typecheck && pnpm test`.
- [ ] **Step 5:** Commit `Add the save scheduler and uploader for the tower worker`, restart the stack.

### Task 8: The tower Worker and `WorkerSocket`

**Files:**
- Create: `apps/web/src/worker/workerMessages.ts`, `apps/web/src/worker/towerWorker.ts`, `apps/web/src/worker/workerHost.ts`, `apps/web/src/worker/workerHost.test.ts`, `apps/web/src/net/towerLink.ts`, `apps/web/src/net/workerSocket.ts`, `apps/web/src/net/workerSocket.test.ts`
- Modify: `apps/web/package.json` (dep `@tower-magnate/host`), `apps/web/tsconfig.json` (reference), `apps/web/src/net/gameConnection.ts`, `apps/web/src/net/useGameConnection.ts`, `apps/web/src/api/towerApi.ts`

**Interfaces:**
- `workerMessages.ts`:

```ts
export type PageToWorker =
  | { kind: 'start'; state: unknown; token: string; debug: boolean }
  | { kind: 'client'; data: string }
  | { kind: 'saveNow' }
  | { kind: 'readState' }      // dev hook for e2e, answered with 'state'
  | { kind: 'stop' };
export type WorkerToPage =
  | { kind: 'server'; data: string }
  | { kind: 'saveFailing'; failing: boolean }
  | { kind: 'takenOver' }
  | { kind: 'outdated' }
  | { kind: 'state'; state: TowerState }
  | { kind: 'fatal'; message: string };
```

- `workerHost.ts` holds the logic so it can be tested without a real Worker: `export function createWorkerHost(post: (message: WorkerToPage) => void, deps?: { upload?: typeof uploadState; now?: () => number }): { handle(message: PageToWorker): Promise<void> }`. On `start`: if `state.schemaVersion > SCHEMA_VERSION` post `outdated` and stop there; else `migrateState`, create a `LocalSession` (`send` posts `server`, `onChange` calls `scheduler.changed()`) and a `SaveScheduler` whose `save` does `serializeState(await session.savedState())`, `gzipText`, `upload(body, token)`; `onStale` stops the session and posts `takenOver`; `onFailingChange` posts `saveFailing`. Client frames that arrive before start finishes wait for it (the session already queues them). `saveNow` calls `scheduler.saveNow()`. `stop` stops both. A thrown error posts `fatal`.
- `towerWorker.ts` is only `const host = createWorkerHost((m) => self.postMessage(m)); self.onmessage = (e) => void host.handle(e.data);`.
- `towerLink.ts`:

```ts
export interface TowerLink {
  readonly connectionStatus: ConnectionStatus;
  connect(): void;
  stop(): void;
  resync(): void;
  send(message: ClientMessage): boolean;
  sendDebug(type: string, payload: Record<string, unknown>): boolean;
}
```

`GameSocket` already fits and declares `implements TowerLink`. `GameConnection.socket` becomes `TowerLink`. `createGameConnection(createLink: (sink: MessageSink) => TowerLink, now?)`.
- `workerSocket.ts`:

```ts
export interface WorkerLike { postMessage(message: PageToWorker): void; terminate(): void; onmessage: ((event: MessageEvent<WorkerToPage>) => void) | null; }
export interface WorkerSocketOptions {
  sink: MessageSink;
  play: PlayResponse;
  debug: boolean;
  createWorker?: () => WorkerLike;   // default: new Worker(new URL('../worker/towerWorker.ts', import.meta.url), { type: 'module' })
  validate?: boolean;
  onStatus?: (status: ConnectionStatus) => void;
  onTakenOver?: () => void;
  onOutdated?: () => void;
  onSaveFailing?: (failing: boolean) => void;
  visibility?: { readonly hidden: boolean; addEventListener(type: 'visibilitychange', listener: () => void): void; removeEventListener(type: 'visibilitychange', listener: () => void): void };  // default: document
}
export class WorkerSocket implements TowerLink { constructor(options: WorkerSocketOptions); /* ... */ }
```

`connect()` creates the Worker, posts `start`, then posts a hello frame; status `connecting` until the first `server` message, then `live`. `server` messages are parsed (and validated when `validate`) like `GameSocket.parse` and given to the sink. `takenOver` and `outdated` set status `closed` and call their callback. `visibilitychange` with `hidden` true posts `saveNow`. `stop()` posts `stop`, terminates the Worker, removes the listener, status `closed`. No ping, no retry.
When `debug` is true, `connect()` also sets `globalThis.__towerMagnate = { sendFrame(text: string): void, readState(): Promise<TowerState> }` for e2e; `stop()` deletes it.
- `towerApi.ts` adds `play(): Promise<PlayResponse | null>` (`POST TOWER_PLAY_PATH`, null on any non-200).
- `useGameConnection({ play, debug, onTakenOver, onOutdated, onSaveFailing })` builds a `WorkerSocket`. `debug` is `developer || import.meta.env.DEV`.

- [ ] **Step 1:** Write `workerHost.test.ts` (`// @vitest-environment node`, fake timers, `upload` mock):
  - `a state with a newer schemaVersion reports outdated and does not start`
  - `start then hello posts a snapshot`
  - `a 409 upload posts takenOver and stops the session`: after `takenOver`, advancing 10 s posts no `server` messages.
  - `saveNow uploads gzipped state that deserializes to the current step`
- [ ] **Step 2:** Write `workerSocket.test.ts` with a fake `WorkerLike` and fake visibility:
  - `connect posts start then hello`
  - `status turns live on the first server message and the sink receives it`
  - `takenOver closes and calls onTakenOver`
  - `hiding the page posts saveNow`
  - `stop terminates the worker`
- [ ] **Step 3:** Run `pnpm --filter @tower-magnate/web exec vitest run src/worker src/net`. Expected: new tests FAIL.
- [ ] **Step 4:** Implement the modules and switch `gameConnection.ts` and `useGameConnection.ts`. Until Task 9 wires `play` from `Root`, `App` gets it as a required prop (Task 9 provides it); keep the build green by doing Tasks 8 and 9 in one commit if needed.
- [ ] **Step 5:** Run `pnpm lint && pnpm typecheck && pnpm test`. Expected: all pass.
- [ ] **Step 6:** Commit together with Task 9.

### Task 9: Startup, takeover, outdated, save-failing and reset in the UI

**Files:**
- Create: `apps/web/src/ui/TowerLoader.tsx`, `apps/web/src/ui/TowerLoader.test.tsx`, `apps/web/src/ui/PlayBlocker.tsx` (the takeover and outdated modal)
- Modify: `apps/web/src/ui/Root.tsx`, `apps/web/src/ui/App.tsx`, the status bar component that shows the date (find it under `apps/web/src/ui/status/`), `apps/web/src/ui/spanishStrings.ts`, `apps/web/src/ui/App.test.tsx` (or the existing App test file)

**Interfaces:**
- `TowerLoader({ towerApi, children: (play: PlayResponse) => VNode })`: calls `towerApi.play()` on mount; shows `t('game.loading')` while waiting; on null shows `t('game.loadFailed')` with a `t('game.retry')` button that calls play again.
- `Root` wraps `App` in `TowerLoader` with `key={towerGeneration}`, and passes `play` and a new `onPlayHere` that bumps `towerGeneration`.
- `App` new props: `play: PlayResponse`, `onPlayHere: () => void`. `onRestartTower` in `App` calls `connection.socket.stop()` before `props.onRestartTower()`. `Root.restartTower` bumps `towerGeneration` whether the reset succeeded or not, so the game always comes back.
- `PlayBlocker({ reason: 'takenOver' | 'outdated', onPlayHere })`: modal in the existing 90s window style. Takeover text `La torre se abrió en otra ventana.`, button `Jugar acá` calling `onPlayHere`. Outdated text `Hay una versión nueva del juego.`, button `Recargar` calling `location.reload()`.
- Status bar shows `No se pudo guardar la partida` while save-failing is true.
- Strings: `game.loading` = `Cargando la torre…`, `game.loadFailed` = `No se pudo cargar la torre.`, `game.retry` = `Reintentar`, `game.takenOver`, `game.playHere`, `game.outdated`, `game.reload`, `game.saveFailing` with the texts above.

- [ ] **Step 1:** Write tests:
  - `TowerLoader.test.tsx`: `shows loading then renders children with the play response`; `shows retry on failure and plays again on click`.
  - App test: `restart stops the worker before resetting`: with a fake link, `onRestartTower` mock checks `link.stop` was already called.
  - App test: `takeover shows the blocker and Jugar acá calls onPlayHere`.
  - App test: `save failing shows the status bar warning`.
- [ ] **Step 2:** Run `pnpm --filter @tower-magnate/web exec vitest run src/ui`. Expected: new tests FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm lint && pnpm typecheck && pnpm test`. Expected: all pass.
- [ ] **Step 5:** `pnpm stack up -d --build`. In the browser: log in, build a floor, wait 35 s, reload; the floor is there. Open a second tab; the first shows the takeover modal within 30 s; `Jugar acá` takes it back. Use the game menu reset; no takeover modal appears.
- [ ] **Step 6:** Commit `Run the tower in a browser worker and save it to the server`, restart the stack.

### Task 10: End-to-end tests without the WebSocket

**Files:**
- Modify: `e2e/support/game.ts`, `e2e/saveRestore.spec.ts`, `e2e/pauseResume.spec.ts`
- Delete: `e2e/delta-frames.spec.ts` (it measured network frames that no longer exist)

**Interfaces:**
- Consumes: `globalThis.__towerMagnate` from Task 8. `sendFrame(text)` posts a client frame through the Worker; replies arrive on the page as normal server messages. `readState()` resolves with the Worker's current state.
- `e2e/support/game.ts`: `sendCommand`, `fastForward` and `readTowerState` keep their names and signatures but use `page.evaluate` on `__towerMagnate` instead of a second WebSocket. A reply is matched by command id by listening to the store through a small `__towerMagnate.onServerMessage(callback)` hook added to `WorkerSocket` for this.
- `saveRestore.spec.ts`: after the restart, the tower must come back with the state saved by the browser (wait `AUTOSAVE_WAIT_MS` 32 s before restarting, as today).

- [ ] **Step 1:** Rewrite the support functions and adjust the specs.
- [ ] **Step 2:** Run `pnpm stack up -d --build && pnpm e2e`. Expected: all specs pass.
- [ ] **Step 3:** Commit `Drive end-to-end tests through the tower worker`, restart the stack.

### Task 11: Remove server simulation and update the docs

**Files:**
- Delete: `apps/server/src/gateway/` (all), `apps/server/src/tower-socket/` (what remains: `identity.ts`, `index.ts`, `tower-socket.test.ts` if present), `apps/server/src/debug/` (what remains, including `debug-socket.test.ts`), `apps/server/src/runner/follow-connections.ts`, `apps/server/src/runner/index.ts`, `apps/server/src/bench/{runner-load,load-towers,load-stats,cpu-speed}.ts` and their tests, `apps/server/src/testing/{fake-socket,socket-client}.ts`
- Move: `createTowerStore` from `apps/server/src/runner/tower-store.ts` to `apps/server/src/towers/tower-store.ts` if `startPlay` uses it; otherwise delete it.
- Modify: `apps/server/src/app.ts` (no runner, gateway, broadcaster, inspections; drop the `towerRunner` decoration and the runner/delta/heartbeat options), `apps/server/src/towers/routes.ts` (reset no longer pauses a runner), `apps/server/package.json` (drop `@fastify/websocket`, `@types/ws`, `bench:runner-load`), root `package.json` (drop `bench:runner-load`), `apps/web/vite.config.ts` (drop the `/ws` proxy), `apps/web/src/net/gameSocket.ts` and its test (delete if nothing uses them), `packages/shared/src/protocol/messages.ts` (drop `TOWER_SOCKET_PATH` if unused), `apps/server/src/snapshots.ts` (drop the jsonb `save` path if unused), `apps/server/src/app.test.ts`, `apps/server/src/main.ts` and `config.ts` options that only fed the runner
- Docs: `docs/ARCHITECTURE.md` (Servidor and Cliente web sections, package table: add `packages/host`), `docs/tech/engine-and-protocol.md` (section 1 boundary rule, transport now `postMessage`, the save endpoints), `docs/tech/deploy.md` (no WebSocket, no runner sizing), `docs/tech/performance.md` (a dated note that the server load numbers describe the old server runner)

- [ ] **Step 1:** Delete and edit as listed.
- [ ] **Step 2:** Run `pnpm lint && pnpm typecheck && pnpm test`. Expected: all pass, with no remaining import of `gateway`, `runner` or `tower-socket` in `apps/server` (`grep -rn "gateway\|tower-socket\|TowerRunner" apps/server/src` prints nothing).
- [ ] **Step 3:** Run `pnpm stack up -d --build && pnpm e2e`. Expected: all specs pass.
- [ ] **Step 4:** Commit `Remove the server tower runner and WebSocket gateway`, restart the stack.
