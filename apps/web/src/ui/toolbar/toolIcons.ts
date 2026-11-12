import type { ToolbarCategory, UnitType } from '@tower-magnate/shared';
import type { ObraIconName } from '../icons/ObraIcon';
import type { ToolId } from './toolbarModel';

const TOOL_ICONS: Readonly<Record<ToolId, ObraIconName>> = {
  inspect: 'lupa',
  bulldozer: 'topa',
  car: 'cab',
  floor: 'structure',
  lobby: 'structure',
  stairs: 'stairs',
  escalator: 'escalator',
  'standard-elevator': 'elevator',
  'service-elevator': 'elevatorService',
  'express-elevator': 'elevatorExpress',
  office: 'offices',
  condo: 'offices',
  'fast-food': 'food',
  restaurant: 'food',
  'single-room': 'bed',
  'double-room': 'bed',
  suite: 'bed',
  housekeeping: 'housekeeping',
  security: 'services',
  'retail-shop': 'commerce',
  cinema: 'film',
  'party-hall': 'party',
  'medical-center': 'medical',
  'parking-ramp': 'parking',
  'parking-space': 'parking',
  'recycling-center': 'recycle',
  'subway-station': 'transport',
  cathedral: 'generic',
} satisfies Record<ToolId, ObraIconName> & Record<UnitType, ObraIconName>;

const CATEGORY_ICONS: Readonly<Record<ToolbarCategory, ObraIconName>> = {
  structure: 'structure',
  transport: 'transport',
  'offices-and-housing': 'offices',
  hotel: 'hotel',
  'commerce-and-entertainment': 'commerce',
  services: 'services',
};

export function toolIcon(tool: ToolId): ObraIconName {
  return TOOL_ICONS[tool];
}

export function categoryIcon(category: ToolbarCategory): ObraIconName {
  return CATEGORY_ICONS[category];
}
