/**
 * mlbBrowserRenderer — Pixel-perfect MLB Daily Briefing slide renderer.
 *
 * Uses Puppeteer + @sparticuz/chromium to launch a headless browser, navigate
 * to the /render/mlb-daily page (which loads the REAL React slide components
 * with full CSS Modules), and screenshot each [data-slide] element at 1080×1350.
 *
 * This produces output identical to the manual Content Studio export path
 * (html-to-image), since both use the exact same React components, CSS, and
 * asset pipeline.
 *
 * Exports:
 *   renderSlidesWithBrowser(baseUrl, data, log) → [Buffer, Buffer, Buffer]
 *
 * Falls back gracefully if Chromium is unavailable (e.g. local dev without
 * the binary), returning null so the caller can use Satori fallback.
 */

import puppeteerCore from 'puppeteer-core';

const SLIDE_W = 1080;
const SLIDE_H = 1350;
const SLIDE_COUNT = 3;
const VIEWPORT_W = SLIDE_W;
const VIEWPORT_H = SLIDE_H * SLIDE_COUNT + 100; // Stack all 3 slides vertically

// Timeouts
const NAVIGATION_TIMEOUT = 30_000;
const READY_TIMEOUT = 20_000;
const READY_POLL_INTERVAL = 250;

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
      defaultViewport: { width: VIEWPORT_W, height: VIEWPORT_H, deviceScaleFactor: 1 },
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
            defaultViewport: { width: VIEWPORT_W, height: VIEWPORT_H, deviceScaleFactor: 1 },
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

    // Navigate to render page
    const renderUrl = `${baseUrl}/render/mlb-daily`;
    log.info(`navigating to ${renderUrl}`);
    const navStart = Date.now();

    await page.goto(renderUrl, {
      waitUntil: 'networkidle2',
      timeout: NAVIGATION_TIMEOUT,
    });

    log.info(`page loaded in ${Date.now() - navStart}ms`);

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

      const png = await element.screenshot({
        type: 'png',
        clip: undefined, // Let Puppeteer use the element's bounding box
      });

      const buffer = Buffer.from(png);
      slideBuffers.push(buffer);
      log.info(`slide ${i} captured: ${(buffer.length / 1024).toFixed(0)}KB`);
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
