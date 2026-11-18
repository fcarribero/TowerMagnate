# Service units and their upgrades

Status: steps 1 and 2 built (upgrades, obrador); the rest is a draft. Numbers marked (guess) are first values to tune.

## 1. Idea

There is no tech tree. The player gets more of a service by building more units of that service, and makes one service better by buying upgrades for a unit. Each unit that makes a crew (a work office, a cleaning room, a security office) sends out its own people. The lobby is also a unit that takes upgrades.

Upgrades belong to one unit. If the tower has three cleaning rooms, each one is upgraded on its own.

## 2. Service units

| Unit | What it makes | Stars to unlock |
|---|---|---|
| Obrador | One building crew | 1 (guess) |
| Cuarto de limpieza | One cleaning crew | 2 (guess) |
| Oficina de seguridad (exists) | Guards that walk the whole tower | 2 (as now) |
| Lobby | Nothing; takes comfort upgrades | none |

The name Obrador is the Spanish word for the place where a builder keeps tools and materials. The cleaning room is a new unit; the existing housekeeping unit keeps serving hotel rooms only.

### 2.1 Obrador

Built (unit type `obrador`, 15 x 1, $80,000, 1 star, upkeep 10,000 a week). It has no art of its own yet and is drawn with the housekeeping sprites.

- The crew from outside always exists, as before: `BUILDER_CREW_SIZE` builders who come in work clothes at 08:00 on a work day when there is a site and go straight to it.
- Each obrador adds one crew of `BUILDER_CREW_SIZE` builders plus one per level of storage. An obrador's crew comes in at the same times, but only while the tower has more sites than crews in it: the crew from outside comes first, then the obradors in the order they were built.
- Each crew works on its own site. A builder takes the first site in the queue (priority, then the order placed) that no builder of another crew is heading to or working on; all builders of a crew end up on the same site. When no free site is left, the builder goes home.
- A builder's crew is kept in the person's home unit: 0 for the crew from outside, the obrador's unit number otherwise.
- Demolishing an obrador does not remove its builders at once: with the obrador gone they walk out of the tower in the clothes they have on.

Upgrades:

| Upgrade | Levels | Effect per level |
|---|---|---|
| Tools | 3 | +20% construction points a minute for this crew |
| Storage | 3 | +1 builder in this crew at the same time on a site |
| Quiet equipment | 3 | -20% of the noise of the sites this crew works on |

### 2.2 Cleaning room

- Unit `cleaning-room`, "Cuarto de limpieza": 15 x 1, $60,000, unlocks at 2 stars, upkeep 10,000 a week (guess). Until it has art of its own it is drawn with the housekeeping sprites.
- Each room sends a crew of 3 cleaners (person kind `cleaner`), 2 more for each level of staff. The shift is 07:00 to 19:00 every day. At 07:00, or later in the shift up to 18:00 while the room has nobody in the tower, the crew walks in from the street in everyday clothes, goes to the room and changes there for 5 minutes (2.5).
- A cleaner first takes the nearest venue garbage pile that no other cleaner is heading to, nearest level first. At the pile it picks up 1 bag, 1 more for each level of tools, and carries them out to the street by a lobby end; then it chooses again from the street.
- With no pile to take, it walks to the dirtiest built cell with 0.5 dirt or more that is not within 3 columns of a spot another cleaner holds. It tries the 5 dirtiest such spots before giving up. At the spot it takes 1 dirt a minute off its cell, 25% more for each level of collection speed, and the same off 1 more cell to each side for each level of materials. It stays until the cell has less than 0.05 dirt, or 30 minutes at most, then chooses again.
- With nothing to do it waits 10 minutes at the room door and looks again. A cleaner whose route fails waits the same way.
- At 19:00 cleaners walk back to the room, change for 5 minutes and leave in everyday clothes. One carrying bags drops them at the street first.
- Dirt only goes down this way; it does not fade by itself (stress-evaluation 2.6).
- Demolishing the room does not remove its crew at once: the cleaners walk out of the tower.
- A cleaner carrying bags is drawn with a bag and dirties cells and cars like the venue staff do. Cleaners do not record trip stress.

Upgrades:

| Upgrade | Levels | Effect per level |
|---|---|---|
| Collection speed | 3 | +25% dirt removed a minute |
| Staff | 3 | +2 cleaners working at the same time |
| Materials | 3 | A cleaner removes dirt in 1 more cell around the one it stands on |
| Tools | 3 | +1 bag carried per trip (walking speed is the same for everyone) |

### 2.3 Security office

