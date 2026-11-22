/**
 * NflProse — the written commentary, with **bold** and *italic* parsed and
 * a logo placed next to every team it names.
 */

import { parseFormattedSummary } from '../../../utils/chatSummary';
import { TeamText } from './NflTeamTag';

export default function NflProse({ text }) {
  if (!text || typeof text !== 'string') return null;
  return text.split(/\n\n+/).filter((p) => p.trim()).map((para, i) => (
    <p key={i}>
      {parseFormattedSummary(para).map((part, j) => {
        if (part.type === 'bold') return <strong key={j}><TeamText text={part.content} /></strong>;
        if (part.type === 'italic') return <em key={j}><TeamText text={part.content} /></em>;
        return <TeamText key={j} text={part.content} />;
      })}
    </p>
  ));
}
