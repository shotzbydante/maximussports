/**
 * MlbSingleSlide — Premium full-canvas MLB IG post (1080×1350).
 *
 * Three-zone layout:
 *   Header/Hero → Editorial → World Series Outlook (6 uniform cards)
 *
 * All 6 outlook cards are equal size in a 3×2 grid.
 * Leaders get hierarchy through styling (glow, border, label), not box size.
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

/**
 * Build the 6 team entries for the outlook section.
 * Source of truth: getTeamProjection() from seasonModel.js — the same
 * engine used on the MLB Season Intelligence page.
 */
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

  const ordered = [];
  const maxLen = Math.max(al.length, nl.length);
  for (let i = 0; i < maxLen; i++) {
    if (al[i]) ordered.push({ ...al[i], rank: i + 1 });
    if (nl[i]) ordered.push({ ...nl[i], rank: i + 1 });
  }
  return ordered;
}

/**
 * Build editorial blocks — 1 concise sentence each for social readability.
 * Maps directly to the Home page Today's Intelligence Briefing structure:
 *   HOT OFF THE PRESS    → P1 (Around the League)
 *   PENNANT RACE INSIGHTS → P3 (Pennant Race & Division Watch)
 *   MARKET SIGNAL         → P2 (World Series Odds Pulse)
 */
const EDITORIAL_MAP = [
  { title: 'HOT OFF THE PRESS', paraIdx: 0 },
  { title: 'PENNANT RACE INSIGHTS', paraIdx: 2 },
  { title: 'MARKET SIGNAL', paraIdx: 1 },
];

function buildEditorialBlocks(intel) {
  if (!intel?.rawParagraphs?.length) return null;
  const blocks = [];

  for (const mapping of EDITORIAL_MAP) {
    const para = intel.rawParagraphs[mapping.paraIdx];
    if (!para) continue;
    const cleaned = stripEmojis(para);
    if (!cleaned || cleaned.length < 30) continue;

    const labelMatch = cleaned.match(/^([A-Z][A-Z\s&+\-:]*[A-Z])\s*[:—–-]\s*/);
    const bodyText = labelMatch ? cleaned.slice(labelMatch[0].length) : cleaned;
    // Take 1 sentence only — concise editorial blurb
    const sentences = bodyText.match(/[^.!?]*[.!?]+/g) || [bodyText];
    const body = sentences[0]?.trim();

    if (!body || body.length < 20) continue;
    blocks.push({ title: mapping.title, body });
  }

  if (blocks.length < 3) {
    const usedIndices = new Set(EDITORIAL_MAP.map(m => m.paraIdx));
    const fallbackTitles = ['HOT OFF THE PRESS', 'PENNANT RACE INSIGHTS', 'MARKET SIGNAL'];
    for (let i = 0; i < intel.rawParagraphs.length && blocks.length < 3; i++) {
      if (usedIndices.has(i)) continue;
      const cleaned = stripEmojis(intel.rawParagraphs[i]);
      if (!cleaned || cleaned.length < 30) continue;
      const sentences = cleaned.match(/[^.!?]*[.!?]+/g) || [cleaned];
      const body = sentences[0]?.trim();
      if (!body || body.length < 20) continue;
      blocks.push({ title: fallbackTitles[blocks.length] || 'INTEL', body });
    }
  }

  return blocks.length > 0 ? blocks : null;
}

/** Inline SVG icons for editorial sections */
function BoltIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={styles.editorialIcon}>
      <path d="M8.5 1L3 9h4.5l-1 6L13 7H8.5l1-6z" stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PennantIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={styles.editorialIcon}>
      <path d="M3 2v12M3 3l9 2.5L3 8" stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PulseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={styles.editorialIcon}>
      <polyline points="1,8 4,8 6,3 8,12 10,6 12,8 15,8" stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const EDITORIAL_ICONS = {
  'HOT OFF THE PRESS': BoltIcon,
  'PENNANT RACE INSIGHTS': PennantIcon,
  'MARKET SIGNAL': PulseIcon,
};

function getCardLabel(t) {
  if (t.rank === 1) return `${t.league} LEADER`;
  return `${t.league} ${t.rank}`;
}

/** Compact market stance label */
function fmtStance(stance) {
  if (!stance) return '';
  if (stance.includes('above')) return 'Above mkt';
  if (stance.includes('below')) return 'Below mkt';
  if (stance.includes('Aligned')) return 'At mkt';
  if (stance.includes('Near')) return 'Near mkt';
  return stance;
}

