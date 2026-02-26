/**
 * Renders chatbot summary text with **bold** and *italic* parsed into React elements.
 * Splits on double newlines for paragraphs.
 */

import { parseFormattedSummary } from '../../utils/chatSummary';

export default function FormattedSummary({ text, className, as: Component = 'p' }) {
  if (!text || typeof text !== 'string') return null;
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
  return (
    <>
      {paragraphs.map((para, i) => (
        <Component key={i} className={className}>
          {parseFormattedSummary(para).map((part, j) => {
            if (part.type === 'text') return part.content;
            if (part.type === 'bold') return <strong key={j}>{part.content}</strong>;
            if (part.type === 'italic') return <em key={j}>{part.content}</em>;
            return part.content;
          })}
        </Component>
      ))}
    </>
  );
}
