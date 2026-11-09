# People types and daily schedules

Version 1.0, 12 November 2026. Owner: Game Designer. Task TM-10.

This document defines who lives in, works in and visits a tower: how many people each unit creates, when each person moves and where to, how visitors pick a venue, how many customers a venue gets per day, hotel bookings, medical and parking demand from 3 stars, and how vacant offices, shops and condos find tenants. Values come from `docs/GDD.md` (section Personas) and the SimTower research notes, adapted to a linear clock and a Monday-to-Sunday week. Where the GDD leaves a point open, or where a GDD value changes, the decision is marked "Design call" with a short reason. Section 19 maps every row of the GDD Personas table to the section that covers it. The numbered rules at the end are the contract for the engine (`packages/engine`), the balance constants (`packages/shared`) and QA.

Related specs: construction (TM-8, `docs/design/construction.md`) for what demolition does to people; economy (TM-9, `docs/design/economy.md`) for leases, hotel stays, venue payouts and film aging. Routing costs and walking limits are TM-11, elevator dispatch is TM-12, stress and unit evaluation are TM-13, stars and population are TM-14, events (bomb, fire, VIP trigger) are TM-15, and housekeeping room selection and infestation are TM-16. This document only says when people want to move, where they go and what they do there. The engine implementation of tenant move-in is TM-39.

## 1. Time conventions

The engine runs one step per 10 game seconds, the clock from the construction and economy specs:

| Unit | Engine steps | Real time |
|---|---|---|
| 1 game minute | 6 | 0.625 s |
| 1 game hour | 360 | 37.5 s |
| 1 game day | 8,640 | 15 min |
| 1 game week | 60,480 | 1 h 45 min |

Step 0 is Monday 1 January of year 1, 00:00 UTC. Weekdays are Monday to Friday; the weekend is Saturday and Sunday. There are no holidays. "At 12:00" means the first step of that minute.

A time window is written `[start, end)`: it includes `start` and excludes `end`. All drawn times are whole game minutes, so every drawn step is a multiple of 6.

### 1.1 Drawing a time from a window

Most schedules below give a window split into parts with weights, for example "07:30 to 08:00 20%, 08:00 to 09:00 60%, 09:00 to 09:30 20%". To draw a time from such a window, the engine:

1. draws one part using the weights, then
2. draws a whole minute uniformly inside that part, `[part start, part end)`.

All draws use the tower's seeded RNG (TM-7). A probability "p%" means one RNG draw that succeeds with chance p/100.

### 1.2 Draw order within a step

Several things can need random draws in the same engine step. The engine makes them in this fixed order, so the same seed and commands always consume the RNG in the same sequence:

1. Events that happen at the step's clock time, in this order: the 00:00 infestation check (TM-16, `docs/design/hotel.md` 7.1), the 00:00 plans (section 1.3 below), the 00:00 customer counts and appearance times, the 03:00 night move, the hourly prospect rolls, the 12:00 VIP booking and hotel booking rolls.
2. Within one of those events, units are processed in increasing unit id and people in increasing person id.
3. Then every person with something due at this step, in increasing person id. All the draws of one person finish before the next person starts.
4. Several draws for one subject follow the order in which the rule's text gives them.

A person or unit created during the step is processed at the end of its phase, after the ones that already existed, in creation order. A draw is never made twice for the same subject in the same step.

### 1.3 The daily plan

At 00:00 every day the engine draws a daily plan for each person who has one (office workers, residents, hotel guests whose stay continues that day), in increasing person id. A plan is a short list of timed intentions such as "leave for work at 08:14" or "go shopping at 15:02". Person ids are assigned in creation order and never reused, so the same seed and the same player commands always give the same plans.

People created during a day (new tenants, new owners, hotel parties) follow the rules of their section for the rest of that day and get a normal plan from the next 00:00.

Design call: plans are drawn once a day instead of rolling a chance at every step, as the original did. A drawn time is easy to test and to show in the person inspection window ("Destino: oficina, 08:14"), and the distribution is the one written in this document with no hidden dependency on the step length.

## 2. Person types and spawn counts

| Type | Id | Created by | Count | Counts in population (TM-14) | Transport allowed |
|---|---|---|---|---|---|
| Office worker | `officeWorker` | occupied office | 6 per office | yes, 6 per occupied office | stairs, escalators, standard and express elevators |
| Resident | `resident` | sold condo | 3 per condo | yes, 3 per sold condo | same |
| Hotel guest | `hotelGuest` | hotel stay | 1 per single room, 2 per double room, 2 per suite | yes, from check-in until the stay ends (TM-14) | same |
| Customer | `customer` | fast food, restaurant, retail shop | formula in section 11 | through the venue's previous-day count | same |
| Cinema audience | `audience` | cinema | up to the show cap, section 12 | no | same |
| Party guest | `partyGuest` | party hall | up to 50 a day, section 13 | no | same |
| Maid | `maid` | housekeeping | 6 per housekeeping unit | no | stairs and service elevators only |
| Security guard | `guard` | security office | 6 per security office | no | stairs, escalators, standard and express elevators |
| VIP | `vip` | VIP event (TM-15) | 1 | yes, as a hotel guest | same as hotel guests |
| Wedding guest | `weddingGuest` | cathedral | 40 per wedding attempt | no | same as hotel guests |
| Prospect | `prospect` | vacant office, shop or condo | 1 per successful roll, section 18 | no | same as hotel guests |

Design call on guards: the GDD gives security no people. Guards need a body to search for a bomb and fight a fire in TM-15, and 6 matches housekeeping. `packages/shared` gets `capacity: { role: 'guards', people: 6 }` for `security`.

