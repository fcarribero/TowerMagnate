# Stars, population and requirements

Version 1.1, 25 January 2027. Owner: Game Designer. Task TM-14.

This document defines how the tower's population is counted, when the star check runs, what each step from 1 star to the Torre rank needs, what "suficiente" means for medical centers, suites and recycling, how parking and medical failures block a promotion, and how the wedding gives the Torre rank. Values come from `docs/GDD.md` (section Estrellas y progresión, and the lines on medical, parking and recycling) and the SimTower research notes, adapted to a linear clock and a Monday-to-Sunday week. Where the GDD leaves a point open, the decision is marked "Design call" with a short reason. Section 10 maps every GDD line to the rule that covers it. The numbered rules at the end are the contract for the engine (`packages/engine`), the balance constants (`packages/shared`) and QA.

Related specs: people (TM-10, `docs/design/people.md`) for who exists, medical visits (section 16), parking demand (section 17) and wedding guests (section 15); economy (TM-9, `docs/design/economy.md`) for leases, hotel stays and venue day counts; construction (TM-8, `docs/design/construction.md`) for unlocks and placement; UI (TM-18, `docs/design/ui.md`) for the Estrellas window, dialogs and notices. The VIP visit and its approval are TM-15; infested rooms are TM-16.

## 1. Time conventions

Times use the engine clock from the economy spec: 1 game minute is 6 steps, 1 game day is 8,640 steps, step 0 is Monday 1 January of year 1, 00:00. Weekdays are Monday to Friday. "At 17:00" means the first step of that minute.

## 2. Ratings

The tower's rating is a whole number from 1 to 6. Ratings 1 to 5 are stars; 6 is the Torre rank, shown as 5 stars plus the word "TORRE" (ui.md 4). `StarRating` in `packages/shared` already uses these values. A new tower starts at 1.

Every rule in other specs that says "from N stars" or "N stars or more" treats the Torre rank as 6, so it applies at Torre too.

## 3. Population

### 3.1 What counts

Population is a whole number computed from the tower's state at any step:

| Source | Counts | When |
|---|---|---|
| Office | 6 | the office has a tenant (lease active), from the move-in step |
| Condo | 3 | the condo is sold, from the sale step until a buyback |
| Hotel room (single, double, suite) | the party size: 1, 2 or 2; the VIP counts 1 | from the party's check-in step until the stay ends at 10:00 on the check-out day |
| Fast food, restaurant, retail shop | the unit's count for the previous calendar day | from 00:00 to 23:59, for every unit of these types that exists |

Nothing else counts: no cinema audience, party guests, maids, guards, wedding guests, prospects or customers on their way.

An office counts 6 from the step its tenant moves in, even though its workers start coming on the next weekday (people.md 6). A hotel party counts in full from check-in, including guests who are out for the day or for dinner. A party that has not checked in yet does not count.

Design call on "huéspedes presentes": the GDD counts the guests present in the hotel. Counting the guests of every active stay, in or out of the room, keeps population from moving up and down all day as guests go out, and a check at 17:00 still sees the hotel the way the player does: rooms with guests.

### 3.2 Commercial counts

A unit's count for a day is the number of visits that started inside it during that calendar day, as defined in economy 7 for fast food and restaurants (between opening and payout time) and as the same visit count for retail shops (between 10:00 and 20:00). At 00:00 the count of the day that just ended becomes the unit's previous-day count and population changes at that step. A unit placed during a day has a previous-day count of 0 the next day if it got no visits, and its real count after that.

A retail shop without a tenant keeps its previous-day count until the next 00:00, then counts 0. A demolished unit counts nothing from the step it is demolished.

### 3.3 Where population shows

The status panel shows population at every delta (ui.md 4). The star check (section 4) and the wedding (section 7) read the same value at their step. There is one population number in the game.

### 3.4 Expected share

For balance planning, a 15,000 tower in the economy spec's mix (about 1,200 offices, 800 condos and 150 suites) gets about 7,200 from offices, 2,400 from condos, 600 to 900 from hotel rooms and 4,000 to 5,000 from about 100 venues at 35 to 50 visits a day. Commercial counts make up about a third in a hand-built tower. The progression bot's towers measure 40% at 3 stars and 51% to 55% at 4 and 5 stars (balance.md 8.4), and balance.md 8.6 sets the 5-star target at 45% to 55%. A tower with poor transport loses population through its shops even when every office is leased.

