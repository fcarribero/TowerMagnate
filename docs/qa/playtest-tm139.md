# Playtest TM-139: from 1 star toward Torre

First full playtest of the GDD feature list on a dev stack, run on 20 January 2027. The 1 to 3 star part was run again on 21 January on a newer `develop` (see "Re-run on 21 January" below).

## Setup

- Build: `develop` at 5b37366 for days 0 to 14 of the tower, then `develop` at 64d4b87 from day 14 on. The update pulled in TM-185 (population from condos, hotel and venues), TM-233 (stars notice `{n}`), TM-234 (fast food sprite) and TM-229. The server was killed with SIGKILL during the switch, which also served as the save and restore check.
- Stack: dev profile, `PORT_BASE=4170`, `COMPOSE_PROJECT_NAME=tm-gd`.
- Commands went over a raw tower socket with the session cookie. Screenshots came from headless Chromium at 1600 x 900.
- Debug tools: `debug.fastForward` in 1-day steps, `debug.setClock` for a few jumps, `debug.setMoney` (20,000,000 on day 1 and 99,999,999 on day 10, so money never limited the build), `debug.forceEvent` for bomb and fire.
- Real time below is the time the milestone would take at 15 real minutes per game day. With fast-forward the session itself took about 4 hours.

## Result

The tower reached the Torre rank on 29 January, in a full run from 1 star on `develop` at f8ec4aa (see "Run to Torre on 29 January"). The wedding finished on day 19, a Saturday, at 11:44, with 17,200 population. Two things in `develop` still stop a normal player on the way: rooms are never cleaned (TM-142), so the VIP finds no clean suite after the first days, and a bomb or fire that destroys a unit leaves a save that cannot be loaded (TM-250).

The first run on 20 January stopped at 3 stars and 5,896 population, because hotel guests (TM-35) and the VIP visit (TM-110) were not built yet.

## Re-run on 21 January

The 1 to 3 star part was played again on `develop` at 9131408. Since the first run, `develop` gained TM-231 (notice params), TM-230 (subway customers), the v0.10.0 release and the TM-228 CI fixes. Same stack and port block. A new account and tower, with `debug.setMoney` at 20,000,000 on day 0 and 99,999,999 on day 2.

The tower had a main lobby on level 1 from column 40 to 339, floors 2 to 15 and basements S1 to S3, three standard shafts with 6 cars each, 360 offices, 12 condos, 3 fast food, 1 restaurant, 2 shops, 1 cinema, 1 party hall, 2 medical centers, 1 recycling center, a parking ramp with 14 spaces, 5 suites, 3 double and 2 single rooms, housekeeping and security.

| Milestone | Game date | Step | Population | Real time at 15 min per day |
|---|---|---|---|---|
| Start, 1 star | Mon 1 Jan 00:00 | 0 | 0 | 0 h 00 |
| 2 stars | Mon 1 Jan 17:00 | 6,120 | not read | 0 h 11 |
| 2 to 3 blocked by security | Tue 2 Jan and Wed 3 Jan 17:00 | 14,760 and 23,400 | 2,497 | |
| 3 stars | Thu 4 Jan 17:00 | 32,040 | 2,517 | 0 h 56 |

The offices were all built on day 0 before the first check, so 2 stars came on the first weekday at 17:00. The 2 to 3 step waited only for the security office, which unlocks at 2 stars.

Results for the earlier findings and the merged work:

- TM-231 notice params: works. `news.bombExploded` arrived with `{"level":"15"}`, and `news.starsUp` with `{"n":2}` and `{"n":3}` (TM-233). No braces were found in the page text. The Avisos window itself was not opened in the browser.
- TM-234 fast food sprite: works. The fast food on S1 renders with its art at zoom 1x and 2x, with no magenta.
- TM-229 sky lobby refund: works, see the demolish table.
- TM-230 subway customers: not played, the station needs 4 stars.
- TM-237 ruins: still a bug. A bomb with no security office exploded on level 15 at 13:00 and left 130 ruined cells on levels 13 to 15. Whole offices became ruins (45 cells on 13 and 14), as EV-17 says. The engine cleared ruins one cell per command, and an office was built on 9 cleared cells.
- TM-238 invalid payload: still a bug. The `configureShaft` frame with empty schedules got the error frame with no id, and the pending command timed out.
- TM-239 `setClock` finances: still a bug. Jumping from Friday 18:15 to Monday 10:00 left `lastWeek` empty and `thisWeek` holding the old totals with `weekStartStep` 60,480.
- Service shaft: works.
- Bomb rules: `BOMB_EVENT_ACTIVE` when building security during a threat; with security, guards found the first forced bomb at 21:07.

