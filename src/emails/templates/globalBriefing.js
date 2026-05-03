/**
 * Global Daily Briefing — premium cross-sport intelligence email.
 *
 * STRUCTURE (NBA Playoffs first, MLB second, parallel 5-section per sport):
 *
 *   Header / greeting
 *
 *   🏀 NBA PLAYOFFS
 *     1. NBA Daily Intelligence (HOTP / narrative)
 *     2. Yesterday's NBA Results
 *     3. NBA Picks Scorecard
 *     4. Today's NBA Picks
 *     5. NBA Championship Odds
 *
 *   ⚾ MLB
 *     1. MLB Daily Intelligence (HOTP / narrative)
 *     2. Yesterday's MLB Results
 *     3. MLB Picks Scorecard
 *     4. Today's MLB Picks
 *     5. World Series Odds
 *
 *   ACT ON TODAY'S BOARD (partner module)
 *   Footer CTA
 *
 * Data sources mirror the IG Daily Briefing canonical pipelines.
 * Test/prod parity is locked: both call buildEmailData() with the same
 * canonicalAssembled payload — zero parallel logic.
 */

import { EmailShell, heroBlock } from '../EmailShell.js';
import {
  stripInlineEmoji, normalizeSpacing, cleanNarrativeText,
  mlbTeamLogoImg, nbaTeamLogoImg, renderPartnerModule,
} from '../MlbEmailShell.js';
import {
  buildCrossSportHook, buildResultInsight,
  buildNbaModelWatch, buildOddsMarketRead,
  sanitizeNbaNarrativeBullets,
} from '../../../api/_lib/globalBriefingIntelligence.js';

const F = "'DM Sans',Arial,Helvetica,sans-serif";
const RED = '#c41e3a';
const BLUE = '#2d6ca8';
const NAVY = '#0f2440';
const BODY = '#1f2937';
const MUTED = '#9ca3af';
const DIM = '#b0b8c4';
const BORDER = '#e5e7eb';
const ROW_BORDER = '#eef0f2';
const CARD_BG = '#f9fafb';

// ── Brand assets ─────────────────────────────────────────────────
const NBA_PLAYOFFS_LOGO = 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png';
const MLB_LEAGUE_LOGO = 'https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png';

// NBA team metadata for name lookup in odds rows
const NBA_TEAM_INFO = {
  atl: 'Hawks', bos: 'Celtics', bkn: 'Nets', cha: 'Hornets', chi: 'Bulls',
  cle: 'Cavaliers', det: 'Pistons', ind: 'Pacers', mia: 'Heat', mil: 'Bucks',
  nyk: 'Knicks', orl: 'Magic', phi: '76ers', tor: 'Raptors', was: 'Wizards',
  dal: 'Mavericks', den: 'Nuggets', gsw: 'Warriors', hou: 'Rockets', lac: 'Clippers',
  lal: 'Lakers', mem: 'Grizzlies', min: 'Timberwolves', nop: 'Pelicans', okc: 'Thunder',
  phx: 'Suns', por: 'Trail Blazers', sac: 'Kings', sas: 'Spurs', uta: 'Jazz',
};

// MLB team meta (slug → friendly name) for odds rows
const MLB_TEAM_INFO = {
  nyy: 'Yankees', bos: 'Red Sox', tor: 'Blue Jays', tb: 'Rays', bal: 'Orioles',
  cle: 'Guardians', min: 'Twins', det: 'Tigers', cws: 'White Sox', kc: 'Royals',
  hou: 'Astros', sea: 'Mariners', tex: 'Rangers', laa: 'Angels', oak: 'Athletics',
  atl: 'Braves', nym: 'Mets', phi: 'Phillies', mia: 'Marlins', wsh: 'Nationals',
  chc: 'Cubs', mil: 'Brewers', stl: 'Cardinals', pit: 'Pirates', cin: 'Reds',
  lad: 'Dodgers', sd: 'Padres', sf: 'Giants', ari: 'Diamondbacks', col: 'Rockies',
};

// ── Helpers ───────────────────────────────────────────────────────

function fmtOdds(val) {
  if (val == null || val === '—') return '—';
  const n = typeof val === 'number' ? val : parseInt(String(val), 10);
  if (!Number.isFinite(n)) return '—';
  return n > 0 ? `+${n}` : String(n);
}

