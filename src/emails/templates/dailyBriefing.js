/**
 * Daily NCAA Men's Basketball Briefing — premium editorial email.
 * Sent at 6:00 AM PT via Vercel cron.
 *
 * Redesigned structure:
 *   1. Hero Header
 *   2. Opening Narrative (round-aware, editorial)
 *   3. Tournament Pulse (bracket snapshot)
 *   4. Market & ATS Intelligence
 *   5. Maximus's Picks (4-column: PE, ATS, Value, Totals)
 *   6. Game Spotlights (2–3 key matchups)
 *   7. News Digest ("What's Moving the Needle")
 *   8. CTA
 *   Footer (via EmailShell)
 *
 * Gmail iOS compatible: table layout, inline styles, no flex/grid.
 */

import { EmailShell, heroBlock, sectionLabel } from '../EmailShell.js';
import { renderEmailGameList } from '../../../api/_lib/emailGameCards.js';
import { signalCard, buildSignalsFromPicks } from '../helpers/signalRows.js';
import { isTournamentWeek, getTournamentPhase } from '../tournamentWindow.js';
import { filterTournamentTeams, filterTournamentGames, filterTournamentHeadlines, filterTournamentSignals } from '../helpers/emailFilters.js';
import { dailyBriefingSubject } from '../helpers/subjectGenerator.js';
import { emojiForRow } from '../helpers/emojiRotation.js';
import { proPlugCard } from '../helpers/proPlug.js';

const TEXT_PRIMARY   = '#1a1a2e';
const TEXT_SECONDARY = '#4a5568';
const TEXT_MUTED     = '#8a94a6';
const ACCENT         = '#2d6ca8';
const BORDER         = '#e8ecf0';
const BRAND_DARK     = '#0f2440';
const GREEN          = '#2d8a4e';
const RED_ACCENT     = '#c05621';
const FONT           = "'DM Sans',Arial,Helvetica,sans-serif";

/* ═══════════════════════════════════════════════════════════════
   SUBJECT LINE
   ═══════════════════════════════════════════════════════════════ */

export function getSubject(data = {}) {
  return dailyBriefingSubject(data);
}

export function getPreviewText() {
  const phase = getTournamentPhase();
  if (phase === 'sweet_sixteen') return 'Sweet 16 tips today. The model has edges. Here\'s your briefing.';
  if (phase === 'final_four') return 'Final Four is set. Model picks, bracket intel, and everything you need.';
  if (isTournamentWeek()) return 'Tournament intel, model picks, and bracket edges — updated for today.';
  return 'Picks, ATS trends, and matchup intel for today\'s college basketball slate.';
}

const PHASE_LABELS = {
  pre_tournament: 'Selection Sunday',
  first_round: 'NCAA Tournament',
  sweet_sixteen: 'Sweet 16',
  final_four: 'Final Four',
};

/* ═══════════════════════════════════════════════════════════════
   RENDER HTML
   ═══════════════════════════════════════════════════════════════ */

