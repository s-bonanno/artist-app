import { initialWorkspaceState, type WorkspaceState } from '../app/appState';
import type { ReferenceImage } from '../library/referenceTypes';

const databaseName = 'art-assistant-local';
const databaseVersion = 1;
const uploadedImagesStore = 'uploaded-images';
const lastWorkspaceKey = 'art-assistant:last-workspace';
const defaultWorkspaceKey = 'art-assistant:default-workspace';
const savedReferencesKey = 'art-assistant:saved-references';
const trackedSavedReferenceKey = 'art-assistant:tracked-saved-reference';

export type WorkspaceDefaults = Pick<WorkspaceState, 'canvas' | 'grid' | 'filters' | 'values'>;

type StoredWorkspaceImage =
  | {
      sourceType: 'library';
      id: string;
    }
  | {
      sourceType: 'upload';
      id: string;
      title: string;
      blobId: string;
      category?: string;
      tags?: string[];
      rights?: string;
    };

type StoredWorkspace = {
  version: 1;
  updatedAt: number;
  image: StoredWorkspaceImage;
  state: Partial<Omit<WorkspaceState, 'image'>>;
};

type StoredWorkspaceDefaults = {
  version: 1;
  updatedAt: number;
  settings: Partial<WorkspaceDefaults>;
};

type StoredSavedReference = StoredWorkspace & {
  id: string;
};

export type RestoredWorkspace = {
  state: WorkspaceState;
  updatedAt: number;
};

export type RestoredWorkspaceDefaults = {
  settings: WorkspaceDefaults;
  updatedAt: number;
};

export type RestoredSavedReference = {
  id: string;
  state: WorkspaceState;
  updatedAt: number;
};

export async function saveUploadedImageBlob(id: string, blob: Blob) {
  const database = await openWorkspaceDatabase();
  await runTransaction(database, uploadedImagesStore, 'readwrite', (store) => {
    store.put(blob, id);
  });
}

export async function saveLastWorkspace(state: WorkspaceState) {
  if (!state.image) return;

  const storedWorkspace = serializeWorkspace(state);

  window.localStorage.setItem(lastWorkspaceKey, JSON.stringify(storedWorkspace));
}

export async function loadLastWorkspace(references: ReferenceImage[]): Promise<RestoredWorkspace | null> {
  const storedWorkspace = readStoredWorkspace();

  if (!storedWorkspace) return null;

  const image = await restoreImage(storedWorkspace.image, references);

  if (!image) {
    clearLastWorkspace();
    return null;
  }

  return {
    updatedAt: storedWorkspace.updatedAt,
    state: {
      ...normalizeStoredState(storedWorkspace.state ?? {}),
      image,
    },
  };
}

export function clearLastWorkspace() {
  window.localStorage.removeItem(lastWorkspaceKey);
}

export async function loadSavedReferences(references: ReferenceImage[]): Promise<RestoredSavedReference[]> {
  const storedReferences = readStoredSavedReferences();
  const restoredReferences = await Promise.all(
    storedReferences.map(async (storedReference) => restoreSavedReference(storedReference, references)),
  );
  const validReferences = restoredReferences.filter((reference): reference is RestoredSavedReference => Boolean(reference));

  if (validReferences.length !== storedReferences.length) {
    writeStoredSavedReferences(storedReferences.filter((storedReference) =>
      validReferences.some((reference) => reference.id === storedReference.id),
    ));
  }

  return validReferences.sort((first, second) => second.updatedAt - first.updatedAt);
}

export function saveReferenceWorkspace(state: WorkspaceState): RestoredSavedReference | null {
  if (!state.image) return null;

  const savedReference: StoredSavedReference = {
    ...serializeWorkspace(state),
    id: getSavedReferenceId(state.image),
  };
  const savedReferences = readStoredSavedReferences();
  const nextReferences = [
    savedReference,
    ...savedReferences.filter((reference) => reference.id !== savedReference.id),
  ];

  writeStoredSavedReferences(nextReferences);

  return {
    id: savedReference.id,
    updatedAt: savedReference.updatedAt,
    state,
  };
}

export function deleteSavedReference(savedReferenceId: string) {
  writeStoredSavedReferences(readStoredSavedReferences().filter((reference) => reference.id !== savedReferenceId));
}

export function getSavedReferenceId(image: ReferenceImage) {
  return `${image.sourceType}:${image.id}`;
}

export function saveTrackedSavedReference(savedReferenceId: string) {
  window.localStorage.setItem(trackedSavedReferenceKey, savedReferenceId);
}

export function loadTrackedSavedReference() {
  return window.localStorage.getItem(trackedSavedReferenceKey);
}

export function clearTrackedSavedReference() {
  window.localStorage.removeItem(trackedSavedReferenceKey);
}

export function getWorkspaceDefaults(state: WorkspaceState): WorkspaceDefaults {
  return {
    canvas: { ...state.canvas },
    grid: { ...state.grid },
    filters: { ...state.filters, showOriginal: false },
    values: { ...state.values },
  };
}

export function saveDefaultWorkspace(settings: WorkspaceDefaults) {
  const storedDefaults: StoredWorkspaceDefaults = {
    version: 1,
    updatedAt: Date.now(),
    settings,
  };

  window.localStorage.setItem(defaultWorkspaceKey, JSON.stringify(storedDefaults));
}

