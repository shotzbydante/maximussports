/**
 * Re-frames a 1080 x 1350 slide PNG as a 1080 x 1920 Story.
 *
 * The slide sits in the middle and the 285px bands above and below are filled
 * with the slide's own background colours. Those bands are where Instagram
 * puts its own header and reply bar, so nothing of ours is covered.
 */
const STORY_W = 1080;
const STORY_H = 1920;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the slide image'));
    img.src = src;
  });
}

export async function toStoryDataUrl(slideDataUrl) {
  const img = await loadImage(slideDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext('2d');

  const h = Math.round((img.naturalHeight / img.naturalWidth) * STORY_W);
  const y = Math.round((STORY_H - h) / 2);
  ctx.drawImage(img, 0, y, STORY_W, h);

  // Extend the slide's top and bottom edge rows into the bands.
  if (y > 0) {
    ctx.drawImage(img, 0, 0, img.naturalWidth, 2, 0, 0, STORY_W, y + 1);
    ctx.drawImage(img, 0, img.naturalHeight - 2, img.naturalWidth, 2, 0, y + h - 1, STORY_W, STORY_H - (y + h) + 1);
  }
  return canvas.toDataURL('image/png');
}
