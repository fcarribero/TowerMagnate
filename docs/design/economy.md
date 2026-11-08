# Economy, contracts and upkeep

Version 1.0, 10 November 2026. Owner: Game Designer. Task TM-9.

This document defines how money enters and leaves a tower: leases for offices and shops, hotel stays, condo sales, daily income of food and entertainment venues, the cinema film, weekly upkeep and the finance ledger. Values come from `docs/GDD.md` (section Economía). Where the GDD leaves a point open, or where a GDD value is changed, the decision is marked "Design call" with a short reason. Section 11 lists every GDD Economía value and where it ends up. The numbered rules at the end are the contract for the engine (`packages/engine`), for the balance constants (`packages/shared`, TM-6) and for QA.

Construction prices, demolition refunds and what happens to a lease or a sale on demolition are in the construction spec (TM-8, `docs/design/construction.md`, section 8). Unit evaluation (good, fair, poor) is defined in TM-13. When tenants, buyers, guests and customers show up is defined in TM-10 (schedules) and TM-39 (tenant demand). Event payments (ransom, helicopter, treasure) are defined in TM-15. This document only says when those systems touch money and how the ledger records it.

## 1. Time units

All times in this document use the engine clock from the construction spec:

| Unit | Engine steps | Real time |
|---|---|---|
| 1 game minute | 6 | 0.625 s |
| 1 game hour | 360 | 37.5 s |
| 1 game day | 8,640 | 15 min |
| 1 game week | 60,480 | 1 h 45 min |

A tower starts at step 0, Monday 1 January of year 1, 00:00. Weeks start on Monday at 00:00, so a week starts at every step that is a multiple of 60,480. "Day D" means the calendar day that contains a step, and "at 10:00" means the first step of that minute.

All money is a whole number of dollars. There are no cents and no rounding anywhere in this document; every amount is an integer from a table.

## 2. Balance

- A new tower starts with $2,000,000. There are no loans.
- The balance never goes above $99,999,999. Any income that would push it higher is credited only up to the cap; the rest is lost and is not recorded in the ledger.
- The balance can go below $0 through upkeep, venue losses, condo buybacks and event costs. These charges always apply in full, whatever the balance.
- With a balance below $0, construction is blocked (construction spec, rule C-54). Changing the film is also blocked (section 7.3). Everything else keeps running, including leases, sales and upkeep.
- Design call: there is no game over and no lower limit in the simulation. A tower in debt keeps earning rent and can recover. The UI shows the balance with a minus sign. The original had no loss condition either.

## 3. Price levels

Offices, shops, hotel rooms and condos have four price levels: alto, normal, bajo and mínimo. A new unit is placed at normal. The player changes the level from the unit's inspection window.

| Unit | Change allowed | When the new level takes effect |
|---|---|---|
| Office, shop | Always | At the next weekly payment. The current lease keeps running. |
| Hotel room | Always | At the next check-in. Guests already staying paid at check-in and are not affected. |
| Condo | Only while unsold | At the sale. After the sale the command is rejected with `PRICE_LOCKED`. |

The price level also changes the unit's evaluation score (TM-13): alto adds, normal changes nothing, bajo subtracts and mínimo always passes. A price change does not trigger an evaluation.

Changing the price level is free and works at any balance.

## 4. Leases: offices and shops

### 4.1 Rent per week

| Unit | Alto | Normal | Bajo | Mínimo |
|---|---|---|---|---|
| Oficina | $15,000 | $10,000 | $5,000 | $2,000 |
| Local comercial | $20,000 | $15,000 | $10,000 | $4,000 |

### 4.2 Lease cycle

A tenant moves in when TM-39 says so. The step of the move-in is the lease anchor `A`. From then on everything happens at exact multiples of one week after the anchor:

