# Playtest TM-139: from 1 star toward Torre

First full playtest of the GDD feature list on a dev stack, run on 20 January 2027.

## Setup

- Build: `develop` at 5b37366 for days 0 to 14 of the tower, then `develop` at 64d4b87 from day 14 on. The update pulled in TM-185 (population from condos, hotel and venues), TM-233 (stars notice `{n}`), TM-234 (fast food sprite) and TM-229. The server was killed with SIGKILL during the switch, which also served as the save and restore check.
- Stack: dev profile, `PORT_BASE=4170`, `COMPOSE_PROJECT_NAME=tm-gd`.
- Commands went over a raw tower socket with the session cookie. Screenshots came from headless Chromium at 1600 x 900.
- Debug tools: `debug.fastForward` in 1-day steps, `debug.setClock` for a few jumps, `debug.setMoney` (20,000,000 on day 1 and 99,999,999 on day 10, so money never limited the build), `debug.forceEvent` for bomb and fire.
- Real time below is the time the milestone would take at 15 real minutes per game day. With fast-forward the session itself took about 4 hours.

## Result

The tower reached 3 stars and 5,896 population. It cannot reach 4 stars on the current build, so Torre was not reached. The 3 to 4 step needs an approved VIP visit and suites that guests use. Hotel guests never arrive (TM-35 Hotel guest routine is blocked) and the VIP visit does not exist yet (TM-110 is blocked). Every star check from day 11 on reported `news.starBlockedVip`. The subway (4 stars) and the cathedral (5 stars) answer `STAR_LOCKED`, so the wedding could not be tried.

The playtest should be repeated from 3 stars once TM-35 and TM-110 are in `develop`.

## Milestones

| Milestone | Game date | Step | Population (read after the event) | Real time at 15 min per day |
|---|---|---|---|---|
| Start, 1 star | Mon 1 Jan 05:12 | 1,877 | 0 | 0 h 00 |
| 2 stars | Wed 3 Jan 17:00 | 23,400 | 798 | 0 h 41 |
| 3 stars | Tue 9 Jan 17:00 | 75,240 | 1,146 | 2 h 11 |
| 3 to 4 blocked by VIP and parking | Fri 12 Jan 17:00 | 101,160 | about 5,200 | 2 h 56 |
| 3 to 4 blocked by VIP and medical | Mon 15 Jan 17:00 | 127,080 | 5,896 | 3 h 41 |
| Santa notice | Mon 24 Dec 22:00 | 3,092,400 | 5,896 | jump with setClock |

2 stars came after 2.7 game days and 3 stars after 8.7, with a 300-column tower and plenty of money. Both are faster than the GDD's several weeks to 5 stars implies, but money was unlimited, so this is no balance verdict. TM-136 owns that.

## Tower at the end

Main lobby on level 1, columns 40 to 339, sky lobbies on 15, 30 and 45. Three standard shafts per zone (1 to 15, 15 to 30, 30 to 45) and two express shafts from 1 to 45, 8 cars each. 920 offices, 13 condos, 2 fast food, 1 restaurant, 8 shops, 66 single rooms, 42 double rooms, 25 suites, 2 housekeeping, 1 security office, 9 medical centers, 2 cinemas, 2 party halls, 3 recycling centers, 3 parking ramps and 165 parking spaces, basements down to S9.

## Checklist

Status is one of: works, bug (with the task filed), not built yet (feature missing in `develop`, with its task), or not tried.

### Structure and transport

| Feature | Status | Notes |
|---|---|---|
| Main lobby, floors | works | Lobby 300 cells cost 1,500,000; floor 500 per cell |
| Sky lobbies on 15, 30, 45 | works | A lobby run cannot cross shaft columns (`CELL_OCCUPIED`); built as 4 runs on level 15 |
| Stairs | works | 3-floor walking limit seen: with stairs only, offices above level 4 stayed empty |
| Escalator | works | Accepted on a commercial floor (level 8 to 9) |
| Standard shaft, add car, 8-car limit | works | `CAR_LIMIT` at the 9th car; `NO_FLOOR` when the top floor is missing |
| Shaft separation | works | `SHAFT_TOO_CLOSE` under 8 columns |
| Express shaft | works | Stops computed as 1, 15, 30, 45 |
| Service shaft | not tried | First placement hit offices; not retried |
| Resize shaft into basements | works | Costs nothing, as the shaft cost is flat |
| Configure shaft (stops, homes, schedule) | works | |
| Remove car | works | |

