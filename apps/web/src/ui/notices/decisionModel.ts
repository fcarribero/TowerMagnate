import { dateOfStep } from '@tower-magnate/engine/calendar';
import type { DecisionKind, EventView } from '@tower-magnate/shared';
import { formatMoney } from '../money';
import { formatGameTime } from '../status/statusFormat';
import { t, type StringKey } from '../strings';

export type DecisionEvent = Extract<EventView, { kind: 'decision' }>;

export function openDecisions(events: readonly EventView[]): DecisionEvent[] {
  return events.filter((event): event is DecisionEvent => event.kind === 'decision');
}

const OPTION_KEYS: Record<DecisionKind, Record<string, StringKey>> = {
  bomb: { pay: 'dialog.bomb.pay', refuse: 'dialog.bomb.refuse' },
  fire: { helicopter: 'dialog.fire.helicopter', burn: 'dialog.fire.burn' },
};

/** Text parameters of a decision: the ransom of a bomb or the floor of a fire. */
export function decisionParams(event: DecisionEvent): Record<string, string | number> {
  if (event.ransom !== undefined) {
    return { ransom: formatMoney(event.ransom) };
  }
  return event.level === undefined ? {} : { level: event.level };
}

export function optionLabel(
  kind: DecisionKind,
  option: string,
  params: Record<string, string | number> = {},
): string {
  const key = OPTION_KEYS[kind][option];
  if (key === undefined) {
    return option;
  }
  if (key === 'dialog.bomb.pay' && params.ransom === undefined) {
    return t('dialog.bomb.payUnpriced');
  }
  return t(key, params);
}

/** Body text; names the ransom or the floor only when the server sent them. */
export function decisionBody(kind: DecisionKind, params: Record<string, string | number>): string {
  if (kind === 'bomb') {
    return params.ransom === undefined
      ? t('dialog.bomb.bodyUnpriced')
      : t('dialog.bomb.body', params);
  }
  return params.level === undefined
    ? t('dialog.fire.bodyUnlocated')
    : t('dialog.fire.body', params);
}

/** "Respondé antes de las 13:00", or with the weekday when the deadline is on another day. */
export function deadlineText(nowStep: number, deadlineStep: number): string {
  const time = formatGameTime(deadlineStep);
  const deadline = dateOfStep(deadlineStep);
  if (dateOfStep(nowStep).dayNumber === deadline.dayNumber) {
    return t('dialog.deadlineToday', { time });
  }
  return t('dialog.deadlineOtherDay', {
    weekday: t(`calendar.weekday.${deadline.weekday}` as StringKey),
    time,
  });
}
