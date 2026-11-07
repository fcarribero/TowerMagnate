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
pnpm --filter web dev     # Vite dev server on port 5173
pnpm --filter web build   # static build in apps/web/dist
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

`.github/workflows/ci.yml` runs `pnpm lint`, `pnpm typecheck` and `pnpm test` on Node 22 for every pull request to `develop` or `master` and for every push to those branches. The pnpm store is cached between runs.
