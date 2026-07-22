export type ShapeDetail = 'coarse' | 'balanced' | 'fine';

export type SpatialColorStudyResult = {
  mapped: ImageData;
  regionCount: number;
  swatches: SpatialColorSwatch[];
};

export type SpatialColorSwatch = {
  red: number;
  green: number;
  blue: number;
  hex: string;
  share: number;
};

export type SpatialColorStudyProgress = {
  progress: number;
  stage: 'Grouping colours' | 'Refining shapes' | 'Painting study';
};

type LabImage = {
  lightness: Float32Array;
  greenRed: Float32Array;
  blueYellow: Float32Array;
};

type Center = {
  x: number;
  y: number;
  lightness: number;
  greenRed: number;
  blueYellow: number;
};

type DetailSettings = {
  spacing: number;
  compactness: number;
  mergeThreshold: number;
  smoothingPasses: number;
  swatchLimit: number;
  maximumSwatches: number;
  coverageThreshold: number;
  boundarySmoothingPasses: number;
  mixingValueBins: number;
  minimumShareMultiplier: number;
  duplicateThreshold: number;
};

type MixingColorCandidate = {
  red: number;
  green: number;
  blue: number;
  count: number;
  lightness: number;
  greenRed: number;
  blueYellow: number;
  chroma: number;
  hue: number;
  family: number;
};

const DETAIL_SETTINGS: Record<ShapeDetail, DetailSettings> = {
  coarse: {
    spacing: 56,
    compactness: 0.009,
    mergeThreshold: 0.012,
    smoothingPasses: 6,
    swatchLimit: 14,
    maximumSwatches: 24,
    coverageThreshold: 0.0055,
    boundarySmoothingPasses: 3,
    mixingValueBins: 5,
    minimumShareMultiplier: 2,
    duplicateThreshold: 0.001,
  },
  balanced: {
    spacing: 26,
    compactness: 0.005,
    mergeThreshold: 0.0042,
    smoothingPasses: 3,
    swatchLimit: 26,
    maximumSwatches: 48,
    coverageThreshold: 0.0018,
    boundarySmoothingPasses: 2,
    mixingValueBins: 7,
    minimumShareMultiplier: 1,
    duplicateThreshold: 0.00045,
  },
  fine: {
    spacing: 13,
    compactness: 0.0032,
    mergeThreshold: 0.0014,
    smoothingPasses: 1,
    swatchLimit: 40,
    maximumSwatches: 72,
    coverageThreshold: 0.0007,
    boundarySmoothingPasses: 1,
    mixingValueBins: 10,
    minimumShareMultiplier: 0.7,
    duplicateThreshold: 0.00025,
  },
};

const NEUTRAL_CHROMA = 0.034;
const MIXING_CHROMA_SPLIT = 0.09;
// Neutrals come first. Chromatic families then move around the wheel from blue.
const HUE_FAMILY_ANGLES = [255, 205, 150, 105, 70, 30, 345, 305];

export function createSpatialColorStudy(
  imageData: ImageData,
  detail: ShapeDetail = 'balanced',
  onProgress?: (update: SpatialColorStudyProgress) => void,
): SpatialColorStudyResult {
  const { width, height } = imageData;
  const settings = DETAIL_SETTINGS[detail];
  const resolutionScale = Math.max(width, height) / 820;
  onProgress?.({ progress: 0.08, stage: 'Grouping colours' });
  const source = imageDataToOklab(imageData);
  onProgress?.({ progress: 0.18, stage: 'Grouping colours' });
  const softened = edgeAwareSmooth(source, width, height, settings.smoothingPasses);
  onProgress?.({ progress: 0.34, stage: 'Grouping colours' });
  const labels = buildLocalRegions(softened, width, height, settings, resolutionScale);
  onProgress?.({ progress: 0.66, stage: 'Refining shapes' });
  const merged = mergeSimilarNeighbours(labels, softened, width, height, settings.mergeThreshold);
  onProgress?.({ progress: 0.82, stage: 'Painting study' });
  const painted = paintRegions(merged.labels, softened, imageData, merged.regionCount, settings);
  onProgress?.({ progress: 1, stage: 'Painting study' });

  return {
    mapped: painted.mapped,
    regionCount: merged.regionCount,
    swatches: painted.swatches,
  };
}

