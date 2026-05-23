import { ArrowLeft, Bookmark, ExternalLink, Grid2X2, Heart, ImagePlus, Info, Upload, X } from 'lucide-react';
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

type LibraryShelf = {
  id: string;
  label: string;
  description: string;
  categoryId: string;
  tags: string[];
};

type InspirationCategory = {
  id: string;
  label: string;
  tags: string[];
};

const libraryCategories: LibraryCategory[] = [
  { id: 'all', label: 'All', description: 'Every reference in the library.' },
  { id: 'bargue', label: 'Bargue', description: 'Academic plates for accuracy, proportion, and value.', tags: ['bargue'] },
  { id: 'drawing', label: 'Drawing', description: 'Line, proportion, block-in, and careful copy references.', tags: ['drawing'] },
  { id: 'technical', label: 'Technical', description: 'Structured studies for measurement, transfer, and accuracy.', tags: ['technical'] },
  { id: 'portrait', label: 'Portrait', description: 'Heads and portraits for likeness, color, and planes.', tags: ['portrait'] },
  { id: 'figure', label: 'Figure', description: 'Full figure studies, gesture, anatomy, and rhythm.', tags: ['figure'] },
  { id: 'landscape', label: 'Landscape', description: 'Outdoor references for light, atmosphere, and composition.', tags: ['landscape'] },
  { id: 'still-life', label: 'Still life', description: 'Objects, casts, and setups for observation.', tags: ['still-life'] },
  { id: 'animals', label: 'Animals', description: 'Animal references for structure, gesture, silhouette, and coat textures.', tags: ['animal'] },
];

const libraryShelves: LibraryShelf[] = [
  {
    id: 'portraits',
    label: 'Portrait studies',
    description: 'Heads, likeness, planes, and controlled flesh colour.',
    categoryId: 'portrait',
    tags: ['portrait'],
  },
  {
    id: 'figures',
    label: 'Figure studies',
    description: 'Gesture, anatomy, rhythm, and figure groupings.',
    categoryId: 'figure',
    tags: ['figure'],
  },
  {
    id: 'still-life',
    label: 'Still life',
    description: 'Objects, edges, reflections, and colour mixing.',
    categoryId: 'still-life',
    tags: ['still-life'],
  },
  {
    id: 'landscapes',
    label: 'Landscape',
    description: 'Atmosphere, light, composition, and outdoor colour.',
    categoryId: 'landscape',
    tags: ['landscape'],
  },
  {
    id: 'animals',
    label: 'Animals',
    description: 'Horses, cattle, and animal studies for gesture, structure, and anatomy.',
    categoryId: 'animals',
    tags: ['animal'],
  },
  {
    id: 'technical-drawing',
    label: 'Technical drawing',
    description: 'Bargue, master drawings, drapery, and construction studies.',
    categoryId: 'technical',
    tags: ['technical'],
  },
];

const inspirationCategories: InspirationCategory[] = [
  { id: 'portrait', label: 'Portrait', tags: ['portrait'] },
  { id: 'figure', label: 'Figure', tags: ['figure'] },
  { id: 'landscape', label: 'Landscape', tags: ['landscape'] },
  { id: 'still-life', label: 'Still life', tags: ['still-life'] },
  { id: 'animals', label: 'Animals', tags: ['animal'] },
  { id: 'technical', label: 'Technical drawing', tags: ['technical', 'bargue'] },
];

