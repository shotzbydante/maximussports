/**
 * useBracketData — fetches and manages tournament bracket data.
 * Supports projected mode (pre-Selection Sunday) and official mode.
 * Returns bracket structure, mode, loading state, and refresh.
 *
 * Safety: NEVER returns a null/empty bracket after loading completes.
 * If all fetches fail, the projected bracket is always available.
 *
 * When official bracket data is detected, this hook automatically pushes
 * it to tournamentHelpers.setOfficialBracketData() so ALL downstream
 * surfaces (Content Studio, Upset Radar, seed breakdowns, emails)
 * use the canonical official data instead of the projected field.
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchBracketData } from '../data/bracketData';
import { generateProjectedBracket } from '../data/projectedField';
import { setOfficialBracketData, resetToProjectedField } from '../utils/tournamentHelpers';

export function useBracketData() {
  const [bracket, setBracket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBracketData();
      if (data && data.regions?.length > 0) {
        setBracket(data);

        if (data.bracketMode === 'official') {
          setOfficialBracketData(data);
        } else {
          resetToProjectedField();
        }
      } else {
        const projected = generateProjectedBracket();
        setBracket(projected);
        resetToProjectedField();
      }
    } catch (err) {
      setError(err.message);
      const projected = generateProjectedBracket();
      setBracket(projected);
      resetToProjectedField();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Safety net: if loading finished but bracket is somehow null/invalid,
  // force the projected bracket so the UI is never blank.
  useEffect(() => {
    if (!loading && (!bracket || !bracket.regions || bracket.regions.length === 0)) {
      const projected = generateProjectedBracket();
      setBracket(projected);
      resetToProjectedField();
    }
  }, [loading, bracket]);

  const bracketMode = bracket?.bracketMode || 'projected';
  const isProjected = bracketMode === 'projected';
  const isOfficial = bracketMode === 'official' || bracketMode === 'official_partial';
  const isPartialESPN = bracketMode === 'official_partial';
  const isFieldSet = bracket?.status === 'projected' || bracket?.status === 'field_set' || bracket?.status === 'in_progress' || bracket?.status === 'complete';

  return {
    bracket, loading, error, refresh: load,
    bracketMode, isProjected, isOfficial, isPartialESPN, isFieldSet,
  };
}
