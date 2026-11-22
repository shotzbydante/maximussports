/**
 * Post-game review, storage and feeds.
 *
 * Before kickoff: each board build saves what the engine believed about
 * every upcoming game (saveGameContexts). The last save before kickoff is
 * the one the review reads.
 *
 * After the final: reviewNflSlate() reviews every graded pick on a slate
 * (src/features/nfl/picks/v2/review.js), grades each engine input against
 * the closing line, and stores the lot in picks_audit_artifacts, one row
 * per slate date:
 *
 *   summary             this slate's pick reviews and input results
 *   signal_attribution  the season-to-date ledger as of this slate
 *   recommended_deltas  always empty: a review never changes the engine
 */

import { getJson, setJson } from '../_globalCache.js';
import { getSupabaseAdmin } from './supabaseAdmin.js';
import { writeAuditArtifact } from './picksHistory.js';
import { getNflPicks, getLineSnapshots } from './nflPicksStore.js';
import { getNflTalent } from './nflTalent.js';
import { getNflTeamBySlug } from '../../src/sports/nfl/teams.js';
import { talentMatchups } from '../../src/features/nfl/picks/v2/talent.js';
import {
  gameContext, gameFacts, summaryState, reviewPick, reviewSignals, buildLedger, summarizeReviews,
} from '../../src/features/nfl/picks/v2/review.js';

export const REVIEW_VERSION = 'nfl-review-1';
const ESPN_SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary';
const FETCH_TIMEOUT_MS = 8000;
const CONTEXT_TTL_SEC = 21 * 24 * 3600;
/** After this long a game is reviewed with whatever box score there is, or none. */
const BOX_SCORE_WAIT_HOURS = 8;
const ctxKey = (gameId) => `nfl:review:context:${gameId}`;
const resultOf = (p) => (Array.isArray(p?.pick_results) ? p.pick_results[0] : p?.pick_results);
const isGraded = (p) => ['won', 'lost', 'push'].includes(resultOf(p)?.status);

/** Save the pre-game record for every game that has not kicked off. Best effort. */
export async function saveGameContexts(byGame = [], { now = new Date() } = {}) {
  let saved = 0;
  await Promise.all(byGame.map(async (g) => {
    const kick = Date.parse(g?.startTime || '');
    if (!Number.isFinite(kick) || kick <= now.getTime()) return;
    const ctx = gameContext(g, { now });
    if (!ctx) return;
    await setJson(ctxKey(ctx.gameId), ctx, { exSeconds: CONTEXT_TTL_SEC });
    saved += 1;
  })).catch(() => {});
  return { saved };
}

export async function getGameContext(gameId) {
  try { return (await getJson(ctxKey(String(gameId)))) || null; } catch { return null; }
}