function TeamCard({ t }) {
  const isLeader = t.rank === 1;
  return (
    <div className={`${styles.teamCard} ${isLeader ? styles.teamCardLeader : ''}`}>
      {/* Top row: label + identity left, odds badge right */}
      <div className={styles.tcTopRow}>
        <div className={styles.tcTopLeft}>
          <span className={styles.tcLabel}>{getCardLabel(t)}</span>
          <div className={styles.tcIdentity}>
            <TeamLogo slug={t.slug} size={isLeader ? 34 : 26} />
            <span className={styles.tcName}>{t.abbrev}</span>
          </div>
        </div>
        <div className={styles.tcOddsBlock}>
          <span className={styles.tcOddsLabel}>WS</span>
          <span className={styles.tcOddsValue}>{fmtOdds(t.odds)}</span>
        </div>
      </div>
      {/* Hero: projected wins */}
      <div className={styles.tcHero}>
        <span className={styles.tcHeroWins}>{t.projectedWins}</span>
        <span className={styles.tcHeroLabel}>PROJ. WINS</span>
        {t.signals?.[0] && <span className={styles.tcSignal}>{t.signals[0]}</span>}
      </div>
      {/* Supporting meta */}
      <div className={styles.tcSupport}>
        <span className={styles.tcMeta}>
          {t.confidenceTier}{t.marketDelta != null ? ` · ${fmtDelta(t.marketDelta)} vs mkt` : ''}
        </span>
        <span className={styles.tcDriver}>
          {t.strongestDriver || '—'} · {fmtStance(t.marketStance)}
        </span>
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

      {/* ── EDITORIAL — 3 separate premium cards with icons ── */}
      {content.editorialBlocks?.length > 0 && (
        <div className={styles.editorialSection}>
          {content.editorialBlocks.map((block, i) => {
            const IconComponent = EDITORIAL_ICONS[block.title];
            return (
              <div key={i} className={styles.editorialCard}>
                <div className={styles.editorialCardHeader}>
                  {IconComponent && <IconComponent />}
                  <span className={styles.editorialCardLabel}>{block.title}</span>
                </div>
                <div className={styles.editorialCardBody}>{block.body}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Bullets fallback ── */}
      {!content.editorialBlocks && content.bullets?.length > 0 && (
        <div className={styles.editorialSection}>
          <div className={styles.editorialCard}>
            <div className={styles.editorialCardHeader}>
              <span className={styles.editorialCardLabel}>{content.bulletLabel || 'KEY INTEL'}</span>
            </div>
            <div className={styles.editorialCardBody}>
              {content.bullets.map((b, i) => (
                <div key={i}>{typeof b === 'string' ? b : b.text}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Picks ── */}
      {content.picks?.length > 0 && (
        <div className={styles.editorialSection}>
          <div className={styles.editorialCard}>
            <div className={styles.editorialCardHeader}>
              <span className={styles.editorialCardLabel}>MAXIMUS'S PICKS</span>
            </div>
            <div className={styles.picksGrid}>
              {content.picks.map((p, i) => (<div key={i} className={styles.pickCell}><span className={styles.pickType}>{p.category}</span><span className={styles.pickVal}>{p.label}</span></div>))}
            </div>
          </div>
        </div>
      )}

      {/* ── WORLD SERIES OUTLOOK — 6 uniform cards in 3×2 grid ── */}
      {content.seasonIntel && (
        <div className={styles.outlookSection}>
          <h3 className={styles.outlookTitle}>WORLD SERIES OUTLOOK</h3>
          <div className={styles.outlookGrid}>
            {content.seasonIntel.map((t, i) => (
              <TeamCard key={i} t={t} />
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

/** Shorten a headline to one concise sentence, max 60 chars. */
function shortenHeadline(text) {
  if (!text) return 'MLB Intelligence Briefing';
  const cleaned = stripEmojis(text);
  const sentences = cleaned.match(/[^.!?]*[.!?]+/g);
  const first = sentences?.[0]?.trim() || cleaned;
  if (first.length > 60) {
    return first.slice(0, 58).replace(/\s+\S*$/, '') + '.';
  }
  return first;
}

/** Shorten subhead to one sentence, max 80 chars. */
function shortenSubhead(text) {
  if (!text) return null;
  const cleaned = stripEmojis(text);
  const sentences = cleaned.match(/[^.!?]*[.!?]+/g);
  const first = sentences?.[0]?.trim() || cleaned;
  if (first.length > 80) {
    return first.slice(0, 78).replace(/\s+\S*$/, '') + '.';
  }
  return first;
}

function buildDailyContent(data) {
  const intel = parseBriefingToIntel(data?.mlbBriefing);
  const champOdds = data?.mlbChampOdds ?? {};
  const seasonIntel = buildSeasonIntelLeaders(champOdds);
  const editorialBlocks = buildEditorialBlocks(intel);
  return {
    category: 'MLB DAILY BRIEFING',
    headline: intel?.headline ? shortenHeadline(intel.headline) : 'MLB Intelligence Briefing',
    subheadline: intel?.subhead ? shortenSubhead(intel.subhead) : null,
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
