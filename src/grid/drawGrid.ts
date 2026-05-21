export type GridGuideType = 'square' | 'cross' | 'diagonal-cross' | 'thirds';

export type GridSettings = {
  enabled: boolean;
  type: GridGuideType;
  spacing: number;
  color: string;
  opacity: number;
  lineWidth: number;
};

export function drawGridGuides(ctx: CanvasRenderingContext2D, width: number, height: number, grid: GridSettings) {
  if (!grid.enabled) return;

  ctx.save();
  ctx.strokeStyle = grid.color;
  ctx.globalAlpha = grid.opacity;
  ctx.lineWidth = grid.lineWidth;

  if (grid.type === 'cross') {
    strokeLine(ctx, width / 2, 0, width / 2, height);
    strokeLine(ctx, 0, height / 2, width, height / 2);
    ctx.restore();
    return;
  }

  if (grid.type === 'diagonal-cross') {
    strokeLine(ctx, 0, 0, width, height);
    strokeLine(ctx, width, 0, 0, height);
    ctx.restore();
    return;
  }

  if (grid.type === 'thirds') {
    strokeLine(ctx, width / 3, 0, width / 3, height);
    strokeLine(ctx, (width / 3) * 2, 0, (width / 3) * 2, height);
    strokeLine(ctx, 0, height / 3, width, height / 3);
    strokeLine(ctx, 0, (height / 3) * 2, width, (height / 3) * 2);
    ctx.restore();
    return;
  }

  if (grid.spacing <= 0) {
    ctx.restore();
    return;
  }

  for (let x = 0; x <= width; x += grid.spacing) {
    strokeLine(ctx, x, 0, x, height);
  }

  for (let y = 0; y <= height; y += grid.spacing) {
    strokeLine(ctx, 0, y, width, y);
  }

  ctx.restore();
}

function strokeLine(ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) {
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
}
