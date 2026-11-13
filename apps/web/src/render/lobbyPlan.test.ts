import { describe, expect, it } from 'vitest';
import {
  LOBBY_KINDS,
  LOBBY_PICTURES,
  MAIN_LOBBY_END_MARGIN_TILES,
  planLobbyPictures,
  planLobbyProps,
} from './lobbyPlan';

const widthOf = (kind: string): number =>
  LOBBY_KINDS.find((entry) => entry.kind === kind)?.widthTiles ?? 0;

describe('planLobbyProps', () => {
  it('gives the same props for the same level and span', () => {
    const span = { from: 10, to: 60 };
    expect(planLobbyProps(1, span)).toEqual(planLobbyProps(1, span));
  });

  it('varies between levels', () => {
    const span = { from: 10, to: 80 };
    expect(planLobbyProps(1, span)).not.toEqual(planLobbyProps(9, span));
  });

  it('stays inside the span, off the end columns, and never overlaps', () => {
    for (let level = 1; level < 40; level += 1) {
      const span = { from: 5, to: 5 + level * 3 };
      let nextFree = span.from + 1;
      for (const prop of planLobbyProps(level, span)) {
        expect(prop.widthTiles).toBe(widthOf(prop.kind));
        expect(prop.column).toBeGreaterThanOrEqual(nextFree);
        expect(prop.column + prop.widthTiles - 1).toBeLessThanOrEqual(span.to - 1);
        nextFree = prop.column + prop.widthTiles + 1;
      }
    }
  });

  it('keeps the door zone clear at both ends of a main lobby', () => {
    const span = { from: 20, to: 90 };
    const props = planLobbyProps(1, span, { endMargin: MAIN_LOBBY_END_MARGIN_TILES });
    expect(props.length).toBeGreaterThan(0);
    for (const prop of props) {
      expect(prop.column).toBeGreaterThanOrEqual(span.from + 3);
      expect(prop.column + prop.widthTiles - 1).toBeLessThanOrEqual(span.to - 3);
    }
  });

  it('uses several kinds on a wide lobby and about one prop per 4 to 6 tiles', () => {
    const props = planLobbyProps(1, { from: 0, to: 399 });
    expect(new Set(props.map((prop) => prop.kind)).size).toBeGreaterThan(8);
    expect(props.length).toBeGreaterThan(400 / 7);
    expect(props.length).toBeLessThan(400 / 3);
  });

  it('puts nothing on a span too short for the margins and fits what is left', () => {
    expect(planLobbyProps(1, { from: 4, to: 5 })).toEqual([]);
    expect(planLobbyProps(1, { from: 0, to: 5 }, { endMargin: 3 })).toEqual([]);
    for (const prop of planLobbyProps(2, { from: 0, to: 3 })) {
      expect(prop.widthTiles).toBeLessThanOrEqual(3);
    }
  });

  it('only picks from the given kinds', () => {
    const sky = LOBBY_KINDS.filter((kind) => kind.sky === true);
    const props = planLobbyProps(15, { from: 0, to: 120 }, { kinds: sky });
    expect(props.length).toBeGreaterThan(0);
    for (const prop of props) {
      expect(sky.map((kind) => kind.kind)).toContain(prop.kind);
    }
  });
});

describe('planLobbyPictures', () => {
  it('is stable, stays clear of the door zone and never overlaps', () => {
    const span = { from: 20, to: 120 };
    const options = { endMargin: MAIN_LOBBY_END_MARGIN_TILES };
    const pictures = planLobbyPictures(1, span, options);
    expect(pictures).toEqual(planLobbyPictures(1, span, options));
    expect(pictures.length).toBeGreaterThan(3);
    let nextFree = span.from + MAIN_LOBBY_END_MARGIN_TILES;
    for (const picture of pictures) {
      const width = LOBBY_PICTURES.find((kind) => kind.kind === picture.kind)?.widthTiles;
      expect(picture.widthTiles).toBe(width);
      expect(picture.column).toBeGreaterThanOrEqual(nextFree);
      expect(picture.column + picture.widthTiles - 1).toBeLessThanOrEqual(span.to - 3);
      nextFree = picture.column + picture.widthTiles + 1;
    }
  });
});
