/**
 * Global Daily Briefing — flagship multi-sport editorial digest.
 *
 * Content architecture mirrors the 3 MLB IG Daily Briefing slides:
 *   Slide 1: Hero narrative, Hot Off The Press, Pennant Race, Picks highlights
 *   Slide 2: Season Leaders (5 categories), Maximus's Picks (3-4 cards)
 *   Slide 3: World Series Outlook (AL top 5 + NL top 5)
 *
 * Plus: optional NCAAM championship recap (time-limited)
 */

import { EmailShell, heroBlock } from '../EmailShell.js';
import { LEADER_CATEGORIES } from '../../data/mlb/seasonLeaders.js';
import { stripInlineEmoji, normalizeSpacing, cleanNarrativeText, mlbTeamLogoImg, nbaTeamLogoImg, renderPartnerModule } from '../MlbEmailShell.js';

// NBA team metadata for logo + name lookup. Mirrors src/sports/nba/teams.js.
const NBA_TEAM_INFO = {
  atl: { name: 'Hawks', conf: 'Eastern' },     bos: { name: 'Celtics', conf: 'Eastern' },
  bkn: { name: 'Nets', conf: 'Eastern' },      cha: { name: 'Hornets', conf: 'Eastern' },
  chi: { name: 'Bulls', conf: 'Eastern' },     cle: { name: 'Cavaliers', conf: 'Eastern' },
  det: { name: 'Pistons', conf: 'Eastern' },   ind: { name: 'Pacers', conf: 'Eastern' },
  mia: { name: 'Heat', conf: 'Eastern' },      mil: { name: 'Bucks', conf: 'Eastern' },
  nyk: { name: 'Knicks', conf: 'Eastern' },    orl: { name: 'Magic', conf: 'Eastern' },
  phi: { name: '76ers', conf: 'Eastern' },     tor: { name: 'Raptors', conf: 'Eastern' },
  was: { name: 'Wizards', conf: 'Eastern' },
  dal: { name: 'Mavericks', conf: 'Western' }, den: { name: 'Nuggets', conf: 'Western' },
  gsw: { name: 'Warriors', conf: 'Western' },  hou: { name: 'Rockets', conf: 'Western' },
  lac: { name: 'Clippers', conf: 'Western' },  lal: { name: 'Lakers', conf: 'Western' },
  mem: { name: 'Grizzlies', conf: 'Western' }, min: { name: 'Timberwolves', conf: 'Western' },
  nop: { name: 'Pelicans', conf: 'Western' },  okc: { name: 'Thunder', conf: 'Western' },
  phx: { name: 'Suns', conf: 'Western' },      por: { name: 'Trail Blazers', conf: 'Western' },
  sac: { name: 'Kings', conf: 'Western' },     sas: { name: 'Spurs', conf: 'Western' },
  uta: { name: 'Jazz', conf: 'Western' },
};

function nbaSlugInfo(slug) {
  return NBA_TEAM_INFO[slug] || { name: slug?.toUpperCase() || '?', conf: '' };
}

const F = "'DM Sans',Arial,Helvetica,sans-serif";
const RED = '#c41e3a';
const BLUE = '#2d6ca8';
const NAVY = '#0f2440';
const BODY = '#1f2937';
const MUTED = '#9ca3af';
const DIM = '#b0b8c4';       // lighter than MUTED — labels that must not compete
const BORDER = '#e5e7eb';
const ROW_BORDER = '#eef0f2'; // subtler than BORDER — between ranked rows
const CARD_BG = '#f9fafb';

// Championship display: 5 days from April 7, 2026
const CHAMP_DATE = new Date('2026-04-07T00:00:00');
const CHAMP_DAYS = 5;
function showChamp() {
  const d = (new Date() - CHAMP_DATE) / 86400000;
  return d >= 0 && d <= CHAMP_DAYS;
}

// ── Helpers ──────────────────────────────────────────────────────

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

function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Team logo img by slug — compact inline helper for email use */
function logoImg(slug, size = 18) {
  return mlbTeamLogoImg({ slug, abbrev: (slug || '').toUpperCase() }, size);
}

/** Abbreviation-to-slug mapping for leader team logos */
const ABBREV_TO_SLUG = {
  NYY: 'nyy', BOS: 'bos', TOR: 'tor', TB: 'tb', BAL: 'bal',
  CLE: 'cle', MIN: 'min', DET: 'det', CWS: 'cws', KC: 'kc',
  HOU: 'hou', SEA: 'sea', TEX: 'tex', LAA: 'laa', OAK: 'oak',
  ATL: 'atl', NYM: 'nym', PHI: 'phi', MIA: 'mia', WSH: 'wsh',
  CHC: 'chc', MIL: 'mil', STL: 'stl', PIT: 'pit', CIN: 'cin',
  LAD: 'lad', SD: 'sd', SF: 'sf', ARI: 'ari', COL: 'col',
};

