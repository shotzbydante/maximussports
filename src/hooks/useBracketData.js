/**
 * useBracketData — fetches and manages tournament bracket data.
 * Supports projected mode (pre-Selection Sunday) and official mode.
 * Returns bracket structure, mode, loading state, and refresh.
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
      setBracket(data);
    } catch (err) {
      setError(err.message);
      setBracket(generateProjectedBracket());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const bracketMode = bracket?.bracketMode || 'projected';
  const isProjected = bracketMode === 'projected';
  const isOfficial = bracketMode === 'official';
  const isFieldSet = bracket?.status === 'projected' || bracket?.status === 'field_set' || bracket?.status === 'in_progress' || bracket?.status === 'complete';

  return {
    bracket, loading, error, refresh: load,
    bracketMode, isProjected, isOfficial, isFieldSet,
  };
}
