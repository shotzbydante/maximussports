import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import styles from './DailyBriefingSlide2.module.css';
import SlideShell from './SlideShell';

function makeTeam(name) {
  if (!name) return null;
  return { name, slug: getTeamSlug(name) };
}

export default function DailyBriefingSlide2({ data, asOf, options = {}, ...rest }) {
  const { styleMode = 'generic' } = options;
  const isRobot = styleMode === 'robot';

  const digest    = data?.chatDigest ?? null;
  const hasDigest = digest?.hasChatContent === true;

  // Primary: chatbot-parsed title race from ¶2
  let raceEntries = hasDigest ? (digest.titleRace ?? []) : [];

  // Fallback: raw championship odds map if available in data
  if (!raceEntries.length) {
    const raw = data?.champOdds ?? data?.championshipOdds ?? null;
    if (raw) {
      const entries = Array.isArray(raw)
        ? raw
        : Object.entries(raw).map(([team, odds]) => ({ team, odds }));

      raceEntries = entries.slice(0, 6).reduce((acc, e) => {
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
        });
        return acc;
      }, []).sort((a, b) => b.impliedProbability - a.impliedProbability);
    }
  }

  // Narrative fallback for when chatbot mentions odds but parsing misses explicit format
  const oddsNarrative = hasDigest && !raceEntries.length
    ? (digest.atsContextText || digest.leadNarrative || '')
    : '';

  const maxBar = raceEntries.length > 0
    ? Math.max(...raceEntries.map(e => e.impliedProbability))
    : 100;

  return (
    <SlideShell asOf={asOf} accentColor="#B7986C" styleMode={styleMode} rest={rest}>
      <div className={styles.titleBlock}>
        <div className={styles.titleSup}>CHAMPIONSHIP ODDS</div>
        <h2 className={styles.title}>
          {isRobot ? <>TITLE<br />RACE</> : <>TITLE<br />RACE</>}
        </h2>
      </div>

      <div className={styles.divider} />

      {raceEntries.length === 0 ? (
        <div className={styles.emptyState}>
          {oddsNarrative ? (
            <div className={styles.oddsNarrative}>{oddsNarrative}</div>
          ) : (
            <p className={styles.emptyText}>Championship odds loading…</p>
          )}
        </div>
      ) : (
        <div className={styles.leaderboard}>
          {raceEntries.slice(0, 5).map((entry, i) => {
            const barWidth = maxBar > 0
              ? Math.round((entry.impliedProbability / maxBar) * 100)
              : entry.impliedProbability;
            const isFavorite = i === 0;

            return (
              <div
                key={i}
                className={`${styles.leaderRow} ${isFavorite ? styles.leaderRowTop : ''}`}
              >
                <span className={styles.leaderRank}>{i + 1}</span>

                <div className={styles.leaderLogoWrap}>
                  <TeamLogo team={makeTeam(entry.team)} size={42} />
                </div>

                <div className={styles.leaderInfo}>
                  <div className={styles.leaderTeam}>{entry.team}</div>
                  <div className={styles.probBarRow}>
                    <div className={styles.probBar}>
                      <div
                        className={styles.probFill}
                        style={{ width: `${Math.min(barWidth, 100)}%` }}
                      />
                    </div>
                    <span className={styles.probPct}>{entry.impliedProbability}%</span>
                  </div>
                  {entry.commentary && (
                    <div className={styles.leaderComment}>{entry.commentary}</div>
                  )}
                </div>

                <div className={styles.oddsPillWrap}>
                  <span className={`${styles.oddsPill} ${isFavorite ? styles.oddsPillFav : ''}`}>
                    {entry.americanOdds}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className={styles.footNote}>
        {isRobot
          ? 'Title odds derived from market data. Not financial advice.'
          : 'Implied probability from current championship futures market.'}
      </div>
    </SlideShell>
  );
}