## 4. The star check

### 4.1 When it runs

The star check runs at 17:00 on every weekday (Monday to Friday), in the step-event phase of that step (people.md 1.2), after the economy events 1 to 6 of that step (economy 10) and before player commands. It makes no RNG draws.

The check never runs on Saturday or Sunday. The Torre rank has its own weekend path (section 7). A tower at 5 stars or at Torre skips the weekday check.

### 4.2 What it does

At the check, with rating `r` from 1 to 4:

1. If every requirement for `r` to `r + 1` in section 5 is met, the rating becomes `r + 1` at once.
2. Otherwise the rating stays. If population meets the step's threshold, the engine shows one alert notice for each other requirement that is missing, in the order of the table in section 5 (texts in section 9).

A check raises the rating by at most one step. A tower that meets two steps at once rises one step today and one at the next weekday check.

Design call on one step per check: the player sees each "¡N estrellas!" dialog and its unlock list, and a fast-growing tower cannot skip the security requirement by being too big. A delay of one weekday is small next to the weeks between ratings.

### 4.3 Effects of a promotion

- Units unlocked at the new rating can be built from that step (construction 4). The `starsChanged` dialog opens (ui.md 9.2) and `news.starsUp` is shown.
- Rules keyed to the rating use the new value from that step: medical visits start with the next 00:00 daily plan, the first parking pass is the next 06:00 (people.md 17.2), VIP visits and events follow TM-15, and lobby upkeep uses the rating at the Monday charge (economy E-44).
- The check window of section 6 starts again from this check.

### 4.4 No downgrades

The rating never goes down. Losing population, demolishing the security office, the subway, medical centers, recycling or the cathedral, or failing demand after a promotion changes nothing for the current rating, and units already built stay. Requirements only gate the next promotion. Units that need a rating can still be built while the tower keeps it.

Design call: SimTower never took stars away, and a downgrade would leave the player with built units of a rating they no longer have. A tower that empties out is already punished through rent and venue income.

## 5. Requirements per step

| Step | Population | Other requirements |
|---|---|---|
| 1 to 2 | 300 | none |
| 2 to 3 | 1,000 | at least 1 security office |
| 3 to 4 | 5,000 | VIP approved; at least 2 suites; recycling sufficient; medical sufficient; no parking failure |
| 4 to 5 | 10,000 | subway station; medical sufficient; recycling sufficient; no parking failure |
| 5 to Torre | 15,000 | cathedral; a completed wedding (section 7) |

"Population" means population at the check step is at least the number in the table. Each other requirement is defined below and is tested at the check step.

### 5.1 Security office

At least one security office exists in the tower. Its guards, its route and any event in progress do not matter.

### 5.2 VIP approved

The tower has the VIP approval flag. TM-15 sets it when a VIP visit that started while the tower had 3 stars ends approved. The flag is never cleared: a later rejected visit does not remove it. It only matters for the 3 to 4 step.

### 5.3 Suites

At least 2 suites exist that are not infested (TM-16). Their price level, grade and whether a party is staying do not matter.

Design call: the GDD asks for "suites de hotel", in plural, and the research gives "more than one" and "2". Two is also the least a tower needs so that the VIP finds a free suite on most days, since one suite is often booked by a normal party at 12:00 (people.md 9).

### 5.4 Recycling sufficient

Recycling is sufficient when `recyclingCenters × 2,500 ≥ population`, where `recyclingCenters` is the number of recycling centers in the tower. Put the other way, the tower needs `ceil(population / 2,500)` centers: 2 at 5,000, 3 above 5,000 up to 7,500, 4 at 10,000.

Recycling has no people and no route. Only the count matters.

### 5.5 Medical sufficient

Medical is sufficient when both hold:

1. at least 1 medical center exists, and
2. no medical visit failed in the check window (section 6). A failed visit is one of the failures in people.md 16: no center, no route to any drawn candidate, every center full, or the center full or closed on arrival.

There is no fixed ratio of centers to people. The demand is real: each office worker visits with 10% chance per weekday and a center takes 100 visits a day, so a tower with `O` leased offices expects `0.6 × O` visits per weekday. The table gives the fewest centers that keep the chance of a failure under 1% per weekday, assuming every center has a route from the offices and visits spread over all centers. The 10-center limit carries about 1,500 leased offices, above the 1,200 a typical 15,000 tower has (economy 12).

