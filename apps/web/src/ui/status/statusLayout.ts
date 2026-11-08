/** Which groups of the status bar moved into the Menú list. */
export type StatusCollapse = 'none' | 'windows' | 'windowsAndZoom';

export interface StatusWidths {
  /** Everything that always stays on the bar. */
  fixed: number;
  zoom: number;
  windows: number;
}

/** Window buttons drop out first, then the zoom buttons. */
export function statusCollapse(available: number, widths: StatusWidths): StatusCollapse {
  if (widths.fixed + widths.zoom + widths.windows <= available) {
    return 'none';
  }
  if (widths.fixed + widths.zoom <= available) {
    return 'windows';
  }
  return 'windowsAndZoom';
}