/** Section pill — compact red label badge */
function sectionPill(label) {
  return `
<tr><td style="padding:22px 24px 10px;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr><td style="background:rgba(196,30,58,0.06);border:1px solid rgba(196,30,58,0.15);border-radius:4px;padding:5px 14px;">
      <span style="font-size:11px;font-weight:700;color:${RED};letter-spacing:0.08em;text-transform:uppercase;font-family:${F};">${label}</span>
    </td></tr>
  </table>
</td></tr>`;
}

/** Compact divider */
function divider() {
  return `<tr><td style="padding:8px 28px;"><div style="height:1px;background:${ROW_BORDER};font-size:0;">&nbsp;</div></td></tr>`;
}

// ── Exports ──────────────────────────────────────────────────────

export function getSubject() {
  const sc = showChamp();
  if (sc) return `\u{1F4E1} Michigan wins the title \u2014 plus today\u2019s MLB intel`;
  return `\u{1F4E1} Your Daily Global Intel Briefing`;
}

export function renderHTML(data = {}) {
  const { displayName, mlbData } = data;
  const greetingName = (displayName ? displayName.split(' ')[0] : null) || 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const partOfDay = new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening';
  const sc = showChamp();

  // Diagnostic
  console.log('[globalBriefing template]', {
    hasMlbData: !!mlbData,
    mlbNarrativeLen: mlbData?.narrativeParagraph?.length || 0,
    mlbHeadlineCount: mlbData?.headlines?.length || 0,
    hasPicks: !!mlbData?.picksBoard,
    hasPennant: !!data.pennantRace,
    hasLeaders: !!data.leadersCategories,
    hasOutlook: !!data.worldSeriesOutlook,
  });

  if (!mlbData) {
    console.error('[globalBriefing] CRITICAL: mlbData is missing — MLB section will not render');
  }

  const mlbNarrative = mlbData?.narrativeParagraph || '';
  const mlbHeadlines = mlbData?.headlines || [];
  const picks = mlbData?.picksBoard?.categories;

  // ══════════════════════════════════════════════════════════════
  // 0. NCAAM CHAMPIONSHIP (time-limited)
  // ══════════════════════════════════════════════════════════════
  let ncaamHtml = '';
  if (sc) {
    ncaamHtml = `
<tr><td style="padding:22px 24px 10px;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr><td style="background:rgba(56,133,224,0.08);border:1px solid rgba(56,133,224,0.15);border-radius:4px;padding:5px 12px;">
      <span style="font-size:12px;font-weight:700;color:${BLUE};letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">\u{1F3C6} NCAA MEN'S CHAMPIONSHIP</span>
    </td></tr>
  </table>
</td></tr>
<tr><td style="padding:8px 24px 6px;">
  <p style="margin:0 0 4px;font-size:17px;font-weight:800;line-height:24px;color:#111827;font-family:${F};">Michigan beats UConn for the national title</p>
  <p style="margin:0;font-size:13px;color:${MUTED};font-family:${F};">Final: Michigan 69, UConn 63</p>
</td></tr>
<tr><td style="padding:6px 24px 16px;">
  <p style="margin:0;font-size:14px;line-height:22px;color:#4b5563;font-family:${F};">The Wolverines captured their first title since 1989 with relentless defensive pressure. Michigan finishes No. 1 in the final AP poll for the first time since 1977.</p>
</td></tr>
${divider()}`;
  }

  // ══════════════════════════════════════════════════════════════
  // 1. MLB HERO NARRATIVE (Slide 1 hero)
  // ══════════════════════════════════════════════════════════════
  let narrativeHtml = '';
  if (mlbNarrative) {
    const bullets = mlbNarrative.split(/\n{2,}/)
      .map(p => cleanNarrativeText(p)).filter(p => p.length > 30)
      .flatMap(p => p.replace(/<[^>]+>/g, '').split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.length > 15))
      .slice(0, 6);

    if (bullets.length > 0) {
      narrativeHtml = bullets.map(b =>
        `<p style="margin:0 0 8px;font-size:14px;line-height:22px;color:#4b5563;font-family:${F};">&bull; ${normalizeSpacing(stripInlineEmoji(b))}</p>`
      ).join('');
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 2. HOT OFF THE PRESS (Slide 1)
  // ══════════════════════════════════════════════════════════════
  let hotPressHtml = '';
  if (narrativeHtml) {
    hotPressHtml = `
${sectionPill('\u26BE MLB DAILY INTELLIGENCE')}
<tr><td style="padding:6px 24px 16px;">
  ${narrativeHtml}
</td></tr>`;
  }

  // ══════════════════════════════════════════════════════════════
  // 3. PENNANT RACE SNAPSHOT (Slide 1 — with team logos)
  // ══════════════════════════════════════════════════════════════
  let pennantHtml = '';
  const pennant = data.pennantRace;
  const champOdds = data.champOdds || {};

  if (pennant?.al?.length > 0 && pennant?.nl?.length > 0) {
    const renderTeamRow = (t, i, isLast) => {
      const oddsData = champOdds[t.slug];
      const odds = oddsData?.bestChanceAmerican ?? oddsData?.american ?? t.champOdds ?? null;
      return `
      <tr>
        <td style="padding:7px 0${isLast ? '' : `;border-bottom:1px solid ${ROW_BORDER}`};font-family:${F};">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td style="width:16px;font-size:11px;font-weight:600;color:${DIM};vertical-align:middle;font-family:${F};">${i + 1}</td>
              <td style="width:24px;vertical-align:middle;padding:0 8px 0 0;">${logoImg(t.slug, 16)}</td>
              <td style="font-size:14px;font-weight:700;color:${NAVY};vertical-align:middle;font-family:${F};width:42px;">${t.abbrev}</td>
              <td style="vertical-align:middle;">
                <span style="font-size:12px;font-weight:500;color:${BODY};font-family:${F};">${t.projectedWins} wins</span>
                <span style="font-size:10px;font-weight:400;color:${DIM};font-family:${F};padding-left:4px;">${capitalize(t.confidenceTier || '')}</span>
              </td>
              <td align="right" style="width:44px;vertical-align:middle;white-space:nowrap;">
                <span style="font-size:11px;font-weight:700;color:${RED};font-family:${F};">${fmtOdds(odds)}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    };

    pennantHtml = `
<tr><td style="padding:0 24px 16px;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:6px;border-collapse:collapse;">
    <tr><td style="padding:14px 16px 6px;">
      <span style="font-size:12px;font-weight:700;color:${RED};letter-spacing:0.08em;text-transform:uppercase;font-family:${F};">PENNANT RACE SNAPSHOT</span>
    </td></tr>
    <tr><td style="padding:4px 16px 8px;">
      <span style="font-size:10px;font-weight:600;color:${BLUE};letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">AMERICAN LEAGUE</span>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-top:4px;">
        ${pennant.al.map((t, i) => renderTeamRow(t, i, i === pennant.al.length - 1)).join('')}
      </table>
    </td></tr>
    <tr><td style="padding:10px 16px 8px;">
      <span style="font-size:10px;font-weight:600;color:${RED};letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">NATIONAL LEAGUE</span>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-top:4px;">
        ${pennant.nl.map((t, i) => renderTeamRow(t, i, i === pennant.nl.length - 1)).join('')}
      </table>
    </td></tr>
    <tr><td style="padding:8px 16px 14px;">
      <a href="https://maximussports.ai/mlb/season-intelligence" style="font-size:11px;color:${RED};text-decoration:none;font-weight:600;font-family:${F};">Full Season Intelligence &rarr;</a>
    </td></tr>
  </table>
</td></tr>`;
  }

  // ══════════════════════════════════════════════════════════════
  // 4. MAXIMUS'S PICKS HIGHLIGHTS (Slide 1 & 2)
  // ══════════════════════════════════════════════════════════════
  let picksHtml = '';
  if (picks) {
    const allPicks = [
      ...(picks.pickEms || []).map(p => ({ ...p, type: "Pick 'Em" })),
      ...(picks.ats || []).map(p => ({ ...p, type: 'ATS' })),
      ...(picks.totals || []).map(p => ({ ...p, type: 'O/U' })),
    ];

    const atsPicks = allPicks.filter(p => p.type === 'ATS');
    const allByConf = [...allPicks].sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
    const selected = [];
    const usedIds = new Set();

    if (atsPicks.length > 0) {
      const bestAts = [...atsPicks].sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0))[0];
      selected.push(bestAts);
      usedIds.add(bestAts.id);
    }
    for (const p of allByConf) {
      if (selected.length >= 4) break;
      if (!usedIds.has(p.id)) { selected.push(p); usedIds.add(p.id); }
    }

    if (selected.length > 0) {
      const pickCards = selected.map((p, idx) => {
        const away = p.matchup?.awayTeam?.shortName || p.matchup?.awayTeam?.name || '?';
        const home = p.matchup?.homeTeam?.shortName || p.matchup?.homeTeam?.name || '?';
        const matchup = `${away} vs ${home}`;
        const selection = p.pick?.label || '—';
        const conviction = fmtConviction(p.confidence);
        const rationale = p.pick?.explanation
          ? (p.pick.explanation.length > 60 ? p.pick.explanation.slice(0, 60).replace(/\s+\S*$/, '') + '.' : p.pick.explanation)
          : `Model edge: ${conviction.toLowerCase()}`;
        const isLast = idx === selected.length - 1;

        return `
        <tr>
          <td style="padding:10px 0${isLast ? '' : `;border-bottom:1px solid ${ROW_BORDER}`};font-family:${F};">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
              <tr>
                <td style="vertical-align:top;">
                  <p style="margin:0 0 3px;font-size:11px;font-weight:500;color:${DIM};letter-spacing:0.02em;font-family:${F};">${matchup}</p>
                  <p style="margin:0;font-size:15px;font-weight:800;color:${NAVY};line-height:20px;font-family:${F};">${selection}</p>
                </td>
                <td style="width:64px;text-align:center;vertical-align:top;padding-top:2px;">
                  <span style="display:inline-block;font-size:9px;font-weight:700;color:#5a7da8;background:#f0f4f8;border-radius:3px;padding:3px 7px;letter-spacing:0.04em;text-transform:uppercase;font-family:${F};">${p.type}</span>
                </td>
                <td style="width:60px;text-align:right;vertical-align:top;padding-top:4px;">
                  <span style="font-size:12px;font-weight:700;color:${p.confidence === 'high' ? RED : '#4b5563'};font-family:${F};">${conviction}</span>
                </td>
              </tr>
            </table>
            <p style="margin:4px 0 0;font-size:11px;color:${DIM};line-height:16px;font-family:${F};">${normalizeSpacing(stripInlineEmoji(rationale))}</p>
          </td>
        </tr>`;
      }).join('');

      picksHtml = `
<tr><td style="padding:0 24px 16px;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${CARD_BG};border:1px solid ${BORDER};border-left:3px solid ${RED};border-radius:6px;border-collapse:collapse;">
    <tr><td style="padding:14px 16px 4px;">
      <span style="font-size:12px;font-weight:700;color:${RED};letter-spacing:0.08em;text-transform:uppercase;font-family:${F};">MAXIMUS'S PICKS</span>
    </td></tr>
    <tr><td style="padding:0 16px 8px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
        ${pickCards}
      </table>
    </td></tr>
    <tr><td style="padding:4px 16px 14px;">
      <a href="https://maximussports.ai/mlb/insights" style="font-size:11px;color:${RED};text-decoration:none;font-weight:600;font-family:${F};">Open Full Picks Board &rarr;</a>
    </td></tr>
  </table>
</td></tr>`;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 5. SEASON LEADERS (Slide 2 — 5 categories, top 3 each, with logos)
  // ══════════════════════════════════════════════════════════════
  let leadersHtml = '';
  const leadersCategories = data.leadersCategories || {};
  const activeCats = LEADER_CATEGORIES.filter(cat => leadersCategories[cat.key]?.leaders?.length > 0);

  if (activeCats.length > 0) {
    const catBlocks = activeCats.map((cat, catIdx) => {
      const leaders = leadersCategories[cat.key].leaders.slice(0, 3);
      const isLast = catIdx === activeCats.length - 1;
      const rows = leaders.map((l, i) => {
        const slug = ABBREV_TO_SLUG[(l.teamAbbrev || '').toUpperCase()] || null;
        return `
        <tr>
          <td style="width:16px;font-size:11px;font-weight:600;color:${DIM};vertical-align:middle;font-family:${F};padding:4px 0;">${i + 1}</td>
          <td style="font-size:13px;font-weight:600;color:${BODY};vertical-align:middle;font-family:${F};padding:4px 6px 4px 4px;">${l.name}</td>
          <td style="width:22px;vertical-align:middle;padding:4px 6px 4px 0;">${slug ? logoImg(slug, 14) : `<span style="font-size:10px;color:${DIM};font-family:${F};">${l.teamAbbrev || ''}</span>`}</td>
          <td align="right" style="width:32px;font-size:14px;font-weight:800;color:${NAVY};vertical-align:middle;font-family:${F};padding:4px 0;">${l.display || l.value || ''}</td>
        </tr>`;
      }).join('');

      return `
      <tr><td style="padding:${catIdx === 0 ? '0' : '8px'} 0 ${isLast ? '0' : '8px'};${isLast ? '' : `border-bottom:1px solid ${ROW_BORDER};`}">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
          <tr>
            <td colspan="4" style="padding:0 0 3px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                <tr>
                  <td style="font-size:11px;font-weight:700;color:${NAVY};text-transform:uppercase;letter-spacing:0.05em;font-family:${F};">${cat.label}</td>
                  <td align="right" style="font-size:10px;font-weight:600;color:${DIM};font-family:${F};">${cat.abbrev}</td>
                </tr>
              </table>
            </td>
          </tr>
          ${rows}
        </table>
      </td></tr>`;
    }).join('');

    leadersHtml = `
${sectionPill('\u{1F4CA} SEASON LEADERS')}
<tr><td style="padding:6px 24px 16px;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:6px;border-collapse:collapse;">
    <tr><td style="padding:14px 16px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
        ${catBlocks}
      </table>
    </td></tr>
  </table>
</td></tr>`;
  }

  // ══════════════════════════════════════════════════════════════
  // 6. WORLD SERIES OUTLOOK (Slide 3 — AL top 5 + NL top 5, with logos)
  // ══════════════════════════════════════════════════════════════
  let outlookHtml = '';
  const outlook = data.worldSeriesOutlook;

  if (outlook?.al?.length > 0 && outlook?.nl?.length > 0) {
    const renderOutlookTeam = (t, rank, isLast) => {
      const signal = (t.signals || [])[0] || '';
      const rationale = t.distilledRationale || '';
      const shortRat = rationale.length > 100 ? rationale.slice(0, 100).replace(/\s+\S*$/, '') + '.' : rationale;

      return `
      <tr>
        <td style="padding:10px 0${isLast ? '' : `;border-bottom:1px solid ${ROW_BORDER}`};font-family:${F};">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td style="width:18px;font-size:12px;font-weight:600;color:${DIM};vertical-align:top;padding-top:3px;font-family:${F};">${rank}</td>
              <td style="width:28px;vertical-align:top;padding:2px 8px 0 0;">${logoImg(t.slug, 20)}</td>
              <td style="vertical-align:top;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                  <tr>
                    <td style="font-size:14px;font-weight:800;color:${NAVY};font-family:${F};">${t.abbrev}</td>
                    <td align="right">
                      <span style="font-size:11px;font-weight:700;color:${RED};font-family:${F};">${fmtOdds(t.champOdds)}</span>
                    </td>
                  </tr>
                </table>
                <p style="margin:2px 0 0;font-family:${F};">
                  <span style="font-size:20px;font-weight:800;color:${NAVY};line-height:24px;">${t.projectedWins}</span>
                  <span style="font-size:10px;font-weight:500;color:${DIM};text-transform:uppercase;letter-spacing:0.04em;padding-left:3px;">projected wins</span>
                </p>
                ${signal ? `<span style="display:inline-block;font-size:9px;font-weight:600;color:#5a6577;background:#f0f1f3;border-radius:3px;padding:2px 7px;margin:3px 0 0;letter-spacing:0.02em;font-family:${F};">${signal}</span>` : ''}
                ${shortRat ? `<p style="margin:4px 0 0;font-size:12px;line-height:17px;color:${DIM};font-family:${F};">${normalizeSpacing(stripInlineEmoji(shortRat))}</p>` : ''}
                ${t.rangeLabel ? `<p style="margin:3px 0 0;font-size:10px;color:#c9cdd4;font-family:${F};">Range: ${t.rangeLabel} &middot; ${capitalize(t.confidenceTier || '')}</p>` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    };

    outlookHtml = `
${sectionPill('\u{1F3C6} WORLD SERIES OUTLOOK')}
<tr><td style="padding:2px 24px 8px;">
  <p style="margin:0;font-size:10px;font-weight:600;color:${DIM};text-transform:uppercase;letter-spacing:0.06em;font-family:${F};">WHAT THE MAXIMUS PREDICTION MODEL SAYS</p>
</td></tr>

<!-- AL Top 5 -->
<tr><td style="padding:4px 24px 8px;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:6px;border-collapse:collapse;">
    <tr><td style="padding:12px 16px 4px;">
      <span style="font-size:11px;font-weight:700;color:${BLUE};letter-spacing:0.08em;text-transform:uppercase;font-family:${F};">AMERICAN LEAGUE &mdash; TOP 5</span>
    </td></tr>
    <tr><td style="padding:0 16px 10px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
        ${outlook.al.map((t, i) => renderOutlookTeam(t, i + 1, i === outlook.al.length - 1)).join('')}
      </table>
    </td></tr>
  </table>
</td></tr>

<!-- NL Top 5 -->
<tr><td style="padding:4px 24px 16px;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:6px;border-collapse:collapse;">
    <tr><td style="padding:12px 16px 4px;">
      <span style="font-size:11px;font-weight:700;color:${RED};letter-spacing:0.08em;text-transform:uppercase;font-family:${F};">NATIONAL LEAGUE &mdash; TOP 5</span>
    </td></tr>
    <tr><td style="padding:0 16px 10px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
        ${outlook.nl.map((t, i) => renderOutlookTeam(t, i + 1, i === outlook.nl.length - 1)).join('')}
      </table>
    </td></tr>
  </table>
</td></tr>`;
  }

  // ══════════════════════════════════════════════════════════════
  // 7. SUPPORTING HEADLINES (de-emphasized)
  // ══════════════════════════════════════════════════════════════
  let headlineHtml = '';
  if (mlbHeadlines.length > 0) {
    const items = mlbHeadlines.slice(0, 4).map(h => {
      const t = normalizeSpacing(stripInlineEmoji(h.title || ''));
      const l = h.link || '#';
      const s = h.source || '';
      return `<p style="margin:0 0 6px;font-size:13px;line-height:18px;font-family:${F};">&bull; <a href="${l}" style="color:${BODY};text-decoration:none;font-weight:500;" target="_blank">${t}</a>${s ? ` <span style="font-size:11px;color:${MUTED};">(${s})</span>` : ''}</p>`;
    }).join('');

    headlineHtml = `
<tr><td style="padding:4px 24px 6px;">
  <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:${MUTED};letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">HEADLINES</p>
  ${items}
</td></tr>`;
  }

  // ══════════════════════════════════════════════════════════════
  // NBA SECTIONS (cross-sport hero email)
  // ══════════════════════════════════════════════════════════════
  const nbaData = data.nbaData;
  const nbaNarrative = nbaData?.narrativeParagraph || '';
  const nbaStandings = data.nbaStandings;
  const nbaTitleOutlook = data.nbaTitleOutlook || [];
  const nbaHeadlines = data.nbaHeadlines || [];
  const nbaChampOdds = data.nbaChampOdds || {};

  // ── NBA DAILY INTELLIGENCE narrative ──
  let nbaHotPressHtml = '';
  if (nbaNarrative) {
    const bullets = nbaNarrative.split(/\n{2,}/)
      .map(p => cleanNarrativeText(p)).filter(p => p.length > 30)
      .flatMap(p => p.replace(/<[^>]+>/g, '').split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.length > 15))
      .slice(0, 6);
    if (bullets.length > 0) {
      const html = bullets.map(b =>
        `<p style="margin:0 0 8px;font-size:14px;line-height:22px;color:#4b5563;font-family:${F};">&bull; ${normalizeSpacing(stripInlineEmoji(b))}</p>`
      ).join('');
      nbaHotPressHtml = `
${sectionPill('\u{1F3C0} NBA DAILY INTELLIGENCE')}
<tr><td style="padding:6px 24px 16px;">${html}</td></tr>`;
    }
  }

  // ── NBA CONFERENCE STANDINGS (top 5 East + West) ──
  let nbaStandingsHtml = '';
  if (nbaStandings?.east?.length > 0 && nbaStandings?.west?.length > 0) {
    const renderTeam = (t, i, isLast) => `
      <tr>
        <td style="padding:7px 0${isLast ? '' : `;border-bottom:1px solid ${ROW_BORDER}`};font-family:${F};">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td style="width:18px;font-size:11px;font-weight:600;color:${DIM};vertical-align:middle;">${i + 1}</td>
              <td style="width:24px;vertical-align:middle;padding:0 8px 0 0;">${nbaTeamLogoImg({ slug: t.slug }, 16)}</td>
              <td style="font-size:14px;font-weight:700;color:${NAVY};vertical-align:middle;width:48px;">${t.abbrev}</td>
              <td style="vertical-align:middle;">
                <span style="font-size:12px;font-weight:500;color:${BODY};">${t.record}</span>
                ${t.streak ? `<span style="font-size:10px;color:${DIM};padding-left:6px;">${t.streak}</span>` : ''}
              </td>
              <td align="right" style="vertical-align:middle;">
                <span style="font-size:11px;color:${MUTED};">${t.gb || ''}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;

    const east5 = nbaStandings.east.slice(0, 5);
    const west5 = nbaStandings.west.slice(0, 5);

    nbaStandingsHtml = `
<tr><td style="padding:0 24px 16px;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:6px;border-collapse:collapse;">
    <tr><td style="padding:14px 16px 6px;">
      <span style="font-size:12px;font-weight:700;color:${RED};letter-spacing:0.08em;text-transform:uppercase;font-family:${F};">NBA PLAYOFF RACE</span>
    </td></tr>
    <tr><td style="padding:4px 16px 8px;">
      <span style="font-size:10px;font-weight:600;color:${BLUE};letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">EASTERN — TOP 5</span>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-top:4px;">
        ${east5.map((t, i) => renderTeam(t, i, i === east5.length - 1)).join('')}
      </table>
    </td></tr>
    <tr><td style="padding:10px 16px 8px;">
      <span style="font-size:10px;font-weight:600;color:${RED};letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">WESTERN — TOP 5</span>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-top:4px;">
        ${west5.map((t, i) => renderTeam(t, i, i === west5.length - 1)).join('')}
      </table>
    </td></tr>
  </table>
</td></tr>`;
  }

  // ── NBA TITLE OUTLOOK (top 5 by championship odds) ──
  let nbaTitleHtml = '';
  if (nbaTitleOutlook.length > 0) {
    const rows = nbaTitleOutlook.slice(0, 5).map((t, i) => {
      const info = nbaSlugInfo(t.slug);
      const odds = t.bestChanceAmerican;
      const oddsLabel = odds == null ? '—' : odds > 0 ? `+${odds}` : String(odds);
      const isLast = i === Math.min(nbaTitleOutlook.length, 5) - 1;
      return `
      <tr>
        <td style="padding:8px 0${isLast ? '' : `;border-bottom:1px solid ${ROW_BORDER}`};font-family:${F};">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td style="width:18px;font-size:12px;font-weight:600;color:${DIM};vertical-align:middle;">${i + 1}</td>
              <td style="width:28px;vertical-align:middle;padding:0 8px 0 0;">${nbaTeamLogoImg({ slug: t.slug }, 20)}</td>
              <td style="font-size:14px;font-weight:800;color:${NAVY};vertical-align:middle;">${(t.slug || '').toUpperCase()}</td>
              <td style="font-size:12px;color:${MUTED};vertical-align:middle;padding-left:8px;">${info.name}</td>
              <td align="right" style="vertical-align:middle;">
                <span style="font-size:12px;font-weight:700;color:${RED};">${oddsLabel}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    }).join('');

    nbaTitleHtml = `
${sectionPill('\u{1F3C6} NBA TITLE OUTLOOK')}
<tr><td style="padding:4px 24px 16px;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:6px;border-collapse:collapse;">
    <tr><td style="padding:10px 16px 4px;">
      <span style="font-size:11px;font-weight:600;color:${MUTED};letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">TOP 5 BY CHAMPIONSHIP ODDS</span>
    </td></tr>
    <tr><td style="padding:0 16px 10px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">${rows}</table>
    </td></tr>
  </table>
</td></tr>`;
  }

  // ── NBA HEADLINES (de-emphasized) ──
  let nbaHeadlinesHtml = '';
  if (nbaHeadlines.length > 0) {
    const items = nbaHeadlines.slice(0, 4).map(h => {
      const t = normalizeSpacing(stripInlineEmoji(h.title || ''));
      const l = h.link || '#';
      const s = h.source || '';
      return `<p style="margin:0 0 6px;font-size:13px;line-height:18px;font-family:${F};">&bull; <a href="${l}" style="color:${BODY};text-decoration:none;font-weight:500;" target="_blank">${t}</a>${s ? ` <span style="font-size:11px;color:${MUTED};">(${s})</span>` : ''}</p>`;
    }).join('');
    nbaHeadlinesHtml = `
<tr><td style="padding:4px 24px 6px;">
  <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:${MUTED};letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">NBA HEADLINES</p>
  ${items}
</td></tr>`;
  }

  // ══════════════════════════════════════════════════════════════
  // ASSEMBLE — build main briefing body, then append partner module
  // ══════════════════════════════════════════════════════════════
  const heroLine = sc
    ? 'Michigan captures the title \u2014 plus your daily MLB intel.'
    : 'Your daily cross-sport intelligence briefing.';

  // ── Main briefing sections (all must render before partner module) ──
  // MLB block first (hero anchor), then NBA block, then headlines.
  const mlbSections = [
    ncaamHtml,
    hotPressHtml,
    pennantHtml,
    picksHtml,
    leadersHtml,
    outlookHtml,
  ].filter(Boolean).join('\n');

  const nbaSections = [
    nbaHotPressHtml,
    nbaStandingsHtml,
    nbaTitleHtml,
    nbaHeadlinesHtml ? divider() + nbaHeadlinesHtml : '',
  ].filter(Boolean).join('\n');

  const mainBriefingSections = [
    mlbSections,
    nbaSections ? divider() + nbaSections : '',
    headlineHtml ? divider() + headlineHtml : '',
  ].filter(Boolean).join('\n');

  const hasBriefingContent = mainBriefingSections.trim().length > 0;

  // Guardrail: if no content sections rendered, show a meaningful empty state
  // so the email never appears as just a greeting + affiliate module
  const emptyStateFallback = !hasBriefingContent ? `
${sectionPill('\u26BE MLB DAILY INTELLIGENCE')}
<tr><td style="padding:8px 24px 16px;">
  <p style="margin:0 0 8px;font-size:14px;line-height:22px;color:#4b5563;font-family:${F};">Today\u2019s MLB briefing is still being assembled. The Maximus Model is processing the latest data \u2014 check the app for the most current intelligence.</p>
  <p style="margin:8px 0 0;"><a href="https://maximussports.ai/mlb" style="font-size:13px;color:${RED};text-decoration:none;font-weight:600;font-family:${F};">Open Maximus Sports &rarr;</a></p>
</td></tr>` : '';

  // Diagnostic: log what rendered
  console.log('[globalBriefing] Content sections:', {
    ncaam: ncaamHtml.length > 0,
    narrative: hotPressHtml.length > 0,
    pennant: pennantHtml.length > 0,
    picks: picksHtml.length > 0,
    leaders: leadersHtml.length > 0,
    outlook: outlookHtml.length > 0,
    nbaNarrative: nbaHotPressHtml.length > 0,
    nbaStandings: nbaStandingsHtml.length > 0,
    nbaTitle: nbaTitleHtml.length > 0,
    nbaHeadlines: nbaHeadlinesHtml.length > 0,
    headlines: headlineHtml.length > 0,
    hasBriefingContent,
  });

  const content = `
${heroBlock({ line: heroLine, sublabel: today })}
<tr><td style="padding:8px 24px 16px;">
  <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;font-family:${F};">Good ${partOfDay}, ${greetingName}. Here\u2019s what matters across Maximus Sports today.</p>
</td></tr>
${divider()}
${hasBriefingContent ? mainBriefingSections : emptyStateFallback}
${hasBriefingContent ? divider() : ''}
${hasBriefingContent ? renderPartnerModule({ padding: '8px 24px 16px' }) : ''}`;

  return EmailShell({
    content,
    previewText: sc ? `\u{1F4E1} Michigan wins it all \u2014 plus today\u2019s MLB intel.` : `\u{1F4E1} Your daily intel across NCAAM and MLB.`,
    ctaUrl: 'https://maximussports.ai/mlb',
    ctaLabel: 'Open Maximus Sports &rarr;',
  });
}

