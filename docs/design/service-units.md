# Service units and their upgrades

Status: draft for review. Numbers marked (guess) are first values to tune.

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

- With no obrador the builders come from outside as today: one crew.
- Each obrador adds one crew of `BUILDER_CREW_SIZE` people. They start the work day inside the obrador and walk to a site from there. They go back to it at the end of the day.
- Each crew works on its own site. A site that has a crew on it is skipped by the other crews. The site queue keeps its order and priority.
- Upkeep per day (guess): 10,000, as housekeeping.

Upgrades:

| Upgrade | Levels | Effect per level |
|---|---|---|
| Tools | 3 | +20% construction points a minute for this crew |
| Storage | 3 | +1 builder in this crew at the same time on a site |
| Quiet equipment | 3 | -20% of the noise of the sites this crew works on |

### 2.2 Cleaning room

- Makes a crew of cleaners (3 at level 0, guess) who start the day in the room.
- Cleaners go to the dirtiest built cells and bag piles they can reach and remove dirt from them. Dirt only goes down this way; it does not fade by itself (stress-evaluation 2.6).
- They also take bags from venue piles and carry them out.
- Upkeep per day (guess): 10,000.

Upgrades:

| Upgrade | Levels | Effect per level |
|---|---|---|
| Collection speed | 3 | +25% dirt removed a minute |
| Staff | 3 | +2 cleaners working at the same time |
| Materials | 3 | A cleaner removes dirt in 1 more cell around the one it stands on |
| Tools | 3 | Cleaners walk faster and carry more bags |

### 2.3 Security office

- The unit loses any area of coverage. All offices send guards to the whole tower, so each extra office adds officers on patrol.
- The limit of one office (`limitGroup: 'security'`) is removed so the player can build more. The 2 to 3 star requirement of at least one office stays.
- Upgrades apply to the guards of that office.

| Upgrade | Levels | Effect per level |
|---|---|---|
| Cameras | 3 | Less theft and vandalism where the guards patrol |
| Guards | 3 | +1 guard on each shift |
| Fire system | 3 | A fire in the tower is put out sooner |
| Access control | 2 | Suites and condos count the tower as safer |

The exact effects depend on what the security system will do; this is not built yet in the stress score. The first step is a stress lower for tenants near a patrolled route (guess).

### 2.4 Lobby

- A lobby has its own upgrades. A tower with more lobbies (sky lobbies) buys them per lobby.
- Effects work on the cells of that lobby level.

| Upgrade | Levels | Effect per level |
|---|---|---|
| Plants | 3 | Calm lowers stress for people in the lobby cells |
| Music | 3 | Lowers the noise felt in the lobby cells |
| Lighting | 3 | Fewer dirt points are felt there |

## 2.5 Crews, clothes and shifts

- The default crew from outside always exists, whatever the tower has built. It comes in work clothes and walks straight to its site. It is one more crew on top of the ones the obradores make.
- The workers of an obrador come in from the street in everyday clothes and walk to their obrador. There they change and become builders, and then walk to their site. At the end of the work day they walk back to the obrador, change into everyday clothes and leave for home.
- The same goes for the cleaners of a cleaning room and the guards of a security office: they arrive in everyday clothes, change in their unit and leave through it at the end of the shift.
- A person who has changed shows the work look (builder, cleaner, guard); one in everyday clothes shows the look of a plain person.
- Changing takes a fixed time standing in the unit (guess: 5 minutes).

## 2.6 Elevators for staff

This replaces the rules in routing.md that let only maids use service elevators and keep guards off them.

- Service elevators are for workers only: builders, cleaners, maids and guards. Other people never use them.
- For a worker the cost of a service ride is much lower than the cost of a standard or express ride (guess: a quarter of it per floor, and a quarter of the 500 boarding cost).
- A worker is not barred from the standard elevators. The route is the cheapest one, so a worker takes a standard or express car when it beats the service car by a wide margin, for example when the service car has a long wait or does not stop on a floor the route needs.
- If the service elevators are too few or too slow, workers end up in the cars of everyone else. The player fixes that by building more service elevators.

## 2.7 Stress from seeing workers

- A person who rides a standard or express car with a worker in it, or who walks past one, feels a little stress. Workers inside a service car do not count, because nobody else is there.
- So a tower with no service elevators makes workers share cars with tenants, and the stress shows up in the score of the units those tenants come from.
- The value is added to the minute stress of the cell or car: it goes in the car's noise and dirt pair, with a worker counting more than a plain rider (guess: a worker adds 0.5 noise and 0.1 dirt in a car, a bag-carrying cleaner adds 1 dirt more).
- The stress is only for cars. A worker who crosses a person on foot, in a hall or on stairs, adds nothing beyond the small noise and dirt per cell that anyone adds.

## 3. Quiet and comfort units

Acoustic panels are not an upgrade: their cost would grow with the surface they cover. These are units instead:

- Garden: people go there to pass the time; its cells give calm.
- Lounge: the same, indoors.
- Library: calm, and it takes some noise from the cells around it.

Each has a width, a price and a star level to unlock. These are not made by upgrades. Values come in a later step.

## 4. Elevators

No change. The player can build as many shafts and cars as wanted at any star level.

## 5. Upgrades in the game

- A unit has `upgrades`, a map from upgrade id to level, 0 by default. A missing map is the same as all 0.
- A command `buyUpgrade` takes a unit id and an upgrade id, charges the price and adds 1 level up to the maximum.
- Price of level N (guess): 25% of the unit price times N.
- The unit panel lists the upgrades with their levels, price and effect. A locked upgrade shows what is needed.
- Demolishing the unit loses its upgrades and its crew goes home.

## 6. Build order

1. `upgrades`, `buyUpgrade` and the panel rows.
2. Obrador and several crews.
3. Cleaning room and its crew.
4. More security offices and their upgrades.
5. Lobby upgrades.
6. Garden, lounge and library units.
7. Work clothes, changing in the unit, and staff on service elevators with the stress from sharing cars.

## 7. Open points

- Whether the first obrador should be free at the start of a new game.
- How many cleaners a room starts with and how far they walk.
- The effect of guards on tenant stress, which sets the value of security upgrades.
