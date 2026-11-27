/**
 * Writes the facts in src/seo/siteCopy.js into the two static files that
 * crawlers and AI agents read without running the app:
 *   - index.html  (title, description, social tags, structured data, and a
 *     <noscript> summary; the block between the SEO markers)
 *   - public/llms.txt
 * Run `node scripts/seo-sync.mjs` after changing siteCopy.js.
 * src/seo/siteCopy.test.js fails when either file is out of date.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SITE, ORIGIN, VALUE_PROPS, ASK, FAQ, KEY_PAGES, LEGAL, siteJsonLd, llmsTxt } from '../src/seo/siteCopy.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function shellHead() {
  return `    <!-- seo:head:start (written by scripts/seo-sync.mjs from src/seo/siteCopy.js) -->
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
    <meta name="description" content="${esc(SITE.description)}" />
    <title>${esc(SITE.title)}</title>
    <link rel="alternate" type="text/plain" href="/llms.txt" title="Maximus Sports for AI agents" />
    <meta property="og:title" content="${esc(SITE.title)}" />
    <meta property="og:description" content="${esc(SITE.description)}" />
    <meta property="og:url" content="${ORIGIN}" />
    <meta property="og:image" content="${ORIGIN}/og.png" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${esc(SITE.name)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(SITE.title)}" />
    <meta name="twitter:description" content="${esc(SITE.description)}" />
    <meta name="twitter:image" content="${ORIGIN}/og.png" />
    <script type="application/ld+json">${JSON.stringify(siteJsonLd({ faq: false })).replace(/</g, '\\u003c')}</script>
    <!-- seo:head:end -->`;
}

export function shellBody() {
  return `    <!-- seo:body:start (written by scripts/seo-sync.mjs) -->
    <noscript>
      <h1>${esc(SITE.name)}: NFL picks, predictions and betting insights</h1>
      <p>${esc(SITE.description)}</p>
      <h2>What it does</h2>
      <ul>
${VALUE_PROPS.map((v) => `        <li><strong>${esc(v.title)}.</strong> ${esc(v.body)}</li>`).join('\n')}
      </ul>
      <h2>${esc(ASK.title)}</h2>
      <p>${esc(ASK.lede)} ${esc(ASK.limits)}</p>
      <h2>Pages</h2>
      <ul>
${KEY_PAGES.map((p) => `        <li><a href="${p.path}">${esc(p.title)}</a>: ${esc(p.desc)}</li>`).join('\n')}
      </ul>
      <h2>Questions and answers</h2>
${FAQ.map((f) => `      <h3>${esc(f.q)}</h3>\n      <p>${esc(f.a)}</p>`).join('\n')}
      <p>${esc(LEGAL)}</p>
    </noscript>
    <!-- seo:body:end -->`;
}

export function syncShell(html) {
  const swap = (s, name, block) => {
    const re = new RegExp(`[ \\t]*<!-- seo:${name}:start[\\s\\S]*?<!-- seo:${name}:end -->`);
    if (!re.test(s)) throw new Error(`index.html has no seo:${name} markers`);
    return s.replace(re, () => block);
  };
  return swap(swap(html, 'head', shellHead()), 'body', shellBody());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = path.join(root, 'index.html');
  fs.writeFileSync(file, syncShell(fs.readFileSync(file, 'utf8')));
  fs.writeFileSync(path.join(root, 'public', 'llms.txt'), llmsTxt());
  console.log('index.html and public/llms.txt written');
}
