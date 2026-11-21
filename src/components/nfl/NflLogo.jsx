/**
 * NflLogo — a team logo that removes itself if the image fails to load,
 * so a blocked or missing asset never shows a broken-image icon.
 */
import { getNflLogoUrl } from '../../sports/nfl/teams';

export default function NflLogo({ slug, src, size = 24, className }) {
  const url = src || getNflLogoUrl(slug);
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      className={className}
      loading="lazy"
      onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
    />
  );
}
