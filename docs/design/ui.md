# UI layout, tools and Spanish glossary

Version 1.0, 11 November 2026. Owner: Game Designer. Task TM-18.

This document defines the game screen: where each region sits, what every tool does, what every window shows, how overlays and dialogs work, and the exact Spanish text of every label and message. It is the contract for the UI kit (TM-63), the toolbar (TM-66), the renderer and the screens that follow, and for QA.

Sources: `docs/GDD.md` section Interfaz, the construction rules (`docs/design/construction.md`, TM-8), the economy rules (`docs/design/economy.md`, TM-9), the unit catalog in `packages/shared` (TM-6), the engine and protocol doc (`docs/tech/engine-and-protocol.md`, TM-5) and the art style guide (`docs/art/style-guide.md`, TM-69). Where the GDD leaves a point open, the decision is marked "Design call" with a short reason. The numbered rules in section 14 are what QA checks.

Other specs own parts of the content shown here. Elevator band times and limits come from TM-12. Event deadlines and options come from TM-15. The full list of news and notice texts belongs to TM-17; section 13.9 holds the texts that exist today, and TM-17 adds to that table rather than starting a new one.

All UI text is Spanish (Rioplatense, with voseo: "Dejá", "Cambiá"). Code, ids and string keys are English.

## 1. Units of measure and scale

Two scales are used and they never mix.

- Zoom applies to the tower view only. It is a whole number from 1 to 4 and means one art pixel is drawn as `zoom × zoom` device pixels, nearest neighbour, as in the style guide.
- UI scale applies to everything else (status bar, toolbar, windows, news line). Sizes in this document are in UI pixels at UI scale 1. At UI scale `s` every UI pixel is `s × s` CSS pixels.

UI scale is chosen from the browser viewport in CSS pixels:

```
uiScale = clamp(floor(min(viewportWidth / 1024, viewportHeight / 640)), 1, 3)
```

So 1024 x 640 up to 2047 x 1279 is scale 1, 2048 x 1280 and up is scale 2, and so on. The scale is recalculated on every resize. Below 1024 x 640 the game is not drawn and a centered message reads "Agrandá la ventana del navegador para jugar." (`ui.viewportTooSmall`).

Design call: a fixed minimum and whole-number UI scale keep the pixel font and the 16 x 16 icons sharp, the same reason the tower uses whole-number zoom.

Font: one bitmap pixel font, 8 UI pixels line height, glyphs about 6 UI pixels wide, with full Spanish coverage (á é í ó ú ü ñ Ñ ¿ ¡ and the uppercase accented vowels). Text is never scaled by fractions.

Number formats:

| What | Format | Example |
|---|---|---|
| Money | `$` + thousands with `.`, no decimals | `$2.000.000` |
| Negative money | minus before `$` | `-$12.500` |
| Signed change | `+` or `-` before `$` | `+$3.000`, `-$40.000` |
| Counts | thousands with `.` | `Población 12.345` |
| Time | 24 h, two digits each, `:` | `07:30`, `19:05` |
| Minutes of stress | whole number + ` min` | `18 min` |

## 2. Screen layout

The screen at UI scale 1, with `W` and `H` the viewport size in UI pixels:

```
+--------------------------------------------------------------+  y = 0
| Status bar (full width, 24 px)                               |
+--------+-----------------------------------------------------+  y = 24
|        |                                                     |
| Tool-  |                Tower view                           |
| bar    |      (floating windows open over this area)         |
| 80 px  |                                                     |
|        |                                       [legend]      |
+--------+-----------------------------------------------------+  y = H - 20
| News line (full width, 20 px)                                |
+--------------------------------------------------------------+  y = H
```

| Region | Position | Size |
|---|---|---|
| Status bar | x 0, y 0 | W x 24 |
| Toolbar | x 0, y 24 | 80 x (H - 44) |
| Tower view | x 80, y 24 | (W - 80) x (H - 44) |
| News line | x 0, y H - 20 | W x 20 |
| Overlay legend | bottom left corner of the tower view, 4 px inset | as needed, only when an overlay other than Normal is on |
| Toast | centered over the news line, bottom edge 4 px above it | as needed |

Windows float over the tower view. They can be dragged anywhere, but at least 24 x 12 UI pixels of the title bar always stay inside the tower view, so a window can never be lost off screen. A window that would end up outside after a resize is moved back in.

Default window positions, measured inside the tower view:

| Window | Default position |
|---|---|
| Mapa de la torre | top right, 8 px from each edge |
| Finanzas | top right, 8 px from each edge (below the map if the map is open) |
| Inspection windows (unit, person, elevator) | next to the clicked object, on the side with more room, 16 px away, then clamped into the view |
| Personas seguidas, Avisos, Estrellas | top left, 8 px from each edge |
| Decision and confirm dialogs | centered in the tower view |
| Menú | below the Menú button |

A window opened a second time comes back where the player last left it during this session.

## 3. Tower view

### 3.1 What it shows

The cross-section of the whole site: 375 columns and levels from S10 up to four levels of sky above level 104, with ground and soil drawn below level 1. Sky and windows follow the day and night art of the style guide.

### 3.2 Zoom

- Levels 1x, 2x, 3x and 4x. Default 2x.
- Ctrl + mouse wheel, the `+` and `-` keys, and the two zoom buttons in the status bar change zoom by one step.
- Zooming with the wheel keeps the cell under the cursor fixed on screen. Zooming with keys or buttons keeps the center of the view fixed.

### 3.3 Scroll

- Mouse wheel scrolls vertically, one level per notch. Shift + wheel scrolls horizontally, 8 columns per notch.
- Arrow keys and W A S D scroll: one level or 8 columns per press, repeated while held.
- Middle-button drag, or Space + left-button drag, pans freely.
- Clicking or dragging on the tower map centers the view on that point.
- Scroll stops 8 columns past either side of the site, at the bottom of S10, and four levels above level 104.
- On load the view is centered on the main lobby, or on column 187 of level 1 if there is no lobby yet.

### 3.4 Hover and cursor

- The cell under the cursor is outlined with a 1 px white frame when a building tool is active.
- A level ruler on the left edge of the tower view shows the label of every visible level ("12", "S3"). The hovered level label is drawn in `lamp`.
- With the Lupa, hovering over a person, car or unit shows a tooltip with its name after 0.5 s.

## 4. Status panel

The status bar holds, from left to right:

| Item | Content | Width |
|---|---|---|
| Menú button | text "Menú" | 40 |
| Date | `{weekday} {day} de {month}, año {year}` | fits text |
| Time | `HH:MM` | 32 |
| Money | balance in money format; red (`cloth-red`) when negative | 72 |
| Population | `Población {n}` | fits text |
| Stars | 5 star icons, or 5 stars plus the word "TORRE" at the top rank; click opens Estrellas | 80 or 112 |
| Overlay selector | 4 buttons: Normal, Evaluación, Precios, Hotel | 4 x 24 |
| Zoom | buttons "-" and "+" | 2 x 16 |
| Window buttons | Mapa, Finanzas, Seguidos, Avisos | 4 x 24, icon buttons with tooltips |

Examples of the date block: "Lunes 1 de enero, año 1  00:00", "Miércoles 11 de noviembre, año 3  14:35".

- The time shows game hours and minutes, truncated, so it changes every game minute (every 0.625 real seconds).
- The date changes at 00:00. Saturday and Sunday are written in `dusk` instead of ink, so the weekend reads at a glance.
- Money and population update with every delta. A filled star is `lamp`, an empty star is a `slate` outline.
- When the window is narrower than everything above, the window buttons drop into the Menú list first, then the zoom buttons.

## 5. Toolbar

### 5.1 Layout

```
+--------------------+
| [Lupa][Topa][Cab.] |  fixed tools, 3 buttons 24 x 24
+--------------------+
| [Estr.]  [Trans.]  |
| [Of/V]   [Hotel ]  |  categories, 2 x 3 buttons 36 x 24
| [Com/E]  [Serv. ]  |
+--------------------+
| [t1] [t2]          |
| [t3] [t4]          |  tools of the open category,
| [t5] [t6]          |  2 columns of 36 x 36 buttons
| ...                |
+--------------------+
| Tool info box      |  bottom, 80 x 64
+--------------------+
```

