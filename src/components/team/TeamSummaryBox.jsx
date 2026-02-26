/**
 * Maximus's Insight — instant client-side team summary. Chat/speech bubble style.
 * Synthesizes team, schedule, ATS, news, rank, and next-line data already on the page.
 */

import { useMemo } from 'react';
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
          <p className={styles.summaryText}>Loading team data…</p>
        )}
      </div>
    </section>
  );
}