| Leased offices | Expected visits per weekday | Centers for under 1% failure a day |
|---|---|---|
| 130 | 78 | 1 |
| 400 | 240 | 3 |
| 520 | 312 | 4 |
| 800 | 480 | 6 |
| 1,200 | 720 | 8 |

Design call: a ratio rule and the failure rule would ask the same thing twice. The failure rule is the one the player sees, through people.md's notice, and it also catches a center with no route.

### 5.6 No parking failure

No parking failure happened in the check window (section 6). A parking failure is a holder left without a space by a pass in people.md 17.2, at 06:00 or at a suite check-in. Below 3 stars no pass runs, so there is nothing to fail.

### 5.7 Subway station

The subway station exists. Its route does not matter here; people.md 3 gives a poorly connected subway its own cost through lost visitors.

### 5.8 Cathedral

The cathedral exists on level 101 (construction 6.6).

## 6. The check window

Medical and parking failures are counted over a window, not over the calendar day of the check.

The window of a check at step `t` is the steps `s` with `p ≤ s < t`, where `p` is the step of the previous weekday 17:00 (the Friday 17:00 for a Monday check). The tower keeps two values, the step of its last medical failure and the step of its last parking failure. Requirement 5.5.2 fails when the last medical failure is at or after `p`, and 5.6 fails when the last parking failure is at or after `p`.

A failure at the check step itself happens in the people phase, after the check, so it belongs to the next window.

Design call, adapting "ese día no se puede subir de estrellas": office workers leave from 17:00 to 19:00, so almost every medical visit happens after the 17:00 check. A same-day rule would never see them, and on Mondays it would see nothing at all, since there are no visits on the weekend. The window from the previous weekday check covers each evening's visits and every parking pass, including the weekend ones, exactly once.

## 7. Wedding and Torre rank

### 7.1 Attempt

At 00:00 on every Saturday and Sunday, after the commercial counts roll over (section 3.2), a wedding attempt is due when all of these hold:

- the rating is 5;
- the cathedral exists;
- population at that step is at least 15,000.

If an attempt is due, people.md 15 creates the 40 wedding guests and their appearance times. One attempt per weekend day at most; Saturday and Sunday are independent.

### 7.2 Success

The attempt succeeds at the step when the 40th guest of that attempt enters the cathedral, if that step is before 12:30 of the same day. At that step the rating becomes 6 (Torre), the `weddingCompleted` dialog opens, `news.towerRank` is shown and the wedding plays (bells). Population is not checked again at that step.

### 7.3 Failure

The attempt fails at the 12:30 step when fewer than 40 guests are inside, or at once if the cathedral is demolished during the attempt. On failure the engine shows `news.weddingFailed`. Guests keep their schedule from people.md 15 (they all leave at 15:00); if the cathedral is gone, they leave at once.

Design call: the medical, parking and recycling requirements do not apply to the wedding. The GDD table gives the Torre step only population, the cathedral and the wedding, and the wedding already tests the hardest route in the tower.

## 8. Worked examples

### 8.1 Population

Wednesday 14:00. The tower has 520 leased offices, 300 sold condos, stays in 40 singles, 30 doubles and 11 suites, and the VIP in a twelfth suite. On Tuesday its 20 fast foods had 900 visits in total, its 10 restaurants 400 and its 30 retail shops 750.

| Source | Population |
|---|---|
| Offices | 520 × 6 = 3,120 |
| Condos | 300 × 3 = 900 |
| Hotel | 40 × 1 + 30 × 2 + 11 × 2 + 1 = 123 |
| Venues | 900 + 400 + 750 = 2,050 |
| Total | 6,193 |

### 8.2 A blocked 3 to 4 check

The same tower on Monday at 17:00, population 6,193, with the VIP approved last Thursday, 12 suites of which 1 is infested, 2 recycling centers and 3 medical centers. On Friday at 18:20 a worker found all 3 medical centers full.

- Population: 6,193 ≥ 5,000, met.
- VIP: approved, met.
- Suites: 11 not infested ≥ 2, met.
- Recycling: 2 × 2,500 = 5,000 < 6,193, missing. The tower needs `ceil(6,193 / 2,500) = 3` centers.
- Medical: the window runs from Friday 17:00 to Monday 17:00 and holds the Friday 18:20 failure, missing. With 520 offices the tower expects 312 visits a weekday against 300 places, so it fails most weekdays; a fourth center fixes it.
- Parking: no failure in the window, met.

