/**
 * Daily Tournament Intel — premium editorial email template.
 * Sent at 6:00 AM PT.
 *
 * Redesigned structure (matches Home page briefing quality):
 *   A. Top narrative briefing (shared intel source with Home)
 *   B. Prior day results recap (curated, upset-focused)
 *   C. Today's key matchups (forward-looking setup)
 *   D. Maximus Picks summary (aligned with IG picks card)
 *   E. User's pinned teams
 *   F. Bracketology CTA
 *   Footer (via EmailShell)
 *
 * @param {object} data
 * @param {string}  [data.displayName]
 * @param {Array}   [data.scoresToday]
 * @param {Array}   [data.rankingsTop25]
 * @param {object}  [data.atsLeaders]
 * @param {Array}   [data.headlines]
 * @param {Array}   [data.pinnedTeams]
 * @param {Array}   [data.botIntelBullets]
 * @param {Array}   [data.modelSignals]
 * @param {object}  [data.tournamentMeta]
 * @param {string}  [data.narrativeParagraph]
 * @param {Array}   [data.priorDayResults]
 * @param {Array}   [data.todayUpcoming]
 * @param {string}  [data.picksSummary]
 */

import { EmailShell, heroBlock, sectionCard, sectionLabel, teamLogoImg } from '../EmailShell.js';
import { getTeamTodaySummary } from '../../../api/_lib/teamSchedule.js';
import { renderEmailGameList } from '../../../api/_lib/emailGameCards.js';
import { signalCard, buildSignalsFromPicks } from '../helpers/signalRows.js';
import { isTournamentWeek, isPreTournament, getTournamentPhase } from '../tournamentWindow.js';

const TEXT_PRIMARY   = '#1a1a2e';
const TEXT_SECONDARY = '#4a5568';
const TEXT_MUTED     = '#8a94a6';
const ACCENT         = '#2d6ca8';
const BORDER         = '#e8ecf0';
const BRAND_DARK     = '#0f2440';

export function getSubject(data = {}) {
  const name = data.displayName ? data.displayName.split(' ')[0] : null;
  const dow = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  if (isTournamentWeek()) {
    if (name) return `${name}, tournament intel for ${dow}`;
    return `March Madness briefing — ${dow}`;
  }
  if (name) return `${name}, here\u2019s your ${dow} hoops briefing`;
  return `Your ${dow} college hoops briefing`;
}

