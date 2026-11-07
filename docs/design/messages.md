# Messages: news, notices and dialogs

This document is the catalog of every news line and every dialog text of the game, in Rioplatense Spanish with voseo, as in `docs/design/ui.md`. Each row gives the string key, the exact text, the trigger and the spec section that owns it, the alert flag of ui.md 8.1, the placeholders and the rate limit. The engine generator (TM-49), the news line and decision dialogs (TM-67) and the strings module (TM-63) take their texts and limits from here.

Related specs: economy (TM-9, `docs/design/economy.md`), people (TM-10, `docs/design/people.md`), stress and evaluation (TM-13), stars (TM-14, `docs/design/stars.md`), events (TM-15, `docs/design/events.md`), hotel (TM-16, `docs/design/hotel.md`) and UI (TM-18, `docs/design/ui.md`, sections 8, 9, 12 and 13).

The key list is exported from `packages/shared` as `MESSAGE_IDS`, and the alert flag, scope and gap of each news key as `NEWS_RULES`. A test checks that every id has a row in this document and that the rows match the constants.

## 1. Time units

| Unit | Engine steps |
|---|---|
| 1 game minute | 6 |
| 1 game hour | 360 |
| 1 game day | 8,640 |

## 2. How a notice is shown

A notice is one `news` server event with a key, an optional unit id and the values of its placeholders. The client stores it in Avisos and shows it on the news line as `{weekday abbr} {HH:MM}  {text}` (ui.md 8.1).

- The `news` event carries `key`, `unitId` and `params`, the same fields as `NoticeView`. The current `news` event schema in `packages/shared/src/protocol/views.ts` has no `params`; TM-49 adds it.
- `unitId` is set when the notice is about one unit, so clicking it centers on that unit. The tables mark these rows "unit" in the scope column.
- Alert notices are drawn in `cloth-red` with the alarm icon and play the notice sound; bomb and fire alerts play their alarms instead (ui.md 8.1).

## 3. Placeholders

Placeholders are written `{name}`. The engine sends raw values in `params`; the client formats them before inserting them (ui.md 12).

| Placeholder | Engine value | Shown as |
|---|---|---|
| `{n}` | star rating, 1 to 5 | the number, "3" |
| `{level}` | level number, -9 to 104 | the short level label of the level ruler (ui.md 3.4): "12", "S3" |
| `{amount}` | money in dollars | money format of ui.md 13.6: "$50.000" |
| `{ransom}` | money in dollars | money format: "$300.000" |
| `{price}` | money in dollars | money format |
| `{option}` | option id of a decision | the text of that option's button, `dialog.{kind}.{option}` with its own placeholders filled: "No pagar" |
| `{time}` | step | "HH:MM" of that step |
| `{weekday}` | step | the `calendar.weekday.{0-6}` text of that step, in lower case: "martes" |
| `{units}` | list of unit type ids | their `unit.{id}` texts joined with ", " |
| `{typeName}` | unit type id | the `unit.{id}` text |

ui.md section 9 writes some of these with descriptive names: `{HH:MM}` is `{time}`, `{type name}` is `{typeName}` and `{list of unit names unlocked at n}` is `{units}`. The strings module uses the names of this table.

## 4. Rate limit

Every news key has a minimum gap and a scope. A notice is dropped when a notice with the same key and the same scope value was emitted less than the gap before it, counted in steps. A dropped notice is not sent, not shown and not stored in Avisos; the game effect behind it still happens.

| Scope | Same scope value means |
|---|---|
| tower | any notice of that key in the tower |
| unit | the same unit id |
| level | the same `{level}` |
| event | the same active event id (events.md 11.1) |

The gap is 60 game minutes (360 steps) for every key, so no notice repeats more often than once per game hour per unit. Keys marked "1 per day" also allow at most one notice per game day, counted from 00:00, as people.md 16 and 17 ask.

Design call on the gap: most triggers here already fire at most once a day per unit (payouts, evaluations, star checks). The gap only matters for triggers that can fire in bursts, such as several medical failures in a row or two hotel checks close together, and one hour of game time is 37.5 real seconds, enough for the player to read the line.

## 5. Economy notices

