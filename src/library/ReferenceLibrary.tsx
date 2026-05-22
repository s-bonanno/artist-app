import { ArrowLeft, Bookmark, Grid2X2, ImagePlus, Plus, Upload, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReferenceImage } from './referenceTypes';

type ReferenceLibraryProps = {
  references: ReferenceImage[];
  selectedImage: ReferenceImage | null;
  onSelectImage: (image: ReferenceImage) => void;
  onUploadImage: (image: ReferenceImage) => void;
};

type LibraryTab = 'upload' | 'library' | 'saved';

type LibraryCategory = {
  id: string;
  label: string;
  description: string;
  tags?: string[];
};

const libraryCategories: LibraryCategory[] = [
  { id: 'all', label: 'All', description: 'Every reference in the library.' },
  { id: 'bargue', label: 'Bargue', description: 'Academic plates for accuracy, proportion, and value.', tags: ['bargue', 'academic'] },
  { id: 'drawing', label: 'Drawing', description: 'Line, proportion, block-in, and careful copy references.', tags: ['drawing'] },
  { id: 'technical', label: 'Technical', description: 'Structured studies for measurement, transfer, and accuracy.', tags: ['technical'] },
  { id: 'portrait', label: 'Portrait', description: 'Heads and portraits for likeness, color, and planes.', tags: ['portrait'] },
  { id: 'figure', label: 'Figure', description: 'Full figure studies, gesture, anatomy, and rhythm.', tags: ['figure'] },
  { id: 'landscape', label: 'Landscape', description: 'Outdoor references for light, atmosphere, and composition.', tags: ['landscape'] },
  { id: 'still-life', label: 'Still life', description: 'Objects, casts, and setups for observation.', tags: ['still-life'] },
  { id: 'color', label: 'Color', description: 'References suited to color mixing and palette studies.', tags: ['color'] },
  { id: 'value', label: 'Value', description: 'References with clear light and shadow families.', tags: ['value'] },
];

export function ReferenceLibrary({
  references,
  selectedImage,
  onSelectImage,
  onUploadImage,
}: ReferenceLibraryProps) {
  const [activeTab, setActiveTab] = useState<LibraryTab>('upload');
  const [activeCategoryId, setActiveCategoryId] = useState('all');
  const [previewImage, setPreviewImage] = useState<ReferenceImage | null>(null);

  const availableCategories = useMemo(() => {
    return libraryCategories
      .map((category) => ({
        ...category,
        count: getReferencesForCategory(references, category).length,
      }))
      .filter((category) => category.id === 'all' || category.count > 0);
  }, [references]);

  const activeCategory = availableCategories.find((category) => category.id === activeCategoryId) ?? availableCategories[0];
  const categoryReferences = getReferencesForCategory(references, activeCategory);
  const featuredReferences = references.filter((reference) => reference.tags?.includes('featured'));
  const suggestedReferences = (featuredReferences.length ? featuredReferences : references).slice(0, 4);

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

  function openLibraryPreview(reference: ReferenceImage) {
    setPreviewImage(reference);
  }

  function usePreviewReference() {
    if (!previewImage) return;

    onSelectImage(previewImage);
  }

  function renderReferenceGrid(items: ReferenceImage[], density: 'compact' | 'regular' = 'regular') {
    return (
      <div className="gallery-grid" data-density={density}>
        {items.map((reference) => {
          const isSelected = selectedImage?.id === reference.id;

          return (
            <button
              className="gallery-card"
              data-selected={isSelected}
              key={reference.id}
              onClick={() => openLibraryPreview(reference)}
            >
              <img src={reference.thumbnailSrc ?? reference.src} alt="" />
              <span>
                <strong>{reference.title}</strong>
                <small>{reference.artist ?? reference.category ?? reference.rights}</small>
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
              <ImagePlus size={24} />
              <strong>Upload your reference</strong>
              <span>Start with your own image, photo, or study reference.</span>
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
                  <span>Sargent, Bargue, and atelier-friendly references for classical study.</span>
                </div>
                <button type="button" onClick={() => setActiveTab('library')}>
                  Browse
                </button>
              </div>
              <div className="suggested-strip">{renderReferenceGrid(suggestedReferences, 'compact')}</div>
            </section>
          </div>
        ) : null}

        {activeTab === 'library' ? (
          <div className="library-panel">
            <div className="library-intent">
              <strong>Choose a study</strong>
              <span>{activeCategory.description}</span>
            </div>

            <div className="category-strip" aria-label="Library categories">
              {availableCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  data-active={activeCategory.id === category.id}
                  onClick={() => setActiveCategoryId(category.id)}
                >
                  <span>{category.label}</span>
                  <small>{category.count}</small>
                </button>
              ))}
            </div>

            <div className="gallery-filter-row">
              <strong>{activeCategory.label}</strong>
              <span>{categoryReferences.length} references</span>
            </div>

            {renderReferenceGrid(categoryReferences)}
          </div>
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

      {previewImage ? (
        <section className="reference-preview" aria-label="Reference preview" role="dialog" aria-modal="true">
          <div className="reference-preview-topbar">
            <button type="button" className="top-icon-button" title="Back to library" onClick={() => setPreviewImage(null)}>
              <ArrowLeft size={20} />
            </button>
            <strong>Preview</strong>
            <button type="button" className="top-icon-button" title="Close preview" onClick={() => setPreviewImage(null)}>
              <X size={20} />
            </button>
          </div>

          <div className="reference-preview-image">
            <img src={previewImage.src} alt="" />
          </div>

          <div className="reference-preview-details">
            <div>
              <strong>{previewImage.title}</strong>
              {previewImage.artist ? (
                <small>
                  {previewImage.artist}
                  {previewImage.year ? `, ${previewImage.year}` : ''}
                </small>
              ) : null}
              <span>{previewImage.description ?? previewImage.category ?? 'Library reference'}</span>
            </div>

            <div className="reference-preview-meta">
              {previewImage.category ? <span>{previewImage.category}</span> : null}
              {previewImage.rights ? <span>{previewImage.rights}</span> : null}
              {previewImage.suggestedUse ? <span>{previewImage.suggestedUse}</span> : null}
              {previewImage.sourceUrl ? (
                <a
                  href={previewImage.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={previewImage.sourceUrl}
                  aria-label={`Open source for ${previewImage.title}`}
                >
                  Source
                </a>
              ) : null}
            </div>

            {previewImage.tags?.length ? (
              <div className="reference-preview-tags">
                {previewImage.tags.slice(0, 6).map((tag) => (
                  <span key={tag}>{formatTag(tag)}</span>
                ))}
              </div>
            ) : null}

            <button type="button" className="primary-action-button" onClick={usePreviewReference}>
              Use reference
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function getReferencesForCategory(references: ReferenceImage[], category: LibraryCategory) {
  if (category.id === 'all') return references;

  return references.filter((reference) => {
    const tags = reference.tags ?? [];
    return category.tags?.some((tag) => tags.includes(tag) || reference.category?.toLowerCase().includes(tag));
  });
}

function formatTag(tag: string) {
  return tag
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
