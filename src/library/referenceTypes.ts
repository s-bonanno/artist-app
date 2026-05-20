export type ImageSourceType = 'library' | 'upload' | 'saved';

export type ReferenceImage = {
  id: string;
  title: string;
  sourceType: ImageSourceType;
  src: string;
  thumbnailSrc?: string;
  category?: string;
  tags?: string[];
  credit?: string;
  rights?: string;
};

