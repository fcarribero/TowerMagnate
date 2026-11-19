# Client-side engine

Date: 18 November 2026. Changes the server and client split of `docs/ARCHITECTURE.md` and the transport of `docs/tech/engine-and-protocol.md`.

## Intent

Today every active tower runs on the server. One process holds 30 to 40 towers per core (`docs/tech/performance.md`), and each client pulls about 50 KB/s of deltas. The hosting cost grows in a straight line with the number of players online at the same time.

The engine moves into the player's browser. The server keeps accounts and stores the saved state. The browser sends the state to the server every so often, and when the game is opened again it loads the last saved state from the server. Server cost then stays close to flat as players grow.

Goals:

- The simulation runs in the browser, in a Web Worker, with the same engine code the server runs today.
- The server stores saves and serves them. It no longer runs any tower.
- One active play session per tower. Opening the tower in a second tab or on another machine takes it over, and the old one stops and says so.
- The game plays and looks the same as today. Rendering, panels and stores keep working on the same messages.
- Progress is not lost silently. A failed save is retried and shown to the player when it keeps failing.

Non-goals:

- Anti-cheat. The player owns the state and can edit it. There are no leaderboards or shared economy that would need it. If those come later, the deterministic engine allows the server to re-simulate commands, but that is not part of this work.
- Progress while the tab is closed. The tower pauses when the game is closed, same as today when the last socket closes.
- Playing without network. Loading needs the server; once loaded, the game keeps running if saves fail and retries them.
- Rewriting the client model to read engine state directly (see Approaches).
- Porting to Unity or any other engine.

Anti-goals:

- A stale tab overwriting newer progress.
- Simulation work making scrolling or animation stutter.
- Two copies of the simulation or view code to keep in sync.

## Approaches

1. A local server in a Web Worker that speaks the current protocol. The runner and the view builders that live in `apps/server/src/tower-socket` move to a new package and run inside a Worker. The page talks to the Worker through `postMessage` with the same `ClientMessage` and `ServerMessage` envelopes it sends over the WebSocket today. The page model, rendering and UI do not change. The simulation stays off the drawing thread. The cost is that snapshots and deltas are still built and diffed even though they no longer cross a network; that is a few milliseconds per delta and can be optimized later.
2. Engine on the main thread with no protocol. The client reads engine state directly and the snapshot and delta layer is deleted. Less code in the long run, but the stores and everything rendering consumes in `apps/web/src/model` and `apps/web/src/render` would have to be rewritten, and each step competes with drawing on the same thread.
3. Keep server simulation and optimize it (avoid the per-step `structuredClone`, batch steps). Raises towers per core several times but cost still grows with players online.

Picked: approach 1. It removes the server cost with the smallest change to the client and keeps the existing snapshot, delta and inspect tests useful. Approach 2 stays possible later.

Session conflicts: one active session per tower (option A). The alternative, last save wins, was rejected because a forgotten tab could overwrite progress without anyone noticing.

## Design

### New package: `packages/host`

Holds everything that today turns engine state into protocol messages and moves a tower with the clock. It depends on `engine` and `shared`, and has no Node, DOM, network or database imports, so it runs in a Worker and in Vitest.

Moves from `apps/server/src`:

- `runner/tower-runner.ts` and `runner/real-time.ts`. The runner keeps its clock logic (catch-up from elapsed real time, `starsPending` hold, speed, infinite money, layout version). It can be simplified to one tower. Its `TowerStore` becomes the save sink described below.
- `tower-socket/`: `snapshot.ts`, `delta.ts`, `delta-broadcaster.ts`, `inspect.ts`, `inspections.ts`, `heat-view.ts`, `client-events.ts`, `disconnected-units.ts`, `viewports.ts`, `notice-params.ts`, `same-data.ts`, and the message handling in `handlers.ts`.
- `debug/` (debug message schemas and handlers).
- Their tests.

