# Stress score and fair price

Date: 18 November 2026. Replaces the minute-based stress display and the score of `docs/design/stress-evaluation.md` sections 3.2, 5 and 6, and the appraisal of `packages/engine/src/appraisal.ts`.

## Intent

Stress stops being a number of minutes with lines where a person "is stressed". It becomes a score from 0 to 10 with decimals. The score of a unit's occupants sets how much they think the unit is worth, its fair price. The price the player charges against that fair price gives the unit's grade. Calm, happy occupants accept high rents; stressed ones only accept low rents.

The grade of a unit is also pulled down a little by a neighbor with a worse grade, never pulled up, and never in a chain.

Goals:

- One stress scale, 0 to 10, everywhere the player sees stress.
- The fair price of a unit follows its own occupants, so fixing the elevators of one office lets the player raise that office's rent.
- The good, fair and poor grade stays, with all its current effects (lease renewal, condo buyback, hotel booking).

Non-goals:

- No change to how a trip records stress inside the engine (stress-evaluation section 2). Trips still add steps; the score is a view of those steps.
- No change to the economy around the grade: renewal, buyback and booking odds stay as they are.
- No new sprites. The pink and red sprite tints stay.

Anti-goals:

- A spiral where one poor unit drags its neighbors down, and they drag theirs.
- A fair price that depends on the grade, which depends on the fair price (the loop the current appraisal has).

## Approaches

- A, picked by the user: keep the grade, computed from the price against the fair price. Small change to the economy, every grade consumer keeps working.
- B, rejected: drop the grade and make each decision (leave, buy back, book) a continuous chance of how far the price is over the fair price. Finer, but it rewrites the economy.

## Stress score

A person's stress score is `S = 10 × (1 − e^(−P / 180))`, where `P` is the person stress of stress-evaluation 3.1 in steps (180 steps is 30 minutes). One decimal is shown. Examples: 5 minutes is 1.5, 15 minutes is 3.9, 30 minutes is 6.3, 60 minutes is 8.6, the 90-minute trip cap is 9.5. The curve never reaches 10.

Design call on the curve: it spreads the usual range (2 to 30 minutes) over most of the scale, and very bad routes still end up near 10 without a hard cap.

The same function turns any average of trip stress in steps into a score: a unit's base `B`, a venue's daily average, the VIP's trips.

## Where the old lines go

- Person window: the stress bar runs from 0 to 10 and shows the score, for example "3,4 / 10". No ticks, no "alto" or "muy alto" words. The bar color moves smoothly from ink to red with the score.
- Sprites: the three tints stay because they are drawn art, now picked from the score: under 4 normal, 4 to 6.9 pink, 7 or more red. These are display buckets only; no rule reads them.
- Venue factor (people.md 11.3): `1 − 0.04 × S` of the venue's previous-day average, so 1.0 at 0 and 0.6 at 10. With no trips, 1.0.
- VIP approval: unchanged in effect. The rule keeps comparing steps against `VIP_MAX_STRESS_STEPS` (90 steps, a score of 3.9); only the text the player sees uses the score.
- Rounding: every rule reads the exact score. One decimal is for display only, sprite buckets included.
- Stress causes in the person window (3.3) keep their share rules; only their text stops showing minutes.

## Unit score

The unit score `U` is the score of the unit's base `B` (stress-evaluation 5.2, same ledger, same windows, access control applied in steps before the conversion), plus 1.0 when a noise source is near (5.4 radii and lists), capped at 10.

Design call: the ledger average is the average of the trips the occupants made in the window. It is used instead of averaging each occupant's own score so that a hotel room or office that changed people still has a value, and so that a shop, whose "occupants" are its customers, works the same way.

A unit with no trips in its window has no score of its own; it uses the tower score below.

The tower score is the score of the average of all filed trips in the trip ledger (what `averageLedgerStress` in appraisal.ts computes today). With no trips at all it is 3.0, the neutral point.

## Fair price

The fair price replaces the appraisal and keeps its name in code (`unit.appraisal`). It is:

`base price × (100 + stars + amenities + occupant percent) / 100`, clamped to 60% to 160% of the base price.

