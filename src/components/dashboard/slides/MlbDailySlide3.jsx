/**
 * MlbDailySlide3 — World Series Outlook (Slide 3 of MLB Daily Briefing carousel)
 *
 * Premium 2-column league board: AL top 5 (left) + NL top 5 (right)
 * Sorted by projected wins. Each team box mirrors the Season Intelligence
 * team card with distilled rationale, odds, and model signals.
 *
 * 1080×1350 · IG 4:5 portrait
 */

import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
import { MLB_TEAMS } from '../../../sports/mlb/teams';
import { getTeamProjection } from '../../../data/mlb/seasonModel';
import { fmtOdds, fmtDelta } from './mlbDailyHelpers';
import styles from './MlbSlides.module.css';

function TeamLogo({ slug, size = 28 }) {
  const url = getMlbEspnLogoUrl(slug);
  if (!url) return null;
  return <img src={url} alt="" width={size} height={size} className={styles.s3TeamLogo} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />;
}

/** Trophy SVG */
function TrophyIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={styles.s3TrophyIcon}>
      <path d="M4 2h8v1.5c0 2.5-1.5 4.5-4 5.5-2.5-1-4-3-4-5.5V2z" stroke="rgba(255,215,0,0.75)" strokeWidth="1.0" fill="rgba(255,215,0,0.10)" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 3.5H2.5c0 1.5 0.8 2.5 1.5 3M12 3.5h1.5c0 1.5-0.8 2.5-1.5 3" stroke="rgba(255,215,0,0.55)" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M6.5 9.5v1.5h3V9.5M5.5 11h5v1H5.5z" stroke="rgba(255,215,0,0.55)" strokeWidth="0.8" fill="rgba(255,215,0,0.06)" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Build top 5 per league sorted by projected wins */
function buildLeagueTop5(champOdds) {
  const entries = [];
  for (const team of MLB_TEAMS) {
    const proj = getTeamProjection(team.slug);
    if (!proj || !proj.projectedWins) continue;
    const oddsData = champOdds?.[team.slug];
    const oddsVal = oddsData?.bestChanceAmerican ?? oddsData?.american ?? null;

    // Distill rationale to 1-2 sentences
    const fullRat = proj.rationale || '';
    const ratSentences = fullRat.match(/[^.!?]*[.!?]+/g) || [];
    // Pick strongest driver sentence + market sentence if available
    const driverSent = ratSentences.find(s =>
      /strongest|primary|engine|firepower|rotation|bullpen|offense/i.test(s)
    );
    const marketSent = ratSentences.find(s =>
      /market|value signal|above.*market|below.*market/i.test(s)
    );
    const closeSent = ratSentences.find(s =>
      /range:|profile,/i.test(s)
    );
    const distilled = [driverSent, marketSent || closeSent]
      .filter(Boolean)
      .map(s => s.trim())
      .join(' ')
      || ratSentences.slice(0, 2).join(' ').trim()
      || '';

    entries.push({
      slug: team.slug, abbrev: team.abbrev, name: team.name,
      league: team.league, division: team.division,
      projectedWins: proj.projectedWins, odds: oddsVal,
      floor: proj.floor, ceiling: proj.ceiling,
      confidenceTier: proj.confidenceTier ?? null,
      marketDelta: proj.marketDelta ?? null,
      divOutlook: proj.divOutlook ?? null,
      playoffProb: proj.playoffProb ?? null,
      signals: proj.signals ?? [],
      strongestDriver: proj.takeaways?.strongestDriver ?? null,
      rationale: distilled,
    });
  }
  entries.sort((a, b) => (b.projectedWins ?? 0) - (a.projectedWins ?? 0));
  return {
    al: entries.filter(e => e.league === 'AL').slice(0, 5),
    nl: entries.filter(e => e.league === 'NL').slice(0, 5),
  };
}

/** Compact division label */
function shortDiv(div) {
  if (!div) return '';
  return div.replace('American League ', 'AL ').replace('National League ', 'NL ');
}

function TeamRow({ t, rank }) {
  const isTop = rank <= 2;
  return (
    <div className={`${styles.s3Row} ${isTop ? styles.s3RowTop : ''}`}>
      {/* Identity + odds row */}
      <div className={styles.s3RowHeader}>
        <div className={styles.s3RowIdentity}>
          <span className={styles.s3RowRank}>{rank}</span>
          <TeamLogo slug={t.slug} size={isTop ? 32 : 26} />
          <span className={styles.s3RowName}>{t.abbrev}</span>
          <span className={styles.s3RowDiv}>{shortDiv(t.division)}</span>
        </div>
        <div className={styles.s3RowOdds}>
          <TrophyIcon size={isTop ? 14 : 12} />
          <span className={styles.s3RowOddsVal}>{fmtOdds(t.odds)}</span>
        </div>
      </div>
      {/* Projected wins hero */}
      <div className={styles.s3RowWins}>
        <span className={styles.s3RowWinsNum}>{t.projectedWins}</span>
        <span className={styles.s3RowWinsLabel}>PROJ W</span>
        {t.signals?.[0] && <span className={styles.s3RowSignal}>{t.signals[0]}</span>}
      </div>
      {/* Rationale */}
      {t.rationale && (
        <div className={styles.s3RowRationale}>{t.rationale}</div>
      )}
    </div>
  );
}

export default function MlbDailySlide3({ data, asOf, ...rest }) {
  const champOdds = data?.mlbChampOdds ?? {};
  const { al, nl } = buildLeagueTop5(champOdds);

  return (
    <div className={styles.artboard} {...rest}>
      <div className={styles.bgBase} />
      <div className={styles.bgGlow} />
      <div className={styles.bgRay} />
      <div className={styles.s3BgStadium} />
      <div className={styles.bgNoise} />

      {/* Header */}
      <div className={styles.s3Header}>
        <img src="/mlb-logo.png" alt="" className={styles.s3MlbCrest} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
        <h2 className={styles.s3Title}>WORLD SERIES OUTLOOK</h2>
        <span className={styles.s3Subtitle}>MAXIMUS MODEL TOP 5 BY LEAGUE</span>
      </div>

      {/* 2-column league board */}
      <div className={styles.s3Board}>
        {/* AL column */}
        <div className={styles.s3Column}>
          <div className={styles.s3ColHeader}>
            <span className={styles.s3ColTitle}>AMERICAN LEAGUE</span>
          </div>
          <div className={styles.s3ColBody}>
            {al.map((t, i) => <TeamRow key={t.slug} t={t} rank={i + 1} />)}
          </div>
        </div>

        {/* NL column */}
        <div className={styles.s3Column}>
          <div className={styles.s3ColHeader}>
            <span className={styles.s3ColTitle}>NATIONAL LEAGUE</span>
          </div>
          <div className={styles.s3ColBody}>
            {nl.map((t, i) => <TeamRow key={t.slug} t={t} rank={i + 1} />)}
          </div>
        </div>
      </div>

      {/* Subtle footer */}
      <footer className={styles.footer}>
        <span className={styles.footerUrl}>maximussports.ai</span>
        <span className={styles.footerDisclaimer}>Full Season Intelligence in app · For entertainment only. 21+</span>
      </footer>
    </div>
  );
}
