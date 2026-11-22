/**
 * HomeFeed — videos in a rail and the day's headlines in one tight list.
 */

import { useEffect, useState } from 'react';
import { useWorkspace } from '../../../workspaces/WorkspaceContext';
import { fetchNflHeadlines, fetchNflVideos } from '../../../api/nfl';
import { SectionHead, Rail } from './HomeParts';
import { timeAgo, teamsMentioned } from './format';
import { TeamTag } from './NflTeamTag';
import h from './home.module.css';
import { trackStoryOpen, trackVideoOpen } from '../../../analytics/sportEvents';

const TOPIC = { injury: 'Injury', transactions: 'Transactions', odds: 'Odds', playoffs: 'Playoffs', preview: 'Preview' };

export function HomeVideos({ max = 6 }) {
  const [videos, setVideos] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetchNflVideos({ maxResults: max }).then((d) => { if (!cancelled) setVideos(d.items || []); });
    return () => { cancelled = true; };
  }, [max]);

  if (videos && videos.length === 0) return null;

  return (
    <section className={h.section} aria-label="Videos">
      <SectionHead title="Watch" />
      {videos === null ? (
        <div className={h.skeleton} aria-busy="true" />
      ) : (
        <Rail label="NFL videos" narrow cap={4}>
          {videos.map((v, i) => (
            <a
              key={v.videoId}
              href={`https://www.youtube.com/watch?v=${v.videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className={h.video}
              role="listitem"
              onClick={() => trackVideoOpen({ sport: 'nfl', surface: 'nfl_home', video: v, position: i })}
            >
              <span className={h.videoThumb}>
                {v.thumbUrl && <img src={v.thumbUrl} alt="" loading="lazy" />}
                <span className={h.videoPlay} aria-hidden="true">
                  <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 1v8l7-4z" fill="currentColor" /></svg>
                </span>
              </span>
              <span className={h.videoTitle}>{v.title}</span>
              <span className={h.small}>{[v.channelTitle, timeAgo(v.publishedAt)].filter(Boolean).join(', ')}</span>
            </a>
          ))}
        </Rail>
      )}
    </section>
  );
}

export function HomeHeadlines({ max = 6 }) {
  const { buildPath } = useWorkspace();
  const [headlines, setHeadlines] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetchNflHeadlines().then((d) => { if (!cancelled) setHeadlines(d.headlines || []); });
    return () => { cancelled = true; };
  }, []);

  if (headlines && headlines.length === 0) return null;

  return (
    <section className={h.section} aria-label="Headlines">
      <SectionHead title="Headlines" to={buildPath('/news')} moreLabel="All news" />
      {headlines === null ? (
        <div className={h.skeleton} aria-busy="true" />
      ) : (
        <div className={`${h.card} ${h.cardFlush}`}>
          {headlines.slice(0, max).map((x, i) => (
            <a
              key={x.id || x.link}
              href={x.link}
              target="_blank"
              rel="noopener noreferrer"
              className={h.story}
              onClick={() => trackStoryOpen({ sport: 'nfl', surface: 'nfl_home', story: x, position: i })}
            >
              <span className={h.storyTitle}>{x.title}</span>
              <span className={h.storyMeta}>
                {teamsMentioned(x.title).slice(0, 3).map((slug) => <TeamTag key={slug} slug={slug} size={16} />)}
                {TOPIC[x.topic] && <span className={h.chip}>{TOPIC[x.topic]}</span>}
                <span>{[x.source, x.time].filter(Boolean).join(', ')}</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
