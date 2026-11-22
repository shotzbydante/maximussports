# The Maximus voice

How Maximus Sports sounds on Instagram, in captions, on slides and anywhere else it speaks in public. The rules that can be checked by a machine are enforced in `src/features/contentStudio/voice.js`; the rest is for whoever writes or approves a post.

## Who Maximus is

A sports-betting model with a sense of humor. The sharp friend in the group chat who has done the math, shows it, and tells you when the answer is "don't bet this."

Three things make the account worth following, and every post should show at least one:

1. **The number.** A price, a probability, a projection. Never a vibe.
2. **The receipt.** What we said before the game and what happened after, posted the same way whether we won or lost.
3. **The pass.** Most games are not worth a bet. Saying so is the most credible thing a betting account can do.

## How it sounds

- Short sentences. One idea each.
- Plain words. "Fair price", "the price beats fair", "we pass". Explain a term the first time it appears.
- Dry, not loud. The joke is about the market or about us, never about the reader.
- Numbers carry the confidence. Adjectives do not.
- Misses are stated before anyone asks.

| Say | Do not say |
| --- | --- |
| Under 40.5 at -105. Fair is -116. | Hammer the under!! |
| We passed on 35 of 38 markets. | Three locks for Sunday. |
| We missed IND @ HOU by 14 points. | Tough beat, bad luck. |
| The market says 51%. We say 54%. | This one can't lose. |
| No bet. The price is fair. | Stay away (no reason given). |

## Hard rules (enforced in code)

A caption that breaks one of these fails its readiness check in the studio, and the publish endpoints reject it.

- **No promise of an outcome.** Blocked phrases: lock of the day/week, mortal lock, guaranteed, can't lose, sure thing, free money, easy money, risk-free, bet the house, no-brainer, never lose, never miss. "Locked" as in "picks are locked before kickoff" is fine.
- **Every caption ends with the responsible-gaming line:** `21+. For entertainment only. Gambling problem? Call 1-800-GAMBLER.` It is appended automatically if a builder leaves it out.
- **Numbers come from the data, never from a writer.** Captions are built from the same payload the slides render. The optional Claude rewrite (`/api/content-studio/voice-pass`) may change wording only; it is discarded if it adds, changes or drops a number, drops the site link or the 21+ line, or uses a blocked phrase.

## Rules a person has to hold

- Every pick names its price and its book. A pick without a price cannot be graded.
- Never delete a losing post. Never post a win without the season record somewhere in the caption or the carousel.
- Do not tease the reader for losing, for betting favorites, or for anything else. Tease the line.
- Do not address problem gambling as a joke.
- No "DM for picks", no paid-group language, no affiliate codes inside pick captions.
- One emoji at most in a hook. None in the numbers.

## Hooks

The first line decides whether anyone reads the second. It should be a specific claim with a number in it.

- "12 games. 3 bets." (the pass as the hook)
- "The market says 51%. We say 54%." (the gap)
- "Week 11: 2-1. Here is the one we got wrong." (the receipt)
- "Chiefs: 98% to make the playoffs, +970 to win it all." (a team, for its fans)

## The weekly rhythm (NFL)

| Day | Post | Why that day |
| --- | --- | --- |
| Tuesday | Receipts | The week is graded. The record goes first. |
| Wednesday | Team cards | Midweek belongs to fans. Post the teams whose odds moved. |
| Thursday | Game breakdown | One game tonight. |
| Friday | Maximus's Picks | Picks are locked, with price and reasons. |
| Saturday | Explainer | Teach one idea people will save. |
| Sunday morning | The Board | Every game, every line. |
| Sunday night | What We Got Wrong | Own the misses while people are still talking. |
| Monday | Game breakdown | One game left. |

The studio shows the day's suggested post above the controls (`src/features/nfl/contentStudio/weeklyPlan.js`).

## Links

Use the tracked short links so Instagram traffic can be told apart in analytics:

- `maximussports.ai/ig` for the bio
- `maximussports.ai/ig/record` for the public record
- `maximussports.ai/ig/picks` for this week's picks
