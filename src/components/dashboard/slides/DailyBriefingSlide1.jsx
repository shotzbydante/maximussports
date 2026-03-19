import TeamLogo from '../../shared/TeamLogo';
import SeedBadge from '../../common/SeedBadge';
import { getTeamSlug } from '../../../utils/teamSlug';
import { getTeamSeed } from '../../../utils/tournamentHelpers';
import styles from './DailyBriefingSlide1.module.css';
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

function buildIntelBullets(digest, headlines) {
  const bullets = [];

  const highlights = digest?.lastNightHighlights ?? [];
  for (const h of highlights.slice(0, 3)) {
    if (h.summaryLine) {
      bullets.push({ text: h.summaryLine, team: h.teamA, icon: null });
    } else if (h.teamA && h.teamB && h.score) {
      bullets.push({ text: `${h.teamA} defeats ${h.teamB}, ${h.score}`, team: h.teamA, icon: null });
    }
  }

  const stories = digest?.topStorylines ?? [];
  for (const s of stories) {
    if (bullets.length >= 4) break;
    const text = typeof s === 'string' ? s : s.text;
    if (!text) continue;
    if (bullets.some(b => b.text === text)) continue;
    bullets.push({ text, team: null, icon: '→' });
  }

  if (bullets.length === 0 && headlines?.length) {
    for (const h of headlines.slice(0, 3)) {
      const text = (h.title || h.headline || '').slice(0, 100);
      if (text) bullets.push({ text, team: null, icon: '→' });
    }
  }

  return bullets.slice(0, 4);
}

export default function DailyBriefingSlide1({ data, asOf, options = {}, ...rest }) {
  const { styleMode = 'generic' } = options;

  const digest    = data?.chatDigest ?? null;
  const hasDigest = digest?.hasChatContent === true;

  const rawLeadLine = hasDigest ? (digest.recapLeadLine || '') : '';
  const staleLeadPattern = /no games|quiet|scoreboard was|nothing (on|to report)|no (major )?results/i;
  const highlights = hasDigest ? (digest.lastNightHighlights ?? []) : [];
  const leadLine = (highlights.length > 0 && staleLeadPattern.test(rawLeadLine))
    ? ''
    : rawLeadLine;

  const intelBullets = hasDigest
    ? buildIntelBullets(digest, data?.headlines)
    : buildIntelBullets(null, data?.headlines ?? []);

  const titleRace = hasDigest ? (digest.titleRace ?? []) : [];
  const topMover = titleRace[0] ?? null;

  const compactScores = highlights.slice(0, 2);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
  });

  return (
    <SlideShell asOf={asOf} accentColor="#3C79B4" styleMode={styleMode} category="daily" rest={rest}>
      <div className={styles.datePill}>{today}</div>

      <div className={styles.titleBlock}>
        <div className={styles.titleSup}>DAILY INTEL BRIEFING</div>
        <h2 className={styles.title}>TODAY&apos;S<br />INTEL</h2>
      </div>

      {leadLine && (
        <div className={styles.leadLine}>{leadLine}</div>
      )}

      <div className={styles.divider} />

      {/* Primary: narrative intel stack */}
      <div className={styles.intelStack}>
        {intelBullets.map((b, i) => {
          const teamObj = b.team ? makeTeam(b.team) : null;
          const seed = teamObj ? getTeamSeed(teamObj.name) : null;
          return (
            <div key={i} className={styles.intelRow}>
              <div className={styles.intelLogo}>
                {teamObj ? (
                  <TeamLogo team={teamObj} size={40} />
                ) : (
                  <span className={styles.intelIcon}>{b.icon || '📊'}</span>
                )}
              </div>
              <div className={styles.intelContent}>
                {seed != null && (
                  <SeedBadge seed={seed} size="sm" />
                )}
                <span className={styles.intelText}>{b.text}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Secondary: title market callout */}
      {topMover && (
        <div className={styles.moverCallout}>
          <span className={styles.moverLabel}>TITLE MARKET</span>
          <div className={styles.moverContent}>
            {(() => { const t = makeTeam(topMover.team); return t ? <TeamLogo team={t} size={28} /> : null; })()}
            <span className={styles.moverTeam}>{topMover.team}</span>
            {topMover.americanOdds && (
              <span className={styles.moverOdds}>{topMover.americanOdds}</span>
            )}
            {topMover.commentary && (
              <span className={styles.moverNote}>{topMover.commentary.slice(0, 60)}</span>
            )}
          </div>
        </div>
      )}

      {/* Compact last-night context */}
      {compactScores.length > 0 && (
        <div className={styles.contextBlock}>
          <span className={styles.contextLabel}>LAST NIGHT</span>
          <div className={styles.contextScores}>
            {compactScores.map((h, i) => {
              const tA = makeTeam(h.teamA);
              const tB = makeTeam(h.teamB);
              return (
                <div key={i} className={styles.contextRow}>
                  <TeamLogo team={tA} size={24} />
                  <span className={styles.contextTeam}>{tA?.name || h.teamA}</span>
                  <span className={styles.contextScore}>{h.score}</span>
                  <span className={styles.contextTeamDim}>{tB?.name || h.teamB}</span>
                  <TeamLogo team={tB} size={24} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </SlideShell>
  );
}
