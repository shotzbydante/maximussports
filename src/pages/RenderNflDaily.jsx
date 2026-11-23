/**
 * RenderNflDaily: hidden page the server screenshots to make the NFL daily
 * post. It mounts the same three slides the Content Studio shows, from the
 * same payload, and publishes the caption built from that payload on
 * window.__POST__, so the images and the words cannot disagree.
 *
 * Data: window.__RENDER_DATA__ ({ picks, games, scorecard, nextWeek, now })
 * when the server injects it, otherwise the studio's own endpoints.
 * Readiness: window.__SLIDES_READY__ = true once fonts and images settle.
 */
import { useEffect, useRef, useState } from 'react';
import { getNflSlides } from '../components/dashboard/slides/nfl';
import { normalizeNflStudioPayload, nflSectionReady } from '../features/nfl/contentStudio/normalizeNflStudioPayload';
import { buildNflCaption } from '../features/nfl/contentStudio/buildNflCaption';

const SOURCES = {
  picks: '/api/nfl/picks/built',
  games: '/api/nfl/live/games?status=all&sort=startTime',
  scorecard: '/api/nfl/picks/scorecard',
  nextWeek: '/api/nfl/live/next-week',
};

async function load() {
  const keys = Object.keys(SOURCES);
  const settled = await Promise.allSettled(keys.map((k) => fetch(SOURCES[k]).then((r) => (r.ok ? r.json() : null))));
  return Object.fromEntries(keys.map((k, i) => [k, settled[i].status === 'fulfilled' ? settled[i].value : null]));
}

export default function RenderNflDaily() {
  const [payload, setPayload] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = (typeof window !== 'undefined' && window.__RENDER_DATA__) || await load();
      const p = normalizeNflStudioPayload({
        section: 'nfl-daily', picks: raw.picks, games: raw.games, season: null, scorecard: raw.scorecard,
        nextWeek: raw.nextWeek, now: raw.now ? new Date(raw.now) : new Date(),
      });
      if (!cancelled) setPayload(p);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!payload) return;
    (async () => {
      try { await document.fonts.ready; } catch { /* no fonts API */ }
      const images = Array.from(ref.current?.querySelectorAll('img') || []);
      await Promise.all(images.map((img) => (img.complete ? null : new Promise((resolve) => {
        img.onload = resolve; img.onerror = resolve; setTimeout(resolve, 3000);
      }))));
      await new Promise((r) => setTimeout(r, 600));
      const caption = buildNflCaption(payload);
      const d = payload.daily;
      window.__POST__ = {
        ready: nflSectionReady(payload).ok,
        caption,
        week: payload.week,
        slateLabel: payload.slateLabel,
        summary: { hits: d?.hits?.count ?? 0, hitsDay: d?.hits?.dayName ?? null, tonight: d?.tonight ? `${d.tonight.away.abbrev} @ ${d.tonight.home.abbrev}` : null, ahead: d?.ahead?.games?.length ?? 0 },
      };
      window.__SLIDES_READY__ = true;
    })();
  }, [payload]);

  if (!payload) return <div style={{ color: '#fff', padding: 40 }}>Loading…</div>;
  const slides = getNflSlides('nfl-daily');
  return (
    <div ref={ref} style={{ background: '#000', width: 1080 }}>
      {slides.map((Slide, i) => (
        <Slide key={i} data={payload} slideNumber={i + 1} slideTotal={slides.length} data-slide={i + 1} />
      ))}
    </div>
  );
}
