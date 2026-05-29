import { useRef, useState } from 'react';
import { references } from '../data/references';
import { ReferenceLibrary } from '../library/ReferenceLibrary';
import type { ReferenceImage } from '../library/referenceTypes';
import { Workspace } from '../workspace/Workspace';
import { canvasPresets, convertToCm } from '../workspace/canvasSizing';
import { AboutPage } from './AboutPage';
import { initialWorkspaceState, type WorkspaceState } from './appState';

type AppView = 'gallery' | 'edit';
type ImageOrientation = WorkspaceState['canvas']['orientation'] | 'square';

export function App() {
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>(initialWorkspaceState);
  const [view, setView] = useState<AppView>('gallery');
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const imageSelectionId = useRef(0);

  async function selectImage(image: ReferenceImage) {
    const selectionId = imageSelectionId.current + 1;
    imageSelectionId.current = selectionId;
    const orientation = await detectImageOrientation(image.src);
    if (selectionId !== imageSelectionId.current) return;

    setWorkspaceState((current) => ({
      ...current,
      image,
      canvas: orientation ? orientCanvasToImage(current.canvas, orientation) : current.canvas,
      viewport: {
        zoom: 1,
        panX: 0,
        panY: 0,
      },
    }));
    setView('edit');
  }

  return (
    <div className="app-shell" data-view={view}>
      {view === 'gallery' ? (
        <ReferenceLibrary
          references={references}
          selectedImage={workspaceState.image}
          onSelectImage={selectImage}
          onUploadImage={selectImage}
          onOpenAbout={() => setIsAboutOpen(true)}
        />
      ) : (
        <Workspace
          state={workspaceState}
          onBack={() => setView('gallery')}
          onChange={setWorkspaceState}
          onOpenAbout={() => setIsAboutOpen(true)}
        />
      )}
      {isAboutOpen ? <AboutPage onClose={() => setIsAboutOpen(false)} /> : null}
    </div>
  );
}

function orientCanvasToImage(
  canvas: WorkspaceState['canvas'],
  imageOrientation: ImageOrientation,
): WorkspaceState['canvas'] {
  if (imageOrientation === 'square') {
    const squarePreset = canvasPresets.find((preset) => preset.width === preset.height);

    if (!squarePreset) return canvas;

    const sizeCm = convertToCm(squarePreset.width, squarePreset.unit);

    return {
      ...canvas,
      widthCm: sizeCm,
      heightCm: sizeCm,
      unit: squarePreset.unit,
      presetId: squarePreset.id,
      orientation: 'portrait',
    };
  }

  const canvasIsLandscape = canvas.widthCm >= canvas.heightCm;
  const imageIsLandscape = imageOrientation === 'landscape';

  if (canvasIsLandscape === imageIsLandscape) {
    return {
      ...canvas,
      orientation: imageOrientation,
    };
  }

  return {
    ...canvas,
    widthCm: canvas.heightCm,
    heightCm: canvas.widthCm,
    orientation: imageOrientation,
  };
}

function detectImageOrientation(src: string): Promise<ImageOrientation | null> {
  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        resolve(null);
        return;
      }

      if (image.naturalWidth === image.naturalHeight) {
        resolve('square');
        return;
      }

      resolve(image.naturalWidth > image.naturalHeight ? 'landscape' : 'portrait');
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}
