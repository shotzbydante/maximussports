/**
 * Team Digest email template.
 *
 * Sent to subscribers with preferences.teamDigest = true and at least one
 * team selected in preferences.teamDigestTeams[].
 *
 * Each email contains one or more team sections — effectively the email
 * version of a team page. Sections are stacked vertically inside one email.
 * If more than TEAM_DIGEST_MAX_TEAMS teams are selected, the first N are
 * rendered in full with a "view more" CTA to the app.
 *
 * Per-team sections include:
 *  1. Team hero (logo, name, record, AP rank if available)
 *  2. AI summary ("Maximus Says")
 *  3. Game card (upcoming or latest result — with logos, spread, Gamecast link)
 *  4. Recent team news (up to 5 headlines)
 *  5. YouTube videos (2–4 video cards, email-safe thumbnail+title+link format)
 *  6. ATS intel / recent form
 *  7. CTA to team page on maximussports.ai
 *
 * @param {object} data
 * @param {string} [data.displayName]    — user's resolved display name
 * @param {Array}  data.teamDigests       — array of per-team digest objects from teamDigest.js
 * @param {number} [data.totalTeamCount]  — total selected teams (for truncation note)
 */

import { EmailShell, heroBlock, pill, teamLogoImg, spacerRow, dividerRow } from '../EmailShell.js';
import { renderEmailGameCard } from '../../../api/_lib/emailGameCards.js';
import { renderEmailVideoList } from '../../../api/_lib/videoCards.js';
import { TEAM_DIGEST_MAX_TEAMS } from '../../../api/_lib/teamDigest.js';
import { getTeamTodaySummary } from '../../../api/_lib/teamSchedule.js';

// ── Subject & preheader ──────────────────────────────────────────────────────

export function getSubject(data = {}) {
  const { teamDigests = [] } = data;
  if (teamDigests.length === 0) return 'Maximus Sports: Team Digest \u2014 Your Teams';
  if (teamDigests.length === 1) {
    return `Maximus Sports: Team Digest \u2014 ${teamDigests[0].team.name}`;
  }
  const first = teamDigests[0].team.name.split(' ')[0]; // "Kansas"
  return `Maximus Sports: Team Digest \u2014 ${first} + ${teamDigests.length - 1} more`;
}

export function getPreviewText(data = {}) {
  const { teamDigests = [] } = data;
  if (teamDigests.length === 0) return 'Your Maximus Sports team digest is ready.';
  const names = teamDigests.slice(0, 2).map(d => d.team.name).join(' & ');
  return `Full intel for ${names} \u2014 schedule, ATS, news, and more. Powered by Maximus Sports.`;
}

// ── Per-team section renderer ────────────────────────────────────────────────

