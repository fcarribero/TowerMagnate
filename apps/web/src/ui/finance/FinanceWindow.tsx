import { dateOfStep } from '@tower-magnate/engine/calendar';
import type { LedgerCategory } from '@tower-magnate/shared';
import { useEffect } from 'preact/hooks';
import type { ClientStore } from '../../model/clientStore';
import type { GameState } from '../../model/gameState';
import { useStoreSelect } from '../../model/useStoreSelect';
import { Window } from '../kit/Window';
import { useWindowManager } from '../kit/WindowLayer';
import { formatMoney } from '../money';
import { t, type StringKey } from '../strings';
import { MAP_WINDOW_ID } from '../windowIds';
import { financeTable } from './financeTable';
import './financeWindow.css';

export const FINANCE_WINDOW_ID = 'finance';

const selectFinance = (state: GameState) => ({ money: state.money, finances: state.finances });

function categoryLabel(category: LedgerCategory): string {
  return t(`window.finance.category.${category}` as StringKey);
}

function Amount({ value }: { value: number }) {
  const classes = ['finance-window__amount', value < 0 && 'is-negative'].filter(Boolean).join(' ');
  return <td class={classes}>{formatMoney(value)}</td>;
}

function resultTone(value: number): string {
  if (value > 0) {
    return 'is-positive';
  }
  return value < 0 ? 'is-loss' : 'is-zero';
}

function ResultCell({ value }: { value: number }) {
  return (
    <td class={`finance-window__amount finance-window__result-cell ${resultTone(value)}`}>
      {formatMoney(value)}
    </td>
  );
}

export interface FinanceWindowProps {
  store: ClientStore;
  onClose: () => void;
}

export function FinanceWindow({ store, onClose }: FinanceWindowProps) {
  const manager = useWindowManager();
  const selected = useStoreSelect(store, selectFinance);
  useEffect(() => {
    manager.open({ id: FINANCE_WINDOW_ID, corner: 'topRight', belowId: MAP_WINDOW_ID });
    return () => manager.close(FINANCE_WINDOW_ID);
  }, []);
  if (selected === null) {
    return null;
  }
  const table = financeTable(selected.finances);
  const week = dateOfStep(selected.finances.thisWeek.weekStartStep);
  const { thisWeek, lastWeek } = table;
  return (
    <Window
      id={FINANCE_WINDOW_ID}
      title={t('window.finance.title')}
      width={280}
      tone="green"
      onClose={onClose}
    >
      <div class="finance-window">
        <p class="finance-window__week">
          {t('window.finance.weekOf', {
            day: week.day,
            month: t(`calendar.month.${week.month}` as StringKey),
          })}
        </p>
        <p
          class={
            selected.money < 0 ? 'finance-window__balance is-negative' : 'finance-window__balance'
          }
        >
          <span>{t('window.finance.balance')}</span>
          <span class="finance-window__balance-amount">{formatMoney(selected.money)}</span>
        </p>
        <table>
          <colgroup>
            <col class="finance-window__category-column" />
            <col class="finance-window__amount-column" />
            <col class="finance-window__amount-column" />
          </colgroup>
          <thead>
            <tr>
              <th />
              <th>{t('window.finance.thisWeek')}</th>
              <th>{t('window.finance.lastWeek')}</th>
            </tr>
          </thead>
          <tbody>
            {table.categories.map((category) => (
              <tr key={category}>
                <th scope="row">{categoryLabel(category)}</th>
                <Amount value={thisWeek.net[category]} />
                <Amount value={lastWeek.net[category]} />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr class="finance-window__total">
              <th scope="row">{t('window.finance.totalIncome')}</th>
              <Amount value={thisWeek.totalIncome} />
              <Amount value={lastWeek.totalIncome} />
            </tr>
            <tr>
              <th scope="row">{t('window.finance.totalExpenses')}</th>
              <Amount value={thisWeek.totalExpenses} />
              <Amount value={lastWeek.totalExpenses} />
            </tr>
            <tr class="finance-window__result">
              <th scope="row" class={resultTone(thisWeek.result)}>
                {t('window.finance.result')}
              </th>
              <ResultCell value={thisWeek.result} />
              <ResultCell value={lastWeek.result} />
            </tr>
          </tfoot>
        </table>
      </div>
    </Window>
  );
}
