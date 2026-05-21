export type ValueMode = 'map' | 'shadows' | 'lights';

export type ValueSettings = {
  enabled: boolean;
  mode: ValueMode;
  levels: number;
  visibleLevels: number;
  opacity: number;
};

