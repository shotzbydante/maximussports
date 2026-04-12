/**
 * RenderMlbDaily — Hidden render page for headless browser screenshot capture.
 *
 * This page renders the REAL MlbDailySlide1/2/3 components at full 1080x1350
 * resolution using the exact same CSS modules and design system as the Content
 * Studio. Puppeteer navigates here, waits for readiness, then screenshots each
 * `[data-slide]` element to produce pixel-identical PNGs.
 *
 * Data injection:
 *   - Puppeteer sets `window.__RENDER_DATA__` via evaluateOnNewDocument()
 *   - If not present, fetches from live APIs as fallback
 *
 * Readiness signal:
 *   - Sets `window.__SLIDES_READY__ = true` once all slides are mounted,
 *     fonts are loaded, and images have had time to settle.
 */

import { useState, useEffect, useRef } from 'react';
import MlbDailySlide1 from '../components/dashboard/slides/MlbDailySlide1';
import MlbDailySlide2 from '../components/dashboard/slides/MlbDailySlide2';
import MlbDailySlide3 from '../components/dashboard/slides/MlbDailySlide3';

const SLIDE_W = 1080;
const SLIDE_H = 1350;

/** Fetch data from live APIs (fallback if no injected data) */
async function fetchSlideData() {
  const [gamesRes, oddsRes, leadersRes, standingsRes, picksRes] = await Promise.allSettled([
    fetch('/api/mlb/live/games?status=all').then(r => r.ok ? r.json() : { games: [] }),
    fetch('/api/mlb/odds/championship').then(r => r.ok ? r.json() : {}),
    fetch('/api/mlb/leaders').then(r => r.ok ? r.json() : {}),
    fetch('/api/mlb/standings').then(r => r.ok ? r.json() : {}),
    fetch('/api/mlb/picks/built').then(r => r.ok ? r.json() : { categories: {} }),
  ]);

  const games = gamesRes.status === 'fulfilled' ? (gamesRes.value.games || []) : [];
  const odds = oddsRes.status === 'fulfilled' ? oddsRes.value : {};
  const leaders = leadersRes.status === 'fulfilled' ? leadersRes.value : {};
  const standings = standingsRes.status === 'fulfilled' ? standingsRes.value : {};
  const picks = picksRes.status === 'fulfilled' ? picksRes.value : { categories: {} };

  return {
    mlbLiveGames: games,
    mlbChampOdds: odds,
    mlbLeaders: leaders,
    mlbStandings: standings,
    mlbBriefing: null,
    mlbPicks: picks,
    canonicalPicks: picks,
  };
}

export default function RenderMlbDaily() {
  const [data, setData] = useState(null);
  const [ready, setReady] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Check for injected data from Puppeteer
      let slideData = window.__RENDER_DATA__ || null;

      if (!slideData) {
        console.log('[RenderMlbDaily] No injected data, fetching from APIs...');
        slideData = await fetchSlideData();
      } else {
        console.log('[RenderMlbDaily] Using injected data');
      }

      if (!cancelled) setData(slideData);
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // Signal readiness after slides mount + fonts load + settle time
  useEffect(() => {
    if (!data) return;

    async function waitForReady() {
      // Wait for fonts
      try {
        await document.fonts.ready;
      } catch {
        // fonts API may not be available
      }

      // Wait for images to load
      const images = containerRef.current?.querySelectorAll('img') || [];
      const imagePromises = Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve; // Don't block on failed images
          // Safety timeout per image
          setTimeout(resolve, 3000);
        });
      });
      await Promise.all(imagePromises);

      // Extra settle time for CSS animations, gradients, backdrop-filter
      await new Promise(r => setTimeout(r, 800));

      window.__SLIDES_READY__ = true;
      setReady(true);
      console.log('[RenderMlbDaily] Slides ready for capture');
    }

    waitForReady();
  }, [data]);

  if (!data) {
    return (
      <div style={{ background: '#000', color: '#fff', padding: 40, fontFamily: 'Inter, sans-serif' }}>
        Loading slide data...
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
        padding: 0,
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        // No scaling — full resolution for Puppeteer screenshots
      }}
    >
      {/* Render each slide at exact export dimensions */}
      <div style={{ width: SLIDE_W, height: SLIDE_H, overflow: 'hidden', position: 'relative' }}>
        <MlbDailySlide1 {...slideProps} slideNumber={1} />
      </div>
      <div style={{ width: SLIDE_W, height: SLIDE_H, overflow: 'hidden', position: 'relative' }}>
        <MlbDailySlide2 {...slideProps} slideNumber={2} />
      </div>
      <div style={{ width: SLIDE_W, height: SLIDE_H, overflow: 'hidden', position: 'relative' }}>
        <MlbDailySlide3 {...slideProps} slideNumber={3} />
      </div>

      {/* Readiness indicator (hidden, for debugging) */}
      <div
        id="render-status"
        data-ready={ready ? 'true' : 'false'}
        style={{ position: 'fixed', bottom: 0, right: 0, fontSize: 0, opacity: 0 }}
      />
    </div>
  );
}
