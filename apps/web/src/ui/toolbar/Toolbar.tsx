import { UNIT_CATALOG, type StarRating, type ToolbarCategory } from '@tower-magnate/shared';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { ObraIcon } from '../icons/ObraIcon';
import { RadioGroup, Tooltip } from '../kit';
import { isPlainShortcut } from '../keys';
import { t } from '../strings';
import { toolIcon } from './toolIcons';
import {
  FIXED_TOOLS,
  TOOLBAR_CATEGORIES,
  categoryOf,
  fixedToolKey,
  fixedToolForKey,
  isFixedTool,
  isLocked,
  lobbyHeights,
  priceText,
  priceTileText,
  sizeText,
  toolName,
  toolsInCategory,
  tooltipLines,
  type ToolId,
} from './toolbarModel';
import './toolbar.css';

export type ZoomDirection = 1 | -1;

export interface ToolbarProps {
  stars: StarRating;
  currentTool: ToolId;
  onSelectTool: (tool: ToolId) => void;
  lobbyHeight: number;
  onLobbyHeightChange: (height: number) => void;
  /** Height of the lobby already on the hovered level, which the new run must match. */
  lockedLobbyHeight?: number;
  /** The hovered level is level 1 and the tower has no main lobby yet. */
  showMainLobbyWarning?: boolean;
  /** No tool can be picked, for example while the connection is down. */
  disabled?: boolean;
  onZoom: (direction: ZoomDirection) => void;
}

