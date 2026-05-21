import { Bookmark, Grid2X2, ImagePlus, Plus, Upload } from 'lucide-react';
import { useState } from 'react';
import type { ReferenceImage } from './referenceTypes';

type ReferenceLibraryProps = {
  references: ReferenceImage[];
  selectedImage: ReferenceImage | null;
  onSelectImage: (image: ReferenceImage) => void;
  onUploadImage: (image: ReferenceImage) => void;
};

type LibraryTab = 'upload' | 'library' | 'saved';

export function ReferenceLibrary({
  references,
  selectedImage,
  onSelectImage,
  onUploadImage,
}: ReferenceLibraryProps) {
  const [activeTab, setActiveTab] = useState<LibraryTab>('upload');

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

  function renderReferenceGrid(items = references) {
    return (
      <div className="gallery-grid">
        {items.map((reference) => {
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
    );
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
        {activeTab === 'upload' ? (
          <div className="start-panel">
            <label className="upload-hero">
              <ImagePlus size={28} />
              <strong>Upload your reference</strong>
              <span>Start a workspace from a photo or image file on your device.</span>
              <em>Choose image</em>
              <input
                type="file"
                accept="image/*"
                className="visually-hidden"
                onChange={(event) => handleUpload(event.target.files?.[0])}
              />
            </label>

            <section className="suggested-section" aria-label="Suggested studies">
              <div className="gallery-section-heading">
                <div>
                  <strong>Suggested studies</strong>
                  <span>Bargue plates for proportion, value, and careful setup.</span>
                </div>
                <button type="button" onClick={() => setActiveTab('library')}>
                  View all
                </button>
              </div>
              <div className="suggested-strip">{renderReferenceGrid(references.slice(0, 3))}</div>
            </section>
          </div>
        ) : null}

        {activeTab === 'library' ? (
          <>
            <div className="gallery-filter-row">
              <button type="button">
                <span>Bargue Plates</span>
                <span aria-hidden="true">⌄</span>
              </button>
              <span>{references.length} references</span>
            </div>

            {renderReferenceGrid()}
          </>
        ) : null}

        {activeTab === 'saved' ? (
          <div className="saved-empty-state">
            <Bookmark size={26} />
            <strong>Saved workspaces</strong>
            <span>Saved studies will appear here once saving is added.</span>
          </div>
        ) : null}
      </section>

      <nav className="gallery-bottom-nav" aria-label="Gallery sections">
        <button type="button" data-active={activeTab === 'upload'} onClick={() => setActiveTab('upload')}>
          <Upload size={18} />
          <span>Upload</span>
        </button>
        <button type="button" data-active={activeTab === 'library'} onClick={() => setActiveTab('library')}>
          <Grid2X2 size={18} />
          <span>Library</span>
        </button>
        <button type="button" data-active={activeTab === 'saved'} onClick={() => setActiveTab('saved')}>
          <Bookmark size={18} />
          <span>Saved</span>
        </button>
      </nav>
    </main>
  );
}
