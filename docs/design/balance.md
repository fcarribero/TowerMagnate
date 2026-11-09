# Balance pass 1: simulated progression

Version 0.2 (draft), 5 February 2027. Owner: Game Designer. Task TM-136.

This report measures how many game days a careful player needs to reach each rating, from an empty tower with the starting money and no debug money. The player is a scripted bot in `packages/engine/src/testing/progression-bot.ts` that sends real commands to the engine and plays every step with the real rules. Targets come from economy.md section 12: 2 stars by day 7, 3 stars on days 14 to 21, 4 stars on days 54 to 72, 5 stars on days 89 to 121 and the Torre rank on days 126 to 168, as medians over 5 seeds. No seed may reach 5 stars before day 84.

Run it with `pnpm balance:progression --seeds 1,2,3,4,5 --days 200`. The report has no timings, so the same seeds give the same bytes.

## 1. Build order

The bot builds one tower layout, the same on every seed. Columns 20 to 355 hold units; columns 138 to 213 are the transport core and stay free of units. Units fill each level from the core outward, right side first, and the tower grows upward next to the core before it grows outward, because floor costs $500 a cell and main lobby $5,000.

Zone 0 is levels 2 to 14, served from the main lobby. Each later zone starts at a sky lobby (15, 30, 45, 60, 75, 90) and covers the 14 levels above it. Zone 6 runs from 90 to the cathedral on 101.

| Level in zone 0 | Use |
|---|---|
| 2, 6, 11, 14 | offices |
| 3, 5, 10, 12, 13 | condos |
| 4 | security and 2 medical centers next to the core, fast food beyond |
| 7, 8 | hotel: housekeeping, stairs, 2 suites, doubles, singles |
| 9 | restaurants and retail shops |

Above each sky lobby the 14 levels are: offices, condos, fast food, offices, condos, offices, condos, restaurants and shops, offices, condos, offices, condos, offices, condos. The sky lobby level itself holds security and 3 medical centers next to the core and fast food beyond.

The mix follows economy.md 3.4, which plans about 1,200 offices and 800 condos for a 15,000 tower: condos are 16 columns wide against 9 for an office, so the two need about the same number of levels. The first draft had 2 condo levels in zone 0 and 1 in each later zone, and the bot ran out of money it could have made from condo sales. Party halls get no guests before TM-37, which is not in 1.0, so their levels hold condos.

Every 10 game minutes the bot does at most one thing, in this order:

1. Answers an open decision: pays a bomb ransom when it has the money, calls the helicopter for a fire when it has $2,000,000 or more.
2. Clears ruins.
3. Transport: one standard shaft per zone at first, one more for every 6 cars wanted, up to 4; a car for every 110 people and daily visits the zone's units bring; express shafts at columns 170 and 184 with a car for every 450 above zone 0; a sky lobby before a zone opens.
4. Star requirements, once population is near the next threshold: the security office, medical centers (one per 70 expected visits), parking spaces 8 above the holders, recycling for 10% over population, the subway at 4 stars and the cathedral at 5.
5. Growth: the next free slot of the layout, with condos and fast food first when they need little lobby or floor underneath. Fast food waits for 10 leased offices each; hotel rooms wait for housekeeping, 24 rooms per unit.

Growth keeps back $100,000 and a week of upkeep. The first draft also kept back the bomb ransom, which held about $300,000 idle at 2 stars for an event that comes once in 60 days; a bomb that finds the bot short of the ransom now goes off. Prices stay at normal.

## 2. Results before tuning

### 2.1 First draft of the bot

Seed 1, develop at 624bda5, 130 days: 2 stars on day 12, 3 stars on day 61, 4,453 people and no 4 stars by day 130. The bot sat at about 300 people from day 10 to day 30 with its money held at the reserve, and most of each week's income went to hotel rooms near the core.

### 2.2 What blocked 4 stars

Nothing in the engine. With $5,000,000 added on day 1, seed 1 reached 4 stars on day 82, at the first weekday check where population was 5,003. With $60,000,000 added it reached 4 stars on day 9. In both runs the security office, 4 suites, the VIP flag and recycling (3 centers at 5,000) were in place before population got there. VIP visits came about 1 day in 9 at 3 stars, and the flag was set 1 to 5 weeks after 3 stars on every run. Medical failures and parking failures showed up in some windows, and each cost a day at most, because the bot adds a medical center and parking spaces as population grows. The draft never reached 4 stars because it never reached 5,000 people.

### 2.3 Current bot, 5 seeds

The bot of section 1, develop at 624bda5 plus this branch, constants unchanged. These numbers come from the weekly progress lines, so each is the end of the game week in which the rating came; the 200-day report was stopped at day 112 to 133 because a 5-seed run at 5,000 people and more takes over 2 hours.

