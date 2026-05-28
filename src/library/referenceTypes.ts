export type ImageSourceType = 'library' | 'upload' | 'saved';

export type ReferenceImage = {
  id: string;
  title: string;
  sourceType: ImageSourceType;
  src: string;
  thumbnailSrc?: string;
  category?: string;
  description?: string;
  suggestedUse?: string;
  artist?: string;
  artistUrl?: string;
  year?: string;
  sourceUrl?: string;
  tags?: string[];
  collections?: string[];
  credit?: string;
  rights?: string;
};

export type ReferenceCollection = {
  id: string;
  title: string;
  description: string;
  coverImageId?: string;
};
