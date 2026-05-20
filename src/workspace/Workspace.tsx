import {
  Crop,
  Download,
  Grid2X2,
  Image as ImageIcon,
  Minus,
  Move,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { WorkspaceState } from '../app/appState';
import { exportCanvas } from '../export/exportCanvas';
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
  onChange: (nextState: WorkspaceState) => void;
};

type ActiveTool = 'canvas' | 'grid' | 'view';

export function Workspace({ state, onChange }: WorkspaceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>('canvas');
  const gridLimits = useMemo(
    () => getGridLimits(state.canvas.widthCm, state.canvas.heightCm, state.grid.unit),
    [state.canvas.heightCm, state.canvas.widthCm, state.grid.unit],
  );

  function updateGrid(nextGrid: Partial<WorkspaceState['grid']>) {
    onChange({
      ...state,
      grid: {
        ...state.grid,
        ...nextGrid,
      },
    });
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

  const canvasWidth = formatMeasurement(state.canvas.widthCm, state.canvas.unit);
  const canvasHeight = formatMeasurement(state.canvas.heightCm, state.canvas.unit);
  const gridSquareSize = convertFromCm(state.grid.squareSizeCm, state.grid.unit);

  return (
    <main className="workspace">
      <header className="workspace-toolbar">
        <div>
          <p className="eyebrow">Edit</p>
          <h2>{state.image?.title ?? 'Choose a reference'}</h2>
        </div>
        <button
          className="primary-button"
          onClick={() => canvasRef.current && exportCanvas(canvasRef.current)}
          disabled={!state.image}
        >
          <Download size={18} />
          Export
        </button>
      </header>

      <CanvasStage ref={canvasRef} image={state.image} state={state} onViewportChange={setViewport} />

      <section className="tool-dock" aria-label="Editing tools">
        <div className="tool-panel">
          {activeTool === 'canvas' ? (
            <div className="tool-panel-content">
              <div className="tool-panel-heading">
                <ImageIcon size={16} />
                <span>Canvas size</span>
              </div>

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

              <div className="segmented-control">
                <button data-active={state.canvas.unit === 'cm'} onClick={() => setCanvasUnit('cm')}>
                  cm
                </button>
                <button data-active={state.canvas.unit === 'in'} onClick={() => setCanvasUnit('in')}>
                  in
                </button>
              </div>

              <div className="dimension-row">
                <label>
                  <span>Width</span>
                  <input
                    type="number"
                    min="0.1"
                    step={state.canvas.unit === 'in' ? '0.25' : '0.1'}
                    value={canvasWidth}
                    onChange={(event) => setCanvasDimension('widthCm', event.target.value)}
                  />
                </label>
                <label>
                  <span>Height</span>
                  <input
                    type="number"
                    min="0.1"
                    step={state.canvas.unit === 'in' ? '0.25' : '0.1'}
                    value={canvasHeight}
                    onChange={(event) => setCanvasDimension('heightCm', event.target.value)}
                  />
                </label>
              </div>

              <div className="segmented-control">
                <button data-active={state.canvas.orientation === 'portrait'} onClick={() => setOrientation('portrait')}>
                  Portrait
                </button>
                <button data-active={state.canvas.orientation === 'landscape'} onClick={() => setOrientation('landscape')}>
                  Landscape
                </button>
              </div>
            </div>
          ) : null}

          {activeTool === 'grid' ? (
            <div className="tool-panel-content">
              <div className="tool-panel-heading">
                <Grid2X2 size={16} />
                <span>Grid scale</span>
              </div>

              <label className="toggle-row">
                <span>Show grid</span>
                <input
                  type="checkbox"
                  checked={state.grid.enabled}
                  onChange={(event) => updateGrid({ enabled: event.target.checked })}
                />
              </label>

              <div className="segmented-control">
                <button data-active={state.grid.unit === 'cm'} onClick={() => setGridUnit('cm')}>
                  cm
                </button>
                <button data-active={state.grid.unit === 'in'} onClick={() => setGridUnit('in')}>
                  in
                </button>
              </div>

              <label className="control-row">
                <span>Square</span>
                <input
                  type="number"
                  min={gridLimits.min}
                  max={gridLimits.max}
                  step={gridLimits.step}
                  value={formatMeasurement(state.grid.squareSizeCm, state.grid.unit)}
                  onChange={(event) => setGridSquareSize(event.target.value)}
                />
                <strong>{state.grid.unit}</strong>
              </label>

              <label className="slider-row">
                <span>Square</span>
                <input
                  type="range"
                  min={gridLimits.min}
                  max={gridLimits.max}
                  step={gridLimits.step}
                  value={gridSquareSize}
                  onChange={(event) => setGridSquareSize(event.target.value)}
                />
                <strong>
                  {formatMeasurement(state.grid.squareSizeCm, state.grid.unit)}
                  {' '}
                  {state.grid.unit}
                </strong>
              </label>

              <label className="slider-row">
                <span>Opacity</span>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={state.grid.opacity}
                  onChange={(event) => updateGrid({ opacity: Number(event.target.value) })}
                />
                <strong>{Math.round(state.grid.opacity * 100)}%</strong>
              </label>

              <label className="slider-row">
                <span>Line</span>
                <input
                  type="range"
                  min="0.5"
                  max="5"
                  step="0.5"
                  value={state.grid.lineWidth}
                  onChange={(event) => updateGrid({ lineWidth: Number(event.target.value) })}
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

          {activeTool === 'view' ? (
            <div className="tool-panel-content">
              <div className="tool-panel-heading">
                <RotateCcw size={16} />
                <span>View</span>
              </div>

              <label className="slider-row">
                <span>Zoom</span>
                <input
                  type="range"
                  min="0.2"
                  max="4"
                  step="0.05"
                  value={state.viewport.zoom}
                  onChange={(event) => updateViewport({ zoom: Number(event.target.value) })}
                />
                <strong>{Math.round(state.viewport.zoom * 100)}%</strong>
              </label>

              <div className="zoom-actions">
                <button className="icon-button" title="Zoom out" onClick={() => stepZoom('out')} disabled={!state.image}>
                  <Minus size={16} />
                </button>
                <button className="secondary-button" onClick={() => updateViewport({ zoom: 1, panX: 0, panY: 0 })}>
                  Fit
                </button>
                <button className="icon-button" title="Zoom in" onClick={() => stepZoom('in')} disabled={!state.image}>
                  <Plus size={16} />
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <nav className="tool-strip" aria-label="Tool categories">
          <button data-active={activeTool === 'canvas'} onClick={() => setActiveTool('canvas')}>
            <Crop size={18} />
            <span>Canvas</span>
          </button>
          <button data-active={activeTool === 'grid'} onClick={() => setActiveTool('grid')}>
            <Grid2X2 size={18} />
            <span>Grid</span>
          </button>
          <button data-active={activeTool === 'view'} onClick={() => setActiveTool('view')}>
            <Move size={18} />
            <span>View</span>
          </button>
        </nav>
      </section>
    </main>
  );
}
