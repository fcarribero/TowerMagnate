# Stress and unit evaluation

Version 1.0, 23 November 2026. Owner: Game Designer. Task TM-13.

This document defines how much stress a trip produces, how a person's stress is averaged and colored, how offices, shops, condos and hotel rooms get a score from the stress of their occupants, how price and noise change that score, and how the score becomes a grade of good, fair or poor. Values come from `docs/GDD.md` (sections Estrés and Evaluación de unidades) and the SimTower research notes (section 4), adapted to a 10-second step, game minutes and a 7-day week. Where the GDD leaves a point open, the decision is marked "Design call" with a short reason. Section 10 has worked examples for every evaluated unit type. Section 12 maps every GDD line to the rule that covers it. The numbered rules at the end are the contract for the engine (`packages/engine`), the balance constants (`packages/shared`) and QA.

Related specs: routing (TM-11, `docs/design/routing.md`) and elevators (TM-12, `docs/design/elevators.md`) record the leg data this spec reads (routing 11, elevators 11); people (TM-10, `docs/design/people.md`) for trips, required and optional trips, the 2-hour retry, the 03:00 night reset, hotel bookings by grade (8.1) and the venue stress factor (11.3); economy (TM-9, `docs/design/economy.md`) for price levels, lease evaluations (E-12) and condo evaluations (E-25); construction (TM-8, `docs/design/construction.md`) for lobby heights (3.2); stars (TM-14, `docs/design/stars.md`) for the rating; UI (TM-18, `docs/design/ui.md`) for the stress and evaluation display. The VIP approval threshold is TM-15.

## 1. Units

The engine runs one step per 10 game seconds: 1 game minute is 6 steps, 1 game day is 8,640 steps, 1 week is 60,480 steps. All stress values in the engine are whole numbers of steps. The UI shows stress as whole game minutes: `floor(steps / 6)` followed by ` min` (ui.md 1).

Design call: steps keep every formula in integers and match the recorded leg data, which is already in steps. The GDD states the thresholds in minutes, and 15 and 30 minutes are exactly 90 and 180 steps.

## 2. Trip stress

### 2.1 What counts

Each trip produces one stress value `T`, in steps, from the legs recorded by routing (section 11) and elevators (section 11):

| Part | Stress |
|---|---|
| Elevator wait | `waitSteps` of each ride, after the tall lobby cut (2.3) |
| Elevator ride | `rideSteps` of each ride |
| Stairs | 30 per stair floor walked, up or down |
| Escalators | 6 per escalator floor walked, up or down |
| Full queue | 12 per full-queue event |
| No route | 360 per failed route search |
| Long slow trip | 0, 30 or 60 (2.2) |
| Horizontal walking | 0 |

Then `T = min(540, sum of the parts)`.

Design call on stairs: the GDD counts "cada piso subido a pie". A stair flight takes 12 steps (routing 8.1), and the stress of 30 per floor replaces that time; it is not added to it. Three stair floors, the most a trip may walk (routing 5.2), give 90 steps, which is the pink line by itself. A small tower can use stairs for the first two floors above the lobby and needs an elevator after that, as in the original. Going down costs the same as going up so that the trip to work and the trip home weigh the same.

Design call on escalators: an escalator floor counts its own flight time, 6 steps, and nothing more. Escalators are the comfortable way between lobby and commercial floors, and the routing order already prefers them.

Design call on horizontal walking: the GDD names the elevator wait, the ride and the floors on foot. Walking across a 375-column floor takes up to 62 game minutes (routing 8.1), and counting it would turn wide floors into a stress problem the player cannot see or fix with transport.

Design call on the cap: the original clamped each leg at the top of its scale. One cap per trip of 540 steps (90 minutes, three times the red line) stops one stranded trip from wrecking a week of good trips, while still pushing a unit with no route to poor.

### 2.2 Long slow trips

The slow floors of a trip are the sum of `rideFloors` of its standard and service rides plus its stair floors. Express rides and escalators add no slow floors.

| Slow floors in the trip | Extra |
|---|---|
| 0 to 14 | 0 |
| 15 to 24 | 30 |
| 25 or more | 60 |

Design call: express shafts only stop on lobby levels 15 apart (construction 5.4), so a trip with a sky lobby rides at most 14 standard floors after the express. The extra starts at 15 so that towers below the first sky lobby are not penalized, and it grows for the long standard rides a sky lobby would avoid. The GDD exempts the express.

