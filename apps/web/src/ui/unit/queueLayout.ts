/** How little of a person may show when the queue packs them: this share of the mean width. */
export const MIN_VISIBLE_SHARE = 0.4;

export interface QueueLayout {
  /** True for the first person of every row after the first. */
  breakBefore: boolean[];
  /** Left margin of each person in pixels; negative when it overlaps the one before. */
  marginLeft: number[];
}

/**
 * Lays a queue of people out in as few rows as possible. When a row has more people than its
 * width holds side by side, they move closer and overlap. A new row starts only once the overlap
 * would leave less than `minVisible` pixels of a person showing. Rows get the same number of
 * people, give or take one.
 */
export function queueLayout(
  widths: readonly number[],
  available: number,
  gap: number,
  minVisible: number = MIN_VISIBLE_SHARE * mean(widths),
): QueueLayout {
  const count = widths.length;
  const breakBefore = new Array<boolean>(count).fill(false);
  const marginLeft = new Array<number>(count).fill(0);
  if (count === 0) return { breakBefore, marginLeft };
  const widest = Math.max(...widths);
  const perRowMax =
    available <= widest || minVisible <= 0 ? 1 : Math.floor((available - widest) / minVisible) + 1;
  const rows = Math.ceil(count / Math.max(1, perRowMax));
  const perRow = Math.ceil(count / rows);
  for (let start = 0; start < count; start += perRow) {
    const end = Math.min(count, start + perRow);
    if (start > 0) breakBefore[start] = true;
    let total = 0;
    for (let index = start; index < end; index++) total += widths[index] as number;
    const inRow = end - start;
    const natural = total + gap * (inRow - 1);
    const step =
      inRow === 1 || natural <= available ? gap : Math.floor((available - total) / (inRow - 1));
    for (let index = start + 1; index < end; index++) marginLeft[index] = step;
  }
  return { breakBefore, marginLeft };
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}