The coupling to the server gateway (`GatewaySocket`, `ConnectionRegistry`, `sendMessage`, `sendError`) is replaced by a small port interface: something that accepts a server message and something that delivers client messages. With one session there is one port, so per-socket maps (`WeakMap<GatewaySocket, ...>`) can become plain fields.

### Worker

`apps/web/src/worker/` holds the Worker entry. On start it receives the loaded state and the play token from the page, creates the host, and starts two timers: the runner tick (100 ms) and the delta broadcast (200 ms), the same intervals as the server today. It answers `hello`, `command`, `viewport`, `inspect`, `inspectAdd`, `inspectRemove`, `heat`, `ping` and the debug messages exactly as the server does.

Messages cross as the same JSON text the WebSocket carries today, so the client parsing path is unchanged. Moving to structured-clone objects is a later optimization.

Browsers throttle timers in hidden tabs. That is fine: the runner already advances by elapsed real time, so a late tick runs more steps at once.

### Page side

`GameSocket` gets a sibling, `WorkerSocket`, with the same surface the rest of `apps/web/src/net` uses (`send`, `resync`, and the `sink` with `receive` and `reconnected`). `createGameConnection` builds a `WorkerSocket` instead of a `GameSocket`. `ClientStore`, `InspectStore`, `CommandClient` and `ViewportReporter` are unchanged.

Startup in `App.tsx`: after login, the page calls `POST /api/tower/play`, gets the play token and the state, starts the Worker with both, and then the existing connection flow runs (`hello`, snapshot, deltas).

The rule "apps/web never imports the engine" is dropped. Only the Worker bundle imports `host` and `engine`; the main bundle keeps its current imports (`engine/calendar`, `engine/weather`).

### Saving

The Worker owns saving. It serializes the state with `serializeState`, gzips it with `CompressionStream`, and sends it with `PUT /api/tower/state`, carrying the play token. The state saved is the real one: with infinite money on, it carries the money kept aside, as `savedState()` does today.

When it saves:

- every 30 seconds while running, as today;
- 5 seconds after the last accepted command, so dragging a long floor gives one save, not dozens;
- 5 seconds after a debug change (clock jump, scenario load);
- right away when the page becomes hidden (`visibilitychange` to hidden). The page tells the Worker, and the Worker starts a normal save. Switching tabs or minimizing gives it time to finish. Closing the tab may cut it off.

Measured on 18 November 2026: the vertical slice tower is 102 KB of JSON and 16 KB gzipped. The full tower of `engine/testing` (`fullTower()`, 15,000 people) is 2.6 MB of JSON and 197 KB gzipped. That is far above the 64 KB that `fetch(..., { keepalive: true })` and `sendBeacon` can carry on page close, so there is no special close-tab send. On tab close the player can lose up to 30 seconds of simulated time. Player actions are saved within 5 seconds, so a build, price change or rename is only lost if the tab closes in those 5 seconds.

Failures: a failed save is retried with backoff (5 s, 15 s, 30 s, then every 60 s). After two minutes without a successful save, the status bar shows "No se pudo guardar la partida" until a save succeeds. The game keeps running.

Worst case after a browser crash or tab close the player loses up to 30 seconds of simulated time, and player actions from the last 5 seconds.

Server load per player is now one save every 30 seconds at most: a gunzip, a JSON parse and migrate to validate, and one row write. For a full tower that is about 200 KB uploaded and a few tens of milliseconds of CPU per save.

### Play sessions

A new column `towers.play_token` (random, like session tokens) holds the token of the active play session.

