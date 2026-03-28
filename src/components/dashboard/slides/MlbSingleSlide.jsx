/**
 * MlbSingleSlide — Single-image MLB IG post.
 *
 * All MLB Content Studio sections output EXACTLY ONE slide.
 * This is the universal MLB slide component that adapts its layout
 * based on the template type (daily, team, game, picks, division, league).
 *
 * 1080×1350 artboard (IG 4:5).
 */

import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
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

/** Format ML price like -132 or +210 */
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

  // Extract content based on template type
  const content = buildSlideContent(template, data, teamData, game, options);
  const categoryLabel = content.category || 'MLB INTELLIGENCE';

  return (
    <div className={styles.artboard} {...rest}>
      {/* Background layers */}
      <div className={styles.bgBase} aria-hidden="true" />
      <div className={styles.bgGlow} aria-hidden="true" />
      <div className={styles.bgNoise} aria-hidden="true" />

      {/* Broadcast header */}
      <header className={styles.header}>
        <div className={styles.logoRow}>
          <img src="/logo.png" alt="Maximus Sports" className={styles.brandLogo} crossOrigin="anonymous" />
          <div className={styles.logoMeta}>
            <span className={styles.brandName}>MAXIMUS SPORTS</span>
            <span className={styles.intelChip}>{categoryLabel}</span>
          </div>
        </div>
        <div className={styles.headerRight}>
          {asOf && <div className={styles.asOf}>As of {asOf}</div>}
          <div className={styles.maxIntel}>MAXIMUM INTELLIGENCE</div>
        </div>
      </header>

      <div className={styles.programStrip} aria-hidden="true" />

      {/* MLB crest + date */}
      <div className={styles.mlbLogoZone}>
        <MlbLogo className={styles.mlbLogo} />
      </div>

      <div className={styles.dateZone}>
        <span className={styles.dateLabel}>{today}</span>
        <span className={styles.dateSub}>MLB Intelligence</span>
      </div>

      {/* Matchup / hero section */}
      {content.matchup && (
        <div className={styles.matchupZone}>
          <div className={styles.matchupTeam}>
            <TeamLogo slug={content.matchup.awaySlug} className={styles.matchupLogo} />
            <div className={styles.matchupTeamInfo}>
              <span className={styles.matchupTeamName}>{content.matchup.awayName}</span>
              {content.matchup.awayRecord && (
                <span className={styles.matchupRecord}>{content.matchup.awayRecord}</span>
              )}
            </div>
          </div>
          <div className={styles.matchupVs}>
            <span className={styles.vsText}>VS</span>
            {content.matchup.time && <span className={styles.matchupTime}>{content.matchup.time}</span>}
          </div>
          <div className={styles.matchupTeam}>
            <TeamLogo slug={content.matchup.homeSlug} className={styles.matchupLogo} />
            <div className={styles.matchupTeamInfo}>
              <span className={styles.matchupTeamName}>{content.matchup.homeName}</span>
              {content.matchup.homeRecord && (
                <span className={styles.matchupRecord}>{content.matchup.homeRecord}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Headline / primary insight */}
      <div className={styles.headlineZone}>
        <div className={styles.headlineDivider} />
        <h2 className={styles.headline}>{content.headline}</h2>
        {content.subheadline && <p className={styles.subheadline}>{content.subheadline}</p>}
        <div className={styles.headlineDividerBottom} />
      </div>

      {/* Pick / lean callout */}
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

      {/* Picks summary panel */}
      {content.picks && content.picks.length > 0 && (
        <div className={styles.picksPanel}>
          <div className={styles.picksPanelHeader}>
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

      {/* Intel bullets */}
      {content.bullets && content.bullets.length > 0 && (
        <div className={styles.bulletModule}>
          <div className={styles.bulletHeader}>
            <span className={styles.sectionDot} />
            {content.bulletLabel || 'KEY SIGNALS'}
          </div>
          <ul className={styles.bulletList}>
            {content.bullets.map((b, i) => (
              <li key={i} className={styles.bulletItem}>
                <span className={styles.bulletIcon}>{b.icon || '⚾'}</span>
                <span className={styles.bulletText}>{b.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Team focus (single team intel) */}
      {content.teamFocus && (
        <div className={styles.teamFocusZone}>
          <TeamLogo slug={content.teamFocus.slug} className={styles.focusLogo} />
          <div className={styles.focusInfo}>
            <span className={styles.focusName}>{content.teamFocus.name}</span>
            {content.teamFocus.record && <span className={styles.focusRecord}>{content.teamFocus.record}</span>}
          </div>
        </div>
      )}

      {/* Broadcast footer */}
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
    case 'team':
      return buildTeamContent(teamData, options);
    case 'game':
      return buildGameContent(game, data, options);
    case 'picks':
      return buildPicksContent(data, options);
    case 'league':
      return buildLeagueContent(data, options);
    case 'division':
      return buildDivisionContent(data, options);
    case 'daily':
    default:
      return buildDailyContent(data, options);
  }
}

function buildDailyContent(data, options) {
  const games = data?.mlbGames ?? data?.games ?? [];
  const gamesCount = games.length;
  const headlines = data?.mlbHeadlines ?? [];

  const headline = headlines?.[0]?.headline || headlines?.[0]?.title
    || `${gamesCount} game${gamesCount !== 1 ? 's' : ''} on today's MLB slate`;

  const bullets = [];
  if (headlines.length > 0) {
    for (const h of headlines.slice(0, 3)) {
      bullets.push({ icon: '📰', text: h.headline || h.title || '' });
    }
  }
  if (gamesCount > 0) {
    bullets.push({ icon: '⚾', text: `${gamesCount} games across the MLB schedule today` });
  }

  return {
    category: 'MLB DAILY BRIEFING',
    headline,
    subheadline: `Full slate analysis and model-driven picks for today's MLB action.`,
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
    bullets: [
      { icon: '📊', text: `Season projection and model confidence` },
      { icon: '⚾', text: `Rotation depth and bullpen analysis` },
      { icon: '💡', text: `Market positioning and value signals` },
    ],
    picks: null,
    matchup: null,
    pickLabel: null,
  };
}

function buildGameContent(game, data, options) {
  if (!game) {
    return {
      category: 'MLB GAME PREVIEW',
      headline: 'Select a game to generate a preview',
      subheadline: null,
      bullets: [],
      picks: null,
      matchup: null,
      pickLabel: null,
    };
  }

  const awayName = game.awayTeam || 'Away';
  const homeName = game.homeTeam || 'Home';
  const awaySlug = game.awaySlug || game.awayTeam?.toLowerCase?.()?.replace(/\s+/g, '-') || '';
  const homeSlug = game.homeSlug || game.homeTeam?.toLowerCase?.()?.replace(/\s+/g, '-') || '';
  const spread = game.homeSpread ?? game.spread;
  const total = game.total;
  const ml = game.homeML ?? game.moneyline?.home;

  const bullets = [];
  if (spread != null) bullets.push({ icon: '📐', text: `Run Line: ${homeName} ${parseFloat(spread) > 0 ? '+' : ''}${spread}` });
  if (total != null) bullets.push({ icon: '📊', text: `Total: ${total}` });
  if (ml != null) bullets.push({ icon: '💰', text: `Moneyline: ${homeName} ${fmtPrice(ml)}` });

  return {
    category: 'MLB GAME PREVIEW',
    headline: `${awayName} at ${homeName}`,
    subheadline: options?.gameAngle === 'story'
      ? 'Key storylines and matchup dynamics.'
      : 'Value-driven analysis and model edges.',
    matchup: {
      awayName, homeName, awaySlug, homeSlug,
      awayRecord: game.awayRecord, homeRecord: game.homeRecord,
      time: game.time || '',
    },
    bullets,
    bulletLabel: 'MARKET SNAPSHOT',
    picks: null,
    pickLabel: null,
  };
}

function buildPicksContent(data, options) {
  const cp = data?.canonicalPicks ?? data?.mlbPicks ?? {};
  const cats = cp?.categories ?? {};

  const pickRows = [];
  const addPick = (cat, label, items) => {
    const top = items?.[0];
    if (top) {
      pickRows.push({ category: cat, label: top.pick?.label || label, confidence: top.confidence });
    }
  };
  addPick("PICK 'EM", 'Moneyline', cats.pickEms);
  addPick('RUN LINE', 'Spread', cats.ats);
  addPick('VALUE LEAN', 'Value', cats.leans);
  addPick('TOTAL', 'Over/Under', cats.totals);

  const topPick = pickRows[0];
  const headline = topPick
    ? `Today's top play: ${topPick.label}`
    : 'No strong lean on today\'s slate';

  return {
    category: "MAXIMUS'S PICKS",
    headline,
    subheadline: pickRows.length > 0
      ? `${pickRows.length} qualified pick${pickRows.length !== 1 ? 's' : ''} across today's MLB board.`
      : 'Model is waiting for stronger signal alignment.',
    picks: pickRows,
    bullets: null,
    matchup: null,
    pickLabel: topPick?.label || null,
    pickConfidence: topPick?.confidence || null,
  };
}

function buildLeagueContent(data, options) {
  const league = options?.mlbLeague || 'AL';
  return {
    category: `${league === 'AL' ? 'AMERICAN' : 'NATIONAL'} LEAGUE INTEL`,
    headline: `${league === 'AL' ? 'American' : 'National'} League Overview`,
    subheadline: `Key storylines and competitive dynamics across the ${league}.`,
    bullets: [
      { icon: '🏆', text: `Division race updates and standings impact` },
      { icon: '📊', text: `Model projections and playoff probabilities` },
      { icon: '⚾', text: `Notable trends and emerging value` },
    ],
    bulletLabel: `${league} STORYLINES`,
    picks: null,
    matchup: null,
    pickLabel: null,
  };
}

function buildDivisionContent(data, options) {
  const division = options?.mlbDivision || 'AL East';
  return {
    category: `${division.toUpperCase()} INTEL`,
    headline: `${division} Division Report`,
    subheadline: `Competitive landscape, projections, and value plays within the ${division}.`,
    bullets: [
      { icon: '🏆', text: `Division standings and race dynamics` },
      { icon: '📊', text: `Team-by-team model projections` },
      { icon: '💡', text: `Divisional matchup edges and trends` },
    ],
    bulletLabel: 'DIVISION SIGNALS',
    picks: null,
    matchup: null,
    pickLabel: null,
  };
}
