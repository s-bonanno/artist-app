// Navigation is independent of the last study: browsing must never overwrite it.
export type AppView = 'gallery' | 'edit';
export type SavedView = { zoom: number; panX: number; panY: number };
export type LibraryLocation = {
  activeTab: 'upload' | 'library' | 'saved';
  categoryId: string;
  collectionId: string | null;
  previewId: string | null;
  previewView: SavedView;
  scrollTop: number;
};
const navigationKey = 'art-assistant:navigation';
const libraryKey = 'art-assistant:library-location';
export const defaultSavedView: SavedView = { zoom: 1, panX: 0, panY: 0 };

function read(key: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    return value && value.version === 1 ? value : null;
  } catch { return null; }
}
function write(key: string, value: object) {
  try { window.localStorage.setItem(key, JSON.stringify({ ...value, version: 1 })); }
  catch { /* Storage can be unavailable or full; the current session still works. */ }
}
function finite(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
// Pan is measured in unzoomed canvas widths/heights, not screen pixels.
export function normalizeSavedView(value: unknown): SavedView {
  const view = value && typeof value === 'object' ? value as Partial<SavedView> : {};
  return { zoom: finite(view.zoom, 1, 1, 10), panX: finite(view.panX, 0, -20, 20), panY: finite(view.panY, 0, -20, 20) };
}
export function loadAppView(): AppView { return read(navigationKey)?.view === 'edit' ? 'edit' : 'gallery'; }
export function saveAppView(view: AppView) { write(navigationKey, { view }); }
export function loadLibraryLocation(): LibraryLocation {
  const value = read(libraryKey);
  return {
    activeTab: value?.activeTab === 'library' || value?.activeTab === 'saved' ? value.activeTab : 'upload',
    categoryId: typeof value?.categoryId === 'string' ? value.categoryId : 'overview',
    collectionId: typeof value?.collectionId === 'string' ? value.collectionId : null,
    previewId: typeof value?.previewId === 'string' ? value.previewId : null,
    previewView: normalizeSavedView(value?.previewView),
    scrollTop: finite(value?.scrollTop, 0, 0, 10_000_000),
  };
}
export function saveLibraryLocation(location: LibraryLocation) { write(libraryKey, location); }
