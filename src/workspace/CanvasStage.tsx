import { forwardRef, PointerEvent, useEffect, useImperativeHandle, useRef, useState, WheelEvent } from 'react';
import type { WorkspaceState } from '../app/appState';
import { drawSquareGrid } from '../grid/drawGrid';
import type { ReferenceImage } from '../library/referenceTypes';
import { rgbToHex } from '../palette/colorUtils';
import type { ColorSample, RgbColor } from '../palette/paletteTypes';
import { getCanvasPixelSize } from './canvasSizing';

type CanvasStageProps = {
  image: ReferenceImage | null;
  interactionMode: 'locked' | 'pan' | 'sample';
  state: WorkspaceState;
  onSampleColor: (sample: ColorSample) => void;
  onViewportChange: (viewport: WorkspaceState['viewport']) => void;
};

type ImageDrawRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const CanvasStage = forwardRef<HTMLCanvasElement, CanvasStageProps>(
  function CanvasStage({ image, interactionMode, state, onSampleColor, onViewportChange }, forwardedRef) {
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
    }, [state.canvas, state.filters, state.grid, state.viewport]);

    function draw() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { width, height, pixelsPerCm } = getCanvasPixelSize(state.canvas.widthCm, state.canvas.heightCm);
      canvas.width = width;
      canvas.height = height;

      ctx.fillStyle = '#111214';
      ctx.fillRect(0, 0, width, height);

      const loadedImage = loadedImageRef.current;
      if (loadedImage) {
        const imageRect = getImageDrawRect(width, height, loadedImage, state.viewport);

        ctx.save();
        ctx.filter = state.filters.showOriginal ? 'none' : getCanvasFilter(state.filters);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(loadedImage, imageRect.x, imageRect.y, imageRect.width, imageRect.height);
        ctx.restore();
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

    function getCanvasPoint(event: PointerEvent<HTMLCanvasElement>) {
      const scale = getCanvasScale(event.currentTarget);
      const rect = event.currentTarget.getBoundingClientRect();

      return {
        x: (event.clientX - rect.left) * scale.x,
        y: (event.clientY - rect.top) * scale.y,
      };
    }

    function handleSample(event: PointerEvent<HTMLCanvasElement>) {
      const canvas = event.currentTarget;
      const loadedImage = loadedImageRef.current;
      if (!loadedImage) return;

      const point = getCanvasPoint(event);
      const imageRect = getImageDrawRect(canvas.width, canvas.height, loadedImage, state.viewport);
      const isInsideImage =
        point.x >= imageRect.x &&
        point.x <= imageRect.x + imageRect.width &&
        point.y >= imageRect.y &&
        point.y <= imageRect.y + imageRect.height;

      if (!isInsideImage) return;

      const imageX = ((point.x - imageRect.x) / imageRect.width) * loadedImage.naturalWidth;
      const imageY = ((point.y - imageRect.y) / imageRect.height) * loadedImage.naturalHeight;
      const rgb = sampleImageColor(loadedImage, imageX, imageY, state);

      onSampleColor({
        hex: rgbToHex(rgb),
        rgb,
        source: state.palette.source,
        sampleSize: state.palette.sampleSize,
        imagePoint: {
          x: Math.round(imageX),
          y: Math.round(imageY),
        },
      });
    }

    function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
      if (!image) return;

      if (interactionMode === 'sample') {
        event.preventDefault();
        handleSample(event);
        return;
      }

      if (interactionMode !== 'pan') return;

      event.currentTarget.setPointerCapture(event.pointerId);
      lastPointerRef.current = {
        x: event.clientX,
        y: event.clientY,
      };
      setIsPanning(true);
    }

    function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
      if (!isPanning || !lastPointerRef.current || interactionMode !== 'pan') return;

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
      if (!image || interactionMode !== 'pan') return;

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
          data-locked={interactionMode === 'locked'}
          data-panning={isPanning}
          data-sampling={interactionMode === 'sample'}
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

function getImageDrawRect(
  width: number,
  height: number,
  image: HTMLImageElement,
  viewport: WorkspaceState['viewport'],
): ImageDrawRect {
  const scale = Math.min(width / image.width, height / image.height) * viewport.zoom;
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;

  return {
    x: (width - drawWidth) / 2 + viewport.panX,
    y: (height - drawHeight) / 2 + viewport.panY,
    width: drawWidth,
    height: drawHeight,
  };
}

function getCanvasFilter(filters: WorkspaceState['filters']) {
  const blur = Math.max(0, filters.blur);
  const brightness = Math.max(0, 100 + filters.exposure);
  const contrast = Math.max(0, 100 + filters.contrast);

  return `blur(${blur}px) brightness(${brightness}%) contrast(${contrast}%)`;
}

function sampleImageColor(
  image: HTMLImageElement,
  imageX: number,
  imageY: number,
  state: WorkspaceState,
): RgbColor {
  const sampleSize = state.palette.sampleSize;
  const halfSample = Math.floor(sampleSize / 2);
  const sourceX = clamp(Math.round(imageX) - halfSample, 0, image.naturalWidth - sampleSize);
  const sourceY = clamp(Math.round(imageY) - halfSample, 0, image.naturalHeight - sampleSize);
  const sampleCanvas = document.createElement('canvas');
  const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });

  sampleCanvas.width = sampleSize;
  sampleCanvas.height = sampleSize;

  if (!sampleContext) return [0, 0, 0];

  if (state.palette.source === 'filtered' && !state.filters.showOriginal) {
    sampleContext.filter = getCanvasFilter(state.filters);
  }

  sampleContext.drawImage(image, sourceX, sourceY, sampleSize, sampleSize, 0, 0, sampleSize, sampleSize);

  const { data } = sampleContext.getImageData(0, 0, sampleSize, sampleSize);
  const channels = [0, 0, 0];
  const pixelCount = data.length / 4;

  for (let index = 0; index < data.length; index += 4) {
    channels[0] += data[index];
    channels[1] += data[index + 1];
    channels[2] += data[index + 2];
  }

  return [
    Math.round(channels[0] / pixelCount),
    Math.round(channels[1] / pixelCount),
    Math.round(channels[2] / pixelCount),
  ];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
