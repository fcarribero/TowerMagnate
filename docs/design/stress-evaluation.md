# Stress and unit evaluation

Version 1.0, 23 November 2026. Owner: Game Designer. Task TM-13.

This document defines how much stress a trip produces, how a person's stress is averaged and shown as a score from 0 to 10, how offices, shops, condos and hotel rooms get a stress score from their occupants, how that score sets the unit's fair price, and how the price the player charges against the fair price becomes a grade of good, fair or poor. Values come from `docs/GDD.md` (sections Estrés and Evaluación de unidades) and the SimTower research notes (section 4), adapted to a 10-second step, game minutes and a 7-day week. Where the GDD leaves a point open, the decision is marked "Design call" with a short reason. Section 10 has worked examples for every evaluated unit type. Section 12 maps every GDD line to the rule that covers it. The numbered rules at the end are the contract for the engine (`packages/engine`), the balance constants (`packages/shared`) and QA.

Related specs: routing (TM-11, `docs/design/routing.md`) and elevators (TM-12, `docs/design/elevators.md`) record the leg data this spec reads (routing 11, elevators 11); people (TM-10, `docs/design/people.md`) for trips, required and optional trips, the 2-hour retry, the 03:00 night reset, hotel bookings by grade (8.1) and the venue stress factor (11.3); economy (TM-9, `docs/design/economy.md`) for prices, the fair price, lease evaluations (E-12) and condo evaluations (E-25); construction (TM-8, `docs/design/construction.md`) for lobby heights (3.2); stars (TM-14, `docs/design/stars.md`) for the rating; UI (TM-18, `docs/design/ui.md`) for the stress and evaluation display. The VIP approval threshold is TM-15. The 0 to 10 score and the fair price are from `docs/superpowers/specs/2026-11-18-stress-score-design.md`.

## 1. Units

The engine runs one step per 10 game seconds: 1 game minute is 6 steps, 1 game day is 8,640 steps, 1 week is 60,480 steps. All stress values in the engine are whole numbers of steps. The UI shows stress as a score from 0 to 10 (3.2).

Design call: steps keep every formula in integers and match the recorded leg data, which is already in steps. The GDD states its thresholds in minutes, and 15 and 30 minutes are exactly 90 and 180 steps. The score of 3.2 turns steps into the 0 to 10 scale, with 180 steps (30 minutes) as its scale.

## 2. Trip stress

### 2.1 What counts

Each trip produces one stress value `T`, in steps, from the legs recorded by routing (section 11) and elevators (section 11):

| Part | Stress |
|---|---|
| Elevator wait | `waitSteps` of each ride, after the tall lobby cut (2.3) |
| Elevator ride | 5 for each enabled stop of the shaft the car passes between boarding and leaving |
| Stairs | 30 per stair floor walked, up or down |
| Escalators | 6 per escalator floor walked, up or down |
| Full queue | 12 per full-queue event |
| No route | 360 per failed route search |
| Long slow trip | 0, 30 or 60 (2.2) |
| Horizontal walking | 1 per 3 columns outside units (2.6) |

Then `T = min(540, sum of the parts)`.

Design call on rides: the ride counts the enabled stops the car passes, not the time it takes. A car whose shaft goes straight to the person's floor adds nothing, however tall the shaft, so the player can fix a long ride by giving a busy floor a shaft of its own or by turning stops off. A shaft that stops on every floor costs 5 per floor passed, a little more than its travel time. A trip that ends while the person is in the car counts nothing for that ride.

Design call on stairs: the GDD counts "cada piso subido a pie". A stair flight takes 12 steps (routing 8.1), and the stress of 30 per floor replaces that time; it is not added to it. Three stair floors, the most a trip may walk (routing 5.2), give 90 steps, which is the pink line by itself. A small tower can use stairs for the first two floors above the lobby and needs an elevator after that, as in the original. Going down costs the same as going up so that the trip to work and the trip home weigh the same.

Design call on escalators: an escalator floor counts its own flight time, 6 steps, and nothing more. Escalators are the comfortable way between lobby and commercial floors, and the routing order already prefers them.

Design call on horizontal walking: the GDD names the elevator wait, the ride and the floors on foot. Walking across a 375-column floor takes up to 62 game minutes (routing 8.1), and counting it would turn wide floors into a stress problem the player cannot see or fix with transport.

Design call on the cap: the original clamped each leg at the top of its scale. One cap per trip of 540 steps (90 minutes, three times the red line) stops one stranded trip from wrecking a week of good trips, while still pushing a unit with no route to poor.

### 2.2 Long slow trips

The slow floors of a trip are the enabled stops passed on its standard and service rides plus its stair floors. Express rides and escalators add no slow floors.

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

### 2.6 Noise and dirt maps

The tower keeps two maps of floats, one for noise and one for dirt, with a value for every cell of every level (`state.heat`; a level with nothing in it has no row). Each elevator car has its own pair of values. Stress from the surroundings is read from these maps.

Noise sources:

