# Sound cues

This document says when each sound effect of the GDD sound list plays, when it stops, how loud it is and how often it can repeat. The effects are the files in `assets/sfx/`, made by `tools/sfx` (TM-83). The client plays them through the sound hook (TM-152) with the volume and mute settings of TM-130. TM-173 wires the cues below to the client.

Related specs: events (`docs/design/events.md`, sections 4 and 5), stars (`docs/design/stars.md`, the wedding), UI (`docs/design/ui.md`, sections 5 and 8.1) and messages (`docs/design/messages.md`).

## 1. Where the rules live

`tools/sfx/cues.json` holds one entry per effect. `pnpm manifest` in `tools/sfx` joins it with `tools/sfx/effects.json` and writes `assets/sfx/manifest.json`. Every manifest entry has these playback fields:

| Field | Meaning |
|---|---|
| `trigger` | Name the client plays the effect on. |
| `stopTrigger` | Name the client stops a looping effect on. Every loop has one; one-shots have `null`. |
| `loop` | `true` when the file loops until the stop trigger. |
| `volume` | Gain from 0 to 1, multiplied by the player's volume setting. |
| `minIntervalMs` | The effect is skipped when it started less than this many real milliseconds ago. `0` means no limit. |
| `duckOthers` | While this effect plays, every other effect is multiplied by this gain. `null` means no ducking. |

The tests in `tools/sfx/test/manifest.test.ts` check that the committed manifest matches both source files, that no trigger name is used twice and that every loop has a stop trigger. The rows of section 2 match `cues.json`.

## 2. Cue table

Times are real time, not game time.

| Effect | Trigger | Plays when | Stop condition | Loop | Volume | Max rate |
|---|---|---|---|---|---|---|
| `bomb-alarm` | `event.bomb` | `decisionOpened` with kind `bomb`, or a snapshot with an open bomb decision | `event.bomb.end`: `decisionClosed` of that event, or the threat ends | yes | 0.8 | one instance |
| `fire-alarm` | `event.fire` | `decisionOpened` with kind `fire`, or a snapshot with an open fire decision | `event.fire.end`: `decisionClosed` of that event, or the fire ends | yes | 0.8 | one instance |
| `notification` | `notice.show` | a `news` event reaches the news line, except `news.bombThreat` and `news.fire` | ends by itself | no | 0.7 | 1 per 1000 ms |
| `wedding-bells` | `event.wedding` | `weddingCompleted`: the 40th guest enters the cathedral | ends by itself | no | 0.9 | once per wedding |
| `cash-register` | `money.income` | `moneyChanged` with a positive amount tied to a unit | ends by itself | no | 0.6 | 1 per 1000 ms |
| `construction` | `build.place` | an accepted build command | ends by itself | no | 0.8 | no limit |
| `demolition` | `build.demolish` | an accepted demolish command | ends by itself | no | 0.8 | no limit |
| `elevator-ding` | `elevator.arrive` | a car in view opens its doors | ends by itself | no | 0.7 | 1 per 500 ms |
| `elevator-move` | `elevator.travel` | a car in view starts moving | `elevator.travel.end`: no car in view is moving | yes | 0.4 | one instance |
| `lobby-ambience` | `ambience.lobby` | a lobby floor comes into view | `ambience.lobby.end`: no lobby floor in view | yes | 0.5 | one instance |
| `hotel-newspaper` | `hotel.morning` | the hotel morning check | ends by itself | no | 0.6 | no limit |
| `ui-click` | `ui.click` | a click on a toolbar or window button | ends by itself | no | 0.5 | no limit |

"One instance" means a loop that is already playing is not started again: a second start trigger while it plays does nothing, and one stop trigger stops it.

`elevator-move`, `lobby-ambience` and `hotel-newspaper` have no client source yet (see `UNUSED_TRIGGERS` in `apps/web/src/audio/sfxTriggers.ts`). Their rows say how they play once the client can tell what is in view and the server sends the hotel morning event.

## 3. Alarms

The bomb and fire alarms are the only effects that interrupt the player. They start when the decision dialog opens, so the sound and the dialog arrive together, and they stop when the decision closes. The alarm asks for an answer. Once the player answers it has done its job, even if the event goes on: a bomb search can last until 13:00 and a fire can burn until 19:00 game time, and an alarm over that whole time would wear the player out.

