/**
 * Dev-only slow-operation logger.
 * Logs a warning when an async operation exceeds `thresholdMs`.
 * Compiles to a no-op in production (import.meta.env.PROD guard).
 *
 * Usage:
 *   const result = await perfLog('fetchHomeFast', () => fetchHomeFast(...), 500);
 */

const IS_DEV = !import.meta.env?.PROD;

/**
 * @template T
 * @param {string} label - Human-readable label shown in the log.
 * @param {() => Promise<T>} fn - Async operation to time.
 * @param {number} [thresholdMs=500] - Warn if operation takes longer than this.
 * @returns {Promise<T>}
 */
export async function perfLog(label, fn, thresholdMs = 500) {
  if (!IS_DEV) return fn();
  const t0 = performance.now();
  try {
    const result = await fn();
    const elapsed = Math.round(performance.now() - t0);
    if (elapsed > thresholdMs) {
      console.warn(`[perf] ⚠ ${label} took ${elapsed}ms (threshold: ${thresholdMs}ms)`);
    } else {
      console.debug(`[perf] ${label} ${elapsed}ms`);
    }
    return result;
  } catch (err) {
    const elapsed = Math.round(performance.now() - t0);
    console.warn(`[perf] ${label} FAILED after ${elapsed}ms`, err?.message ?? err);
    throw err;
  }
}

/**
 * Synchronous timer: returns an object with a `.end(label)` method.
 * Useful for timing non-promise operations or multi-step blocks.
 *
 * Usage:
 *   const t = perfTimer('buildSlugMap');
 *   // ... work ...
 *   t.end(); // logs if slow
 */
export function perfTimer(label, thresholdMs = 500) {
  if (!IS_DEV) return { end: () => {} };
  const t0 = performance.now();
  return {
    end() {
      const elapsed = Math.round(performance.now() - t0);
      if (elapsed > thresholdMs) {
        console.warn(`[perf] ⚠ ${label} took ${elapsed}ms (threshold: ${thresholdMs}ms)`);
      }
    },
  };
}
