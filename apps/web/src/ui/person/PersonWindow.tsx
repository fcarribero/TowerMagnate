import { useEffect, useRef, useState } from 'preact/hooks';
import type { UnitView } from '@tower-magnate/shared';
import type { PersonInspect } from '../../model/inspectStore';
import type { GameConnection } from '../../net/gameConnection';
import { personWorldPoint } from '../../render/personPoint';
import { Button, TextField, Tooltip, Window, useWindowManager } from '../kit';
import { personPanelId, personWindowId } from '../inspectTarget';
import { PersonPortrait } from './PersonPortrait';
import { t } from '../strings';
import { NAME_MAX_LENGTH } from '../unit/unitWindowModel';
import {
  followStar,
  homeRow,
  kindName,
  personTitle,
  stressColor,
  stressText,
} from './personWindowModel';
import './person.css';

type Found = Extract<PersonInspect, { status: 'ok' }>;

export interface PersonWindowProps {
  personId: string;
  connection: Pick<GameConnection, 'store' | 'inspect' | 'commands'>;
  /** Moves the view to a world point, keeping the zoom. */
  onCenter: (point: { x: number; y: number }) => void;
  /** The fixed panel next to the selected person: no dragging. The close button or a click elsewhere closes it. */
  anchored?: boolean;
}

interface Place {
  x: number;
  level: number;
}

interface TowerFacts {
  units: ReadonlyMap<string, UnitView>;
  followedCount: number;
  isFollowed: boolean;
  place: Place | undefined;
}

const NO_UNITS: ReadonlyMap<string, UnitView> = new Map();

function readFacts(connection: PersonWindowProps['connection'], personId: string): TowerFacts {
  const latest = connection.store.current?.latest;
  if (latest === undefined) {
    return { units: NO_UNITS, followedCount: 0, isFollowed: false, place: undefined };
  }
  const followed = latest.followed.find((person) => person.id === personId);
  return {
    units: latest.units,
    followedCount: latest.followed.length,
    isFollowed: followed !== undefined,
    place: followed ?? latest.people.get(personId),
  };
}

function samePlace(a: Place | undefined, b: Place | undefined): boolean {
  return a === b || (a !== undefined && b !== undefined && a.x === b.x && a.level === b.level);
}

function useTowerFacts(connection: PersonWindowProps['connection'], personId: string): TowerFacts {
  const [facts, setFacts] = useState(() => readFacts(connection, personId));
  useEffect(() => {
    setFacts(readFacts(connection, personId));
    return connection.store.subscribe(() => {
      const next = readFacts(connection, personId);
      setFacts((current) =>
        current.units === next.units &&
        current.followedCount === next.followedCount &&
        current.isFollowed === next.isFollowed &&
        samePlace(current.place, next.place)
          ? current
          : next,
      );
    });
  }, [connection, personId]);
  return facts;
}

function usePersonInspect(connection: PersonWindowProps['connection'], personId: string) {
  const { inspect } = connection;
  const [data, setData] = useState(() => inspect.person(personId));
  useEffect(() => {
    setData(inspect.person(personId));
    return inspect.subscribe(() => setData(inspect.person(personId)));
  }, [inspect, personId]);
  return data;
}

/** Keeps the last value that was not undefined. */
function useLastKnown<T>(value: T | undefined): T | undefined {
  const last = useRef<T | undefined>(undefined);
  if (value !== undefined) {
    last.current = value;
  }
  return last.current;
}

/** Person window, ui.md 6.3. */
export function PersonWindow({
  personId,
  connection,
  onCenter,
  anchored = false,
}: PersonWindowProps) {
  const manager = useWindowManager();
  const { commands } = connection;
  const facts = useTowerFacts(connection, personId);
  const data = usePersonInspect(connection, personId);
  const found: Found | undefined = data?.status === 'ok' ? data : undefined;
  const known = useLastKnown(found);
  const place = useLastKnown(facts.place);
  const gone = data?.status === 'gone';
  const windowId = anchored ? personPanelId(personId) : personWindowId(personId);

  const storedName = known?.name ?? null;
  const [draft, setDraft] = useState<string | null>(null);
  const shownName = draft ?? storedName ?? '';
  const commitName = (): void => {
    if (draft === null) {
      return;
    }
    const name = draft.trim();
    setDraft(null);
    if (name !== (storedName ?? '')) {
      void commands.renamePerson(personId, name);
    }
  };

  const close = (): void => {
    if (anchored) {
      connection.inspect.clearAnchor();
      return;
    }
    connection.inspect.forgetPerson(personId);
    manager.close(windowId);
  };

  const unitOf = (unitId: string): UnitView | undefined => facts.units.get(unitId);
  const follow = followStar(storedName !== null, facts.isFollowed, facts.followedCount, gone);
  const toggleFollow = (): void => {
    void (facts.isFollowed ? commands.unfollowPerson(personId) : commands.followPerson(personId));
  };
  const title = known === undefined ? '' : personTitle(known.personKind, known.name);
  const home = found === undefined ? null : homeRow(found.personKind, found.homeUnitId, unitOf);
  const stress = found === undefined ? null : stressText(found.stressMinutes, found.stress);

  const starButton = (
    <button
      type="button"
      class={`tm-person__star${follow.active ? ' is-active' : ''}`}
      aria-label={follow.label}
      aria-pressed={follow.active}
      disabled={follow.disabled}
      onClick={toggleFollow}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
      </svg>
    </button>
  );

  return (
    <Window id={windowId} title={title} onClose={close} draggable={!anchored} width={200}>
      {gone && <p class="tm-person__gone">{t('ui.goneFromTower')}</p>}
      <div class="tm-person__header">
        {known !== undefined && <PersonPortrait id={personId} kind={known.personKind} />}
        {follow.reason === undefined ? (
          starButton
        ) : (
          <Tooltip text={follow.reason}>{starButton}</Tooltip>
        )}
      </div>
      <TextField
        id={`${windowId}-name`}
        label={t('window.unit.name')}
        value={shownName}
        maxLength={NAME_MAX_LENGTH}
        placeholder={known === undefined ? undefined : kindName(known.personKind)}
        disabled={gone || known === undefined}
        onChange={setDraft}
        onBlur={commitName}
        onEnter={commitName}
      />
      {found !== undefined && stress !== null && (
        <dl class="tm-person__rows">
          <Row
            label={t('window.person.stress')}
            value={stress.text}
            color={stress.level === 'normal' ? undefined : stressColor(stress.level)}
          />
          {home !== null && <Row label={home.label} value={home.value} />}
        </dl>
      )}
      <div class="tm-person__buttons">
        <Button
          disabled={gone || place === undefined}
          onClick={() => place !== undefined && onCenter(personWorldPoint(place))}
        >
          {t('ui.center')}
        </Button>
      </div>
    </Window>
  );
}

interface RowProps {
  label: string;
  value: string;
  color?: string;
}

function Row({ label, value, color }: RowProps) {
  return (
    <div class="tm-person__row">
      <dt>{label}</dt>
      <dd style={color === undefined ? undefined : { color }}>{value}</dd>
    </div>
  );
}