function renderTeamSection(digest, isFirst = false) {
  const { team, game, rank, ats, teamNews, teamVideos, teamUrl, aiSummary } = digest;
  const teamName = team.name || 'Your Team';
  const teamSlug = team.slug || '';
  const logoHtml = teamLogoImg(team, 40, 'https://maximussports.ai');

  // ── Hero row: big logo + team name + rank/tier pill
  const rankChip = rank
    ? `<span style="display:inline-block;background-color:rgba(50,100,160,0.2);border:1px solid rgba(80,140,200,0.3);color:#5a9fd4;font-size:9px;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;padding:2px 7px;border-radius:3px;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.5;vertical-align:middle;margin-left:6px;">#${rank} AP</span>`
    : '';
  const tierChip = team.tier
    ? `<span style="display:inline-block;background-color:rgba(60,121,180,0.12);border:1px solid rgba(60,121,180,0.25);color:#4a8fc0;font-size:9px;font-weight:600;letter-spacing:0.08em;padding:2px 7px;border-radius:3px;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.5;vertical-align:middle;margin-left:6px;">${team.tier}</span>`
    : '';

  const teamHero = `
<tr>
  <td style="padding:${isFirst ? '0' : '12px'} 24px 0;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           bgcolor="#101e30" style="background-color:#101e30;background-image:linear-gradient(135deg,#101e30 0%,#0d1422 100%);border:1px solid rgba(60,121,180,0.15);border-radius:8px;border-collapse:collapse;">
      <tr>
        <td style="padding:16px 18px 14px;" class="card-td">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td valign="middle" style="width:52px;padding-right:14px;">${logoHtml}</td>
              <td valign="middle">
                <div style="line-height:1;">
                  <a href="${teamUrl}" style="font-size:18px;font-weight:800;color:#edf2f8;text-decoration:none;letter-spacing:-0.02em;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.2;">${teamName}</a>${rankChip}${tierChip}
                </div>
                ${team.conference ? `<div style="margin-top:4px;font-size:11px;color:#4a6070;font-family:'DM Sans',Arial,Helvetica,sans-serif;">${team.conference}</div>` : ''}
              </td>
              <td align="right" valign="middle" style="padding-left:8px;white-space:nowrap;">
                <a href="${teamUrl}" style="font-size:11px;color:#3C79B4;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,Helvetica,sans-serif;">Team page &rarr;</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </td>
</tr>`;

  // ── AI Summary (Maximus Says)
  const summarySection = aiSummary ? `
<tr>
  <td style="padding:0 24px 8px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background-color:#0f1825;border:1px solid rgba(255,255,255,0.07);border-radius:8px;border-collapse:collapse;">
      <tr>
        <td style="padding:14px 16px 13px;" class="card-td">
          <div style="margin-bottom:8px;">${pill('MAXIMUS SAYS', 'intel')}</div>
          <p style="margin:0;font-size:13px;color:#7d8fa0;line-height:1.6;font-family:'DM Sans',Arial,Helvetica,sans-serif;">${aiSummary}</p>
        </td>
      </tr>
    </table>
  </td>
</tr>` : '';

  // ── Game card (upcoming or result)
  let gameSection = '';
  if (game) {
    const cardHtml = renderEmailGameCard(game, { compact: false });
    gameSection = `
<tr>
  <td style="padding:0 24px 8px;" class="section-td">
    ${cardHtml}
  </td>
</tr>`;
  } else {
    // No game today — show a minimal "next game" placeholder
    gameSection = `
<tr>
  <td style="padding:0 24px 8px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background-color:#0f1825;border:1px solid rgba(255,255,255,0.07);border-radius:8px;border-collapse:collapse;">
      <tr>
        <td style="padding:12px 16px;" class="card-td">
          <span style="font-size:11px;color:#3d5060;font-family:'DM Sans',Arial,Helvetica,sans-serif;">No game today \u2014 <a href="${teamUrl}" style="color:#3C79B4;text-decoration:none;font-weight:600;">view full schedule &rarr;</a></span>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
  }

  // ── ATS intel
  let atsSection = '';
  if (ats) {
    const trendLabel = ats.trend === 'hot' ? '🔥 Hot ATS streak' : ats.trend === 'cold' ? '❄ ATS fade watch' : 'ATS Trend';
    const trendColor = ats.trend === 'hot' ? '#3aaa70' : ats.trend === 'cold' ? '#d07030' : '#4a8fc0';
    const coverStr = ats.pct != null ? `${ats.pct}% cover rate` : '';
    const recordStr = ats.record ? ` (${ats.record} ATS)` : '';
    atsSection = `
<tr>
  <td style="padding:0 24px 8px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background-color:#0f1825;border:1px solid rgba(255,255,255,0.07);border-radius:8px;border-collapse:collapse;">
      <tr>
        <td style="padding:12px 16px 11px;" class="card-td">
          <div style="margin-bottom:6px;">${pill('ATS EDGE', 'ats')}</div>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td valign="middle">
                <span style="font-size:13px;font-weight:600;color:${trendColor};font-family:'DM Sans',Arial,Helvetica,sans-serif;">${trendLabel}</span>
                ${coverStr ? `<span style="font-size:12px;color:#7d8fa0;font-family:'DM Sans',Arial,Helvetica,sans-serif;"> &middot; ${coverStr}${recordStr}</span>` : ''}
              </td>
              <td align="right" valign="middle">
                <a href="${teamUrl}" style="font-size:11px;color:#3C79B4;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,Helvetica,sans-serif;">Full intel &rarr;</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
  }

  // ── Team News
  let newsSection = '';
  if (teamNews.length > 0) {
    const newsItems = teamNews.slice(0, 5).map(item => {
      const title = item.title || 'Read more';
      const source = item.source || '';
      const link = item.link || teamUrl;
      return `<a href="${link}" target="_blank"
           style="display:block;color:#7d8fa0;font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);text-decoration:none;line-height:1.45;font-family:'DM Sans',Arial,Helvetica,sans-serif;" class="news-item">
        <span style="color:#b8c8d8;">${title}</span>${source ? `<span style="color:#3d5060;font-size:11px;"> \u2014 ${source}</span>` : ''}
      </a>`;
    }).join('');
    newsSection = `
<tr>
  <td style="padding:0 24px 8px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background-color:#0f1825;border:1px solid rgba(255,255,255,0.07);border-radius:8px;border-collapse:collapse;">
      <tr>
        <td style="padding:14px 16px 10px;" class="card-td">
          <div style="margin-bottom:10px;">${pill('TEAM NEWS', 'news')}</div>
          ${newsItems}
          <div style="margin-top:8px;">
            <a href="${teamUrl}" style="font-size:11px;color:#3C79B4;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,Helvetica,sans-serif;">All ${teamName} news &rarr;</a>
          </div>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
  }

  // ── Videos
  let videosSection = '';
  if (teamVideos.length > 0) {
    const videoRows = renderEmailVideoList(teamVideos, { max: 3, showThumb: true });
    if (videoRows) {
      videosSection = `
<tr>
  <td style="padding:0 24px 2px;" class="section-td">
    <div style="margin-bottom:8px;">${pill('VIDEOS', 'video')}</div>
  </td>
</tr>
${videoRows}`;
    }
  }

  // ── Team CTA
  const teamCta = `
<tr>
  <td style="padding:0 24px 12px;" class="section-td">
    <!--[if mso]><table cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center" bgcolor="#1a3a5c" style="border-radius:6px;"><![endif]-->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
      <tr>
        <td align="center" bgcolor="#1a3a5c"
            style="border-radius:6px;background-color:rgba(60,121,180,0.18);border:1px solid rgba(60,121,180,0.25);mso-padding-alt:0;">
          <a href="${teamUrl}"
             style="display:block;color:#5a9fd4;font-size:13px;font-weight:700;text-decoration:none;padding:11px 20px;text-align:center;letter-spacing:0.01em;font-family:'DM Sans',Arial,Helvetica,sans-serif;border-radius:6px;-webkit-text-size-adjust:none;">
            Open ${teamName} team page &rarr;
          </a>
        </td>
      </tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </td>
</tr>`;

  return [
    teamHero,
    summarySection,
    gameSection,
    atsSection,
    newsSection,
    videosSection,
    teamCta,
  ].filter(Boolean).join('\n');
}

// ── Main render function ─────────────────────────────────────────────────────

export function renderHTML(data = {}) {
  const {
    displayName,
    teamDigests    = [],
    totalTeamCount = teamDigests.length,
  } = data;

  const firstName   = displayName ? displayName.split(' ')[0] : null;
  const greetingStr = firstName ? `, ${firstName}` : '';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  if (teamDigests.length === 0) {
    const content = `
${heroBlock({ line: `Team Digest${greetingStr} \u2014 Select Teams to Follow`, sublabel: today })}
<tr>
  <td style="padding:0 24px 12px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background-color:#0f1825;border:1px solid rgba(255,255,255,0.07);border-radius:8px;border-collapse:collapse;">
      <tr>
        <td style="padding:16px 18px 14px;" class="card-td">
          <div style="margin-bottom:8px;">${pill('INTEL', 'intel')}</div>
          <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#e8edf5;font-family:'DM Sans',Arial,Helvetica,sans-serif;">Set up your Team Digest</p>
          <p style="margin:0;font-size:13px;color:#7d8fa0;line-height:1.6;font-family:'DM Sans',Arial,Helvetica,sans-serif;">Head to Settings on Maximus Sports to select the teams you want in your digest. You&rsquo;ll get full editorial coverage for each team you choose.</p>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
    return EmailShell({
      content,
      previewText: 'Set up your Team Digest on Maximus Sports to get full team coverage.',
      ctaUrl: 'https://maximussports.ai/settings',
      ctaLabel: 'Set up Team Digest &rarr;',
    });
  }

  // ── Single team: minimal hero with team name
  let heroLine;
  if (teamDigests.length === 1) {
    heroLine = `${teamDigests[0].team.name}${greetingStr} \u2014 Here\u2019s your digest.`;
  } else {
    heroLine = `Team Digest${greetingStr} \u2014 ${teamDigests.length} teams, one read.`;
  }

  const teamSections = teamDigests
    .slice(0, TEAM_DIGEST_MAX_TEAMS)
    .map((digest, i) => renderTeamSection(digest, i === 0))
    .join(`\n${dividerRow()}\n${spacerRow(6)}\n`);

  // Truncation note when user has more teams than we can fit
  const remainingCount = totalTeamCount - Math.min(teamDigests.length, TEAM_DIGEST_MAX_TEAMS);
  const truncationNote = remainingCount > 0 ? `
<tr>
  <td style="padding:0 24px 10px;" class="section-td">
    <p style="margin:0;font-size:12px;color:#4a6070;text-align:center;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
      ${remainingCount} more team${remainingCount !== 1 ? 's' : ''} in your digest \u2014
      <a href="https://maximussports.ai/teams" style="color:#3C79B4;text-decoration:none;font-weight:600;">view all on Maximus Sports &rarr;</a>
    </p>
  </td>
</tr>` : '';

  const content = `
${heroBlock({ line: heroLine, sublabel: today })}
<tr>
  <td style="padding:0 24px 8px;" class="section-td">
    <p style="margin:0;font-size:13px;color:#526070;line-height:1.55;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
      Your personalized team intelligence for ${today}. Powered by Maximus Sports.
    </p>
  </td>
</tr>
${spacerRow(4)}
${teamSections}
${truncationNote}`;

  // For multi-team digest, point CTA to teams listing; for single team, point to their page
  const ctaUrl   = teamDigests.length === 1 ? teamDigests[0].teamUrl : 'https://maximussports.ai/teams';
  const ctaLabel = teamDigests.length === 1
    ? `Open ${teamDigests[0].team.name} page &rarr;`
    : 'View all team pages &rarr;';

  return EmailShell({
    content,
    previewText: getPreviewText(data),
    ctaUrl,
    ctaLabel,
  });
}