No new bugs were found. 4 stars and Torre still need TM-35 and TM-110.

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
| Service shaft | works | Re-run: placed at columns 336 to 339, levels 1 to 15 |
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
| Hotel rooms, suites, stays | works | 29 January: guests checked in on all three room types from day 1. Rooms stay Sucia after the first stay, see Housekeeping |
| Housekeeping | not built yet | TM-142 in backlog. With no maids all 10 rooms were Sucia by day 5 and stayed so for 28 days; hotel population fell to 0 |
| Fast food, restaurant, shops | works | Shop tenants: 4 of 8 by day 14. Venue customers counted in population after TM-185 |
| Cinema, party hall | not built yet | Placed; no audience (TM-37). `changeFilm` returns `INVALID_COMMAND` (TM-94) |
| Medical centers | works, balance issue | See the balance section |
| Parking ramp and spaces | works | Holders get spaces from 06:00. Placement connectivity is not checked (TM-27 in backlog) |
| Recycling centers | works | Coverage of 2,500 each matches the requirement flag |
| Security office | works | Guards found the bomb on day 10 |
| Subway, cathedral | works | 29 January: subway accepted on S9 at 4 stars; cathedral accepted on level 101 at 5 stars, with floor on 101 beside it and a standard shaft from 90 to 101. TM-230 customers not checked one by one |

### Stars and population

| Feature | Status | Notes |
|---|---|---|
| Star check at 17:00 on weekdays only | works | No check on Saturday and Sunday |
| 1 to 2 at 300 | works | |
| 2 to 3 at 1,000 plus security | works | |
| 3 to 4 blocked notices | works | Notices in table order: VIP, then parking or medical |
| Population sources | works | 5,508 before TM-185, 5,893 after it, same tower |
| VIP visit | works | 29 January: natural roll on day 4, suite booked at 12:00 with `news.vipArrives`, approved at 09:51 the next day. Rolls on days 21 and 25 of an earlier try ended in `news.vipNoSuite` because every suite was Sucia (TM-142) |
| Wedding and Torre | works | 29 January: attempt at Saturday 00:00 with 17,200 population, 40th guest at 11:44, `news.towerRank`, rating 6 |

### Events

| Feature | Status | Notes |
|---|---|---|
| Bomb, forced, no answer | works | Default `refuse` at the 1-hour deadline, search, explosion on 6 floors, 18 units lost |
| Bomb, natural roll | works | Day 10 at 09:00, found by guards at 12:54 |
| Ruins after a bomb | bug | The Topadora cannot pick ruins: TM-237. Still open on the re-run; `demolishPlan.ts` maps only `l` and `f` |
| Fire, forced | works | TM-109 merged; see "Check on 26 January". Helicopter path not played again |
| Treasure | not seen | 9 basement levels built, no treasure. The chance is 1 in 40 per level |
| Santa | works | `news.santa` at 22:00 on 24 December |

### Demolish, save and other commands

| Feature | Status | Notes |
|---|---|---|
| Demolish leased office | works | |
| Demolish sold condo | works | Sale price of 150,000 charged back |
| Refund within 1 game hour | works | Fast food refunded 100,000 |
| Main lobby protected | works | `MAIN_LOBBY_PROTECTED` |
| Sky lobby refund within 1 game hour | works | Re-run (TM-229): 10 columns at 2 steps refunded 50,000; 4 columns at 358 steps refunded 20,000; 36 columns at 362 steps refunded 0 |
| Demolish ruins | works in the engine | One cell per command; 233 commands for one bomb |
| Rename unit | works | |
| Invalid command payload | bug | Error frame without the command id: TM-238. Still open on the re-run |
| Pause with no connection | works | Step did not move between sessions |
| Save and restore after SIGKILL | works, bug after a disaster | Same step, money, units, shafts and cars. 29 January: after a bomb destroyed 28 units the saved state did not load (TM-250) |
| Weekly finance roll | works with normal steps | Wrong after a `setClock` jump: TM-239. Still open on the re-run |

