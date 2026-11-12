import { useEffect, useState } from 'preact/hooks';
import type { Notice } from './noticeModel';

/** Counts notices that arrive while Avisos is closed; opening it clears the count. */
export function useUnreadCount(
  subscribe: (listener: (notice: Notice) => void) => () => void,
  avisosOpen: boolean,
): number {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (avisosOpen) {
      setUnread(0);
      return undefined;
    }
    return subscribe(() => setUnread((count) => count + 1));
  }, [subscribe, avisosOpen]);

  return unread;
}
