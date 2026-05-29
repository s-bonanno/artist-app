import type { ReferenceImage } from '../library/referenceTypes';
import type { PaletteSwatch } from '../palette/paletteTypes';

type ExportPaletteOptions = {
  swatches: PaletteSwatch[];
  image: ReferenceImage | null;
};

const sheetWidth = 1600;
const margin = 96;
const gap = 28;
const titleFont = '500 48px "DM Sans", system-ui, sans-serif';
const subtitleFont = '400 26px "DM Sans", system-ui, sans-serif';
const labelFont = '500 24px "DM Sans", system-ui, sans-serif';
const smallFont = '400 20px "DM Sans", system-ui, sans-serif';

export function exportPalette({ swatches, image }: ExportPaletteOptions) {
  if (swatches.length === 0) return;

  const columns = swatches.length <= 6 ? swatches.length : 6;
  const swatchWidth = Math.floor((sheetWidth - margin * 2 - gap * (columns - 1)) / columns);
  const swatchHeight = 180;
  const labelHeight = 76;
  const rows = Math.ceil(swatches.length / columns);
  const sheetHeight = margin * 2 + 118 + rows * (swatchHeight + labelHeight + gap) - gap;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) return;

  canvas.width = sheetWidth;
  canvas.height = sheetHeight;

  context.fillStyle = '#111113';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = '#f5f5f7';
  context.font = titleFont;
  context.textBaseline = 'top';
  context.fillText('Palette study', margin, margin);

  context.fillStyle = '#a1a1a6';
  context.font = subtitleFont;
  context.fillText(image?.title ?? 'Art Assistant reference', margin, margin + 62);

  swatches.forEach((swatch, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = margin + column * (swatchWidth + gap);
    const y = margin + 118 + row * (swatchHeight + labelHeight + gap);

    context.fillStyle = swatch.hex;
    roundedRect(context, x, y, swatchWidth, swatchHeight, 8);
    context.fill();

    context.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    context.lineWidth = 2;
    context.stroke();

    context.fillStyle = '#f5f5f7';
    context.font = labelFont;
    context.fillText(swatch.hex.toUpperCase(), x, y + swatchHeight + 18);

    context.fillStyle = '#a1a1a6';
    context.font = smallFont;
    context.fillText(`RGB ${swatch.rgb.join(' ')}`, x, y + swatchHeight + 48);
  });

  context.fillStyle = '#6f7178';
  context.font = smallFont;
  context.textAlign = 'right';
  context.fillText('Art Assistant', sheetWidth - margin, sheetHeight - margin + 28);

  canvas.toBlob((blob) => {
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = getPaletteFilename(image);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 'image/png');
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function getPaletteFilename(image: ReferenceImage | null) {
  const title = image?.title ?? 'reference';
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);

  return `art-assistant-palette-${slug || 'reference'}.png`;
}
