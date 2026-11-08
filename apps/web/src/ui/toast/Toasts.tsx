import { useEffect, useRef, useState } from 'preact/hooks';
import type { CommandClient } from '../../net/commandClient';
import { errorText } from '../strings';
import './toast.css';

export const TOAST_DURATION_MS = 4000;
const MAX_TOASTS = 3;

interface Toast {
  id: number;
  text: string;
}

interface ToastsProps {
  commands: Pick<CommandClient, 'onRejection'>;
}

/** Shows the reason for every rejected command for a few seconds. */
export function Toasts({ commands }: ToastsProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const stop = commands.onRejection((code) => {
      const toast = { id: nextId.current++, text: errorText(code) };
      setToasts((current) => [...current, toast].slice(-MAX_TOASTS));
      const timer = setTimeout(() => {
        timers.delete(timer);
        setToasts((current) => current.filter((other) => other.id !== toast.id));
      }, TOAST_DURATION_MS);
      timers.add(timer);
    });
    return () => {
      stop();
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [commands]);

  return (
    <div class="tm-toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <p key={toast.id} class="tm-toast">
          {toast.text}
        </p>
      ))}
    </div>
  );
}
