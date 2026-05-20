import type { ReferenceImage } from '../library/referenceTypes';

export type WorkspaceState = {
  image: ReferenceImage | null;
  canvas: {
    widthCm: number;
    heightCm: number;
    orientation: 'portrait' | 'landscape';
  };
  viewport: {
    zoom: number;
    panX: number;
    panY: number;
  };
  grid: {
    enabled: boolean;
    spacing: number;
    color: string;
    opacity: number;
    lineWidth: number;
  };
};

export const initialWorkspaceState: WorkspaceState = {
  image: null,
  canvas: {
    widthCm: 50,
    heightCm: 50,
    orientation: 'portrait',
  },
  viewport: {
    zoom: 1,
    panX: 0,
    panY: 0,
  },
  grid: {
    enabled: true,
    spacing: 50,
    color: '#f8fafc',
    opacity: 0.7,
    lineWidth: 1,
  },
};

