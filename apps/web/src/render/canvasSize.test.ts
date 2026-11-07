import { describe, expect, it } from 'vitest';
import {
  canvasSizeFromCssPixels,
  canvasSizeFromDevicePixels,
  canvasSizeFromObservedBox,
} from './canvasSize';

describe('canvasSizeFromCssPixels', () => {
  it('keeps the size at a device pixel ratio of 1', () => {
    expect(canvasSizeFromCssPixels(800, 600, 1)).toEqual({
      deviceWidth: 800,
      deviceHeight: 600,
      cssWidth: 800,
      cssHeight: 600,
    });
  });

  it('sizes the backing store in whole device pixels at fractional ratios', () => {
    const size = canvasSizeFromCssPixels(801, 601, 1.25);
    expect(size.deviceWidth).toBe(1001);
    expect(size.deviceHeight).toBe(751);
    expect(size.cssWidth * 1.25).toBe(size.deviceWidth);
    expect(size.cssHeight * 1.25).toBe(size.deviceHeight);
  });

  it('falls back to a ratio of 1 when the ratio is invalid', () => {
    expect(canvasSizeFromCssPixels(100, 50, 0).deviceWidth).toBe(100);
  });

  it('never returns an empty canvas', () => {
    expect(canvasSizeFromCssPixels(0, 0, 2)).toMatchObject({ deviceWidth: 1, deviceHeight: 1 });
  });
});

describe('canvasSizeFromDevicePixels', () => {
  it('drops fractional device pixels', () => {
    expect(canvasSizeFromDevicePixels(1920.6, 1080.2, 2)).toEqual({
      deviceWidth: 1920,
      deviceHeight: 1080,
      cssWidth: 960,
      cssHeight: 540,
    });
  });
});

describe('canvasSizeFromObservedBox', () => {
  it('prefers the exact device box when it agrees with the CSS box', () => {
    const size = canvasSizeFromObservedBox(
      { width: 800.8, height: 600 },
      { width: 1001, height: 750 },
      1.25,
    );
    expect(size).toMatchObject({ deviceWidth: 1001, deviceHeight: 750 });
  });

  it('uses the CSS box when the device box is missing', () => {
    const size = canvasSizeFromObservedBox({ width: 400, height: 300 }, undefined, 2);
    expect(size).toMatchObject({ deviceWidth: 800, deviceHeight: 600 });
  });

  it('ignores a device box that does not match the pixel ratio', () => {
    const size = canvasSizeFromObservedBox(
      { width: 800, height: 600 },
      { width: 800, height: 600 },
      1.25,
    );
    expect(size).toMatchObject({ deviceWidth: 1000, deviceHeight: 750 });
  });
});