- At `A`, the tenant signs a 4-week lease and pays week 1 at the current price level.
- At `A + 1 week`, `A + 2 weeks` and `A + 3 weeks`, the tenant pays weeks 2, 3 and 4 at the price level in force at that step.
- At `A + 4 weeks` the lease ends and the tenant evaluates the unit (TM-13). Good or fair: the tenant renews. The renewal is a new 4-week lease whose anchor is this step, and week 1 of it is paid at once. Poor: the tenant leaves, pays nothing more, and the unit goes back to "En alquiler".

Design call: payments happen at the same time of day as the move-in, not at 00:00. The GDD says "the same weekday as the move-in"; keeping the exact time as well makes every week exactly 60,480 steps long, including the first one, and spreads payments across the day instead of piling them at midnight. A tenant who moved in on Tuesday at 09:12 pays every Tuesday at 09:12.

An office or shop with no tenant earns nothing and costs nothing beyond its share of upkeep (section 8). Offices are closed on Saturday and Sunday, but the rent is weekly and does not change on those days.

When a tenant leaves (poor evaluation, early leave in 4.3, or demolition), the unit is "En alquiler" at once, and a new tenant can move in on the same day. A new tenant starts a new lease with its own anchor.

### 4.3 Shop early leave

The GDD says a shop leaves before the end of its lease if it goes a full week with very few customers. Design call, defining "very few":

- A shop's weekly customer count is the number of customer visits that started inside the shop during the 7 days before the check, that is between the step one week earlier and the check step.
- The check runs at every weekly payment step of the lease after the first one, and at the evaluation step (`A + 1 week` to `A + 4 weeks`). So every check covers a full week in which the shop had this tenant.
- If the weekly customer count is below 70, the tenant leaves at that step instead of paying or evaluating. The unit goes back to "En alquiler".

Seventy is an average of 10 customers a day. TM-10 plans a shop that is reachable and not stressed to see about 25 customers a weekday and 30 on weekend days, about 185 a week, so the rule only catches shops that are badly connected or on empty floors. Lower price levels bring more customers (TM-10), which gives the player a way to save a weak shop before it leaves.

When a shop leaves early the news line shows "Un local se fue por falta de clientes." (`news.shopLeftNoCustomers`).

## 5. Hotel

### 5.1 Price per night

| Habitación | Alto | Normal | Bajo | Mínimo |
|---|---|---|---|---|
| Simple | $3,000 | $2,000 | $1,500 | $500 |
| Doble | $4,500 | $3,000 | $2,000 | $800 |
| Suite | $9,000 | $6,000 | $4,000 | $1,500 |

### 5.2 Stay

- Check-in is the step at which the first guest of the party reaches the room. Check-in can only happen from 12:00 to 23:00 of a day. Guests who have not reached the room by 23:00 give up and leave (TM-10); nobody pays.
- At check-in the party picks a number of nights `n` and pays `n` times the room's price at the current level, in one payment. A double room or a suite is paid once per room, not per guest.
- `n` is drawn from the engine's seeded RNG with these weights: 1 night 40%, 2 nights 30%, 3 nights 20%, 4 nights 10%. The average stay is 2 nights.
- A party that checks in on day D checks out at 10:00 on day D + n. Guests may leave the room from 06:00 (TM-10); at 10:00 the stay ends even if a guest is still in the room, and the room becomes "Sucia".
- Nothing is refunded if guests leave early, if the room is demolished, or if an event ends the stay.
- A room can only take a new check-in when it is "Limpia". Housekeeping (TM-10) cleans it.
- The VIP (TM-15) checks into a suite for 1 night and pays like any other party.

Design call on the stay weights: the GDD gives 1 to 4 nights without weights. Short stays are more common so the room turns over and needs cleaning often, which keeps housekeeping relevant.

## 6. Condos

### 6.1 Sale price

| Alto | Normal | Bajo | Mínimo |
|---|---|---|---|
| $200,000 | $150,000 | $100,000 | $40,000 |

### 6.2 Sale and buyback

