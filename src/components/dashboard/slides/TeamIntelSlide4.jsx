/**
 * TeamIntelSlide4 — Instagram Hero Summary
 *
 * The "single best post" asset for a team intel package.
 * Fully custom artboard — does not use SlideShell.
 *
 * Design goals:
 *  - Aggressive team color usage: primary/secondary palette drives the whole mood
 *  - Cinematic / editorial — poster-like, not a stat dump
 *  - Strong editorial headline derived from the data
 *  - 3 highest-signal data chips
 *  - Animated: logo glow, bg pulse, shimmer on headline
 *  - Optimized for 1080×1350 Instagram portrait feed
 */

import styles from './TeamIntelSlide4.module.css';
import { getTeamEmoji } from '../../../utils/getTeamEmoji';
import { getTeamColors } from '../../../utils/teamColors';
import { buildMaximusPicks } from '../../../utils/maximusPicksModel';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseRecord(rec) {
  if (!rec) return null;
  if (typeof rec === 'string') {
    const m = rec.match(/(\d+)-(\d+)/);
    if (!m) return null;
    const w = parseInt(m[1], 10), l = parseInt(m[2], 10);
    return w + l === 0 ? null : { w, l, pct: w / (w + l) };
  }
  if (typeof rec === 'object') {
    const w = parseInt(rec.wins ?? rec.w ?? 0, 10);
    const l = parseInt(rec.losses ?? rec.l ?? 0, 10);
    return w + l === 0 ? null : { w, l, pct: w / (w + l) };
  }
  return null;
}

function fmtSpread(spread) {
  if (spread == null) return null;
  const n = parseFloat(spread);
  if (isNaN(n)) return String(spread);
  return n > 0 ? `+${n}` : String(n);
}

/**
 * Build the cinematic hero headline — the single most important line on the card.
 * Logic mirrors TeamIntelSlide2's signal voice but outputs sharper Instagram copy.
 */
function buildHeroHeadline({ teamName, ats, last5Wins, totalLast10, rank, nextLine }) {
  const first = teamName?.split(' ')[0] || teamName || 'This team';
  const shortName = (teamName || '').split(' ').slice(0, -1).join(' ') || first;

  const last7P  = parseRecord(ats?.last7);
  const last30P = parseRecord(ats?.last30);
  const seasonP = parseRecord(ats?.season);

  const last5Losses = 5 - (last5Wins ?? 0);

  // Trend: is last7 climbing vs last30?
  const trending =
    last7P && last30P
      ? last7P.pct > last30P.pct + 0.08 ? 'up' : last7P.pct < last30P.pct - 0.08 ? 'down' : 'flat'
      : 'flat';

  const spreadVal = nextLine?.consensus?.spread != null ? parseFloat(nextLine.consensus.spread) : null;
  const isUnderdog = spreadVal != null && spreadVal > 3;
  const isBigFav   = spreadVal != null && spreadVal < -10;

  // Storyline detection — ordered by priority
  const isUndefeated = totalLast10 >= 10 && (totalLast10 - (last5Losses + (totalLast10 >= 10 ? 0 : 0))) === totalLast10;
  const noLosses     = totalLast10 >= 8 && last5Wins === 5;

  const atsOnFire    = last7P && last7P.pct >= 0.72 && last30P && last30P.pct >= 0.65;
  const atsHeater    = (last7P && last7P.pct >= 0.65) || (last30P && last30P.pct >= 0.65);
  const marketBehind = (last30P && last30P.pct >= 0.62) || (seasonP && seasonP.pct >= 0.60);
  const isSurging    = last5Wins >= 4;
  const isRankedHot  = rank != null && rank <= 15 && isSurging;
  const isElite      = rank != null && rank <= 5;

  // Headlines — punchy, two short lines, uppercase-ready
  if (noLosses) return `Perfect.\nAnd covering.`;
  if (atsOnFire && trending === 'up') return `Market still\ncatching up.`;
  if (isElite && atsHeater) return `${shortName}\nlooks underpriced.`;
  if (isRankedHot && marketBehind) return `${shortName} is\nsurging.`;
  if (atsHeater && marketBehind && isUnderdog) return `Quiet value\non the underdog.`;
  if (atsOnFire) return `Quiet ATS heater\nin progress.`;
  if (atsHeater && trending === 'up') return `Cover rate\naccelerating fast.`;
  if (isBigFav && isSurging) return `Dominant.\nWatch the number.`;
  if (isSurging && atsHeater) return `${shortName}\nis rolling.`;
  if (isSurging) return `Playing their\nbest ball.`;
  if (marketBehind) return `Value still\nin this number.`;
  if (isElite) return `Elite team.\nFull intel inside.`;
  if (seasonP && seasonP.pct <= 0.42) return `Rough patch ATS.\nOther side worth a look.`;
  return `${shortName}.\nFull intel inside.`;
}

/**
 * Build the one-line market signal — same logic as Slide 2's buildSignalText,
 * but condensed for the footer strip.
 */