export function renderHTML(data = {}) {
  const {
    displayName,
    atsLeaders = {},
    headlines = [],
    botIntelBullets = [],
    modelSignals = [],
    tournamentMeta = {},
    narrativeParagraph = '',
    priorDayResults = [],
    todayUpcoming = [],
    picksSummary = '',
  } = data;

  const firstName = displayName ? displayName.split(' ')[0] : 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const upcomingCount = todayUpcoming.length;
  const bestAts = atsLeaders.best || [];
  const worstAts = atsLeaders.worst || [];

  const showTournament = isTournamentWeek();
  const phase = getTournamentPhase();

  /* ── 1. HERO HEADER ────────────────────────────────────────── */
  const heroLine = 'Daily NCAA Men\u2019s Basketball Briefing';

  /* ── 2. OPENING NARRATIVE ──────────────────────────────────── */
  let openingParagraph;
  if (narrativeParagraph && narrativeParagraph.length > 80) {
    // Use the KV-cached LLM narrative from the Home briefing
    openingParagraph = narrativeParagraph;
  } else {
    openingParagraph = buildDynamicOpening(firstName, phase, dayOfWeek, upcomingCount, priorDayResults);
  }

  const openingHtml = `
<tr>
  <td style="padding:14px 24px 18px;" class="intro-td">
    <p style="margin:0;font-size:15px;color:${TEXT_PRIMARY};line-height:1.72;font-weight:400;font-family:${FONT};">
      ${openingParagraph}
    </p>
  </td>
</tr>`;

  /* ── 3. TOURNAMENT PULSE ───────────────────────────────────── */
  let tournamentPulseHtml = '';
  if (showTournament) {
    tournamentPulseHtml = buildTournamentPulse(tournamentMeta, priorDayResults);
  }

  /* ── 4. MARKET & ATS INTELLIGENCE (tournament-filtered) ──── */
  const filteredBestAts = filterTournamentTeams(bestAts);
  const filteredWorstAts = filterTournamentTeams(worstAts);
  const marketIntelHtml = buildMarketIntel(filteredBestAts, filteredWorstAts, botIntelBullets);

  /* ── 5. MAXIMUS'S PICKS (tournament-filtered) ─────────────── */
  const filteredSignals = filterTournamentSignals(modelSignals);
  const picksHtml = buildPicksSection(filteredSignals, picksSummary);

  /* ── 6. GAME SPOTLIGHTS (tournament-filtered) ─────────────── */
  const filteredUpcoming = filterTournamentGames(todayUpcoming);
  const filteredResults = filterTournamentGames(priorDayResults);
  let spotlightsHtml = '';
  if (filteredUpcoming.length > 0) {
    spotlightsHtml = buildGameSpotlights(filteredUpcoming.slice(0, 3));
  } else if (filteredResults.length > 0) {
    const meaningful = filteredResults.filter(g => g.hasScore).slice(0, 3);
    if (meaningful.length > 0) {
      spotlightsHtml = buildResultsRecap(meaningful);
    }
  }

  /* ── 7. NEWS DIGEST (tournament-filtered) ──────────────────── */
  const filteredHeadlines = filterTournamentHeadlines(headlines);
  const newsHtml = buildNewsDigest(filteredHeadlines);

  /* ── 8. BRACKETOLOGY CTA ───────────────────────────────────── */
  const bracketCta = showTournament ? buildBracketologyCta() : '';

  /* ── FINAL CTA ─────────────────────────────────────────────── */
  const closingCtaHtml = `
${divider()}
<tr>
  <td style="padding:24px 24px 28px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background-color:${BRAND_DARK};border-radius:10px;border-collapse:collapse;">
      <tr>
        <td style="padding:26px 24px;text-align:center;">
          <p style="margin:0 0 6px;font-size:20px;font-weight:800;color:#ffffff;font-family:${FONT};line-height:1.3;">
            See full intel, live picks, and team breakdowns
          </p>
          <p style="margin:0 0 18px;font-size:13px;color:rgba(255,255,255,0.62);font-family:${FONT};">
            Updated in real time throughout the day
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 auto;">
            <tr>
              <td align="center" bgcolor="#3C79B4" style="border-radius:6px;">
                <a href="https://maximussports.ai"
                   style="display:inline-block;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;font-family:${FONT};border-radius:6px;">
                  Open Maximus Sports &rarr;
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </td>
</tr>`;

  /* ── ASSEMBLE ──────────────────────────────────────────────── */
  const content = `
${heroBlock({ line: heroLine, sublabel: today })}
${openingHtml}
${tournamentPulseHtml}
${marketIntelHtml}
${picksHtml}
${proPlugCard('inline')}
${spotlightsHtml}
${newsHtml}
${bracketCta}
${closingCtaHtml}`;

  return EmailShell({
    content,
    previewText: getPreviewText(data),
    ctaLabel: showTournament ? 'See tournament intel &rarr;' : 'See full intel &rarr;',
  });
}

