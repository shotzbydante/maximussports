import SlideShell from './SlideShell';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamColors } from '../../../utils/teamColors';
import { getConfidenceTier, getUpsetFraming } from '../../../utils/confidenceTier';
import styles from './UpsetRadarSlide.module.css';

/*
 * Semantic color system for Upset Radar:
 *   green  (#3DA87A) = model edge / confidence / live signal
 *   slate  (#8A9BAE) = neutral / toss-up / secondary
 *   amber  (#D4A84F) = borderline / transitional
 *   red    (#D14545) = danger / high upset threat / alert
 */

const MATCHUP_RISK_CONFIG = {
  HIGH:     { text: '#D14545', bg: 'rgba(209,69,69,0.14)', border: 'rgba(209,69,69,0.32)', icon: '\u25B2' },
  MODERATE: { text: '#8A9BAE', bg: 'rgba(138,155,174,0.10)', border: 'rgba(138,155,174,0.24)', icon: '\u2684' },
};

function getUpsetChanceColor(underdogPct) {
  if (underdogPct >= 45) return '#D14545';
  if (underdogPct >= 35) return '#D4A84F';
  return '#3DA87A';
}

function getRankStripeStyle(upsetRisk) {
  if (upsetRisk === 'HIGH') return 'danger';
  return 'default';
}

function computeUpsetRisk(game) {
  const upsetProb = game.upsetProbability ?? game.rateInfo?.rate ?? 0;
  if (upsetProb >= 0.35) return 'HIGH';
  if (upsetProb >= 0.20) return 'MODERATE';
  return 'LOW';
}

function MatchupRiskChip({ risk, framing }) {
  const cfg = MATCHUP_RISK_CONFIG[risk];
  if (!cfg) return null;
  const label = framing?.matchupLabel || (risk === 'HIGH' ? 'DANGER ZONE' : 'TOSS-UP');
  return (
    <span className={risk === 'HIGH' ? styles.dangerBadge : styles.badge} style={{ color: cfg.text, background: cfg.bg, borderColor: cfg.border }}>
      {cfg.icon} {label}
    </span>
  );
}

function UpsetRing({ pct, color, size = 62 }) {
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);

  return (
    <div className={styles.upsetRingWrap}>
      <div className={styles.upsetRing} style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none"
            stroke="rgba(61,168,122,0.10)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ filter: `drop-shadow(0 0 8px ${color}55)` }}
          />
        </svg>
        <span className={styles.upsetRingPct} style={{ color }}>{pct}%</span>
      </div>
      <span className={styles.upsetRingLabel}>UPSET CHANCE</span>
    </div>
  );
}

function PressureBar({ favoriteName, underdogName, underdogPct, edgeColor }) {
  const favPct = 100 - underdogPct;
  return (
    <div className={styles.pressureBar}>
      <div className={styles.pressureBarLabels}>
        <span className={styles.pressureBarFav}>{favoriteName} <strong>{favPct}%</strong></span>
        <span className={styles.pressureBarDog}>{underdogName} <strong>{underdogPct}%</strong></span>
      </div>
      <div className={styles.pressureBarTrack}>
        <div className={styles.pressureBarSpacer} style={{ flex: favPct }} />
        <div
          className={styles.pressureBarFill}
          style={{
            flex: underdogPct,
            minWidth: underdogPct > 0 ? `${underdogPct}%` : 0,
            background: `linear-gradient(90deg, ${edgeColor}88, ${edgeColor})`,
            boxShadow: `0 0 12px ${edgeColor}44`,
          }}
        />
      </div>
    </div>
  );
}

function TierChip({ tier }) {
  if (!tier) return null;
  const c = tier.igColor;
  return (
    <span
      className={styles.badge}
      style={{ color: c.text, background: c.bg, borderColor: c.border, gap: '3px', display: 'inline-flex', alignItems: 'center' }}
    >
      <span style={{ fontSize: '0.85em', lineHeight: 1 }}>{tier.icon}</span>
      {tier.label}
    </span>
  );
}

