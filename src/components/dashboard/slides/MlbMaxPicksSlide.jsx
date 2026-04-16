/**
 * MlbMaxPicksSlide — MLB Maximus's Picks · 4-Quadrant Board (1080×1350).
 *
 * CANONICAL DATA: Uses buildMlbPicks() — the SAME engine that powers the
 * MLB home board / Odds Insights page. Zero drift.
 *
 * SHARED RESOLVER: selectFeaturedQuadrants() is imported from a shared
 * module so slide and caption always show the same 8 games.
 *
 * Layout:
 *   Header       — compact brand + date
 *   Summary      — top play callout + board composition
 *   Quadrant Grid — 2×2: Pick'Ems | Run Line | Value | Totals
 *   Narrative    — board takeaway strip
 *   Footer       — URL + disclaimer
 *
 * Each quadrant: 2 featured games with matchup, pick, conf, edge, driver.
 * Total: 8 games on the slide.
 */

import { useState } from 'react';
import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
import { buildMlbPicks, hasAnyPicks } from '../../../features/mlb/picks/buildMlbPicks';
import { selectFeaturedQuadrants, buildQuadrantNarrative } from '../../../features/mlb/picks/selectFeaturedQuadrants';
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

function TeamLogo({ slug, size = 26 }) {
  const [failed, setFailed] = useState(false);
  const url = getMlbEspnLogoUrl(slug);
  if (!url || failed) return null;
  return (
    <img
      src={url} alt="" width={size} height={size}
      className={styles.teamLogo}
      loading="eager"
      decoding="sync"
      crossOrigin="anonymous"
      data-fallback-text={slug?.toUpperCase()?.slice(0, 3) || ''}
      data-team-slug={slug}
      onError={() => setFailed(true)}
    />
  );
}

// ─── Quadrant Pick Row ──────────────────────────────────────────────────────

function QuadrantPickRow({ pick }) {
  if (!pick) return null;
  const away = pick.matchup?.awayTeam;
  const home = pick.matchup?.homeTeam;
  const edge = fmtEdge(pick.model);
  const dq = fmtDQ(pick.model);
  const conf = fmtConf(pick.confidence);
  const driver = pick.pick?.topSignals?.[0] || null;
  const explanation = pick.pick?.explanation || null;

  return (
    <div className={styles.pickRow}>
      <div className={styles.pickMatchup}>
        <TeamLogo slug={away?.slug} size={26} />
        <span className={styles.pickTeam}>{away?.shortName || '?'}</span>
        <span className={styles.pickAt}>@</span>
        <TeamLogo slug={home?.slug} size={26} />
        <span className={styles.pickTeam}>{home?.shortName || '?'}</span>
      </div>
      <div className={styles.pickMain}>
        <span className={styles.pickLabel}>{pick.pick?.label || '—'}</span>
        <span className={`${styles.pickConf} ${styles[`conf${conf}`] || ''}`}>
          {conf}
        </span>
      </div>
      <div className={styles.pickMeta}>
        {edge && <span className={styles.pickMetaItem}>Edge {edge}</span>}
        {dq && <span className={styles.pickMetaItem}>DQ {dq}</span>}
      </div>
      {driver && (
        <div className={styles.pickDriver}>
          <span className={styles.pickDriverCheck}>&#x2713;</span>
          <span>{driver}</span>
        </div>
      )}
      {!driver && explanation && (
        <div className={styles.pickDriver}>
          <span className={styles.pickDriverCheck}>&#x2713;</span>
          <span>{explanation}</span>
        </div>
      )}
    </div>
  );
}

// ─── Quadrant Module ────────────────────────────────────────────────────────

