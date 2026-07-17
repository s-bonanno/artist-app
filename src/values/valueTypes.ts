export type ValueMode = 'map' | 'color' | 'grayscale';

export type ValueSettings = {
  enabled: boolean;
  mode: ValueMode;
  levels: number;
  visibleLevels: number;
  simplify: number;
  colorDetail: number;
  opacity: number;
};
