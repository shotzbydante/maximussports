import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import styles from './DailyBriefingSlide1.module.css';
import SlideShell from './SlideShell';

/**
 * Resolve team from a chatbot-parsed name.
 * Strips "The " article and ranking prefixes before slug lookup.
 */
function makeTeam(name) {
  if (!name) return null;
  const cleaned = name
    .replace(/^(?:The |the )/, '')
    .replace(/^(?:No\.\s*\d+\s+|#\d+\s+)/, '')
    .trim();
  return { name: cleaned, slug: getTeamSlug(cleaned) };
}

export default function DailyBriefingSlide1({ data, asOf, options = {}, ...rest }) {
  const { styleMode = 'generic' } = options;

  const digest    = data?.chatDigest ?? null;
  const hasDigest = digest?.hasChatContent === true;

  // ¶1 → last-night highlights (max 3 for whitespace)
  const highlights = hasDigest ? (digest.lastNightHighlights ?? []).slice(0, 3) : [];

  // ¶1 → energetic first-sentence hook
  const leadLine   = hasDigest ? (digest.recapLeadLine || '') : '';

  // ¶1 → fallback bullets when no scores parse
  const storyBullets = hasDigest
    ? (digest.topStorylines ?? []).slice(0, 3)
    : (data?.headlines ?? []).slice(0, 3).map(h => ({
        text:   (h.title || h.headline || '').slice(0, 88),
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

      {/* ¶1 first-sentence hook */}
      {leadLine && highlights.length > 0 && (
        <div className={styles.leadLine}>{leadLine}</div>
      )}

      <div className={styles.divider} />

      {highlights.length > 0 ? (
        <div className={styles.scoreList}>
          {highlights.map((h, i) => (
            <div key={i} className={`${styles.scoreRow} ${i === 0 ? styles.scoreRowTop : ''}`}>
              {/* Team A */}
              <div className={styles.scoreTeamA}>
                <TeamLogo team={makeTeam(h.teamA)} size={50} />
                <span className={styles.scoreTeamName}>{makeTeam(h.teamA)?.name || h.teamA}</span>
              </div>

              {/* Score */}
              <div className={styles.scoreResult}>
                <span className={styles.scoreNum}>{h.score}</span>
                <span className={styles.scoreFinal}>FINAL</span>
              </div>

              {/* Team B */}
              <div className={styles.scoreTeamB}>
                <span className={styles.scoreTeamName}>{makeTeam(h.teamB)?.name || h.teamB || '—'}</span>
                <TeamLogo team={makeTeam(h.teamB)} size={50} />
              </div>

              {/* ¶1 editorial context line */}
              {h.summaryLine && (
                <div className={styles.scoreSummary}>{h.summaryLine}</div>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* Fallback: lead narrative from ¶1 + storyline bullets */
        <div className={styles.fallbackBlock}>
          {!leadLine && digest?.leadNarrative && (
            <div className={styles.leadNarrative}>{digest.leadNarrative}</div>
          )}
          <div className={styles.bulletList}>
            {storyBullets.map((b, i) => (
              <div key={i} className={styles.bulletRow}>
                <span className={styles.bulletArrow}>→</span>
                <span className={styles.bulletText}>
                  {typeof b === 'string' ? b : (b.text || '')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </SlideShell>
  );
}