- Every game minute, each unit that is in use adds its noise (`UNIT_NOISE`) to every cell it covers, on every level it covers, and to the 15 cells on each side. The amount fades in a straight line from the unit's edge: the cell at distance d gets `noise * (1 - d / 16)`.
- A unit is in use when a venue (fast food, restaurant, shop, cinema, party hall) is open to customers, an office has a tenant between 08:00 and 18:00, or a home (a sold condo, or a hotel room with a guest) has one of its own people awake inside it, standing still. A home whose people are asleep or away is quiet.
- A person adds 0.02 to each cell they walk into and 0.05 to the cell they stand in at each minute (in a queue, waiting for a retry, or at home). A person asleep adds nothing. This is small, but dozens of people through one cell add up.
- Every game minute, each noise cell loses a little, so that 5 minutes leave 50% of its value (a factor of about 0.87 a minute). The map does not jump every 5 minutes.
- A construction site adds 8 per minute to the cells of every level it covers and 5 to the level above and the level below, with the same fade to the sides. It only does so in the minutes when a builder is working on it; a site nobody is building is quiet.

Design call: a home only makes noise while someone of it is awake inside, so at night, with the offices closed and people asleep, the noise map goes quiet.

Dirt sources:

- A person leaves 0.005 in each cell they walk into.
- A garbage bag, on the floor (a venue's pile) or carried, adds 1.5 per game minute to its cell and fades over 5 cells on each side.
- Dirt does not fade. It stays until a cleaner of a cleaning room takes it off (service-units 2.2).
- Near a garden, a lounge or a library the stress felt from a cell is lower, and a library takes noise out of the cells around it each minute (service-units 3).

Elevator cars: each rider that boards adds 0.3 noise and 0.1 dirt to the car's pair, and a rider carrying a bag adds 1 more dirt. Car noise fades like the cells. Car dirt fades slowly: it falls by half every 12 game hours when nobody adds more. A rider gets the stress of the car for the minutes of the ride, when they get out.

Stress from the maps: a cell gives `0.03 * noise + 0.15 * dirt` steps of stress per game minute. Once a minute each person on a trip, except in a car, feels their cell (each person has their own step in the minute, so a sixth of the people are visited per step). The amount is turned into whole steps with a fixed dither per person and minute, so small amounts still add up. A cell below 0.1 per minute is calm and gives back 1 step on about one minute in five.

People sitting still between trips are not visited each minute. When their next trip starts, the minutes since their last trip ended (at most 120) are counted at the cell where they stand, with the current values of the maps, and added to that trip. A worker's day at the desk shows in the trip home.

Walking: every third column walked adds 1 (`AMBIENT_WALK_CELL_STRESS` on each column that is a multiple of `AMBIENT_WALK_COLUMNS_PER_STRESS`, 3), so any walk of 3 columns adds 1. It was 1 per column; in a wide tower walking was then the main cause for almost every hotel room. Cells inside a unit do not count, so moving around inside the destination unit is free. The walk in from the map edge and the walk out to it does not count either.

Office workers mind neither noise nor walking. A walk adds them nothing, and they feel only the dirt of the cells and cars they pass, not the noise. An office is never noisy (5.4), so a noise source next to it changes neither its score nor its fair price. They still feel waits, rides, stairs, full queues and failed routes.

Maids, guards, builders and couriers add to the maps like everyone else but record no stress. The total for a trip never goes below 0. The 540 cap and the long-trip extra work as before.

Design call: all values are first guesses, kept in `balance.ts`. Heat only exists on cells with floor or lobby; cells that lose their floor are cleared. The maps live in the saved state as plain arrays and are copied by slicing each step. The noise of the unit score (5.4) is a separate point added to the score, and the maps add to the trip stress that feeds the base.

## 3. Person stress

### 3.1 Average

A person's stress `P` is the average of the trips that ended in the last 60,480 steps, plus the trip in progress:

`P = floor((sum of T of those trips + T so far) / (number of those trips + 1))`

where "T so far" and the `+ 1` are used only while the person is on a trip. "T so far" is the sum of the parts of 2.1 recorded up to this step, including the wait or ride under way, without the long-trip extra and with the 540 cap. A person with no trips has `P = 0`.

Person stress is for display and for TM-15's VIP check. Unit scores use only ended trips (section 5).

Design call on the trip in progress: a person who has waited 20 minutes at a crowded shaft should turn pink while still waiting. That is the view the player uses to find bad shafts.

### 3.2 Score and display buckets

Stress is shown to the player as a score from 0 to 10 with decimals. Any stress in steps, or any average of stress in steps, becomes a score with

`S = 10 × (1 − e^(−steps / 180))`

where 180 steps is 30 minutes. One decimal is shown, with a comma in the UI ("3,4 / 10"). The score of 5 minutes (30 steps) is 1.5, of 15 minutes (90 steps) is 3.9, of 30 minutes (180 steps) is 6.3, of 60 minutes is 8.6, and of the 540-step trip cap is 9.5. The curve never reaches 10.

The same function is used for a person's `P`, a unit's base `B`, a venue's daily average and the tower's average trip.

| Score `S` | Sprite tint |
|---|---|
| under 4 | normal, ink (black) |
| 4 to under 7 | pink, `stress-pink` |
| 7 or more | red, `stress-red` |

The tints are display buckets for the drawn art. No rule reads them. Every rule reads the exact score, and the one decimal is for display only, buckets included.

The person window shows a bar from 0 to 10 with the score in numbers, for example "4,2 / 10". The bar color moves smoothly from ink `#141218` to red `#d81e2a` with the score. There are no ticks and no level words (ui.md 6.3). The thresholds do not change with stars.

The VIP approval rule is unchanged: it still compares the VIP's average trip stress in steps with `VIP_MAX_STRESS_STEPS` (90 steps, a score of 3.9). Only the text the player sees uses the score.

Design call on the curve: it spreads the usual range of trip stress (2 to 30 minutes) over most of the scale, and very bad routes end near 10 without a hard cap. A well-served office trip is 4 to 7 minutes (section 9), a score of 1.2 to 2.1.

Design call on the buckets: pink from 4 is an average of about 15 minutes and red from 7 is about 36 minutes. This is close to the 15 and 30 minute lines the GDD gave, so pink still means a real problem and red a broken route or an overloaded shaft.

### 3.3 Causes

Every stress part that goes into a trip is also added to one of eight running totals per person, so the person window can say why the person is stressed. Only people who record stress (2.5) keep them.

| Cause | Parts |
|---|---|
| `wait` | Counted elevator waits, also a wait cut short |
| `ride` | Ride steps, also a ride cut short, and the long slow trip extra (2.2) |
| `stairs` | Stair and escalator floors |
| `queue` | Full queue events |
| `noRoute` | Failed searches and the 03:00 reset |
| `walk` | The stress of each column walked |
| `noise` | The noise part of what is felt in cells, at the start of a trip and in cars |
| `dirt` | The dirt part of the same. A hotel guest inside their own room does not feel its dirt |
| `calm` | Stress taken off by calm cells and cars, kept as a positive amount |

At 00:00 each total keeps `STRESS_CAUSE_DAILY_KEEP` (0.82) of itself, so a cause halves in about 3.5 days, in step with the 7-day window of `P`. The totals only rank causes. They are not `P` and the trip cap (2.1) does not apply to them.

The person window lists up to 3 causes under "Disconforme por": the causes worth at least 10% of the person's stress and at least a minute, heaviest first. Under "Contento con" it lists up to 3 things: "Lugares tranquilos" when calm is at least a minute, then the causes worth less than 5% of the stress or less than a minute, lightest first. Before a person has felt any stress both lists are empty.

## 4. Venue visit stress

The venue stress factor of people.md 11.3 uses, for a fast food, restaurant, retail shop, cinema or party hall, the average `T` of the trips that ended at that venue's door between 00:00 and 24:00 of the previous day, rounded down. The factor is

`1 − 0.04 × S`

where `S` is the score of that average (3.2). It is 1.0 at a score of 0 and 0.6 at 10. With no such trips the factor is 1.0.

A venue whose visitors average 90 steps (a score of 3.9) has a factor of 0.84. Every rule reads the exact score, not the displayed decimal.

Design call: a straight line replaces the three steps of 1.0, 0.8 and 0.6, so each extra point of stress costs a venue 4% of its outside customers and there is no edge to sit just under.

## 5. Unit score

### 5.1 Evaluated units

Offices, retail shops, condos and hotel rooms (single, double and suite) are evaluated. Fast food, restaurants, cinemas, party halls and service units are not; their customers react through the venue factor of section 4.

### 5.2 Base stress

Each evaluated unit keeps a stress ledger of trips. The base `B` is `floor(sum of T / number of trips)` over the trips in the ledger that fall in the unit's window. With no trips in the window, `B = 0` and the unit has no score of its own (5.3).

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

### 5.3 Occupant score

The occupant score `U` of a unit is the score of its base `B` (5.2, same ledger, same windows, with access control taken off in steps before the conversion, service-units 2.3), plus 1.0 when a noise source is close by (5.4), capped at 10.

A unit with no trips in its window has no score of its own and uses the tower score. The tower score is the score of the average of all filed trips in the trip ledger. With no trips at all it is 3.0, the neutral point of the fair price (5.5). A unit still to be built is valued at the tower score too.

Design call: the ledger average is the average of the trips the occupants made in the window. It is used instead of averaging each occupant's own score so that a hotel room or office that changed people still has a value, and so that a shop, whose "occupants" are its customers, works the same way.

Design call on the tower score: a new office or shop starts with a fair price that matches how the tower is doing, and a unit with no trips yet is neither rewarded nor punished.

### 5.4 Noise

A unit gets +1.0 on its occupant score when at least one noise source of its list is on the same level within its radius. Only one +1.0 applies, however many sources there are. The score stays at 10 or under.

| Unit | Radius | Noise sources |
|---|---|---|
| Hotel room | 20 | fast food, restaurant, office, retail shop, cinema, party hall |
| Condo | 30 | single room, double room, suite, fast food, restaurant, office, retail shop, cinema, party hall |
| Retail shop | none | none |

The gap between a unit on columns `a` to `b` and a source on columns `c` to `d` on the same level is `c - b - 1` when the source is to the right (`c > b`) and `a - d - 1` when it is to the left (`d < a`). The source is in range when the gap is at or below the radius. Two adjacent units have a gap of 0.

A source taller than one level (cinema, party hall) is on every level it covers. A source counts while it exists, with or without a tenant, stay or customers. Ruins are not a source.

Design call on the lists: the GDD's "restaurantes" covers both food units, "comercios" is the retail shop and "entretenimiento" is the cinema and the party hall. "Hotel" for condos means the three room types. Housekeeping is not a noise source.

Design call on vacant sources: a source that makes noise only while rented would change grades with no visible change on the map. The player sees units, not tenants.

Design call on the amount: one point of score is about 7% to 10% of the base price in the fair price (5.5), depending on where the score is. That is what a noise source costs a unit.

### 5.5 Fair price and value

The fair price replaces the old appraisal and keeps its name in code (`unit.appraisal`). It is

`base price × (100 + stars + amenities + occupant percent) / 100`

clamped to 60% to 160% of the base price and rounded to whole money.

- Base price: the normal price of the unit type (economy 3).
- Stars: 4 for each star of the tower above the first.
- Amenities: 1 for each retail shop, fast food, restaurant, cinema, party hall and medical center in the tower, up to 12. A shop counts itself.
- Occupant percent from `U`: +30 at 0, 0 at 3 and -50 at 10, in straight lines between those points. A score of 1 gives +20 and a score of 5 gives -14.3.

There is no grade term and no tower-wide stress term, so the fair price does not depend on the grade that depends on it. A unit with no score of its own uses the tower score.

The value of a unit is `v = fair price / price paid`. The price paid is the unit's price for an office or shop, the sale price for a condo, and for a hotel room the rate the stay paid at check-in (the room's price when no stay has a rate). A price of 0 gives an infinite `v`.

