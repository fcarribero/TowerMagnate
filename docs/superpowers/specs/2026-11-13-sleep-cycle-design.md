# Sleep cycle for condos and hotel rooms

## Intent

Condos and hotel rooms get a night. People go to bed at a random time, sleep, wake at a random time and leave. While at least one person sleeps inside, the unit is in a new state, "sleeping", drawn with a closed-unit sprite that has an occupied bed. The aim is a tower that looks alive at night: lit units are people awake, dark units with a sleeper are people asleep.

## Goals

- Residents of a condo follow: sleeping, wake up, leave home (only if they work that day), come home, sleeping.
- Hotel guests follow the same chain with fixed daily windows.
- A unit shows "sleeping" when at least one of its people is asleep inside, even if another is awake.
- Every time is a random draw from a window, taken per person and per day, with the existing window system.
- A sleeping person is not drawn walking.

## Non-goals

- No lit-window variant for a sleeping unit. Sleeping is only the closed look plus the bed.
- Offices, shops and other units do not change.
- No new commands or UI controls.

## Constraints

- The simulation is deterministic: every draw uses the state's rng, in a stable order.
- A person's routine is packed in one number in `pool.trip` and `pool.dueStep` holds the next due step (see `resident-routine.ts`, `hotel-guest-trip.ts`). The number must stay below 2^53.
- Saved games must still load. Adding a phase changes the packing, so old saves need a migration or a safe fallback to "home".
- Residents are re-planned at 00:00 each day; whoever is still out is put back in the condo. Sleeping across 00:00 must not be undone by this.

## Approaches

1. Extend the existing resident and hotel guest routines with a `sleeping` phase. One system owns each person. Chosen.
2. A separate sleep system with a per-person flag that pauses the routine. Easier to switch off, but two systems fight over the same person at 00:00 and during trips. Rejected.

## Design

### Condos

Phase `sleeping` is added to `ResidentPhase` (the packing range goes from 8 to 9; it still fits).

Bed time and wake time need no new slot. When a resident has no intention left for the day, a bed time is drawn and becomes the due step. At bed time they go to `sleeping` and a wake time is drawn into `dueStep`. When it fires they wake, are `home`, and the day's plan (leave, return, outings, dinner) runs as today, with the rule that nothing starts before wake time plus a delay of 20 to 40 minutes. A leave time that falls before that is pushed to it.

Windows, as minutes of the day. Builder may tune them; these are the starting values.

- Bed time, Monday to Thursday and Sunday: 22:00 to 00:30.
- Bed time, Friday and Saturday: 22:00 to 02:30 (two hours longer).
- Wake time, Monday to Friday: 05:30 to 07:30.
- Wake time, Saturday and Sunday: 05:30 to 09:30 (two hours longer). This is the wake after the Friday and Saturday nights.

The daily plan at 00:00 stays, with these changes:

- A resident asleep at 00:00 keeps sleeping. Their plan for the new day is drawn but starts after they wake.
- A resident out at 00:00 is put back home awake, as today, and goes to bed at their drawn bed time.
- Saturday: each resident works with a 30% chance (weekdays stay at 70%), using the weekday leave and return windows.
- Sunday: nobody works. Outings to restaurants and shops stay as they are.

### Hotel rooms

Same chain with the same daily windows every day of the week.

- Arrival 13:00 to 22:00 (today 12:00 to 22:30; `HOTEL_NOON_ARRIVAL`, `HOTEL_LAST_ARRIVAL_MINUTE`).
- Bed time 22:00 to 00:00, and never before 30 minutes after arrival.
- Wake time 07:00 to 09:00.
- Leaving on check-out day: after waking and before 10:00 (replaces `HOTEL_CHECK_OUT_LEAVE`, which starts at 06:00).
- Between 10:00 and 13:00 every room has nobody inside.

Hotel guests get a `sleeping` phase in `GuestPhase` (the range goes from 12 to 13).

### State and view

- The unit variant gets a value `sleeping` (`views.ts`, `unitVariant` in `apps/server/src/tower-socket/snapshot.ts`). It is set when at least one person of the unit has phase `sleeping` and is in the unit.
- For a hotel room, `sleeping` takes the place of `occupied`; `dirty` and `infested` still win.
- People in the `sleeping` phase are in the `inside` group, as seated workers are.

### Sprite

New sprites `sleeping_day` and `sleeping_night` for the condo and each hotel room type, drawn from the `closed_*` sprites with an occupied bed. They are added to `apps/web/src/render/atlasManifest.ts` and the unit atlas, and `unitPlan.ts` picks them for the `sleeping` variant. The art follows `docs/art/style-guide.md`.

## Left to the builder

- Exact packing and the save migration.
- Where bed time lives for hotel guests (the same "no intention left" rule works).
- How the three sleeping looks are produced in `tools/art`.
- Final window values, within the numbers above.

## Calls made without asking

- Bed time windows for hotels and the 30% Saturday work chance.
- The 20 to 40 minute delay between waking and leaving.
- "Sleeping" shows if one person sleeps even when another is awake.
