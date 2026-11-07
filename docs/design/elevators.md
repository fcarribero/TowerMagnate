# Elevator dispatch and settings

Version 1.0, 17 November 2026. Owner: Game Designer. Task TM-12.

This document defines how elevator cars move and decide where to go: car speed, door and stop times, capacity, queues and boarding order, the sweep and reverse rule, how calls are given to cars, response distance, return to the home floor, the 6 time bands for weekdays and weekends, the three modes, and what changes when the player edits stops, homes, cars or the shaft range. Values come from `docs/GDD.md` (section Ascensores) and the car behaviour in the SimTower research notes (section 5), adapted to a 10-second step. Where the GDD leaves a point open, the decision is marked "Design call" with a short reason. Section 13 has worked examples. The numbered rules at the end are the contract for the engine (`packages/engine`), the balance constants (`packages/shared`) and QA.

Related specs: construction (TM-8, `docs/design/construction.md`) for shaft placement, cars per shaft, express stops, spacing and what can be demolished; people (TM-10, `docs/design/people.md`) for who travels and when; routing (TM-11, `docs/design/routing.md`) for which ride a person picks, the full-queue rule and re-planning; the tech doc (TM-5, `docs/tech/engine-and-protocol.md`) for the `Shaft`, `Car` and `ElevatorSchedule` types and the commands; the UI spec (TM-18, `docs/design/ui.md` 6.5) for the elevator window. Stress from waiting and riding is TM-13. Routing decides which ride a person takes. This document decides when a car comes and how long the ride lasts.

## 1. Time and distance units

The engine runs one step per 10 game seconds. One game day is 8,640 steps and lasts 15 real minutes, so one step is 0.104 real seconds and one real second is 9.6 steps.

Car positions and distances use the dense level index from the tech doc (3.1): index 0 is level -10, level -1 is 9, level 1 is 10 and level 104 is 113. "Floors" between two levels means the difference of their dense indexes, as in routing section 1. From level 1 to level 30 is 29 floors; from S1 to 1 is 1 floor.

At the start and end of every step a car's position is a whole dense index. The client interpolates between deltas (tech doc 8.6).

## 2. Cars, speed and stop times

### 2.1 Car states

Each car is in one of five states:

| State | Doors | What happens in the step |
|---|---|---|
| Idle | closed | nothing; the car stands still with no target |
| Moving | closed | the car moves toward its next stop |
| Opening | open | riders get off, the car picks its direction, people board (section 4) |
| Dwelling | open | people who joined the queue board, if there is room |
| Closing | closed | nothing; at the end of the step the car can leave |

`CarView.doors` is `open` in Opening and Dwelling and `closed` otherwise. `CarView.direction` is `idle` while the car is free (section 6.1) and not moving, and the car's direction otherwise.

### 2.2 Speed

| Shaft type | Floors per moving step | Steps per floor |
|---|---|---|
| Standard | 1 | 1 |
| Service | 1 | 1 |
| Express | 3 | 1/3 |

In each Moving step the car moves `min(speed, floors left to its next stop)` floors. An express car therefore moves 3 floors a step and covers the last 1 or 2 floors to a stop in one shorter step. A car whose next stop is reached in a step ends that step at the stop and opens its doors in the next step.

A car with no closer stop simply passes levels. An express car passes levels that are not express stops without any check.

### 2.3 Stop times

A stop is one Opening step, then the band's dwell steps, then one Closing step. Dwell is set per band in game seconds, in multiples of 10, from 0 to 60, default 30 (section 7). In steps it is `dwellSeconds / 10`. With the default dwell a stop takes 1 + 3 + 1 = 5 steps.

A car that departs from a stop spends its first Moving step in the step after Closing. An Idle car that gets a target in the dispatch pass of step t (section 6) starts moving in step t + 1, with no Closing step. If its target is the level it stands on, it opens its doors in step t + 1.

### 2.4 Ride time

A rider who boards at an Opening step and rides `n` floors without an intermediate stop gets off at the Opening step that comes `d + 1 + ceil(n / speed) + 1` steps later, where `d` is the dwell in steps at the boarding stop. With the default dwell:

| Ride | Standard or service | Express |
|---|---|---|
| 1 floor | 6 steps | 6 steps |
| 14 floors (1 to 15) | 19 steps | 10 steps |
| 29 floors (1 to 30) | 34 steps (3.5 s real) | 15 steps (1.6 s real) |
| 89 floors (1 to 90) | not possible | 35 steps (3.6 s real) |

