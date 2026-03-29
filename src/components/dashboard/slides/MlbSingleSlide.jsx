/**
 * MlbSingleSlide — Premium MLB IG post (1080×1350).
 *
 * Design inspired by the NCAAM GamePreviewSlide1 system but adapted
 * for a Daily Briefing / intelligence card format.
 *
 * Daily Briefing content sourced from MLB Home "Today's Intelligence Briefing."
 */

import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
import { parseBriefingToIntel } from '../../../features/mlb/contentStudio/normalizeMlbImagePayload';
import styles from './MlbSingleSlide.module.css';

/* ── Helper components ──────────────────────────────────────── */

function Mascot({ className }) {
  return (
    <img src="/mascot-mlb.png" alt="" className={className}
      crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
  );
}

function TeamLogo({ slug, className }) {
  const url = getMlbEspnLogoUrl(slug);
  if (!url) return null;
  return (
    <img src={url} alt="" className={className}
      crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
  );
}

function fmtPrice(ml) {
  if (ml == null) return '';
  const n = Number(ml);
  return n > 0 ? `+${n}` : `${n}`;
}

/* ── Signal chip (inspired by NCAAM ConvictionPill) ──────────── */

function SignalChip({ label, variant }) {
  const cls = variant === 'gold' ? styles.chipGold
    : variant === 'green' ? styles.chipGreen
    : variant === 'red' ? styles.chipRed
    : styles.chipDefault;
  return <span className={`${styles.signalChip} ${cls}`}>{label}</span>;
}

