# Events and decisions

Version 1.1, 20 November 2026. Owner: Game Designer. Task TM-15.

This document defines the tower events of the GDD (section Eventos): the bomb threat, fire, the VIP visit, treasure and Papá Noel. For each one it gives the daily chance, the time of day, what the player can decide and what happens if the player does not answer, and the step-by-step rules for the bomb search and the fire spread. Values come from `docs/GDD.md` and the SimTower research notes, adapted to the linear clock and the Monday-to-Sunday week. Where the GDD leaves a point open, the decision is marked "Design call" with a short reason. Section 14 maps every GDD event to the section that covers it. The numbered rules at the end are the contract for the engine (`packages/engine`), the balance constants (`packages/shared`) and QA.

Related specs: construction (TM-8, `docs/design/construction.md`) for ruins, demolition effects (8.5), the security lock (8.2) and the treasure roll (8.6); economy (TM-9, `docs/design/economy.md`) for the `events` ledger category and the VIP's suite payment; people (TM-10, `docs/design/people.md`) for the VIP's schedule (section 9), security guards (section 14) and the draw order (1.2); routing (TM-11) for guard trips; stress (TM-13) for the stress of a trip; stars (TM-14, `docs/design/stars.md`) for the VIP approval flag; UI (TM-18, `docs/design/ui.md`) for decision dialogs (9.1) and news texts (13.9). Cockroaches belong to TM-16 and news about units to TM-17.

## 1. Time units

| Unit | Engine steps | Real time |
|---|---|---|
| 1 game minute | 6 | 0.625 s |
| 1 game hour | 360 | 37.5 s |
| 1 game day | 8,640 | 15 min |

"At 09:00" means the first step of that minute. A chance "1 in N" is one draw `nextInt(rng, 0, N - 1)` that succeeds when it returns 0. All draws use the tower's seeded RNG (TM-7).

A day with the event rolls of this document is any day of the week, weekdays and weekends alike. Over a year the expected count is 365 / 60 = 6.1 bomb threats at 2 stars or more and 365 / 84 = 4.3 fires at 3 stars or more, before the "no other event" conditions remove a few.

## 2. Event overview

| Event | Stars | Roll time | Chance per day | Decision | Default |
|---|---|---|---|---|---|
| Bomb threat | 2 or more | 09:00 | 1 in 60 | pay the ransom or not, until 10:00 | `refuse` |
| Fire | 3 or more | 15:00 | 1 in 84 | call the helicopter or not, until 16:00 | `burn` |
| VIP visit | exactly 3 | 00:00 | 8% rising 4 points per day without a VIP (6.1) | none | |
| Treasure | any | on a construction command | 1 in 40 per command, once per basement level | none | |
| Papá Noel | any | 22:00 on 24 December | always | none | |

Bomb threats and fires are disasters. At most one disaster is active at a time. A VIP visit can run at the same time as a disaster.

Design call on chances: the GDD gives averages ("en promedio una vez cada 60 días"). A fixed daily chance gives that average and keeps the event a surprise, which matches how players saw the original even though it used a fixed calendar. One roll per day at a fixed hour keeps the draw order simple and makes the event testable with a seed.

## 3. Decisions

A decision is an event that asks the player to choose. Two exist: `bomb` and `fire`.

### 3.1 Opening

When a decision opens, the engine:

1. creates an active event with a new id `e{n}` from `nextId`, its kind, its options and its default option;
2. sets `deadlineStep = openStep + 360` (1 game hour, 37.5 real seconds);
3. emits `decisionOpened` with the id, kind, deadline and options in the order of the dialog buttons (ui.md 9.1), the default last.

| Kind | Options | Default | Opens | Deadline |
|---|---|---|---|---|
| `bomb` | `pay`, `refuse` | `refuse` | 09:00 | 10:00 |
| `fire` | `helicopter`, `burn` | `burn` | 15:00 | 16:00 |

### 3.2 Answering

The player answers with the `answerEvent` command (tech doc 5). The engine checks it in this order and returns the first failing code:

1. `UNKNOWN_ENTITY`: the id is neither an open decision nor one of the last 20 closed decisions, which the tower keeps.
2. `EVENT_EXPIRED`: the decision is one of those closed decisions, or the command is applied at a step at or after `deadlineStep`.
3. `INVALID_CHOICE`: the choice is not one of the decision's options.

An accepted answer closes the decision at once: the engine emits `decisionClosed` with the choice and applies it (sections 4.3 and 5.3). A decision can be answered only once.

Paying is always accepted, whatever the balance. The ransom and the helicopter can make the balance negative, as upkeep can (economy 2).

Design call on paying with a low balance: refusing the payment because the player is short of money would turn a choice into a forced explosion or burn, which the player could not see coming. A negative balance already has a cost: no construction until it is positive again.

### 3.3 Deadline

At `deadlineStep`, in the events phase (section 10), an open decision closes with its default option. The engine emits `decisionClosed` with the default and the notice `news.decisionDefault` (ui.md 13.9) with the option's button text.

A decision whose disaster ends before the deadline closes at that step with its default option, which has no cost. This can happen when guards put a fire out before 16:00. It emits `decisionClosed` but not `news.decisionDefault`; the notice that ends the disaster is enough.

### 3.4 While the tower is paused

Deadlines are in game time. When the owner disconnects the tower pauses (GDD), so the deadline pauses too. The snapshot on reconnection lists open decisions in `activeEvents`, and the client opens the dialog again with the time left.

