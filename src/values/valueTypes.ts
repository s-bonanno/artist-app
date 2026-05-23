export type ValueMode = 'map' | 'grayscale';

export type ValueSettings = {
  enabled: boolean;
  mode: ValueMode;
  levels: number;
  visibleLevels: number;
  simplify: number;
  opacity: number;
};
