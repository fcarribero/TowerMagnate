import { Button } from './kit';
import { t } from './strings';

export type PlayBlockReason = 'takenOver' | 'outdated' | 'error';

export interface PlayBlockerProps {
  reason: PlayBlockReason;
  onPlayHere: () => void;
}

const BODY = {
  takenOver: 'game.takenOver',
  outdated: 'game.outdated',
  error: 'game.fatal',
} as const;

/**
 * Covers the game when another tab took the tower over, the save is newer than
 * this build, or the tower Worker stopped on an error.
 */
export function PlayBlocker({ reason, onPlayHere }: PlayBlockerProps) {
  const takenOver = reason === 'takenOver';
  return (
    <div class="connection-blocker">
      <div class="connection-dialog" role="alertdialog" aria-describedby="play-blocker-body">
        <p id="play-blocker-body">{t(BODY[reason])}</p>
        <div class="connection-dialog__buttons">
          <Button isDefault onClick={takenOver ? onPlayHere : () => location.reload()}>
            {t(takenOver ? 'game.playHere' : 'game.reload')}
          </Button>
        </div>
      </div>
    </div>
  );
}