The rating stays at 3 and the news line shows `news.starBlockedRecycling` and then `news.starBlockedMedical`. The player builds a recycling center and a medical center on Tuesday morning. Tuesday's window runs from Monday 17:00, and Monday evening had 2 more medical failures, so Tuesday 17:00 is still blocked by medical. Wednesday 17:00 is the first check with a clean window: the tower reaches 4 stars.

### 8.3 Weekend parking failure

A tower at 4 stars with 10,400 population, a subway, enough recycling and no medical failures. Friday 17:00 is blocked by population (9,950 that day). The 06:00 parking pass on Saturday leaves a condo owner without a space; the player adds spaces on Sunday and the Monday 06:00 pass has no failures. The Monday 17:00 window starts on Friday at 17:00 and holds the Saturday failure, so the tower does not rise. Tuesday's window starts on Monday at 17:00 and is clean: 5 stars on Tuesday.

### 8.4 One step per check

A tower at 1 star reaches 1,250 population on Tuesday. At Tuesday 17:00 it rises to 2 stars. Security unlocks at 2 stars, so it had none. The player builds a security office on Wednesday morning; at Wednesday 17:00 the tower has 1,000 or more population and a security office and rises to 3 stars.

### 8.5 Wedding

A tower at 5 stars with a cathedral. At Saturday 00:00 population is 15,210, so an attempt is due. 39 guests are in the cathedral by 11:50; the 40th found no route at 10:24 and will retry at 12:24, reaches the cathedral at 12:41, and the attempt fails at 12:30 with `news.weddingFailed`. At Sunday 00:00 population is 14,980, because Saturday's shop counts were lower, and no attempt is due. The next attempt is the following Saturday if population is 15,000 or more at its 00:00.

### 8.6 Vertical slice: 1 to 2 stars

The 14-day scenario of TM-217 starts on Monday 00:00 (step 0) with the 10-floor tower: lobby on level 1, one standard shaft and 90 offices on levels 2 to 10, 10 per level, all at the normal price level. It has no hotel, condo, venue or security office, so population is 6 per leased office and nothing else (section 3.1). The 1 to 2 step needs population 300 and no other requirement (section 5), which is 50 leased offices (50 x 6 = 300). 49 offices give 294 and do not pass.

Offices roll for a prospect at every whole hour from 08:00 to 18:00 on weekdays, 20% each at the normal level (people.md 18), so on a normal Monday most of the 90 offices find a tenant before 17:00.

On Monday, 61 offices are leased at 17:00 (step 6,120). Population is 61 x 6 = 366, at least 300. No other requirement exists, so the rating becomes 2 at that step, `starsChanged` is emitted with stars 2 and `news.starsUp` is shown. If only 44 were leased (264), nothing would be shown, since population is below the threshold (S-07), and the next check is Tuesday 17:00 (step 14,760).

The scenario passes when the rating is 2 after the Friday 17:00 check of day 4 (step 40,680) at the latest, with the `starsChanged` event at a step that is 17:00 of a weekday. It then stays 2 for the rest of the 14 days: the 2 to 3 step needs 1,000 population and the tower has at most 540 (90 x 6).

### 8.7 Run sheet: 3 stars to Torre

This is the exact checklist for the TM-139 run from a 3-star tower to the Torre rank. Counts come from sections 3 to 7 and the mix of economy 12. Venue counts change from day to day, so the population targets keep a margin of about 5% over the threshold.

Start state: 3 stars, 5 suites, 3 doubles, 2 singles, a housekeeping unit, a security office, 20,000,000 or more in cash.

| Step | Population target | Units that must exist | Check |
|---|---|---|---|
| 3 to 4 | 5,300 or more (threshold 5,000) | 2 or more suites that are not infested (keep 3 or more clean for the VIP); recycling `ceil(pop / 2,500)`: 3 centers for 5,001 to 7,500; medical: 4 centers for 520 leased offices; parking spaces for the demand below | VIP approved, no medical or parking failure since the previous weekday 17:00 |
| 4 to 5 | 10,500 or more (threshold 10,000) | subway station on level -9 (30 x 3, covers -9 to -7, $3,000,000; C-50, place it on -9 by hand until TM-247 is fixed); recycling 5 centers (covers 12,500); medical: 6 centers for 800 leased offices, 10 as the safe choice | no medical or parking failure in the window |
| 5 to Torre | 16,000 or more at Saturday 00:00 (threshold 15,000) | cathedral on level 101 (28 x 4, $35,000,000) with structure on all 28 cells of level 100 below it; a route for 40 guests | 40 guests inside before 12:30 |