- Until the icons exist, buttons show their name as text. A name that does not fit the button without breaking a word uses its short form from 13.3 (`category.short.*`, `tool.short.*`). The tooltip and the accessible name keep the full name.
- One category is open at a time. Clicking a category opens it and does not change the current tool.
- Tool buttons show the 16 x 16 icon at 2x. The current tool's button is drawn pressed.
- The tool info box shows the current tool: name, size, price, and for the lobby the height choice (5.4). Hovering any tool button shows that tool in the box until the cursor leaves.
- Every tool button also has a tooltip: line 1 name and price, line 2 size, line 3 (locked tools only) "Se desbloquea con {n} estrellas".
- A tool locked by stars is drawn with a gray dither over its icon and a small lock, and cannot be selected.

### 5.2 Fixed tools

| Order | Tool id | Name | Icon key | Shortcut |
|---|---|---|---|---|
| 1 | `inspect` | Lupa | `ui/tool-inspect` | L, or Esc twice |
| 2 | `bulldozer` | Topadora | `ui/tool-bulldozer` | T |
| 3 | `car` | Cabina | `ui/tool-car` | C |

The Lupa is the default tool when the game opens.

### 5.3 Categories and tool order

Categories follow the GDD order. Inside each category, tools are sorted by unlock stars, then by catalog order. Every catalog unit appears exactly once.

| Category id | Name | Order | Tool (unit id) | Name | Size (cols x levels) | Price | Stars |
|---|---|---|---|---|---|---|---|
| `structure` | Estructura | 1 | `floor` | Piso | 1 x 1 per cell | $500 por casillero | 1 |
| | | 2 | `lobby` | Lobby | 1 x 1, 2 o 3 per column | $5.000 por casillero | 1 |
| `transport` | Transporte | 1 | `stairs` | Escalera | 8 x 2 | $5.000 | 1 |
| | | 2 | `escalator` | Escalera mecánica | 8 x 2 | $20.000 | 1 |
| | | 3 | `standard-elevator` | Ascensor estándar | 4, hasta 30 pisos | $200.000 + $80.000 por cabina | 1 |
| | | 4 | `service-elevator` | Ascensor de servicio | 4, hasta 30 pisos | $100.000 + $50.000 por cabina | 2 |
| | | 5 | `express-elevator` | Ascensor expreso | 6 | $400.000 + $150.000 por cabina | 3 |
| `offices-and-housing` | Oficinas y vivienda | 1 | `office` | Oficina | 9 x 1 | $40.000 | 1 |
| | | 2 | `condo` | Departamento | 16 x 1 | $80.000 | 1 |
| `hotel` | Hotel | 1 | `single-room` | Habitación simple | 4 x 1 | $20.000 | 2 |
| | | 2 | `double-room` | Habitación doble | 6 x 1 | $50.000 | 2 |
| | | 3 | `suite` | Suite | 10 x 1 | $100.000 | 2 |
| | | 4 | `housekeeping` | Limpieza | 15 x 1 | $50.000 | 2 |
| `commerce-and-entertainment` | Comercio y entretenimiento | 1 | `fast-food` | Comida rápida | 16 x 1 | $100.000 | 1 |
| | | 2 | `restaurant` | Restaurante | 24 x 1 | $200.000 | 3 |
| | | 3 | `retail-shop` | Local comercial | 12 x 1 | $100.000 | 3 |
| | | 4 | `cinema` | Cine | 31 x 2 | $500.000 | 3 |
| | | 5 | `party-hall` | Salón de fiestas | 24 x 2 | $100.000 | 3 |
| `services` | Servicios | 1 | `security` | Seguridad | 16 x 1 | $100.000 | 2 |
| | | 2 | `medical-center` | Centro médico | 26 x 1 | $500.000 | 3 |
| | | 3 | `parking-ramp` | Rampa de estacionamiento | 16 x 1 | $50.000 | 3 |
| | | 4 | `parking-space` | Cochera | 4 x 1 | $3.000 | 3 |
| | | 5 | `recycling-center` | Centro de reciclaje | 25 x 2 | $500.000 | 3 |
| | | 6 | `subway-station` | Estación de subte | 30 x 3 | $1.000.000 | 4 |
| | | 7 | `cathedral` | Catedral | 28 x 4 | $3.000.000 | 5 |

Names, sizes, prices and stars are read from the shared catalog, never typed into the UI. This table is the check that the catalog and the UI agree. The "Size" column is what the info box and tooltip print, in the format `{w} x {h} casilleros`; stairs and escalators print `8 casilleros, une 2 pisos`, shafts print `Hueco de {w}, hasta 30 pisos` or `Hueco de 6` for the express.

Tool icons use the key `ui/unit-{unitId}`. Category icons use `ui/cat-{categoryId}`. The art team draws these from this list.

### 5.4 How each tool is used

Common behaviour for every building tool:

- A ghost of what would be built follows the cursor, snapped to cells. Its bottom-left cell is the hovered cell (units, stairs, escalators), or it spans the drag (floor, lobby, shafts).
- The ghost has a 1 px `leaf` outline when the client's pre-check passes and a `cloth-red` outline when it fails. Next to the cursor a label shows the total cost (`$40.000`) or, when the pre-check fails, the Spanish message of the error code.
- The pre-check is a convenience. The client may check bounds, stars, money, occupied cells and zone. The server decides; a server rejection always shows its message.
- After a placement the tool stays selected, so the player can place the same thing again.
- Right click or Esc cancels a drag in progress. Esc with no drag in progress returns to the Lupa.

| Tool | Input | Command sent |
|---|---|---|
| Piso | Press on a cell, drag left or right on the same level, release. The ghost covers the run; the cost counts only new cells. | `buildFloor` with the level and the two end columns |
| Lobby | Same drag as Piso. The info box has a height choice "Alto: 1 · 2 · 3", default 1. If the hovered level already has lobby, the choice is locked to that height and shows "Alto fijado por el lobby existente". On level 1 with no lobby yet the info box adds the warning "La altura del lobby principal no se puede cambiar después." | `buildLobby` |
| Unit tools | Click. | `buildUnit` |
| Escalera, Escalera mecánica | Click on the lower level. The ghost covers the footprint and the landing on the level above. | `buildTransport` |
| Elevator tools | Press on the bottom level, drag up or down, release on the top level. The label shows `{n} pisos` and the cost. Standard and service turn red past 30 levels. The express ghost only snaps its ends to its allowed stops. | `buildShaft` |
| Cabina | Click on an existing shaft, at the level that will be the new car's home. The ghost is a car at that level. Price label is that shaft's car price. | `addCar` |
| Topadora | Hover outlines, in `cloth-red`, what would be removed. Click removes it. On floor and on sky lobby, press and drag on one level to remove a run. | `demolish` or `removeCar` |
| Lupa | Click opens the matching window (section 6). | `inspect` |

What the Topadora and the Lupa pick under the cursor, first match wins:

1. A person (Lupa only).
2. An elevator car.
3. A unit, stair, escalator, shaft or ruins.
4. Lobby.
5. Floor.

Demolition asks for confirmation (dialog 9.3) only when:

- the target is a sold condo, because the player pays the sale price back, or
- the target's build price is $500.000 or more (cinema, medical center, recycling center, subway station, cathedral, express shafts).

Every other demolition is immediate. Design call: the game has no pause and a 1-hour full refund for mistakes (TM-8 8.4), so constant confirmations would slow building more than they protect.

### 5.5 Feedback after a command

- Accepted construction: the construction sound plays at the spot, and a floating amount in `cloth-red` (`-$40.000`) rises 16 px over 1 real second from the top center of the new object.
- Accepted demolition with a refund: the demolition sound, and a floating amount in `leaf` (`+$40.000`) if the refund is above $0.
- Rejected command: a toast shows the code's message for 3 real seconds, and the error sound plays. Rejections are not written to the news line.
- Income events (`moneyChanged` with a positive amount tied to a unit) show a floating `leaf` amount over that unit if it is on screen, and play the cash register sound at most once per real second.

## 6. Inspection windows

### 6.1 Common window frame

Every window (from TM-63) has a title bar with the title on the left and a close button "x" on the right, a 1 px ink border, a bevel, and a body. Clicking anywhere on a window brings it to the front. Esc closes the front window when no drag or text field is active.

