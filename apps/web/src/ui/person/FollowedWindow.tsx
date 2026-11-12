import { useEffect } from 'preact/hooks';
import type { FollowedView } from '@tower-magnate/shared';
import type { GameState } from '../../model/gameState';
import { useStoreSelect } from '../../model/useStoreSelect';
import type { GameConnection } from '../../net/gameConnection';
import { personWorldPoint } from '../../render/personPoint';
import { FOLLOWED_WINDOW_ID } from '../inspectTarget';
import { ScrollArea, Window, useWindowManager } from '../kit';
import { t } from '../strings';
import { followedTitle, kindName, stressColor } from './personWindowModel';
import './person.css';

const FOLLOWED_LIST_HEIGHT = 160;

const selectFollowed = (state: GameState): readonly FollowedView[] => state.followed;

export interface FollowedWindowProps {
  connection: Pick<GameConnection, 'store' | 'inspect' | 'commands'>;
  onCenter: (point: { x: number; y: number }) => void;
  onClose: () => void;
}

/** Personas seguidas, ui.md 6.4. */
export function FollowedWindow({ connection, onCenter, onClose }: FollowedWindowProps) {
  const manager = useWindowManager();
  const followed = useStoreSelect(connection.store, selectFollowed) ?? [];
  useEffect(() => {
    manager.open({ id: FOLLOWED_WINDOW_ID, corner: 'topLeft' });
    return () => manager.close(FOLLOWED_WINDOW_ID);
  }, []);

  const openPerson = (person: FollowedView): void => {
    onCenter(personWorldPoint(person));
    connection.inspect.requestPersonWindow(person.id);
  };

  return (
    <Window
      id={FOLLOWED_WINDOW_ID}
      title={followedTitle(followed.length)}
      width={240}
      onClose={onClose}
    >
      {followed.length === 0 ? (
        <p class="tm-followed__empty">{t('window.followed.empty')}</p>
      ) : (
        <ScrollArea
          label={t('window.followed.title', { n: followed.length })}
          maxHeight={FOLLOWED_LIST_HEIGHT}
        >
          <ul class="tm-followed__list">
            {followed.map((person) => (
              <li key={person.id} class="tm-followed__row">
                <button type="button" class="tm-followed__open" onClick={() => openPerson(person)}>
                  <span
                    class="tm-followed__stress"
                    style={{ background: stressColor(person.stress) }}
                  />
                  <span class="tm-followed__name">{person.name}</span>
                  <span class="tm-followed__kind">{kindName(person.kind)}</span>
                </button>
                <button
                  type="button"
                  class="tm-followed__stop"
                  aria-label={t('window.person.unfollow')}
                  title={t('window.person.unfollow')}
                  onClick={() => void connection.commands.unfollowPerson(person.id)}
                >
                  x
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </Window>
  );
}
