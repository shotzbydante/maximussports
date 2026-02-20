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

## Run

```bash
# Terminal 1: Vite dev server (frontend)
npm run dev

# Terminal 2: Reddit proxy (backend)
npm run dev:server
```

Or run both at once:

```bash
npm run dev:all
```

Frontend: http://localhost:5173  
Reddit proxy: http://localhost:3001

## Tech Stack

- Vite + React
- React Router
- Express (Reddit API proxy)
- Plain CSS / CSS modules