## 4. Bomb threat

### 4.1 Trigger

At 09:00 every day the engine rolls 1 in 60 for a bomb threat when all of these hold:

- the rating is 2 stars or more (5 stars and Torre included);
- no bomb threat or fire is active;
- the tower has at least one bomb candidate: a unit that is not the cathedral and not a lobby.

If any condition fails, no draw is made.

### 4.2 Bomb position

On success the engine makes two more draws:

1. a candidate unit, `nextInt(rng, 0, count - 1)` over the candidates in increasing unit id;
2. a column inside that unit, `nextInt(rng, x, x + w - 1)`.

The bomb sits at that column on the unit's bottom level. Call that cell (`bx`, `bl`). The bomb stays at that cell whatever the player builds or demolishes afterwards.

Then the engine:

- opens the `bomb` decision with the ransom for the current rating: $200,000 at 2 stars, $300,000 at 3, $1,000,000 at 4, 5 or Torre;
- starts the security lock: placing a security office fails with `BOMB_EVENT_ACTIVE` (construction C-57) until the threat ends;
- emits the alert notice `news.bombThreat` and the bomb alarm sound at the bomb cell.

The ransom is fixed when the threat opens. A star change during the threat does not change it.

### 4.3 Answers

- `pay`: $ransom is charged to the `events` category. The threat ends at once (4.6) with `news.bombPaid`.
- `refuse`, or no answer by 10:00: the search starts at the step the decision closes (4.4).

### 4.4 Search

The search uses the security guards of every security office in the tower (people.md 14), 6 per office.

When the search starts, the engine emits `news.bombSearch` and makes the search list: every level from -9 to 100 that holds at least one unit other than a lobby, plus the bomb level `bl`, which is always on the list even if the player has demolished every unit on it. Each level on the list is unsearched, taken by one guard, or searched. Levels that get units later are not added.

Each guard, in increasing person id, picks a target:

- the unsearched, untaken level with the smallest distance to the guard's current level, measured in dense level indexes (tech doc 3.1, so -1 and 1 are 1 apart);
- on a tie, the higher level;
- levels this guard already found unreachable are skipped.

The guard takes the level and plans a trip to the leftmost column with structure on that level (routing TM-11). A guard already on the target level starts searching at once, with no trip. If the trip has no route, the level is released, marked unreachable for that guard only, and the guard picks again in the same step. A guard with nothing left to pick goes back to the office (4.6).

The search of a level starts at the step the guard arrives and lasts

`searchSteps = 6 × max(1, ceil(c / 4))`

where `c` is the number of columns with structure on that level when the search of the level starts. That is one game minute for every 4 columns. At the step `arrival + searchSteps` the level is searched:

- if it is the bomb level `bl`, the bomb is found and the threat ends (4.6) with `news.bombFound`;
- otherwise the guard picks the next target as above.

Guards on a search use elevators, stairs and escalators like office workers and share the queues with everyone else. Their stress is not recorded.

Design call on search speed: the GDD says only that security searches. One minute per 4 columns gives 16 minutes for a 64-column floor and 40 minutes for a 160-column floor. One office (6 guards) checks about 50 small floors in the 3 hours to 13:00, enough for a 2-star tower, but only about 25 floors of 160 columns, so a 4-star tower needs 3 or 4 offices, close to the "one per 1,000 people" rule players used in the original. Slow elevators also slow the search, which ties security back to transport design.

### 4.5 Explosion

At 13:00, in the events phase, a bomb that has not been found explodes. A level searched at the 13:00 step is too late.

The blast box is:

- columns `bx - 20` to `bx + 19` (40 columns), cut to 0 to 374;
- levels from 2 below `bl` to 3 above `bl` in level order (construction section 1, so the level below 1 is -1), cut to -9 to 100;
- level 1 is never part of the box;
- the cathedral and level 101 are never part of the box.

Inside the box:

- every unit with at least one cell in the box is destroyed;
- every cell with structure and no occupant becomes ruins;
- stairs, escalators, shafts and elevator cars are not damaged.

A destroyed unit is removed and all of its cells become ruins, including cells outside the box. Ruins sit on floor structure, so nothing above or below loses support (construction 2.1), and demolishing ruins leaves empty floor. Lobby cells keep their lobby structure under the ruins.

A destroyed unit has the effects of demolition (construction 8.5) with two differences: there is no refund, and a sold condo is not bought back. Its tenants, owners, guests and staff are removed. People who are only walking or queueing inside the box are not hurt.

The engine emits `disaster` with kind `bomb` and the ruined cells, the alert notice `news.bombExploded` with level `bl`, and the explosion sound at the bomb cell. Population is recounted at once. The threat ends (4.6).

Design call on transport: a shaft can span 30 levels or, for an express, the whole tower. Destroying it for a 6-level blast would cut transport far from the box, and construction has no partial shaft. Stairs and escalators are kept for the same reason, so the player's transport layout survives. The units, which are the income, take the loss.

Design call on the cathedral: the fire never burns the cathedral (5.6), and the bomb follows the same rule. The cathedral costs $35,000,000 and is the only way to the Torre rank, and the player has no way to protect it, since the bomb cell is random and the security lock blocks new offices.

Design call on condos: demolishing a sold condo costs the sale price because the player chose it (construction 8.5). The player did not choose the explosion, and the GDD gives a block of destroyed units as the whole penalty.

### 4.6 End of the threat

A threat ends when the ransom is paid, the bomb is found or the bomb explodes. Then:

