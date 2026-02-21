# Maximus Sports — March Madness Intelligence Hub

College basketball intelligence: daily reports, game previews, upset alerts, and team news.

## News (No API Keys)

Team headlines come from **Google News RSS** — free, no sign-up or API key required. The serverless function at `/api/news/team/:slug` fetches and parses the feed for each team using search terms from `src/data/teams.js`.

## Setup

```bash
npm install
```

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
2. Deploy — no environment variables needed for news

Vercel builds the frontend and deploys `/api/news/team/[slug]`. Team pages fetch headlines from Google News RSS via the serverless endpoint.

## Tech Stack

- Vite + React
- React Router
- Vercel Serverless Functions (Google News RSS proxy)
- Plain CSS / CSS modules
