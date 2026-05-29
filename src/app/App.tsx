import { useEffect, useRef, useState } from 'react';
import { references } from '../data/references';
import { ReferenceLibrary } from '../library/ReferenceLibrary';
import type { ReferenceImage } from '../library/referenceTypes';
import { loadLastWorkspace, saveLastWorkspace, saveUploadedImageBlob } from '../storage/workspaceStorage';
import { Workspace } from '../workspace/Workspace';
import { getImageOrientationFromDimensions, orientCanvasToImage, type ImageOrientation } from '../workspace/canvasSizing';
import { AboutPage } from './AboutPage';
import { initialWorkspaceState, type WorkspaceState } from './appState';

type AppView = 'gallery' | 'edit';

export function App() {
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>(initialWorkspaceState);
  const [lastWorkspaceState, setLastWorkspaceState] = useState<WorkspaceState | null>(null);
  const [view, setView] = useState<AppView>('gallery');
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const imageSelectionId = useRef(0);
  const sessionOnlyUploadIds = useRef(new Set<string>());

  useEffect(() => {
    let isMounted = true;

    loadLastWorkspace(references)
      .then((restoredWorkspace) => {
        if (!isMounted || !restoredWorkspace) return;

        setWorkspaceState(restoredWorkspace.state);
        setLastWorkspaceState(restoredWorkspace.state);
      })
      .catch((error) => {
        console.warn('Unable to restore the last workspace.', error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!workspaceState.image) return undefined;
    if (workspaceState.image.sourceType === 'upload' && sessionOnlyUploadIds.current.has(workspaceState.image.id)) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      saveLastWorkspace(workspaceState).catch((error) => {
        console.warn('Unable to save the last workspace.', error);
      });
    }, 400);

    return () => window.clearTimeout(timeout);
  }, [workspaceState]);

  async function selectImage(image: ReferenceImage) {
    const selectionId = imageSelectionId.current + 1;
    imageSelectionId.current = selectionId;
    const orientation = await detectImageOrientation(image.src);
    if (selectionId !== imageSelectionId.current) return;

    const nextState = {
      ...workspaceState,
      image,
      canvas: orientation ? orientCanvasToImage(workspaceState.canvas, orientation) : workspaceState.canvas,
      viewport: {
        zoom: 1,
        panX: 0,
        panY: 0,
      },
    };

    setWorkspaceState(nextState);
    setLastWorkspaceState(nextState);
    setView('edit');
  }

  async function uploadImage(image: ReferenceImage, file: File) {
    try {
      await saveUploadedImageBlob(image.id, file);
      sessionOnlyUploadIds.current.delete(image.id);
    } catch (error) {
      sessionOnlyUploadIds.current.add(image.id);
      console.warn('Unable to save uploaded image locally.', error);
    }

    await selectImage(image);
  }

  function updateWorkspaceState(nextState: WorkspaceState) {
    setWorkspaceState(nextState);
    if (nextState.image) setLastWorkspaceState(nextState);
  }

  function continueLastWorkspace() {
    if (!lastWorkspaceState) return;

    setWorkspaceState(lastWorkspaceState);
    setView('edit');
  }

  return (
    <div className="app-shell" data-view={view}>
      {view === 'gallery' ? (
        <ReferenceLibrary
          references={references}
          selectedImage={workspaceState.image}
          lastWorkspaceImage={lastWorkspaceState?.image ?? null}
          onSelectImage={selectImage}
          onUploadImage={uploadImage}
          onContinueLastWorkspace={continueLastWorkspace}
          onOpenAbout={() => setIsAboutOpen(true)}
        />
      ) : (
        <Workspace
          state={workspaceState}
          onBack={() => setView('gallery')}
          onChange={updateWorkspaceState}
          onOpenAbout={() => setIsAboutOpen(true)}
        />
      )}
      {isAboutOpen ? <AboutPage onClose={() => setIsAboutOpen(false)} /> : null}
    </div>
  );
}

function detectImageOrientation(src: string): Promise<ImageOrientation | null> {
  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      resolve(getImageOrientationFromDimensions(image.naturalWidth, image.naturalHeight));
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}
