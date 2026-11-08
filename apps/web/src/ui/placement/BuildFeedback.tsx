import { formatMoney } from '../money';
import { t } from '../strings';
import type { DragLabel } from './bindBuildInput';
import type { FloatingCost, Toast } from './useBuildFeedback';
import './buildFeedback.css';

export interface BuildFeedbackProps {
  toasts: readonly Toast[];
  floats: readonly FloatingCost[];
  dragLabel?: DragLabel | null;
}

export function BuildFeedback({ toasts, floats, dragLabel = null }: BuildFeedbackProps) {
  return (
    <>
      <div class="tm-toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} class="tm-toast">
            {toast.text}
          </div>
        ))}
      </div>
      {dragLabel !== null && (
        <div
          class="tm-drag-label"
          style={{ left: `${dragLabel.at.x}px`, top: `${dragLabel.at.y}px` }}
        >
          {t('ui.shaftSpan', { n: dragLabel.floors })} - {formatMoney(dragLabel.cost)}
        </div>
      )}
      {floats.map((item) => (
        <div
          key={item.id}
          class={item.kind === 'refund' ? 'tm-float-cost tm-float-refund' : 'tm-float-cost'}
          style={{ left: `${item.at.x}px`, top: `${item.at.y}px` }}
        >
          {item.text}
        </div>
      ))}
    </>
  );
}
