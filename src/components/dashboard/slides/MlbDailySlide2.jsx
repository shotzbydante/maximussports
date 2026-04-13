/**
 * MlbDailySlide2 — Today's Intel Briefing (Slide 2 of MLB Daily Briefing carousel)
 *
 *   HOT OFF THE PRESS   → 4-5 current top-news bullets (20px)
 *   PENNANT RACE        → 4 boxed team modules (top 4 by proj wins, league-agnostic)
 *   MAXIMUS'S PICKS     → 4 game-intel pick modules with selected-team logos
 *
 * 1080×1350 · IG 4:5 portrait
 */

import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
import { MLB_TEAMS } from '../../../sports/mlb/teams';
import { getTeamProjection } from '../../../data/mlb/seasonModel';
import { LEADER_CATEGORIES } from '../../../data/mlb/seasonLeaders';
import { buildDailyContent, stripEmojis, fmtOdds } from './mlbDailyHelpers';
import { parseBriefingToIntel } from '../../../features/mlb/contentStudio/normalizeMlbImagePayload';
import { buildMlbDailyHeadline, buildMlbHotPress } from '../../../features/mlb/contentStudio/buildMlbDailyHeadline';
import styles from './MlbSlides.module.css';

// ─── Helpers ──────────────────────────────────────────────────

const TEAM_KW = {
  'diamondbacks': 'ari', 'arizona': 'ari', 'd-backs': 'ari',
  'dodgers': 'lad', 'los angeles dodgers': 'lad',
  'yankees': 'nyy', 'new york yankees': 'nyy',
  'blue jays': 'tor', 'toronto': 'tor',
  'phillies': 'phi', 'philadelphia': 'phi',
  'astros': 'hou', 'houston': 'hou',
  'mets': 'nym', 'new york mets': 'nym',
  'braves': 'atl', 'atlanta': 'atl',
  'guardians': 'cle', 'cleveland': 'cle',
  'tigers': 'det', 'detroit': 'det',
  'mariners': 'sea', 'seattle': 'sea',
  'rangers': 'tex', 'texas': 'tex',
  'orioles': 'bal', 'baltimore': 'bal',
  'padres': 'sd', 'san diego': 'sd',
  'giants': 'sf', 'san francisco': 'sf',
  'cubs': 'chc', 'chicago cubs': 'chc',
  'red sox': 'bos', 'boston': 'bos',
  'angels': 'laa', 'nationals': 'wsh', 'rays': 'tb',
  'twins': 'min', 'royals': 'kc', 'reds': 'cin',
  'brewers': 'mil', 'pirates': 'pit', 'cardinals': 'stl',
  'rockies': 'col', 'white sox': 'cws', 'athletics': 'oak',
  'marlins': 'mia',
};

function findSlug(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [kw, slug] of Object.entries(TEAM_KW)) {
    if (lower.includes(kw)) return slug;
  }
  return null;
}

function logoUrl(slug) {
  return slug ? getMlbEspnLogoUrl(slug) : null;
}

