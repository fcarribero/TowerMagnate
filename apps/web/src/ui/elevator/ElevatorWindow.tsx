import {
  SHAFT_UNIT_TYPES,
  UNIT_CATALOG,
  levelLabel,
  type Command,
  type InspectData,
  type Level,
} from '@tower-magnate/shared';
import { useState } from 'preact/hooks';
import type { CommandOutcome } from '../../api/commandApi';
import { elevatorWindowId } from '../inspectTarget';
import { Button, Checkbox, Dropdown, Tabs, Window } from '../kit';
import { formatMoney } from '../money';
import { errorText, t, type StringKey } from '../strings';
import {
  canAddCar,
  canRemoveCar,
  hasChanges,
  homesOnStops,
  offeredLevels,
  toggleStop,
} from './elevatorDraft';
import './elevatorWindow.css';
import { ScheduleTab } from './ScheduleTab';
import {
  draftOf,
  parseSchedule,
  scheduleChanged,
  type BandInForce,
  type ScheduleDraft,
} from './scheduleDraft';

export type ShaftData = Extract<InspectData, { kind: 'shaft'; status: 'ok' }>;

export interface ElevatorWindowProps {
  shaft: ShaftData;
  send: (command: Command) => Promise<CommandOutcome>;
  onClose: () => void;
  /** Null before the first snapshot. */
  bandNow?: BandInForce | null;
}

const TYPE_NAMES: Record<ShaftData['type'], StringKey> = {
  standard: 'ui.shaftTypeStandard',
  service: 'ui.shaftTypeService',
  express: 'ui.shaftTypeExpress',
};

const LOWEST_LEVEL = -10;
const HIGHEST_LEVEL = 100;

function LevelSelect(props: {
  id: string;
  label: string;
  value: Level;
  levels: readonly Level[];
  onChange: (level: Level) => void;
}) {
  return (
    <Dropdown
      id={props.id}
      label={props.label}
      value={String(props.value)}
      options={props.levels.map((level) => ({ value: String(level), label: levelLabel(level) }))}
      onChange={(value) => props.onChange(Number(value))}
    />
  );
}

function carPrice(type: ShaftData['type']): number {
  const { cost } = UNIT_CATALOG[SHAFT_UNIT_TYPES[type]];
  return cost.kind === 'shaft' ? cost.perCarAmount : 0;
}

