import { stepOfDate } from '@tower-magnate/engine/calendar';
import { conditionAt, type WeatherCondition } from '@tower-magnate/engine/weather';
import { Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { ClientStore } from '../model/clientStore';
import { snapshot } from '../testing/protocolFixtures';
import { createSky, setSkyWeather, skyWeatherOf, updateWeather } from './skyRows';
import { bindWeather } from './unitSource';

describe('sky weather is driven by the game weather', () => {
  const make = () => new Texture();

  it('maps sunny to a clear sky and keeps cloudy and rain', () => {
    expect(skyWeatherOf('sunny')).toBe('clear');
    expect(skyWeatherOf('cloudy')).toBe('cloudy');
    expect(skyWeatherOf('rain')).toBe('rain');
  });

  it('fades the rain in only after the game says rain, and out after it stops', () => {
    const sky = createSky('day', make);
    for (let i = 0; i < 20; i += 1) updateWeather(sky, 1);
    expect(sky.weather.intensity).toBe(0);
    setSkyWeather(sky, 'rain');
    for (let i = 0; i < 20; i += 1) updateWeather(sky, 1);
    expect(sky.weather.raining).toBe(true);
    expect(sky.weather.intensity).toBe(1);
    setSkyWeather(sky, 'sunny');
    for (let i = 0; i < 40; i += 1) updateWeather(sky, 1);
    expect(sky.weather.intensity).toBe(0);
    expect(sky.weather.cover).toBe(0);
  });

  it('does not change by itself over time', () => {
    const sky = createSky('day', make);
    setSkyWeather(sky, 'cloudy');
    for (let i = 0; i < 5000; i += 1) updateWeather(sky, 1);
    expect(sky.weather.kind).toBe('cloudy');
    expect(sky.weather.intensity).toBe(0);
  });

  it('is sent to the stage when the step moves into another weather block only', () => {
    const store = new ClientStore({ requestResync: () => undefined, now: () => 0 });
    store.applySnapshot({ ...snapshot, step: 0 });
    const seen: WeatherCondition[] = [];
    const show = vi.fn((condition: WeatherCondition) => seen.push(condition));
    bindWeather(store, show);
    expect(show).toHaveBeenCalledTimes(1);
    expect(seen[0]).toBe(conditionAt(0));
    store.applyDelta({ step: 1, cars: [], people: [] });
    expect(show).toHaveBeenCalledTimes(1);
    const later = stepOfDate({ year: 1, month: 3, day: 5, hour: 15 });
    store.applyDelta({ step: later, cars: [], people: [] });
    expect(seen.at(-1)).toBe(conditionAt(later));
  });
});
