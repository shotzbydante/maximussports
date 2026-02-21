# Maximus Sports — March Madness Intelligence Hub

College basketball intelligence: daily reports, game previews, upset alerts, and Reddit discussion.

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` and add your Reddit API credentials from [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps):

- `REDDIT_CLIENT_ID`
- `REDDIT_CLIENT_SECRET`
- `REDDIT_USER_AGENT` (e.g. `MaximusSports/1.0`)

## Run Locally

```bash
npm run dev
```

Frontend: http://localhost:5173

For local Reddit API (serverless function):

```bash
npx vercel dev
```

## Deploy to Vercel

1. Import the GitHub repo into Vercel: [vercel.com/new](https://vercel.com/new)
2. Add environment variables in Project Settings → Environment Variables:
   - `REDDIT_CLIENT_ID`
   - `REDDIT_CLIENT_SECRET`
   - `REDDIT_USER_AGENT`
3. Deploy

Vercel will build the frontend and deploy the `/api/reddit/team/[slug]` serverless function. The frontend calls `/api/reddit/team/:slug` (same origin).

## Tech Stack

- Vite + React
- React Router
- Vercel Serverless Functions (Reddit API proxy)
- Plain CSS / CSS modules
