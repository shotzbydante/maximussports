import { useEffect, useState } from 'react';
import { fetchNflTeamTalent, fetchNflGameTalent } from '../api/nfl';

/** One team's talent, and the unit matchups for its game this week when it has one. */
export default function useNflTeamTalent(slug, game) {
  const [data, setData] = useState(null);
  const [week, setWeek] = useState(null);
  const away = game?.teams?.away?.slug;
  const home = game?.teams?.home?.slug;
  const upcoming = Boolean(away && home && !game?.gameState?.isFinal);

  useEffect(() => {
    let cancelled = false;
    fetchNflTeamTalent(slug).then((d) => { if (!cancelled) setData(d); });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!upcoming) return undefined;
    let cancelled = false;
    fetchNflGameTalent({ away, home }).then((d) => { if (!cancelled) setWeek(d); });
    return () => { cancelled = true; };
  }, [upcoming, away, home]);

  return {
    loading: data === null,
    data,
    me: data?.available ? data.teams[0] : null,
    week: upcoming && week?.available && week.matchup ? week : null,
  };
}

