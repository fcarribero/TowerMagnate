# Couriers

A courier ("Mensajero") is a person from outside who brings a package to an office. Couriers are person kind `courier`, stored as the last entry of `PERSON_KINDS` (after `staff`), so every older stored kind code keeps its meaning. No schema version changes.

## When an office gets a courier

Offices have no per-unit hours in the engine. The spec uses one set of office hours for every office: open 09:00, closed 17:00, weekdays only. They are `COURIER_OFFICE_OPEN_MINUTE` and `COURIER_OFFICE_CLOSE_MINUTE` in `packages/shared/src/balance.ts`.

A courier is sent only from `open + 2 h` to `close - 2 h`, that is from 11:00 up to but not including 15:00 (`COURIER_MARGIN_MINUTES`). The delivery trip then ends well before 17:00.

The day is cut into 30 minute blocks (`COURIER_BLOCK_MINUTES`). At the start of each block inside the window, every office that has a tenant and has no courier on the way rolls once. A roll succeeds with chance `COURIER_CHANCE_PER_BLOCK` (0.4). With 8 blocks in the window that is about 3 couriers per office on a working day. Offices with no tenant, and every office on Saturday and Sunday, get none.

The roll does not use the simulation RNG. It is a pure hash of the unit number, the day number and the block number (`officeWantsCourier` in `packages/engine/src/couriers.ts`), so adding couriers does not move the random stream of existing seeds. The courier's name seed and the entrance side come from the same kind of hash.

## The trip

The courier appears at one end of the main lobby on level 1, the street entrance, and walks to the office with the normal trek: they use stairs, escalators and elevators like other visitors. At the office they stand at the unit's middle column for `COURIER_DWELL_STEPS` (3 steps, 30 game seconds), drop the package, then walk back to the entrance they came in by and are removed from the pool.

The phase (to the office, at the door, leaving), the entrance side and the block in which the courier was sent are packed into the person's `trip` number.

## Giving up

A courier never keeps a trip that cannot finish. The courier is removed when any of these is true:

- No route to the office exists when they are sent: they are never added.
- The office is gone or is no longer an office when they arrive: they walk out at once.
- There is no way out when they have to leave: they are removed at once.
- They are in the no route state, have stopped walking, or have been out for `COURIER_GIVE_UP_BLOCKS` (3) blocks: the next block hook removes them.
- The office loses its tenant or is demolished: `removePeopleOfUnit` removes everyone whose home unit is that unit, couriers included.

The block hooks keep running until two hours after closing, so a stuck courier is always cleared the same working day.

## What a courier is not

The courier's home unit is the office, which is how a demolition finds them, but a courier is not an occupant. `countPeopleOfUnit` skips couriers, so they do not count toward the people of the unit, its capacity row or population. They pay no rent and do not change a lease. Their trips are not filed in the trip ledger, so they add nothing to the office evaluation, as with maids and builders. Energy follows the default visitor behavior.

## Display

The person window shows the kind as "Mensajero". While the courier walks or stands inside a unit it shows "Entregando un paquete" as the status. The sprite is a customer sprite for now; a delivery outfit and a carried package need person art that is not ready.
