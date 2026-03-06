import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import styles from './DailyBriefingSlide2.module.css';
import SlideShell from './SlideShell';

function makeTeam(name) {
  if (!name) return null;
  const cleaned = name
    .replace(/^(?:The |the )/, '')
    .replace(/^(?:No\.\s*\d+\s+|#\d+\s+)/, '')
    .replace(/\s*\((?:FL|OH|PA|CA|NY|TX|WA|OR|CO|AZ|NM|NV|UT|ID|MT|WY|ND|SD|NE|KS|MN|IA|MO|WI|IL|IN|MI|KY|TN|GA|AL|MS|AR|LA|OK)\)$/i, '')
    .trim();
  return { name: cleaned, slug: getTeamSlug(cleaned) };
}

export default function DailyBriefingSlide2({ data, asOf, options = {}, ...rest }) {
  const { styleMode = 'generic' } = options;
  const isRobot = styleMode === 'robot';

  const digest    = data?.chatDigest ?? null;
  const hasDigest = digest?.hasChatContent === true;

  // ¶2 → title race entries from chatbot parsing (tier 1)
  let raceEntries = hasDigest ? (digest.titleRace ?? []) : [];
  let dataMode = 'odds'; // 'odds' | 'rankings'

  // Tier 2: raw championship odds map
  if (!raceEntries.length) {
    const raw = data?.champOdds ?? data?.championshipOdds ?? null;
    if (raw) {
      const entries = Array.isArray(raw)
        ? raw
        : Object.entries(raw).map(([team, odds]) => ({ team, odds }));

      const built = entries.slice(0, 8).reduce((acc, e) => {
        const team = e.team || e.name || '';
        if (!team) return acc;
        const oddsRaw = parseInt(e.americanOdds ?? e.odds ?? '0', 10);
        if (!oddsRaw) return acc;
        const impl = oddsRaw < 0
          ? Math.round((-oddsRaw / (-oddsRaw + 100)) * 100)
          : Math.round((100 / (oddsRaw + 100)) * 100);
        acc.push({
          team,
          americanOdds: oddsRaw > 0 ? `+${oddsRaw}` : String(oddsRaw),
          impliedProbability: impl,
          commentary: '',
          rank: null,
        });
        return acc;
      }, []).sort((a, b) => b.impliedProbability - a.impliedProbability);

      if (built.length > 0) raceEntries = built;
    }
  }

  // Tier 3 (guaranteed fallback): AP rankings — this slide can NEVER be blank
  if (!raceEntries.length) {
    const rankings = data?.rankings ?? [];
    if (rankings.length > 0) {
      dataMode = 'rankings';
      raceEntries = rankings.slice(0, 8).map((r, idx) => {
        const team = r.teamName || r.name || r.team || '';
        if (!team) return null;
        return {
          team,
          rank: r.rank ?? (idx + 1),
          americanOdds: null,
          impliedProbability: null,
          commentary: '',
        };
      }).filter(Boolean);
    }
  }

  // ¶2 → first punchy market framing sentence
  const marketLead = hasDigest
    ? (digest.titleMarketLead || digest.atsContextText || '')
    : '';

  const maxBar = raceEntries.length > 0 && raceEntries[0]?.impliedProbability != null
    ? Math.max(...raceEntries.map(e => e.impliedProbability ?? 0))
    : 100;

  const isRankingsFallback = dataMode === 'rankings';

  return (
    <SlideShell asOf={asOf} accentColor="#B7986C" styleMode={styleMode} rest={rest}>
      <div className={styles.titleBlock}>
        <div className={styles.titleSup}>
          {isRankingsFallback ? 'TOP CONTENDERS' : 'CHAMPIONSHIP ODDS'}
        </div>
        <h2 className={styles.title}>
          {isRankingsFallback ? 'TITLE\nRACE' : 'TITLE\nMARKET'}
        </h2>
      </div>

      {/* ¶2 market framing sentence */}
      {marketLead && (
        <div className={styles.marketLead}>{marketLead}</div>
      )}

      <div className={styles.divider} />

      {raceEntries.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>Market data unavailable.</p>
        </div>
      ) : isRankingsFallback ? (
        /* Rankings fallback: show rank-based contenders list */
        <div className={styles.leaderboard}>
          {raceEntries.slice(0, 8).map((entry, i) => {
            const teamObj = makeTeam(entry.team);
            const isFavorite = i === 0;
            return (
              <div
                key={i}
                className={`${styles.leaderRow} ${styles.leaderRowRank} ${isFavorite ? styles.leaderRowTop : ''}`}
              >
                <span className={`${styles.leaderRank} ${i < 3 ? styles.leaderRankHighlight : ''}`}>
                  #{entry.rank ?? (i + 1)}
                </span>

                <div className={styles.leaderLogoWrap}>
                  <TeamLogo team={teamObj} size={40} />
                </div>

                <div className={styles.leaderInfo}>
                  <div className={styles.leaderTeam}>{teamObj?.name || entry.team}</div>
                </div>

                {i < 3 && (
                  <span className={styles.trophyIcon}>🏆</span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Normal mode: championship odds with probability bars */
        <div className={styles.leaderboard}>
          {raceEntries.slice(0, 6).map((entry, i) => {
            const barWidth = maxBar > 0 && entry.impliedProbability != null
              ? Math.round((entry.impliedProbability / maxBar) * 100)
              : 0;
            const isFavorite = i === 0;
            const teamObj = makeTeam(entry.team);

            return (
              <div
                key={i}
                className={`${styles.leaderRow} ${isFavorite ? styles.leaderRowTop : ''}`}
              >
                <span className={styles.leaderRank}>{i + 1}</span>

                <div className={styles.leaderLogoWrap}>
                  <TeamLogo team={teamObj} size={44} />
                </div>

                <div className={styles.leaderInfo}>
                  <div className={styles.leaderTeam}>{teamObj?.name || entry.team}</div>
                  {entry.impliedProbability != null && (
                    <div className={styles.probBarRow}>
                      <div className={styles.probBar}>
                        <div
                          className={styles.probFill}
                          style={{ width: `${Math.min(barWidth, 100)}%` }}
                        />
                      </div>
                      <span className={styles.probPct}>{entry.impliedProbability}%</span>
                    </div>
                  )}
                  {entry.commentary && isFavorite && (
                    <div className={styles.leaderComment}>{entry.commentary}</div>
                  )}
                </div>

                {entry.americanOdds && (
                  <span className={`${styles.oddsPill} ${isFavorite ? styles.oddsPillFav : ''}`}>
                    {entry.americanOdds}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className={styles.footNote}>
        {isRankingsFallback
          ? 'Based on AP Top 25 rankings. Futures market data pending.'
          : isRobot
          ? 'Title odds from market data. Not financial advice.'
          : 'Implied probability from championship futures market.'}
      </div>
    </SlideShell>
  );
}