### 2.3 Tall lobby cut

When a ride boards on a lobby cell and goes up, its wait is reduced by the height of that lobby level (construction 3.2):

| Lobby height | Cut |
|---|---|
| 1 | 0 |
| 2 | 18 (3 minutes) |
| 3 | 36 (6 minutes) |

The ride's wait for stress is `max(0, waitSteps - cut)`. The cut applies on any row of a tall lobby, on the main lobby and on sky lobbies, and only to rides whose direction is up. It never applies to a ride that boards outside a lobby or goes down.

Design call: the GDD says a tall lobby "reduce la espera al subir". The cut is taken from the wait of that ride and never goes below zero, so a tall lobby helps only where people actually wait. The original took 25 and 50 ticks off the whole trip. Here the cut is 3 and 6 minutes and comes off the wait only, so it cannot hide stairs or long rides.

### 2.4 Failed attempts and ended trips

- Each failed route search on a required trip adds 360 (people.md 4, routing 9). The trip keeps its other parts.
- A trip ended by the 03:00 night reset adds one more 360 (people.md P-07) and is recorded at that step.
- A required trip that is given up, such as a worker who gives up the arrival at the leave time (people.md 6.1), is recorded at that step with what it has.
- An optional trip cancelled at its start records nothing (people.md P-06). An optional trip cancelled after the person left (routing 9) is recorded with what it has, with no no-route penalty.
- A trip to a medical center that fails records no stress; it counts only as a medical failure (people.md 16).
- A trip that switches from the subway to the street entrance (people.md P-05) adds nothing for the switch.
- A trip of a person who is removed (people.md P-08) is not recorded.

A recorded trip "ends" at the step the person reaches the destination, or at the step it is given up, cancelled or reset.

### 2.5 Who records stress

Every person records trip stress except maids and security guards (people.md 10 and 14). Customers, audience, party guests, prospects, wedding guests and the VIP record it like everyone else.

Design call: maids and guards are not counted in population and do not grade any unit, so their stress would never be used.

## 3. Person stress

### 3.1 Average

A person's stress `P` is the average of the trips that ended in the last 60,480 steps, plus the trip in progress:

`P = floor((sum of T of those trips + T so far) / (number of those trips + 1))`

where "T so far" and the `+ 1` are used only while the person is on a trip. "T so far" is the sum of the parts of 2.1 recorded up to this step, including the wait or ride under way, without the long-trip extra and with the 540 cap. A person with no trips has `P = 0`.

Person stress is for display and for TM-15's VIP check. Unit scores use only ended trips (section 5).

Design call on the trip in progress: a person who has waited 20 minutes at a crowded shaft should turn pink while still waiting. That is the view the player uses to find bad shafts.

### 3.2 Colors

| Stress `P` | Minutes | Level | Color |
|---|---|---|---|
| under 90 | under 15 | normal | ink (black) |
| 90 to 179 | 15 to 29 | alto | `stress-pink` |
| 180 or more | 30 or more | muy alto | `stress-red` |

The person window shows `{floor(P / 6)} min ({level})` (ui.md 6.3). The thresholds do not change with stars.

Design call: the GDD's starting values, 15 and 30 minutes, are kept. A well-served office trip is 4 to 7 minutes (section 9), so pink means a real problem and red means a broken route or an overloaded shaft.

## 4. Venue visit stress

The venue stress factor of people.md 11.3 uses, for a fast food, restaurant, retail shop, cinema or party hall, the average `T` of the trips that ended at that venue's door between 00:00 and 24:00 of the previous day, rounded down. With no such trips the factor is 1.0. Under 90 steps the factor is 1.0, from 90 to 179 it is 0.8, from 180 it is 0.6. These are people.md's 15 and 30 minutes.

## 5. Unit score

### 5.1 Evaluated units

Offices, retail shops, condos and hotel rooms (single, double and suite) are evaluated. Fast food, restaurants, cinemas, party halls and service units are not; their customers react through the venue factor of section 4.

### 5.2 Base stress

Each evaluated unit keeps a stress ledger of trips. The base `B` is `floor(sum of T / number of trips)` over the trips in the ledger that fall in the unit's window. With no trips in the window, `B = 0`.