Window limits:

| Window | How many at once |
|---|---|
| Unit | 4. Opening a fifth closes the oldest. Inspecting a unit whose window is open brings it to the front. |
| Person | 4, same rule |
| Elevator | 2, same rule |
| Every other window | 1 |

Inspection windows refresh with the `inspect` messages (about once per second). When the inspected thing is demolished or leaves the tower, its window shows "Ya no está en la torre." and its controls are disabled; it stays until closed.

Level labels used everywhere: levels 1 to 100 are "Piso {n}", basements are "S{n}", levels 101 to 104 are "Catedral".

### 6.2 Unit window

Title: the unit's custom name, or `{type name} · {level label}` when it has none, for example "Oficina · Piso 12".

First row for every unit: "Nombre" text field (max 24 characters, placeholder is the type name). Enter or leaving the field sends `renameUnit`; an empty field removes the custom name. Second row: "Ubicación: Piso 12, casilleros 40 a 48".

Then the rows for the unit type. A value in braces comes from the `inspect` data; rows marked (new data) need a field that TM-5 8.9 does not list yet, and BE adds it with the unit's system.

| Unit | Rows |
|---|---|
| Oficina | Estado: Ocupada / En alquiler. Personas: `{n} de 6`. Evaluación. Precio por semana (price choice). Contrato: `Semana {k} de 4` or `Sin contrato`. Próximo pago: `{weekday} {HH:MM}`. |
| Local comercial | As Oficina, plus Clientes esta semana: `{n}` (new data). |
| Departamento | Estado: Vendido / En venta. Residentes: `{n} de 3`. Evaluación. Precio de venta (price choice, disabled when sold, with the note "Ya está vendido."). Próxima evaluación: `{weekday} {day} de {month}` (only when sold). |
| Habitación simple, doble, Suite | Estado: Libre / Ocupada / Sucia / Con plaga. Huéspedes: `{n} de {cap}`. Evaluación (of the last stay). Precio por noche (price choice). Salida: `{weekday} 10:00` (only when occupied). |
| Comida rápida, Restaurante | Estado: Abierto / Cerrado. Clientes hoy: `{n}`. Clientes ayer: `{n}`. Resultado de ayer: signed money. (new data for all three counts) |
| Cine | Película: `Semana {w} (día {age})`. Público por función hoy: `14:00: {n} · 19:00: {n}`. Resultado de ayer: signed money. Button "Cambiar película ($300.000)" (new data for audience and result) |
| Salón de fiestas | Invitados hoy: `{n} de 50`. Resultado de ayer: signed money. (new data) |
| Limpieza | Mucamas trabajando: `{n} de 6`. Habitaciones sucias en la torre: `{n}`. (new data) |
| Seguridad | Estado: En servicio. |
| Centro médico | Pacientes hoy: `{n}` (new data). |
| Centro de reciclaje | Cubre: `{covered} de {population} personas` for the whole tower (2.500 per center) (new data). |
| Rampa de estacionamiento | Cocheras conectadas en este piso: `{n}` (new data). |
| Cochera | Estado: Libre / Asignada / Sin conexión. |
| Estación de subte | Estado: En servicio. |
| Catedral | Invitados presentes: `{n} de 40`. Último intento de boda: `{date}` or `Ninguno`. (new data) |

The price choice is a column of 4 radio buttons with the amount from the economy tables, for example for an office:

```
( ) Alto     $15.000
(o) Normal   $10.000
( ) Bajo      $5.000
( ) Mínimo    $2.000
```

Choosing a radio sends `setPrice` at once. There is no confirm; changing the price is free (TM-9 section 3).

Evaluation is shown as a 6 x 6 color square plus the word, using the colors of the Evaluación overlay (section 7): "Buena", "Regular", "Mala", or "Sin evaluar" before the first evaluation.

The film change button asks for confirmation (dialog 9.3), then sends `changeFilm`. It is disabled with the tooltip "No alcanza el dinero." when the balance is under $300.000.

The Lupa on lobby, floor, stairs and escalators opens no window; the hover tooltip shows the name only.

### 6.3 Person window

Title: the person's name, or the kind ("Oficinista") when unnamed.

| Row | Content |
|---|---|
| Nombre | Text field, max 24 characters, `renamePerson` on Enter or blur |
| Tipo | Person kind (13.6) |
| Estado | Caminando / Esperando el ascensor / En el ascensor / En la escalera / En {unit name} / Sin ruta / Fuera de la torre |
| Destino | `{unit name} · {level label}`, or "Sale de la torre", or "Ninguno" |
| Estrés | `{n} min ({level})` in the stress color: normal is ink, alto is `stress-pink`, muy alto is `stress-red` |
| Vive en / Trabaja en / Se aloja en | The home unit, by kind: residents "Vive en", office workers "Trabaja en", guests "Se aloja en"; hidden for kinds with no home unit |

Buttons:

- "Seguir" / "Dejar de seguir". Following needs a name (GDD: "hasta 20 personas con nombre"). With no name the button is disabled and its tooltip is "Poné un nombre para seguir a esta persona." With 20 followed it is disabled with the `FOLLOW_LIMIT` message as tooltip.
- "Centrar": moves the view to the person, keeping the zoom.

Followed people are drawn with a 3 x 2 `lamp` marker 2 px above the head, at every zoom.

### 6.4 Personas seguidas window

Title "Personas seguidas ({n} de 20)". One row per followed person: stress color square, name, kind, and an "x" to stop following. Clicking a row centers the view on the person and opens the person window. Empty list text: "Todavía no seguís a nadie. Abrí una persona con la Lupa, ponele nombre y tocá Seguir."

### 6.5 Elevator window

Title: `{shaft type name} · {bottom label} a {top label}`, for example "Ascensor estándar · S2 a Piso 25". An asterisk is added at the end while there are unapplied changes.

Three tabs: "Recorrido", "Cabinas", "Horarios". The footer has "Aplicar" and "Descartar", which act on the stops, car homes and schedule together (`configureShaft`). Both are disabled when there are no changes. Closing the window with unapplied changes discards them.

Recorrido tab:

- "Desde" and "Hasta": two level dropdowns, and a button "Cambiar recorrido" that sends `resizeShaft` at once. Express dropdowns list only allowed express stops.
- "Paradas": one row per level in the range, top to bottom, each with a checkbox "Para en {level label}". On express shafts, levels outside the express stops are not listed. Buttons "Todas" and "Ninguna" above the list.

Cabinas tab:

- One row per car: `Cabina {k}`, "Base:" dropdown of the levels where the shaft stops, `{n} pasajeros` (current load), and a button "Quitar". "Quitar" sends `removeCar` at once; it is disabled on the last car with the tooltip from `LAST_CAR`.
- Button "Agregar cabina ({car price})" sends `addCar` at once with the lowest stop as home. Disabled at 8 cars with the `CAR_LIMIT` message as tooltip.

Horarios tab:

- A two-way switch "Días hábiles" / "Fin de semana" picks which 6 bands are edited.
- A table with 6 rows. Columns: "Franja" (`HH:MM a HH:MM`, from the TM-12 band boundaries), "Modo" (dropdown: Normal, Expreso hacia arriba, Expreso hacia abajo), "Espera" (number field, game seconds, `{n} s`), "Respuesta" (number field, `{n} pisos`, default 5). Number limits come from TM-12; the field clamps to them.
- Button "Copiar a fin de semana" (or "Copiar a días hábiles") copies the visible 6 bands to the other day type.

### 6.6 Finance window

Title "Finanzas". Layout as TM-9 section 9.3:

```
Saldo                         $1.234.567

                     Esta semana   Semana anterior
Alquileres              $40.000         $35.000
Hotel                   $12.000         $18.000
Venta de departamentos       $0        $150.000
Comercios y entretenimiento ...
Eventos                     ...
Construcción          -$120.000        -$80.000
Mantenimiento          -$30.000        -$30.000
Devolución de departamentos  $0              $0
Películas                    $0              $0
-------------------------------------------------
Total ingresos          ...             ...
Total gastos            ...             ...
Resultado               ...             ...
```

Header line under the title: "Semana del lunes {day} de {month}" for the current week. Rows are in the TM-9 category order. Each amount is right aligned; negatives in `cloth-red`. "Resultado" is bold (drawn one pixel wider) and colored by sign. Categories with income and expenses show the net in the row, while the totals split them as TM-9 9.3 says.