export function renderText(data = {}) {
  const { displayName, mlbData } = data;
  const name = (displayName ? displayName.split(' ')[0] : null) || 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const sc = showChamp();
  const lines = ['\u{1F4E1} MAXIMUS SPORTS \u2014 Daily Global Intel Briefing', today, '', `Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${name}.`, ''];
  if (sc) { lines.push('\u{1F3C6} Michigan 69, UConn 63 \u2014 Michigan wins the national title.', ''); }

  // Narrative bullets
  const n = mlbData?.narrativeParagraph || '';
  if (n) { n.replace(/\*\*/g, '').split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.length > 15).slice(0, 6).forEach(s => lines.push(`\u2022 ${s}`)); lines.push(''); }

  // Pennant race
  const pennant = data.pennantRace;
  if (pennant?.al?.length > 0) {
    lines.push('PENNANT RACE:');
    lines.push(`AL: ${pennant.al.map(t => `${t.abbrev} — Model: ${t.projectedWins} wins`).join(' | ')}`);
    lines.push(`NL: ${pennant.nl.map(t => `${t.abbrev} — Model: ${t.projectedWins} wins`).join(' | ')}`);
    lines.push('');
  }

  // Picks
  const picks2 = mlbData?.picksBoard?.categories;
  if (picks2) {
    const all = [...(picks2.pickEms || []), ...(picks2.ats || []), ...(picks2.totals || [])];
    const top = all.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0)).slice(0, 4);
    if (top.length > 0) {
      lines.push("MAXIMUS'S PICKS:");
      for (const p of top) {
        const away = p.matchup?.awayTeam?.shortName || '?';
        const home = p.matchup?.homeTeam?.shortName || '?';
        lines.push(`\u2022 ${away} vs ${home}: ${p.pick?.label || '—'} (${p.confidence || 'edge'})`);
      }
      lines.push('');
    }
  }

  // Season leaders
  const leaders = data.leadersCategories || {};
  const CATS = [
    { key: 'homeRuns', label: 'HR' }, { key: 'RBIs', label: 'RBI' },
    { key: 'hits', label: 'H' }, { key: 'wins', label: 'W' }, { key: 'saves', label: 'SV' },
  ];
  const hasCats = CATS.some(c => leaders[c.key]?.leaders?.length > 0);
  if (hasCats) {
    lines.push('SEASON LEADERS:');
    for (const cat of CATS) {
      const l = leaders[cat.key]?.leaders?.[0];
      if (l) lines.push(`${cat.label}: ${l.name} (${l.display || l.value})`);
    }
    lines.push('');
  }

  // World Series Outlook
  const outlook = data.worldSeriesOutlook;
  if (outlook?.al?.length > 0) {
    lines.push('WORLD SERIES OUTLOOK:');
    lines.push(`AL: ${outlook.al.map(t => `${t.abbrev} — Model: ${t.projectedWins} wins`).join(' | ')}`);
    lines.push(`NL: ${outlook.nl.map(t => `${t.abbrev} — Model: ${t.projectedWins} wins`).join(' | ')}`);
    lines.push('');
  }

  // Headlines
  (mlbData?.headlines || []).slice(0, 4).forEach(h => lines.push(`\u2022 ${h.title || ''}`));
  lines.push('', 'Open Maximus Sports -> https://maximussports.ai/mlb', '');
  lines.push('ACT ON TODAY\'S BOARD:');
  lines.push('  XBet Welcome Offer: https://record.webpartners.co/_HSjxL9LMlaLhIFuQAd3mRWNd7ZgqdRLk/1/');
  lines.push('  MyBookie Welcome Bonus: https://record.webpartners.co/_HSjxL9LMlaIxuOePL6NGnGNd7ZgqdRLk/1/');
  lines.push('', 'Not betting advice. Manage preferences: https://maximussports.ai/settings');
  return lines.join('\n');
}