export function renderHTML(data = {}) {
  const {
    displayName,
    scoresToday = [],
    rankingsTop25 = [],
    atsLeaders = {},
    headlines = [],
    pinnedTeams = [],
    botIntelBullets = [],
    modelSignals = [],
    tournamentMeta = {},
    narrativeParagraph = '',
    priorDayResults = [],
    todayUpcoming = [],
    picksSummary = '',
  } = data;

  const firstName = displayName ? displayName.split(' ')[0] : null;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const greetingName = firstName || 'there';
  const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  const gameCount = scoresToday.length;
  const upcomingCount = todayUpcoming.length;
  const bestAts = atsLeaders.best || [];

  const showTournament = isTournamentWeek();
  const showPreTournament = isPreTournament();
  const phase = getTournamentPhase();

  // ── A. HERO + NARRATIVE BRIEFING ───────────────────────────
  let heroLine, introParagraph;
  if (showPreTournament) {
    heroLine = 'March Madness Bracket Is Set';
    introParagraph = `Good morning, ${greetingName}. The NCAA tournament field is finalized and early model signals are already surfacing edges. Here\u2019s your intel.`;
  } else if (showTournament && phase === 'first_round') {
    if (dayOfWeek === 'Monday') {
      heroLine = 'Tournament Weekend Recap \u2014 Bracket Update';
      introParagraph = `Good morning, ${greetingName}. What a weekend in the NCAA tournament. Here\u2019s a recap of the biggest results, bracket shakeups, and what\u2019s next.`;
    } else if (dayOfWeek === 'Tuesday' || dayOfWeek === 'Wednesday') {
      heroLine = 'Between Rounds \u2014 Next Slate Preview';
      introParagraph = `Good morning, ${greetingName}. The bracket resets. Teams are preparing for the next round and the model is already flagging edges. Here\u2019s what to know.`;
    } else {
      heroLine = `Tournament Game Day \u2014 ${upcomingCount > 0 ? `${upcomingCount} Games` : (gameCount > 0 ? `${gameCount} Games` : 'March Madness Continues')}`;
      introParagraph = `Good morning, ${greetingName}. Tournament action continues today. Maximus is tracking every game and updating edges in real time.`;
    }
  } else if (showTournament && phase === 'sweet_sixteen') {
    heroLine = upcomingCount > 0
      ? `Sweet 16 / Elite Eight \u2014 ${upcomingCount} Games Today`
      : 'Sweet 16 / Elite Eight \u2014 Tournament Intel';
    introParagraph = `Good morning, ${greetingName}. We\u2019re deep in the tournament now. Every game matters for the bracket. Here\u2019s your intel.`;
  } else if (showTournament && phase === 'final_four') {
    heroLine = 'Final Four \u2014 The Stage Is Set';
    introParagraph = `Good morning, ${greetingName}. The Final Four is here. The model has its edge. Let\u2019s break down the biggest games in college basketball.`;
  } else if (showTournament) {
    heroLine = 'Tournament Day \u2014 Model Signals Active';
    introParagraph = `Good morning, ${greetingName}. The tournament is live. Maximus is tracking every game and updating edges in real time.`;
  } else if (gameCount > 0) {
    heroLine = 'What you need to know before tonight\u2019s games.';
    introParagraph = `Good morning, ${greetingName}. ${gameCount} game${gameCount !== 1 ? 's' : ''} on today\u2019s slate. Here\u2019s what Maximus Sports is watching.`;
  } else {
    heroLine = 'Your daily hoops intel.';
    introParagraph = `Good morning, ${greetingName}. Light slate today \u2014 Maximus Sports is staying disciplined. Here\u2019s the intel that matters.`;
  }

  // Extended narrative from Home page briefing source (KV cache)
  let narrativeBlock = '';
  if (narrativeParagraph && narrativeParagraph.length > 50) {
    const cleaned = narrativeParagraph
      .replace(/\n{2,}/g, '</p><p style="margin:0 0 10px;font-size:14px;color:#4a5568;line-height:1.65;font-family:\'DM Sans\',Arial,sans-serif;">')
      .replace(/\n/g, '<br/>');
    narrativeBlock = `
<tr>
  <td style="padding:0 24px 16px;" class="section-td">
    <p style="margin:0 0 10px;font-size:14px;color:${TEXT_SECONDARY};line-height:1.65;font-family:'DM Sans',Arial,sans-serif;">
      ${cleaned}
    </p>
  </td>
</tr>`;
  }

  // Tournament storyline card (when no full narrative available)
  let tournamentStoryline = '';
  if (showTournament && !narrativeBlock) {
    let storyTitle, storyHeadline, storyDefault;
    if (showPreTournament) {
      storyTitle = 'TOURNAMENT PREVIEW';
      storyHeadline = 'Bracket Intel';
      storyDefault = 'The bracket is locked in. The model has scanned every region and is flagging edges across all four quadrants.';
    } else if (phase === 'first_round') {
      storyTitle = dayOfWeek === 'Monday' ? 'WEEKEND RECAP' : 'TOURNAMENT UPDATE';
      storyHeadline = dayOfWeek === 'Monday' ? 'Weekend Tournament Recap' : 'Live Tournament Intel';
      storyDefault = 'Tournament games are live. Maximus is tracking results and adjusting model edges after every game.';
    } else if (phase === 'sweet_sixteen') {
      storyTitle = 'SWEET 16 / ELITE EIGHT';
      storyHeadline = 'Deep Tournament Intel';
      storyDefault = 'The field has narrowed significantly. Every remaining game has bracket-defining stakes.';
    } else if (phase === 'final_four') {
      storyTitle = 'FINAL FOUR';
      storyHeadline = 'Final Four Intel';
      storyDefault = 'Four teams remain. The model has its final reads. This is the biggest stage in college basketball.';
    } else {
      storyTitle = 'TOURNAMENT UPDATE';
      storyHeadline = 'Tournament Intel';
      storyDefault = 'The NCAA tournament continues. Maximus is tracking every game and updating edges in real time.';
    }

    tournamentStoryline = sectionCard({
      pillLabel: storyTitle,
      pillType: 'intel',
      headline: storyHeadline,
      body: tournamentMeta.storyline || storyDefault,
    });
  }

  // Maximus Says (bot intel bullets)
  let botIntelSection = '';
  if (botIntelBullets.length > 0) {
    const bullets = botIntelBullets.slice(0, 4).map(b =>
      `<tr>
        <td valign="top" style="width:18px;color:${ACCENT};font-size:14px;padding-top:1px;font-family:'DM Sans',Arial,sans-serif;">&bull;</td>
        <td valign="top" style="font-size:14px;color:${TEXT_SECONDARY};line-height:1.6;font-family:'DM Sans',Arial,sans-serif;padding-bottom:8px;">${b}</td>
      </tr>`
    ).join('');
    botIntelSection = `
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <div style="margin-bottom:10px;">${sectionLabel('MAXIMUS SAYS')}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${bullets}
    </table>
  </td>
</tr>`;
  }

  // ── B. PRIOR DAY RESULTS RECAP ─────────────────────────────
  let resultsRecapSection = '';
  if (priorDayResults.length > 0) {
    const meaningful = priorDayResults.filter(g => g.hasScore).slice(0, 6);
    if (meaningful.length > 0) {
      const resultsHtml = renderEmailGameList(meaningful, { max: 6, compact: true });
      const recapIntro = meaningful.length === 1
        ? 'Here\u2019s the key result from yesterday\u2019s action:'
        : `${meaningful.length} results from yesterday that shaped the bracket:`;

      resultsRecapSection = `
${divider()}
<tr>
  <td style="padding:0 24px 4px;" class="section-td">
    <div style="margin-bottom:4px;">${sectionLabel('RESULTS')}</div>
    <p style="margin:0 0 8px;font-size:14px;color:${TEXT_SECONDARY};line-height:1.5;font-family:'DM Sans',Arial,sans-serif;">${recapIntro}</p>
  </td>
</tr>
${resultsHtml}
${spacer(4)}`;
    }
  }

  // ── C. TODAY'S KEY MATCHUPS ────────────────────────────────
  let todayMatchupsSection = '';
  if (todayUpcoming.length > 0) {
    const upcomingHtml = renderEmailGameList(todayUpcoming, { max: 6, compact: true });
    const matchupIntro = todayUpcoming.length === 1
      ? '1 game on today\u2019s slate:'
      : `${todayUpcoming.length} games on today\u2019s slate. Here are the matchups to watch:`;

    todayMatchupsSection = `
${divider()}
<tr>
  <td style="padding:0 24px 4px;" class="section-td">
    <div style="margin-bottom:4px;">${sectionLabel('TODAY\u2019S GAMES')}</div>
    <p style="margin:0 0 8px;font-size:14px;color:${TEXT_SECONDARY};line-height:1.5;font-family:'DM Sans',Arial,sans-serif;">${matchupIntro}</p>
  </td>
</tr>
${upcomingHtml}
${spacer(4)}`;
  } else if (gameCount > 0 && priorDayResults.length === 0) {
    const gameCardsHtml = renderEmailGameList(scoresToday, { max: 6, compact: true });
    todayMatchupsSection = `
${divider()}
<tr>
  <td style="padding:0 24px 4px;" class="section-td">
    <div style="margin-bottom:4px;">${sectionLabel('TODAY\u2019S GAMES')}</div>
    <p style="margin:0 0 8px;font-size:14px;color:${TEXT_SECONDARY};line-height:1.5;font-family:'DM Sans',Arial,sans-serif;">${gameCount} game${gameCount !== 1 ? 's' : ''} on the slate.</p>
  </td>
</tr>
${gameCardsHtml}
${spacer(4)}`;
  }

  // ── D. MAXIMUS PICKS SUMMARY ───────────────────────────────
  let picksSection = '';
  const signals = modelSignals.length > 0
    ? buildSignalsFromPicks(modelSignals, 5)
    : [];

  if (signals.length > 0 || picksSummary) {
    const signalCardHtml = signals.length > 0 ? signalCard(signals) : '';
    const summaryHtml = picksSummary && !signalCardHtml
      ? `<p style="margin:0;font-size:14px;color:${TEXT_SECONDARY};line-height:1.6;font-family:'DM Sans',Arial,sans-serif;">${picksSummary}</p>`
      : '';

    picksSection = `
${divider()}
<tr>
  <td style="padding:0 24px 4px;" class="section-td">
    <div style="margin-bottom:10px;">${sectionLabel('MAXIMUS PICKS')}</div>
    ${picksSummary ? `<p style="margin:0 0 10px;font-size:14px;color:${TEXT_SECONDARY};line-height:1.5;font-family:'DM Sans',Arial,sans-serif;">${picksSummary}</p>` : `<p style="margin:0 0 10px;font-size:14px;color:${TEXT_SECONDARY};line-height:1.5;font-family:'DM Sans',Arial,sans-serif;">Today\u2019s strongest signals:</p>`}
  </td>
</tr>
${signalCardHtml ? `<tr><td style="padding:0 24px 14px;" class="section-td">${signalCardHtml}</td></tr>` : ''}
${summaryHtml ? `<tr><td style="padding:0 24px 14px;" class="section-td">${summaryHtml}</td></tr>` : ''}`;
  }

  // ── ATS + Rankings (compact inline cards) ──────────────────
  let atsBody = '';
  if (bestAts.length > 0) {
    const top = bestAts[0];
    const pct = top.pct != null ? `${Math.round(top.pct * 100)}%` : '';
    atsBody = `<strong style="color:${TEXT_PRIMARY};">${top.name || top.team || 'A team'}</strong> is the top ATS performer right now.${pct ? ` Covering at ${pct}.` : ''}`;
  } else {
    atsBody = 'No major ATS edges detected today. Patience is a strategy.';
  }

  let rankBody = '';
  if (rankingsTop25.length > 0) {
    const top3 = rankingsTop25.slice(0, 3).map((r, i) => `#${i + 1} ${r.teamName || r.name || r.team || 'Unknown'}`).join(', ');
    rankBody = `Current top 3: ${top3}. The bubble is tightening.`;
  } else {
    rankBody = 'Rankings data is refreshing. Check the app for the latest AP Top 25.';
  }

  // ── E. PINNED TEAMS ────────────────────────────────────────
  let pinnedSection = '';
  if (pinnedTeams.length > 0) {
    const pinnedRows = pinnedTeams.slice(0, 5).map(team => {
      const teamSlug = team.slug || '';
      const teamUrl = teamSlug ? `https://maximussports.ai/teams/${teamSlug}` : 'https://maximussports.ai';
      const { gameInfo } = getTeamTodaySummary(team, scoresToday);
      const logoHtml = teamLogoImg(team, 20);
      return `<tr>
  <td style="padding:8px 0;border-bottom:1px solid ${BORDER};">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td valign="middle" style="width:26px;padding-right:8px;">${logoHtml}</td>
        <td valign="middle">
          <a href="${teamUrl}" style="font-size:14px;font-weight:600;color:${TEXT_PRIMARY};text-decoration:none;font-family:'DM Sans',Arial,sans-serif;">${team.name}</a>
          <div style="margin-top:2px;font-size:12px;color:${TEXT_MUTED};">${gameInfo}</div>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
    }).join('');

    pinnedSection = `
${divider()}
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <div style="margin-bottom:8px;">${sectionLabel('YOUR TEAMS')}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${pinnedRows}
    </table>
    <div style="margin-top:8px;">
      <a href="https://maximussports.ai/teams" style="font-size:12px;color:${ACCENT};text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">All team intel &rarr;</a>
    </div>
  </td>
</tr>`;
  }

  // ── Headlines (compact, below pinned teams) ────────────────
  let headlineSection = '';
  if (headlines.length > 0) {
    const headlineItems = headlines.slice(0, 4).map(h => {
      const title = h.title || 'Breaking';
      const source = h.source || '';
      const link = h.link || 'https://maximussports.ai';
      const pubDate = h.pubDate
        ? new Date(h.pubDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        : '';
      return `<tr>
  <td style="padding:8px 0;border-bottom:1px solid ${BORDER};">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td>
          <a href="${link}" style="font-size:14px;font-weight:600;color:${TEXT_PRIMARY};text-decoration:none;line-height:1.4;font-family:'DM Sans',Arial,sans-serif;display:block;" target="_blank">${title}</a>
          <div style="margin-top:3px;">
            ${source ? `<span style="font-size:11px;color:${TEXT_MUTED};font-family:'DM Sans',Arial,sans-serif;">${source}</span>` : ''}
            ${pubDate ? `<span style="font-size:11px;color:#b0b8c4;font-family:'DM Sans',Arial,sans-serif;"> &middot; ${pubDate}</span>` : ''}
          </div>
        </td>
        <td align="right" valign="top" style="padding-left:12px;white-space:nowrap;">
          <a href="${link}" style="font-size:12px;color:${ACCENT};text-decoration:none;font-weight:600;" target="_blank">Read &rarr;</a>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
    }).join('');
    headlineSection = `
${divider()}
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <div style="margin-bottom:8px;">${sectionLabel('HEADLINES')}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${headlineItems}
    </table>
  </td>
</tr>`;
  }

  // ── F. BRACKETOLOGY CTA ────────────────────────────────────
  const bracketCta = showTournament ? buildBracketologyCta() : '';

  // ── ASSEMBLE ───────────────────────────────────────────────
  const content = `
${heroBlock({
  line: heroLine,
  sublabel: today,
})}

<tr>
  <td style="padding:10px 24px 16px;" class="intro-td">
    <p style="margin:0;font-size:15px;color:${TEXT_SECONDARY};line-height:1.65;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
      ${introParagraph}
    </p>
  </td>
</tr>

${divider()}
${spacer(6)}

${tournamentStoryline}

${narrativeBlock}

${botIntelSection}

${resultsRecapSection}

${todayMatchupsSection}

${picksSection}

${sectionCard({
  pillLabel: 'ATS EDGE',
  pillType: 'ats',
  headline: 'Against the Spread',
  body: atsBody,
})}

${sectionCard({
  pillLabel: 'RANKINGS',
  pillType: 'intel',
  headline: 'AP Top 25',
  body: rankBody,
})}

${pinnedSection}

${headlineSection}

${bracketCta}`;

  const ctaLabel = showTournament
    ? 'Explore tournament insights &rarr;'
    : 'Explore full insights &rarr;';

  return EmailShell({
    content,
    previewText: `Your Maximus Sports briefing for ${today} \u2014 ${showTournament ? 'tournament intel, model signals, and bracket edges.' : 'games, ATS leaders, and intel in one read.'}`,
    ctaLabel,
  });
}