/* ═══════════════════════════════════════════════════════════════
   RENDER PLAIN TEXT
   ═══════════════════════════════════════════════════════════════ */

export function renderText(data = {}) {
  const {
    displayName,
    atsLeaders = {},
    headlines = [],
    modelSignals = [],
    narrativeParagraph = '',
    priorDayResults = [],
    todayUpcoming = [],
    picksSummary = '',
  } = data;
  const name = displayName ? displayName.split(' ')[0] : 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const lines = [
    'DAILY NCAA MEN\'S BASKETBALL BRIEFING',
    today,
    '',
    `Good morning, ${name}. Here's your edge for today.`,
    '',
  ];

  if (narrativeParagraph) lines.push(narrativeParagraph, '');

  if (priorDayResults.length > 0) {
    lines.push('RESULTS');
    for (const g of priorDayResults.slice(0, 6)) {
      if (g.hasScore) lines.push(`- ${g.winner} ${g.winScore}, ${g.loser} ${g.loseScore}`);
    }
    lines.push('');
  }

  if (todayUpcoming.length > 0) {
    lines.push(`TODAY'S GAMES — ${todayUpcoming.length} games`);
    for (const g of todayUpcoming.slice(0, 6)) lines.push(`- ${g.awayTeam || 'Away'} vs ${g.homeTeam || 'Home'}`);
    lines.push('');
  }

  if (picksSummary) lines.push('MAXIMUS\'S PICKS', picksSummary, '');
  else if (modelSignals.length > 0) {
    lines.push('MAXIMUS\'S PICKS', ...modelSignals.slice(0, 5).map(s => `- ${s.matchup || '?'}: ${s.edge || 'model edge'}`), '');
  }

  const bestAts = atsLeaders.best || [];
  if (bestAts.length > 0) {
    lines.push('MARKET & ATS', `Top ATS: ${bestAts[0].name || bestAts[0].team}`, '');
  }

  if (headlines.length > 0) lines.push('WHAT\'S MOVING THE NEEDLE', ...headlines.slice(0, 5).map(h => `- ${h.title || 'No title'}`), '');

  lines.push(
    'Open Maximus Sports -> https://maximussports.ai',
    '',
    'Not betting advice. Manage preferences: https://maximussports.ai/settings',
  );

  return lines.join('\n');
}

/* ═══════════════════════════════════════════════════════════════
   SECTION BUILDERS
   ═══════════════════════════════════════════════════════════════ */

function buildDynamicOpening(firstName, phase, dayOfWeek, upcomingCount, priorDayResults) {
  const upsets = priorDayResults.filter(g => g.isUpset || g.seedDiff >= 4).slice(0, 2);
  const greeting = `Good morning, ${firstName}.`;

  if (phase === 'sweet_sixteen') {
    const base = `${greeting} The Sweet 16 tips off today, and the field is starting to separate into real contenders and chaos candidates.`;
    if (upsets.length > 0) return `${base} We\u2019ve already seen top seeds fall. Here\u2019s what actually matters now.`;
    return `${base} Every game from here is bracket-defining. Here\u2019s your edge.`;
  }
  if (phase === 'final_four') {
    return `${greeting} The Final Four is set. Four teams, two games, and the model has its reads. This is the biggest weekend in college basketball \u2014 here\u2019s your briefing.`;
  }
  if (phase === 'first_round') {
    if (dayOfWeek === 'Monday' || dayOfWeek === 'Tuesday') {
      return `${greeting} The bracket resets after a wild weekend. Teams are preparing for the next round and the model is already flagging edges. Here\u2019s what to know before the next tip.`;
    }
    if (upcomingCount > 0) {
      return `${greeting} ${upcomingCount} games on today\u2019s tournament slate. The model is tracking every line and surfacing edges in real time. Here\u2019s your intel.`;
    }
    return `${greeting} Tournament action continues. Maximus is updating edges after every game. Here\u2019s what matters.`;
  }
  if (phase === 'pre_tournament') {
    return `${greeting} The bracket is set. Selection Sunday delivered, and the model has already scanned every region. Early edges are forming. Here\u2019s your briefing.`;
  }
  // Non-tournament
  if (upcomingCount > 0) {
    return `${greeting} ${upcomingCount} game${upcomingCount !== 1 ? 's' : ''} on today\u2019s slate. Here\u2019s what Maximus is watching and where the model sees value.`;
  }
  return `${greeting} Light slate today. Maximus is staying disciplined \u2014 here\u2019s the intel that matters.`;
}