A bomb alarm stops at the first of:

- `decisionClosed` for the bomb event, by an answer or by the default at the deadline;
- the end of the threat (events.md 4.6), shown by `news.bombPaid`, `news.bombFound` or `news.bombExploded`;
- a snapshot or delta where the bomb event is no longer in the event views.

A fire alarm stops at the first of:

- `decisionClosed` for the fire event, by an answer, by the default at 16:00, or because the guards put the fire out first (events.md 3.3, the decision closes with its default);
- the end of the fire (events.md 5.8), shown by `news.fireOut` or `news.fireHelicopter`;
- a snapshot or delta where the fire event is no longer in the event views.

After a reload in the middle of an event, the client starts the alarm again from the snapshot when the event view has an open decision. With no open decision, for example during a bomb search, it stays silent.

The alert notices that open an event, `news.bombThreat` and `news.fire`, play the alarm and never the notification (ui.md 8.1). When the alarm and its notice arrive in the same batch, only the alarm plays. `news.bombExploded` is an alert too, but it ends the threat, so the alarm stops and the notification plays for it.

The bomb threat and the fire never run at the same time (events.md 2), so the two alarms never overlap. If they did, each would follow its own start and stop triggers.

## 4. Ducking

While an alarm plays, every other effect plays at 50% of its volume (`duckOthers` 0.5). This covers effects that start during the alarm and loops that were already playing, such as the lobby ambience. Ducking does not stack: with any ducking effect playing, the others are at 50%, and when the last one stops they go back to 100%. The client ramps the gain over 100 ms going down and 300 ms going up so the change does not click.

The player's volume and mute settings (TM-130) apply on top of the duck. Muted means silent, alarms included.

## 5. Rate limits

The notification plays at most once per real second. A notice that arrives less than 1000 ms after the last notification sound still goes to the news line and to Avisos, without a sound. Skipped sounds are dropped, not queued: six notices in one second give one sound. The 1000 ms count starts when the sound starts, and a notice skipped because of the limit does not restart it.

The cash register has the same 1000 ms limit (ui.md 5.5). The elevator ding has 500 ms, so a delta where several cars open their doors gives one ding. Construction, demolition and clicks follow the player's own actions and have no limit.

The wedding bells play once per wedding. A tower reaches the Torre rank once, so `weddingCompleted` arrives at most once per game, and the bells need no time limit.

## 6. Levels

Each file is normalized to a loudness target in `effects.json` (EBU R128): -16 LUFS for the alarms, -18 for construction, demolition, the cash register, the elevator ding and the bells, -20 for the notification, the hotel newspaper and the click, -24 for the elevator loop and -26 for the lobby. The `volume` of each cue sets the mix on top of that. The alarms are at 0.8 so they stand out over ducked effects without being harsh on a loop. The bells are at 0.9 because they mark the end goal of the game.

The two alarm files loop. They are 3-second stereo files encoded from the original ElevenLabs takes with no trim and no fade, so the seam stays clean: the bomb alarm repeats its beep pattern and the fire alarm rings for about 1.5 seconds, then decays and rings again.

## 7. Rules

SND-01. The bomb alarm starts on `decisionOpened` with kind `bomb`, loops and stops on `decisionClosed` of that event or at the end of the threat, whichever comes first.

SND-02. The fire alarm starts on `decisionOpened` with kind `fire`, loops and stops on `decisionClosed` of that event or at the end of the fire, whichever comes first.

SND-03. After a reload, an event view with an open bomb or fire decision starts its alarm.

SND-04. While an alarm plays, every other effect plays at 50% of its volume.

SND-05. The notification plays on each `news` event except `news.bombThreat` and `news.fire`, at most once per real second, and is dropped, not queued, inside that second.

SND-06. The wedding bells play once, on `weddingCompleted`.

SND-07. A loop that is playing is not started a second time.

SND-08. The manifest fields `trigger`, `stopTrigger`, `loop`, `volume`, `minIntervalMs` and `duckOthers` of each effect match the row of section 2.
