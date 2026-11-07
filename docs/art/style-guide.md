# Tower Magnate art style guide

Version 0.1, 9 November 2026. Owner: pixel art.

The tower is shown as a side-view cross-section in the style of early 1990s simulators: a small fixed palette, flat colors, hard pixel edges and a light source from the upper left. All art is original and drawn by the scripts in `tools/art`. Nothing is traced or copied from SimTower, Yoot Tower or any other game.

## Palette

The palette has 32 slots. Slot 0 is transparent. Every sprite uses only these colors, and scripts refer to them by id, never by raw hex. The source of truth is `tools/art/palette.json`, and `tools/art/src/palette.mjs` loads it. `docs/art/palette-swatch.png` shows the colors in index order, eight per row (`pnpm art:build` regenerates it).

| Index | Id | Hex | Use |
|---|---|---|---|
| 0 | clear | transparent | empty pixels |
| 1 | ink | #141218 | outlines, darkest shadow |
| 2 | charcoal | #2e2c36 | dark interiors, burnt remains |
| 3 | slate | #4f4e5c | metal shadow, elevator shafts |
| 4 | gray | #7b7a86 | metal base, machinery |
| 5 | silver | #a9a8b0 | metal highlight, furniture |
| 6 | cloud | #d6d4d0 | light walls, paper, sheets |
| 7 | white | #f4f1e8 | brightest highlight |
| 8 | concrete-dark | #6b5f55 | slab shadow, basement walls |
| 9 | concrete | #948576 | floor slab, structure |
| 10 | concrete-light | #bfb19c | slab highlight, lobby floor |
| 11 | wood-dark | #5a3a26 | wood shadow, roaches, soil |
| 12 | wood | #8a5a36 | desks, doors, counters |
| 13 | wood-light | #c08a54 | wood highlight, warm floors |
| 14 | sky-deep | #3d6fb6 | upper day sky |
| 15 | sky | #6f9fd8 | day sky |
| 16 | sky-light | #a9cdee | horizon day sky |
| 17 | night-deep | #10183a | upper night sky, unlit windows |
| 18 | night | #23305e | night sky, night window glass |
| 19 | dusk | #e0875a | sunrise and sunset, fire edges |
| 20 | glass | #8fb8c8 | day window glass |
| 21 | lamp | #f2d36b | lit windows, lamps, fire core |
| 22 | lamp-glow | #fff3b8 | light sources, sparkle |
| 23 | leaf-dark | #2f5a32 | plant shadow, grime |
| 24 | leaf | #4f8a3e | plants, grass, signs |
| 25 | skin-dark | #7a4a32 | skin tone |
| 26 | skin-mid | #b97a52 | skin tone |
| 27 | skin-light | #e6b48a | skin tone |
| 28 | cloth-red | #b0353a | clothing, signage, alarms |
| 29 | cloth-blue | #2f4f9a | clothing, uniforms |
| 30 | stress-pink | #f07aa8 | stressed people only |
| 31 | stress-red | #d81e2a | very stressed people only |

Materials use three-step ramps: dark, base and light. The ramps are gray (slate, gray, silver), concrete (concrete-dark, concrete, concrete-light), wood (wood-dark, wood, wood-light), day sky (sky-deep, sky, sky-light) and skin (skin-dark, skin-mid, skin-light). Stress-pink and stress-red are reserved for people, so the stress colors are never confused with furniture or signs.

## Sizes

These numbers are fixed. The web client reads them from `tools/art/metrics.json`, so code and art never disagree.

| Measure | Pixels at zoom 1 |
|---|---|
| Tile (one casillero) | 8 wide |
| Floor height | 32 |
| Floor slab | bottom 3 rows of each floor |
| Usable interior height | 29 |
| Tower width, 375 tiles | 3000 |
| Person frame | 8 x 16 |
| Person body | about 5 x 14 |
| Standard and service elevator car | 24 x 27, inside a 32 px shaft |
| Express elevator car | 40 x 27, inside a 48 px shaft |
| UI icon | 16 x 16 |

