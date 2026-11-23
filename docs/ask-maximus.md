# Ask Maximus

A chat on the NFL pages (`/nfl/ask`) where a signed-in member asks about picks, lines, matchups, injuries and the record. Built on the blueprint from the Wally project: one agent function, one thread per account, structured answers, policy in code.

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
12. **Fail closed.** Missing key, missing table or `ASK_PAUSED=1`: the page says so and nothing crashes.

## How a turn runs

```
POST /api/ask/chat { text }
  authenticate (Supabase session token)        api/ask/chat.js
  policy.canAsk, limitsFor(plan)               api/_lib/ask/policy.js
  thread.beginTurn  -> cap check, store, history   (SQL: ask_chat_begin)
  agent.reply(...)                             api/_lib/ask/agent.js
     Claude -> read tools -> Claude -> words + display tool
     tools.js reads through connector.js, applies policy, builds cards
     grounding + voice check on the words
  thread.saveReply (text + cards JSON)
  stream: status, text, reset, done | error
```

`reply({ history, text, channel, limits, context, connector, onText, onReset, onStatus, signal })` knows nothing about HTTP. A texting webhook calls it the same way.

## Files

| File | What it holds |
|---|---|
| `api/ask/chat.js` | The web channel: GET thread (`?since=`), POST a turn (streams), DELETE to clear |
| `api/_lib/ask/agent.js` | House rules prompt, the tool loop, the answer checks |
| `api/_lib/ask/tools.js` | Tool definitions and executors. Read tools return quotable facts; display tools take ids |
| `api/_lib/ask/cards.js` | Card builders and the three renderers' shared shape; `asPlainText` (model history), `asTexts` (phone bubbles) |
| `api/_lib/ask/connector.js` | `AskDataConnector` interface and the NFL connector over the existing builders |
| `api/_lib/ask/policy.js` | Plan limits, daily cap, kill switch, which picks a plan may see |
| `api/_lib/ask/thread.js` | `ask_messages` storage |
| `api/_lib/ask/claudeTools.js` | Streaming Messages call with tools and prompt caching |
| `api/_lib/ask/grounding.js` | Number check |
| `docs/ask-maximus-migration.sql` | The table and SQL functions. Run once in Supabase |
| `src/components/ask/` | Chat UI, card components, stream client |
| `src/pages/nfl/NflAsk.jsx` | The page |

## Tools

| Tool | Kind | Reads |
|---|---|---|
| `get_picks` | read | Recommended picks, leans (Pro), picks already in play |
| `get_slate` | read | Every game this week with score and consensus lines |
| `get_game` | read | One matchup: lines, weather, quarterbacks, unit mismatches, schedule spots, injuries, picks on it |
| `get_record` | read | Season and recent record, units, closing-line value, recent results with review notes |
| `get_injuries` | read | One team's report |
| `get_standings` | read | Records, division rank, seed |
| `show_picks`, `show_games`, `show_record` | display | Take ids, build cards, end the turn |

## Plans

Set in `api/_lib/entitlements.js`, mirrored in `src/lib/entitlements.js`.

| | Free | Pro |
|---|---|---|
| Messages a day | 5 | 150 |
| Picks | Top 3 recommended of the week | Every pick and lean |
| Model projection per game | No | Yes |

The free cut is made on the whole week's board, ranked the way the public home page ranks it, so asking again never reveals a different set. Admin accounts get Pro limits.

Note: the NFL picks page itself shows signed-in free members every pick today. Chat is stricter than the page. To match the page, set `askPicksPerAnswer` for free to a large number, or set `ASK_FREE_PICKS`.

## Settings

| Env var | Default | |
|---|---|---|
| `ANTHROPIC_API_KEY` | required | The app's existing key |
| `ASK_MODEL` | `CLAUDE_MODEL`, then `claude-sonnet-5-5` | Model for chat only |
| `ASK_PAUSED` | off | `1` turns chat off for everyone |
| `ASK_FREE_DAILY`, `ASK_PRO_DAILY` | 5, 150 | Messages a day |
| `ASK_FREE_PICKS` | 3 | Picks a free answer may show |

## Turning it on

1. Run `docs/ask-maximus-migration.sql` in the Supabase SQL editor.
2. Confirm `ANTHROPIC_API_KEY` is set for the environment.
3. Open `/nfl/ask`.

Until step 1 is done the page loads and says chat is not switched on.

## Not built yet

- **Texting.** The thread already has `channel` and `external_id` (with a unique index for webhook dedupe) and `asTexts()` lays an answer out as bubbles. What is missing is the Sendblue and Twilio webhooks, phone linking, STOP/START/HELP and short links.
- **Outbound alerts.** Line moves, kickoff and finals. Needs its own opt-in, caps set on the web, quiet hours and a send limit per line.
- **Actions.** Follow a team, save a pick, set an alert. Each goes behind the connector and a policy check before it is offered to the model.
- **Other leagues.** One connector per league; the agent does not change.
- **Bet slip hand-off.** A ticket card with a deep link to the book. Needs age and state checks in `policy.js` first.