// ── Subject ──────────────────────────────────────────────────────────────────

// re-export already declared above

// ── Plain text version ───────────────────────────────────────────────────────

export function renderText(data = {}) {
  const { displayName, teamDigests = [] } = data;
  const name  = displayName ? displayName.split(' ')[0] : 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const lines = [
    'MAXIMUS SPORTS \u2014 Team Digest',
    today,
    '',
    `Hey ${name}, here\u2019s your team digest for today.`,
    '',
  ];

  for (const digest of teamDigests.slice(0, TEAM_DIGEST_MAX_TEAMS)) {
    const { team, game, ats, teamNews, teamUrl } = digest;
    lines.push(`━━━ ${team.name} ━━━`);

    if (game) {
      const statusStr = game.gameStatus || game.status || 'Scheduled';
      const isFinal = /final|postponed/i.test(statusStr);
      const isLive  = /\d|halftime|progress/i.test(statusStr);
      if (isFinal && game.homeScore != null) {
        lines.push(`Result: ${game.awayTeam} ${game.awayScore} @ ${game.homeTeam} ${game.homeScore} — Final`);
      } else if (isLive) {
        lines.push(`LIVE: ${game.awayTeam} @ ${game.homeTeam} — ${statusStr}`);
      } else {
        lines.push(`Upcoming: ${game.awayTeam} @ ${game.homeTeam}`);
      }
    }

    if (ats) {
      const trendStr = ats.trend === 'hot' ? 'hot streak' : ats.trend === 'cold' ? 'fade watch' : 'neutral';
      lines.push(`ATS: ${trendStr}${ats.pct != null ? ` (${ats.pct}% cover)` : ''}${ats.record ? ` — ${ats.record}` : ''}`);
    }

    if (teamNews.length > 0) {
      lines.push('');
      lines.push('Latest News:');
      teamNews.slice(0, 3).forEach(n => lines.push(`- ${n.title || 'Read more'}`));
    }

    lines.push(`Team page: ${teamUrl}`);
    lines.push('');
  }

  lines.push('Open Maximus Sports -> https://maximussports.ai');
  lines.push('');
  lines.push('Not betting advice. Manage preferences: https://maximussports.ai/settings');

  return lines.join('\n');
}
