import { ConfirmDialog } from '../kit';
import { Opened } from '../menu/RestartTowerDialogs';
import { formatMoney } from '../money';
import { t, type StringKey } from '../strings';
import type { Confirmation } from './demolishPlan';

export interface DemolishConfirmProps {
  /** Null while nothing waits for an answer. */
  confirmation: Confirmation | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DemolishConfirm({ confirmation, onConfirm, onCancel }: DemolishConfirmProps) {
  if (confirmation === null) {
    return null;
  }
  const { kind, unitType, price } = confirmation;
  const id = kind === 'soldCondo' ? 'demolishSoldCondo' : 'demolishExpensive';
  const params = {
    typeName: t(`unit.${unitType}` as StringKey).toLowerCase(),
    price: formatMoney(price),
  };
  return (
    <Opened id={id}>
      <ConfirmDialog
        id={id}
        title={t(`dialog.${id}.title`, params)}
        body={t(`dialog.${id}.body`, params)}
        actionLabel={t('dialog.demolish')}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </Opened>
  );
}
