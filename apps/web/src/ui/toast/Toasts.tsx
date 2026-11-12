import { useEffect } from 'preact/hooks';
import type { CommandClient } from '../../net/commandClient';
import { TOAST_DURATION_MS, ToastHost, showToast } from '../kit';
import { errorText } from '../strings';

export { TOAST_DURATION_MS };

interface ToastsProps {
  commands: Pick<CommandClient, 'onRejection'>;
}

/** Shows the reason for the latest rejected command in the toast slot. */
export function Toasts({ commands }: ToastsProps) {
  useEffect(() => commands.onRejection((code) => showToast(errorText(code))), [commands]);
  return <ToastHost />;
}