Design call on prospects: a tenant, a buyer or a shop owner visits the unit before moving in. This is how "unreachable units never get tenants" is enforced, and the player sees someone walk to the unit before it changes state.

A hotel party is always as big as the room: 1, 2 or 2. Design call: the GDD table lists suites with 2 people and the research notes agree; parties are not drawn smaller so that room population is predictable.

## 3. Entrances

People who come from outside the tower appear at an entrance and leave through an entrance.

| Entrance | Where the person appears | Who uses it |
|---|---|---|
| Street | Level 1, at the left or right end of the main lobby (50% each) | everyone by default |
| Subway | Level -7, the top row of the subway station, at a random column of the station | see below |
| Car | Level of the person's assigned parking space, at that space | parking holders with a space (section 17) |

When the tower has a subway station, each trip that starts or ends outside picks the subway with 25% probability, except trips by car holders with a space, the VIP, wedding guests and prospects, which never use it. A person leaves through the same entrance they came in by, unless that leg has no route.

If a trip from the subway has no route (TM-11), the person switches to the street entrance for that trip at once, with no stress penalty. The same applies to a trip toward the subway.

Design call: the subway is an extra door, and the GDD's "estación de subte" requirement for 5 stars gets a gameplay reason: a quarter of visitors arrive at the bottom of the tower and need transport up from there.

## 4. Trips

A trip is one move from a place to another place, planned and walked by the routing rules in TM-11. People plan one leg at a time and pick the cheapest option (GDD Recorridos). A trip ends when the person reaches the destination.

There are two kinds of trips:

- Required trips: going to work, going home, a hotel party going to the room, leaving the hotel, maids going back to their unit, wedding guests going to the cathedral.
- Optional trips: lunch, shopping, dinner, outings, medical visits and every customer, audience, party or prospect trip.

When a required trip has no route, the person waits 2 game hours (720 steps) where they are and tries again (GDD). TM-13 adds the no-route stress penalty on every failed attempt.

When an optional trip has no route, the trip is cancelled. A person inside the tower stays where they are; a visitor from outside leaves the simulation at once. No stress is recorded for a cancelled optional trip, except for medical visits (section 16), whose failure counts as unmet demand.

Design call: the GDD's 2-hour retry is kept for required trips. Retrying optional trips would fill lobbies with people waiting for shops they will never reach, and penalizing them would make a tower with no shops look stressed.

### 4.1 Night reset

At 03:00 every day, every person who is still on a trip or waiting for a retry is moved at once to their night place: office workers, customers, audience, party guests, wedding guests and prospects leave the simulation; residents go to their condo; hotel guests go to their room; maids and guards to their unit. The trip they were on counts as one failed attempt in TM-13.

Design call: this stops stranded people from piling up over days in a broken tower, and 03:00 is the quietest time of the clock.

### 4.2 Removal

A person stops existing when their unit stops holding them: the office tenant leaves (poor evaluation or demolition), the condo owners leave, the hotel stay ends and the guest has left, the housekeeping or security unit is demolished. Removal is immediate, wherever the person is, including elevator queues and cars (construction spec 8.5).

## 5. Choosing a venue

When a person wants a venue of a type (fast food, restaurant, retail shop, medical center), the engine:

1. Builds the candidate list: every venue of that type that is open at the departure step (section 11.1) and is not full at that step (section 11.2). A retail shop without a tenant is never a candidate.
2. Draws up to 3 distinct candidates from the list, weighted by attraction: 1 for every venue, except retail shops, which use their price level: alto 0.5, normal 1, bajo 1.5, mínimo 2.
3. Plans the first leg toward each drawn candidate (TM-11) and picks the one with the lowest route cost. Ties go to the lower unit id.
4. If no drawn candidate has a route, or the list was empty, the visit fails.

When a trip lists several venue types with weights, the engine first draws the type. If that type has no candidate, it tries the other listed types in order of weight, highest first, before failing.

A person who reaches a venue that is closed or full on arrival does not enter, the visit fails, and they go back where they came from (a person from outside leaves). A visit counts for the venue (economy 7) only when the person enters.

## 6. Office workers

Six workers per office with a tenant. Workers only come on weekdays. On Saturday and Sunday their plan is empty and they stay outside.

Workers of an office that got its tenant during a day start coming on the next weekday.

### 6.1 Weekday plan

| Intention | Window and weights | What happens |
|---|---|---|
| Arrive | 07:30 to 08:00 20%, 08:00 to 09:00 60%, 09:00 to 09:30 20% | Appear at an entrance and travel to the office. |
| Lunch | drawn only for workers at the office: 80% go out, 20% stay at the desk | |
| Lunch departure | 12:00 to 12:30 50%, 12:30 to 13:00 35%, 13:00 to 13:30 15% | Visit a fast food (section 5), stay 30 minutes, go back to the office. |
| Leave | 17:00 to 17:30 40%, 17:30 to 18:00 30%, 18:00 to 18:30 20%, 18:30 to 19:00 10% | Travel from the office to an entrance and leave. |
| Medical | from 3 stars, 10% per worker per weekday | At the leave time, go to a medical center first (section 16). |

If the lunch departure comes while the worker is not at the office (still arriving, or waiting for a retry), the worker skips lunch. If the leave time comes while the worker is not yet at the office, the worker gives up the arrival and stays outside. If the leave time comes while the worker is at lunch, the worker goes back to the office after lunch and leaves from there at once.

If the lunch visit fails, the worker goes back to the office.

