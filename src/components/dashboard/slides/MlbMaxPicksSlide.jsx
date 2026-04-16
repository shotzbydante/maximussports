/**
 * MlbMaxPicksSlide — Flagship MLB Maximus's Picks Instagram poster (1080×1350).
 *
 * CANONICAL DATA: Uses buildMlbPicks() — the SAME engine that powers the
 * MLB home board / Odds Insights page. Zero drift.
 *
 * Layout (density-first, NCAAM structural patterns):
 *   Header    — Maximus branding + "MAXIMUS'S PICKS" chip + date
 *   Hero      — Top Play card: matchup + pick + metrics + signals + rationale
 *   Summary   — Board composition strip (counts per category)
 *   Section   — "TODAY'S BOARD" labeled divider
 *   Board     — 3-column row: Best Run Line, Best Value, Best Total
 *   Narrative — Model narrative module (styled card, not floating text)
 *   Footer    — URL + disclaimer
 *
 * Visual language: Daily Briefing dark navy gradient + crimson accents.
 * Structural density: NCAAM PicksSlideShell / MaxPicksATSSlide packing.
 */

import { useState } from 'react';
import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
import { buildMlbPicks, hasAnyPicks } from '../../../features/mlb/picks/buildMlbPicks';
import styles from './MlbMaxPicksSlide.module.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtConf(tier) {
  if (!tier) return 'EDGE';
  return tier.toUpperCase();
}

function fmtEdge(model) {
  const edge = model?.edge;
  if (edge == null || !isFinite(edge)) return null;
  return `${(edge * 100).toFixed(1)}%`;
}

function fmtDQ(model) {
  const dq = model?.dataQuality;
  if (dq == null || !isFinite(dq)) return null;
  return `${Math.round(dq * 100)}%`;
}

function fmtTime(startTime) {
  if (!startTime) return '';
  try {
    const d = new Date(startTime);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
    });
  } catch { return ''; }
}

function TeamLogo({ slug, size = 36 }) {
  const [failed, setFailed] = useState(false);
  const url = getMlbEspnLogoUrl(slug);
  if (!url || failed) return null;
  return (
    <img
      src={url} alt="" width={size} height={size}
      className={styles.teamLogo}
      crossOrigin="anonymous"
      onError={() => setFailed(true)}
    />
  );
}

// ─── Pick Selection (deterministic, editorial) ───────────────────────────────

/**
 * Select the 4 featured picks for the slide from the canonical board.
 * Returns { hero, spread, value, total, boardCounts }.
 */
function selectFeaturedPicks(board) {
  const cats = board?.categories || {};
  const pickEms = cats.pickEms || [];
  const ats = cats.ats || [];
  const leans = cats.leans || [];
  const totals = cats.totals || [];

  const boardCounts = {
    moneyline: pickEms.length,
    spread: ats.length,
    value: leans.length,
    totals: totals.length,
    total: pickEms.length + ats.length + leans.length + totals.length,
  };

  // Hero: highest confidence pick across the entire board
  const allPicks = [
    ...pickEms.map(p => ({ ...p, _cat: 'Moneyline' })),
    ...ats.map(p => ({ ...p, _cat: 'Spread' })),
    ...leans.map(p => ({ ...p, _cat: 'Value' })),
    ...totals.map(p => ({ ...p, _cat: 'Total' })),
  ];
  allPicks.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));

  const hero = allPicks[0] || null;
  const heroGameId = hero?.gameId;

  // Best per category (skip hero's game for diversity if possible)
  const bestOf = (arr) => {
    const diverse = arr.find(p => p.gameId !== heroGameId);
    return diverse || arr[0] || null;
  };

  const spread = bestOf(ats);
  const value = bestOf(leans);
  const total = bestOf(totals);

  return { hero, spread, value, total, boardCounts };
}

// ─── Narrative Builder ───────────────────────────────────────────────────────

function buildNarrative(featured) {
  const { hero, spread, value, total, boardCounts } = featured;
  if (!hero) return 'The model is evaluating today\'s slate.';

  const heroTeam = hero.pick?.label?.split(/\s+/)[0] || 'the favorite';
  const parts = [];

  // What the hero play is
  const heroCategory = hero._cat || 'Moneyline';
  if (hero.confidence === 'high') {
    parts.push(`The model is locked in on a ${heroCategory.toLowerCase()} position with ${heroTeam}`);
  } else {
    parts.push(`Today's card is led by a ${heroCategory.toLowerCase()} lean toward ${heroTeam}`);
  }

  // What else the board shows
  const supporting = [];
  if (spread) supporting.push('run-line value');
  if (value) supporting.push('market mispricing');
  if (total) supporting.push('a totals edge');

  if (supporting.length > 0) {
    parts[0] += `, with supporting ${supporting.join(', ')}.`;
  } else {
    parts[0] += '.';
  }

  return parts.join(' ');
}