function fmtConviction(tier) {
  if (!tier) return 'Edge';
  if (tier === 'high') return 'High';
  if (tier === 'medium-high') return 'Med-High';
  if (tier === 'medium') return 'Medium';
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

/** Compact section pill — small label badge */
function sectionPill(label, color = RED) {
  return `
<tr><td style="padding:14px 24px 6px;">
  <span style="font-size:11px;font-weight:700;color:${color};letter-spacing:0.08em;text-transform:uppercase;font-family:${F};">${label}</span>
</td></tr>`;
}

/** Sport header band — large logo + sport label, marks the start of a sport block */
function sportHeader({ logoUrl, label, accent }) {
  return `
<tr><td style="padding:22px 24px 10px;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr>
      <td style="vertical-align:middle;padding-right:10px;">
        <img src="${logoUrl}" alt="${label}" width="28" height="28"
             style="width:28px;height:28px;display:inline-block;border:0;vertical-align:middle;" />
      </td>
      <td style="vertical-align:middle;">
        <span style="font-size:17px;font-weight:800;color:${NAVY};letter-spacing:-0.01em;font-family:${F};">${label}</span>
        ${accent ? `<span style="font-size:11px;font-weight:700;color:${accent};letter-spacing:0.06em;text-transform:uppercase;font-family:${F};margin-left:8px;">${accent === RED ? 'NOW PLAYING' : ''}</span>` : ''}
      </td>
    </tr>
  </table>
</td></tr>
<tr><td style="padding:0 24px 4px;">
  <div style="height:2px;background:${accent || NAVY};opacity:0.15;font-size:0;">&nbsp;</div>
</td></tr>`;
}

function divider() {
  return `<tr><td style="padding:8px 28px;"><div style="height:1px;background:${ROW_BORDER};font-size:0;">&nbsp;</div></td></tr>`;
}

function compactDivider() {
  return `<tr><td style="padding:4px 24px;"><div style="height:1px;background:${ROW_BORDER};font-size:0;">&nbsp;</div></td></tr>`;
}

/** Extract narrative bullets from a paragraph as an array (deduped). */
function extractNarrativeBullets(narrative, max = 4) {
  if (!narrative) return [];
  const all = narrative.split(/\n{2,}/)
    .map(p => cleanNarrativeText(p)).filter(p => p.length > 30)
    .flatMap(p => p.replace(/<[^>]+>/g, '').split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.length > 15));
  const seen = new Set();
  const unique = [];
  for (const b of all) {
    const key = b.slice(0, 30).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(b);
    if (unique.length >= max) break;
  }
  return unique;
}

/** Render an array of bullet strings as HTML paragraphs. */
function renderBulletsHtml(bullets) {
  if (!bullets?.length) return '';
  return bullets.map(b =>
    `<p style="margin:0 0 7px;font-size:14px;line-height:21px;color:#4b5563;font-family:${F};">&bull; ${normalizeSpacing(stripInlineEmoji(b))}</p>`
  ).join('');
}

/** Backwards-compat wrapper: extract + render in one call. */
function narrativeBullets(narrative, max = 4) {
  return renderBulletsHtml(extractNarrativeBullets(narrative, max));
}

/**
 * Validate result row before rendering. Returns true only if both teams + scores
 * are present. Prevents malformed "?? ? - @ ?? ? - Final" rows from rendering.
 */
function isValidResultRow(g) {
  return !!(
    g?.away?.abbrev && g?.home?.abbrev &&
    g?.away?.score != null && g?.home?.score != null
  );
}

