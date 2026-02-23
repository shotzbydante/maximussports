/**
 * Attempts to download ESPN conference logos to public/conferences/.
 * Run: node scripts/download-conference-logos.js
 * If a URL 404s, the file is skipped; ConferenceLogo component falls back to initials.
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'conferences');

const ESPN_BASE = 'https://a.espncdn.com/i/teamlogos/ncaa/500';
const CONF_FILES = [
  { slug: 'big-ten', url: `${ESPN_BASE}/bigten.png` },
  { slug: 'sec', url: `${ESPN_BASE}/sec.png` },
  { slug: 'acc', url: `${ESPN_BASE}/acc.png` },
  { slug: 'big-12', url: `${ESPN_BASE}/big12.png` },
  { slug: 'big-east', url: `${ESPN_BASE}/bigeast.png` },
  { slug: 'mwc', url: `${ESPN_BASE}/mwc.png` },
  { slug: 'aac', url: `${ESPN_BASE}/aac.png` },
  { slug: 'wcc', url: `${ESPN_BASE}/wcc.png` },
  { slug: 'a10', url: `${ESPN_BASE}/a10.png` },
  { slug: 'cusa', url: `${ESPN_BASE}/cusa.png` },
  { slug: 'mvc', url: `${ESPN_BASE}/mvc.png` },
  { slug: 'mac', url: `${ESPN_BASE}/mac.png` },
  { slug: 'southland', url: `${ESPN_BASE}/southland.png` },
];

function fetchToFile(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode !== 200) {
        resolve({ ok: false, status: res.statusCode });
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ ok: true, data: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
  });
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }
  for (const { slug, url } of CONF_FILES) {
    try {
      const result = await fetchToFile(url);
      if (result.ok) {
        fs.writeFileSync(path.join(OUT_DIR, `${slug}.png`), result.data);
        console.log(`Saved ${slug}.png`);
      } else {
        console.log(`Skip ${slug} (${result.status})`);
      }
    } catch (e) {
      console.warn(`Error ${slug}:`, e.message);
    }
  }
}

main();
