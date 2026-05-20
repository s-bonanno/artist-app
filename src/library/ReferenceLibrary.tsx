import { ImagePlus, Upload } from 'lucide-react';
import type { ReferenceImage } from './referenceTypes';

type ReferenceLibraryProps = {
  references: ReferenceImage[];
  selectedImage: ReferenceImage | null;
  onSelectImage: (image: ReferenceImage) => void;
  onUploadImage: (image: ReferenceImage) => void;
};

export function ReferenceLibrary({
  references,
  selectedImage,
  onSelectImage,
  onUploadImage,
}: ReferenceLibraryProps) {
  function handleUpload(file: File | undefined) {
    if (!file) return;

    const src = URL.createObjectURL(file);
    onUploadImage({
      id: `upload-${crypto.randomUUID()}`,
      title: file.name,
      sourceType: 'upload',
      src,
      thumbnailSrc: src,
      category: 'Uploaded Images',
      tags: ['upload'],
      rights: 'User supplied',
    });
  }

  return (
    <aside className="library-panel" aria-label="Reference library">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Gallery</p>
          <h1>Art Assistant</h1>
        </div>
        <label className="icon-button" title="Upload image">
          <Upload size={18} />
          <input
            type="file"
            accept="image/*"
            className="visually-hidden"
            onChange={(event) => handleUpload(event.target.files?.[0])}
          />
        </label>
      </div>

      <div className="upload-callout">
        <ImagePlus size={18} />
        <span>Bargue studies and your uploaded references.</span>
      </div>

      <div className="library-section">
        <div className="section-label">Bargue Plates</div>
        <div className="reference-grid">
          {references.map((reference) => {
            const isSelected = selectedImage?.id === reference.id;

            return (
              <button
                className="reference-card"
                data-selected={isSelected}
                key={reference.id}
                onClick={() => onSelectImage(reference)}
              >
                <img src={reference.thumbnailSrc ?? reference.src} alt="" />
                <span>{reference.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {selectedImage ? (
        <div className="reference-details">
          <div className="section-label">Current Reference</div>
          <strong>{selectedImage.title}</strong>
          <span>{selectedImage.category}</span>
          <span>{selectedImage.rights}</span>
        </div>
      ) : null}
    </aside>
  );
}