function imageDataToOklab(imageData: ImageData): LabImage {
  const pixelCount = imageData.width * imageData.height;
  const lightness = new Float32Array(pixelCount);
  const greenRed = new Float32Array(pixelCount);
  const blueYellow = new Float32Array(pixelCount);

  for (let pixel = 0, index = 0; pixel < pixelCount; pixel += 1, index += 4) {
    const color = rgbToOklab(
      imageData.data[index],
      imageData.data[index + 1],
      imageData.data[index + 2],
    );
    lightness[pixel] = color.lightness;
    greenRed[pixel] = color.greenRed;
    blueYellow[pixel] = color.blueYellow;
  }

  return { lightness, greenRed, blueYellow };
}

function edgeAwareSmooth(source: LabImage, width: number, height: number, passes: number): LabImage {
  let current = source;

  for (let pass = 0; pass < passes; pass += 1) {
    const next: LabImage = {
      lightness: new Float32Array(current.lightness.length),
      greenRed: new Float32Array(current.greenRed.length),
      blueYellow: new Float32Array(current.blueYellow.length),
    };

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = y * width + x;
        const baseL = current.lightness[pixel];
        const baseA = current.greenRed[pixel];
        const baseB = current.blueYellow[pixel];
        let sumL = baseL * 3;
        let sumA = baseA * 3;
        let sumB = baseB * 3;
        let weightTotal = 3;

        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          const sampleY = y + offsetY;
          if (sampleY < 0 || sampleY >= height) continue;

          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            if (offsetX === 0 && offsetY === 0) continue;
            const sampleX = x + offsetX;
            if (sampleX < 0 || sampleX >= width) continue;
            const sample = sampleY * width + sampleX;
            const colorDistance = weightedColorDistance(
              baseL,
              baseA,
              baseB,
              current.lightness[sample],
              current.greenRed[sample],
              current.blueYellow[sample],
            );
            if (colorDistance > 0.0055) continue;

            const edgeWeight = colorDistance < 0.0012 ? 1.4 : 0.55;
            const spatialWeight = offsetX === 0 || offsetY === 0 ? 1 : 0.7;
            const weight = edgeWeight * spatialWeight;
            sumL += current.lightness[sample] * weight;
            sumA += current.greenRed[sample] * weight;
            sumB += current.blueYellow[sample] * weight;
            weightTotal += weight;
          }
        }

        next.lightness[pixel] = sumL / weightTotal;
        next.greenRed[pixel] = sumA / weightTotal;
        next.blueYellow[pixel] = sumB / weightTotal;
      }
    }

    current = next;
  }

  return current;
}

