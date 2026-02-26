/**
 * Maximus's Insight — instant client-side team summary. Chat/speech bubble style.
 * Synthesizes team, schedule, ATS, news, rank, and next-line data already on the page.
 * No streaming, no summary API calls. Renders with FormattedSummary (bold/italic/emojis).
 */

import { useMemo, useEffect } from 'react';
import { generateChatSummary } from '../../utils/chatSummary';
import FormattedSummary from '../shared/FormattedSummary';
import styles from './TeamSummaryBox.module.css';

export default function TeamSummaryBox({ slug, team, schedule, ats, news, rank = null, nextLine = null, dataReady = true }) {
  const summaryText = useMemo(() => {
    if (!team || !dataReady) return '';
    return generateChatSummary('team', {
      team,
      schedule: schedule ?? { upcoming: [], recent: [] },
      ats: ats ?? {},
      news: news ?? [],
      rank: rank ?? undefined,
      nextLine: nextLine ?? {},
    });
  }, [team, schedule, ats, news, rank, nextLine, dataReady]);

  useEffect(() => {
    if (import.meta.env.DEV && summaryText) {
      console.log('[chatSummary] team summary active', summaryText.slice(0, 80) + (summaryText.length > 80 ? '…' : ''));
    }
  }, [summaryText]);

  if (!slug || !team) return null;

  return (
    <section className={styles.bubble} aria-labelledby="team-summary-title">
      <div className={styles.header}>
        <img src="/mascot.png" alt="" className={styles.headerMascot} aria-hidden />
        <h2 id="team-summary-title" className={styles.title}>Maximus&apos;s Insight</h2>
      </div>
      <div className={styles.content}>
        {summaryText ? (
          <FormattedSummary text={summaryText} className={styles.summaryText} />
        ) : (
          <p className={styles.summaryText}>Loading today&apos;s intel…</p>
        )}
      </div>
    </section>
  );
}
