# Routing costs and walking limits

Version 1.0, 16 November 2026. Owner: Game Designer. Task TM-11.

This document defines how a person gets from one place in the tower to another: which cells people can walk on, what each kind of transport costs in the route choice, how far people walk on stairs and escalators, how many elevator rides a trip may use, what happens at a full elevator queue, and what happens when there is no route. Values come from `docs/GDD.md` (section Recorridos) and the route-choice model in the SimTower research notes (section 5), adapted to a 10-second step and to the transport rules of the construction spec. Where the GDD leaves a point open, the decision is marked "Design call" with a short reason. Section 12 has worked examples on three sample towers. The numbered rules at the end are the contract for the engine (`packages/engine`), the balance constants (`packages/shared`) and QA.

Related specs: construction (TM-8, `docs/design/construction.md`) for the grid, lobbies, stairs, escalators, shafts and express stops; people (TM-10, `docs/design/people.md`) for when trips start, required and optional trips, entrances, the 2-hour retry and the 03:00 night reset; the tech doc (TM-5, `docs/tech/engine-and-protocol.md`) for levels, the dense level index and person views. Car speed, door time, capacity, boarding order, time bands and response distance are TM-12. Stress and the no-route penalty are TM-13. This document decides the path; TM-12 decides when a car comes; TM-13 turns the trip into stress.

## 1. Time and distance units

The engine runs one step per 10 game seconds. One game minute is 6 steps, one game hour 360 steps and one game day 8,640 steps.

Horizontal distance is measured in columns. Vertical distance is measured in floors, counted in level order with no level 0 (construction section 1). The number of floors between levels `a` and `b` is `|levelIndex(a) - levelIndex(b)|`, using the dense index from the tech doc (3.1). From S1 to floor 1 is 1 floor; from S7 to floor 45 is 51 floors.

## 2. Walkable cells and runs

### 2.1 Walkable cells