- The condo sells when its first buyer moves in (TM-39). The player receives the price at the level in force at that step, and the engine records it as the condo's sale price. The step of the sale is the condo's anchor `S`.
- After the sale the price level cannot be changed (`PRICE_LOCKED`).
- At `S + 4 weeks`, `S + 8 weeks`, and every 4 weeks after that, the owners evaluate the condo (TM-13). Good or fair: nothing happens. Poor: the owners leave, the player pays back the recorded sale price, and the condo goes back to "En venta" with the price level unlocked. This charge applies even if the balance goes negative.
- A new buyer starts a new sale with a new anchor.

When owners leave, the news line shows "Los dueños de un departamento se fueron. Se les devolvió el dinero." (`news.condoBuyback`).

## 7. Food and entertainment venues

These units have no lease. They are paid by the day according to how many people came. Each venue has one payout per day, at a fixed time. A venue built after its opening time on a given day gets no payout that day, positive or negative (Design call: the original charged a loss for a fast food placed in the afternoon; in real time with no pause, that would punish building at the wrong minute).

A day's count for a venue is the number of visits that started inside it on that day, between its opening and its payout time. A person who visits twice counts twice.

### 7.1 Fast food and restaurant

| Venue | Opens | Payout at | Under 25 | 25 to 34 | 35 to 49 | 50 or more |
|---|---|---|---|---|---|---|
| Comida rápida | 08:00 | 20:00 | -$3,000 | +$2,000 | +$3,000 | +$5,000 |
| Restaurante | 17:00 | 23:00 | -$6,000 | +$4,000 | +$6,000 | +$10,000 |

Both venues open every day of the week. A loss applies in full even if it makes the balance negative.

### 7.2 Party hall

The party hall runs from 13:00 to 17:00 every day and pays at 17:00.

| Guests that day | Payout |
|---|---|
| Under 25 | $0 |
| 25 to 39 | $5,000 |
| 40 or more (capacity 50) | $10,000 |

Design call, changing the GDD's "$20,000 per day if anyone came": at $20,000 a day a $100,000 hall would pay for itself in 5 days and return 140% a week, far above any other unit, and a player at 3 stars could build 16 of them for over $2,000,000 a week. The original had the same problem and players used it as a cash machine. With brackets and the $20,000 weekly upkeep in section 8, a full hall nets $50,000 a week and pays back in a little over 2 weeks, which is still the best unit per dollar but no longer breaks the curve.

### 7.3 Cinema and film aging

The cinema has two shows a day: 14:00 to 16:00 and 19:00 to 21:00. Each show holds up to 120 people. The cinema pays at 21:00.

The day's audience is the number of people who entered the 14:00 show plus the number who entered the 19:00 show, divided by 2 and rounded down. That is the average audience per show.

| Day's audience | Payout |
|---|---|
| Under 40 | $0 |
| 40 to 79 | $2,000 |
| 80 to 99 | $10,000 |
| 100 or more | $15,000 |

Every cinema shows one film at a time. The film's age is the number of whole days since the film started: 0 on the day it starts, 1 the next day, and so on. A new cinema starts with a new film at age 0, included in the build price. The age caps how many people TM-10 can send to each show:

| Film age in days | Weeks | Show cap |
|---|---|---|
| 0 to 13 | 1 and 2 | 120 |
| 14 to 27 | 3 and 4 | 100 |
| 28 to 41 | 5 and 6 | 85 |
| 42 to 55 | 7 and 8 | 65 |
| 56 or more | 9 on | 35 |

The cap is a ceiling, not a promise: a cinema that is hard to reach gets fewer people. With full shows, a film earns $15,000 a day for 4 weeks, $10,000 a day in weeks 5 and 6, $2,000 a day in weeks 7 and 8, and nothing after that.

Changing the film:

- The player changes the film from the cinema's inspection window. It costs $300,000 and is recorded under "Películas".
- The command is rejected with `NEGATIVE_BALANCE` when the balance is below $0, and with `INSUFFICIENT_FUNDS` when the balance is below $300,000. A film change never makes the balance negative.
- The new film starts at age 0 on the day of the change. A show already running keeps its audience; the next show uses the new cap.
- There is no automatic change.