function buildSignalText(ats) {
  const last7P  = parseRecord(ats?.last7);
  const last30P = parseRecord(ats?.last30);
  const seasonP = parseRecord(ats?.season);
  const primary = last7P ?? last30P ?? seasonP;
  if (!primary) return null;

  const pct = Math.round(primary.pct * 100);
  const win = primary.w, loss = primary.l;
  const trending =
    last7P && last30P
      ? last7P.pct > last30P.pct + 0.08 ? 'up' : last7P.pct < last30P.pct - 0.08 ? 'down' : 'flat'
      : 'flat';

  if (primary.pct >= 0.68) {
    return trending === 'up'
      ? `Cover trend accelerating — market hasn't caught up yet.`
      : `Covering at ${pct}% (${win}–${loss}) — market still adjusting.`;
  }
  if (primary.pct >= 0.60) {
    return trending === 'up'
      ? `ATS rate climbing toward 60% — edge developing fast.`
      : `Holding firm at ${pct}% ATS. Consistent, steady value.`;
  }
  if (primary.pct >= 0.52) return `Fairly priced right now — no screaming edge either direction.`;
  if (primary.pct >= 0.45) {
    return trending === 'down'
      ? `ATS cooling off — ${pct}% and sliding. Watch the other side.`
      : `${pct}% ATS — hovering near break-even territory.`;
  }
  return `Struggling ATS at ${pct}%. Value may live on the other side.`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TeamIntelSlide4({ data, teamData, asOf, ...rest }) {
  const team = teamData?.team ?? {};
  const name = team.displayName || team.name || data?.selectedTeamName || '—';
  const slug = team.slug || data?.selectedTeamSlug || null;
  const rank = teamData?.rank ?? null;

  const { primary: teamPrimary, secondary: teamSecondary } = getTeamColors(slug);

  const record = team.record?.items?.[0]?.summary || team.recordSummary || team.record || null;
  const conf = team.conference || data?.selectedTeamConf || null;
  const mascotEmoji = getTeamEmoji(slug, name);

  // ── ATS data ──────────────────────────────────────────────────────────────
  const ats = teamData?.ats ?? {};
  const last30P = parseRecord(ats.last30);
  const seasonP = parseRecord(ats.season);
  const last7P  = parseRecord(ats.last7);

  // Fallback from atsLeaders if needed
  const resolvedAts = { ...ats };
  if (!ats.last30 && !ats.season) {
    const teamNameStr = name;
    const leaders = [...(data?.atsLeaders?.best ?? []), ...(data?.atsLeaders?.worst ?? [])];
    const found = leaders.find(l =>
      l.slug === slug ||
      (l.team || l.name || '').toLowerCase().includes((teamNameStr.split(' ').pop() || '').toLowerCase())
    );
    if (found) {
      resolvedAts.last30 = found.last30 ?? null;
      resolvedAts.season = found.season ?? null;
      resolvedAts.last7  = found.last7  ?? null;
    }
  }

  // ── Quick pulse from schedule ─────────────────────────────────────────────
  const schedEvents = teamData?.schedule?.events ?? [];
  const recentFinished = schedEvents
    .filter(e => e.isFinal && e.ourScore != null && e.oppScore != null)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const last10 = recentFinished.slice(0, 10);
  const last5  = recentFinished.slice(0, 5);
  const last10W = last10.filter(e => Number(e.ourScore) > Number(e.oppScore)).length;
  const last5W  = last5.filter(e => Number(e.ourScore) > Number(e.oppScore)).length;

  // ── Next line ─────────────────────────────────────────────────────────────
  const nextLine  = teamData?.nextLine ?? null;
  const spread    = nextLine?.consensus?.spread ?? null;
  const ml        = nextLine?.consensus?.moneyline ?? null;
  const nextOpp   = nextLine?.nextEvent?.opponent ?? null;

  // ── Maximus pick ──────────────────────────────────────────────────────────
  const games = data?.odds?.games ?? [];
  let teamPick = null;
  try {
    const picks  = buildMaximusPicks({ games, atsLeaders: data?.atsLeaders ?? { best: [], worst: [] } });
    const all    = [...(picks.atsPicks ?? []), ...(picks.mlPicks ?? [])];
    const tFrag  = name ? name.toLowerCase().split(' ').pop() : '';
    const oFrag  = nextOpp ? nextOpp.toLowerCase().split(' ').pop() : '';
    if (tFrag && oFrag) {
      teamPick = all.find(p => {
        const ht = (p.homeTeam || '').toLowerCase();
        const at = (p.awayTeam || '').toLowerCase();
        return (ht.includes(tFrag) || at.includes(tFrag)) && (ht.includes(oFrag) || at.includes(oFrag));
      }) ?? null;
    }
    if (!teamPick && tFrag) {
      teamPick = all.find(p => {
        const ht = (p.homeTeam || '').toLowerCase();
        const at = (p.awayTeam || '').toLowerCase();
        return ht.includes(tFrag) || at.includes(tFrag);
      }) ?? null;
    }
  } catch { /* ignore */ }

  // ── Derived content ───────────────────────────────────────────────────────

  const heroLines = buildHeroHeadline({
    teamName: name,
    ats: resolvedAts,
    last5Wins: last5W,
    totalLast10: last10.length,
    rank,
    nextLine,
  });

  const signalText = buildSignalText(resolvedAts);

  // ── Data chips (pick best 3) ───────────────────────────────────────────────
  const chipCandidates = [];

  // ATS chip — prefer L30 over season
  const atsP = parseRecord(resolvedAts.last30) ?? parseRecord(resolvedAts.season);
  if (atsP) {
    const window = resolvedAts.last30 ? 'L30' : 'SEASON';
    chipCandidates.push({ label: `ATS ${window}`, value: `${atsP.w}–${atsP.l}` });
  }

  // Next game / spread chip
  if (nextOpp && spread != null) {
    chipCandidates.push({ label: 'NEXT GAME', value: `vs ${nextOpp}  ${fmtSpread(spread)}` });
  } else if (nextOpp) {
    chipCandidates.push({ label: 'NEXT UP', value: `vs ${nextOpp}` });
  } else if (spread != null) {
    chipCandidates.push({ label: 'SPREAD', value: fmtSpread(spread) });
  } else if (ml != null) {
    chipCandidates.push({ label: 'ML', value: ml > 0 ? `+${ml}` : String(ml) });
  }

  // Lean chip
  if (teamPick) {
    const leanLabel = teamPick.pickType === 'ats' ? 'COVER' : 'ML LEAN';
    chipCandidates.push({ label: 'MAXIMUS LEAN', value: leanLabel });
  } else if (last10.length > 0) {
    // Fall back to SU form chip
    chipCandidates.push({ label: `L${last10.length} SU`, value: `${last10W}–${last10.length - last10W}` });
  }

  const displayChips = chipCandidates.slice(0, 3);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className={styles.artboard}
      style={{ '--team-primary': teamPrimary, '--team-secondary': teamSecondary }}
      {...rest}
    >
      {/* Background atmosphere */}
      <div className={styles.bgBase}   aria-hidden="true" />
      <div className={styles.bgGlow}   aria-hidden="true" />
      <div className={styles.bgRay}    aria-hidden="true" />
      <div className={styles.bgNoise}  aria-hidden="true" />

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logoRow}>
          <img
            src="/logo.png"
            alt="Maximus Sports"
            className={styles.brandLogo}
            crossOrigin="anonymous"
          />
          <div className={styles.logoMeta}>
            <span className={styles.brandName}>MAXIMUS SPORTS</span>
            <span className={styles.intelChip}>TEAM INTEL</span>
          </div>
        </div>
        <div className={styles.headerRight}>
          {asOf && <div className={styles.asOf}>As of {asOf}</div>}
          <div className={styles.maxIntel}>MAXIMUM INTELLIGENCE</div>
        </div>
      </header>

      {/* Team logo hero */}
      <div className={styles.logoZone}>
        <div className={styles.logoGlowRing} aria-hidden="true" />
        {slug ? (
          <img
            src={`/logos/${slug}.png`}
            alt={name}
            className={styles.teamLogo}
            crossOrigin="anonymous"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className={styles.logoFallback} />
        )}
      </div>

      {/* Team identity */}
      <div className={styles.identity}>
        <div className={styles.metaRow}>
          {rank != null && <span className={styles.rankPill}>#{rank} AP</span>}
          {conf && <span className={styles.confPill}>{conf}</span>}
          {record && <span className={styles.recordPill}>{record}</span>}
        </div>
        <h1 className={styles.teamName}>
          {name.toUpperCase()}
          {mascotEmoji ? <span className={styles.mascotEmoji}>{mascotEmoji}</span> : null}
        </h1>
        {last10.length > 0 && (
          <div className={styles.formLine}>
            {last10W}–{last10.length - last10W} L{last10.length}
            {last5.length === 5 ? `  ·  ${last5W}–${5 - last5W} L5` : ''}
          </div>
        )}
      </div>

      {/* Editorial headline */}
      <div className={styles.headlineZone}>
        <div className={styles.headlineDivider} />
        <h2 className={styles.headline}>
          {heroLines.split('\n').map((line, i) => (
            <span key={i} className={styles.headlineLine}>{line}</span>
          ))}
        </h2>
        <div className={styles.headlineDividerBottom} />
      </div>

      {/* Data chips */}
      {displayChips.length > 0 && (
        <div className={styles.dataGrid}>
          {displayChips.map((chip, i) => (
            <div key={i} className={styles.dataChip}>
              <div className={styles.chipLabel}>{chip.label}</div>
              <div className={styles.chipValue}>{chip.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Market signal line */}
      {signalText && (
        <div className={styles.signalLine}>
          <span className={styles.signalArrow}>↗</span> {signalText}
        </div>
      )}

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
