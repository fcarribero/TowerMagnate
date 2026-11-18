import { MAX_FOLLOWED_PEOPLE, type PersonKind, type UnitView } from '@tower-magnate/shared';
import type { PersonInspect } from '../../model/inspectStore';
import { STRESS_INK, STRESS_PINK, STRESS_RED } from '../../render/stressPalette';
import { errorText, t, type StringKey } from '../strings';
import { levelText, typeName } from '../unit/unitWindowModel';

type Found = Extract<PersonInspect, { status: 'ok' }>;
type StressLevel = Found['stress'];

const KIND_KEYS: Readonly<Record<PersonKind, StringKey>> = {
  officeWorker: 'value.person.officeWorker',
  resident: 'value.person.resident',
  hotelGuest: 'value.person.hotelGuest',
  customer: 'value.person.customer',
  audience: 'value.person.audience',
  partyGuest: 'value.person.partyGuest',
  maid: 'value.person.maid',
  police: 'value.person.police',
  vip: 'value.person.vip',
  weddingGuest: 'value.person.weddingGuest',
  prospect: 'value.person.prospect',
  builder: 'value.person.builder',
  staff: 'value.person.staff',
  courier: 'value.person.courier',
  child: 'value.person.child',
  cleaner: 'value.person.cleaner',
  doctor: 'value.person.doctor',
};

const STRESS_KEYS: Readonly<Record<StressLevel, StringKey>> = {
  normal: 'value.stress.normal',
  stressed: 'value.stress.high',
  veryStressed: 'value.stress.veryHigh',
};

const HOME_ROW_KEYS: Partial<Record<PersonKind, StringKey>> = {
  resident: 'window.person.livesIn',
  child: 'window.person.livesIn',
  officeWorker: 'window.person.worksIn',
  hotelGuest: 'window.person.staysIn',
  doctor: 'window.person.worksIn',
};

export function kindName(kind: PersonKind): string {
  return t(KIND_KEYS[kind]);
}

export function personTitle(kind: PersonKind, name: string | null): string {
  return name ?? kindName(kind);
}

/** The unit as the window names it: its own name or its type, then the level. */
export function unitLabel(unit: Pick<UnitView, 'name' | 'type' | 'level'>): string {
  return `${unit.name ?? typeName(unit.type)} · ${levelText(unit.level)}`;
}

const STRESS_COLORS: Readonly<Record<StressLevel, string>> = {
  normal: STRESS_INK,
  stressed: STRESS_PINK,
  veryStressed: STRESS_RED,
};

/** The tower palette color of a stress level, for text and squares over the Obra chrome. */
export function stressColor(level: StressLevel): string {
  return STRESS_COLORS[level];
}

export interface StressText {
  text: string;
  level: StressLevel;
}

export function stressText(minutes: number, level: StressLevel): StressText {
  return {
    text: t('window.person.stressValue', { n: Math.round(minutes), level: t(STRESS_KEYS[level]) }),
    level,
  };
}

/** What the person is doing; `unit` is the unit they are in, when there is one. A courier on foot is delivering. */
export function stateText(
  state: Found['state'],
  unit: UnitView | undefined,
  kind?: PersonKind,
): string {
  if (kind === 'courier' && (state === 'walk' || state === 'inside')) {
    return t('value.personState.delivering');
  }
  // A child has no plans: wherever it is on a trip, it is with the adult it follows.
  if (
    kind === 'child' &&
    (state === 'walk' || state === 'wait' || state === 'ride' || state === 'stairs')
  ) {
    return t('value.personState.withAdult');
  }
  switch (state) {
    case 'walk':
      return t('value.personState.walking');
    case 'wait':
      return t('value.personState.waitingElevator');
    case 'ride':
      return t('value.personState.riding');
    case 'stairs':
      return t('value.personState.onStairs');
    case 'noRoute':
      return t('value.personState.noRoute');
    case 'outside':
      return t('value.personState.outside');
    case 'inside':
      return unit === undefined
        ? t('value.personState.walking')
        : t('value.personState.inUnit', { unit: unit.name ?? typeName(unit.type) });
  }
}

export function destinationText(
  destination: Found['destination'],
  unitOf: (unitId: string) => UnitView | undefined,
): string {
  if (destination === null) {
    return t('window.unit.none');
  }
  if (destination.kind === 'exit') {
    return t('window.person.leavingTower');
  }
  const unit = unitOf(destination.unitId);
  return unit === undefined ? levelText(destination.level) : unitLabel(unit);
}

export interface HomeRow {
  label: string;
  value: string;
}

/** Vive en, Trabaja en or Se aloja en; none for kinds without a home unit. */
export function homeRow(
  kind: PersonKind,
  homeUnitId: string | null,
  unitOf: (unitId: string) => UnitView | undefined,
): HomeRow | null {
  const key = HOME_ROW_KEYS[kind];
  if (key === undefined || homeUnitId === null) {
    return null;
  }
  const unit = unitOf(homeUnitId);
  return unit === undefined ? null : { label: t(key), value: unitLabel(unit) };
}

export interface FollowStar {
  /** Tooltip and accessible name: Seguir, or Dejar de seguir while following. */
  label: string;
  /** True while the person is followed: the star is filled. */
  active: boolean;
  disabled: boolean;
  /** Why the star is disabled, shown instead of the label. */
  reason: string | undefined;
}

/** The star follows a person; it needs a name and room in the list, and unfollowing is always allowed. */
export function followStar(
  named: boolean,
  isFollowed: boolean,
  followedCount: number,
  gone: boolean,
): FollowStar {
  if (isFollowed) {
    return { label: t('window.person.unfollow'), active: true, disabled: gone, reason: undefined };
  }
  const label = t('window.person.follow');
  if (!named) {
    return {
      label,
      active: false,
      disabled: true,
      reason: gone ? undefined : t('window.person.needsName'),
    };
  }
  if (followedCount >= MAX_FOLLOWED_PEOPLE) {
    return {
      label,
      active: false,
      disabled: true,
      reason: gone ? undefined : errorText('FOLLOW_LIMIT'),
    };
  }
  return { label, active: false, disabled: gone, reason: undefined };
}

export function followedTitle(count: number): string {
  return t('window.followed.title', { n: count });
}