function UpsetCard({ game, rank }) {
  if (!game) return null;
  const { topTeam, bottomTeam, topSeed, bottomSeed, region, modelResult } = game;
  const upsetRisk = computeUpsetRisk(game);
  const stripeStyle = getRankStripeStyle(upsetRisk);

  const pickTeam = modelResult?.winner || topTeam;
  const isUpsetPick = modelResult?.isUpset ?? false;
  const winProb = modelResult?.winProbability ?? 0.5;
  const pct = Math.round(winProb * 100);
  const underdogPct = isUpsetPick ? pct : (100 - pct);
  const tier = getConfidenceTier(winProb);
  const framing = getUpsetFraming({
    isUpset: isUpsetPick,
    winProbability: winProb,
    topSeed,
    bottomSeed,
    heuristics: modelResult?.heuristics,
    scoreBreakdown: game._scoreBreakdown,
  });
  const rationaleText = modelResult?.rationale || '';

  const leftTeam = topTeam;
  const rightTeam = bottomTeam;
  const leftSeed = topSeed;
  const rightSeed = bottomSeed;
  const isPickLeft = !!(
    pickTeam === leftTeam ||
    (pickTeam?.slug && leftTeam?.slug && pickTeam.slug === leftTeam.slug) ||
    (pickTeam?.name && leftTeam?.name && pickTeam.name === leftTeam.name)
  );

  const pickSlug = pickTeam?.slug || '';
  const tc = getTeamColors(pickSlug);
  const accentColor = tc?.primary || '#3DA87A';

  const stripeClass = stripeStyle === 'danger' ? styles.rankStripeDanger : styles.rankStripe;

  return (
    <div
      className={styles.card}
      style={{
        '--card-accent': accentColor,
        '--card-accent-30': `${accentColor}4d`,
        '--card-accent-15': `${accentColor}26`,
        '--card-accent-08': `${accentColor}14`,
      }}
    >
      <div className={stripeClass}>
        <span className={styles.rankNum}>{rank}</span>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.cardInner}>
          {/* LEFT: Higher seed */}
          <div className={isPickLeft ? styles.pickZone : styles.oppZone}>
            <div className={isPickLeft ? styles.pickLogoWrap : styles.oppLogoWrap}>
              {isPickLeft && <div className={styles.pickGlow} style={{ background: `radial-gradient(circle, ${accentColor}25 0%, transparent 70%)` }} />}
              <TeamLogo team={leftTeam} size={48} />
            </div>
            <span className={isPickLeft ? styles.seedTag : styles.oppSeedTag}>#{leftSeed}</span>
            <span className={isPickLeft ? styles.pickName : styles.oppName}>{leftTeam?.shortName || leftTeam?.name}</span>
            {isPickLeft && (
              <span className={styles.pickBadge}>
                {framing.pickLabel}
              </span>
            )}
          </div>

          {/* CENTER: Underdog upset chance */}
          <div className={styles.centerZone}>
            <UpsetRing pct={underdogPct} color={getUpsetChanceColor(underdogPct)} size={62} />
            <div className={styles.vsStrip}>
              <span className={styles.vsLabel}>VS</span>
              {region && <span className={styles.regionLabel}>{region.toUpperCase()}</span>}
            </div>
          </div>

          {/* RIGHT: Lower seed */}
          <div className={!isPickLeft ? styles.pickZone : styles.oppZone}>
            <div className={!isPickLeft ? styles.pickLogoWrap : styles.oppLogoWrap}>
              {!isPickLeft && <div className={styles.pickGlow} style={{ background: `radial-gradient(circle, ${accentColor}25 0%, transparent 70%)` }} />}
              <TeamLogo team={rightTeam} size={48} />
            </div>
            <span className={!isPickLeft ? styles.seedTag : styles.oppSeedTag}>#{rightSeed}</span>
            <span className={!isPickLeft ? styles.pickName : styles.oppName}>{rightTeam?.shortName || rightTeam?.name}</span>
            {!isPickLeft && (
              <span className={styles.pickBadge}>
                {framing.pickLabel}
              </span>
            )}
          </div>
        </div>

        <PressureBar
          favoriteName={leftTeam?.shortName || leftTeam?.name}
          underdogName={rightTeam?.shortName || rightTeam?.name}
          underdogPct={underdogPct}
          edgeColor={getUpsetChanceColor(underdogPct)}
        />

        <div className={styles.bottomRow}>
          <div className={styles.rationaleStrip}>
            {rationaleText && <span className={styles.rationaleText}>{rationaleText}</span>}
          </div>
          <div className={styles.badgeStrip}>
            <TierChip tier={tier} />
            <MatchupRiskChip risk={upsetRisk} framing={framing} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UpsetRadarSlide({ data, asOf, slideNumber, slideTotal, options = {}, ...rest }) {
  const games = options.upsetRadarGames || [];
  const displayGames = games.slice(0, 5);
  const dayLabel = options.dayLabel || '';
  const roundLabel = options.roundLabel || '';

  const titleText = 'UPSET RADAR';
  const subtitleText = dayLabel
    ? `${dayLabel.toUpperCase()} \u00b7 ${roundLabel.toUpperCase()}`
    : 'UPSET INTELLIGENCE';

  return (
    <SlideShell
      asOf={asOf}
      theme="upset_radar"
      brandMode="light"
      slideNumber={slideNumber}
      slideTotal={slideTotal}
      rest={rest}
    >
      <div className={styles.headerBlock}>
        <div className={styles.headerTop}>
          <div className={styles.headerText}>
            <div className={styles.signalBadge}>
              <span className={styles.signalDot} />
              MARCH MADNESS 2026
            </div>
            <h2 className={styles.title}>{titleText}</h2>
            <div className={styles.titleSup}>{subtitleText}</div>
          </div>
          <img
            src="/mascot.png"
            alt=""
            className={styles.heroMascot}
            crossOrigin="anonymous"
          />
        </div>
      </div>

      {displayGames.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No upset candidates identified. Check back closer to tip-off.</p>
        </div>
      ) : (
        <div className={styles.cardList}>
          {displayGames.map((g, i) => (
            <UpsetCard key={i} game={g} rank={i + 1} />
          ))}
        </div>
      )}
    </SlideShell>
  );
}