export function ReferenceLibrary({
  references,
  selectedImage,
  onSelectImage,
  onUploadImage,
}: ReferenceLibraryProps) {
  const [activeTab, setActiveTab] = useState<LibraryTab>('upload');
  const [activeCategoryId, setActiveCategoryId] = useState('overview');
  const [previewImage, setPreviewImage] = useState<ReferenceImage | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);

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
  const inspirationPicks = useMemo(() => getInspirationPicks(references), [references]);
  const libraryShelfGroups = useMemo(() => {
    return libraryShelves
      .map((shelf) => {
        const shelfReferences = getShelfReferences(references, shelf);

        return {
          shelf,
          references: shelfReferences.slice(0, 8),
          count: shelfReferences.length,
        };
      })
      .filter((group) => group.references.length > 0);
  }, [references]);
  const isLibraryOverview = activeCategoryId === 'overview';

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
        <button type="button" className="icon-button brand-info-button" title="About Art Assistant" onClick={() => setIsAboutOpen(true)}>
          <Info size={18} />
        </button>
        <h1>Art Assistant</h1>
        <label className="icon-button" title="Upload image">
          <ImagePlus size={19} />
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

            <section className="inspiration-section" aria-label="Looking for inspiration">
              <div className="inspiration-heading">
                <div>
                  <strong>Looking for inspiration?</strong>
                  <span>A rotating set of studies from the library.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('library');
                    setActiveCategoryId('overview');
                  }}
                >
                  Browse library
                </button>
              </div>
              <div className="inspiration-grid">
                {inspirationPicks.map(({ category, reference }) => (
                  <button
                    type="button"
                    className="inspiration-card"
                    key={category.id}
                    onClick={() => openLibraryPreview(reference)}
                  >
                    <img src={reference.thumbnailSrc ?? reference.src} alt="" />
                    <span>
                      <small>{category.label}</small>
                      <strong>{reference.title}</strong>
                      <em>{reference.artist ?? reference.category}</em>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {activeTab === 'library' ? (
          <div className="library-panel">
            {isLibraryOverview ? (
              <>
                <div className="library-intent">
                  <strong>Library</strong>
                  <span>Browse curated study groups from the reference collection.</span>
                </div>

                <div className="library-shelves">
                  {libraryShelfGroups.map(({ shelf, references: shelfReferences, count }) => (
                    <section className="library-shelf" key={shelf.id} aria-label={shelf.label}>
                      <div className="library-shelf-heading">
                        <div>
                          <strong>{shelf.label}</strong>
                          <span>{shelf.description}</span>
                        </div>
                        <button type="button" onClick={() => setActiveCategoryId(shelf.categoryId)}>
                          View all
                          <small>{count}</small>
                        </button>
                      </div>

                      <div className="library-shelf-scroll">
                        {shelfReferences.map((reference) => (
                          <button
                            type="button"
                            className="gallery-card library-shelf-card"
                            data-selected={selectedImage?.id === reference.id}
                            key={`${shelf.id}-${reference.id}`}
                            onClick={() => openLibraryPreview(reference)}
                          >
                            <img src={reference.thumbnailSrc ?? reference.src} alt="" />
                            <span>
                              <strong>{reference.title}</strong>
                              <small>{reference.artist ?? reference.category ?? reference.rights}</small>
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="library-detail-heading">
                  <button type="button" className="library-back-button" onClick={() => setActiveCategoryId('overview')}>
                    <ArrowLeft size={17} />
                    <span>Library</span>
                  </button>
                  <div>
                    <strong>{activeCategory.label}</strong>
                    <span>{activeCategory.description}</span>
                  </div>
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
              </>
            )}
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
        <button
          type="button"
          data-active={activeTab === 'library'}
          onClick={() => {
            setActiveTab('library');
            setActiveCategoryId('overview');
          }}
        >
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

            {previewImage.sourceUrl ? (
              <div className="reference-preview-source">
                <span>
                  <strong>Source</strong>
                  <small>{formatSourceSummary(previewImage)}</small>
                </span>
                <a
                  href={previewImage.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={previewImage.sourceUrl}
                  aria-label={`Open source for ${previewImage.title}`}
                >
                  Open
                </a>
              </div>
            ) : null}

            <button type="button" className="primary-action-button" onClick={usePreviewReference}>
              Use reference
            </button>
          </div>
        </section>
      ) : null}

      {isAboutOpen ? (
        <section className="about-page" aria-label="About Art Assistant" role="dialog" aria-modal="true">
          <div className="reference-preview-topbar">
            <button type="button" className="top-icon-button" title="Close about" onClick={() => setIsAboutOpen(false)}>
              <X size={20} />
            </button>
            <strong>About</strong>
            <span aria-hidden="true" />
          </div>

          <div className="about-content">
            <section className="about-intro">
              <span className="about-mark">AA</span>
              <h2>Art Assistant</h2>
              <p>
                A studio reference tool by Scott Bonanno for artists studying drawing, colour, value, and traditional
                painting methods.
              </p>
            </section>

            <section className="about-section">
              <h3>Getting Started</h3>
              <div className="about-steps">
                <p>Upload your own reference, or choose a study image from the library.</p>
                <p>Set the canvas size and grid so the reference can translate to a real painting surface.</p>
                <p>Use Values, Filters, and Palette tools to study shape, tone, colour, and mixing notes.</p>
              </div>
            </section>

            <section className="about-section">
              <h3>About Scott</h3>
              <p>
                Scott is an Australian painter interested in classical technique, careful observation, and practical
                tools that make the studio process clearer.
              </p>
            </section>

            <section className="about-links" aria-label="Scott Bonanno links">
              <a href="https://www.scottpaints.com.au/" target="_blank" rel="noreferrer">
                <span>
                  <strong>Website</strong>
                  <small>scottpaints.com.au</small>
                </span>
                <ExternalLink size={15} />
              </a>
              <a href="https://www.instagram.com/scottbonanno" target="_blank" rel="noreferrer">
                <span>
                  <strong>Instagram</strong>
                  <small>@scottbonanno</small>
                </span>
                <ExternalLink size={15} />
              </a>
              <a href="https://buy.stripe.com/fZu3coc7vcxIfUp35Hes000" target="_blank" rel="noreferrer">
                <span>
                  <strong>Support the app</strong>
                  <small>A small donation helps keep this project moving.</small>
                </span>
                <Heart size={15} />
              </a>
            </section>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function getReferencesForCategory(references: ReferenceImage[], category: LibraryCategory) {
  if (category.id === 'all') return references;

  return references.filter((reference) => category.tags?.some((tag) => referenceMatchesTag(reference, tag)));
}

function getShelfReferences(references: ReferenceImage[], shelf: LibraryShelf) {
  return references
    .filter((reference) => shelf.tags.some((tag) => referenceMatchesTag(reference, tag)))
    .sort((first, second) => {
      const firstIsBargue = first.tags?.includes('bargue') ? 1 : 0;
      const secondIsBargue = second.tags?.includes('bargue') ? 1 : 0;
      const firstFeatured = first.tags?.includes('featured') ? 1 : 0;
      const secondFeatured = second.tags?.includes('featured') ? 1 : 0;

      if (shelf.id === 'technical-drawing' && firstIsBargue !== secondIsBargue) {
        return firstIsBargue - secondIsBargue;
      }

      return secondFeatured - firstFeatured;
    });
}

function referenceMatchesTag(reference: ReferenceImage, tag: string) {
  const tags = reference.tags ?? [];
  return tags.includes(tag) || Boolean(reference.category?.toLowerCase().includes(tag));
}

function getInspirationPicks(references: ReferenceImage[]) {
  return shuffleItems(inspirationCategories).slice(0, 4).flatMap((category) => {
    const matches = references.filter((reference) => {
      const tags = reference.tags ?? [];
      return category.tags.some((tag) => tags.includes(tag));
    });
    const reference = getRandomItem(matches);

    return reference ? [{ category, reference }] : [];
  });
}

function getRandomItem<T>(items: T[]) {
  if (!items.length) return null;

  return items[Math.floor(Math.random() * items.length)];
}

function shuffleItems<T>(items: T[]) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function formatSourceSummary(image: ReferenceImage) {
  return [image.credit, image.rights].filter(Boolean).join(' · ');
}