The first day a film reaches age 56, and then once every 7 days while it stays at 56 or more, the news line shows "Pocas entradas vendidas. Cambiá la película." (`news.cinemaChangeFilm`).

Design call on the curve: the GDD fixes the $300,000 change but not the aging. With this curve the best moment to change is at the end of week 6: the film earns $560,000, nets $260,000 after the change, about $43,000 a week. Changing at week 4 nets about $30,000 a week and waiting until week 8 about $36,000, so the player who pays attention earns more, and a forgotten cinema drops to $0 after 8 weeks. The cinema stays the weakest unit per dollar, as in the original, and is built for population and the 3-star unlock list, not for money.

## 8. Upkeep

### 8.1 Why the GDD table changes

The original charged upkeep and paid office and shop rent once per 3-day period. Here rent is weekly, so an office earns the same per charge as before, but hotels and venues are paid per night or per day and earn 7/3 times as much per week as they did per period. Three things follow:

1. If the GDD upkeep is kept as is, services cost 3/7 of what they did per day, and the hotel- and venue-heavy towers that appear from 2 stars on would grow much faster than the 5-star pacing goal allows.
2. Multiplying all upkeep by 7/3 would make it fair to hotels and venues but crush offices, which earn the same as before and are the main income below 3 stars.
3. A hotel room at full occupancy earns 2.8 times the weekly return of an office ($14,000 a week on $20,000 against $10,000 on $40,000). In the original the two were close.

Design call: per-unit upkeep doubles (a round factor between 1 and 7/3), lobby upkeep goes up by 1.5 because it sits mostly against office income, and two lines are added: hotel rooms and party halls. A hotel room's weekly upkeep equals one night at normal price, which is easy to remember and brings a double room or suite close to an office in return per dollar. Stairs, parking spaces, the medical center and the cathedral stay free, as in the GDD and the original.

### 8.2 Weekly upkeep table

| Item | GDD per week | This spec per week |
|---|---|---|
| Standard or service elevator car | $10,000 | $20,000 per car |
| Express elevator car | $20,000 | $40,000 per car |
| Escalator | $5,000 | $10,000 |
| Stairs | not listed | $0 |
| Housekeeping | $10,000 | $20,000 |
| Security | $20,000 | $40,000 |
| Medical center | not listed | $0 |
| Parking ramp | $10,000 | $20,000 per ramp |
| Parking space | not listed | $0 |
| Recycling center | $50,000 | $100,000 |
| Subway station | $100,000 | $200,000 |
| Lobby, below 3 stars | $0 per cell | $0 per column |
| Lobby, at 3 stars | $300 per cell | $500 per column |
| Lobby, at 4 stars or more | $1,000 per cell | $1,500 per column |
| Hotel single room | not listed | $2,000 |
| Hotel double room | not listed | $3,000 |
| Hotel suite | not listed | $6,000 |
| Party hall | not listed | $20,000 |
| Office, shop, condo, fast food, restaurant, cinema, cathedral | not listed | $0 |

Design call on lobby columns: the construction spec charges lobby per cell (columns × height), so a 3-high lobby costs three times as much to build. Upkeep counts columns only, so the stress benefit of a tall lobby is paid once at build time and not again every week. Main lobby and sky lobby columns both count. The star level used is the tower's level at the moment of the charge.

### 8.3 When upkeep is charged

- Upkeep is charged once a week, at Monday 00:00, starting with the second Monday (step 60,480). Step 0 charges nothing because the tower is empty.
- The charge counts what exists at that step. There is no proration: an elevator car added on Sunday at 23:59 pays a full week on Monday, and a car removed on Sunday pays nothing.
- Upkeep is charged as one ledger entry per item type in the table, not per object, so the finance window shows one line per type.
- Units count whatever their state: an empty office, a dirty or infested hotel room and a closed shop all pay their line.
- Upkeep applies in full even if it makes the balance negative.