Each intermediate stop adds `1 + d + 1` steps (5 with the default dwell).

Design call on speed: the GDD visual goal is a standard car crossing 30 floors in about 4 real seconds and an express about 3 times faster. One floor a step gives 30 floors of motion in 30 steps, 3.1 real seconds, and 3.5 to 3.6 seconds from boarding to getting off once doors and the default dwell are counted. Two steps a floor would give 6.3 seconds, too slow for the goal. The express at exactly 3 floors a step is close to the routing costs of 8 per standard floor and 3 per express floor, a ratio of 2.7 (routing section 6). Whole floors per step keep car positions on whole levels at every step, so stops never need rounding.

### 2.5 Capacity

| Shaft type | Riders per car |
|---|---|
| Standard | 21 |
| Service | 21 |
| Express | 42 |

Every person counts as 1 rider. A car never holds more than its capacity.

## 3. Queues

Every enabled stop of a shaft has two queues: up and down. Each holds at most 40 people (`ELEVATOR_QUEUE_CAPACITY`, shared with routing). The lowest enabled stop only gets an up queue in practice and the highest only a down queue, because routing never plans a ride that leaves a shaft's range.

A queue is first in, first out. People join at the back in the order the people phase processes them, which is increasing person id within a step (people.md 1.2). A person who is removed (people.md 4.2), or who re-plans because the stop or shaft went away (routing 8.4), leaves the queue and everyone behind moves up one place.

The client draws the up queue on the left of the shaft and the down queue on the right (construction 5.5), first person next to the shaft. How many sprites are drawn is the client's choice.

A hall call is a non-empty queue: the pair (level, direction). Its age is the number of steps since the person now at the front of the queue joined it.

## 4. Stops, direction and boarding

### 4.1 What happens at an Opening step

When a car opens at level L with direction `d`:

1. Riders whose destination is L get off, in the order they boarded. Each one finishes the ride and re-plans (routing 5.1).
2. The car picks its direction for the stop (4.2).
3. People board from the queue at L in that direction, from the front, until the queue is empty or the car is full.
4. If that queue is now empty, the hall call is gone. If people are left in it, the hall call stays, without a car assigned (section 6).

A rider's destination is the level where the ride planned by routing ends. It is always an enabled stop of the shaft when the rider boards.

### 4.2 Direction at a stop

Work ahead of a car means a rider destination or an assigned hall call (section 6) on a level past L in direction `d`. Work behind means the same on the other side.

- The car keeps `d` if there is work ahead or the queue at L in direction `d` is not empty.
- Otherwise it reverses if the queue at L in the other direction is not empty or there is work behind.
- Otherwise it keeps `d` and boards nobody. It will be free when it leaves (section 6.1).

A car that reached the end of its range always has nothing ahead, so it reverses there or becomes free.

### 4.3 Boarding during dwell

At the end of each Dwelling step, people who joined the queue at L in the car's direction board from the front while the car has room. Nobody boards during Closing. A person who reaches the shaft during Closing waits for the next car.

### 4.4 Sweep

A car with direction `d` serves everything ahead of it in `d` before it turns. Its next stop is the nearest level ahead of it in `d` that is:

- a rider's destination, or
- a hall call in direction `d` assigned to the car, or
- the farthest piece of work ahead, when that is a hall call in the other direction assigned to the car. The car stops there, reverses (4.2) and boards that queue.

The next stop is recomputed at the start of every Moving step, so a stop added ahead of the car is taken if the car has not passed it yet. With nothing left ahead, a car with work behind reverses at the start of its next step, where it stands, with no stop. A car with nothing ahead and nothing behind is free (6.1).

Design call on reversing in motion: with whole-level positions, a car is always exactly on a level when it reverses, so no rounding is needed. In practice only free cars and cars that lost a stop (section 9) reverse between stops.

## 5. Settings per shaft

| Setting | Values | Default | Changed by |
|---|---|---|---|
| Range | bottom and top level (construction 5.3, 5.4) | as built | `resizeShaft` |
| Stops | any levels of the range; express shafts only the express stop levels; at least 1 | every allowed level of the range | `configureShaft` |
| Cars | 1 to 8 | 1 | `addCar`, `removeCar` |
| Home of each car | one of the stops | see below | `configureShaft`, `addCar` |
| Schedule | 6 weekday bands and 6 weekend bands (section 7) | table in 7.2 | `configureShaft` |

