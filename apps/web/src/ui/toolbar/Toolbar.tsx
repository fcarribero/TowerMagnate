import { UNIT_CATALOG, type StarRating, type ToolbarCategory } from '@tower-magnate/shared';
import { useEffect, useState } from 'preact/hooks';
import { Tooltip } from '../kit';
import { isPlainShortcut } from '../keys';
import { t } from '../strings';
import {
  FIXED_TOOLS,
  TOOLBAR_CATEGORIES,
  categoryOf,
  fixedToolForKey,
  isFixedTool,
  isLocked,
  priceText,
  sizeText,
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
}

export function Toolbar({ stars, currentTool, onSelectTool }: ToolbarProps) {
  const [openCategory, setOpenCategory] = useState<ToolbarCategory>(() =>
    isFixedTool(currentTool) ? 'structure' : categoryOf(currentTool),
  );
  const [hoveredTool, setHoveredTool] = useState<ToolId | null>(null);

  const select = (tool: ToolId): void => {
    if (!isLocked(tool, stars)) {
      onSelectTool(tool);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const tool = isPlainShortcut(event) ? fixedToolForKey(event.key) : null;
      if (tool !== null) {
        onSelectTool(tool);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onSelectTool]);

  const toolButton = (tool: ToolId, className: string) => (
    <ToolButton
      key={tool}
      tool={tool}
      className={className}
      stars={stars}
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
              {t(`category.${category}`)}
            </button>
          </Tooltip>
        ))}
      </div>
      <div class="tm-toolbar__tools" role="tabpanel" aria-label={t(`category.${openCategory}`)}>
        {toolsInCategory(openCategory).map((tool) => toolButton(tool, 'tm-tool'))}
      </div>
      <ToolInfo tool={hoveredTool ?? currentTool} stars={stars} />
    </nav>
  );
}

interface ToolButtonProps {
  tool: ToolId;
  className: string;
  stars: StarRating;
  pressed: boolean;
  onSelect: (tool: ToolId) => void;
  onHover: (tool: ToolId | null) => void;
}

function ToolButton({ tool, className, stars, pressed, onSelect, onHover }: ToolButtonProps) {
  const locked = isLocked(tool, stars);
  const classes = [className, pressed && 'is-pressed', locked && 'is-locked'].filter(Boolean);
  // aria-disabled instead of disabled: a disabled button gets no pointer events, so no tooltip.
  return (
    <Tooltip text={tooltipLines(tool, stars)}>
      <button
        type="button"
        class={classes.join(' ')}
        aria-label={toolName(tool)}
        aria-pressed={pressed}
        aria-disabled={locked}
        data-tool={tool}
        onClick={() => onSelect(tool)}
        onPointerEnter={() => onHover(tool)}
        onPointerLeave={() => onHover(null)}
      >
        <span class="tm-tool__label">{toolName(tool)}</span>
        {locked && <span class="tm-tool__lock" aria-hidden="true" />}
      </button>
    </Tooltip>
  );
}

function ToolInfo({ tool, stars }: { tool: ToolId; stars: StarRating }) {
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
    </div>
  );
}
