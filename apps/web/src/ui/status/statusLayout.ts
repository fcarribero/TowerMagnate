export interface StatusWidths {
  /** Everything that always stays on the bar. */
  fixed: number;
  windows: number;
}

/** The window buttons drop into the Menú list when the bar has no room for them. */
export function statusFits(available: number, widths: StatusWidths): boolean {
  return widths.fixed + widths.windows <= available;
}
