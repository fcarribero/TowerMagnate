# Balance pass 1: simulated progression

Version 0.1 (draft), 3 February 2027. Owner: Game Designer. Task TM-136.

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

First run, seed 1 only, develop at 624bda5, 130 days: 2 stars on day 12, 3 stars on day 61, 4,453 people and no 4 stars by day 130. The other 4 seeds are still to run. Money is the gate: from day 14 on the bot spends every week's income and keeps the tower about $300,000 above its reserve.

Party halls and cinemas get no guests on develop (TM-37 is in the backlog), so they only cost upkeep. The bot leaves their levels empty until TM-37 lands. Party halls at 50 guests would pay back in about two weeks, so these numbers will move when it does.

## 3. Constants changed

To be filled in.

## 4. Results after tuning

To be filled in.
