import type { GridGuideType } from '../grid/drawGrid';
import type { ReferenceImage } from '../library/referenceTypes';
import type { PaletteSource, PaletteSwatch, SampleSize } from '../palette/paletteTypes';
import type { ValueSettings } from '../values/valueTypes';

export type WorkspaceState = {
  image: ReferenceImage | null;
  canvas: {
    widthCm: number;
    heightCm: number;
    unit: 'cm' | 'in';
    presetId: string;
    orientation: 'portrait' | 'landscape';
  };
  viewport: {
    zoom: number;
    panX: number;
    panY: number;
  };
  grid: {
    enabled: boolean;
    type: GridGuideType;
    squareSizeCm: number;
    unit: 'cm' | 'in';
    color: string;
    opacity: number;
    lineWidth: number;
    showMeasurements: boolean;
  };
  filters: {
    enabled: boolean;
    blur: number;
    exposure: number;
    contrast: number;
    highlights: number;
    shadows: number;
    saturation: number;
    showOriginal: boolean;
  };
  values: ValueSettings;
  palette: {
    source: PaletteSource;
    sampleSize: SampleSize;
    swatches: PaletteSwatch[];
    selectedSwatchId: string | null;
  };
};

export const initialWorkspaceState: WorkspaceState = {
  image: null,
  canvas: {
    widthCm: 21,
    heightCm: 29.7,
    unit: 'cm',
    presetId: 'a4',
    orientation: 'portrait',
  },
  viewport: {
    zoom: 1,
    panX: 0,
    panY: 0,
  },
  grid: {
    enabled: true,
    type: 'square',
    squareSizeCm: 5,
    unit: 'cm',
    color: '#f8fafc',
    opacity: 0.3,
    lineWidth: 1,
    showMeasurements: false,
  },
  filters: {
    enabled: false,
    blur: 0,
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    saturation: 100,
    showOriginal: false,
  },
  values: {
    enabled: false,
    mode: 'map',
    levels: 4,
    visibleLevels: 3,
    simplify: 0,
    opacity: 1,
  },
  palette: {
    source: 'filtered',
    sampleSize: 3,
    swatches: [],
    selectedSwatchId: null,
  },
};
