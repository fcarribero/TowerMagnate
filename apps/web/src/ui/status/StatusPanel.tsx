import type { WeatherCondition } from '@tower-magnate/engine/weather';
import type { StarRating } from '@tower-magnate/shared';
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState, type MutableRef } from 'preact/hooks';
import type { ClientStore } from '../../model/clientStore';
import type { GameState } from '../../model/gameState';
import { drawnStep, progressSince } from '../../model/interpolation';
import { useStoreSelect } from '../../model/useStoreSelect';
import { Tooltip } from '../kit';
import { GameMenu, type MenuItem } from '../menu/GameMenu';
import { formatMoney } from '../money';
import { currentRankLabel } from '../stars/starsModel';
import {
  conditionLabel,
  currentWeather,
  formatTemperature,
  weatherIcon,
} from '../weather/weatherModel';
import { t, type StringKey } from '../strings';
import { ObraIcon, type ObraIconName } from '../icons/ObraIcon';
import {
  STAR_SLOTS,
  filledStars,
  formatGameDate,
  formatGameTime,
  formatPopulation,
  gameMinuteOfStep,
  isTowerRank,
  stepOfGameMinute,
} from './statusFormat';
import { statusFits } from './statusLayout';
import './statusPanel.css';

export type StatusWindowId = 'map' | 'finance' | 'followed' | 'notices' | 'stars' | 'weather';

export interface StatusPanelProps {
  store: ClientStore;
  /** The overlay selector goes here. */
  overlaySlot?: ComponentChildren;
  onOpenWindow: (id: StatusWindowId) => void;
  onLogout: () => void;
  /** Menu entries shown after the ones the bar could not fit. */
  extraMenuItems?: readonly MenuItem[];
  /** Windows that are open now; their buttons are drawn pressed. */
  openWindows?: ReadonlySet<StatusWindowId>;
  /** Notices that arrived while Avisos was closed. */
  unreadNotices?: number;
  /** Developer setting: shows an infinity sign instead of the money. */
  infiniteMoney?: boolean;
  /** Shown right under the clock. */
  belowClock?: ComponentChildren;
  /** Saves have kept failing for a while; shows a warning on the bar. */
  saveFailing?: boolean;
}

const MAX_BADGE_COUNT = 9;

interface WindowButton {
  id: Exclude<StatusWindowId, 'stars' | 'weather' | 'finance'>;
  label: StringKey;
  icon: ObraIconName;
}

const WINDOW_BUTTONS: readonly WindowButton[] = [
  { id: 'map', label: 'ui.windowMap', icon: 'map' },
  { id: 'followed', label: 'ui.windowFollowed', icon: 'eye' },
  { id: 'notices', label: 'ui.windowNotices', icon: 'bell' },
];

interface StatusValues {
  minute: number;
  money: number;
  population: number;
  stars: StarRating;
  condition: WeatherCondition;
  isNight: boolean;
  temperature: number;
}

interface WeatherValues {
  condition: WeatherCondition;
  isNight: boolean;
  temperature: number;
}

function selectStatus(state: GameState): StatusValues {
  return {
    minute: gameMinuteOfStep(state.step),
    money: state.money,
    population: state.population,
    stars: state.stars,
    ...selectWeather(state.step),
  };
}

/** Spread into the status values, which are compared field by field. */
function selectWeather(step: number): WeatherValues {
  const { condition, isNight, temperature } = currentWeather(step);
  return { condition, isNight, temperature };
}

const NO_WINDOWS: ReadonlySet<StatusWindowId> = new Set();

