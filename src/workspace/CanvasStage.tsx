import {
  forwardRef,
  MouseEvent,
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
import type {
  ShapeDetail,
  SpatialColorStudyProgress,
  SpatialColorSwatch,
} from '../palette/spatialColorStudy';
import { applyValuesToImageData, shouldApplyValues } from '../values/valueTransforms';
import { BASE_CANVAS_RENDER_LONG_SIDE, getCanvasPixelSize } from './canvasSizing';

type CanvasStageProps = {
  image: ReferenceImage | null;
  interactionMode: 'locked' | 'pan' | 'sample' | 'color-isolate';
  isSliderInteracting: boolean;
  state: WorkspaceState;
  highlightedColorStudyHex: string | null;
  onSampleColor: (sample: ColorSample) => void;
  onColorStudyPick: (hex: string) => void;
  onColorStudyChange: (update: ColorStudyStatus) => void;
  onViewportChange: (viewport: WorkspaceState['viewport']) => void;
};

type ColorStudyWorkerProgressResponse = SpatialColorStudyProgress & {
  type: 'progress';
  id: number;
  detail: ShapeDetail;
};

type ColorStudyWorkerResultResponse = {
  type: 'result';
  id: number;
  detail: ShapeDetail;
  width: number;
  height: number;
  buffer: ArrayBuffer;
  swatches: SpatialColorSwatch[];
};

type ColorStudyWorkerResponse = ColorStudyWorkerProgressResponse | ColorStudyWorkerResultResponse;

type ColorStudyStatus = {
  processing: boolean;
  swatches: SpatialColorSwatch[];
  progress: number;
  stage: string | null;
};

type ColorStudyRender = {
  canvas: HTMLCanvasElement;
  swatches: SpatialColorSwatch[];
  drawRect: ImageDrawRect;
};

type ImageDrawRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ColorStudyCrop = {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  width: number;
  height: number;
  drawRect: ImageDrawRect;
};

type ViewTransform = {
  zoom: number;
  panX: number;
  panY: number;
};

type CanvasDisplaySize = {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

type PointerPosition = {
  x: number;
  y: number;
};

type ActivePointerPosition = PointerPosition & {
  id: number;
};

type TouchGestureState = {
  target: 'view' | 'image';
  pointerIds: number[];
  startDistance: number;
  startClientCenter: PointerPosition;
  startViewCenter: PointerPosition;
  startCanvasCenter: PointerPosition;
  startViewTransform: ViewTransform;
  startViewport: WorkspaceState['viewport'];
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

const maxWorkspaceBackingPixels = 16_000_000;
const maxWorkspaceRenderLongSide = 4800;
const maxIOSWorkspaceBackingPixels = 16_000_000;
const maxIOSWorkspaceRenderLongSide = 4800;
const iosSliderRenderQuality = 0.5;
const workspaceRenderQualityStep = 0.25;
const paletteSampleSize = 3;
const minViewZoom = 1;
const maxViewZoom = 10;
const minImageZoom = 0.2;
const maxImageZoom = 8;
const colorStudyReferenceLongSide = 820;
const colorStudyLongSideByDetail: Record<ShapeDetail, number> = {
  coarse: 1200,
  balanced: 1500,
  fine: 1800,
};
const colorStudyViewportDebounceMs = 320;
const colorIsolateTapMovementThreshold = 10;
const colorIsolateDoubleTapDistanceThreshold = 28;
const colorIsolateDoubleTapInterval = 350;
const colorStudyDetails: ShapeDetail[] = ['coarse', 'balanced', 'fine'];
const colorStudyHighlightCache = new WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();

export const CanvasStage = forwardRef<HTMLCanvasElement, CanvasStageProps>(
  function CanvasStage(
    {
      image,
      interactionMode,
      isSliderInteracting,
      state,
      highlightedColorStudyHex,
      onSampleColor,
      onColorStudyPick,
      onColorStudyChange,
      onViewportChange,
    },
    forwardedRef,
  ) {
    const stageRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const sampleLoupeRef = useRef<HTMLCanvasElement | null>(null);
    const loadedImageRef = useRef<HTMLImageElement | null>(null);
    const colorStudyRenderRef = useRef<ColorStudyRender | null>(null);
    const colorStudyCacheRef = useRef<Map<ShapeDetail, ColorStudyRender>>(new Map());
    const colorStudyDetailRef = useRef<ShapeDetail>('balanced');
    const colorStudySignatureRef = useRef('');
    const colorStudyImageKeyRef = useRef('');
    const colorStudyRequestRef = useRef(0);
    const logicalCanvasSizeRef = useRef(getCanvasPixelSize(state.canvas.widthCm, state.canvas.heightCm));
    const renderQualityRef = useRef(1);
    const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
    const lastViewPointerRef = useRef<{ x: number; y: number } | null>(null);
    const touchPointersRef = useRef<Map<number, PointerPosition>>(new Map());
    const touchGestureRef = useRef<TouchGestureState | null>(null);
    const didUseMultiTouchRef = useRef(false);
    const lastColorIsolateTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
    const ignoreColorIsolateDoubleClickUntilRef = useRef(0);
    const viewTransformRef = useRef<ViewTransform>(defaultViewTransform);
    const viewportRef = useRef<WorkspaceState['viewport']>(state.viewport);
    const activeSamplePointerRef = useRef<number | null>(null);
    const lastSampleRef = useRef<ColorSample | null>(null);
    const isSpacePressedRef = useRef(false);
    const [isPanning, setIsPanning] = useState(false);
    const [isViewPanning, setIsViewPanning] = useState(false);
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    const [viewTransform, setViewTransform] = useState<ViewTransform>(defaultViewTransform);
    const [canvasDisplaySize, setCanvasDisplaySize] = useState<CanvasDisplaySize | null>(null);
    const [samplePreview, setSamplePreview] = useState<SamplePreview | null>(null);
    const [loadedImageRevision, setLoadedImageRevision] = useState(0);
    const isViewAdjusted =
      viewTransform.zoom > 1.001 || Math.abs(viewTransform.panX) > 0.5 || Math.abs(viewTransform.panY) > 0.5;

    useImperativeHandle(forwardedRef, () => canvasRef.current as HTMLCanvasElement, []);

    useEffect(() => {
      viewportRef.current = state.viewport;
    }, [state.viewport]);

    useEffect(() => {
      viewTransformRef.current = viewTransform;
    }, [viewTransform]);

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
      const handleDocumentWheel = (event: globalThis.WheelEvent) => {
        if (!event.ctrlKey && !event.metaKey) return;

        const editScreen = stageRef.current?.closest('.edit-screen');
        const target = event.target as Node | null;
        if (!editScreen || !target || !editScreen.contains(target)) return;

        event.preventDefault();
      };

      document.addEventListener('wheel', handleDocumentWheel, { capture: true, passive: false });

      return () => {
        document.removeEventListener('wheel', handleDocumentWheel, { capture: true });
      };
    }, []);

    useEffect(() => {
      applyViewTransform(defaultViewTransform);
      setIsViewPanning(false);
      lastViewPointerRef.current = null;
      touchPointersRef.current.clear();
      touchGestureRef.current = null;
      didUseMultiTouchRef.current = false;
    }, [image?.id, state.canvas.widthCm, state.canvas.heightCm]);

    useEffect(() => {
      if (!image) {
        loadedImageRef.current = null;
        colorStudyRenderRef.current = null;
        colorStudyCacheRef.current.clear();
        setLoadedImageRevision((revision) => revision + 1);
        draw();
        return;
      }

      loadedImageRef.current = null;
      colorStudyRenderRef.current = null;
      colorStudyCacheRef.current.clear();
      setLoadedImageRevision((revision) => revision + 1);
      draw();

      const nextImage = new Image();
      nextImage.onload = () => {
        loadedImageRef.current = nextImage;
        setLoadedImageRevision((revision) => revision + 1);
        draw();
      };
      nextImage.src = image.src;
    }, [image]);

    useEffect(() => {
      const detailIndex = clamp(Math.round(state.values.colorDetail ?? 1), 0, colorStudyDetails.length - 1);
      const detail = colorStudyDetails[detailIndex];
      colorStudyDetailRef.current = detail;

      if (!state.values.enabled || state.values.mode !== 'color') return;

      const cached = colorStudyCacheRef.current.get(detail);
      if (cached) {
        colorStudyRenderRef.current = cached;
        onColorStudyChange({
          processing: false,
          swatches: cached.swatches,
          progress: 1,
          stage: null,
        });
        draw();
        return;
      }

      onColorStudyChange({
        processing: true,
        swatches: colorStudyRenderRef.current?.swatches ?? [],
        progress: 0,
        stage: 'Preparing crop',
      });
      draw();
    }, [state.values.enabled, state.values.mode, state.values.colorDetail]);

    useEffect(() => {
      const loadedImage = loadedImageRef.current;
      const isMovingImage = interactionMode === 'pan';
      const shouldProcess = Boolean(
        loadedImage
        && state.values.enabled
        && state.values.mode === 'color',
      );
      const requestId = colorStudyRequestRef.current + 1;
      colorStudyRequestRef.current = requestId;

      if (isMovingImage) {
        return undefined;
      }

      const imageKey = `${image?.id ?? ''}:${loadedImageRevision}`;
      const sourceSignature = [
        imageKey,
        state.canvas.widthCm,
        state.canvas.heightCm,
        state.viewport.zoom.toFixed(4),
        state.viewport.panX.toFixed(2),
        state.viewport.panY.toFixed(2),
        state.filters.enabled,
        state.filters.blur,
        state.filters.exposure,
        state.filters.contrast,
        state.filters.highlights,
        state.filters.shadows,
        state.filters.saturation,
      ].join(':');
      const previousRender = colorStudyRenderRef.current;

      if (sourceSignature !== colorStudySignatureRef.current) {
        colorStudyCacheRef.current.clear();
        colorStudySignatureRef.current = sourceSignature;
        colorStudyRenderRef.current = null;
      }
      if (imageKey !== colorStudyImageKeyRef.current) {
        colorStudyRenderRef.current = null;
        colorStudyImageKeyRef.current = imageKey;
      }

      if (!loadedImage || !shouldProcess) {
        colorStudyRenderRef.current = null;
        onColorStudyChange({ processing: false, swatches: [], progress: 0, stage: null });
        draw();
        return undefined;
      }

      const selectedDetail = colorStudyDetailRef.current;
      const cached = colorStudyCacheRef.current.get(selectedDetail);
      if (cached) {
        colorStudyRenderRef.current = cached;
        onColorStudyChange({
          processing: false,
          swatches: cached.swatches,
          progress: 1,
          stage: null,
        });
        draw();
        return undefined;
      }

      onColorStudyChange({
        processing: true,
        swatches: previousRender?.swatches ?? [],
        progress: 0.03,
        stage: 'Preparing crop',
      });
      draw();

      let worker: Worker | null = null;
      const processTimeout = window.setTimeout(() => {
        const canvasSize = getCanvasPixelSize(state.canvas.widthCm, state.canvas.heightCm);
        const crop = getColorStudyCrop(
          canvasSize.width,
          canvasSize.height,
          loadedImage,
          state.viewport,
          colorStudyLongSideByDetail[selectedDetail],
        );
        if (!crop) {
          onColorStudyChange({ processing: false, swatches: [], progress: 0, stage: null });
          return;
        }

        const analysisCanvas = document.createElement('canvas');
        const analysisContext = analysisCanvas.getContext('2d', { willReadFrequently: true });
        analysisCanvas.width = crop.width;
        analysisCanvas.height = crop.height;

        if (!analysisContext) {
          onColorStudyChange({ processing: false, swatches: [], progress: 0, stage: null });
          return;
        }

        analysisContext.imageSmoothingEnabled = true;
        analysisContext.imageSmoothingQuality = 'high';
        analysisContext.drawImage(
          loadedImage,
          crop.sourceX,
          crop.sourceY,
          crop.sourceWidth,
          crop.sourceHeight,
          0,
          0,
          crop.width,
          crop.height,
        );
        const imageData = analysisContext.getImageData(0, 0, crop.width, crop.height);
        applyBaseFilterAdjustments(
          imageData,
          state.filters,
          Math.max(crop.width, crop.height) / BASE_CANVAS_RENDER_LONG_SIDE,
        );
        applyTonalFilterAdjustments(imageData, state.filters);
        onColorStudyChange({
          processing: true,
          swatches: previousRender?.swatches ?? [],
          progress: 0.06,
          stage: 'Grouping colours',
        });

        worker = new Worker(
          new URL('../palette/spatialColorStudy.worker.ts', import.meta.url),
          { type: 'module' },
        );

        worker.onmessage = (event: MessageEvent<ColorStudyWorkerResponse>) => {
          if (event.data.id !== colorStudyRequestRef.current) return;
          if (event.data.type === 'progress') {
            if (event.data.detail !== colorStudyDetailRef.current) return;
            onColorStudyChange({
              processing: true,
              swatches: previousRender?.swatches ?? [],
              progress: event.data.progress,
              stage: event.data.stage,
            });
            return;
          }

          const resultCanvas = document.createElement('canvas');
          const resultContext = resultCanvas.getContext('2d');
          resultCanvas.width = event.data.width;
          resultCanvas.height = event.data.height;
          if (!resultContext) return;

          resultContext.putImageData(new ImageData(
            new Uint8ClampedArray(event.data.buffer),
            event.data.width,
            event.data.height,
          ), 0, 0);
          const result: ColorStudyRender = {
            canvas: resultCanvas,
            swatches: event.data.swatches,
            drawRect: crop.drawRect,
          };
          colorStudyCacheRef.current.set(event.data.detail, result);

          if (event.data.detail !== colorStudyDetailRef.current) return;
          colorStudyRenderRef.current = result;
          onColorStudyChange({
            processing: false,
            swatches: event.data.swatches,
            progress: 1,
            stage: null,
          });
          draw();
        };

        worker.onerror = () => {
          if (requestId !== colorStudyRequestRef.current) return;
          onColorStudyChange({
            processing: false,
            swatches: previousRender?.swatches ?? [],
            progress: 0,
            stage: null,
          });
          draw();
        };

        worker.postMessage({
          id: requestId,
          width: crop.width,
          height: crop.height,
          buffer: imageData.data.buffer,
          details: [selectedDetail],
        }, [imageData.data.buffer]);
      }, colorStudyViewportDebounceMs);

      return () => {
        window.clearTimeout(processTimeout);
        worker?.terminate();
      };
    }, [
      loadedImageRevision,
      image?.id,
      state.values.enabled,
      state.values.mode,
      state.values.colorDetail,
      state.canvas.widthCm,
      state.canvas.heightCm,
      state.viewport.zoom,
      state.viewport.panX,
      state.viewport.panY,
      state.filters.enabled,
      state.filters.blur,
      state.filters.exposure,
      state.filters.contrast,
      state.filters.highlights,
      state.filters.shadows,
      state.filters.saturation,
      interactionMode,
    ]);

    useEffect(() => {
      if (interactionMode !== 'pan') return;

      onColorStudyChange({
        processing: false,
        swatches: colorStudyRenderRef.current?.swatches ?? [],
        progress: 0,
        stage: null,
      });
      draw();
    }, [interactionMode]);

    useEffect(() => {
      draw();
    }, [highlightedColorStudyHex, state.canvas, state.filters, state.grid, state.values, state.viewport]);

    useEffect(() => {
      const { width, height } = logicalCanvasSizeRef.current;
      const nextRenderQuality = getWorkspaceRenderQuality(
        width,
        height,
        viewTransform.zoom,
        isSliderInteracting,
      );

      if (Math.abs(nextRenderQuality - renderQualityRef.current) > 0.001) {
        draw();
      }
    }, [viewTransform.zoom, isSliderInteracting]);

    useEffect(() => {
      const stage = stageRef.current;
      if (!stage) return undefined;

      const updateCanvasDisplaySize = () => {
        setCanvasDisplaySize(getCanvasDisplaySize(stage, getCanvasPixelSize(state.canvas.widthCm, state.canvas.heightCm)));
      };

      updateCanvasDisplaySize();

      const resizeObserver = new ResizeObserver(updateCanvasDisplaySize);
      resizeObserver.observe(stage);

      return () => resizeObserver.disconnect();
    }, [state.canvas.widthCm, state.canvas.heightCm]);

    useEffect(() => {
      if (interactionMode !== 'sample') {
        activeSamplePointerRef.current = null;
        lastSampleRef.current = null;
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
      const renderQuality = getWorkspaceRenderQuality(
        width,
        height,
        viewTransformRef.current.zoom,
        isSliderInteracting,
      );
      const backingWidth = Math.round(width * renderQuality);
      const backingHeight = Math.round(height * renderQuality);
      const renderScale = Math.max(width, height) / BASE_CANVAS_RENDER_LONG_SIDE;
      const displayRect = canvas.getBoundingClientRect();
      const labelScale = displayRect.width > 0 ? Math.max(renderScale, width / displayRect.width) : renderScale;
      logicalCanvasSizeRef.current = { width, height, pixelsPerCm };
      renderQualityRef.current = renderQuality;
      canvas.width = backingWidth;
      canvas.height = backingHeight;

      ctx.fillStyle = '#111214';
      ctx.fillRect(0, 0, backingWidth, backingHeight);

      const loadedImage = loadedImageRef.current;
      if (loadedImage) {
        const imageRect = getImageDrawRect(width, height, loadedImage, state.viewport);

        drawReferenceImage(
          ctx,
          loadedImage,
          imageRect,
          width,
          height,
          state,
          renderScale,
          renderQuality,
          interactionMode === 'pan' ? null : colorStudyRenderRef.current,
          highlightedColorStudyHex,
        );
      }

      ctx.save();
      ctx.scale(renderQuality, renderQuality);
      drawGridGuides(ctx, width, height, {
        enabled: state.grid.enabled && !state.filters.showOriginal,
        type: state.grid.type,
        spacing: state.grid.squareSizeCm * pixelsPerCm,
        canvasWidthCm: state.canvas.widthCm,
        canvasHeightCm: state.canvas.heightCm,
        unit: state.grid.unit,
        color: state.grid.color,
        opacity: state.grid.opacity,
        lineWidth: state.grid.lineWidth * renderScale,
        labelScale,
        showMeasurements: state.grid.showMeasurements,
      });
      ctx.restore();
    }

    function getCanvasScale(canvas: HTMLCanvasElement) {
      const rect = canvas.getBoundingClientRect();
      const logicalSize = logicalCanvasSizeRef.current;
      return {
        x: logicalSize.width / rect.width,
        y: logicalSize.height / rect.height,
      };
    }

    function applyViewTransform(nextTransform: ViewTransform) {
      viewTransformRef.current = nextTransform;
      setViewTransform(nextTransform);
    }

    function applyViewport(nextViewport: WorkspaceState['viewport']) {
      viewportRef.current = nextViewport;
      onViewportChange(nextViewport);
    }

    function getCanvasPointFromClient(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
      const scale = getCanvasScale(canvas);
      const rect = canvas.getBoundingClientRect();

      return {
        x: (clientX - rect.left) * scale.x,
        y: (clientY - rect.top) * scale.y,
      };
    }

    function getCanvasPoint(event: PointerEvent<HTMLCanvasElement>) {
      return getCanvasPointFromClient(event.currentTarget, event.clientX, event.clientY);
    }

    function getSampleAtPointer(event: PointerEvent<HTMLCanvasElement>) {
      const canvas = event.currentTarget;
      const loadedImage = loadedImageRef.current;
      const stageRect = stageRef.current?.getBoundingClientRect();
      if (!loadedImage || !stageRect) return null;

      const point = getCanvasPoint(event);
      const logicalSize = logicalCanvasSizeRef.current;
      const imageRect = getImageDrawRect(logicalSize.width, logicalSize.height, loadedImage, state.viewport);
      const isInsideImage =
        point.x >= imageRect.x &&
        point.x <= imageRect.x + imageRect.width &&
        point.y >= imageRect.y &&
        point.y <= imageRect.y + imageRect.height;

      if (!isInsideImage) return null;

      const imageX = ((point.x - imageRect.x) / imageRect.width) * loadedImage.naturalWidth;
      const imageY = ((point.y - imageRect.y) / imageRect.height) * loadedImage.naturalHeight;
      const rgb = sampleImageColor(
        loadedImage,
        imageX,
        imageY,
        point,
        state,
        colorStudyRenderRef.current,
      );
      const loupeSize = 116;
      const isTouchSample = isTouchSamplingPointer(event);
      const left = isTouchSample
        ? clamp(event.clientX - stageRect.left - loupeSize / 2, 12, Math.max(12, stageRect.width - loupeSize - 12))
        : clamp(event.clientX - stageRect.left + 18, 12, Math.max(12, stageRect.width - loupeSize - 12));
      const top = clamp(
        event.clientY - stageRect.top - loupeSize - (isTouchSample ? 34 : 18),
        12,
        Math.max(12, stageRect.height - loupeSize - 12),
      );
      const sample: ColorSample = {
        hex: rgbToHex(rgb),
        rgb,
        source: getPaletteSampleSource(state),
        sampleSize: paletteSampleSize,
        imagePoint: {
          x: Math.round(imageX),
          y: Math.round(imageY),
        },
      };

      return {
        sample,
        preview: {
          canvasX: point.x,
          canvasY: point.y,
          left,
          top,
          hex: sample.hex,
        },
      };
    }

    function pickColorStudyAtClient(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
      const colorStudyRender = colorStudyRenderRef.current;
      const colorStudyCanvas = colorStudyRender?.canvas;
      const colorStudyContext = colorStudyCanvas?.getContext('2d', { willReadFrequently: true });
      if (!colorStudyRender || !colorStudyCanvas || !colorStudyContext) return;

      const point = getCanvasPointFromClient(canvas, clientX, clientY);
      const normalizedX = (point.x - colorStudyRender.drawRect.x) / colorStudyRender.drawRect.width;
      const normalizedY = (point.y - colorStudyRender.drawRect.y) / colorStudyRender.drawRect.height;
      if (normalizedX < 0 || normalizedX > 1 || normalizedY < 0 || normalizedY > 1) return;

      const colorX = clamp(Math.floor(normalizedX * colorStudyCanvas.width), 0, colorStudyCanvas.width - 1);
      const colorY = clamp(Math.floor(normalizedY * colorStudyCanvas.height), 0, colorStudyCanvas.height - 1);
      const pixel = colorStudyContext.getImageData(colorX, colorY, 1, 1).data;

      onColorStudyPick(rgbToHex([pixel[0], pixel[1], pixel[2]]));
    }

    function handleDoubleClick(event: MouseEvent<HTMLCanvasElement>) {
      if (interactionMode !== 'color-isolate' || performance.now() < ignoreColorIsolateDoubleClickUntilRef.current) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      pickColorStudyAtClient(event.currentTarget, event.clientX, event.clientY);
    }

    function updateSamplePreview(event: PointerEvent<HTMLCanvasElement>, clearWhenOutside = true) {
      const result = getSampleAtPointer(event);

      if (!result) {
        if (clearWhenOutside) {
          lastSampleRef.current = null;
          setSamplePreview(null);
        }

        return null;
      }

      lastSampleRef.current = result.sample;
      setSamplePreview(result.preview);

      return result.sample;
    }

    function commitSample(sample: ColorSample) {
      onSampleColor(sample);
      lastSampleRef.current = null;
      activeSamplePointerRef.current = null;
      setSamplePreview(null);
    }

    function getActiveTouchPointers(): ActivePointerPosition[] {
      return Array.from(touchPointersRef.current, ([id, pointer]) => ({ id, ...pointer }));
    }

    function getPointerDistance(first: PointerPosition, second: PointerPosition) {
      return Math.hypot(second.x - first.x, second.y - first.y);
    }

    function getPointerCenter(first: PointerPosition, second?: PointerPosition) {
      if (!second) return first;

      return {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      };
    }

    function getStagePointFromClient(clientX: number, clientY: number) {
      const stageCenter = getStageContentCenter(stageRef.current);
      if (!stageCenter) return { x: 0, y: 0 };

      return {
        x: clientX - stageCenter.clientX,
        y: clientY - stageCenter.clientY,
      };
    }

    function startTouchGesture(canvas: HTMLCanvasElement) {
      const pointers = getActiveTouchPointers();
      const previousGesture = touchGestureRef.current;
      if (!pointers.length) {
        touchGestureRef.current = null;
        setIsPanning(false);
        setIsViewPanning(false);
        return;
      }

      if (pointers.length === 1 && previousGesture?.target === 'view' && previousGesture.pointerIds.length > 1) {
        touchGestureRef.current = null;
        setIsPanning(false);
        setIsViewPanning(false);
        return;
      }

      const [first, second] = pointers;
      const center = getPointerCenter(first, second);
      const target = interactionMode === 'pan' ? 'image' : 'view';
      const startViewTransform = viewTransformRef.current;

      touchGestureRef.current = {
        target,
        pointerIds: second ? [first.id, second.id] : [first.id],
        startDistance: second ? getPointerDistance(first, second) : 0,
        startClientCenter: center,
        startViewCenter: getStagePointFromClient(center.x, center.y),
        startCanvasCenter: getCanvasPointFromClient(canvas, center.x, center.y),
        startViewTransform,
        startViewport: viewportRef.current,
      };

      setIsPanning(target === 'image');
      setIsViewPanning(target === 'view');
    }

    function updateTouchGesture(canvas: HTMLCanvasElement) {
      const pointers = getActiveTouchPointers();
      if (!pointers.length) return;

      const [first, second] = pointers;
      const activePointerIds = second ? [first.id, second.id] : [first.id];
      const expectedTarget = interactionMode === 'pan' ? 'image' : 'view';
      const currentGesture = touchGestureRef.current;
      const shouldRestartGesture =
        !currentGesture ||
        currentGesture.target !== expectedTarget ||
        currentGesture.pointerIds.length !== activePointerIds.length ||
        currentGesture.pointerIds.some((id, index) => id !== activePointerIds[index]);

      if (shouldRestartGesture) {
        startTouchGesture(canvas);
        return;
      }

      const center = getPointerCenter(first, second);

      if (!second) {
        if (currentGesture.target === 'image') {
          const currentCanvasCenter = getCanvasPointFromClient(canvas, center.x, center.y);

          applyViewport({
            ...currentGesture.startViewport,
            panX: currentGesture.startViewport.panX + currentCanvasCenter.x - currentGesture.startCanvasCenter.x,
            panY: currentGesture.startViewport.panY + currentCanvasCenter.y - currentGesture.startCanvasCenter.y,
          });
          return;
        }

        applyViewTransform({
          ...currentGesture.startViewTransform,
          panX: currentGesture.startViewTransform.panX + center.x - currentGesture.startClientCenter.x,
          panY: currentGesture.startViewTransform.panY + center.y - currentGesture.startClientCenter.y,
        });
        return;
      }

      const currentDistance = getPointerDistance(first, second);
      if (currentDistance <= 0 || currentGesture.startDistance <= 0) return;

      const distanceRatio = currentDistance / currentGesture.startDistance;

      if (currentGesture.target === 'image') {
        const currentCanvasCenter = getCanvasPointFromClient(canvas, center.x, center.y);
        const nextZoom = clamp(currentGesture.startViewport.zoom * distanceRatio, minImageZoom, maxImageZoom);
        const zoomRatio = nextZoom / currentGesture.startViewport.zoom;
        const logicalSize = logicalCanvasSizeRef.current;
        const canvasCenterX = logicalSize.width / 2;
        const canvasCenterY = logicalSize.height / 2;

        applyViewport({
          zoom: nextZoom,
          panX:
            currentCanvasCenter.x -
            canvasCenterX -
            (currentGesture.startCanvasCenter.x - canvasCenterX - currentGesture.startViewport.panX) * zoomRatio,
          panY:
            currentCanvasCenter.y -
            canvasCenterY -
            (currentGesture.startCanvasCenter.y - canvasCenterY - currentGesture.startViewport.panY) * zoomRatio,
        });
        return;
      }

      const currentViewCenter = getStagePointFromClient(center.x, center.y);
      const nextZoom = clamp(currentGesture.startViewTransform.zoom * distanceRatio, minViewZoom, maxViewZoom);
      const zoomRatio = nextZoom / currentGesture.startViewTransform.zoom;

      applyViewTransform({
        zoom: nextZoom,
        panX:
          currentViewCenter.x -
          (currentGesture.startViewCenter.x - currentGesture.startViewTransform.panX) * zoomRatio,
        panY:
          currentViewCenter.y -
          (currentGesture.startViewCenter.y - currentGesture.startViewTransform.panY) * zoomRatio,
      });
    }

    function drawSampleLoupe(canvasX: number, canvasY: number) {
      const canvas = canvasRef.current;
      const loupe = sampleLoupeRef.current;
      if (!canvas || !loupe) return;

      const ctx = loupe.getContext('2d');
      if (!ctx) return;

      const renderQuality = renderQualityRef.current;
      const sourceSize = 34 * renderQuality;
      ctx.clearRect(0, 0, loupe.width, loupe.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        canvas,
        clamp(canvasX * renderQuality - sourceSize / 2, 0, canvas.width - sourceSize),
        clamp(canvasY * renderQuality - sourceSize / 2, 0, canvas.height - sourceSize),
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

      if (event.pointerType === 'touch' && interactionMode !== 'sample') {
        event.preventDefault();
        event.stopPropagation();
        if (!touchPointersRef.current.size) {
          didUseMultiTouchRef.current = false;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        touchPointersRef.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        if (touchPointersRef.current.size > 1) {
          didUseMultiTouchRef.current = true;
          lastColorIsolateTapRef.current = null;
        }
        startTouchGesture(event.currentTarget);
        return;
      }

      if (isSpacePressedRef.current && interactionMode !== 'pan') {
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

      if (interactionMode === 'color-isolate') {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (interactionMode === 'sample') {
        event.preventDefault();
        event.stopPropagation();

        const sample = updateSamplePreview(event, !isTouchSamplingPointer(event));
        if (isTouchSamplingPointer(event)) {
          activeSamplePointerRef.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }

        if (sample) commitSample(sample);
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
      if (touchPointersRef.current.has(event.pointerId)) {
        event.preventDefault();
        event.stopPropagation();
        touchPointersRef.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        updateTouchGesture(event.currentTarget);
        return;
      }

      if (isViewPanning && lastViewPointerRef.current) {
        const deltaX = event.clientX - lastViewPointerRef.current.x;
        const deltaY = event.clientY - lastViewPointerRef.current.y;

        lastViewPointerRef.current = {
          x: event.clientX,
          y: event.clientY,
        };

        applyViewTransform({
          ...viewTransformRef.current,
          panX: viewTransformRef.current.panX + deltaX,
          panY: viewTransformRef.current.panY + deltaY,
        });
        return;
      }

      if (interactionMode === 'sample') {
        event.preventDefault();

        const isActiveTouchSample = activeSamplePointerRef.current === event.pointerId;
        if (isTouchSamplingPointer(event) && !isActiveTouchSample) return;

        updateSamplePreview(event, !isActiveTouchSample);
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

      applyViewport({
        ...viewportRef.current,
        panX: viewportRef.current.panX + deltaX,
        panY: viewportRef.current.panY + deltaY,
      });
    }

    function endPan(event: PointerEvent<HTMLCanvasElement>) {
      if (touchPointersRef.current.has(event.pointerId)) {
        event.preventDefault();
        event.stopPropagation();

        const touchGesture = touchGestureRef.current;
        const shouldPickColorStudy =
          interactionMode === 'color-isolate'
          && !didUseMultiTouchRef.current
          && touchGesture?.pointerIds.length === 1
          && touchGesture.pointerIds[0] === event.pointerId
          && Math.hypot(
            event.clientX - touchGesture.startClientCenter.x,
            event.clientY - touchGesture.startClientCenter.y,
          ) <= colorIsolateTapMovementThreshold;

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }

        touchPointersRef.current.delete(event.pointerId);
        if (shouldPickColorStudy) {
          const now = performance.now();
          const previousTap = lastColorIsolateTapRef.current;
          const isDoubleTap =
            previousTap !== null
            && now - previousTap.time <= colorIsolateDoubleTapInterval
            && Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y)
              <= colorIsolateDoubleTapDistanceThreshold;

          if (isDoubleTap) {
            pickColorStudyAtClient(event.currentTarget, event.clientX, event.clientY);
            lastColorIsolateTapRef.current = null;
            ignoreColorIsolateDoubleClickUntilRef.current = now + colorIsolateDoubleTapInterval;
          } else {
            lastColorIsolateTapRef.current = {
              time: now,
              x: event.clientX,
              y: event.clientY,
            };
          }
        } else {
          lastColorIsolateTapRef.current = null;
        }
        if (!touchPointersRef.current.size) {
          didUseMultiTouchRef.current = false;
        }
        startTouchGesture(event.currentTarget);
        return;
      }

      if (interactionMode === 'sample' && activeSamplePointerRef.current === event.pointerId) {
        event.preventDefault();
        const sample = updateSamplePreview(event, false) ?? lastSampleRef.current;

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }

        if (sample) {
          commitSample(sample);
        } else {
          activeSamplePointerRef.current = null;
          setSamplePreview(null);
        }

        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      lastPointerRef.current = null;
      setIsPanning(false);
      lastViewPointerRef.current = null;
      setIsViewPanning(false);
    }

    function cancelPointer(event: PointerEvent<HTMLCanvasElement>) {
      if (touchPointersRef.current.has(event.pointerId)) {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }

        touchPointersRef.current.delete(event.pointerId);
        if (!touchPointersRef.current.size) {
          didUseMultiTouchRef.current = false;
        }
        lastColorIsolateTapRef.current = null;
        startTouchGesture(event.currentTarget);
        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (activeSamplePointerRef.current === event.pointerId) {
        activeSamplePointerRef.current = null;
        lastSampleRef.current = null;
        setSamplePreview(null);
      }

      lastPointerRef.current = null;
      setIsPanning(false);
      lastViewPointerRef.current = null;
      setIsViewPanning(false);
    }

    function handlePointerLeave(event: PointerEvent<HTMLCanvasElement>) {
      if (activeSamplePointerRef.current === event.pointerId) return;

      lastSampleRef.current = null;
      setSamplePreview(null);
    }

    function handleWheel(event: WheelEvent<HTMLCanvasElement>) {
      if (!image) return;

      if (event.metaKey || event.ctrlKey) {
        event.preventDefault();
        if (interactionMode === 'pan') {
          zoomImageAtPoint(event);
        } else {
          zoomViewAtPoint(event);
        }
        return;
      }

      if (interactionMode !== 'pan') return;

      event.preventDefault();
      zoomImageAtPoint(event);
    }

    function zoomImageAtPoint(event: WheelEvent<HTMLCanvasElement>) {
      const canvas = event.currentTarget;
      const pointer = getCanvasPointFromClient(canvas, event.clientX, event.clientY);
      const currentZoom = viewportRef.current.zoom;
      const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
      const nextZoom = clamp(currentZoom * zoomFactor, minImageZoom, maxImageZoom);
      const zoomRatio = nextZoom / currentZoom;
      const logicalSize = logicalCanvasSizeRef.current;
      const centerX = logicalSize.width / 2;
      const centerY = logicalSize.height / 2;

      applyViewport({
        zoom: nextZoom,
        panX: pointer.x - centerX - (pointer.x - centerX - viewportRef.current.panX) * zoomRatio,
        panY: pointer.y - centerY - (pointer.y - centerY - viewportRef.current.panY) * zoomRatio,
      });
    }

    function zoomViewAtPoint(event: WheelEvent<HTMLCanvasElement>) {
      const stageCenter = getStageContentCenter(stageRef.current);
      const centerX = stageCenter?.clientX ?? event.clientX;
      const centerY = stageCenter?.clientY ?? event.clientY;
      const pointerX = event.clientX - centerX;
      const pointerY = event.clientY - centerY;

      const current = viewTransformRef.current;
      const nextZoom = clamp(current.zoom * Math.exp(-event.deltaY * 0.002), minViewZoom, maxViewZoom);
      const ratio = nextZoom / current.zoom;

      if (nextZoom === minViewZoom && current.zoom !== minViewZoom) {
        applyViewTransform(defaultViewTransform);
        return;
      }

      applyViewTransform({
        zoom: nextZoom,
        panX: pointerX - (pointerX - current.panX) * ratio,
        panY: pointerY - (pointerY - current.panY) * ratio,
      });
    }

    function resetViewTransform() {
      applyViewTransform(defaultViewTransform);
    }

    return (
      <div
        className="canvas-stage"
        ref={stageRef}
        data-sampling={interactionMode === 'sample'}
        data-color-isolate={interactionMode === 'color-isolate'}
      >
        <div
          className="canvas-view-pan"
          style={{
            left: canvasDisplaySize
              ? `${canvasDisplaySize.centerX + viewTransform.panX}px`
              : `calc(50% + ${viewTransform.panX}px)`,
            top: canvasDisplaySize
              ? `${canvasDisplaySize.centerY + viewTransform.panY}px`
              : `calc(50% + ${viewTransform.panY}px)`,
          }}
        >
          <div className="canvas-view-scale">
            <canvas
              ref={canvasRef}
              aria-label="Reference workspace canvas"
              data-locked={interactionMode === 'locked'}
              data-panning={isPanning}
              data-sampling={interactionMode === 'sample'}
              data-color-isolate={interactionMode === 'color-isolate'}
              data-view-pan-ready={isSpacePressed}
              data-view-panning={isViewPanning}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endPan}
              onPointerCancel={cancelPointer}
              onPointerLeave={handlePointerLeave}
              onDoubleClick={handleDoubleClick}
              onWheel={handleWheel}
              style={
                canvasDisplaySize
                  ? {
                      width: `${canvasDisplaySize.width * viewTransform.zoom}px`,
                      height: `${canvasDisplaySize.height * viewTransform.zoom}px`,
                      maxWidth: 'none',
                      maxHeight: 'none',
                    }
                  : undefined
              }
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

function getColorStudyCrop(
  canvasWidth: number,
  canvasHeight: number,
  image: HTMLImageElement,
  viewport: WorkspaceState['viewport'],
  maximumLongSide: number,
): ColorStudyCrop | null {
  const imageRect = getImageDrawRect(canvasWidth, canvasHeight, image, viewport);
  const left = Math.max(0, imageRect.x);
  const top = Math.max(0, imageRect.y);
  const right = Math.min(canvasWidth, imageRect.x + imageRect.width);
  const bottom = Math.min(canvasHeight, imageRect.y + imageRect.height);
  const drawWidth = right - left;
  const drawHeight = bottom - top;
  if (drawWidth <= 1 || drawHeight <= 1) return null;

  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  const sourceX = clamp(((left - imageRect.x) / imageRect.width) * naturalWidth, 0, naturalWidth);
  const sourceY = clamp(((top - imageRect.y) / imageRect.height) * naturalHeight, 0, naturalHeight);
  const sourceRight = clamp(((right - imageRect.x) / imageRect.width) * naturalWidth, 0, naturalWidth);
  const sourceBottom = clamp(((bottom - imageRect.y) / imageRect.height) * naturalHeight, 0, naturalHeight);
  const sourceWidth = sourceRight - sourceX;
  const sourceHeight = sourceBottom - sourceY;
  if (sourceWidth <= 1 || sourceHeight <= 1) return null;

  const scale = Math.min(1, maximumLongSide / Math.max(sourceWidth, sourceHeight));

  return {
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
    drawRect: {
      x: left,
      y: top,
      width: drawWidth,
      height: drawHeight,
    },
  };
}

function getCanvasDisplaySize(
  stage: HTMLDivElement,
  logicalSize: { width: number; height: number },
): CanvasDisplaySize {
  const styles = window.getComputedStyle(stage);
  const horizontalPadding = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
  const verticalPadding = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
  const availableWidth = Math.max(1, stage.clientWidth - horizontalPadding);
  const availableHeight = Math.max(1, stage.clientHeight - verticalPadding);
  const fitWidth = Math.min(availableWidth, 980);
  const fitHeight = availableHeight;
  const fitScale = Math.min(fitWidth / logicalSize.width, fitHeight / logicalSize.height, 1);

  return {
    width: Math.max(1, logicalSize.width * fitScale),
    height: Math.max(1, logicalSize.height * fitScale),
    centerX: Number.parseFloat(styles.paddingLeft) + availableWidth / 2,
    centerY: Number.parseFloat(styles.paddingTop) + availableHeight / 2,
  };
}

function getStageContentCenter(stage: HTMLDivElement | null) {
  if (!stage) return null;

  const rect = stage.getBoundingClientRect();
  const styles = window.getComputedStyle(stage);
  const paddingLeft = Number.parseFloat(styles.paddingLeft);
  const paddingRight = Number.parseFloat(styles.paddingRight);
  const paddingTop = Number.parseFloat(styles.paddingTop);
  const paddingBottom = Number.parseFloat(styles.paddingBottom);
  const availableWidth = Math.max(1, stage.clientWidth - paddingLeft - paddingRight);
  const availableHeight = Math.max(1, stage.clientHeight - paddingTop - paddingBottom);

  return {
    clientX: rect.left + paddingLeft + availableWidth / 2,
    clientY: rect.top + paddingTop + availableHeight / 2,
  };
}

function getWorkspaceRenderQuality(
  width: number,
  height: number,
  viewZoom: number,
  isSliderInteracting = false,
) {
  if (isSliderInteracting && isIOSWebKit()) {
    return iosSliderRenderQuality;
  }

  const limits = getWorkspaceBackingLimits();
  const longSide = Math.max(width, height);
  const pixelCount = width * height;
  const maxScaleForArea = Math.sqrt(limits.maxPixels / pixelCount);
  const maxScaleForLongSide = limits.maxLongSide / longSide;
  const maxScale = Math.max(1, Math.min(maxScaleForArea, maxScaleForLongSide));
  const steppedScale = Math.ceil(Math.max(1, viewZoom) / workspaceRenderQualityStep) * workspaceRenderQualityStep;

  return Math.min(maxScale, steppedScale);
}

function getWorkspaceBackingLimits() {
  if (isIOSWebKit()) {
    return {
      maxPixels: maxIOSWorkspaceBackingPixels,
      maxLongSide: maxIOSWorkspaceRenderLongSide,
    };
  }

  return {
    maxPixels: maxWorkspaceBackingPixels,
    maxLongSide: maxWorkspaceRenderLongSide,
  };
}

function isIOSWebKit() {
  if (typeof navigator === 'undefined') return false;

  const platform = navigator.platform || '';
  const userAgent = navigator.userAgent || '';

  return /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function drawReferenceImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  imageRect: ImageDrawRect,
  canvasWidth: number,
  canvasHeight: number,
  state: WorkspaceState,
  renderScale: number,
  renderQuality: number,
  colorStudyRender: ColorStudyRender | null,
  highlightedColorStudyHex: string | null,
) {
  const scaledImageRect = scaleImageDrawRect(imageRect, renderQuality);
  const backingCanvasWidth = Math.round(canvasWidth * renderQuality);
  const backingCanvasHeight = Math.round(canvasHeight * renderQuality);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, scaledImageRect.x, scaledImageRect.y, scaledImageRect.width, scaledImageRect.height);
  ctx.restore();

  if (state.filters.showOriginal) return;

  const shouldApplyBaseFilters = hasBaseFilterAdjustments(state.filters);
  const shouldApplyTonalFilters = hasTonalFilterAdjustments(state.filters);
  const shouldApplyValueMap = shouldApplyValues(state.values) && state.values.mode !== 'color';
  const shouldApplyColorStudy = Boolean(
    colorStudyRender
    && shouldApplyValues(state.values)
    && state.values.mode === 'color',
  );
  if (!shouldApplyBaseFilters && !shouldApplyTonalFilters && !shouldApplyValueMap && !shouldApplyColorStudy) return;

  const visibleRect = getVisibleImageDataRect(scaledImageRect, backingCanvasWidth, backingCanvasHeight);
  if (!visibleRect) return;

  if (shouldApplyBaseFilters || shouldApplyTonalFilters || shouldApplyValueMap) {
    const imageData = ctx.getImageData(visibleRect.x, visibleRect.y, visibleRect.width, visibleRect.height);
    if (shouldApplyBaseFilters) {
      applyBaseFilterAdjustments(imageData, state.filters, renderScale * renderQuality);
    }
    if (shouldApplyTonalFilters) {
      applyTonalFilterAdjustments(imageData, state.filters);
    }
    if (shouldApplyValueMap) {
      applyValuesToImageData(imageData, state.values);
    }
    ctx.putImageData(imageData, visibleRect.x, visibleRect.y);
  }

  if (shouldApplyColorStudy && colorStudyRender) {
    const colorStudyImage = colorStudyRender.canvas;
    const displayedColorStudy = highlightedColorStudyHex
      ? getColorStudyIsolationImage(colorStudyImage, highlightedColorStudyHex) ?? colorStudyImage
      : colorStudyImage;
    const scaledColorStudyRect = scaleImageDrawRect(colorStudyRender.drawRect, renderQuality);
    ctx.save();
    ctx.globalAlpha = clamp(state.values.opacity, 0, 1);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      displayedColorStudy,
      scaledColorStudyRect.x,
      scaledColorStudyRect.y,
      scaledColorStudyRect.width,
      scaledColorStudyRect.height,
    );
    ctx.restore();
  }
}

function getColorStudyIsolationImage(source: HTMLCanvasElement, hex: string) {
  const normalizedHex = hex.toUpperCase();
  const cachedForSource = colorStudyHighlightCache.get(source) ?? new Map<string, HTMLCanvasElement>();
  const cached = cachedForSource.get(normalizedHex);
  if (cached) return cached;

  const match = /^#([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/.exec(normalizedHex);
  const sourceContext = source.getContext('2d', { willReadFrequently: true });
  if (!match || !sourceContext) return null;

  const red = Number.parseInt(match[1], 16);
  const green = Number.parseInt(match[2], 16);
  const blue = Number.parseInt(match[3], 16);
  const sourceData = sourceContext.getImageData(0, 0, source.width, source.height);
  const isolationData = new Uint8ClampedArray(sourceData.data.length);

  for (let index = 0; index < sourceData.data.length; index += 4) {
    const isSelected = (
      sourceData.data[index] !== red
      || sourceData.data[index + 1] !== green
      || sourceData.data[index + 2] !== blue
    ) === false;

    if (isSelected) {
      isolationData[index] = red;
      isolationData[index + 1] = green;
      isolationData[index + 2] = blue;
    } else {
      const luminance = (
        sourceData.data[index] * 0.2126
        + sourceData.data[index + 1] * 0.7152
        + sourceData.data[index + 2] * 0.0722
      );
      const neutral = Math.round(94 + luminance * 0.28);
      isolationData[index] = neutral;
      isolationData[index + 1] = neutral;
      isolationData[index + 2] = neutral;
    }
    isolationData[index + 3] = sourceData.data[index + 3];
  }

  const highlightImage = document.createElement('canvas');
  highlightImage.width = source.width;
  highlightImage.height = source.height;
  const highlightContext = highlightImage.getContext('2d');
  if (!highlightContext) return null;
  highlightContext.putImageData(new ImageData(isolationData, source.width, source.height), 0, 0);
  cachedForSource.set(normalizedHex, highlightImage);
  colorStudyHighlightCache.set(source, cachedForSource);
  return highlightImage;
}

function scaleImageDrawRect(imageRect: ImageDrawRect, scale: number): ImageDrawRect {
  return {
    x: imageRect.x * scale,
    y: imageRect.y * scale,
    width: imageRect.width * scale,
    height: imageRect.height * scale,
  };
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

function hasBaseFilterAdjustments(filters: WorkspaceState['filters']) {
  return (
    filters.enabled &&
    (filters.blur > 0 || filters.exposure !== 0 || filters.contrast !== 0 || filters.saturation !== 100)
  );
}

function applyBaseFilterAdjustments(imageData: ImageData, filters: WorkspaceState['filters'], renderScale = 1) {
  if (!hasBaseFilterAdjustments(filters)) return;

  const blurRadius = Math.round(Math.max(0, filters.blur) * renderScale);
  if (blurRadius > 0) {
    applyBoxBlur(imageData, blurRadius);
  }

  const brightness = Math.max(0, 100 + filters.exposure) / 100;
  const contrast = Math.max(0, 100 + filters.contrast) / 100;
  const saturation = Math.max(0, filters.saturation) / 100;
  const shouldAdjustColor = brightness !== 1 || contrast !== 1 || saturation !== 1;
  if (!shouldAdjustColor) return;

  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;

    let red = ((data[index] * brightness - 128) * contrast) + 128;
    let green = ((data[index + 1] * brightness - 128) * contrast) + 128;
    let blue = ((data[index + 2] * brightness - 128) * contrast) + 128;

    const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    red = luma + (red - luma) * saturation;
    green = luma + (green - luma) * saturation;
    blue = luma + (blue - luma) * saturation;

    data[index] = clampByte(red);
    data[index + 1] = clampByte(green);
    data[index + 2] = clampByte(blue);
  }
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
  canvasPoint: PointerPosition,
  state: WorkspaceState,
  colorStudyRender: ColorStudyRender | null,
): RgbColor {
  const sampleSize = paletteSampleSize;
  const halfSample = Math.floor(sampleSize / 2);
  const sampleCanvas = document.createElement('canvas');
  const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });

  sampleCanvas.width = sampleSize;
  sampleCanvas.height = sampleSize;

  if (!sampleContext) return [0, 0, 0];

  const useFilteredSource = getPaletteSampleSource(state) === 'filtered';
  const useColorStudy = Boolean(useFilteredSource && state.values.mode === 'color' && colorStudyRender);

  if (useColorStudy && colorStudyRender) {
    const colorStudyImage = colorStudyRender.canvas;
    const mappedX = (
      (canvasPoint.x - colorStudyRender.drawRect.x) / colorStudyRender.drawRect.width
    ) * colorStudyImage.width;
    const mappedY = (
      (canvasPoint.y - colorStudyRender.drawRect.y) / colorStudyRender.drawRect.height
    ) * colorStudyImage.height;
    const sourceX = clamp(Math.round(mappedX) - halfSample, 0, colorStudyImage.width - sampleSize);
    const sourceY = clamp(Math.round(mappedY) - halfSample, 0, colorStudyImage.height - sampleSize);
    sampleContext.drawImage(
      colorStudyImage,
      sourceX,
      sourceY,
      sampleSize,
      sampleSize,
      0,
      0,
      sampleSize,
      sampleSize,
    );
  } else {
    const sourceX = clamp(Math.round(imageX) - halfSample, 0, image.naturalWidth - sampleSize);
    const sourceY = clamp(Math.round(imageY) - halfSample, 0, image.naturalHeight - sampleSize);
    sampleContext.drawImage(image, sourceX, sourceY, sampleSize, sampleSize, 0, 0, sampleSize, sampleSize);
  }

  const sampleImageData = sampleContext.getImageData(0, 0, sampleSize, sampleSize);
  if (useFilteredSource && !useColorStudy) {
    applyBaseFilterAdjustments(sampleImageData, state.filters);
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

function getPaletteSampleSource(state: WorkspaceState) {
  if (state.filters.showOriginal) return 'original';

  return hasBaseFilterAdjustments(state.filters) || hasTonalFilterAdjustments(state.filters) || shouldApplyValues(state.values)
    ? 'filtered'
    : 'original';
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isTouchSamplingPointer(event: PointerEvent<HTMLCanvasElement>) {
  return event.pointerType === 'touch' || event.pointerType === 'pen';
}

function applyBoxBlur(imageData: ImageData, radius: number) {
  const safeRadius = Math.max(0, Math.round(radius));
  if (safeRadius === 0 || imageData.width <= 1 || imageData.height <= 1) return;

  const input = new Uint8ClampedArray(imageData.data);
  const horizontal = new Uint8ClampedArray(imageData.data.length);

  blurHorizontal(input, horizontal, imageData.width, imageData.height, safeRadius);
  blurVertical(horizontal, imageData.data, imageData.width, imageData.height, safeRadius);
}

function blurHorizontal(
  input: Uint8ClampedArray,
  output: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
) {
  const windowSize = radius * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width * 4;
    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 0;

    for (let offset = -radius; offset <= radius; offset += 1) {
      const x = clamp(offset, 0, width - 1);
      const index = rowOffset + x * 4;
      red += input[index];
      green += input[index + 1];
      blue += input[index + 2];
      alpha += input[index + 3];
    }

    for (let x = 0; x < width; x += 1) {
      const outputIndex = rowOffset + x * 4;
      output[outputIndex] = Math.round(red / windowSize);
      output[outputIndex + 1] = Math.round(green / windowSize);
      output[outputIndex + 2] = Math.round(blue / windowSize);
      output[outputIndex + 3] = Math.round(alpha / windowSize);

      const removeX = clamp(x - radius, 0, width - 1);
      const addX = clamp(x + radius + 1, 0, width - 1);
      const removeIndex = rowOffset + removeX * 4;
      const addIndex = rowOffset + addX * 4;

      red += input[addIndex] - input[removeIndex];
      green += input[addIndex + 1] - input[removeIndex + 1];
      blue += input[addIndex + 2] - input[removeIndex + 2];
      alpha += input[addIndex + 3] - input[removeIndex + 3];
    }
  }
}

function blurVertical(
  input: Uint8ClampedArray,
  output: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
) {
  const windowSize = radius * 2 + 1;

  for (let x = 0; x < width; x += 1) {
    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 0;

    for (let offset = -radius; offset <= radius; offset += 1) {
      const y = clamp(offset, 0, height - 1);
      const index = (y * width + x) * 4;
      red += input[index];
      green += input[index + 1];
      blue += input[index + 2];
      alpha += input[index + 3];
    }

    for (let y = 0; y < height; y += 1) {
      const outputIndex = (y * width + x) * 4;
      output[outputIndex] = Math.round(red / windowSize);
      output[outputIndex + 1] = Math.round(green / windowSize);
      output[outputIndex + 2] = Math.round(blue / windowSize);
      output[outputIndex + 3] = Math.round(alpha / windowSize);

      const removeY = clamp(y - radius, 0, height - 1);
      const addY = clamp(y + radius + 1, 0, height - 1);
      const removeIndex = (removeY * width + x) * 4;
      const addIndex = (addY * width + x) * 4;

      red += input[addIndex] - input[removeIndex];
      green += input[addIndex + 1] - input[removeIndex + 1];
      blue += input[addIndex + 2] - input[removeIndex + 2];
      alpha += input[addIndex + 3] - input[removeIndex + 3];
    }
  }
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return target.isContentEditable || ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