function buildLocalRegions(
  image: LabImage,
  width: number,
  height: number,
  settings: DetailSettings,
  resolutionScale: number,
) {
  const scaledSpacing = settings.spacing * Math.max(0.5, resolutionScale);
  const spacing = Math.max(8, Math.min(scaledSpacing, Math.floor(Math.min(width, height) / 4)));
  const centers: Center[] = [];

  for (let y = Math.floor(spacing / 2); y < height; y += spacing) {
    for (let x = Math.floor(spacing / 2); x < width; x += spacing) {
      const seed = findQuietSeed(image, width, height, x, y);
      const pixel = seed.y * width + seed.x;
      centers.push({
        x: seed.x,
        y: seed.y,
        lightness: image.lightness[pixel],
        greenRed: image.greenRed[pixel],
        blueYellow: image.blueYellow[pixel],
      });
    }
  }

  const labels = new Int32Array(width * height);
  const distances = new Float32Array(width * height);

  for (let iteration = 0; iteration < 5; iteration += 1) {
    labels.fill(-1);
    distances.fill(Number.POSITIVE_INFINITY);

    centers.forEach((center, centerIndex) => {
      const minX = Math.max(0, Math.floor(center.x - spacing));
      const maxX = Math.min(width - 1, Math.ceil(center.x + spacing));
      const minY = Math.max(0, Math.floor(center.y - spacing));
      const maxY = Math.min(height - 1, Math.ceil(center.y + spacing));

      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const pixel = y * width + x;
          const colorDistance = weightedColorDistance(
            image.lightness[pixel],
            image.greenRed[pixel],
            image.blueYellow[pixel],
            center.lightness,
            center.greenRed,
            center.blueYellow,
          );
          const spatialDistance = (
            ((x - center.x) ** 2 + (y - center.y) ** 2) / (spacing * spacing)
          ) * settings.compactness;
          const distance = colorDistance + spatialDistance;
          if (distance >= distances[pixel]) continue;
          distances[pixel] = distance;
          labels[pixel] = centerIndex;
        }
      }
    });

    const sums = Array.from({ length: centers.length }, () => ({
      x: 0,
      y: 0,
      lightness: 0,
      greenRed: 0,
      blueYellow: 0,
      count: 0,
    }));

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = y * width + x;
        const label = labels[pixel];
        if (label < 0) continue;
        const sum = sums[label];
        sum.x += x;
        sum.y += y;
        sum.lightness += image.lightness[pixel];
        sum.greenRed += image.greenRed[pixel];
        sum.blueYellow += image.blueYellow[pixel];
        sum.count += 1;
      }
    }

    centers.forEach((center, index) => {
      const sum = sums[index];
      if (sum.count === 0) return;
      center.x = sum.x / sum.count;
      center.y = sum.y / sum.count;
      center.lightness = sum.lightness / sum.count;
      center.greenRed = sum.greenRed / sum.count;
      center.blueYellow = sum.blueYellow / sum.count;
    });
  }

  return labels;
}

function findQuietSeed(image: LabImage, width: number, height: number, x: number, y: number) {
  let bestX = x;
  let bestY = y;
  let bestGradient = Number.POSITIVE_INFINITY;

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    const sampleY = clamp(y + offsetY, 1, height - 2);
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const sampleX = clamp(x + offsetX, 1, width - 2);
      const pixel = sampleY * width + sampleX;
      const gradient = (
        Math.abs(image.lightness[pixel - 1] - image.lightness[pixel + 1])
        + Math.abs(image.lightness[pixel - width] - image.lightness[pixel + width])
      );
      if (gradient >= bestGradient) continue;
      bestGradient = gradient;
      bestX = sampleX;
      bestY = sampleY;
    }
  }

  return { x: bestX, y: bestY };
}

