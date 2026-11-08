import {
  MAX_FOLLOWED_PEOPLE,
  type FollowedView,
  type PersonKind,
  type UnitView,
} from '@tower-magnate/shared';
import type { PersonInspect } from '../../model/inspectStore';
import { t, type StringKey } from '../strings';
import { NAME_MAX_LENGTH, levelText, typeName } from '../unit/unitWindowModel';

export { NAME_MAX_LENGTH };

export type StressLevel = FollowedView['stress'];

const KIND_KEYS: Readonly<Record<PersonKind, StringKey>> = {
  officeWorker: 'value.person.officeWorker',
  resident: 'value.person.resident',
  hotelGuest: 'value.person.hotelGuest',
  customer: 'value.person.customer',
  audience: 'value.person.audience',
  partyGuest: 'value.person.partyGuest',
  maid: 'value.person.maid',
  guard: 'value.person.securityGuard',
  prospect: 'value.person.prospect',
  vip: 'value.person.vip',
  weddingGuest: 'value.person.weddingGuest',
};

const STATE_KEYS = {
  walk: 'value.personState.walking',
  wait: 'value.personState.waitingElevator',
  ride: 'value.personState.riding',
  stairs: 'value.personState.onStairs',
  noRoute: 'value.personState.noRoute',
  outside: 'value.personState.outside',
} as const;

const STRESS_KEYS: Readonly<Record<StressLevel, StringKey>> = {
  normal: 'value.stress.normal',
  stressed: 'value.stress.high',
  veryStressed: 'value.stress.veryHigh',
};

const HOME_LABEL_KEYS: Partial<Record<PersonKind, StringKey>> = {
  resident: 'window.person.livesIn',
  officeWorker: 'window.person.worksIn',
  hotelGuest: 'window.person.staysIn',
};

export function kindName(kind: PersonKind): string {
  return t(KIND_KEYS[kind]);
}

export function personTitle(name: string | null, kind: PersonKind): string {
  return name ?? kindName(kind);
}

export function unitName(unit: Pick<UnitView, 'name' | 'type'>): string {
  return unit.name ?? typeName(unit.type);
}

type UnitLookup = (unitId: string) => Pick<UnitView, 'name' | 'type' | 'level'> | undefined;

export function stateText(person: PersonInspect, unitOf: UnitLookup): string {
  if (person.state !== 'inside') {
    return t(STATE_KEYS[person.state]);
  }
  const unitId =
    person.destination?.kind === 'unit' ? person.destination.unitId : person.homeUnitId;
  const unit = unitId === null ? undefined : unitOf(unitId);
  return t('value.personState.inUnit', { unit: unit === undefined ? '' : unitName(unit) }).trim();
}

export function destinationText(person: PersonInspect, unitOf: UnitLookup): string {
  const { destination } = person;
  if (destination === null) {
    return t('window.unit.none');
  }
  if (destination.kind === 'exit') {
    return t('window.person.leavingTower');
  }
  const unit = unitOf(destination.unitId);
  return t('window.unit.title', {
    type: unit === undefined ? '' : unitName(unit),
    level: levelText(destination.level),
  });
}

export function stressText(minutes: number, level: StressLevel): string {
  return t('window.person.stressValue', { n: Math.round(minutes), level: t(STRESS_KEYS[level]) });
}

export function stressClass(level: StressLevel): string {
  return `is-${level}`;
}

export function homeRow(
  person: PersonInspect,
  unitOf: UnitLookup,
): { label: string; value: string } | null {
  const labelKey = HOME_LABEL_KEYS[person.personKind];
  const unit = person.homeUnitId === null ? undefined : unitOf(person.homeUnitId);
  if (labelKey === undefined || unit === undefined) {
    return null;
  }
  return { label: t(labelKey), value: unitName(unit) };
}

export interface FollowButtonState {
  followed: boolean;
  disabled: boolean;
  tooltip: string | undefined;
}

export function followButtonState(options: {
  name: string | null;
  followed: boolean;
  followedCount: number;
  gone: boolean;
}): FollowButtonState {
  const { name, followed, followedCount, gone } = options;
  if (gone) {
    return { followed, disabled: true, tooltip: undefined };
  }
  if (followed) {
    return { followed, disabled: false, tooltip: undefined };
  }
  if (name === null || name === '') {
    return { followed, disabled: true, tooltip: t('window.person.needsName') };
  }
  if (followedCount >= MAX_FOLLOWED_PEOPLE) {
    return { followed, disabled: true, tooltip: t('error.FOLLOW_LIMIT') };
  }
  return { followed, disabled: false, tooltip: undefined };
}
