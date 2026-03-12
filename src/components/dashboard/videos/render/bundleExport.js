/**
 * Export bundle — ZIP all variant assets for download.
 *
 * Bundles rendered MP4s, cover PNGs, caption text,
 * and posting metadata into a single ZIP file.
 */

import JSZip from 'jszip';
import { downloadBlob } from './coverExport';

export async function exportBundle(variants, opts = {}) {
  const {
    projectName = 'maximus_reel',
    caption = '',
    featureType = '',
    hookStyle = '',
    messageAngle = '',
    templateId = '',
  } = opts;

  const zip = new JSZip();
  const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'maximus_reel';

  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const suffix = v.tone || v.id || `variant_${i + 1}`;

    if (v.blob) {
      zip.file(`${safeName}_${suffix}.mp4`, v.blob);
    }
    if (v.coverBlob) {
      zip.file(`${safeName}_${suffix}_cover.png`, v.coverBlob);
    }
  }

  if (caption) {
    zip.file(`${safeName}_caption.txt`, caption);
  }

  const recommended = variants.find(v => v.recommended);
  const manifest = {
    projectName,
    generatedAt: new Date().toISOString(),
    featureType,
    hookStyle,
    messageAngle,
    templateId,
    variants: variants.map(v => ({
      id: v.id,
      tone: v.tone,
      headline: v.headline,
      recommended: v.recommended || false,
      score: v.score || null,
    })),
    recommendedVariant: recommended?.id || null,
    caption,
  };
  zip.file(`${safeName}_manifest.json`, JSON.stringify(manifest, null, 2));

  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `${safeName}_bundle.zip`);

  return blob;
}
