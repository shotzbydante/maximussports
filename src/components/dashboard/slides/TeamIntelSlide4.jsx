/**
 * TeamIntelSlide4 — Instagram Hero Summary · Slide 1 of Team Intel
 *
 * Cinematic, premium, information-dense.
 * Fully custom artboard — does not use SlideShell.
 *
 * Content hierarchy:
 *   1. Header       — Maximus branding + timestamp
 *   2. Logo hero    — team logo with animated glow
 *   3. Identity     — rank · champ odds · conf · record · form
 *   4. Headline     — editorial hero statement (data-driven, 2 lines max)
 *   5. Quick intel  — 1-line synthesis from snapshot.personality
 *   6. ATS row      — L7 / L30 / Season compact chips
 *   7. Schedule     — Next game (opp · spread · date) + Last result
 *   8. Lean line    — Maximus pick or market signal
 *   9. Footer       — URL + disclaimer
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
 * Derive a cinematic two-line editorial headline from team data.
 * Priority: undefeated run → ATS fire → elite+underpriced → surging → hot streak → generic
 */
function buildHeroHeadline({ teamName, ats, last5Wins, last10Len, rank, nextLine }) {
  const shortName = (teamName || '').split(' ').slice(0, -1).join(' ') || (teamName || '').split(' ')[0] || 'This team';

  const l7  = parseRecord(ats?.last7);
  const l30 = parseRecord(ats?.last30);
  const ssn = parseRecord(ats?.season);

  const trending = l7 && l30
    ? l7.pct > l30.pct + 0.08 ? 'up' : l7.pct < l30.pct - 0.08 ? 'down' : 'flat'
    : 'flat';

  const spreadVal = nextLine?.consensus?.spread != null ? parseFloat(nextLine.consensus.spread) : null;
  const isUnderdog = spreadVal != null && spreadVal > 3;
  const isBigFav   = spreadVal != null && spreadVal < -10;

  const perfectRun   = last10Len >= 8 && (last5Wins ?? 0) === 5;
  const atsOnFire    = l7 && l7.pct >= 0.72 && l30 && l30.pct >= 0.65;
  const atsHeater    = (l7 && l7.pct >= 0.65) || (l30 && l30.pct >= 0.65);
  const marketBehind = (l30 && l30.pct >= 0.62) || (ssn && ssn.pct >= 0.60);
  const isSurging    = (last5Wins ?? 0) >= 4;
  const isElite      = rank != null && rank <= 5;
  const isRankedHot  = rank != null && rank <= 15 && isSurging;

  if (perfectRun)                          return `Perfect run.\nAnd still covering.`;
  if (atsOnFire && trending === 'up')      return `Market still\ncatching up.`;
  if (isElite && atsHeater)               return `${shortName}\nlooks underpriced.`;
  if (isRankedHot && marketBehind)        return `${shortName} is\nsurging.`;
  if (atsHeater && marketBehind && isUnderdog) return `Quiet value\non the underdog.`;
  if (atsOnFire)                           return `Quiet ATS heater\nin progress.`;
  if (atsHeater && trending === 'up')      return `Cover rate\naccelerating fast.`;
  if (isBigFav && isSurging)              return `Dominant.\nWatch the number.`;
  if (isSurging && atsHeater)             return `${shortName}\nis rolling.`;
  if (isSurging)                           return `Playing their\nbest ball.`;
  if (marketBehind)                        return `Value still\nin this number.`;
  if (isElite)                             return `Elite team.\nFull intel inside.`;
  if (ssn && ssn.pct <= 0.42)            return `Rough patch ATS.\nOther side in focus.`;
  return `${shortName}.\nFull intel inside.`;
}

/**
 * One-line market signal — compact version of Slide 2's signal text.
 * Shown as the lean line when no Maximus pick is available.
 */
