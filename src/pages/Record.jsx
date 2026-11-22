import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import NflScorecardReport from '../components/nfl/NflScorecardReport';
import styles from './Record.module.css';

const RULES = [
  ['Posted before kickoff.', 'A pick is locked at a specific price at a specific sportsbook, with a timestamp. That ticket is what gets graded, even if the line moves afterwards.'],
  ['Graded at the posted price.', 'One unit risked per pick. A win pays what that price paid; a loss costs one unit; a push returns it.'],
  ['Measured against the close.', 'For every pick we record the last line before kickoff. Beating that closing line is the best evidence a price was good, whatever the final score.'],
  ['Nothing is removed.', 'Losing picks stay on this page. Picks we tracked but did not publish are counted separately and never mixed into the record.'],
];

export default function Record() {
  useEffect(() => {
    const prev = document.title;
    document.title = 'The Record | Maximus Sports';
    return () => { document.title = prev; };
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>Every pick, every price, every result</p>
        <h1 className={styles.title}>The record</h1>
        <p className={styles.lede}>
          Maximus Sports publishes its NFL picks before kickoff and grades them in public. This page is the
          whole ledger: what we bet, the price we took, where the line closed and how it finished.
        </p>
      </header>

      <section className={styles.rules} aria-label="How grading works">
        <h2 className={styles.h2}>How grading works</h2>
        <ol className={styles.ruleList}>
          {RULES.map(([head, body]) => (
            <li key={head}><b>{head}</b> {body}</li>
          ))}
        </ol>
      </section>

      <section aria-label="NFL record">
        <NflScorecardReport variant="full" insightsHref="/nfl/insights" />
      </section>

      <p className={styles.footnote}>
        Other sports are graded on their own pages. For entertainment only. 21+. Gambling problem? Call 1-800-GAMBLER.{' '}
        <Link to="/nfl/insights">See this week&rsquo;s picks</Link>
      </p>
    </div>
  );
}