A unit sprite is exactly `width in tiles x 8` by `floors x 32` pixels. An office (9 x 1) is 72 x 32, a cinema (31 x 2) is 248 x 64 and the cathedral (28 x 4) is 224 x 128. The sprite's origin is its top-left pixel, and it is placed at the top-left corner of its leftmost tile on its topmost floor.

People stand on the slab: the bottom row of the person frame sits on the row just above the slab, which is row 28 of the floor counting from 0 at the top. Elevator cars sit on the same row when stopped at a floor.

The client zooms only by whole numbers (1x to 4x) with nearest-neighbour scaling. No sprite is ever drawn at a fractional position or scale.

## Outlines

- Units get a 1 px ink outline on their outer edge only. Inner details use the dark step of their own ramp, not ink.
- Neighbouring units share no outline pixel. Each unit draws its own frame inside its own rectangle.
- People have no outline. At 5 px wide an outline would eat the whole figure.
- Elevator cars get an ink outline. Shafts use slate walls with no outline.
- UI icons get a 1 px ink outline around the shape, inside the 16 x 16 cell.

## Shading

- Light comes from the upper left. The top and left edges of a shape use the light step of its ramp, the bottom and right edges use the dark step and the middle uses the base.
- No anti-aliasing, no gradients and no soft shadows. A pixel is one palette color.
- Dithering is allowed only in the sky background, as a 2 x 2 checker between two neighbouring sky colors.
- Every interior has a back wall, a floor and a small number of readable props (desks, beds, counters). Leave empty wall pixels so the room reads at 1x.

## Day and night

Every unit has a day and a night sprite. Night is drawn as its own sprite with the same layout: walls and props move one step down their ramp, window glass changes from glass to night, and lit windows use lamp with a lamp-glow centre. An occupied unit at night has lit windows. An empty unit at night has dark windows (night-deep).

## Unit states

| State | What it shows |
|---|---|
| empty | furniture without people, door closed, "for rent" sign in leaf for units that can be rented |
| occupied | furniture in use, lights on at night |
| dirty | hotel rooms only: unmade bed, leaf-dark and concrete-dark grime pixels on the floor |
| infested | hotel rooms only: the dirty sprite plus 4 to 8 roaches as 2 x 1 wood-dark pixels |
| burnt | charcoal and ink walls, no furniture, broken windows; one sprite for day and night |
| wedding | cathedral only: red carpet down the aisle, bows on the pews, flowers by the altar, a garland across the nave and the bell swinging; stained glass lit at night |

Stair, escalator, lobby and elevator sprites have no states, only day and night.

The cathedral has two states, `empty` and `wedding`. Its stained glass shows color by day. At night it is dark (night-deep) when empty and lit during a wedding.

## People

- Each person type has at least two body variants (build and skin tone) and two clothing variants.
- People are small and flat: a head of 3 x 3 skin pixels, a body in one clothing color and legs in a darker color.
- Calm people wear dark clothing (ink, charcoal, cloth-blue), which reads as the "black is normal" color in the GDD.
- Stressed people have their body and legs recolored with stress-pink, and very stressed people with stress-red. The head keeps its skin tone. The stress tints are separate sprites, not a runtime filter.
- Uniforms: maids wear cloud with a cloth-blue apron, security wears cloth-blue with a lamp badge pixel.
- Walking uses 2 frames. Standing in a queue uses 1 frame.

## Sprite ids

A sprite id is a path of lowercase segments joined by `/`: `<group>/<subject>/<variant>`. Words inside a segment use hyphens. The variant joins state, time of day and frame with underscores, in that order, leaving out the parts that do not apply.

Groups: `units`, `transport`, `people`, `structure`, `sky`, `ui`.

