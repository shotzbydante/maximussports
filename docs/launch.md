# Maximus Sports — Launch Features Documentation

## Feature 1: Shareable Insight Cards

### How It Works

1. User clicks **Share** on an insight card (team header, matchup card, or upset alert)
2. `ShareButton` calls `POST /api/share/create` → stores payload in Vercel KV → returns `{id, url}`
3. On mobile: opens native share sheet (`navigator.share`) with the share URL
4. On desktop: copies `https://maximussports.ai/share/:id` to clipboard → shows toast "Link copied"
5. When someone opens the share URL, Vercel rewrites `/share/:id` → `/api/share/render?id=:id`
6. The API returns full HTML with OG tags (pointing to `/api/og`) + JS redirect to the destination

### Testing OG Images Locally

```bash
# Start the dev server (if using Vercel CLI)
vercel dev

# Test OG image with sample params
open "http://localhost:3000/api/og?title=Duke+Blue+Devils&subtitle=ACC+%C2%B7+Lock&type=Team+Intel&team=Duke+Blue+Devils"

# Test with different types
open "http://localhost:3000/api/og?title=Upset+Alert%3A+Kansas+def+Duke&type=Upset+Watch&meta=Spread%3A+%2B7.5"
```

**OG image params:**
| Param     | Max length | Description                         |
|-----------|------------|-------------------------------------|
| `title`   | 80 chars   | Main headline (required)            |
| `subtitle`| 120 chars  | Secondary line                      |
| `meta`    | 60 chars   | Small detail, e.g. "ATS: 13–8"      |
| `team`    | 40 chars   | Team display name                   |
| `type`    | 30 chars   | Badge: "Upset Watch", "ATS Intel", etc. |

### Verifying Share Page OG Tags

```bash
# Create a test share
curl -X POST http://localhost:3000/api/share/create \
  -H "Content-Type: application/json" \
  -d '{"type":"team_intel","title":"Duke Blue Devils Intel","subtitle":"ACC · Lock","teamSlug":"duke-blue-devils","destinationPath":"/teams/duke-blue-devils"}'

# Response: {"id":"abc123xyz","url":"https://maximussports.ai/share/abc123xyz"}

# Inspect the share page HTML (view OG tags)
curl http://localhost:3000/api/share/render?id=abc123xyz | grep -A2 'og:'
```