The lobby stop of a shaft is its lowest enabled stop at level 1 or higher. A shaft with no stop at level 1 or higher (a basement-only shaft) uses its highest enabled stop instead.

The first car of a new shaft has the lobby stop as its home and starts there, Idle. A car added with `addCar` starts at its home, Idle. The home must be an enabled stop.

`configureShaft` replaces stops, homes and schedule together, at the start of the next step, as every command (tech doc). It is free and works at any balance (construction C-56). It fails with `INVALID_SCHEDULE` when a stop is outside the range, there are no stops, `carHomes` does not have one entry per car, a home is not in the new stops, a day type does not have exactly 6 bands, a dwell is not one of 0, 10, 20, 30, 40, 50 or 60, or a response distance is not a whole number from 1 to 99. A stop on an express shaft outside the express levels fails with `EXPRESS_STOP_NOT_ALLOWED` (construction C-38). An `addCar` whose home is not an enabled stop fails with `INVALID_SCHEDULE`, checked after the construction checks. An unknown shaft fails with `UNKNOWN_ENTITY`. When one command breaks several of these rules, the checks run in this order and the first failure is the result: `UNKNOWN_ENTITY`, then `EXPRESS_STOP_NOT_ALLOWED`, then `INVALID_SCHEDULE`. A stop outside the range on an express shaft that is also not an express level therefore fails with `EXPRESS_STOP_NOT_ALLOWED`.

## 6. Dispatch

### 6.1 Free cars

A car is free when it has no riders and no assigned hall calls. A free car whose doors are closed heads for its home (section 8). Free cars can be assigned calls, including while they travel home.

### 6.2 The dispatch pass

At the end of each step's elevator phase (section 10), every shaft runs a dispatch pass. It takes the hall calls with no car assigned and handles them one at a time in this order: oldest first (largest age), then lower dense level, then up before down.

For each call (level L, direction `c`), the eligible cars are:

- Coming cars: a car whose direction is `c`, that is Moving, Opening, Dwelling or Closing, whose position is before L in direction `c` (strictly: a car at L does not count), that is not full, and that is allowed by the band mode (section 7.3).
- Free cars within reach: a free car whose distance in floors to L is at most the band's response distance. Distance is `|position - L|` in dense indexes.
- Any free car, at any distance, when the call's age is at least `CALL_PATIENCE_STEPS` (30 steps, 5 game minutes), or when every car of the shaft is free at that point of the pass.

The call goes to the eligible car with the smallest distance. On a tie, a coming car wins over a free car, then the lower car index. If no car is eligible, the call stays unassigned and the next pass tries again.

Assigning a call to a free car sets the car's direction toward L. If the car is at L, its direction becomes `c`. The car is no longer free, so later calls in the same pass see it as a coming car or not at all.

Design call on the all-free rule: response distance exists so that idle cars stay near home while a busy car can pick the call up on its way. When every car is free, no busy car will come, and making the call wait would only add stress. A shaft with one car therefore always answers.

Design call on patience: without it a call could wait forever, for example an up call below a car that keeps sweeping the top of the shaft while the other cars sit at home out of reach. Five game minutes is the point where the wait starts to cost noticeable stress.

### 6.3 Keeping and losing calls

An assigned call stays with its car until the car opens at L and boards from it (4.1, step 4), with these exceptions, after which the call is unassigned again and goes back into the next pass:

- The queue becomes empty because everyone in it left (3): the call is gone.
- The car leaves a stop full: it drops every hall call assigned to it in its direction. It still stops at its riders' destinations.
- The car is removed or the stop is disabled (section 9).

A call is never moved from one car to another while the first car still has it.

### 6.4 Already at the level

A person who joins a queue at L while a car at L is Opening or Dwelling, with the same direction and room, boards at the end of that step (4.3) and creates no call that the pass has to handle. A call at L whose queue is still not empty after boarding stays unassigned. In the same pass, the car at L is not a coming car for it, because a car at L does not count.

## 7. Time bands and modes

### 7.1 Bands

