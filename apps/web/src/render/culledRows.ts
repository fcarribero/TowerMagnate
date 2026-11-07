import type { LevelRange } from './camera';

export interface Showable {
  visible: boolean;
}

/**
 * One display object per level, hidden unless its level is on screen. Only
 * the previous and the new range are touched, so the cost of a camera move
 * does not grow with the height of the tower.
 */
export class CulledRows<Row extends Showable> {
  private readonly rows = new Map<number, Row>();
  private shown: LevelRange | null = null;

  set(index: number, row: Row): void {
    row.visible = this.isShown(index);
    this.rows.set(index, row);
  }

  showOnly(range: LevelRange): void {
    if (this.shown !== null) {
      this.setVisible(this.shown, false);
    }
    this.setVisible(range, true);
    this.shown = range;
  }

  /** Number of levels on screen that have something to draw. */
  get drawnCount(): number {
    if (this.shown === null) {
      return 0;
    }
    let count = 0;
    for (let index = this.shown.lowest; index <= this.shown.highest; index += 1) {
      if (this.rows.has(index)) {
        count += 1;
      }
    }
    return count;
  }

  private isShown(index: number): boolean {
    return this.shown !== null && index >= this.shown.lowest && index <= this.shown.highest;
  }

  private setVisible(range: LevelRange, visible: boolean): void {
    for (let index = range.lowest; index <= range.highest; index += 1) {
      const row = this.rows.get(index);
      if (row !== undefined) {
        row.visible = visible;
      }
    }
  }
}
