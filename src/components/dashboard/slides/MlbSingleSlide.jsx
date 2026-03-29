/**
 * MlbSingleSlide — Premium full-canvas MLB IG post (1080×1350).
 *
 * Full-page editorial briefing. NCAAM-inspired scale and density.
 * Season Intelligence data powers the World Series Outlook cards.
 */

import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
import { MLB_TEAMS } from '../../../sports/mlb/teams';
import { getTeamProjection } from '../../../data/mlb/seasonModel';
import { parseBriefingToIntel } from '../../../features/mlb/contentStudio/normalizeMlbImagePayload';
import styles from './MlbSingleSlide.module.css';

function TeamLogo({ slug, size = 28 }) {
  const url = getMlbEspnLogoUrl(slug);
  if (!url) return null;
  return <img src={url} alt="" width={size} height={size} className={styles.teamLogo} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />;
}

function Mascot() {
  return <img src="/mascot-mlb.png" alt="" className={styles.mascot} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />;
}

function resolveSlug(name) {
  if (!name) return null;
  const lower = name.toLowerCase();
  return MLB_TEAMS.find(t => t.name.toLowerCase() === lower || lower.includes(t.name.split(' ').pop().toLowerCase()))?.slug || null;
}

function fmtOdds(v) {
  if (v == null) return '—';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return n > 0 ? `+${n}` : `${n}`;
}