Reference mixes that reach the targets (economy 12 and section 3.4):

| Mix | Offices | Condos | Hotel | Venue visits a day | Population |
|---|---|---|---|---|---|
| 3 to 4 | 520 (3,120) | 300 (900) | up to 19 | about 1,300 | about 5,340 |
| 4 to 5 | 800 (4,800) | 600 (1,800) | about 100 | about 3,800 | about 10,500 |
| Torre | 1,250 (7,500) | 800 (2,400) | about 800 | about 5,300 | about 16,000 |

Parking demand at 3 stars and above is `0.15 x offices + 0.25 x condos + 0.5 x suite parties`. At the 3 to 4 mix it is 78 + 75 + about 3 = 156 holders, so build 170 connected spaces. At the 4 to 5 mix it is 120 + 150 + about 10 = 280, build 310. At the Torre mix it is 188 + 200 + about 40 = 428, build 470. The limit is 512 spaces.

Medical demand is `0.6 x leased offices` visits a weekday against 100 per center. The 10-center limit is 1,500 leased offices at most, and the run may still fail on uneven spread (note on TM-144). If the check reports `news.starBlockedMedical` with 10 centers, record the offices, centers and visits per center from the day before and file it under TM-144.

VIP visit, in order (events 6, people 9):

1. The roll is at 00:00 every day, only at exactly 3 stars and with no visit in progress. Its chance starts at 8% and rises 4 points for each roll without a VIP day (events 6.1). Budget up to 2 game weeks at 3 stars: the chance of at least one VIP day in 14 rolls is 99.8%, and the 21st roll always succeeds. A day with no free suite or a rejected visit uses up a VIP day.
2. At 12:00 on the VIP day, before the booking rolls, the VIP books the clean suite with no stay and no booking that has the lowest unit id. A suite that is Ocupada, Sucia or Con plaga is not a candidate. Keep 3 or more suites in service so that a guest from the previous night does not leave none free. With no suite, `news.vipNoSuite` shows, the flag does not change, and the next roll is the next 00:00.
3. The VIP arrives at the street entrance between 17:00 and 21:00, goes to a restaurant for 60 minutes if one has a route, and leaves the next day between 08:00 and 10:00. `news.vipArrives` shows at 12:00, when the suite is booked (events 6.2).
4. The visit is approved when the average stress of all the VIP's trips, including the trip out, is under 15 game minutes. 15 exactly is rejected. A demolished, bombed or burned suite during the stay, or a VIP who gives up before check-in at 23:00, is a rejection. `news.vipApproved` or `news.vipRejected` shows when the visit ends.
5. The VIP never uses the subway or parking. A restaurant is optional, but a tower without one skips the dinner trip and has fewer trips in the average.
6. Visits at 3 stars after approval pay the suite and change nothing. A visit at 4 stars or more does not happen.

Events during the run (events 2):

| Rating | Bomb at 09:00, 1 in 60 | Fire at 15:00, 1 in 84 | VIP | Ransom |
|---|---|---|---|---|
| 3 | yes | yes | yes | $300,000 |
| 4, 5, Torre | yes | yes | no | $1,000,000 |

A fire needs a unit on levels 2 to 100 with 32 or more structure columns, and no fire rolls on a wedding attempt day. Treasure is 1 in 40 per construction command, once per basement level; the parking, recycling and subway work gives up to 9 levels of chances. Santa shows at 22:00 on 24 December, which is step 3,092,400 (day 357, a Monday). Reach it on a copy of the save with `setClock`. TM-239 is fixed in `develop`, so the week's finances survive the jump, but keep the copy apart from the main run so its star and wedding days stay real.

The wedding (sections 7, people 15): an attempt is due at Saturday and Sunday 00:00 when the rating is 5, the cathedral exists and population is 15,000 or more at that step. Saturday 00:00 counts Friday's venue visits, which are the highest of the week. Sunday counts Saturday's, which are lower because offices send no workers on weekends. So Saturday is the attempt to plan for, and Sunday is the retry. The 40 guests appear at 08:00 to 09:00 (40%), 09:00 to 10:00 (40%) and 10:00 to 10:30 (20%). Express shafts do not stop at level 101, so the route is an express to a sky lobby and a standard shaft for the last stretch. A guest with no route retries 2 hours later, which already misses 12:30 for the last appearances. Medical, parking and recycling do not apply to the wedding.

