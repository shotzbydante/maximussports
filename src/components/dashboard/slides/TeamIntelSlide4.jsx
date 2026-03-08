/**
 * TeamIntelSlide4 — Instagram Hero Summary · Slide 1 of Team Intel
 *
 * Cinematic, premium, information-dense.
 * Fully custom artboard — does not use SlideShell.
 *
 * Content hierarchy:
 *   1. Header        — Maximus branding + timestamp
 *   2. Logo hero     — team logo with animated glow
 *   3. Identity      — rank · champ odds · conf · meta chips
 *   4. Record line   — overall · conference · last-10
 *   5. Headline      — buildHeroNarrative() — context-aware storyline engine
 *   6. Quick intel   — 1-line synthesis from snapshot.personality
 *   7. ATS grid      — ATS L7 / ATS L30 / ATS SZN chips
 *   8. Schedule      — LAST game result → NEXT game (spread · total · date)
 *   9. Lean line     — Maximus pick or market signal fallback
 *  10. News intel    — INTEL bullets from team news feed
 *  11. Footer        — URL + disclaimer
 */

import styles from './TeamIntelSlide4.module.css';
import { getTeamColors } from '../../../utils/teamColors';
import { buildMaximusPicks, confidenceLabel } from '../../../utils/maximusPicksModel';

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

function fmtOdds(american) {
  if (american == null || typeof american !== 'number') return null;
  return american > 0 ? `+${american}` : String(american);
}

/**
 * Extract conference W-L record from ESPN team.record.items array.
 * ESPN API typically stores: items[0]=overall, items[1]=conference.
 * We also try type/name matching for robustness.
 */
function extractConferenceRecord(teamObj) {
  const items = teamObj?.record?.items;
  if (!items?.length) return null;
  // Prefer explicit type/name match
  const confItem = items.find(i => {
    const t = (i.type || i.name || '').toLowerCase();
    return t.includes('conf') || t === 'vsconf' || t === 'vs-conf' || t === 'conference';
  });
  if (confItem?.summary) return confItem.summary;
  // ESPN places conference record at index 1 when overall is at index 0
  if (items.length >= 2) {
    const s = items[1]?.summary;
    // Sanity-check: must look like a record (digits-digits)
    if (s && /^\d+-\d+$/.test(s.trim())) return s;
  }
  return null;
}

// ─── buildHeroNarrative ────────────────────────────────────────────────────────
/**
 * Context-aware cinematic headline engine.
 *
 * Analyses all available signals and maps to a storyline category.
 * Returns a 2-line `\n`-separated string.
 * Each line ≤ 28 characters · all caps · no emojis · cinematic tone.
 *
 * STORYLINE PRIORITY
 *  1  undefeated_run      — overall record has 0 losses (≥10 wins)
 *  2  ats_accelerating    — L7 cover rate significantly higher than L30
 *  3  ats_heater          — L7 or L30 ATS ≥ 65%
 *  4  elite_contender     — top-5 ranked + hot form
 *  5  surging_team        — 70%+ SU wins in last 10
 *  6  underdog_value      — getting points + solid ATS
 *  7  market_adjusting    — good season ATS but recent cooling (market corrected)
 *  8  cold_against_spread — L7 or L30 ATS ≤ 38%
 *  9  bubble_watch        — unranked but competitive, postseason pressure
 * 10  standard_analysis   — fallback
 *
 * ROOT CAUSE OF PREVIOUS WEAK HEADLINES:
 *   The old buildHeroHeadline() evaluated conditions with partial short-circuit
 *   logic and returned team-name strings like "Nebraska.\nFull intel inside."
 *   or "Value still\nin this number." by hitting `marketBehind` from season ATS
 *   while ignoring the L7/L30 cooling trend. The new function evaluates the
 *   full signal set in strict priority order before choosing a storyline.
 */
