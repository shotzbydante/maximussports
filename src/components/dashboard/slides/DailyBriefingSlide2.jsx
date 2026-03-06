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

/**
 * Build the ranked entry list for Slide 2.
 *
 * Source-of-truth rules:
 *   1. AP rankings (canonical ESPN team names — always reliable)
 *   2. Overlay chatbot-parsed odds onto matching ranked teams (by slug)
 *   3. Never display chatbot-parsed team names directly as entities
 *
 * The chatbot ¶2 text only provides the framing sentence (titleMarketLead),
 * NOT the team entity list.
 */
function buildRaceEntries(rankingsTop25, titleRace) {
  // Build canonical entries from AP rankings
  const rankEntries = (rankingsTop25 ?? []).slice(0, 8).map((r, idx) => {
    const teamName = r.teamName || r.name || r.team || '';
    if (!teamName) return null;
    const teamObj = makeTeam(teamName);
    return {
      team:               teamObj?.name || teamName,
      slug:               teamObj?.slug || null,
      rank:               r.rank ?? (idx + 1),
      americanOdds:       null,
      impliedProbability: null,
      commentary:         '',
    };
  }).filter(Boolean);

  if (!rankEntries.length) return { entries: [], hasOdds: false };

  // Build a slug → odds lookup from titleRace entries.
  // Entries may include a pre-resolved `slug` field (from structured championship odds)
  // or a `team` name that needs slug-resolution (from chatbot parsing).
  const oddsMap = {};
  for (const tr of (titleRace ?? [])) {
    const slug = tr.slug || getTeamSlug(tr.team);
    if (slug && tr.americanOdds && tr.impliedProbability != null && tr.impliedProbability > 0) {
      oddsMap[slug] = {
        americanOdds:       tr.americanOdds,
        impliedProbability: tr.impliedProbability,
        commentary:         tr.commentary || '',
      };
    }
  }

  // Overlay chatbot odds onto matching ranked teams
  let hasOdds = false;
  const enriched = rankEntries.map(e => {
    if (e.slug && oddsMap[e.slug]) {
      hasOdds = true;
      return { ...e, ...oddsMap[e.slug] };
    }
    return e;
  });

  return { entries: enriched, hasOdds };
}

export default function DailyBriefingSlide2({ data, asOf, options = {}, ...rest }) {
  const { styleMode = 'generic' } = options;
  const isRobot = styleMode === 'robot';

  const digest = data?.chatDigest ?? null;
  const hasDigest = digest?.hasChatContent === true;

  // Primary entity source: AP rankings (from digest passthrough or direct dashData)
  const rankingsTop25 = digest?.rankingsTop25?.length
    ? digest.rankingsTop25
    : (data?.rankingsTop25 ?? []);

  // Chatbot titleRace provides optional odds overlay (post-fix, slug-validated only)
  const titleRace = hasDigest ? (digest.titleRace ?? []) : [];

  const { entries: raceEntries, hasOdds } = buildRaceEntries(rankingsTop25, titleRace);

  // ¶2 → first punchy market framing sentence (chatbot provides copy, not entities)
  const marketLead = hasDigest
    ? (digest.titleMarketLead || '')
    : '';

  const maxBar = hasOdds
    ? Math.max(...raceEntries.map(e => e.impliedProbability ?? 0), 1)
    : 100;

  // Determine display mode
  const showOddsBars = hasOdds;
  const showRankings = !showOddsBars;

  return (
    <SlideShell asOf={asOf} accentColor="#B7986C" styleMode={styleMode} rest={rest}>
      <div className={styles.titleBlock}>
        <div className={styles.titleSup}>
          {showRankings ? 'TOP CONTENDERS' : 'CHAMPIONSHIP ODDS'}
        </div>
        <h2 className={styles.title}>
          {showRankings ? 'TITLE\nRACE' : 'TITLE\nMARKET'}
        </h2>
      </div>

      {marketLead && (
        <div className={styles.marketLead}>{marketLead}</div>
      )}

      <div className={styles.divider} />

      {raceEntries.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>Rankings data unavailable.</p>
        </div>
      ) : showOddsBars ? (
        /* Odds mode: probability bars + odds pill + trophy for top 3 */
        <div className={styles.leaderboard}>
          {raceEntries.slice(0, 6).map((entry, i) => {
            const barWidth = entry.impliedProbability != null && maxBar > 0
              ? Math.round((entry.impliedProbability / maxBar) * 100)
              : 0;
            const isFavorite = i === 0;
            const teamObj = makeTeam(entry.team);

            return (
              <div
                key={i}
                className={`${styles.leaderRow} ${isFavorite ? styles.leaderRowTop : ''}`}
              >
                <span className={`${styles.leaderRank} ${i < 3 ? styles.leaderRankHighlight : ''}`}>{i + 1}</span>

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

                <div className={styles.leaderRight}>
                  {entry.americanOdds && (
                    <span className={`${styles.oddsPill} ${isFavorite ? styles.oddsPillFav : ''}`}>
                      {entry.americanOdds}
                    </span>
                  )}
                  {i < 3 && <span className={styles.trophyIcon}>🏆</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Rankings mode: AP rank + team + trophy for top 3 */
        <div className={styles.leaderboard}>
          {raceEntries.slice(0, 8).map((entry, i) => {
            const isFavorite = i === 0;
            const teamObj = makeTeam(entry.team);
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
      )}

      <div className={styles.footNote}>
        {showOddsBars
          ? (isRobot
            ? 'Title odds from market data. Not financial advice.'
            : 'Implied probability from championship futures market.')
          : 'AP Top 25 rankings. Championship futures updating.'}
      </div>
    </SlideShell>
  );
}