Design call on lunch at fast food only: the GDD says lunch is at fast food or a restaurant, but the GDD customer hours and the economy spec open the restaurant at 17:00, and only visits after opening count. A lunch at a closed restaurant would earn nothing. The restaurant gets its customers at dinner instead (sections 7, 8 and 11).

## 7. Residents

Three residents per sold condo. A resident's night place is the condo. Residents live in the tower every day of the week.

When a condo is sold, the prospect who bought it becomes resident 1 and stays in the condo; residents 2 and 3 appear in the condo at the same step. All three get their first plan at the next 00:00.

### 7.1 Weekday plan

Each resident draws whether they go out to work (70%) or stay home (30%).

| Who | Intention | Window and weights | What happens |
|---|---|---|---|
| Goes out | Leave | 06:30 to 07:30 30%, 07:30 to 08:30 50%, 08:30 to 09:00 20% | Travel to an entrance and leave. |
| Goes out | Return | 17:00 to 18:00 30%, 18:00 to 19:00 35%, 19:00 to 20:00 25%, 20:00 to 21:00 10% | Appear at an entrance and travel home. |
| Stays home | Shopping, 60% | 10:00 to 13:00 40%, 13:00 to 17:00 60% | Visit retail 60% or fast food 40%, stay 45 minutes, go home. |
| Anyone home at the time | Dinner, 15% | 19:30 to 21:00, one part | Visit a restaurant, stay 60 minutes, go home. |

A dinner whose time comes while the resident is not home is skipped.

### 7.2 Weekend plan

Nobody goes out to work. Each resident draws two trips on its own:

| Intention | Chance | Window and weights | Venue |
|---|---|---|---|
| Morning trip | 60% | 10:00 to 11:00 40%, 11:00 to 12:00 60% | retail 60%, fast food 40% |
| Afternoon trip | 60% | 14:00 to 16:00 50%, 16:00 to 18:00 50% | retail 60%, fast food 40% |
| Dinner | 25% | 19:00 to 21:00, one part | restaurant |

A trip whose time comes while the resident is not home (still on the previous trip) is skipped. Each visit lasts 45 minutes for retail and fast food and 60 minutes for the restaurant.

Design call on residents leaving: the GDD says residents leave in the morning, shop during the day, more on weekends, and come back at night. Residents who go out to work give the morning and evening rush a second direction, and those who stay home are the daytime shoppers.

## 8. Hotel guests

### 8.1 Bookings

A hotel room can only take a booking when it is "Limpia", has no stay and no booking.

Each day at 12:00, in increasing unit id, every room that can take a booking rolls once. A room that becomes "Limpia" between 12:00 and 21:00 rolls at that step. A room that becomes "Limpia" at 21:00 or later rolls at 12:00 the next day.

The chance of a booking depends on the room's current evaluation grade (TM-13):

| Grade | Chance |
|---|---|
| Bueno | 90% |
| Regular | 70% |
| Malo | 40% |
| No grade yet | 80% |

Price levels act through the grade: alto raises the room's score, mínimo always passes (TM-13). There is no separate price factor.

A successful roll books the room and draws the party's arrival time:

- Roll at 12:00: 12:00 to 17:00 25%, 17:00 to 21:00 55%, 21:00 to 22:30 20%.
- Roll after 12:00: a uniform minute in `[roll time + 30 minutes, 22:30)`.

At the arrival time the whole party appears together at an entrance and travels to the room. Check-in happens when the first guest of the party reaches the room (economy 5.2): the party draws its nights and pays then. If nobody of the party has reached the room by 23:00, the party gives up and leaves, nobody pays, and the room can be booked again from 12:00 the next day.

Design call: the GDD gives arrivals from 12:00 to 23:00, mostly after 17:00. The last arrival is drawn at 22:30 so that a reachable room has at least 30 minutes before the 23:00 deadline.

### 8.2 Days of the stay

A party that checks in on day D with `n` nights leaves on day D + n. Each guest has a plan for each day of the stay:

| Day | Intention | Chance | Window and weights | What happens |
|---|---|---|---|---|
| Check-in day | Evening outing | 40% | uniform in `[check-in + 30 minutes, 21:30)`, skipped if empty | restaurant 50%, fast food 25%, retail 25%, then back to the room |
| Full days (D+1 to D+n-1) | Day out | 50% | leave 09:00 to 11:00, return 16:00 to 20:00 | leave the tower and come back to the room |
| Full days | Evening outing | 40% | 19:00 to 21:30, one part | restaurant 50%, fast food 25%, retail 25%, then back to the room |
| Check-out day (D+n) | Leave | always | 06:00 to 07:00 15%, 07:00 to 08:00 25%, 08:00 to 09:00 35%, 09:00 to 10:00 25% | travel from the room to an entrance and leave |

Visits last 60 minutes at a restaurant and 45 minutes at fast food or retail. An outing whose time comes while the guest is not in the room is skipped.

At 10:00 on the check-out day the stay ends and the room becomes "Sucia" (economy E-20), even if a guest is still inside. A guest still in the room or on the way out keeps the trip to the exit, and is no longer counted as a hotel guest in population. The 03:00 night reset removes anyone left over.

## 9. VIP

TM-15 decides the day of a VIP visit. On that day, at 12:00 and before the hotel booking rolls, the VIP books the clean suite with no stay and no booking that has the lowest unit id. If there is none, the visit does not happen and TM-15 records it as failed.

The VIP:

