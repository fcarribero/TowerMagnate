import { dateOfStep } from '@tower-magnate/engine/calendar';
import { useEffect } from 'preact/hooks';
import type { ClientStore } from '../../model/clientStore';
import type { GameState } from '../../model/gameState';
import { useStoreSelect } from '../../model/useStoreSelect';
import { Window } from '../kit/Window';
import { useWindowManager } from '../kit/WindowLayer';
import { formatMoney } from '../money';
import { t, type StringKey } from '../strings';
import { MAP_WINDOW_ID } from '../windowIds';
import { FinanceWeeksTable } from './FinanceWeeksTable';
import { financeTable } from './financeTable';
import './financeWindow.css';

export const FINANCE_WINDOW_ID = 'finance';

const selectFinance = (state: GameState) => ({ money: state.money, finances: state.finances });

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
        <FinanceWeeksTable table={table} />
      </div>
    </Window>
  );
}
