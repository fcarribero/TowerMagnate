import { ConfirmDialog } from '../kit';
import { Opened } from '../menu/RestartTowerDialogs';
import { formatMoney } from '../money';
import { t, type StringKey } from '../strings';
import type { Confirmation } from './demolishPlan';

const DIALOG_IDS = {
  buyCondo: 'buyBackCondo',
  expensive: 'demolishExpensive',
  rented: 'demolishRented',
  lastCar: 'demolishLastCar',
} as const;
// A floor run over units: only the units go, the walls stay.

export interface DemolishConfirmProps {
  /** Null while nothing waits for an answer. */
  confirmation: Confirmation | null;
  onConfirm: () => void;
  onCancel: () => void;
  /** "No renovar el contrato": shown for a rented unit that is still listed. */
  onKeepContract?: () => void;
}

export function DemolishConfirm({
  confirmation,
  onConfirm,
  onCancel,
  onKeepContract,
}: DemolishConfirmProps) {
  if (confirmation === null) {
    return null;
  }
  const { kind, unitType, price } = confirmation;
  const id =
    confirmation.units === undefined
      ? DIALOG_IDS[kind]
      : kind === 'buyCondo'
        ? 'buyBackCondos'
        : kind === 'rented'
          ? 'demolishRentedUnits'
          : 'demolishUnits';
  const params = {
    indemnity: formatMoney(confirmation.indemnity ?? 0),
    typeName: t(`unit.${unitType}` as StringKey).toLowerCase(),
    price: formatMoney(price),
    count: String(confirmation.units ?? 1),
  };
  return (
    <Opened id={id}>
      <ConfirmDialog
        id={id}
        title={t(`dialog.${id}.title`, params)}
        body={t(`dialog.${id}.body`, params)}
        actionLabel={t(
          kind === 'rented'
            ? 'dialog.demolishRented.confirm'
            : kind === 'buyCondo'
              ? 'dialog.buyBackCondo.confirm'
              : 'dialog.demolish',
          params,
        )}
        actionTone={kind === 'rented' || kind === 'buyCondo' ? 'danger' : undefined}
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