/** Render a results row for a single completed game with optional insight */
function resultRow(g, logoFn, isLast, insight) {
  const aLogo = logoFn({ slug: g.away.slug }, 16);
  const hLogo = logoFn({ slug: g.home.slug }, 16);
  const aWin = g.away.score > g.home.score;
  const hWin = g.home.score > g.away.score;
  const insightText = insight || g.seriesNote || g.statusText || 'Final';
  return `
  <tr>
    <td style="padding:6px 0${isLast ? '' : `;border-bottom:1px solid ${ROW_BORDER}`};font-family:${F};">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
        <tr>
          <td style="width:24px;vertical-align:middle;padding-right:6px;">${aLogo}</td>
          <td style="font-size:13px;font-weight:${aWin ? '800' : '500'};color:${NAVY};vertical-align:middle;width:42px;">${g.away.abbrev}</td>
          <td style="font-size:13px;font-weight:${aWin ? '800' : '500'};color:${NAVY};vertical-align:middle;width:30px;text-align:right;padding-right:8px;">${g.away.score}</td>
          <td style="font-size:11px;color:${DIM};vertical-align:middle;width:14px;text-align:center;">@</td>
          <td style="width:24px;vertical-align:middle;padding-left:6px;">${hLogo}</td>
          <td style="font-size:13px;font-weight:${hWin ? '800' : '500'};color:${NAVY};vertical-align:middle;width:42px;padding-left:6px;">${g.home.abbrev}</td>
          <td style="font-size:13px;font-weight:${hWin ? '800' : '500'};color:${NAVY};vertical-align:middle;width:30px;text-align:right;padding-right:8px;">${g.home.score}</td>
        </tr>
        <tr>
          <td colspan="7" style="padding:1px 0 0 30px;font-size:10px;color:${DIM};font-family:${F};line-height:13px;">→ ${normalizeSpacing(stripInlineEmoji(insightText))}</td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/** Render a clean fallback message when no valid results are available. */
function noResultsFallback(sportLabel) {
  return `<p style="margin:0;font-size:12px;color:${DIM};font-style:italic;font-family:${F};">No completed ${sportLabel} results were available for yesterday.</p>`;
}

/** Compact card wrapper for each section */
function sectionCard({ label, body, accent = RED }) {
  return `
<tr><td style="padding:6px 24px 12px;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:6px;border-collapse:collapse;">
    <tr><td style="padding:12px 14px 6px;">
      <span style="font-size:10px;font-weight:700;color:${accent};letter-spacing:0.08em;text-transform:uppercase;font-family:${F};">${label}</span>
    </td></tr>
    <tr><td style="padding:0 14px 12px;">${body}</td></tr>
  </table>
</td></tr>`;
}

/** Render a picks compact card list — Global Briefing shows top 3 unique matchups */
function renderTodaysPicks(picksBoard, max = 3) {
  if (!picksBoard?.categories) return null;
  const cats = picksBoard.categories;
  const all = [
    ...(cats.pickEms || []).map(p => ({ ...p, type: "Pick 'Em" })),
    ...(cats.ats || []).map(p => ({ ...p, type: 'ATS' })),
    ...(cats.totals || []).map(p => ({ ...p, type: 'O/U' })),
    ...(cats.leans || []).map(p => ({ ...p, type: 'Lean' })),
  ];
  if (all.length === 0) return null;

  // Dedupe by matchup (away+home) — never show the same matchup twice in
  // the compact Global Briefing, even across categories or pick types.
  const matchupKey = (p) => {
    const a = p.matchup?.awayTeam?.shortName || p.matchup?.awayTeam?.name || p.matchup?.awayTeam?.slug || '';
    const h = p.matchup?.homeTeam?.shortName || p.matchup?.homeTeam?.name || p.matchup?.homeTeam?.slug || '';
    return `${a}@${h}`.toLowerCase();
  };

  const seen = new Set();
  const unique = [];
  // Sort by confidenceScore desc, then take first occurrence per matchup
  for (const p of [...all].sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0))) {
    const key = matchupKey(p);
    if (!key || key === '@' || seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
    if (unique.length >= max) break;
  }
  if (unique.length === 0) return null;

  return unique.map((p, i) => {
    const away = p.matchup?.awayTeam?.shortName || p.matchup?.awayTeam?.name || '?';
    const home = p.matchup?.homeTeam?.shortName || p.matchup?.homeTeam?.name || '?';
    const matchup = `${away} vs ${home}`;
    const selection = p.pick?.label || '—';
    const conviction = fmtConviction(p.confidence);
    const rationale = p.pick?.explanation
      ? (p.pick.explanation.length > 80 ? p.pick.explanation.slice(0, 80).replace(/\s+\S*$/, '') + '.' : p.pick.explanation)
      : '';
    const isLast = i === unique.length - 1;
    return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;${isLast ? '' : `border-bottom:1px solid ${ROW_BORDER};`}">
      <tr>
        <td style="padding:8px 0;font-family:${F};">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td style="vertical-align:top;">
                <p style="margin:0 0 2px;font-size:11px;font-weight:500;color:${DIM};font-family:${F};">${matchup}</p>
                <p style="margin:0;font-size:14px;font-weight:800;color:${NAVY};line-height:18px;font-family:${F};">${selection}</p>
              </td>
              <td style="width:60px;text-align:center;vertical-align:top;padding-top:2px;">
                <span style="display:inline-block;font-size:9px;font-weight:700;color:#5a7da8;background:#f0f4f8;border-radius:3px;padding:2px 6px;letter-spacing:0.04em;text-transform:uppercase;font-family:${F};">${p.type}</span>
              </td>
              <td style="width:54px;text-align:right;vertical-align:top;padding-top:3px;">
                <span style="font-size:11px;font-weight:700;color:${p.confidence === 'high' ? RED : '#4b5563'};font-family:${F};">${conviction}</span>
              </td>
            </tr>
          </table>
          ${rationale ? `<p style="margin:3px 0 0;font-size:11px;color:${DIM};line-height:15px;font-family:${F};">${normalizeSpacing(stripInlineEmoji(rationale))}</p>` : ''}
        </td>
      </tr>
    </table>`;
  }).join('');
}

