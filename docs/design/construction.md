# Construction and placement rules

Version 1.0, 9 November 2026. Owner: Game Designer. Task TM-8.

This document defines where things can be built, what they cost at placement, what can be demolished and what demolition returns. Values come from `docs/GDD.md` (sections Torre, Unidades y desbloqueos, Economía). Where the GDD leaves a point open, the decision is marked "Design call" with a short reason. The numbered rules at the end are the contract for the engine (`packages/engine`) and for QA. Every rule names the error code the engine returns when a command breaks it.

Prices, rents and upkeep are covered by the economy spec (TM-9). Elevator stop settings and dispatch are covered by TM-12. Bomb, fire and treasure events are covered by TM-15. This document only covers the parts of those systems that affect placement and demolition.

## 1. Grid model

The site is a grid of cells. A cell is addressed by column and level.

Columns run from 0 to 374, left to right. That is 375 columns, the site width from the GDD.

Levels are numbered like the floors the player sees. There is no level 0.

| Level | Name in the UI | Use |
|---|---|---|
| 101 to 104 | Catedral | Cathedral only (see 6.6) |
| 2 to 100 | Pisos 2 a 100 | Regular floors |
| 1 | Lobby principal | Main lobby only |
| -1 to -9 | S1 to S9 | Basements |
| -10 | S10 | Subway tunnel, never buildable |

"The level above" level -1 is level 1, and "the level below" level 1 is level -1. All rules that talk about adjacent levels use this order.

Each cell holds two independent things:

- Structure: none, floor, or lobby. A unit's cells also count as structure (see 2.3).
- Occupant: nothing, a unit, a stair or escalator footprint, a stair or escalator landing, an elevator shaft, or ruins left by an event.
- Layers: a cell has two layers. The back layer holds units, lobby rows and ruins. The front layer holds stairs, escalators (footprint and landing) and elevator shafts. Things of one layer never share a cell, so two stairs cannot overlap and a stair cannot go over a shaft. A front layer thing can go over a back layer thing, so stairs, escalators and shafts can be placed on top of units.

A cell is "empty floor" when its structure is floor or lobby and it has no occupant.

People never block construction. If a unit is placed on cells where people are walking or queueing, those people re-plan their trip from where they stand.

## 2. Structure and support

### 2.1 Support

A cell above ground (levels 2 to 104) is supported when the cell directly below it has structure. Every cell on level 1 is supported by the ground.

A basement cell (levels -1 to -9) is supported when the cell directly above it has structure. Basements hang from the floor above, so the basement under a column can only exist if level 1 has structure in that column.

Floor 1 only accepts lobby (rule C-07), so the main lobby's column range bounds every floor above it and every basement below it. That is how "the main lobby width limits the width of the floors above" is enforced. No separate width check is needed.

Support is checked only when something is placed or demolished. Nothing ever collapses during the simulation. If an event destroys cells (bomb, fire), whatever was above stays where it is.

### 2.2 Floor tool

The floor tool lays a horizontal run of floor cells on one level, from column `x0` to `x1`. Each new floor cell costs $500.

- Cells that already have structure are skipped and not charged.
- The run must add at least one cell.
- Every new cell must be supported. Cells in the run can support each other only vertically, never sideways.
- Floor 1 rejects the floor tool. Use the lobby tool there.
- Level 101 accepts floor cells (they let people walk to the cathedral). Levels 102 to 104 do not.
- Level -10 rejects everything.

### 2.3 Units and automatic floor

A unit has a width `w` and a height `h` in levels, and is placed by its bottom-left cell `(x, L)`. It occupies columns `x` to `x + w - 1` and levels `L` up to `L + h - 1`, following the level order of section 1.

A unit cannot span the ground line: all its levels are above ground, or all are basements.

Support for a unit:

- Above ground: every cell directly below its bottom row has structure.
- In a basement: every cell directly above its top row has structure.

Design call: the bottom row of a unit does not need to have floor already. Any bottom-row cell without structure gets floor automatically, charged at $500 per cell on top of the unit price. The player does not have to lay floor first, but still pays for it. The unit's upper rows need no floor and are not charged.

All cells of the footprint must have no occupant and must not be lobby.

When a unit is removed for any reason, every cell it occupied keeps (or gets) floor structure. Removing a unit therefore never leaves anything unsupported.