/* ── Main component ─────────────────────────────────────────── */

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
    console.error('[MlbSingleSlide] buildSlideContent error:', err);
    content = { category: 'MLB INTELLIGENCE', headline: 'Content unavailable' };
  }

  return (
    <div className={styles.artboard} {...rest}>
      {/* Background */}
      <div className={styles.bgBase} aria-hidden="true" />
      <div className={styles.bgGlow} aria-hidden="true" />
      <div className={styles.bgTopGlow} aria-hidden="true" />
      <div className={styles.bgNoise} aria-hidden="true" />

      {/* ── ZONE 1: Header ──────────────────────────── */}
      <div className={styles.headerZone}>
        <div className={styles.heroRow}>
          <h2 className={styles.heroTitle}>
            {template === 'daily' ? 'DAILY BRIEFING' : (content.category || 'MLB INTELLIGENCE')}
          </h2>
          <Mascot className={styles.heroMascot} />
        </div>
        <div className={styles.badgeRow}>
          <span className={styles.sectionBadge}>{content.category || 'MLB INTELLIGENCE'}</span>
        </div>
        <div className={styles.dateLine}>{today}</div>
      </div>

      {/* ── Matchup zone (game insights only) ──────── */}
      {content.matchup && (
        <div className={styles.matchupZone}>
          <div className={styles.matchupSide}>
            <TeamLogo slug={content.matchup.awaySlug} className={styles.matchupLogo} />
            <span className={styles.matchupName}>{content.matchup.awayName}</span>
          </div>
          <div className={styles.vsCenter}>
            <span className={styles.vsRing}>VS</span>
          </div>
          <div className={styles.matchupSide}>
            <TeamLogo slug={content.matchup.homeSlug} className={styles.matchupLogo} />
            <span className={styles.matchupName}>{content.matchup.homeName}</span>
          </div>
        </div>
      )}

      {/* ── ZONE 2: Hero briefing block ────────────── */}
      <div className={styles.heroZone}>
        <h3 className={styles.headline}>{content.headline}</h3>
        {content.subheadline && <p className={styles.subheadline}>{content.subheadline}</p>}
      </div>

      {/* ── Pick callout ───────────────────────────── */}
      {content.pickLabel && (
        <div className={styles.pickCallout}>
          <span className={styles.pickLabel}>{content.pickLabel}</span>
          {content.pickConfidence && (
            <SignalChip label={content.pickConfidence.toUpperCase()}
              variant={content.pickConfidence === 'high' ? 'green' : content.pickConfidence === 'medium' ? 'gold' : 'default'} />
          )}
        </div>
      )}

      {/* ── ZONE 3: Intelligence panel (glass) ─────── */}
      {content.bullets && content.bullets.length > 0 && (
        <div className={styles.intelPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelDot} />
            <span className={styles.panelTitle}>{content.bulletLabel || 'KEY INTEL'}</span>
          </div>
          <div className={styles.bulletGrid}>
            {content.bullets.map((b, i) => (
              <div key={i} className={styles.bulletRow}>
                <span className={styles.bulletAccent}>●</span>
                <span className={styles.bulletText}>{typeof b === 'string' ? b : b.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Picks panel ────────────────────────────── */}
      {content.picks && content.picks.length > 0 && (
        <div className={styles.intelPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelDot} />
            <span className={styles.panelTitle}>MAXIMUS'S PICKS</span>
          </div>
          <div className={styles.picksCols}>
            {content.picks.map((p, i) => (
              <div key={i} className={styles.pickCell}>
                <div className={styles.pickType}>{p.category}</div>
                <div className={styles.pickVal}>{p.label}</div>
                {p.confidence && (
                  <SignalChip label={p.confidence.toUpperCase()}
                    variant={p.confidence === 'high' ? 'green' : p.confidence === 'medium' ? 'gold' : 'default'} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ZONE 4: Market / board module ──────────── */}
      {(content.boardPulse || content.futuresPulse || content.marketSignals?.length > 0 || content.matchupsToWatch?.length > 0) && (
        <div className={styles.marketModule}>
          <div className={styles.panelHeader}>
            <span className={styles.panelDot} />
            <span className={styles.panelTitle}>MARKET INTEL</span>
          </div>

          {content.boardPulse && (
            <div className={styles.marketRow}>
              <span className={styles.marketIcon}>📊</span>
              <span className={styles.marketLabel}>BOARD PULSE</span>
              <span className={styles.marketVal}>{content.boardPulse}</span>
            </div>
          )}

          {content.futuresPulse && (
            <div className={styles.marketRow}>
              <span className={styles.marketIcon}>🏆</span>
              <span className={styles.marketLabel}>FUTURES</span>
              <span className={styles.marketVal}>{content.futuresPulse}</span>
            </div>
          )}

          {content.marketSignals?.map((s, i) => (
            <div key={i} className={styles.marketRow}>
              <span className={styles.marketIcon}>⚡</span>
              <span className={styles.marketVal}>{s}</span>
            </div>
          ))}

          {content.matchupsToWatch?.length > 0 && (
            <div className={styles.matchupsRow}>
              <span className={styles.matchupsLabel}>MATCHUPS TO WATCH</span>
              <div className={styles.matchupChips}>
                {content.matchupsToWatch.map((m, i) => (
                  <span key={i} className={styles.matchupChip}>{m.teamA} vs {m.teamB}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Team focus ─────────────────────────────── */}
      {content.teamFocus && (
        <div className={styles.teamFocusZone}>
          <TeamLogo slug={content.teamFocus.slug} className={styles.focusLogo} />
          <div className={styles.focusInfo}>
            <span className={styles.focusName}>{content.teamFocus.name}</span>
            {content.teamFocus.record && <span className={styles.focusRecord}>{content.teamFocus.record}</span>}
          </div>
        </div>
      )}

      {/* ── Footer ─────────────────────────────────── */}
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
    case 'picks':    return buildPicksContent(data, options);
    case 'league':   return buildLeagueContent(data, options);
    case 'division': return buildDivisionContent(data, options);
    case 'daily':
    default:         return buildDailyContent(data, options);
  }
}

function buildDailyContent(data, options) {
  const briefingText = data?.mlbBriefing;
  const intel = parseBriefingToIntel(briefingText);
  const picks = data?.mlbPicks ?? data?.canonicalPicks ?? {};
  const cats = picks?.categories ?? {};
  const games = data?.mlbGames ?? data?.games ?? [];

  // Market signals from picks board
  const marketSignals = [];
  if (cats.pickEms?.length) marketSignals.push(`${cats.pickEms.length} moneyline pick${cats.pickEms.length > 1 ? 's' : ''} qualified`);
  if (cats.ats?.length) marketSignals.push(`${cats.ats.length} run line signal${cats.ats.length > 1 ? 's' : ''}`);
  if (cats.leans?.length) marketSignals.push(`${cats.leans.length} value lean${cats.leans.length > 1 ? 's' : ''}`);
  if (cats.totals?.length) marketSignals.push(`${cats.totals.length} total${cats.totals.length > 1 ? 's' : ''} spot${cats.totals.length > 1 ? 's' : ''}`);

  // Board type signal
  const peCount = cats.pickEms?.length || 0;
  const leanCount = cats.leans?.length || 0;
  let boardType = null;
  if (peCount + leanCount > 0) {
    boardType = leanCount > peCount ? 'VALUE HEAVY' : peCount >= 3 ? 'FAVORITES BOARD' : 'MIXED BOARD';
  }

  if (intel) {
    return {
      category: 'MLB DAILY BRIEFING',
      headline: intel.headline,
      subheadline: intel.subhead || null,
      bullets: intel.bullets.slice(0, 4),
      bulletLabel: "TODAY'S INTELLIGENCE",
      boardPulse: intel.boardPulse || (games.length > 0 ? `${games.length} games across today's slate` : null),
      futuresPulse: null, // will be populated when championship odds are wired in
      matchupsToWatch: intel.keyMatchups?.slice(0, 2) || null,
      marketSignals: marketSignals.slice(0, 2),
      picks: null, matchup: null, pickLabel: null,
    };
  }

  // Fallback
  const headlines = data?.mlbHeadlines ?? [];
  const headline = headlines?.[0]?.headline || headlines?.[0]?.title || `${games.length} games on today's MLB slate`;
  const bullets = [];
  for (const h of headlines.slice(0, 3)) {
    const text = h.headline || h.title || '';
    if (text) bullets.push(text);
  }
  return {
    category: 'MLB DAILY BRIEFING',
    headline,
    subheadline: 'Full slate analysis and model-driven picks.',
    bullets: bullets.slice(0, 4),
    bulletLabel: "TODAY'S HEADLINES",
    boardPulse: games.length > 0 ? `${games.length} games on the slate` : null,
    marketSignals: marketSignals.slice(0, 2),
    picks: null, matchup: null, pickLabel: null,
  };
}

function buildTeamContent(teamData, options) {
  const team = teamData?.team ?? options?.mlbTeam;
  const slug = team?.slug || '';
  const name = team?.name || team?.displayName || slug;
  return {
    category: 'MLB TEAM INTEL', headline: `${name} Intel Report`,
    subheadline: 'Full model-driven team breakdown and projections.',
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
  const ml = game.homeML ?? game.moneyline?.home;
  const bullets = [];
  if (spread != null) bullets.push(`Run Line: ${homeName} ${parseFloat(spread) > 0 ? '+' : ''}${spread}`);
  if (total != null) bullets.push(`Total: ${total}`);
  if (ml != null) bullets.push(`Moneyline: ${homeName} ${fmtPrice(ml)}`);
  return {
    category: 'MLB GAME PREVIEW', headline: `${awayName} at ${homeName}`,
    subheadline: options?.gameAngle === 'story' ? 'Key storylines and matchup dynamics.' : 'Value-driven analysis and model edges.',
    matchup: { awayName, homeName, awaySlug: game.awaySlug || '', homeSlug: game.homeSlug || '', time: game.time || '' },
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
  addPick('VALUE LEAN', 'Value', cats.leans);
  addPick('TOTAL', 'Over/Under', cats.totals);
  const topPick = pickRows[0];
  return {
    category: "MAXIMUS'S PICKS",
    headline: topPick ? `Today's top play: ${topPick.label}` : 'No strong lean on today\'s slate',
    subheadline: pickRows.length > 0 ? `${pickRows.length} qualified pick${pickRows.length !== 1 ? 's' : ''} across today's board.` : 'Model is waiting for stronger signal alignment.',
    picks: pickRows, bullets: null, matchup: null,
    pickLabel: topPick?.label || null, pickConfidence: topPick?.confidence || null,
  };
}

function buildLeagueContent(data, options) {
  const league = options?.mlbLeague || 'AL';
  return {
    category: `${league === 'AL' ? 'AMERICAN' : 'NATIONAL'} LEAGUE INTEL`,
    headline: `${league === 'AL' ? 'American' : 'National'} League Overview`,
    subheadline: `Key storylines and competitive dynamics across the ${league}.`,
    bullets: ['Division race updates and standings impact', 'Model projections and playoff probabilities', 'Notable trends and emerging value'],
    bulletLabel: `${league} STORYLINES`, picks: null, matchup: null, pickLabel: null,
  };
}

function buildDivisionContent(data, options) {
  const division = options?.mlbDivision || 'AL East';
  return {
    category: `${division.toUpperCase()} INTEL`, headline: `${division} Division Report`,
    subheadline: `Competitive landscape, projections, and value plays.`,
    bullets: ['Division standings and race dynamics', 'Team-by-team model projections', 'Divisional matchup edges and trends'],
    bulletLabel: 'DIVISION SIGNALS', picks: null, matchup: null, pickLabel: null,
  };
}