/** ESPN's game summary (box score, scoring plays). Null when it cannot be read. */
export async function fetchGameSummary(gameId) {
  try {
    const r = await fetch(`${ESPN_SUMMARY}?event=${encodeURIComponent(gameId)}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

/** The season a slate date belongs to: January and February games count for the year before. */
export function seasonStart(slateDate) {
  const [y, m] = String(slateDate).split('-').map(Number);
  return `${m <= 7 ? y - 1 : y}-08-01`;
}

/** Stored review rows for a range of slate dates, oldest first. */
export async function getReviewArtifacts({ from, to }) {
  let sb;
  try { sb = getSupabaseAdmin(); } catch { return []; }
  try {
    const { data, error } = await sb
      .from('picks_audit_artifacts')
      .select('slate_date, summary, signal_attribution, created_at')
      .eq('sport', 'nfl')
      .gte('slate_date', from)
      .lte('slate_date', to)
      .order('slate_date', { ascending: true })
      .limit(400);
    if (error) return [];
    return (data || []).filter((r) => r?.summary?.kind === 'post_game_review');
  } catch { return []; }
}

/** Every stored review and input result in a range, flattened. */
export function flattenArtifacts(rows = []) {
  const reviews = [], signals = [];
  for (const row of rows) {
    reviews.push(...(row.summary?.reviews || []));
    signals.push(...(row.summary?.signals || []));
  }
  return { reviews, signals };
}

/** The season-to-date ledger, read from storage. */
export async function getReviewLedger({ to, from = seasonStart(to) }) {
  const rows = await getReviewArtifacts({ from, to });
  const { reviews, signals } = flattenArtifacts(rows);
  return { from, to, slates: rows.length, ledger: buildLedger({ reviews, signals }), reviews, signals };
}

/** Review notes keyed by pick id, for the results table. */
export async function getReviewNotes({ from, to }) {
  const out = new Map();
  for (const row of await getReviewArtifacts({ from, to })) {
    for (const r of row.summary?.reviews || []) {
      out.set(r.pickId, {
        note: r.note || null, verdict: r.verdict || null, by: r.by ?? null,
        closeness: r.closeness || null, luck: r.play?.luck || null,
        missed: (r.missed || []).map((m) => m.key),
      });
    }
  }
  return out;
}

/**
 * Review one slate. Only picks that already have a final result are
 * reviewed; run settleNflSlate() first.
 *
 * @param {object} args
 * @param {string} args.slateDate
 * @param {boolean} [args.force]  re-review picks that already have a review
 * @param {Function} [args.loadSummary] injected in tests
 * @param {number} [args.now]
 */
export async function reviewNflSlate({ slateDate, force = false, loadSummary = fetchGameSummary, now = Date.now() }) {
  const stored = await getNflPicks({ from: slateDate });
  if (!stored.ok) return { ok: false, slateDate, error: stored.error };
  const graded = stored.picks.filter(isGraded);
  if (graded.length === 0) return { ok: true, slateDate, reviewed: 0, note: 'nothing graded yet' };

  const existing = (await getReviewArtifacts({ from: slateDate, to: slateDate }))[0] || null;
  const have = new Map((existing?.summary?.reviews || []).map((r) => [r.pickId, r]));
  const wanted = force ? graded : graded.filter((p) => !have.has(p.id));
  if (wanted.length === 0) return { ok: true, slateDate, reviewed: 0, total: have.size, note: 'already reviewed' };

  const wantedIds = [...new Set(wanted.map((p) => String(p.game_id)))];
  const [closes, talent] = await Promise.all([getLineSnapshots(wantedIds), getNflTalent().catch(() => null)]);
  const perGame = new Map();
  const waiting = [];
  await Promise.all(wantedIds.map(async (gameId) => {
    const sample = wanted.find((p) => String(p.game_id) === gameId);
    const home = getNflTeamBySlug(sample.home_team_slug)?.abbrev || null;
    const away = getNflTeamBySlug(sample.away_team_slug)?.abbrev || null;
    const [saved, summary] = await Promise.all([getGameContext(gameId), loadSummary(gameId)]);
    let context = saved;
    if (!context && home && away) {
      // No pre-game record (the game kicked off before reviews existed):
      // roster talent is the one input that can still be rebuilt.
      const t = talent ? talentMatchups({ home, away, talent }) : null;
      context = {
        gameId, partial: true, week: null, startTime: sample.start_time || null, home, away,
        talent: t ? { leansTo: t.leansTo || null, netHome: t.netHome ?? null } : null, spots: [],
      };
    }
    // A summary that is not the finished game is not used. The game waits
    // for the next run, until it has waited long enough to go without one.
    const res = resultOf(sample);
    const state = summaryState(summary, { home: Number(res.final_home_score), away: Number(res.final_away_score) });
    const hoursSince = (now - Date.parse(sample.start_time || '')) / 3_600_000;
    if (state !== 'final' && !force && !(hoursSince >= BOX_SCORE_WAIT_HOURS)) { waiting.push(gameId); return; }
    perGame.set(gameId, { home, away, context, facts: state === 'final' ? gameFacts(summary) : { ok: false }, close: closes.get(gameId) || null });
  }));
  const gameIds = wantedIds.filter((id) => perGame.has(id));
  const todo = wanted.filter((p) => perGame.has(String(p.game_id)));
  if (todo.length === 0) return { ok: true, slateDate, reviewed: 0, total: have.size, waiting: waiting.length, note: 'box scores not final yet' };

  const reviews = [];
  for (const p of todo) {
    const g = perGame.get(String(p.game_id));
    const r = reviewPick({ pick: p, close: g.close, context: g.context, facts: g.facts, teams: { home: g.home, away: g.away } });
    if (r) reviews.push(r);
  }
  const signals = [];
  for (const gameId of gameIds) {
    const g = perGame.get(gameId);
    const res = resultOf(todo.find((p) => String(p.game_id) === gameId));
    signals.push(...reviewSignals({
      context: g.context, close: g.close,
      final: { home: Number(res.final_home_score), away: Number(res.final_away_score) },
    }));
  }

  const done = new Set(reviews.map((r) => r.pickId));
  const redone = new Set(gameIds);
  const allReviews = [...[...have.values()].filter((r) => !done.has(r.pickId)), ...reviews];
  const allSignals = [...(existing?.summary?.signals || []).filter((s) => !redone.has(String(s.gameId))), ...signals];

  // The ledger covers the season up to and including this slate.
  const earlier = flattenArtifacts(await getReviewArtifacts({ from: seasonStart(slateDate), to: slateDate })
    .then((rows) => rows.filter((r) => r.slate_date !== slateDate)));
  const ledger = buildLedger({ reviews: [...earlier.reviews, ...allReviews], signals: [...earlier.signals, ...allSignals] });

  const saved = await writeAuditArtifact({
    sport: 'nfl',
    slate_date: slateDate,
    summary: {
      kind: 'post_game_review',
      version: REVIEW_VERSION,
      reviewedAt: new Date().toISOString(),
      sampleSize: allReviews.length,
      counts: summarizeReviews(allReviews),
      boxScores: gameIds.filter((id) => perGame.get(id).facts?.ok).length,
      reviews: allReviews,
      signals: allSignals,
    },
    signal_attribution: { asOf: slateDate, ...ledger },
    recommended_deltas: {},
  });

  return {
    ok: !!saved, slateDate,
    reviewed: reviews.length, total: allReviews.length, games: gameIds.length, waiting: waiting.length,
    boxScores: gameIds.filter((id) => perGame.get(id).facts?.ok).length,
    partialContext: gameIds.filter((id) => perGame.get(id).context?.partial).length,
    counts: summarizeReviews(allReviews),
    findings: ledger.findings,
  };
}