When upkeep makes the balance negative, the news line shows "El mantenimiento dejó la caja en rojo. No se puede construir hasta recuperar." (`news.upkeepNegative`).

## 9. Ledger and finance window

### 9.1 Categories

Every change to the balance is one ledger entry with an amount and a category. Income amounts are positive and expenses negative.

| Category id | Spanish label | Sign | What goes in it |
|---|---|---|---|
| `rent` | Alquileres | + | Office and shop weekly payments |
| `hotel` | Hotel | + | Check-in payments |
| `condoSales` | Venta de departamentos | + | Condo sales |
| `venues` | Comercios y entretenimiento | + or - | Fast food, restaurant, cinema and party hall payouts and losses |
| `events` | Eventos | + or - | Treasure, ransom, helicopter (TM-15) |
| `construction` | Construcción | - or + | Construction costs; demolition refunds as positive entries |
| `upkeep` | Mantenimiento | - | Section 8 |
| `condoBuybacks` | Devolución de departamentos | - | Condo buybacks, including the charge on demolishing a sold condo |
| `films` | Películas | - | Film changes |

### 9.2 Weeks

- The ledger keeps two totals per category: the current week and the previous week.
- At Monday 00:00 the current week's totals become the previous week's totals, the old previous week is discarded, and the current week starts at 0 in every category. This roll happens before that Monday's upkeep, so the upkeep belongs to the week it pays for.
- The ledger records the amount actually applied to the balance. Income clipped by the cap is recorded only up to what was credited.
- Older weeks are not kept.

### 9.3 Finance window

The finance window (TM-18 owns the layout) shows the balance, then two columns, "Esta semana" and "Semana anterior", with one row per category, a "Total ingresos" row (sum of positive entries), a "Total gastos" row (sum of negative entries) and a "Resultado" row (the sum of both). A category with an entry of each sign (`venues`, `events`, `construction`) adds its positive entries to income and its negative entries to expenses; the window does not net them inside the category.

## 10. Order within a step

When several money events fall on the same step, the engine applies them in this order:

1. Ledger week roll (Monday 00:00 only).
2. Upkeep (Monday 00:00 from step 60,480 on).
3. Lease events in order of unit id: shop early-leave check, then payment or evaluation.
4. Condo evaluations in order of unit id.
5. Hotel check-outs, then check-ins, in order of unit id.
6. Venue payouts in order of unit id.
7. Player commands received for this step (construction, demolition, price changes, film changes), in the order received.
8. Event effects (TM-15).

Each event reads the balance left by the previous one. The order matters only for the cap and for commands that check the balance.

## 11. GDD Economía values

| GDD value | Where | Status |
|---|---|---|
| Start $2,000,000, no loans | 2 | Kept |
| Balance can go negative from upkeep | 2 | Kept, also from venue losses, buybacks and events |
| No construction with a negative balance | 2 | Kept |
| Cap $99,999,999 | 2 | Kept |
| All rent paid in advance | 4.2, 5.2 | Kept |
| 4-week leases, first week paid at move-in, weekly on the move-in weekday | 4.2 | Kept, same time of day too |
| Renew on good or fair, leave on poor | 4.2 | Kept |
| Office rent $15,000 / $10,000 / $5,000 / $2,000 | 4.1 | Kept |
| Shop rent $20,000 / $15,000 / $10,000 / $4,000 | 4.1 | Kept |
| Shop leaves after a full week with very few customers | 4.3 | Defined: under 70 customers in 7 days |
| Hotel check-in from 12:00, 1 to 4 nights, paid at check-in | 5.2 | Kept, check-in until 23:00, weights added |
| Check-out 10:00 of the last day, no new guest until cleaned | 5.2 | Kept |
| Single $3,000 / $2,000 / $1,500 / $500 | 5.1 | Kept |
| Double $4,500 / $3,000 / $2,000 / $800 | 5.1 | Kept |
| Suite $9,000 / $6,000 / $4,000 / $1,500 | 5.1 | Kept |
| Condo $200,000 / $150,000 / $100,000 / $40,000, sold once | 6 | Kept |
| Condo price changes only while unsold | 3, 6.2 | Kept |
| Condo evaluated every 4 weeks, refund on poor | 6.2 | Kept |
| Fast food -$3,000 / $2,000 / $3,000 / $5,000 at 25, 35, 50 | 7.1 | Kept, payout at 20:00 |
| Restaurant -$6,000 / $4,000 / $6,000 / $10,000 at 25, 35, 50 | 7.1 | Kept, payout at 23:00 |
| Cinema $0 / $2,000 / $10,000 / $15,000 at 40, 80, 100 | 7.3 | Kept, average audience per show |
| Cinema audience falls with film age | 7.3 | Defined: curve in 7.3 |
| Film change $300,000 | 7.3 | Kept |
| Party hall $20,000 a day if anyone came | 7.2 | Changed: $0 / $5,000 / $10,000 at 25 and 40 guests |
| Upkeep every Monday 00:00 | 8.3 | Kept |
| Upkeep table | 8.2 | Changed: doubled, lobby ×1.5 per column, hotel rooms and party hall added |

