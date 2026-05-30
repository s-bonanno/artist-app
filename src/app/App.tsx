import { useEffect, useRef, useState } from 'react';
import { references } from '../data/references';
import { ReferenceLibrary } from '../library/ReferenceLibrary';
import type { ReferenceImage } from '../library/referenceTypes';
import {
  getWorkspaceDefaults,
  loadDefaultWorkspace,
  loadLastWorkspace,
  saveDefaultWorkspace,
  saveLastWorkspace,
  saveUploadedImageBlob,
  type WorkspaceDefaults,
} from '../storage/workspaceStorage';
import { Workspace } from '../workspace/Workspace';
import { getImageOrientationFromDimensions, orientCanvasToImage, type ImageOrientation } from '../workspace/canvasSizing';
import { AboutPage } from './AboutPage';
import { initialWorkspaceState, type WorkspaceState } from './appState';

type AppView = 'gallery' | 'edit';
type DefaultSettingsState = {
  settings: WorkspaceDefaults;
  isCustom: boolean;
};

export function App() {
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>(initialWorkspaceState);
  const [defaultSettings, setDefaultSettings] = useState<DefaultSettingsState>(getInitialDefaultSettingsState);
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
      ...createWorkspaceFromDefaults(defaultSettings.settings, orientation),
      image,
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

  function saveCurrentSettingsAsDefault(state: WorkspaceState) {
    const settings = getWorkspaceDefaults(state);

    saveDefaultWorkspace(settings);
    setDefaultSettings({
      settings,
      isCustom: true,
    });
  }

  async function applyDefaultSettingsToCurrentReference() {
    const orientation = workspaceState.image ? await detectImageOrientation(workspaceState.image.src) : null;
    const nextState = {
      ...workspaceState,
      ...createWorkspaceFromDefaults(defaultSettings.settings, orientation),
      image: workspaceState.image,
      palette: workspaceState.palette,
    };

    updateWorkspaceState(nextState);
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
          hasCustomDefaultSettings={defaultSettings.isCustom}
          onSaveDefaultSettings={saveCurrentSettingsAsDefault}
          onApplyDefaultSettings={applyDefaultSettingsToCurrentReference}
          onOpenAbout={() => setIsAboutOpen(true)}
        />
      )}
      {isAboutOpen ? <AboutPage onClose={() => setIsAboutOpen(false)} /> : null}
    </div>
  );
}

function getInitialDefaultSettingsState(): DefaultSettingsState {
  const restoredDefault = loadDefaultWorkspace();

  return {
    settings: restoredDefault?.settings ?? getWorkspaceDefaults(initialWorkspaceState),
    isCustom: Boolean(restoredDefault),
  };
}

function createWorkspaceFromDefaults(
  defaults: WorkspaceDefaults,
  imageOrientation: ImageOrientation | null,
): Omit<WorkspaceState, 'image'> {
  return {
    canvas: imageOrientation ? orientCanvasToImage(defaults.canvas, imageOrientation) : { ...defaults.canvas },
    viewport: { ...initialWorkspaceState.viewport },
    grid: { ...defaults.grid },
    filters: { ...defaults.filters, showOriginal: false },
    values: { ...defaults.values },
    palette: { ...initialWorkspaceState.palette },
  };
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