### 6.7 Tower map window

Title "Mapa de la torre". The body is a picture of the whole site, one UI pixel per column and 2 UI pixels per level: 375 x 228, with a 1 px ink border.

| Content | Color |
|---|---|
| Sky above ground | `sky-light` |
| Soil below ground | `wood-dark` |
| Floor with nothing on it | `concrete-dark` |
| Lobby | `concrete-light` |
| Stairs, escalators, shafts | `slate` |
| Offices and housing | `cloud` |
| Hotel | `dusk` |
| Commerce and entertainment | `leaf` |
| Services (except cathedral) | `cloth-blue` |
| Cathedral | `lamp` |
| Ruins and burnt cells | `charcoal` |
| Subway tunnel (S10) | `ink` |
| The visible area of the tower view | 1 px `white` frame |

People are not drawn. The map redraws at most once per real second. Pressing or dragging on it centers the tower view on that point.

### 6.8 Estrellas window

Design call: the GDD lists the stars in the status panel but no way to see what the next star needs. A small window opened by clicking the stars shows it, with no new data beyond population and stars.

Title "Estrellas". Rows: "Rango actual: {n} estrellas" (or "Torre"), then "Para {n+1} estrellas:" (or "Para el rango Torre:") and the requirements of the next step as plain text from 13.10, with a progress bar for population `{population} de {target}`. At the top rank the body says "La torre llegó al rango máximo."

### 6.9 Avisos window

Title "Avisos". The last 50 notices and news, newest first, each `{weekday abbr} {HH:MM}  {text}`. Notices tied to a unit have a "Ver" button that centers the view on it and opens its unit window.

### 6.10 Menú

A drop-down list under the Menú button:

| Item | Effect |
|---|---|
| Sonido: sí / Sonido: no | Toggles all sound. Stored in the browser (local storage), default sí. |
| Mapa, Finanzas, Seguidos, Avisos | Only when they dropped out of the status bar (section 4) |
| Empezar una torre nueva | Opens confirm dialog 9.3 "Torre nueva" |
| Cerrar sesión | Logs out at once and goes to the login screen |

## 7. Overlays

The overlay selector in the status bar has 4 buttons; exactly one is on. Keys 1 to 4 pick them in order.

| Order | Overlay id | Button | Applies to |
|---|---|---|---|
| 1 | `normal` | Normal | nothing, plain view |
| 2 | `evaluation` | Evaluación | offices, shops, condos, hotel rooms |
| 3 | `price` | Precios | offices, shops, condos (unsold and sold), hotel rooms |
| 4 | `hotel` | Hotel | hotel rooms |

Drawing: an overlay draws its value color over each unit it applies to as a 2 x 2 checker dither (every other art pixel), keeping the sprite readable without blending colors. Every other unit, stair and escalator gets a `charcoal` checker so the covered units stand out. Shafts, cars and people are drawn normally.

| Overlay | Value | Label | Color |
|---|---|---|---|
| Evaluación | good | Buena | `sky-deep` |
| | fair | Regular | `lamp` |
| | poor | Mala | `cloth-red` |
| | none yet, or empty unit | Sin evaluar | `gray` |
| Precios | high | Alto | `cloth-red` |
| | normal | Normal | `leaf` |
| | low | Bajo | `sky-deep` |
| | minimum | Mínimo | `lamp` |
| Hotel | clean and free | Limpia | `leaf` |
| | occupied | Ocupada | `sky-deep` |
| | dirty | Sucia | `dusk` |
| | infested | Con plaga | `cloth-red` |

The legend in the bottom left of the tower view lists the 4 labels of the active overlay with their color squares, under the overlay name.

## 8. News line and toasts

### 8.1 News line

The bottom bar shows one notice at a time: `{weekday abbr} {HH:MM}  {text}`, left aligned, cut with "..." if too long (the full text is in the tooltip and in Avisos).

- New notices queue. Each one stays at least 4 real seconds. If more than 5 are waiting, the line skips to the newest and the skipped ones go only to Avisos.
- After 20 real seconds without a new notice the line keeps the last one, drawn in `gray`.
- Two kinds: normal (ink text) and alert (`cloth-red` text, alarm icon at the left). Alerts are: bomb, fire, negative balance, cockroaches, a blocked star check. Alerts play the notice sound; the bomb and fire alerts play their alarms instead.
- Clicking the line opens Avisos. Clicking a notice tied to a unit also centers on it.

### 8.2 Toasts

Toasts are only for rejected commands of the player. Successful actions show no toast. One toast at a time; a new one replaces the old. 3 real seconds. Not stored in Avisos.

## 9. Dialogs

### 9.1 Decision dialogs

Opened by `decisionOpened`. The game keeps running.

- Centered, always above every other window, draggable, with no close button.
- Body text, then a line `Respondé antes de las {HH:MM}` (or `antes del {weekday} {HH:MM}` when the deadline is on another day), then one button per option. The default option is the right-most button.
- Clicking a button sends `answerEvent` and closes the dialog. At the deadline, `decisionClosed` closes it and a notice says which option was applied.
- If the answer is rejected with `EVENT_EXPIRED`, the dialog closes and the toast shows the message.

| Decision | Title | Body | Buttons (left to right, default last) |
|---|---|---|---|
| `bomb` | Amenaza de bomba | Alguien llamó para avisar que dejó una bomba en la torre. Pide {ransom} para decir dónde está. Si no pagás, seguridad la va a buscar. Si no la encuentra antes de las 13:00, explota. | "Pagar {ransom}" (`pay`), "No pagar" (`refuse`) |
| `fire` | Incendio | Hay un incendio en el piso {level}. Un helicóptero lo puede apagar por $500.000. Si no lo llamás, seguridad va a tratar de contenerlo. | "Llamar al helicóptero ($500.000)" (`helicopter`), "No llamar" (`burn`) |

TM-15 may add decisions; each needs a row here.

### 9.2 Information dialogs

Centered, one "Aceptar" button, close button allowed. They do not stop anything.

| Trigger | Title | Body |
|---|---|---|
| `starsChanged` up to 2-5 | ¡{n} estrellas! | La torre llegó a {n} estrellas. Ahora podés construir: {list of unit names unlocked at n}. |
| `weddingCompleted` | ¡Rango Torre! | Los novios se casaron en la catedral. Tu edificio es oficialmente una Torre. |
| First login of a new tower | Bienvenida | Tenés $2.000.000 para empezar. Construí el lobby en el piso 1 y después los pisos, las oficinas y los ascensores. |

Stars can only go up in the current rules; if a later spec lowers them, a notice is enough.

### 9.3 Confirm dialogs

Two buttons, the safe one on the right and focused. Esc means the safe option.

| Id | Title | Body | Buttons (action, safe) |
|---|---|---|---|
| `demolishSoldCondo` | Demoler departamento | Este departamento está vendido. Si lo demolés, le devolvés {price} a los dueños. | "Demoler", "Cancelar" |
| `demolishExpensive` | Demoler {type name} | ¿Seguro que querés demoler {type name}? Costó {price}. | "Demoler", "Cancelar" |
| `changeFilm` | Cambiar película | La película nueva cuesta $300.000. | "Cambiar", "Cancelar" |
| `newTower` | Torre nueva | Se demuele toda la torre y empezás de cero el lunes 1 de enero del año 1, con $2.000.000. No se puede deshacer. | "Demoler y empezar", "Cancelar" |

### 9.4 Connection states

| State | How it is shown | Text |
|---|---|---|
| Connecting after load | Centered box over the tower view | Conectando... |
| Socket lost | Banner across the top of the tower view; input disabled; retries every 2 s | Se perdió la conexión. Reintentando... |
| `PROTOCOL_MISMATCH` | Centered dialog, button "Recargar" reloads the page | Hay una versión nueva del juego. Recargá la página. |
| `NOT_AUTHENTICATED` | Go to the login screen with a notice above the form | La sesión se cerró. Entrá de nuevo. |

## 10. Login and register screens

Both screens are a single centered window over a still picture of a night skyline, with the game name "Tower Magnate" above it. No status bar, toolbar or news line.

Entrar (login):