| Unit | Trips in the ledger | Window |
|---|---|---|
| Office | every recorded trip of the office's workers | ended in the 60,480 steps before the step |
| Condo | every recorded trip of the condo's residents | ended in the 60,480 steps before the step |
| Retail shop | every recorded trip that ended at the shop's door, by anyone | ended in the 60,480 steps before the step |
| Hotel room | every recorded trip of the guests of the current stay, the VIP included | ended from the stay's check-in step up to the stay's end step |

"In the 60,480 steps before step `s`" means ended at a step `e` with `s - 60,480 <= e < s`.

The ledger is cleared when a new tenant moves into an office or shop, when a condo is sold, and when a hotel stay starts. A trip is filed in the ledger of the unit the person belongs to at the step the trip ends.

Design call on the window: one week holds every weekday and every weekend day, so offices, residents and shops are scored over the same mix of days whatever weekday the lease started. It also keeps the live grade (section 7) close to what the player is doing now.

Design call on shops: a shop has no occupants. Its customers stand in for them, and the trip that brought each customer is the part the player controls.

### 5.3 Price adjustment

| Price level | Adjustment |
|---|---|
| Alto | +30 |
| Normal | 0 |
| Bajo | -30 |
| Mínimo | the score is 0 and the grade is good, whatever the other parts |

The price level used is:

- office and shop: the level set on the unit at that step, before the commands of the step (economy section 10);
- condo: the level of the sale, which is locked (economy 3);
- hotel room: the level the stay paid at check-in.

Design call: the original added and subtracted 30 ticks against a pink line of 80; 30 steps (5 minutes) against 90 is close to that share and keeps the numbers round. Changing an office to mínimo just before the lease end makes it renew, but the renewal week is then paid at mínimo (economy E-12), so the trick costs a week of rent, as the research notes say players used it.

### 5.4 Noise

A unit gets +60 when at least one noise source of its list is on the same level within its radius. Only one +60 applies, however many sources there are.

| Unit | Radius | Noise sources |
|---|---|---|
| Hotel room | 20 | fast food, restaurant, office, retail shop, cinema, party hall |
| Office | 10 | fast food, restaurant, retail shop, cinema, party hall |
| Condo | 30 | single room, double room, suite, fast food, restaurant, office, retail shop, cinema, party hall |
| Retail shop | none | none |

The gap between a unit on columns `a` to `b` and a source on columns `c` to `d` on the same level is `c - b - 1` when the source is to the right (`c > b`) and `a - d - 1` when it is to the left (`d < a`). The source is in range when the gap is at or below the radius. Two adjacent units have a gap of 0.

A source taller than one level (cinema, party hall) is on every level it covers. A source counts while it exists, with or without a tenant, stay or customers. Ruins are not a source.

Design call on the lists: the GDD's "restaurantes" covers both food units, "comercios" is the retail shop and "entretenimiento" is the cinema and the party hall. "Hotel" for condos means the three room types. Housekeeping is not a noise source.

Design call on vacant sources: a source that makes noise only while rented would change grades with no visible change on the map. The player sees units, not tenants.

Design call on the amount: the original's +60 ticks becomes +60 steps (10 minutes). Noise alone leaves a unit good if its occupants average under 5 minutes, which is a short, well-served trip; noise with any real wait makes it fair.

### 5.5 Score

For any price level other than mínimo:

`score = B + price adjustment + noise`

The score can be negative.

## 6. Grade

| Score | Below 4 stars | 4 stars or more |
|---|---|---|
| under 90 | good (Buena) | good (Buena) |
| 90 to 179 | fair (Regular) | fair (Regular) |
| 180 to 239 | poor (Mala) | fair (Regular) |
| 240 or more | poor (Mala) | poor (Mala) |

The rating is the tower's rating at the step of the grade (stars.md 2). The Torre rank counts as 4 stars or more.

Design call on the lines: good below 90 and poor from 180 match the pink and red lines, so a unit whose occupants are mostly pink is fair and one whose occupants are red is poor. The original's tolerance at 4 stars raised the poor line by a third (150 to 200 ticks); here it goes from 180 to 240, the same share. The good line does not move.

## 7. When grades are computed