## Re-check on 22 January

Fixes merged on 21 January were checked on `develop` at 51a9c03 (merged into this branch). Same stack and port block (4170, `tm-gd`). The server health check and the web page answered, and the unit suites for the four fixes passed (8 files, 107 tests). No bomb, lease or dialog was played in the browser this time, so these are code and test results only.

- TM-237 bulldozer and ruins: fixed in code. `demolishPlan.ts` maps `r` cells to a `ruins` run, so a drag along a level clears a whole run, which also answers the one-cell-per-command note below. The in-browser bomb check is left for the next full run.
- TM-177 info dialogs: `InfoDialogs`, `infoDialogModel` and `Dialog` tests pass. Not opened in the browser.
- TM-103 lease and condo evaluations: `evaluation`, `unit-evaluation` and `evaluation-effects` tests pass.
- TM-236 closed sprite for venues at night: not merged, still in QA (PR 229). Not checked.
- Still open: TM-238 and TM-239. TM-109 (fire) is not in `develop`.

## Check on 26 January

Short visual check on `develop` at 7393ebf, which has TM-242 (people drawn in the browser) and TM-109 (fire). Same stack and port block (4170, `tm-gd`), a fresh database, headless Chromium at 1600 x 900. The tower had a 61-column lobby, floors 2 to 8, two standard shafts and 28 offices, so it stayed at 1 star. Screenshots were looked at one by one.

- People drawn and moving: works. Workers came in at the lobby, rode the cars (cars stopped at levels and the figure showed inside the shaft), walked into offices and sat at the desks. By 08:25 every office had a seated worker. A figure was visible in the elevator shaft on level 4 on the way up. Population read 162 to 168.
- Two figures stand at the far ends of the lobby (columns near the lobby edges) in every screenshot and never move. They look like idle visitors; not filed, since the cause is unknown.
- One session showed people frozen: after two `fastForward` days and a `setClock` on a page that was already open, the same ten workers stood in the same places from 08:01 to 08:29 while the clock and money kept running. Two later sessions (including one with the same `fastForward` and `setClock` calls) did not repeat it, so no task was filed. If it shows up again, the first thing to try is a reload.
- Forced fire (`debug.forceEvent` with `fire`): works, and it runs at 1 star because the debug command skips the 3-star rule. The Incendio dialog read "Hay un incendio en el piso 7. Un helicóptero lo puede apagar por $500.000. Si no lo llamás, seguridad va a tratar de contenerlo. Respondé antes de las 09:31", with the buttons "Llamar al helicóptero ($500.000)" and "No llamar". The burning office drew as a black burned block at once and the population dropped (162 to 156).
- Fire end: with "No llamar" and no security office, the fire went up one level about every 30 minutes (level 2 and 3 burning at 09:20, whole tower burned by about 12:40) and the ticker showed "El incendio se apagó." at 11:59, which fits events.md 5.6 and 5.8. Population went to 0 because every office was ruins. The ruins stay until demolished.
- Notices: the end notice reads well, but it sits in a thin strip at the very bottom of the window in small type. The "Avisos" window was not opened in this run (the toolbar button was not found by role name).

No new bugs. TM-237, TM-238 and TM-239 are not rechecked here. 4 stars to Torre is still blocked on TM-35 and TM-110.

## Run to Torre on 29 January

A full run from an empty tower to Torre on `develop` at f8ec4aa, after TM-35 (hotel guests) and TM-110 (VIP visit) merged. This run drove the engine directly with commands, in 1-hour steps through `step`, the same advance the server runs, with no browser. Tower seed 139. Bomb decisions were answered `pay` and fire decisions `helicopter`, through `answerEvent`.

Debug use:

- `setMoney` to 99,999,999 at 00:00 whenever cash was lower: days 0 to 3, 7, 9, 13 and 14. Money never limited the build.
- `forceEvent vip` was not needed. The VIP rolled on its own on day 4.
- TM-142 workaround: at 00:00 of the VIP day, 2 Sucia suites were demolished and built again in the same place, so the VIP had a clean suite at 12:00. Without it the VIP finds no suite (see below).

