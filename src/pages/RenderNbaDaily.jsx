/**
 * RenderNbaDaily — hidden render page for headless browser screenshot capture.
 *
 * Mirrors RenderMlbDaily exactly. Mounts the REAL NbaDailySlide1/2/3
 * components at full 1080×1350 resolution using the exact CSS modules +
 * theme as Content Studio. Puppeteer navigates here, waits for readiness,
 * screenshots each [data-slide] element → pixel-identical PNGs.
 *
 * Data injection:
 *   - Puppeteer sets window.__RENDER_DATA__ via evaluateOnNewDocument()
 *   - If not present, fetches canonical NBA endpoints as fallback.
 *
 * Readiness signal:
 *   - Sets window.__SLIDES_READY__ = true once fonts + images settle.
 */

import { useState, useEffect, useRef } from 'react';
import NbaDailySlide1 from '../components/dashboard/slides/NbaDailySlide1';
import NbaDailySlide2 from '../components/dashboard/slides/NbaDailySlide2';
import NbaDailySlide3 from '../components/dashboard/slides/NbaDailySlide3';
import { normalizeNbaImagePayload } from '../features/nba/contentStudio/normalizeNbaImagePayload';

const SLIDE_W = 1080;
const SLIDE_H = 1350;

async function fetchSlideData() {
  // NEW: pull a 7-day playoff schedule window so series state reflects
  // actual game results (last week of finals), not just static bracket
  // placeholders. This is the data-accuracy fix for the "OKC vs Play-In
  // Winner — series tied 0-0" bug from the audit screenshots.
  // Postseason leaders are fetched explicitly via ?seasonType=postseason
  // so Slide 2 shows playoff leaders during the playoffs, not regular
  // season leaders.
  const [gamesRes, windowRes, picksRes, oddsRes, leadersRes, standingsRes, newsRes] = await Promise.allSettled([
    fetch('/api/nba/live/games?status=all').then(r => r.ok ? r.json() : { games: [] }),
    fetch('/api/nba/playoff-window?daysBack=7&daysForward=1').then(r => r.ok ? r.json() : { games: [] }),
    fetch('/api/nba/picks/built').then(r => r.ok ? r.json() : { categories: {} }),
    fetch('/api/nba/odds/championship').then(r => r.ok ? r.json() : { odds: {} }),
    fetch('/api/nba/leaders?seasonType=postseason').then(r => r.ok ? r.json() : { categories: {} }),
    fetch('/api/nba/standings').then(r => r.ok ? r.json() : { teams: {} }),
    fetch('/api/nba/news/headlines').then(r => r.ok ? r.json() : { headlines: [] }),
  ]);

  const games = gamesRes.status === 'fulfilled' ? (gamesRes.value.games || []) : [];
  const windowGames = windowRes.status === 'fulfilled' ? (windowRes.value?.games || []) : [];
  const picks = picksRes.status === 'fulfilled' ? picksRes.value : { categories: {} };
  const odds = oddsRes.status === 'fulfilled' ? (oddsRes.value?.odds || {}) : {};
  const leaders = leadersRes.status === 'fulfilled' ? leadersRes.value : { categories: {} };
  const standingsRaw = standingsRes.status === 'fulfilled' ? standingsRes.value : { teams: {} };
  const news = newsRes.status === 'fulfilled'
    ? (Array.isArray(newsRes.value) ? newsRes.value : newsRes.value?.headlines || [])
    : [];

  return normalizeNbaImagePayload({
    activeSection: 'nba-daily',
    nbaPicks: picks,
    nbaLiveGames: games,
    nbaWindowGames: windowGames,
    nbaChampOdds: odds,
    nbaStandings: standingsRaw?.teams || {},
    nbaLeaders: leaders,
    nbaNews: news,
  });
}

export default function RenderNbaDaily() {
  const [data, setData] = useState(null);
  const [ready, setReady] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      let slideData = typeof window !== 'undefined' ? window.__RENDER_DATA__ : null;

      if (!slideData) {
        console.log('[RenderNbaDaily] No injected data, fetching from APIs...');
        slideData = await fetchSlideData();
      } else {
        console.log('[RenderNbaDaily] Using injected data');
        // If injected data isn't already a canonical payload, normalize it
        if (!slideData.section || !slideData.playoffOutlook) {
          slideData = normalizeNbaImagePayload({
            activeSection: 'nba-daily',
            nbaPicks: slideData.nbaPicks,
            nbaLiveGames: slideData.nbaLiveGames || [],
            nbaWindowGames: slideData.nbaWindowGames || null,
            nbaChampOdds: slideData.nbaChampOdds || null,
            nbaStandings: slideData.nbaStandings || null,
            nbaLeaders: slideData.nbaLeaders || null,
            nbaNews: slideData.nbaNews || [],
          });
        }
      }

      if (!cancelled) setData(slideData);
    }

    init();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!data) return;

    async function waitForReady() {
      try { await document.fonts.ready; } catch { /* fonts API may be absent */ }

      const images = containerRef.current?.querySelectorAll('img') || [];
      const imagePromises = Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
          setTimeout(resolve, 3000);
        });
      });
      await Promise.all(imagePromises);

      await new Promise(r => setTimeout(r, 800));

      window.__SLIDES_READY__ = true;
      setReady(true);
      console.log('[RenderNbaDaily] Slides ready for capture');
    }

    waitForReady();
  }, [data]);

  if (!data) {
    return (
      <div style={{ background: '#000', color: '#fff', padding: 40, fontFamily: 'Inter, sans-serif' }}>
        Loading NBA slide data…
      </div>
    );
  }

  const asOf = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Los_Angeles', timeZoneName: 'short',
  });

  const slideProps = { data, asOf, slideTotal: 3 };

  return (
    <div
      ref={containerRef}
      style={{
        background: '#000',
        padding: 0, margin: 0,
        display: 'flex', flexDirection: 'column', gap: 0,
      }}
    >
      <div style={{ width: SLIDE_W, height: SLIDE_H, overflow: 'hidden', position: 'relative' }}>
        <NbaDailySlide1 {...slideProps} slideNumber={1} />
      </div>
      <div style={{ width: SLIDE_W, height: SLIDE_H, overflow: 'hidden', position: 'relative' }}>
        <NbaDailySlide2 {...slideProps} slideNumber={2} />
      </div>
      <div style={{ width: SLIDE_W, height: SLIDE_H, overflow: 'hidden', position: 'relative' }}>
        <NbaDailySlide3 {...slideProps} slideNumber={3} />
      </div>

      <div
        id="render-status"
        data-ready={ready ? 'true' : 'false'}
        style={{ position: 'fixed', bottom: 0, right: 0, fontSize: 0, opacity: 0 }}
      />
    </div>
  );
}
