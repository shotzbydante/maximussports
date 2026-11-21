# Maximus Sports — March Madness Intelligence Hub

College basketball intelligence: daily reports, game previews, upset alerts, team news, and live odds.

## News (No API Keys)

Team headlines come from **Google News RSS** — free, no sign-up or API key required. The serverless function at `/api/news/team/:slug` fetches and parses the feed for each team using search terms from `src/data/teams.js`.

## Odds API (Optional)

Live betting odds (spreads, totals, moneyline) are powered by [The Odds API](https://the-odds-api.com/). Free tier available.

1. Sign up at [the-odds-api.com](https://the-odds-api.com/).
2. Copy your API key.
3. Add `ODDS_API_KEY` to Vercel project settings or a local `.env`:

   ```
   ODDS_API_KEY=your_api_key_here
   ```

4. The `/api/odds` serverless route proxies requests and caches responses for ~5 minutes.

Without `ODDS_API_KEY`, odds sections will gracefully degrade (no spread/O/U displayed).

## Claude (AI summaries and briefings)

All AI-written text in the app (the Home synopsis, sport briefings, team insights, the narrative used in emails, and reel copy) is generated with the Claude API.

1. Create an API key in the [Claude Console](https://platform.claude.com/).
2. Add `ANTHROPIC_API_KEY` to your Vercel project (Settings → Environment Variables, type Secret) or to a local `.env` when using `vercel dev`:

   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

3. Every route calls Claude through `api/_lib/claude.js`. The default model is `claude-haiku-5-5`; set `CLAUDE_MODEL` to use a different one. Summaries are cached, so most page loads do not call the API.
4. If `ANTHROPIC_API_KEY` is missing, the routes return their non-AI fallback and the Home banner shows the static welcome message.

## Setup

```bash
npm install
```

## Team Logos

Populate logos (optional): fetches from ESPN CDN and generates fallbacks for unmatched teams.

```bash
npm run fetch-logos
```

Output: `public/logos/<slug>.png` (ESPN) or `public/logos/<slug>.svg` (monogram fallback). Flags: `--force` replace existing; `--fallbacks-only` generate SVGs only (no fetch).

## Run Locally

```bash
npm run dev
```

Frontend: http://localhost:5173

For local API (serverless functions):

```bash
vercel login    # required before first use
npx vercel dev
```

News API (`/api/news/aggregate`, `/api/news/team/:slug`) works in local dev when using `vercel dev`.

## Deploy to Vercel

1. Import the GitHub repo: [vercel.com/new](https://vercel.com/new)
2. Add environment variables as needed:
   - **Odds (optional):** `ODDS_API_KEY` — from [the-odds-api.com](https://the-odds-api.com/) for spread/O/U.
   - **AI summaries (optional):** `ANTHROPIC_API_KEY` — from the [Claude Console](https://platform.claude.com/) for the synopsis, briefings and team insights.
3. Deploy

News works without API keys. Odds require `ODDS_API_KEY`. AI summaries use `ANTHROPIC_API_KEY` when set; otherwise the static welcome text is shown.

## Tech Stack

- Vite + React
- React Router
- Vercel Serverless Functions (Google News RSS proxy)
- Plain CSS / CSS modules