- the security lock ends;
- every guard away from the office plans a trip back to it and is on duty again on arrival;
- the active event is removed and `activeEvents` is sent in full.

## 5. Fire

### 5.1 Trigger

At 15:00 every day the engine rolls 1 in 84 for a fire when all of these hold:

- the rating is 3 stars or more;
- no bomb threat or fire is active;
- no wedding attempt is under way that day (people.md 15);
- the tower has at least one fire candidate: a unit that is not a lobby and whose bottom level is from 2 to 100 and has 32 or more columns with structure.

If any condition fails, no draw is made.

### 5.2 Ignition

On success the engine draws a candidate unit and a column inside it, in the same way as the bomb (4.2). The fire's origin is that column on the unit's bottom level: column `c0` on level `L0`.

The origin level ignites at that column (5.4). The engine opens the `fire` decision, emits the alert notice `news.fire` with level `L0`, and plays the fire alarm at the origin.

### 5.3 Answers

- `helicopter`: $500,000 is charged to the `events` category. Every burning level goes out at once and the fire ends (5.8) with `news.fireHelicopter`. Cells already burned stay ruins.
- `burn`, or no answer by 16:00: the fire keeps going and the guards fight it (5.7).

The fire spreads from 15:00 whatever the player answers, so a late helicopter saves less.

### 5.4 A burning level

Each level burns at most once per fire. A level that ignites at column `c` at step `s` has:

- a left front and a right front, both at column `c`;
- the burned span, from the left front to the right front;
- its ignition step `s` and its ignition column `c`.

When the level ignites, cell `c` burns (5.5).

Every 6 steps after `s` (each game minute: `s + 6`, `s + 12`, ...), each front that is not out does this, left front first:

1. Containment: the guards fighting this front add their count to its progress (5.7). If progress reaches 10, the front is out and does not move.
2. Spread: the front moves 1 column away from `c`. If the new column is outside 0 to 374 or has no structure, the front is out and stays where it was. Otherwise the new cell burns.

A level is out when both fronts are out.

### 5.5 What burns

When a cell burns:

- if a unit occupies it and the unit still exists, the unit is destroyed with the effects of 4.5 (no refund, no condo buyback) and all its cells become ruins;
- if the cell has structure and no occupant, it becomes ruins;
- stairs, escalators, shafts and cars are not damaged, and the fire passes through their cells.

Each newly burned cell or destroyed unit is reported in a `disaster` event with kind `fire`, one event per step with all the cells that became ruins in that step. Population is recounted at once after each step that destroyed a unit.

A front keeps moving one column a minute through the cells of a unit it has already destroyed. A unit that reaches several levels is destroyed when its first cell burns, but the fire only spreads on the levels that are burning.

### 5.6 Climbing

At step `s + 180` (30 game minutes after a level ignited), if that level is not out and the level above it is 100 or lower and has not burned in this fire, the level above ignites. Its ignition column is the column of the burned span that is nearest to `c` and has structure on the level above, the lower column on a tie. If no column of the burned span has structure above, the fire does not climb from this level.

The fire never moves down and never burns level 1 or the cathedral.

### 5.7 Guards

When the fire starts, and again whenever a level ignites or goes out, every guard without a target picks one, in increasing person id:

- the burning level with the fewest guards assigned;
- on a tie, the higher level.

A guard assigned to a level plans a trip to that level's ignition column. On arrival the guard joins the front of that level with fewer guards, the left front on a tie, and fights it from the next minute tick. A guard whose front goes out joins the other front of the same level if it is still burning, or else has no target and picks again. A guard whose trip has no route has no target; it stays where it is and picks again at the next pick. A guard still travelling to a level that goes out has no target, stops where it is at that step and picks again in the same step (the pick of item 9 in section 10).

A guard counts for containment at a tick only when it arrived at an earlier step.

### 5.8 End of the fire

The fire ends when every burning level is out, when the helicopter is called, or at 19:00 (4 game hours after the start), when every level still burning goes out by itself. On end:

- an open `fire` decision closes with `burn` (3.3);
- the engine emits `news.fireOut`, unless the helicopter ended it;
- every guard away from the office plans a trip back (4.6);
- the active event is removed.

Burned cells stay ruins until the player demolishes them (construction C-71).

Design call on spread: the GDD says the fire spreads along the floor and upward, security contains it, and burned areas are cleared by demolition. One column a minute each way means a floor of 160 columns burns in about 80 minutes with no help. A level that burns for 30 minutes lights the one above, so an unattended fire takes about 8 levels by 19:00. Ten guard-minutes per front means one office (3 guards per front) puts a level out 4 minutes after it arrives. A tower whose guards arrive within 10 minutes loses about 20 to 30 columns; a tower without security, or with guards stuck behind a slow elevator, loses several floors. The helicopter is the expensive way out.

## 6. VIP visit

### 6.1 Trigger

At 00:00 every day the engine rolls for a VIP visit when the rating is exactly 3 stars and no VIP visit is in progress. If either condition fails, no draw is made and the counter below does not change.

The tower keeps `vipDryDays`, the number of rolls made since the last VIP day, starting at 0. The chance of the roll is:

`chance = 100` when `vipDryDays + 1 >= VIP_GUARANTEE_DAY`, otherwise `VIP_BASE_PERCENT + VIP_STEP_PERCENT x vipDryDays`, in percent.