| Example id | Meaning |
|---|---|
| `units/office/occupied_day` | office, occupied, daytime |
| `units/office/empty_night` | office, empty, at night |
| `units/single-room/infested_day` | single hotel room with roaches, daytime |
| `units/office/burnt` | burnt office, same at any hour |
| `transport/standard-car/open` | standard elevator car, doors open |
| `transport/stairs/day` | stairs, daytime |
| `people/worker-a/walk-pink_02` | worker body A, walking, stressed, frame 2 |
| `structure/floor/day` | bare floor tile |
| `sky/day/top` | day sky tile, upper band |
| `ui/tool-bulldozer` | bulldozer tool icon |

Frame numbers have two digits and start at `01`. Ids in the atlas JSON are exactly these strings, with no `.png` suffix.

The full list of unit states, in the order scripts generate them: `empty`, `occupied`, `dirty`, `infested`, `burnt`, `wedding`. Times: `day`, `night`.

For people the variant is the action (`walk`, `stand`), a hyphen and the stress tint (`pink` or `red`), then the frame. Calm is the default and is left out, so `people/worker-a/walk_01` is a calm worker and `people/worker-a/walk-red_01` a very stressed one.

## Structure and sky

Structure sprites are in `tools/art/src/groups/structure.mjs`. Each one has a `day` and a `night` variant. The night sprite is the day drawing with every material one step down its ramp and glass turned to night (`tools/art/src/night.mjs`), plus the lit lamps.

| Subject | Size | Use |
|---|---|---|
| `floor` | 8 x 32 | a built floor with nothing on it |
| `lobby-1`, `lobby-2`, `lobby-3` | 8 x 32, 64 or 96 | one lobby column for a lobby 1, 2 or 3 floors tall |
| `lobby-1-column` and the other `-column` lobbies | same as the lobby | the same column with a marble column; place one every 4 tiles |
| `sky-lobby`, `sky-lobby-column` | 8 x 32 | sky lobby with a glass band, handrail and parquet |
| `basement` | 8 x 32 | an excavated basement level with nothing on it |
| `ground` | 32 x 32 | the soil level just under level 1, grass on top |
| `dirt` | 32 x 32 | unbuilt soil below that |
| `dirt-deep` | 32 x 32 | soil for the lowest basement levels |
| `edge-left`, `edge-right` | 3 x 32 | outer wall, drawn just outside the first and last column of each floor |
| `basement-edge-left`, `basement-edge-right` | 3 x 32 | retaining wall beside basement levels |
| `roof`, `roof-left`, `roof-right` | 8 x 4, 3 x 4 | parapet above the top floor of each column, and its two corners |
| `clay` | 32 x 32 | packed clay for the middle soil levels |
| `bedrock` | 32 x 32 | rock above the subway tunnel |
| `subway-tunnel`, `subway-tunnel-lamp` | 8 x 32 | one column of the S10 tunnel; place the lamp column every 4 tiles |
| `subway-tunnel-edge-left`, `subway-tunnel-edge-right` | 8 x 32 | the first and last column of the tunnel, closed by a concrete bulkhead on the outer side |

Unbuilt soil uses one subject per basement level:

| Level | Subject |
|---|---|
| S1 | `ground` |
| S2, S3 | `dirt` |
| S4 to S6 | `clay` |
| S7, S8 | `dirt-deep` |
| S9 | `bedrock` |
| S10 | `subway-tunnel` across the whole site |

Sky sprites are in `tools/art/src/groups/sky.mjs`. The times are `day`, `dusk` (sunrise and sunset) and `night`.

| Subject | Size | Use |
|---|---|---|
| `sky/<time>/top`, `middle`, `horizon` | 64 x 32 | sky bands from the top of the view down; repeat `horizon` down to the ground |
| `sky/skyline/<time>` | 128 x 48 | distant city, bottom on the ground line, repeats sideways |
| `sky/hills/<time>` | 128 x 16 | hills behind the skyline, repeats sideways |
| `sky/cloud-a/<time>`, `sky/cloud-b/<time>` | 24 x 8, 16 x 6 | drifting clouds |
| `sky/sun/day`, `sky/moon/night` | 12 x 12, 10 x 10 | sun for day and dusk, moon for night |