function stripEmojis(text) {
  if (!text) return '';
  return text.replace(/[\u{1F300}-\u{1FAD6}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').replace(/\s{2,}/g, ' ').trim();
}

function buildSeasonIntelLeaders(champOdds) {
  const entries = [];
  const slugsWithOdds = champOdds ? Object.keys(champOdds) : [];
  for (const slug of slugsWithOdds) {
    const team = MLB_TEAMS.find(t => t.slug === slug);
    if (!team) continue;
    const odds = champOdds[slug];
    const oddsVal = odds?.bestChanceAmerican ?? odds?.american ?? null;
    if (oddsVal == null) continue;
    const proj = getTeamProjection(slug);
    entries.push({
      slug, name: team.name, abbrev: team.abbrev, league: team.league, odds: oddsVal,
      projectedWins: proj?.projectedWins ?? null,
      floor: proj?.floor ?? null, ceiling: proj?.ceiling ?? null,
      confidenceTier: proj?.confidenceTier ?? null,
      signals: proj?.signals ?? [],
      strongestDriver: proj?.takeaways?.strongestDriver ?? null,
      marketStance: proj?.takeaways?.marketStance ?? null,
      divOutlook: proj?.divOutlook ?? null,
      stability: proj?.takeaways?.stability ?? null,
    });
  }
  entries.sort((a, b) => a.odds - b.odds);
  const al = entries.filter(e => e.league === 'AL').slice(0, 3);
  const nl = entries.filter(e => e.league === 'NL').slice(0, 3);
  if (al.length === 0 && nl.length === 0) return null;
  return { al, nl };
}

/** Renders a single team intelligence card inside the outlook grid */
function TeamIntelCard({ t }) {
  return (
    <div className={styles.teamCard}>
      {/* Row 1: Logo + Name + Odds */}
      <div className={styles.teamCardTop}>
        <TeamLogo slug={t.slug} size={36} />
        <div className={styles.teamCardName}>{t.abbrev}</div>
        <div className={styles.teamCardOdds}>{fmtOdds(t.odds)}</div>
      </div>

      {/* Row 2: Projection + Signal chips */}
      <div className={styles.teamCardChips}>
        {t.projectedWins && (
          <span className={styles.projChip}>
            <span className={styles.projLabel}>PROJ</span> {t.projectedWins}W
          </span>
        )}
        {t.signals?.[0] && <span className={styles.signalChip}>{t.signals[0]}</span>}
        {t.confidenceTier && <span className={styles.confChip}>{t.confidenceTier}</span>}
      </div>

      {/* Row 3: Key driver */}
      {t.strongestDriver && (
        <div className={styles.teamCardDriver}>
          Key driver: {t.strongestDriver}
        </div>
      )}

      {/* Row 4: Market stance */}
      {t.marketStance && (
        <div className={styles.teamCardMarket}>
          {t.marketStance}
          {t.floor && t.ceiling ? ` · Range: ${t.floor}–${t.ceiling}W` : ''}
        </div>
      )}
    </div>
  );
}

export default function MlbSingleSlide({ data, teamData, game, asOf, options = {}, ...rest }) {
  const template = options?.mlbTemplate || 'daily';
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  let content;
  try { content = buildSlideContent(template, data, teamData, game, options); }
  catch (err) { console.error('[MlbSingleSlide] error:', err); content = { category: 'MLB INTELLIGENCE', headline: 'Content unavailable' }; }

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

      {/* ── Matchup hero (game template) ── */}
      {content.matchup && (
        <div className={styles.matchupHero}>
          <div className={styles.matchupSide}><TeamLogo slug={content.matchup.awaySlug} size={48} /><span className={styles.matchupName}>{content.matchup.awayName}</span></div>
          <span className={styles.vsLabel}>VS</span>
          <div className={styles.matchupSide}><TeamLogo slug={content.matchup.homeSlug} size={48} /><span className={styles.matchupName}>{content.matchup.homeName}</span></div>
        </div>
      )}

      {/* ── STORYLINES ── */}
      {content.storylines?.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.panelHead}><span className={styles.panelDot} /><span className={styles.panelLabel}>AROUND THE LEAGUE</span></div>
          <div className={styles.storylineList}>
            {content.storylines.map((s, i) => (
              <div key={i} className={styles.storylineRow}>
                {s.slug ? <TeamLogo slug={s.slug} size={24} /> : <span className={styles.bulletDot} />}
                <span className={styles.storylineText}>{s.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Bullets fallback ── */}
      {!content.storylines && content.bullets?.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.panelHead}><span className={styles.panelDot} /><span className={styles.panelLabel}>{content.bulletLabel || 'KEY INTEL'}</span></div>
          <div className={styles.storylineList}>
            {content.bullets.map((b, i) => (
              <div key={i} className={styles.storylineRow}><span className={styles.bulletDot} /><span className={styles.storylineText}>{typeof b === 'string' ? b : b.text}</span></div>
            ))}
          </div>
        </div>
      )}

      {/* ── Picks ── */}
      {content.picks?.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.panelHead}><span className={styles.panelDot} /><span className={styles.panelLabel}>MAXIMUS'S PICKS</span></div>
          <div className={styles.picksGrid}>
            {content.picks.map((p, i) => (<div key={i} className={styles.pickCell}><span className={styles.pickType}>{p.category}</span><span className={styles.pickVal}>{p.label}</span></div>))}
          </div>
        </div>
      )}

      {/* ── WORLD SERIES OUTLOOK — hero data module ── */}
      {content.seasonIntel && (
        <div className={styles.intelPanel}>
          <div className={styles.panelHead}><span className={styles.panelDot} /><span className={styles.panelLabel}>WORLD SERIES OUTLOOK</span></div>
          <div className={styles.intelGrid}>
            {content.seasonIntel.al.length > 0 && (
              <div className={styles.intelCol}>
                <span className={styles.leagueTag}>AMERICAN LEAGUE</span>
                {content.seasonIntel.al.map((t, i) => <TeamIntelCard key={i} t={t} />)}
              </div>
            )}
            {content.seasonIntel.nl.length > 0 && (
              <div className={styles.intelCol}>
                <span className={styles.leagueTag}>NATIONAL LEAGUE</span>
                {content.seasonIntel.nl.map((t, i) => <TeamIntelCard key={i} t={t} />)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MATCHUPS ── */}
      {content.matchupsToWatch?.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.panelHead}><span className={styles.panelDot} /><span className={styles.panelLabel}>MATCHUPS TO WATCH</span></div>
          <div className={styles.matchupsList}>
            {content.matchupsToWatch.map((m, i) => (
              <div key={i} className={styles.matchupRow}>
                <TeamLogo slug={m.slugA} size={26} /><span className={styles.matchupTeam}>{m.teamA}</span>
                <span className={styles.matchupVs}>vs</span>
                <span className={styles.matchupTeam}>{m.teamB}</span><TeamLogo slug={m.slugB} size={26} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Team focus ── */}
      {content.teamFocus && (
        <div className={styles.teamFocusRow}><TeamLogo slug={content.teamFocus.slug} size={40} /><span className={styles.focusName}>{content.teamFocus.name}</span></div>
      )}

      {/* ── FOOTER ── */}
      <footer className={styles.footer}>
        <span className={styles.footerUrl}>maximussports.ai</span>
        <span className={styles.footerDisclaimer}>For entertainment only. Please bet responsibly. 21+</span>
      </footer>
    </div>
  );
}

/* ── Content builders ──────────────────────────────────────── */

function buildSlideContent(template, data, teamData, game, options) {
  switch (template) {
    case 'team': return buildTeamContent(teamData, options);
    case 'game': return buildGameContent(game, data, options);
    case 'picks': return buildPicksContent(data);
    case 'league': return buildLeagueContent(data, options);
    case 'division': return buildDivisionContent(data, options);
    case 'daily': default: return buildDailyContent(data);
  }
}

function buildDailyContent(data) {
  const intel = parseBriefingToIntel(data?.mlbBriefing);
  const champOdds = data?.mlbChampOdds ?? {};
  const seasonIntel = buildSeasonIntelLeaders(champOdds);

  const storylines = [];
  for (const b of (intel?.bullets || []).slice(0, 3)) {
    const cleaned = stripEmojis(b);
    if (!cleaned) continue;
    let slug = null;
    for (const t of (intel?.teamMentions || [])) {
      if (cleaned.toLowerCase().includes(t.toLowerCase())) { slug = resolveSlug(t); break; }
    }
    storylines.push({ text: cleaned, slug });
  }

  const rawMatchups = intel?.keyMatchups || [];
  const matchupsToWatch = rawMatchups.slice(0, 3).map(m => ({
    teamA: m.teamA, teamB: m.teamB, slugA: resolveSlug(m.teamA), slugB: resolveSlug(m.teamB),
  }));

  return {
    category: 'MLB DAILY BRIEFING',
    headline: intel?.headline ? stripEmojis(intel.headline) : 'MLB Intelligence Briefing',
    subheadline: intel?.subhead ? stripEmojis(intel.subhead) : null,
    storylines: storylines.length > 0 ? storylines : null,
    seasonIntel,
    matchupsToWatch: matchupsToWatch.length > 0 ? matchupsToWatch : null,
    picks: null, matchup: null, pickLabel: null,
  };
}

function buildTeamContent(teamData, options) {
  const team = teamData?.team ?? options?.mlbTeam;
  const slug = team?.slug || ''; const name = team?.name || slug;
  return { category: 'MLB TEAM INTEL', headline: `${name} Intel Report`, subheadline: 'Model-driven team breakdown and projections.', teamFocus: { slug, name, record: team?.record }, bullets: ['Season projection and model confidence', 'Rotation depth and bullpen analysis', 'Market positioning and value signals'], picks: null, matchup: null, pickLabel: null };
}

function buildGameContent(game, data, options) {
  if (!game) return { category: 'MLB GAME PREVIEW', headline: 'Select a game to preview', bullets: [], picks: null, matchup: null, pickLabel: null };
  const awayName = game.awayTeam || 'Away'; const homeName = game.homeTeam || 'Home';
  const spread = game.homeSpread ?? game.spread; const total = game.total;
  const bullets = [];
  if (spread != null) bullets.push(`Run Line: ${homeName} ${parseFloat(spread) > 0 ? '+' : ''}${spread}`);
  if (total != null) bullets.push(`Total: ${total}`);
  return { category: 'MLB GAME PREVIEW', headline: `${awayName} at ${homeName}`, subheadline: options?.gameAngle === 'story' ? 'Key storylines and matchup dynamics.' : 'Value-driven analysis and model edges.', matchup: { awayName, homeName, awaySlug: game.awaySlug || '', homeSlug: game.homeSlug || '' }, bullets, bulletLabel: 'MARKET SNAPSHOT', picks: null, pickLabel: null };
}

function buildPicksContent(data) {
  const cp = data?.canonicalPicks ?? data?.mlbPicks ?? {}; const cats = cp?.categories ?? {};
  const pickRows = [];
  const addPick = (cat, label, items) => { const top = items?.[0]; if (top) pickRows.push({ category: cat, label: top.pick?.label || label, confidence: top.confidence }); };
  addPick("PICK 'EM", 'Moneyline', cats.pickEms); addPick('RUN LINE', 'Spread', cats.ats); addPick('TOTAL', 'Over/Under', cats.totals);
  const topPick = pickRows[0];
  return { category: "MAXIMUS'S PICKS", headline: topPick ? `Top play: ${topPick.label}` : 'No strong lean today', subheadline: pickRows.length > 0 ? `${pickRows.length} qualified picks across the board.` : 'Waiting for stronger signal alignment.', picks: pickRows, bullets: null, matchup: null, pickLabel: topPick?.label || null, pickConfidence: topPick?.confidence || null };
}

function buildLeagueContent(data, options) {
  const league = options?.mlbLeague || 'AL';
  return { category: `${league === 'AL' ? 'AMERICAN' : 'NATIONAL'} LEAGUE INTEL`, headline: `${league === 'AL' ? 'American' : 'National'} League Overview`, subheadline: 'Key storylines and competitive dynamics.', bullets: ['Division race updates', 'Model projections and playoff odds', 'Notable trends and value'], bulletLabel: `${league} STORYLINES`, picks: null, matchup: null, pickLabel: null };
}

function buildDivisionContent(data, options) {
  const division = options?.mlbDivision || 'AL East';
  return { category: `${division.toUpperCase()} INTEL`, headline: `${division} Division Report`, subheadline: 'Competitive landscape and value plays.', bullets: ['Division standings and race dynamics', 'Team-by-team projections', 'Divisional matchup edges'], bulletLabel: 'DIVISION SIGNALS', picks: null, matchup: null, pickLabel: null };
}