/** Render championship odds compact (top 5) */
function renderChampOddsCompact(odds, teamInfo, logoFn, max = 5) {
  if (!odds || Object.keys(odds).length === 0) return null;

  // Convert to array, sort by best chance (most likely first)
  const arr = Object.entries(odds).map(([slug, o]) => ({
    slug,
    val: o.bestChanceAmerican ?? o.american ?? null,
  })).filter(t => t.val != null);

  const impProb = v => v < 0 ? -v / (-v + 100) : 100 / (v + 100);
  arr.sort((a, b) => impProb(b.val) - impProb(a.val));

  const top = arr.slice(0, max);
  if (top.length === 0) return null;

  return top.map((t, i) => {
    const isLast = i === top.length - 1;
    const name = teamInfo[t.slug] || t.slug.toUpperCase();
    return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;${isLast ? '' : `border-bottom:1px solid ${ROW_BORDER};`}">
      <tr>
        <td style="padding:7px 0;font-family:${F};">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td style="width:18px;font-size:11px;font-weight:600;color:${DIM};vertical-align:middle;">${i + 1}</td>
              <td style="width:24px;vertical-align:middle;padding-right:8px;">${logoFn({ slug: t.slug }, 18)}</td>
              <td style="font-size:13px;font-weight:800;color:${NAVY};vertical-align:middle;width:48px;">${t.slug.toUpperCase()}</td>
              <td style="font-size:12px;color:${MUTED};vertical-align:middle;">${name}</td>
              <td align="right" style="vertical-align:middle;">
                <span style="font-size:13px;font-weight:700;color:${RED};font-family:${F};">${fmtOdds(t.val)}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
  }).join('');
}