/* ── 3. TOURNAMENT PULSE ─────────────────────────────────────── */

function buildTournamentPulse(tournamentMeta, priorDayResults) {
  const topSeeds = tournamentMeta.topSeeds || [];
  const eliminated = tournamentMeta.eliminatedSeeds || [];
  const cinderellas = tournamentMeta.cinderellas || [];
  const bigUpset = priorDayResults.find(g => g.isUpset || g.seedDiff >= 6);

  let pulseRows = '';

  if (topSeeds.length > 0) {
    pulseRows += pulseRow('\uD83C\uDFC6', 'Top Seeds Alive', topSeeds.slice(0, 4).join(', '));
  }
  if (eliminated.length > 0) {
    pulseRows += pulseRow('\uD83D\uDEA8', 'Eliminated', eliminated.slice(0, 3).join(', '));
  }
  if (cinderellas.length > 0) {
    pulseRows += pulseRow('\uD83D\uDD25', 'Cinderellas Still Dancing', cinderellas.join(', '));
  }
  if (bigUpset) {
    const upsetText = bigUpset.winner
      ? `${bigUpset.winner} over ${bigUpset.loser} ${bigUpset.winScore}\u2013${bigUpset.loseScore}`
      : 'Major upset shook the bracket';
    pulseRows += pulseRow('\u26A1', 'Biggest Upset', upsetText);
  }

  if (!pulseRows) return '';

  return `
${divider()}
<tr>
  <td style="padding:0 24px 6px;" class="section-td">
    <div style="margin-bottom:12px;">${sectionLabel('TOURNAMENT PULSE')}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background-color:#f9fafb;border:1px solid ${BORDER};border-radius:8px;border-collapse:collapse;">
      ${pulseRows}
    </table>
  </td>
</tr>
${spacer(6)}`;
}

