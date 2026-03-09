/**
 * Conference name → logo asset. Returns { src, alt } when we have a real PNG; null otherwise.
 * Normalizes: trim, lowercase, "Big 10" → "Big Ten", "Big-12" → "Big 12", etc.
 */

const CONF_TO_LOGO = {
  acc:         { src: '/conferences/acc.svg', alt: 'Atlantic Coast Conference logo' },
  'big ten':   { src: '/conferences/big-ten.svg', alt: 'Big Ten Conference logo' },
  'big 10':    { src: '/conferences/big-ten.svg', alt: 'Big Ten Conference logo' },
  'big 12':    { src: '/conferences/big-12.svg', alt: 'Big 12 Conference logo' },
  'big twelve': { src: '/conferences/big-12.svg', alt: 'Big 12 Conference logo' },
  sec:         { src: '/conferences/sec.svg', alt: 'Southeastern Conference logo' },
  'southeastern conference': { src: '/conferences/sec.svg', alt: 'SEC logo' },
  'big east':  { src: '/conferences/big-east.svg', alt: 'Big East Conference logo' },
  wcc:         { src: '/conferences/wcc.svg', alt: 'West Coast Conference logo' },
  'mountain west': { src: '/conferences/mwc.svg', alt: 'Mountain West Conference logo' },
  mwc:         { src: '/conferences/mwc.svg', alt: 'Mountain West Conference logo' },
  aac:         { src: '/conferences/aac.svg', alt: 'American Athletic Conference logo' },
  'a10':       { src: '/conferences/a10.svg', alt: 'Atlantic 10 Conference logo' },
  'a-10':      { src: '/conferences/a10.svg', alt: 'Atlantic 10 Conference logo' },
  mvc:         { src: '/conferences/mvc.svg', alt: 'Missouri Valley Conference logo' },
  mac:         { src: '/conferences/mac.svg', alt: 'Mid-American Conference logo' },
  cusa:        { src: '/conferences/cusa.svg', alt: 'Conference USA logo' },
  southland:   { src: '/conferences/southland.svg', alt: 'Southland Conference logo' },
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
  if (n === 'wcc' || n.includes('west coast')) return 'wcc';
  if (n === 'mountain west' || n === 'mwc') return 'mountain west';
  if (n === 'aac' || n.includes('american athletic')) return 'aac';
  if (n === 'a10' || n === 'a 10' || n.includes('atlantic 10') || n.includes('atlantic ten')) return 'a-10';
  if (n === 'mvc' || n.includes('missouri valley')) return 'mvc';
  if (n === 'mac' || n.includes('mid american')) return 'mac';
  if (n === 'cusa' || n.includes('conference usa') || n === 'c usa') return 'cusa';
  if (n === 'southland') return 'southland';
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