- `POST /api/tower/play`: creates a new token, stores it, and returns `{ token, state }` with the latest snapshot. When the tower has never been saved, it returns `createTower(seed)` from `towers.seed`, as `TowerStore.load` does today; the first save creates the first snapshot. Any older token stops being valid. Needs a logged-in session that owns a tower.
- `PUT /api/tower/state`: body is the gzipped serialized state, header `X-Play-Token`. Answers 409 when the token is not the current one, and the tab stops (below). Answers 413 above 4 MB compressed or 32 MB uncompressed, and 400 when the state does not parse with `deserializeState` (which migrates). On success it stores the gzipped bytes as they came, in a new `tower_snapshots.state_gz bytea` column, and keeps 3 snapshots as today. Storing gzip instead of `jsonb` makes a full tower save write about 200 KB instead of 2.6 MB. Older rows keep their `jsonb` `state`; loading reads `state_gz` when present and falls back to `state`.
- `POST /api/tower/reset`: as today, it builds a fresh state with `createTower` and also clears the play token, so an open tab gets 409 on its next save.

A save that is in flight when another tab takes over gets 409 like any later one. The server checks the token and writes in one transaction, so a stale save never lands after the takeover.

The reset button lives in the same tab. Resetting stops the Worker first, then calls `/api/tower/reset`, then `/api/tower/play`, and starts a new Worker. The takeover modal is not shown.

On 409 the Worker stops its timers and tells the page. The page shows a modal: "La torre se abrió en otra ventana." with one button, "Jugar acá", which calls `POST /api/tower/play` again and restarts the Worker with the state from the server. Anything this tab had not saved is lost, which is the point: the other tab's progress wins.

The server never compares steps. A smaller step is valid (after a reset, or a debug clock jump).

### Developer menu

The debug messages and developer settings (speed, infinite money, fast forward, set clock, set money, force event, load scenario) run in the Worker. They are available when `/api/account` says `developer: true`, as today. Since the player owns the state, this gate is a convenience, not a security boundary. The save format carries no record of debug changes; nothing on the server needs to tell them apart. The config `debugCommands` and the developer usernames stay on the server only to set that flag.

### What the server loses

Removed from `apps/server`: the runner, the WebSocket gateway and its plugin, `tower-socket/`, `debug/`, `follow-connections.ts`, the per-tick save logic, and the WebSocket dependencies. The runner and person-view benchmarks move to `packages/host` or are deleted if they only measure server load. The server keeps auth, the account and tower routes, the snapshot repository, migrations, static files, security headers and health checks. It still depends on `engine` for `createTower`, `deserializeState` and `migrateState`.

Existing saves in `tower_snapshots` load as they are. The schema changes are the two new columns, `towers.play_token` and `tower_snapshots.state_gz`, with `tower_snapshots.state` becoming nullable.

### Versions

A client built before a deploy may hold an older engine than the server. On load the Worker starts and checks the saved state's `schemaVersion` before it migrates anything. If the version is newer than the Worker's engine knows, the Worker reports the state as outdated without running it, and the page shows the blocker that asks the player to reload. Saves from an older client are accepted: the server only checks that the state parses and migrates, and the next load migrates it forward. An old client never runs a newer state, because of the check above.

### Docs

`docs/ARCHITECTURE.md`, `docs/tech/engine-and-protocol.md` (transport section and the package boundary rule), `docs/tech/deploy.md` (no WebSocket, no runner sizing) and `docs/tech/performance.md` (server load numbers no longer apply) are updated in the same work.

## Order of work

1. Extract `packages/host` with the port interface, and keep the server running on it. No behavior change; existing tests pass. The tests of the moved code (snapshot, delta, inspect, runner, debug handlers) move with it and run against the host directly. The server tests that go through a real WebSocket (`tower-socket.test.ts`, `debug-socket.test.ts`) stay until step 4 and are deleted there, once the host tests cover the same cases.
2. Add the play and state endpoints and the `play_token` column.
3. Add the Worker, `WorkerSocket` and the save logic, and switch the client to them.
4. Remove the runner and WebSocket code from the server. Update e2e tests and docs.

Each step is committed to `develop` and the stack is restarted after it.

## Left to the builder

- The exact shape of the port interface and whether the runner keeps multi-tower support.
- Worker bundling with Vite (`new Worker(new URL(...), { type: 'module' })` is the expected path).
- Whether the save timer debounce and retry intervals need small adjustments after testing.
- How e2e tests drive the game now that there is no WebSocket to observe.