On success that day is a VIP day for people.md 9 and `vipDryDays` goes back to 0. On failure `vipDryDays` goes up by 1. A VIP day counts as a visit for the reset even if the visit later fails (6.2) or is rejected (6.3). The counter keeps its value when the rating leaves 3 stars and when a visit is in progress.

With `VIP_BASE_PERCENT` 8, `VIP_STEP_PERCENT` 4 and `VIP_GUARANTEE_DAY` 21, a tower at 3 stars sees this, where "day" is the number of rolls since the last VIP day. The cumulative column is 1 minus the product of the failure chances up to that day.

| Day | Chance | Cumulative |
|---|---|---|
| 1 | 8% | 8.00% |
| 2 | 12% | 19.04% |
| 3 | 16% | 31.99% |
| 4 | 20% | 45.59% |
| 5 | 24% | 58.65% |
| 6 | 28% | 70.23% |
| 7 | 32% | 79.76% |
| 8 | 36% | 87.04% |
| 9 | 40% | 92.23% |
| 10 | 44% | 95.65% |
| 11 | 48% | 97.74% |
| 12 | 52% | 98.91% |
| 13 | 56% | 99.52% |
| 14 | 60% | 99.81% |
| 15 | 64% | 99.93% |
| 16 | 68% | 99.98% |
| 17 | 72% | 99.99% |
| 18 | 76% | 100.00% |
| 19 | 80% | 100.00% |
| 20 | 84% | 100.00% |
| 21 | 100% | 100.00% |

The mean wait is 5.16 days, under the target of 6. The cumulative chance is 99.81% at day 14, over the target of 95%, and 100% at day 21 because the roll on day 21 always succeeds. The 95% mark is reached on day 10 (95.65%).

### 6.2 Visit

At 12:00 on the VIP day, before the hotel booking rolls, the VIP books a suite as people.md 9 says.

- No clean free suite: the visit fails at once with `news.vipNoSuite`. The approval flag is not changed.
- A suite booked: the engine emits `news.vipArrives`. The VIP comes, pays the suite for 1 night (economy E-23), dines and leaves as people.md 9 says.

### 6.3 Approval

The visit is judged when it ends:

- The VIP leaves the tower through an entrance: the visit is approved when the VIP's stress (people.md 9: the average stress of all the VIP's trips, TM-13) is under 15 game minutes. Otherwise it is rejected.
- The suite is demolished, bombed or burned during the stay, the VIP gives up before check-in at 23:00, or the VIP is removed in any other way before leaving: the visit is rejected.

An approved visit that started at 3 stars sets the VIP approval flag (stars S-16) with `news.vipApproved`. A rejected visit emits `news.vipRejected` and does not clear the flag.

Visits go on at 3 stars after the flag is set, since the GDD ties them to 3 stars. They have no effect on the flag then, but the VIP still pays the suite.

Design call on the threshold: the GDD asks for "estrés bajo". TM-13 shows stress in pink from 15 minutes and red from 30, so under 15 means the VIP never looked stressed on average. The original passed at half of its stress scale, which is about the same point.

Design call on the rising chance: a flat 1 in 9 gave a mean wait of 9 days and left 8% of towers waiting more than 21 game days, which is over 5 real hours with nothing to do (playtest TM-139 saw 24 days). Raising the chance by 4 points for each roll without a VIP gives a mean wait of 5.16 days, about 77 real minutes, and no tower waits past day 21. A failed or rejected visit starts the wait again from 8%, which is the pressure to keep two suites and a quick route to them (stars 5.3).

## 7. Treasure

Each successful construction command that creates at least one new basement cell (construction 8.6) can find treasure. Basement levels -1 to -9 are written S1 to S9 here, as in construction section 1.

1. The dig level is the deepest level among the command's new basement cells that has not yet given treasure in this tower. If all of them have, no draw is made.
2. The engine rolls 1 in 40.
3. On success the treasure is credited to the `events` category, the dig level is marked as having given treasure, and the engine emits `treasureFound` with the amount and `news.treasure` with the level and the amount.

| Dig level | Amount |
|---|---|
| S1 to S3 | $50,000 |
| S4 to S6 | $100,000 |
| S7 to S9 | $200,000 |

The roll happens after the command is charged. The credit follows the $99,999,999 cap (economy 2).

Design call on the limit: a roll per command with no limit would let a player lay one basement cell at a time and farm money. One treasure per level caps the total at $1,050,000 over a tower's life, which is a bonus and not a source of income. Deeper levels pay more because they cost more to reach.

## 8. Papá Noel

At 22:00 on 24 December every year, the engine emits `news.santa`. On that notice the client draws Papá Noel crossing the sky above the tower once, from right to left, over 20 real seconds. There is no draw, no money and no effect on people. The tower must be running at 22:00 for it to show.

## 9. Disasters and other systems

- While a bomb threat is active, placing a security office fails with `BOMB_EVENT_ACTIVE`. No other command is locked by an event.
- During a disaster the simulation runs normally: rent, hotels, people and elevators go on.
- The star check (stars 4) reads the tower as it is at 17:00. A fire still burning at 17:00 may have lowered population; nothing else about an event blocks a star.
- A unit destroyed by an event cannot be refunded later, since it no longer exists.
- Guards are the only people whose plans change during an event. Other people keep their plans and re-plan only when their unit, route or queue is gone (construction 8.5, routing).

## 10. Order within a step

Event work happens in the events phase: after the step events of people.md 1.2 item 1 (including the 12:00 VIP booking and the 17:00 star check of stars 4), and before the people with something due (people.md 1.2 item 3). Inside the events phase:

