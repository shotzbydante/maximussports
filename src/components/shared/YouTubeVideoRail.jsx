/**
 * YouTubeVideoRail — horizontal scroll rail (mobile) / row grid (desktop).
 * Accepts an items array and an onSelect(video) handler.
 */
import YouTubeVideoCard from './YouTubeVideoCard';
import styles from './YouTubeVideoRail.module.css';

export default function YouTubeVideoRail({ items = [], onSelect }) {
  if (!items.length) return null;

  return (
    <div className={styles.rail} role="list" aria-label="Video highlights">
      {items.map((video) => (
        <div key={video.videoId} className={styles.item} role="listitem">
          <YouTubeVideoCard video={video} onSelect={onSelect} />
        </div>
      ))}
    </div>
  );
}
