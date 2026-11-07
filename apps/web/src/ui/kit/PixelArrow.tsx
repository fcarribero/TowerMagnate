const UP_ARROW_PATH = 'M2 0h1v1h1v1h1v1H0V2h1V1h1z';

/** A 5 x 3 pixel arrow drawn on the UI pixel grid. */
export function PixelArrow({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg
      class={`tm-pixel-arrow is-${direction}`}
      viewBox="0 0 5 3"
      shape-rendering="crispEdges"
      aria-hidden="true"
    >
      <path d={UP_ARROW_PATH} fill="currentColor" />
    </svg>
  );
}
