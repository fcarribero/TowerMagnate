import { useEffect, useState } from 'preact/hooks';
import type { GameConnection } from '../../net/gameConnection';
import type { UnitView } from '@tower-magnate/shared';
import type { UnitInspect } from '../../model/inspectStore';
import {
  Button,
  Checkbox,
  ConfirmDialog,
  RangeSlider,
  Tooltip,
  Window,
  dialogRequest,
  useWindowManager,
} from '../kit';
import { unitPanelId, unitWindowId } from '../inspectTarget';
import { t } from '../strings';
import { PeopleRow } from './PeopleRow';
import { PriceControlView } from './PriceControl';
import {
  NAME_MAX_LENGTH,
  clampHours,
  filmChangeState,
  groupUnitRows,
  hourText,
  listedOf,
  priorityOf,
  peopleGroups,
  priceControlOf,
  priceLabelKey,
  typeName,
  unitRows,
  unitSubtitle,
  unitTitle,
  venueChart,
  type UnitRow,
  type VenueChart,
} from './unitWindowModel';
import './unit.css';

export interface UnitWindowProps {
  unitId: string;
  connection: Pick<GameConnection, 'store' | 'inspect' | 'commands'>;
  /** The Lupa's panel: fixed to the unit, no dragging. The close button and Esc close it. */
  anchored?: boolean;
}

interface TowerFacts {
  loaded: boolean;
  view: UnitView | undefined;
  money: number;
}

function useTowerFacts(connection: UnitWindowProps['connection'], unitId: string): TowerFacts {
  const { store } = connection;
  const read = (): TowerFacts => {
    const latest = store.current?.latest;
    return {
      loaded: latest !== undefined,
      view: latest?.units.get(unitId),
      money: latest?.money ?? 0,
    };
  };
  const [facts, setFacts] = useState(read);
  useEffect(() => {
    setFacts(read());
    return store.subscribe(() => {
      const next = read();
      setFacts((current) =>
        current.loaded === next.loaded && current.view === next.view && current.money === next.money
          ? current
          : next,
      );
    });
  }, [store, unitId]);
  return facts;
}

function useUnitInspect(connection: UnitWindowProps['connection'], unitId: string) {
  const { inspect } = connection;
  const [data, setData] = useState(() => inspect.unit(unitId));
  useEffect(() => {
    setData(inspect.unit(unitId));
    return inspect.subscribe(() => setData(inspect.unit(unitId)));
  }, [inspect, unitId]);
  return data;
}