Neighbor pull: the units that touch a unit are the evaluated units on the same level with a gap of 0 columns (5.4), and those on the level directly above or below with at least one column in common. Only neighbors with occupants count: an office or shop with a lease, a sold condo, and a hotel room with a stay in progress. An empty room, an unleased office or shop and an unsold condo do not. The own value of a neighbor is worked out on demand from the current state, with the tower score when it has no trips in its window, so nothing new is stored.

If the lowest neighbor own value `n` is below the unit's `v`, the value of the unit becomes `v − 0.15 × (v − n)`. Only the worst neighbor counts. Otherwise `v` is unchanged. A neighbor never pulls a value up.

No chain: the neighbor value used is always the neighbor's own value, before its own pull. A unit's grade depends only on itself and on the units touching it, and a poor unit lowers its neighbors once, by a share.

Example: unit A has `v = 1.0`. Neighbor B is poor with `v = 0.6`. A becomes `1.0 − 0.15 × 0.4 = 0.94`. If B had `v = 1.3`, A would stay at 1.0.

Design call: a calm, well-served office can ask for a higher rent, and fixing the elevators of one office raises the rent that office accepts. A unit only accepts what its own occupants think it is worth.

### 5.6 Reasons in the unit window

The window of every evaluated unit (office, shop, condo and hotel room) lists what counts for its grade in a tooltip on its evaluation tile, from the parts the grade would use now. Each reason in favor is a green line starting with "+", each reason against a red line starting with "-", with no headings. Each reason says what is good or bad about the place, and none names the occupants.