/** Picks scorecard (yesterday's record) */
function renderScorecard(scorecard) {
  if (!scorecard) {
    return `<p style="margin:0;font-size:12px;color:${DIM};font-style:italic;font-family:${F};">Scorecard updates when yesterday’s picks settle.</p>`;
  }
  const w = scorecard.wins ?? 0;
  const l = scorecard.losses ?? 0;
  const p = scorecard.pushes ?? 0;
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
    <tr>
      <td style="font-size:18px;font-weight:800;color:${NAVY};font-family:${F};">${w}-${l}${p > 0 ? `-${p}` : ''}</td>
      <td align="right" style="font-size:11px;color:${DIM};font-family:${F};">${scorecard.summary || ''}</td>
    </tr>
  </table>`;
}

// ── Per-sport block builders ─────────────────────────────────────

function buildNbaBlock(data) {
  const nbaData = data.nbaData;
  const narrative = nbaData?.narrativeParagraph || '';
  const yesterdayRaw = data.nbaYesterdayResults || [];
  const yesterday = yesterdayRaw.filter(isValidResultRow);
  const scorecard = data.nbaPicksScorecard;
  const picksBoard = data.nbaPicksBoard;
  const champOdds = data.nbaChampOdds || {};

  const sections = [];

  // 1. NBA Daily Intelligence — sanitize bullets against actual results.
  // Stale "forced Game 7" copy gets removed/rewritten when Game 7 is final.
  const rawBullets = extractNarrativeBullets(narrative, 4);
  const sanitized = sanitizeNbaNarrativeBullets({ bullets: rawBullets, yesterdayResults: yesterday });
  if (sanitized.removedCount > 0 || sanitized.rewrittenCount > 0) {
    console.log(`[globalBriefing] NBA narrative sanitized: removed=${sanitized.removedCount} rewritten=${sanitized.rewrittenCount}`);
  }
  const bullets = renderBulletsHtml(sanitized.bullets);
  if (bullets) {
    sections.push(`
${sectionPill('\u{1F3C0} NBA DAILY INTELLIGENCE', RED)}
<tr><td style="padding:6px 24px 12px;">${bullets}</td></tr>`);
  }

  // 2. Yesterday's NBA Results — defensive, only valid rows, with insights
  if (yesterday.length > 0) {
    const topNbaOddsSlugs = Object.keys(champOdds).slice(0, 5);
    const rows = yesterday.slice(0, 5).map((g, i, arr) => {
      const insight = buildResultInsight(g, { sport: 'nba', topOddsSlugs: topNbaOddsSlugs, narrative });
      return resultRow(g, nbaTeamLogoImg, i === arr.length - 1, insight);
    }).join('');
    sections.push(sectionCard({
      label: "YESTERDAY’S NBA RESULTS",
      body: `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">${rows}</table>`,
      accent: RED,
    }));
  } else if (yesterdayRaw.length > 0) {
    // We had rows but all were invalid — show clean fallback instead of malformed data
    sections.push(sectionCard({
      label: "YESTERDAY’S NBA RESULTS",
      body: noResultsFallback('NBA playoff'),
      accent: RED,
    }));
  }

  // 3. NBA Picks Scorecard (compact placeholder until backend ships)
  sections.push(sectionCard({
    label: 'NBA PICKS SCORECARD',
    body: scorecard
      ? renderScorecard(scorecard)
      : `<p style="margin:0;font-size:12px;color:${DIM};font-style:italic;font-family:${F};">NBA scorecard activates once official playoff model picks begin settling.</p>`,
    accent: RED,
  }));

  // 4. Today's NBA Picks OR NBA Model Watch (deterministic from existing data)
  const picksHtml = renderTodaysPicks(picksBoard, 3);
  if (picksHtml) {
    sections.push(sectionCard({
      label: "TODAY’S NBA PICKS",
      body: picksHtml,
      accent: RED,
    }));
  } else {
    // No official picks backend — render Model Watch from existing odds + results
    const watch = buildNbaModelWatch({
      nbaChampOdds: champOdds,
      nbaStandings: data.nbaStandings,
      nbaYesterdayResults: yesterday,
      nbaNarrative: narrative,
    });
    if (watch.length > 0) {
      const rows = watch.map((w, i) => `
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;${i === watch.length - 1 ? '' : `border-bottom:1px solid ${ROW_BORDER};`}">
          <tr><td style="padding:8px 0;font-family:${F};">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
              <tr>
                <td style="width:24px;vertical-align:middle;padding-right:8px;">${nbaTeamLogoImg({ slug: w.slug }, 18)}</td>
                <td style="font-size:13px;font-weight:800;color:${NAVY};vertical-align:middle;width:48px;">${w.label}</td>
                <td style="font-size:12px;color:${BODY};vertical-align:middle;line-height:16px;">${w.signal}</td>
                <td align="right" style="vertical-align:middle;">
                  <span style="display:inline-block;font-size:9px;font-weight:700;color:${RED};background:#fef2f2;border-radius:3px;padding:2px 6px;letter-spacing:0.04em;text-transform:uppercase;font-family:${F};">${w.kind === 'anchor' ? 'Anchor' : w.kind === 'riser' ? 'Riser' : 'Lean'}</span>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>`).join('');
      sections.push(sectionCard({
        label: "TODAY’S NBA MODEL WATCH",
        body: `${rows}<p style="margin:8px 0 0;font-size:10px;color:${DIM};font-style:italic;font-family:${F};">Model watch — derived from current championship pricing and recent results. Not official picks.</p>`,
        accent: RED,
      }));
    } else {
      sections.push(sectionCard({
        label: "TODAY’S NBA MODEL WATCH",
        body: `<p style="margin:0;font-size:12px;color:${DIM};font-style:italic;font-family:${F};">NBA playoff model watch updates as title odds and matchup data refresh.</p>`,
        accent: RED,
      }));
    }
  }

  // 5. NBA Championship Odds (with market read above the list)
  const oddsHtml = renderChampOddsCompact(champOdds, NBA_TEAM_INFO, nbaTeamLogoImg, 5);
  if (oddsHtml) {
    const marketRead = buildOddsMarketRead(champOdds, { sport: 'nba', teamInfo: NBA_TEAM_INFO });
    const marketReadHtml = marketRead
      ? `<p style="margin:0 0 10px;font-size:12px;line-height:17px;color:${BODY};font-family:${F};">${normalizeSpacing(stripInlineEmoji(marketRead))}</p>`
      : '';
    sections.push(sectionCard({
      label: 'NBA CHAMPIONSHIP ODDS',
      body: marketReadHtml + oddsHtml,
      accent: RED,
    }));
  }

  // Sport block has substantive content if we have anything beyond just the empty scorecard
  const hasSubstantive = !!(bullets || yesterday.length > 0 || picksHtml || oddsHtml);

  if (!hasSubstantive) return { html: '', hasContent: false };

  return {
    html: `
${sportHeader({ logoUrl: NBA_PLAYOFFS_LOGO, label: 'NBA PLAYOFFS', accent: RED })}
${sections.join('\n')}`,
    hasContent: true,
  };
}