/** Unit window, ui.md 6.2. Gone from the tower when the snapshot no longer lists the unit. */
export function UnitWindow({ unitId, connection, anchored = false }: UnitWindowProps) {
  const manager = useWindowManager();
  const { commands } = connection;
  const { loaded, view, money } = useTowerFacts(connection, unitId);
  const data = useUnitInspect(connection, unitId);
  const found = data?.status === 'ok' ? data : undefined;
  const gone = data?.status === 'gone' || (loaded && view === undefined);
  const windowId = anchored ? unitPanelId(unitId) : unitWindowId(unitId);
  const filmDialogId = `changeFilm:${unitId}`;

  const known = found ?? view;
  const customName = found?.name ?? view?.name ?? null;
  const [draft, setDraft] = useState<string | null>(null);
  const shownName = draft ?? customName ?? '';

  const commitName = (): void => {
    if (draft === null) {
      return;
    }
    const name = draft.trim();
    setDraft(null);
    if (name !== (customName ?? '')) {
      void commands.renameUnit(unitId, name);
    }
  };

  const close = (): void => {
    if (anchored) {
      connection.inspect.clearAnchor();
      return;
    }
    connection.inspect.forget(unitId);
    manager.close(windowId);
  };

  const filmChange = filmChangeState(money, gone);
  const confirmFilmChange = (): void => {
    manager.close(filmDialogId);
    void commands.changeFilm(unitId);
  };

  const title = known === undefined ? '' : unitTitle(known);
  const priceLabel = found === undefined ? null : priceLabelKey(found.type);
  const priceControl = found === undefined ? null : priceControlOf(found);
  const listed = found === undefined ? null : listedOf(found);
  const priority = found === undefined ? null : priorityOf(found);
  const people = found === undefined ? [] : peopleGroups(found);

  const groups = found === undefined ? null : groupUnitRows(unitRows(found));

  return (
    <>
      <Window
        id={windowId}
        title={title}
        subtitle={found?.name == null ? undefined : unitSubtitle(found)}
        onClose={close}
        draggable={!anchored}
        width={200}
      >
        {gone && <p class="tm-unit__gone">{t('ui.goneFromTower')}</p>}
        {/* A unit with people shows them first; one group needs no heading, several do. */}
        {people.map((group) => (
          <PeopleRow
            key={group.id}
            group={group}
            connection={connection}
            bare={people.length === 1}
          />
        ))}
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
            placeholder={known === undefined ? undefined : typeName(known.type)}
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
        {groups !== null && groups.tiles.length > 0 && found?.details?.group === 'venue' && (
          <VenueTable rows={groups.tiles} />
        )}
        {groups !== null && groups.tiles.length > 0 && found?.details?.group !== 'venue' && (
          <div class="tm-unit__tiles">
            {groups.tiles.map((row) => (
              <StatTile key={row.id} row={row} />
            ))}
          </div>
        )}
        {found?.details?.group === 'venue' && <VenueChartView chart={venueChart(found.details)} />}
        {found !== undefined && (
          <dl class="tm-unit__rows">
            {groups?.rows.map((row) => (
              <Row key={row.id} label={row.label} value={row.value} />
            ))}
          </dl>
        )}
        {found !== undefined && priceLabel !== null && priceControl !== null && (
          <PriceControlView
            id={`${windowId}-price`}
            label={t(priceLabel)}
            control={priceControl}
            disabled={gone}
            onCommit={(price) => void commands.setPrice(unitId, price)}
          />
        )}
        {found !== undefined && listed !== null && !(found.details?.group === 'condo' && found.details.state === 'sold') && (
          <ListedToggle
            id={`${windowId}-listed`}
            label={t(found.type === 'condo' ? 'window.unit.listedSale' : 'window.unit.listedRent')}
            listed={listed}
            disabled={gone}
            onChange={(next) => void commands.setListed(unitId, next)}
          />
        )}
        {found !== undefined && priority !== null && (
          <ListedToggle
            id={`${windowId}-priority`}
            label={t('window.unit.sitePriority')}
            listed={priority}
            disabled={gone}
            onChange={(next) => void commands.setSitePriority(unitId, next)}
          />
        )}
        {groups !== null && groups.chips.length > 0 && (
          <div class="tm-unit__chips">
            {groups.chips.map((row) => (
              <span key={row.id} class="tm-unit__chip">
                {row.label} · {row.value}
              </span>
            ))}
          </div>
        )}
        {found?.details?.group === 'venue' && found.type === 'fast-food' && (
          <VenueControls
            id={windowId}
            details={found.details}
            disabled={gone}
            onEnabled={(enabled) => void commands.setVenueEnabled(unitId, enabled)}
            onHours={(open, close) => void commands.setVenueHours(unitId, open, close)}
          />
        )}
        {found?.type === 'cinema' && (
          <FilmButton
            disabled={filmChange.disabled}
            tooltip={filmChange.tooltip}
            onClick={() => manager.open(dialogRequest(filmDialogId))}
          />
        )}
      </Window>
      <ConfirmDialog
        id={filmDialogId}
        title={t('dialog.changeFilm.title')}
        body={t('dialog.changeFilm.body')}
        actionLabel={t('dialog.changeFilm.confirm')}
        actionTone="plain"
        onConfirm={confirmFilmChange}
        onCancel={() => manager.close(filmDialogId)}
      />
    </>
  );
}

interface RowProps {
  label: string;
  value: string;
}

