/**
 * Ensures all <img> elements within a container are fully loaded
 * before proceeding with export. Waits up to timeoutMs before resolving.
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
