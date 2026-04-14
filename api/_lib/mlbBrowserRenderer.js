/**
 * mlbBrowserRenderer — Pixel-perfect MLB Daily Briefing slide renderer.
 *
 * Uses Puppeteer + @sparticuz/chromium to launch a headless browser, navigate
 * to the /render/mlb-daily page (which loads the REAL React slide components
 * with full CSS Modules), and screenshot each [data-slide] element at 1080×1350.
 *
 * Quality measures:
 *   - deviceScaleFactor: 2 — retina-quality rendering for crisp gradients/text
 *   - Inter font injection — ensures font parity with dashboard preview
 *   - Font + image readiness wait — no screenshots until fully rendered
 *
 * Exports:
 *   renderSlidesWithBrowser(baseUrl, data, log) → [Buffer, Buffer, Buffer]
 *
 * Falls back gracefully if Chromium is unavailable (e.g. local dev without
 * the binary), returning null so the caller can use Satori fallback.
 */

import puppeteerCore from 'puppeteer-core';
import sharp from 'sharp';

const SLIDE_W = 1080;
const SLIDE_H = 1350;
const SLIDE_COUNT = 3;
const VIEWPORT_W = SLIDE_W;
const VIEWPORT_H = SLIDE_H * SLIDE_COUNT + 100; // Stack all 3 slides vertically

// Retina-quality: 2x DPR produces 2160×2700 screenshots (IG downscales for display).
// This is critical for gradient fidelity — at 1x, subtle rgba overlays look like
// flat white blocks instead of smooth glass effects.
const DEVICE_SCALE_FACTOR = 2;

// Timeouts
const NAVIGATION_TIMEOUT = 30_000;
const READY_TIMEOUT = 20_000;
const READY_POLL_INTERVAL = 250;

