/**
 * NFL News Feed — headlines filtered by topic, plus the video feed.
 */

import { useEffect, useMemo, useState } from 'react';
import SEOHead from '../../components/seo/SEOHead';
import { HeadlineList, VideoGrid } from '../../components/nfl/NflIntelFeed';
import { fetchNflHeadlines, fetchNflVideos } from '../../api/nfl';
import s from '../../components/nfl/nfl.module.css';

const TOPICS = [
  { key: 'all', label: 'All' },
  { key: 'injury', label: 'Injuries' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'playoffs', label: 'Playoff picture' },
  { key: 'odds', label: 'Odds' },
  { key: 'preview', label: 'Previews' },
];

export default function NflNewsFeed() {
  const [headlines, setHeadlines] = useState(null);
  const [videos, setVideos] = useState(null);
  const [topic, setTopic] = useState('all');

  useEffect(() => {
    let cancelled = false;
    fetchNflHeadlines().then((d) => { if (!cancelled) setHeadlines(d.headlines || []); });
    fetchNflVideos({ maxResults: 8 }).then((d) => { if (!cancelled) setVideos(d.items || []); });
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => {
    const c = { all: (headlines || []).length };
    for (const h of headlines || []) if (h.topic) c[h.topic] = (c[h.topic] || 0) + 1;
    return c;
  }, [headlines]);

  const visible = useMemo(
    () => (topic === 'all' ? headlines || [] : (headlines || []).filter((h) => h.topic === topic)),
    [headlines, topic],
  );

  return (
    <div className={s.page}>
      <SEOHead
        title="NFL News: Injuries, Trades, Playoff Picture & Odds"
        description="The NFL headlines that move lines: injury reports, quarterback changes, trades, the playoff picture and odds news, plus the latest video."
      />
      <header className={s.pageHeader}>
        <span className={s.eyebrow}>NFL</span>
        <h1 className={s.pageTitle}>News feed</h1>
        <p className={s.pageSubtitle}>
          Ranked for what moves a line: injuries, quarterback changes, trades and the playoff picture come first.
        </p>
      </header>

      <section className={s.section}>
        <div className={s.tabs} role="tablist" aria-label="Filter headlines by topic" style={{ flexWrap: 'wrap', alignSelf: 'flex-start' }}>
          {TOPICS.filter((t) => t.key === 'all' || counts[t.key] > 0).map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={topic === t.key}
              className={`${s.tab} ${topic === t.key ? s.tabActive : ''}`}
              onClick={() => setTopic(t.key)}
            >
              {t.label}
              {counts[t.key] > 0 && <span className={s.tabCount}>{counts[t.key]}</span>}
            </button>
          ))}
        </div>

        {headlines === null ? (
          <div className={s.skeleton} style={{ minHeight: 320 }} aria-busy="true" />
        ) : visible.length === 0 ? (
          <div className={s.empty}>
            <span className={s.emptyTitle}>No headlines right now</span>
            The feed refreshes every few minutes.
          </div>
        ) : (
          <div className={s.card}><HeadlineList headlines={visible} /></div>
        )}
      </section>

      {videos?.length > 0 && (
        <section className={s.section}>
          <h2 className={s.sectionTitle}>Latest video</h2>
          <VideoGrid videos={videos} />
        </section>
      )}
    </div>
  );
}
