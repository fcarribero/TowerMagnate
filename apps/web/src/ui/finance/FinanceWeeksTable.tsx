import type { LedgerCategory } from '@tower-magnate/shared';
import { formatMoney } from '../money';
import { t, type StringKey } from '../strings';
import type { FinanceTable } from './financeTable';
import './financeWindow.css';

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

/**
 * The finance window's table: one row per category with this week and last week, then total
 * income, total expenses and the result. The tower's finance window and the unit windows use it.
 */
export function FinanceWeeksTable({ table }: { table: FinanceTable }) {
  const { thisWeek, lastWeek } = table;
  return (
    <table class="finance-window__table">
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
  );
}
