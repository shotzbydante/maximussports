/**
 * nbaBrowserRenderer — Pixel-perfect NBA Daily Briefing slide renderer.
 *
 * Thin wrapper over the shared MLB browser renderer pipeline: Puppeteer
 * + @sparticuz/chromium → navigate to /render/nba-daily → wait for font
 * readiness + image settle → screenshot each [data-slide] at DPR 2 →
 * sharp Lanczos3 downscale to exactly 1080×1350.
 *
 * We reuse the same renderer core by constructing it inline rather than
 * duplicating. The ONLY differences from the MLB renderer are:
 *   - render path: /render/nba-daily (not /render/mlb-daily)
 *   - console log prefix: [RenderNbaDaily] (not [RenderMlbDaily])
 *
 * All quality measures (DPR=2, Inter font injection, font readiness
 * wait, image settle wait, 1080×1350 downscale) are identical — no
 * export parity drift between MLB and NBA.
 */

import puppeteerCore from 'puppeteer-core';
import sharp from 'sharp';

const SLIDE_W = 1080;
const SLIDE_H = 1350;
const SLIDE_COUNT = 3;
const VIEWPORT_W = SLIDE_W;
const VIEWPORT_H = SLIDE_H * SLIDE_COUNT + 100;
const DEVICE_SCALE_FACTOR = 2;

const NAVIGATION_TIMEOUT = 30_000;
const READY_TIMEOUT = 20_000;
const READY_POLL_INTERVAL = 250;

const INTER_FONT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
* {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
`;

async function getChromiumConfig() {
  try {
    const chromium = await import('@sparticuz/chromium');
    const chromiumMod = chromium.default || chromium;
    const executablePath = await chromiumMod.executablePath();
    return {
      executablePath,
      args: chromiumMod.args,
      headless: chromiumMod.headless ?? 'new',
      defaultViewport: { width: VIEWPORT_W, height: VIEWPORT_H, deviceScaleFactor: DEVICE_SCALE_FACTOR },
    };
  } catch (e) {
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
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            headless: 'new',
            defaultViewport: { width: VIEWPORT_W, height: VIEWPORT_H, deviceScaleFactor: DEVICE_SCALE_FACTOR },
          };
        }
      } catch { continue; }
    }
    return null;
  }
}

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
 * Render all 3 NBA Daily Briefing slides via headless browser.
 *
 * @param {string} baseUrl — e.g. "https://maximussports.ai"
 * @param {object} data — slide data (canonical payload or raw fields)
 * @param {object} log — logger with info/warn/error methods
 * @returns {Promise<Buffer[]|null>}
 */
export async function renderNbaSlidesWithBrowser(baseUrl, data, log) {
  const config = await getChromiumConfig();
  if (!config) {
    log.warn('headless Chromium not available — NBA browser renderer disabled');
    return null;
  }

  let browser = null;
  try {
    log.info('launching headless browser for NBA...');
    const launchStart = Date.now();
    browser = await puppeteerCore.launch({
      executablePath: config.executablePath,
      args: config.args,
      headless: config.headless,
      defaultViewport: config.defaultViewport,
    });
    log.info(`browser launched in ${Date.now() - launchStart}ms`);

    const page = await browser.newPage();

    await page.evaluateOnNewDocument((injectedData) => {
      window.__RENDER_DATA__ = injectedData;
    }, data);

    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[RenderNbaDaily]')) {
        log.info(`[browser] ${text}`);
      }
    });

    await page.evaluateOnNewDocument((css) => {
      const style = document.createElement('style');
      style.textContent = css;
      document.addEventListener('DOMContentLoaded', () => {
        document.head.prepend(style);
      });
    }, INTER_FONT_CSS);

    const renderUrl = `${baseUrl}/render/nba-daily`;
    log.info(`navigating to ${renderUrl} (DPR=${DEVICE_SCALE_FACTOR})`);
    const navStart = Date.now();
    await page.goto(renderUrl, { waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT });
    log.info(`page loaded in ${Date.now() - navStart}ms`);

    await page.addStyleTag({
      url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap',
    }).catch(() => {
      log.warn('Google Fonts link injection failed — using @import fallback');
    });

    const fontLoaded = await page.evaluate(async () => {
      try {
        await document.fonts.ready;
        return document.fonts.check('16px Inter');
      } catch { return false; }
    });
    log.info(`Inter font loaded: ${fontLoaded}`);

    await waitForSlidesReady(page, log);

    const slideBuffers = [];
    for (let i = 1; i <= SLIDE_COUNT; i++) {
      const selector = `[data-slide="${i}"]`;
      const element = await page.$(selector);
      if (!element) {
        log.error(`slide ${i} not found (selector: ${selector})`);
        throw new Error(`NBA slide ${i} element not found in render page`);
      }
      const rawPng = await element.screenshot({ type: 'png', clip: undefined });
      const buffer = await sharp(Buffer.from(rawPng))
        .resize(SLIDE_W, SLIDE_H, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
        .png({ compressionLevel: 1, quality: 100 })
        .toBuffer();
      slideBuffers.push(buffer);
      log.info(`NBA slide ${i} captured: raw=${(rawPng.length / 1024).toFixed(0)}KB → downscaled=${(buffer.length / 1024).toFixed(0)}KB`);
    }

    log.info(`all ${SLIDE_COUNT} NBA slides captured successfully`);
    return slideBuffers;
  } catch (e) {
    log.error(`NBA browser renderer failed: ${e.message}`);
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