function buildHeroNarrative({ ats, overallRecord, last10W, last10Total, rank, nextLine }) {
  const l7  = parseRecord(ats?.last7);
  const l30 = parseRecord(ats?.last30);
  const ssn = parseRecord(ats?.season);

  // Spread context
  const spreadVal  = nextLine?.consensus?.spread != null ? parseFloat(nextLine.consensus.spread) : null;
  const isUnderdog = spreadVal != null && spreadVal > 3;

  // Overall record
  const recP       = parseRecord(overallRecord);
  const isUndefeated = recP && recP.l === 0 && recP.w >= 10;

  // Last-10 form
  const last10Pct  = last10Total > 0 ? last10W / last10Total : null;
  const isSurging  = last10Pct != null && last10Pct >= 0.70 && last10Total >= 7;

  // ATS signals
  const atsAccel  = l7 != null && l30 != null && l7.pct > l30.pct + 0.10 && l7.pct >= 0.60;
  const atsOnFire = (l7 && l7.pct >= 0.70) && (l30 && l30.pct >= 0.62);
  const atsHeater = (l7 && l7.pct >= 0.64) || (l30 && l30.pct >= 0.64);
  const atsCold   = (l7 && l7.pct <= 0.38) || (l30 && l30.pct <= 0.38);
  // Market corrected: season was strong but recent windows have cooled
  const marketCorrected = ssn && l30 && ssn.pct >= 0.58 && l30.pct <= 0.45;

  // Tier signals
  const isElite       = rank != null && rank <= 5;
  const isRanked      = rank != null && rank <= 25;
  const isUnderdogVal = isUnderdog && (atsHeater || (l30 && l30.pct >= 0.55));
  // Bubble: unranked team with a .500–.580 overall win rate
  const isBubble      = !isRanked && recP != null && recP.pct >= 0.50 && recP.pct <= 0.58;

  // ── Storyline → headline copy ──────────────────────────────────────────────
  // All lines ≤ 28 chars, ALL CAPS, no emojis
  if (isUndefeated)                   return `STILL\nUNBEATEN.`;
  if (atsAccel)                        return `THE NUMBER\nIS MOVING.`;
  if (atsOnFire || atsHeater)         return `MARKET STILL\nHASN'T CAUGHT UP.`;
  if (isElite && isSurging)           return `A TITLE RUN\nIS BUILDING.`;
  if (isSurging)                       return `MOMENTUM\nIS REAL.`;
  if (isUnderdogVal)                  return `BOOKS STILL\nUNDERPRICING THEM.`;
  if (marketCorrected || atsCold)     return `THE MARKET\nHAS ADJUSTED.`;
  if (isBubble)                        return `TOURNAMENT\nPRESSURE RISING.`;
  // standard_analysis — generic but still cinematic
  if (ssn && ssn.pct >= 0.58)         return `VALUE STILL\nIN THE NUMBER.`;
  return `WATCH THIS\nNUMBER CLOSELY.`;
}

/**
 * One-line market signal — compact version of Slide 2's signal text.
 * Used as lean fallback when no Maximus pick is available.
 */
