/**
 * MlbSingleSlide — Premium full-canvas MLB IG post (1080×1350).
 *
 * NCAAM Game Intel-inspired layout:
 *   Header → Hero → Editorial → 2 Featured + 4 Secondary team cards
 *
 * Hierarchy: fewer, larger objects. Clear focal point.
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

function buildSeasonIntelLeaders(champOdds) {
  const entries = [];
  for (const team of MLB_TEAMS) {
    const proj = getTeamProjection(team.slug);
    if (!proj || !proj.projectedWins) continue;
    const oddsData = champOdds?.[team.slug];
    const oddsVal = oddsData?.bestChanceAmerican ?? oddsData?.american ?? null;
    entries.push({
      slug: team.slug, abbrev: team.abbrev, league: team.league,
      projectedWins: proj.projectedWins, odds: oddsVal,
      confidenceTier: proj.confidenceTier ?? null,
      marketDelta: proj.marketDelta ?? null,
      strongestDriver: proj.takeaways?.strongestDriver ?? null,
      marketStance: proj.takeaways?.marketStance ?? null,
      signals: proj.signals ?? [],
    });
  }
  entries.sort((a, b) => (b.projectedWins ?? 0) - (a.projectedWins ?? 0));
  const al = entries.filter(e => e.league === 'AL').slice(0, 3);
  const nl = entries.filter(e => e.league === 'NL').slice(0, 3);
  if (al.length === 0 && nl.length === 0) return null;
  // Featured = top 1 from each league. Secondary = remaining 2 from each.
  return {
    featured: [al[0], nl[0]].filter(Boolean),
    secondary: [...al.slice(1), ...nl.slice(1)],
  };
}

const EDITORIAL_TITLES = ['HOT OFF THE PRESS', 'PENNANT RACE INSIGHTS', 'MARKET SIGNAL', 'DIAMOND DISPATCH'];

function buildEditorialBlocks(intel) {
  if (!intel?.rawParagraphs?.length) return null;
  const blocks = [];
  const usedTeams = new Set();
  for (let i = 0; i < Math.min(intel.rawParagraphs.length, 4); i++) {
    if (blocks.length >= 3) break; // max 3 for space
    const para = intel.rawParagraphs[i];
    const cleaned = stripEmojis(para);
    if (!cleaned || cleaned.length < 30) continue;
    let primaryTeam = null;
    for (const t of (intel.teamMentions || [])) {
      if (cleaned.toLowerCase().includes(t.toLowerCase())) {
        if (!usedTeams.has(t.toLowerCase())) { primaryTeam = t; break; }
      }
    }
    if (primaryTeam) usedTeams.add(primaryTeam.toLowerCase());
    const sentences = cleaned.match(/[^.!?]*[.!?]+/g) || [cleaned];
    const body = sentences.slice(0, blocks.length === 0 ? 2 : 1).join(' ').trim();
    if (body.length < 20) continue;
    blocks.push({ title: EDITORIAL_TITLES[blocks.length] || 'INTEL', body });
  }
  return blocks.length > 0 ? blocks : null;
}

/** Featured (large) team card — AL or NL leader */
function FeaturedCard({ t }) {
  return (
    <div className={styles.featuredCard}>
      <div className={styles.fcTop}>
        <TeamLogo slug={t.slug} size={48} />
        <div className={styles.fcInfo}>
          <span className={styles.fcName}>{t.abbrev}</span>
          {t.odds != null && <span className={styles.fcOdds}>{fmtOdds(t.odds)}</span>}
        </div>
      </div>
      <div className={styles.fcStats}>
        <span className={styles.fcWins}>Projected wins: <strong>{t.projectedWins}</strong></span>
        {t.signals?.[0] && <span className={styles.fcSignal}>{t.signals[0]}</span>}
      </div>
      <div className={styles.fcMeta}>
        {t.confidenceTier && <>{t.confidenceTier}</>}
        {t.marketDelta != null && <> · {fmtDelta(t.marketDelta)} vs mkt</>}
      </div>
      <div className={styles.fcDriver}>
        {t.strongestDriver && <>Key driver: {t.strongestDriver}</>}
        {t.marketStance && <> · {t.marketStance}</>}
      </div>
    </div>
  );
}

/** Secondary (compact) team card */
function SecondaryCard({ t }) {
  return (
    <div className={styles.secCard}>
      <div className={styles.scRow1}>
        <TeamLogo slug={t.slug} size={26} />
        <span className={styles.scName}>{t.abbrev}</span>
        {t.odds != null && <span className={styles.scOdds}>{fmtOdds(t.odds)}</span>}
      </div>
      <div className={styles.scRow2}>
        <strong>{t.projectedWins}W</strong> · {t.confidenceTier || '—'} · {fmtDelta(t.marketDelta)} vs mkt
      </div>
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
        <div className={styles.headerRow}>
          <div className={styles.brandRow}>
            <img src="/logo.png" alt="" className={styles.brandLogo} crossOrigin="anonymous" />
            <span className={styles.brandName}>MAXIMUS SPORTS</span>
          </div>
          <Mascot />
        </div>
        <div className={styles.heroBadgeRow}>
          <img src="/mlb-logo.png" alt="" className={styles.mlbCrest} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
          <span className={styles.heroBadge}>{content.category || 'MLB DAILY BRIEFING'}</span>
        </div>
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

      {/* ── EDITORIAL ── */}
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

      {/* ── WORLD SERIES OUTLOOK — 2 Featured + 4 Secondary ── */}
      {content.seasonIntel && (
        <div className={styles.outlookSection}>
          <div className={styles.panelHead}><span className={styles.panelDot} /><span className={styles.panelLabel}>WORLD SERIES OUTLOOK</span></div>

          {/* Featured: 2 large cards side by side */}
          {content.seasonIntel.featured?.length > 0 && (
            <div className={styles.featuredRow}>
              {content.seasonIntel.featured.map((t, i) => (
                <FeaturedCard key={i} t={t} />
              ))}
            </div>
          )}

          {/* Secondary: 4 compact cards in 2x2 grid */}
          {content.seasonIntel.secondary?.length > 0 && (
            <div className={styles.secondaryGrid}>
              {content.seasonIntel.secondary.map((t, i) => (
                <SecondaryCard key={i} t={t} />
              ))}
            </div>
          )}
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
    editorialBlocks, seasonIntel,
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
  return { category: `${league === 'AL' ? 'AMERICAN' : 'NATIONAL'} LEAGUE INTEL`, headline: `${league === 'AL' ? 'American' : 'National'} League Overview`, subheadline: 'Key storylines.', bullets: ['Division race updates', 'Model projections', 'Notable trends'], bulletLabel: `${league} STORYLINES`, picks: null, matchup: null, pickLabel: null };
}

function buildDivisionContent(data, options) {
  const division = options?.mlbDivision || 'AL East';
  return { category: `${division.toUpperCase()} INTEL`, headline: `${division} Division Report`, subheadline: 'Competitive landscape.', bullets: ['Division standings', 'Team projections', 'Matchup edges'], bulletLabel: 'DIVISION SIGNALS', picks: null, matchup: null, pickLabel: null };
}
