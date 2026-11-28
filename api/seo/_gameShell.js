/**
 * Page shell for the per-game prediction pages (/nfl/<away>-vs-<home>-prediction).
 *
 * Plain HTML and CSS, no JavaScript, so search engines and AI agents read
 * the whole page. The look follows the public landing page: the navy field
 * with the app's own light tiles on it, Manrope for headings and numbers,
 * Inter for text, the app's blue for actions.
 */
import { ORIGIN, SITE, LEGAL } from '../../src/seo/siteCopy.js';
import { esc } from './_site.js';

const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--navy-0:#030a1a;--navy-1:#071630;--navy-2:#0c2148;--blue:#1668e3;--blue-2:#0f52bd;--cyan:#2bc4ff;--teal:#2fe3c2;
--ink:#0b1b33;--ink-2:#3b4d68;--ink-3:#5d6f8a;--hair:rgba(22,104,227,.14);--wash:#eef3fa;--up:#0b8a5c;--up-soft:rgba(11,138,92,.1);--down:#b83227;--down-soft:rgba(184,50,39,.09);
--on-navy:#dbe5f5;--on-navy-2:#9db2d3;--line:rgba(130,175,255,.2)}
html{-webkit-text-size-adjust:100%}
body{min-height:100vh;color:var(--on-navy);font:16px/1.55 'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums;
background:radial-gradient(ellipse 900px 520px at 85% -4%,rgba(43,196,255,.18) 0%,transparent 62%),radial-gradient(ellipse 760px 520px at 0% 38%,rgba(47,227,194,.07) 0%,transparent 60%),linear-gradient(168deg,var(--navy-2) 0%,var(--navy-1) 34%,var(--navy-0) 100%) fixed;background-color:var(--navy-0)}
a{color:inherit}
img{max-width:100%}
.wrap{max-width:920px;margin:0 auto;padding:0 20px}
h1,h2,.num,.brandless{font-family:'Manrope','Inter',system-ui,sans-serif}
:focus-visible{outline:3px solid var(--cyan);outline-offset:3px;border-radius:6px}

