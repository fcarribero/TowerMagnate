import type { StarRating } from '@tower-magnate/shared';
import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState, type MutableRef } from 'preact/hooks';
import type { ClientStore } from '../../model/clientStore';
import type { GameState } from '../../model/gameState';
import { useStoreSelect } from '../../model/useStoreSelect';
import { Tooltip } from '../kit';
import { GameMenu, type MenuItem } from '../menu/GameMenu';
import { formatMoney } from '../money';
import { currentRankLabel } from '../stars/starsModel';
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

export type StatusWindowId = 'map' | 'finance' | 'followed' | 'notices' | 'stars';

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
}

const MAX_BADGE_COUNT = 9;

interface WindowButton {
  id: Exclude<StatusWindowId, 'stars'>;
  label: StringKey;
  icon: ObraIconName;
}

const WINDOW_BUTTONS: readonly WindowButton[] = [
  { id: 'map', label: 'ui.windowMap', icon: 'map' },
  { id: 'finance', label: 'ui.windowFinance', icon: 'finance' },
  { id: 'followed', label: 'ui.windowFollowed', icon: 'eye' },
  { id: 'notices', label: 'ui.windowNotices', icon: 'bell' },
];

interface StatusValues {
  minute: number;
  money: number;
  population: number;
  stars: StarRating;
}

function selectStatus(state: GameState): StatusValues {
  return {
    minute: gameMinuteOfStep(state.step),
    money: state.money,
    population: state.population,
    stars: state.stars,
  };
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
}: StatusPanelProps) {
  const status = useStoreSelect(store, selectStatus);
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
          <StatusValuesView status={status} onOpenStars={() => onOpenWindow('stars')} />
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

function unreadLabel(count: number): string {
  return t('ui.unreadNotices', { n: count });
}

function StatusValuesView({
  status,
  onOpenStars,
}: {
  status: StatusValues;
  onOpenStars: () => void;
}) {
  const step = stepOfGameMinute(status.minute);
  const date = formatGameDate(step);
  const money = formatMoney(status.money);
  const moneyClass = money.startsWith('-')
    ? 'status-panel__money is-negative'
    : 'status-panel__money';
  const population = formatPopulation(status.population);
  const labelEnd = population.lastIndexOf(' ');
  return (
    <>
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
      <span class={moneyClass}>{money}</span>
      <span class="status-panel__population">
        <span class="status-panel__label">{population.slice(0, labelEnd)}</span>
        {population.slice(labelEnd)}
      </span>
      <StarsButton stars={status.stars} onClick={onOpenStars} />
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