### 2.4 Atomic commands

Every construction command is all or nothing. If any check fails, nothing is built and nothing is charged. When several rules fail, the engine returns the code of the first failing check in the order given in section 9.

## 3. Lobbies

There are two kinds of lobby: the main lobby on floor 1 and sky lobbies.

### 3.1 Placement

The lobby tool lays a run of columns `x0` to `x1` on one level with a height `h` of 1, 2 or 3. Each column of lobby occupies `h` cells, from the chosen level upward.

- Main lobby: level 1 only.
- Sky lobbies: levels 15, 30, 45, 60, 75 and 90 only. A sky lobby of height 3 on level 90 occupies 90, 91 and 92.
- Any other level is rejected.

Cost: $5,000 per lobby cell, so a run of `n` new columns at height `h` costs `5,000 × n × h`. Design call: the GDD prices lobby "per casillero", and a taller lobby covers more cells, so it costs more. Lobby includes its own structure; no floor charge is added. Converting existing empty floor to lobby charges the full lobby price and gives nothing back for the floor.

All cells the new lobby columns would cover must have no occupant. Columns that are already lobby on that level are skipped and not charged. The run must add at least one column.

Support: the bottom row follows the unit support rule of 2.3. The main lobby is always supported by the ground.

### 3.2 One height per lobby level

Design call: all lobby columns on the same lobby level share one height. The first lobby column placed on that level sets it, and every later run on that level must use the same height. A run with a different height is rejected. This keeps boarding stress (TM-13) a property of the level, not of each column.

For the main lobby the height is final, because the main lobby cannot be demolished. The lobby tool in the UI must show the chosen height clearly before the first click.

### 3.3 Main lobby shape

The main lobby is one contiguous run of columns. The first run can go anywhere on level 1. Every later run must touch or overlap the existing main lobby, so the result stays contiguous.

Sky lobbies can have several separate runs on the same level.

### 3.4 Walking in a tall lobby

Every row of a lobby is walkable, as a mezzanine. Stairs and escalators can connect the rows of a tall lobby with each other and with the floor above it. Elevators may stop on any row of a lobby, subject to the express stop rule in 5.4.

### 3.5 Other units on lobby levels

Floor 1 holds only lobby. Units cannot be placed on level 1 at all.

Sky lobby levels are regular floors outside the lobby columns. Any above-ground unit can be placed on their empty floor.

## 4. Unit catalog for placement

All units are placed at the normal price level. The player changes the price later from the inspection window.

| Unit | Width x levels | Price | Stars | Zone | Limit group |
|---|---|---|---|---|---|
| Office | 9 x 1 | $40,000 | 1 | above ground | |
| Condo | 16 x 1 | $80,000 | 1 | above ground | |
| Fast food | 16 x 1 | $100,000 | 1 | any | commercial |
| Single room | 4 x 1 | $20,000 | 2 | above ground | |
| Double room | 6 x 1 | $50,000 | 2 | above ground | |
| Suite | 10 x 1 | $150,000 | 2 | above ground | |
| Housekeeping | 15 x 1 | $50,000 | 2 | any | |
| Security | 16 x 1 | $100,000 | 2 | any | security |
| Restaurant | 24 x 1 | $200,000 | 3 | any | commercial |
| Retail shop | 12 x 1 | $100,000 | 3 | any | commercial |
| Cinema | 31 x 2 | $500,000 | 3 | any | entertainment |
| Party hall | 24 x 2 | $100,000 | 3 | any | entertainment |
| Medical center | 26 x 1 | $500,000 | 3 | any | medical |
| Parking ramp | 16 x 1 | $50,000 | 3 | basement only | |
| Parking space | 4 x 1 | $3,000 | 3 | basement only | parking |
| Recycling center | 25 x 2 | $500,000 | 3 | basement only | |
| Subway station | 30 x 3 | $3,000,000 | 4 | lowest basement | subway |
| Cathedral | 28 x 4 | $35,000,000 | 5 | level 101 | cathedral |

"Above ground" means levels 2 to 100, and the unit's top row must also be at level 100 or lower. "Any" means levels 2 to 100 or -1 to -9. "Stars" is the star rating the tower needs before the unit can be built.