export function renderText(data = {}) {
  const {
    displayName,
    scoresToday = [],
    atsLeaders = {},
    headlines = [],
    botIntelBullets = [],
    pinnedTeams = [],
    modelSignals = [],
    tournamentMeta = {},
    narrativeParagraph = '',
    priorDayResults = [],
    todayUpcoming = [],
    picksSummary = '',
  } = data;
  const name = displayName ? displayName.split(' ')[0] : 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const showTournament = isTournamentWeek();
  const showPreTournament = isPreTournament();

  const lines = [
    'MAXIMUS SPORTS \u2014 Daily Briefing',
    today,
    '',
    `Good morning, ${name}. Here\u2019s your edge today.`,
    '',
  ];

  if (narrativeParagraph) {
    lines.push(narrativeParagraph, '');
  } else if (showTournament) {
    lines.push(
      showPreTournament ? 'TOURNAMENT PREVIEW' : 'TOURNAMENT UPDATE',
      showPreTournament
        ? 'The NCAA tournament bracket is set. Early model signals are surfacing.'
        : 'Tournament games are underway. Model edges updating in real time.',
      '',
    );
  }

  if (botIntelBullets.length > 0) {
    lines.push('MAXIMUS SAYS', ...botIntelBullets.slice(0, 4).map(b => `- ${b}`), '');
  }

  if (priorDayResults.length > 0) {
    lines.push('RESULTS');
    for (const g of priorDayResults.slice(0, 6)) {
      if (g.hasScore) {
        lines.push(`- ${g.winner} ${g.winScore}, ${g.loser} ${g.loseScore}`);
      }
    }
    lines.push('');
  }

  if (todayUpcoming.length > 0) {
    lines.push(`TODAY'S GAMES — ${todayUpcoming.length} game${todayUpcoming.length !== 1 ? 's' : ''}`);
    for (const g of todayUpcoming.slice(0, 6)) {
      lines.push(`- ${g.awayTeam || 'Away'} vs ${g.homeTeam || 'Home'}`);
    }
    lines.push('');
  } else {
    lines.push('WHAT TO WATCH', scoresToday.length > 0 ? `${scoresToday.length} games on the slate today.` : 'Light slate today.', '');
  }

  if (picksSummary) {
    lines.push('MAXIMUS PICKS', picksSummary, '');
  } else if (modelSignals.length > 0) {
    lines.push('MODEL PICKS', ...modelSignals.slice(0, 5).map(s =>
      `- ${s.matchup || '?'}: ${s.edge || 'model edge'}`
    ), '');
  }

  lines.push(
    'ATS EDGE',
    atsLeaders.best?.length > 0
      ? `Top ATS performer: ${atsLeaders.best[0].name || atsLeaders.best[0].team}`
      : 'No major ATS edges today.',
    '',
  );

  if (pinnedTeams.length > 0) {
    lines.push(
      'YOUR TEAMS',
      ...pinnedTeams.slice(0, 5).map(t => {
        const { gameInfoText } = getTeamTodaySummary(t, scoresToday);
        return `${t.name}: ${gameInfoText}`;
      }),
      '',
    );
  }

  if (headlines.length > 0) {
    lines.push(
      'HEADLINES',
      ...headlines.slice(0, 4).map(h => `- ${h.title || 'No title'}`),
      '',
    );
  }

  if (showTournament) {
    lines.push(
      'BRACKETOLOGY',
      'Build your bracket with Maximus -> https://maximussports.ai/bracketology',
      '',
    );
  }

  lines.push(
    'Open Maximus Sports -> https://maximussports.ai',
    '',
    'Not betting advice. Manage preferences: https://maximussports.ai/settings',
  );

  return lines.join('\n');
}