Expected notices on the way: `news.starsUp` at each promotion with the `starsChanged` dialog; `news.starBlockedVip`, `news.starBlockedSuites`, `news.starBlockedRecycling`, `news.starBlockedMedical`, `news.starBlockedParking` and `news.starBlockedSubway` for the missing requirement, only when population meets the threshold; `news.towerRank` and the `weddingCompleted` dialog at the 40th guest.

## 9. Notices

The failure notices at the moment a visit or a parking pass fails stay in people.md 21. These are the notices of the check and the wedding. All check notices are alerts (ui.md 8.1). ui.md 13.9 gets these rows; TM-17 owns the final wording.

| Key | When | Text | Alert |
|---|---|---|---|
| `news.starsUp` | promotion | La torre llegó a {n} estrellas. | |
| `news.starBlockedSecurity` | 2 to 3 blocked by 5.1 | La torre no subió de estrellas: falta una oficina de seguridad. | yes |
| `news.starBlockedVip` | 3 to 4 blocked by 5.2 | La torre no subió de estrellas: falta la aprobación del VIP. | yes |
| `news.starBlockedSuites` | 3 to 4 blocked by 5.3 | La torre no subió de estrellas: hacen falta 2 suites. | yes |
| `news.starBlockedRecycling` | blocked by 5.4 | La torre no subió de estrellas: hace falta un centro de reciclaje cada 2.500 personas. | yes |
| `news.starBlockedMedical` | blocked by 5.5 | La torre no subió de estrellas: alguien no pudo ir al centro médico desde la última revisión. | yes |
| `news.starBlockedParking` | blocked by 5.6 | La torre no subió de estrellas: alguien no consiguió cochera desde la última revisión. | yes |
| `news.starBlockedSubway` | 4 to 5 blocked by 5.7 | La torre no subió de estrellas: falta la estación de subte. | yes |
| `news.towerRank` | wedding success | ¡Hubo boda en la catedral! La torre alcanzó el rango Torre. | |
| `news.weddingFailed` | wedding failure | No llegaron todos los invitados a la boda antes de las 12:30. | |

The Estrellas window (ui.md 6.8) shows the requirement texts of ui.md 13.10, which this spec updates to name the numbers.

## 10. GDD coverage

| GDD line | Section | Result |
|---|---|---|
| 1 to 2 stars: 300, no extra | 5 | Kept |
| 2 to 3 stars: 1,000, at least one security office | 5.1 | Kept |
| 3 to 4 stars: 5,000, VIP approved, suites, recycling and medical sufficient | 5.2 to 5.5 | Kept; suites = 2, recycling = 2,500 per center, medical = no failure in the window |
| 4 to 5 stars: 10,000, subway, medical and recycling sufficient | 5.4, 5.5, 5.7 | Kept |
| 5 stars to Torre: 15,000, cathedral, a completed wedding | 7 | Kept |
| Star check every weekday at 17:00 | 4.1 | Kept, one step per check |
| Wedding: 40 guests in the cathedral on Saturday or Sunday before 12:30 | 7 | Kept |
| Population: 6 per occupied office, 3 per sold condo, hotel guests present, previous-day customers | 3 | Kept; guests of active stays |
| From 3 stars, failed medical or parking blocks promotion that day | 5.5, 5.6, 6 | Adapted: blocks the next check |
| Each recycling center covers up to 2,500 people | 5.4 | Kept |

## 11. Constants for `packages/shared`

| Constant | Value |
|---|---|
| `STAR_POPULATION_THRESHOLDS` | 1: 300, 2: 1,000, 3: 5,000, 4: 10,000, 5: 15,000 (exists) |
| `STAR_CHECK_TIME` | 17:00, weekdays only |
| `POPULATION_PER_OFFICE` | 6 |
| `POPULATION_PER_CONDO` | 3 |
| `SUITES_FOR_FOUR_STARS` | 2 |
| `RECYCLING_PEOPLE_PER_CENTER` | 2,500 |
| `WEDDING_DEADLINE` | 12:30 |
| `WEDDING_GUESTS` | 40 (exists in the catalog) |
| `TOWER_RATING` | 6 |

