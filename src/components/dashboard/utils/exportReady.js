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
 * Waits for every <img> inside `containerEl` to settle, then hides or replaces
 * any that failed so the capture tree is clean for html-to-image.
 *
 * @param {HTMLElement} containerEl
 * @param {number} [timeoutMs=6000]
 * @returns {{ ok: number, failed: number, fixed: number, details: string[] }}
 */
export async function sanitizeImagesForExport(containerEl, timeoutMs = 6000) {
  const report = { ok: 0, failed: 0, fixed: 0, details: [] };
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

  // --- Phase 2: audit & fix broken images ------------------------------------
  for (const img of imgs) {
    if (imgIsHealthy(img)) {
      report.ok++;
      continue;
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
