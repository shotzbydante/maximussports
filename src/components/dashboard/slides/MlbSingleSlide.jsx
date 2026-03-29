/**
 * MlbSingleSlide — Single-image MLB IG post.
 *
 * All MLB Content Studio sections output EXACTLY ONE slide.
 * This is the universal MLB slide component that adapts its layout
 * based on the template type (daily, team, game, picks, division, league).
 *
 * The Daily Briefing template sources content from MLB Home's
 * "Today's Intelligence Briefing" (mlbBriefing field in data).
 *
 * 1080×1350 artboard (IG 4:5).
 */

import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
import { parseBriefingToIntel } from '../../../features/mlb/contentStudio/normalizeMlbImagePayload';
import styles from './MlbSingleSlide.module.css';

function MlbLogo({ className }) {
  return (
    <img
      src="/mlb-logo.png"
      alt="MLB"
      className={className}
      crossOrigin="anonymous"
      onError={e => {
        const span = document.createElement('span');
        span.textContent = 'MLB';
        span.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;letter-spacing:0.12em;color:rgba(255,255,255,0.55);text-transform:uppercase;';
        e.currentTarget.replaceWith(span);
      }}
    />
  );
}

function Mascot({ className }) {
  return (
    <img
      src="/mascot-mlb.png"
      alt="Maximus"
      className={className}
      crossOrigin="anonymous"
      onError={e => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

function TeamLogo({ slug, className }) {
  const url = getMlbEspnLogoUrl(slug);
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      className={className}
      crossOrigin="anonymous"
      onError={e => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

function fmtPrice(ml) {
  if (ml == null) return '';
  const n = Number(ml);
  return n > 0 ? `+${n}` : `${n}`;
}

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
    content = { category: 'MLB INTELLIGENCE', headline: 'Content unavailable', subheadline: 'Try regenerating or switching sections.' };
  }
  const categoryLabel = content.category || 'MLB INTELLIGENCE';

  return (
    <div className={styles.artboard} {...rest}>
      {/* Background layers */}
      <div className={styles.bgBase} aria-hidden="true" />
      <div className={styles.bgGlow} aria-hidden="true" />
      <div className={styles.bgNoise} aria-hidden="true" />

      {/* Mascot + Header */}
      <header className={styles.header}>
        <Mascot className={styles.mascot} />
        <div className={styles.brandRow}>
          <img src="/logo.png" alt="Maximus Sports" className={styles.brandLogo} crossOrigin="anonymous" />
          <span className={styles.brandName}>MAXIMUS SPORTS</span>
        </div>
        <span className={styles.intelChip}>{categoryLabel}</span>
      </header>

      {/* Date */}
      <div className={styles.dateZone}>
        <span className={styles.dateLabel}>{today}</span>
      </div>

      {/* Matchup zone (game insights) */}
      {content.matchup && (
        <div className={styles.matchupZone}>
          <div className={styles.matchupTeam}>
            <TeamLogo slug={content.matchup.awaySlug} className={styles.matchupLogo} />
            <span className={styles.matchupTeamName}>{content.matchup.awayName}</span>
          </div>
          <span className={styles.vsText}>VS</span>
          <div className={styles.matchupTeam}>
            <TeamLogo slug={content.matchup.homeSlug} className={styles.matchupLogo} />
            <span className={styles.matchupTeamName}>{content.matchup.homeName}</span>
          </div>
        </div>
      )}

      {/* Headline */}
      <div className={styles.headlineZone}>
        <h2 className={styles.headline}>{content.headline}</h2>
        {content.subheadline && <p className={styles.subheadline}>{content.subheadline}</p>}
      </div>

      {/* Pick callout */}
      {content.pickLabel && (
        <div className={styles.pickCallout}>
          <span className={styles.pickLabel}>{content.pickLabel}</span>
          {content.pickConfidence && (
            <span className={`${styles.pickConf} ${styles[`conf_${content.pickConfidence}`] || ''}`}>
              {content.pickConfidence.toUpperCase()}
            </span>
          )}
        </div>
      )}

      {/* Picks panel */}
      {content.picks && content.picks.length > 0 && (
        <div className={styles.glassPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.sectionDot} />
            MAXIMUS'S PICKS
          </div>
          <div className={styles.picksList}>
            {content.picks.map((p, i) => (
              <div key={i} className={styles.pickRow}>
                <span className={styles.pickRowCategory}>{p.category}</span>
                <span className={styles.pickRowLabel}>{p.label}</span>
                {p.confidence && (
                  <span className={`${styles.pickRowConf} ${styles[`conf_${p.confidence}`] || ''}`}>
                    {p.confidence.toUpperCase()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Intel bullets — glass panel */}
      {content.bullets && content.bullets.length > 0 && (
        <div className={styles.glassPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.sectionDot} />
            {content.bulletLabel || 'KEY INTEL'}
          </div>
          <ul className={styles.bulletList}>
            {content.bullets.map((b, i) => (
              <li key={i} className={styles.bulletItem}>
                <span className={styles.bulletMarker}>•</span>
                <span className={styles.bulletText}>{typeof b === 'string' ? b : b.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Board pulse */}
      {content.boardPulse && (
        <div className={styles.boardPulse}>
          <span className={styles.boardPulseIcon}>📊</span>
          <span className={styles.boardPulseText}>{content.boardPulse}</span>
        </div>
      )}

      {/* Matchups to watch */}
      {content.matchupsToWatch && content.matchupsToWatch.length > 0 && (
        <div className={styles.matchupsRow}>
          {content.matchupsToWatch.map((m, i) => (
            <span key={i} className={styles.matchupChip}>
              {m.teamA} vs {m.teamB}
            </span>
          ))}
        </div>
      )}

      {/* Team focus */}
      {content.teamFocus && (
        <div className={styles.teamFocusZone}>
          <TeamLogo slug={content.teamFocus.slug} className={styles.focusLogo} />
          <div className={styles.focusInfo}>
            <span className={styles.focusName}>{content.teamFocus.name}</span>
            {content.teamFocus.record && <span className={styles.focusRecord}>{content.teamFocus.record}</span>}
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

// ──────────────────────────────────────────────────────────────
// Content builders per template type
// ──────────────────────────────────────────────────────────────

function buildSlideContent(template, data, teamData, game, options) {
  switch (template) {
    case 'team':   return buildTeamContent(teamData, options);
    case 'game':   return buildGameContent(game, data, options);
    case 'picks':  return buildPicksContent(data, options);
    case 'league': return buildLeagueContent(data, options);
    case 'division': return buildDivisionContent(data, options);
    case 'daily':
    default:       return buildDailyContent(data, options);
  }
}

/**
 * Daily Briefing — now sourced from MLB Home "Today's Intelligence Briefing".
 * Falls back to headlines only if briefing is unavailable.
 */
function buildDailyContent(data, options) {
  const briefingText = data?.mlbBriefing;
  const intel = parseBriefingToIntel(briefingText);

  // If we have the real briefing, use it
  if (intel) {
    return {
      category: 'MLB DAILY BRIEFING',
      headline: intel.headline,
      subheadline: intel.subhead || null,
      bullets: intel.bullets.slice(0, 4),
      bulletLabel: "TODAY'S INTELLIGENCE",
      boardPulse: intel.boardPulse || null,
      matchupsToWatch: intel.keyMatchups?.slice(0, 2) || null,
      picks: null,
      matchup: null,
      pickLabel: null,
    };
  }

  // Fallback: headlines / game count
  const games = data?.mlbGames ?? data?.games ?? [];
  const gamesCount = games.length;
  const headlines = data?.mlbHeadlines ?? [];
  const headline = headlines?.[0]?.headline || headlines?.[0]?.title
    || `${gamesCount} game${gamesCount !== 1 ? 's' : ''} on today's MLB slate`;

  const bullets = [];
  for (const h of headlines.slice(0, 3)) {
    const text = h.headline || h.title || '';
    if (text) bullets.push(text);
  }
  if (gamesCount > 0) bullets.push(`${gamesCount} games across the MLB schedule today`);

  return {
    category: 'MLB DAILY BRIEFING',
    headline,
    subheadline: 'Full slate analysis and model-driven picks for today\'s MLB action.',
    bullets: bullets.slice(0, 4),
    bulletLabel: "TODAY'S HEADLINES",
    picks: null,
    matchup: null,
    pickLabel: null,
  };
}

function buildTeamContent(teamData, options) {
  const team = teamData?.team ?? options?.mlbTeam;
  const slug = team?.slug || '';
  const name = team?.name || team?.displayName || slug;
  return {
    category: 'MLB TEAM INTEL',
    headline: `${name} Intel Report`,
    subheadline: 'Full model-driven team breakdown and projections.',
    teamFocus: { slug, name, record: team?.record },
    bullets: ['Season projection and model confidence', 'Rotation depth and bullpen analysis', 'Market positioning and value signals'],
    picks: null, matchup: null, pickLabel: null,
  };
}

function buildGameContent(game, data, options) {
  if (!game) {
    return { category: 'MLB GAME PREVIEW', headline: 'Select a game to generate a preview', subheadline: null, bullets: [], picks: null, matchup: null, pickLabel: null };
  }
  const awayName = game.awayTeam || 'Away';
  const homeName = game.homeTeam || 'Home';
  const awaySlug = game.awaySlug || '';
  const homeSlug = game.homeSlug || '';
  const spread = game.homeSpread ?? game.spread;
  const total = game.total;
  const ml = game.homeML ?? game.moneyline?.home;
  const bullets = [];
  if (spread != null) bullets.push(`Run Line: ${homeName} ${parseFloat(spread) > 0 ? '+' : ''}${spread}`);
  if (total != null) bullets.push(`Total: ${total}`);
  if (ml != null) bullets.push(`Moneyline: ${homeName} ${fmtPrice(ml)}`);
  return {
    category: 'MLB GAME PREVIEW',
    headline: `${awayName} at ${homeName}`,
    subheadline: options?.gameAngle === 'story' ? 'Key storylines and matchup dynamics.' : 'Value-driven analysis and model edges.',
    matchup: { awayName, homeName, awaySlug, homeSlug, awayRecord: game.awayRecord, homeRecord: game.homeRecord, time: game.time || '' },
    bullets, bulletLabel: 'MARKET SNAPSHOT', picks: null, pickLabel: null,
  };
}

function buildPicksContent(data, options) {
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
    subheadline: pickRows.length > 0 ? `${pickRows.length} qualified pick${pickRows.length !== 1 ? 's' : ''} across today's MLB board.` : 'Model is waiting for stronger signal alignment.',
    picks: pickRows, bullets: null, matchup: null, pickLabel: topPick?.label || null, pickConfidence: topPick?.confidence || null,
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
    category: `${division.toUpperCase()} INTEL`,
    headline: `${division} Division Report`,
    subheadline: `Competitive landscape, projections, and value plays within the ${division}.`,
    bullets: ['Division standings and race dynamics', 'Team-by-team model projections', 'Divisional matchup edges and trends'],
    bulletLabel: 'DIVISION SIGNALS', picks: null, matchup: null, pickLabel: null,
  };
}
