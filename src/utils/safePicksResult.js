/**
 * Normalizes the output of buildMaximusPicks so downstream consumers
 * never encounter undefined arrays.  Also guards against partial or
 * malformed results from degraded network payloads.
 *
 * @param {object} raw — return value of buildMaximusPicks (or any object)
 * @returns {{ pickEmPicks: Array, atsPicks: Array, valuePicks: Array, totalsPicks: Array, mlPicks: Array }}
 */
export function normalizePicksResult(raw) {
  if (!raw || typeof raw !== 'object') {
    return EMPTY_PICKS;
  }
  return {
    pickEmPicks: Array.isArray(raw.pickEmPicks) ? raw.pickEmPicks : [],
    atsPicks:    Array.isArray(raw.atsPicks)    ? raw.atsPicks    : [],
    valuePicks:  Array.isArray(raw.valuePicks)  ? raw.valuePicks  : [],
    totalsPicks: Array.isArray(raw.totalsPicks) ? raw.totalsPicks : [],
    mlPicks:     Array.isArray(raw.mlPicks)     ? raw.mlPicks     : [],
  };
}

export const EMPTY_PICKS = Object.freeze({
  pickEmPicks: [],
  atsPicks:    [],
  valuePicks:  [],
  totalsPicks: [],
  mlPicks:     [],
});

/**
 * Safe wrapper around buildMaximusPicks.
 * Catches internal errors, normalizes the output, and returns EMPTY_PICKS
 * on failure rather than letting an exception propagate.
 *
 * @param {Function} buildFn — reference to buildMaximusPicks
 * @param {object} args      — arguments object for buildMaximusPicks
 * @returns {{ pickEmPicks: Array, atsPicks: Array, valuePicks: Array, totalsPicks: Array, mlPicks: Array }}
 */
export function safeBuildPicks(buildFn, args) {
  try {
    const raw = buildFn(args);
    return normalizePicksResult(raw);
  } catch (_e) {
    if (import.meta.env?.DEV) {
      console.error('[safeBuildPicks] buildMaximusPicks threw:', _e);
    }
    return EMPTY_PICKS;
  }
}
