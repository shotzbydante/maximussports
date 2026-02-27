import { useState } from 'react';
import styles from './NewsFeed.module.css';

const TABS = [
  { id: 'headlines', label: 'Headlines' },
  { id: 'video',     label: 'Video',     comingSoon: true },
];

/** Placeholder for the future embedded video slot. */
function VideoSlot() {
  return (
    <div className={styles.videoSlot} aria-label="Video highlights — coming soon">
      <div className={styles.videoSlotIcon}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
          <circle cx="16" cy="16" r="15" stroke="currentColor" strokeWidth="1.5" />
          <path d="M13 11L22 16L13 21V11Z" fill="currentColor" opacity="0.7" />
        </svg>
      </div>
      <div className={styles.videoSlotText}>
        <span className={styles.videoSlotTitle}>Video highlights coming soon</span>
        <span className={styles.videoSlotSub}>
          Relevant breakdowns and pressers will appear here
        </span>
      </div>
    </div>
  );
}

export default function NewsFeed({ items = [], source = 'Mock', loading = false }) {
  const [activeTab, setActiveTab] = useState('headlines');

  // Compute display labels dynamically
  const resolvedTabs = TABS.map((tab) => {
    if (tab.id === 'headlines' && items.length > 0) {
      return { ...tab, label: `Headlines (${items.length})` };
    }
    return tab;
  });

  return (
    <div className={styles.widget}>
      {/* Header: title + content-type tabs */}
      <div className={styles.widgetHeader}>
        <span className={styles.title}>Intel Feed</span>
        <div className={styles.tabs} role="tablist" aria-label="Intel feed content type">
          {resolvedTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-disabled={tab.comingSoon ?? false}
              className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''} ${tab.comingSoon ? styles.tabDisabled : ''}`}
              onClick={() => !tab.comingSoon && setActiveTab(tab.id)}
            >
              {tab.label}
              {tab.comingSoon && <span className={styles.tabSoon}>Soon</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Featured slot — visible on video tab, hidden on headlines */}
      {activeTab === 'video' && <VideoSlot />}

      {/* Headlines tab content */}
      {activeTab === 'headlines' && (
        <>
          {loading ? (
            <div className={styles.loadingList}>
              {[1, 2, 3].map((n) => (
                <div key={n} className={styles.skeletonItem}>
                  <div className={styles.skeletonBadge} />
                  <div className={styles.skeletonLine} style={{ width: n === 1 ? '100%' : n === 2 ? '88%' : '75%' }} />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className={styles.empty}>No basketball news available. Check back soon.</p>
          ) : (
            <ul className={styles.list}>
              {items.map((item) => {
                const src = item.source || source;
                return (
                  <li key={item.id} className={styles.item}>
                    <div className={styles.itemMeta}>
                      <span className={styles.sourceBadge}>{src}</span>
                      <span className={styles.time}>{item.time}</span>
                    </div>
                    <div className={styles.headline}>
                      {item.link ? (
                        <a href={item.link} target="_blank" rel="noopener noreferrer" className={styles.link}>
                          {item.title}
                        </a>
                      ) : (
                        item.title
                      )}
                    </div>
                    {item.excerpt && <p className={styles.excerpt}>{item.excerpt}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
