# Stress score and fair price implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show stress as a 0 to 10 score, make each unit's appraisal a fair price set by its occupants' score, and grade units by fair price over price with a one-step neighbor pull.

**Architecture:** One pure conversion `stressScore(steps)` in `packages/shared` is used by engine, server and web. Trips keep recording steps. The engine gets a small `unit-value.ts` that computes a unit's occupant score, fair price and value (with the neighbor pull), and `evaluation.ts`/`appraisal.ts`/`unit-evaluation.ts` are rewired onto it. Server and web only change what they send and show.

**Tech Stack:** TypeScript, pnpm workspaces, vitest, zod (protocol), Preact (web).

**Spec:** `docs/superpowers/specs/2026-11-18-stress-score-design.md`

## Global constraints

- Score: `S = 10 × (1 − e^(−P / 180))`, P in steps. Rules read the exact value; one decimal only for display.
- Occupant percent of the fair price: +30 at S 0, 0 at S 3, −50 at S 10, straight lines between.
- Fair price clamp stays 60% to 160% of the base price (`APPRAISAL_RANGE_PERCENT`). Stars and amenities terms unchanged.
- Noise adds 1.0 to the unit score, capped at 10.
- Tower score with no trips filed: 3.0.
- Grade from value v: good at 1.0 or more, fair from 0.8, poor below 0.8; at 4 stars or more poor only below 0.7.
- Neighbor pull: `v − 0.15 × (v − n)` with n the lowest neighbor own value, only when n < v.
- Venue factor: `1 − 0.04 × S`. VIP rule unchanged (steps vs `VIP_MAX_STRESS_STEPS`).
- Sprite tints: normal under 4, pink 4 to under 7, red 7 or more.
- No new stored state fields. Save format unchanged.
- Commit each task directly on `develop`. Never restart the stack. No `Co-Authored-By` trailer. Commit messages and docs in plain human English (see user CLAUDE.md word list), no em dashes.
- Source files use CRLF line endings; keep them (scripts writing files must use `newline=''`).

## Review focus

1. A unit priced at 0 (or a condo sale price 0): v must be `Infinity`, grade good, no NaN in reasons. Test in Task 3.
2. Two adjacent poor units: each lowers the other by exactly one pull, computed from own values; running the daily grade twice gives the same grades (no drift). Test in Task 3.
3. A neighbor that is vacant (unleased office, unsold condo, empty room) never pulls. Test in Task 3.
4. A unit with a hotel stay whose `paidRatio` is set: the room's own value uses `paidRatio`, not the live price. Test in Task 3.
5. Old saves load and grade at the next 00:00 without errors; appraisals change only at 00:00 or a grade decision. Covered by the existing serialization tests plus the Task 2 test that `storeDailyAppraisals` is idempotent.

---

### Task 1: The score in shared, venue factor and sprite tints

**Files:**
- Create: `packages/shared/src/stress-score.ts`, `packages/shared/src/stress-score.test.ts`
- Modify: `packages/shared/src/index.ts` (export), `packages/shared/src/balance.ts` (new constants), `packages/engine/src/person-stress.ts`, `apps/server/src/tower-socket/snapshot.ts:485-493`
- Test: `packages/engine/src/person-stress.test.ts`, `apps/server` snapshot tests that assert `stress`

**Interfaces:**
- Produces: `stressScore(steps: number): number` (exact, 0 for steps ≤ 0); constants `STRESS_SCORE_SCALE_STEPS = 180`, `STRESS_SCORE_MAX = 10`, `STRESS_SCORE_PINK_FROM = 4`, `STRESS_SCORE_RED_FROM = 7`, `VENUE_FACTOR_PER_POINT = 0.04`.
- `stressBand(steps)` in person-stress keeps its signature and return type but buckets by `stressScore(steps)` against 4 and 7. `venueStressFactor(averageSteps)` returns `1 − VENUE_FACTOR_PER_POINT × stressScore(averageSteps)`. Server `stressLevel(steps)` buckets the same way.

- [ ] **Step 1: Write failing tests**

```ts
// stress-score.test.ts
expect(stressScore(0)).toBe(0);
expect(stressScore(30)).toBeCloseTo(1.535, 2);   // 5 min
expect(stressScore(90)).toBeCloseTo(3.935, 2);   // 15 min
expect(stressScore(180)).toBeCloseTo(6.321, 2);  // 30 min
expect(stressScore(540)).toBeCloseTo(9.502, 2);  // trip cap
expect(stressScore(1e9)).toBeLessThanOrEqual(10);
// person-stress.test.ts
expect(venueStressFactor(0)).toBe(1);
expect(venueStressFactor(180)).toBeCloseTo(1 - 0.04 * 6.321, 3);
expect(stressBand(95)).toBe('normal');   // 3.89
expect(stressBand(98)).toBe('alto');     // 4.2
expect(stressBand(217)).toBe('muy alto'); // 7.0
```

