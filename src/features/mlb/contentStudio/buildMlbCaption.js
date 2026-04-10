/**
 * buildMlbCaption
 *
 * Generates Instagram captions for MLB Content Studio posts.
 * Captions are built from structured data — NOT from Gemini.
 * Content sourced from the same intelBriefing used for image generation.
 */

// ── Team emoji map ──────────────────────────────────────────────────────────

const TEAM_EMOJIS = {
  // AL East
  'Yankees':      '🗽',
  'Red Sox':      '🧦',
  'Blue Jays':    '🐦',
  'Rays':         '⚡',
  'Orioles':      '🐦',
  // AL Central
  'Guardians':    '🛡️',
  'Twins':        '🔷',
  'White Sox':    '⬛',
  'Royals':       '👑',
  'Tigers':       '🐯',
  // AL West
  'Astros':       '🚀',
  'Rangers':      '⭐',
  'Mariners':     '🧭',
  'Athletics':    '🐘',
  'Angels':       '😇',
  // NL East
  'Braves':       '🪓',
  'Mets':         '🍎',
  'Phillies':     '🔔',
  'Marlins':      '🐟',
  'Nationals':    '🏛️',
  // NL Central
  'Cubs':         '🐻',
  'Brewers':      '🍺',
  'Cardinals':    '🐦',
  'Pirates':      '🏴‍☠️',
  'Reds':         '🔴',
  // NL West
  'Dodgers':      '🔵',
  'Diamondbacks': '🐍',
  'Padres':       '🟤',
  'Giants':       '🧡',
  'Rockies':      '🏔️',
};

function getTeamEmoji(teamName) {
  if (!teamName) return '⚾';
  for (const [key, emoji] of Object.entries(TEAM_EMOJIS)) {
    if (teamName.includes(key)) return emoji;
  }
  return '⚾';
}

// ── Caption builders per section ────────────────────────────────────────────

function dailyCaption(payload) {
  const intel = payload.intelBriefing;
  const lines = [];

  lines.push('⚾ Today\'s MLB intelligence is LIVE.\n');

  // Headline
  const headline = intel?.headline || payload.headline || 'MLB Daily Briefing';
  lines.push(headline);
  lines.push('');

  // Board pulse (compact market/odds snapshot)
  const boardPulse = intel?.boardPulse || payload.boardPulse;
  if (boardPulse) {
    lines.push(`📊 ${boardPulse}`);
    lines.push('');
  }

  // Bullets (now up to 5 for richer captions)
  const bullets = (intel?.bullets || payload.bullets || []).slice(0, 5);
  if (bullets.length > 0) {
    lines.push('🔥 Key intel:');
    for (const b of bullets) {
      lines.push(`• ${b}`);
    }
    lines.push('');
  }

  // Matchups
  const matchups = (intel?.keyMatchups || payload.keyMatchups || []).slice(0, 3);
  if (matchups.length > 0) {
    lines.push('👀 Matchups to watch:');
    for (const m of matchups) {
      const eA = getTeamEmoji(m.teamA);
      const eB = getTeamEmoji(m.teamB);
      lines.push(`${eA} ${m.teamA} vs ${eB} ${m.teamB}`);
    }
    lines.push('');
  }

  lines.push('More → maximussports.ai');

  // Build hashtags — include team-specific tags if teams are mentioned
  const hashtags = ['#MLB', '#Baseball', '#SportsBetting', '#MaximusPicks', '#MaximusSports', '#BaseballIntel'];
  const teamMentions = intel?.teamMentions || payload.teamMentions || [];
  for (const t of teamMentions.slice(0, 3)) {
    hashtags.push(`#${t.replace(/\s+/g, '')}`);
  }

  return { caption: lines.join('\n'), hashtags };
}

