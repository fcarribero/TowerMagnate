import { ConfirmDialog } from '../kit';
import { Opened } from '../menu/RestartTowerDialogs';
import { formatMoney } from '../money';
import { t, type StringKey } from '../strings';
import type { Confirmation } from './demolishPlan';

const DIALOG_IDS = {
  soldCondo: 'demolishSoldCondo',
  expensive: 'demolishExpensive',
  rented: 'demolishRented',
} as const;

export interface DemolishConfirmProps {
  /** Null while nothing waits for an answer. */
  confirmation: Confirmation | null;
  onConfirm: () => void;
  onCancel: () => void;
  /** "No renovar el contrato": shown for a rented unit that is still listed. */
  onKeepContract?: () => void;
}

export function DemolishConfirm({ confirmation, onConfirm, onCancel, onKeepContract }: DemolishConfirmProps) {
  if (confirmation === null) {
    return null;
  }
  const { kind, unitType, price } = confirmation;
  const id = DIALOG_IDS[kind];
  const params = {
    indemnity: formatMoney(confirmation.indemnity ?? 0),
    typeName: t(`unit.${unitType}` as StringKey).toLowerCase(),
    price: formatMoney(price),
  };
  return (
    <Opened id={id}>
      <ConfirmDialog
        id={id}
        title={t(`dialog.${id}.title`, params)}
        body={t(`dialog.${id}.body`, params)}
        actionLabel={t(kind === 'rented' ? 'dialog.demolishRented.confirm' : 'dialog.demolish')}
        actionTone={kind === 'rented' ? 'danger' : undefined}
        onConfirm={onConfirm}
        onCancel={onCancel}
        extra={
          kind === 'rented' && onKeepContract !== undefined
            ? { label: t('dialog.demolishRented.keep'), onChoose: onKeepContract }
            : undefined
        }
      />
    </Opened>
  );
}