Design call on zones: the GDD only restricts the four basement units. Offices, condos and hotel rooms are kept above ground because their occupants live or work there all day, and SimTower players report offices as above-ground only. Commercial, entertainment and service units can go in basements, which is how shopping levels under the lobby are usually built.

Transport, floor and lobby are not in this table. Their rules are in sections 2, 3 and 5.

## 5. Transport

### 5.1 Stairs and escalators

| Type | Width | Links | Price | Stars |
|---|---|---|---|---|
| Stairs | 8 | level L to the level above | $5,000 | 1 |
| Escalator | 8 | level L to the level above | $20,000 | 1 |

A stair or escalator is placed by its left column `x` and its lower level `L`. Call the level above `U`.

- Footprint: the 8 cells on level L. They must have structure and no other front layer occupant (no stair footprint, no shaft). Units, lobby rows and ruins in those cells stay where they are.
- Landing: the 8 cells on level U in the same columns. Each must have structure (floor or lobby) and no front layer occupant except the footprint of another stair or escalator. A unit under the landing stays. Landings let people step off, and stacked stairs in the same columns are allowed.
- No automatic floor. The player lays floor first.
- After placement, the landing cells are reserved in the front layer. Shafts and other stairs cannot use them, and no unit can be built there.
- L can be -1, linking S1 with floor 1. L cannot be -10 or 104.

### 5.2 Escalator floor types

An escalator is only allowed when both of its levels (L and U) are escalator floors. A level is an escalator floor when every unit on that level is one of: lobby, fast food, restaurant, retail shop, cinema, party hall, single room. Empty floor does not matter. A level with any office, condo, double room, suite, housekeeping, security, medical center, parking, recycling, subway or cathedral cell is not an escalator floor.

The rule works both ways. After an escalator exists, a unit of a type outside that list cannot be placed on either of its levels.

Design call: GDD lists "lobby, commerce, entertainment or single rooms". Fast food and restaurant count as commerce, cinema and party hall as entertainment.

### 5.3 Elevator shafts

| Type | Shaft width | Shaft price | Car price | Max span | Stars |
|---|---|---|---|---|---|
| Standard | 4 | $200,000 | $80,000 | 30 levels | 1 |
| Service | 4 | $100,000 | $50,000 | 30 levels | 2 |
| Express | 6 | $600,000 | $250,000 | no limit | 3 |

A shaft is placed by its left column `x`, a bottom level `B` and a top level `T`. Placing a shaft creates it with 1 car, so the first payment is shaft price plus one car price. Its span is the number of levels from B to T inclusive, counted in the order of section 1 (so -9 to 21 is 30 levels).

- Every cell of the shaft, on every level from B to T, must have structure and no front layer occupant (no stair, escalator or other shaft). Lobby cells count as floor, and units in those cells stay: the shaft passes over them. No automatic floor.
- Levels allowed: -9 to 101. A shaft can reach level 101 to serve the cathedral. Express shafts are further limited by 5.4.
- Standard and service shafts span at most 30 levels.
- A shaft holds 1 to 8 cars. Adding a car costs the car price. The last car cannot be removed; demolish the shaft instead.
- Extending or trimming a shaft re-runs every check of this section on the new range. Extending is free. Trimming fails if a car with riders is on a removed level.

### 5.4 Express stops

Express elevators stop only at levels -9 to -1, 1, 15, 30, 45, 60, 75 and 90. Both ends of an express shaft (B and T) must be one of those levels. The stop settings (TM-12) can never enable any other level on an express shaft.

### 5.5 Shaft spacing

Design call: two shafts whose level ranges share at least one level must have at least 8 columns between them. With shafts at `x1 < x2` and the left one `w1` wide, the gap is `x2 - (x1 + w1)`, and it must be 8 or more. The gap is room for the up queue on the left of one shaft and the down queue on the right of the other. The gap columns can hold anything except another shaft. Shafts whose ranges do not share a level have no spacing rule.

The service elevator is only used by housekeeping staff. That is a routing rule (TM-11), not a placement rule.

## 6. Basement and special units

### 6.1 Basement-only units

Parking ramps, parking spaces, recycling centers and the subway station can only be placed on levels -1 to -9.

### 6.2 Parking ramp

Design call, adapting "the ramp takes a single column": all ramps form one vertical stack at the same column `x`, starting at S1 and going down with no gaps.