function mergeSimilarNeighbours(
  labels: Int32Array,
  image: LabImage,
  width: number,
  height: number,
  threshold: number,
) {
  let maximumLabel = 0;
  for (const label of labels) maximumLabel = Math.max(maximumLabel, label);
  const regionCount = maximumLabel + 1;
  const parent = new Int32Array(regionCount);
  const counts = new Uint32Array(regionCount);
  const sumL = new Float64Array(regionCount);
  const sumA = new Float64Array(regionCount);
  const sumB = new Float64Array(regionCount);

  for (let index = 0; index < regionCount; index += 1) parent[index] = index;
  for (let pixel = 0; pixel < labels.length; pixel += 1) {
    const label = labels[pixel];
    if (label < 0) continue;
    counts[label] += 1;
    sumL[label] += image.lightness[pixel];
    sumA[label] += image.greenRed[pixel];
    sumB[label] += image.blueYellow[pixel];
  }

  const edgeKeys = new Set<number>();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (x + 1 < width) addEdge(labels[pixel], labels[pixel + 1]);
      if (y + 1 < height) addEdge(labels[pixel], labels[pixel + width]);
    }
  }

  const edges = [...edgeKeys].map((key) => {
    const first = Math.floor(key / regionCount);
    const second = key % regionCount;
    return {
      first,
      second,
      distance: regionDistance(first, second),
    };
  }).sort((first, second) => first.distance - second.distance);

  for (const edge of edges) {
    const first = findRoot(edge.first);
    const second = findRoot(edge.second);
    if (first === second) continue;
    if (regionDistance(first, second) > threshold) continue;
    union(first, second);
  }

  const rootToLabel = new Map<number, number>();
  const mergedLabels = new Int32Array(labels.length);
  for (let pixel = 0; pixel < labels.length; pixel += 1) {
    const root = findRoot(labels[pixel]);
    let mappedLabel = rootToLabel.get(root);
    if (mappedLabel === undefined) {
      mappedLabel = rootToLabel.size;
      rootToLabel.set(root, mappedLabel);
    }
    mergedLabels[pixel] = mappedLabel;
  }

  return { labels: mergedLabels, regionCount: rootToLabel.size };

  function addEdge(first: number, second: number) {
    if (first < 0 || second < 0 || first === second) return;
    const low = Math.min(first, second);
    const high = Math.max(first, second);
    edgeKeys.add(low * regionCount + high);
  }

  function findRoot(region: number): number {
    let root = region;
    while (parent[root] !== root) root = parent[root];
    let current = region;
    while (parent[current] !== current) {
      const next = parent[current];
      parent[current] = root;
      current = next;
    }
    return root;
  }

  function regionDistance(first: number, second: number) {
    return weightedColorDistance(
      sumL[first] / Math.max(1, counts[first]),
      sumA[first] / Math.max(1, counts[first]),
      sumB[first] / Math.max(1, counts[first]),
      sumL[second] / Math.max(1, counts[second]),
      sumA[second] / Math.max(1, counts[second]),
      sumB[second] / Math.max(1, counts[second]),
    );
  }

  function union(first: number, second: number) {
    const larger = counts[first] >= counts[second] ? first : second;
    const smaller = larger === first ? second : first;
    parent[smaller] = larger;
    counts[larger] += counts[smaller];
    sumL[larger] += sumL[smaller];
    sumA[larger] += sumA[smaller];
    sumB[larger] += sumB[smaller];
  }
}

function paintRegions(
  labels: Int32Array,
  image: LabImage,
  source: ImageData,
  regionCount: number,
  settings: DetailSettings,
) {
  const counts = new Uint32Array(regionCount);
  const sumL = new Float64Array(regionCount);
  const sumA = new Float64Array(regionCount);
  const sumB = new Float64Array(regionCount);

  for (let pixel = 0; pixel < labels.length; pixel += 1) {
    const label = labels[pixel];
    counts[label] += 1;
    sumL[label] += image.lightness[pixel];
    sumA[label] += image.greenRed[pixel];
    sumB[label] += image.blueYellow[pixel];
  }

  const colors = Array.from({ length: regionCount }, (_, label) => oklabToRgb(
    sumL[label] / Math.max(1, counts[label]),
    sumA[label] / Math.max(1, counts[label]),
    sumB[label] / Math.max(1, counts[label]),
  ));
  const swatches = selectMixingSwatches(colors, counts, sumL, sumA, sumB, labels.length, settings);
  const swatchLabs = swatches.map((swatch) => rgbToOklab(swatch.red, swatch.green, swatch.blue));
  const regionSwatches = colors.map((color) => {
    const colorLab = rgbToOklab(color.red, color.green, color.blue);
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    swatchLabs.forEach((swatchLab, index) => {
      const distance = weightedColorDistance(
        colorLab.lightness,
        colorLab.greenRed,
        colorLab.blueYellow,
        swatchLab.lightness,
        swatchLab.greenRed,
        swatchLab.blueYellow,
      );
      if (distance >= closestDistance) return;
      closestIndex = index;
      closestDistance = distance;
    });

    return closestIndex;
  });
  const pixelSwatches = smoothPaletteAssignments(
    labels,
    source.width,
    source.height,
    regionSwatches,
    settings.boundarySmoothingPasses,
  );
  const swatchCounts = new Uint32Array(swatches.length);
  const output = new Uint8ClampedArray(source.data.length);

  for (let pixel = 0, index = 0; pixel < labels.length; pixel += 1, index += 4) {
    const swatchIndex = pixelSwatches[pixel];
    const color = swatches[swatchIndex];
    swatchCounts[swatchIndex] += 1;
    output[index] = color.red;
    output[index + 1] = color.green;
    output[index + 2] = color.blue;
    output[index + 3] = source.data[index + 3];
  }

  return {
    mapped: new ImageData(output, source.width, source.height),
    swatches: swatches.map((swatch, index) => ({
      ...swatch,
      share: swatchCounts[index] / Math.max(1, labels.length),
    })),
  };
}

