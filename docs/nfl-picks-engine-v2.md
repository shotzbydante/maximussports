# NFL picks engine v2

Model `nfl-picks-v2.0.0`, config `nfl-picks-v2-2026-11-21a`. Replaces `nfl-picks-v1.0.0`.

## What a pick is now

A bet is **recommended** only when one book's posted line and price beat the market's own fair number by a fixed margin of expected value, counted at the real price with pushes.

- **Fair number.** Every book's line and both prices are converted to the margin or total they imply; the median across books is the consensus (`v2/market.js`). Five books minimum.
- **Expected value.** Win, push and lose probabilities come from a margin curve re-weighted by how often each final margin has occurred since 2015, so the hook through 3 or 7 is priced at what it is worth (`v2/distribution.js`). Moneylines are priced from the moneyline market, never from the spread.
- **Tiers** are fixed: tier 1 at +4.0% EV, tier 2 at +2.5%, tier 3 at +1.5%. A pick's tier does not depend on the rest of the slate.
- **One side bet per game.** Spread and moneyline are one opinion; the better-priced is the pick.
- **Holds.** A starting quarterback listed questionable or doubtful, a missing injury report, a stale or implausible price, a game more than 72 hours out, or a moneyline outside -450/+400 keeps the game on tracking. The reason is shown.

Everything else is a **tracking pick**: the model's lean on each market, locked a day before kickoff and graded, never promoted.

## Why the ratings do not move the fair number

`node scripts/nfl/backtest.mjs --data <dir> --download` replays 2011 to 2025, rating each week only on games already played, against nflverse closing lines.

| Model | Games | Side MAE (close) | Side weight | Total MAE (close) | Total weight |
| --- | --- | --- | --- | --- | --- |
| v2 ratings + quarterbacks | 4,096 | 10.21 (10.01) | 0.04 ± 0.08 | 10.54 (10.44) | 0.13 ± 0.09 |
| v2 without quarterbacks | 4,096 | 10.30 (10.01) | -0.02 ± 0.07 | 10.60 (10.44) | 0.04 ± 0.08 |
| v1-style (points, this season only) | 3,855 | 10.52 (10.01) | -0.03 ± 0.06 | 10.98 (10.45) | -0.11 ± 0.06 |

"Weight" is the slope of (result − close) on (model − close): the share of the model's disagreement with the closing line that shows up in results. Zero means the line was right.

- v2 is a better forecast than v1 (0.3 points of MAE on sides, 0.4 on totals) and the quarterback layer is worth about 0.1 of that.
- Neither model's disagreement with the close predicts results. When v2 and the close differ, the model's side covered 50.0%, 50.2%, 49.3% and 54.1% of the time for gaps of 0–1.5, 1.5–3, 3–5 and 5+ points (the last bucket is 185 games).
- v1's total leans ran the wrong way: weight -0.11 ± 0.06.

So `modelWeight` defaults to `{ side: 0, total: 0 }`. It is a config value. If the engine's own closing-line record ever shows the leans beating the close, raise it and the fair number moves.

The backtest is against closing lines. It cannot test picks locked earlier in the week, or the price-edge picks, because there is no history of per-book prices. Closing-line value on the live record is the test for those.

## Ratings (`v2/ratings.js`, `v2/qb.js`, `v2/project.js`)

| | v1 | v2 |
| --- | --- | --- |
| Inputs | Final scores, this season | Final scores and offensive EPA (30% weight), this season and two before it, decayed by week |
| Prior | League average for every team | The same team last season, fading as games arrive |
| Shrinkage | `games / (games + 4)` after the solve | Ridge inside the solve |
| Quarterback | None | EPA per play, shrunk to replacement; points added or removed when this week's starter is not who produced the rating |
| Rest | Score bonus | 0.6 points off a bye |
| Totals environment | None | Roof +1.7, outdoors -0.8, wind -0.3 per mph above 10, deep cold -2.0 |
| Home field | 1.7 | 1.8 |

Parameters were tuned on 2011–2019 and checked on 2020–2025.

**Unit grades** (`v2/units.js`): pass offense, run offense, pass protection, pass defense, run defense and pass rush on a 0–100 scale (50 average), from nflverse EPA, sacks and quarterback hits. They are results per play, not film grades. Each grade carries a `source`.

## Situations (`v2/situations.js`)

Measured on 6,232 games, 2003–2025, against closing lines (`--situations`).

| Spot | Record ATS | Since 2018 | Moves a pick? |
| --- | --- | --- | --- |
| West-coast road team, kickoff by 1:05 PM ET | 204-209 (49.4%) | 76-68 (52.8%) | No |
| Division road underdog | 733-640 (53.4%) | 250-211 (54.2%) | No |
| Off a bye against normal rest | 353-339 (51.0%) | 108-119 (47.6%) | No |
| Thursday road team | 138-143 (49.1%) | 65-65 (50.0%) | No |
| Favorite of 6+ with a division game next | 283-291 (49.3%) | 101-107 (48.6%) | No |
| Favorite of 3+ after an upset win | 229-247 (48.1%) | 73-67 (52.1%) | No |
| First-year head coach vs a 48-game veteran | 488-503 (49.2%) | 191-211 (47.5%) | No |
| Under in sustained wind of 15+ mph | 312-235 (57.0%) | 91-68 (57.2%) | Yes: fair total −1.2 |

