# Ask Maximus

A conversational agent inside Maximus Sports. Anyone on the landing page or an NFL page can ask about this week's picks, prices, matchups, injuries, teams, news and the record, and gets a short answer with cards built from the same data the pages use. Built on the blueprint from the Wally project: one agent function, one thread per account, structured answers, policy in code. The audit behind this version is `docs/ask-maximus-full-audit-v1.md`.

## The rules

These are the non-negotiables. Change them here first, then in code.

1. **Claude supplies judgement, never facts.** Every team, line, price, book, score and percentage comes from a tool result. The model picks which rows answer the question and writes one or two sentences.
2. **Cards are built by the server.** Display tools take ids. `cards.js` copies every value from the data row, so the model cannot invent or mistype one.
3. **The words are checked before they stand.** Any number in the model's sentence that is not in a tool result sends the answer back for one rewrite; a second miss is replaced with a safe line (`grounding.js`, `agent.js`). The same check blocks hype phrases from `src/features/contentStudio/voice.js`.
4. **Policy is code, not a prompt.** Plan limits, the daily cap and the kill switch live in `policy.js`. A pick the plan does not include is never sent to the model.
5. **Limits cannot be changed from chat.** Only env vars and the plan change them.
6. **Maximus never places a bet, holds money or advises a stake.** It shows the pick and the price.
7. **Every source sits behind the connector.** The agent imports `getConnector()` and nothing provider-specific.
8. **Chat never writes the public record.** The connector calls the same board builder as the picks page, so it can lock nothing that page would not.
9. **One deadline per turn.** A single `AbortSignal` (50s) covers every Claude call inside the 60s function limit.
10. **A failed turn costs the member nothing.** The question is deleted, handed back to the composer and not counted.
11. **Maximus says it is an AI,** and drops the persona for anyone who sounds distressed about gambling.
12. **Fail closed.** Missing key, missing table, counters unreachable or rollout off: chat says so or stays hidden, and nothing crashes.
13. **A guest sees what the signed-out site shows, no more.** Chat is never a way around the picks page.

## How a turn runs

```
POST /api/ask/chat { text, context: { page }, history? }
  who is asking: session token, or a guest device id     api/ask/chat.js
  policy.canUse (rollout), canAsk, limitsFor(tier)        api/_lib/ask/policy.js
  take the turn: accounts  -> thread.beginTurn (SQL: ask_chat_begin)
                 guests    -> guestLimit.takeGuestTurn (KV)
  agent.reply(...)                                        api/_lib/ask/agent.js
     Claude -> read tools -> Claude -> one display tool whose first field, `say`, is the spoken answer
     `say` is streamed to the reader as it is written; the display call ends the turn
     tools.js reads through connector.js, applies the tier, builds cards
     number and voice check on the words
  accounts: thread.saveReply (text + cards JSON); guests: nothing stored
  stream: status, text, reset, done | error
```

`reply({ history, text, channel, limits, context, connector, onText, onReset, onStatus, signal })` knows nothing about HTTP. A texting webhook calls it the same way.

Why `say` lives inside the display tool: on the current model, anything written ahead of a tool call comes back as thinking rather than text, so "speak, then show" would cost an extra model round and stream nothing.

## Files

| File | What it holds |
|---|---|
| `api/ask/chat.js` | The web channel: GET thread (`?since=`), POST a turn (streams), DELETE to clear |
| `api/_lib/ask/agent.js` | House rules prompt, the tool loop, the answer checks |
| `api/_lib/ask/tools.js` | Tool definitions and executors. Read tools return quotable facts; display tools take ids |
| `api/_lib/ask/cards.js` | Card builders and the three renderers' shared shape; `asPlainText` (model history), `asTexts` (phone bubbles) |
| `api/_lib/ask/connector.js` | `AskDataConnector` interface and the NFL connector over the existing builders |
| `api/_lib/ask/policy.js` | Tiers, questions a day, rollout switch, which picks a tier may see |
| `api/_lib/ask/guestLimit.js` | Guest counters in KV |
| `api/ask/status.js` | Whether chat is on for this visitor, and the week's headline numbers for the launcher |
| `api/_lib/ask/thread.js` | `ask_messages` storage |
| `api/_lib/ask/claudeTools.js` | Streaming Messages call with tools and prompt caching |
| `api/_lib/ask/grounding.js` | Number check |
| `docs/ask-maximus-migration.sql` | The table and SQL functions. Run once in Supabase |
| `src/components/ask/` | `AskProvider` (one thread), `AskLauncher`, `AskPanel`, `AskThread`, `AskCards`, `AskAbout`, `AskEmailGate`, `askContext.js` (what to say on which page), `askClient.js` |
| `src/pages/nfl/NflAsk.jsx` | The full page (`/ask`, `/nfl/ask`) |

## Tools