- appears at the street entrance at a time drawn from 17:00 to 19:00 50%, 19:00 to 21:00 50%;
- checks into the suite for 1 night and pays the suite price (economy E-23);
- on the check-in day goes to a restaurant for 60 minutes at a uniform time in `[check-in + 30 minutes, 21:30)` if one has a route, then goes back to the suite;
- leaves the next day at a time drawn from 08:00 to 09:00 50%, 09:00 to 10:00 50%.

The VIP's stress for TM-15's approval is the average stress of all the VIP's trips, including the trip out of the tower. The VIP never uses the subway or parking.

## 10. Maids

Six maids per housekeeping unit. Maids work every day of the week. They do not commute: at 09:30 they appear inside their housekeeping unit, and at 17:00 they leave the simulation wherever they are.

- From 10:00, a maid with no task asks TM-16 for a dirty room and goes there.
- Cleaning one room takes 30 game minutes (180 steps) from the maid's arrival. The room becomes "Limpia" at the end of that time.
- A maid can only start a cleaning before 16:00. At 16:00, or when TM-16 has no room for her, she goes back to her unit.
- Maids walk on floors and use stairs and service elevators only. Rooms they cannot reach that way are not cleaned.

Maids are not counted in population and their stress is not recorded. Room choice, the floors each maid covers, and infestation are TM-16.

Design call on no commute: maids only use stairs and service elevators, and a service elevator rarely reaches the street lobby. Having them appear at their unit keeps housekeeping placement free and leaves the cleaning route as the only challenge, as in the original.

## 11. Customers

Customers are the visitors from outside who come to a fast food, restaurant or retail shop. A venue's daily count (economy 7, and the shop's weekly count for early leave) is the number of visits that started in it, from customers and from people who live, work or stay in the tower.

### 11.1 Hours

| Venue | Open | Outside customers appear |
|---|---|---|
| Comida rápida | 08:00 to 20:00, every day | 08:00 to 11:00 20%, 11:00 to 14:00 50%, 14:00 to 17:00 15%, 17:00 to 19:30 15% |
| Local comercial | 10:00 to 20:00, every day, only with a tenant | 10:00 to 12:00 20%, 12:00 to 15:00 30%, 15:00 to 19:30 50% |
| Restaurante | 17:00 to 23:00, every day | 17:00 to 19:00 35%, 19:00 to 21:00 50%, 21:00 to 22:30 15% |

At the closing time everyone inside ends the visit and leaves. A venue placed after its opening time gets no outside customers that day; people from inside the tower can still visit it, but the economy spec gives it no payout that day (E-30).

### 11.2 Capacity and stay

| Venue | People inside at once | Stay |
|---|---|---|
| Comida rápida | 40 | 30 minutes |
| Restaurante | 40 | 60 minutes |
| Local comercial | 25 | 45 minutes |

A venue is full when the number of people inside equals its capacity. People on their way in do not count.

### 11.3 Daily outside customers formula

At 00:00 each day, for every fast food, restaurant and retail shop with a tenant, the engine computes the number of outside customers `N` for that day:

`N = floor(base × price × stress × subway)`

| Factor | Value |
|---|---|
| `base` | fast food 20 on weekdays, 30 on weekends; restaurant 20 / 30; retail shop 20 / 25 |
| `price` | retail shops: alto 0.7, normal 1.0, bajo 1.2, mínimo 1.4. Fast food and restaurant: 1.0 |
| `stress` | from the average trip stress of the venue's visits on the previous day (TM-13): under 15 minutes 1.0, 15 to under 30 minutes 0.8, 30 minutes or more 0.6. No visits the previous day: 1.0 |
| `subway` | 1.2 if the tower has a subway station, else 1.0 |

The engine draws one appearance time per customer from the venue's window in 11.1, and each customer appears at an entrance at that time and travels to that venue. Customers do not choose: they go to the venue that generated them. A customer who arrives when the venue is closed or full leaves. A customer who reaches it enters, stays the time in 11.2 and leaves the tower.

A retail shop that gets a tenant during the day gets its first outside customers at the next 00:00.

Expected daily counts for a venue that is easy to reach and not stressed, normal price, no subway:

| Venue | Outside | Inside the tower | Total |
|---|---|---|---|
| Fast food, weekday | 20 | office lunches (about 4.8 per office whose workers pick it), resident and guest trips | 25 to 35 with no offices, 50 or more from about 6 offices, up to about 125 when capacity fills at lunch |
| Fast food, weekend | 30 | resident and guest trips | 35 to 45 |
| Restaurant, weekday | 20 | guest outings, resident dinners | 30 to 45 |
| Restaurant, weekend | 30 | same | 35 to 50 |
| Retail shop, weekday | 20 | resident and guest trips | 22 to 30 |
| Retail shop, weekend | 25 | same | 28 to 35 |

These match the economy spec's balance check (fast food and restaurant at 35 to 49 a day, shops at about 25 on weekdays and 30 on weekends, about 185 a week) and leave a stressed or remote shop under the 70-a-week early-leave line. A shop at mínimo gets 28 outside customers a weekday, which is how the player saves a weak shop.

Fast food next to offices: each office with a tenant sends 6 × 0.8 = 4.8 workers to lunch on a weekday (P-13), split among the fast foods they pick (section 5). Measured in full-engine runs (TM-36 QA): one fast food with 10 offices logs about 69 visits a weekday, with 50 offices about 125. Above that the 40-seat capacity turns lunch visitors away. The earlier "35 to 60" figure left these lunches out.

