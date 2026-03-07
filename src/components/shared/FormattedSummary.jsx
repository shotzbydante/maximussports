/**
 * Renders chatbot summary text with **bold** and *italic* parsed into React elements.
 * Splits on double newlines for paragraphs.
 * Detects ALL-CAPS section labels (e.g. "ODDS PULSE:", "ATS SPOTLIGHT:") and renders
 * them as premium inline chip badges for better scannability.
 */

import { parseFormattedSummary } from '../../utils/chatSummary';
import styles from './FormattedSummary.module.css';

/** Match leading ALL-CAPS section labels like "ODDS PULSE:", "TODAY + TOMORROW:", etc. */
const SECTION_LABEL_RE = /^([A-Z][A-Z\s&+\-]*[A-Z])\s*:\s*/;

/** Map known label prefixes to color variants */
const CHIP_VARIANT_MAP = {
  'YESTERDAY RECAP':  'Slate',
  'RECAP':            'Slate',
  'ODDS PULSE':       'Blue',
  'TODAY':            'Blue',
  'TODAY + TOMORROW': 'Blue',
  'SCHEDULE':         'Blue',
  'ATS SPOTLIGHT':    'Green',
  'ATS':              'Green',
  'MARKET':           'Green',
  'NEWS PULSE':       'Gold',
  'NEWS PULSE + CLOSER': 'Gold',
  'CLOSER':           'Gold',
  'NEWS':             'Gold',
};

function getChipVariant(label) {
  const key = label.trim().toUpperCase();
  if (CHIP_VARIANT_MAP[key]) return CHIP_VARIANT_MAP[key];
  // Partial prefix matching for unrecognized labels
  for (const [prefix, variant] of Object.entries(CHIP_VARIANT_MAP)) {
    if (key.startsWith(prefix)) return variant;
  }
  return 'Blue';
}

export default function FormattedSummary({ text, className, as: Component = 'p' }) {
  if (!text || typeof text !== 'string') return null;
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
  return (
    <>
      {paragraphs.map((para, i) => {
        const match = para.match(SECTION_LABEL_RE);
        let label = null;
        let rest = para;
        if (match) {
          label = match[1];
          rest = para.slice(match[0].length);
        }
        const variant = label ? getChipVariant(label) : null;
        return (
          <Component key={i} className={className}>
            {label && (
              <span className={`${styles.sectionChip} ${styles[`chip${variant}`]}`}>
                {label}
              </span>
            )}
            {parseFormattedSummary(rest).map((part, j) => {
              if (part.type === 'text') return part.content;
              if (part.type === 'bold') return <strong key={j}>{part.content}</strong>;
              if (part.type === 'italic') return <em key={j}>{part.content}</em>;
              return part.content;
            })}
          </Component>
        );
      })}
    </>
  );
}