| Unit | Grade computed | Used for |
|---|---|---|
| Office, shop | at each lease end step (economy E-12), and every day at 00:00 | the renewal at the lease end; display at any time |
| Condo | at each evaluation step (economy E-25), and every day at 00:00 | the buyback at the evaluation step; display at any time |
| Hotel room | at the stay's end step, 10:00 on the check-out day (economy E-20) | the booking chance (people.md 8.1) until the next stay ends; display |

The unit keeps its last computed grade. That stored grade is what the inspection window and the Evaluación overlay show (ui.md 6.2 and 7).

- An office or shop with no tenant and a condo that is not sold have no grade and show "Sin evaluar". The grade is cleared when the tenant or owners leave.
- An office, shop or condo with a tenant or owners but no trips in the window at a 00:00 computation keeps the grade it had, or none if it never had one. At a lease end or condo evaluation step, a window with no trips gives `B = 0` and a grade as usual.
- A hotel room that never had a stay end has no grade. A party that gives up before check-in (people.md 8.1) does not change the grade. A room keeps its grade when it becomes dirty or infested.

The 00:00 computation runs after the money events of the step (economy section 10, items 1 to 6) and before player commands. A price change therefore shows in the grade at the next 00:00 or at the next evaluation step, whichever comes first.

Design call on the daily grade: the GDD has the Evaluación overlay, and a grade shown only every 4 weeks would not tell the player what to fix. A daily grade with the same formula is a preview of the next real evaluation.

Design call on hotel rooms: each stay is short, so the stay itself is the window, and the room's grade is the last guests' opinion, as the room window says ("of the last stay", ui.md 6.2). The guest's trip out of the tower is counted only if it ended before 10:00, because the stay ends then.

## 8. Effects of a grade

This spec only produces grades. What they do is in the specs that own each effect:

| Grade use | Effect | Spec |
|---|---|---|
| Office or shop lease end | good or fair renews; poor leaves | economy E-12 |
| Condo evaluation | good or fair keeps; poor is bought back | economy E-25 |
| Hotel booking | 90% good, 70% fair, 40% poor, 80% no grade | people.md 8.1 |
| VIP visit | approval from the VIP's person stress | TM-15 |

## 9. Balance check

These numbers are a check, not rules. With the default dwell, a standard car takes 6 steps for 1 floor and 13 for 8 floors with no stop (elevators 2.4), and each extra stop adds 5.

- An office on level 9 with one shaft that is not crowded: wait 10 to 20 steps, ride 13 to 28, so 23 to 48 a trip, 4 to 8 minutes. Good even at alto, fair with a fast food next door at alto.
- The same office in a morning rush with one car for 60 workers: the car takes 21 at a time and needs about 68 steps a round trip (elevators 12), so arrival waits are about 0, 68 and 136, an average near 70. Only the arrival trip waits that long. Four trips a day give a base near `(4 × 35 + 70) / 4 = 52`: good at normal, fair with noise.
- A required trip with one failed search ends at 360 plus the trip. One such trip in a week of 20 adds about 18 to the base.
- An office with no route at all: every trip is capped at 540, so the base is 540 and the grade is poor at any price except mínimo.

The balance simulation checks these and GD retunes the constants in section 11.

## 10. Worked examples

All examples use the default elevator dwell of 30 seconds (3 steps). "Ride" times follow elevators 2.4: `3 + 1 + ceil(n / speed) + 1` steps for `n` floors with no stop, plus 5 per intermediate stop. Columns are inclusive.

### 10.1 Trips

T1. A worker enters at the main lobby (height 1), waits 14 steps for a standard car going up and rides from level 1 to 9 with 2 intermediate stops: `3 + 1 + 8 + 1 + 2 × 5 = 23`. Slow floors 8, no extra. `T = 14 + 23 = 37`, shown as 6 min.

T2. The same trip with a main lobby of height 3. The cut is 36: wait `max(0, 14 - 36) = 0`. `T = 0 + 23 = 23`, 3 min.

T3. A worker rides a standard car from level 1 (height 1) to 22: wait 40, ride `3 + 1 + 21 + 1 + 3 × 5 = 41` with 3 intermediate stops. Slow floors 21, extra 30. `T = 40 + 41 + 30 = 111`, 18 min, alto on its own.

T3 back. Going home from 22 to 1 with wait 30 and the same ride time: the cut never applies going down. `T = 30 + 41 + 30 = 101`.

