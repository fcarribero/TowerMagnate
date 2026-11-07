import { GAME_TITLE } from '@tower-magnate/shared';

export function pageTitle(towerName?: string): string {
  if (towerName === undefined || towerName.trim() === '') {
    return GAME_TITLE;
  }
  return `${towerName.trim()} - ${GAME_TITLE}`;
}
