# UI Wireframes

## Direction

The interface should take its strongest cues from Lightroom Mobile:

- Black canvas-first editing surface.
- Minimal top chrome.
- Bottom tool strip with compact icon + label actions.
- One active tool panel at a time.
- Tool panels slide up from the bottom and can be dismissed.
- Controls are dense, quiet, and temporary.
- The reference image/canvas should always feel like the main event.

The original Art Assistant prototype remains useful for behavior:

- Bottom toolbar.
- Slide-up settings panels.
- Safe-area padding on mobile.
- Fast transitions around 150-200ms.
- Slider interaction fading while dragging.
- Measured canvas and grid math.

## Screen 1: Gallery

Purpose: choose a built-in or uploaded reference.

```text
┌──────────────────────────────┐
│ Top: Art Assistant      +    │
├──────────────────────────────┤
│ Recents / Bargue Plates  ▾   │
│                              │
│ ┌──────┐ ┌──────┐ ┌──────┐  │
│ │ img  │ │ img  │ │ img  │  │
│ └──────┘ └──────┘ └──────┘  │
│ ┌──────┐ ┌──────┐ ┌──────┐  │
│ │ img  │ │ img  │ │ img  │  │
│ └──────┘ └──────┘ └──────┘  │
├──────────────────────────────┤
│ Library     Upload     Saved │
└──────────────────────────────┘
```

Notes:

- The gallery should feel like Lightroom's grid.
- Built-in images and user uploads should appear in the same visual language.
- Start with Bargue Plates, but support future categories.
- Tapping an image enters Edit Idle.

## Screen 2: Edit Idle

Purpose: view, pan, zoom, and prepare to open a tool.

```text
┌──────────────────────────────┐
│ ‹        Bargue Plate 1.1  ⤴ │
│                              │
│                              │
│          reference           │
│          / canvas            │
│                              │
│                              │
├──────────────────────────────┤
│ Canvas  Grid  Palette Filters│
└──────────────────────────────┘
```

Notes:

- No large permanent sidebars.
- Image/canvas owns the space.
- Bottom tool strip is always available.
- On desktop, gallery may be a collapsible rail, not a heavy dashboard.

## Screen 3: Canvas Tool

Purpose: define the real-world drawing or painting surface.

```text
┌──────────────────────────────┐
│          reference           │
│                              │
├──────────────────────────────┤
│ Canvas size                  │
│ Preset       [12 x 16 in ▾]  │
│ Units        [ cm | in ]     │
│ Width        [ 12 ]          │
│ Height       [ 16 ]          │
│ Orientation  [Portrait|Land] │
├──────────────────────────────┤
│  ×                       ✓   │
└──────────────────────────────┘
```

Notes:

- This preserves the original app's most important artist workflow.
- Store dimensions internally in centimeters.
- Display in cm or inches.
- Presets should include paper and common canvas sizes.
- Confirm/cancel behavior is worth adding once edits become more complex.

## Screen 4: Grid Tool

Purpose: translate the reference to a real canvas.

```text
┌──────────────────────────────┐
│          reference           │
│          + grid              │
├──────────────────────────────┤
│ Grid scale                   │
│ Show grid              [ on ]│
│ Units        [ cm | in ]     │
│ Square       [ 2.0 ] in      │
│ Opacity      ━━━━━●──── 70%  │
│ Line         ━●──────── 1px  │
│ Color        [ swatch ]      │
├──────────────────────────────┤
│  ×                       ✓   │
└──────────────────────────────┘
```

Critical math:

```text
pixelsPerCm = canvasPixelWidth / canvasWidthCm
gridSpacingPx = gridSquareSizeCm * pixelsPerCm
```

Notes:

- The grid square size must be a real-world measurement.
- If the user sets a 12 x 16 inch canvas with 2 inch squares, the reference grid should map to that real canvas.
- This is a primary feature, not a secondary setting.

## Screen 5: Palette Tool

Purpose: sample colors from the reference and build a swatch set for paint mixing.

```text
┌──────────────────────────────┐
│          reference           │
│        tap to sample         │
│              ⊕               │
├──────────────────────────────┤
│ Palette                      │
│ Source     [Filtered|Original]│
│ Sample size [1px|3px|5px]    │
│                              │
│ Swatches                     │
│ ◼︎ ◼︎ ◼︎ ◼︎ ◼︎ +             │
│                              │
│ Selected                     │
│ ◼︎  #A48B6A                  │
│ RGB 164 139 106              │
│ HSL 34 24% 53%               │
├──────────────────────────────┤
│  ×                       ✓   │
└──────────────────────────────┘
```

Notes:

- Artists can tap/drag on the image to sample colors.
- Sampling should support original image and filtered image.
- Sample size matters because single-pixel samples can be noisy.
- Swatches should be reorderable later.
- Swatches should be saved with the study later.
- For physical painting, a future version could show approximate value/chroma/hue notes or mixing notes, but that is not Phase 1.

Suggested initial palette data:

```ts
type Swatch = {
  id: string;
  name?: string;
  hex: string;
  rgb: [number, number, number];
  source: "original" | "filtered";
  sampleSize: 1 | 3 | 5;
  imagePoint: { x: number; y: number };
};
```

## Screen 6: Filters Tool

Purpose: support study modes without overwhelming the user.

```text
┌──────────────────────────────┐
│          filtered ref        │
├──────────────────────────────┤
│ Filters                      │
│ Squint / Blur       ━●────   │
│ Exposure            ━━●───   │
│ Contrast            ━●────   │
│ Values              [ off ]  │
├──────────────────────────────┤
│  ×                       ✓   │
└──────────────────────────────┘
```

Notes:

- Bring filters back gradually.
- Squint/blur is high-value for artists.
- Original vs filtered toggle matters because Palette can sample either source.

## Screen 7: View Tool

Purpose: navigation, fit, and comparison.

```text
┌──────────────────────────────┐
│          reference           │
├──────────────────────────────┤
│ View                         │
│ Zoom      ━━━●────── 100%    │
│ [ - ]    [ Fit ]       [ + ] │
│ Show original          [off] │
└──────────────────────────────┘
```

Notes:

- Pan and pinch should feel direct.
- Controls should not dominate the image.

## Interaction Rules

- Bottom tool strip is the main navigation in Edit mode.
- Only one tool panel is open at a time.
- Tool panels animate from the bottom in about 200ms.
- Tool panels can be dismissed by tapping the active tool again, tapping outside, or pressing cancel.
- During slider drag, non-active panel UI should fade back, matching the original prototype's `SliderInteractionManager`.
- On mobile, gallery is its own screen.
- On desktop, the gallery may be a collapsible rail or drawer, but should not permanently compete with the canvas.

## Implementation Order

1. Split Gallery and Edit into distinct modes.
2. Rebuild Edit as canvas-first with a minimal top bar and bottom tool strip.
3. Implement true bottom sheets for Canvas, Grid, View.
4. Preserve and test measured canvas/grid math.
5. Add Palette tool shell.
6. Implement image color sampling from the canvas.
7. Add swatch set state and display.
8. Reintroduce Filters.
9. Add original/filtered comparison and sampling source.
10. Polish animations and slider fade behavior.