| Milestone | Game date | Step | Population | Real time at 15 min per day |
|---|---|---|---|---|
| Start, 1 star | Mon 1 Jan 00:00 | 0 | 0 | 0 h 00 |
| 2 stars | Mon 1 Jan 17:00 | 6,120 | 1,842 at 00:00 next | 0 h 11 |
| 3 stars | Tue 2 Jan 17:00 | 14,760 | 2,204 at 00:00 next | 0 h 26 |
| VIP books a suite | Fri 5 Jan 12:00 | 38,880 | 6,341 | 1 h 08 |
| VIP approved | Sat 6 Jan 09:51 | 46,751 | 6,395 | 1 h 21 |
| 4 stars | Mon 8 Jan 17:00 | 66,600 | about 5,450 (Sunday venue counts) | 1 h 56 |
| 5 stars | Fri 12 Jan 17:00 | 101,160 | 10,024 | 2 h 56 |
| Wedding attempt | Sat 20 Jan 00:00 | 164,160 | 17,200 | 4 h 45 |
| Torre | Sat 20 Jan 11:44 | 168,385 | 17,200 | 4 h 52 |

Tower at Torre: main lobby on level 1 across all 375 columns, sky lobbies on 15, 30, 45, 60, 75 and 90, floors 2 to 100 and S1 to S9, and floor on level 101 beside the cathedral. Two standard shafts per 15-floor zone (the top one from 90 to 101), four express shafts from 1 to 90 and one standard shaft from S9 to 1, all with 8 cars: 19 shafts. 1,077 offices (all leased), 752 condos (all sold), 5 suites, 3 double and 2 single rooms, housekeeping, security, 64 fast food, 9 restaurants, 61 shops, 10 medical centers, 5 recycling centers, 4 parking ramps with 340 spaces, the subway on S9 and the cathedral at columns 150 to 177.

Step by step against the run sheet (`docs/design/stars.md` 8.7):

- 3 to 4 (S-25): the Thursday check was blocked by `news.starBlockedVip` only. After the approval on Saturday the Monday check passed with 6 medical centers, 3 recycling centers and 170 spaces. No medical or parking failure in the window. Hotel population was 0 by then, so the step does not need hotel guests, only 2 suites that are not infested.
- VIP: booked at 12:00 with `news.vipArrives` at the booking, as events 6.2 says. The run sheet said the notice shows at the arrival; fixed in `stars.md`.
- 4 to 5 (S-26): passed at the first weekday check with 10,000 or more (Friday, 10,024) with 10 medical centers, 5 recycling centers, 340 spaces and the subway on S9. No VIP rolled at 4 or 5 stars (S-28).
- 5 to Torre (S-27): Saturday 00:00 read 17,200 and started the attempt. Guests came from 08:00; 8 inside at 10:00, 23 at 11:00, the 40th at 11:44, 46 minutes before 12:30. The route was express to 90 and a standard shaft from 90 to 101. A bomb threat opened at 09:00 the same day (bombs may roll on a wedding day) and was paid.

What a player without the workaround would see: in a first try of the 3 to 4 step, with no rebuild, the VIP rolled on days 4, 21 and 25 and each ended in `news.vipNoSuite`, because all 5 suites were Sucia from their first check-out on. The tower stayed at 3 stars for 28 days with every other requirement met once there were enough medical centers.

Medical: with 565 leased offices, 5 centers failed every weekday (`news.medicalFull` from 18:05 to 19:00), about 339 expected visits against 500 places. 6 centers on one floor did not fail in the window before the 4-star check. At 5 stars, 1,077 offices and 10 centers failed every weekday again; that no longer blocks anything.

## Run sheet re-check on 27 January

The 3 stars to Torre run sheet (`docs/design/stars.md` 8.7, S-25 to S-28) was checked against `develop` at 728e7c0 (merged into this branch as da5cbeb). This was a code and test check, with no browser run. The engine suites for stars, wedding, parking, office routine, population and events passed (13 files, 200 tests).