T4. The same worker after the player adds an express and raises the main lobby to height 2. Wait 20 for the express at level 1, cut 18, so 2. Express ride 1 to 15: `3 + 1 + ceil(14 / 3) + 1 = 10`. Walk 30 columns on level 15: 0. Wait 12 for a standard car at the sky lobby on 15 (height 1, cut 0). Ride 15 to 22 with no stop: `3 + 1 + 7 + 1 = 12`. Slow floors 7 (the express adds none), no extra. `T = 2 + 10 + 12 + 12 = 36`, 6 min.

T5. A shopper climbs 2 stair floors and then 3 escalator floors: `2 × 30 + 3 × 6 = 78`, 13 min. Slow floors 2, no extra.

T6. A worker's arrival has no route at 08:10 and at 10:10, and at 12:10 the worker finds a route: wait 10, ride 13. `360 + 360 + 10 + 13 = 743`, capped: `T = 540`, 90 min.

T7. A resident reaches a shaft whose up queue holds 40 people, waits 18 steps by the queue, then 24 in it (`waitSteps = 42`, elevators 11), and rides 8 floors with no stop, 13 steps. One full-queue event. `T = 42 + 13 + 12 = 67`.

T8. A worker rides a standard car 1 to 30 from a main lobby of height 3: wait 50, cut 36, so 14. Ride `3 + 1 + 29 + 1 + 2 × 5 = 44`. Slow floors 29, extra 60. `T = 14 + 44 + 60 = 118`.

T9. A worker is waiting for a retry at 03:00 after 3 failed searches. The night reset adds one more: `4 × 360 = 1,440`, capped at 540, recorded at 03:00.

### 10.2 Person stress

A resident finished 12 trips in the last week with a total of 1,140 (average 95, alto). Now the resident has been waiting 60 steps at a shaft. `P = floor((1,140 + 60) / 13) = floor(92.3) = 92`. The window shows `15 min (alto)` in pink.

The next morning, 4 trips of the 12 drop out of the window, with a total of 520. The resident is home, not on a trip, and has finished the trip above with `T = 75`. `P = floor((1,140 - 520 + 75) / 9) = floor(77.2) = 77`: `12 min (normal)`.

### 10.3 Office

An office on level 9, columns 100 to 108, at a 3-star tower. Its lease ends on a Wednesday at 14:20. In the 60,480 steps before that step, the 6 workers finished 108 trips with a total of 7,668. `B = 7,668 / 108 = 71`.

A fast food on level 9 at columns 117 to 132: gap `117 - 108 - 1 = 8`, at or below 10, so noise +60.

| Price | Score | Grade | Lease |
|---|---|---|---|
| Normal | `71 + 0 + 60 = 131` | fair | renews |
| Alto | `71 + 30 + 60 = 161` | fair | renews |
| Bajo | `71 - 30 + 60 = 101` | fair | renews |
| Mínimo | 0 | good | renews |

With the fast food at columns 120 to 135 the gap is 11, out of range: at normal the score is 71, good; at alto 101, fair.

Same office, different week: `B = 125`, alto, the fast food at 117. Score `125 + 30 + 60 = 215`. At 3 stars that is poor and the tenant leaves. At 4 stars it is fair (under 240) and the tenant renews.

### 10.4 Condo

A condo on level 20, columns 200 to 215, sold at bajo. A single room on level 20 at columns 240 to 243: gap `240 - 215 - 1 = 24`, at or below 30, so noise +60. The evaluation step falls 8 weeks after the sale.

- In the window the 3 residents finished 54 trips with a total of 5,940. `B = 110`. Score `110 - 30 + 60 = 140`: fair, the owners stay.
- In another window, 54 trips with a total of 8,100. `B = 150`. Score `150 - 30 + 60 = 180`. At 3 stars 180 is not under 180, so the grade is poor: the owners leave and the player pays back the sale price (economy E-25). At 4 stars the grade is fair and nothing happens.

### 10.5 Hotel room

A double room on level 16, columns 50 to 55. An office on level 16 at columns 70 to 78: gap `70 - 55 - 1 = 14`, at or below 20, so noise +60. A party of 2 checks in on Monday paying alto for 2 nights; the stay ends Wednesday at 10:00.

