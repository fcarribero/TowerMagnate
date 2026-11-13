import { STEPS_PER_HOUR } from '@tower-magnate/engine/calendar';
import { useEffect } from 'preact/hooks';
import type { ClientStore } from '../../model/clientStore';
import type { GameState } from '../../model/gameState';
import { useStoreSelect } from '../../model/useStoreSelect';
import { ObraIcon } from '../icons/ObraIcon';
import { Window } from '../kit/Window';
import { useWindowManager } from '../kit/WindowLayer';
import { t } from '../strings';
import {
  conditionLabel,
  currentWeather,
  forecastRows,
  formatTemperature,
  seasonLabel,
  weatherIcon,
} from './weatherModel';
import './weatherWindow.css';

export const WEATHER_WINDOW_ID = 'weather';

/** Rounded down to the hour: the forecast changes at midnight and the current line a few times a day. */
const selectStep = (state: GameState): { step: number } => ({
  step: Math.floor(state.step / STEPS_PER_HOUR) * STEPS_PER_HOUR,
});

export interface WeatherWindowProps {
  store: ClientStore;
  onClose: () => void;
}

export function WeatherWindow({ store, onClose }: WeatherWindowProps) {
  const manager = useWindowManager();
  const values = useStoreSelect(store, selectStep);
  useEffect(() => {
    manager.open({ id: WEATHER_WINDOW_ID, corner: 'topLeft' });
    return () => manager.close(WEATHER_WINDOW_ID);
  }, []);
  if (values === null) {
    return null;
  }
  const now = currentWeather(values.step);
  const rows = forecastRows(values.step);
  return (
    <Window id={WEATHER_WINDOW_ID} title={t('window.weather.title')} width={240} onClose={onClose}>
      <div class="weather-window">
        <p class="weather-window__today">
          <ObraIcon name={weatherIcon(now.condition, now.isNight)} class="weather-window__icon" />
          {t('window.weather.today', {
            condition: t(conditionLabel(now.condition, now.isNight)),
            temperature: formatTemperature(now.temperature),
          })}
        </p>
        <p class="weather-window__season">
          {t('window.weather.seasonLine', { season: t(seasonLabel(now.season)) })}
        </p>
        <ul class="weather-window__days">
          {rows.map((row) => (
            <li key={row.dayNumber} class="weather-window__day">
              <span class="weather-window__weekday">{t(row.weekdayKey)}</span>
              <span class="weather-window__condition" title={t(conditionLabel(row.condition))}>
                <ObraIcon name={weatherIcon(row.condition)} class="weather-window__icon" />
              </span>
              <span class="weather-window__range">
                <span class="weather-window__min">{formatTemperature(row.min)}</span>
                <span class="weather-window__max">{formatTemperature(row.max)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Window>
  );
}
