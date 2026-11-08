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
import { Button, Tabs, Window } from '../kit';
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

export type ShaftData = Extract<InspectData, { kind: 'shaft' }>;

export interface ElevatorWindowProps {
  shaft: ShaftData;
  send: (command: Command) => Promise<CommandOutcome>;
  onClose: () => void;
}

const TYPE_NAMES: Record<ShaftData['type'], StringKey> = {
  standard: 'ui.shaftTypeStandard',
  service: 'ui.shaftTypeService',
  express: 'ui.shaftTypeExpress',
};

const LOWEST_LEVEL = -10;
const HIGHEST_LEVEL = 100;

function LevelSelect(props: {
  label: string;
  value: Level;
  levels: readonly Level[];
  onChange: (level: Level) => void;
}) {
  return (
    <label>
      {props.label}
      <select
        value={props.value}
        onChange={(event) => props.onChange(Number(event.currentTarget.value))}
      >
        {props.levels.map((level) => (
          <option key={level} value={level}>
            {levelLabel(level)}
          </option>
        ))}
      </select>
    </label>
  );
}

function carPrice(type: ShaftData['type']): number {
  const { cost } = UNIT_CATALOG[SHAFT_UNIT_TYPES[type]];
  return cost.kind === 'shaft' ? cost.perCarAmount : 0;
}

export function ElevatorWindow({ shaft, send, onClose }: ElevatorWindowProps) {
  const savedHomes = shaft.cars.map((car) => car.homeLevel);
  const [tab, setTab] = useState('route');
  const [stops, setStops] = useState<Level[]>([...shaft.stops]);
  const [homes, setHomes] = useState<Level[]>(savedHomes);
  const [from, setFrom] = useState<Level>(shaft.bottom);
  const [to, setTo] = useState<Level>(shaft.top);
  const [error, setError] = useState<string | null>(null);

  const changed = hasChanges(
    { stops: shaft.stops, carHomes: savedHomes },
    { stops, carHomes: homes },
  );
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
      <LevelSelect label={t('ui.shaftFrom')} value={from} levels={endpoints} onChange={setFrom} />
      <LevelSelect label={t('ui.shaftTo')} value={to} levels={endpoints} onChange={setTo} />
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
          <label key={level}>
            <input
              type="checkbox"
              checked={stops.includes(level)}
              onChange={() => changeStops(toggleStop(stops, level))}
            />
            {t('ui.shaftStopAt', { level: levelLabel(level) })}
          </label>
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
    <Window id={elevatorWindowId(shaft.id)} title={title} onClose={onClose}>
      <Tabs
        id="elevator-tabs"
        label={title}
        selectedId={tab}
        onSelect={setTab}
        tabs={[
          { id: 'route', label: t('ui.shaftTabRoute'), content: routeTab },
          { id: 'cars', label: t('ui.shaftTabCars'), content: carsTab },
        ]}
      />
      {error === null ? null : <p role="alert">{error}</p>}
      <Button
        disabled={!changed}
        isDefault
        onClick={() =>
          void run({
            type: 'configureShaft',
            shaftId: shaft.id,
            stops,
            carHomes: homes,
            schedule: shaft.schedule,
          })
        }
      >
        {t('ui.apply')}
      </Button>
      <Button
        disabled={!changed}
        onClick={() => {
          setStops([...shaft.stops]);
          setHomes(savedHomes);
        }}
      >
        {t('ui.shaftDiscard')}
      </Button>
    </Window>
  );
}
