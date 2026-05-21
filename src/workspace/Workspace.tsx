import {
  ArrowLeft,
  Check,
  Contrast,
  Crop,
  Download,
  Grid2X2,
  Image as ImageIcon,
  Minus,
  Palette as PaletteIcon,
  Pipette,
  Plus,
  RectangleHorizontal,
  RectangleVertical,
  SlidersHorizontal,
  X,
  ZoomIn,
} from 'lucide-react';
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { WorkspaceState } from '../app/appState';
import { exportCanvas } from '../export/exportCanvas';
import { rgbToHsl } from '../palette/colorUtils';
import type { ColorSample, SampleSize } from '../palette/paletteTypes';
import type { ValueMode } from '../values/valueTypes';
import { CanvasStage } from './CanvasStage';
import {
  canvasPresets,
  convertFromCm,
  convertToCm,
  formatMeasurement,
  getGridLimits,
  type MeasurementUnit,
} from './canvasSizing';

type WorkspaceProps = {
  state: WorkspaceState;
  onBack: () => void;
  onChange: (nextState: WorkspaceState) => void;
};

type ActiveTool = 'canvas' | 'zoom' | 'grid' | 'values' | 'palette' | 'filters';

const sampleSizes: SampleSize[] = [1, 3, 5];
const valueModes: Array<{ id: ValueMode; label: string }> = [
  { id: 'map', label: 'Map' },
  { id: 'shadows', label: 'Shadows' },
  { id: 'lights', label: 'Lights' },
];