## 12. Balance check

These are planning numbers for the playtest balance pass, not engine rules. Each line uses normal prices, the unit's automatic floor, and the upkeep in section 8. "Expected use" is the assumption TM-10 is asked to match.

| Unit | Build cost | Expected use | Net per week | Weeks to pay back |
|---|---|---|---|---|
| Office | $44,500 | leased | $10,000 | 4.5 |
| Shop | $106,000 | leased | $15,000 | 7.1 |
| Single room | $22,000 | 70% of nights | $7,800 | 2.8 |
| Double room | $53,000 | 70% of nights | $11,700 | 4.5 |
| Suite | $105,000 | 70% of nights | $23,400 | 4.5 |
| Fast food | $108,000 | 35 to 49 a day; 50 or more on weekdays next to 6 or more offices | $21,000; $31,000 next to offices | 5.1; 3.5 next to offices |
| Restaurant | $212,000 | 35 to 49 a day | $42,000 | 5.0 |
| Party hall | $112,000 | 40 or more a day | $50,000 | 2.2 |
| Cinema | $515,500 | full, film changed every 6 weeks | $43,000 | 12 |
| Condo | $88,000 | sold, kept | $150,000 once | at sale |

Elevator cars, housekeeping, security and the rest are shared costs on top of these lines. A standard shaft with 4 cars costs $520,000 to build and $80,000 a week to run, the rent of 8 offices.

Pacing estimate: with weekly returns of 15% to 25% on most units after shared costs, a careful player compounds from $2,000,000 to the roughly $100,000,000 of total construction a 15,000-person tower needs in 18 to 24 game weeks, about 32 to 42 hours of connected play. Expected milestones: 2 stars in week 1, 3 stars in weeks 2 to 3, 4 stars around week 9, 5 stars around week 15, Tower after week 18. This matches the GDD goal of several game weeks spread over real days. The balance simulation (later task) checks these numbers and GD retunes the constants in `packages/shared` from its results.

## 13. Error codes and UI messages

| Code | Message in the UI |
|---|---|
| `PRICE_LOCKED` | El departamento ya está vendido. El precio no se puede cambiar. |
| `NOT_PRICED` | Esta unidad no tiene precio. |
| `NOT_A_CINEMA` | Solo el cine cambia de película. |
| `NEGATIVE_BALANCE` | No se puede construir con saldo negativo. (shared with construction) |
| `INSUFFICIENT_FUNDS` | No alcanza el dinero. (shared with construction) |