function QuadrantModule({ title, subtitle, picks }) {
  return (
    <div className={styles.quadrant}>
      <div className={styles.quadrantHead}>
        <span className={styles.quadrantTitle}>{title}</span>
        <span className={styles.quadrantSubtitle}>{subtitle}</span>
      </div>
      <div className={styles.quadrantDivider} />
      <div className={styles.quadrantPicks}>
        {picks.map((pick, i) => (
          <QuadrantPickRow key={i} pick={pick} />
        ))}
        {picks.length === 0 && (
          <div className={styles.quadrantEmpty}>Insufficient signal for this category</div>
        )}
        {picks.length === 1 && (
          <div className={styles.quadrantEmpty}>1 more pick on the full board</div>
        )}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MlbMaxPicksSlide({ data, asOf, options = {}, ...rest }) {
  // ── Build picks from canonical source (SAME as MLB home board) ──
  const games = data?.mlbGames ?? data?.picksGames ?? data?.odds?.games ?? [];
  let board = data?.canonicalPicks ?? data?.mlbPicks ?? null;

  if (!board?.categories || !hasAnyPicks(board)) {
    try {
      board = buildMlbPicks({ games });
    } catch (err) {
      console.error('[MlbMaxPicksSlide] buildMlbPicks failed:', err);
      board = { categories: {} };
    }
  }

  const hasPicks = hasAnyPicks(board);
  const quadrants = selectFeaturedQuadrants(board);

  // ── Validation (spec requirement) ──
  console.log('[MLB_PICKS_QUADRANT_VALIDATION]', {
    moneyline: quadrants.moneyline?.length,
    ats: quadrants.ats?.length,
    leans: quadrants.leans?.length,
    totals: quadrants.totals?.length,
    totalGames: quadrants.totalFeatured,
  });

  if (quadrants.moneyline.length < 2) console.warn('[MLB_PICKS] Moneyline quadrant has < 2 picks:', quadrants.moneyline.length);
  if (quadrants.ats.length < 2)       console.warn('[MLB_PICKS] ATS quadrant has < 2 picks:', quadrants.ats.length);
  if (quadrants.leans.length < 2)     console.warn('[MLB_PICKS] Value quadrant has < 2 picks:', quadrants.leans.length);
  if (quadrants.totals.length < 2)    console.warn('[MLB_PICKS] Totals quadrant has < 2 picks:', quadrants.totals.length);

  if (!hasPicks) {
    return (
      <div className={styles.artboard} {...rest}>
        <div className={styles.bgBase} />
        <div className={styles.bgGlow} />
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>NO PICKS AVAILABLE</div>
          <div className={styles.emptySubtitle}>
            The model hasn&apos;t generated picks yet. Check back when games are on the slate.
          </div>
        </div>
      </div>
    );
  }

  const narrative = buildQuadrantNarrative(quadrants);
  const topPlayLabel = quadrants.topPlay?.pick?.label || '';
  const topPlayCat = quadrants.topPlay?._cat || '';

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
        <img src="/mascot-mlb.png" alt="" className={styles.mascot}
          loading="eager" decoding="sync" crossOrigin="anonymous"
          onError={e => { e.currentTarget.style.display = 'none'; }} />
      </div>

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logoRow}>
          <img src="/logo.png" alt="Maximus Sports" className={styles.brandLogo}
            loading="eager" decoding="sync" crossOrigin="anonymous" />
          <div className={styles.logoMeta}>
            <span className={styles.brandName}>MAXIMUS SPORTS</span>
            <span className={styles.intelChip}>MAXIMUS'S PICKS</span>
          </div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.dateLine}>{today}</div>
          {asOf && <div className={styles.asOf}>As of {asOf}</div>}
        </div>
      </header>

      {/* Summary strip: top play callout + board composition */}
      <div className={styles.summaryStrip}>
        {topPlayLabel && (
          <span className={styles.topPlayChip}>
            Top Play: {topPlayLabel}{topPlayCat ? ` (${topPlayCat})` : ''}
          </span>
        )}
        <span className={styles.boardComp}>
          {quadrants.moneyline.length} ML &middot; {quadrants.ats.length} RL &middot; {quadrants.leans.length} Val &middot; {quadrants.totals.length} Tot &middot; {quadrants.totalFeatured} games
        </span>
      </div>

      {/* 2×2 Quadrant Grid */}
      <div className={styles.quadrantGrid}>
        <QuadrantModule title="PICK 'EMS" subtitle="Moneyline edges" picks={quadrants.moneyline} />
        <QuadrantModule title="RUN LINE" subtitle="Spread positions" picks={quadrants.ats} />
        <QuadrantModule title="VALUE LEANS" subtitle="Market mispricing" picks={quadrants.leans} />
        <QuadrantModule title="TOTALS" subtitle="Over/under spots" picks={quadrants.totals} />
      </div>

      {/* Narrative module — horizontal strip */}
      <div className={styles.narrativeModule}>
        <span className={styles.narrativeLabel}>BOARD TAKEAWAY</span>
        <div className={styles.narrativeRule} />
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
 * Re-export shared resolver so external consumers can import from either location.
 */
export { selectFeaturedQuadrants, buildQuadrantNarrative };
