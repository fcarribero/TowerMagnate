# Run and deploy

This guide takes a clean machine to a running game, in development and in production. It covers the local tools, the docker compose stack, every environment variable, the CI workflow, port blocks, and database backup and restore.

## What you need

- Node 22 (the version in `.nvmrc`) and pnpm 10. With Corepack, `corepack enable` picks the pnpm version pinned in `package.json`.
- Docker with the compose plugin, for the local stack, the end-to-end tests and the production image.
- Git.

```bash
git clone https://github.com/fcarribero/TowerMagnate.git
cd TowerMagnate
corepack enable
pnpm install
```

## Run in development

### With the compose stack

The `dev` profile starts postgres, the server and the Vite dev server. The containers mount the repository and keep their own `node_modules` in named volumes, so nothing is installed on the host for them.

```bash
cp .env.example .env        # optional; the defaults work
pnpm stack up -d
curl http://localhost:4101/health       # {"status":"ok","version":"0.0.0","database":"ok"}
```

Open http://localhost:4102 for the game. The first start takes a few minutes while the containers install dependencies. Follow the progress with `pnpm stack logs -f server`.

`pnpm stack` wraps `docker compose`, reads `.env` and derives the ports from `PORT_BASE`. It runs the `dev` profile unless `COMPOSE_PROFILES` says otherwise. Stop with `pnpm stack down`, and add `-v` to delete the database volume as well.

### Without the compose stack

Start only postgres in a container and run the two Node processes on the host:

```bash
pnpm stack up -d postgres
export DATABASE_URL=postgres://tower:tower@localhost:4100/tower_magnate
pnpm art:build                              # sprites and atlases, needed once
pnpm --filter @tower-magnate/server dev     # server on http://localhost:3000
pnpm dev                                    # web on http://localhost:5173, in another terminal
```

The dev server proxies `/api` and `/ws` to the game server. Set `TM_SERVER_URL` and `TM_WEB_PORT` to change that.

If your `.env` sets another password or `PORT_BASE`, change `DATABASE_URL` to match.

### Checks

```bash
pnpm lint        # ESLint, then a Prettier check
pnpm typecheck   # runs art:build, then tsc -b
pnpm test        # runs art:build, then Vitest across every package
pnpm e2e         # Playwright, starts its own compose stack
```

Server tests start a postgres container through testcontainers. To use a running postgres instead, set `TEST_DATABASE_URL`. Install the e2e browser once with `pnpm exec playwright install chromium`.

## Port blocks

Every stack uses three consecutive ports starting at `PORT_BASE`: postgres on `PORT_BASE`, the server on `PORT_BASE + 1` and web on `PORT_BASE + 2`. The default `PORT_BASE` is 4100. To run several stacks at the same time, give each one its own `PORT_BASE` and its own `COMPOSE_PROJECT_NAME`:

```bash
COMPOSE_PROJECT_NAME=tm-two PORT_BASE=4110 pnpm stack up -d
```

The end-to-end run uses project `tm-e2e` and base 4300 unless you set `PORT_BASE` or `COMPOSE_PROJECT_NAME`. The team's blocks are 4100 + 10 times the member's index (PM 0, TL 1, BE 2, BP 3, FR 4, FU 5, PA 6, GD 7, SD 8, QA1 9, QA2 10).

## Run in production

`docker/prod/Dockerfile` builds the web client with Vite, bundles the server with esbuild and installs only the server's production dependencies. The image runs `node build/main.js` as the `node` user and serves the web build from `/app/web` on port 3000. Files in `assets/` have hashed names and are cached for a year. Every other file, and the game page returned for unknown page routes, is revalidated on each request.

The `prod` profile runs `postgres` and `app`. The app applies pending migrations on start.

```bash
cp .env.example .env
# set POSTGRES_PASSWORD in .env
pnpm stack --profile prod up -d --build
curl http://localhost:4101/health
```

`pnpm stack` sets `COMPOSE_PROFILES=dev` unless the variable is set, and compose merges it with `--profile prod`, so set `COMPOSE_PROFILES=prod` in `.env` to run only the production services. The game is at http://localhost:4101, served by the app itself with no separate web container. Stop with `pnpm stack --profile prod down`.

The session cookie gets the `Secure` flag in production, so a browser only keeps it over https. Put a TLS proxy in front of the app, or set `SECURE_COOKIES=false` when the game is reached over plain http. The compose file does not pass `SECURE_COOKIES` to the `app` service; to set it, add it to the service's `environment`.

## Environment variables

### Read by the server

