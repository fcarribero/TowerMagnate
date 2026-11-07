# Hotel housekeeping and infestation

Version 1.0, 24 November 2026. Owner: Game Designer. Task TM-16.

This document defines the four states of a hotel room, how maids pick the dirty room they clean next, how long a cleaning takes, how many rooms a housekeeping unit can clean in a day, and how cockroaches appear in a room that stays dirty and spread along the floor. Values come from `docs/GDD.md` (sections Unidades y desbloqueos, Hotel, Personas and Plagas) and the SimTower research notes, adapted to a linear clock and a Monday-to-Sunday week. Where the GDD leaves a point open, the decision is marked "Design call" with a short reason. Section 11 maps every GDD line to the section that covers it. The numbered rules at the end are the contract for the engine (`packages/engine`), the balance constants (`packages/shared`) and QA.

Related specs: people (TM-10, `docs/design/people.md`) for the maid shift (section 10), hotel bookings and stays (section 8) and the draw order (section 1.2); economy (TM-9, `docs/design/economy.md`) for check-in, check-out and room upkeep (sections 5 and 8); routing (TM-11, `docs/design/routing.md`) for maid transport, walking limits and re-planning; construction (TM-8, `docs/design/construction.md`) for demolition (section 8); stress and evaluation (TM-13) for room grades; stars (TM-14, `docs/design/stars.md`) for the 2 suites that must not be infested; events (TM-15, `docs/design/events.md`) for fire, bomb and the VIP; UI (TM-18, `docs/design/ui.md`) for the Hotel overlay, the windows and the notice text.

## 1. Time conventions

The engine runs one step per 10 game seconds: 6 steps per game minute, 360 per game hour, 8,640 per game day (people.md 1). Times below are clock times of the day. A time window `[start, end)` includes `start` and excludes `end`. Maids work every day of the week, weekends included.

## 2. Room states

Every single room, double room and suite has exactly one state.

| State | UI label (overlay / window) | Meaning |
|---|---|---|
| Limpia | Limpia / Libre | clean and with no stay; it may hold a booking whose party has not checked in yet |
| Ocupada | Ocupada / Ocupada | a stay is active, from the check-in step until 10:00 on the check-out day |
| Sucia | Sucia / Sucia | the last stay ended and no maid has finished cleaning it |
| Con plaga | Con plaga / Con plaga | infested with cockroaches; permanent until the room is demolished |

Each room also keeps two values that the player does not see:

- `dirtyChecks`: how many daily infestation checks (section 7.1) found the room Sucia since it last became Sucia. It is 0 in every other state.
- `claimedBy`: the maid who has claimed the room for cleaning, or none. Only a Sucia room can be claimed.

### 2.1 Transitions

| From | To | When | Spec |
|---|---|---|---|
| (placed) | Limpia | the room is built | construction |
| Limpia | Ocupada | the first guest of the booked party reaches the room between 12:00 and 23:00 | economy 5.2 |
| Ocupada | Sucia | 10:00 on the check-out day | economy E-20 |
| Sucia | Limpia | a maid finishes the cleaning (section 5) | this spec |
| Sucia | Con plaga | the third daily check that finds it Sucia (section 7.1) | this spec |
| Limpia, Ocupada, Sucia | Con plaga | a neighbour was infested at the start of the daily check (section 7.2) | this spec |
| any | (removed) | demolition, bomb or fire | construction 8, events |

Nothing else changes a room's state. A party that gives up at 23:00 without checking in leaves the room Limpia. Guests who leave the room early on the check-out day do not make it Sucia before 10:00. A room never goes from Con plaga to any other state.

A newly built room counts as a room that just became Limpia for the booking roll (people.md 8.1): built between 12:00 and 21:00 it rolls at that step, otherwise at the next 12:00.

Design call on a single "Sucia" state for rooms being cleaned: the GDD overlay has four colors and the room window four labels. A room that a maid is cleaning stays Sucia until the cleaning ends, so the overlay only changes when the room can be booked again.

## 3. Housekeeping and maids