- The first ramp must be on level -1, at any column.
- Every later ramp must use the same column `x` and go on the level directly below the lowest existing ramp.
- At most 9 ramps, one per basement level.
- Only the lowest ramp of the stack can be demolished. This keeps the stack connected to the street.

### 6.3 Parking spaces

A parking space can only be placed on a level that has a ramp, and it must touch the ramp or a connected parking space on the same level, side by side (its left edge next to the other's right edge, or the reverse). Spaces connect only horizontally, on their own level.

A space is "connected" when a chain of side-by-side spaces links it to the ramp on its level. Only connected spaces count as available parking. If a demolition breaks a chain, the spaces cut off stay in place, stop counting as parking, and show a red cross in the UI. Placing new spaces that bridge the gap reconnects them.

### 6.4 Recycling center

The first recycling center can go on any basement level. Every later one must be adjacent to an existing recycling center. Two footprints are adjacent when they do not overlap and either:

- they share at least one level and the right edge of one is directly next to the left edge of the other, or
- they share at least one column and the top row of one is directly below the bottom row of the other, in level order.

If every recycling center is demolished, the next one is "the first" again.

### 6.5 Subway station

One per tower. The station is 30 x 3 and its bottom row must be on S9 (level -9), so it occupies S9, S8 and S7. Support comes from the 30 cells on S6 directly above its top row. The S10 tunnel is drawn automatically across the whole site and nothing can be placed on S10.

### 6.6 Cathedral

One per tower. The cathedral is 28 x 4, its bottom row must be on level 101, and it occupies levels 101 to 104. The 28 cells of floor 100 below it must all have structure.

Design call: the GDD puts the cathedral "above floor 100". Level 101 also accepts floor, stairs, escalators and the top stop of elevator shafts, so guests can arrive next to the cathedral and walk in. Levels 102 to 104 accept only the cathedral. Express elevators cannot reach 101, so the wedding route needs an express to a sky lobby and a standard elevator for the last stretch, as in SimTower.

## 7. Limits per tower

| Limit group | Counts | Maximum |
|---|---|---|
| Elevator shafts | standard, service and express shafts | 24 |
| Cars per shaft | cars in one shaft | 8 |
| Stairs and escalators | stairs plus escalators | 64 |
| Security | security offices | 10 |
| Medical | medical centers | 10 |
| Entertainment | cinemas plus party halls | 16 |
| Commercial | fast food plus restaurants plus retail shops | 512 |
| Parking | parking spaces | 512 |
| Subway | subway stations | 1 |
| Cathedral | cathedrals | 1 |

Ramps are limited to 9 by rule 6.2. Demolishing a unit frees its slot at once.

## 8. Money and demolition

### 8.1 Paying for construction

Construction is instant and paid in full at placement. The total cost of a command is the unit or tool price plus any automatic floor.

- When the balance is below $0, every construction command is rejected, including adding elevator cars and extending shafts. Demolition, price changes and elevator settings still work.
- When the balance is $0 or more but lower than the total cost, the command is rejected. Construction never makes the balance negative.

### 8.2 Event locks

While a bomb threat is active (TM-15), security offices cannot be placed. TM-15 may add other event locks with their own codes.

### 8.3 What can be demolished

The bulldozer removes one thing per command: a unit, a lobby run, a stair or escalator, a shaft, an elevator car, a run of floor cells, or ruins. Demolition costs nothing.

- The main lobby can never be demolished, in whole or in part.
- Sky lobby columns can be demolished. Their cells become floor, so nothing loses support. Transport on them stays.
- A floor cell can be demolished only when it has no occupant and is not a stair landing, and when nothing depends on it for support: above ground, the cell above has no structure; in a basement, the cell below has no structure. So a tower is taken down from the top, and basements from the bottom up.
- A shaft can be demolished, or a car removed, only when no car involved has riders. People waiting in the shaft's queues re-plan their trip.
- Parking ramps follow rule 6.2 (lowest first).
- Infested hotel rooms and ruins can always be demolished; that is how they are cleared.

### 8.4 Refund policy

Design call: demolition refunds nothing, with one exception for mistakes. The game runs in real time with no pause, so a misplaced unit has to be fixable for free, but demolition must not become a way to make money.

The refund is 100% of the price paid for that object (including its automatic floor) when both hold:

- less than 1 game hour has passed since it was placed (360 engine steps, 37.5 real seconds), and
- it has never been used: no lease signed, no condo sold, no hotel check-in, no customer, audience member or party guest has entered it.

Otherwise the refund is $0. Transport, floor, lobby and service units have no "use" condition and only need the time window. Each elevator car is judged on its own placement time. A refund cannot push the balance above the $99,999,999 cap; the excess is lost.

### 8.5 What happens to occupants

When a unit is demolished:

- Office or retail tenant: the lease ends at once. Rent already paid for the current week stays with the player. Nothing more is charged or refunded.
- Sold condo: the player pays the sale price back to the owners, the same as when owners leave after a poor evaluation. This charge can make the balance negative. It stops the "build, sell, demolish" profit.
- Hotel room with guests: the stay ends at once. Nights already paid stay with the player. If the guest was the VIP, the visit counts as not approved.
- Fast food, restaurant, cinema or party hall: no payout for that day.
- Cathedral during a wedding attempt: the attempt fails.
- Residents, workers and guests whose home or workplace was the unit are removed from the tower at once, wherever they are, including queues.
- Visitors inside the unit (customers, audience, party guests) end their visit and plan a trip home from that level.
- Housekeeping: its staff are removed. Rooms waiting for cleaning stay dirty.
- Parking space: anyone assigned to it loses the space.
- People on a demolished stair or escalator arrive at their destination level at once.

Population is recounted at once after any demolition.

### 8.6 Treasure

Each construction command that creates at least one new basement cell (floor, or the automatic floor of a unit) makes one treasure roll. Chance and amount are defined in TM-15.

## 9. Check order

The engine validates a construction command in this order and returns the first failing code:

0. `INVALID_COMMAND` (schema: unknown type, bad height, x1 below x0, top below bottom)
1. `NEGATIVE_BALANCE`
2. `STAR_LOCKED`
3. `BOMB_EVENT_ACTIVE`
4. `LIMIT_REACHED`, `CAR_LIMIT`
5. `OUT_OF_BOUNDS`, `LEVEL_RESERVED`
6. Level and zone codes: `LOBBY_LEVEL_ONLY`, `LOBBY_FLOOR_NOT_ALLOWED`, `ABOVE_GROUND_ONLY`, `BASEMENT_ONLY`, `CATHEDRAL_LEVEL_ONLY`, `SUBWAY_POSITION`, `CATHEDRAL_POSITION`, `SPANS_GROUND`, `EXPRESS_STOP_NOT_ALLOWED`
7. `CELL_OCCUPIED`, `NOTHING_TO_BUILD`
8. `NO_SUPPORT`, `NO_FLOOR`, `TRANSPORT_LANDING`
9. Type rules: `LOBBY_HEIGHT_MISMATCH`, `LOBBY_NOT_CONTIGUOUS`, `ESCALATOR_FLOOR_TYPE`, `SHAFT_TOO_TALL`, `SHAFT_TOO_CLOSE`, `RAMP_POSITION`, `PARKING_NOT_CONNECTED`, `RECYCLING_NOT_ADJACENT`
10. `INSUFFICIENT_FUNDS`

Demolition is checked in this order: `NOTHING_TO_DEMOLISH`, `MAIN_LOBBY_PROTECTED`, `CELL_OCCUPIED`, `SUPPORTS_STRUCTURE`, `RAMP_POSITION`, `SHAFT_IN_USE`, `LAST_CAR`.

## 10. Error codes and UI messages

| Code | Message in the UI |
|---|---|
| `INVALID_COMMAND` | Orden inválida. |
| `NEGATIVE_BALANCE` | No se puede construir con saldo negativo. |
| `INSUFFICIENT_FUNDS` | No alcanza el dinero. |
| `STAR_LOCKED` | Hacen falta más estrellas. |
| `BOMB_EVENT_ACTIVE` | No se puede construir seguridad durante una amenaza de bomba. |
| `LIMIT_REACHED` | La torre ya tiene el máximo de esta unidad. |
| `CAR_LIMIT` | El hueco ya tiene 8 cabinas. |
| `LAST_CAR` | El hueco necesita al menos una cabina. |
| `OUT_OF_BOUNDS` | Fuera del terreno. |
| `LEVEL_RESERVED` | El S10 es para el túnel del subte. |
| `LOBBY_LEVEL_ONLY` | En el piso 1 solo va el lobby. |
| `LOBBY_FLOOR_NOT_ALLOWED` | El lobby va en el piso 1 o en los pisos 15, 30, 45, 60, 75 y 90. |
| `ABOVE_GROUND_ONLY` | Esta unidad va sobre tierra, entre los pisos 2 y 100. |
| `BASEMENT_ONLY` | Esta unidad va solo en subsuelos. |
| `CATHEDRAL_LEVEL_ONLY` | Arriba del piso 100 solo va la catedral. |
| `CATHEDRAL_POSITION` | La catedral va arriba del piso 100. |
| `SUBWAY_POSITION` | El subte va en el subsuelo más bajo. |
| `SPANS_GROUND` | No puede quedar mitad arriba y mitad abajo de tierra. |
| `EXPRESS_STOP_NOT_ALLOWED` | El expreso solo para en subsuelos, el piso 1 y los lobbies del cielo. |
| `CELL_OCCUPIED` | El lugar está ocupado. |
| `NOTHING_TO_BUILD` | Ya está construido. |
| `NO_SUPPORT` | No tiene dónde apoyarse. |
| `NO_FLOOR` | Primero hay que construir el piso. |
| `TRANSPORT_LANDING` | Falta piso libre arriba para llegar. |
| `LOBBY_HEIGHT_MISMATCH` | El lobby de este piso tiene otra altura. |
| `LOBBY_NOT_CONTIGUOUS` | El lobby principal tiene que ser continuo. |
| `ESCALATOR_FLOOR_TYPE` | La escalera mecánica solo va en pisos de lobby, comercio, entretenimiento o habitaciones simples. |
| `SHAFT_TOO_TALL` | Este ascensor cubre hasta 30 pisos. |
| `SHAFT_TOO_CLOSE` | Dejá 8 casilleros libres entre huecos de ascensor. |
| `RAMP_POSITION` | Las rampas van en una sola columna, desde el S1 hacia abajo. |
| `PARKING_NOT_CONNECTED` | La cochera tiene que conectarse a la rampa. |
| `RECYCLING_NOT_ADJACENT` | El reciclaje nuevo va pegado a otro. |
| `MAIN_LOBBY_PROTECTED` | El lobby principal no se puede demoler. |
| `SUPPORTS_STRUCTURE` | Hay algo apoyado acá. Demolé eso primero. |
| `SHAFT_IN_USE` | Hay gente viajando en el ascensor. |
| `NOTHING_TO_DEMOLISH` | No hay nada para demoler. |

The UI glossary (TM-18) sets the final wording; these texts follow it once it lands.

## 11. Rules

Each rule ends with the code the engine returns when a command breaks it. "Outcome" rules describe a result and have no rejection code; they are marked `none`.

### Grid and support

C-01. Columns 0 to 374 are valid. Any cell outside them is rejected. Error: `OUT_OF_BOUNDS`.

C-02. Levels -9 to 104 are valid, with no level 0. Level -10 rejects every command. Other levels outside -10 to 104 are rejected. Error: `LEVEL_RESERVED` for -10, `OUT_OF_BOUNDS` otherwise.

C-03. A new cell above ground needs structure in the cell below it; a level 1 cell is always supported. Error: `NO_SUPPORT`.

C-04. A new basement cell needs structure in the cell above it. Error: `NO_SUPPORT`.

C-05. A unit above ground needs structure under every cell of its bottom row; a unit in a basement needs structure above every cell of its top row. Error: `NO_SUPPORT`.

C-06. A unit cannot have levels both above and below ground. Error: `SPANS_GROUND`.

C-07. Level 1 accepts only lobby and transport. Floor tool and units are rejected there. Error: `LOBBY_LEVEL_ONLY`.

C-08. Levels 102 to 104 accept only the cathedral. Level 101 accepts only the cathedral, floor, stairs, escalators and shaft tops. Error: `CATHEDRAL_LEVEL_ONLY`.

C-09. The floor tool charges $500 per new cell, skips cells with structure, and must add at least one cell. Error: `NOTHING_TO_BUILD`.

C-10. A unit can only cover cells that have no occupant (stair landings count as occupied) and are not lobby. Error: `CELL_OCCUPIED`.

C-11. Bottom-row cells of a unit without structure get floor automatically at $500 each, added to the unit cost. Error: none.

C-12. A construction command either applies fully and charges the full cost, or changes nothing and charges nothing. Error: none (the first failing code from section 9 is returned).

C-13. Removing a unit or a sky lobby column leaves floor structure in every cell it covered. Error: none.

C-14. No structure ever falls during the simulation; support is checked only on construction and demolition. Error: none.

### Lobby

C-15. Lobby can only be placed on levels 1, 15, 30, 45, 60, 75 and 90. Error: `LOBBY_FLOOR_NOT_ALLOWED`.

C-16. Lobby height is 1, 2 or 3; each column covers that many cells upward from the lobby level. Any other height fails command validation. Error: `INVALID_COMMAND`.

C-17. Lobby costs $5,000 per cell (columns × height). Existing lobby columns on that level are skipped and not charged; the run must add at least one column. Error: `NOTHING_TO_BUILD`.

C-18. All lobby on one lobby level has the height set by its first column. Error: `LOBBY_HEIGHT_MISMATCH`.

C-19. After the first main lobby run, every main lobby run must touch or overlap the existing main lobby. Error: `LOBBY_NOT_CONTIGUOUS`.

C-20. Every cell a new lobby column covers must have no occupant. Error: `CELL_OCCUPIED`.

C-21. No part of the main lobby can be demolished. Error: `MAIN_LOBBY_PROTECTED`.

C-22. All rows of a lobby are walkable and can hold stair or escalator ends and elevator stops. Error: none.

### Units

C-23. Each unit has the width, height, price and star requirement listed in section 4. Placing a unit the tower's star rating does not unlock is rejected. Error: `STAR_LOCKED`.

C-24. Offices, condos, single rooms, double rooms and suites go on levels 2 to 100 only, with their top row at 100 or lower. Error: `ABOVE_GROUND_ONLY`.

C-25. Fast food, restaurant, retail shop, cinema, party hall, housekeeping, security and medical center go on levels 2 to 100 or -1 to -9. A footprint that touches level 1, level 101 or higher, or level -10 fails under C-07, C-08 or C-02. Error: `LOBBY_LEVEL_ONLY`, `CATHEDRAL_LEVEL_ONLY` or `LEVEL_RESERVED`.

C-26. Parking ramp, parking space, recycling center and subway station go on levels -1 to -9 only. Error: `BASEMENT_ONLY`.

C-27. Every unit is placed at the normal price level. Error: none.

### Stairs and escalators

C-28. Stairs ($5,000) and escalators ($20,000) are 8 wide and link level L with the level above. Their 8 cells on L must have structure (floor or lobby) and no stair, escalator or shaft; a unit there does not block them. Error: `NO_FLOOR` when a cell has no structure, `CELL_OCCUPIED` when a front layer occupant is there.

C-29. The 8 landing cells on the level above must have structure and no front layer occupant except another stair or escalator footprint; a unit does not block them. Error: `TRANSPORT_LANDING`.

C-30. An escalator needs both of its levels to be escalator floors (section 5.2). Error: `ESCALATOR_FLOOR_TYPE`.

C-31. A unit whose type is not allowed on escalator floors cannot be placed on a level that holds either end of an escalator. Error: `ESCALATOR_FLOOR_TYPE`.

C-32. Stairs plus escalators are at most 64 per tower. Error: `LIMIT_REACHED`.

### Elevators

C-33. Placing a shaft charges the shaft price plus one car. Standard is 4 wide ($200,000 + $80,000), service 4 wide ($100,000 + $50,000), express 6 wide ($600,000 + $250,000). Error: `INSUFFICIENT_FUNDS` if the balance is short.

C-34. Every shaft cell on every level from bottom to top must have structure. Error: `NO_FLOOR`.

C-35. Every shaft cell must have no stair, escalator or other shaft; units in the cell do not block it. Error: `CELL_OCCUPIED`.

C-36. Shafts span levels -9 to 101 at most. Error: `OUT_OF_BOUNDS`.

C-37. Standard and service shafts span at most 30 levels, counted without level 0. Error: `SHAFT_TOO_TALL`.

C-38. Both ends of an express shaft are in {-9..-1, 1, 15, 30, 45, 60, 75, 90}, and stop settings cannot enable any other level on it. Error: `EXPRESS_STOP_NOT_ALLOWED`.

C-39. Two shafts that share a level have at least 8 columns between them. Error: `SHAFT_TOO_CLOSE`.

C-40. A tower has at most 24 shafts of all types. Error: `LIMIT_REACHED`.

C-41. A shaft has at most 8 cars. Error: `CAR_LIMIT`.

C-42. A shaft keeps at least 1 car. Error: `LAST_CAR`.

C-43. Extending or trimming a shaft re-checks C-34 to C-39 on the new range. Extending is free. Error: the code of the failing rule.

C-44. A shaft cannot be demolished, trimmed past a car with riders, or lose a car that has riders. Error: `SHAFT_IN_USE`.

### Basement units

C-45. The first parking ramp goes on level -1. Every other ramp uses the same column and goes directly below the lowest ramp. Error: `RAMP_POSITION`.

C-46. Only the lowest ramp can be demolished. Error: `RAMP_POSITION`.

C-47. A parking space needs a ramp on its level and must sit side by side with the ramp or a connected space on that level. Error: `PARKING_NOT_CONNECTED`.

C-48. Spaces cut off from the ramp by a demolition stay, do not count as parking, and reconnect when a chain is rebuilt. Error: none.

C-49. A recycling center, unless none exist, must be adjacent to an existing one (section 6.4). Error: `RECYCLING_NOT_ADJACENT`.

C-50. The subway station's bottom row is on level -9 (it covers -9 to -7). Error: `SUBWAY_POSITION`.

C-51. The cathedral's bottom row is on level 101 (it covers 101 to 104) and the 28 cells of level 100 below it have structure. Error: `CATHEDRAL_POSITION` for the level, `NO_SUPPORT` for missing structure.

### Limits

C-52. Per tower: 10 security, 10 medical centers, 16 cinemas plus party halls, 512 fast food plus restaurants plus retail shops, 512 parking spaces, 1 subway station, 1 cathedral. Error: `LIMIT_REACHED`.

C-53. A demolished unit frees its limit slot at once. Error: none.

### Money and events

C-54. With a balance below $0, every construction command fails, including cars and shaft extensions. Error: `NEGATIVE_BALANCE`.

C-55. A construction command whose total cost is above the balance fails. Error: `INSUFFICIENT_FUNDS`.

C-56. Demolition, price changes and elevator settings work at any balance. Error: none.

C-57. Security cannot be placed while a bomb threat is active. Error: `BOMB_EVENT_ACTIVE`.

C-58. Each construction command that creates at least one new basement cell makes one treasure roll (TM-15). Error: none.

### Demolition

C-59. A demolish command aimed at a cell with nothing to remove fails. Error: `NOTHING_TO_DEMOLISH`.

C-60. A floor cell cannot be demolished while it has an occupant or is a stair landing. Error: `CELL_OCCUPIED`.

C-61. A floor cell cannot be demolished while something rests on it: above ground, the cell above has structure; in a basement, the cell below has structure. Error: `SUPPORTS_STRUCTURE`.

C-62. Demolition is free. The refund is 100% of what the object cost if it was placed less than 360 steps (1 game hour) ago and was never used (section 8.4); otherwise it is $0. Error: none.

C-63. A refund never raises the balance above $99,999,999. Error: none.

C-64. Demolishing an office or retail shop ends its lease with no refund of the current week. Error: none.

C-65. Demolishing a sold condo charges the player its sale price, even if the balance goes negative. Error: none.

C-66. Demolishing an occupied hotel room ends the stay with no refund; a VIP stay counts as not approved. Error: none.

C-67. Fast food, restaurant, cinema and party hall demolished during a day get no payout for that day. Error: none.

C-68. People whose home or workplace was the demolished unit are removed from the tower at once. Visitors inside it end their visit and plan a trip home from that level. Error: none.

C-69. People on a demolished stair or escalator arrive at their destination level at once; people in the queues of a demolished shaft re-plan. Error: none.

C-70. Population is recounted right after any demolition. Error: none.

C-71. Infested hotel rooms and ruins can always be demolished, at no cost and with no refund. Error: none.