Design call on fast food visits above 50: the counts stay as they are and no engine constant changes. The fast food payout is tiered and stops at $5,000 for 50 or more visits (economy 7.1), so 69 and 125 visits pay the same. A fast food serving 6 or more offices earns about $31,000 a week instead of $21,000 and pays back in 3.5 weeks instead of 5.1, close to the office's 4.5. This is the reward for building food next to offices, as in the original. Lunch demand from 50 offices (240 workers) needs 2 or more fast foods, so the player still has a reason to build several. If the balance simulation (TM-136) shows fast food income pulling the star pacing ahead, the lever is the lunch chance in P-13, not the outside base.

Design call: the GDD and the research give customer windows but no counts. A fixed outside base per venue keeps every venue alive in a small tower, and the inside visits reward building venues near offices, hotels and condos, as in the original. The stress factor is the "stressed people don't come back" rule from the research, applied to the venue as a whole.

## 12. Cinema audience

The cinema has two shows a day, 14:00 to 16:00 and 19:00 to 21:00, every day (economy 7.3). The audience comes from outside only.

For each show, at 00:00, the engine computes the show's audience target:

`A = min(cap, floor(cap × stress × subway))`

where `cap` is the show cap for the film's age that day (economy table 7.3), and `stress` and `subway` are the factors of section 11.3, with `stress` taken from the cinema's visits of the previous day.

Each member of the audience appears at an entrance at a time drawn from: show start minus 60 minutes to minus 30 minutes 40%, minus 30 minutes to show start 60%. A person who reaches the cinema before the show starts waits inside and enters at the show start; the visit counts from that step. A person who reaches it after show start plus 15 minutes, or when the show is full, does not enter and leaves. At the show's end everyone leaves.

A cinema placed after 13:00 gets no audience for the 14:00 show that day, and one placed after 18:00 none for the 19:00 show.

## 13. Party guests

The party hall holds a party every day from 13:00 to 17:00 (economy 7.2). Guests come from outside only.

At 00:00 the engine computes the day's guest target:

`G = min(50, floor(50 × stress × subway))`

with the factors of section 11.3 taken from the hall's visits of the previous day.

Each guest appears at an entrance at a time drawn from 12:00 to 12:30 30%, 12:30 to 13:00 50%, 13:00 to 13:30 20%. A guest who arrives before 13:00 waits inside and the visit counts from 13:00. A guest who arrives at 15:00 or later, or when the hall holds 50 guests, does not enter and leaves. At 17:00 everyone leaves.

A party hall placed after 12:00 gets no guests that day.

## 14. Security guards

Six guards per security office. Guards are on duty in their office all day, every day. They do not commute and do not move outside events. They are not counted in population and their stress is not recorded. When a bomb or fire event starts, TM-15 sends them out and brings them back. Guards use the same transport as office workers. They do not use service elevators, which are only for housekeeping staff (construction spec 5.5).

## 15. Wedding guests

When TM-14 says a wedding attempt is due on a Saturday or Sunday (5 stars, cathedral built, tower not yet at Torre rank), 40 wedding guests appear at the street entrance at times drawn from 08:00 to 09:00 40%, 09:00 to 10:00 40%, 10:00 to 10:30 20%, and travel to the cathedral. A guest's trip to the cathedral is a required trip (2-hour retry). The GDD condition is that all 40 are inside the cathedral before 12:30; TM-14 grants the rank. At 15:00 every wedding guest leaves the cathedral and the tower. A guest still on the way at 12:30 keeps going and leaves at 15:00 like the rest.

Wedding guests never use the subway, and they are not counted in population.

Design call: 10:30 is the last appearance time so that a guest who needs a 2-hour retry has already failed the 12:30 deadline. A tower with a good route gets the wedding; a bad route cannot be saved by luck.

## 16. Medical visits

From 3 stars, each office worker has a 10% chance per weekday, drawn in the daily plan, of a medical visit. At the leave time the worker goes from the office to a medical center chosen as in section 5, stays 60 minutes and then leaves the tower.

- A medical center accepts up to 100 visits a day, counted from 00:00. A center with 100 visits that day is full and is not a candidate.
- The visit fails when the tower has no medical center, when no drawn candidate has a route, or when every center is full. A failed medical visit is recorded as a medical failure (TM-14 blocks the next star check, stars.md 6), shows the notice `news.medicalDemanded` at most once a day, and sends the worker home.
- A visit that fails because the center is full or closed on arrival counts as failed in the same way.

Design call on capacity: at 10,000 to 15,000 population a tower has about 6,000 to 9,000 office workers and 600 to 900 visits a day, so the 10-center limit at 100 each is enough, but only just, and the player needs to keep adding centers as offices grow. That is the GDD's "centro médico suficiente".

## 17. Parking demand

### 17.1 Who wants a car

The roll happens once, when the tenant, owner or guest party is created, at any star rating:

| Holder | Chance |
|---|---|
| Office: worker 1 of a new tenant | 15% |
| Condo: resident 1 of a new owner | 25% |
| Suite: guest 1 of a new party, the VIP excluded | 50% |

A holder keeps the result for as long as they exist. Demand only counts from 3 stars.

Design call on the shares: at 15,000 population a typical tower has about 1,200 offices, 800 condos and 150 suites. These shares ask for about 180 + 200 + 75 = 455 spaces, under the 512-space limit, so the demand is reachable but takes basement levels of parking.

### 17.2 Assignment

From 3 stars, the engine runs an assignment pass at 06:00 every day, and for a suite holder at check-in:

1. Holders that still have a valid space keep it. A space is valid while it exists and is connected to a ramp (construction C-47, C-48).
2. Holders without a space, in increasing person id, get the free valid space with the lowest unit id.
3. Every holder still without a space is a parking failure. A failure is recorded as a parking failure (TM-14 blocks the next star check, stars.md 6) and shows one notice per holder kind, at most once a day: `news.parkingOffice`, `news.parkingCondo`, `news.parkingSuite`.