A housekeeping unit (Limpieza, 15 x 1, $50,000, 2 stars) has 6 maids. People.md section 10 sets their day:

- At 09:30 the 6 maids appear inside their unit, at its door (routing 3).
- From 10:00 a maid with no task asks for a room (section 4).
- At 17:00 every maid leaves the simulation wherever she is.

Maids walk on floors and ride stairs and service elevators only (routing R-06, R-07). Service elevators carry nobody else. Maids keep the per-trip walking limits of routing 5.2: at most 3 stair floors and 3 elevator rides per trip. Their stress is not recorded and they do not count in population.

All maids of all housekeeping units share one pool of dirty rooms. A maid is not tied to her own unit's floors.

Design call on the shared pool: the research notes report that each original housekeeper served only floors of one "floor mod 6" class. With that rule a hotel on 2 floors keeps 4 of its 6 maids idle, which players cannot see or fix. Here the claim (section 4.2) keeps maids on separate rooms, and the routing limits still force the player to put housekeeping and service elevators near the rooms.

## 4. Choosing a room

### 4.1 When a maid asks

A maid asks for a room when all of these hold:

- the clock is in `[10:00, 16:00)`;
- she has no claimed room;
- she has started fewer than 8 cleanings today (section 6);

and one of these happens:

- 10:00, the first step she may work;
- she just finished a cleaning;
- her claim was released (section 4.4);
- the clock is at a multiple of 30 minutes (10:30, 11:00, ..., 15:30) and she is idle, in her unit or on her way back to it.

A maid who asks and gets no room starts a trip back to her unit, or stays there if she is already in it. A maid who has started 8 cleanings goes back to her unit and does not ask again that day.

Maids ask in the people phase of the step, in increasing person id (people.md 1.2, step 3). A room claimed by a maid with a lower id is no longer a candidate for the next maid in the same step.

Design call on the 30-minute retry: rooms only become Sucia at 10:00 (economy E-20), so after the morning rush new work appears only when a claim is released or the player builds a route. A fixed half-hour check is cheap for the engine and easy to test, and it never delays a cleaning by more than 30 minutes.

### 4.2 Candidates and order

A candidate is a room that is Sucia, has no claim, and has a valid maid route (routing 7) from the maid's current cell to the room's door at this step.

The maid takes the first candidate in this order:

1. smaller level distance: floors between her level and the room's level (routing 1);
2. at equal level distance, the room above her before the room below her;
3. smaller column distance between her current column and the room's door column;
4. lower unit id.

The maid claims that room at once and starts a trip to its door along the route found.

Implementation note for the engine, not a rule: sort the Sucia unclaimed rooms by keys 1 to 4 and run the maid route search on each in that order until one succeeds. The first room with a route is the answer.

Design call on the order: the research notes say the original maid searched upward first, then downward. Taking the nearest level first, and up before down only on a tie, keeps that habit without sending a maid 20 floors up while a room waits one floor below.

### 4.3 The trip to the room

The trip to a claimed room follows routing like any other trip. If a leg breaks on the way (routing 8.4) the maid re-plans from where she stands. If there is then no route to the room, her claim is released and she asks again at once from where she stands (section 4.1).

The trip back to her unit is a required trip (people.md 4). If it has no route she waits in "Sin ruta" and retries per routing R-23; the 17:00 removal ends the wait.

### 4.4 Releasing a claim

A claim is released, and the room stays Sucia with its `dirtyChecks` unchanged, when:

- the maid's route to the room breaks and no new route exists (4.3);
- the maid reaches the room at 16:00 or later (section 5);
- the maid is removed because her housekeeping unit is demolished or destroyed;
- the clock reaches 17:00 (every claim left is released).

A claim ends without a release when the room is demolished or destroyed; the maid then asks again at once from where she stands, if 4.1 allows it.

## 5. Cleaning

A cleaning starts at the step the maid reaches the room's door, if that step is before 16:00. It lasts 180 steps (30 game minutes) for every room type. At the end of the 180th step the room becomes Limpia, its `dirtyChecks` returns to 0 and the claim ends. The maid then asks for her next room from the room's door.

