/**
 * TopPlayHero — flagship decision-card for today's Top Play.
 *
 * Layout:
 *   [ TODAY'S TOP PLAY · Moneyline ]                     [ Conviction: 93 Elite ]
 *   NYY  @  BOS                                               7:05 PM
 *   RECOMMENDED
 *   NYY ML −135                                        (very large)
 *   "Yankees priced below model on rotation mismatch."
 *   · Rotation quality strong away edge
 *   · Line steamed 4 cents our direction
 *   ─────────────────────────────────────────────────────
 *   Edge +6.9%   ·   Confidence 78%   ·   Bet Score 93
 */

import { resolveTeamLogo } from '../../../utils/teamLogo';
import { convictionTier, convictionDescription } from '../../../features/mlb/picks/convictionTier';
import { primaryDriver } from '../../../features/mlb/picks/pickInsights';
import { resolveConviction, resolveBetScoreDisplay } from '../../../features/picks/conviction';
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

export default function TopPlayHero({ pick, featured = false, relativeStrength = null }) {
  if (!pick) return null;
  const driver = primaryDriver(pick);

  const awaySlug = pick.matchup?.awayTeam?.slug;
  const homeSlug = pick.matchup?.homeTeam?.slug;
  const awayLogo = resolveTeamLogo({ pick, slug: awaySlug, team: pick.matchup?.awayTeam });
  const homeLogo = resolveTeamLogo({ pick, slug: homeSlug, team: pick.matchup?.homeTeam });
  const away = pick.matchup?.awayTeam?.shortName || 'AWY';
  const home = pick.matchup?.homeTeam?.shortName || 'HOM';
  const time = fmtTime(pick.matchup?.startTime);
  const label = pick.selection?.label || pick.pick?.label || '';
  const headline = pick.rationale?.headline || pick.pick?.explanation || '';
  const bullets = (pick.rationale?.bullets || []).slice(0, 2);

  // Hide rather than fallback to 0 when score data is missing.
  const conviction = resolveConviction(pick);
  const betScore = resolveBetScoreDisplay(pick);
  const tier = conviction != null ? convictionTier(conviction) : null;
  const edgePct = pick.rawEdge != null ? fmtPct(pick.rawEdge, { sign: true }) : null;
  const confidencePct = pick.betScore?.components?.modelConfidence != null
    ? Math.round(pick.betScore.components.modelConfidence * 100)
    : null;

  const marketLabel = MARKET_LABEL[pick.market?.type] || pick.market?.type;

  return (
    <section className={`${styles.hero} ${featured ? styles.heroFeatured : ''}`} aria-label="Today's Top Play">
      <div className={styles.beam} aria-hidden="true" />
      <div className={styles.gradient} aria-hidden="true" />
      <div className={styles.glow} aria-hidden="true" />

      <header className={styles.header}>
        <div className={styles.eyebrowRow}>
          <span className={styles.eyebrow}>Today's Top Play</span>
          {marketLabel && (
            <>
              <span className={styles.eyebrowDot}>·</span>
              <span className={styles.marketTag}>{marketLabel}</span>
            </>
          )}
        </div>
        {conviction != null && tier && <ConvictionBadge value={conviction} tier={tier} />}
      </header>

      <div className={styles.matchupLine}>
        {awayLogo && <img src={awayLogo} alt="" width={26} height={26} className={styles.logo} loading="eager" />}
        <span className={styles.team}>{away}</span>
        <span className={styles.at}>@</span>
        {homeLogo && <img src={homeLogo} alt="" width={26} height={26} className={styles.logo} loading="eager" />}
        <span className={styles.team}>{home}</span>
        {time && <span className={styles.time}>{time}</span>}
      </div>

      <div className={styles.recommendedBlock}>
        <span className={styles.recommendedKicker}>Recommended Bet</span>
        <span className={styles.pickLabel}>{label}</span>
      </div>

      {(relativeStrength || driver) && (
        <div className={styles.insightRow}>
          {relativeStrength && (
            <span className={styles.strengthPill}>
              <span className={styles.strengthGlyph} aria-hidden="true">◆</span>
              {relativeStrength.text}
            </span>
          )}
          {driver && (
            <span className={styles.driverPill}>
              <span className={styles.driverKicker}>Primary Driver</span>
              <span className={styles.driverLabel}>{driver.label}</span>
            </span>
          )}
        </div>
      )}

      {headline && <p className={styles.headline}>{headline}</p>}

      {bullets.length > 0 && (
        <ul className={styles.bullets}>
          {bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      )}

      <p className={styles.reinforce}>The model's strongest recommendation today.</p>

      <footer className={styles.metrics}>
        {edgePct != null && <Metric label="Edge" value={edgePct} />}
        {confidencePct != null && <Metric label="Confidence" value={`${confidencePct}%`} />}
        {betScore != null && <Metric label="Bet Score" value={betScore} accent />}
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

function ConvictionBadge({ value, tier }) {
  return (
    <div
      className={`${styles.convictionBadge} ${styles[`tier_${tier.variant}`]}`}
      aria-label={convictionDescription(value)}
      title={convictionDescription(value)}
    >
      <span className={styles.convictionTop}>
        <span className={styles.convictionLabel}>Conviction</span>
        <span className={styles.convictionValue}>{value}</span>
      </span>
      <span className={styles.convictionTier}>{tier.label}</span>
    </div>
  );
}