- Price: a price over the fair price is against: "Alquiler caro" for an office or shop, "Precio alto" for a condo and "Tarifa cara" for a hotel room. A price under the fair price is in favor: "Alquiler barato", "Precio bajo" or "Tarifa barata". A price equal to the fair price is not listed.
- Stress: an occupant score `U` under 3 is "Ambiente tranquilo" in favor, because the occupants raise the fair price. From 3, the cause with the largest total (3.3) among the unit's own people, calm left out, is against: "Demasiada espera de ascensor" (wait), "Viajes en ascensor muy largos" (ride), "Demasiadas escaleras" (stairs), "Colas de ascensor llenas" (queue), "Difícil de llegar" (no route), "Demasiado ruido" (noise), "Demasiada suciedad" (dirt), and for walking "Oficina demasiado lejos", "Local demasiado lejos", "Departamento demasiado lejos" or "Habitación demasiado lejos". With no cause to name, as in a shop whose grade comes from its customers, it reads "Ambiente estresante".
- Parking: from 3 stars, when the unit has a person who asks for parking (people.md 17), "Con cochera" is in favor if every such person has a space and "Sin cochera" is against if one has none. A missing space also takes 10% off the fair price (economy 3.1).

The neighbor pull still counts in the grade, but it is not listed. Noise is not listed on its own: it counts in the occupant score (5.4) and shows as "Demasiado ruido" when it is the main cause.

