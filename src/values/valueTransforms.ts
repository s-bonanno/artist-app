import type { ValueSettings } from './valueTypes';

const LUMINANCE_RED = 0.2126;
const LUMINANCE_GREEN = 0.7152;
const LUMINANCE_BLUE = 0.0722;
const MIN_NOTAN_LEVELS = 2;
const MAX_NOTAN_LEVELS = 32;

type RgbaColor = [number, number, number, number];

export function shouldApplyValues(values: ValueSettings) {
  return values.enabled && values.opacity > 0 && values.levels > 1;
}

export function applyValuesToImageData(imageData: ImageData, values: ValueSettings) {
  if (!shouldApplyValues(values)) return imageData;

  const data = imageData.data;
  const levels = normalizeNotanLevels(values.levels);
  const visibleLevels = clamp(Math.round(values.visibleLevels), 0, levels);
  const opacity = clamp(values.opacity, 0, 1);
  const bandSize = 256 / levels;
  const highestVisibleShadowBand = visibleLevels - 1;
  const lowestVisibleLightBand = levels - visibleLevels;
  const mapThresholds = calculateNotanThresholds(data, levels);
  const lightShadowThreshold = calculateNotanThresholds(data, MIN_NOTAN_LEVELS)[0] ?? 127;

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
      luminance,
      band,
      levels,
      mapThresholds,
      lightShadowThreshold,
      highestVisibleShadowBand,
      lowestVisibleLightBand,
      originalRed,
      originalGreen,
      originalBlue,
      alpha,
    );

    data[index] = blendChannel(target[0], originalRed, opacity);
    data[index + 1] = blendChannel(target[1], originalGreen, opacity);
    data[index + 2] = blendChannel(target[2], originalBlue, opacity);
    data[index + 3] = blendChannel(target[3], alpha, opacity);
  }

  return imageData;
}

function getValueColor(
  mode: ValueSettings['mode'],
  luminance: number,
  band: number,
  levels: number,
  mapThresholds: number[],
  lightShadowThreshold: number,
  highestVisibleShadowBand: number,
  lowestVisibleLightBand: number,
  originalRed: number,
  originalGreen: number,
  originalBlue: number,
  originalAlpha: number,
): RgbaColor {
  if (mode === 'map') {
    const tone = getNotanTone(luminance, levels, mapThresholds);
    return [tone, tone, tone, originalAlpha];
  }

  if (mode === 'lights') {
    if (luminance <= lightShadowThreshold) {
      return [0, 0, 0, originalAlpha];
    }

    const tone = getNotanTone(luminance, levels, mapThresholds);
    return [tone, tone, tone, originalAlpha];
  }

  if (mode === 'shadows') {
    if (luminance > lightShadowThreshold) {
      return [255, 255, 255, originalAlpha];
    }

    const tone = getNotanTone(luminance, levels, mapThresholds);
    return [tone, tone, tone, originalAlpha];
  }

  if (band > highestVisibleShadowBand) {
    return [255, 255, 255, originalAlpha];
  }

  if (band >= lowestVisibleLightBand) {
    return [originalRed, originalGreen, originalBlue, originalAlpha];
  }

  return [originalRed, originalGreen, originalBlue, originalAlpha];
}

function calculateNotanThresholds(data: Uint8ClampedArray, levels: number) {
  const histogram = new Array<number>(256).fill(0);

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;

    const luminance = Math.round(
      LUMINANCE_RED * data[index] + LUMINANCE_GREEN * data[index + 1] + LUMINANCE_BLUE * data[index + 2],
    );
    histogram[clamp(luminance, 0, 255)] += 1;
  }

  return calculateRecursiveNotanThresholds(histogram, levels);
}

function calculateRecursiveNotanThresholds(histogram: number[], levels: number) {
  const classes = normalizeNotanLevels(levels);
  const thresholds: number[] = [];
  let ranges = [{ start: 0, end: 255 }];

  while (ranges.length < classes) {
    const nextRanges: Array<{ start: number; end: number }> = [];

    for (const range of ranges) {
      const split = findOtsuSplit(histogram, range.start, range.end);
      thresholds.push(split);
      nextRanges.push({ start: range.start, end: split }, { start: split + 1, end: range.end });
    }

    ranges = nextRanges;
  }

  return thresholds.sort((first, second) => first - second);
}

function findOtsuSplit(histogram: number[], start: number, end: number) {
  if (end - start <= 1) return start;

  let total = 0;
  let sum = 0;

  for (let value = start; value <= end; value += 1) {
    total += histogram[value];
    sum += histogram[value] * value;
  }

  if (total === 0) return Math.floor((start + end) / 2);

  let backgroundCount = 0;
  let backgroundSum = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestSplit = Math.floor((start + end) / 2);

  for (let value = start; value < end; value += 1) {
    backgroundCount += histogram[value];
    backgroundSum += histogram[value] * value;

    const foregroundCount = total - backgroundCount;
    if (backgroundCount === 0 || foregroundCount === 0) continue;

    const backgroundMean = backgroundSum / backgroundCount;
    const foregroundMean = (sum - backgroundSum) / foregroundCount;
    const score = backgroundCount * foregroundCount * (backgroundMean - foregroundMean) ** 2;

    if (score > bestScore) {
      bestScore = score;
      bestSplit = value;
    }
  }

  return bestSplit;
}

function getNotanTone(luminance: number, levels: number, thresholds: number[]) {
  const value = clamp(Math.round(luminance), 0, 255);
  const valueIndex = thresholds.findIndex((threshold) => value <= threshold);
  const levelIndex = valueIndex === -1 ? levels - 1 : valueIndex;
  return Math.round((levelIndex / Math.max(1, levels - 1)) * 255);
}

function blendChannel(target: number, original: number, opacity: number) {
  return Math.round(target * opacity + original * (1 - opacity));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeNotanLevels(levels: number) {
  const depth = Math.round(Math.log2(Math.max(MIN_NOTAN_LEVELS, levels)));
  const normalizedDepth = clamp(depth, 1, Math.log2(MAX_NOTAN_LEVELS));
  return 2 ** normalizedDepth;
}
