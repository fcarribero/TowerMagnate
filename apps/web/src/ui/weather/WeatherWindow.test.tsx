import { STEPS_PER_HOUR, stepOfDate } from '@tower-magnate/engine/calendar';
import { forecast, weatherAt } from '@tower-magnate/engine/weather';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientStore } from '../../model/clientStore';
import { snapshot } from '../../testing/protocolFixtures';
import { useFakeLayoutSizes } from '../../testing/fakeLayout';
import { WindowLayer } from '../kit/WindowLayer';
import { StatusPanel } from '../status/StatusPanel';
import { WeatherWindow } from './WeatherWindow';
import {
  conditionLabel,
  formatTemperature,
  forecastRows,
  weatherIcon,
  wholeDegrees,
} from './weatherModel';

useFakeLayoutSizes({ clientWidth: 800, clientHeight: 600, offsetWidth: 240, offsetHeight: 200 });

afterEach(cleanup);

const NOON = stepOfDate({ year: 1, month: 7, day: 10, hour: 12 });
const NIGHT = stepOfDate({ year: 1, month: 7, day: 10, hour: 2 });

function storeAt(step: number): ClientStore {
  const store = new ClientStore({ requestResync: () => undefined, now: () => 0 });
  store.applySnapshot({ ...snapshot, step });
  return store;
}

describe('weather model', () => {
  it('writes whole degrees without a negative zero', () => {
    expect(formatTemperature(18.4)).toBe('18°');
    expect(formatTemperature(-0.2)).toBe('0°');
    expect(wholeDegrees(-1.6)).toBe(-2);
  });

  it('picks the moon only for a clear night', () => {
    expect(weatherIcon('sunny')).toBe('weatherSun');
    expect(weatherIcon('sunny', true)).toBe('weatherMoon');
    expect(weatherIcon('cloudy', true)).toBe('weatherCloud');
    expect(weatherIcon('rain', true)).toBe('weatherRain');
    expect(conditionLabel('sunny', true)).toBe('window.weather.condition.clear');
    expect(conditionLabel('sunny')).toBe('window.weather.condition.sunny');
  });

  it('lists the 7 days after today', () => {
    const rows = forecastRows(NOON);
    const today = Math.floor(NOON / (STEPS_PER_HOUR * 24));
    expect(rows.map((row) => row.dayNumber)).toEqual(
      Array.from({ length: 7 }, (_, i) => today + 1 + i),
    );
    expect(rows[0]?.max).toBe(wholeDegrees(forecast(today + 1, 1)[0]?.maxTemperature ?? NaN));
  });
});

describe('weather button in the top bar', () => {
  function renderPanel(step: number, onOpenWindow = vi.fn()) {
    render(<StatusPanel store={storeAt(step)} onOpenWindow={onOpenWindow} onLogout={vi.fn()} />);
    return onOpenWindow;
  }

  it('sits right after the stars and shows the temperature', () => {
    renderPanel(NOON);
    const button = document.querySelector('.status-panel__weather');
    expect(button).not.toBeNull();
    expect(document.querySelector('.status-panel__stars')?.nextElementSibling).toBe(button);
    expect(button?.querySelector('.status-panel__temperature')?.textContent).toBe(
      `${wholeDegrees(weatherAt(NOON).temperature)}°`,
    );
    expect(button?.querySelector('svg')).not.toBeNull();
  });

  it('opens the forecast window when clicked', () => {
    const onOpenWindow = renderPanel(NOON);
    fireEvent.click(document.querySelector('.status-panel__weather') as Element);
    expect(onOpenWindow).toHaveBeenCalledWith('weather');
  });

  it('names the condition for assistive tools', () => {
    renderPanel(NOON);
    const label = document.querySelector('.status-panel__weather')?.getAttribute('aria-label');
    expect(label).toMatch(/^Clima: (Soleado|Nublado|Lluvia), -?\d+ grados$/);
  });
});

describe('WeatherWindow', () => {
  function renderWindow(step: number) {
    const onClose = vi.fn();
    render(
      <WindowLayer>
        <WeatherWindow store={storeAt(step)} onClose={onClose} />
      </WindowLayer>,
    );
    return onClose;
  }

  it('shows the title, the season and today', () => {
    renderWindow(NOON);
    expect(screen.getByText('Pronóstico')).toBeTruthy();
    expect(screen.getByText('Estación: Invierno')).toBeTruthy();
    expect(document.querySelector('.weather-window__today')?.textContent).toMatch(/^Hoy: /);
  });

  it('shows a clear night as Despejado', () => {
    renderWindow(NIGHT);
    const reading = weatherAt(NIGHT);
    if (reading.condition === 'sunny') {
      expect(document.querySelector('.weather-window__today')?.textContent).toContain('Despejado');
    }
    expect(reading.isNight).toBe(true);
  });

  it('lists seven days with weekday, icon and min and max', () => {
    renderWindow(NOON);
    const days = document.querySelectorAll('.weather-window__day');
    expect(days).toHaveLength(7);
    const rows = forecastRows(NOON);
    days.forEach((day, index) => {
      const row = rows[index];
      expect(day.querySelector('.weather-window__min')?.textContent).toBe(`${row?.min}°`);
      expect(day.querySelector('.weather-window__max')?.textContent).toBe(`${row?.max}°`);
      expect(day.querySelector('svg')).not.toBeNull();
    });
    // 10 July of year 1 is a Monday plus 9 days, so tomorrow is a Wednesday.
    expect(days[0]?.querySelector('.weather-window__weekday')?.textContent).toBe('Miércoles');
  });

  it('closes from its close button', () => {
    const onClose = renderWindow(NOON);
    fireEvent.click(screen.getByRole('button', { name: /cerrar/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