- There is no area of coverage. Every office has its own 21 officers (3 shifts of 7) and its patrol officers walk the whole tower, picking stops by the crime weight of the units (`SECURITY_PATROL_WEIGHTS`), so each extra office adds officers on patrol. The picks are drawn per officer and step, so officers of different offices spread over the tower.
- Security has no tower limit any more (it was 10, construction C-52). The 2 to 3 star requirement of at least one office stays.
- Officers already come in plain clothes, change for 5 minutes in their office, work their shift and change back before they leave (people 14), as in 2.5.
- Upgrades apply to the officers of that office, except the fire system and access control, where the best office in the tower counts.

| Upgrade | Levels | Effect per level |
|---|---|---|
| Cameras | 3 | Each patrolling officer of the office watches `SECURITY_CAMERA_COLUMNS` (5) columns either side of where they stand, on their level. People in a watched cell feel its noise and dirt stress times `SECURITY_WATCHED_STRESS` (0.5). |
| Guards | 3 | `SECURITY_GUARDS_PER_LEVEL` (1) more officer on every shift. The officers are added when the level is bought and they patrol. |
| Fire system | 3 | Every burning front gets `SECURITY_FIRE_SYSTEM_PROGRESS` (1) containment a minute, on top of the guards fighting it. The best level among the offices counts. |
| Access control | 2 | Condos and suites take `SECURITY_ACCESS_CONTROL_SCORE` (30) off their base stress in the grade, not below 0. The best level among the offices counts. |

The tower has no theft or vandalism events, so cameras act on stress instead. An office without cameras changes nothing in the stress people feel.

### 2.4 Lobby

- A lobby has its own upgrades. A tower with more lobbies (sky lobbies) buys them per lobby.
- A lobby is not a unit. It is one run of lobby cells on the base level of the main lobby (level 1) or of a sky lobby, together with the rows above it that a tall lobby takes. Its id is `l<base level>x<first column>`, for example `l1x40`.
- The levels are kept in `state.lobbies`, by lobby id, with the columns the lobby had when they were written. A lobby takes, for each upgrade, the highest level of every entry its columns overlap on its base level. So a lobby that joins two upgraded lobbies keeps the higher level of each, and both parts of a lobby that is cut in two keep the levels it had. Buying writes the entries of that base level again for the lobbies there now.
- Price of level N: 25% of what the lobby's cells cost (5,000 a cell, every row of every column), times N, and never from less than 200,000 (`LOBBY_UPGRADE_BASE_PRICE`).
- Effects work on every cell of the lobby, on all its rows: what a person feels each minute there (stress-evaluation 2.6), standing or walking, and the stay counted at the start of a trip.

| Upgrade | Levels | Effect per level |
|---|---|---|
| Plants | 3 | -15% of the stress felt in the lobby cells (`LOBBY_PLANTS_STRESS_CUT`) |
| Music | 3 | -20% of the noise felt in the lobby cells (`LOBBY_MUSIC_NOISE_CUT`) |
| Lighting | 3 | -20% of the dirt felt in the lobby cells (`LOBBY_LIGHTING_DIRT_CUT`) |

- Music and lighting change what people feel, not the maps: the noise and dirt in the cells stay as they are.
- The Lupa opens the lobby window on a click on lobby cells with no person, shaft or unit in front (ui.md 6.5.1).

## 2.5 Crews, clothes and shifts

- The crew from outside always exists, whatever the tower has built. It comes in work clothes and walks straight to its site. It is one more crew on top of the ones the obradores make.
- The builders of an obrador come in from the street in everyday clothes and walk to their obrador (`arriving`). There they stand `BUILDER_CHANGE_MINUTES` (5) to change (`changingIn`), and then pick a site. At 17:00, or when no free site is left, they walk back to the obrador (`returning`), change for 5 minutes (`changingOut`) and leave for home in everyday clothes. These phases are stored as negative trip codes so the codes of old saves keep their meaning.
- The client draws a builder in everyday clothes until the engine marks it in uniform, as it does for police and maids.
- The cleaners of a cleaning room do the same in their room (2.2). The same is planned for the guards of a security office: they arrive in everyday clothes, change in their unit and leave through it at the end of the shift.

## 2.6 Elevators for staff

This replaces the rules in routing.md that let only maids use service elevators and keep guards off them.