- Star check (`stars.ts`): the requirement lists per step, the notice order, the window from the previous weekday 17:00 and the `ceil(population / 2,500)` recycling rule match S-05 to S-18. Suites count when they are not infested, as in 5.3. The run sheet said "clean suites"; it now says "not infested" and keeps 3 clean ones as advice for the VIP.
- Constants: thresholds 300, 1,000, 5,000, 10,000 and 15,000; 2 suites; 2,500 per recycling center; 100 medical visits per center a day; parking holders 0.15, 0.25 and 0.5; limits of 10 medical centers and 512 parking spaces; subway 30 x 3 for $1,000,000; cathedral 28 x 4 for $3,000,000 on level 101. All match the run sheet.
- Wedding (`wedding.ts`): due at weekend 00:00 at 5 stars with a cathedral and 15,000 population; the 40th guest before 12:30 gives rating 6. The fire roll skips a wedding day. Both match S-27 and S-28.
- VIP: `state.vipApproved` exists and the star check reads it, but nothing in `develop` sets it yet, and there is no debug command for it. The 3 to 4 step cannot pass on `develop` until TM-110 merges, as expected.
- Subway position: a scratch test placed the subway station with its bottom row on level -5 at 4 stars and the command was accepted for $1,000,000. Construction rule C-50 asks for level -9 and `SUBWAY_POSITION`. Filed as TM-247. The run sheet now says to place it on -9 by hand until then.
- TM-239 is merged, so the Santa copy of the save keeps its weekly finances. The run sheet note is updated.
- The run sheet gave 93% for at least one VIP day in 21 days. The right figure is 92% (`1 - (8/9)^21`). Fixed.

## Test plan for 4 stars to Torre

The exact populations, units, VIP conditions, events and wedding timing are in `docs/design/stars.md` section 8.7 (run sheet, rules S-25 to S-28). The steps below follow it.

Run once TM-35 (hotel guests) and TM-110 (VIP visit) are in `develop`. Start from a saved 3-star tower with 5 suites, 3 double and 2 single rooms, housekeeping, security and 20,000,000 or more in cash. Targets: 5,300 population for 4 stars with 3 recycling and 4 medical centers and 170 parking spaces; 10,500 for 5 stars with the subway on level -9, 5 recycling and 6 to 10 medical centers; 16,000 at Saturday 00:00 for the wedding.

1. Hotel guests (TM-35): at least one guest checks in on each room type. Check that suites are used, housekeeping cleans after check-out, and rent is charged once per stay.
2. VIP visit (TM-110): the roll is 1 in 9 a day at exactly 3 stars, so allow up to 3 game weeks. At 12:00 the VIP books the clean free suite with the lowest unit id, arrives 17:00 to 21:00, leaves 08:00 to 10:00, and the visit is approved when the average trip stress is under 15 minutes. The notice `news.starBlockedVip` stops once approved.
3. Star check at 17:00 on a weekday: the 3 to 4 step passes after an approved VIP visit and used suites. Note the day, step and population. Medical sufficiency may block it again (TM-144), so read the star notice reason.
4. 4-star unlocks: the subway station is accepted and no longer answers `STAR_LOCKED`. Check TM-230 customers arrive in the subway.
5. 4 to 5 stars: build to the 5-star requirements in `docs/design` and log what the check reports each weekday.
6. 5-star unlocks: the cathedral is accepted. Run a wedding (TM-106) and check its notices.
7. Torre: confirm the rank notice and record the game date, step, population and real time at 15 minutes per day.
8. Events at 4 and 5 stars: bomb with and without security, ruins cleared by one Topadora drag (TM-237), fire with TM-109 if merged, and VIP and Santa.
9. Evaluations over the longer run: lease renewals and condo departures follow TM-103, with no empty-week finances after normal steps.
10. Save and restore with SIGKILL once at 5 stars: same step, money, units and hotel stays.
11. File a bug per defect with steps and priority, and update the Result section above.

## QA run on the release build, from 1 February

QA1 plays the checklist on the production image, the build a player gets, in real time. This section grows each QA day until the run reaches Torre.

### Setup