function buildMlbBlock(data) {
  const mlbData = data.mlbData;
  const narrative = mlbData?.narrativeParagraph || '';
  const yesterdayRaw = data.mlbYesterdayResults || [];
  const yesterday = yesterdayRaw.filter(isValidResultRow);
  const scorecard = data.mlbPicksScorecard;
  const picksBoard = mlbData?.picksBoard;
  const champOdds = data.champOdds || {};

  const sections = [];

  // 1. MLB Daily Intelligence
  const bullets = narrativeBullets(narrative, 4);
  if (bullets) {
    sections.push(`
${sectionPill('⚾ MLB DAILY INTELLIGENCE', BLUE)}
<tr><td style="padding:6px 24px 12px;">${bullets}</td></tr>`);
  }

  // 2. Yesterday's MLB Results — defensive, with insights
  if (yesterday.length > 0) {
    const topMlbOddsSlugs = Object.keys(champOdds).slice(0, 5);
    const rows = yesterday.slice(0, 5).map((g, i, arr) => {
      const insight = buildResultInsight(g, { sport: 'mlb', topOddsSlugs: topMlbOddsSlugs, narrative });
      return resultRow(g, mlbTeamLogoImg, i === arr.length - 1, insight);
    }).join('');
    sections.push(sectionCard({
      label: "YESTERDAY’S MLB RESULTS",
      body: `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">${rows}</table>`,
      accent: BLUE,
    }));
  } else if (yesterdayRaw.length > 0) {
    sections.push(sectionCard({
      label: "YESTERDAY’S MLB RESULTS",
      body: noResultsFallback('MLB'),
      accent: BLUE,
    }));
  }

  // 3. MLB Picks Scorecard
  sections.push(sectionCard({
    label: 'MLB PICKS SCORECARD',
    body: scorecard
      ? renderScorecard(scorecard)
      : `<p style="margin:0;font-size:12px;color:${DIM};font-style:italic;font-family:${F};">MLB scorecard will appear once yesterday’s picks settle.</p>`,
    accent: BLUE,
  }));

  // 4. Today's MLB Picks (compact: top 3 unique matchups, no duplicates)
  const picksHtml = renderTodaysPicks(picksBoard, 3);
  if (picksHtml) {
    sections.push(sectionCard({
      label: "TODAY’S MLB PICKS",
      body: picksHtml,
      accent: BLUE,
    }));
  }

  // 5. World Series Odds (with market read)
  const oddsHtml = renderChampOddsCompact(champOdds, MLB_TEAM_INFO, mlbTeamLogoImg, 5);
  if (oddsHtml) {
    const marketRead = buildOddsMarketRead(champOdds, { sport: 'mlb', teamInfo: MLB_TEAM_INFO });
    const marketReadHtml = marketRead
      ? `<p style="margin:0 0 10px;font-size:12px;line-height:17px;color:${BODY};font-family:${F};">${normalizeSpacing(stripInlineEmoji(marketRead))}</p>`
      : '';
    sections.push(sectionCard({
      label: 'WORLD SERIES ODDS',
      body: marketReadHtml + oddsHtml,
      accent: BLUE,
    }));
  }

  const hasSubstantive = !!(bullets || yesterday.length > 0 || picksHtml || oddsHtml);
  if (!hasSubstantive) return { html: '', hasContent: false };

  return {
    html: `
${sportHeader({ logoUrl: MLB_LEAGUE_LOGO, label: 'MLB', accent: BLUE })}
${sections.join('\n')}`,
    hasContent: true,
  };
}

// ── Exports ──────────────────────────────────────────────────────

export function getSubject() {
  return `\u{1F4E1} Your Daily Global Intel Briefing`;
}

