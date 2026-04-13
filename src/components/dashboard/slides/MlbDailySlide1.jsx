/**
 * MlbDailySlide1 — Summary Cover (Slide 1 of MLB Daily Briefing carousel)
 *
 * A dense editorial cover that teases Slides 2 and 3.
 * ALL data comes from the same pipeline as Slide 2 — no separate generators.
 *
 * Layout:
 *   Brand pill → "DAILY MLB BRIEFING" title + date → Two stacked story cards
 *   → Mascot (left overlap) → HOTP pill + 3 bullets
 *   → Lower two-column: Pennant Race | Maximus's Picks
 *   → Bottom CTA pill
 *
 * 1080×1350 · IG 4:5 portrait
 */

import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
import { MLB_TEAMS } from '../../../sports/mlb/teams';
import { getTeamProjection } from '../../../data/mlb/seasonModel';
import { buildMlbDailyHeadline, buildMlbHotPress } from '../../../features/mlb/contentStudio/buildMlbDailyHeadline';
import { stripEmojis, fmtOdds } from './mlbDailyHelpers';
import styles from './MlbSlides.module.css';

// ── Helpers (reused from Slide 2 pipeline) ──────────────────────────────

function logoUrl(slug) {
  return slug ? getMlbEspnLogoUrl(slug) : null;
}

function shortDiv(div) {
  if (!div) return '';
  return div.replace('American League ', 'AL ').replace('National League ', 'NL ');
}