| News key | Text |
|---|---|
| `news.shopLeftNoCustomers` | Un local se fue por falta de clientes. |
| `news.officeLeft` | Una oficina quedó vacía. Los inquilinos no renovaron. |
| `news.shopLeftEvaluation` | Un local quedó vacío. Los inquilinos no renovaron. |
| `news.condoBuyback` | Los dueños de un departamento se fueron. Se les devolvió el dinero. |
| `news.cinemaChangeFilm` | Pocas entradas vendidas. Cambiá la película. |
| `news.upkeepNegative` | El mantenimiento dejó la caja en rojo. No se puede construir hasta recuperar. |

The messages catalog (TM-17, `docs/design/messages.md`) holds the final keys, texts, alert flags and limits.

## 14. Rules

Each rule ends with the code the engine returns when a command breaks it. "Outcome" rules describe a result and have no rejection code; they are marked `none`.

### Balance

E-01. A new tower has a balance of $2,000,000 at step 0. Error: none.

E-02. Income that would raise the balance above $99,999,999 is credited only up to $99,999,999; the excess is lost. Error: none.

E-03. Upkeep, venue losses, condo buybacks and event costs apply in full even when the balance goes or stays below $0. There is no lower limit and no game over. Error: none.

E-04. All amounts are whole dollars taken from the tables in this document; no amount is ever scaled or rounded. Error: none.

### Price levels

E-05. A newly placed office, shop, hotel room or condo has price level normal. Error: none.

E-06. A price change on a unit that is not an office, shop, hotel room or condo fails. Error: `NOT_PRICED`.

E-07. A price change on a sold condo fails. Error: `PRICE_LOCKED`.

E-08. A price change is free, works at any balance, and does not trigger an evaluation. Error: none.

E-09. A new office or shop price level is used from the next weekly payment; a new hotel level from the next check-in. Error: none.

### Leases

E-10. When a tenant moves into an office or shop at step `A`, the rent for the current price level (table 4.1) is credited at step `A` under `rent`. Error: none.

E-11. The tenant pays the rent for the price level in force at steps `A + 60,480`, `A + 120,960` and `A + 181,440`, and at no other step of that lease. Error: none.

E-12. At step `A + 241,920` the tenant evaluates the unit. On good or fair, a new lease starts with anchor `A + 241,920` and its first week is paid at that step. On poor, the tenant leaves, nothing is paid, and the unit is "En alquiler". Error: none.

E-13. A unit with no tenant produces no rent. Error: none.

E-14. A vacated office or shop can take a new tenant on the same day; the new lease has its own anchor. Error: none.

### Shop early leave

E-15. At each of the steps `A + 60,480`, `A + 120,960`, `A + 181,440` and `A + 241,920`, before paying or evaluating, the engine counts the shop's customer visits that started in the preceding 60,480 steps. If the count is below 70, the tenant leaves at that step, pays nothing, and the shop is "En alquiler". Error: none.

E-16. The early-leave check never runs at the move-in step `A`. Error: none.

E-17. Offices never leave early; they only leave at an evaluation step or on demolition. Error: none.

### Hotel

E-18. A check-in can only happen from 12:00 to 23:00. A party that has not reached the room by 23:00 does not check in and pays nothing. Error: none.

E-19. At check-in the party draws `n` from the seeded RNG with weights 1: 40%, 2: 30%, 3: 20%, 4: 10%, and `n` times the nightly price (table 5.1, current level) is credited once per room under `hotel`. Error: none.

E-20. A stay that checks in on day D ends at 10:00 on day D + n, and the room becomes "Sucia" at that step if it is not already. Error: none.

E-21. A room that is not "Limpia" cannot take a check-in. Error: none.

E-22. No part of a hotel payment is ever refunded. Error: none.

E-23. The VIP checks into a suite for 1 night and pays the suite price at the current level. Error: none.

### Condos

E-24. When a condo's first buyer moves in at step `S`, the condo price for the current level (table 6.1) is credited under `condoSales` and recorded as the sale price. Error: none.

E-25. A sold condo is evaluated at `S + 241,920` and every 241,920 steps after that. On poor, the owners leave, the recorded sale price is charged under `condoBuybacks`, and the condo is "En venta" with its price level unlocked. On good or fair, nothing changes. Error: none.

