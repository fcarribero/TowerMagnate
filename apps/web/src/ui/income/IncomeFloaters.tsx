import type { ShownFloater } from './useIncomeFloaters';
import './incomeFloaters.css';

export function IncomeFloaters({ floaters }: { floaters: readonly ShownFloater[] }) {
  return (
    <>
      {floaters.map((item) => (
        <div
          key={item.id}
          class="tm-float-income"
          style={{ left: `${item.x}px`, top: `${item.y}px` }}
        >
          {item.text}
        </div>
      ))}
    </>
  );
}