The unit window also shows the fair price, labeled "Precio justo" on the price bar and "Tasación" in the condo window (ui.md 6.2). It does not show the occupant score as a number.

The parts are worked out when the window asks for them. They are not the stored grade, which changes only at the moments in section 7.

## 6. Grade

The grade comes from the value `v` of 5.5, after the neighbor pull.

| `v` | Below 4 stars | 4 stars or more |
|---|---|---|
| 1.0 or more | good (Buena) | good (Buena) |
| 0.8 to under 1.0 | fair (Regular) | fair (Regular) |
| 0.7 to under 0.8 | poor (Mala) | fair (Regular) |
| under 0.7 | poor (Mala) | poor (Mala) |

The rating is the tower's rating at the step of the grade (stars.md 2). The Torre rank counts as 4 stars or more.

Design call on the lines: a price at or under the fair price is good. A `v` of 0.8 is a price 25% over the fair price and 0.7 is about 43% over. From 4 stars people put up with a higher rent, so the poor line moves from 0.8 down to 0.7 and the good line does not move. The old rule that the lowest price level is always good is gone: such a price is far under any fair price and grades good on its own.

Prices are free money amounts, so `v` is continuous. The lines are a starting balance and are expected to move after the game is played.

## 7. When grades are computed

| Unit | Grade computed | Used for |
|---|---|---|
| Office, shop | at each lease end step (economy E-12), and every day at 00:00 | the renewal at the lease end; display at any time |
| Condo | at each evaluation step (economy E-25), and every day at 00:00 | the buyback at the evaluation step; display at any time |
| Hotel room | at the stay's end step, 10:00 on the check-out day (economy E-20) | the booking chance (people.md 8.1) until the next stay ends; display |

The unit keeps its last computed grade. That stored grade is what the inspection window and the Evaluación overlay show (ui.md 6.2 and 7).

- The fair price of the unit is recomputed right before each grade is stored: at the lease end, the condo evaluation and the stay end. The decision therefore uses a current value and the window shows the same fair price. At 00:00 the fair price of every priced unit is stored after the grades.
- An office or shop with no tenant and a condo that is not sold have no grade and show "Sin evaluar". The grade is cleared when the tenant or owners leave.
- An office, shop or condo with a tenant or owners but no trips in the window at a 00:00 computation keeps the grade it had. This rule is unchanged. If it has none yet, it gets one worked out from the tower score, so it never shows "Sin evaluar" while someone lives or works there. At a lease end or condo evaluation step, a window with no trips is graded from the tower score as usual.
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

- An office on level 9 with one shaft that is not crowded: wait 10 to 20 steps, ride 13 to 28, so 23 to 48 a trip, 4 to 8 minutes. The score is 1.2 to 2.3 and adds 7 to 18 percent to the fair price. At 3 stars with a noise source close by the fair price stays above the base price, so a tenant at the base price grades good.
- The same office in a morning rush with one car for 60 workers: the car takes 21 at a time and needs about 68 steps a round trip (elevators 12), so arrival waits are about 0, 68 and 136, an average near 70. Only the arrival trip waits that long. Four trips a day give a base near `(4 × 35 + 70) / 4 = 52`, a score of 2.5 and a fair price 4.9% over the base. With noise the score is 3.5 and the fair price 3.7% under it.
- A required trip with one failed search ends at 360 plus the trip. One such trip in a week of 20 adds about 18 to a base of 40, about 0.8 of a score point.
- An office with no route at all: every trip is capped at 540, so the base is 540 and the score is 9.5. The fair price is at the 60% floor, 6,000 for an office at 1 star with no amenities. At the base price of 10,000 the value is 0.6 and the grade is poor.

The balance simulation checks these and GD retunes the constants in section 11.

## 10. Worked examples

The ride parts below were worked out when a ride counted its time and its floors. Under SE-02 a ride counts 5 for each enabled stop passed, and the slow floors are those stops: T1 with every floor enabled has 7 stops passed, so its ride is 35 instead of 23.

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

A resident finished 12 trips in the last week with a total of 1,140 (average 95, alto). Now the resident has been waiting 60 steps at a shaft. `P = floor((1,140 + 60) / 13) = floor(92.3) = 92`. The score is `10 × (1 − e^(−92 / 180)) = 4.0`. The window shows "4,0 / 10" and the sprite is pink.

The next morning, 4 trips of the 12 drop out of the window, with a total of 520. The resident is home, not on a trip, and has finished the trip above with `T = 75`. `P = floor((1,140 - 520 + 75) / 9) = floor(77.2) = 77`. The score is `10 × (1 − e^(−77 / 180)) = 3.5`: "3,5 / 10", and the sprite is back to normal.

### 10.3 Office

An office on level 9, columns 100 to 108, in a 3-star tower with one amenity, a fast food on the same level. The base price is 10,000 a week. Its lease ends on a Wednesday at 14:20. In the 60,480 steps before that step, the 6 workers finished 108 trips with a total of 7,668. `B = 7,668 / 108 = 71`, a score of `10 × (1 − e^(−71 / 180)) = 3.26`.