/* Top bar */
.top{display:flex;align-items:center;gap:8px 18px;padding-top:14px;padding-bottom:14px}
.top .logo{display:block;height:44px;width:auto;margin-left:-8px}
.top nav{display:flex;gap:18px;margin-left:auto;font-size:14px;font-weight:600}
.top nav a{color:var(--on-navy-2);text-decoration:none;padding:8px 0}
.top nav a:hover{color:#fff}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:10px 20px;border-radius:999px;background:var(--blue);color:#fff;font-weight:700;font-size:15px;text-decoration:none;box-shadow:0 10px 30px -10px rgba(22,104,227,.8);transition:background-color .15s ease,transform .15s ease}
.btn:hover{background:var(--blue-2)}
.btn:active{transform:scale(.98)}
.btn.ghost{background:transparent;color:var(--blue);box-shadow:inset 0 0 0 1.5px var(--hair)}
.btn.ghost:hover{background:var(--wash)}
.btn.onNavy{background:rgba(255,255,255,.08);color:#fff;box-shadow:inset 0 0 0 1.5px var(--line)}
.btn.onNavy:hover{background:rgba(255,255,255,.14)}
.top .btn{min-height:40px;padding:8px 16px;font-size:14px}

/* Hero */
.crumbs{font-size:13px;color:var(--on-navy-2);padding-top:10px}
.crumbs a{text-decoration:none}
.crumbs a:hover{color:#fff;text-decoration:underline}
.crumbs span{margin:0 6px;opacity:.6}
.kicker{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}
.pill{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;border:1.5px solid var(--line);background:rgba(43,196,255,.08);color:var(--cyan);font-size:12px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;white-space:nowrap}
.pill.final{color:#fff;background:rgba(255,255,255,.1)}
.pill.live{color:#ff8b80;border-color:rgba(255,90,77,.45);background:rgba(255,90,77,.12)}
h1{font-size:clamp(30px,6.4vw,52px);font-weight:800;line-height:1.04;letter-spacing:-.03em;color:#fff;margin:14px 0 0;text-wrap:balance}
h1 .accent{background:linear-gradient(92deg,var(--cyan),var(--teal));-webkit-background-clip:text;background-clip:text;color:transparent}
.lede{max-width:680px;margin-top:14px;font-size:17px;color:var(--on-navy)}

/* Tiles: the app's light surface on the navy field */
.tile{background:#fff;color:var(--ink);border-radius:18px;padding:20px;box-shadow:0 0 0 1px rgba(125,211,252,.2),0 24px 60px -34px rgba(29,139,255,.55)}
.tile h2{font-size:19px;font-weight:800;letter-spacing:-.015em;color:var(--ink)}
.tile .sub{margin-top:2px;font-size:14px;color:var(--ink-3)}
.stack{display:grid;gap:14px;margin-top:22px}

/* Scoreboard */
.board{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:10px;margin-top:22px;padding:22px 16px}
.side{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0;text-align:center;text-decoration:none}
.side img{width:76px;height:76px;object-fit:contain}
.side .name{font-family:'Manrope','Inter',system-ui,sans-serif;font-size:clamp(17px,3.6vw,22px);font-weight:800;letter-spacing:-.02em;line-height:1.15;color:var(--ink)}
.side .city{font-size:13px;color:var(--ink-3)}
.side .rec{font-size:13px;font-weight:600;color:var(--ink-2)}
.mid{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:74px}
.mid .at{font-family:'Manrope','Inter',system-ui,sans-serif;font-size:15px;font-weight:800;color:var(--ink-3);letter-spacing:.08em}
.mid .score{font-family:'Manrope','Inter',system-ui,sans-serif;font-size:clamp(30px,7vw,44px);font-weight:800;letter-spacing:-.03em;line-height:1;color:var(--ink);white-space:nowrap}
.mid .score i{font-style:normal;color:var(--ink-3);font-weight:600}
.mid .when{font-size:12px;color:var(--ink-3);text-align:center;line-height:1.35}
.boardFoot{grid-column:1/-1;display:flex;flex-wrap:wrap;justify-content:center;gap:4px 16px;margin-top:8px;padding-top:14px;border-top:1px solid var(--hair);font-size:13px;color:var(--ink-2)}
.boardFoot b{font-weight:600;color:var(--ink)}

/* Lines */
.lines{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:14px}
.lineTile{padding:16px 16px 18px}
.lineTile .label{font-size:12px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3)}
.lineTile .big{margin-top:6px;font-family:'Manrope','Inter',system-ui,sans-serif;font-size:clamp(22px,5vw,30px);font-weight:800;letter-spacing:-.025em;line-height:1.1;color:var(--ink)}
.lineTile .note{margin-top:6px;font-size:13px;line-height:1.4;color:var(--ink-2)}
.pair{display:flex;justify-content:space-between;gap:8px;margin-top:6px;font-family:'Manrope','Inter',system-ui,sans-serif;font-weight:800;font-size:clamp(17px,3.8vw,22px);letter-spacing:-.02em}
.pair span{display:flex;flex-direction:column}
.pair small{font-family:'Inter',system-ui,sans-serif;font-size:12px;font-weight:600;color:var(--ink-3);letter-spacing:0}

/* Win chance */
.chance{display:flex;height:14px;margin-top:14px;border-radius:999px;overflow:hidden;background:var(--wash)}
.chance i{display:block;height:100%}
.chance .a{background:var(--cyan)}
.chance .h{background:var(--blue)}
.chanceRow{display:flex;justify-content:space-between;gap:12px;margin-top:10px;font-size:14px;color:var(--ink-2)}
.chanceRow b{font-family:'Manrope','Inter',system-ui,sans-serif;font-size:20px;font-weight:800;color:var(--ink);letter-spacing:-.02em}
.chanceRow .r{text-align:right}
.key{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:1px}

/* The call */
.call{position:relative;overflow:hidden}
.callHead{display:flex;align-items:center;justify-content:space-between;gap:10px}
.tag{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap}
.tag.rec{background:var(--up-soft);color:var(--up)}
.tag.lean{background:var(--wash);color:var(--blue)}
.tag.won{background:var(--up);color:#fff}
.tag.lost{background:var(--down-soft);color:var(--down)}
.tag.push{background:var(--wash);color:var(--ink-2)}
.pickBox{display:flex;align-items:center;gap:14px;margin-top:14px;padding:16px;border-radius:14px;background:var(--wash)}
.pickBox.won{background:var(--up-soft);box-shadow:inset 0 0 0 1.5px rgba(11,138,92,.45)}
.pickBox.lost{background:var(--down-soft)}
.pickBox img{flex:none;width:44px;height:44px;object-fit:contain}
.pickLabel{font-family:'Manrope','Inter',system-ui,sans-serif;font-size:clamp(24px,5.6vw,32px);font-weight:800;letter-spacing:-.03em;line-height:1.1;color:var(--ink)}
.pickMeta{margin-top:2px;font-size:14px;color:var(--ink-2)}
.fine{margin-top:12px;font-size:13px;line-height:1.5;color:var(--ink-3)}
.locked{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:14px}
.lockCell{padding:14px 10px;border-radius:14px;background:var(--wash);text-align:center}
.lockCell .label{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
.lockCell .bars{display:flex;justify-content:center;gap:4px;margin-top:10px}
.lockCell .bars i{display:block;width:26px;height:10px;border-radius:5px;background:rgba(22,104,227,.22)}
.lockCell .bars i+i{width:16px}
.lockCell .hint{margin-top:8px;font-size:12px;font-weight:600;color:var(--blue)}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}

/* Matchups */
.edge{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:4px 12px;padding:14px 0;border-top:1px solid var(--hair)}
.edge:first-of-type{border-top:0;margin-top:6px}
.edge .units{font-size:15px;font-weight:600;color:var(--ink);line-height:1.35}
.edge .units span{color:var(--ink-3);font-weight:500}
.edge .verdict{font-size:13px;font-weight:800;white-space:nowrap;padding:4px 10px;border-radius:999px;background:var(--wash);color:var(--ink-2)}
.edge .verdict.big{background:var(--blue);color:#fff}
.edge .verdict.some{background:rgba(22,104,227,.12);color:var(--blue)}
.track{grid-column:1/-1;position:relative;height:8px;border-radius:999px;background:var(--wash)}
.track::after{content:'';position:absolute;left:50%;top:-3px;width:2px;height:14px;margin-left:-1px;border-radius:1px;background:rgba(11,27,51,.28)}
.track i{position:absolute;top:0;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--blue),var(--cyan))}
.track i.toLeft{right:50%;background:linear-gradient(270deg,var(--blue),var(--cyan))}
.track i.toRight{left:50%}
.ends{grid-column:1/-1;display:flex;justify-content:space-between;font-size:12px;font-weight:600;color:var(--ink-3)}

/* Ask panel: on the navy, like the app's launcher */
.ask{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px 18px;margin-top:14px;padding:22px 20px;border-radius:18px;border:1.5px solid var(--line);background:linear-gradient(135deg,rgba(22,104,227,.34),rgba(43,196,255,.1))}
.ask h2{font-size:22px;font-weight:800;letter-spacing:-.02em;color:#fff}
.ask p{margin-top:4px;font-size:15px;color:var(--on-navy)}
.ask img{width:96px;height:auto;filter:drop-shadow(0 14px 24px rgba(0,0,0,.45))}
.prompts{grid-column:1/-1;display:flex;flex-direction:column;gap:8px;margin-top:10px}
.prompt{display:flex;align-items:center;gap:12px;min-height:48px;padding:10px 14px;border-radius:14px;background:rgba(255,255,255,.07);border:1.5px solid var(--line);color:#fff;font-size:15px;font-weight:600;text-decoration:none;transition:background-color .15s ease}
.prompt:hover{background:rgba(255,255,255,.14)}
.prompt i{font-style:normal;font-size:20px;line-height:1}
.prompt b{margin-left:auto;font-weight:700;color:var(--cyan);white-space:nowrap}
.ask .fineNavy{grid-column:1/-1;margin-top:6px;font-size:13px;color:var(--on-navy-2)}

/* Details, questions, other games */
.facts{width:100%;border-collapse:collapse;margin-top:8px;font-size:15px}
.facts th,.facts td{text-align:left;padding:10px 0;border-top:1px solid var(--hair);vertical-align:top}
.facts tr:first-child th,.facts tr:first-child td{border-top:0}
.facts th{width:38%;font-weight:600;color:var(--ink-3)}
.facts td{font-weight:600;color:var(--ink)}
.qa h3{margin-top:16px;font-size:16px;font-weight:700;color:var(--ink);line-height:1.35}
.qa h3:first-of-type{margin-top:10px}
.qa p{margin-top:4px;font-size:15px;color:var(--ink-2)}
.section{margin-top:34px}
.section>h2{font-size:22px;font-weight:800;letter-spacing:-.02em;color:#fff}
.section>p{margin-top:4px;font-size:15px;color:var(--on-navy-2)}
.games{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}
.gameLink{display:flex;align-items:center;gap:10px;min-height:56px;padding:10px 14px;border-radius:14px;background:rgba(255,255,255,.06);border:1.5px solid var(--line);text-decoration:none;color:#fff;font-size:15px;font-weight:700;transition:background-color .15s ease}
.gameLink:hover{background:rgba(255,255,255,.12)}
.gameLink img{flex:none;width:26px;height:26px;object-fit:contain}
.gameLink .logos{display:flex;gap:2px}
.gameLink small{display:block;font-size:12px;font-weight:500;color:var(--on-navy-2)}
.gameLink .go{margin-left:auto;color:var(--cyan)}

footer{margin-top:44px;padding-top:22px;padding-bottom:44px;border-top:1px solid var(--line);font-size:13px;color:var(--on-navy-2)}
footer nav{display:flex;flex-wrap:wrap;gap:6px 16px;margin-bottom:10px}
footer a{color:var(--on-navy);text-decoration:none}
footer a:hover{color:#fff;text-decoration:underline}

@media (max-width:640px){
  .wrap{padding:0 16px}
  .top nav{display:none}
  .top .btn{margin-left:auto}
  .tile{padding:18px 16px;border-radius:16px}
  .board{padding:18px 10px;gap:6px}
  .side img{width:58px;height:58px}
  .mid{min-width:58px}
  .lines{grid-auto-flow:row;grid-auto-columns:auto;grid-template-columns:1fr;gap:10px}
  .lineTile{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:2px 12px;padding:14px 16px}
  .lineTile .big{margin-top:0;grid-row:1/3;grid-column:2;text-align:right}
  .lineTile .note{margin-top:0}
  .lineTile .pair{grid-row:1/3;grid-column:2;margin-top:0;gap:16px;text-align:right}
  .ask{grid-template-columns:minmax(0,1fr) 72px;padding:18px 16px}
  .ask img{width:72px}
  .games{grid-template-columns:1fr}
  .locked{gap:8px}
  .actions .btn{flex:1 1 100%}
  .lockCell .hint{display:none}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

const NAV = [['/nfl-picks', 'NFL picks'], ['/ask-maximus', 'Ask Maximus'], ['/record', 'Record']];
const FOOT = [['/', 'Home'], ['/nfl-picks', 'NFL picks this week'], ['/nfl/insights', 'NFL picks board'], ['/ask-maximus', 'Ask Maximus'], ['/record', 'The public record'], ['/nfl/games', 'NFL games'], ['/nfl/teams', 'NFL teams'], ['/about', 'About'], ['/llms.txt', 'llms.txt'], ['/privacy', 'Privacy'], ['/terms', 'Terms']];

/**
 * @param {object} o
 * @param {string} o.title
 * @param {string} o.description
 * @param {string} o.path        canonical path
 * @param {string} o.body        trusted HTML for <main>
 * @param {object[]} [o.jsonLd]  schema.org nodes for one @graph
 * @param {boolean} [o.index]    false asks search engines to leave the page out
 */
export function gameShell({ title, description, path, body, jsonLd = [], index = true }) {
  const url = `${ORIGIN}${path}`;
  const graph = jsonLd.length ? { '@context': 'https://schema.org', '@graph': jsonLd } : null;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="${index ? 'index, follow, max-snippet:-1, max-image-preview:large' : 'noindex, follow'}">
<meta name="theme-color" content="#071630">
<link rel="icon" type="image/png" href="${ORIGIN}/favicon.png">
<link rel="alternate" type="text/plain" href="${ORIGIN}/llms.txt" title="Maximus Sports for AI agents">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${ORIGIN}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${ORIGIN}/og.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@700;800&display=swap">
${graph ? `<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, '\\u003c')}</script>` : ''}
<style>${CSS}</style>
</head>
<body>
<header class="wrap top">
<a href="/" aria-label="${esc(SITE.name)} home"><img class="logo" src="/logo-wordmark.png" alt="${esc(SITE.name)}" width="91" height="44"></a>
<nav aria-label="Site">${NAV.map(([href, label]) => `<a href="${href}">${label}</a>`).join('')}</nav>
<a class="btn" href="/nfl/insights">Open the board</a>
</header>
<main class="wrap">
${body}
</main>
<footer class="wrap">
<nav aria-label="Footer">${FOOT.map(([href, label]) => `<a href="${href}">${label}</a>`).join('')}</nav>
<p>${esc(LEGAL)}</p>
</footer>
</body>
</html>`;
}
