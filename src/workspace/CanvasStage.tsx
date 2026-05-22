import {
  forwardRef,
  PointerEvent,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  WheelEvent,
} from 'react';
import type { WorkspaceState } from '../app/appState';
import { drawGridGuides } from '../grid/drawGrid';
import type { ReferenceImage } from '../library/referenceTypes';
import { rgbToHex } from '../palette/colorUtils';
import type { ColorSample, RgbColor } from '../palette/paletteTypes';
import { applyValuesToImageData, shouldApplyValues } from '../values/valueTransforms';
import { BASE_CANVAS_RENDER_LONG_SIDE, getCanvasPixelSize } from './canvasSizing';

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

type ViewTransform = {
  zoom: number;
  panX: number;
  panY: number;
};

type SamplePreview = {
  canvasX: number;
  canvasY: number;
  left: number;
  top: number;
  hex: string;
};

const defaultViewTransform: ViewTransform = {
  zoom: 1,
  panX: 0,
  panY: 0,
};

const minViewZoom = 1;
const maxViewZoom = 6;

export const CanvasStage = forwardRef<HTMLCanvasElement, CanvasStageProps>(
  function CanvasStage({ image, interactionMode, state, onSampleColor, onViewportChange }, forwardedRef) {
    const stageRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const sampleLoupeRef = useRef<HTMLCanvasElement | null>(null);
    const loadedImageRef = useRef<HTMLImageElement | null>(null);
    const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
    const lastViewPointerRef = useRef<{ x: number; y: number } | null>(null);
    const isSpacePressedRef = useRef(false);
    const [isPanning, setIsPanning] = useState(false);
    const [isViewPanning, setIsViewPanning] = useState(false);
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    const [viewTransform, setViewTransform] = useState<ViewTransform>(defaultViewTransform);
    const [samplePreview, setSamplePreview] = useState<SamplePreview | null>(null);
    const isViewAdjusted =
      viewTransform.zoom > 1.001 || Math.abs(viewTransform.panX) > 0.5 || Math.abs(viewTransform.panY) > 0.5;

    useImperativeHandle(forwardedRef, () => canvasRef.current as HTMLCanvasElement, []);

    useEffect(() => {
      const handleKeyDown = (event: globalThis.KeyboardEvent) => {
        if (event.code !== 'Space' || isTypingTarget(event.target)) return;

        event.preventDefault();
        isSpacePressedRef.current = true;
        setIsSpacePressed(true);
      };

      const handleKeyUp = (event: globalThis.KeyboardEvent) => {
        if (event.code !== 'Space') return;

        event.preventDefault();
        isSpacePressedRef.current = false;
        setIsSpacePressed(false);
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
      };
    }, []);

    useEffect(() => {
      setViewTransform(defaultViewTransform);
      setIsViewPanning(false);
      lastViewPointerRef.current = null;
    }, [image?.id, state.canvas.widthCm, state.canvas.heightCm]);

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
    }, [state.canvas, state.filters, state.grid, state.values, state.viewport]);

    useEffect(() => {
      if (interactionMode !== 'sample') {
        setSamplePreview(null);
      }
    }, [interactionMode]);

    useEffect(() => {
      if (!samplePreview) return;

      drawSampleLoupe(samplePreview.canvasX, samplePreview.canvasY);
    }, [samplePreview]);

    function draw() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { width, height, pixelsPerCm } = getCanvasPixelSize(state.canvas.widthCm, state.canvas.heightCm);
      const renderScale = Math.max(width, height) / BASE_CANVAS_RENDER_LONG_SIDE;
      canvas.width = width;
      canvas.height = height;

      ctx.fillStyle = '#111214';
      ctx.fillRect(0, 0, width, height);

      const loadedImage = loadedImageRef.current;
      if (loadedImage) {
        const imageRect = getImageDrawRect(width, height, loadedImage, state.viewport);

        drawReferenceImage(ctx, loadedImage, imageRect, width, height, state, renderScale);
      }

      drawGridGuides(ctx, width, height, {
        enabled: state.grid.enabled,
        type: state.grid.type,
        spacing: state.grid.squareSizeCm * pixelsPerCm,
        color: state.grid.color,
        opacity: state.grid.opacity,
        lineWidth: state.grid.lineWidth * renderScale,
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

    function updateSamplePreview(event: PointerEvent<HTMLCanvasElement>) {
      const canvas = event.currentTarget;
      const loadedImage = loadedImageRef.current;
      const stageRect = stageRef.current?.getBoundingClientRect();
      if (!loadedImage || !stageRect) return;

      const point = getCanvasPoint(event);
      const imageRect = getImageDrawRect(canvas.width, canvas.height, loadedImage, state.viewport);
      const isInsideImage =
        point.x >= imageRect.x &&
        point.x <= imageRect.x + imageRect.width &&
        point.y >= imageRect.y &&
        point.y <= imageRect.y + imageRect.height;

      if (!isInsideImage) {
        setSamplePreview(null);
        return;
      }

      const imageX = ((point.x - imageRect.x) / imageRect.width) * loadedImage.naturalWidth;
      const imageY = ((point.y - imageRect.y) / imageRect.height) * loadedImage.naturalHeight;
      const rgb = sampleImageColor(loadedImage, imageX, imageY, state);
      const loupeSize = 116;
      const left = clamp(event.clientX - stageRect.left + 18, 12, Math.max(12, stageRect.width - loupeSize - 12));
      const top = clamp(event.clientY - stageRect.top - loupeSize - 18, 12, Math.max(12, stageRect.height - loupeSize - 12));

      setSamplePreview({
        canvasX: point.x,
        canvasY: point.y,
        left,
        top,
        hex: rgbToHex(rgb),
      });
    }

    function drawSampleLoupe(canvasX: number, canvasY: number) {
      const canvas = canvasRef.current;
      const loupe = sampleLoupeRef.current;
      if (!canvas || !loupe) return;

      const ctx = loupe.getContext('2d');
      if (!ctx) return;

      const sourceSize = 34;
      ctx.clearRect(0, 0, loupe.width, loupe.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        canvas,
        clamp(canvasX - sourceSize / 2, 0, canvas.width - sourceSize),
        clamp(canvasY - sourceSize / 2, 0, canvas.height - sourceSize),
        sourceSize,
        sourceSize,
        0,
        0,
        loupe.width,
        loupe.height,
      );
    }

    function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
      if (!image) return;

      if (isSpacePressedRef.current) {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        lastViewPointerRef.current = {
          x: event.clientX,
          y: event.clientY,
        };
        setIsViewPanning(true);
        return;
      }

      if (interactionMode === 'sample') {
        event.preventDefault();
        updateSamplePreview(event);
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
      if (isViewPanning && lastViewPointerRef.current) {
        const deltaX = event.clientX - lastViewPointerRef.current.x;
        const deltaY = event.clientY - lastViewPointerRef.current.y;

        lastViewPointerRef.current = {
          x: event.clientX,
          y: event.clientY,
        };

        setViewTransform((current) => ({
          ...current,
          panX: current.panX + deltaX,
          panY: current.panY + deltaY,
        }));
        return;
      }

      if (interactionMode === 'sample') {
        updateSamplePreview(event);
        return;
      }

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
      lastViewPointerRef.current = null;
      setIsViewPanning(false);
    }

    function handleWheel(event: WheelEvent<HTMLCanvasElement>) {
      if (!image) return;

      if (event.metaKey || event.ctrlKey) {
        event.preventDefault();
        zoomViewAtPoint(event);
        return;
      }

      if (interactionMode !== 'pan') return;

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

    function zoomViewAtPoint(event: WheelEvent<HTMLCanvasElement>) {
      const stageRect = stageRef.current?.getBoundingClientRect();
      const centerX = stageRect ? stageRect.left + stageRect.width / 2 : event.clientX;
      const centerY = stageRect ? stageRect.top + stageRect.height / 2 : event.clientY;
      const pointerX = event.clientX - centerX;
      const pointerY = event.clientY - centerY;

      setViewTransform((current) => {
        const nextZoom = clamp(current.zoom * Math.exp(-event.deltaY * 0.002), minViewZoom, maxViewZoom);
        const ratio = nextZoom / current.zoom;

        if (nextZoom === minViewZoom && current.zoom !== minViewZoom) {
          return defaultViewTransform;
        }

        return {
          zoom: nextZoom,
          panX: pointerX - (pointerX - current.panX) * ratio,
          panY: pointerY - (pointerY - current.panY) * ratio,
        };
      });
    }

    function resetViewTransform() {
      setViewTransform(defaultViewTransform);
    }

    return (
      <div className="canvas-stage" ref={stageRef} data-sampling={interactionMode === 'sample'}>
        <div
          className="canvas-view-pan"
          style={{ transform: `translate3d(${viewTransform.panX}px, ${viewTransform.panY}px, 0)` }}
        >
          <div className="canvas-view-scale" style={{ transform: `scale(${viewTransform.zoom})` }}>
            <canvas
              ref={canvasRef}
              aria-label="Reference workspace canvas"
              data-locked={interactionMode === 'locked'}
              data-panning={isPanning}
              data-sampling={interactionMode === 'sample'}
              data-view-pan-ready={isSpacePressed}
              data-view-panning={isViewPanning}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endPan}
              onPointerCancel={endPan}
              onPointerLeave={() => setSamplePreview(null)}
              onWheel={handleWheel}
            />
          </div>
        </div>
        {interactionMode === 'sample' && samplePreview ? (
          <div className="sample-loupe" style={{ left: samplePreview.left, top: samplePreview.top }}>
            <canvas ref={sampleLoupeRef} width="112" height="112" />
            <span className="sample-loupe-crosshair" />
            <span className="sample-loupe-swatch" style={{ backgroundColor: samplePreview.hex }} />
          </div>
        ) : null}
        {isViewAdjusted ? (
          <button
            type="button"
            className="view-fit-button"
            onClick={resetViewTransform}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <span>{Math.round(viewTransform.zoom * 100)}%</span>
            <strong>Fit</strong>
          </button>
        ) : null}
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

function getCanvasFilter(filters: WorkspaceState['filters'], renderScale = 1) {
  if (!filters.enabled) return 'none';

  const blur = Math.max(0, filters.blur) * renderScale;
  const brightness = Math.max(0, 100 + filters.exposure);
  const contrast = Math.max(0, 100 + filters.contrast);
  const saturation = Math.max(0, filters.saturation);

  return `blur(${blur}px) brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
}

function drawReferenceImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  imageRect: ImageDrawRect,
  canvasWidth: number,
  canvasHeight: number,
  state: WorkspaceState,
  renderScale: number,
) {
  ctx.save();
  ctx.filter = state.filters.showOriginal ? 'none' : getCanvasFilter(state.filters, renderScale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, imageRect.x, imageRect.y, imageRect.width, imageRect.height);
  ctx.restore();

  if (state.filters.showOriginal) return;

  const shouldApplyTonalFilters = hasTonalFilterAdjustments(state.filters);
  const shouldApplyValueMap = shouldApplyValues(state.values);
  if (!shouldApplyTonalFilters && !shouldApplyValueMap) return;

  const visibleRect = getVisibleImageDataRect(imageRect, canvasWidth, canvasHeight);
  if (!visibleRect) return;

  const imageData = ctx.getImageData(visibleRect.x, visibleRect.y, visibleRect.width, visibleRect.height);
  if (shouldApplyTonalFilters) {
    applyTonalFilterAdjustments(imageData, state.filters);
  }
  if (shouldApplyValueMap) {
    applyValuesToImageData(imageData, state.values);
  }
  ctx.putImageData(imageData, visibleRect.x, visibleRect.y);
}

function getVisibleImageDataRect(imageRect: ImageDrawRect, canvasWidth: number, canvasHeight: number) {
  const x = Math.max(0, Math.floor(imageRect.x));
  const y = Math.max(0, Math.floor(imageRect.y));
  const right = Math.min(canvasWidth, Math.ceil(imageRect.x + imageRect.width));
  const bottom = Math.min(canvasHeight, Math.ceil(imageRect.y + imageRect.height));
  const width = right - x;
  const height = bottom - y;

  if (width <= 0 || height <= 0) return null;

  return { x, y, width, height };
}

function hasTonalFilterAdjustments(filters: WorkspaceState['filters']) {
  return filters.enabled && (filters.highlights !== 0 || filters.shadows !== 0);
}

function applyTonalFilterAdjustments(imageData: ImageData, filters: WorkspaceState['filters']) {
  if (!hasTonalFilterAdjustments(filters)) return;

  const highlightAdjustment = filters.highlights / 100;
  const shadowAdjustment = filters.shadows / 100;
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const luma = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
    const shadowWeight = 1 - smoothStep(0.18, 0.68, luma);
    const highlightWeight = smoothStep(0.38, 0.88, luma);

    data[index] = adjustToneChannel(red, shadowAdjustment, shadowWeight);
    data[index + 1] = adjustToneChannel(green, shadowAdjustment, shadowWeight);
    data[index + 2] = adjustToneChannel(blue, shadowAdjustment, shadowWeight);

    data[index] = adjustToneChannel(data[index], highlightAdjustment, highlightWeight);
    data[index + 1] = adjustToneChannel(data[index + 1], highlightAdjustment, highlightWeight);
    data[index + 2] = adjustToneChannel(data[index + 2], highlightAdjustment, highlightWeight);
  }
}

function adjustToneChannel(channel: number, adjustment: number, weight: number) {
  const strength = adjustment * weight * 0.72;
  const nextValue = strength >= 0 ? channel + (255 - channel) * strength : channel + channel * strength;

  return clampByte(nextValue);
}

function smoothStep(edge0: number, edge1: number, value: number) {
  const normalized = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

function clampByte(value: number) {
  return Math.round(clamp(value, 0, 255));
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

  const useFilteredSource = state.palette.source === 'filtered' && !state.filters.showOriginal;

  if (useFilteredSource) {
    sampleContext.filter = getCanvasFilter(state.filters);
  }

  sampleContext.drawImage(image, sourceX, sourceY, sampleSize, sampleSize, 0, 0, sampleSize, sampleSize);

  const sampleImageData = sampleContext.getImageData(0, 0, sampleSize, sampleSize);
  if (useFilteredSource) {
    applyTonalFilterAdjustments(sampleImageData, state.filters);
    applyValuesToImageData(sampleImageData, state.values);
  }

  const { data } = sampleImageData;
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

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return target.isContentEditable || ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