Each day has 6 bands with fixed boundaries. Weekdays (Monday to Friday) and the weekend (Saturday and Sunday) have the same boundaries and separate settings. The band in force is the one that contains the step's clock time.

| Band | From | To | Step of day |
|---|---|---|---|
| 1 | 00:00 | 07:00 | 0 to 2,519 |
| 2 | 07:00 | 10:00 | 2,520 to 3,599 |
| 3 | 10:00 | 12:00 | 3,600 to 4,319 |
| 4 | 12:00 | 14:00 | 4,320 to 5,039 |
| 5 | 14:00 | 17:00 | 5,040 to 6,119 |
| 6 | 17:00 | 24:00 | 6,120 to 8,639 |

Design call on boundaries: band 2 holds the morning arrivals of workers (07:30 to 09:30) and departures of residents (06:30 to 09:00 mostly fall in it), band 4 holds lunch (12:00 to 13:30 plus the 30-minute visit), and band 6 holds the evening departures of workers (17:00 to 19:00) and returns of residents (17:00 to 21:00), all from people.md sections 6 and 7. Bands 1, 3 and 5 are the quiet hours between them. Fixed boundaries keep the elevator window a simple table (ui.md 6.5).

### 7.2 Default settings

Every band of both day types starts as:

| Mode | Dwell | Response distance |
|---|---|---|
| Normal | 30 s | 5 floors |

Design call on defaults: the express modes help only when most traffic starts at the lobby stop (mornings) or heads to it (evenings), and they slow down people travelling between upper floors. A new player should see plain behaviour first and choose the trade-off. Section 12 has the suggested settings for an office shaft.

### 7.3 Modes

| Mode | GDD name | Effect |
|---|---|---|
| `normal` | normal | dispatch as in section 6 |
| `expressUp` | expreso hacia arriba | a car with riders moving up is not a coming car for up calls above the lobby stop; free cars head for the lobby stop instead of their home |
| `expressDown` | expreso hacia abajo | a car with riders moving down is not a coming car for down calls above the lobby stop |

In both express modes, calls skipped by loaded cars are still answered by free cars within reach, and by any free car once the call reaches the patience age or every car is free (6.2). A loaded car that opens at a level for its own riders still boards the queue in its direction there (4.1). The modes only stop loaded cars from making extra stops.

Design call on the express modes: in the morning a car loaded at the lobby goes straight to its riders' floors and comes back sooner, and in the evening a car that already took one floor's people goes straight down instead of stopping on every floor and passing the lower ones full. The cost is a longer wait for people travelling between upper floors in that band, which is the trade-off the player sets. In `expressDown` cars keep their homes, because evening calls are spread over all floors.

### 7.4 Band changes

A new band applies from its first step. Cars keep their riders, direction and assigned calls. Free cars switch to the new home target (7.3). The new dwell applies to stops whose Opening step is in the new band. A stop that started in the old band keeps the old dwell.

## 8. Return to home

A free car with closed doors moves toward its home at its normal speed: the car's home, or the lobby stop in an `expressUp` band. It does not stop or open its doors on the way unless it gets a call. When it reaches the home level it becomes Idle there. A free car that opened its doors for riders getting off finishes the stop (dwell and Closing) before it heads home.

## 9. Changes while cars run

### 9.1 Stops disabled or enabled

When `configureShaft` disables a stop:

- People in its queues leave them and re-plan (routing 8.4). Calls at that level are gone.
- A rider whose destination is that level gets a new destination: the nearest enabled stop by floors, and on a tie the one ahead in the car's direction. The rider gets off there and re-plans. The ride counts as finished (routing R-14).
- A car moving to that level as its next stop picks the next stop again (4.4).

An enabled stop is usable from the next step. A car home that is not among the new stops makes the command fail (section 5), so a home is never on a disabled level.

### 9.2 Cars added or removed

A new car is Idle and free at its home. A car can be removed only without riders (construction C-44). The calls assigned to a removed car are unassigned and go into the next pass. The remaining cars keep their indexes in order, with no gaps: removing car 1 of cars 0, 1 and 2 leaves cars 0 and 1, the old car 2 being the new car 1.

### 9.3 Range changed

`resizeShaft` follows construction 5.3 and C-43. Then:

