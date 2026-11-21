/**
 * NflSuperBowlWatch — Super Bowl prices by conference.
 * Parallel to MLB PennantWatch and NBA Finals Watch.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import { NFL_TEAMS } from '../../sports/nfl/teams';
import { fetchNflChampionshipOdds } from '../../api/nfl';
import NflLogo from './NflLogo';
import s from './nfl.module.css';

function implied(american) {
  return american < 0 ? -american / (-american + 100) : 100 / (american + 100);
}
function fmtOdds(v) { return v > 0 ? `+${v}` : `${v}`; }

export default function NflSuperBowlWatch({ limit = 8 }) {
  const { buildPath } = useWorkspace();
  const [odds, setOdds] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchNflChampionshipOdds().then((d) => { if (!cancelled) setOdds(d.odds || {}); });
    return () => { cancelled = true; };
  }, []);

  if (!odds || Object.keys(odds).length === 0) return null;

  // Normalise so the percentages are a share of the whole field, not
  // raw implied probabilities that sum well past 100.
  const field = NFL_TEAMS
    .map((t) => ({ ...t, price: odds[t.slug]?.bestChanceAmerican }))
    .filter((t) => typeof t.price === 'number');
  const total = field.reduce((a, t) => a + implied(t.price), 0);
  const top = total > 0 ? Math.max(...field.map((t) => implied(t.price) / total)) : 1;

  const column = (conference) => {
    const teams = field
      .filter((t) => t.conference === conference)
      .map((t) => ({ ...t, share: implied(t.price) / total }))
      .sort((a, b) => b.share - a.share)
      .slice(0, limit);
    return (
      <div className={`${s.card} ${s.cardFlush}`}>
        <div className={s.divisionHead}>
          <span>{conference}</span>
          <span className={s.muted}>Market share of title</span>
        </div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <tbody>
              {teams.map((t) => (
                <tr key={t.slug}>
                  <td>
                    <span className={s.teamCell}>
                      <NflLogo slug={t.slug} />
                      <Link to={buildPath(`/teams/${t.slug}`)}>{t.name}</Link>
                    </span>
                  </td>
                  <td className={s.right}>
                    <span className={s.meter}>
                      <span className={s.meterTrack}><span className={s.meterFill} style={{ width: `${Math.round((t.share / top) * 100)}%` }} /></span>
                      <span className={s.meterValue}>{(t.share * 100).toFixed(1)}%</span>
                    </span>
                  </td>
                  <td className={`${s.right} ${s.num}`}><strong>{fmtOdds(t.price)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <div>
          <h2 className={s.sectionTitle}>Super Bowl watch</h2>
          <p className={s.sectionSub}>Title prices by conference, with each team’s share of the market.</p>
        </div>
        <Link to={buildPath('/season-model')} className={s.sectionLink}>Season Intelligence →</Link>
      </div>
      <div className={s.grid2}>
        {column('AFC')}
        {column('NFC')}
      </div>
    </section>
  );
}
