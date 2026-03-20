/**
 * useBracketPicks — manages user bracket picks with persistence.
 * Handles save/load, pick origin tracking (manual vs maximus),
 * downstream cascade clearing, bracket mode metadata, multi-bracket
 * support with naming, and simulation engine integration.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { cascadeClearDownstream, buildFullBracket } from '../data/bracketData';
import {
  simulateEntireBracket,
  simulateRestOfBracket,
  regenerateMaximusPicks,
  getSimulationStats,
} from '../utils/bracketSimulator';

const AUTOSAVE_DELAY = 1200;

export function useBracketPicks(bracket) {
  const { user, session } = useAuth();
  const [picks, setPicks] = useState({});
  const [pickOrigins, setPickOrigins] = useState({});
  const [saveStatus, setSaveStatus] = useState('idle');
  const [lastSaved, setLastSaved] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [activeBracketId, setActiveBracketId] = useState(null);
  const [bracketName, setBracketName] = useState('My Bracket');
  const [savedBrackets, setSavedBrackets] = useState([]);
  const [bracketsLoaded, setBracketsLoaded] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    if (!user || !session) return;
    loadPicks();
    loadBracketList();
  }, [user?.id, session?.access_token]);

  async function loadPicks(targetBracketId) {
    try {
      const token = session?.access_token;
      if (!token) return;
      const params = targetBracketId ? `?bracketId=${targetBracketId}` : '';
      const res = await fetch(`/api/bracketology/picks${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setLoaded(true); return; }
      const data = await res.json();
      if (data.bracket?.picks) {
        setPicks(data.bracket.picks);
        setPickOrigins(data.bracket.pick_origins || {});
        setActiveBracketId(data.bracket.id || null);
        setBracketName(data.bracket.bracket_name || 'My Bracket');
        if (data.bracket.updated_at) setLastSaved(new Date(data.bracket.updated_at));
      }
    } catch {
      // silently fail — user starts with empty bracket
    } finally {
      setLoaded(true);
    }
  }

  async function loadBracketList() {
    try {
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch('/api/bracketology/brackets', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setSavedBrackets(data.brackets || []);
    } catch {
      // silent
    } finally {
      setBracketsLoaded(true);
    }
  }

  const savePicks = useCallback(async (newPicks, newOrigins, name) => {
    if (!session?.access_token) return;
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/bracketology/picks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          picks: newPicks,
          pickOrigins: newOrigins,
          bracketMode: bracket?.bracketMode || 'projected',
          bracketId: activeBracketId || undefined,
          bracketName: name || bracketName,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data._tablesMissing) {
          setSaveStatus('local');
        } else {
          setSaveStatus('saved');
          setLastSaved(new Date());
          if (data.bracket?.id && !activeBracketId) {
            setActiveBracketId(data.bracket.id);
          }
          setTimeout(() => setSaveStatus('idle'), 2500);
          loadBracketList();
        }
      } else {
        setSaveStatus('local');
      }
    } catch {
      setSaveStatus('local');
    }
  }, [session?.access_token, bracket?.bracketMode, activeBracketId, bracketName]);

  const scheduleSave = useCallback((newPicks, newOrigins) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      savePicks(newPicks, newOrigins);
    }, AUTOSAVE_DELAY);
  }, [savePicks]);

  const makePick = useCallback((matchupId, pickId, origin = 'manual') => {
    setPicks(prev => {
      const allMatchups = bracket?.regions
        ? buildFullBracket(bracket.regions, prev)
        : {};

      let cleared = cascadeClearDownstream(matchupId, allMatchups, prev);
      cleared[matchupId] = pickId;

      setPickOrigins(prevOrigins => {
        const newOrigins = { ...prevOrigins };
        for (const key of Object.keys(prevOrigins)) {
          if (!(key in cleared)) delete newOrigins[key];
        }
        newOrigins[matchupId] = origin;
        scheduleSave(cleared, newOrigins);
        return newOrigins;
      });

      return cleared;
    });
  }, [bracket, scheduleSave]);

  const clearBracket = useCallback(() => {
    setPicks({});
    setPickOrigins({});
    scheduleSave({}, {});
  }, [scheduleSave]);

  const clearRound = useCallback((round) => {
    setPicks(prev => {
      const allMatchups = bracket?.regions
        ? buildFullBracket(bracket.regions, prev)
        : {};

      const newPicks = { ...prev };
      const newOrigins = { ...pickOrigins };

      for (const [id, matchup] of Object.entries(allMatchups)) {
        if (matchup.round >= round) {
          delete newPicks[id];
          delete newOrigins[id];
        }
      }

      setPickOrigins(newOrigins);
      scheduleSave(newPicks, newOrigins);
      return newPicks;
    });
  }, [bracket, pickOrigins, scheduleSave]);

  const applyMaximusPicks = useCallback((maximusPicks) => {
    setPicks(prev => {
      const merged = { ...prev };
      const mergedOrigins = { ...pickOrigins };
      for (const [matchupId, pickId] of Object.entries(maximusPicks)) {
        merged[matchupId] = pickId;
        mergedOrigins[matchupId] = 'maximus';
      }
      setPickOrigins(mergedOrigins);
      scheduleSave(merged, mergedOrigins);
      return merged;
    });
  }, [pickOrigins, scheduleSave]);

  const resetToMaximus = useCallback((maximusPicks) => {
    const newOrigins = {};
    for (const matchupId of Object.keys(maximusPicks)) {
      newOrigins[matchupId] = 'maximus';
    }
    setPicks(maximusPicks);
    setPickOrigins(newOrigins);
    scheduleSave(maximusPicks, newOrigins);
  }, [scheduleSave]);

  const simulateEntire = useCallback((modelContext) => {
    if (!bracket?.regions || !modelContext) return null;
    const result = simulateEntireBracket(bracket, modelContext, { withRandomness: true });
    setPicks(result.picks);
    setPickOrigins(result.origins);
    scheduleSave(result.picks, result.origins);
    return result;
  }, [bracket, scheduleSave]);

  const simulateRest = useCallback((modelContext) => {
    if (!bracket?.regions || !modelContext) return null;
    const result = simulateRestOfBracket(bracket, modelContext, picks, pickOrigins);
    setPicks(result.picks);
    setPickOrigins(result.origins);
    scheduleSave(result.picks, result.origins);
    return result;
  }, [bracket, picks, pickOrigins, scheduleSave]);

  const regeneratePicks = useCallback((modelContext, currentPredictions) => {
    if (!bracket?.regions || !modelContext) return null;
    const result = regenerateMaximusPicks(
      bracket, modelContext, picks, pickOrigins, currentPredictions,
    );
    setPicks(result.picks);
    setPickOrigins(result.origins);
    scheduleSave(result.picks, result.origins);
    return result;
  }, [bracket, picks, pickOrigins, scheduleSave]);

  const renameBracket = useCallback(async (name) => {
    setBracketName(name);
    if (!session?.access_token || !activeBracketId) return;
    try {
      await fetch('/api/bracketology/brackets', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ bracketId: activeBracketId, bracketName: name }),
      });
      loadBracketList();
    } catch { /* silent */ }
  }, [session?.access_token, activeBracketId]);

  const saveAsNewBracket = useCallback(async (name) => {
    if (!session?.access_token) return null;
    try {
      const res = await fetch('/api/bracketology/brackets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          bracketName: name,
          picks,
          pickOrigins,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.bracket?.id) {
        setActiveBracketId(data.bracket.id);
        setBracketName(name);
        loadBracketList();
        return data.bracket;
      }
    } catch { /* silent */ }
    return null;
  }, [session?.access_token, picks, pickOrigins]);

  const loadSavedBracket = useCallback(async (bracketId) => {
    setLoaded(false);
    await loadPicks(bracketId);
  }, [session?.access_token]);

  const deleteBracket = useCallback(async (bracketId) => {
    if (!session?.access_token) return;
    try {
      await fetch(`/api/bracketology/brackets?bracketId=${bracketId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (bracketId === activeBracketId) {
        setActiveBracketId(null);
        setBracketName('My Bracket');
        setPicks({});
        setPickOrigins({});
      }
      loadBracketList();
    } catch { /* silent */ }
  }, [session?.access_token, activeBracketId]);

  const totalPicks = Object.keys(picks).length;
  const totalGames = 63;
  const progress = Math.round((totalPicks / totalGames) * 100);
  const manualCount = Object.values(pickOrigins).filter(o => o === 'manual').length;
  const maximusCount = Object.values(pickOrigins).filter(o => o === 'maximus').length;

  return {
    picks, pickOrigins, saveStatus, lastSaved, loaded,
    makePick, clearBracket, clearRound, applyMaximusPicks, resetToMaximus,
    simulateEntire, simulateRest, regeneratePicks,
    totalPicks, totalGames, progress, manualCount, maximusCount,
    activeBracketId, bracketName, savedBrackets, bracketsLoaded,
    renameBracket, saveAsNewBracket, loadSavedBracket, deleteBracket,
    loadBracketList,
  };
}
