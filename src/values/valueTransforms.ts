import type { ValueSettings } from './valueTypes';

const LUMINANCE_RED = 0.2126;
const LUMINANCE_GREEN = 0.7152;
const LUMINANCE_BLUE = 0.0722;
const MIN_NOTAN_LEVELS = 2;
const MAX_NOTAN_LEVELS = 32;

type RgbaColor = [number, number, number, number];
type RgbColor = [number, number, number];

export function shouldApplyValues(values: ValueSettings) {
  return values.enabled && values.opacity > 0;
}

export function applyValuesToImageData(imageData: ImageData, values: ValueSettings) {
  if (!shouldApplyValues(values)) return imageData;

  const data = imageData.data;
  const levels = normalizeNotanLevels(values.levels);
  const opacity = clamp(values.opacity, 0, 1);
  const sourceData = getSimplifiedData(data, imageData.width, imageData.height, values.simplify);
  const mapThresholds = values.mode === 'grayscale' ? [] : calculateNotanThresholds(sourceData, levels);
  const planeColors = values.mode === 'planes' ? calculatePlaneColors(sourceData, levels, mapThresholds) : null;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha === 0) continue;

    const originalRed = data[index];
    const originalGreen = data[index + 1];
    const originalBlue = data[index + 2];
    const sourceRed = sourceData[index];
    const sourceGreen = sourceData[index + 1];
    const sourceBlue = sourceData[index + 2];
    const luminance = getLuminance(sourceRed, sourceGreen, sourceBlue);
    const target = getValueColor(
      values.mode,
      luminance,
      levels,
      mapThresholds,
      planeColors,
      sourceRed,
      sourceGreen,
      sourceBlue,
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
  levels: number,
  mapThresholds: number[],
  planeColors: RgbColor[] | null,
  sourceRed: number,
  sourceGreen: number,
  sourceBlue: number,
  originalAlpha: number,
): RgbaColor {
  if (mode === 'grayscale') {
    const tone = clamp(Math.round(luminance), 0, 255);
    return [tone, tone, tone, originalAlpha];
  }

  if (mode === 'planes') {
    const levelIndex = getNotanLevelIndex(luminance, levels, mapThresholds);
    const planeColor = planeColors?.[levelIndex];
    if (planeColor) return [planeColor[0], planeColor[1], planeColor[2], originalAlpha];

    return [sourceRed, sourceGreen, sourceBlue, originalAlpha];
  }

  const tone = getNotanTone(luminance, levels, mapThresholds);
  return [tone, tone, tone, originalAlpha];
}

function calculateNotanThresholds(data: Uint8ClampedArray, levels: number) {
  const histogram = new Array<number>(256).fill(0);

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;

    const luminance = Math.round(getLuminance(data[index], data[index + 1], data[index + 2]));
    histogram[clamp(luminance, 0, 255)] += 1;
  }

  return calculateRecursiveNotanThresholds(histogram, levels);
}

function calculatePlaneColors(data: Uint8ClampedArray, levels: number, thresholds: number[]) {
  const totals = Array.from({ length: levels }, () => ({
    red: 0,
    green: 0,
    blue: 0,
    count: 0,
  }));

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;

    const luminance = getLuminance(data[index], data[index + 1], data[index + 2]);
    const levelIndex = getNotanLevelIndex(luminance, levels, thresholds);
    const total = totals[levelIndex];

    total.red += data[index];
    total.green += data[index + 1];
    total.blue += data[index + 2];
    total.count += 1;
  }

  return totals.map<RgbColor>((total, index) => {
    if (total.count === 0) {
      const tone = Math.round((index / Math.max(1, levels - 1)) * 255);
      return [tone, tone, tone];
    }

    return [
      Math.round(total.red / total.count),
      Math.round(total.green / total.count),
      Math.round(total.blue / total.count),
    ];
  });
}

function getSimplifiedData(data: Uint8ClampedArray, width: number, height: number, amount: number) {
  const radius = clamp(Math.round(amount), 0, 10);
  if (radius === 0 || width <= 1 || height <= 1) return data;

  const horizontal = new Uint8ClampedArray(data.length);
  const output = new Uint8ClampedArray(data.length);

  blurHorizontal(data, horizontal, width, height, radius);
  blurVertical(horizontal, output, width, height, radius);

  return output;
}

function blurHorizontal(
  input: Uint8ClampedArray,
  output: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
) {
  const windowSize = radius * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width * 4;
    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 0;

    for (let offset = -radius; offset <= radius; offset += 1) {
      const x = clamp(offset, 0, width - 1);
      const index = rowOffset + x * 4;
      red += input[index];
      green += input[index + 1];
      blue += input[index + 2];
      alpha += input[index + 3];
    }

    for (let x = 0; x < width; x += 1) {
      const outputIndex = rowOffset + x * 4;
      output[outputIndex] = Math.round(red / windowSize);
      output[outputIndex + 1] = Math.round(green / windowSize);
      output[outputIndex + 2] = Math.round(blue / windowSize);
      output[outputIndex + 3] = Math.round(alpha / windowSize);

      const removeX = clamp(x - radius, 0, width - 1);
      const addX = clamp(x + radius + 1, 0, width - 1);
      const removeIndex = rowOffset + removeX * 4;
      const addIndex = rowOffset + addX * 4;

      red += input[addIndex] - input[removeIndex];
      green += input[addIndex + 1] - input[removeIndex + 1];
      blue += input[addIndex + 2] - input[removeIndex + 2];
      alpha += input[addIndex + 3] - input[removeIndex + 3];
    }
  }
}

function blurVertical(
  input: Uint8ClampedArray,
  output: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
) {
  const windowSize = radius * 2 + 1;

  for (let x = 0; x < width; x += 1) {
    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 0;

    for (let offset = -radius; offset <= radius; offset += 1) {
      const y = clamp(offset, 0, height - 1);
      const index = (y * width + x) * 4;
      red += input[index];
      green += input[index + 1];
      blue += input[index + 2];
      alpha += input[index + 3];
    }

    for (let y = 0; y < height; y += 1) {
      const outputIndex = (y * width + x) * 4;
      output[outputIndex] = Math.round(red / windowSize);
      output[outputIndex + 1] = Math.round(green / windowSize);
      output[outputIndex + 2] = Math.round(blue / windowSize);
      output[outputIndex + 3] = Math.round(alpha / windowSize);

      const removeY = clamp(y - radius, 0, height - 1);
      const addY = clamp(y + radius + 1, 0, height - 1);
      const removeIndex = (removeY * width + x) * 4;
      const addIndex = (addY * width + x) * 4;

      red += input[addIndex] - input[removeIndex];
      green += input[addIndex + 1] - input[removeIndex + 1];
      blue += input[addIndex + 2] - input[removeIndex + 2];
      alpha += input[addIndex + 3] - input[removeIndex + 3];
    }
  }
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
  const levelIndex = getNotanLevelIndex(luminance, levels, thresholds);
  return Math.round((levelIndex / Math.max(1, levels - 1)) * 255);
}

function getNotanLevelIndex(luminance: number, levels: number, thresholds: number[]) {
  const value = clamp(Math.round(luminance), 0, 255);
  const valueIndex = thresholds.findIndex((threshold) => value <= threshold);
  return valueIndex === -1 ? levels - 1 : valueIndex;
}

function getLuminance(red: number, green: number, blue: number) {
  return LUMINANCE_RED * red + LUMINANCE_GREEN * green + LUMINANCE_BLUE * blue;
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
