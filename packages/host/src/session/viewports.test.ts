import { describe, expect, it } from 'vitest';
import { FakeSocket } from '../testing/fake-socket';
import { MAX_VIEWPORTS_PER_SECOND, Viewports } from './viewports';

const LOBBY = { levelFrom: 1, levelTo: 5, xFrom: 0, xTo: 100 };
const ROOF = { levelFrom: 40, levelTo: 50, xFrom: 0, xTo: 100 };

describe('viewports', () => {
  it('has no viewport until the socket sends one', () => {
    expect(new Viewports().get(new FakeSocket())).toBeNull();
  });

  it('keeps the latest viewport of each socket', () => {
    const viewports = new Viewports();
    const first = new FakeSocket();
    const second = new FakeSocket();

    viewports.update(first, LOBBY);
    viewports.update(first, ROOF);
    viewports.update(second, LOBBY);

    expect(viewports.get(first)).toEqual(ROOF);
    expect(viewports.get(second)).toEqual(LOBBY);
  });

  it('ignores updates past the limit per second and accepts them again later', () => {
    let clock = 0;
    const viewports = new Viewports(() => clock);
    const socket = new FakeSocket();
    for (let update = 0; update < MAX_VIEWPORTS_PER_SECOND; update += 1) {
      expect(viewports.update(socket, LOBBY)).toBe(true);
    }

    expect(viewports.update(socket, ROOF)).toBe(false);
    expect(viewports.get(socket)).toEqual(LOBBY);

    clock += 1000;
    expect(viewports.update(socket, ROOF)).toBe(true);
    expect(viewports.get(socket)).toEqual(ROOF);
  });
});
