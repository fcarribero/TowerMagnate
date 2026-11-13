# Weather

The game has weather: a condition (sunny, cloudy or rain), a temperature in degrees Celsius and a season. Everything is a pure function of the game step. Nothing is stored, nothing is sent over the socket, and the simulation RNG is not used, so saved towers, scenario tests and state hashes are unchanged.

The code is `packages/engine/src/weather.ts`, exported to the client as `@tower-magnate/engine/weather`. The client already knows the step from every snapshot and delta, so it computes the weather and the forecast itself. Server and client read the same function and cannot disagree.

## Seasons

The calendar is the Gregorian one in `calendar.ts` (365 or 366 days, real months), and the tower starts on 1 January of year 1. The weather follows a temperate climate of the southern hemisphere, used only as a reference for the dates of the seasons and the ranges of temperature and rain; the game never says where the tower is. A season is set by the month: summer is December to February, autumn March to May, winter June to August, spring September to November. Spanish names: Verano, Otoño, Invierno, Primavera.

## Conditions

The day is cut into 4 blocks of 6 hours (00:00, 06:00, 12:00, 18:00). Each block has one condition, so rain lasts at least 6 hours and never flickers between steps. Every block gets a cloudiness value from 0 to 1: an integer hash of (salt, block number) averaged 1-2-1 with the two neighbor blocks, so neighbors are alike and spells last. The condition is rain above the season's rain limit, cloudy above its cloudy limit and sunny below.

| Season | Cloudy from | Rain from | Rain share of blocks, about |
|---|---|---|---|
| Summer | 0.55 | 0.69 | 14% |
| Autumn | 0.51 | 0.68 | 16% |
| Winter | 0.51 | 0.75 | 8% |
| Spring | 0.53 | 0.70 | 13% |

Rain falls all year, is heaviest in late summer and autumn and lightest in winter.

The salt is the fixed constant `WEATHER_SALT`, so every tower has the same weather. All functions take an optional seed in case a tower seed is wanted later.

A sunny night is shown as a clear night (moon icon, text Despejado). Night is before 06:00 and from 20:00.

## Temperature

Each day has a daily mean, a dawn low at 05:00 and an afternoon high at 15:00.

The mean is `18 + 6.5 * cos(2 * pi * (dayOfYear - 20) / 365)`, which is warmest in mid January and coldest in mid July (about 11.5 to 24.5 degrees), plus a per-day offset of up to 4 degrees either way from a hash of the day number.

The low is the mean minus the half range and the high is the mean plus it, where the half range is `4.2 + 0.8 * cos(2 * pi * (dayOfYear - 20) / 365)` (wider in summer, narrower in winter), then adjusted by the condition of the block that holds that hour (block 1 at 05:00, block 2 at 15:00):

| Condition | Added to the afternoon high | Added to the dawn low |
|---|---|---|
| Sunny | +2 | -1.5 |
| Cloudy | -1 | +1 |
| Rain | -3.5 | 0 |

Between those points the temperature follows half cosines: it rises from each low to the same day's high, and falls from each high to the next day's low. It is smooth, flat at both turning points, continuous across midnight and coldest just before dawn. The UI shows whole degrees.

## Forecast

`forecast(firstDay, count)` returns, per day: weekday, season, condition, minimum, maximum and rain chance. The minimum and maximum are the exact extremes of `temperatureAt` over that day, and the condition is rain when at least 2 of the 4 blocks are rain, otherwise cloudy when at least 2 are rain or cloudy, otherwise sunny. The rain chance is the share of rainy blocks (0, 25, 50, 75 or 100%). Because it calls the same functions, what the forecast says is what happens; `weather.test.ts` checks this over a week.

## Sky

The rain, clouds and darkening of the sky in `skyRows.ts` used to change by `Math.random` timers on the client. They now fade toward the condition of the current step (`bindWeather` calls `stage.showWeather`, which calls `setSkyWeather`): sunny clears the clouds, cloudy shows them, rain adds the rain, the overcast and the storm bank. The fade times are unchanged.

## UI

The top bar has a weather block right of the stars with the icon and the temperature. Click opens the Pronóstico window with today, the season and the next 7 days starting tomorrow. See `ui.md` section 6.8.1. Texts: Soleado, Despejado, Nublado, Lluvia, Primavera, Verano, Otoño, Invierno, Pronóstico.

The icons are line icons in `ObraIcon.tsx` (`weatherSun`, `weatherCloud`, `weatherRain`, `weatherMoon`) and 16 x 16 pixel icons in the art atlas (`ui/weather-sun`, `ui/weather-cloud`, `ui/weather-rain`, `ui/weather-moon`, `tools/art/src/icons/windows.mjs`).