export function renderHTML(data = {}) {
  const { displayName, dateCtx, mlbData, nbaData } = data;
  const greetingName = (displayName ? displayName.split(' ')[0] : null) || 'there';
  const today = dateCtx?.briefingDateLabel
    || new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' });
  const ptHourFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hour12: false });
  const ptHour = parseInt(ptHourFmt.format(new Date()), 10);
  const partOfDay = ptHour < 12 ? 'morning' : ptHour < 17 ? 'afternoon' : 'evening';

  // Cross-sport intelligence hook (one synthesis line)
  const crossSportHook = buildCrossSportHook({ nbaData, mlbData });

  // Build NBA-first, then MLB
  const nba = buildNbaBlock(data);
  const mlb = buildMlbBlock(data);

  // Diagnostic — sections + intelligence-layer signals
  const nbaWatch = !data.nbaPicksBoard ? buildNbaModelWatch({
    nbaChampOdds: data.nbaChampOdds, nbaStandings: data.nbaStandings,
    nbaYesterdayResults: data.nbaYesterdayResults, nbaNarrative: nbaData?.narrativeParagraph,
  }) : [];
  console.log('[globalBriefing] sections:', {
    nba: nba.hasContent,
    mlb: mlb.hasContent,
    crossSportHook: !!crossSportHook,
    nbaResults: (data.nbaYesterdayResults || []).length,
    nbaPicks: !!data.nbaPicksBoard,
    nbaModelWatch: nbaWatch.length,
    nbaOddsMarketRead: Object.keys(data.nbaChampOdds || {}).length > 0,
    nbaOdds: Object.keys(data.nbaChampOdds || {}).length,
    nbaNarrative: !!(data.nbaData?.narrativeParagraph),
    mlbResults: (data.mlbYesterdayResults || []).length,
    mlbPicks: !!(data.mlbData?.picksBoard),
    mlbOddsMarketRead: Object.keys(data.champOdds || {}).length > 0,
    mlbOdds: Object.keys(data.champOdds || {}).length,
    mlbNarrative: !!(data.mlbData?.narrativeParagraph),
  });

  const hasAnyContent = nba.hasContent || mlb.hasContent;

  const emptyState = !hasAnyContent ? `
<tr><td style="padding:14px 24px 6px;">
  <span style="font-size:11px;font-weight:700;color:${RED};letter-spacing:0.08em;text-transform:uppercase;font-family:${F};">DAILY BRIEFING</span>
</td></tr>
<tr><td style="padding:6px 24px 16px;">
  <p style="margin:0 0 8px;font-size:14px;line-height:21px;color:#4b5563;font-family:${F};">Today’s briefing is still being assembled. The Maximus Model is processing the latest data — check the app for the most current intelligence.</p>
  <p style="margin:8px 0 0;"><a href="https://maximussports.ai" style="font-size:13px;color:${RED};text-decoration:none;font-weight:600;font-family:${F};">Open Maximus Sports &rarr;</a></p>
</td></tr>` : '';

  const sportBlocks = [
    nba.hasContent ? nba.html : '',
    mlb.hasContent ? mlb.html : '',
  ].filter(Boolean).join('\n' + divider() + '\n');

  const hookBlock = (hasAnyContent && crossSportHook) ? `
<tr><td style="padding:0 24px 14px;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fef2f2;border-left:3px solid ${RED};border-radius:4px;border-collapse:collapse;">
    <tr><td style="padding:10px 14px;">
      <span style="font-size:10px;font-weight:700;color:${RED};letter-spacing:0.08em;text-transform:uppercase;font-family:${F};">TODAY’S EDGE</span>
      <p style="margin:3px 0 0;font-size:13px;line-height:18px;color:${NAVY};font-family:${F};">${normalizeSpacing(stripInlineEmoji(crossSportHook))}</p>
    </td></tr>
  </table>
</td></tr>` : '';

  const content = `
${heroBlock({ line: 'Your daily cross-sport intelligence briefing.', sublabel: today })}
<tr><td style="padding:8px 24px 14px;">
  <p style="margin:0;font-size:14px;color:#4b5563;line-height:1.55;font-family:${F};">Good ${partOfDay}, ${greetingName}. NBA Playoffs lead today’s board, with MLB right behind.</p>
</td></tr>
${hookBlock}
${compactDivider()}
${hasAnyContent ? sportBlocks : emptyState}
${hasAnyContent ? divider() : ''}
${hasAnyContent ? renderPartnerModule({ padding: '8px 24px 16px' }) : ''}`;

  return EmailShell({
    content,
    previewText: '\u{1F4E1} NBA Playoffs lead today’s board — plus MLB intel.',
    ctaUrl: 'https://maximussports.ai',
    ctaLabel: 'Open Maximus Sports &rarr;',
  });
}