- New levels are added to the stops as enabled, for express shafts only the express stop levels.
- Levels that leave the range are removed from the stops and their queues empty as in 9.1.
- A home on a removed level moves to the nearest remaining stop, the lower one on a tie.
- A car with no riders standing on a removed level moves at once to the nearest end of the new range and becomes free. A car with riders on a removed level blocks the trim (C-44).

### 9.4 Shaft demolished

A shaft can be demolished only with no riders (C-44). Its queues empty and the people in them re-plan (construction C-69).

## 10. Order within a step

A step runs commands first (tech doc), then the people phase (walking, joining queues, re-planning, in increasing person id), then the elevator phase. In the elevator phase, shafts are handled in increasing shaft id. For each shaft:

1. Each car, in increasing car index, does its step for its state (sections 2, 4 and 8). Riders getting off at an Opening step re-plan in this step, after all cars of all shafts are done, in increasing person id.
2. The dispatch pass runs (6.2).

A person who joins a queue at step t can board at step t if a car there is Opening or Dwelling, and a call made at step t can be assigned at step t. The elevator phase uses no random draws.

## 11. Data for other specs

For every ride the engine records, for TM-13 and the person window:

| Field | Meaning |
|---|---|
| `waitSteps` | steps from joining the queue to the step of boarding |
| `rideSteps` | steps from the step of boarding to the step of getting off |
| `rideShaftType` | standard, service or express |
| `rideFloors` | floors between the boarding level and the level where the rider got off |
| `boardingLevel` | the boarding level, for the tall lobby bonus |

These fill the routing records (routing section 11). A person waiting by a full queue adds those steps to `waitSteps` as routing 8.3 says.

The person window shows "Esperando el ascensor" from joining the queue to boarding and "En el ascensor" from boarding to getting off. The elevator window shows each car's load as `{n} pasajeros` (ui.md 6.5).

## 12. Throughput and suggested settings

These numbers are a check for the balance pass, not rules.

A standard car that loads 21 people at level 1 and drops them on 7 floors between 2 and 15, then comes back empty, makes 8 stops of 5 steps and moves 28 floors: about 68 steps, 11 game minutes. That is about 110 people up per game hour per car, and about 880 for a full shaft of 8 cars. Office workers arrive 60% within 08:00 to 09:00 (people.md 6.1), so one full standard shaft carries the morning peak of roughly 1,450 workers, about 240 offices. With `expressUp` in band 2 the car does not stop for up calls on the way, which is close to the case above. In `normal` mode every extra stop costs every rider in the car 5 steps.

Suggested settings for a shaft that serves offices from the lobby: weekday band 2 `expressUp`, weekday band 6 `expressDown`, the rest `normal`, dwell 30 s everywhere except band 1 at 10 s. Notices about congested shafts are TM-17. The balance simulation checks the throughput above and GD retunes the constants in section 14 from its results.

## 13. Worked examples

In every example the band is the default (`normal`, dwell 30 s = 3 steps, response distance 5) unless stated. "Step t" is a game step number. Levels are given as level numbers; distances are in floors.

### 13.1 A nonstop ride

Standard shaft s1, levels 1 to 30, all stops enabled, car 0 Idle at level 1 (home 1). Worker w1 joins the up queue at level 1 at step 1000, going to level 30.

- Step 1000, dispatch: car 0 is free at distance 0, and the only car, so it is assigned. Its direction becomes up.
- Step 1001: Opening at level 1. w1 boards. `waitSteps` = 1.
- Steps 1002 to 1004: Dwelling. Step 1005: Closing.
- Steps 1006 to 1034: Moving, 1 floor a step, 29 floors. The car ends step 1034 at level 30.
- Step 1035: Opening at level 30. w1 gets off. `rideSteps` = 34, 340 game seconds, 3.5 real seconds.

The same trip on an express shaft x1, levels 1 to 30, stops 1, 15 and 30: the car moves in steps 1006 to 1015 (nine moves of 3 floors and one of 2, passing level 15 because nobody calls there) and opens at level 30 in step 1016. `rideSteps` = 15. The motion alone takes 10 steps against 29, the 3 times the GDD asks for.

### 13.2 Two cars and response distance

Standard shaft s1, levels 1 to 20, all stops enabled. Car 0 has home 1 and car 1 has home 12; both are Idle at home. At step 5000, person p1 joins the up queue at level 8 (going to 15) and person p2 joins the down queue at level 18 (going to 1).