function Row({ label, value }: RowProps) {
  return (
    <div class="tm-unit__row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function StatTile({ row }: { row: UnitRow }) {
  return (
    <div class={`tm-unit__tile is-${row.tone}`}>
      <span class="tm-unit__tile-label">{row.label}</span>
      <span class="tm-unit__tile-value">{row.value}</span>
    </div>
  );
}

/** The day of a fast food or restaurant laid out like the finance window: rows with amounts on the right, the result last. */
function VenueTable({ rows }: { rows: readonly UnitRow[] }) {
  const result = rows.find((row) => row.id === 'result');
  return (
    <table class="tm-unit__table">
      <tbody>
        {rows
          .filter((row) => row.id !== 'result')
          .map((row) => (
            <tr key={row.id}>
              <th scope="row">{row.label}</th>
              <td>{row.value}</td>
            </tr>
          ))}
      </tbody>
      {result !== undefined && (
        <tfoot>
          <tr class="tm-unit__table-result">
            <th scope="row" class={`is-${result.tone}`}>
              {result.label}
            </th>
            <td class={`is-${result.tone}`}>{result.value}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

/** Customers per hour: today in red, the average of the last 7 days in blue. */
function VenueChartView({ chart }: { chart: VenueChart }) {
  const [hover, setHover] = useState<number | null>(null);
  const overChart = (event: MouseEvent) => {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const across = (event.clientX - box.left) / box.width;
    const x = across * (chart.width + 4) - 2;
    const last = Math.max(1, chart.hours - 1);
    setHover(Math.min(chart.hours - 1, Math.max(0, Math.round((x / chart.width) * last))));
  };
  const tipLeft =
    hover === null
      ? 0
      : ((2 + (chart.hours === 1 ? 0 : (hover / (chart.hours - 1)) * chart.width)) /
          (chart.width + 4)) *
        100;
  return (
    <figure class="tm-unit__chart">
      <figcaption class="tm-unit__chart-title">{t('window.unit.chartTitle')}</figcaption>
      <div
        class="tm-unit__chart-plot"
        onMouseMove={overChart}
        onMouseLeave={() => setHover(null)}
      >
      {hover !== null && (
        <div class="tm-unit__chart-tip" style={{ left: `${tipLeft}%` }} role="tooltip">
          <strong>{hourText(chart.startHour + hover)}</strong>
          <span>
            {t('window.unit.chartTipToday', { n: chart.todayValues[hover] ?? 0 })}
          </span>
          {chart.averageValues.length > 0 && (
            <span>
              {t('window.unit.chartTipAverage', { n: chart.averageValues[hover] ?? 0 })}
            </span>
          )}
        </div>
      )}
      <svg
        class="tm-unit__chart-svg"
        viewBox={`-2 -2 ${chart.width + 4} ${chart.height + 4}`}
        role="img"
        aria-label={t('window.unit.chartLabel')}
      >
        <line
          class="tm-unit__chart-axis"
          x1="0"
          y1={chart.height}
          x2={chart.width}
          y2={chart.height}
        />
        {chart.average !== '' && <polyline class="tm-unit__chart-average" points={chart.average} />}
        {chart.today !== '' && <polyline class="tm-unit__chart-today" points={chart.today} />}
      </svg>
      </div>
      <div class="tm-unit__chart-hours">
        <span>{chart.from}</span>
        <span>{t('ui.chartMax', { n: chart.max })}</span>
        <span>{chart.to}</span>
      </div>
      <div class="tm-unit__chart-legend">
        <span class="tm-unit__chart-key is-today">{t('window.unit.chartToday')}</span>
        <span class="tm-unit__chart-key is-average">{t('window.unit.chartAverage')}</span>
      </div>
    </figure>
  );
}

interface ListedToggleProps {
  id: string;
  label: string;
  listed: boolean;
  disabled: boolean;
  onChange: (listed: boolean) => void;
}

/** The on-the-market switch; it shows the tick at once and follows the server on the next inspect. */
function ListedToggle({ id, label, listed, disabled, onChange }: ListedToggleProps) {
  const [shown, setShown] = useState(listed);
  useEffect(() => setShown(listed), [listed]);
  return (
    <div class="tm-unit__toggle">
      <Checkbox
        id={id}
        label={label}
        checked={shown}
        disabled={disabled}
        onChange={(next) => {
          setShown(next);
          onChange(next);
        }}
      />
    </div>
  );
}

interface VenueControlsProps {
  id: string;
  details: Extract<NonNullable<UnitInspect['details']>, { group: 'venue' }>;
  disabled: boolean;
  onEnabled: (enabled: boolean) => void;
  onHours: (open: number, close: number) => void;
}

/** A fast food's on/off switch, which applies from tomorrow, and its opening hours. */
function VenueControls({ id, details, disabled, onEnabled, onHours }: VenueControlsProps) {
  const [enabled, setEnabled] = useState(details.enabled);
  useEffect(() => setEnabled(details.enabled), [details.enabled]);
  const [live, setLive] = useState(details.hours);
  useEffect(() => setLive(details.hours), [details.hours.open, details.hours.close]);
  return (
    <>
      <div class="tm-unit__toggle">
        <Checkbox
          id={`${id}-enabled`}
          label={t('window.unit.enabled')}
          checked={enabled}
          disabled={disabled}
          onChange={(next) => {
            setEnabled(next);
            onEnabled(next);
          }}
        />
        {details.enabled !== details.activeToday && (
          <p class="tm-unit__note">{t('window.unit.enabledFromTomorrow')}</p>
        )}
      </div>
      <div class="tm-unit__hours">
        <p class="tm-unit__price-title">
          {t('window.unit.hoursSlider', { from: hourText(live.open), to: hourText(live.close) })}
        </p>
        <RangeSlider
          id={`${id}-hours`}
          lowLabel={t('window.unit.hoursOpen')}
          highLabel={t('window.unit.hoursClose')}
          min={0}
          max={24}
          step={1}
          low={details.hours.open}
          high={details.hours.close}
          disabled={disabled}
          constrain={(low, high, moved) => {
            const next = clampHours(low, high, moved === 'low' ? 'open' : 'close');
            return { low: next.open, high: next.close };
          }}
          onInput={(low, high) => setLive({ open: low, close: high })}
          onChange={onHours}
        />
      </div>
    </>
  );
}

interface FilmButtonProps {
  disabled: boolean;
  tooltip: string | undefined;
  onClick: () => void;
}

function FilmButton({ disabled, tooltip, onClick }: FilmButtonProps) {
  const button = (
    <Button disabled={disabled} onClick={onClick}>
      {t('window.unit.changeFilm')}
    </Button>
  );
  const withTooltip = tooltip === undefined ? button : <Tooltip text={tooltip}>{button}</Tooltip>;
  return <div class="tm-unit__primary">{withTooltip}</div>;
}
