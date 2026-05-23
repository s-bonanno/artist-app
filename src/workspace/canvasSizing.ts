export const CM_PER_INCH = 2.54;
export const DEFAULT_CANVAS_RENDER_LONG_SIDE = 2400;
export const BASE_CANVAS_RENDER_LONG_SIDE = 1200;

export type MeasurementUnit = 'cm' | 'in';

export type CanvasPreset = {
  id: string;
  label: string;
  width: number;
  height: number;
  unit: MeasurementUnit;
};

export const canvasPresets: CanvasPreset[] = [
  { id: 'a5', label: 'A5', width: 14.8, height: 21, unit: 'cm' },
  { id: 'a4', label: 'A4', width: 21, height: 29.7, unit: 'cm' },
  { id: 'a3', label: 'A3', width: 29.7, height: 42, unit: 'cm' },
  { id: 'rect-8x10', label: '8 x 10 in', width: 8, height: 10, unit: 'in' },
  { id: 'rect-9x12', label: '9 x 12 in', width: 9, height: 12, unit: 'in' },
  { id: 'rect-11x14', label: '11 x 14 in', width: 11, height: 14, unit: 'in' },
  { id: 'rect-12x16', label: '12 x 16 in', width: 12, height: 16, unit: 'in' },
  { id: 'rect-16x20', label: '16 x 20 in', width: 16, height: 20, unit: 'in' },
  { id: 'rect-18x24', label: '18 x 24 in', width: 18, height: 24, unit: 'in' },
  { id: 'square-12x12', label: '12 x 12 in', width: 12, height: 12, unit: 'in' },
  { id: 'square-16x16', label: '16 x 16 in', width: 16, height: 16, unit: 'in' },
  { id: 'square-20x20', label: '20 x 20 in', width: 20, height: 20, unit: 'in' },
];

export function convertToCm(value: number, unit: MeasurementUnit) {
  return unit === 'in' ? value * CM_PER_INCH : value;
}

export function convertFromCm(valueCm: number, unit: MeasurementUnit) {
  return unit === 'in' ? valueCm / CM_PER_INCH : valueCm;
}

export function formatMeasurement(valueCm: number, unit: MeasurementUnit) {
  const value = convertFromCm(valueCm, unit);
  const decimals = unit === 'in' ? 2 : 1;
  return value.toFixed(decimals).replace(/\.?0+$/, '');
}

export function findMatchingCanvasPreset(widthCm: number, heightCm: number) {
  return canvasPresets.find((preset) => {
    const presetWidthCm = convertToCm(preset.width, preset.unit);
    const presetHeightCm = convertToCm(preset.height, preset.unit);

    return (
      dimensionsMatch(widthCm, heightCm, presetWidthCm, presetHeightCm) ||
      dimensionsMatch(widthCm, heightCm, presetHeightCm, presetWidthCm)
    );
  });
}

export function getGridStep(unit: MeasurementUnit) {
  return unit === 'in' ? 0.25 : 0.5;
}

export function snapGridMeasurement(value: number, unit: MeasurementUnit) {
  const step = getGridStep(unit);

  return Math.round(value / step) * step;
}

export function getCanvasPixelSize(widthCm: number, heightCm: number, maxLongSide = DEFAULT_CANVAS_RENDER_LONG_SIDE) {
  const aspectRatio = widthCm / heightCm;

  if (aspectRatio >= 1) {
    return {
      width: maxLongSide,
      height: Math.round(maxLongSide / aspectRatio),
      pixelsPerCm: maxLongSide / widthCm,
    };
  }

  const height = maxLongSide;
  const width = Math.round(maxLongSide * aspectRatio);

  return {
    width,
    height,
    pixelsPerCm: width / widthCm,
  };
}

function dimensionsMatch(widthCm: number, heightCm: number, presetWidthCm: number, presetHeightCm: number) {
  const toleranceCm = 0.06;

  return Math.abs(widthCm - presetWidthCm) <= toleranceCm && Math.abs(heightCm - presetHeightCm) <= toleranceCm;
}

export function getGridLimits(widthCm: number, heightCm: number, unit: MeasurementUnit) {
  const smallerCm = Math.min(widthCm, heightCm);
  const largerCm = Math.max(widthCm, heightCm);
  const minCm = Math.max(0.1, smallerCm / 50);
  const maxCm = Math.max(minCm, largerCm / 3);
  const step = getGridStep(unit);
  const minValue = Math.ceil(convertFromCm(minCm, unit) / step) * step;
  const maxValue = Math.floor(convertFromCm(maxCm, unit) / step) * step;
  const min = Math.max(step, minValue);
  const max = Math.max(min, maxValue);

  return {
    min,
    max,
    step,
  };
}