export function StatusPanel({
  store,
  overlaySlot,
  onOpenWindow,
  onLogout,
  extraMenuItems = [],
  openWindows = NO_WINDOWS,
  unreadNotices = 0,
  infiniteMoney = false,
  belowClock,
  saveFailing = false,
}: StatusPanelProps) {
  const latestStatus = useStoreSelect(store, selectStatus);
  const drawnMinute = useDrawnMinute(store);
  const status =
    latestStatus === null || drawnMinute === null
      ? latestStatus
      : { ...latestStatus, minute: Math.min(drawnMinute, latestStatus.minute) };
  const panelRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const windowsRef = useRef<HTMLDivElement>(null);
  const showWindows = useWindowsFit(panelRef, rowRef, windowsRef);

  const menuItems: MenuItem[] = [];
  if (!showWindows) {
    for (const button of WINDOW_BUTTONS) {
      menuItems.push({
        id: button.id,
        label: t(button.label),
        onSelect: () => onOpenWindow(button.id),
      });
    }
  }
  menuItems.push(...extraMenuItems);

  return (
    <div class="status-panel" role="toolbar" aria-label={t('ui.statusBar')} ref={panelRef}>
      <div class="status-panel__row" ref={rowRef}>
        <GameMenu items={menuItems} onLogout={onLogout} />
        {status !== null && (
          <StatusValuesView
            status={status}
            infiniteMoney={infiniteMoney}
            belowClock={belowClock}
            onOpenStars={() => onOpenWindow('stars')}
            onOpenWeather={() => onOpenWindow('weather')}
            weatherOpen={openWindows.has('weather')}
            onOpenFinance={() => onOpenWindow('finance')}
            financeOpen={openWindows.has('finance')}
          />
        )}
        {saveFailing && (
          <span class="status-panel__save-failing" role="alert">
            {t('game.saveFailing')}
          </span>
        )}
        <span class="status-panel__spacer" />
        {overlaySlot !== undefined && <div class="status-panel__overlay">{overlaySlot}</div>}
        {showWindows && (
          <div class="status-panel__group" ref={windowsRef}>
            {WINDOW_BUTTONS.map((button) => (
              <Tooltip key={button.id} text={t(button.label)}>
                <button
                  type="button"
                  class={
                    openWindows.has(button.id)
                      ? 'status-panel__window is-open'
                      : 'status-panel__window'
                  }
                  aria-label={t(button.label)}
                  aria-pressed={openWindows.has(button.id)}
                  onClick={() => onOpenWindow(button.id)}
                >
                  <ObraIcon name={button.icon} class="status-panel__icon" />
                  {button.id === 'notices' && unreadNotices > 0 && (
                    <span class="status-panel__badge" aria-label={unreadLabel(unreadNotices)}>
                      {unreadNotices > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : unreadNotices}
                    </span>
                  )}
                </button>
              </Tooltip>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The game minute the tower is drawn at, which runs one delta behind the latest state and moves
 * on every frame, so the clock goes through each minute even when a delta covers several.
 */
function useDrawnMinute(store: ClientStore): number | null {
  const [minute, setMinute] = useState<number | null>(null);
  useEffect(() => {
    let frame = 0;
    const update = (): void => {
      const frames = store.current;
      if (frames !== null) {
        const progress = progressSince(frames.latestArrivedAtMs, performance.now());
        const next = gameMinuteOfStep(drawnStep(frames, progress));
        setMinute((was) => (was === next ? was : next));
      }
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [store]);
  return minute;
}

function unreadLabel(count: number): string {
  return t('ui.unreadNotices', { n: count });
}

function StatusValuesView({
  status,
  infiniteMoney,
  belowClock,
  onOpenStars,
  onOpenWeather,
  weatherOpen,
  onOpenFinance,
  financeOpen,
}: {
  status: StatusValues;
  infiniteMoney: boolean;
  belowClock: ComponentChildren;
  onOpenStars: () => void;
  onOpenWeather: () => void;
  weatherOpen: boolean;
  onOpenFinance: () => void;
  financeOpen: boolean;
}) {
  const step = stepOfGameMinute(status.minute);
  const date = formatGameDate(step);
  const money = infiniteMoney ? '∞' : formatMoney(status.money);
  const moneyClass = [
    'status-panel__money',
    money.startsWith('-') ? 'is-negative' : '',
    financeOpen ? 'is-open' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const population = formatPopulation(status.population);
  const labelEnd = population.lastIndexOf(' ');
  return (
    <>
      <div class="status-panel__clock">
        <span class="status-panel__date">
          <span class="status-panel__time">{formatGameTime(step)}</span>
          <span class="status-panel__day">
            <span
              class={date.isWeekend ? 'status-panel__weekday is-weekend' : 'status-panel__weekday'}
            >
              {date.weekday}
            </span>
            {date.rest}
          </span>
        </span>
        {belowClock}
      </div>
      <button
        type="button"
        class={moneyClass}
        aria-label={t('ui.windowFinance')}
        aria-pressed={financeOpen}
        title={t('ui.windowFinance')}
        onClick={onOpenFinance}
      >
        {money}
      </button>
      <span class="status-panel__population">
        <span class="status-panel__label">{population.slice(0, labelEnd)}</span>
        {population.slice(labelEnd)}
      </span>
      <StarsButton stars={status.stars} onClick={onOpenStars} />
      <WeatherButton
        weather={{
          condition: status.condition,
          isNight: status.isNight,
          temperature: status.temperature,
        }}
        open={weatherOpen}
        onClick={onOpenWeather}
      />
    </>
  );
}

const STAR_POINTS = '12,2 15,9 22,9.5 16.5,14.5 18.5,22 12,18 5.5,22 7.5,14.5 2,9.5 9,9';

function StarsButton({ stars, onClick }: { stars: StarRating; onClick: () => void }) {
  const filled = filledStars(stars);
  const tower = isTowerRank(stars);
  const label = t(currentRankLabel(stars), { n: stars });
  return (
    <button
      type="button"
      class="status-panel__stars"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {Array.from({ length: STAR_SLOTS }, (_, index) => (
        <svg
          key={index}
          class={index < filled ? 'status-panel__star is-filled' : 'status-panel__star'}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <polygon points={STAR_POINTS} />
        </svg>
      ))}
      {tower && <span class="status-panel__tower">{t('ui.towerRank')}</span>}
    </button>
  );
}

function WeatherButton({
  weather,
  open,
  onClick,
}: {
  weather: WeatherValues;
  open: boolean;
  onClick: () => void;
}) {
  const label = t('ui.weather', {
    condition: t(conditionLabel(weather.condition, weather.isNight)),
    temperature: weather.temperature,
  });
  return (
    <button
      type="button"
      class={open ? 'status-panel__weather is-open' : 'status-panel__weather'}
      aria-label={label}
      aria-pressed={open}
      title={label}
      onClick={onClick}
    >
      <ObraIcon name={weatherIcon(weather.condition, weather.isNight)} class="status-panel__icon" />
      <span class="status-panel__temperature">{formatTemperature(weather.temperature)}</span>
    </button>
  );
}

/** Measures the bar and says whether the window buttons fit; if not, they move into the menu. */
function useWindowsFit(
  panelRef: MutableRef<HTMLDivElement | null>,
  rowRef: MutableRef<HTMLDivElement | null>,
  windowsRef: MutableRef<HTMLDivElement | null>,
): boolean {
  const [fits, setFits] = useState(true);
  const groupWidth = useRef(0);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const row = rowRef.current;
    if (panel === null || row === null || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const measure = (): void => {
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const windows = windowsRef.current;
      if (windows !== null) {
        groupWidth.current = windows.offsetWidth + gap;
      }
      const shown = windows === null ? 0 : groupWidth.current;
      const fixed = minRowWidth(row) - shown;
      setFits(statusFits(contentWidth(panel), { fixed, windows: groupWidth.current }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    observer.observe(row);
    return () => observer.disconnect();
  }, [panelRef, rowRef, windowsRef]);

  return fits;
}

/** The width of the items of the row, with the spacer left out. */
function minRowWidth(row: HTMLElement): number {
  const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
  let width = 0;
  let count = 0;
  for (const child of Array.from(row.children) as HTMLElement[]) {
    if (child.classList.contains('status-panel__spacer')) {
      continue;
    }
    width += child.offsetWidth;
    count += 1;
  }
  return width + gap * Math.max(count - 1, 0);
}

function contentWidth(element: HTMLElement): number {
  const style = getComputedStyle(element);
  return element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}