- Title "Entrar". Fields "Usuario" and "Contraseña". Button "Entrar". Link below: "¿No tenés cuenta? Creá una".
- Enter submits.

Crear cuenta (register):

- Title "Crear cuenta". Fields "Usuario", "Contraseña", "Repetir contraseña". Button "Crear cuenta". Link: "¿Ya tenés cuenta? Entrá".
- Under "Usuario" a hint in `gray`: "De 3 a 20 caracteres: a-z, 0-9 y _".
- Under "Contraseña": "Al menos 8 caracteres".

Validation runs on submit. Messages appear under the field they belong to, in `cloth-red`; server messages without a field appear above the button. Texts are in 13.12. While a request is running the button reads "Entrando..." or "Creando...", and is disabled.

## 11. Keyboard

| Key | Action |
|---|---|
| Esc | Cancel drag; else close the front window; else return to the Lupa |
| L, T, C | Lupa, Topadora, Cabina |
| 1, 2, 3, 4 | Overlays Normal, Evaluación, Precios, Hotel |
| M | Open or close Mapa de la torre |
| F | Open or close Finanzas |
| Arrows, W A S D | Scroll |
| + / - | Zoom |
| Space + drag | Pan |

Shortcuts do nothing while a text or number field has focus.

## 12. String keys

The strings module (TM-63) holds every text in this document under these key patterns. The tables in section 13 give the key for each text.

| Pattern | Use |
|---|---|
| `unit.{unitId}` | Unit and tool names |
| `category.{categoryId}` | Toolbar categories |
| `tool.{toolId}` | Lupa, Topadora, Cabina |
| `window.{id}.title`, `window.{id}.{field}` | Window titles and labels |
| `value.{group}.{value}` | Enumerated values (states, evaluations, prices) |
| `overlay.{id}` | Overlay names |
| `error.{CODE}` | Error messages |
| `news.{key}` | News and notices (TM-17 owns the full list) |
| `dialog.{id}.title`, `.body`, `.{button}` | Dialogs |
| `auth.{key}` | Login and register |
| `ui.{key}` | Everything else |
| `calendar.weekday.{0-6}`, `calendar.weekdayShort.{0-6}`, `calendar.month.{1-12}` | Calendar names, 0 is Monday |

Placeholders are written `{name}` and are filled by the code. Money and counts are formatted before they are inserted.

## 13. Glossary

### 13.1 General terms

These are the words to use in every Spanish text. Do not swap them for synonyms.

| Concept | Spanish | Do not use |
|---|---|---|
| Cell, tile | casillero | celda, baldosa |
| Floor (level) | piso | planta, nivel |
| Basement | subsuelo (label `S{n}`) | sótano |
| Main lobby | lobby principal | hall |
| Sky lobby | lobby del cielo | |
| Elevator shaft | hueco | |
| Elevator car | cabina | |
| Stop (of an elevator) | parada | |
| Home level of a car | base | |
| Star rating | estrellas | |
| Top rank | Torre (rango Torre) | |
| Population | población | |
| Balance | saldo | |
| Rent | alquiler | renta |
| Lease | contrato | |
| Tenant | inquilino | |
| Price level | precio | tarifa |
| Evaluation | evaluación | calificación |
| Stress | estrés | |
| Upkeep | mantenimiento | |
| Construction | construcción | |
| Demolish | demoler | destruir, borrar |
| Weekday / weekend | día hábil / fin de semana | |
| Notice | aviso | notificación |
| News | noticias | |
| Overlay | vista | capa |

### 13.2 Units, tools and categories

| Key | Text |
|---|---|
| `unit.floor` | Piso |
| `unit.lobby` | Lobby |
| `unit.stairs` | Escalera |
| `unit.escalator` | Escalera mecánica |
| `unit.standard-elevator` | Ascensor estándar |
| `unit.service-elevator` | Ascensor de servicio |
| `unit.express-elevator` | Ascensor expreso |
| `unit.office` | Oficina |
| `unit.condo` | Departamento |
| `unit.fast-food` | Comida rápida |
| `unit.single-room` | Habitación simple |
| `unit.double-room` | Habitación doble |
| `unit.suite` | Suite |
| `unit.housekeeping` | Limpieza |
| `unit.security` | Seguridad |
| `unit.restaurant` | Restaurante |
| `unit.retail-shop` | Local comercial |
| `unit.cinema` | Cine |
| `unit.party-hall` | Salón de fiestas |
| `unit.medical-center` | Centro médico |
| `unit.parking-ramp` | Rampa de estacionamiento |
| `unit.parking-space` | Cochera |
| `unit.recycling-center` | Centro de reciclaje |
| `unit.subway-station` | Estación de subte |
| `unit.cathedral` | Catedral |
| `ui.ruins` | Escombros |
| `ui.mainLobby` | Lobby principal |
| `ui.skyLobby` | Lobby del cielo |
| `tool.inspect` | Lupa |
| `tool.bulldozer` | Topadora |
| `tool.car` | Cabina |
| `category.structure` | Estructura |
| `category.transport` | Transporte |
| `category.offices-and-housing` | Oficinas y vivienda |
| `category.hotel` | Hotel |
| `category.commerce-and-entertainment` | Comercio y entretenimiento |
| `category.services` | Servicios |

The `unit.*` texts must equal the `name` field of the shared catalog.

### 13.3 Toolbar and placement texts

| Key | Text |
|---|---|
| `ui.size` | {w} x {h} casilleros |
| `ui.sizeTransport` | 8 casilleros, une 2 pisos |
| `ui.sizeShaft` | Hueco de {w}, hasta 30 pisos |
| `ui.sizeShaftExpress` | Hueco de 6 |
| `ui.pricePerCell` | {price} por casillero |
| `ui.priceShaft` | {shaft} + {car} por cabina |
| `ui.lockedStars` | Se desbloquea con {n} estrellas |
| `ui.lobbyHeight` | Alto: |
| `ui.lobbyHeightLocked` | Alto fijado por el lobby existente |
| `ui.mainLobbyWarning` | La altura del lobby principal no se puede cambiar después. |
| `ui.shaftSpan` | {n} pisos |

Short button labels, used only on toolbar buttons:

| Key | Text |
|---|---|
| `category.short.structure` | Estruct. |
| `category.short.transport` | Transp. |
| `category.short.offices-and-housing` | Of. y viv. |
| `category.short.commerce-and-entertainment` | Com. y entr. |
| `tool.short.bulldozer` | Topa |
| `tool.short.car` | Cab. |
| `tool.short.condo` | Depto. |
| `tool.short.single-room` | Hab. simple |
| `tool.short.double-room` | Hab. doble |
| `tool.short.restaurant` | Restó |
| `tool.short.retail-shop` | Local |
| `tool.short.security` | Segur. |
| `tool.short.parking-ramp` | Rampa |

### 13.4 Status bar, calendar and menus

| Key | Text |
|---|---|
| `ui.menu` | Menú |
| `ui.date` | {weekday} {day} de {month}, año {year} |
| `ui.population` | Población {n} |
| `ui.towerRank` | TORRE |
| `ui.zoomIn` / `ui.zoomOut` | Acercar / Alejar |
| `ui.soundOn` / `ui.soundOff` | Sonido: sí / Sonido: no |
| `ui.newTower` | Empezar una torre nueva |
| `ui.logout` | Cerrar sesión |
| `ui.viewportTooSmall` | Agrandá la ventana del navegador para jugar. |
| `ui.close` | Cerrar |
| `ui.accept` | Aceptar |
| `ui.cancel` | Cancelar |
| `ui.apply` | Aplicar |
| `ui.discard` | Descartar |
| `ui.center` | Centrar |
| `ui.see` | Ver |
| `ui.goneFromTower` | Ya no está en la torre. |
| `ui.levelFloor` | Piso {n} |
| `ui.levelBasement` | S{n} |
| `ui.levelCathedral` | Catedral |
| `ui.columns` | casilleros {x0} a {x1} |

| Index | `calendar.weekday` | `calendar.weekdayShort` |
|---|---|---|
| 0 | Lunes | Lun |
| 1 | Martes | Mar |
| 2 | Miércoles | Mié |
| 3 | Jueves | Jue |
| 4 | Viernes | Vie |
| 5 | Sábado | Sáb |
| 6 | Domingo | Dom |