function fmtConviction(tier) {
  if (!tier) return 'Edge';
  if (tier === 'high') return 'High';
  if (tier === 'medium-high') return 'Med-High';
  if (tier === 'medium') return 'Medium';
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function trim(text, max = 120) {
  if (!text) return '';
  let s = text.trim();
  s = s.replace(/^(Meanwhile,?\s*|In other action,?\s*|Additionally,?\s*|Also,?\s*)/i, '');
  s = s.replace(/^[¶#§]\d*\s*/i, '');
  s = s.replace(/^[A-Z][A-Z\s&+\-:]*[A-Z]\s*[:—–-]\s*/i, '');
  if (s.length <= max) return s;
  const sentEnd = s.lastIndexOf('.', max);
  if (sentEnd > max * 0.4) return s.slice(0, sentEnd + 1);
  return s.slice(0, max).replace(/\s+\S*$/, '') + '.';
}

// ── Build Slide 1 content from the SAME data Slides 2 & 3 use ──────────

function buildSlide1Content(data) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  // ── Story cards: from headline engine (same as Slide 2) ──
  const hl = buildMlbDailyHeadline({
    liveGames: data?.mlbLiveGames || [],
    briefing: data?.mlbBriefing,
    seasonIntel: null,
    allStandings: data?.mlbStandings || null,
  });

  // ── HOTP bullets: from game results (same as Slide 2) ──
  const hotPress = buildMlbHotPress({
    liveGames: data?.mlbLiveGames || [],
    briefing: data?.mlbBriefing,
    allStandings: data?.mlbStandings || null,
  });
  const bullets = hotPress.slice(0, 3).map(b => ({
    text: trim(b.text),
    logoSrc: logoUrl(b.logoSlug),
  }));

  // ── Pennant Race: top 3 from season model (same as Slide 2, just top 3) ──
  const allTeams = [];
  for (const team of MLB_TEAMS) {
    const proj = getTeamProjection(team.slug);
    if (!proj || !proj.projectedWins) continue;
    const oddsData = (data?.mlbChampOdds ?? {})[team.slug];
    const oddsVal = oddsData?.bestChanceAmerican ?? oddsData?.american ?? null;
    allTeams.push({
      slug: team.slug, abbrev: team.abbrev, division: team.division,
      projectedWins: proj.projectedWins,
      signals: proj.signals ?? [],
      confidenceTier: proj.confidenceTier ?? null,
      odds: oddsVal,
    });
  }
  allTeams.sort((a, b) => (b.projectedWins ?? 0) - (a.projectedWins ?? 0));
  const standings = data?.mlbStandings || {};
  const raceTeams = allTeams.slice(0, 3).map(t => {
    const st = standings[t.slug];
    const record = st?.record || (st?.wins != null ? `${st.wins}–${st.losses}` : null);
    return {
      team: t.abbrev,
      teamLogoSrc: logoUrl(t.slug),
      division: shortDiv(t.division),
      projectedWins: t.projectedWins,
      record,
      convictionLabel: t.confidenceTier || 'Projected',
      championshipOdds: t.odds != null ? fmtOdds(t.odds) : '—',
      summaryTag: t.signals?.[0] || null,
    };
  });

  // ── Picks: top 3 from same pool as Slide 2 ──
  const pickCats = data?.mlbPicks?.categories || data?.canonicalPicks?.categories || {};
  const pickEms = (pickCats.pickEms || []).map(p => ({ ...p, type: "Pick 'Em" }));
  const ats = (pickCats.ats || []).map(p => ({ ...p, type: 'ATS' }));
  const totals = (pickCats.totals || []).map(p => ({ ...p, type: 'O/U' }));
  const allByConf = [...pickEms, ...ats, ...totals].sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
  const selected = [];
  const usedIds = new Set();
  if (ats.length > 0) {
    const bestAts = [...ats].sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0))[0];
    selected.push(bestAts);
    usedIds.add(bestAts.id);
  }
  for (const p of allByConf) {
    if (selected.length >= 3) break;
    if (!usedIds.has(p.id)) { selected.push(p); usedIds.add(p.id); }
  }
  const picks = selected.slice(0, 3).map(p => {
    const away = p.matchup?.awayTeam?.shortName || p.matchup?.awayTeam?.name || '?';
    const home = p.matchup?.homeTeam?.shortName || p.matchup?.homeTeam?.name || '?';
    const matchup = `${away} vs ${home}`;
    const selection = p.pick?.label || '—';
    const conviction = fmtConviction(p.confidence);
    const edgePct = p.pick?.edgePercent || p.confidenceScore;
    const rationale = edgePct ? `Model favors ${selection.split(' ').pop()} with a ${Number(edgePct).toFixed(1)}% edge.` : `Model edge: ${conviction.toLowerCase()}`;
    const pickSide = p.pick?.side;
    const selTeam = pickSide === 'away' ? p.matchup?.awayTeam : p.matchup?.homeTeam;
    return { matchup, type: p.type, selection, selectionLogoSrc: logoUrl(selTeam?.slug || null), conviction, rationale };
  });

  return {
    dateLabel: today,
    storyCard1Title: hl.heroTitle?.split('.')[0]?.replace(/[.!]$/, '') || 'Results Land',
    storyCard1Sub: hl.subhead?.split('.')[0]?.replace(/[.!]$/, '') || '',
    storyCard2Title: (() => {
      // Second clause of heroTitle or a different phrasing
      const parts = (hl.heroTitle || '').split('.');
      if (parts.length >= 2 && parts[1].trim().length > 3) {
        return parts[1].trim().replace(/[.!]$/, '');
      }
      // Derive from second bullet if available
      if (hotPress[1]?.text) {
        const s = hotPress[1].text.replace(/\.$/, '');
        return s.length > 40 ? s.slice(0, 40).replace(/\s+\S*$/, '') : s;
      }
      return 'The Board Reacts';
    })(),
    storyCard2Sub: (() => {
      if (hotPress[1]?.text) {
        // Extract the score / result part
        const m = hotPress[1].text.match(/(\w+\s+\w+\s+\w+\s+\d+[–-]\d+)/);
        if (m) return m[1];
        return hotPress[1].text.replace(/\.$/, '');
      }
      return '';
    })(),
    bullets,
    raceTeams,
    picks,
  };
}

// ── Inline logo helper ──────────────────────────────────────────────────

function Logo({ src, size = 20 }) {
  if (!src) return null;
  return <img src={src} alt="" width={size} height={size} style={{ objectFit: 'contain', flexShrink: 0 }} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />;
}

// ── Component ───────────────────────────────────────────────────────────

