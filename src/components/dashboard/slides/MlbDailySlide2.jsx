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
import { buildDailyContent, stripEmojis, fmtOdds } from './mlbDailyHelpers';
import { parseBriefingToIntel } from '../../../features/mlb/contentStudio/normalizeMlbImagePayload';
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

function trim(text, max = 85) {
  if (!text) return '';
  let s = text.trim();
  s = s.replace(/^(Meanwhile,?\s*|In other action,?\s*|Additionally,?\s*|Also,?\s*)/i, '');
  if (s.length <= max) return s;
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
  const p1 = stripEmojis(paras[0] || '');
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

/** Build short subhead from briefing */
function buildSubhead(paras) {
  const p1 = stripEmojis(paras[0] || '');
  const sents = (p1.match(/[^.!?]*[.!?]+/g) || []).map(s => s.trim());
  if (sents.length >= 2) {
    const s1 = sents[0].length > 50 ? sents[0].slice(0, 48).replace(/\s+\S*$/, '') + '.' : sents[0];
    return s1;
  }
  return 'Debuts, aces, and early contenders shape the board.';
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

  const getSentences = (idx) => {
    const para = paras[idx];
    if (!para) return [];
    const cleaned = stripEmojis(para);
    if (!cleaned || cleaned.length < 30) return [];
    const labelMatch = cleaned.match(/^([A-Z][A-Z\s&+\-:]*[A-Z])\s*[:—–-]\s*/);
    const body = labelMatch ? cleaned.slice(labelMatch[0].length) : cleaned;
    return (body.match(/[^.!?]*[.!?]+/g) || [body]).map(s => s.trim()).filter(Boolean);
  };

  // ── HOT OFF THE PRESS: 4-5 bullets ──
  const p1 = getSentences(0);
  const featureBullets = p1.slice(0, 5).map(s => ({
    text: trim(s),
    logoSrc: logoUrl(findSlug(s)),
  }));
  while (featureBullets.length < 4) {
    featureBullets.push({ text: 'Contenders wasted no time making early statements', logoSrc: null });
  }

  // ── PENNANT RACE: top 4 MLB teams by projected wins, league-agnostic ──
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
      marketDelta: proj.marketDelta ?? null,
      odds: oddsVal,
    });
  }
  allTeams.sort((a, b) => (b.projectedWins ?? 0) - (a.projectedWins ?? 0));
  const raceTeams = allTeams.slice(0, 4).map(t => {
    const signal = t.signals?.[0] || t.confidenceTier || '';
    const tag = signal ? `${signal}` : `${t.confidenceTier || 'Contender'} outlook`;
    return {
      team: t.abbrev,
      teamLogoSrc: logoUrl(t.slug),
      projectedWins: t.projectedWins,
      record: '—', // dynamic record not yet available in this pipeline
      standingLabel: shortDiv(t.division),
      summaryTag: tag,
    };
  });

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
    const rationale = p.pick?.explanation ? trim(p.pick.explanation, 55) : `Model edge: ${conviction.toLowerCase()} conviction`;

    // Find selected team's slug for logo
    const pickSide = p.pick?.side;
    const selectedTeam = pickSide === 'away' ? p.matchup?.awayTeam : p.matchup?.homeTeam;
    const selectionLogoSrc = logoUrl(selectedTeam?.slug || null);

    return { matchup, type: p.type, selection, selectionLogoSrc, conviction, rationale };
  });
  while (picks.length < 4) {
    picks.push({ matchup: 'TBD vs TBD', type: "Pick 'Em", selection: '—', selectionLogoSrc: null, conviction: 'Edge', rationale: 'More picks in the full daily board' });
  }

  return {
    dateLabel: today,
    mlbLogoSrc: '/mlb-logo.png',
    headline: buildHeadline(paras),
    subhead: buildSubhead(paras),
    featureBullets,
    featureTakeaway: "Today's board is being shaped by stars, debuts, and early pressure.",
    raceTeams,
    picks,
  };
}

// ─── Component ──────────────────────────────────────────────────

function InlineLogo({ src, size = 20 }) {
  if (!src) return null;
  return <img src={src} alt="" width={size} height={size} className={styles.slide2InlineLogo} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />;
}

export default function MlbDailySlide2({ data, asOf, ...rest }) {
  const c = buildSlide2Content(data);

  return (
    <div className={styles.slide2} {...rest}>
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

      <section className={styles.slide2SupportGrid}>
        {/* PENNANT RACE — 4 team modules */}
        <article className={styles.slide2SupportCard}>
          <div className={styles.slide2SectionPill}>PENNANT RACE</div>
          <div className={styles.slide2RaceTeams}>
            {c.raceTeams.map((t, i) => (
              <div key={i} className={styles.slide2RaceTeamCard}>
                <div className={styles.slide2RaceTeamTopRow}>
                  <div className={styles.slide2RaceTeamIdentity}>
                    <InlineLogo src={t.teamLogoSrc} size={20} />
                    <div className={styles.slide2RaceTeamName}>{t.team}</div>
                  </div>
                  <div className={styles.slide2RaceTeamWins}>{t.projectedWins}W</div>
                </div>
                <div className={styles.slide2RaceTeamMeta}>
                  <span>{t.standingLabel}</span>
                </div>
                <div className={styles.slide2RaceTeamTag}>{t.summaryTag}</div>
              </div>
            ))}
          </div>
        </article>

        {/* MAXIMUS'S PICKS — 4 pick modules with selected-team logos */}
        <article className={styles.slide2SupportCard}>
          <div className={styles.slide2SectionPill}>MAXIMUS'S PICKS</div>
          <div className={styles.slide2PicksList}>
            {c.picks.map((p, i) => (
              <div key={i} className={styles.slide2PickCard}>
                <div className={styles.slide2PickTopRow}>
                  <div className={styles.slide2PickMatchup}>{p.matchup}</div>
                  <div className={styles.slide2PickTypePill}>{p.type}</div>
                </div>
                <div className={styles.slide2PickMiddleRow}>
                  <div className={styles.slide2PickSelectionWrap}>
                    {p.selectionLogoSrc && <img src={p.selectionLogoSrc} alt="" className={styles.slide2PickSelectionLogo} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />}
                    <div className={styles.slide2PickSelection}>{p.selection}</div>
                  </div>
                  <div className={styles.slide2PickConviction}>{p.conviction}</div>
                </div>
                <div className={styles.slide2PickRationale}>{p.rationale}</div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <footer className={styles.slide2Footer}>
        <div className={styles.slide2SwipeCue}>Swipe for World Series Outlook →</div>
        <div className={styles.slide2Site}>maximussports.ai</div>
      </footer>
    </div>
  );
}