| Variable           | Default                                    | Meaning                                                                                                                   |
| ------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`     | none, required                             | Postgres connection string. The server and the `migrate` script stop with an error when it is missing.                    |
| `HOST`             | `0.0.0.0`                                  | Address the server binds to.                                                                                              |
| `PORT`             | `3000`                                     | Port the server listens on, 0 to 65535.                                                                                   |
| `LOG_LEVEL`        | `info`                                     | One of `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`.                                                      |
| `MIGRATE_ON_START` | `true`; `false` when `NODE_ENV=production` | `true` or `false`. Applies pending migrations before the server starts listening.                                         |
| `WEB_DIR`          | unset                                      | Folder with the built web client. When set, the server also serves it. The production image sets `/app/web`.              |
| `SECURE_COOKIES`   | `false`; `true` when `NODE_ENV=production` | `true` or `false`. Adds the `Secure` flag to the session cookie.                                                          |
| `NODE_ENV`         | unset                                      | `production` changes the defaults of `MIGRATE_ON_START` and `SECURE_COOKIES`. The production image sets it.              |

The production image sets `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=3000` and `WEB_DIR=/app/web`. Compose sets `DATABASE_URL` for both server services and `MIGRATE_ON_START=true` for `app`.

### Read by compose, `pnpm stack` and the tools

Set these in `.env` or in the shell.

| Variable                                   | Default                 | Meaning                                                                                                          |
| ------------------------------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `COMPOSE_PROJECT_NAME`                     | `tower-magnate`         | Prefix for containers, networks and volumes.                                                                     |
| `COMPOSE_PROFILES`                         | `dev` in `pnpm stack`   | `dev` or `prod`. Plain `docker compose` starts only postgres when it is unset.                                   |
| `PORT_BASE`                                | `4100`                  | First port of the block, 1 to 65533.                                                                             |
| `POSTGRES_PORT`, `SERVER_PORT`, `WEB_PORT` | `PORT_BASE`, `+1`, `+2` | Override one port of the block. Plain `docker compose` falls back to 4100, 4101 and 4102.                        |
| `POSTGRES_USER`                            | `tower`                 | Database user created on the first start.                                                                        |
| `POSTGRES_PASSWORD`                        | `tower`                 | Password for that user. `.env.example` sets `change-me`.                                                         |
| `POSTGRES_DB`                              | `tower_magnate`         | Database name.                                                                                                   |
| `CHOKIDAR_USEPOLLING`                      | `true`                  | Dev watchers poll for changes, because file events do not cross a Windows bind mount. Use `false` on Linux or macOS. |
| `TM_SERVER_URL`                            | `http://localhost:3000` | Where the Vite dev server proxies `/api` and `/ws`. The compose `web` service sets `http://server:3000`.         |
| `TM_WEB_PORT`                              | `5173`                  | Port of the Vite dev server.                                                                                     |
| `TEST_DATABASE_URL`                        | unset                   | Postgres for the server tests. Without it the tests start a container.                                           |
| `BASE_URL`                                 | unset                   | Web address of a running stack for `pnpm e2e`. Without it the run starts its own stack.                          |
| `CI`                                       | unset                   | When set, Playwright retries once and writes an HTML report.                                                     |

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request to `develop` or `master` and on every push to those branches. A newer run on the same ref cancels the older one.

- `check` runs on Ubuntu with the Node version from `.nvmrc`: `pnpm install --frozen-lockfile`, `pnpm art:build`, `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm bench:snapshots`. It times out after 10 minutes.
- `e2e` runs only for pull requests into `develop`. It installs Chromium and runs `pnpm e2e` against the compose stack. When it fails it uploads `e2e/test-results` and `e2e/playwright-report` as the `e2e-traces` artifact, kept for 7 days. It times out after 20 minutes.

Open a trace with `pnpm exec playwright show-trace <path>/trace.zip`.

## Database

Migrations are plain SQL files in `apps/server/migrations`, applied in name order. Each file runs in its own transaction and is recorded in `schema_migrations` with a checksum, so an applied file must never be edited. Add a new file instead.

The server applies pending migrations on start unless `NODE_ENV=production`. Run them by hand with:

```bash
DATABASE_URL=postgres://tower:tower@localhost:4100/tower_magnate pnpm --filter @tower-magnate/server migrate
```

### Backup

Run `pg_dump` inside the postgres container, so no client tools are needed on the host. The custom format is compressed and works with `pg_restore`. The commands below use `pnpm -s stack exec`, which reads `.env` and the same project and ports as the stack you started. The `-s` flag keeps pnpm from printing its banner into the dump file. For the production stack, write `pnpm -s stack --profile prod exec`.

```bash
mkdir -p backups
pnpm -s stack exec -T postgres pg_dump -U tower -d tower_magnate --format=custom > backups/tower.dump
```

Use the values of `POSTGRES_USER` and `POSTGRES_DB` from your `.env` in place of `tower` and `tower_magnate`. For a postgres outside compose, run `pg_dump "$DATABASE_URL" --format=custom --file backups/tower.dump` instead.

### Restore

Stop the app so nothing writes during the restore, restore, then start it again. In production the service is `app` and the commands take `--profile prod`.

```bash
pnpm stack stop server
pnpm -s stack exec -T postgres pg_restore -U tower -d tower_magnate --clean --if-exists --no-owner < backups/tower.dump
pnpm stack start server
```

`--clean --if-exists` drops each object before it is recreated, so the restore also works on a database that already has the tables. To restore into a new, empty postgres, start the stack once so the database exists, then run the same command.

To check a backup without touching the live data, restore it into a scratch database and count rows:

```bash
pnpm -s stack exec -T postgres createdb -U tower tower_check
pnpm -s stack exec -T postgres pg_restore -U tower -d tower_check --no-owner < backups/tower.dump
pnpm -s stack exec -T postgres psql -U tower -d tower_check -c "select count(*) from users"
pnpm -s stack exec -T postgres dropdb -U tower tower_check
```