| Key | Text | Trigger | Alert | Params | Scope |
|---|---|---|---|---|---|
| `news.shopLeftNoCustomers` | Un local se fue por falta de clientes. | A shop leaves early with fewer than 70 customers in the week (economy 4.3). This is the shop early leave notice. | | | unit |
| `news.officeLeft` | Una oficina quedó vacía. Los inquilinos no renovaron. | An office lease ends with a poor evaluation and the tenant leaves (economy 4.2). | | | unit |
| `news.shopLeftEvaluation` | Un local quedó vacío. Los inquilinos no renovaron. | A shop lease ends with a poor evaluation and the tenant leaves (economy 4.2). | | | unit |
| `news.condoBuyback` | Los dueños de un departamento se fueron. Se les devolvió el dinero. | Condo owners leave after a poor evaluation and the sale price is paid back (economy 6.2). | | | unit |
| `news.cinemaChangeFilm` | Pocas entradas vendidas. Cambiá la película. | A cinema's film reaches age 56, and every 7 days after while it is not changed (economy 7.3, E-41). This is the low cinema sales notice. | | | unit |
| `news.cinemaLowAudience` | El cine no cobró nada: menos de 40 espectadores por función. | At the 21:00 payout a cinema whose film is younger than 56 days pays $0 because the day's audience is under 40 (economy 7.3). | | | unit |
| `news.fastFoodLoss` | Una comida rápida tuvo pérdidas: vinieron menos de 25 clientes. | At the 20:00 payout a fast food has fewer than 25 visits that day and is charged $3,000 (economy 7.1). | | | unit |
| `news.restaurantLoss` | Un restaurante tuvo pérdidas: vinieron menos de 25 clientes. | At the 23:00 payout a restaurant has fewer than 25 visits that day and is charged $6,000 (economy 7.1). | | | unit |
| `news.partyHallEmpty` | El salón de fiestas no cobró nada: vinieron menos de 25 invitados. | At the 17:00 payout a party hall had fewer than 25 guests that day and pays $0 (economy 7.2). | | | unit |
| `news.upkeepNegative` | El mantenimiento dejó la caja en rojo. No se puede construir hasta recuperar. | The Monday 00:00 upkeep charge takes the balance from $0 or more to below $0 (economy 8.3, E-47). | yes | | tower |
| `news.balanceNegative` | La caja quedó en rojo. No se puede construir hasta recuperar. | Any ledger entry other than upkeep takes the balance from $0 or more to below $0: a venue loss, a condo buyback, a ransom or a helicopter (economy 2, events 3.2). | yes | | tower |

A venue built after its opening time on a day gets no payout that day (economy 7) and so no loss or empty notice either. A "contract ended" notice is `news.officeLeft` or `news.shopLeftEvaluation`; a lease that is renewed shows nothing, and a tenant removed by demolition shows nothing because the player caused it.

Design call on the cinema notices: from age 56 the show cap is 35, so a cinema with an old film always pays $0. `news.cinemaChangeFilm` already names the cause once a week, and `news.cinemaLowAudience` would only repeat it every day, so the second notice is limited to films younger than 56 days, where the cause is the route or the floor.

## 6. People notices

These are the failure notices of people.md 16 and 17. They used the `notice.*` prefix in people.md 21; the prefix is now `news.*` like every other notice.

| Key | Text | Trigger | Alert | Params | Scope |
|---|---|---|---|---|---|
| `news.medicalDemanded` | Los oficinistas necesitan un centro médico. | A medical visit fails because the tower has no medical center or no drawn center has a route (people.md 16). | | | tower, 1 per day |
| `news.medicalFull` | Los centros médicos están llenos. Hace falta otro. | A medical visit fails because every candidate center already has 100 visits that day, or the center is full on arrival (people.md 16). This is the medical full notice. | | | tower, 1 per day |
| `news.parkingOffice` | Los oficinistas piden cochera. | The parking pass leaves an office holder without a space (people.md 17.2). | | | tower, 1 per day |
| `news.parkingCondo` | Los residentes piden cochera. | The parking pass leaves a condo holder without a space (people.md 17.2). | | | tower, 1 per day |
| `news.parkingSuite` | Los huéspedes de las suites piden cochera. | The parking pass, at 06:00 or at a suite check-in, leaves a suite holder without a space (people.md 17.2). This is the no parking notice. | | | tower, 1 per day |