1. Decision deadlines (3.3).
2. 00:00: VIP roll (6.1).
3. 09:00: bomb roll and position (4.1, 4.2).
4. 13:00: explosion (4.5).
5. 15:00: fire roll, ignition (5.1, 5.2).
6. 19:00: fire burns out (5.8), before any tick or climb of that step.
7. Fire minute ticks of every burning level, in increasing level, left front then right front (5.4), then climbs (5.6).
8. Bomb search: levels whose search ends at this step, guards in increasing person id (4.4).
9. Guard picks after any level ignited or went out (5.7).
10. 22:00 on 24 December: Papá Noel (8).

Answers to decisions and treasure rolls happen in the commands phase, when the command is applied, before any simulation of the step (tech doc 2). Their money goes to the ledger at once (economy 10, item 7). The destruction of units is the "event effects" item of economy 10.

Guard trips themselves, arrivals included, are handled by the people phase, so an arrival is seen by the events phase of the next step.

## 11. Data for other specs

### 11.1 State

`TowerState.activeEvents` holds at most one bomb threat, one fire and one VIP visit. Proposed shapes for TM-5 to add to `shared`:

```ts
export type ActiveEvent = BombThreat | Fire | VipVisit;

export interface Decision {
  openStep: number;
  deadlineStep: number;
  options: string[];          // dialog order, default last
  defaultChoice: string;
  choice: string | null;      // null while open
}

export interface BombThreat {
  kind: 'bomb';
  id: string;
  decision: Decision;
  ransom: number;
  bomb: { x: number; level: Level };
  searchStarted: boolean;
  levels: Partial<Record<Level, 'unsearched' | PersonId | 'searched'>>;
  unreachable: Record<PersonId, Level[]>;
}

export interface Fire {
  kind: 'fire';
  id: string;
  decision: Decision;
  startStep: number;
  levels: Partial<Record<Level, BurningLevel>>;
  guards: Record<PersonId, { level: Level; front: 'left' | 'right' | null } | null>;
}

export interface BurningLevel {
  ignitionStep: number;
  ignitionColumn: number;
  left: { x: number; progress: number; out: boolean };
  right: { x: number; progress: number; out: boolean };
}

export interface VipVisit {
  kind: 'vip';
  id: string;
  day: number;                // game day of the roll
  personId: PersonId | null;  // set at booking
  unitId: UnitId | null;      // the suite
  startedAtStars: StarRating;
}
```

The tower also keeps `closedDecisions: string[]`, the ids of the last 20 closed decisions, newest last; `treasureLevels: Level[]`, the basement levels that have given treasure, and the VIP approval flag of stars S-16.

### 11.2 Client view

`EventView` sends, per active event: the kind, the id, the open decision (options, default, deadline step) if any, the ransom, the burning spans per level as `{ level, x0, x1, out }`, and for a bomb whether the search has started. The bomb cell is not sent; the player does not know where the bomb is. The VIP visit is not sent as an event view; the VIP is a person and shows like one. A bomb explosion is not an event view: the threat ends at the blast (4.6), so the ruined cell ranges travel only in the one `disaster` client event of that step and are never sent again.

### 11.3 Ledger

| Money | Category | Sign |
|---|---|---|
| Ransom | `events` | - |
| Helicopter | `events` | - |
| Treasure | `events` | + |

## 12. Notices

| Key | When | Alert | Text |
|---|---|---|---|
| `news.bombThreat` | 4.2 | yes | in ui.md 13.9 |
| `news.bombPaid` | 4.3 | | in ui.md 13.9 |
| `news.bombSearch` | 4.4, search starts | | Seguridad empezó a buscar la bomba. |
| `news.bombFound` | 4.4 | | in ui.md 13.9 |
| `news.bombExploded` | 4.5 | yes | in ui.md 13.9 |
| `news.fire` | 5.2 | yes | in ui.md 13.9 |
| `news.fireHelicopter` | 5.3 | | in ui.md 13.9 |
| `news.fireOut` | 5.8 | | in ui.md 13.9 |
| `news.vipArrives` | 6.2 | | in ui.md 13.9 |
| `news.vipNoSuite` | 6.2 | | El VIP no encontró una suite libre y no vino. |
| `news.vipApproved` | 6.3 | | in ui.md 13.9 |
| `news.vipRejected` | 6.3 | | in ui.md 13.9 |
| `news.treasure` | 7 | | in ui.md 13.9 |
| `news.santa` | 8 | | in ui.md 13.9 |
| `news.decisionDefault` | 3.3 | | in ui.md 13.9 |

The two new texts, `news.bombSearch` and `news.vipNoSuite`, go to TM-17 for the catalog. `news.bombSearch` is shown whenever the search starts, after a `refuse` answer or at the deadline. Choosing `burn` has no notice of its own; the deadline case uses `news.decisionDefault`.

## 13. Worked examples

### 13.1 A bomb found in time

A 2-star tower has units on levels -1 and 2 to 12, 12 levels. Every one of them has structure on columns 150 to 213, 64 columns, so each level takes `6 × 16 = 96` steps (16 minutes) to search. There is one security office on -1 with guards g1 to g6. In this tower every guard trip takes 3 game minutes.