| Room | Width | Cleaning time |
|---|---|---|
| Single | 4 | 30 min (180 steps) |
| Double | 6 | 30 min (180 steps) |
| Suite | 10 | 30 min (180 steps) |

A maid who reaches the room at 16:00 or later does not start. Her claim is released and she goes back to her unit.

While cleaning, the maid stands at the room's door in state "Limpiando". A cleaning that started before 16:00 always finishes, at the latest at 16:29:50, before the 17:00 removal.

If the room is demolished or destroyed during the cleaning, the cleaning stops and the maid asks again at once (4.4). If her housekeeping unit is demolished during the cleaning, she is removed and the room stays Sucia (construction 8.5).

Design call on one duration: people.md 10 fixes 30 minutes for every room, and the GDD gives no reason to split them. A suite already costs more to reach in practice because suites are wide and spread the rooms of a floor apart.

## 6. Daily capacity

A maid starts at most 8 cleanings a day (`MAID_DAILY_CLEANINGS`). A housekeeping unit therefore cleans at most 6 × 8 = 48 rooms a day.

The clock allows at most 12 starts per maid, at 10:00, 10:30, ..., 15:30, if every room were next to the last one. With a few minutes of walking or a stair flight between rooms, a maid fits 9 to 10 starts, so the cap of 8 is the limit in practice and travel only matters for rooms far from the unit.

Room demand: a room needs one cleaning per stay. With the average stay of 2 nights (economy 5.2) and a booking chance of 80% (people.md 8.1), a cleaned room waits on average `0.2 / 0.8 = 0.25` days for its next check-in, so it needs one cleaning every 2.25 days, 0.44 a day. One housekeeping unit keeps up with about `48 / 0.44 ≈ 108` rooms in steady state.

Stays of 1 night are 40% of all stays, so check-outs bunch on some days. The balance target is one housekeeping unit per 80 rooms it can reach, which leaves a margin of about a third for those days. The Limpieza window shows "Habitaciones sucias en la torre" so the player sees a backlog grow.

Design call on the cap: without it, capacity depends on walking times the player cannot read, and a unit next to a dense floor of single rooms would clean 72 rooms a day. A round 8 per maid gives the player one number to plan with: 48 rooms per unit.

## 7. Infestation

### 7.1 Daily check

Every day at 00:00 the engine runs the infestation check. It is the first step event of the 00:00 step, before the daily plans (people.md 1.2). It has two phases.

1. Spread (7.2), from the rooms that were Con plaga when the check started.
2. Dirt: every room that is Sucia adds 1 to its `dirtyChecks`. A room whose `dirtyChecks` reaches 3 becomes Con plaga.

A room that becomes Con plaga in either phase does not spread until the next day's check.

A room that becomes Sucia at 10:00 on day D is first counted at 00:00 on D+1. If no maid cleans it on days D, D+1 and D+2, it becomes Con plaga at 00:00 on D+3. The player always has three maid shifts to clean a room.

### 7.2 Spread

The neighbours of a room are, on each side, the nearest unit whose footprint is on the room's level, if that unit is a hotel room. Empty floor, lobby cells, ruins, stair and escalator flights and elevator shafts between two rooms do not separate them. Any other unit between them does: the nearer unit is that other unit, so the room has no neighbour on that side.

In the spread phase, every room that was Con plaga when the check started infests each of its neighbours that is not already Con plaga. Rooms are handled in increasing unit id; the result does not depend on the order because only rooms infested before the check spread.

So an infestation grows by one room on each side per day, along the row of rooms, until it reaches a non-room unit or the end of the level.

Design call on neighbours: the GDD says the plague spreads to the neighbouring rooms of the same floor. Counting the next unit in the row, across empty floor and transport, keeps "neighbour" what the player sees, and gives a clear defense: a non-room unit between two parts of a hotel stops the spread. Demolishing a clean room next to an infested one does not stop it; the next room in the row becomes the neighbour.

### 7.3 What an infestation does

When a room becomes Con plaga:

