/**
 * Pre-export image readiness & sanitisation for html-to-image captures.
 *
 * waitForImages()          — legacy API (still exported for back-compat)
 * sanitizeImagesForExport() — waits for every <img> to settle, then hides or
 *                             replaces any that failed so html-to-image never
 *                             encounters a broken <img> in the capture tree.
 *
 * Returns a report: { ok, failed, fixed, details[] }
 */

/**
 * Converts a cross-origin image to a data URL using a canvas approach.
 * This avoids CORS tainting issues in html-to-image by inlining the pixel data.
 */
async function inlineImageAsDataUrl(img) {
  // Strategy 1: fetch with CORS (works for well-configured CDNs)
  try {
    const resp = await fetch(img.src, { mode: 'cors' });
    if (resp.ok) {
      const blob = await resp.blob();
      return await blobToDataUrl(blob);
    }
  } catch { /* fall through to canvas strategy */ }

  // Strategy 2: canvas drawImage (works if image loaded with crossOrigin attr)
  try {
    if (img.complete && img.naturalWidth > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return canvas.toDataURL('image/png');
    }
  } catch { /* canvas tainted — fall through */ }

  return null;
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/**
 * Wait for all <img> elements to settle (load or error), with a timeout.
 * Does NOT modify the DOM — use sanitizeImagesForExport for that.
 */
export async function waitForImages(containerEl, timeoutMs = 5000) {
  if (!containerEl) return;

  const imgs = Array.from(containerEl.querySelectorAll('img'));
  const unloaded = imgs.filter(img => !img.complete || img.naturalWidth === 0);

  if (unloaded.length === 0) return;

  await Promise.race([
    Promise.all(
      unloaded.map(
        img =>
          new Promise(resolve => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          }),
      ),
    ),
    new Promise(resolve => setTimeout(resolve, timeoutMs)),
  ]);
}

/**
 * Determines whether an <img> element has loaded successfully.
 */
function imgIsHealthy(img) {
  return img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
}

/**
 * Checks whether an img src is cross-origin (external CDN, etc.)
 */
function isCrossOrigin(img) {
  try {
    const imgUrl = new URL(img.src, window.location.origin);
    return imgUrl.origin !== window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Waits for every <img> inside `containerEl` to settle, then:
 *   1. Inlines cross-origin images as data URLs to prevent canvas tainting
 *   2. Hides or replaces any that failed to load
 *
 * This robustly prevents html-to-image from encountering broken or
 * CORS-tainted images in the capture tree.
 *
 * @param {HTMLElement} containerEl
 * @param {number} [timeoutMs=8000]
 * @returns {{ ok: number, failed: number, fixed: number, inlined: number, details: string[] }}
 */
export async function sanitizeImagesForExport(containerEl, timeoutMs = 8000) {
  const report = { ok: 0, failed: 0, fixed: 0, inlined: 0, details: [] };
  if (!containerEl) return report;

  const imgs = Array.from(containerEl.querySelectorAll('img'));
  if (imgs.length === 0) return report;

  // --- Phase 1: wait for every image to settle --------------------------------
  const pending = imgs.filter(img => !img.complete);
  if (pending.length > 0) {
    await Promise.race([
      Promise.all(
        pending.map(
          img =>
            new Promise(resolve => {
              img.addEventListener('load', resolve, { once: true });
              img.addEventListener('error', resolve, { once: true });
            }),
        ),
      ),
      new Promise(resolve => setTimeout(resolve, timeoutMs)),
    ]);
  }

  // small extra buffer for any race conditions between load event and naturalWidth being set
  await new Promise(r => setTimeout(r, 100));

  // --- Phase 2: inline cross-origin images + fix broken images ----------------
  for (const img of imgs) {
    if (imgIsHealthy(img)) {
      // Even healthy cross-origin images can taint canvas — inline them
      if (isCrossOrigin(img) && img.src && !img.src.startsWith('data:')) {
        const dataUrl = await inlineImageAsDataUrl(img);
        if (dataUrl) {
          img.src = dataUrl;
          img.removeAttribute('crossorigin');
          img.removeAttribute('crossOrigin');
          report.inlined++;
        }
      }
      report.ok++;
      continue;
    }

    // Image failed to load — try to reload once with fetch + data URL
    if (img.src && !img.src.startsWith('data:')) {
      const dataUrl = await inlineImageAsDataUrl(img);
      if (dataUrl) {
        img.src = dataUrl;
        img.removeAttribute('crossorigin');
        img.removeAttribute('crossOrigin');
        // Wait briefly for the image to render from the data URL
        await new Promise(resolve => {
          img.addEventListener('load', resolve, { once: true });
          setTimeout(resolve, 500);
        });
        if (imgIsHealthy(img)) {
          report.ok++;
          report.inlined++;
          continue;
        }
      }
    }

    report.failed++;
    const src = img.src || img.getAttribute('src') || '(empty)';
    report.details.push(src);

    // Check for a data-fallback-text attribute for styled text replacement
    const fallbackText = img.getAttribute('data-fallback-text');
    if (fallbackText) {
      const span = document.createElement('span');
      span.textContent = fallbackText;
      span.setAttribute('aria-hidden', 'true');

      const computed = window.getComputedStyle(img);
      span.style.display = 'inline-flex';
      span.style.alignItems = 'center';
      span.style.justifyContent = 'center';
      span.style.width = computed.width || img.width + 'px';
      span.style.height = computed.height || img.height + 'px';
      span.style.fontSize = '10px';
      span.style.fontWeight = '700';
      span.style.letterSpacing = '0.06em';
      span.style.color = 'rgba(255,255,255,0.5)';
      span.style.background = 'rgba(255,255,255,0.06)';
      span.style.borderRadius = '6px';
      span.style.textTransform = 'uppercase';

      img.replaceWith(span);
      report.fixed++;
      continue;
    }

    // Default: hide the broken image so it doesn't poison the capture
    img.style.display = 'none';
    img.style.visibility = 'hidden';
    img.removeAttribute('src');
    report.fixed++;
  }

  return report;
}
