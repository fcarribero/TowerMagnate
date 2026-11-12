# Balance pass 1: simulated progression

Version 0.3 (draft), 16 February 2027. Owner: Game Designer. Tasks TM-136 and TM-272.

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

## 6. Late-cost retune (9 February 2027)

The 10,000 and 15,000 population thresholds stay as in the GDD. The build cost and upkeep of the units used from 3 stars on were raised, then the 5-seed run was repeated to day 200 (`pnpm balance:progression --seeds N --days 200`, one process per seed). Three trials, medians in game days:

| Trial | Change | 3 stars | 4 stars | 5 stars | Torre |
|---|---|---|---|---|---|
| Section 5 | none | 18 | 61 | 81 | 97 |
| A | Suite $250,000 and $15,000 upkeep; express shaft $1,000,000 plus $400,000 per car, $50,000 upkeep per car; subway $3,000,000 and $250,000; cathedral $12,000,000 and $100,000 | 25 | 78 | 107 | 132 |
| B | Suite $150,000 and $10,000; express shaft $600,000 plus $250,000 per car, $30,000 per car; subway and cathedral as in A | 19 | 67 | 93 | 119 |
| C (kept) | As B, cathedral $35,000,000 and $200,000 upkeep | 19 | 67 | 93 | 146 |

Trial A put 3 stars and 4 stars outside their ranges, because the suite and the express shaft are paid for before 4 stars. Trial B brought 4 stars back, and its Torre came 8 days early. The cathedral is the last purchase before Torre, so its price moves Torre and leaves the earlier ratings alone.

Constants kept in `packages/shared/src/balance.ts`:

| Constant | Before | After |
|---|---|---|
| Suite build cost | $100,000 | $150,000 |
| Suite weekly upkeep | $6,000 | $10,000 |
| Express shaft | $400,000 plus $150,000 per car | $600,000 plus $250,000 per car |
| Express car weekly upkeep | $20,000 | $30,000 |
| Subway station build cost | $1,000,000 | $3,000,000 |
| Subway station weekly upkeep | $100,000 | $250,000 |
| Cathedral build cost | $3,000,000 | $35,000,000 |
| Cathedral weekly upkeep | $0 | $200,000 |

The bot priced a new shaft at a fixed $550,000 or $280,000. It now reads the first shaft and car price from the catalog.

### Results, constants of this section

| Rating | Seed 1 | Seed 2 | Seed 3 | Seed 4 | Seed 5 | Median | Target |
|---|---|---|---|---|---|---|---|
| 2 stars | 2 | 2 | 2 | 2 | 2 | 2 | by 7 |
| 3 stars | 19 | 19 | 22 | 19 | 19 | 19 | 14 to 21 |
| 4 stars | 67 | 66 | 71 | 67 | 67 | 67 | 54 to 72 |
| 5 stars | 93 | 94 | 92 | 92 | 95 | 93 | 89 to 121 |
| Torre | 146 | 146 | 146 | 146 | 146 | 146 | 126 to 168 |

Every median is inside its range and no seed reaches 5 stars before day 84. Seed 3 reaches 3 stars on day 22 and 4 stars on day 71, which is the slowest seed; the medians are what the targets apply to. A rerun of seed 4 gave a byte-identical report.

## 7. First week cash and upkeep (16 February 2027, TM-272)

### 7.1 What the bot shows

The first Monday charge is step 60,480, the end of game day 7. The bot at seeds 1 and 3, constants of section 6, ended the first week with these ledger totals:

| Line | Seed 1 | Seed 3 |
|---|---|---|
| Rent | $530,000 | $530,000 |
| Hotel | $412,000 | $444,000 |
| Condo sales | $7,000,000 | $7,000,000 |
| Venues | $56,000 | $59,000 |
| Construction | -$9,661,500 | -$9,701,500 |
| First Monday upkeep | -$200,000 | -$204,000 |

Rent alone covers the first Monday upkeep 2.6 times, and rent with hotel takes it to 4.7 times. The bot never lacks money for the charge: cash after the Monday charge is $118,500 on seed 1 and $112,500 on seed 3, and the starting funds of $2,000,000 stay as they are. The bot's tower is built from condo sales, so the margin is larger than a player's; the figures in the task description (upkeep $268,000 against rent $440,000) are also covered by rent.

Two things in the task description no longer hold. The doubled upkeep for cars, security and housekeeping was undone by TM-136 (section 3), and the table already had those lines at the GDD values. The lobby line is the one that still differed, along with the escalator and the parking ramp.

### 7.2 Constants changed

Three upkeep lines in `WEEKLY_UPKEEP` go back to the GDD table, with economy.md 8.2, E-43 and E-44 and the engine and shared tests:

| Constant | Before | After | Reason |
|---|---|---|---|
| Lobby upkeep per column at 3 stars | $500 | $300 | GDD value; 152 columns cost $76,000 a week at 3 stars and now cost $45,600 |
| Lobby upkeep per column at 4 stars or more | $1,500 | $1,000 | GDD value; 152 columns cost $228,000 and now $152,000 |
| Escalator weekly upkeep | $10,000 | $5,000 | GDD value |
| Parking ramp weekly upkeep | $20,000 | $10,000 | GDD value |

The lobby upkeep starts at 3 stars, when the bot has to run main lobby out to the edge of the site to reach 1,000 people (section 2.3), so it lands in weeks when cash is short. Escalators and parking ramps are few, so their change is small.