`calendar.month.1` to `.12`: enero, febrero, marzo, abril, mayo, junio, julio, agosto, septiembre, octubre, noviembre, diciembre. Month names are lowercase, weekday names are capitalized when they start a line.

### 13.5 Window titles and labels

| Key | Text |
|---|---|
| `window.finance.title` | Finanzas |
| `window.map.title` | Mapa de la torre |
| `window.followed.title` | Personas seguidas ({n} de 20) |
| `window.notices.title` | Avisos |
| `window.stars.title` | Estrellas |
| `window.unit.name` | Nombre |
| `window.unit.location` | Ubicación |
| `window.unit.status` | Estado |
| `window.unit.people` | Personas |
| `window.unit.residents` | Residentes |
| `window.unit.guests` | Huéspedes |
| `window.unit.evaluation` | Evaluación |
| `window.unit.pricePerWeek` | Precio por semana |
| `window.unit.pricePerNight` | Precio por noche |
| `window.unit.salePrice` | Precio de venta |
| `window.unit.alreadySold` | Ya está vendido. |
| `window.unit.lease` | Contrato |
| `window.unit.leaseWeek` | Semana {k} de 4 |
| `window.unit.noLease` | Sin contrato |
| `window.unit.nextPayment` | Próximo pago |
| `window.unit.nextEvaluation` | Próxima evaluación |
| `window.unit.checkout` | Salida |
| `window.unit.customersWeek` | Clientes esta semana |
| `window.unit.customersToday` | Clientes hoy |
| `window.unit.customersYesterday` | Clientes ayer |
| `window.unit.resultYesterday` | Resultado de ayer |
| `window.unit.film` | Película |
| `window.unit.filmAge` | Semana {w} (día {age}) |
| `window.unit.audienceToday` | Público por función hoy |
| `window.unit.changeFilm` | Cambiar película ($300.000) |
| `window.unit.partyGuests` | Invitados hoy |
| `window.unit.maidsWorking` | Mucamas trabajando |
| `window.unit.dirtyRooms` | Habitaciones sucias en la torre |
| `window.unit.patientsToday` | Pacientes hoy |
| `window.unit.recyclingCovers` | Cubre |
| `window.unit.connectedSpaces` | Cocheras conectadas en este piso |
| `window.unit.weddingGuests` | Invitados presentes |
| `window.unit.lastWedding` | Último intento de boda |
| `window.unit.none` | Ninguno |
| `window.person.type` | Tipo |
| `window.person.status` | Estado |
| `window.person.destination` | Destino |
| `window.person.stress` | Estrés |
| `window.person.livesIn` | Vive en |
| `window.person.worksIn` | Trabaja en |
| `window.person.staysIn` | Se aloja en |
| `window.person.follow` | Seguir |
| `window.person.unfollow` | Dejar de seguir |
| `window.person.needsName` | Poné un nombre para seguir a esta persona. |
| `window.person.leavingTower` | Sale de la torre |
| `window.followed.empty` | Todavía no seguís a nadie. Abrí una persona con la Lupa, ponele nombre y tocá Seguir. |
| `window.elevator.route` | Recorrido |
| `window.elevator.cars` | Cabinas |
| `window.elevator.schedule` | Horarios |
| `window.elevator.from` | Desde |
| `window.elevator.to` | Hasta |
| `window.elevator.resize` | Cambiar recorrido |
| `window.elevator.stops` | Paradas |
| `window.elevator.stopsAt` | Para en {level} |
| `window.elevator.all` | Todas |
| `window.elevator.none` | Ninguna |
| `window.elevator.car` | Cabina {k} |
| `window.elevator.home` | Base |
| `window.elevator.load` | {n} pasajeros |
| `window.elevator.removeCar` | Quitar |
| `window.elevator.addCar` | Agregar cabina ({price}) |
| `window.elevator.weekdays` | Días hábiles |
| `window.elevator.weekend` | Fin de semana |
| `window.elevator.band` | Franja |
| `window.elevator.bandRange` | {from} a {to} |
| `window.elevator.mode` | Modo |
| `window.elevator.dwell` | Espera |
| `window.elevator.dwellValue` | {n} s |
| `window.elevator.response` | Respuesta |
| `window.elevator.responseValue` | {n} pisos |
| `window.elevator.copyToWeekend` | Copiar a fin de semana |
| `window.elevator.copyToWeekdays` | Copiar a días hábiles |
| `window.finance.balance` | Saldo |
| `window.finance.weekOf` | Semana del lunes {day} de {month} |
| `window.finance.thisWeek` | Esta semana |
| `window.finance.lastWeek` | Semana anterior |
| `window.finance.totalIncome` | Total ingresos |
| `window.finance.totalExpenses` | Total gastos |
| `window.finance.result` | Resultado |
| `window.stars.current` | Rango actual: {n} estrellas |
| `window.stars.currentTower` | Rango actual: Torre |
| `window.stars.next` | Para {n} estrellas: |
| `window.stars.nextTower` | Para el rango Torre: |
| `window.stars.population` | Población {n} de {target} |
| `window.stars.max` | La torre llegó al rango máximo. |

Finance categories use the TM-9 labels under `value.ledger.{categoryId}`: Alquileres, Hotel, Venta de departamentos, Comercios y entretenimiento, Eventos, Construcción, Mantenimiento, Devolución de departamentos, Películas.

### 13.6 Values

| Key | Text |
|---|---|
| `value.evaluation.good` | Buena |
| `value.evaluation.fair` | Regular |
| `value.evaluation.poor` | Mala |
| `value.evaluation.none` | Sin evaluar |
| `value.price.high` | Alto |
| `value.price.normal` | Normal |
| `value.price.low` | Bajo |
| `value.price.minimum` | Mínimo |
| `value.lease.occupied` | Ocupada |
| `value.lease.forRent` | En alquiler |
| `value.condo.sold` | Vendido |
| `value.condo.forSale` | En venta |
| `value.room.free` | Libre |
| `value.room.clean` | Limpia |
| `value.room.occupied` | Ocupada |
| `value.room.dirty` | Sucia |
| `value.room.infested` | Con plaga |
| `value.venue.open` | Abierto |
| `value.venue.closed` | Cerrado |
| `value.service.active` | En servicio |
| `value.parking.free` | Libre |
| `value.parking.assigned` | Asignada |
| `value.parking.disconnected` | Sin conexión |
| `value.stress.normal` | normal |
| `value.stress.high` | alto |
| `value.stress.veryHigh` | muy alto |
| `value.elevatorMode.normal` | Normal |
| `value.elevatorMode.expressUp` | Expreso hacia arriba |
| `value.elevatorMode.expressDown` | Expreso hacia abajo |
| `value.personState.walking` | Caminando |
| `value.personState.waitingElevator` | Esperando el ascensor |
| `value.personState.riding` | En el ascensor |
| `value.personState.onStairs` | En la escalera |
| `value.personState.inUnit` | En {unit} |
| `value.personState.noRoute` | Sin ruta |
| `value.personState.outside` | Fuera de la torre |
| `value.person.officeWorker` | Oficinista |
| `value.person.resident` | Residente |
| `value.person.hotelGuest` | Huésped |
| `value.person.customer` | Cliente |
| `value.person.audience` | Espectador |
| `value.person.partyGuest` | Invitado a la fiesta |
| `value.person.maid` | Mucama |
| `value.person.securityGuard` | Guardia de seguridad |
| `value.person.vip` | VIP |
| `value.person.weddingGuest` | Invitado a la boda |

Unit states use the feminine form for oficina, habitación and cochera, and the masculine for departamento and the venues, matching the noun. The engine's state ids are mapped to these keys by the client.

### 13.7 Overlays

| Key | Text |
|---|---|
| `overlay.normal` | Normal |
| `overlay.evaluation` | Evaluación |
| `overlay.price` | Precios |
| `overlay.hotel` | Hotel |

### 13.8 Error messages

Every `ErrorCode` of TM-5 section 6, plus `NOT_PRICED` from TM-9. These texts are final; TM-8 section 10 and TM-9 section 13 already use them. Key: `error.{CODE}`.

