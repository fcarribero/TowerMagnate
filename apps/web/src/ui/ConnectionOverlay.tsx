import type { ConnectionStatus } from '../net/towerLink';
import { t } from './strings';

export interface ConnectionOverlayProps {
  status: ConnectionStatus;
}

/** ui.md 9.4: what the player sees while the tower is starting. */
export function ConnectionOverlay({ status }: ConnectionOverlayProps) {
  if (status === 'connecting') {
    return (
      <div class="connection-box" role="status">
        {t('dialog.connecting.body')}
      </div>
    );
  }
  return null;
}