## 12. Rules

### Population

S-01. Population is the sum of: 6 per office with a tenant; 3 per sold condo; the party size of every hotel stay from check-in until the stay ends at 10:00 (single 1, double 2, suite 2, the VIP 1); and the previous-day visit count of every existing fast food, restaurant and retail shop. Nothing else counts.

S-02. A hotel party counts in full from its check-in step, whether its guests are in the room or out. A party that has not checked in does not count.

S-03. At 00:00 each venue's count for the day that ended becomes its previous-day count. A demolished venue counts 0 from its demolition step. A retail shop without a tenant keeps its previous-day count until the next 00:00.

S-04. The status panel, the star check and the wedding all use the same population value.

### Star check

S-05. The star check runs at 17:00 Monday to Friday, after the step's economy events and before player commands, with no RNG draws. It does not run on Saturday or Sunday, or when the rating is 5 or 6.

S-06. If every requirement of the next step is met, the rating rises by exactly one at that step. A check never raises it by more than one.

S-07. If the check fails and population meets the threshold, one alert notice is shown for each other missing requirement, in the order security, VIP, suites, recycling, medical, parking, subway. If population is below the threshold, no notice is shown.

S-08. On a promotion, units unlocked at the new rating can be placed from that step, `starsChanged` and `news.starsUp` are shown, and rating-based rules use the new rating from that step.

S-09. The rating never goes down.

### Requirements

S-10. 1 to 2: population 300 or more.

S-11. 2 to 3: population 1,000 or more and at least one security office.

S-12. 3 to 4: population 5,000 or more, VIP approval flag set, at least 2 suites that are not infested, recycling sufficient, medical sufficient, and no parking failure in the window.

S-13. 4 to 5: population 10,000 or more, the subway station exists, medical sufficient, recycling sufficient, and no parking failure in the window.

S-14. Recycling is sufficient when the number of recycling centers times 2,500 is at least the population.

S-15. Medical is sufficient when at least one medical center exists and no medical visit failed in the window.

S-16. The VIP approval flag is set by TM-15 when a VIP visit started at 3 stars ends approved, and is never cleared.

### Window

S-17. The window of a check at step `t` is `[p, t)`, where `p` is the previous weekday 17:00 step (Friday for a Monday check). A medical or parking failure at a step inside the window blocks the check.

S-18. A failure at the check step itself counts for the next check.

### Wedding and Torre

S-19. At 00:00 each Saturday and Sunday, after S-03, a wedding attempt is due if the rating is 5, the cathedral exists and population is 15,000 or more.

S-20. The tower reaches rating 6 (Torre) at the step the 40th guest of an attempt enters the cathedral, if that step is before 12:30. `weddingCompleted` and `news.towerRank` are shown.

S-21. The attempt fails at 12:30 if fewer than 40 guests are inside, or at once if the cathedral is demolished; `news.weddingFailed` is shown. The next attempt can happen the next weekend day.

S-22. Medical, parking and recycling do not affect the wedding.

### Vertical slice

S-23. In the TM-217 scenario the 1 to 2 requirement is population 300 and nothing else, which is 50 leased offices in a tower that has only offices. The first check that finds 300 raises the rating to 2 at 17:00 of a weekday, and the rating is 2 no later than the Friday 17:00 check of day 4 (step 40,680).

S-24. In the TM-217 scenario the rating stays 2 until the end of day 14, because the tower holds at most 540 population (90 offices) against the 1,000 needed for 3 stars.

### Run sheet

S-25. In a run from 3 stars, the 3 to 4 step needs population 5,000, 2 clean suites, 3 recycling centers for 5,001 to 7,500 population, at least 1 medical center with no failure in the window, no parking failure and the VIP approval flag. The flag comes only from a visit that started at exactly 3 stars and ended with an average trip stress under 15 game minutes.

S-26. The 4 to 5 step needs population 10,000, the subway station on level -9, `ceil(population / 2,500)` recycling centers, at least 1 medical center with no failure in the window and no parking failure. At exactly 10,000 population 4 centers are enough; at 10,001 the tower needs 5.

S-27. The wedding attempt checks population at 00:00 of Saturday or Sunday only. Saturday reads Friday's venue counts and Sunday reads Saturday's.

S-28. No VIP visit starts at 4 stars or above, and no fire rolls on a day with a wedding attempt.