- If it is Ocupada, the stay ends at once as if the room were demolished (construction 8.5): the guests are removed wherever they are, nothing is refunded, and if the guest is the VIP the visit is rejected (events 6.3, EV-31). Population is recounted at once.
- Its `dirtyChecks` stops counting and any claim on it ends.
- It never takes a booking, maids never pick it, and it stays Con plaga until it is demolished.
- It keeps paying its weekly upkeep (economy 8.2) and keeps its last grade (TM-13).
- People still walk in front of it (routing 2.1).
- It does not count as a suite for the star requirement (stars S-12).

Demolishing a Con plaga room costs nothing and refunds nothing (construction C-71). The cells become empty floor and a new room built there starts Limpia.

### 7.4 Notice

After the check, the engine emits the alert `news.cockroaches` once for each level on which at least one room became Con plaga in that check, in increasing level order, with `{level}` set to that level: "Hay cucarachas en una habitación del piso {level}. Solo se eliminan demoliendo."

## 8. Other interactions

- Demolishing a hotel room ends its stay (construction 8.5) and any claim on it. Demolishing a housekeeping unit removes its maids and releases their claims; rooms being cleaned stay Sucia.
- A bomb or fire that destroys a room or a housekeeping unit has the same effect as demolition (events 4.5, 5.5).
- The VIP books a suite that is Limpia with no booking (people.md 9). A Con plaga or Sucia suite is never chosen.
- During a fire or a bomb threat maids keep working; guards never use service elevators (people.md P-46).
- The Limpieza window shows "Mucamas trabajando: `{n}` de 6", where `n` is the number of that unit's maids with a claim, and "Habitaciones sucias en la torre: `{n}`", the number of Sucia rooms in the whole tower. Con plaga rooms are not counted as dirty.
- The Hotel overlay colors each room by its state (ui.md 7).

## 9. Worked examples

### 9.1 Morning shift on two floors

Housekeeping H1 on level 10 at x = 100 (door 107). Stairs s1 link levels 10 and 11 at x = 120 (flight column 124). Rooms on level 11: single r1 at x = 100 (door 102), single r2 at 104 (door 106), double r3 at 108 (door 111), single r4 at 130 (door 132). On level 10: single r5 at 140 (door 142). There is no service elevator. Maids m1 to m6 have increasing person ids.

On Monday at 10:00 the stays of r2, r4 and r5 end and the three rooms become Sucia. r1 and r3 stay Ocupada.

| Maid | Candidates in order | Claims | Route | Arrives | Room Limpia |
|---|---|---|---|---|---|
| m1 | r5 (0 floors), r2 (1 up, 1 column), r4 (1 up, 25 columns) | r5 | walk 107 to 142: 35 steps | 10:05:50 | 10:35:50 |
| m2 | r2, r4 | r2 | walk 107 to 124 (17), s1 up (12), walk 124 to 106 (18): 47 steps | 10:07:50 | 10:37:50 |
| m3 | r4 | r4 | walk 17, s1 up 12, walk 124 to 132 (8): 37 steps | 10:06:10 | 10:36:10 |
| m4 to m6 | none | none | stay in H1 | | |

m4 to m6 ask again at 10:30, 11:00 and every half hour until 15:30. When m1 to m3 finish there is no Sucia room left, so each starts a trip back to H1. Each of m1 to m3 has started 1 cleaning of the 8 allowed today.

### 9.2 A room out of reach

Same tower, plus single r6 on level 15. Level 11 to 15 has stairs on every level, but from H1 the trip needs 5 stair floors, over the limit of 3 (routing R-13). r6 is never a candidate, becomes Sucia on Tuesday at 10:00, is counted at 00:00 on Wednesday (1), Thursday (2) and Friday (3), and becomes Con plaga on Friday at 00:00. The engine emits `news.cockroaches` with level 15. A service elevator with stops at 10 and 15 would have made r6 a candidate for every maid of H1.

### 9.3 Spread along a row

Level 30, from left to right: single A at x = 0, single B at 4, double C at 8, single D at 14, empty floor 18 and 19, an office at 20, single E at 30. There is no housekeeping in the tower.

