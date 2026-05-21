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
    squareSizeCm: number;
    unit: 'cm' | 'in';
    color: string;
    opacity: number;
    lineWidth: number;
  };
  filters: {
    blur: number;
    exposure: number;
    contrast: number;
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
    widthCm: 30.48,
    heightCm: 40.64,
    unit: 'in',
    presetId: 'rect-12x16',
    orientation: 'portrait',
  },
  viewport: {
    zoom: 1,
    panX: 0,
    panY: 0,
  },
  grid: {
    enabled: true,
    squareSizeCm: 5.08,
    unit: 'in',
    color: '#f8fafc',
    opacity: 0.7,
    lineWidth: 1,
  },
  filters: {
    blur: 0,
    exposure: 0,
    contrast: 0,
    showOriginal: false,
  },
  values: {
    enabled: false,
    mode: 'map',
    levels: 6,
    visibleLevels: 3,
    opacity: 1,
  },
  palette: {
    source: 'filtered',
    sampleSize: 3,
    swatches: [],
    selectedSwatchId: null,
  },
};
