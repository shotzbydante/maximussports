/**
 * How an answer's words are laid out.
 *
 * Maximus writes a lead sentence, then optional points, one per line, each
 * starting with "- " and usually a short label: "- Risk: Denver's run
 * defense is graded 34." This turns that text into blocks to draw: the lead
 * set large, each point as a row with an icon and its label. Text without
 * points comes back as plain paragraphs, so older answers look as they did.
 */

const ICONS = [
  [/^(why|reason|reasoning|the case)/i, '🧠'],
  [/^(edge|value|price|market|best price|line)/i, '💰'],
  [/^(matchup|mismatch|units?|trenches|position)/i, '🧱'],
  [/^(risk|caveat|concern|watch|against)/i, '⚠️'],
  [/^(weather|wind|rain|snow|conditions|forecast)/i, '🌬️'],
  [/^(quarterbacks?|qb)/i, '🏈'],
  [/^(injur|health|availability)/i, '🚑'],
  [/^(strength|conviction|confidence|how strong)/i, '📶'],
  [/^(lean|projection|model)/i, '📐'],
  [/^(pick|call|the play|bet)/i, '🎯'],
  [/^(spot|schedule|rest|travel|trap)/i, '🗓️'],
  [/^(record|results?|form|trend)/i, '📒'],
  [/^(live|score|standing)/i, '📺'],
  [/^(news|report)/i, '📰'],
  [/^(next|also|note)/i, '👉'],
];

export const iconFor = (label) => (ICONS.find(([re]) => re.test(label || '')) || [null, '•'])[1];

/** "Risk: text" -> { label: 'Risk', text }. A label is short and comes before the first colon. */
function splitLabel(line) {
  const m = /^([A-Za-z][A-Za-z '’/&-]{1,24}):\s+(.+)$/.exec(line);
  return m ? { label: m[1].trim(), text: m[2].trim() } : { label: '', text: line };
}

export function parseAnswer(text) {
  const blocks = [];
  let para = [];
  let points = null;
  const flushPara = () => { if (para.length) { blocks.push({ type: 'text', text: para.join(' ') }); para = []; } };
  const flushPoints = () => { if (points) { blocks.push({ type: 'points', items: points }); points = null; } };
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) { flushPara(); flushPoints(); continue; }
    if (/^-\s+/.test(line)) {
      flushPara();
      const item = splitLabel(line.replace(/^-\s+/, ''));
      (points ||= []).push({ ...item, icon: iconFor(item.label) });
    } else {
      flushPoints();
      para.push(line);
    }
  }
  flushPara(); flushPoints();
  // The first paragraph leads only when something structured follows it.
  if (blocks.length > 1 && blocks[0].type === 'text' && blocks.some((b) => b.type === 'points')) blocks[0].lead = true;
  return blocks;
}