| Check | Con plaga at start | Spread | Dirt phase | Con plaga after |
|---|---|---|---|---|
| Monday 10:00 | | | A becomes Sucia | |
| Tuesday 00:00 | none | none | A 1 | none |
| Wednesday 00:00 | none | none | A 2 | none |
| Thursday 00:00 | none | none | A 3: Con plaga | A |
| Friday 00:00 | A | A infests B | | A, B |
| Saturday 00:00 | A, B | B infests C | | A, B, C |
| Sunday 00:00 | A, B, C | C infests D | | A, B, C, D |
| Monday 00:00 | A, B, C, D | D's right neighbour is the office: none | | A, B, C, D |

E is never infested: the office stands between D and E. If D had a party staying on Saturday night, that stay ends at Sunday 00:00, the guests are removed, and nothing is refunded. One `news.cockroaches` with level 30 is emitted on Thursday, Friday, Saturday and Sunday.

Variant: on Thursday at 09:00 the player demolishes B. At Friday 00:00 A's right neighbour is C, across the empty floor where B stood, so C becomes Con plaga. Demolishing A on Thursday instead stops the spread, since no room is left Con plaga.

### 9.4 The 16:00 cut and the cap

Maid m2 of 9.1 finishes a cleaning on level 11 at 15:52:00 and asks. The only Sucia room is on level 13, 66 columns away and up 2 stair flights: 66 + 24 = 90 steps. She claims it and arrives at 16:07:00, after 16:00, so she does not start. The claim is released, the room stays Sucia and keeps its `dirtyChecks`, and m2 walks back to H1.

Maid m5 on a busy day starts her 8th cleaning at 14:02:00 and finishes at 14:32:00. She does not ask again and goes back to H1, even if Sucia rooms are left. They wait for another maid with fewer than 8 starts, or for the next day.

## 10. Constants for `packages/shared`

| Constant | Value |
|---|---|
| `MAIDS_PER_HOUSEKEEPING` | 6 (catalog, existing) |
| `MAID_APPEAR_TIME` | 09:30 |
| `MAID_LEAVE_TIME` | 17:00 |
| `CLEANING_START_FROM` | 10:00 |
| `CLEANING_START_BEFORE` | 16:00 |
| `CLEANING_MINUTES` | 30 for every room type (existing, people.md 20) |
| `MAID_DAILY_CLEANINGS` | 8 |
| `MAID_RETRY_MINUTES` | 30 |
| `INFESTATION_CHECK_TIME` | 00:00 |
| `INFESTATION_DIRTY_CHECKS` | 3 |

## 11. GDD coverage

| GDD line | Section | Status |
|---|---|---|
| Limpieza 15 x 1, $50,000, 6 mucamas, 2 stars | 3 | Kept |
| El ascensor de servicio solo lo usa el personal de limpieza | 3 | Kept, routing R-07 |
| La habitación no se vuelve a alquilar hasta que pasa limpieza | 2.1, 5 | Kept |
| Mucamas: limpian habitaciones liberadas de 10:00 a 16:00, escaleras y ascensor de servicio | 3, 4, 5 | Kept; cleanings start in `[10:00, 16:00)` |
| Si una habitación liberada no se limpia en 3 días seguidos, se llena de cucarachas | 7.1 | Kept: third daily check |
| La plaga se contagia cada día a las habitaciones vecinas del mismo piso | 7.2 | Kept, neighbour defined |
| La única forma de eliminarla es demoler | 7.3 | Kept |
| Vista Hotel: limpia, sucia, con plaga | 2, 8 | Kept, plus Ocupada (ui.md) |
| Capacity of maids per day | 6 | Added: 8 per maid, 48 per unit |

## 12. Rules

### States

H-01. A hotel room is always in exactly one of the states Limpia, Ocupada, Sucia and Con plaga. A newly built room is Limpia with `dirtyChecks` 0 and no claim. Error: none.

