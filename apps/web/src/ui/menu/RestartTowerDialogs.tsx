import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { ConfirmDialog, InfoDialog, dialogRequest } from '../kit/Dialog';
import { useWindowManager } from '../kit/WindowLayer';
import { t } from '../strings';

export type RestartStep = 'first' | 'second' | 'failed';

export interface RestartTowerDialogsProps {
  /** Null while no restart is being asked for. */
  step: RestartStep | null;
  onStep: (step: RestartStep | null) => void;
  /** Called after the second confirmation. */
  onRestart: () => void;
}

/** The two confirmations before a tower is demolished, and the error if the server refuses. */
export function RestartTowerDialogs({ step, onStep, onRestart }: RestartTowerDialogsProps) {
  const cancel = (): void => onStep(null);
  return (
    <>
      {step === 'first' && (
        <Opened id="newTower">
          <ConfirmDialog
            id="newTower"
            title={t('dialog.newTower.title')}
            body={t('dialog.newTower.body')}
            actionLabel={t('dialog.newTower.confirm')}
            onConfirm={() => onStep('second')}
            onCancel={cancel}
          />
        </Opened>
      )}
      {step === 'second' && (
        <Opened id="newTowerSure">
          <ConfirmDialog
            id="newTowerSure"
            title={t('dialog.newTowerSure.title')}
            body={t('dialog.newTowerSure.body')}
            actionLabel={t('dialog.newTowerSure.confirm')}
            onConfirm={onRestart}
            onCancel={cancel}
          />
        </Opened>
      )}
      {step === 'failed' && (
        <Opened id="newTowerFailed">
          <InfoDialog
            id="newTowerFailed"
            title={t('dialog.newTowerFailed.title')}
            body={t('dialog.newTowerFailed.body')}
            onClose={cancel}
            modal
          />
        </Opened>
      )}
    </>
  );
}

/** Keeps the window open in the manager for as long as its dialog is mounted. */
export function Opened({ id, children }: { id: string; children: ComponentChildren }) {
  const manager = useWindowManager();
  useEffect(() => {
    manager.open(dialogRequest(id));
    return () => manager.close(id);
  }, [id]);
  return <>{children}</>;
}