The fast food is on columns 117 to 132: gap `117 - 108 - 1 = 8`, at or below 10, so noise. `U = 3.26 + 1 = 4.26`. Occupant percent: `-50 × (4.26 - 3) / 7 = -9.0`. Stars: `(3 - 1) × 4 = 8`. Amenities: 1. Fair price: `10,000 × (100 + 8 + 1 - 9.0) / 100 = 10,000`.

| Price | `v` | Grade | Lease |
|---|---|---|---|
| 10,000 | `10,000 / 10,000 = 1.00` | good | renews |
| 12,000 | `10,000 / 12,000 = 0.83` | fair | renews |
| 13,000 | `10,000 / 13,000 = 0.77` | poor | tenant leaves |
| 15,000 | `10,000 / 15,000 = 0.67` | poor | tenant leaves |

With the fast food at columns 120 to 135 the gap is 11, out of range, so `U = 3.26`. Occupant percent `-50 × 0.26 / 7 = -1.9`, fair price `10,000 × (100 + 8 + 1 - 1.9) / 100 = 10,714`. At 12,000 the value is 0.89, fair. At 13,000 it is 0.82, which was poor with the noise and is fair now.

Same office, different week: `B = 125`, a score of 5.01, the fast food at 117, so `U = 6.01`. Occupant percent `-50 × 3.01 / 7 = -21.5`. At 3 stars the fair price is `10,000 × (100 + 8 + 1 - 21.5) / 100 = 8,753` (8,752.5 rounded). At a price of 12,000, `v = 0.73`: poor, and the tenant leaves. At 4 stars the stars term is 12 and the fair price is 9,153, so `v = 0.76`. That is fair, and the tenant renews.

A poor neighbor: the first office at a price of 10,000 has `v = 1.00`. A shop touching it on the same level has an own value of 0.6. The office's value becomes `1.00 - 0.15 × (1.00 - 0.6) = 0.94`, fair. The office window lists "Vecino mal valorado" against.

### 10.4 Condo

A condo on level 20, columns 200 to 215, in a 3-star tower with one amenity, sold for 190,000. The base price is 175,000. A single room on level 20 at columns 240 to 243: gap `240 - 215 - 1 = 24`, at or below 30, so noise. The evaluation step falls 8 weeks after the sale.

- In the window the 3 residents finished 54 trips with a total of 5,940. `B = 110`, a score of 4.57, so `U = 5.57`. Occupant percent `-50 × 2.57 / 7 = -18.4`. Fair price `175,000 × (100 + 8 + 1 - 18.4) / 100 = 158,593`. `v = 158,593 / 190,000 = 0.83`: fair, the owners stay.
- In another window, 54 trips with a total of 8,100. `B = 150`, a score of 5.65, so `U = 6.65`. Occupant percent `-50 × 3.65 / 7 = -26.1`. Fair price `175,000 × (100 + 8 + 1 - 26.1) / 100 = 145,075`. `v = 145,075 / 190,000 = 0.76`. At 3 stars that is poor: the owners leave and the player pays back the sale price (economy E-25). At 4 stars the fair price is 152,075 and `v = 0.80`, which is fair, so nothing happens.

### 10.5 Hotel room

A double room on level 16, columns 50 to 55, in a 3-star tower with no amenity units. An office on level 16 at columns 70 to 78: gap `70 - 55 - 1 = 14`, at or below 20, so noise. A party of 2 checks in on Monday and pays 3,500 a night for 1 night; the stay ends Tuesday at 10:00. The base price of a double room is 3,000.

| Trip | Ended | T | Counted |
|---|---|---|---|
| Guest A arrives at the room | Monday 18:40 | 40 | yes |
| Guest A goes to a restaurant | Monday 20:05 | 30 | yes |
| Guest A comes back | Monday 21:12 | 26 | yes |
| Guest B arrives at the room | Monday 18:40 | 40 | yes |
| Guest A leaves the tower | Wednesday 09:20 | 34 | yes |
| Guest B leaves the tower | Wednesday 10:03 | 50 | no, after the stay's end |

`B = floor(170 / 5) = 34`, a score of `10 × (1 − e^(−34 / 180)) = 1.72`. With the office close by, `U = 2.72`. Occupant percent `30 × (1 - 2.72 / 3) = 2.8`. Fair price `3,000 × (100 + 8 + 0 + 2.8) / 100 = 3,324`. `v = 3,324 / 3,500 = 0.95`: fair. Until the next stay of this room ends, its booking roll at 12:00 has a 70% chance.

With the office at columns 77 to 85 the gap is 21, out of range, so `U = 1.72`. Occupant percent `30 × (1 - 1.72 / 3) = 12.8`. Fair price `3,000 × (100 + 8 + 12.8) / 100 = 3,624`. `v = 3,624 / 3,500 = 1.04`: good, and the chance is 90%. At columns 76 to 84 the gap is 20, still in range.