H-02. A room goes Limpia to Ocupada at check-in, Ocupada to Sucia at 10:00 on the check-out day, Sucia to Limpia at the end of a cleaning, and any state to Con plaga only through the daily check. No other transition exists, and Con plaga never changes. Error: none.

H-03. A party that gives up before check-in, or guests who leave the room before 10:00 on the check-out day, do not change the room's state. Error: none.

H-04. A newly built room rolls its first booking at the build step if built between 12:00 and 21:00, otherwise at the next 12:00. Error: none.

### Maids and room choice

H-05. All maids of all housekeeping units share one pool of rooms. A maid may clean any room she can reach. Error: none.

H-06. A maid asks for a room only in `[10:00, 16:00)`, only with no claim and fewer than 8 cleanings started that day, and only at 10:00, right after finishing a cleaning, right after a claim is released, or at a multiple of 30 minutes while idle. Error: none.

H-07. A candidate is a Sucia room with no claim and a valid maid route from the maid's current cell to its door at that step. Con plaga, Limpia and Ocupada rooms are never candidates. Error: none.

H-08. The maid takes the first candidate by: fewer floors between her level and the room's; on a tie, above before below; then smaller column distance from her column to the door; then lower unit id. Error: none.

H-09. A claimed room is not a candidate for any other maid. Maids ask in increasing person id within a step, so a lower id claims first. Error: none.

H-10. A maid who gets no room goes back to her unit (or stays in it). A maid who has started 8 cleanings goes back and does not ask again that day. Error: none.

H-11. Maids use floors, stairs and service elevators only, with the per-trip limits of routing R-13. The trip back to the unit is a required trip; the trip to a room is re-planned when a leg breaks, and if no route is left the claim is released and the maid asks again at once. Error: none.

### Cleaning

H-12. A cleaning starts at the step the maid reaches the room's door, if that step is before 16:00, and lasts 180 steps for single rooms, double rooms and suites. At the end the room is Limpia, `dirtyChecks` is 0 and the claim ends. Error: none.

H-13. A maid who reaches her claimed room at 16:00 or later does not start; the claim is released and she goes back to her unit. Error: none.

H-14. A released claim leaves the room Sucia with `dirtyChecks` unchanged. At 17:00 every claim is released and every maid leaves the simulation. Error: none.

H-15. If the room is demolished or destroyed during the trip or the cleaning, the maid asks again at once if H-06 allows it. If her housekeeping unit is demolished or destroyed, she is removed, her claim is released, and the room stays Sucia. Error: none.

### Capacity

H-16. A maid starts at most 8 cleanings a day and a housekeeping unit at most 48. Error: none.

### Infestation

H-17. At 00:00 every day, as the first step event of that step, the engine runs the infestation check: spread first, then dirt. Error: none.

H-18. Spread: every room that was Con plaga when the check started infests each neighbour that is not Con plaga. Rooms infested during the check do not spread until the next day. Error: none.

H-19. A room's neighbour on each side is the nearest unit on the same level on that side, if that unit is a hotel room. Empty floor, lobby cells, ruins, flights and shafts do not separate rooms; any other unit does. Error: none.

H-20. Dirt: every Sucia room adds 1 to `dirtyChecks`, and a room that reaches 3 becomes Con plaga. A room that becomes Sucia at 10:00 on day D and is not cleaned becomes Con plaga at 00:00 on day D+3. Error: none.

H-21. A room that becomes Con plaga while Ocupada ends its stay at once with the effects of demolition: guests removed, no refund, a VIP visit rejected, population recounted. Error: none.

H-22. A Con plaga room takes no booking, is never cleaned, still pays weekly upkeep, keeps its grade, stays walkable in front, and does not count toward the 2 suites of the 3-to-4 star step. Error: none.

H-23. Demolishing a Con plaga room is free and refunds nothing. Error: none.

H-24. After each check, `news.cockroaches` is emitted once per level with at least one new Con plaga room, in increasing level order. Error: none.

### UI data

H-25. "Mucamas trabajando" is the number of the unit's maids holding a claim. "Habitaciones sucias en la torre" is the number of Sucia rooms in the tower; Con plaga rooms are not included. Error: none.
