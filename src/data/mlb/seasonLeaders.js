/**
 * seasonLeaders.js — Shared helper for MLB season stat leaders.
 *
 * Provides:
 *   1. Structured leaders data for UI (Slide 2 Season Leaders box)
 *   2. Narrative-aware context for briefings (Home page, email)
 *
 * Data source: /api/mlb/leaders (ESPN-backed, 30min cache)
 *
 * Consumers:
 *   - MlbDailySlide2 (Season Leaders card)
 *   - homeSummary.js (AI prompt enrichment)
 *   - mlbBriefing.js (email narrative)
 */

// ─── Category metadata ──────────────────────────────────────────────────

export const LEADER_CATEGORIES = [
  { key: 'homeRuns', label: 'Home Runs', abbrev: 'HR', icon: '💣' },
  { key: 'RBIs',     label: 'RBIs',      abbrev: 'RBI', icon: '🔋' },
  { key: 'hits',     label: 'Hits',      abbrev: 'H', icon: '🎯' },
  { key: 'wins',     label: 'Wins',      abbrev: 'W', icon: '🏆' },
  { key: 'saves',    label: 'Saves',     abbrev: 'SV', icon: '🔒' },
];

// ─── Narrative builder ──────────────────────────────────────────────────

/**
 * Build a compact narrative string about season leaders for AI prompt injection.
 * Used by homeSummary.js and email briefing to enrich content.
 *
 * @param {Object} leadersData - from /api/mlb/leaders: { categories: { ... } }
 * @returns {string} Multi-line leaders summary, or empty string if no data
 */
export function buildLeadersNarrative(leadersData) {
  if (!leadersData?.categories) return '';

  const lines = ['CURRENT MLB SEASON LEADERS:'];

  for (const { key, label, abbrev } of LEADER_CATEGORIES) {
    const cat = leadersData.categories[key];
    if (!cat?.leaders?.length) continue;

    const top3 = cat.leaders.slice(0, 3).map((l, i) => {
      const teamStr = l.teamAbbrev ? ` (${l.teamAbbrev})` : '';
      return `${i + 1}. ${l.name}${teamStr} — ${l.display} ${abbrev}`;
    });

    lines.push(`\n${label}:`);
    lines.push(...top3);
  }

  return lines.length > 1 ? lines.join('\n') : '';
}

/**
 * Build a short editorial sentence about leaders for inline use in briefings.
 * Picks the most interesting stat race and creates a single narrative hook.
 *
 * @param {Object} leadersData - from /api/mlb/leaders
 * @returns {string|null} A single editorial sentence or null
 */
export function buildLeadersEditorialHook(leadersData) {
  if (!leadersData?.categories) return null;

  const hooks = [];

  // HR race
  const hr = leadersData.categories.homeRuns?.leaders;
  if (hr?.length >= 2) {
    const gap = (hr[0].value || 0) - (hr[1].value || 0);
    if (gap <= 3) {
      hooks.push({
        text: `The HR race is heating up — ${hr[0].name} (${hr[0].display}) leads ${hr[1].name} (${hr[1].display}) by just ${gap}.`,
        priority: 80,
      });
    } else if ((hr[0].value || 0) >= 40) {
      hooks.push({
        text: `${hr[0].name} leads the majors with ${hr[0].display} home runs, pacing ahead of the field.`,
        priority: 65,
      });
    }
  }

  // Saves race
  const sv = leadersData.categories.saves?.leaders;
  if (sv?.length >= 2) {
    const gap = (sv[0].value || 0) - (sv[1].value || 0);
    if (gap <= 3) {
      hooks.push({
        text: `The saves race is tight — ${sv[0].name} (${sv[0].display}) and ${sv[1].name} (${sv[1].display}) are separated by ${gap}.`,
        priority: 70,
      });
    }
  }

  // Wins race
  const w = leadersData.categories.wins?.leaders;
  if (w?.length >= 1 && (w[0].value || 0) >= 15) {
    hooks.push({
      text: `${w[0].name} leads all pitchers with ${w[0].display} wins on the season.`,
      priority: 55,
    });
  }

  // RBI leader
  const rbi = leadersData.categories.RBIs?.leaders;
  if (rbi?.length >= 1 && (rbi[0].value || 0) >= 90) {
    hooks.push({
      text: `${rbi[0].name} leads the majors in RBIs with ${rbi[0].display}, driving the ${rbi[0].teamAbbrev || 'his team'}'s offense.`,
      priority: 50,
    });
  }

  if (hooks.length === 0) return null;
  hooks.sort((a, b) => b.priority - a.priority);
  return hooks[0].text;
}
