# Marketing Site Status

## What was added

- **Location**: New standalone Next.js app in `marketing/` at repo root.
- **Stack**: Next.js 14 (App Router), React 18, Tailwind CSS. Static export (`output: 'export'`) for performance and SEO.
- **Isolation**: The marketing site has its own `package.json`, `node_modules`, and build. No code paths, routes, or config of the existing core app were changed.

### Pages

- `/` – Home landing (Hero, value props, how it works, social proof, FAQ, final CTA + email placeholder).
- `/features` – SEO page for odds, ATS, team news, recaps, daily summary.
- `/teams` – Conceptual team intel page (no dynamic data).
- `/about` – Lightweight credibility page.
- `/privacy` – Placeholder.
- `/terms` – Placeholder.

### SEO

- Per-page metadata: title, description, Open Graph, Twitter cards.
- Canonical URLs on all pages.
- `robots.txt` and `sitemap.xml` via Next.js `app/robots.js` and `app/sitemap.js`.
- JSON-LD on homepage: Organization + WebSite.
- Semantic headings and internal links.

### Analytics

- Abstraction in `marketing/lib/analytics.js`:
  - `trackPageView(path)` – called on route change.
  - `trackCtaClick({ ctaId, location })` – for CTAs.
- Dev: events logged to console. Prod: no-op unless `NEXT_PUBLIC_ENABLE_ANALYTICS=true`.
- Ready for future GA4 or PostHog; no keys required to build.

### CTAs

- Primary: “Open the App” → `NEXT_PUBLIC_APP_URL` (default `https://maximussports.vercel.app`).
- Secondary: “Get updates” → placeholder form (no backend yet).

---

## Local run commands

From repo root:

```bash
cd marketing && npm install && npm run dev
```

Then open http://localhost:3000.

Build only:

```bash
cd marketing && npm run build
```

Static output is in `marketing/out/`.

---

## Vercel “New Project” settings (marketing site only)

Use the **same GitHub repo** (shotzbydante/maximussports) and create a **second** Vercel project for the marketing site. Do **not** change the existing app project.

| Setting | Value |
|--------|--------|
| **Root Directory** | `marketing` |
| **Build Command** | `npm run build` |
| **Output Directory** | *(leave default; Next.js auto-detected)* |
| **Install Command** | `npm install` |
| **Framework Preset** | Next.js |

Environment variables (optional):

- `NEXT_PUBLIC_BASE_URL` = `https://maximussports.ai` (for canonicals, sitemap, OG).
- `NEXT_PUBLIC_APP_URL` = `https://maximussports.vercel.app` (or later `https://app.maximussports.ai`).
- `NEXT_PUBLIC_ENABLE_ANALYTICS` = `true` when you add GA4/PostHog.

---

## Future domain mapping

- **maximussports.ai** (root) → Vercel project whose Root Directory is `marketing`.
- **app.maximussports.ai** → Existing Vercel project (core app, current maximussports.vercel.app).

DNS is in Squarespace; add the Vercel DNS records when ready (Vercel will show the required CNAME/A records).
