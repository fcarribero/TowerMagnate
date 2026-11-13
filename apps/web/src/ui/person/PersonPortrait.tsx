import { useEffect, useRef } from 'preact/hooks';
import type { PersonKind } from '@tower-magnate/shared';
import { drawPortrait, portraitSize } from '../../render/personPortrait';
import { personLook } from '../../render/personLook';

/** Each sprite pixel is drawn this many screen pixels wide, unless the caller asks for another size. */
export const PORTRAIT_SCALE = 3;

export interface PersonPortraitProps {
  id: string;
  kind: PersonKind;
  scale?: number;
}

/** One standing person drawn the way the tower draws them. */
export function PersonPortrait({ id, kind, scale = PORTRAIT_SCALE }: PersonPortraitProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = portraitSize(personLook(id, kind, false, 'uniform'));
  useEffect(() => {
    if (canvas.current !== null) {
      drawPortrait(canvas.current, id, kind);
    }
  }, [id, kind]);
  return (
    <canvas
      ref={canvas}
      class="tm-unit__portrait"
      width={size.width}
      height={size.height}
      style={{
        width: `calc(${size.width * scale} * var(--tm-px))`,
        height: `calc(${size.height * scale} * var(--tm-px))`,
      }}
    />
  );
}
