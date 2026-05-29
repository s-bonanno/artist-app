import { initialWorkspaceState, type WorkspaceState } from '../app/appState';
import type { ReferenceImage } from '../library/referenceTypes';

const databaseName = 'art-assistant-local';
const databaseVersion = 1;
const uploadedImagesStore = 'uploaded-images';
const lastWorkspaceKey = 'art-assistant:last-workspace';

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

export type RestoredWorkspace = {
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