| Code | Message |
|---|---|
| `INVALID_COMMAND` | Orden inválida. |
| `NEGATIVE_BALANCE` | No se puede construir con saldo negativo. |
| `INSUFFICIENT_FUNDS` | No alcanza el dinero. |
| `STAR_LOCKED` | Hacen falta más estrellas. |
| `BOMB_EVENT_ACTIVE` | No se puede construir seguridad durante una amenaza de bomba. |
| `LIMIT_REACHED` | La torre ya tiene el máximo de esta unidad. |
| `CAR_LIMIT` | El hueco ya tiene 8 cabinas. |
| `LAST_CAR` | El hueco necesita al menos una cabina. |
| `OUT_OF_BOUNDS` | Fuera del terreno. |
| `LEVEL_RESERVED` | El S10 es para el túnel del subte. |
| `LOBBY_LEVEL_ONLY` | En el piso 1 solo va el lobby. |
| `LOBBY_FLOOR_NOT_ALLOWED` | El lobby va en el piso 1 o en los pisos 15, 30, 45, 60, 75 y 90. |
| `ABOVE_GROUND_ONLY` | Esta unidad va sobre tierra, entre los pisos 2 y 100. |
| `BASEMENT_ONLY` | Esta unidad va solo en subsuelos. |
| `CATHEDRAL_LEVEL_ONLY` | Arriba del piso 100 solo va la catedral. |
| `CATHEDRAL_POSITION` | La catedral va arriba del piso 100. |
| `SUBWAY_POSITION` | El subte va en el subsuelo más bajo. |
| `SPANS_GROUND` | No puede quedar mitad arriba y mitad abajo de tierra. |
| `EXPRESS_STOP_NOT_ALLOWED` | El expreso solo para en subsuelos, el piso 1 y los lobbies del cielo. |
| `CELL_OCCUPIED` | El lugar está ocupado. |
| `NOTHING_TO_BUILD` | Ya está construido. |
| `NO_SUPPORT` | No tiene dónde apoyarse. |
| `NO_FLOOR` | Primero hay que construir el piso. |
| `TRANSPORT_LANDING` | Falta piso libre arriba para llegar. |
| `LOBBY_HEIGHT_MISMATCH` | El lobby de este piso tiene otra altura. |
| `LOBBY_NOT_CONTIGUOUS` | El lobby principal tiene que ser continuo. |
| `ESCALATOR_FLOOR_TYPE` | La escalera mecánica solo va en pisos de lobby, comercio, entretenimiento o habitaciones simples. |
| `SHAFT_TOO_TALL` | Este ascensor cubre hasta 30 pisos. |
| `SHAFT_TOO_CLOSE` | Dejá 8 casilleros libres entre huecos de ascensor. |
| `RAMP_POSITION` | Las rampas van en una sola columna, desde el S1 hacia abajo. |
| `PARKING_NOT_CONNECTED` | La cochera tiene que conectarse a la rampa. |
| `RECYCLING_NOT_ADJACENT` | El reciclaje nuevo va pegado a otro. |
| `MAIN_LOBBY_PROTECTED` | El lobby principal no se puede demoler. |
| `SUPPORTS_STRUCTURE` | Hay algo apoyado acá. Demolé eso primero. |
| `SHAFT_IN_USE` | Hay gente viajando en el ascensor. |
| `NOTHING_TO_DEMOLISH` | No hay nada para demoler. |
| `UNKNOWN_ENTITY` | Eso ya no está en la torre. |
| `PRICE_LOCKED` | El departamento ya está vendido. El precio no se puede cambiar. |
| `NOT_PRICED` | Esta unidad no tiene precio. |
| `NOT_A_CINEMA` | Solo el cine cambia de película. |
| `EVENT_EXPIRED` | Ya pasó el plazo para responder. |
| `INVALID_CHOICE` | Esa opción no está disponible. |
| `FOLLOW_LIMIT` | Ya seguís a 20 personas. |
| `INVALID_SCHEDULE` | Revisá las paradas y las bases de las cabinas. |
| `PROTOCOL_MISMATCH` | Hay una versión nueva del juego. Recargá la página. |
| `NOT_AUTHENTICATED` | La sesión se cerró. Entrá de nuevo. |
| `RATE_LIMITED` | Demasiadas órdenes seguidas. Esperá un momento. |
| any other code | No se pudo hacer. |

A spec that adds an error code adds its row here in the same PR.

### 13.9 News and notices

Line format `{weekday abbr} {HH:MM}  {text}`. "Alert" marks the red kind of 8.1. The full catalog, with triggers, placeholders and rate limits, is `docs/design/messages.md`; this table keeps the first keys and new keys go there.

| Key | Text | Alert |
|---|---|---|
| `news.shopLeftNoCustomers` | Un local se fue por falta de clientes. | |
| `news.officeLeft` | Una oficina quedó vacía. Los inquilinos no renovaron. | |
| `news.shopLeftEvaluation` | Un local quedó vacío. Los inquilinos no renovaron. | |
| `news.condoBuyback` | Los dueños de un departamento se fueron. Se les devolvió el dinero. | |
| `news.cinemaChangeFilm` | Pocas entradas vendidas. Cambiá la película. | |
| `news.upkeepNegative` | El mantenimiento dejó la caja en rojo. No se puede construir hasta recuperar. | yes |
| `news.starsUp` | La torre llegó a {n} estrellas. | |
| `news.towerRank` | ¡Hubo boda en la catedral! La torre alcanzó el rango Torre. | |
| `news.starBlockedSecurity` | La torre no subió de estrellas: falta una oficina de seguridad. | yes |
| `news.starBlockedVip` | La torre no subió de estrellas: falta la aprobación del VIP. | yes |
| `news.starBlockedSuites` | La torre no subió de estrellas: hacen falta 2 suites. | yes |
| `news.starBlockedRecycling` | La torre no subió de estrellas: hace falta un centro de reciclaje cada 2.500 personas. | yes |
| `news.starBlockedMedical` | La torre no subió de estrellas: alguien no pudo ir al centro médico desde la última revisión. | yes |
| `news.starBlockedParking` | La torre no subió de estrellas: alguien no consiguió cochera desde la última revisión. | yes |
| `news.starBlockedSubway` | La torre no subió de estrellas: falta la estación de subte. | yes |
| `news.weddingFailed` | No llegaron todos los invitados a la boda antes de las 12:30. | |
| `news.bombThreat` | Amenaza de bomba en la torre. | yes |
| `news.bombPaid` | Se pagó el rescate. La amenaza terminó. | |
| `news.bombFound` | Seguridad encontró la bomba y la desactivó. | |
| `news.bombExploded` | Explotó la bomba en el piso {level}. | yes |
| `news.fire` | Incendio en el piso {level}. | yes |
| `news.fireHelicopter` | El helicóptero apagó el incendio. | |
| `news.fireOut` | El incendio se apagó. | |
| `news.vipArrives` | Un VIP viene a pasar la noche en una suite. | |
| `news.vipApproved` | El VIP quedó conforme con su estadía. | |
| `news.vipRejected` | El VIP se fue disconforme. | |
| `news.treasure` | ¡Apareció un tesoro en el {level}! Ganaste {amount}. | |
| `news.cockroaches` | Hay cucarachas en una habitación del piso {level}. Solo se eliminan demoliendo. | yes |
| `news.santa` | ¡Feliz Navidad! Papá Noel pasó por la torre. | |
| `news.decisionDefault` | Se terminó el plazo. Se aplicó: {option}. | |

### 13.10 Star requirements (Estrellas window)

| Key | Text |
|---|---|
| `stars.req.2` | Población de 300. |
| `stars.req.3` | Población de 1.000 y al menos una oficina de seguridad. |
| `stars.req.4` | Población de 5.000, visita del VIP aprobada, 2 suites, un centro de reciclaje cada 2.500 personas, y nadie sin centro médico ni cochera desde la última revisión. |
| `stars.req.5` | Población de 10.000, estación de subte, un centro de reciclaje cada 2.500 personas, y nadie sin centro médico ni cochera desde la última revisión. |
| `stars.req.tower` | Población de 15.000, catedral construida y una boda completa un sábado o domingo antes de las 12:30. |

These follow the GDD table with the numbers from `docs/design/stars.md` (TM-14). A change to a requirement there updates this table.

### 13.11 Dialog texts