- Tuesday 09:00: the roll returns 0. There are 40 candidate units; the draws pick an office on level 9 and column 180. The dialog asks for $200,000.
- 09:05: the player answers `refuse`. The search starts. g1 is on -1 at distance 0 and starts searching -1 at once. g2 to g6 take 2, 3, 4, 5 and 6 (distances 2 to 6 from -1) and arrive at 09:08.
- 09:21: g1 finishes -1 and takes 7, the nearest free level. It arrives at 09:24.
- 09:24: g2 to g6 finish 2 to 6. In person id order: g2 on 2 takes 8, g3 on 3 takes 9, g4 on 4 takes 10, g5 on 5 takes 11, g6 on 6 takes 12. They arrive at 09:27.
- 09:43: g3 finishes level 9, the bomb level. The bomb is found, `news.bombFound`, and all guards go back to -1. The security lock lasted from 09:00 to 09:43.

With 160-column floors (40 minutes each) the same office would check about 25 levels by 13:00 with these 3-minute trips.

### 13.2 A bomb that explodes

The same threat in a 4-star tower whose bomb is on level 58 at column 10, with guards that cannot reach level 58 before 13:00. The box is columns 0 to 29 (the cut leaves 30 columns), levels 56 to 61. An office at columns 25 to 33 on level 60 has its cells 25 to 29 in the box: the whole office is destroyed and its 9 cells become ruins, its 6 workers are removed, and the lease ends with no refund. A shaft at columns 4 to 7 crossing those levels keeps running. Population drops at once.

### 13.3 A fire put out by security

A 3-star tower, Wednesday 15:00. The fire roll succeeds; the origin is column 150 on level 40, whose structure runs from 100 to 259. One security office is on level 20; all 6 guards are sent to level 40 and arrive at 15:07:30.

- Ticks 15:01 to 15:07: both fronts move one column each tick. At 15:07 the burned span is 143 to 157.
- 15:07:30: the guards arrive. In person id order they join the left, right, left, right, left and right fronts: 3 guards each.
- 15:08: progress 3 on each front, both move: span 142 to 158.
- 15:09 and 15:10: progress 6 and 9, both move: span 140 to 160.
- 15:11: progress 12. Both fronts are out and do not move.

The level is out at 15:11 after 21 columns burned, before the 15:30 climb. The fire ends; the open decision closes with `burn` at no cost, and only `news.fireOut` is shown. Every unit that had a cell in columns 140 to 160 on level 40 is ruins.

### 13.4 A fire with no security

The same fire in a tower with no security office and no answer to the dialog. On level 40 the left front reaches 100 at 15:50 and is out at 15:51, when column 99 has no structure. The right front reaches 259 at 16:49 and is out at 16:50. Level 40 burned for 30 minutes at 15:30 and lit level 41 at column 150. Level 41 lights 42 at 16:00, and so on each half hour: levels 40 to 47 ignite by 18:30, if they all have structure at the ignition column. At 19:00 every level still burning goes out. The player has to demolish the ruins on 8 levels.

### 13.5 The VIP

The tower has 3 stars, no flag, 2 clean free suites, units 31 and 44. Thursday 00:00: it is the 4th roll since the last VIP day (`vipDryDays` 3), so the chance is 8 + 4 x 3 = 20%, and the roll succeeds; `vipDryDays` goes to 0. At 12:00 the VIP books suite 31, the lower id. The VIP arrives at 18:12 and makes 4 trips with stress 8, 6, 6 and 12 game minutes: arrival, to the restaurant, back to the suite, and out on Friday at 09:20. Average 8, under 15: approved, the flag is set. If the trip out had taken 40 minutes because of a crowded elevator, the average would be exactly 15, which is not under 15: rejected.

### 13.6 Treasure

A floor command lays columns 100 to 140 on S3. S3 has not given treasure. The draw returns 0: $50,000 goes to `events` and S3 is marked. A later command on S3 makes no draw. A unit command whose new cells are on S4 and S5 rolls for S5, the deeper one; if S5 has already given treasure it rolls for S4.

### 13.7 Vertical slice: the forced bomb threat

The TM-217 scenario forces one event: a bomb threat on day 13, the last Sunday of the 14-day run, at 09:00, step 115,560 (13 x 8,640 + 9 x 360). The tower is the 10-floor office tower of stars 8.6, at 2 stars since the first weekday check. The bomb threat is the only event that exists at 2 stars: fire and the VIP need 3, there is no basement for treasure and the date is not 24 December.

- Step 115,560: the forced threat opens without the 1 in 60 roll. The candidate and column draws of 4.2 are made as usual. The ransom is $200,000. The engine emits `decisionOpened` with kind `bomb`, `deadlineStep` 115,920 (10:00) and options `pay`, `refuse`, and the alert notice `news.bombThreat`. The client opens the `bomb` dialog (ui.md 9.1) with "Pagar $200.000" and "No pagar", shows the notice in red in the news line and plays the bomb alarm.
- The scenario sends no answer. At step 115,920 the decision closes with `refuse`: `decisionClosed` and `news.decisionDefault` are emitted, then `news.bombSearch`.
- The tower has no security office, so no guard searches. At 13:00 (step 117,000) the bomb explodes: `disaster` with kind `bomb`, `news.bombExploded` with the bomb level, and the units with a cell in the blast box become ruins (4.5).

The natural 09:00 roll is off in the scenario for days 0 to 12, so the forced threat is the only event. Rent charged on Monday of day 0 and day 7 is not affected, and the run ends on day 14 before the next Monday charge.

## 14. GDD Eventos coverage

