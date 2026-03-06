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

  const digest    = data?.chatDigest ?? null;
  const hasDigest = digest?.hasChatContent === true;

  const highlights  = hasDigest ? (digest.lastNightHighlights ?? []) : [];
  const leadText    = hasDigest ? (digest.leadNarrative || '') : '';
  const storyLines  = hasDigest ? (digest.topStorylines ?? []) : [];
  const rawHeadlines = data?.headlines ?? [];

  // Limit to 3 best results — quality over quantity
  const topHighlights = highlights.slice(0, 3);

  // Fallback bullets when no score highlights available
  const fallbackBullets = storyLines.length > 0
    ? storyLines.slice(0, 3)
    : rawHeadlines.slice(0, 3).map(h => ({
        text:   (h.title || h.headline || '').slice(0, 80),
        source: h.source || null,
      })).filter(b => b.text);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
  });

  return (
    <SlideShell asOf={asOf} accentColor="#3C79B4" styleMode={styleMode} rest={rest}>
      <div className={styles.datePill}>{today}</div>

      <div className={styles.titleBlock}>
        <div className={styles.titleSup}>LAST NIGHT</div>
        <h2 className={styles.title}>SHOCK&shy;WAVES</h2>
      </div>

      <div className={styles.divider} />

      {topHighlights.length > 0 ? (
        <div className={styles.scoreList}>
          {topHighlights.map((h, i) => (
            <div key={i} className={`${styles.scoreRow} ${i === 0 ? styles.scoreRowTop : ''}`}>
              {/* Team A */}
              <div className={styles.scoreTeamA}>
                <TeamLogo team={makeTeam(h.teamA)} size={52} />
                <span className={styles.scoreTeamName}>{h.teamA}</span>
              </div>

              {/* Final score */}
              <div className={styles.scoreResult}>
                <span className={styles.scoreNum}>{h.score}</span>
                <span className={styles.scoreFinal}>FINAL</span>
              </div>

              {/* Team B */}
              <div className={styles.scoreTeamB}>
                <span className={styles.scoreTeamName}>{h.teamB || '—'}</span>
                <TeamLogo team={makeTeam(h.teamB)} size={52} />
              </div>

              {/* Editorial summary line */}
              {h.summaryLine && (
                <div className={styles.scoreSummary}>{h.summaryLine}</div>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* Fallback: lead narrative + storyline bullets */
        <div className={styles.fallbackBlock}>
          {leadText && (
            <div className={styles.leadNarrative}>{leadText}</div>
          )}
          <div className={styles.bulletList}>
            {fallbackBullets.map((b, i) => (
              <div key={i} className={styles.headlineRow}>
                <span className={styles.headlineBullet}>→</span>
                <span className={styles.headlineText}>
                  {(b.text || '').length > 88
                    ? (b.text || '').slice(0, 88) + '…'
                    : (b.text || '')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </SlideShell>
  );
}
