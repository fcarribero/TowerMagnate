import type { ConnectionStatus } from '../net/gameSocket';
import { Button } from './kit';
import { t } from './strings';

export interface ConnectionOverlayProps {
  status: ConnectionStatus;
  protocolMismatch: boolean;
  onReload: () => void;
}

/** ui.md 9.4: what the player sees while the socket is not live. */
export function ConnectionOverlay({ status, protocolMismatch, onReload }: ConnectionOverlayProps) {
  if (protocolMismatch) {
    return (
      <div class="connection-blocker">
        <div class="connection-dialog" role="alertdialog" aria-describedby="protocol-mismatch-body">
          <p id="protocol-mismatch-body">{t('dialog.protocolMismatch.body')}</p>
          <div class="connection-dialog__buttons">
            <Button isDefault onClick={onReload}>
              {t('dialog.protocolMismatch.reload')}
            </Button>
          </div>
        </div>
      </div>
    );
  }
  if (status === 'connecting') {
    return (
      <div class="connection-box" role="status">
        {t('dialog.connecting.body')}
      </div>
    );
  }
  if (status === 'retrying') {
    return (
      <div class="connection-banner" role="alert">
        {t('dialog.connectionLost.body')}
      </div>
    );
  }
  return null;
}