| GDD | Section | Status |
|---|---|---|
| Decisions have an in-game deadline; default: no ransom, no helicopter | 3 | Kept; 1 game hour per decision |
| Bomb at 2+ stars, about every 60 days | 4.1 | Kept, 1 in 60 per day at 09:00 |
| Ransom $200,000 / $300,000 / $1,000,000 | 4.2 | Kept |
| Security searches if not paid | 4.4 | Defined: guards, 1 minute per 4 columns |
| Explodes if not found before 13:00 | 4.5 | Kept |
| Block 40 wide, 2 floors below to 3 above | 4.5 | Kept; transport survives |
| No security built during the event | 4.2 | Kept (construction C-57) |
| Fire at 3+ stars, about every 84 days, floors of 32+ tiles | 5.1 | Kept, 1 in 84 per day at 15:00 |
| Helicopter $500,000 or let it burn | 5.3 | Kept |
| Spreads along the floor and upward; security contains it | 5.4 to 5.7 | Defined |
| Burned area cleared by demolishing | 5.8 | Kept (construction C-71) |
| VIP at 3 stars, about every 9 days, stays in a suite | 6 | Kept at 3 stars; the daily chance rises from 8% so the mean gap is about 5 days (6.1) |
| VIP approves with low stress; needed for 4 stars | 6.3 | Defined: under 15 minutes |
| Treasure when building basements, low chance, cash bonus | 7 | Defined: 1 in 40, once per level |
| Cockroaches | | TM-16 |
| News by unit state | | TM-17 |
| Papá Noel on 24 December at night, cosmetic | 8 | Defined: 22:00 |

## 15. Constants for `packages/shared`

| Constant | Value |
|---|---|
| `DECISION_DEADLINE_STEPS` | 360 |
| `BOMB_DAILY_ODDS` | 60 (1 in 60) |
| `BOMB_MIN_STARS` | 2 |
| `BOMB_ROLL_TIME` | 09:00 |
| `BOMB_EXPLODE_TIME` | 13:00 |
| `BOMB_RANSOM` | 2 stars $200,000; 3 stars $300,000; 4 stars and up $1,000,000 |
| `BOMB_BLAST_COLUMNS_LEFT` / `RIGHT` | 20 / 19 (40 columns with the bomb column) |
| `BOMB_BLAST_LEVELS_BELOW` / `ABOVE` | 2 / 3 |
| `SEARCH_COLUMNS_PER_MINUTE` | 4 |
| `FIRE_DAILY_ODDS` | 84 |
| `FIRE_MIN_STARS` | 3 |
| `FIRE_ROLL_TIME` | 15:00 |
| `FIRE_MIN_FLOOR_COLUMNS` | 32 |
| `FIRE_SPREAD_STEPS` | 6 |
| `FIRE_CLIMB_STEPS` | 180 |
| `FIRE_FRONT_CONTAINMENT` | 10 guard-minutes |
| `FIRE_MAX_STEPS` | 1,440 (ends 19:00) |
| `HELICOPTER_COST` | $500,000 |
| `VIP_BASE_PERCENT` | 8 |
| `VIP_STEP_PERCENT` | 4 (added for each roll since the last VIP day) |
| `VIP_GUARANTEE_DAY` | 21 (the roll on this day always succeeds) |
| `VIP_STARS` | 3 |
| `VIP_MAX_STRESS_MINUTES` | 15 (approved when under) |
| `TREASURE_ODDS` | 40 |
| `TREASURE_AMOUNT` | S1-S3 $50,000; S4-S6 $100,000; S7-S9 $200,000 |
| `SANTA_TIME` | 24 December 22:00 |

## 16. Rules

### Decisions

EV-01. A decision opens with id `e{n}`, options in dialog order with the default last, and `deadlineStep = openStep + 360`. The engine emits `decisionOpened`.

EV-02. `answerEvent` is checked in the order `UNKNOWN_ENTITY`, `EVENT_EXPIRED`, `INVALID_CHOICE`. An answer applied at or after `deadlineStep`, or to one of the last 20 closed decisions, fails with `EVENT_EXPIRED`. Any other id that is not open fails with `UNKNOWN_ENTITY`.

EV-03. An accepted answer closes the decision at once and emits `decisionClosed` with the choice. A decision is answered at most once.

EV-04. At `deadlineStep` an open decision closes with its default and emits `decisionClosed` and `news.decisionDefault`. A decision whose disaster ends first closes with its default at that step, at no cost, without `news.decisionDefault`.

EV-05. `pay` and `helicopter` are accepted at any balance, including a negative one, and are charged to `events`.

EV-06. At most one bomb threat or fire is active at a time. A VIP visit can overlap either.

### Bomb threat

EV-07. At 09:00 daily, with 2 stars or more, no disaster active and at least one unit that is not a lobby or the cathedral, the engine rolls 1 in 60. Otherwise it makes no draw.

EV-08. On success it draws a candidate unit in increasing unit id, then a column of that unit; the bomb is on that column of the unit's bottom level and never moves.

EV-09. The ransom is $200,000 at 2 stars, $300,000 at 3 and $1,000,000 at 4, 5 or Torre, fixed when the threat opens. The deadline is 10:00 and the default is `refuse`.

EV-10. From the threat's start to its end, placing a security office fails with `BOMB_EVENT_ACTIVE`.

EV-11. `pay` charges the ransom and ends the threat at once.

EV-12. On `refuse` or at 10:00, the search starts with `news.bombSearch`. The search list is every level from -9 to 100 with a unit other than a lobby at that moment, plus the bomb level in every case.