### Units by star

| Feature | Status | Notes |
|---|---|---|
| Star lock | works | Suite at 1 star, restaurant at 2, subway and cathedral at 3 return `STAR_LOCKED` |
| Offices, leases, rent | works | 918 of 920 leased by day 14; rent 10,690,000 in week 2 |
| Office price level | works | `setPrice` high accepted |
| Condo sale | works | 15 sold on day 1 to 2 for 150,000 each; price change after sale returns `PRICE_LOCKED` |
| Hotel rooms, suites, stays | not built yet | No guest in 11 game days. TM-35 is blocked |
| Housekeeping | not built yet | TM-142 in backlog |
| Fast food, restaurant, shops | works | Shop tenants: 4 of 8 by day 14. Venue customers counted in population after TM-185 |
| Cinema, party hall | not built yet | Placed; no audience (TM-37). `changeFilm` returns `INVALID_COMMAND` (TM-94) |
| Medical centers | works, balance issue | See the balance section |
| Parking ramp and spaces | works | Holders get spaces from 06:00. Placement connectivity is not checked (TM-27 in backlog) |
| Recycling centers | works | Coverage of 2,500 each matches the requirement flag |
| Security office | works | Guards found the bomb on day 10 |
| Subway, cathedral | not tried | Need 4 and 5 stars |

### Stars and population

| Feature | Status | Notes |
|---|---|---|
| Star check at 17:00 on weekdays only | works | No check on Saturday and Sunday |
| 1 to 2 at 300 | works | |
| 2 to 3 at 1,000 plus security | works | |
| 3 to 4 blocked notices | works | Notices in table order: VIP, then parking or medical |
| Population sources | works | 5,508 before TM-185, 5,893 after it, same tower |
| VIP visit | not built yet | TM-110 blocked |
| Wedding and Torre | not tried | Needs 5 stars |

### Events

| Feature | Status | Notes |
|---|---|---|
| Bomb, forced, no answer | works | Default `refuse` at the 1-hour deadline, search, explosion on 6 floors, 18 units lost |
| Bomb, natural roll | works | Day 10 at 09:00, found by guards at 12:54 |
| Ruins after a bomb | bug | The Topadora cannot pick ruins: TM-237 |
| Fire, forced, helicopter | in QA (TM-109) | 500,000 charged; the fire stayed in `activeEvents` with no cells for the rest of the run. Noted on TM-109 |
| Treasure | not seen | 9 basement levels built, no treasure. The chance is 1 in 40 per level |
| Santa | works | `news.santa` at 22:00 on 24 December |

### Demolish, save and other commands

| Feature | Status | Notes |
|---|---|---|
| Demolish leased office | works | |
| Demolish sold condo | works | Sale price of 150,000 charged back |
| Refund within 1 game hour | works | Fast food refunded 100,000 |
| Main lobby protected | works | `MAIN_LOBBY_PROTECTED` |
| Demolish ruins | works in the engine | One cell per command; 233 commands for one bomb |
| Rename unit | works | |
| Invalid command payload | bug | Error frame without the command id: TM-238 |
| Pause with no connection | works | Step did not move between sessions |
| Save and restore after SIGKILL | works | Same step, money, units, shafts and cars |
| Weekly finance roll | works with normal steps | Wrong after a `setClock` jump: TM-239 |

## Balance and design notes

Medical sufficiency failed on both weekdays checked with 918 offices and 9 centers, while people.md 16 expects 6 centers to be enough for 800 offices. The centers had 30, 58, 92, 100, 86, 21, 71, 62 and 4 visits that day: 524 visits for 900 places. Workers pick the cheapest route among 3 drawn centers, so one center fills, and the next worker who already chose it fails as "full on arrival" at about 19:14. One failure blocks the star check. The note is on TM-144.

Clearing ruins one cell per command is slow even once TM-237 lets the Topadora do it. A drag should clear a whole run.

## Bugs filed

- TM-237, P2, web: Bulldozer cannot clear bomb ruins.
- TM-238, P3, server: Command with invalid payload gets an error frame instead of a commandResult.
- TM-239, P4, server: Debug setClock across Monday leaves last week's finances empty.
