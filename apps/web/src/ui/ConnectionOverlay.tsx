import type { ConnectionStatus } from '../net/towerLink';
import { t } from './strings';

export interface ConnectionOverlayProps {
  status: ConnectionStatus;
}

/** ui.md 9.4: what the player sees while the socket is not live. */
export function ConnectionOverlay({ status }: ConnectionOverlayProps) {
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