// ─── Pick Card Sub-components ────────────────────────────────────────────────

function HeroPickCard({ pick }) {
  if (!pick) return null;
  const away = pick.matchup?.awayTeam;
  const home = pick.matchup?.homeTeam;
  const edge = fmtEdge(pick.model);
  const dq = fmtDQ(pick.model);
  const time = fmtTime(pick.matchup?.startTime);
  const catLabel = pick._cat || 'Moneyline';
  const signals = pick.pick?.topSignals?.slice(0, 3) || [];

  return (
    <div className={styles.heroCard}>
      <div className={styles.heroCardHeader}>
        <span className={styles.heroLabel}>TOP PLAY</span>
        <span className={styles.heroCatPill}>{catLabel.toUpperCase()}</span>
        <span className={`${styles.heroConfPill} ${styles[`conf${fmtConf(pick.confidence)}`] || ''}`}>
          {fmtConf(pick.confidence)}
        </span>
      </div>
      <div className={styles.heroMatchup}>
        <div className={styles.heroTeamSide}>
          <TeamLogo slug={away?.slug} size={52} />
          <span className={styles.heroTeamName}>{away?.shortName || '?'}</span>
        </div>
        <div className={styles.heroVsBlock}>
          <span className={styles.heroVs}>VS</span>
          {time && <span className={styles.heroTime}>{time} ET</span>}
        </div>
        <div className={styles.heroTeamSide}>
          <TeamLogo slug={home?.slug} size={52} />
          <span className={styles.heroTeamName}>{home?.shortName || '?'}</span>
        </div>
      </div>
      <div className={styles.heroSelection}>
        <span className={styles.heroPickLabel}>{pick.pick?.label || '—'}</span>
      </div>
      <div className={styles.heroMetrics}>
        {edge && (
          <div className={styles.heroMetric}>
            <span className={styles.heroMetricLabel}>EDGE</span>
            <span className={styles.heroMetricValue}>{edge}</span>
          </div>
        )}
        {dq && (
          <div className={styles.heroMetric}>
            <span className={styles.heroMetricLabel}>DATA QUALITY</span>
            <span className={styles.heroMetricValue}>{dq}</span>
          </div>
        )}
      </div>
      {signals.length > 0 && (
        <div className={styles.heroSignals}>
          {signals.map((sig, i) => (
            <div key={i} className={styles.heroSignalItem}>
              <span className={styles.heroSignalCheck}>&#x2713;</span>
              <span>{sig}</span>
            </div>
          ))}
        </div>
      )}
      {pick.pick?.explanation && (
        <div className={styles.heroRationale}>{pick.pick.explanation}</div>
      )}
    </div>
  );
}

