/**
 * AskAbout — a small "Ask Maximus" button for a page. Tapping it opens
 * the panel and sends the question, so the visitor gets an answer about the
 * thing they were looking at, not an empty box.
 *
 * Renders nothing when chat is not available to this visitor.
 */

import { mascotFor } from '../../brand/mascots';
import { useAsk } from './askState';
import a from './ask.module.css';

export default function AskAbout({ question, label = 'Ask Maximus', source = 'page', className = '' }) {
  const { enabled, openAsk } = useAsk();
  if (!enabled || !question) return null;
  return (
    <button type="button" className={`${a.about} ${className}`} onClick={() => openAsk({ question, source })}>
      <img src={mascotFor('nfl').flat} alt="" width="18" height="18" />
      {label}
    </button>
  );
}
