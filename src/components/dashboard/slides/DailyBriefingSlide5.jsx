import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import styles from './DailyBriefingSlide5.module.css';
import SlideShell from './SlideShell';

function makeTeam(name) {
  if (!name) return null;
  return { name, slug: getTeamSlug(name) };
}

export default function DailyBriefingSlide5({ data, asOf, options = {}, ...rest }) {
  const { styleMode = 'generic' } = options;
  const isRobot = styleMode === 'robot';

  const digest    = data?.chatDigest ?? null;
  const hasDigest = digest?.hasChatContent === true;

  // Top 2-3 from title race (championship odds leaders)
  let raceEntries = hasDigest ? (digest.titleRace ?? []) : [];

  // Fallback: raw championship odds
  if (!raceEntries.length) {
    const raw = data?.champOdds ?? data?.championshipOdds ?? null;
    if (raw) {
      const entries = Array.isArray(raw)
        ? raw
        : Object.entries(raw).map(([team, odds]) => ({ team, odds }));

      raceEntries = entries.slice(0, 3).reduce((acc, e) => {
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

  // Editorial intel bullets from ¶5 — limit to 2-3
  let intelItems = hasDigest ? (digest.newsIntel ?? []) : [];
  if (!intelItems.length) {
    intelItems = (data?.headlines ?? []).slice(0, 3).map(h => ({
      headline:         (h.title || h.headline || '').slice(0, 86),
      editorialContext: h.source || null,
    })).filter(item => item.headline.length > 10);
  }

  const voiceLine = hasDigest ? (digest.voiceLine || '') : '';

  const maxBar = raceEntries.length > 0
    ? Math.max(...raceEntries.map(e => e.impliedProbability))
    : 100;

  const showRace  = raceEntries.slice(0, 3).length > 0;
  const showIntel = intelItems.slice(0, 3).length > 0;

  return (
    <SlideShell asOf={asOf} accentColor="#B7986C" styleMode={styleMode} rest={rest}>
      <div className={styles.titleBlock}>
        <div className={styles.titleSup}>MARKET + INTEL</div>
        <h2 className={styles.title}>RANKINGS<br />&amp; INTEL</h2>
      </div>

      <div className={styles.divider} />

      {/* Title race section */}
      {showRace && (
        <div className={styles.raceSection}>
          <div className={styles.sectionLabel}>TITLE RACE</div>
          <div className={styles.raceList}>
            {raceEntries.slice(0, 3).map((entry, i) => {
              const barWidth = maxBar > 0
                ? Math.round((entry.impliedProbability / maxBar) * 100)
                : entry.impliedProbability;
              const isFavorite = i === 0;

              return (
                <div
                  key={i}
                  className={`${styles.raceRow} ${isFavorite ? styles.raceRowTop : ''}`}
                >
                  <span className={styles.raceRank}>{i + 1}</span>

                  <div className={styles.raceLogoWrap}>
                    <TeamLogo team={makeTeam(entry.team)} size={40} />
                  </div>

                  <div className={styles.raceInfo}>
                    <div className={styles.raceTeam}>{entry.team}</div>
                    <div className={styles.probBarRow}>
                      <div className={styles.probBar}>
                        <div
                          className={styles.probFill}
                          style={{ width: `${Math.min(barWidth, 100)}%` }}
                        />
                      </div>
                      <span className={styles.probPct}>{entry.impliedProbability}%</span>
                    </div>
                  </div>

                  <span className={`${styles.oddsPill} ${isFavorite ? styles.oddsPillFav : ''}`}>
                    {entry.americanOdds}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Intel bullets section */}
      {showIntel && (
        <div className={`${styles.intelSection} ${showRace ? styles.intelSectionWithRace : ''}`}>
          {showRace && <div className={styles.sectionLabel}>INTEL</div>}
          <div className={styles.intelList}>
            {intelItems.slice(0, showRace ? 2 : 3).map((item, i) => (
              <div key={i} className={styles.intelRow}>
                <span className={styles.intelArrow}>→</span>
                <div className={styles.intelBody}>
                  <div className={styles.intelHeadline}>{item.headline}</div>
                  {item.editorialContext && !showRace && (
                    <span className={styles.intelSource}>{item.editorialContext}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!showRace && !showIntel && (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>Intel loading&hellip;</p>
        </div>
      )}

      {/* Voice closer */}
      {voiceLine && (
        <div className={styles.voiceBlock}>
          <span className={styles.voiceMark}>&ldquo;</span>
          <span className={styles.voiceLine}>{voiceLine}</span>
        </div>
      )}

      <div className={styles.footNote}>
        {isRobot
          ? 'Title odds derived from market data. Not financial advice.'
          : 'Championship futures market. Implied probability shown.'}
      </div>
    </SlideShell>
  );
}