export function ElevatorWindow({ shaft, send, onClose, bandNow = null }: ElevatorWindowProps) {
  const savedHomes = shaft.cars.map((car) => car.homeLevel);
  const [tab, setTab] = useState('route');
  const [stops, setStops] = useState<Level[]>([...shaft.stops]);
  const [homes, setHomes] = useState<Level[]>(savedHomes);
  const [from, setFrom] = useState<Level>(shaft.bottom);
  const [to, setTo] = useState<Level>(shaft.top);
  const [schedule, setSchedule] = useState<ScheduleDraft>(() => draftOf(shaft.schedule));
  const [error, setError] = useState<string | null>(null);

  const savedKey = JSON.stringify([
    shaft.bottom,
    shaft.top,
    shaft.stops,
    savedHomes,
    shaft.schedule,
  ]);
  const [syncedKey, setSyncedKey] = useState(savedKey);
  if (savedKey !== syncedKey) {
    setSyncedKey(savedKey);
    setStops([...shaft.stops]);
    setHomes(savedHomes);
    setFrom(shaft.bottom);
    setTo(shaft.top);
    setSchedule(draftOf(shaft.schedule));
  }

  const changed =
    hasChanges({ stops: shaft.stops, carHomes: savedHomes }, { stops, carHomes: homes }) ||
    scheduleChanged(shaft.schedule, schedule);
  const scheduleToSend = parseSchedule(schedule);
  const levels = offeredLevels(shaft.type, shaft.bottom, shaft.top);
  const endpoints = offeredLevels(shaft.type, LOWEST_LEVEL, HIGHEST_LEVEL);

  const run = async (command: Command): Promise<void> => {
    const outcome = await send(command);
    setError(outcome.ok ? null : errorText(outcome.error));
  };

  const changeStops = (next: Level[]): void => {
    setStops(next);
    setHomes(homesOnStops(homes, next));
  };

  const setHome = (position: number, level: Level): void => {
    setHomes(homes.map((home, index) => (index === position ? level : home)));
  };

  const title =
    t('ui.shaftTitle', {
      type: t(TYPE_NAMES[shaft.type]),
      bottom: levelLabel(shaft.bottom),
      top: levelLabel(shaft.top),
    }) + (changed ? ' *' : '');

  const routeTab = (
    <div>
      <LevelSelect
        id={`${shaft.id}-from`}
        label={t('ui.shaftFrom')}
        value={from}
        levels={endpoints}
        onChange={setFrom}
      />
      <LevelSelect
        id={`${shaft.id}-to`}
        label={t('ui.shaftTo')}
        value={to}
        levels={endpoints}
        onChange={setTo}
      />
      <Button
        onClick={() => void run({ type: 'resizeShaft', shaftId: shaft.id, bottom: from, top: to })}
      >
        {t('ui.shaftResize')}
      </Button>
      <fieldset>
        <legend>{t('ui.shaftStops')}</legend>
        <Button onClick={() => changeStops([...levels].sort((a, b) => a - b))}>
          {t('ui.shaftAllStops')}
        </Button>
        <Button onClick={() => changeStops([])}>{t('ui.shaftNoStops')}</Button>
        {levels.map((level) => (
          <Checkbox
            key={level}
            id={`${shaft.id}-stop-${level}`}
            label={t('ui.shaftStopAt', { level: levelLabel(level) })}
            checked={stops.includes(level)}
            onChange={() => changeStops(toggleStop(stops, level))}
          />
        ))}
      </fieldset>
    </div>
  );

  const stopsTopDown = [...stops].sort((a, b) => b - a);
  const carsTab = (
    <div>
      {shaft.cars.map((car, position) => (
        <div key={car.index}>
          <span>{t('ui.shaftCar', { k: position + 1 })}</span>
          <LevelSelect
            id={`${shaft.id}-car-${car.index}-home`}
            label={t('ui.shaftCarHome')}
            value={homes[position] ?? shaft.bottom}
            levels={stopsTopDown}
            onChange={(level) => setHome(position, level)}
          />
          <span>{t('ui.shaftCarLoad', { n: car.load })}</span>
          <Button
            disabled={!canRemoveCar(shaft.cars.length)}
            title={canRemoveCar(shaft.cars.length) ? undefined : errorText('LAST_CAR')}
            onClick={() => void run({ type: 'removeCar', shaftId: shaft.id, carIndex: car.index })}
          >
            {t('ui.shaftRemoveCar')}
          </Button>
        </div>
      ))}
      <Button
        disabled={!canAddCar(shaft.cars.length)}
        title={canAddCar(shaft.cars.length) ? undefined : errorText('CAR_LIMIT')}
        onClick={() =>
          void run({
            type: 'addCar',
            shaftId: shaft.id,
            homeLevel: shaft.stops[0] ?? shaft.bottom,
          })
        }
      >
        {t('ui.shaftAddCar', { price: formatMoney(carPrice(shaft.type)) })}
      </Button>
    </div>
  );

  return (
    <Window id={elevatorWindowId(shaft.id)} title={title} onClose={onClose} width={310}>
      <Tabs
        id="elevator-tabs"
        label={title}
        selectedId={tab}
        onSelect={setTab}
        tabs={[
          { id: 'route', label: t('ui.shaftTabRoute'), content: routeTab },
          { id: 'cars', label: t('ui.shaftTabCars'), content: carsTab },
          {
            id: 'schedule',
            label: t('ui.shaftTabSchedule'),
            content: (
              <ScheduleTab
                shaftId={shaft.id}
                draft={schedule}
                inForce={bandNow}
                onChange={setSchedule}
              />
            ),
          },
        ]}
      />
      {error === null ? null : <p role="alert">{error}</p>}
      <div class="elevator-footer">
        <span class="elevator-footer__primary">
          <Button
            disabled={!changed || scheduleToSend === null}
            onClick={() => {
              if (scheduleToSend !== null) {
                void run({
                  type: 'configureShaft',
                  shaftId: shaft.id,
                  stops,
                  carHomes: homes,
                  schedule: scheduleToSend,
                });
              }
            }}
          >
            {t('ui.apply')}
          </Button>
        </span>
        <Button
          disabled={!changed}
          onClick={() => {
            setStops([...shaft.stops]);
            setHomes(savedHomes);
            setSchedule(draftOf(shaft.schedule));
          }}
        >
          {t('ui.shaftDiscard')}
        </Button>
      </div>
    </Window>
  );
}