Lines that still differ from the GDD table, each on purpose and measured in an earlier section: express car $30,000 (GDD $20,000) and subway station $250,000 (GDD $100,000), both from the late-cost retune of section 6. The suite, hotel rooms, party hall and cathedral are not in the GDD table.

### 7.3 Results

Seeds 1 to 5, `pnpm balance:progression --seeds N --days 45`, one process per seed. Game day each rating came, with the same bot as section 6.

| Rating | Seed 1 | Seed 2 | Seed 3 | Seed 4 | Seed 5 | Median | Target |
|---|---|---|---|---|---|---|---|
| 2 stars | 2 | 2 | 2 | 2 | 2 | 2 | by 7 |
| 3 stars | 19 | 19 | 22 | 19 | 19 | 19 | 14 to 21 |

Cash at the end of game day 7, after the first Monday charge: $118,500, $98,500, $112,500, $99,000 and $118,000. The 3-star days are the same as before the change on every seed. The runs stop at day 45, so 4 stars, 5 stars and Torre were not rerun; a 100-day run of five seeds did not finish within the working day. The change removes $16,000 a week at 3 stars and $76,000 at 4 stars from a tower of 152 lobby columns, against weekly income of several million at 4 stars, so 4 stars at day 67 is expected to move by a day or two and stay inside 54 to 72. A 200-day rerun is open for the next balance pass.

## 8. Venue population share and medical check (TM-273)

### 8.1 Medical sufficiency

The scenario with 918 leased offices and 9 medical centers shows no medical failure. No constant changed for it, and the shared and medical tests pass.

### 8.2 Venue share of population

The share is venues divided by total population, read with `populationOf` on the progression bot of section 1, seed 1 and seed 3. Venues count the previous-day visits of fast food, restaurants and shops (stars.md 3.1).

| Rating | Seed | Game day | Venues | Total | Share |
|---|---|---|---|---|---|
| 3 stars | 1 | 19 | 432 | 1,091 | 39.6% |
| 3 stars | 3 | 22 | 485 | 1,258 | 38.6% |
| 4 stars | 1 | 65 | 2,794 | 5,530 | 50.5% |
| 5 stars | 1 | 89 | 5,614 | 10,277 | 54.6% |

The 5-star share is 54.6%, against the target of 30% to 36%. Seed 3 did not reach 5 stars within the working day.

### 8.3 Constants changed

None. A trial that halved `OUTSIDE_CUSTOMER_BASE` gave a 3-star share of 39.2% on seed 1, the same as before, so outside customers are not what drives the share. The trial did not reach 4 or 5 stars and was reverted. The acceptance for the 5-star share is not met and stays open. The next step is to split venue visits by source (workers, residents, hotel guests, outside customers) at 5 stars before choosing a constant.

## 8.5 Seed 3 at 3 stars (TM-311, 8 March 2027)

### 8.5.1 Method

One process, seed 3, 100 days, develop at 2b7ee40 (engine and shared identical to the current develop apart from version numbers). A probe called `nextStarRequirements` and `populationOf` at the end of every weekday and logged each requirement of the next step as met or unmet. The probe was a temporary script and is not committed. Day numbers below count from 1.

### 8.5.2 Result

Seed 3 does not stay at 3 stars on this develop. It reaches 3 stars on day 22, 4 stars on day 67 and 5 stars on day 93, and is at 5 stars with 10,670 population on day 100 (cathedral and wedding unmet, as expected before the Torre rank). The 17,482 population at 3 stars in the TM-296 notes of 2 and 4 March does not appear in this run: population on day 66 is 5,044.

First weekday on which each 3 to 4 requirement is met, with the numbers of that day:

| Requirement | First met | Numbers |
|---|---|---|
| Suites (2) | day 22 | 4 suites |
| Parking, no failure | day 24 | last failure at step 203,674 (day 24); failures return on later weekdays until day 46, last at step 390,960 |
| VIP approved | day 29 | flag set by the first approved visit |
| Medical | day 46 | 2 medical centers built; last medical failure at step 386,964 |
| Recycling | day 57 | 2 centers for 4,391 population (2 x 2,500 = 5,000) |
| Population 5,000 | day 66 | 5,044 |

All five other requirements are met from day 57 to day 65 while population is 4,391 to 4,914. Population is the last gate, and the promotion comes at the first check after it passes 5,000 (4 stars on day 67, population 5,370). The progression bot builds the medical centers at 60% of the threshold and the recycling centers at 80% (`medicalAction`, `recyclingAction`), and each was in place before population reached 5,000, so the bot has no gap on this seed.

### 8.5.3 Decision

Not an engine bug, not a bot gap and not a balance constant: the stall in the notes does not reproduce. The star rules in `stars.ts` match stars.md 5 for all five requirements. The likely cause is that the 2 March run was taken on the TM-296 branch while the venue-share experiments (`OUTSIDE_CUSTOMER_BASE` x0.4, office lunch chance 0.5) were being tried, which changes population and cash for the whole run. This is a guess: the branch state of that run was not kept, so it cannot be confirmed.

No linked fix task is created and no constant changed. Seed 3 reaches 4 stars on day 67 and 5 stars on day 93, so the five-seed milestone acceptance of TM-144 is not blocked by seed 3.

### 8.5.4 Next step

BE re-runs seed 3 for TM-296 (D2) from clean develop before and after the lunch-chance change, and records the 3, 4 and 5 star days. If seed 3 stalls again after a constant change, the star check log of 8.5.1 shows which requirement fails; the first suspect is recycling, since `recyclingAction` sizes the centers from population at the moment it builds and population can pass 2,500 per center faster than the bot adds them.
