# Full Spectrum Audit: Ask Maximus

**Date**: 2026-11-26
**Mode**: Branch vs Main
**Source**: `claude/ask-maximus` (PR #62) as it stood on Nov 23, against `main` at 1f7c303
**Lenses Run**: 9/10
**Lenses Skipped**: DX Engineer (not a developer tool; no CLI, config surface or API for outside developers)

This audit was run on the Nov 23 version of the branch. The same pass then rebuilt the feature as an embedded web agent, so each finding carries a status: **Fixed** (in this branch now), **Open** (needs the owner), or **Accepted** (known, deliberately left).

---

## Master Verdict: APPROVE WITH CHANGES

The Nov 23 branch was sound in structure (one agent function, cards built on the server from ids, numbers checked against the data) but would not have shipped well: on the default model it streamed nothing and paid for an extra model round on every card answer, it had no way to be turned on for one person first, and nobody could find it or use it without an account. Those are fixed here. What remains cannot be closed from a branch: no answer has ever been produced by a live model, because the API key exists only in Production.

## Verdict by Lens

| # | Lens | Verdict (Nov 23) | Critical | Recommendations | After this pass |
|---|------|------------------|----------|-----------------|-----------------|
| 1 | Design Engineer | APPROVE WITH CHANGES | 1 | 4 | All fixed |
| 2 | UX Engineer | NEEDS REWORK | 3 | 4 | All fixed |
| 3 | Frontend Engineer | APPROVE WITH CHANGES | 0 | 5 | All fixed |
| 4 | Backend Engineer | NEEDS REWORK | 2 | 6 | Fixed; 1 open |
| 5 | Structural Engineer | APPROVE WITH CHANGES | 0 | 3 | 1 fixed, 2 accepted |
| 6 | Repo Maintainer | APPROVE WITH CHANGES | 0 | 3 | All fixed |
| 7 | Production Readiness | NEEDS REWORK | 3 | 5 | 1 fixed, 2 open |
| 8 | DX Engineer | Skipped | | | |
| 9 | Performance Engineer | APPROVE WITH CHANGES | 1 | 3 | All fixed |
| 10 | Accessibility Engineer | APPROVE WITH CHANGES | 0 | 5 | Fixed; 1 open |

## All Critical Issues (Must Fix)

| # | Issue | Lens(es) | File(s) | Impact | Fix | Status |
|---|-------|----------|---------|--------|-----|--------|
| C1 | On `claude-sonnet-5-5`, words the model writes ahead of a tool call come back as thinking, not text. The Nov 23 loop expected "say it, then call the display tool". | Backend, Perf | `api/_lib/ask/agent.js`, `tools.js`, `claudeTools.js` | Every answer with cards needed one more model round to get any words, and nothing streamed until the end. Slower, dearer, and the 50 second deadline was within reach. | Display tools now take the spoken answer as their first field, `say`, streamed as it is written (`eager_input_streaming`). A display call ends the turn. | Fixed |
| C2 | `ANTHROPIC_API_KEY` is set for Production only. | Prod | Vercel env | Preview deployments cannot answer. No real model has ever produced an answer for this feature; everything is tested against a scripted model. | Either add the key to Preview, or test in Production behind the admin-only rollout (C3). | **Open** |
| C3 | No staged rollout. Merging made chat live for every signed-in user. | Prod | `api/_lib/ask/policy.js`, `api/ask/chat.js` | First live test would have been on customers. | `ASK_ROLLOUT=off\|admin\|all`, default `admin`. Until it is `all` the launcher, the tab and the API do not exist for anyone else. | Fixed |
| C4 | Free accounts were limited to three picks per answer. | UX, Backend | `policy.js`, `entitlements.js` | Contradicted the Nov 26 site rule that a free account sees every call. Chat would have shown less than the picks page. | Free accounts see every call. Guests see exactly what the signed-out picks page shows, using the same `freeLeans` function. | Fixed |
| C5 | The only way in was a tab on NFL pages, and it required an account. | UX | `NflSectionTabs.jsx`, `NflAsk.jsx` | Not embedded, no use as a marketing tool, invisible on the landing page. | A launcher on the landing page and every NFL page, in-page "Ask Maximus" buttons, and a guest tier. | Fixed |
| C6 | Reaching the daily limit showed a sentence and nothing to do. | UX | `AskMaximus.jsx` | The moment of highest intent had no next step. | The box is replaced by the right offer: email for a guest, confirm for a guest with a pass, Pro for a free account. | Fixed |
| C7 | `docs/ask-maximus-migration.sql` has not been run in production. | Prod | Supabase | Signed-in chat reports "not switched on" until it is. Guests are unaffected (nothing is stored for them). | Run it once in the SQL editor. It only adds one table and two functions. | **Open** |

## Cross-Cutting Concerns

| Concern | Flagged By | Root Cause | Unified Fix | Status |
|---------|-----------|------------|-------------|--------|
| The feature assumed a model behaviour that the default model does not have | Backend, Perf, Prod | Written against the older "text then tool" pattern and never run against the live API | `say` inside the display tool; low effort; layered fallback if the API rejects a setting | Fixed in code, **unproven live** |
| Three plans, one code path | UX, Backend, Structural | Plan differences were scattered constants | `limitsFor(tier)` in `policy.js` is the one place: questions a day, which picks, saved or not, book shopping | Fixed |
| Chat styles depended on the page they sat in | Design, Frontend, A11y | Colour tokens came from `home.module.css .page` | The chat, panel and launcher set their own tokens, so they render the same over the light NFL pages and the dark landing page | Fixed |
| Things only a phone can prove | UX, A11y, Prod | No device in the loop | Sized from `visualViewport`, full screen while typing | **Open**: check on an iPhone and an Android phone |

## All Recommendations

| # | Recommendation | Lens | File(s) | Status |
|---|---------------|------|---------|--------|
| R1 | Keep model effort low for chat; default was high | Backend, Perf | `claudeTools.js` (`ASK_EFFORT`, default `low`) | Fixed |
| R2 | A reply cut off mid tool call must not run the half-written call, and that turn's thinking must be dropped before retrying | Backend | `agent.js` | Fixed |
| R3 | Do not wait longer for a picks board to build than the turn has left | Backend | `connector.js` (`BOARD_BUILD_WAIT_MS` 12s) | Fixed |
| R4 | `callJsonHandler` treated an error response as data | Backend | `connector.js` | Fixed |
| R5 | The number check flagged figures that were only on a card | Backend | `agent.js` (cards are now a source) | Fixed |
| R6 | Old prices in the thread could be quoted as current | Backend | `cards.js` `asPlainText` marks them as shown earlier | Fixed |
| R7 | Guest abuse and cost: limit per device, per network address and in total, and fail closed | Prod | `guestLimit.js` | Fixed |
| R8 | The thread jumped to the bottom while the reader was reading | UX, Frontend | `AskThread.jsx`: a new question goes to the top, nothing scrolls while words arrive | Fixed |
| R9 | `field-sizing: content` is not in Safari | Frontend | `AskThread.jsx` sizes the box in script | Fixed |
| R10 | The whole thread was a live region, so a screen reader read every streamed word | A11y | One polite status line: what Maximus is doing, then the finished answer | Fixed |
| R11 | Chat code loaded with the app | Perf | Panel and thread are lazy; the launcher is the only eager code | Fixed |
| R12 | Chips under 40px tall | A11y, Design | `ask.module.css` | Fixed |
| R13 | Connector imports two route handlers directly (scorecard, season model) | Structural | `connector.js` | Accepted: moving that logic into `_lib` is a wider refactor |
| R14 | No "stop" button while an answer is being written | UX | `AskThread.jsx` | Accepted for v1 |
| R15 | Streaming with `res.write` is new to this codebase | Prod | `api/ask/chat.js` | **Open**: verify on Vercel on first live test |
| R16 | NFL only; NBA picks share the board shape | Structural | `connector.js` | Accepted: next step is a second connector |

---

# Lens Reports

## 1. Design Engineer

**Verdict**: APPROVE WITH CHANGES

Files: `ask.module.css` (all visual), `AskCards.jsx`, `AskMaximus.jsx`.

| # | Issue | Impact | Fix | Status |
|---|-------|--------|-----|--------|
| D1 (critical) | Tokens (`--ink`, `--hair`) undefined outside the NFL page wrapper | Any use outside `/nfl/ask` rendered unstyled text | Tokens set on the chat's own roots | Fixed |
| D2 | One card style for every answer | Prices, a team and news had no form | Six card types; the pick stays the one loud element | Fixed |
| D3 | No motion rules | | Panel and peek animate transform and opacity only, 200ms, off under reduced motion | Fixed |
| D4 | Focus rings missing on new controls | | One `:focus-visible` rule covers every control | Fixed |
| D5 | Dark mode | The app's NFL pages are light only; the panel is a light surface by design, including over the dark landing page | Accepted |

**Visual state coverage**

| Element | Hover | Focus | Active | Disabled | Loading | Empty | Error | Over dark page |
|---|---|---|---|---|---|---|---|---|
| Launcher puck | yes | yes | yes | n/a | n/a | n/a | hidden if off | yes |
| Peek line | n/a | yes | n/a | n/a | n/a | n/a | n/a | yes |
| Composer | n/a | yes | n/a | yes | yes | n/a | notice above | yes |
| Chips | yes | yes | n/a | yes | n/a | n/a | n/a | yes |
| Cards | link hover | yes | n/a | n/a | "working" line | "no pick" card | notice | yes |
| Email gate | n/a | yes | n/a | yes | "Sending" | n/a | inline error | yes |

Token fidelity: PASS. State coverage: PASS. Dark parity: N/A (light only by design). Animation: PASS. Consistency: PASS.

## 2. UX Engineer

**Verdict**: NEEDS REWORK on Nov 23; issues C4, C5, C6 above.

**Journey, as rebuilt**

| Step | Guest | Free account | Pro | Clear? |
|---|---|---|---|---|
| Notices it | Mascot in the corner; one line after 4.5s tied to the page ("I like 2 bets for Week 13. Want them?") | Same | Same | OK |
| Opens it | Half-height sheet on a phone, docked panel on desktop; page stays visible | Same | Same | OK |
| First answer | Words, then cards. Recommended picks plus the strongest leans up to three | Every call | Every call | OK |
| Sees the limit of the tier | A locked card counting what else is on the board, with one email field | Asking to shop books returns the consensus and a Pro card | n/a | OK |
| Runs out | 3 questions (6 after email). Box becomes the email form | 10 a day. Box becomes the Pro offer | 150 a day | OK |
| Comes back | Thread lasts for the browser session | Thread saved across devices | Same | OK |

Other findings: no stop button (R14, accepted); a failed turn refunds the question and says so (was already right); the peek shows at most three times a visit and never after it is dismissed.

Discoverability: PASS. Flow completeness: PASS. Error recovery: PASS. Feedback: PASS. Consistency: PASS (email capture reuses the site's one-field form and guest pass).

## 3. Frontend Engineer

**Verdict**: APPROVE WITH CHANGES

| # | Issue | Fix | Status |
|---|-------|-----|--------|
| F1 | All state lived in one page component; nothing else could open chat | `AskProvider` holds one thread for the app; `useAsk()` opens it from anywhere | Fixed |
| F2 | State reset on sign-in was done in an effect | Inner state component keyed by user id | Fixed |
| F3 | Scroll-to-bottom on every token | R8 | Fixed |
| F4 | `field-sizing` | R9 | Fixed |
| F5 | Hooks and components exported from one file (fast refresh rule) | Contexts and hooks in `askState.js` | Fixed |

Render path: streamed words update only the last list item; cards are memoised per message; the launcher re-renders on route change and status only. Bundle: launcher eager (small), `AskPanel` and `AskThread` in their own chunks. Types: plain JS, as the rest of the repo.

## 4. Backend Engineer (Node serverless)

**Verdict**: NEEDS REWORK on Nov 23; C1 and C4 above, plus R1 to R6.

**Error paths**

| Failure | What the user sees | Question refunded? |
|---|---|---|
| Model API error or timeout | "Something went wrong on our side. Your question was not counted; send it again." (or "That took too long…") | Yes |
| Model rejects a setting (400/404) | Nothing: retried without the setting, then on the fallback model | n/a |
| Answer contains a number not in the data | Nothing: one rewrite, then a plain safe answer | No (an answer was given) |
| Picks board not built yet | Maximus says the week's board is not ready | No (an answer was given) |
| Counter store (KV) down | Guests: "Maximus is busy right now." Accounts unaffected | n/a |
| Database down | Accounts: not switched on. Guests unaffected | n/a |

**Resources**: one 50s abort signal for the whole turn; no timers or listeners outlive the request; guest counters expire with the Eastern day.

Error handling: PASS. Concurrency: PASS (`ask_chat_begin` takes the turn atomically; guest counters are atomic increments). Resource management: PASS. Wire format: PASS (newline-delimited JSON events). Open: none of this has met the live API (C2).

## 5. Structural Engineer

**Verdict**: APPROVE WITH CHANGES

```
AskLauncher / AskAbout / NflAsk page
        └─ AskProvider (one thread) ─ askClient ─ /api/ask/status, /api/ask/chat
                                                     └─ agent.reply()  (channel-agnostic)
                                                          ├─ tools (15) ─ connector ─ picks board, games, odds, record, season model, injuries, news
                                                          ├─ cards (built on the server from ids)
                                                          ├─ policy (tiers, limits, rollout)
                                                          └─ grounding (number and voice checks)
```

Dependency direction is right: the agent knows nothing about HTTP or React; the route knows nothing about the model. `policy.js` imports `freeLeans` from the picks page helpers so chat and page cannot drift (required adding `.js` to two imports). R13 and R16 are the two accepted items. Change propagation: a new league is one connector; a new channel (texting) is one route calling `reply()`.

## 6. Repo Maintainer

**Verdict**: APPROVE WITH CHANGES

| Convention | Status | Notes |
|---|---|---|
| File placement | PASS | Server logic in `api/_lib/ask`, routes in `api/ask`, UI in `src/components/ask` |
| Naming | PASS | |
| Dead code | PASS | `AskMaximus.jsx` deleted, not left beside its replacement |
| Lint | PASS | New and touched files are clean; the repo's existing lint debt is unchanged |
| Tests | PASS | 171 tests for this feature; 1,882 pass in the whole suite |
| Docs | PASS | `docs/ask-maximus.md`, `docs/analytics.md` updated |
| Reuse | PASS | Guest pass, one-field email capture, `ConfirmEmailBar`, `startProCheckout`, `freeLeans` are the site's own |

## 7. Production Readiness

**Verdict**: NEEDS REWORK on Nov 23; C2, C3, C7.

| Scenario | What fails | User impact | Handled? |
|---|---|---|---|
| Merged, nothing else done | Nothing | None: `ASK_ROLLOUT` defaults to `admin` | Yes |
| Migration not run | Saved threads | Owner sees "not switched on" when signed in | Yes, by message |
| Model outage | Answers | Clear message, question refunded | Yes |
| A guest scripts the endpoint | Cost | Capped per device, per address (15) and overall (500 a day) | Yes |
| Bad answer in the wild | Trust | `ASK_PAUSED=1` or `ASK_ROLLOUT=off` removes it everywhere without a deploy | Yes |
| Streaming buffered by the platform | Words arrive at once | Still correct, just not live | **Unverified** (R15) |

Rollback: the migration is additive; reverting the code leaves one unused table. Observability: `ask_answered`, `ask_cap_hit`, `ask_failed` on the server with model, rounds, tools, corrections and duration.

## 8. DX Engineer

**Skipped**: not a developer tool.

## 9. Performance Engineer

**Verdict**: APPROVE WITH CHANGES

| Resource | Nov 23 | Now |
|---|---|---|
| Model rounds per card answer | 3 (read, show, then speak) | 2 (read, then show-and-speak) |
| Time to first word | End of turn | While the answer is being written |
| Effort setting | high (default) | low |
| Prompt | Rules resent uncached | Rules block cached |
| Code loaded on every page | n/a (page only) | Launcher only; panel and thread on first open |
| Network on page load | n/a | One small status request, cached 60s when open to all |
| Listeners | none | `visualViewport` and Escape, only while the panel is open |

Memory: a guest's thread is capped (last six turns are sent); an account's thread is paged from the server. Long sessions: PASS.

## 10. Accessibility Engineer

**Verdict**: APPROVE WITH CHANGES

| Step | Action | Focus | Announced | OK? |
|---|---|---|---|---|
| 1 | Tab to launcher | Puck | "Ask Maximus, button" | Yes |
| 2 | Enter | Desktop: the box. Phone: the panel title | "Maximus, dialog" | Yes |
| 3 | Type, Enter | Stays in the box | "Pulling the board." then the full answer once | Yes |
| 4 | Tab through cards | Links and chips in order | Card text | Yes |
| 5 | Escape | Back to the launcher | | Yes |

The panel is a non-modal dialog (the page behind stays usable), so there is no focus trap by design; on a phone at full height the page behind is scroll-locked. Contrast on white: ink 17:1, secondary text 8.6:1, muted text 5.1:1, link 5.1:1, green 5.4:1. Reduced motion respected. Open: the sheet's drag handle is pointer only; the expand and close buttons do the same job from the keyboard. Untested with VoiceOver on a real phone.

Screen reader: PASS. Keyboard: PASS. Focus: PASS. Contrast: PASS. Motion: PASS.