A space is freed when its holder stops existing (tenant or owner leaves, stay ends at 10:00) or loses the space. A holder with a space enters and leaves the tower by car (section 3). A holder without a space uses the street or subway.

Below 3 stars no pass runs, holders have no space, and there are no failures. When the tower reaches 3 stars, the first pass runs at the next 06:00.

## 18. Tenant demand for vacant units

Vacant offices ("En alquiler"), retail shops ("En alquiler") and unsold condos ("En venta") find tenants through prospects.

1. At every whole hour from 08:00 to 18:00 (11 rolls a day), each vacant unit that has no prospect on the way rolls once, in increasing unit id. Offices roll on weekdays only; shops and condos every day.
2. The chance depends on the unit's price level:

| Price level | Chance per roll |
|---|---|
| Alto | 10% |
| Normal | 20% |
| Bajo | 30% |
| Mínimo | 40% |

3. On success, a prospect appears at the street entrance and travels to the unit. This is an optional trip.
4. If the prospect reaches the unit and it is still vacant, the tenant moves in at that step. That step is the lease anchor `A` for offices and shops and the sale anchor `S` for condos (economy 4.2 and 6.2). Office prospects then leave the tower; shop prospects leave the tower; condo prospects become resident 1.
5. If the prospect has no route, the prospect leaves and the unit waits for the next roll. A unit with no route from the street entrance therefore never gets a tenant.
6. If the unit is demolished while its prospect is on the way, the prospect leaves.

At normal price a reachable unit gets a tenant in about 5 game hours on average (about 3 real minutes) and nearly always on the day it is built. There is no extra demand limit: every reachable unit fills.

Design call: the original filled units as soon as someone reached them. The rolls add a short, visible delay that depends on price, so a player who builds at alto waits longer for tenants, and a cut to mínimo fills a stubborn unit quickly. Evaluation already drives tenants away (TM-13); it does not slow new tenants down.

## 19. GDD Personas coverage

| GDD Personas item | Section | Status |
|---|---|---|
| Types: oficinistas, residentes, huéspedes, clientes, espectadores, invitados a fiestas, mucamas, seguridad, VIP, invitados a la boda | 2 | All covered; prospects added |
| Oficinistas: weekdays, arrive 7:30 to 9:30 | 6.1 | Kept, weights added |
| Oficinistas: lunch 12:00 to 13:30 at fast food or restaurant | 6.1 | Changed: fast food only, restaurant opens at 17:00 |
| Oficinistas: leave 17:00 to 19:00 | 6.1 | Kept, weights added |
| Residentes: leave in the morning, shop by day, more on weekends, back at night | 7 | Kept, defined with shares |
| Huéspedes: arrive 12:00 to 23:00, mostly after 17:00 | 8.1 | Kept, last arrival drawn 22:30 |
| Huéspedes: may go out to eat or shop at night | 8.2 | Kept |
| Huéspedes: leave 6:00 to 10:00 | 8.2 | Kept |
| Mucamas: clean freed rooms 10:00 to 16:00, stairs and service elevator | 10 | Kept |
| Clientes: fast food 8:00 to 20:00, shops 10:00 to 20:00, restaurant 17:00 to 23:00 | 11.1 | Kept |
| Cine: shows at 14:00 and 19:00 | 12 | Kept |
| Salón de fiestas: 13:00 to 17:00 | 13 | Kept |
| From 3 stars, some workers visit the medical center after work | 16 | Defined: 10%, 100 visits per center per day |
| From 3 stars, suite guests, residents and workers ask for parking | 17 | Defined: one holder per unit with a chance |
| Failure shows a notice and blocks stars that day | 16, 17 | Kept, flags for TM-14 |
| Recorridos: no route means wait 2 hours and retry | 4 | Kept for required trips |
| Population counts | 2 | Counted per TM-14, listed here per type |

## 20. Constants for `packages/shared`

| Constant | Value |
|---|---|
| `OFFICE_WORKERS_PER_OFFICE` | 6 (catalog) |
| `RESIDENTS_PER_CONDO` | 3 (catalog) |
| `HOTEL_PARTY_SIZE` | single 1, double 2, suite 2 (catalog) |
| `MAIDS_PER_HOUSEKEEPING` | 6 (catalog) |
| `GUARDS_PER_SECURITY` | 6 (new catalog entry) |
| `WEDDING_GUESTS` | 40 (catalog) |
| `PARTY_HALL_GUESTS` | 50 (catalog) |
| `ROUTE_RETRY_STEPS` | 720 |
| `NIGHT_RESET_TIME` | 03:00 |
| `SUBWAY_ENTRANCE_CHANCE` | 0.25 |
| `VENUE_CAPACITY` | fast food 40, restaurant 40, retail 25 |
| `VISIT_MINUTES` | fast food 30 (lunch 30), restaurant 60, retail 45, medical 60 |
| `OUTSIDE_CUSTOMER_BASE` | fast food 20 / 30, restaurant 20 / 30, retail 20 / 25 (weekday / weekend) |
| `RETAIL_PRICE_CUSTOMER_FACTOR` | alto 0.7, normal 1.0, bajo 1.2, mínimo 1.4 |
| `RETAIL_PRICE_ATTRACTION` | alto 0.5, normal 1, bajo 1.5, mínimo 2 |
| `VENUE_STRESS_FACTOR` | under 15 min 1.0, under 30 min 0.8, else 0.6 |
| `SUBWAY_VISITOR_FACTOR` | 1.2 |
| `HOTEL_BOOKING_CHANCE` | bueno 0.9, regular 0.7, malo 0.4, none 0.8 |
| `CLEANING_MINUTES` | 30 |
| `MEDICAL_VISIT_CHANCE` | 0.10 |
| `MEDICAL_DAILY_VISITS` | 100 |
| `PARKING_HOLDER_CHANCE` | office 0.15, condo 0.25, suite 0.5 |
| `PROSPECT_CHANCE` | alto 0.1, normal 0.2, bajo 0.3, mínimo 0.4 |