function BoardPickCard({ pick, label }) {
  if (!pick) return null;
  const away = pick.matchup?.awayTeam;
  const home = pick.matchup?.homeTeam;
  const edge = fmtEdge(pick.model);
  const dq = fmtDQ(pick.model);
  const topSignal = pick.pick?.topSignals?.[0];

  return (
    <div className={styles.boardCard}>
      <div className={styles.boardCardHeader}>
        <span className={styles.boardCatLabel}>{label}</span>
        <span className={`${styles.boardConfPill} ${styles[`conf${fmtConf(pick.confidence)}`] || ''}`}>
          {fmtConf(pick.confidence)}
        </span>
      </div>
      <div className={styles.boardMatchup}>
        <TeamLogo slug={away?.slug} size={28} />
        <span className={styles.boardTeamAbbrev}>{away?.shortName || '?'}</span>
        <span className={styles.boardVs}>@</span>
        <TeamLogo slug={home?.slug} size={28} />
        <span className={styles.boardTeamAbbrev}>{home?.shortName || '?'}</span>
      </div>
      <div className={styles.boardSelection}>{pick.pick?.label || '—'}</div>
      <div className={styles.boardMetrics}>
        {edge && <span className={styles.boardMetricItem}>Edge {edge}</span>}
        {dq && <span className={styles.boardMetricItem}>DQ {dq}</span>}
      </div>
      {topSignal && (
        <div className={styles.boardSignal}>
          <span className={styles.boardSignalCheck}>&#x2713;</span>
          <span>{topSignal}</span>
        </div>
      )}
      {pick.pick?.explanation && (
        <div className={styles.boardRationale}>{pick.pick.explanation}</div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MlbMaxPicksSlide({ data, asOf, options = {}, ...rest }) {
  // ── Build picks from canonical source (SAME as MLB home board) ──
  const games = data?.mlbGames ?? data?.picksGames ?? data?.odds?.games ?? [];
  let board = data?.canonicalPicks ?? data?.mlbPicks ?? null;

  // If board is from /api/mlb/picks/built, it already has categories.
  // If it's raw games, we need to build.
  if (!board?.categories || !hasAnyPicks(board)) {
    try {
      board = buildMlbPicks({ games });
    } catch (err) {
      console.error('[MlbMaxPicksSlide] buildMlbPicks failed:', err);
      board = { categories: {} };
    }
  }

  // ── Validation ──
  const hasPicks = hasAnyPicks(board);
  const featured = selectFeaturedPicks(board);

  console.log('[MLB_PICKS_STUDIO_VALIDATION]', {
    hasBoard: !!board,
    categories: Object.keys(board?.categories || {}),
    counts: featured.boardCounts,
    hasHero: !!featured.hero,
  });

  if (!hasPicks) {
    return (
      <div className={styles.artboard} {...rest}>
        <div className={styles.bgBase} />
        <div className={styles.bgGlow} />
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>NO PICKS AVAILABLE</div>
          <div className={styles.emptySubtitle}>
            The model hasn't generated picks yet. Check back when games are on the slate.
          </div>
        </div>
      </div>
    );
  }

  const narrative = buildNarrative(featured);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  return (
    <div className={styles.artboard} {...rest}>
      {/* Background layers */}
      <div className={styles.bgBase} aria-hidden="true" />
      <div className={styles.bgGlow} aria-hidden="true" />
      <div className={styles.bgRay} aria-hidden="true" />
      <div className={styles.bgNoise} aria-hidden="true" />

      {/* Mascot watermark */}
      <div className={styles.mascotWrap} aria-hidden="true">
        <img src="/mascot-mlb.png" alt="" className={styles.mascot} crossOrigin="anonymous"
          onError={e => { e.currentTarget.style.display = 'none'; }} />
      </div>

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logoRow}>
          <img src="/logo.png" alt="Maximus Sports" className={styles.brandLogo} crossOrigin="anonymous" />
          <div className={styles.logoMeta}>
            <span className={styles.brandName}>MAXIMUS SPORTS</span>
            <span className={styles.intelChip}>MAXIMUS'S PICKS</span>
          </div>
        </div>
        <div className={styles.headerRight}>
          {asOf && <div className={styles.asOf}>As of {asOf}</div>}
          <div className={styles.maxIntel}>MLB PICKS BOARD</div>
        </div>
      </header>

      {/* Date + subtitle */}
      <div className={styles.dateZone}>
        <div className={styles.dateLine}>{today}</div>
        <div className={styles.dateSubtitle}>Model-backed edges across today's MLB slate</div>
      </div>

      {/* Hero: Top Play */}
      <HeroPickCard pick={featured.hero} />

      {/* Board summary strip */}
      <div className={styles.summaryStrip}>
        <span className={styles.summaryItem}>
          <span className={styles.summaryCount}>{featured.boardCounts.moneyline}</span> Moneyline
        </span>
        <span className={styles.summaryDot}>&middot;</span>
        <span className={styles.summaryItem}>
          <span className={styles.summaryCount}>{featured.boardCounts.spread}</span> Run Line
        </span>
        <span className={styles.summaryDot}>&middot;</span>
        <span className={styles.summaryItem}>
          <span className={styles.summaryCount}>{featured.boardCounts.value}</span> Value
        </span>
        <span className={styles.summaryDot}>&middot;</span>
        <span className={styles.summaryItem}>
          <span className={styles.summaryCount}>{featured.boardCounts.totals}</span> Total
        </span>
      </div>

      {/* Board section title */}
      <div className={styles.boardSectionTitle}>
        <div className={styles.boardSectionRule} />
        <span className={styles.boardSectionLabel}>TODAY'S BOARD</span>
        <div className={styles.boardSectionRuleRight} />
      </div>

      {/* Board: 3 featured category picks */}
      <div className={styles.boardRow}>
        <BoardPickCard pick={featured.spread} label="BEST RUN LINE" />
        <BoardPickCard pick={featured.value} label="BEST VALUE" />
        <BoardPickCard pick={featured.total} label="BEST TOTAL" />
      </div>

      {/* Editorial narrative module */}
      <div className={styles.narrativeModule}>
        <div className={styles.narrativeModuleHead}>
          <span className={styles.narrativeModuleLabel}>MODEL NARRATIVE</span>
          <div className={styles.narrativeModuleRule} />
        </div>
        <p className={styles.narrativeText}>{narrative}</p>
      </div>

      {/* Footer */}
      <footer className={styles.footer}>
        <span className={styles.footerUrl}>maximussports.ai</span>
        <span className={styles.footerDisclaimer}>
          For entertainment only. Please bet responsibly. 21+
        </span>
      </footer>
    </div>
  );
}

/**
 * Export the featured pick selector for use by the caption builder.
 * Ensures caption and slide show the exact same picks.
 */
export { selectFeaturedPicks, buildNarrative };