- [ ] **Step 2: Run** `pnpm --filter @tower-magnate/shared test stress-score` and `pnpm --filter @tower-magnate/engine test person-stress`. Expected: FAIL.
- [ ] **Step 3: Implement** the function, constants and the two engine functions; update the server `stressLevel`. Remove `VENUE_STRESS_FACTOR_*` if nothing else reads them. Keep `STRESS_ALTO_FROM`/`STRESS_MUY_ALTO_FROM` until Task 5 removes the last readers.
- [ ] **Step 4: Run** engine, shared and server tests. Fix assertions in existing venue and snapshot tests that encoded the 0.8/0.6 steps; update their expected values to the formula, do not delete them. Expected: PASS.
- [ ] **Step 5: Commit** "Stress reads as a 0 to 10 score for venue factors and person tints".

### Task 2: Occupant score and fair price

**Files:**
- Create: `packages/engine/src/unit-value.ts`, `packages/engine/src/unit-value.test.ts`
- Modify: `packages/engine/src/appraisal.ts`, `packages/engine/src/construction.ts:97`, `packages/shared/src/balance.ts` (remove `APPRAISAL_GRADE_PERCENT`, `APPRAISAL_STRESS_PERCENT`; add `FAIR_PRICE_STRESS_PERCENT = { best: 30, neutralAt: 3, worst: -50 }`, `EVAL_NOISE_SCORE = 1`, `TOWER_SCORE_DEFAULT = 3`)
- Test: `packages/engine/src/appraisal.test.ts`

**Interfaces:**
- Consumes: `stressScore` (Task 1); `unitBase`, `guardedBase` and a new exported `hasTripsInWindow(state, unit): boolean` from `unit-evaluation.ts`; `isNoisy` from `noise.ts`.
- Produces in `unit-value.ts`:
  - `towerScore(state: TowerState): number` — score of the average of all `state.tripLedger` trips, `TOWER_SCORE_DEFAULT` with none.
  - `occupantScore(state: TowerState, unit: Unit, noisy?: boolean): number` — `min(10, stressScore(guardedBase(...)) + (noisy ? 1 : 0))` when the unit has trips in its window, otherwise `min(10, towerScore + noise)`.
  - `occupantPercent(score: number): number` — the +30 / 0 / −50 piecewise line.
- `computeAppraisal(state, unit: Pick<Unit,'type'> & Partial<Unit>, factors?)` drops the grade term and the tower stress term and adds `occupantPercent(score)`, where score is `occupantScore` for a real unit in `state.units` and `towerScore` for a construction site. `AppraisalFactors` becomes `{ amenities: number; towerScore: number }`.

- [ ] **Step 1: Write failing tests** in `unit-value.test.ts` and `appraisal.test.ts`, building towers with the existing `buildTower`/`plainTowerPlan` helpers and filing trips with `fileUnitTrip`:

```ts
expect(occupantPercent(0)).toBe(30);
expect(occupantPercent(3)).toBe(0);
expect(occupantPercent(10)).toBe(-50);
expect(occupantPercent(6.5)).toBeCloseTo(-25, 5);
// office with trips averaging 0 steps, 1 star, no amenities: appraisal = base × 1.30
// same office with trips averaging 540 steps: appraisal = base × (100 + occupantPercent(9.502)) / 100
// office with no trips in a tower with no trips: appraisal = base (score 3)
// a noisy office scores 1.0 more than the same office without the noise source
// storeDailyAppraisals twice in a row changes nothing the second time
```

- [ ] **Step 2: Run** `pnpm --filter @tower-magnate/engine test unit-value appraisal`. Expected: FAIL.
- [ ] **Step 3: Implement** `unit-value.ts` and rewire `appraisal.ts` and `construction.ts`.
- [ ] **Step 4: Run** the full engine suite. Existing appraisal and economy tests that asserted grade-driven appraisals get new expected values from the formula. Expected: PASS.
- [ ] **Step 5: Commit** "Appraisal is the fair price set by the unit's occupants' stress score".

### Task 3: Grade from value, with the neighbor pull

