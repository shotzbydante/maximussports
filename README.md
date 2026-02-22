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
npx vercel dev
```

## Deploy to Vercel

1. Import the GitHub repo: [vercel.com/new](https://vercel.com/new)
2. Add environment variable (optional, for odds):
   - **Name:** `ODDS_API_KEY`
   - **Value:** your Odds API key from [the-odds-api.com](https://the-odds-api.com/)
3. Deploy

News works without API keys. Odds (spread, O/U) require `ODDS_API_KEY`.

## Tech Stack

- Vite + React
- React Router
- Vercel Serverless Functions (Google News RSS proxy)
- Plain CSS / CSS modules
