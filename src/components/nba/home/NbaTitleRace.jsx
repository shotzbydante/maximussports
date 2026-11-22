/**
 * NbaTitleRace — championship prices, one conference at a time.
 *
 * Share is each team's slice of the whole title market, so the numbers add
 * to 100 across the league instead of the raw implied odds, which add to
 * well over 100.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../../workspaces/WorkspaceContext';
import { fetchNbaChampionshipOdds } from '../../../api/nbaChampionshipOdds';
import { NBA_TEAMS } from '../../../sports/nba/teams';
import { NbaLogo } from './NbaTeamTag';
import { SectionHead, Chevron } from '../../nfl/home/HomeParts';
import { fmtOdds, nbaNickname } from './nbaFormat';
import { trackFilterChange } from '../../../analytics/sportEvents';
import h from '../../nfl/home/home.module.css';

const implied = (american) => (american > 0 ? 100 / (american + 100) : -american / (-american + 100));
const CONFERENCES = [{ key: 'Eastern', label: 'East' }, { key: 'Western', label: 'West' }];

export default function NbaTitleRace({ limit = 5 }) {
  const { buildPath } = useWorkspace();
  const [odds, setOdds] = useState(null);
  const [conference, setConference] = useState('Western');

  useEffect(() => {
    let cancelled = false;
    fetchNbaChampionshipOdds().then((d) => { if (!cancelled) setOdds(d.odds || {}); });
    return () => { cancelled = true; };
  }, []);

  if (!odds || Object.keys(odds).length === 0) return null;

  const field = NBA_TEAMS
    .map((t) => ({ ...t, price: odds[t.slug]?.bestChanceAmerican }))
    .filter((t) => typeof t.price === 'number');
  const total = field.reduce((a, t) => a + implied(t.price), 0);
  if (total <= 0) return null;
  const withShare = field.map((t) => ({ ...t, share: implied(t.price) / total }));
  const top = Math.max(...withShare.map((t) => t.share));
  const rows = withShare
    .filter((t) => t.conference === conference)
    .sort((a, b) => b.share - a.share)
    .slice(0, limit);

  return (
    <section className={h.section} aria-label="Title odds">
      <SectionHead title="Title odds">
        <div className={h.segs} role="group" aria-label="Conference">
          {CONFERENCES.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`${h.seg} ${conference === c.key ? h.segOn : ''}`}
              aria-pressed={conference === c.key}
              onClick={() => {
                setConference(c.key);
                trackFilterChange({ sport: 'nba', page: 'home', filter: 'title_race_conference', value: c.label });
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </SectionHead>
      <div className={`${h.card} ${h.cardFlush}`}>
        {rows.map((t) => (
          <Link key={t.slug} to={buildPath(`/teams/${t.slug}`)} className={h.raceRow}>
            <NbaLogo slug={t.slug} size={26} />
            <span className={h.raceName}>{nbaNickname(t.slug)}</span>
            <span className={h.raceTrack} aria-hidden="true">
              <span className={h.raceFill} style={{ width: `${Math.round((t.share / top) * 100)}%` }} />
            </span>
            <span className={h.raceShare}>{(t.share * 100).toFixed(1)}%</span>
            <span className={h.racePrice}>{fmtOdds(t.price)}</span>
          </Link>
        ))}
        <Link to={buildPath('/teams')} className={h.cardFoot}>
          <span>Standings and every team’s price</span>
          <Chevron size={12} />
        </Link>
      </div>
    </section>
  );
}