function teamCaption(payload) {
  const teamName = payload.teamA?.name || payload.headline || 'Team';
  const emoji = getTeamEmoji(teamName);
  const bullets = (payload.bullets || []).slice(0, 5);
  const projection = payload.projection || null;
  const lines = [];

  // Opener — editorial identity with headline thesis
  lines.push(`${emoji} ${teamName} — Team Intel Report`);
  lines.push('');

  // Headline thesis as social hook
  if (payload.subhead) {
    lines.push(payload.subhead);
    lines.push('');
  }

  // Projection + standings context
  if (projection?.projectedWins) {
    const parts = [`📈 ${projection.projectedWins} projected wins`];
    if (projection.floor && projection.ceiling) {
      parts[0] += ` (${projection.floor}\u2013${projection.ceiling} range)`;
    }
    if (projection.marketDelta != null && Math.abs(projection.marketDelta) >= 1.5) {
      const dir = projection.marketDelta > 0 ? 'above' : 'below';
      parts.push(`📐 ${Math.abs(projection.marketDelta).toFixed(1)} wins ${dir} market consensus`);
    }
    lines.push(parts.join('\n'));
    lines.push('');
  }

  // Full Team Intel Briefing — mirrors the slide
  if (bullets.length > 0) {
    lines.push('🔎 Team Intel Briefing:');
    for (let i = 0; i < bullets.length; i++) {
      lines.push(`${i + 1}. ${bullets[i]}`);
    }
    lines.push('');
  }

  // CTA
  lines.push('Full breakdown → maximussports.ai');

  const teamTag = teamName.replace(/\s+/g, '');
  return {
    caption: lines.join('\n'),
    hashtags: ['#MLB', '#Baseball', `#${teamTag}`, '#BaseballIntel', '#MaximusSports'],
  };
}

function gameCaption(payload) {
  const away = payload.teamA?.name || 'Away';
  const home = payload.teamB?.name || 'Home';
  const eA = getTeamEmoji(away);
  const eH = getTeamEmoji(home);
  const signals = payload.signals || [];

  const lines = [];
  lines.push(`${eA} ${away} at ${eH} ${home}\n`);
  lines.push(payload.subhead || 'Game preview and analysis');
  lines.push('');

  if (signals.length > 0) {
    lines.push('📐 Market snapshot:');
    for (const s of signals) lines.push(`• ${s}`);
    lines.push('');
  }

  lines.push('More → maximussports.ai');

  return {
    caption: lines.join('\n'),
    hashtags: ['#MLB', '#Baseball', '#GamePreview', '#MaximusSports', '#MaximusPicks'],
  };
}

function picksCaption(payload) {
  const signals = payload.signals || [];
  const conf = payload.keyPick?.confidence;

  const lines = [];
  lines.push('⚾ Today\'s MLB picks board is LIVE.\n');
  lines.push(payload.headline || "Maximus's Picks");
  lines.push('');

  if (payload.keyPick) {
    const confLabel = conf === 'high' ? '🟢 HIGH' : conf === 'medium' ? '🟡 MEDIUM' : '⚪ LOW';
    lines.push(`🎯 Top play: ${payload.keyPick.label} (${confLabel})`);
    lines.push('');
  }

  if (signals.length > 0) {
    lines.push('📊 Board signals:');
    for (const s of signals) lines.push(`• ${s}`);
    lines.push('');
  }

  lines.push('More → maximussports.ai');

  return {
    caption: lines.join('\n'),
    hashtags: ['#MLB', '#Baseball', '#SportsBetting', '#MaximusPicks', '#MaximusSports', '#BettingIntelligence'],
  };
}

function genericCaption(payload) {
  const lines = [];
  lines.push(`⚾ ${payload.headline || 'MLB Intelligence'}\n`);
  if (payload.subhead) lines.push(payload.subhead);
  lines.push('');
  lines.push('More → maximussports.ai');

  return {
    caption: lines.join('\n'),
    hashtags: ['#MLB', '#Baseball', '#MaximusSports'],
  };
}

// ── Main export ─────────────────────────────────────────────────────────────

const SECTION_BUILDERS = {
  'daily-briefing': dailyCaption,
  'team-intel': teamCaption,
  'league-intel': genericCaption,
  'division-intel': genericCaption,
  'game-insights': gameCaption,
  'maximus-picks': picksCaption,
};

/**
 * Build an MLB Instagram caption from a normalized payload.
 *
 * @param {Object} payload - normalized MLB image payload
 * @returns {{ caption: string, hashtags: string[] }}
 */
export function buildMlbCaption(payload) {
  const builder = SECTION_BUILDERS[payload.section] || genericCaption;
  const result = builder(payload);
  return {
    shortCaption: result.caption,
    longCaption: result.caption + '\n\nFor entertainment only. Please bet responsibly. 21+',
    hashtags: result.hashtags,
  };
}