### 10.6 Retail shop

A shop in a 1-star tower whose only amenity is the shop itself. The base price is 15,000 a week. Its lease ends on a Saturday at 11:00. In the 60,480 steps before that step, 180 trips ended at its door (residents, guests and outside customers) with a total of 14,580. The early-leave check runs first (economy E-15): 180 visits is not below 70, so the tenant stays to evaluate. `B = 14,580 / 180 = 81`, a score of `10 × (1 − e^(−81 / 180)) = 3.62`. Shops have no noise, so `U = 3.62`.

Occupant percent `-50 × (3.62 - 3) / 7 = -4.5`. Stars 0, amenities 1. Fair price `15,000 × (100 + 0 + 1 - 4.5) / 100 = 14,482`.

- At a price of 15,000: `v = 14,482 / 15,000 = 0.97`, fair, the tenant renews.
- At 14,000: `v = 1.03`, good.
- At 20,000: `v = 0.72`, poor at 1 star, the tenant leaves.
- At 4,000: `v = 3.62`, good.

### 10.7 Venue factor

On Tuesday, 40 trips ended at a fast food's door with a total of 4,000. The average is 100 steps, a score of `10 × (1 − e^(−100 / 180)) = 4.26`. On Wednesday its stress factor is `1 - 0.04 × 4.26 = 0.83` (people.md 11.3). With a weekday base of 20 and no subway: `floor(20 × 0.83 × 1.0) = 16` outside customers.

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
| `STRESS_SCORE_SCALE_STEPS` | 180 |
| `STRESS_SCORE_MAX` | 10 |
| `STRESS_SCORE_PINK_FROM` | 4 (display only) |
| `STRESS_SCORE_RED_FROM` | 7 (display only) |
| `VENUE_FACTOR_PER_POINT` | 0.04 |
| `VIP_MAX_STRESS_STEPS` | 90 (events 6.3) |
| `TOWER_SCORE_DEFAULT` | 3 |
| `EVAL_NOISE_SCORE` | 1 |
| `EVAL_NOISE_RADIUS` | hotel room 20, office 10, condo 30 |
| `FAIR_PRICE_STRESS_PERCENT` | +30 at score 0, 0 at 3, -50 at 10 |
| `APPRAISAL_STAR_PERCENT` | 4 |
| `APPRAISAL_AMENITY_PERCENT_EACH` | 1, up to `APPRAISAL_AMENITY_PERCENT_CAP` 12 |
| `APPRAISAL_RANGE_PERCENT` | 60 to 160 |
| `GRADE_GOOD_FROM` | 1.0 |
| `GRADE_FAIR_FROM` | 0.8; `GRADE_FAIR_FROM_FOUR_STARS` 0.7 |
| `NEIGHBOR_PULL` | 0.15 |

Trip stress and the unit base are in steps. The score, the fair price percent and the value are not. The radius is in columns and the slow floors are in floors.

## 12. GDD coverage

| GDD line | Section | Result |
|---|---|---|
| Stress is the average game minutes per trip | 2, 3 | Kept; held in steps, shown in minutes, over a 7-day window |
| Counts the elevator wait and the ride | 2.1 | Kept |
| Counts each floor climbed on foot | 2.1 | Kept; stairs 30, escalators 6, up and down alike |
| Penalty for no route | 2.1, 2.4 | Kept; 360 per failed search, trip capped at 540 |
| Long trips on standard elevator or stairs add extra, express does not | 2.2 | Kept; from 15 and 25 slow floors |
| A lobby 2 or 3 floors tall reduces the wait going up | 2.3 | Kept; 18 and 36 off the wait of up rides |
| Pink from 15 minutes, red from 30 | 3.2 | Replaced by the 0 to 10 score; pink from 4, red from 7, display only |
| Unit score is the average stress of its occupants | 5.2 | Kept; shops use their visitors |
| Price: alto adds, normal nothing, bajo subtracts, mínimo always passes | 5.5, 6 | Replaced by the fair price: the grade comes from the price against the fair price |
| Noise: hotel 20, office 10, condo 30, with their source lists | 5.4 | Kept; +1 score point once |
| Good, fair or poor | 6 | Kept; by the value `v`: 1.0, 0.8, else poor |
| From 4 stars people tolerate more | 6 | Kept; the poor line moves to 0.7 |

## 13. Rules

### Trip stress

SE-01. Stress values are whole numbers of steps. The UI shows them as a score from 0 to 10 (SE-23).

SE-02. A trip's stress is the sum of: the wait of each ride after the tall lobby cut; 5 for each enabled stop of the shaft the car passes on each ride; 30 per stair floor; 6 per escalator floor; 12 per full-queue event; 360 per failed route search; and the long-trip extra. Horizontal walking adds nothing. The result is capped at 540.

SE-03. Slow floors are the enabled stops passed on standard and service rides plus the stair floors of the trip. The long-trip extra is 0 for 0 to 14 slow floors, 30 for 15 to 24 and 60 for 25 or more. Express rides and escalators add no slow floors.