- Service elevators are for workers only: maids, builders, cleaners, guards (`police`), venue staff (`staff`) and couriers. Other people never use them. Couriers count because a delivery is the kind of trip a service elevator is for.
- For a worker a service ride costs `ROUTE_WORKER_SERVICE_RIDE_FACTOR` (0.25) of a passenger ride in the route search: 125 instead of 500. Transfers cost the same for everyone. Each class has its own cached route tables (`maid`, `worker`, `other`).
- Maids keep their high stair cost and stay off escalators (they push carts), but may now ride standard and express cars.
- A worker is not barred from the standard elevators. The route is the cheapest one, so a worker takes a standard or express car when it beats the service car by a wide margin, for example when the service car has a long wait or does not stop on a floor the route needs.
- If the service elevators are too few or too slow, workers end up in the cars of everyone else. The player fixes that by building more service elevators.

## 2.7 Stress from seeing workers

- A person who rides a standard or express car with a worker in it, or who walks past one, feels a little stress. Workers inside a service car do not count, because nobody else is there.
- So a tower with no service elevators makes workers share cars with tenants, and the stress shows up in the score of the units those tenants come from.
- The value goes in the car's noise and dirt pair. A worker who boards a standard or express car adds 0.5 noise (`CAR_NOISE_RIDER` 0.3 plus `CAR_NOISE_WORKER` 0.2) and the plain 0.1 dirt; a rider with a bag adds 1 dirt more. Extra dirt per worker was left out: when car dirt did not fade, it pushed most office tenants below the renewal grade in the 7-day vertical slice. Car dirt now falls by half every 12 game hours.
- A worker on a service car adds only what a plain rider adds.
- The stress is only for cars. A worker who crosses a person on foot, in a hall or on stairs, adds nothing beyond the small noise and dirt per cell that anyone adds.

## 3. Quiet and comfort units

Acoustic panels are not an upgrade: their cost would grow with the surface they cover. These are units instead. They are not made by upgrades and have none.

| Unit | Width | Price | Stars | Upkeep a week | Calm in its cells | Calm reaches |
|---|---|---|---|---|---|---|
| Jardín (`garden`) | 12 | 60,000 | 1 | 5,000 | x0.5 | 8 columns each side |
| Sala de estar (`lounge`) | 10 | 80,000 | 2 | 5,000 | x0.5 | 6 columns each side |
| Biblioteca (`library`) | 15 | 150,000 | 3 | 10,000 | x0.5 | 6 columns each side |

All numbers are guesses (`COMFORT_AURA`, `LIBRARY_NOISE_KEEP` in balance.ts).

- Calm: the stress a person feels in a minute in one of the unit's cells (stress-evaluation 2.6) is multiplied by its calm. Beside the unit, on its own level, the factor rises in a straight line back to 1 over the columns it reaches. Where two of them overlap, the lower factor counts. The maps of noise and dirt do not change; only what people feel does.
- The library also takes noise out of the map: each game minute, after the noise fades, the noise in its cells is multiplied by 0.7, rising in a straight line back to 1 over the same 6 columns.
- The garden is built above ground; the lounge and the library anywhere.
- Nobody lives or works in them, and they need no route from the street.
- The garden borrows the retail shop art, the lounge the suite art and the library the housekeeping art, until they get their own. That is why the library is 15 wide.

Open point: people do not go to them to pass the time yet. There is no leisure trip to reuse; residents and hotel guests only feel the calm when they walk or stand near one.

## 4. Elevators

No change. The player can build as many shafts and cars as wanted at any star level.

## 5. Upgrades in the game

- A unit has `upgrades`, a map from upgrade id to level, 0 by default. A missing map is the same as all 0.
- A command `buyUpgrade` takes a unit id and an upgrade id, charges the price and adds 1 level up to the maximum.
- Price of level N (guess): 25% of the unit price times N.
- The unit panel lists the upgrades with their levels, price and effect. A locked upgrade shows what is needed.
- Demolishing the unit loses its upgrades and its crew goes home.
- Built so far: the catalog (`UPGRADE_CATALOG`), the command and the panel rows, for the security office, the obrador and the cleaning room. All their levels act: the obrador's and the cleaning room's on their crews (2.1, 2.2), the security office's as in 2.3. Lobbies have ids of their own and their upgrades act as in 2.4; `buyUpgrade` takes a lobby id in place of a unit id.

## 6. Build order

1. `upgrades`, `buyUpgrade` and the panel rows.
2. Obrador and several crews.
3. Cleaning room and its crew.
4. More security offices and their upgrades.
5. Lobby upgrades.
6. Garden, lounge and library units (done: calm and noise only, no visits).
7. Work clothes, changing in the unit, and staff on service elevators with the stress from sharing cars (done).

## 7. Open points

- Whether the first obrador should be free at the start of a new game.
- How many cleaners a room starts with and how far they walk.
- The effect of guards on tenant stress, which sets the value of security upgrades.
