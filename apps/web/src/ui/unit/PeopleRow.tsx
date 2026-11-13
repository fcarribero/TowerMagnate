import type { GameConnection } from '../../net/gameConnection';
import { PersonPortrait } from '../person/PersonPortrait';
import { t } from '../strings';
import type { PeopleGroup } from './unitWindowModel';

export interface PeopleRowProps {
  group: PeopleGroup;
  connection: Pick<GameConnection, 'store' | 'inspect'>;
}

/** The people of one group standing in a row like a queue; each one opens that person's window. */
export function PeopleRow({ group, connection }: PeopleRowProps) {
  const known = connection.store.current?.latest.people;
  return (
    <section class="tm-unit__people" aria-label={group.label}>
      <h3 class="tm-unit__people-title">{group.label}</h3>
      {group.people.length === 0 ? (
        <p class="tm-unit__people-none">{t('window.unit.peopleNobody')}</p>
      ) : (
        <ul class="tm-unit__queue">
          {group.people.map((id) => (
            <li key={id}>
              <button
                type="button"
                class="tm-unit__person"
                title={t('window.unit.openPerson')}
                aria-label={t('window.unit.openPerson')}
                onClick={() => connection.inspect.requestPersonWindow(id)}
              >
                <PersonPortrait id={id} kind={known?.get(id)?.kind ?? group.kind} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
