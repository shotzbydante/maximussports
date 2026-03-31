/**
 * MlbSingleSlide — Premium full-canvas MLB IG post (1080×1350).
 *
 * Top ~50%: editorial briefing blocks (not bullets)
 * Bottom ~50%: compact 4-line Season Intelligence team cards
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
  return isNaN(n) ? String(v) : n > 0 ? `+${n}` : `${n}`;
}

function fmtDelta(v) {
  if (v == null) return '';
  const n = Number(v);
  return isNaN(n) ? '' : n > 0 ? `+${n}` : `${n}`;
}

function stripEmojis(text) {
  if (!text) return '';
  return text.replace(/[\u{1F300}-\u{1FAD6}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').replace(/\s{2,}/g, ' ').trim();
}

/** Top 3 AL + top 3 NL sorted by PROJECTED WINS (descending). */
function buildSeasonIntelLeaders(champOdds) {
  const entries = [];
  for (const team of MLB_TEAMS) {
    const proj = getTeamProjection(team.slug);
    if (!proj || !proj.projectedWins) continue;
    const oddsData = champOdds?.[team.slug];
    const oddsVal = oddsData?.bestChanceAmerican ?? oddsData?.american ?? null;
    entries.push({
      slug: team.slug, name: team.name, abbrev: team.abbrev, league: team.league,
      projectedWins: proj.projectedWins, odds: oddsVal,
      confidenceTier: proj.confidenceTier ?? null,
      marketDelta: proj.marketDelta ?? null,
      strongestDriver: proj.takeaways?.strongestDriver ?? null,
      marketStance: proj.takeaways?.marketStance ?? null,
    });
  }
  entries.sort((a, b) => (b.projectedWins ?? 0) - (a.projectedWins ?? 0));
  const al = entries.filter(e => e.league === 'AL').slice(0, 3);
  const nl = entries.filter(e => e.league === 'NL').slice(0, 3);
  if (al.length === 0 && nl.length === 0) return null;
  return { al, nl };
}

// ── Editorial section titles mapped to briefing paragraph positions ──
const EDITORIAL_TITLES = [
  'HOT OFF THE PRESS',
  'PENNANT RACE INSIGHTS',
  'MARKET SIGNAL',
  'DIAMOND DISPATCH',
];

/**
 * Build editorial blocks from the 5-paragraph briefing.
 * Each block has a title and 1-2 sentence body. No duplicate teams.
 */
function buildEditorialBlocks(intel) {
  if (!intel?.rawParagraphs?.length) return null;
  const blocks = [];
  const usedTeams = new Set();

  for (let i = 0; i < Math.min(intel.rawParagraphs.length, 4); i++) {
    if (blocks.length >= 4) break;
    const para = intel.rawParagraphs[i];
    const cleaned = stripEmojis(para);
    if (!cleaned || cleaned.length < 30) continue;

    // Check team dedup
    let primaryTeam = null;
    for (const t of (intel.teamMentions || [])) {
      if (cleaned.toLowerCase().includes(t.toLowerCase())) {
        if (!usedTeams.has(t.toLowerCase())) { primaryTeam = t; break; }
      }
    }
    if (primaryTeam) usedTeams.add(primaryTeam.toLowerCase());

    // Extract sentences — first block gets 2, rest get 1 for mobile scanability
    const sentences = cleaned.match(/[^.!?]*[.!?]+/g) || [cleaned];
    const maxSentences = blocks.length === 0 ? 2 : 1;
    const body = sentences.slice(0, maxSentences).join(' ').trim();
    if (body.length < 20) continue;

    blocks.push({
      title: EDITORIAL_TITLES[blocks.length] || 'INTEL',
      body,
      slug: primaryTeam ? resolveSlug(primaryTeam) : null,
    });
  }

  return blocks.length > 0 ? blocks : null;
}

