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
    .replace(/\s*\((?:FL|OH|PA|CA|NY|TX|WA|OR|CO|AZ|NM|NV|UT|ID|MT|WY|ND|SD|NE|KS|MN|IA|MO|WI|IL|IN|MI|KY|TN|GA|AL|MS|AR|LA|OK)\)$/i, '')
    .trim();
  return { name: cleaned, slug: getTeamSlug(cleaned) };
}

/**
 * Look up compact ATS context for a team from atsLeaders data.
 * Only returns a tag when the team is above 55% (hot ATS signal).
 */
function getAtsTag(teamName, atsLeaders) {
  if (!teamName || !atsLeaders?.best?.length) return null;
  const key = teamName.toLowerCase().trim();
  const leader = atsLeaders.best.find(l => {
    const lName = (l.name || l.team || l.slug || '').toLowerCase();
    if (!lName) return false;
    // Match: exact, or last word of either contains the other
    if (lName === key) return true;
    const keyLast = key.split(/\s+/).pop() ?? '';
    const lLast   = lName.split(/\s+/).pop() ?? '';
    return keyLast.length > 3 && lLast.length > 3 && (lName.includes(keyLast) || key.includes(lLast));
  });
  if (!leader) return null;
  const raw = leader.coverPct ?? leader.atsPercent ?? null;
  if (raw == null) return null;
  const rate = raw > 1 ? Math.round(raw) : Math.round(raw * 100);
  if (rate < 55) return null;
  // Extract W-L if available
  const rec = leader.rec || leader.last30 || leader.season || null;
  if (rec && rec.w != null) {
    return `ATS: ${rec.w}-${rec.l ?? 0}`;
  }
  const tf = leader.games ? `L${leader.games}` : 'L30';
  return `ATS: ${rate}% ${tf}`;
}

export default function DailyBriefingSlide1({ data, asOf, options = {}, ...rest }) {
  const { styleMode = 'generic' } = options;

  const digest      = data?.chatDigest ?? null;
  const hasDigest   = digest?.hasChatContent === true;
  const atsLeaders  = data?.atsLeaders ?? null;

  // ¶1 → last-night highlights (max 3)
  const highlights = hasDigest ? (digest.lastNightHighlights ?? []).slice(0, 3) : [];

  // ¶1 → energetic first-sentence hook
  // Suppress if it contradicts existing highlights (chatbot may say "no games" while
  // structured scoresYesterday produced valid highlights)
  const rawLeadLine = hasDigest ? (digest.recapLeadLine || '') : '';
  const staleLeadPattern = /no games|quiet|scoreboard was|nothing (on|to report)|no (major )?results/i;
  const leadLine = (highlights.length > 0 && staleLeadPattern.test(rawLeadLine))
    ? ''
    : rawLeadLine;

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
          {highlights.map((h, i) => {
            const teamAObj  = makeTeam(h.teamA);
            const teamBObj  = makeTeam(h.teamB);
            const atsTag    = i === 0 ? getAtsTag(teamAObj?.name || h.teamA, atsLeaders) : null;
            const isTopGame = i === 0;
            return (
              <div key={i} className={`${styles.scoreRow} ${isTopGame ? styles.scoreRowTop : ''}`}>

                {/* Team A (winner) */}
                <div className={styles.scoreTeamA}>
                  <TeamLogo team={teamAObj} size={isTopGame ? 54 : 44} />
                  <div className={styles.teamAMeta}>
                    <span className={`${styles.scoreTeamName} ${isTopGame ? styles.scoreTeamNameTop : ''}`}>
                      {teamAObj?.name || h.teamA}
                    </span>
                    {atsTag && (
                      <span className={styles.atsTag}>{atsTag}</span>
                    )}
                  </div>
                </div>

                {/* Score */}
                <div className={styles.scoreResult}>
                  <span className={`${styles.scoreNum} ${isTopGame ? styles.scoreNumTop : ''}`}>{h.score}</span>
                  <span className={styles.scoreFinal}>FINAL</span>
                </div>

                {/* Team B (loser) */}
                <div className={styles.scoreTeamB}>
                  <span className={`${styles.scoreTeamName} ${styles.scoreTeamNameLoser}`}>
                    {teamBObj?.name || h.teamB || '—'}
                  </span>
                  <TeamLogo team={teamBObj} size={isTopGame ? 54 : 44} />
                </div>

                {/* ¶1 editorial context line — top game only */}
                {h.summaryLine && isTopGame && (
                  <div className={styles.scoreSummary}>{h.summaryLine}</div>
                )}
              </div>
            );
          })}
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
