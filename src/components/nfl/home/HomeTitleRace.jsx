/**
 * HomeTitleRace — Super Bowl prices, one conference at a time.
 *
 * Share is each team's slice of the whole title market, so the numbers
 * add to 100 across the league instead of the raw implied odds, which
 * add to well over 100.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../../workspaces/WorkspaceContext';
import { fetchNflChampionshipOdds } from '../../../api/nfl';
import { NFL_TEAMS } from '../../../sports/nfl/teams';
import NflLogo from '../NflLogo';
import { SectionHead } from './HomeParts';
import { fmtOdds } from './format';
import h from './home.module.css';

const implied = (american) => (american > 0 ? 100 / (american + 100) : -american / (-american + 100));

export default function HomeTitleRace({ limit = 5 }) {
  const { buildPath } = useWorkspace();
  const [odds, setOdds] = useState(null);
  const [conference, setConference] = useState('AFC');

  useEffect(() => {
    let cancelled = false;
    fetchNflChampionshipOdds().then((d) => { if (!cancelled) setOdds(d.odds || {}); });
    return () => { cancelled = true; };
  }, []);

  if (!odds || Object.keys(odds).length === 0) return null;

  const field = NFL_TEAMS
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
    <section className={h.section} aria-label="Super Bowl odds">
      <SectionHead title="Super Bowl odds" to={buildPath('/season-model')} moreLabel="Playoff odds and ratings">
        <div className={h.segs} role="group" aria-label="Conference">
          {['AFC', 'NFC'].map((c) => (
            <button
              key={c}
              type="button"
              className={`${h.seg} ${conference === c ? h.segOn : ''}`}
              aria-pressed={conference === c}
              onClick={() => setConference(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </SectionHead>
      <div className={`${h.card} ${h.cardFlush}`}>
        {rows.map((t) => (
          <Link key={t.slug} to={buildPath(`/teams/${t.slug}`)} className={h.raceRow}>
            <NflLogo slug={t.slug} size={26} />
            <span className={h.raceName}>{t.nickname || t.name}</span>
            <span className={h.raceShare}>{(t.share * 100).toFixed(1)}%</span>
            <span className={h.racePrice}>{fmtOdds(t.price)}</span>
            <span className={h.raceBar} style={{ width: `${Math.round((t.share / top) * 100)}%` }} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}