- Build: this branch at 116792e, which is `develop` at e5d16af merged in. `pnpm stack --profile prod up -d --build` with `PORT_BASE=4190` and `COMPOSE_PROJECT_NAME=tm-qa1`. The game and the API are both on port 4191.
- The account and tower were made in the browser (headless Chromium, 1600 x 900): "Creá una", username and both password fields, "Crear cuenta". The game opened with the Bienvenida dialog.
- Commands went over a second socket of the same session, from a small script that also logged every star change, notice and event with the game clock and the real clock. Screenshots are in the office folder under `qa1-shots/tm139-*.png`.
- Debug commands are off in production: `debug.fastForward` and `debug.setMoney` got the error frame `NOT_ALLOWED` "Debug commands are not available here". So this run has no fast-forward and no free money. It starts with $2.000.000 and grows on condo sales and rent, and every milestone below is real time.

### Milestones

Real time is measured from the first command at 00:07 on day 0. The clock ran at 96 game minutes per real minute (day 0 00:07 to day 1 18:00 took 26 min 10 s), which is the 15 minutes per day of the GDD.

| Milestone | Game date | Step | Population | Real time |
|---|---|---|---|---|
| Start, 1 star | Mon 1 Jan 00:07 | 42 | 0 | 0 h 00 |
| Check fails, below 300 | Mon 1 Jan 17:00 | 6,120 | 105 | 0 h 10 |
| Check fails, below 300 | Tue 2 Jan 17:00 | 14,760 | 240 | 0 h 26 |
| 2 stars | Wed 3 Jan 17:00 | 23,400 | 434 | 0 h 41 |
| 2 to 3 check fails, below 1,000 | Thu 4 Jan 17:00 | 32,040 | 490 | 0 h 56 |
| 2 to 3 check fails, below 1,000 | Fri 5 Jan 17:00 | 40,680 | 519 | 1 h 11 |
| First weekly upkeep, money below 0 | Mon 8 Jan 00:00 | 60,480 | 466 | 1 h 45 |

End of day 1 of QA (1 February): the tower is paused at Monday 8 Jan 01:00, step 60,840, 2 stars, 466 population and -$232.000. It has 25 floors on the right wing (columns 150 to 213) with one standard shaft of 7 cars, a second lobby run at columns 86 to 149 with level 2, a standard shaft at column 116 (1 car, levels 1 and 2) and stairs at column 142, 43 condos, 47 offices, 1 fast food, security, housekeeping, 3 suites, 2 double and 2 single rooms. The save stays in the `tm-qa1` database volume and the run goes on from there.

Build order: a 64-column main lobby (columns 150 to 213), floors 2 to 5, one standard shaft at column 180, then one floor at a time with 2 condos and 2 offices each, paid by the condo sales. Each condo costs $80.000 and sold for $150.000 within hours, so condos fund the tower in the first days. By the 2-star check there were 20 floors, 40 offices and 36 condos.

### Checklist on the release build

| Feature | Status | Notes |
|---|---|---|
| Register, create tower, welcome dialog | works | Bienvenida text names the $2.000.000 |
| Game renders in production | works | Tower, people, lit windows at night. The console shows one CSP line from `uiScale` ("script-src was not explicitly set"); it is the renderer probing for `eval`, and nothing breaks |
| Debug commands refused | works | `NOT_ALLOWED` |
| Clock speed | works | 15 real minutes per game day |
| Main lobby | works | Second run of a different height: `LOBBY_HEIGHT_MISMATCH`. A run not touching the lobby: `LOBBY_NOT_CONTIGUOUS`. Extension at columns 86 to 149 for $320.000 |
| Floors, standard shaft, add car, resize | works | Shaft with 1 car $280.000, each extra car $80.000, resize free |
| Stairs | works | $5.000 from the lobby to level 2. A landing on an occupied cell: `TRANSPORT_LANDING`. Outside the lobby: `NO_FLOOR` |
| Escalator | works | Lobby to an office floor: `ESCALATOR_FLOOR_TYPE` |
| Star lock at 1 star | works | Suite and security: `STAR_LOCKED`. Restaurant at 2 stars: `STAR_LOCKED` |
| Offices, rent | works | Rent charged at move-in, first offices leased at 08:00 on day 0 |
| Condo sale, price lock | works | Sold at $150.000; `setPrice` on a sold condo: `PRICE_LOCKED` |
| Office price level | bug | `setPrice` high is accepted and stored (`priceLevel` high in the saved state), but every unit view and the Precios overlay still say normal: TM-255 |
| Rename unit | works | |
| Demolish within 1 game hour | works | Office built at 21:48 and demolished at 22:31 refunded $40.000 |
| Fast food | works | Under 25 customers on level 5 it lost $3.000 a day, as the table says |
| Star check 1 to 2 | works | Failed silently below 300 on Monday and Tuesday, passed Wednesday 17:00 with `news.starsUp` `{"n":2}` |
| 2-star unlocks | works | Security, housekeeping, 3 suites, 2 double and 2 single rooms, service shaft at column 209 on levels 21 and 22. Service shaft at column 205: `CELL_OCCUPIED` (a double room was there) |
| Hotel check-in | works | First suite and double room taken on day 3 after 12:00 |
| Hotel room state in the client | bug | By Saturday of week 1, 5 of 7 rooms were Sucia in the saved state, but their views said empty and `overlays.hotel` was `{}`; no unit is ever sent as dirty, infested or disconnected: TM-256. The rooms stay Sucia because nothing cleans them (TM-142) |
| Finances window | works | Rows and totals match the money; `Semana anterior` shows $0 in week 1 |
| Avisos window | works | "Todavía no hay avisos." before the first notice |
| Save and restore after SIGKILL | works | `docker kill` at day 1 18:28; after restart the tower came back at 18:18 with the same units. The 10 lost game minutes are within the 30-second autosave. The open socket reconnected by itself |

