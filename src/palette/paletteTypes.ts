export type PaletteSource = 'original' | 'filtered';

export type SampleSize = 3;

export type RgbColor = [number, number, number];

export type PaletteSwatch = {
  id: string;
  name?: string;
  hex: string;
  rgb: RgbColor;
  source: PaletteSource;
  sampleSize: SampleSize;
  imagePoint: {
    x: number;
    y: number;
  };
};

export type ColorSample = Omit<PaletteSwatch, 'id' | 'name'>;
