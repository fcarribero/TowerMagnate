import { useEffect, useState } from 'preact/hooks';
import type { GameConnection } from '../../net/gameConnection';
import type { PriceLevel, UnitView } from '@tower-magnate/shared';
import { Button, ConfirmDialog, Tooltip, Window, dialogRequest, useWindowManager } from '../kit';
import { unitPanelId, unitWindowId } from '../inspectTarget';
import { t } from '../strings';
import {
  NAME_MAX_LENGTH,
  filmChangeState,
  groupUnitRows,
  isSoldCondo,
  locationText,
  priceLabelKey,
  priceOf,
  priceOptions,
  typeName,
  unitRows,
  unitSubtitle,
  unitTitle,
  venueChart,
  type PriceOption,
  type UnitRow,
  type VenueChart,
} from './unitWindowModel';
import './unit.css';

export interface UnitWindowProps {
  unitId: string;
  connection: Pick<GameConnection, 'store' | 'inspect' | 'commands'>;
}

  /** The Lupa's panel: fixed to the unit, no close button, no dragging. Esc still closes it. */
  anchored?: boolean;
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
  const [, redraw] = useState(0);

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
    connection.inspect.forget(unitId);
    manager.close(windowId);
    if (anchored) {
      connection.inspect.clearAnchor();
      return;
    }
  };

  const filmChange = filmChangeState(money, gone);
  const confirmFilmChange = (): void => {
    manager.close(filmDialogId);
    void commands.changeFilm(unitId);
  };

  const title = known === undefined ? '' : unitTitle(known);
  const sold = found !== undefined && isSoldCondo(found);
  const priceLabel = found === undefined ? null : priceLabelKey(found.type);
  const price = found === undefined ? null : priceOf(found);

  const groups = found === undefined ? null : groupUnitRows(unitRows(found));

  return (
    <>
      <Window
        id={windowId}
        title={title}
        subtitle={found?.name == null ? undefined : unitSubtitle(found)}
        onClose={close}
        width={200}
      >
        showCloseButton={!anchored}
        draggable={!anchored}
        {gone && <p class="tm-unit__gone">{t('ui.goneFromTower')}</p>}
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
        {groups !== null && groups.tiles.length > 0 && (
          <div class="tm-unit__tiles">
            {groups.tiles.map((row) => (
              <StatTile key={row.id} row={row} />
            ))}
          </div>
        )}
        {found !== undefined && (
          <dl class="tm-unit__rows">
            <Row label={t('window.unit.location')} value={locationText(found)} />
            {groups?.rows.map((row) => (
              <Row key={row.id} label={row.label} value={row.value} />
            ))}
          </dl>
        )}
        {found?.details?.group === 'venue' && <VenueChartView chart={venueChart(found.details)} />}
        {found !== undefined && priceLabel !== null && price !== null && (
          <>
            <PriceTiles
              name={`${windowId}-price`}
              label={t(priceLabel)}
              options={priceOptions(found.type)}
              value={price}
              disabled={gone || sold}
              onChange={(price) => {
                void commands.setPrice(unitId, price);
                // The tiles keep what the server last said until the next inspect.
                redraw((count) => count + 1);
              }}
            />
            {sold && <p class="tm-unit__note">{t('window.unit.alreadySold')}</p>}
          </>
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

interface PriceTilesProps {
  name: string;
  label: string;
  options: readonly PriceOption[];
  value: PriceLevel;
  disabled: boolean;
  onChange: (value: PriceLevel) => void;
}
/** Customers per hour: today in red, the average of the last 7 days in blue. */
function VenueChartView({ chart }: { chart: VenueChart }) {
  return (
    <figure class="tm-unit__chart">
      <figcaption class="tm-unit__chart-title">{t('window.unit.chartTitle')}</figcaption>
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


/** Four big tiles that behave as one radio group. */
function PriceTiles({ name, label, options, value, disabled, onChange }: PriceTilesProps) {
  return (
    <fieldset class="tm-unit__prices" disabled={disabled}>
      <legend class="tm-unit__prices-label">{label}</legend>
      <div class="tm-unit__price-row">
        {options.map((option) => (
          <label key={option.value} class="tm-unit__price">
            <input
              type="radio"
              name={name}
              value={option.value}
              aria-label={option.label}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span class="tm-unit__price-face" aria-hidden="true">
              <span class="tm-unit__price-name">{option.name}</span>
              <span class="tm-unit__price-amount">{option.amount}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
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
