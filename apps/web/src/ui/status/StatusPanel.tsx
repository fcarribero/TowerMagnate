import type { StarRating } from '@tower-magnate/shared';
import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState, type MutableRef } from 'preact/hooks';
import type { ClientStore } from '../../model/clientStore';
import type { GameState } from '../../model/gameState';
import { useStoreSelect } from '../../model/useStoreSelect';
import { Tooltip } from '../kit';
import { GameMenu, type MenuItem } from '../menu/GameMenu';
import { formatMoney } from '../money';
import { t, type StringKey } from '../strings';
import {
  FINANCE_ICON,
  FOLLOWED_ICON,
  MAP_ICON,
  NOTICES_ICON,
  PixelIcon,
  STAR_FILLED,
  STAR_OUTLINE,
  type PixelPattern,
} from './pixelIcons';
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
import { statusCollapse, type StatusCollapse } from './statusLayout';
import './statusPanel.css';

export type StatusWindowId = 'map' | 'finance' | 'followed' | 'notices' | 'stars';
export type ZoomDirection = 1 | -1;

export interface StatusPanelProps {
  store: ClientStore;
  offline?: boolean;
  /** The overlay selector goes here. */
  overlaySlot?: ComponentChildren;
  onOpenWindow: (id: StatusWindowId) => void;
  onZoom: (direction: ZoomDirection) => void;
  onLogout: () => void;
  /** Menu entries shown after the ones the bar could not fit. */
  extraMenuItems?: readonly MenuItem[];
}

interface WindowButton {
  id: Exclude<StatusWindowId, 'stars'>;
  label: StringKey;
  icon: PixelPattern;
}

const WINDOW_BUTTONS: readonly WindowButton[] = [
  { id: 'map', label: 'ui.windowMap', icon: MAP_ICON },
  { id: 'finance', label: 'ui.windowFinance', icon: FINANCE_ICON },
  { id: 'followed', label: 'ui.windowFollowed', icon: FOLLOWED_ICON },
  { id: 'notices', label: 'ui.windowNotices', icon: NOTICES_ICON },
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

export function StatusPanel({
  store,
  offline = false,
  overlaySlot,
  onOpenWindow,
  onZoom,
  onLogout,
  extraMenuItems = [],
}: StatusPanelProps) {
  const status = useStoreSelect(store, selectStatus);
  const panelRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const windowsRef = useRef<HTMLDivElement>(null);
  const collapse = useStatusCollapse(panelRef, rowRef, zoomRef, windowsRef);
  const showZoom = collapse !== 'windowsAndZoom';
  const showWindows = collapse === 'none';

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
  if (!showZoom) {
    menuItems.push({ id: 'zoomOut', label: t('ui.zoomOut'), onSelect: () => onZoom(-1) });
    menuItems.push({ id: 'zoomIn', label: t('ui.zoomIn'), onSelect: () => onZoom(1) });
  }

  menuItems.push(...extraMenuItems);

  return (
    <div class="status-panel" role="toolbar" aria-label={t('ui.statusBar')} ref={panelRef}>
      <div class="status-panel__row" ref={rowRef}>
        <GameMenu items={menuItems} onLogout={onLogout} />
        {status !== null && (
          <StatusValuesView status={status} onOpenStars={() => onOpenWindow('stars')} />
        )}
        {offline && <span class="status-panel__offline">{t('ui.serverOffline')}</span>}
        {overlaySlot !== undefined && <div class="status-panel__overlay">{overlaySlot}</div>}
        {showZoom && (
          <div class="status-panel__group" ref={zoomRef}>
            <ZoomButton direction={-1} onZoom={onZoom} />
            <ZoomButton direction={1} onZoom={onZoom} />
          </div>
        )}
        {showWindows && (
          <div class="status-panel__group" ref={windowsRef}>
            {WINDOW_BUTTONS.map((button) => (
              <Tooltip key={button.id} text={t(button.label)}>
                <button
                  type="button"
                  class="status-panel__window"
                  aria-label={t(button.label)}
                  onClick={() => onOpenWindow(button.id)}
                >
                  <PixelIcon pattern={button.icon} class="status-panel__icon" />
                </button>
              </Tooltip>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ZoomButton({
  direction,
  onZoom,
}: {
  direction: ZoomDirection;
  onZoom: (direction: ZoomDirection) => void;
}) {
  const label = direction === 1 ? t('ui.zoomIn') : t('ui.zoomOut');
  return (
    <button
      type="button"
      class="status-panel__zoom"
      aria-label={label}
      title={label}
      onClick={() => onZoom(direction)}
    >
      {direction === 1 ? '+' : '-'}
    </button>
  );
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
  return (
    <>
      <span class={date.isWeekend ? 'status-panel__date is-weekend' : 'status-panel__date'}>
        {date.text}
      </span>
      <span class="status-panel__time">{formatGameTime(step)}</span>
      <span class={moneyClass}>{money}</span>
      <span class="status-panel__population">{formatPopulation(status.population)}</span>
      <StarsButton stars={status.stars} onClick={onOpenStars} />
    </>
  );
}

function StarsButton({ stars, onClick }: { stars: StarRating; onClick: () => void }) {
  const filled = filledStars(stars);
  const tower = isTowerRank(stars);
  const label = tower ? t('window.stars.currentTower') : t('window.stars.current', { n: stars });
  return (
    <button
      type="button"
      class="status-panel__stars"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {Array.from({ length: STAR_SLOTS }, (_, index) => {
        const isFilled = index < filled;
        return (
          <PixelIcon
            key={index}
            pattern={isFilled ? STAR_FILLED : STAR_OUTLINE}
            class={isFilled ? 'status-panel__star is-filled' : 'status-panel__star'}
          />
        );
      })}
      {tower && <span class="status-panel__tower">{t('ui.towerRank')}</span>}
    </button>
  );
}

/** Measures the bar and moves groups into the menu when they do not fit. */
function useStatusCollapse(
  panelRef: MutableRef<HTMLDivElement | null>,
  rowRef: MutableRef<HTMLDivElement | null>,
  zoomRef: MutableRef<HTMLDivElement | null>,
  windowsRef: MutableRef<HTMLDivElement | null>,
): StatusCollapse {
  const [collapse, setCollapse] = useState<StatusCollapse>('none');
  const groupWidths = useRef({ zoom: 0, windows: 0 });

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const row = rowRef.current;
    if (panel === null || row === null || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const measure = (): void => {
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const widths = groupWidths.current;
      const zoom = zoomRef.current;
      const windows = windowsRef.current;
      if (zoom !== null) {
        widths.zoom = zoom.offsetWidth + gap;
      }
      if (windows !== null) {
        widths.windows = windows.offsetWidth + gap;
      }
      const shownGroups =
        (zoom === null ? 0 : widths.zoom) + (windows === null ? 0 : widths.windows);
      const fixed = row.offsetWidth - shownGroups;
      setCollapse(statusCollapse(contentWidth(panel), { fixed, ...widths }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    observer.observe(row);
    return () => observer.disconnect();
  }, [panelRef, rowRef, zoomRef, windowsRef]);

  return collapse;
}

function contentWidth(element: HTMLElement): number {
  const style = getComputedStyle(element);
  return element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}