function pulseRow(emoji, label, value) {
  return `<tr>
  <td style="padding:12px 16px;border-bottom:1px solid ${BORDER};">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td valign="top" style="width:28px;font-size:16px;padding-top:1px;">${emoji}</td>
        <td>
          <span style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${TEXT_MUTED};font-family:${FONT};">${label}</span>
          <div style="font-size:14px;font-weight:600;color:${TEXT_PRIMARY};font-family:${FONT};margin-top:2px;">${value}</div>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

/* ── 4. MARKET & ATS INTELLIGENCE ────────────────────────────── */

function buildMarketIntel(bestAts, worstAts, botIntelBullets) {
  const trends = [];

  // ATS heaters
  if (bestAts.length > 0) {
    const top = bestAts[0];
    const pct = top.pct != null ? `${Math.round(top.pct * 100)}%` : '';
    trends.push({
      emoji: emojiForRow('hot', 0),
      title: `${top.name || top.team} is on an ATS heater`,
      body: pct ? `Covering at ${pct}. The market may not have caught up yet.` : 'Covering consistently. Worth monitoring in upcoming matchups.',
    });
  }

  // ATS cold teams
  if (worstAts.length > 0) {
    const bottom = worstAts[0];
    const pct = bottom.pct != null ? `${Math.round(bottom.pct * 100)}%` : '';
    trends.push({
      emoji: emojiForRow('danger', 0),
      title: `${bottom.name || bottom.team} is overvalued`,
      body: pct ? `Covering at only ${pct}. The public may be inflating this line.` : 'Struggling to cover. Bettors should proceed with caution.',
    });
  }

  // Bot intel bullets as additional trends — use rotating emojis
  if (botIntelBullets.length > 0 && trends.length < 4) {
    for (let i = 0; i < Math.min(botIntelBullets.length, 4 - trends.length); i++) {
      trends.push({ emoji: emojiForRow('data', i), title: botIntelBullets[i], body: '' });
    }
  }

  if (trends.length === 0) return '';

  const rows = trends.map(t => `
<tr>
  <td style="padding:12px 16px;border-bottom:1px solid ${BORDER};">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td valign="top" style="width:28px;font-size:16px;padding-top:1px;">${t.emoji}</td>
        <td>
          <span style="font-size:14px;font-weight:700;color:${TEXT_PRIMARY};font-family:${FONT};">${t.title}</span>
          ${t.body ? `<div style="font-size:13px;color:${TEXT_SECONDARY};font-family:${FONT};margin-top:3px;line-height:1.5;">${t.body}</div>` : ''}
        </td>
      </tr>
    </table>
  </td>
</tr>`).join('');

  return `
${divider()}
<tr>
  <td style="padding:0 24px 6px;" class="section-td">
    <div style="margin-bottom:12px;">${sectionLabel('MARKET & ATS TRENDS')}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background-color:#f9fafb;border:1px solid ${BORDER};border-radius:8px;border-collapse:collapse;">
      ${rows}
    </table>
  </td>
</tr>
${spacer(6)}`;
}

/* ── 5. MAXIMUS'S PICKS ──────────────────────────────────────── */

function buildPicksSection(modelSignals, picksSummary) {
  const signals = modelSignals.length > 0 ? buildSignalsFromPicks(modelSignals, 6) : [];

  if (signals.length === 0 && !picksSummary) return '';

  const signalHtml = signals.length > 0 ? signalCard(signals) : '';

  return `
${divider()}
<tr>
  <td style="padding:0 24px 6px;" class="section-td">
    <div style="margin-bottom:10px;">${sectionLabel("MAXIMUS'S PICKS")}</div>
    ${picksSummary ? `<p style="margin:0 0 12px;font-size:14px;font-weight:500;color:${TEXT_SECONDARY};line-height:1.6;font-family:${FONT};">${picksSummary}</p>` : ''}
  </td>
</tr>
${signalHtml ? `<tr><td style="padding:0 24px 14px;" class="section-td">${signalHtml}</td></tr>` : ''}
${spacer(4)}`;
}

/* ── 6. GAME SPOTLIGHTS ──────────────────────────────────────── */

function buildGameSpotlights(games) {
  if (games.length === 0) return '';

  const gamesHtml = renderEmailGameList(games, { max: 3, compact: true });

  return `
${divider()}
<tr>
  <td style="padding:0 24px 6px;" class="section-td">
    <div style="margin-bottom:8px;">${sectionLabel("TODAY'S KEY MATCHUPS")}</div>
    <p style="margin:0 0 10px;font-size:14px;color:${TEXT_SECONDARY};line-height:1.5;font-family:${FONT};">
      ${games.length} game${games.length !== 1 ? 's' : ''} on today\u2019s slate. Here are the matchups Maximus is watching:
    </p>
  </td>
</tr>
${gamesHtml}
${spacer(6)}`;
}

function buildResultsRecap(results) {
  if (results.length === 0) return '';

  const resultsHtml = renderEmailGameList(results, { max: 4, compact: true });

  return `
${divider()}
<tr>
  <td style="padding:0 24px 6px;" class="section-td">
    <div style="margin-bottom:8px;">${sectionLabel('RESULTS')}</div>
    <p style="margin:0 0 10px;font-size:14px;color:${TEXT_SECONDARY};line-height:1.5;font-family:${FONT};">
      ${results.length} result${results.length !== 1 ? 's' : ''} that shaped the bracket:
    </p>
  </td>
</tr>
${resultsHtml}
${spacer(6)}`;
}

/* ── 7. NEWS DIGEST ──────────────────────────────────────────── */

function buildNewsDigest(headlines) {
  if (headlines.length === 0) return '';

  const items = headlines.slice(0, 5).map((h, i) => {
    const title = h.title || 'Breaking';
    const source = h.source || '';
    const link = h.link || 'https://maximussports.ai';
    const isLast = i === Math.min(headlines.length, 5) - 1;

    return `<tr>
  <td style="padding:12px 16px;${isLast ? '' : `border-bottom:1px solid ${BORDER};`}">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td>
          <a href="${link}" style="font-size:14px;font-weight:600;color:${TEXT_PRIMARY};text-decoration:none;line-height:1.45;font-family:${FONT};display:block;" target="_blank">${title}</a>
          <div style="margin-top:4px;">
            ${source ? `<span style="display:inline-block;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${ACCENT};background:#eef4fb;border-radius:3px;padding:2px 6px;font-family:${FONT};">${source}</span>` : ''}
          </div>
        </td>
        <td align="right" valign="top" style="padding-left:12px;white-space:nowrap;">
          <a href="${link}" style="font-size:12px;color:${ACCENT};text-decoration:none;font-weight:600;font-family:${FONT};" target="_blank">Read &rarr;</a>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
  }).join('');

  return `
${divider()}
<tr>
  <td style="padding:0 24px 6px;" class="section-td">
    <div style="margin-bottom:12px;">${sectionLabel("WHAT'S MOVING THE NEEDLE")}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background-color:#f9fafb;border:1px solid ${BORDER};border-radius:8px;border-collapse:collapse;">
      ${items}
    </table>
  </td>
</tr>
${spacer(6)}`;
}

