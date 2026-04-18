/**
 * TopPlayHero — the single highest-conviction pick of the day.
 * Designed to feel editorially important, not like one of a grid.
 */

import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
import styles from './TopPlayHero.module.css';

function formatTime(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  catch { return ''; }
}

export default function TopPlayHero({ pick }) {
  if (!pick) return null;

  const awaySlug = pick.matchup?.awayTeam?.slug;
  const homeSlug = pick.matchup?.homeTeam?.slug;
  const awayLogo = awaySlug ? getMlbEspnLogoUrl(awaySlug) : null;
  const homeLogo = homeSlug ? getMlbEspnLogoUrl(homeSlug) : null;
  const away = pick.matchup?.awayTeam?.shortName || 'AWY';
  const home = pick.matchup?.homeTeam?.shortName || 'HOM';
  const time = formatTime(pick.matchup?.startTime);
  const label = pick.selection?.label || pick.pick?.label || '';
  const headline = pick.rationale?.headline || pick.pick?.explanation || '';
  const bullets = (pick.rationale?.bullets || []).slice(0, 2);

  const conv = pick.conviction?.score ?? Math.round((pick.betScore?.total ?? 0) * 100);
  const edgePct = pick.rawEdge != null ? (Math.abs(pick.rawEdge) * 100).toFixed(1) : null;
  const confPct = pick.betScore?.components?.modelConfidence != null
    ? Math.round(pick.betScore.components.modelConfidence * 100)
    : null;

  return (
    <section className={styles.hero} aria-label="Today's Top Play">
      <header className={styles.header}>
        <span className={styles.eyebrow}>Today's Top Play</span>
        <span className={styles.convictionPill}>CONVICTION {conv}</span>
      </header>

      <div className={styles.matchupLine}>
        {awayLogo && <img src={awayLogo} alt="" width={22} height={22} className={styles.logo} loading="eager" />}
        <span className={styles.team}>{away}</span>
        <span className={styles.at}>@</span>
        {homeLogo && <img src={homeLogo} alt="" width={22} height={22} className={styles.logo} loading="eager" />}
        <span className={styles.team}>{home}</span>
        {time && <span className={styles.time}>{time}</span>}
      </div>

      <div className={styles.pickRow}>
        <span className={styles.pickLabel}>{label}</span>
      </div>

      {headline && <p className={styles.headline}>{headline}</p>}

      {bullets.length > 0 && (
        <ul className={styles.bullets}>
          {bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      )}

      <footer className={styles.metrics}>
        {edgePct && (
          <span className={styles.metric}>
            <span className={styles.metricLabel}>Edge</span>
            <span className={styles.metricValue}>{edgePct}%</span>
          </span>
        )}
        {confPct != null && (
          <span className={styles.metric}>
            <span className={styles.metricLabel}>Confidence</span>
            <span className={styles.metricValue}>{confPct}%</span>
          </span>
        )}
        <span className={styles.metric}>
          <span className={styles.metricLabel}>Bet Score</span>
          <span className={styles.metricValue}>{Math.round((pick.betScore?.total ?? 0) * 100)}</span>
        </span>
      </footer>
    </section>
  );
}