EV-13. Each guard of every security office, in increasing person id, takes the unsearched, untaken level nearest in dense level index, the higher level on a tie, skipping levels it found unreachable, and travels to its leftmost structure column.

EV-14. A guard with no route to its level releases it, marks it unreachable for itself only and picks again in the same step. A guard with nothing to pick goes back to its office.

EV-15. A level search lasts `6 × max(1, ceil(c / 4))` steps from arrival, with `c` the level's structure columns at that moment. When the bomb level's search ends before 13:00, the bomb is found and the threat ends.

EV-16. At 13:00 an unfound bomb explodes. The box is columns `bx - 20` to `bx + 19` and levels `bl - 2` to `bl + 3` in level order, cut to the site, never including level 1, level 101 or the cathedral.

EV-17. Every unit with a cell in the box is destroyed and all its cells become ruins; every other cell in the box with structure and no occupant becomes ruins. Stairs, escalators, shafts and cars are not damaged.

EV-18. A unit destroyed by an event has the effects of demolition except that nothing is refunded and a sold condo is not bought back. Population is recounted at once.

EV-19. When a threat ends, the lock ends and every guard away from the office goes back to it.

### Fire

EV-20. At 15:00 daily, with 3 stars or more, no disaster active, no wedding attempt that day and at least one non-lobby unit whose bottom level is from 2 to 100 with 32 or more structure columns, the engine rolls 1 in 84. Otherwise it makes no draw.

EV-21. On success it draws a candidate unit and a column as in EV-08; that column of the unit's bottom level ignites. The deadline is 16:00 and the default is `burn`.

EV-22. `helicopter` charges $500,000 and puts every burning level out at once. Burned cells stay ruins.

EV-23. A level that ignites at column `c` at step `s` has two fronts at `c`. At every `s + 6k`, left front first, each front not out adds its fighting guards to its progress and is out at 10 or more; otherwise it moves 1 column away from `c`, and is out instead if that column is off the site or has no structure.

EV-24. A burning cell destroys the unit on it (EV-18) and turns all that unit's cells to ruins, turns an empty structure cell to ruins, and leaves stairs, escalators, shafts and cars as they are.

EV-25. At `s + 180`, a level that is not out lights the level above, if that level is 100 or lower and has not burned in this fire, at the column of the burned span nearest `c` with structure above, the lower on a tie. Fire never moves down and never burns level 1 or the cathedral.

EV-26. When the fire starts and whenever a level ignites or goes out, each guard without a target, in increasing person id, takes the burning level with the fewest guards, the higher on a tie, and travels to its ignition column.

EV-27. On arrival a guard joins the front of its level with fewer guards, the left on a tie, and counts from the first tick after its arrival step. A guard whose front goes out joins the other front of the level if it is burning, or else picks again. A guard travelling to a level that goes out stops and picks again in the same step.

EV-28. The fire ends when every level is out, when the helicopter is called, or at 19:00. Then guards go back to their offices.

### VIP

EV-29. At 00:00 daily, at exactly 3 stars with no VIP visit in progress, the engine rolls with chance `VIP_BASE_PERCENT + VIP_STEP_PERCENT x vipDryDays` percent, and 100% when `vipDryDays + 1 >= VIP_GUARANTEE_DAY`. On success the day is a VIP day for people.md 9.

EV-29a. `vipDryDays` starts at 0, goes up by 1 on each failed roll and goes back to 0 on a successful roll. It does not change on days with no roll. A failed or rejected visit does not undo the reset.

EV-30. With no clean free suite at 12:00, the visit fails with `news.vipNoSuite` and the flag does not change.

EV-31. The visit is approved when the VIP leaves through an entrance with an average trip stress under 15 game minutes. Any other end is a rejection.

EV-32. An approved visit that started at 3 stars sets the VIP approval flag. A rejection never clears it.

### Treasure and Papá Noel

EV-33. A successful construction command with new basement cells rolls 1 in 40 for the deepest of those levels that has not given treasure. With none left, no draw.

EV-34. Treasure pays $50,000 on S1 to S3, $100,000 on S4 to S6 and $200,000 on S7 to S9 into `events`, up to the cap, and marks the level. Each basement level gives treasure at most once per tower.

EV-35. At 22:00 on 24 December the engine emits `news.santa`, with no draw and no other effect.

### Order

EV-36. Event work runs in the events phase after people's step events and before people with something due, in the order of section 10. Answers and treasure rolls happen when the command is applied.

EV-37. Event draws use the tower RNG only, in the order of section 10. The same seed, commands and tower give the same events, bomb cells, fire spread and outcomes.

### Vertical slice

EV-38. The TM-217 scenario forces one bomb threat at 09:00 of day 13, step 115,560. The forced threat skips the 1 in 60 roll and keeps the rest of 4.1 (2 stars or more, no disaster active, a candidate unit) and all draws of 4.2. If the rating is below 2 at that step, no threat opens and the scenario fails.

EV-39. The natural bomb roll is off for days 0 to 12 of the scenario. No other event can happen in it.

EV-40. The scenario sends no `answerEvent`. The decision opened at step 115,560 with deadline step 115,920 closes at that step with `refuse`.

EV-41. The scenario expects, in this order: `decisionOpened` (kind `bomb`, ransom $200,000) and `news.bombThreat` at step 115,560; `decisionClosed` with `refuse`, `news.decisionDefault` and `news.bombSearch` at step 115,920; `disaster` (kind `bomb`) and `news.bombExploded` at step 117,000.
