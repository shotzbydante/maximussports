/**
 * Conference name → logo asset. Returns { src, alt } when we have a real PNG; null otherwise.
 * Normalizes: trim, lowercase, "Big 10" → "Big Ten", "Big-12" → "Big 12", etc.
 */

const CONF_TO_LOGO = {
  acc: { src: '/conferences/acc.png', alt: 'Atlantic Coast Conference logo' },
  'big ten': { src: '/conferences/big-ten.png', alt: 'Big Ten Conference logo' },
  'big 10': { src: '/conferences/big-ten.png', alt: 'Big Ten Conference logo' },
  'big 12': { src: '/conferences/big-12.png', alt: 'Big 12 Conference logo' },
  'big twelve': { src: '/conferences/big-12.png', alt: 'Big 12 Conference logo' },
  sec: { src: '/conferences/sec.png', alt: 'Southeastern Conference logo' },
  'southeastern conference': { src: '/conferences/sec.png', alt: 'SEC logo' },
  'big east': { src: '/conferences/big-east.png', alt: 'Big East Conference logo' },
};

function normalize(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\b10\b/g, 'ten')
    .replace(/\b12\b/g, 'twelve');
}

function toLookupKey(n) {
  if (!n) return null;
  if (n === 'acc' || n.includes('atlantic coast')) return 'acc';
  if (n === 'sec' || n.includes('southeastern')) return 'sec';
  if (n === 'big ten' || n === 'bigten' || n === 'big 10') return 'big ten';
  if (n === 'big 12' || n === 'big12' || n === 'big twelve') return 'big 12';
  if (n === 'big east' || n === 'bigeast') return 'big east';
  return n;
}

/**
 * @param {string} conferenceName - e.g. "Big Ten", "ACC", "Big 12"
 * @returns {{ src: string, alt: string } | null}
 */
export function getConferenceLogo(conferenceName) {
  const n = normalize(conferenceName);
  const key = toLookupKey(n) ?? n;
  return CONF_TO_LOGO[key] ?? null;
}
