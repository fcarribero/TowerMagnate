import { ELEVATOR_MODES, type ElevatorMode } from '@tower-magnate/shared';
import { useState } from 'preact/hooks';
import { Button, RadioGroup } from '../kit';
import { t, type StringKey } from '../strings';
import {
  bandRanges,
  copyDay,
  parseDwell,
  parseResponse,
  updateBand,
  type BandDraft,
  type BandInForce,
  type DayType,
  type ScheduleDraft,
} from './scheduleDraft';

export interface ScheduleTabProps {
  shaftId: string;
  draft: ScheduleDraft;
  inForce: BandInForce | null;
  onChange: (draft: ScheduleDraft) => void;
}

const DAY_LABELS: Record<DayType, StringKey> = {
  weekday: 'window.elevator.weekdays',
  weekend: 'window.elevator.weekend',
};

const COPY_LABELS: Record<DayType, StringKey> = {
  weekday: 'window.elevator.copyToWeekend',
  weekend: 'window.elevator.copyToWeekdays',
};

const RANGES = bandRanges();

function hasBadDwell(bands: readonly BandDraft[]): boolean {
  return bands.some((band) => parseDwell(band.dwell) === null);
}

function hasBadResponse(bands: readonly BandDraft[]): boolean {
  return bands.some((band) => parseResponse(band.response) === null);
}

export function ScheduleTab({ shaftId, draft, inForce, onChange }: ScheduleTabProps) {
  const [dayType, setDayType] = useState<DayType>(inForce?.dayType ?? 'weekday');
  const bands = draft[dayType];
  const change = (index: number, patch: Partial<BandDraft>): void =>
    onChange(updateBand(draft, dayType, index, patch));

  const rows = bands.map((band, index) => {
    const range = RANGES[index] ?? { from: '', to: '' };
    const rangeText = t('window.elevator.bandRange', range);
    const isNow = inForce?.dayType === dayType && inForce.index === index;
    const fieldId = `${shaftId}-${dayType}-${index}`;
    return (
      <tr
        key={fieldId}
        class={isNow ? 'is-now' : undefined}
        aria-current={isNow ? 'time' : undefined}
      >
        <th scope="row">
          {rangeText}
          {isNow ? (
            <span class="elevator-schedule__now">{t('window.elevator.bandNow')}</span>
          ) : null}
        </th>
        <td>
          <select
            aria-label={`${t('window.elevator.mode')} ${rangeText}`}
            value={band.mode}
            onChange={(event) => change(index, { mode: event.currentTarget.value as ElevatorMode })}
          >
            {ELEVATOR_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {t(`value.elevatorMode.${mode}`)}
              </option>
            ))}
          </select>
        </td>
        <td>
          <input
            id={`${fieldId}-dwell`}
            class="tm-input"
            inputMode="numeric"
            aria-label={`${t('window.elevator.dwell')} ${rangeText}`}
            aria-invalid={parseDwell(band.dwell) === null}
            value={band.dwell}
            onInput={(event) => change(index, { dwell: event.currentTarget.value })}
          />{' '}
          {t('window.elevator.seconds')}
        </td>
        <td>
          <input
            id={`${fieldId}-response`}
            class="tm-input"
            inputMode="numeric"
            aria-label={`${t('window.elevator.response')} ${rangeText}`}
            aria-invalid={parseResponse(band.response) === null}
            value={band.response}
            onInput={(event) => change(index, { response: event.currentTarget.value })}
          />{' '}
          {t('window.elevator.floors')}
        </td>
      </tr>
    );
  });

  const allBands = [...draft.weekday, ...draft.weekend];
  const problems = [
    hasBadDwell(allBands) ? t('window.elevator.dwellInvalid') : null,
    hasBadResponse(allBands) ? t('window.elevator.responseInvalid') : null,
  ].filter((problem) => problem !== null);

  return (
    <div class="elevator-schedule">
      <RadioGroup
        name={`${shaftId}-day-type`}
        label={t('ui.shaftTabSchedule')}
        options={(['weekday', 'weekend'] as const).map((value) => ({
          value,
          label: t(DAY_LABELS[value]),
        }))}
        value={dayType}
        onChange={setDayType}
      />
      <table>
        <thead>
          <tr>
            <th scope="col">{t('window.elevator.band')}</th>
            <th scope="col">{t('window.elevator.mode')}</th>
            <th scope="col">{t('window.elevator.dwell')}</th>
            <th scope="col">{t('window.elevator.response')}</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
      {problems.map((problem) => (
        <p key={problem} class="elevator-schedule__problem">
          {problem}
        </p>
      ))}
      <Button onClick={() => onChange(copyDay(draft, dayType))}>{t(COPY_LABELS[dayType])}</Button>
    </div>
  );
}
