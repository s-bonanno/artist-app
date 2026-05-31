import { ArrowLeft, Bookmark, Grid2X2, History, ImagePlus, Info, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type WheelEvent } from 'react';
import type { RestoredSavedReference } from '../storage/workspaceStorage';
import type { ReferenceCollection, ReferenceImage } from './referenceTypes';

type ReferenceLibraryProps = {
  references: ReferenceImage[];
  selectedImage: ReferenceImage | null;
  lastWorkspaceImage: ReferenceImage | null;
  savedReferences: RestoredSavedReference[];
  onSelectImage: (image: ReferenceImage) => void | Promise<void>;
  onUploadImage: (image: ReferenceImage, file: File) => void | Promise<void>;
  onContinueLastWorkspace: () => void;
  onOpenSavedReference: (savedReferenceId: string) => void;
  onDeleteSavedReference: (savedReferenceId: string) => void;
  onOpenAbout: () => void;
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

type PreviewTransform = {
  scale: number;
  x: number;
  y: number;
};

type PreviewPointer = {
  x: number;
  y: number;
};

type PreviewGesture =
  | {
      type: 'drag';
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startTransform: PreviewTransform;
    }
  | {
      type: 'pinch';
      pointerIds: [number, number];
      startDistance: number;
      startFocal: PreviewPointer;
      startTransform: PreviewTransform;
    };

const defaultPreviewTransform: PreviewTransform = {
  scale: 1,
  x: 0,
  y: 0,
};
const minPreviewScale = 1;
const maxPreviewScale = 6;

const libraryCategories: LibraryCategory[] = [
  { id: 'all', label: 'All', description: 'Every reference in the library.' },
  { id: 'technical', label: 'Technical', description: 'Structured studies for measurement, transfer, and accuracy.', tags: ['technical'] },
  { id: 'portrait', label: 'Portrait', description: 'Heads and portraits for likeness, color, and planes.', tags: ['portrait'] },
  { id: 'figure', label: 'Figure', description: 'Full figure studies, gesture, anatomy, and rhythm.', tags: ['figure'] },
  { id: 'landscape', label: 'Landscape', description: 'Outdoor references for light, atmosphere, and composition.', tags: ['landscape'] },
  { id: 'still-life', label: 'Still life', description: 'Objects, casts, and setups for observation.', tags: ['still-life'] },
  { id: 'florals', label: 'Florals', description: 'Flower studies for edges, colour notes, and painterly grouping.', tags: ['floral'] },
  { id: 'animals', label: 'Animals', description: 'Animal references for structure, gesture, silhouette, and coat textures.', tags: ['animal'] },
];

const browseCategoryTags = new Set(libraryCategories.flatMap((category) => category.tags ?? []));

const libraryCollections: ReferenceCollection[] = [
  {
    id: 'bargue-plates',
    title: 'Bargue Plates',
    description: 'Academic drawing plates for proportion, contour, and value study.',
    coverImageId: 'bargue-course-pl-73',
  },
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
    id: 'florals',
    label: 'Florals',
    description: 'Flower groups, garden colour, and soft edge studies.',
    categoryId: 'florals',
    tags: ['floral'],
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
];

const inspirationCategories: InspirationCategory[] = [
  { id: 'portrait', label: 'Portrait', tags: ['portrait'] },
  { id: 'figure', label: 'Figure', tags: ['figure'] },
  { id: 'landscape', label: 'Landscape', tags: ['landscape'] },
  { id: 'still-life', label: 'Still life', tags: ['still-life'] },
  { id: 'florals', label: 'Florals', tags: ['floral'] },
  { id: 'animals', label: 'Animals', tags: ['animal'] },
  { id: 'technical', label: 'Technical drawing', tags: ['technical'] },
];

export function ReferenceLibrary({
  references,
  selectedImage,
  lastWorkspaceImage,
  savedReferences,
  onSelectImage,
  onUploadImage,
  onContinueLastWorkspace,
  onOpenSavedReference,
  onDeleteSavedReference,
  onOpenAbout,
}: ReferenceLibraryProps) {
  const [activeTab, setActiveTab] = useState<LibraryTab>('upload');
  const [activeCategoryId, setActiveCategoryId] = useState('overview');
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<ReferenceImage | null>(null);
  const [previewTransform, setPreviewTransform] = useState<PreviewTransform>(defaultPreviewTransform);
  const [isPreviewPanning, setIsPreviewPanning] = useState(false);
  const [savedReferencePendingDeleteId, setSavedReferencePendingDeleteId] = useState<string | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const previewImageRef = useRef<HTMLImageElement | null>(null);
  const previewTransformRef = useRef<PreviewTransform>(defaultPreviewTransform);
  const previewPointersRef = useRef<Map<number, PreviewPointer>>(new Map());
  const previewGestureRef = useRef<PreviewGesture | null>(null);

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
  const activeCollection = activeCollectionId
    ? libraryCollections.find((collection) => collection.id === activeCollectionId) ?? null
    : null;
  const activeCollectionReferences = activeCollection ? getReferencesForCollection(references, activeCollection.id) : [];
  const savedReferencePendingDelete =
    savedReferences.find((savedReference) => savedReference.id === savedReferencePendingDeleteId) ?? null;
  const inspirationPicks = useMemo(() => getInspirationPicks(references), [references]);
  const collectionGroups = useMemo(() => {
    return libraryCollections
      .map((collection) => {
        const collectionReferences = getReferencesForCollection(references, collection.id);

        return {
          collection,
          cover: getCollectionCover(collection, collectionReferences, references),
          count: collectionReferences.length,
        };
      })
      .filter((group): group is { collection: ReferenceCollection; cover: ReferenceImage; count: number } => {
        return group.count > 0 && Boolean(group.cover);
      });
  }, [references]);
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
  const isLibraryOverview = activeCategoryId === 'overview' && !activeCollection;

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return undefined;

    const frame = window.requestAnimationFrame(() => {
      content.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, activeCategoryId, activeCollectionId]);

  useEffect(() => {
    previewTransformRef.current = previewTransform;
  }, [previewTransform]);

  useEffect(() => {
    resetPreviewTransform();
  }, [previewImage?.id]);

  function handleUpload(file: File | undefined) {
    if (!file) return;

    const src = URL.createObjectURL(file);
    onUploadImage({
      id: createUploadId(),
      title: file.name,
      sourceType: 'upload',
      src,
      thumbnailSrc: src,
      category: 'Uploaded Images',
      tags: ['upload'],
      rights: 'User supplied',
    }, file);
  }

  function openLibraryPreview(reference: ReferenceImage) {
    setPreviewImage(reference);
  }

  function usePreviewReference() {
    if (!previewImage) return;

    onSelectImage(previewImage);
  }

  function resetPreviewTransform() {
    previewPointersRef.current.clear();
    previewGestureRef.current = null;
    previewTransformRef.current = defaultPreviewTransform;
    setPreviewTransform(defaultPreviewTransform);
    setIsPreviewPanning(false);
  }

  function applyPreviewTransform(nextTransform: PreviewTransform) {
    const clampedTransform = clampPreviewTransform(nextTransform, previewFrameRef.current, previewImageRef.current);

    previewTransformRef.current = clampedTransform;
    setPreviewTransform(clampedTransform);
  }

  function beginPreviewGesture(frame: HTMLDivElement) {
    const pointers = Array.from(previewPointersRef.current);
    const currentTransform = previewTransformRef.current;

    if (pointers.length >= 2) {
      const [firstPointer, secondPointer] = pointers;
      const first = firstPointer[1];
      const second = secondPointer[1];
      const center = getPreviewPointerCenter(first, second);
      const frameRect = frame.getBoundingClientRect();

      previewGestureRef.current = {
        type: 'pinch',
        pointerIds: [firstPointer[0], secondPointer[0]],
        startDistance: getPreviewPointerDistance(first, second),
        startFocal: getPreviewFocalPoint(center, frameRect),
        startTransform: currentTransform,
      };
      setIsPreviewPanning(true);
      return;
    }

    if (pointers.length === 1) {
      const [pointerId, pointer] = pointers[0];

      previewGestureRef.current = {
        type: 'drag',
        pointerId,
        startClientX: pointer.x,
        startClientY: pointer.y,
        startTransform: currentTransform,
      };
      setIsPreviewPanning(currentTransform.scale > 1.001);
      return;
    }

    previewGestureRef.current = null;
    setIsPreviewPanning(false);
  }

  function handlePreviewWheel(event: WheelEvent<HTMLDivElement>) {
    if (!previewImage) return;

    event.preventDefault();
    const currentTransform = previewTransformRef.current;
    const nextScale = clamp(currentTransform.scale * Math.exp(-event.deltaY * 0.002), minPreviewScale, maxPreviewScale);
    const scaleRatio = nextScale / currentTransform.scale;
    const frameRect = event.currentTarget.getBoundingClientRect();
    const focalPoint = getPreviewFocalPoint({ x: event.clientX, y: event.clientY }, frameRect);

    applyPreviewTransform({
      scale: nextScale,
      x: focalPoint.x - (focalPoint.x - currentTransform.x) * scaleRatio,
      y: focalPoint.y - (focalPoint.y - currentTransform.y) * scaleRatio,
    });
  }

  function handlePreviewPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !previewImage) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    previewPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    beginPreviewGesture(event.currentTarget);
  }

  function handlePreviewPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!previewPointersRef.current.has(event.pointerId)) return;

    event.preventDefault();
    previewPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const gesture = previewGestureRef.current;
    if (!gesture) return;

    if (gesture.type === 'pinch') {
      const first = previewPointersRef.current.get(gesture.pointerIds[0]);
      const second = previewPointersRef.current.get(gesture.pointerIds[1]);
      if (!first || !second || gesture.startDistance <= 0) {
        beginPreviewGesture(event.currentTarget);
        return;
      }

      const center = getPreviewPointerCenter(first, second);
      const frameRect = event.currentTarget.getBoundingClientRect();
      const focalPoint = getPreviewFocalPoint(center, frameRect);
      const nextScale = clamp(
        gesture.startTransform.scale * (getPreviewPointerDistance(first, second) / gesture.startDistance),
        minPreviewScale,
        maxPreviewScale,
      );
      const sampledX = (gesture.startFocal.x - gesture.startTransform.x) / gesture.startTransform.scale;
      const sampledY = (gesture.startFocal.y - gesture.startTransform.y) / gesture.startTransform.scale;

      applyPreviewTransform({
        scale: nextScale,
        x: focalPoint.x - sampledX * nextScale,
        y: focalPoint.y - sampledY * nextScale,
      });
      return;
    }

    const pointer = previewPointersRef.current.get(gesture.pointerId);
    if (!pointer) return;

    applyPreviewTransform({
      ...gesture.startTransform,
      x: gesture.startTransform.x + pointer.x - gesture.startClientX,
      y: gesture.startTransform.y + pointer.y - gesture.startClientY,
    });
  }

  function handlePreviewPointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    previewPointersRef.current.delete(event.pointerId);
    beginPreviewGesture(event.currentTarget);
  }

  function handlePreviewDoubleClick(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();

    if (previewTransformRef.current.scale > 1.001) {
      resetPreviewTransform();
      return;
    }

    const frameRect = event.currentTarget.getBoundingClientRect();
    const focalPoint = getPreviewFocalPoint({ x: event.clientX, y: event.clientY }, frameRect);
    const nextScale = 2;

    applyPreviewTransform({
      scale: nextScale,
      x: focalPoint.x - focalPoint.x * nextScale,
      y: focalPoint.y - focalPoint.y * nextScale,
    });
  }

  function confirmDeleteSavedReference() {
    if (!savedReferencePendingDelete) return;

    onDeleteSavedReference(savedReferencePendingDelete.id);
    setSavedReferencePendingDeleteId(null);
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
        <button type="button" className="top-icon-button workspace-info-button" title="About Art Assistant" onClick={onOpenAbout}>
          <Info size={18} />
        </button>
        <h1>Art Assistant</h1>
        <label className="top-icon-button gallery-upload-button" title="Upload image">
          <ImagePlus size={19} />
          <input
            type="file"
            accept="image/*"
            className="visually-hidden"
            onChange={(event) => handleUpload(event.target.files?.[0])}
          />
        </label>
      </header>

      <section className="gallery-content" ref={contentRef}>
        {activeTab === 'upload' ? (
          <div className="start-panel">
            <div className="start-choice-grid" data-has-continue={Boolean(lastWorkspaceImage)}>
              {lastWorkspaceImage ? (
                <button
                  type="button"
                  className="continue-hero"
                  onClick={onContinueLastWorkspace}
                  style={{
                    backgroundImage: `linear-gradient(90deg, rgb(22 22 22 / 0.96), rgb(22 22 22 / 0.82) 48%, rgb(22 22 22 / 0.45)), linear-gradient(0deg, rgb(22 22 22 / 0.2), rgb(22 22 22 / 0.2)), url("${lastWorkspaceImage.thumbnailSrc ?? lastWorkspaceImage.src}")`,
                  }}
                >
                  <History size={24} />
                  <strong>Continue last reference</strong>
                  <span>{lastWorkspaceImage.title}</span>
                  <em>Open reference</em>
                </button>
              ) : null}

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
            </div>

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
                    setActiveCollectionId(null);
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
                    key={`${category.id}-${reference.id}`}
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
                        <button
                          type="button"
                          onClick={() => {
                            setActiveCollectionId(null);
                            setActiveCategoryId(shelf.categoryId);
                          }}
                        >
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

                  {collectionGroups.length > 0 ? (
                    <section className="library-shelf" aria-label="Collections">
                      <div className="library-shelf-heading">
                        <div>
                          <strong>Collections</strong>
                          <span>Curated sets for focused study.</span>
                        </div>
                      </div>

                      <div className="library-shelf-scroll">
                        {collectionGroups.map(({ collection, cover, count }) => (
                          <button
                            type="button"
                            className="gallery-card library-shelf-card library-collection-card"
                            key={collection.id}
                            onClick={() => {
                              setActiveCategoryId('overview');
                              setActiveCollectionId(collection.id);
                            }}
                          >
                            <img src={cover.thumbnailSrc ?? cover.src} alt="" />
                            <span>
                              <small>{count} references</small>
                              <strong>{collection.title}</strong>
                              <em>{collection.description}</em>
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              </>
            ) : activeCollection ? (
              <>
                <div className="library-detail-heading">
                  <button type="button" className="library-back-button" onClick={() => setActiveCollectionId(null)}>
                    <ArrowLeft size={17} />
                    <span>Library</span>
                  </button>
                  <div>
                    <strong>{activeCollection.title}</strong>
                    <span>{activeCollection.description}</span>
                  </div>
                </div>

                <div className="gallery-filter-row">
                  <strong>{activeCollection.title}</strong>
                  <span>{activeCollectionReferences.length} references</span>
                </div>

                {renderReferenceGrid(activeCollectionReferences)}
              </>
            ) : (
              <>
                <div className="library-detail-heading">
                  <button
                    type="button"
                    className="library-back-button"
                    onClick={() => {
                      setActiveCollectionId(null);
                      setActiveCategoryId('overview');
                    }}
                  >
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
                      onClick={() => {
                        setActiveCollectionId(null);
                        setActiveCategoryId(category.id);
                      }}
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
          <div className="saved-panel">
            <div className="saved-intent">
              <strong>Saved</strong>
              <span>Saved references remember your canvas, grid, values, filters, and palette.</span>
            </div>

            {savedReferences.length > 0 ? (
              <div className="saved-card-list">
                {savedReferences.map((savedReference) => {
                  const image = savedReference.state.image;
                  if (!image) return null;

                  return (
                    <article className="saved-card saved-reference-card" key={savedReference.id}>
                      <button type="button" className="saved-card-main" onClick={() => onOpenSavedReference(savedReference.id)}>
                        <img src={image.thumbnailSrc ?? image.src} alt="" />
                        <span>
                          <strong>{image.title}</strong>
                          <em>{formatSavedReferenceDate(savedReference.updatedAt)}</em>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="saved-card-delete"
                        title={`Delete ${image.title}`}
                        aria-label={`Delete ${image.title}`}
                        onClick={() => setSavedReferencePendingDeleteId(savedReference.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="saved-empty-state">
                <Bookmark size={24} />
                <strong>Nothing saved yet</strong>
                <span>Open a reference, then use Save reference from the workspace menu.</span>
              </div>
            )}
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
            setActiveCollectionId(null);
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
          <div className="reference-preview-topbar" data-layout="preview">
            <button type="button" className="top-icon-button workspace-info-button" title="About Art Assistant" onClick={onOpenAbout}>
              <Info size={18} />
            </button>
            <button type="button" className="top-icon-button" title="Back to library" onClick={() => setPreviewImage(null)}>
              <ArrowLeft size={20} />
            </button>
            <strong>Preview</strong>
            <button type="button" className="top-icon-button reference-preview-close-button" title="Close preview" onClick={() => setPreviewImage(null)}>
              <X size={20} />
            </button>
          </div>

          <div
            className="reference-preview-image"
            ref={previewFrameRef}
            data-zoomed={previewTransform.scale > 1.001}
            data-panning={isPreviewPanning}
            onWheel={handlePreviewWheel}
            onPointerDown={handlePreviewPointerDown}
            onPointerMove={handlePreviewPointerMove}
            onPointerUp={handlePreviewPointerEnd}
            onPointerCancel={handlePreviewPointerEnd}
            onDoubleClick={handlePreviewDoubleClick}
          >
            <img
              ref={previewImageRef}
              src={previewImage.src}
              alt=""
              draggable={false}
              style={{
                transform: `translate3d(${previewTransform.x}px, ${previewTransform.y}px, 0) scale(${previewTransform.scale})`,
              }}
            />
          </div>

          <div className="reference-preview-details">
            <div>
              <strong>{previewImage.title}</strong>
              {previewImage.artist ? (
                <small>
                  {previewImage.artistUrl ? (
                    <a
                      className="reference-preview-artist-link"
                      href={previewImage.artistUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={`Read about ${previewImage.artist}`}
                    >
                      {previewImage.artist}
                    </a>
                  ) : (
                    previewImage.artist
                  )}
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

      {savedReferencePendingDelete ? (
        <div className="workspace-leave-overlay" role="presentation">
          <section className="workspace-leave-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-saved-reference-title">
            <button
              type="button"
              className="icon-button compact workspace-leave-close"
              title="Keep saved reference"
              onClick={() => setSavedReferencePendingDeleteId(null)}
            >
              <X size={16} />
            </button>
            <div>
              <strong id="delete-saved-reference-title">Remove saved reference?</strong>
              <span>
                Remove {savedReferencePendingDelete.state.image?.title ?? 'this reference'} from Saved. This will not delete the
                original image.
              </span>
            </div>
            <div className="workspace-reset-actions">
              <button type="button" className="secondary-button" onClick={() => setSavedReferencePendingDeleteId(null)}>
                Cancel
              </button>
              <button type="button" className="primary-action-button" onClick={confirmDeleteSavedReference}>
                Delete
              </button>
            </div>
          </section>
        </div>
      ) : null}

    </main>
  );
}

function formatSavedReferenceDate(timestamp: number | null) {
  if (!timestamp) return 'Updated recently';

  return `Updated ${new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(timestamp))}`;
}

function createUploadId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `upload-${crypto.randomUUID()}`;
  }

  return `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getReferencesForCategory(references: ReferenceImage[], category: LibraryCategory) {
  if (category.id === 'all') return sortCollectionOnlyReferencesLast(references);

  return references.filter((reference) => category.tags?.some((tag) => referenceMatchesTag(reference, tag)));
}

function sortCollectionOnlyReferencesLast(references: ReferenceImage[]) {
  return [...references].sort((first, second) => {
    return Number(isCollectionOnlyReference(first)) - Number(isCollectionOnlyReference(second));
  });
}

function isCollectionOnlyReference(reference: ReferenceImage) {
  const hasBrowseCategoryTag = reference.tags?.some((tag) => browseCategoryTags.has(tag)) ?? false;

  return Boolean(reference.collections?.length) && !hasBrowseCategoryTag;
}

function getReferencesForCollection(references: ReferenceImage[], collectionId: string) {
  return references.filter((reference) => reference.collections?.includes(collectionId));
}

function getCollectionCover(
  collection: ReferenceCollection,
  collectionReferences: ReferenceImage[],
  allReferences: ReferenceImage[],
) {
  return (
    (collection.coverImageId ? allReferences.find((reference) => reference.id === collection.coverImageId) : undefined) ??
    collectionReferences[0]
  );
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
  const targetCount = 8;
  const pickedIds = new Set<string>();
  const picks: Array<{ category: InspirationCategory; reference: ReferenceImage }> = [];

  while (picks.length < targetCount) {
    let pickedInPass = false;

    for (const category of shuffleItems(inspirationCategories)) {
      const matches = references.filter((reference) => {
        return !pickedIds.has(reference.id) && category.tags.some((tag) => referenceMatchesTag(reference, tag));
      });
      const reference = getRandomItem(matches);

      if (reference) {
        pickedIds.add(reference.id);
        picks.push({ category, reference });
        pickedInPass = true;
      }

      if (picks.length === targetCount) break;
    }

    if (!pickedInPass) break;
  }

  return picks;
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

function clampPreviewTransform(
  transform: PreviewTransform,
  frame: HTMLDivElement | null,
  image: HTMLImageElement | null,
): PreviewTransform {
  const scale = clamp(transform.scale, minPreviewScale, maxPreviewScale);

  if (scale <= 1.001 || !frame || !image) {
    return defaultPreviewTransform;
  }

  const frameWidth = frame.clientWidth;
  const frameHeight = frame.clientHeight;
  const imageWidth = image.offsetWidth;
  const imageHeight = image.offsetHeight;
  const maxX = Math.max(0, (imageWidth * scale - frameWidth) / 2 + 18);
  const maxY = Math.max(0, (imageHeight * scale - frameHeight) / 2 + 18);

  return {
    scale,
    x: clamp(transform.x, -maxX, maxX),
    y: clamp(transform.y, -maxY, maxY),
  };
}

function getPreviewPointerDistance(first: PreviewPointer, second: PreviewPointer) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function getPreviewPointerCenter(first: PreviewPointer, second: PreviewPointer) {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

function getPreviewFocalPoint(point: PreviewPointer, frameRect: DOMRect) {
  return {
    x: point.x - frameRect.left - frameRect.width / 2,
    y: point.y - frameRect.top - frameRect.height / 2,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatSourceSummary(image: ReferenceImage) {
  return [image.credit, image.rights].filter(Boolean).join(' · ');
}