/** 4-line team card */
function TeamIntelCard({ t }) {
  // Line 3: confidence + delta combined
  const confLine = [
    t.confidenceTier ? `Confidence: ${t.confidenceTier}` : null,
    t.marketDelta != null ? `${fmtDelta(t.marketDelta)} vs mkt` : null,
  ].filter(Boolean).join('  ');

  // Line 4: driver + stance combined
  const driverLine = [
    t.strongestDriver ? `Key driver: ${t.strongestDriver}` : null,
    t.marketStance ? t.marketStance : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className={styles.teamCard}>
      {/* Line 1: logo + name + odds */}
      <div className={styles.tcRow1}>
        <TeamLogo slug={t.slug} size={34} />
        <span className={styles.tcName}>{t.abbrev}</span>
        {t.odds != null && <span className={styles.tcOdds}>{fmtOdds(t.odds)}</span>}
      </div>
      {/* Line 2: projected wins */}
      <div className={styles.tcRow2}>Projected wins: <strong>{t.projectedWins}</strong></div>
      {/* Line 3: confidence + delta */}
      {confLine && <div className={styles.tcRow3}>{confLine}</div>}
      {/* Line 4: driver + stance */}
      {driverLine && <div className={styles.tcRow4}>{driverLine}</div>}
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

      {/* ── Matchup hero ── */}
      {content.matchup && (
        <div className={styles.matchupHero}>
          <div className={styles.matchupSide}><TeamLogo slug={content.matchup.awaySlug} size={48} /><span className={styles.matchupName}>{content.matchup.awayName}</span></div>
          <span className={styles.vsLabel}>VS</span>
          <div className={styles.matchupSide}><TeamLogo slug={content.matchup.homeSlug} size={48} /><span className={styles.matchupName}>{content.matchup.homeName}</span></div>
        </div>
      )}

      {/* ── AROUND THE LEAGUE — editorial blocks ── */}
      {content.editorialBlocks?.length > 0 && (
        <div className={styles.editorialPanel}>
          <div className={styles.panelHead}><span className={styles.panelDot} /><span className={styles.panelLabel}>AROUND THE LEAGUE</span></div>
          <div className={styles.editorialList}>
            {content.editorialBlocks.map((block, i) => (
              <div key={i} className={styles.editorialBlock}>
                <span className={styles.editorialTitle}>{block.title}:</span>
                <span className={styles.editorialBody}> {block.body}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Bullets fallback ── */}
      {!content.editorialBlocks && content.bullets?.length > 0 && (
        <div className={styles.editorialPanel}>
          <div className={styles.panelHead}><span className={styles.panelDot} /><span className={styles.panelLabel}>{content.bulletLabel || 'KEY INTEL'}</span></div>
          <div className={styles.editorialList}>
            {content.bullets.map((b, i) => (
              <div key={i} className={styles.editorialBlock}><span className={styles.editorialBody}>{typeof b === 'string' ? b : b.text}</span></div>
            ))}
          </div>
        </div>
      )}

      {/* ── Picks ── */}
      {content.picks?.length > 0 && (
        <div className={styles.editorialPanel}>
          <div className={styles.panelHead}><span className={styles.panelDot} /><span className={styles.panelLabel}>MAXIMUS'S PICKS</span></div>
          <div className={styles.picksGrid}>
            {content.picks.map((p, i) => (<div key={i} className={styles.pickCell}><span className={styles.pickType}>{p.category}</span><span className={styles.pickVal}>{p.label}</span></div>))}
          </div>
        </div>
      )}

      {/* ── WORLD SERIES OUTLOOK ── */}
      {content.seasonIntel && (
        <div className={styles.outlookPanel}>
          <div className={styles.panelHead}><span className={styles.panelDot} /><span className={styles.panelLabel}>WORLD SERIES OUTLOOK — BY PROJECTED WINS</span></div>
          <div className={styles.outlookGrid}>
            {content.seasonIntel.al.length > 0 && (
              <div className={styles.outlookCol}>
                <span className={styles.leagueTag}>AMERICAN LEAGUE</span>
                {content.seasonIntel.al.map((t, i) => <TeamIntelCard key={i} t={t} />)}
              </div>
            )}
            {content.seasonIntel.nl.length > 0 && (
              <div className={styles.outlookCol}>
                <span className={styles.leagueTag}>NATIONAL LEAGUE</span>
                {content.seasonIntel.nl.map((t, i) => <TeamIntelCard key={i} t={t} />)}
              </div>
            )}
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
  const editorialBlocks = buildEditorialBlocks(intel);

  return {
    category: 'MLB DAILY BRIEFING',
    headline: intel?.headline ? stripEmojis(intel.headline) : 'MLB Intelligence Briefing',
    subheadline: intel?.subhead ? stripEmojis(intel.subhead) : null,
    editorialBlocks,
    seasonIntel,
    picks: null, matchup: null, pickLabel: null,
  };
}

function buildTeamContent(teamData, options) {
  const team = teamData?.team ?? options?.mlbTeam;
  const slug = team?.slug || ''; const name = team?.name || slug;
  return { category: 'MLB TEAM INTEL', headline: `${name} Intel Report`, subheadline: 'Model-driven team breakdown.', teamFocus: { slug, name, record: team?.record }, bullets: ['Season projection and model confidence', 'Rotation depth and bullpen analysis', 'Market positioning and value signals'], picks: null, matchup: null, pickLabel: null };
}

function buildGameContent(game, data, options) {
  if (!game) return { category: 'MLB GAME PREVIEW', headline: 'Select a game to preview', bullets: [], picks: null, matchup: null, pickLabel: null };
  const awayName = game.awayTeam || 'Away'; const homeName = game.homeTeam || 'Home';
  const spread = game.homeSpread ?? game.spread; const total = game.total;
  const bullets = [];
  if (spread != null) bullets.push(`Run Line: ${homeName} ${parseFloat(spread) > 0 ? '+' : ''}${spread}`);
  if (total != null) bullets.push(`Total: ${total}`);
  return { category: 'MLB GAME PREVIEW', headline: `${awayName} at ${homeName}`, subheadline: options?.gameAngle === 'story' ? 'Key storylines.' : 'Value-driven analysis.', matchup: { awayName, homeName, awaySlug: game.awaySlug || '', homeSlug: game.homeSlug || '' }, bullets, bulletLabel: 'MARKET SNAPSHOT', picks: null, pickLabel: null };
}

function buildPicksContent(data) {
  const cp = data?.canonicalPicks ?? data?.mlbPicks ?? {}; const cats = cp?.categories ?? {};
  const pickRows = [];
  const addPick = (cat, label, items) => { const top = items?.[0]; if (top) pickRows.push({ category: cat, label: top.pick?.label || label, confidence: top.confidence }); };
  addPick("PICK 'EM", 'Moneyline', cats.pickEms); addPick('RUN LINE', 'Spread', cats.ats); addPick('TOTAL', 'Over/Under', cats.totals);
  const topPick = pickRows[0];
  return { category: "MAXIMUS'S PICKS", headline: topPick ? `Top play: ${topPick.label}` : 'No strong lean today', subheadline: pickRows.length > 0 ? `${pickRows.length} qualified picks.` : 'Waiting for stronger signals.', picks: pickRows, bullets: null, matchup: null, pickLabel: topPick?.label || null, pickConfidence: topPick?.confidence || null };
}

function buildLeagueContent(data, options) {
  const league = options?.mlbLeague || 'AL';
  return { category: `${league === 'AL' ? 'AMERICAN' : 'NATIONAL'} LEAGUE INTEL`, headline: `${league === 'AL' ? 'American' : 'National'} League Overview`, subheadline: 'Key storylines and competitive dynamics.', bullets: ['Division race updates', 'Model projections and playoff odds', 'Notable trends and value'], bulletLabel: `${league} STORYLINES`, picks: null, matchup: null, pickLabel: null };
}

function buildDivisionContent(data, options) {
  const division = options?.mlbDivision || 'AL East';
  return { category: `${division.toUpperCase()} INTEL`, headline: `${division} Division Report`, subheadline: 'Competitive landscape and value plays.', bullets: ['Division standings', 'Team-by-team projections', 'Divisional matchup edges'], bulletLabel: 'DIVISION SIGNALS', picks: null, matchup: null, pickLabel: null };
}
