/**
 * MlbTeamIntelSlide — Instagram Hero Summary for MLB Team Intel
 *
 * Cinematic, premium, information-dense — 1080×1350 portrait.
 * Fully custom artboard — does not use SlideShell.
 *
 * Content hierarchy (v3):
 *   1. Header        — Maximus branding + timestamp
 *   2. Logo hero     — team logo with animated glow
 *   3. Identity      — chips + team name + record/L10/streak
 *   4. Headline      — topical narrative (form, division, storyline)
 *   5. Subtext       — editorial sentence supporting headline
 *   6. Stat band     — Projected Wins / Range / WS Odds / Confidence
 *   7. Intel brief   — TEAM INTEL BRIEFING: 6 rich bullets with opponent logos
 *   8. Footer        — URL + disclaimer
 *
 * Data: shared buildMlbTeamIntelBriefing() → same source as team page
 */

import { useState } from 'react';
import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
import { getTeamProjection } from '../../../data/mlb/seasonModel';
import {
  buildMlbTeamIntelBriefing,
  extractTeamContext,
} from '../../../data/mlb/buildTeamIntelBriefing';
import styles from './MlbTeamIntelSlide.module.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtOdds(american) {
  if (american == null || typeof american !== 'number') return null;
  return american > 0 ? `+${american}` : String(american);
}