Coach career cover margin predicts future cover margin with slope 0.39 ± 0.17 over the full period and 0.11 ± 0.27 since 2018. The spots that matter to the game are already in the line. They are shown on each game with their record; only wind earns a weight. Division road underdogs are the nearest miss and worth re-measuring each season. Unders also ran 56.6% in 10–15 mph wind from 2011 to 2025; the threshold stays at 15 until that holds up on forecast wind.

## Locking, closing lines, units

- **Lock at first publish** (`v2/locks.js`, `api/_lib/nflPicksStore.js`). A recommended pick is stored once with its line, price and book. The board shows that ticket until kickoff and it is the ticket graded. Partial unique indexes stop two serverless instances locking the same market.
- **Model leans** are locked once, 24 hours before kickoff.
- **Scheduled builds** (`api/cron/nfl/build-picks.js`, every ten minutes). The handler builds hourly inside the lock window, every eight minutes in the 25 minutes before a kickoff, and every six hours otherwise.
- **Closing line.** Each build overwrites one row per game in `nfl_line_snapshots`; the last one before kickoff is the close.
- **Grading** (`api/cron/nfl/settle-yesterday.js`) writes units at the stored price and closing-line value: the expected value of the locked ticket against the closing consensus, and points against the closing line.
- **Writes happen in production only.** Preview deployments share the production database.

## Data sources and health

| Feed | Used for | If it fails |
| --- | --- | --- |
| ESPN scoreboard | Schedule, status, week, roof flag | No board; last snapshot is served |
| ESPN injuries | Quarterback status | Every game held to tracking |
| ESPN standings, team schedule | Team pages, season page | Those pages degrade |
| The Odds API (`regions=us`) | Per-book lines and prices | Last pull is served; prices then read as stale |
| nflverse (CC BY 4.0) | Ratings, EPA, quarterbacks, starters, coaches, rest | Leans and context drop out; quarterback guard cannot clear a game, so nothing is recommended |
| Google Weather API or National Weather Service | Kickoff wind and temperature | No wind adjustment |

`GET /api/nfl/health` calls each ESPN endpoint live, checks the fields the app reads, and reports nflverse freshness, the last odds pull and remaining Odds API quota, the weather provider, the model's status and whether the migration has been applied.

**Odds API budget.** A pull costs three credits. The cron makes roughly 190 pulls a week (about 2,500 credits a month) on top of page traffic, which now shares one pull across instances through KV. `NFL_BUILD_INTERVAL_MIN` (default 60) widens the hourly interval.

**Weather.** Set `GOOGLE_WEATHER_API_KEY` (or `GOOGLE_MAPS_API_KEY`) with the Weather API enabled to use Google's hourly forecast; without it the engine uses api.weather.gov, which is free and covers US stadiums only.

## Position-group grades from PFF

PFF Pro ($199.99 a year) includes an API. Its terms of use (last updated March 24, 2026; sections 1.2, 1.5 and 14) limit that API to personal, non-commercial use and prohibit using API data in a betting, fantasy or advisory product offered to others, hosting an application where others can reach it, and scraping. Maximus Sports is that kind of product, so the consumer API is not a route. Grades for a commercial product need a data license from PFF's enterprise business (part of Teamworks since March 2026).

The engine is ready for one: every unit grade carries a `source`, and `buildUnitGrades` output is keyed by team and unit. A licensed feed replaces grades unit by unit. Before it is given weight it should go through the same backtest as everything else.

## Google Cloud and Maps Platform sources

| Source | Would close | Notes |
| --- | --- | --- |
| Weather API (`weather.googleapis.com`) | Kickoff wind, temperature, precipitation | Wired in; needs a key. Hourly out to 240 hours, global, so it covers international games the National Weather Service cannot |
| BigQuery | A proper backtest warehouse | Load nflverse play-by-play and the engine's own line snapshots; per-book price history is the missing data for testing price-edge picks |
| BigQuery public NOAA datasets | Historical game-day weather | Checks the wind result against station data instead of nflverse's field |
| WeatherNext on BigQuery / Earth Engine | Forecast-versus-actual studies | Research, not serving |
| Vertex AI Gemini with Google Search grounding | Injury and depth-chart news between ESPN updates | Could clear or raise the quarterback hold sooner; needs evaluation before it gates a pick |
| Routes API, Time Zone API, Elevation API | Travel distance, body clock, altitude | The travel spots tested here show no edge against the close, so low priority |

## Migration

`docs/nfl-picks-v2-migration.sql` (applied as `nfl_picks_engine_v2`). Additive: lock and closing-line columns on `picks`, `units` on `pick_results`, `nfl_line_snapshots`, and `by_pick_role` and `performance` on `picks_daily_scorecards`.

`by_pick_role` fixes an older fault in every sport: the shared scorecard builder has written that field since the hero/tracking split, the column never existed, and each scorecard carrying it was rejected. Only empty "no picks" rows were being saved.

## Not done

- Tracking picks on the board are the current lean; the graded lean is the one locked a day out. They can differ if a quarterback changes inside the last day.
- No per-book price history, so price-edge picks cannot be backtested, only measured forward.
- The NFL emails, Content Studio slides and Instagram autopost still do not exist.
