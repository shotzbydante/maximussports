/**
 * useBracketData — fetches and manages tournament bracket data.
 * Returns bracket structure, loading state, and refresh capability.
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchBracketData, generateBlankBracket } from '../data/bracketData';

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
      setBracket(generateBlankBracket());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const isPreSelection = bracket?.status === 'pre_selection';
  const isFieldSet = bracket?.status === 'field_set' || bracket?.status === 'in_progress' || bracket?.status === 'complete';

  return { bracket, loading, error, refresh: load, isPreSelection, isFieldSet };
}
