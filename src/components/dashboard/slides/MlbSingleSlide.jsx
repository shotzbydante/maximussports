/**
 * MlbSingleSlide — Premium MLB IG post (1080×1350).
 *
 * 3-panel full-height layout:
 *   Panel 1: Yesterday + Storylines (intel bullets with team logos)
 *   Panel 2: World Series Outlook (AL top 3 + NL top 3 with odds)
 *   Panel 3: Matchups to Watch (team logos + descriptors)
 *
 * Content sourced from MLB Home "Today's Intelligence Briefing"
 * + championship odds API + picks board.
 */

import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
import { MLB_TEAMS } from '../../../sports/mlb/teams';
import { parseBriefingToIntel } from '../../../features/mlb/contentStudio/normalizeMlbImagePayload';
import styles from './MlbSingleSlide.module.css';

/* ── Helpers ──────────────────────────────────────────────── */

function TeamLogo({ slug, size = 28 }) {
  const url = getMlbEspnLogoUrl(slug);
  if (!url) return null;
  return (
    <img src={url} alt="" width={size} height={size}
      className={styles.teamLogo} crossOrigin="anonymous"
      onError={e => { e.currentTarget.style.display = 'none'; }} />
  );
}

function Mascot() {
  return (
    <img src="/mascot-mlb.png" alt="" className={styles.mascot}
      crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
  );
}

/** Resolve a team display name to its slug for logo lookup */
function resolveSlug(name) {
  if (!name) return null;
  const lower = name.toLowerCase();
  const match = MLB_TEAMS.find(t =>
    t.name.toLowerCase() === lower ||
    lower.includes(t.name.split(' ').pop().toLowerCase())
  );
  return match?.slug || null;
}

function fmtOdds(v) {
  if (v == null) return '';
  const n = Number(v);
  return n > 0 ? `+${n}` : `${n}`;
}

/** Build top 3 AL + top 3 NL from championship odds map */
function buildFuturesBoard(champOdds) {
  if (!champOdds || Object.keys(champOdds).length === 0) return null;

  const entries = [];
  for (const [slug, data] of Object.entries(champOdds)) {
    const team = MLB_TEAMS.find(t => t.slug === slug);
    if (!team || !data) continue;
    const odds = data.bestChanceAmerican ?? data.american ?? null;
    if (odds == null) continue;
    entries.push({ slug, name: team.name, abbrev: team.abbrev, league: team.league, odds });
  }

  // Sort by odds ascending (most favored = most negative)
  entries.sort((a, b) => a.odds - b.odds);

  const al = entries.filter(e => e.league === 'AL').slice(0, 3);
  const nl = entries.filter(e => e.league === 'NL').slice(0, 3);

  if (al.length === 0 && nl.length === 0) return null;
  return { al, nl };
}