export function Workspace({ state, onBack, onChange }: WorkspaceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool | null>(null);
  const [activeSlider, setActiveSlider] = useState<string | null>(null);
  const gridLimits = useMemo(
    () => getGridLimits(state.canvas.widthCm, state.canvas.heightCm, state.grid.unit),
    [state.canvas.heightCm, state.canvas.widthCm, state.grid.unit],
  );

  const canvasWidth = formatMeasurement(state.canvas.widthCm, state.canvas.unit);
  const canvasHeight = formatMeasurement(state.canvas.heightCm, state.canvas.unit);
  const gridSquareSize = convertFromCm(state.grid.squareSizeCm, state.grid.unit);
  const selectedSwatch =
    state.palette.swatches.find((swatch) => swatch.id === state.palette.selectedSwatchId) ??
    state.palette.swatches[state.palette.swatches.length - 1] ??
    null;
  const selectedHsl = selectedSwatch ? rgbToHsl(selectedSwatch.rgb) : null;

  function closeTool() {
    setActiveSlider(null);
    setActiveTool(null);
  }

  function toggleTool(tool: ActiveTool) {
    setActiveSlider(null);
    setActiveTool((currentTool) => (currentTool === tool ? null : tool));
  }

  function startSliderInteraction(sliderId: string, pointerId?: number, target?: HTMLInputElement) {
    if (pointerId !== undefined && target?.setPointerCapture) {
      try {
        target.setPointerCapture(pointerId);
      } catch {
        // Some browsers do not allow capture on native range controls.
      }
    }

    setActiveSlider(sliderId);
  }

  function endSliderInteraction(pointerId?: number, target?: HTMLInputElement) {
    if (pointerId !== undefined && target?.hasPointerCapture?.(pointerId)) {
      try {
        target.releasePointerCapture(pointerId);
      } catch {
        // Capture may already be released by the browser.
      }
    }

    setActiveSlider(null);
  }

  function getSliderProps(sliderId: string) {
    return {
      onPointerDown: (event: PointerEvent<HTMLInputElement>) =>
        startSliderInteraction(sliderId, event.pointerId, event.currentTarget),
      onPointerUp: (event: PointerEvent<HTMLInputElement>) =>
        endSliderInteraction(event.pointerId, event.currentTarget),
      onPointerCancel: (event: PointerEvent<HTMLInputElement>) =>
        endSliderInteraction(event.pointerId, event.currentTarget),
      onBlur: () => endSliderInteraction(),
      onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
          setActiveSlider(sliderId);
        }
      },
      onKeyUp: () => endSliderInteraction(),
    };
  }

  function updateCanvas(nextCanvas: Partial<WorkspaceState['canvas']>) {
    onChange({
      ...state,
      canvas: {
        ...state.canvas,
        ...nextCanvas,
      },
    });
  }

  function updateGrid(nextGrid: Partial<WorkspaceState['grid']>) {
    onChange({
      ...state,
      grid: {
        ...state.grid,
        ...nextGrid,
      },
    });
  }

  function updateFilters(nextFilters: Partial<WorkspaceState['filters']>) {
    onChange({
      ...state,
      filters: {
        ...state.filters,
        ...nextFilters,
      },
    });
  }

  function updateValues(nextValues: Partial<WorkspaceState['values']>) {
    const nextState = {
      ...state.values,
      ...nextValues,
    };
    const levels = Math.min(12, Math.max(2, Math.round(nextState.levels)));
    const visibleLevels = Math.min(levels, Math.max(0, Math.round(nextState.visibleLevels)));

    onChange({
      ...state,
      values: {
        ...nextState,
        levels,
        visibleLevels,
        opacity: Math.min(1, Math.max(0, nextState.opacity)),
      },
    });
  }

  function setValueLevels(value: string) {
    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue)) return;

    const levels = Math.min(12, Math.max(2, Math.round(parsedValue)));
    updateValues({
      enabled: true,
      levels,
      visibleLevels: levels,
    });
  }

  function updatePalette(nextPalette: Partial<WorkspaceState['palette']>) {
    onChange({
      ...state,
      palette: {
        ...state.palette,
        ...nextPalette,
      },
    });
  }

  function updateViewport(nextViewport: Partial<WorkspaceState['viewport']>) {
    onChange({
      ...state,
      viewport: {
        ...state.viewport,
        ...nextViewport,
      },
    });
  }

  function setViewport(viewport: WorkspaceState['viewport']) {
    onChange({
      ...state,
      viewport,
    });
  }

  function stepZoom(direction: 'in' | 'out') {
    const multiplier = direction === 'in' ? 1.15 : 0.85;
    updateViewport({
      zoom: Math.min(4, Math.max(0.2, state.viewport.zoom * multiplier)),
    });
  }

  function selectPreset(presetId: string) {
    const preset = canvasPresets.find((item) => item.id === presetId);

    if (!preset) {
      updateCanvas({ presetId: 'custom' });
      return;
    }

    const widthCm = convertToCm(preset.width, preset.unit);
    const heightCm = convertToCm(preset.height, preset.unit);

    updateCanvas({
      widthCm,
      heightCm,
      unit: preset.unit,
      presetId,
      orientation: widthCm >= heightCm ? 'landscape' : 'portrait',
    });
  }

  function setCanvasUnit(unit: MeasurementUnit) {
    updateCanvas({ unit });
  }

  function setCanvasDimension(key: 'widthCm' | 'heightCm', value: string) {
    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) return;

    updateCanvas({
      [key]: convertToCm(parsedValue, state.canvas.unit),
      presetId: 'custom',
    });
  }

  function setOrientation(orientation: WorkspaceState['canvas']['orientation']) {
    const shouldSwapToPortrait = orientation === 'portrait' && state.canvas.widthCm > state.canvas.heightCm;
    const shouldSwapToLandscape = orientation === 'landscape' && state.canvas.heightCm > state.canvas.widthCm;

    updateCanvas({
      orientation,
      presetId: 'custom',
      widthCm: shouldSwapToPortrait || shouldSwapToLandscape ? state.canvas.heightCm : state.canvas.widthCm,
      heightCm: shouldSwapToPortrait || shouldSwapToLandscape ? state.canvas.widthCm : state.canvas.heightCm,
    });
  }

  function setGridUnit(unit: MeasurementUnit) {
    updateGrid({ unit });
  }

  function setGridSquareSize(value: string) {
    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) return;

    updateGrid({
      squareSizeCm: convertToCm(parsedValue, state.grid.unit),
    });
  }

  function addSwatch(sample: ColorSample) {
    const id = crypto.randomUUID();

    onChange({
      ...state,
      palette: {
        ...state.palette,
        swatches: [
          ...state.palette.swatches,
          {
            ...sample,
            id,
            name: `Swatch ${state.palette.swatches.length + 1}`,
          },
        ],
        selectedSwatchId: id,
      },
    });
  }

  function removeSelectedSwatch() {
    if (!selectedSwatch) return;

    const nextSwatches = state.palette.swatches.filter((swatch) => swatch.id !== selectedSwatch.id);

    updatePalette({
      swatches: nextSwatches,
      selectedSwatchId: nextSwatches[nextSwatches.length - 1]?.id ?? null,
    });
  }

  function resetFilters() {
    updateFilters({
      blur: 0,
      exposure: 0,
      contrast: 0,
      showOriginal: false,
    });
  }

  function resetValues() {
    updateValues({
      enabled: false,
      mode: 'map',
      levels: 6,
      visibleLevels: 3,
      opacity: 1,
    });
  }

  function renderSheet() {
    if (!activeTool) return null;

    return (
      <div className="tool-sheet">
        <div className="tool-sheet-heading">
          <button type="button" className="icon-button compact" title="Close tool" onClick={closeTool}>
            <X size={16} />
          </button>
          <strong>{getToolLabel(activeTool)}</strong>
          <button type="button" className="icon-button compact" title="Done" onClick={closeTool}>
            <Check size={16} />
          </button>
        </div>

        {activeTool === 'canvas' ? (
          <div className="tool-panel-content">
            <label className="control-row">
              <span>Preset</span>
              <select value={state.canvas.presetId} onChange={(event) => selectPreset(event.target.value)}>
                <option value="custom">Custom</option>
                {canvasPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="dimension-row">
              <label>
                <span>Width</span>
                <div className="measurement-field">
                  <input
                    type="number"
                    min="0.1"
                    step={state.canvas.unit === 'in' ? '0.25' : '0.1'}
                    value={canvasWidth}
                    onChange={(event) => setCanvasDimension('widthCm', event.target.value)}
                  />
                  <select
                    aria-label="Canvas width unit"
                    value={state.canvas.unit}
                    onChange={(event) => setCanvasUnit(event.target.value as MeasurementUnit)}
                  >
                    <option value="cm">cm</option>
                    <option value="in">in</option>
                  </select>
                </div>
              </label>
              <label>
                <span>Height</span>
                <div className="measurement-field">
                  <input
                    type="number"
                    min="0.1"
                    step={state.canvas.unit === 'in' ? '0.25' : '0.1'}
                    value={canvasHeight}
                    onChange={(event) => setCanvasDimension('heightCm', event.target.value)}
                  />
                  <select
                    aria-label="Canvas height unit"
                    value={state.canvas.unit}
                    onChange={(event) => setCanvasUnit(event.target.value as MeasurementUnit)}
                  >
                    <option value="cm">cm</option>
                    <option value="in">in</option>
                  </select>
                </div>
              </label>
            </div>

            <div className="option-block">
              <span>Orientation</span>
              <div className="icon-option-group" aria-label="Canvas orientation">
                <button
                  type="button"
                  data-active={state.canvas.orientation === 'portrait'}
                  onClick={() => setOrientation('portrait')}
                >
                  <RectangleVertical size={18} />
                  <span>Portrait</span>
                </button>
                <button
                  type="button"
                  data-active={state.canvas.orientation === 'landscape'}
                  onClick={() => setOrientation('landscape')}
                >
                  <RectangleHorizontal size={18} />
                  <span>Landscape</span>
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {activeTool === 'grid' ? (
          <div className="tool-panel-content">
            <label className="toggle-row">
              <span>Show grid</span>
              <input
                type="checkbox"
                checked={state.grid.enabled}
                onChange={(event) => updateGrid({ enabled: event.target.checked })}
              />
            </label>

            <label className="control-row">
              <span>Square</span>
              <div className="measurement-field">
                <input
                  type="number"
                  min={gridLimits.min}
                  max={gridLimits.max}
                  step={gridLimits.step}
                  value={formatMeasurement(state.grid.squareSizeCm, state.grid.unit)}
                  onChange={(event) => setGridSquareSize(event.target.value)}
                />
                <select
                  aria-label="Grid square unit"
                  value={state.grid.unit}
                  onChange={(event) => setGridUnit(event.target.value as MeasurementUnit)}
                >
                  <option value="cm">cm</option>
                  <option value="in">in</option>
                </select>
              </div>
            </label>

            <label className="slider-row" data-active-slider={activeSlider === 'grid-scale'}>
              <span>Scale</span>
              <input
                type="range"
                min={gridLimits.min}
                max={gridLimits.max}
                step={gridLimits.step}
                value={gridSquareSize}
                onChange={(event) => setGridSquareSize(event.target.value)}
                {...getSliderProps('grid-scale')}
              />
              <strong>
                {formatMeasurement(state.grid.squareSizeCm, state.grid.unit)} {state.grid.unit}
              </strong>
            </label>

            <label className="slider-row" data-active-slider={activeSlider === 'grid-opacity'}>
              <span>Opacity</span>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={state.grid.opacity}
                onChange={(event) => updateGrid({ opacity: Number(event.target.value) })}
                {...getSliderProps('grid-opacity')}
              />
              <strong>{Math.round(state.grid.opacity * 100)}%</strong>
            </label>

            <label className="slider-row" data-active-slider={activeSlider === 'grid-line'}>
              <span>Line</span>
              <input
                type="range"
                min="0.5"
                max="5"
                step="0.5"
                value={state.grid.lineWidth}
                onChange={(event) => updateGrid({ lineWidth: Number(event.target.value) })}
                {...getSliderProps('grid-line')}
              />
              <strong>{state.grid.lineWidth}px</strong>
            </label>

            <label className="control-row">
              <span>Color</span>
              <input
                type="color"
                value={state.grid.color}
                onChange={(event) => updateGrid({ color: event.target.value })}
              />
            </label>
          </div>
        ) : null}

        {activeTool === 'values' ? (
          <div className="tool-panel-content">
            <label className="toggle-row">
              <span>Active</span>
              <input
                type="checkbox"
                checked={state.values.enabled}
                onChange={(event) => updateValues({ enabled: event.target.checked })}
              />
            </label>

            <div className="option-block">
              <span>Mode</span>
              <div className="chip-control" data-options="3" aria-label="Values mode">
                {valueModes.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    data-active={state.values.mode === mode.id}
                    onClick={() => updateValues({ enabled: true, mode: mode.id })}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="slider-row" data-active-slider={activeSlider === 'values-levels'}>
              <span>Levels</span>
              <input
                type="range"
                min="2"
                max="12"
                step="1"
                value={state.values.levels}
                onChange={(event) => setValueLevels(event.target.value)}
                {...getSliderProps('values-levels')}
              />
              <strong>{state.values.levels}</strong>
            </label>

            <label className="slider-row" data-active-slider={activeSlider === 'values-visible'}>
              <span>Visible</span>
              <input
                type="range"
                min="0"
                max={state.values.levels}
                step="1"
                value={state.values.visibleLevels}
                onChange={(event) => updateValues({ enabled: true, visibleLevels: Number(event.target.value) })}
                {...getSliderProps('values-visible')}
              />
              <strong>
                {state.values.visibleLevels === 0
                  ? 'Off'
                  : `${state.values.visibleLevels}/${state.values.levels}`}
              </strong>
            </label>

            <label className="slider-row" data-active-slider={activeSlider === 'values-opacity'}>
              <span>Opacity</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={state.values.opacity}
                onChange={(event) => updateValues({ enabled: true, opacity: Number(event.target.value) })}
                {...getSliderProps('values-opacity')}
              />
              <strong>{Math.round(state.values.opacity * 100)}%</strong>
            </label>

            <button type="button" className="secondary-button" onClick={resetValues}>
              Reset values
            </button>
          </div>
        ) : null}

        {activeTool === 'palette' ? (
          <div className="tool-panel-content">
            <div className="chip-control" aria-label="Palette sample source">
              <button
                type="button"
                data-active={state.palette.source === 'filtered'}
                onClick={() => updatePalette({ source: 'filtered' })}
              >
                Filtered
              </button>
              <button
                type="button"
                data-active={state.palette.source === 'original'}
                onClick={() => updatePalette({ source: 'original' })}
              >
                Original
              </button>
            </div>

            <div className="chip-control" data-options="3" aria-label="Palette sample size">
              {sampleSizes.map((sampleSize) => (
                <button
                  key={sampleSize}
                  type="button"
                  data-active={state.palette.sampleSize === sampleSize}
                  onClick={() => updatePalette({ sampleSize })}
                >
                  {sampleSize}px
                </button>
              ))}
            </div>

            <div className="palette-block">
              <span>Swatches</span>
              <div className="swatch-strip">
                {state.palette.swatches.length ? (
                  state.palette.swatches.map((swatch) => (
                    <button
                      key={swatch.id}
                      type="button"
                      className="swatch-chip"
                      title={swatch.hex}
                      style={{ backgroundColor: swatch.hex }}
                      data-active={selectedSwatch?.id === swatch.id}
                      onClick={() => updatePalette({ selectedSwatchId: swatch.id })}
                    />
                  ))
                ) : (
                  <span className="empty-swatches">Tap the image to sample</span>
                )}
              </div>
            </div>

            <div className="selected-swatch">
              <div className="large-swatch" style={{ backgroundColor: selectedSwatch?.hex ?? '#2a2b30' }} />
              {selectedSwatch ? (
                <div>
                  <strong>{selectedSwatch.hex}</strong>
                  <span>RGB {selectedSwatch.rgb.join(' ')}</span>
                  {selectedHsl ? (
                    <span>
                      HSL {selectedHsl.hue} {selectedHsl.saturation}% {selectedHsl.lightness}%
                    </span>
                  ) : null}
                </div>
              ) : (
                <div>
                  <strong>No swatch yet</strong>
                  <span>Tap the reference while Palette is open.</span>
                </div>
              )}
              <button type="button" className="secondary-button" onClick={removeSelectedSwatch} disabled={!selectedSwatch}>
                Remove
              </button>
            </div>
          </div>
        ) : null}

        {activeTool === 'filters' ? (
          <div className="tool-panel-content">
            <label className="toggle-row">
              <span>Show original</span>
              <input
                type="checkbox"
                checked={state.filters.showOriginal}
                onChange={(event) => updateFilters({ showOriginal: event.target.checked })}
              />
            </label>

            <label className="slider-row" data-active-slider={activeSlider === 'filters-squint'}>
              <span>Squint</span>
              <input
                type="range"
                min="0"
                max="12"
                step="0.5"
                value={state.filters.blur}
                onChange={(event) => updateFilters({ blur: Number(event.target.value) })}
                {...getSliderProps('filters-squint')}
              />
              <strong>{state.filters.blur}px</strong>
            </label>

            <label className="slider-row" data-active-slider={activeSlider === 'filters-exposure'}>
              <span>Exposure</span>
              <input
                type="range"
                min="-60"
                max="60"
                step="1"
                value={state.filters.exposure}
                onChange={(event) => updateFilters({ exposure: Number(event.target.value) })}
                {...getSliderProps('filters-exposure')}
              />
              <strong>{state.filters.exposure}</strong>
            </label>

            <label className="slider-row" data-active-slider={activeSlider === 'filters-contrast'}>
              <span>Contrast</span>
              <input
                type="range"
                min="-60"
                max="80"
                step="1"
                value={state.filters.contrast}
                onChange={(event) => updateFilters({ contrast: Number(event.target.value) })}
                {...getSliderProps('filters-contrast')}
              />
              <strong>{state.filters.contrast}</strong>
            </label>

            <button type="button" className="secondary-button" onClick={resetFilters}>
              Reset filters
            </button>
          </div>
        ) : null}

        {activeTool === 'zoom' ? (
          <div className="tool-panel-content">
            <label className="slider-row" data-active-slider={activeSlider === 'zoom'}>
              <span>Zoom</span>
              <input
                type="range"
                min="0.2"
                max="4"
                step="0.05"
                value={state.viewport.zoom}
                onChange={(event) => updateViewport({ zoom: Number(event.target.value) })}
                {...getSliderProps('zoom')}
              />
              <strong>{Math.round(state.viewport.zoom * 100)}%</strong>
            </label>

            <div className="zoom-actions">
              <button type="button" className="icon-button" title="Zoom out" onClick={() => stepZoom('out')}>
                <Minus size={16} />
              </button>
              <button type="button" className="secondary-button" onClick={() => updateViewport({ zoom: 1, panX: 0, panY: 0 })}>
                Fit
              </button>
              <button type="button" className="icon-button" title="Zoom in" onClick={() => stepZoom('in')}>
                <Plus size={16} />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <main className="edit-screen">
      <header className="edit-topbar">
        <button type="button" className="top-icon-button" title="Back to library" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
        <div className="edit-title">
          <strong>Workspace</strong>
          <span>
            {state.image?.title ?? 'Choose a reference'} · {canvasWidth} x {canvasHeight} {state.canvas.unit}
          </span>
        </div>
        <button
          type="button"
          className="top-icon-button"
          title="Export image"
          onClick={() => canvasRef.current && exportCanvas(canvasRef.current)}
          disabled={!state.image}
        >
          <Download size={20} />
        </button>
      </header>

      <div
        className="edit-canvas-wrap"
        onPointerDown={() => activeTool && activeTool !== 'palette' && activeTool !== 'zoom' && closeTool()}
      >
        {activeTool === 'palette' ? (
          <div className="sampling-hint">
            <Pipette size={15} />
            <span>Tap image to sample</span>
          </div>
        ) : null}
        <CanvasStage
          ref={canvasRef}
          image={state.image}
          interactionMode={activeTool === 'palette' ? 'sample' : activeTool === 'zoom' ? 'pan' : 'locked'}
          state={state}
          onSampleColor={addSwatch}
          onViewportChange={setViewport}
        />
      </div>

      <section
        className="tool-dock"
        data-open={Boolean(activeTool)}
        data-sliding={Boolean(activeSlider)}
        aria-label="Editing tools"
      >
        {renderSheet()}

        <nav className="tool-strip" aria-label="Tool categories">
          <button type="button" data-active={activeTool === 'canvas'} onClick={() => toggleTool('canvas')}>
            <Crop size={19} />
            <span>Canvas</span>
          </button>
          <button type="button" data-active={activeTool === 'zoom'} onClick={() => toggleTool('zoom')}>
            <ZoomIn size={19} />
            <span>Zoom</span>
          </button>
          <button type="button" data-active={activeTool === 'grid'} onClick={() => toggleTool('grid')}>
            <Grid2X2 size={19} />
            <span>Grid</span>
          </button>
          <button type="button" data-active={activeTool === 'values'} onClick={() => toggleTool('values')}>
            <Contrast size={19} />
            <span>Values</span>
          </button>
          <button type="button" data-active={activeTool === 'palette'} onClick={() => toggleTool('palette')}>
            <PaletteIcon size={19} />
            <span>Palette</span>
          </button>
          <button type="button" data-active={activeTool === 'filters'} onClick={() => toggleTool('filters')}>
            <SlidersHorizontal size={19} />
            <span>Filters</span>
          </button>
        </nav>
      </section>
    </main>
  );
}

function getToolLabel(tool: ActiveTool) {
  switch (tool) {
    case 'canvas':
      return (
        <>
          <ImageIcon size={16} />
          Canvas size
        </>
      );
    case 'grid':
      return (
        <>
          <Grid2X2 size={16} />
          Grid scale
        </>
      );
    case 'values':
      return (
        <>
          <Contrast size={16} />
          Values
        </>
      );
    case 'palette':
      return (
        <>
          <Pipette size={16} />
          Palette
        </>
      );
    case 'filters':
      return (
        <>
          <SlidersHorizontal size={16} />
          Filters
        </>
      );
    case 'zoom':
      return (
        <>
          <ZoomIn size={16} />
          Zoom
        </>
      );
  }
}