**Files:**
- Modify: `packages/engine/src/unit-value.ts`, `packages/engine/src/evaluation.ts` (replace contents), `packages/engine/src/unit-evaluation.ts`, `packages/shared/src/balance.ts` (remove `EVAL_GOOD_BELOW`, `EVAL_FAIR_BELOW*`, `EVAL_PRICE_ADJUST`, `EVAL_NOISE`; add `GRADE_GOOD_FROM = 1`, `GRADE_FAIR_FROM = 0.8`, `GRADE_FAIR_FROM_FOUR_STARS = 0.7`, `NEIGHBOR_PULL = 0.15`)
- Create: `packages/engine/src/neighbors.ts`, `packages/engine/src/neighbors.test.ts`
- Test: `packages/engine/src/evaluation.test.ts`, `unit-value.test.ts`

**Interfaces:**
- Produces:
  - `touchingUnits(state: TowerState, unit: Unit): Unit[]` in `neighbors.ts` — evaluated units on the same level with gap 0, or on level ±1 sharing a column. Multi-level units (cinema, party hall) are not evaluated, so only single-level evaluated units matter.
  - `hasOccupants(unit: Unit): boolean` — leased office/shop, sold condo, hotel room with a stay in progress (`unit.hotel?.checkInStep !== null` and not ended). Moved from `unit-evaluation.ts` and exported.
  - `ownValue(state: TowerState, unit: Unit, noisy?: boolean): number` — fair price now (`computeAppraisal(state, unit)`) over the price paid: `unit.price` for offices and shops, the sale price for condos (`unit.price`, locked at sale), `unit.hotel.stayRate` for a room with a stay (fall back to `unit.price` when `stayRate` is missing in an old save). `Infinity` when that price is 0.
  - `unitValue(state, unit, noisy?): { own: number; value: number; pulledBy: UnitId | null }`.
  - `gradeOfValue(value: number, stars: StarRating): UnitGrade` in `evaluation.ts`.
- `gradeUnit` and `storeGrade` keep their signatures and use `unitValue`. `storeGrade` (the decision path: lease end, condo evaluation, stay end) writes a fresh `unit.appraisal` before grading. The 00:00 rule in `storeDailyGrade` (no trips keeps the grade) stays.

- [ ] **Step 1: Write failing tests**

```ts
expect(gradeOfValue(1.0, 3)).toBe('good');
expect(gradeOfValue(0.8, 3)).toBe('fair');
expect(gradeOfValue(0.79, 3)).toBe('poor');
expect(gradeOfValue(0.75, 4)).toBe('fair');
expect(gradeOfValue(0.69, 4)).toBe('poor');
expect(gradeOfValue(Infinity, 1)).toBe('good');
// neighbors: A own 1.0, right neighbor B own 0.6 → A value 0.94, pulledBy B
// B good (own 1.3) → A value 1.0, pulledBy null
// B vacant (no lease) → never pulls
// unit on level 4 overlapping one column with a poor unit on level 5 → pulled
// unit on level 4 one column apart (gap 1) from a poor unit → not pulled
// A and B both poor: each pulled once from the other's own value; storeDailyGrades twice gives the same grades
// price 0 → value Infinity, grade good
// hotel room mid-stay uses what the stay paid, not a price changed after check-in
```

- [ ] **Step 2: Run** `pnpm --filter @tower-magnate/engine test evaluation neighbors unit-value`. Expected: FAIL.
- [ ] **Step 3: Implement** `neighbors.ts`, the value functions and `gradeOfValue`, and rewire `gradeUnit`/`storeGrade`.
- [ ] **Step 4: Run** the full engine suite. Lease, condo and hotel tests that relied on the old score get new setups (prices relative to the fair price) rather than deleted assertions. Expected: PASS.
- [ ] **Step 5: Commit** "Units grade by fair price over price, pulled down a little by a worse neighbor".

### Task 4: Reasons and unit window

**Files:**
- Modify: `packages/engine/src/evaluation-reasons.ts`, `packages/shared/src/protocol/views.ts:385-397` and `samples.ts`, `apps/server/src/tower-socket/inspect.ts:325-350`, `apps/web/src/ui/unit/unitWindowModel.ts:666+`, `apps/web/src/ui/unit/UnitWindow.tsx`, `apps/web/src/ui/spanishStrings.ts`
- Test: `packages/engine/src/evaluation-reasons.test.ts`, `apps/server/src/tower-socket/inspect.test.ts`, `apps/web/src/ui/unit/unitWindowModel.test.ts`