Use [opengraph.xyz](https://www.opengraph.xyz) or [metatags.io](https://metatags.io) in production to verify social previews.

### PostHog Events

| Event              | When fired                        | Properties                                      |
|--------------------|-----------------------------------|-------------------------------------------------|
| `share_click`      | User clicks any Share button      | `type, placement, team_slug, has_native_share, success, fallback` |
| `share_link_created` | Share API returns successfully  | `type, placement, team_slug, share_id, fallback` |

### Share Button Placements

| Surface               | `shareType`    | `placement`        |
|-----------------------|----------------|--------------------|
| Team page header      | `team_intel`   | `team_header`      |
| Insights matchup card | `matchup` / `upset_watch` | `matchup_card` |
| Dynamic alerts (home) | `upset_watch`  | `dynamic_alerts`   |

### Extending ShareButton to New Surfaces

```jsx
import ShareButton from '../components/common/ShareButton';

<ShareButton
  shareType="ats_intel"
  title="ATS Leader: Kansas Jayhawks 18–4 last 30"
  subtitle="Big 12 · Lock tier"
  meta="ATS: 18–4 last 30"
  teamSlug="kansas-jayhawks"
  destinationPath="/insights"
  placement="ats_leaderboard"
/>
```

### Env Vars

No new env vars required. Uses existing `@vercel/kv` with:
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` (or `KV_URL`) — already configured

KV key pattern: `share:{10-char-id}`, TTL: 30 days.
Rate limit key: `share:rate:{session-uuid}`, TTL: 60s, max 10 creates/min.

---

## Feature 2: Search Capture (SEO Landing Pages)

### Landing Pages

| URL                       | Handler                          | Target keyword                    |
|---------------------------|----------------------------------|-----------------------------------|
| `/march-madness-odds`     | `api/seo/march-madness-odds.js`  | "march madness odds 2026"         |
| `/upset-picks`            | `api/seo/upset-picks.js`         | "march madness upset picks"       |
| `/best-bracket-picks`     | `api/seo/best-bracket-picks.js`  | "best bracket picks 2026"         |
| `/teams/:slug/odds`       | `api/seo/team-odds.js`           | "[team name] odds march madness"  |
| `/sitemap.xml`            | `api/seo/sitemap.js`             | (served as sitemap)               |

### Verifying Landing Page HTML + OG Tags

```bash
# Check that HTML is returned (not the SPA)
curl -s https://maximussports.ai/march-madness-odds | grep '<title>'
# → <title>March Madness Odds 2026 | Maximus Sports</title>

# Check OG tags
curl -s https://maximussports.ai/upset-picks | grep 'og:image'
# → <meta property="og:image" content="https://maximussports.ai/api/og?..." />

# Check team odds page
curl -s https://maximussports.ai/teams/duke-blue-devils/odds | grep '<h1>'
# → <h1>Duke Blue Devils Odds &amp; ATS Intelligence</h1>

# Check sitemap
curl -s https://maximussports.ai/sitemap.xml | head -20
# → <?xml version="1.0" ...>
# → <urlset xmlns="...">
```

Use [Google Search Console's URL Inspection tool](https://search.google.com/search-console) after deploy to verify indexing.

### Extending Landing Pages

To add a new SEO landing page:

1. Create `api/seo/my-page.js`:
```js
import { buildLandingPage } from './_html.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(buildLandingPage({
    title: 'My Page Title',
    description: 'Meta description here.',
    canonicalPath: '/my-page',
    h1: 'My Page Headline',
    lead: 'Lead paragraph text.',
    bullets: ['Key point 1', 'Key point 2'],
    ctaLabel: 'Open Maximus Sports',
    ctaPath: '/insights',
  }));
}
```

2. Add a rewrite to `vercel.json` **before** the catch-all:
```json
{"source": "/my-page", "destination": "/api/seo/my-page"},
```

3. Add the URL to the sitemap in `api/seo/sitemap.js`.

### PostHog Events

| Event               | When fired              | Properties                |
|---------------------|-------------------------|---------------------------|
| `seo_landing_view`  | User visits landing page| `placement, page path`    |
| `seo_continue_click`| User clicks CTA button  | `page path`               |

### robots.txt

Located at `public/robots.txt` — served as a static file by Vercel.

```
User-agent: *
Allow: /
Disallow: /api/
Allow: /api/seo/
Sitemap: https://maximussports.ai/sitemap.xml
```

---

## Quick Verification Checklist (Post-Deploy)

- [ ] `curl https://maximussports.ai/api/og?title=Test` returns a PNG (not HTML)
- [ ] `curl https://maximussports.ai/march-madness-odds` returns HTML with `<title>March Madness Odds`
- [ ] `curl https://maximussports.ai/upset-picks` returns HTML with proper OG tags
- [ ] `curl https://maximussports.ai/teams/duke-blue-devils/odds` returns HTML for Duke
- [ ] `curl https://maximussports.ai/teams/unknown-team/odds` returns 404 HTML (not 500)
- [ ] `curl https://maximussports.ai/sitemap.xml` returns valid XML
- [ ] `curl https://maximussports.ai/robots.txt` returns robots directives
- [ ] Share button in TeamPage header shows "Share" text with icon
- [ ] Clicking Share: either native share sheet (mobile) or "Link copied" toast (desktop)
- [ ] Open `/share/:id` in browser → redirected to team/insights page
- [ ] View page source of `/share/:id` → OG image URL points to `/api/og?...`
- [ ] PostHog events fire in `?debugAnalytics=1` mode: `share_click`, `share_link_created`
