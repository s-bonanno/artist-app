import { Bookmark, Grid2X2, Plus, Upload } from 'lucide-react';
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
    <main className="gallery-screen" aria-label="Reference library">
      <header className="gallery-topbar">
        <div className="brand-mark">AA</div>
        <h1>Art Assistant</h1>
        <label className="icon-button" title="Upload image">
          <Plus size={18} />
          <input
            type="file"
            accept="image/*"
            className="visually-hidden"
            onChange={(event) => handleUpload(event.target.files?.[0])}
          />
        </label>
      </header>

      <section className="gallery-content">
        <div className="gallery-filter-row">
          <button type="button">
            <span>Bargue Plates</span>
            <span aria-hidden="true">⌄</span>
          </button>
          <span>{references.length} references</span>
        </div>

        <div className="gallery-grid">
          {references.map((reference) => {
            const isSelected = selectedImage?.id === reference.id;

            return (
              <button
                className="gallery-card"
                data-selected={isSelected}
                key={reference.id}
                onClick={() => onSelectImage(reference)}
              >
                <img src={reference.thumbnailSrc ?? reference.src} alt="" />
                <span>
                  <strong>{reference.title}</strong>
                  <small>{reference.rights}</small>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <nav className="gallery-bottom-nav" aria-label="Gallery sections">
        <button type="button" data-active="true">
          <Grid2X2 size={18} />
          <span>Library</span>
        </button>
        <label>
          <Upload size={18} />
          <span>Upload</span>
          <input
            type="file"
            accept="image/*"
            className="visually-hidden"
            onChange={(event) => handleUpload(event.target.files?.[0])}
          />
        </label>
        <button type="button" disabled>
          <Bookmark size={18} />
          <span>Saved</span>
        </button>
      </nav>
    </main>
  );
}