These notices are not alerts. The alert comes at the star check, when the failure blocks a promotion (`news.starBlockedMedical`, `news.starBlockedParking`).

## 7. Hotel notices

| Key | Text | Trigger | Alert | Params | Scope |
|---|---|---|---|---|---|
| `news.cockroaches` | Hay cucarachas en una habitación del piso {level}. Solo se eliminan demoliendo. | After the infestation check, once for each level on which a room became Con plaga, in increasing level order (hotel.md 7.4, H-24). | yes | `level` | level |

## 8. Star notices

| Key | Text | Trigger | Alert | Params | Scope |
|---|---|---|---|---|---|
| `news.starsUp` | La torre llegó a {n} estrellas. | A star check promotes the tower (stars.md 4, S-08). | | `n` | tower |
| `news.starBlockedSecurity` | La torre no subió de estrellas: falta una oficina de seguridad. | The 2 to 3 check meets population and fails requirement 5.1 (stars.md 4, S-07). | yes | | tower |
| `news.starBlockedVip` | La torre no subió de estrellas: falta la aprobación del VIP. | The 3 to 4 check meets population and fails 5.2. | yes | | tower |
| `news.starBlockedSuites` | La torre no subió de estrellas: hacen falta 2 suites. | The 3 to 4 check meets population and fails 5.3. | yes | | tower |
| `news.starBlockedRecycling` | La torre no subió de estrellas: hace falta un centro de reciclaje cada 2.500 personas. | A check meets population and fails 5.4. | yes | | tower |
| `news.starBlockedMedical` | La torre no subió de estrellas: alguien no pudo ir al centro médico desde la última revisión. | A check meets population and fails 5.5. | yes | | tower |
| `news.starBlockedParking` | La torre no subió de estrellas: alguien no consiguió cochera desde la última revisión. | A check meets population and fails 5.6. | yes | | tower |
| `news.starBlockedSubway` | La torre no subió de estrellas: falta la estación de subte. | The 4 to 5 check meets population and fails 5.7. | yes | | tower |
| `news.towerRank` | ¡Hubo boda en la catedral! La torre alcanzó el rango Torre. | The 40th guest of a wedding attempt enters the cathedral before 12:30 (stars.md 7, S-20). | | | tower |
| `news.weddingFailed` | No llegaron todos los invitados a la boda antes de las 12:30. | A wedding attempt fails at 12:30 or because the cathedral is demolished (stars.md 7, S-21). | | | tower |

The `starBlocked` server event carries a `reason`; the reasons `security`, `vip`, `suites`, `recycling`, `medical`, `parking` and `subway` map to the keys above in that order, which is also the order in which the notices are shown (S-07).

## 9. Event notices

| Key | Text | Trigger | Alert | Params | Scope |
|---|---|---|---|---|---|
| `news.bombThreat` | Amenaza de bomba en la torre. | A bomb threat starts and its decision opens (events.md 4.2). | yes | | event |
| `news.bombPaid` | Se pagó el rescate. La amenaza terminó. | The player answers `pay` (events.md 4.3). | | | event |
| `news.bombSearch` | Seguridad empezó a buscar la bomba. | The search starts, after a `refuse` answer or at the deadline (events.md 4.4, 12). | | | event |
| `news.bombFound` | Seguridad encontró la bomba y la desactivó. | A guard finds the bomb (events.md 4.4). | | | event |
| `news.bombExploded` | Explotó la bomba en el piso {level}. | The bomb explodes at 13:00 (events.md 4.5). | yes | `level` | event |
| `news.fire` | Incendio en el piso {level}. | A fire ignites and its decision opens (events.md 5.2). | yes | `level` | event |
| `news.fireHelicopter` | El helicóptero apagó el incendio. | The player answers `helicopter` (events.md 5.3). | | | event |
| `news.fireOut` | El incendio se apagó. | Every burning front is out (events.md 5.8). | | | event |
| `news.vipArrives` | Un VIP viene a pasar la noche en una suite. | The VIP books a suite (events.md 6.2). | | | event |
| `news.vipNoSuite` | El VIP no encontró una suite libre y no vino. | The VIP visit is rolled but no suite can be booked (events.md 6.2, 12). | | | event |
| `news.vipApproved` | El VIP quedó conforme con su estadía. | The VIP leaves with an approving evaluation (events.md 6.3). | | | event |
| `news.vipRejected` | El VIP se fue disconforme. | The VIP leaves without approving (events.md 6.3). | | | event |
| `news.treasure` | ¡Apareció un tesoro en el {level}! Ganaste {amount}. | A construction command finds treasure on a basement level (events.md 7). | | `level`, `amount` | level |
| `news.santa` | ¡Feliz Navidad! Papá Noel pasó por la torre. | 22:00 on 24 December (events.md 8). | | | tower |
| `news.decisionDefault` | Se terminó el plazo. Se aplicó: {option}. | A decision reaches its deadline unanswered and the default option is applied (events.md 3.3, ui.md 9.1). The engine sends the option id and the client shows its button text. | | `option` | event |

