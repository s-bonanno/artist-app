import type { ValueSettings } from './valueTypes';

const LUMINANCE_RED = 0.2126;
const LUMINANCE_GREEN = 0.7152;
const LUMINANCE_BLUE = 0.0722;
const MIN_NOTAN_LEVELS = 2;
const MAX_NOTAN_LEVELS = 16;

type RgbaColor = [number, number, number, number];
type TonalRange = {
  start: number;
  end: number;
  split: number;
  priority: number;
};
type ValueFamily = 'shadow' | 'light';
type ValueLeaf = TonalRange & {
  family: ValueFamily;
  tone: number;
};

export function shouldApplyValues(values: ValueSettings) {
  return values.enabled && values.opacity > 0;
}

export function applyValuesToImageData(imageData: ImageData, values: ValueSettings) {
  if (!shouldApplyValues(values)) return imageData;

  const data = imageData.data;
  const levels = normalizeNotanLevels(values.levels);
  const opacity = clamp(values.opacity, 0, 1);
  const sourceData = getSimplifiedData(data, imageData.width, imageData.height, values.simplify);
  const valueScale = values.mode === 'grayscale' ? [] : calculateStableNotanScale(sourceData, levels);

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
      valueScale,
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
  valueScale: ValueLeaf[],
  originalAlpha: number,
): RgbaColor {
  if (mode === 'grayscale') {
    const tone = clamp(Math.round(luminance), 0, 255);
    return [tone, tone, tone, originalAlpha];
  }

  const tone = getStableValueTone(luminance, valueScale);
  return [tone, tone, tone, originalAlpha];
}

function calculateStableNotanScale(data: Uint8ClampedArray, levels: number) {
  const histogram = new Array<number>(256).fill(0);

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;

    const luminance = Math.round(getLuminance(data[index], data[index + 1], data[index + 2]));
    histogram[clamp(luminance, 0, 255)] += 1;
  }

  return buildStableNotanScale(histogram, levels);
}

function buildStableNotanScale(histogram: number[], levels: number) {
  const classes = normalizeNotanLevels(levels);
  const lightShadowSplit = clamp(findOtsuSplit(histogram, 0, 255), 0, 254);
  const leaves: ValueLeaf[] = [
    createValueLeaf(histogram, 0, lightShadowSplit, 'shadow', 0),
    createValueLeaf(histogram, lightShadowSplit + 1, 255, 'light', 255),
  ];

  for (let visibleLevels = 3; visibleLevels <= classes; visibleLevels += 1) {
    splitValueLeaf(leaves, histogram, visibleLevels % 2 === 1 ? 'light' : 'shadow');
  }

  return leaves.sort((first, second) => first.start - second.start);
}

function splitValueLeaf(leaves: ValueLeaf[], histogram: number[], family: ValueFamily) {
  const leafIndex = getNextLeafIndex(leaves, family);
  if (leafIndex === -1) return;

  const leaf = leaves[leafIndex];
  const split = clamp(leaf.split, leaf.start, leaf.end - 1);
  const sortedLeaves = [...leaves].sort((first, second) => first.start - second.start);
  const sortedIndex = sortedLeaves.findIndex((sortedLeaf) => sortedLeaf === leaf);

  if (family === 'shadow') {
    const nextTone = getNextTone(sortedLeaves, sortedIndex);
    const newTone = getMidTone(leaf.tone, nextTone === 255 ? 170 : nextTone);

    leaves.splice(
      leafIndex,
      1,
      createValueLeaf(histogram, leaf.start, split, family, leaf.tone),
      createValueLeaf(histogram, split + 1, leaf.end, family, newTone),
    );
    return;
  }

  const previousTone = getPreviousTone(sortedLeaves, sortedIndex);
  const newTone = getMidTone(previousTone, leaf.tone);

  leaves.splice(
    leafIndex,
    1,
    createValueLeaf(histogram, leaf.start, split, family, newTone),
    createValueLeaf(histogram, split + 1, leaf.end, family, leaf.tone),
  );
}

function getNextLeafIndex(leaves: ValueLeaf[], family: ValueFamily) {
  let leafIndex = -1;
  let bestPriority = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < leaves.length; index += 1) {
    const leaf = leaves[index];
    if (leaf.family !== family || leaf.end <= leaf.start || leaf.priority <= bestPriority) continue;

    leafIndex = index;
    bestPriority = leaf.priority;
  }

  return leafIndex;
}

function createValueLeaf(
  histogram: number[],
  start: number,
  end: number,
  family: ValueFamily,
  tone: number,
): ValueLeaf {
  return {
    ...createTonalRange(histogram, start, end),
    family,
    tone: clamp(Math.round(tone), 0, 255),
  };
}

function getNextTone(leaves: ValueLeaf[], index: number) {
  return leaves[index + 1]?.tone ?? 255;
}

function getPreviousTone(leaves: ValueLeaf[], index: number) {
  return leaves[index - 1]?.tone ?? 0;
}

function getMidTone(first: number, second: number) {
  return clamp(Math.round((first + second) / 2), 0, 255);
}

function createTonalRange(histogram: number[], start: number, end: number): TonalRange {
  const safeStart = clamp(Math.round(start), 0, 255);
  const safeEnd = clamp(Math.round(end), safeStart, 255);
  const split =
    safeEnd <= safeStart ? safeStart : clamp(findOtsuSplit(histogram, safeStart, safeEnd), safeStart, safeEnd - 1);

  return {
    start: safeStart,
    end: safeEnd,
    split,
    priority: calculateRangePriority(histogram, safeStart, safeEnd),
  };
}

function calculateRangePriority(histogram: number[], start: number, end: number) {
  if (end <= start) return 0;

  let total = 0;
  let sum = 0;
  let squaredSum = 0;

  for (let value = start; value <= end; value += 1) {
    const count = histogram[value];

    total += count;
    sum += count * value;
    squaredSum += count * value * value;
  }

  if (total === 0) return end - start;

  const mean = sum / total;
  const variance = Math.max(0, squaredSum / total - mean * mean);

  return variance * total;
}

function getStableValueTone(luminance: number, leaves: ValueLeaf[]) {
  const value = clamp(Math.round(luminance), 0, 255);
  const leaf = leaves.find((candidate) => value >= candidate.start && value <= candidate.end);

  return leaf?.tone ?? (value <= 127 ? 0 : 255);
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
  return clamp(Math.round(levels), MIN_NOTAN_LEVELS, MAX_NOTAN_LEVELS);
}