The schedule windows and weights in sections 6 to 15 also go into `packages/shared` as data tables, one per intention, so the balance pass can retune them without code changes.

## 21. Notices

| Key | Text |
|---|---|
| `news.medicalDemanded` | Los oficinistas necesitan un centro médico. |
| `news.parkingOffice` | Los oficinistas piden cochera. |
| `news.parkingCondo` | Los residentes piden cochera. |
| `news.parkingSuite` | Los huéspedes de las suites piden cochera. |

The messages catalog (TM-17, `docs/design/messages.md` section 6) holds the final keys, texts and limits.

## 22. Rules

All rules are outcomes with no rejection code. Times are game times on the tower's clock.

### General

P-01. Every drawn time is a whole game minute. A weighted window is drawn by picking a part by weight, then a uniform minute in `[part start, part end)`. Every random choice in this document uses the tower's seeded RNG.

P-02. At 00:00 each day, daily plans are drawn in increasing person id. With the same seed and the same commands, two runs produce the same people, plans and positions at every step.

P-03. Spawn counts: 6 workers per office with a tenant, 3 residents per sold condo, 1 guest per single room stay, 2 per double room stay, 2 per suite stay, 6 maids per housekeeping unit, 6 guards per security office, 40 wedding guests per attempt.

P-04. People from outside appear at the street entrance (level 1, either end of the main lobby, 50% each), at the subway entrance (level -7, inside the station) or at their assigned parking space.

P-05. With a subway station, each outside trip of a person who is not a car holder with a space, the VIP, a wedding guest or a prospect uses the subway with 25% chance. If that trip has no route, it switches to the street at once with no stress penalty.

P-06. A required trip with no route is retried every 720 steps. An optional trip with no route is cancelled with no stress recorded, except medical visits (P-37).

P-07. At 03:00, every person still on a trip or waiting for a retry is moved to their night place (outside the tower for workers and visitors, the condo for residents, the room for guests, the unit for maids and guards), and that trip counts as a failed attempt.

P-08. When a person's office lease ends, condo sale is reversed, housekeeping or security unit is demolished, or hotel stay ends and the guest leaves, the person is removed at once wherever they are.

### Venue choice

P-09. Venue choice draws up to 3 distinct open, non-full candidates of the wanted type, weighted by attraction (retail shops by price level 0.5, 1, 1.5, 2; all others 1), and picks the one with the lowest route cost, ties to the lower unit id. With no candidate or no route, the visit fails.

P-10. A retail shop without a tenant is never open and never a candidate.

P-11. A person who reaches a venue that is closed or full does not enter and the visit is not counted. A venue's count only includes people who entered.

### Office workers

P-12. Workers come only Monday to Friday. A worker's arrival time is drawn from 07:30 to 08:00 20%, 08:00 to 09:00 60%, 09:00 to 09:30 20%.

P-13. A worker at the office at the lunch time goes out with 80% chance, at a time drawn from 12:00 to 12:30 50%, 12:30 to 13:00 35%, 13:00 to 13:30 15%, visits a fast food for 30 minutes and returns. Workers never lunch at a restaurant.

P-14. A worker leaves at a time drawn from 17:00 to 17:30 40%, 17:30 to 18:00 30%, 18:00 to 18:30 20%, 18:30 to 19:00 10%. A worker who has not reached the office by then gives up and stays outside.

P-15. Workers of an office that got its tenant during a day first come on the next weekday.

### Residents

P-16. On a weekday each resident goes out to work with 70% chance: leaves at 06:30 to 07:30 30%, 07:30 to 08:30 50%, 08:30 to 09:00 20%, and returns at 17:00 to 18:00 30%, 18:00 to 19:00 35%, 19:00 to 20:00 25%, 20:00 to 21:00 10%.

P-17. A weekday resident who stays home goes shopping with 60% chance at 10:00 to 13:00 40%, 13:00 to 17:00 60%, to retail 60% or fast food 40%, for 45 minutes.

P-18. Any resident at home at the drawn time goes to dinner on a weekday with 15% chance (19:30 to 21:00) and on a weekend day with 25% chance (19:00 to 21:00), at a restaurant for 60 minutes.

P-19. On Saturday and Sunday no resident goes out to work; each draws a morning trip (60%, 10:00 to 11:00 40%, 11:00 to 12:00 60%) and an afternoon trip (60%, 14:00 to 16:00 50%, 16:00 to 18:00 50%), each to retail 60% or fast food 40%.

P-20. An intention whose time comes while the resident is not home is skipped.

### Hotel

P-21. At 12:00, and when a room becomes "Limpia" between 12:00 and 21:00, each clean room with no stay and no booking rolls a booking: 90% with grade bueno, 70% regular, 40% malo, 80% with no grade.

P-22. A booking made at 12:00 draws the arrival from 12:00 to 17:00 25%, 17:00 to 21:00 55%, 21:00 to 22:30 20%. A booking made later draws a uniform minute in `[roll + 30 minutes, 22:30)`.

