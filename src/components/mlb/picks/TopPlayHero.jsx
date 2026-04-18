/**
 * TopPlayHero — the single highest-conviction pick of the day.
 *
 * Premium navy glass treatment. No red/pink. Every metric explicitly labeled.
 */

import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
import styles from './TopPlayHero.module.css';

function fmtTime(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  catch { return ''; }
}

function fmtPct(v, { sign = false } = {}) {
  if (v == null || !isFinite(v)) return null;
  const n = v * 100;
  const s = sign && n > 0 ? '+' : '';
  return `${s}${n.toFixed(1)}%`;
}

const MARKET_LABEL = {
  moneyline: 'Moneyline',
  runline: 'Run Line',
  total: 'Total',
};

export default function TopPlayHero({ pick, featured = false }) {
  if (!pick) return null;

  const awaySlug = pick.matchup?.awayTeam?.slug;
  const homeSlug = pick.matchup?.homeTeam?.slug;
  const awayLogo = awaySlug ? getMlbEspnLogoUrl(awaySlug) : null;
  const homeLogo = homeSlug ? getMlbEspnLogoUrl(homeSlug) : null;
  const away = pick.matchup?.awayTeam?.shortName || 'AWY';
  const home = pick.matchup?.homeTeam?.shortName || 'HOM';
  const time = fmtTime(pick.matchup?.startTime);
  const label = pick.selection?.label || pick.pick?.label || '';
  const headline = pick.rationale?.headline || pick.pick?.explanation || '';
  const bullets = (pick.rationale?.bullets || []).slice(0, 2);

  // Metrics — all EXPLICITLY labeled
  const conviction = pick.conviction?.score ?? Math.round((pick.betScore?.total ?? 0) * 100);
  const betScore = Math.round((pick.betScore?.total ?? 0) * 100);
  const edgePct = pick.rawEdge != null ? fmtPct(pick.rawEdge, { sign: true }) : null;
  const confidencePct = pick.betScore?.components?.modelConfidence != null
    ? Math.round(pick.betScore.components.modelConfidence * 100)
    : null;

  const marketLabel = MARKET_LABEL[pick.market?.type] || pick.market?.type;

  return (
    <section className={`${styles.hero} ${featured ? styles.heroFeatured : ''}`} aria-label="Today's Top Play">
      <div className={styles.gradient} aria-hidden="true" />
      <div className={styles.glow} aria-hidden="true" />

      <header className={styles.header}>
        <div className={styles.eyebrowRow}>
          <span className={styles.eyebrow}>Today's Top Play</span>
          {marketLabel && <span className={styles.marketTag}>{marketLabel}</span>}
        </div>
        <ConvictionBadge value={conviction} />
      </header>

      <div className={styles.matchupLine}>
        {awayLogo && <img src={awayLogo} alt="" width={24} height={24} className={styles.logo} loading="eager" />}
        <span className={styles.team}>{away}</span>
        <span className={styles.at}>@</span>
        {homeLogo && <img src={homeLogo} alt="" width={24} height={24} className={styles.logo} loading="eager" />}
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
        {edgePct != null && (
          <Metric label="Edge" value={edgePct} />
        )}
        {confidencePct != null && (
          <Metric label="Confidence" value={`${confidencePct}%`} />
        )}
        <Metric label="Bet Score" value={betScore} accent />
      </footer>
    </section>
  );
}

function Metric({ label, value, accent }) {
  return (
    <div className={`${styles.metric} ${accent ? styles.metricAccent : ''}`}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{value}</span>
    </div>
  );
}

function ConvictionBadge({ value }) {
  return (
    <div className={styles.convictionBadge} aria-label={`Conviction score ${value} out of 100`}>
      <span className={styles.convictionLabel}>Conviction</span>
      <span className={styles.convictionValue}>{value}</span>
    </div>
  );
}
