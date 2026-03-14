/**
 * useBracketPicks — manages user bracket picks with persistence.
 * Handles save/load, pick origin tracking (manual vs maximus),
 * and downstream cascade clearing.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { getSupabase } from '../lib/supabaseClient';
import { cascadeClearDownstream, buildFullBracket } from '../data/bracketData';

const AUTOSAVE_DELAY = 1500;

export function useBracketPicks(bracket) {
  const { user, session } = useAuth();
  const [picks, setPicks] = useState({});
  const [pickOrigins, setPickOrigins] = useState({});
  const [saveStatus, setSaveStatus] = useState('idle');
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    if (!user || !session) return;
    loadPicks();
  }, [user?.id, session?.access_token]);

  async function loadPicks() {
    try {
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch('/api/bracketology/picks', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setLoaded(true); return; }
      const data = await res.json();
      if (data.bracket?.picks) {
        setPicks(data.bracket.picks);
        setPickOrigins(data.bracket.pick_origins || {});
      }
    } catch {
      // silently fail — user starts with empty bracket
    } finally {
      setLoaded(true);
    }
  }

  const savePicks = useCallback(async (newPicks, newOrigins) => {
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
        }),
      });
      if (res.ok) {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    }
  }, [session?.access_token]);

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

  const applyMaximusPicks = useCallback((maximusPicks, maximusPredictions) => {
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

  const totalPicks = Object.keys(picks).length;
  const totalGames = 63;
  const progress = Math.round((totalPicks / totalGames) * 100);

  return {
    picks, pickOrigins, saveStatus, loaded,
    makePick, clearBracket, clearRound, applyMaximusPicks,
    totalPicks, totalGames, progress,
  };
}
