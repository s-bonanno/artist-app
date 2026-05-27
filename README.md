# Art Assistant

A fresh rebuild of the Artist Grid Reference Tool.

This version starts from a clean Vite + React + TypeScript app and treats the old `art-assistant-v2` repo as the reference prototype.

## Phase 1

- Built-in reference library, starting with Bargue plates.
- Upload custom images.
- Canvas workspace.
- Pan/zoom-ready rendering path.
- Square grid overlay.
- Grid controls.
- Export current canvas.

## Run Locally

```bash
npm install
npm run dev
```

## Adding Reference Images

Library images live in `public/references`, and their metadata lives in `src/data/references.ts`.

Use this checklist when adding new references:

- Prefer public-domain or clearly licensed source images, usually from Wikimedia Commons or museum open-access pages.
- Save full-size study images in `public/references/commons` unless they belong in a more specific folder such as `public/references/bargue`.
- Use JPG for paintings/photos where possible. PNG is fine for plates, drawings, or images that need crisp flat tones.
- Aim for useful zoom detail without overloading mobile Safari: around 1800-2400 px on the long edge is a good target. Avoid tiny preview images under about 1200 px on the long edge unless there is no better source.
- Avoid extremely large source files when possible. If an image is huge, resize it before adding it so the app remains comfortable on phones.
- Run `npm run thumbnails` after adding or changing image files. This creates matching thumbnails under `public/references/thumbs` with a maximum dimension of 900 px.
- In `src/data/references.ts`, point `src` at the full-size image path. `thumbnailSrc` can usually match `src`; the app maps it to the generated thumbnail path when it loads the library.
- Add useful metadata: `title`, `artist`, `year`, `description`, `suggestedUse`, `sourceUrl`, `tags`, `credit`, and `rights`.
- Keep tags specific enough to support browsing, such as `portrait`, `figure`, `landscape`, `still-life`, `floral`, `animal`, `drawing`, `technical`, `sargent`, or `bargue`.

Useful checks:

```bash
sips -g pixelWidth -g pixelHeight public/references/commons/example.jpg
npm run thumbnails
npm run build
```

When choosing images, favor references that help artists study shape, value, colour, edges, composition, or classical technique.