export function renderText(data = {}) {
  const { displayName, mlbData, nbaData, dateCtx } = data;
  const name = (displayName ? displayName.split(' ')[0] : null) || 'there';
  const today = dateCtx?.briefingDateLabel
    || new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' });
  const lines = [
    '\u{1F4E1} MAXIMUS SPORTS — Daily Global Intel Briefing',
    today, '',
    `Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${name}. NBA Playoffs lead today, MLB second.`, '',
  ];

  // ─── NBA PLAYOFFS ───
  lines.push('🏀 NBA PLAYOFFS');
  lines.push('─────────────');
  const nN = nbaData?.narrativeParagraph || '';
  if (nN) {
    nN.replace(/\*\*/g, '').split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.length > 15).slice(0, 4).forEach(s => lines.push(`• ${s}`));
    lines.push('');
  }
  const nbaResults = data.nbaYesterdayResults || [];
  if (nbaResults.length > 0) {
    lines.push("YESTERDAY'S NBA RESULTS:");
    nbaResults.slice(0, 5).forEach(g => lines.push(`  ${g.away?.abbrev} ${g.away?.score} @ ${g.home?.abbrev} ${g.home?.score}`));
    lines.push('');
  }
  const nbaOddsKeys = Object.entries(data.nbaChampOdds || {}).slice(0, 5);
  if (nbaOddsKeys.length > 0) {
    lines.push('NBA CHAMPIONSHIP ODDS:');
    nbaOddsKeys.forEach(([slug, o]) => lines.push(`  ${slug.toUpperCase()}: ${fmtOdds(o.bestChanceAmerican ?? o.american)}`));
    lines.push('');
  }

  // ─── MLB ───
  lines.push('⚾ MLB');
  lines.push('─────────────');
  const mN = mlbData?.narrativeParagraph || '';
  if (mN) {
    mN.replace(/\*\*/g, '').split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.length > 15).slice(0, 4).forEach(s => lines.push(`• ${s}`));
    lines.push('');
  }
  const mlbResults = data.mlbYesterdayResults || [];
  if (mlbResults.length > 0) {
    lines.push("YESTERDAY'S MLB RESULTS:");
    mlbResults.slice(0, 5).forEach(g => lines.push(`  ${g.away?.abbrev} ${g.away?.score} @ ${g.home?.abbrev} ${g.home?.score}`));
    lines.push('');
  }
  const picks = mlbData?.picksBoard?.categories;
  if (picks) {
    const all = [...(picks.pickEms || []), ...(picks.ats || []), ...(picks.totals || [])];
    const top = all.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0)).slice(0, 4);
    if (top.length > 0) {
      lines.push("TODAY'S MLB PICKS:");
      top.forEach(p => {
        const a = p.matchup?.awayTeam?.shortName || '?';
        const h = p.matchup?.homeTeam?.shortName || '?';
        lines.push(`  • ${a} vs ${h}: ${p.pick?.label || '—'} (${p.confidence || 'edge'})`);
      });
      lines.push('');
    }
  }
  const mlbOddsKeys = Object.entries(data.champOdds || {}).slice(0, 5);
  if (mlbOddsKeys.length > 0) {
    lines.push('WORLD SERIES ODDS:');
    mlbOddsKeys.forEach(([slug, o]) => lines.push(`  ${slug.toUpperCase()}: ${fmtOdds(o.bestChanceAmerican ?? o.american)}`));
    lines.push('');
  }

  lines.push('Open Maximus Sports -> https://maximussports.ai', '');
  lines.push("ACT ON TODAY'S BOARD:");
  lines.push('  XBet Welcome Offer: https://record.webpartners.co/_HSjxL9LMlaLhIFuQAd3mRWNd7ZgqdRLk/1/');
  lines.push('  MyBookie Welcome Bonus: https://record.webpartners.co/_HSjxL9LMlaIxuOePL6NGnGNd7ZgqdRLk/1/');
  lines.push('', 'Not betting advice. Manage preferences: https://maximussports.ai/settings');
  return lines.join('\n');
}