function buildSignalText(ats) {
  const l7  = parseRecord(ats?.last7);
  const l30 = parseRecord(ats?.last30);
  const ssn = parseRecord(ats?.season);
  const primary = l7 ?? l30 ?? ssn;
  if (!primary) return null;

  const pct = Math.round(primary.pct * 100);
  const trending = l7 && l30
    ? l7.pct > l30.pct + 0.08 ? 'up' : l7.pct < l30.pct - 0.08 ? 'down' : 'flat'
    : 'flat';

  if (primary.pct >= 0.68)  return trending === 'up' ? `Cover trend accelerating — market behind.` : `Covering at ${pct}% — market still adjusting.`;
  if (primary.pct >= 0.60)  return trending === 'up' ? `ATS rate climbing toward 60% — edge building.` : `Holding firm at ${pct}% ATS. Consistent value.`;
  if (primary.pct >= 0.52)  return `Fairly priced right now — no screaming edge either way.`;
  if (primary.pct >= 0.45)  return trending === 'down' ? `ATS cooling off — ${pct}% and sliding.` : `${pct}% ATS — around break-even.`;
  return `Struggling ATS at ${pct}%. Value may be on the other side.`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TeamIntelSlide4({ data, teamData, asOf, ...rest }) {
  const team = teamData?.team ?? {};
  const name = team.displayName || team.name || data?.selectedTeamName || '—';
  const slug = team.slug || data?.selectedTeamSlug || null;
  const rank = teamData?.rank ?? null;
  const titleOdds = teamData?.titleOdds ?? null;

  const { primary: teamPrimary, secondary: teamSecondary } = getTeamColors(slug);

  const record = team.record?.items?.[0]?.summary || team.recordSummary || team.record || null;
  const conf   = team.conference || data?.selectedTeamConf || null;

  // ── ATS — use teamData first, fall back to atsLeaders global data ──────────
  const ats = teamData?.ats ?? {};
  const resolvedAts = { ...ats };
  if (!ats.last30 && !ats.season) {
    const leaders = [...(data?.atsLeaders?.best ?? []), ...(data?.atsLeaders?.worst ?? [])];
    const nameFrag = (name.split(' ').pop() || '').toLowerCase();
    const found = leaders.find(l =>
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

  // ── Recent game form from schedule ────────────────────────────────────────
  const schedEvents = teamData?.schedule?.events ?? [];
  const recentFinished = schedEvents
    .filter(e => e.isFinal && e.ourScore != null && e.oppScore != null)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const last10 = recentFinished.slice(0, 10);
  const last5  = recentFinished.slice(0, 5);
  const last10W = last10.filter(e => Number(e.ourScore) > Number(e.oppScore)).length;
  const last5W  = last5.filter(e => Number(e.ourScore) > Number(e.oppScore)).length;

  // ── Next game from nextLine (odds API) ─────────────────────────────────────
  const nextLine = teamData?.nextLine ?? null;
  const spread   = nextLine?.consensus?.spread ?? null;
  const ml       = nextLine?.consensus?.moneyline ?? null;
  let nextOpp    = nextLine?.nextEvent?.opponent ?? null;
  let nextTime   = nextLine?.nextEvent?.commenceTime
    ? new Date(nextLine.nextEvent.commenceTime).toLocaleDateString('en-US', {
        weekday: 'short', month: 'numeric', day: 'numeric', timeZone: 'America/Los_Angeles',
      })
    : null;

  // Schedule fallback for upcoming opponent if nextLine hasn't resolved yet
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
          weekday: 'short', month: 'numeric', day: 'numeric', timeZone: 'America/Los_Angeles',
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
    const me       = comps.find(c => c.team?.slug === slug || (c.team?.name || '').toLowerCase().includes(nameFrag));
    const opp      = comps.find(c => c !== me) ?? (comps.length > 1 ? comps[1] : comps[0]);
    if (opp?.team)  lastOpp = opp.team.displayName || opp.team.name || null;
    const won = Number(lastGame.ourScore) > Number(lastGame.oppScore);
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
  const heroLines = buildHeroHeadline({
    teamName: name,
    ats: resolvedAts,
    last5Wins: last5W,
    last10Len: last10.length,
    rank,
    nextLine,
  });

  // Quick intel — use snapshot personality (already quality-curated by buildTeamSnapshot)
  // Falls back to buildSignalText if snapshot not populated
  const quickIntel = teamData?.snapshot?.personality || buildSignalText(resolvedAts) || null;

  const signalText = buildSignalText(resolvedAts);

  const titleOddsLabel = fmtOdds(titleOdds);

  // ATS display windows — only show those with actual data
  const atsWindows = [
    { label: 'L7',  parsed: l7P  },
    { label: 'L30', parsed: l30P },
    { label: 'SZN', parsed: ssnP },
  ].filter(w => w.parsed != null);

  const hasSchedule = nextOpp || lastGame;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className={styles.artboard}
      style={{ '--team-primary': teamPrimary, '--team-secondary': teamSecondary }}
      {...rest}
    >
      {/* Background atmosphere */}
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
          {rank != null           && <span className={styles.rankPill}>#{rank} AP</span>}
          {titleOddsLabel != null && <span className={styles.titleOddsPill}>🏆 {titleOddsLabel}</span>}
          {conf                   && <span className={styles.confPill}>{conf}</span>}
          {record                 && <span className={styles.recordPill}>{record}</span>}
        </div>
        <h1 className={styles.teamName}>{name.toUpperCase()}</h1>
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

      {/* Quick intel — 1-line synthesis */}
      {quickIntel && (
        <div className={styles.quickIntel}>{quickIntel}</div>
      )}

      {/* ATS compact row */}
      {atsWindows.length > 0 && (
        <div className={styles.atsGrid}>
          {atsWindows.map((w, i) => (
            <div key={i} className={styles.atsChip}>
              <div className={styles.atsLabel}>{w.label}</div>
              <div className={styles.atsValue}>{w.parsed.w}–{w.parsed.l}</div>
              <div className={styles.atsPct}>{Math.round(w.parsed.pct * 100)}%</div>
            </div>
          ))}
          {atsWindows.length < 3 && (
            <div className={styles.atsLabel} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px', fontSize: 13, opacity: 0.3 }}>
              ATS vs the number
            </div>
          )}
        </div>
      )}

      {/* Schedule module — next game + last result */}
      {hasSchedule && (
        <div className={styles.scheduleModule}>
          {nextOpp && (
            <div className={styles.schedRow}>
              <span className={styles.schedBadge} data-type="next">NEXT</span>
              <span className={styles.schedContent}>
                <span className={styles.schedOpp}>vs {nextOpp}</span>
                {spread != null
                  ? <span className={styles.schedLine}>{fmtSpread(spread)}</span>
                  : ml != null
                    ? <span className={styles.schedLine}>{ml > 0 ? `+${ml}` : ml} ML</span>
                    : null
                }
                {nextTime && <span className={styles.schedTime}>{nextTime}</span>}
              </span>
            </div>
          )}
          {lastResult && (
            <div className={styles.schedRow}>
              <span className={styles.schedBadge} data-type={lastResult.won ? 'win' : 'loss'}>LAST</span>
              <span className={styles.schedContent}>
                <span className={`${styles.schedResultLabel} ${lastResult.won ? styles.schedWin : styles.schedLoss}`}>
                  {lastResult.label}
                </span>
                {lastOpp && <span className={styles.schedOppSmall}> vs {lastOpp}</span>}
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
            <span className={styles.leanText}>{signalText}</span>
          )}
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
