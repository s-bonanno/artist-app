# Art Assistant Rebuild Plan

## Goal

Rebuild the current Artist Grid Reference Tool as a cleaner, more maintainable artist reference workspace.

The existing app should be treated as a working prototype and product reference. It proves the core idea: artists can load an image, add grids, adjust the reference, apply study filters, and export the result. The rebuild should preserve the useful workflows while replacing the brittle prototype structure.

## Product Shape

The rebuilt app should have three major areas:

1. Library
   - Browse built-in royalty-free reference images.
   - Start with Bargue plates.
   - Later expand into casts, master drawings, anatomy, still life, figure references, and user collections.

2. Workspace
   - Load an image from the library or upload one.
   - Pan, zoom, fit, crop, and inspect the image.
   - Add grids and guide overlays.
   - Apply study filters.
   - Export the configured reference image.

3. Saved Studies
   - Not required for Phase 1.
   - The architecture should leave room for saving user images, favorites, image settings, and study setups later.

## Phase 1 Scope

Phase 1 should deliver a useful local app with a built-in reference library and the core canvas workflow.

### Must Have

- Built-in reference library with one starting category: Bargue Plates.
- Reference image metadata stored separately from app logic.
- Library browser with image thumbnails.
- Select a library image and load it into the workspace.
- Upload a custom image from the user's device.
- Shared image-loading path for library images and uploaded images.
- Canvas rendering.
- Fit image to canvas.
- Pan and zoom.
- Square grid overlay.
- Grid color, opacity, and spacing controls.
- Export the current canvas as an image.
- Desktop and tablet-friendly layout.

### Should Have

- Canvas size presets.
- Portrait/landscape orientation toggle.
- Show original image toggle.
- Blur or "squint" filter.
- Basic light controls: exposure and contrast.
- Simple category filtering in the library.
- Source/credit display for each built-in reference.

### Not Phase 1

- User accounts.
- Cloud sync.
- Saving uploaded images permanently.
- Sharing studies.
- Full filter parity with the old app.
- Large reference catalog management UI.
- Advanced search.
- AI image analysis.

## Reference Library Design

The reference library should be data-driven. Images live in a public assets folder, while metadata lives in a structured data file.

Suggested structure:

```text
public/
  references/
    bargue/
      bargue-001.jpg
      bargue-002.jpg
      bargue-003.jpg

src/
  data/
    references.json
```

Example metadata:

```json
[
  {
    "id": "bargue-001",
    "title": "Bargue Plate 1",
    "category": "Bargue Plates",
    "src": "/references/bargue/bargue-001.jpg",
    "thumbnailSrc": "/references/bargue/bargue-001.jpg",
    "tags": ["bargue", "drawing", "classical", "plate"],
    "source": "Public domain",
    "rights": "Public domain"
  }
]
```

The important idea: once an image is selected, the workspace should not care whether it came from the library or from upload. It should receive a common image object.

Suggested internal shape:

```ts
type ReferenceImage = {
  id: string;
  title: string;
  sourceType: "library" | "upload" | "saved";
  src: string;
  category?: string;
  tags?: string[];
  credit?: string;
  rights?: string;
};
```

## Proposed Tech Stack

Use a small modern frontend stack:

- Vite for the app shell and dev server.
- React or Svelte for UI.
- TypeScript for safer state and image metadata.
- Canvas API for rendering.
- CSS modules, Tailwind, or a small design-token CSS setup.

Default recommendation: Vite + React + TypeScript.

Reason: it is common, well-supported, easy to test, and a good fit for a tool with panels, state, and a canvas workspace.

## Suggested App Structure

```text
src/
  app/
    App.tsx
    appState.ts

  library/
    ReferenceLibrary.tsx
    ReferenceCard.tsx
    referenceTypes.ts
    loadReferences.ts

  workspace/
    Workspace.tsx
    CanvasStage.tsx
    Toolbar.tsx
    useCanvasRenderer.ts
    imageSource.ts

  grid/
    gridTypes.ts
    drawGrid.ts
    gridState.ts

  filters/
    filterTypes.ts
    applyFilters.ts
    blurFilter.ts
    lightFilter.ts

  export/
    exportCanvas.ts

  data/
    references.json
```

## State Model

Keep state explicit and boring.

Core state:

```ts
type WorkspaceState = {
  image: ReferenceImage | null;
  canvas: {
    widthCm: number;
    heightCm: number;
    orientation: "portrait" | "landscape";
  };
  viewport: {
    zoom: number;
    panX: number;
    panY: number;
  };
  grid: {
    type: "none" | "square";
    spacing: number;
    color: string;
    opacity: number;
    lineWidth: number;
  };
  filters: {
    blur: number;
    exposure: number;
    contrast: number;
  };
};
```

This gives us a clean path later for saved studies: save this state plus the selected image reference.

## UI Direction

The app should feel like a focused studio tool, not a landing page.

First screen:

- Left or bottom library panel.
- Central canvas workspace.
- Right or bottom controls panel.
- Top toolbar for image actions and export.

On desktop:

- Library can be a left sidebar.
- Canvas occupies the center.
- Controls can sit on the right.

On tablet/mobile:

- Canvas remains primary.
- Library and controls become bottom sheets or tabs.

Key UI tabs:

- Library
- Grid
- Canvas
- Filters
- Export

## Implementation Order

1. Create new Vite app structure.
2. Add basic app layout: library, workspace, controls.
3. Add reference metadata format and a tiny sample library.
4. Render library thumbnails.
5. Load a selected library image into the canvas.
6. Add upload support using the same image-loading path.
7. Implement canvas fit, pan, and zoom.
8. Implement square grid overlay.
9. Add grid controls.
10. Add export.
11. Add blur/squint filter.
12. Add basic light controls.
13. Add responsive tablet/mobile layout.
14. QA against the old app's core workflows.

## Migration From Current App

Reuse concepts, not structure.

Good ideas to carry forward:

- Canvas/grid workflow.
- Canvas size presets.
- Grid style controls.
- Original image toggle.
- Squint/blur filter.
- Export behavior.
- Mobile-minded interface.

Avoid carrying forward:

- One large `script.js` file.
- Duplicate event handlers.
- CDN-only production dependencies.
- UI logic mixed directly with image-processing logic.
- Half-used manager files.
- Commented-out features that still appear in docs.

## Known Issues In Current Prototype

- Export button has duplicate handlers, one of which calls the export helper with no canvas.
- Filter cache invalidation is likely broken because `invalidateCache()` is defined twice in `FilterManager`.
- README lists edge detection as a feature, but edge filter registration is commented out.
- There is no package setup, build process, test setup, or dependency lockfile.
- The app relies on CDN scripts for Tailwind and Lucide.

## Phase 1 Done Means

Phase 1 is complete when an artist can:

1. Open the app.
2. Pick a Bargue plate from the built-in library.
3. Load it into the workspace.
4. Adjust canvas/grid settings.
5. Pan and zoom the image.
6. Apply at least one study filter.
7. Export the final reference image.
8. Upload their own image and use the same workflow.

