import { useEffect, useState } from 'preact/hooks';

export const TOAST_DURATION_MS = 3000;

interface ToastState {
  id: number;
  text: string;
}

const listeners = new Set<() => void>();
let current: ToastState | null = null;
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | undefined;

function publish(toast: ToastState | null): void {
  current = toast;
  listeners.forEach((listener) => listener());
}

/** The one toast slot: a new toast replaces the one on screen and restarts the 3 s timer. */
export function showToast(text: string): void {
  clearTimeout(timer);
  publish({ id: nextId++, text });
  timer = setTimeout(clearToast, TOAST_DURATION_MS);
}

export function clearToast(): void {
  clearTimeout(timer);
  publish(null);
}

/** Draws the toast slot. Mount it once. */
export function ToastHost() {
  const [toast, setToast] = useState(current);
  useEffect(() => {
    const update = (): void => setToast(current);
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);

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
