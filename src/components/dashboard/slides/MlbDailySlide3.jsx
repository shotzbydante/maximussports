/**
 * MlbDailySlide3 — World Series Outlook (Slide 3 of MLB Daily Briefing carousel)
 *
 * Full-canvas 2-column league board: AL top 5 (left) + NL top 5 (right)
 * Sorted by projected wins. Each card mirrors Season Intelligence summaries.
 *
 * 1080×1350 · IG 4:5 portrait
 */

import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
import { MLB_TEAMS } from '../../../sports/mlb/teams';
import { getTeamProjection } from '../../../data/mlb/seasonModel';
import { fmtOdds, fmtDelta } from './mlbDailyHelpers';
import styles from './MlbSlides.module.css';

function TeamLogo({ slug, size = 24 }) {
  const url = getMlbEspnLogoUrl(slug);
  if (!url) return null;
  return <img src={url} alt="" width={size} height={size} className={styles.s3TeamLogo} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />;
}

function TrophyIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={styles.s3TrophyIcon}>
      <path d="M4 2h8v1.5c0 2.5-1.5 4.5-4 5.5-2.5-1-4-3-4-5.5V2z" stroke="rgba(255,215,0,0.80)" strokeWidth="1.0" fill="rgba(255,215,0,0.12)" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 3.5H2.5c0 1.5 0.8 2.5 1.5 3M12 3.5h1.5c0 1.5-0.8 2.5-1.5 3" stroke="rgba(255,215,0,0.55)" strokeWidth="0.8" strokeLinecap="round" />
    </svg>
  );
}

/** Build top 5 per league sorted by projected wins desc */
function buildLeagueTop5(champOdds) {
  const entries = [];
  for (const team of MLB_TEAMS) {
    const proj = getTeamProjection(team.slug);
    if (!proj || !proj.projectedWins) continue;
    const oddsData = champOdds?.[team.slug];
    const oddsVal = oddsData?.bestChanceAmerican ?? oddsData?.american ?? null;

    // Distill rationale: pick driver sentence + market/close sentence
    const fullRat = proj.rationale || '';
    const sents = fullRat.match(/[^.!?]*[.!?]+/g) || [];
    const driverS = sents.find(s => /strongest|primary|engine|firepower|rotation|bullpen|offense|lineup/i.test(s));
    const marketS = sents.find(s => /market|value signal|above.*market|below.*market/i.test(s));
    const closeS = sents.find(s => /range:|profile,/i.test(s));
    const distilled = [driverS, marketS || closeS]
      .filter(Boolean).map(s => s.trim()).join(' ')
      || sents.slice(0, 2).join(' ').trim() || '';

    // Secondary line: range + confidence
    const secondary = proj.floor && proj.ceiling && proj.confidenceTier
      ? `Range: ${proj.floor}–${proj.ceiling} · ${proj.confidenceTier}`
      : '';

    entries.push({
      slug: team.slug, abbrev: team.abbrev, name: team.name,
      league: team.league, division: team.division,
      projectedWins: proj.projectedWins, odds: oddsVal,
      marketDelta: proj.marketDelta ?? null,
      signals: proj.signals ?? [],
      rationale: distilled,
      secondary,
    });
  }
  entries.sort((a, b) => (b.projectedWins ?? 0) - (a.projectedWins ?? 0));
  return {
    al: entries.filter(e => e.league === 'AL').slice(0, 5),
    nl: entries.filter(e => e.league === 'NL').slice(0, 5),
  };
}

function TeamCard({ t, rank }) {
  const featured = rank <= 2;
  const cls = featured ? styles.s3CardFeatured : styles.s3Card;
  return (
    <div className={cls}>
      {/* Zone A — identity + odds */}
      <div className={styles.s3ZoneA}>
        <div className={styles.s3IdLeft}>
          <div className={styles.s3IdRow}>
            <span className={styles.s3Rank}>{rank}</span>
            <TeamLogo slug={t.slug} size={24} />
            <span className={styles.s3Name}>{t.abbrev}</span>
          </div>
        </div>
        <div className={styles.s3OddsBadge}>
          <TrophyIcon size={11} />
          <span className={styles.s3OddsVal}>{fmtOdds(t.odds)}</span>
        </div>
      </div>

      {/* Zone B — hero projected wins */}
      <div className={styles.s3ZoneB}>
        <span className={styles.s3WinsNum}>{t.projectedWins}</span>
        <span className={styles.s3WinsLabel}>PROJECTED WINS</span>
        {t.signals?.[0] && <span className={styles.s3Chip}>{t.signals[0]}</span>}
      </div>

      {/* Zone C — reasoning */}
      <div className={styles.s3ZoneC}>
        {t.rationale && <div className={styles.s3Rationale}>{t.rationale}</div>}
        {t.secondary && <div className={styles.s3RationaleSecondary}>{t.secondary}</div>}
      </div>
    </div>
  );
}

export default function MlbDailySlide3({ data, asOf, ...rest }) {
  const champOdds = data?.mlbChampOdds ?? {};
  const { al, nl } = buildLeagueTop5(champOdds);

  return (
    <div className={`${styles.artboard} ${styles.liveMotion}`} style={{ padding: '28px 0 18px' }} {...rest}>
      <div className={styles.bgBase} />
      <div className={styles.bgGlow} />
      <div className={styles.bgRay} />
      <div className={styles.bgStadium} />
      <div className={styles.bgStreaks} />
      <div className={styles.bgNoise} />

      {/* Header — compact, max 132px */}
      <div className={styles.s3Header}>
        <img src="/mlb-logo.png" alt="" className={styles.s3Logo} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
        <h2 className={styles.s3Title}>WORLD SERIES OUTLOOK</h2>
        <span className={styles.s3Subtitle}>WHAT THE MAXIMUS PREDICTION MODEL SAYS</span>
      </div>

      {/* 2-column league board — fills remaining canvas */}
      <div className={styles.s3Board}>
        {/* AL column */}
        <div className={styles.s3Col}>
          <div className={styles.s3ColHead}>
            <span className={styles.s3ColTitle}>AMERICAN LEAGUE</span>
            <span className={styles.s3ColSub}>TOP 5 BY PROJECTED WINS</span>
          </div>
          <div className={styles.s3ColBody}>
            {al.map((t, i) => <TeamCard key={t.slug} t={t} rank={i + 1} />)}
          </div>
        </div>

        {/* NL column */}
        <div className={styles.s3Col}>
          <div className={styles.s3ColHead}>
            <span className={styles.s3ColTitle}>NATIONAL LEAGUE</span>
            <span className={styles.s3ColSub}>TOP 5 BY PROJECTED WINS</span>
          </div>
          <div className={styles.s3ColBody}>
            {nl.map((t, i) => <TeamCard key={t.slug} t={t} rank={i + 1} />)}
          </div>
        </div>
      </div>

      {/* Minimal footer */}
      <div className={styles.s3Footer}>
        <span className={styles.s3FooterText}>maximussports.ai · Full Season Intelligence in app · For entertainment only. 21+</span>
      </div>
    </div>
  );
}
