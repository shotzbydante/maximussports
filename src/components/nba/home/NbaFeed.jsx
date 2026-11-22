/**
 * NbaFeed — videos in a rail and the day's headlines in one tight list,
 * the same two blocks the NFL home page ends with.
 */

import { useEffect, useState } from 'react';
import { useWorkspace } from '../../../workspaces/WorkspaceContext';
import { fetchNbaHeadlines } from '../../../api/nbaNews';
import { fetchNbaVideos } from '../../../api/nba';
import { SectionHead, Rail } from '../../nfl/home/HomeParts';
import { timeAgo, nbaTeamsMentioned } from './nbaFormat';
import { TeamTag } from './NbaTeamTag';
import { trackStoryOpen, trackVideoOpen } from '../../../analytics/sportEvents';
import h from '../../nfl/home/home.module.css';

const TOPIC = { injury: 'Injury', transactions: 'Transactions', odds: 'Odds', playoffs: 'Playoffs', preview: 'Preview', 'play-in': 'Play-in' };

export function NbaVideos({ max = 6 }) {
  const [videos, setVideos] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetchNbaVideos({ maxResults: max }).then((d) => { if (!cancelled) setVideos(d.items || []); });
    return () => { cancelled = true; };
  }, [max]);

  if (videos && videos.length === 0) return null;

  return (
    <section className={h.section} aria-label="Videos">
      <SectionHead title="Watch" />
      {videos === null ? (
        <div className={h.skeleton} aria-busy="true" />
      ) : (
        <Rail label="NBA videos" narrow cap={4}>
          {videos.slice(0, max).map((v, i) => (
            <a
              key={v.videoId}
              href={`https://www.youtube.com/watch?v=${v.videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className={h.video}
              role="listitem"
              onClick={() => trackVideoOpen({ sport: 'nba', surface: 'nba_home', video: v, position: i })}
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

export function NbaHeadlines({ max = 6 }) {
  const { buildPath } = useWorkspace();
  const [headlines, setHeadlines] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetchNbaHeadlines().then((d) => { if (!cancelled) setHeadlines(d.headlines || []); });
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
              onClick={() => trackStoryOpen({ sport: 'nba', surface: 'nba_home', story: x, position: i })}
            >
              <span className={h.storyTitle}>{x.title}</span>
              <span className={h.storyMeta}>
                {nbaTeamsMentioned(x.title).slice(0, 3).map((slug) => <TeamTag key={slug} slug={slug} size={16} />)}
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