function smoothPaletteAssignments(
  labels: Int32Array,
  width: number,
  height: number,
  regionSwatches: number[],
  passes: number,
) {
  let current = new Uint16Array(labels.length);
  for (let pixel = 0; pixel < labels.length; pixel += 1) {
    current[pixel] = regionSwatches[labels[pixel]];
  }

  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.slice();
    const neighbourhood = new Uint16Array(9);

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const pixel = y * width + x;
        neighbourhood[0] = current[pixel - width - 1];
        neighbourhood[1] = current[pixel - width];
        neighbourhood[2] = current[pixel - width + 1];
        neighbourhood[3] = current[pixel - 1];
        neighbourhood[4] = current[pixel];
        neighbourhood[5] = current[pixel + 1];
        neighbourhood[6] = current[pixel + width - 1];
        neighbourhood[7] = current[pixel + width];
        neighbourhood[8] = current[pixel + width + 1];
        let majority = current[pixel];
        let majorityCount = 0;

        for (const candidate of neighbourhood) {
          let count = 0;
          for (const neighbour of neighbourhood) {
            if (neighbour === candidate) count += 1;
          }
          if (count <= majorityCount) continue;
          majority = candidate;
          majorityCount = count;
        }

        if (majority !== current[pixel] && majorityCount >= 5) next[pixel] = majority;
      }
    }

    current = next;
  }

  return current;
}

function selectMixingSwatches(
  colors: Array<{ red: number; green: number; blue: number }>,
  counts: Uint32Array,
  sumL: Float64Array,
  sumA: Float64Array,
  sumB: Float64Array,
  pixelCount: number,
  settings: DetailSettings,
) {
  const candidates = combineMatchingRegionColors(colors, counts, sumL, sumA, sumB)
    .filter((candidate) => {
      const minimumShare = candidate.chroma >= NEUTRAL_CHROMA ? 0.00025 : 0.00055;
      return candidate.count >= Math.max(
        3,
        Math.round(pixelCount * minimumShare * settings.minimumShareMultiplier),
      );
    });
  const bucketed = selectMixingBuckets(candidates, settings.mixingValueBins);
  const baseSelection = limitMixingPalette(
    removeNearDuplicateMixingColors(bucketed, settings.duplicateThreshold),
    settings.swatchLimit,
  );
  const selected = expandMixingPaletteCoverage(
    baseSelection,
    candidates,
    settings.coverageThreshold,
    settings.maximumSwatches,
  );

  if (selected.length === 0 && colors.length > 0) {
    const largestRegion = colors.reduce((largest, _, index) => (
      counts[index] > counts[largest] ? index : largest
    ), 0);
    selected.push(createMixingCandidate(
      colors[largestRegion],
      counts[largestRegion],
      sumL[largestRegion],
      sumA[largestRegion],
      sumB[largestRegion],
    ));
  }

  return selected
    .sort(compareMixingColors)
    .map((candidate): SpatialColorSwatch => ({
    red: candidate.red,
    green: candidate.green,
    blue: candidate.blue,
    hex: rgbToHex(candidate.red, candidate.green, candidate.blue),
    share: candidate.count / Math.max(1, pixelCount),
    }));
}