| Trip | Ended | T | Counted |
|---|---|---|---|
| Guest A arrives at the room | Monday 18:40 | 40 | yes |
| Guest A goes to a restaurant | Monday 20:05 | 30 | yes |
| Guest A comes back | Monday 21:12 | 26 | yes |
| Guest B arrives at the room | Monday 18:40 | 40 | yes |
| Guest A leaves the tower | Wednesday 09:20 | 34 | yes |
| Guest B leaves the tower | Wednesday 10:03 | 50 | no, after the stay's end |

`B = floor(170 / 5) = 34`. Score `34 + 30 + 60 = 124`: fair. Until the next stay of this room ends, its booking roll at 12:00 has a 70% chance.

With the office at columns 76 to 84 the gap is 20, still in range. At columns 77 to 85 the gap is 21: score `34 + 30 = 64`, good, and the chance is 90%.

### 10.6 Retail shop

A shop's lease ends on a Saturday at 11:00. In the 60,480 steps before that step, 180 trips ended at its door (residents, guests and outside customers) with a total of 14,580. The early-leave check runs first (economy E-15): 180 visits is not below 70, so the tenant stays to evaluate. `B = 14,580 / 180 = 81`. Shops have no noise.

- At alto: `81 + 30 = 111`, fair, the tenant renews.
- At normal: 81, good.
- At mínimo: 0, good.

### 10.7 Venue factor

On Tuesday, 40 trips ended at a fast food's door with a total of 4,000. Average 100, from 90 to 179: on Wednesday its stress factor is 0.8 (people.md 11.3). With a weekday base of 20 and normal price, no subway: `floor(20 × 1.0 × 0.8 × 1.0) = 16` outside customers.

## 11. Constants for `packages/shared`

| Constant | Value |
|---|---|
| `STRESS_STAIR_FLOOR` | 30 |
| `STRESS_ESCALATOR_FLOOR` | 6 |
| `STRESS_QUEUE_FULL` | 12 |
| `STRESS_NO_ROUTE` | 360 |
| `STRESS_TRIP_CAP` | 540 |
| `STRESS_LONG_TRIP` | 15 slow floors: 30; 25 slow floors: 60 |
| `STRESS_TALL_LOBBY_CUT` | height 1: 0, height 2: 18, height 3: 36 |
| `STRESS_WINDOW_STEPS` | 60,480 |
| `STRESS_PINK` | 90 (15 min) |
| `STRESS_RED` | 180 (30 min) |
| `EVAL_PRICE_ADJUST` | alto 30, normal 0, bajo -30, mínimo always good |
| `EVAL_NOISE` | 60 |
| `EVAL_NOISE_RADIUS` | hotel room 20, office 10, condo 30 |
| `EVAL_GOOD_BELOW` | 90 |
| `EVAL_FAIR_BELOW` | 180; 240 from 4 stars |

All values are in steps except the radius, in columns, and the slow floors, in floors.

## 12. GDD coverage

| GDD line | Section | Result |
|---|---|---|
| Stress is the average game minutes per trip | 2, 3 | Kept; held in steps, shown in minutes, over a 7-day window |
| Counts the elevator wait and the ride | 2.1 | Kept |
| Counts each floor climbed on foot | 2.1 | Kept; stairs 30, escalators 6, up and down alike |
| Penalty for no route | 2.1, 2.4 | Kept; 360 per failed search, trip capped at 540 |
| Long trips on standard elevator or stairs add extra, express does not | 2.2 | Kept; from 15 and 25 slow floors |
| A lobby 2 or 3 floors tall reduces the wait going up | 2.3 | Kept; 18 and 36 off the wait of up rides |
| Pink from 15 minutes, red from 30 | 3.2 | Kept |
| Unit score is the average stress of its occupants | 5.2 | Kept; shops use their visitors |
| Price: alto adds, normal nothing, bajo subtracts, mínimo always passes | 5.3 | Kept; ±30 |
| Noise: hotel 20, office 10, condo 30, with their source lists | 5.4 | Kept; +60 once |
| Good, fair or poor | 6 | Kept; under 90, under 180, else poor |
| From 4 stars people tolerate more | 6 | Kept; the poor line moves to 240 |

## 13. Rules

### Trip stress

SE-01. Stress values are whole numbers of steps. The UI shows `floor(steps / 6)` game minutes.