**Interfaces:**
- `EvaluationParts` becomes `{ occupantScore: number; fairPrice: number; price: number; noisy: boolean; mainCause: ...; pulledBy: UnitId | null }`.
- Protocol `evaluationParts` becomes `{ occupantScore: number (0..10), fairPrice: int ≥ 0, noisy, mainCause, neighborPull: boolean }` (office only, as now).
- All lease and condo details, and hotel room details, gain `occupantScore: number` (0..10) for the "Estrés de ocupantes" row.
- Strings: `'window.unit.appraisalMark': 'Precio justo {price}'`, `'window.unit.occupantStress': 'Estrés de ocupantes'`, reason keys `rentFair: 'Alquiler dentro del precio justo'`, `rentOver: 'Alquiler por encima del precio justo'`, `calmWorkers` kept, `stressedWorkers` kept, `badNeighbor: 'Vecino mal valorado'`. Remove `rentMinimum`, `rentBelow`, `rentAbove`.
- Workers reason: in favor when `occupantScore < 3`, against otherwise.

- [ ] **Step 1: Write failing tests** for `evaluationReasons()` (web): price ≤ fairPrice lists `rentFair` in favor; price > fairPrice lists `rentOver` against; `occupantScore 2.9` lists calm workers, `3.0` stressed workers with cause; `neighborPull: true` lists `badNeighbor` against. Server inspect test asserts the new payload shape for an office.
- [ ] **Step 2: Run** the three test files. Expected: FAIL.
- [ ] **Step 3: Implement** engine parts, protocol schema plus sample, server mapping, web model, window row showing the score as `3,4` (one decimal, comma as in other numbers in the UI), and strings.
- [ ] **Step 4: Run** `pnpm test` at the repo root. Expected: PASS.
- [ ] **Step 5: Commit** "Unit windows show the fair price, the occupants' stress score and a bad neighbor".

### Task 5: Person stress bar from 0 to 10

**Files:**
- Modify: `packages/shared/src/protocol/views.ts:555-556` and `samples.ts`, `apps/server/src/tower-socket/inspect.ts:203-204`, `apps/web/src/ui/person/personWindowModel.ts:80-110`, `apps/web/src/ui/person/PersonWindow.tsx`, `apps/web/src/ui/person/person.css`, `apps/web/src/ui/spanishStrings.ts`, `packages/shared/src/balance.ts` (remove `STRESS_ALTO_FROM`, `STRESS_MUY_ALTO_FROM` once unread; `APPRAISAL_STRESS_PERCENT` already gone)
- Test: `apps/web/src/ui/person/personWindowModel.test.ts`, server inspect test

**Interfaces:**
- Person inspection: `stressMinutes` replaced by `stressScore: number` (0..10); `stress` level stays for the tint.
- `stressBar(score: number): { fill: number; color: string; text: string }` — `fill = score / 10`, `text` like `'3,4 / 10'` via a new key `'window.person.stressScore': '{n} / 10'`, `color` interpolated in sRGB from the ink color `#141218` at 0 to `#d81e2a` at 10 (import from `render/stressPalette.ts`). No ticks, no level words. Remove `stressText`, `'window.person.stressValue'` and the level-word keys if no other reader is left.
- `stressReasons` keeps its share rules; its inputs stay in minutes internally.

- [ ] **Step 1: Write failing tests:** `stressBar(0)` → fill 0, color `#141218`, text `'0,0 / 10'`; `stressBar(10)` → fill 1, color `#d81e2a`; `stressBar(3.44)` → text `'3,4 / 10'`; the meter has `aria-valuemin=0`, `aria-valuemax=10`, `aria-valuenow` the exact score.
- [ ] **Step 2: Run** the web tests. Expected: FAIL.
- [ ] **Step 3: Implement** server field, schema, model, component and CSS (remove the tick marks).
- [ ] **Step 4: Run** `pnpm test` and `pnpm typecheck` at the root; only the type errors listed as pre-existing (unitWindowModel.test `as const`, inspect.test line 296) may remain. Expected: PASS.
- [ ] **Step 5: Commit** "Person window shows stress as a 0 to 10 bar".

### Task 6: Design docs

**Files:**
- Modify: `docs/design/stress-evaluation.md` (sections 3.2, 4, 5.3 to 5.6, 6, 9, 10, 11, rules), `docs/design/economy.md` (appraisal section), `docs/design/ui.md` 6.2 and 6.3, `docs/design/people.md` 11.3

- [ ] **Step 1:** Rewrite those sections to match the spec, keeping each doc's style and rule numbering (retire old rule numbers with a "replaced by" note instead of renumbering). Recompute the worked examples of section 10 with the new formulas.
- [ ] **Step 2:** `grep -rn "STRESS_ALTO_FROM\|EVAL_GOOD_BELOW\|EVAL_PRICE_ADJUST\|APPRAISAL_GRADE_PERCENT" docs packages apps --include=*.md --include=*.ts` returns nothing outside `dist/`.
- [ ] **Step 3: Commit** "Design docs describe the 0 to 10 stress score and the fair price".
