import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { loadAppView, saveAppView, type AppView } from '../storage/sessionStorage';
import { references } from '../data/references';
import { ReferenceLibrary } from '../library/ReferenceLibrary';
import type { ReferenceImage } from '../library/referenceTypes';
import {
  clearTrackedSavedReference,
  deleteSavedReference,
  getSavedReferenceId,
  getWorkspaceDefaults,
  loadDefaultWorkspace,
  loadLastWorkspace,
  loadSavedReferences,
  loadTrackedSavedReference,
  saveDefaultWorkspace,
  saveLastWorkspace,
  saveReferenceWorkspace,
  saveTrackedSavedReference,
  saveUploadedImageBlob,
  type RestoredSavedReference,
  type WorkspaceDefaults,
} from '../storage/workspaceStorage';
import { Workspace } from '../workspace/Workspace';
import { getImageOrientationFromDimensions, orientCanvasToImage, type ImageOrientation } from '../workspace/canvasSizing';
import { AboutPage } from './AboutPage';
import { initialWorkspaceState, type WorkspaceState } from './appState';

type DefaultSettingsState = {
  settings: WorkspaceDefaults;
  isCustom: boolean;
};

export function App() {
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>(initialWorkspaceState);
  const [defaultSettings, setDefaultSettings] = useState<DefaultSettingsState>(getInitialDefaultSettingsState);
  const [lastWorkspaceState, setLastWorkspaceState] = useState<WorkspaceState | null>(null);
  const [savedReferences, setSavedReferences] = useState<RestoredSavedReference[]>([]);
  const [activeSavedReferenceId, setActiveSavedReferenceId] = useState<string | null>(loadTrackedSavedReference);
  const [view, setView] = useState<AppView>('gallery');
  const [isRestoring, setIsRestoring] = useState(true);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const imageSelectionId = useRef(0);
  const sessionOnlyUploadIds = useRef(new Set<string>());
  const latestWorkspace = useRef({ state: workspaceState, savedId: activeSavedReferenceId });
  useLayoutEffect(() => {
    latestWorkspace.current = { state: workspaceState, savedId: activeSavedReferenceId };
  }, [workspaceState, activeSavedReferenceId]);

  useEffect(() => {
    let isMounted = true;

    const workspaceRestore = loadLastWorkspace(references)
      .then((restoredWorkspace) => {
        if (!isMounted) return;

        if (!restoredWorkspace) {
          setActiveSavedReferenceId(null);
          clearTrackedSavedReference();
          return;
        }

        setWorkspaceState(restoredWorkspace.state);
        setLastWorkspaceState(restoredWorkspace.state);
        setView(loadAppView());
      })
      .catch((error) => {
        console.warn('Unable to restore the last workspace.', error);
      });

    const referencesRestore = loadSavedReferences(references)
      .then((restoredReferences) => {
        if (!isMounted) return;

        setSavedReferences(restoredReferences);
        setActiveSavedReferenceId((currentId) => {
          if (!currentId) return null;
          if (restoredReferences.some((reference) => reference.id === currentId)) return currentId;

          clearTrackedSavedReference();
          return null;
        });
      })
      .catch((error) => {
        console.warn('Unable to restore saved references.', error);
      });

    Promise.all([workspaceRestore, referencesRestore]).finally(() => {
      if (isMounted) setIsRestoring(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (!isRestoring) saveAppView(view);
  }, [view, isRestoring]);

  function persistWorkspace(state: WorkspaceState, savedId: string | null) {
    if (!state.image || (state.image.sourceType === 'upload' && sessionOnlyUploadIds.current.has(state.image.id))) return;
    saveLastWorkspace(state).catch((error) => console.warn('Unable to save the last workspace.', error));
    try {
      if (savedId && getSavedReferenceId(state.image) === savedId) {
        const savedReference = saveReferenceWorkspace(state);
        if (savedReference) updateSavedReferenceList(savedReference, setSavedReferences);
      }
    } catch (error) { console.warn('Unable to update the saved reference.', error); }
  }

  useEffect(() => {
    if (isRestoring) return;
    const flush = () => {
      const { state, savedId } = latestWorkspace.current;
      persistWorkspace(state, savedId);
    };
    const onVisibilityChange = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isRestoring]);

  useEffect(() => {
    if (isRestoring) return;
    if (!workspaceState.image) return undefined;
    const workspaceImage = workspaceState.image;
    if (workspaceImage.sourceType === 'upload' && sessionOnlyUploadIds.current.has(workspaceImage.id)) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      persistWorkspace(workspaceState, activeSavedReferenceId);
    }, 400);

    return () => window.clearTimeout(timeout);
  }, [activeSavedReferenceId, workspaceState, isRestoring]);

  async function selectImage(image: ReferenceImage) {
    const selectionId = imageSelectionId.current + 1;
    imageSelectionId.current = selectionId;
    const orientation = await detectImageOrientation(image.src);
    if (selectionId !== imageSelectionId.current) return;

    const nextState = {
      ...createWorkspaceFromDefaults(defaultSettings.settings, orientation),
      image,
    };

    setActiveSavedReferenceId(null);
    clearTrackedSavedReference();
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
    if (nextState.image) {
      setLastWorkspaceState(nextState);
    }
  }

  function continueLastWorkspace() {
    if (!lastWorkspaceState) return;

    setWorkspaceState(lastWorkspaceState);
    setView('edit');
  }

  function openSavedReference(savedReferenceId: string) {
    const savedReference = savedReferences.find((reference) => reference.id === savedReferenceId);
    if (!savedReference) return;

    setWorkspaceState(savedReference.state);
    setLastWorkspaceState(savedReference.state);
    setActiveSavedReferenceId(savedReference.id);
    saveTrackedSavedReference(savedReference.id);
    setView('edit');
  }

  function saveCurrentReference(state: WorkspaceState) {
    const savedReference = saveReferenceWorkspace(state);
    if (!savedReference) return;

    setActiveSavedReferenceId(savedReference.id);
    saveTrackedSavedReference(savedReference.id);
    updateSavedReferenceList(savedReference, setSavedReferences);
  }

  function removeSavedReference(savedReferenceId: string) {
    deleteSavedReference(savedReferenceId);
    if (activeSavedReferenceId === savedReferenceId) {
      setActiveSavedReferenceId(null);
      clearTrackedSavedReference();
    }

    setSavedReferences((currentReferences) => currentReferences.filter((reference) => reference.id !== savedReferenceId));
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

  const isCurrentReferenceSaved = Boolean(
    workspaceState.image && activeSavedReferenceId === getSavedReferenceId(workspaceState.image),
  );

  if (isRestoring) return <div className="app-shell" role="status" aria-label="Restoring your session" />;

  return (
    <div className="app-shell" data-view={view}>
      {view === 'gallery' ? (
        <ReferenceLibrary
          references={references}
          selectedImage={workspaceState.image}
          lastWorkspaceImage={lastWorkspaceState?.image ?? null}
          savedReferences={savedReferences}
          onSelectImage={selectImage}
          onUploadImage={uploadImage}
          onContinueLastWorkspace={continueLastWorkspace}
          onOpenSavedReference={openSavedReference}
          onDeleteSavedReference={removeSavedReference}
          onOpenAbout={() => setIsAboutOpen(true)}
        />
      ) : (
        <Workspace
          state={workspaceState}
          onBack={() => setView('gallery')}
          onChange={updateWorkspaceState}
          hasCustomDefaultSettings={defaultSettings.isCustom}
          isCurrentReferenceSaved={isCurrentReferenceSaved}
          onSaveReference={saveCurrentReference}
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
    view: { ...initialWorkspaceState.view },
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

function updateSavedReferenceList(
  savedReference: RestoredSavedReference,
  setSavedReferences: Dispatch<SetStateAction<RestoredSavedReference[]>>,
) {
  setSavedReferences((currentReferences) =>
    [savedReference, ...currentReferences.filter((reference) => reference.id !== savedReference.id)].sort(
      (first, second) => second.updatedAt - first.updatedAt,
    ),
  );
}