| Rating | Seed 1 | Seed 2 | Seed 3 | Seed 4 | Seed 5 | Target |
|---|---|---|---|---|---|---|
| 2 stars | by 7 | by 7 | by 7 | by 7 | by 7 | by 7 |
| 3 stars | by 35 | by 35 | by 35 | by 35 | by 35 | 14 to 21 |
| 4 stars | by 98 | by 98 | not by 112 | by 119 | by 98 | 54 to 72 |

Condo sales pay for growth: in seed 1, condo sales brought $6,000,000 in the first week and $2,100,000 to $2,700,000 in the weeks the bot opens condo levels. From 2 stars to 3 stars the tower can only grow in zone 0, because the express elevator and sky lobbies need 3 stars, and zone 0 holds about 1,300 people when every column is used. The last 300 of the 1,000 people for 3 stars need main lobby out to the edge of the tower at $5,000 a column.

### 2.4 Trial: upkeep at the GDD values

The same 5 seeds with every doubled upkeep line in economy.md 8.2 put back to the GDD value (cars $10,000 and $20,000, housekeeping $10,000, security $20,000, recycling $50,000, subway $100,000; lobby and hotel rooms unchanged): 2 stars by day 7 and 3 stars by day 35 on every seed, as before; 4 stars by day 84 on seeds 1, 2, 4 and 5 and by day 91 on seed 3. That is about two weeks earlier at 4 stars, still about two weeks outside the range, and it does not move 3 stars.

## 3. Constants changed

Two changes in `packages/shared/src/balance.ts`, with the matching tests and economy.md 6.1, 8.2 and 12.

Condo sale price, which pays for most early growth: $230,000 / $175,000 / $115,000 / $45,000 for high, normal, low and minimum, from $200,000 / $150,000 / $100,000 / $40,000.

Weekly upkeep: cars, housekeeping, security, recycling center and subway station go back to the GDD values (standard and service car $10,000, express car $20,000, housekeeping $10,000, security $20,000, recycling $50,000, subway $100,000). Lobby, escalator, parking ramp, hotel rooms and party hall keep their economy.md values.

Upkeep alone moved 4 stars from day 98 to day 84 (section 2.4). A condo price of $200,000 normal brought 4 stars to about day 49 and 5 stars to about day 63 on some seeds, which is too fast for the 5 stars range, so the price was set at $175,000.

## 4. Results after tuning

Seeds 1 to 5, constants of section 3, run to day 75 (`pnpm balance:progression --days 75`). Game day each rating came.

| Rating | Seed 1 | Seed 2 | Seed 3 | Seed 4 | Seed 5 | Median | Target |
|---|---|---|---|---|---|---|---|
| 2 stars | 2 | 2 | 2 | 2 | 2 | 2 | by 7 |
| 3 stars | 18 | 17 | 18 | 18 | 17 | 18 | 14 to 21 |
| 4 stars | 61 | 60 | 64 | 59 | 61 | 61 | 54 to 72 |
| 5 stars | not by 75 | not by 75 | not by 75 | not by 75 | not by 75 | not measured | 89 to 121 |
| Torre | not measured | not measured | not measured | not measured | not measured | not measured | 126 to 168 |

Before and after at the same bot: 3 stars by day 35 on every seed and 4 stars on days 98, 98, none by 112, 119 and 98 (section 2.3), against the table above.

2 stars, 3 stars and 4 stars are inside their ranges. 5 stars and Torre are not measured: a 5-seed run past day 75 takes several hours, and a 200-day run was started at the end of sprint 13. With a condo price of $200,000 two seeds had 5 stars at day 63, so 5 stars is the open risk. If the 200-day run shows 5 stars before day 84 on any seed, the next change is on the 4 to 5 star step (population 10,000), not on the condo price.

## 5. 200-day run, constants of section 3 (8 February 2027)

Seeds 1 to 5, `pnpm balance:progression --seeds N --days 200`, one process per seed. Game day each rating came.

| Rating | Seed 1 | Seed 2 | Seed 3 | Seed 4 | Seed 5 | Median | Target |
|---|---|---|---|---|---|---|---|
| 2 stars | 2 | 2 | 2 | 2 | 2 | 2 | by 7 |
| 3 stars | 18 | 17 | 18 | 18 | 17 | 18 | 14 to 21 |
| 4 stars | 61 | 60 | 64 | 59 | 61 | 61 | 54 to 72 |
| 5 stars | 82 | 81 | 85 | 79 | 80 | 81 | 89 to 121 |
| Torre | 97 | 97 | 104 | 97 | 97 | 97 | 126 to 168 |

5 stars is 8 days early and four seeds come before day 84. Torre is 29 days early. After 4 stars the bot needs only 20 days to reach 10,000 people and 16 more for 15,000, because condo sales and rents compound. The planned steps are about 40 days each.

A lower condo price delays every rating, so it cannot fix this alone. Moving 4 stars to day 72 with a price cut would move 5 stars to about day 95 and Torre to about day 112, still short of 126. The late steps need their own change, for example the 10,000 and 15,000 population thresholds or the late-game costs.
