/**
 * Cover image / thumbnail generator.
 *
 * Renders the branded intro card as a PNG for social posting workflows.
 * Uses the same drawUtils as the video renderer for visual consistency.
 */

import { getTemplate } from '../templates/featureSpotlight';
import { loadLogo, drawIntroCard } from './drawUtils';

export async function generateCoverImage({ headline, templateId = 'feature-spotlight' }) {
  const tpl = getTemplate(templateId);
  const { width, height, brand } = tpl;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const logo = await loadLogo(brand.logo);
  drawIntroCard(ctx, logo, { headline, brand }, 1);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