/** The bottom bar: fixed tools, the build menu with category tabs, the detail box and the zoom. */
export function Toolbar({
  stars,
  currentTool,
  onSelectTool,
  lobbyHeight,
  onLobbyHeightChange,
  lockedLobbyHeight,
  showMainLobbyWarning = false,
  disabled = false,
  onZoom,
}: ToolbarProps) {
  const [chosenCategory, setOpenCategory] = useState<ToolbarCategory>(() =>
    isFixedTool(currentTool) ? 'structure' : categoryOf(currentTool),
  );
  // Locked tools are not shown, and neither are categories that have none unlocked.
  const unlockedByCategory = TOOLBAR_CATEGORIES.map((category) => ({
    category,
    tools: toolsInCategory(category).filter((tool) => !isLocked(tool, stars)),
  })).filter((entry) => entry.tools.length > 0);
  const openEntry =
    unlockedByCategory.find((entry) => entry.category === chosenCategory) ?? unlockedByCategory[0];
  const openCategory = openEntry?.category ?? chosenCategory;
  const [hoveredTool, setHoveredTool] = useState<ToolId | null>(null);

  const select = (tool: ToolId): void => {
    if (!disabled && !isLocked(tool, stars)) {
      onSelectTool(tool);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (disabled || event.defaultPrevented || !isPlainShortcut(event)) {
        return;
      }
      const tool = fixedToolForKey(event.key);
      if (tool === null) {
        return;
      }
      if (event.key !== 'Escape') {
        onSelectTool(tool);
        return;
      }
      // Dragging and windows handle Esc first; they mark the event as handled.
      setTimeout(() => {
        if (!event.defaultPrevented) {
          onSelectTool(tool);
        }
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onSelectTool, disabled]);

  const toolButton = (tool: ToolId, className: string) => (
    <ToolButton
      key={tool}
      tool={tool}
      className={className}
      stars={stars}
      disabled={disabled}
      pressed={tool === currentTool}
      onSelect={select}
      onHover={setHoveredTool}
    />
  );

  const lobbyNote =
    lockedLobbyHeight !== undefined
      ? t('ui.lobbyHeightLocked')
      : showMainLobbyWarning
        ? t('ui.mainLobbyWarning')
        : null;

  return (
    <nav class="tm-toolbar" aria-label={t('ui.toolbar')}>
      <div class="tm-toolbar__fixed">
        {FIXED_TOOLS.map((tool) => toolButton(tool, 'tm-tool tm-tool--fixed'))}
      </div>
      <div class="tm-toolbar__catbox">
        <div class="tm-toolbar__categories" role="tablist">
          {unlockedByCategory.map(({ category }) => (
            <button
              key={category}
              type="button"
              role="tab"
              class="tm-category"
              aria-selected={category === openCategory}
              onClick={() => setOpenCategory(category)}
            >
              {t(`category.${category}`)}
            </button>
          ))}
        </div>
        <div class="tm-toolbar__tools" role="tabpanel" aria-label={t(`category.${openCategory}`)}>
          {(openEntry?.tools ?? []).map((tool) => toolButton(tool, 'tm-tool'))}
        </div>
      </div>
      <ToolInfo tool={hoveredTool ?? currentTool} stars={stars}>
        {(hoveredTool ?? currentTool) === 'lobby' && currentTool === 'lobby' && (
          <LobbyHeightPicker
            height={lockedLobbyHeight ?? lobbyHeight}
            locked={lockedLobbyHeight !== undefined}
            onChange={onLobbyHeightChange}
          />
        )}
      </ToolInfo>
      <div class="tm-toolbar__zoom">
        <ZoomButton direction={1} onZoom={onZoom} />
        <ZoomButton direction={-1} onZoom={onZoom} />
      </div>
      {currentTool === 'lobby' && lobbyNote !== null && <p class="tm-toolbar__note">{lobbyNote}</p>}
    </nav>
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
      class="tm-toolbar__zoom-button"
      aria-label={label}
      title={label}
      onClick={() => onZoom(direction)}
    >
      {direction === 1 ? '+' : '−'}
    </button>
  );
}

interface ToolButtonProps {
  tool: ToolId;
  className: string;
  stars: StarRating;
  disabled: boolean;
  pressed: boolean;
  onSelect: (tool: ToolId) => void;
  onHover: (tool: ToolId | null) => void;
}

function ToolButton({
  tool,
  className,
  stars,
  disabled,
  pressed,
  onSelect,
  onHover,
}: ToolButtonProps) {
  const locked = isLocked(tool, stars);
  const classes = [
    className,
    pressed && 'is-pressed',
    locked && 'is-locked',
    disabled && 'is-disabled',
  ].filter(Boolean);
  const fixed = isFixedTool(tool);
  // aria-disabled instead of disabled: a disabled button gets no pointer events, so no tooltip.
  return (
    <Tooltip text={tooltipLines(tool, stars)} alertLastLine={locked}>
      <button
        type="button"
        class={classes.join(' ')}
        aria-label={toolName(tool)}
        aria-pressed={pressed}
        aria-disabled={locked || disabled}
        data-tool={tool}
        onClick={() => onSelect(tool)}
        onPointerEnter={() => onHover(tool)}
        onPointerLeave={() => onHover(null)}
      >
        <ObraIcon name={toolIcon(tool)} class="tm-tool__icon" />
        {fixed ? (
          <kbd class="tm-tool__key">{fixedToolKey(tool)}</kbd>
        ) : (
          <>
            <span class="tm-tool__label">{toolName(tool)}</span>
            <span class="tm-tool__price">{priceTileText(UNIT_CATALOG[tool])}</span>
          </>
        )}
        {locked && !fixed && (
          <span class="tm-tool__lock">{'★'.repeat(UNIT_CATALOG[tool].unlockStars)}</span>
        )}
      </button>
    </Tooltip>
  );
}

interface ToolInfoProps {
  tool: ToolId;
  stars: StarRating;
  children?: ComponentChildren;
}

function ToolInfo({ tool, stars, children }: ToolInfoProps) {
  if (isFixedTool(tool)) {
    return (
      <div class="tm-toolbar__info" aria-live="polite">
        <span class="tm-toolbar__info-name">{toolName(tool)}</span>
      </div>
    );
  }
  const unit = UNIT_CATALOG[tool];
  return (
    <div class="tm-toolbar__info" aria-live="polite">
      <span class="tm-toolbar__info-name">{toolName(tool)}</span>
      <div class="tm-toolbar__info-row">
        <span>{t('ui.detailSize')}</span>
        <b class="tm-toolbar__info-size">{sizeText(unit)}</b>
      </div>
      <div class="tm-toolbar__info-row">
        <span>{t('ui.detailPrice')}</span>
        <b class="tm-toolbar__info-price">{priceText(unit)}</b>
      </div>
      {isLocked(tool, stars) && (
        <div class="tm-toolbar__info-row is-alert">
          <span>{t('ui.lockedStars', { n: unit.unlockStars })}</span>
        </div>
      )}
      {children}
    </div>
  );
}

interface LobbyHeightPickerProps {
  height: number;
  locked: boolean;
  onChange: (height: number) => void;
}

function LobbyHeightPicker({ height, locked, onChange }: LobbyHeightPickerProps) {
  const options = lobbyHeights().map((floors) => ({
    value: String(floors),
    label: String(floors),
  }));
  return (
    <div class="tm-toolbar__lobby-height">
      <RadioGroup
        name="lobby-height"
        label={t('ui.lobbyHeight')}
        options={options}
        value={String(height)}
        disabled={locked}
        onChange={(value) => onChange(Number(value))}
      />
    </div>
  );
}
