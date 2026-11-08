import { UNIT_CATALOG, type StarRating, type ToolbarCategory } from '@tower-magnate/shared';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { RadioGroup, Tooltip } from '../kit';
import { isPlainShortcut } from '../keys';
import { t } from '../strings';
import {
  FIXED_TOOLS,
  TOOLBAR_CATEGORIES,
  categoryButtonLabel,
  categoryOf,
  fixedToolForKey,
  isFixedTool,
  isLocked,
  lobbyHeights,
  priceText,
  sizeText,
  toolButtonLabel,
  toolName,
  toolsInCategory,
  tooltipLines,
  type ToolId,
} from './toolbarModel';
import './toolbar.css';

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
}

export function Toolbar({
  stars,
  currentTool,
  onSelectTool,
  lobbyHeight,
  onLobbyHeightChange,
  lockedLobbyHeight,
  showMainLobbyWarning = false,
  disabled = false,
}: ToolbarProps) {
  const [openCategory, setOpenCategory] = useState<ToolbarCategory>(() =>
    isFixedTool(currentTool) ? 'structure' : categoryOf(currentTool),
  );
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
      if (tool !== null) {
        onSelectTool(tool);
      }
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

  return (
    <nav class="tm-toolbar" aria-label={t('ui.toolbar')}>
      <div class="tm-toolbar__fixed">
        {FIXED_TOOLS.map((tool) => toolButton(tool, 'tm-tool tm-tool--fixed'))}
      </div>
      <div class="tm-toolbar__categories" role="tablist">
        {TOOLBAR_CATEGORIES.map((category) => (
          <Tooltip key={category} text={t(`category.${category}`)}>
            <button
              type="button"
              role="tab"
              class="tm-category"
              aria-selected={category === openCategory}
              aria-label={t(`category.${category}`)}
              onClick={() => setOpenCategory(category)}
            >
              {categoryButtonLabel(category)}
            </button>
          </Tooltip>
        ))}
      </div>
      <div class="tm-toolbar__tools" role="tabpanel" aria-label={t(`category.${openCategory}`)}>
        {toolsInCategory(openCategory).map((tool) => toolButton(tool, 'tm-tool'))}
      </div>
      <ToolInfo tool={hoveredTool ?? currentTool} stars={stars}>
        {(hoveredTool ?? currentTool) === 'lobby' && currentTool === 'lobby' && (
          <LobbyHeightPicker
            height={lockedLobbyHeight ?? lobbyHeight}
            locked={lockedLobbyHeight !== undefined}
            showMainLobbyWarning={showMainLobbyWarning}
            onChange={onLobbyHeightChange}
          />
        )}
      </ToolInfo>
    </nav>
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
  // aria-disabled instead of disabled: a disabled button gets no pointer events, so no tooltip.
  return (
    <Tooltip text={tooltipLines(tool, stars)}>
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
        <span class="tm-tool__label">{toolButtonLabel(tool)}</span>
        {locked && <span class="tm-tool__lock" aria-hidden="true" />}
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
      <span>{sizeText(unit)}</span>
      <span>{priceText(unit)}</span>
      {isLocked(tool, stars) && <span>{t('ui.lockedStars', { n: unit.unlockStars })}</span>}
      {children}
    </div>
  );
}

interface LobbyHeightPickerProps {
  height: number;
  locked: boolean;
  showMainLobbyWarning: boolean;
  onChange: (height: number) => void;
}

function LobbyHeightPicker({
  height,
  locked,
  showMainLobbyWarning,
  onChange,
}: LobbyHeightPickerProps) {
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
      {locked && <span class="tm-toolbar__note">{t('ui.lobbyHeightLocked')}</span>}
      {showMainLobbyWarning && !locked && (
        <span class="tm-toolbar__note">{t('ui.mainLobbyWarning')}</span>
      )}
    </div>
  );
}
