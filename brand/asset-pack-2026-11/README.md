# Maximus Sports brand assets (November 2026 pack)

This folder holds the original files exactly as supplied. They are the source of truth and are not deployed.
Web-ready versions (background removed, resized, compressed) live in `public/` and are what the site uses.

Rules of thumb:

- **3D mascots** go on the home landing pages (public and signed-in). **2D mascots** go inside the app.
- **Football** is the brand default mascot. Each sport's pages use that sport's mascot.
- **Full-colour and white logos** need a dark surface. On light surfaces use the **navy** logo.
- Look mascots up through `src/brand/mascots.js` (`MASCOTS`, `mascotFor('nba')`) rather than hard-coding paths.

## Logos

| Source file | Web file | Used in |
|---|---|---|
| `logo_transparent_full_color.png` | `/logo-wordmark.png` | App top nav, public landing header, signed-in home hero |
| `logo_transparent_full_color.png` | `/logo.png` (square canvas) | Social slides, video intro and outro cards |
| `logo_transparent_navy.png` | `/brand/logo-navy.png` | Email header (light), search-engine logo in `index.html` |
| `logo_transparent_white.png` | `/brand/logo-white.png` | App footer |
| `canonical_text_logo_original.png` | not deployed | Master art the transparent logos were made from |

## Mascots

| Sport | 2D (in-app) | 3D (home pages) | Status |
|---|---|---|---|
| Football | `/mascot.png`, `/brand/mascots/football-2d.webp` | `/brand/mascots/football-3d.webp` | Live: brand default (nav, footer, favicon, welcome email); 3D on both home heroes and the public closing panel |
| Basketball | `/mascot-basketball.png`, `/brand/mascots/basketball-2d.webp` | `/brand/mascots/basketball-3d.webp` | Live: NBA and NCAAM pages, loaders, slides; 3D on home sport tiles and league rows |
| Baseball | `/mascot-mlb.png`, `/brand/mascots/baseball-2d.webp` | `/brand/mascots/baseball-3d.webp` | Live: MLB pages, loader, emails, slides; 3D on home sport tile and league row |
| Hockey | `/brand/mascots/hockey-2d.webp` | `/brand/mascots/hockey-3d.webp` | Stored, not wired to any page |
| Soccer | `/brand/mascots/soccer-2d.webp` | `/brand/mascots/soccer-3d.webp` | Stored, not wired to any page |

To launch hockey or soccer: set the new workspace's `theme.mascot` in `src/workspaces/config.js` to
`MASCOTS.hockey.slot` / `MASCOTS.soccer.slot`, flip `live` to `true` in `src/brand/mascots.js`, and add the
sport's tile to the home pages using `MASCOTS.<sport>.render`.

The sport mascots were cut from the comparison sheets in `sport-mascots/`, which are about 370px tall per
figure. Replace them with larger exports when available; the file names can stay the same.

## Thumbnails

| Source file | Web file | Used in |
|---|---|---|
| `thumbnail_open_graph_1200x630.png` | `/og.png` | Default link-preview image for every page |
| `thumbnail_compact_512x512.png` | `/apple-touch-icon.png`, `/icons/icon-192.png`, `/icons/icon-512.png` | Phone home-screen icon and web manifest |
| `thumbnail_story_1080x1920.png` | `/brand/splash-story.jpg` | Phone-only splash while the app loads (`index.html`) |
| `thumbnail_video_1280x720.png` | `/brand/thumb-video.jpg` | Video cards whose own thumbnail is missing or fails |
| `thumbnail_header_1600x400.png` | `/brand/header-banner.jpg` | Banner at the top of the welcome email |
| `thumbnail_square_1080x1080.png` | `/brand/thumb-square.jpg` | Organization image in `index.html` structured data |

The browser-tab favicon (`/favicon.png`) is the 2D football mascot's head, because the wordmark is unreadable at 16px.

## Watermarks

| Source file | Web file | Used in |
|---|---|---|
| `watermark_corner_fullcolor.png` | `/brand/watermark-corner.png` | Bottom-right mark on exported reels and video covers |
| `watermark_fullcolor_60pct.png` | `/brand/watermark-color-60.png` | NBA and bracket loading screens |
| `watermark_fullcolor_30pct.png` | `/brand/watermark-color-30.png` | Public landing footer |
| `watermark_white_32pct.png` | `/brand/watermark-white.png` | MLB loading screen |
| `watermark_navy_36pct.png` | `/brand/watermark-navy.png` | End-of-page mark on light app pages, email footer |
| `watermark_tiled_1920x1080.png` | `/brand/watermark-tiled.png` | Dimmed backdrop behind the sign-up gate |

The two `preview_*_contact_sheet.jpg` files and the sport comparison sheets are reference sheets only.