function expandMixingPaletteCoverage(
  selected: MixingColorCandidate[],
  candidates: MixingColorCandidate[],
  coverageThreshold: number,
  maximumSwatches: number,
) {
  const expanded = [...selected];
  const selectedSet = new Set(expanded);

  while (expanded.length < maximumSwatches) {
    let nextCandidate: MixingColorCandidate | null = null;
    let nextPriority = 0;

    for (const candidate of candidates) {
      if (selectedSet.has(candidate)) continue;

      const nearestDistance = expanded.reduce((nearest, swatch) => Math.min(
        nearest,
        weightedColorDistance(
          candidate.lightness,
          candidate.greenRed,
          candidate.blueYellow,
          swatch.lightness,
          swatch.greenRed,
          swatch.blueYellow,
        ),
      ), Number.POSITIVE_INFINITY);
      if (nearestDistance <= coverageThreshold) continue;

      const priority = nearestDistance * Math.sqrt(candidate.count) * (1 + Math.min(1, candidate.chroma * 5));
      if (priority <= nextPriority) continue;
      nextCandidate = candidate;
      nextPriority = priority;
    }

    if (!nextCandidate) break;
    expanded.push(nextCandidate);
    selectedSet.add(nextCandidate);
  }

  return expanded;
}

function selectMixingBuckets(candidates: MixingColorCandidate[], valueBins: number) {
  const buckets = new Map<string, MixingColorCandidate>();

  for (const candidate of candidates) {
    const valueBin = clamp(Math.floor(candidate.lightness * valueBins), 0, valueBins - 1);
    const chromaBand = candidate.family === 0 || candidate.chroma < MIXING_CHROMA_SPLIT ? 0 : 1;
    const key = `${candidate.family}:${valueBin}:${chromaBand}`;
    const existing = buckets.get(key);
    if (!existing || candidate.count > existing.count) buckets.set(key, candidate);
  }

  return [...buckets.values()];
}

function removeNearDuplicateMixingColors(candidates: MixingColorCandidate[], duplicateThreshold: number) {
  const selected: MixingColorCandidate[] = [];

  for (const candidate of [...candidates].sort((first, second) => second.count - first.count)) {
    const isDuplicate = selected.some((entry) => weightedColorDistance(
      candidate.lightness,
      candidate.greenRed,
      candidate.blueYellow,
      entry.lightness,
      entry.greenRed,
      entry.blueYellow,
    ) < duplicateThreshold);
    if (!isDuplicate) selected.push(candidate);
  }

  return selected;
}

function limitMixingPalette(candidates: MixingColorCandidate[], swatchLimit: number) {
  if (candidates.length <= swatchLimit) return candidates;

  const selected: MixingColorCandidate[] = [];
  const selectedSet = new Set<MixingColorCandidate>();
  const families = new Map<number, MixingColorCandidate[]>();

  for (const candidate of candidates) {
    const family = families.get(candidate.family) ?? [];
    family.push(candidate);
    families.set(candidate.family, family);
  }

  for (const family of families.values()) {
    const anchor = family.reduce((largest, candidate) => (
      candidate.count > largest.count ? candidate : largest
    ));
    selected.push(anchor);
    selectedSet.add(anchor);
  }

  const remaining = candidates
    .filter((candidate) => !selectedSet.has(candidate))
    .sort((first, second) => getMixingPriority(second) - getMixingPriority(first));

  for (const candidate of remaining) {
    if (selected.length >= swatchLimit) break;
    selected.push(candidate);
  }

  return selected;
}

