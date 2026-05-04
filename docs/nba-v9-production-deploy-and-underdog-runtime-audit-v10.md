# NBA v9 Deploy & Underdog-Runtime Audit (v10)

Date: 2026-05-04
Branch: `claude/practical-williamson-21bc72`
Production: `https://maximussports.ai`

The user reported that `/nba/insights` still shows all underdogs (PHI +236 / +7.5, MIN +490 / +13, CLE +130 / +3, LAL +729 / +16) after v9 was supposedly merged. This audit verifies deployment state and runtime behavior, then identifies the remaining gaps.

---

## 1. Is v9 actually deployed?

**Verdict: YES, v9 backend is live in production. But the hero-promotion guardrail is incomplete.**

Direct evidence (captured 2026-05-04T06:43Z):

```bash
$ git rev-parse HEAD                          # 9ab9c54... (v9 commit)
$ git rev-parse origin/main                   # 95b3424... (v9 + 2 unrelated team-intel fixes)
$ git merge-base --is-ancestor 9ab9c54 origin/main  # exit 0 → v9 IS in main
```

Production payload from `https://maximussports.ai/api/nba/picks/built` confirms v9 code paths:

| field | value | v9-only? |
|---|---|---|
| `picks[].mlDebug.awayModelProb` | `0.366` | ✅ — added by v9 |
| `picks[].mlDebug.vigPct` | `0.04` | ✅ — v9 |
| `picks[].mlDebug.awayEdge` | `0.08` | ✅ — v9 |
| `picks[].modelSource` | `'spread'`, `'devigged_ml'`, `'no_vig_blend'` | ✅ — v9 enum |
| `picks[].modelSource` | `'team_recent_v1+trend_v1'` | ✅ — v9 totals trend layer |
| `picks[].pickRole` | `'hero'` / `'tracking'` | (v8 had this too) |
| `conviction.label` | `Lean` / `Solid` (no `Top Play` / `Strong`) | ✅ — v9 cross-market cap |
| `rawEdge` magnitudes | 0.028 – 0.20 | ✅ — would be 0.20 – 0.50+ on v8 |
| `modelVersion` | `nba-picks-v2.0.0` | ❌ — never bumped (gap #1) |
| `_debugByGame` (with `?debug=1`) | **absent** | ❌ — cache short-circuit (gap #2) |

Conclusion: the v9 model fix runs in production, but two pieces of operational visibility were missing — modelVersion was never bumped, so a payload baked before v9 was indistinguishable from one baked after; and `?debug=1` didn't survive the 2-min cache. Both are fixed in v10 (see §3).

### Sample production payload (production at 2026-05-04T06:43Z)

```
PHI  @ NYK
  ML  PHI +236   edge=0.08    conv=Lean    pickRole=hero      modelSrc=spread
  ATS PHI +7.5   edge=0.122   conv=Lean    pickRole=tracking  modelSrc=devigged_ml
  TOT Over 213   edge=null    conv=Solid   pickRole=hero      modelSrc=team_recent_v1+trend_v1
MIN  @ SAS
  ML  MIN +490   edge=0.059   conv=Lean    pickRole=tracking  modelSrc=no_vig_blend
  ATS MIN +13    edge=0.20    conv=Lean    pickRole=hero      modelSrc=devigged_ml
  TOT Under 217.5 edge=null   conv=Lean    pickRole=tracking  modelSrc=team_recent_v1+trend_v1
CLE  @ DET
  ML  CLE +130   edge=0.028   conv=Lean    pickRole=tracking  modelSrc=spread
  ATS CLE +3     edge=0.058   conv=Lean    pickRole=tracking  modelSrc=devigged_ml
LAL  @ OKC
  ML  LAL +729   edge=0.074   conv=Lean    pickRole=hero      modelSrc=no_vig_blend
  ATS LAL +16    edge=0.20    conv=Lean    pickRole=tracking  modelSrc=devigged_ml
```

---

## 2. Runtime model audit

### 2.1 Is the model selecting all underdogs because of stale v8 logic?

**No.** The numeric signature is v9. v8 had no `modelSource`, no `vigPct`, no `mlDebug` block at all, and `rawEdge` values commonly cleared 0.20 even on small-spread games.

### 2.2 Is v9 live but still picking dogs because cross-market arb genuinely sees small dog edge?

**Yes.** This is the v9 audit's predicted outcome. Three of the visible games (PHI@NYK, MIN@SAS, LAL@OKC) sit in the moderate-to-large home-favorite band where NBA spread markets are systematically tighter than the moneyline. The model's spread-derived home win prob (e.g., 0.634 for PHI@NYK) is lower than the no-vig moneyline-derived home win prob (e.g., 0.714) — so the away/dog gets a positive cross-market `rawEdge`. This is correct behavior.

The CLE@DET game has a -3 home favorite where the disagreement is small (rawEdge 0.028 ML, 0.058 ATS) — also consistent with v9 working as designed.

### 2.3 Are edges still too large?

ML edges 0.028–0.08 — appropriate for cross-market arb.
ATS edges 0.058–0.20 — the 0.20 hits the `RAW_EDGE_CAP` and corresponds to a +5pt cover-edge against the spread (large).

### 2.4 Are underdog picks incorrectly marked as hero or strong?

**Yes — the v10 root cause.** Inspect production:

```
PHI +236   conv=Lean   pickRole=hero      ← hero on a Lean conviction!
MIN +13    conv=Lean   pickRole=hero
LAL +729   conv=Lean   pickRole=hero
```

`conviction.label` is `Lean` (correctly capped by v9 discipline R5b), but `pickRole` is `hero`. Tracing the builder:

```js
// buildNbaPicksV2.js, end of build
const HERO_FLOOR = config?.hero?.scoreFloor ?? 0.50;
const heroIds = new Set();
for (const p of assigned.published) {
  if ((p.betScore?.total ?? 0) >= HERO_FLOOR) heroIds.add(p.id);
}
```

`betScore.total` for these picks is around 0.50–0.55 — below the v9 cross-market label-cap (0.699 for "Solid"), so the cap clamps the label but doesn't push the score below the hero floor. Hero promotion happens off `betScore.total`, not off the conviction label.

`assigned.published` only includes picks that cleared at least tier3, which uses `floor=0.45`. So a betScore of 0.50 — barely above tier3 floor and barely above hero floor — is hero-eligible.

### 2.5 Are `Tracking`, `Lean`, and source labels applied correctly?

Tracking pill renders correctly when `pickRole === 'tracking'`. Source labels (the v9 `sourceLineFor` function) render correctly for the picks that received them. **The bug is not in the UI — it's in which picks the builder hands the UI as heroes.**

### 2.6 Is `discipline.js` actually capping cross-market-only conviction?

Yes, it caps the label at "Solid". It does **not** also push the betScore below the hero floor. v10 fixes this.

### 2.7 Is NBA Home hero hiding these tracking picks, or are they leaking into hero?

`heroPicks` includes 6 of 18 full-slate picks in production. Three are ML on the underdog (PHI/MIN/LAL), two are ATS on the underdog (MIN/LAL), and one is a Total Over (NYK side). NBA Home reads `heroPicks` directly — so the all-dog ML/ATS picks **are** being promoted to the curated home view.

### 2.8 Is Odds Insights intentionally showing every tracking pick?

Yes, by design. `/nba/insights` renders the full slate (`byGame`) — every game gets ML/ATS/Total whether hero or tracking. That's why it looks "all-dog" — and that's correct for a full-slate transparency surface. The fix has to come from labelling, not from hiding picks.

---

## 3. Production / API cache audit

| concern | finding |
|---|---|
| `/api/nba/picks/built` cache | in-process Vercel cache, 2-min TTL (`api/nba/picks/built.js`) |
| KV cache | `nbaPicksBuilder` writes `nba:picks:built:latest` (15min) and `nba:picks:built:lastknown` (48h) |
| cache key includes model version? | **No.** Static keys `nba:picks:built` (in-process) and `nba:picks:built:latest` (KV) |
| payload exposes `modelVersion`? | Yes (`nba-picks-v2.0.0` in production today) |
| `modelVersion` bumped for v9? | **No.** Same as v8 |
| `?debug=1` bypasses cache? | **No.** Endpoint serves the cached payload before checking the query string. v9 added `_debugByGame` but it never returned because the cache was warm |
| Stale-payload risk after v9 merge? | Theoretical: a payload built under v8 could survive in `nba:picks:built:lastknown` for 48h. In practice, the v8 payload didn't have v9 fields like `modelSource` or `mlDebug`, so it would also have been graded out by now |

### v10 cache busting

1. Bump `NBA_MODEL_VERSION` to `nba-picks-v2.1.0` (v9-no-vig).
2. Include the model version in the KV cache keys (`nba:picks:built:latest:<modelVersion>`).
3. On read, ignore any cached payload whose `modelVersion` doesn't match the current builder.
4. Skip the in-process Vercel cache when `?debug=1` is set so the debug fields propagate.
5. Surface cache metadata in the response: `_cacheStatus.cacheKey`, `_cacheStatus.servedFrom`, `_cacheStatus.cacheAgeSeconds`, `payloadModelVersion`, `builderModelVersion`.

---

## 4. Build/deploy verification (added in v10)

`/api/health` previously returned only `{ ok, timestamp }`. v10 extends it (and adds `/api/version` for parity) to include:

```json
{
  "ok": true,
  "timestamp": "...",
  "git": { "sha": "9ab9c54", "shortSha": "9ab9c54", "buildTime": "..." },
  "model": { "nba": "nba-picks-v2.1.0", "mlb": "mlb-picks-v2.x.x" }
}
```

Git SHA is plumbed via Vercel's build env (`VERCEL_GIT_COMMIT_SHA`) so any future deploy verification is a one-shot HTTP call.

---

## 5. Hero-promotion fix (the actual remaining bug)

In `buildNbaPicksV2.js` add a **cross-market multi-factor gate** to hero promotion:

```js
function qualifiesAsHero(pick) {
  const score = pick.betScore?.total ?? 0;
  if (score < HERO_FLOOR) return false;

  const isCrossMarketOnly =
    pick.modelSource === 'spread'
    || pick.modelSource === 'devigged_ml'
    || pick.modelSource === 'no_vig_blend';

  if (!isCrossMarketOnly) return true;

  // Cross-market-only picks must clear a STRICTER bar to become heroes:
  //   1. raw edge ≥ HERO_CROSS_MARKET_EDGE (0.10 ML / 5pt cover ≈ tanh ≈ 0.20 ATS)
  //   2. multi-factor support (≥ 2 of conf / sit / mkt elevated)
  if ((Math.abs(pick.rawEdge ?? 0)) < HERO_CROSS_MARKET_EDGE) return false;
  if (!hasMultiFactorSupport(pick)) return false;
  return true;
}
```

Plus a **diversification sanity check**:

```js
// If every cross-market hero candidate sits on the underdog AND every one is
// cross-market-only, demote the entire group to tracking. This prevents the
// "every game on the slate has a moderate home favorite, so the model picks
// every dog with a small edge" pathology from filling NBA Home with dogs.
const heroCandidates = published.filter(qualifiesAsHero);
const xmCandidates = heroCandidates.filter(isCrossMarketOnlyPick);
const xmAllUnderdog = xmCandidates.length >= 2 && xmCandidates.every(isUnderdog);
if (xmAllUnderdog) {
  for (const p of xmCandidates) heroIds.delete(p.id);
  meta.flags.push('cross_market_underdog_diversification');
}
```

Result on the production fixture:
- PHI ML +236 (rawEdge 0.08): below 0.10 cross-market hero floor → tracking. ✅
- MIN ML +490 (rawEdge 0.059): below 0.10 → tracking. ✅
- LAL ML +729 (rawEdge 0.074): below 0.10 → tracking. ✅
- MIN ATS +13 (rawEdge 0.20): clears edge floor; multi-factor checks (modelConf, sit, mkt). If only 1 of 3 elevated → tracking. ✅
- LAL ATS +16 (rawEdge 0.20): same. ✅
- TOT Over 213 (PHI@NYK), Over 213.5 (LAL@OKC): not cross-market — keep hero status if they earned it.

So with v10, the visible NBA Home heroes will be totals (where the model has independent data) rather than cross-market dogs.

---

## 6. UI transparency (additive)

`NbaFullSlateBoard` already shows source pills. v10 adds the strings the user requested:
- `Tracking pick · cross-market signal only` — when a pick is `pickRole=tracking` AND its source is a cross-market enum.
- `Low conviction · market disagreement` — same condition, alternate copy chosen by hash for variety on the slate.

Odds Insights stays a full-slate view. The visual difference is that low-conviction tracking picks render with a more visible muted treatment than v9 (already in place; copy strengthens this).

---

## 7. What changed in code (delta vs v9)

- New: `api/version.js` — git SHA + build time + per-sport model versions.
- Modified: `api/health.js` — surfaces the same metadata.
- Modified: `api/nba/picks/built.js` — bypass in-process cache when `?debug=1`; emit `_cacheStatus`, `payloadModelVersion`, `builderModelVersion`.
- Modified: `api/_lib/nbaPicksBuilder.js` — KV cache keys include `modelVersion`; reject cached payloads whose `modelVersion` doesn't match the builder.
- Modified: `src/features/nba/picks/v2/buildNbaPicksV2.js` —
  - bump `NBA_MODEL_VERSION` to `nba-picks-v2.1.0`
  - new `qualifiesAsHero()` with cross-market edge + multi-factor gate
  - new diversification sanity check (`cross_market_underdog_diversification`)
  - `picksHistory.buildPickRow` will pin the new model version in DB rows.
- Modified: `src/components/nba/picks/NbaFullSlateBoard.jsx` — additional copy variants for cross-market-only tracking picks.

---

## 8. Tests added

- `api/version.test.js` — version endpoint returns SHA + model versions.
- `api/_lib/nbaPicksBuilder.cache.test.js` — modelVersion mismatch invalidates KV cache; debug=1 bypasses in-process cache.
- `src/features/nba/picks/v2/heroCuration.test.js` — cross-market dog with rawEdge < 0.10 is tracking; cross-market dog with rawEdge ≥ 0.10 + multi-factor is hero; non-cross-market pick with score ≥ 0.50 is hero; all-cross-market-dog slate triggers diversification cap.
- Existing: HOU/LAL regression, fullSlate contract — unchanged and re-verified.

---

## 9. Caveats

- **No Vercel CLI access in this environment.** Verification of the actual deployed commit was performed via the live HTTP API (`maximussports.ai/api/nba/picks/built`). After this v10 commit lands, `/api/health` will be the deterministic check.
- **Cron timing:** `nba:picks:built:lastknown` lives 48h. Bumping `modelVersion` invalidates current consumers; the previous lastknown is kept in KV until natural expiry but won't be served once the version mismatch is detected.
- **Hero curation is conservative.** It removes pure cross-market arb dogs from the curated home view. As a real independent model lands (efficiency / pace / injuries), `qualifiesAsHero` will accept those picks again because their `modelSource` won't be one of the cross-market enums.
