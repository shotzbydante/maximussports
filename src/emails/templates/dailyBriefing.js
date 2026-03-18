/**
 * Daily AI Briefing — editorial newsletter template.
 * Sent at 6:00 AM PT. Clean, readable, Morning Brew–inspired layout.
 *
 * Structure (tournament-aware):
 *   Header (via EmailShell)
 *   Today's headline
 *   Tournament storyline (conditional — tournament window)
 *   Maximus Says (bot intel)
 *   Top Seeds to Watch (conditional — pre-tournament)
 *   Upsets to Watch (conditional — tournament window)
 *   Model Picks / strongest signals
 *   Today's Games
 *   Conference Tournament Recap (conditional — pre-tournament)
 *   Bracket Strategy (conditional — tournament window)
 *   ATS Edge
 *   AP Top 25
 *   Your Teams
 *   Headlines
 *   CTA (via EmailShell)
 *   Footer (via EmailShell)
 *
 * @param {object} data
 * @param {string}  [data.displayName]
 * @param {Array}   [data.scoresToday]
 * @param {Array}   [data.rankingsTop25]
 * @param {object}  [data.atsLeaders]       — { best: [...], worst: [...] }
 * @param {Array}   [data.headlines]
 * @param {Array}   [data.pinnedTeams]      — [{ name, slug }]
 * @param {Array}   [data.botIntelBullets]
 * @param {Array}   [data.modelSignals]     — top model picks for signal cards
 * @param {object}  [data.tournamentMeta]   — { topSeeds, upsetMatchups, confRecap, bracketTip }
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
  } = data;

  const firstName = displayName ? displayName.split(' ')[0] : null;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const greetingName = firstName || 'there';

  const gameCount = scoresToday.length;
  const bestAts = atsLeaders.best || [];

  const showTournament = isTournamentWeek();
  const showPreTournament = isPreTournament();
  const phase = getTournamentPhase();

  // ── Headline + intro (tournament-aware) ──
  const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });
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
      heroLine = `Tournament Game Day \u2014 ${gameCount > 0 ? `${gameCount} Games` : 'March Madness Continues'}`;
      introParagraph = `Good morning, ${greetingName}. Tournament action continues today. Maximus is tracking every game and updating edges in real time.`;
    }
  } else if (showTournament && (phase === 'sweet_sixteen')) {
    heroLine = gameCount > 0
      ? `Sweet 16 / Elite Eight \u2014 ${gameCount} Games Today`
      : 'Sweet 16 / Elite Eight \u2014 Tournament Intel';
    introParagraph = `Good morning, ${greetingName}. We\u2019re deep in the tournament now. Every game matters for the bracket. Here\u2019s your intel.`;
  } else if (showTournament && phase === 'final_four') {
    heroLine = 'Final Four \u2014 The Stage Is Set';
    introParagraph = `Good morning, ${greetingName}. The Final Four is here. The model has its edge. Let\u2019s break down the biggest games in college basketball.`;
  } else if (showTournament) {
    heroLine = 'Tournament Day \u2014 Model Signals Active';
    introParagraph = `Good morning, ${greetingName}. The tournament is live. Maximus is tracking every game and updating edges in real time.`;
  } else if (gameCount > 0 && bestAts.length > 0) {
    heroLine = 'What you need to know before tonight\u2019s games.';
    introParagraph = `Good morning, ${greetingName}. ${gameCount} game${gameCount !== 1 ? 's' : ''} on today\u2019s slate and the lines are moving. Here\u2019s what matters before tip-off.`;
  } else if (gameCount > 0) {
    heroLine = 'What you need to know before tonight\u2019s games.';
    introParagraph = `Good morning, ${greetingName}. ${gameCount} game${gameCount !== 1 ? 's' : ''} on today\u2019s slate. Here\u2019s what Maximus Sports is watching.`;
  } else if (showTournament) {
    heroLine = 'Tournament Transition \u2014 What\u2019s Next';
    introParagraph = `Good morning, ${greetingName}. No games today, but the bracket doesn\u2019t sleep. Here\u2019s what Maximus is watching ahead of the next round.`;
  } else {
    heroLine = 'Your daily hoops intel.';
    introParagraph = `Good morning, ${greetingName}. Light slate today \u2014 Maximus Sports is staying disciplined. Here\u2019s the intel that matters.`;
  }

  // ── Tournament storyline section (tournament window only) ──
  let tournamentStoryline = '';
  if (showTournament) {
    let storyTitle, storyHeadline, storyDefault;
    if (showPreTournament) {
      storyTitle = 'TOURNAMENT PREVIEW';
      storyHeadline = 'Bracket Intel';
      storyDefault = 'The bracket is locked in. The model has scanned every region and is flagging edges across all four quadrants. Below are the key signals heading into the tournament.';
    } else if (phase === 'first_round') {
      storyTitle = dayOfWeek === 'Monday' ? 'WEEKEND RECAP' : 'TOURNAMENT UPDATE';
      storyHeadline = dayOfWeek === 'Monday' ? 'Weekend Tournament Recap' : 'Live Tournament Intel';
      storyDefault = dayOfWeek === 'Monday'
        ? 'The opening weekend of March Madness is complete. The model is recalibrating based on results and flagging edges for the next round.'
        : (dayOfWeek === 'Tuesday' || dayOfWeek === 'Wednesday')
          ? 'Between rounds \u2014 the bracket resets and teams prepare for the next slate. The model is already identifying the strongest edges.'
          : 'Tournament games are live. Maximus is tracking results and adjusting model edges after every game.';
    } else if (phase === 'sweet_sixteen') {
      storyTitle = 'SWEET 16 / ELITE EIGHT';
      storyHeadline = 'Deep Tournament Intel';
      storyDefault = 'The field has narrowed significantly. Every remaining game has bracket-defining stakes. The model\u2019s edge signals are sharpening.';
    } else if (phase === 'final_four') {
      storyTitle = 'FINAL FOUR';
      storyHeadline = 'Final Four Intel';
      storyDefault = 'Four teams remain. The model has its final reads. This is the biggest stage in college basketball.';
    } else {
      storyTitle = 'TOURNAMENT UPDATE';
      storyHeadline = 'Tournament Intel';
      storyDefault = 'The NCAA tournament continues. Maximus is tracking every game and updating edges in real time.';
    }

    tournamentStoryline = `
${divider()}
${sectionCard({
  pillLabel: storyTitle,
  pillType: 'intel',
  headline: storyHeadline,
  body: tournamentMeta.storyline || storyDefault,
})}`;
  }

  // ── Top Seeds to Watch (pre-tournament only) ──
  let topSeedsSection = '';
  if (showPreTournament) {
    const seeds = tournamentMeta.topSeeds || ['Houston', 'Duke', 'Auburn', 'Florida'];
    const seedList = seeds.map(s =>
      `<tr>
        <td valign="top" style="width:18px;color:${ACCENT};font-size:14px;padding-top:1px;font-family:'DM Sans',Arial,sans-serif;">&bull;</td>
        <td valign="top" style="font-size:14px;color:${TEXT_SECONDARY};line-height:1.6;font-family:'DM Sans',Arial,sans-serif;padding-bottom:6px;">
          <strong style="color:${TEXT_PRIMARY};">${s}</strong>
        </td>
      </tr>`
    ).join('');

    const seedCommentary = tournamentMeta.seedCommentary
      || 'The model\u2019s confidence on top seeds varies. Not all #1s carry the same weight \u2014 check the full analysis inside the app.';

    topSeedsSection = `
<tr>
  <td style="padding:0 24px 4px;" class="section-td">
    <div style="margin-bottom:10px;">${sectionLabel('TOP SEEDS TO WATCH')}</div>
  </td>
</tr>
<tr>
  <td style="padding:0 24px 8px;" class="section-td">
    <p style="margin:0 0 10px;font-size:14px;color:${TEXT_SECONDARY};line-height:1.5;font-family:'DM Sans',Arial,sans-serif;">
      Top seeds entering the tournament:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${seedList}
    </table>
    <p style="margin:8px 0 0;font-size:13px;color:${TEXT_MUTED};line-height:1.55;font-family:'DM Sans',Arial,sans-serif;font-style:italic;">
      ${seedCommentary}
    </p>
  </td>
</tr>
${spacer(8)}`;
  }

  // ── Upsets to Watch (tournament window) ──
  let upsetsSection = '';
  if (showTournament) {
    const upsetMatchups = tournamentMeta.upsetMatchups || [];
    if (upsetMatchups.length > 0) {
      const upsetRows = upsetMatchups.slice(0, 3).map(u => {
        const comment = u.comment || 'Model flags this matchup as a high-volatility game.';
        return `<tr>
  <td style="padding:10px 16px;border-bottom:1px solid ${BORDER};">
    <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:${TEXT_PRIMARY};font-family:'DM Sans',Arial,sans-serif;">
      <span style="color:#c05621;margin-right:4px;">&#9888;&#65039;</span> ${u.matchup}
    </p>
    <p style="margin:0;font-size:13px;color:${TEXT_SECONDARY};line-height:1.5;font-family:'DM Sans',Arial,sans-serif;">${comment}</p>
  </td>
</tr>`;
      }).join('');

      upsetsSection = `
<tr>
  <td style="padding:0 24px 4px;" class="section-td">
    <div style="margin-bottom:10px;">${sectionLabel('UPSETS TO WATCH')}</div>
  </td>
</tr>
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background-color:#f9fafb;border:1px solid ${BORDER};border-radius:6px;border-collapse:collapse;">
      ${upsetRows}
    </table>
    <p style="margin:10px 0 0;font-size:13px;color:${TEXT_MUTED};line-height:1.5;font-family:'DM Sans',Arial,sans-serif;font-style:italic;">
      5 vs 12 matchups historically produce the most bracket chaos. The Upset Radar tracks real-time volatility.
    </p>
  </td>
</tr>`;
    }
  }

  // ── Model Picks / Strongest Signals ──
  let modelPicksSection = '';
  const signals = modelSignals.length > 0
    ? buildSignalsFromPicks(modelSignals, 5)
    : [];

  if (signals.length > 0) {
    modelPicksSection = `
<tr>
  <td style="padding:0 24px 4px;" class="section-td">
    <div style="margin-bottom:10px;">${sectionLabel('MODEL PICKS')}</div>
    <p style="margin:0 0 10px;font-size:14px;color:${TEXT_SECONDARY};line-height:1.5;font-family:'DM Sans',Arial,sans-serif;">
      Today\u2019s strongest signals:
    </p>
  </td>
</tr>
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    ${signalCard(signals)}
  </td>
</tr>`;
  }

  // ── Bot intel section ──
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

  // ── Games section ──
  const gameCardsHtml = gameCount > 0 ? renderEmailGameList(scoresToday, { max: 3, compact: true }) : '';
  let gamesSection = '';
  if (gameCount > 0) {
    gamesSection = `
<tr>
  <td style="padding:0 24px 4px;" class="section-td">
    <div style="margin-bottom:4px;">${sectionLabel('TODAY\u2019S GAMES')}</div>
    <p style="margin:0 0 8px;font-size:14px;color:${TEXT_SECONDARY};line-height:1.5;font-family:'DM Sans',Arial,sans-serif;">${gameCount} game${gameCount !== 1 ? 's' : ''} on the slate.</p>
  </td>
</tr>
${gameCardsHtml}`;
  }

  // ── Conference Tournament Recap (pre-tournament only) ──
  let confRecapSection = '';
  if (showPreTournament) {
    const recap = tournamentMeta.confRecap || [];
    if (recap.length > 0) {
      const recapBullets = recap.slice(0, 4).map(r =>
        `<tr>
          <td valign="top" style="width:18px;color:${ACCENT};font-size:14px;padding-top:1px;font-family:'DM Sans',Arial,sans-serif;">&bull;</td>
          <td valign="top" style="font-size:14px;color:${TEXT_SECONDARY};line-height:1.6;font-family:'DM Sans',Arial,sans-serif;padding-bottom:8px;">${r}</td>
        </tr>`
      ).join('');

      confRecapSection = `
${divider()}
<tr>
  <td style="padding:0 24px 4px;" class="section-td">
    <div style="margin-bottom:10px;">${sectionLabel('CONFERENCE TOURNAMENT RECAP')}</div>
  </td>
</tr>
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <p style="margin:0 0 10px;font-size:14px;color:${TEXT_SECONDARY};line-height:1.5;font-family:'DM Sans',Arial,sans-serif;">
      Recent conference championship highlights:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${recapBullets}
    </table>
  </td>
</tr>`;
    }
  }

  // ── Bracket Strategy (tournament window) ──
  let bracketStrategySection = '';
  if (showTournament) {
    const tip = tournamentMeta.bracketTip
      || '8 vs 9 matchups are historically coin flips \u2014 but the model still finds slight edges based on team efficiency and conference strength of schedule.';

    bracketStrategySection = `
${divider()}
${sectionCard({
  pillLabel: 'BRACKET STRATEGY',
  pillType: 'intel',
  headline: 'Bracket Insight',
  body: tip,
})}`;
  }

  // ── ATS section ──
  let atsBody = '';
  if (bestAts.length > 0) {
    const top = bestAts[0];
    const pct = top.pct != null ? `${Math.round(top.pct * 100)}%` : '';
    atsBody = `<strong style="color:${TEXT_PRIMARY};">${top.name || top.team || 'A team'}</strong> ${pct ? `is covering at ${pct} ATS` : 'is the top ATS performer right now'}. ${bestAts.length > 1 ? `${bestAts[1].name || bestAts[1].team} is also worth watching.` : ''}`;
  } else {
    atsBody = 'No major ATS edges detected today. Patience is a strategy.';
  }

  // ── Rankings ──
  let rankBody = '';
  if (rankingsTop25.length > 0) {
    const top3 = rankingsTop25.slice(0, 3).map((r, i) => `#${i + 1} ${r.teamName || r.name || r.team || 'Unknown'}`).join(', ');
    rankBody = `Current top 3: ${top3}. The bubble is tightening.`;
  } else {
    rankBody = 'Rankings data is refreshing. Check the app for the latest AP Top 25.';
  }

  // ── Pinned teams ──
  let pinnedSection = '';
  if (pinnedTeams.length > 0) {
    const pinnedRows = pinnedTeams.slice(0, 3).map(team => {
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

  // ── Headlines ──
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
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <div style="margin-bottom:8px;">${sectionLabel('HEADLINES')}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${headlineItems}
    </table>
  </td>
</tr>`;
  }

  // ── Assemble all content ──
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

<tr>
  <td style="padding:0 24px;" class="divider-td">
    <div style="height:1px;background-color:${BORDER};font-size:0;line-height:0;">&nbsp;</div>
  </td>
</tr>
<tr><td style="height:14px;font-size:0;line-height:0;">&nbsp;</td></tr>

${tournamentStoryline}

${botIntelSection}

${topSeedsSection}

${upsetsSection}

${modelPicksSection}

${gamesSection}

${confRecapSection}

${bracketStrategySection}

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

${headlineSection}`;

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

  if (showTournament) {
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

  if (showPreTournament) {
    const seeds = tournamentMeta.topSeeds || ['Houston', 'Duke', 'Auburn', 'Florida'];
    lines.push('TOP SEEDS TO WATCH', ...seeds.map(s => `- ${s}`), '');
  }

  if (modelSignals.length > 0) {
    lines.push('MODEL PICKS', ...modelSignals.slice(0, 5).map(s =>
      `- ${s.matchup || '?'}: ${s.edge || 'model edge'}`
    ), '');
  }

  lines.push(
    'WHAT TO WATCH',
    scoresToday.length > 0 ? `${scoresToday.length} games on the slate today.` : 'Light slate today.',
    '',
    'ATS EDGE',
    atsLeaders.best?.length > 0
      ? `Top ATS performer: ${atsLeaders.best[0].name || atsLeaders.best[0].team}`
      : 'No major ATS edges today.',
    '',
  );

  if (showPreTournament && (tournamentMeta.confRecap || []).length > 0) {
    lines.push('CONFERENCE TOURNAMENT RECAP', ...tournamentMeta.confRecap.slice(0, 3).map(r => `- ${r}`), '');
  }

  if (showTournament) {
    lines.push(
      'BRACKET STRATEGY',
      tournamentMeta.bracketTip || '8 vs 9 matchups are historically coin flips — the model still finds slight edges.',
      '',
    );
  }

  if (pinnedTeams.length > 0) {
    lines.push(
      'YOUR TEAMS',
      ...pinnedTeams.slice(0, 3).map(t => {
        const { gameInfoText } = getTeamTodaySummary(t, scoresToday);
        return `${t.name}: ${gameInfoText}`;
      }),
      '',
    );
  }

  lines.push(
    'HEADLINES',
    ...headlines.slice(0, 3).map(h => `- ${h.title || 'No title'}`),
    '',
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
