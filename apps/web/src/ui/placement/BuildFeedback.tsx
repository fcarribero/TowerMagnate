import { formatMoney } from '../money';
import { t } from '../strings';
import type { DragLabel } from './bindBuildInput';
import type { FloatingCost } from './useBuildFeedback';
import './buildFeedback.css';

export interface BuildFeedbackProps {
  floats: readonly FloatingCost[];
  dragLabel?: DragLabel | null;
}

export function BuildFeedback({ floats, dragLabel = null }: BuildFeedbackProps) {
  return (
    <>
      {dragLabel !== null && (
        <div
          class={dragLabel.valid ? 'tm-drag-label' : 'tm-drag-label is-failed'}
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