P-23. The party appears together at an entrance at the arrival time. Check-in is the step the first guest reaches the room. A party with nobody in the room at 23:00 leaves without paying, and the room rolls again at 12:00 the next day.

P-24. On the check-in day each guest goes out once with 40% chance at a uniform time in `[check-in + 30 minutes, 21:30)`, to a restaurant 50%, fast food 25% or retail 25%.

P-25. On each full day of a stay, each guest leaves the tower with 50% chance (leave 09:00 to 11:00, return 16:00 to 20:00) and goes out in the evening with 40% chance (19:00 to 21:30) as in P-24.

P-26. On the check-out day each guest leaves at 06:00 to 07:00 15%, 07:00 to 08:00 25%, 08:00 to 09:00 35%, 09:00 to 10:00 25%. At 10:00 guests stop counting as hotel population.

### VIP

P-27. On a VIP day, at 12:00 before booking rolls, the VIP books the clean free suite with the lowest unit id. With no such suite the visit fails.

P-28. The VIP arrives at the street entrance at 17:00 to 19:00 50%, 19:00 to 21:00 50%, stays 1 night, goes to a restaurant for 60 minutes after check-in if one has a route, and leaves the next day at 08:00 to 09:00 50%, 09:00 to 10:00 50%. The VIP never uses the subway or parking.

### Maids

P-29. Maids appear in their housekeeping unit at 09:30 and leave the simulation at 17:00. They start cleanings only from 10:00 and before 16:00. A cleaning takes 180 steps from the maid's arrival at the room, after which the room is "Limpia".

P-30. Maids only use floors, stairs and service elevators. Service elevators carry no one else, guards included.

### Customers

P-31. Fast food is open 08:00 to 20:00, retail shops with a tenant 10:00 to 20:00, restaurants 17:00 to 23:00, every day. At closing everyone inside leaves.

P-32. At most 40 people are inside a fast food, 40 inside a restaurant and 25 inside a retail shop at once. Visits last 30, 60 and 45 minutes.

P-33. At 00:00 each venue gets `N = floor(base × price × stress × subway)` outside customers, with base fast food 20/30, restaurant 20/30, retail 20/25 (weekday/weekend); price for retail alto 0.7, normal 1.0, bajo 1.2, mínimo 1.4, otherwise 1.0; stress 1.0 under 15 minutes of the previous day's average visit stress, 0.8 under 30, 0.6 from 30, 1.0 with no visits; subway 1.2 with a subway station.

P-34. Outside customer appearance times are drawn from the venue windows in 11.1. Each customer goes only to the venue that generated them and leaves the tower after the visit.

### Entertainment

P-35. Each cinema show gets `min(cap, floor(cap × stress × subway))` audience, cap from the film age (economy E-33). The audience appears from 60 to 30 minutes before the show (40%) and from 30 minutes before to the start (60%), enters no earlier than the start and no later than 15 minutes after it, and leaves at the show's end.

P-36. Each day the party hall gets `min(50, floor(50 × stress × subway))` guests appearing at 12:00 to 12:30 30%, 12:30 to 13:00 50%, 13:00 to 13:30 20%. Guests enter from 13:00 and before 15:00, and leave at 17:00.

### Medical

P-37. From 3 stars each worker has a 10% chance per weekday to visit a medical center at the leave time, for 60 minutes. A center takes at most 100 visits a day. A visit with no center, no route, or only full centers fails, is recorded as a medical failure for the star check (stars.md S-17) and shows `news.medicalDemanded` at most once that day.

### Parking

P-38. When created, worker 1 of an office tenant is a parking holder with 15% chance, resident 1 of a condo owner with 25%, guest 1 of a suite party (not the VIP) with 50%. The result lasts as long as the holder.

P-39. From 3 stars, at 06:00 daily and at each suite check-in, holders keep valid spaces, then holders without one get the free valid space with the lowest unit id in increasing person id. Each holder left without a space is recorded as a parking failure for the star check (stars.md S-17) and its kind's notice shows at most once that day.

P-40. Below 3 stars there is no assignment and no parking failure. A holder with a space enters and leaves the tower through it.

### Wedding

P-41. On a weekend day with a wedding attempt due, 40 guests appear at the street entrance at 08:00 to 09:00 40%, 09:00 to 10:00 40%, 10:00 to 10:30 20%, travel to the cathedral and all leave at 15:00.

### Tenant demand

P-42. At each whole hour from 08:00 to 18:00, each vacant office (weekdays only), retail shop and unsold condo with no prospect on the way rolls: alto 10%, normal 20%, bajo 30%, mínimo 40%. On success a prospect appears at the street entrance and travels to the unit.

P-43. A prospect who reaches a unit that is still vacant moves the tenant in at that step, which starts the lease or sale (economy E-10, E-24). A prospect with no route leaves and the unit keeps waiting. A unit with no route from the street never gets a tenant.

P-44. A condo's prospect becomes resident 1 and the other 2 residents appear in the condo at the same step. Office and shop prospects leave the tower after the move-in.

### Draw order

P-45. Draws made in the same step happen in this order: step events (00:00 infestation check, 00:00 plans, 00:00 customer counts and appearance times, 03:00 night move, hourly prospect rolls, 12:00 VIP booking, 12:00 hotel booking rolls), then people with something due. Units go in increasing unit id and people in increasing person id. A person's draws all finish before the next person's start. Subjects created during the step go last in their phase, in creation order.

P-46. Guards use stairs, escalators, standard elevators and express elevators. They never use service elevators.