SE-02. A trip's stress is the sum of: the wait of each ride after the tall lobby cut; the ride steps of each ride; 30 per stair floor; 6 per escalator floor; 12 per full-queue event; 360 per failed route search; and the long-trip extra. Horizontal walking adds nothing. The result is capped at 540.

SE-03. Slow floors are the standard and service ride floors plus the stair floors of the trip. The long-trip extra is 0 for 0 to 14 slow floors, 30 for 15 to 24 and 60 for 25 or more. Express rides and escalators add no slow floors.

SE-04. A ride that boards on a lobby cell and goes up has its wait reduced by 18 if that lobby level has height 2 and by 36 if it has height 3, never below 0. Rides that go down or board outside a lobby get no cut.

SE-05. A trip ended by the 03:00 night reset adds 360 and is recorded at 03:00. A required trip given up is recorded at that step with what it has.

SE-06. An optional trip cancelled at its start records nothing. An optional trip cancelled after the person left is recorded with what it has, with no no-route penalty. A failed medical visit records no stress. A subway-to-street switch adds nothing. A trip of a removed person is not recorded.

SE-07. Maids and security guards record no stress. Every other person does.

### Person stress

SE-08. A person's stress is `floor((sum of T of trips ended in the last 60,480 steps + T so far) / (count + 1))` while on a trip, and `floor(sum / count)` otherwise. "T so far" excludes the long-trip extra and is capped at 540. With no trips it is 0.

SE-09. Person stress under 90 is normal (ink), 90 to 179 is alto (pink), 180 or more is muy alto (red), at any rating.

SE-10. A venue's stress factor for the day uses the average T of the trips that ended at its door on the previous day, rounded down: under 90 gives 1.0, 90 to 179 gives 0.8, 180 or more gives 0.6, no trips gives 1.0.

### Unit score

SE-11. Offices, retail shops, condos and hotel rooms are evaluated. No other unit has a grade.

SE-12. An office's base is the average T, rounded down, of its workers' trips that ended at a step `e` with `s - 60,480 <= e < s`. A condo uses its residents' trips and a shop the trips that ended at its door, over the same window. A hotel room uses the trips of the current stay's guests that ended from check-in up to the stay's end step. No trips gives a base of 0.

SE-13. A unit's ledger is cleared when a new office or shop tenant moves in, when a condo is sold and when a hotel stay starts.

SE-14. At mínimo the score is 0 and the grade is good. Otherwise the score is base + price adjustment + noise, with alto +30, normal 0 and bajo -30.

SE-15. The price level is the level set at the step before that step's commands for offices and shops, the sale level for condos, and the level paid at check-in for hotel rooms.

SE-16. Noise is +60, once, when at least one source of the unit's list is on the same level with a gap at or below the radius: hotel rooms 20 columns (fast food, restaurant, office, retail, cinema, party hall), offices 10 (fast food, restaurant, retail, cinema, party hall), condos 30 (single, double, suite, fast food, restaurant, office, retail, cinema, party hall). Shops get no noise.

SE-17. The gap is `c - b - 1` for a source on columns `c` to `d` right of a unit on `a` to `b`, and `a - d - 1` for a source on the left. A source taller than one level is on every level it covers. A source counts while it exists, rented or not. Ruins are not a source.

### Grade

SE-18. Below 4 stars: score under 90 is good, 90 to 179 fair, 180 or more poor. At 4 stars or more, including Torre: under 90 good, 90 to 239 fair, 240 or more poor. The rating is the one at the step of the grade.

SE-19. Offices and shops are graded at each lease end step and every day at 00:00. Condos are graded at each evaluation step and every day at 00:00. Hotel rooms are graded at the stay's end step.

SE-20. The 00:00 grade runs after the money events of economy section 10 items 1 to 6 and before player commands. At 00:00, a unit with no trips in its window keeps its last grade. At a lease end or condo evaluation step it is graded with a base of 0.

SE-21. An office or shop with no tenant and an unsold condo show "Sin evaluar"; their grade is cleared when the tenant or owners leave. A hotel room with no ended stay shows "Sin evaluar". A party that gives up before check-in does not change a room's grade.

SE-22. The stored grade is what the inspection window, the Evaluación overlay and the hotel booking chance use.