SE-04. A ride that boards on a lobby cell and goes up has its wait reduced by 18 if that lobby level has height 2 and by 36 if it has height 3, never below 0. Rides that go down or board outside a lobby get no cut.

SE-05. A trip ended by the 03:00 night reset adds 360 and is recorded at 03:00. A required trip given up is recorded at that step with what it has.

SE-06. An optional trip cancelled at its start records nothing. An optional trip cancelled after the person left is recorded with what it has, with no no-route penalty. A failed medical visit records no stress. A subway-to-street switch adds nothing. A trip of a removed person is not recorded.

SE-07. Maids and security guards record no stress. Every other person does.

### Person stress

SE-08. A person's stress is `floor((sum of T of trips ended in the last 60,480 steps + T so far) / (count + 1))` while on a trip, and `floor(sum / count)` otherwise. "T so far" excludes the long-trip extra and is capped at 540. With no trips it is 0.

SE-09. Retired, replaced by SE-23.

SE-10. Retired, replaced by SE-24.

### Unit score

SE-11. Offices, retail shops, condos and hotel rooms are evaluated. No other unit has a grade.

SE-12. An office's base is the average T, rounded down, of its workers' trips that ended at a step `e` with `s - 60,480 <= e < s`. A condo uses its residents' trips and a shop the trips that ended at its door, over the same window. A hotel room uses the trips of the current stay's guests that ended from check-in up to the stay's end step. No trips gives a base of 0.

SE-13. A unit's ledger is cleared when a new office or shop tenant moves in, when a condo is sold and when a hotel stay starts.

SE-14. Retired, replaced by SE-25 and SE-26.

SE-15. Retired, replaced by SE-27.

SE-16. Noise is +1 on the occupant score, once, when at least one source of the unit's list is on the same level with a gap at or below the radius: hotel rooms 20 columns (fast food, restaurant, office, retail, cinema, party hall), offices 10 (fast food, restaurant, retail, cinema, party hall), condos 30 (single, double, suite, fast food, restaurant, office, retail, cinema, party hall). Shops get no noise.

SE-17. The gap is `c - b - 1` for a source on columns `c` to `d` right of a unit on `a` to `b`, and `a - d - 1` for a source on the left. A source taller than one level is on every level it covers. A source counts while it exists, rented or not. Ruins are not a source.

### Grade

SE-18. Retired, replaced by SE-29.

SE-19. Offices and shops are graded at each lease end step and every day at 00:00. Condos are graded at each evaluation step and every day at 00:00. Hotel rooms are graded at the stay's end step.

SE-20. The 00:00 grade runs after the money events of economy section 10 items 1 to 6 and before player commands. At 00:00, a unit with no trips in its window keeps its last grade. At a lease end or condo evaluation step, or at 00:00 when it has no grade yet, a unit with no trips is graded from the tower score.

SE-21. An office or shop with no tenant and an unsold condo show "Sin evaluar"; their grade is cleared when the tenant or owners leave. A hotel room with no ended stay shows "Sin evaluar". A party that gives up before check-in does not change a room's grade.

SE-22. The stored grade is what the inspection window, the Evaluación overlay and the hotel booking chance use.

### Score and fair price

SE-23. A stress in steps `s` is shown as the score `10 × (1 − e^(−s / 180))`, with one decimal for display. Rules read the exact score. Sprites are normal under 4, pink from 4 and red from 7, display only. The VIP rule compares steps with 90.

SE-24. A venue's stress factor for the day is `1 − 0.04 × S`, where `S` is the score of the average T of the trips that ended at its door on the previous day, rounded down in steps. No trips gives 1.0.

SE-25. The occupant score of a unit is the score of its base (access control applied in steps first) plus 1.0 with a noise source close by, capped at 10. A unit with no trips in its window uses the tower score, the score of the average of all filed trips, 3.0 with none.

SE-26. The fair price is `base price × (100 + stars + amenities + occupant percent) / 100`, clamped to 60% to 160% of the base price. Stars are 4 for each star above the first. Amenities are 1 for each retail shop, fast food, restaurant, cinema, party hall and medical center, up to 12, and a shop counts itself. The occupant percent is +30 at score 0, 0 at 3 and -50 at 10, in straight lines.

SE-27. The value of a unit is its fair price over the price paid: the price for an office or shop, the sale price for a condo, the rate the stay paid for a hotel room. A price of 0 gives an infinite value. The fair price is recomputed before each grade is stored.

SE-28. A touching neighbor with occupants and a lower own value `n` pulls the value to `v − 0.15 × (v − n)`. Only the lowest neighbor counts, a neighbor never pulls up, and the neighbor's own value is used with no pull of its own.

SE-29. Below 4 stars: `v` of 1.0 or more is good, 0.8 to under 1.0 fair, under 0.8 poor. At 4 stars or more, including Torre: 1.0 or more good, 0.7 to under 1.0 fair, under 0.7 poor. The rating is the one at the step of the grade.
