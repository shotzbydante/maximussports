/**
 * NflIntelFeed — videos and headlines, for the league or for one team.
 * Parallel to MlbIntelFeed / NbaIntelFeed.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import { fetchNflHeadlines, fetchNflTeamHeadlines, fetchNflVideos } from '../../api/nfl';
import s from './nfl.module.css';
import { trackStoryOpen, trackVideoOpen } from '../../analytics/sportEvents';

const TOPIC_LABEL = {
  injury: 'Injury',
  transactions: 'Transactions',
  odds: 'Odds',
  playoffs: 'Playoffs',
  preview: 'Preview',
};

function timeAgo(iso) {
  if (!iso) return '';
  const diffH = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (!Number.isFinite(diffH) || diffH < 0) return '';
  if (diffH < 1) return 'Just now';
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

export function HeadlineList({ headlines, surface = 'nfl_intel_feed' }) {
  return (
    <div className={s.list}>
      {headlines.map((h, i) => (
        <a
          key={h.id || h.link}
          href={h.link}
          target="_blank"
          rel="noopener noreferrer"
          className={s.listRow}
          onClick={() => trackStoryOpen({ sport: 'nfl', surface, story: h, position: i })}
        >
          <span>
            <span className={s.listTitle}>{h.title}</span>
            <span className={s.listMeta}>
              <span>{h.source}</span>
              {h.time && <span>{h.time}</span>}
              {h.topic && TOPIC_LABEL[h.topic] && <span className={s.pill}>{TOPIC_LABEL[h.topic]}</span>}
            </span>
          </span>
        </a>
      ))}
    </div>
  );
}

export function VideoGrid({ videos, surface = 'nfl_intel_feed' }) {
  return (
    <div className={s.videoGrid}>
      {videos.map((v, i) => (
        <a
          key={v.videoId}
          href={`https://www.youtube.com/watch?v=${v.videoId}`}
          target="_blank"
          rel="noopener noreferrer"
          className={s.video}
          onClick={() => trackVideoOpen({ sport: 'nfl', surface, video: v, position: i })}
        >
          <span className={s.videoThumb}>
            <img src={v.thumbUrl} alt="" loading="lazy" />
            <span className={s.videoPlay} aria-hidden>
              <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 1l7 4-7 4z" fill="currentColor" /></svg>
            </span>
          </span>
          <span className={s.videoTitle}>{v.title}</span>
          <span className={s.listMeta}>
            <span>{v.channelTitle}</span>
            {v.publishedAt && <span>{timeAgo(v.publishedAt)}</span>}
          </span>
        </a>
      ))}
    </div>
  );
}

/**
 * @param {object} props
 * @param {string} [props.team]        — team slug; omit for the league feed
 * @param {string} [props.title]
 * @param {number} [props.maxHeadlines=8]
 * @param {number} [props.maxVideos=4]
 * @param {boolean} [props.showMore=true] — link to the full News Feed
 */
export default function NflIntelFeed(props) {
  // Keyed by team so moving between team pages starts from a clean
  // loading state instead of showing the previous team's stories.
  return <Feed key={props.team || 'league'} {...props} />;
}

function Feed({ team = null, title = 'NFL intel feed', maxHeadlines = 8, maxVideos = 4, showMore = true }) {
  const { buildPath } = useWorkspace();
  const [headlines, setHeadlines] = useState(null);
  const [videos, setVideos] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (team ? fetchNflTeamHeadlines(team) : fetchNflHeadlines())
      .then((d) => { if (!cancelled) setHeadlines(d.headlines || []); });
    fetchNflVideos({ team, maxResults: maxVideos })
      .then((d) => { if (!cancelled) setVideos(d.items || []); });
    return () => { cancelled = true; };
  }, [team, maxVideos]);

  const loading = headlines === null || videos === null;
  if (!loading && headlines.length === 0 && videos.length === 0) return null;

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>{title}</h2>
        {showMore && <Link to={buildPath('/news')} className={s.sectionLink}>All news →</Link>}
      </div>
      {loading ? (
        <div className={s.skeleton} aria-busy="true" />
      ) : (
        <>
          {videos.length > 0 && <VideoGrid videos={videos.slice(0, maxVideos)} />}
          {headlines.length > 0 && (
            <div className={s.card}>
              <HeadlineList headlines={headlines.slice(0, maxHeadlines)} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