// Inter font CSS — injected into the page so serverless Chromium
// (which has no system fonts) renders text identically to the dashboard.
const INTER_FONT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
* {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
`;

/**
 * Get Chromium executable path and launch args.
 * Uses @sparticuz/chromium on Vercel (serverless), falls back to local Chrome for dev.
 */
async function getChromiumConfig() {
  try {
    const chromium = await import('@sparticuz/chromium');
    const chromiumMod = chromium.default || chromium;

    // @sparticuz/chromium automatically handles brotli decompression
    const executablePath = await chromiumMod.executablePath();

    return {
      executablePath,
      args: chromiumMod.args,
      headless: chromiumMod.headless ?? 'new',
      defaultViewport: { width: VIEWPORT_W, height: VIEWPORT_H, deviceScaleFactor: DEVICE_SCALE_FACTOR },
    };
  } catch (e) {
    // Fallback for local dev — try common Chrome paths
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ];

    for (const p of candidates) {
      try {
        const { existsSync } = await import('node:fs');
        if (existsSync(p)) {
          return {
            executablePath: p,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
            headless: 'new',
            defaultViewport: { width: VIEWPORT_W, height: VIEWPORT_H, deviceScaleFactor: DEVICE_SCALE_FACTOR },
          };
        }
      } catch {
        continue;
      }
    }

    return null;
  }
}

/**
 * Wait for the render page to signal readiness.
 * Polls window.__SLIDES_READY__ with a timeout.
 */
async function waitForSlidesReady(page, log) {
  const start = Date.now();

  while (Date.now() - start < READY_TIMEOUT) {
    const isReady = await page.evaluate(() => window.__SLIDES_READY__ === true);
    if (isReady) {
      log.info(`slides ready in ${Date.now() - start}ms`);
      return true;
    }
    await new Promise(r => setTimeout(r, READY_POLL_INTERVAL));
  }

  log.warn(`slides not ready after ${READY_TIMEOUT}ms — proceeding with screenshot anyway`);
  return false;
}

/**
 * Render all 3 MLB Daily Briefing slides using a headless browser.
 *
 * @param {string} baseUrl — e.g. "https://maximussports.ai"
 * @param {object} data — slide data (mlbLiveGames, mlbChampOdds, etc.)
 * @param {object} log — logger with info/warn/error methods
 * @returns {Promise<Buffer[]|null>} — 3 PNG buffers, or null if browser unavailable
 */
export async function renderSlidesWithBrowser(baseUrl, data, log) {
  const config = await getChromiumConfig();
  if (!config) {
    log.warn('headless Chromium not available — browser renderer disabled');
    return null;
  }

  let browser = null;

  try {
    log.info('launching headless browser...');
    const launchStart = Date.now();

    browser = await puppeteerCore.launch({
      executablePath: config.executablePath,
      args: config.args,
      headless: config.headless,
      defaultViewport: config.defaultViewport,
    });

    log.info(`browser launched in ${Date.now() - launchStart}ms`);

    const page = await browser.newPage();

    // Inject data before page loads so React picks it up on mount
    await page.evaluateOnNewDocument((injectedData) => {
      window.__RENDER_DATA__ = injectedData;
    }, data);

    // Collect console logs from render page for debugging
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[RenderMlbDaily]')) {
        log.info(`[browser] ${text}`);
      }
    });

    // Inject Inter font stylesheet BEFORE navigation so it's available when CSS loads
    await page.evaluateOnNewDocument((css) => {
      const style = document.createElement('style');
      style.textContent = css;
      document.addEventListener('DOMContentLoaded', () => {
        document.head.prepend(style);
      });
    }, INTER_FONT_CSS);

    // Navigate to render page
    const renderUrl = `${baseUrl}/render/mlb-daily`;
    log.info(`navigating to ${renderUrl} (DPR=${DEVICE_SCALE_FACTOR})`);
    const navStart = Date.now();

    await page.goto(renderUrl, {
      waitUntil: 'networkidle2',
      timeout: NAVIGATION_TIMEOUT,
    });

    log.info(`page loaded in ${Date.now() - navStart}ms`);

    // Inject Inter font via <link> as well (belt-and-suspenders for Google Fonts)
    await page.addStyleTag({
      url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap',
    }).catch(() => {
      log.warn('Google Fonts link injection failed — using @import fallback');
    });

    // Wait for Inter font to actually load
    const fontLoaded = await page.evaluate(async () => {
      try {
        await document.fonts.ready;
        const interLoaded = document.fonts.check('16px Inter');
        return interLoaded;
      } catch { return false; }
    });
    log.info(`Inter font loaded: ${fontLoaded}`);

    // Wait for slides to signal readiness
    await waitForSlidesReady(page, log);

    // Screenshot each [data-slide] element
    const slideBuffers = [];

    for (let i = 1; i <= SLIDE_COUNT; i++) {
      const selector = `[data-slide="${i}"]`;
      const element = await page.$(selector);

      if (!element) {
        log.error(`slide ${i} not found (selector: ${selector})`);
        throw new Error(`Slide ${i} element not found in render page`);
      }

      const rawPng = await element.screenshot({
        type: 'png',
        clip: undefined, // Let Puppeteer use the element's bounding box
      });

      // Puppeteer captures at 2x DPR (2160×2700). Downscale to exactly 1080×1350
      // using Lanczos3 interpolation for razor-sharp text and gradients.
      // Without this, Instagram receives an oversized image and applies its own
      // lower-quality downscaling, causing visible blur on text and logos.
      const buffer = await sharp(Buffer.from(rawPng))
        .resize(SLIDE_W, SLIDE_H, {
          fit: 'cover',
          kernel: sharp.kernel.lanczos3,
        })
        .png({ compressionLevel: 1, quality: 100 })
        .toBuffer();

      slideBuffers.push(buffer);
      log.info(`slide ${i} captured: raw=${(rawPng.length / 1024).toFixed(0)}KB → downscaled=${(buffer.length / 1024).toFixed(0)}KB (${SLIDE_W}×${SLIDE_H})`);
    }

    log.info(`all ${SLIDE_COUNT} slides captured successfully`);
    return slideBuffers;
  } catch (e) {
    log.error(`browser renderer failed: ${e.message}`);
    log.error(e.stack?.slice(0, 300));
    return null;
  } finally {
    if (browser) {
      try {
        await browser.close();
        log.info('browser closed');
      } catch (e) {
        log.warn(`browser close error: ${e.message}`);
      }
    }
  }
}