Step 5000, dispatch. Both calls have age 0, so the lower level goes first.

- Call (8, up): no coming cars. Every car is free, so both are eligible. Car 1 is at distance 4 and car 0 at 7. Car 1 gets it and its direction becomes down.
- Call (18, down): car 1 is no longer free and moves away from 18. Car 0 is free at distance 17, more than 5, and not every car is free any more. Age 0 is below 30. The call stays unassigned.

Car 1 moves 12 to 8 in steps 5001 to 5004 and opens at step 5005. Nothing is ahead below 8 and the down queue at 8 is empty; the up queue is not, so the car reverses to up and p1 boards (`waitSteps` = 5). It dwells in 5006 to 5008, closes in 5009, moves 8 to 15 in 5010 to 5016 and opens at 15 in step 5017: p1 gets off (`rideSteps` = 12).

Step 5017, dispatch. Car 1 has no riders and no calls, so it is free, at distance 3 from level 18. Every car is free, and car 1 is nearest. Car 1 gets (18, down), with the call at age 17.

Car 1 dwells in 5018 to 5020, closes in 5021, moves to 18 in 5022 to 5024 and opens at step 5025. Nothing is ahead above 18, the up queue is empty and the down queue is not, so it reverses to down and p2 boards (`waitSteps` = 25). It dwells in 5026 to 5028, closes in 5029, moves 17 floors in 5030 to 5046 and opens at level 1 in step 5047 (`rideSteps` = 22).

With response distance 20 in that band instead, car 0 gets (18, down) at step 5000, moves 17 floors in 5001 to 5017 and opens at 18 in step 5018: p2 waits 18 steps instead of 25, and the lobby is left without a car for that time.

### 13.3 Capacity and boarding order

Standard shaft s2, levels 1 to 20, car 0 and car 1, both with home 1. Car 1 is free and on its way home, at level 3. The up queue at level 1 holds 25 people, q1 to q25 in the order they joined.

- Car 0 opens at level 1, empty, direction up. q1 to q21 board in that order; the car is full (21). q22 to q25 stay, with q22 at the front. The call (1, up) stays, unassigned.
- Same step, dispatch: car 0 is at level 1, so it is not a coming car, and it is full. Car 1 is free at distance 2 and gets the call. It reaches level 1 two steps later, opens in the step after, and boards q22 to q25 and anyone who joined behind them.
- q26 joins at level 1 while car 0 is Dwelling. Car 0 is full, so q26 waits for car 1.

Later, car 0 opens at level 6 going up and 4 riders get off (load 17). Nobody waits at 6, so it leaves with room, and in a later pass it is a coming car for the new call (14, up) and gets it. At level 10, 4 more riders get off (load 13). Riders still have destinations above 10, so the car keeps going up. The up queue at 10 holds r1 to r10: r1 to r8 board (load 21) and r9 and r10 stay. The car leaves full, so it drops the call (14, up), which goes back into the next pass unassigned. The car stops at 14 only if a rider is going there.

### 13.4 Express up in the morning

Same shaft s2, weekday 08:00, band 2 set to `expressUp` with response distance 5. Car 0 is moving up and is at level 4 at the end of step t, with 12 riders going to 6, 9, 15 and 20, so it has room. Car 1 is Idle at level 1. At step t, person p3 joins the up queue at level 7.

- Step t, dispatch: car 0 moves up toward 7 but carries riders, and 7 is above the lobby stop (level 1), so it is not a coming car. Car 1 is free at distance 6, more than 5, and car 0 is not free. The call stays unassigned.
- Car 0 reaches 6 in step t + 2, opens at t + 3, dwells t + 4 to t + 6, closes at t + 7 and passes level 7 in step t + 8 without stopping.
- Step t + 30: the call reaches age 30. Car 1 is now eligible at any distance and gets it. It moves 1 to 7 in t + 31 to t + 36 and opens at t + 37. p3 waits 37 steps, about 6 game minutes.

In `normal` mode, car 0 is a coming car at distance 3 at step t and gets the call. It still stops at 6 first, then moves to 7 in step t + 8 and opens there at step t + 9. p3 waits 9 steps, and the riders going to 9, 15 and 20 arrive 5 steps later.

### 13.5 A disabled stop under a rider

