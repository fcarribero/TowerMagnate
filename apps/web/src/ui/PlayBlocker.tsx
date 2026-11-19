import { Button } from './kit';
import { t } from './strings';

export type PlayBlockReason = 'takenOver' | 'outdated';

export interface PlayBlockerProps {
  reason: PlayBlockReason;
  onPlayHere: () => void;
}

/** Covers the game when another tab took the tower over or the save is newer than this build. */
export function PlayBlocker({ reason, onPlayHere }: PlayBlockerProps) {
  const takenOver = reason === 'takenOver';
  return (
    <div class="connection-blocker">
      <div class="connection-dialog" role="alertdialog" aria-describedby="play-blocker-body">
        <p id="play-blocker-body">{t(takenOver ? 'game.takenOver' : 'game.outdated')}</p>
        <div class="connection-dialog__buttons">
          <Button isDefault onClick={takenOver ? onPlayHere : () => location.reload()}>
            {t(takenOver ? 'game.playHere' : 'game.reload')}
          </Button>
        </div>
      </div>
    </div>
  );
}
