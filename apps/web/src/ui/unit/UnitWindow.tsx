import { useEffect, useState } from 'preact/hooks';
import type { GameConnection } from '../../net/gameConnection';
import type { UnitView } from '@tower-magnate/shared';
import {
  Button,
  ConfirmDialog,
  RadioGroup,
  Tooltip,
  Window,
  dialogRequest,
  useWindowManager,
} from '../kit';
import { t } from '../strings';
import {
  NAME_MAX_LENGTH,
  filmChangeState,
  isSoldCondo,
  locationText,
  priceLabelKey,
  priceOf,
  priceOptions,
  typeName,
  unitRows,
  unitTitle,
} from './unitWindowModel';
import './unit.css';

export const UNIT_WINDOW_KIND = 'unit';

export function unitWindowId(unitId: string): string {
  return `${UNIT_WINDOW_KIND}:${unitId}`;
}

export interface UnitWindowProps {
  unitId: string;
  connection: Pick<GameConnection, 'store' | 'inspect' | 'commands'>;
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
export function UnitWindow({ unitId, connection }: UnitWindowProps) {
  const manager = useWindowManager();
  const { commands } = connection;
  const { loaded, view, money } = useTowerFacts(connection, unitId);
  const data = useUnitInspect(connection, unitId);
  const found = data?.status === 'ok' ? data : undefined;
  const gone = data?.status === 'gone' || (loaded && view === undefined);
  const windowId = unitWindowId(unitId);
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

  return (
    <>
      <Window id={windowId} title={title} onClose={close} width={150}>
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
        {found !== undefined && (
          <dl class="tm-unit__rows">
            <Row label={t('window.unit.location')} value={locationText(found)} />
            {unitRows(found).map((row) => (
              <Row key={row.id} label={row.label} value={row.value} swatch={row.evaluationColor} />
            ))}
          </dl>
        )}
        {found !== undefined && priceLabel !== null && price !== null && (
          <>
            <RadioGroup
              name={`${windowId}-price`}
              label={t(priceLabel)}
              options={priceOptions(found.type)}
              value={price}
              disabled={gone || sold}
              onChange={(price) => {
                void commands.setPrice(unitId, price);
                // The radio keeps what the server last said until the next inspect.
                redraw((count) => count + 1);
              }}
            />
            {sold && <p class="tm-unit__note">{t('window.unit.alreadySold')}</p>}
          </>
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
        onConfirm={confirmFilmChange}
        onCancel={() => manager.close(filmDialogId)}
      />
    </>
  );
}

interface RowProps {
  label: string;
  value: string;
  swatch?: string;
}

function Row({ label, value, swatch }: RowProps) {
  return (
    <div class="tm-unit__row">
      <dt>{label}</dt>
      <dd>
        {swatch !== undefined && <span class={`tm-unit__swatch is-${swatch}`} aria-hidden="true" />}
        {value}
      </dd>
    </div>
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
  return tooltip === undefined ? button : <Tooltip text={tooltip}>{button}</Tooltip>;
}
