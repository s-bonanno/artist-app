export type GridGuideType = 'square' | 'cross' | 'diagonal-cross' | 'thirds';
type MeasurementUnit = 'cm' | 'in';

export type GridSettings = {
  enabled: boolean;
  type: GridGuideType;
  spacing: number;
  canvasWidthCm: number;
  canvasHeightCm: number;
  unit: MeasurementUnit;
  color: string;
  opacity: number;
  lineWidth: number;
  labelScale: number;
  showMeasurements: boolean;
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
    drawCrossMeasurements(ctx, width, height, grid);
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
    drawThirdsMeasurements(ctx, width, height, grid);
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

  drawSquareMeasurements(ctx, width, height, grid);

  ctx.restore();
}

function strokeLine(ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) {
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
}

function drawSquareMeasurements(ctx: CanvasRenderingContext2D, width: number, height: number, grid: GridSettings) {
  if (!grid.showMeasurements || grid.spacing <= 0) return;

  const inset = getLabelInset(grid);
  const labelStep = getSquareMeasurementStep(grid);

  for (let x = labelStep; x < width - 1; x += labelStep) {
    drawLabel(ctx, formatDistance((x / width) * grid.canvasWidthCm, grid.unit), x, inset, grid, 'center');
  }

  for (let y = labelStep; y < height - 1; y += labelStep) {
    drawLabel(ctx, formatDistance((y / height) * grid.canvasHeightCm, grid.unit), inset, y, grid, 'left');
  }
}

function drawCrossMeasurements(ctx: CanvasRenderingContext2D, width: number, height: number, grid: GridSettings) {
  if (!grid.showMeasurements) return;

  const inset = getLabelInset(grid);

  drawLabel(ctx, formatDistance(grid.canvasWidthCm / 2, grid.unit), width / 2, inset, grid, 'center');
  drawLabel(ctx, formatDistance(grid.canvasHeightCm / 2, grid.unit), inset, height / 2, grid, 'left');
}

function drawThirdsMeasurements(ctx: CanvasRenderingContext2D, width: number, height: number, grid: GridSettings) {
  if (!grid.showMeasurements) return;

  const inset = getLabelInset(grid);
  const firstX = width / 3;
  const secondX = firstX * 2;
  const firstY = height / 3;
  const secondY = firstY * 2;

  drawLabel(ctx, `1/3 ${formatDistance(grid.canvasWidthCm / 3, grid.unit)}`, firstX, inset, grid, 'center');
  drawLabel(ctx, `2/3 ${formatDistance((grid.canvasWidthCm / 3) * 2, grid.unit)}`, secondX, inset, grid, 'center');
  drawLabel(ctx, `1/3 ${formatDistance(grid.canvasHeightCm / 3, grid.unit)}`, inset, firstY, grid, 'left');
  drawLabel(ctx, `2/3 ${formatDistance((grid.canvasHeightCm / 3) * 2, grid.unit)}`, inset, secondY, grid, 'left');
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  grid: GridSettings,
  align: CanvasTextAlign,
) {
  const fontSize = getLabelFontSize(grid);
  const horizontalPadding = Math.max(5 * grid.labelScale, 5);
  const verticalPadding = Math.max(3 * grid.labelScale, 3);

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.font = `${fontSize}px "DM Sans", Inter, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';

  const metrics = ctx.measureText(text);
  const labelWidth = metrics.width + horizontalPadding * 2;
  const labelHeight = fontSize + verticalPadding * 2;
  const left = align === 'center' ? x - labelWidth / 2 : x;
  const top = y - labelHeight / 2;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
  ctx.fillRect(left, top, labelWidth, labelHeight);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.fillText(text, align === 'center' ? x : x + horizontalPadding, y);
  ctx.restore();
}

function getLabelFontSize(grid: GridSettings) {
  const currentSize = Math.max(12, Math.round(10 * grid.labelScale));
  const roomySize = Math.max(12, Math.round(11 * grid.labelScale));

  if (grid.type === 'square' && grid.spacing > 0 && grid.spacing < roomySize * 5) {
    return currentSize;
  }

  return roomySize;
}

function getSquareMeasurementStep(grid: GridSettings) {
  const fontSize = getLabelFontSize(grid);
  const minimumLabelSpacing = fontSize * 6;
  const gridLineMultiple = Math.max(1, Math.ceil(minimumLabelSpacing / grid.spacing));

  return grid.spacing * gridLineMultiple;
}

function getLabelInset(grid: GridSettings) {
  return Math.max(12 * grid.labelScale, 12);
}

function formatDistance(valueCm: number, unit: MeasurementUnit) {
  const value = unit === 'in' ? valueCm / 2.54 : valueCm;
  const decimals = unit === 'in' ? 2 : 1;
  const formatted = value.toFixed(decimals).replace(/\.?0+$/, '');

  return `${formatted} ${unit}`;
}