export function loadDefaultWorkspace(): RestoredWorkspaceDefaults | null {
  try {
    const storedValue = window.localStorage.getItem(defaultWorkspaceKey);
    if (!storedValue) return null;

    const parsedValue = JSON.parse(storedValue) as StoredWorkspaceDefaults;

    if (
      parsedValue?.version !== 1 ||
      typeof parsedValue.settings !== 'object' ||
      parsedValue.settings === null
    ) {
      return null;
    }

    return {
      updatedAt: parsedValue.updatedAt,
      settings: normalizeWorkspaceDefaults(parsedValue.settings),
    };
  } catch {
    return null;
  }
}

function serializeWorkspace(state: WorkspaceState): StoredWorkspace {
  const { image, ...stateWithoutImage } = state;

  return {
    version: 1,
    updatedAt: Date.now(),
    image: serializeImage(image),
    state: stateWithoutImage,
  };
}

function serializeImage(image: ReferenceImage | null): StoredWorkspaceImage {
  if (!image) {
    throw new Error('Cannot serialize a workspace without an image.');
  }

  if (image.sourceType === 'upload') {
    return {
      sourceType: 'upload',
      id: image.id,
      title: image.title,
      blobId: image.id,
      category: image.category,
      tags: image.tags,
      rights: image.rights,
    };
  }

  return {
    sourceType: 'library',
    id: image.id,
  };
}

function readStoredWorkspace(): StoredWorkspace | null {
  try {
    const storedValue = window.localStorage.getItem(lastWorkspaceKey);
    if (!storedValue) return null;

    const parsedValue = JSON.parse(storedValue) as StoredWorkspace;

    if (
      parsedValue?.version !== 1 ||
      !parsedValue.image ||
      typeof parsedValue.state !== 'object' ||
      parsedValue.state === null
    ) {
      return null;
    }

    return parsedValue;
  } catch {
    return null;
  }
}

function readStoredSavedReferences(): StoredSavedReference[] {
  try {
    const storedValue = window.localStorage.getItem(savedReferencesKey);
    if (!storedValue) return [];

    const parsedValue = JSON.parse(storedValue) as StoredSavedReference[];

    if (!Array.isArray(parsedValue)) return [];

    return parsedValue.filter((reference) => {
      return (
        reference?.version === 1 &&
        typeof reference.id === 'string' &&
        Boolean(reference.image) &&
        typeof reference.state === 'object' &&
        reference.state !== null
      );
    });
  } catch {
    return [];
  }
}

function writeStoredSavedReferences(savedReferences: StoredSavedReference[]) {
  window.localStorage.setItem(savedReferencesKey, JSON.stringify(savedReferences));
}

function normalizeStoredState(state: Partial<Omit<WorkspaceState, 'image'>>): Omit<WorkspaceState, 'image'> {
  const selectedSwatchId =
    state.palette?.swatches?.some((swatch) => swatch.id === state.palette?.selectedSwatchId)
      ? (state.palette.selectedSwatchId ?? null)
      : null;

  return {
    canvas: {
      ...initialWorkspaceState.canvas,
      ...state.canvas,
    },
    viewport: {
      ...initialWorkspaceState.viewport,
      ...state.viewport,
    },
    grid: {
      ...initialWorkspaceState.grid,
      ...state.grid,
    },
    filters: {
      ...initialWorkspaceState.filters,
      ...state.filters,
    },
    values: {
      ...initialWorkspaceState.values,
      ...state.values,
    },
    palette: {
      ...initialWorkspaceState.palette,
      ...state.palette,
      swatches: state.palette?.swatches ?? initialWorkspaceState.palette.swatches,
      selectedSwatchId,
    },
  };
}

function normalizeWorkspaceDefaults(settings: Partial<WorkspaceDefaults>): WorkspaceDefaults {
  return {
    canvas: {
      ...initialWorkspaceState.canvas,
      ...settings.canvas,
    },
    grid: {
      ...initialWorkspaceState.grid,
      ...settings.grid,
    },
    filters: {
      ...initialWorkspaceState.filters,
      ...settings.filters,
      showOriginal: false,
    },
    values: {
      ...initialWorkspaceState.values,
      ...settings.values,
    },
  };
}

async function restoreImage(storedImage: StoredWorkspaceImage, references: ReferenceImage[]) {
  if (storedImage.sourceType === 'library') {
    return references.find((reference) => reference.id === storedImage.id) ?? null;
  }

  const blob = await getUploadedImageBlob(storedImage.blobId);
  if (!blob) return null;

  const src = URL.createObjectURL(blob);

  return {
    id: storedImage.id,
    title: storedImage.title,
    sourceType: 'upload' as const,
    src,
    thumbnailSrc: src,
    category: storedImage.category ?? 'Uploaded Images',
    tags: storedImage.tags ?? ['upload'],
    rights: storedImage.rights ?? 'User supplied',
  };
}

async function restoreSavedReference(
  storedReference: StoredSavedReference,
  references: ReferenceImage[],
): Promise<RestoredSavedReference | null> {
  const image = await restoreImage(storedReference.image, references);

  if (!image) return null;

  return {
    id: storedReference.id,
    updatedAt: storedReference.updatedAt,
    state: {
      ...normalizeStoredState(storedReference.state ?? {}),
      image,
    },
  };
}

async function getUploadedImageBlob(id: string): Promise<Blob | null> {
  const database = await openWorkspaceDatabase();

  return runTransaction(database, uploadedImagesStore, 'readonly', (store) => store.get(id));
}

function openWorkspaceDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, databaseVersion);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(uploadedImagesStore)) {
        database.createObjectStore(uploadedImagesStore);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTransaction<T>(
  database: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = operation(store);
    let result: T;

    if (request) {
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => reject(request.error);
    }

    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