Choosing `burn` has no notice of its own; at the deadline `news.decisionDefault` says "No llamar" was applied (events.md 12). The `level` of `news.bombExploded` and `news.fire` is the level of the bomb or of the first ignition. In `news.treasure`, `level` is always a basement, so it reads "en el S3".

## 10. Elevators

There is no elevator notice. Design call: a congested shaft shows in the stress of its riders, the Evaluación overlay and the evaluations that follow (TM-13). A notice about a slow shaft would need its own threshold and would repeat what the overlay already shows. elevators.md 12 left this point to this spec.

## 11. Dialog texts

The dialogs of ui.md section 9. Decision dialogs are opened by `decisionOpened` and their option ids come from events.md 4.3 and 5.3. Titles, bodies and buttons are keyed `dialog.{id}.title`, `dialog.{id}.body` and `dialog.{id}.{option}`. The "Aceptar" and "Cancelar" buttons use `ui.accept` and `ui.cancel` (ui.md 13.4).

| Key | Text | Params |
|---|---|---|
| `dialog.bomb.title` | Amenaza de bomba | |
| `dialog.bomb.body` | Alguien llamó para avisar que dejó una bomba en la torre. Pide {ransom} para decir dónde está. Si no pagás, seguridad la va a buscar. Si no la encuentra antes de las 13:00, explota. | `ransom` |
| `dialog.bomb.pay` | Pagar {ransom} | `ransom` |
| `dialog.bomb.refuse` | No pagar | |
| `dialog.fire.title` | Incendio | |
| `dialog.fire.body` | Hay un incendio en el piso {level}. Un helicóptero lo puede apagar por $500.000. Si no lo llamás, seguridad va a tratar de contenerlo. | `level` |
| `dialog.fire.helicopter` | Llamar al helicóptero ($500.000) | |
| `dialog.fire.burn` | No llamar | |
| `dialog.deadlineToday` | Respondé antes de las {time} | `time` |
| `dialog.deadlineOtherDay` | Respondé antes del {weekday} {time} | `weekday`, `time` |
| `dialog.starsUp.title` | ¡{n} estrellas! | `n` |
| `dialog.starsUp.body` | La torre llegó a {n} estrellas. Ahora podés construir: {units}. | `n`, `units` |
| `dialog.towerRank.title` | ¡Rango Torre! | |
| `dialog.towerRank.body` | Los novios se casaron en la catedral. Tu edificio es oficialmente una Torre. | |
| `dialog.welcome.title` | Bienvenida | |
| `dialog.welcome.body` | Tenés $2.000.000 para empezar. Construí el lobby en el piso 1 y después los pisos, las oficinas y los ascensores. | |
| `dialog.demolishSoldCondo.title` | Demoler departamento | |
| `dialog.demolishSoldCondo.body` | Este departamento está vendido. Si lo demolés, le devolvés {price} a los dueños. | `price` |
| `dialog.demolishExpensive.title` | Demoler {typeName} | `typeName` |
| `dialog.demolishExpensive.body` | ¿Seguro que querés demoler {typeName}? Costó {price}. | `typeName`, `price` |
| `dialog.demolish` | Demoler | |
| `dialog.changeFilm.title` | Cambiar película | |
| `dialog.changeFilm.body` | La película nueva cuesta $300.000. | |
| `dialog.changeFilm.confirm` | Cambiar | |
| `dialog.newTower.title` | Torre nueva | |
| `dialog.newTower.body` | Se demuele toda la torre y empezás de cero el lunes 1 de enero del año 1, con $2.000.000. No se puede deshacer. | |
| `dialog.newTower.confirm` | Demoler y empezar | |
| `dialog.protocolMismatch.body` | Hay una versión nueva del juego. Recargá la página. | |
| `dialog.protocolMismatch.reload` | Recargar | |
| `dialog.connecting.body` | Conectando... | |
| `dialog.connectionLost.body` | Se perdió la conexión. Reintentando... | |

