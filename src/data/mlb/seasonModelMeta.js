/**
 * MLB Season Model — structured metadata, weights, stages, and sources.
 *
 * Powers the "How the model works" UI section dynamically.
 * When inputs/weights change in seasonModel.js, update this file
 * so the explainer auto-reflects the current methodology.
 */

export const MODEL_META = {
  name: 'Maximus MLB Season Model',
  version: '2.1',
  lastUpdated: 'March 2026',
  objective: 'Estimate median regular-season win totals for all 30 MLB teams using a transparent, multi-factor framework.',

  stages: [
    {
      name: 'Historical Baseline',
      description: 'Start from Pythagorean expected wins (run-differential-based) rather than raw win-loss record, then regress toward league average to account for natural reversion.',
      weight: 0.32,
    },
    {
      name: 'Multi-Year Trend',
      description: 'Blend with a three-year weighted trend (55/30/15 weighting, most recent heaviest) to capture sustained organizational trajectories beyond single-season noise.',
      weight: 0.22,
    },
    {
      name: 'Roster Quality',
      description: 'Evaluate offensive quality (top-of-lineup star power + lineup depth), rotation quality (frontline aces + pitching depth), bullpen quality, aging curves, injury risk, and prospect upside — each scored separately.',
      weight: 0.16,
    },
    {
      name: 'Manager & Continuity',
      description: 'Small but real adjustment for managerial track record and organizational continuity — new managers face a transition drag, elite veterans add stability.',
      weight: 0.04,
    },
    {
      name: 'Division & Schedule',
      description: 'Adjust for division strength and schedule difficulty — teams in loaded divisions face a tougher path to accumulated wins.',
      weight: 0.04,
    },
    {
      name: 'Market Prior Blend',
      description: 'Anchor output toward the consensus market win total to incorporate collective-intelligence pricing. Championship odds serve as a secondary contextual signal.',
      weight: 0.22,
    },
  ],

  inputGroups: [
    {
      name: 'Historical',
      inputs: ['Prior season wins', 'Pythagorean wins', '3-year win trend', 'Overperformance correction'],
    },
    {
      name: 'Offense',
      inputs: ['Top-of-lineup score', 'Lineup depth score'],
    },
    {
      name: 'Pitching',
      inputs: ['Frontline rotation score', 'Rotation depth score'],
    },
    {
      name: 'Bullpen',
      inputs: ['Bullpen quality', 'Bullpen volatility'],
    },
    {
      name: 'Roster Profile',
      inputs: ['Aging curve', 'Injury risk', 'Prospect upside', 'Roster concentration risk', 'Continuity score'],
    },
    {
      name: 'Context',
      inputs: ['Manager quality', 'Manager continuity', 'Division strength', 'Schedule difficulty', 'Division contender density'],
    },
    {
      name: 'Market',
      inputs: ['Market win total', 'Championship odds', 'Playoff probability'],
    },
  ],

  confidenceFactors: [
    'Roster continuity', 'Injury risk', 'Rotation depth', 'Lineup depth',
    'Bullpen volatility', 'Roster concentration', 'Market disagreement',
    'Division difficulty', 'Manager stability',
  ],

  bandFactors: [
    'Continuity', 'Injury risk', 'Prospect upside', 'Rotation depth',
    'Lineup depth', 'Bullpen volatility', 'Roster concentration',
    'Frontline talent', 'Manager stability',
  ],

  sources: [
    { name: 'MLB historical standings', status: 'curated', note: 'Curated from public records' },
    { name: 'ESPN team metadata', status: 'live', note: 'Team logos and identifiers via ESPN CDN' },
    { name: 'Consensus market odds', status: 'curated', note: 'Hand-curated from public preseason lines' },
    { name: 'Offseason roster moves', status: 'curated', note: 'Scored from public transaction reports' },
    { name: 'Run differential data', status: 'curated', note: 'Pythagorean wins derived from public box scores' },
    // TODO: Wire live feeds for these:
    // { name: 'MLB Stats API', status: 'live', note: 'Real-time standings and statistics' },
    // { name: 'Odds API', status: 'live', note: 'Live market win totals and championship odds' },
    // { name: 'FanGraphs projections', status: 'live', note: 'Player-level depth chart data' },
  ],

  disclaimer: 'Projections estimate median regular-season outcomes based on available inputs — they are not guarantees. Win ranges reflect upside and downside uncertainty. Model outputs evolve as data quality and integration depth improve over time.',

  futureNote: 'Current version uses curated local inputs informed by historical and market reference data. Future versions will update automatically with live league and market feeds.',
};
