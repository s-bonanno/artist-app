import type { ValueSettings } from './valueTypes';

const LUMINANCE_RED = 0.2126;
const LUMINANCE_GREEN = 0.7152;
const LUMINANCE_BLUE = 0.0722;

export function shouldApplyValues(values: ValueSettings) {
  return values.enabled && values.opacity > 0 && values.visibleLevels > 0 && values.levels > 1;
}

export function applyValuesToImageData(imageData: ImageData, values: ValueSettings) {
  if (!shouldApplyValues(values)) return imageData;

  const data = imageData.data;
  const levels = clamp(Math.round(values.levels), 2, 12);
  const visibleLevels = clamp(Math.round(values.visibleLevels), 0, levels);
  const opacity = clamp(values.opacity, 0, 1);
  const bandSize = 256 / levels;
  const highestVisibleShadowBand = visibleLevels - 1;
  const lowestVisibleLightBand = levels - visibleLevels;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha === 0) continue;

    const originalRed = data[index];
    const originalGreen = data[index + 1];
    const originalBlue = data[index + 2];
    const luminance =
      LUMINANCE_RED * originalRed + LUMINANCE_GREEN * originalGreen + LUMINANCE_BLUE * originalBlue;
    const band = clamp(Math.floor(luminance / bandSize), 0, levels - 1);
    const target = getValueColor(
      values.mode,
      band,
      levels,
      highestVisibleShadowBand,
      lowestVisibleLightBand,
      originalRed,
      originalGreen,
      originalBlue,
    );

    data[index] = blendChannel(target[0], originalRed, opacity);
    data[index + 1] = blendChannel(target[1], originalGreen, opacity);
    data[index + 2] = blendChannel(target[2], originalBlue, opacity);
  }

  return imageData;
}

function getValueColor(
  mode: ValueSettings['mode'],
  band: number,
  levels: number,
  highestVisibleShadowBand: number,
  lowestVisibleLightBand: number,
  originalRed: number,
  originalGreen: number,
  originalBlue: number,
): [number, number, number] {
  if (mode === 'lights') {
    if (band >= lowestVisibleLightBand) {
      return [originalRed, originalGreen, originalBlue];
    }

    return [51, 51, 51];
  }

  if (band > highestVisibleShadowBand) {
    return [255, 255, 255];
  }

  if (mode === 'shadows') {
    return [originalRed, originalGreen, originalBlue];
  }

  const tone = Math.round((band / Math.max(1, levels - 1)) * 255);
  return [tone, tone, tone];
}

function blendChannel(target: number, original: number, opacity: number) {
  return Math.round(target * opacity + original * (1 - opacity));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
