import { useEffect } from 'preact/hooks';
import type { FollowedView } from '@tower-magnate/shared';
import type { GameState } from '../../model/gameState';
import { useStoreSelect } from '../../model/useStoreSelect';
import type { GameConnection } from '../../net/gameConnection';
import { Window, useWindowManager } from '../kit';
import { t } from '../strings';
import { kindName, stressClass } from './personWindowModel';
import './person.css';

export const FOLLOWED_WINDOW_ID = 'followed';

const selectFollowed = (state: GameState): readonly FollowedView[] => state.followed;

export interface FollowedWindowProps {
  connection: Pick<GameConnection, 'store' | 'inspect' | 'commands'>;
  onCenter: (x: number, level: number) => void;
  onClose: () => void;
}

/** Personas seguidas, ui.md 6.4. */
export function FollowedWindow({ connection, onCenter, onClose }: FollowedWindowProps) {
  const manager = useWindowManager();
  const followed = useStoreSelect(connection.store, selectFollowed) ?? [];
  useEffect(() => {
    manager.open({ id: FOLLOWED_WINDOW_ID });
    return () => manager.close(FOLLOWED_WINDOW_ID);
  }, []);

  const select = (person: FollowedView): void => {
    onCenter(person.x, person.level);
    connection.inspect.requestPersonWindow(person.id);
  };

  return (
    <Window
      id={FOLLOWED_WINDOW_ID}
      title={t('window.followed.title', { n: followed.length })}
      width={200}
      onClose={onClose}
    >
      {followed.length === 0 ? (
        <p class="tm-person__empty">{t('window.followed.empty')}</p>
      ) : (
        <ul class="tm-followed__list">
          {followed.map((person) => (
            <li key={person.id} class="tm-followed__item">
              <button type="button" class="tm-followed__row" onClick={() => select(person)}>
                <span
                  class={`tm-followed__swatch ${stressClass(person.stress)}`}
                  aria-hidden="true"
                />
                <span class="tm-followed__name">{person.name}</span>
                <span class="tm-followed__kind">{kindName(person.kind)}</span>
              </button>
              <button
                type="button"
                class="tm-followed__remove"
                aria-label={t('window.person.unfollow')}
                onClick={() => void connection.commands.unfollowPerson(person.id)}
              >
                x
              </button>
            </li>
          ))}
        </ul>
      )}
    </Window>
  );
}
