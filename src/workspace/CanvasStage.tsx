import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { drawSquareGrid } from '../grid/drawGrid';
import type { ReferenceImage } from '../library/referenceTypes';
import type { WorkspaceState } from '../app/appState';

type CanvasStageProps = {
  image: ReferenceImage | null;
  state: WorkspaceState;
};

export const CanvasStage = forwardRef<HTMLCanvasElement, CanvasStageProps>(
  function CanvasStage({ image, state }, forwardedRef) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const loadedImageRef = useRef<HTMLImageElement | null>(null);

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

      const width = state.canvas.orientation === 'portrait' ? 900 : 1200;
      const height = state.canvas.orientation === 'portrait' ? 1200 : 900;
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

      drawSquareGrid(ctx, width, height, state.grid);
    }

    return (
      <div className="canvas-stage">
        <canvas ref={canvasRef} aria-label="Reference workspace canvas" />
      </div>
    );
  },
);