E-26. A sold condo produces no other income. Error: none.

### Venues

E-27. Fast food pays once a day at 20:00 and restaurants at 23:00, by the day's visit count: under 25, 25 to 34, 35 to 49, 50 or more, with amounts from table 7.1, under `venues`. Error: none.

E-28. Fast food and restaurant losses apply even if the balance goes negative. Error: none.

E-29. The party hall pays once a day at 17:00: $0 under 25 guests, $5,000 for 25 to 39, $10,000 for 40 or more, under `venues`. Error: none.

E-30. A venue placed after its opening time (fast food 08:00, restaurant 17:00, party hall 13:00, cinema 14:00) has no payout that day. Error: none.

E-31. A venue's day count only includes visits that started that day between its opening time and its payout time. Error: none.

### Cinema

E-32. The cinema pays once a day at 21:00, using the average audience per show: (14:00 show + 19:00 show) divided by 2, rounded down. Payout: $0 under 40, $2,000 for 40 to 79, $10,000 for 80 to 99, $15,000 for 100 or more, under `venues`. Error: none.

E-33. A show never admits more people than the cap for the film's age: 120 for days 0 to 13, 100 for 14 to 27, 85 for 28 to 41, 65 for 42 to 55, 35 from day 56. Error: none.

E-34. A new cinema starts with a film at age 0 on the day it is placed. Error: none.

E-35. A film change sets the age to 0 on the current day and charges $300,000 under `films`. Error: none.

E-36. A film change fails when the balance is below $0. Error: `NEGATIVE_BALANCE`.

E-37. A film change fails when the balance is below $300,000. Error: `INSUFFICIENT_FUNDS`.

E-38. A film change on a unit that is not a cinema fails. Error: `NOT_A_CINEMA`.

E-39. A show already in progress keeps its audience after a film change; the next show uses the new cap. Error: none.

E-40. The film never changes by itself. Error: none.

E-41. On the first day a film is 56 days old, and every 7 days after while it is not changed, the news line shows `news.cinemaChangeFilm`. Error: none.

### Upkeep

E-42. Upkeep is charged at every step that is a positive multiple of 60,480 (Monday 00:00). Step 0 charges nothing. Error: none.

E-43. Weekly upkeep: $20,000 per standard or service car, $40,000 per express car, $10,000 per escalator, $20,000 per housekeeping, $40,000 per security, $20,000 per parking ramp, $100,000 per recycling center, $200,000 per subway station, $2,000 per single room, $3,000 per double room, $6,000 per suite, $20,000 per party hall. Everything else is $0. Error: none.

E-44. Lobby upkeep is charged per lobby column (main and sky): $0 below 3 stars, $500 at 3 stars, $1,500 at 4 stars or more, using the star level at the step of the charge. Lobby height does not change it. Error: none.

E-45. Upkeep counts every object that exists at the step of the charge, whatever its state, and nothing that does not. There is no proration. Error: none.

E-46. Upkeep is written as one `upkeep` ledger entry per item type with a non-zero total. Error: none.

E-47. Upkeep applies in full even if the balance goes negative. If the balance was $0 or more before the charge and is below $0 after it, the news line shows `news.upkeepNegative`. Error: none.

### Ledger

E-48. Every balance change creates exactly one ledger entry with its category from table 9.1. Over any span of steps, the balance at the end equals the balance at the start plus the sum of the entries in that span. Error: none.

E-49. At every positive multiple of 60,480, before upkeep, the current week's totals replace the previous week's totals and the current week resets to 0 in every category. Error: none.

E-50. Demolition refunds are recorded as positive `construction` entries; the charge for demolishing a sold condo is a `condoBuybacks` entry. Error: none.

E-51. The ledger records the amount actually applied to the balance, after the cap. Error: none.

E-52. When several money events share a step they are applied in the order of section 10. Error: none.