function buildSignalText(ats) {
  const l7  = parseRecord(ats?.last7);
  const l30 = parseRecord(ats?.last30);
  const ssn = parseRecord(ats?.season);
  const primary = l7 ?? l30 ?? ssn;
  if (!primary) return null;

  const pct      = Math.round(primary.pct * 100);
  const trending = l7 && l30
    ? l7.pct > l30.pct + 0.08 ? 'up' : l7.pct < l30.pct - 0.08 ? 'down' : 'flat'
    : 'flat';

  if (primary.pct >= 0.68) return trending === 'up'
    ? `Cover trend accelerating — market behind.`
    : `Covering at ${pct}% — market still adjusting.`;
  if (primary.pct >= 0.60) return trending === 'up'
    ? `ATS rate climbing toward 60% — edge building.`
    : `Holding firm at ${pct}% ATS. Consistent value.`;
  if (primary.pct >= 0.52) return `Fairly priced right now — no clear edge either way.`;
  if (primary.pct >= 0.45) return trending === 'down'
    ? `ATS cooling off — ${pct}% and sliding.`
    : `${pct}% ATS — around break-even territory.`;
  return `Struggling ATS at ${pct}%. Value may be on the other side.`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TeamIntelSlide4({ data, teamData, asOf, ...rest }) {
  const team       = teamData?.team ?? {};
  const name       = team.displayName || team.name || data?.selectedTeamName || '—';
  const slug       = team.slug || data?.selectedTeamSlug || null;
  const rank       = teamData?.rank ?? null;
  const titleOdds  = teamData?.titleOdds ?? null;

  const { primary: teamPrimary, secondary: teamSecondary } = getTeamColors(slug);

  const conf = team.conference || data?.selectedTeamConf || null;

  // ── Records ────────────────────────────────────────────────────────────────
  // Overall: items[0] or recordSummary
  const overallRecord = team.record?.items?.[0]?.summary
    || team.recordSummary
    || (typeof team.record === 'string' ? team.record : null)
    || null;

  // Conference: look for vsConf/conference type in items, fallback to items[1]
  const confRecord = extractConferenceRecord(team);

  // ── ATS — use teamData first, fall back to atsLeaders global ──────────────
  const ats = teamData?.ats ?? {};
  const resolvedAts = { ...ats };
  if (!ats.last30 && !ats.season) {
    const leaders  = [...(data?.atsLeaders?.best ?? []), ...(data?.atsLeaders?.worst ?? [])];
    const nameFrag = (name.split(' ').pop() || '').toLowerCase();
    const found    = leaders.find(l =>
      l.slug === slug || (l.team || l.name || '').toLowerCase().includes(nameFrag)
    );
    if (found) {
      resolvedAts.last30 = found.last30 ?? null;
      resolvedAts.season = found.season ?? null;
      resolvedAts.last7  = found.last7  ?? null;
    }
  }

  const l7P  = parseRecord(resolvedAts.last7);
  const l30P = parseRecord(resolvedAts.last30);
  const ssnP = parseRecord(resolvedAts.season);

  // ── Last-10 SU form from schedule ─────────────────────────────────────────
  const schedEvents = teamData?.schedule?.events ?? [];
  const recentFinished = schedEvents
    .filter(e => e.isFinal && e.ourScore != null && e.oppScore != null)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const last10  = recentFinished.slice(0, 10);
  const last10W = last10.filter(e => Number(e.ourScore) > Number(e.oppScore)).length;

  // ── Next game from odds API; schedule fallback ─────────────────────────────
  const nextLine  = teamData?.nextLine ?? null;
  const spread    = nextLine?.consensus?.spread ?? null;
  const ml        = nextLine?.consensus?.moneyline ?? null;
  const total     = nextLine?.consensus?.total ?? null;
  let nextOpp     = nextLine?.nextEvent?.opponent ?? null;
  let nextTime    = nextLine?.nextEvent?.commenceTime
    ? new Date(nextLine.nextEvent.commenceTime).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles',
      })
    : null;

  if (!nextOpp) {
    const upcoming = schedEvents.find(e => {
      const st = (e.status?.type?.name || e.status?.name || '').toLowerCase();
      return st !== 'final' && st !== 'final-ot' && st !== 'canceled';
    });
    if (upcoming) {
      const comps = upcoming.competitions?.[0]?.competitors ?? [];
      const me    = comps.find(c => c.team?.slug === slug);
      const opp   = comps.find(c => c !== me) ?? comps[0];
      nextOpp  = opp?.team?.displayName || opp?.team?.name || null;
      if (!nextTime && upcoming.date) {
        nextTime = new Date(upcoming.date).toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles',
        });
      }
    }
  }

  // ── Last game result ───────────────────────────────────────────────────────
  const lastGame = recentFinished[0] ?? null;
  let lastOpp    = null;
  let lastResult = null;
  if (lastGame) {
    const comps    = lastGame.competitions?.[0]?.competitors ?? [];
    const nameFrag = (name.split(' ').pop() || '').toLowerCase();
    const me       = comps.find(c =>
      c.team?.slug === slug || (c.team?.name || '').toLowerCase().includes(nameFrag)
    );
    const opp = comps.find(c => c !== me) ?? (comps.length > 1 ? comps[1] : comps[0]);
    if (opp?.team) lastOpp = opp.team.displayName || opp.team.name || null;
    const won  = Number(lastGame.ourScore) > Number(lastGame.oppScore);
    lastResult = { won, label: `${won ? 'W' : 'L'} ${lastGame.ourScore}–${lastGame.oppScore}` };
  }

  // ── Maximus pick — scoped to this team's next matchup ─────────────────────
  const games = data?.odds?.games ?? [];
  let teamPick = null;
  try {
    const picks = buildMaximusPicks({ games, atsLeaders: data?.atsLeaders ?? { best: [], worst: [] } });
    const all   = [...(picks.atsPicks ?? []), ...(picks.mlPicks ?? [])];
    const tFrag = name ? name.toLowerCase().split(' ').pop() : '';
    const oFrag = nextOpp ? nextOpp.toLowerCase().split(' ').pop() : '';
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

  // Hero narrative — full storyline-detection headline engine
  const heroLines = buildHeroNarrative({
    ats:           resolvedAts,
    overallRecord,
    last10W,
    last10Total:   last10.length,
    rank,
    nextLine,
  });

  // Quick intel — snapshot.personality is quality-curated by buildTeamSnapshot
  const quickIntel = teamData?.snapshot?.personality || buildSignalText(resolvedAts) || null;

  const signalText = buildSignalText(resolvedAts);

  const titleOddsLabel = fmtOdds(titleOdds);

  // ATS windows — updated labels per spec: "ATS L7 / ATS L30 / ATS SZN"
  const atsWindows = [
    { label: 'ATS L7',  parsed: l7P  },
    { label: 'ATS L30', parsed: l30P },
    { label: 'ATS SZN', parsed: ssnP },
  ].filter(w => w.parsed != null);

  // Record display line: "18–9 overall · 8–6 Big Ten · 5–5 last 10"
  const recordLineParts = [];
  if (overallRecord) recordLineParts.push(`${overallRecord.replace('-', '–')} overall`);
  if (confRecord)    recordLineParts.push(`${confRecord.replace('-', '–')} ${conf || 'conf.'}`);
  if (last10.length >= 5) recordLineParts.push(`${last10W}–${last10.length - last10W} last ${last10.length}`);
  const recordLine = recordLineParts.length > 0 ? recordLineParts.join(' · ') : null;

  const hasSchedule = nextOpp || lastGame;

  // News intel — prefer last-7-day news, then all teamNews, trim to 3 items
  const rawNews = teamData?.last7News?.length > 0
    ? teamData.last7News
    : (teamData?.teamNews ?? []);
  const newsItems = rawNews
    .slice(0, 3)
    .map(n => {
      const raw = (n.headline || n.title || '').trim();
      return raw.length > 80 ? raw.slice(0, 79) + '…' : raw;
    })
    .filter(Boolean);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className={styles.artboard}
      style={{ '--team-primary': teamPrimary, '--team-secondary': teamSecondary }}
      {...rest}
    >
      {/* Background atmosphere — untouched */}
      <div className={styles.bgBase}  aria-hidden="true" />
      <div className={styles.bgGlow}  aria-hidden="true" />
      <div className={styles.bgRay}   aria-hidden="true" />
      <div className={styles.bgNoise} aria-hidden="true" />

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logoRow}>
          <img src="/logo.png" alt="Maximus Sports" className={styles.brandLogo} crossOrigin="anonymous" />
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

      {/* Team logo hero — untouched */}
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
          {rank != null           && <span className={styles.rankPill}>#{rank} AP</span>}
          {titleOddsLabel != null && <span className={styles.titleOddsPill}>🏆 {titleOddsLabel}</span>}
          {conf                   && <span className={styles.confPill}>{conf}</span>}
        </div>
        <h1 className={styles.teamName}>{name.toUpperCase()}</h1>
        {/* Structured record line: overall · conference · last-10 */}
        {recordLine && (
          <div className={styles.formLine}>{recordLine}</div>
        )}
      </div>

      {/* Editorial headline — powered by buildHeroNarrative */}
      <div className={styles.headlineZone}>
        <div className={styles.headlineDivider} />
        <h2 className={styles.headline}>
          {heroLines.split('\n').map((line, i) => (
            <span key={i} className={styles.headlineLine}>{line}</span>
          ))}
        </h2>
        <div className={styles.headlineDividerBottom} />
      </div>

      {/* Quick intel — 1-line synthesis */}
      {quickIntel && (
        <div className={styles.quickIntel}>{quickIntel}</div>
      )}

      {/* ATS grid — updated labels */}
      {atsWindows.length > 0 && (
        <div className={styles.atsGrid}>
          {atsWindows.map((w, i) => (
            <div key={i} className={styles.atsChip}>
              <div className={styles.atsLabel}>{w.label}</div>
              <div className={styles.atsValue}>{w.parsed.w}–{w.parsed.l}</div>
              <div className={styles.atsPct}>{Math.round(w.parsed.pct * 100)}%</div>
            </div>
          ))}
        </div>
      )}

      {/* Schedule module — LAST first, then NEXT (per spec) */}
      {hasSchedule && (
        <div className={styles.scheduleModule}>
          {/* LAST game result */}
          {lastResult && (
            <div className={styles.schedRow}>
              <span className={styles.schedBadge} data-type={lastResult.won ? 'win' : 'loss'}>LAST</span>
              <span className={styles.schedContent}>
                <span className={`${styles.schedResultLabel} ${lastResult.won ? styles.schedWin : styles.schedLoss}`}>
                  {lastResult.label}
                </span>
                {lastOpp && <span className={styles.schedOppSmall}>vs {lastOpp}</span>}
              </span>
            </div>
          )}
          {/* NEXT game — with spread, total, and date */}
          {nextOpp && (
            <div className={styles.schedRow}>
              <span className={styles.schedBadge} data-type="next">NEXT</span>
              <span className={styles.schedContent}>
                <span className={styles.schedOpp}>vs {nextOpp}</span>
                {spread != null && (
                  <span className={styles.schedLine}>{fmtSpread(spread)}</span>
                )}
                {spread == null && ml != null && (
                  <span className={styles.schedLine}>{ml > 0 ? `+${ml}` : ml} ML</span>
                )}
                {total != null && (
                  <span className={styles.schedLine}>{total}o/u</span>
                )}
                {!spread && !ml && !total && (
                  <span className={styles.schedTime}>Line opening soon</span>
                )}
                {nextTime && <span className={styles.schedTime}>{nextTime}</span>}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Lean / pick line */}
      {(teamPick || signalText) && (
        <div className={styles.leanLine}>
          <span className={styles.leanArrow}>↗</span>
          {teamPick ? (
            <>
              <span className={styles.leanLabel}>LEAN:</span>
              <span className={styles.leanValue}> {teamPick.pickLine}</span>
              <span className={styles.leanConf}> · {confidenceLabel(teamPick.confidence)} confidence</span>
            </>
          ) : (
            <span className={styles.leanText}>{signalText || 'Market signal still developing.'}</span>
          )}
        </div>
      )}

      {/* News INTEL module — up to 3 headlines, no emojis, no source names */}
      {newsItems.length > 0 && (
        <div className={styles.intelModule}>
          <div className={styles.intelTitle}>INTEL</div>
          <ul className={styles.intelList}>
            {newsItems.map((item, i) => (
              <li key={i} className={styles.intelItem}>{item}</li>
            ))}
          </ul>
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