function ordinal(n) {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

// ─── MLB Team Colors ──────────────────────────────────────────────────────

const MLB_TEAM_COLORS = {
  nyy: { primary: '#003087', secondary: '#0C2340' },
  bos: { primary: '#BD3039', secondary: '#0C2340' },
  tor: { primary: '#134A8E', secondary: '#1D2D5C' },
  tb:  { primary: '#092C5C', secondary: '#8FBCE6' },
  bal: { primary: '#DF4601', secondary: '#27251F' },
  cle: { primary: '#00385D', secondary: '#E31937' },
  min: { primary: '#002B5C', secondary: '#D31145' },
  det: { primary: '#0C2340', secondary: '#FA4616' },
  cws: { primary: '#C4CED4', secondary: '#27251F' },
  kc:  { primary: '#004687', secondary: '#BD9B60' },
  hou: { primary: '#EB6E1F', secondary: '#002D62' },
  sea: { primary: '#0C2C56', secondary: '#005C5C' },
  tex: { primary: '#003278', secondary: '#C0111F' },
  laa: { primary: '#BA0021', secondary: '#862633' },
  oak: { primary: '#003831', secondary: '#EFB21E' },
  atl: { primary: '#CE1141', secondary: '#13274F' },
  nym: { primary: '#002D72', secondary: '#FF5910' },
  phi: { primary: '#E81828', secondary: '#002D72' },
  mia: { primary: '#00A3E0', secondary: '#EF3340' },
  wsh: { primary: '#AB0003', secondary: '#14225A' },
  chc: { primary: '#0E3386', secondary: '#CC3433' },
  mil: { primary: '#FFC52F', secondary: '#12284B' },
  stl: { primary: '#C41E3A', secondary: '#0C2340' },
  pit: { primary: '#FDB827', secondary: '#27251F' },
  cin: { primary: '#C6011F', secondary: '#000000' },
  lad: { primary: '#005A9C', secondary: '#EF3E42' },
  sd:  { primary: '#2F241D', secondary: '#FFC425' },
  sf:  { primary: '#FD5A1E', secondary: '#27251F' },
  ari: { primary: '#A71930', secondary: '#E3D4AD' },
  col: { primary: '#33006F', secondary: '#C4CED4' },
};

function getMlbTeamColors(slug) {
  return MLB_TEAM_COLORS[slug] || { primary: '#DC143C', secondary: '#1a0508' };
}

// ─── Team Logo Hero ──────────────────────────────────────────────────────────

function TeamLogoHero({ slug, name }) {
  const [failed, setFailed] = useState(false);
  const url = getMlbEspnLogoUrl(slug);
  const abbrev = slug?.toUpperCase()?.slice(0, 3) || '';
  const initials = (name || '').split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase();

  console.log('[MLB_TEAM_LOGO_RESOLUTION]', {
    team: name, abbrev, slug, resolvedLogo: url, fallbackUsed: failed || !url,
  });

  if (failed || !url) {
    return (
      <div className={styles.logoFallbackBadge}>
        <span className={styles.logoFallbackText}>{abbrev || initials}</span>
      </div>
    );
  }

  return (
    <img src={url} alt={name} className={styles.teamLogo}
      width={140} height={140}
      loading="eager"
      decoding="sync"
      crossOrigin="anonymous"
      data-fallback-text={abbrev || initials}
      data-team-slug={slug}
      onError={() => setFailed(true)} />
  );
}

// ─── Inline Opponent Logo (for briefing items) ──────────────────────────────

function OppLogo({ slug }) {
  const [failed, setFailed] = useState(false);
  if (!slug || failed) return null;
  const url = getMlbEspnLogoUrl(slug);
  if (!url) return null;
  const abbr = slug?.toUpperCase()?.slice(0, 3) || '';
  return (
    <img src={url} alt="" className={styles.oppLogo}
      width={24} height={24}
      loading="eager"
      decoding="sync"
      crossOrigin="anonymous"
      data-fallback-text={abbr}
      data-team-slug={slug}
      onError={() => setFailed(true)} />
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function MlbTeamIntelSlide({ data, teamData, asOf, options = {}, ...rest }) {
  const team = teamData?.team ?? options?.mlbTeam ?? {};
  const name = team.name || team.displayName || data?.selectedTeamName || '\u2014';
  const slug = team.slug || data?.selectedTeamSlug || null;

  // Team colors
  const { primary: teamPrimary, secondary: teamSecondary } = getMlbTeamColors(slug);

  // Season intelligence
  const projection = slug ? getTeamProjection(slug) : null;
  const champOdds = data?.mlbChampOdds ?? {};
  const oddsData = champOdds?.[slug];
  const wsOdds = oddsData?.bestChanceAmerican ?? oddsData?.american ?? null;

  // Division & record — prefer ESPN standings when available
  const division = team.division || projection?.division || '';
  const standings = data?.mlbStandings ?? {};
  const teamStanding = slug ? standings[slug] : null;
  const record = teamStanding?.record
    || team.record?.items?.[0]?.summary
    || team.recordSummary
    || (typeof team.record === 'string' ? team.record : null)
    || null;

  // Live team context
  const liveGames = data?.mlbLiveGames ?? [];
  const teamContext = extractTeamContext(liveGames, slug);

  // News headlines
  const rawNews = teamData?.last7News?.length > 0
    ? teamData.last7News
    : (teamData?.teamNews ?? []);

  // ═══ SHARED INTEL BRIEFING — same source as team page ═══
  const briefing = buildMlbTeamIntelBriefing({
    slug,
    teamName: name,
    division,
    record,
    projection,
    teamContext,
    newsHeadlines: rawNews,
    nextLine: teamData?.nextLine ?? null,
    standings: teamStanding,
    mlbLeaders: data?.mlbLeaders ?? null,
  });

  // ── Stat band ──
  const statBand = [];
  if (projection) {
    statBand.push({ label: 'MAXIMUS MODEL PROJECTED WINS', value: String(projection.projectedWins) });
    statBand.push({ label: 'RANGE', value: `${projection.floor}\u2013${projection.ceiling}` });
    if (wsOdds != null) {
      statBand.push({ label: 'WS ODDS', value: fmtOdds(wsOdds) || '\u2014' });
    }
    if (projection.confidenceTier) {
      statBand.push({ label: 'CONFIDENCE', value: projection.confidenceTier });
    }
  }

  // Identity chips
  const chips = [];
  if (projection?.projectedWins) chips.push({ text: `Maximus Model: ${projection.projectedWins} W`, type: 'stat' });
  if (wsOdds != null) chips.push({ text: `\uD83C\uDFC6 ${fmtOdds(wsOdds)}`, type: 'odds' });
  if (division) chips.push({ text: division, type: 'conf' });

  // Record / form line — ESPN standings → live context → model fallback
  const recordParts = [];
  if (record) recordParts.push(record.replace(/-/g, '\u2013'));
  // L10: prefer ESPN standings (always full 10), fall back to live context (only if ≥5 games)
  const l10Display = teamStanding?.l10 || teamContext.l10Record;
  if (l10Display) recordParts.push(`L10: ${l10Display.replace(/-/g, '\u2013')}`);
  // Division rank + GB from ESPN standings
  if (teamStanding?.rank && division) {
    const rankStr = `${ordinal(teamStanding.rank)} ${division}`;
    if (teamStanding.gb > 0) {
      recordParts.push(`${rankStr} (${teamStanding.gb} GB)`);
    } else {
      recordParts.push(rankStr);
    }
  }

  return (
    <div
      className={styles.artboard}
      style={{ '--team-primary': teamPrimary, '--team-secondary': teamSecondary }}
      {...rest}
    >
      {/* Background atmosphere */}
      <div className={styles.bgBase} aria-hidden="true" />
      <div className={styles.bgGlow} aria-hidden="true" />
      <div className={styles.bgRay} aria-hidden="true" />
      <div className={styles.bgNoise} aria-hidden="true" />

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logoRow}>
          <img src="/logo.png" alt="Maximus Sports" className={styles.brandLogo}
            loading="eager" decoding="sync" crossOrigin="anonymous" />
          <div className={styles.logoMeta}>
            <span className={styles.brandName}>MAXIMUS SPORTS</span>
            <span className={styles.intelChip}>MLB TEAM INTEL</span>
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
        <TeamLogoHero slug={slug} name={name} />
      </div>

      {/* Team identity */}
      <div className={styles.identity}>
        <div className={styles.metaRow}>
          {chips.map((chip, i) => (
            <span key={i} className={styles[`${chip.type}Pill`] || styles.confPill}>{chip.text}</span>
          ))}
        </div>
        <h1 className={styles.teamName}>{name.toUpperCase()}</h1>
        {recordParts.length > 0 && (
          <div className={styles.formLine}>{recordParts.join(' \u00b7 ')}</div>
        )}
      </div>

      {/* Editorial headline */}
      <div className={styles.headlineZone}>
        <div className={styles.headlineDivider} />
        <h2 className={styles.headline}>
          {briefing.headline.split('\n').map((line, i) => (
            <span key={i} className={styles.headlineLine}>{line}</span>
          ))}
        </h2>
        <div className={styles.headlineDividerBottom} />
      </div>

      {/* Subtext */}
      {briefing.subtext && (
        <div className={styles.quickIntel}>{briefing.subtext}</div>
      )}

      {/* Stat band */}
      {statBand.length > 0 && (
        <div className={styles.statGrid}>
          {statBand.map((s, i) => (
            <div key={i} className={styles.statChip}>
              <div className={styles.statLabel}>{s.label}</div>
              <div className={styles.statValue}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ TEAM INTEL BRIEFING — hero content section ═══ */}
      {briefing.items.length > 0 && (
        <div className={styles.briefingModule}>
          <div className={styles.briefingHeader}>
            <div className={styles.briefingTitle}>TEAM INTEL BRIEFING</div>
            <div className={styles.briefingAccent} />
          </div>
          <div className={styles.briefingList}>
            {briefing.items.map((item, i) => (
              <div key={i} className={styles.briefingItem}>
                <span className={styles.bulletMarker} aria-hidden="true" />
                {/* Inline opponent logo for recent/next game items */}
                {item.oppSlug && (item.type === 'recent' || item.type === 'next') && (
                  <OppLogo slug={item.oppSlug} />
                )}
                <span className={styles.briefingText}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ TEAM LEADERS — 5-column bottom strip ═══ */}
      {briefing.teamLeaders?.length > 0 && (
        <div className={styles.teamLeadersStrip}>
          <div className={styles.teamLeadersStripTitle}>TEAM LEADERS</div>
          <div className={styles.teamLeadersColumns}>
            {briefing.teamLeaders.map((tl, i) => {
              const displayLabel = { HR: 'HR', RBI: 'RBI', H: 'Hits', W: 'Wins', SV: 'Saves' }[tl.stat] || tl.stat;
              return (
                <div key={i} className={styles.teamLeaderCol}>
                  <span className={styles.teamLeaderColStat}>{displayLabel}</span>
                  <span className={styles.teamLeaderColName}>{tl.player || '—'}</span>
                  <span className={styles.teamLeaderColValue}>{tl.value}</span>
                </div>
              );
            })}
          </div>
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