The `NOT_AUTHENTICATED` notice above the login form is `error.NOT_AUTHENTICATED` (ui.md 13.8), and the rejected-answer toast is `error.EVENT_EXPIRED`; neither is part of this catalog.

## 12. Changes to other specs

- people.md 21 keys move from `notice.*` to `news.*`; texts unchanged.
- ui.md 13.9 points to this catalog for the full list; its rows are unchanged and appear here with identical text.
- ui.md 13.11 writes the deadline placeholder as `{time}`.
- The web strings module still holds older texts for `news.starBlockedParking` and `news.starBlockedMedical`; TM-67 replaces them with the texts of section 8.

## 13. Rules

MSG-01. Every notice shown on the news line has a key from sections 5 to 9 and the exact Spanish text of its row. No other news key exists.

MSG-02. Every key in ui.md 13.9 appears in this catalog with identical text.

MSG-03. The alert notices are exactly `news.upkeepNegative`, `news.balanceNegative`, `news.cockroaches`, every `news.starBlocked*`, `news.bombThreat`, `news.bombExploded` and `news.fire`. All other notices are normal.

MSG-04. The `news` server event carries `key`, `unitId` and `params`. `params` holds exactly the placeholders listed in the row, with raw values; the client formats them as in section 3.

MSG-05. Notices with scope "unit" set `unitId` to the unit the notice is about. Other notices send `unitId: null`.

MSG-06. A notice is dropped when a notice with the same key and the same scope value was emitted less than 360 steps (60 game minutes) before it. A dropped notice is not stored in Avisos and does not change the effect behind it.

MSG-07. `news.medicalDemanded`, `news.medicalFull`, `news.parkingOffice`, `news.parkingCondo` and `news.parkingSuite` are shown at most once per game day each, counted from 00:00.

MSG-08. `news.shopLeftNoCustomers` is shown when a shop leaves early (economy 4.3), and `news.shopLeftEvaluation` or `news.officeLeft` when a lease ends with a poor evaluation (economy 4.2). A renewal or a demolition shows nothing.

MSG-09. `news.fastFoodLoss` and `news.restaurantLoss` are shown at the venue's payout when its day count is under 25; `news.partyHallEmpty` when a party hall's day count is under 25. A venue with no payout that day shows nothing.

MSG-10. `news.cinemaLowAudience` is shown at the 21:00 payout when the day's audience is under 40 and the film is younger than 56 days. From age 56 only `news.cinemaChangeFilm` is shown, on day 56 and every 7 days after.

MSG-11. `news.upkeepNegative` is shown when the upkeep charge takes the balance from $0 or more to below $0. `news.balanceNegative` is shown when any other ledger entry does. A balance that was already below $0 shows neither.

MSG-12. A medical visit that fails because every candidate center is full shows `news.medicalFull`; one that fails for no center or no route shows `news.medicalDemanded`.

MSG-13. `news.cockroaches` is emitted once per level per check, in increasing level order, with `level` set.

MSG-14. A failed star check with population met shows one `news.starBlocked*` per missing requirement, in the order security, VIP, suites, recycling, medical, parking, subway.

MSG-15. `news.bombSearch` is shown when the search starts, after `refuse` or at the deadline. At the deadline `news.decisionDefault` is shown first, with `option` set to the default option id.

MSG-16. `news.decisionDefault` shows the text of the applied option's button: "No pagar" for a bomb, "No llamar" for a fire.

MSG-17. Every dialog text of ui.md section 9 has a key and text in section 11, and the button order and defaults follow ui.md 9.1 and 9.3.

MSG-18. `MESSAGE_IDS` in `packages/shared` lists every key of sections 5 to 9 and 11, and `NEWS_RULES` gives each news key the alert flag and scope of its row and a gap of 60 game minutes. A test fails if a key in this document is missing from `MESSAGE_IDS` or the reverse.
