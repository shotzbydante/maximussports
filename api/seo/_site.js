/**
 * Plain-HTML page template for the pages that describe the product to
 * search engines and AI agents: /about, /ask-maximus, /nfl-picks.
 * No JavaScript is needed to read them. The words come from
 * src/seo/siteCopy.js so they match the app's own landing page.
 */
import { ORIGIN, SITE, KEY_PAGES, LEGAL } from '../../src/seo/siteCopy.js';

export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#040a1a;color:#dbe5f5;font:16px/1.6 system-ui,-apple-system,'Segoe UI',sans-serif}
a{color:#7db7ff}
header,main,footer{max-width:860px;margin:0 auto;padding:0 20px}
header{display:flex;flex-wrap:wrap;gap:8px 20px;align-items:center;padding-top:18px;padding-bottom:18px}
header a{text-decoration:none;font-size:14px}
.brand{color:#fff;font-weight:800;letter-spacing:.06em;text-transform:uppercase;margin-right:auto}
h1{font-size:clamp(28px,5vw,42px);line-height:1.15;letter-spacing:-.02em;color:#fff;margin:28px 0 14px}
h2{font-size:22px;color:#fff;margin:36px 0 10px}
h3{font-size:17px;color:#fff;margin:20px 0 4px}
p,li{color:#c3d0e6}
p{margin:0 0 12px}
ul,ol{padding-left:22px;margin:0 0 12px}
li{margin-bottom:6px}
.lead{font-size:18px;color:#dbe5f5;max-width:700px}
.cta{display:inline-block;background:#2f6fed;color:#fff;font-weight:700;padding:13px 26px;border-radius:10px;text-decoration:none;margin:10px 12px 10px 0}
.card{background:rgba(125,183,255,.06);border:1px solid rgba(125,183,255,.18);border-radius:14px;padding:18px 20px;margin:0 0 14px}
.card h3{margin-top:0}
.meta{font-size:14px;color:#93a4c0}
.tag{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:3px 10px;border-radius:99px;background:rgba(61,220,151,.15);color:#3ddc97;margin-right:8px}
.tag.lean{background:rgba(125,183,255,.14);color:#7db7ff}
blockquote{border-left:3px solid #2f6fed;padding:4px 0 4px 14px;margin:8px 0 14px;color:#dbe5f5}
.shots{display:flex;flex-wrap:wrap;gap:16px;margin:14px 0}
.shots img{width:100%;max-width:260px;height:auto;border-radius:18px;border:1px solid rgba(125,183,255,.2)}
table{border-collapse:collapse;width:100%;margin:0 0 14px;font-size:15px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid rgba(125,183,255,.14)}
th{color:#93a4c0;font-weight:600;font-size:13px}
footer{padding-top:28px;padding-bottom:48px;font-size:13px;color:#93a4c0;border-top:1px solid rgba(125,183,255,.14);margin-top:40px}
footer a{margin-right:14px}
`;

/**
 * @param {object} o
 * @param {string} o.title        <title>
 * @param {string} o.description  meta description
 * @param {string} o.path         canonical path
 * @param {string} o.body         trusted HTML for <main>
 * @param {object} [o.jsonLd]
 */
export function page({ title, description, path, body, jsonLd }) {
  const url = `${ORIGIN}${path === '/' ? '' : path}`;
  const nav = KEY_PAGES.filter((p) => ['/nfl-picks', '/ask-maximus', '/record', '/about'].includes(p.path))
    .map((p) => `<a href="${p.path}">${esc(p.title)}</a>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<link rel="icon" type="image/png" href="${ORIGIN}/favicon.png">
<link rel="alternate" type="text/plain" href="${ORIGIN}/llms.txt" title="Maximus Sports for AI agents">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${ORIGIN}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${ORIGIN}/og.png">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
<style>${CSS}</style>
</head>
<body>
<header><a class="brand" href="/">${esc(SITE.name)}</a>${nav}</header>
<main>
${body}
</main>
<footer>
<p>${KEY_PAGES.map((p) => `<a href="${p.path}">${esc(p.title)}</a>`).join('')}<a href="/llms.txt">llms.txt</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></p>
<p>${esc(LEGAL)}</p>
</footer>
</body>
</html>`;
}

export function send(res, html, { maxAge = 3600 } = {}) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', `public, s-maxage=${maxAge}, stale-while-revalidate=86400`);
  return res.status(200).send(html);
}

/** Shared blocks. */
export const faqHtml = (faq) => faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('\n');
export const propsHtml = (props) => props.map((v) => `<div class="card"><h3>${esc(v.title)}</h3><p>${esc(v.body)}</p></div>`).join('\n');