| Tool | Kind | What it gives |
|---|---|---|
| `get_picks` | read | Recommended picks, leans, picks already in play (limited to what the tier may see) |
| `get_slate` | read | The week's games, lines and scores |
| `get_game` | read | One matchup: lines, the model's projection, the biggest mismatch, quarterbacks, weather |
| `shop_prices` | read, Pro | Every book's spread, total and moneyline for a game, and the best number on each side |
| `get_record` | read | Graded results: season, recent, by market, closing-line value |
| `get_team` | read | Record, standing, power rank, projected wins, playoff and title odds |
| `get_injuries` | read | A team's injury report |
| `get_standings` | read | Division and conference tables |
| `get_news` | read | Headlines, league-wide or for a team |
| `show_picks`, `show_games`, `show_prices`, `show_record`, `show_team`, `show_news` | display | Take `say` plus ids; the server builds the cards |

## Where it lives

Ask Maximus is part of the app, not a page off to the side.

- **Launcher** (`AskLauncher.jsx`): the mascot in the bottom corner of the landing page and every NFL page. After a few seconds it may say one line about the page being read ("Raiders at Chiefs. Want my read?"). It shows at most three times a visit, goes away on its own, and stays away once dismissed. It never opens itself.
- **Panel** (`AskPanel.jsx`): on a phone, a sheet that rises to about two thirds of the screen with the page still visible above it, and goes full screen only when the visitor types or drags it up. On a wider screen, a docked panel in the corner.
- **In-page buttons** (`AskAbout.jsx`): "Ask Maximus why" on a pick, "Ask Maximus about this game" on a matchup, and one on each team page. They open the panel and send the question.
- **Full page**: `/ask` and `/nfl/ask`, the same conversation with more room. `/ask?q=...` puts a question in the box.

`AskProvider` holds one conversation for the whole app, so the panel and the page show the same thread. Maximus is told which page the question came from (`context.page`), so "this game" means the game on screen.

## Plans

One function, `limitsFor(tier)` in `policy.js`, decides all of it.

| | No account | Free account | Pro |
|---|---|---|---|
| Questions a day | 3 (6 after giving an email) | 10 | 150 |
| Picks shown | What the signed-out picks page shows: recommended picks, topped up to three calls | Every call | Every call |
| Conversation | Kept in the browser for the session | Saved, on every device | Saved, on every device |
| Shop every book for the best price | No | No (Pro offer shown) | Yes |
| When questions run out | Email form | Pro offer | Resets at midnight Eastern |

A guest never sees a pick the signed-out page hides: both use `freeLeans()`. When more calls exist, the answer ends with a locked card that counts them and holds a one-field email form (the site's own guest pass).

Guest limits live in KV (`guestLimit.js`): per device, per network address (15 a day) and in total (500 a day). If KV is down, guests are told Maximus is busy; nothing is given away uncounted. A failed answer gives the question back.

## Settings

| Env var | Default | |
|---|---|---|
| `ANTHROPIC_API_KEY` | required | The app's existing key. **Set for Production only today.** |
| `ASK_ROLLOUT` | `admin` | `off`, `admin` (admin emails only) or `all` |
| `ASK_PAUSED` | off | `1` is the same as `ASK_ROLLOUT=off` |
| `ASK_MODEL` | `CLAUDE_MODEL`, then `claude-sonnet-5-5` | Model for chat only |
| `ASK_EFFORT` | `low` | Model effort for chat |
| `ASK_GUEST_DAILY`, `ASK_GUEST_PASS_DAILY`, `ASK_FREE_DAILY`, `ASK_PRO_DAILY` | 3, 6, 10, 150 | Questions a day |
| `ASK_GUEST_IP_DAILY`, `ASK_GUEST_BUDGET` | 15, 500 | Guest ceilings per address and in total |

## Turning it on

1. Merge. Nothing changes for visitors: the default is `ASK_ROLLOUT=admin`.
2. Run `docs/ask-maximus-migration.sql` in the Supabase SQL editor (one table, two functions; additive).
3. Sign in as an admin on the live site. The launcher appears for you only. Ask real questions: this is the first time a live model answers.
4. Set `ASK_ROLLOUT=all` in Vercel and redeploy.

To pull it: `ASK_ROLLOUT=off`. The launcher, tab, page and API all go quiet.

## Not built yet

- **Texting.** The thread already has `channel` and `external_id` (with a unique index for webhook dedupe) and `asTexts()` lays an answer out as bubbles. What is missing is the Sendblue and Twilio webhooks, phone linking, STOP/START/HELP and short links.
- **Outbound alerts.** Line moves, kickoff and finals. Needs its own opt-in, caps set on the web, quiet hours and a send limit per line.
- **Actions.** Follow a team, save a pick, set an alert. Each goes behind the connector and a policy check before it is offered to the model.
- **Other leagues.** NFL only today. One connector per league; the agent does not change. NBA picks already share the board shape.
- **A stop button** while an answer is being written.
- **Bet slip hand-off.** A ticket card with a deep link to the book. Needs age and state checks in `policy.js` first.
