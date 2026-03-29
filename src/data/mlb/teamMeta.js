/**
 * MLB Team Metadata — prior season records, finishes, and reference data.
 * Used by pinned team cards and team intel surfaces.
 *
 * TODO: Replace with live data from MLB Stats API when available.
 */

export const MLB_TEAM_META = {
  // ── American League ───────────────────────────────────────────────────────
  // AL East
  nyy: { record2025: '94-68', finish: 'Lost in ALDS',       priorWins: 94 },
  bos: { record2025: '81-81', finish: 'Missed Playoffs',    priorWins: 81 },
  tor: { record2025: '91-71', finish: 'Lost in World Series', priorWins: 91 },
  tb:  { record2025: '80-82', finish: 'Missed Playoffs',    priorWins: 80 },
  bal: { record2025: '83-79', finish: 'Lost in Wild Card',  priorWins: 83 },
  // AL Central
  cle: { record2025: '92-70', finish: 'Lost in ALCS',       priorWins: 92 },
  min: { record2025: '82-80', finish: 'Lost in Wild Card',  priorWins: 82 },
  det: { record2025: '86-76', finish: 'Lost in ALDS',       priorWins: 86 },
  cws: { record2025: '41-121', finish: 'Missed Playoffs',   priorWins: 41 },
  kc:  { record2025: '86-76', finish: 'Lost in ALDS',       priorWins: 86 },
  // AL West
  hou: { record2025: '88-74', finish: 'Lost in Wild Card',  priorWins: 88 },
  laa: { record2025: '63-99', finish: 'Missed Playoffs',    priorWins: 63 },
  sea: { record2025: '85-77', finish: 'Missed Playoffs',    priorWins: 85 },
  tex: { record2025: '78-84', finish: 'Missed Playoffs',    priorWins: 78 },
  oak: { record2025: '69-93', finish: 'Missed Playoffs',    priorWins: 69 },
  // ── National League ───────────────────────────────────────────────────────
  // NL West
  lad: { record2025: '98-64', finish: 'Won World Series',   priorWins: 98 },
  sd:  { record2025: '82-80', finish: 'Missed Playoffs',    priorWins: 82 },
  sf:  { record2025: '80-82', finish: 'Missed Playoffs',    priorWins: 80 },
  ari: { record2025: '89-73', finish: 'Lost in NLDS',       priorWins: 89 },
  col: { record2025: '62-100', finish: 'Missed Playoffs',   priorWins: 62 },
  // NL East
  atl: { record2025: '89-73', finish: 'Lost in NLDS',       priorWins: 89 },
  nym: { record2025: '89-73', finish: 'Lost in NLCS',       priorWins: 89 },
  phi: { record2025: '95-67', finish: 'Lost in NLDS',       priorWins: 95 },
  was: { record2025: '71-91', finish: 'Missed Playoffs',    priorWins: 71 },
  mia: { record2025: '62-100', finish: 'Missed Playoffs',   priorWins: 62 },
  // NL Central
  mil: { record2025: '93-69', finish: 'Lost in Wild Card',  priorWins: 93 },
  chc: { record2025: '83-79', finish: 'Missed Playoffs',    priorWins: 83 },
  stl: { record2025: '83-79', finish: 'Missed Playoffs',    priorWins: 83 },
  cin: { record2025: '77-85', finish: 'Missed Playoffs',    priorWins: 77 },
  pit: { record2025: '76-86', finish: 'Missed Playoffs',    priorWins: 76 },
};

export function getTeamMeta(slug) {
  return MLB_TEAM_META[slug] || { record2025: '—', finish: '—', priorWins: null };
}
