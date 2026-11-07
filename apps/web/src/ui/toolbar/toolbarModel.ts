import {
  UNIT_CATALOG,
  UNIT_IDS,
  type StarRating,
  type ToolbarCategory,
  type UnitDefinition,
  type UnitId,
} from '@tower-magnate/shared';
import { formatMoney } from '../money';
import { t } from '../strings';

export const FIXED_TOOLS = ['inspect', 'bulldozer', 'car'] as const;
export type FixedTool = (typeof FIXED_TOOLS)[number];
export type ToolId = FixedTool | UnitId;

export const DEFAULT_TOOL: ToolId = 'inspect';

export const TOOLBAR_CATEGORIES: readonly ToolbarCategory[] = [
  'structure',
  'transport',
  'offices-and-housing',
  'hotel',
  'commerce-and-entertainment',
  'services',
];

const FIXED_TOOL_SHORTCUTS: Readonly<Record<string, FixedTool>> = {
  l: 'inspect',
  t: 'bulldozer',
  c: 'car',
};

export function isFixedTool(tool: ToolId): tool is FixedTool {
  return (FIXED_TOOLS as readonly string[]).includes(tool);
}

/** Sorted by unlock stars, then by catalog order. */
export function toolsInCategory(category: ToolbarCategory): UnitId[] {
  const units = UNIT_IDS.filter((id) => UNIT_CATALOG[id].category === category);
  return units.sort((a, b) => {
    const byStars = UNIT_CATALOG[a].unlockStars - UNIT_CATALOG[b].unlockStars;
    return byStars !== 0 ? byStars : UNIT_IDS.indexOf(a) - UNIT_IDS.indexOf(b);
  });
}

export function categoryOf(unitId: UnitId): ToolbarCategory {
  return UNIT_CATALOG[unitId].category;
}

export function isLocked(tool: ToolId, stars: StarRating): boolean {
  return !isFixedTool(tool) && UNIT_CATALOG[tool].unlockStars > stars;
}

export function toolName(tool: ToolId): string {
  return isFixedTool(tool) ? t(`tool.${tool}`) : t(`unit.${tool}`);
}

export function sizeText(unit: UnitDefinition): string {
  const { height } = unit;
  if (height.kind === 'shaft') {
    return height.maxFloorsServed === null
      ? t('ui.sizeShaftExpress')
      : t('ui.sizeShaft', { w: unit.width });
  }
  if (unit.limitGroup === 'stairs-and-escalators') {
    return t('ui.sizeTransport');
  }
  if (height.kind === 'choice') {
    return t('ui.size', { w: unit.width, h: joinChoices(height.floors) });
  }
  return t('ui.size', { w: unit.width, h: height.floors });
}

export function priceText(unit: UnitDefinition): string {
  const { cost } = unit;
  switch (cost.kind) {
    case 'per-unit':
      return formatMoney(cost.amount);
    case 'per-cell':
      return t('ui.pricePerCell', { price: formatMoney(cost.amount) });
    case 'shaft':
      return t('ui.priceShaft', {
        shaft: formatMoney(cost.shaftAmount),
        car: formatMoney(cost.perCarAmount),
      });
  }
}

/** Line 1 name and price, line 2 size, line 3 the unlock stars when locked. */
export function tooltipLines(tool: ToolId, stars: StarRating): string[] {
  if (isFixedTool(tool)) {
    return [toolName(tool)];
  }
  const unit = UNIT_CATALOG[tool];
  const lines = [`${toolName(tool)}: ${priceText(unit)}`, sizeText(unit)];
  if (isLocked(tool, stars)) {
    lines.push(t('ui.lockedStars', { n: unit.unlockStars }));
  }
  return lines;
}

export function fixedToolForKey(key: string): FixedTool | null {
  return FIXED_TOOL_SHORTCUTS[key.toLowerCase()] ?? null;
}

function joinChoices(values: readonly number[]): string {
  if (values.length < 2) {
    return values.join('');
  }
  return `${values.slice(0, -1).join(', ')} o ${values[values.length - 1]}`;
}
