/**
 * VenueFlyover — a looping aerial flyover of the stadium at the top of a
 * game module, from Google Maps Aerial View.
 *
 * It renders nothing unless Google has a video for the home venue, so a
 * module without one looks exactly as it did before. The video links are
 * fetched only once the module is on screen (each fetch is a billed
 * lookup), the clip plays muted while visible and pauses when scrolled
 * away, and people who ask for reduced motion or data saving get the still
 * image only. Google requires the "Google Maps" credit on the footage.
 *
 *   variant="card"  full game cards
 *   variant="tile"  the narrow tiles in a rail
 *   budget="landing" on the logged-out home page, which has its own smaller
 *                    share of the month's lookups
 */

import { useEffect, useRef, useState } from 'react';
import { flyoverVenueForGame } from '../../sports/venues/flyoverVenues';
import { fetchFlyover, fetchFlyoverCoverage } from '../../api/venueFlyover';
import { trackFlyoverView } from '../../analytics/sportEvents';
import s from './VenueFlyover.module.css';

function stillOnly() {
  if (typeof window === 'undefined') return true;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  return !!reduced || !!navigator.connection?.saveData;
}

function Flyover({ sport, venue, variant, surface, budget }) {
  const { team, name } = venue;
  const [available, setAvailable] = useState(false);
  const [seen, setSeen] = useState(false);     // has been on screen at least once
  const [inView, setInView] = useState(false);
  const [media, setMedia] = useState(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const boxRef = useRef(null);
  const videoRef = useRef(null);
  const tracked = useRef(false);
  const retried = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchFlyoverCoverage(sport, { budget }).then((c) => {
      if (!cancelled) setAvailable(!c.capped && c.venues?.[team]?.state === 'active');
    });
    return () => { cancelled = true; };
  }, [sport, team, budget]);

  useEffect(() => {
    const el = boxRef.current;
    if (!available || !el) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      const id = setTimeout(() => { setSeen(true); setInView(true); }, 0);
      return () => clearTimeout(id);
    }
    const io = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting);
      if (entry.isIntersecting) setSeen(true);
    }, { rootMargin: '120px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [available]);

  useEffect(() => {
    if (!available || !seen || media || failed) return undefined;
    let cancelled = false;
    fetchFlyover(sport, team, { budget }).then((d) => {
      if (cancelled) return;
      if (d?.state === 'active' && (d.mp4Low || d.poster)) setMedia(d);
      else setFailed(true);
    });
    return () => { cancelled = true; };
  }, [available, seen, media, failed, sport, team, budget]);

  const withVideo = !!media?.mp4Low && !stillOnly();

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (inView) {
      vid.muted = true;
      vid.play?.()?.catch?.(() => {});
    } else {
      vid.pause?.();
    }
  }, [inView, media, withVideo]);

  if (!available || failed) return null;

  // Google's links expire. If one has, ask once for a fresh set, then give up quietly.
  const onMediaError = () => {
    if (retried.current) { setFailed(true); return; }
    retried.current = true;
    setPlaying(false);
    fetchFlyover(sport, team, { fresh: true, budget }).then((d) => {
      if (d?.state === 'active' && (d.mp4Low || d.poster)) setMedia(d);
      else setFailed(true);
    });
  };

  const onPlaying = () => {
    setPlaying(true);
    if (tracked.current) return;
    tracked.current = true;
    trackFlyoverView({ sport, surface, venue: name });
  };

  const wide = typeof window !== 'undefined' && window.innerWidth >= 900 && variant !== 'tile';
  const src = withVideo ? (wide ? media.mp4Medium : media.mp4Low) : null;

  return (
    <figure
      ref={boxRef}
      className={`${s.flyover} ${variant === 'tile' ? s.tile : ''}`}
      aria-label={`Aerial view of ${name}, from Google Maps`}
    >
      {media?.poster && (
        <img className={s.media} src={media.poster} alt="" decoding="async" onError={src ? undefined : onMediaError} />
      )}
      {src && (
        <video
          ref={videoRef}
          className={`${s.media} ${s.video} ${playing ? s.videoOn : ''}`}
          src={src}
          muted
          loop
          playsInline
          preload="none"
          disablePictureInPicture
          tabIndex={-1}
          aria-hidden="true"
          onPlaying={onPlaying}
          onError={onMediaError}
        />
      )}
      <figcaption className={s.caption}>
        <span className={s.venue}>{name}</span>
        <span className={s.credit} translate="no">Google Maps</span>
      </figcaption>
    </figure>
  );
}

export default function VenueFlyover({ sport, game, variant = 'card', surface, budget = null }) {
  const venue = flyoverVenueForGame(sport, game);
  if (!venue) return null;
  // Keyed by venue so a module reused for another game starts clean.
  return <Flyover key={`${sport}:${venue.team}`} sport={sport} venue={venue} variant={variant} surface={surface || `${sport}_game_${variant}`} budget={budget} />;
}