// ── Helpers ──

function divider() {
  return `<tr>
  <td style="padding:4px 24px;" class="divider-td">
    <div style="height:1px;background-color:#e8ecf0;font-size:0;line-height:0;">&nbsp;</div>
  </td>
</tr>`;
}

function spacer(px = 8) {
  return `<tr><td style="height:${px}px;font-size:0;line-height:0;" aria-hidden="true">&nbsp;</td></tr>`;
}

/**
 * Bracketology CTA block — premium email-safe version of the
 * in-app bracketology promo card. Uses the same dark brand treatment
 * (dark navy background, white text, accent CTA button).
 */
function buildBracketologyCta() {
  return `
${divider()}
<tr>
  <td style="padding:12px 24px 16px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background-color:${BRAND_DARK};border-radius:8px;border-collapse:collapse;overflow:hidden;">
      <tr>
        <td style="padding:24px 22px;">
          <p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#6EB3E8;font-family:'DM Sans',Arial,sans-serif;line-height:1.4;">
            March Madness 2026
          </p>
          <p style="margin:0 0 8px;font-size:18px;font-weight:800;color:#ffffff;line-height:1.25;letter-spacing:-0.01em;font-family:'DM Sans',Arial,sans-serif;">
            Build Your Bracket with Maximus
          </p>
          <p style="margin:0 0 18px;font-size:13px;color:rgba(255,255,255,0.72);line-height:1.55;font-family:'DM Sans',Arial,sans-serif;">
            Region-by-region picks, upset probabilities, and data-driven predictions for every matchup. Use the model or compete against it.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td align="center" bgcolor="#3C79B4" style="border-radius:6px;background-color:#3C79B4;">
                <a href="https://maximussports.ai/bracketology"
                   style="display:inline-block;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;padding:10px 22px;letter-spacing:0.02em;font-family:'DM Sans',Arial,sans-serif;border-radius:6px;line-height:1.3;">
                  Complete Your Bracket &rarr;
                </a>
              </td>
              <td style="width:10px;">&nbsp;</td>
              <td align="center" style="border-radius:6px;border:1px solid rgba(74,144,217,0.4);">
                <a href="https://maximussports.ai/bracketology"
                   style="display:inline-block;color:#6EB3E8;font-size:13px;font-weight:600;text-decoration:none;padding:9px 18px;letter-spacing:0.01em;font-family:'DM Sans',Arial,sans-serif;border-radius:6px;line-height:1.3;">
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
