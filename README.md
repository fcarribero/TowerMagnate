# Tower Magnate

Tower building and management sim that runs in the browser.

Design: [docs/GDD.md](docs/GDD.md). Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Requirements

Node 22 and pnpm 10. With Corepack, `corepack enable` picks the pnpm version pinned in `package.json`.

## Commands

```bash
pnpm install     # install every workspace package
pnpm lint        # ESLint, then a Prettier check
pnpm typecheck   # tsc -b over all project references
pnpm test        # Vitest across every package
pnpm format      # rewrite files with Prettier
```

To work on one package, filter by name, for example `pnpm --filter @tower-magnate/engine exec vitest`.

## Web client

```bash
pnpm dev        # Vite dev server on port 5173
pnpm build      # static build in apps/web/dist
pnpm art:build  # draw the sprites, atlases, previews and atlas manifest
```

The dev server proxies `/api` and `/ws` to the game server. Set `TM_SERVER_URL` (default `http://localhost:3000`) and `TM_WEB_PORT` (default `5173`) to change them, for example `TM_WEB_PORT=4140 pnpm --filter web dev`.

## Layout

| Path              | Contents                                                 |
| ----------------- | -------------------------------------------------------- |
| `packages/engine` | Simulation engine. Pure TypeScript with no runtime deps. |
| `packages/shared` | Types, catalog, balance constants and the wire protocol. |
| `apps/server`     | Node server: auth, persistence and the tower runner.     |
| `apps/web`        | Browser client.                                          |
| `tools/*`         | Standalone asset tooling (art, sound).                   |
| `tests`           | Repository-level checks, such as the engine lint rules.  |

The engine must stay deterministic. ESLint fails on `Math.random`, `Date`, timers and IO inside `packages/engine`.

A new TypeScript package needs its own `tsconfig.json` extending `tsconfig.base.json` and an entry in the root `tsconfig.json` references.

## Continuous integration

`.github/workflows/ci.yml` runs `pnpm art:build`, `pnpm lint`, `pnpm typecheck` and `pnpm test` on Node 22 for every pull request to `develop` or `master` and for every push to those branches. The pnpm store is cached between runs.

## End-to-end tests

`pnpm e2e` runs the Playwright tests in `e2e/`. Install the browser once with `pnpm exec playwright install chromium`.

By default the run starts its own compose stack (project `tm-e2e`, ports from `PORT_BASE`, default 4300), waits for `/api/health` and stops the stack at the end. To test a stack that is already running, set `BASE_URL` to the web address, for example `BASE_URL=http://localhost:4102 pnpm e2e`.

`e2e/support` has helpers: `uniqueUser()` and `registerUser(request)` create fresh accounts, and `openGame(page)` loads the client and waits for the canvas. Failed tests keep a trace in `e2e/test-results`; open it with `pnpm exec playwright show-trace <path>/trace.zip`. CI runs the suite on pull requests to `develop` and uploads the traces as the `e2e-traces` artifact when it fails.

## Local stack

`docker compose up` starts `postgres` (16, data in a named volume), `server` (`pnpm dev` in `apps/server`, restarts on change) and `web` (`pnpm dev` in `apps/web`, called with `--host 0.0.0.0 --port 5173 --strictPort`). The containers mount the repository and keep their own `node_modules` in named volumes, so the host install is never touched.

Copy `.env.example` to `.env` to change the project name, ports or database credentials. To run several stacks side by side, use `pnpm stack`, which wraps `docker compose` and derives the ports from `PORT_BASE`: postgres on `PORT_BASE`, the server on `PORT_BASE + 1` and web on `PORT_BASE + 2`.

```bash
COMPOSE_PROJECT_NAME=tm-dev PORT_BASE=4190 pnpm stack up -d
curl http://localhost:4191/health       # {"status":"ok","version":"0.0.0","database":"ok"}
curl http://localhost:4192/api/health   # same report, proxied by the web dev server
pnpm stack down -v                      # remove containers and volumes
```

## Database

Migrations are plain SQL files in `apps/server/migrations`, applied in name order. Each file runs in its own transaction and is recorded in `schema_migrations` with a checksum, so an applied file must never be edited. Add a new file instead.

The server applies pending migrations on start unless `NODE_ENV=production` (override with `MIGRATE_ON_START`). To run them by hand:

```bash
DATABASE_URL=postgres://tower:tower@localhost:4100/tower_magnate pnpm --filter @tower-magnate/server migrate
```

Server tests start a postgres container through testcontainers. To use a running postgres instead, set `TEST_DATABASE_URL`; each test suite then creates its own scratch database on that server and drops it afterwards. `startTestDatabase({ migrate: true })` in `apps/server/src/testing/database.ts` returns a database with the schema already applied.

Timing budgets are checked by benchmark scripts, not by the test suite, because wall-clock checks are unreliable while vitest runs suites in parallel. `pnpm bench:snapshots` saves a 1 MB tower state 30 times after 5 warmup saves and fails if the median save takes 50 ms or more. CI runs it as its own step after the tests.
