import { useEffect, useState } from 'preact/hooks';
import type { FollowedView } from '@tower-magnate/shared';
import type { GameState } from '../../model/gameState';
import { useStoreSelect } from '../../model/useStoreSelect';
import type { GameConnection } from '../../net/gameConnection';
import { PERSON_WINDOW_KIND, entityOfWindow, personWindowId } from '../inspectTarget';
import { Button, Tooltip, Window, useWindowManager } from '../kit';
import { t } from '../strings';
import {
  NAME_MAX_LENGTH,
  destinationText,
  followButtonState,
  homeRow,
  kindName,
  personTitle,
  stateText,
  stressClass,
  stressText,
} from './personWindowModel';
import './person.css';

const FIRST_WINDOW_POSITION = { x: 80, y: 80 };
const CASCADE_STEP = 12;

type PersonConnection = Pick<GameConnection, 'store' | 'inspect' | 'commands'>;

export interface PersonWindowsProps {
  connection: PersonConnection;
  /** Moves the view to a person, keeping the zoom. */
  onCenter: (x: number, level: number) => void;
}

const selectFollowed = (state: GameState): readonly FollowedView[] => state.followed;
const selectUnits = (state: GameState) => state.units;
const selectPeople = (state: GameState) => state.people;

function usePersonInspect(connection: PersonConnection, personId: string) {
  const { inspect } = connection;
  const [data, setData] = useState(() => inspect.person(personId));
  useEffect(() => {
    setData(inspect.person(personId));
    return inspect.subscribe(() => setData(inspect.person(personId)));
  }, [inspect, personId]);
  return data;
}

/** Person window, ui.md 6.3. */
function PersonWindow({
  personId,
  connection,
  onCenter,
}: PersonWindowsProps & { personId: string }) {
  const manager = useWindowManager();
  const { commands } = connection;
  const data = usePersonInspect(connection, personId);
  const followed = useStoreSelect(connection.store, selectFollowed) ?? [];
  const units = useStoreSelect(connection.store, selectUnits);
  const people = useStoreSelect(connection.store, selectPeople);
  const followedEntry = followed.find((entry) => entry.id === personId);
  const isFollowed = followedEntry !== undefined;
  const [wasFollowed, setWasFollowed] = useState(false);
  const [unfollowedHere, setUnfollowedHere] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const windowId = personWindowId(personId);

  useEffect(() => {
    if (isFollowed) {
      setWasFollowed(true);
      setUnfollowedHere(false);
    }
  }, [isFollowed]);

  // A followed person who drops off the list without the player unfollowing has left the tower.
  const gone = wasFollowed && !isFollowed && !unfollowedHere;
  const unitOf = (unitId: string) => units?.get(unitId);
  const customName = data?.name ?? followedEntry?.name ?? null;
  const shownName = draft ?? customName ?? '';
  const kind = data?.personKind ?? people?.get(personId)?.kind;
  const position = followedEntry ?? people?.get(personId);

  const commitName = (): void => {
    if (draft === null) {
      return;
    }
    const name = draft.trim();
    setDraft(null);
    if (name !== (customName ?? '')) {
      void commands.renamePerson(personId, name);
    }
  };

  const close = (): void => {
    connection.inspect.forgetPerson(personId);
    manager.close(windowId);
  };

  const follow = followButtonState({
    name: customName,
    followed: isFollowed,
    followedCount: followed.length,
    gone,
  });
  const toggleFollow = (): void => {
    if (isFollowed) {
      setUnfollowedHere(true);
      void commands.unfollowPerson(personId);
    } else {
      void commands.followPerson(personId);
    }
  };
  const home = data === undefined ? null : homeRow(data, unitOf);

  const followButton = (
    <Button disabled={follow.disabled} onClick={toggleFollow}>
      {t(isFollowed ? 'window.person.unfollow' : 'window.person.follow')}
    </Button>
  );

  return (
    <Window
      id={windowId}
      title={kind === undefined ? '' : personTitle(customName, kind)}
      onClose={close}
      width={150}
    >
      {gone && <p class="tm-person__gone">{t('ui.goneFromTower')}</p>}
      <div class="tm-field">
        <label class="tm-field__label" for={`${windowId}-name`}>
          {t('window.unit.name')}
        </label>
        <input
          id={`${windowId}-name`}
          class="tm-input"
          type="text"
          value={shownName}
          maxLength={NAME_MAX_LENGTH}
          placeholder={kind === undefined ? undefined : kindName(kind)}
          disabled={gone}
          onInput={(event) => setDraft(event.currentTarget.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commitName();
            }
          }}
        />
      </div>
      {data !== undefined && (
        <dl class="tm-person__rows">
          <Row label={t('window.person.type')} value={kindName(data.personKind)} />
          <Row label={t('window.person.status')} value={stateText(data, unitOf)} />
          <Row label={t('window.person.destination')} value={destinationText(data, unitOf)} />
          <Row
            label={t('window.person.stress')}
            value={stressText(data.stressMinutes, data.stress)}
            valueClass={stressClass(data.stress)}
          />
          {home !== null && <Row label={home.label} value={home.value} />}
        </dl>
      )}
      <div class="tm-person__buttons">
        {follow.tooltip === undefined ? (
          followButton
        ) : (
          <Tooltip text={follow.tooltip}>{followButton}</Tooltip>
        )}
        <Button
          disabled={gone || position === undefined}
          onClick={() => position !== undefined && onCenter(position.x, position.level)}
        >
          {t('ui.center')}
        </Button>
      </div>
    </Window>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div class="tm-person__row">
      <dt>{label}</dt>
      <dd class={valueClass}>{value}</dd>
    </div>
  );
}

/** Opens a person window whenever the Lupa or the followed list asks for one. */
export function PersonWindows({ connection, onCenter }: PersonWindowsProps) {
  const manager = useWindowManager();
  const personWindows = manager.stack.windows.filter(
    (window) => window.kind === PERSON_WINDOW_KIND,
  );

  useEffect(
    () =>
      connection.inspect.onPersonWindowRequest((personId) => {
        const offset = (manager.stack.openCount % 4) * CASCADE_STEP;
        manager.open({
          id: personWindowId(personId),
          kind: PERSON_WINDOW_KIND,
          position: { x: FIRST_WINDOW_POSITION.x + offset, y: FIRST_WINDOW_POSITION.y + offset },
        });
      }),
    [connection, manager],
  );

  return (
    <>
      {personWindows.map((window) => (
        <PersonWindow
          key={window.id}
          personId={entityOfWindow(window.id)}
          connection={connection}
          onCenter={onCenter}
        />
      ))}
    </>
  );
}