## Balance and design notes

Medical sufficiency failed on both weekdays checked with 918 offices and 9 centers, while people.md 16 expects 6 centers to be enough for 800 offices. The centers had 30, 58, 92, 100, 86, 21, 71, 62 and 4 visits that day: 524 visits for 900 places. Workers pick the cheapest route among 3 drawn centers, so one center fills, and the next worker who already chose it fails as "full on arrival" at about 19:14. One failure blocks the star check. The note is on TM-144.

The VIP is the only step on the way to Torre that the player cannot speed up. The wait for a VIP day is 9 days on average, and in 8% of towers it is longer than 21 days, which is over 5 hours of real time at 15 minutes a day with the tower otherwise ready. A day with no free suite, or a rejected visit, starts the wait again. This fits "several game weeks" for 5 stars only on average. Noted on TM-144, with one option: raise the chance after each day without a VIP so the wait has a cap.

29 January run: venues made 8,482 of the 17,200 population at the wedding (49%), from 134 venues at about 63 visits each. Section 3.4 plans for about a third. With unlimited money the whole run took 19 game days, against the 18 weeks of economy 12; the star gates themselves are not the slow part once money is free. Both go to TM-144 and TM-136.

Release build, week 1 (QA1): with no debug money the first week ends at about 500 population. Condos fund the start, since each one costs $80.000 and sells for $150.000 the same day, but once every condo is sold the cash comes from rent only, which is paid on the weekday the tenant moved in, so nothing comes in on the weekend. The first Monday upkeep was $268.000 (8 standard cars over 2 shafts and 1 service car at $20.000, security $40.000, housekeeping $20.000, rooms $28.000), which put the tower at -$232.000 with rent of $440.000 a week. The amounts follow `WEEKLY_UPKEEP` in `packages/shared/src/balance.ts`, which is double the GDD table for cars, security and housekeeping; the GDD says the Game Designer tunes them, so this is a note for TM-136, not a bug. At this pace 3 stars needs several more game weeks, about 2 real hours each, which fits the GDD goal of weeks to 5 stars.

Clearing ruins one cell per command is slow even once TM-237 lets the Topadora do it. A drag should clear a whole run.

## Bugs filed

- TM-237, P2, web: Bulldozer cannot clear bomb ruins.
- TM-238, P3, server: Command with invalid payload gets an error frame instead of a commandResult.
- TM-239, P4, server: Debug setClock across Monday leaves last week's finances empty.
- TM-247, P3, engine: Subway station accepted above level -9.
- TM-250, P1, engine: Saved tower fails to load after a bomb or fire destroys a unit.
- TM-254, P4, web: Star window says "Rango actual: 1 estrellas".
- TM-255, P2, server: Unit views always send price Normal after setPrice.
- TM-256, P2, server: Hotel overlay is empty and rooms never draw as Sucia.
