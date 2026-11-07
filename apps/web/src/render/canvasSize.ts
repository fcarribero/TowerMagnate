export interface CanvasSize {
  deviceWidth: number;
  deviceHeight: number;
  cssWidth: number;
  cssHeight: number;
}

export function canvasSizeFromDevicePixels(
  deviceWidth: number,
  deviceHeight: number,
  devicePixelRatio: number,
): CanvasSize {
  const ratio = validRatio(devicePixelRatio);
  const wholeWidth = Math.max(1, Math.floor(deviceWidth));
  const wholeHeight = Math.max(1, Math.floor(deviceHeight));
  return {
    deviceWidth: wholeWidth,
    deviceHeight: wholeHeight,
    cssWidth: wholeWidth / ratio,
    cssHeight: wholeHeight / ratio,
  };
}

export function canvasSizeFromCssPixels(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
): CanvasSize {
  const ratio = validRatio(devicePixelRatio);
  return canvasSizeFromDevicePixels(
    Math.round(cssWidth * ratio),
    Math.round(cssHeight * ratio),
    ratio,
  );
}

function validRatio(devicePixelRatio: number): number {
  return devicePixelRatio > 0 ? devicePixelRatio : 1;
}

export interface BoxSize {
  width: number;
  height: number;
}

export function canvasSizeFromObservedBox(
  cssBox: BoxSize,
  deviceBox: BoxSize | undefined,
  devicePixelRatio: number,
): CanvasSize {
  const fromCss = canvasSizeFromCssPixels(cssBox.width, cssBox.height, devicePixelRatio);
  if (deviceBox === undefined || !agreesWithin1Pixel(fromCss, deviceBox)) {
    return fromCss;
  }
  return canvasSizeFromDevicePixels(deviceBox.width, deviceBox.height, devicePixelRatio);
}

function agreesWithin1Pixel(expected: CanvasSize, deviceBox: BoxSize): boolean {
  return (
    Math.abs(expected.deviceWidth - deviceBox.width) <= 1 &&
    Math.abs(expected.deviceHeight - deviceBox.height) <= 1
  );
}