/** Strip emojis from text for cleaner display */
function stripEmojis(text) {
  if (!text) return '';
  return text.replace(/[\u{1F300}-\u{1FAD6}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').replace(/\s{2,}/g, ' ').trim();
}

/* ── Main ─────────────────────────────────────────────────── */

export default function MlbSingleSlide({ data, teamData, game, asOf, options = {}, ...rest }) {
  const template = options?.mlbTemplate || 'daily';
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  let content;
  try {
    content = buildSlideContent(template, data, teamData, game, options);
  } catch (err) {
    console.error('[MlbSingleSlide] error:', err);
    content = { category: 'MLB INTELLIGENCE', headline: 'Content unavailable' };
  }

  return (
    <div className={styles.artboard} {...rest}>
      <div className={styles.bgBase} />
      <div className={styles.bgGlow} />

      {/* ── HEADER ── */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.brandRow}>
            <img src="/logo.png" alt="" className={styles.brandLogo} crossOrigin="anonymous" />
            <span className={styles.brandName}>MAXIMUS SPORTS</span>
          </div>
          <Mascot />
        </div>
        <span className={styles.badge}>{content.category || 'MLB DAILY BRIEFING'}</span>
        <span className={styles.dateLine}>{today}</span>
      </div>

      {/* ── HERO ── */}
      <div className={styles.heroZone}>
        <h2 className={styles.headline}>{content.headline}</h2>
        {content.subheadline && <p className={styles.subhead}>{content.subheadline}</p>}
      </div>

      {/* ── Matchup zone (game insights only) ── */}
      {content.matchup && (
        <div className={styles.matchupHero}>
          <div className={styles.matchupSide}>
            <TeamLogo slug={content.matchup.awaySlug} size={48} />
            <span className={styles.matchupName}>{content.matchup.awayName}</span>
          </div>
          <span className={styles.vsLabel}>VS</span>
          <div className={styles.matchupSide}>
            <TeamLogo slug={content.matchup.homeSlug} size={48} />
            <span className={styles.matchupName}>{content.matchup.homeName}</span>
          </div>
        </div>
      )}

      {/* ── PANEL 1: Storylines ── */}
      {content.storylines && content.storylines.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <span className={styles.panelDot} />
            <span className={styles.panelLabel}>STORYLINES</span>
          </div>
          <div className={styles.storylineList}>
            {content.storylines.map((s, i) => (
              <div key={i} className={styles.storylineRow}>
                {s.slug && <TeamLogo slug={s.slug} size={22} />}
                <span className={styles.storylineText}>{s.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Plain bullets fallback (non-daily sections) ── */}
      {!content.storylines && content.bullets?.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <span className={styles.panelDot} />
            <span className={styles.panelLabel}>{content.bulletLabel || 'KEY INTEL'}</span>
          </div>
          <div className={styles.storylineList}>
            {content.bullets.map((b, i) => (
              <div key={i} className={styles.storylineRow}>
                <span className={styles.bulletDot}>•</span>
                <span className={styles.storylineText}>{typeof b === 'string' ? b : b.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Picks panel ── */}
      {content.picks?.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <span className={styles.panelDot} />
            <span className={styles.panelLabel}>MAXIMUS'S PICKS</span>
          </div>
          <div className={styles.picksGrid}>
            {content.picks.map((p, i) => (
              <div key={i} className={styles.pickCell}>
                <span className={styles.pickType}>{p.category}</span>
                <span className={styles.pickVal}>{p.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PANEL 2: World Series Outlook ── */}
      {content.futures && (
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <span className={styles.panelDot} />
            <span className={styles.panelLabel}>WORLD SERIES OUTLOOK</span>
          </div>
          <div className={styles.futuresGrid}>
            {content.futures.al.length > 0 && (
              <div className={styles.futuresCol}>
                <span className={styles.leagueLabel}>AMERICAN LEAGUE</span>
                {content.futures.al.map((t, i) => (
                  <div key={i} className={styles.futuresRow}>
                    <TeamLogo slug={t.slug} size={24} />
                    <span className={styles.futuresTeam}>{t.abbrev}</span>
                    <span className={styles.futuresOdds}>{fmtOdds(t.odds)}</span>
                  </div>
                ))}
              </div>
            )}
            {content.futures.nl.length > 0 && (
              <div className={styles.futuresCol}>
                <span className={styles.leagueLabel}>NATIONAL LEAGUE</span>
                {content.futures.nl.map((t, i) => (
                  <div key={i} className={styles.futuresRow}>
                    <TeamLogo slug={t.slug} size={24} />
                    <span className={styles.futuresTeam}>{t.abbrev}</span>
                    <span className={styles.futuresOdds}>{fmtOdds(t.odds)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PANEL 3: Matchups to Watch ── */}
      {content.matchupsToWatch?.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <span className={styles.panelDot} />
            <span className={styles.panelLabel}>MATCHUPS TO WATCH</span>
          </div>
          <div className={styles.matchupsList}>
            {content.matchupsToWatch.map((m, i) => (
              <div key={i} className={styles.matchupRow}>
                <TeamLogo slug={m.slugA} size={24} />
                <span className={styles.matchupTeam}>{m.teamA}</span>
                <span className={styles.matchupVs}>vs</span>
                <span className={styles.matchupTeam}>{m.teamB}</span>
                <TeamLogo slug={m.slugB} size={24} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Team focus ── */}
      {content.teamFocus && (
        <div className={styles.teamFocusRow}>
          <TeamLogo slug={content.teamFocus.slug} size={40} />
          <span className={styles.focusName}>{content.teamFocus.name}</span>
        </div>
      )}

      {/* ── FOOTER ── */}
      <footer className={styles.footer}>
        <span className={styles.footerUrl}>maximussports.ai</span>
        <span className={styles.footerDisclaimer}>For entertainment only. Please bet responsibly. 21+</span>
      </footer>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Content builders
   ────────────────────────────────────────────────────────────── */

function buildSlideContent(template, data, teamData, game, options) {
  switch (template) {
    case 'team':     return buildTeamContent(teamData, options);
    case 'game':     return buildGameContent(game, data, options);
    case 'picks':    return buildPicksContent(data);
    case 'league':   return buildLeagueContent(data, options);
    case 'division': return buildDivisionContent(data, options);
    case 'daily':
    default:         return buildDailyContent(data);
  }
}

function buildDailyContent(data) {
  const intel = parseBriefingToIntel(data?.mlbBriefing);
  const champOdds = data?.mlbChampOdds ?? {};
  const picks = data?.mlbPicks ?? data?.canonicalPicks ?? {};
  const games = data?.mlbGames ?? data?.games ?? [];

  const futures = buildFuturesBoard(champOdds);

  // Build storylines with team logo slugs
  const storylines = [];
  const rawBullets = intel?.bullets || [];
  for (const b of rawBullets.slice(0, 3)) {
    const cleaned = stripEmojis(b);
    if (!cleaned) continue;
    // Find first mentioned team for logo
    const teamMentions = intel?.teamMentions || [];
    let slug = null;
    for (const t of teamMentions) {
      if (cleaned.toLowerCase().includes(t.toLowerCase())) {
        slug = resolveSlug(t);
        break;
      }
    }
    storylines.push({ text: cleaned, slug });
  }

  // Matchups with resolved slugs
  const rawMatchups = intel?.keyMatchups || [];
  const matchupsToWatch = rawMatchups.slice(0, 3).map(m => ({
    teamA: m.teamA,
    teamB: m.teamB,
    slugA: resolveSlug(m.teamA),
    slugB: resolveSlug(m.teamB),
  }));

  const headline = intel?.headline
    ? stripEmojis(intel.headline)
    : `${games.length} games on today's MLB slate`;

  const subheadline = intel?.subhead ? stripEmojis(intel.subhead) : null;

  return {
    category: 'MLB DAILY BRIEFING',
    headline,
    subheadline,
    storylines: storylines.length > 0 ? storylines : null,
    futures,
    matchupsToWatch: matchupsToWatch.length > 0 ? matchupsToWatch : null,
    picks: null, matchup: null, pickLabel: null,
  };
}

function buildTeamContent(teamData, options) {
  const team = teamData?.team ?? options?.mlbTeam;
  const slug = team?.slug || '';
  const name = team?.name || team?.displayName || slug;
  return {
    category: 'MLB TEAM INTEL', headline: `${name} Intel Report`,
    subheadline: 'Model-driven team breakdown and projections.',
    teamFocus: { slug, name, record: team?.record },
    bullets: ['Season projection and model confidence', 'Rotation depth and bullpen analysis', 'Market positioning and value signals'],
    picks: null, matchup: null, pickLabel: null,
  };
}

function buildGameContent(game, data, options) {
  if (!game) return { category: 'MLB GAME PREVIEW', headline: 'Select a game to preview', bullets: [], picks: null, matchup: null, pickLabel: null };
  const awayName = game.awayTeam || 'Away';
  const homeName = game.homeTeam || 'Home';
  const spread = game.homeSpread ?? game.spread;
  const total = game.total;
  const bullets = [];
  if (spread != null) bullets.push(`Run Line: ${homeName} ${parseFloat(spread) > 0 ? '+' : ''}${spread}`);
  if (total != null) bullets.push(`Total: ${total}`);
  return {
    category: 'MLB GAME PREVIEW', headline: `${awayName} at ${homeName}`,
    subheadline: options?.gameAngle === 'story' ? 'Key storylines and matchup dynamics.' : 'Value-driven analysis and model edges.',
    matchup: { awayName, homeName, awaySlug: game.awaySlug || '', homeSlug: game.homeSlug || '' },
    bullets, bulletLabel: 'MARKET SNAPSHOT', picks: null, pickLabel: null,
  };
}

function buildPicksContent(data) {
  const cp = data?.canonicalPicks ?? data?.mlbPicks ?? {};
  const cats = cp?.categories ?? {};
  const pickRows = [];
  const addPick = (cat, label, items) => {
    const top = items?.[0];
    if (top) pickRows.push({ category: cat, label: top.pick?.label || label, confidence: top.confidence });
  };
  addPick("PICK 'EM", 'Moneyline', cats.pickEms);
  addPick('RUN LINE', 'Spread', cats.ats);
  addPick('TOTAL', 'Over/Under', cats.totals);
  const topPick = pickRows[0];
  return {
    category: "MAXIMUS'S PICKS",
    headline: topPick ? `Top play: ${topPick.label}` : 'No strong lean today',
    subheadline: pickRows.length > 0 ? `${pickRows.length} qualified picks across the board.` : 'Waiting for stronger signal alignment.',
    picks: pickRows, bullets: null, matchup: null,
    pickLabel: topPick?.label || null, pickConfidence: topPick?.confidence || null,
  };
}

function buildLeagueContent(data, options) {
  const league = options?.mlbLeague || 'AL';
  return {
    category: `${league === 'AL' ? 'AMERICAN' : 'NATIONAL'} LEAGUE INTEL`,
    headline: `${league === 'AL' ? 'American' : 'National'} League Overview`,
    subheadline: `Key storylines and competitive dynamics.`,
    bullets: ['Division race updates', 'Model projections and playoff odds', 'Notable trends and value'],
    bulletLabel: `${league} STORYLINES`, picks: null, matchup: null, pickLabel: null,
  };
}

function buildDivisionContent(data, options) {
  const division = options?.mlbDivision || 'AL East';
  return {
    category: `${division.toUpperCase()} INTEL`, headline: `${division} Division Report`,
    subheadline: `Competitive landscape and value plays.`,
    bullets: ['Division standings and race dynamics', 'Team-by-team projections', 'Divisional matchup edges'],
    bulletLabel: 'DIVISION SIGNALS', picks: null, matchup: null, pickLabel: null,
  };
}
