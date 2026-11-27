# Maximus Sports — Analytics Quick Start

## Overview

Analytics are powered by **GA4** (Google Analytics 4) and **PostHog**. A thin wrapper at `src/analytics/index.js` abstracts both providers with a single consistent API. All tracking is privacy-safe and non-blocking.

**Vercel Analytics** can be enabled separately via the Vercel Dashboard (no code changes needed).

---

## Environment Variables

Set in `.env.local` (local dev) or Vercel project environment variables (production):

| Variable | Required | Description |
|---|---|---|
| `VITE_GA4_ID` | No | GA4 measurement ID, e.g. `G-XXXXXXX`. If absent, GA4 is disabled. |
| `VITE_POSTHOG_KEY` | No | PostHog project key, e.g. `phc_xxxxxxxxx`. |
| `VITE_POSTHOG_HOST` | No | PostHog ingest host. Defaults to `https://app.posthog.com`. Use EU cloud: `https://eu.posthog.com`. |
| `VITE_ANALYTICS_ENABLED` | No | Set to `"false"` to disable all analytics (e.g. staging/QA). Defaults to enabled. |

```
# .env.local
VITE_GA4_ID=G-XXXXXXX
VITE_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxx
VITE_POSTHOG_HOST=https://app.posthog.com
VITE_ANALYTICS_ENABLED=true
```

---

## Debug Mode

Append `?debugAnalytics=1` to any URL. All events and pageviews are logged to the browser console:

```
[Analytics] ▶ team_view { session_id: "...", vw: 1440, vh: 900, device: "desktop", team_slug: "duke-blue-devils", … }
[Analytics] ▶ $pageview /teams/duke-blue-devils { session_id: "...", pathname: "/teams/duke-blue-devils" }
```

Events still route to GA4 and PostHog in debug mode.

---

## How It Works

1. `initAnalytics()` is called at app start (`main.jsx`) — returns immediately (non-blocking).
2. GA4 script is injected dynamically via `<script async>`.
3. PostHog is loaded via dynamic `import()` during browser idle time (`requestIdleCallback`).
4. `AnalyticsRouteListener` in `App.jsx` fires `pageview()` on every client-side navigation.
5. All events are safe — never throw, never block rendering.

### Privacy Guarantees

- **No IP addresses** are collected or stored in client events.
- **No user-agent fingerprinting.** Context props include only: viewport size, device category (mobile/tablet/desktop), and session ID.
- **Session ID** — generated via `crypto.randomUUID()`, stored in `sessionStorage` (resets when tab closes). Never persisted to `localStorage` as a user identifier.
- PostHog `autocapture` is **disabled** (only named manual events).
- GA4 `send_page_view` is **disabled** at config level (we fire manually).

---

## API Reference

```js
import { track, pageview, identify, setUserProperties } from './analytics/index';

// Track any event
track('event_name', { key: 'value' });

// Pageview (called automatically by AnalyticsRouteListener)
pageview('/teams/duke-blue-devils');

// Identify user (future auth; currently anonymous)
identify('user-123', { plan: 'pro' });
```

---

## Event Taxonomy

### Session / Navigation
| Event | Properties | Fired when |
|---|---|---|
| `session_start` | — | Once per browser session (tab lifetime) |
| `page_view` | `pathname` | Every route change |

### Home
| Event | Properties | Fired when |
|---|---|---|
| `home_view` | — | Home page mounts |
| `scores_view_more_click` | `hidden_count` | "View more" expanded in Today's Scores |
| `preview_team_click` | `team_slug` | Duke preview "View team →" clicked |
| `pinned_team_add` | `team_slug`, `method` | Team pinned (picker/quick_chip) |
| `pinned_team_remove` | `team_slug`, `method` | Team unpinned |

### Team Pages
| Event | Properties | Fired when |
|---|---|---|
| `team_view` | `team_slug`, `team_name`, `conference`, `tier` | Team page loads |
| `team_summary_refresh` | `team_slug` | Insight "Refresh" button clicked |
| `team_debug_panel_view` | `team_slug` | `?debugTeam=1` debug panel visible |

### News / Intel Feed
| Event | Properties | Fired when |
|---|---|---|
| `news_view` | `view` ("all"\|"conference"), `conference` | Feed mounts or conference changes |
| `news_filter_change` | `filter`, `value` | Conference tab changes |
| `intel_item_impression` | `type`, `id`, `position`, `feed` | Item 50% visible (once per session) |
| `intel_item_open` | `type`, `id`, `title`, `source`, `position`, `feed` | Article or video clicked |

### Video
| Event | Properties | Fired when |
|---|---|---|
| `video_play_click` | `video_id`, `title`, `channel` | VideoCard clicked |
| `video_modal_open` | `video_id`, `title`, `source` | Modal opens |
| `video_modal_close` | `source` | Modal dismissed |