A cell is walkable when it has structure (floor, lobby, or a unit's bottom row) and its occupant is not ruins. In particular:

- Lobby cells are walkable on every row of a tall lobby (construction 3.4).
- Shaft cells, stair and escalator footprints and landings are walkable. People pass in front of them.
- A unit's bottom row is walkable. People walk in front of offices, shops and rooms, including infested rooms.
- The upper rows of a unit taller than one level are not walkable (cinema, party hall, recycling center, cathedral levels 102 to 104), with one exception: the top row of the subway station (level -7) is walkable and its two lower rows (-8 and -9) are not.

Design call on upper rows: there is no slab inside a two-level unit to stand on. Splitting the upper level there makes the player see why the floor above a cinema needs its own stairs or elevator stop on each side. The subway exception exists because people.md (section 3) puts the subway entrance on the station's top row.

### 2.2 Runs

A run is a maximal horizontal sequence of walkable cells on one level with no gap. A person can walk between any two cells of the same run and cannot cross a gap. Moving between runs, including two runs on the same level, always needs a transport.

Runs change only when the player builds or demolishes, or an event leaves ruins. The engine can keep a run table and rebuild it after any such change.

## 3. Points

Every place a person starts or ends a trip at is a point: a level and a column.

| Point | Level | Column |
|---|---|---|
| Unit door | the unit's bottom row (the top row for the subway station) | `x + floor(w / 2)` |
| Street entrance | 1 | the left or right end column of the main lobby, as drawn in people.md section 3 |
| Subway entrance | -7 | the column drawn in people.md section 3 |
| Parking space | the space's level | `x + 2` |
| Stair or escalator flight | both of its levels | `x + 4` |
| Elevator shaft | every level where it stops | `x + floor(w / 2)`: `x + 2` for standard and service, `x + 3` for express |

A person walks straight along the run between points. Up and down queues are drawn on the left and right of a shaft (construction 5.5), but for routing and timing the person boards and leaves at the shaft's middle column. Where the queue is drawn is TM-12 and the client's business.

A person whose cell stops being walkable (a two-level unit placed over them, ruins) is moved at once to the nearest walkable cell on the same level, the lower column on a tie, and re-plans (section 8). If the level has no walkable cell left, the trip counts as a failed attempt and the person goes to their night place as in the 03:00 reset (people.md 4.1).

## 4. Transport links

| Link | Connects | Who may use it | Floors per use |
|---|---|---|---|
| Stairs | level L and the level above, both directions | everyone | 1 |
| Escalator | level L and the level above, both directions | everyone except maids | 1 |
| Standard elevator | any two enabled stops of the shaft | everyone except maids | the floors between the two stops |
| Express elevator | any two enabled stops of the shaft | everyone except maids | the floors between the two stops |
| Service elevator | any two enabled stops of the shaft | maids only | the floors between the two stops |

Who may use what comes from people.md section 2: maids use floors, stairs and service elevators only; everyone else, guards included, uses stairs, escalators, standard and express elevators.

An elevator stop is enabled when it is in the shaft's `stops` list (TM-12 settings). Express shafts can only enable the levels in construction 5.4. Routing ignores the shaft's time-band mode, wait time and response distance; those change how long the ride takes, not whether it exists. A shaft always has at least one car (construction C-42), so a shaft with two enabled stops is always a link.

## 5. Legs, routes and trips

A trip goes from a start point to a destination point. A route is the full plan of a trip, written as a list of legs. Each leg is one of:

- Stair leg: one or more stair flights in a row, with only walking on the same run between one flight and the next.
- Escalator leg: the same with escalator flights.
- Ride: one elevator ride, from boarding at one stop to leaving at another stop of the same shaft.
- Final walk: the walk on the destination's run to the destination point.

Each transport leg includes the walk on the current run to its first flight or to the shaft. A route that starts and ends on the same run is a single final walk.

A route can go up and down. A person may go up one floor to catch an elevator that takes them down.

### 5.1 Per-segment planning

People plan one leg at a time (GDD Recorridos). At the start of a trip, and every time a leg ends, the person computes the cheapest route from where they stand to the destination (section 7) and starts its first leg. Only the first leg is a commitment. The rest of the route is thrown away and computed again when the leg ends, with the tower as it is at that step.

Design call: the original planned a single leg with a local cost. Here the person scores whole routes and keeps the first leg. It gives the same behaviour in simple towers, never sends a person up a flight of stairs into a dead end, and the cost is easy to check by hand.

### 5.2 Trip budgets

Each trip carries three counters that start at zero and are never reset until the trip ends:

| Counter | Limit | Source |
|---|---|---|
| Stair floors walked | 3 | GDD: "como máximo 3 pisos por escalera fija" |
| Escalator floors walked | 7 | GDD: "7 por escalera mecánica" |
| Elevator rides taken | 3 | design call below |

A route is valid only if the counters already used in the trip plus the route's own floors and rides stay within the limits. The stair and escalator limits are separate: a trip may use up to 3 stair floors and up to 7 escalator floors.

Design call on per-trip limits: the GDD gives the walking limits per trip on foot. If they were per leg, a person could chain stairs, then an elevator, then more stairs, and a tower with no elevators could still grow tall. Counting per trip keeps the GDD's meaning that elevators are needed beyond a few floors.

Design call on 3 rides: the research notes say players saw at most one transfer, while the reverse-engineered model allows chains. A 100-floor tower needs two transfers in one case: from the subway, a standard elevator to the lobby, an express to a sky lobby, and a local elevator up. Three rides allow that and nothing longer.

## 6. Leg costs

Route cost is a whole number of cost points. Horizontal walking costs nothing; it is only a tie break (section 7.2).

| Leg | Cost |
|---|---|
| Escalator leg | `8 × floors` |
| Ride on a standard or service elevator | `8 × floors + 500` |
| Ride on an express elevator | `3 × floors + 500` |
| Stair leg | `8 × floors + 600` |
| Final walk | 0 |

Two surcharges are added to a ride:

| Surcharge | Amount | When |
|---|---|---|
| Transfer | +2,500 | the ride is the 2nd or 3rd ride of the trip, counting rides already taken |
| Full queue | +1,000 | the ride boards on the person's current run, and that shaft's queue at this level in the ride's direction holds 40 people at the planning step |

The full-queue surcharge applies only to the first leg of the route, because that is the only queue the person can see. Queues on later levels are not looked at.

Design call on the numbers: the research notes give escalator 8 per floor, stairs and one-ride elevator 8 per floor + 640, and a transfer 8 per floor + 3,000. The GDD wants a strict order (escalator, elevator without transfer, stairs, elevator with transfer), and with the original numbers stairs and a direct elevator tie. Stairs move to 600 and a ride to 500. The order then holds for any number of floors inside the walking limits:

| Route shape for `n` floors | Cost |
|---|---|
| Escalators only | `8n` |
| One standard ride, with or without escalators | `8n + 500` |
| Stairs only | `8n + 600` |
| One ride plus stairs | `8n + 1,100` |
| Two rides | `8n + 3,500` or more |

The express per-floor cost is 3 because an express car is about three times as fast as a standard car (GDD Ascensores, TM-12). Without it, a standard elevator and an express covering the same floors would tie, and people would ignore the express.

## 7. Route choice

### 7.1 Search

The route is the cheapest valid route by total cost. A valid route uses only links the person may use (section 4), stays within the trip budgets (5.2), walks only inside runs, and boards and leaves elevators only at enabled stops. A ride must change level.

Implementation note for the engine, not a rule: a shortest-path search over states `(run, stair floors used, escalator floors used, rides used, kind of the previous leg)` finds it. The state space is small (a run count in the low hundreds times 4 × 8 × 4 × 4), and the result can be cached per start run, destination run and counters until the run table, a transport or a stop changes, or a queue at the start level becomes or stops being full. Any cache must give the same answer as a fresh search.

### 7.2 Tie breaks

When two valid routes have the same cost, the engine picks, in this order:

1. the route with fewer transport legs (stair legs, escalator legs and rides);
2. the route with fewer columns walked in total, counting every walk from the start point to the destination point;
3. the route whose first leg is, in this order of preference, an escalator leg, a ride, a stair leg;
4. the route whose first leg uses the lower transport id (the first flight's id for stair and escalator legs, the shaft id for a ride);
5. the route whose first leg ends on the lower level, by dense level index.

Rule 5 makes the choice total. Two routes that agree on all five share their first leg, and only the first leg is kept.

### 7.3 Route cost for venue choice

When people.md section 5 compares venue candidates by "route cost", it uses the total cost of the cheapest route from the person's position to each candidate's door, computed as in 7.1 with the person's current trip counters at zero (a venue trip is a new trip). Ties between venues go to the lower unit id, as people.md says.

## 8. Walking a leg and re-planning

### 8.1 Movement times

| Movement | Steps |
|---|---|
| Walking | 1 column per step |
| One stair flight, up or down | 12 steps (2 game minutes) |
| One escalator flight, up or down | 6 steps (1 game minute) |
| Elevator wait and ride | TM-12 |

A person walks to the flight's middle column, spends the flight time on the flight (state "En la escalera"), arrives at the same column on the other level and continues. Walking from one end of a 375-column site to the other takes 375 steps, about 62 game minutes or 39 real seconds.

Design call on walking speed: 1 column is 8 art pixels (style guide), so a walking person moves about 77 pixels a real second at zoom 1, which reads as a walk next to a standard car that crosses 30 floors in about 4 real seconds. TM-13 decides which of these times count as stress; the GDD names the elevator wait, the ride and the floors climbed on foot, not horizontal walking.

### 8.2 Elevator legs

At the shaft, the person joins the queue for the ride's direction at the boarding level and stays in it until a car takes them (TM-12). A person in a queue does not re-plan while the queue and the stop exist, even if a better route appears.

### 8.3 Full queue on arrival

The queue was not full when the leg was planned, but it can fill while the person walks to the shaft. If the queue holds 40 people when the person arrives:

1. The person waits next to the shaft, outside the queue (state "Esperando el ascensor"), and the ride records one full-queue event for TM-13.
2. Every 6 steps (1 game minute) the person re-plans. The full-queue surcharge now applies to that ride, so a cheaper alternative wins if one exists.
3. If the same ride still wins and the queue has room, the person joins it. If the same ride wins and the queue is still full, the person keeps waiting and checks again 6 steps later. Several waiting people who re-plan in the same step join in increasing person id (people.md 1.2) until the queue is full again.

Design call: the original sent people back with a small stress cost and let them try again. Waiting in place and checking once a game minute gives the same outcome with fewer moving parts and keeps the overflow visible to the player as a crowd by the shaft.

### 8.4 When the current leg breaks

A person re-plans at once, from where they stand, when the leg they are on stops being possible:

- a stair or escalator flight they are walking to is demolished;
- the shaft they are walking to or queueing for is demolished, or the stop where they wait is disabled; people in that queue leave it;
- the run they are walking on is split, so that the target is no longer on their run;
- a unit is placed on cells where they are walking or queueing (construction section 1).

A person on a flight that is demolished arrives on the flight's other level at once (construction 8.5) and re-plans there. What riders do when their exit stop is disabled is TM-12; they re-plan when they leave the car.

The person's trip counters are kept when they re-plan. A flight or a ride only counts once it is finished.

## 9. No route

When the search finds no valid route, the trip has no route at that step. What happens next depends on the trip kind from people.md section 4:

- Required trip: the person stays where they are, shows "Sin ruta", and re-plans 720 steps (2 game hours) later. TM-13 adds the no-route penalty for every failed attempt.
- Optional trip, at its start: the trip is cancelled with no stress, as in people.md section 4.
- Optional trip, after the person has already left (the route broke on the way): the trip is cancelled. A visitor from outside leaves the simulation at once. Anyone else starts at once a required trip back to the place the optional trip started from.
- A trip from or to the subway entrance switches to the street entrance at once with no stress (people.md section 3), before any of the above.

The 03:00 night reset (people.md 4.1) also ends every trip that is still waiting for a retry.

Design call on broken optional trips: a resident whose shop becomes unreachable halfway should still go home, and "stay in the corridor until 03:00" would look like a bug.

## 10. Sky lobbies, express stops and transfers

Sky lobbies have no special routing rule. A transfer is any change from one elevator to another, on any level where the person can walk from one shaft to the next inside a run, with or without a stair or escalator leg between the two rides. In practice transfers happen on sky lobby levels, because express shafts only stop on levels -9 to -1, 1, 15, 30, 45, 60, 75 and 90 (construction 5.4) and standard shafts span at most 30 levels. A tall sky lobby lowers boarding stress (TM-13); it does not change the route cost.

Level 101 is reachable only by stairs from level 100 or by a standard or service shaft that stops on 101 (construction 6.6). Express shafts never reach it, so the cathedral route always needs a ride after the express.

## 11. Data for other specs

For every trip the engine records, per leg, what TM-13 needs to compute stress:

| Field | Meaning |
|---|---|
| `waitSteps` | steps in an elevator queue or waiting by a full queue |
| `rideSteps` | steps inside a car |
| `rideShaftType` | standard, service or express |
| `rideFloors` | floors between boarding and leaving |
| `stairFloors` | stair flights walked |
| `escalatorFloors` | escalator flights walked |
| `walkSteps` | steps walking horizontally |
| `queueFullEvents` | times the person found the queue full on arrival |
| `noRouteAttempts` | failed searches on a required trip |
| `boardingLevel` | the level of each ride's boarding, for the tall lobby bonus |

The person window (ui.md 6.3) shows the states "Caminando" (walking a leg), "Esperando el ascensor" (in a queue or by a full queue), "En el ascensor" (riding), "En la escalera" (on a stair or escalator flight) and "Sin ruta" (waiting for a retry).

## 12. Worked examples

All three towers list only what matters for the example. Every level mentioned has floor across the stated columns, every shaft has its listed stops enabled, and nobody is in a queue unless the example says so. Door columns follow section 3.

### 12.1 Tower A: small tower, stairs and one elevator

- Main lobby: level 1, columns 100 to 179, height 1. Floor on levels 2 to 6, columns 100 to 179.
- Fast food u1 on level 2, x = 104 (door 112). Office u2 on level 4, x = 100 (door 104). Office u3 on level 6, x = 150 (door 154).
- Escalator t1, x = 160, L = 1 (levels 1 and 2). Level 2 holds only the fast food, so it is an escalator floor.
- Stairs t4, x = 130, L = 1 (1 and 2); stairs t2, x = 120, L = 2 (2 and 3); stairs t3, x = 120, L = 3 (3 and 4).
- Standard elevator s1, x = 140, levels 1 to 6, stops 1 to 6. Middle column 142.

A1. An office worker appears at the street entrance on the left (level 1, column 100) and goes to u2 (level 4, column 104).

| Route | Cost | Legs | Columns walked |
|---|---|---|---|
| s1 from 1 to 4 | 3 × 8 + 500 = 524 | 1 | 42 + 38 = 80 |
| t1 from 1 to 2, s1 from 2 to 4 | 8 + (2 × 8 + 500) = 524 | 2 | 64 + 22 + 38 = 124 |
| t4, t2, t3 from 1 to 4 (3 stair floors) | 3 × 8 + 600 = 624 | 1 | |
| t1 from 1 to 2, t2 and t3 from 2 to 4 | 8 + (2 × 8 + 600) = 624 | 2 | |

The first two tie at 524. Tie break 1 picks s1 alone (1 leg). The worker walks 42 columns to column 142 and joins the up queue of s1.

A2. At lunch the worker goes from u2 (level 4, column 104) to the fast food u1 (level 2, column 112).

- s1 from 4 to 2: 2 × 8 + 500 = 516. Stairs t3 and t2 down: 2 × 8 + 600 = 616. The worker takes s1.
- Same trip with 40 people already in the down queue of s1 on level 4: s1 costs 516 + 1,000 = 1,516, so the worker takes the stairs (616), walking 20 columns to column 124.

A3. The player demolishes s1. A worker at the street entrance heads for u3 on level 6. The only links are stairs up to level 4 and an escalator up to level 2. Any route needs at least 5 floors on foot, more than 3 stair floors plus the one escalator floor, so there is no route. Going to work is a required trip: the worker shows "Sin ruta" and tries again every 720 steps. A worker who drew 08:14 tries at 10:14, 12:14, 14:14 and 16:14, then gives up at the drawn leave time (people.md P-14).

### 12.2 Tower B: sky lobby and one transfer

- Main lobby: level 1, columns 50 to 249. Floor on levels 2 to 44, columns 50 to 249. Sky lobby on level 15, columns 100 to 199, height 1.
- Express x1, x = 60, levels 1 to 30, stops 1, 15, 30. Middle column 63.
- Standard s1, x = 120, levels 1 to 15, stops 1 to 15. Middle 122.
- Standard s2, x = 200, levels 15 to 44, stops 15 to 44. Middle 202.
- Stairs t5, x = 220, L = 15 (15 and 16); stairs t6, x = 220, L = 16 (16 and 17). Middle 224.
- Office u10 on level 22, x = 210 (door 214).

B1. A worker appears at the street entrance on the right (level 1, column 249) and goes to u10.

| Route | Cost |
|---|---|
| x1 from 1 to 15, s2 from 15 to 22 | (14 × 3 + 500) + (7 × 8 + 500 + 2,500) = 542 + 3,056 = 3,598 |
| x1 from 1 to 30, s2 from 30 to 22 | (29 × 3 + 500) + (8 × 8 + 500 + 2,500) = 587 + 3,064 = 3,651 |
| s1 from 1 to 15, s2 from 15 to 22 | (14 × 8 + 500) + 3,056 = 612 + 3,056 = 3,668 |
| x1 from 1 to 15, t5 and t6 to 17, s2 from 17 to 22 | 542 + 616 + (5 × 8 + 3,000) = 4,198 |

There is no route without a transfer: s2 is the only link above level 17 and nothing reaches level 15 on foot. The worker takes x1 and walks 186 columns to column 63.

B2. Same trip at 08:30, with 40 people in the up queue of x1 on level 1. The x1 routes get +1,000: 4,598 and 4,651. The route through s1 costs 3,668 and wins. The worker walks 127 columns to column 122.

B3. Back to B1: the worker rode x1 and leaves the car on level 15 at column 63, with 1 ride used. The worker re-plans. s2 from 15 to 22 is the trip's 2nd ride: 7 × 8 + 500 + 2,500 = 3,056. Now say the up queue of s2 on level 15 is full: that ride costs 4,056. Stairs t5 and t6 from 15 to 17 then s2 from 17 to 22 costs (2 × 8 + 600) + (5 × 8 + 500 + 2,500) = 616 + 3,040 = 3,656, so the worker walks 161 columns to t5 and climbs. On level 17 the worker re-plans again with 2 stair floors used and takes s2.

### 12.3 Tower C: 5-star tower, subway, cathedral and a maid

- Main lobby: level 1, columns 40 to 339. Floor on levels -9 to -1 and 2 to 100, columns 40 to 339, except the cells of the subway station. Floor on level 101, columns 140 to 200.
- Subway station u50, x = 100, bottom on level -9 (rows -9 to -7, columns 100 to 129). Level -7 is one run from column 40 to 339.
- Express x1, x = 60, levels -9 to 90, stops -7, 1, 15, 30, 45, 60, 75, 90. Middle 63.
- Standard s3, x = 150, levels 45 to 74, stops 45 to 74. Standard s9, x = 150, levels 90 to 101, stops 90 to 101. Middle 152 for both.
- Stairs t20, x = 170, L = 45 (45 and 46); stairs t21, x = 170, L = 46 (46 and 47). Middle 174.
- Office u61 on level 47, x = 180 (door 184). Cathedral u60, x = 160, levels 101 to 104 (door 174).
- Housekeeping u70 on level 50, x = 200 (door 207). Service elevator v1, x = 260, levels 46 to 75, stops 46 to 75. Middle 262.

C1. A worker arrives by subway at level -7, column 110, and goes to u61. From -7 to 45 is 51 floors and from -7 to 60 is 66.

| Route | Cost |
|---|---|
| x1 from -7 to 45, t20 and t21 to 47 | (51 × 3 + 500) + (2 × 8 + 600) = 653 + 616 = 1,269 |
| x1 from -7 to 45, s3 from 45 to 47 | 653 + (2 × 8 + 500 + 2,500) = 653 + 3,016 = 3,669 |
| x1 from -7 to 60, s3 from 60 to 47 | (66 × 3 + 500) + (13 × 8 + 3,000) = 698 + 3,104 = 3,802 |

The stair route wins, as the GDD order says: stairs before a transfer. The worker walks 47 columns to x1, then 111 columns on level 45 to t20, then 10 columns on level 47 to the door.

C2. A wedding guest appears at the street entrance on the left (level 1, column 40) and goes to the cathedral (level 101, column 174). The only route is x1 from 1 to 90, then s9 from 90 to 101: (89 × 3 + 500) + (11 × 8 + 500 + 2,500) = 767 + 3,088 = 3,855. If the player disables stop 101 on s9, there is no route. The trip is required, so each guest waits 720 steps between attempts: a guest who appeared at 10:00 next tries at 12:00, and the 12:30 deadline (people.md section 15) depends on the stop being back by then.

C3. A maid leaves u70 (level 50, column 207).

- To a room on level 58: v1 from 50 to 58 costs 8 × 8 + 500 = 564. The maid cannot use x1 or s3.
- To a room on level 45: v1 from 50 to 46 costs 4 × 8 + 500 = 532, then t20 down from 46 to 45 costs 8 + 600 = 608, total 1,140. The maid walks from column 262 to 174 on level 46 between the two legs.
- To a room on level 40: v1 goes no lower than 46, and from 46 the maid would need 6 stair floors, over the 3-floor limit. Even with stairs on every level in between there is no route, so the room is not reachable for this maid (TM-16 skips it).

## 13. Constants for `packages/shared`

| Constant | Value |
|---|---|
| `ROUTE_FLOOR_COST` | 8 (stairs, escalators, standard and service elevators) |
| `ROUTE_EXPRESS_FLOOR_COST` | 3 |
| `ROUTE_ESCALATOR_LEG_COST` | 0 |
| `ROUTE_RIDE_COST` | 500 |
| `ROUTE_STAIR_LEG_COST` | 600 |
| `ROUTE_TRANSFER_COST` | 2,500 |
| `ROUTE_QUEUE_FULL_COST` | 1,000 |
| `MAX_STAIR_FLOORS_PER_TRIP` | 3 |
| `MAX_ESCALATOR_FLOORS_PER_TRIP` | 7 |
| `MAX_RIDES_PER_TRIP` | 3 |
| `ELEVATOR_QUEUE_CAPACITY` | 40 (shared with TM-12) |
| `FULL_QUEUE_RECHECK_STEPS` | 6 |
| `WALK_COLUMNS_PER_STEP` | 1 |
| `STAIR_FLIGHT_STEPS` | 12 |
| `ESCALATOR_FLIGHT_STEPS` | 6 |
| `ROUTE_RETRY_STEPS` | 720 (people.md) |

## 14. GDD Recorridos coverage

| GDD item | Section | Status |
|---|---|---|
| Plan one leg at a time and take the cheapest option | 5.1, 7 | Kept: the first leg of the cheapest full route |
| Order: escalator, elevator without transfer, stairs, elevator with transfer | 6 | Kept, with costs that keep the order for every floor count |
| At most 3 floors by stairs and 7 by escalator | 5.2 | Kept, counted per trip |
| No route: wait 2 hours and try again | 9 | Kept for required trips (people.md 4) |
| Service elevator only for housekeeping | 4 | Kept: maids only |
| Express stops only at basements, floor 1 and sky lobbies | 4, 10 | Kept from construction 5.4 |
| Queue of 40 per direction per floor | 6, 8.3 | Full-queue surcharge and waiting by the shaft |

## 15. Rules

All rules are outcomes with no rejection code.

### Walking

R-01. A cell is walkable when it has structure and is not ruins. Upper rows of multi-level units are not walkable, except row -7 of the subway station; rows -8 and -9 of the station are not walkable.

R-02. A run is a maximal gap-free sequence of walkable cells on one level. A person only walks inside one run; changing run needs a transport.

R-03. Doors are at `x + floor(w / 2)` on the unit's bottom row (the top row for the subway station). Flights are entered and left at `x + 4`, elevators at `x + 2` (standard, service) or `x + 3` (express). Parking spaces at `x + 2`.

R-04. A person walks 1 column per step, spends 12 steps on a stair flight and 6 on an escalator flight, in either direction.

R-05. A person whose cell stops being walkable is moved to the nearest walkable cell on the same level (lower column on a tie) and re-plans. With none left on the level, the trip is a failed attempt and the person goes to their night place.

### Links

R-06. Stairs link L and L+1 for everyone. Escalators link L and L+1 for everyone except maids. Both work in both directions.

R-07. Standard and express elevators link any two enabled stops for everyone except maids. Service elevators link any two enabled stops for maids only. Guards never use service elevators.

R-08. Routing ignores elevator mode, wait time and response distance. A shaft with at least two enabled stops is a link.

### Costs

R-09. Escalator leg: 8 per floor. Standard or service ride: 8 per floor + 500. Express ride: 3 per floor + 500. Stair leg: 8 per floor + 600. Final walk: 0. Floors are counted with the dense level index.

R-10. Consecutive flights of the same kind with only walking on one run between them are one leg and pay the leg constant once.

R-11. The 2nd and 3rd rides of a trip add 2,500 each, counting rides already taken in the trip.

R-12. The first leg of a route adds 1,000 when it is a ride whose queue at the current level, in its direction, holds 40 people at the planning step. Queues on later levels are not checked.

### Budgets

R-13. A trip walks at most 3 floors on stairs and 7 floors on escalators, counted separately over the whole trip, and takes at most 3 elevator rides. Routes that would exceed any of these are invalid.

R-14. Counters only grow when a flight or a ride is finished, and are kept across re-plans of the same trip.

### Choice

R-15. At a trip's start and at the end of every leg, the person computes the cheapest valid route to the destination and starts its first leg only.

R-16. Ties are broken by fewer transport legs, then fewer columns walked in total, then first-leg kind (escalator, ride, stairs), then lower transport id of the first leg, then lower level where the first leg ends.

R-17. The route cost used to compare venues (people.md P-09) is the total cost of the cheapest route from the person's position to the venue door with all trip counters at zero.

### Queues

R-18. A person in an elevator queue stays in it until boarding, unless the shaft is demolished or the stop is disabled.

R-19. A person who arrives at a queue with 40 people waits next to it, records one full-queue event, and re-plans every 6 steps with the full-queue surcharge. They join when that ride still wins and the queue has room; several join in increasing person id.

### Re-planning

R-20. A person re-plans at once when the flight or shaft of the current leg is demolished, the stop they go to or wait at is disabled, their run is split away from the leg's target, or a unit is placed on the cells they walk or queue on.

R-21. A person on a demolished flight arrives at its other level at once and re-plans there.

### No route

R-22. A trip from or to the subway entrance with no route switches to the street entrance at once, with no stress, before R-23 to R-25 apply.

R-23. A required trip with no route leaves the person where they are, in state "Sin ruta", and re-plans after 720 steps. Each failed search counts as one no-route attempt.

R-24. An optional trip with no route at its start is cancelled with no stress.

R-25. An optional trip whose route breaks after the person left is cancelled. A visitor from outside leaves the simulation; anyone else starts a required trip back to where the optional trip started.

### Records

R-26. For each leg the engine records wait steps, ride steps, shaft type, ride floors, stair floors, escalator floors, walk steps, full-queue events, no-route attempts and boarding level for TM-13.

R-27. With the same seed, the same commands and the same tower, every person chooses the same route at the same step.