- Stars and amenities: as now (`APPRAISAL_STAR_PERCENT`, `APPRAISAL_AMENITY_*`).
- Occupant percent from `U`: +30 at 0, 0 at 3, −50 at 10, in straight lines between those points.
- The grade term (`APPRAISAL_GRADE_PERCENT`) and the tower-wide stress term (`APPRAISAL_STRESS_PERCENT`) are removed. This breaks the grade and appraisal loop.
- A unit with no score of its own uses the tower score. A new unit therefore starts at a fair price that matches how the tower is doing.

The fair price is recomputed when it is today (daily at 00:00 with the grades), and also right before each grade decision (lease end, condo evaluation, stay end) so the decision uses a current value.

Prospects (`PROSPECT_CHANCE` by price ratio) and shop customer factors keep reading `price / appraisal`, so a calm tower also makes new tenants more willing to pay.

## Grade

The unit's own value is `v = fair price / price`, where price is the unit's price for offices and shops, the sale price for condos and what the stay paid for hotel rooms (as `ratioOf` does now). A price of 0 gives an infinite `v`.

Neighbor pull: take every neighbor of the unit that has occupants and a value of its own. Design call on who counts: an office or shop with a lease, a sold condo, and a hotel room with a stay in progress. Its own value is computed on demand from the current state, using the tower score when it has no trips in its window, so nothing new is stored. An empty room, an unleased office or shop and an unsold condo do not count. If the lowest neighbor own value `n` is below `v`, the unit's value becomes `v − 0.15 × (v − n)`. Only the single worst neighbor counts. Otherwise `v` is unchanged.

Neighbors are the evaluated units (office, shop, condo, hotel rooms) that touch the unit: on the same level with a gap of 0 columns (stress-evaluation 5.4), or on the level directly above or below with at least one column in common.

No chain: the neighbor value used is always the neighbor's own value, before its own neighbor pull. A unit's grade therefore depends only on itself and on the units touching it, and a poor unit lowers its neighbors once, by a share, and that lowered value goes no further.

Example: unit A has `v = 1.0`, at its fair price. Neighbor B is poor with `v = 0.6`. A becomes `1.0 − 0.15 × 0.4 = 0.94`. If B were good with `v = 1.3`, A stays at 1.0.

Grade from the final `v`:

| `v` | Below 4 stars | 4 stars or more |
|---|---|---|
| 1.0 or more | good | good |
| 0.8 to under 1.0 | fair | fair |
| 0.7 to under 0.8 | poor | fair |
| under 0.7 | poor | poor |

0.8 is a price 25% over the fair price; 0.7 is about 43% over. The old rule that a price at the minimum level is always good is dropped: such a price is far below any fair price and grades good on its own.

When grades are computed, what has no grade, and what each grade does stay as in stress-evaluation 7 and 8. That includes the 00:00 rule that an occupied unit with no trips in its window keeps the grade it had; the tower score fallback applies only when a grade must be made (first grade, lease end, condo evaluation, stay end) and for neighbor values.

Prices are free money amounts (`setPrice`), so `v` is continuous. The thresholds above are the starting balance; a balance pass after it plays is expected, not part of this work.

## Windows

- Person window: the bar described above; the minutes line goes away.
- Unit window: shows "Precio justo" with the money value next to the price, and "Estrés de ocupantes" with the score of `U` to one decimal.
- Office reasons (stress-evaluation 5.6) become:
  - Rent: price at or under the fair price, "Alquiler dentro del precio justo" in favor; over it, "Alquiler por encima del precio justo" against.
  - Workers: `U` under 3, "Trabajadores tranquilos" in favor (they raise the fair price); 3 or more, "Trabajadores estresados por {cause}" against.
  - Noise: as now.
  - Neighbor: when the neighbor pull applies, "Vecino mal valorado" against.

## Saves

No new stored fields. Grades and appraisals are recomputed at the next 00:00 as usual. The constants `STRESS_ALTO_FROM`, `STRESS_MUY_ALTO_FROM`, `EVAL_GOOD_BELOW`, `EVAL_FAIR_BELOW*`, `EVAL_PRICE_ADJUST`, `EVAL_NOISE`, `APPRAISAL_GRADE_PERCENT` and `APPRAISAL_STRESS_PERCENT` go away or are replaced by the new ones.

## Left to the builder

- Names and placement of the new constants in `packages/shared/src/balance.ts`.
- How the server sends the score (number of steps or the score itself) as long as the web never shows minutes for stress.
- Updating `docs/design/stress-evaluation.md`, `ui.md`, `economy.md` and `people.md` to match, and the balance tests that encode the old numbers.