export default function MlbDailySlide1({ data, asOf, ...rest }) {
  const c = buildSlide1Content(data);

  return (
    <div className={styles.s1} data-slide="1" {...rest}>
      {/* Background layers */}
      <div className={styles.s1BgBase} />
      <div className={styles.s1BgLights} />
      <div className={styles.s1BgSeam} />
      <div className={styles.s1BgNoise} />

      {/* ── Top brand pill ── */}
      <header className={styles.s1TopBar}>
        <div className={styles.s1BrandPill}>
          <img src="/mlb-logo.png" alt="" className={styles.s1BrandIcon} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
          <span>MAXIMUS SPORTS</span>
        </div>
      </header>

      {/* ── Title block (free-floating, not in glass card) ── */}
      <div className={styles.s1TitleBlock}>
        <h1 className={styles.s1Title}>DAILY MLB BRIEFING</h1>
        <div className={styles.s1Date}>{c.dateLabel}</div>
      </div>

      {/* ── Story cards + mascot zone ── */}
      <div className={styles.s1StoryZone}>
        {/* Mascot — left overlap */}
        <div className={styles.s1MascotWrap}>
          <div className={styles.s1MascotGlow} />
          <img src="/mascot-mlb.png" alt="Maximus" className={styles.s1MascotImg} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
        </div>

        {/* Two stacked glass story cards */}
        <div className={styles.s1CardsStack}>
          <div className={styles.s1StoryCard}>
            <div className={styles.s1StoryTitle}>{c.storyCard1Title}</div>
            {c.storyCard1Sub && <div className={styles.s1StorySub}>{c.storyCard1Sub}</div>}
          </div>
          <div className={styles.s1StoryCard}>
            <div className={styles.s1StoryTitle}>{c.storyCard2Title}</div>
            {c.storyCard2Sub && <div className={styles.s1StorySub}>{c.storyCard2Sub}</div>}
          </div>
        </div>
      </div>

      {/* ── HOT OFF THE PRESS ── */}
      <div className={styles.s1HotpZone}>
        <div className={styles.s1HotpPill}>
          <span className={styles.s1HotpIcon}>🔔</span>
          <span>HOT OFF THE PRESS</span>
        </div>
        <div className={styles.s1HotpBullets}>
          {c.bullets.map((b, i) => (
            <div key={i} className={styles.s1HotpRow}>
              <span className={styles.s1BulletDot}>▸</span>
              {b.logoSrc && <Logo src={b.logoSrc} size={18} />}
              <span className={styles.s1BulletText}>{b.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom two-column: Pennant Race + Picks ── */}
      <div className={styles.s1BottomGrid}>
        {/* Pennant Race card */}
        <div className={styles.s1BottomCard}>
          <div className={styles.s1SectionLabel}>PENNANT RACE</div>
          <div className={styles.s1RaceList}>
            {c.raceTeams.map((t, i) => (
              <div key={i} className={styles.s1RaceRow}>
                <div className={styles.s1RaceTeamId}>
                  <Logo src={t.teamLogoSrc} size={28} />
                  <div className={styles.s1RaceTeamInfo}>
                    <span className={styles.s1RaceAbbrev}>{t.team}</span>
                    {t.record && <span className={styles.s1RaceRecord}>{t.record}</span>}
                  </div>
                </div>
                <div className={styles.s1RaceCenter}>
                  <div className={styles.s1RaceWins}>Proj: {t.projectedWins}W</div>
                  <div className={styles.s1RaceConviction}>{t.convictionLabel}</div>
                </div>
                <div className={styles.s1RaceRight}>
                  <div className={styles.s1RaceDiv}>{t.division}</div>
                  <div className={styles.s1RaceOdds}>🏆 {t.championshipOdds}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Maximus's Picks card */}
        <div className={styles.s1BottomCard}>
          <div className={styles.s1SectionLabel}>MAXIMUS'S PICKS</div>
          <div className={styles.s1PicksList}>
            {c.picks.map((p, i) => (
              <div key={i} className={styles.s1PickRow}>
                <div className={styles.s1PickTop}>
                  <span className={styles.s1PickMatchup}>{p.matchup}</span>
                  <span className={styles.s1PickType}>{p.type}</span>
                </div>
                <div className={styles.s1PickMid}>
                  <div className={styles.s1PickSelWrap}>
                    {p.selectionLogoSrc && <Logo src={p.selectionLogoSrc} size={18} />}
                    <span className={styles.s1PickSel}>{p.selection}</span>
                  </div>
                  <span className={styles.s1PickConv}>{p.conviction}</span>
                </div>
                <div className={styles.s1PickRationale}>{p.rationale}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bottom CTA pill ── */}
      <footer className={styles.s1Footer}>
        <div className={styles.s1CtaPill}>
          <svg className={styles.s1CtaIcon} width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <polyline points="2,11 5.5,7 8.5,9 14,4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="10,4 14,4 14,8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className={styles.s1CtaLabel}>MORE AT</span>
          <span className={styles.s1CtaSite}>maximussports.ai</span>
        </div>
      </footer>
    </div>
  );
}