Car 0 of a standard shaft is moving up at level 8 with rider p4 going to 12. Stops 11, 12 and 13 are enabled. The player disables stop 12. At the start of the next step, p4's destination becomes the nearest enabled stop: 11 and 13 are both 1 floor away, so the tie goes to 13, ahead in the car's direction. The car opens at 13, p4 gets off, the ride counts as finished, and p4 re-plans from 13 (for example, one stair floor down, routing 6).

### 13.6 Bands across the week

A shaft has weekday band 2 set to `expressUp` and the weekend left at default. On Saturday at 08:30 the weekend band 2 is in force, so the shaft runs `normal`. On Monday at 17:00 exactly, step of day 6,120, band 6 starts. A car that opened at 16:59:50 (step 6,119) keeps band 5's dwell for that stop.

### 13.7 Trimming a shaft

A standard shaft spans 1 to 30 with car 2's home at 28. The player trims it to 1 to 25 with no riders above 25. Stops 26 to 30 are removed, people in their queues re-plan, car 2's home moves to 25 (the nearest remaining stop), and car 1, empty and standing at 27, moves at once to 25 and is free.

## 14. Constants for `packages/shared`

| Constant | Value |
|---|---|
| `CAR_FLOORS_PER_STEP` | standard 1, service 1, express 3 |
| `CAR_CAPACITY` | standard 21, service 21, express 42 (catalog) |
| `ELEVATOR_QUEUE_CAPACITY` | 40 (shared with routing) |
| `DOOR_OPEN_STEPS` | 1 |
| `DOOR_CLOSE_STEPS` | 1 |
| `DWELL_SECONDS_OPTIONS` | 0, 10, 20, 30, 40, 50, 60 |
| `DEFAULT_DWELL_SECONDS` | 30 |
| `RESPONSE_DISTANCE_MIN` | 1 |
| `RESPONSE_DISTANCE_MAX` | 99 |
| `DEFAULT_RESPONSE_DISTANCE` | 5 |
| `CALL_PATIENCE_STEPS` | 30 |
| `ELEVATOR_BAND_STARTS` | 00:00, 07:00, 10:00, 12:00, 14:00, 17:00 |
| `DEFAULT_ELEVATOR_MODE` | `normal` |

## 15. GDD Ascensores coverage

| GDD item | Section | Status |
|---|---|---|
| One queue per direction per floor, 40 at most | 3 | Kept |
| Cars sweep one way until the work is done, then reverse | 4.2, 4.4 | Kept |
| Cars with no calls go back to their home floor | 6.1, 8 | Kept; `expressUp` sends them to the lobby stop |
| Per shaft: stops, number of cars, home of each car, extend or trim | 5, 9 | Kept |
| 6 bands per day, weekdays and weekend separately | 7.1 | Kept, with fixed boundaries |
| Modes normal, express up, express down | 7.3 | Kept, defined as stop-skipping for loaded cars |
| Wait time at each stop | 2.3, 7 | Kept as dwell, 0 to 60 game seconds |
| Response distance, default 5 | 6.2 | Kept, with the all-free and patience fallbacks |
| Standard 30 floors in about 4 real s, express about 3 times faster | 2.2, 2.4 | 1 floor a step, 3.5 s boarding to exit for 29 floors; express 3 floors a step |
| Capacity 21 standard and service, 42 express (catalog) | 2.5 | Kept |

## 16. Rules

All rules are outcomes with no rejection code, except EL-24 to EL-26.

### Speed and stops

EL-01. A standard or service car moves 1 floor per Moving step and an express car 3 floors per Moving step, never past its next stop. Floors are counted with the dense level index. Car positions are whole dense indexes at every step.

EL-02. A stop is 1 Opening step, then `dwellSeconds / 10` Dwelling steps, then 1 Closing step. The first Moving step after a stop is the step after Closing. An Idle car assigned at step t moves or opens at step t + 1.

EL-03. A nonstop ride of `n` floors from an Opening step with dwell `d` steps ends at the Opening step `d + 2 + ceil(n / speed)` steps later. With the default dwell, 29 floors take 34 steps on a standard car and 15 steps on an express car.

EL-04. A standard or service car holds 21 riders and an express car 42.

### Queues and boarding

EL-05. Each enabled stop has an up queue and a down queue of at most 40 people, first in, first out. People join in increasing person id within a step.

