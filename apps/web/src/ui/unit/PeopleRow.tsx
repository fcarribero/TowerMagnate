import type { PersonKind } from '@tower-magnate/shared';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { GameConnection } from '../../net/gameConnection';
import { personLook } from '../../render/personLook';
import { portraitSize } from '../../render/personPortrait';
import { IN_GAME_SIZE_PX, PersonPortrait } from '../person/PersonPortrait';
import { t } from '../strings';
import { queueLayout } from './queueLayout';
import type { PeopleGroup } from './unitWindowModel';
import './peopleRow.css';

export interface PeopleRowProps {
  group: PeopleGroup;
  connection: Pick<GameConnection, 'store' | 'inspect'>;
  /** No heading and no "nobody" text: just the row of people, and nothing when empty. */
  bare?: boolean;
}

interface Room {
  /** Inner width of the queue box in pixels. */
  width: number;
  /** Space between two people standing side by side. */
  gap: number;
}

/** The inner width of the queue box and its gap, kept up to date while the panel is open. */
function useQueueRoom(box: { current: HTMLElement | null }): Room | null {
  const [room, setRoom] = useState<Room | null>(null);
  useLayoutEffect(() => {
    const element = box.current;
    if (element === null || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const measure = (): void => {
      const style = getComputedStyle(element);
      const width =
        element.clientWidth -
        (parseFloat(style.paddingLeft) || 0) -
        (parseFloat(style.paddingRight) || 0);
      const gap = parseFloat(style.columnGap) || 0;
      setRoom((current) =>
        current !== null && current.width === width && current.gap === gap
          ? current
          : { width, gap },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [box.current]);
  return room;
}

function portraitWidth(id: string, kind: PersonKind): number {
  return portraitSize(personLook(id, kind, false, 'uniform')).width * IN_GAME_SIZE_PX;
}

/**
 * The people of one group standing in a row like a queue; each one opens that person's window.
 * A crowd that does not fit the width stands closer, overlapping, and only takes another row once
 * the people would be too covered to tell apart.
 */
export function PeopleRow({ group, connection, bare = false }: PeopleRowProps) {
  const known = connection.store.current?.latest.people;
  const box = useRef<HTMLDivElement>(null);
  const room = useQueueRoom(box);
  if (bare && group.people.length === 0) {
    return null;
  }
  const kinds = group.people.map((id) => known?.get(id)?.kind ?? group.kind);
  const layout =
    room === null || room.width <= 0
      ? null
      : queueLayout(
          group.people.map((id, index) => portraitWidth(id, kinds[index] as PersonKind)),
          room.width,
          room.gap,
        );
  const rows: number[][] = [];
  group.people.forEach((_, index) => {
    if (rows.length === 0 || layout?.breakBefore[index] === true) rows.push([]);
    rows[rows.length - 1]?.push(index);
  });
  return (
    <section class="tm-unit__people" aria-label={group.label}>
      {!bare && <h3 class="tm-unit__people-title">{group.label}</h3>}
      {group.people.length === 0 ? (
        <p class="tm-unit__people-none">{t('window.unit.peopleNobody')}</p>
      ) : (
        <div ref={box} class="tm-unit__queue">
          {rows.map((row) => (
            <ul
              key={row[0]}
              class={layout === null ? 'tm-unit__queue-row is-unmeasured' : 'tm-unit__queue-row'}
            >
              {row.map((index) => {
                const id = group.people[index] as string;
                const margin = layout?.marginLeft[index] ?? 0;
                return (
                  <li key={id} style={margin === 0 ? undefined : { marginLeft: `${margin}px` }}>
                    <button
                      type="button"
                      class="tm-unit__person"
                      title={t('window.unit.openPerson')}
                      aria-label={t('window.unit.openPerson')}
                      onClick={() => connection.inspect.requestPersonWindow(id)}
                    >
                      <PersonPortrait id={id} kind={kinds[index] as PersonKind} inGameSize />
                    </button>
                  </li>
                );
              })}
            </ul>
          ))}
        </div>
      )}
    </section>
  );
}