All texts of section 9 are keyed `dialog.{id}.title`, `dialog.{id}.body` and `dialog.{id}.{option}`, with these ids: `bomb`, `fire`, `starsUp`, `towerRank`, `welcome`, `demolishSoldCondo`, `demolishExpensive`, `changeFilm`, `newTower`, `protocolMismatch`, `connecting`, `connectionLost`. The texts are the ones in the section 9 tables; extra keys:

| Key | Text |
|---|---|
| `dialog.deadlineToday` | Respondé antes de las {time} |
| `dialog.deadlineOtherDay` | Respondé antes del {weekday} {time} |
| `dialog.bomb.pay` | Pagar {ransom} |
| `dialog.bomb.refuse` | No pagar |
| `dialog.fire.helicopter` | Llamar al helicóptero ($500.000) |
| `dialog.fire.burn` | No llamar |
| `dialog.demolish` | Demoler |
| `dialog.changeFilm.confirm` | Cambiar |
| `dialog.newTower.confirm` | Demoler y empezar |
| `dialog.protocolMismatch.reload` | Recargar |

### 13.12 Login and register

| Key | Text |
|---|---|
| `auth.login.title` | Entrar |
| `auth.register.title` | Crear cuenta |
| `auth.username` | Usuario |
| `auth.password` | Contraseña |
| `auth.passwordRepeat` | Repetir contraseña |
| `auth.login.submit` | Entrar |
| `auth.login.busy` | Entrando... |
| `auth.register.submit` | Crear cuenta |
| `auth.register.busy` | Creando... |
| `auth.toRegister` | ¿No tenés cuenta? Creá una |
| `auth.toLogin` | ¿Ya tenés cuenta? Entrá |
| `auth.usernameHint` | De 3 a 20 caracteres: a-z, 0-9 y _ |
| `auth.passwordHint` | Al menos 8 caracteres |
| `auth.required` | Completá este campo. |
| `auth.usernameInvalid` | El usuario lleva de 3 a 20 caracteres: letras minúsculas, números o _. |
| `auth.passwordShort` | La contraseña lleva al menos 8 caracteres. |
| `auth.passwordMismatch` | Las contraseñas no coinciden. |
| `auth.usernameTaken` | Ese usuario ya existe. Probá con otro. |
| `auth.wrongCredentials` | Usuario o contraseña incorrectos. |
| `auth.sessionClosed` | La sesión se cerró. Entrá de nuevo. |
| `auth.networkError` | No se pudo conectar. Probá de nuevo. |

The username and password limits come from TM-52. The server's 409 maps to `auth.usernameTaken` and its 401 to `auth.wrongCredentials`.

## 14. Rules

### Layout and scale

UI-01. UI scale is `clamp(floor(min(viewportWidth / 1024, viewportHeight / 640)), 1, 3)` and is recalculated on resize.

UI-02. Below 1024 x 640 CSS pixels the game is not drawn and `ui.viewportTooSmall` is shown.

UI-03. At UI scale 1 the status bar is 24 px tall at the top, the news line 20 px tall at the bottom, the toolbar 80 px wide on the left between them, and the tower view fills the rest.

UI-04. A window can be dragged anywhere, but at least 24 x 12 px of its title bar stays inside the tower view, including after a resize.

UI-05. Tower zoom is 1x to 4x in whole steps, default 2x. Wheel zoom keeps the cell under the cursor fixed.

UI-06. Scroll stops 8 columns outside the site on each side, at the bottom of S10 and four levels above level 104.

UI-07. On load the view is centered on the main lobby, or on column 187 of level 1 when there is no lobby.

### Status panel

UI-08. The date reads `{weekday} {day} de {month}, año {year}` and the time `HH:MM` in 24 h, truncated to the game minute. Lunes 1 de enero, año 1, 00:00 is the first moment of a new tower.

UI-09. Saturday and Sunday dates are drawn in `dusk`, weekdays in ink.

UI-10. Money uses `.` for thousands and no decimals. A negative balance is drawn in `cloth-red` with the minus sign before `$`.

UI-11. Stars show 5 slots, filled up to the rating; at the top rank all 5 are filled and "TORRE" is shown.

### Toolbar

UI-12. Fixed tools are Lupa, Topadora and Cabina in that order. The Lupa is selected when the game opens.

UI-13. Categories are, in order: Estructura, Transporte, Oficinas y vivienda, Hotel, Comercio y entretenimiento, Servicios.

UI-14. Every unit in the shared catalog appears in exactly one category, in the order of the 5.3 table: by unlock stars, then catalog order.

UI-15. A tool whose unlock stars are above the current rating is disabled and its tooltip includes "Se desbloquea con {n} estrellas".

UI-16. Tool names, sizes and prices in the UI come from the shared catalog. `unit.{id}` equals the catalog `name`.

UI-17. A building tool stays selected after a placement. Esc cancels a drag; with no drag it selects the Lupa.

UI-18. The lobby height choice is locked to the existing height on a level that already has lobby.

UI-19. The shaft tool counts levels as it is dragged and marks standard and service ghosts red past 30 levels.

UI-20. Lupa and Topadora pick, in order: person (Lupa only), car, unit or transport or shaft or ruins, lobby, floor.

UI-21. Demolition asks for confirmation only for a sold condo or a target whose build price is $500.000 or more.

UI-22. An accepted construction shows a floating `-{price}` in `cloth-red`; a refund above $0 shows `+{refund}` in `leaf`.

UI-23. A rejected command shows its `error.{CODE}` message in a toast for 3 real seconds and does not write to the news line. An unknown code shows "No se pudo hacer."

### Windows

UI-24. At most 4 unit windows, 4 person windows and 2 elevator windows are open; opening one more closes the oldest of that kind. Other windows are single.

UI-25. Unit and person names are limited to 24 characters in the field. An empty name removes the custom name.

UI-26. A unit window shows the price choice only for offices, shops, hotel rooms and condos; for a sold condo it is disabled with "Ya está vendido."

UI-27. Choosing a price sends `setPrice` at once with no confirmation.

UI-28. The cinema's "Cambiar película ($300.000)" asks for confirmation and is disabled when the balance is under $300.000.

UI-29. The person window's "Seguir" is disabled for a person with no name and when 20 people are followed.

UI-30. The elevator window sends stops, car homes and both schedules together on "Aplicar". Adding, removing cars and changing the range act at once.

UI-31. Express shafts list only their allowed stops in the stop list and the range dropdowns.

UI-32. The finance window shows Saldo, the TM-9 categories in order with "Esta semana" and "Semana anterior", then Total ingresos, Total gastos and Resultado.

UI-33. The tower map draws one UI pixel per column and two per level (375 x 228), shows no people, redraws at most once per real second, and centers the view where it is clicked.

UI-34. When the inspected object no longer exists the window shows "Ya no está en la torre." and disables its controls.

### Overlays

UI-35. Exactly one overlay is on. Keys 1 to 4 select Normal, Evaluación, Precios and Hotel.

UI-36. Overlay colors are those of the section 7 table, drawn as a 2 x 2 checker dither; units the overlay does not cover get a `charcoal` checker.

UI-37. The legend shows the active overlay's labels and colors, and is hidden in Normal.

### News line and dialogs

UI-38. Each notice stays on the news line at least 4 real seconds. With more than 5 waiting, the line jumps to the newest.

UI-39. Alert notices are drawn in `cloth-red` with an alarm icon.

UI-40. The Avisos window keeps the last 50 notices, newest first.

UI-41. Decision dialogs have no close button, stay above every window, show the deadline, and put the default option (no pagar, no llamar) as the right-most button.

UI-42. A decision dialog closes when answered or at `decisionClosed`, and in the second case a `news.decisionDefault` notice names the applied option.

UI-43. Confirm dialogs put the safe button on the right with focus; Esc chooses it.

UI-44. Losing the socket shows "Se perdió la conexión. Reintentando..." and disables input until reconnected.

### Text

UI-45. Every visible text comes from the strings module by key. No Spanish text is written inside components.

UI-46. Every `ErrorCode` in `shared` has an `error.{CODE}` text, and every catalog unit has a `unit.{id}` text. A test in the strings module checks both lists.

UI-47. Keyboard shortcuts are ignored while a text or number field has focus.

UI-48. The sound setting is stored in the browser and defaults to on.
