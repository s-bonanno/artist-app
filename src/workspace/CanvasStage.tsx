import { forwardRef, PointerEvent, useEffect, useImperativeHandle, useRef, useState, WheelEvent } from 'react';
import { drawSquareGrid } from '../grid/drawGrid';
import type { ReferenceImage } from '../library/referenceTypes';
import type { WorkspaceState } from '../app/appState';
import { getCanvasPixelSize } from './canvasSizing';

type CanvasStageProps = {
  image: ReferenceImage | null;
  state: WorkspaceState;
  onViewportChange: (viewport: WorkspaceState['viewport']) => void;
};

export const CanvasStage = forwardRef<HTMLCanvasElement, CanvasStageProps>(
  function CanvasStage({ image, state, onViewportChange }, forwardedRef) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const loadedImageRef = useRef<HTMLImageElement | null>(null);
    const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
    const [isPanning, setIsPanning] = useState(false);

    useImperativeHandle(forwardedRef, () => canvasRef.current as HTMLCanvasElement, []);

    useEffect(() => {
      if (!image) {
        loadedImageRef.current = null;
        draw();
        return;
      }

      const nextImage = new Image();
      nextImage.onload = () => {
        loadedImageRef.current = nextImage;
        draw();
      };
      nextImage.src = image.src;
    }, [image]);

    useEffect(() => {
      draw();
    }, [state.canvas, state.grid, state.viewport]);

    function draw() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { width, height, pixelsPerCm } = getCanvasPixelSize(state.canvas.widthCm, state.canvas.heightCm);
      canvas.width = width;
      canvas.height = height;

      ctx.fillStyle = '#262629';
      ctx.fillRect(0, 0, width, height);

      const loadedImage = loadedImageRef.current;
      if (loadedImage) {
        const scale = Math.min(width / loadedImage.width, height / loadedImage.height) * state.viewport.zoom;
        const drawWidth = loadedImage.width * scale;
        const drawHeight = loadedImage.height * scale;
        const x = (width - drawWidth) / 2 + state.viewport.panX;
        const y = (height - drawHeight) / 2 + state.viewport.panY;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(loadedImage, x, y, drawWidth, drawHeight);
      }

      drawSquareGrid(ctx, width, height, {
        enabled: state.grid.enabled,
        spacing: state.grid.squareSizeCm * pixelsPerCm,
        color: state.grid.color,
        opacity: state.grid.opacity,
        lineWidth: state.grid.lineWidth,
      });
    }

    function getCanvasScale(canvas: HTMLCanvasElement) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: canvas.width / rect.width,
        y: canvas.height / rect.height,
      };
    }

    function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
      if (!image) return;

      event.currentTarget.setPointerCapture(event.pointerId);
      lastPointerRef.current = {
        x: event.clientX,
        y: event.clientY,
      };
      setIsPanning(true);
    }

    function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
      if (!isPanning || !lastPointerRef.current) return;

      const scale = getCanvasScale(event.currentTarget);
      const deltaX = (event.clientX - lastPointerRef.current.x) * scale.x;
      const deltaY = (event.clientY - lastPointerRef.current.y) * scale.y;

      lastPointerRef.current = {
        x: event.clientX,
        y: event.clientY,
      };

      onViewportChange({
        ...state.viewport,
        panX: state.viewport.panX + deltaX,
        panY: state.viewport.panY + deltaY,
      });
    }

    function endPan(event: PointerEvent<HTMLCanvasElement>) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      lastPointerRef.current = null;
      setIsPanning(false);
    }

    function handleWheel(event: WheelEvent<HTMLCanvasElement>) {
      if (!image) return;

      event.preventDefault();

      const canvas = event.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const scale = getCanvasScale(canvas);
      const pointerX = (event.clientX - rect.left) * scale.x;
      const pointerY = (event.clientY - rect.top) * scale.y;
      const currentZoom = state.viewport.zoom;
      const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
      const nextZoom = Math.min(4, Math.max(0.2, currentZoom * zoomFactor));
      const zoomRatio = nextZoom / currentZoom;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      onViewportChange({
        zoom: nextZoom,
        panX: pointerX - centerX - (pointerX - centerX - state.viewport.panX) * zoomRatio,
        panY: pointerY - centerY - (pointerY - centerY - state.viewport.panY) * zoomRatio,
      });
    }

    return (
      <div className="canvas-stage">
        <canvas
          ref={canvasRef}
          aria-label="Reference workspace canvas"
          data-panning={isPanning}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          onWheel={handleWheel}
        />
      </div>
    );
  },
);
