import {
  UNIT_CATALOG,
  type ClientEvent,
  type Snapshot,
  type StarRating,
} from '@tower-magnate/shared';
import { t, type StringKey } from '../strings';

export interface InfoMessage {
  title: string;
  body: string;
}

/** Ratings that open the "new stars" dialog; 6 comes from the wedding and has its own. */
const STAR_DIALOG_RATINGS: ReadonlySet<StarRating> = new Set([2, 3, 4, 5]);

/** Names of the units, not transports, that a rating unlocks, in catalog order. */
export function unitsUnlockedAt(stars: StarRating): string[] {
  return Object.values(UNIT_CATALOG)
    .filter((unit) => unit.unlockStars === stars && unit.category !== 'transport')
    .map((unit) => t(`unit.${unit.type}` as StringKey));
}

function starsUpMessage(stars: StarRating): InfoMessage {
  return {
    title: t('dialog.starsUp.title', { n: stars }),
    body: t('dialog.starsUp.body', { n: stars, units: unitsUnlockedAt(stars).join(', ') }),
  };
}

function towerRankMessage(): InfoMessage {
  return { title: t('dialog.towerRank.title'), body: t('dialog.towerRank.body') };
}

export function welcomeMessage(): InfoMessage {
  return { title: t('dialog.welcome.title'), body: t('dialog.welcome.body') };
}

/** The information dialogs a batch of events opens, in arrival order. */
export function messagesForEvents(events: readonly ClientEvent[]): InfoMessage[] {
  const messages: InfoMessage[] = [];
  for (const event of events) {
    if (event.type === 'starsChanged' && STAR_DIALOG_RATINGS.has(event.stars)) {
      messages.push(starsUpMessage(event.stars));
    } else if (event.type === 'weddingCompleted') {
      messages.push(towerRankMessage());
    }
  }
  return messages;
}

/** A tower that has not run a single step and has nothing built yet. */
export function isNewTower(snapshot: Pick<Snapshot, 'step' | 'units'>): boolean {
  return snapshot.step === 0 && snapshot.units.length === 0;
}