function trim(text, max = 120) {
  if (!text) return '';
  let s = text.trim();
  // Strip filler prefixes
  s = s.replace(/^(Meanwhile,?\s*|In other action,?\s*|Additionally,?\s*|Also,?\s*)/i, '');
  // Strip leaked section labels
  s = s.replace(/^[¶#§]\d*\s*/i, '');
  s = s.replace(/^[A-Z][A-Z\s&+\-:]*[A-Z]\s*[:—–-]\s*/i, '');
  if (s.length <= max) return s;
  // Cut at last sentence boundary if possible
  const sentEnd = s.lastIndexOf('.', max);
  if (sentEnd > max * 0.4) return s.slice(0, sentEnd + 1);
  // Otherwise cut at word boundary
  return s.slice(0, max).replace(/\s+\S*$/, '') + '.';
}

function fmtConviction(tier) {
  if (!tier) return 'Edge';
  if (tier === 'high') return 'High';
  if (tier === 'medium-high') return 'Med-High';
  if (tier === 'medium') return 'Medium';
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function shortDiv(div) {
  if (!div) return '';
  return div.replace('American League ', 'AL ').replace('National League ', 'NL ');
}

/** Build day-specific headline from briefing */
function buildHeadline(paras) {
  let p1 = stripEmojis(paras[0] || '');
  // Strip section labels that leak into headlines
  p1 = p1.replace(/^[¶#§]\d*\s*/i, '').replace(/^[A-Z][A-Z\s&+\-:]*[A-Z]\s*[:—–-]\s*/i, '');
  const names = [];
  const pats = [
    /([A-Z][a-z]+ (?:Fernandez|Ohtani|Painter|Judge|Soto|Acuna|Betts|Trout|deGrom|Cole|Verlander|Stanton|Adames))/g,
  ];
  for (const pat of pats) {
    const m = p1.match(pat);
    if (m) names.push(...m.slice(0, 3));
  }
  if (names.length >= 2) {
    return `${names[0].split(' ').pop().toUpperCase()} BREAKS THROUGH, ${names[1].split(' ').pop().toUpperCase()} DEALS, AND THE BOARD TAKES SHAPE`;
  }
  if (names.length === 1) {
    return `${names[0].split(' ').pop().toUpperCase()} DELIVERS AS CONTENDERS SET THE TONE`;
  }
  return 'BIG DEBUTS AND EARLY SIGNALS SHAPE THE BOARD';
}

/** Build short subhead from briefing — clean, complete sentence */
function buildSubhead(paras) {
  const raw = stripEmojis(paras[0] || '');
  // Strip section labels like "¶1 AROUND THE LEAGUE:" or "AROUND THE LEAGUE —"
  const cleaned = raw.replace(/^[¶#§]\d*\s*/i, '').replace(/^[A-Z][A-Z\s&+\-:]*[A-Z]\s*[:—–-]\s*/i, '').trim();
  const sents = (cleaned.match(/[^.!?]*[.!?]+/g) || []).map(s => s.trim()).filter(s => s.length > 10);
  if (sents[0]) return sents[0];
  return 'The board is taking shape as contenders make early statements.';
}

// ─── Content builder ──────────────────────────────────────────

function buildSlide2Content(data) {
  const content = buildDailyContent(data);
  const intel = parseBriefingToIntel(data?.mlbBriefing);
  const paras = intel?.rawParagraphs || [];

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  // ── HOT OFF THE PRESS: 4 dynamic bullets from game results ──
  const hotPressBullets = buildMlbHotPress({
    liveGames: data?.mlbLiveGames || [],
    briefing: data?.mlbBriefing,
    allStandings: data?.mlbStandings || null,
  });
  const featureBullets = hotPressBullets.map(b => ({
    text: trim(b.text),
    logoSrc: logoUrl(b.logoSlug),
  }));

  // ── SEASON LEADERS: top 3 in each category from ESPN ──
  const leadersRaw = data?.mlbLeaders?.categories || {};
  // abbrev → slug lookup for team logos
  const abbrevToSlug = Object.fromEntries(MLB_TEAMS.map(t => [t.abbrev, t.slug]));

  const leaderCategories = LEADER_CATEGORIES
    .filter(cat => leadersRaw[cat.key]?.leaders?.length > 0)
    .map(cat => ({
      key: cat.key,
      label: cat.label,
      abbrev: cat.abbrev,
      leaders: leadersRaw[cat.key].leaders.slice(0, 3).map(l => {
        const slug = abbrevToSlug[l.teamAbbrev] || l.teamAbbrev?.toLowerCase() || null;
        return {
          name: l.name || '—',
          teamAbbrev: l.teamAbbrev || '',
          teamLogoSrc: slug ? getMlbEspnLogoUrl(slug) : null,
          value: l.display || String(l.value || 0),
        };
      }),
    }));

  // ── MAXIMUS'S PICKS: 4 pick modules, ensure ATS representation ──
  const pickCats = data?.mlbPicks?.categories || data?.canonicalPicks?.categories || {};
  const pickEms = (pickCats.pickEms || []).map(p => ({ ...p, type: "Pick 'Em" }));
  const ats = (pickCats.ats || []).map(p => ({ ...p, type: 'ATS' }));
  const totals = (pickCats.totals || []).map(p => ({ ...p, type: 'O/U' }));

  // Ensure at least one ATS if available
  const allByConf = [...pickEms, ...ats, ...totals].sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
  const selected = [];
  const usedIds = new Set();

  // Guarantee one ATS first if exists
  if (ats.length > 0) {
    const bestAts = ats.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0))[0];
    selected.push(bestAts);
    usedIds.add(bestAts.id);
  }
  // Fill remaining with best available
  for (const p of allByConf) {
    if (selected.length >= 4) break;
    if (!usedIds.has(p.id)) {
      selected.push(p);
      usedIds.add(p.id);
    }
  }

  const picks = selected.slice(0, 4).map(p => {
    const away = p.matchup?.awayTeam?.shortName || p.matchup?.awayTeam?.name || '?';
    const home = p.matchup?.homeTeam?.shortName || p.matchup?.homeTeam?.name || '?';
    const matchup = `${away} vs ${home}`;
    const selection = p.pick?.label || '—';
    const conviction = fmtConviction(p.confidence);
    const edgePct = p.pick?.edgePercent || p.confidenceScore;
    const rationale = edgePct
      ? `Model favors ${(selection || '').split(' ').pop()} with a ${Number(edgePct).toFixed(1)}% edge.`
      : `Model edge: ${conviction.toLowerCase()} conviction`;

    // Find selected team's slug for logo
    const pickSide = p.pick?.side;
    const selectedTeam = pickSide === 'away' ? p.matchup?.awayTeam : p.matchup?.homeTeam;
    const selectionLogoSrc = logoUrl(selectedTeam?.slug || null);

    return { matchup, type: p.type, selection, selectionLogoSrc, conviction, rationale };
  });
  while (picks.length < 4) {
    picks.push({ matchup: 'TBD vs TBD', type: "Pick 'Em", selection: '—', selectionLogoSrc: null, conviction: 'Edge', rationale: 'More picks in the full daily board' });
  }

  // Dynamic headline from live games + briefing + model
  const dynamicHL = buildMlbDailyHeadline({
    liveGames: data?.mlbLiveGames || [],
    briefing: data?.mlbBriefing,
    seasonIntel: null,
    allStandings: data?.mlbStandings || null,
  });

  return {
    dateLabel: today,
    mlbLogoSrc: '/mlb-logo.png',
    headline: dynamicHL.mainHeadline || buildHeadline(paras),
    subhead: dynamicHL.subhead || buildSubhead(paras),
    featureBullets,
    featureTakeaway: dynamicHL.subhead || "Today's board is being shaped by results across both leagues.",
    leaderCategories,
    picks,
  };
}

// ─── Component ──────────────────────────────────────────────────

function InlineLogo({ src, size = 22 }) {
  if (!src) return null;
  return (
    <span className={styles.logoBackplate} style={{ width: size + 10, height: size + 10 }}>
      <img src={src} alt="" width={size} height={size} className={styles.slide2InlineLogo} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
    </span>
  );
}

export default function MlbDailySlide2({ data, asOf, ...rest }) {
  const c = buildSlide2Content(data);

  return (
    <div className={styles.slide2} data-slide="2" {...rest}>
      <div className={styles.bgBase} />
      <div className={styles.bgGlow} />
      <div className={styles.bgRay} />
      <div className={styles.bgStadium} />
      <div className={styles.bgStreaks} />
      <div className={styles.bgNoise} />

      <header className={styles.slide2Top}>
        <div className={styles.slide2TopPill}>
          <img src={c.mlbLogoSrc} alt="" className={styles.slide2TopLogo} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
          <span>TODAY'S INTEL BRIEFING</span>
        </div>
        <div className={styles.slide2Date}>{c.dateLabel}</div>
      </header>

      <section className={styles.slide2HeadlineBlock}>
        <h1 className={styles.slide2Headline}>{c.headline}</h1>
        <p className={styles.slide2Subhead}>{c.subhead}</p>
      </section>

      {/* HOT OFF THE PRESS */}
      <section className={styles.slide2FeatureCard}>
        <div className={styles.slide2SectionPill}>HOT OFF THE PRESS</div>
        <div className={styles.slide2BulletList}>
          {c.featureBullets.map((b, i) => (
            <div key={i} className={styles.slide2BulletRow}>
              <div className={styles.slide2BulletMarker} />
              <InlineLogo src={b.logoSrc} size={20} />
              <div className={styles.slide2FeatureText}>{b.text}</div>
            </div>
          ))}
        </div>
        {c.featureTakeaway && <div className={styles.slide2CardTakeaway}>{c.featureTakeaway}</div>}
      </section>

      {/* ── MAXIMUS'S PICKS — full-width horizontal row ── */}
      <section className={styles.slide2PicksSection}>
        <div className={styles.slide2SectionPill}>MAXIMUS'S PICKS</div>
        <div className={styles.slide2PicksRow}>
          {c.picks.map((p, i) => (
            <div key={i} className={styles.slide2PickCard}>
              <div className={styles.slide2PickTopRow}>
                <div className={styles.slide2PickMatchup}>{p.matchup}</div>
                <div className={styles.slide2PickTypePill}>{p.type}</div>
              </div>
              <div className={styles.slide2PickMiddleRow}>
                <div className={styles.slide2PickSelectionWrap}>
                  {p.selectionLogoSrc && <span className={styles.logoBackplate} style={{ width: 32, height: 32 }}><img src={p.selectionLogoSrc} alt="" className={styles.slide2PickSelectionLogo} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} /></span>}
                  <div className={styles.slide2PickSelection}>{p.selection}</div>
                </div>
                <div className={styles.slide2PickConviction}>{p.conviction}</div>
              </div>
              <div className={styles.slide2PickRationale}>{p.rationale}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── SEASON LEADERS — full-width, 2 rows (HR/RBI/Hits + Wins/Saves) ── */}
      <section className={styles.slide2LeadersSection}>
        <div className={styles.slide2SectionPill}>SEASON LEADERS</div>
        {c.leaderCategories.length > 0 ? (
          <div className={styles.slide2LeadersGrid}>
            {c.leaderCategories.map((cat, ci) => (
              <div key={ci} className={styles.slide2LeaderCategory}>
                <div className={styles.slide2LeaderCatHeader}>
                  <span className={styles.slide2LeaderCatLabel}>{cat.label}</span>
                  <span className={styles.slide2LeaderCatAbbrev}>{cat.abbrev}</span>
                </div>
                <div className={styles.slide2LeaderRows}>
                  {cat.leaders.map((l, li) => (
                    <div key={li} className={styles.slide2LeaderRow}>
                      <span className={styles.slide2LeaderRank}>{li + 1}</span>
                      {l.teamLogoSrc && <span className={styles.logoBackplate} style={{ width: 30, height: 30 }}><img src={l.teamLogoSrc} alt="" className={styles.slide2LeaderTeamLogo} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} /></span>}
                      <span className={styles.slide2LeaderName}>{l.name}</span>
                      <span className={styles.slide2LeaderValue}>{l.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.slide2LeadersEmpty}>Season leaders loading...</div>
        )}
      </section>

      <footer className={styles.slide2Footer}>
        <div className={styles.slide2SwipeCue}>Swipe for World Series Outlook →</div>
        <div className={styles.slide2Site}>maximussports.ai</div>
      </footer>
    </div>
  );
}