### Ask Maximus

All carry `sport: 'nfl'`. Client events come from `src/components/ask/`; server events from `api/ask/chat.js`.

| Event | Where | Properties |
|---|---|---|
| `ask_peek_shown` | client | `page` (home, picks, game, team) |
| `ask_peek_dismissed` | client | |
| `ask_opened` | client | `source` (launcher, peek, pick_card, game_page, team_page, page), `page` |
| `ask_message_sent` | client | `source` (typed, starter, followup, refresh, or the in-page button), `length`, `page`, `signed_in` |
| `ask_answer_shown` | client | `source`, `page`, `plan`, `cards`, `locked`, `pro_offer`, `duration_ms` |
| `ask_card_opened` | client | `card_type`, `game_id` |
| `ask_upgrade_clicked` | client | `surface` (ask_answer, ask_cap), `reason` |
| `ask_ideas_opened` | client | `page` (a question sent from the ideas list has `source: idea` on `ask_message_sent`) |
| `ask_cleared` | client | |
| `ask_error` | client | `code`, `page` |
| `ask_answered` | server | `question`, `answer`, `plan`, `signed_in`, `page`, `page_teams`, `turn`, `channel`, `rollout`, `rounds`, `tools`, `cards`, `card_types`, `corrections`, `fell_back`, `pro_only`, `model`, `duration_ms`, token counts |
| `ask_cap_hit` | server | `question`, `plan`, `signed_in`, `page`, `cap` |
| `ask_failed` | server | `question`, `plan`, `signed_in`, `page`, `code`, `duration_ms` |

**What people ask.** Every server event carries `question` (the text as typed, one line, up to 600 characters); `ask_answered` also carries `answer` (up to 800). To read them: filter events to `ask_answered` and show the `question` column, or break `ask_answered` down by `question`. Server events are filed under the account id when signed in, and under the browser's PostHog id for guests (the page sends it as `visitor`), so a question sits on the same person as their page views and sign-up.

Email given inside chat fires the site's existing email-capture events with `placement` `ask_locked_card` or `ask_cap`.

The funnel to watch: `ask_peek_shown` → `ask_opened` → `ask_message_sent` → email capture (guests) or `ask_upgrade_clicked` (free accounts). `corrections` and `fell_back` count answers the server sent back because the model wrote a number that was not in the data.

### Errors
| Event | Properties | Fired when |
|---|---|---|
| `ui_error` | `component`, `message`, `stack` | React error boundary, unhandled rejection, window error |

---

## Context Props (Auto-Attached to Every Event)

| Prop | Value |
|---|---|
| `session_id` | `crypto.randomUUID()` — resets per tab close |
| `vw` | Viewport width (pixels) |
| `vh` | Viewport height (pixels) |
| `device` | `"mobile"` / `"tablet"` / `"desktop"` |

---

## Verifying Events

### PostHog — Live Events
1. Open PostHog → **Activity → Live Events**
2. Trigger actions in your app
3. Events appear within seconds

### GA4 — DebugView
1. Open GA4 → **Configure → DebugView**
2. In Chrome, install the [GA Debugger extension](https://chrome.google.com/webstore/detail/google-analytics-debugger/jnkmfdileelhofjcijamephohjechhna)
3. Reload your app — events stream in real time

### Console (no accounts needed)
Append `?debugAnalytics=1` to the URL and open DevTools Console.

---

## PostHog Dashboard Starter

Suggested dashboards and insights to set up after launch:

### DAU / MAU
- **Insight type:** Trends
- **Event:** `page_view`
- **Group by:** Unique users (daily / monthly)

### Top Pages
- **Insight type:** Trends
- **Event:** `page_view`
- **Group by:** `pathname` property

### Team Engagement Funnel
- **Insight type:** Funnel
- **Steps:** `page_view` (home) → `pinned_team_add` → `team_view`

### News Feed Engagement
- **Insight type:** Trends
- **Events:** `intel_item_impression`, `intel_item_open`
- **Conversion:** opens ÷ impressions per session

### Video Engagement
- **Insight type:** Funnel
- **Steps:** `video_play_click` → `video_modal_open` (drop-off = no modal)

### Error Monitoring
- **Insight type:** Trends
- **Event:** `ui_error`
- **Group by:** `component` property

### Retention
- **Insight type:** Retention
- **Starting event:** `session_start`
- **Returning event:** `page_view`

---

## Adding New Events

1. Add a named constant for the event in the relevant component file.
2. Call `track('event_name', { ...props })`.
3. Add it to the Event Taxonomy table above.
4. Update the PostHog dashboard if needed.

**Naming convention:** `noun_verb` or `context_action` — lowercase, underscore-separated.
