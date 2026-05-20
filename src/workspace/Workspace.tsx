import { Download, Grid2X2, Image as ImageIcon, RotateCcw } from 'lucide-react';
import { useRef } from 'react';
import type { WorkspaceState } from '../app/appState';
import { exportCanvas } from '../export/exportCanvas';
import { CanvasStage } from './CanvasStage';

type WorkspaceProps = {
  state: WorkspaceState;
  onChange: (nextState: WorkspaceState) => void;
};

export function Workspace({ state, onChange }: WorkspaceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

  return (
    <main className="workspace">
      <header className="workspace-toolbar">
        <div>
          <p className="eyebrow">Workspace</p>
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

      <CanvasStage ref={canvasRef} image={state.image} state={state} />

      <section className="controls-panel" aria-label="Canvas controls">
        <div className="control-group">
          <div className="control-title">
            <ImageIcon size={16} />
            Canvas
          </div>
          <div className="segmented-control">
            <button
              data-active={state.canvas.orientation === 'portrait'}
              onClick={() => updateCanvas({ orientation: 'portrait' })}
            >
              Portrait
            </button>
            <button
              data-active={state.canvas.orientation === 'landscape'}
              onClick={() => updateCanvas({ orientation: 'landscape' })}
            >
              Landscape
            </button>
          </div>
        </div>

        <div className="control-group">
          <div className="control-title">
            <Grid2X2 size={16} />
            Grid
          </div>
          <label className="toggle-row">
            <span>Show grid</span>
            <input
              type="checkbox"
              checked={state.grid.enabled}
              onChange={(event) => updateGrid({ enabled: event.target.checked })}
            />
          </label>
          <label>
            <span>Spacing</span>
            <input
              type="range"
              min="20"
              max="160"
              value={state.grid.spacing}
              onChange={(event) => updateGrid({ spacing: Number(event.target.value) })}
            />
          </label>
          <label>
            <span>Opacity</span>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={state.grid.opacity}
              onChange={(event) => updateGrid({ opacity: Number(event.target.value) })}
            />
          </label>
          <label>
            <span>Color</span>
            <input
              type="color"
              value={state.grid.color}
              onChange={(event) => updateGrid({ color: event.target.value })}
            />
          </label>
        </div>

        <div className="control-group">
          <div className="control-title">
            <RotateCcw size={16} />
            View
          </div>
          <label>
            <span>Zoom</span>
            <input
              type="range"
              min="0.25"
              max="3"
              step="0.05"
              value={state.viewport.zoom}
              onChange={(event) => updateViewport({ zoom: Number(event.target.value) })}
            />
          </label>
          <button className="secondary-button" onClick={() => updateViewport({ zoom: 1, panX: 0, panY: 0 })}>
            Reset View
          </button>
        </div>
      </section>
    </main>
  );
}