/* ── BRACKETOLOGY CTA ────────────────────────────────────────── */

function buildBracketologyCta() {
  return `
${divider()}
<tr>
  <td style="padding:16px 24px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background-color:${BRAND_DARK};border-radius:10px;border-collapse:collapse;">
      <tr>
        <td style="padding:24px 22px;">
          <p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#6EB3E8;font-family:${FONT};">
            March Madness 2026
          </p>
          <p style="margin:0 0 8px;font-size:18px;font-weight:800;color:#ffffff;line-height:1.28;font-family:${FONT};">
            Build Your Bracket with Maximus
          </p>
          <p style="margin:0 0 18px;font-size:13px;color:rgba(255,255,255,0.68);line-height:1.55;font-family:${FONT};">
            Region-by-region picks, upset probabilities, and data-driven predictions. Use the model or compete against it.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td align="center" bgcolor="#3C79B4" style="border-radius:6px;">
                <a href="https://maximussports.ai/bracketology"
                   style="display:inline-block;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;padding:10px 22px;font-family:${FONT};border-radius:6px;">
                  Complete Your Bracket &rarr;
                </a>
              </td>
              <td style="width:10px;">&nbsp;</td>
              <td align="center" style="border-radius:6px;border:1px solid rgba(74,144,217,0.4);">
                <a href="https://maximussports.ai/bracketology"
                   style="display:inline-block;color:#6EB3E8;font-size:13px;font-weight:600;text-decoration:none;padding:9px 18px;font-family:${FONT};border-radius:6px;">
                  Beat the Model
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

/* ── LAYOUT HELPERS ──────────────────────────────────────────── */

function divider() {
  return `<tr>
  <td style="padding:6px 24px;" class="divider-td">
    <div style="height:1px;background-color:${BORDER};font-size:0;line-height:0;">&nbsp;</div>
  </td>
</tr>`;
}

function spacer(px = 8) {
  return `<tr><td style="height:${px}px;font-size:0;line-height:0;" aria-hidden="true">&nbsp;</td></tr>`;
}