Stars are part of the night `top` and `middle` bands. `pnpm art:build` also writes `docs/art/structure-preview.png`, a 2x cross-section at day, dusk and night that uses every structure sprite.

## Elevators

Elevator sprites are in `tools/art/src/groups/transport.mjs`. They are indoors, so they have no day or night variant. Standard and service shafts are 4 tiles wide (32 px) and express shafts 6 tiles (48 px), as in rule C-33 of the construction design.

| Id | Size | Use |
|---|---|---|
| `transport/<type>-shaft/body` | 32 or 48 x 32 | one level of shaft, repeated on every level it serves |
| `transport/<type>-shaft/top` | 32 or 48 x 12 | machine room, drawn just above the top level |
| `transport/<type>-shaft/bottom` | 32 or 48 x 6 | pit with buffers, drawn just below the lowest level |
| `transport/<type>-car/open`, `closed` | 24 x 27, express 40 x 27 | the car, doors open or closed |

The types are `standard`, `service` and `express`. The car is drawn 4 px in from the left of its shaft, and when it stops at a floor its top is on row 2 of that floor so its bottom sits on row 28. The beam across the shaft at each slab tells the types apart: plain slate for standard, lamp and ink stripes for service, cloth-blue for express. `pnpm art:build` writes `docs/art/transport-preview.png`, a 3x sheet with each shaft and its car.

## Level ruler

The ruler is in `tools/art/src/groups/ui.mjs` and has no time variant. `ui/ruler-background` (24 x 32) is one level of the strip on the left edge of the view. `ui/ruler-plate` (20 x 13) goes on top of it at (1, 9), and the hovered level uses `ui/ruler-plate-hover`, lit in lamp. The client writes the label (`12`, `S3`) in ink on the plate.

## Hotel

Hotel sprites are in `tools/art/src/units/hotel.mjs` and `tools/art/src/units/housekeeping.mjs`.

| Subject | Size | States |
|---|---|---|
| `single-room` | 32 x 32 | empty, occupied, dirty, infested |
| `double-room` | 48 x 32 | empty, occupied, dirty, infested |
| `suite` | 80 x 32 | empty, occupied, dirty, infested |
| `housekeeping` | 120 x 32 | empty, occupied |

Every state has a `day` and a `night` sprite. Hotel rooms have cloud walls with a concrete-light wainscot, a red carpet, a lamp-colored room number above the door and a bed with the headboard on the right. An empty room has a made bed and a closed door. An occupied room adds a suitcase, a red tag on the door handle and lit lamps, and its windows are lit at night. A dirty room has an unmade bed, a towel on the floor and grime pixels. An infested room is the dirty room with 8 roaches on the walls, the bed and the floor, so it reads at 1x even at night. Housekeeping is a service room with linen shelves, washers, a sink and laundry carts; in the occupied state 3 maids stand in the room and the door is open.

`pnpm art:build` also writes `docs/art/hotel-preview.png`, a 2x sheet with one row per hotel subject and every variant left to right.

## Building the art

`pnpm art:build` draws every sprite group in `tools/art/src/groups` and rewrites the generated files. Each group is one module with a `name` (one of the groups above) and a `draw()` function that returns `{ id, canvas }` pairs. A new group is added to `tools/art/src/groups/index.mjs`.

The build writes one PNG per sprite to `assets/sprites/<id>.png` and one atlas per group to `assets/atlases/<group>.png` and `assets/atlases/<group>.json`. The JSON uses the PixiJS 8 spritesheet hash format, and ids ending in `_01`, `_02` and so on are listed as animations. The output depends only on the drawing code, so two builds give byte-identical files. The generated files are committed, and a test fails when they are out of date.