function getMixingPriority(candidate: MixingColorCandidate) {
  const accentWeight = 1 + Math.min(0.8, candidate.chroma * 4);
  return candidate.count * accentWeight;
}

function combineMatchingRegionColors(
  colors: Array<{ red: number; green: number; blue: number }>,
  counts: Uint32Array,
  sumL: Float64Array,
  sumA: Float64Array,
  sumB: Float64Array,
) {
  const combined = new Map<string, MixingColorCandidate>();

  colors.forEach((color, index) => {
    const candidate = createMixingCandidate(
      color,
      counts[index],
      sumL[index],
      sumA[index],
      sumB[index],
    );
    const key = rgbToHex(color.red, color.green, color.blue);
    const existing = combined.get(key);

    if (!existing) {
      combined.set(key, candidate);
      return;
    }

    existing.count += candidate.count;
  });

  return [...combined.values()];
}

function createMixingCandidate(
  color: { red: number; green: number; blue: number },
  count: number,
  summedLightness: number,
  summedGreenRed: number,
  summedBlueYellow: number,
): MixingColorCandidate {
  const lightness = summedLightness / Math.max(1, count);
  const greenRed = summedGreenRed / Math.max(1, count);
  const blueYellow = summedBlueYellow / Math.max(1, count);
  const chroma = Math.hypot(greenRed, blueYellow);
  const hue = normalizeHue(Math.atan2(blueYellow, greenRed) * 180 / Math.PI);

  return {
    ...color,
    count,
    lightness,
    greenRed,
    blueYellow,
    chroma,
    hue,
    family: chroma < NEUTRAL_CHROMA ? 0 : getHueFamily(hue) + 1,
  };
}

function compareMixingColors(first: MixingColorCandidate, second: MixingColorCandidate) {
  if (first.family !== second.family) return first.family - second.family;
  if (Math.abs(first.lightness - second.lightness) > 0.008) return first.lightness - second.lightness;
  if (Math.abs(first.chroma - second.chroma) > 0.008) return first.chroma - second.chroma;
  return second.count - first.count;
}

function getHueFamily(hue: number) {
  let closestFamily = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  HUE_FAMILY_ANGLES.forEach((angle, index) => {
    const distance = circularHueDistance(hue, angle);
    if (distance >= closestDistance) return;
    closestFamily = index;
    closestDistance = distance;
  });

  return closestFamily;
}

function circularHueDistance(first: number, second: number) {
  const difference = Math.abs(first - second);
  return Math.min(difference, 360 - difference);
}

function normalizeHue(hue: number) {
  return (hue + 360) % 360;
}

function weightedColorDistance(
  firstL: number,
  firstA: number,
  firstB: number,
  secondL: number,
  secondA: number,
  secondB: number,
) {
  return (
    (firstL - secondL) ** 2 * 2.2
    + (firstA - secondA) ** 2 * 5
    + (firstB - secondB) ** 2 * 5
  );
}

function rgbToOklab(red: number, green: number, blue: number) {
  const r = srgbToLinear(red / 255);
  const g = srgbToLinear(green / 255);
  const b = srgbToLinear(blue / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return {
    lightness: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    greenRed: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    blueYellow: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function oklabToRgb(lightness: number, greenRed: number, blueYellow: number) {
  const l = (lightness + 0.3963377774 * greenRed + 0.2158037573 * blueYellow) ** 3;
  const m = (lightness - 0.1055613458 * greenRed - 0.0638541728 * blueYellow) ** 3;
  const s = (lightness - 0.0894841775 * greenRed - 1.291485548 * blueYellow) ** 3;
  const red = linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const green = linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const blue = linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);

  return {
    red: clamp(Math.round(red * 255), 0, 255),
    green: clamp(Math.round(green * 255), 0, 255),
    blue: clamp(Math.round(blue * 255), 0, 255),
  };
}

function srgbToLinear(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number) {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * Math.max(0, value) ** (1 / 2.4) - 0.055;
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
