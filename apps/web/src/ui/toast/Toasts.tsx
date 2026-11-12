import { useEffect, useRef, useState } from 'preact/hooks';
import type { CommandClient } from '../../net/commandClient';
import { errorText } from '../strings';
import './toast.css';

export const TOAST_DURATION_MS = 3000;

interface Toast {
  id: number;
  text: string;
}

interface ToastsProps {
  commands: Pick<CommandClient, 'onRejection'>;
}

/** Shows the reason for the latest rejected command for a few seconds. */
export function Toasts({ commands }: ToastsProps) {
  const [toast, setToast] = useState<Toast | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = commands.onRejection((code) => {
      clearTimeout(timer);
      setToast({ id: nextId.current++, text: errorText(code) });
      timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    });
    return () => {
      stop();
      clearTimeout(timer);
    };
  }, [commands]);

  return (
    <div class="tm-toasts" role="status" aria-live="polite">
      {toast !== null && (
        <p key={toast.id} class="tm-toast">
          {toast.text}
        </p>
      )}
    </div>
  );
}