EL-06. At an Opening step, riders whose destination is the level get off first, in boarding order. Then the car picks its direction (EL-08). Then people board from the queue in that direction, from the front, until it is empty or the car is full.

EL-07. At the end of each Dwelling step, people who joined the queue in the car's direction board from the front while there is room. Nobody boards during Closing.

### Direction

EL-08. At a stop the car keeps its direction if it has work ahead or the queue in its direction is not empty; otherwise it reverses if the other queue is not empty or it has work behind; otherwise it boards nobody and becomes free when it leaves. Work is a rider destination or an assigned hall call.

EL-09. A car's next stop is the nearest level ahead in its direction that is a rider destination or an assigned call in its direction, or the farthest work ahead when that is an assigned call in the other direction. The next stop is recomputed at the start of every Moving step.

EL-10. A car with nothing ahead and work behind reverses at the start of the next step without stopping.

### Dispatch

EL-11. A hall call is a non-empty queue. Its age is the steps since the person at its front joined.

EL-12. Each step, after the cars of a shaft act, the shaft assigns its unassigned calls, oldest first, then lower level, then up before down.

EL-13. A coming car has the call's direction, has not reached the call's level, is not full, and is allowed by the band mode. A free car has no riders and no assigned calls.

EL-14. A free car is eligible when its distance to the call is at most the band's response distance, when the call's age is at least 30 steps, or when every car of the shaft is free at that point of the pass.

EL-15. The call goes to the eligible car with the smallest distance; ties go to a coming car over a free car, then to the lower car index. With no eligible car the call waits for the next pass.

EL-16. A car keeps an assigned call until it boards from it. A car that leaves a stop full drops its assigned calls in its direction. A call whose queue empties is gone.

### Home

EL-17. A free car with closed doors moves to its home, or to the lobby stop in an `expressUp` band, without stopping unless assigned a call, and becomes Idle there.

EL-18. The lobby stop is the lowest enabled stop at level 1 or higher, or the highest enabled stop of a shaft with none at or above level 1. A new shaft's first car has the lobby stop as its home.

### Bands and modes

EL-19. Each day type has 6 bands starting at 00:00, 07:00, 10:00, 12:00, 14:00 and 17:00. Monday to Friday use the weekday bands and Saturday and Sunday the weekend bands. Every band defaults to `normal`, dwell 30 s, response distance 5.

EL-20. In `expressUp` a car with riders moving up is not a coming car for up calls above the lobby stop. In `expressDown` a car with riders moving down is not a coming car for down calls above the lobby stop. Loaded cars still board at stops they make for their riders.

EL-21. A new band applies from its first step. A stop keeps the dwell of the band its Opening step was in.

### Changes

EL-22. Disabling a stop empties its queues (those people re-plan) and gives riders going there the nearest enabled stop, ties to the one ahead in the car's direction. The ride counts as finished when they get off.

EL-23. Trimming a range removes the stops outside it, moves homes on removed levels to the nearest remaining stop (lower on a tie), and moves empty cars on removed levels to the nearest end of the new range. Extending adds the new levels as enabled stops, express shafts only at express stop levels.

EL-24. `configureShaft` fails with `INVALID_SCHEDULE` for a stop outside the range, no stops, a wrong number of homes, a home that is not a stop, a day type without exactly 6 bands, a dwell outside {0, 10, 20, 30, 40, 50, 60} or a response distance outside 1 to 99.

EL-25. `configureShaft` with a stop outside the express levels on an express shaft fails with `EXPRESS_STOP_NOT_ALLOWED`. When a command breaks more than one rule, the result is the first failing check in this order: `UNKNOWN_ENTITY`, `EXPRESS_STOP_NOT_ALLOWED`, `INVALID_SCHEDULE`.

EL-26. `addCar` with a home that is not an enabled stop fails with `INVALID_SCHEDULE`, after the construction checks.

EL-27. A removed car's calls are unassigned and go into the next pass. Remaining cars keep their order and are renumbered from 0 with no gaps.

### Order and records

EL-28. The elevator phase runs after the people phase, shafts in increasing id, cars in increasing index, then the dispatch pass. It makes no random draws. The same seed, commands and tower give the same car positions at every step.

EL-29. For each ride the engine records `waitSteps` (joining the queue to boarding), `rideSteps` (boarding to getting off), shaft type, floors ridden and boarding level.
