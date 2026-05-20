export type GridSettings = {
  enabled: boolean;
  spacing: number;
  color: string;
  opacity: number;
  lineWidth: number;
};

export function drawSquareGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  grid: GridSettings,
) {
  if (!grid.enabled || grid.spacing <= 0) return;

  ctx.save();
  ctx.strokeStyle = grid.color;
  ctx.globalAlpha = grid.opacity;
  ctx.lineWidth = grid.lineWidth;

  for (let x = 0; x <= width; x += grid.spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 0; y <= height; y += grid.spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.restore();
}

