/**
 * useBracketData — fetches and manages tournament bracket data.
 * Supports projected mode (pre-Selection Sunday) and official mode.
 * Returns bracket structure, mode, loading state, and refresh.
 *
 * Safety: NEVER returns a null/empty bracket after loading completes.
 * If all fetches fail, the projected bracket is always available.
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchBracketData } from '../data/bracketData';
import { generateProjectedBracket } from '../data/projectedField';

export function useBracketData() {
  const [bracket, setBracket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBracketData();
      setBracket(data && data.regions?.length > 0 ? data : generateProjectedBracket());
    } catch (err) {
      setError(err.message);
      setBracket(generateProjectedBracket());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Safety net: if loading finished but bracket is somehow null/invalid,
  // force the projected bracket so the UI is never blank.
  useEffect(() => {
    if (!loading && (!bracket || !bracket.regions || bracket.regions.length === 0)) {
      setBracket(generateProjectedBracket());
    }
  }, [loading, bracket]);

  const bracketMode = bracket?.bracketMode || 'projected';
  const isProjected = bracketMode === 'projected';
  const isOfficial = bracketMode === 'official';
  const isFieldSet = bracket?.status === 'projected' || bracket?.status === 'field_set' || bracket?.status === 'in_progress' || bracket?.status === 'complete';

  return {
    bracket, loading, error, refresh: load,
    bracketMode, isProjected, isOfficial, isFieldSet,
  };
}
