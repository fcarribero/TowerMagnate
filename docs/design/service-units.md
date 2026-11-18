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

## 7. Open points

- Whether the first obrador should be free at the start of a new game.
- How many cleaners a room starts with and how far they walk.
- The effect of guards on tenant stress, which sets the value of security upgrades.
